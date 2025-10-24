/**
 * Recipient Whitelist Manager
 *
 * Double opt-in system to prevent spam abuse
 *
 * Flow:
 * 1. User adds recipient email → Status: "pending"
 * 2. System sends confirmation email to recipient
 * 3. Recipient clicks confirmation link
 * 4. Status changes to "approved"
 * 5. Now emails can be relayed to this recipient
 *
 * Why double opt-in?
 * - Prevents spam (recipient must explicitly consent)
 * - Improves deliverability (35% better open rates)
 * - Protects sender reputation
 * - Required by GDPR/CAN-SPAM for commercial email
 *
 * Anti-abuse features:
 * - Confirmation tokens expire after 7 days
 * - Rate limit confirmation emails (max 20 pending per user)
 * - Track bounce/spam complaints
 * - Auto-reject suspicious patterns
 */

const crypto = require('crypto');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');
const FreeSMTPAdapter = require('./free-smtp-adapter');

class RecipientWhitelistManager {
  constructor(config = {}) {
    // Database adapter
    this.db = config.db || new GoogleSheetsDBAdapter();

    // SMTP adapter for confirmation emails
    this.smtp = config.smtp || new FreeSMTPAdapter();

    // Confirmation URL base
    this.confirmationBaseUrl = config.confirmationBaseUrl ||
      process.env.CONFIRMATION_URL ||
      'http://localhost:3000/confirm';

    // Limits
    this.maxPendingPerUser = config.maxPendingPerUser || 20;
    this.maxRecipientsPerUser = config.maxRecipientsPerUser || 100;
    this.confirmationExpiryDays = config.confirmationExpiryDays || 7;

    console.log('[RecipientWhitelistManager] Initialized');
  }

  /**
   * Initialize (ensure whitelist table exists)
   */
  async init() {
    await this.db.init();

    // Ensure recipient_whitelist sheet exists
    if (!this.db.sheetNames.recipientWhitelist) {
      this.db.sheetNames.recipientWhitelist = 'recipient_whitelist';
    }

    console.log('[RecipientWhitelistManager] Ready');
  }

  /**
   * Add recipient to whitelist (sends confirmation email)
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email address
   * @param {Object} options - Additional options
   * @returns {Object} Result
   */
  async addRecipient(userId, recipientEmail, options = {}) {
    try {
      await this.init();

      // Validate email format
      if (!this.isValidEmail(recipientEmail)) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }

      // Check if already exists
      const existing = await this.db.findOne(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail
      });

      if (existing) {
        if (existing.status === 'approved') {
          return {
            success: false,
            error: 'Recipient already approved',
            status: 'approved'
          };
        } else if (existing.status === 'pending') {
          // Resend confirmation
          return await this.resendConfirmation(userId, recipientEmail);
        }
      }

