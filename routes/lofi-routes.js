/**
 * Lofi Streaming Room Routes
 *
 * Features:
 * - Song requests with queue management
 * - Live viewer count tracking
 * - Heatmap/click tracking
 * - Room-based broadcasting
 * - Badge-gated permissions
 */

const express = require('express');
const router = express.Router();
const BadgeSystem = require('../lib/badge-system');
const { runAgent } = require('../agents/agent-runner');

const badgeSystem = new BadgeSystem();

/**
 * Initialize lofi routes with database connection and broadcast function
 */
function initLofiRoutes(db, broadcast, sessionTracker) {
  /**
   * GET /lofi/room-state
   * Get current room state (viewers, queue, now playing)
   */
  router.get('/room-state', async (req, res) => {
    try {
      const roomName = req.query.room || 'lofi-stream';

      const result = await db.query(`
        SELECT
          rs.room_name,
          rs.current_viewers,
          rs.peak_viewers,
          rs.total_sessions,
          rs.queue_length,
          rs.current_song_started_at,
          sr.song_title as current_song_title,
          sr.song_artist as current_song_artist,
          sr.song_url as current_song_url
        FROM room_state rs
        LEFT JOIN song_requests sr ON rs.current_song_id = sr.id
        WHERE rs.room_name = $1
      `, [roomName]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          code: 'ROOM_NOT_FOUND'
        });
      }

      const roomState = result.rows[0];

      // Get live viewer count from session tracker
      const liveViewers = sessionTracker.getRoomCount(roomName);

      res.json({
        status: 'success',
        room: {
          name: roomState.room_name,
          viewers: liveViewers,
          peakViewers: roomState.peak_viewers,
          totalSessions: roomState.total_sessions,
          queueLength: roomState.queue_length,
          nowPlaying: roomState.current_song_title ? {
            title: roomState.current_song_title,
            artist: roomState.current_song_artist,
            url: roomState.current_song_url,
            startedAt: roomState.current_song_started_at
          } : null
        }
      });

    } catch (error) {
      console.error('[Lofi] Error getting room state:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR',
        message: error.message
      });
    }
  });

  /**
   * GET /lofi/queue
   * Get song queue
   */
  router.get('/queue', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          id,
          song_title,
          song_artist,
          song_url,
          song_duration_seconds,
          message,
          queue_position,
          status,
          requested_at,
          requester_badge,
          current_requester_badge,
          trust_score
        FROM song_queue
        ORDER BY queue_position ASC
        LIMIT 50
      `);

      res.json({
        status: 'success',
        queue: result.rows
      });

    } catch (error) {
      console.error('[Lofi] Error getting queue:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * POST /lofi/request-song
   * Request a song to be added to the queue
   */
  router.post('/request-song', async (req, res) => {
    try {
      const {
        deviceId,
        userId,
        songTitle,
        songArtist,
        songUrl,
        message
      } = req.body;

      // Validation
      if (!deviceId || !songTitle) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_FIELDS',
          message: 'deviceId and songTitle are required'
        });
      }

      // Call database function
      const result = await db.query(`
        SELECT * FROM request_song($1, $2, $3, $4, $5, $6)
      `, [
        deviceId,
        userId || null,
        songTitle,
        songArtist || null,
        songUrl || null,
        message || null
      ]);

      const requestResult = result.rows[0];

      if (!requestResult.success) {
        const errorMessages = {
          'DEVICE_BLOCKED': 'Your device has been blocked',
          'SUSPICIOUS_DEVICE': 'Your device is flagged as suspicious',
          'INSUFFICIENT_BADGE': 'You need at least Contributor badge to request songs',
          'RATE_LIMIT_EXCEEDED': 'You can only request 3 songs per hour'
        };

        return res.status(403).json({
          status: 'error',
          code: requestResult.error_code,
          message: errorMessages[requestResult.error_code] || 'Request failed'
        });
      }

      // Broadcast new song request to all room viewers
      if (broadcast) {
        broadcast({
          type: 'song_requested',
          roomName: 'lofi-stream',
          request: {
            id: requestResult.request_id,
            songTitle,
            songArtist,
            queuePosition: requestResult.queue_position,
            message
          }
        });
      }

      res.json({
        status: 'success',
        request: {
          id: requestResult.request_id,
          queuePosition: requestResult.queue_position
        }
      });

    } catch (error) {
      console.error('[Lofi] Error requesting song:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR',
        message: error.message
      });
    }
  });

  /**
   * POST /lofi/moderate-request
   * Approve or reject a song request (moderator only)
   */
  router.post('/moderate-request', async (req, res) => {
    try {
      const { requestId, moderatorId, action, reason } = req.body;

      if (!requestId || !moderatorId || !action) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_FIELDS'
        });
      }

      const result = await db.query(`
        SELECT moderate_song_request($1, $2, $3, $4) as success
      `, [requestId, moderatorId, action, reason || null]);

      if (!result.rows[0].success) {
        return res.status(403).json({
          status: 'error',
          code: 'PERMISSION_DENIED',
          message: 'You do not have moderator permissions'
        });
      }

      // Broadcast moderation action
      if (broadcast) {
        broadcast({
          type: 'song_moderated',
          roomName: 'lofi-stream',
          requestId,
          action
        });
      }

      res.json({
        status: 'success',
        action
      });

    } catch (error) {
      console.error('[Lofi] Error moderating request:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * POST /lofi/mark-played
   * Mark a song as played (admin/system only)
   */
  router.post('/mark-played', async (req, res) => {
    try {
      const { requestId, playDurationMs } = req.body;

      if (!requestId) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_FIELDS'
        });
      }

      await db.query(`
        SELECT mark_song_played($1, $2)
      `, [requestId, playDurationMs || 0]);

      // Broadcast "now playing" update
      if (broadcast) {
        const songResult = await db.query(`
          SELECT song_title, song_artist, song_url
          FROM song_requests
          WHERE id = $1
        `, [requestId]);

        if (songResult.rows.length > 0) {
          const song = songResult.rows[0];
          broadcast({
            type: 'now_playing',
            roomName: 'lofi-stream',
            song: {
              id: requestId,
              title: song.song_title,
              artist: song.song_artist,
              url: song.song_url
            }
          });
        }
      }

      res.json({
        status: 'success'
      });

    } catch (error) {
      console.error('[Lofi] Error marking song played:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * POST /lofi/track-heatmap
   * Record click/hover interaction for heatmap
   */
  router.post('/track-heatmap', async (req, res) => {
    try {
      const {
        sessionId,
        deviceId,
        page,
        roomName,
        interactionType,
        xPosition,
        yPosition,
        rawX,
        rawY,
        viewportWidth,
        viewportHeight,
        elementId,
        elementClass,
        elementTag
      } = req.body;

      if (!deviceId || !interactionType || xPosition === undefined || yPosition === undefined) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_FIELDS'
        });
      }

      await db.query(`
        INSERT INTO heatmap_data (
          session_id,
          device_id,
          page,
          room_name,
          interaction_type,
          x_position,
          y_position,
          raw_x,
          raw_y,
          viewport_width,
          viewport_height,
          element_id,
          element_class,
          element_tag
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        sessionId || null,
        deviceId,
        page || 'unknown',
        roomName || null,
        interactionType,
        xPosition,
        yPosition,
        rawX || null,
        rawY || null,
        viewportWidth || null,
        viewportHeight || null,
        elementId || null,
        elementClass || null,
        elementTag || null
      ]);

      // Record in session tracker
      if (sessionTracker && sessionId) {
        sessionTracker.recordInteraction(sessionId, interactionType, {
          x: xPosition,
          y: yPosition,
          element: elementId
        });
      }

      res.json({
        status: 'success'
      });

    } catch (error) {
      console.error('[Lofi] Error tracking heatmap:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * GET /lofi/heatmap
   * Get heatmap data for visualization
   */
  router.get('/heatmap', async (req, res) => {
    try {
      const page = req.query.page || 'lofi-stream';
      const roomName = req.query.room;
      const interactionType = req.query.type;

      let query = `
        SELECT
          page,
          room_name,
          interaction_type,
          x_bucket,
          y_bucket,
          interaction_count,
          last_interaction
        FROM heatmap_summary
        WHERE page = $1
      `;

      const params = [page];

      if (roomName) {
        params.push(roomName);
        query += ` AND room_name = $${params.length}`;
      }

      if (interactionType) {
        params.push(interactionType);
        query += ` AND interaction_type = $${params.length}`;
      }

      query += ` ORDER BY interaction_count DESC LIMIT 1000`;

      const result = await db.query(query, params);

      res.json({
        status: 'success',
        heatmap: result.rows
      });

    } catch (error) {
      console.error('[Lofi] Error getting heatmap:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * GET /lofi/analytics
   * Get session analytics
   */
  router.get('/analytics', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT * FROM session_analytics
        WHERE page LIKE '%lofi%'
        ORDER BY total_sessions DESC
      `);

      res.json({
        status: 'success',
        analytics: result.rows
      });

    } catch (error) {
      console.error('[Lofi] Error getting analytics:', error);
      res.status(500).json({
        status: 'error',
        code: 'DATABASE_ERROR'
      });
    }
  });

  /**
   * POST /lofi/chat
   * Send message to AI assistant
   */
  router.post('/chat', async (req, res) => {
    try {
      const { deviceId, roomName, message, agent = 'gpt-3.5' } = req.body;

      if (!deviceId || !message) {
        return res.status(400).json({
          status: 'error',
          message: 'deviceId and message are required'
        });
      }

      // Build context for agent
      const context = {
        room: roomName,
        deviceId,
        isLofiStream: roomName === 'lofi-stream',
        systemPrompt: `You are a friendly AI assistant in a lofi music streaming room.
Help users with song recommendations, artist information, and general music questions.
Keep responses concise and chill. You can recommend lofi, chillhop, and similar genres.`
      };

      // Call the agent
      const response = await runAgent(agent, message, context);

      // Broadcast message to room (optional - for public chat)
      if (broadcast && roomName) {
        broadcast({
          type: 'lofi_chat',
          roomName,
          deviceId,
          message,
          response
        });
      }

      res.json({
        status: 'success',
        response
      });

    } catch (error) {
      console.error('[Lofi] Chat error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = initLofiRoutes;
