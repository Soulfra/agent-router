/**
 * Actions API Routes
 *
 * Execute actions, check availability, view history and statistics
 */

const express = require('express');
const router = express.Router();
const actionsEngine = require('../lib/actions-engine');
const { requireAuth, optionalAuth } = require('../middleware/sso-auth');

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  actionsEngine.initEngine(database);
  return router;
}

/**
 * GET /api/actions
 * Get all available action definitions
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const actions = await actionsEngine.getActionDefinitions(category || null);

    res.json({
      success: true,
      actions,
      count: actions.length,
      filter: category || 'all'
    });

  } catch (error) {
    console.error('[Actions API] Get actions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/actions/execute
 * Execute an action (requires auth)
 */
router.post('/execute', requireAuth, async (req, res) => {
  try {
    const {
      actionCode,
      actionData = {},
      domainId = null
    } = req.body;

    if (!actionCode) {
      return res.status(400).json({
        error: 'actionCode is required'
      });
    }

    const result = await actionsEngine.executeAction(
      req.user.userId,
      actionCode,
      actionData,
      domainId,
      req.user.sessionId,
      req
    );

    res.json({
      success: result.success,
      ...result
    });

  } catch (error) {
    console.error('[Actions API] Execute action error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/check/:actionCode
 * Check if user can perform action (requires auth)
 */
router.get('/check/:actionCode', requireAuth, async (req, res) => {
  try {
    const { actionCode } = req.params;
    const availability = await actionsEngine.checkActionAvailability(
      req.user.userId,
      actionCode
    );

    res.json({
      success: true,
      actionCode,
      ...availability
    });

  } catch (error) {
    console.error('[Actions API] Check availability error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/history
 * Get user's action history (requires auth)
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { limit = 50, actionCode } = req.query;

    const history = await actionsEngine.getUserActionHistory(
      req.user.userId,
      parseInt(limit),
      actionCode || null
    );

    res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    console.error('[Actions API] Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/stats
 * Get user's action statistics (requires auth)
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await actionsEngine.getUserActionStats(req.user.userId);

    res.json({
      success: true,
      userId: req.user.userId,
      stats
    });

  } catch (error) {
    console.error('[Actions API] Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/activity
 * Get recent activity feed (public)
 */
router.get('/activity', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const activity = await actionsEngine.getRecentActivity(parseInt(limit));

    res.json({
      success: true,
      activity,
      count: activity.length
    });

  } catch (error) {
    console.error('[Actions API] Get activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/leaderboard
 * Get action leaderboard (most-used actions)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await actionsEngine.getActionLeaderboard();

    res.json({
      success: true,
      leaderboard,
      count: leaderboard.length
    });

  } catch (error) {
    console.error('[Actions API] Get leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/actions/log/:logId/effects
 * Get effects triggered by a specific action
 */
router.get('/log/:logId/effects', async (req, res) => {
  try {
    const { logId } = req.params;

    const effects = await actionsEngine.getActionEffects(logId);

    res.json({
      success: true,
      logId,
      effects,
      count: effects.length
    });

  } catch (error) {
    console.error('[Actions API] Get effects error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Convenience endpoints for common actions
 */

/**
 * POST /api/actions/vote
 * Vote on a domain (requires auth)
 */
router.post('/vote', requireAuth, async (req, res) => {
  try {
    const { domainId, voteType } = req.body;

    if (!domainId || !voteType) {
      return res.status(400).json({
        error: 'domainId and voteType are required'
      });
    }

    if (!['like', 'dislike'].includes(voteType)) {
      return res.status(400).json({
        error: 'voteType must be "like" or "dislike"'
      });
    }

    const result = await actionsEngine.voteDomain(
      req.user.userId,
      domainId,
      voteType,
      req.user.sessionId,
      req
    );

    res.json({
      success: result.success,
      ...result
    });

  } catch (error) {
    console.error('[Actions API] Vote error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/actions/feedback
 * Submit domain feedback (requires auth)
 */
router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const { domainId, feedback } = req.body;

    if (!domainId || !feedback) {
      return res.status(400).json({
        error: 'domainId and feedback are required'
      });
    }

    const result = await actionsEngine.submitFeedback(
      req.user.userId,
      domainId,
      feedback,
      req.user.sessionId,
      req
    );

    res.json({
      success: result.success,
      ...result
    });

  } catch (error) {
    console.error('[Actions API] Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/actions/report-bug
 * Report security bug (requires auth)
 */
router.post('/report-bug', requireAuth, async (req, res) => {
  try {
    const { severity, description } = req.body;

    if (!severity || !description) {
      return res.status(400).json({
        error: 'severity and description are required'
      });
    }

    if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({
        error: 'severity must be low, medium, high, or critical'
      });
    }

    const result = await actionsEngine.reportBug(
      req.user.userId,
      severity,
      description,
      req.user.sessionId,
      req
    );

    res.json({
      success: result.success,
      ...result
    });

  } catch (error) {
    console.error('[Actions API] Report bug error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/actions/create-post
 * Create social post (requires auth)
 */
router.post('/create-post', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        error: 'content is required'
      });
    }

    const result = await actionsEngine.createPost(
      req.user.userId,
      content,
      req.user.sessionId,
      req
    );

    res.json({
      success: result.success,
      ...result
    });

  } catch (error) {
    console.error('[Actions API] Create post error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };
