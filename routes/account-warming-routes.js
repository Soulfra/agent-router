/**
 * Account Warming Routes
 *
 * TikTok-style account warming system:
 * - Start/manage warmup campaigns
 * - Track progress through phases
 * - Get recommended warmup tasks
 * - Monitor authenticity scores
 */

const express = require('express');
const router = express.Router();

const {
  requireAuth
} = require('../middleware/sso-auth');

// Dependencies (injected via initRoutes)
let db = null;
let accountWarmer = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, accountWarmerInstance) {
  db = database;
  accountWarmer = accountWarmerInstance;
  return router;
}

/**
 * POST /api/warmup/start
 * Start a new account warming campaign
 *
 * Body: {
 *   deviceId: string,
 *   targetPhase: string (optional, default: 'contributor'),
 *   dailyTaskGoal: number (optional, default: 5),
 *   notes: string (optional)
 * }
 */
router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceId, targetPhase, dailyTaskGoal, notes } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        error: 'deviceId is required'
      });
    }

    const campaign = await accountWarmer.startWarmupCampaign(userId, deviceId, {
      targetPhase,
      dailyTaskGoal,
      notes
    });

    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error starting campaign:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to start warmup campaign'
    });
  }
});

/**
 * GET /api/warmup/status
 * Get current warmup status for authenticated user
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const status = await accountWarmer.getWarmupStatus(userId);

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error getting status:', error.message);
    res.status(500).json({
      error: 'Failed to get warmup status'
    });
  }
});

/**
 * POST /api/warmup/check-advancement
 * Check if user is ready to advance to next phase (and advance if ready)
 */
router.post('/check-advancement', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await accountWarmer.checkAndAdvancePhase(userId);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error checking advancement:', error.message);
    res.status(500).json({
      error: 'Failed to check advancement'
    });
  }
});

/**
 * GET /api/warmup/recommended-tasks
 * Get training tasks recommended for current warmup phase
 *
 * Query params:
 *   limit: Max tasks (default: 5)
 */
router.get('/recommended-tasks', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;

    const tasks = await accountWarmer.getRecommendedWarmupTasks(userId, limit);

    res.json({
      success: true,
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error getting recommended tasks:', error.message);
    res.status(500).json({
      error: 'Failed to get recommended tasks'
    });
  }
});

/**
 * POST /api/warmup/log-activity
 * Log a warmup activity (for authenticity tracking)
 *
 * Body: {
 *   activityType: string (e.g., 'view_content', 'vote', 'chat'),
 *   metadata: object (optional activity-specific data)
 * }
 */
router.post('/log-activity', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { activityType, metadata } = req.body;

    if (!activityType) {
      return res.status(400).json({
        error: 'activityType is required'
      });
    }

    const success = await accountWarmer.logWarmupActivity(userId, activityType, metadata);

    res.json({
      success,
      message: success ? 'Activity logged' : 'No active campaign'
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error logging activity:', error.message);
    res.status(500).json({
      error: 'Failed to log activity'
    });
  }
});

/**
 * GET /api/warmup/phases
 * Get all warmup phase definitions
 */
router.get('/phases', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        phase_name, display_name, description, duration_days,
        min_sessions, min_actions, min_time_spent_seconds,
        min_tasks_completed, min_avg_quality, min_streak,
        allowed_activities, allowed_task_types,
        icon, color, order_index
       FROM account_warmup_phases
       ORDER BY order_index`
    );

    const phases = result.rows.map(row => ({
      phaseName: row.phase_name,
      displayName: row.display_name,
      description: row.description,
      durationDays: row.duration_days,
      requirements: {
        minSessions: row.min_sessions,
        minActions: row.min_actions,
        minTimeSpent: row.min_time_spent_seconds,
        minTasksCompleted: row.min_tasks_completed,
        minAvgQuality: row.min_avg_quality,
        minStreak: row.min_streak
      },
      allowedActivities: row.allowed_activities,
      allowedTaskTypes: row.allowed_task_types,
      icon: row.icon,
      color: row.color
    }));

    res.json({
      success: true,
      phases
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error getting phases:', error.message);
    res.status(500).json({
      error: 'Failed to get phases'
    });
  }
});

/**
 * GET /api/warmup/authenticity
 * Get authenticity score for authenticated user
 */
router.get('/authenticity', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT
        authenticity_score,
        session_regularity_score,
        activity_diversity_score,
        quality_consistency_score,
        timing_realism_score,
        is_suspicious,
        suspicious_reasons,
        last_calculated_at
       FROM account_warmup_authenticity
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Calculate it first time
      await db.query('SELECT calculate_account_authenticity($1)', [userId]);

      const recalc = await db.query(
        `SELECT * FROM account_warmup_authenticity WHERE user_id = $1`,
        [userId]
      );

      if (recalc.rows.length === 0) {
        return res.json({
          success: true,
          authenticity: {
            score: 0.5,
            factors: {},
            message: 'Not enough activity to calculate authenticity'
          }
        });
      }

      result.rows[0] = recalc.rows[0];
    }

    const row = result.rows[0];

    res.json({
      success: true,
      authenticity: {
        score: parseFloat(row.authenticity_score),
        factors: {
          sessionRegularity: parseFloat(row.session_regularity_score),
          activityDiversity: parseFloat(row.activity_diversity_score),
          qualityConsistency: parseFloat(row.quality_consistency_score),
          timingRealism: parseFloat(row.timing_realism_score)
        },
        isSuspicious: row.is_suspicious,
        suspiciousReasons: row.suspicious_reasons,
        lastCalculated: row.last_calculated_at
      }
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error getting authenticity:', error.message);
    res.status(500).json({
      error: 'Failed to get authenticity score'
    });
  }
});

/**
 * GET /api/warmup/history
 * Get warmup progress history for authenticated user
 *
 * Query params:
 *   limit: Max events (default: 50)
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    const result = await db.query(
      `SELECT
        event_type, from_phase, to_phase, metrics, created_at
       FROM account_warmup_progress_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const history = result.rows.map(row => ({
      eventType: row.event_type,
      fromPhase: row.from_phase,
      toPhase: row.to_phase,
      metrics: row.metrics,
      timestamp: row.created_at
    }));

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('[WarmupRoutes] Error getting history:', error.message);
    res.status(500).json({
      error: 'Failed to get progress history'
    });
  }
});

module.exports = { initRoutes };
