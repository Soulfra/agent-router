/**
 * Vault Bridge
 *
 * Connects Keyring (encrypted storage) to DataSource (AI model access).
 * Automatically retrieves API keys based on context (user, tenant, session).
 *
 * "Builds Cal's font" - Contextual key injection per session.
 * Like giving Cal his own voice/identity per conversation.
 *
 * Fallback Chain:
 * 1. Tenant BYOK (Bring Your Own Key) - customer's own API keys
 * 2. User personal keys - individual user's keys
 * 3. System keys - platform defaults from .env
 * 4. Error - no keys available
 */

const crypto = require('crypto');

class VaultBridge {
  constructor(options = {}) {
    this.keyring = options.keyring; // Keyring instance
    this.db = options.db;

    if (!this.keyring) {
      throw new Error('Keyring required for VaultBridge');
    }

    console.log('[VaultBridge] Initialized - Auto key retrieval enabled');
  }

  /**
   * Get API key for a provider with context-aware fallback
   *
   * @param {string} provider - 'openai', 'anthropic', 'deepseek', 'together', 'ollama'
   * @param {object} context - Request context { tenantId, userId, sessionId, originDomain }
   * @returns {Promise<object>} - { key, source, keyId }
   */
  async getKey(provider, context = {}) {
    const {
      tenantId = null,
      userId = null,
      sessionId = null,
      originDomain = 'unknown'
    } = context;

    console.log(`[VaultBridge] Retrieving ${provider} key (tenant: ${tenantId}, user: ${userId})`);

    try {
      // 1. Try tenant BYOK first (highest priority)
      if (tenantId) {
        try {
          const tenantKey = await this.keyring.getCredential(provider, 'api_key', tenantId);
          if (tenantKey) {
            console.log(`[VaultBridge] ✓ Using tenant BYOK for ${provider}`);

            // Log usage
            await this._logKeyUsage(provider, 'tenant_byok', tenantId, userId, sessionId);

            return {
              key: tenantKey,
              source: 'tenant_byok',
              keyId: tenantId,
              billing: 'tenant' // Tenant pays provider directly
            };
          }
        } catch (error) {
          // Tenant key not found, continue fallback
          console.log(`[VaultBridge] Tenant BYOK not found for ${provider}, trying user key...`);
        }
      }

      // 2. Try user personal key
      if (userId) {
        try {
          const userKey = await this.keyring.getCredential(provider, 'api_key', userId);
          if (userKey) {
            console.log(`[VaultBridge] ✓ Using user personal key for ${provider}`);

            // Log usage
            await this._logKeyUsage(provider, 'user_key', userId, userId, sessionId);

            return {
              key: userKey,
              source: 'user_key',
              keyId: userId,
              billing: 'user' // User pays via credits
            };
          }
        } catch (error) {
          // User key not found, continue fallback
          console.log(`[VaultBridge] User key not found for ${provider}, trying system key...`);
        }
      }

      // 3. Try system default key (from .env)
      const systemKey = process.env[this._getEnvKeyName(provider)];
      if (systemKey) {
        console.log(`[VaultBridge] ✓ Using system default key for ${provider}`);

        // Log usage
        await this._logKeyUsage(provider, 'system_key', null, userId, sessionId);

        return {
          key: systemKey,
          source: 'system_key',
          keyId: 'system',
          billing: 'platform' // Platform pays provider, charges usage markup
        };
      }

      // 4. No keys available
      throw new Error(`No ${provider} API key available. Add via BYOK, user settings, or set ${this._getEnvKeyName(provider)} in .env`);

    } catch (error) {
      console.error(`[VaultBridge] Error retrieving ${provider} key:`, error.message);
      throw error;
    }
  }

  /**
   * Store API key in vault
   *
   * @param {string} provider - Provider name
   * @param {string} key - API key
   * @param {string} scope - 'tenant', 'user', or 'system'
   * @param {string} identifier - Tenant ID or User ID
   * @param {object} options - Additional options
   */
  async storeKey(provider, key, scope, identifier, options = {}) {
    try {
      // Verify key works before storing
      const isValid = await this._verifyKey(provider, key);

      if (!isValid) {
        throw new Error(`${provider} API key verification failed`);
      }

      // Store in keyring
      await this.keyring.setCredential(
        provider,
        'api_key',
        key,
        {
          identifier: identifier,
          description: options.description || `${scope} key for ${provider}`,
          scopes: options.scopes,
          expiresAt: options.expiresAt
        }
      );

      console.log(`[VaultBridge] ✓ Stored ${provider} key for ${scope}:${identifier}`);

      // If tenant BYOK, also record in tenant_api_keys table
      if (scope === 'tenant' && this.db) {
        const keyPrefix = key.substring(0, Math.min(20, key.length));
        await this.db.query(
          `INSERT INTO tenant_api_keys (
            tenant_id, provider, key_name, encrypted_api_key, key_prefix, active
          ) VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT (tenant_id, provider)
          DO UPDATE SET
            encrypted_api_key = EXCLUDED.encrypted_api_key,
            key_prefix = EXCLUDED.key_prefix,
            active = TRUE,
            updated_at = CURRENT_TIMESTAMP`,
          [identifier, provider, `${scope} key`, 'encrypted_by_keyring', keyPrefix]
        );
      }

      return { success: true, provider, scope, identifier };

    } catch (error) {
      console.error(`[VaultBridge] Error storing ${provider} key:`, error.message);
      throw error;
    }
  }

