/**
 * Wrapped Routes (Spotify-style summaries)
 *
 * Generates personalized usage summaries from existing analytics data.
 * Like "Your 2025 in API calls" - reads from existing tables instead of building new infrastructure.
 *
 * Reads from:
 * - feature_usage_analytics (Feature Gate usage)
 * - model_usage_events (AI model usage)
 * - user_credits (spending patterns)
 * - device_leaderboard (reputation/rankings)
 * - template_popularity (app installs)
 *
 * Endpoints:
 * - GET /api/wrapped/me?period=year - User's personalized summary
 * - GET /api/wrapped/me/features - Top features used
 * - GET /api/wrapped/me/models - AI model usage patterns
 * - GET /api/wrapped/me/spending - Credits/spending summary
 * - GET /api/wrapped/me/milestones - Achievement milestones
 * - GET /api/wrapped/platform?period=year - Platform-wide summary (admin)
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

async function requireAdmin(req, res, next) {
  const userId = req.user?.userId || req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  try {
    const result = await db.query(
      `SELECT is_admin FROM users WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({
        status: 'error',
        error: 'Admin access required'
      });
    }

    next();

  } catch (error) {
    console.error('[Wrapped] Admin check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authorization failed'
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse period parameter into date range
 */
function parsePeriod(period) {
  const now = new Date();
  const periods = {
    'day': 1,
    'week': 7,
    'month': 30,
    'quarter': 90,
    'year': 365,
    'alltime': 3650
  };

  const days = periods[period] || 365;
  const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

  return {
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    label: period === 'alltime' ? 'All Time' : period.charAt(0).toUpperCase() + period.slice(1)
  };
}

/**
 * Calculate percentage change
 */
function percentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ============================================================================
// USER WRAPPED ENDPOINTS
// ============================================================================

