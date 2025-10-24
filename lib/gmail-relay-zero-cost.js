/**
 * Gmail Relay (Zero Cost Edition)
 *
 * Simplified version that uses:
 * - Google Sheets instead of PostgreSQL (free)
 * - Gmail polling instead of Pub/Sub webhooks (simpler)
 * - Free SMTP services (Gmail/Brevo/MailerSend)
 * - AES-256 encryption for OAuth tokens (secure)
 *
 * Perfect for:
 * - Hobby projects
 * - MVPs
 * - Learning
 * - Side projects
 * - Personal use
 *
 * Limitations compared to full version:
 * - Up to 60 second delay (polling vs webhooks)
 * - Slower queries (Sheets vs Postgres)
 * - 100 requests/min rate limit (Sheets API)
 * - Not suitable for high-volume (>500 emails/day)
 *
 * But... it's FREE and works great for most use cases!
 */

const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');
const SimpleEncryption = require('./simple-encryption');
const GmailPoller = require('./gmail-poller');
const FreeSMTPAdapter = require('./free-smtp-adapter');

class GmailRelayZeroCost {
  constructor(config = {}) {
    // Database (Google Sheets)
    this.db = config.db || new GoogleSheetsDBAdapter({
      spreadsheetId: config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: config.credentialsPath
    });

    // Encryption for OAuth tokens
    this.encryption = config.encryption || new SimpleEncryption({
      key: config.encryptionKey || process.env.ENCRYPTION_KEY
    });

    // SMTP adapter
    this.smtp = config.smtp || new FreeSMTPAdapter({
      provider: config.smtpProvider || process.env.FREE_SMTP_PROVIDER || 'gmail',
      gmailUser: process.env.GMAIL_SMTP_USER,
      gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
      brevoApiKey: process.env.BREVO_API_KEY,
      mailersendApiKey: process.env.MAILERSEND_API_KEY
    });

    // Gmail poller
    this.poller = config.poller || new GmailPoller({
      db: this.db,
      encryption: this.encryption,
      emailService: this.smtp,
      pollInterval: config.pollInterval || 60000 // 60 seconds
    });

    // Gmail API credentials
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI;

    console.log('[GmailRelayZeroCost] Initialized');
  }

