/**
 * User Data Vault
 *
 * High-level API for encrypting and storing user data in PostgreSQL.
 * Wraps SimpleEncryption with database operations.
 *
 * Features:
 * - Store arbitrary user data (JSON objects) encrypted
 * - Organize data by namespace (e.g., 'oauth_tokens', 'api_keys', 'preferences')
 * - Automatic encryption/decryption
 * - Metadata tracking (created_at, updated_at, access count)
 * - Expiration support
 * - Access logging
 *
 * Security:
 * - All data encrypted with AES-256-GCM before storage
 * - Namespace isolation (users can't access other users' data)
 * - Audit trail of all access
 * - Optional TTL (time-to-live) for temporary data
 *
 * Usage:
 *   const vault = new UserDataVault({ db, encryption });
 *
 *   // Store user's OpenAI API key
 *   await vault.store(userId, 'api_keys', 'openai', {
 *     key: 'sk-...',
 *     created: new Date()
 *   });
 *
 *   // Retrieve it later
 *   const data = await vault.retrieve(userId, 'api_keys', 'openai');
 *   console.log(data.key); // 'sk-...'
 *
 *   // Store with expiration (e.g., OAuth tokens)
 *   await vault.store(userId, 'oauth_tokens', 'google', {
 *     access_token: '...',
 *     refresh_token: '...'
 *   }, { ttl: 3600 }); // Expires in 1 hour
 */

const SimpleEncryption = require('./simple-encryption');

class UserDataVault {
  constructor(config = {}) {
    this.db = config.db;
    this.encryption = config.encryption || new SimpleEncryption();
    this.verbose = config.verbose || false;

    if (!this.db) {
      throw new Error('[UserDataVault] Database connection required');
    }

    console.log('[UserDataVault] Initialized');
  }

