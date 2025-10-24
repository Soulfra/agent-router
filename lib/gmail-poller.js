/**
 * Gmail Poller
 *
 * Simple alternative to Gmail Pub/Sub webhooks
 * No Google Cloud Platform setup required
 *
 * How it works:
 * 1. Poll Gmail every 60 seconds
 * 2. Use historyId to only fetch new messages (efficient!)
 * 3. Process new messages through relay system
 * 4. Update historyId for next poll
 *
 * Why polling instead of webhooks?
 * - No Google Cloud Platform setup
 * - No Pub/Sub configuration
 * - No webhook endpoint needed
 * - Simpler deployment
 * - Good enough for low-volume use cases
 *
 * Limitations:
 * - Up to 60 second delay
 * - More API requests than webhooks
 * - Not suitable for high-volume (>1000 emails/day)
 *
 * Perfect for:
 * - Hobby projects
 * - MVPs
 * - Personal use
 * - Low-volume apps
 */

const { google } = require('googleapis');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');
const SimpleEncryption = require('./simple-encryption');

class GmailPoller {
  constructor(config = {}) {
    // Database adapter (Google Sheets or SQLite)
    this.db = config.db || new GoogleSheetsDBAdapter();

    // Encryption for OAuth tokens
    this.encryption = config.encryption || new SimpleEncryption();

    // Email service for relaying
    this.emailService = config.emailService;

    // Gmail API credentials
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI;

    // Polling interval (milliseconds)
    this.pollInterval = config.pollInterval || 60000; // 60 seconds

    // Active pollers (by user ID)
    this.pollers = new Map();

    console.log('[GmailPoller] Initialized (poll interval: ' + (this.pollInterval / 1000) + 's)');
  }

  /**
   * Start polling for all enabled users
   */
  async startAll() {
    try {
      console.log('[GmailPoller] Starting pollers for all users...');

      // Get all enabled webhook configs
      const configs = await this.db.query(this.db.sheetNames.configs, { enabled: true });

      console.log(`[GmailPoller] Found ${configs.length} enabled configurations`);

      for (const config of configs) {
        this.start(config.user_id);
      }

    } catch (error) {
      console.error('[GmailPoller] Error starting pollers:', error);
    }
  }

  /**
   * Start polling for specific user
   *
   * @param {string} userId - User ID
   */
  start(userId) {
    if (this.pollers.has(userId)) {
      console.log(`[GmailPoller] Already polling for user: ${userId}`);
      return;
    }

    console.log(`[GmailPoller] Starting poller for user: ${userId}`);

    // Poll immediately, then on interval
    this.poll(userId);

    const intervalId = setInterval(() => {
      this.poll(userId);
    }, this.pollInterval);

    this.pollers.set(userId, intervalId);
  }

  /**
   * Stop polling for specific user
   *
   * @param {string} userId - User ID
   */
  stop(userId) {
    const intervalId = this.pollers.get(userId);

    if (intervalId) {
      clearInterval(intervalId);
      this.pollers.delete(userId);
      console.log(`[GmailPoller] Stopped poller for user: ${userId}`);
    }
  }

  /**
   * Stop all pollers
   */
  stopAll() {
    console.log(`[GmailPoller] Stopping all pollers (${this.pollers.size} active)`);

    for (const [userId, intervalId] of this.pollers.entries()) {
      clearInterval(intervalId);
      console.log(`[GmailPoller] Stopped poller for user: ${userId}`);
    }

    this.pollers.clear();
  }

