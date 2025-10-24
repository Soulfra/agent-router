/**
 * Tenant API Key Routes (Layer 1)
 *
 * Manages platform API keys that customers use to access CALOS.
 * These are different from BYOK keys (Layer 2) which are for accessing LLM providers.
 *
 * Key Format: sk-tenant-{tenant_id}-{random}
 * Example: sk-tenant-550e8400-e29b-41d4-a716-446655440000-x7k9m2p4
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');

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
// MIDDLEWARE - Require authentication
// ============================================================================

/**
 * Middleware to require user authentication
 * Assumes session-based auth from routes/auth-routes.js
 */
async function requireAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required. Please login first.'
    });
  }

  // Get user's tenant_id
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

    if (user.tenant_status !== 'active') {
      return res.status(403).json({
        status: 'error',
        error: 'Tenant account is not active. Please contact support.'
      });
    }

    // Attach user to request
    req.user = user;
    req.tenantId = user.tenant_id;

    next();
  } catch (error) {
    console.error('[TenantAPIKey] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

// ============================================================================
// GENERATE NEW API KEY
// ============================================================================

/**
 * POST /api/keys/generate
 * Generate a new platform API key for the authenticated tenant
 */
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { key_name, description, expires_in_days, rate_limit_override } = req.body;

    if (!key_name || key_name.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'key_name is required'
      });
    }

    // Generate secure API key
    // Format: sk-tenant-{tenant_id}-{random}
    const randomSuffix = crypto.randomBytes(16).toString('hex').substring(0, 12); // 12 chars
    const apiKey = `sk-tenant-${req.tenantId}-${randomSuffix}`;

    // Hash the key for storage (NEVER store plaintext!)
    const saltRounds = 10;
    const keyHash = await bcrypt.hash(apiKey, saltRounds);

    // Extract prefix and suffix for display
    const keyPrefix = apiKey.substring(0, 30); // "sk-tenant-{first-part-of-uuid}"
    const keySuffixLast4 = randomSuffix.substring(randomSuffix.length - 4);

    // Calculate expiration if provided
    let expiresAt = null;
    if (expires_in_days && expires_in_days > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }

    // Get tenant's default rate limits (based on their subscription tier)
    const subscription = await db.query(
      `SELECT tl.*, pt.tier_code
       FROM tenant_licenses tl
       JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
       WHERE tl.tenant_id = $1 AND tl.status = 'active'
       LIMIT 1`,
      [req.tenantId]
    );

    // Default rate limits by tier
    let rateLimits = {
      per_minute: 60,
      per_hour: 1000,
      per_day: 10000
    };

    if (subscription.rows.length > 0) {
      const tier = subscription.rows[0].tier_code;
      switch (tier) {
        case 'free':
        case 'starter':
          rateLimits = { per_minute: 10, per_hour: 100, per_day: 1000 };
          break;
        case 'pro':
          rateLimits = { per_minute: 60, per_hour: 1000, per_day: 10000 };
          break;
        case 'enterprise':
          rateLimits = { per_minute: 300, per_hour: 10000, per_day: 100000 };
          break;
      }
    }

    // Allow rate limit override if provided (enterprise only)
    if (rate_limit_override && subscription.rows[0]?.tier_code === 'enterprise') {
      rateLimits = {
        per_minute: rate_limit_override.per_minute || rateLimits.per_minute,
        per_hour: rate_limit_override.per_hour || rateLimits.per_hour,
        per_day: rate_limit_override.per_day || rateLimits.per_day
      };
    }

    // Insert into database
    const result = await db.query(
      `INSERT INTO calos_platform_api_keys (
        tenant_id, key_hash, key_prefix, key_suffix_last4, key_name, description,
        rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day,
        expires_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING key_id, key_prefix, key_suffix_last4, key_name, status, created_at, expires_at`,
      [
        req.tenantId,
        keyHash,
        keyPrefix,
        keySuffixLast4,
        key_name.trim(),
        description || null,
        rateLimits.per_minute,
        rateLimits.per_hour,
        rateLimits.per_day,
        expiresAt,
        req.user.user_id
      ]
    );

    const keyRecord = result.rows[0];

    // Return the full key ONLY ONCE (can't retrieve it later!)
    res.json({
      status: 'success',
      message: 'API key generated successfully. IMPORTANT: Save this key now - you will not be able to see it again!',
      data: {
        key_id: keyRecord.key_id,
        api_key: apiKey, // Full key - ONLY shown once!
        key_prefix: keyRecord.key_prefix,
        key_suffix_last4: keyRecord.key_suffix_last4,
        key_name: keyRecord.key_name,
        status: keyRecord.status,
        rate_limits: rateLimits,
        expires_at: keyRecord.expires_at,
        created_at: keyRecord.created_at
      }
    });

    console.log(`[TenantAPIKey] Generated key ${keyRecord.key_id} for tenant ${req.tenantId}`);

  } catch (error) {
    console.error('[TenantAPIKey] Generate error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to generate API key'
    });
  }
});

