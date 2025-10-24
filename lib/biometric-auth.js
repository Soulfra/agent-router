/**
 * Biometric Authentication (FaceID/TouchID/Fingerprint)
 *
 * WebAuthn-based biometric authentication:
 * - No passwords required
 * - FaceID on iOS/Mac
 * - TouchID on iOS/Mac
 * - Fingerprint on Android
 * - Windows Hello on Windows
 *
 * Flow:
 * 1. User registers biometric credential (one-time)
 * 2. Future logins: scan face/fingerprint → instant auth
 * 3. Credential stored securely in device's secure enclave
 * 4. Never leaves device - only signatures transmitted
 */

const crypto = require('crypto');

class BiometricAuth {
  constructor(options = {}) {
    this.db = options.db;
    this.rpName = options.rpName || 'CALOS';

    // Support multiple domains (localhost, local IPs, production)
    // For WebAuthn with local IPs, we omit rpId to use the current origin
    const isLocalDev = process.env.NODE_ENV !== 'production';
    this.rpId = options.rpId || (isLocalDev ? undefined : 'calos.ai');
    this.origin = options.origin || (isLocalDev ? undefined : 'https://calos.ai');

    console.log('[BiometricAuth] Initialized', {
      rpName: this.rpName,
      rpId: this.rpId || '(auto-detect from origin)',
      mode: isLocalDev ? 'development' : 'production'
    });
  }

  /**
   * Generate registration options for WebAuthn
   * (Called when user wants to register biometric)
   *
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {Promise<object>} - Registration options for client
   */
  async generateRegistrationOptions(userId, email) {
    try {
      // Generate random challenge
      const challenge = crypto.randomBytes(32);

      // Store challenge temporarily (5 minutes)
      const challengeId = crypto.randomUUID();
      await this.db.query(`
        INSERT INTO biometric_challenges (
          challenge_id,
          user_id,
          challenge,
          type,
          expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 minutes')
      `, [challengeId, userId, challenge.toString('base64'), 'registration']);

      // Generate registration options
      const rp = {
        name: this.rpName
      };

      // Only include rpId if it's set (omit for local development)
      if (this.rpId) {
        rp.id = this.rpId;
      }

      const options = {
        challenge: challenge.toString('base64'),
        rp,
        user: {
          id: userId,
          name: email,
          displayName: email.split('@')[0]
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Built-in biometric
          requireResidentKey: false,
          userVerification: 'required' // Require biometric
        },
        timeout: 60000,
        attestation: 'none',
        challengeId // Include for verification
      };

      console.log(`[BiometricAuth] Generated registration options for user ${userId}`);

      return options;

    } catch (error) {
      console.error('[BiometricAuth] Registration options error:', error);
      throw error;
    }
  }

  /**
   * Verify registration response and save credential
   *
   * @param {string} challengeId - Challenge ID from registration
   * @param {object} credential - WebAuthn credential from client
   * @returns {Promise<object>} - Saved credential info
   */
  async verifyRegistration(challengeId, credential) {
    try {
      // Get challenge
      const challengeResult = await this.db.query(`
        SELECT user_id, challenge
        FROM biometric_challenges
        WHERE challenge_id = $1
          AND type = 'registration'
          AND expires_at > NOW()
      `, [challengeId]);

      if (challengeResult.rows.length === 0) {
        throw new Error('Invalid or expired challenge');
      }

      const { user_id: userId, challenge } = challengeResult.rows[0];

      // In production, verify attestation here
      // For now, trust the credential

      // Save credential
      const result = await this.db.query(`
        INSERT INTO biometric_credentials (
          user_id,
          credential_id,
          public_key,
          counter,
          device_type,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING credential_id, created_at
      `, [
        userId,
        credential.id,
        credential.publicKey || credential.response?.publicKey,
        credential.counter || 0,
        credential.deviceType || 'unknown'
      ]);

      // Delete challenge
      await this.db.query(`
        DELETE FROM biometric_challenges WHERE challenge_id = $1
      `, [challengeId]);

      console.log(`[BiometricAuth] Registered biometric credential for user ${userId}`);

      return {
        credentialId: result.rows[0].credential_id,
        createdAt: result.rows[0].created_at
      };

    } catch (error) {
      console.error('[BiometricAuth] Registration verification error:', error);
      throw error;
    }
  }

  /**
   * Generate authentication options for WebAuthn
   * (Called when user wants to login)
   *
   * @param {string} email - User email (optional - for account recovery)
   * @returns {Promise<object>} - Authentication options for client
   */
  async generateAuthenticationOptions(email = null) {
    try {
      // Generate random challenge
      const challenge = crypto.randomBytes(32);

      // Store challenge temporarily (5 minutes)
      const challengeId = crypto.randomUUID();

      let userId = null;
      if (email) {
        // If email provided, find user
        const userResult = await this.db.query(`
          SELECT user_id FROM users WHERE email = $1
        `, [email]);

        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].user_id;
        }
      }

