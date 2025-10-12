/**
 * Actions Engine
 *
 * Connect user behaviors to rewards (XP, payments, achievements)
 * Execute actions and trigger configured effects
 * Handle rate limiting and cooldowns
 */

// Database connection (injected via initEngine)
let db = null;

/**
 * Initialize engine with database connection
 */
function initEngine(database) {
  db = database;
}

/**
 * Execute user action and trigger all effects
 *
 * @param {string} userId - User UUID
 * @param {string} actionCode - Action code (e.g., 'vote_like', 'submit_code')
 * @param {Object} actionData - Action-specific data
 * @param {string} domainId - Optional domain UUID
 * @param {string} sessionId - Optional session UUID
 * @param {Object} req - Optional Express request object for IP/user-agent
 * @returns {Promise<Object>} Result with effects triggered
 */
async function executeAction(userId, actionCode, actionData = {}, domainId = null, sessionId = null, req = null) {
  try {
    // Check if action is available (rate limiting, cooldowns, schedules)
    const availability = await checkActionAvailability(userId, actionCode);

    if (!availability.available) {
      // Log rate violation if applicable
      if (availability.schedule_id) {
        await logRateViolation(userId, actionCode, 'outside_schedule', {
          schedule_id: availability.schedule_id,
          attempted_at: new Date().toISOString()
        });
      }

      return {
        success: false,
        error: availability.reason,
        cooldownRemaining: availability.cooldown_remaining,
        dailyUsesRemaining: availability.daily_uses_remaining,
        scheduleId: availability.schedule_id,
        nextOpen: availability.next_open
      };
    }

    // Extract IP and user agent from request if available
    const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    // Execute action via database function
    const result = await db.query(
      'SELECT * FROM execute_action($1, $2, $3, $4, $5, $6, $7)',
      [
        userId,
        actionCode,
        JSON.stringify(actionData),
        domainId,
        sessionId,
        ipAddress,
        userAgent
      ]
    );

    const actionResult = result.rows[0];

    if (!actionResult.success) {
      return {
        success: false,
        error: actionResult.error_message
      };
    }

    return {
      success: true,
      logId: actionResult.log_id,
      effectsTriggered: actionResult.effects_triggered,
      results: actionResult.results
    };

  } catch (error) {
    console.error('[Actions Engine] Execute action error:', error);
    throw error;
  }
}

/**
 * Check if user can perform action
 *
 * @param {string} userId - User UUID
 * @param {string} actionCode - Action code
 * @returns {Promise<Object>} Availability status
 */
async function checkActionAvailability(userId, actionCode) {
  try {
    // Check basic availability (cooldowns, rate limits)
    const result = await db.query(
      'SELECT * FROM check_action_availability($1, $2)',
      [userId, actionCode]
    );

    const availability = result.rows[0] || {
      available: false,
      reason: 'Unknown error',
      cooldown_remaining: 0,
      daily_uses_remaining: 0
    };

    // If basic check failed, return immediately
    if (!availability.available) {
      return availability;
    }

    // Check schedule restrictions (NYSE hours, etc.)
    const scheduleCheck = await checkActionSchedule(userId, actionCode);

    if (!scheduleCheck.available) {
      return {
        available: false,
        reason: scheduleCheck.reason,
        schedule_id: scheduleCheck.schedule_id,
        next_open: scheduleCheck.next_open,
        cooldown_remaining: 0,
        daily_uses_remaining: availability.daily_uses_remaining
      };
    }

    // All checks passed
    return availability;

  } catch (error) {
    console.error('[Actions Engine] Check availability error:', error);
    return {
      available: false,
      reason: 'System error',
      cooldown_remaining: 0,
      daily_uses_remaining: 0
    };
  }
}

/**
 * Check if action is available according to its schedule (NYSE hours, etc.)
 *
 * @param {string} userId - User UUID
 * @param {string} actionCode - Action code
 * @returns {Promise<Object>} Schedule availability status
 */
async function checkActionSchedule(userId, actionCode) {
  try {
    const result = await db.query(
      'SELECT * FROM check_action_schedule($1, $2, NOW())',
      [actionCode, userId]
    );

    return result.rows[0] || {
      available: true,
      reason: 'No schedule restrictions',
      schedule_id: null,
      next_open: null
    };

  } catch (error) {
    console.error('[Actions Engine] Check schedule error:', error);
    // On error, allow the action (fail open) unless there's a critical issue
    return {
      available: true,
      reason: 'Schedule check unavailable',
      schedule_id: null,
      next_open: null
    };
  }
}

/**
 * Log rate limit violation for tracking abuse
 *
 * @param {string} userId - User UUID
 * @param {string} actionCode - Action code
 * @param {string} violationType - Type of violation
 * @param {Object} details - Additional details
 */
