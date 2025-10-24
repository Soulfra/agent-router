/**
 * Gmail Send-As Alias Manager
 *
 * "Tier 1" Solution: Gmail "Send As" Aliases
 *
 * What it does:
 * - Lets users send emails from custom addresses via Gmail
 * - Example: Send from "support@mycompany.com" instead of "user@gmail.com"
 * - Gmail API handles verification and sending
 *
 * Limitations:
 * - Shows "on behalf of" in some email clients
 * - Requires email verification (confirmation email)
 * - Less control than full relay (Tier 3)
 *
 * Good for:
 * - Simple use cases
 * - Users who want quick setup
 * - Testing before full webhook relay
 */

const { google } = require('googleapis');
const { Pool } = require('pg');

class GmailSendAsManager {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Gmail API credentials
    this.clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI;

    console.log('[GmailSendAsManager] Initialized');
  }

  /**
   * Add a new Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {Object} aliasConfig - Alias configuration
   * @returns {Object} Created alias
   */
  async addSendAsAlias(userId, accessToken, refreshToken, aliasConfig) {
    try {
      const {
        sendAsEmail,     // Email to send as (e.g., "support@mycompany.com")
        displayName,     // Display name (e.g., "My Company Support")
        replyToAddress,  // Optional reply-to address
        signature,       // Optional email signature
        isDefault = false
      } = aliasConfig;

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

      console.log(`[GmailSendAsManager] Adding Send-As alias: ${sendAsEmail}`);

      // Create Send-As alias via Gmail API
      const sendAsRequest = {
        sendAsEmail: sendAsEmail,
        displayName: displayName,
        replyToAddress: replyToAddress || sendAsEmail,
        treatAsAlias: true, // Treat as an alias, not the primary address
        isDefault: isDefault
      };

      if (signature) {
        sendAsRequest.signature = signature;
      }

      const response = await gmail.users.settings.sendAs.create({
        userId: 'me',
        requestBody: sendAsRequest
      });

      const alias = response.data;

      console.log(`[GmailSendAsManager] Created alias:`, alias);
      console.log(`[GmailSendAsManager] Verification status: ${alias.verificationStatus}`);

      // Save to database
      await this.saveSendAsAlias(userId, {
        sendAsEmail: alias.sendAsEmail,
        displayName: alias.displayName,
        replyToAddress: alias.replyToAddress,
        verificationStatus: alias.verificationStatus,
        isDefault: alias.isDefault,
        isPrimary: alias.isPrimary || false
      });

      return {
        ...alias,
        needsVerification: alias.verificationStatus === 'pending'
      };

    } catch (error) {
      console.error('[GmailSendAsManager] Error adding Send-As alias:', error);

      // Check if alias already exists
      if (error.code === 409 || error.message?.includes('already exists')) {
        console.log('[GmailSendAsManager] Alias already exists, fetching existing...');
        return await this.getSendAsAlias(userId, accessToken, refreshToken, aliasConfig.sendAsEmail);
      }

      throw error;
    }
  }

  /**
   * Get a specific Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} sendAsEmail - Send-As email address
   * @returns {Object} Alias details
   */
  async getSendAsAlias(userId, accessToken, refreshToken, sendAsEmail) {
    try {
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

      const response = await gmail.users.settings.sendAs.get({
        userId: 'me',
        sendAsEmail: sendAsEmail
      });

      const alias = response.data;

      // Update database
      await this.updateSendAsAlias(userId, sendAsEmail, {
        verificationStatus: alias.verificationStatus
      });

      return alias;

    } catch (error) {
      console.error('[GmailSendAsManager] Error getting Send-As alias:', error);
      throw error;
    }
  }

  /**
   * List all Send-As aliases for a user
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @returns {Array} List of aliases
   */
  async listSendAsAliases(userId, accessToken, refreshToken) {
    try {
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

      const response = await gmail.users.settings.sendAs.list({
        userId: 'me'
      });

      const aliases = response.data.sendAs || [];

      console.log(`[GmailSendAsManager] Found ${aliases.length} Send-As aliases`);

      // Sync with database
      for (const alias of aliases) {
        if (!alias.isPrimary) { // Don't save primary Gmail address
          await this.saveSendAsAlias(userId, {
            sendAsEmail: alias.sendAsEmail,
            displayName: alias.displayName,
            replyToAddress: alias.replyToAddress,
            verificationStatus: alias.verificationStatus,
            isDefault: alias.isDefault,
            isPrimary: false
          });
        }
      }

      return aliases;

    } catch (error) {
      console.error('[GmailSendAsManager] Error listing Send-As aliases:', error);
      throw error;
    }
  }

  /**
   * Update a Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} sendAsEmail - Send-As email address
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated alias
   */
  async updateSendAsAliasConfig(userId, accessToken, refreshToken, sendAsEmail, updates) {
    try {
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

      // Build update request
      const updateRequest = {};

      if (updates.displayName !== undefined) {
        updateRequest.displayName = updates.displayName;
      }

      if (updates.replyToAddress !== undefined) {
        updateRequest.replyToAddress = updates.replyToAddress;
      }

      if (updates.signature !== undefined) {
        updateRequest.signature = updates.signature;
      }

      if (updates.isDefault !== undefined) {
        updateRequest.isDefault = updates.isDefault;
      }

      console.log(`[GmailSendAsManager] Updating Send-As alias: ${sendAsEmail}`);

      const response = await gmail.users.settings.sendAs.update({
        userId: 'me',
        sendAsEmail: sendAsEmail,
        requestBody: updateRequest
      });

      const alias = response.data;

      // Update database
      await this.updateSendAsAlias(userId, sendAsEmail, {
        displayName: alias.displayName,
        replyToAddress: alias.replyToAddress,
        isDefault: alias.isDefault,
        verificationStatus: alias.verificationStatus
      });

      return alias;

    } catch (error) {
      console.error('[GmailSendAsManager] Error updating Send-As alias:', error);
      throw error;
    }
  }

  /**
   * Delete a Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} sendAsEmail - Send-As email address
   */
  async deleteSendAsAlias(userId, accessToken, refreshToken, sendAsEmail) {
    try {
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

      console.log(`[GmailSendAsManager] Deleting Send-As alias: ${sendAsEmail}`);

      await gmail.users.settings.sendAs.delete({
        userId: 'me',
        sendAsEmail: sendAsEmail
      });

      // Remove from database
      await this.removeSendAsAlias(userId, sendAsEmail);

      console.log(`[GmailSendAsManager] Deleted Send-As alias: ${sendAsEmail}`);

    } catch (error) {
      console.error('[GmailSendAsManager] Error deleting Send-As alias:', error);
      throw error;
    }
  }

  /**
   * Verify a Send-As alias
   *
   * Gmail sends a verification email to the alias address.
   * User must click the verification link in that email.
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} sendAsEmail - Send-As email address
   * @returns {Object} Verification result
   */
  async verifySendAsAlias(userId, accessToken, refreshToken, sendAsEmail) {
    try {
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

      console.log(`[GmailSendAsManager] Sending verification email to: ${sendAsEmail}`);

      // Gmail automatically sends verification email when alias is created
      // This method checks the current verification status
      const response = await gmail.users.settings.sendAs.verify({
        userId: 'me',
        sendAsEmail: sendAsEmail
      });

      console.log(`[GmailSendAsManager] Verification email sent to: ${sendAsEmail}`);

      // Update database
      await this.updateSendAsAlias(userId, sendAsEmail, {
        verificationStatus: 'pending',
        verificationSentAt: new Date()
      });

      return {
        status: 'pending',
        message: `Verification email sent to ${sendAsEmail}. Please check inbox and click verification link.`
      };

    } catch (error) {
      console.error('[GmailSendAsManager] Error verifying Send-As alias:', error);
      throw error;
    }
  }

  /**
   * Check verification status of a Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {string} sendAsEmail - Send-As email address
   * @returns {Object} Verification status
   */
  async checkVerificationStatus(userId, accessToken, refreshToken, sendAsEmail) {
    try {
      const alias = await this.getSendAsAlias(userId, accessToken, refreshToken, sendAsEmail);

      const isVerified = alias.verificationStatus === 'accepted';

      console.log(`[GmailSendAsManager] ${sendAsEmail} verification: ${alias.verificationStatus}`);

      return {
        sendAsEmail: alias.sendAsEmail,
        verificationStatus: alias.verificationStatus,
        isVerified: isVerified,
        canSend: isVerified
      };

    } catch (error) {
      console.error('[GmailSendAsManager] Error checking verification status:', error);
      throw error;
    }
  }

  /**
   * Send email using a Send-As alias
   *
   * @param {string} userId - User ID
   * @param {string} accessToken - OAuth access token
   * @param {string} refreshToken - OAuth refresh token
   * @param {Object} message - Email message
   * @returns {Object} Send result
   */
  async sendEmail(userId, accessToken, refreshToken, message) {
    try {
      const {
        from,        // Send-As email address
        to,          // Recipient email(s)
        cc,          // CC recipient(s)
        bcc,         // BCC recipient(s)
        subject,     // Email subject
        text,        // Plain text body
        html         // HTML body
      } = message;

      // Verify Send-As alias is verified
      const verificationStatus = await this.checkVerificationStatus(
        userId,
        accessToken,
        refreshToken,
        from
      );

      if (!verificationStatus.isVerified) {
        throw new Error(`Send-As alias ${from} is not verified. Status: ${verificationStatus.verificationStatus}`);
      }

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

      // Build RFC 2822 email
      const email = this._createRFC2822Email({
        from,
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
        subject,
        text,
        html
      });

      // Encode to base64url
      const encodedMessage = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      console.log(`[GmailSendAsManager] Sending email from ${from} to ${to}`);

      // Send via Gmail API
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      console.log(`[GmailSendAsManager] Email sent successfully:`, response.data.id);

      // Log in database
      await this.logSentEmail(userId, {
        sendAsEmail: from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject: subject,
        gmailMessageId: response.data.id,
        status: 'sent'
      });

      return {
        messageId: response.data.id,
        threadId: response.data.threadId,
        status: 'sent'
      };

    } catch (error) {
      console.error('[GmailSendAsManager] Error sending email:', error);
      throw error;
    }
  }

  /**
   * Create RFC 2822 formatted email
   * @private
   */
  _createRFC2822Email(message) {
    const { from, to, cc, bcc, subject, text, html } = message;

    const lines = [];

    // Headers
    lines.push(`From: ${from}`);
    lines.push(`To: ${to.join(', ')}`);

    if (cc && cc.length > 0) {
      lines.push(`Cc: ${cc.join(', ')}`);
    }

    if (bcc && bcc.length > 0) {
      lines.push(`Bcc: ${bcc.join(', ')}`);
    }

    lines.push(`Subject: ${subject}`);
    lines.push('MIME-Version: 1.0');

    // Body
    if (html && text) {
      // Multipart (both HTML and plain text)
      const boundary = `boundary_${Date.now()}`;
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push('');
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('');
      lines.push(text);
      lines.push('');
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('');
      lines.push(html);
      lines.push('');
      lines.push(`--${boundary}--`);
    } else if (html) {
      // HTML only
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('');
      lines.push(html);
    } else {
      // Plain text only
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('');
      lines.push(text || '');
    }

    return lines.join('\r\n');
  }

  /**
   * Save Send-As alias to database
   * @private
   */
  async saveSendAsAlias(userId, alias) {
    try {
      await this.pool.query(`
        INSERT INTO gmail_send_as_aliases (
          user_id,
          send_as_email,
          display_name,
          reply_to_address,
          verification_status,
          is_default,
          is_primary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, send_as_email)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          reply_to_address = EXCLUDED.reply_to_address,
          verification_status = EXCLUDED.verification_status,
          is_default = EXCLUDED.is_default,
          updated_at = NOW()
      `, [
        userId,
        alias.sendAsEmail,
        alias.displayName,
        alias.replyToAddress,
        alias.verificationStatus,
        alias.isDefault,
        alias.isPrimary
      ]);

    } catch (error) {
      console.error('[GmailSendAsManager] Error saving alias to DB:', error);
    }
  }

  /**
   * Update Send-As alias in database
   * @private
   */
  async updateSendAsAlias(userId, sendAsEmail, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.displayName !== undefined) {
        fields.push(`display_name = $${paramIndex++}`);
        values.push(updates.displayName);
      }

      if (updates.replyToAddress !== undefined) {
        fields.push(`reply_to_address = $${paramIndex++}`);
        values.push(updates.replyToAddress);
      }

      if (updates.verificationStatus !== undefined) {
        fields.push(`verification_status = $${paramIndex++}`);
        values.push(updates.verificationStatus);
      }

      if (updates.isDefault !== undefined) {
        fields.push(`is_default = $${paramIndex++}`);
        values.push(updates.isDefault);
      }

      if (updates.verificationSentAt !== undefined) {
        fields.push(`verification_sent_at = $${paramIndex++}`);
        values.push(updates.verificationSentAt);
      }

      if (fields.length === 0) {
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId, sendAsEmail);

      await this.pool.query(`
        UPDATE gmail_send_as_aliases
        SET ${fields.join(', ')}
        WHERE user_id = $${paramIndex++} AND send_as_email = $${paramIndex}
      `, values);

    } catch (error) {
      console.error('[GmailSendAsManager] Error updating alias in DB:', error);
    }
  }

  /**
   * Remove Send-As alias from database
   * @private
   */
  async removeSendAsAlias(userId, sendAsEmail) {
    try {
      await this.pool.query(`
        DELETE FROM gmail_send_as_aliases
        WHERE user_id = $1 AND send_as_email = $2
      `, [userId, sendAsEmail]);

    } catch (error) {
      console.error('[GmailSendAsManager] Error removing alias from DB:', error);
    }
  }

  /**
   * Log sent email to database
   * @private
   */
  async logSentEmail(userId, data) {
    try {
      await this.pool.query(`
        INSERT INTO gmail_sent_emails (
          user_id,
          send_as_email,
          recipient_to,
          subject,
          gmail_message_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        userId,
        data.sendAsEmail,
        data.to,
        data.subject,
        data.gmailMessageId,
        data.status
      ]);

    } catch (error) {
      console.error('[GmailSendAsManager] Error logging sent email:', error);
    }
  }

  /**
   * Get Send-As aliases from database
   *
   * @param {string} userId - User ID
   * @returns {Array} Aliases
   */
  async getSendAsAliasesFromDB(userId) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM gmail_send_as_aliases
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at ASC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[GmailSendAsManager] Error getting aliases from DB:', error);
      return [];
    }
  }

  /**
   * Get email statistics for user
   *
   * @param {string} userId - User ID
   * @returns {Object} Statistics
   */
  async getEmailStats(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_sent,
          COUNT(*) FILTER (WHERE status = 'sent') as successful,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          MAX(created_at) as last_sent,
          COUNT(DISTINCT send_as_email) as unique_aliases
        FROM gmail_sent_emails
        WHERE user_id = $1
      `, [userId]);

      return result.rows[0] || {
        total_sent: 0,
        successful: 0,
        failed: 0,
        last_sent: null,
        unique_aliases: 0
      };

    } catch (error) {
      console.error('[GmailSendAsManager] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = GmailSendAsManager;
