/**
 * Free SMTP Adapter
 *
 * Supports multiple free SMTP services:
 * - Gmail SMTP (500 emails/day, free forever)
 * - Brevo (300 emails/day, free forever)
 * - MailerSend (3,000 emails/month, free forever)
 * - SMTP2GO (1,000 emails/month, free)
 * - Custom SMTP (bring your own)
 *
 * Why multiple providers?
 * - Hit daily limit on one? Switch to another
 * - Different providers have different strengths
 * - Redundancy (if one is down)
 * - Compare deliverability
 *
 * Usage:
 *   const smtp = new FreeSMTPAdapter({ provider: 'gmail' });
 *   await smtp.send({ from, to, subject, html });
 */

const nodemailer = require('nodemailer');

class FreeSMTPAdapter {
  constructor(config = {}) {
    this.provider = config.provider || process.env.FREE_SMTP_PROVIDER || 'gmail';

    // Gmail SMTP
    this.gmailUser = config.gmailUser || process.env.GMAIL_SMTP_USER;
    this.gmailPass = config.gmailPass || process.env.GMAIL_SMTP_PASS;
    this.gmailAppPassword = config.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;

    // Brevo SMTP
    this.brevoApiKey = config.brevoApiKey || process.env.BREVO_API_KEY;

    // MailerSend SMTP
    this.mailersendApiKey = config.mailersendApiKey || process.env.MAILERSEND_API_KEY;

    // SMTP2GO
    this.smtp2goApiKey = config.smtp2goApiKey || process.env.SMTP2GO_API_KEY;

    // Custom SMTP
    this.customHost = config.customHost || process.env.SMTP_HOST;
    this.customPort = config.customPort || process.env.SMTP_PORT || 587;
    this.customUser = config.customUser || process.env.SMTP_USER;
    this.customPass = config.customPass || process.env.SMTP_PASS;
    this.customSecure = config.customSecure !== undefined
      ? config.customSecure
      : (process.env.SMTP_SECURE === 'true');

    // Default from address
    this.defaultFrom = config.defaultFrom || process.env.EMAIL_FROM_ADDRESS || 'noreply@calos.ai';

    // Transporter cache
    this.transporter = null;

    console.log(`[FreeSMTPAdapter] Initialized (provider: ${this.provider})`);
  }

  /**
   * Get SMTP transporter for current provider
   *
   * @returns {Object} Nodemailer transporter
   */
  getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    let transport;

    switch (this.provider) {
      case 'gmail':
        transport = this.getGmailTransporter();
        break;

      case 'brevo':
        transport = this.getBrevoTransporter();
        break;

      case 'mailersend':
        transport = this.getMailerSendTransporter();
        break;

      case 'smtp2go':
        transport = this.getSMTP2GOTransporter();
        break;

      case 'custom':
        transport = this.getCustomTransporter();
        break;

      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }

    this.transporter = nodemailer.createTransporter(transport);

