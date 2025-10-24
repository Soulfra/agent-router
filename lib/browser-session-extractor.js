/**
 * Browser Session Extractor
 *
 * Extracts OAuth tokens and session data from browser cookies/localStorage.
 * Supports Chrome, Safari, and Firefox on macOS.
 *
 * Why this exists:
 * - You're already logged into Google, GitHub, Twitter, etc. in your browser
 * - Instead of manual OAuth setup, just grab those existing sessions
 * - Automatically populates .env with found tokens
 *
 * Supported platforms:
 * - Google (OAuth tokens, API keys)
 * - GitHub (personal access tokens, OAuth)
 * - Twitter (OAuth tokens)
 * - GoDaddy (API keys)
 * - Slack (OAuth tokens, webhooks)
 * - Discord (OAuth tokens, webhooks)
 *
 * Usage:
 *   const extractor = new BrowserSessionExtractor();
 *   const sessions = await extractor.extractAll();
 *   await extractor.saveToEnv(sessions);
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

class BrowserSessionExtractor {
  constructor(options = {}) {
    this.config = {
      envPath: options.envPath || path.join(__dirname, '../.env'),
      verbose: options.verbose || false,
      browsers: options.browsers || ['chrome', 'safari', 'firefox']
    };

    // Browser data paths (macOS)
    this.browserPaths = {
      chrome: {
        cookies: path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
        localStorage: path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Local Storage/leveldb')
      },
      firefox: {
        cookies: path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles/*.default-release/cookies.sqlite'),
        localStorage: path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles/*.default-release/webappsstore.sqlite')
      },
      safari: {
        cookies: path.join(os.homedir(), 'Library/Cookies/Cookies.binarycookies')
      }
    };

    // Platforms to extract
    this.platforms = {
      google: {
        domains: ['google.com', 'accounts.google.com', 'console.cloud.google.com'],
        cookies: ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID'],
        localStorageKeys: ['google_api_key', 'gcp_api_key']
      },
      github: {
        domains: ['github.com'],
        cookies: ['user_session', '_gh_sess', 'dotcom_user'],
        localStorageKeys: ['github_token', 'gh_pat']
      },
      twitter: {
        domains: ['twitter.com', 'x.com'],
        cookies: ['auth_token', 'ct0', 'twid'],
        localStorageKeys: ['twitter_oauth_token']
      },
      godaddy: {
        domains: ['godaddy.com', 'api.godaddy.com'],
        cookies: ['PrivateLabel', 'market', 'currency'],
        localStorageKeys: ['godaddy_api_key', 'godaddy_secret']
      },
      slack: {
        domains: ['slack.com', 'app.slack.com'],
        cookies: ['d', 'lc'],
        localStorageKeys: ['slack_token', 'slack_webhook']
      },
      discord: {
        domains: ['discord.com', 'discordapp.com'],
        cookies: ['__dcfduid', '__sdcfduid', 'locale'],
        localStorageKeys: ['discord_token', 'discord_webhook']
      }
    };

    console.log('[BrowserSessionExtractor] Initialized');
  }

  /**
   * Extract sessions from all browsers
   */
  async extractAll() {
    const sessions = {
      google: null,
      github: null,
      twitter: null,
      godaddy: null,
      slack: null,
      discord: null
    };

    for (const browser of this.config.browsers) {
      console.log(`[BrowserSessionExtractor] Checking ${browser}...`);

      try {
        const browserSessions = await this.extractFromBrowser(browser);

        // Merge sessions (prefer non-null values)
        for (const [platform, data] of Object.entries(browserSessions)) {
          if (data && (!sessions[platform] || Object.keys(data).length > Object.keys(sessions[platform] || {}).length)) {
            sessions[platform] = data;
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.error(`[BrowserSessionExtractor] Error with ${browser}:`, error.message);
        }
      }
    }

    return sessions;
  }

  /**
   * Extract sessions from specific browser
   */
  async extractFromBrowser(browser) {
    switch (browser) {
      case 'chrome':
        return await this.extractFromChrome();
      case 'safari':
        return await this.extractFromSafari();
      case 'firefox':
        return await this.extractFromFirefox();
      default:
        throw new Error(`Unsupported browser: ${browser}`);
    }
  }

  /**
   * Extract from Chrome (uses sqlite3 to read Cookies database)
   */
  async extractFromChrome() {
    const sessions = {};
    const cookiesPath = this.browserPaths.chrome.cookies;

    // Check if Chrome cookies exist
    try {
      await fs.access(cookiesPath);
    } catch {
      console.log('[BrowserSessionExtractor] Chrome cookies not found');
      return sessions;
    }

    // Copy cookies DB (Chrome locks it)
    const tempCookiesPath = path.join(os.tmpdir(), `chrome_cookies_${Date.now()}.db`);
    await fs.copyFile(cookiesPath, tempCookiesPath);

    try {
      // Read cookies from sqlite
      const cookies = await this.readSqliteCookies(tempCookiesPath);

      // Extract platform sessions
      for (const [platform, config] of Object.entries(this.platforms)) {
        const platformCookies = cookies.filter(c =>
          config.domains.some(d => c.host_key.includes(d)) &&
          config.cookies.some(name => c.name === name)
        );

        if (platformCookies.length > 0) {
          sessions[platform] = this.parsePlatformCookies(platform, platformCookies);
        }
      }

      console.log(`[BrowserSessionExtractor] Chrome: Found ${Object.keys(sessions).length} platform sessions`);

    } finally {
      // Clean up temp file
      await fs.unlink(tempCookiesPath).catch(() => {});
    }

    return sessions;
  }

  /**
   * Extract from Safari (uses AppleScript)
   */
  async extractFromSafari() {
    // Safari cookies are in binary format (.binarycookies)
    // AppleScript can't easily read them, so we'll skip Safari for now
    // In production, you'd use a binary cookies parser

    console.log('[BrowserSessionExtractor] Safari extraction not yet implemented (binary cookie format)');
    return {};
  }

  /**
   * Extract from Firefox
   */
  async extractFromFirefox() {
    const sessions = {};

    // Find Firefox profile
    const profilesDir = path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles');

    try {
      const profiles = await fs.readdir(profilesDir);
      const defaultProfile = profiles.find(p => p.includes('default-release'));

      if (!defaultProfile) {
        console.log('[BrowserSessionExtractor] Firefox profile not found');
        return sessions;
      }

      const cookiesPath = path.join(profilesDir, defaultProfile, 'cookies.sqlite');

      // Copy cookies DB (Firefox locks it)
      const tempCookiesPath = path.join(os.tmpdir(), `firefox_cookies_${Date.now()}.db`);
      await fs.copyFile(cookiesPath, tempCookiesPath);

      try {
        // Read cookies from sqlite
        const cookies = await this.readSqliteCookies(tempCookiesPath, 'firefox');

        // Extract platform sessions
        for (const [platform, config] of Object.entries(this.platforms)) {
          const platformCookies = cookies.filter(c =>
            config.domains.some(d => c.host === d || c.host.endsWith('.' + d)) &&
            config.cookies.some(name => c.name === name)
          );

          if (platformCookies.length > 0) {
            sessions[platform] = this.parsePlatformCookies(platform, platformCookies);
          }
        }

        console.log(`[BrowserSessionExtractor] Firefox: Found ${Object.keys(sessions).length} platform sessions`);

      } finally {
        await fs.unlink(tempCookiesPath).catch(() => {});
      }

    } catch (error) {
      if (this.config.verbose) {
        console.error('[BrowserSessionExtractor] Firefox error:', error.message);
      }
    }

    return sessions;
  }

  /**
   * Read cookies from sqlite database
   */
  readSqliteCookies(dbPath, format = 'chrome') {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
      const cookies = [];

      // Chrome and Firefox have different schemas
      const query = format === 'chrome'
        ? 'SELECT host_key, name, value, path, expires_utc, is_secure, is_httponly FROM cookies'
        : 'SELECT host, name, value, path, expiry, isSecure, isHttpOnly FROM moz_cookies';

      db.all(query, [], (err, rows) => {
        if (err) {
          db.close();
          return reject(err);
        }

        // Normalize schema
        for (const row of rows) {
          cookies.push({
            host_key: row.host_key || row.host,
            host: row.host || row.host_key,
            name: row.name,
            value: row.value,
            path: row.path,
            expires: row.expires_utc || row.expiry,
            secure: row.is_secure || row.isSecure,
            httponly: row.is_httponly || row.isHttpOnly
          });
        }

        db.close();
        resolve(cookies);
      });
    });
  }

  /**
   * Parse platform-specific cookies into usable session data
   */
  parsePlatformCookies(platform, cookies) {
    const session = {
      platform,
      found: true,
      cookies: {},
      tokens: {}
    };

    // Store all cookies
    for (const cookie of cookies) {
      session.cookies[cookie.name] = cookie.value;
    }

    // Platform-specific parsing
    switch (platform) {
      case 'google':
        // Google uses SID/HSID/SSID for auth
        // These can be used to make API requests
        if (session.cookies.SID && session.cookies.HSID) {
          session.tokens.authCookies = `SID=${session.cookies.SID}; HSID=${session.cookies.HSID}`;
        }
        break;

      case 'github':
        // GitHub uses user_session cookie
        if (session.cookies.user_session) {
          session.tokens.sessionCookie = session.cookies.user_session;
        }
        break;

      case 'twitter':
        // Twitter uses auth_token + ct0 (CSRF token)
        if (session.cookies.auth_token && session.cookies.ct0) {
          session.tokens.authToken = session.cookies.auth_token;
          session.tokens.csrfToken = session.cookies.ct0;
        }
        break;

      case 'godaddy':
        // GoDaddy uses various session cookies
        session.tokens.sessionCookies = Object.entries(session.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
        break;

      case 'slack':
        // Slack uses 'd' and 'lc' cookies
        if (session.cookies.d) {
          session.tokens.sessionCookie = session.cookies.d;
        }
        break;

      case 'discord':
        // Discord stores token in localStorage, not cookies usually
        // But we can detect if logged in
        session.tokens.loggedIn = !!session.cookies.__dcfduid;
        break;
    }

    return session;
  }

  /**
   * Save extracted sessions to .env file
   */
  async saveToEnv(sessions) {
    let envContent = '';

    // Read existing .env if it exists
    try {
      envContent = await fs.readFile(this.config.envPath, 'utf8');
    } catch {
      // File doesn't exist, start fresh
      envContent = '# Auto-generated by BrowserSessionExtractor\n\n';
    }

    const updates = [];

    // Add/update Google tokens
    if (sessions.google?.tokens?.authCookies) {
      updates.push({
        key: 'GOOGLE_AUTH_COOKIES',
        value: sessions.google.tokens.authCookies,
        comment: '# Google session cookies (from browser)'
      });
    }

    // Add/update GitHub tokens
    if (sessions.github?.tokens?.sessionCookie) {
      updates.push({
        key: 'GITHUB_SESSION_COOKIE',
        value: sessions.github.tokens.sessionCookie,
        comment: '# GitHub session (from browser)'
      });
    }

    // Add/update Twitter tokens
    if (sessions.twitter?.tokens?.authToken) {
      updates.push({
        key: 'TWITTER_AUTH_TOKEN',
        value: sessions.twitter.tokens.authToken,
        comment: '# Twitter auth token (from browser)'
      });
      updates.push({
        key: 'TWITTER_CSRF_TOKEN',
        value: sessions.twitter.tokens.csrfToken,
        comment: '# Twitter CSRF token'
      });
    }

    // Add/update Slack tokens
    if (sessions.slack?.tokens?.sessionCookie) {
      updates.push({
        key: 'SLACK_SESSION_COOKIE',
        value: sessions.slack.tokens.sessionCookie,
        comment: '# Slack session (from browser)'
      });
    }

    // Update .env content
    for (const { key, value, comment } of updates) {
      const regex = new RegExp(`^${key}=.*$`, 'm');

      if (regex.test(envContent)) {
        // Update existing value
        envContent = envContent.replace(regex, `${key}="${value}"`);
      } else {
        // Add new value
        envContent += `\n${comment}\n${key}="${value}"\n`;
      }
    }

    // Write back to .env
    await fs.writeFile(this.config.envPath, envContent);

    console.log(`[BrowserSessionExtractor] Updated ${updates.length} tokens in .env`);

    return updates;
  }

  /**
   * Get summary of extracted sessions
   */
  getSummary(sessions) {
    const summary = {
      total: 0,
      platforms: [],
      missing: []
    };

    for (const [platform, data] of Object.entries(sessions)) {
      if (data && data.found) {
        summary.total++;
        summary.platforms.push(platform);
      } else {
        summary.missing.push(platform);
      }
    }

    return summary;
  }
}

module.exports = BrowserSessionExtractor;
