/**
 * SSO Authentication Middleware
 *
 * Cross-domain single sign-on for CalOS network
 * Users log in once and access all 12 domains without captchas
 *
 * Features user context transformer integration:
 * - Loads user preferences on authentication
 * - Attaches accessibility settings to req.user
 * - Enables AI context enrichment
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserContextTransformer = require('../lib/user-context-transformer');

// JWT Secret (should be in environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'calos-sso-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'calos-refresh-secret-change-in-production';

// Token expiration times (configurable via environment variables)
const ACCESS_TOKEN_HOURS = parseInt(process.env.SESSION_TOKEN_HOURS) || 4;
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_HOURS}h`; // Default 4 hours (was 15 minutes)
const REFRESH_TOKEN_EXPIRY = '30d'; // 30 days
const TRUSTED_SESSION_EXPIRY = '90d'; // 90 days for trusted devices

// Database connection (injected via initMiddleware)
let db = null;

// User context transformer (lazy initialized)
let contextTransformer = null;

/**
 * Initialize middleware with database connection
 */
function initMiddleware(database) {
  db = database;

  // Initialize context transformer
  if (db && !contextTransformer) {
    contextTransformer = new UserContextTransformer({ db });
    console.log('[SSO Auth] User context transformer initialized');
  }
}

/**
 * Generate device fingerprint from request
 * Combines IP, user agent, and other headers for unique identification
 */
function generateDeviceFingerprint(req) {
  const components = [
    req.ip || req.connection.remoteAddress,
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || ''
  ];

  const fingerprint = crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex');

  return fingerprint;
}

/**
 * Parse browser and OS from user agent
 */
function parseUserAgent(userAgent) {
  const browsers = {
    'Chrome': /Chrome\/(\d+)/,
    'Firefox': /Firefox\/(\d+)/,
    'Safari': /Version\/(\d+).*Safari/,
    'Edge': /Edg\/(\d+)/,
    'Opera': /Opera\/(\d+)/
  };

  const oses = {
    'Windows': /Windows NT (\d+\.\d+)/,
    'macOS': /Mac OS X (\d+[._]\d+)/,
    'iOS': /iPhone OS (\d+[._]\d+)/,
    'Android': /Android (\d+\.\d+)/,
    'Linux': /Linux/
  };

  let browser = 'Unknown';
  let os = 'Unknown';

  for (const [name, regex] of Object.entries(browsers)) {
    if (regex.test(userAgent)) {
      browser = name;
      break;
    }
  }

  for (const [name, regex] of Object.entries(oses)) {
    if (regex.test(userAgent)) {
      os = name;
      break;
    }
  }

  return { browser, os };
}

/**
 * Generate JWT access token
 */
