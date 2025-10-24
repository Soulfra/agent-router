/**
 * Go HTTP Client - Node.js wrapper
 *
 * Provides curl/wget/filepath.Walk functionality via Go service
 *
 * Usage:
 *   const client = new GoHTTPClient('http://localhost:8080');
 *   const response = await client.fetch('https://example.com');
 */

const axios = require('axios');

class GoHTTPClient {
  constructor(baseURL = 'http://localhost:8080') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60000 // 60 second timeout
    });
  }

  /**
   * Fetch URL (curl-style)
   *
   * @param {string} url - URL to fetch
   * @param {object} options - Request options
   * @returns {Promise<object>} - Response data
   */
  async fetch(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body = '',
      timeout = 30
    } = options;

    try {
      const response = await this.client.post('/fetch', {
        url,
        method,
        headers,
        body,
        timeout
      });

      return response.data;
    } catch (error) {
      throw new Error(`Go HTTP Client fetch failed: ${error.message}`);
    }
  }

  /**
   * Download file (wget-style)
   *
   * @param {string} url - URL to download
   * @param {string} dest - Destination path (optional)
   * @returns {Promise<object>} - Download result
   */
  async download(url, dest = null) {
    try {
      const response = await this.client.post('/download', {
        url,
        dest
      });

      return response.data;
    } catch (error) {
      throw new Error(`Go HTTP Client download failed: ${error.message}`);
    }
  }

  /**
   * Walk directory (filepath.Walk)
   *
   * @param {string} path - Directory path
   * @param {object} options - Walk options
   * @returns {Promise<object>} - File list
   */
  async walk(path, options = {}) {
    const {
      pattern = '',
      maxDepth = 100
    } = options;

    try {
      const response = await this.client.post('/walk', {
        path,
        pattern,
        maxDepth
      });

      return response.data;
    } catch (error) {
      throw new Error(`Go HTTP Client walk failed: ${error.message}`);
    }
  }

  /**
   * Health check
   *
   * @returns {Promise<object>} - Health status
   */
  async health() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Go HTTP Client health check failed: ${error.message}`);
    }
  }

  /**
   * Check if Go service is available
   *
   * @returns {Promise<boolean>} - True if available
   */
  async isAvailable() {
    try {
      await this.health();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = GoHTTPClient;
