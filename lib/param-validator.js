/**
 * Parameter Validator
 *
 * Validates and sanitizes tracking parameters:
 * - UTM parameters (utm_source, utm_medium, utm_campaign)
 * - Referral codes (AFFILIATE-SOURCE-123)
 * - Cookie IDs (format validation)
 * - Device fingerprints (hash validation)
 * - Voucher codes (CALOS-5USD-ABC123)
 *
 * Ensures data quality for attribution tracking
 */

class ParamValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode !== false;

    // Valid UTM parameter values
    this.validUtmSources = [
      'google', 'facebook', 'twitter', 'linkedin', 'instagram',
      'youtube', 'tiktok', 'reddit', 'email', 'sms', 'qr',
      'direct', 'referral', 'organic', 'paid', 'affiliate'
    ];

    this.validUtmMediums = [
      'cpc', 'cpm', 'display', 'email', 'social', 'referral',
      'organic', 'paid', 'affiliate', 'qr', 'sms', 'banner',
      'video', 'native', 'push', 'inapp'
    ];

    // Regex patterns
    this.patterns = {
      affiliateCode: /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/,
      voucherCode: /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/,
      deviceFingerprint: /^[a-f0-9]{64}$/i, // SHA-256 hash
      cookieId: /^[a-zA-Z0-9_-]{20,128}$/,
      handle: /^[a-z0-9_]{3,30}$/i,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      url: /^https?:\/\/.+/i
    };
  }

  /**
   * Validate all tracking parameters
   *
   * @param {object} params - Parameters to validate
   * @returns {object} - {valid: boolean, errors: [], sanitized: {}}
   */
  validateAll(params) {
    const errors = [];
    const sanitized = {};

    // Validate UTM parameters
    if (params.utm_source) {
      const utmSource = this.validateUtmSource(params.utm_source);
      if (utmSource.valid) {
        sanitized.utm_source = utmSource.value;
      } else {
        errors.push(...utmSource.errors);
      }
    }

    if (params.utm_medium) {
      const utmMedium = this.validateUtmMedium(params.utm_medium);
      if (utmMedium.valid) {
        sanitized.utm_medium = utmMedium.value;
      } else {
        errors.push(...utmMedium.errors);
      }
    }

    if (params.utm_campaign) {
      const utmCampaign = this.validateUtmCampaign(params.utm_campaign);
      if (utmCampaign.valid) {
        sanitized.utm_campaign = utmCampaign.value;
      } else {
        errors.push(...utmCampaign.errors);
      }
    }

    // Validate affiliate/referral code
    if (params.ref || params.affiliate_code) {
      const affiliateCode = this.validateAffiliateCode(params.ref || params.affiliate_code);
      if (affiliateCode.valid) {
        sanitized.affiliate_code = affiliateCode.value;
      } else {
        errors.push(...affiliateCode.errors);
      }
    }

    // Validate voucher code
    if (params.code || params.voucher_code) {
      const voucherCode = this.validateVoucherCode(params.code || params.voucher_code);
      if (voucherCode.valid) {
        sanitized.voucher_code = voucherCode.value;
      } else {
        errors.push(...voucherCode.errors);
      }
    }

    // Validate cookie ID
    if (params.cookie_id || params._ga) {
      const cookieId = this.validateCookieId(params.cookie_id || params._ga);
      if (cookieId.valid) {
        sanitized.cookie_id = cookieId.value;
      } else {
        errors.push(...cookieId.errors);
      }
    }

    // Validate device fingerprint
    if (params.device_fingerprint || params.fingerprint) {
      const fingerprint = this.validateDeviceFingerprint(params.device_fingerprint || params.fingerprint);
      if (fingerprint.valid) {
        sanitized.device_fingerprint = fingerprint.value;
      } else {
        errors.push(...fingerprint.errors);
      }
    }

    // Validate vanity handle
    if (params.handle || params.username) {
      const handle = this.validateHandle(params.handle || params.username);
      if (handle.valid) {
        sanitized.handle = handle.value;
      } else {
        errors.push(...handle.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized
    };
  }

  /**
   * Validate UTM source
   */
  validateUtmSource(source) {
    const normalized = source.toLowerCase().trim();

    if (normalized.length === 0) {
      return { valid: false, errors: ['utm_source cannot be empty'] };
    }

    if (normalized.length > 100) {
      return { valid: false, errors: ['utm_source too long (max 100 chars)'] };
    }

    // In strict mode, only allow known sources
    if (this.strictMode && !this.validUtmSources.includes(normalized)) {
      return {
        valid: false,
        errors: [`utm_source '${source}' not in allowed list`]
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate UTM medium
   */
  validateUtmMedium(medium) {
    const normalized = medium.toLowerCase().trim();

    if (normalized.length === 0) {
      return { valid: false, errors: ['utm_medium cannot be empty'] };
    }

    if (normalized.length > 100) {
      return { valid: false, errors: ['utm_medium too long (max 100 chars)'] };
    }

    // In strict mode, only allow known mediums
    if (this.strictMode && !this.validUtmMediums.includes(normalized)) {
      return {
        valid: false,
        errors: [`utm_medium '${medium}' not in allowed list`]
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate UTM campaign
   */
  validateUtmCampaign(campaign) {
    const normalized = campaign.toLowerCase().trim();

    if (normalized.length === 0) {
      return { valid: false, errors: ['utm_campaign cannot be empty'] };
    }

    if (normalized.length > 200) {
      return { valid: false, errors: ['utm_campaign too long (max 200 chars)'] };
    }

    // Allow alphanumeric, hyphens, underscores
    if (!/^[a-z0-9_-]+$/i.test(normalized)) {
      return {
        valid: false,
        errors: ['utm_campaign contains invalid characters (use a-z, 0-9, -, _)']
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate affiliate/referral code
   * Format: GOOGLE-PARTNER, ADOBE-RESELLER-Q1
   */
  validateAffiliateCode(code) {
    const normalized = code.toUpperCase().trim();

    if (!this.patterns.affiliateCode.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid affiliate code format (expected: SOURCE-TYPE or SOURCE-TYPE-ID)']
      };
    }

    if (normalized.length > 50) {
      return { valid: false, errors: ['Affiliate code too long (max 50 chars)'] };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate voucher code
   * Format: CALOS-5USD-ABC123, WELCOME-FREE
   */
  validateVoucherCode(code) {
    const normalized = code.toUpperCase().trim();

    if (!this.patterns.voucherCode.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid voucher code format (expected: PREFIX-VALUE or PREFIX-VALUE-ID)']
      };
    }

    if (normalized.length > 50) {
      return { valid: false, errors: ['Voucher code too long (max 50 chars)'] };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate cookie ID
   */
  validateCookieId(cookieId) {
    const normalized = cookieId.trim();

    if (!this.patterns.cookieId.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid cookie ID format (expected: 20-128 alphanumeric characters)']
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate device fingerprint (SHA-256 hash)
   */
  validateDeviceFingerprint(fingerprint) {
    const normalized = fingerprint.toLowerCase().trim();

    if (!this.patterns.deviceFingerprint.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid device fingerprint (expected: 64-character hex hash)']
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate vanity handle (@username)
   */
  validateHandle(handle) {
    const normalized = handle.toLowerCase().replace(/^@/, '').trim();

    if (!this.patterns.handle.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid handle (3-30 chars, a-z, 0-9, underscore only)']
      };
    }

    // Check reserved handles
    const reserved = ['admin', 'root', 'system', 'calos', 'api', 'www', 'mail'];
    if (reserved.includes(normalized)) {
      return {
        valid: false,
        errors: [`Handle '${normalized}' is reserved`]
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate UUID
   */
  validateUUID(uuid) {
    const normalized = uuid.toLowerCase().trim();

    if (!this.patterns.uuid.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid UUID format']
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate email
   */
  validateEmail(email) {
    const normalized = email.toLowerCase().trim();

    if (!this.patterns.email.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid email format']
      };
    }

    if (normalized.length > 255) {
      return { valid: false, errors: ['Email too long (max 255 chars)'] };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate URL
   */
  validateURL(url) {
    const normalized = url.trim();

    if (!this.patterns.url.test(normalized)) {
      return {
        valid: false,
        errors: ['Invalid URL format (must start with http:// or https://)']
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Sanitize query parameters from URL
   *
   * @param {string} url - URL with query params
   * @returns {object} - Sanitized params
   */
  sanitizeURLParams(url) {
    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams);

      return this.validateAll(params);

    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid URL'],
        sanitized: {}
      };
    }
  }

  /**
   * Build tracking URL with validated params
   *
   * @param {string} baseUrl - Base URL
   * @param {object} params - Tracking parameters
   * @returns {string} - URL with validated params
   */
  buildTrackingURL(baseUrl, params) {
    const validation = this.validateAll(params);

    if (!validation.valid) {
      throw new Error(`Invalid tracking params: ${validation.errors.join(', ')}`);
    }

    const url = new URL(baseUrl);

    for (const [key, value] of Object.entries(validation.sanitized)) {
      url.searchParams.set(key, value);
    }

    // Add timestamp
    url.searchParams.set('t', Date.now());

    return url.toString();
  }
}

module.exports = ParamValidator;
