/**
 * Telemetry Obfuscator
 *
 * Anonymizes telemetry data before sending to CALOS servers.
 *
 * Model: VS Code / Google Analytics / GitHub Telemetry
 *
 * What We Obfuscate:
 * - User IDs → SHA-256 hash
 * - Email addresses → Removed
 * - Names → Removed
 * - IP addresses → Country-level only
 * - URLs → Parameterized (`/users/123` → `/users/:id`)
 * - Custom data → Hash sensitive fields
 *
 * What We Keep:
 * - Install ID (already anonymous)
 * - Feature usage (counts, not details)
 * - Performance metrics (response times, error rates)
 * - Geographic region (country-level)
 * - Error types (not error messages with PII)
 *
 * Privacy Principles:
 * 1. No PII (personally identifiable information)
 * 2. No transaction amounts or customer data
 * 3. No QuickBooks data
 * 4. No card numbers (we never see them anyway)
 * 5. Aggregate data only
 */

const crypto = require('crypto');

class TelemetryObfuscator {
  constructor(options = {}) {
    // Salt for hashing (should be consistent per install)
    this.salt = options.salt || process.env.TELEMETRY_SALT || 'calos-telemetry-salt';

    // PII patterns to detect and remove
    this.piiPatterns = {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phone: /(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
      ssn: /\d{3}-\d{2}-\d{4}/g,
      creditCard: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
      ipv4: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      ipv6: /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g
    };
  }

  /**
   * Hash a value (one-way, irreversible)
   *
   * @param {string} value - Value to hash
   * @returns {string} - SHA-256 hash
   */
  hash(value) {
    if (!value) return 'unknown';
    return crypto
      .createHash('sha256')
      .update(value + this.salt)
      .digest('hex')
      .substring(0, 16);  // First 16 chars for brevity
  }

  /**
   * Obfuscate user ID
   *
   * @param {string} userId - User ID
   * @returns {string} - Hashed user ID
   */
  obfuscateUserId(userId) {
    return this.hash(userId);
  }

  /**
   * Obfuscate email address
   *
   * @param {string} email - Email address
   * @returns {string} - Domain-only (e.g., "gmail.com")
   */
  obfuscateEmail(email) {
    if (!email || !email.includes('@')) return 'unknown';

    const domain = email.split('@')[1];
    return domain;  // Keep domain for trend analysis (e.g., "gmail.com", "company.com")
  }

  /**
   * Obfuscate IP address (country-level only)
   *
   * @param {string} ip - IP address
   * @returns {string} - Country code or 'unknown'
   */
  obfuscateIP(ip) {
    // In production, use a GeoIP library to get country code
    // For now, just remove the IP entirely
    if (!ip) return 'unknown';

    // Example: "192.168.1.1" → "US" (would use geoip-lite or similar)
    // For now, just return 'unknown' to avoid storing IPs
    return 'unknown';
  }

  /**
   * Obfuscate URL path (parameterize dynamic segments)
   *
   * Examples:
   *   /users/123 → /users/:id
   *   /api/contracts/abc-def-123 → /api/contracts/:id
   *   /transcripts/2024-01-15-meeting → /transcripts/:id
   *
   * @param {string} path - URL path
   * @returns {string} - Parameterized path
   */
  obfuscatePath(path) {
    if (!path) return 'unknown';

    // Remove query string
    path = path.split('?')[0];

    // Replace UUIDs
    path = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');

    // Replace numeric IDs
    path = path.replace(/\/\d+/g, '/:id');

    // Replace alphanumeric IDs (e.g., "user_abc123")
    path = path.replace(/\/[a-z]+_[a-z0-9]+/gi, '/:id');

    // Replace date-like strings (e.g., "2024-01-15")
    path = path.replace(/\/\d{4}-\d{2}-\d{2}/g, '/:date');

    // Replace long hashes (e.g., "a1b2c3d4e5f6")
    path = path.replace(/\/[a-z0-9]{10,}/gi, '/:id');

    return path;
  }

  /**
   * Remove PII from string
   *
   * @param {string} text - Text to clean
   * @returns {string} - Text with PII removed
   */
  removePII(text) {
    if (!text || typeof text !== 'string') return text;

    let cleaned = text;

    // Remove emails
    cleaned = cleaned.replace(this.piiPatterns.email, '[EMAIL]');

    // Remove phone numbers
    cleaned = cleaned.replace(this.piiPatterns.phone, '[PHONE]');

    // Remove SSNs
    cleaned = cleaned.replace(this.piiPatterns.ssn, '[SSN]');

    // Remove credit cards
    cleaned = cleaned.replace(this.piiPatterns.creditCard, '[CARD]');

    // Remove IP addresses
    cleaned = cleaned.replace(this.piiPatterns.ipv4, '[IP]');
    cleaned = cleaned.replace(this.piiPatterns.ipv6, '[IP]');

    return cleaned;
  }

  /**
   * Obfuscate error message (remove PII, keep error type)
   *
   * @param {Error|string} error - Error object or message
   * @returns {Object} - Obfuscated error info
   */
  obfuscateError(error) {
    const errorMessage = error.message || String(error);
    const errorName = error.name || 'Error';
    const errorStack = error.stack || '';

    // Remove PII from message
    const cleanMessage = this.removePII(errorMessage);

    // Remove PII from stack trace
    const cleanStack = this.removePII(errorStack)
      .split('\n')
      .slice(0, 5)  // Only keep first 5 lines
      .join('\n');

    return {
      name: errorName,
      message: cleanMessage,
      stack: cleanStack,
      type: this._categorizeError(errorName, cleanMessage)
    };
  }

  /**
   * Categorize error type (for trend analysis)
   *
   * @private
   * @param {string} name - Error name
   * @param {string} message - Error message
   * @returns {string} - Error category
   */
  _categorizeError(name, message) {
    const categories = {
      database: ['ECONNREFUSED', 'database', 'postgres', 'sql'],
      network: ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'network'],
      validation: ['validation', 'invalid', 'required', 'missing'],
      authentication: ['unauthorized', 'forbidden', 'auth', 'token'],
      payment: ['stripe', 'payment', 'charge', 'refund'],
      api: ['api', 'request', 'response', 'fetch']
    };

    const lowerName = name.toLowerCase();
    const lowerMessage = message.toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => lowerName.includes(kw) || lowerMessage.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Obfuscate request object (Express req)
   *
   * @param {Object} req - Express request
   * @returns {Object} - Obfuscated request info
   */
  obfuscateRequest(req) {
    return {
      method: req.method,
      path: this.obfuscatePath(req.path || req.url),
      statusCode: req.statusCode,
      userAgent: this._obfuscateUserAgent(req.get('user-agent')),
      // Don't include headers, query params, or body (may contain PII)
    };
  }

  /**
   * Obfuscate user agent (browser/OS, not version)
   *
   * @private
   * @param {string} ua - User agent string
   * @returns {string} - Obfuscated user agent
   */
  _obfuscateUserAgent(ua) {
    if (!ua) return 'unknown';

    // Extract browser and OS (remove versions)
    if (ua.includes('Chrome')) return 'chrome';
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('Safari')) return 'safari';
    if (ua.includes('Edge')) return 'edge';
    if (ua.includes('curl')) return 'curl';
    if (ua.includes('Postman')) return 'postman';

    return 'other';
  }

