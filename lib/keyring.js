/**
 * Keyring - Secure Credential Management
 *
 * Manages API keys, tokens, and secrets for different services.
 * Integrates with system keychain (macOS Keychain, Linux Secret Service).
 * Provides encrypted database storage as fallback.
 */

const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class Keyring {
  constructor(db, options = {}) {
    this.db = db;

    // Encryption settings
    this.algorithm = 'aes-256-gcm';
    this.encryptionKey = options.encryptionKey || this._getEncryptionKey();

    // Prefer system keychain if available
    this.useSystemKeychain = options.useSystemKeychain !== false;
    this.platform = process.platform; // 'darwin', 'linux', 'win32'
  }

  /**
   * Store a credential securely
   * @param {string} service - Service name (github, openai, anthropic)
   * @param {string} type - Credential type (api_key, oauth_token, ssh_key)
   * @param {string} value - The secret value
   * @param {object} options - Additional options
   */
  async setCredential(service, type, value, options = {}) {
    const identifier = options.identifier || 'default';

    // Try system keychain first
    if (this.useSystemKeychain) {
      try {
        await this._setSystemKeychain(service, type, identifier, value);
        console.log(`[Keyring] Stored ${service}:${type} in system keychain`);

        // Store metadata in database (without actual credential)
        await this._storeCredentialMetadata(service, type, identifier, options, 'system_keychain');

        return { stored: 'system_keychain', service, type };

      } catch (error) {
        console.warn(`[Keyring] System keychain unavailable, using database: ${error.message}`);
      }
    }

    // Fallback to encrypted database storage
    const encrypted = this._encrypt(value);

    await this.db.query(
      `INSERT INTO service_credentials (
        service_name, credential_type, identifier,
        encrypted_value, encryption_method, iv, auth_tag,
        description, scopes, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (service_name, credential_type, identifier)
      DO UPDATE SET
        encrypted_value = EXCLUDED.encrypted_value,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        updated_at = CURRENT_TIMESTAMP`,
      [
        service,
        type,
        identifier,
        encrypted.ciphertext,
        this.algorithm,
        encrypted.iv,
        encrypted.authTag,
        options.description || null,
        options.scopes || null,
        options.expiresAt || null
      ]
    );

    console.log(`[Keyring] Stored ${service}:${type} in encrypted database`);

    return { stored: 'database', service, type };
  }

  /**
   * Retrieve a credential
   * @param {string} service - Service name
   * @param {string} type - Credential type
   * @param {string} identifier - Account identifier
   */
  async getCredential(service, type = 'api_key', identifier = 'default') {
    // Try system keychain first
    if (this.useSystemKeychain) {
      try {
        const value = await this._getSystemKeychain(service, type, identifier);
        if (value) {
          // Log usage
          await this._logCredentialUsage(service, type, identifier, 'system_keychain');
          return value;
        }
      } catch (error) {
        // Fall through to database
      }
    }

    // Try database
    const result = await this.db.query(
      `SELECT encrypted_value, iv, auth_tag, encryption_method
       FROM service_credentials
       WHERE service_name = $1 AND credential_type = $2 AND identifier = $3 AND is_active = true`,
      [service, type, identifier]
    );

    if (result.rows.length === 0) {
      throw new Error(`Credential not found: ${service}:${type}:${identifier}`);
    }

    const row = result.rows[0];
    const decrypted = this._decrypt({
      ciphertext: row.encrypted_value,
      iv: row.iv,
      authTag: row.auth_tag
    });

    // Log usage
    await this._logCredentialUsage(service, type, identifier, 'database');

    return decrypted;
  }

  /**
   * List all stored credentials (metadata only, not values)
   */
  async listCredentials() {
    const result = await this.db.query(
      `SELECT service_name, credential_type, identifier, description,
              is_active, is_verified, last_used, expires_at, created_at
       FROM service_credentials
       WHERE is_active = true
       ORDER BY service_name, credential_type`
    );

    return result.rows;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(service, type, identifier = 'default') {
    // Delete from system keychain if present
    if (this.useSystemKeychain) {
      try {
        await this._deleteSystemKeychain(service, type, identifier);
      } catch (error) {
        // May not exist in system keychain
      }
    }

    // Delete from database
    await this.db.query(
      `DELETE FROM service_credentials
       WHERE service_name = $1 AND credential_type = $2 AND identifier = $3`,
      [service, type, identifier]
    );

    console.log(`[Keyring] Deleted ${service}:${type}:${identifier}`);
  }

  /**
   * Verify a credential works
   */
  async verifyCredential(service, type, identifier = 'default') {
    try {
      const value = await this.getCredential(service, type, identifier);

      // Service-specific verification
      let verified = false;

      switch (service) {
        case 'github':
          verified = await this._verifyGitHub(value);
          break;
        case 'openai':
          verified = await this._verifyOpenAI(value);
          break;
        case 'anthropic':
          verified = await this._verifyAnthropic(value);
          break;
        default:
          verified = !!value; // Just check it exists
      }

      // Update verification status in database
      await this.db.query(
        `UPDATE service_credentials
         SET is_verified = $1, updated_at = CURRENT_TIMESTAMP
         WHERE service_name = $2 AND credential_type = $3 AND identifier = $4`,
        [verified, service, type, identifier]
      );

      return verified;

    } catch (error) {
      console.error(`[Keyring] Verification failed for ${service}:${type}:`, error.message);
      return false;
    }
  }

  // ========================================================================
  // System Keychain Integration
  // ========================================================================

  /**
   * Store in system keychain (macOS Keychain, Linux Secret Service)
   */
  async _setSystemKeychain(service, type, identifier, value) {
    const accountName = `${service}:${type}:${identifier}`;

    if (this.platform === 'darwin') {
      // macOS Keychain
      await execAsync(
        `security add-generic-password -a "${accountName}" -s "calos-agent-router" -w "${value}" -U`
      );
    } else if (this.platform === 'linux') {
      // Linux Secret Service (via secret-tool)
      await execAsync(
        `secret-tool store --label="${accountName}" service calos account "${accountName}" password "${value}"`
      );
    } else {
      throw new Error(`System keychain not supported on ${this.platform}`);
    }
  }

  /**
   * Retrieve from system keychain
   */
  async _getSystemKeychain(service, type, identifier) {
    const accountName = `${service}:${type}:${identifier}`;

    try {
      if (this.platform === 'darwin') {
        // macOS Keychain
        const { stdout } = await execAsync(
          `security find-generic-password -a "${accountName}" -s "calos-agent-router" -w`
        );
        return stdout.trim();
      } else if (this.platform === 'linux') {
        // Linux Secret Service
        const { stdout } = await execAsync(
          `secret-tool lookup service calos account "${accountName}"`
        );
        return stdout.trim();
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  /**
   * Delete from system keychain
   */
  async _deleteSystemKeychain(service, type, identifier) {
    const accountName = `${service}:${type}:${identifier}`;

    if (this.platform === 'darwin') {
      await execAsync(
        `security delete-generic-password -a "${accountName}" -s "calos-agent-router"`
      );
    } else if (this.platform === 'linux') {
      await execAsync(
        `secret-tool clear service calos account "${accountName}"`
      );
    }
  }

  // ========================================================================
  // Encryption/Decryption
  // ========================================================================

  /**
   * Encrypt a value
   */
  _encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt a value
   */
  _decrypt(data) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(data.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    let decrypted = decipher.update(data.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get encryption key from environment or generate
   */
  _getEncryptionKey() {
    const key = process.env.KEYRING_ENCRYPTION_KEY;

    if (key) {
      // Ensure key is 32 bytes for AES-256
      return crypto.createHash('sha256').update(key).digest();
    }

    // Generate a key (warn that it's ephemeral)
    console.warn('[Keyring] No KEYRING_ENCRYPTION_KEY set, using ephemeral key. Set env var for persistence!');
    return crypto.randomBytes(32);
  }

  // ========================================================================
  // Verification Helpers
  // ========================================================================

  async _verifyGitHub(token) {
    try {
      const { stdout } = await execAsync(`gh api user --header "Authorization: Bearer ${token}"`);
      return !!JSON.parse(stdout).login;
    } catch {
      return false;
    }
  }

  async _verifyOpenAI(apiKey) {
    try {
      const axios = require('axios');
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async _verifyAnthropic(apiKey) {
    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // ========================================================================
  // Database Helpers
  // ========================================================================

  async _storeCredentialMetadata(service, type, identifier, options, storageLocation) {
    await this.db.query(
      `INSERT INTO service_credentials (
        service_name, credential_type, identifier,
        encrypted_value, encryption_method,
        description, scopes, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (service_name, credential_type, identifier)
      DO UPDATE SET
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP`,
      [
        service,
        type,
        identifier,
        storageLocation, // Store location, not actual credential
        'system_keychain',
        options.description || null,
        options.scopes || null,
        options.expiresAt || null
      ]
    );
  }

  async _logCredentialUsage(service, type, identifier, storageLocation) {
    // Find credential ID
    const result = await this.db.query(
      `SELECT id FROM service_credentials
       WHERE service_name = $1 AND credential_type = $2 AND identifier = $3`,
      [service, type, identifier]
    );

    if (result.rows.length > 0) {
      await this.db.query(
        `INSERT INTO credential_usage_log (credential_id, used_by, operation, success)
         VALUES ($1, $2, $3, $4)`,
        [result.rows[0].id, 'keyring', 'retrieve', true]
      );
    }
  }
}

module.exports = Keyring;
