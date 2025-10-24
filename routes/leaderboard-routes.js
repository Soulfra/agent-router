/**
 * Leaderboard Routes (Real-time rankings)
 *
 * Live leaderboards showing who's active RIGHT NOW.
 * Like "online players" in a game - constantly evolving rankings.
 *
 * Reads from existing tables:
 * - device_leaderboard (reputation rankings)
 * - feature_usage_analytics (recent activity)
 * - user_credits (top spenders)
 * - model_usage_events (AI power users)
 *
 * Endpoints:
 * - GET /api/leaderboard/live - Currently active users
 * - GET /api/leaderboard/reputation - Top reputation scores
 * - GET /api/leaderboard/usage - Most active users (by feature usage)
 * - GET /api/leaderboard/spending - Top spenders (by credits)
 * - GET /api/leaderboard/ai - AI power users (by model requests)
 * - GET /api/leaderboard/features/:featureName - Top users for specific feature
 * - GET /api/leaderboard/me - My ranking across all boards
 */

const express = require('express');
const router = express.Router();

// Will be injected via initRoutes
let db = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database) {
  db = database;
  return router;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function requireAuth(req, res, next) {
  const userId = req.user?.userId || req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  req.userId = userId;
  next();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse timeWindow parameter
 */
function parseTimeWindow(window) {
  const windows = {
    '5min': 5,
    '15min': 15,
    '1hour': 60,
    '24hour': 1440,
    'week': 10080,
    'alltime': 525600
  };

  const minutes = windows[window] || 60;
  const startDate = new Date(Date.now() - (minutes * 60 * 1000));

  return {
    startDate: startDate.toISOString(),
    label: window || '1hour'
  };
}

/**
 * Add ranking position to results
 */
function addRankings(rows, scoreField = 'score') {
  let currentRank = 1;
  let previousScore = null;
  let usersWithSameScore = 0;

  return rows.map((row, index) => {
    const score = row[scoreField];

    if (previousScore !== null && score < previousScore) {
      currentRank += usersWithSameScore;
      usersWithSameScore = 1;
    } else {
      usersWithSameScore++;
    }

    previousScore = score;

    return {
      ...row,
      rank: currentRank
    };
  });
}

// ============================================================================
// LEADERBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/leaderboard/live
 * Currently active users (who's online NOW)
 *
 * Query params:
 * - window: '5min', '15min', '1hour', '24hour' (default: '15min')
 * - limit: max results (default: 50)
 */
router.get('/live', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { startDate, label } = parseTimeWindow(req.query.window || '15min');

    // Get active users in time window
    const result = await db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        ud.current_badge,
        ud.reputation_score,
        COUNT(DISTINCT fua.feature_name) as features_used,
        COUNT(*) as total_actions,
        MAX(fua.used_at) as last_active,
        SUM(fua.credits_deducted) as credits_spent
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fua.used_at >= $1 AND fua.blocked = FALSE
      GROUP BY u.user_id, u.username, u.email, ud.current_badge, ud.reputation_score
      ORDER BY last_active DESC, total_actions DESC
      LIMIT $2
    `, [startDate, limit]);

    res.json({
      status: 'success',
      data: {
        timeWindow: label,
        onlineCount: result.rows.length,
        users: result.rows.map(row => ({
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputation: parseFloat(row.reputation_score || 0),
          featuresUsed: parseInt(row.features_used),
          totalActions: parseInt(row.total_actions),
          lastActive: row.last_active,
          minutesAgo: Math.round((Date.now() - new Date(row.last_active).getTime()) / 60000),
          creditsSpent: parseInt(row.credits_spent || 0)
        }))
      }
    });

  } catch (error) {
    console.error('[Leaderboard] Live users error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve active users',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/reputation
 * Top users by reputation score
 *
 * Query params:
 * - limit: max results (default: 100)
 */
router.get('/reputation', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    // Use existing device_leaderboard view
    const result = await db.query(`
      SELECT
        dl.user_id,
        u.username,
        u.email,
        dl.current_badge,
        dl.reputation_score,
        dl.trust_score,
        dl.total_votes,
        dl.days_active,
        (SELECT MAX(used_at) FROM feature_usage_analytics WHERE user_id = dl.user_id) as last_active
      FROM device_leaderboard dl
      JOIN users u ON u.user_id = dl.user_id
      ORDER BY dl.reputation_score DESC, dl.total_votes DESC
      LIMIT $1
    `, [limit]);

    // Add rankings
    const ranked = addRankings(result.rows, 'reputation_score');

    res.json({
      status: 'success',
      data: {
        leaderboard: ranked.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputationScore: parseFloat(row.reputation_score || 0),
          trustScore: parseFloat(row.trust_score || 0),
          totalVotes: parseInt(row.total_votes || 0),
          daysActive: parseInt(row.days_active || 0),
          lastActive: row.last_active
        })),
        count: ranked.length
      }
    });

  } catch (error) {
    console.error('[Leaderboard] Reputation error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve reputation leaderboard',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/usage
 * Most active users by feature usage
 *
 * Query params:
 * - window: '24hour', 'week', 'alltime' (default: 'week')
 * - limit: max results (default: 100)
 */
router.get('/usage', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { startDate, label } = parseTimeWindow(req.query.window || 'week');

    const result = await db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        ud.current_badge,
        ud.reputation_score,
        COUNT(*) as total_uses,
        COUNT(DISTINCT fua.feature_name) as unique_features,
        COUNT(DISTINCT DATE(fua.used_at)) as active_days,
        SUM(fua.credits_deducted) as credits_spent,
        MAX(fua.used_at) as last_active
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fua.used_at >= $1 AND fua.blocked = FALSE
      GROUP BY u.user_id, u.username, u.email, ud.current_badge, ud.reputation_score
      ORDER BY total_uses DESC, unique_features DESC
      LIMIT $2
    `, [startDate, limit]);

    const ranked = addRankings(result.rows, 'total_uses');

    res.json({
      status: 'success',
      data: {
        timeWindow: label,
        leaderboard: ranked.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputation: parseFloat(row.reputation_score || 0),
          totalUses: parseInt(row.total_uses),
          uniqueFeatures: parseInt(row.unique_features),
          activeDays: parseInt(row.active_days),
          creditsSpent: parseInt(row.credits_spent || 0),
          lastActive: row.last_active
        })),
        count: ranked.length
      }
    });

  } catch (error) {
    console.error('[Leaderboard] Usage error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve usage leaderboard',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/spending
 * Top spenders by credits used
 *
 * Query params:
 * - window: '24hour', 'week', 'alltime' (default: 'alltime')
 * - limit: max results (default: 100)
 */
router.get('/spending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const window = req.query.window || 'alltime';

    let query = `
      SELECT
        u.user_id,
        u.username,
        u.email,
        ud.current_badge,
        uc.credits_remaining,
        uc.credits_purchased_total,
        uc.credits_used_total,
        ud.reputation_score
    `;

    const params = [limit];

    if (window !== 'alltime') {
      const { startDate } = parseTimeWindow(window);
      query += `,
        (SELECT SUM(credits_deducted)
         FROM feature_usage_analytics
         WHERE user_id = u.user_id AND used_at >= $2) as credits_spent_period
      `;
      params.push(startDate);
    }

    query += `
      FROM users u
      LEFT JOIN user_credits uc ON uc.user_id = u.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE uc.credits_used_total > 0
    `;

    if (window !== 'alltime') {
      query += ` ORDER BY credits_spent_period DESC NULLS LAST`;
    } else {
      query += ` ORDER BY uc.credits_used_total DESC`;
    }

    query += ` LIMIT $1`;

    const result = await db.query(query, params);

    const scoreField = window !== 'alltime' ? 'credits_spent_period' : 'credits_used_total';
    const ranked = addRankings(result.rows, scoreField);

    res.json({
      status: 'success',
      data: {
        timeWindow: window,
        leaderboard: ranked.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputation: parseFloat(row.reputation_score || 0),
          creditsRemaining: parseInt(row.credits_remaining || 0),
          totalPurchased: parseInt(row.credits_purchased_total || 0),
          totalUsed: parseInt(row.credits_used_total || 0),
          periodSpent: window !== 'alltime' ? parseInt(row.credits_spent_period || 0) : null
        })),
        count: ranked.length
      }
    });

  } catch (error) {
    console.error('[Leaderboard] Spending error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve spending leaderboard',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/ai
 * AI power users by model requests
 *
 * Query params:
 * - window: '24hour', 'week', 'alltime' (default: 'week')
 * - limit: max results (default: 100)
 */
router.get('/ai', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { startDate, label } = parseTimeWindow(req.query.window || 'week');

    const result = await db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        ud.current_badge,
        ud.reputation_score,
        COUNT(*) as total_requests,
        COUNT(DISTINCT mue.model_name) as unique_models,
        SUM(mue.total_tokens) as total_tokens,
        SUM(mue.cost_usd) as total_cost,
        AVG(mue.response_time_ms) as avg_response_time,
        MAX(mue.created_at) as last_request
      FROM model_usage_events mue
      JOIN users u ON u.user_id = mue.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE mue.created_at >= $1
      GROUP BY u.user_id, u.username, u.email, ud.current_badge, ud.reputation_score
      ORDER BY total_requests DESC, total_tokens DESC
      LIMIT $2
    `, [startDate, limit]);

    const ranked = addRankings(result.rows, 'total_requests');

    res.json({
      status: 'success',
      data: {
        timeWindow: label,
        leaderboard: ranked.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputation: parseFloat(row.reputation_score || 0),
          totalRequests: parseInt(row.total_requests),
          uniqueModels: parseInt(row.unique_models),
          totalTokens: parseInt(row.total_tokens || 0),
          totalCost: parseFloat(row.total_cost || 0).toFixed(2),
          avgResponseTime: Math.round(row.avg_response_time || 0),
          lastRequest: row.last_request
        })),
        count: ranked.length
      }
    });

  } catch (error) {
    console.error('[Leaderboard] AI leaderboard error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve AI leaderboard',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/features/:featureName
 * Top users for a specific feature
 *
 * Query params:
 * - window: '24hour', 'week', 'alltime' (default: 'week')
 * - limit: max results (default: 100)
 */
router.get('/features/:featureName', async (req, res) => {
  try {
    const { featureName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { startDate, label } = parseTimeWindow(req.query.window || 'week');

    // Verify feature exists
    const featureCheck = await db.query(
      `SELECT display_name FROM feature_definitions WHERE feature_name = $1`,
      [featureName]
    );

    if (featureCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    const result = await db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        ud.current_badge,
        ud.reputation_score,
        COUNT(*) as uses,
        SUM(fua.credits_deducted) as credits_spent,
        COUNT(DISTINCT DATE(fua.used_at)) as active_days,
        MIN(fua.used_at) as first_use,
        MAX(fua.used_at) as latest_use
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fua.feature_name = $1 AND fua.used_at >= $2 AND fua.blocked = FALSE
      GROUP BY u.user_id, u.username, u.email, ud.current_badge, ud.reputation_score
      ORDER BY uses DESC, active_days DESC
      LIMIT $3
    `, [featureName, startDate, limit]);

    const ranked = addRankings(result.rows, 'uses');

    res.json({
      status: 'success',
      data: {
        feature: {
          name: featureName,
          displayName: featureCheck.rows[0].display_name
        },
        timeWindow: label,
        leaderboard: ranked.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: row.username,
          badge: row.current_badge || 'none',
          reputation: parseFloat(row.reputation_score || 0),
          uses: parseInt(row.uses),
          creditsSpent: parseInt(row.credits_spent || 0),
          activeDays: parseInt(row.active_days),
          firstUse: row.first_use,
          latestUse: row.latest_use
        })),
        count: ranked.length
      }
    });

  } catch (error) {
    console.error('[Leaderboard] Feature leaderboard error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve feature leaderboard',
      details: error.message
    });
  }
});

