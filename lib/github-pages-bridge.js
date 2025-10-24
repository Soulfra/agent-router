/**
 * GitHub Pages Bridge
 *
 * Connects GitHub Pages (static site) to localhost API (dynamic backend)
 * Enables "roundabout charging" - users think they're on static site,
 * actually hitting API which tracks usage and builds profiles
 *
 * Features:
 * - Auto-detects localhost vs production
 * - BYOK (Bring Your Own Key) support
 * - Device fingerprinting
 * - Usage tracking
 * - Profile building
 *
 * Usage (Browser):
 * const bridge = new GitHubPagesBridge();
 * const result = await bridge.callAPI('/api/agent', { prompt: '...' });
 *
 * @version 1.0.0
 * @license MIT
 */

class GitHubPagesBridge {
  constructor(config = {}) {
    // Detect environment
    this.isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
       window.location.hostname === '127.0.0.1');

    // API base URL
    this.apiBase = config.apiBase || this._detectAPIBase();

    // Config
    this.config = {
      enableBYOK: config.enableBYOK !== false,
      enableTracking: config.enableTracking !== false,
      enableCaching: config.enableCaching !== false,
      cacheDuration: config.cacheDuration || 5 * 60 * 1000, // 5 minutes
      ...config
    };

    // Cache
    this.cache = new Map();

    console.log(`[GitHubPagesBridge] Initialized - API: ${this.apiBase}`);
  }

  /**
   * Detect API base URL based on environment
   */
  _detectAPIBase() {
    if (typeof window === 'undefined') {
      // Node.js environment
      return 'http://localhost:5001';
    }

    // Browser environment
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Running on localhost
      return `http://localhost:${window.location.port || 5001}`;
    }

    if (hostname.includes('github.io')) {
      // Running on GitHub Pages - still point to localhost
      // User needs to have localhost:5001 running
      return 'http://localhost:5001';
    }

    // Default
    return 'http://localhost:5001';
  }

  /**
   * Call API endpoint
   * @param {string} endpoint - API endpoint path (e.g., '/api/agent')
   * @param {object} data - Request data
   * @param {object} options - Additional options
   * @returns {Promise<object>} - API response
   */
  async callAPI(endpoint, data = {}, options = {}) {
    try {
      // Check cache
      if (this.config.enableCaching && options.cache !== false) {
        const cacheKey = this._getCacheKey(endpoint, data);
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.config.cacheDuration) {
          console.log(`[Bridge] Cache hit: ${endpoint}`);
          return cached.data;
        }
      }

      // Get BYOK if available
      const byok = this.config.enableBYOK ? this._getBYOK() : null;

      // Get device fingerprint
      const fingerprint = this._getDeviceFingerprint();

      // Get user session
      const session = this._getUserSession();

      // Get network info
      const network = await this._getNetworkInfo();

      // Build request
      const url = `${this.apiBase}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(byok && { 'X-User-API-Key': byok }),
        ...(fingerprint && { 'X-Device-Fingerprint': fingerprint }),
        ...(session?.userId && { 'X-User-ID': session.userId }),
        ...(network?.ip && { 'X-Client-IP': network.ip }),
        ...(options.headers || {})
      };

      console.log(`[Bridge] ${options.method || 'POST'} ${endpoint}`);

      // Make request
      const response = await fetch(url, {
        method: options.method || 'POST',
        headers,
        body: options.method === 'GET' ? undefined : JSON.stringify(data),
        credentials: 'omit' // Don't send cookies cross-origin
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Cache result
      if (this.config.enableCaching && options.cache !== false) {
        const cacheKey = this._getCacheKey(endpoint, data);
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      // Track usage
      if (this.config.enableTracking) {
        this._trackUsage(endpoint, data, result);
      }

      return result;

    } catch (error) {
      console.error(`[Bridge] Error calling ${endpoint}:`, error);

      // Check if localhost API is running
      if (error.message.includes('Failed to fetch')) {
        throw new Error(
          'Cannot connect to localhost API. Make sure CalOS router is running on http://localhost:5001'
        );
      }

      throw error;
    }
  }

  /**
   * Get BYOK (Bring Your Own Key) from localStorage
   */
  _getBYOK() {
    if (typeof window === 'undefined') return null;

    const stored = localStorage.getItem('calos_byok');
    if (!stored) return null;

    try {
      const byok = JSON.parse(stored);
      return byok.encrypted || byok.key; // Support both encrypted and plain
    } catch (error) {
      console.warn('[Bridge] Failed to parse BYOK:', error);
      return null;
    }
  }

  /**
   * Get device fingerprint
   */
  _getDeviceFingerprint() {
    if (typeof window === 'undefined') return null;

    // Try CalOSIdentity (from identity-tracker.js)
    if (window.CalOSIdentity?.fingerprint) {
      return window.CalOSIdentity.fingerprint;
    }

    // Fallback: simple fingerprint
    return this._generateSimpleFingerprint();
  }

  /**
   * Generate simple fingerprint
   */
  _generateSimpleFingerprint() {
    if (typeof window === 'undefined') return null;

    const components = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset()
    ];

    return components.join('|');
  }

  /**
   * Get user session from localStorage
   */
  _getUserSession() {
    if (typeof window === 'undefined') return null;

    const stored = localStorage.getItem('calos_session');
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn('[Bridge] Failed to parse session:', error);
      return null;
    }
  }

  /**
   * Get network info
   */
  async _getNetworkInfo() {
    if (typeof window === 'undefined') return null;

    // Try LocalNetworkDetector if available
    if (window.LocalNetworkDetector) {
      try {
        const detector = new window.LocalNetworkDetector();
        return await detector.detect();
      } catch (error) {
        console.warn('[Bridge] LocalNetworkDetector failed:', error);
      }
    }

    return null;
  }

  /**
   * Track API usage (localStorage + PostgreSQL sync)
   */
  _trackUsage(endpoint, request, response) {
    if (typeof window === 'undefined') return;

    // Get or create usage log
    let usageLog = localStorage.getItem('calos_usage_log');
    if (!usageLog) {
      usageLog = JSON.stringify([]);
    }

    try {
      const log = JSON.parse(usageLog);

      const entry = {
        endpoint,
        timestamp: Date.now(),
        requestSize: JSON.stringify(request).length,
        responseSize: JSON.stringify(response).length,
        tokensUsed: response.usage?.total_tokens || 0,
        model: response.model || request.model || 'unknown',
        source: this._getBYOK() ? 'byok' : 'system'
      };

      // Add to local log
      log.push(entry);

      // Keep only last 100 entries
      if (log.length > 100) {
        log.splice(0, log.length - 100);
      }

      localStorage.setItem('calos_usage_log', JSON.stringify(log));

      // Sync to PostgreSQL (async, non-blocking)
      this._syncUsageToDatabase(entry).catch(error => {
        console.warn('[Bridge] Failed to sync usage to database:', error);
      });

    } catch (error) {
      console.warn('[Bridge] Failed to track usage:', error);
    }
  }

  /**
   * Sync usage to PostgreSQL
   */
  async _syncUsageToDatabase(entry) {
    if (typeof window === 'undefined') return;

    try {
      const session = this._getUserSession();
      const userId = session?.userId || 'anonymous';
      const fingerprint = this._getDeviceFingerprint();

      // Send to server
      const response = await fetch(`${this.apiBase}/api/usage/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId,
          'X-Device-Fingerprint': fingerprint
        },
        body: JSON.stringify({
          endpoint: entry.endpoint,
          model: entry.model,
          tokens: entry.tokensUsed,
          keySource: entry.source,
          timestamp: entry.timestamp
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      console.log('[Bridge] Usage synced to database');
    } catch (error) {
      // Don't throw - tracking should never break the app
      console.warn('[Bridge] Database sync error:', error);
    }
  }

  /**
   * Get cache key
   */
  _getCacheKey(endpoint, data) {
    return `${endpoint}:${JSON.stringify(data)}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[Bridge] Cache cleared');
  }

  /**
   * Get usage stats
   */
  getUsageStats() {
    if (typeof window === 'undefined') return null;

    const usageLog = localStorage.getItem('calos_usage_log');
    if (!usageLog) return { calls: 0, tokens: 0 };

    try {
      const log = JSON.parse(usageLog);

      return {
        calls: log.length,
        tokens: log.reduce((sum, entry) => sum + (entry.tokensUsed || 0), 0),
        byokCalls: log.filter(e => e.source === 'byok').length,
        systemCalls: log.filter(e => e.source === 'system').length,
        lastCall: log[log.length - 1]?.timestamp || null
      };
    } catch (error) {
      console.warn('[Bridge] Failed to get usage stats:', error);
      return { calls: 0, tokens: 0 };
    }
  }

  /**
   * Check if localhost API is running
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.apiBase}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubPagesBridge;
} else if (typeof window !== 'undefined') {
  window.GitHubPagesBridge = GitHubPagesBridge;
}
