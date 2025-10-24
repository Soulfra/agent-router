/**
 * Marketplace Dynamics Routes (RuneScape GE-style)
 *
 * Supply/demand based pricing with platform tax.
 * Like RuneScape Grand Exchange - prices fluctuate based on market activity.
 *
 * Concepts:
 * - Dynamic pricing (high demand = higher prices)
 * - Platform tax (1-5% on transactions)
 * - Supply tracking (available vs sold)
 * - Demand indicators (blocked attempts = unmet demand)
 * - Price history (track changes over time)
 *
 * Reads from:
 * - feature_definitions (base prices)
 * - feature_access_overrides (purchase history)
 * - feature_usage_analytics (demand signals via blocked attempts)
 * - app_templates (template marketplace)
 *
 * Endpoints:
 * - GET /api/marketplace/features - All features with dynamic pricing
 * - GET /api/marketplace/features/:featureName - Specific feature market data
 * - GET /api/marketplace/templates - App template marketplace
 * - GET /api/marketplace/trending - Trending items (high demand)
 * - GET /api/marketplace/demand - Demand indicators (blocked attempts)
 * - GET /api/marketplace/price-history/:featureName - Price changes over time
 * - POST /api/marketplace/calculate-price - Calculate dynamic price for item
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
// CONFIGURATION
// ============================================================================

const PLATFORM_TAX_RATE = 0.02; // 2% platform tax (like GE's 1%)
const DEMAND_MULTIPLIER = 0.1; // 10% price increase per 10 blocked attempts
const SUPPLY_DISCOUNT = 0.05; // 5% discount per 10 existing unlocks

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
 * Calculate dynamic price based on supply and demand
 */
function calculateDynamicPrice(basePrice, demand, supply) {
  // Start with base price
  let price = basePrice;

  // Increase price based on demand (blocked attempts)
  const demandMultiplier = 1 + ((demand / 10) * DEMAND_MULTIPLIER);
  price *= demandMultiplier;

  // Decrease price based on supply (existing unlocks)
  const supplyDiscount = 1 - ((supply / 10) * SUPPLY_DISCOUNT);
  price *= Math.max(supplyDiscount, 0.5); // Min 50% of base price

  // Round to nearest cent
  return Math.round(price);
}

/**
 * Calculate platform tax
 */
function calculateTax(price) {
  return Math.round(price * PLATFORM_TAX_RATE);
}

/**
 * Get market activity for feature
 */
async function getFeatureMarketData(featureName, timeWindow = '7 days') {
  const result = await db.query(`
    SELECT
      -- Base info
      fd.feature_name,
      fd.display_name,
      fd.description,
      fd.category,
      fd.feature_price_cents as base_price_cents,
      fd.is_paid_feature,

      -- Demand signals (blocked attempts = unmet demand)
      COUNT(DISTINCT fua.user_id) FILTER (
        WHERE fua.blocked = TRUE
        AND fua.used_at >= NOW() - INTERVAL '${timeWindow}'
      ) as demand_count,

      -- Supply (existing unlocks)
      COUNT(DISTINCT fao.user_id) as supply_count,

      -- Recent purchases (last 7 days)
      COUNT(DISTINCT fao.user_id) FILTER (
        WHERE fao.created_at >= NOW() - INTERVAL '7 days'
      ) as recent_purchases,

      -- Average price paid (market history)
      AVG(fao.price_paid_cents) FILTER (
        WHERE fao.access_type = 'pay_per_feature'
        AND fao.created_at >= NOW() - INTERVAL '30 days'
      ) as avg_market_price,

      -- Total revenue
      SUM(fao.price_paid_cents) FILTER (
        WHERE fao.access_type = 'pay_per_feature'
      ) as total_revenue_cents,

      -- Recent usage (success rate)
      COUNT(*) FILTER (
        WHERE fua.blocked = FALSE
        AND fua.used_at >= NOW() - INTERVAL '7 days'
      ) as recent_usage

    FROM feature_definitions fd
    LEFT JOIN feature_usage_analytics fua ON fua.feature_name = fd.feature_name
    LEFT JOIN feature_access_overrides fao ON fao.feature_name = fd.feature_name
    WHERE fd.feature_name = $1
    GROUP BY fd.feature_id, fd.feature_name, fd.display_name, fd.description, fd.category, fd.feature_price_cents, fd.is_paid_feature
  `, [featureName]);

  return result.rows[0];
}