/**
 * GET /api/leaderboard/me
 * My rankings across all leaderboards
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const window = req.query.window || 'week';
    const { startDate, label } = parseTimeWindow(window);

    // Get user info
    const userResult = await db.query(`
      SELECT
        u.username,
        u.email,
        ud.current_badge,
        ud.reputation_score,
        ud.trust_score,
        ud.total_votes
      FROM users u
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE u.user_id = $1
      ORDER BY ud.reputation_score DESC NULLS LAST
      LIMIT 1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Reputation rank
    const reputationRank = await db.query(`
      SELECT COUNT(*) + 1 as rank
      FROM device_leaderboard
      WHERE reputation_score > (
        SELECT reputation_score FROM device_leaderboard WHERE user_id = $1 LIMIT 1
      )
    `, [userId]);

    // Usage rank
    const usageRank = await db.query(`
      WITH user_stats AS (
        SELECT user_id, COUNT(*) as uses
        FROM feature_usage_analytics
        WHERE used_at >= $1 AND blocked = FALSE
        GROUP BY user_id
      )
      SELECT COUNT(*) + 1 as rank
      FROM user_stats
      WHERE uses > (SELECT uses FROM user_stats WHERE user_id = $2)
    `, [startDate, userId]);

    // Spending rank
    const spendingRank = await db.query(`
      SELECT COUNT(*) + 1 as rank
      FROM user_credits
      WHERE credits_used_total > (
        SELECT credits_used_total FROM user_credits WHERE user_id = $1
      )
    `, [userId]);

    // AI rank
    const aiRank = await db.query(`
      WITH user_stats AS (
        SELECT user_id, COUNT(*) as requests
        FROM model_usage_events
        WHERE created_at >= $1
        GROUP BY user_id
      )
      SELECT COUNT(*) + 1 as rank
      FROM user_stats
      WHERE requests > (SELECT requests FROM user_stats WHERE user_id = $2)
    `, [startDate, userId]);

    // My stats
    const myStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE fua.used_at >= $2) as uses_period,
        (SELECT credits_used_total FROM user_credits WHERE user_id = $1) as total_credits_used,
        (SELECT COUNT(*) FROM model_usage_events WHERE user_id = $1 AND created_at >= $2) as ai_requests_period
      FROM feature_usage_analytics fua
      WHERE fua.user_id = $1
    `, [userId, startDate]);

    const stats = myStats.rows[0];

    res.json({
      status: 'success',
      data: {
        user: {
          username: user.username,
          badge: user.current_badge || 'none',
          reputation: parseFloat(user.reputation_score || 0),
          trustScore: parseFloat(user.trust_score || 0),
          totalVotes: parseInt(user.total_votes || 0)
        },
        timeWindow: label,
        rankings: {
          reputation: {
            rank: parseInt(reputationRank.rows[0].rank),
            score: parseFloat(user.reputation_score || 0)
          },
          usage: {
            rank: parseInt(usageRank.rows[0].rank),
            uses: parseInt(stats.uses_period || 0)
          },
          spending: {
            rank: parseInt(spendingRank.rows[0].rank),
            creditsUsed: parseInt(stats.total_credits_used || 0)
          },
          ai: {
            rank: parseInt(aiRank.rows[0].rank),
            requests: parseInt(stats.ai_requests_period || 0)
          }
        }
      }
    });

  } catch (error) {
    console.error('[Leaderboard] My rankings error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve user rankings',
      details: error.message
    });
  }
});

module.exports = { initRoutes };
