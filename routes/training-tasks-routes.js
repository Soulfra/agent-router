/**
 * Training Tasks Routes
 *
 * Gamified data collection system:
 * - Get available tasks
 * - Claim and submit tasks
 * - Track user statistics and leaderboards
 * - Manage task streaks
 */

const express = require('express');
const router = express.Router();

const {
  requireAuth
} = require('../middleware/sso-auth');

// Dependencies (injected via initRoutes)
let db = null;
let trainingTasks = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, trainingTasksManager) {
  db = database;
  trainingTasks = trainingTasksManager;
  return router;
}

/**
 * GET /api/training/tasks/available
 * Get available training tasks for authenticated user
 *
 * Query params:
 *   taskType: Filter by task type (optional)
 *   skill: Filter by skill (optional)
 *   limit: Max results (default: 10)
 */
router.get('/tasks/available', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.headers['x-device-id']; // Client should send device ID

    if (!deviceId) {
      return res.status(400).json({
        error: 'x-device-id header required'
      });
    }

    const { taskType, skill, limit } = req.query;

    const tasks = await trainingTasks.getAvailableTasks(userId, deviceId, {
      taskType,
      skill,
      limit: limit ? parseInt(limit) : 10
    });

    res.json({
      success: true,
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error getting available tasks:', error.message);
    res.status(500).json({
      error: 'Failed to get available tasks'
    });
  }
});

/**
 * POST /api/training/tasks/:taskId/claim
 * Claim a task (assign to user)
 */
router.post('/tasks/:taskId/claim', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.headers['x-device-id'];
    const { taskId } = req.params;

    if (!deviceId) {
      return res.status(400).json({
        error: 'x-device-id header required'
      });
    }

    const task = await trainingTasks.claimTask(parseInt(taskId), userId, deviceId);

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error claiming task:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to claim task'
    });
  }
});

/**
 * POST /api/training/tasks/:taskId/submit
 * Submit completed task
 *
 * Body: {
 *   submission: { ... task-specific submission data ... }
 * }
 */
router.post('/tasks/:taskId/submit', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.headers['x-device-id'];
    const { taskId } = req.params;
    const { submission } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        error: 'x-device-id header required'
      });
    }

    if (!submission) {
      return res.status(400).json({
        error: 'submission data required'
      });
    }

    const result = await trainingTasks.submitTask(
      parseInt(taskId),
      userId,
      deviceId,
      submission
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error submitting task:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to submit task'
    });
  }
});

/**
 * POST /api/training/tasks/create
 * Create a new task in the pool (admin/system use)
 *
 * Body: {
 *   taskType: string,
 *   taskData: object,
 *   priority: number (optional),
 *   baseXpReward: number (optional),
 *   skill: string (optional),
 *   estimatedTime: number (optional),
 *   expiresAt: timestamp (optional)
 * }
 */
router.post('/tasks/create', requireAuth, async (req, res) => {
  try {
    // TODO: Add admin check middleware
    const taskSpec = req.body;

    const taskId = await trainingTasks.createTask(taskSpec);

    res.json({
      success: true,
      taskId
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error creating task:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to create task'
    });
  }
});

/**
 * GET /api/training/stats
 * Get user's training task statistics
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await trainingTasks.getUserTaskStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error getting stats:', error.message);
    res.status(500).json({
      error: 'Failed to get statistics'
    });
  }
});

/**
 * GET /api/training/leaderboard
 * Get training task leaderboard
 *
 * Query params:
 *   period: daily, weekly, monthly, all_time (default: all_time)
 *   limit: Max results (default: 100)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all_time', limit = 100 } = req.query;

    const result = await db.query(
      `SELECT
        user_id, tasks_completed, total_xp_earned,
        avg_quality_score, rank
       FROM training_task_leaderboard
       WHERE period_type = $1
         AND period_start = CASE
           WHEN $1 = 'daily' THEN CURRENT_DATE
           WHEN $1 = 'weekly' THEN CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER
           WHEN $1 = 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE)::DATE
           ELSE '1970-01-01'::DATE
         END
       ORDER BY rank
       LIMIT $2`,
      [period, limit]
    );

    const leaderboard = result.rows.map(row => ({
      userId: row.user_id,
      tasksCompleted: parseInt(row.tasks_completed),
      totalXp: parseInt(row.total_xp_earned),
      avgQuality: parseFloat(row.avg_quality_score),
      rank: parseInt(row.rank)
    }));

    res.json({
      success: true,
      period,
      leaderboard
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error getting leaderboard:', error.message);
    res.status(500).json({
      error: 'Failed to get leaderboard'
    });
  }
});

/**
 * GET /api/training/task-types
 * Get all available task type definitions
 */
router.get('/task-types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        task_type, display_name, description,
        min_trust_level, cooldown_seconds, base_xp, skill, is_active
       FROM training_task_types
       WHERE is_active = true
       ORDER BY display_name`
    );

    const taskTypes = result.rows.map(row => ({
      taskType: row.task_type,
      displayName: row.display_name,
      description: row.description,
      minTrustLevel: row.min_trust_level,
      cooldownSeconds: row.cooldown_seconds,
      baseXp: row.base_xp,
      skill: row.skill
    }));

    res.json({
      success: true,
      taskTypes
    });
  } catch (error) {
    console.error('[TrainingTasksRoutes] Error getting task types:', error.message);
    res.status(500).json({
      error: 'Failed to get task types'
    });
  }
});

module.exports = { initRoutes };