function generateAccessToken(userId, sessionId, email, walletAddress = null) {
  return jwt.sign(
    {
      userId,
      sessionId,
      email,
      walletAddress,
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate JWT refresh token
 */
function generateRefreshToken(userId, sessionId) {
  return jwt.sign(
    {
      userId,
      sessionId,
      type: 'refresh'
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Verify JWT token
 */
function verifyToken(token, isRefreshToken = false) {
  try {
    const secret = isRefreshToken ? JWT_REFRESH_SECRET : JWT_SECRET;
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from request
 * Checks Authorization header and cookies
 */
function extractToken(req) {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  if (req.cookies && req.cookies.calos_session) {
    return req.cookies.calos_session;
  }

  return null;
}

/**
 * Middleware: Require Authentication
 * Validates session token and attaches user to request
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Validate session in database
    const sessionResult = await db.query(`
      SELECT * FROM validate_session($1)
    `, [token]);

    const session = sessionResult.rows[0];

    if (!session.valid) {
      return res.status(401).json({
        error: 'Session expired or revoked',
        code: 'INVALID_SESSION'
      });
    }

    // Attach user info to request
    req.user = {
      userId: session.user_id,
      sessionId: session.session_id,
      email: session.email,
      isTrusted: session.is_trusted
    };

    // Load user context if transformer available
    // This attaches accessibility preferences, theme, language, etc.
    if (contextTransformer) {
      try {
        const userContext = await contextTransformer.loadUserContext(session.user_id);
        req.user.context = userContext;
      } catch (error) {
        console.error('[SSO Auth] Error loading user context:', error);
        // Continue without context - don't block authentication
      }
    }

    // Update session last_active_at
    await db.query(`
      UPDATE user_sessions
      SET last_active_at = NOW()
      WHERE session_id = $1
    `, [session.session_id]);

    next();
  } catch (error) {
    console.error('[SSO Auth] Require auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware: Optional Authentication
 * Attaches user to request if authenticated, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next();
    }

    const sessionResult = await db.query(`
      SELECT * FROM validate_session($1)
    `, [token]);

    const session = sessionResult.rows[0];

    if (session.valid) {
      req.user = {
        userId: session.user_id,
        sessionId: session.session_id,
        email: session.email,
        isTrusted: session.is_trusted
      };
    }

    next();
  } catch (error) {
    console.error('[SSO Auth] Optional auth error:', error);
    next();
  }
}

/**
 * Middleware: Check if device is trusted (skip captchas)
 */
async function checkTrustedDevice(req, res, next) {
  try {
    const deviceFingerprint = generateDeviceFingerprint(req);

    // If user is authenticated, check their trusted devices
    if (req.user) {
      const result = await db.query(`
        SELECT device_id, device_name, trusted_until
        FROM trusted_devices
        WHERE user_id = $1
          AND device_fingerprint = $2
          AND active = TRUE
          AND trusted_until > NOW()
      `, [req.user.userId, deviceFingerprint]);

      if (result.rows.length > 0) {
        req.deviceTrusted = true;
        req.trustedDevice = result.rows[0];

        // Update last seen
        await db.query(`
          UPDATE trusted_devices
          SET
            last_seen_at = NOW(),
            last_ip = $1
          WHERE device_id = $2
        `, [req.ip, result.rows[0].device_id]);
      } else {
        req.deviceTrusted = false;
      }
    } else {
      req.deviceTrusted = false;
    }

    req.deviceFingerprint = deviceFingerprint;
    next();
  } catch (error) {
    console.error('[SSO Auth] Check trusted device error:', error);
    next();
  }
}

/**
 * Middleware: Log domain access
 * Track when users navigate between domains
 */
async function logDomainAccess(domainId) {
  return async (req, res, next) => {
    try {
      if (req.user) {
        const referrerDomainId = req.headers['x-referrer-domain-id'] || null;
        const captchaShown = req.deviceTrusted ? false : true;

        await db.query(`
          SELECT log_domain_access($1, $2, $3, $4, $5, NULL)
        `, [
          req.user.userId,
          domainId,
          req.user.sessionId,
          referrerDomainId,
          captchaShown
        ]);
      }

      next();
    } catch (error) {
      console.error('[SSO Auth] Log domain access error:', error);
      next();
    }
  };
}

/**
 * Middleware: Refresh token
 * Generate new access token from refresh token
 */
async function refreshAccessToken(req, res, next) {
  try {
    const refreshToken = req.body.refreshToken || req.cookies.calos_refresh;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, true);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Verify session still valid
    const sessionResult = await db.query(`
      SELECT
        us.session_id,
        us.user_id,
        u.email,
        u.wallet_address,
        us.revoked,
        us.expires_at
      FROM user_sessions us
      JOIN users u ON us.user_id = u.user_id
      WHERE us.session_id = $1
        AND us.revoked = FALSE
        AND us.expires_at > NOW()
    `, [decoded.sessionId]);

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Session expired or revoked',
        code: 'SESSION_EXPIRED'
      });
    }

    const session = sessionResult.rows[0];

    // Generate new access token
    const newAccessToken = generateAccessToken(
      session.user_id,
      session.session_id,
      session.email,
      session.wallet_address
    );

    // Set cookie
    res.cookie('calos_session', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.json({
      success: true,
      accessToken: newAccessToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('[SSO Auth] Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
}

/**
 * Helper: Create user session
 * Called after successful login
 */
async function createSession(userId, domainId, req) {
  try {
    const deviceFingerprint = generateDeviceFingerprint(req);
    const { browser, os } = parseUserAgent(req.headers['user-agent'] || '');

    // Get user details
    const userResult = await db.query(`
      SELECT email, wallet_address FROM users WHERE user_id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Generate tokens
    const sessionId = crypto.randomUUID();
    const accessToken = generateAccessToken(userId, sessionId, user.email, user.wallet_address);
    const refreshToken = generateRefreshToken(userId, sessionId);

    // Create session in database
    await db.query(`
      SELECT create_user_session($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      accessToken,
      refreshToken,
      domainId,
      req.ip,
      req.headers['user-agent'],
      deviceFingerprint
    ]);

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        userId,
        email: user.email,
        walletAddress: user.wallet_address
      }
    };
  } catch (error) {
    console.error('[SSO Auth] Create session error:', error);
    throw error;
  }
}

/**
 * Helper: Revoke session (logout)
 */
async function revokeSession(sessionId, reason = 'user_logout') {
  try {
    await db.query(`
      SELECT revoke_session($1, $2)
    `, [sessionId, reason]);

    return true;
  } catch (error) {
    console.error('[SSO Auth] Revoke session error:', error);
    return false;
  }
}

/**
 * Helper: Add trusted device
 */
async function addTrustedDevice(userId, req, deviceName = null) {
  try {
    const deviceFingerprint = generateDeviceFingerprint(req);
    const { browser, os } = parseUserAgent(req.headers['user-agent'] || '');

    const name = deviceName || `${browser} on ${os}`;

    const result = await db.query(`
      SELECT add_trusted_device($1, $2, $3, $4, $5, $6) as device_id
    `, [userId, deviceFingerprint, name, browser, os, req.ip]);

    return result.rows[0].device_id;
  } catch (error) {
    console.error('[SSO Auth] Add trusted device error:', error);
    throw error;
  }
}

/**
 * Helper: Get user sessions
 */
async function getUserSessions(userId) {
  try {
    const result = await db.query(`
      SELECT
        session_id,
        domain_id,
        ip_address,
        device_fingerprint,
        is_trusted,
        created_at,
        last_active_at,
        expires_at
      FROM user_sessions
      WHERE user_id = $1
        AND revoked = FALSE
        AND expires_at > NOW()
      ORDER BY last_active_at DESC
    `, [userId]);

    return result.rows;
  } catch (error) {
    console.error('[SSO Auth] Get user sessions error:', error);
    return [];
  }
}

/**
 * Helper: Get trusted devices
 */
async function getTrustedDevices(userId) {
  try {
    const result = await db.query(`
      SELECT
        device_id,
        device_name,
        browser,
        os,
        first_seen_at,
        last_seen_at,
        last_ip,
        trusted_until
      FROM trusted_devices
      WHERE user_id = $1
        AND active = TRUE
        AND trusted_until > NOW()
      ORDER BY last_seen_at DESC
    `, [userId]);

    return result.rows;
  } catch (error) {
    console.error('[SSO Auth] Get trusted devices error:', error);
    return [];
  }
}

module.exports = {
  initMiddleware,
  requireAuth,
  optionalAuth,
  checkTrustedDevice,
  logDomainAccess,
  refreshAccessToken,
  generateDeviceFingerprint,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  createSession,
  revokeSession,
  addTrustedDevice,
  getUserSessions,
  getTrustedDevices,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