// ============================================================================
// MARKETPLACE ENDPOINTS
// ============================================================================

/**
 * GET /api/marketplace/features
 * All features with dynamic pricing
 *
 * Query params:
 * - category: filter by category
 * - sort: 'price', 'demand', 'trending' (default: 'demand')
 */
router.get('/features', async (req, res) => {
  try {
    const category = req.query.category;
    const sort = req.query.sort || 'demand';

    let query = `
      SELECT
        fd.feature_name,
        fd.display_name,
        fd.description,
        fd.category,
        fd.feature_price_cents as base_price_cents,
        fd.is_paid_feature,

        -- Demand (last 7 days blocked attempts)
        COUNT(DISTINCT fua.user_id) FILTER (
          WHERE fua.blocked = TRUE
          AND fua.used_at >= NOW() - INTERVAL '7 days'
        ) as demand_count,

        -- Supply (total unlocks)
        COUNT(DISTINCT fao.user_id) as supply_count,

        -- Recent purchases
        COUNT(DISTINCT fao.user_id) FILTER (
          WHERE fao.created_at >= NOW() - INTERVAL '7 days'
        ) as recent_purchases,

        -- Average market price
        AVG(fao.price_paid_cents) as avg_market_price

      FROM feature_definitions fd
      LEFT JOIN feature_usage_analytics fua ON fua.feature_name = fd.feature_name
      LEFT JOIN feature_access_overrides fao ON fao.feature_name = fd.feature_name
      WHERE fd.is_paid_feature = TRUE AND fd.status = 'active'
    `;

    const params = [];

    if (category) {
      params.push(category);
      query += ` AND fd.category = $${params.length}`;
    }

    query += `
      GROUP BY fd.feature_id, fd.feature_name, fd.display_name, fd.description, fd.category, fd.feature_price_cents, fd.is_paid_feature
    `;

    // Sorting
    switch (sort) {
      case 'price':
        query += ` ORDER BY fd.feature_price_cents DESC`;
        break;
      case 'trending':
        query += ` ORDER BY recent_purchases DESC, demand_count DESC`;
        break;
      case 'demand':
      default:
        query += ` ORDER BY demand_count DESC, recent_purchases DESC`;
        break;
    }

    const result = await db.query(query, params);

    // Calculate dynamic prices
    const features = result.rows.map(row => {
      const basePrice = parseInt(row.base_price_cents || 0);
      const demand = parseInt(row.demand_count || 0);
      const supply = parseInt(row.supply_count || 0);

      const dynamicPrice = calculateDynamicPrice(basePrice, demand, supply);
      const tax = calculateTax(dynamicPrice);
      const totalPrice = dynamicPrice + tax;

      return {
        feature: row.feature_name,
        displayName: row.display_name,
        description: row.description,
        category: row.category,
        pricing: {
          basePrice: basePrice,
          currentPrice: dynamicPrice,
          tax: tax,
          totalPrice: totalPrice,
          priceChange: basePrice > 0 ? Math.round(((dynamicPrice - basePrice) / basePrice) * 100) : 0
        },
        market: {
          demand: demand,
          supply: supply,
          recentPurchases: parseInt(row.recent_purchases || 0),
          avgMarketPrice: row.avg_market_price ? Math.round(parseFloat(row.avg_market_price)) : null,
          demandIndicator: demand > 10 ? 'high' : demand > 5 ? 'medium' : 'low'
        }
      };
    });

    res.json({
      status: 'success',
      data: {
        features,
        count: features.length,
        platformTaxRate: `${(PLATFORM_TAX_RATE * 100).toFixed(1)}%`,
        sortBy: sort
      }
    });

  } catch (error) {
    console.error('[Marketplace] Features list error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve marketplace features',
      details: error.message
    });
  }
});

