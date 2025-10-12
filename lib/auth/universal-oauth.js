/**
 * Universal OAuth Adapter
 *
 * Supports ANY OAuth 2.0 provider including legacy email providers
 * (Yahoo, AOL, Hotmail, MSN, Gmail, GitHub, Microsoft, etc.)
 */

const crypto = require('crypto');
const axios = require('axios');
const { URL, URLSearchParams } = require('url');

class UniversalOAuth {
  constructor(db, options = {}) {
    this.db = db;
    this.baseRedirectUri = options.baseRedirectUri || 'http://localhost:5001/api/auth/oauth/callback';
    this.usePKCE = options.usePKCE !== false; // Enable PKCE by default for security
  }

  /**
   * Get all enabled OAuth providers
   */
  async getEnabledProviders() {
    const result = await this.db.query(`
      SELECT
        provider_id,
        display_name,
        provider_type,
        icon_url,
        legacy_provider,
        email_domains
      FROM oauth_providers
      WHERE is_enabled = true
      ORDER BY legacy_provider ASC, display_name ASC
    `);

    return result.rows;
  }

  /**
   * Get provider configuration
   */
  async getProvider(providerId) {
    const result = await this.db.query(
      'SELECT * FROM oauth_providers WHERE provider_id = $1 AND is_enabled = true',
      [providerId]
    );

    if (result.rows.length === 0) {
      throw new Error(`OAuth provider not found or disabled: ${providerId}`);
    }

    return result.rows[0];
  }

  /**
   * Detect OAuth provider from email address
   */
  async detectProviderFromEmail(email) {
    const result = await this.db.query(
      'SELECT detect_oauth_provider_from_email($1) as provider_id',
      [email]
    );

    return result.rows[0]?.provider_id || null;
  }

  /**
   * Generate authorization URL
   *
   * @param {string} providerId - OAuth provider ID
   * @param {object} options - Additional options
   * @returns {object} - { authUrl, state, codeVerifier }
   */
  async generateAuthorizationUrl(providerId, options = {}) {
    const provider = await this.getProvider(providerId);

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Generate code verifier and challenge for PKCE
    let codeVerifier = null;
    let codeChallenge = null;

    if (this.usePKCE) {
      codeVerifier = this._generateCodeVerifier();
      codeChallenge = this._generateCodeChallenge(codeVerifier);
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: provider.client_id,
      response_type: provider.response_type,
      redirect_uri: options.redirectUri || this.baseRedirectUri,
      scope: (options.scopes || provider.scopes).join(' '),
      state: state
    });

    if (this.usePKCE) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    // Add provider-specific parameters
    if (provider.provider_id === 'microsoft') {
      params.append('response_mode', 'query');
      params.append('prompt', 'select_account');
    } else if (provider.provider_id === 'google') {
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
    }

    const authUrl = `${provider.auth_url}?${params.toString()}`;

