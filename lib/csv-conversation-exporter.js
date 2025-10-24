/**
 * CSV Conversation Exporter
 *
 * Exports AI conversation history to CSV format for:
 * - Data analysis (Excel, Google Sheets)
 * - Auditing (compliance reviews)
 * - Training data (fine-tuning)
 * - Cost tracking (accounting)
 *
 * Usage:
 *   const exporter = new CSVConversationExporter({ db });
 *   const csv = await exporter.exportToCSV({ service: 'openai', limit: 1000 });
 *   fs.writeFileSync('conversations.csv', csv);
 */

const { getTimeService } = require('./time-service');

class CSVConversationExporter {
  constructor(options = {}) {
    this.db = options.db;
    this.verbose = options.verbose || false;

    console.log('[CSVConversationExporter] Initialized');
  }

  /**
   * Export conversations to CSV
   *
   * @param {Object} options - Export options
   * @param {string} options.service - Filter by service (optional)
   * @param {string} options.model - Filter by model (optional)
   * @param {string} options.purpose - Filter by purpose (optional)
   * @param {string} options.contextSource - Filter by context source (optional)
   * @param {Date} options.startDate - Start date filter (optional)
   * @param {Date} options.endDate - End date filter (optional)
   * @param {number} options.limit - Max rows (default 10000)
   * @param {boolean} options.includeFullContext - Include full request/response JSON (default false)
   * @returns {Promise<string>} - CSV string
   */
  async exportToCSV(options = {}) {
    const {
      service,
      model,
      purpose,
      contextSource,
      startDate,
      endDate,
      limit = 10000,
      includeFullContext = false
    } = options;

    // Build query
    let sql = 'SELECT * FROM ai_conversations';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (service) {
      conditions.push(`service = $${paramIndex++}`);
      params.push(service);
    }

    if (model) {
      conditions.push(`model = $${paramIndex++}`);
      params.push(model);
    }

    if (purpose) {
      conditions.push(`purpose = $${paramIndex++}`);
      params.push(purpose);
    }

    if (contextSource) {
      conditions.push(`context_source = $${paramIndex++}`);
      params.push(contextSource);
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    if (this.verbose) {
      console.log(`[CSVConversationExporter] Exporting conversations...`);
      console.log(`  Filters: ${JSON.stringify(options)}`);
    }

    // Execute query
    const result = await this.db.query(sql, params);
    const rows = result.rows;

    if (rows.length === 0) {
      console.warn('[CSVConversationExporter] No conversations found matching criteria');
      return this.generateEmptyCSV();
    }

    // Generate CSV
    const csv = this.rowsToCSV(rows, includeFullContext);

    if (this.verbose) {
      console.log(`[CSVConversationExporter] Exported ${rows.length} conversations`);
    }

    return csv;
  }

  /**
   * Export conversation stats to CSV
   */
  async exportStatsToCSV(options = {}) {
    const {
      service,
      model,
      purpose
    } = options;

    let sql = 'SELECT * FROM ai_conversation_stats';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (service) {
      conditions.push(`service = $${paramIndex++}`);
      params.push(service);
    }

    if (model) {
      conditions.push(`model = $${paramIndex++}`);
      params.push(model);
    }

    if (purpose) {
      conditions.push(`purpose = $${paramIndex++}`);
      params.push(purpose);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY total_cost_usd DESC';

    const result = await this.db.query(sql, params);

    if (result.rows.length === 0) {
      return this.generateEmptyStatsCSV();
    }

    return this.statsToCSV(result.rows);
  }

  /**
   * Convert rows to CSV
   */
  rowsToCSV(rows, includeFullContext = false) {
    // CSV headers
    const headers = [
      'conversation_id',
      'service',
      'model',
      'endpoint',
      'purpose',
      'context_source',
      'related_entity_type',
      'related_entity_id',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'estimated_cost_usd',
      'latency_ms',
      'status',
      'posted_to_forum',
      'forum_thread_id',
      'contains_sensitive_data',
      'created_at',
      'created_by',
      'user_prompt_preview',
      'assistant_response_preview'
    ];

    if (includeFullContext) {
      headers.push('user_prompt_full', 'system_prompt', 'assistant_response_full', 'full_request', 'full_response');
    }

    // Build CSV
    let csv = headers.map(h => this.escapeCSV(h)).join(',') + '\n';

    for (const row of rows) {
      const values = [
        row.conversation_id,
        row.service,
        row.model,
        row.endpoint || '',
        row.purpose,
        row.context_source,
        row.related_entity_type || '',
        row.related_entity_id || '',
        row.prompt_tokens || 0,
        row.completion_tokens || 0,
        row.total_tokens || 0,
        row.estimated_cost_usd || 0,
        row.latency_ms || 0,
        row.status,
        row.posted_to_forum,
        row.forum_thread_id || '',
        row.contains_sensitive_data,
        row.created_at.toISOString(),
        row.created_by,
        this.truncate(row.user_prompt, 200),
        this.truncate(row.assistant_response, 200)
      ];

      if (includeFullContext) {
        values.push(
          row.user_prompt,
          row.system_prompt || '',
          row.assistant_response,
          JSON.stringify(row.full_request || {}),
          JSON.stringify(row.full_response || {})
        );
      }

      csv += values.map(v => this.escapeCSV(v)).join(',') + '\n';
    }

    return csv;
  }

  /**
   * Convert stats to CSV
   */
  statsToCSV(rows) {
    const headers = [
      'service',
      'model',
      'purpose',
      'conversation_count',
      'total_prompt_tokens',
      'total_completion_tokens',
      'total_tokens',
      'total_cost_usd',
      'avg_latency_ms',
      'first_conversation',
      'last_conversation'
    ];

    let csv = headers.map(h => this.escapeCSV(h)).join(',') + '\n';

    for (const row of rows) {
      const values = [
        row.service,
        row.model,
        row.purpose,
        row.conversation_count,
        row.total_prompt_tokens,
        row.total_completion_tokens,
        row.total_tokens,
        row.total_cost_usd,
        row.avg_latency_ms,
        row.first_conversation.toISOString(),
        row.last_conversation.toISOString()
      ];

      csv += values.map(v => this.escapeCSV(v)).join(',') + '\n';
    }

    return csv;
  }

  /**
   * Escape CSV value
   */
  escapeCSV(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * Truncate text
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate empty CSV (no data)
   */
  generateEmptyCSV() {
    return 'conversation_id,service,model,purpose,created_at\n';
  }

  /**
   * Generate empty stats CSV
   */
  generateEmptyStatsCSV() {
    return 'service,model,purpose,conversation_count,total_cost_usd\n';
  }

  /**
   * Export to file
   */
  async exportToFile(filePath, options = {}) {
    const fs = require('fs').promises;
    const csv = await this.exportToCSV(options);
    await fs.writeFile(filePath, csv, 'utf-8');
    console.log(`[CSVConversationExporter] Exported to ${filePath}`);
  }

  /**
   * Export stats to file
   */
  async exportStatsToFile(filePath, options = {}) {
    const fs = require('fs').promises;
    const csv = await this.exportStatsToCSV(options);
    await fs.writeFile(filePath, csv, 'utf-8');
    console.log(`[CSVConversationExporter] Exported stats to ${filePath}`);
  }

  /**
   * Generate filename with timestamp
   */
  generateFilename(prefix = 'ai_conversations') {
    const timeService = getTimeService();
    const timestamp = timeService.now().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    return `${prefix}_${timestamp}.csv`;
  }
}

module.exports = CSVConversationExporter;
