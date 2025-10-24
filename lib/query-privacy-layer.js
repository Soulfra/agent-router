/**
 * Query Privacy Layer
 *
 * Obfuscates queries from external LLM providers to protect privacy.
 * Automatically routes sensitive queries to local models (Ollama).
 *
 * Features:
 * - Sensitive query detection (PII, secrets, private data)
 * - Auto-routing to Ollama for sensitive queries
 * - Query logging to encrypted vault (not console)
 * - Provider tracking (which queries went where)
 *
 * Use Cases:
 * - User asks about "my API keys" → routes to Ollama (local)
 * - User asks about "quantum computing" → routes to GPT-4/Claude (public)
 * - CalRiven researches "customer names" → Ollama only
 * - Transparent to user (automatic routing)
 *
 * Example:
 *   const privacyLayer = new QueryPrivacyLayer({ llmRouter, vault });
 *   const response = await privacyLayer.query('What are my API keys?');
 *   // → Automatically routed to Ollama (no external API call)
 */

class QueryPrivacyLayer {
  constructor(options = {}) {
    this.config = {
      llmRouter: options.llmRouter,
      vault: options.vault,

      // Privacy settings
      alwaysUseLocal: options.alwaysUseLocal || false, // Force Ollama for all queries
      logQueries: options.logQueries !== false,
      logToConsole: options.logToConsole || false,

      // Sensitive patterns
      sensitivePatterns: options.sensitivePatterns || [
        // PII
        /\b(ssn|social security|phone number|address|email|password|pin)\b/i,
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/, // Email

        // Secrets
        /\b(api[_\s]?key|secret|token|credential|private[_\s]?key)\b/i,
        /\b(sk-[a-zA-Z0-9]{32,})\b/, // OpenAI API key format
        /\b(ghp_[a-zA-Z0-9]{36})\b/, // GitHub token

        // Private data
        /\b(my|mine|our|company|customer|client|user[_\s]?name)\b/i,
        /\b(confidential|proprietary|internal|private)\b/i,

        // Financial
        /\b(credit[_\s]?card|bank[_\s]?account|routing[_\s]?number|cvv)\b/i,
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card format

        // Local file paths
        /\b(\/Users|C:\\|\/home|\/etc|\/var)\b/
      ]
    };

    // Query log
    this.queryLog = [];
    this.stats = {
      totalQueries: 0,
      sensitiveQueries: 0,
      localQueries: 0,
      externalQueries: 0
    };

    console.log('[QueryPrivacyLayer] Initialized' + (this.config.alwaysUseLocal ? ' (LOCAL ONLY MODE)' : ''));
  }

  /**
   * Query with automatic privacy routing
   */
  async query(prompt, options = {}) {
    this.stats.totalQueries++;

    // Check if query is sensitive
    const isSensitive = this._isSensitive(prompt);

    if (isSensitive) {
      this.stats.sensitiveQueries++;
      this.log(`[QueryPrivacyLayer] 🔒 Sensitive query detected, routing to LOCAL model`);
    }

    // Determine routing
    const useLocal = this.config.alwaysUseLocal || isSensitive || options.forceLocal;

    // Route query
    const response = await this._routeQuery(prompt, useLocal, options);

    // Log query
    if (this.config.logQueries) {
      await this._logQuery(prompt, response, useLocal, isSensitive);
    }

    return response;
  }

  /**
   * Check if query contains sensitive data
   */
  _isSensitive(prompt) {
    for (const pattern of this.config.sensitivePatterns) {
      if (pattern.test(prompt)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Route query to appropriate model
   */
  async _routeQuery(prompt, useLocal, options = {}) {
    if (useLocal) {
      this.stats.localQueries++;

      // Use Ollama models (local-only)
      const localModel = options.model || 'qwen2.5-coder:32b';

      this.log(`[QueryPrivacyLayer] Routing to LOCAL: ${localModel}`);

      return await this.config.llmRouter.complete({
        prompt,
        model: localModel,
        preferredProvider: 'ollama',
        ...options
      });
    } else {
      this.stats.externalQueries++;

      // Use external models (GPT-4, Claude, DeepSeek)
      this.log(`[QueryPrivacyLayer] Routing to EXTERNAL model`);

      return await this.config.llmRouter.complete({
        prompt,
        ...options
      });
    }
  }

  /**
   * Log query to encrypted vault
   */
  async _logQuery(prompt, response, useLocal, isSensitive) {
    if (!this.config.vault) return;

    const logEntry = {
      prompt: isSensitive ? '[REDACTED - SENSITIVE]' : prompt,
      model: response.model || 'unknown',
      provider: response.provider || 'unknown',
      useLocal,
      isSensitive,
      timestamp: new Date().toISOString(),
      responseTime: response.latency || 0
    };

    // Store in vault (7 days)
    await this.config.vault.store(
      'query_privacy',
      'logs',
      `query_${Date.now()}`,
      logEntry,
      { ttl: 604800 } // 7 days
    ).catch(() => {}); // Ignore errors

    // Add to in-memory log (max 100 entries)
    this.queryLog.push(logEntry);
    if (this.queryLog.length > 100) {
      this.queryLog.shift();
    }
  }

  /**
   * Add custom sensitive pattern
   */
  addSensitivePattern(pattern) {
    if (typeof pattern === 'string') {
      pattern = new RegExp(pattern, 'i');
    }

    this.config.sensitivePatterns.push(pattern);
    this.log(`[QueryPrivacyLayer] Added sensitive pattern: ${pattern}`);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      sensitiveRate: this.stats.totalQueries > 0
        ? (this.stats.sensitiveQueries / this.stats.totalQueries * 100).toFixed(1) + '%'
        : '0%',
      localRate: this.stats.totalQueries > 0
        ? (this.stats.localQueries / this.stats.totalQueries * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Get recent queries
   */
  getRecentQueries(limit = 10) {
    return this.queryLog.slice(-limit).reverse();
  }

  /**
   * Log message (respects privacy settings)
   */
  log(message) {
    if (this.config.logToConsole) {
      console.log(message);
    }
  }
}

module.exports = QueryPrivacyLayer;
