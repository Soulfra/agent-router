/**
 * Simple Encryption Module
 *
 * AES-256-GCM encryption for storing sensitive data (OAuth tokens)
 * in Google Sheets or other non-secure storage
 *
 * Why AES-256-GCM?
 * - Industry standard (used by Signal, WhatsApp, TLS 1.3)
 * - Authenticated encryption (prevents tampering)
 * - Fast (hardware accelerated)
 * - Secure (no known attacks)
 *
 * How it works:
 * 1. Derive key from your secret passphrase
 * 2. Encrypt data with random IV (initialization vector)
 * 3. Store: IV + encrypted data + auth tag
 * 4. Decrypt: Extract IV, verify auth tag, decrypt
 *
 * Security notes:
 * - NEVER store encryption key in same place as encrypted data
 * - Use environment variable or separate config file
 * - Rotate keys periodically
 * - Use different keys for different environments
 */

const crypto = require('crypto');

class SimpleEncryption {
  constructor(config = {}) {
    // Encryption key (32 bytes for AES-256)
    this.key = config.key || process.env.ENCRYPTION_KEY;

    if (!this.key) {
      console.warn('[SimpleEncryption] No encryption key provided, using default (INSECURE)');
      this.key = 'default-insecure-key-change-me-12345678901234567890';
    }

    // Ensure key is 32 bytes
    this.keyBuffer = this.deriveKey(this.key);

    // Algorithm
    this.algorithm = 'aes-256-gcm';

    // IV length (12 bytes recommended for GCM)
    this.ivLength = 12;

    // Auth tag length (16 bytes)
    this.authTagLength = 16;

    console.log('[SimpleEncryption] Initialized');
  }

  /**
   * Derive 32-byte key from passphrase
   * Uses PBKDF2 with SHA-256
   *
   * @param {string} passphrase - Passphrase
   * @returns {Buffer} 32-byte key
   * @private
   */
  deriveKey(passphrase) {
    // If already 32 bytes, use as-is
    if (Buffer.byteLength(passphrase) === 32) {
      return Buffer.from(passphrase);
    }

    // Otherwise, derive from passphrase
    return crypto.pbkdf2Sync(
      passphrase,
      'calos-gmail-webhook-salt', // Salt (can be public)
      100000,                      // Iterations
      32,                          // Key length (bytes)
      'sha256'                     // Hash algorithm
    );
  }

  /**
   * Encrypt data
   *
   * @param {string} plaintext - Data to encrypt
   * @returns {string} Base64-encoded encrypted data (IV + ciphertext + authTag)
   */
  encrypt(plaintext) {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.keyBuffer, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine: IV + encrypted + authTag
      const combined = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'hex'),
        authTag
      ]);

      // Return base64
      return combined.toString('base64');

    } catch (error) {
      console.error('[SimpleEncryption] Encryption error:', error.message);
      throw error;
    }
  }

  /**
   * Decrypt data
   *
   * @param {string} encryptedBase64 - Base64-encoded encrypted data
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedBase64) {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedBase64, 'base64');

      // Extract IV (first 12 bytes)
      const iv = combined.slice(0, this.ivLength);

      // Extract auth tag (last 16 bytes)
      const authTag = combined.slice(-this.authTagLength);

      // Extract encrypted data (middle part)
      const encrypted = combined.slice(this.ivLength, -this.authTagLength);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.keyBuffer, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      console.error('[SimpleEncryption] Decryption error:', error.message);
      throw error;
    }
  }

  /**
   * Encrypt an object (JSON)
   *
   * @param {Object} obj - Object to encrypt
   * @returns {string} Base64-encoded encrypted JSON
   */
  encryptObject(obj) {
    const json = JSON.stringify(obj);
    return this.encrypt(json);
  }

  /**
   * Decrypt to object (JSON)
   *
   * @param {string} encryptedBase64 - Encrypted object
   * @returns {Object} Decrypted object
   */
  decryptObject(encryptedBase64) {
    const json = this.decrypt(encryptedBase64);
    return JSON.parse(json);
  }

  /**
   * Encrypt OAuth tokens for storage
   *
   * @param {Object} tokens - OAuth tokens
   * @returns {Object} Object with encrypted tokens
   */
  encryptTokens(tokens) {
    return {
      access_token: this.encrypt(tokens.access_token),
      refresh_token: this.encrypt(tokens.refresh_token),
      encrypted: true
    };
  }

  /**
   * Decrypt OAuth tokens from storage
   *
   * @param {Object} encryptedTokens - Encrypted tokens
   * @returns {Object} Decrypted tokens
   */
  decryptTokens(encryptedTokens) {
    if (!encryptedTokens.encrypted) {
      // Tokens not encrypted, return as-is
      console.warn('[SimpleEncryption] Tokens not encrypted');
      return encryptedTokens;
    }

    return {
      access_token: this.decrypt(encryptedTokens.access_token),
      refresh_token: this.decrypt(encryptedTokens.refresh_token)
    };
  }

  /**
   * Hash data (one-way, for comparison)
   * Useful for hashing IP addresses, user IDs, etc.
   *
   * @param {string} data - Data to hash
   * @returns {string} Hex-encoded hash
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate random token (for API keys, etc.)
   *
   * @param {number} length - Length in bytes (default 32)
   * @returns {string} Hex-encoded random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Verify if encrypted data is valid
   * (Doesn't decrypt, just checks format)
   *
   * @param {string} encryptedBase64 - Encrypted data
   * @returns {boolean} Is valid format
   */
  isValidEncrypted(encryptedBase64) {
    try {
      const combined = Buffer.from(encryptedBase64, 'base64');

      // Check minimum length (IV + authTag + at least 1 byte data)
      const minLength = this.ivLength + this.authTagLength + 1;

      return combined.length >= minLength;

    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt data with new key
   * Useful for key rotation
   *
   * @param {string} encryptedBase64 - Data encrypted with old key
   * @param {SimpleEncryption} newEncryption - New encryption instance with new key
   * @returns {string} Data encrypted with new key
   */
  reencrypt(encryptedBase64, newEncryption) {
    const plaintext = this.decrypt(encryptedBase64);
    return newEncryption.encrypt(plaintext);
  }
}

/**
 * Convenience function to create encryption instance
 *
 * @param {string} key - Encryption key
 * @returns {SimpleEncryption} Encryption instance
 */
function createEncryption(key) {
  return new SimpleEncryption({ key });
}

/**
 * Quick encrypt function
 *
 * @param {string} plaintext - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} Encrypted data
 */
function encrypt(plaintext, key) {
  const encryption = createEncryption(key);
  return encryption.encrypt(plaintext);
}

/**
 * Quick decrypt function
 *
 * @param {string} encryptedBase64 - Encrypted data
 * @param {string} key - Encryption key
 * @returns {string} Decrypted data
 */
function decrypt(encryptedBase64, key) {
  const encryption = createEncryption(key);
  return encryption.decrypt(encryptedBase64);
}

module.exports = SimpleEncryption;
module.exports.createEncryption = createEncryption;
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