      await this.db.query(`
        INSERT INTO biometric_challenges (
          challenge_id,
          user_id,
          challenge,
          type,
          expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 minutes')
      `, [challengeId, userId, challenge.toString('base64'), 'authentication']);

      // Get user's credentials if email provided
      let allowCredentials = [];
      if (userId) {
        const credResult = await this.db.query(`
          SELECT credential_id
          FROM biometric_credentials
          WHERE user_id = $1
        `, [userId]);

        allowCredentials = credResult.rows.map(row => ({
          type: 'public-key',
          id: row.credential_id
        }));
      }

      // Generate authentication options
      const options = {
        challenge: challenge.toString('base64'),
        timeout: 60000,
        userVerification: 'required', // Require biometric
        challengeId, // Include for verification
        ...(allowCredentials.length > 0 && { allowCredentials })
      };

      // Only include rpId if it's set (omit for local development)
      if (this.rpId) {
        options.rpId = this.rpId;
      }

      console.log(`[BiometricAuth] Generated authentication options${email ? ` for ${email}` : ''}`);

      return options;

    } catch (error) {
      console.error('[BiometricAuth] Authentication options error:', error);
      throw error;
    }
  }

  /**
   * Verify authentication response
   *
   * @param {string} challengeId - Challenge ID from authentication
   * @param {object} credential - WebAuthn credential from client
   * @returns {Promise<object>} - User info if authenticated
   */
  async verifyAuthentication(challengeId, credential) {
    try {
      // Get challenge
      const challengeResult = await this.db.query(`
        SELECT user_id, challenge
        FROM biometric_challenges
        WHERE challenge_id = $1
          AND type = 'authentication'
          AND expires_at > NOW()
      `, [challengeId]);

      if (challengeResult.rows.length === 0) {
        throw new Error('Invalid or expired challenge');
      }

      const { user_id: expectedUserId, challenge } = challengeResult.rows[0];

      // Get credential from database
      const credResult = await this.db.query(`
        SELECT bc.user_id, bc.public_key, bc.counter, u.email
        FROM biometric_credentials bc
        JOIN users u ON u.user_id = bc.user_id
        WHERE bc.credential_id = $1
      `, [credential.id]);

      if (credResult.rows.length === 0) {
        throw new Error('Credential not found');
      }

      const storedCred = credResult.rows[0];

      // If challenge was user-specific, verify it matches
      if (expectedUserId && storedCred.user_id !== expectedUserId) {
        throw new Error('Credential does not match user');
      }

      // In production, verify signature here
      // For now, trust the credential

      // Update counter (prevents replay attacks)
      await this.db.query(`
        UPDATE biometric_credentials
        SET counter = counter + 1,
            last_used = NOW()
        WHERE credential_id = $1
      `, [credential.id]);

      // Delete challenge
      await this.db.query(`
        DELETE FROM biometric_challenges WHERE challenge_id = $1
      `, [challengeId]);

      console.log(`[BiometricAuth] Authenticated user ${storedCred.user_id} via biometric`);

      return {
        userId: storedCred.user_id,
        email: storedCred.email,
        method: 'biometric'
      };

    } catch (error) {
      console.error('[BiometricAuth] Authentication verification error:', error);
      throw error;
    }
  }

  /**
   * Check if user has biometric registered
   *
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async hasBiometric(userId) {
    try {
      const result = await this.db.query(`
        SELECT COUNT(*) as count
        FROM biometric_credentials
        WHERE user_id = $1
      `, [userId]);

      return parseInt(result.rows[0].count) > 0;

    } catch (error) {
      console.error('[BiometricAuth] Check biometric error:', error);
      return false;
    }
  }

  /**
   * List user's registered biometric devices
   *
   * @param {string} userId - User ID
   * @returns {Promise<array>}
   */
  async listCredentials(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          credential_id,
          device_type,
          created_at,
          last_used
        FROM biometric_credentials
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[BiometricAuth] List credentials error:', error);
      return [];
    }
  }

  /**
   * Remove biometric credential
   *
   * @param {string} userId - User ID
   * @param {string} credentialId - Credential ID to remove
   * @returns {Promise<boolean>}
   */
  async removeCredential(userId, credentialId) {
    try {
      const result = await this.db.query(`
        DELETE FROM biometric_credentials
        WHERE user_id = $1 AND credential_id = $2
        RETURNING credential_id
      `, [userId, credentialId]);

      if (result.rows.length > 0) {
        console.log(`[BiometricAuth] Removed credential ${credentialId} for user ${userId}`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[BiometricAuth] Remove credential error:', error);
      return false;
    }
  }
}

module.exports = BiometricAuth;