/**
 * GET /api/wrapped/me
 * Complete personalized summary (Spotify Wrapped style)
 *
 * Query params:
 * - period: 'day', 'week', 'month', 'quarter', 'year', 'alltime' (default: 'year')
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate, label } = parsePeriod(req.query.period || 'year');

    // Get user info
    const userResult = await db.query(
      `SELECT username, email, created_at FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Feature usage stats
    const featureStats = await db.query(`
      SELECT
        COUNT(*) as total_uses,
        COUNT(*) FILTER (WHERE blocked = FALSE) as successful_uses,
        COUNT(DISTINCT feature_name) as unique_features,
        COUNT(DISTINCT DATE(used_at)) as active_days,
        SUM(credits_deducted) as total_credits_used,
        MIN(used_at) as first_use,
        MAX(used_at) as latest_use
      FROM feature_usage_analytics
      WHERE user_id = $1 AND used_at >= $2 AND used_at <= $3
    `, [userId, startDate, endDate]);

    // Top 5 features
    const topFeatures = await db.query(`
      SELECT
        feature_name,
        COUNT(*) as uses,
        SUM(credits_deducted) as credits_used
      FROM feature_usage_analytics
      WHERE user_id = $1 AND used_at >= $2 AND used_at <= $3 AND blocked = FALSE
      GROUP BY feature_name
      ORDER BY uses DESC
      LIMIT 5
    `, [userId, startDate, endDate]);

    // AI model usage
    const modelStats = await db.query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd,
        COUNT(DISTINCT model_name) as unique_models,
        AVG(response_time_ms) as avg_response_time
      FROM model_usage_events
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [userId, startDate, endDate]);

    // Top model
    const topModel = await db.query(`
      SELECT model_name, COUNT(*) as uses
      FROM model_usage_events
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY model_name
      ORDER BY uses DESC
      LIMIT 1
    `, [userId, startDate, endDate]);

    // Credits info
    const creditsInfo = await db.query(`
      SELECT
        credits_remaining,
        credits_purchased_total,
        credits_used_total,
        last_recharge_at
      FROM user_credits
      WHERE user_id = $1
    `, [userId]);

    // Device/reputation info
    const deviceInfo = await db.query(`
      SELECT
        current_badge,
        total_votes,
        trust_score,
        reputation_score,
        days_active
      FROM user_devices
      WHERE user_id = $1
      ORDER BY reputation_score DESC
      LIMIT 1
    `, [userId]);

    // Assemble wrapped summary
    const stats = featureStats.rows[0];
    const modelData = modelStats.rows[0];
    const credits = creditsInfo.rows[0] || {};
    const device = deviceInfo.rows[0] || {};

    const wrapped = {
      status: 'success',
      data: {
        period: {
          label,
          startDate,
          endDate,
          daysInPeriod: Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
        },
        user: {
          username: user.username,
          email: user.email,
          memberSince: user.created_at,
          currentBadge: device.current_badge || 'none',
          reputationScore: parseFloat(device.reputation_score || 0),
          trustScore: parseFloat(device.trust_score || 0)
        },
        highlights: {
          totalUses: parseInt(stats.total_uses || 0),
          successRate: stats.total_uses > 0
            ? Math.round((stats.successful_uses / stats.total_uses) * 100)
            : 0,
          activeDays: parseInt(stats.active_days || 0),
          uniqueFeatures: parseInt(stats.unique_features || 0),
          creditsSpent: parseInt(stats.total_credits_used || 0)
        },
        topFeatures: topFeatures.rows.map(f => ({
          feature: f.feature_name,
          uses: parseInt(f.uses),
          creditsUsed: parseInt(f.credits_used || 0)
        })),
        aiUsage: {
          totalRequests: parseInt(modelData.total_requests || 0),
          totalTokens: parseInt(modelData.total_tokens || 0),
          totalCost: parseFloat(modelData.total_cost_usd || 0).toFixed(2),
          uniqueModels: parseInt(modelData.unique_models || 0),
          favoriteModel: topModel.rows[0]?.model_name || 'none',
          avgResponseTime: Math.round(modelData.avg_response_time || 0)
        },
        credits: {
          remaining: parseInt(credits.credits_remaining || 0),
          totalPurchased: parseInt(credits.credits_purchased_total || 0),
          totalUsed: parseInt(credits.credits_used_total || 0),
          lastRecharge: credits.last_recharge_at
        },
        milestones: []
      }
    };

    // Add milestones
    if (wrapped.data.highlights.totalUses >= 1000) {
      wrapped.data.milestones.push({
        title: 'Power User',
        description: `You made ${wrapped.data.highlights.totalUses.toLocaleString()} feature requests!`
      });
    }

    if (wrapped.data.highlights.activeDays >= 30) {
      wrapped.data.milestones.push({
        title: 'Consistent Creator',
        description: `Active ${wrapped.data.highlights.activeDays} days this ${label.toLowerCase()}`
      });
    }

    if (wrapped.data.aiUsage.totalRequests >= 500) {
      wrapped.data.milestones.push({
        title: 'AI Enthusiast',
        description: `${wrapped.data.aiUsage.totalRequests.toLocaleString()} AI model requests`
      });
    }

    if (device.reputation_score >= 80) {
      wrapped.data.milestones.push({
        title: 'Trusted Member',
        description: `Reputation score: ${device.reputation_score}`
      });
    }

    res.json(wrapped);

  } catch (error) {
    console.error('[Wrapped] Summary error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate wrapped summary',
      details: error.message
    });
  }
});

/**
 * GET /api/wrapped/me/features
 * Detailed feature usage breakdown
 */
