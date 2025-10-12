/**
 * Skills Engine
 *
 * RuneScape-style skill progression system
 * Award XP, track levels, unlock achievements
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
 * Award XP to user for a specific skill
 *
 * @param {string} userId - User UUID
 * @param {string} skillName - Skill name (e.g., 'Voting', 'Development')
 * @param {number} baseXp - Base XP to award (before multipliers)
 * @param {string} actionName - Optional action name for logging
 * @param {string} source - Optional source identifier
 * @returns {Promise<Object>} Result with XP gained, level changes, achievement unlocks
 */
async function awardXP(userId, skillName, baseXp, actionName = null, source = 'manual') {
  try {
    // Get skill ID
    const skillResult = await db.query(
      'SELECT skill_id FROM skills WHERE skill_name = $1',
      [skillName]
    );

    if (skillResult.rows.length === 0) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const skillId = skillResult.rows[0].skill_id;

    // Get action ID if provided
    let actionId = null;
    if (actionName) {
      const actionResult = await db.query(
        'SELECT action_id FROM skill_actions WHERE action_name = $1',
        [actionName]
      );
      if (actionResult.rows.length > 0) {
        actionId = actionResult.rows[0].action_id;
      }
    }

    // Award XP using database function
    const result = await db.query(
      'SELECT * FROM award_xp($1, $2, $3, $4, $5)',
      [userId, skillId, baseXp, actionId, source]
    );

    const xpResult = result.rows[0];

    // Check for newly unlocked achievements
    const newAchievements = await getNewlyUnlockedAchievements(userId);

    return {
      success: true,
      xpGained: xpResult.xp_gained,
      totalXp: xpResult.total_xp,
      levelBefore: xpResult.level_before,
      levelAfter: xpResult.level_after,
      leveledUp: xpResult.leveled_up,
      skillName,
      newAchievements
    };

  } catch (error) {
    console.error('[Skills Engine] Award XP error:', error);
    throw error;
  }
}

/**
 * Award XP for a specific action by name
 *
 * @param {string} userId - User UUID
 * @param {string} actionName - Action name (e.g., 'vote_like', 'submit_long_feedback')
 * @returns {Promise<Object>} Result with XP gained and level changes
 */
async function awardXPForAction(userId, actionName) {
  try {
    // Get action details
    const actionResult = await db.query(`
      SELECT
        sa.action_id,
        sa.action_name,
        sa.base_xp,
        s.skill_id,
        s.skill_name
      FROM skill_actions sa
      JOIN skills s ON sa.skill_id = s.skill_id
      WHERE sa.action_name = $1
    `, [actionName]);

    if (actionResult.rows.length === 0) {
      throw new Error(`Action not found: ${actionName}`);
    }

    const action = actionResult.rows[0];

    return await awardXP(
      userId,
      action.skill_name,
      action.base_xp,
      actionName,
      actionName
    );

  } catch (error) {
    console.error('[Skills Engine] Award XP for action error:', error);
    throw error;
  }
}

/**
 * Get user's skill progress
 *
 * @param {string} userId - User UUID
 * @param {string} skillName - Optional skill name (null = all skills)
 * @returns {Promise<Array>} User's skill progress
 */
async function getUserSkillProgress(userId, skillName = null) {
  try {
    let query;
    let params;

    if (skillName) {
      query = `
        SELECT * FROM user_skill_summary
        WHERE user_id = $1 AND skill_name = $2
      `;
      params = [userId, skillName];
    } else {
      query = `
        SELECT * FROM user_skill_summary
        WHERE user_id = $1
        ORDER BY current_level DESC
      `;
      params = [userId];
    }

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get user skill progress error:', error);
    return [];
  }
}

/**
 * Get skill leaderboard
 *
 * @param {string} skillName - Skill name
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Leaderboard entries
 */
async function getSkillLeaderboard(skillName, limit = 50) {
  try {
    const result = await db.query(`
      SELECT * FROM skill_leaderboard
      WHERE skill_name = $1
      ORDER BY rank
      LIMIT $2
    `, [skillName, limit]);

    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get skill leaderboard error:', error);
    return [];
  }
}

/**
 * Get total level leaderboard
 *
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Leaderboard entries
 */
