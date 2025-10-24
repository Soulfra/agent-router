/**
 * CALOS Enterprise Management Routes
 *
 * Admin-only routes for managing enterprise customers
 *
 * Endpoints:
 * - GET /api/enterprise/customers - List all customers
 * - GET /api/enterprise/stats - Get enterprise stats
 * - POST /api/enterprise/create-license - Create new license
 * - POST /api/enterprise/revoke-license - Revoke license
 * - GET /api/enterprise/customer/:installId/profile - Get customer profile
 * - GET /api/enterprise/customer/:installId/culture - Get culture analysis
 * - GET /api/enterprise/customer/:installId/usage - Get usage details
 * - POST /api/enterprise/customer/:installId/update-tier - Update tier
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * Admin authentication middleware
 *
 * TODO: Replace with actual admin authentication
 */
function requireAdmin(req, res, next) {
  // For now, just check if user exists
  // TODO: Add proper admin role checking
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // TODO: Check if user has admin role
  // if (!req.user.is_admin) {
  //   return res.status(403).json({
  //     success: false,
  //     error: 'Admin access required'
  //   });
  // }

  next();
}

/**
 * GET /api/enterprise/stats
 *
 * Get enterprise dashboard stats
 *
 * Response:
 * {
 *   "success": true,
 *   "stats": {
 *     "totalCustomers": 42,
 *     "activeLicenses": 35,
 *     "monthlyRevenue": 12450,
 *     "trialConversion": 67
 *   }
 * }
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Total customers
    const totalResult = await req.db.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM subscription_plans
    `);

    // Active licenses
    const activeResult = await req.db.query(`
      SELECT COUNT(*) as count
      FROM subscription_plans
      WHERE status IN ('active', 'trial')
    `);

    // Calculate monthly revenue
    const revenueResult = await req.db.query(`
      SELECT
        sp.tier_slug,
        sp.billing_period,
        COUNT(*) as count
      FROM subscription_plans sp
      WHERE sp.status IN ('active', 'trial')
      GROUP BY sp.tier_slug, sp.billing_period
    `);

    let monthlyRevenue = 0;
    revenueResult.rows.forEach(row => {
      const basePrices = {
        community: 0,
        pro: { monthly: 49, annual: 39 },
        enterprise: { monthly: 299, annual: 249 }
      };

      const price = basePrices[row.tier_slug];
      if (price && typeof price === 'object') {
        monthlyRevenue += price[row.billing_period] * parseInt(row.count);
      }
    });

    // Trial conversion rate
    const conversionResult = await req.db.query(`
      SELECT
        COUNT(CASE WHEN status = 'active' AND trial_ends_at IS NOT NULL THEN 1 END) as converted,
        COUNT(CASE WHEN status = 'trial' THEN 1 END) as trials
      FROM subscription_plans
      WHERE created_at >= NOW() - INTERVAL '90 days'
    `);

    const converted = parseInt(conversionResult.rows[0].converted) || 0;
    const trials = parseInt(conversionResult.rows[0].trials) || 0;
    const trialConversion = trials > 0 ? Math.round((converted / (converted + trials)) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalCustomers: parseInt(totalResult.rows[0].count),
        activeLicenses: parseInt(activeResult.rows[0].count),
        monthlyRevenue,
        trialConversion
      }
    });
  } catch (error) {
    console.error('[Enterprise] Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

/**
 * GET /api/enterprise/customers
 *
 * List all customers with their subscriptions
 *
 * Query params:
 *   ?status=active (filter by status)
 *   ?tier=pro (filter by tier)
 *   ?limit=50
 *   ?offset=0
 *
 * Response:
 * {
 *   "success": true,
 *   "customers": [...]
 * }
 */
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { status, tier, limit = 100, offset = 0 } = req.query;

    // Build query
    let query = `
      SELECT
        sp.subscription_id,
        sp.user_id,
        sp.install_id,
        sp.tier_slug,
        sp.billing_period,
        sp.status,
        sp.current_period_start,
        sp.current_period_end,
        sp.trial_ends_at,
        sp.created_at,
        sp.updated_at,
        u.email,
        u.username,
        lt.tier_name,
        lt.base_price_monthly,
        lt.base_price_annual
      FROM subscription_plans sp
      LEFT JOIN users u ON sp.user_id = u.user_id
      LEFT JOIN license_tiers lt ON sp.tier_slug = lt.tier_slug
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND sp.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (tier) {
      query += ` AND sp.tier_slug = $${paramCount}`;
      params.push(tier);
      paramCount++;
    }

    query += ` ORDER BY sp.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await req.db.query(query, params);

    // Get usage for each customer (simplified - just counts)
    const customers = await Promise.all(result.rows.map(async (row) => {
      // Get basic usage counts
      const usageResult = await req.db.query(`
        SELECT
          usage_type,
          COUNT(*) as count
        FROM usage_tracking
        WHERE user_id = $1 AND install_id = $2
          AND created_at >= $3 AND created_at <= $4
        GROUP BY usage_type
      `, [row.user_id, row.install_id, row.current_period_start, row.current_period_end]);

      const usage = {};
      usageResult.rows.forEach(u => {
        usage[u.usage_type] = parseInt(u.count);
      });

      // Get domain (from branding or telemetry)
      const domainResult = await req.db.query(`
        SELECT domain FROM brand_configs WHERE install_id = $1 LIMIT 1
      `, [row.install_id]);

      const domain = domainResult.rows.length > 0 ? domainResult.rows[0].domain : null;

      return {
        ...row,
        usage,
        domain
      };
    }));

    res.json({
      success: true,
      customers
    });
  } catch (error) {
    console.error('[Enterprise] Get customers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customers'
    });
  }
});