/**
 * GET /api/marketplace/features/:featureName
 * Detailed market data for specific feature
 */
router.get('/features/:featureName', async (req, res) => {
  try {
    const { featureName } = req.params;

    const market = await getFeatureMarketData(featureName);

    if (!market) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    const basePrice = parseInt(market.base_price_cents || 0);
    const demand = parseInt(market.demand_count || 0);
    const supply = parseInt(market.supply_count || 0);

    const dynamicPrice = calculateDynamicPrice(basePrice, demand, supply);
    const tax = calculateTax(dynamicPrice);
    const totalPrice = dynamicPrice + tax;

    // Get price history (last 30 days)
    const priceHistory = await db.query(`
      SELECT
        DATE(created_at) as date,
        AVG(price_paid_cents) as avg_price,
        COUNT(*) as purchases
      FROM feature_access_overrides
      WHERE feature_name = $1
        AND access_type = 'pay_per_feature'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [featureName]);

    res.json({
      status: 'success',
      data: {
        feature: {
          name: market.feature_name,
          displayName: market.display_name,
          description: market.description,
          category: market.category
        },
        pricing: {
          basePrice: basePrice,
          currentPrice: dynamicPrice,
          tax: tax,
          totalPrice: totalPrice,
          priceChange: basePrice > 0 ? Math.round(((dynamicPrice - basePrice) / basePrice) * 100) : 0,
          avgMarketPrice: market.avg_market_price ? Math.round(parseFloat(market.avg_market_price)) : null
        },
        market: {
          demand: demand,
          supply: supply,
          recentPurchases: parseInt(market.recent_purchases || 0),
          recentUsage: parseInt(market.recent_usage || 0),
          totalRevenue: parseFloat((market.total_revenue_cents || 0) / 100).toFixed(2),
          demandIndicator: demand > 10 ? 'high' : demand > 5 ? 'medium' : 'low',
          supplyIndicator: supply > 50 ? 'high' : supply > 20 ? 'medium' : 'low'
        },
        priceHistory: priceHistory.rows.map(row => ({
          date: row.date,
          avgPrice: Math.round(parseFloat(row.avg_price)),
          purchases: parseInt(row.purchases)
        })),
        metadata: {
          platformTaxRate: `${(PLATFORM_TAX_RATE * 100).toFixed(1)}%`,
          lastUpdated: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('[Marketplace] Feature detail error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve feature market data',
      details: error.message
    });
  }
});

/**
 * GET /api/marketplace/templates
 * App template marketplace
 */
router.get('/templates', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        at.template_id,
        at.name,
        at.description,
        at.category,
        at.price_cents,
        at.install_count,
        at.rating,
        at.is_featured,
        tp.rating_count,
        tp.unique_users
      FROM app_templates at
      LEFT JOIN template_popularity tp ON tp.template_id = at.template_id
      WHERE at.status = 'active'
      ORDER BY at.install_count DESC, at.rating DESC
      LIMIT 100
    `);

    res.json({
      status: 'success',
      data: {
        templates: result.rows.map(row => ({
          templateId: row.template_id,
          name: row.name,
          description: row.description,
          category: row.category,
          price: parseInt(row.price_cents || 0),
          installCount: parseInt(row.install_count || 0),
          rating: parseFloat(row.rating || 0).toFixed(1),
          ratingCount: parseInt(row.rating_count || 0),
          uniqueUsers: parseInt(row.unique_users || 0),
          isFeatured: row.is_featured
        })),
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Marketplace] Templates error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve template marketplace',
      details: error.message
    });
  }
});

/**
 * GET /api/marketplace/trending
 * Trending items (high demand, recent purchases)
 */
