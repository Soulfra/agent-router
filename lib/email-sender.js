/**
 * Email Sender - Universal email system with multiple provider support
 *
 * Supports:
 * - SendGrid (recommended for transactional emails)
 * - Mailgun (good for bulk + transactional)
 * - Postmark (fastest delivery, great for receipts)
 * - AWS SES (cheapest for high volume)
 * - SMTP (fallback for any provider)
 *
 * Usage:
 *   const emailSender = new EmailSender();
 *   await emailSender.sendPaymentConfirmation(email, details);
 */

const nodemailer = require('nodemailer');

class EmailSender {
  constructor(options = {}) {
    this.provider = options.provider || process.env.EMAIL_PROVIDER || 'sendgrid';
    this.fromEmail = options.fromEmail || process.env.EMAIL_FROM || 'noreply@calos.app';
    this.fromName = options.fromName || process.env.EMAIL_FROM_NAME || 'CalOS Platform';

    // Initialize provider-specific client
    this.initializeProvider();
  }

  /**
   * Initialize email provider
   */
  initializeProvider() {
    switch (this.provider.toLowerCase()) {
      case 'sendgrid':
        this.client = require('@sendgrid/mail');
        const sendgridKey = process.env.SENDGRID_API_KEY;
        if (sendgridKey) {
          this.client.setApiKey(sendgridKey);
          console.log('[Email] ✓ SendGrid initialized');
        } else {
          console.warn('[Email] ⚠️  SENDGRID_API_KEY not set');
        }
        break;

      case 'mailgun':
        const mailgunKey = process.env.MAILGUN_API_KEY;
        const mailgunDomain = process.env.MAILGUN_DOMAIN;
        if (mailgunKey && mailgunDomain) {
          const Mailgun = require('mailgun.js');
          const formData = require('form-data');
          const mailgun = new Mailgun(formData);
          this.client = mailgun.client({
            username: 'api',
            key: mailgunKey
          });
          this.mailgunDomain = mailgunDomain;
          console.log('[Email] ✓ Mailgun initialized');
        } else {
          console.warn('[Email] ⚠️  MAILGUN_API_KEY or MAILGUN_DOMAIN not set');
        }
        break;

      case 'postmark':
        const postmarkKey = process.env.POSTMARK_SERVER_TOKEN;
        if (postmarkKey) {
          const postmark = require('postmark');
          this.client = new postmark.ServerClient(postmarkKey);
          console.log('[Email] ✓ Postmark initialized');
        } else {
          console.warn('[Email] ⚠️  POSTMARK_SERVER_TOKEN not set');
        }
        break;

      case 'smtp':
      default:
        // Generic SMTP (works with any provider)
        this.client = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        console.log('[Email] ✓ SMTP transport initialized');
        break;
    }
  }

