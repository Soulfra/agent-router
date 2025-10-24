#!/usr/bin/env node
/**
 * Migration 002: Enhanced GoDaddy DNS Knowledge Schema
 *
 * Adds tables for:
 * - Link graph storage (circular navigation understanding)
 * - SSL/security knowledge extraction
 * - Scraping session tracking
 * - Enhanced pattern storage
 *
 * Usage:
 *   node migrations/002-godaddy-dns-knowledge-v2.js
 */

const { Pool } = require('pg');
const chalk = require('chalk');
require('dotenv').config();

class EnhancedDNSKnowledgeMigration {
  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    console.log(chalk.cyan.bold('\n📊 Enhanced DNS Knowledge Migration\n'));
    console.log(chalk.gray('─'.repeat(80)));
  }

  async execute() {
    try {
      // Step 1: Create link storage tables
      console.log(chalk.yellow('\n📋 Step 1: Creating Link Storage Tables\n'));
      await this.createLinkTables();

      // Step 2: Create SSL knowledge table
      console.log(chalk.yellow('\n🔒 Step 2: Creating SSL Knowledge Table\n'));
      await this.createSSLKnowledgeTable();

      // Step 3: Create scraping session tracker
      console.log(chalk.yellow('\n📝 Step 3: Creating Scraping Session Tracker\n'));
      await this.createSessionTable();

      // Step 4: Enhance existing godaddy_dns_knowledge table
      console.log(chalk.yellow('\n⬆️  Step 4: Enhancing Existing Tables\n'));
      await this.enhanceExistingTables();

      // Step 5: Create indexes for performance
      console.log(chalk.yellow('\n🚀 Step 5: Creating Performance Indexes\n'));
      await this.createIndexes();

      console.log(chalk.green('\n✅ Migration Complete!\n'));
      console.log(chalk.gray('─'.repeat(80)));

      this.printSummary();

    } catch (error) {
      console.error(chalk.red('\n❌ Migration Failed:'), error.message);
      console.log(chalk.gray(error.stack));
      throw error;
    } finally {
      await this.db.end();
    }
  }

  /**
   * Create tables for link storage and graph analysis
   */
  async createLinkTables() {
    // Table 1: doc_links - Store all discovered links
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS doc_links (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        source_page TEXT NOT NULL,
        link_text VARCHAR(500),
        link_type VARCHAR(50) NOT NULL,
        depth INTEGER DEFAULT 0,
        discovered_at TIMESTAMPTZ DEFAULT NOW(),
        scraped BOOLEAN DEFAULT false,
        scraped_at TIMESTAMPTZ,
        UNIQUE(url, source_page, link_type)
      );
    `);
    console.log(chalk.green('   ✅ Created doc_links table'));

    // Table 2: doc_link_graph - Store navigation relationships
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS doc_link_graph (
        id SERIAL PRIMARY KEY,
        from_url TEXT NOT NULL,
        to_url TEXT NOT NULL,
        link_type VARCHAR(50) NOT NULL,
        context TEXT,
        weight INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(from_url, to_url, link_type)
      );
    `);
    console.log(chalk.green('   ✅ Created doc_link_graph table'));

    // Table 3: doc_navigation_patterns - Circular navigation analysis
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS doc_navigation_patterns (
        id SERIAL PRIMARY KEY,
        pattern_type VARCHAR(100) NOT NULL,
        description TEXT,
        urls JSONB NOT NULL,
        frequency INTEGER DEFAULT 1,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log(chalk.green('   ✅ Created doc_navigation_patterns table'));
  }

  /**
   * Create SSL/security knowledge table
   */
  async createSSLKnowledgeTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ssl_knowledge (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        topic VARCHAR(100) NOT NULL,
        ssl_concept VARCHAR(255) NOT NULL,
        certificate_type VARCHAR(100),
        configuration_example TEXT,
        security_level VARCHAR(50),
        common_issues JSONB,
        best_practices JSONB,
        related_urls JSONB,
        learned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(url, ssl_concept)
      );
    `);
    console.log(chalk.green('   ✅ Created ssl_knowledge table'));
  }

  /**
   * Create scraping session tracker
   */
  async createSessionTable() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS doc_scraping_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        start_url TEXT NOT NULL,
        strategy VARCHAR(50) NOT NULL,
        max_depth INTEGER DEFAULT 3,
        max_pages INTEGER DEFAULT 100,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status VARCHAR(50) DEFAULT 'running',
        stats JSONB,
        errors JSONB
      );
    `);
    console.log(chalk.green('   ✅ Created doc_scraping_sessions table'));
  }

  /**
   * Enhance existing tables
   */
  async enhanceExistingTables() {
    // Add new columns to godaddy_dns_knowledge if they don't exist
    const alterations = [
      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS parent_url TEXT`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS link_type VARCHAR(50)`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS internal_links JSONB DEFAULT '[]'::jsonb`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS external_links JSONB DEFAULT '[]'::jsonb`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS is_ssl_related BOOLEAN DEFAULT false`,

      `ALTER TABLE godaddy_dns_knowledge
       ADD COLUMN IF NOT EXISTS scraping_session_id VARCHAR(100)`
    ];

    for (const alteration of alterations) {
      try {
        await this.db.query(alteration);
      } catch (error) {
        // Column might already exist, ignore
        if (!error.message.includes('already exists')) {
          console.warn(chalk.yellow(`   ⚠️  ${error.message}`));
        }
      }
    }

    console.log(chalk.green('   ✅ Enhanced godaddy_dns_knowledge table'));
  }

  /**
   * Create performance indexes
   */
  async createIndexes() {
    const indexes = [
      // doc_links indexes
      'CREATE INDEX IF NOT EXISTS idx_doc_links_url ON doc_links(url)',
      'CREATE INDEX IF NOT EXISTS idx_doc_links_source ON doc_links(source_page)',
      'CREATE INDEX IF NOT EXISTS idx_doc_links_type ON doc_links(link_type)',
      'CREATE INDEX IF NOT EXISTS idx_doc_links_depth ON doc_links(depth)',
      'CREATE INDEX IF NOT EXISTS idx_doc_links_scraped ON doc_links(scraped)',

      // doc_link_graph indexes
      'CREATE INDEX IF NOT EXISTS idx_doc_graph_from ON doc_link_graph(from_url)',
      'CREATE INDEX IF NOT EXISTS idx_doc_graph_to ON doc_link_graph(to_url)',
      'CREATE INDEX IF NOT EXISTS idx_doc_graph_type ON doc_link_graph(link_type)',

      // ssl_knowledge indexes
      'CREATE INDEX IF NOT EXISTS idx_ssl_topic ON ssl_knowledge(topic)',
      'CREATE INDEX IF NOT EXISTS idx_ssl_concept ON ssl_knowledge(ssl_concept)',
      'CREATE INDEX IF NOT EXISTS idx_ssl_cert_type ON ssl_knowledge(certificate_type)',
      'CREATE INDEX IF NOT EXISTS idx_ssl_security_level ON ssl_knowledge(security_level)',

      // doc_scraping_sessions indexes
      'CREATE INDEX IF NOT EXISTS idx_sessions_status ON doc_scraping_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_started ON doc_scraping_sessions(started_at)',

      // godaddy_dns_knowledge enhancements
      'CREATE INDEX IF NOT EXISTS idx_godaddy_depth ON godaddy_dns_knowledge(depth)',
      'CREATE INDEX IF NOT EXISTS idx_godaddy_parent ON godaddy_dns_knowledge(parent_url)',
      'CREATE INDEX IF NOT EXISTS idx_godaddy_ssl ON godaddy_dns_knowledge(is_ssl_related)',
      'CREATE INDEX IF NOT EXISTS idx_godaddy_session ON godaddy_dns_knowledge(scraping_session_id)'
    ];

    for (const indexSQL of indexes) {
      try {
        await this.db.query(indexSQL);
      } catch (error) {
        console.warn(chalk.yellow(`   ⚠️  Index creation: ${error.message}`));
      }
    }

    console.log(chalk.green(`   ✅ Created ${indexes.length} performance indexes`));
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log(chalk.cyan.bold('\n📊 Migration Summary\n'));
    console.log(chalk.white('New Tables Created:'));
    console.log(chalk.gray('   • doc_links - Store all discovered links'));
    console.log(chalk.gray('   • doc_link_graph - Navigation relationships'));
    console.log(chalk.gray('   • doc_navigation_patterns - Circular navigation analysis'));
    console.log(chalk.gray('   • ssl_knowledge - SSL/security knowledge extraction'));
    console.log(chalk.gray('   • doc_scraping_sessions - Track scraping runs'));

    console.log(chalk.white('\nEnhanced Tables:'));
    console.log(chalk.gray('   • godaddy_dns_knowledge - Added depth, links, SSL flags'));

    console.log(chalk.white('\nCapabilities Enabled:'));
    console.log(chalk.gray('   ✓ Recursive link following with depth tracking'));
    console.log(chalk.gray('   ✓ Link graph analysis (footers, headers, nav)'));
    console.log(chalk.gray('   ✓ Circular navigation pattern detection'));
    console.log(chalk.gray('   ✓ SSL/security documentation extraction'));
    console.log(chalk.gray('   ✓ Session-based scraping with stats'));

    console.log(chalk.white('\nNext Steps:'));
    console.log(chalk.gray('   1. npm run cal:learn:godaddy:deep - Run enhanced scraper'));
    console.log(chalk.gray('   2. npm run cal:dns:build - Build DNS manager from patterns'));
    console.log(chalk.gray('   3. npm run cal:dns:deploy - Deploy to all domains\n'));
  }
}

// CLI usage
if (require.main === module) {
  const migration = new EnhancedDNSKnowledgeMigration();
  migration.execute()
    .then(() => {
      console.log(chalk.green('✨ Migration successful\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}

module.exports = EnhancedDNSKnowledgeMigration;