router.get('/trending', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        fd.feature_name,
        fd.display_name,
        fd.category,
        fd.feature_price_cents as base_price,

        -- Demand score (weighted recent activity)
        (COUNT(DISTINCT fua.user_id) FILTER (
          WHERE fua.blocked = TRUE
          AND fua.used_at >= NOW() - INTERVAL '24 hours'
        ) * 3) as demand_24h,

        (COUNT(DISTINCT fua.user_id) FILTER (
          WHERE fua.blocked = TRUE
          AND fua.used_at >= NOW() - INTERVAL '7 days'
        )) as demand_7d,

        -- Purchase momentum
        COUNT(DISTINCT fao.user_id) FILTER (
          WHERE fao.created_at >= NOW() - INTERVAL '24 hours'
        ) as purchases_24h,

        COUNT(DISTINCT fao.user_id) FILTER (
          WHERE fao.created_at >= NOW() - INTERVAL '7 days'
        ) as purchases_7d,

        -- Trend score (weighted combination)
        (
          (COUNT(DISTINCT fua.user_id) FILTER (
            WHERE fua.blocked = TRUE
            AND fua.used_at >= NOW() - INTERVAL '24 hours'
          ) * 3) +
          (COUNT(DISTINCT fao.user_id) FILTER (
            WHERE fao.created_at >= NOW() - INTERVAL '24 hours'
          ) * 5)
        ) as trend_score

      FROM feature_definitions fd
      LEFT JOIN feature_usage_analytics fua ON fua.feature_name = fd.feature_name
      LEFT JOIN feature_access_overrides fao ON fao.feature_name = fd.feature_name
      WHERE fd.is_paid_feature = TRUE AND fd.status = 'active'
      GROUP BY fd.feature_id, fd.feature_name, fd.display_name, fd.category, fd.feature_price_cents
      HAVING (
        COUNT(DISTINCT fua.user_id) FILTER (
          WHERE fua.blocked = TRUE
          AND fua.used_at >= NOW() - INTERVAL '24 hours'
        ) > 0
        OR
        COUNT(DISTINCT fao.user_id) FILTER (
          WHERE fao.created_at >= NOW() - INTERVAL '24 hours'
        ) > 0
      )
      ORDER BY trend_score DESC
      LIMIT 20
    `);

    res.json({
      status: 'success',
      data: {
        trending: result.rows.map(row => ({
          feature: row.feature_name,
          displayName: row.display_name,
          category: row.category,
          basePrice: parseInt(row.base_price || 0),
          metrics: {
            demand24h: parseInt(row.demand_24h || 0),
            demand7d: parseInt(row.demand_7d || 0),
            purchases24h: parseInt(row.purchases_24h || 0),
            purchases7d: parseInt(row.purchases_7d || 0),
            trendScore: parseInt(row.trend_score || 0)
          },
          trendIndicator: parseInt(row.trend_score || 0) > 10 ? '🔥 Hot' : '📈 Rising'
        })),
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Marketplace] Trending error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve trending items',
      details: error.message
    });
  }
});

/**
 * GET /api/marketplace/demand
 * Demand indicators (blocked attempts = unmet demand)
 */
router.get('/demand', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        fua.feature_name,
        fd.display_name,
        fua.block_reason,
        COUNT(DISTINCT fua.user_id) as unique_users,
        COUNT(*) as total_attempts,
        MAX(fua.used_at) as latest_attempt,
        fd.feature_price_cents as current_price
      FROM feature_usage_analytics fua
      JOIN feature_definitions fd ON fd.feature_name = fua.feature_name
      WHERE fua.blocked = TRUE
        AND fua.used_at >= NOW() - INTERVAL '7 days'
        AND fd.is_paid_feature = TRUE
      GROUP BY fua.feature_name, fd.display_name, fua.block_reason, fd.feature_price_cents
      ORDER BY total_attempts DESC
      LIMIT 50
    `);

    res.json({
      status: 'success',
      data: {
        demandSignals: result.rows.map(row => ({
          feature: row.feature_name,
          displayName: row.display_name,
          blockReason: row.block_reason,
          uniqueUsers: parseInt(row.unique_users),
          totalAttempts: parseInt(row.total_attempts),
          latestAttempt: row.latest_attempt,
          currentPrice: parseInt(row.current_price || 0),
          demandLevel: parseInt(row.total_attempts) > 20 ? 'high' :
                       parseInt(row.total_attempts) > 10 ? 'medium' : 'low'
        })),
        count: result.rows.length,
        message: 'Blocked attempts indicate unmet demand - opportunities for upsells'
      }
    });

  } catch (error) {
    console.error('[Marketplace] Demand indicators error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve demand indicators',
      details: error.message
    });
  }
});