// ============================================================================
// LIST ALL API KEYS
// ============================================================================

/**
 * GET /api/keys
 * List all platform API keys for the authenticated tenant
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        key_id,
        key_prefix,
        key_suffix_last4,
        key_name,
        description,
        status,
        last_used_at,
        last_used_ip,
        last_used_endpoint,
        total_requests,
        rate_limit_per_minute,
        rate_limit_per_hour,
        rate_limit_per_day,
        created_at,
        expires_at,
        revoked_at,
        revoked_reason
      FROM calos_platform_api_keys
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
      [req.tenantId]
    );

    // Get usage stats for each key
    const keys = await Promise.all(
      result.rows.map(async (key) => {
        // Get usage in last 24 hours
        const usageResult = await db.query(
          `SELECT
            COUNT(*)::INTEGER AS requests_24h,
            COALESCE(SUM(tokens_total), 0)::BIGINT AS tokens_24h,
            COALESCE(SUM(cost_cents), 0)::BIGINT AS cost_cents_24h
          FROM calos_api_key_usage_log
          WHERE key_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
          [key.key_id]
        );

        return {
          ...key,
          usage_24h: usageResult.rows[0]
        };
      })
    );

    res.json({
      status: 'success',
      data: {
        keys,
        total: keys.length
      }
    });

  } catch (error) {
    console.error('[TenantAPIKey] List error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list API keys'
    });
  }
});

// ============================================================================
// GET SINGLE API KEY DETAILS
// ============================================================================

/**
 * GET /api/keys/:keyId
 * Get details of a specific API key
 */
router.get('/:keyId', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;

    const result = await db.query(
      `SELECT
        key_id,
        key_prefix,
        key_suffix_last4,
        key_name,
        description,
        status,
        last_used_at,
        last_used_ip,
        last_used_endpoint,
        total_requests,
        rate_limit_per_minute,
        rate_limit_per_hour,
        rate_limit_per_day,
        ip_whitelist,
        allowed_endpoints,
        created_at,
        expires_at,
        revoked_at,
        revoked_reason
      FROM calos_platform_api_keys
      WHERE key_id = $1 AND tenant_id = $2`,
      [keyId, req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found'
      });
    }

    const key = result.rows[0];

    // Get usage summary
    const usageSummary = await db.query(
      `SELECT * FROM get_platform_api_key_usage_summary($1, NOW() - INTERVAL '30 days')`,
      [keyId]
    );

    res.json({
      status: 'success',
      data: {
        key,
        usage_summary_30d: usageSummary.rows[0]
      }
    });

  } catch (error) {
    console.error('[TenantAPIKey] Get error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get API key details'
    });
  }
});

// ============================================================================
// GET API KEY USAGE HISTORY
// ============================================================================

/**
 * GET /api/keys/:keyId/usage
 * Get detailed usage history for a specific API key
 */
