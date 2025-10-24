/**
 * CALOS License Verification Routes
 *
 * Endpoints:
 * - POST /api/license/verify - Verify license (called by LicenseVerifier)
 * - GET /api/license/info/:domain - Get license info for domain
 * - POST /api/license/activate - Activate new license
 * - GET /api/license/features - Get current tier features
 * - GET /api/license/status - Get license status for current request
 */

const express = require('express');
const router = express.Router();
const LicenseVerifier = require('../lib/license-verifier');

/**
 * POST /api/license/verify
 *
 * Verify license for domain (called by license-verifier.js)
 *
 * Body:
 * {
 *   "hostname": "example.com",
 *   "installId": "abc123...",
 *   "routes": ["/api/custom-endpoint"],
 *   "themes": [{...}],
 *   "stats": {...},
 *   "telemetry": {...}
 * }
 *
 * Response:
 * {
 *   "valid": true,
 *   "tier": "pro",
 *   "tierName": "Pro",
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
 *   },
 *   "message": "License verified successfully",
 *   "verificationInterval": 168 // hours
 * }
 */
router.post('/verify', async (req, res) => {
  try {
    const { hostname, installId, routes, themes, stats, telemetry } = req.body;

    // Validation
    if (!hostname || !installId) {
      return res.status(400).json({
        valid: false,
        error: 'Missing hostname or installId'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        valid: false,
        error: 'Database not available'
      });
    }

    // Find subscription by install ID
    const result = await req.db.query(`
      SELECT
        sp.subscription_id,
        sp.user_id,
        sp.tier_slug,
        sp.status,
        sp.trial_ends_at,
        sp.current_period_start,
        sp.current_period_end,
        lt.tier_name,
        lt.verification_interval_hours,
        lt.features,
        lt.limit_transcripts,
        lt.limit_pos_transactions,
        lt.limit_crypto_charges,
        lt.limit_locations,
        lt.limit_api_requests
      FROM subscription_plans sp
      JOIN license_tiers lt ON sp.tier_slug = lt.tier_slug
      WHERE sp.install_id = $1
        AND sp.status IN ('active', 'trial')
      LIMIT 1
    `, [installId]);

    if (result.rows.length === 0) {
      // No subscription found - default to Community tier
      const communityTier = await req.db.query(`
        SELECT * FROM license_tiers WHERE tier_slug = 'community'
      `);

      const tier = communityTier.rows[0];

      return res.json({
        valid: true,
        tier: 'community',
        tierName: 'Community',
        features: tier.features,
        limits: {
          transcripts: tier.limit_transcripts,
          posTransactions: tier.limit_pos_transactions,
          cryptoCharges: tier.limit_crypto_charges,
          locations: tier.limit_locations,
          apiRequests: tier.limit_api_requests
        },
        message: 'No subscription found - defaulting to Community tier',
        verificationInterval: tier.verification_interval_hours,
        requiresUpgrade: true
      });
    }

    const subscription = result.rows[0];

    // Check if trial expired
    if (subscription.status === 'trial' && subscription.trial_ends_at) {
      const now = new Date();
      const trialEnd = new Date(subscription.trial_ends_at);
      if (now > trialEnd) {
        // Trial expired - downgrade to Community
        await req.db.query(`
          UPDATE subscription_plans
          SET status = 'canceled', tier_slug = 'community'
          WHERE subscription_id = $1
        `, [subscription.subscription_id]);

        return res.json({
          valid: true,
          tier: 'community',
          tierName: 'Community',
          message: 'Trial expired - downgraded to Community tier',
          warning: 'Your trial has expired. Please upgrade to continue using Pro features.',
          verificationInterval: 24
        });
      }
    }

    // Check if subscription is past_due
    if (subscription.status === 'past_due') {
      return res.json({
        valid: true,
        tier: subscription.tier_slug,
        tierName: subscription.tier_name,
        features: subscription.features,
        limits: {
          transcripts: subscription.limit_transcripts || 'Infinity',
          posTransactions: subscription.limit_pos_transactions || 'Infinity',
          cryptoCharges: subscription.limit_crypto_charges || 'Infinity',
          locations: subscription.limit_locations || 'Infinity',
          apiRequests: subscription.limit_api_requests || 'Infinity'
        },
        message: 'Subscription past due',
        warning: 'Your payment is past due. Please update your payment method to avoid service interruption.',
        verificationInterval: subscription.verification_interval_hours
      });
    }

    // Store telemetry data (if provided)
    if (telemetry && Object.keys(telemetry).length > 0) {
      try {
        // Store in telemetry_events table (from migration 081)
        await req.db.query(`
          INSERT INTO telemetry_events (
            install_id,
            event_type,
            event_data
          ) VALUES ($1, $2, $3)
        `, [
          installId,
          'license_verification',
          JSON.stringify(telemetry)
        ]);
      } catch (error) {
        console.error('[License] Failed to store telemetry:', error.message);
        // Non-critical, continue
      }
    }

    // Success - return license info
    res.json({
      valid: true,
      tier: subscription.tier_slug,
      tierName: subscription.tier_name,
      features: subscription.features,
      limits: {
        transcripts: subscription.limit_transcripts || 'Infinity',
        posTransactions: subscription.limit_pos_transactions || 'Infinity',
        cryptoCharges: subscription.limit_crypto_charges || 'Infinity',
        locations: subscription.limit_locations || 'Infinity',
        apiRequests: subscription.limit_api_requests || 'Infinity'
      },
      message: 'License verified successfully',
      verificationInterval: subscription.verification_interval_hours,
      periodEnd: subscription.current_period_end
    });
  } catch (error) {
    console.error('[License] Verify error:', error);
    res.status(500).json({
      valid: false,
      error: 'License verification failed'
    });
  }
});

