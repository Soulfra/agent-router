/**
 * Data Format Utilities
 *
 * Handles conversion between different data formats:
 * - JSON <-> CSV
 * - Enum validation
 * - Array operations
 * - Type coercion
 * - Schema validation
 */

class DataFormatter {
  constructor() {
    // Common enum definitions
    this.enums = {
      taskType: ['code', 'creative', 'reasoning', 'fact', 'simple', 'cryptography', 'data', 'publishing', 'calos', 'whimsical'],
      provider: ['openai', 'anthropic', 'deepseek', 'ollama'],
      strategy: ['smart', 'cheapest', 'fastest', 'best-quality'],
      tier: ['new', 'established', 'trusted', 'verified']
    };
  }

  /**
   * Validate enum value
   */
  validateEnum(value, enumName) {
    if (!this.enums[enumName]) {
      throw new Error(`Unknown enum: ${enumName}`);
    }

    if (!this.enums[enumName].includes(value)) {
      throw new Error(`Invalid ${enumName}: ${value}. Valid values: ${this.enums[enumName].join(', ')}`);
    }

    return true;
  }

  /**
   * Parse array from string or validate array
   */
  parseArray(value, options = {}) {
    // If already an array, validate and return
    if (Array.isArray(value)) {
      if (options.itemType) {
        value.forEach((item, idx) => {
          if (typeof item !== options.itemType) {
            throw new Error(`Array item ${idx} is not of type ${options.itemType}`);
          }
        });
      }
      return value;
    }

    // If string, try to parse
    if (typeof value === 'string') {
      // Try JSON parse first
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return this.parseArray(parsed, options);
        }
      } catch (e) {
        // Not JSON, try comma-separated
        const arr = value.split(',').map(v => v.trim()).filter(v => v);
        return this.parseArray(arr, options);
      }
    }

    throw new Error(`Cannot parse array from: ${typeof value}`);
  }

  /**
   * Convert JSON to CSV
   */
  jsonToCsv(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Data must be non-empty array');
    }

    // Get columns
    const columns = options.columns || Object.keys(data[0]);

    // Build CSV header
    const header = columns.map(col => this._escapeCsvValue(col)).join(',');

    // Build CSV rows
    const rows = data.map(row => {
      return columns.map(col => {
        const value = row[col];
        return this._escapeCsvValue(value);
      }).join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Convert CSV to JSON
   */
  csvToJson(csv, options = {}) {
    if (typeof csv !== 'string' || !csv.trim()) {
      throw new Error('CSV must be non-empty string');
    }

    const lines = csv.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    // Parse header
    const header = this._parseCsvLine(lines[0]);

    // Validate header
    if (options.requiredColumns) {
      const missing = options.requiredColumns.filter(col => !header.includes(col));
      if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(', ')}`);
      }
    }

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = this._parseCsvLine(line);

      if (values.length !== header.length) {
        throw new Error(`Row ${i} has ${values.length} columns, expected ${header.length}`);
      }

      const row = {};
      header.forEach((col, idx) => {
        row[col] = this._coerceValue(values[idx], options.types?.[col]);
      });

      data.push(row);
    }

    return data;
  }

  /**
   * Parse CSV line handling quoted values
   * @private
   */
  _parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last value
    values.push(current);

    return values;
  }

  /**
   * Escape CSV value
   * @private
   */
  _escapeCsvValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // If contains comma, newline, or quote, wrap in quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      // Escape quotes by doubling them
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Coerce value to type
   * @private
   */
  _coerceValue(value, type) {
    if (!type || value === '') {
      return value;
    }

    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes';
      case 'integer':
        return parseInt(value, 10);
      case 'float':
        return parseFloat(value);
      case 'date':
        return new Date(value);
      default:
        return value;
    }
  }

  /**
   * Normalize column names
   */
  normalizeColumnNames(columns) {
    return columns.map(col => {
      return col
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
    });
  }

  /**
   * Validate data against schema
   */
  validateSchema(data, schema) {
    const errors = [];

    // Check required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // Check field types
    if (schema.properties) {
      Object.keys(schema.properties).forEach(field => {
        if (field in data) {
          const prop = schema.properties[field];
          const value = data[field];

          // Type check
          if (prop.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== prop.type && value !== null) {
              errors.push(`Field ${field} should be ${prop.type}, got ${actualType}`);
            }
          }

          // Enum check
          if (prop.enum && !prop.enum.includes(value)) {
            errors.push(`Field ${field} must be one of: ${prop.enum.join(', ')}`);
          }

          // Min/max for numbers
          if (typeof value === 'number') {
            if (prop.minimum !== undefined && value < prop.minimum) {
              errors.push(`Field ${field} must be >= ${prop.minimum}`);
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
              errors.push(`Field ${field} must be <= ${prop.maximum}`);
            }
          }

          // Min/max length for strings/arrays
          if (typeof value === 'string' || Array.isArray(value)) {
            if (prop.minLength !== undefined && value.length < prop.minLength) {
              errors.push(`Field ${field} length must be >= ${prop.minLength}`);
            }
            if (prop.maxLength !== undefined && value.length > prop.maxLength) {
              errors.push(`Field ${field} length must be <= ${prop.maxLength}`);
            }
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = new DataFormatter();
