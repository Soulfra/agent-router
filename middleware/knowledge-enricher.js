/**
 * Knowledge Enricher Middleware
 *
 * Intercepts AI requests and enriches them with relevant patterns from Cal's knowledge base.
 *
 * How it works:
 * 1. Extract context from request (error messages, keywords, domain)
 * 2. Query UnifiedKnowledgeInterface for relevant patterns
 * 3. Inject patterns into system prompt as "Cal's Memory"
 * 4. Continue to AI handler with enriched context
 *
 * This is how Cal "remembers" what he's learned.
 *
 * Example:
 *   Before: User sends "Failed to fetch" → AI tries random fixes
 *   After:  User sends "Failed to fetch" → Middleware finds "missing_browser_polyfills" pattern
 *           → Injects into prompt → AI suggests proven fix
 */

class KnowledgeEnricher {
  constructor(options = {}) {
    this.knowledgeInterface = options.knowledgeInterface;
    this.enabled = options.enabled !== false; // Default ON

    if (!this.knowledgeInterface) {
      console.warn('[KnowledgeEnricher] No knowledge interface provided - enrichment disabled');
      this.enabled = false;
    }

    console.log('[KnowledgeEnricher] Initialized', { enabled: this.enabled });
  }

  /**
   * Express middleware function
   */
  middleware() {
    return async (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      try {
        // Extract context from request
        const context = this._extractContext(req);

        // Skip enrichment if no meaningful context
        if (!context.hasContext) {
          return next();
        }

        console.log('[KnowledgeEnricher] Enriching request with knowledge', {
          errorType: context.errorType,
          keywordCount: context.keywords.length,
          domain: context.domain
        });

        // Query relevant patterns
        const patterns = await this.knowledgeInterface.getRelevantPatterns(
          context.errorType,
          context.keywords,
          {
            domain: context.domain,
            severity: context.severity
          }
        );

        // Inject into request
        if (patterns.length > 0) {
          req.calKnowledge = {
            patterns,
            formattedPrompt: this.knowledgeInterface.formatForPrompt(patterns),
            enrichedAt: new Date(),
            patternCount: patterns.length
          };

          console.log(`[KnowledgeEnricher] ✓ Injected ${patterns.length} patterns into request`);
        } else {
          console.log('[KnowledgeEnricher] No relevant patterns found');
        }

        next();

      } catch (error) {
        console.error('[KnowledgeEnricher] Enrichment error:', error.message);
        // Don't fail the request - just continue without enrichment
        next();
      }
    };
  }

  /**
   * Direct enrichment for programmatic use (non-middleware)
   *
   * @param {string} prompt - User prompt
   * @param {object} context - Context
   * @returns {Promise<object>} - Enriched data
   */
  async enrich(prompt, context = {}) {
    if (!this.enabled) {
      return { enriched: false, prompt };
    }

    try {
      const extractedContext = this._extractContextFromText(prompt, context);

      const patterns = await this.knowledgeInterface.getRelevantPatterns(
        extractedContext.errorType,
        extractedContext.keywords,
        extractedContext
      );

      if (patterns.length === 0) {
        return { enriched: false, prompt, patterns: [] };
      }

      const enrichedPrompt = prompt + this.knowledgeInterface.formatForPrompt(patterns);

      return {
        enriched: true,
        originalPrompt: prompt,
        enrichedPrompt,
        patterns,
        patternCount: patterns.length
      };

    } catch (error) {
      console.error('[KnowledgeEnricher] Direct enrichment error:', error.message);
      return { enriched: false, prompt, error: error.message };
    }
  }

  /**
   * Get enrichment statistics
   *
   * @returns {Promise<object>} - Stats
   */
  async getStats() {
    if (!this.knowledgeInterface) {
      return { enabled: false };
    }

    return {
      enabled: this.enabled,
      knowledgeStats: await this.knowledgeInterface.getStats()
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Extract context from Express request
   * @private
   */
  _extractContext(req) {
    const context = {
      hasContext: false,
      errorType: null,
      keywords: [],
      domain: null,
      severity: 'info'
    };

    // Extract from request body
    if (req.body) {
      // Prompt/query text
      const text = req.body.prompt || req.body.query || req.body.message || req.body.problem || '';

      if (text) {
        context.hasContext = true;
        context.keywords = this._extractKeywords(text);

        // Detect error type
        const errorMatch = text.match(/error[:|\s]+([\w_]+)/i);
        if (errorMatch) {
          context.errorType = errorMatch[1];
        }

        // Check for common error patterns
        if (text.toLowerCase().includes('failed to fetch')) {
          context.errorType = 'fetch_error';
        } else if (text.toLowerCase().includes('button') && text.toLowerCase().includes('not work')) {
          context.errorType = 'ui_interaction_error';
        } else if (text.includes('PostgreSQL') || text.includes('interval')) {
          context.errorType = 'postgresql_error';
        }
      }

      // Domain context
      if (req.body.domain) {
        context.domain = req.body.domain;
        context.hasContext = true;
      }

      // Severity
      if (req.body.severity) {
        context.severity = req.body.severity;
      }

      // Error details
      if (req.body.errorType) {
        context.errorType = req.body.errorType;
        context.hasContext = true;
      }

      // Keywords
      if (req.body.keywords && Array.isArray(req.body.keywords)) {
        context.keywords.push(...req.body.keywords);
        context.hasContext = true;
      }
    }

    // Extract from query parameters
    if (req.query) {
      if (req.query.q || req.query.query) {
        const queryText = req.query.q || req.query.query;
        context.keywords.push(...this._extractKeywords(queryText));
        context.hasContext = true;
      }

      if (req.query.domain) {
        context.domain = req.query.domain;
        context.hasContext = true;
      }
    }

    // Remove duplicate keywords
    context.keywords = [...new Set(context.keywords)];

    return context;
  }

  /**
   * Extract context from text (for programmatic use)
   * @private
   */
  _extractContextFromText(text, additionalContext = {}) {
    const context = {
      hasContext: true,
      errorType: additionalContext.errorType || null,
      keywords: this._extractKeywords(text),
      domain: additionalContext.domain || null,
      severity: additionalContext.severity || 'info'
    };

    // Detect error type from text
    if (!context.errorType) {
      const errorMatch = text.match(/error[:|\s]+([\w_]+)/i);
      if (errorMatch) {
        context.errorType = errorMatch[1];
      }

      // Common error patterns
      if (text.toLowerCase().includes('failed to fetch')) {
        context.errorType = 'fetch_error';
      } else if (text.toLowerCase().includes('postgresql') && text.toLowerCase().includes('interval')) {
        context.errorType = 'postgresql_interval_overflow';
      } else if (text.toLowerCase().includes('button') && text.toLowerCase().includes('not work')) {
        context.errorType = 'ui_interaction_error';
      }
    }

    return context;
  }

  /**
   * Extract keywords from text
   * @private
   */
  _extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'for', 'to',
      'of', 'in', 'on', 'at', 'by', 'with', 'from', 'how', 'what',
      'why', 'when', 'where', 'this', 'that', 'these', 'those'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i) // Remove duplicates
      .slice(0, 20); // Limit to 20 keywords
  }
}

module.exports = KnowledgeEnricher;
