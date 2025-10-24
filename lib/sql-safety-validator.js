/**
 * SQL Safety Validator
 *
 * Validates SQL queries to ensure they are safe read-only operations.
 * Blocks any destructive operations (DROP, DELETE, UPDATE, etc.)
 */

class SQLSafetyValidator {
  constructor() {
    // Allowed read-only operations
    this.allowedKeywords = ['SELECT', 'WITH', 'EXPLAIN'];

    // Blocked destructive operations
    this.blockedKeywords = [
      'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE',
      'TRUNCATE', 'REPLACE', 'GRANT', 'REVOKE', 'EXECUTE',
      'EXEC', 'CALL', 'MERGE', 'UPSERT', 'SET', 'LOCK'
    ];

    // Dangerous SQL patterns
    this.dangerousPatterns = [
      /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)/i,  // Multiple statements
      /--/,                                                        // SQL comments (injection)
      /\/\*/,                                                      // Block comments
      /xp_/i,                                                      // MSSQL extended procedures
      /pg_sleep/i,                                                 // Time-based attacks
      /INTO\s+OUTFILE/i,                                           // File writes
      /LOAD_FILE/i,                                                // File reads
      /UNION.*SELECT/i                                             // UNION-based injection (with data modification)
    ];
  }

  /**
   * Validate a SQL query for safety
   * @param {string} sql - The SQL query to validate
   * @returns {Object} - { safe: boolean, error?: string, query?: string }
   */
  validateQuery(sql) {
    if (!sql || typeof sql !== 'string') {
      return { safe: false, error: 'Query must be a non-empty string' };
    }

    const trimmed = sql.trim();

    // Check if empty
    if (trimmed.length === 0) {
      return { safe: false, error: 'Query cannot be empty' };
    }

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          error: `Dangerous pattern detected: ${pattern.source}`
        };
      }
    }

    // Check for blocked keywords
    const upperSQL = trimmed.toUpperCase();
    for (const keyword of this.blockedKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(trimmed)) {
        return {
          safe: false,
          error: `Blocked keyword detected: ${keyword}`
        };
      }
    }

    // Check if query starts with allowed keyword
    const startsWithAllowed = this.allowedKeywords.some(keyword => {
      return upperSQL.startsWith(keyword) ||
             upperSQL.match(new RegExp(`^\\s*${keyword}\\b`, 'i'));
    });

    if (!startsWithAllowed) {
      return {
        safe: false,
        error: `Query must start with one of: ${this.allowedKeywords.join(', ')}`
      };
    }

    // Limit query length (prevent resource exhaustion)
    if (trimmed.length > 5000) {
      return {
        safe: false,
        error: 'Query exceeds maximum length of 5000 characters'
      };
    }

    // All checks passed
    return {
      safe: true,
      query: trimmed
    };
  }

  /**
   * Sanitize natural language query for AI processing
   * @param {string} naturalLanguage - User's natural language query
   * @returns {string} - Sanitized query
   */
  sanitizeNaturalLanguage(naturalLanguage) {
    if (!naturalLanguage || typeof naturalLanguage !== 'string') {
      return '';
    }

    return naturalLanguage
      .trim()
      .substring(0, 2000)  // Limit length
      .replace(/[<>]/g, ''); // Remove potential HTML/XML tags
  }

  /**
   * Validate table access (whitelist specific tables if needed)
   * @param {string} sql - SQL query
   * @param {Array<string>} allowedTables - Optional whitelist of table names
   * @returns {Object} - { safe: boolean, error?: string }
   */
  validateTableAccess(sql, allowedTables = null) {
    if (!allowedTables || allowedTables.length === 0) {
      return { safe: true }; // No whitelist, allow all tables
    }

    // Extract table names from FROM and JOIN clauses
    const tablePattern = /(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi;
    const matches = sql.matchAll(tablePattern);

    const tablesInQuery = new Set();
    for (const match of matches) {
      tablesInQuery.add(match[1].toLowerCase());
    }

    // Check if all tables are in whitelist
    const unauthorizedTables = [...tablesInQuery].filter(
      table => !allowedTables.includes(table.toLowerCase())
    );

    if (unauthorizedTables.length > 0) {
      return {
        safe: false,
        error: `Unauthorized tables: ${unauthorizedTables.join(', ')}`
      };
    }

    return { safe: true };
  }
}

module.exports = SQLSafetyValidator;