async function logRateViolation(userId, actionCode, violationType, details = {}) {
  try {
    await db.query(
      'SELECT log_rate_violation($1, $2, $3, $4)',
      [userId, actionCode, violationType, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('[Actions Engine] Log rate violation error:', error);
  }
}

/**
 * Get all available action definitions
 *
 * @param {string} category - Optional category filter ('voting', 'development', 'security', etc.)
 * @returns {Promise<Array>} Action definitions
 */
async function getActionDefinitions(category = null) {
  try {
    let query = 'SELECT * FROM action_definitions WHERE enabled = TRUE';
    let params = [];

    if (category) {
      query += ' AND action_category = $1';
      params.push(category);
    }

    query += ' ORDER BY action_category, action_name';

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Actions Engine] Get action definitions error:', error);
    return [];
  }
}

/**
 * Get user's action history
 *
 * @param {string} userId - User UUID
 * @param {number} limit - Number of entries to return
 * @param {string} actionCode - Optional action code filter
 * @returns {Promise<Array>} Action log entries
 */
async function getUserActionHistory(userId, limit = 50, actionCode = null) {
  try {
    let query = `
      SELECT
        ual.log_id,
        ual.created_at,
        ad.action_code,
        ad.action_name,
        ad.action_category,
        ad.icon,
        ual.action_data,
        ual.effects_triggered,
        ual.success,
        dp.domain_name
      FROM user_action_log ual
      JOIN action_definitions ad ON ual.action_def_id = ad.action_def_id
      LEFT JOIN domain_portfolio dp ON ual.domain_id = dp.domain_id
      WHERE ual.user_id = $1
    `;

    let params = [userId];

    if (actionCode) {
      query += ' AND ad.action_code = $2';
      params.push(actionCode);
    }

    query += ' ORDER BY ual.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Actions Engine] Get user action history error:', error);
    return [];
  }
}

/**
 * Get action statistics for user
 *
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} Action statistics
 */
async function getUserActionStats(userId) {
  try {
    const result = await db.query(
      'SELECT * FROM user_action_summary WHERE user_id = $1',
      [userId]
    );

    return result.rows[0] || {
      unique_actions: 0,
      total_actions: 0,
      successful_actions: 0,
      total_effects_triggered: 0
    };

  } catch (error) {
    console.error('[Actions Engine] Get user action stats error:', error);
    return {
      unique_actions: 0,
      total_actions: 0,
      successful_actions: 0,
      total_effects_triggered: 0
    };
  }
}

/**
 * Get recent activity feed
 *
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Recent activity
 */
async function getRecentActivity(limit = 100) {
  try {
    const result = await db.query(
      'SELECT * FROM recent_activity_feed LIMIT $1',
      [limit]
    );

    return result.rows;

  } catch (error) {
    console.error('[Actions Engine] Get recent activity error:', error);
    return [];
  }
}

/**
 * Get action leaderboard
 *
 * @returns {Promise<Array>} Most-used actions
 */
async function getActionLeaderboard() {
  try {
    const result = await db.query('SELECT * FROM action_leaderboard');
    return result.rows;

  } catch (error) {
    console.error('[Actions Engine] Get action leaderboard error:', error);
    return [];
  }
}

/**
 * Get effects triggered by an action
 *
 * @param {string} logId - Action log ID
 * @returns {Promise<Array>} Effect execution logs
 */
async function getActionEffects(logId) {
  try {
    const result = await db.query(`
      SELECT
        eel.execution_id,
        eel.created_at,
        ed.effect_code,
        ed.effect_name,
        ed.effect_type,
        eel.effect_params,
        eel.result,
        eel.success,
        eel.error_message
      FROM effect_execution_log eel
      JOIN effect_definitions ed ON eel.effect_def_id = ed.effect_def_id
      WHERE eel.log_id = $1
      ORDER BY eel.created_at
    `, [logId]);

    return result.rows;

  } catch (error) {
    console.error('[Actions Engine] Get action effects error:', error);
    return [];
  }
}

/**
 * Convenience methods for common actions
 */

/**
 * Vote on domain (like or dislike)
 */
async function voteDomain(userId, domainId, voteType, sessionId = null, req = null) {
  const actionCode = voteType === 'like' ? 'vote_like' : 'vote_dislike';
  return await executeAction(
    userId,
    actionCode,
    { domainId, voteType },
    domainId,
    sessionId,
    req
  );
}

/**
 * Submit domain feedback
 */
async function submitFeedback(userId, domainId, feedback, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'submit_feedback',
    { domainId, feedback },
    domainId,
    sessionId,
    req
  );
}

/**
 * Submit code implementation
 */
async function submitCode(userId, challengeId, code, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'submit_code',
    { challengeId, code },
    null,
    sessionId,
    req
  );
}

/**
 * Complete coding challenge
 */
async function completeChallenge(userId, challengeId, score, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'complete_challenge',
    { challengeId, score },
    null,
    sessionId,
    req
  );
}

/**
 * Report security bug
 */
async function reportBug(userId, severity, description, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'report_bug',
    { severity, description },
    null,
    sessionId,
    req
  );
}

/**
 * Create social post
 */
async function createPost(userId, content, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'create_post',
    { content },
    null,
    sessionId,
    req
  );
}

/**
 * Complete trade
 */
async function completeTrade(userId, tradeId, amount, sessionId = null, req = null) {
  return await executeAction(
    userId,
    'complete_trade',
    { tradeId, amount },
    null,
    sessionId,
    req
  );
}

module.exports = {
  initEngine,
  executeAction,
  checkActionAvailability,
  checkActionSchedule,
  logRateViolation,
  getActionDefinitions,
  getUserActionHistory,
  getUserActionStats,
  getRecentActivity,
  getActionLeaderboard,
  getActionEffects,

  // Convenience methods
  voteDomain,
  submitFeedback,
  submitCode,
  completeChallenge,
  reportBug,
  createPost,
  completeTrade
};
