/**
 * CalOS Platform SDK - Browser Edition
 *
 * Zero-dependency privacy-first automation platform for browsers
 *
 * Usage:
 * <script src="calos-sdk-browser.js"></script>
 * <script>
 *   const calos = new CalOSPlatform({ baseURL: 'https://api.calos.dev' });
 *   await calos.receipts.parse(imageFile);
 * </script>
 *
 * @version 2.0.0-browser
 * @license MIT
 * @copyright (c) 2025 SoulFra (Matthew Mauer)
 * @source https://github.com/soulfra/soulfra.github.io
 * @dependencies ZERO - uses only browser built-ins (fetch, FileReader, crypto)
 *
 * ---
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function(window) {
  'use strict';

  /**
   * Privacy modes
   */
  const PrivacyMode = {
    STRICT: 'strict',
    BALANCED: 'balanced',
    OFF: 'off'
  };

  /**
   * Main CalOS Platform class
   */
  class CalOSPlatform {
    constructor(config = {}) {
      this.apiKey = config.apiKey;
      this.baseURL = config.baseURL || 'http://localhost:5001';
      this.privacyMode = config.privacyMode || PrivacyMode.BALANCED;
      this.timeout = config.timeout || 60000;
      this.silent = config.silent || false;

      // Sub-modules
      this.receipts = new ReceiptsModule(this);
      this.email = new EmailModule(this);
      this.pos = new POSModule(this);
      this.ragebait = new RagebaitModule(this);
      this.files = new FilesModule(this);
      this.privacy = new PrivacyModule(this);

      // Attribution (can be disabled with silent: true)
      if (!this.silent) {
        console.log('%c🔒 CalOS Platform SDK v2.0.0', 'font-weight: bold; color: #667eea;');
        console.log('%cBuilt with ❤️ by SoulFra', 'color: #667eea;');
        console.log('%chttps://soulfra.github.io', 'color: #667eea;');
        console.log(`%cPrivacy mode: ${this.privacyMode}`, 'color: #2ecc71;');
        console.log('%c---', 'color: #ddd;');
      }

      // Optional privacy-first telemetry (opt-in only)
      if (config.telemetry === true) {
        this._sendAttribution();
      }
    }

    /**
     * Privacy-first attribution tracking (opt-in only)
     * Sends: domain, SDK version, timestamp
     * Does NOT send: user data, IPs, cookies, or any PII
     */
    _sendAttribution() {
      try {
        const data = {
          domain: window.location.hostname,
          version: '2.0.0-browser',
          timestamp: new Date().toISOString(),
          privacyMode: this.privacyMode
        };

        // Send to self-hosted tracker (not Google Analytics or Big Tech)
        fetch(`${this.baseURL}/api/telemetry/attribution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).catch(() => {
          // Fail silently - telemetry is optional
        });
      } catch (error) {
        // Fail silently
      }
    }

    /**
     * Make HTTP request
     */
    async request(method, path, options = {}) {
      const url = `${this.baseURL}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'calos-browser-sdk/2.0.0',
        ...options.headers
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const config = {
        method,
        headers,
        signal: AbortSignal.timeout(this.timeout)
      };

      if (options.body) {
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
      if (this.privacyMode === PrivacyMode.OFF) return data;

      const obfuscated = JSON.parse(JSON.stringify(data));
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
     * Health check
     */
    async health() {
      try {
        const response = await this.request('GET', '/health');
        return { success: true, status: response.status || 'healthy', services: response.services || {} };
      } catch (error) {
        return { success: false, error: error.message };
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
     * Parse receipt from File object (browser upload)
     */
    async parse(file) {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch(`${this.sdk.baseURL}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          ...(this.sdk.apiKey && { 'Authorization': `Bearer ${this.sdk.apiKey}` })
        },
        body: formData
      });

      if (!response.ok) throw new Error(`Receipt parsing failed: ${response.statusText}`);
      return await response.json();
    }

    /**
     * Parse receipt from text
     */
    async parseText(text, merchant = 'auto') {
      return await this.sdk.request('POST', '/api/receipts/parse', { body: { text, merchant } });
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

    async send({ userId, to, subject, text, html }) {
      return await this.sdk.request('POST', '/api/gmail/send', { body: { userId, to, subject, text, html } });
    }

    async addRecipient(userId, email) {
      return await this.sdk.request('POST', '/api/gmail/recipients/add', { body: { userId, email } });
    }

    async checkLimits(userId) {
      return await this.sdk.request('GET', `/api/gmail/limits?userId=${userId}`);
    }

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

    async charge({ amount, currency = 'usd', terminalId, description, metadata }) {
      return await this.sdk.request('POST', '/api/pos/charge', { body: { amount, currency, terminalId, description, metadata } });
    }

    async generateQR({ amount, description }) {
      return await this.sdk.request('POST', '/api/pos/qr', { body: { amount, description } });
    }

    async cash({ amount, description, metadata }) {
      return await this.sdk.request('POST', '/api/pos/cash', { body: { amount, description, metadata } });
    }

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

    async generate(templateId, options = {}) {
      return await this.sdk.request('POST', '/api/ragebait/generate', {
        body: { templateId, domain: options.domain, watermark: options.watermark, format: options.format || 'gif' }
      });
    }

    async listTemplates() {
      return await this.sdk.request('GET', '/api/ragebait/templates');
    }

    async createTemplate(template) {
      return await this.sdk.request('POST', '/api/ragebait/templates', { body: template });
    }
  }

  /**
   * Files Module - File Explorer & Git Scanner
   */
  class FilesModule {
    constructor(sdk) {
      this.sdk = sdk;
    }

    async scanGitRepos(path = '~/Desktop') {
      return await this.sdk.request('GET', `/api/explorer/git?path=${encodeURIComponent(path)}`);
    }

    async getTree(path, depth = 3) {
      return await this.sdk.request('GET', `/api/explorer/tree?path=${encodeURIComponent(path)}&depth=${depth}`);
    }

    async analyzeRepo(repoPath) {
      return await this.sdk.request('GET', `/api/explorer/analyze?path=${encodeURIComponent(repoPath)}`);
    }

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

    async getDashboard() {
      return await this.sdk.request('GET', '/api/privacy/dashboard');
    }

    async getDataFlow(timeRange = '7d') {
      return await this.sdk.request('GET', `/api/privacy/dataflow?range=${timeRange}`);
    }

    async getTelemetryPreview() {
      return await this.sdk.request('GET', '/api/privacy/telemetry/preview');
    }

    async optOut() {
      return await this.sdk.request('POST', '/api/privacy/telemetry/opt-out');
    }

    async exportData(userId) {
      return await this.sdk.request('GET', `/api/privacy/export?userId=${userId}`);
    }

    async deleteData(userId) {
      return await this.sdk.request('DELETE', `/api/privacy/data?userId=${userId}`);
    }
  }

  // Export to window
  window.CalOSPlatform = CalOSPlatform;
  window.PrivacyMode = PrivacyMode;

  // Watermark (visible in source code)
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #667eea;');
  console.log('%c🔒 CalOS Browser SDK Loaded', 'font-weight: bold; font-size: 14px; color: #667eea;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #667eea;');
  console.log('%cVersion: 2.0.0-browser', 'color: #888;');
  console.log('%cLicense: MIT', 'color: #888;');
  console.log('%cCopyright: (c) 2025 SoulFra', 'color: #888;');
  console.log('%cSource: https://github.com/soulfra/soulfra.github.io', 'color: #888;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #667eea;');
  console.log('%c✅ Zero dependencies • Privacy-first • Self-hostable', 'color: #2ecc71; font-weight: bold;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'color: #667eea;');

})(window);
