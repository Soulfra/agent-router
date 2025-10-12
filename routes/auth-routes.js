/**
 * Authentication Routes
 *
 * User registration, login, and session management
 * Cross-domain SSO for CalOS network
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const {
  requireAuth,
  optionalAuth,
  checkTrustedDevice,
  createSession,
  revokeSession,
  addTrustedDevice,
  getUserSessions,
  getTrustedDevices,
  refreshAccessToken
} = require('../middleware/sso-auth');

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  return router;
}

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * Create new user account
 */
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      username = null,
      displayName = null,
      walletAddress = null
    } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Email already registered'
      });
    }

    // Check if username is taken
    if (username) {
      const existingUsername = await db.query(
        'SELECT user_id FROM users WHERE username = $1',
        [username.toLowerCase()]
      );

      if (existingUsername.rows.length > 0) {
        return res.status(400).json({
          error: 'Username already taken'
        });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const userResult = await db.query(`
      INSERT INTO users (
        email,
        password_hash,
        username,
        display_name,
        wallet_address,
        verification_token,
        verification_expires_at,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING user_id, email, username, display_name, wallet_address, created_at
    `, [
      email.toLowerCase(),
      passwordHash,
      username ? username.toLowerCase() : null,
      displayName,
      walletAddress,
      verificationToken,
      verificationExpires
    ]);

    const user = userResult.rows[0];

    // TODO: Send verification email
    console.log(`[Auth] Verification link: /api/auth/verify-email?token=${verificationToken}`);

    res.status(201).json({
      success: true,
      user: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        walletAddress: user.wallet_address
      },
      message: 'Account created successfully. Please check your email to verify your account.'
    });

  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
  try {
    const {
      email,
      password,
      domainId = null,
      trustDevice = false
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Get user
    const userResult = await db.query(`
      SELECT
        user_id,
        email,
        password_hash,
        username,
        display_name,
        wallet_address,
        email_verified,
        status
      FROM users
      WHERE email = $1
    `, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = userResult.rows[0];

    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Account is suspended or banned',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Create session
    const sessionData = await createSession(user.user_id, domainId, req);

    // Add device as trusted if requested
    if (trustDevice) {
      await addTrustedDevice(user.user_id, req);
    }

    // Set cookies
    res.cookie('calos_session', sessionData.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('calos_refresh', sessionData.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      success: true,
      accessToken: sessionData.accessToken,
      refreshToken: sessionData.refreshToken,
      expiresIn: sessionData.expiresIn,
      user: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        walletAddress: user.wallet_address,
        emailVerified: user.email_verified
      }
    });

  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email address with token
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    // Find user with token
    const userResult = await db.query(`
      SELECT user_id, email
      FROM users
      WHERE verification_token = $1
        AND verification_expires_at > NOW()
    `, [token]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired verification token',
        code: 'INVALID_TOKEN'
      });
    }

    const user = userResult.rows[0];

    // Mark email as verified
    await db.query(`
      UPDATE users
      SET
        email_verified = TRUE,
        verification_token = NULL,
        verification_expires_at = NULL
      WHERE user_id = $1
    `, [user.user_id]);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('[Auth] Verify email error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

/**
 * POST /api/auth/logout
 * Revoke current session
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await revokeSession(req.user.sessionId, 'user_logout');

    // Clear cookies
    res.clearCookie('calos_session');
    res.clearCookie('calos_refresh');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/refresh-token
 * Refresh access token
 */
router.post('/refresh-token', refreshAccessToken);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userResult = await db.query(`
      SELECT
        user_id,
        email,
        username,
        display_name,
        avatar_url,
        wallet_address,
        email_verified,
        created_at,
        last_login_at,
        login_count
      FROM users
      WHERE user_id = $1
    `, [req.user.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * PATCH /api/auth/me
 * Update user profile
 */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const {
      username,
      displayName,
      avatarUrl,
      walletAddress
    } = req.body;

    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (username !== undefined) {
      // Check if username is available
      const existingUsername = await db.query(
        'SELECT user_id FROM users WHERE username = $1 AND user_id != $2',
        [username.toLowerCase(), req.user.userId]
      );

      if (existingUsername.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      updates.push(`username = $${paramCounter++}`);
      values.push(username.toLowerCase());
    }

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramCounter++}`);
      values.push(displayName);
    }

    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramCounter++}`);
      values.push(avatarUrl);
    }

    if (walletAddress !== undefined) {
      updates.push(`wallet_address = $${paramCounter++}`);
      values.push(walletAddress);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(req.user.userId);

    const userResult = await db.query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE user_id = $${paramCounter}
      RETURNING user_id, email, username, display_name, avatar_url, wallet_address
    `, values);

    res.json({
      success: true,
      user: userResult.rows[0]
    });

  } catch (error) {
    console.error('[Auth] Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * GET /api/auth/sessions
 * List active sessions
 */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.userId);

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        sessionId: s.session_id,
        domainId: s.domain_id,
        ipAddress: s.ip_address,
        isTrusted: s.is_trusted,
        createdAt: s.created_at,
        lastActiveAt: s.last_active_at,
        expiresAt: s.expires_at
      }))
    });

  } catch (error) {
    console.error('[Auth] Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke specific session
 */
router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session belongs to user
    const sessionResult = await db.query(
      'SELECT user_id FROM user_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessionResult.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await revokeSession(sessionId, 'user_revoked');

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error) {
    console.error('[Auth] Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * GET /api/auth/trusted-devices
 * List trusted devices
 */
router.get('/trusted-devices', requireAuth, async (req, res) => {
  try {
    const devices = await getTrustedDevices(req.user.userId);

    res.json({
      success: true,
      devices: devices.map(d => ({
        deviceId: d.device_id,
        deviceName: d.device_name,
        browser: d.browser,
        os: d.os,
        firstSeenAt: d.first_seen_at,
        lastSeenAt: d.last_seen_at,
        lastIp: d.last_ip,
        trustedUntil: d.trusted_until
      }))
    });

  } catch (error) {
    console.error('[Auth] Get trusted devices error:', error);
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

/**
 * POST /api/auth/trusted-devices
 * Add current device as trusted
 */
router.post('/trusted-devices', requireAuth, async (req, res) => {
  try {
    const { deviceName = null } = req.body;

    const deviceId = await addTrustedDevice(req.user.userId, req, deviceName);

    res.json({
      success: true,
      deviceId,
      message: 'Device added as trusted. You will skip captchas on this device.'
    });

  } catch (error) {
    console.error('[Auth] Add trusted device error:', error);
    res.status(500).json({ error: 'Failed to add trusted device' });
  }
});

/**
 * DELETE /api/auth/trusted-devices/:deviceId
 * Remove trusted device
 */
router.delete('/trusted-devices/:deviceId', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Verify device belongs to user
    const deviceResult = await db.query(
      'SELECT user_id FROM trusted_devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (deviceResult.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Deactivate device
    await db.query(
      'UPDATE trusted_devices SET active = FALSE WHERE device_id = $1',
      [deviceId]
    );

    res.json({
      success: true,
      message: 'Device removed from trusted list'
    });

  } catch (error) {
    console.error('[Auth] Remove trusted device error:', error);
    res.status(500).json({ error: 'Failed to remove trusted device' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user
    const userResult = await db.query(
      'SELECT user_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (don't reveal if email exists)
    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    const userId = userResult.rows[0].user_id;

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(`
      UPDATE users
      SET
        password_reset_token = $1,
        password_reset_expires_at = $2
      WHERE user_id = $3
    `, [resetToken, resetExpires, userId]);

    // TODO: Send password reset email
    console.log(`[Auth] Password reset link: /api/auth/reset-password?token=${resetToken}`);

    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    // Find user with token
    const userResult = await db.query(`
      SELECT user_id
      FROM users
      WHERE password_reset_token = $1
        AND password_reset_expires_at > NOW()
    `, [token]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN'
      });
    }

    const userId = userResult.rows[0].user_id;

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await db.query(`
      UPDATE users
      SET
        password_hash = $1,
        password_reset_token = NULL,
        password_reset_expires_at = NULL
      WHERE user_id = $2
    `, [passwordHash, userId]);

    // Revoke all existing sessions for security
    await db.query(`
      UPDATE user_sessions
      SET
        revoked = TRUE,
        revoked_at = NOW(),
        revoke_reason = 'password_reset'
      WHERE user_id = $1 AND revoked = FALSE
    `, [userId]);

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });

  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = { router, initRoutes };
