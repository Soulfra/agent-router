/**
 * Auto-Provisioning Routes
 *
 * Handles automatic account setup for new users.
 * Similar to Stripe/Vercel/Railway - generates test keys with free credits.
 *
 * Flow:
 * 1. User runs `npm install @calos/sdk` → postinstall hook → CLI init
 * 2. CLI calls POST /api/provision/init with email
 * 3. Backend creates tenant + user + API key + voucher + auto-redeems
 * 4. Returns test key (sk-tenant-xxx) with $0.05 free credits (~50 calls)
 * 5. User can start testing immediately
 */

const express = require('express');
const router = express.Router();

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  return router;
}

// ============================================================================
// AUTO-PROVISION NEW ACCOUNT
// ============================================================================

/**
 * POST /api/provision/init
 * Auto-provision a new test account with free credits
 *
 * Body:
 * {
 *   "email": "dev@example.com",
 *   "name": "Developer Name",
 *   "organization": "My Company",
 *   "source": "npm-install" | "cli" | "web"
 * }
 *
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "tenant_id": "uuid",
 *     "user_id": "uuid",
 *     "api_key": "sk-tenant-xxxxxxxxxxxxx",
 *     "credits_cents": 5,
 *     "credits_dollars": "0.05",
 *     "message": "Your test account is ready! $0.05 in free credits (~50 API calls)"
 *   }
 * }
 */
