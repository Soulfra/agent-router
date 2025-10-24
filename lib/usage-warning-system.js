/**
 * CALOS Usage Warning System
 *
 * Real-time usage monitoring and proactive warnings
 *
 * Features:
 * - Monitors usage levels every 5 minutes
 * - Sends in-app notifications when approaching limits
 * - Sends email warnings at 80%, 90%, 95%, and 100% thresholds
 * - Tracks warning history to avoid spam
 * - Provides WebSocket support for real-time dashboard updates
 *
 * Usage:
 *   const UsageWarningSystem = require('./usage-warning-system');
 *   const warningSystem = new UsageWarningSystem({ db, emailService });
 *   await warningSystem.start();
 */

const EventEmitter = require('events');

class UsageWarningSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.emailService = options.emailService;
    this.checkInterval = options.checkInterval || 5 * 60 * 1000; // 5 minutes
    this.warningThresholds = options.warningThresholds || [80, 90, 95, 100];

    this.timer = null;
    this.isRunning = false;

    // In-memory cache of recent warnings (to avoid spam)
    this.recentWarnings = new Map();
    this.warningCooldown = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Start the warning system
   */
  async start() {
    if (this.isRunning) {
      console.warn('[Usage Warning] Already running');
      return;
    }

    if (!this.db) {
      throw new Error('[Usage Warning] Database required');
    }

    console.log('[Usage Warning] Starting usage warning system...');

    // Run initial check
    await this.checkAllUsers();

    // Start periodic checks
    this.timer = setInterval(() => {
      this.checkAllUsers();
    }, this.checkInterval);

    this.isRunning = true;
    console.log(`[Usage Warning] System started (checking every ${this.checkInterval / 1000}s)`);
  }

  /**
   * Stop the warning system
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    console.log('[Usage Warning] System stopped');
  }

  /**
   * Check usage for all active users
   */
  async checkAllUsers() {
    try {
      // Get all active subscriptions
      const result = await this.db.query(`
        SELECT
          sp.user_id,
          sp.install_id,
          sp.tier_slug,
          sp.current_period_start,
          sp.current_period_end,
          u.email,
          u.username
        FROM subscription_plans sp
        LEFT JOIN users u ON sp.user_id = u.user_id
        WHERE sp.status IN ('active', 'trial')
      `);

      console.log(`[Usage Warning] Checking ${result.rows.length} active subscriptions...`);

      // Check each user
      for (const subscription of result.rows) {
        await this.checkUser(subscription);
      }
    } catch (error) {
      console.error('[Usage Warning] Failed to check all users:', error.message);
    }
  }

  /**
   * Check usage for specific user
   */
  async checkUser(subscription) {
    try {
      const { user_id, install_id, tier_slug, email, username, current_period_start, current_period_end } = subscription;

      // Get current usage
      const usageResult = await this.db.query(`
        SELECT * FROM get_current_usage($1, $2, $3, $4)
      `, [user_id, install_id, current_period_start, current_period_end]);

      const usage = {
        transcripts: 0,
        posInPerson: 0,
        posOnline: 0,
        crypto: 0,
        locations: 0,
        apiRequests: 0
      };

      usageResult.rows.forEach(row => {
        const type = row.usage_type;
        const count = parseInt(row.usage_count);

        if (type === 'transcript') usage.transcripts = count;
        else if (type === 'pos_in_person') usage.posInPerson = count;
        else if (type === 'pos_online') usage.posOnline = count;
        else if (type === 'crypto') usage.crypto = count;
        else if (type === 'location') usage.locations = count;
        else if (type === 'api_request') usage.apiRequests = count;
      });

      // Get tier limits
      const limitsResult = await this.db.query(`
        SELECT * FROM check_usage_limits($1, $2, $3)
      `, [user_id, install_id, tier_slug]);

      const limits = {};
      limitsResult.rows.forEach(row => {
        limits[row.usage_type] = {
          current: parseInt(row.current_usage),
          limit: row.limit_value || Infinity,
          overLimit: row.over_limit
        };
      });

      // Check each usage type
      const warnings = [];

      Object.keys(limits).forEach(usageType => {
        const limit = limits[usageType];

        // Skip unlimited tiers
        if (limit.limit === Infinity || limit.limit === null) {
          return;
        }

        // Calculate percentage
        const pct = (limit.current / limit.limit) * 100;

        // Check thresholds
        this.warningThresholds.forEach(threshold => {
          if (pct >= threshold) {
            // Check if we already sent this warning recently
            const warningKey = `${user_id}-${usageType}-${threshold}`;

            if (!this.shouldSendWarning(warningKey)) {
              return;
            }

            warnings.push({
              usageType,
              current: limit.current,
              limit: limit.limit,
              percent: Math.round(pct),
              threshold,
              severity: this.getSeverity(threshold)
            });

            // Mark as sent
            this.markWarningSent(warningKey);
          }
        });
      });

      // Send warnings if any
      if (warnings.length > 0) {
        await this.sendWarnings(user_id, email, username, warnings);

        // Emit event for real-time updates
        this.emit('warnings', {
          userId: user_id,
          installId: install_id,
          warnings
        });
      }
    } catch (error) {
      console.error(`[Usage Warning] Failed to check user ${subscription.user_id}:`, error.message);
    }
  }

  /**
   * Check if we should send warning (cooldown logic)
   */
  shouldSendWarning(warningKey) {
    const lastSent = this.recentWarnings.get(warningKey);

    if (!lastSent) {
      return true;
    }

    const timeSince = Date.now() - lastSent;
    return timeSince > this.warningCooldown;
  }

  /**
   * Mark warning as sent
   */
  markWarningSent(warningKey) {
    this.recentWarnings.set(warningKey, Date.now());

    // Cleanup old entries (older than 48 hours)
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    for (const [key, timestamp] of this.recentWarnings.entries()) {
      if (timestamp < cutoff) {
        this.recentWarnings.delete(key);
      }
    }
  }

  /**
   * Get severity level
   */
  getSeverity(threshold) {
    if (threshold >= 100) return 'critical';
    if (threshold >= 95) return 'danger';
    if (threshold >= 90) return 'warning';
    return 'caution';
  }

  /**
   * Send warnings (email + in-app notification)
   */
  async sendWarnings(userId, email, username, warnings) {
    try {
      console.log(`[Usage Warning] Sending ${warnings.length} warnings to user ${userId} (${email})`);

      // Send email (if email service available)
      if (this.emailService && email) {
        await this.sendEmailWarning(email, username, warnings);
      }

      // Store in-app notification
      await this.storeNotification(userId, warnings);

      console.log(`[Usage Warning] Warnings sent successfully to user ${userId}`);
    } catch (error) {
      console.error(`[Usage Warning] Failed to send warnings to user ${userId}:`, error.message);
    }
  }

  /**
   * Send email warning
   */
  async sendEmailWarning(email, username, warnings) {
    try {
      // Find highest severity warning
      const critical = warnings.find(w => w.severity === 'critical');
      const danger = warnings.find(w => w.severity === 'danger');
      const highestWarning = critical || danger || warnings[0];

      // Build email
      const subject = highestWarning.severity === 'critical'
        ? '🚨 CALOS Usage Limit Exceeded'
        : `⚠️ CALOS Usage Warning - ${highestWarning.percent}% Used`;

      const warningList = warnings.map(w => `
        <li>
          <strong>${this.formatUsageType(w.usageType)}</strong>:
          ${w.current.toLocaleString()} / ${w.limit.toLocaleString()}
          (${w.percent}% used)
        </li>
      `).join('');

      const body = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${highestWarning.severity === 'critical' ? '#ff4444' : '#ff9f1c'};">
              ${highestWarning.severity === 'critical' ? 'Usage Limit Exceeded' : 'Usage Warning'}
            </h1>

            <p>Hi ${username || 'there'},</p>

            <p>
              ${highestWarning.severity === 'critical'
                ? 'You have <strong>exceeded</strong> your usage limits on CALOS.'
                : `You are approaching your usage limits on CALOS (${highestWarning.percent}% used).`
              }
            </p>

            <h2>Current Usage:</h2>
            <ul>
              ${warningList}
            </ul>

            ${highestWarning.severity === 'critical' ? `
              <div style="background: #ffe6e6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <strong>Action Required:</strong> Your account has been limited to read-only access.
                Upgrade your plan to continue using CALOS.
              </div>
            ` : ''}

            <p>
              <a href="https://calos.sh/pricing.html"
                 style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Upgrade Now
              </a>
            </p>

            <p>
              <a href="https://calos.sh/usage-monitoring.html" style="color: #667eea;">
                View Detailed Usage →
              </a>
            </p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">

            <p style="font-size: 12px; color: #999;">
              This is an automated warning from CALOS. To adjust your notification preferences, visit your account settings.
            </p>
          </body>
        </html>
      `;

      // Send via email service
      await this.emailService.send({
        to: email,
        subject,
        html: body
      });

      console.log(`[Usage Warning] Email sent to ${email}`);
    } catch (error) {
      console.error('[Usage Warning] Failed to send email:', error.message);
    }
  }

  /**
   * Store in-app notification
   */
  async storeNotification(userId, warnings) {
    try {
      // Find highest severity
      const critical = warnings.find(w => w.severity === 'critical');
      const danger = warnings.find(w => w.severity === 'danger');
      const highestWarning = critical || danger || warnings[0];

      const message = highestWarning.severity === 'critical'
        ? `You've exceeded your ${this.formatUsageType(highestWarning.usageType)} limit. Upgrade to continue.`
        : `You're at ${highestWarning.percent}% of your ${this.formatUsageType(highestWarning.usageType)} limit.`;

      // Store in notifications table (if exists)
      await this.db.query(`
        INSERT INTO notifications (
          user_id,
          notification_type,
          title,
          message,
          severity,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT DO NOTHING
      `, [
        userId,
        'usage_warning',
        'Usage Warning',
        message,
        highestWarning.severity,
        JSON.stringify({ warnings })
      ]).catch(() => {
        // Table might not exist - that's okay
        console.log('[Usage Warning] Notifications table not found (skipping in-app notification)');
      });
    } catch (error) {
      console.error('[Usage Warning] Failed to store notification:', error.message);
    }
  }

  /**
   * Format usage type for display
   */
  formatUsageType(type) {
    const labels = {
      transcript: 'Transcripts',
      pos_in_person: 'POS In-Person',
      pos_online: 'POS Online',
      crypto: 'Crypto Charges',
      location: 'Locations',
      api_request: 'API Requests'
    };
    return labels[type] || type;
  }

  /**
   * Get warnings for specific user (for dashboard)
   */
  async getUserWarnings(userId, installId) {
    try {
      // Get subscription
      const subResult = await this.db.query(`
        SELECT tier_slug, current_period_start, current_period_end
        FROM subscription_plans
        WHERE user_id = $1 AND install_id = $2
        LIMIT 1
      `, [userId, installId]);

      if (subResult.rows.length === 0) {
        return [];
      }

      const { tier_slug, current_period_start, current_period_end } = subResult.rows[0];

      // Check limits
      const limitsResult = await this.db.query(`
        SELECT * FROM check_usage_limits($1, $2, $3)
      `, [userId, installId, tier_slug]);

      const warnings = [];

      limitsResult.rows.forEach(row => {
        const limit = row.limit_value || Infinity;
        const current = parseInt(row.current_usage);

        if (limit === Infinity) {
          return;
        }

        const pct = (current / limit) * 100;

        // Only return warnings for 80%+
        if (pct >= 80) {
          warnings.push({
            usageType: row.usage_type,
            current,
            limit,
            percent: Math.round(pct),
            overLimit: row.over_limit,
            severity: this.getSeverity(pct)
          });
        }
      });

      return warnings;
    } catch (error) {
      console.error('[Usage Warning] Failed to get user warnings:', error.message);
      return [];
    }
  }
}

module.exports = UsageWarningSystem;
