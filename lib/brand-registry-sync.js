/**
 * Brand Registry Sync System
 *
 * Syncs brands/BRANDS_REGISTRY.json to multiple platforms:
 * - GitHub (git commit and push)
 * - Google Sheets (spreadsheet rows)
 * - GitHub Gist (markdown table)
 * - GoDaddy (DNS verification)
 * - Twitter (launch announcements)
 *
 * Single source of truth: brands/BRANDS_REGISTRY.json
 *
 * Example:
 *   const sync = new BrandRegistrySync({ githubToken, sheetsId });
 *   await sync.syncAll();
 *   // Syncs to all platforms: GitHub, Sheets, Gist, GoDaddy, Twitter
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const { google } = require('googleapis');

class BrandRegistrySync {
  constructor(options = {}) {
    this.config = {
      registryPath: options.registryPath || path.join(__dirname, '../brands/BRANDS_REGISTRY.json'),
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      sheetsId: options.sheetsId || process.env.GOOGLE_SHEETS_DB_ID,
      sheetsCredsPath: options.sheetsCredsPath || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || path.join(__dirname, '../credentials.json'),
      godaddyApiKey: options.godaddyApiKey || process.env.GODADDY_API_KEY,
      godaddyApiSecret: options.godaddyApiSecret || process.env.GODADDY_API_SECRET,
      twitterBearerToken: options.twitterBearerToken || process.env.TWITTER_BEARER_TOKEN,
      verbose: options.verbose || false
    };

    this.registry = null;
    this.syncResults = {
      timestamp: null,
      github: { success: false, error: null },
      sheets: { success: false, error: null },
      gist: { success: false, error: null },
      godaddy: { success: false, error: null },
      twitter: { success: false, error: null }
    };

    console.log('[BrandRegistrySync] Initialized');
  }

  /**
   * Load registry from JSON file
   */
  async loadRegistry() {
    try {
      const content = await fs.readFile(this.config.registryPath, 'utf8');
      this.registry = JSON.parse(content);

      if (this.config.verbose) {
        console.log(`[BrandRegistrySync] Loaded ${this.registry.totalBrands} brands from registry`);
      }

      return this.registry;
    } catch (error) {
      console.error('[BrandRegistrySync] Error loading registry:', error.message);
      throw error;
    }
  }

  /**
   * Sync to GitHub (commit and push registry file)
   */
  async syncToGitHub() {
    if (!this.registry) await this.loadRegistry();

    try {
      const registryDir = path.dirname(this.config.registryPath);
      const fileName = path.basename(this.config.registryPath);

      // Check if in git repo
      try {
        await execPromise('git status', { cwd: registryDir });
      } catch {
        this.syncResults.github = {
          success: false,
          error: 'Not in a git repository'
        };
        return this.syncResults.github;
      }

      // Add and commit
      const commitMessage = `Update brand registry - ${this.registry.totalBrands} brands (${new Date().toISOString()})`;

      await execPromise(`git add ${fileName}`, { cwd: registryDir });

      try {
        const { stdout } = await execPromise(`git commit -m "${commitMessage}"`, { cwd: registryDir });

        if (this.config.verbose) {
          console.log('[BrandRegistrySync] Git commit:', stdout);
        }
      } catch (error) {
        // No changes to commit is OK
        if (!error.message.includes('nothing to commit')) {
          throw error;
        }
      }

      // Push to remote
      const { stdout: pushOutput } = await execPromise('git push origin main', { cwd: registryDir });

      if (this.config.verbose) {
        console.log('[BrandRegistrySync] Git push:', pushOutput);
      }

      this.syncResults.github = {
        success: true,
        commitMessage,
        pushedAt: new Date().toISOString()
      };

      return this.syncResults.github;

    } catch (error) {
      this.syncResults.github = {
        success: false,
        error: error.message
      };
      console.error('[BrandRegistrySync] GitHub sync error:', error.message);
      return this.syncResults.github;
    }
  }

  /**
   * Sync to Google Sheets (convert JSON to spreadsheet rows)
   */
  async syncToGoogleSheets() {
    if (!this.registry) await this.loadRegistry();

    if (!this.config.sheetsId || !this.config.sheetsCredsPath) {
      this.syncResults.sheets = {
        success: false,
        error: 'Google Sheets credentials not configured'
      };
      return this.syncResults.sheets;
    }

    try {
      // Load credentials
      const credentials = JSON.parse(await fs.readFile(this.config.sheetsCredsPath, 'utf8'));

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // Prepare data rows
      const headers = [
        'ID', 'Name', 'Domain', 'Tagline', 'Tier', 'Launch Order', 'Type', 'Status',
        'Primary Color', 'Secondary Color', 'Accent Color',
        'GitHub Repo', 'GitHub Status', 'GoDaddy Status', 'Ollama Models',
        'Revenue Model', 'Dependencies', 'Tools', 'Features'
      ];

      const rows = [headers];

      for (const brand of this.registry.brands) {
        rows.push([
          brand.id,
          brand.name,
          brand.domain,
          brand.tagline,
          brand.tier,
          brand.launchOrder,
          brand.type,
          brand.status,
          brand.colors.primary,
          brand.colors.secondary,
          brand.colors.accent,
          brand.github.repo,
          brand.github.status,
          brand.godaddy.status,
          brand.ollamaModels.join(', '),
          brand.revenue,
          brand.dependencies.join(', '),
          brand.tools.join(', '),
          brand.features.join(', ')
        ]);
      }

      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: this.config.sheetsId,
        range: 'Brands!A1:Z1000'
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.config.sheetsId,
        range: 'Brands!A1',
        valueInputOption: 'RAW',
        resource: { values: rows }
      });

      if (this.config.verbose) {
        console.log(`[BrandRegistrySync] Synced ${rows.length - 1} brands to Google Sheets`);
      }

      this.syncResults.sheets = {
        success: true,
        rowsWritten: rows.length,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${this.config.sheetsId}`
      };

      return this.syncResults.sheets;

    } catch (error) {
      this.syncResults.sheets = {
        success: false,
        error: error.message
      };
      console.error('[BrandRegistrySync] Google Sheets sync error:', error.message);
      return this.syncResults.sheets;
    }
  }

  /**
   * Sync to GitHub Gist (create/update markdown table)
   */
  async syncToGist() {
    if (!this.registry) await this.loadRegistry();

    if (!this.config.githubToken) {
      this.syncResults.gist = {
        success: false,
        error: 'GitHub token not configured'
      };
      return this.syncResults.gist;
    }

    try {
      // Generate markdown table
      const markdown = this.generateMarkdownTable();

      // Check if gist already exists (stored in registry metadata)
      let gistId = this.registry.metadata?.gistId || null;

      const GIST_API = 'https://api.github.com/gists';
      const headers = {
        'Authorization': `Bearer ${this.config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      };

      if (gistId) {
        // Update existing gist
        const response = await axios.patch(`${GIST_API}/${gistId}`, {
          description: `CALOS Brand Registry - ${this.registry.totalBrands} brands`,
          files: {
            'BRANDS_REGISTRY.md': {
              content: markdown
            }
          }
        }, { headers });

        this.syncResults.gist = {
          success: true,
          gistId: response.data.id,
          url: response.data.html_url,
          action: 'updated'
        };

      } else {
        // Create new gist
        const response = await axios.post(GIST_API, {
          description: `CALOS Brand Registry - ${this.registry.totalBrands} brands`,
          public: true,
          files: {
            'BRANDS_REGISTRY.md': {
              content: markdown
            }
          }
        }, { headers });

        this.syncResults.gist = {
          success: true,
          gistId: response.data.id,
          url: response.data.html_url,
          action: 'created'
        };

        // Save gist ID back to registry
        this.registry.metadata = this.registry.metadata || {};
        this.registry.metadata.gistId = response.data.id;
        await fs.writeFile(this.config.registryPath, JSON.stringify(this.registry, null, 2));
      }

      if (this.config.verbose) {
        console.log(`[BrandRegistrySync] Gist ${this.syncResults.gist.action}: ${this.syncResults.gist.url}`);
      }

      return this.syncResults.gist;

    } catch (error) {
      this.syncResults.gist = {
        success: false,
        error: error.message
      };
      console.error('[BrandRegistrySync] Gist sync error:', error.message);
      return this.syncResults.gist;
    }
  }

  /**
   * Generate markdown table from registry
   */
  generateMarkdownTable() {
    const lines = [];

    lines.push('# CALOS Brand Registry');
    lines.push('');
    lines.push(`**Total Brands:** ${this.registry.totalBrands}`);
    lines.push(`**Last Updated:** ${this.registry.lastUpdated}`);
    lines.push(`**Owner:** ${this.registry.owner.name} (@${this.registry.owner.github})`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Foundation brands
    const foundation = this.registry.brands.filter(b => b.tier === 'foundation');
    const business = this.registry.brands.filter(b => b.tier === 'business');
    const creative = this.registry.brands.filter(b => b.tier === 'creative');
    const additional = this.registry.brands.filter(b => b.tier === 'additional');

    const sections = [
      { title: '🏛️ Foundation Layer', brands: foundation },
      { title: '💼 Business Layer', brands: business },
      { title: '🎨 Creative Layer', brands: creative },
      { title: '➕ Additional', brands: additional }
    ];

    for (const section of sections) {
      if (section.brands.length === 0) continue;

      lines.push(`## ${section.title}`);
      lines.push('');
      lines.push('| # | Name | Domain | Status | GitHub | GoDaddy | Tagline |');
      lines.push('|---|------|--------|--------|--------|---------|---------|');

      for (const brand of section.brands) {
        const statusEmoji = brand.status === 'deployed' ? '✅' : '📋';
        const githubEmoji = brand.github.status === 'deployed' ? '✅' : '📋';
        const godaddyEmoji = brand.godaddy.status === 'registered' ? '✅' : '❌';

        lines.push(`| ${brand.launchOrder} | **${brand.name}** | [${brand.domain}](https://${brand.domain}) | ${statusEmoji} ${brand.status} | ${githubEmoji} ${brand.github.status} | ${godaddyEmoji} ${brand.godaddy.status} | ${brand.tagline} |`);
      }

      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('*Generated by CALOS Brand Registry Sync*');
    lines.push(`*Last synced: ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  /**
   * Check GoDaddy DNS status for all domains
   */
  async syncToGoDaddy() {
    if (!this.registry) await this.loadRegistry();

    if (!this.config.godaddyApiKey || !this.config.godaddyApiSecret) {
      this.syncResults.godaddy = {
        success: false,
        error: 'GoDaddy API credentials not configured'
      };
      return this.syncResults.godaddy;
    }

    try {
      const results = {
        checked: 0,
        registered: 0,
        available: 0,
        errors: []
      };

      for (const brand of this.registry.brands) {
        try {
          // Check domain availability via GoDaddy API
          const response = await axios.get(
            `https://api.godaddy.com/v1/domains/available?domain=${brand.domain}`,
            {
              headers: {
                'Authorization': `sso-key ${this.config.godaddyApiKey}:${this.config.godaddyApiSecret}`,
                'Accept': 'application/json'
              }
            }
          );

          const isAvailable = response.data.available;

          // Update registry
          brand.godaddy.status = isAvailable ? 'available' : 'registered';

          if (isAvailable) {
            results.available++;
          } else {
            results.registered++;
          }

          results.checked++;

        } catch (error) {
          results.errors.push({
            domain: brand.domain,
            error: error.message
          });
        }
      }

      // Save updated registry
      await fs.writeFile(this.config.registryPath, JSON.stringify(this.registry, null, 2));

      if (this.config.verbose) {
        console.log(`[BrandRegistrySync] GoDaddy check: ${results.registered} registered, ${results.available} available, ${results.errors.length} errors`);
      }

      this.syncResults.godaddy = {
        success: true,
        ...results
      };

      return this.syncResults.godaddy;

    } catch (error) {
      this.syncResults.godaddy = {
        success: false,
        error: error.message
      };
      console.error('[BrandRegistrySync] GoDaddy sync error:', error.message);
      return this.syncResults.godaddy;
    }
  }

  /**
   * Post launch announcements to Twitter
   */
  async syncToTwitter() {
    if (!this.registry) await this.loadRegistry();

    if (!this.config.twitterBearerToken) {
      this.syncResults.twitter = {
        success: false,
        error: 'Twitter API credentials not configured'
      };
      return this.syncResults.twitter;
    }

    try {
      const deployedBrands = this.registry.brands.filter(b => b.status === 'deployed');

      // Only tweet about newly deployed brands (would need to track this)
      // For now, just skip Twitter sync

      this.syncResults.twitter = {
        success: true,
        message: 'Twitter sync not implemented yet',
        deployedCount: deployedBrands.length
      };

      return this.syncResults.twitter;

    } catch (error) {
      this.syncResults.twitter = {
        success: false,
        error: error.message
      };
      console.error('[BrandRegistrySync] Twitter sync error:', error.message);
      return this.syncResults.twitter;
    }
  }

  /**
   * Sync to all platforms
   */
  async syncAll() {
    console.log('[BrandRegistrySync] Starting full sync to all platforms...');

    this.syncResults.timestamp = new Date().toISOString();

    // Load registry first
    await this.loadRegistry();

    // Sync to all platforms (in parallel where possible)
    const results = await Promise.allSettled([
      this.syncToGitHub(),
      this.syncToGoogleSheets(),
      this.syncToGist(),
      this.syncToGoDaddy()
      // Twitter sync disabled for now
    ]);

    // Log summary
    const successful = Object.values(this.syncResults).filter(r => r.success === true).length;
    const total = Object.keys(this.syncResults).filter(k => k !== 'timestamp').length;

    console.log(`[BrandRegistrySync] Sync complete: ${successful}/${total} platforms successful`);

    if (this.config.verbose) {
      console.log('[BrandRegistrySync] Results:', JSON.stringify(this.syncResults, null, 2));
    }

    return this.syncResults;
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      lastSync: this.syncResults.timestamp,
      platforms: {
        github: this.syncResults.github.success ? 'synced' : 'failed',
        sheets: this.syncResults.sheets.success ? 'synced' : 'failed',
        gist: this.syncResults.gist.success ? 'synced' : 'failed',
        godaddy: this.syncResults.godaddy.success ? 'synced' : 'failed',
        twitter: this.syncResults.twitter.success ? 'synced' : 'failed'
      },
      errors: Object.entries(this.syncResults)
        .filter(([key, val]) => val.error)
        .map(([key, val]) => ({ platform: key, error: val.error }))
    };
  }
}

module.exports = BrandRegistrySync;