router.get('/me/features', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate, label } = parsePeriod(req.query.period || 'year');

    const result = await db.query(`
      SELECT
        fua.feature_name,
        fd.display_name,
        fd.category,
        COUNT(*) as uses,
        COUNT(*) FILTER (WHERE fua.blocked = FALSE) as successful_uses,
        COUNT(*) FILTER (WHERE fua.blocked = TRUE) as blocked_attempts,
        SUM(fua.credits_deducted) as total_credits,
        MIN(fua.used_at) as first_use,
        MAX(fua.used_at) as latest_use,
        COUNT(DISTINCT DATE(fua.used_at)) as active_days
      FROM feature_usage_analytics fua
      LEFT JOIN feature_definitions fd ON fd.feature_name = fua.feature_name
      WHERE fua.user_id = $1 AND fua.used_at >= $2 AND fua.used_at <= $3
      GROUP BY fua.feature_name, fd.display_name, fd.category
      ORDER BY uses DESC
    `, [userId, startDate, endDate]);

    res.json({
      status: 'success',
      data: {
        period: { label, startDate, endDate },
        features: result.rows.map(row => ({
          feature: row.feature_name,
          displayName: row.display_name,
          category: row.category,
          uses: parseInt(row.uses),
          successfulUses: parseInt(row.successful_uses),
          blockedAttempts: parseInt(row.blocked_attempts),
          creditsSpent: parseInt(row.total_credits || 0),
          firstUse: row.first_use,
          latestUse: row.latest_use,
          activeDays: parseInt(row.active_days)
        })),
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Wrapped] Features error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve feature usage',
      details: error.message
    });
  }
});

/**
 * GET /api/wrapped/me/models
 * AI model usage patterns
 */
router.get('/me/models', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate, label } = parsePeriod(req.query.period || 'year');

    const result = await db.query(`
      SELECT
        model_name,
        COUNT(*) as requests,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost,
        AVG(response_time_ms) as avg_response_time,
        MIN(created_at) as first_use,
        MAX(created_at) as latest_use
      FROM model_usage_events
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY model_name
      ORDER BY requests DESC
    `, [userId, startDate, endDate]);

    res.json({
      status: 'success',
      data: {
        period: { label, startDate, endDate },
        models: result.rows.map(row => ({
          model: row.model_name,
          requests: parseInt(row.requests),
          promptTokens: parseInt(row.prompt_tokens || 0),
          completionTokens: parseInt(row.completion_tokens || 0),
          totalTokens: parseInt(row.total_tokens || 0),
          totalCost: parseFloat(row.total_cost || 0).toFixed(4),
          avgResponseTime: Math.round(row.avg_response_time || 0),
          firstUse: row.first_use,
          latestUse: row.latest_use
        })),
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Wrapped] Models error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve model usage',
      details: error.message
    });
  }
});

/**
 * GET /api/wrapped/me/spending
 * Credits and spending summary
 */
router.get('/me/spending', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate, label } = parsePeriod(req.query.period || 'year');

    // Current credits info
    const creditsResult = await db.query(`
      SELECT * FROM user_credits WHERE user_id = $1
    `, [userId]);

    // Spending by feature
    const featureSpending = await db.query(`
      SELECT
        feature_name,
        SUM(credits_deducted) as credits_spent,
        COUNT(*) as uses
      FROM feature_usage_analytics
      WHERE user_id = $1 AND used_at >= $2 AND used_at <= $3
      GROUP BY feature_name
      ORDER BY credits_spent DESC
      LIMIT 10
    `, [userId, startDate, endDate]);

    // Spending by day (for trend chart)
    const dailySpending = await db.query(`
      SELECT
        DATE(used_at) as date,
        SUM(credits_deducted) as credits_spent,
        COUNT(*) as uses
      FROM feature_usage_analytics
      WHERE user_id = $1 AND used_at >= $2 AND used_at <= $3
      GROUP BY DATE(used_at)
      ORDER BY date DESC
      LIMIT 30
    `, [userId, startDate, endDate]);

    // AI cost by model
    const aiCosts = await db.query(`
      SELECT
        model_name,
        SUM(cost_usd) as total_cost,
        COUNT(*) as requests
      FROM model_usage_events
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY model_name
      ORDER BY total_cost DESC
    `, [userId, startDate, endDate]);

    const credits = creditsResult.rows[0] || {};

    res.json({
      status: 'success',
      data: {
        period: { label, startDate, endDate },
        currentBalance: {
          creditsRemaining: parseInt(credits.credits_remaining || 0),
          totalPurchased: parseInt(credits.credits_purchased_total || 0),
          totalUsed: parseInt(credits.credits_used_total || 0),
          lastRecharge: credits.last_recharge_at
        },
        periodSpending: {
          byFeature: featureSpending.rows.map(row => ({
            feature: row.feature_name,
            creditsSpent: parseInt(row.credits_spent || 0),
            uses: parseInt(row.uses)
          })),
          byDay: dailySpending.rows.map(row => ({
            date: row.date,
            creditsSpent: parseInt(row.credits_spent || 0),
            uses: parseInt(row.uses)
          })),
          aiCosts: aiCosts.rows.map(row => ({
            model: row.model_name,
            totalCost: parseFloat(row.total_cost || 0).toFixed(4),
            requests: parseInt(row.requests)
          }))
        }
      }
    });

  } catch (error) {
    console.error('[Wrapped] Spending error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve spending data',
      details: error.message
    });
  }
});

