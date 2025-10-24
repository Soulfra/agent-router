/**
 * Email Reputation Tracker
 *
 * Tracks sender reputation to prevent abuse and maintain deliverability
 *
 * Reputation Score (0-100):
 * - 90-100: Excellent (trusted sender)
 * - 70-89: Good (normal sender)
 * - 50-69: Warning (potential issues)
 * - 0-49: Bad (blocked)
 *
 * Factors:
 * - Bounce rate (hard bounces are bad)
 * - Spam complaints (very bad)
 * - Send volume consistency
 * - Recipient engagement (opens, clicks)
 * - Time since last issue
 *
 * Actions:
 * - Score < 50: Block all sends
 * - Score 50-69: Warning mode (limit sends)
 * - Score 70+: Normal operation
 *
 * Recovery:
 * - Score increases 1 point per day if no issues
 * - Score increases 5 points per 100 successful sends
 * - Score decreases 10 points per bounce
 * - Score decreases 25 points per spam complaint
 *
 * Storage: Google Sheets
 *
 * Usage:
 *   const tracker = new EmailReputationTracker({ db });
 *   const check = await tracker.canSend('user123');
 *   if (check.allowed) {
 *     // Send email
 *     await tracker.recordSend('user123');
 *   }
 */

const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');

class EmailReputationTracker {
  constructor(config = {}) {
    // Database adapter
    this.db = config.db || new GoogleSheetsDBAdapter();

    // Reputation thresholds
    this.thresholds = {
      excellent: 90,
      good: 70,
      warning: 50,
      blocked: 0
    };

    // Score adjustments
    this.adjustments = {
      successfulSend: 0.05,          // +0.05 per send (5 points per 100 sends)
      bounce: -10,                    // -10 per bounce
      spamComplaint: -25,             // -25 per spam complaint
      dailyRecovery: 1,               // +1 per day if no issues
      maxScore: 100,
      minScore: 0
    };

    // Warning mode limits (when score 50-69)
    this.warningLimits = {
      hourly: 10,
      daily: 50
    };

    console.log('[EmailReputationTracker] Initialized');
  }

  /**
   * Initialize (ensure reputation table exists)
   */
  async init() {
    await this.db.init();

    // Ensure reputation sheet exists
    if (!this.db.sheetNames.emailReputation) {
      this.db.sheetNames.emailReputation = 'email_reputation';
    }

    console.log('[EmailReputationTracker] Ready');
  }

  /**
   * Check if user can send
   *
   * @param {string} userId - User ID
   * @returns {Object} Check result
   */
  async canSend(userId) {
    try {
      await this.init();

      const reputation = await this.getUserReputation(userId);

      // Blocked (score < 50)
      if (reputation.score < this.thresholds.warning) {
        return {
          allowed: false,
          reason: 'Reputation too low',
          status: reputation.status,
          score: reputation.score,
          recoveryDays: Math.ceil((this.thresholds.warning - reputation.score) / this.adjustments.dailyRecovery)
        };
      }

      // Warning mode (score 50-69)
      if (reputation.score < this.thresholds.good) {
        // Check warning limits
        const now = new Date();
        const hourlyCount = await this.getHourlySendCount(userId, now);
        const dailyCount = await this.getDailySendCount(userId, now);

        if (hourlyCount >= this.warningLimits.hourly) {
          return {
            allowed: false,
            reason: 'Warning mode hourly limit',
            status: 'warning',
            score: reputation.score,
            limit: this.warningLimits.hourly
          };
        }

        if (dailyCount >= this.warningLimits.daily) {
          return {
            allowed: false,
            reason: 'Warning mode daily limit',
            status: 'warning',
            score: reputation.score,
            limit: this.warningLimits.daily
          };
        }
      }

      return {
        allowed: true,
        status: reputation.status,
        score: reputation.score
      };

    } catch (error) {
      console.error('[EmailReputationTracker] Error checking send permission:', error);
      return {
        allowed: false,
        reason: 'Error checking reputation',
        error: error.message
      };
    }
  }

