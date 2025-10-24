#!/usr/bin/env node
/**
 * OAuth Browser Automation Setup
 *
 * Uses Puppeteer to automate OAuth application creation with visual guidance:
 * - Opens provider consoles in Chrome
 * - Highlights form fields with bounding boxes
 * - Auto-fills redirect URIs and app names
 * - Takes screenshots at each step
 * - Extracts credentials automatically
 * - Like macOS Preview's highlight feature + Chrome autofill
 *
 * Usage:
 *   node lib/oauth-browser-setup.js [provider]
 *   provider: google | microsoft | github | all
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class OAuthBrowserSetup {
  constructor(options = {}) {
    this.headless = options.headless || false; // Show browser for user interaction
    this.slowMo = options.slowMo || 50; // Slow down for visibility
    this.screenshotDir = path.join(__dirname, '..', 'oauth-screenshots');
    this.credentials = {};

    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    // Configuration
    this.appName = options.appName || 'Soulfra Platform';
    this.redirectUrl = options.redirectUrl || 'http://localhost:5001/api/auth/oauth/callback';
    this.homepageUrl = options.homepageUrl || 'http://localhost:5001';

    // Colors for console
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m'
    };
  }

  /**
   * Inject visual highlight overlay
   */
  async injectHighlightOverlay(page) {
    await page.evaluate(() => {
      // Create overlay container
      const overlay = document.createElement('div');
      overlay.id = 'soulfra-oauth-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      `;
      document.body.appendChild(overlay);

      // Add highlight function to window
      window.soulfraHighlight = (selector, message, color = '#00ff00') => {
        const element = document.querySelector(selector);
        if (!element) return false;

        const rect = element.getBoundingClientRect();

        // Create highlight box
        const box = document.createElement('div');
        box.className = 'soulfra-highlight';
        box.style.cssText = `
          position: absolute;
          top: ${rect.top + window.scrollY}px;
          left: ${rect.left + window.scrollX}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          border: 3px solid ${color};
          box-shadow: 0 0 20px ${color}, inset 0 0 20px ${color};
          animation: pulse 1.5s infinite;
          pointer-events: none;
          box-sizing: border-box;
        `;

        // Create message label
        const label = document.createElement('div');
        label.style.cssText = `
          position: absolute;
          top: ${rect.top + window.scrollY - 35}px;
          left: ${rect.left + window.scrollX}px;
          background: ${color};
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          white-space: nowrap;
          pointer-events: none;
        `;
        label.textContent = message;

        overlay.appendChild(box);
        overlay.appendChild(label);

        return true;
      };

      // Add pulse animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    });
  }

  /**
   * Highlight element with message
   */
  async highlight(page, selector, message, color = '#00ff00') {
    try {
      const success = await page.evaluate((sel, msg, col) => {
        return window.soulfraHighlight(sel, msg, col);
      }, selector, message, color);

      if (success) {
        console.log(this.colors.green + '  ✓' + this.colors.reset + ` Highlighted: ${message}`);
      } else {
        console.log(this.colors.yellow + '  ⚠' + this.colors.reset + ` Could not find: ${selector}`);
      }

      return success;
    } catch (error) {
      console.log(this.colors.yellow + '  ⚠' + this.colors.reset + ` Highlight error: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all highlights
   */
  async clearHighlights(page) {
    await page.evaluate(() => {
      const overlay = document.getElementById('soulfra-oauth-overlay');
      if (overlay) {
        overlay.innerHTML = '';
      }
    });
  }

  /**
   * Wait for user to complete a step
   */
  async waitForUser(message) {
    console.log('');
    console.log(this.colors.yellow + '  ⏸  ' + this.colors.reset + message);
    console.log(this.colors.cyan + '     Press Enter when done...' + this.colors.reset);

    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  /**
   * Take screenshot
   */
  async screenshot(page, name) {
    const filepath = path.join(this.screenshotDir, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(this.colors.blue + '  📸' + this.colors.reset + ` Screenshot saved: ${filepath}`);
  }

  /**
   * Setup GitHub OAuth with automation
   */
  async setupGitHub(browser) {
    console.log(this.colors.blue + '\n[GitHub OAuth Setup]' + this.colors.reset + '\n');

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    try {
      // Navigate to GitHub OAuth apps
      console.log(this.colors.yellow + '  →' + this.colors.reset + ' Opening GitHub Developer Settings...');
      await page.goto('https://github.com/settings/developers', { waitUntil: 'networkidle2' });

      await this.injectHighlightOverlay(page);
      await this.screenshot(page, 'github-01-developers');

      // Check if user is logged in
      const isLoggedIn = await page.evaluate(() => {
        return !window.location.href.includes('/login');
      });

      if (!isLoggedIn) {
        console.log(this.colors.yellow + '  ⚠' + this.colors.reset + ' Not logged in to GitHub');
        await this.waitForUser('Please log in to GitHub in the browser');
        await page.goto('https://github.com/settings/developers', { waitUntil: 'networkidle2' });
        await this.injectHighlightOverlay(page);
      }

      // Highlight "New OAuth App" button
      const newAppSelectors = [
        'a[href="/settings/applications/new"]',
        'a:has-text("New OAuth App")',
        '.btn-primary:has-text("New")'
      ];

      for (const selector of newAppSelectors) {
        if (await this.highlight(page, selector, 'Click here to create OAuth app', '#00ff00')) {
          break;
        }
      }

      await this.waitForUser('Click "New OAuth App" button');
      await this.clearHighlights(page);

      // Wait for form to load
      await page.waitForSelector('input[name="oauth_application[name]"]', { timeout: 10000 });
      await this.screenshot(page, 'github-02-form');

      // Highlight and fill form fields
      await this.highlight(page, 'input[name="oauth_application[name]"]', 'Enter app name', '#00ff00');
      await page.type('input[name="oauth_application[name]"]', this.appName, { delay: 50 });
      await this.clearHighlights(page);

      await this.highlight(page, 'input[name="oauth_application[url]"]', 'Enter homepage URL', '#00ff00');
      await page.type('input[name="oauth_application[url]"]', this.homepageUrl, { delay: 50 });
      await this.clearHighlights(page);

      await this.highlight(page, 'input[name="oauth_application[callback_url]"]', 'Enter callback URL', '#00ff00');
      await page.type('input[name="oauth_application[callback_url]"]', this.redirectUrl, { delay: 50 });
      await this.clearHighlights(page);

      await this.screenshot(page, 'github-03-filled');

      // Highlight submit button
      await this.highlight(page, 'button[type="submit"]', 'Click to register application', '#00ff00');
      await this.waitForUser('Review the form and click "Register application"');

      // Wait for credentials page
      await page.waitForTimeout(2000);
      await this.screenshot(page, 'github-04-credentials');

      // Extract credentials
      const clientId = await page.evaluate(() => {
        const elem = document.querySelector('code:has-text("Client ID"), .client-id code, input[name="client_id"]');
        return elem ? elem.textContent || elem.value : null;
      });

      // Highlight "Generate a new client secret" button
      await this.highlight(page, 'button:has-text("Generate a new client secret")', 'Click to generate secret', '#ff9900');
      await this.waitForUser('Click "Generate a new client secret"');

      await page.waitForTimeout(1000);
      await this.screenshot(page, 'github-05-secret');

      // Extract secret (should be visible briefly)
      const clientSecret = await page.evaluate(() => {
        const elem = document.querySelector('.client-secret code, code[data-secret]');
        return elem ? elem.textContent : null;
      });

      if (clientId && clientSecret) {
        this.credentials.GITHUB_CLIENT_ID = clientId;
        this.credentials.GITHUB_CLIENT_SECRET = clientSecret;
        console.log(this.colors.green + '\n  ✓ GitHub credentials extracted!' + this.colors.reset);
        console.log(`    Client ID: ${clientId.slice(0, 20)}...`);
      } else {
        console.log(this.colors.red + '\n  ✗ Could not extract credentials automatically' + this.colors.reset);
        console.log(this.colors.yellow + '    Please copy them manually' + this.colors.reset);
      }

    } catch (error) {
      console.log(this.colors.red + '  ✗ Error: ' + error.message + this.colors.reset);
    } finally {
      await page.close();
    }
  }

  /**
   * Setup Google OAuth with automation
   */
  async setupGoogle(browser) {
    console.log(this.colors.blue + '\n[Google OAuth Setup]' + this.colors.reset + '\n');

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    try {
      console.log(this.colors.yellow + '  →' + this.colors.reset + ' Opening Google Cloud Console...');
      await page.goto('https://console.cloud.google.com/apis/credentials', { waitUntil: 'networkidle2' });

      await this.injectHighlightOverlay(page);
      await this.screenshot(page, 'google-01-console');

      console.log(this.colors.yellow + '\n  💡 Manual Steps Required:' + this.colors.reset);
      console.log('     1. Select or create a project');
      console.log('     2. Configure OAuth consent screen (if needed)');
      console.log('     3. Click "Create Credentials" → "OAuth client ID"');
      console.log('     4. Select "Web application"');
      console.log(`     5. Add redirect URI: ${this.colors.green}${this.redirectUrl}${this.colors.reset}`);
      console.log('');

      await this.waitForUser('Complete the OAuth client creation');

      console.log(this.colors.cyan + '\n  → Looking for credentials dialog...' + this.colors.reset);
      await page.waitForTimeout(2000);
      await this.screenshot(page, 'google-02-created');

      // Try to find and copy credentials from dialog
      const credentials = await page.evaluate(() => {
        // Look for OAuth client ID in various places
        const clientIdElem = document.querySelector('[data-test-id="client-id"], input[aria-label*="Client ID"]');
        const clientSecretElem = document.querySelector('[data-test-id="client-secret"], input[aria-label*="Client secret"]');

        return {
          clientId: clientIdElem ? clientIdElem.value || clientIdElem.textContent : null,
          clientSecret: clientSecretElem ? clientSecretElem.value || clientSecretElem.textContent : null
        };
      });

      if (credentials.clientId && credentials.clientSecret) {
        this.credentials.GOOGLE_CLIENT_ID = credentials.clientId;
        this.credentials.GOOGLE_CLIENT_SECRET = credentials.clientSecret;
        console.log(this.colors.green + '\n  ✓ Google credentials extracted!' + this.colors.reset);
      } else {
        console.log(this.colors.yellow + '\n  ⚠ Could not extract automatically' + this.colors.reset);
        console.log(this.colors.cyan + '    Please copy the Client ID and Client Secret manually' + this.colors.reset);
      }

    } catch (error) {
      console.log(this.colors.red + '  ✗ Error: ' + error.message + this.colors.reset);
    } finally {
      await page.close();
    }
  }

  /**
   * Setup Microsoft OAuth with automation
   */
  async setupMicrosoft(browser) {
    console.log(this.colors.blue + '\n[Microsoft OAuth Setup]' + this.colors.reset + '\n');

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    try {
      console.log(this.colors.yellow + '  →' + this.colors.reset + ' Opening Azure Portal...');
      await page.goto('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps', { waitUntil: 'networkidle2' });

      await this.injectHighlightOverlay(page);
      await this.screenshot(page, 'microsoft-01-portal');

      console.log(this.colors.yellow + '\n  💡 Manual Steps Required:' + this.colors.reset);
      console.log('     1. Click "New registration"');
      console.log(`     2. Name: ${this.colors.green}${this.appName}${this.colors.reset}`);
      console.log('     3. Supported account types: Any organizational directory + personal accounts');
      console.log(`     4. Redirect URI: Web → ${this.colors.green}${this.redirectUrl}${this.colors.reset}`);
      console.log('     5. Click "Register"');
      console.log('     6. Go to "Certificates & secrets" → "New client secret"');
      console.log('');

      await this.waitForUser('Complete the app registration');

      await page.waitForTimeout(2000);
      await this.screenshot(page, 'microsoft-02-created');

      // Try to extract Application (client) ID from overview page
      const clientId = await page.evaluate(() => {
        const elem = document.querySelector('[data-automation-key="application-id"], input[aria-label*="Application"]');
        return elem ? elem.value || elem.textContent : null;
      });

      if (clientId) {
        this.credentials.MICROSOFT_CLIENT_ID = clientId;
        console.log(this.colors.green + '\n  ✓ Microsoft Client ID extracted!' + this.colors.reset);
        console.log(this.colors.yellow + '    Now copy the Client Secret from "Certificates & secrets"' + this.colors.reset);
      } else {
        console.log(this.colors.yellow + '\n  ⚠ Please copy Client ID and Client Secret manually' + this.colors.reset);
      }

    } catch (error) {
      console.log(this.colors.red + '  ✗ Error: ' + error.message + this.colors.reset);
    } finally {
      await page.close();
    }
  }

  /**
   * Run automated setup
   */
  async run(provider = 'all') {
    console.log(this.colors.cyan + '\n╔════════════════════════════════════════════════════════════════╗' + this.colors.reset);
    console.log(this.colors.cyan + '║' + this.colors.reset + '       🤖 OAuth Browser Automation Setup                       ' + this.colors.cyan + '║' + this.colors.reset);
    console.log(this.colors.cyan + '╚════════════════════════════════════════════════════════════════╝' + this.colors.reset);
    console.log('');
    console.log('This will open browser windows with visual guidance.');
    console.log('Fields will be highlighted and auto-filled where possible.');
    console.log('');

    const browser = await puppeteer.launch({
      headless: this.headless,
      slowMo: this.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      defaultViewport: { width: 1400, height: 900 }
    });

    try {
      if (provider === 'all' || provider === 'github') {
        await this.setupGitHub(browser);
      }

      if (provider === 'all' || provider === 'google') {
        await this.setupGoogle(browser);
      }

      if (provider === 'all' || provider === 'microsoft') {
        await this.setupMicrosoft(browser);
      }

      // Display extracted credentials
      console.log(this.colors.green + '\n╔════════════════════════════════════════════════════════════════╗' + this.colors.reset);
      console.log(this.colors.green + '║' + this.colors.reset + '              Extracted Credentials                            ' + this.colors.green + '║' + this.colors.reset);
      console.log(this.colors.green + '╚════════════════════════════════════════════════════════════════╝' + this.colors.reset);
      console.log('');

      for (const [key, value] of Object.entries(this.credentials)) {
        console.log(`${key}=${value}`);
      }

      console.log('');
      console.log(this.colors.cyan + '📋 Screenshots saved to: ' + this.colors.reset + this.screenshotDir);

    } finally {
      await browser.close();
    }

    return this.credentials;
  }
}

// CLI interface
if (require.main === module) {
  const provider = process.argv[2] || 'all';

  const setup = new OAuthBrowserSetup({
    headless: false,
    slowMo: 50
  });

  setup.run(provider).then((credentials) => {
    console.log('\n✅ Browser automation complete!');
    console.log('\nNext steps:');
    console.log('  1. Copy credentials to .env file');
    console.log('  2. Run: node lib/oauth-provider-setup.js setup');
    console.log('  3. Test OAuth flows');
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Automation failed:', error.message);
    process.exit(1);
  });
}

module.exports = OAuthBrowserSetup;
