/**
 * OSRS Wiki API Client
 *
 * MediaWiki API wrapper for Old School RuneScape Wiki.
 * Provides structured access to game data with caching and rate limiting.
 *
 * What It Does:
 * - Item lookups (stats, prices, drop rates)
 * - Monster information (combat stats, drops, locations)
 * - Quest guides (requirements, rewards, walkthroughs)
 * - Game mechanics (skill calculators, formulas)
 * - Real-time Grand Exchange prices
 *
 * API Endpoints:
 * - MediaWiki API: https://oldschool.runescape.wiki/api.php
 * - Real-Time API: https://prices.runescape.wiki/api/v1/osrs/
 * - Exchange API: https://api.weirdgloop.org/exchange/
 *
 * Rate Limiting:
 * - Respectful usage (max 60 requests/minute)
 * - Caching to reduce API calls
 * - User-Agent header required
 *
 * Use Cases:
 * - Stream overlay: "Dragon Scimitar: 60 Attack required, 59k GP"
 * - Auto-research: You pick up a rare drop, wiki appears on stream
 * - Chat commands: !wiki twisted bow → instant stats
 * - AI assistant: "Tell me about Zulrah" → formatted guide
 *
 * Integrates with:
 * - AIResearchAssistant (lib/ai-research-assistant.js) - Research queries
 * - OSRSEventNarrator (lib/osrs-event-narrator.js) - Game events → wiki
 * - RuneLiteIntegration (lib/runelite-integration.js) - Item IDs → names
 *
 * Usage:
 *   const wiki = new OSRSWikiClient();
 *
 *   // Get item info
 *   const item = await wiki.getItem('Dragon scimitar');
 *   // → { name, stats, price, examine, image }
 *
 *   // Get monster info
 *   const monster = await wiki.getMonster('Zulrah');
 *   // → { name, combat, hitpoints, drops, tactics }
 *
 *   // Get quest info
 *   const quest = await wiki.getQuest('Dragon Slayer II');
 *   // → { name, requirements, rewards, difficulty }
 *
 *   // Get real-time price
 *   const price = await wiki.getLatestPrice(4151); // Abyssal whip ID
 *   // → { high: 2500000, low: 2450000, timestamp }
 */

const fetch = require('node-fetch');
const { EventEmitter } = require('events');

class OSRSWikiClient extends EventEmitter {
  constructor(options = {}) {
    super();

    // API endpoints
    this.endpoints = {
      mediawiki: 'https://oldschool.runescape.wiki/api.php',
      prices: 'https://prices.runescape.wiki/api/v1/osrs',
      exchange: 'https://api.weirdgloop.org/exchange'
    };

    // User-Agent (required by OSRS Wiki)
    this.userAgent = options.userAgent || 'CALOS-Agent-Router/1.0 (https://github.com/calos)';

    // Rate limiting
    this.rateLimiter = {
      requestsPerMinute: options.requestsPerMinute || 60,
      requests: [],
      enabled: options.rateLimit !== false
    };

    // Cache
    this.cache = {
      enabled: options.cache !== false,
      ttl: options.cacheTTL || 300000, // 5 minutes
      data: new Map() // key → { value, expiry }
    };

    // Request tracking
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitHits: 0,
      errors: 0
    };

