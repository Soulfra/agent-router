/**
 * Voucher & Gift Card Routes
 *
 * Handles:
 * - Gift card generation (single/batch)
 * - Voucher redemption
 * - Code validation
 * - Usage tracking
 *
 * Example voucher codes:
 * - CALOS-5USD-ABC123 ($5 gift card)
 * - WELCOME-FREE (onboarding promotion)
 * - AFFILIATE-GOOGLE-50 (affiliate reward)
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
// MIDDLEWARE
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
      `SELECT u.user_id, u.email, u.tenant_id, t.tenant_name
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

    req.user = result.rows[0];
    req.tenantId = result.rows[0].tenant_id;
    req.userId = userId;

    next();
  } catch (error) {
    console.error('[Vouchers] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

async function requireAdmin(req, res, next) {
  // Check if user is admin
  try {
    const result = await db.query(
      `SELECT role FROM users WHERE user_id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        error: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('[Vouchers] Admin check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Permission check failed'
    });
  }
}

// ============================================================================
// CHECK VOUCHER (Public - no auth required)
// ============================================================================

/**
 * GET /api/vouchers/check/:code
 * Check if a voucher code is valid and get its value
 */
router.get('/check/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await db.query(
      `SELECT check_voucher($1) as voucher_info`,
      [code.toUpperCase()]
    );

    const voucherInfo = result.rows[0].voucher_info;

    if (voucherInfo.valid) {
      res.json({
        status: 'success',
        data: voucherInfo
      });
    } else {
      res.status(400).json({
        status: 'error',
        error: voucherInfo.error
      });
    }

  } catch (error) {
    console.error('[Vouchers] Check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to check voucher'
    });
  }
});

// ============================================================================
// REDEEM VOUCHER
// ============================================================================

/**
 * POST /api/vouchers/redeem
 * Redeem a voucher code for credits
 */
router.post('/redeem', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        error: 'Voucher code required'
      });
    }

    // Redeem using database function
    const result = await db.query(
      `SELECT redeem_voucher($1, $2, $3) as redemption_result`,
      [code.toUpperCase(), req.tenantId, req.userId]
    );

    const redemptionResult = result.rows[0].redemption_result;

    if (redemptionResult.success) {
      res.json({
        status: 'success',
        message: `Voucher redeemed! ${redemptionResult.credits_added} credits added to your account.`,
        data: {
          credits_added: redemptionResult.credits_added,
          credits_dollars: (redemptionResult.credits_added / 100).toFixed(2),
          voucher_code: redemptionResult.voucher_code,
          voucher_type: redemptionResult.voucher_type
        }
      });

      console.log(`[Vouchers] Redeemed ${code} for tenant ${req.tenantId}: ${redemptionResult.credits_added} credits`);
    } else {
      res.status(400).json({
        status: 'error',
        error: redemptionResult.error
      });
    }

  } catch (error) {
    console.error('[Vouchers] Redeem error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to redeem voucher'
    });
  }
});

// ============================================================================
// GENERATE VOUCHER (Admin only)
// ============================================================================

/**
 * POST /api/vouchers/generate
 * Generate a single voucher code
 */
router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      prefix = 'CALOS',
      value_dollars,
      voucher_type = 'gift_card',
      description,
      campaign_name,
      expires_days,
      max_redemptions = 1
    } = req.body;

    if (!value_dollars) {
      return res.status(400).json({
        status: 'error',
        error: 'value_dollars required (e.g., 5 for $5)'
      });
    }

    const valueCents = Math.round(value_dollars * 100);

    // Generate random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
    const code = `${prefix}-${value_dollars}USD-${randomSuffix}`;

    // Calculate expiration
    let expiresAt = null;
    if (expires_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_days);
    }

    // Insert voucher
    const result = await db.query(
      `INSERT INTO vouchers (
        code, value_cents, original_value_cents, voucher_type, description,
        campaign_name, max_redemptions, expires_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING voucher_id, code, value_cents, voucher_type, status, expires_at, created_at`,
      [
        code,
        valueCents,
        valueCents,
        voucher_type,
        description,
        campaign_name,
        max_redemptions,
        expiresAt,
        req.userId
      ]
    );

    const voucher = result.rows[0];

    res.json({
      status: 'success',
      message: 'Voucher generated successfully',
      data: {
        ...voucher,
        value_dollars: (voucher.value_cents / 100).toFixed(2)
      }
    });

    console.log(`[Vouchers] Generated voucher ${code} ($${value_dollars}) by user ${req.userId}`);

  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        status: 'error',
        error: 'Voucher code already exists. Please try again.'
      });
    }

    console.error('[Vouchers] Generate error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate voucher'
    });
  }
});

