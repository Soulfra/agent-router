/**
 * Schema Dashboard Routes
 *
 * Authenticated endpoints for schema management dashboards
 * Provides tenant-aware context for key verification, schema validation, etc.
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

/**
 * Middleware to allow X-User-Id header for development
 */
async function requireUserAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  req.userId = userId;
  next();
}

/**
 * GET /api/schema-dashboard/context
 * Get current user's tenant context for schema dashboards
 *
 * Response:
 * {
 *   user_id: "uuid",
 *   email: "user@example.com",
 *   tenant_id: "uuid",
 *   tenant_name: "Acme Corp",
 *   api_key_count: 3,
 *   credits_remaining: 1000
 * }
 */
router.get('/context', requireUserAuth, async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        error: 'Authentication required'
      });
    }

    // Get user with tenant info
    const userQuery = await db.query(`
      SELECT
        u.user_id,
        u.email,
        u.username,
        u.tenant_id,
        t.tenant_name,
        t.status AS tenant_status,
        t.max_users,
        t.max_apps,
        (SELECT COUNT(*) FROM calos_platform_api_keys WHERE tenant_id = u.tenant_id AND status = 'active') AS api_key_count
      FROM users u
      LEFT JOIN tenants t ON t.tenant_id = u.tenant_id
      WHERE u.user_id = $1
    `, [userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    const user = userQuery.rows[0];

    // Get credit balance (from user_credits table)
    const creditsQuery = await db.query(`
      SELECT credits_remaining, credits_used, updated_at
      FROM user_credits
      WHERE user_id = $1
    `, [userId]);

    const credits = creditsQuery.rows[0] || {
      credits_remaining: 0,
      credits_used: 0,
      updated_at: null
    };

    // Get tenant's active API keys (for double contingency auth)
    const apiKeysQuery = await db.query(`
      SELECT key_id, key_prefix, key_suffix_last4, key_name, status, last_used_at
      FROM calos_platform_api_keys
      WHERE tenant_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `, [user.tenant_id]);

    res.json({
      status: 'success',
      data: {
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        tenant_id: user.tenant_id,
        tenant_name: user.tenant_name || 'Personal',
        tenant_status: user.tenant_status,
        max_users: user.max_users || 100,
        max_apps: user.max_apps || 1,
        api_key_count: parseInt(user.api_key_count) || 0,
        api_keys: apiKeysQuery.rows,
        credits_remaining: parseInt(credits.credits_remaining) || 0,
        credits_used: parseInt(credits.credits_used) || 0,
        credits_last_updated: credits.updated_at
      }
    });

  } catch (error) {
    console.error('[SchemaDashboard] Context error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to load dashboard context'
    });
  }
});

/**
 * GET /api/schema-dashboard/schemas
 * List all available schemas
 */
router.get('/schemas', requireUserAuth, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const schemasDir = path.join(__dirname, '../schemas');

    if (!fs.existsSync(schemasDir)) {
      return res.json({
        status: 'success',
        data: { schemas: [] }
      });
    }

    const files = fs.readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'));
    const schemas = [];

    for (const file of files) {
      const schemaPath = path.join(schemasDir, file);
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const schema = JSON.parse(schemaContent);

      schemas.push({
        name: file.replace('.schema.json', ''),
        title: schema.title || file,
        description: schema.description || '',
        required_fields: schema.required?.length || 0,
        total_properties: Object.keys(schema.properties || {}).length,
        file_size: Buffer.byteLength(schemaContent),
        last_modified: fs.statSync(schemaPath).mtime
      });
    }

    res.json({
      status: 'success',
      data: {
        schemas,
        total: schemas.length
      }
    });

  } catch (error) {
    console.error('[SchemaDashboard] Schemas list error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list schemas'
    });
  }
});

/**
 * GET /api/schema-dashboard/validate
 * Run schema validation against live APIs
 */
router.post('/validate', requireUserAuth, async (req, res) => {
  try {
    const { schema_name } = req.body;
    const userId = req.userId;

    if (!schema_name) {
      return res.status(400).json({
        status: 'error',
        error: 'schema_name is required'
      });
    }

    const SchemaLock = require('../scripts/schema-lock');
    const schemaLock = new SchemaLock();

    // Load schemas
    schemaLock.loadSchemas();

    // Run validation for specific schema
    // (This would be customized to validate tenant-specific endpoints)
    await schemaLock.validate();

    res.json({
      status: 'success',
      data: {
        passed: schemaLock.results.passed,
        failed: schemaLock.results.failed,
        errors: schemaLock.results.errors
      }
    });

  } catch (error) {
    console.error('[SchemaDashboard] Validation error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Validation failed: ' + error.message
    });
  }
});

module.exports = { router, initRoutes };