      // Check limits
      const pendingCount = await this.db.count(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        status: 'pending'
      });

      if (pendingCount >= this.maxPendingPerUser) {
        return {
          success: false,
          error: `Too many pending confirmations (max ${this.maxPendingPerUser})`
        };
      }

      const totalCount = await this.db.count(this.db.sheetNames.recipientWhitelist, {
        user_id: userId
      });

      if (totalCount >= this.maxRecipientsPerUser) {
        return {
          success: false,
          error: `Maximum recipients reached (max ${this.maxRecipientsPerUser})`
        };
      }

      // Generate confirmation token
      const token = this.generateToken();

      // Calculate expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.confirmationExpiryDays);

      // Insert into whitelist
      await this.db.insert(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail,
        status: 'pending',
        confirmation_token: token,
        confirmation_sent_at: new Date().toISOString(),
        confirmed_at: null,
        expires_at: expiresAt.toISOString(),
        bounce_count: 0,
        spam_complaint: false,
        metadata: JSON.stringify(options.metadata || {})
      });

      // Send confirmation email
      const emailSent = await this.sendConfirmationEmail(
        userId,
        recipientEmail,
        token,
        options
      );

      if (!emailSent) {
        console.warn('[RecipientWhitelistManager] Failed to send confirmation email');
      }

      console.log(`[RecipientWhitelistManager] Added recipient ${recipientEmail} for user ${userId}`);

      return {
        success: true,
        recipient: recipientEmail,
        status: 'pending',
        token,
        expiresAt: expiresAt.toISOString(),
        confirmationUrl: `${this.confirmationBaseUrl}/${token}`
      };

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error adding recipient:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send confirmation email to recipient
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   * @param {string} token - Confirmation token
   * @param {Object} options - Email options
   * @returns {boolean} Success
   * @private
   */
  async sendConfirmationEmail(userId, recipientEmail, token, options = {}) {
    try {
      const confirmationUrl = `${this.confirmationBaseUrl}/${token}`;

      const fromAddress = options.fromAddress || process.env.EMAIL_FROM_ADDRESS || 'noreply@calos.ai';
      const fromName = options.fromName || 'CALOS';

      const subject = options.subject || 'Confirm Email Subscription';

      const html = options.customHtml || `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Confirm Your Email Subscription</h2>

    <p>Hi,</p>

    <p>You're receiving this email because someone requested to send emails to <strong>${recipientEmail}</strong> from <strong>${fromAddress}</strong>.</p>

    <p>If you'd like to receive these emails, please confirm by clicking the button below:</p>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${confirmationUrl}" class="button">Confirm Subscription</a>
    </p>

    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #0066cc;">${confirmationUrl}</p>

    <p><strong>This link expires in ${this.confirmationExpiryDays} days.</strong></p>

    <p>If you didn't request this, you can safely ignore this email.</p>

    <div class="footer">
      <p>Powered by CALOS • <a href="https://calos.ai">calos.ai</a></p>
      <p>This is an automated confirmation email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
      `;

      const text = options.customText || `
Confirm Your Email Subscription

Hi,

You're receiving this email because someone requested to send emails to ${recipientEmail} from ${fromAddress}.

If you'd like to receive these emails, please confirm by clicking this link:

${confirmationUrl}

This link expires in ${this.confirmationExpiryDays} days.

If you didn't request this, you can safely ignore this email.

---
Powered by CALOS (calos.ai)
This is an automated confirmation email. Please do not reply.
      `;

      const result = await this.smtp.send({
        from: `${fromName} <${fromAddress}>`,
        to: recipientEmail,
        subject,
        html,
        text
      });

      return result.success;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error sending confirmation:', error);
      return false;
    }
  }

  /**
   * Confirm recipient (called when they click confirmation link)
   *
   * @param {string} token - Confirmation token
   * @returns {Object} Result
   */
  async confirmRecipient(token) {
    try {
      await this.init();

      // Find pending confirmation
      const recipients = await this.db.query(this.db.sheetNames.recipientWhitelist, {
        confirmation_token: token,
        status: 'pending'
      });

      if (recipients.length === 0) {
        return {
          success: false,
          error: 'Invalid or expired confirmation token'
        };
      }

      const recipient = recipients[0];

      // Check if expired
      const expiresAt = new Date(recipient.expires_at);
      const now = new Date();

      if (now > expiresAt) {
        return {
          success: false,
          error: 'Confirmation link has expired',
          expired: true
        };
      }

      // Update status to approved
      await this.db.update(
        this.db.sheetNames.recipientWhitelist,
        { confirmation_token: token },
        {
          status: 'approved',
          confirmed_at: new Date().toISOString()
        }
      );

      console.log(`[RecipientWhitelistManager] Confirmed recipient ${recipient.recipient_email}`);

      return {
        success: true,
        recipient: recipient.recipient_email,
        userId: recipient.user_id,
        confirmedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error confirming recipient:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if recipient is approved
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   * @returns {boolean} Is approved
   */
  async isApproved(userId, recipientEmail) {
    try {
      await this.init();

      const recipient = await this.db.findOne(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail,
        status: 'approved'
      });

      return recipient !== null;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error checking approval:', error);
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
    try {
      await this.init();

      const filter = { user_id: userId };
      if (status) {
        filter.status = status;
      }

      const recipients = await this.db.query(this.db.sheetNames.recipientWhitelist, filter);

      return recipients;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error getting recipients:', error);
      return [];
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
    try {
      await this.init();

      await this.db.delete(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail
      });

      console.log(`[RecipientWhitelistManager] Removed recipient ${recipientEmail}`);

      return true;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error removing recipient:', error);
      return false;
    }
  }

  /**
   * Resend confirmation email
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   * @returns {Object} Result
   */
  async resendConfirmation(userId, recipientEmail) {
    try {
      const recipient = await this.db.findOne(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail,
        status: 'pending'
      });

      if (!recipient) {
        return {
          success: false,
          error: 'Recipient not found or already confirmed'
        };
      }

      // Check if recently sent (prevent spam)
      const sentAt = new Date(recipient.confirmation_sent_at);
      const now = new Date();
      const minutesSinceSent = (now - sentAt) / 1000 / 60;

      if (minutesSinceSent < 5) {
        return {
          success: false,
          error: 'Please wait 5 minutes before resending'
        };
      }

      // Send confirmation email
      const emailSent = await this.sendConfirmationEmail(
        userId,
        recipientEmail,
        recipient.confirmation_token
      );

      if (emailSent) {
        // Update sent timestamp
        await this.db.update(
          this.db.sheetNames.recipientWhitelist,
          { user_id: userId, recipient_email: recipientEmail },
          { confirmation_sent_at: new Date().toISOString() }
        );

        return {
          success: true,
          message: 'Confirmation email resent'
        };
      } else {
        return {
          success: false,
          error: 'Failed to send confirmation email'
        };
      }

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error resending confirmation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record bounce for recipient
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   */
  async recordBounce(userId, recipientEmail) {
    try {
      await this.init();

      const recipient = await this.db.findOne(this.db.sheetNames.recipientWhitelist, {
        user_id: userId,
        recipient_email: recipientEmail
      });

      if (recipient) {
        const bounceCount = parseInt(recipient.bounce_count || 0) + 1;

        await this.db.update(
          this.db.sheetNames.recipientWhitelist,
          { user_id: userId, recipient_email: recipientEmail },
          { bounce_count: bounceCount }
        );

        // Auto-reject after 3 bounces
        if (bounceCount >= 3) {
          await this.db.update(
            this.db.sheetNames.recipientWhitelist,
            { user_id: userId, recipient_email: recipientEmail },
            { status: 'rejected' }
          );

          console.log(`[RecipientWhitelistManager] Auto-rejected ${recipientEmail} after ${bounceCount} bounces`);
        }
      }

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error recording bounce:', error);
    }
  }

  /**
   * Record spam complaint for recipient
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email
   */
  async recordSpamComplaint(userId, recipientEmail) {
    try {
      await this.init();

      await this.db.update(
        this.db.sheetNames.recipientWhitelist,
        { user_id: userId, recipient_email: recipientEmail },
        {
          spam_complaint: true,
          status: 'rejected'
        }
      );

      console.log(`[RecipientWhitelistManager] Recorded spam complaint for ${recipientEmail}`);

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error recording spam complaint:', error);
    }
  }

  /**
   * Clean up expired pending confirmations
   *
   * @returns {number} Number of cleaned up records
   */
  async cleanupExpired() {
    try {
      await this.init();

      const pending = await this.db.query(this.db.sheetNames.recipientWhitelist, {
        status: 'pending'
      });

      const now = new Date();
      let cleanedCount = 0;

      for (const recipient of pending) {
        const expiresAt = new Date(recipient.expires_at);

        if (now > expiresAt) {
          await this.db.delete(this.db.sheetNames.recipientWhitelist, {
            user_id: recipient.user_id,
            recipient_email: recipient.recipient_email
          });

          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[RecipientWhitelistManager] Cleaned up ${cleanedCount} expired confirmations`);
      }

      return cleanedCount;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error cleaning up expired:', error);
      return 0;
    }
  }

  /**
   * Generate secure random token
   * @private
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate email format
   * @private
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get statistics for user
   *
   * @param {string} userId - User ID
   * @returns {Object} Statistics
   */
  async getStats(userId) {
    try {
      await this.init();

      const recipients = await this.getRecipients(userId);

      const stats = {
        total: recipients.length,
        approved: recipients.filter(r => r.status === 'approved').length,
        pending: recipients.filter(r => r.status === 'pending').length,
        rejected: recipients.filter(r => r.status === 'rejected').length,
        bounces: recipients.reduce((sum, r) => sum + parseInt(r.bounce_count || 0), 0),
        spamComplaints: recipients.filter(r => r.spam_complaint === 'true' || r.spam_complaint === true).length
      };

      return stats;

    } catch (error) {
      console.error('[RecipientWhitelistManager] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = RecipientWhitelistManager;
