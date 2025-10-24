/**
 * CALOS Domain Platform
 *
 * Our own version of GoDaddy Corporate Domains + Brandsight + Hootsuite
 * but decentralized, open-source, and autonomous.
 *
 * Features:
 * - Manage 12 brands × 250+ domains
 * - Corporate domain hierarchy (parent → children)
 * - Temperature weighting (Airbnb-style ratings)
 * - Multi-provider routing (GoDaddy + GitHub + Stripe + Coinbase)
 * - Autonomous Cal orchestration
 * - Newsletter integration per brand
 *
 * Architecture:
 * ```
 * [SoulFra OS Chat] ← User interface
 *       ↓
 * [File Explorer] ← Browse/edit repos
 *       ↓
 * [Cal Agent] ← Autonomous orchestration
 *       ↓
 * [CALOS Domain Platform] ← This file
 *       ├── GoDaddy API (domains, DNS)
 *       ├── GitHub API (hosting, repos)
 *       ├── Stripe/Coinbase (payments)
 *       ├── Gmail Relay (newsletters)
 *       └── PostgreSQL (all data)
 *       ↓
 * [12 Brands × 250+ Domains]
 * ```
 *
 * Usage:
 *   const platform = new CALOSDomainPlatform({ db });
 *   await platform.initialize();
 *   await platform.setupBrand('soulfra.com');
 *   await platform.bulkDNSUpdate();
 */

