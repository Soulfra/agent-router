/**
 * Drip Campaign Manager - Email/SMS Automation
 *
 * Manages automated email and SMS campaigns for the learning platform.
 * Handles template rendering, sending, tracking, and retries.
 *
 * Features:
 * - Email via SendGrid/Mailgun/SMTP
 * - SMS via Twilio
 * - Template rendering with user context
 * - Open/click/conversion tracking
 * - Automatic retries for failed sends
 * - Domain-specific branding
 */

const axios = require('axios');

class DripCampaignManager {
  constructor(db, options = {}) {
    this.db = db;

    // Email provider config
    this.emailProvider = options.emailProvider || process.env.EMAIL_PROVIDER || 'sendgrid';
    this.emailApiKey = options.emailApiKey || process.env.EMAIL_API_KEY;
    this.emailFromAddress = options.emailFromAddress || process.env.EMAIL_FROM_ADDRESS || 'noreply@calos.ai';
    this.emailFromName = options.emailFromName || process.env.EMAIL_FROM_NAME || 'CALOS Learning';

    // SMS provider config (Twilio)
    this.smsEnabled = options.smsEnabled || process.env.SMS_ENABLED === 'true';
    this.twilioAccountSid = options.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = options.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = options.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

    // Base URL for tracking links
    this.baseUrl = options.baseUrl || process.env.BASE_URL || 'http://localhost:5001';

    console.log(`[DripCampaignManager] Initialized (Email: ${this.emailProvider}, SMS: ${this.smsEnabled ? 'enabled' : 'disabled'})`);
  }

  /**
   * Process scheduled drip messages (run this via cron every minute)
   */
  async processPendingSends() {
    try {
      // Get all messages ready to send
      const result = await this.db.query(
        `SELECT
          ds.*,
          dm.message_subject,
          dm.message_body,
          dm.message_template,
          dc.channel,
          dc.campaign_name
        FROM drip_sends ds
        JOIN drip_messages dm ON ds.message_id = dm.message_id
        JOIN drip_campaigns dc ON ds.campaign_id = dc.campaign_id
        WHERE ds.status = 'scheduled'
          AND ds.send_at <= NOW()
        LIMIT 100`
      );

      console.log(`[DripCampaignManager] Processing ${result.rows.length} pending sends`);

      for (const send of result.rows) {
        try {
          await this.sendMessage(send);
        } catch (error) {
          console.error(`[DripCampaignManager] Failed to send message ${send.send_id}:`, error.message);

          // Mark as failed and schedule retry if attempts < 3
          await this.db.query(
            `UPDATE drip_sends
             SET status = CASE WHEN attempt_count < 3 THEN 'scheduled' ELSE 'failed' END,
                 attempt_count = attempt_count + 1,
                 send_at = CASE WHEN attempt_count < 3 THEN NOW() + INTERVAL '1 hour' ELSE send_at END,
                 error_message = $1
             WHERE send_id = $2`,
            [error.message, send.send_id]
          );
        }
      }

      return result.rows.length;
    } catch (error) {
      console.error('[DripCampaignManager] Process pending sends error:', error);
      throw error;
    }
  }

