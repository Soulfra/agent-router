/**
 * OAuth2 Provider Routes
 *
 * CalOS as OAuth Provider - "Sign in with CalOS"
 *
 * OAuth 2.0 / OpenID Connect provider that lets OTHER apps use CalOS for auth
 *
 * Flow:
 * 1. App redirects to /oauth/authorize with client_id
 * 2. User logs into CalOS (if not already)
 * 3. User sees "Chess App wants to access your profile" consent screen
 * 4. User approves → app gets authorization code
 * 5. App exchanges code for access_token
 * 6. App uses token to call /oauth/userinfo
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/sso-auth');

// Database connection
let db = null;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const OAUTH_ISSUER = process.env.OAUTH_ISSUER || 'https://calos.dev';

/**
 * Initialize routes
 */
function initRoutes(database) {
  db = database;
  return router;
}

/**
 * GET /oauth/provider/authorize
 * Authorization endpoint - shows consent screen
 */
router.get('/authorize', requireAuth, async (req, res) => {
  const {
    client_id,
    redirect_uri,
    response_type = 'code',
    scope = 'openid profile',
    state,
    code_challenge,
    code_challenge_method = 'S256'
  } = req.query;

  if (!client_id || !redirect_uri) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'client_id and redirect_uri required'
    });
  }

  // Get app details
  const app = await db.query(`
    SELECT * FROM oauth_apps WHERE client_id = $1 AND enabled = TRUE
  `, [client_id]);

  if (app.rows.length === 0) {
    return res.status(400).json({
      error: 'invalid_client',
      error_description: 'Unknown client_id'
    });
  }

  const appData = app.rows[0];

  // Validate redirect_uri
  const allowedUris = appData.redirect_uris || [];
  if (!allowedUris.includes(redirect_uri)) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'redirect_uri not registered'
    });
  }

  const requestedScopes = scope.split(' ');

  // Show consent screen
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authorize ${appData.app_name}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          max-width: 500px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .consent-box {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h2 { margin-top: 0; color: #333; }
        .app-info {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
        }
        .scopes {
          list-style: none;
          padding: 0;
        }
        .scopes li {
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .scopes li:before {
          content: "✓ ";
          color: #4CAF50;
          font-weight: bold;
        }
        .buttons {
          margin-top: 20px;
          display: flex;
          gap: 10px;
        }
        button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
        }
        .approve {
          background: #4CAF50;
          color: white;
        }
        .approve:hover {
          background: #45a049;
        }
        .deny {
          background: #ddd;
          color: #333;
        }
        .deny:hover {
          background: #ccc;
        }
      </style>
    </head>
    <body>
      <div class="consent-box">
        <h2>Authorize ${appData.app_name}</h2>
        <div class="app-info">
          <strong>${appData.app_name}</strong> would like to:
          <ul class="scopes">
            ${requestedScopes.map(s => `<li>${getScopeDescription(s)}</li>`).join('')}
          </ul>
        </div>
        <p>You're signing in as <strong>${req.user.username}</strong></p>
        <div class="buttons">
          <form method="POST" action="/oauth/provider/approve" style="flex: 1">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="scope" value="${scope}">
            <input type="hidden" name="state" value="${state || ''}">
            <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
            <button type="submit" class="approve">Authorize</button>
          </form>
          <form method="POST" action="/oauth/provider/deny" style="flex: 1">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state || ''}">
            <button type="submit" class="deny">Deny</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

/**
 * POST /oauth/provider/approve
 * User approves consent
 */
router.post('/approve', requireAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method
  } = req.body;

  const app = await db.query(`
    SELECT * FROM oauth_apps WHERE client_id = $1
  `, [client_id]);

  if (app.rows.length === 0) {
    return res.status(400).send('Invalid client');
  }

  const appData = app.rows[0];
  const scopes = scope.split(' ');

  // Save user grant
  await db.query(`
    INSERT INTO oauth_user_grants (user_id, app_id, scopes, granted_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id, app_id) DO UPDATE
    SET scopes = $3, granted_at = NOW()
  `, [req.user.userId, appData.app_id, scopes]);

  // Generate authorization code
  const code = crypto.randomBytes(32).toString('hex');

  await db.query(`
    INSERT INTO oauth_authorization_codes (
      code,
      user_id,
      app_id,
      client_id,
      redirect_uri,
      scopes,
      code_challenge,
      code_challenge_method,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '10 minutes')
  `, [code, req.user.userId, appData.app_id, client_id, redirect_uri, scopes, code_challenge, code_challenge_method]);

  // Redirect back to app
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  res.redirect(redirectUrl.toString());
});

