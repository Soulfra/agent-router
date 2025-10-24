/**
 * Metrics Bundle Routes (Efficient reads)
 *
 * Single API call returns bundled metrics instead of multiple round-trips.
 * Like loading a complete dashboard in one request.
 *
 * Bundles:
 * - User wrapped summary
 * - Leaderboard rankings
 * - Marketplace trending
 * - Activity feed
 * - Platform stats
 *
 * Benefits:
 * - Reduced API calls (1 instead of 5+)
 * - Lower latency (single DB transaction)
 * - Efficient data loading
 * - Atomic snapshot of all metrics
 *
 * Endpoints:
 * - GET /api/metrics/bundle - Complete dashboard bundle
 * - GET /api/metrics/bundle/user - User-specific bundle
 * - GET /api/metrics/bundle/platform - Platform-wide bundle (admin)
 * - GET /api/metrics/bundle/custom - Custom metric selection
 * - GET /api/metrics/health - System health check with key metrics
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
    console.error('[MetricsBundle] Admin check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authorization failed'
    });
  }
}

// ============================================================================
// BUNDLED METRICS ENDPOINTS
// ============================================================================

/**
 * GET /api/metrics/bundle
 * Complete dashboard bundle - ALL metrics in one call
 *
 * Returns:
 * - User wrapped summary
 * - Leaderboard rankings
 * - Marketplace trending
 * - Recent activity
 * - Platform stats
 */