  /**
   * Initialize the relay system
   */
  async init() {
    try {
      console.log('[GmailRelayZeroCost] Initializing...');

      // Initialize database (creates sheets if needed)
      await this.db.init();

      // Verify SMTP connection
      const smtpOk = await this.smtp.verify();

      if (!smtpOk) {
        console.warn('[GmailRelayZeroCost] SMTP verification failed, emails may not send');
      }

      console.log('[GmailRelayZeroCost] Initialized successfully');

      return true;

    } catch (error) {
      console.error('[GmailRelayZeroCost] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Create webhook configuration for user
   *
   * @param {Object} config - Configuration
   * @returns {Object} Created config
   */
  async createConfig(config) {
    try {
      const {
        userId,
        emailAddress,
        accessToken,
        refreshToken,
        relayFromAddress = 'noreply@calos.ai',
        relayRules = {},
        enabled = true
      } = config;

      // Validate required fields
      if (!userId || !emailAddress || !accessToken || !refreshToken) {
        throw new Error('Missing required fields: userId, emailAddress, accessToken, refreshToken');
      }

      // Encrypt OAuth tokens
      const encryptedTokens = this.encryption.encryptTokens({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      // Insert into database
      const configData = {
        user_id: userId,
        email_address: emailAddress,
        access_token: encryptedTokens.access_token,
        refresh_token: encryptedTokens.refresh_token,
        relay_from_address: relayFromAddress,
        relay_rules: JSON.stringify(relayRules),
        last_history_id: null,
        last_webhook_at: null,
        enabled: enabled
      };

      await this.db.insert(this.db.sheetNames.configs, configData);

      console.log(`[GmailRelayZeroCost] Created config for ${emailAddress}`);

      // Start polling if enabled
      if (enabled) {
        this.poller.start(userId);
      }

      return {
        userId,
        emailAddress,
        relayFromAddress,
        enabled
      };

    } catch (error) {
      console.error('[GmailRelayZeroCost] Error creating config:', error);
      throw error;
    }
  }

  /**
   * Update configuration
   *
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   */
  async updateConfig(userId, updates) {
    try {
      const allowedUpdates = {};

      if (updates.relayFromAddress !== undefined) {
        allowedUpdates.relay_from_address = updates.relayFromAddress;
      }

      if (updates.relayRules !== undefined) {
        allowedUpdates.relay_rules = JSON.stringify(updates.relayRules);
      }

      if (updates.enabled !== undefined) {
        allowedUpdates.enabled = updates.enabled;

        // Start/stop poller based on enabled state
        if (updates.enabled) {
          this.poller.start(userId);
        } else {
          this.poller.stop(userId);
        }
      }

      if (Object.keys(allowedUpdates).length > 0) {
        await this.db.update(
          this.db.sheetNames.configs,
          { user_id: userId },
          allowedUpdates
        );

        console.log(`[GmailRelayZeroCost] Updated config for user ${userId}`);
      }

    } catch (error) {
      console.error('[GmailRelayZeroCost] Error updating config:', error);
      throw error;
    }
  }

  /**
   * Get configuration by email address
   *
   * @param {string} emailAddress - Email address
   * @returns {Object|null} Configuration
   */
  async getConfig(emailAddress) {
    try {
      const configs = await this.db.query(this.db.sheetNames.configs, {
        email_address: emailAddress
      });

      return configs.length > 0 ? configs[0] : null;

    } catch (error) {
      console.error('[GmailRelayZeroCost] Error getting config:', error);
      return null;
    }
  }

  /**
   * Get relay statistics for user
   *
   * @param {string} userId - User ID
   * @returns {Object} Statistics
   */
  async getStats(userId) {
    try {
      const logs = await this.db.query(this.db.sheetNames.relayLogs, {
        user_id: userId
      });

      const stats = {
        total_relayed: logs.length,
        successful: logs.filter(l => l.status === 'sent').length,
        failed: logs.filter(l => l.status === 'failed').length,
        filtered: logs.filter(l => l.status === 'filtered').length,
        last_relay: null,
        active_days: 0
      };

      if (logs.length > 0) {
        // Sort by created_at descending
        const sorted = logs.sort((a, b) => {
          return new Date(b.created_at) - new Date(a.created_at);
        });

        stats.last_relay = sorted[0].created_at;

        // Count unique days
        const days = new Set(logs.map(l => l.created_at.split('T')[0]));
        stats.active_days = days.size;
      }

      return stats;

    } catch (error) {
      console.error('[GmailRelayZeroCost] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Start polling for all enabled users
   */
  async startAll() {
    try {
      await this.init();
      await this.poller.startAll();

      console.log('[GmailRelayZeroCost] Started polling for all users');

    } catch (error) {
      console.error('[GmailRelayZeroCost] Error starting pollers:', error);
    }
  }

  /**
   * Stop all polling
   */
  stopAll() {
    this.poller.stopAll();
    console.log('[GmailRelayZeroCost] Stopped all pollers');
  }

  /**
   * Get system status
   *
   * @returns {Object} Status
   */
  getStatus() {
    return {
      initialized: this.db.initialized,
      poller: this.poller.getStatus(),
      smtp: {
        provider: this.smtp.provider,
        limits: this.smtp.getLimits()
      }
    };
  }

  /**
   * Send test email
   *
   * @param {string} to - Recipient
   * @returns {Object} Send result
   */
  async sendTest(to) {
    return await this.smtp.sendTest(to);
  }
}

module.exports = GmailRelayZeroCost;
