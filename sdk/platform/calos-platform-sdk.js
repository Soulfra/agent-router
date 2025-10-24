/**
 * @calos/platform-sdk - Unified CALOS Platform SDK
 *
 * Privacy-first automation platform for developers.
 * Stripe/Zapier competitor with data obfuscation built-in.
 *
 * @example
 * ```javascript
 * const CalOSPlatform = require('@calos/platform-sdk');
 *
 * const calos = new CalOSPlatform({
 *   apiKey: 'sk-tenant-abc123',
 *   baseURL: 'https://api.calos.dev',
 *   privacyMode: 'strict' // auto-obfuscate all data
 * });
 *
 * // Receipt parsing (OCR + categorization)
 * const receipt = await calos.receipts.parse('/path/to/receipt.jpg');
 *
 * // Email relay (Gmail zero-cost)
 * await calos.email.send({ to: 'user@example.com', subject: 'Hello' });
 *
 * // POS terminal (Stripe competitor)
 * await calos.pos.charge({ amount: 2900, card: '...' });
 *
 * // Dev ragebait generator
 * await calos.ragebait.generate('npm-install', { domain: 'myapp.com' });
 *
 * // File explorer
 * const repos = await calos.files.scanGitRepos('/Desktop');
 * ```
 *
 * @version 2.0.0
 * @license MIT
 */

const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');

/**
 * Privacy modes
 */
const PrivacyMode = {
  STRICT: 'strict',   // Obfuscate everything, route sensitive to Ollama
  BALANCED: 'balanced', // Obfuscate PII, allow external APIs
  OFF: 'off'          // No obfuscation (dev/testing only)
};

/**
 * Main platform SDK
 */
class CalOSPlatform {
  constructor(config = {}) {
    // Core config
    this.apiKey = config.apiKey || process.env.CALOS_API_KEY;
    this.baseURL = config.baseURL || process.env.CALOS_BASE_URL || 'http://localhost:5001';
    this.privacyMode = config.privacyMode || PrivacyMode.BALANCED;
    this.timeout = config.timeout || 60000;

    if (!this.apiKey && this.baseURL.includes('localhost')) {
      console.warn('[CalOSPlatform] No API key provided - using localhost mode');
    }

    // Sub-modules
    this.receipts = new ReceiptsModule(this);
    this.email = new EmailModule(this);
    this.pos = new POSModule(this);
    this.ragebait = new RagebaitModule(this);
    this.files = new FilesModule(this);
    this.privacy = new PrivacyModule(this);

    console.log(`[CalOSPlatform] Initialized (privacy: ${this.privacyMode})`);
  }

  /**
   * Make HTTP request with privacy obfuscation
   */
  async request(method, path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'calos-platform-sdk/2.0.0',
      ...options.headers
    };

    // Add API key if available
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const config = {
      method,
      headers,
      timeout: this.timeout
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    // Apply privacy obfuscation to request
    if (this.privacyMode !== PrivacyMode.OFF && options.body) {
      config.body = JSON.stringify(this._obfuscate(options.body));
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API error: ${response.status} - ${error.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[CalOSPlatform] Request failed:', error.message);
      throw error;
    }
  }

  /**
   * Obfuscate data based on privacy mode
   */
  _obfuscate(data) {
    if (this.privacyMode === PrivacyMode.OFF) {
      return data;
    }

    // Deep clone to avoid mutation
    const obfuscated = JSON.parse(JSON.stringify(data));

    // Remove PII fields
    const piiFields = ['email', 'phone', 'address', 'ssn', 'name', 'firstName', 'lastName'];

    const removePII = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;

      for (const key in obj) {
        if (piiFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          removePII(obj[key]);
        }
      }
      return obj;
    };

    return this.privacyMode === PrivacyMode.STRICT ? removePII(obfuscated) : obfuscated;
  }