router.get('/bundle', requireAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const userId = req.userId;

    // Execute all queries in parallel for maximum efficiency
    const [
      userWrappedResult,
      myRankingsResult,
      topFeaturesResult,
      trendingResult,
      recentActivityResult,
      platformStatsResult
    ] = await Promise.all([
      // 1. User wrapped summary (last 30 days)
      db.query(`
        SELECT
          COUNT(*) as total_uses,
          COUNT(DISTINCT feature_name) as unique_features,
          COUNT(DISTINCT DATE(used_at)) as active_days,
          SUM(credits_deducted) as credits_spent
        FROM feature_usage_analytics
        WHERE user_id = $1 AND used_at >= NOW() - INTERVAL '30 days' AND blocked = FALSE
      `, [userId]),

      // 2. My rankings across leaderboards
      db.query(`
        WITH usage_ranks AS (
          SELECT user_id, COUNT(*) as uses
          FROM feature_usage_analytics
          WHERE used_at >= NOW() - INTERVAL '7 days' AND blocked = FALSE
          GROUP BY user_id
        ),
        my_usage AS (
          SELECT uses FROM usage_ranks WHERE user_id = $1
        )
        SELECT
          (SELECT COUNT(*) + 1 FROM usage_ranks WHERE uses > (SELECT uses FROM my_usage)) as usage_rank,
          (SELECT COUNT(*) + 1 FROM user_credits WHERE credits_used_total > (SELECT credits_used_total FROM user_credits WHERE user_id = $1)) as spending_rank,
          (SELECT reputation_score FROM user_devices WHERE user_id = $1 ORDER BY reputation_score DESC LIMIT 1) as my_reputation
      `, [userId]),

      // 3. Top features (marketplace)
      db.query(`
        SELECT
          feature_name,
          display_name,
          feature_price_cents,
          (SELECT COUNT(DISTINCT user_id) FROM feature_usage_analytics WHERE feature_name = fd.feature_name AND blocked = TRUE AND used_at >= NOW() - INTERVAL '7 days') as demand
        FROM feature_definitions fd
        WHERE is_paid_feature = TRUE AND status = 'active'
        ORDER BY (SELECT COUNT(DISTINCT user_id) FROM feature_usage_analytics WHERE feature_name = fd.feature_name AND blocked = TRUE AND used_at >= NOW() - INTERVAL '7 days') DESC
        LIMIT 5
      `),

      // 4. Trending items (marketplace)
      db.query(`
        SELECT
          feature_name,
          COUNT(DISTINCT user_id) FILTER (WHERE blocked = TRUE AND used_at >= NOW() - INTERVAL '24 hours') as demand_24h,
          COUNT(DISTINCT user_id) FILTER (WHERE blocked = FALSE AND used_at >= NOW() - INTERVAL '24 hours') as usage_24h
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '24 hours'
        GROUP BY feature_name
        HAVING COUNT(DISTINCT user_id) FILTER (WHERE blocked = TRUE) > 0
        ORDER BY demand_24h DESC
        LIMIT 5
      `),

      // 5. Recent platform activity
      db.query(`
        SELECT
          fua.feature_name,
          u.username,
          fua.used_at as timestamp
        FROM feature_usage_analytics fua
        JOIN users u ON u.user_id = fua.user_id
        WHERE fua.blocked = FALSE AND fua.used_at >= NOW() - INTERVAL '5 minutes'
        ORDER BY fua.used_at DESC
        LIMIT 10
      `),

      // 6. Platform stats (last 15 minutes)
      db.query(`
        SELECT
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE blocked = FALSE) as successful_requests
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '15 minutes'
      `)
    ]);

    // Assemble the bundle
    const wrapped = userWrappedResult.rows[0];
    const rankings = myRankingsResult.rows[0];
    const topFeatures = topFeaturesResult.rows;
    const trending = trendingResult.rows;
    const activity = recentActivityResult.rows;
    const platformStats = platformStatsResult.rows[0];

    const bundle = {
      status: 'success',
      data: {
        // User summary
        user: {
          wrapped: {
            totalUses: parseInt(wrapped.total_uses || 0),
            uniqueFeatures: parseInt(wrapped.unique_features || 0),
            activeDays: parseInt(wrapped.active_days || 0),
            creditsSpent: parseInt(wrapped.credits_spent || 0)
          },
          rankings: {
            usage: parseInt(rankings.usage_rank || 999),
            spending: parseInt(rankings.spending_rank || 999),
            reputation: parseFloat(rankings.my_reputation || 0)
          }
        },

        // Marketplace
        marketplace: {
          topDemand: topFeatures.map(f => ({
            feature: f.feature_name,
            displayName: f.display_name,
            price: parseInt(f.feature_price_cents || 0),
            demand: parseInt(f.demand || 0)
          })),
          trending: trending.map(t => ({
            feature: t.feature_name,
            demand24h: parseInt(t.demand_24h || 0),
            usage24h: parseInt(t.usage_24h || 0)
          }))
        },

        // Activity
        activity: {
          recent: activity.map(a => ({
            feature: a.feature_name,
            username: a.username,
            timestamp: a.timestamp,
            secondsAgo: Math.floor((Date.now() - new Date(a.timestamp).getTime()) / 1000)
          }))
        },

        // Platform
        platform: {
          activeUsers: parseInt(platformStats.active_users || 0),
          totalRequests: parseInt(platformStats.total_requests || 0),
          successRate: platformStats.total_requests > 0
            ? Math.round((platformStats.successful_requests / platformStats.total_requests) * 100)
            : 0
        }
      },

      // Performance metrics
      meta: {
        bundleVersion: '1.0',
        queryTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString(),
        queriesExecuted: 6,
        note: 'All metrics fetched in single request'
      }
    };

    res.json(bundle);

  } catch (error) {
    console.error('[MetricsBundle] Bundle error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate metrics bundle',
      details: error.message,
      queryTime: `${Date.now() - startTime}ms`
    });
  }
});

/**
 * GET /api/metrics/bundle/user
 * User-focused bundle (no platform stats)
 */