  /**
   * Obfuscate telemetry event
   *
   * @param {Object} event - Telemetry event
   * @returns {Object} - Obfuscated event
   */
  obfuscateEvent(event) {
    const obfuscated = {
      eventType: event.eventType,
      timestamp: event.timestamp,
      installId: event.installId,  // Already anonymous
    };

    // Obfuscate user ID if present
    if (event.userId) {
      obfuscated.userId = this.obfuscateUserId(event.userId);
    }

    // Obfuscate path if present
    if (event.path) {
      obfuscated.path = this.obfuscatePath(event.path);
    }

    // Obfuscate metadata (remove PII)
    if (event.metadata) {
      obfuscated.metadata = this.obfuscateMetadata(event.metadata);
    }

    // Obfuscate error if present
    if (event.error) {
      obfuscated.error = this.obfuscateError(event.error);
    }

    return obfuscated;
  }

  /**
   * Obfuscate metadata object
   *
   * @param {Object} metadata - Metadata object
   * @returns {Object} - Obfuscated metadata
   */
  obfuscateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};

    const obfuscated = {};

    // Safe fields (counts, booleans, known safe strings)
    const safeFields = ['count', 'total', 'duration', 'success', 'failed', 'tier', 'category', 'type', 'status'];

    for (const [key, value] of Object.entries(metadata)) {
      // Keep safe fields
      if (safeFields.includes(key) || key.endsWith('Count') || key.endsWith('Total')) {
        obfuscated[key] = value;
        continue;
      }

      // Hash IDs
      if (key.endsWith('Id') || key === 'id') {
        obfuscated[key] = this.hash(String(value));
        continue;
      }

      // Remove strings (may contain PII)
      if (typeof value === 'string') {
        obfuscated[key] = '[REDACTED]';
        continue;
      }

      // Keep numbers and booleans
      if (typeof value === 'number' || typeof value === 'boolean') {
        obfuscated[key] = value;
        continue;
      }

      // Recurse for nested objects
      if (typeof value === 'object' && value !== null) {
        obfuscated[key] = this.obfuscateMetadata(value);
      }
    }

    return obfuscated;
  }

  /**
   * Check if telemetry should be collected for tier
   *
   * @param {string} tier - License tier
   * @returns {boolean}
   */
  shouldCollectTelemetry(tier) {
    // Community and Pro: Always collect
    if (tier === 'community' || tier === 'pro') {
      return true;
    }

    // Enterprise: Optional (check air-gapped mode)
    if (tier === 'enterprise') {
      // Check if air-gapped mode is enabled
      const airGapped = process.env.TELEMETRY_DISABLED === 'true';
      return !airGapped;
    }

    // Development (localhost): No telemetry
    if (tier === 'development') {
      return false;
    }

    // Unknown tier: Collect (safe default)
    return true;
  }
}

module.exports = TelemetryObfuscator;