/**
 * GET /api/license/info/:domain
 *
 * Get license info for specific domain
 *
 * Response:
 * {
 *   "success": true,
 *   "hostname": "example.com",
 *   "tier": "pro",
 *   "valid": true,
 *   "status": "valid",
 *   "cachedAt": "2024-10-22T12:00:00Z",
 *   "features": {...},
 *   "message": "License valid"
 * }
 */
router.get('/info/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    if (!req.licenseVerifier) {
      return res.status(500).json({
        success: false,
        error: 'License verifier not initialized'
      });
    }

    const info = await req.licenseVerifier.getLicenseInfo(domain);

    res.json({
      success: true,
      ...info
    });
  } catch (error) {
    console.error('[License] Get info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get license information'
    });
  }
});

/**
 * POST /api/license/activate
 *
 * Activate new license (creates subscription)
 *
 * Body:
 * {
 *   "userId": 123,
 *   "tier": "pro",
 *   "billingPeriod": "monthly",
 *   "stripeCustomerId": "cus_...",
 *   "stripeSubscriptionId": "sub_..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "subscriptionId": 456,
 *   "installId": "abc123...",
 *   "tier": "pro",
 *   "message": "License activated successfully"
 * }
 */
router.post('/activate', async (req, res) => {
  try {
    const {
      userId,
      tier,
      billingPeriod,
      stripeCustomerId,
      stripeSubscriptionId
    } = req.body;

    // Validation
    if (!userId || !tier) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or tier'
      });
    }

    const validTiers = ['community', 'pro', 'enterprise', 'self_hosted'];
    if (!validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Generate install ID
    const crypto = require('crypto');
    const installId = crypto.randomBytes(16).toString('hex');

    // Get tier ID
    const tierResult = await req.db.query(`
      SELECT tier_id FROM license_tiers WHERE tier_slug = $1
    `, [tier]);

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    const tierId = tierResult.rows[0].tier_id;

    // Calculate billing period end
    const now = new Date();
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
        stripe_customer_id,
        stripe_subscription_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING subscription_id
    `, [
      userId,
      installId,
      tierId,
      tier,
      billingPeriod || 'monthly',
      'active',
      now,
      periodEnd,
      stripeCustomerId,
      stripeSubscriptionId
    ]);

    const subscriptionId = result.rows[0].subscription_id;

    res.json({
      success: true,
      subscriptionId,
      installId,
      tier,
      message: 'License activated successfully'
    });
  } catch (error) {
    console.error('[License] Activate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate license'
    });
  }
});

/**
 * GET /api/license/features
 *
 * Get current tier features (from request context)
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
 *   }
 * }
 */
router.get('/features', (req, res) => {
  try {
    // License middleware should have attached req.license
    if (!req.license) {
      return res.status(404).json({
        success: false,
        error: 'License information not available'
      });
    }

    res.json({
      success: true,
      tier: req.license.tier,
      features: req.license.features || {}
    });
  } catch (error) {
    console.error('[License] Get features error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get features'
    });
  }
});

/**
 * GET /api/license/status
 *
 * Get license status for current request
 *
 * Response:
 * {
 *   "success": true,
 *   "valid": true,
 *   "tier": "pro",
 *   "hostname": "example.com",
 *   "requiresVerification": false,
 *   "message": "License valid",
 *   "warning": null
 * }
 */
router.get('/status', (req, res) => {
  try {
    // License middleware should have attached req.license
    if (!req.license) {
      return res.status(404).json({
        success: false,
        error: 'License information not available'
      });
    }

    res.json({
      success: true,
      ...req.license
    });
  } catch (error) {
    console.error('[License] Get status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get license status'
    });
  }
});

/**
 * POST /api/license/check-limits
 *
 * Check if user is over tier limits
 *
 * Body:
 * {
 *   "userId": 123,
 *   "installId": "abc123..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "overLimit": {
 *     "transcripts": false,
 *     "posTransactions": false,
 *     "cryptoCharges": false,
 *     "locations": true,
 *     "apiRequests": false
 *   },
 *   "usage": {...},
 *   "limits": {...}
 * }
 */
router.post('/check-limits', async (req, res) => {
  try {
    const { userId, installId } = req.body;

    if (!userId || !installId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or installId'
      });
    }

    if (!req.db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get user's tier
    const tierResult = await req.db.query(`
      SELECT tier_slug FROM subscription_plans
      WHERE user_id = $1 AND install_id = $2
      LIMIT 1
    `, [userId, installId]);

    if (tierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    const tierSlug = tierResult.rows[0].tier_slug;

    // Check limits
    const result = await req.db.query(`
      SELECT * FROM check_usage_limits($1, $2, $3)
    `, [userId, installId, tierSlug]);

    const overLimit = {};
    const usage = {};
    const limits = {};

    result.rows.forEach(row => {
      overLimit[row.usage_type] = row.over_limit;
      usage[row.usage_type] = parseInt(row.current_usage);
      limits[row.usage_type] = row.limit_value || 'Infinity';
    });

    res.json({
      success: true,
      overLimit,
      usage,
      limits
    });
  } catch (error) {
    console.error('[License] Check limits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check usage limits'
    });
  }
});

module.exports = router;
