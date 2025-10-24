/**
 * Gmail Gateway - API Gateway Pattern
 *
 * Single entry point that wraps all Gmail webhook functionality
 * Makes the system simple to use by hiding complexity
 *
 * Instead of:
 *   const db = new GoogleSheetsDBAdapter();
 *   const encryption = new SimpleEncryption();
 *   const smtp = new FreeSMTPAdapter();
 *   const whitelist = new RecipientWhitelistManager({ db, smtp });
 *   const limiter = new RateLimiter({ db });
 *   ... 50 more lines
 *
 * Use:
 *   const gateway = new GmailGateway();
 *   await gateway.send({ to, subject, body });
 *
 * Pattern: API Gateway / Facade
 * Benefits:
 * - Single point of entry
 * - Hides implementation details
 * - Consistent error handling
 * - Easy to mock/test
 * - Simplified configuration
 */

const GmailRelayZeroCost = require('./gmail-relay-zero-cost');
const RecipientWhitelistManager = require('./recipient-whitelist-manager');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');
const SimpleEncryption = require('./simple-encryption');
const FreeSMTPAdapter = require('./free-smtp-adapter');
const GmailPoller = require('./gmail-poller');

class GmailGateway {
  constructor(config = {}) {
    // Mock mode for testing
    this.mockMode = config.mockMode || false;

    // Core relay system
    this.relay = config.relay || new GmailRelayZeroCost({
      spreadsheetId: config.spreadsheetId,
      credentialsPath: config.credentialsPath,
      encryptionKey: config.encryptionKey,
      smtpProvider: config.smtpProvider,
      pollInterval: config.pollInterval
    });

    // Direct access to components (for advanced use)
    this.db = this.relay.db;
    this.encryption = this.relay.encryption;
    this.smtp = this.relay.smtp;
    this.poller = this.relay.poller;

    // Whitelist manager
    this.whitelist = config.whitelist || new RecipientWhitelistManager({
      db: this.db,
      smtp: this.smtp,
      confirmationBaseUrl: config.confirmationBaseUrl
    });

    // Rate limiter (lazy loaded)
    this._rateLimiter = null;

    // Reputation tracker (lazy loaded)
    this._reputationTracker = null;

    // Initialized flag
    this.initialized = false;

    console.log('[GmailGateway] Initialized');
  }

  /**
   * Initialize the gateway
   * Call this before using any other methods
   */
  async init() {
    if (this.initialized) {
      return true;
    }

    try {
      console.log('[GmailGateway] Initializing...');

      // Initialize relay
      await this.relay.init();

      // Initialize whitelist
      await this.whitelist.init();

      // Load rate limiter if available
      try {
        const GmailRateLimiter = require('./gmail-rate-limiter');
        this._rateLimiter = new GmailRateLimiter({ db: this.db });
        await this._rateLimiter.init();
      } catch (error) {
        console.warn('[GmailGateway] Rate limiter not available:', error.message);
      }

      // Load reputation tracker if available
      try {
        const EmailReputationTracker = require('./email-reputation-tracker');
        this._reputationTracker = new EmailReputationTracker({ db: this.db });
        await this._reputationTracker.init();
      } catch (error) {
        console.warn('[GmailGateway] Reputation tracker not available:', error.message);
      }

      this.initialized = true;

      console.log('[GmailGateway] Ready');

      return true;

    } catch (error) {
      console.error('[GmailGateway] Initialization failed:', error);
      throw new Error(`Failed to initialize Gmail Gateway: ${error.message}`);
    }
  }

