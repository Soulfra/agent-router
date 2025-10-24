/**
 * Tenant Isolation Middleware
 *
 * Ensures multi-tenant data isolation:
 * - Extracts tenant_id from subdomain, custom domain, or token
 * - Injects tenant_id into all database queries
 * - Prevents cross-tenant data leaks
 */

/**
 * Extract tenant ID from request
 *
 * Priority:
 * 1. Custom domain (e.g., recipes.acmefitness.com)
 * 2. Subdomain (e.g., acme-fitness.calos.com)
 * 3. Header (X-Tenant-ID)
 * 4. Query param (?tenant=...)
 */
async function extractTenantId(req, db) {
  // Check custom domain first
  const host = req.hostname || req.get('host')?.split(':')[0];

  if (host) {
    // Check if this is a custom domain
    const customDomain = await db.query(
      'SELECT tenant_id FROM tenants WHERE custom_domain = $1 AND domain_verified = TRUE',
      [host]
    );

    if (customDomain.rows.length > 0) {
      return customDomain.rows[0].tenant_id;
    }

    // Check subdomain (e.g., acme-fitness.calos.com)
    const parts = host.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];

      // Skip common subdomains
      if (!['www', 'api', 'admin', 'app'].includes(subdomain)) {
        const subdomainResult = await db.query(
          'SELECT tenant_id FROM tenants WHERE tenant_slug = $1',
          [subdomain]
        );

        if (subdomainResult.rows.length > 0) {
          return subdomainResult.rows[0].tenant_id;
        }
      }
    }
  }

  // Check header
  const headerTenantId = req.headers['x-tenant-id'];
  if (headerTenantId) {
    return headerTenantId;
  }

  // Check query param
  const queryTenantId = req.query.tenant;
  if (queryTenantId) {
    return queryTenantId;
  }

  // No tenant found - could be public route or error
  return null;
}

/**
 * Middleware to enforce tenant isolation
 *
 * Usage:
 * ```js
 * const { requireTenant, optionalTenant } = require('./lib/tenant-isolation');
 *
 * // Require tenant (will reject if not found)
 * router.get('/api/recipes', requireTenant, async (req, res) => {
 *   const tenantId = req.tenantId;
 *   // ... query with tenant_id filter
 * });
 *
 * // Optional tenant (public routes)
 * router.get('/api/public-recipes', optionalTenant, async (req, res) => {
 *   const tenantId = req.tenantId; // May be null
 *   // ... query with optional tenant_id filter
 * });
 * ```
 */
function createTenantMiddleware(db) {
  /**
   * Require tenant - rejects requests without tenant_id
   */
  async function requireTenant(req, res, next) {
    try {
      const tenantId = await extractTenantId(req, db);

      if (!tenantId) {
        return res.status(400).json({
          error: 'Tenant identification required',
          hint: 'Use subdomain, custom domain, or X-Tenant-ID header'
        });
      }

      // Verify tenant is active
      const tenant = await db.query(
        `SELECT tenant_id, status, trial_ends_at
         FROM tenants
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (tenant.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const tenantData = tenant.rows[0];

      // Check if suspended
      if (tenantData.status === 'suspended') {
        return res.status(403).json({
          error: 'Tenant suspended',
          message: 'This account has been suspended. Contact support.'
        });
      }

      // Check if trial expired
      if (tenantData.status === 'trial' && tenantData.trial_ends_at) {
        const trialEnded = new Date(tenantData.trial_ends_at) < new Date();
        if (trialEnded) {
          return res.status(403).json({
            error: 'Trial expired',
            message: 'Your trial has ended. Please upgrade to continue.'
          });
        }
      }

      // Attach tenant info to request
      req.tenantId = tenantId;
      req.tenant = tenantData;

      next();
    } catch (error) {
      console.error('Tenant isolation error:', error);
      res.status(500).json({ error: 'Failed to identify tenant' });
    }
  }

  /**
   * Optional tenant - allows requests without tenant_id (for public routes)
   */
  async function optionalTenant(req, res, next) {
    try {
      const tenantId = await extractTenantId(req, db);

      if (tenantId) {
        // Verify tenant exists and is active
        const tenant = await db.query(
          'SELECT tenant_id, status FROM tenants WHERE tenant_id = $1',
          [tenantId]
        );

        if (tenant.rows.length > 0 && tenant.rows[0].status !== 'suspended') {
          req.tenantId = tenantId;
          req.tenant = tenant.rows[0];
        }
      }

      next();
    } catch (error) {
      console.error('Tenant isolation error:', error);
      // Don't fail request for optional tenant
      next();
    }
  }

  return { requireTenant, optionalTenant };
}

/**
 * Query wrapper that automatically adds tenant_id filter
 *
 * Usage:
 * ```js
 * const { tenantQuery } = require('./lib/tenant-isolation');
 *
 * // Instead of:
 * db.query('SELECT * FROM recipes WHERE tenant_id = $1', [tenantId]);
 *
 * // Use:
 * tenantQuery(db, tenantId, 'recipes', 'SELECT * FROM recipes');
 * ```
 */
async function tenantQuery(db, tenantId, tableName, query, params = []) {
  // Simple approach: automatically add tenant_id filter
  // More robust: use PostgreSQL Row Level Security (RLS)

  // Check if query already has WHERE clause
  const hasWhere = /WHERE/i.test(query);

  // Modify query to include tenant_id filter
  let modifiedQuery;
  if (hasWhere) {
    // Add AND tenant_id condition
    modifiedQuery = query.replace(
      /WHERE/i,
      `WHERE tenant_id = $${params.length + 1} AND`
    );
  } else {
    // Add WHERE tenant_id condition
    const insertPoint = query.search(/ORDER BY|LIMIT|GROUP BY|OFFSET/i);
    if (insertPoint !== -1) {
      modifiedQuery =
        query.slice(0, insertPoint) +
        ` WHERE tenant_id = $${params.length + 1} ` +
        query.slice(insertPoint);
    } else {
      modifiedQuery = `${query} WHERE tenant_id = $${params.length + 1}`;
    }
  }

  return db.query(modifiedQuery, [...params, tenantId]);
}

/**
 * Enable PostgreSQL Row Level Security for tenant isolation
 *
 * This is the BEST way to enforce tenant isolation at the database level.
 * Once enabled, PostgreSQL will automatically filter all queries by tenant_id.
 */
async function enableRowLevelSecurity(db) {
  const tables = [
    'users',
    'elo_items',
    'elo_matchups',
    'onboarding_sessions'
  ];

  for (const table of tables) {
    try {
      // Enable RLS on table
      await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

      // Create policy: users can only see their tenant's data
      await db.query(`
        CREATE POLICY tenant_isolation_policy ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
      `);

      console.log(`✓ Row level security enabled for ${table}`);
    } catch (error) {
      // Policy might already exist
      if (!error.message.includes('already exists')) {
        console.error(`Failed to enable RLS for ${table}:`, error.message);
      }
    }
  }
}

/**
 * Set tenant context for current database session
 * This works with Row Level Security policies
 */
async function setTenantContext(db, tenantId) {
  await db.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
}

module.exports = {
  extractTenantId,
  createTenantMiddleware,
  tenantQuery,
  enableRowLevelSecurity,
  setTenantContext
};
