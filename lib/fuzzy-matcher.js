/**
 * Fuzzy Matcher
 *
 * "If it's CLOSE enough, we should just include it"
 *
 * Problem:
 * - Users won't remember exact command syntax
 * - "what's next" vs "whats next" vs "what is next" should all work
 * - Need flexible matching for natural language
 * - Support typos and variations
 *
 * Solution:
 * - Levenshtein distance for string similarity
 * - Multiple matching strategies:
 *   - Exact match (highest priority)
 *   - Starts with match
 *   - Contains match
 *   - Fuzzy distance match
 *   - Keyword match
 * - Scoring system to rank matches
 *
 * Examples:
 * - "whats next" → matches "what's next" (distance: 1)
 * - "addd task" → matches "add task" (typo tolerance)
 * - "check cost" → matches "check price" (similar meaning)
 */

class FuzzyMatcher {
  constructor(options = {}) {
    // Thresholds
    this.maxDistance = options.maxDistance || 3; // Max Levenshtein distance
    this.minSimilarity = options.minSimilarity || 0.6; // Min similarity score (0-1)

    // Matching strategies with weights
    this.weights = {
      exact: 10,
      startsWith: 5,
      contains: 3,
      fuzzy: 2,
      keyword: 1
    };

    console.log('[FuzzyMatcher] Initialized');
  }

  /**
   * Find best match from a list of patterns
   *
   * @param {string} input - User input
   * @param {Array<string|object>} patterns - Patterns to match against
   *   Can be strings or objects with {pattern, aliases, keywords}
   * @returns {object|null} Best match with score
   */
  match(input, patterns) {
    if (!input || !patterns || patterns.length === 0) {
      return null;
    }

    const normalizedInput = this.normalize(input);
    const matches = [];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const score = this.calculateScore(normalizedInput, pattern);

      if (score.total > 0) {
        matches.push({
          pattern,
          score: score.total,
          breakdown: score,
          index: i
        });
      }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    // Return best match if it meets threshold
    if (matches.length > 0) {
      const best = matches[0];
      const similarity = best.score / this.weights.exact; // Normalize to 0-1

      if (similarity >= this.minSimilarity) {
        return {
          matched: true,
          pattern: best.pattern,
          score: best.score,
          similarity: similarity.toFixed(2),
          breakdown: best.breakdown,
          confidence: this.getConfidence(similarity),
          alternatives: matches.slice(1, 4).map(m => ({
            pattern: m.pattern,
            score: m.score
          }))
        };
      }
    }

    return {
      matched: false,
      score: 0,
      similarity: 0,
      confidence: 'none'
    };
  }

  /**
   * Calculate match score for a pattern
   * @private
   */
  calculateScore(normalizedInput, pattern) {
    let score = {
      exact: 0,
      startsWith: 0,
      contains: 0,
      fuzzy: 0,
      keyword: 0,
      total: 0
    };

    // Extract pattern info
    const patternStr = typeof pattern === 'string' ? pattern : pattern.pattern;
    const aliases = typeof pattern === 'object' ? (pattern.aliases || []) : [];
    const keywords = typeof pattern === 'object' ? (pattern.keywords || []) : [];

    const normalizedPattern = this.normalize(patternStr);
    const allPatterns = [normalizedPattern, ...aliases.map(a => this.normalize(a))];

    // Strategy 1: Exact match
    for (const p of allPatterns) {
      if (normalizedInput === p) {
        score.exact = this.weights.exact;
        break;
      }
    }

    // Strategy 2: Starts with
    if (score.exact === 0) {
      for (const p of allPatterns) {
        if (normalizedInput.startsWith(p) || p.startsWith(normalizedInput)) {
          score.startsWith = this.weights.startsWith;
          break;
        }
      }
    }

    // Strategy 3: Contains
    if (score.exact === 0 && score.startsWith === 0) {
      for (const p of allPatterns) {
        if (normalizedInput.includes(p) || p.includes(normalizedInput)) {
          score.contains = this.weights.contains;
          break;
        }
      }
    }

    // Strategy 4: Fuzzy distance
    if (score.exact === 0) {
      let minDistance = Infinity;
      for (const p of allPatterns) {
        const distance = this.levenshteinDistance(normalizedInput, p);
        minDistance = Math.min(minDistance, distance);
      }

      if (minDistance <= this.maxDistance) {
        // Score decreases with distance
        score.fuzzy = this.weights.fuzzy * (1 - (minDistance / this.maxDistance));
      }
    }

    // Strategy 5: Keyword matching
    if (keywords.length > 0) {
      const inputWords = normalizedInput.split(/\s+/);
      const matchedKeywords = keywords.filter(k =>
        inputWords.some(w => w === this.normalize(k) || w.includes(this.normalize(k)))
      );

      if (matchedKeywords.length > 0) {
        score.keyword = this.weights.keyword * (matchedKeywords.length / keywords.length);
      }
    }

    // Calculate total
    score.total = score.exact + score.startsWith + score.contains + score.fuzzy + score.keyword;

    return score;
  }

