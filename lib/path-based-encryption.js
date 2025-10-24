/**
 * Path-Based Encryption System
 *
 * Derives encryption keys from conversation/interaction paths.
 * Like Bitcoin mining: specific sequence of challenges/responses generates key.
 * Like Ghidra: need exact execution path to decrypt.
 * Like game mechanics: specific action sequence unlocks content.
 *
 * Key Concept:
 * - Encryption key = HMAC_SHA256(challenge1 + response1 + challenge2 + response2 + ...)
 * - Forward secrecy: each conversation path generates unique key
 * - Can't decrypt without exact interaction sequence
 * - Proof-of-work challenges add entropy to key material
 *
 * Integration:
 * - SessionBlockManager: Tracks blockchain-style interaction paths
 * - BotDetector: Provides PoW challenges for key material
 * - SoulfraIdentity: Cryptographic primitives (SHA256, Blake3, Ed25519)
 *
 * Usage:
 * const pbe = new PathBasedEncryption({ db, sessionBlockManager, botDetector });
 *
 * // User completes challenge-response sequence
 * const sessionId = 'abc123';
 * const pathData = await pbe.getSessionPath(sessionId);
 * const key = pbe.deriveKeyFromPath(pathData);
 *
 * // Encrypt message with path-derived key
 * const encrypted = pbe.encryptWithPath(sessionId, 'secret message');
 *
 * // Decrypt (requires same path)
 * const decrypted = pbe.decryptWithPath(sessionId, encrypted);
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

class PathBasedEncryption extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.sessionBlockManager = options.sessionBlockManager;
    this.botDetector = options.botDetector;

    if (!this.db) {
      throw new Error('Database connection required for PathBasedEncryption');
    }

    // Configuration
    this.keyDerivationAlgorithm = options.keyDerivationAlgorithm || 'sha256';
    this.encryptionAlgorithm = options.encryptionAlgorithm || 'aes-256-gcm';
    this.minPathLength = options.minPathLength || 2; // Minimum challenge-response pairs
    this.maxPathAge = options.maxPathAge || 3600000; // 1 hour in ms

    console.log('[PathBasedEncryption] Initialized with', {
      keyDerivation: this.keyDerivationAlgorithm,
      encryption: this.encryptionAlgorithm,
      minPathLength: this.minPathLength
    });
  }

  /**
   * Get interaction path for session
   * Retrieves all challenge-response blocks from session history
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Path data (chronological blocks)
   */
  async getSessionPath(sessionId) {
    try {
      const result = await this.db.query(
        `SELECT
          path_id,
          session_id,
          block_index,
          challenge_hash,
          response_hash,
          pow_nonce,
          pow_difficulty,
          block_timestamp,
          key_fragment
        FROM encryption_paths
        WHERE session_id = $1
        ORDER BY block_index ASC`,
        [sessionId]
      );

      return result.rows;

    } catch (error) {
      console.error('[PathBasedEncryption] Error getting session path:', error);
      throw error;
    }
  }

  /**
   * Record path block (challenge-response pair)
   * Called after each PoW challenge is completed
   *
   * @param {string} sessionId - Session ID
   * @param {object} blockData - { challenge, response, powNonce, powDifficulty }
   * @returns {Promise<object>} Created path block
   */
  async recordPathBlock(sessionId, blockData) {
    try {
      // Hash challenge and response
      const challengeHash = this._hashData(blockData.challenge);
      const responseHash = this._hashData(blockData.response);

      // Generate key fragment from this block
      const keyFragment = this._generateKeyFragment({
        challengeHash,
        responseHash,
        powNonce: blockData.powNonce,
        powDifficulty: blockData.powDifficulty,
        timestamp: Date.now()
      });

      // Get current block index
      const indexResult = await this.db.query(
        `SELECT COALESCE(MAX(block_index), -1) + 1 as next_index
         FROM encryption_paths
         WHERE session_id = $1`,
        [sessionId]
      );

      const blockIndex = indexResult.rows[0].next_index;

      // Insert path block
      const result = await this.db.query(
        `INSERT INTO encryption_paths (
          session_id,
          block_index,
          challenge_hash,
          response_hash,
          pow_nonce,
          pow_difficulty,
          key_fragment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          sessionId,
          blockIndex,
          challengeHash,
          responseHash,
          blockData.powNonce,
          blockData.powDifficulty,
          keyFragment
        ]
      );

      this.emit('path_block_added', {
        sessionId,
        blockIndex,
        pathLength: blockIndex + 1
      });

      return result.rows[0];

    } catch (error) {
      console.error('[PathBasedEncryption] Error recording path block:', error);
      throw error;
    }
  }

  /**
   * Derive encryption key from session path
   * Combines all key fragments from challenge-response sequence
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<Buffer>} 256-bit encryption key
   */
  async deriveKeyFromPath(sessionId) {
    try {
      const path = await this.getSessionPath(sessionId);

      if (path.length < this.minPathLength) {
        throw new Error(`Path too short: ${path.length} blocks (min: ${this.minPathLength})`);
      }

      // Check path freshness
      const latestBlock = path[path.length - 1];
      const age = Date.now() - new Date(latestBlock.block_timestamp).getTime();

      if (age > this.maxPathAge) {
        throw new Error(`Path expired: ${age}ms old (max: ${this.maxPathAge}ms)`);
      }

      // Combine all key fragments
      const combinedFragments = path
        .map(block => block.key_fragment)
        .join('');

      // Derive final key using HMAC
      const key = crypto
        .createHmac(this.keyDerivationAlgorithm, sessionId)
        .update(combinedFragments)
        .digest();

      this.emit('key_derived', {
        sessionId,
        pathLength: path.length,
        keySize: key.length
      });

      return key;

    } catch (error) {
      console.error('[PathBasedEncryption] Error deriving key from path:', error);
      throw error;
    }
  }

  /**
   * Encrypt data with path-derived key
   *
   * @param {string} sessionId - Session ID (used to derive key from path)
   * @param {string|Buffer} plaintext - Data to encrypt
   * @returns {Promise<object>} { iv, authTag, ciphertext, sessionId }
   */
  async encryptWithPath(sessionId, plaintext) {
    try {
      // Derive key from session path
      const key = await this.deriveKeyFromPath(sessionId);

      // Generate random IV
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(this.encryptionAlgorithm, key, iv);

      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get auth tag (for GCM mode)
      const authTag = cipher.getAuthTag().toString('hex');

      this.emit('encrypted', {
        sessionId,
        plaintextLength: Buffer.byteLength(plaintext, 'utf8'),
        ciphertextLength: ciphertext.length
      });

      return {
        iv: iv.toString('hex'),
        authTag,
        ciphertext,
        sessionId,
        algorithm: this.encryptionAlgorithm
      };

    } catch (error) {
      console.error('[PathBasedEncryption] Error encrypting with path:', error);
      throw error;
    }
  }

  /**
   * Decrypt data with path-derived key
   * Requires exact same challenge-response sequence to derive key
   *
   * @param {string} sessionId - Session ID (used to derive key from path)
   * @param {object} encrypted - { iv, authTag, ciphertext }
   * @returns {Promise<string>} Decrypted plaintext
   */
  async decryptWithPath(sessionId, encrypted) {
    try {
      // Derive key from session path
      const key = await this.deriveKeyFromPath(sessionId);

      // Convert hex strings to buffers
      const iv = Buffer.from(encrypted.iv, 'hex');
      const authTag = Buffer.from(encrypted.authTag, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      this.emit('decrypted', {
        sessionId,
        plaintextLength: Buffer.byteLength(plaintext, 'utf8')
      });

      return plaintext;

    } catch (error) {
      console.error('[PathBasedEncryption] Error decrypting with path:', error);
      throw error;
    }
  }

  /**
   * Validate path integrity
   * Checks if path has been tampered with
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if path is valid
   */
  async validatePathIntegrity(sessionId) {
    try {
      const path = await this.getSessionPath(sessionId);

      if (path.length === 0) {
        return false;
      }

      // Verify each block's key fragment
      for (const block of path) {
        const expectedFragment = this._generateKeyFragment({
          challengeHash: block.challenge_hash,
          responseHash: block.response_hash,
          powNonce: block.pow_nonce,
          powDifficulty: block.pow_difficulty,
          timestamp: new Date(block.block_timestamp).getTime()
        });

        if (expectedFragment !== block.key_fragment) {
          console.warn('[PathBasedEncryption] Path integrity violation:', {
            sessionId,
            blockIndex: block.block_index
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('[PathBasedEncryption] Error validating path integrity:', error);
      return false;
    }
  }

  /**
   * Clear expired paths
   * Cleanup task for old encryption paths
   *
   * @returns {Promise<number>} Number of paths cleared
   */
  async clearExpiredPaths() {
    try {
      const result = await this.db.query(
        `DELETE FROM encryption_paths
         WHERE block_timestamp < NOW() - INTERVAL '${this.maxPathAge} milliseconds'
         RETURNING session_id`,
        []
      );

      const clearedCount = result.rows.length;

      if (clearedCount > 0) {
        console.log(`[PathBasedEncryption] Cleared ${clearedCount} expired paths`);
      }

      return clearedCount;

    } catch (error) {
      console.error('[PathBasedEncryption] Error clearing expired paths:', error);
      return 0;
    }
  }

  /**
   * Get path statistics
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} Stats about the path
   */
  async getPathStats(sessionId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as block_count,
          MIN(block_timestamp) as first_block,
          MAX(block_timestamp) as last_block,
          AVG(pow_difficulty) as avg_difficulty
        FROM encryption_paths
        WHERE session_id = $1`,
        [sessionId]
      );

      const stats = result.rows[0];

      return {
        blockCount: parseInt(stats.block_count),
        firstBlock: stats.first_block,
        lastBlock: stats.last_block,
        avgDifficulty: parseFloat(stats.avg_difficulty) || 0,
        pathAge: stats.last_block
          ? Date.now() - new Date(stats.last_block).getTime()
          : null
      };

    } catch (error) {
      console.error('[PathBasedEncryption] Error getting path stats:', error);
      throw error;
    }
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  /**
   * Hash data using configured algorithm
   *
   * @param {string|Buffer} data - Data to hash
   * @returns {string} Hex hash
   */
  _hashData(data) {
    return crypto
      .createHash(this.keyDerivationAlgorithm)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate key fragment from block data
   *
   * @param {object} blockData - { challengeHash, responseHash, powNonce, powDifficulty, timestamp }
   * @returns {string} Key fragment (hex)
   */
  _generateKeyFragment(blockData) {
    const combinedData = [
      blockData.challengeHash,
      blockData.responseHash,
      blockData.powNonce?.toString() || '',
      blockData.powDifficulty?.toString() || '',
      blockData.timestamp.toString()
    ].join(':');

    return this._hashData(combinedData);
  }
}

module.exports = PathBasedEncryption;
