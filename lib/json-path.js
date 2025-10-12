/**
 * JSON Path Utility
 *
 * Utilities for traversing and extracting data from deeply nested JSON objects.
 * Supports both dot notation (object.key.subkey) and bracket notation (object["key"]["subkey"]).
 *
 * Useful for APIs like Alpha Vantage that have deeply nested response structures.
 */

/**
 * Get value from nested object using path
 *
 * @param {Object} obj - The object to traverse
 * @param {String|Array} path - Path to the value (dot notation, bracket notation, or array)
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} The value at the path, or defaultValue if not found
 *
 * @example
 * const data = { "Global Quote": { "05. price": "123.45" } };
 * get(data, '["Global Quote"]["05. price"]') // "123.45"
 * get(data, 'Global Quote.05. price', 0) // "123.45"
 * get(data, ['Global Quote', '05. price']) // "123.45"
 */
function get(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  // If path is already an array, use it directly
  if (Array.isArray(path)) {
    return getByArray(obj, path, defaultValue);
  }

  // Convert path string to array of keys
  const keys = parsePath(path);
  return getByArray(obj, keys, defaultValue);
}

/**
 * Parse a path string into an array of keys
 *
 * Supports:
 * - Dot notation: "user.name.first"
 * - Bracket notation: '["user"]["name"]["first"]'
 * - Mixed: 'user["name"].first'
 * - Numeric indices: "users[0].name"
 *
 * @param {String} path - Path string
 * @returns {Array} Array of keys
 */
function parsePath(path) {
  if (typeof path !== 'string') {
    return [];
  }

  const keys = [];
  let current = '';
  let inBracket = false;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (inBracket) {
      if (inQuote) {
        if (char === quoteChar && path[i - 1] !== '\\') {
          // End of quoted string
          inQuote = false;
          quoteChar = '';
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          // Start of quoted string
          inQuote = true;
          quoteChar = char;
        } else if (char === ']') {
          // End of bracket notation
          if (current) {
            keys.push(current);
            current = '';
          }
          inBracket = false;
        } else if (char !== ' ') {
          // Add to current key (skip spaces)
          current += char;
        }
      }
    } else {
      if (char === '[') {
        // Start of bracket notation
        if (current) {
          keys.push(current);
          current = '';
        }
        inBracket = true;
      } else if (char === '.') {
        // Dot separator
        if (current) {
          keys.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  // Add remaining key
  if (current) {
    keys.push(current);
  }

  return keys;
}

/**
 * Get value from object using array of keys
 *
 * @param {Object} obj - The object to traverse
 * @param {Array} keys - Array of keys to traverse
 * @param {*} defaultValue - Default value if not found
 * @returns {*} The value at the path
 */
function getByArray(obj, keys, defaultValue = undefined) {
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return defaultValue;
    }

    // Handle array indices
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      const index = parseInt(key, 10);
      current = current[index];
    } else {
      current = current[key];
    }

    if (current === undefined) {
      return defaultValue;
    }
  }

  return current;
}

/**
 * Set value in nested object using path
 *
 * @param {Object} obj - The object to modify
 * @param {String|Array} path - Path to the value
 * @param {*} value - Value to set
 * @returns {Object} The modified object
 *
 * @example
 * const data = {};
 * set(data, 'user.name', 'John');
 * set(data, '["user"]["age"]', 30);
 */
function set(obj, path, value) {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Object must be an object or array');
  }

  const keys = Array.isArray(path) ? path : parsePath(path);

  if (keys.length === 0) {
    throw new Error('Path cannot be empty');
  }

  let current = obj;

  // Traverse to parent of target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current) || typeof current[key] !== 'object') {
      // Create intermediate objects
      const nextKey = keys[i + 1];
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }

    current = current[key];
  }

  // Set the final value
  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Check if path exists in object
 *
 * @param {Object} obj - The object to check
 * @param {String|Array} path - Path to check
 * @returns {Boolean} True if path exists
 */
function has(obj, path) {
  const sentinel = Symbol('sentinel');
  return get(obj, path, sentinel) !== sentinel;
}

/**
 * Delete value at path in object
 *
 * @param {Object} obj - The object to modify
 * @param {String|Array} path - Path to delete
 * @returns {Boolean} True if deleted, false if path didn't exist
 */
function del(obj, path) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const keys = Array.isArray(path) ? path : parsePath(path);

  if (keys.length === 0) {
    return false;
  }

  let current = obj;

  // Traverse to parent of target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current) || typeof current[key] !== 'object') {
      return false;
    }

    current = current[key];
  }

  const lastKey = keys[keys.length - 1];

  if (!(lastKey in current)) {
    return false;
  }

  delete current[lastKey];
  return true;
}

/**
 * Extract multiple values from object using path mapping
 *
 * @param {Object} obj - The object to extract from
 * @param {Object} pathMap - Mapping of output keys to input paths
 * @returns {Object} Object with extracted values
 *
 * @example
 * const data = {
 *   "Global Quote": {
 *     "01. symbol": "AAPL",
 *     "05. price": "150.00",
 *     "10. change percent": "1.5%"
 *   }
 * };
 *
 * const result = extract(data, {
 *   symbol: '["Global Quote"]["01. symbol"]',
 *   price: '["Global Quote"]["05. price"]',
 *   change: '["Global Quote"]["10. change percent"]'
 * });
 * // { symbol: "AAPL", price: "150.00", change: "1.5%" }
 */
function extract(obj, pathMap) {
  const result = {};

  for (const [outputKey, inputPath] of Object.entries(pathMap)) {
    const value = get(obj, inputPath);
    if (value !== undefined) {
      result[outputKey] = value;
    }
  }

  return result;
}

/**
 * Flatten nested object into dot-notation keys
 *
 * @param {Object} obj - The object to flatten
 * @param {String} prefix - Prefix for keys (used internally for recursion)
 * @returns {Object} Flattened object
 *
 * @example
 * const data = { user: { name: "John", age: 30 } };
 * flatten(data);
 * // { "user.name": "John", "user.age": 30 }
 */
function flatten(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Unflatten dot-notation keys into nested object
 *
 * @param {Object} obj - The flattened object
 * @returns {Object} Nested object
 *
 * @example
 * const flat = { "user.name": "John", "user.age": 30 };
 * unflatten(flat);
 * // { user: { name: "John", age: 30 } }
 */
function unflatten(obj) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    set(result, key, value);
  }

  return result;
}

module.exports = {
  get,
  set,
  has,
  del,
  extract,
  flatten,
  unflatten,
  parsePath
};