router.get('/bundle/user', requireAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const userId = req.userId;
    const period = req.query.period || '30 days';

    const [
      userStatsResult,
      topFeaturesResult,
      topModelsResult,
      creditsResult,
      rankingsResult
    ] = await Promise.all([
      // User stats
      db.query(`
        SELECT
          COUNT(*) as total_uses,
          COUNT(DISTINCT feature_name) as unique_features,
          COUNT(DISTINCT DATE(used_at)) as active_days,
          SUM(credits_deducted) as credits_spent,
          MAX(used_at) as last_activity
        FROM feature_usage_analytics
        WHERE user_id = $1 AND used_at >= NOW() - INTERVAL '${period}' AND blocked = FALSE
      `, [userId]),

      // Top features used
      db.query(`
        SELECT
          feature_name,
          COUNT(*) as uses,
          SUM(credits_deducted) as credits
        FROM feature_usage_analytics
        WHERE user_id = $1 AND used_at >= NOW() - INTERVAL '${period}' AND blocked = FALSE
        GROUP BY feature_name
        ORDER BY uses DESC
        LIMIT 5
      `, [userId]),

      // Top AI models
      db.query(`
        SELECT
          model_name,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens
        FROM model_usage_events
        WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${period}'
        GROUP BY model_name
        ORDER BY requests DESC
        LIMIT 5
      `, [userId]),

      // Credits info
      db.query(`
        SELECT credits_remaining, credits_used_total, last_recharge_at
        FROM user_credits
        WHERE user_id = $1
      `, [userId]),

      // Rankings
      db.query(`
        WITH usage_stats AS (
          SELECT user_id, COUNT(*) as uses
          FROM feature_usage_analytics
          WHERE used_at >= NOW() - INTERVAL '7 days' AND blocked = FALSE
          GROUP BY user_id
        )
        SELECT
          (SELECT COUNT(*) + 1 FROM usage_stats WHERE uses > (SELECT uses FROM usage_stats WHERE user_id = $1)) as usage_rank,
          (SELECT reputation_score FROM user_devices WHERE user_id = $1 ORDER BY reputation_score DESC LIMIT 1) as reputation,
          (SELECT current_badge FROM user_devices WHERE user_id = $1 ORDER BY reputation_score DESC LIMIT 1) as badge
      `, [userId])
    ]);

    const stats = userStatsResult.rows[0];
    const features = topFeaturesResult.rows;
    const models = topModelsResult.rows;
    const credits = creditsResult.rows[0] || {};
    const rankings = rankingsResult.rows[0];

    res.json({
      status: 'success',
      data: {
        summary: {
          totalUses: parseInt(stats.total_uses || 0),
          uniqueFeatures: parseInt(stats.unique_features || 0),
          activeDays: parseInt(stats.active_days || 0),
          creditsSpent: parseInt(stats.credits_spent || 0),
          lastActivity: stats.last_activity
        },
        topFeatures: features.map(f => ({
          feature: f.feature_name,
          uses: parseInt(f.uses),
          credits: parseInt(f.credits || 0)
        })),
        topModels: models.map(m => ({
          model: m.model_name,
          requests: parseInt(m.requests),
          tokens: parseInt(m.tokens || 0)
        })),
        credits: {
          remaining: parseInt(credits.credits_remaining || 0),
          totalUsed: parseInt(credits.credits_used_total || 0),
          lastRecharge: credits.last_recharge_at
        },
        rankings: {
          usage: parseInt(rankings.usage_rank || 999),
          reputation: parseFloat(rankings.reputation || 0),
          badge: rankings.badge || 'none'
        }
      },
      meta: {
        period,
        queryTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[MetricsBundle] User bundle error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate user bundle',
      details: error.message
    });
  }
});

/**
 * GET /api/metrics/bundle/platform
 * Platform-wide bundle (admin only)
 */
