/**
 * External Data Fetcher
 *
 * Generic library for fetching data from external sources:
 * - REST APIs (JSON, XML)
 * - Web scraping (HTML)
 * - RSS feeds
 * - GraphQL endpoints
 *
 * Features:
 * - Rate limiting
 * - Retry with exponential backoff
 * - Response caching
 * - Multiple data format support
 * - Error handling
 */

const axios = require('axios');
const crypto = require('crypto');
const jsonPath = require('./json-path');

class ExternalFetcher {
  constructor(options = {}) {
    this.db = options.db || null;
    this.cacheDuration = options.cacheDuration || 300000; // 5 minutes default
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second

    // Rate limiting (requests per minute)
    this.rateLimit = options.rateLimit || 60;
    this.requestCount = 0;
    this.resetTime = Date.now() + 60000;

    // User agent for web scraping
    this.userAgent = options.userAgent || 'CalOS-DataFetcher/1.0';
  }

  /**
   * Fetch data from URL with automatic caching and retry
   */
  async fetch(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeout = 10000,
      responseType = 'json', // 'json', 'text', 'xml', 'html'
      useCache = true,
      cacheKey = null
    } = options;

    // Generate cache key
    const key = cacheKey || this._generateCacheKey(url, method, body);

    // Check cache
    if (useCache && this.db) {
      const cached = await this._getFromCache(key);
      if (cached) {
        return cached;
      }
    }

    // Check rate limit
    await this._checkRateLimit();

    // Fetch with retry
    const response = await this._fetchWithRetry(url, {
      method,
      headers: {
        'User-Agent': this.userAgent,
        ...headers
      },
      data: body,
      timeout,
      responseType: responseType === 'json' ? 'json' : 'text'
    });

    // Parse response based on type
    let data;
    if (responseType === 'json') {
      data = response.data;
    } else if (responseType === 'xml') {
      data = await this._parseXML(response.data);
    } else if (responseType === 'html') {
      data = response.data; // Can add cheerio parsing here
    } else {
      data = response.data;
    }

    // Cache the result
    if (useCache && this.db) {
      await this._saveToCache(key, data);
    }

    return data;
  }

  /**
   * Fetch JSON data
   */
  async fetchJSON(url, options = {}) {
    return await this.fetch(url, { ...options, responseType: 'json' });
  }

  /**
   * Fetch XML data
   */
  async fetchXML(url, options = {}) {
    return await this.fetch(url, { ...options, responseType: 'xml' });
  }

  /**
   * Fetch HTML and parse with cheerio (optional)
   */
  async fetchHTML(url, options = {}) {
    const html = await this.fetch(url, { ...options, responseType: 'html' });

    // If cheerio is available, parse it
    try {
      const cheerio = require('cheerio');
      return cheerio.load(html);
    } catch (e) {
      // Return raw HTML if cheerio not installed
      return html;
    }
  }

  /**
   * Fetch RSS feed
   */
  async fetchRSS(url) {
    const xml = await this.fetchXML(url);
    return this._parseRSS(xml);
  }

  /**
   * POST request with JSON body
   */
  async post(url, body, options = {}) {
    return await this.fetch(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Fetch with retry logic
   */
  async _fetchWithRetry(url, config, retries = 0) {
    try {
      const response = await axios(url, config);
      return response;

    } catch (error) {
      if (retries < this.maxRetries) {
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, retries);
        console.log(`⚠️  Retry ${retries + 1}/${this.maxRetries} for ${url} in ${delay}ms`);

        await this._sleep(delay);
        return await this._fetchWithRetry(url, config, retries + 1);
      }

      throw error;
    }
  }

  /**
   * Rate limiting check
   */
  async _checkRateLimit() {
    const now = Date.now();

    // Reset counter if minute passed
    if (now > this.resetTime) {
      this.requestCount = 0;
      this.resetTime = now + 60000;
    }

    // Check if we've hit the limit
    if (this.requestCount >= this.rateLimit) {
      const waitTime = this.resetTime - now;
      console.log(`⏱️  Rate limit reached. Waiting ${waitTime}ms...`);
      await this._sleep(waitTime);

      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }

    this.requestCount++;
  }

  /**
   * Parse XML to JSON
   */
  async _parseXML(xmlString) {
    try {
      const xml2js = require('xml2js');
      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false
      });

      return await parser.parseStringPromise(xmlString);

    } catch (error) {
      console.error('XML parsing failed:', error.message);
      return { raw: xmlString };
    }
  }

  /**
   * Parse RSS feed
   */
  _parseRSS(xmlData) {
    const items = [];

    try {
      const channel = xmlData.rss?.channel || xmlData.feed;

      if (channel.item) {
        const itemArray = Array.isArray(channel.item) ? channel.item : [channel.item];

        itemArray.forEach(item => {
          items.push({
            title: item.title,
            link: item.link,
            description: item.description,
            pubDate: item.pubDate,
            guid: item.guid
          });
        });
      }

      return {
        title: channel.title,
        description: channel.description,
        link: channel.link,
        items
      };

    } catch (error) {
      console.error('RSS parsing failed:', error.message);
      return { items: [] };
    }
  }

  /**
   * Get from cache
   */
  async _getFromCache(cacheKey) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT data, cached_at
        FROM external_data_cache
        WHERE cache_key = $1
          AND cached_at > NOW() - INTERVAL '${this.cacheDuration / 1000} seconds'
        ORDER BY cached_at DESC
        LIMIT 1
      `, [cacheKey]);

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`📦 Cache hit for ${cacheKey} (age: ${Math.round((Date.now() - new Date(row.cached_at)) / 1000)}s)`);
        return row.data;
      }

      return null;

    } catch (error) {
      // Table might not exist - that's okay
      if (!error.message.includes('does not exist')) {
        console.error('Cache fetch error:', error.message);
      }
      return null;
    }
  }

  /**
   * Save to cache
   */
  async _saveToCache(cacheKey, data) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO external_data_cache (cache_key, data, cached_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (cache_key)
        DO UPDATE SET
          data = EXCLUDED.data,
          cached_at = EXCLUDED.cached_at
      `, [cacheKey, JSON.stringify(data)]);

      console.log(`💾 Cached ${cacheKey}`);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('Cache save error:', error.message);
      }
    }
  }

  /**
   * Generate cache key from URL and parameters
   */
  _generateCacheKey(url, method = 'GET', body = null) {
    const parts = [method, url];

    if (body) {
      parts.push(JSON.stringify(body));
    }

    const combined = parts.join('|');
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
  }

  /**
   * Extract data from nested JSON using path mappings
   *
   * @param {Object} data - The data object to extract from
   * @param {Object} pathMap - Mapping of output keys to JSON paths
   * @returns {Object} Extracted data
   *
   * @example
   * const data = { "Global Quote": { "05. price": "123.45" } };
   * const result = fetcher.extract(data, {
   *   price: '["Global Quote"]["05. price"]'
   * });
   * // { price: "123.45" }
   */
  extract(data, pathMap) {
    return jsonPath.extract(data, pathMap);
  }

  /**
   * Get value from nested JSON using path
   *
   * @param {Object} data - The data object
   * @param {String|Array} path - Path to the value
   * @param {*} defaultValue - Default value if not found
   * @returns {*} The value at the path
   */
  get(data, path, defaultValue) {
    return jsonPath.get(data, path, defaultValue);
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ExternalFetcher;