router.get('/:keyId/usage', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { limit = 100, offset = 0, since } = req.query;

    // Verify key belongs to this tenant
    const keyCheck = await db.query(
      `SELECT key_id FROM calos_platform_api_keys
       WHERE key_id = $1 AND tenant_id = $2`,
      [keyId, req.tenantId]
    );

    if (keyCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found'
      });
    }

    // Build query
    let query = `
      SELECT
        log_id,
        request_id,
        endpoint,
        method,
        status_code,
        latency_ms,
        tokens_input,
        tokens_output,
        tokens_total,
        cost_cents,
        ip_address,
        user_agent,
        created_at
      FROM calos_api_key_usage_log
      WHERE key_id = $1
    `;

    const params = [keyId];

    if (since) {
      params.push(since);
      query += ` AND created_at >= $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM calos_api_key_usage_log
       WHERE key_id = $1`,
      [keyId]
    );

    res.json({
      status: 'success',
      data: {
        usage_logs: result.rows,
        total: countResult.rows[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('[TenantAPIKey] Usage error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get usage history'
    });
  }
});

// ============================================================================
// REVOKE API KEY
// ============================================================================

/**
 * DELETE /api/keys/:keyId
 * Revoke an API key (soft delete - mark as revoked)
 */
router.delete('/:keyId', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    // Verify key belongs to this tenant
    const keyCheck = await db.query(
      `SELECT key_id, key_name, status FROM calos_platform_api_keys
       WHERE key_id = $1 AND tenant_id = $2`,
      [keyId, req.tenantId]
    );

    if (keyCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found'
      });
    }

    const key = keyCheck.rows[0];

    if (key.status === 'revoked') {
      return res.status(400).json({
        status: 'error',
        error: 'API key is already revoked'
      });
    }

    // Revoke the key
    const result = await db.query(
      `SELECT revoke_platform_api_key($1, $2, $3) AS revoked`,
      [keyId, req.user.user_id, reason || 'Revoked by user']
    );

    if (!result.rows[0].revoked) {
      return res.status(500).json({
        status: 'error',
        error: 'Failed to revoke API key'
      });
    }

    res.json({
      status: 'success',
      message: `API key "${key.key_name}" has been revoked`,
      data: {
        key_id: keyId,
        revoked_at: new Date().toISOString()
      }
    });

    console.log(`[TenantAPIKey] Revoked key ${keyId} for tenant ${req.tenantId}`);

  } catch (error) {
    console.error('[TenantAPIKey] Revoke error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to revoke API key'
    });
  }
});

// ============================================================================
// UPDATE API KEY (name, description, rate limits)
// ============================================================================

/**
 * PATCH /api/keys/:keyId
 * Update API key metadata (not the key itself)
 */
router.patch('/:keyId', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { key_name, description, rate_limit_override } = req.body;

    // Verify key belongs to this tenant
    const keyCheck = await db.query(
      `SELECT key_id, status FROM calos_platform_api_keys
       WHERE key_id = $1 AND tenant_id = $2`,
      [keyId, req.tenantId]
    );

    if (keyCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found'
      });
    }

    if (keyCheck.rows[0].status === 'revoked') {
      return res.status(400).json({
        status: 'error',
        error: 'Cannot update revoked API key'
      });
    }

    // Build update query
    const updates = [];
    const params = [keyId];

    if (key_name) {
      params.push(key_name.trim());
      updates.push(`key_name = $${params.length}`);
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${params.length}`);
    }

    if (rate_limit_override) {
      // Check if tenant is enterprise (only they can override)
      const subscription = await db.query(
        `SELECT pt.tier_code
         FROM tenant_licenses tl
         JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
         WHERE tl.tenant_id = $1 AND tl.status = 'active'
         LIMIT 1`,
        [req.tenantId]
      );

      if (subscription.rows[0]?.tier_code === 'enterprise') {
        if (rate_limit_override.per_minute) {
          params.push(rate_limit_override.per_minute);
          updates.push(`rate_limit_per_minute = $${params.length}`);
        }
        if (rate_limit_override.per_hour) {
          params.push(rate_limit_override.per_hour);
          updates.push(`rate_limit_per_hour = $${params.length}`);
        }
        if (rate_limit_override.per_day) {
          params.push(rate_limit_override.per_day);
          updates.push(`rate_limit_per_day = $${params.length}`);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'No valid updates provided'
      });
    }

    const query = `
      UPDATE calos_platform_api_keys
      SET ${updates.join(', ')}
      WHERE key_id = $1
      RETURNING key_id, key_name, description, rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day
    `;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      message: 'API key updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[TenantAPIKey] Update error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to update API key'
    });
  }
});

module.exports = { initRoutes };
