/**
 * API Key Manager
 *
 * Manages API keys for CALOS Email API
 *
 * Features:
 * - Generate secure API keys
 * - Validate API keys
 * - Track usage per key
 * - Rate limiting per key
 * - Key rotation
 *
 * Storage: Google Sheets
 *
 * Usage:
 *   const keyManager = new APIKeyManager({ db });
 *   const key = await keyManager.createKey('user123', 'free');
 *   const valid = await keyManager.validateKey(key);
 */

const crypto = require('crypto');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');

class APIKeyManager {
  constructor(config = {}) {
    // Database adapter
    this.db = config.db || new GoogleSheetsDBAdapter();

    // Key prefix (for easy identification)
    this.keyPrefix = config.keyPrefix || 'calos_';

    // Rate limits by tier
    this.tierLimits = {
      free: {
        monthly: 100,
        hourly: 10,
        name: 'Free Tier'
      },
      pro: {
        monthly: 10000,
        hourly: 100,
        name: 'Pro Tier'
      },
      enterprise: {
        monthly: -1,  // Unlimited
        hourly: 1000,
        name: 'Enterprise Tier'
      }
    };

    console.log('[APIKeyManager] Initialized');
  }

  /**
   * Initialize (ensure api_keys table exists)
   */
  async init() {
    await this.db.init();

    // Ensure api_keys sheet exists
    if (!this.db.sheetNames.apiKeys) {
      this.db.sheetNames.apiKeys = 'api_keys';
    }

    console.log('[APIKeyManager] Ready');
  }

  /**
   * Generate secure API key
   * @private
   */
  generateKey() {
    // Generate 32 random bytes → hex string
    const randomPart = crypto.randomBytes(32).toString('hex');

    // Add prefix for identification
    return `${this.keyPrefix}${randomPart}`;
  }

  /**
   * Hash API key for storage
   * @private
   */
  hashKey(key) {
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex');
  }

  /**
   * Create new API key
   *
   * @param {string} userId - User ID
   * @param {string} tier - Tier ('free', 'pro', 'enterprise')
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Key data
   */
  async createKey(userId, tier = 'free', metadata = {}) {
    try {
      await this.init();

      if (!this.tierLimits[tier]) {
        throw new Error(`Invalid tier: ${tier}`);
      }

      // Generate key
      const key = this.generateKey();
      const keyHash = this.hashKey(key);

      // Store in database (hash only, not plain key!)
      await this.db.insert(this.db.sheetNames.apiKeys, {
        user_id: userId,
        key_hash: keyHash,
        key_prefix: key.substring(0, 12) + '...', // For display only
        tier,
        tier_name: this.tierLimits[tier].name,
        monthly_limit: this.tierLimits[tier].monthly,
        hourly_limit: this.tierLimits[tier].hourly,
        usage_count: 0,
        last_used_at: null,
        created_at: new Date().toISOString(),
        revoked: 'false',
        revoked_at: null,
        metadata: JSON.stringify(metadata)
      });

      console.log(`[APIKeyManager] Created ${tier} key for user ${userId}`);

      return {
        key,              // ONLY TIME we return plain key!
        userId,
        tier,
        tierName: this.tierLimits[tier].name,
        limits: this.tierLimits[tier],
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[APIKeyManager] Error creating key:', error);
      throw error;
    }
  }

  /**
   * Validate API key
   *
   * @param {string} key - Plain API key
   * @returns {Object|null} Key data if valid, null if invalid
   */
  async validateKey(key) {
    try {
      await this.init();

      if (!key || !key.startsWith(this.keyPrefix)) {
        return null;
      }

      // Hash the key
      const keyHash = this.hashKey(key);

      // Find in database
      const record = await this.db.findOne(this.db.sheetNames.apiKeys, {
        key_hash: keyHash,
        revoked: 'false'
      });

      if (!record) {
        return null;
      }

      // Update last used
      await this.db.update(
        this.db.sheetNames.apiKeys,
        { key_hash: keyHash },
        {
          last_used_at: new Date().toISOString(),
          usage_count: parseInt(record.usage_count || 0) + 1
        }
      );

      return {
        userId: record.user_id,
        tier: record.tier,
        tierName: record.tier_name,
        limits: {
          monthly: parseInt(record.monthly_limit),
          hourly: parseInt(record.hourly_limit)
        },
        usageCount: parseInt(record.usage_count || 0) + 1,
        createdAt: record.created_at
      };

    } catch (error) {
      console.error('[APIKeyManager] Error validating key:', error);
      return null;
    }
  }

  /**
   * Revoke API key
   *
   * @param {string} key - Plain API key
   * @returns {boolean} Success
   */
  async revokeKey(key) {
    try {
      await this.init();

      const keyHash = this.hashKey(key);

      await this.db.update(
        this.db.sheetNames.apiKeys,
        { key_hash: keyHash },
        {
          revoked: 'true',
          revoked_at: new Date().toISOString()
        }
      );

      console.log(`[APIKeyManager] Revoked key ${key.substring(0, 12)}...`);

      return true;

    } catch (error) {
      console.error('[APIKeyManager] Error revoking key:', error);
      return false;
    }
  }

  /**
   * Get all keys for user
   *
   * @param {string} userId - User ID
   * @returns {Array} Keys
   */
  async getUserKeys(userId) {
    try {
      await this.init();

      const keys = await this.db.query(this.db.sheetNames.apiKeys, {
        user_id: userId
      });

      // Don't return hashes, just metadata
      return keys.map(key => ({
        keyPrefix: key.key_prefix,
        tier: key.tier,
        tierName: key.tier_name,
        usageCount: parseInt(key.usage_count || 0),
        lastUsedAt: key.last_used_at,
        createdAt: key.created_at,
        revoked: key.revoked === 'true'
      }));

    } catch (error) {
      console.error('[APIKeyManager] Error getting user keys:', error);
      return [];
    }
  }

  /**
   * Upgrade tier
   *
   * @param {string} key - Plain API key
   * @param {string} newTier - New tier
   * @returns {boolean} Success
   */
  async upgradeTier(key, newTier) {
    try {
      await this.init();

      if (!this.tierLimits[newTier]) {
        throw new Error(`Invalid tier: ${newTier}`);
      }

      const keyHash = this.hashKey(key);

      await this.db.update(
        this.db.sheetNames.apiKeys,
        { key_hash: keyHash },
        {
          tier: newTier,
          tier_name: this.tierLimits[newTier].name,
          monthly_limit: this.tierLimits[newTier].monthly,
          hourly_limit: this.tierLimits[newTier].hourly
        }
      );

      console.log(`[APIKeyManager] Upgraded key to ${newTier}`);

      return true;

    } catch (error) {
      console.error('[APIKeyManager] Error upgrading tier:', error);
      return false;
    }
  }

  /**
   * Get key statistics
   *
   * @returns {Object} Stats
   */
  async getStats() {
    try {
      await this.init();

      const allKeys = await this.db.query(this.db.sheetNames.apiKeys);

      const stats = {
        total: allKeys.length,
        active: allKeys.filter(k => k.revoked !== 'true').length,
        revoked: allKeys.filter(k => k.revoked === 'true').length,
        byTier: {
          free: allKeys.filter(k => k.tier === 'free').length,
          pro: allKeys.filter(k => k.tier === 'pro').length,
          enterprise: allKeys.filter(k => k.tier === 'enterprise').length
        },
        totalUsage: allKeys.reduce((sum, k) => sum + parseInt(k.usage_count || 0), 0)
      };

      return stats;

    } catch (error) {
      console.error('[APIKeyManager] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = APIKeyManager;
