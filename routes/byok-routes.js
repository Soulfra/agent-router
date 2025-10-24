/**
 * BYOK Routes (Bring Your Own Key) - Layer 2
 *
 * Allows tenants to add their own OpenAI/Anthropic/DeepSeek API keys.
 * This is Layer 2 of the two-layer system (CALOS → LLM Providers).
 *
 * When a tenant adds BYOK keys, they pay only the platform fee ($99/month)
 * instead of usage markup. They are billed directly by OpenAI/Anthropic.
 *
 * Uses existing lib/keyring.js for secure encryption.
 * Uses existing tenant_api_keys table from migration 021.
 */

const express = require('express');
const router = express.Router();

// Database connection and Keyring (injected via initRoutes)
let db = null;
let keyring = null;

/**
 * Initialize routes with database connection and keyring
 */
function initRoutes(database, keyringInstance) {
  db = database;
  keyring = keyringInstance;
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

    if (user.tenant_status !== 'active') {
      return res.status(403).json({
        status: 'error',
        error: 'Tenant account is not active'
      });
    }

    req.user = user;
    req.tenantId = user.tenant_id;

    next();
  } catch (error) {
    console.error('[BYOK] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

// ============================================================================
// ADD BYOK KEY
// ============================================================================

/**
 * POST /api/byok/add
 * Add a new BYOK API key (tenant's own OpenAI/Anthropic/DeepSeek key)
 */
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { provider, api_key, key_name, description } = req.body;

    // Validation
    if (!provider || !api_key || !key_name) {
      return res.status(400).json({
        status: 'error',
        error: 'provider, api_key, and key_name are required'
      });
    }

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'deepseek', 'together'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        status: 'error',
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
      });
    }

    // Verify the key works before storing
    console.log(`[BYOK] Verifying ${provider} key for tenant ${req.tenantId}...`);
    const isValid = await verifyProviderKey(provider, api_key);

    if (!isValid) {
      return res.status(400).json({
        status: 'error',
        error: `${provider} API key verification failed. Please check the key and try again.`
      });
    }

    // Use Keyring to store encrypted key
    await keyring.setCredential(
      provider,
      'api_key',
      api_key,
      {
        identifier: req.tenantId, // Use tenant_id as identifier
        description: description || `${key_name} for ${provider}`
      }
    );

    // Also store in tenant_api_keys table (migration 021)
    const keyPrefix = api_key.substring(0, Math.min(20, api_key.length));
    const result = await db.query(
      `INSERT INTO tenant_api_keys (
        tenant_id, provider, key_name, encrypted_api_key, key_prefix, active
      )
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING key_id, tenant_id, provider, key_name, key_prefix, active, created_at`,
      [req.tenantId, provider, key_name, 'encrypted_by_keyring', keyPrefix]
    );

    const savedKey = result.rows[0];

    res.json({
      status: 'success',
      message: `${provider} API key added successfully and verified`,
      data: {
        key_id: savedKey.key_id,
        provider: savedKey.provider,
        key_name: savedKey.key_name,
        key_prefix: savedKey.key_prefix,
        active: savedKey.active,
        created_at: savedKey.created_at
      }
    });

    console.log(`[BYOK] Added ${provider} key for tenant ${req.tenantId}`);

  } catch (error) {
    console.error('[BYOK] Add key error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add API key'
    });
  }
});

// ============================================================================
// LIST BYOK KEYS
// ============================================================================

/**
 * GET /api/byok
 * List all BYOK keys for the tenant (metadata only, not actual keys)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        key_id,
        provider,
        key_name,
        key_prefix,
        active,
        last_used_at,
        created_at
      FROM tenant_api_keys
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
      [req.tenantId]
    );

    res.json({
      status: 'success',
      data: {
        keys: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[BYOK] List keys error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list API keys'
    });
  }
});

// ============================================================================
// GET SINGLE BYOK KEY
// ============================================================================

/**
 * GET /api/byok/:keyId
 * Get details of a specific BYOK key
 */
router.get('/:keyId', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;

    const result = await db.query(
      `SELECT
        key_id,
        provider,
        key_name,
        key_prefix,
        active,
        last_used_at,
        created_at,
        created_by
      FROM tenant_api_keys
      WHERE key_id = $1 AND tenant_id = $2`,
      [keyId, req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found'
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[BYOK] Get key error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get API key details'
    });
  }
});

