/**
 * Pattern Matcher
 *
 * Finds similar patterns in domain code library before generating new code
 *
 * Prevents bloat by:
 * - Finding existing patterns that match the request
 * - Scoring similarity (0-1)
 * - Suggesting patterns to reference/adapt instead of rewriting
 *
 * Similarity factors:
 * - Keyword overlap (title, description, pattern_name)
 * - Use case overlap
 * - Tag overlap
 * - Pattern category match
 * - Language match
 * - Framework match
 */

class PatternMatcher {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[PatternMatcher] Initialized');
  }

  /**
   * Find similar patterns for a given request
   *
   * @param {string} prompt - User prompt/request
   * @param {string} domainContext - Domain to search in
   * @param {object} options - Additional options
   * @returns {Promise<Array>} - Array of { pattern, similarity } objects
   */
  async findSimilar(prompt, domainContext, options = {}) {
    const {
      limit = 5,
      minSimilarity = 0.3,
      language = null,
      patternCategory = null
    } = options;

    try {
      console.log(`[PatternMatcher] Searching for patterns similar to: "${prompt.substring(0, 60)}..."`);

      // Extract keywords from prompt
      const keywords = this._extractKeywords(prompt);

      // Search database for matching patterns
      const patterns = await this._searchPatterns(domainContext, keywords, {
        language,
        patternCategory,
        limit: limit * 3 // Get more candidates for scoring
      });

      // Score each pattern
      const scored = patterns.map(pattern => ({
        pattern,
        similarity: this._calculateSimilarity(prompt, keywords, pattern)
      }));

      // Filter by minimum similarity and sort
      const filtered = scored
        .filter(s => s.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`[PatternMatcher] Found ${filtered.length} similar patterns (min similarity: ${minSimilarity})`);

      return filtered;

    } catch (error) {
      console.error('[PatternMatcher] Find similar error:', error.message);
      return [];
    }
  }

  /**
   * Check if prompt is asking for something that already exists
   *
   * @param {string} prompt - User prompt
   * @param {string} domainContext - Domain
   * @returns {Promise<object|null>} - Exact match pattern or null
   */
  async findExactMatch(prompt, domainContext) {
    try {
      const keywords = this._extractKeywords(prompt);
      const patterns = await this._searchPatterns(domainContext, keywords, { limit: 10 });

      for (const pattern of patterns) {
        const similarity = this._calculateSimilarity(prompt, keywords, pattern);

        // Exact match threshold: 0.85+
        if (similarity >= 0.85) {
          console.log(`[PatternMatcher] Exact match found: ${pattern.title} (${(similarity * 100).toFixed(1)}%)`);
          return {
            pattern,
            similarity,
            isExact: true
          };
        }
      }

      return null;

    } catch (error) {
      console.error('[PatternMatcher] Find exact match error:', error.message);
      return null;
    }
  }

  /**
   * Search patterns in database
   * @private
   */
  async _searchPatterns(domainContext, keywords, options = {}) {
    const { language, patternCategory, limit = 20 } = options;

    try {
      // Build search query
      let query = `
        SELECT
          example_id,
          pattern_name,
          pattern_category,
          title,
          description,
          use_cases,
          tags,
          language,
          framework,
          code,
          times_used,
          success_rate
        FROM domain_code_examples
        WHERE domain_context = $1
          AND status = 'active'
          AND is_current = true
      `;

      const params = [domainContext];
      let paramIndex = 2;

      // Add keyword search
      if (keywords.length > 0) {
        const keywordConditions = keywords.map((kw) => {
          return `(
            title ILIKE $${paramIndex}
            OR description ILIKE $${paramIndex}
            OR pattern_name ILIKE $${paramIndex}
            OR $${paramIndex + 1} = ANY(tags)
            OR $${paramIndex + 1} = ANY(use_cases)
          )`;
        });

        query += ` AND (${keywordConditions.join(' OR ')})`;

        for (const kw of keywords) {
          params.push(`%${kw}%`, kw);
          paramIndex += 2;
        }
      }

      // Add language filter
      if (language) {
        query += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      // Add category filter
      if (patternCategory) {
        query += ` AND pattern_category = $${paramIndex}`;
        params.push(patternCategory);
        paramIndex++;
      }

      query += `
        ORDER BY
          success_rate DESC NULLS LAST,
          times_used DESC,
          created_at DESC
        LIMIT $${paramIndex}
      `;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[PatternMatcher] Search patterns error:', error.message);
      return [];
    }
  }

  /**
   * Calculate similarity score between prompt and pattern
   * @private
   */
  _calculateSimilarity(prompt, promptKeywords, pattern) {
    let score = 0;
    let factors = 0;

    const promptLower = prompt.toLowerCase();
    const patternText = `${pattern.title} ${pattern.description} ${pattern.pattern_name}`.toLowerCase();

    // 1. Keyword overlap (weight: 0.3)
    const keywordMatches = promptKeywords.filter(kw =>
      patternText.includes(kw.toLowerCase())
    ).length;

    if (promptKeywords.length > 0) {
      score += (keywordMatches / promptKeywords.length) * 0.3;
      factors++;
    }

    // 2. Use case overlap (weight: 0.25)
    if (pattern.use_cases && pattern.use_cases.length > 0) {
      const useCaseMatches = pattern.use_cases.filter(uc =>
        promptLower.includes(uc.toLowerCase()) || uc.toLowerCase().includes(promptKeywords[0]?.toLowerCase())
      ).length;

      score += (useCaseMatches / pattern.use_cases.length) * 0.25;
      factors++;
    }

    // 3. Tag overlap (weight: 0.2)
    if (pattern.tags && pattern.tags.length > 0) {
      const tagMatches = pattern.tags.filter(tag =>
        promptLower.includes(tag.toLowerCase()) || promptKeywords.includes(tag.toLowerCase())
      ).length;

      score += (tagMatches / pattern.tags.length) * 0.2;
      factors++;
    }

    // 4. Title/description direct match (weight: 0.15)
    if (patternText.includes(promptLower.substring(0, 30)) || promptLower.includes(pattern.title.toLowerCase())) {
      score += 0.15;
      factors++;
    }

    // 5. Success rate bonus (weight: 0.1)
    if (pattern.success_rate) {
      score += pattern.success_rate * 0.1;
      factors++;
    }

    // Normalize if we have factors
    if (factors > 0) {
      // Already weighted, just ensure it's between 0-1
      return Math.min(1.0, score);
    }

    return 0;
  }

  /**
   * Extract keywords from prompt
   * @private
   */
  _extractKeywords(prompt) {
    // Remove common stop words
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'create',
      'make', 'build', 'write', 'generate', 'implement', 'add',
      'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
      'that', 'this', 'these', 'those', 'what', 'which', 'who',
      'how', 'when', 'where', 'why', 'please', 'simple', 'basic'
    ]);

    // Extract words, filter stop words
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Remove duplicates
    return [...new Set(words)];
  }

  /**
   * Build pattern reference suggestion
   *
   * @param {object} match - Pattern match from findSimilar()
   * @returns {string} - Suggestion text
   */
  buildSuggestion(match) {
    const { pattern, similarity } = match;

    let suggestion = `📌 Found similar pattern: **${pattern.title}** (${(similarity * 100).toFixed(0)}% match)\n`;

    if (pattern.description) {
      suggestion += `   ${pattern.description}\n`;
    }

    if (pattern.use_cases && pattern.use_cases.length > 0) {
      suggestion += `   Use cases: ${pattern.use_cases.slice(0, 3).join(', ')}\n`;
    }

    if (pattern.framework) {
      suggestion += `   Framework: ${pattern.framework}\n`;
    }

    suggestion += `   Times used: ${pattern.times_used}`;

    if (pattern.success_rate) {
      suggestion += ` | Success rate: ${(pattern.success_rate * 100).toFixed(0)}%`;
    }

    suggestion += `\n   Pattern ID: ${pattern.example_id}\n`;

    return suggestion;
  }

  /**
   * Get statistics
   */
  async getStats(domainContext = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_patterns,
          COUNT(DISTINCT pattern_category) as unique_categories,
          AVG(success_rate) as avg_success_rate,
          SUM(times_used) as total_uses
        FROM domain_code_examples
        WHERE status = 'active' AND is_current = true
      `;

      const params = [];

      if (domainContext) {
        query += ' AND domain_context = $1';
        params.push(domainContext);
      }

      const result = await this.db.query(query, params);

      return result.rows[0];

    } catch (error) {
      console.error('[PatternMatcher] Get stats error:', error.message);
      return null;
    }
  }
}

module.exports = PatternMatcher;
