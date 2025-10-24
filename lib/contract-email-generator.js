/**
 * Contract Email Generator
 *
 * Generates beautiful HTML email receipts for signed contracts.
 * Integrates with Gmail Gateway for zero-cost email delivery.
 *
 * Features:
 * - HTML email templates with inline CSS
 * - Contract summary with costs breakdown
 * - Soulfra cryptographic proof
 * - Public share link with QR code
 * - PDF attachment (optional)
 * - Mobile-responsive design
 *
 * Integration:
 * - Gmail Gateway (lib/gmail-gateway.js) - Zero-cost email delivery
 * - Ollama Session Contract (lib/ollama-session-contract.js) - Contract data
 * - QR Generator (lib/qr-generator.js) - QR codes for verification
 */

const fs = require('fs').promises;
const path = require('path');
const GmailGateway = require('./gmail-gateway');
const QRGenerator = require('./qr-generator');

class ContractEmailGenerator {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // Gmail gateway for sending emails
    this.gmailGateway = new GmailGateway({
      db: this.db,
      verbose: this.verbose
    });

    // QR generator for verification codes
    this.qrGenerator = new QRGenerator();

    // Template cache
    this.templateCache = new Map();
  }

  // ============================================================================
  // EMAIL GENERATION
  // ============================================================================

  /**
   * Generate contract receipt email
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Email data
   */
  async generateContractReceipt(sessionId, options = {}) {
    try {
      const {
        includeQR = true,
        includePDF = false,
        customMessage = null
      } = options;

      // Get contract data
      const contractData = await this._getContractData(sessionId);

      // Generate QR code for verification
      let qrCodeDataUrl = null;
      if (includeQR) {
        const qrCode = await this.qrGenerator.generate({
          data: contractData.publicShareUrl,
          size: 200,
          format: 'data-url'
        });
        qrCodeDataUrl = qrCode;
      }

      // Load email template
      const template = await this._loadTemplate('contract-receipt');

      // Render template with data
      const html = this._renderTemplate(template, {
        ...contractData,
        qrCodeDataUrl,
        customMessage,
        baseUrl: process.env.BASE_URL || 'http://localhost:5001'
      });

      // Generate plain text version
      const text = this._generatePlainText(contractData);

      return {
        success: true,
        subject: `Contract Receipt: ${contractData.sessionName}`,
        html,
        text,
        attachments: includePDF ? [await this._generatePDFAttachment(sessionId)] : []
      };

    } catch (error) {
      console.error('[ContractEmailGenerator] Generate receipt error:', error.message);
      throw error;
    }
  }

  /**
   * Send contract receipt email
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Send result
   */
  async sendContractReceipt(sessionId, options = {}) {
    try {
      const {
        to,
        userId,
        includeQR = true,
        includePDF = false,
        customMessage = null
      } = options;

      // Generate email
      const emailData = await this.generateContractReceipt(sessionId, {
        includeQR,
        includePDF,
        customMessage
      });

      // Initialize Gmail gateway
      await this.gmailGateway.init();

      // Send via Gmail gateway
      const sendResult = await this.gmailGateway.send({
        userId,
        to,
        subject: emailData.subject,
        body: emailData.html,
        metadata: {
          type: 'contract_receipt',
          sessionId,
          timestamp: new Date().toISOString()
        }
      });

      this._log(`✅ Contract receipt sent to ${to}`);

      return {
        success: true,
        messageId: sendResult.messageId,
        to,
        sessionId
      };

    } catch (error) {
      console.error('[ContractEmailGenerator] Send receipt error:', error.message);
      throw error;
    }
  }

  /**
   * Send contract receipt to multiple recipients
   *
   * @param {string} sessionId - Session UUID
   * @param {Array<string>} recipients - Email addresses
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Send results
   */
  async sendContractReceiptBulk(sessionId, recipients, options = {}) {
    try {
      const results = [];

      for (const recipient of recipients) {
        try {
          const result = await this.sendContractReceipt(sessionId, {
            ...options,
            to: recipient
          });
          results.push({ recipient, success: true, ...result });
        } catch (error) {
          results.push({
            recipient,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      this._log(`📧 Sent ${successCount}/${recipients.length} contract receipts`);

      return {
        success: true,
        total: recipients.length,
        successful: successCount,
        failed: recipients.length - successCount,
        results
      };

    } catch (error) {
      console.error('[ContractEmailGenerator] Bulk send error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // CONTRACT DATA
  // ============================================================================

  /**
   * Get contract data for email
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Contract data
   */
  async _getContractData(sessionId) {
    try {
      // Get session
      const sessionResult = await this.db.query(`
        SELECT
          session_id,
          user_id,
          session_name,
          primary_model,
          status,
          contract_status,
          version,
          created_at,
          ended_at,
          total_cost_usd,
          approved_cost_usd,
          signed_at,
          soulfra_hash,
          soulfra_signed_at,
          public_share_url,
          is_immutable
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];

      // Verify signed
      if (session.contract_status !== 'signed' || !session.is_immutable) {
        throw new Error('Contract must be signed before sending receipt');
      }

      // Get message count
      const messagesResult = await this.db.query(`
        SELECT COUNT(*) as count
        FROM ollama_session_messages
        WHERE session_id = $1
      `, [sessionId]);

      const messageCount = parseInt(messagesResult.rows[0].count);

      // Get user email
      const userResult = await this.db.query(`
        SELECT email, full_name
        FROM users
        WHERE user_id = $1
      `, [session.user_id]);

      const user = userResult.rows[0] || {};

      return {
        sessionId: session.session_id,
        sessionName: session.session_name || 'Unnamed Session',
        primaryModel: session.primary_model,
        version: session.version,
        createdAt: session.created_at,
        endedAt: session.ended_at,
        signedAt: session.signed_at,
        totalCost: parseFloat(session.total_cost_usd || 0),
        approvedCost: parseFloat(session.approved_cost_usd || 0),
        messageCount,
        soulfraHash: session.soulfra_hash,
        publicShareUrl: session.public_share_url,
        isImmutable: session.is_immutable,
        userEmail: user.email,
        userName: user.full_name
      };

    } catch (error) {
      console.error('[ContractEmailGenerator] Get contract data error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // TEMPLATE RENDERING
  // ============================================================================

  /**
   * Load email template
   *
   * @param {string} templateName - Template name
   * @returns {Promise<string>} Template HTML
   */
  async _loadTemplate(templateName) {
    try {
      // Check cache
      if (this.templateCache.has(templateName)) {
        return this.templateCache.get(templateName);
      }

      // Load from file
      const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
      const template = await fs.readFile(templatePath, 'utf-8');

      // Cache template
      this.templateCache.set(templateName, template);

      return template;

    } catch (error) {
      // Template not found, use inline template
      this._log(`Template ${templateName} not found, using inline template`);
      return this._getInlineTemplate(templateName);
    }
  }

  /**
   * Get inline template (fallback)
   *
   * @param {string} templateName - Template name
   * @returns {string} Template HTML
   */
  _getInlineTemplate(templateName) {
    if (templateName === 'contract-receipt') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract Receipt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 32px; text-align: center; color: white;">
              <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">🔏 Contract Signed</h1>
              <p style="margin: 0; font-size: 16px; opacity: 0.9;">Your AI contract has been cryptographically signed</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #111827;">{{sessionName}}</h2>

              {{#customMessage}}
              <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
                <p style="margin: 0; color: #1e40af; font-size: 14px;">{{customMessage}}</p>
              </div>
              {{/customMessage}}

              <!-- Contract Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #6b7280; font-size: 14px;">Model:</strong>
                  </td>
                  <td align="right" style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">{{primaryModel}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #6b7280; font-size: 14px;">Messages:</strong>
                  </td>
                  <td align="right" style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">{{messageCount}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #6b7280; font-size: 14px;">Total Cost:</strong>
                  </td>
                  <td align="right" style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: #667eea; font-size: 20px; font-weight: 700;">\${{totalCost}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <strong style="color: #6b7280; font-size: 14px;">Signed At:</strong>
                  </td>
                  <td align="right" style="padding: 12px 0;">
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">{{signedAt}}</span>
                  </td>
                </tr>
              </table>

              <!-- Soulfra Hash -->
              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #111827;">Cryptographic Proof</h3>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; font-family: 'Courier New', monospace; word-break: break-all;">
                  <strong>SHA-256:</strong> {{soulfraHashSha256}}
                </p>
                <p style="margin: 0; font-size: 12px; color: #6b7280; font-family: 'Courier New', monospace; word-break: break-all;">
                  <strong>Ed25519:</strong> {{soulfraHashEd25519}}
                </p>
              </div>

              {{#qrCodeDataUrl}}
              <!-- QR Code -->
              <div style="text-align: center; padding: 24px; background: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                <img src="{{qrCodeDataUrl}}" alt="Verification QR Code" style="width: 200px; height: 200px; border-radius: 8px; background: white; padding: 16px;">
                <p style="margin: 12px 0 0 0; font-size: 14px; color: #6b7280;">Scan to verify contract</p>
              </div>
              {{/qrCodeDataUrl}}

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="{{baseUrl}}{{publicShareUrl}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  View Contract
                </a>
              </div>

              <!-- Footer Note -->
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                This contract is cryptographically signed and immutable. The signature can be verified at any time using the link above.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Built with ❤️ by CALOS</p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">DocuSign-like contracts • Soulfra cryptographic signing</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;
    }

    return '<html><body>Template not found</body></html>';
  }

  /**
   * Render template with data
   *
   * @param {string} template - Template HTML
   * @param {Object} data - Template data
   * @returns {string} Rendered HTML
   */
  _renderTemplate(template, data) {
    let html = template;

    // Simple mustache-style templating
    // Replace {{variable}}
    Object.keys(data).forEach(key => {
      const value = data[key];
      const regex = new RegExp(`{{${key}}}`, 'g');

      if (typeof value === 'object' && value !== null) {
        // Handle nested objects (e.g., soulfraHash)
        if (key === 'soulfraHash') {
          html = html.replace('{{soulfraHashSha256}}', value.sha256 || 'N/A');
          html = html.replace('{{soulfraHashEd25519}}', value.ed25519_signature?.substring(0, 64) + '...' || 'N/A');
        }
      } else {
        html = html.replace(regex, value || '');
      }
    });

    // Handle {{#variable}} sections (conditional)
    html = html.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (match, key, content) => {
      return data[key] ? content : '';
    });

    // Format dates
    html = html.replace('{{signedAt}}', new Date(data.signedAt).toLocaleString());
    html = html.replace('{{createdAt}}', new Date(data.createdAt).toLocaleString());

    // Format costs
    html = html.replace('{{totalCost}}', data.totalCost.toFixed(2));

    return html;
  }

  /**
   * Generate plain text version
   *
   * @param {Object} contractData - Contract data
   * @returns {string} Plain text
   */
  _generatePlainText(contractData) {
    return `
Contract Signed
================

${contractData.sessionName}

Contract Details:
- Model: ${contractData.primaryModel}
- Messages: ${contractData.messageCount}
- Total Cost: $${contractData.totalCost.toFixed(2)}
- Signed At: ${new Date(contractData.signedAt).toLocaleString()}

Cryptographic Proof:
- SHA-256: ${contractData.soulfraHash?.sha256 || 'N/A'}
- Ed25519: ${contractData.soulfraHash?.ed25519_signature || 'N/A'}

View Contract: ${process.env.BASE_URL || 'http://localhost:5001'}${contractData.publicShareUrl}

This contract is cryptographically signed and immutable.

---
Built with ❤️ by CALOS
DocuSign-like contracts • Soulfra cryptographic signing
    `.trim();
  }

  /**
   * Generate PDF attachment (stub)
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} PDF attachment
   */
  async _generatePDFAttachment(sessionId) {
    // TODO: Implement PDF generation using pdfkit or puppeteer
    this._log('PDF generation not yet implemented');
    return null;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[ContractEmailGenerator] ${message}`);
    }
  }
}

module.exports = ContractEmailGenerator;