// ============================================================================
// DELETE BYOK KEY
// ============================================================================

/**
 * DELETE /api/byok/:keyId
 * Remove a BYOK key (soft delete - mark as inactive)
 */
router.delete('/:keyId', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;

    // Verify key belongs to tenant
    const keyCheck = await db.query(
      `SELECT key_id, provider, key_name FROM tenant_api_keys
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

    // Mark as inactive
    await db.query(
      `UPDATE tenant_api_keys
       SET active = FALSE
       WHERE key_id = $1`,
      [keyId]
    );

    // Also delete from keyring
    try {
      await keyring.deleteCredential(key.provider, 'api_key', req.tenantId);
    } catch (error) {
      console.warn('[BYOK] Keyring delete failed:', error.message);
    }

    res.json({
      status: 'success',
      message: `${key.provider} API key "${key.key_name}" has been removed`,
      data: {
        key_id: keyId,
        removed_at: new Date().toISOString()
      }
    });

    console.log(`[BYOK] Removed ${key.provider} key ${keyId} for tenant ${req.tenantId}`);

  } catch (error) {
    console.error('[BYOK] Delete key error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to remove API key'
    });
  }
});

// ============================================================================
// VERIFY BYOK KEY
// ============================================================================

/**
 * POST /api/byok/:keyId/verify
 * Verify a BYOK key still works
 */
router.post('/:keyId/verify', requireAuth, async (req, res) => {
  try {
    const { keyId } = req.params;

    // Get key info
    const keyResult = await db.query(
      `SELECT key_id, provider FROM tenant_api_keys
       WHERE key_id = $1 AND tenant_id = $2 AND active = TRUE`,
      [keyId, req.tenantId]
    );

    if (keyResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found or inactive'
      });
    }

    const key = keyResult.rows[0];

    // Retrieve the actual key from keyring
    const apiKey = await keyring.getCredential(key.provider, 'api_key', req.tenantId);

    // Verify it works
    const isValid = await verifyProviderKey(key.provider, apiKey);

    res.json({
      status: 'success',
      data: {
        key_id: keyId,
        provider: key.provider,
        is_valid: isValid,
        verified_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[BYOK] Verify key error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to verify API key'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify a provider API key works
 */
async function verifyProviderKey(provider, apiKey) {
  try {
    const axios = require('axios');

    switch (provider) {
      case 'openai':
        const openaiResponse = await axios.get('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 10000
        });
        return openaiResponse.status === 200;

      case 'anthropic':
        const anthropicResponse = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }]
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        return anthropicResponse.status === 200;

      case 'deepseek':
        const deepseekResponse = await axios.get('https://api.deepseek.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 10000
        });
        return deepseekResponse.status === 200;

      case 'together':
        const togetherResponse = await axios.get('https://api.together.xyz/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 10000
        });
        return togetherResponse.status === 200;

      default:
        return false;
    }
  } catch (error) {
    console.error(`[BYOK] ${provider} verification failed:`, error.message);
    return false;
  }
}

// ============================================================================
// BROWSER BYOK (GitHub Pages Bridge)
// ============================================================================

/**
 * POST /api/byok/browser/save
 * Save browser-encrypted API key (from GitHub Pages bridge)
 *
 * This is for individual users, not tenants
 * Key is already encrypted by browser Web Crypto API
 */
router.post('/browser/save', async (req, res) => {
  try {
    const { provider, encrypted, addedAt } = req.body;

    // Validate
    if (!provider || !encrypted || !encrypted.ciphertext || !encrypted.iv) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields',
        required: ['provider', 'encrypted.ciphertext', 'encrypted.iv']
      });
    }

    const validProviders = ['openai', 'anthropic', 'deepseek'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid provider',
        valid: validProviders
      });
    }

    // Get user ID from session/auth
    const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

    if (userId === 'anonymous') {
      return res.status(401).json({
        status: 'error',
        error: 'Authentication required',
        message: 'Please log in to save API keys'
      });
    }

    // Store encrypted key via Keyring
    // Key is already encrypted by browser, Keyring will double-encrypt
    const encryptedValue = JSON.stringify(encrypted);

    await keyring.setCredential(provider, 'api_key', encryptedValue, {
      identifier: `user_${userId}`, // Different namespace than tenants
      description: `Browser BYOK for user ${userId}`
    });

    console.log(`[BYOK Browser] Saved ${provider} key for user ${userId}`);

    res.json({
      status: 'success',
      provider,
      userId,
      message: 'API key saved securely',
      storage: 'encrypted_database'
    });

  } catch (error) {
    console.error('[BYOK Browser] Save error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to save API key',
      message: error.message
    });
  }
});

/**
 * GET /api/byok/browser/list
 * List browser BYOK keys (metadata only)
 */
router.get('/browser/list', async (req, res) => {
  try {
    const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

    if (userId === 'anonymous') {
      return res.status(401).json({
        status: 'error',
        error: 'Authentication required'
      });
    }

    // Query service_credentials table for user's browser BYOK keys
    const result = await db.query(
      `SELECT
        service_name as provider,
        credential_type,
        created_at as added_at,
        updated_at,
        encryption_method
      FROM service_credentials
      WHERE identifier = $1 AND credential_type = 'api_key'
      ORDER BY created_at DESC`,
      [`user_${userId}`]
    );

    const keys = result.rows.map(row => ({
      provider: row.provider,
      addedAt: row.added_at,
      lastUpdated: row.updated_at,
      encrypted: true,
      encryption: row.encryption_method
    }));

    res.json({
      status: 'success',
      userId,
      keys,
      count: keys.length
    });

  } catch (error) {
    console.error('[BYOK Browser] List error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to list API keys',
      message: error.message
    });
  }
});

/**
 * DELETE /api/byok/browser/remove
 * Remove browser BYOK key
 */
router.delete('/browser/remove', async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required field: provider'
      });
    }

    const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

    if (userId === 'anonymous') {
      return res.status(401).json({
        status: 'error',
        error: 'Authentication required'
      });
    }

    // Delete from service_credentials table
    const result = await db.query(
      `DELETE FROM service_credentials
      WHERE service_name = $1 AND identifier = $2 AND credential_type = 'api_key'
      RETURNING service_name`,
      [provider, `user_${userId}`]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'API key not found',
        provider,
        userId
      });
    }

    console.log(`[BYOK Browser] Removed ${provider} key for user ${userId}`);

    res.json({
      status: 'success',
      provider,
      userId,
      message: 'API key removed'
    });

  } catch (error) {
    console.error('[BYOK Browser] Remove error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to remove API key',
      message: error.message
    });
  }
});

/**
 * GET /api/byok/browser/status
 * Get browser BYOK status (which keys configured, usage stats)
 */
router.get('/browser/status', async (req, res) => {
  try {
    const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

    if (userId === 'anonymous') {
      return res.status(401).json({
        status: 'error',
        error: 'Authentication required'
      });
    }

    // Get configured keys
    const keysResult = await db.query(
      `SELECT
        service_name as provider,
        created_at as added_at
      FROM service_credentials
      WHERE identifier = $1 AND credential_type = 'api_key'`,
      [`user_${userId}`]
    );

    const keys = {};
    keysResult.rows.forEach(row => {
      keys[row.provider] = {
        configured: true,
        addedAt: row.added_at
      };
    });

    // Get usage stats from usage_events
    const usageResult = await db.query(
      `SELECT
        provider,
        COUNT(*) as calls,
        SUM(total_tokens) as total_tokens,
        SUM(cost_cents) as total_cost_cents
      FROM usage_events
      WHERE user_id = $1 AND status = 'success'
      GROUP BY provider`,
      [userId]
    );

    const usage = {};
    usageResult.rows.forEach(row => {
      usage[row.provider] = {
        calls: parseInt(row.calls),
        tokens: parseInt(row.total_tokens),
        costCents: parseInt(row.total_cost_cents)
      };
    });

    res.json({
      status: 'success',
      userId,
      keys,
      usage,
      byokEnabled: Object.keys(keys).length > 0
    });

  } catch (error) {
    console.error('[BYOK Browser] Status error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get BYOK status',
      message: error.message
    });
  }
});

module.exports = { initRoutes };
