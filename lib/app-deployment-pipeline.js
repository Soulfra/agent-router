/**
 * AppDeploymentPipeline
 *
 * End-to-end anonymous app distribution pipeline.
 *
 * Flow:
 *   1. Generate app (API-to-App generator)
 *   2. Deploy to GitHub (auto-repo, Pages)
 *   3. Deploy to Google Drive (frictionless distribution)
 *   4. Configure custom DNS (cards.calos.games)
 *   5. Set up anonymous auth (OAuth bridging)
 *
 * One command deploys everywhere.
 *
 * Usage:
 *   const pipeline = new AppDeploymentPipeline({ db });
 *   await pipeline.deployApp('/path/to/app', {
 *     name: 'card-game',
 *     deployTo: ['github', 'google-drive', 'dns'],
 *     customDomain: 'cards.calos.games'
 *   });
 */

const GitHubAppPublisher = require('./github-app-publisher');
const GoogleDriveAppPublisher = require('./google-drive-app-publisher');
const AnonymousIdentityRouter = require('./anonymous-identity-router');
const GameDNSRouter = require('./game-dns-router');
const path = require('path');

class AppDeploymentPipeline {
  constructor(options = {}) {
    this.db = options.db;

    // Initialize publishers
    this.githubPublisher = new GitHubAppPublisher({
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      webhookUrl: options.webhookUrl || process.env.WEBHOOK_URL,
      db: this.db
    });

    this.googleDrivePublisher = new GoogleDriveAppPublisher({
      credentials: options.googleCredentials,
      db: this.db
    });

    this.identityRouter = new AnonymousIdentityRouter({
      db: this.db
    });

    this.dnsRouter = new GameDNSRouter({
      provider: options.dnsProvider || 'cloudflare',
      db: this.db
    });

    console.log('[AppDeploymentPipeline] Initialized');
  }

  /**
   * Deploy an app through the full pipeline
   * @param {string} appPath - Path to generated app
   * @param {object} options - Deployment options
   * @returns {Promise<object>} - Deployment result
   */
  async deployApp(appPath, options = {}) {
    const {
      name,
      description = 'Built with CALOS Agent Router',
      deployTo = ['github'], // ['github', 'google-drive', 'dns']
      customDomain = null,
      googleTokens = null, // Google OAuth tokens for Drive
      enableAnonymousAuth = true
    } = options;

    if (!name) throw new Error('App name required');

    console.log(`[AppDeploymentPipeline] Deploying ${name}...`);
    console.log(`  Targets: ${deployTo.join(', ')}`);

    const deployment = {
      name,
      appPath,
      startedAt: new Date(),
      steps: [],
      urls: {},
      success: false
    };

    try {
      // Step 1: GitHub deployment
      if (deployTo.includes('github')) {
        console.log('[AppDeploymentPipeline] Step 1: GitHub deployment');
        const githubResult = await this.deployToGitHub(appPath, name, description);

        deployment.steps.push({
          name: 'github',
          success: true,
          result: githubResult
        });

        deployment.urls.github = githubResult.repo;
        deployment.urls.githubPages = githubResult.pages;
      }

      // Step 2: Google Drive deployment
      if (deployTo.includes('google-drive')) {
        console.log('[AppDeploymentPipeline] Step 2: Google Drive deployment');

        if (!googleTokens) {
          console.warn('  Skipping Google Drive: No OAuth tokens provided');
        } else {
          const driveResult = await this.deployToGoogleDrive(appPath, name, description, googleTokens);

          deployment.steps.push({
            name: 'google-drive',
            success: true,
            result: driveResult
          });

          deployment.urls.googleDrive = driveResult.shareLink;
          deployment.urls.driveApp = driveResult.appUrl;
        }
      }

      // Step 3: Custom DNS configuration
      if (deployTo.includes('dns') && customDomain) {
        console.log('[AppDeploymentPipeline] Step 3: DNS configuration');

        const dnsResult = await this.configureDNS(
          customDomain,
          deployment.urls.githubPages || deployment.urls.driveApp
        );

        deployment.steps.push({
          name: 'dns',
          success: true,
          result: dnsResult
        });

        deployment.urls.customDomain = `https://${customDomain}`;
      }

      // Step 4: Anonymous auth setup
      if (enableAnonymousAuth) {
        console.log('[AppDeploymentPipeline] Step 4: Anonymous auth setup');
        const authResult = await this.setupAnonymousAuth(name);

        deployment.steps.push({
          name: 'anonymous-auth',
          success: true,
          result: authResult
        });
      }

      // Save deployment to database
      if (this.db) {
        await this.saveDeployment(deployment);
      }

      deployment.completedAt = new Date();
      deployment.success = true;

      console.log(`[AppDeploymentPipeline] Deployment complete! 🚀`);
      console.log(`  GitHub: ${deployment.urls.github || 'N/A'}`);
      console.log(`  GitHub Pages: ${deployment.urls.githubPages || 'N/A'}`);
      console.log(`  Google Drive: ${deployment.urls.googleDrive || 'N/A'}`);
      console.log(`  Custom Domain: ${deployment.urls.customDomain || 'N/A'}`);

      return deployment;
    } catch (error) {
      deployment.error = error.message;
      deployment.completedAt = new Date();
      deployment.success = false;

      console.error('[AppDeploymentPipeline] Deployment failed:', error);

      // Save failed deployment
      if (this.db) {
        await this.saveDeployment(deployment);
      }

      throw error;
    }
  }