  /**
   * Store encrypted data for a user
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category (e.g., 'api_keys', 'oauth_tokens')
   * @param {string} key - Data identifier within namespace
   * @param {Object} data - Data to store (will be encrypted)
   * @param {Object} options - Optional settings
   * @param {number} options.ttl - Time to live in seconds
   * @param {Object} options.metadata - Additional metadata to store (not encrypted)
   * @returns {Promise<string>} Vault entry ID
   */
  async store(userId, namespace, key, data, options = {}) {
    try {
      // Encrypt the data
      const encryptedData = this.encryption.encryptObject(data);

      // Calculate expiration if TTL provided
      const expiresAt = options.ttl
        ? new Date(Date.now() + options.ttl * 1000)
        : null;

      // Store in database
      const result = await this.db.query(`
        INSERT INTO user_data_vault (
          user_id, namespace, key, encrypted_data,
          expires_at, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, namespace, key)
        DO UPDATE SET
          encrypted_data = EXCLUDED.encrypted_data,
          expires_at = EXCLUDED.expires_at,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `, [
        userId,
        namespace,
        key,
        encryptedData,
        expiresAt,
        JSON.stringify(options.metadata || {})
      ]);

      if (this.verbose) {
        console.log(`[UserDataVault] Stored: ${userId}/${namespace}/${key}`);
      }

      return result.rows[0].id;

    } catch (error) {
      console.error('[UserDataVault] Store error:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve and decrypt data for a user
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category
   * @param {string} key - Data identifier
   * @param {Object} options - Optional settings
   * @param {boolean} options.trackAccess - Log access (default: true)
   * @returns {Promise<Object|null>} Decrypted data or null if not found/expired
   */
  async retrieve(userId, namespace, key, options = {}) {
    const trackAccess = options.trackAccess !== false;

    try {
      // Fetch from database
      const result = await this.db.query(`
        SELECT id, encrypted_data, expires_at, metadata, access_count
        FROM user_data_vault
        WHERE user_id = $1 AND namespace = $2 AND key = $3
      `, [userId, namespace, key]);

      if (result.rows.length === 0) {
        if (this.verbose) {
          console.log(`[UserDataVault] Not found: ${userId}/${namespace}/${key}`);
        }
        return null;
      }

      const entry = result.rows[0];

      // Check expiration
      if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
        if (this.verbose) {
          console.log(`[UserDataVault] Expired: ${userId}/${namespace}/${key}`);
        }
        // Delete expired entry
        await this.delete(userId, namespace, key);
        return null;
      }

      // Decrypt data
      const decryptedData = this.encryption.decryptObject(entry.encrypted_data);

      // Track access
      if (trackAccess) {
        await this.db.query(`
          UPDATE user_data_vault
          SET access_count = access_count + 1,
              last_accessed_at = NOW()
          WHERE id = $1
        `, [entry.id]);
      }

      if (this.verbose) {
        console.log(`[UserDataVault] Retrieved: ${userId}/${namespace}/${key} (access count: ${entry.access_count + 1})`);
      }

      return decryptedData;

    } catch (error) {
      console.error('[UserDataVault] Retrieve error:', error.message);
      throw error;
    }
  }

  /**
   * Delete data for a user
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category
   * @param {string} key - Data identifier
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(userId, namespace, key) {
    try {
      const result = await this.db.query(`
        DELETE FROM user_data_vault
        WHERE user_id = $1 AND namespace = $2 AND key = $3
        RETURNING id
      `, [userId, namespace, key]);

      const deleted = result.rows.length > 0;

      if (this.verbose) {
        console.log(`[UserDataVault] Delete: ${userId}/${namespace}/${key} - ${deleted ? 'success' : 'not found'}`);
      }

      return deleted;

    } catch (error) {
      console.error('[UserDataVault] Delete error:', error.message);
      throw error;
    }
  }

  /**
   * List all keys in a namespace for a user
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category
   * @returns {Promise<Array>} List of keys with metadata
   */
  async list(userId, namespace) {
    try {
      const result = await this.db.query(`
        SELECT key, metadata, created_at, updated_at,
               last_accessed_at, access_count, expires_at
        FROM user_data_vault
        WHERE user_id = $1 AND namespace = $2
        AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY key
      `, [userId, namespace]);

      return result.rows.map(row => ({
        key: row.key,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count,
        expiresAt: row.expires_at
      }));

    } catch (error) {
      console.error('[UserDataVault] List error:', error.message);
      throw error;
    }
  }

  /**
   * Delete all expired entries (cleanup job)
   *
   * @returns {Promise<number>} Number of entries deleted
   */
  async cleanupExpired() {
    try {
      const result = await this.db.query(`
        DELETE FROM user_data_vault
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id
      `);

      const count = result.rows.length;

      if (this.verbose && count > 0) {
        console.log(`[UserDataVault] Cleaned up ${count} expired entries`);
      }

      return count;

    } catch (error) {
      console.error('[UserDataVault] Cleanup error:', error.message);
      throw error;
    }
  }

  /**
   * Update metadata without changing encrypted data
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category
   * @param {string} key - Data identifier
   * @param {Object} metadata - New metadata
   * @returns {Promise<boolean>} True if updated
   */
  async updateMetadata(userId, namespace, key, metadata) {
    try {
      const result = await this.db.query(`
        UPDATE user_data_vault
        SET metadata = $4, updated_at = NOW()
        WHERE user_id = $1 AND namespace = $2 AND key = $3
        RETURNING id
      `, [userId, namespace, key, JSON.stringify(metadata)]);

      return result.rows.length > 0;

    } catch (error) {
      console.error('[UserDataVault] Update metadata error:', error.message);
      throw error;
    }
  }

  /**
   * Check if data exists
   *
   * @param {string} userId - User ID
   * @param {string} namespace - Data category
   * @param {string} key - Data identifier
   * @returns {Promise<boolean>} True if exists and not expired
   */
  async exists(userId, namespace, key) {
    try {
      const result = await this.db.query(`
        SELECT 1 FROM user_data_vault
        WHERE user_id = $1 AND namespace = $2 AND key = $3
        AND (expires_at IS NULL OR expires_at > NOW())
      `, [userId, namespace, key]);

      return result.rows.length > 0;

    } catch (error) {
      console.error('[UserDataVault] Exists check error:', error.message);
      throw error;
    }
  }

  /**
   * Get vault statistics for a user
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Statistics
   */
  async getStats(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          namespace,
          COUNT(*) as count,
          SUM(access_count) as total_accesses,
          MAX(last_accessed_at) as most_recent_access
        FROM user_data_vault
        WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
        GROUP BY namespace
      `, [userId]);

      const stats = {
        userId,
        namespaces: {},
        totalEntries: 0,
        totalAccesses: 0
      };

      for (const row of result.rows) {
        stats.namespaces[row.namespace] = {
          count: parseInt(row.count),
          totalAccesses: parseInt(row.total_accesses || 0),
          mostRecentAccess: row.most_recent_access
        };
        stats.totalEntries += parseInt(row.count);
        stats.totalAccesses += parseInt(row.total_accesses || 0);
      }

      return stats;

    } catch (error) {
      console.error('[UserDataVault] Get stats error:', error.message);
      throw error;
    }
  }
}

module.exports = UserDataVault;