/**
 * GET /api/wrapped/me/milestones
 * User achievements and milestones
 */
router.get('/me/milestones', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Get all-time stats for milestone calculation
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE fua.blocked = FALSE) as total_feature_uses,
        COUNT(DISTINCT fua.feature_name) as unique_features_used,
        COUNT(DISTINCT DATE(fua.used_at)) as total_active_days,
        SUM(fua.credits_deducted) as total_credits_spent,
        (SELECT COUNT(*) FROM model_usage_events WHERE user_id = $1) as total_ai_requests,
        (SELECT SUM(total_tokens) FROM model_usage_events WHERE user_id = $1) as total_tokens,
        (SELECT reputation_score FROM user_devices WHERE user_id = $1 ORDER BY reputation_score DESC LIMIT 1) as reputation,
        (SELECT created_at FROM users WHERE user_id = $1) as member_since
      FROM feature_usage_analytics fua
      WHERE fua.user_id = $1
    `, [userId]);

    const data = stats.rows[0];
    const milestones = [];

    // Usage milestones
    const usageThresholds = [10, 50, 100, 500, 1000, 5000, 10000];
    const totalUses = parseInt(data.total_feature_uses || 0);

    for (const threshold of usageThresholds) {
      if (totalUses >= threshold) {
        milestones.push({
          category: 'usage',
          title: `${threshold.toLocaleString()} Uses`,
          description: `You've made ${totalUses.toLocaleString()} feature requests`,
          achieved: true,
          progress: 100
        });
      }
    }

    // Feature explorer milestones
    const uniqueFeatures = parseInt(data.unique_features_used || 0);
    const featureThresholds = [5, 10, 20, 30];

    for (const threshold of featureThresholds) {
      if (uniqueFeatures >= threshold) {
        milestones.push({
          category: 'explorer',
          title: `Feature Explorer ${threshold}`,
          description: `Tried ${uniqueFeatures} different features`,
          achieved: true,
          progress: 100
        });
      }
    }

    // Consistency milestones
    const activeDays = parseInt(data.total_active_days || 0);
    const dayThresholds = [7, 30, 90, 180, 365];

    for (const threshold of dayThresholds) {
      if (activeDays >= threshold) {
        milestones.push({
          category: 'consistency',
          title: `${threshold} Day Streak`,
          description: `Active ${activeDays} total days`,
          achieved: true,
          progress: 100
        });
      }
    }

    // AI milestones
    const aiRequests = parseInt(data.total_ai_requests || 0);
    const aiThresholds = [100, 500, 1000, 5000];

    for (const threshold of aiThresholds) {
      if (aiRequests >= threshold) {
        milestones.push({
          category: 'ai',
          title: `AI Power User ${threshold}`,
          description: `${aiRequests.toLocaleString()} AI model requests`,
          achieved: true,
          progress: 100
        });
      }
    }

    // Reputation milestones
    const reputation = parseFloat(data.reputation || 0);
    if (reputation >= 50) {
      milestones.push({
        category: 'reputation',
        title: 'Trusted Member',
        description: `Reputation score: ${reputation.toFixed(1)}`,
        achieved: true,
        progress: 100
      });
    }
    if (reputation >= 80) {
      milestones.push({
        category: 'reputation',
        title: 'Elite Member',
        description: `Elite reputation: ${reputation.toFixed(1)}`,
        achieved: true,
        progress: 100
      });
    }

    // Account age milestone
    if (data.member_since) {
      const memberDays = Math.floor((new Date() - new Date(data.member_since)) / (1000 * 60 * 60 * 24));
      const ageThresholds = [30, 90, 180, 365];

      for (const threshold of ageThresholds) {
        if (memberDays >= threshold) {
          milestones.push({
            category: 'tenure',
            title: `${threshold} Day Member`,
            description: `Member for ${memberDays} days`,
            achieved: true,
            progress: 100
          });
        }
      }
    }

    res.json({
      status: 'success',
      data: {
        milestones: milestones.sort((a, b) => b.achieved - a.achieved),
        totalAchieved: milestones.length,
        stats: {
          totalUses,
          uniqueFeatures,
          activeDays,
          aiRequests,
          reputation: reputation.toFixed(1)
        }
      }
    });

  } catch (error) {
    console.error('[Wrapped] Milestones error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve milestones',
      details: error.message
    });
  }
});

