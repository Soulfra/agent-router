/**
 * Telemetry Collector
 *
 * Collects usage, performance, and error telemetry from CALOS installations.
 *
 * Model: VS Code / Google Analytics / GitHub Telemetry
 *
 * What We Collect:
 * 1. Feature Usage - Which features are used (POS, transcripts, crypto, marketplace)
 * 2. Performance - Response times, error rates, resource usage
 * 3. Session Analytics - Active sessions, duration, peak times
 * 4. Error Reporting - Exceptions, API errors, failed transactions
 * 5. Trend Analysis - Feature adoption, popular patterns, workflows
 *
 * Privacy:
 * - All data obfuscated (no PII)
 * - Batched transmission (every 5 min or during license verification)
 * - Enterprise can opt-out (air-gapped mode)
 *
 * Usage:
 *   const collector = new TelemetryCollector({ db, installId });
 *   await collector.trackFeatureUsage('pos_transaction');
 *   await collector.trackPerformance('api_request', { duration: 123, path: '/api/users' });
 *   await collector.trackError(error, { context: 'payment_processing' });
 */

const TelemetryObfuscator = require('./telemetry-obfuscator');

class TelemetryCollector {
  constructor(options = {}) {
    this.db = options.db;
    this.installId = options.installId || 'unknown';
    this.tier = options.tier || 'community';

    // Obfuscator for anonymizing data
    this.obfuscator = new TelemetryObfuscator({
      salt: options.salt || process.env.TELEMETRY_SALT
    });

    // In-memory event buffer (flush every 5 min)
    this.eventBuffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.flushInterval = options.flushInterval || 5 * 60 * 1000;  // 5 minutes

    // Auto-flush timer
    this.flushTimer = null;

    // Feature categories for tracking
    this.features = [
      'pos_transaction',
      'crypto_payment',
      'transcript_upload',
      'transcript_analysis',
      'marketplace_theme_install',
      'marketplace_theme_purchase',
      'forum_post',
      'quickbooks_sync',
      'api_call',
      'user_login',
      'user_signup'
    ];
  }

  /**
   * Initialize collector (start auto-flush timer)
   */
  async initialize() {
    // Check if telemetry should be collected for this tier
    if (!this.obfuscator.shouldCollectTelemetry(this.tier)) {
      console.log(`[TelemetryCollector] Telemetry disabled for tier: ${this.tier}`);
      return;
    }

    // Start auto-flush timer
    this.startAutoFlush();

    console.log(`[TelemetryCollector] Initialized (Install ID: ${this.installId}, Tier: ${this.tier})`);
  }

  /**
   * Track feature usage
   *
   * @param {string} feature - Feature name
   * @param {Object} metadata - Additional metadata
   */
  async trackFeatureUsage(feature, metadata = {}) {
    const event = {
      eventType: 'feature_usage',
      feature,
      metadata: this.obfuscator.obfuscateMetadata(metadata),
      timestamp: new Date().toISOString(),
      installId: this.installId
    };

    await this.addEvent(event);
  }

  /**
   * Track performance metric
   *
   * @param {string} metric - Metric name
   * @param {Object} data - Performance data
   */
  async trackPerformance(metric, data = {}) {
    const event = {
      eventType: 'performance',
      metric,
      duration: data.duration,
      path: data.path ? this.obfuscator.obfuscatePath(data.path) : undefined,
      statusCode: data.statusCode,
      metadata: this.obfuscator.obfuscateMetadata(data.metadata || {}),
      timestamp: new Date().toISOString(),
      installId: this.installId
    };

    await this.addEvent(event);
  }

  /**
   * Track session event
   *
   * @param {string} type - Session type (start, end, active)
   * @param {Object} sessionData - Session data
   */
  async trackSession(type, sessionData = {}) {
    const event = {
      eventType: 'session',
      sessionType: type,
      duration: sessionData.duration,
      userId: sessionData.userId ? this.obfuscator.obfuscateUserId(sessionData.userId) : undefined,
      metadata: this.obfuscator.obfuscateMetadata(sessionData.metadata || {}),
      timestamp: new Date().toISOString(),
      installId: this.installId
    };

    await this.addEvent(event);
  }

  /**
   * Track error
   *
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Error context
   */
  async trackError(error, context = {}) {
    const event = {
      eventType: 'error',
      error: this.obfuscator.obfuscateError(error),
      path: context.path ? this.obfuscator.obfuscatePath(context.path) : undefined,
      userId: context.userId ? this.obfuscator.obfuscateUserId(context.userId) : undefined,
      metadata: this.obfuscator.obfuscateMetadata(context.metadata || {}),
      timestamp: new Date().toISOString(),
      installId: this.installId
    };

    await this.addEvent(event);
  }

  /**
   * Track API request
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {number} duration - Request duration (ms)
   */
  async trackAPIRequest(req, res, duration) {
    const event = {
      eventType: 'api_request',
      method: req.method,
      path: this.obfuscator.obfuscatePath(req.path || req.url),
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('user-agent') ? this.obfuscator._obfuscateUserAgent(req.get('user-agent')) : undefined,
      timestamp: new Date().toISOString(),
      installId: this.installId
    };

    await this.addEvent(event);
  }