/**
 * GET /api/marketplace/price-history/:featureName
 * Historical price data for feature
 */
router.get('/price-history/:featureName', async (req, res) => {
  try {
    const { featureName } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    // Verify feature exists
    const featureCheck = await db.query(
      `SELECT display_name, feature_price_cents FROM feature_definitions WHERE feature_name = $1`,
      [featureName]
    );

    if (featureCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    // Get actual purchase prices over time
    const history = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as purchases,
        AVG(price_paid_cents) as avg_price,
        MIN(price_paid_cents) as min_price,
        MAX(price_paid_cents) as max_price
      FROM feature_access_overrides
      WHERE feature_name = $1
        AND access_type = 'pay_per_feature'
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [featureName]);

    res.json({
      status: 'success',
      data: {
        feature: {
          name: featureName,
          displayName: featureCheck.rows[0].display_name,
          currentBasePrice: parseInt(featureCheck.rows[0].feature_price_cents || 0)
        },
        priceHistory: history.rows.map(row => ({
          date: row.date,
          purchases: parseInt(row.purchases),
          avgPrice: Math.round(parseFloat(row.avg_price)),
          minPrice: Math.round(parseFloat(row.min_price)),
          maxPrice: Math.round(parseFloat(row.max_price))
        })),
        period: `${days} days`,
        dataPoints: history.rows.length
      }
    });

  } catch (error) {
    console.error('[Marketplace] Price history error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve price history',
      details: error.message
    });
  }
});

/**
 * POST /api/marketplace/calculate-price
 * Calculate dynamic price for item
 *
 * Body:
 * {
 *   "featureName": "secure_messaging",
 *   "basePrice": 500  // optional, uses DB price if not provided
 * }
 */
router.post('/calculate-price', requireAuth, async (req, res) => {
  try {
    const { featureName, basePrice } = req.body;

    if (!featureName) {
      return res.status(400).json({
        status: 'error',
        error: 'featureName required'
      });
    }

    const market = await getFeatureMarketData(featureName);

    if (!market) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    const price = basePrice || parseInt(market.base_price_cents || 0);
    const demand = parseInt(market.demand_count || 0);
    const supply = parseInt(market.supply_count || 0);

    const dynamicPrice = calculateDynamicPrice(price, demand, supply);
    const tax = calculateTax(dynamicPrice);
    const totalPrice = dynamicPrice + tax;

    res.json({
      status: 'success',
      data: {
        feature: featureName,
        calculation: {
          basePrice: price,
          demandAdjustment: dynamicPrice - price,
          demandCount: demand,
          supplyCount: supply,
          dynamicPrice: dynamicPrice,
          platformTax: tax,
          totalPrice: totalPrice,
          priceChange: price > 0 ? Math.round(((dynamicPrice - price) / price) * 100) : 0
        },
        breakdown: {
          demandMultiplier: `${(DEMAND_MULTIPLIER * 100).toFixed(1)}% per 10 blocked attempts`,
          supplyDiscount: `${(SUPPLY_DISCOUNT * 100).toFixed(1)}% per 10 unlocks`,
          platformTaxRate: `${(PLATFORM_TAX_RATE * 100).toFixed(1)}%`
        }
      }
    });

  } catch (error) {
    console.error('[Marketplace] Price calculation error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to calculate price',
      details: error.message
    });
  }
});

module.exports = { initRoutes };
