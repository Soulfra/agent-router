/**
 * Unified Knowledge Interface
 *
 * Single API for querying all of Cal's knowledge stores:
 * - PostgreSQL knowledge_patterns (debugging patterns from knowledge-learning-routes)
 * - SQLite error_patterns (error fixes from pattern-learner)
 * - PostgreSQL notes (knowledge base with embeddings)
 * - PostgreSQL domain_code_examples (code patterns)
 * - PostgreSQL decision_archives (archived decisions)
 *
 * Provides:
 * - Unified search across all stores
 * - Relevance ranking
 * - Pattern recommendations based on context
 * - Error fix suggestions
 *
 * This is Cal's "memory" - what he's learned from past experiences.
 */

const PatternLearner = require('./pattern-learner');
const KnowledgeStore = require('./knowledge-store');
const PatternMatcher = require('./pattern-matcher');

class UnifiedKnowledgeInterface {
  constructor(options = {}) {
    this.db = options.db; // PostgreSQL
    this.patternLearner = options.patternLearner || new PatternLearner();
    this.knowledgeStore = options.knowledgeStore || new KnowledgeStore(this.db);
    this.patternMatcher = options.patternMatcher || (this.db ? new PatternMatcher({ db: this.db }) : null);

    // Cache for frequently accessed patterns
    this.cache = new Map();
    this.cacheMaxAge = 1000 * 60 * 10; // 10 minutes

    console.log('[UnifiedKnowledgeInterface] Initialized with', {
      hasPostgres: !!this.db,
      hasPatternLearner: !!this.patternLearner,
      hasKnowledgeStore: !!this.knowledgeStore,
      hasPatternMatcher: !!this.patternMatcher
    });
  }

  /**
   * Search all knowledge stores for relevant patterns
   *
   * @param {string} query - Search query
   * @param {object} context - Request context
   * @returns {Promise<object>} - Categorized patterns
   */
  async searchPatterns(query, context = {}) {
    try {
      console.log(`[UnifiedKnowledge] Searching for: "${query.substring(0, 60)}..."`);

      const results = {
        debuggingPatterns: [],
        errorFixes: [],
        codePatterns: [],
        knowledgeNotes: [],
        decisions: [],
        totalFound: 0
      };

      // Extract keywords for better matching
      const keywords = this._extractKeywords(query);

      // Parallel queries to all stores
      const queries = [
        this._searchDebuggingPatterns(query, keywords, context),
        this._searchErrorFixes(query, keywords),
        this._searchCodePatterns(query, keywords, context),
        this._searchKnowledgeNotes(query, keywords),
        this._searchDecisions(query, keywords)
      ];

      const [debugging, errors, code, notes, decisions] = await Promise.allSettled(queries);

      // Collect results
      if (debugging.status === 'fulfilled') results.debuggingPatterns = debugging.value;
      if (errors.status === 'fulfilled') results.errorFixes = errors.value;
      if (code.status === 'fulfilled') results.codePatterns = code.value;
      if (notes.status === 'fulfilled') results.knowledgeNotes = notes.value;
      if (decisions.status === 'fulfilled') results.decisions = decisions.value;

      results.totalFound =
        results.debuggingPatterns.length +
        results.errorFixes.length +
        results.codePatterns.length +
        results.knowledgeNotes.length +
        results.decisions.length;

      console.log(`[UnifiedKnowledge] Found ${results.totalFound} relevant patterns`);

      return results;

    } catch (error) {
      console.error('[UnifiedKnowledge] Search error:', error.message);
      return {
        debuggingPatterns: [],
        errorFixes: [],
        codePatterns: [],
        knowledgeNotes: [],
        decisions: [],
        totalFound: 0,
        error: error.message
      };
    }
  }

  /**
   * Get relevant patterns for current context (smart retrieval)
   *
   * @param {string} errorType - Error type if any
   * @param {array} keywords - Keywords from current context
   * @param {object} context - Additional context
   * @returns {Promise<array>} - Ranked patterns
   */
  async getRelevantPatterns(errorType, keywords = [], context = {}) {
    try {
      const cacheKey = `relevant_${errorType}_${keywords.join('_')}`;

      // Check cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheMaxAge) {
          console.log('[UnifiedKnowledge] Cache hit for relevant patterns');
          return cached.patterns;
        }
      }

      const patterns = [];

