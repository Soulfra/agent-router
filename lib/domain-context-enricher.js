/**
 * Domain Context Enricher
 *
 * "Vortex Entry" - Enriches prompts with domain-specific knowledge
 *
 * Loads from database:
 * - Domain parameters (temperature, system_prompt_suffix)
 * - Style guide (indent, quotes, naming conventions)
 * - Anti-patterns (what NOT to do)
 * - Top patterns (common successful patterns)
 *
 * Injects into prompt so model generates domain-fitted code
 */

class DomainContextEnricher {
  constructor(options = {}) {
    this.db = options.db;
    this.domainCodeLibrary = options.domainCodeLibrary;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    // Cache for domain contexts (TTL: 5 minutes)
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 300000;

    console.log('[DomainContextEnricher] Initialized');
  }

  /**
   * Enrich prompt with domain context
   *
   * @param {string} prompt - Original user prompt
   * @param {string} domainContext - Domain: 'code', 'creative', 'reasoning', etc.
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Enriched context object
   */
  async enrich(prompt, domainContext, options = {}) {
    const {
      includePatterns = true,
      includeStyleGuide = true,
      includeAntiPatterns = true,
      maxPatterns = 3
    } = options;

    try {
      // Check cache first
      const cacheKey = `${domainContext}_${includePatterns}_${includeStyleGuide}_${includeAntiPatterns}`;
      const cached = this._getFromCache(cacheKey);

      if (cached) {
        console.log(`[DomainContextEnricher] Using cached context for: ${domainContext}`);
        return {
          ...cached,
          originalPrompt: prompt
        };
      }

      console.log(`[DomainContextEnricher] Enriching for domain: ${domainContext}`);

      // Load all domain context in parallel
      const [parameters, styleGuide, antiPatterns, topPatterns] = await Promise.all([
        this._loadDomainParameters(domainContext),
        includeStyleGuide ? this._loadStyleGuide(domainContext) : null,
        includeAntiPatterns ? this._loadAntiPatterns(domainContext) : null,
        includePatterns ? this._loadTopPatterns(domainContext, maxPatterns) : null
      ]);

      // Build enriched context
      const enrichedContext = {
        domainContext,
        originalPrompt: prompt,
        parameters,
        styleGuide,
        antiPatterns,
        topPatterns,
        timestamp: Date.now()
      };

      // Cache for future use
      this._setCache(cacheKey, enrichedContext);

      return enrichedContext;

    } catch (error) {
      console.error('[DomainContextEnricher] Enrichment error:', error.message);
      // Return minimal context on error
      return {
        domainContext,
        originalPrompt: prompt,
        parameters: null,
        styleGuide: null,
        antiPatterns: null,
        topPatterns: null
      };
    }
  }

  /**
   * Build domain-aware system prompt
   *
   * @param {object} enrichedContext - Context from enrich()
   * @returns {string} - System prompt with domain knowledge
   */
  buildSystemPrompt(enrichedContext) {
    const { domainContext, parameters, styleGuide, antiPatterns, topPatterns } = enrichedContext;

    let systemPrompt = `You are a specialized AI assistant for the "${domainContext}" domain.\n\n`;

    // Add domain parameters suffix if available
    if (parameters?.system_prompt_suffix) {
      systemPrompt += parameters.system_prompt_suffix + '\n\n';
    }

    // Add style guide
    if (styleGuide) {
      systemPrompt += '## Coding Style Guidelines\n\n';
      systemPrompt += `- Indentation: ${styleGuide.indent_size} ${styleGuide.indent_style}\n`;
      systemPrompt += `- Quotes: ${styleGuide.quote_style || 'single'}\n`;
      systemPrompt += `- Naming: Variables ${styleGuide.variable_case}, Functions ${styleGuide.function_case}, Classes ${styleGuide.class_case}\n`;
      systemPrompt += `- Line length: Max ${styleGuide.line_length} characters\n`;

      if (styleGuide.best_practices && styleGuide.best_practices.length > 0) {
        systemPrompt += '\n### Best Practices:\n';
        for (const practice of styleGuide.best_practices.slice(0, 5)) {
          systemPrompt += `- ${practice}\n`;
        }
      }

      systemPrompt += '\n';
    }

    // Add anti-patterns
    if (antiPatterns && antiPatterns.length > 0) {
      systemPrompt += '## Anti-Patterns to Avoid\n\n';
      systemPrompt += 'Do NOT use these patterns:\n';
      for (const antiPattern of antiPatterns.slice(0, 3)) {
        systemPrompt += `- ❌ ${antiPattern.anti_pattern_name}: ${antiPattern.why_bad}\n`;
      }
      systemPrompt += '\n';
    }

    // Add top patterns as examples
    if (topPatterns && topPatterns.length > 0) {
      systemPrompt += '## Common Patterns in This Domain\n\n';
      systemPrompt += 'Use these established patterns when applicable:\n';
      for (const pattern of topPatterns.slice(0, 3)) {
        systemPrompt += `- ✓ ${pattern.title}: ${pattern.description}\n`;
      }
      systemPrompt += '\n';
    }

    systemPrompt += 'Generate code that follows these domain-specific guidelines and patterns.';

    return systemPrompt;
  }

