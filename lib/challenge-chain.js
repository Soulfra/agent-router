/**
 * Challenge Chain Manager
 *
 * Manages sequences of proof-of-work challenges for path-based encryption.
 * Each challenge-response pair contributes to the encryption key derivation.
 *
 * Concept:
 * - Sequential challenges: C1 → R1 → C2 → R2 → C3 → R3 → ...
 * - Each response influences next challenge (chained)
 * - Like Bitcoin mining: finding specific hash patterns
 * - Like game mechanics: sequence of actions unlocks content
 *
 * Integration:
 * - BotDetector: Generates individual PoW challenges
 * - PathBasedEncryption: Records challenge-response pairs as path blocks
 * - SessionBlockManager: Tracks session state
 *
 * Usage:
 * const chain = new ChallengeChain({ db, botDetector, pathEncryption });
 *
 * // Start challenge sequence
 * const challenge1 = await chain.startChain(sessionId, userId);
 *
 * // Verify response and get next challenge
 * const challenge2 = await chain.verifyAndContinue(sessionId, response1);
 *
 * // Complete chain when enough blocks accumulated
 * const key = await chain.completeChain(sessionId);
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

class ChallengeChain extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.botDetector = options.botDetector;
    this.pathEncryption = options.pathEncryption;

    if (!this.db) {
      throw new Error('Database connection required for ChallengeChain');
    }

    if (!this.botDetector) {
      throw new Error('BotDetector instance required for ChallengeChain');
    }

    if (!this.pathEncryption) {
      throw new Error('PathBasedEncryption instance required for ChallengeChain');
    }

    // Configuration
    this.minChainLength = options.minChainLength || 3; // Min challenges to complete
    this.maxChainLength = options.maxChainLength || 10; // Max challenges before auto-complete
    this.challengeDifficulty = options.challengeDifficulty || 4; // PoW leading zeros
    this.chainTimeout = options.chainTimeout || 600000; // 10 minutes

    console.log('[ChallengeChain] Initialized with', {
      minLength: this.minChainLength,
      maxLength: this.maxChainLength,
      difficulty: this.challengeDifficulty
    });
  }

  /**
   * Start new challenge chain
   * Creates first challenge in sequence
   *
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} First challenge
   */
  async startChain(sessionId, userId) {
    try {
      // Create encryption session
      const sessionResult = await this.db.query(
        `SELECT start_encryption_session($1, $2) as session_id`,
        [userId, 10] // 10 minute session
      );

      const encryptionSessionId = sessionResult.rows[0].session_id;

      // Store chain state
      await this.db.query(
        `INSERT INTO challenge_chains (
          session_id,
          encryption_session_id,
          user_id,
          current_index,
          status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, encryptionSessionId, userId, 0, 'active']
      );

      // Generate first challenge
      const challenge = await this._generateChallenge(sessionId, 0, null);

      this.emit('chain_started', {
        sessionId,
        encryptionSessionId,
        userId,
        challengeDifficulty: challenge.difficulty
      });

      return {
        sessionId,
        encryptionSessionId,
        challengeIndex: 0,
        challenge: challenge.challenge,
        difficulty: challenge.difficulty,
        requirements: {
          minChainLength: this.minChainLength,
          maxChainLength: this.maxChainLength,
          mustCompleteProofOfWork: true
        }
      };

    } catch (error) {
      console.error('[ChallengeChain] Error starting chain:', error);
      throw error;
    }
  }

  /**
   * Verify response and get next challenge
   * Validates PoW, records path block, generates next challenge
   *
   * @param {string} sessionId - Session ID
   * @param {object} response - { nonce, timestamp, signature }
   * @returns {Promise<object>} Next challenge or completion status
   */
  async verifyAndContinue(sessionId, response) {
    try {
      // Get chain state
      const chainState = await this._getChainState(sessionId);

      if (!chainState) {
        throw new Error('Chain not found');
      }

      if (chainState.status !== 'active') {
        throw new Error(`Chain not active: ${chainState.status}`);
      }

      // Get current challenge
      const challengeData = await this._getCurrentChallenge(sessionId);

      if (!challengeData) {
        throw new Error('No active challenge found');
      }

      // Verify PoW
      const isValid = await this._verifyPoW(
        challengeData.challenge,
        response.nonce,
        challengeData.difficulty
      );

      if (!isValid) {
        this.emit('verification_failed', {
          sessionId,
          challengeIndex: chainState.current_index,
          reason: 'Invalid proof-of-work'
        });

        throw new Error('Invalid proof-of-work');
      }

      // Record path block
      await this.pathEncryption.recordPathBlock(chainState.encryption_session_id, {
        challenge: challengeData.challenge,
        response: response.nonce,
        powNonce: response.nonce,
        powDifficulty: challengeData.difficulty
      });

      // Update chain state
      const newIndex = chainState.current_index + 1;
      await this._updateChainIndex(sessionId, newIndex);

      this.emit('challenge_verified', {
        sessionId,
        challengeIndex: chainState.current_index,
        newIndex: newIndex
      });

      // Check if chain is complete
      if (newIndex >= this.minChainLength) {
        // Chain can be completed, but user can continue if they want
        const canComplete = true;

        if (newIndex >= this.maxChainLength) {
          // Auto-complete at max length
          return await this.completeChain(sessionId);
        }

        // Generate next challenge
        const nextChallenge = await this._generateChallenge(
          sessionId,
          newIndex,
          response.nonce
        );

        return {
          sessionId,
          challengeIndex: newIndex,
          challenge: nextChallenge.challenge,
          difficulty: nextChallenge.difficulty,
          canComplete: canComplete,
          chainLength: newIndex,
          minLength: this.minChainLength,
          maxLength: this.maxChainLength
        };

      } else {
        // Must continue (not enough blocks yet)
        const nextChallenge = await this._generateChallenge(
          sessionId,
          newIndex,
          response.nonce
        );

        return {
          sessionId,
          challengeIndex: newIndex,
          challenge: nextChallenge.challenge,
          difficulty: nextChallenge.difficulty,
          canComplete: false,
          chainLength: newIndex,
          minLength: this.minChainLength,
          maxLength: this.maxChainLength
        };
      }

    } catch (error) {
      console.error('[ChallengeChain] Error verifying and continuing:', error);
      throw error;
    }
  }

  /**
   * Complete challenge chain
   * Derives encryption key from accumulated path
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} { keyDerived, pathLength, encryptionSessionId }
   */
  async completeChain(sessionId) {
    try {
      // Get chain state
      const chainState = await this._getChainState(sessionId);

      if (!chainState) {
        throw new Error('Chain not found');
      }

      if (chainState.current_index < this.minChainLength) {
        throw new Error(
          `Chain too short: ${chainState.current_index} blocks (min: ${this.minChainLength})`
        );
      }

      // Mark encryption session as complete
      await this.db.query(
        `SELECT complete_encryption_session($1)`,
        [chainState.encryption_session_id]
      );

      // Mark chain as completed
      await this.db.query(
        `UPDATE challenge_chains
         SET status = 'completed', completed_at = NOW()
         WHERE session_id = $1`,
        [sessionId]
      );

      // Derive key (validates path)
      const key = await this.pathEncryption.deriveKeyFromPath(
        chainState.encryption_session_id
      );

      this.emit('chain_completed', {
        sessionId,
        encryptionSessionId: chainState.encryption_session_id,
        pathLength: chainState.current_index,
        keySize: key.length
      });

      return {
        success: true,
        keyDerived: true,
        pathLength: chainState.current_index,
        encryptionSessionId: chainState.encryption_session_id,
        message: 'Challenge chain completed. Encryption key derived from path.'
      };

    } catch (error) {
      console.error('[ChallengeChain] Error completing chain:', error);
      throw error;
    }
  }

  /**
   * Get chain progress
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} Chain state and progress
   */
  async getChainProgress(sessionId) {
    try {
      const chainState = await this._getChainState(sessionId);

      if (!chainState) {
        return null;
      }

      const pathStats = await this.pathEncryption.getPathStats(
        chainState.encryption_session_id
      );

      return {
        sessionId,
        encryptionSessionId: chainState.encryption_session_id,
        currentIndex: chainState.current_index,
        pathLength: pathStats.blockCount,
        status: chainState.status,
        canComplete: chainState.current_index >= this.minChainLength,
        progress: Math.min(
          (chainState.current_index / this.minChainLength) * 100,
          100
        ),
        startedAt: chainState.created_at,
        completedAt: chainState.completed_at
      };

    } catch (error) {
      console.error('[ChallengeChain] Error getting chain progress:', error);
      throw error;
    }
  }

  /**
   * Abandon chain (cleanup)
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if abandoned
   */
  async abandonChain(sessionId) {
    try {
      const result = await this.db.query(
        `UPDATE challenge_chains
         SET status = 'abandoned'
         WHERE session_id = $1
         AND status = 'active'`,
        [sessionId]
      );

      if (result.rowCount > 0) {
        this.emit('chain_abandoned', { sessionId });
        return true;
      }

      return false;

    } catch (error) {
      console.error('[ChallengeChain] Error abandoning chain:', error);
      return false;
    }
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  /**
   * Generate challenge based on previous response
   * Makes challenges dependent on previous responses (chained)
   *
   * @param {string} sessionId - Session ID
   * @param {number} index - Challenge index
   * @param {string|null} previousResponse - Previous challenge response (for chaining)
   * @returns {Promise<object>} { challenge, difficulty }
   */
  async _generateChallenge(sessionId, index, previousResponse) {
    // Generate base challenge
    let challengeSeed = `${sessionId}:${index}:${Date.now()}`;

    // Chain: incorporate previous response
    if (previousResponse) {
      challengeSeed = crypto
        .createHash('sha256')
        .update(previousResponse + challengeSeed)
        .digest('hex');
    }

    // Generate challenge nonce
    const challenge = crypto
      .createHash('sha256')
      .update(challengeSeed)
      .digest('hex');

    // Store challenge
    await this.db.query(
      `INSERT INTO chain_challenges (
        session_id,
        challenge_index,
        challenge_nonce,
        difficulty,
        previous_response
      ) VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, index, challenge, this.challengeDifficulty, previousResponse]
    );

    return {
      challenge,
      difficulty: this.challengeDifficulty
    };
  }

  /**
   * Verify proof-of-work
   *
   * @param {string} challenge - Challenge nonce
   * @param {string} nonce - User's nonce
   * @param {number} difficulty - Required leading zeros
   * @returns {Promise<boolean>} True if valid
   */
  async _verifyPoW(challenge, nonce, difficulty) {
    const hash = crypto
      .createHash('sha256')
      .update(challenge + nonce)
      .digest('hex');

    const prefix = '0'.repeat(difficulty);
    return hash.startsWith(prefix);
  }

  /**
   * Get chain state
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object|null>} Chain state
   */
  async _getChainState(sessionId) {
    const result = await this.db.query(
      `SELECT * FROM challenge_chains WHERE session_id = $1`,
      [sessionId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get current challenge
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object|null>} Challenge data
   */
  async _getCurrentChallenge(sessionId) {
    const result = await this.db.query(
      `SELECT * FROM chain_challenges
       WHERE session_id = $1
       ORDER BY challenge_index DESC
       LIMIT 1`,
      [sessionId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update chain index
   *
   * @param {string} sessionId - Session ID
   * @param {number} newIndex - New challenge index
   * @returns {Promise<void>}
   */
  async _updateChainIndex(sessionId, newIndex) {
    await this.db.query(
      `UPDATE challenge_chains
       SET current_index = $2, last_challenge_at = NOW()
       WHERE session_id = $1`,
      [sessionId, newIndex]
    );
  }
}

module.exports = ChallengeChain;