      // 1. If error type specified, get error fixes first (highest priority)
      if (errorType) {
        const errorFix = await this.patternLearner.suggestFix(errorType);
        if (errorFix && errorFix.confidence > 0) {
          patterns.push({
            type: 'error_fix',
            source: 'sqlite',
            errorType: errorFix.errorType,
            suggestion: errorFix.suggestion,
            confidence: errorFix.confidence,
            priority: 10,
            timesEncountered: errorFix.timesEncountered
          });
        }
      }

      // 2. Search debugging patterns in PostgreSQL
      if (keywords.length > 0) {
        const debuggingPatterns = await this._searchDebuggingPatterns(
          keywords.join(' '),
          keywords,
          context
        );

        for (const pattern of debuggingPatterns.slice(0, 3)) {
          patterns.push({
            type: 'debugging_pattern',
            source: 'postgresql',
            pattern: pattern.pattern,
            problem: pattern.problem,
            solution: pattern.solution,
            steps: pattern.steps,
            occurrences: pattern.occurrences,
            priority: 8,
            relevance: pattern.relevance || 0
          });
        }
      }

      // 3. Get similar code patterns if domain specified
      if (context.domain && this.patternMatcher) {
        const codePatterns = await this.patternMatcher.findSimilar(
          keywords.join(' '),
          context.domain,
          { limit: 2 }
        );

        for (const match of codePatterns) {
          patterns.push({
            type: 'code_pattern',
            source: 'postgresql',
            title: match.pattern.title,
            description: match.pattern.description,
            code: match.pattern.code,
            similarity: match.similarity,
            priority: 6,
            timesUsed: match.pattern.times_used
          });
        }
      }