/**
 * POST /oauth/provider/deny
 * User denies consent
 */
router.post('/deny', express.urlencoded({ extended: true }), (req, res) => {
  const { redirect_uri, state } = req.body;

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('error', 'access_denied');
  if (state) redirectUrl.searchParams.set('state', state);

  res.redirect(redirectUrl.toString());
});

/**
 * POST /oauth/provider/token
 * Exchange authorization code for access token
 */
router.post('/token', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    client_secret,
    code_verifier
  } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({
      error: 'unsupported_grant_type'
    });
  }

  // Validate client
  const app = await db.query(`
    SELECT * FROM oauth_apps
    WHERE client_id = $1 AND client_secret = $2 AND enabled = TRUE
  `, [client_id, client_secret]);

  if (app.rows.length === 0) {
    return res.status(401).json({
      error: 'invalid_client'
    });
  }

  // Get authorization code
  const authCode = await db.query(`
    SELECT * FROM oauth_authorization_codes
    WHERE code = $1 AND client_id = $2 AND redirect_uri = $3 AND used = FALSE
    AND expires_at > NOW()
  `, [code, client_id, redirect_uri]);

  if (authCode.rows.length === 0) {
    return res.status(400).json({
      error: 'invalid_grant'
    });
  }

  const authCodeData = authCode.rows[0];

  // Verify PKCE if code_challenge was used
  if (authCodeData.code_challenge && code_verifier) {
    const computedChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (computedChallenge !== authCodeData.code_challenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid code_verifier'
      });
    }
  }

  // Mark code as used
  await db.query(`
    UPDATE oauth_authorization_codes SET used = TRUE WHERE code = $1
  `, [code]);

  // Generate access token (JWT)
  const accessToken = jwt.sign(
    {
      iss: OAUTH_ISSUER,
      sub: authCodeData.user_id,
      aud: client_id,
      scope: authCodeData.scopes.join(' '),
      exp: Math.floor(Date.now() / 1000) + (3600 * 24) // 24 hours
    },
    JWT_SECRET
  );

  // Generate refresh token
  const refreshToken = crypto.randomBytes(32).toString('hex');

  // Store token
  await db.query(`
    INSERT INTO oauth_tokens (
      user_id,
      app_id,
      access_token,
      refresh_token,
      scopes,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
  `, [
    authCodeData.user_id,
    authCodeData.app_id,
    accessToken,
    refreshToken,
    authCodeData.scopes
  ]);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400,
    refresh_token: refreshToken,
    scope: authCodeData.scopes.join(' ')
  });
});

/**
 * GET /oauth/provider/userinfo
 * Get user profile (OpenID Connect)
 */
router.get('/userinfo', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user
    const user = await db.query(`
      SELECT user_id, username, email, created_at
      FROM users
      WHERE user_id = $1
    `, [decoded.sub]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const userData = user.rows[0];
    const scopes = decoded.scope.split(' ');

    // Get skills if requested
    let skills = null;
    if (scopes.includes('skills')) {
      const skillsResult = await db.query(`
        SELECT * FROM user_skill_summary WHERE user_id = $1
      `, [decoded.sub]);
      skills = skillsResult.rows;
    }

    res.json({
      sub: userData.user_id,
      username: userData.username,
      email: scopes.includes('email') ? userData.email : undefined,
      skills: skills,
      updated_at: Math.floor(new Date(userData.created_at).getTime() / 1000)
    });
  } catch (error) {
    return res.status(401).json({ error: 'invalid_token' });
  }
});

/**
 * GET /.well-known/openid-configuration
 * OpenID Connect discovery
 */
router.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${OAUTH_ISSUER}/oauth/provider/authorize`,
    token_endpoint: `${OAUTH_ISSUER}/oauth/provider/token`,
    userinfo_endpoint: `${OAUTH_ISSUER}/oauth/provider/userinfo`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    scopes_supported: ['openid', 'profile', 'email', 'skills'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256']
  });
});

function getScopeDescription(scope) {
  const descriptions = {
    'openid': 'Basic profile information',
    'profile': 'Your username and profile',
    'email': 'Your email address',
    'skills': 'Read your skills and XP',
    'skills:write': 'Award XP to your account'
  };
  return descriptions[scope] || scope;
}

module.exports = { router, initRoutes };
