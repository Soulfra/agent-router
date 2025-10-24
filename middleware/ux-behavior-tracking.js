/**
 * UX/Behavior Tracking Middleware
 *
 * Logs all user interactions to database:
 * - Page views
 * - API calls
 * - Tool usage
 * - Chat messages
 * - Errors
 * - Deployment outcomes
 *
 * Integrates with CalConversationLearner for autonomous learning
 */

const CalConversationLearner = require('../lib/cal-conversation-learner');

class UXBehaviorTracker {
  constructor(options = {}) {
    this.db = options.db || null;
    this.conversationLearner = options.conversationLearner || new CalConversationLearner();
    this.verbose = options.verbose || false;

    console.log('[UXBehaviorTracker] Initialized with Cal integration:', {
      db: !!this.db,
      conversationLearner: !!this.conversationLearner
    });
  }

  /**
   * Middleware function to track all requests
   */
  middleware() {
    return async (req, res, next) => {
      const startTime = Date.now();

      // Track request
      const interaction = {
        timestamp: new Date().toISOString(),
        type: this.getInteractionType(req),
        method: req.method,
        path: req.path,
        query: req.query,
        body: this.sanitizeBody(req.body),
        userAgent: req.get('user-agent'),
        ip: req.ip,
        referer: req.get('referer')
      };

      // Log to conversation learner
      if (this.conversationLearner && this.shouldLogToConversation(req)) {
        await this.conversationLearner.logConversation('user',
          this.formatRequestForCal(req)
        );
      }

      // Capture response
      const originalSend = res.send;
      res.send = (body) => {
        interaction.duration = Date.now() - startTime;
        interaction.statusCode = res.statusCode;
        interaction.success = res.statusCode < 400;

        // Log interaction
        this.logInteraction(interaction).catch(err => {
          if (this.verbose) {
            console.error('[UXBehaviorTracker] Failed to log interaction:', err.message);
          }
        });

        // Call original send
        return originalSend.call(res, body);
      };

      next();
    };
  }

  /**
   * Determine interaction type based on request
   */
  getInteractionType(req) {
    if (req.path.startsWith('/api/')) {
      if (req.path.includes('chat') || req.path.includes('message')) {
        return 'chat';
      }
      if (req.path.includes('deploy')) {
        return 'deployment';
      }
      if (req.path.includes('test')) {
        return 'testing';
      }
      return 'api_call';
    }

    if (req.path.endsWith('.html') || req.path === '/') {
      return 'page_view';
    }

    if (req.path.includes('/static/') || req.path.includes('/assets/')) {
      return 'asset_load';
    }

    return 'other';
  }

  /**
   * Should this request be logged to Cal's conversation learner?
   */
  shouldLogToConversation(req) {
    // Log chat messages, deployments, tests, errors
    const logTypes = ['chat', 'deployment', 'testing'];
    const type = this.getInteractionType(req);

    return logTypes.includes(type) || req.method === 'POST';
  }

  /**
   * Format request for Cal's understanding
   */
  formatRequestForCal(req) {
    const type = this.getInteractionType(req);

    if (type === 'chat') {
      return `User chat: ${JSON.stringify(req.body)}`;
    }

    if (type === 'deployment') {
      return `User initiated deployment: ${req.path} ${JSON.stringify(req.body)}`;
    }

    if (type === 'testing') {
      return `User ran tests: ${req.path}`;
    }

    return `User action: ${req.method} ${req.path}`;
  }

  /**
   * Sanitize request body (remove sensitive data)
   */
  sanitizeBody(body) {
    if (!body) return null;

    const sanitized = { ...body };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'credential'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Log interaction to database
   */
  async logInteraction(interaction) {
    if (!this.db) {
      if (this.verbose) {
        console.log('[UXBehaviorTracker] No database configured, skipping log');
      }
      return;
    }

    try {
      await this.db.query(
        `INSERT INTO ux_interactions
         (timestamp, type, method, path, query, body, user_agent, ip, referer, duration, status_code, success)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          interaction.timestamp,
          interaction.type,
          interaction.method,
          interaction.path,
          JSON.stringify(interaction.query),
          JSON.stringify(interaction.body),
          interaction.userAgent,
          interaction.ip,
          interaction.referer,
          interaction.duration,
          interaction.statusCode,
          interaction.success
        ]
      );

      if (this.verbose) {
        console.log(`[UXBehaviorTracker] Logged ${interaction.type}: ${interaction.method} ${interaction.path} (${interaction.duration}ms)`);
      }

    } catch (error) {
      console.error('[UXBehaviorTracker] Database error:', error.message);
    }
  }

  /**
   * Create database table if doesn't exist
   */
  async initializeDatabase() {
    if (!this.db) return;

    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ux_interactions (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL,
          type VARCHAR(50) NOT NULL,
          method VARCHAR(10) NOT NULL,
          path TEXT NOT NULL,
          query JSONB,
          body JSONB,
          user_agent TEXT,
          ip VARCHAR(45),
          referer TEXT,
          duration INTEGER,
          status_code INTEGER,
          success BOOLEAN,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ux_interactions_type ON ux_interactions(type);
        CREATE INDEX IF NOT EXISTS idx_ux_interactions_timestamp ON ux_interactions(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ux_interactions_path ON ux_interactions(path);
      `);

      console.log('[UXBehaviorTracker] Database initialized');

    } catch (error) {
      console.error('[UXBehaviorTracker] Failed to initialize database:', error.message);
    }
  }

  /**
   * Get interaction statistics
   */
  async getStats(options = {}) {
    if (!this.db) return null;

    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      endDate = new Date(),
      type = null
    } = options;

    try {
      const query = type
        ? `SELECT
             COUNT(*) as total,
             COUNT(CASE WHEN success THEN 1 END) as successful,
             COUNT(CASE WHEN NOT success THEN 1 END) as failed,
             AVG(duration) as avg_duration,
             type
           FROM ux_interactions
           WHERE timestamp >= $1 AND timestamp <= $2 AND type = $3
           GROUP BY type`
        : `SELECT
             COUNT(*) as total,
             COUNT(CASE WHEN success THEN 1 END) as successful,
             COUNT(CASE WHEN NOT success THEN 1 END) as failed,
             AVG(duration) as avg_duration,
             type
           FROM ux_interactions
           WHERE timestamp >= $1 AND timestamp <= $2
           GROUP BY type`;

      const params = type ? [startDate, endDate, type] : [startDate, endDate];

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[UXBehaviorTracker] Failed to get stats:', error.message);
      return null;
    }
  }
}

module.exports = UXBehaviorTracker;