  /**
   * Build enriched user prompt with examples
   *
   * @param {string} originalPrompt - Original user request
   * @param {object} enrichedContext - Context from enrich()
   * @returns {string} - Enhanced prompt with domain context
   */
  buildUserPrompt(originalPrompt, enrichedContext) {
    const { topPatterns } = enrichedContext;

    let userPrompt = originalPrompt;

    // Add pattern examples if relevant
    if (topPatterns && topPatterns.length > 0) {
      userPrompt += '\n\nHere are some relevant patterns from this domain for reference:\n';

      for (const pattern of topPatterns.slice(0, 2)) {
        userPrompt += `\n### ${pattern.title}\n`;
        if (pattern.description) {
          userPrompt += `${pattern.description}\n`;
        }
        if (pattern.use_cases && pattern.use_cases.length > 0) {
          userPrompt += `Use cases: ${pattern.use_cases.join(', ')}\n`;
        }
      }
    }

    return userPrompt;
  }

  /**
   * Load domain parameters from database
   * @private
   */
  async _loadDomainParameters(domainContext) {
    try {
      const result = await this.db.query(`
        SELECT * FROM get_recommended_preset($1, NULL)
      `, [domainContext]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Fallback: get any default preset
      const fallback = await this.db.query(`
        SELECT * FROM domain_parameter_presets
        WHERE domain_context = $1 AND is_default = true
        LIMIT 1
      `, [domainContext]);

      return fallback.rows[0] || null;

    } catch (error) {
      console.error('[DomainContextEnricher] Load parameters error:', error.message);
      return null;
    }
  }

  /**
   * Load style guide from database
   * @private
   */
  async _loadStyleGuide(domainContext) {
    try {
      const result = await this.db.query(`
        SELECT * FROM domain_style_guides
        WHERE domain_context = $1
      `, [domainContext]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('[DomainContextEnricher] Load style guide error:', error.message);
      return null;
    }
  }

  /**
   * Load anti-patterns from database
   * @private
   */
  async _loadAntiPatterns(domainContext) {
    try {
      const result = await this.db.query(`
        SELECT
          anti_pattern_name,
          anti_pattern_category,
          why_bad,
          severity
        FROM domain_anti_patterns
        WHERE domain_context = $1
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'error' THEN 2
            WHEN 'warning' THEN 3
            ELSE 4
          END,
          created_at DESC
        LIMIT 5
      `, [domainContext]);

      return result.rows;

    } catch (error) {
      console.error('[DomainContextEnricher] Load anti-patterns error:', error.message);
      return [];
    }
  }

  /**
   * Load top patterns from database
   * @private
   */
  async _loadTopPatterns(domainContext, limit = 5) {
    try {
      const result = await this.db.query(`
        SELECT
          example_id,
          pattern_name,
          title,
          description,
          use_cases,
          tags,
          times_used,
          success_rate
        FROM domain_code_examples
        WHERE domain_context = $1
          AND status = 'active'
          AND is_current = true
        ORDER BY
          success_rate DESC NULLS LAST,
          times_used DESC,
          created_at DESC
        LIMIT $2
      `, [domainContext, limit]);

      return result.rows;

    } catch (error) {
      console.error('[DomainContextEnricher] Load top patterns error:', error.message);
      return [];
    }
  }

  /**
   * Get from cache
   * @private
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cache
   * @private
   */
  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache (useful for testing or after domain updates)
   */
  clearCache() {
    this.cache.clear();
    console.log('[DomainContextEnricher] Cache cleared');
  }

  /**
   * Get enrichment statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL
    };
  }
}

module.exports = DomainContextEnricher;