  /**
   * Send email (provider-agnostic)
   */
  async send({ to, subject, html, text, attachments = [] }) {
    if (!this.client) {
      console.error('[Email] No email client configured');
      return { success: false, error: 'Email client not configured' };
    }

    try {
      const from = `${this.fromName} <${this.fromEmail}>`;

      switch (this.provider.toLowerCase()) {
        case 'sendgrid':
          await this.client.send({
            to,
            from,
            subject,
            text: text || this.htmlToText(html),
            html,
            attachments: attachments.map(att => ({
              content: att.content,
              filename: att.filename,
              type: att.type,
              disposition: 'attachment'
            }))
          });
          break;

        case 'mailgun':
          await this.client.messages.create(this.mailgunDomain, {
            from,
            to,
            subject,
            text: text || this.htmlToText(html),
            html,
            attachment: attachments.map(att => ({
              data: Buffer.from(att.content, 'base64'),
              filename: att.filename
            }))
          });
          break;

        case 'postmark':
          await this.client.sendEmail({
            From: from,
            To: to,
            Subject: subject,
            TextBody: text || this.htmlToText(html),
            HtmlBody: html,
            Attachments: attachments.map(att => ({
              Name: att.filename,
              Content: att.content,
              ContentType: att.type
            }))
          });
          break;

        case 'smtp':
        default:
          await this.client.sendMail({
            from,
            to,
            subject,
            text: text || this.htmlToText(html),
            html,
            attachments: attachments.map(att => ({
              filename: att.filename,
              content: Buffer.from(att.content, 'base64'),
              contentType: att.type
            }))
          });
          break;
      }

      console.log(`[Email] ✓ Sent to ${to}: "${subject}"`);
      return { success: true };

    } catch (error) {
      console.error(`[Email] ✗ Failed to send to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(email, details) {
    const { amount, currency = 'USD', plan, invoiceUrl } = details;
    const amountFormatted = (amount / 100).toFixed(2);

    const subject = `Payment Received - $${amountFormatted} ${currency}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0080ff, #00ff88); padding: 30px; text-align: center; color: white; }
          .content { background: #f5f5f5; padding: 30px; }
          .amount { font-size: 36px; font-weight: bold; color: #00ff88; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #0080ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Received! 🎉</h1>
            <p class="amount">$${amountFormatted} ${currency}</p>
          </div>
          <div class="content">
            <h2>Thank you for your payment</h2>
            <p>Your payment has been successfully processed.</p>

            <div class="details">
              <strong>Payment Details:</strong><br>
              Amount: $${amountFormatted} ${currency}<br>
              ${plan ? `Plan: ${plan}<br>` : ''}
              Date: ${new Date().toLocaleDateString()}<br>
            </div>

            ${invoiceUrl ? `<a href="${invoiceUrl}" class="button">Download Receipt</a>` : ''}
            <a href="https://calos.app/dashboard" class="button">Go to Dashboard</a>
          </div>
          <div class="footer">
            <p>CalOS Platform | Questions? Reply to this email</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.send({ to: email, subject, html });
  }

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(email, details) {
    const { plan, price, billingPeriod = 'month', nextBillingDate } = details;

    const subject = `Welcome to CalOS ${plan}! 🚀`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0080ff, #00ff88); padding: 30px; text-align: center; color: white; }
          .content { background: #f5f5f5; padding: 30px; }
          .plan-badge { display: inline-block; background: #00ff88; color: #000; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
          .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .feature { padding: 10px 0; border-bottom: 1px solid #eee; }
          .feature:last-child { border-bottom: none; }
          .button { display: inline-block; background: #0080ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${plan}! 🚀</h1>
            <p>Your subscription is now active</p>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>You're all set! Your <span class="plan-badge">${plan}</span> subscription is now active.</p>

            <div class="features">
              <strong>What's Included:</strong>
              <div class="feature">✅ OAuth documentation tutorials</div>
              <div class="feature">✅ Screenshot annotation tools</div>
              <div class="feature">✅ Video/GIF generation</div>
              <div class="feature">✅ Premium API access</div>
              <div class="feature">✅ Priority support</div>
            </div>

            <p><strong>Billing:</strong> $${price}/${billingPeriod}</p>
            ${nextBillingDate ? `<p>Next billing date: ${nextBillingDate}</p>` : ''}

            <a href="https://calos.app/dashboard" class="button">Access Dashboard</a>
            <a href="https://calos.app/docs" class="button">View Documentation</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.send({ to: email, subject, html });
  }

  /**
   * Send credit purchase confirmation
   */
  async sendCreditPurchase(email, details) {
    const { amount, credits, bonus = 0 } = details;
    const totalCredits = credits + bonus;

    const subject = `${totalCredits} Credits Added to Your Account`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0080ff, #00ff88); padding: 30px; text-align: center; color: white; }
          .credits { font-size: 48px; font-weight: bold; }
          .bonus { color: #00ff88; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Credits Purchased! 💰</h1>
            <p class="credits">${credits} credits</p>
            ${bonus > 0 ? `<p class="bonus">+ ${bonus} bonus credits</p>` : ''}
          </div>
          <div class="content">
            <p>Your account has been credited with <strong>${totalCredits} credits</strong>.</p>
            <p>Amount charged: $${(amount / 100).toFixed(2)}</p>
            <a href="https://calos.app/dashboard" class="button">View Balance</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.send({ to: email, subject, html });
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailed(email, details) {
    const { reason, retryUrl } = details;

    const subject = 'Payment Failed - Action Required';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff4444; padding: 30px; text-align: center; color: white; }
          .button { display: inline-block; background: #0080ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Failed</h1>
          </div>
          <div class="content">
            <p>We were unable to process your payment.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            <p>Please update your payment method to continue your subscription.</p>
            ${retryUrl ? `<a href="${retryUrl}" class="button">Update Payment Method</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;

    return this.send({ to: email, subject, html });
  }

  /**
   * Strip HTML tags for plaintext fallback
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}

module.exports = EmailSender;