  /**
   * Send email (with all security checks)
   *
   * @param {Object} options - Email options
   * @returns {Object} Send result
   */
  async send(options) {
    await this.init();

    try {
      const {
        userId,
        from,
        to,
        cc,
        bcc,
        subject,
        text,
        html
      } = options;

      // Validate required fields
      if (!to) {
        return {
          success: false,
          error: 'Recipient (to) is required',
          code: 'MISSING_RECIPIENT'
        };
      }

      if (!subject) {
        return {
          success: false,
          error: 'Subject is required',
          code: 'MISSING_SUBJECT'
        };
      }

      if (!text && !html) {
        return {
          success: false,
          error: 'Email body (text or html) is required',
          code: 'MISSING_BODY'
        };
      }

      // Convert to array if single recipient
      const recipients = Array.isArray(to) ? to : [to];

      // Check whitelist for all recipients
      for (const recipient of recipients) {
        const isApproved = await this.whitelist.isApproved(userId, recipient);

        if (!isApproved) {
          return {
            success: false,
            error: `Recipient ${recipient} is not whitelisted`,
            code: 'NOT_WHITELISTED',
            recipient,
            hint: `Add recipient: gateway.addRecipient('${userId}', '${recipient}')`
          };
        }
      }

      // Check rate limits
      if (this._rateLimiter) {
        for (const recipient of recipients) {
          const limitCheck = await this._rateLimiter.checkLimit(userId, recipient);

          if (!limitCheck.allowed) {
            return {
              success: false,
              error: `Rate limit exceeded: ${limitCheck.reason}`,
              code: 'RATE_LIMIT_EXCEEDED',
              ...limitCheck
            };
          }
        }
      }

      // Check reputation
      if (this._reputationTracker) {
        const reputationCheck = await this._reputationTracker.canSend(userId);

        if (!reputationCheck.allowed) {
          return {
            success: false,
            error: `Sender blocked: ${reputationCheck.reason}`,
            code: 'REPUTATION_BLOCKED',
            ...reputationCheck
          };
        }
      }

      // Send via SMTP
      const result = await this.smtp.send({
        from: from || process.env.EMAIL_FROM_ADDRESS || 'noreply@calos.ai',
        to,
        cc,
        bcc,
        subject,
        text,
        html
      });

      // Record send
      if (this._rateLimiter) {
        for (const recipient of recipients) {
          await this._rateLimiter.recordSend(userId, recipient);
        }
      }

      // Track reputation
      if (this._reputationTracker && result.success) {
        await this._reputationTracker.recordSend(userId);
      }

      console.log(`[GmailGateway] Email sent from ${from} to ${to}`);

      return {
        success: result.success,
        messageId: result.messageId,
        provider: result.provider,
        recipients: recipients.length
      };

    } catch (error) {
      console.error('[GmailGateway] Error sending email:', error);
      return {
        success: false,
        error: error.message,
        code: 'SEND_ERROR'
      };
    }
  }

  /**
   * Add recipient to whitelist (sends confirmation email)
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   * @param {Object} options - Additional options
   * @returns {Object} Result
   */
  async addRecipient(userId, recipientEmail, options = {}) {
    await this.init();

    try {
      const result = await this.whitelist.addRecipient(userId, recipientEmail, options);

      if (result.success) {
        console.log(`[GmailGateway] Added recipient ${recipientEmail} for user ${userId}`);
      }

      return result;

    } catch (error) {
      console.error('[GmailGateway] Error adding recipient:', error);
      return {
        success: false,
        error: error.message,
        code: 'ADD_RECIPIENT_ERROR'
      };
    }
  }

  /**
   * Confirm recipient (called when they click confirmation link)
   *
   * @param {string} token - Confirmation token
   * @returns {Object} Result
   */
  async confirmRecipient(token) {
    await this.init();

    try {
      const result = await this.whitelist.confirmRecipient(token);

      if (result.success) {
        console.log(`[GmailGateway] Confirmed recipient ${result.recipient}`);
      }

      return result;

    } catch (error) {
      console.error('[GmailGateway] Error confirming recipient:', error);
      return {
        success: false,
        error: error.message,
        code: 'CONFIRM_ERROR'
      };
    }
  }

  /**
   * Remove recipient from whitelist
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   * @returns {boolean} Success
   */
  async removeRecipient(userId, recipientEmail) {
    await this.init();

    try {
      const success = await this.whitelist.removeRecipient(userId, recipientEmail);

      if (success) {
        console.log(`[GmailGateway] Removed recipient ${recipientEmail} for user ${userId}`);
      }

      return success;

    } catch (error) {
      console.error('[GmailGateway] Error removing recipient:', error);
      return false;
    }
  }

  /**
   * Get all recipients for a user
   *
   * @param {string} userId - User ID
   * @param {string} status - Filter by status (optional)
   * @returns {Array} Recipients
   */
  async getRecipients(userId, status = null) {
    await this.init();

    try {
      return await this.whitelist.getRecipients(userId, status);
    } catch (error) {
      console.error('[GmailGateway] Error getting recipients:', error);
      return [];
    }
  }

  /**
   * Get comprehensive status for a user
   *
   * @param {string} userId - User ID
   * @returns {Object} Status
   */
  async getStatus(userId = null) {
    await this.init();

    try {
      const status = {
        system: this.relay.getStatus(),
        timestamp: new Date().toISOString()
      };

      // Add user-specific stats if userId provided
      if (userId) {
        status.user = {
          userId,
          rateLimits: this._rateLimiter ? await this._rateLimiter.getUserLimits(userId) : null,
          whitelist: await this.whitelist.getStats(userId),
          reputation: this._reputationTracker ? await this._reputationTracker.getUserReputation(userId) : null,
          relayStats: await this.relay.getStats(userId)
        };
      } else {
        // Global stats
        status.global = {
          rateLimits: this._rateLimiter ? await this._rateLimiter.getGlobalStats() : null
        };
      }

      return status;

    } catch (error) {
      console.error('[GmailGateway] Error getting status:', error);
      return {
        error: error.message,
        code: 'STATUS_ERROR'
      };
    }
  }