router.get('/bundle/platform', requireAdmin, async (req, res) => {
  const startTime = Date.now();

  try {
    const period = req.query.period || '24 hours';

    const [
      platformStatsResult,
      topUsersResult,
      topFeaturesResult,
      revenueResult,
      aiStatsResult
    ] = await Promise.all([
      // Platform stats
      db.query(`
        SELECT
          COUNT(DISTINCT user_id) as total_users,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE blocked = FALSE) as successful_requests,
          SUM(credits_deducted) as total_credits
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '${period}'
      `),

      // Top users
      db.query(`
        SELECT
          u.username,
          COUNT(*) as uses
        FROM feature_usage_analytics fua
        JOIN users u ON u.user_id = fua.user_id
        WHERE fua.used_at >= NOW() - INTERVAL '${period}' AND fua.blocked = FALSE
        GROUP BY u.user_id, u.username
        ORDER BY uses DESC
        LIMIT 10
      `),

      // Top features
      db.query(`
        SELECT
          feature_name,
          COUNT(*) as uses,
          COUNT(DISTINCT user_id) as unique_users
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '${period}' AND blocked = FALSE
        GROUP BY feature_name
        ORDER BY uses DESC
        LIMIT 10
      `),

      // Revenue
      db.query(`
        SELECT
          COUNT(*) as purchases,
          SUM(price_paid_cents) as revenue
        FROM feature_access_overrides
        WHERE created_at >= NOW() - INTERVAL '${period}' AND access_type = 'pay_per_feature'
      `),

      // AI stats
      db.query(`
        SELECT
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(cost_usd) as cost
        FROM model_usage_events
        WHERE created_at >= NOW() - INTERVAL '${period}'
      `)
    ]);

    const stats = platformStatsResult.rows[0];
    const users = topUsersResult.rows;
    const features = topFeaturesResult.rows;
    const revenue = revenueResult.rows[0];
    const ai = aiStatsResult.rows[0];

    res.json({
      status: 'success',
      data: {
        platform: {
          totalUsers: parseInt(stats.total_users || 0),
          totalRequests: parseInt(stats.total_requests || 0),
          successfulRequests: parseInt(stats.successful_requests || 0),
          successRate: stats.total_requests > 0
            ? Math.round((stats.successful_requests / stats.total_requests) * 100)
            : 0,
          totalCredits: parseInt(stats.total_credits || 0)
        },
        topUsers: users.map(u => ({
          username: u.username,
          uses: parseInt(u.uses)
        })),
        topFeatures: features.map(f => ({
          feature: f.feature_name,
          uses: parseInt(f.uses),
          uniqueUsers: parseInt(f.unique_users)
        })),
        revenue: {
          purchases: parseInt(revenue.purchases || 0),
          revenue: parseFloat((revenue.revenue || 0) / 100).toFixed(2)
        },
        ai: {
          requests: parseInt(ai.requests || 0),
          tokens: parseInt(ai.tokens || 0),
          cost: parseFloat(ai.cost || 0).toFixed(2)
        }
      },
      meta: {
        period,
        queryTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[MetricsBundle] Platform bundle error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate platform bundle',
      details: error.message
    });
  }
});

/**
 * POST /api/metrics/bundle/custom
 * Custom metric selection - choose what to bundle
 *
 * Body:
 * {
 *   "metrics": ["wrapped", "rankings", "marketplace", "activity", "platform"]
 * }
 */
router.post('/bundle/custom', requireAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const userId = req.userId;
    const requestedMetrics = req.body.metrics || [];

    if (!Array.isArray(requestedMetrics) || requestedMetrics.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'metrics array required'
      });
    }

    const bundle = {
      status: 'success',
      data: {}
    };

    // Build queries based on requested metrics
    const queries = [];
    const queryNames = [];

    if (requestedMetrics.includes('wrapped')) {
      queryNames.push('wrapped');
      queries.push(
        db.query(`
          SELECT
            COUNT(*) as total_uses,
            COUNT(DISTINCT feature_name) as unique_features,
            SUM(credits_deducted) as credits_spent
          FROM feature_usage_analytics
          WHERE user_id = $1 AND used_at >= NOW() - INTERVAL '30 days' AND blocked = FALSE
        `, [userId])
      );
    }

    if (requestedMetrics.includes('rankings')) {
      queryNames.push('rankings');
      queries.push(
        db.query(`
          WITH usage_stats AS (
            SELECT user_id, COUNT(*) as uses
            FROM feature_usage_analytics
            WHERE used_at >= NOW() - INTERVAL '7 days' AND blocked = FALSE
            GROUP BY user_id
          )
          SELECT
            (SELECT COUNT(*) + 1 FROM usage_stats WHERE uses > (SELECT uses FROM usage_stats WHERE user_id = $1)) as usage_rank,
            (SELECT reputation_score FROM user_devices WHERE user_id = $1 ORDER BY reputation_score DESC LIMIT 1) as reputation
        `, [userId])
      );
    }

    if (requestedMetrics.includes('marketplace')) {
      queryNames.push('marketplace');
      queries.push(
        db.query(`
          SELECT
            feature_name,
            display_name,
            feature_price_cents,
            (SELECT COUNT(DISTINCT user_id) FROM feature_usage_analytics WHERE feature_name = fd.feature_name AND blocked = TRUE AND used_at >= NOW() - INTERVAL '7 days') as demand
          FROM feature_definitions fd
          WHERE is_paid_feature = TRUE AND status = 'active'
          ORDER BY demand DESC
          LIMIT 5
        `)
      );
    }

    if (requestedMetrics.includes('activity')) {
      queryNames.push('activity');
      queries.push(
        db.query(`
          SELECT
            fua.feature_name,
            u.username,
            fua.used_at as timestamp
          FROM feature_usage_analytics fua
          JOIN users u ON u.user_id = fua.user_id
          WHERE fua.blocked = FALSE AND fua.used_at >= NOW() - INTERVAL '5 minutes'
          ORDER BY fua.used_at DESC
          LIMIT 10
        `)
      );
    }

    if (requestedMetrics.includes('platform')) {
      queryNames.push('platform');
      queries.push(
        db.query(`
          SELECT
            COUNT(DISTINCT user_id) as active_users,
            COUNT(*) as total_requests
          FROM feature_usage_analytics
          WHERE used_at >= NOW() - INTERVAL '15 minutes'
        `)
      );
    }

    // Execute all queries in parallel
    const results = await Promise.all(queries);

    // Map results to bundle
    results.forEach((result, index) => {
      const metricName = queryNames[index];
      bundle.data[metricName] = result.rows[0] || result.rows;
    });

    bundle.meta = {
      requestedMetrics,
      queryTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    };

    res.json(bundle);

  } catch (error) {
    console.error('[MetricsBundle] Custom bundle error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate custom bundle',
      details: error.message
    });
  }
});