  /**
   * Add event to buffer
   *
   * @private
   * @param {Object} event - Telemetry event
   */
  async addEvent(event) {
    // Check if telemetry is enabled
    if (!this.obfuscator.shouldCollectTelemetry(this.tier)) {
      return;
    }

    // Obfuscate event
    const obfuscatedEvent = this.obfuscator.obfuscateEvent(event);

    // Add to buffer
    this.eventBuffer.push(obfuscatedEvent);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush event buffer to database
   */
  async flush() {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Save to database
      if (this.db) {
        await this._saveEventsToDatabase(events);
      }

      console.log(`[TelemetryCollector] Flushed ${events.length} events`);
    } catch (error) {
      console.error('[TelemetryCollector] Failed to flush events:', error.message);

      // Put events back in buffer (retry later)
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Save events to database
   *
   * @private
   * @param {Array<Object>} events - Telemetry events
   */
  async _saveEventsToDatabase(events) {
    if (!this.db) return;

    for (const event of events) {
      try {
        await this.db.query(`
          INSERT INTO telemetry_events (
            install_id,
            event_type,
            event_data,
            created_at
          ) VALUES ($1, $2, $3, $4)
        `, [
          this.installId,
          event.eventType,
          JSON.stringify(event),
          event.timestamp
        ]);
      } catch (error) {
        console.error('[TelemetryCollector] Failed to save event:', error.message);
      }
    }
  }

  /**
   * Start auto-flush timer
   */
  startAutoFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop auto-flush timer
   */
  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get telemetry summary (for sending during license verification)
   *
   * @param {number} hours - Hours to look back (default: 24)
   * @returns {Promise<Object>} - Telemetry summary
   */
  async getTelemetrySummary(hours = 24) {
    if (!this.db) return {};

    try {
      // Feature usage counts
      const featureUsage = await this.db.query(`
        SELECT
          event_data->>'feature' as feature,
          COUNT(*) as count
        FROM telemetry_events
        WHERE install_id = $1
          AND event_type = 'feature_usage'
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY feature
        ORDER BY count DESC
      `, [this.installId]);

      // Performance metrics (average duration by path)
      const performance = await this.db.query(`
        SELECT
          event_data->>'path' as path,
          AVG((event_data->>'duration')::INTEGER) as avg_duration,
          COUNT(*) as count
        FROM telemetry_events
        WHERE install_id = $1
          AND event_type = 'performance'
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY path
        ORDER BY count DESC
        LIMIT 10
      `, [this.installId]);

      // Error counts by category
      const errors = await this.db.query(`
        SELECT
          event_data->'error'->>'type' as error_type,
          COUNT(*) as count
        FROM telemetry_events
        WHERE install_id = $1
          AND event_type = 'error'
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY error_type
        ORDER BY count DESC
      `, [this.installId]);

      // API request stats
      const apiStats = await this.db.query(`
        SELECT
          event_data->>'method' as method,
          event_data->>'statusCode' as status_code,
          COUNT(*) as count,
          AVG((event_data->>'duration')::INTEGER) as avg_duration
        FROM telemetry_events
        WHERE install_id = $1
          AND event_type = 'api_request'
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY method, status_code
        ORDER BY count DESC
      `, [this.installId]);

      return {
        period: `${hours}h`,
        featureUsage: featureUsage.rows,
        performance: performance.rows,
        errors: errors.rows,
        apiStats: apiStats.rows,
        totalEvents: featureUsage.rows.reduce((sum, r) => sum + parseInt(r.count), 0)
      };
    } catch (error) {
      console.error('[TelemetryCollector] Failed to get summary:', error.message);
      return {};
    }
  }

  /**
   * Get batched telemetry for license verification
   *
   * @param {number} hours - Hours to batch (default: 24)
   * @returns {Promise<Array<Object>>} - Batched telemetry events
   */
  async getBatchedTelemetry(hours = 24) {
    // Flush current buffer first
    await this.flush();

    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT event_data
        FROM telemetry_events
        WHERE install_id = $1
          AND created_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY created_at DESC
        LIMIT 1000
      `, [this.installId]);

      return result.rows.map(r => r.event_data);
    } catch (error) {
      console.error('[TelemetryCollector] Failed to get batched telemetry:', error.message);
      return [];
    }
  }

  /**
   * Clean up old telemetry data
   *
   * @param {number} days - Days to keep (default: 90)
   */
  async cleanup(days = 90) {
    if (!this.db) return;

    try {
      const result = await this.db.query(`
        DELETE FROM telemetry_events
        WHERE created_at < NOW() - INTERVAL '${days} days'
      `);

      console.log(`[TelemetryCollector] Cleaned up ${result.rowCount} old telemetry events`);
    } catch (error) {
      console.error('[TelemetryCollector] Failed to cleanup:', error.message);
    }
  }

  /**
   * Shutdown collector (flush buffer, stop timer)
   */
  async shutdown() {
    this.stopAutoFlush();
    await this.flush();
    console.log('[TelemetryCollector] Shutdown complete');
  }
}

module.exports = TelemetryCollector;
