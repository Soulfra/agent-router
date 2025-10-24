/**
 * Feature Analytics Routes
 *
 * API for analyzing feature usage and revenue ("top producers").
 * Like Claude Code tracking: unlimited → limited → weekly
 *
 * Find which features generate most:
 * - Revenue (pay-per-feature unlocks)
 * - Usage (total uses)
 * - User engagement (unique users)
 * - Blocked attempts (demand indicators)
 *
 * Endpoints:
 * - GET /api/feature-analytics/summary - Overall summary
 * - GET /api/feature-analytics/top-revenue - Top revenue-generating features
 * - GET /api/feature-analytics/top-usage - Most used features
 * - GET /api/feature-analytics/:featureName - Specific feature analytics
 * - GET /api/feature-analytics/blocked - Features with denied access
 * - GET /api/feature-analytics/beta - Beta features and user counts
 */

const express = require('express');
const router = express.Router();

// Will be injected via initRoutes
let db = null;
let featureGate = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, featureGateManager) {
  db = database;
  featureGate = featureGateManager;

  return router;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

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
    console.error('[FeatureAnalytics] Admin check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authorization failed'
    });
  }
}

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/feature-analytics/summary
 * Overall feature usage summary
 *
 * Response:
 * {
 *   totalFeatures: 15,
 *   totalUses: 10000,
 *   uniqueUsers: 500,
 *   totalRevenue: 5000.00,
 *   topFeatures: [ ... ]
 * }
 */
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    // Get overall stats
    const statsResult = await db.query(`
      SELECT
        COUNT(DISTINCT feature_name) as total_features,
        COUNT(*) as total_uses,
        COUNT(*) FILTER (WHERE blocked = FALSE) as successful_uses,
        COUNT(*) FILTER (WHERE blocked = TRUE) as blocked_attempts,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(credits_deducted) as total_credits_deducted
      FROM feature_usage_analytics
    `);

    // Get revenue stats
    const revenueResult = await db.query(`
      SELECT
        COUNT(*) as total_unlocks,
        SUM(price_paid_cents) as total_revenue_cents,
        COUNT(DISTINCT user_id) as paying_users
      FROM feature_access_overrides
      WHERE access_type = 'pay_per_feature'
    `);

    // Get top 5 features
    const topFeatures = await db.query(`
      SELECT * FROM feature_usage_summary
      ORDER BY total_uses DESC
      LIMIT 5
    `);

    const stats = statsResult.rows[0];
    const revenue = revenueResult.rows[0];

    res.json({
      status: 'success',
      data: {
        totalFeatures: parseInt(stats.total_features),
        totalUses: parseInt(stats.total_uses),
        successfulUses: parseInt(stats.successful_uses),
        blockedAttempts: parseInt(stats.blocked_attempts),
        uniqueUsers: parseInt(stats.unique_users),
        totalCreditsDeducted: parseInt(stats.total_credits_deducted || 0),
        revenue: {
          totalUnlocks: parseInt(revenue.total_unlocks || 0),
          totalRevenue: parseFloat((revenue.total_revenue_cents || 0) / 100).toFixed(2),
          payingUsers: parseInt(revenue.paying_users || 0),
          avgRevenuePerUser: revenue.paying_users > 0
            ? parseFloat((revenue.total_revenue_cents / revenue.paying_users / 100).toFixed(2))
            : 0
        },
        topFeatures: topFeatures.rows
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Summary error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve analytics summary',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/top-revenue
 * Top revenue-generating features (pay-per-feature)
 *
 * Query params:
 * - limit: max results (default: 10)
 */
router.get('/top-revenue', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const topProducers = await featureGate.getTopProducers(limit);

    res.json({
      status: 'success',
      data: {
        features: topProducers,
        count: topProducers.length
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Top revenue error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve top revenue features',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/top-usage
 * Most used features
 *
 * Query params:
 * - limit: max results (default: 10)
 * - startDate: filter by date (ISO string)
 * - endDate: filter by date (ISO string)
 */
router.get('/top-usage', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = `
      SELECT
        feature_name,
        COUNT(*) as total_uses,
        COUNT(*) FILTER (WHERE blocked = FALSE) as successful_uses,
        COUNT(*) FILTER (WHERE blocked = TRUE) as blocked_attempts,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(credits_deducted) as total_credits_deducted,
        MIN(used_at) as first_use,
        MAX(used_at) as latest_use
      FROM feature_usage_analytics
    `;

    const params = [];
    const conditions = [];

    if (startDate) {
      conditions.push(`used_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`used_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY feature_name
      ORDER BY total_uses DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: {
        features: result.rows.map(row => ({
          feature: row.feature_name,
          totalUses: parseInt(row.total_uses),
          successfulUses: parseInt(row.successful_uses),
          blockedAttempts: parseInt(row.blocked_attempts),
          uniqueUsers: parseInt(row.unique_users),
          totalCreditsDeducted: parseInt(row.total_credits_deducted || 0),
          firstUse: row.first_use,
          latestUse: row.latest_use
        })),
        count: result.rows.length,
        filters: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Top usage error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve top usage features',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/:featureName
 * Specific feature analytics
 */
router.get('/:featureName', requireAdmin, async (req, res) => {
  try {
    const { featureName } = req.params;

    // Get feature definition
    const featureResult = await db.query(
      `SELECT * FROM feature_definitions WHERE feature_name = $1`,
      [featureName]
    );

    if (featureResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    const feature = featureResult.rows[0];

    // Get usage stats
    const usageResult = await db.query(
      `SELECT * FROM feature_usage_summary WHERE feature_name = $1`,
      [featureName]
    );

    // Get revenue stats (if pay-per-feature)
    const revenueResult = await db.query(
      `SELECT * FROM top_revenue_features WHERE feature_name = $1`,
      [featureName]
    );

    // Get recent activity
    const activityResult = await db.query(
      `SELECT
        used_at,
        access_type,
        blocked,
        block_reason,
        credits_deducted,
        endpoint
      FROM feature_usage_analytics
      WHERE feature_name = $1
      ORDER BY used_at DESC
      LIMIT 50`,
      [featureName]
    );

    // Get unique users this week/month
    const usersResult = await db.query(
      `SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE used_at >= NOW() - INTERVAL '7 days') as users_this_week,
        COUNT(DISTINCT user_id) FILTER (WHERE used_at >= NOW() - INTERVAL '30 days') as users_this_month,
        COUNT(DISTINCT user_id) as users_all_time
      FROM feature_usage_analytics
      WHERE feature_name = $1 AND blocked = FALSE`,
      [featureName]
    );

    res.json({
      status: 'success',
      data: {
        feature: {
          name: feature.feature_name,
          displayName: feature.display_name,
          description: feature.description,
          category: feature.category,
          status: feature.status,
          isBeta: feature.is_beta,
          requiresSubscription: feature.requires_subscription,
          minTier: feature.min_tier_code,
          isPaidFeature: feature.is_paid_feature,
          featurePrice: feature.feature_price_cents ? (feature.feature_price_cents / 100).toFixed(2) : null
        },
        usage: usageResult.rows[0] || {},
        revenue: revenueResult.rows[0] || null,
        users: usersResult.rows[0],
        recentActivity: activityResult.rows
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Feature detail error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve feature analytics',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/blocked
 * Features with denied access (demand indicators)
 */
router.get('/blocked', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM feature_access_denials
      ORDER BY denial_count DESC
      LIMIT 50
    `);

    res.json({
      status: 'success',
      data: {
        denials: result.rows,
        count: result.rows.length,
        message: 'High denial counts indicate demand for features users don\'t have access to'
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Blocked access error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve blocked access data',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/beta
 * Beta features and user counts
 */
router.get('/beta', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM beta_users_by_feature
      ORDER BY beta_user_count DESC
    `);

    res.json({
      status: 'success',
      data: {
        betaFeatures: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Beta features error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve beta features data',
      details: error.message
    });
  }
});

/**
 * GET /api/feature-analytics/trends
 * Usage trends over time
 *
 * Query params:
 * - featureName: specific feature (optional)
 * - groupBy: 'hour', 'day', 'week', 'month'
 * - period: number of periods to include
 */
router.get('/trends', requireAdmin, async (req, res) => {
  try {
    const { featureName, groupBy = 'day', period = 30 } = req.query;

    let query = `
      SELECT
        DATE_TRUNC($1, used_at) as time_bucket,
        ${featureName ? 'feature_name,' : ''}
        COUNT(*) as uses,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(credits_deducted) as credits_deducted
      FROM feature_usage_analytics
      WHERE used_at >= NOW() - INTERVAL '${parseInt(period)} ${groupBy}s'
      ${featureName ? 'AND feature_name = $2' : ''}
      GROUP BY time_bucket ${featureName ? ', feature_name' : ''}
      ORDER BY time_bucket DESC
    `;

    const params = [groupBy];
    if (featureName) {
      params.push(featureName);
    }

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: {
        trends: result.rows,
        groupBy,
        period,
        featureName: featureName || 'all'
      }
    });

  } catch (error) {
    console.error('[FeatureAnalytics] Trends error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve usage trends',
      details: error.message
    });
  }
});

module.exports = { initRoutes };
