/**
 * Text Utils
 * Safe text processing operations using built-in JavaScript
 *
 * NO process spawning - all operations use built-in JavaScript
 * Pattern: Like /time and /system endpoints - pure JS utilities
 */

class TextUtils {
  /**
   * Count occurrences of pattern in text
   * @param {string} text - Text to search
   * @param {string} pattern - Pattern to count
   * @param {boolean} caseSensitive - Case sensitive search
   * @returns {object} - Count result
   */
  count(text, pattern, caseSensitive = true) {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

    let count = 0;
    let pos = 0;

    while ((pos = searchText.indexOf(searchPattern, pos)) !== -1) {
      count++;
      pos += searchPattern.length;
    }

    return {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      pattern,
      count,
      caseSensitive
    };
  }

  /**
   * Replace pattern in text
   * @param {string} text - Text to process
   * @param {string} pattern - Pattern to replace
   * @param {string} replacement - Replacement text
   * @param {boolean} replaceAll - Replace all occurrences
   * @returns {object} - Replace result
   */
  replace(text, pattern, replacement, replaceAll = true) {
    let result;
    let count = 0;

    if (replaceAll) {
      result = text.split(pattern).join(replacement);
      count = text.split(pattern).length - 1;
    } else {
      result = text.replace(pattern, replacement);
      count = result !== text ? 1 : 0;
    }

    return {
      original: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      result: result.substring(0, 100) + (result.length > 100 ? '...' : ''),
      pattern,
      replacement,
      replacements: count,
      originalLength: text.length,
      resultLength: result.length
    };
  }

  /**
   * Split text by delimiter
   * @param {string} text - Text to split
   * @param {string} delimiter - Delimiter
   * @param {number} limit - Max number of splits
   * @returns {object} - Split result
   */
  split(text, delimiter = ' ', limit = -1) {
    const parts = limit > 0 ? text.split(delimiter, limit) : text.split(delimiter);

    return {
      parts,
      count: parts.length,
      delimiter,
      originalLength: text.length
    };
  }

  /**
   * Join array with delimiter
   * @param {array} parts - Parts to join
   * @param {string} delimiter - Delimiter
   * @returns {object} - Join result
   */
  join(parts, delimiter = ' ') {
    const result = parts.join(delimiter);

    return {
      result,
      parts: parts.length,
      delimiter,
      length: result.length
    };
  }

  /**
   * Reverse text
   * @param {string} text - Text to reverse
   * @returns {object} - Reverse result
   */
  reverse(text) {
    const reversed = text.split('').reverse().join('');

    return {
      original: text,
      reversed,
      length: text.length
    };
  }

  /**
   * Case transformations
   * @param {string} text - Text to transform
   * @param {string} caseType - upper, lower, title, camel, snake, kebab
   * @returns {object} - Transform result
   */
  changeCase(text, caseType) {
    let result;

    switch (caseType) {
      case 'upper':
        result = text.toUpperCase();
        break;
      case 'lower':
        result = text.toLowerCase();
        break;
      case 'title':
        result = text.replace(/\w\S*/g, (txt) =>
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
        break;
      case 'camel':
        result = text.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
          if (+match === 0) return '';
          return index === 0 ? match.toLowerCase() : match.toUpperCase();
        });
        break;
      case 'snake':
        result = text.replace(/\s+/g, '_').toLowerCase();
        break;
      case 'kebab':
        result = text.replace(/\s+/g, '-').toLowerCase();
        break;
      default:
        throw new Error(`Unsupported case type: ${caseType}. Valid: upper, lower, title, camel, snake, kebab`);
    }

    return {
      original: text,
      result,
      caseType,
      length: result.length
    };
  }

  /**
   * Trim, pad operations
   * @param {string} text - Text to process
   * @param {string} operation - trim, trimStart, trimEnd, padStart, padEnd
   * @param {object} options - Operation options
   * @returns {object} - Operation result
   */
  trim(text, operation = 'trim', options = {}) {
    let result;

    switch (operation) {
      case 'trim':
        result = text.trim();
        break;
      case 'trimStart':
        result = text.trimStart();
        break;
      case 'trimEnd':
        result = text.trimEnd();
        break;
      case 'padStart':
        result = text.padStart(options.length || text.length, options.char || ' ');
        break;
      case 'padEnd':
        result = text.padEnd(options.length || text.length, options.char || ' ');
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    return {
      original: text,
      result,
      operation,
      originalLength: text.length,
      resultLength: result.length
    };
  }

  /**
   * Count words, characters, lines
   * @param {string} text - Text to count
   * @returns {object} - Count result
   */
  countAll(text) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const lines = text.split(/\r?\n/);
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;

    return {
      words: words.length,
      characters: chars,
      charactersNoSpaces: charsNoSpaces,
      lines: lines.length,
      avgWordLength: words.length > 0 ? (charsNoSpaces / words.length).toFixed(2) : 0
    };
  }

  /**
   * Match pattern with regex
   * @param {string} text - Text to search
   * @param {string} pattern - Regex pattern
   * @param {string} flags - Regex flags (g, i, m)
   * @returns {object} - Match result
   */
  match(text, pattern, flags = 'g') {
    try {
      const regex = new RegExp(pattern, flags);
      const matches = text.match(regex) || [];

      return {
        matches,
        count: matches.length,
        pattern,
        flags
      };
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${error.message}`);
    }
  }

  /**
   * Create URL-friendly slug
   * @param {string} text - Text to slugify
   * @returns {object} - Slug result
   */
  slugify(text) {
    const slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      original: text,
      slug,
      length: slug.length
    };
  }

  /**
   * Truncate text to length
   * @param {string} text - Text to truncate
   * @param {number} length - Max length
   * @param {string} suffix - Suffix to add (default: '...')
   * @returns {object} - Truncate result
   */
  truncate(text, length = 100, suffix = '...') {
    if (text.length <= length) {
      return {
        original: text,
        truncated: text,
        wasTruncated: false,
        originalLength: text.length
      };
    }

    const truncated = text.substring(0, length - suffix.length) + suffix;

    return {
      original: text.substring(0, 50) + '...',
      truncated,
      wasTruncated: true,
      originalLength: text.length,
      truncatedLength: truncated.length
    };
  }

  /**
   * Extract substring
   * @param {string} text - Text to extract from
   * @param {number} start - Start index
   * @param {number} end - End index (optional)
   * @returns {object} - Substring result
   */
  substring(text, start, end = undefined) {
    const result = end !== undefined ? text.substring(start, end) : text.substring(start);

    return {
      original: text,
      substring: result,
      start,
      end: end || text.length,
      length: result.length
    };
  }

  /**
   * Find index of pattern
   * @param {string} text - Text to search
   * @param {string} pattern - Pattern to find
   * @param {boolean} fromEnd - Search from end
   * @returns {object} - Index result
   */
  indexOf(text, pattern, fromEnd = false) {
    const index = fromEnd ? text.lastIndexOf(pattern) : text.indexOf(pattern);

    return {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      pattern,
      index,
      found: index !== -1,
      fromEnd
    };
  }

  /**
   * Get supported operations
   * @returns {object} - Available operations
   */
  getSupportedOperations() {
    return {
      counting: ['count', 'countAll'],
      transformation: ['replace', 'reverse', 'changeCase', 'slugify', 'truncate'],
      splitting: ['split', 'join', 'substring'],
      formatting: ['trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd'],
      searching: ['match', 'indexOf']
    };
  }
}

module.exports = TextUtils;
