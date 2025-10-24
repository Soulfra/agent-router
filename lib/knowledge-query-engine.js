/**
 * Knowledge Query Engine
 *
 * Searches stored knowledge/documentation using UnifiedKnowledgeInterface.
 * Provides a simple interface for querying all of Cal's learned patterns.
 */

const UnifiedKnowledgeInterface = require('./unified-knowledge-interface');

class KnowledgeQueryEngine {
  constructor(options = {}) {
    this.unifiedKnowledge = options.unifiedKnowledge;

    if (!this.unifiedKnowledge && options.db) {
      // Auto-initialize if database provided
      this.unifiedKnowledge = new UnifiedKnowledgeInterface({
        db: options.db,
        patternLearner: options.patternLearner,
        knowledgeStore: options.knowledgeStore,
        patternMatcher: options.patternMatcher
      });
    }

    console.log('[KnowledgeQueryEngine] Initialized', {
      hasUnifiedKnowledge: !!this.unifiedKnowledge
    });
  }

  /**
   * Query knowledge base
   * @param {string} query - Search query
   * @param {object} context - Additional context
   * @returns {Promise<array>} Results
   */
  async query(query, context = {}) {
    if (!this.unifiedKnowledge) {
      console.warn('[KnowledgeQueryEngine] No unified knowledge interface - returning empty results');
      return [];
    }

    try {
      const results = await this.unifiedKnowledge.searchPatterns(query, context);

      // Flatten results into single array
      const allPatterns = [
        ...results.debuggingPatterns.map(p => ({ ...p, type: 'debugging' })),
        ...results.errorFixes.map(p => ({ ...p, type: 'error_fix' })),
        ...results.codePatterns.map(p => ({ ...p, type: 'code_pattern' })),
        ...results.knowledgeNotes.map(p => ({ ...p, type: 'knowledge_note' })),
        ...results.decisions.map(p => ({ ...p, type: 'decision' }))
      ];

      return allPatterns;

    } catch (error) {
      console.error('[KnowledgeQueryEngine] Query error:', error.message);
      return [];
    }
  }

  /**
   * Get relevant patterns for context
   * @param {object} context - Context with errorType, keywords, domain
   * @returns {Promise<array>} Relevant patterns
   */
  async getRelevant(context = {}) {
    if (!this.unifiedKnowledge) {
      return [];
    }

    try {
      return await this.unifiedKnowledge.getRelevantPatterns(
        context.errorType,
        context.keywords || [],
        context
      );
    } catch (error) {
      console.error('[KnowledgeQueryEngine] Get relevant error:', error.message);
      return [];
    }
  }

  /**
   * Get solutions for a problem
   * @param {string} problem - Problem description
   * @returns {Promise<array>} Solutions
   */
  async getSolutions(problem) {
    if (!this.unifiedKnowledge) {
      return [];
    }

    try {
      return await this.unifiedKnowledge.getRankedSolutions(problem);
    } catch (error) {
      console.error('[KnowledgeQueryEngine] Get solutions error:', error.message);
      return [];
    }
  }

  /**
   * Get error fix
   * @param {string} errorSignature - Error signature
   * @returns {Promise<object|null>} Fix
   */
  async getErrorFix(errorSignature) {
    if (!this.unifiedKnowledge) {
      return null;
    }

    try {
      return await this.unifiedKnowledge.getErrorFix(errorSignature);
    } catch (error) {
      console.error('[KnowledgeQueryEngine] Get error fix error:', error.message);
      return null;
    }
  }

  /**
   * Add knowledge to base (legacy method for compatibility)
   * @param {object} knowledge - Knowledge entry
   */
  async add(knowledge) {
    console.warn('[KnowledgeQueryEngine] add() is deprecated - use knowledge-learning-routes instead');
    // This is now handled by knowledge-learning-routes.js POST /api/knowledge/learn-from-session
  }

  /**
   * Get all knowledge (legacy method)
   */
  async getAll() {
    if (!this.unifiedKnowledge) {
      return [];
    }

    try {
      // Return stats instead of all knowledge (could be huge)
      const stats = await this.unifiedKnowledge.getStats();
      return {
        note: 'Use query() to search knowledge. getAll() now returns stats.',
        stats
      };
    } catch (error) {
      console.error('[KnowledgeQueryEngine] Get all error:', error.message);
      return [];
    }
  }

  /**
   * Get statistics
   * @returns {Promise<object>} Stats
   */
  async getStats() {
    if (!this.unifiedKnowledge) {
      return null;
    }

    try {
      return await this.unifiedKnowledge.getStats();
    } catch (error) {
      console.error('[KnowledgeQueryEngine] Get stats error:', error.message);
      return null;
    }
  }
}

module.exports = KnowledgeQueryEngine;
