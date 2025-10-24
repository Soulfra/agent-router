#!/usr/bin/env node
/**
 * CALOS Domain Platform CLI
 *
 * Command-line interface for managing 12 brands × 250+ domains
 *
 * Usage:
 *   cal-domain init                    - Initialize platform and run migration
 *   cal-domain sync-brands             - Sync BRANDS_REGISTRY.json to database
 *   cal-domain list                    - List all domains and temperatures
 *   cal-domain setup <domain>          - Setup complete brand infrastructure
 *   cal-domain temp <domain>           - Calculate domain temperature
 *   cal-domain dns <domain>            - Show DNS records
 *   cal-domain deploy <domain>         - Deploy to domain
 *   cal-domain chat                    - Start chat + file explorer bridge
 *   cal-domain dashboard               - Launch web dashboard
 */

const { Pool } = require('pg');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import platform components
const CALOSDomainPlatform = require('../lib/calos-domain-platform');
const ChatFileExplorerBridge = require('../lib/chat-file-explorer-bridge');
const CorporateDomainStructureMigration = require('../migrations/003-corporate-domain-structure');

class CALOSDomainPlatformCLI {
  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    this.platform = new CALOSDomainPlatform({
      db: this.db
    });

    this.bridge = null;

    console.log(chalk.cyan.bold('\n🌐 CALOS Domain Platform CLI\n'));
    console.log(chalk.gray('─'.repeat(80)));
  }

  /**
   * Initialize platform
   */
  async init() {
    console.log(chalk.yellow('📋 Initializing Platform\n'));

    // Run database migration
    console.log(chalk.white('Step 1: Running database migration\n'));
    const migration = new CorporateDomainStructureMigration();
    await migration.execute();

    // Initialize platform
    console.log(chalk.white('\nStep 2: Initializing platform\n'));
    await this.platform.initialize();

    // Sync brands
    console.log(chalk.white('\nStep 3: Syncing brands to database\n'));
    await this.syncBrands();

    console.log(chalk.green('\n✅ Platform initialized successfully!\n'));
  }

  /**
   * Sync BRANDS_REGISTRY.json to database
   */
  async syncBrands() {
    console.log(chalk.yellow('📦 Syncing Brands to Database\n'));

    const brandsPath = path.join(__dirname, '../brands/BRANDS_REGISTRY.json');
    const brandsData = JSON.parse(await fs.readFile(brandsPath, 'utf8'));

    // First, create root domain if it doesn't exist
    try {
      await this.db.query(`
        INSERT INTO domain_hierarchy (
          domain_name, hierarchy_level, domain_type, status
        ) VALUES ('matthewmauer.com', 0, 'root', 'deployed')
        ON CONFLICT (domain_name) DO NOTHING
      `);
      console.log(chalk.green('   ✅ Root domain: matthewmauer.com'));
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  Could not create root domain: ${error.message}`));
    }

    let synced = 0;
    let errors = 0;

    for (const brand of brandsData.brands) {
      try {
        // Insert/update domain hierarchy
        await this.db.query(`
          INSERT INTO domain_hierarchy (
            domain_name, parent_domain, hierarchy_level, domain_type,
            hosting_provider, github_repo, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (domain_name) DO UPDATE SET
            hierarchy_level = EXCLUDED.hierarchy_level,
            domain_type = EXCLUDED.domain_type,
            status = EXCLUDED.status,
            updated_at = NOW()
        `, [
          brand.domain,
          'matthewmauer.com', // All brands are children of root
          1, // Level 1 (root is 0)
          'brand',
          'github-pages',
          brand.github?.repo || null,
          brand.status || 'planned'
        ]);

        // Insert/update brand config
        await this.db.query(`
          INSERT INTO brand_config (
            domain_name, brand_name, brand_tagline, brand_description,
            brand_tier, brand_type, primary_color, secondary_color,
            tools, revenue_model, twitter_handle, discord_invite, registry_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (domain_name) DO UPDATE SET
            brand_name = EXCLUDED.brand_name,
            brand_tagline = EXCLUDED.brand_tagline,
            brand_tier = EXCLUDED.brand_tier,
            tools = EXCLUDED.tools,
            last_synced_at = NOW()
        `, [
          brand.domain,
          brand.name,
          brand.tagline,
          brand.features ? brand.features.join('. ') : null,
          brand.tier,
          brand.type,
          brand.colors?.primary || '#3498db',
          brand.colors?.secondary || '#2ecc71',
          brand.tools || [],
          brand.revenue || null,
          brand.social?.twitter || null,
          brand.social?.discord || null,
          brand.id
        ]);

        console.log(chalk.green(`   ✅ Synced ${brand.domain}`));
        synced++;

      } catch (error) {
        console.error(chalk.red(`   ❌ Failed to sync ${brand.domain}: ${error.message}`));
        errors++;
      }
    }

    console.log(chalk.white(`\n   Synced: ${synced}/${brandsData.brands.length}`));
    if (errors > 0) {
      console.log(chalk.red(`   Errors: ${errors}`));
    }
    console.log('');
  }

  /**
   * List all domains and temperatures
   */
  async listDomains() {
    console.log(chalk.yellow('📊 Domain Portfolio\n'));

    const result = await this.db.query(`
      SELECT
        dh.domain_name,
        dh.status,
        dh.hosting_provider,
        bc.brand_name,
        bc.brand_tier,
        dt.total_score,
        dt.rating_label
      FROM domain_hierarchy dh
      LEFT JOIN brand_config bc ON bc.domain_name = dh.domain_name
      LEFT JOIN domain_temperature dt ON dt.domain_name = dh.domain_name
      WHERE dh.domain_type = 'brand'
      ORDER BY dt.total_score DESC NULLS LAST
    `);

    if (result.rows.length === 0) {
      console.log(chalk.gray('   No domains found. Run "cal-domain init" first.'));
      return;
    }

    console.log(chalk.white.bold('Domain                  Brand                    Tier         Score  Rating      Status'));
    console.log(chalk.gray('─'.repeat(110)));

    result.rows.forEach(row => {
      const domain = row.domain_name.padEnd(24);
      const brand = (row.brand_name || '').padEnd(24);
      const tier = (row.brand_tier || '').padEnd(12);
      const score = row.total_score ? String(row.total_score).padStart(3) : '  -';
      const rating = (row.rating_label || '').padEnd(11);
      const status = row.status;

      const statusColor = status === 'deployed' ? chalk.green : chalk.yellow;

      console.log(`${domain} ${brand} ${tier} ${score}    ${rating} ${statusColor(status)}`);
    });

    console.log(chalk.gray('\n' + '─'.repeat(110)));
    console.log(chalk.white(`Total: ${result.rows.length} domains\n`));
  }

  /**
   * Setup domain
   */
  async setupDomain(domain) {
    console.log(chalk.cyan.bold(`\n🎨 Setting Up: ${domain}\n`));

    const result = await this.platform.setupBrand(domain);

    if (result.success === false) {
      console.error(chalk.red(`\n❌ Setup failed: ${result.error}\n`));
      return;
    }

    console.log(chalk.green('\n✅ Setup complete!\n'));
  }

  /**
   * Calculate domain temperature
   */
  async calculateTemperature(domain) {
    console.log(chalk.cyan.bold(`\n🌡️  Calculating Temperature: ${domain}\n`));

    // Get brand from database
    const brandResult = await this.db.query(`
      SELECT bc.*, dh.status
      FROM brand_config bc
      JOIN domain_hierarchy dh ON dh.domain_name = bc.domain_name
      WHERE bc.domain_name = $1
    `, [domain]);

    if (brandResult.rows.length === 0) {
      console.error(chalk.red('   ❌ Domain not found. Run "cal-domain sync-brands" first.\n'));
      return;
    }

    const brand = brandResult.rows[0];

    // Calculate temperature
    const temp = await this.platform.calculateDomainTemperature(domain, {
      status: brand.status,
      tier: brand.brand_tier,
      tools: brand.tools || [],
      revenue: brand.revenue_model,
      social: {
        twitter: brand.twitter_handle,
        discord: brand.discord_invite
      }
    });

    // Store in database
    await this.db.query(`
      INSERT INTO domain_temperature (
        domain_name, total_score, rating_label,
        deployment_score, tier_score, tools_score, revenue_score, social_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (domain_name) DO UPDATE SET
        total_score = EXCLUDED.total_score,
        rating_label = EXCLUDED.rating_label,
        deployment_score = EXCLUDED.deployment_score,
        tier_score = EXCLUDED.tier_score,
        tools_score = EXCLUDED.tools_score,
        revenue_score = EXCLUDED.revenue_score,
        social_score = EXCLUDED.social_score,
        calculated_at = NOW()
    `, [
      domain,
      temp.score,
      temp.rating,
      temp.factors.status === 'deployed' ? 20 : 5,
      temp.factors.tier === 'foundation' ? 20 : 10,
      Math.min(20, temp.factors.tools * 2),
      temp.factors.revenue ? 20 : 5,
      temp.factors.social ? 20 : 0
    ]);

    console.log(chalk.white.bold('   Temperature Report:'));
    console.log(chalk.white(`     Score: ${temp.score}/100`));
    console.log(chalk.white(`     Rating: ${temp.rating}`));
    console.log(chalk.white(`\n     Factor Breakdown:`));
    console.log(chalk.gray(`       Deployment: ${temp.factors.status}`));
    console.log(chalk.gray(`       Tier: ${temp.factors.tier}`));
    console.log(chalk.gray(`       Tools: ${temp.factors.tools}`));
    console.log(chalk.gray(`       Revenue: ${temp.factors.revenue || 'none'}`));
    console.log(chalk.gray(`       Social: ${temp.factors.social ? 'yes' : 'no'}`));
    console.log('');
  }

  /**
   * Show DNS records
   */
  async showDNS(domain) {
    console.log(chalk.cyan.bold(`\n🌍 DNS Records: ${domain}\n`));

    try {
      const records = await this.platform.godaddy.getDNSRecords(domain);

      if (records.length === 0) {
        console.log(chalk.gray('   No DNS records found.\n'));
        return;
      }

      const types = ['A', 'CNAME', 'MX', 'TXT', 'NS'];

      types.forEach(type => {
        const typeRecords = records.filter(r => r.type === type);
        if (typeRecords.length > 0) {
          console.log(chalk.white.bold(`   ${type} Records:`));
          typeRecords.forEach(r => {
            console.log(chalk.gray(`     ${r.name || '@'} → ${r.data} (TTL: ${r.ttl})`));
          });
          console.log('');
        }
      });

    } catch (error) {
      console.error(chalk.red(`   ❌ ${error.message}\n`));
    }
  }

  /**
   * Start chat + file explorer bridge
   */
  async startChatBridge() {
    console.log(chalk.cyan.bold('\n🌉 Starting Chat + File Explorer Bridge\n'));

    this.bridge = new ChatFileExplorerBridge({
      domainPlatform: this.platform
    });

    await this.bridge.initialize();

    console.log(chalk.green('\n✅ Bridge is running! Chat interface connected to file explorer and domain platform.\n'));
    console.log(chalk.white('Try these commands in SoulFra OS chat:'));
    console.log(chalk.gray('  - "list domains"'));
    console.log(chalk.gray('  - "show me the Desktop"'));
    console.log(chalk.gray('  - "temperature soulfra.com"'));
    console.log(chalk.gray('  - "dns calriven.com"'));
    console.log(chalk.gray('  - "help"\n'));

    // Keep process alive
    process.stdin.resume();
  }

  /**
   * Show usage
   */
  showUsage() {
    console.log(`
${chalk.cyan.bold('CALOS Domain Platform CLI')}

${chalk.white.bold('Usage:')}
  cal-domain <command> [options]

${chalk.white.bold('Commands:')}
  ${chalk.cyan('init')}                    Initialize platform and run migration
  ${chalk.cyan('sync-brands')}             Sync BRANDS_REGISTRY.json to database
  ${chalk.cyan('list')}                    List all domains and temperatures
  ${chalk.cyan('setup <domain>')}          Setup complete brand infrastructure
  ${chalk.cyan('temp <domain>')}           Calculate domain temperature
  ${chalk.cyan('dns <domain>')}            Show DNS records
  ${chalk.cyan('chat')}                    Start chat + file explorer bridge
  ${chalk.cyan('dashboard')}               Launch web dashboard (coming soon)

${chalk.white.bold('Examples:')}
  ${chalk.gray('# Initialize platform')}
  cal-domain init

  ${chalk.gray('# List all domains')}
  cal-domain list

  ${chalk.gray('# Setup soulfra.com infrastructure')}
  cal-domain setup soulfra.com

  ${chalk.gray('# Calculate temperature for calriven.com')}
  cal-domain temp calriven.com

  ${chalk.gray('# Show DNS records')}
  cal-domain dns deathtodata.com

  ${chalk.gray('# Start chat bridge')}
  cal-domain chat

${chalk.white.bold('Environment Variables:')}
  ${chalk.gray('DATABASE_URL')}             PostgreSQL connection string
  ${chalk.gray('GODADDY_API_KEY')}          GoDaddy API key
  ${chalk.gray('GODADDY_API_SECRET')}       GoDaddy API secret

${chalk.white.bold('Documentation:')}
  https://github.com/soulfra/calos-domain-platform

`);
  }
}

// CLI entry point
async function main() {
  const cli = new CALOSDomainPlatformCLI();
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'init':
        await cli.init();
        break;

      case 'sync-brands':
        await cli.platform.initialize();
        await cli.syncBrands();
        break;

      case 'list':
        await cli.listDomains();
        break;

      case 'setup':
        if (!arg) {
          console.error(chalk.red('Error: Domain required. Usage: cal-domain setup <domain>\n'));
          process.exit(1);
        }
        await cli.platform.initialize();
        await cli.setupDomain(arg);
        break;

      case 'temp':
        if (!arg) {
          console.error(chalk.red('Error: Domain required. Usage: cal-domain temp <domain>\n'));
          process.exit(1);
        }
        await cli.platform.initialize();
        await cli.calculateTemperature(arg);
        break;

      case 'dns':
        if (!arg) {
          console.error(chalk.red('Error: Domain required. Usage: cal-domain dns <domain>\n'));
          process.exit(1);
        }
        await cli.platform.initialize();
        await cli.showDNS(arg);
        break;

      case 'chat':
        await cli.platform.initialize();
        await cli.startChatBridge();
        break;

      case 'dashboard':
        console.log(chalk.yellow('\n🚧 Web dashboard coming soon!\n'));
        console.log(chalk.gray('For now, use: cal-domain list\n'));
        break;

      default:
        cli.showUsage();
        break;
    }

    if (command !== 'chat') {
      await cli.db.end();
      process.exit(0);
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    console.log(chalk.gray(error.stack));
    await cli.db.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = CALOSDomainPlatformCLI;
