/**
 * User API Key Management Routes
 *
 * REST API endpoints for users to manage their API keys.
 *
 * Endpoints:
 * - POST   /api/user/api-keys          - Generate new API key
 * - GET    /api/user/api-keys          - List user's API keys
 * - DELETE /api/user/api-keys/:keyId   - Revoke API key
 * - PATCH  /api/user/api-keys/:keyId   - Update API key settings
 *
 * Authentication:
 * - All endpoints require user to be logged in (session auth)
 * - API keys themselves use Bearer token auth (see validate-api-key.js)
 *
 * Usage:
 *   const express = require('express');
 *   const userApiRoutes = require('./routes/user-api-routes');
 *   const app = express();
 *
 *   app.use('/api/user', userApiRoutes);
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * Middleware to require session authentication
 * (User must be logged in to manage API keys)
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'You must be logged in to manage API keys'
    });
  }
  next();
}

/**
 * Generate API key
 * Returns raw key ONCE (user must save it)
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `calos_sk_${randomBytes}`;
}

/**
 * Hash API key for storage
 * (Never store raw keys in database)
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * POST /api/user/api-keys
 * Generate a new API key for the authenticated user
 *
 * Body:
 *   {
 *     "name": "My App",              // Required: Key name/description
 *     "scopes": ["llm:chat"],        // Optional: Permissions (default: all)
 *     "expiresInDays": 365,          // Optional: Expiration (default: never)
 *     "rateLimitPerHour": 100,       // Optional: Hourly limit (default: 100)
 *     "rateLimitPerDay": 1000        // Optional: Daily limit (default: 1000)
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "apiKey": "calos_sk_abc123...",   // RAW KEY - shown only once!
 *     "keyId": "uuid",
 *     "keyName": "My App",
 *     "scopes": ["llm:chat"],
 *     "createdAt": "2024-10-22T...",
 *     "expiresAt": "2025-10-22T..." or null,
 *     "warning": "Save this key now - it won't be shown again"
 *   }
 */
router.post('/api-keys', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;

  try {
    const {
      name,
      scopes = ['*'], // Default: all scopes
      expiresInDays = null,
      rateLimitPerHour = 100,
      rateLimitPerDay = 1000
    } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'API key name is required'
      });
    }

    // Check if user already has a key with this name
    const existingKey = await db.query(`
      SELECT id FROM user_api_keys
      WHERE user_id = $1 AND key_name = $2
    `, [userId, name.trim()]);

    if (existingKey.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `You already have an API key named "${name}"`
      });
    }

    // Generate API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // Store in database
    const result = await db.query(`
      INSERT INTO user_api_keys (
        user_id,
        key_name,
        key_hash,
        scopes,
        rate_limit_per_hour,
        rate_limit_per_day,
        expires_at,
        active,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      RETURNING id, created_at
    `, [
      userId,
      name.trim(),
      keyHash,
      JSON.stringify(scopes),
      rateLimitPerHour,
      rateLimitPerDay,
      expiresAt
    ]);

    const keyData = result.rows[0];

    res.json({
      success: true,
      apiKey, // RAW KEY - only shown once!
      keyId: keyData.id,
      keyName: name.trim(),
      scopes,
      rateLimits: {
        perHour: rateLimitPerHour,
        perDay: rateLimitPerDay
      },
      createdAt: keyData.created_at,
      expiresAt,
      warning: '⚠️  Save this key now - it will not be shown again!'
    });

  } catch (error) {
    console.error('[UserApiRoutes] Create API key error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create API key'
    });
  }
});

/**
 * GET /api/user/api-keys
 * List all API keys for the authenticated user
 *
 * Response:
 *   {
 *     "keys": [
 *       {
 *         "id": "uuid",
 *         "name": "My App",
 *         "scopes": ["llm:chat"],
 *         "rateLimits": { "perHour": 100, "perDay": 1000 },
 *         "active": true,
 *         "createdAt": "2024-10-22T...",
 *         "lastUsedAt": "2024-10-22T...",
 *         "expiresAt": null,
 *         "keyPreview": "calos_sk_abc123...xyz" // First 16 + last 6 chars
 *       }
 *     ]
 *   }
 */
router.get('/api-keys', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;

  try {
    const result = await db.query(`
      SELECT
        id,
        key_name,
        key_hash,
        scopes,
        rate_limit_per_hour,
        rate_limit_per_day,
        active,
        created_at,
        last_used_at,
        expires_at
      FROM user_api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const keys = result.rows.map(row => ({
      id: row.id,
      name: row.key_name,
      scopes: JSON.parse(row.scopes || '["*"]'),
      rateLimits: {
        perHour: row.rate_limit_per_hour,
        perDay: row.rate_limit_per_day
      },
      active: row.active,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      keyPreview: `calos_sk_${row.key_hash.substring(0, 8)}...${row.key_hash.substring(56, 64)}`
    }));

    res.json({ keys });

  } catch (error) {
    console.error('[UserApiRoutes] List API keys error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list API keys'
    });
  }
});

/**
 * DELETE /api/user/api-keys/:keyId
 * Revoke (delete) an API key
 *
 * Response:
 *   {
 *     "success": true,
 *     "message": "API key revoked"
 *   }
 */
router.delete('/api-keys/:keyId', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { keyId } = req.params;

  try {
    // Verify key belongs to user
    const result = await db.query(`
      DELETE FROM user_api_keys
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [keyId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or does not belong to you'
      });
    }

    res.json({
      success: true,
      message: 'API key revoked'
    });

  } catch (error) {
    console.error('[UserApiRoutes] Delete API key error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to revoke API key'
    });
  }
});