/**
 * POST /api/enterprise/create-license
 *
 * Create new enterprise license
 *
 * Body:
 * {
 *   "userId": 123,
 *   "tier": "pro",
 *   "billingPeriod": "monthly",
 *   "trialDays": 14,
 *   "notes": "Custom deal"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "installId": "abc123...",
 *   "subscriptionId": 456
 * }
 */
router.post('/create-license', requireAdmin, async (req, res) => {
  try {
    const { userId, tier, billingPeriod, trialDays, notes } = req.body;

    if (!userId || !tier) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, tier'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get tier details
    const tierResult = await req.db.query(`
      SELECT * FROM license_tiers WHERE tier_slug = $1
    `, [tier]);

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    const tierData = tierResult.rows[0];

    // Generate install ID
    const installId = crypto.randomBytes(16).toString('hex');

    // Calculate trial end
    const now = new Date();
    const trialEnd = trialDays > 0
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    // Calculate period end
    const periodEnd = new Date(now);
    if (billingPeriod === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Create subscription
    const result = await req.db.query(`
      INSERT INTO subscription_plans (
        user_id,
        install_id,
        tier_id,
        tier_slug,
        billing_period,
        status,
        current_period_start,
        current_period_end,
        trial_ends_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING subscription_id
    `, [
      userId,
      installId,
      tierData.tier_id,
      tier,
      billingPeriod || 'monthly',
      trialDays > 0 ? 'trial' : 'active',
      now,
      periodEnd,
      trialEnd
    ]);

    const subscriptionId = result.rows[0].subscription_id;

    // Store notes if provided
    if (notes) {
      // TODO: Add notes table or metadata field
      console.log(`[Enterprise] Notes for ${installId}: ${notes}`);
    }

    res.json({
      success: true,
      installId,
      subscriptionId,
      trialEndsAt: trialEnd,
      periodEndsAt: periodEnd
    });
  } catch (error) {
    console.error('[Enterprise] Create license error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create license'
    });
  }
});

/**
 * POST /api/enterprise/revoke-license
 *
 * Revoke customer license
 *
 * Body:
 * {
 *   "installId": "abc123..."
 * }
 *
 * Response:
 * {
 *   "success": true
 * }
 */
router.post('/revoke-license', requireAdmin, async (req, res) => {
  try {
    const { installId } = req.body;

    if (!installId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: installId'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Update subscription status
    const result = await req.db.query(`
      UPDATE subscription_plans
      SET status = 'canceled', updated_at = NOW()
      WHERE install_id = $1
      RETURNING subscription_id
    `, [installId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'License not found'
      });
    }

    res.json({
      success: true,
      message: 'License revoked successfully'
    });
  } catch (error) {
    console.error('[Enterprise] Revoke license error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke license'
    });
  }
});