  /**
   * Remove API key from vault
   */
  async deleteKey(provider, scope, identifier) {
    try {
      await this.keyring.deleteCredential(provider, 'api_key', identifier);

      // Also delete from tenant_api_keys if applicable
      if (scope === 'tenant' && this.db) {
        await this.db.query(
          `UPDATE tenant_api_keys
           SET active = FALSE
           WHERE tenant_id = $1 AND provider = $2`,
          [identifier, provider]
        );
      }

      console.log(`[VaultBridge] ✓ Deleted ${provider} key for ${scope}:${identifier}`);
      return { success: true };

    } catch (error) {
      console.error(`[VaultBridge] Error deleting ${provider} key:`, error.message);
      throw error;
    }
  }

  /**
   * List all available keys for a context
   */
  async listKeys(context = {}) {
    const { tenantId = null, userId = null } = context;
    const availableKeys = [];

    const providers = ['openai', 'anthropic', 'deepseek', 'together', 'ollama'];

    for (const provider of providers) {
      // Check tenant BYOK
      if (tenantId) {
        try {
          await this.keyring.getCredential(provider, 'api_key', tenantId);
          availableKeys.push({ provider, scope: 'tenant', identifier: tenantId });
        } catch (error) {
          // Not available
        }
      }

      // Check user key
      if (userId) {
        try {
          await this.keyring.getCredential(provider, 'api_key', userId);
          availableKeys.push({ provider, scope: 'user', identifier: userId });
        } catch (error) {
          // Not available
        }
      }

      // Check system key
      if (process.env[this._getEnvKeyName(provider)]) {
        availableKeys.push({ provider, scope: 'system', identifier: 'system' });
      }
    }

    return availableKeys;
  }

  /**
   * Generate session-scoped ephemeral credential
   * "Builds Cal's voice" - unique identity per session
   *
   * @param {string} provider - Provider name
   * @param {object} context - Session context
   * @returns {Promise<object>} - { key, sessionId, expiresAt }
   */
  async generateSessionKey(provider, context = {}) {
    const { sessionId, tenantId, userId } = context;

    // Get the actual key first
    const keyData = await this.getKey(provider, context);

    // Generate ephemeral session token (wrapped key)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Store session mapping in memory or database
    if (this.db) {
      await this.db.query(
        `INSERT INTO session_keys (
          session_id, provider, session_token, actual_key_source,
          tenant_id, user_id, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sessionId, provider, sessionToken, keyData.source, tenantId, userId, expiresAt]
      );
    }

    console.log(`[VaultBridge] Generated session key for ${provider} (session: ${sessionId})`);

    return {
      key: keyData.key, // Still use actual key, but tracked per session
      sessionToken,
      sessionId,
      expiresAt,
      source: keyData.source
    };
  }

  // ========================================================================
  // Internal Helpers
  // ========================================================================

  /**
   * Get environment variable name for provider
   */
  _getEnvKeyName(provider) {
    const envMap = {
      'openai': 'OPENAI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY',
      'deepseek': 'DEEPSEEK_API_KEY',
      'together': 'TOGETHER_API_KEY',
      'ollama': 'OLLAMA_API_URL' // Not a key, but URL
    };

    return envMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Verify API key works
   */
  async _verifyKey(provider, key) {
    try {
      const axios = require('axios');

      switch (provider) {
        case 'openai':
          const openaiResponse = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
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
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          return anthropicResponse.status === 200;

        case 'deepseek':
          const deepseekResponse = await axios.get('https://api.deepseek.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
            timeout: 10000
          });
          return deepseekResponse.status === 200;

        case 'together':
          const togetherResponse = await axios.get('https://api.together.xyz/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
            timeout: 10000
          });
          return togetherResponse.status === 200;

        case 'ollama':
          // Ollama doesn't use API keys, just check URL
          return true;

        default:
          return false;
      }
    } catch (error) {
      console.error(`[VaultBridge] ${provider} verification failed:`, error.message);
      return false;
    }
  }

  /**
   * Log key usage for billing/analytics
   */
  async _logKeyUsage(provider, source, tenantId, userId, sessionId) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO key_usage_log (
          provider, key_source, tenant_id, user_id, session_id, used_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [provider, source, tenantId, userId, sessionId]
      );
    } catch (error) {
      // Don't fail on logging errors
      console.warn('[VaultBridge] Failed to log key usage:', error.message);
    }
  }
}

module.exports = VaultBridge;
