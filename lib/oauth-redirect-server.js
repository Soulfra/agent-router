/**
 * OAuth Redirect Server
 *
 * Handles OAuth 2.0 authorization flows for platforms that require proper tokens:
 * - Google (OAuth 2.0 for APIs)
 * - GitHub (OAuth Apps & Personal Access Tokens)
 * - Twitter (OAuth 2.0)
 * - Slack (OAuth 2.0)
 * - Discord (OAuth 2.0)
 * - GoDaddy (API Keys via OAuth)
 *
 * How it works:
 * 1. Start local server on http://localhost:3000
 * 2. User clicks "Login with [Platform]"
 * 3. Redirects to platform's OAuth page
 * 4. User authorizes
 * 5. Platform redirects back to http://localhost:3000/oauth/callback
 * 6. Server captures token and saves to .env
 *
 * Usage:
 *   const server = new OAuthRedirectServer();
 *   await server.start();
 *   await server.authorize('google');
 *   // Opens browser, waits for OAuth, saves token to .env
 */

const http = require('http');
const url = require('url');
const { AuthorizationCode } = require('simple-oauth2');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class OAuthRedirectServer {
  constructor(options = {}) {
    this.config = {
      port: options.port || 3000,
      hostname: options.hostname || 'localhost',
      envPath: options.envPath || path.join(__dirname, '../.env'),
      callbackPath: options.callbackPath || '/oauth/callback',
      verbose: options.verbose || false
    };

    this.server = null;
    this.isRunning = false;
    this.pendingAuth = null; // Stores { platform, resolve, reject }

    // OAuth configurations for each platform
    this.oauthConfigs = {
      google: {
        name: 'Google',
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth',
        tokenHost: 'https://oauth2.googleapis.com',
        tokenPath: '/token',
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        getClient: () => ({
          id: process.env.GOOGLE_CLIENT_ID,
          secret: process.env.GOOGLE_CLIENT_SECRET
        })
      },
      github: {
        name: 'GitHub',
        authorizeHost: 'https://github.com',
        authorizePath: '/login/oauth/authorize',
        tokenHost: 'https://github.com',
        tokenPath: '/login/oauth/access_token',
        scopes: ['repo', 'user', 'gist'],
        getClient: () => ({
          id: process.env.GITHUB_CLIENT_ID,
          secret: process.env.GITHUB_CLIENT_SECRET
        })
      },
      twitter: {
        name: 'Twitter',
        authorizeHost: 'https://twitter.com',
        authorizePath: '/i/oauth2/authorize',
        tokenHost: 'https://api.twitter.com',
        tokenPath: '/2/oauth2/token',
        scopes: ['tweet.read', 'users.read'],
        getClient: () => ({
          id: process.env.TWITTER_CLIENT_ID,
          secret: process.env.TWITTER_CLIENT_SECRET
        })
      },
      slack: {
        name: 'Slack',
        authorizeHost: 'https://slack.com',
        authorizePath: '/oauth/v2/authorize',
        tokenHost: 'https://slack.com',
        tokenPath: '/api/oauth.v2.access',
        scopes: ['chat:write', 'channels:read'],
        getClient: () => ({
          id: process.env.SLACK_CLIENT_ID,
          secret: process.env.SLACK_CLIENT_SECRET
        })
      },
      discord: {
        name: 'Discord',
        authorizeHost: 'https://discord.com',
        authorizePath: '/api/oauth2/authorize',
        tokenHost: 'https://discord.com',
        tokenPath: '/api/oauth2/token',
        scopes: ['identify', 'webhook.incoming'],
        getClient: () => ({
          id: process.env.DISCORD_CLIENT_ID,
          secret: process.env.DISCORD_CLIENT_SECRET
        })
      }
    };

    console.log('[OAuthRedirectServer] Initialized');
  }

  /**
   * Start the OAuth redirect server
   */
  async start() {
    if (this.isRunning) {
      console.log('[OAuthRedirectServer] Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.hostname, () => {
        this.isRunning = true;
        console.log(`[OAuthRedirectServer] Server started on http://${this.config.hostname}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('[OAuthRedirectServer] Server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === this.config.callbackPath) {
      await this.handleOAuthCallback(parsedUrl.query, res);
    } else if (parsedUrl.pathname === '/') {
      this.sendHomePage(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(query, res) {
    if (!this.pendingAuth) {
      res.writeHead(400);
      res.end('No pending authorization');
      return;
    }

    const { code, error, error_description } = query;

    if (error) {
      this.pendingAuth.reject(new Error(error_description || error));
      this.pendingAuth = null;

      res.writeHead(400);
      res.end(`<h1>Authorization failed</h1><p>${error_description || error}</p>`);
      return;
    }

    if (!code) {
      this.pendingAuth.reject(new Error('No authorization code received'));
      this.pendingAuth = null;

      res.writeHead(400);
      res.end('<h1>Authorization failed</h1><p>No code received</p>');
      return;
    }

    try {
      // Exchange code for token
      const platform = this.pendingAuth.platform;
      const token = await this.exchangeCodeForToken(platform, code);

      // Save to .env
      await this.saveTokenToEnv(platform, token);

      // Resolve promise
      this.pendingAuth.resolve(token);
      this.pendingAuth = null;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Authorization Complete</title></head>
          <body>
            <h1>✅ Authorization Complete!</h1>
            <p>Token saved for <strong>${platform}</strong></p>
            <p>You can close this window now.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
      `);

    } catch (error) {
      this.pendingAuth.reject(error);
      this.pendingAuth = null;

      res.writeHead(500);
      res.end(`<h1>Token exchange failed</h1><p>${error.message}</p>`);
    }
  }

  /**
   * Send home page with OAuth links
   */
  sendHomePage(res) {
    const platforms = Object.keys(this.oauthConfigs);

    const html = `
      <html>
        <head>
          <title>CALOS OAuth Setup</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #0a0a0a;
              color: #fff;
            }
            h1 { color: #3498db; }
            .button {
              display: block;
              padding: 15px;
              margin: 10px 0;
              background: #3498db;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              text-align: center;
              font-weight: bold;
            }
            .button:hover { background: #2980b9; }
          </style>
        </head>
        <body>
          <h1>🔐 CALOS OAuth Setup</h1>
          <p>Click a platform below to authorize:</p>
          ${platforms.map(p => `
            <a href="/authorize/${p}" class="button">
              Login with ${this.oauthConfigs[p].name}
            </a>
          `).join('')}
        </body>
      </html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Authorize with a platform (initiates OAuth flow)
   */
  async authorize(platform) {
    const config = this.oauthConfigs[platform];

    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const client = config.getClient();

    if (!client.id || !client.secret) {
      throw new Error(`Missing OAuth credentials for ${platform}. Set ${platform.toUpperCase()}_CLIENT_ID and ${platform.toUpperCase()}_CLIENT_SECRET in .env`);
    }

    // Create OAuth client
    const oauth = new AuthorizationCode({
      client: {
        id: client.id,
        secret: client.secret
      },
      auth: {
        tokenHost: config.tokenHost,
        tokenPath: config.tokenPath,
        authorizePath: config.authorizePath,
        authorizeHost: config.authorizeHost
      }
    });

    // Generate authorization URL
    const redirectUri = `http://${this.config.hostname}:${this.config.port}${this.config.callbackPath}`;

    const authorizationUri = oauth.authorizeURL({
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      state: Buffer.from(JSON.stringify({ platform, timestamp: Date.now() })).toString('base64')
    });

    console.log(`[OAuthRedirectServer] Opening authorization URL for ${platform}...`);

    // Open browser
    await this.openBrowser(authorizationUri);

    // Wait for callback
    return new Promise((resolve, reject) => {
      this.pendingAuth = { platform, resolve, reject };

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingAuth) {
          this.pendingAuth.reject(new Error('Authorization timeout'));
          this.pendingAuth = null;
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(platform, code) {
    const config = this.oauthConfigs[platform];
    const client = config.getClient();

    const oauth = new AuthorizationCode({
      client: {
        id: client.id,
        secret: client.secret
      },
      auth: {
        tokenHost: config.tokenHost,
        tokenPath: config.tokenPath,
        authorizePath: config.authorizePath,
        authorizeHost: config.authorizeHost
      }
    });

    const redirectUri = `http://${this.config.hostname}:${this.config.port}${this.config.callbackPath}`;

    const tokenParams = {
      code,
      redirect_uri: redirectUri
    };

    const accessToken = await oauth.getToken(tokenParams);

    return accessToken.token;
  }

  /**
   * Save token to .env file
   */
  async saveTokenToEnv(platform, token) {
    let envContent = '';

    try {
      envContent = await fs.readFile(this.config.envPath, 'utf8');
    } catch {
      envContent = '# OAuth tokens\n\n';
    }

    const key = `${platform.toUpperCase()}_ACCESS_TOKEN`;
    const value = token.access_token;
    const refreshKey = `${platform.toUpperCase()}_REFRESH_TOKEN`;
    const refreshValue = token.refresh_token;

    const regex = new RegExp(`^${key}=.*$`, 'm');

    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}="${value}"`);
    } else {
      envContent += `\n# ${platform} OAuth token\n${key}="${value}"\n`;
    }

    if (refreshValue) {
      const refreshRegex = new RegExp(`^${refreshKey}=.*$`, 'm');

      if (refreshRegex.test(envContent)) {
        envContent = envContent.replace(refreshRegex, `${refreshKey}="${refreshValue}"`);
      } else {
        envContent += `${refreshKey}="${refreshValue}"\n`;
      }
    }

    await fs.writeFile(this.config.envPath, envContent);

    console.log(`[OAuthRedirectServer] Saved ${platform} token to .env`);
  }

  /**
   * Open browser to URL
   */
  async openBrowser(url) {
    const command = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' :
                    'xdg-open';

    return new Promise((resolve, reject) => {
      exec(`${command} "${url}"`, (error) => {
        if (error) {
          console.error('[OAuthRedirectServer] Failed to open browser:', error.message);
          console.log(`[OAuthRedirectServer] Please open manually: ${url}`);
        }
        resolve();
      });
    });
  }
}

module.exports = OAuthRedirectServer;
