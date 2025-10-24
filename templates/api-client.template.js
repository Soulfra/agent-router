/**
 * API Client Template
 *
 * Generic API client with rate limiting, retries, and error handling.
 * Use this template for building integrations with external APIs.
 */

const axios = require('axios');

class {{CLASS_NAME}} {
  constructor(options = {}) {
    this.config = {
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      verbose: options.verbose || false
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      }
    });

    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0
    };

    console.log('[{{CLASS_NAME}}] Initialized');
  }

  /**
   * Make GET request
   */
  async get(endpoint, params = {}) {
    return this.request('GET', endpoint, null, params);
  }

  /**
   * Make POST request
   */
  async post(endpoint, data = {}) {
    return this.request('POST', endpoint, data);
  }

  /**
   * Make PUT request
   */
  async put(endpoint, data = {}) {
    return this.request('PUT', endpoint, data);
  }

  /**
   * Make DELETE request
   */
  async delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  /**
   * Make request with retry logic
   */
  async request(method, endpoint, data = null, params = {}) {
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;
      this.stats.requests++;

      try {
        if (this.config.verbose) {
          console.log(`[{{CLASS_NAME}}] ${method} ${endpoint} (attempt ${attempt}/${this.config.maxRetries})`);
        }

        const config = {
          method,
          url: endpoint,
          ...(data && { data }),
          ...(params && Object.keys(params).length > 0 && { params })
        };

        const response = await this.client.request(config);

        this.stats.successes++;

        if (this.config.verbose) {
          console.log(`[{{CLASS_NAME}}] ✅ ${method} ${endpoint} → ${response.status}`);
        }

        return response.data;

      } catch (error) {
        console.error(`[{{CLASS_NAME}}] ${method} ${endpoint} failed:`, error.message);

        // Check if we should retry
        if (this.shouldRetry(error, attempt)) {
          this.stats.retries++;

          // Wait before retry
          await this.delay(this.config.retryDelay * attempt);

          continue;
        }

        // Final failure
        this.stats.failures++;
        throw this.formatError(error);
      }
    }
  }

  /**
   * Check if error is retryable
   */
  shouldRetry(error, attempt) {
    // Don't retry if max attempts reached
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // Retry on network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry on 5xx errors
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on rate limiting (429)
    if (error.response && error.response.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * Format error for user
   */
  formatError(error) {
    if (error.response) {
      // Server responded with error
      return new Error(`API error (${error.response.status}): ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      // No response received
      return new Error(`Network error: ${error.message}`);
    } else {
      // Request setup error
      return new Error(`Request error: ${error.message}`);
    }
  }

  /**
   * Delay helper
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get API stats
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.requests > 0 ? this.stats.successes / this.stats.requests : 0
    };
  }
}

module.exports = {{CLASS_NAME}};
