/**
 * Recording Mission Routes
 *
 * API endpoints for CalRiven's autonomous recording mission system
 */

const express = require('express');
const router = express.Router();

// Global orchestrator instance (initialized in router.js)
let orchestrator = null;

/**
 * Initialize orchestrator
 */
function initOrchestrator(orch) {
  orchestrator = orch;
}

/**
 * POST /api/recording-mission/start
 * Start autonomous recording mission
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId || 'default_user';

    if (!orchestrator) {
      return res.status(500).json({
        success: false,
        error: 'Orchestrator not initialized'
      });
    }

    await orchestrator.start(userId);

    res.json({
      success: true,
      message: 'Recording mission started',
      userId,
      status: await orchestrator.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/recording-mission/stop
 * Stop autonomous recording mission
 */
router.post('/stop', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({
        success: false,
        error: 'Orchestrator not initialized'
      });
    }

    await orchestrator.stop();

    res.json({
      success: true,
      message: 'Recording mission stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/status
 * Get current mission status
 */
router.get('/status', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({
        success: false,
        error: 'Orchestrator not initialized'
      });
    }

    const status = await orchestrator.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/sessions
 * Get all recording sessions for user
 */
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.query.userId || 'default_user';

    // Query database for sessions
    const db = req.app.locals.db;
    const result = await db.query(`
      SELECT * FROM recording_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      success: true,
      sessions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/sessions/:sessionId
 * Get specific recording session details
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.app.locals.db;

    const result = await db.query(`
      SELECT * FROM recording_sessions
      WHERE session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Get logs for session
    const logsResult = await db.query(`
      SELECT * FROM recording_mission_logs
      WHERE session_id = $1
      ORDER BY logged_at DESC
      LIMIT 100
    `, [sessionId]);

    res.json({
      success: true,
      session: result.rows[0],
      logs: logsResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/active
 * Get all active recording missions (dashboard view)
 */
router.get('/active', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = await db.query(`
      SELECT * FROM active_recording_missions
      ORDER BY detected_at DESC
    `);

    res.json({
      success: true,
      missions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/logs
 * Get recent mission logs
 */
router.get('/logs', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = parseInt(req.query.limit) || 100;
    const db = req.app.locals.db;

    let query = `
      SELECT * FROM recording_mission_logs
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    query += ` ORDER BY logged_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      success: true,
      logs: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/recording-mission/process-manual
 * Manually trigger processing of a specific file
 */
router.post('/process-manual', async (req, res) => {
  try {
    const { filePath, userId } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath required'
      });
    }

    if (!orchestrator) {
      return res.status(500).json({
        success: false,
        error: 'Orchestrator not initialized'
      });
    }

    // Manually trigger processing
    orchestrator.userId = userId || 'default_user';
    const result = await orchestrator._processRecording(filePath);

    res.json({
      success: true,
      message: 'Recording processed manually',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/recording-mission/quest-status
 * Get recording quest status for user
 */
router.get('/quest-status', async (req, res) => {
  try {
    const userId = req.query.userId || 'default_user';
    const db = req.app.locals.db;

    // Get quest
    const questResult = await db.query(`
      SELECT * FROM quests
      WHERE quest_slug = 'record-calos-walkthrough'
    `);

    if (questResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Recording quest not found'
      });
    }

    const quest = questResult.rows[0];

    // Get user progress
    const progressResult = await db.query(`
      SELECT * FROM user_quest_progress
      WHERE user_id = $1 AND quest_id = $2
    `, [userId, quest.quest_id]);

    const progress = progressResult.rows[0] || null;

    res.json({
      success: true,
      quest,
      progress,
      isActive: progress && progress.status === 'in_progress',
      isComplete: progress && progress.status === 'completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * WebSocket endpoint for real-time mission updates
 * (Requires WebSocket server setup in router.js)
 */
function setupWebSocketUpdates(wss) {
  if (!orchestrator) return;

  // Forward orchestrator events to WebSocket clients
  orchestrator.on('recording:detected', (data) => {
    broadcastToClients(wss, {
      event: 'recording:detected',
      data
    });
  });

  orchestrator.on('transcription:complete', (data) => {
    broadcastToClients(wss, {
      event: 'transcription:complete',
      data
    });
  });

  orchestrator.on('quest:completed', (data) => {
    broadcastToClients(wss, {
      event: 'quest:completed',
      data
    });
  });

  orchestrator.on('recording:error', (data) => {
    broadcastToClients(wss, {
      event: 'recording:error',
      data
    });
  });
}

function broadcastToClients(wss, message) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(message));
    }
  });
}

module.exports = router;
module.exports.initOrchestrator = initOrchestrator;
module.exports.setupWebSocketUpdates = setupWebSocketUpdates;
