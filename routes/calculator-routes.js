/**
 * Calculator API Routes
 *
 * API endpoints for XP calculators, skill planners, and efficiency tools
 * OSRS-style calculator backend for CalOS skills system
 */

const express = require('express');
const router = express.Router();
const xpCalc = require('../lib/xp-calculator');
const { optionalAuth } = require('../middleware/sso-auth');

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  return router;
}

/**
 * GET /api/calculators/xp-for-level/:level
 * Get XP required for a specific level
 */
router.get('/xp-for-level/:level', (req, res) => {
  try {
    const level = parseInt(req.params.level);

    if (isNaN(level) || level < 1 || level > 99) {
      return res.status(400).json({
        error: 'Level must be between 1 and 99'
      });
    }

    const xpRequired = xpCalc.calculateXPForLevel(level);

    res.json({
      success: true,
      level,
      xpRequired,
      formattedXP: xpCalc.formatNumber(xpRequired)
    });

  } catch (error) {
    console.error('[Calculator API] XP for level error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/level-from-xp/:xp
 * Get level from total XP
 */
router.get('/level-from-xp/:xp', (req, res) => {
  try {
    const xp = parseInt(req.params.xp);

    if (isNaN(xp) || xp < 0) {
      return res.status(400).json({
        error: 'XP must be a positive number'
      });
    }

    const level = xpCalc.calculateLevelFromXP(xp);
    const progress = xpCalc.calculateLevelProgress(xp);

    res.json({
      success: true,
      xp,
      level,
      progress
    });

  } catch (error) {
    console.error('[Calculator API] Level from XP error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/calculators/xp-needed
 * Calculate XP needed from current to target level
 */
router.post('/xp-needed', (req, res) => {
  try {
    const { currentLevel, targetLevel, currentXP } = req.body;

    let current = currentLevel;
    if (currentXP !== undefined) {
      current = xpCalc.calculateLevelFromXP(currentXP);
    }

    if (!current || !targetLevel) {
      return res.status(400).json({
        error: 'currentLevel/currentXP and targetLevel are required'
      });
    }

    const result = xpCalc.calculateXPNeeded(current, targetLevel);

    res.json({
      success: true,
      ...result,
      formattedXPNeeded: xpCalc.formatNumber(result.xpNeeded)
    });

  } catch (error) {
    console.error('[Calculator API] XP needed error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/calculators/training-time
 * Calculate time needed to reach goal
 */
router.post('/training-time', (req, res) => {
  try {
    const { xpNeeded, xpPerHour, currentLevel, targetLevel } = req.body;

    let xp = xpNeeded;
    if (!xp && currentLevel && targetLevel) {
      xp = xpCalc.calculateXPNeeded(currentLevel, targetLevel).xpNeeded;
    }

    if (!xp || !xpPerHour) {
      return res.status(400).json({
        error: 'xpNeeded and xpPerHour are required'
      });
    }

    const time = xpCalc.calculateTrainingTime(xp, xpPerHour);

    res.json({
      success: true,
      xpNeeded: xp,
      xpPerHour,
      ...time
    });

  } catch (error) {
    console.error('[Calculator API] Training time error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/xp-table
 * Generate XP table for level range
 */
router.get('/xp-table', (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const end = parseInt(req.query.end) || 99;

    if (start < 1 || end > 99 || start > end) {
      return res.status(400).json({
        error: 'Invalid level range'
      });
    }

    const table = xpCalc.generateXPTable(start, end);

    res.json({
      success: true,
      startLevel: start,
      endLevel: end,
      table
    });

  } catch (error) {
    console.error('[Calculator API] XP table error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/milestones
 * Get skill milestone levels
 */
router.get('/milestones', (req, res) => {
  try {
    const milestones = xpCalc.getSkillMilestones();

    res.json({
      success: true,
      milestones
    });

  } catch (error) {
    console.error('[Calculator API] Milestones error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/skills
 * Get all skills with metadata
 */
router.get('/skills', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        skill_id,
        skill_name,
        skill_description,
        skill_icon,
        category,
        max_level
      FROM skills
      ORDER BY skill_name
    `);

    res.json({
      success: true,
      skills: result.rows
    });

  } catch (error) {
    console.error('[Calculator API] Get skills error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/skills/:skillName/actions
 * Get all actions for a skill with efficiency calculations
 */
router.get('/skills/:skillName/actions', async (req, res) => {
  try {
    const { skillName } = req.params;

    const result = await db.query(`
      SELECT
        sa.action_id,
        sa.action_name,
        sa.action_description,
        sa.base_xp,
        sa.min_level_required,
        sa.cooldown_seconds,
        s.skill_name
      FROM skill_actions sa
      JOIN skills s ON sa.skill_id = s.skill_id
      WHERE LOWER(s.skill_name) = LOWER($1)
      ORDER BY sa.base_xp DESC
    `, [skillName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Skill not found or has no actions'
      });
    }

    // Calculate efficiency for each action
    const actions = result.rows.map(action => {
      const actionsPerHour = xpCalc.calculateActionsPerHour(action.cooldown_seconds);
      const xpPerHour = xpCalc.calculateXPPerHour(action.base_xp, actionsPerHour);

      return {
        ...action,
        actionsPerHour,
        xpPerHour,
        formattedXPPerHour: xpCalc.formatNumber(xpPerHour)
      };
    });

    // Sort by efficiency
    actions.sort((a, b) => b.xpPerHour - a.xpPerHour);

    res.json({
      success: true,
      skillName: result.rows[0].skill_name,
      actionCount: actions.length,
      actions
    });

  } catch (error) {
    console.error('[Calculator API] Get skill actions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/user-progress
 * Get user's skill progress (requires auth)
 */
router.get('/user-progress', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        success: false,
        message: 'Not authenticated',
        skills: []
      });
    }

    const result = await db.query(`
      SELECT * FROM user_skill_summary
      WHERE user_id = $1
      ORDER BY current_level DESC
    `, [req.user.userId]);

    res.json({
      success: true,
      userId: req.user.userId,
      skills: result.rows
    });

  } catch (error) {
    console.error('[Calculator API] User progress error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/leaderboard/:skillName
 * Get skill leaderboard
 */
router.get('/leaderboard/:skillName', async (req, res) => {
  try {
    const { skillName } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const result = await db.query(`
      SELECT * FROM skill_leaderboard
      WHERE LOWER(skill_name) = LOWER($1)
      ORDER BY rank
      LIMIT $2
    `, [skillName, limit]);

    res.json({
      success: true,
      skillName,
      leaderboard: result.rows
    });

  } catch (error) {
    console.error('[Calculator API] Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/total-level-leaderboard
 * Get total level leaderboard
 */
router.get('/total-level-leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const result = await db.query(`
      SELECT * FROM user_total_level
      ORDER BY total_level DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      leaderboard: result.rows
    });

  } catch (error) {
    console.error('[Calculator API] Total level leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/calculators/compare-actions
 * Compare efficiency of multiple actions
 */
router.post('/compare-actions', (req, res) => {
  try {
    const { actions } = req.body;

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({
        error: 'actions array is required'
      });
    }

    const comparison = xpCalc.compareActionEfficiency(
      actions.map(a => ({
        name: a.name,
        xp: a.xp,
        cooldown: a.cooldown || 0
      }))
    );

    res.json({
      success: true,
      comparison
    });

  } catch (error) {
    console.error('[Calculator API] Compare actions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/calculators/actions-needed
 * Calculate actions needed to reach goal
 */
router.post('/actions-needed', (req, res) => {
  try {
    const { xpNeeded, xpPerAction, multiplier } = req.body;

    if (!xpNeeded || !xpPerAction) {
      return res.status(400).json({
        error: 'xpNeeded and xpPerAction are required'
      });
    }

    const actionsNeeded = xpCalc.calculateActionsNeeded(
      xpNeeded,
      xpPerAction,
      multiplier || 1.0
    );

    res.json({
      success: true,
      xpNeeded,
      xpPerAction,
      multiplier: multiplier || 1.0,
      actionsNeeded
    });

  } catch (error) {
    console.error('[Calculator API] Actions needed error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculators/active-multipliers
 * Get active XP multiplier events
 */
router.get('/active-multipliers', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        xm.multiplier_id,
        xm.multiplier_name,
        xm.multiplier_value,
        s.skill_name,
        xm.start_time,
        xm.end_time,
        xm.description
      FROM xp_multipliers xm
      LEFT JOIN skills s ON xm.skill_id = s.skill_id
      WHERE xm.active = TRUE
        AND NOW() BETWEEN xm.start_time AND xm.end_time
      ORDER BY xm.end_time ASC
    `);

    res.json({
      success: true,
      activeMultipliers: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Calculator API] Active multipliers error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };
