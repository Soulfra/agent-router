/**
 * QR Code Generator for Mobile Access
 *
 * Generates QR codes for easy mobile access to CalOS services.
 * Automatically detects local IP and creates scannable codes.
 *
 * Also supports:
 * - Voucher redemption (with affiliate tracking)
 * - Device pairing (with location/params)
 * - Payment receipts (with order tracking)
 * - Affiliate referral links (with UTM params)
 */

const QRCode = require('qrcode');
const crypto = require('crypto');
const os = require('os');

class QRGenerator {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://calos.ai';
    this.defaultSize = options.defaultSize || 300;
    this.port = options.port || 5001;
    this.serviceName = options.serviceName || 'CalOS OAuth';
  }

  /**
   * Get local network IP address
   * @returns {string} Local IP address (e.g., "192.168.1.87")
   */
  getLocalIP() {
    const interfaces = os.networkInterfaces();

    // Priority order: en0 (WiFi), en1 (Ethernet), other
    const priorityOrder = ['en0', 'en1'];

    for (const interfaceName of priorityOrder) {
      const iface = interfaces[interfaceName];
      if (iface) {
        for (const config of iface) {
          if (config.family === 'IPv4' && !config.internal) {
            return config.address;
          }
        }
      }
    }

    // Fallback: search all interfaces
    for (const interfaceName in interfaces) {
      const iface = interfaces[interfaceName];
      for (const config of iface) {
        if (config.family === 'IPv4' && !config.internal) {
          return config.address;
        }
      }
    }

    return 'localhost';
  }

  /**
   * Generate URL for local service
   * @param {string} path - Path to append (e.g., "/oauth-upload.html")
   * @returns {string} Full URL
   */
  generateLocalURL(path = '') {
    const ip = this.getLocalIP();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `http://${ip}:${this.port}${cleanPath}`;
  }

  /**
   * Generate QR code as terminal ASCII art
   * @param {string} url - URL to encode
   * @returns {Promise<string>} ASCII art QR code
   */
  async generateTerminal(url) {
    try {
      return await QRCode.toString(url, {
        type: 'terminal',
        small: true,
        errorCorrectionLevel: 'M'
      });
    } catch (err) {
      console.error('[QR Generator] Failed to generate terminal QR code:', err);
      return `[QR Code Error: ${err.message}]\nURL: ${url}`;
    }
  }

  /**
   * Display startup banner with QR code
   * @param {string} path - Service path
   */
  async displayStartupBanner(path = '/oauth-upload.html') {
    const url = this.generateLocalURL(path);
    const qrCode = await this.generateTerminal(url);
    const ip = this.getLocalIP();

    console.log('\n' + '='.repeat(60));
    console.log(`🚀 ${this.serviceName} - Server Started`);
    console.log('='.repeat(60));
    console.log('\n📱 Scan QR Code with your phone:\n');
    console.log(qrCode);
    console.log('\n🌐 Access URLs:');
    console.log(`   Local:    http://localhost:${this.port}${path}`);
    console.log(`   Network:  http://${ip}:${this.port}${path}`);
    console.log('\n💡 Features:');
    console.log('   • Upload OAuth screenshots');
    console.log('   • Auto-extract credentials');
    console.log('   • Generate narrated tutorials');
    console.log('   • Animated cursor tracking');
    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Get service info for API responses
   * @param {string} path - Service path
   * @returns {Object} Service info with URLs and network details
   */
  getServiceInfo(path = '/oauth-upload.html') {
    const ip = this.getLocalIP();
    const url = this.generateLocalURL(path);

    return {
      serviceName: this.serviceName,
      localURL: `http://localhost:${this.port}${path}`,
      networkURL: url,
      ip,
      port: this.port,
      hostname: os.hostname(),
      platform: os.platform(),
      wifi: ip !== 'localhost'
    };
  }

  /**
   * Generate QR code for voucher redemption
   *
   * @param {object} voucher - Voucher details
   * @param {string} affiliateCode - Affiliate who generated voucher
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateVoucherQR(voucher, affiliateCode = null) {
    const params = new URLSearchParams({
      code: voucher.code,
      type: 'voucher',
      amount: voucher.amount_cents || voucher.value_cents,
      ...(affiliateCode && { ref: affiliateCode }),
      ...(voucher.campaign && { campaign: voucher.campaign }),
      t: Date.now() // Timestamp for tracking
    });

    const url = `${this.baseUrl}/redeem?${params.toString()}`;

    return await this.generateQR(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }

  /**
   * Generate QR code for device pairing
   *
   * @param {string} pairingCode - 6-digit pairing code
   * @param {object} metadata - Additional tracking data
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateDevicePairingQR(pairingCode, metadata = {}) {
    const params = new URLSearchParams({
      code: pairingCode,
      type: 'device-pair',
      session: metadata.sessionId || crypto.randomBytes(8).toString('hex'),
      ...(metadata.location && { loc: metadata.location }),
      ...(metadata.deviceType && { device: metadata.deviceType }),
      t: Date.now()
    });

    const url = `${this.baseUrl}/pair?${params.toString()}`;

    return await this.generateQR(url, {
      errorCorrectionLevel: 'H', // High error correction for scanning
      margin: 2,
      width: 400 // Larger for easier scanning
    });
  }

  /**
   * Generate QR code for payment receipt
   *
   * @param {object} payment - Payment details
   * @param {string} userId - User who made payment
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateReceiptQR(payment, userId) {
    const receiptId = payment.payment_intent_id || payment.id;
    const params = new URLSearchParams({
      receipt: receiptId,
      type: 'receipt',
      user: userId,
      amount: payment.amount_cents || payment.amount,
      date: payment.created_at || new Date().toISOString(),
      t: Date.now()
    });

    const url = `${this.baseUrl}/receipt?${params.toString()}`;

    return await this.generateQR(url, {
      errorCorrectionLevel: 'M',
      margin: 2
    });
  }

  /**
   * Generate QR code for affiliate referral link
   *
   * @param {string} affiliateCode - Affiliate code (e.g., GOOGLE-PARTNER)
   * @param {object} campaign - Campaign details
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateAffiliateQR(affiliateCode, campaign = {}) {
    const params = new URLSearchParams({
      ref: affiliateCode,
      type: 'affiliate',
      utm_source: campaign.utm_source || 'qr',
      utm_medium: campaign.utm_medium || 'referral',
      utm_campaign: campaign.utm_campaign || affiliateCode.toLowerCase(),
      ...(campaign.landing && { landing: campaign.landing }),
      t: Date.now()
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    return await this.generateQR(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: campaign.brandColor || '#000000',
        light: '#FFFFFF'
      }
    });
  }

  /**
   * Generate QR code for generic tracking link
   *
   * @param {string} path - URL path (e.g., /signup, /pricing)
   * @param {object} trackingParams - Tracking parameters
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateTrackingQR(path, trackingParams = {}) {
    const params = new URLSearchParams({
      ...trackingParams,
      t: Date.now()
    });

    const url = `${this.baseUrl}${path}?${params.toString()}`;

    return await this.generateQR(url, {
      errorCorrectionLevel: 'M',
      margin: 2
    });
  }

  /**
   * Generate QR code from URL with options
   *
   * @param {string} url - URL to encode
   * @param {object} options - QR code options
   * @returns {Promise<string>} - Base64 data URL of QR code
   */
  async generateQR(url, options = {}) {
    try {
      const qrOptions = {
        type: 'image/png',
        width: options.width || this.defaultSize,
        errorCorrectionLevel: options.errorCorrectionLevel || 'M',
        margin: options.margin !== undefined ? options.margin : 4,
        color: {
          dark: options.color?.dark || '#000000',
          light: options.color?.light || '#FFFFFF'
        }
      };

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(url, qrOptions);

      return dataUrl;

    } catch (error) {
      console.error('[QRGenerator] Error generating QR code:', error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate QR code as buffer (for file storage)
   *
   * @param {string} url - URL to encode
   * @param {object} options - QR code options
   * @returns {Promise<Buffer>} - PNG buffer
   */
  async generateQRBuffer(url, options = {}) {
    try {
      const qrOptions = {
        type: 'png',
        width: options.width || this.defaultSize,
        errorCorrectionLevel: options.errorCorrectionLevel || 'M',
        margin: options.margin !== undefined ? options.margin : 4,
        color: {
          dark: options.color?.dark || '#000000',
          light: options.color?.light || '#FFFFFF'
        }
      };

      // Generate QR code as buffer
      const buffer = await QRCode.toBuffer(url, qrOptions);

      return buffer;

    } catch (error) {
      console.error('[QRGenerator] Error generating QR buffer:', error);
      throw new Error(`Failed to generate QR buffer: ${error.message}`);
    }
  }

  /**
   * Generate QR code with logo/brand overlay
   *
   * @param {string} url - URL to encode
   * @param {Buffer} logoBuffer - Logo image buffer
   * @param {object} options - QR code options
   * @returns {Promise<Buffer>} - PNG buffer with logo
   */
  async generateBrandedQR(url, logoBuffer, options = {}) {
    // This would require image manipulation library like 'sharp'
    // For now, return standard QR code
    // TODO: Implement logo overlay with sharp

    return await this.generateQRBuffer(url, options);
  }

  /**
   * Batch generate QR codes for vouchers
   *
   * @param {array} vouchers - Array of voucher codes
   * @param {string} affiliateCode - Affiliate who generated vouchers
   * @returns {Promise<array>} - Array of {code, qr} objects
   */
  async batchGenerateVoucherQRs(vouchers, affiliateCode = null) {
    const results = [];

    for (const voucher of vouchers) {
      try {
        const qr = await this.generateVoucherQR(voucher, affiliateCode);
        results.push({
          code: voucher.code,
          qr,
          url: `${this.baseUrl}/redeem?code=${voucher.code}${affiliateCode ? `&ref=${affiliateCode}` : ''}`
        });
      } catch (error) {
        console.error(`[QRGenerator] Error generating QR for ${voucher.code}:`, error);
        results.push({
          code: voucher.code,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Parse tracking parameters from QR code URL
   *
   * @param {string} url - QR code URL
   * @returns {object} - Parsed parameters
   */
  parseQRParams(url) {
    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams);

      return {
        type: params.type,
        code: params.code,
        ref: params.ref,
        utm_source: params.utm_source,
        utm_medium: params.utm_medium,
        utm_campaign: params.utm_campaign,
        timestamp: params.t,
        ...params
      };
    } catch (error) {
      console.error('[QRGenerator] Error parsing QR params:', error);
      return {};
    }
  }

  /**
   * Validate QR code parameters
   *
   * @param {object} params - Parameters to validate
   * @returns {object} - {valid: boolean, errors: []}
   */
  validateParams(params) {
    const errors = [];

    // Type validation
    const validTypes = ['voucher', 'device-pair', 'receipt', 'affiliate', 'tracking'];
    if (params.type && !validTypes.includes(params.type)) {
      errors.push(`Invalid type: ${params.type}`);
    }

    // Code format validation
    if (params.code && params.type === 'voucher') {
      // Voucher codes: CALOS-5USD-ABC123 or WELCOME-FREE
      if (!/^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/.test(params.code)) {
        errors.push('Invalid voucher code format');
      }
    }

    if (params.code && params.type === 'device-pair') {
      // Pairing codes: 6 alphanumeric characters
      if (!/^[A-Z0-9]{6}$/.test(params.code)) {
        errors.push('Invalid pairing code format');
      }
    }

    // Affiliate code validation
    if (params.ref) {
      // Affiliate codes: GOOGLE-PARTNER, ADOBE-RESELLER
      if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(params.ref)) {
        errors.push('Invalid affiliate code format');
      }
    }

    // Timestamp validation (not too old)
    if (params.t) {
      const timestamp = parseInt(params.t);
      const age = Date.now() - timestamp;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

      if (age > maxAge) {
        errors.push('QR code expired (> 30 days old)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = QRGenerator;
