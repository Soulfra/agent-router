/**
 * CALOS Pricing Calculator API Routes
 *
 * Endpoints:
 * - POST /api/pricing/calculate - Calculate exact pricing
 * - GET /api/pricing/tiers - Get all tier details
 * - GET /api/pricing/features/:tier - Get tier features
 * - GET /api/pricing/compare - Compare with competitors
 * - POST /api/pricing/calculator-session - Track calculator usage
 */

const express = require('express');
const router = express.Router();
const PricingCalculator = require('../lib/pricing-calculator');

// Initialize pricing calculator
const calculator = new PricingCalculator();

/**
 * POST /api/pricing/calculate
 *
 * Calculate exact pricing based on usage
 *
 * Body:
 * {
 *   "transcripts": 50,
 *   "posTransactions": 500,
 *   "posOnlineTransactions": 100,
 *   "cryptoCharges": 10,
 *   "locations": 3,
 *   "apiRequests": 10000,
 *   "posTransactionAvgAmount": 50,
 *   "cryptoChargeAvgAmount": 100
 * }
 *
 * Response:
 * {
 *   "tier": "pro",
 *   "tierName": "Pro",
 *   "costs": {
 *     "subscription": 29,
 *     "transcripts": 0,
 *     "posInPerson": 700,
 *     "posOnline": 175,
 *     "crypto": 15,
 *     "locations": 0,
 *     "apiRequests": 0
 *   },
 *   "total": 919,
 *   "savings": {
 *     "vsSquare": 48.75,
 *     "vsShopify": 29
 *   },
 *   "breakdown": [...],
 *   "features": {...},
 *   "limits": {...}
 * }
 */
