/**
 * Subscription Management Routes (Stripe Integration)
 *
 * Handles subscription lifecycle:
 * - View current subscription
 * - Create/upgrade/downgrade subscription
 * - Cancel subscription
 * - View available plans (tiers)
 * - Billing history
 *
 * Uses existing tenant_licenses and platform_tiers tables
 * Integrates with Stripe for payment processing
 */

const express = require('express');
const router = express.Router();

// Database connection (injected via initRoutes)
let db = null;
let stripe = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;

  // Initialize Stripe if API key is configured
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('[Subscriptions] ✓ Stripe client initialized');
  } else {
    console.warn('[Subscriptions] ⚠️  STRIPE_SECRET_KEY not set - subscription management will not work');
  }

  return router;
}

// ============================================================================
// MIDDLEWARE - Require authentication
// ============================================================================

async function requireAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  try {
    const result = await db.query(
      `SELECT u.user_id, u.email, u.tenant_id, t.tenant_name, t.status AS tenant_status
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    req.user = user;
    req.tenantId = user.tenant_id;
    req.userId = userId;

    next();
  } catch (error) {
    console.error('[Subscriptions] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

// ============================================================================
// GET AVAILABLE PLANS
// ============================================================================

/**
 * GET /api/subscriptions/plans
 * List all available subscription tiers/plans
 */
router.get('/plans', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        tier_id,
        tier_code,
        tier_name,
        tier_description,
        base_price_cents,
        tokens_limit,
        rate_limit_per_minute,
        rate_limit_per_hour,
        rate_limit_per_day,
        max_llm_requests_per_day,
        max_team_members,
        credits_included,
        features
      FROM platform_tiers
      WHERE active = TRUE
      ORDER BY
        CASE tier_code
          WHEN 'free' THEN 1
          WHEN 'starter' THEN 2
          WHEN 'pro' THEN 3
          WHEN 'enterprise' THEN 4
        END`
    );

    res.json({
      status: 'success',
      data: {
        plans: result.rows.map(plan => ({
          ...plan,
          base_price_dollars: (plan.base_price_cents / 100).toFixed(2)
        }))
      }
    });

  } catch (error) {
    console.error('[Subscriptions] List plans error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list subscription plans'
    });
  }
});

// ============================================================================
// GET CURRENT SUBSCRIPTION
// ============================================================================

/**
 * GET /api/subscriptions/current
 * Get the tenant's current subscription details
 */
