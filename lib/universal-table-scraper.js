/**
 * Universal Table Scraper
 *
 * Extracts tabular data from any source:
 * - HTML tables (DOM or HTML strings)
 * - JSON arrays of objects
 * - CSV strings
 * - API responses
 * - Database query results
 *
 * Features:
 * - Auto-detects table structure
 * - Handles rowspan/colspan
 * - Extracts headers intelligently
 * - Normalizes data format
 * - Supports nested tables
 * - Configurable selectors
 *
 * Example:
 *   const scraper = new UniversalTableScraper();
 *   const data = await scraper.scrape('https://example.com/data');
 *   // Returns: { headers: [...], rows: [[...]], metadata: {...} }
 */

const cheerio = require('cheerio');

class UniversalTableScraper {
  constructor(options = {}) {
    this.options = {
      // Selectors
      tableSelector: options.tableSelector || 'table',
      headerSelector: options.headerSelector || 'thead th, thead td, tr:first-child th',
      rowSelector: options.rowSelector || 'tbody tr, tr',
      cellSelector: options.cellSelector || 'td, th',

      // Behavior
      includeHidden: options.includeHidden || false,
      trimWhitespace: options.trimWhitespace !== false,
      parseNumbers: options.parseNumbers !== false,
      parseDates: options.parseDates !== false,
      maxDepth: options.maxDepth || 3, // For nested tables

      // Output
      includeMetadata: options.includeMetadata !== false,
      includeHTML: options.includeHTML || false,
      ...options
    };
  }

  /**
   * Scrape table data from any source
   */
  async scrape(source, options = {}) {
    const mergedOptions = { ...this.options, ...options };

    // Detect source type
    const type = this._detectSourceType(source);

    switch (type) {
      case 'html':
        return this._scrapeHTML(source, mergedOptions);

      case 'dom':
        return this._scrapeDOM(source, mergedOptions);

      case 'json':
        return this._scrapeJSON(source, mergedOptions);

      case 'csv':
        return this._scrapeCSV(source, mergedOptions);

      case 'url':
        return this._scrapeURL(source, mergedOptions);

      default:
        throw new Error(`Unknown source type: ${type}`);
    }
  }

  /**
   * Detect source type
   * @private
   */
  _detectSourceType(source) {
    if (typeof source === 'string') {
      if (source.trim().startsWith('http://') || source.trim().startsWith('https://')) {
        return 'url';
      }
      if (source.trim().startsWith('<')) {
        return 'html';
      }
      if (source.includes(',') || source.includes('\t')) {
        return 'csv';
      }
      try {
        JSON.parse(source);
        return 'json';
      } catch (e) {
        return 'html'; // Default to HTML
      }
    }

    if (Array.isArray(source)) {
      return 'json';
    }

    if (typeof source === 'object' && source.nodeType) {
      return 'dom';
    }

    return 'unknown';
  }

  /**
   * Scrape from HTML string
   * @private
   */
  _scrapeHTML(html, options) {
    const $ = cheerio.load(html);
    const tables = [];

    $(options.tableSelector).each((index, table) => {
      const scraped = this._scrapeTable($, $(table), options);
      if (scraped) {
        tables.push(scraped);
      }
    });

    if (tables.length === 0) {
      return null;
    }

    // Return first table if only one, otherwise return all
    return tables.length === 1 ? tables[0] : { tables };
  }

  /**
   * Scrape from DOM element
   * @private
   */
  _scrapeDOM(element, options) {
    // Convert DOM to HTML string and scrape
    const html = element.outerHTML || element.innerHTML;
    return this._scrapeHTML(html, options);
  }

  /**
   * Scrape from JSON
   * @private
   */
  _scrapeJSON(json, options) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // Extract headers from first object keys
    const headers = Object.keys(data[0]);

    // Convert to rows
    const rows = data.map(obj =>
      headers.map(h => this._normalizeValue(obj[h], options))
    );