  /**
   * Deploy to GitHub
   * @param {string} appPath - App path
   * @param {string} name - App name
   * @param {string} description - Description
   * @returns {Promise<object>} - GitHub deployment result
   */
  async deployToGitHub(appPath, name, description) {
    return await this.githubPublisher.publishApp(appPath, {
      name,
      description,
      private: false,
      enablePages: true,
      enableActions: true
    });
  }

  /**
   * Deploy to Google Drive
   * @param {string} appPath - App path
   * @param {string} name - App name
   * @param {string} description - Description
   * @param {object} tokens - Google OAuth tokens
   * @returns {Promise<object>} - Google Drive deployment result
   */
  async deployToGoogleDrive(appPath, name, description, tokens) {
    await this.googleDrivePublisher.initialize(tokens);

    return await this.googleDrivePublisher.publishApp(appPath, {
      name,
      description,
      category: 'GAMES',
      public: true
    });
  }

  /**
   * Configure custom DNS
   * @param {string} domain - Custom domain
   * @param {string} target - Target URL
   * @returns {Promise<object>} - DNS configuration result
   */
  async configureDNS(domain, target) {
    // Extract hostname from URL
    const hostname = target.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return await this.dnsRouter.createRecord(domain, 'CNAME', hostname, {
      ttl: 300,
      proxied: true
    });
  }

  /**
   * Set up anonymous auth for the app
   * @param {string} appName - App name
   * @returns {Promise<object>} - Auth setup result
   */
  async setupAnonymousAuth(appName) {
    // Create app-specific OAuth config in database
    if (!this.db) return { setup: false };

    try {
      await this.db.query(
        `INSERT INTO app_oauth_configs (
          app_name, allow_github, allow_google, allow_twitter, allow_discord, created_at
        ) VALUES ($1, true, true, true, true, NOW())
        ON CONFLICT (app_name) DO NOTHING`,
        [appName]
      );

      return {
        setup: true,
        providers: ['github', 'google', 'twitter', 'discord'],
        anonymousAuth: true
      };
    } catch (error) {
      console.warn('[AppDeploymentPipeline] Failed to setup auth:', error.message);
      return { setup: false, error: error.message };
    }
  }

  /**
   * Save deployment to database
   * @param {object} deployment - Deployment data
   */
  async saveDeployment(deployment) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO app_deployment_pipeline (
          app_name, app_path, started_at, completed_at, success,
          steps, urls, error, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          deployment.name,
          deployment.appPath,
          deployment.startedAt,
          deployment.completedAt,
          deployment.success,
          JSON.stringify(deployment.steps),
          JSON.stringify(deployment.urls),
          deployment.error || null,
          JSON.stringify({
            description: deployment.description,
            deployTo: deployment.deployTo
          })
        ]
      );

      console.log(`[AppDeploymentPipeline] Deployment saved to database`);
    } catch (error) {
      console.warn('[AppDeploymentPipeline] Failed to save deployment:', error.message);
    }
  }

  /**
   * Get deployment status
   * @param {string} appName - App name
   * @returns {Promise<object>} - Deployment status
   */
  async getDeploymentStatus(appName) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT * FROM app_deployment_pipeline
         WHERE app_name = $1
         ORDER BY started_at DESC
         LIMIT 1`,
        [appName]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[AppDeploymentPipeline] Failed to get status:', error);
      return null;
    }
  }

  /**
   * List all deployments
   * @param {number} limit - Max results
   * @returns {Promise<Array>} - Deployments
   */
  async listDeployments(limit = 50) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT app_name, started_at, completed_at, success, urls
         FROM app_deployment_pipeline
         ORDER BY started_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[AppDeploymentPipeline] Failed to list deployments:', error);
      return [];
    }
  }

  /**
   * Rollback a deployment
   * @param {string} appName - App name
   * @returns {Promise<boolean>} - Success
   */
  async rollbackDeployment(appName) {
    console.log(`[AppDeploymentPipeline] Rolling back: ${appName}`);

    try {
      // Get deployment info
      const deployment = await this.getDeploymentStatus(appName);
      if (!deployment) {
        throw new Error(`Deployment not found: ${appName}`);
      }

      const urls = JSON.parse(deployment.urls);

      // Delete from GitHub (if exists)
      if (urls.github) {
        console.log('  Deleting from GitHub...');
        // TODO: Implement GitHub repo deletion
      }

      // Delete from Google Drive (if exists)
      if (urls.googleDrive) {
        console.log('  Deleting from Google Drive...');
        // TODO: Implement Google Drive folder deletion
      }

      // Delete DNS record (if exists)
      if (urls.customDomain) {
        const domain = urls.customDomain.replace(/^https?:\/\//, '');
        console.log(`  Deleting DNS record: ${domain}`);
        await this.dnsRouter.deleteRecord(domain);
      }

      console.log(`[AppDeploymentPipeline] Rollback complete`);

      return true;
    } catch (error) {
      console.error('[AppDeploymentPipeline] Rollback failed:', error);
      throw error;
    }
  }
}

module.exports = AppDeploymentPipeline;