  /**
   * Start polling for all enabled users
   */
  async startPolling() {
    await this.init();

    try {
      await this.relay.startAll();
      console.log('[GmailGateway] Started polling');
      return true;
    } catch (error) {
      console.error('[GmailGateway] Error starting polling:', error);
      return false;
    }
  }

  /**
   * Stop all polling
   */
  stopPolling() {
    this.relay.stopAll();
    console.log('[GmailGateway] Stopped polling');
  }

  /**
   * Send test email
   *
   * @param {string} to - Recipient
   * @returns {Object} Result
   */
  async sendTest(to) {
    await this.init();

    try {
      const result = await this.relay.sendTest(to);

      console.log(`[GmailGateway] Sent test email to ${to}`);

      return result;

    } catch (error) {
      console.error('[GmailGateway] Error sending test:', error);
      return {
        success: false,
        error: error.message,
        code: 'TEST_ERROR'
      };
    }
  }

  /**
   * Create user configuration
   *
   * @param {Object} config - Configuration
   * @returns {Object} Result
   */
  async createConfig(config) {
    await this.init();

    try {
      const result = await this.relay.createConfig(config);

      console.log(`[GmailGateway] Created config for ${config.emailAddress}`);

      return {
        success: true,
        ...result
      };

    } catch (error) {
      console.error('[GmailGateway] Error creating config:', error);
      return {
        success: false,
        error: error.message,
        code: 'CONFIG_ERROR'
      };
    }
  }

  /**
   * Update user configuration
   *
   * @param {string} userId - User ID
   * @param {Object} updates - Updates
   * @returns {boolean} Success
   */
  async updateConfig(userId, updates) {
    await this.init();

    try {
      await this.relay.updateConfig(userId, updates);

      console.log(`[GmailGateway] Updated config for user ${userId}`);

      return true;

    } catch (error) {
      console.error('[GmailGateway] Error updating config:', error);
      return false;
    }
  }

  /**
   * Get configuration by email
   *
   * @param {string} emailAddress - Email address
   * @returns {Object|null} Configuration
   */
  async getConfig(emailAddress) {
    await this.init();

    try {
      return await this.relay.getConfig(emailAddress);
    } catch (error) {
      console.error('[GmailGateway] Error getting config:', error);
      return null;
    }
  }

  /**
   * Record bounce (for reputation tracking)
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   */
  async recordBounce(userId, recipientEmail) {
    await this.init();

    try {
      // Record in whitelist
      await this.whitelist.recordBounce(userId, recipientEmail);

      // Record in reputation tracker
      if (this._reputationTracker) {
        await this._reputationTracker.recordBounce(userId);
      }

      console.log(`[GmailGateway] Recorded bounce for ${recipientEmail}`);

    } catch (error) {
      console.error('[GmailGateway] Error recording bounce:', error);
    }
  }

  /**
   * Record spam complaint (for reputation tracking)
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   */
  async recordSpamComplaint(userId, recipientEmail) {
    await this.init();

    try {
      // Record in whitelist
      await this.whitelist.recordSpamComplaint(userId, recipientEmail);

      // Record in reputation tracker
      if (this._reputationTracker) {
        await this._reputationTracker.recordSpamComplaint(userId);
      }

      console.log(`[GmailGateway] Recorded spam complaint for ${recipientEmail}`);

    } catch (error) {
      console.error('[GmailGateway] Error recording spam complaint:', error);
    }
  }

  /**
   * Cleanup expired confirmations
   *
   * @returns {number} Number cleaned up
   */
  async cleanup() {
    await this.init();

    try {
      const count = await this.whitelist.cleanupExpired();

      console.log(`[GmailGateway] Cleaned up ${count} expired confirmations`);

      return count;

    } catch (error) {
      console.error('[GmailGateway] Error during cleanup:', error);
      return 0;
    }
  }

  /**
   * Get health check
   *
   * @returns {Object} Health status
   */
  async healthCheck() {
    const health = {
      status: 'unknown',
      checks: {
        database: false,
        smtp: false,
        poller: false
      },
      timestamp: new Date().toISOString()
    };

    try {
      // Check database
      if (this.initialized && this.db.initialized) {
        health.checks.database = true;
      }

      // Check SMTP
      if (this.smtp) {
        health.checks.smtp = await this.smtp.verify();
      }

      // Check poller
      if (this.poller) {
        const pollerStatus = this.poller.getStatus();
        health.checks.poller = pollerStatus.active >= 0;
      }

      // Overall status
      const allOk = Object.values(health.checks).every(check => check === true);
      health.status = allOk ? 'healthy' : 'degraded';

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }
}

/**
 * Quick factory function
 *
 * @param {Object} config - Configuration
 * @returns {GmailGateway} Initialized gateway
 */
async function createGateway(config = {}) {
  const gateway = new GmailGateway(config);
  await gateway.init();
  return gateway;
}

module.exports = GmailGateway;
module.exports.createGateway = createGateway;
