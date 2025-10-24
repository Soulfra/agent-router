#!/usr/bin/env node
/**
 * Capture OAuth Documentation Screenshots
 *
 * Takes screenshots of OAuth provider setup pages and stores them in database
 * - Navigates to provider OAuth console
 * - Captures full page screenshot
 * - Generates DOM structure hash for change detection
 * - Updates database with screenshot paths
 * - Creates base for annotation system
 *
 * Usage:
 *   node lib/capture-oauth-docs.js [provider]
 *   provider: github | google | microsoft | all
 */

const puppeteer = require('puppeteer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'matthewmauer',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'calos',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
});

class OAuthDocsCapture {
  constructor(options = {}) {
    this.headless = options.headless !== false; // Default: headless
    this.screenshotDir = path.join(__dirname, '..', 'oauth-screenshots');
    this.videoDir = path.join(__dirname, '..', 'oauth-videos');
  }

  /**
   * Ensure output directories exist
   */
  async ensureDirectories() {
    await fs.mkdir(this.screenshotDir, { recursive: true });
    await fs.mkdir(this.videoDir, { recursive: true });
    console.log(`📁 Screenshot dir: ${this.screenshotDir}`);
    console.log(`📁 Video dir: ${this.videoDir}`);
  }

  /**
   * Generate DOM structure hash for change detection
   */
  async generateDOMHash(page) {
    const domStructure = await page.evaluate(() => {
      // Extract key selectors (buttons, inputs, forms, links)
      const elements = Array.from(document.querySelectorAll('button, input, form, a[href*="oauth"], a[href*="app"]'));

      return elements.map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: el.className || null,
        text: el.textContent?.trim().substring(0, 50) || null,
        href: el.getAttribute('href') || null,
        name: el.getAttribute('name') || null,
        type: el.getAttribute('type') || null
      })).filter(item =>
        // Filter out noise - only keep meaningful elements
        item.text || item.href || item.name || item.id
      );
    });

    // Hash the structure
    const structureJSON = JSON.stringify(domStructure, null, 0);
    const hash = crypto.createHash('sha256').update(structureJSON).digest('hex');

    console.log(`   Found ${domStructure.length} key DOM elements`);
    console.log(`   DOM hash: ${hash.substring(0, 16)}...`);

    return { hash, elements: domStructure.length };
  }

  /**
   * Capture screenshot for a provider
   */
  async captureProvider(provider, url, title) {
    console.log(`\n🎬 Capturing ${provider}...`);
    console.log(`   URL: ${url}`);

    const browser = await puppeteer.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 900 });

      console.log(`   Navigating to ${provider}...`);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait a bit for any dynamic content
      await page.waitForTimeout(2000);

      // Generate DOM hash for change detection
      const { hash: domHash, elements: elementCount } = await this.generateDOMHash(page);

      // Create provider-specific directory
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const providerDir = path.join(this.screenshotDir, `${provider}-${timestamp}`);
      await fs.mkdir(providerDir, { recursive: true });

      // Take base screenshot
      const screenshotPath = path.join(providerDir, 'base-screenshot.png');
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      console.log(`   ✓ Screenshot saved: ${path.basename(screenshotPath)}`);

      // Update database
      console.log(`   Updating database...`);
      const metadata = JSON.stringify({
        dom_elements: elementCount,
        viewport_width: 1400,
        viewport_height: 900,
        capture_date: new Date().toISOString()
      });

      const result = await pool.query(`
        UPDATE documentation_snapshots
        SET
          dom_structure_hash = $1,
          screenshot_dir = $2,
          base_screenshot_path = $3,
          status = 'current',
          updated_at = NOW(),
          last_verified_at = NOW(),
          metadata = $4::jsonb
        WHERE provider = $5 AND page_url = $6
        RETURNING snapshot_id, provider, status
      `, [domHash, providerDir, screenshotPath, metadata, provider, url]);

      if (result.rows.length > 0) {
        console.log(`   ✓ Database updated: ${result.rows[0].snapshot_id}`);
        console.log(`   Status: ${result.rows[0].status}`);
        return {
          success: true,
          snapshot_id: result.rows[0].snapshot_id,
          provider,
          screenshotPath,
          domHash
        };
      } else {
        console.log(`   ⚠ No database row found for ${provider}`);
        return { success: false, error: 'No matching snapshot in database' };
      }

    } catch (error) {
      console.error(`   ✗ Error capturing ${provider}: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Capture all providers
   */
  async captureAll() {
    await this.ensureDirectories();

    const providers = [
      {
        provider: 'github',
        url: 'https://github.com/settings/developers',
        title: 'GitHub OAuth Apps'
      },
      {
        provider: 'google',
        url: 'https://console.cloud.google.com/apis/credentials',
        title: 'Google Cloud Credentials'
      },
      {
        provider: 'microsoft',
        url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
        title: 'Azure App Registrations'
      }
    ];

    const results = [];

    for (const config of providers) {
      const result = await this.captureProvider(config.provider, config.url, config.title);
      results.push(result);
    }

    // Summary
    console.log(`\n\n📊 Summary:`);
    console.log(`   Total providers: ${results.length}`);
    console.log(`   Successful: ${results.filter(r => r.success).length}`);
    console.log(`   Failed: ${results.filter(r => !r.success).length}`);

    return results;
  }
}

// CLI interface
if (require.main === module) {
  const provider = process.argv[2] || 'all';

  console.log('OAuth Documentation Screenshot Capture\n');
  console.log('=====================================\n');

  const capture = new OAuthDocsCapture({ headless: true });

  if (provider === 'all') {
    capture.captureAll()
      .then(results => {
        console.log('\n✅ Capture complete!');
        process.exit(0);
      })
      .catch(error => {
        console.error('\n❌ Capture failed:', error.message);
        process.exit(1);
      })
      .finally(() => {
        pool.end();
      });
  } else {
    // Single provider (implement if needed)
    console.error('Single provider capture not yet implemented. Use "all".');
    process.exit(1);
  }
}

module.exports = OAuthDocsCapture;