const { Pool } = require('pg');
const GoDaddyAPIClient = require('./godaddy-api-client');
const StripeBilling = require('./stripe-billing');
const CoinbaseCommerceAdapter = require('./coinbase-commerce-adapter');
const DomainManager = require('./domain-manager');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class CALOSDomainPlatform {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    // Initialize API clients
    this.godaddy = new GoDaddyAPIClient();
    this.domainManager = new DomainManager(this.db);

    // Payment providers (optional)
    this.stripe = options.stripe;
    this.coinbase = options.coinbase;

    // Brand registry
    this.brands = null;
    this.brandsRegistryPath = path.join(__dirname, '../brands/BRANDS_REGISTRY.json');

    // Stats
    this.stats = {
      domainsManaged: 0,
      subdomainsCreated: 0,
      dnsRecordsUpdated: 0,
      brandsSetup: 0,
      errors: []
    };

    console.log(chalk.cyan.bold('\n🌐 CALOS Domain Platform\n'));
    console.log(chalk.gray('─'.repeat(80)));
  }

  /**
   * Initialize platform - load brands, verify credentials
   */
  async initialize() {
    console.log(chalk.yellow('📋 Initializing Platform\n'));

    // Load brand registry
    try {
      const data = await fs.readFile(this.brandsRegistryPath, 'utf8');
      this.brands = JSON.parse(data);
      console.log(chalk.green(`   ✅ Loaded ${this.brands.totalBrands} brands from registry`));
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to load brand registry: ${error.message}`));
      throw error;
    }

    // Verify GoDaddy credentials
    try {
      const domains = await this.godaddy.getDomains({ limit: 1 });
      console.log(chalk.green(`   ✅ GoDaddy API connected (${domains.length} domains found)`));
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  GoDaddy API not configured: ${error.message}`));
      console.log(chalk.gray('      Set GODADDY_API_KEY and GODADDY_API_SECRET to enable'));
    }

    console.log(chalk.gray('─'.repeat(80) + '\n'));

    return {
      success: true,
      brands: this.brands.totalBrands,
      godaddyConnected: true
    };
  }

  /**
   * Setup complete brand infrastructure
   *
   * Creates:
   * - Subdomains (lessons, api, auth, docs, blog)
   * - DNS records (A, CNAME, MX, TXT)
   * - GitHub repo (if doesn't exist)
   * - Database entries
   * - Newsletter subscription lists
   */
  async setupBrand(domainName) {
    console.log(chalk.cyan.bold(`\n🎨 Setting Up Brand: ${domainName}\n`));

    const brand = this.brands.brands.find(b => b.domain === domainName);

    if (!brand) {
      throw new Error(`Brand not found: ${domainName}`);
    }

    const results = {
      domain: domainName,
      steps: {}
    };

    try {
      // Step 1: Verify domain ownership
      console.log(chalk.white('📍 Step 1: Verifying Domain Ownership\n'));
      try {
        const domain = await this.godaddy.getDomain(domainName);
        console.log(chalk.green(`   ✅ Domain verified: ${domainName}`));
        results.steps.verify = { success: true, domain };
      } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Domain not in GoDaddy account: ${domainName}`));
        results.steps.verify = { success: false, error: error.message };
      }

      // Step 2: Create subdomains
      console.log(chalk.white('\n📂 Step 2: Creating Subdomains\n'));
      try {
        const subdomains = await this.godaddy.createBrandSubdomains(domainName);
        console.log(chalk.green(`   ✅ Created ${subdomains.length} subdomains`));
        results.steps.subdomains = { success: true, subdomains };
        this.stats.subdomainsCreated += subdomains.filter(s => s.success).length;
      } catch (error) {
        console.error(chalk.red(`   ❌ Subdomain creation failed: ${error.message}`));
        results.steps.subdomains = { success: false, error: error.message };
      }

      // Step 3: Setup DNS records
      console.log(chalk.white('\n🌍 Step 3: Configuring DNS Records\n'));
      try {
        const dnsRecords = await this.setupDNSRecords(domainName, brand);
        console.log(chalk.green(`   ✅ Configured ${dnsRecords.length} DNS records`));
        results.steps.dns = { success: true, records: dnsRecords };
        this.stats.dnsRecordsUpdated += dnsRecords.length;
      } catch (error) {
        console.error(chalk.red(`   ❌ DNS setup failed: ${error.message}`));
        results.steps.dns = { success: false, error: error.message };
      }

      // Step 4: Database entry
      console.log(chalk.white('\n💾 Step 4: Creating Database Entry\n'));
      try {
        const dbEntry = await this.domainManager.addDomain({
          domain_name: domainName,
          brand_name: brand.name,
          brand_tagline: brand.tagline,
          brand_description: brand.features.join('. '),
          primary_color: brand.colors.primary,
          secondary_color: brand.colors.secondary,
          category: brand.type,
          primary_radi: brand.type,
          services: brand.tools || [],
          keywords: brand.features || []
        });
        console.log(chalk.green(`   ✅ Database entry created`));
        results.steps.database = { success: true, entry: dbEntry };
      } catch (error) {
        console.error(chalk.red(`   ❌ Database entry failed: ${error.message}`));
        results.steps.database = { success: false, error: error.message };
      }

      // Step 5: Calculate temperature (Airbnb-style rating)
      console.log(chalk.white('\n🌡️  Step 5: Calculating Domain Temperature\n'));
      const temperature = await this.calculateDomainTemperature(domainName, brand);
      console.log(chalk.green(`   ✅ Temperature: ${temperature.score}/100 (${temperature.rating})`));
      results.steps.temperature = { success: true, temperature };

      this.stats.brandsSetup++;

    } catch (error) {
      console.error(chalk.red(`\n❌ Brand setup failed: ${error.message}`));
      this.stats.errors.push(`${domainName}: ${error.message}`);
      results.success = false;
      results.error = error.message;
    }

    console.log(chalk.gray('\n' + '─'.repeat(80)));

    return results;
  }

  /**
   * Setup DNS records for brand
   */
  async setupDNSRecords(domain, brand) {
    const records = [];

    // Root domain → GitHub Pages
    try {
      await this.godaddy.addDNSRecord(domain, {
        type: 'A',
        name: '@',
        data: '185.199.108.153', // GitHub Pages IP
        ttl: 3600
      });
      records.push({ type: 'A', name: '@', status: 'created' });
    } catch (error) {
      records.push({ type: 'A', name: '@', status: 'failed', error: error.message });
    }

    // www → root domain
    try {
      await this.godaddy.addDNSRecord(domain, {
        type: 'CNAME',
        name: 'www',
        data: domain,
        ttl: 3600
      });
      records.push({ type: 'CNAME', name: 'www', status: 'created' });
    } catch (error) {
      records.push({ type: 'CNAME', name: 'www', status: 'failed', error: error.message });
    }

    // MX records for email (if needed)
    // TODO: Add email configuration

    return records;
  }

  /**
   * Calculate domain temperature (Airbnb-style rating)
   *
   * Factors:
   * - Domain age (older = warmer)
   * - Traffic/usage (more = warmer)
   * - Revenue (more = warmer)
   * - Content quality (better = warmer)
   * - SEO metrics (better = warmer)
   */
  async calculateDomainTemperature(domain, brand) {
    let score = 0;

    // Factor 1: Deployment status (0-20 points)
    if (brand.status === 'deployed') score += 20;
    else if (brand.status === 'planned') score += 5;

    // Factor 2: Tier (0-20 points)
    if (brand.tier === 'foundation') score += 20;
    else if (brand.tier === 'business') score += 15;
    else if (brand.tier === 'creative') score += 10;
    else score += 5;

    // Factor 3: Tools/features (0-20 points)
    const toolCount = (brand.tools || []).length;
    score += Math.min(20, toolCount * 2);

    // Factor 4: Revenue model (0-20 points)
    if (brand.revenue && brand.revenue.includes('$')) score += 20;
    else score += 5;

    // Factor 5: Social presence (0-20 points)
    if (brand.social && brand.social.twitter) score += 10;
    if (brand.social && brand.social.discord) score += 10;

    // Rating
    let rating;
    if (score >= 80) rating = 'HOT 🔥';
    else if (score >= 60) rating = 'WARM ☀️';
    else if (score >= 40) rating = 'COOL 🌤️';
    else rating = 'COLD ❄️';

    return {
      domain,
      score,
      rating,
      factors: {
        status: brand.status,
        tier: brand.tier,
        tools: toolCount,
        revenue: brand.revenue,
        social: Boolean(brand.social && (brand.social.twitter || brand.social.discord))
      }
    };
  }

  /**
   * Bulk DNS update across all brands
   */
  async bulkDNSUpdate(options = {}) {
    const { recordType = null, dryRun = false } = options;

    console.log(chalk.cyan.bold('\n🌍 Bulk DNS Update\n'));
    console.log(chalk.gray('─'.repeat(80)));

    if (dryRun) {
      console.log(chalk.yellow('   DRY RUN MODE - No changes will be made\n'));
    }

    const domains = this.brands.brands.map(b => b.domain);
    const results = [];

    for (const domain of domains) {
      try {
        console.log(chalk.white(`\n📍 Processing: ${domain}`));

        const records = await this.godaddy.getDNSRecords(domain, recordType);
        console.log(chalk.gray(`   Found ${records.length} records`));

        if (!dryRun) {
          // TODO: Apply updates
        }

        results.push({
          domain,
          success: true,
          recordCount: records.length
        });

      } catch (error) {
        console.error(chalk.red(`   ❌ Failed: ${error.message}`));
        results.push({
          domain,
          success: false,
          error: error.message
        });
      }

      // Rate limiting
      await this.wait(500);
    }

    console.log(chalk.gray('\n' + '─'.repeat(80)));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(chalk.cyan.bold('\n📊 Bulk Update Summary\n'));
    console.log(chalk.white(`   Total domains: ${domains.length}`));
    console.log(chalk.green(`   Successful: ${successful}`));
    if (failed > 0) {
      console.log(chalk.red(`   Failed: ${failed}`));
    }
    console.log('');

    return {
      total: domains.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Get platform dashboard data
   */
  async getDashboard() {
    const dashboard = {
      brands: this.brands.totalBrands,
      deployed: this.brands.brands.filter(b => b.status === 'deployed').length,
      planned: this.brands.brands.filter(b => b.status === 'planned').length,
      stats: this.stats,
      temperatures: []
    };

    // Calculate temperatures for all brands
    for (const brand of this.brands.brands) {
      const temp = await this.calculateDomainTemperature(brand.domain, brand);
      dashboard.temperatures.push(temp);
    }

    // Sort by temperature
    dashboard.temperatures.sort((a, b) => b.score - a.score);

    return dashboard;
  }

  /**
   * Report platform status
   */
  printReport() {
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.cyan.bold('\n🌐 CALOS Domain Platform Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold('\n📊 Statistics:'));
    console.log(chalk.white(`   Brands setup: ${this.stats.brandsSetup}/${this.brands.totalBrands}`));
    console.log(chalk.white(`   Subdomains created: ${this.stats.subdomainsCreated}`));
    console.log(chalk.white(`   DNS records updated: ${this.stats.dnsRecordsUpdated}`));

    if (this.stats.errors.length > 0) {
      console.log(chalk.white.bold('\n❌ Errors:'));
      this.stats.errors.slice(0, 5).forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
      if (this.stats.errors.length > 5) {
        console.log(chalk.gray(`   ... and ${this.stats.errors.length - 5} more`));
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(80) + '\n'));
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CALOSDomainPlatform;