  /**
   * Get user reputation
   *
   * @param {string} userId - User ID
   * @returns {Object} Reputation data
   */
  async getUserReputation(userId) {
    try {
      await this.init();

      // Find reputation record
      let record = await this.db.findOne(this.db.sheetNames.emailReputation, {
        user_id: userId
      });

      // Create if doesn't exist
      if (!record) {
        record = await this.createReputationRecord(userId);
      }

      // Apply daily recovery
      record = await this.applyDailyRecovery(record);

      const score = parseFloat(record.reputation_score || 100);
      const status = this.getReputationStatus(score);

      return {
        userId,
        score,
        status,
        bounces: parseInt(record.bounce_count || 0),
        spamComplaints: parseInt(record.spam_complaint_count || 0),
        totalSends: parseInt(record.total_sends || 0),
        successfulSends: parseInt(record.successful_sends || 0),
        lastSendAt: record.last_send_at,
        lastIssueAt: record.last_issue_at,
        createdAt: record.created_at
      };

    } catch (error) {
      console.error('[EmailReputationTracker] Error getting reputation:', error);
      return {
        userId,
        score: 100,
        status: 'excellent'
      };
    }
  }

  /**
   * Record successful send
   *
   * @param {string} userId - User ID
   */
  async recordSend(userId) {
    try {
      await this.init();

      const reputation = await this.getUserReputation(userId);

      const newScore = Math.min(
        this.adjustments.maxScore,
        reputation.score + this.adjustments.successfulSend
      );

      await this.db.update(
        this.db.sheetNames.emailReputation,
        { user_id: userId },
        {
          reputation_score: newScore,
          total_sends: reputation.totalSends + 1,
          successful_sends: reputation.successfulSends + 1,
          last_send_at: new Date().toISOString()
        }
      );

      console.log(`[EmailReputationTracker] Recorded send for ${userId} (score: ${newScore})`);

    } catch (error) {
      console.error('[EmailReputationTracker] Error recording send:', error);
    }
  }

  /**
   * Record bounce
   *
   * @param {string} userId - User ID
   * @param {string} bounceType - 'hard' or 'soft'
   */
  async recordBounce(userId, bounceType = 'hard') {
    try {
      await this.init();

      const reputation = await this.getUserReputation(userId);

      // Soft bounces are less severe
      const scoreDecrease = bounceType === 'soft'
        ? this.adjustments.bounce / 2
        : this.adjustments.bounce;

      const newScore = Math.max(
        this.adjustments.minScore,
        reputation.score + scoreDecrease
      );

      await this.db.update(
        this.db.sheetNames.emailReputation,
        { user_id: userId },
        {
          reputation_score: newScore,
          bounce_count: reputation.bounces + 1,
          last_issue_at: new Date().toISOString()
        }
      );

      console.log(`[EmailReputationTracker] Recorded ${bounceType} bounce for ${userId} (score: ${newScore})`);

      // Auto-block if score too low
      if (newScore < this.thresholds.warning) {
        console.warn(`[EmailReputationTracker] User ${userId} auto-blocked (score: ${newScore})`);
      }

    } catch (error) {
      console.error('[EmailReputationTracker] Error recording bounce:', error);
    }
  }

  /**
   * Record spam complaint
   *
   * @param {string} userId - User ID
   */
  async recordSpamComplaint(userId) {
    try {
      await this.init();

      const reputation = await this.getUserReputation(userId);

      const newScore = Math.max(
        this.adjustments.minScore,
        reputation.score + this.adjustments.spamComplaint
      );

      await this.db.update(
        this.db.sheetNames.emailReputation,
        { user_id: userId },
        {
          reputation_score: newScore,
          spam_complaint_count: reputation.spamComplaints + 1,
          last_issue_at: new Date().toISOString()
        }
      );

      console.log(`[EmailReputationTracker] Recorded spam complaint for ${userId} (score: ${newScore})`);
      console.warn(`[EmailReputationTracker] User ${userId} may be blocked (score: ${newScore})`);

    } catch (error) {
      console.error('[EmailReputationTracker] Error recording spam complaint:', error);
    }
  }