/**
 * GET /api/wrapped/platform
 * Platform-wide summary (admin only)
 */
router.get('/platform', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, label } = parsePeriod(req.query.period || 'year');

    // Platform-wide stats
    const platformStats = await db.query(`
      SELECT
        COUNT(DISTINCT user_id) as total_users,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE blocked = FALSE) as successful_requests,
        COUNT(DISTINCT feature_name) as features_used,
        SUM(credits_deducted) as total_credits_spent
      FROM feature_usage_analytics
      WHERE used_at >= $1 AND used_at <= $2
    `, [startDate, endDate]);

    // Top users
    const topUsers = await db.query(`
      SELECT
        u.username,
        u.email,
        COUNT(*) as uses,
        SUM(fua.credits_deducted) as credits_spent
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      WHERE fua.used_at >= $1 AND fua.used_at <= $2
      GROUP BY u.user_id, u.username, u.email
      ORDER BY uses DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Top features
    const topFeatures = await db.query(`
      SELECT
        feature_name,
        COUNT(*) as uses,
        COUNT(DISTINCT user_id) as unique_users
      FROM feature_usage_analytics
      WHERE used_at >= $1 AND used_at <= $2
      GROUP BY feature_name
      ORDER BY uses DESC
      LIMIT 10
    `, [startDate, endDate]);

    // AI usage
    const aiStats = await db.query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(DISTINCT user_id) as unique_users
      FROM model_usage_events
      WHERE created_at >= $1 AND created_at <= $2
    `, [startDate, endDate]);

    const stats = platformStats.rows[0];
    const ai = aiStats.rows[0];

    res.json({
      status: 'success',
      data: {
        period: { label, startDate, endDate },
        platform: {
          totalUsers: parseInt(stats.total_users || 0),
          totalRequests: parseInt(stats.total_requests || 0),
          successfulRequests: parseInt(stats.successful_requests || 0),
          featuresUsed: parseInt(stats.features_used || 0),
          creditsSpent: parseInt(stats.total_credits_spent || 0)
        },
        topUsers: topUsers.rows.map(u => ({
          username: u.username,
          email: u.email,
          uses: parseInt(u.uses),
          creditsSpent: parseInt(u.credits_spent || 0)
        })),
        topFeatures: topFeatures.rows.map(f => ({
          feature: f.feature_name,
          uses: parseInt(f.uses),
          uniqueUsers: parseInt(f.unique_users)
        })),
        aiUsage: {
          totalRequests: parseInt(ai.total_requests || 0),
          totalTokens: parseInt(ai.total_tokens || 0),
          totalCost: parseFloat(ai.total_cost || 0).toFixed(2),
          uniqueUsers: parseInt(ai.unique_users || 0)
        }
      }
    });

  } catch (error) {
    console.error('[Wrapped] Platform summary error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate platform summary',
      details: error.message
    });
  }
});

module.exports = { initRoutes };
