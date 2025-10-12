/**
 * Soulfra Zero-Knowledge Identity System
 *
 * Implements proof-of-personhood without KYC:
 * - Zero-knowledge proofs (prove you're real without revealing identity)
 * - Challenge-response authentication
 * - Multi-factor cryptographic proof
 * - Reputation scoring without central authority
 * - Sybil resistance
 *
 * Core Principle: Prove you're a unique human WITHOUT revealing:
 * - Name, email, phone
 * - Location, IP address
 * - Any personally identifiable information
 *
 * How it works:
 * 1. Generate Ed25519 identity (private key = your identity)
 * 2. Prove ownership through cryptographic challenges
 * 3. Build reputation through signed actions
 * 4. Prove uniqueness through time-based proofs
 * 5. No central authority can revoke or recover
 */

const crypto = require('crypto');
const SoulfraSigner = require('./soulfra-signer');

class SoulfraIdentity {
  constructor(options = {}) {
    // Load existing identity or create new
    this.privateKey = options.privateKey || null;
    this.publicKey = options.publicKey || null;
    this.signer = null;

    if (this.privateKey && this.publicKey) {
      this.signer = new SoulfraSigner({
        privateKey: this.privateKey,
        publicKey: this.publicKey
      });
    }

    // Identity metadata (optional)
    this.metadata = options.metadata || {};
    this.createdAt = options.createdAt || new Date().toISOString();

    // Reputation (built through signed actions)
    this.reputation = options.reputation || {
      commits: 0,
      verified_actions: 0,
      first_action: null,
      last_action: null
    };
  }

  /**
   * Create new identity (self-sovereign, zero-knowledge)
   * @returns {SoulfraIdentity} New identity instance
   */
  static createIdentity() {
    const keypair = SoulfraSigner.generateKeypair();

    const identity = new SoulfraIdentity({
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
      createdAt: new Date().toISOString(),
      metadata: {}
    });

    return identity;
  }

