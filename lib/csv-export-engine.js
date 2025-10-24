/**
 * CSV Export Engine
 *
 * Universal CSV export system for any data format:
 * - Arrays of objects
 * - Database query results
 * - Table scraped data
 * - API responses
 * - Nested objects (flattened)
 *
 * Features:
 * - Auto-detects data structure
 * - Handles nested objects (flattens with dot notation)
 * - Custom column mapping
 * - Column filtering/reordering
 * - Date formatting
 * - Number formatting
 * - UTF-8 BOM support for Excel
 * - Streaming for large datasets
 *
 * Example:
 *   const exporter = new CSVExportEngine();
 *   const csv = exporter.export(data, {
 *     columns: ['name', 'email', 'created'],
 *     headers: { name: 'Full Name', email: 'Email Address' }
 *   });
 */

const fs = require('fs').promises;
const { Transform } = require('stream');

class CSVExportEngine {
  constructor(options = {}) {
    this.options = {
      delimiter: options.delimiter || ',',
      linebreak: options.linebreak || '\n',
      quote: options.quote || '"',
      escape: options.escape || '"',
      bom: options.bom !== false, // Include BOM by default for Excel
      dateFormat: options.dateFormat || 'iso', // iso, locale, unix
      numberFormat: options.numberFormat || 'auto', // auto, fixed, scientific
      nullValue: options.nullValue || '',
      undefinedValue: options.undefinedValue || '',
      ...options
    };
  }

  /**
   * Export data to CSV string
   */
  export(data, options = {}) {
    const mergedOptions = { ...this.options, ...options };

    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // Extract columns
    const columns = this._extractColumns(data, mergedOptions);

    // Generate headers
    const headers = this._generateHeaders(columns, mergedOptions);

    // Generate rows
    const rows = data.map(item =>
      this._generateRow(item, columns, mergedOptions)
    );

    // Combine
    const lines = [headers, ...rows];
    let csv = lines.join(mergedOptions.linebreak);

    // Add BOM for Excel UTF-8 support
    if (mergedOptions.bom) {
      csv = '\uFEFF' + csv;
    }

    return csv;
  }

  /**
   * Export to file
   */
  async exportToFile(data, filepath, options = {}) {
    const csv = this.export(data, options);
    await fs.writeFile(filepath, csv, 'utf8');
    return filepath;
  }