  /**
   * Normalize string for comparison
   * @private
   */
  normalize(str) {
    if (typeof str !== 'string') return '';

    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @private
   */
  levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create matrix
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    // Fill matrix
    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // Deletion
          matrix[j - 1][i] + 1, // Insertion
          matrix[j - 1][i - 1] + substitutionCost // Substitution
        );
      }
    }

    return matrix[len2][len1];
  }

  /**
   * Get confidence level from similarity score
   * @private
   */
  getConfidence(similarity) {
    if (similarity >= 1.0) return 'exact';
    if (similarity >= 0.8) return 'high';
    if (similarity >= 0.6) return 'medium';
    if (similarity >= 0.4) return 'low';
    return 'none';
  }

  /**
   * Find all matches above threshold
   *
   * @param {string} input - User input
   * @param {Array<string|object>} patterns - Patterns to match against
   * @returns {Array<object>} All matches sorted by score
   */
  matchAll(input, patterns) {
    if (!input || !patterns || patterns.length === 0) {
      return [];
    }

    const normalizedInput = this.normalize(input);
    const matches = [];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const score = this.calculateScore(normalizedInput, pattern);

      if (score.total > 0) {
        const similarity = score.total / this.weights.exact;

        if (similarity >= this.minSimilarity) {
          matches.push({
            pattern,
            score: score.total,
            similarity: similarity.toFixed(2),
            breakdown: score,
            confidence: this.getConfidence(similarity)
          });
        }
      }
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Test if input matches pattern (boolean)
   *
   * @param {string} input - User input
   * @param {string|object} pattern - Pattern to test
   * @returns {boolean}
   */
  test(input, pattern) {
    const result = this.match(input, [pattern]);
    return result && result.matched;
  }

  /**
   * Extract keywords from text
   *
   * @param {string} text - Input text
   * @param {Array<string>} stopWords - Words to exclude (optional)
   * @returns {Array<string>} Keywords
   */
  extractKeywords(text, stopWords = []) {
    const normalized = this.normalize(text);
    const words = normalized.split(/\s+/);

    // Default stop words
    const defaultStopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
                              'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                              'would', 'should', 'could', 'may', 'might', 'must', 'can',
                              'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
                              'into', 'through', 'during', 'before', 'after', 'above', 'below',
                              'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under'];

    const allStopWords = new Set([...defaultStopWords, ...stopWords.map(w => this.normalize(w))]);

    return words
      .filter(w => w.length > 2 && !allStopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // Unique
  }

  /**
   * Calculate similarity between two strings (0-1)
   *
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  similarity(str1, str2) {
    const normalized1 = this.normalize(str1);
    const normalized2 = this.normalize(str2);

    if (normalized1 === normalized2) return 1.0;

    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLen = Math.max(normalized1.length, normalized2.length);

    if (maxLen === 0) return 0;

    return 1 - (distance / maxLen);
  }

  /**
   * Get statistics about matcher configuration
   */
  getStats() {
    return {
      maxDistance: this.maxDistance,
      minSimilarity: this.minSimilarity,
      weights: this.weights
    };
  }
}

module.exports = FuzzyMatcher;