router.get('/current', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        tl.license_id,
        tl.tenant_id,
        tl.tier_id,
        pt.tier_code,
        pt.tier_name,
        pt.tier_description,
        pt.base_price_cents,
        tl.status,
        tl.pricing_model,
        tl.markup_percent,
        tl.tokens_used_this_period,
        tl.tokens_limit,
        tl.cost_this_period_cents,
        tl.cost_limit_cents,
        tl.billing_period_start,
        tl.billing_period_end,
        tl.stripe_subscription_id,
        tl.stripe_customer_id,
        tl.auto_renew,
        tl.created_at,
        tl.updated_at,
        pt.max_team_members,
        pt.credits_included,
        pt.features
      FROM tenant_licenses tl
      JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
      WHERE tl.tenant_id = $1 AND tl.status = 'active'
      LIMIT 1`,
      [req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'No active subscription found'
      });
    }

    const subscription = result.rows[0];

    res.json({
      status: 'success',
      data: {
        subscription: {
          ...subscription,
          base_price_dollars: (subscription.base_price_cents / 100).toFixed(2),
          tokens_used_percent: subscription.tokens_limit
            ? ((subscription.tokens_used_this_period / subscription.tokens_limit) * 100).toFixed(1)
            : null,
          cost_this_period_dollars: (subscription.cost_this_period_cents / 100).toFixed(2),
          cost_limit_dollars: subscription.cost_limit_cents
            ? (subscription.cost_limit_cents / 100).toFixed(2)
            : null
        }
      }
    });

  } catch (error) {
    console.error('[Subscriptions] Get current error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get current subscription'
    });
  }
});

// ============================================================================
// CREATE SUBSCRIPTION
// ============================================================================

/**
 * POST /api/subscriptions/create
 * Create a new subscription (upgrade from free or first subscription)
 */
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { tier_code, payment_method_id } = req.body;

    if (!tier_code) {
      return res.status(400).json({
        status: 'error',
        error: 'tier_code is required'
      });
    }

    // Get the tier details
    const tierResult = await db.query(
      `SELECT * FROM platform_tiers WHERE tier_code = $1 AND active = TRUE`,
      [tier_code]
    );

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Invalid tier code'
      });
    }

    const tier = tierResult.rows[0];

    // Free tier doesn't need Stripe
    if (tier_code === 'free') {
      const result = await db.query(
        `INSERT INTO tenant_licenses (
          tenant_id, tier_id, status, pricing_model, markup_percent,
          tokens_limit, cost_limit_cents, auto_renew,
          billing_period_start, billing_period_end
        )
        VALUES ($1, $2, 'active', 'free', 0, $3, NULL, TRUE, NOW(), NOW() + INTERVAL '1 year')
        ON CONFLICT (tenant_id, tier_id)
        DO UPDATE SET status = 'active', updated_at = NOW()
        RETURNING *`,
        [req.tenantId, tier.tier_id, tier.tokens_limit]
      );

      return res.json({
        status: 'success',
        message: 'Free tier activated',
        data: { license: result.rows[0] }
      });
    }

    // Paid tiers require Stripe
    if (!payment_method_id) {
      return res.status(400).json({
        status: 'error',
        error: 'payment_method_id required for paid tiers'
      });
    }

    // Create or get Stripe customer
    let stripeCustomerId = null;
    const existingLicense = await db.query(
      `SELECT stripe_customer_id FROM tenant_licenses WHERE tenant_id = $1 LIMIT 1`,
      [req.tenantId]
    );

    if (existingLicense.rows.length > 0 && existingLicense.rows[0].stripe_customer_id) {
      stripeCustomerId = existingLicense.rows[0].stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        payment_method: payment_method_id,
        invoice_settings: {
          default_payment_method: payment_method_id
        },
        metadata: {
          tenant_id: req.tenantId,
          user_id: req.userId
        }
      });
      stripeCustomerId = customer.id;
    }

    // Create Stripe subscription
    // Note: You'll need to create Stripe Price IDs for each tier
    const priceId = process.env[`STRIPE_PRICE_${tier_code.toUpperCase()}`];

    if (!priceId) {
      return res.status(500).json({
        status: 'error',
        error: `Stripe Price ID not configured for ${tier_code} tier. Set STRIPE_PRICE_${tier_code.toUpperCase()} in .env`
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      metadata: {
        tenant_id: req.tenantId,
        tier_code: tier_code
      }
    });

    // Store in database
    const result = await db.query(
      `INSERT INTO tenant_licenses (
        tenant_id, tier_id, status, pricing_model, markup_percent,
        tokens_limit, cost_limit_cents, auto_renew,
        billing_period_start, billing_period_end,
        stripe_subscription_id, stripe_customer_id
      )
      VALUES ($1, $2, 'active', 'metered', $3, $4, $5, TRUE, NOW(), NOW() + INTERVAL '1 month', $6, $7)
      ON CONFLICT (tenant_id, tier_id)
      DO UPDATE SET
        status = 'active',
        stripe_subscription_id = $6,
        stripe_customer_id = $7,
        updated_at = NOW()
      RETURNING *`,
      [
        req.tenantId,
        tier.tier_id,
        20, // Default 20% markup
        tier.tokens_limit,
        tier.cost_limit_cents,
        subscription.id,
        stripeCustomerId
      ]
    );

    res.json({
      status: 'success',
      message: `${tier.tier_name} subscription activated`,
      data: {
        license: result.rows[0],
        stripe_subscription: {
          id: subscription.id,
          status: subscription.status,
          current_period_end: subscription.current_period_end
        }
      }
    });

    console.log(`[Subscriptions] Created ${tier_code} subscription for tenant ${req.tenantId}`);

  } catch (error) {
    console.error('[Subscriptions] Create error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to create subscription'
    });
  }
});

// ============================================================================
// UPGRADE/DOWNGRADE SUBSCRIPTION
// ============================================================================

/**
 * POST /api/subscriptions/upgrade
 * Change subscription tier (upgrade or downgrade)
 */
router.post('/upgrade', requireAuth, async (req, res) => {
  try {
    const { new_tier_code } = req.body;

    if (!new_tier_code) {
      return res.status(400).json({
        status: 'error',
        error: 'new_tier_code is required'
      });
    }

    // Get current subscription
    const currentResult = await db.query(
      `SELECT tl.*, pt.tier_code as current_tier_code
       FROM tenant_licenses tl
       JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
       WHERE tl.tenant_id = $1 AND tl.status = 'active'`,
      [req.tenantId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'No active subscription found'
      });
    }

    const currentLicense = currentResult.rows[0];

    // Get new tier
    const newTierResult = await db.query(
      `SELECT * FROM platform_tiers WHERE tier_code = $1 AND active = TRUE`,
      [new_tier_code]
    );

    if (newTierResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Invalid tier code'
      });
    }

    const newTier = newTierResult.rows[0];

    // Can't "upgrade" to free
    if (new_tier_code === 'free') {
      return res.status(400).json({
        status: 'error',
        error: 'Use /api/subscriptions/cancel to downgrade to free tier'
      });
    }

    // Update Stripe subscription if exists
    if (currentLicense.stripe_subscription_id) {
      const newPriceId = process.env[`STRIPE_PRICE_${new_tier_code.toUpperCase()}`];

      if (!newPriceId) {
        return res.status(500).json({
          status: 'error',
          error: `Stripe Price ID not configured for ${new_tier_code} tier`
        });
      }

      // Update Stripe subscription
      const subscription = await stripe.subscriptions.retrieve(currentLicense.stripe_subscription_id);
      await stripe.subscriptions.update(currentLicense.stripe_subscription_id, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId
        }],
        proration_behavior: 'always_invoice', // Charge immediately for upgrade
        metadata: {
          tenant_id: req.tenantId,
          tier_code: new_tier_code
        }
      });
    }

    // Update database
    await db.query(
      `UPDATE tenant_licenses
       SET tier_id = $1, tokens_limit = $2, updated_at = NOW()
       WHERE tenant_id = $3`,
      [newTier.tier_id, newTier.tokens_limit, req.tenantId]
    );

    res.json({
      status: 'success',
      message: `Subscription upgraded to ${newTier.tier_name}`,
      data: {
        old_tier: currentLicense.current_tier_code,
        new_tier: new_tier_code
      }
    });

    console.log(`[Subscriptions] Upgraded tenant ${req.tenantId} from ${currentLicense.current_tier_code} to ${new_tier_code}`);

  } catch (error) {
    console.error('[Subscriptions] Upgrade error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to upgrade subscription'
    });
  }
});

// ============================================================================
// CANCEL SUBSCRIPTION
// ============================================================================

/**
 * POST /api/subscriptions/cancel
 * Cancel current subscription (downgrade to free at end of billing period)
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { immediate = false } = req.body;

    // Get current subscription
    const result = await db.query(
      `SELECT tl.*, pt.tier_code
       FROM tenant_licenses tl
       JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
       WHERE tl.tenant_id = $1 AND tl.status = 'active'`,
      [req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'No active subscription found'
      });
    }

    const license = result.rows[0];

    // If already on free tier
    if (license.tier_code === 'free') {
      return res.status(400).json({
        status: 'error',
        error: 'Already on free tier'
      });
    }

    // Cancel Stripe subscription
    if (license.stripe_subscription_id) {
      await stripe.subscriptions.update(license.stripe_subscription_id, {
        cancel_at_period_end: !immediate
      });

      if (immediate) {
        await stripe.subscriptions.cancel(license.stripe_subscription_id);
      }
    }

    // Update database
    if (immediate) {
      // Immediately switch to free tier
      const freeTier = await db.query(
        `SELECT * FROM platform_tiers WHERE tier_code = 'free'`
      );

      await db.query(
        `UPDATE tenant_licenses
         SET tier_id = $1, status = 'cancelled', auto_renew = FALSE, updated_at = NOW()
         WHERE tenant_id = $2`,
        [freeTier.rows[0].tier_id, req.tenantId]
      );
    } else {
      // Mark for cancellation at period end
      await db.query(
        `UPDATE tenant_licenses
         SET auto_renew = FALSE, updated_at = NOW()
         WHERE tenant_id = $1`,
        [req.tenantId]
      );
    }

    res.json({
      status: 'success',
      message: immediate
        ? 'Subscription cancelled immediately. Downgraded to free tier.'
        : 'Subscription will cancel at end of billing period.',
      data: {
        cancelled_tier: license.tier_code,
        immediate: immediate,
        billing_period_end: license.billing_period_end
      }
    });

    console.log(`[Subscriptions] Cancelled subscription for tenant ${req.tenantId} (immediate: ${immediate})`);

  } catch (error) {
    console.error('[Subscriptions] Cancel error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to cancel subscription'
    });
  }
});

// ============================================================================
// BILLING HISTORY
// ============================================================================

/**
 * GET /api/subscriptions/billing-history
 * Get billing history for the tenant
 */
router.get('/billing-history', requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT
        log_id,
        event_type,
        provider,
        model_used,
        tokens_input,
        tokens_output,
        tokens_total,
        provider_cost_cents,
        markup_cost_cents,
        total_cost_cents,
        created_at
      FROM llm_usage_log
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [req.tenantId, limit, offset]
    );

    // Calculate totals
    const totalsResult = await db.query(
      `SELECT
        COUNT(*) as total_requests,
        SUM(tokens_total) as total_tokens,
        SUM(total_cost_cents) as total_cost_cents
      FROM llm_usage_log
      WHERE tenant_id = $1`,
      [req.tenantId]
    );

    res.json({
      status: 'success',
      data: {
        history: result.rows.map(row => ({
          ...row,
          provider_cost_dollars: (row.provider_cost_cents / 100).toFixed(4),
          markup_cost_dollars: (row.markup_cost_cents / 100).toFixed(4),
          total_cost_dollars: (row.total_cost_cents / 100).toFixed(4)
        })),
        totals: {
          total_requests: parseInt(totalsResult.rows[0].total_requests || 0),
          total_tokens: parseInt(totalsResult.rows[0].total_tokens || 0),
          total_cost_dollars: ((totalsResult.rows[0].total_cost_cents || 0) / 100).toFixed(2)
        },
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });

  } catch (error) {
    console.error('[Subscriptions] Billing history error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get billing history'
    });
  }
});

// ============================================================================
// USAGE STATS
// ============================================================================

/**
 * GET /api/subscriptions/usage
 * Get current usage statistics
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        tokens_used_this_period,
        tokens_limit,
        cost_this_period_cents,
        cost_limit_cents,
        billing_period_start,
        billing_period_end
      FROM tenant_licenses
      WHERE tenant_id = $1 AND status = 'active'`,
      [req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'No active subscription found'
      });
    }

    const usage = result.rows[0];

    res.json({
      status: 'success',
      data: {
        usage: {
          ...usage,
          tokens_used_percent: usage.tokens_limit
            ? ((usage.tokens_used_this_period / usage.tokens_limit) * 100).toFixed(1)
            : null,
          tokens_remaining: usage.tokens_limit
            ? usage.tokens_limit - usage.tokens_used_this_period
            : null,
          cost_this_period_dollars: (usage.cost_this_period_cents / 100).toFixed(2),
          cost_limit_dollars: usage.cost_limit_cents
            ? (usage.cost_limit_cents / 100).toFixed(2)
            : null
        }
      }
    });

  } catch (error) {
    console.error('[Subscriptions] Usage stats error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get usage statistics'
    });
  }
});

module.exports = { initRoutes };