async function getTotalLevelLeaderboard(limit = 50) {
  try {
    const result = await db.query(`
      SELECT * FROM user_total_level
      ORDER BY total_level DESC
      LIMIT $1
    `, [limit]);

    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get total level leaderboard error:', error);
    return [];
  }
}

/**
 * Get recent XP gains (activity feed)
 *
 * @param {string} userId - Optional user UUID (null = all users)
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Recent XP gains
 */
async function getRecentXPGains(userId = null, limit = 50) {
  try {
    let query;
    let params;

    if (userId) {
      query = `
        SELECT * FROM recent_xp_gains
        WHERE username = (SELECT username FROM users WHERE user_id = $1)
        LIMIT $2
      `;
      params = [userId, limit];
    } else {
      query = `SELECT * FROM recent_xp_gains LIMIT $1`;
      params = [limit];
    }

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get recent XP gains error:', error);
    return [];
  }
}

/**
 * Get newly unlocked achievements for user
 *
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Newly unlocked achievements (unclaimed)
 */
async function getNewlyUnlockedAchievements(userId) {
  try {
    const result = await db.query(`
      SELECT
        a.achievement_id,
        a.achievement_name,
        a.achievement_description,
        a.achievement_icon,
        a.rarity,
        a.points,
        a.reward_type,
        a.reward_value,
        ua.earned_at
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.achievement_id
      WHERE ua.user_id = $1
        AND ua.claimed = FALSE
      ORDER BY ua.earned_at DESC
    `, [userId]);

    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get newly unlocked achievements error:', error);
    return [];
  }
}

/**
 * Get all user achievements
 *
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} User achievement data
 */
async function getUserAchievements(userId) {
  try {
    // Get summary
    const summaryResult = await db.query(`
      SELECT * FROM user_achievement_summary
      WHERE user_id = $1
    `, [userId]);

    const summary = summaryResult.rows[0] || {
      total_achievements: 0,
      achievement_points: 0,
      unclaimed_achievements: 0,
      legendary_count: 0,
      epic_count: 0,
      rare_count: 0
    };

    // Get earned achievements
    const achievementsResult = await db.query(`
      SELECT
        a.achievement_id,
        a.achievement_name,
        a.achievement_description,
        a.achievement_icon,
        a.category,
        a.rarity,
        a.points,
        a.reward_type,
        a.reward_value,
        ua.earned_at,
        ua.claimed,
        ua.claimed_at
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.achievement_id
      WHERE ua.user_id = $1
      ORDER BY ua.earned_at DESC
    `, [userId]);

    return {
      summary,
      achievements: achievementsResult.rows
    };

  } catch (error) {
    console.error('[Skills Engine] Get user achievements error:', error);
    return {
      summary: {},
      achievements: []
    };
  }
}

/**
 * Claim achievement reward
 *
 * @param {string} userId - User UUID
 * @param {string} achievementId - Achievement UUID
 * @returns {Promise<Object>} Claim result
 */
async function claimAchievementReward(userId, achievementId) {
  try {
    const result = await db.query(
      'SELECT claim_achievement_reward($1, $2) as claimed',
      [userId, achievementId]
    );

    if (!result.rows[0].claimed) {
      return {
        success: false,
        message: 'Achievement not found or already claimed'
      };
    }

    // Get achievement details
    const achievementResult = await db.query(`
      SELECT
        a.achievement_name,
        a.reward_type,
        a.reward_value,
        a.points
      FROM achievements a
      WHERE a.achievement_id = $1
    `, [achievementId]);

    const achievement = achievementResult.rows[0];

    // TODO: Process actual reward (USDC payment, XP boost, etc.)

    return {
      success: true,
      achievement: achievement,
      message: `Claimed ${achievement.achievement_name}!`
    };

  } catch (error) {
    console.error('[Skills Engine] Claim achievement reward error:', error);
    throw error;
  }
}

/**
 * Create XP multiplier event
 *
 * @param {string} name - Event name
 * @param {number} multiplier - XP multiplier (e.g., 2.0 for double XP)
 * @param {Date} startTime - Event start time
 * @param {Date} endTime - Event end time
 * @param {string} skillName - Optional skill name (null = all skills)
 * @param {string} description - Event description
 * @returns {Promise<string>} Multiplier ID
 */