  /**
   * Poll Gmail for new messages (single execution)
   *
   * @param {string} userId - User ID
   */
  async poll(userId) {
    try {
      // Get user config
      const configs = await this.db.query(this.db.sheetNames.configs, { user_id: userId });

      if (configs.length === 0) {
        console.log(`[GmailPoller] No config found for user: ${userId}`);
        this.stop(userId);
        return;
      }

      const config = configs[0];

      if (!config.enabled) {
        console.log(`[GmailPoller] Polling disabled for user: ${userId}`);
        this.stop(userId);
        return;
      }

      // Decrypt OAuth tokens
      const tokens = this.encryption.decryptTokens({
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        encrypted: true
      });

      // Fetch new messages
      const messages = await this.fetchNewMessages(
        config.email_address,
        tokens.access_token,
        tokens.refresh_token,
        config.last_history_id
      );

      if (messages.length === 0) {
        // No new messages
        return;
      }

      console.log(`[GmailPoller] Found ${messages.length} new message(s) for ${config.email_address}`);

      // Process each message
      for (const message of messages) {
        try {
          await this.relayMessage(config, message);
        } catch (error) {
          console.error(`[GmailPoller] Error relaying message:`, error);

          // Log error
          await this.db.insert(this.db.sheetNames.relayLogs, {
            user_id: userId,
            original_from: message.from?.address || 'unknown',
            relayed_from: config.relay_from_address || 'noreply@calos.ai',
            recipient_to: message.to?.join(', ') || '',
            subject: message.subject,
            gmail_message_id: message.id,
            status: 'failed',
            error_message: error.message
          });
        }
      }

      // Update last poll time
      await this.db.update(
        this.db.sheetNames.configs,
        { user_id: userId },
        { last_webhook_at: new Date().toISOString() }
      );

    } catch (error) {
      console.error(`[GmailPoller] Error polling for user ${userId}:`, error);
    }
  }

