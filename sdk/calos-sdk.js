/**
 * CalOS SDK - Sign in with CalOS
 *
 * JavaScript SDK for integrating CalOS OAuth authentication
 * into third-party applications.
 *
 * Usage:
 * ```javascript
 * import CalOSAuth from './calos-sdk.js';
 *
 * const calos = new CalOSAuth({
 *   clientId: 'cal_your_client_id',
 *   redirectUri: 'http://localhost:3000/callback',
 *   scope: 'openid profile email skills'
 * });
 *
 * // Start OAuth flow
 * calos.signIn();
 *
 * // Handle callback
 * calos.handleCallback().then(user => {
 *   console.log('Logged in:', user);
 * });
 * ```
 */

class CalOSAuth {
  /**
   * Initialize CalOS authentication
   *
   * @param {Object} config - Configuration options
   * @param {string} config.clientId - Your CalOS app client ID
   * @param {string} config.redirectUri - OAuth redirect URI (must be registered)
   * @param {string} [config.scope='openid profile'] - Space-separated scopes
   * @param {string} [config.calosUrl='https://calos.dev'] - CalOS base URL
   * @param {boolean} [config.usePKCE=true] - Use PKCE for additional security
   */
  constructor(config) {
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.scope = config.scope || 'openid profile';
    this.calosUrl = config.calosUrl || 'https://calos.dev';
    this.usePKCE = config.usePKCE !== false;

    if (!this.clientId) {
      throw new Error('clientId is required');
    }
    if (!this.redirectUri) {
      throw new Error('redirectUri is required');
    }
  }

  /**
   * Generate random string for state parameter
   */
  _generateRandomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => chars[byte % chars.length]).join('');
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  async _generatePKCE() {
    const codeVerifier = this._generateRandomString(64);

    // Generate code challenge (SHA-256 hash of verifier)
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Start the OAuth sign-in flow
   *
   * Redirects user to CalOS authorization page
   */
  async signIn() {
    const state = this._generateRandomString();

    // Store state for validation
    sessionStorage.setItem('calos_oauth_state', state);

    // Generate PKCE if enabled
    let codeChallenge = null;
    if (this.usePKCE) {
      const pkce = await this._generatePKCE();
      sessionStorage.setItem('calos_code_verifier', pkce.codeVerifier);
      codeChallenge = pkce.codeChallenge;
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scope,
      state: state
    });

    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    const authUrl = `${this.calosUrl}/oauth/provider/authorize?${params.toString()}`;

    // Redirect to CalOS
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback
   *
   * Call this on your redirect URI page to complete the OAuth flow
   *
   * @returns {Promise<Object>} User information and access token
   */
  async handleCallback() {
    const params = new URLSearchParams(window.location.search);

    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    // Check for errors
    if (error) {
      throw new Error(`OAuth error: ${error} - ${params.get('error_description')}`);
    }

    if (!code || !state) {
      throw new Error('Missing OAuth parameters');
    }

    // Validate state
    const savedState = sessionStorage.getItem('calos_oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    // Get code verifier if PKCE was used
    const codeVerifier = sessionStorage.getItem('calos_code_verifier');

    // Clean up session storage
    sessionStorage.removeItem('calos_oauth_state');
    sessionStorage.removeItem('calos_code_verifier');

    // Exchange code for tokens
    const tokenResponse = await this._exchangeCodeForToken(code, codeVerifier);

    // Get user info
    const userInfo = await this._getUserInfo(tokenResponse.access_token);

    // Store tokens
    localStorage.setItem('calos_access_token', tokenResponse.access_token);
    if (tokenResponse.refresh_token) {
      localStorage.setItem('calos_refresh_token', tokenResponse.refresh_token);
    }

    return {
      user: userInfo,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in
    };
  }

  /**
   * Exchange authorization code for access token
   *
   * @private
   */
  async _exchangeCodeForToken(code, codeVerifier) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId
    });

    if (codeVerifier) {
      body.append('code_verifier', codeVerifier);
    }

    const response = await fetch(`${this.calosUrl}/oauth/provider/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.error || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get user information
   *
   * @private
   */
  async _getUserInfo(accessToken) {
    const response = await fetch(`${this.calosUrl}/oauth/provider/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return await response.json();
  }

  /**
   * Get current user
   *
   * Returns user info if logged in, null otherwise
   *
   * @returns {Promise<Object|null>} User information or null
   */
  async getCurrentUser() {
    const accessToken = localStorage.getItem('calos_access_token');

    if (!accessToken) {
      return null;
    }

    try {
      return await this._getUserInfo(accessToken);
    } catch (error) {
      // Token might be expired
      return null;
    }
  }

  /**
   * Sign out
   *
   * Clears stored tokens
   */
  signOut() {
    localStorage.removeItem('calos_access_token');
    localStorage.removeItem('calos_refresh_token');
  }

  /**
   * Get access token
   *
   * @returns {string|null} Access token or null if not logged in
   */
  getAccessToken() {
    return localStorage.getItem('calos_access_token');
  }

  /**
   * Check if user is logged in
   *
   * @returns {boolean} True if logged in
   */
  isLoggedIn() {
    return !!localStorage.getItem('calos_access_token');
  }
}

/**
 * Create "Sign in with CalOS" button
 *
 * @param {CalOSAuth} calosAuth - CalOS authentication instance
 * @param {Object} options - Button options
 * @param {string} [options.text='Sign in with CalOS'] - Button text
 * @param {string} [options.theme='light'] - Button theme (light/dark)
 * @param {string} [options.size='medium'] - Button size (small/medium/large)
 * @returns {HTMLButtonElement} Button element
 */
function createSignInButton(calosAuth, options = {}) {
  const text = options.text || 'Sign in with CalOS';
  const theme = options.theme || 'light';
  const size = options.size || 'medium';

  const button = document.createElement('button');
  button.textContent = text;
  button.className = `calos-signin-btn calos-signin-btn-${theme} calos-signin-btn-${size}`;

  // Add styles
  const styles = `
    .calos-signin-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s, transform 0.1s;
    }
    .calos-signin-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .calos-signin-btn:active {
      transform: translateY(0);
    }
    .calos-signin-btn-small {
      padding: 8px 16px;
      font-size: 14px;
    }
    .calos-signin-btn-medium {
      padding: 12px 24px;
      font-size: 16px;
    }
    .calos-signin-btn-large {
      padding: 16px 32px;
      font-size: 18px;
    }
    .calos-signin-btn-light {
      background: #4CAF50;
      color: white;
    }
    .calos-signin-btn-light:hover {
      background: #45a049;
    }
    .calos-signin-btn-dark {
      background: #333;
      color: white;
    }
    .calos-signin-btn-dark:hover {
      background: #555;
    }
  `;

  // Inject styles if not already present
  if (!document.getElementById('calos-sdk-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'calos-sdk-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Add click handler
  button.addEventListener('click', () => {
    calosAuth.signIn();
  });

  return button;
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CalOSAuth, createSignInButton };
} else if (typeof window !== 'undefined') {
  window.CalOSAuth = CalOSAuth;
  window.createCalOSSignInButton = createSignInButton;
}

export { CalOSAuth, createSignInButton };
