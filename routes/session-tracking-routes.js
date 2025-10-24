/**
 * Session Tracking Routes
 *
 * API endpoints for timer-based bounce detection and session tracking.
 *
 * Features:
 * - Heartbeat tracking (5-second timer)
 * - Bounce detection
 * - Cross-domain session preservation
 * - Affiliate attribution (session-based, not cookie-based)
 * - IP rotation tracking (residential proxy use case)
 */

const express = require('express');
const router = express.Router();

module.exports = (sessionHeartbeat) => {

  /**
   * POST /api/session/heartbeat
   * Receive heartbeat from client
   */
  router.post('/heartbeat', async (req, res) => {
    try {
      const {
        sessionId,
        page,
        heartbeatCount,
        interactionCount,
        affiliateCode,
        campaignId,
        referralSource,
        endSession
      } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          status: 'error',
          message: 'sessionId is required'
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Check if session exists
      const existingSession = await sessionHeartbeat.getSessionStats(sessionId);

      // Create session if it doesn't exist
      if (!existingSession.success) {
        const createResult = await sessionHeartbeat.createSession({
          deviceId: req.headers['x-device-id'],
          page,
          ipAddress,
          userAgent,
          referrer: req.headers['referer'],
          affiliateCode,
          campaignId,
          referralSource
        });

        if (!createResult.success) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to create session'
          });
        }
      }

      // Record heartbeat
      const result = await sessionHeartbeat.recordHeartbeat(sessionId, {
        ipAddress,
        userAgent,
        page
      });

      // Update interaction count
      if (interactionCount > 0) {
        await sessionHeartbeat.db.query(`
          UPDATE visit_sessions
          SET total_interactions = $2
          WHERE session_id = $1
        `, [sessionId, interactionCount]);
      }

      // End session if requested
      if (endSession) {
        await sessionHeartbeat.endSession(sessionId, {
          totalInteractions: interactionCount
        });
      }

      res.json({
        status: 'success',
        sessionId,
        heartbeatCount
      });

    } catch (error) {
      console.error('[SessionTracking] Heartbeat error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * POST /api/session/start
   * Start a new session
   */
  router.post('/start', async (req, res) => {
    try {
      const {
        deviceId,
        userId,
        page,
        roomName,
        affiliateCode,
        campaignId,
        referralSource
      } = req.body;

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const referrer = req.headers['referer'];

      const result = await sessionHeartbeat.createSession({
        deviceId,
        userId,
        page,
        roomName,
        ipAddress,
        userAgent,
        referrer,
        affiliateCode,
        campaignId,
        referralSource
      });

      if (!result.success) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create session'
        });
      }

      res.json({
        status: 'success',
        sessionId: result.sessionId,
        startTime: result.startTime
      });

    } catch (error) {
      console.error('[SessionTracking] Start error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * POST /api/session/end
   * End a session
   */
  router.post('/end', async (req, res) => {
    try {
      const { sessionId, totalInteractions, reason } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          status: 'error',
          message: 'sessionId is required'
        });
      }

      const result = await sessionHeartbeat.endSession(sessionId, {
        totalInteractions,
        reason
      });

      if (!result.success) {
        return res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
      }

      res.json({
        status: 'success',
        bounce: result.bounce
      });

    } catch (error) {
      console.error('[SessionTracking] End error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/session/stats/:sessionId
   * Get session statistics
   */
  router.get('/stats/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const result = await sessionHeartbeat.getSessionStats(sessionId);

      if (!result.success) {
        return res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
      }

      res.json({
        status: 'success',
        session: result.session
      });

    } catch (error) {
      console.error('[SessionTracking] Stats error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/session/analytics/bounce
   * Get bounce analytics
   */
  router.get('/analytics/bounce', async (req, res) => {
    try {
      const { page, limit } = req.query;

      const result = await sessionHeartbeat.getBounceAnalytics({
        page,
        limit: limit ? parseInt(limit) : 10
      });

      if (!result.success) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to get analytics'
        });
      }

      res.json({
        status: 'success',
        analytics: result.analytics
      });

    } catch (error) {
      console.error('[SessionTracking] Analytics error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/session/active
   * Get active sessions count
   */
  router.get('/active', async (req, res) => {
    try {
      const result = await sessionHeartbeat.db.query(`
        SELECT COUNT(*) as active_count
        FROM visit_sessions
        WHERE is_active = true
          AND last_heartbeat_at > NOW() - INTERVAL '30 seconds'
      `);

      res.json({
        status: 'success',
        activeCount: parseInt(result.rows[0].active_count)
      });

    } catch (error) {
      console.error('[SessionTracking] Active count error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
};