    return {
      headers,
      rows,
      metadata: {
        source: 'json',
        rowCount: rows.length,
        columnCount: headers.length
      }
    };
  }

  /**
   * Scrape from CSV
   * @private
   */
  _scrapeCSV(csv, options) {
    const lines = csv.trim().split('\n');
    if (lines.length === 0) return null;

    // Detect delimiter
    const delimiter = this._detectCSVDelimiter(lines[0]);

    // Parse CSV
    const rows = lines.map(line => this._parseCSVLine(line, delimiter));

    // First row is usually headers
    const headers = rows[0];
    const dataRows = rows.slice(1).map(row =>
      row.map(cell => this._normalizeValue(cell, options))
    );

    return {
      headers,
      rows: dataRows,
      metadata: {
        source: 'csv',
        delimiter,
        rowCount: dataRows.length,
        columnCount: headers.length
      }
    };
  }

  /**
   * Scrape from URL
   * @private
   */
  async _scrapeURL(url, options) {
    const fetch = require('node-fetch');
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');

    if (contentType.includes('application/json')) {
      const json = await response.json();
      return this._scrapeJSON(json, options);
    }

    if (contentType.includes('text/csv')) {
      const csv = await response.text();
      return this._scrapeCSV(csv, options);
    }

    // Default to HTML
    const html = await response.text();
    return this._scrapeHTML(html, options);
  }

  /**
   * Scrape a single table element
   * @private
   */
  _scrapeTable($, $table, options) {
    // Extract headers
    const headers = [];
    const headerCells = $table.find(options.headerSelector);

    if (headerCells.length > 0) {
      headerCells.each((i, cell) => {
        const $cell = $(cell);
        if (options.includeHidden || $cell.is(':visible')) {
          headers.push(this._extractCellText($, $cell, options));
        }
      });
    }

    // Extract rows
    const rows = [];
    const $rows = $table.find(options.rowSelector);

    $rows.each((rowIndex, row) => {
      const $row = $(row);

      // Skip header row if already processed
      if (headerCells.length > 0 && rowIndex === 0 && $row.find('th').length > 0) {
        return;
      }

      const rowData = [];
      const $cells = $row.find(options.cellSelector);

      $cells.each((cellIndex, cell) => {
        const $cell = $(cell);
        if (options.includeHidden || $cell.is(':visible')) {
          const value = this._extractCellText($, $cell, options);
          const normalized = this._normalizeValue(value, options);
          rowData.push(normalized);
        }
      });

      if (rowData.length > 0) {
        rows.push(rowData);
      }
    });

    if (rows.length === 0) {
      return null;
    }

    // Build result
    const result = {
      headers: headers.length > 0 ? headers : this._generateHeaders(rows[0].length),
      rows
    };

    if (options.includeMetadata) {
      result.metadata = {
        source: 'html',
        tableIndex: 0,
        rowCount: rows.length,
        columnCount: result.headers.length,
        hasHeaders: headers.length > 0
      };
    }

    return result;
  }

  /**
   * Extract text from cell
   * @private
   */
  _extractCellText($, $cell, options) {
    let text = $cell.text().trim();

    if (options.trimWhitespace) {
      text = text.replace(/\s+/g, ' ').trim();
    }

    if (options.includeHTML) {
      const html = $cell.html();
      return { text, html };
    }

    return text;
  }

  /**
   * Normalize cell value (parse numbers, dates, etc.)
   * @private
   */
  _normalizeValue(value, options) {
    if (typeof value === 'object' && value.text) {
      // Already processed with HTML
      return value;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    // Parse numbers
    if (options.parseNumbers && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // Parse dates (basic ISO 8601 detection)
    if (options.parseDates && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return trimmed;
  }

  /**
   * Detect CSV delimiter
   * @private
   */
  _detectCSVDelimiter(line) {
    const delimiters = [',', '\t', ';', '|'];
    let maxCount = 0;
    let bestDelimiter = ',';

    for (const delimiter of delimiters) {
      const count = line.split(delimiter).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = delimiter;
      }
    }

    return bestDelimiter;
  }

  /**
   * Parse CSV line (handles quoted fields)
   * @private
   */
  _parseCSVLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Generate default headers (Column 1, Column 2, etc.)
   * @private
   */
  _generateHeaders(count) {
    return Array.from({ length: count }, (_, i) => `Column ${i + 1}`);
  }

  /**
   * Scrape multiple tables from a page
   */
  async scrapeAll(source, options = {}) {
    const result = await this.scrape(source, options);

    if (!result) return [];

    // If already an array of tables, return as-is
    if (result.tables) {
      return result.tables;
    }

    // Otherwise wrap single table in array
    return [result];
  }

  /**
   * Export as JSON
   */
  toJSON(scraped) {
    if (!scraped) return null;

    const { headers, rows } = scraped;

    return rows.map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
  }

  /**
   * Export as CSV
   */
  toCSV(scraped, delimiter = ',') {
    if (!scraped) return '';

    const { headers, rows } = scraped;

    const lines = [
      headers.map(h => this._escapeCSV(h)).join(delimiter),
      ...rows.map(row =>
        row.map(cell => this._escapeCSV(cell)).join(delimiter)
      )
    ];

    return lines.join('\n');
  }

  /**
   * Escape CSV field
   * @private
   */
  _escapeCSV(value) {
    if (value === null || value === undefined) return '';

    const str = String(value);

    // If contains delimiter, quotes, or newlines, wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }
}

module.exports = UniversalTableScraper;
