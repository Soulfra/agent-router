/**
 * @calos/email-sdk
 *
 * Zero-dependency SDK for CALOS Email API
 *
 * Usage:
 *   const calos = require('@calos/email-sdk');
 *
 *   await calos.email.send({
 *     apiKey: 'your-api-key',
 *     to: 'customer@example.com',
 *     subject: 'Hello',
 *     body: 'Test email'
 *   });
 */

class CalosEmailClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.CALOS_API_KEY;

    // Default to localhost for development (change to your production URL when deployed)
    this.baseUrl = config.baseUrl ||
                   process.env.CALOS_API_URL ||
                   'http://localhost:5001';  // ← Local by default (UPDATE THIS when deployed)

    this.timeout = config.timeout || 30000; // 30s default

    // Log the API endpoint being used
    console.log(`[CALOS Email SDK] Using API: ${this.baseUrl}`);
  }

  /**
   * Make API request
   * @private
   */
  async _request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': '@calos/email-sdk/1.0.0'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // Timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new CalosError(
          data.error || 'Request failed',
          response.status,
          data.code
        );
      }

      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new CalosError('Request timeout', 408, 'TIMEOUT');
      }

      if (error instanceof CalosError) {
        throw error;
      }

      throw new CalosError(error.message, 0, 'NETWORK_ERROR');
    }
  }

  /**
   * Send email
   *
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.body - Email body (text or HTML)
   * @param {string} [options.from] - Sender email
   * @param {string} [options.html] - HTML body
   * @param {string} [options.userId] - User ID (for multi-tenant)
   * @returns {Promise<Object>} Send result
   */
  async send(options) {
    if (!this.apiKey) {
      throw new CalosError(
        'API key required. Set apiKey in constructor or CALOS_API_KEY env var',
        401,
        'MISSING_API_KEY'
      );
    }

    if (!options.to) {
      throw new CalosError('Recipient (to) is required', 400, 'MISSING_RECIPIENT');
    }

    if (!options.subject) {
      throw new CalosError('Subject is required', 400, 'MISSING_SUBJECT');
    }

    if (!options.body && !options.html) {
      throw new CalosError('Email body is required', 400, 'MISSING_BODY');
    }

    return await this._request('POST', '/api/gmail/webhook/send', {
      userId: options.userId || 'default',
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: options.html
    });
  }

  /**
   * Add recipient to whitelist
   *
   * @param {string} email - Recipient email
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Add result with confirmation URL
   */
  async addRecipient(email, options = {}) {
    if (!this.apiKey) {
      throw new CalosError('API key required', 401, 'MISSING_API_KEY');
    }

    if (!email) {
      throw new CalosError('Email is required', 400, 'MISSING_EMAIL');
    }

    return await this._request('POST', '/api/gmail/webhook/recipients', {
      userId: options.userId || 'default',
      recipientEmail: email,
      metadata: options.metadata
    });
  }

  /**
   * Remove recipient from whitelist
   *
   * @param {string} email - Recipient email
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Remove result
   */
  async removeRecipient(email, options = {}) {
    if (!this.apiKey) {
      throw new CalosError('API key required', 401, 'MISSING_API_KEY');
    }

    if (!email) {
      throw new CalosError('Email is required', 400, 'MISSING_EMAIL');
    }

    return await this._request('DELETE', '/api/gmail/webhook/recipients', {
      userId: options.userId || 'default',
      recipientEmail: email
    });
  }

  /**
   * Get all recipients
   *
   * @param {Object} [options] - Filter options
   * @returns {Promise<Object>} Recipients list
   */
  async getRecipients(options = {}) {
    if (!this.apiKey) {
      throw new CalosError('API key required', 401, 'MISSING_API_KEY');
    }

    const userId = options.userId || 'default';
    const query = options.status ? `?status=${options.status}` : '';

    return await this._request('GET', `/api/gmail/webhook/recipients/${userId}${query}`);
  }

  /**
   * Get status
   *
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Status
   */
  async getStatus(options = {}) {
    if (!this.apiKey) {
      throw new CalosError('API key required', 401, 'MISSING_API_KEY');
    }

    const userId = options.userId || 'default';
    const endpoint = userId === 'global'
      ? '/api/gmail/webhook/status'
      : `/api/gmail/webhook/status/${userId}`;

    return await this._request('GET', endpoint);
  }

  /**
   * Send test email
   *
   * @param {string} to - Recipient email
   * @returns {Promise<Object>} Test result
   */
  async sendTest(to) {
    if (!this.apiKey) {
      throw new CalosError('API key required', 401, 'MISSING_API_KEY');
    }

    if (!to) {
      throw new CalosError('Recipient email is required', 400, 'MISSING_RECIPIENT');
    }

    return await this._request('POST', '/api/gmail/webhook/test', { to });
  }

  /**
   * Check health
   *
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return await this._request('GET', '/api/gmail/webhook/health');
  }
}

/**
 * Custom error class
 */
class CalosError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'CalosError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Factory function for easy usage
 */
function createClient(config) {
  return new CalosEmailClient(config);
}

/**
 * Default export - singleton instance
 */
const defaultClient = new CalosEmailClient();

module.exports = {
  // Default client
  email: defaultClient,

  // Factory
  createClient,

  // Classes
  CalosEmailClient,
  CalosError
};

// TypeScript-style default export for ESM compatibility
module.exports.default = module.exports;
