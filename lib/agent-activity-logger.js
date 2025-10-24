/**
 * Agent Activity Logger
 *
 * Tracks what agents (@ollama, @gpt4, @claude) are doing across the system.
 * Logs every agent action with full context: user, session, device, domain, profile, geolocation.
 *
 * Use cases:
 * - Monitor agent usage patterns
 * - Debug agent routing issues
 * - Analyze agent performance by domain
 * - Track agent activity per user/session
 * - Build agent usage dashboards
 */

const crypto = require('crypto');

class AgentActivityLogger {
  constructor(options = {}) {
    this.db = options.db || null;
    this.logToConsole = options.logToConsole !== false; // Default: true
    this.logToDatabase = options.logToDatabase !== false; // Default: true
    this.maxInputLength = options.maxInputLength || 1000;
    this.maxResultLength = options.maxResultLength || 2000;

    console.log('[AgentActivityLogger] Initialized');
  }

  /**
   * Log agent activity
   *
   * @param {object} params - Activity parameters
   * @returns {Promise<string>} - Activity ID (UUID)
   */
  async logActivity(params) {
    const {
      agent,              // '@ollama:mistral', '@gpt4', '@claude'
      user_id,            // User ID
      session_id,         // Session ID
      device_id,          // Device ID (if available)
      identity_id,        // Unified identity ID
      origin_domain,      // Domain where request originated
      input,              // User prompt/input
      result,             // Agent response
      context = {},       // Full context object
      duration_ms,        // How long the request took
      status = 'success', // 'success', 'error', 'timeout'
      error_message = null
    } = params;

    const activity_id = crypto.randomUUID();
    const timestamp = new Date();

    // Truncate long text fields
    const truncatedInput = input ? input.substring(0, this.maxInputLength) : null;
    const truncatedResult = result ? result.substring(0, this.maxResultLength) : null;

    // Extract key context fields
    const detectedProfile = context.detectedProfile || null;
    const profileConfidence = context.profileConfidence || null;
    const geolocation = context.geolocation || null;
    const clientIp = context.clientIp || null;
    const platform = context.platform || 'unknown';
    const domainContext = context.domainContext || null;

    // Build activity record
    const activityRecord = {
      activity_id,
      timestamp,
      agent,
      user_id,
      session_id,
      device_id,
      identity_id,
      origin_domain,
      input: truncatedInput,
      result: truncatedResult,
      duration_ms,
      status,
      error_message,
      detected_profile: detectedProfile,
      profile_confidence: profileConfidence,
      geolocation: geolocation ? JSON.stringify(geolocation) : null,
      client_ip: clientIp,
      platform,
      domain_context: domainContext,
      full_context: JSON.stringify(context)
    };

    // Log to console
    if (this.logToConsole) {
      const statusSymbol = status === 'success' ? '✓' : '✗';
      console.log(`[AgentActivity] ${statusSymbol} ${agent} | ${origin_domain || 'unknown'} | ${duration_ms}ms | User: ${user_id || 'anon'} | Profile: ${detectedProfile || 'unknown'}`);
    }

    // Log to database
    if (this.logToDatabase && this.db) {
      try {
        await this.db.query(
          `INSERT INTO agent_activity_log (
            activity_id, timestamp, agent, user_id, session_id, device_id, identity_id,
            origin_domain, input, result, duration_ms, status, error_message,
            detected_profile, profile_confidence, geolocation, client_ip, platform,
            domain_context, full_context
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            activity_id,
            timestamp,
            agent,
            user_id,
            session_id,
            device_id,
            identity_id,
            origin_domain,
            truncatedInput,
            truncatedResult,
            duration_ms,
            status,
            error_message,
            detectedProfile,
            profileConfidence,
            activityRecord.geolocation,
            clientIp,
            platform,
            domainContext,
            activityRecord.full_context
          ]
        );

        console.log(`[AgentActivity] 💾 Logged to database: ${activity_id}`);
      } catch (error) {
        console.error('[AgentActivity] Database logging failed:', error.message);
      }
    }

    return activity_id;
  }

  /**
   * Get agent activity for a user
   *
   * @param {string} userId - User ID
   * @param {object} options - { limit, offset, agent, domain, status }
   * @returns {Promise<array>} - Activity records
   */
  async getActivityByUser(userId, options = {}) {
    if (!this.db) {
      return [];
    }

    const {
      limit = 50,
      offset = 0,
      agent = null,
      domain = null,
      status = null
    } = options;

    try {
      let query = `
        SELECT
          activity_id,
          timestamp,
          agent,
          origin_domain,
          input,
          result,
          duration_ms,
          status,
          detected_profile,
          profile_confidence,
          geolocation,
          platform
        FROM agent_activity_log
        WHERE user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (agent) {
        query += ` AND agent = $${paramIndex}`;
        params.push(agent);
        paramIndex++;
      }

      if (domain) {
        query += ` AND origin_domain = $${paramIndex}`;
        params.push(domain);
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);
      return result.rows;

    } catch (error) {
      console.error('[AgentActivity] Query failed:', error.message);
      return [];
    }
  }

  /**
   * Get agent activity for a session
   */
  async getActivityBySession(sessionId, options = {}) {
    if (!this.db) {
      return [];
    }

    const { limit = 50, offset = 0 } = options;

    try {
      const result = await this.db.query(
        `SELECT
          activity_id,
          timestamp,
          agent,
          origin_domain,
          input,
          result,
          duration_ms,
          status,
          detected_profile,
          platform
        FROM agent_activity_log
        WHERE session_id = $1
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3`,
        [sessionId, limit, offset]
      );

      return result.rows;

    } catch (error) {
      console.error('[AgentActivity] Query failed:', error.message);
      return [];
    }
  }

  /**
   * Get agent activity by domain
   */
  async getActivityByDomain(domain, options = {}) {
    if (!this.db) {
      return [];
    }

    const { limit = 100, offset = 0, agent = null } = options;

    try {
      let query = `
        SELECT
          activity_id,
          timestamp,
          agent,
          user_id,
          session_id,
          input,
          result,
          duration_ms,
          status,
          detected_profile
        FROM agent_activity_log
        WHERE origin_domain = $1
      `;

      const params = [domain];

      if (agent) {
        query += ` AND agent = $2`;
        params.push(agent);
        query += ` ORDER BY timestamp DESC LIMIT $3 OFFSET $4`;
        params.push(limit, offset);
      } else {
        query += ` ORDER BY timestamp DESC LIMIT $2 OFFSET $3`;
        params.push(limit, offset);
      }

      const result = await this.db.query(query, params);
      return result.rows;

    } catch (error) {
      console.error('[AgentActivity] Query failed:', error.message);
      return [];
    }
  }

  /**
   * Get agent statistics
   */
  async getAgentStats(options = {}) {
    if (!this.db) {
      return null;
    }

    const {
      agent = null,
      domain = null,
      startDate = null,
      endDate = null
    } = options;

    try {
      let query = `
        SELECT
          agent,
          COUNT(*) as total_requests,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_requests,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_requests,
          AVG(duration_ms) as avg_duration_ms,
          MIN(duration_ms) as min_duration_ms,
          MAX(duration_ms) as max_duration_ms,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT session_id) as unique_sessions,
          COUNT(DISTINCT origin_domain) as unique_domains
        FROM agent_activity_log
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (agent) {
        query += ` AND agent = $${paramIndex}`;
        params.push(agent);
        paramIndex++;
      }

      if (domain) {
        query += ` AND origin_domain = $${paramIndex}`;
        params.push(domain);
        paramIndex++;
      }

      if (startDate) {
        query += ` AND timestamp >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND timestamp <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` GROUP BY agent ORDER BY total_requests DESC`;

      const result = await this.db.query(query, params);
      return result.rows;

    } catch (error) {
      console.error('[AgentActivity] Stats query failed:', error.message);
      return null;
    }
  }

  /**
   * Get recent activity (last N records)
   */
  async getRecentActivity(limit = 20) {
    if (!this.db) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT
          activity_id,
          timestamp,
          agent,
          user_id,
          origin_domain,
          input,
          result,
          duration_ms,
          status,
          detected_profile
        FROM agent_activity_log
        ORDER BY timestamp DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows;

    } catch (error) {
      console.error('[AgentActivity] Query failed:', error.message);
      return [];
    }
  }
}

module.exports = AgentActivityLogger;
