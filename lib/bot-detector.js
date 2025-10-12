/**
 * Bot Detection & Proof-of-Personhood System
 *
 * Uses Soulfra identity system to verify humans vs bots WITHOUT KYC:
 * - Zero-knowledge proofs (prove you're real without revealing identity)
 * - Proof-of-work challenges (expensive for bots, cheap for humans)
 * - Time-based verification (account age)
 * - Reputation scoring (builds over time)
 * - Challenge-response authentication
 *
 * Core Principle: Make it cheap for humans, expensive for bots
 *
 * Bot Detection Techniques:
 * 1. Computational cost: 3 seconds for human = 3000 requests for botnet
 * 2. Account age: New accounts more restricted
 * 3. Reputation: Build trust through verified actions
 * 4. Rate limiting: Tiered based on reputation
 */

const SoulfraIdentity = require('./soulfra-identity');
const crypto = require('crypto');

class BotDetector {
  constructor(options = {}) {
    // Challenge settings
    this.powDifficulty = options.powDifficulty || 4; // Leading zeros required
    this.challengeExpiryMinutes = options.challengeExpiryMinutes || 5;

    // Reputation thresholds
    this.thresholds = {
      new_account: 10,      // Score < 10 = new account
      established: 50,      // Score < 50 = established
      trusted: 80           // Score >= 80 = trusted
    };

    // Active challenges (in production: use Redis/database)
    this.activeChallenges = new Map();

    // Session storage (in production: use Redis with TTL)
    this.activeSessions = new Map();

    // Blacklist (identities that failed verification)
    this.blacklist = new Set();
  }

  // ========================================================================
  // Challenge-Response Flow
  // ========================================================================

  /**
   * Step 1: Request access (client wants to use LLM)
   * @returns {object} Challenge to prove personhood
   */
  requestAccess() {
    const auth = SoulfraIdentity.beginAuth();

    // Store challenge
    this.activeChallenges.set(auth.sessionID, {
      challenge: auth.challenge,
      challengeHex: auth.challengeHex,
      createdAt: new Date(),
      expiresAt: auth.expiresAt,
      attempts: 0
    });

    return {
      sessionID: auth.sessionID,
      challenge: auth.challengeHex,
      expiresAt: auth.expiresAt,
      requirements: {
        powDifficulty: this.powDifficulty,
        mustProvideIdentity: true,
        mustCompleteProofOfWork: true
      }
    };
  }

  /**
   * Step 2: Verify personhood proof
   * @param {string} sessionID - Session from requestAccess()
   * @param {object} proof - Multi-factor proof from client
   * @returns {object} Verification result with access token
   */
  async verifyPersonhood(sessionID, proof) {
    // Get challenge
    const challenge = this.activeChallenges.get(sessionID);

    if (!challenge) {
      return {
        verified: false,
        reason: 'invalid_session',
        message: 'Session not found or expired'
      };
    }

    // Check expiry
    if (new Date() > challenge.expiresAt) {
      this.activeChallenges.delete(sessionID);
      return {
        verified: false,
        reason: 'session_expired',
        message: 'Challenge expired. Request new access.'
      };
    }

    // Track attempts (prevent brute force)
    challenge.attempts++;
    if (challenge.attempts > 3) {
      this.activeChallenges.delete(sessionID);
      this.blacklist.add(proof.identityID);
      return {
        verified: false,
        reason: 'too_many_attempts',
        message: 'Too many failed attempts. Identity blacklisted.'
      };
    }

    // Check blacklist
    if (this.blacklist.has(proof.identityID)) {
      return {
        verified: false,
        reason: 'blacklisted',
        message: 'Identity blacklisted due to previous violations'
      };
    }

    // Verify authentication response
    const authResult = SoulfraIdentity.verifyAuthResponse(
      proof.authResponse,
      challenge.challenge,
      sessionID
    );

    if (!authResult.valid) {
      return {
        verified: false,
        reason: 'invalid_auth',
        message: `Authentication failed: ${authResult.reason}`
      };
    }

    // Verify proof of work
    if (proof.proofOfWork) {
      const powValid = SoulfraIdentity.verifyProofOfWork(
        proof.proofOfWork,
        this.powDifficulty
      );

      if (!powValid) {
        return {
          verified: false,
          reason: 'invalid_pow',
          message: 'Proof of work verification failed'
        };
      }
    } else {
      return {
        verified: false,
        reason: 'missing_pow',
        message: 'Proof of work required'
      };
    }

    // Calculate reputation score
    const reputation = this._calculateReputationFromProof(proof);

    // Create session
    const accessToken = this._createAccessToken(proof.identityID);
    const session = {
      identityID: proof.identityID,
      publicKey: authResult.publicKey,
      accessToken: accessToken,
      reputation: reputation,
      tier: this._getAccessTier(reputation.score),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      requestCount: 0
    };

    this.activeSessions.set(accessToken, session);

    // Clean up challenge
    this.activeChallenges.delete(sessionID);

    return {
      verified: true,
      accessToken: accessToken,
      identityID: proof.identityID,
      reputation: reputation,
      tier: session.tier,
      expiresAt: session.expiresAt,
      message: 'Personhood verified. Access granted.'
    };
  }

  // ========================================================================
  // Request Verification (for each LLM request)
  // ========================================================================

  /**
   * Verify access token for each LLM request
   * @param {string} accessToken - Token from verifyPersonhood()
   * @returns {object} Verification result
   */
  verifyRequest(accessToken) {
    const session = this.activeSessions.get(accessToken);

    if (!session) {
      return {
        allowed: false,
        reason: 'invalid_token',
        message: 'Invalid or expired access token'
      };
    }

    // Check expiry
    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(accessToken);
      return {
        allowed: false,
        reason: 'session_expired',
        message: 'Session expired. Re-authenticate.'
      };
    }