      // 4. Sort by priority and relevance
      patterns.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return (b.confidence || b.relevance || b.similarity || 0) -
               (a.confidence || a.relevance || a.similarity || 0);
      });

      // Cache results
      this.cache.set(cacheKey, {
        patterns: patterns.slice(0, 10), // Top 10
        timestamp: Date.now()
      });

      console.log(`[UnifiedKnowledge] Retrieved ${patterns.length} relevant patterns`);

      return patterns.slice(0, 10);

    } catch (error) {
      console.error('[UnifiedKnowledge] Error getting relevant patterns:', error.message);
      return [];
    }
  }

  /**
   * Get ranked solutions for a problem
   *
   * @param {string} problem - Problem description
   * @returns {Promise<array>} - Solutions ranked by success rate
   */
  async getRankedSolutions(problem) {
    try {
      const keywords = this._extractKeywords(problem);

      // Search debugging patterns and error fixes
      const [debuggingPatterns, errorTrends] = await Promise.all([
        this._searchDebuggingPatterns(problem, keywords),
        this.patternLearner.detectErrorTrends(24)
      ]);

      const solutions = [];

      // Add debugging pattern solutions
      for (const pattern of debuggingPatterns) {
        solutions.push({
          solution: pattern.solution,
          problem: pattern.problem,
          steps: pattern.steps,
          successRate: 1.0, // Assume 100% since it's logged
          source: 'debugging_patterns',
          occurrences: pattern.occurrences
        });
      }

      // Add error fix solutions
      for (const trend of errorTrends) {
        if (trend.success_rate > 0.5) { // Only include if >50% success
          solutions.push({
            solution: trend.auto_fix,
            problem: trend.error_type,
            successRate: trend.success_rate,
            source: 'error_patterns',
            occurrences: trend.recent_count
          });
        }
      }

      // Rank by success rate and occurrence
      solutions.sort((a, b) => {
        const scoreA = a.successRate * Math.log(a.occurrences + 1);
        const scoreB = b.successRate * Math.log(b.occurrences + 1);
        return scoreB - scoreA;
      });

      return solutions.slice(0, 5);

    } catch (error) {
      console.error('[UnifiedKnowledge] Error getting ranked solutions:', error.message);
      return [];
    }
  }

  /**
   * Get error fix for specific error signature
   *
   * @param {string} errorSignature - Error message or type
   * @returns {Promise<object|null>} - Fix suggestion
   */
  async getErrorFix(errorSignature) {
    try {
      // Try exact match first
      const pattern = await this.patternLearner.getErrorPattern(errorSignature);
      if (pattern) {
        return {
          errorType: pattern.error_type,
          fix: pattern.auto_fix,
          confidence: parseFloat(pattern.success_rate || 0),
          occurrences: parseInt(pattern.count || 0),
          lastSeen: pattern.last_seen
        };
      }

      // Try fuzzy match using keywords
      const keywords = this._extractKeywords(errorSignature);
      const commonErrors = await this.patternLearner.getCommonErrors(20);

      for (const error of commonErrors) {
        const errorKeywords = this._extractKeywords(error.error_type);
        const matchScore = this._calculateKeywordOverlap(keywords, errorKeywords);

        if (matchScore > 0.5) { // 50% keyword overlap
          return {
            errorType: error.error_type,
            fix: error.auto_fix,
            confidence: parseFloat(error.success_rate || 0) * matchScore,
            occurrences: parseInt(error.count || 0),
            lastSeen: error.last_seen,
            fuzzyMatch: true
          };
        }
      }

      return null;

    } catch (error) {
      console.error('[UnifiedKnowledge] Error getting fix:', error.message);
      return null;
    }
  }

  /**
   * Format patterns for injection into AI prompt
   *
   * @param {array} patterns - Array of patterns
   * @returns {string} - Formatted text for prompt
   */
  formatForPrompt(patterns) {
    if (!patterns || patterns.length === 0) {
      return '';
    }

    let prompt = '\n\n## Cal\'s Learned Experience (Retrieved from Knowledge Base)\n\n';

    for (const pattern of patterns.slice(0, 5)) { // Top 5 only
      if (pattern.type === 'error_fix') {
        prompt += `🔧 **Error Fix** (${(pattern.confidence * 100).toFixed(0)}% confidence, seen ${pattern.timesEncountered}x):\n`;
        prompt += `   Error: ${pattern.errorType}\n`;
        prompt += `   Fix: ${pattern.suggestion}\n\n`;
      } else if (pattern.type === 'debugging_pattern') {
        prompt += `🐛 **Debugging Pattern** (occurred ${pattern.occurrences}x):\n`;
        prompt += `   Problem: ${pattern.problem}\n`;
        prompt += `   Solution: ${pattern.solution}\n`;
        if (pattern.steps && pattern.steps.length > 0) {
          prompt += `   Steps: ${pattern.steps.join(' → ')}\n`;
        }
        prompt += '\n';
      } else if (pattern.type === 'code_pattern') {
        prompt += `📝 **Code Pattern** (${(pattern.similarity * 100).toFixed(0)}% similar, used ${pattern.timesUsed}x):\n`;
        prompt += `   ${pattern.title}\n`;
        prompt += `   ${pattern.description}\n\n`;
      }
    }

    prompt += '*Use this knowledge to inform your response. If a learned pattern applies, reference it and apply the proven solution.*\n';

    return prompt;
  }

  /**
   * Get statistics across all knowledge stores
   *
   * @returns {Promise<object>} - Stats
   */
  async getStats() {
    try {
      const [errorStats, patternStats, codeStats] = await Promise.all([
        this.patternLearner.getErrorStats(),
        this._getPatternStats(),
        this.patternMatcher ? this.patternMatcher.getStats() : null
      ]);

      return {
        errorPatterns: errorStats,
        debuggingPatterns: patternStats,
        codePatterns: codeStats,
        cacheSize: this.cache.size
      };

    } catch (error) {
      console.error('[UnifiedKnowledge] Error getting stats:', error.message);
      return null;
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  async _searchDebuggingPatterns(query, keywords, context = {}) {
    if (!this.db) return [];

    try {
      // Build parameterized WHERE conditions for keywords
      const keywordConditions = keywords.map((_, idx) =>
        `problem_description ILIKE $${idx + 4}`
      ).join(' OR ');

      const params = [
        query,                                  // $1
        query,                                  // $2
        keywords.map(kw => `%${kw}%`),          // $3 (array for keywords::text ILIKE ANY)
        ...keywords.map(kw => `%${kw}%`)        // $4, $5, $6... for individual conditions
      ];

      const whereClause = keywords.length > 0
        ? `WHERE (${keywordConditions}) OR keywords::text ILIKE ANY($3::text[])`
        : `WHERE keywords::text ILIKE ANY($3::text[])`;

      const result = await this.db.query(`
        SELECT
          pattern_name,
          problem_description,
          solution_description,
          steps,
          keywords,
          severity,
          occurrence_count,
          last_seen_at,
          -- Calculate relevance score
          (
            CASE
              WHEN problem_description ILIKE $1 THEN 100
              WHEN problem_description ILIKE '%' || $2 || '%' THEN 50
              ELSE 0
            END +
            (occurrence_count * 5)
          ) as relevance_score
        FROM knowledge_patterns
        ${whereClause}
        ORDER BY relevance_score DESC, occurrence_count DESC
        LIMIT 10
      `, params);

      return result.rows.map(row => ({
        pattern: row.pattern_name,
        problem: row.problem_description,
        solution: row.solution_description,
        steps: row.steps ? JSON.parse(row.steps) : [],
        keywords: row.keywords || [],
        severity: row.severity,
        occurrences: row.occurrence_count,
        lastSeen: row.last_seen_at,
        relevance: row.relevance_score
      }));

    } catch (error) {
      console.error('[UnifiedKnowledge] Error searching debugging patterns:', error.message);
      return [];
    }
  }

  async _searchErrorFixes(query, keywords) {
    try {
      const commonErrors = await this.patternLearner.getCommonErrors(20);

      return commonErrors
        .filter(error => {
          const errorText = `${error.error_type} ${error.auto_fix}`.toLowerCase();
          return keywords.some(kw => errorText.includes(kw.toLowerCase()));
        })
        .map(error => ({
          errorType: error.error_type,
          fix: error.auto_fix,
          confidence: parseFloat(error.success_rate || 0),
          occurrences: parseInt(error.count || 0),
          lastSeen: error.last_seen
        }))
        .slice(0, 5);

    } catch (error) {
      console.error('[UnifiedKnowledge] Error searching error fixes:', error.message);
      return [];
    }
  }

  async _searchCodePatterns(query, keywords, context) {
    if (!this.patternMatcher || !context.domain) return [];

    try {
      const matches = await this.patternMatcher.findSimilar(query, context.domain, { limit: 5 });

      return matches.map(match => ({
        title: match.pattern.title,
        description: match.pattern.description,
        code: match.pattern.code,
        similarity: match.similarity,
        timesUsed: match.pattern.times_used,
        successRate: match.pattern.success_rate
      }));

    } catch (error) {
      console.error('[UnifiedKnowledge] Error searching code patterns:', error.message);
      return [];
    }
  }

  async _searchKnowledgeNotes(query, keywords) {
    if (!this.knowledgeStore || !this.db) return [];

    try {
      const notes = await this.knowledgeStore.searchNotes(query, { limit: 5 });

      return notes.map(note => ({
        title: note.title,
        preview: note.preview,
        category: note.category,
        tags: note.tags,
        createdAt: note.created_at
      }));

    } catch (error) {
      console.error('[UnifiedKnowledge] Error searching knowledge notes:', error.message);
      return [];
    }
  }

  async _searchDecisions(query, keywords) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT id, title, content, category, status, created_at
        FROM decisions
        WHERE (title ILIKE $1 OR content ILIKE $1)
          AND status != 'archived'
        ORDER BY created_at DESC
        LIMIT 3
      `, [`%${query}%`]);

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        preview: row.content.substring(0, 200),
        category: row.category,
        status: row.status,
        createdAt: row.created_at
      }));

    } catch (error) {
      console.error('[UnifiedKnowledge] Error searching decisions:', error.message);
      return [];
    }
  }

  async _getPatternStats() {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_patterns,
          SUM(occurrence_count) as total_occurrences,
          COUNT(DISTINCT category) as unique_categories
        FROM knowledge_patterns
      `);

      return result.rows[0];

    } catch (error) {
      console.error('[UnifiedKnowledge] Error getting pattern stats:', error.message);
      return null;
    }
  }

  _extractKeywords(text) {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'for', 'to',
      'of', 'in', 'on', 'at', 'by', 'with', 'from', 'how', 'what'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // Remove duplicates
  }

  _calculateKeywordOverlap(keywords1, keywords2) {
    const set1 = new Set(keywords1.map(k => k.toLowerCase()));
    const set2 = new Set(keywords2.map(k => k.toLowerCase()));

    const intersection = [...set1].filter(k => set2.has(k)).length;
    const union = new Set([...set1, ...set2]).size;

    return union > 0 ? intersection / union : 0;
  }
}

module.exports = UnifiedKnowledgeInterface;
