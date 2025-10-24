/**
 * Session Heartbeat Manager
 *
 * Timer-based bounce detection system for spam filtering and analytics.
 *
 * Features:
 * - 5-second heartbeat tracking
 * - Automatic bounce detection
 * - IP rotation tracking (residential proxy use case)
 * - Cross-domain session preservation
 * - Spam scoring
 *
 * Use case: Track if timer doesn't move (user bounced / failed)
 * Like a spam filter to detect bots, bounces, suspicious behavior.
 */

const crypto = require('crypto');

class SessionHeartbeatManager {
  constructor(options = {}) {
    this.db = options.db;
    this.checkInterval = options.checkInterval || 60000; // Check every minute
    this.bounceThreshold = options.bounceThreshold || 30000; // 30 seconds
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes

    this.intervalId = null;
    this.cleanupIntervalId = null;
  }

  /**
   * Start heartbeat monitoring
   */
  start() {
    console.log('[SessionHeartbeat] Starting heartbeat monitor...');

    // Detect bounces every minute
    this.intervalId = setInterval(() => {
      this.detectBounces().catch(err =>
        console.error('[SessionHeartbeat] Bounce detection error:', err)
      );
    }, this.checkInterval);

    // Cleanup inactive sessions every 5 minutes
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupInactiveSessions().catch(err =>
        console.error('[SessionHeartbeat] Cleanup error:', err)
      );
    }, this.cleanupInterval);

    console.log('[SessionHeartbeat] Monitor started');
  }

  /**
   * Stop heartbeat monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    console.log('[SessionHeartbeat] Monitor stopped');
  }

  /**
   * Record heartbeat from client
   */
  async recordHeartbeat(sessionId, metadata = {}) {
    try {
      const { ipAddress, userAgent, page } = metadata;

      // Hash IP for privacy
      const ipHash = ipAddress ? this.hashIP(ipAddress) : null;

      await this.db.query(
        'SELECT update_session_heartbeat($1, $2)',
        [sessionId, ipAddress]
      );

      // Update metadata if provided
      if (page || userAgent) {
        await this.db.query(`
          UPDATE visit_sessions
          SET
            page = COALESCE($2, page),
            metadata = metadata || $3
          WHERE session_id = $1
        `, [sessionId, page, JSON.stringify({ userAgent })]);
      }

      return { success: true };

    } catch (error) {
      console.error('[SessionHeartbeat] Record error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create new session
   */
  async createSession(metadata = {}) {
    try {
      const {
        deviceId,
        userId,
        page,
        roomName,
        ipAddress,
        userAgent,
        referrer,
        affiliateCode,
        referralSource,
        campaignId
      } = metadata;

      const sessionId = crypto.randomUUID();
      const ipHash = ipAddress ? this.hashIP(ipAddress) : null;

      const result = await this.db.query(`
        INSERT INTO visit_sessions (
          session_id,
          device_id,
          user_id,
          page,
          room_name,
          ip_address,
          ip_hash,
          affiliate_code,
          referral_source,
          campaign_id,
          last_heartbeat_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
        RETURNING session_id, start_time
      `, [
        sessionId,
        deviceId,
        userId,
        page,
        roomName,
        ipAddress,
        ipHash,
        affiliateCode,
        referralSource,
        campaignId,
        JSON.stringify({ userAgent, referrer })
      ]);

      return {
        success: true,
        sessionId: result.rows[0].session_id,
        startTime: result.rows[0].start_time
      };

    } catch (error) {
      console.error('[SessionHeartbeat] Create session error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * End session
   */
  async endSession(sessionId, metadata = {}) {
    try {
      const { totalInteractions, reason } = metadata;

      const result = await this.db.query(`
        UPDATE visit_sessions
        SET
          end_time = NOW(),
          duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000,
          total_interactions = COALESCE($2, total_interactions),
          is_active = false
        WHERE session_id = $1
        RETURNING duration_ms, total_interactions
      `, [sessionId, totalInteractions]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Session not found' };
      }

      // Auto-detect if it's a bounce
      const session = result.rows[0];
      const isBounce =
        session.total_interactions === 0 ||
        session.duration_ms < 5000;

      if (isBounce) {
        await this.markAsBounce(sessionId, reason || 'auto_detected');
      }

      return { success: true, bounce: isBounce };

    } catch (error) {
      console.error('[SessionHeartbeat] End session error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark session as bounce
   */
  async markAsBounce(sessionId, reason) {
    try {
      await this.db.query(`
        UPDATE visit_sessions
        SET
          bounce_detected = true,
          bounce_reason = $2,
          bounce_time_ms = EXTRACT(EPOCH FROM (COALESCE(last_heartbeat_at, end_time, NOW()) - start_time)) * 1000
        WHERE session_id = $1
      `, [sessionId, reason]);

      return { success: true };

    } catch (error) {
      console.error('[SessionHeartbeat] Mark bounce error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect bounces automatically
   */
  async detectBounces() {
    try {
      const result = await this.db.query('SELECT detect_bounces()');
      console.log('[SessionHeartbeat] Bounce detection complete');
      return { success: true };

    } catch (error) {
      console.error('[SessionHeartbeat] Bounce detection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupInactiveSessions() {
    try {
      const result = await this.db.query('SELECT cleanup_inactive_sessions()');
      console.log('[SessionHeartbeat] Cleanup complete');
      return { success: true };

    } catch (error) {
      console.error('[SessionHeartbeat] Cleanup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId) {
    try {
      const result = await this.db.query(`
        SELECT
          session_id,
          start_time,
          end_time,
          duration_ms,
          heartbeat_count,
          last_heartbeat_at,
          total_interactions,
          bounce_detected,
          bounce_reason,
          ip_rotations,
          affiliate_code,
          spam_score,
          is_bot,
          is_active
        FROM visit_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Session not found' };
      }

      return { success: true, session: result.rows[0] };

    } catch (error) {
      console.error('[SessionHeartbeat] Get stats error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get bounce analytics
   */
  async getBounceAnalytics(options = {}) {
    try {
      const { page, limit = 10 } = options;

      let query = `
        SELECT * FROM bounce_analytics_by_page
      `;

      const params = [];
      if (page) {
        query += ` WHERE page = $1`;
        params.push(page);
      }

      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return { success: true, analytics: result.rows };

    } catch (error) {
      console.error('[SessionHeartbeat] Analytics error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate spam score
   */
  async calculateSpamScore(sessionId) {
    try {
      const result = await this.db.query(`
        SELECT
          heartbeat_count,
          total_interactions,
          duration_ms,
          bounce_detected,
          ip_rotations
        FROM visit_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Session not found' };
      }

      const session = result.rows[0];
      let spamScore = 0;

      // Low heartbeat count = suspicious
      if (session.heartbeat_count < 2) {
        spamScore += 30;
      }

      // No interactions = likely bot
      if (session.total_interactions === 0) {
        spamScore += 25;
      }

      // Very short session = bounce
      if (session.duration_ms && session.duration_ms < 3000) {
        spamScore += 20;
      }

      // Bounce detected
      if (session.bounce_detected) {
        spamScore += 15;
      }

      // Excessive IP rotations (proxy abuse)
      if (session.ip_rotations > 5) {
        spamScore += 10;
      }

      // Update spam score
      await this.db.query(`
        UPDATE visit_sessions
        SET spam_score = $2
        WHERE session_id = $1
      `, [sessionId, spamScore]);

      return { success: true, spamScore };

    } catch (error) {
      console.error('[SessionHeartbeat] Spam score error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Hash IP address for privacy
   */
  hashIP(ipAddress) {
    return crypto
      .createHash('sha256')
      .update(ipAddress)
      .digest('hex');
  }
}

module.exports = SessionHeartbeatManager;
