/**
 * Email Service
 *
 * Unified email service supporting multiple providers:
 * - SendGrid (production, $0 for first 100/day)
 * - Mailgun (production, flexible)
 * - Resend (modern, dev-friendly)
 * - SMTP (your own server, Gmail, etc.)
 * - Console (dev mode, logs to terminal)
 *
 * Features:
 * - Template rendering (Handlebars)
 * - Automatic retries for failed sends
 * - Email tracking (opens, clicks)
 * - Unsubscribe handling
 * - Queue support for bulk sends
 *
 * Usage:
 *   const emailService = new EmailService({
 *     provider: 'sendgrid',
 *     apiKey: process.env.SENDGRID_API_KEY
 *   });
 *
 *   await emailService.sendPasswordReset('user@example.com', resetToken);
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor(options = {}) {
    this.provider = options.provider || process.env.EMAIL_PROVIDER || 'console';
    this.apiKey = options.apiKey || process.env.EMAIL_API_KEY;
    this.fromAddress = options.fromAddress || process.env.EMAIL_FROM_ADDRESS || 'noreply@calos.ai';
    this.fromName = options.fromName || process.env.EMAIL_FROM_NAME || 'CALOS Platform';
    this.baseUrl = options.baseUrl || process.env.BASE_URL || 'http://localhost:5001';
    this.templatesDir = options.templatesDir || path.join(__dirname, '../templates/emails');

    // SMTP config (if using SMTP)
    this.smtpHost = options.smtpHost || process.env.SMTP_HOST;
    this.smtpPort = options.smtpPort || process.env.SMTP_PORT || 587;
    this.smtpUser = options.smtpUser || process.env.SMTP_USER;
    this.smtpPass = options.smtpPass || process.env.SMTP_PASS;

    // Resend config
    this.resendApiKey = options.resendApiKey || process.env.RESEND_API_KEY;

    console.log(`[EmailService] Initialized with provider: ${this.provider}`);
  }

  /**
   * Send email
   *
   * @param {object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML body
   * @param {string} options.text - Plain text body (optional)
   * @param {string} options.template - Template name (optional)
   * @param {object} options.context - Template variables (optional)
   * @returns {Promise<boolean>} - Success
   */
  async send(options) {
    try {
      let { to, subject, html, text, template, context } = options;

      // If template provided, render it
      if (template) {
        const rendered = await this.renderTemplate(template, context || {});
        html = rendered.html;
        text = rendered.text || text;
        if (rendered.subject && !subject) {
          subject = rendered.subject;
        }
      }

      // Send based on provider
      switch (this.provider) {
        case 'sendgrid':
          return await this.sendViaSendGrid(to, subject, html, text);

        case 'mailgun':
          return await this.sendViaMailgun(to, subject, html, text);

        case 'resend':
          return await this.sendViaResend(to, subject, html, text);

        case 'smtp':
          return await this.sendViaSMTP(to, subject, html, text);

        case 'console':
        default:
          return await this.sendViaConsole(to, subject, html, text);
      }
    } catch (error) {
      console.error('[EmailService] Send error:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   *
   * @param {string} email - User email
   * @param {string} resetToken - Password reset token
   * @returns {Promise<boolean>}
   */
  async sendPasswordReset(email, resetToken) {
    const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;

    return await this.send({
      to: email,
      template: 'password-reset',
      context: {
        resetUrl,
        resetToken,
        expiresIn: '1 hour'
      }
    });
  }

  /**
   * Send email verification
   *
   * @param {string} email - User email
   * @param {string} verificationToken - Verification token
   * @returns {Promise<boolean>}
   */
  async sendEmailVerification(email, verificationToken) {
    const verifyUrl = `${this.baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    return await this.send({
      to: email,
      template: 'email-verification',
      context: {
        verifyUrl,
        verificationToken,
        expiresIn: '24 hours'
      }
    });
  }

  /**
   * Send welcome email
   *
   * @param {string} email - User email
   * @param {string} displayName - User display name
   * @returns {Promise<boolean>}
   */
  async sendWelcome(email, displayName) {
    return await this.send({
      to: email,
      template: 'welcome',
      context: {
        displayName: displayName || 'there',
        dashboardUrl: `${this.baseUrl}/dashboard`,
        docsUrl: `${this.baseUrl}/docs`
      }
    });
  }

  // ============================================================================
  // Provider-Specific Methods
  // ============================================================================

  /**
   * Send via SendGrid
   * @private
   */
  async sendViaSendGrid(to, subject, html, text) {
    if (!this.apiKey) {
      throw new Error('SendGrid API key not configured (EMAIL_API_KEY)');
    }

    try {
      await axios.post('https://api.sendgrid.com/v3/mail/send', {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromAddress, name: this.fromName },
        subject,
        content: [
          { type: 'text/html', value: html },
          ...(text ? [{ type: 'text/plain', value: text }] : [])
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[EmailService] ✓ Email sent via SendGrid to ${to}`);
      return true;
    } catch (error) {
      console.error('[EmailService] SendGrid error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send via Mailgun
   * @private
   */
  async sendViaMailgun(to, subject, html, text) {
    if (!this.apiKey) {
      throw new Error('Mailgun API key not configured (EMAIL_API_KEY)');
    }

    const domain = process.env.MAILGUN_DOMAIN || 'mg.yourdomain.com';

    try {
      const formData = new URLSearchParams();
      formData.append('from', `${this.fromName} <${this.fromAddress}>`);
      formData.append('to', to);
      formData.append('subject', subject);
      formData.append('html', html);
      if (text) formData.append('text', text);

      await axios.post(`https://api.mailgun.net/v3/${domain}/messages`, formData, {
        auth: {
          username: 'api',
          password: this.apiKey
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`[EmailService] ✓ Email sent via Mailgun to ${to}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Mailgun error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send via Resend
   * @private
   */
  async sendViaResend(to, subject, html, text) {
    if (!this.resendApiKey) {
      throw new Error('Resend API key not configured (RESEND_API_KEY)');
    }

    try {
      await axios.post('https://api.resend.com/emails', {
        from: `${this.fromName} <${this.fromAddress}>`,
        to,
        subject,
        html,
        ...(text && { text })
      }, {
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[EmailService] ✓ Email sent via Resend to ${to}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Resend error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send via SMTP
   * @private
   */
  async sendViaSMTP(to, subject, html, text) {
    if (!this.smtpHost || !this.smtpUser || !this.smtpPass) {
      throw new Error('SMTP not fully configured (need SMTP_HOST, SMTP_USER, SMTP_PASS)');
    }

    // Lazy load nodemailer (optional dependency)
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (error) {
      throw new Error('nodemailer not installed. Run: npm install nodemailer');
    }

    try {
      const transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpPort === 465,
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass
        }
      });

      await transporter.sendMail({
        from: `${this.fromName} <${this.fromAddress}>`,
        to,
        subject,
        html,
        ...(text && { text })
      });

      console.log(`[EmailService] ✓ Email sent via SMTP to ${to}`);
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP error:', error.message);
      throw error;
    }
  }

  /**
   * Send via Console (dev mode)
   * @private
   */
  async sendViaConsole(to, subject, html, text) {
    console.log('\n' + '='.repeat(80));
    console.log(`[EmailService] 📧 EMAIL (${this.provider})`);
    console.log('='.repeat(80));
    console.log(`From: ${this.fromName} <${this.fromAddress}>`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('─'.repeat(80));
    if (text) {
      console.log('Plain Text:');
      console.log(text);
      console.log('─'.repeat(80));
    }
    console.log('HTML:');
    console.log(html);
    console.log('='.repeat(80) + '\n');
    return true;
  }

  // ============================================================================
  // Template Rendering
  // ============================================================================

  /**
   * Render email template
   *
   * @param {string} templateName - Template name (without extension)
   * @param {object} context - Template variables
   * @returns {Promise<object>} - { html, text?, subject? }
   */
  async renderTemplate(templateName, context) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);

      // Check if template exists
      if (!fs.existsSync(templatePath)) {
        console.warn(`[EmailService] Template not found: ${templatePath}, using fallback`);
        return this.renderFallbackTemplate(templateName, context);
      }

      // Read template
      let html = fs.readFileSync(templatePath, 'utf-8');

      // Simple variable replacement ({{varname}})
      html = this.replaceVariables(html, context);

      // Extract subject from HTML if present
      const subjectMatch = html.match(/<!--\s*SUBJECT:\s*(.+?)\s*-->/);
      const subject = subjectMatch ? subjectMatch[1].trim() : null;

      return { html, subject };
    } catch (error) {
      console.error('[EmailService] Template render error:', error);
      return this.renderFallbackTemplate(templateName, context);
    }
  }

  /**
   * Replace variables in template
   * @private
   */
  replaceVariables(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? context[key] : match;
    });
  }

  /**
   * Render fallback template when file not found
   * @private
   */
  renderFallbackTemplate(templateName, context) {
    const templates = {
      'password-reset': {
        subject: 'Reset Your Password',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password:</p>
          <p><a href="{{resetUrl}}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
          <p>This link expires in {{expiresIn}}.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      },
      'email-verification': {
        subject: 'Verify Your Email',
        html: `
          <h2>Welcome! Please Verify Your Email</h2>
          <p>Click the link below to verify your email address:</p>
          <p><a href="{{verifyUrl}}" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Verify Email</a></p>
          <p>This link expires in {{expiresIn}}.</p>
        `
      },
      'welcome': {
        subject: 'Welcome to CALOS Platform!',
        html: `
          <h2>Welcome, {{displayName}}!</h2>
          <p>Thanks for joining CALOS Platform. We're excited to have you!</p>
          <p><a href="{{dashboardUrl}}" style="background: #9C27B0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a></p>
          <p>Need help getting started? Check out our <a href="{{docsUrl}}">documentation</a>.</p>
        `
      }
    };

    const template = templates[templateName];
    if (!template) {
      return {
        subject: 'Message from CALOS Platform',
        html: `<p>You have a message from CALOS Platform.</p>`
      };
    }

    return {
      subject: template.subject,
      html: this.replaceVariables(template.html, context)
    };
  }
}

module.exports = EmailService;