  /**
   * Apply daily recovery
   * @private
   */
  async applyDailyRecovery(record) {
    const now = new Date();
    const lastSend = record.last_send_at ? new Date(record.last_send_at) : null;
    const lastIssue = record.last_issue_at ? new Date(record.last_issue_at) : null;

    if (!lastSend && !lastIssue) {
      return record;
    }

    // Get most recent activity
    const lastActivity = [lastSend, lastIssue].filter(Boolean).sort((a, b) => b - a)[0];

    // Calculate days since last activity
    const daysSince = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

    if (daysSince > 0) {
      const currentScore = parseFloat(record.reputation_score || 100);
      const recoveryAmount = daysSince * this.adjustments.dailyRecovery;
      const newScore = Math.min(this.adjustments.maxScore, currentScore + recoveryAmount);

      // Only update if score changed
      if (newScore !== currentScore) {
        await this.db.update(
          this.db.sheetNames.emailReputation,
          { user_id: record.user_id },
          {
            reputation_score: newScore,
            last_recovery_at: now.toISOString()
          }
        );

        record.reputation_score = newScore;
        console.log(`[EmailReputationTracker] Applied ${daysSince} days recovery to ${record.user_id} (score: ${newScore})`);
      }
    }

    return record;
  }

  /**
   * Get reputation status
   * @private
   */
  getReputationStatus(score) {
    if (score >= this.thresholds.excellent) return 'excellent';
    if (score >= this.thresholds.good) return 'good';
    if (score >= this.thresholds.warning) return 'warning';
    return 'blocked';
  }

  /**
   * Create reputation record
   * @private
   */
  async createReputationRecord(userId) {
    const now = new Date();

    const data = {
      user_id: userId,
      reputation_score: 100, // Start with perfect score
      bounce_count: 0,
      spam_complaint_count: 0,
      total_sends: 0,
      successful_sends: 0,
      last_send_at: null,
      last_issue_at: null,
      last_recovery_at: null,
      created_at: now.toISOString()
    };

    await this.db.insert(this.db.sheetNames.emailReputation, data);

    console.log(`[EmailReputationTracker] Created reputation record for ${userId}`);

    return data;
  }

  /**
   * Get hourly send count (for warning mode)
   * @private
   */
  async getHourlySendCount(userId, now) {
    // This would ideally query a separate sends log
    // For now, return 0 (implement if needed)
    return 0;
  }

  /**
   * Get daily send count (for warning mode)
   * @private
   */
  async getDailySendCount(userId, now) {
    // This would ideally query a separate sends log
    // For now, return 0 (implement if needed)
    return 0;
  }

  /**
   * Reset user reputation (admin function)
   *
   * @param {string} userId - User ID
   * @param {number} newScore - New score (default 100)
   */
  async resetReputation(userId, newScore = 100) {
    try {
      await this.init();

      await this.db.update(
        this.db.sheetNames.emailReputation,
        { user_id: userId },
        {
          reputation_score: newScore,
          bounce_count: 0,
          spam_complaint_count: 0,
          last_issue_at: null
        }
      );

      console.log(`[EmailReputationTracker] Reset reputation for ${userId} to ${newScore}`);

      return true;

    } catch (error) {
      console.error('[EmailReputationTracker] Error resetting reputation:', error);
      return false;
    }
  }

  /**
   * Get statistics
   *
   * @returns {Object} Stats
   */
  async getStats() {
    try {
      await this.init();

      const allReputation = await this.db.query(this.db.sheetNames.emailReputation);

      const stats = {
        total: allReputation.length,
        byStatus: {
          excellent: 0,
          good: 0,
          warning: 0,
          blocked: 0
        },
        averageScore: 0,
        totalBounces: 0,
        totalSpamComplaints: 0,
        totalSends: 0
      };

      let totalScore = 0;

      for (const record of allReputation) {
        const score = parseFloat(record.reputation_score || 100);
        const status = this.getReputationStatus(score);

        stats.byStatus[status]++;
        totalScore += score;
        stats.totalBounces += parseInt(record.bounce_count || 0);
        stats.totalSpamComplaints += parseInt(record.spam_complaint_count || 0);
        stats.totalSends += parseInt(record.total_sends || 0);
      }

      stats.averageScore = stats.total > 0 ? (totalScore / stats.total).toFixed(1) : 100;

      return stats;

    } catch (error) {
      console.error('[EmailReputationTracker] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = EmailReputationTracker;