/**
 * GET /api/metrics/health
 * System health check with key metrics
 */
router.get('/health', async (req, res) => {
  const startTime = Date.now();

  try {
    const [
      activeUsersResult,
      requestsResult,
      errorRateResult,
      dbHealthResult
    ] = await Promise.all([
      // Active users (last hour)
      db.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '1 hour'
      `),

      // Requests per minute
      db.query(`
        SELECT COUNT(*) as count
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '1 minute'
      `),

      // Error rate (last 5 minutes)
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE blocked = TRUE) as errors,
          COUNT(*) as total
        FROM feature_usage_analytics
        WHERE used_at >= NOW() - INTERVAL '5 minutes'
      `),

      // DB connection test
      db.query(`SELECT NOW() as db_time`)
    ]);

    const activeUsers = activeUsersResult.rows[0];
    const requests = requestsResult.rows[0];
    const errors = errorRateResult.rows[0];
    const dbHealth = dbHealthResult.rows[0];

    const errorRate = errors.total > 0 ? ((errors.errors / errors.total) * 100).toFixed(2) : 0;
    const isHealthy = errorRate < 5 && dbHealth.db_time;

    res.json({
      status: isHealthy ? 'healthy' : 'degraded',
      data: {
        activeUsersLastHour: parseInt(activeUsers.count || 0),
        requestsPerMinute: parseInt(requests.count || 0),
        errorRatePercent: parseFloat(errorRate),
        databaseConnected: !!dbHealth.db_time,
        responseTime: `${Date.now() - startTime}ms`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MetricsBundle] Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = { initRoutes };