async function createXPMultiplierEvent(name, multiplier, startTime, endTime, skillName = null, description = '') {
  try {
    let skillId = null;

    if (skillName) {
      const skillResult = await db.query(
        'SELECT skill_id FROM skills WHERE skill_name = $1',
        [skillName]
      );
      if (skillResult.rows.length > 0) {
        skillId = skillResult.rows[0].skill_id;
      }
    }

    const result = await db.query(`
      INSERT INTO xp_multipliers (
        multiplier_name,
        multiplier_value,
        skill_id,
        start_time,
        end_time,
        description,
        active
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING multiplier_id
    `, [name, multiplier, skillId, startTime, endTime, description]);

    return result.rows[0].multiplier_id;

  } catch (error) {
    console.error('[Skills Engine] Create XP multiplier event error:', error);
    throw error;
  }
}

/**
 * Get active XP multipliers
 *
 * @returns {Promise<Array>} Active multiplier events
 */
async function getActiveXPMultipliers() {
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

    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get active XP multipliers error:', error);
    return [];
  }
}

/**
 * Get all available skills
 *
 * @returns {Promise<Array>} Skills
 */
async function getAllSkills() {
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

    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get all skills error:', error);
    return [];
  }
}

/**
 * Get skill actions (XP-earning activities)
 *
 * @param {string} skillName - Optional skill name filter
 * @returns {Promise<Array>} Skill actions
 */
async function getSkillActions(skillName = null) {
  try {
    let query;
    let params;

    if (skillName) {
      query = `
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
        WHERE s.skill_name = $1
        ORDER BY sa.base_xp DESC
      `;
      params = [skillName];
    } else {
      query = `
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
        ORDER BY s.skill_name, sa.base_xp DESC
      `;
      params = [];
    }

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Skills Engine] Get skill actions error:', error);
    return [];
  }
}

/**
 * Check if user is on cooldown for an action
 *
 * @param {string} userId - User UUID
 * @param {string} actionName - Action name
 * @returns {Promise<Object>} Cooldown status
 */
async function checkActionCooldown(userId, actionName) {
  try {
    // Get action cooldown
    const actionResult = await db.query(`
      SELECT
        sa.action_id,
        sa.cooldown_seconds,
        sa.action_name
      FROM skill_actions sa
      WHERE sa.action_name = $1
    `, [actionName]);

    if (actionResult.rows.length === 0) {
      throw new Error(`Action not found: ${actionName}`);
    }

    const action = actionResult.rows[0];

    if (action.cooldown_seconds === 0) {
      return {
        onCooldown: false,
        remainingSeconds: 0
      };
    }

    // Check last time user performed this action
    const lastActionResult = await db.query(`
      SELECT created_at
      FROM xp_gain_log
      WHERE user_id = $1
        AND action_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, action.action_id]);

    if (lastActionResult.rows.length === 0) {
      return {
        onCooldown: false,
        remainingSeconds: 0
      };
    }

    const lastAction = lastActionResult.rows[0];
    const secondsSinceLastAction = Math.floor(
      (Date.now() - new Date(lastAction.created_at).getTime()) / 1000
    );

    const remainingSeconds = Math.max(0, action.cooldown_seconds - secondsSinceLastAction);

    return {
      onCooldown: remainingSeconds > 0,
      remainingSeconds,
      lastActionAt: lastAction.created_at
    };

  } catch (error) {
    console.error('[Skills Engine] Check action cooldown error:', error);
    throw error;
  }
}

/**
 * Initialize user skills (create entries for all skills at level 1)
 *
 * @param {string} userId - User UUID
 * @returns {Promise<void>}
 */
async function initializeUserSkills(userId) {
  try {
    await db.query(`
      INSERT INTO user_skills (user_id, skill_id, current_level, current_xp)
      SELECT $1, skill_id, 1, 0
      FROM skills
      ON CONFLICT (user_id, skill_id) DO NOTHING
    `, [userId]);

  } catch (error) {
    console.error('[Skills Engine] Initialize user skills error:', error);
    throw error;
  }
}

module.exports = {
  initEngine,
  awardXP,
  awardXPForAction,
  getUserSkillProgress,
  getSkillLeaderboard,
  getTotalLevelLeaderboard,
  getRecentXPGains,
  getNewlyUnlockedAchievements,
  getUserAchievements,
  claimAchievementReward,
  createXPMultiplierEvent,
  getActiveXPMultipliers,
  getAllSkills,
  getSkillActions,
  checkActionCooldown,
  initializeUserSkills
};