  /**
   * Create streaming exporter for large datasets
   */
  createStream(columns, options = {}) {
    const mergedOptions = { ...this.options, ...options };
    let isFirstRow = true;

    return new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
        try {
          // Write headers on first row
          if (isFirstRow) {
            const headers = this._generateHeaders(columns, mergedOptions);
            let output = headers;

            // Add BOM for first chunk
            if (mergedOptions.bom) {
              output = '\uFEFF' + output;
            }

            this.push(output + mergedOptions.linebreak);
            isFirstRow = false;
          }

          // Write data row
          const row = this._generateRow(chunk, columns, mergedOptions);
          this.push(row + mergedOptions.linebreak);

          callback();
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  /**
   * Extract column names from data
   * @private
   */
  _extractColumns(data, options) {
    // If columns specified explicitly, use those
    if (options.columns) {
      return options.columns;
    }

    // Otherwise extract from first item
    const first = data[0];
    if (typeof first !== 'object' || first === null) {
      return ['value'];
    }

    // Get all unique keys from all objects (some might have different keys)
    const allKeys = new Set();
    for (const item of data.slice(0, Math.min(10, data.length))) {
      if (typeof item === 'object' && item !== null) {
        Object.keys(this._flattenObject(item)).forEach(k => allKeys.add(k));
      }
    }

    return Array.from(allKeys);
  }

  /**
   * Generate header row
   * @private
   */
  _generateHeaders(columns, options) {
    const headers = columns.map(col => {
      // Use custom header if provided
      if (options.headers && options.headers[col]) {
        return options.headers[col];
      }

      // Otherwise use column name (capitalize first letter)
      return col.charAt(0).toUpperCase() + col.slice(1);
    });

    return headers.map(h => this._escapeField(h, options)).join(options.delimiter);
  }

  /**
   * Generate data row
   * @private
   */
  _generateRow(item, columns, options) {
    // Flatten nested objects
    const flattened = typeof item === 'object' ? this._flattenObject(item) : { value: item };

    const cells = columns.map(col => {
      const value = flattened[col];
      const formatted = this._formatValue(value, options);
      return this._escapeField(formatted, options);
    });

    return cells.join(options.delimiter);
  }

  /**
   * Flatten nested object with dot notation
   * @private
   */
  _flattenObject(obj, prefix = '', result = {}) {
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        this._flattenObject(value, newKey, result);
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Format value based on type
   * @private
   */
  _formatValue(value, options) {
    // Handle null/undefined
    if (value === null) return options.nullValue;
    if (value === undefined) return options.undefinedValue;

    // Handle Date
    if (value instanceof Date) {
      return this._formatDate(value, options.dateFormat);
    }

    // Handle Number
    if (typeof value === 'number') {
      return this._formatNumber(value, options.numberFormat);
    }

    // Handle Boolean
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // Handle Array
    if (Array.isArray(value)) {
      return value.join('; ');
    }

    // Handle Object (shouldn't happen after flattening, but just in case)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    // String
    return String(value);
  }

  /**
   * Format date
   * @private
   */
  _formatDate(date, format) {
    switch (format) {
      case 'iso':
        return date.toISOString();
      case 'locale':
        return date.toLocaleString();
      case 'unix':
        return Math.floor(date.getTime() / 1000).toString();
      default:
        return date.toISOString();
    }
  }

  /**
   * Format number
   * @private
   */
  _formatNumber(num, format) {
    switch (format) {
      case 'fixed':
        return num.toFixed(2);
      case 'scientific':
        return num.toExponential();
      case 'auto':
      default:
        return num.toString();
    }
  }

  /**
   * Escape CSV field
   * @private
   */
  _escapeField(value, options) {
    if (value === null || value === undefined) return '';

    const str = String(value);
    const { delimiter, quote, escape } = options;

    // Check if escaping is needed
    const needsEscape = str.includes(delimiter) ||
                       str.includes(quote) ||
                       str.includes('\n') ||
                       str.includes('\r');

    if (!needsEscape) {
      return str;
    }

    // Escape quotes
    const escaped = str.replace(new RegExp(quote, 'g'), escape + quote);

    // Wrap in quotes
    return `${quote}${escaped}${quote}`;
  }

  /**
   * Parse CSV string back to objects
   */
  parse(csv, options = {}) {
    const mergedOptions = { ...this.options, ...options };

    // Remove BOM if present
    let content = csv;
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    // Split into lines
    const lines = content.split(mergedOptions.linebreak).filter(l => l.trim());

    if (lines.length === 0) {
      return [];
    }

    // Parse header
    const headers = this._parseCSVLine(lines[0], mergedOptions);

    // Parse rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCSVLine(lines[i], mergedOptions);

      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });

      data.push(obj);
    }

    return data;
  }

  /**
   * Parse CSV line (handles quotes and escapes)
   * @private
   */
  _parseCSVLine(line, options) {
    const { delimiter, quote } = options;
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === quote) {
        if (inQuotes && nextChar === quote) {
          // Escaped quote
          current += quote;
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Push last field
    result.push(current);

    return result;
  }

  /**
   * Convert to download response (Express)
   */
  toDownloadResponse(res, data, filename, options = {}) {
    const csv = this.export(data, options);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * Create browser download (client-side)
   */
  createBrowserDownload(data, filename, options = {}) {
    const csv = this.export(data, options);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSVExportEngine;
}

// Browser global
if (typeof window !== 'undefined') {
  window.CSVExportEngine = CSVExportEngine;
}