router.post('/calculate', async (req, res) => {
  try {
    const usage = req.body;

    // Validate input
    if (!usage || typeof usage !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid usage data'
      });
    }

    // Calculate pricing
    const result = calculator.calculate(usage);

    // Track calculator session (analytics)
    if (req.db) {
      try {
        await req.db.query(`
          INSERT INTO pricing_calculator_sessions (
            user_id,
            input_data,
            output_data,
            ip_address,
            user_agent,
            referrer
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          req.user?.user_id || null,
          JSON.stringify(usage),
          JSON.stringify(result),
          req.ip,
          req.get('user-agent'),
          req.get('referer')
        ]);
      } catch (error) {
        // Non-critical, don't fail request
        console.error('[Pricing] Failed to track calculator session:', error.message);
      }
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Pricing] Calculate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate pricing'
    });
  }
});

/**
 * GET /api/pricing/tiers
 *
 * Get all tier details
 *
 * Response:
 * {
 *   "success": true,
 *   "tiers": [
 *     {
 *       "tier": "free",
 *       "name": "Free",
 *       "baseCost": 0,
 *       "limits": {...},
 *       "features": {...}
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/tiers', (req, res) => {
  try {
    const tiers = calculator.getTierComparison();

    res.json({
      success: true,
      tiers
    });
  } catch (error) {
    console.error('[Pricing] Get tiers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tier information'
    });
  }
});

/**
 * GET /api/pricing/features/:tier
 *
 * Get features for specific tier
 *
 * Response:
 * {
 *   "success": true,
 *   "tier": "pro",
 *   "features": {
 *     "whiteLabel": true,
 *     "multiDomain": false,
 *     "apiAccess": false,
 *     "prioritySupport": true,
 *     "quickbooksSync": true
 *   },
 *   "limits": {
 *     "transcripts": "Infinity",
 *     "posTransactions": "Infinity",
 *     "cryptoCharges": "Infinity",
 *     "locations": 5,
 *     "apiRequests": 10000
 *   }
 * }
 */
router.get('/features/:tier', (req, res) => {
  try {
    const { tier } = req.params;

    // Validate tier
    const validTiers = ['free', 'community', 'pro', 'enterprise', 'selfHosted'];
    if (!validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier'
      });
    }

    const tierInfo = calculator.tiers[tier];

    if (!tierInfo) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    res.json({
      success: true,
      tier,
      features: tierInfo.features,
      limits: tierInfo.limits
    });
  } catch (error) {
    console.error('[Pricing] Get features error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tier features'
    });
  }
});

/**
 * GET /api/pricing/compare
 *
 * Compare CALOS pricing with competitors
 *
 * Query params:
 * - posTransactions: Number of POS transactions
 * - posTransactionAvgAmount: Average transaction amount
 *
 * Response:
 * {
 *   "success": true,
 *   "calos": {
 *     "total": 744,
 *     "breakdown": {...}
 *   },
 *   "square": {
 *     "total": 700,
 *     "breakdown": {...}
 *   },
 *   "shopify": {
 *     "total": 773,
 *     "breakdown": {...}
 *   },
 *   "savings": {
 *     "vsSquare": 48.75,
 *     "vsShopify": 29
 *   }
 * }
 */
router.get('/compare', (req, res) => {
  try {
    const posTransactions = parseInt(req.query.posTransactions) || 500;
    const posTransactionAvgAmount = parseFloat(req.query.posTransactionAvgAmount) || 50;

    // Calculate CALOS pricing
    const calosResult = calculator.calculate({
      posTransactions,
      posTransactionAvgAmount
    });

    // Calculate Square pricing (2.6% + $0.10)
    const squareTotal = posTransactions * (posTransactionAvgAmount * 0.026 + 0.10);

    // Calculate Shopify pricing ($29/mo + 2.9% + $0.30)
    const shopifyTotal = 29 + posTransactions * (posTransactionAvgAmount * 0.029 + 0.30);

    res.json({
      success: true,
      calos: {
        total: calosResult.total,
        breakdown: calosResult.costs
      },
      square: {
        total: squareTotal,
        breakdown: {
          subscription: 0,
          transactions: squareTotal
        }
      },
      shopify: {
        total: shopifyTotal,
        breakdown: {
          subscription: 29,
          transactions: shopifyTotal - 29
        }
      },
      savings: calosResult.savings
    });
  } catch (error) {
    console.error('[Pricing] Compare error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare pricing'
    });
  }
});

/**
 * POST /api/pricing/calculator-session
 *
 * Track pricing calculator session (for analytics)
 *
 * Body:
 * {
 *   "inputData": {...},
 *   "outputData": {...}
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "sessionId": 123
 * }
 */
router.post('/calculator-session', async (req, res) => {
  try {
    const { inputData, outputData } = req.body;

    if (!inputData || !outputData) {
      return res.status(400).json({
        success: false,
        error: 'Missing input or output data'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const result = await req.db.query(`
      INSERT INTO pricing_calculator_sessions (
        user_id,
        input_data,
        output_data,
        ip_address,
        user_agent,
        referrer
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING session_id
    `, [
      req.user?.user_id || null,
      JSON.stringify(inputData),
      JSON.stringify(outputData),
      req.ip,
      req.get('user-agent'),
      req.get('referer')
    ]);

    res.json({
      success: true,
      sessionId: result.rows[0].session_id
    });
  } catch (error) {
    console.error('[Pricing] Track session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track calculator session'
    });
  }
});

/**
 * GET /api/pricing/usage/:userId
 *
 * Get current usage for user (requires auth)
 *
 * Response:
 * {
 *   "success": true,
 *   "usage": {
 *     "transcripts": 15,
 *     "posTransactions": 250,
 *     "cryptoCharges": 5,
 *     "locations": 2,
 *     "apiRequests": 5000
 *   },
 *   "limits": {
 *     "transcripts": "Infinity",
 *     "posTransactions": "Infinity",
 *     "cryptoCharges": "Infinity",
 *     "locations": 5,
 *     "apiRequests": 10000
 *   },
 *   "overLimit": {
 *     "transcripts": false,
 *     "posTransactions": false,
 *     "cryptoCharges": false,
 *     "locations": false,
 *     "apiRequests": false
 *   }
 * }
 */
router.get('/usage/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Auth check
    if (!req.user || req.user.user_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get user's subscription
    const subResult = await req.db.query(`
      SELECT
        sp.tier_slug,
        sp.current_period_start,
        sp.current_period_end,
        sp.install_id
      FROM subscription_plans sp
      WHERE sp.user_id = $1
        AND sp.status = 'active'
      LIMIT 1
    `, [userId]);

    if (subResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    const subscription = subResult.rows[0];

    // Get current usage
    const usageResult = await req.db.query(`
      SELECT * FROM get_current_usage($1, $2, $3, $4)
    `, [
      userId,
      subscription.install_id,
      subscription.current_period_start,
      subscription.current_period_end
    ]);

    // Get tier limits
    const limitsResult = await req.db.query(`
      SELECT
        limit_transcripts,
        limit_pos_transactions,
        limit_crypto_charges,
        limit_locations,
        limit_api_requests
      FROM license_tiers
      WHERE tier_slug = $1
    `, [subscription.tier_slug]);

    const limits = limitsResult.rows[0];

    // Build usage summary
    const usage = {};
    const overLimit = {};

    usageResult.rows.forEach(row => {
      usage[row.usage_type] = parseInt(row.usage_count);
    });

    // Check over limits
    overLimit.transcripts = limits.limit_transcripts !== null &&
      (usage.transcript || 0) > limits.limit_transcripts;
    overLimit.posTransactions = limits.limit_pos_transactions !== null &&
      ((usage.pos_in_person || 0) + (usage.pos_online || 0)) > limits.limit_pos_transactions;
    overLimit.cryptoCharges = limits.limit_crypto_charges !== null &&
      (usage.crypto || 0) > limits.limit_crypto_charges;
    overLimit.locations = limits.limit_locations !== null &&
      (usage.location || 0) > limits.limit_locations;
    overLimit.apiRequests = limits.limit_api_requests !== null &&
      (usage.api_request || 0) > limits.limit_api_requests;

    res.json({
      success: true,
      usage: {
        transcripts: usage.transcript || 0,
        posTransactions: (usage.pos_in_person || 0) + (usage.pos_online || 0),
        cryptoCharges: usage.crypto || 0,
        locations: usage.location || 0,
        apiRequests: usage.api_request || 0
      },
      limits: {
        transcripts: limits.limit_transcripts || 'Infinity',
        posTransactions: limits.limit_pos_transactions || 'Infinity',
        cryptoCharges: limits.limit_crypto_charges || 'Infinity',
        locations: limits.limit_locations || 'Infinity',
        apiRequests: limits.limit_api_requests || 'Infinity'
      },
      overLimit
    });
  } catch (error) {
    console.error('[Pricing] Get usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage information'
    });
  }
});

/**
 * GET /api/pricing/marketplace-earnings
 *
 * Calculate marketplace creator earnings
 *
 * Query params:
 * - salePrice: Theme/plugin sale price
 *
 * Response:
 * {
 *   "success": true,
 *   "salePrice": 50,
 *   "creatorEarnings": 35,
 *   "platformFee": 15,
 *   "split": "70/30"
 * }
 */
router.get('/marketplace-earnings', (req, res) => {
  try {
    const salePrice = parseFloat(req.query.salePrice) || 0;

    if (salePrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sale price'
      });
    }

    const result = calculator.calculateMarketplaceEarnings(salePrice);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Pricing] Marketplace earnings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate marketplace earnings'
    });
  }
});

module.exports = router;