  /**
   * Fetch new messages from Gmail
   *
   * @param {string} emailAddress - Gmail address
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} lastHistoryId - Last processed history ID
   * @returns {Array} New messages
   */
  async fetchNewMessages(emailAddress, accessToken, refreshToken, lastHistoryId) {
    try {
      // Create OAuth2 client
      const auth = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );

      auth.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      const gmail = google.gmail({ version: 'v1', auth });

      // If no historyId, get current profile to start
      if (!lastHistoryId) {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        lastHistoryId = profile.data.historyId;

        // Update in database
        const configs = await this.db.query(this.db.sheetNames.configs, {
          email_address: emailAddress
        });

        if (configs.length > 0) {
          await this.db.update(
            this.db.sheetNames.configs,
            { email_address: emailAddress },
            { last_history_id: lastHistoryId }
          );
        }

        // No messages to fetch yet
        return [];
      }

      // Fetch history since last historyId
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded']
      });

      const history = historyResponse.data.history || [];

      if (history.length === 0) {
        return [];
      }

      // Update historyId
      const newHistoryId = historyResponse.data.historyId;

      await this.db.update(
        this.db.sheetNames.configs,
        { email_address: emailAddress },
        { last_history_id: newHistoryId }
      );

      // Extract message IDs
      const messageIds = new Set();
      history.forEach(record => {
        if (record.messagesAdded) {
          record.messagesAdded.forEach(msg => {
            messageIds.add(msg.message.id);
          });
        }
      });

      // Fetch full message details
      const messages = [];

      for (const messageId of messageIds) {
        try {
          const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
          });

          const normalized = this.normalizeMessage(messageData.data);
          messages.push(normalized);

        } catch (error) {
          console.error(`[GmailPoller] Error fetching message ${messageId}:`, error.message);
        }
      }

      return messages;

    } catch (error) {
      console.error('[GmailPoller] Error fetching messages:', error);
      return [];
    }
  }

  /**
   * Normalize Gmail message to standard format
   * @private
   */
  normalizeMessage(gmailMessage) {
    const headers = gmailMessage.payload.headers;
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : null;
    };

    // Extract body
    const { plain, html } = this.extractBody(gmailMessage.payload);

    // Parse from address
    const fromHeader = getHeader('From');
    const from = this.parseEmailAddress(fromHeader);

    // Parse to addresses
    const toHeader = getHeader('To');
    const to = this.parseEmailAddresses(toHeader);

    // Parse CC addresses
    const ccHeader = getHeader('Cc');
    const cc = this.parseEmailAddresses(ccHeader);

    return {
      id: gmailMessage.id,
      threadId: gmailMessage.threadId,
      from,
      to,
      cc,
      subject: getHeader('Subject') || '(no subject)',
      bodyPlain: plain,
      bodyHtml: html,
      receivedAt: new Date(parseInt(gmailMessage.internalDate))
    };
  }

  /**
   * Extract plain and HTML body
   * @private
   */
  extractBody(payload) {
    let plain = '';
    let html = '';

    const extractFromPart = (part) => {
      if (part.mimeType === 'text/plain' && part.body.data) {
        plain = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };

    if (payload.body && payload.body.data) {
      if (payload.mimeType === 'text/plain') {
        plain = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload.mimeType === 'text/html') {
        html = Buffer.from(payload.body.data, 'base64').toString('utf8');
      }
    } else if (payload.parts) {
      payload.parts.forEach(extractFromPart);
    }

    return { plain, html };
  }

  /**
   * Parse email address
   * @private
   */
  parseEmailAddress(header) {
    if (!header) return null;

    const match = header.match(/(?:"?([^"]*)?"?\s)?<?([^>]+)>?/);

    if (match) {
      return {
        name: match[1]?.trim() || null,
        address: match[2]?.trim()
      };
    }

    return { name: null, address: header.trim() };
  }

  /**
   * Parse multiple email addresses
   * @private
   */
  parseEmailAddresses(header) {
    if (!header) return [];

    return header.split(',').map(addr => {
      const parsed = this.parseEmailAddress(addr.trim());
      return parsed?.address || addr.trim();
    });
  }

  /**
   * Relay message through email service
   *
   * @param {Object} config - User config
   * @param {Object} message - Email message
   */
  async relayMessage(config, message) {
    try {
      // Check relay rules
      if (!this.shouldRelay(message, config.relay_rules)) {
        console.log(`[GmailPoller] Message filtered by rules:`, message.id);

        await this.db.insert(this.db.sheetNames.relayLogs, {
          user_id: config.user_id,
          original_from: message.from.address,
          relayed_from: config.relay_from_address || 'noreply@calos.ai',
          recipient_to: message.to.join(', '),
          subject: message.subject,
          gmail_message_id: message.id,
          status: 'filtered'
        });

        return;
      }

      const customFrom = config.relay_from_address || 'noreply@calos.ai';

      // Send via email service
      const result = await this.emailService.send({
        from: customFrom,
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        html: message.bodyHtml || `<p>${message.bodyPlain}</p>`,
        text: message.bodyPlain,
        headers: {
          'X-Original-From': message.from.address,
          'X-Relayed-By': 'CALOS',
          'X-Original-Message-ID': message.id
        }
      });

      // Log relay
      await this.db.insert(this.db.sheetNames.relayLogs, {
        user_id: config.user_id,
        original_from: message.from.address,
        relayed_from: customFrom,
        recipient_to: message.to.join(', '),
        subject: message.subject,
        gmail_message_id: message.id,
        relay_message_id: result?.messageId || null,
        status: 'sent'
      });

      console.log(`[GmailPoller] Relayed message ${message.id} from ${message.from.address}`);

    } catch (error) {
      console.error('[GmailPoller] Error relaying message:', error);
      throw error;
    }
  }

  /**
   * Check if message should be relayed based on rules
   *
   * @param {Object} message - Email message
   * @param {Object} rules - Relay rules (JSON or string)
   * @returns {boolean} Should relay
   */
  shouldRelay(message, rules) {
    // Parse rules if string
    if (typeof rules === 'string') {
      try {
        rules = JSON.parse(rules);
      } catch {
        return true; // Invalid rules, relay everything
      }
    }

    if (!rules || typeof rules !== 'object') {
      return true;
    }

    // Filter by subject
    if (rules.subject_contains) {
      const subjectLower = message.subject.toLowerCase();
      const contains = rules.subject_contains.toLowerCase();

      if (!subjectLower.includes(contains)) {
        return false;
      }
    }

    // Filter by from domain
    if (rules.from_domain) {
      const domain = message.from.address.split('@')[1];

      if (domain !== rules.from_domain) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get polling status
   *
   * @returns {Object} Status
   */
  getStatus() {
    return {
      active: this.pollers.size,
      pollInterval: this.pollInterval,
      users: Array.from(this.pollers.keys())
    };
  }
}

module.exports = GmailPoller;
