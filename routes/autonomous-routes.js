/**
 * Autonomous Mode REST API Routes
 *
 * The "copilot mode" - user describes what they want, system builds it autonomously.
 * Connects Builder Agent + Model Council + Pattern Learner + Code Indexer + Browser Agent.
 *
 * Vision: "Build a visitor counter widget" → 3 minutes later it's deployed
 *
 * Endpoints:
 * - POST /api/autonomous/build - Trigger autonomous build
 * - GET /api/autonomous/:sessionId - Get session details
 * - GET /api/autonomous/:sessionId/status - Quick status check
 * - GET /api/autonomous/sessions - List all sessions
 * - GET /api/autonomous/status - Get autonomous mode status
 * - POST /api/autonomous/enable - Enable autonomous mode
 * - POST /api/autonomous/disable - Disable autonomous mode
 */

const express = require('express');
const router = express.Router();
const AutonomousMode = require('../lib/autonomous-mode');

let autonomousMode = null;
let db = null;
let agentRegistry = null;
let broadcast = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, registry, options = {}) {
  db = database;
  agentRegistry = registry;
  broadcast = options.broadcast || (() => {});

  // Initialize Autonomous Mode
  autonomousMode = new AutonomousMode({
    db,
    agentRegistry,
    broadcast,
    enabled: options.enabled !== false // Default: ON
  });

  console.log('✓ Autonomous Mode routes initialized');
  return router;
}

/**
 * POST /api/autonomous/build
 * Trigger autonomous build from natural language prompt
 *
 * Body:
 * - prompt: What to build (required)
 * - options: Build options (optional)
 *   - autoTest: Run tests automatically (default: true)
 *   - autoDeploy: Deploy automatically (default: false)
 *   - sessionId: Resume existing session (optional)
 *
 * Example:
 * {
 *   "prompt": "Build a visitor counter widget",
 *   "options": { "autoTest": true, "autoDeploy": false }
 * }
 */
router.post('/build', async (req, res) => {
  try {
    const { prompt, options = {} } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Prompt is required'
      });
    }

    console.log(`[AutonomousAPI] Processing request: "${prompt}"`);

    // Start autonomous build
    const result = await autonomousMode.handleRequest(prompt, options);

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: result.message || 'Autonomous build failed',
        manualMode: result.manualMode || false
      });
    }

    res.json({
      status: 'success',
      sessionId: result.sessionId,
      result: result.result,
      timeTaken: result.timeTaken,
      message: 'Autonomous build completed',
      pollUrl: `/api/autonomous/${result.sessionId}`,
      statusUrl: `/api/autonomous/${result.sessionId}/status`
    });

  } catch (error) {
    console.error('[AutonomousAPI] Build failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/autonomous/:sessionId
 * Get full session details
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get from database
    const result = await db.query(
      `SELECT * FROM autonomous_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    const session = result.rows[0];

    res.json({
      status: 'success',
      session: {
        sessionId: session.session_id,
        prompt: session.prompt,
        intent: session.intent,
        similarPatterns: session.similar_patterns,
        existingCode: session.existing_code,
        consensus: session.consensus,
        result: session.result,
        success: session.success,
        duration: session.duration_ms,
        createdAt: session.created_at,
        completedAt: session.completed_at
      }
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to get session:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/autonomous/:sessionId/status
 * Quick status check
 */
router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(
      `SELECT session_id, prompt, success, duration_ms, created_at, completed_at
       FROM autonomous_sessions
       WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    const session = result.rows[0];

    res.json({
      status: 'success',
      sessionId: session.session_id,
      prompt: session.prompt,
      success: session.success,
      duration: session.duration_ms,
      createdAt: session.created_at,
      completedAt: session.completed_at,
      isComplete: !!session.completed_at
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to get status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/autonomous/sessions
 * List all autonomous sessions
 *
 * Query params:
 * - limit: Max results (default: 50)
 * - success: Filter by success (true/false)
 */
router.get('/sessions', async (req, res) => {
  try {
    const { limit = 50, success } = req.query;

    let query = `
      SELECT session_id, prompt, success, duration_ms, created_at, completed_at
      FROM autonomous_sessions
    `;

    const params = [];

    // Filter by success if specified
    if (success !== undefined) {
      query += ` WHERE success = $1`;
      params.push(success === 'true');
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      count: result.rows.length,
      sessions: result.rows.map(s => ({
        sessionId: s.session_id,
        prompt: s.prompt,
        success: s.success,
        duration: s.duration_ms,
        createdAt: s.created_at,
        completedAt: s.completed_at
      }))
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to list sessions:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/autonomous/status
 * Get autonomous mode status and statistics
 */
router.get('/status', async (req, res) => {
  try {
    const modeStatus = autonomousMode.getStatus();

    // Get stats from database
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE success = true) as successful_sessions,
        COUNT(*) FILTER (WHERE success = false) as failed_sessions,
        AVG(duration_ms) FILTER (WHERE success = true) as avg_duration_ms
      FROM autonomous_sessions
    `);

    const stats = statsResult.rows[0];

    res.json({
      status: 'success',
      autonomousMode: {
        enabled: modeStatus.enabled,
        activeSessions: modeStatus.activeSessions,
        historyCount: modeStatus.historyCount,
        systems: modeStatus.systems
      },
      stats: {
        totalSessions: parseInt(stats.total_sessions),
        successfulSessions: parseInt(stats.successful_sessions),
        failedSessions: parseInt(stats.failed_sessions),
        averageDuration: stats.avg_duration_ms ? Math.round(stats.avg_duration_ms) : null
      }
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to get status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/autonomous/enable
 * Enable autonomous mode
 */
router.post('/enable', (req, res) => {
  try {
    autonomousMode.setEnabled(true);

    res.json({
      status: 'success',
      message: 'Autonomous mode enabled',
      enabled: true
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to enable:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/autonomous/disable
 * Disable autonomous mode
 */
router.post('/disable', (req, res) => {
  try {
    autonomousMode.setEnabled(false);

    res.json({
      status: 'success',
      message: 'Autonomous mode disabled',
      enabled: false
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to disable:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/autonomous/history
 * Get recent autonomous build history
 *
 * Query params:
 * - limit: Number of recent builds (default: 10, max: 50)
 */
router.get('/history', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const historyLimit = Math.min(parseInt(limit), 50);

    const history = autonomousMode.getHistory(historyLimit);

    res.json({
      status: 'success',
      count: history.length,
      history
    });

  } catch (error) {
    console.error('[AutonomousAPI] Failed to get history:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = { router, initRoutes };
