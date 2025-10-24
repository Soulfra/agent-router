/**
 * Data Exporter
 *
 * Exports price data, correlations, and arbitrage opportunities to various formats
 * (CSV, JSON, HTML) for analysis, reporting, and external use.
 *
 * Features:
 * - Export price history to CSV/JSON/HTML
 * - Export correlations with visual formatting
 * - Export arbitrage opportunities
 * - Generate formatted HTML reports
 * - Customizable date ranges and filtering
 */

const { Pool } = require('pg');

class DataExporter {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    // Statistics
    this.stats = {
      exportsGenerated: 0,
      csvExports: 0,
      jsonExports: 0,
      htmlExports: 0
    };
  }

  /**
   * Export price history to various formats
   *
   * @param {Object} options - Export options
   * @returns {Object} Export result with data in requested format
   */
  async exportPriceHistory(options = {}) {
    const {
      symbols = [],
      format = 'json',  // 'csv', 'json', 'html'
      hours = 24,
      limit = 1000
    } = options;

    try {
      let query = `
        SELECT
          symbol,
          asset_type,
          price,
          change_24h,
          volume_24h,
          currency,
          source,
          source_timestamp,
          recorded_at
        FROM price_history
        WHERE 1=1
      `;

      const params = [];

      if (symbols.length > 0) {
        params.push(symbols.map(s => s.toUpperCase()));
        query += ` AND symbol = ANY($${params.length})`;
      }

      params.push(parseInt(hours));
      query += ` AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'`;

      query += ` ORDER BY recorded_at DESC`;

      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;

      const result = await this.db.query(query, params);

      this.stats.exportsGenerated++;

      switch (format.toLowerCase()) {
        case 'csv':
          this.stats.csvExports++;
          return this._toCSV(result.rows, 'price_history');

        case 'html':
          this.stats.htmlExports++;
          return this._toHTML(result.rows, 'Price History', options);

        case 'json':
        default:
          this.stats.jsonExports++;
          return this._toJSON(result.rows, 'price_history');
      }
    } catch (error) {
      console.error('[DataExporter] Error exporting price history:', error.message);
      throw error;
    }
  }

  /**
   * Export correlation data
   *
   * @param {Object} options - Export options
   * @returns {Object} Export result
   */
  async exportCorrelations(options = {}) {
    const {
      format = 'json',
      timeframe = '24h',
      minStrength = 'weak',  // 'weak', 'moderate', 'strong'
      days = 30
    } = options;

    try {
      const query = `
        SELECT
          symbol1,
          symbol2,
          correlation,
          strength,
          relationship,
          data_points,
          timeframe,
          calculated_at
        FROM price_correlations
        WHERE timeframe = $1
          AND calculated_at >= NOW() - INTERVAL '${parseInt(days)} days'
        ORDER BY ABS(correlation) DESC, calculated_at DESC
      `;

      const result = await this.db.query(query, [timeframe]);

      // Filter by strength if specified
      let filteredRows = result.rows;
      if (minStrength === 'moderate') {
        filteredRows = result.rows.filter(r => ['moderate', 'strong'].includes(r.strength));
      } else if (minStrength === 'strong') {
        filteredRows = result.rows.filter(r => r.strength === 'strong');
      }

      this.stats.exportsGenerated++;

      switch (format.toLowerCase()) {
        case 'csv':
          this.stats.csvExports++;
          return this._toCSV(filteredRows, 'correlations');

        case 'html':
          this.stats.htmlExports++;
          return this._correlationsHTML(filteredRows, options);

        case 'json':
        default:
          this.stats.jsonExports++;
          return this._toJSON(filteredRows, 'correlations');
      }
    } catch (error) {
      console.error('[DataExporter] Error exporting correlations:', error.message);
      throw error;
    }
  }

  /**
   * Export arbitrage opportunities
   *
   * @param {Object} options - Export options
   * @returns {Object} Export result
   */
  async exportArbitrage(options = {}) {
    const {
      format = 'json',
      minSpread = 2,
      hours = 24,
      limit = 100
    } = options;

    try {
      const query = `
        SELECT
          symbol,
          source1,
          price1,
          source2,
          price2,
          spread_absolute,
          spread_percent,
          is_data_error,
          detected_at
        FROM arbitrage_opportunities
        WHERE spread_percent >= $1
          AND detected_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
        ORDER BY spread_percent DESC, detected_at DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, [parseFloat(minSpread), parseInt(limit)]);

      this.stats.exportsGenerated++;

      switch (format.toLowerCase()) {
        case 'csv':
          this.stats.csvExports++;
          return this._toCSV(result.rows, 'arbitrage');

        case 'html':
          this.stats.htmlExports++;
          return this._arbitrageHTML(result.rows, options);

        case 'json':
        default:
          this.stats.jsonExports++;
          return this._toJSON(result.rows, 'arbitrage');
      }
    } catch (error) {
      console.error('[DataExporter] Error exporting arbitrage:', error.message);
      throw error;
    }
  }

  /**
   * Generate comprehensive report with all data
   *
   * @param {Object} options - Report options
   * @returns {Object} Complete report
   */
  async generateReport(options = {}) {
    const { format = 'html', hours = 24 } = options;

    try {
      const priceData = await this.exportPriceHistory({ ...options, format: 'json' });
      const correlationData = await this.exportCorrelations({ ...options, format: 'json' });
      const arbitrageData = await this.exportArbitrage({ ...options, format: 'json' });

      const report = {
        generated: new Date().toISOString(),
        timeRange: `${hours} hours`,
        sections: {
          prices: JSON.parse(priceData.data),
          correlations: JSON.parse(correlationData.data),
          arbitrage: JSON.parse(arbitrageData.data)
        },
        summary: {
          totalPricePoints: JSON.parse(priceData.data).length,
          totalCorrelations: JSON.parse(correlationData.data).length,
          totalArbitrageOpportunities: JSON.parse(arbitrageData.data).length
        }
      };

      if (format === 'html') {
        return this._fullReportHTML(report);
      }

      return {
        format: 'json',
        filename: `report_${Date.now()}.json`,
        data: JSON.stringify(report, null, 2)
      };
    } catch (error) {
      console.error('[DataExporter] Error generating report:', error.message);
      throw error;
    }
  }

  /**
   * Convert data to CSV format
   * @private
   */
  _toCSV(rows, type) {
    if (rows.length === 0) {
      return {
        format: 'csv',
        filename: `${type}_${Date.now()}.csv`,
        data: 'No data available'
      };
    }

    // Get headers from first row
    const headers = Object.keys(rows[0]);
    const csvHeaders = headers.join(',');

    // Convert rows to CSV
    const csvRows = rows.map(row =>
      headers.map(header => {
        let value = row[header];
        // Handle null/undefined
        if (value === null || value === undefined) {
          value = '';
        }
        // Quote strings with commas
        if (typeof value === 'string' && value.includes(',')) {
          value = `"${value}"`;
        }
        return value;
      }).join(',')
    );

    const csvData = [csvHeaders, ...csvRows].join('\n');

    return {
      format: 'csv',
      filename: `${type}_${Date.now()}.csv`,
      mimeType: 'text/csv',
      data: csvData
    };
  }

  /**
   * Convert data to JSON format
   * @private
   */
  _toJSON(rows, type) {
    return {
      format: 'json',
      filename: `${type}_${Date.now()}.json`,
      mimeType: 'application/json',
      data: JSON.stringify(rows, null, 2)
    };
  }

  /**
   * Convert data to HTML table
   * @private
   */
  _toHTML(rows, title, options = {}) {
    if (rows.length === 0) {
      return {
        format: 'html',
        filename: `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.html`,
        mimeType: 'text/html',
        data: this._htmlTemplate(title, '<p>No data available</p>')
      };
    }

    const headers = Object.keys(rows[0]);
    const tableRows = rows.map(row =>
      `<tr>${headers.map(h => `<td>${this._formatValue(row[h])}</td>`).join('')}</tr>`
    ).join('\n');

    const table = `
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${this._formatHeader(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    return {
      format: 'html',
      filename: `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.html`,
      mimeType: 'text/html',
      data: this._htmlTemplate(title, table)
    };
  }

  /**
   * Format correlations as HTML with visual indicators
   * @private
   */
  _correlationsHTML(rows, options = {}) {
    if (rows.length === 0) {
      return {
        format: 'html',
        filename: `correlations_${Date.now()}.html`,
        mimeType: 'text/html',
        data: this._htmlTemplate('Correlations', '<p>No correlation data available</p>')
      };
    }

    const tableRows = rows.map(row => {
      const corr = parseFloat(row.correlation);
      const color = corr > 0.4 ? '#4CAF50' : corr < -0.4 ? '#f44336' : '#FFC107';
      const width = Math.abs(corr) * 100;

      return `
        <tr>
          <td>${row.symbol1}</td>
          <td>${row.symbol2}</td>
          <td>
            <div class="correlation-bar" style="background: ${color}; width: ${width}%">
              ${corr.toFixed(4)}
            </div>
          </td>
          <td><span class="badge badge-${row.strength}">${row.strength}</span></td>
          <td><span class="badge badge-${row.relationship}">${row.relationship}</span></td>
          <td>${row.data_points}</td>
          <td>${new Date(row.calculated_at).toLocaleString()}</td>
        </tr>
      `;
    }).join('\n');

    const table = `
      <style>
        .correlation-bar {
          padding: 4px 8px;
          color: white;
          text-align: right;
          font-weight: bold;
          min-width: 60px;
        }
        .badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9em;
          font-weight: bold;
        }
        .badge-strong { background: #4CAF50; color: white; }
        .badge-moderate { background: #FFC107; color: black; }
        .badge-weak { background: #9E9E9E; color: white; }
        .badge-positive { background: #2196F3; color: white; }
        .badge-inverse { background: #f44336; color: white; }
        .badge-neutral { background: #9E9E9E; color: white; }
      </style>
      <table>
        <thead>
          <tr>
            <th>Symbol 1</th>
            <th>Symbol 2</th>
            <th>Correlation</th>
            <th>Strength</th>
            <th>Relationship</th>
            <th>Data Points</th>
            <th>Calculated</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    return {
      format: 'html',
      filename: `correlations_${Date.now()}.html`,
      mimeType: 'text/html',
      data: this._htmlTemplate('Price Correlations', table)
    };
  }

  /**
   * Format arbitrage opportunities as HTML
   * @private
   */
  _arbitrageHTML(rows, options = {}) {
    if (rows.length === 0) {
      return {
        format: 'html',
        filename: `arbitrage_${Date.now()}.html`,
        mimeType: 'text/html',
        data: this._htmlTemplate('Arbitrage Opportunities', '<p>No arbitrage opportunities found</p>')
      };
    }

    const tableRows = rows.map(row => {
      const spreadClass = row.is_data_error ? 'error' : row.spread_percent > 5 ? 'high' : 'moderate';
      return `
        <tr class="${spreadClass}">
          <td>${row.symbol}</td>
          <td>${row.source1}<br>$${parseFloat(row.price1).toFixed(2)}</td>
          <td>${row.source2}<br>$${parseFloat(row.price2).toFixed(2)}</td>
          <td>$${parseFloat(row.spread_absolute).toFixed(2)}</td>
          <td><strong>${parseFloat(row.spread_percent).toFixed(2)}%</strong></td>
          <td>${row.is_data_error ? '⚠️ Error' : '✅ Valid'}</td>
          <td>${new Date(row.detected_at).toLocaleString()}</td>
        </tr>
      `;
    }).join('\n');

    const table = `
      <style>
        tr.high { background: #fff3cd; }
        tr.moderate { background: #d1ecf1; }
        tr.error { background: #f8d7da; }
      </style>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Source 1</th>
            <th>Source 2</th>
            <th>Spread ($)</th>
            <th>Spread (%)</th>
            <th>Status</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    return {
      format: 'html',
      filename: `arbitrage_${Date.now()}.html`,
      mimeType: 'text/html',
      data: this._htmlTemplate('Arbitrage Opportunities', table)
    };
  }

  /**
   * Generate full HTML report
   * @private
   */
  _fullReportHTML(report) {
    const content = `
      <h2>Summary</h2>
      <p>Report generated: ${new Date(report.generated).toLocaleString()}</p>
      <p>Time range: ${report.timeRange}</p>
      <ul>
        <li>Price data points: ${report.summary.totalPricePoints}</li>
        <li>Correlations tracked: ${report.summary.totalCorrelations}</li>
        <li>Arbitrage opportunities: ${report.summary.totalArbitrageOpportunities}</li>
      </ul>

      <h2>Recent Correlations</h2>
      ${this._miniTable(report.sections.correlations.slice(0, 10))}

      <h2>Arbitrage Opportunities</h2>
      ${this._miniTable(report.sections.arbitrage.slice(0, 10))}
    `;

    return {
      format: 'html',
      filename: `full_report_${Date.now()}.html`,
      mimeType: 'text/html',
      data: this._htmlTemplate('Price Oracle Report', content)
    };
  }

  /**
   * Helper: Create mini table from data
   * @private
   */
  _miniTable(rows) {
    if (rows.length === 0) return '<p>No data</p>';

    const headers = Object.keys(rows[0]);
    return `
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${this._formatHeader(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row =>
            `<tr>${headers.map(h => `<td>${this._formatValue(row[h])}</td>`).join('')}</tr>`
          ).join('\n')}
        </tbody>
      </table>
    `;
  }

  /**
   * Helper: Format header names
   * @private
   */
  _formatHeader(header) {
    return header
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Helper: Format cell values
   * @private
   */
  _formatValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'number') return value.toFixed(4);
    return value;
  }

  /**
   * HTML template wrapper
   * @private
   */
  _htmlTemplate(title, content) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      max-width: 1200px;
      margin: 40px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1, h2 { color: #333; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #4CAF50;
      color: white;
      font-weight: bold;
    }
    tr:hover { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
    <p>Generated by CALOS Price Oracle | ${new Date().toLocaleString()}</p>
  </footer>
</body>
</html>
    `.trim();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalExports: this.stats.exportsGenerated
    };
  }
}

module.exports = DataExporter;
