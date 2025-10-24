/**
 * Passkey/WebAuthn Authentication Routes
 *
 * Provides endpoints for passwordless authentication using:
 * - FaceID (iOS/macOS)
 * - TouchID (iOS/macOS)
 * - Fingerprint (Android)
 * - Windows Hello (Windows)
 *
 * Flow:
 * 1. Registration: POST /api/auth/passkey/register/options → Browser prompts for biometric → POST /api/auth/passkey/register/verify
 * 2. Authentication: POST /api/auth/passkey/authenticate/options → Browser prompts for biometric → POST /api/auth/passkey/authenticate/verify
 */

const express = require('express');
const BiometricAuth = require('../lib/biometric-auth');

function initPasskeyRoutes(db, ssoAuth) {
  const router = express.Router();

  // Initialize biometric auth
  const biometricAuth = new BiometricAuth({
    db,
    rpName: process.env.RP_NAME || 'Soulfra Platform',
    rpId: process.env.RP_ID || 'localhost',
    origin: process.env.RP_ORIGIN || 'http://localhost:5001'
  });

  /**
   * POST /api/auth/passkey/register/options
   * Generate passkey registration options (step 1)
   *
   * Body: { email } (for existing authenticated user) or use req.user
   */
  router.post('/register/options', async (req, res) => {
    try {
      let userId, email;

      // Check if user is already authenticated
      if (req.user && req.user.userId) {
        userId = req.user.userId;
        email = req.user.email;
      } else if (req.body.email) {
        // Email provided - find user
        const result = await db.query(
          'SELECT user_id, email FROM users WHERE email = $1',
          [req.body.email]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            message: 'Please create an account first before registering a passkey'
          });
        }

        userId = result.rows[0].user_id;
        email = result.rows[0].email;
      } else {
        return res.status(400).json({
          error: 'Email required',
          message: 'Please provide an email or be authenticated'
        });
      }

      // Generate registration options
      const options = await biometricAuth.generateRegistrationOptions(userId, email);

      res.json({
        success: true,
        options
      });

    } catch (error) {
      console.error('[PasskeyRoutes] Registration options error:', error);
      res.status(500).json({
        error: 'Failed to generate registration options',
        message: error.message
      });
    }
  });

  /**
   * POST /api/auth/passkey/register/verify
   * Verify passkey registration (step 2)
   *
   * Body: { challengeId, credential }
   */
  router.post('/register/verify', async (req, res) => {
    try {
      const { challengeId, credential } = req.body;

      if (!challengeId || !credential) {
        return res.status(400).json({
          error: 'Missing parameters',
          message: 'challengeId and credential are required'
        });
      }

      // Verify registration
      const result = await biometricAuth.verifyRegistration(challengeId, credential);

      res.json({
        success: true,
        message: 'Passkey registered successfully',
        credentialId: result.credentialId
      });

    } catch (error) {
      console.error('[PasskeyRoutes] Registration verification error:', error);
      res.status(400).json({
        error: 'Registration failed',
        message: error.message
      });
    }
  });

  /**
   * POST /api/auth/passkey/authenticate/options
   * Generate passkey authentication options (step 1)
   *
   * Body: { email } (optional - for account recovery)
   */
  router.post('/authenticate/options', async (req, res) => {
    try {
      const { email } = req.body;

      // Generate authentication options
      const options = await biometricAuth.generateAuthenticationOptions(email);

      res.json({
        success: true,
        options
      });

    } catch (error) {
      console.error('[PasskeyRoutes] Authentication options error:', error);
      res.status(500).json({
        error: 'Failed to generate authentication options',
        message: error.message
      });
    }
  });

  /**
   * POST /api/auth/passkey/authenticate/verify
   * Verify passkey authentication (step 2)
   *
   * Body: { challengeId, credential }
   */
  router.post('/authenticate/verify', async (req, res) => {
    try {
      const { challengeId, credential } = req.body;

      if (!challengeId || !credential) {
        return res.status(400).json({
          error: 'Missing parameters',
          message: 'challengeId and credential are required'
        });
      }

      // Verify authentication
      const user = await biometricAuth.verifyAuthentication(challengeId, credential);

      // Create session token using SSO auth
      const sessionToken = await ssoAuth.createSession(user.userId, {
        email: user.email,
        authMethod: 'passkey'
      });

      // Get full user info
      const userResult = await db.query(`
        SELECT user_id, username, email, display_name, email_verified, created_at
        FROM users
        WHERE user_id = $1
      `, [user.userId]);

      const userInfo = userResult.rows[0];

      res.json({
        success: true,
        message: 'Authentication successful',
        token: sessionToken,
        user: {
          userId: userInfo.user_id,
          username: userInfo.username,
          email: userInfo.email,
          displayName: userInfo.display_name,
          emailVerified: userInfo.email_verified
        }
      });

    } catch (error) {
      console.error('[PasskeyRoutes] Authentication verification error:', error);
      res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/auth/passkey/credentials
   * List user's registered passkeys (requires authentication)
   */
  router.get('/credentials', async (req, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Please authenticate first'
        });
      }

      const credentials = await biometricAuth.listCredentials(req.user.userId);

      res.json({
        success: true,
        credentials
      });

    } catch (error) {
      console.error('[PasskeyRoutes] List credentials error:', error);
      res.status(500).json({
        error: 'Failed to list credentials',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/auth/passkey/credentials/:credentialId
   * Remove a passkey (requires authentication)
   */
  router.delete('/credentials/:credentialId', async (req, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Please authenticate first'
        });
      }

      const { credentialId } = req.params;
      const removed = await biometricAuth.removeCredential(req.user.userId, credentialId);

      if (removed) {
        res.json({
          success: true,
          message: 'Passkey removed successfully'
        });
      } else {
        res.status(404).json({
          error: 'Passkey not found',
          message: 'The specified passkey does not exist'
        });
      }

    } catch (error) {
      console.error('[PasskeyRoutes] Remove credential error:', error);
      res.status(500).json({
        error: 'Failed to remove passkey',
        message: error.message
      });
    }
  });

  /**
   * GET /api/auth/passkey/check/:email
   * Check if user has passkey registered
   */
  router.get('/check/:email', async (req, res) => {
    try {
      const { email } = req.params;

      // Find user
      const userResult = await db.query(
        'SELECT user_id FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.json({
          success: true,
          hasBiometric: false,
          userExists: false
        });
      }

      const userId = userResult.rows[0].user_id;
      const hasBiometric = await biometricAuth.hasBiometric(userId);

      res.json({
        success: true,
        hasBiometric,
        userExists: true
      });

    } catch (error) {
      console.error('[PasskeyRoutes] Check biometric error:', error);
      res.status(500).json({
        error: 'Failed to check passkey status',
        message: error.message
      });
    }
  });

  console.log('[PasskeyRoutes] Initialized passkey authentication routes');

  return router;
}

module.exports = initPasskeyRoutes;