    // Store authorization attempt in database
    await this.db.query(`
      INSERT INTO oauth_authorization_attempts (
        provider_id,
        state,
        redirect_uri,
        scopes,
        user_id,
        code_verifier
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      providerId,
      state,
      options.redirectUri || this.baseRedirectUri,
      options.scopes || provider.scopes,
      options.userId || null,
      codeVerifier
    ]);

    return {
      authUrl,
      state,
      codeVerifier // Return for client-side PKCE if needed
    };
  }

  /**
   * Handle OAuth callback
   *
   * @param {string} providerId - OAuth provider ID
   * @param {string} code - Authorization code
   * @param {string} state - State parameter for CSRF validation
   * @returns {object} - User info and tokens
   */
  async handleCallback(providerId, code, state) {
    const provider = await this.getProvider(providerId);

    // Validate state and get authorization attempt
    const attemptResult = await this.db.query(`
      SELECT *
      FROM oauth_authorization_attempts
      WHERE provider_id = $1
        AND state = $2
        AND status = 'pending'
        AND expires_at > NOW()
    `, [providerId, state]);

    if (attemptResult.rows.length === 0) {
      throw new Error('Invalid or expired OAuth state');
    }

    const attempt = attemptResult.rows[0];

    try {
      // Exchange code for tokens
      const tokenResponse = await this._exchangeCodeForTokens(
        provider,
        code,
        attempt.redirect_uri,
        attempt.code_verifier
      );

      // Get user info from provider
      const userInfo = await this._getUserInfo(provider, tokenResponse.access_token);

      // Extract email, name, and ID from user info
      const email = this._extractField(userInfo, provider.email_field);
      const name = this._extractField(userInfo, provider.name_field);
      const providerUserId = this._extractField(userInfo, provider.id_field);

      if (!email || !providerUserId) {
        throw new Error('Failed to extract required user info from OAuth provider');
      }

      // Get or create user
      const userId = await this._getOrCreateUser(
        providerId,
        providerUserId,
        email,
        name,
        userInfo.picture || userInfo.avatar_url || null,
        userInfo,
        tokenResponse
      );

      // Mark authorization attempt as completed
      await this.db.query(`
        UPDATE oauth_authorization_attempts
        SET
          status = 'completed',
          completed_at = NOW(),
          user_id = $1
        WHERE id = $2
      `, [userId, attempt.id]);

      return {
        userId,
        email,
        name,
        providerId,
        providerUserId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || null,
        expiresIn: tokenResponse.expires_in || null
      };

    } catch (error) {
      // Mark authorization attempt as failed
      await this.db.query(`
        UPDATE oauth_authorization_attempts
        SET
          status = 'failed',
          error_message = $1,
          completed_at = NOW()
        WHERE id = $2
      `, [error.message, attempt.id]);

      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(userId, providerId) {
    const provider = await this.getProvider(providerId);

    // Get OAuth connection
    const connectionResult = await this.db.query(`
      SELECT *
      FROM user_oauth_connections
      WHERE user_id = $1 AND provider_id = $2
    `, [userId, providerId]);

    if (connectionResult.rows.length === 0) {
      throw new Error('OAuth connection not found');
    }

    const connection = connectionResult.rows[0];

    if (!connection.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        client_id: provider.client_id
      });

      if (provider.client_secret) {
        params.append('client_secret', provider.client_secret);
      }

      const response = await axios.post(provider.token_url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const tokenData = response.data;

      // Update tokens in database
      await this.db.query(`
        UPDATE user_oauth_connections
        SET
          access_token = $1,
          refresh_token = COALESCE($2, refresh_token),
          token_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
          updated_at = NOW()
        WHERE id = $4
      `, [
        tokenData.access_token,
        tokenData.refresh_token || null,
        tokenData.expires_in || 3600,
        connection.id
      ]);

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || connection.refresh_token,
        expiresIn: tokenData.expires_in
      };

    } catch (error) {
      console.error('[OAuth] Token refresh failed:', error.message);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Revoke OAuth connection
   */
  async revokeConnection(userId, providerId) {
    const provider = await this.getProvider(providerId);

    // Get connection
    const connectionResult = await this.db.query(
      'SELECT * FROM user_oauth_connections WHERE user_id = $1 AND provider_id = $2',
      [userId, providerId]
    );

    if (connectionResult.rows.length === 0) {
      throw new Error('OAuth connection not found');
    }

    const connection = connectionResult.rows[0];

    // Revoke token at provider if revoke URL exists
    if (provider.revoke_url && connection.access_token) {
      try {
        await axios.post(provider.revoke_url, {
          token: connection.access_token,
          client_id: provider.client_id,
          client_secret: provider.client_secret
        });
      } catch (error) {
        console.error('[OAuth] Token revocation failed:', error.message);
      }
    }

    // Delete connection from database
    await this.db.query(
      'DELETE FROM user_oauth_connections WHERE id = $1',
      [connection.id]
    );

    return true;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Exchange authorization code for access token
   */
  async _exchangeCodeForTokens(provider, code, redirectUri, codeVerifier) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: provider.client_id
    });

    if (provider.client_secret) {
      params.append('client_secret', provider.client_secret);
    }

    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }

    try {
      const response = await axios.post(provider.token_url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      return response.data;

    } catch (error) {
      console.error('[OAuth] Token exchange failed:', error.response?.data || error.message);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Get user info from OAuth provider
   */
  async _getUserInfo(provider, accessToken) {
    if (!provider.userinfo_url) {
      throw new Error('Provider does not support userinfo endpoint');
    }

    try {
      const response = await axios.get(provider.userinfo_url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      return response.data;

    } catch (error) {
      console.error('[OAuth] Failed to get user info:', error.message);
      throw new Error('Failed to retrieve user information');
    }
  }

  /**
   * Extract field from nested JSON using dot notation
   * e.g., 'profile.email' or just 'email'
   */
  _extractField(data, fieldPath) {
    if (!fieldPath) return null;

    const parts = fieldPath.split('.');
    let value = data;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * Get or create user from OAuth profile
   */
  async _getOrCreateUser(providerId, providerUserId, email, name, avatar, rawProfile, tokens) {
    const result = await this.db.query(
      'SELECT get_or_create_oauth_user($1, $2, $3, $4, $5, $6) as user_id',
      [
        providerId,
        providerUserId,
        email,
        name,
        avatar,
        JSON.stringify(rawProfile)
      ]
    );

    const userId = result.rows[0].user_id;

    // Update tokens
    await this.db.query(`
      UPDATE user_oauth_connections
      SET
        access_token = $1,
        refresh_token = $2,
        token_type = $3,
        token_expires_at = NOW() + ($4 || ' seconds')::INTERVAL,
        scopes = $5,
        updated_at = NOW()
      WHERE user_id = $6 AND provider_id = $7
    `, [
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.token_type || 'Bearer',
      tokens.expires_in || 3600,
      tokens.scope ? tokens.scope.split(' ') : [],
      userId,
      providerId
    ]);

    return userId;
  }

  /**
   * Generate PKCE code verifier (43-128 characters)
   */
  _generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  _generateCodeChallenge(verifier) {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }
}

module.exports = UniversalOAuth;