/**
 * PATCH /api/user/api-keys/:keyId
 * Update API key settings (name, scopes, rate limits)
 *
 * Body (all fields optional):
 *   {
 *     "name": "New Name",
 *     "scopes": ["llm:chat", "llm:completion"],
 *     "rateLimitPerHour": 200,
 *     "rateLimitPerDay": 2000,
 *     "active": false  // Disable without deleting
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "key": { ... updated key data ... }
 *   }
 */
router.patch('/api-keys/:keyId', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { keyId } = req.params;

  try {
    const {
      name,
      scopes,
      rateLimitPerHour,
      rateLimitPerDay,
      active
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [keyId, userId];
    let paramIndex = 3;

    if (name !== undefined) {
      updates.push(`key_name = $${paramIndex++}`);
      values.push(name.trim());
    }

    if (scopes !== undefined) {
      updates.push(`scopes = $${paramIndex++}`);
      values.push(JSON.stringify(scopes));
    }

    if (rateLimitPerHour !== undefined) {
      updates.push(`rate_limit_per_hour = $${paramIndex++}`);
      values.push(rateLimitPerHour);
    }

    if (rateLimitPerDay !== undefined) {
      updates.push(`rate_limit_per_day = $${paramIndex++}`);
      values.push(rateLimitPerDay);
    }

    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No fields to update'
      });
    }

    const result = await db.query(`
      UPDATE user_api_keys
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING
        id, key_name, scopes, rate_limit_per_hour,
        rate_limit_per_day, active, created_at,
        last_used_at, expires_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or does not belong to you'
      });
    }

    const row = result.rows[0];

    res.json({
      success: true,
      key: {
        id: row.id,
        name: row.key_name,
        scopes: JSON.parse(row.scopes || '["*"]'),
        rateLimits: {
          perHour: row.rate_limit_per_hour,
          perDay: row.rate_limit_per_day
        },
        active: row.active,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at
      }
    });

  } catch (error) {
    console.error('[UserApiRoutes] Update API key error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update API key'
    });
  }
});

/**
 * GET /api/user/api-keys/:keyId/usage
 * Get usage statistics for an API key
 *
 * Query params:
 *   ?days=7  // Last N days (default: 7)
 *
 * Response:
 *   {
 *     "keyId": "uuid",
 *     "keyName": "My App",
 *     "period": { "start": "...", "end": "..." },
 *     "usage": {
 *       "totalRequests": 1234,
 *       "totalTokens": 56789,
 *       "estimatedCost": 12.34,
 *       "byDay": [
 *         { "date": "2024-10-22", "requests": 123, "tokens": 5678, "cost": 1.23 }
 *       ],
 *       "byModel": {
 *         "gpt-4": { "requests": 50, "tokens": 10000, "cost": 5.00 },
 *         "claude-3-opus": { "requests": 73, "tokens": 20000, "cost": 7.34 }
 *       }
 *     }
 *   }
 */
router.get('/api-keys/:keyId/usage', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { keyId } = req.params;
  const days = parseInt(req.query.days || 7);

  try {
    // Verify key belongs to user
    const keyResult = await db.query(`
      SELECT key_name FROM user_api_keys
      WHERE id = $1 AND user_id = $2
    `, [keyId, userId]);

    if (keyResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or does not belong to you'
      });
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get usage data
    const usageResult = await db.query(`
      SELECT
        DATE(created_at) as date,
        model,
        COUNT(*) as requests,
        SUM(total_tokens) as tokens,
        SUM(estimated_cost_usd) as cost
      FROM user_llm_usage
      WHERE api_key_id = $1 AND created_at > $2
      GROUP BY DATE(created_at), model
      ORDER BY date DESC, model
    `, [keyId, startDate]);

    // Aggregate by day
    const byDay = {};
    const byModel = {};
    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const row of usageResult.rows) {
      const date = row.date.toISOString().split('T')[0];
      const model = row.model;
      const requests = parseInt(row.requests);
      const tokens = parseInt(row.tokens || 0);
      const cost = parseFloat(row.cost || 0);

      // By day
      if (!byDay[date]) {
        byDay[date] = { date, requests: 0, tokens: 0, cost: 0 };
      }
      byDay[date].requests += requests;
      byDay[date].tokens += tokens;
      byDay[date].cost += cost;

      // By model
      if (!byModel[model]) {
        byModel[model] = { requests: 0, tokens: 0, cost: 0 };
      }
      byModel[model].requests += requests;
      byModel[model].tokens += tokens;
      byModel[model].cost += cost;

      // Totals
      totalRequests += requests;
      totalTokens += tokens;
      totalCost += cost;
    }

    res.json({
      keyId,
      keyName: keyResult.rows[0].key_name,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days
      },
      usage: {
        totalRequests,
        totalTokens,
        estimatedCost: totalCost.toFixed(4),
        byDay: Object.values(byDay),
        byModel
      }
    });

  } catch (error) {
    console.error('[UserApiRoutes] Get usage error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get usage statistics'
    });
  }
});

module.exports = router;