// ============================================================================
// BATCH GENERATE (Admin only)
// ============================================================================

/**
 * POST /api/vouchers/batch
 * Generate multiple voucher codes at once
 */
router.post('/batch', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      prefix = 'CALOS',
      count = 10,
      value_dollars,
      voucher_type = 'gift_card',
      campaign_name
    } = req.body;

    if (!value_dollars) {
      return res.status(400).json({
        status: 'error',
        error: 'value_dollars required'
      });
    }

    if (count > 1000) {
      return res.status(400).json({
        status: 'error',
        error: 'Maximum 1000 vouchers per batch'
      });
    }

    const valueCents = Math.round(value_dollars * 100);

    // Use database function to generate batch
    const result = await db.query(
      `SELECT * FROM generate_voucher_batch($1, $2, $3, $4)`,
      [`${prefix}-${value_dollars}USD`, count, valueCents, voucher_type]
    );

    // Update campaign name for all generated vouchers
    if (campaign_name && result.rows.length > 0) {
      const voucherIds = result.rows.map(r => r.voucher_id);
      await db.query(
        `UPDATE vouchers SET campaign_name = $1, created_by = $2 WHERE voucher_id = ANY($3)`,
        [campaign_name, req.userId, voucherIds]
      );
    }

    res.json({
      status: 'success',
      message: `Generated ${result.rows.length} vouchers`,
      data: {
        count: result.rows.length,
        value_per_voucher_cents: valueCents,
        value_per_voucher_dollars: value_dollars,
        total_value_dollars: (valueCents * result.rows.length / 100).toFixed(2),
        vouchers: result.rows.map(v => ({
          voucher_id: v.voucher_id,
          code: v.code,
          value_cents: v.value_cents,
          value_dollars: (v.value_cents / 100).toFixed(2)
        }))
      }
    });

    console.log(`[Vouchers] Generated batch of ${count} vouchers ($${value_dollars} each) by user ${req.userId}`);

  } catch (error) {
    console.error('[Vouchers] Batch generate error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate voucher batch'
    });
  }
});

// ============================================================================
// LIST VOUCHERS (Admin only)
// ============================================================================

/**
 * GET /api/vouchers
 * List all vouchers (admin view)
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      status,
      voucher_type,
      campaign_name,
      limit = 100,
      offset = 0
    } = req.query;

    let sql = `
      SELECT
        voucher_id,
        code,
        value_cents,
        ROUND(value_cents::NUMERIC / 100, 2) as value_dollars,
        original_value_cents,
        ROUND(original_value_cents::NUMERIC / 100, 2) as original_value_dollars,
        voucher_type,
        status,
        redemptions_count,
        max_redemptions,
        expires_at,
        campaign_name,
        batch_id,
        created_at
      FROM vouchers
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (voucher_type) {
      sql += ` AND voucher_type = $${paramIndex}`;
      params.push(voucher_type);
      paramIndex++;
    }

    if (campaign_name) {
      sql += ` AND campaign_name = $${paramIndex}`;
      params.push(campaign_name);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(sql, params);

    res.json({
      status: 'success',
      data: {
        vouchers: result.rows,
        total: result.rows.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('[Vouchers] List error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list vouchers'
    });
  }
});

// ============================================================================
// VOUCHER STATS (Admin only)
// ============================================================================

/**
 * GET /api/vouchers/stats
 * Get voucher usage statistics
 */
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM voucher_usage_stats
      ORDER BY total_redemptions DESC
    `);

    res.json({
      status: 'success',
      data: {
        campaigns: result.rows
      }
    });

  } catch (error) {
    console.error('[Vouchers] Stats error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get voucher statistics'
    });
  }
});

// ============================================================================
// MY REDEMPTIONS (User view)
// ============================================================================

/**
 * GET /api/vouchers/my-redemptions
 * View user's voucher redemption history
 */
router.get('/my-redemptions', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        vr.redemption_id,
        vr.value_applied_cents,
        ROUND(vr.value_applied_cents::NUMERIC / 100, 2) as value_applied_dollars,
        vr.redeemed_at,
        v.code,
        v.voucher_type,
        v.description
      FROM voucher_redemptions vr
      JOIN vouchers v ON v.voucher_id = vr.voucher_id
      WHERE vr.tenant_id = $1
      ORDER BY vr.redeemed_at DESC
      LIMIT 50`,
      [req.tenantId]
    );

    res.json({
      status: 'success',
      data: {
        redemptions: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Vouchers] My redemptions error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get redemption history'
    });
  }
});

module.exports = { initRoutes };