  /**
   * Send a single message (email or SMS)
   */
  async sendMessage(send) {
    try {
      // Get user info
      const userResult = await this.db.query(
        `SELECT user_id, email, phone_number, first_name, last_name
         FROM users
         WHERE user_id = $1`,
        [send.user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${send.user_id}`);
      }

      const user = userResult.rows[0];

      // Render template with context
      const context = {
        user: {
          id: user.user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        },
        campaign: {
          name: send.campaign_name
        },
        ...send.context // Additional context from trigger
      };

      const renderedSubject = this.renderTemplate(send.message_subject, context);
      const renderedBody = this.renderTemplate(send.message_body, context);

      // Add tracking links
      const trackedBody = this.addTrackingLinks(renderedBody, send.send_id);

      // Send via appropriate channel
      if (send.channel === 'email' || send.channel === 'both') {
        if (!user.email) {
          throw new Error('User has no email address');
        }
        await this.sendEmail(user.email, renderedSubject, trackedBody, context);
      }

      if (send.channel === 'sms' || send.channel === 'both') {
        if (!this.smsEnabled) {
          console.warn('[DripCampaignManager] SMS disabled, skipping SMS send');
        } else if (!user.phone_number) {
          console.warn('[DripCampaignManager] User has no phone number, skipping SMS');
        } else {
          await this.sendSMS(user.phone_number, renderedBody);
        }
      }

      // Mark as sent
      await this.db.query(
        `UPDATE drip_sends
         SET status = 'sent',
             sent_at = NOW()
         WHERE send_id = $1`,
        [send.send_id]
      );

      console.log(`[DripCampaignManager] Message sent to ${user.email || user.phone_number}`);
    } catch (error) {
      console.error('[DripCampaignManager] Send message error:', error);
      throw error;
    }
  }

  /**
   * Send email via configured provider
   */
  async sendEmail(toEmail, subject, htmlBody, context) {
    try {
      switch (this.emailProvider) {
        case 'sendgrid':
          await this.sendEmailViaSendGrid(toEmail, subject, htmlBody);
          break;

        case 'mailgun':
          await this.sendEmailViaMailgun(toEmail, subject, htmlBody);
          break;

        case 'smtp':
          await this.sendEmailViaSMTP(toEmail, subject, htmlBody);
          break;

        case 'console':
        default:
          // Dev mode - log to console
          console.log('\n' + '='.repeat(60));
          console.log(`[DripCampaignManager] EMAIL (${this.emailProvider})`);
          console.log('='.repeat(60));
          console.log(`To: ${toEmail}`);
          console.log(`Subject: ${subject}`);
          console.log(`Body:\n${htmlBody}`);
          console.log('='.repeat(60) + '\n');
          break;
      }
    } catch (error) {
      console.error('[DripCampaignManager] Send email error:', error);
      throw error;
    }
  }

  /**
   * Send email via SendGrid
   */
  async sendEmailViaSendGrid(toEmail, subject, htmlBody) {
    if (!this.emailApiKey) {
      throw new Error('SendGrid API key not configured');
    }

    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: this.emailFromAddress, name: this.emailFromName },
      subject,
      content: [{ type: 'text/html', value: htmlBody }]
    }, {
      headers: {
        'Authorization': `Bearer ${this.emailApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[DripCampaignManager] Email sent via SendGrid to ${toEmail}`);
  }

  /**
   * Send email via Mailgun
   */
  async sendEmailViaMailgun(toEmail, subject, htmlBody) {
    if (!this.emailApiKey) {
      throw new Error('Mailgun API key not configured');
    }

    const domain = process.env.MAILGUN_DOMAIN;
    if (!domain) {
      throw new Error('MAILGUN_DOMAIN not configured');
    }

    const formData = new URLSearchParams();
    formData.append('from', `${this.emailFromName} <${this.emailFromAddress}>`);
    formData.append('to', toEmail);
    formData.append('subject', subject);
    formData.append('html', htmlBody);

    const response = await axios.post(
      `https://api.mailgun.net/v3/${domain}/messages`,
      formData,
      {
        auth: {
          username: 'api',
          password: this.emailApiKey
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log(`[DripCampaignManager] Email sent via Mailgun to ${toEmail}`);
  }

  /**
   * Send email via SMTP (using nodemailer)
   */
  async sendEmailViaSMTP(toEmail, subject, htmlBody) {
    // TODO: Implement SMTP sending with nodemailer
    // For now, fallback to console logging
    console.warn('[DripCampaignManager] SMTP not implemented, logging to console');
    console.log(`EMAIL: ${toEmail} - ${subject}`);
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(toPhone, message) {
    if (!this.twilioAccountSid || !this.twilioAuthToken || !this.twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`,
        new URLSearchParams({
          To: toPhone,
          From: this.twilioPhoneNumber,
          Body: message
        }),
        {
          auth: {
            username: this.twilioAccountSid,
            password: this.twilioAuthToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log(`[DripCampaignManager] SMS sent via Twilio to ${toPhone}`);
    } catch (error) {
      console.error('[DripCampaignManager] Twilio SMS error:', error.response?.data || error.message);
      throw new Error(`SMS send failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Render template with variables
   * Supports {{variable}} syntax
   */
  renderTemplate(template, context) {
    if (!template) return '';

    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const keys = key.trim().split('.');
      let value = context;

      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }

      return value !== undefined ? value : match;
    });
  }

  /**
   * Add tracking links to message body
   * Replaces URLs with tracked versions
   */
  addTrackingLinks(body, sendId) {
    // Add open tracking pixel
    const trackingPixel = `<img src="${this.baseUrl}/api/drip/track/open/${sendId}" width="1" height="1" alt="" />`;

    // Replace links with tracked versions
    const trackedBody = body.replace(
      /<a\s+href="([^"]+)"/gi,
      (match, url) => {
        const trackUrl = `${this.baseUrl}/api/drip/track/click/${sendId}?url=${encodeURIComponent(url)}`;
        return `<a href="${trackUrl}"`;
      }
    );

    return trackedBody + trackingPixel;
  }

  /**
   * Track email open
   */
  async trackOpen(sendId) {
    try {
      await this.db.query(
        `UPDATE drip_sends
         SET opened_at = COALESCE(opened_at, NOW())
         WHERE send_id = $1`,
        [sendId]
      );

      console.log(`[DripCampaignManager] Email opened: ${sendId}`);
    } catch (error) {
      console.error('[DripCampaignManager] Track open error:', error);
    }
  }

  /**
   * Track link click
   */
  async trackClick(sendId, url) {
    try {
      await this.db.query(
        `UPDATE drip_sends
         SET clicked_at = COALESCE(clicked_at, NOW())
         WHERE send_id = $1`,
        [sendId]
      );

      console.log(`[DripCampaignManager] Link clicked in ${sendId}: ${url}`);

      return url; // Return original URL for redirect
    } catch (error) {
      console.error('[DripCampaignManager] Track click error:', error);
      return url; // Still return URL even if tracking fails
    }
  }

  /**
   * Track conversion (lesson completed, purchase, etc.)
   */
  async trackConversion(sendId) {
    try {
      await this.db.query(
        `UPDATE drip_sends
         SET converted_at = COALESCE(converted_at, NOW())
         WHERE send_id = $1`,
        [sendId]
      );

      console.log(`[DripCampaignManager] Conversion tracked: ${sendId}`);
    } catch (error) {
      console.error('[DripCampaignManager] Track conversion error:', error);
    }
  }

  /**
   * Get campaign analytics
   */
  async getCampaignAnalytics(campaignId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) AS total_sends,
          COUNT(sent_at) AS sent,
          COUNT(opened_at) AS opened,
          COUNT(clicked_at) AS clicked,
          COUNT(converted_at) AS converted,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed,
          ROUND(COUNT(opened_at)::NUMERIC / NULLIF(COUNT(sent_at), 0) * 100, 2) AS open_rate,
          ROUND(COUNT(clicked_at)::NUMERIC / NULLIF(COUNT(opened_at), 0) * 100, 2) AS click_rate,
          ROUND(COUNT(converted_at)::NUMERIC / NULLIF(COUNT(clicked_at), 0) * 100, 2) AS conversion_rate
        FROM drip_sends
        WHERE campaign_id = $1`,
        [campaignId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[DripCampaignManager] Get campaign analytics error:', error);
      throw error;
    }
  }

  /**
   * Create a new drip campaign
   */
  async createCampaign(campaignData) {
    try {
      const result = await this.db.query(
        `INSERT INTO drip_campaigns (
          campaign_name, description, trigger_event, channel,
          delay_minutes, path_id, active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          campaignData.name,
          campaignData.description,
          campaignData.triggerEvent,
          campaignData.channel || 'email',
          campaignData.delayMinutes || 0,
          campaignData.pathId || null,
          campaignData.active !== false,
        ]
      );

      console.log(`[DripCampaignManager] Campaign created: ${campaignData.name}`);
      return result.rows[0];
    } catch (error) {
      console.error('[DripCampaignManager] Create campaign error:', error);
      throw error;
    }
  }

  /**
   * Add message to campaign
   */
  async addMessageToCampaign(campaignId, messageData) {
    try {
      const result = await this.db.query(
        `INSERT INTO drip_messages (
          campaign_id, sequence_number, message_subject, message_body,
          message_template, delay_minutes, active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          campaignId,
          messageData.sequenceNumber,
          messageData.subject,
          messageData.body,
          messageData.template || null,
          messageData.delayMinutes || 0,
          messageData.active !== false
        ]
      );

      console.log(`[DripCampaignManager] Message added to campaign ${campaignId}`);
      return result.rows[0];
    } catch (error) {
      console.error('[DripCampaignManager] Add message error:', error);
      throw error;
    }
  }

  /**
   * Get user's send history
   */
  async getUserSendHistory(userId, limit = 20) {
    try {
      const result = await this.db.query(
        `SELECT
          ds.*,
          dm.message_subject,
          dc.campaign_name,
          dc.channel
        FROM drip_sends ds
        JOIN drip_messages dm ON ds.message_id = dm.message_id
        JOIN drip_campaigns dc ON ds.campaign_id = dc.campaign_id
        WHERE ds.user_id = $1
        ORDER BY ds.sent_at DESC NULLS LAST
        LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[DripCampaignManager] Get user send history error:', error);
      throw error;
    }
  }

  /**
   * Cancel scheduled send
   */
  async cancelScheduledSend(sendId) {
    try {
      await this.db.query(
        `UPDATE drip_sends
         SET status = 'cancelled'
         WHERE send_id = $1 AND status = 'scheduled'`,
        [sendId]
      );

      console.log(`[DripCampaignManager] Send cancelled: ${sendId}`);
    } catch (error) {
      console.error('[DripCampaignManager] Cancel send error:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from all campaigns
   */
  async unsubscribeUser(userId) {
    try {
      // Cancel all scheduled sends
      await this.db.query(
        `UPDATE drip_sends
         SET status = 'cancelled'
         WHERE user_id = $1 AND status = 'scheduled'`,
        [userId]
      );

      // Mark user as unsubscribed (assuming users table has this field)
      await this.db.query(
        `UPDATE users
         SET email_unsubscribed = true,
             email_unsubscribed_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      console.log(`[DripCampaignManager] User unsubscribed: ${userId}`);
    } catch (error) {
      console.error('[DripCampaignManager] Unsubscribe error:', error);
      throw error;
    }
  }
}

module.exports = DripCampaignManager;