    console.log('[OSRSWikiClient] Initialized');
  }

  // ============================================================================
  // Main Query Methods
  // ============================================================================

  /**
   * Get item information
   */
  async getItem(itemName) {
    console.log(`[OSRSWikiClient] Looking up item: ${itemName}`);

    const cacheKey = `item:${itemName.toLowerCase()}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    // Query MediaWiki API
    const searchResult = await this._searchPage(itemName);
    if (!searchResult) {
      console.log(`[OSRSWikiClient] Item not found: ${itemName}`);
      return null;
    }

    const pageData = await this._getPageContent(searchResult.pageid);
    const parsedItem = this._parseItemPage(pageData);

    // Get real-time price if item is tradeable
    if (parsedItem.itemId && parsedItem.tradeable) {
      const priceData = await this.getLatestPrice(parsedItem.itemId);
      if (priceData) {
        parsedItem.price = priceData;
      }
    }

    this._setCache(cacheKey, parsedItem);
    return parsedItem;
  }

  /**
   * Get monster information
   */
  async getMonster(monsterName) {
    console.log(`[OSRSWikiClient] Looking up monster: ${monsterName}`);

    const cacheKey = `monster:${monsterName.toLowerCase()}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    const searchResult = await this._searchPage(monsterName);
    if (!searchResult) {
      console.log(`[OSRSWikiClient] Monster not found: ${monsterName}`);
      return null;
    }

    const pageData = await this._getPageContent(searchResult.pageid);
    const parsedMonster = this._parseMonsterPage(pageData);

    this._setCache(cacheKey, parsedMonster);
    return parsedMonster;
  }

  /**
   * Get quest information
   */
  async getQuest(questName) {
    console.log(`[OSRSWikiClient] Looking up quest: ${questName}`);

    const cacheKey = `quest:${questName.toLowerCase()}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    const searchResult = await this._searchPage(questName);
    if (!searchResult) {
      console.log(`[OSRSWikiClient] Quest not found: ${questName}`);
      return null;
    }

    const pageData = await this._getPageContent(searchResult.pageid);
    const parsedQuest = this._parseQuestPage(pageData);

    this._setCache(cacheKey, parsedQuest);
    return parsedQuest;
  }

  /**
   * Get real-time item price from Grand Exchange
   * @param {number} itemId - Item ID
   * @returns {Promise<Object>} - Price data with high/low/timestamp
   */
  async getLatestPrice(itemId) {
    console.log(`[OSRSWikiClient] Getting price for item ID: ${itemId}`);

    const cacheKey = `price:${itemId}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.endpoints.prices}/latest`;
      const response = await this._request(url);

      if (!response.data || !response.data[itemId]) {
        return null;
      }

      const priceData = {
        itemId,
        high: response.data[itemId].high,
        highTime: response.data[itemId].highTime,
        low: response.data[itemId].low,
        lowTime: response.data[itemId].lowTime,
        timestamp: Date.now()
      };

      // Cache for 1 minute (prices change frequently)
      this._setCache(cacheKey, priceData, 60000);
      return priceData;

    } catch (error) {
      console.error('[OSRSWikiClient] Price lookup error:', error.message);
      return null;
    }
  }

  /**
   * Get all latest prices (bulk request)
   * Much more efficient than individual requests for each item
   * @returns {Promise<Object>} - Map of itemId → price data
   */
  async getAllLatestPrices() {
    console.log('[OSRSWikiClient] Getting all latest prices (bulk)');

    const cacheKey = 'prices:all:latest';
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.endpoints.prices}/latest`;
      const response = await this._request(url);

      if (!response.data) {
        return {};
      }

      const allPrices = {};
      for (const [itemId, priceInfo] of Object.entries(response.data)) {
        allPrices[itemId] = {
          itemId: parseInt(itemId),
          high: priceInfo.high,
          highTime: priceInfo.highTime,
          low: priceInfo.low,
          lowTime: priceInfo.lowTime
        };
      }

      // Cache for 1 minute
      this._setCache(cacheKey, allPrices, 60000);

      console.log(`[OSRSWikiClient] Loaded ${Object.keys(allPrices).length} item prices`);
      return allPrices;

    } catch (error) {
      console.error('[OSRSWikiClient] All prices error:', error.message);
      return {};
    }
  }

  /**
   * Get item mapping (IDs, names, examine text, etc.)
   * @returns {Promise<Array>} - Array of item data
   */
  async getItemMapping() {
    console.log('[OSRSWikiClient] Getting item mapping');

    const cacheKey = 'mapping:items';
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.endpoints.prices}/mapping`;
      const response = await this._request(url);

      if (!response) {
        return [];
      }

      // Cache for 1 hour (mapping doesn't change often)
      this._setCache(cacheKey, response, 3600000);

      console.log(`[OSRSWikiClient] Loaded ${response.length} item mappings`);
      return response;

    } catch (error) {
      console.error('[OSRSWikiClient] Mapping error:', error.message);
      return [];
    }
  }

  /**
   * Get item name from ID using mapping
   * @param {number} itemId - Item ID
   * @returns {Promise<string>} - Item name
   */
  async getItemName(itemId) {
    const mapping = await this.getItemMapping();
    const item = mapping.find(i => i.id === itemId);
    return item ? item.name : null;
  }

  /**
   * Get 5-minute price history
   * @param {number} itemId - Item ID (optional, omit for all items)
   * @param {number} timestamp - Unix timestamp (optional)
   * @returns {Promise<Object>} - 5-minute price data
   */
  async get5MinutePrices(itemId = null, timestamp = null) {
    const idParam = itemId ? `?id=${itemId}` : '';
    const timestampParam = timestamp ? `${idParam ? '&' : '?'}timestamp=${timestamp}` : '';
    const url = `${this.endpoints.prices}/5m${idParam}${timestampParam}`;

    console.log(`[OSRSWikiClient] Getting 5min prices: ${url}`);

    try {
      const response = await this._request(url);

      return {
        itemId,
        interval: '5m',
        data: response.data || {},
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('[OSRSWikiClient] 5min price error:', error.message);
      return null;
    }
  }

  /**
   * Get 1-hour price history
   * @param {number} itemId - Item ID (optional, omit for all items)
   * @param {number} timestamp - Unix timestamp (optional)
   * @returns {Promise<Object>} - 1-hour price data
   */
  async get1HourPrices(itemId = null, timestamp = null) {
    const idParam = itemId ? `?id=${itemId}` : '';
    const timestampParam = timestamp ? `${idParam ? '&' : '?'}timestamp=${timestamp}` : '';
    const url = `${this.endpoints.prices}/1h${idParam}${timestampParam}`;

    console.log(`[OSRSWikiClient] Getting 1h prices: ${url}`);

    try {
      const response = await this._request(url);

      return {
        itemId,
        interval: '1h',
        data: response.data || {},
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('[OSRSWikiClient] 1h price error:', error.message);
      return null;
    }
  }

  /**
   * Get historical timeseries data for an item
   * @param {number} itemId - Item ID
   * @param {string} timestep - Time interval: "5m", "1h", "6h", or "24h"
   * @returns {Promise<Object>} - Timeseries data (max 365 points)
   */
  async getTimeseries(itemId, timestep = '1h') {
    if (!['5m', '1h', '6h', '24h'].includes(timestep)) {
      throw new Error(`Invalid timestep: ${timestep}. Must be 5m, 1h, 6h, or 24h`);
    }

    console.log(`[OSRSWikiClient] Getting timeseries for item ${itemId} (${timestep})`);

    const cacheKey = `timeseries:${itemId}:${timestep}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.endpoints.prices}/timeseries?id=${itemId}&timestep=${timestep}`;
      const response = await this._request(url);

      const timeseriesData = {
        itemId,
        timestep,
        data: response.data || [],
        count: response.data ? response.data.length : 0,
        timestamp: Date.now()
      };

      // Cache for 5 minutes
      this._setCache(cacheKey, timeseriesData, 300000);

      console.log(`[OSRSWikiClient] Loaded ${timeseriesData.count} timeseries points`);
      return timeseriesData;

    } catch (error) {
      console.error('[OSRSWikiClient] Timeseries error:', error.message);
      return null;
    }
  }

  /**
   * Search for pages by keyword
   */
  async search(query, limit = 10) {
    console.log(`[OSRSWikiClient] Searching: ${query}`);

    const params = {
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: limit,
      format: 'json'
    };

    const response = await this._mediawikiRequest(params);

    if (!response.query || !response.query.search) {
      return [];
    }

    return response.query.search.map(result => ({
      pageid: result.pageid,
      title: result.title,
      snippet: result.snippet.replace(/<[^>]*>/g, ''), // Strip HTML
      wordcount: result.wordcount,
      timestamp: result.timestamp
    }));
  }

  // ============================================================================
  // MediaWiki API Helpers
  // ============================================================================

  /**
   * Search for a page by name (exact or fuzzy)
   */
  async _searchPage(pageName) {
    const params = {
      action: 'query',
      list: 'search',
      srsearch: pageName,
      srlimit: 1,
      format: 'json'
    };

    const response = await this._mediawikiRequest(params);

    if (!response.query || !response.query.search || response.query.search.length === 0) {
      return null;
    }

    return response.query.search[0];
  }

  /**
   * Get page content by page ID
   */
  async _getPageContent(pageid) {
    const params = {
      action: 'query',
      pageids: pageid,
      prop: 'revisions|extracts|pageimages',
      rvprop: 'content',
      rvslots: 'main',
      exintro: true,
      explaintext: true,
      piprop: 'original',
      format: 'json'
    };

    const response = await this._mediawikiRequest(params);

    if (!response.query || !response.query.pages) {
      return null;
    }

    const page = response.query.pages[pageid];
    return {
      pageid,
      title: page.title,
      extract: page.extract,
      image: page.original ? page.original.source : null,
      wikitext: page.revisions ? page.revisions[0].slots.main['*'] : null
    };
  }

  /**
   * Make MediaWiki API request
   */
  async _mediawikiRequest(params) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${this.endpoints.mediawiki}?${queryString}`;

    return await this._request(url);
  }

  // ============================================================================
  // Page Parsers
  // ============================================================================

  /**
   * Parse item page data
   */
  _parseItemPage(pageData) {
    if (!pageData) return null;

    // Extract data from wikitext (simplified parsing)
    const item = {
      title: pageData.title,
      extract: pageData.extract,
      image: pageData.image,
      itemId: this._extractFromWikitext(pageData.wikitext, 'id'),
      examine: this._extractFromWikitext(pageData.wikitext, 'examine'),
      value: this._extractFromWikitext(pageData.wikitext, 'value'),
      weight: this._extractFromWikitext(pageData.wikitext, 'weight'),
      tradeable: this._extractFromWikitext(pageData.wikitext, 'tradeable') === 'Yes',
      equipable: this._extractFromWikitext(pageData.wikitext, 'equipable') === 'Yes',
      members: this._extractFromWikitext(pageData.wikitext, 'members') === 'Yes',
      quest: this._extractFromWikitext(pageData.wikitext, 'quest'),
      wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageData.title.replace(/ /g, '_'))}`
    };

    return item;
  }

  /**
   * Parse monster page data
   */
  _parseMonsterPage(pageData) {
    if (!pageData) return null;

    const monster = {
      title: pageData.title,
      extract: pageData.extract,
      image: pageData.image,
      combatLevel: this._extractFromWikitext(pageData.wikitext, 'combat'),
      hitpoints: this._extractFromWikitext(pageData.wikitext, 'hitpoints'),
      attackStyle: this._extractFromWikitext(pageData.wikitext, 'attack style'),
      slayerLevel: this._extractFromWikitext(pageData.wikitext, 'slaylvl'),
      maxHit: this._extractFromWikitext(pageData.wikitext, 'max hit'),
      aggressive: this._extractFromWikitext(pageData.wikitext, 'aggressive') === 'Yes',
      poisonous: this._extractFromWikitext(pageData.wikitext, 'poisonous') === 'Yes',
      immunePoison: this._extractFromWikitext(pageData.wikitext, 'immunepoison') === 'Yes',
      immuneVenom: this._extractFromWikitext(pageData.wikitext, 'immunevenom') === 'Yes',
      wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageData.title.replace(/ /g, '_'))}`
    };

    return monster;
  }

  /**
   * Parse quest page data
   */
  _parseQuestPage(pageData) {
    if (!pageData) return null;

    const quest = {
      title: pageData.title,
      extract: pageData.extract,
      image: pageData.image,
      difficulty: this._extractFromWikitext(pageData.wikitext, 'difficulty'),
      length: this._extractFromWikitext(pageData.wikitext, 'length'),
      questPoints: this._extractFromWikitext(pageData.wikitext, 'quest points'),
      series: this._extractFromWikitext(pageData.wikitext, 'series'),
      members: this._extractFromWikitext(pageData.wikitext, 'members') === 'Yes',
      wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageData.title.replace(/ /g, '_'))}`
    };

    return quest;
  }

  /**
   * Extract value from wikitext template
   */
  _extractFromWikitext(wikitext, key) {
    if (!wikitext) return null;

    // Simple regex extraction (not perfect but works for basic cases)
    const regex = new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\|\\n]+)`, 'i');
    const match = wikitext.match(regex);

    if (!match) return null;

    return match[1].trim();
  }

  // ============================================================================
  // Request Management
  // ============================================================================

  /**
   * Make HTTP request with rate limiting and error handling
   */
  async _request(url) {
    this.stats.totalRequests++;

    // Rate limiting check
    if (this.rateLimiter.enabled) {
      await this._enforceRateLimit();
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      this.stats.errors++;
      console.error('[OSRSWikiClient] Request error:', error.message);
      throw error;
    }
  }

  /**
   * Enforce rate limiting
   */
  async _enforceRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests
    this.rateLimiter.requests = this.rateLimiter.requests.filter(t => t > oneMinuteAgo);

    // Check if we're at the limit
    if (this.rateLimiter.requests.length >= this.rateLimiter.requestsPerMinute) {
      this.stats.rateLimitHits++;

      const oldestRequest = this.rateLimiter.requests[0];
      const waitTime = 60000 - (now - oldestRequest);

      console.log(`[OSRSWikiClient] Rate limit reached, waiting ${waitTime}ms...`);
      await this._sleep(waitTime);

      // Retry enforcement
      return this._enforceRateLimit();
    }

    // Add this request
    this.rateLimiter.requests.push(now);
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Get value from cache
   */
  _getCache(key) {
    if (!this.cache.enabled) return null;

    const entry = this.cache.data.get(key);
    if (!entry) {
      this.stats.cacheMisses++;
      return null;
    }

    // Check expiry
    if (entry.expiry < Date.now()) {
      this.cache.data.delete(key);
      this.stats.cacheMisses++;
      return null;
    }

    this.stats.cacheHits++;
    console.log(`[OSRSWikiClient] Cache hit: ${key}`);
    return entry.value;
  }

  /**
   * Set value in cache
   */
  _setCache(key, value, ttl = null) {
    if (!this.cache.enabled) return;

    this.cache.data.set(key, {
      value,
      expiry: Date.now() + (ttl || this.cache.ttl)
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.data.clear();
    console.log('[OSRSWikiClient] Cache cleared');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Sleep for specified duration
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.data.size,
      cacheHitRate: this.stats.totalRequests > 0
        ? (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Format item for stream overlay
   */
  formatItemForOverlay(item) {
    if (!item) return null;

    const parts = [item.title];

    if (item.price && item.price.high) {
      const priceGP = item.price.high.toLocaleString();
      parts.push(`${priceGP} GP`);
    }

    if (item.examine) {
      parts.push(item.examine);
    }

    return {
      title: parts[0],
      subtitle: parts.slice(1).join(' • '),
      image: item.image,
      url: item.wikiUrl
    };
  }

  /**
   * Format monster for stream overlay
   */
  formatMonsterForOverlay(monster) {
    if (!monster) return null;

    const parts = [];

    if (monster.combatLevel) {
      parts.push(`Combat Lvl ${monster.combatLevel}`);
    }

    if (monster.hitpoints) {
      parts.push(`${monster.hitpoints} HP`);
    }

    if (monster.slayerLevel) {
      parts.push(`${monster.slayerLevel} Slayer req`);
    }

    return {
      title: monster.title,
      subtitle: parts.join(' • '),
      image: monster.image,
      url: monster.wikiUrl,
      warning: monster.aggressive ? '⚠️ Aggressive' : null
    };
  }
}

module.exports = OSRSWikiClient;
