/**
 * Gmail Webhook Relay System
 *
 * "Like Mailchimp but for personal Gmail accounts"
 *
 * Problem: Gmail doesn't let you truly "spoof" From addresses
 * Solution: Relay emails through CALOS servers (like Mailchimp does)
 *
 * Flow:
 * 1. User's Gmail → Gmail Pub/Sub webhook → CALOS endpoint
 * 2. CALOS receives webhook notification
 * 3. CALOS fetches email content via Gmail API
 * 4. CALOS relays email via Mailchimp/SendGrid with custom From
 * 5. Recipient sees: "From: noreply@calos.ai" (not user@gmail.com)
 *
 * Like Mailchimp:
 * - Users don't send FROM Mailchimp
 * - They send FROM custom domains
 * - Mailchimp handles auth, delivery, tracking
 *
 * CALOS does same:
 * - Users send trigger via Gmail
 * - CALOS relays with custom From
 * - Professional, branded, tracked
 */

const { google } = require('googleapis');
const { Pool } = require('pg');

class GmailWebhookRelay {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Email service for relaying (Mailchimp, SendGrid, etc.)
    this.emailService = config.emailService;

    // Gmail API credentials
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI;

    console.log('[GmailWebhookRelay] Initialized');
  }

  /**
   * Handle incoming Gmail webhook
   *
   * Called when Gmail Pub/Sub sends notification
   *
   * @param {Object} pubsubMessage - Pub/Sub message
   * @returns {Object} Processing result
   */
  async handleWebhook(pubsubMessage) {
    try {
      // Decode Pub/Sub message
      const data = JSON.parse(
        Buffer.from(pubsubMessage.data, 'base64').toString()
      );

      const { emailAddress, historyId } = data;

      console.log(`[GmailWebhookRelay] Webhook from ${emailAddress}, historyId: ${historyId}`);

      // Get user config for this email
      const config = await this.getUserConfig(emailAddress);

      if (!config) {
        console.log(`[GmailWebhookRelay] No config found for ${emailAddress}`);
        return { status: 'skipped', reason: 'no_config' };
      }

      if (!config.enabled) {
        console.log(`[GmailWebhookRelay] Relay disabled for ${emailAddress}`);
        return { status: 'skipped', reason: 'disabled' };
      }

      // Fetch new messages via Gmail API
      const messages = await this.fetchNewMessages(
        config.user_id,
        config.access_token,
        config.refresh_token,
        config.last_history_id
      );

      console.log(`[GmailWebhookRelay] Found ${messages.length} new message(s)`);

      // Process each message
      const results = [];

      for (const message of messages) {
        try {
          const result = await this.relayMessage(config, message);
          results.push(result);
        } catch (error) {
          console.error(`[GmailWebhookRelay] Error relaying message:`, error);
          results.push({ messageId: message.id, status: 'error', error: error.message });
        }
      }

      // Update last history ID
      await this.updateHistoryId(config.user_id, historyId);

      return {
        status: 'success',
        processed: results.length,
        results
      };

    } catch (error) {
      console.error('[GmailWebhookRelay] Webhook error:', error);
      throw error;
    }
  }

  /**
   * Relay message through CALOS email service
   *
   * Like Mailchimp:
   * - Original: user@gmail.com
   * - Relayed From: noreply@calos.ai
   * - Recipient sees clean From address
   *
   * @param {Object} config - User webhook config
   * @param {Object} message - Gmail message
   * @returns {Object} Relay result
   */
  async relayMessage(config, message) {
    try {
      const { relay_from_address, relay_rules } = config;

      // Check relay rules
      if (!this.shouldRelay(message, relay_rules)) {
        console.log(`[GmailWebhookRelay] Message filtered by rules:`, message.id);
        return { messageId: message.id, status: 'filtered' };
      }

      // Determine custom From address
      const customFrom = relay_from_address || 'noreply@calos.ai';

      // Send via email service (Mailchimp/SendGrid)
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
      await this.logRelay({
        userId: config.user_id,
        originalFrom: message.from.address,
        relayedFrom: customFrom,
        to: message.to.join(', '),
        subject: message.subject,
        messageId: message.id,
        status: result ? 'sent' : 'failed'
      });

      return {
        messageId: message.id,
        status: 'relayed',
        customFrom,
        originalFrom: message.from.address
      };

    } catch (error) {
      console.error('[GmailWebhookRelay] Relay error:', error);
      throw error;
    }
  }

  /**
   * Fetch new messages from Gmail
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} lastHistoryId - Last processed history ID
   * @returns {Array} New messages
   */
  async fetchNewMessages(userId, accessToken, refreshToken, lastHistoryId) {
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
          console.error(`[GmailWebhookRelay] Error fetching message ${messageId}:`, error.message);
        }
      }

      return messages;

    } catch (error) {
      console.error('[GmailWebhookRelay] Error fetching messages:', error);
      throw error;
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

    const match = header.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);

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
   * Check if message should be relayed based on rules
   *
   * @param {Object} message - Email message
   * @param {Object} rules - Relay rules
   * @returns {boolean} Should relay
   */
  shouldRelay(message, rules) {
    if (!rules) return true;

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

    // Filter by label (would need to be added to message)
    if (rules.has_label) {
      // This would require fetching labels
      // For now, skip
    }

    return true;
  }

  /**
   * Get user webhook configuration
   *
   * @param {string} emailAddress - User's Gmail address
   * @returns {Object|null} Configuration
   */
  async getUserConfig(emailAddress) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM gmail_webhook_configs
        WHERE email_address = $1
      `, [emailAddress]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('[GmailWebhookRelay] Error getting config:', error);
      return null;
    }
  }

  /**
   * Update last processed history ID
   *
   * @param {string} userId - User ID
   * @param {string} historyId - History ID
   */
  async updateHistoryId(userId, historyId) {
    try {
      await this.pool.query(`
        UPDATE gmail_webhook_configs
        SET last_history_id = $1, last_webhook_at = NOW()
        WHERE user_id = $2
      `, [historyId, userId]);

    } catch (error) {
      console.error('[GmailWebhookRelay] Error updating history ID:', error);
    }
  }

  /**
   * Log relay transaction
   *
   * @param {Object} data - Relay data
   */
  async logRelay(data) {
    try {
      await this.pool.query(`
        INSERT INTO email_relay_logs (
          user_id,
          original_from,
          relayed_from,
          recipient_to,
          subject,
          gmail_message_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        data.userId,
        data.originalFrom,
        data.relayedFrom,
        data.to,
        data.subject,
        data.messageId,
        data.status
      ]);

    } catch (error) {
      console.error('[GmailWebhookRelay] Error logging relay:', error);
    }
  }

  /**
   * Create webhook configuration for user
   *
   * @param {Object} config - Webhook configuration
   * @returns {Object} Created config
   */
  async createWebhookConfig(config) {
    try {
      const {
        userId,
        emailAddress,
        accessToken,
        refreshToken,
        relayFromAddress,
        relayRules,
        enabled = true
      } = config;

      // Get initial history ID
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

      const profile = await gmail.users.getProfile({ userId: 'me' });
      const initialHistoryId = profile.data.historyId;

      // Insert config
      const result = await this.pool.query(`
        INSERT INTO gmail_webhook_configs (
          user_id,
          email_address,
          access_token,
          refresh_token,
          relay_from_address,
          relay_rules,
          last_history_id,
          enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId,
        emailAddress,
        accessToken,
        refreshToken,
        relayFromAddress,
        JSON.stringify(relayRules || {}),
        initialHistoryId,
        enabled
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('[GmailWebhookRelay] Error creating config:', error);
      throw error;
    }
  }

  /**
   * Update webhook configuration
   *
   * @param {string} userId - User ID
   * @param {Object} updates - Configuration updates
   */
  async updateWebhookConfig(userId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.relayFromAddress !== undefined) {
        fields.push(`relay_from_address = $${paramIndex++}`);
        values.push(updates.relayFromAddress);
      }

      if (updates.relayRules !== undefined) {
        fields.push(`relay_rules = $${paramIndex++}`);
        values.push(JSON.stringify(updates.relayRules));
      }

      if (updates.enabled !== undefined) {
        fields.push(`enabled = $${paramIndex++}`);
        values.push(updates.enabled);
      }

      if (fields.length === 0) {
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      await this.pool.query(`
        UPDATE gmail_webhook_configs
        SET ${fields.join(', ')}
        WHERE user_id = $${paramIndex}
      `, values);

    } catch (error) {
      console.error('[GmailWebhookRelay] Error updating config:', error);
      throw error;
    }
  }

  /**
   * Get relay statistics for user
   *
   * @param {string} userId - User ID
   * @returns {Object} Statistics
   */
  async getRelayStats(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_relayed,
          COUNT(*) FILTER (WHERE status = 'sent') as successful,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          MAX(created_at) as last_relay,
          COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days
        FROM email_relay_logs
        WHERE user_id = $1
      `, [userId]);

      return result.rows[0] || {
        total_relayed: 0,
        successful: 0,
        failed: 0,
        last_relay: null,
        active_days: 0
      };

    } catch (error) {
      console.error('[GmailWebhookRelay] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = GmailWebhookRelay;