    // Check blacklist
    if (this.blacklist.has(session.identityID)) {
      this.activeSessions.delete(accessToken);
      return {
        allowed: false,
        reason: 'blacklisted',
        message: 'Identity blacklisted'
      };
    }

    // Increment request count
    session.requestCount++;
    session.lastRequest = new Date();

    return {
      allowed: true,
      identityID: session.identityID,
      reputation: session.reputation,
      tier: session.tier,
      requestCount: session.requestCount
    };
  }

  // ========================================================================
  // Reputation & Scoring
  // ========================================================================

  /**
   * Calculate reputation from proof
   * @private
   */
  _calculateReputationFromProof(proof) {
    let score = 0;
    const factors = [];

    // Time proof (account age)
    if (proof.timeProof && proof.timeProof.data) {
      const ageDays = proof.timeProof.data.accountAgeDays || 0;
      const ageScore = Math.min(20, Math.floor(ageDays / 30) * 5);
      score += ageScore;
      factors.push({
        factor: 'account_age',
        value: ageDays,
        score: ageScore
      });
    }

    // Proof of work (computational effort)
    if (proof.proofOfWork && proof.proofOfWork.data) {
      const difficulty = proof.proofOfWork.data.difficulty || 0;
      const powScore = Math.min(20, difficulty * 5);
      score += powScore;
      factors.push({
        factor: 'proof_of_work',
        value: difficulty,
        score: powScore
      });
    }

    // Reputation from proof (if included)
    if (proof.reputation) {
      const repScore = Math.min(60, proof.reputation.score || 0);
      score += repScore;
      factors.push({
        factor: 'historical_reputation',
        value: proof.reputation,
        score: repScore
      });
    }

    return {
      score: Math.min(100, score),
      factors: factors
    };
  }

  /**
   * Get access tier based on reputation
   * @private
   */
  _getAccessTier(score) {
    if (score < this.thresholds.new_account) {
      return {
        name: 'new',
        description: 'New account - limited access',
        rateLimit: {
          requestsPerHour: 10,
          requestsPerDay: 50
        }
      };
    } else if (score < this.thresholds.established) {
      return {
        name: 'established',
        description: 'Established account - standard access',
        rateLimit: {
          requestsPerHour: 100,
          requestsPerDay: 500
        }
      };
    } else if (score < this.thresholds.trusted) {
      return {
        name: 'trusted',
        description: 'Trusted account - high access',
        rateLimit: {
          requestsPerHour: 1000,
          requestsPerDay: 5000
        }
      };
    } else {
      return {
        name: 'verified',
        description: 'Verified account - unlimited access',
        rateLimit: {
          requestsPerHour: -1, // Unlimited
          requestsPerDay: -1
        }
      };
    }
  }

  /**
   * Create secure access token
   * @private
   */
  _createAccessToken(identityID) {
    const random = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256')
      .update(`${identityID}:${random}:${Date.now()}`)
      .digest('hex');
    return `soulfra_${hash}`;
  }

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Get session info
   */
  getSession(accessToken) {
    return this.activeSessions.get(accessToken);
  }

  /**
   * Revoke session
   */
  revokeSession(accessToken) {
    return this.activeSessions.delete(accessToken);
  }

  /**
   * Get active sessions for identity
   */
  getSessionsForIdentity(identityID) {
    const sessions = [];
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.identityID === identityID) {
        sessions.push({ token, ...session });
      }
    }
    return sessions;
  }

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions() {
    const now = new Date();
    let cleaned = 0;

    for (const [token, session] of this.activeSessions.entries()) {
      if (session.expiresAt < now) {
        this.activeSessions.delete(token);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clean expired challenges
   */
  cleanExpiredChallenges() {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionID, challenge] of this.activeChallenges.entries()) {
      if (challenge.expiresAt < now) {
        this.activeChallenges.delete(sessionID);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ========================================================================
  // Blacklist Management
  // ========================================================================

  /**
   * Add identity to blacklist
   */
  blacklistIdentity(identityID, reason) {
    this.blacklist.add(identityID);

    // Revoke all sessions for this identity
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.identityID === identityID) {
        this.activeSessions.delete(token);
      }
    }

    return {
      blacklisted: true,
      identityID: identityID,
      reason: reason,
      sessionsRevoked: this.getSessionsForIdentity(identityID).length
    };
  }

  /**
   * Remove from blacklist
   */
  unblacklistIdentity(identityID) {
    return this.blacklist.delete(identityID);
  }

  /**
   * Check if identity is blacklisted
   */
  isBlacklisted(identityID) {
    return this.blacklist.has(identityID);
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  /**
   * Get system statistics
   */
  getStats() {
    const sessions = Array.from(this.activeSessions.values());

    return {
      activeSessions: sessions.length,
      activeChallenges: this.activeChallenges.size,
      blacklistedIdentities: this.blacklist.size,
      sessionsByTier: {
        new: sessions.filter(s => s.tier.name === 'new').length,
        established: sessions.filter(s => s.tier.name === 'established').length,
        trusted: sessions.filter(s => s.tier.name === 'trusted').length,
        verified: sessions.filter(s => s.tier.name === 'verified').length
      },
      totalRequests: sessions.reduce((sum, s) => sum + s.requestCount, 0)
    };
  }
}

module.exports = BotDetector;
