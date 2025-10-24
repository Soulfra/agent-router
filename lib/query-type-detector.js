/**
 * Query Type Detector
 *
 * Detects the intent of a user query to route to appropriate handler.
 * Inspired by macOS Spotlight's intelligent query parsing.
 *
 * Query Types:
 * - calculation: Math expressions
 * - conversion: Unit/currency conversions
 * - definition: "define X", "what is X"
 * - file-search: Filename searches
 * - web-search: Web queries
 * - action: Commands like "open Safari"
 */

class QueryTypeDetector {
  constructor() {
    // Patterns for each query type
    this.patterns = {
      // Math calculations: "2+2", "sqrt(16)", "sin(45)", "50% of 100"
      calculation: [
        /^[\d\s+\-*\/()%.^]+$/,  // Basic math operators
        /\b(sqrt|sin|cos|tan|log|ln|abs|ceil|floor|round|max|min|pow)\(/i,  // Math functions
        /\d+\s*%\s*of\s*\d+/i,  // Percentage calculations
        /^\s*\d+[\d\s+\-*\/()%.^]+\d+\s*$/  // Must contain numbers and operators
      ],

      // Unit conversions: "100 USD to EUR", "5 feet to meters", "100F to C"
      conversion: [
        /\d+\.?\d*\s+\w+\s+to\s+\w+/i,  // "X unit to unit"
        /\d+\.?\d*\s*(usd|eur|gbp|jpy|btc|eth)\s+to\s+\w+/i,  // Currency
        /\d+\.?\d*\s*(feet|meters|miles|km|inches|cm)\s+to\s+\w+/i,  // Distance
        /\d+\.?\d*\s*[fc]\s+to\s+[fc]/i,  // Temperature (F to C, C to F)
        /convert\s+\d+/i  // "convert X..."
      ],

      // Definitions: "define X", "what is X", "explain X"
      definition: [
        /^define\s+/i,
        /^what\s+is\s+/i,
        /^what's\s+/i,
        /^explain\s+/i,
        /^meaning\s+of\s+/i,
        /^what\s+does\s+.+\s+mean/i
      ],

      // File search: filename patterns, extensions, kind filters
      fileSearch: [
        /\.(js|ts|py|rb|go|java|cpp|c|h|md|txt|pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|svg|html|css|json|xml|yml|yaml)$/i,  // File extensions
        /kind:\w+/i,  // Spotlight-style kind filter
        /date:\w+/i,  // Date filter
        /\bfile\b/i,  // Explicit "file" keyword
        /^[\w\-_.]+\.\w+$/  // Simple filename pattern
      ],

      // Actions: "open X", "launch X", "create X"
      action: [
        /^(open|launch|start)\s+/i,
        /^create\s+/i,
        /^new\s+/i,
        /^play\s+/i,
        /^pause\b/i,
        /^stop\b/i
      ],

      // Web search: if nothing else matches or contains web indicators
      webSearch: [
        /^@(google|bing|ddg|duckduckgo)\s+/i,  // Explicit search engine
        /\b(weather|stock|news|search)\b/i,  // Common web query terms
        /^(who|what|when|where|why|how)\s+/i  // Question words (if not definition)
      ]
    };
  }

  /**
   * Detect query type
   * @param {string} query - User query
   * @returns {string} Query type (calculation, conversion, definition, etc.)
   */
  detect(query) {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return 'unknown';
    }

    // Check in priority order

    // 1. Actions (high priority - explicit commands)
    if (this.matchesPatterns(cleanQuery, this.patterns.action)) {
      return 'action';
    }

    // 2. Calculations (before conversions - simpler patterns)
    if (this.matchesPatterns(cleanQuery, this.patterns.calculation)) {
      // Additional validation: must contain at least one operator or function
      if (cleanQuery.match(/[+\-*\/()%^]|sqrt|sin|cos|tan|log/i)) {
        return 'calculation';
      }
    }

    // 3. Conversions (explicit "to" keyword)
    if (this.matchesPatterns(cleanQuery, this.patterns.conversion)) {
      return 'conversion';
    }

    // 4. Definitions (explicit keywords)
    if (this.matchesPatterns(cleanQuery, this.patterns.definition)) {
      return 'definition';
    }

    // 5. File search (file patterns)
    if (this.matchesPatterns(cleanQuery, this.patterns.fileSearch)) {
      return 'file-search';
    }

    // 6. Web search (fallback or explicit)
    if (this.matchesPatterns(cleanQuery, this.patterns.webSearch)) {
      return 'web-search';
    }

    // Default: web search (safest fallback)
    return 'web-search';
  }

  /**
   * Check if query matches any pattern in list
   * @param {string} query - Query to test
   * @param {array} patterns - Array of RegExp patterns
   * @returns {boolean}
   */
  matchesPatterns(query, patterns) {
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Get confidence score for each type
   * @param {string} query - User query
   * @returns {object} Confidence scores for each type
   */
  analyzeQuery(query) {
    const scores = {};

    for (const [type, patterns] of Object.entries(this.patterns)) {
      const matches = patterns.filter(pattern => pattern.test(query)).length;
      scores[type] = matches / patterns.length;
    }

    return {
      detected: this.detect(query),
      scores,
      confidence: Math.max(...Object.values(scores))
    };
  }

  /**
   * Extract entities from query based on type
   * @param {string} query - User query
   * @param {string} type - Detected query type
   * @returns {object} Extracted entities
   */
  extractEntities(query, type) {
    const entities = {};

    switch (type) {
      case 'calculation':
        entities.expression = query.trim();
        break;

      case 'conversion':
        const convMatch = query.match(/([\d.]+)\s+(\w+)\s+to\s+(\w+)/i);
        if (convMatch) {
          entities.value = parseFloat(convMatch[1]);
          entities.fromUnit = convMatch[2];
          entities.toUnit = convMatch[3];
        }
        break;

      case 'definition':
        const term = query
          .replace(/^(define|what is|what's|explain|meaning of)\s+/i, '')
          .replace(/\s+mean$/i, '')
          .trim();
        entities.term = term;
        break;

      case 'file-search':
        // Extract kind filter
        const kindMatch = query.match(/kind:(\w+)/i);
        if (kindMatch) {
          entities.kind = kindMatch[1];
          entities.query = query.replace(/kind:\w+/i, '').trim();
        } else {
          entities.query = query;
        }

        // Extract date filter
        const dateMatch = query.match(/date:(\w+)/i);
        if (dateMatch) {
          entities.date = dateMatch[1];
        }
        break;

      case 'action':
        const actionMatch = query.match(/^(open|launch|start|create|new|play|pause|stop)\s+(.+)/i);
        if (actionMatch) {
          entities.action = actionMatch[1].toLowerCase();
          entities.target = actionMatch[2].trim();
        }
        break;

      case 'web-search':
        // Extract search engine if specified
        const engineMatch = query.match(/^@(google|bing|ddg|duckduckgo)\s+(.+)/i);
        if (engineMatch) {
          entities.engine = engineMatch[1].toLowerCase();
          entities.query = engineMatch[2];
        } else {
          entities.query = query;
        }
        break;
    }

    return entities;
  }
}

module.exports = QueryTypeDetector;