router.post('/init', async (req, res) => {
  const client = await db.connect();

  try {
    const {
      email,
      name = 'Developer',
      organization = 'My Organization',
      source = 'unknown'
    } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        status: 'error',
        error: 'Email required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid email format'
      });
    }

    await client.query('BEGIN');

    // Check if user already exists
    const existingUser = await client.query(
      `SELECT u.user_id, u.tenant_id, t.tenant_name
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.email = $1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');

      // Return existing account info
      const user = existingUser.rows[0];

      // Get existing API key
      const keyResult = await client.query(
        `SELECT key_id, key_prefix, masked_key, status, created_at
         FROM tenant_api_keys
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.tenant_id]
      );

      if (keyResult.rows.length === 0) {
        return res.status(400).json({
          status: 'error',
          error: 'Account exists but no API key found. Please log in to generate a key.',
          data: {
            tenant_id: user.tenant_id,
            user_id: user.user_id,
            tenant_name: user.tenant_name
          }
        });
      }

      return res.json({
        status: 'success',
        message: 'Account already exists',
        data: {
          tenant_id: user.tenant_id,
          user_id: user.user_id,
          tenant_name: user.tenant_name,
          api_key_prefix: keyResult.rows[0].key_prefix,
          created_at: keyResult.rows[0].created_at,
          note: 'Your full API key was shown during initial setup. Check your local config or generate a new key via the dashboard.'
        }
      });
    }

    // 1. Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (tenant_name, subscription_tier)
       VALUES ($1, $2)
       RETURNING tenant_id, tenant_name`,
      [organization, 'free']
    );

    const tenantId = tenantResult.rows[0].tenant_id;
    const tenantName = tenantResult.rows[0].tenant_name;

    console.log(`[Provision] Created tenant: ${tenantName} (${tenantId})`);

    // 2. Create user
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, username, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, email, username`,
      [tenantId, email, name, 'owner']
    );

    const userId = userResult.rows[0].user_id;

    console.log(`[Provision] Created user: ${email} (${userId})`);

    // 3. Initialize user credits (starts at 0)
    await client.query(
      `INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
       VALUES ($1, 0, 0, NOW())`,
      [userId]
    );

    // 4. Generate API key
    const crypto = require('crypto');
    const apiKey = 'sk-tenant-' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = apiKey.substring(0, 14);
    const maskedKey = keyPrefix + '...' + apiKey.substring(apiKey.length - 4);

    const keyResult = await client.query(
      `INSERT INTO tenant_api_keys (
        tenant_id, key_name, key_hash, key_prefix, masked_key, status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING key_id`,
      [tenantId, 'Test Key (Auto-generated)', keyHash, keyPrefix, maskedKey, 'active']
    );

    console.log(`[Provision] Generated API key: ${maskedKey}`);

    // 5. Generate and redeem $0.05 welcome voucher
    const voucherCode = `WELCOME-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const welcomeCents = 5; // $0.05

    await client.query(
      `INSERT INTO vouchers (
        code, value_cents, original_value_cents, voucher_type, description,
        campaign_name, max_redemptions, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        voucherCode,
        welcomeCents,
        welcomeCents,
        'onboarding',
        'Welcome bonus - auto-provisioned test credits',
        'Auto-Provision Welcome',
        1,
        'active'
      ]
    );

    console.log(`[Provision] Created welcome voucher: ${voucherCode} ($0.05)`);

    // 6. Auto-redeem the voucher
    const redemptionResult = await client.query(
      `SELECT redeem_voucher($1, $2, $3) as result`,
      [voucherCode, tenantId, userId]
    );

    const redemption = redemptionResult.rows[0].result;

    if (!redemption.success) {
      throw new Error(`Failed to redeem welcome voucher: ${redemption.error}`);
    }

    console.log(`[Provision] Auto-redeemed voucher: ${welcomeCents} credits added`);

    // 7. Log the provisioning event
    await client.query(
      `INSERT INTO audit_log (
        tenant_id, user_id, action, resource_type, resource_id, details
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        userId,
        'auto_provision',
        'tenant',
        tenantId,
        JSON.stringify({
          source,
          email,
          credits_granted: welcomeCents,
          voucher_code: voucherCode,
          api_key_prefix: keyPrefix
        })
      ]
    );

    await client.query('COMMIT');

    // Return success response
    res.status(201).json({
      status: 'success',
      message: '🎉 Your CALOS test account is ready!',
      data: {
        tenant_id: tenantId,
        tenant_name: tenantName,
        user_id: userId,
        email: email,
        api_key: apiKey,
        api_key_prefix: keyPrefix,
        subscription_tier: 'free',
        credits_cents: welcomeCents,
        credits_dollars: (welcomeCents / 100).toFixed(2),
        estimated_calls: Math.floor(welcomeCents / 0.1), // Assuming $0.001 per call
        voucher_code: voucherCode,
        next_steps: [
          'Save your API key securely (it won\'t be shown again)',
          'Set environment variable: CALOS_API_KEY=' + apiKey,
          'Start making API calls with your free credits',
          'Upgrade to a paid tier for more credits and features'
        ]
      }
    });

    console.log(`[Provision] ✓ Successfully provisioned account for ${email}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Provision] Error:', error);

    res.status(500).json({
      status: 'error',
      error: 'Failed to provision account',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// ============================================================================
// CHECK PROVISIONING STATUS
// ============================================================================

/**
 * GET /api/provision/status/:email
 * Check if an account exists for this email
 */
router.get('/status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const result = await db.query(
      `SELECT
        u.user_id,
        u.email,
        u.tenant_id,
        t.tenant_name,
        t.subscription_tier,
        (SELECT COUNT(*) FROM tenant_api_keys WHERE tenant_id = u.tenant_id AND status = 'active') as active_keys,
        u.created_at
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          exists: false,
          message: 'No account found. Run initialization to create one.'
        }
      });
    }

    const user = result.rows[0];

    res.json({
      status: 'success',
      data: {
        exists: true,
        tenant_id: user.tenant_id,
        tenant_name: user.tenant_name,
        subscription_tier: user.subscription_tier,
        active_keys: user.active_keys,
        created_at: user.created_at,
        message: 'Account already exists'
      }
    });

  } catch (error) {
    console.error('[Provision] Status check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to check account status'
    });
  }
});

// ============================================================================
// GENERATE FREE TIER VOUCHER (Public for marketing)
// ============================================================================

/**
 * POST /api/provision/claim
 * Public endpoint for claiming free tier vouchers from marketing campaigns
 *
 * Body: { "campaign_code": "GOOGLEPARTNER", "email": "user@example.com" }
 */
router.post('/claim', async (req, res) => {
  try {
    const { campaign_code, email } = req.body;

    if (!campaign_code || !email) {
      return res.status(400).json({
        status: 'error',
        error: 'campaign_code and email required'
      });
    }

    // Verify campaign exists and is valid
    const campaignResult = await db.query(
      `SELECT * FROM vouchers
       WHERE code = $1 AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)`,
      [campaign_code.toUpperCase()]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Invalid or expired campaign code'
      });
    }

    res.json({
      status: 'success',
      message: 'Campaign code valid! Create an account to claim your credits.',
      data: {
        campaign_code: campaign_code.toUpperCase(),
        value_cents: campaignResult.rows[0].value_cents,
        value_dollars: (campaignResult.rows[0].value_cents / 100).toFixed(2),
        description: campaignResult.rows[0].description,
        next_step: 'Sign up or log in to redeem'
      }
    });

  } catch (error) {
    console.error('[Provision] Claim error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to process campaign claim'
    });
  }
});

module.exports = { initRoutes };