  /**
   * Check health of CALOS platform
   */
  async health() {
    try {
      const response = await this.request('GET', '/health');
      return {
        success: true,
        status: response.status || 'healthy',
        services: response.services || {}
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Receipts Module - OCR + Categorization
 */
class ReceiptsModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Parse receipt from image (OCR + auto-categorize)
   */
  async parse(imagePath) {
    const formData = new FormData();
    formData.append('receipt', fs.createReadStream(imagePath));

    const response = await fetch(`${this.sdk.baseURL}/api/receipts/upload`, {
      method: 'POST',
      headers: {
        ...formData.getHeaders(),
        ...(this.sdk.apiKey && { 'Authorization': `Bearer ${this.sdk.apiKey}` })
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Receipt parsing failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Parse receipt from text
   */
  async parseText(text, merchant = 'auto') {
    return await this.sdk.request('POST', '/api/receipts/parse', {
      body: { text, merchant }
    });
  }

  /**
   * Get expense categories
   */
  async getCategories() {
    return await this.sdk.request('GET', '/api/receipts/categories');
  }

  /**
   * Get expense breakdown
   */
  async getBreakdown(userId, startDate, endDate) {
    const params = new URLSearchParams({ userId, startDate, endDate });
    return await this.sdk.request('GET', `/api/receipts/breakdown?${params}`);
  }
}

/**
 * Email Module - Gmail Zero-Cost Relay
 */
class EmailModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Send email via Gmail relay
   */
  async send({ userId, to, subject, text, html }) {
    return await this.sdk.request('POST', '/api/gmail/send', {
      body: { userId, to, subject, text, html }
    });
  }

  /**
   * Add recipient (double opt-in)
   */
  async addRecipient(userId, email) {
    return await this.sdk.request('POST', '/api/gmail/recipients/add', {
      body: { userId, email }
    });
  }

  /**
   * Check rate limits
   */
  async checkLimits(userId) {
    return await this.sdk.request('GET', `/api/gmail/limits?userId=${userId}`);
  }

  /**
   * Get send status
   */
  async getStatus(userId) {
    return await this.sdk.request('GET', `/api/gmail/status?userId=${userId}`);
  }
}

/**
 * POS Module - Square Competitor
 */
class POSModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Charge card via Stripe Terminal
   */
  async charge({ amount, currency = 'usd', terminalId, description, metadata }) {
    return await this.sdk.request('POST', '/api/pos/charge', {
      body: { amount, currency, terminalId, description, metadata }
    });
  }

  /**
   * Generate QR code for payment
   */
  async generateQR({ amount, description }) {
    return await this.sdk.request('POST', '/api/pos/qr', {
      body: { amount, description }
    });
  }

  /**
   * Process cash transaction
   */
  async cash({ amount, description, metadata }) {
    return await this.sdk.request('POST', '/api/pos/cash', {
      body: { amount, description, metadata }
    });
  }

  /**
   * Get transaction history
   */
  async getTransactions(locationId, startDate, endDate) {
    const params = new URLSearchParams({ locationId, startDate, endDate });
    return await this.sdk.request('GET', `/api/pos/transactions?${params}`);
  }
}

/**
 * Ragebait Module - Dev Meme Generator
 */
class RagebaitModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Generate dev ragebait GIF
   */
  async generate(templateId, options = {}) {
    return await this.sdk.request('POST', '/api/ragebait/generate', {
      body: {
        templateId,
        domain: options.domain,
        watermark: options.watermark,
        format: options.format || 'gif'
      }
    });
  }

  /**
   * List available templates
   */
  async listTemplates() {
    return await this.sdk.request('GET', '/api/ragebait/templates');
  }

  /**
   * Create custom template
   */
  async createTemplate(template) {
    return await this.sdk.request('POST', '/api/ragebait/templates', {
      body: template
    });
  }
}

/**
 * Files Module - File Explorer & Git Scanner
 */
class FilesModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Scan for git repositories
   */
  async scanGitRepos(path = '~/Desktop') {
    return await this.sdk.request('GET', `/api/explorer/git?path=${encodeURIComponent(path)}`);
  }

  /**
   * Get directory tree
   */
  async getTree(path, depth = 3) {
    return await this.sdk.request('GET', `/api/explorer/tree?path=${encodeURIComponent(path)}&depth=${depth}`);
  }

  /**
   * Analyze specific git repo
   */
  async analyzeRepo(repoPath) {
    return await this.sdk.request('GET', `/api/explorer/analyze?path=${encodeURIComponent(repoPath)}`);
  }

  /**
   * Full desktop scan
   */
  async scan() {
    return await this.sdk.request('GET', '/api/explorer/scan');
  }
}

/**
 * Privacy Module - Telemetry & Data Control
 */
class PrivacyModule {
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Get privacy dashboard data
   */
  async getDashboard() {
    return await this.sdk.request('GET', '/api/privacy/dashboard');
  }

  /**
   * Get data flow visualization
   */
  async getDataFlow(timeRange = '7d') {
    return await this.sdk.request('GET', `/api/privacy/dataflow?range=${timeRange}`);
  }

  /**
   * Get telemetry preview (what data is sent)
   */
  async getTelemetryPreview() {
    return await this.sdk.request('GET', '/api/privacy/telemetry/preview');
  }

  /**
   * Opt out of telemetry
   */
  async optOut() {
    return await this.sdk.request('POST', '/api/privacy/telemetry/opt-out');
  }

  /**
   * Export all user data (GDPR)
   */
  async exportData(userId) {
    return await this.sdk.request('GET', `/api/privacy/export?userId=${userId}`);
  }

  /**
   * Delete all user data (GDPR)
   */
  async deleteData(userId) {
    return await this.sdk.request('DELETE', `/api/privacy/data?userId=${userId}`);
  }
}

// Export
module.exports = CalOSPlatform;
module.exports.PrivacyMode = PrivacyMode;
