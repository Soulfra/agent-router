/**
 * Universal OAuth Routes
 *
 * OAuth authentication endpoints supporting multiple providers
 * (Google, GitHub, Microsoft, Yahoo, AOL, etc.)
 */

const express = require('express');
const router = express.Router();

const UniversalOAuth = require('../lib/auth/universal-oauth');
const { requireAuth, createSession } = require('../middleware/sso-auth');
const { syncProvidersToDatabase } = require('../lib/auth/providers');

// Database connection (injected via initRoutes)
let db = null;
let oauth = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database, options = {}) {
  db = database;

  // Initialize OAuth adapter
  oauth = new UniversalOAuth(db, {
    baseRedirectUri: options.baseRedirectUri || 'http://localhost:5001/api/auth/oauth/callback',
    usePKCE: options.usePKCE !== false
  });

  // Sync provider configurations to database on startup
  syncProvidersToDatabase(db).catch(err => {
    console.error('[OAuth] Failed to sync providers:', err);
  });

  return router;
}

/**
 * GET /api/auth/oauth/providers
 * List all available OAuth providers
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = await oauth.getEnabledProviders();

    res.json({
      success: true,
      providers: providers.map(p => ({
        providerId: p.provider_id,
        displayName: p.display_name,
        iconUrl: p.icon_url,
        legacyProvider: p.legacy_provider,
        emailDomains: p.email_domains
      }))
    });

  } catch (error) {
    console.error('[OAuth] List providers error:', error);
    res.status(500).json({ error: 'Failed to list OAuth providers' });
  }
});

/**
 * POST /api/auth/oauth/detect-provider
 * Detect OAuth provider from email address
 */
router.post('/detect-provider', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const providerId = await oauth.detectProviderFromEmail(email);

    if (providerId) {
      const provider = await oauth.getProvider(providerId);

      res.json({
        success: true,
        provider: {
          providerId: provider.provider_id,
          displayName: provider.display_name,
          iconUrl: provider.icon_url
        }
      });
    } else {
      res.json({
        success: true,
        provider: null,
        message: 'No OAuth provider detected for this email domain'
      });
    }

  } catch (error) {
    console.error('[OAuth] Detect provider error:', error);
    res.status(500).json({ error: 'Failed to detect OAuth provider' });
  }
});

/**
 * GET /api/auth/oauth/:providerId/authorize
 * Start OAuth authorization flow
 */
router.get('/:providerId/authorize', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { redirectUri, state } = req.query;

    // Generate authorization URL
    const { authUrl, state: generatedState } = await oauth.generateAuthorizationUrl(providerId, {
      redirectUri: redirectUri || undefined,
      userId: req.user?.userId || null
    });

    // Redirect user to OAuth provider
    res.redirect(authUrl);

  } catch (error) {
    console.error(`[OAuth] Authorization error for ${req.params.providerId}:`, error);
    res.status(500).json({
      error: 'Failed to start OAuth authorization',
      message: error.message
    });
  }
});

/**
 * GET /api/auth/oauth/callback
 * OAuth callback endpoint (all providers)
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      return res.status(400).json({
        error: 'OAuth authorization failed',
        code: error,
        description: error_description || 'Authorization was denied or failed'
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing OAuth parameters',
        message: 'Authorization code or state missing'
      });
    }

    // Find authorization attempt from state
    const attemptResult = await db.query(
      'SELECT provider_id FROM oauth_authorization_attempts WHERE state = $1 AND status = \'pending\'',
      [state]
    );

    if (attemptResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired OAuth state',
        code: 'INVALID_STATE'
      });
    }

    const providerId = attemptResult.rows[0].provider_id;

    // Handle callback
    const result = await oauth.handleCallback(providerId, code, state);

    // Create SSO session
    const sessionData = await createSession(result.userId, null, req);

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

    // Return success response or redirect
    const redirectUrl = req.query.redirect_after || '/';

    res.json({
      success: true,
      message: 'OAuth authentication successful',
      accessToken: sessionData.accessToken,
      refreshToken: sessionData.refreshToken,
      user: sessionData.user,
      redirectUrl
    });

  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    res.status(500).json({
      error: 'OAuth callback failed',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/oauth/:providerId/connect
 * Connect an OAuth provider to existing user account
 */
router.post('/:providerId/connect', requireAuth, async (req, res) => {
  try {
    const { providerId } = req.params;

    // Generate authorization URL for connecting account
    const { authUrl } = await oauth.generateAuthorizationUrl(providerId, {
      userId: req.user.userId
    });

    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to this URL to connect their account'
    });

  } catch (error) {
    console.error(`[OAuth] Connect error for ${req.params.providerId}:`, error);
    res.status(500).json({
      error: 'Failed to start account connection',
      message: error.message
    });
  }
});

/**
 * DELETE /api/auth/oauth/:providerId/disconnect
 * Disconnect OAuth provider from user account
 */
router.delete('/:providerId/disconnect', requireAuth, async (req, res) => {
  try {
    const { providerId } = req.params;

    await oauth.revokeConnection(req.user.userId, providerId);

    res.json({
      success: true,
      message: `${providerId} account disconnected successfully`
    });

  } catch (error) {
    console.error(`[OAuth] Disconnect error for ${req.params.providerId}:`, error);
    res.status(500).json({
      error: 'Failed to disconnect account',
      message: error.message
    });
  }
});

/**
 * GET /api/auth/oauth/connections
 * Get user's connected OAuth accounts
 */
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.provider_id,
        p.display_name,
        p.icon_url,
        c.provider_email,
        c.provider_name,
        c.is_primary,
        c.last_used_at,
        c.created_at
      FROM user_oauth_connections c
      JOIN oauth_providers p ON p.provider_id = c.provider_id
      WHERE c.user_id = $1
      ORDER BY c.is_primary DESC, c.last_used_at DESC
    `, [req.user.userId]);

    res.json({
      success: true,
      connections: result.rows.map(c => ({
        providerId: c.provider_id,
        displayName: c.display_name,
        iconUrl: c.icon_url,
        email: c.provider_email,
        name: c.provider_name,
        isPrimary: c.is_primary,
        lastUsedAt: c.last_used_at,
        connectedAt: c.created_at
      }))
    });

  } catch (error) {
    console.error('[OAuth] Get connections error:', error);
    res.status(500).json({ error: 'Failed to get OAuth connections' });
  }
});

/**
 * POST /api/auth/oauth/:providerId/refresh
 * Refresh OAuth access token
 */
router.post('/:providerId/refresh', requireAuth, async (req, res) => {
  try {
    const { providerId } = req.params;

    const tokens = await oauth.refreshAccessToken(req.user.userId, providerId);

    res.json({
      success: true,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn
    });

  } catch (error) {
    console.error(`[OAuth] Refresh token error for ${req.params.providerId}:`, error);
    res.status(500).json({
      error: 'Failed to refresh token',
      message: error.message
    });
  }
});

module.exports = { router, initRoutes };