/**
 * GET /api/enterprise/customer/:installId/profile
 *
 * Get full customer profile
 *
 * Response:
 * {
 *   "success": true,
 *   "profile": {
 *     "subscription": {...},
 *     "user": {...},
 *     "usage": {...},
 *     "telemetry": {...}
 *   }
 * }
 */
router.get('/customer/:installId/profile', requireAdmin, async (req, res) => {
  try {
    const { installId } = req.params;

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get subscription
    const subResult = await req.db.query(`
      SELECT
        sp.*,
        u.email,
        u.username,
        lt.tier_name,
        lt.features
      FROM subscription_plans sp
      LEFT JOIN users u ON sp.user_id = u.user_id
      LEFT JOIN license_tiers lt ON sp.tier_slug = lt.tier_slug
      WHERE sp.install_id = $1
      LIMIT 1
    `, [installId]);

    if (subResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const subscription = subResult.rows[0];

    // Get usage
    const usageResult = await req.db.query(`
      SELECT
        usage_type,
        COUNT(*) as count,
        SUM(usage_count) as total_count
      FROM usage_tracking
      WHERE install_id = $1
        AND created_at >= $2
      GROUP BY usage_type
    `, [installId, subscription.current_period_start]);

    const usage = {};
    usageResult.rows.forEach(row => {
      usage[row.usage_type] = parseInt(row.total_count);
    });

    // Get telemetry summary
    const telemetryResult = await req.db.query(`
      SELECT
        event_type,
        COUNT(*) as count
      FROM telemetry_events
      WHERE install_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `, [installId]);

    const telemetry = {};
    telemetryResult.rows.forEach(row => {
      telemetry[row.event_type] = parseInt(row.count);
    });

    // Get branding
    const brandResult = await req.db.query(`
      SELECT * FROM brand_configs WHERE install_id = $1 LIMIT 1
    `, [installId]);

    const branding = brandResult.rows.length > 0 ? brandResult.rows[0] : null;

    res.json({
      success: true,
      profile: {
        subscription,
        usage,
        telemetry,
        branding
      }
    });
  } catch (error) {
    console.error('[Enterprise] Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer profile'
    });
  }
});

/**
 * GET /api/enterprise/customer/:installId/culture
 *
 * Get culture analysis for customer
 *
 * Response:
 * {
 *   "success": true,
 *   "culture": {...}
 * }
 */
router.get('/customer/:installId/culture', requireAdmin, async (req, res) => {
  try {
    const { installId } = req.params;

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get culture analyzer
    const CultureAnalyzer = require('../lib/culture-analyzer');
    const analyzer = new CultureAnalyzer({ db: req.db });

    const culture = await analyzer.analyze(installId);

    res.json({
      success: true,
      culture
    });
  } catch (error) {
    console.error('[Enterprise] Get culture error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze culture'
    });
  }
});

/**
 * POST /api/enterprise/customer/:installId/update-tier
 *
 * Update customer tier
 *
 * Body:
 * {
 *   "newTier": "enterprise",
 *   "billingPeriod": "annual"
 * }
 *
 * Response:
 * {
 *   "success": true
 * }
 */
router.post('/customer/:installId/update-tier', requireAdmin, async (req, res) => {
  try {
    const { installId } = req.params;
    const { newTier, billingPeriod } = req.body;

    if (!newTier) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: newTier'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get tier details
    const tierResult = await req.db.query(`
      SELECT * FROM license_tiers WHERE tier_slug = $1
    `, [newTier]);

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    const tierData = tierResult.rows[0];

    // Update subscription
    await req.db.query(`
      UPDATE subscription_plans
      SET
        tier_id = $1,
        tier_slug = $2,
        billing_period = $3,
        updated_at = NOW()
      WHERE install_id = $4
    `, [
      tierData.tier_id,
      newTier,
      billingPeriod || 'monthly',
      installId
    ]);

    res.json({
      success: true,
      message: 'Tier updated successfully'
    });
  } catch (error) {
    console.error('[Enterprise] Update tier error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tier'
    });
  }
});

module.exports = router;