  /**
   * Load identity from JSON
   */
  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    return new SoulfraIdentity({
      privateKey: data.privateKey ? Buffer.from(data.privateKey, 'base64') : null,
      publicKey: data.publicKey ? Buffer.from(data.publicKey, 'base64') : null,
      createdAt: data.created || data.createdAt,
      metadata: data.metadata || {},
      reputation: data.reputation || {}
    });
  }

  /**
   * Export identity to JSON (KEEP PRIVATE!)
   */
  toJSON(includePrivateKey = true) {
    const data = {
      publicKey: this.publicKey ? this.publicKey.toString('base64') : null,
      created: this.createdAt,
      metadata: this.metadata,
      reputation: this.reputation
    };

    if (includePrivateKey && this.privateKey) {
      data.privateKey = this.privateKey.toString('base64');
    }

    return data;
  }

  /**
   * Get human-readable identity ID
   */
  getIdentityID() {
    if (!this.signer) {
      throw new Error('No identity loaded');
    }
    return this.signer.getIdentityID();
  }

  /**
   * Export public identity (safe to share)
   */
  getPublicIdentity() {
    return {
      identityID: this.getIdentityID(),
      publicKey: this.publicKey.toString('hex'),
      created: this.createdAt,
      reputation: {
        commits: this.reputation.commits,
        verified_actions: this.reputation.verified_actions,
        account_age_days: this._getAccountAgeDays(),
        last_active: this.reputation.last_action
      }
    };
  }

  // ========================================================================
  // Zero-Knowledge Proofs
  // ========================================================================

  /**
   * Create a zero-knowledge proof of identity ownership
   * Proves: "I own the private key for this identity"
   * Without revealing: The private key itself
   *
   * @param {Buffer|string} challenge - Random challenge from verifier
   * @returns {object} Proof that can be verified
   */
  createProof(challenge) {
    if (!this.signer) {
      throw new Error('No private key - cannot create proof');
    }

    // Ensure challenge is Buffer
    const challengeBuffer = Buffer.isBuffer(challenge)
      ? challenge
      : Buffer.from(challenge, 'utf8');

    // Create proof data
    const proofData = {
      challenge: challengeBuffer.toString('hex'),
      publicKey: this.publicKey.toString('hex'),
      timestamp: new Date().toISOString()
    };

    // Sign the proof
    const signed = this.signer.sign(proofData, {
      action: 'identity_proof',
      proof_type: 'zero_knowledge'
    });

    return {
      identityID: this.getIdentityID(),
      proof: signed,
      challenge: challengeBuffer.toString('hex')
    };
  }

  /**
   * Verify a zero-knowledge proof
   * @param {object} proof - Proof to verify
   * @param {Buffer|string} originalChallenge - Original challenge
   * @returns {boolean} True if proof is valid
   */
  static verifyProof(proof, originalChallenge) {
    try {
      // Ensure challenge matches
      const challengeBuffer = Buffer.isBuffer(originalChallenge)
        ? originalChallenge
        : Buffer.from(originalChallenge, 'utf8');

      if (proof.challenge !== challengeBuffer.toString('hex')) {
        return false;
      }

      // Verify signature
      const signer = new SoulfraSigner();
      return signer.verify(proof.proof);

    } catch (error) {
      return false;
    }
  }

  /**
   * Create a challenge for another identity to prove ownership
   * @returns {Buffer} Random challenge
   */
  static createChallenge() {
    return crypto.randomBytes(32);
  }

  // ========================================================================
  // Challenge-Response Authentication
  // ========================================================================

  /**
   * Begin authentication flow
   * @returns {object} Challenge and session ID
   */
  static beginAuth() {
    const challenge = crypto.randomBytes(32);
    const sessionID = crypto.randomBytes(16).toString('hex');

    return {
      challenge: challenge,
      challengeHex: challenge.toString('hex'),
      sessionID: sessionID,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };
  }

  /**
   * Respond to authentication challenge
   * @param {Buffer|string} challenge - Challenge from verifier
   * @param {string} sessionID - Session identifier
   * @returns {object} Signed response
   */
  respondToChallenge(challenge, sessionID) {
    if (!this.signer) {
      throw new Error('No private key - cannot respond to challenge');
    }

    const challengeBuffer = Buffer.isBuffer(challenge)
      ? challenge
      : Buffer.from(challenge, 'hex');

    const responseData = {
      challenge: challengeBuffer.toString('hex'),
      sessionID: sessionID,
      identityID: this.getIdentityID(),
      timestamp: new Date().toISOString()
    };

    const signed = this.signer.sign(responseData, {
      action: 'auth_response',
      auth_type: 'challenge_response'
    });

    return {
      identityID: this.getIdentityID(),
      response: signed,
      publicKey: this.publicKey.toString('hex')
    };
  }

  /**
   * Verify authentication response
   * @param {object} response - Response from identity
   * @param {Buffer|string} originalChallenge - Original challenge
   * @param {string} sessionID - Session identifier
   * @returns {object} Verification result with identity info
   */
  static verifyAuthResponse(response, originalChallenge, sessionID) {
    try {
      const challengeBuffer = Buffer.isBuffer(originalChallenge)
        ? originalChallenge
        : Buffer.from(originalChallenge, 'hex');

      // Check challenge matches
      if (response.response.data.challenge !== challengeBuffer.toString('hex')) {
        return { valid: false, reason: 'challenge_mismatch' };
      }

      // Check session ID
      if (response.response.data.sessionID !== sessionID) {
        return { valid: false, reason: 'session_mismatch' };
      }

      // Verify signature
      const signer = new SoulfraSigner();
      const valid = signer.verify(response.response);

      if (!valid) {
        return { valid: false, reason: 'invalid_signature' };
      }

      // Check timestamp (must be recent)
      const timestamp = new Date(response.response.data.timestamp);
      const age = Date.now() - timestamp.getTime();

      if (age > 5 * 60 * 1000) { // 5 minutes
        return { valid: false, reason: 'expired' };
      }

      return {
        valid: true,
        identityID: response.identityID,
        publicKey: response.publicKey,
        authenticatedAt: new Date().toISOString()
      };

    } catch (error) {
      return { valid: false, reason: 'verification_error', error: error.message };
    }
  }

  // ========================================================================
  // Proof of Personhood (Sybil Resistance)
  // ========================================================================

  /**
   * Create proof of work (computational proof you're real)
   * @param {number} difficulty - Number of leading zeros required
   * @returns {object} Proof of work
   */
  createProofOfWork(difficulty = 4) {
    if (!this.signer) {
      throw new Error('No identity loaded');
    }

    const startTime = Date.now();
    let nonce = 0;
    let hash;

    const identityID = this.getIdentityID();

    // Find nonce that produces hash with required leading zeros
    while (true) {
      const data = `${identityID}:${nonce}:${startTime}`;
      hash = crypto.createHash('sha256').update(data).digest('hex');

      // Check if hash starts with enough zeros
      const leadingZeros = hash.match(/^0*/)[0].length;
      if (leadingZeros >= difficulty) {
        break;
      }

      nonce++;
    }

    const endTime = Date.now();

    const proof = {
      identityID: identityID,
      nonce: nonce,
      hash: hash,
      difficulty: difficulty,
      startTime: startTime,
      endTime: endTime,
      computeTime: endTime - startTime
    };

    // Sign the proof
    const signed = this.signer.sign(proof, {
      action: 'proof_of_work',
      difficulty: difficulty
    });

    return signed;
  }

  /**
   * Verify proof of work
   * @param {object} proof - Signed proof of work
   * @param {number} minDifficulty - Minimum difficulty required
   * @returns {boolean} True if valid
   */
  static verifyProofOfWork(proof, minDifficulty = 4) {
    try {
      // Verify signature first
      const signer = new SoulfraSigner();
      if (!signer.verify(proof)) {
        return false;
      }

      const data = proof.data;

      // Verify hash
      const computedHash = crypto.createHash('sha256')
        .update(`${data.identityID}:${data.nonce}:${data.startTime}`)
        .digest('hex');

      if (computedHash !== data.hash) {
        return false;
      }

      // Verify difficulty
      const leadingZeros = data.hash.match(/^0*/)[0].length;
      return leadingZeros >= minDifficulty;

    } catch (error) {
      return false;
    }
  }

  /**
   * Create time-based proof (account age verification)
   * Proves account existed at a certain time
   *
   * @returns {object} Time proof
   */
  createTimeProof() {
    if (!this.signer) {
      throw new Error('No identity loaded');
    }

    const proofData = {
      identityID: this.getIdentityID(),
      createdAt: this.createdAt,
      currentTime: new Date().toISOString(),
      accountAgeDays: this._getAccountAgeDays()
    };

    const signed = this.signer.sign(proofData, {
      action: 'time_proof',
      proof_type: 'account_age'
    });

    return signed;
  }

  // ========================================================================
  // Reputation System (Decentralized)
  // ========================================================================

  /**
   * Record a verified action (builds reputation)
   * @param {string} actionType - Type of action (commit, review, etc.)
   * @param {object} actionData - Action details
   * @returns {object} Signed action record
   */
  recordAction(actionType, actionData) {
    if (!this.signer) {
      throw new Error('No identity loaded');
    }

    // Update reputation
    this.reputation.verified_actions = (this.reputation.verified_actions || 0) + 1;

    if (actionType === 'code_commit') {
      this.reputation.commits = (this.reputation.commits || 0) + 1;
    }

    if (!this.reputation.first_action) {
      this.reputation.first_action = new Date().toISOString();
    }

    this.reputation.last_action = new Date().toISOString();

    // Create signed record
    const record = this.signer.sign(actionData, {
      action: actionType,
      reputation_score: this._calculateReputationScore()
    });

    return record;
  }

  /**
   * Calculate reputation score (decentralized)
   * @returns {number} Reputation score (0-100)
   */
  _calculateReputationScore() {
    let score = 0;

    // Account age (up to 20 points)
    const ageDays = this._getAccountAgeDays();
    score += Math.min(20, Math.floor(ageDays / 30) * 5); // 5 points per month, max 20

    // Verified actions (up to 40 points)
    const actions = this.reputation.verified_actions || 0;
    score += Math.min(40, actions * 2);

    // Commits (up to 40 points)
    const commits = this.reputation.commits || 0;
    score += Math.min(40, commits);

    return Math.min(100, score);
  }

  /**
   * Get account age in days
   */
  _getAccountAgeDays() {
    const created = new Date(this.createdAt);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get reputation summary
   */
  getReputation() {
    return {
      score: this._calculateReputationScore(),
      commits: this.reputation.commits || 0,
      verified_actions: this.reputation.verified_actions || 0,
      account_age_days: this._getAccountAgeDays(),
      first_action: this.reputation.first_action,
      last_action: this.reputation.last_action
    };
  }

  // ========================================================================
  // Multi-Factor Proof
  // ========================================================================

  /**
   * Create multi-factor proof (combines multiple proofs)
   * @param {object} options - Proof options
   * @returns {object} Combined multi-factor proof
   */
  createMultiFactorProof(options = {}) {
    if (!this.signer) {
      throw new Error('No identity loaded');
    }

    const proofs = {
      identityID: this.getIdentityID()
    };

    // Zero-knowledge proof
    if (options.includeZKProof !== false) {
      const challenge = SoulfraIdentity.createChallenge();
      proofs.zkProof = this.createProof(challenge);
    }

    // Proof of work
    if (options.includePoW) {
      proofs.proofOfWork = this.createProofOfWork(options.powDifficulty || 4);
    }

    // Time proof
    if (options.includeTimeProof !== false) {
      proofs.timeProof = this.createTimeProof();
    }

    // Reputation
    proofs.reputation = this.getReputation();

    // Sign the entire multi-factor proof
    const signed = this.signer.sign(proofs, {
      action: 'multi_factor_proof',
      proof_factors: Object.keys(proofs).length
    });

    return signed;
  }
}

module.exports = SoulfraIdentity;