    return this.transporter;
  }

  /**
   * Gmail SMTP config
   * Limits: 500 emails/day
   *
   * Setup:
   * 1. Enable 2FA on your Gmail account
   * 2. Generate App Password: https://myaccount.google.com/apppasswords
   * 3. Use App Password (not your regular password)
   *
   * @private
   */
  getGmailTransporter() {
    if (!this.gmailUser || (!this.gmailPass && !this.gmailAppPassword)) {
      throw new Error('Gmail SMTP credentials not configured');
    }

    return {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: this.gmailUser,
        pass: this.gmailAppPassword || this.gmailPass
      }
    };
  }

  /**
   * Brevo (formerly Sendinblue) SMTP config
   * Limits: 300 emails/day
   *
   * Setup:
   * 1. Sign up at https://www.brevo.com
   * 2. Get SMTP key: Settings → SMTP & API → SMTP
   * 3. Use your Brevo login email as username
   *
   * @private
   */
  getBrevoTransporter() {
    if (!this.brevoApiKey) {
      throw new Error('Brevo SMTP credentials not configured');
    }

    return {
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: this.gmailUser || 'your-brevo-email@example.com',
        pass: this.brevoApiKey
      }
    };
  }

  /**
   * MailerSend SMTP config
   * Limits: 3,000 emails/month (free), 12,000/month (trial)
   *
   * Setup:
   * 1. Sign up at https://www.mailersend.com
   * 2. Verify your domain
   * 3. Get SMTP credentials: Settings → SMTP
   *
   * @private
   */
  getMailerSendTransporter() {
    if (!this.mailersendApiKey) {
      throw new Error('MailerSend SMTP credentials not configured');
    }

    return {
      host: 'smtp.mailersend.net',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: 'MS_XXXXXX', // Your MailerSend SMTP username
        pass: this.mailersendApiKey
      }
    };
  }

  /**
   * SMTP2GO config
   * Limits: 1,000 emails/month
   *
   * Setup:
   * 1. Sign up at https://www.smtp2go.com
   * 2. Get API key: Settings → API Keys
   * 3. Create SMTP user: Settings → SMTP Users
   *
   * @private
   */
  getSMTP2GOTransporter() {
    if (!this.smtp2goApiKey) {
      throw new Error('SMTP2GO credentials not configured');
    }

    return {
      host: 'mail.smtp2go.com',
      port: 2525, // Or 587, 80, 8025, 25
      secure: false,
      auth: {
        user: 'your-smtp2go-username',
        pass: this.smtp2goApiKey
      }
    };
  }

  /**
   * Custom SMTP config
   * Bring your own SMTP server
   *
   * @private
   */
  getCustomTransporter() {
    if (!this.customHost || !this.customUser || !this.customPass) {
      throw new Error('Custom SMTP credentials not configured');
    }

    return {
      host: this.customHost,
      port: this.customPort,
      secure: this.customSecure,
      auth: {
        user: this.customUser,
        pass: this.customPass
      }
    };
  }

  /**
   * Send email
   *
   * @param {Object} options - Email options
   * @returns {Object} Send result
   */
  async send(options) {
    try {
      const {
        from = this.defaultFrom,
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        headers = {}
      } = options;

      // Validate required fields
      if (!to) {
        throw new Error('Recipient (to) is required');
      }

      if (!subject) {
        throw new Error('Subject is required');
      }

      if (!text && !html) {
        throw new Error('Email body (text or html) is required');
      }

      // Get transporter
      const transporter = this.getTransporter();

      // Build email
      const mailOptions = {
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text: text || this.htmlToText(html),
        html: html || text,
        headers
      };

      if (cc) {
        mailOptions.cc = Array.isArray(cc) ? cc.join(', ') : cc;
      }

      if (bcc) {
        mailOptions.bcc = Array.isArray(bcc) ? bcc.join(', ') : bcc;
      }

      // Send email
      console.log(`[FreeSMTPAdapter] Sending email via ${this.provider}: ${from} → ${to}`);

      const info = await transporter.sendMail(mailOptions);

      console.log(`[FreeSMTPAdapter] Email sent successfully:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        provider: this.provider,
        response: info.response
      };

    } catch (error) {
      console.error('[FreeSMTPAdapter] Error sending email:', error);

      return {
        success: false,
        error: error.message,
        provider: this.provider
      };
    }
  }

  /**
   * Simple HTML to text conversion
   * Strips HTML tags, converts to plain text
   *
   * @param {string} html - HTML content
   * @returns {string} Plain text
   * @private
   */
  htmlToText(html) {
    if (!html) return '';

    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify SMTP connection
   *
   * @returns {boolean} Is connected
   */
  async verify() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();

      console.log(`[FreeSMTPAdapter] SMTP connection verified (${this.provider})`);

      return true;

    } catch (error) {
      console.error(`[FreeSMTPAdapter] SMTP verification failed (${this.provider}):`, error.message);

      return false;
    }
  }

  /**
   * Get provider limits
   *
   * @returns {Object} Provider limits
   */
  getLimits() {
    const limits = {
      gmail: {
        daily: 500,
        monthly: 15000,
        free: true,
        setup: 'App Password required'
      },
      brevo: {
        daily: 300,
        monthly: 9000,
        free: true,
        setup: 'API key required'
      },
      mailersend: {
        daily: 100,
        monthly: 3000,
        free: true,
        setup: 'Domain verification required'
      },
      smtp2go: {
        daily: 33,
        monthly: 1000,
        free: true,
        setup: 'API key required'
      },
      custom: {
        daily: '?',
        monthly: '?',
        free: '?',
        setup: 'SMTP credentials required'
      }
    };

    return limits[this.provider] || limits.custom;
  }

  /**
   * Test email send
   * Sends a test email to verify configuration
   *
   * @param {string} to - Test recipient
   * @returns {Object} Send result
   */
  async sendTest(to) {
    return await this.send({
      to,
      subject: 'CALOS Test Email',
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from CALOS Gmail Webhook system.</p>
        <p><strong>Provider:</strong> ${this.provider}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p>If you received this email, your SMTP configuration is working!</p>
      `,
      text: `Test Email

This is a test email from CALOS Gmail Webhook system.

Provider: ${this.provider}
Timestamp: ${new Date().toISOString()}

If you received this email, your SMTP configuration is working!`
    });
  }
}

/**
 * Factory function to create SMTP adapter
 *
 * @param {string} provider - Provider name
 * @param {Object} config - Configuration
 * @returns {FreeSMTPAdapter} SMTP adapter instance
 */
function createSMTPAdapter(provider, config = {}) {
  return new FreeSMTPAdapter({ ...config, provider });
}

module.exports = FreeSMTPAdapter;
module.exports.createSMTPAdapter = createSMTPAdapter;
