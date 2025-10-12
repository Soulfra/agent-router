/**
 * Data Utils
 * Safe data processing operations using built-in JavaScript
 *
 * NO process spawning - all operations use built-in JavaScript
 * Pattern: Like /time and /system endpoints - pure JS utilities
 */

class DataUtils {
  /**
   * Parse JSON with error handling
   * @param {string} jsonString - JSON string to parse
   * @returns {object} - Parse result
   */
  parseJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);

      return {
        success: true,
        data: parsed,
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        size: JSON.stringify(parsed).length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        input: jsonString.substring(0, 100) + (jsonString.length > 100 ? '...' : '')
      };
    }
  }

  /**
   * Stringify object to JSON
   * @param {any} data - Data to stringify
   * @param {boolean} pretty - Pretty print with indentation
   * @param {number} indent - Indentation spaces (if pretty)
   * @returns {object} - Stringify result
   */
  stringifyJSON(data, pretty = false, indent = 2) {
    try {
      const result = pretty ? JSON.stringify(data, null, indent) : JSON.stringify(data);

      return {
        success: true,
        json: result,
        size: result.length,
        pretty
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: typeof data
      };
    }
  }

  /**
   * Parse CSV to array of objects
   * @param {string} csv - CSV string
   * @param {object} options - Parse options
   * @returns {object} - Parse result
   */
  parseCSV(csv, options = {}) {
    const delimiter = options.delimiter || ',';
    const hasHeader = options.hasHeader !== false;

    try {
      const lines = csv.trim().split(/\r?\n/);

      if (lines.length === 0) {
        return { success: true, data: [], rows: 0 };
      }

      const headers = hasHeader
        ? lines[0].split(delimiter).map(h => h.trim())
        : lines[0].split(delimiter).map((_, i) => `col${i + 1}`);

      const dataLines = hasHeader ? lines.slice(1) : lines;

      const data = dataLines.map(line => {
        const values = line.split(delimiter).map(v => v.trim());
        const row = {};

        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        return row;
      });

      return {
        success: true,
        data,
        rows: data.length,
        columns: headers.length,
        headers
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert array of objects to CSV
   * @param {array} data - Array of objects
   * @param {object} options - Options
   * @returns {object} - CSV result
   */
  toCSV(data, options = {}) {
    const delimiter = options.delimiter || ',';
    const includeHeader = options.includeHeader !== false;

    try {
      if (!Array.isArray(data) || data.length === 0) {
        return { success: true, csv: '', rows: 0 };
      }

      const headers = Object.keys(data[0]);

      const headerRow = includeHeader ? headers.join(delimiter) + '\n' : '';

      const rows = data.map(row =>
        headers.map(header => {
          const value = row[header] || '';
          return typeof value === 'string' && value.includes(delimiter)
            ? `"${value}"`
            : value;
        }).join(delimiter)
      );

      const csv = headerRow + rows.join('\n');

      return {
        success: true,
        csv,
        rows: data.length,
        columns: headers.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deep clone object
   * @param {any} data - Data to clone
   * @returns {object} - Clone result
   */
  deepClone(data) {
    try {
      const cloned = JSON.parse(JSON.stringify(data));

      return {
        success: true,
        data: cloned,
        type: Array.isArray(cloned) ? 'array' : typeof cloned
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Merge objects deeply
   * @param {object} target - Target object
   * @param {object} source - Source object
   * @returns {object} - Merge result
   */
  deepMerge(target, source) {
    try {
      const result = { ...target };

      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }

      return {
        success: true,
        data: result,
        keysAdded: Object.keys(source).length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get unique values from array
   * @param {array} data - Array
   * @returns {object} - Unique result
   */
  unique(data) {
    try {
      const unique = [...new Set(data)];

      return {
        success: true,
        data: unique,
        originalLength: data.length,
        uniqueLength: unique.length,
        duplicatesRemoved: data.length - unique.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Flatten nested array
   * @param {array} data - Nested array
   * @param {number} depth - Depth to flatten (default: Infinity)
   * @returns {object} - Flatten result
   */
  flatten(data, depth = Infinity) {
    try {
      const flattened = data.flat(depth);

      return {
        success: true,
        data: flattened,
        originalLength: data.length,
        flattenedLength: flattened.length,
        depth
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Chunk array into smaller arrays
   * @param {array} data - Array to chunk
   * @param {number} size - Chunk size
   * @returns {object} - Chunk result
   */
  chunk(data, size) {
    try {
      if (size < 1) {
        throw new Error('Chunk size must be at least 1');
      }

      const chunks = [];
      for (let i = 0; i < data.length; i += size) {
        chunks.push(data.slice(i, i + size));
      }

      return {
        success: true,
        data: chunks,
        chunks: chunks.length,
        chunkSize: size,
        originalLength: data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Group array by key
   * @param {array} data - Array of objects
   * @param {string} key - Key to group by
   * @returns {object} - Group result
   */
  groupBy(data, key) {
    try {
      const grouped = data.reduce((acc, item) => {
        const groupKey = item[key];
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(item);
        return acc;
      }, {});

      return {
        success: true,
        data: grouped,
        groups: Object.keys(grouped).length,
        key
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sort array by key or comparator
   * @param {array} data - Array to sort
   * @param {string} key - Key to sort by (for objects)
   * @param {string} order - 'asc' or 'desc'
   * @returns {object} - Sort result
   */
  sort(data, key = null, order = 'asc') {
    try {
      const sorted = [...data];

      sorted.sort((a, b) => {
        let aVal = key ? a[key] : a;
        let bVal = key ? b[key] : b;

        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
      });

      return {
        success: true,
        data: sorted,
        length: sorted.length,
        key,
        order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Filter array by condition
   * @param {array} data - Array to filter
   * @param {string} key - Key to check
   * @param {string} operator - Comparison operator (eq, ne, gt, lt, gte, lte, contains)
   * @param {any} value - Value to compare
   * @returns {object} - Filter result
   */
  filter(data, key, operator, value) {
    try {
      const operators = {
        eq: (a, b) => a === b,
        ne: (a, b) => a !== b,
        gt: (a, b) => a > b,
        lt: (a, b) => a < b,
        gte: (a, b) => a >= b,
        lte: (a, b) => a <= b,
        contains: (a, b) => String(a).includes(String(b))
      };

      if (!operators[operator]) {
        throw new Error(`Unsupported operator: ${operator}`);
      }

      const filtered = data.filter(item => {
        const itemValue = key ? item[key] : item;
        return operators[operator](itemValue, value);
      });

      return {
        success: true,
        data: filtered,
        originalLength: data.length,
        filteredLength: filtered.length,
        removed: data.length - filtered.length,
        condition: { key, operator, value }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate data against schema
   * @param {any} data - Data to validate
   * @param {object} schema - Simple schema (type checking)
   * @returns {object} - Validation result
   */
  validate(data, schema) {
    const errors = [];

    try {
      for (const [key, expectedType] of Object.entries(schema)) {
        if (!(key in data)) {
          errors.push(`Missing required field: ${key}`);
          continue;
        }

        const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];

        if (actualType !== expectedType) {
          errors.push(`Field ${key}: expected ${expectedType}, got ${actualType}`);
        }
      }

      return {
        success: errors.length === 0,
        valid: errors.length === 0,
        errors,
        fields: Object.keys(schema).length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get supported operations
   * @returns {object} - Available operations
   */
  getSupportedOperations() {
    return {
      json: ['parseJSON', 'stringifyJSON'],
      csv: ['parseCSV', 'toCSV'],
      object: ['deepClone', 'deepMerge', 'validate'],
      array: ['unique', 'flatten', 'chunk', 'groupBy', 'sort', 'filter']
    };
  }
}

module.exports = DataUtils;
