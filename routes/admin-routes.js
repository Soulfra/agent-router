/**
 * Admin God Mode Routes
 *
 * Platform administration for super admins:
 * - Tenant management (CRUD)
 * - License management
 * - Usage monitoring
 * - Platform analytics
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
// MIDDLEWARE - Check Super Admin Status
// ============================================================================

async function requireSuperAdmin(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await db.query(
      `SELECT sa.admin_id, sa.can_manage_tenants, sa.can_manage_billing,
              sa.can_view_analytics, sa.can_suspend_tenants
       FROM super_admins sa
       WHERE sa.user_id = $1 AND sa.active = TRUE`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    req.admin = result.rows[0];

    // Update last login
    await db.query(
      `UPDATE super_admins
       SET last_login_at = NOW(), login_count = login_count + 1
       WHERE admin_id = $1`,
      [req.admin.admin_id]
    );

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// ============================================================================
// DASHBOARD - Platform Overview
// ============================================================================

router.get('/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    // Get platform revenue summary
    const revenue = await db.query('SELECT * FROM platform_revenue');

    // Get recent tenant activity
    const recentTenants = await db.query(
      `SELECT tenant_id, tenant_slug, tenant_name, status,
              users_count, created_at
       FROM tenants
       ORDER BY created_at DESC
       LIMIT 10`
    );

    // Get expiring licenses (next 7 days)
    const expiringLicenses = await db.query(
      `SELECT tl.license_id, t.tenant_name, t.tenant_slug,
              tl.current_period_end, pt.tier_name
       FROM tenant_licenses tl
       JOIN tenants t ON t.tenant_id = tl.tenant_id
       JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
       WHERE tl.current_period_end <= NOW() + INTERVAL '7 days'
         AND tl.current_period_end > NOW()
         AND tl.status = 'active'
       ORDER BY tl.current_period_end ASC`
    );

    res.json({
      revenue: revenue.rows[0],
      recentTenants: recentTenants.rows,
      expiringLicenses: expiringLicenses.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============================================================================
// TENANTS - List & Search
// ============================================================================

router.get('/tenants', requireSuperAdmin, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT t.*, pt.tier_name, pt.tier_code, tl.status AS license_status,
             tl.current_period_end, tl.users_this_period
      FROM tenants t
      LEFT JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id AND tl.status = 'active'
      LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    }

    if (search) {
      query += ` AND (t.tenant_name ILIKE $${paramCount} OR t.tenant_slug ILIKE $${paramCount} OR t.owner_email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM tenants WHERE status = $1',
      [status || 'active']
    );

    res.json({
      tenants: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

// ============================================================================
// TENANTS - Get Single Tenant
// ============================================================================

router.get('/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await db.query(
      `SELECT t.*,
              pt.tier_name, pt.tier_code, pt.price_cents,
              tl.status AS license_status, tl.current_period_start,
              tl.current_period_end, tl.users_this_period,
              tl.api_calls_this_period, tl.stripe_subscription_id,
              tb.logo_url, tb.primary_color, tb.app_name,
              tf.recipe_elo_enabled, tf.brand_builder_enabled,
              tf.analytics_enabled, tf.api_access_enabled
       FROM tenants t
       LEFT JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id AND tl.status = 'active'
       LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
       LEFT JOIN tenant_branding tb ON tb.tenant_id = t.tenant_id
       LEFT JOIN tenant_features tf ON tf.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1`,
      [tenantId]
    );

    if (tenant.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant.rows[0]);
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

// ============================================================================
// TENANTS - Create New Tenant
// ============================================================================

router.post('/tenants', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_manage_tenants) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const {
      tenant_slug,
      tenant_name,
      company_name,
      owner_email,
      owner_name,
      tier_code = 'starter',
      trial_days = 14
    } = req.body;

    // Validate required fields
    if (!tenant_slug || !tenant_name || !owner_email) {
      return res.status(400).json({
        error: 'Missing required fields: tenant_slug, tenant_name, owner_email'
      });
    }

    // Check if slug already exists
    const existingTenant = await db.query(
      'SELECT tenant_id FROM tenants WHERE tenant_slug = $1',
      [tenant_slug]
    );

    if (existingTenant.rows.length > 0) {
      return res.status(400).json({ error: 'Tenant slug already exists' });
    }

    // Get tier
    const tier = await db.query(
      'SELECT tier_id, max_users, max_apps FROM platform_tiers WHERE tier_code = $1',
      [tier_code]
    );

    if (tier.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid tier code' });
    }

    const tierData = tier.rows[0];

    // Create tenant
    const result = await db.query(
      `INSERT INTO tenants (
        tenant_slug, tenant_name, company_name, owner_email, owner_name,
        status, trial_ends_at, max_users, max_apps
      ) VALUES ($1, $2, $3, $4, $5, 'trial', NOW() + INTERVAL '${trial_days} days', $6, $7)
      RETURNING *`,
      [tenant_slug, tenant_name, company_name, owner_email, owner_name,
       tierData.max_users, tierData.max_apps]
    );

    const tenant = result.rows[0];

    // Create default branding
    await db.query(
      `INSERT INTO tenant_branding (tenant_id, app_name, primary_color, secondary_color)
       VALUES ($1, $2, '#f5576c', '#667eea')`,
      [tenant.tenant_id, tenant_name]
    );

    // Create default features
    await db.query(
      `INSERT INTO tenant_features (tenant_id)
       VALUES ($1)`,
      [tenant.tenant_id]
    );

    res.status(201).json(tenant);
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// ============================================================================
// TENANTS - Update Tenant
// ============================================================================

router.patch('/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_manage_tenants) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const { tenantId } = req.params;
    const updates = req.body;

    const allowedFields = [
      'tenant_name', 'company_name', 'owner_email', 'owner_name',
      'custom_domain', 'domain_verified', 'status', 'max_users', 'max_apps'
    ];

    const setFields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field)) {
        setFields.push(`${field} = $${paramCount++}`);
        values.push(updates[field]);
      }
    });

    if (setFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(tenantId);

    const query = `
      UPDATE tenants
      SET ${setFields.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// ============================================================================
// TENANTS - Suspend/Unsuspend Tenant
// ============================================================================

router.post('/tenants/:tenantId/suspend', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_suspend_tenants) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const { tenantId } = req.params;
    const { reason } = req.body;

    await db.query(
      `UPDATE tenants
       SET status = 'suspended', suspended_at = NOW(),
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{suspension_reason}', $1)
       WHERE tenant_id = $2`,
      [JSON.stringify(reason || 'No reason provided'), tenantId]
    );

    res.json({ success: true, message: 'Tenant suspended' });
  } catch (error) {
    console.error('Suspend tenant error:', error);
    res.status(500).json({ error: 'Failed to suspend tenant' });
  }
});

router.post('/tenants/:tenantId/unsuspend', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_suspend_tenants) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const { tenantId } = req.params;

    await db.query(
      `UPDATE tenants
       SET status = 'active', suspended_at = NULL
       WHERE tenant_id = $1`,
      [tenantId]
    );

    res.json({ success: true, message: 'Tenant unsuspended' });
  } catch (error) {
    console.error('Unsuspend tenant error:', error);
    res.status(500).json({ error: 'Failed to unsuspend tenant' });
  }
});

// ============================================================================
// LICENSES - Manage Tenant Licenses
// ============================================================================

router.post('/tenants/:tenantId/license', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_manage_billing) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    const { tenantId } = req.params;
    const { tier_code } = req.body;

    // Get tier
    const tier = await db.query(
      'SELECT tier_id FROM platform_tiers WHERE tier_code = $1',
      [tier_code]
    );

    if (tier.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid tier code' });
    }

    // Cancel existing active licenses
    await db.query(
      `UPDATE tenant_licenses
       SET status = 'canceled', canceled_at = NOW(), ended_at = NOW()
       WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    // Create new license
    const result = await db.query(
      `INSERT INTO tenant_licenses (
        tenant_id, tier_id, status,
        current_period_start, current_period_end
      ) VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '28 days')
      RETURNING *`,
      [tenantId, tier.rows[0].tier_id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create license error:', error);
    res.status(500).json({ error: 'Failed to create license' });
  }
});

// ============================================================================
// ANALYTICS - Platform Stats
// ============================================================================

router.get('/analytics', requireSuperAdmin, async (req, res) => {
  if (!req.admin.can_view_analytics) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  try {
    // Tenant growth over time
    const growth = await db.query(
      `SELECT
        DATE_TRUNC('day', created_at) AS date,
        COUNT(*) AS new_tenants,
        SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('day', created_at)) AS total_tenants
       FROM tenants
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY date DESC`
    );

    // Revenue by tier
    const revenueByTier = await db.query(
      `SELECT
        pt.tier_name,
        pt.tier_code,
        pt.price_cents,
        COUNT(tl.license_id) AS active_licenses,
        COUNT(tl.license_id) * pt.price_cents AS total_revenue
       FROM platform_tiers pt
       LEFT JOIN tenant_licenses tl ON tl.tier_id = pt.tier_id AND tl.status = 'active'
       GROUP BY pt.tier_id, pt.tier_name, pt.tier_code, pt.price_cents
       ORDER BY pt.sort_order`
    );

    // Top tenants by usage
    const topTenants = await db.query(
      `SELECT
        t.tenant_name,
        t.tenant_slug,
        t.users_count,
        tl.users_this_period,
        tl.api_calls_this_period
       FROM tenants t
       JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id AND tl.status = 'active'
       ORDER BY t.users_count DESC
       LIMIT 10`
    );

    res.json({
      growth: growth.rows,
      revenueByTier: revenueByTier.rows,
      topTenants: topTenants.rows
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = {
  router,
  initRoutes
};
