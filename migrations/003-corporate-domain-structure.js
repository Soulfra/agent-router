#!/usr/bin/env node
/**
 * Migration 003: Corporate Domain Structure
 *
 * Creates database schema for CALOS Domain Platform:
 * - Corporate domain hierarchy (parent → children)
 * - Temperature/rating system (Airbnb-style)
 * - Newsletter subscriptions per brand
 * - DNS template library
 * - Subdomain tracking
 * - Deployment history
 *
 * Integrates with:
 * - GoDaddy API (domains, DNS)
 * - GitHub Pages (hosting)
 * - Stripe/Coinbase (payments)
 * - Gmail Relay (newsletters)
 *
 * Run: node migrations/003-corporate-domain-structure.js
 */

const { Pool } = require('pg');
const chalk = require('chalk');
require('dotenv').config();

class CorporateDomainStructureMigration {
  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    console.log(chalk.cyan.bold('\n📊 Migration 003: Corporate Domain Structure\n'));
    console.log(chalk.gray('─'.repeat(80)));
  }

  async execute() {
    try {
      await this.db.query('BEGIN');

      console.log(chalk.yellow('📋 Creating Tables\n'));

      // Table 1: Corporate domain hierarchy
      await this.createDomainHierarchyTable();

      // Table 2: Domain temperature/ratings (Airbnb-style)
      await this.createDomainTemperatureTable();

      // Table 3: Newsletter subscriptions per brand
      await this.createNewsletterSubscriptionsTable();

      // Table 4: DNS template library
      await this.createDNSTemplatesTable();

      // Table 5: Subdomain tracking
      await this.createSubdomainsTable();

      // Table 6: Deployment history
      await this.createDeploymentHistoryTable();

      // Table 7: Brand configuration (from BRANDS_REGISTRY.json)
      await this.createBrandConfigTable();

      console.log(chalk.yellow('\n📊 Creating Indexes\n'));

      await this.createIndexes();

      console.log(chalk.yellow('\n📦 Seeding Initial Data\n'));

      await this.seedInitialData();

      await this.db.query('COMMIT');

      this.printSummary();

      return {
        success: true,
        tables: 7,
        indexes: 15
      };

    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error(chalk.red('\n❌ Migration Failed:'), error.message);
      console.log(chalk.gray(error.stack));
      throw error;
    } finally {
      await this.db.end();
    }
  }

  /**
   * Table 1: Domain hierarchy (parent → children)
   */
  async createDomainHierarchyTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS domain_hierarchy (
        id SERIAL PRIMARY KEY,
        domain_name VARCHAR(255) UNIQUE NOT NULL,
        parent_domain VARCHAR(255),
        hierarchy_level INTEGER DEFAULT 0,
        domain_type VARCHAR(50), -- 'root', 'brand', 'subdomain'

        -- GoDaddy metadata
        godaddy_domain_id VARCHAR(255),
        registered_at TIMESTAMP,
        expires_at TIMESTAMP,
        auto_renew BOOLEAN DEFAULT true,
        privacy_enabled BOOLEAN DEFAULT false,
        locked BOOLEAN DEFAULT false,

        -- Hosting configuration
        hosting_provider VARCHAR(50), -- 'github-pages', 'vercel', 'custom'
        github_repo VARCHAR(255),
        github_branch VARCHAR(100) DEFAULT 'main',
        cname_target VARCHAR(255),

        -- Status
        status VARCHAR(50) DEFAULT 'planned', -- 'planned', 'deploying', 'deployed', 'paused'
        verified BOOLEAN DEFAULT false,
        last_verified_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (parent_domain) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE
      );
    `);

    console.log(chalk.green('   ✅ Created domain_hierarchy table'));
  }

  /**
   * Table 2: Domain temperature/ratings (Airbnb 2025 style)
   */
  async createDomainTemperatureTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS domain_temperature (
        id SERIAL PRIMARY KEY,
        domain_name VARCHAR(255) UNIQUE NOT NULL,

        -- Temperature score (0-100, like Airbnb ratings)
        total_score INTEGER DEFAULT 0,
        rating_label VARCHAR(20), -- 'HOT 🔥', 'WARM ☀️', 'COOL 🌤️', 'COLD ❄️'

        -- Factor scores (0-20 each)
        deployment_score INTEGER DEFAULT 0,
        tier_score INTEGER DEFAULT 0,
        tools_score INTEGER DEFAULT 0,
        revenue_score INTEGER DEFAULT 0,
        social_score INTEGER DEFAULT 0,

        -- Traffic metrics
        monthly_visitors INTEGER DEFAULT 0,
        monthly_pageviews INTEGER DEFAULT 0,
        bounce_rate DECIMAL(5,2),
        avg_session_duration INTEGER, -- seconds

        -- Revenue metrics
        monthly_revenue DECIMAL(10,2) DEFAULT 0,
        conversion_rate DECIMAL(5,2),

        -- SEO metrics
        domain_authority INTEGER,
        page_authority INTEGER,
        backlinks_count INTEGER,
        organic_traffic INTEGER,

        -- Social metrics
        twitter_followers INTEGER DEFAULT 0,
        discord_members INTEGER DEFAULT 0,
        newsletter_subscribers INTEGER DEFAULT 0,

        -- Engagement score
        engagement_rate DECIMAL(5,2),

        calculated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (domain_name) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE
      );
    `);

    console.log(chalk.green('   ✅ Created domain_temperature table'));
  }

  /**
   * Table 3: Newsletter subscriptions per brand
   */
  async createNewsletterSubscriptionsTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
        id SERIAL PRIMARY KEY,
        domain_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,

        -- Subscription status
        status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'unsubscribed', 'bounced'
        confirmed_at TIMESTAMP,
        unsubscribed_at TIMESTAMP,

        -- Double opt-in
        confirmation_token VARCHAR(255),
        confirmation_sent_at TIMESTAMP,

        -- Subscriber metadata
        subscriber_name VARCHAR(255),
        subscriber_tags TEXT[], -- ['devops', 'ai', 'crypto']
        subscriber_source VARCHAR(100), -- 'website', 'manual', 'import'

        -- Email preferences
        frequency VARCHAR(50) DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly'
        last_email_sent_at TIMESTAMP,
        total_emails_sent INTEGER DEFAULT 0,
        total_emails_opened INTEGER DEFAULT 0,
        total_links_clicked INTEGER DEFAULT 0,

        -- Engagement metrics
        open_rate DECIMAL(5,2),
        click_rate DECIMAL(5,2),

        subscribed_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(domain_name, email),
        FOREIGN KEY (domain_name) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE
      );
    `);

    console.log(chalk.green('   ✅ Created newsletter_subscriptions table'));
  }

  /**
   * Table 4: DNS template library
   */
  async createDNSTemplatesTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dns_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,

        -- Template type
        template_type VARCHAR(50), -- 'brand', 'subdomain', 'custom'

        -- DNS records (JSON array)
        records JSONB NOT NULL,
        -- Example: [
        --   {type: 'A', name: '@', data: '185.199.108.153', ttl: 3600},
        --   {type: 'CNAME', name: 'www', data: 'domain.com', ttl: 3600},
        --   {type: 'CNAME', name: 'lessons', data: 'username.github.io', ttl: 3600}
        -- ]

        -- Usage tracking
        times_applied INTEGER DEFAULT 0,
        last_applied_at TIMESTAMP,

        -- Metadata
        created_by VARCHAR(255),
        is_public BOOLEAN DEFAULT true,
        tags TEXT[],

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log(chalk.green('   ✅ Created dns_templates table'));
  }

  /**
   * Table 5: Subdomain tracking
   */
  async createSubdomainsTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS subdomains (
        id SERIAL PRIMARY KEY,
        parent_domain VARCHAR(255) NOT NULL,
        subdomain_name VARCHAR(255) NOT NULL, -- 'lessons', 'api', 'auth', etc.
        full_domain VARCHAR(255) UNIQUE NOT NULL, -- 'lessons.soulfra.com'

        -- Purpose
        subdomain_type VARCHAR(50), -- 'lessons', 'api', 'auth', 'docs', 'blog', 'custom'
        description TEXT,

        -- DNS configuration
        record_type VARCHAR(10), -- 'A', 'CNAME'
        record_data VARCHAR(255),
        ttl INTEGER DEFAULT 3600,

        -- Deployment
        deployed BOOLEAN DEFAULT false,
        deployment_status VARCHAR(50), -- 'pending', 'deploying', 'deployed', 'failed'
        deployment_error TEXT,
        last_deployed_at TIMESTAMP,

        -- GitHub Pages integration
        github_repo VARCHAR(255),
        github_branch VARCHAR(100),

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (parent_domain) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE
      );
    `);

    console.log(chalk.green('   ✅ Created subdomains table'));
  }

  /**
   * Table 6: Deployment history
   */
  async createDeploymentHistoryTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS deployment_history (
        id SERIAL PRIMARY KEY,
        domain_name VARCHAR(255) NOT NULL,

        -- Deployment metadata
        deployment_type VARCHAR(50), -- 'initial', 'update', 'dns-change', 'content-update'
        deployment_trigger VARCHAR(50), -- 'manual', 'auto', 'scheduled', 'webhook'

        -- Changes deployed
        changes_summary TEXT,
        files_changed TEXT[],
        dns_records_updated JSONB,

        -- Status
        status VARCHAR(50), -- 'pending', 'in-progress', 'success', 'failed'
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        duration_seconds INTEGER,

        -- Error tracking
        error_message TEXT,
        error_stack TEXT,

        -- Deployment details
        deployed_by VARCHAR(255), -- 'cal-agent', 'user-123', 'github-action'
        deployment_method VARCHAR(50), -- 'github-pages', 'vercel', 'manual'
        commit_hash VARCHAR(100),

        -- Rollback support
        rollback_available BOOLEAN DEFAULT false,
        previous_deployment_id INTEGER,

        created_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (domain_name) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE,
        FOREIGN KEY (previous_deployment_id) REFERENCES deployment_history(id)
      );
    `);

    console.log(chalk.green('   ✅ Created deployment_history table'));
  }

  /**
   * Table 7: Brand configuration (synced from BRANDS_REGISTRY.json)
   */
  async createBrandConfigTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS brand_config (
        id SERIAL PRIMARY KEY,
        domain_name VARCHAR(255) UNIQUE NOT NULL,

        -- Brand identity
        brand_name VARCHAR(255) NOT NULL,
        brand_tagline TEXT,
        brand_description TEXT,

        -- Classification
        brand_tier VARCHAR(50), -- 'foundation', 'business', 'creative', 'entertainment'
        brand_type VARCHAR(50), -- 'identity', 'learning', 'privacy', 'productivity'

        -- Visual identity
        primary_color VARCHAR(7), -- #3498db
        secondary_color VARCHAR(7), -- #2ecc71
        logo_url VARCHAR(500),

        -- Tools/features
        tools TEXT[],
        features TEXT[],

        -- Revenue model
        revenue_model VARCHAR(100), -- 'SaaS ($10/mo)', 'Affiliate', 'Free + Pro'
        pricing_tiers JSONB,

        -- Social presence
        twitter_handle VARCHAR(100),
        discord_invite VARCHAR(255),
        github_org VARCHAR(100),

        -- Content strategy
        content_topics TEXT[],
        target_audience TEXT,

        -- Registry metadata
        registry_id INTEGER,
        last_synced_at TIMESTAMP DEFAULT NOW(),

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (domain_name) REFERENCES domain_hierarchy(domain_name) ON DELETE CASCADE
      );
    `);

    console.log(chalk.green('   ✅ Created brand_config table'));
  }

  /**
   * Create performance indexes
   */
  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_domain_hierarchy_parent ON domain_hierarchy(parent_domain)',
      'CREATE INDEX IF NOT EXISTS idx_domain_hierarchy_type ON domain_hierarchy(domain_type)',
      'CREATE INDEX IF NOT EXISTS idx_domain_hierarchy_status ON domain_hierarchy(status)',

      'CREATE INDEX IF NOT EXISTS idx_domain_temperature_score ON domain_temperature(total_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_domain_temperature_rating ON domain_temperature(rating_label)',

      'CREATE INDEX IF NOT EXISTS idx_newsletter_subs_domain ON newsletter_subscriptions(domain_name)',
      'CREATE INDEX IF NOT EXISTS idx_newsletter_subs_status ON newsletter_subscriptions(status)',
      'CREATE INDEX IF NOT EXISTS idx_newsletter_subs_email ON newsletter_subscriptions(email)',

      'CREATE INDEX IF NOT EXISTS idx_dns_templates_type ON dns_templates(template_type)',
      'CREATE INDEX IF NOT EXISTS idx_dns_templates_public ON dns_templates(is_public)',

      'CREATE INDEX IF NOT EXISTS idx_subdomains_parent ON subdomains(parent_domain)',
      'CREATE INDEX IF NOT EXISTS idx_subdomains_type ON subdomains(subdomain_type)',
      'CREATE INDEX IF NOT EXISTS idx_subdomains_deployed ON subdomains(deployed)',

      'CREATE INDEX IF NOT EXISTS idx_deployment_history_domain ON deployment_history(domain_name)',
      'CREATE INDEX IF NOT EXISTS idx_deployment_history_status ON deployment_history(status)'
    ];

    for (const indexSQL of indexes) {
      await this.db.query(indexSQL);
    }

    console.log(chalk.green(`   ✅ Created ${indexes.length} performance indexes`));
  }

  /**
   * Seed initial data
   */
  async seedInitialData() {
    // Seed DNS templates
    await this.db.query(`
      INSERT INTO dns_templates (template_name, description, template_type, records)
      VALUES
        ('GitHub Pages Standard', 'Standard setup for GitHub Pages with www redirect', 'brand',
         '[
           {"type": "A", "name": "@", "data": "185.199.108.153", "ttl": 3600},
           {"type": "A", "name": "@", "data": "185.199.109.153", "ttl": 3600},
           {"type": "A", "name": "@", "data": "185.199.110.153", "ttl": 3600},
           {"type": "A", "name": "@", "data": "185.199.111.153", "ttl": 3600},
           {"type": "CNAME", "name": "www", "data": "@", "ttl": 3600}
         ]'::jsonb),

        ('Brand Subdomains', 'Standard brand subdomains (lessons, api, auth, docs, blog)', 'subdomain',
         '[
           {"type": "CNAME", "name": "lessons", "data": "username.github.io", "ttl": 3600},
           {"type": "A", "name": "api", "data": "185.199.108.153", "ttl": 3600},
           {"type": "CNAME", "name": "auth", "data": "soulfra.com", "ttl": 3600},
           {"type": "CNAME", "name": "docs", "data": "username.github.io", "ttl": 3600},
           {"type": "CNAME", "name": "blog", "data": "username.github.io", "ttl": 3600}
         ]'::jsonb)
      ON CONFLICT (template_name) DO NOTHING
    `);

    console.log(chalk.green('   ✅ Seeded 2 DNS templates'));
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✅ Migration 003 Complete!\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold('\n📊 Tables Created:'));
    console.log(chalk.white('   1. domain_hierarchy - Corporate domain parent/child relationships'));
    console.log(chalk.white('   2. domain_temperature - Airbnb-style temperature ratings'));
    console.log(chalk.white('   3. newsletter_subscriptions - Per-brand email lists'));
    console.log(chalk.white('   4. dns_templates - Reusable DNS configurations'));
    console.log(chalk.white('   5. subdomains - Subdomain tracking (lessons, api, auth, etc.)'));
    console.log(chalk.white('   6. deployment_history - All deployments with rollback support'));
    console.log(chalk.white('   7. brand_config - Brand metadata from BRANDS_REGISTRY.json'));

    console.log(chalk.white.bold('\n📈 Indexes Created:'));
    console.log(chalk.white('   15 performance indexes for fast queries'));

    console.log(chalk.white.bold('\n🌟 New Capabilities:'));
    console.log(chalk.gray('   ✓ Corporate domain hierarchy (matthewmauer.com → soulfra.com → lessons.soulfra.com)'));
    console.log(chalk.gray('   ✓ Airbnb 2025-style temperature ratings (0-100 scores, HOT/WARM/COOL/COLD)'));
    console.log(chalk.gray('   ✓ Per-brand newsletter subscriptions with double opt-in'));
    console.log(chalk.gray('   ✓ DNS template library for bulk operations'));
    console.log(chalk.gray('   ✓ Subdomain tracking with deployment status'));
    console.log(chalk.gray('   ✓ Full deployment history with rollback support'));
    console.log(chalk.gray('   ✓ Brand configuration synced with BRANDS_REGISTRY.json'));

    console.log(chalk.white.bold('\n📝 Next Steps:'));
    console.log(chalk.gray('   1. Sync BRANDS_REGISTRY.json → brand_config table'));
    console.log(chalk.gray('   2. Setup root domain: matthewmauer.com'));
    console.log(chalk.gray('   3. Import 12 brands as children'));
    console.log(chalk.gray('   4. Calculate initial temperature scores'));
    console.log(chalk.gray('   5. Apply DNS templates to all domains'));

    console.log(chalk.white.bold('\n🔍 Query Examples:'));
    console.log(chalk.gray('   -- View domain hierarchy'));
    console.log(chalk.gray('   SELECT domain_name, parent_domain, hierarchy_level, status'));
    console.log(chalk.gray('   FROM domain_hierarchy ORDER BY hierarchy_level;'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('   -- Top 10 hottest domains'));
    console.log(chalk.gray('   SELECT d.domain_name, t.total_score, t.rating_label'));
    console.log(chalk.gray('   FROM domain_temperature t'));
    console.log(chalk.gray('   JOIN domain_hierarchy d ON d.domain_name = t.domain_name'));
    console.log(chalk.gray('   ORDER BY t.total_score DESC LIMIT 10;'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('   -- Newsletter subscribers per brand'));
    console.log(chalk.gray('   SELECT domain_name, COUNT(*) as subscribers'));
    console.log(chalk.gray('   FROM newsletter_subscriptions'));
    console.log(chalk.gray("   WHERE status = 'confirmed'"));
    console.log(chalk.gray('   GROUP BY domain_name ORDER BY subscribers DESC;'));

    console.log(chalk.gray('\n' + '─'.repeat(80) + '\n'));
  }
}

// CLI usage
if (require.main === module) {
  const migration = new CorporateDomainStructureMigration();
  migration.execute()
    .then(() => {
      console.log(chalk.green('✨ Migration successful!\\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = CorporateDomainStructureMigration;
