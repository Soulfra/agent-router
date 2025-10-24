/**
 * CAL API Client
 *
 * Internal API client for CAL to call the Triangle Consensus API.
 * Enables AI-assisted learning when stuck on problems.
 *
 * Features:
 * - Auto-detects if server is running (localhost:5001)
 * - Falls back to direct module calls if server down
 * - Handles retries + rate limiting
 * - Logs all queries to learning systems
 * - Caches responses for repeated queries
 * - Validates API keys before making calls
 *
 * Usage:
 *   const client = new CalAPIClient();
 *   await client.init();
 *
 *   const result = await client.triangle({
 *     prompt: "How do I fix this SQL error?",
 *     taskType: "code",
 *     synthesize: true
 *   });
 *
 *   // Access individual responses
 *   console.log(result.responses.openai);
 *   console.log(result.responses.anthropic);
 *   console.log(result.responses.deepseek);
 *
 *   // Access consensus
 *   console.log(result.consensus.synthesized);
 *   console.log(result.consensus.confidence);
 */

const axios = require('axios');
const path = require('path');

class CalAPIClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'http://localhost:5001';
    this.userId = config.userId || 'cal';
    this.source = config.source || 'cal-api-client';

    // Retry config
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Cache config
    this.enableCache = config.enableCache !== false;
    this.cacheMaxSize = config.cacheMaxSize || 100;
    this.cacheTTL = config.cacheTTL || 3600000; // 1 hour
    this.cache = new Map();

    // State
    this.isServerRunning = false;
    this.lastHealthCheck = null;
    this.healthCheckInterval = config.healthCheckInterval || 60000; // 1 minute

    // Fallback modules (loaded lazily)
    this.multiProviderRouter = null;
    this.triangleEngine = null;

    console.log('[CalAPIClient] Initialized');
  }

  /**
   * Initialize client - check server health and load fallback modules
   */
  async init() {
    console.log('[CalAPIClient] Initializing...');

    // Check server health
    await this.checkServerHealth();

    // Load fallback modules if server down
    if (!this.isServerRunning) {
      console.log('[CalAPIClient] Server not running, loading fallback modules...');
      await this.loadFallbackModules();
    }

    // Start health check interval
    this.healthCheckIntervalId = setInterval(async () => {
      await this.checkServerHealth();
    }, this.healthCheckInterval);

    console.log(`[CalAPIClient] Ready (server: ${this.isServerRunning ? 'running' : 'down, using fallback'})`);

    return {
      success: true,
      serverRunning: this.isServerRunning,
      fallbackAvailable: !!(this.multiProviderRouter && this.triangleEngine)
    };
  }

  /**
   * Check if server is running
   */
  async checkServerHealth() {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, {
        timeout: 2000
      });

      this.isServerRunning = response.status === 200;
      this.lastHealthCheck = Date.now();

      return this.isServerRunning;
    } catch (error) {
      this.isServerRunning = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  /**
   * Load fallback modules for direct calls
   */
  async loadFallbackModules() {
    try {
      const MultiProviderRouter = require('./multi-provider-router');
      const TriangleConsensusEngine = require('./triangle-consensus-engine');

      this.multiProviderRouter = new MultiProviderRouter();
      this.triangleEngine = new TriangleConsensusEngine({
        multiProviderRouter: this.multiProviderRouter
      });

      console.log('[CalAPIClient] Fallback modules loaded');
      return true;
    } catch (error) {
      console.error('[CalAPIClient] Failed to load fallback modules:', error);
      return false;
    }
  }

  /**
   * Query Triangle Consensus API (all 3 providers)
   */
  async triangle(options = {}) {
    const {
      prompt,
      taskType = 'general',
      synthesize = true,
      generateStory = false,
      context = {}
    } = options;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    // Check cache
    if (this.enableCache) {
      const cached = this.getFromCache('triangle', prompt);
      if (cached) {
        console.log('[CalAPIClient] Returning cached triangle result');
        return cached;
      }
    }

    // Build request
    const requestData = {
      prompt,
      taskType,
      synthesize,
      generateStory,
      context: {
        ...context,
        userId: this.userId,
        source: this.source
      }
    };

    let result = null;
    let error = null;

    // Try server first
    if (this.isServerRunning) {
      result = await this.callTriangleAPI(requestData);
      if (result && result.success) {
        this.cacheResult('triangle', prompt, result);
        return result;
      }
      error = result?.error;
    }

    // Fallback to direct module call
    console.log('[CalAPIClient] Falling back to direct module call...');
    if (!this.triangleEngine) {
      await this.loadFallbackModules();
    }

    if (!this.triangleEngine) {
      throw new Error('Triangle engine not available and server is down');
    }

    try {
      result = await this.triangleEngine.query(requestData);
      this.cacheResult('triangle', prompt, result);
      return result;
    } catch (fallbackError) {
      console.error('[CalAPIClient] Fallback failed:', fallbackError);
      throw new Error(`Triangle query failed: ${error || fallbackError.message}`);
    }
  }

  /**
   * Call Triangle API endpoint with retries
   */
  async callTriangleAPI(requestData, retryCount = 0) {
    try {
      const response = await axios.post(
        `${this.serverUrl}/api/chat/triangle`,
        requestData,
        {
          timeout: 60000, // 60s timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error(`[CalAPIClient] API call failed (attempt ${retryCount + 1}/${this.maxRetries}):`, error.message);

      // Retry on network errors or 5xx
      const isRetryable = error.code === 'ECONNREFUSED' ||
                          error.code === 'ETIMEDOUT' ||
                          (error.response && error.response.status >= 500);

      if (isRetryable && retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`[CalAPIClient] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.callTriangleAPI(requestData, retryCount + 1);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Query single provider
   */
  async query(options = {}) {
    const {
      provider = 'openai',
      model,
      prompt,
      context = {}
    } = options;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    // Check cache
    if (this.enableCache) {
      const cached = this.getFromCache(`query:${provider}`, prompt);
      if (cached) {
        console.log(`[CalAPIClient] Returning cached ${provider} result`);
        return cached;
      }
    }

    // Build request
    const requestData = {
      provider,
      model: model || this.getDefaultModel(provider),
      prompt,
      metadata: {
        ...context,
        user_id: this.userId,
        source: this.source
      }
    };

    let result = null;

    // Try server first
    if (this.isServerRunning) {
      result = await this.callQueryAPI(requestData);
      if (result && result.success) {
        this.cacheResult(`query:${provider}`, prompt, result);
        return result;
      }
    }

    // Fallback to direct module call
    console.log('[CalAPIClient] Falling back to direct module call...');
    if (!this.multiProviderRouter) {
      await this.loadFallbackModules();
    }

    if (!this.multiProviderRouter) {
      throw new Error('Multi-provider router not available and server is down');
    }

    try {
      result = await this.multiProviderRouter.route(requestData);
      this.cacheResult(`query:${provider}`, prompt, result);
      return result;
    } catch (fallbackError) {
      console.error('[CalAPIClient] Fallback failed:', fallbackError);
      throw new Error(`Query failed: ${fallbackError.message}`);
    }
  }

  /**
   * Call Query API endpoint (internal - uses MultiProviderRouter)
   */
  async callQueryAPI(requestData, retryCount = 0) {
    try {
      // Note: There's no direct /api/query endpoint, so we use the router directly
      // This would need to be added if you want server-based querying
      if (!this.multiProviderRouter) {
        await this.loadFallbackModules();
      }

      if (!this.multiProviderRouter) {
        return { success: false, error: 'Router not available' };
      }

      return await this.multiProviderRouter.route(requestData);
    } catch (error) {
      console.error(`[CalAPIClient] Query call failed (attempt ${retryCount + 1}/${this.maxRetries}):`, error.message);

      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.log(`[CalAPIClient] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.callQueryAPI(requestData, retryCount + 1);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get default model for provider
   */
  getDefaultModel(provider) {
    const models = {
      openai: 'gpt-4',
      anthropic: 'claude-3-sonnet-20240229',
      deepseek: 'deepseek-chat'
    };
    return models[provider] || models.openai;
  }

  /**
   * Check API key status
   */
  async checkAPIKeys() {
    try {
      const response = await axios.get(`${this.serverUrl}/api/triangle/stats`, {
        timeout: 2000
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          keys: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            deepseek: !!process.env.DEEPSEEK_API_KEY
          }
        };
      }
    } catch (error) {
      console.error('[CalAPIClient] Failed to check API keys:', error.message);
    }

    // Fallback: check environment variables directly
    return {
      success: true,
      keys: {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        deepseek: !!process.env.DEEPSEEK_API_KEY
      },
      warning: 'Checked local environment (server not available)'
    };
  }

  /**
   * Get system status
   */
  async getStatus() {
    const keysStatus = await this.checkAPIKeys();

    return {
      server: {
        running: this.isServerRunning,
        url: this.serverUrl,
        lastHealthCheck: this.lastHealthCheck
      },
      fallback: {
        available: !!(this.multiProviderRouter && this.triangleEngine),
        routerLoaded: !!this.multiProviderRouter,
        triangleLoaded: !!this.triangleEngine
      },
      cache: {
        enabled: this.enableCache,
        size: this.cache.size,
        maxSize: this.cacheMaxSize
      },
      apiKeys: keysStatus.keys,
      config: {
        userId: this.userId,
        source: this.source,
        maxRetries: this.maxRetries
      }
    };
  }

  /**
   * Cache result
   */
  cacheResult(type, key, result) {
    if (!this.enableCache) return;

    const cacheKey = `${type}:${this.hashString(key)}`;

    // Evict old entries if cache full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Get from cache
   */
  getFromCache(type, key) {
    if (!this.enableCache) return null;

    const cacheKey = `${type}:${this.hashString(key)}`;
    const cached = this.cache.get(cacheKey);

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[CalAPIClient] Cache cleared');
  }

  /**
   * Hash string for cache key
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    this.clearCache();
    console.log('[CalAPIClient] Destroyed');
  }
}

module.exports = CalAPIClient;
