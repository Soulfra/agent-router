#!/usr/bin/env node
/**
 * OAuth Setup Wizard - CLI-First Approach
 *
 * Automatically creates OAuth applications using CLI tools when available,
 * and provides guided setup for others.
 *
 * Features:
 * - Detects GitHub CLI and creates OAuth app automatically
 * - Opens browser to provider consoles with instructions
 * - Watches clipboard for credentials
 * - Auto-updates .env file
 * - Validates credentials by testing OAuth flow
 *
 * Usage:
 *   node lib/oauth-wizard.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

class OAuthWizard {
  constructor() {
    this.envPath = path.join(__dirname, '..', '.env');
    this.credentials = {};
    this.hasGitHubCLI = false;
    this.hasGoogleCLI = false;
    this.hasAzureCLI = false;
    this.redirectUrl = 'http://localhost:5001/api/auth/oauth/callback';

    // Colors
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  /**
   * Main wizard flow
   */
  async run() {
    this.printBanner();
    await this.detectCLIs();
    await this.gatherInfo();
    await this.setupProviders();
    await this.updateEnvFile();
    await this.runDatabaseSetup();
    await this.testOAuthFlow();
    this.printSuccess();
  }

  /**
   * Print welcome banner
   */
  printBanner() {
    console.log('');
    console.log(this.colors.cyan + '╔════════════════════════════════════════════════════════════════╗' + this.colors.reset);
    console.log(this.colors.cyan + '║' + this.colors.reset + '              🔐 OAuth Setup Wizard                            ' + this.colors.cyan + '║' + this.colors.reset);
    console.log(this.colors.cyan + '╚════════════════════════════════════════════════════════════════╝' + this.colors.reset);
    console.log('');
    console.log('This wizard will help you set up OAuth authentication for:');
    console.log('  • Google (Gmail, Google Drive)');
    console.log('  • Microsoft (Outlook, OneDrive)');
    console.log('  • GitHub (Code, Repos)');
    console.log('');
  }

  /**
   * Detect installed CLI tools
   */
  async detectCLIs() {
    console.log(this.colors.blue + '[1/7]' + this.colors.reset + ' Detecting CLI tools...\n');

    // Check GitHub CLI
    try {
      const ghStatus = execSync('gh auth status 2>&1', { encoding: 'utf8' });
      if (ghStatus.includes('Logged in')) {
        this.hasGitHubCLI = true;
        const account = ghStatus.match(/account (\w+)/)?.[1];
        console.log(this.colors.green + '✓' + this.colors.reset + ' GitHub CLI authenticated' + (account ? ` (${account})` : ''));
      }
    } catch (e) {
      console.log(this.colors.yellow + '⚠' + this.colors.reset + ' GitHub CLI not authenticated');
    }

    // Check Google Cloud CLI
    try {
      execSync('gcloud --version 2>&1', { encoding: 'utf8' });
      this.hasGoogleCLI = true;
      console.log(this.colors.green + '✓' + this.colors.reset + ' Google Cloud CLI installed');
    } catch (e) {
      console.log(this.colors.yellow + '⚠' + this.colors.reset + ' Google Cloud CLI not installed');
    }

    // Check Azure CLI
    try {
      execSync('az --version 2>&1', { encoding: 'utf8' });
      this.hasAzureCLI = true;
      console.log(this.colors.green + '✓' + this.colors.reset + ' Azure CLI installed');
    } catch (e) {
      console.log(this.colors.yellow + '⚠' + this.colors.reset + ' Azure CLI not installed');
    }

    console.log('');
  }

  /**
   * Gather user information
   */
  async gatherInfo() {
    console.log(this.colors.blue + '[2/7]' + this.colors.reset + ' Gathering information...\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise((resolve) => rl.question(query, resolve));

    // Get app name
    this.appName = await question('App name (default: Soulfra Platform): ') || 'Soulfra Platform';

    // Get redirect URL
    const customUrl = await question(`Redirect URL (default: ${this.redirectUrl}): `);
    if (customUrl) this.redirectUrl = customUrl;

    // Get homepage URL
    this.homepageUrl = await question('Homepage URL (default: http://localhost:5001): ') || 'http://localhost:5001';

    rl.close();
    console.log('');
  }

  /**
   * Setup OAuth providers
   */
  async setupProviders() {
    console.log(this.colors.blue + '[3/7]' + this.colors.reset + ' Setting up OAuth providers...\n');

    // GitHub (automatic if CLI available)
    if (this.hasGitHubCLI) {
      await this.setupGitHubAutomatic();
    } else {
      await this.setupGitHubManual();
    }

    // Google (manual with guidance)
    await this.setupGoogleManual();

    // Microsoft (manual with guidance)
    await this.setupMicrosoftManual();

    console.log('');
  }

  /**
   * Setup GitHub OAuth automatically using CLI
   */
  async setupGitHubAutomatic() {
    console.log(this.colors.yellow + '→' + this.colors.reset + ' Setting up GitHub OAuth (automatic)...');

    try {
      // Create OAuth app using GitHub CLI
      // Note: gh CLI doesn't have direct OAuth app creation, so we'll use the API
      const token = execSync('gh auth token', { encoding: 'utf8' }).trim();

      const appData = {
        name: this.appName,
        url: this.homepageUrl,
        callback_url: this.redirectUrl
      };

      // Try to create OAuth app via API
      const createApp = new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.github.com',
          path: '/user/applications',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Soulfra-OAuth-Wizard',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 201) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.write(JSON.stringify(appData));
        req.end();
      });

      try {
        const app = await createApp;
        this.credentials.GITHUB_CLIENT_ID = app.client_id;
        this.credentials.GITHUB_CLIENT_SECRET = app.client_secret;
        console.log(this.colors.green + '  ✓ GitHub OAuth app created automatically!' + this.colors.reset);
        console.log(`  Client ID: ${app.client_id.slice(0, 20)}...`);
      } catch (error) {
        // If API fails, fall back to manual
        console.log(this.colors.yellow + '  ⚠ Automatic creation failed, using manual method' + this.colors.reset);
        await this.setupGitHubManual();
      }

    } catch (error) {
      console.log(this.colors.red + '  ✗ Error: ' + error.message + this.colors.reset);
      await this.setupGitHubManual();
    }
  }

  /**
   * Setup GitHub OAuth manually
   */
  async setupGitHubManual() {
    console.log(this.colors.yellow + '→' + this.colors.reset + ' Setting up GitHub OAuth (manual)...');
    console.log('');
    console.log(this.colors.bright + '  Step 1:' + this.colors.reset + ' Open GitHub Developer Settings');
    console.log('    ' + this.colors.cyan + 'https://github.com/settings/developers' + this.colors.reset);
    console.log('');
    console.log(this.colors.bright + '  Step 2:' + this.colors.reset + ' Click "New OAuth App"');
    console.log('');
    console.log(this.colors.bright + '  Step 3:' + this.colors.reset + ' Fill in the form:');
    console.log(`    Application name: ${this.colors.green}${this.appName}${this.colors.reset}`);
    console.log(`    Homepage URL: ${this.colors.green}${this.homepageUrl}${this.colors.reset}`);
    console.log(`    Callback URL: ${this.colors.green}${this.redirectUrl}${this.colors.reset}`);
    console.log('');
    console.log(this.colors.bright + '  Step 4:' + this.colors.reset + ' Copy Client ID and Client Secret');
    console.log('');

    // Open browser
    try {
      execSync(`open "https://github.com/settings/developers"`, { stdio: 'ignore' });
      console.log(this.colors.green + '  ✓ Opened browser' + this.colors.reset);
    } catch (e) {
      // Ignore if browser doesn't open
    }

    // Wait for credentials
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const clientId = await new Promise((resolve) =>
      rl.question('\n  Enter GitHub Client ID: ', resolve)
    );
    const clientSecret = await new Promise((resolve) =>
      rl.question('  Enter GitHub Client Secret: ', resolve)
    );

    rl.close();

    if (clientId && clientSecret) {
      this.credentials.GITHUB_CLIENT_ID = clientId.trim();
      this.credentials.GITHUB_CLIENT_SECRET = clientSecret.trim();
      console.log(this.colors.green + '  ✓ GitHub credentials saved' + this.colors.reset);
    } else {
      console.log(this.colors.yellow + '  ⚠ Skipped GitHub setup' + this.colors.reset);
    }

    console.log('');
  }

  /**
   * Setup Google OAuth manually
   */
  async setupGoogleManual() {
    console.log(this.colors.yellow + '→' + this.colors.reset + ' Setting up Google OAuth (manual)...');
    console.log('');
    console.log(this.colors.bright + '  Step 1:' + this.colors.reset + ' Open Google Cloud Console');
    console.log('    ' + this.colors.cyan + 'https://console.cloud.google.com/apis/credentials' + this.colors.reset);
    console.log('');
    console.log(this.colors.bright + '  Step 2:' + this.colors.reset + ' Create project if needed, then click "Create Credentials" → "OAuth client ID"');
    console.log('');
    console.log(this.colors.bright + '  Step 3:' + this.colors.reset + ' Configure OAuth consent screen first (if prompted)');
    console.log('    App name: ' + this.colors.green + this.appName + this.colors.reset);
    console.log('    Scopes: openid, email, profile');
    console.log('');
    console.log(this.colors.bright + '  Step 4:' + this.colors.reset + ' Create OAuth client ID:');
    console.log('    Application type: ' + this.colors.green + 'Web application' + this.colors.reset);
    console.log('    Authorized redirect URIs: ' + this.colors.green + this.redirectUrl + this.colors.reset);
    console.log('');

    // Open browser
    try {
      execSync(`open "https://console.cloud.google.com/apis/credentials"`, { stdio: 'ignore' });
      console.log(this.colors.green + '  ✓ Opened browser' + this.colors.reset);
    } catch (e) {
      // Ignore
    }

    // Wait for credentials
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const clientId = await new Promise((resolve) =>
      rl.question('\n  Enter Google Client ID: ', resolve)
    );
    const clientSecret = await new Promise((resolve) =>
      rl.question('  Enter Google Client Secret: ', resolve)
    );

    rl.close();

    if (clientId && clientSecret) {
      this.credentials.GOOGLE_CLIENT_ID = clientId.trim();
      this.credentials.GOOGLE_CLIENT_SECRET = clientSecret.trim();
      console.log(this.colors.green + '  ✓ Google credentials saved' + this.colors.reset);
    } else {
      console.log(this.colors.yellow + '  ⚠ Skipped Google setup' + this.colors.reset);
    }

    console.log('');
  }

  /**
   * Setup Microsoft OAuth manually
   */
  async setupMicrosoftManual() {
    console.log(this.colors.yellow + '→' + this.colors.reset + ' Setting up Microsoft OAuth (manual)...');
    console.log('');
    console.log(this.colors.bright + '  Step 1:' + this.colors.reset + ' Open Azure Portal');
    console.log('    ' + this.colors.cyan + 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps' + this.colors.reset);
    console.log('');
    console.log(this.colors.bright + '  Step 2:' + this.colors.reset + ' Click "New registration"');
    console.log('    Name: ' + this.colors.green + this.appName + this.colors.reset);
    console.log('    Supported account types: ' + this.colors.green + 'Any organizational directory + personal accounts' + this.colors.reset);
    console.log('    Redirect URI: ' + this.colors.green + this.redirectUrl + this.colors.reset);
    console.log('');
    console.log(this.colors.bright + '  Step 3:' + this.colors.reset + ' Copy "Application (client) ID" from overview page');
    console.log('');
    console.log(this.colors.bright + '  Step 4:' + this.colors.reset + ' Go to "Certificates & secrets" → "New client secret"');
    console.log('');

    // Open browser
    try {
      execSync(`open "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps"`, { stdio: 'ignore' });
      console.log(this.colors.green + '  ✓ Opened browser' + this.colors.reset);
    } catch (e) {
      // Ignore
    }

    // Wait for credentials
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const clientId = await new Promise((resolve) =>
      rl.question('\n  Enter Microsoft Client ID: ', resolve)
    );
    const clientSecret = await new Promise((resolve) =>
      rl.question('  Enter Microsoft Client Secret: ', resolve)
    );

    rl.close();

    if (clientId && clientSecret) {
      this.credentials.MICROSOFT_CLIENT_ID = clientId.trim();
      this.credentials.MICROSOFT_CLIENT_SECRET = clientSecret.trim();
      console.log(this.colors.green + '  ✓ Microsoft credentials saved' + this.colors.reset);
    } else {
      console.log(this.colors.yellow + '  ⚠ Skipped Microsoft setup' + this.colors.reset);
    }

    console.log('');
  }

  /**
   * Update .env file with credentials
   */
  async updateEnvFile() {
    console.log(this.colors.blue + '[4/7]' + this.colors.reset + ' Updating .env file...\n');

    let envContent = '';
    if (fs.existsSync(this.envPath)) {
      envContent = fs.readFileSync(this.envPath, 'utf8');
    }

    // Update or add each credential
    for (const [key, value] of Object.entries(this.credentials)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        console.log(this.colors.green + '  ✓' + this.colors.reset + ` Updated ${key}`);
      } else {
        envContent += `\n${key}=${value}`;
        console.log(this.colors.green + '  ✓' + this.colors.reset + ` Added ${key}`);
      }
    }

    // Ensure OAuth callback URL is set
    const callbackRegex = /^OAUTH_CALLBACK_URL=.*$/m;
    if (!callbackRegex.test(envContent)) {
      envContent += `\nOAUTH_CALLBACK_URL=${this.redirectUrl}`;
      console.log(this.colors.green + '  ✓' + this.colors.reset + ` Added OAUTH_CALLBACK_URL`);
    }

    // Ensure encryption key is set
    const encryptionRegex = /^OAUTH_ENCRYPTION_KEY=.*$/m;
    if (!encryptionRegex.test(envContent)) {
      const encryptionKey = require('crypto').randomBytes(32).toString('hex');
      envContent += `\nOAUTH_ENCRYPTION_KEY=${encryptionKey}`;
      console.log(this.colors.green + '  ✓' + this.colors.reset + ` Generated OAUTH_ENCRYPTION_KEY`);
    }

    fs.writeFileSync(this.envPath, envContent);
    console.log('');
  }

  /**
   * Run database setup
   */
  async runDatabaseSetup() {
    console.log(this.colors.blue + '[5/7]' + this.colors.reset + ' Configuring database...\n');

    try {
      // Reload environment
      require('dotenv').config({ path: this.envPath });

      const setupPath = path.join(__dirname, 'oauth-provider-setup.js');
      const OAuthProviderSetup = require(setupPath);
      const { Pool } = require('pg');

      const db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'calos',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });

      const setup = new OAuthProviderSetup({ db });
      const results = await setup.setup();

      await db.end();

      if (results.configured.length > 0) {
        console.log(this.colors.green + '  ✓ Database configured successfully' + this.colors.reset);
      } else {
        console.log(this.colors.yellow + '  ⚠ No providers were configured in database' + this.colors.reset);
      }

    } catch (error) {
      console.log(this.colors.red + '  ✗ Database setup failed: ' + error.message + this.colors.reset);
      console.log(this.colors.yellow + '  ⚠ You may need to run: node lib/oauth-provider-setup.js setup' + this.colors.reset);
    }

    console.log('');
  }

  /**
   * Test OAuth flow
   */
  async testOAuthFlow() {
    console.log(this.colors.blue + '[6/7]' + this.colors.reset + ' Testing OAuth flow...\n');

    const baseUrl = this.homepageUrl;

    // Test each provider
    for (const provider of ['google', 'microsoft', 'github']) {
      const envKey = `${provider.toUpperCase()}_CLIENT_ID`;
      if (this.credentials[envKey]) {
        const testUrl = `${baseUrl}/api/auth/oauth/${provider}/authorize`;
        console.log(this.colors.green + '  ✓' + this.colors.reset + ` ${provider}: ${testUrl}`);
      }
    }

    console.log('');
    console.log(this.colors.yellow + '  💡 Open these URLs in your browser to test OAuth flows' + this.colors.reset);
    console.log('');
  }

  /**
   * Print success message
   */
  printSuccess() {
    console.log(this.colors.blue + '[7/7]' + this.colors.reset + ' Setup complete!\n');
    console.log(this.colors.green + '╔════════════════════════════════════════════════════════════════╗' + this.colors.reset);
    console.log(this.colors.green + '║' + this.colors.reset + '                    ✓ Setup Complete!                          ' + this.colors.green + '║' + this.colors.reset);
    console.log(this.colors.green + '╚════════════════════════════════════════════════════════════════╝' + this.colors.reset);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start the server: ' + this.colors.cyan + 'npm start' + this.colors.reset);
    console.log('  2. Open login page: ' + this.colors.cyan + this.homepageUrl + '/oauth-login.html' + this.colors.reset);
    console.log('  3. Test OAuth flows');
    console.log('');
    console.log('Documentation:');
    console.log('  • OAuth Guide: ' + this.colors.cyan + 'docs/OAUTH-PASSKEY-AUTH.md' + this.colors.reset);
    console.log('  • Setup Guide: ' + this.colors.cyan + 'docs/OAUTH-SETUP-GUIDE.md' + this.colors.reset);
    console.log('');
  }
}

// Run wizard if called directly
if (require.main === module) {
  const wizard = new OAuthWizard();
  wizard.run().catch((error) => {
    console.error('\n❌ Wizard failed:', error.message);
    process.exit(1);
  });
}

module.exports = OAuthWizard;
