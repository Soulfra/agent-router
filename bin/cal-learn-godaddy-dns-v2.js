#!/usr/bin/env node
/**
 * Cal Learns GoDaddy DNS v2 - Enhanced Recursive Scraper
 *
 * Deep learning from Fortune 10 DNS documentation with:
 * - Recursive link following (footers, headers, navigation, breadcrumbs)
 * - SSL/security knowledge extraction
 * - Circular navigation pattern mapping
 * - Link graph database storage
 * - Session tracking and statistics
 *
 * Uses the Teacher/Guardian orchestration layer (CalDocLearningOrchestrator)
 *
 * Usage:
 *   # Learn from single URL (recursive)
 *   node bin/cal-learn-godaddy-dns-v2.js --url=https://www.godaddy.com/help/create-a-dns-template-23870
 *
 *   # Learn from all GoDaddy DNS URLs (deep crawl)
 *   node bin/cal-learn-godaddy-dns-v2.js --all
 *
 *   # Full pipeline (learn → teach → deploy)
 *   node bin/cal-learn-godaddy-dns-v2.js --all --teach --publish
 */

const { Pool } = require('pg');
const CalDocLearningOrchestrator = require('../lib/cal-doc-learning-orchestrator');
const chalk = require('chalk');
require('dotenv').config();

// GoDaddy DNS help URLs (starting points for deep crawl)
const GODADDY_DNS_START_URLS = [
  'https://www.godaddy.com/help/create-a-dns-template-23870',
  'https://www.godaddy.com/help/apply-a-dns-template-675',
  'https://www.godaddy.com/help/edit-a-dns-template-23871',
  'https://www.godaddy.com/help/delete-a-dns-template-23872',
  'https://www.godaddy.com/help/delete-dns-records-19210',
  'https://www.godaddy.com/help/create-a-domain-folder-32181',
  'https://www.godaddy.com/help/add-my-domains-to-a-folder-32184',
  'https://www.godaddy.com/help/change-a-delegates-access-level-12377',
  'https://www.godaddy.com/help/remove-a-delegate-user-from-my-account-19326',
  'https://www.godaddy.com/help/invite-a-delegate-to-access-my-godaddy-account-12376',
  'https://www.godaddy.com/help/create-a-domain-profile-24627',
  'https://www.godaddy.com/help/assign-a-profile-to-my-domains-24628',
  'https://www.godaddy.com/help/remove-a-domain-from-a-profile-24629',
  'https://www.godaddy.com/help/add-or-upgrade-my-domain-protection-plan-420'
];

class CalLearnGoDaddyDNSv2 {
  constructor(options = {}) {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    this.orchestrator = new CalDocLearningOrchestrator({
      db: this.db,
      verbose: options.verbose || false
    });

    this.options = options;

    console.log(chalk.cyan.bold('\n🎓 Cal Learns GoDaddy DNS v2 - Deep Learning\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  Mode: ${options.all ? 'Deep Crawl (All URLs)' : 'Single URL'}`));
    console.log(chalk.white(`  Teach: ${options.teach ? 'YES' : 'NO'}`));
    console.log(chalk.white(`  Publish: ${options.publish ? 'YES' : 'NO'}`));
    console.log(chalk.gray('─'.repeat(80) + '\n'));
  }

  async execute() {
    try {
      // Step 1: Run database migration
      console.log(chalk.yellow('📋 Step 1: Ensuring Database Schema\n'));
      await this.ensureDatabaseSchema();

      if (this.options.all) {
        // Deep crawl all starting URLs
        return await this.deepCrawlAll();
      } else if (this.options.url) {
        // Single URL deep scrape
        return await this.deepScrapeSingle(this.options.url);
      } else if (this.options.teach) {
        // Teach mode only - generate lessons from existing knowledge
        return await this.teachMode();
      } else {
        throw new Error('Must specify --url=<url> or --all or --teach');
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.gray(error.stack));
      throw error;
    } finally {
      await this.db.end();
    }
  }

  /**
   * Ensure database schema is up to date
   */
  async ensureDatabaseSchema() {
    try {
      const Migration = require('../migrations/002-godaddy-dns-knowledge-v2');
      const migration = new Migration();
      await migration.execute();
      console.log(chalk.green('   ✅ Database schema ready\n'));
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(chalk.green('   ✅ Database schema already exists\n'));
      } else {
        throw error;
      }
    }
  }

  /**
   * Deep crawl all GoDaddy DNS URLs
   */
  async deepCrawlAll() {
    console.log(chalk.yellow(`📚 Deep Crawl Mode: ${GODADDY_DNS_START_URLS.length} Starting URLs\n`));

    const allResults = {
      totalPages: 0,
      totalLinks: 0,
      totalSSL: 0,
      sessions: []
    };

    for (const url of GODADDY_DNS_START_URLS) {
      console.log(chalk.cyan.bold(`\n🔍 Starting deep crawl from: ${url}\n`));

      try {
        const result = await this.deepScrapeSingle(url);
        allResults.sessions.push(result);
        allResults.totalPages += result.stats.pagesScraped;
        allResults.totalLinks += result.stats.linksDiscovered;
        allResults.totalSSL += result.stats.sslPatternsFound;

      } catch (error) {
        console.error(chalk.red(`   ✗ Failed to crawl ${url}: ${error.message}\n`));
      }

      // Rate limiting between URLs
      await this.wait(5000);
    }

    // If teach flag set, generate lessons
    if (this.options.teach) {
      console.log(chalk.cyan.bold('\n📝 Generating Lessons from All Learned Knowledge\n'));

      const teachResult = await this.orchestrator.execute('teach', {
        minPatterns: 3
      });

      allResults.lessons = teachResult.lessons;

      // If publish flag set, deploy
      if (this.options.publish && teachResult.lessons.length > 0) {
        console.log(chalk.cyan.bold('\n🚀 Deploying Lessons to Domains\n'));

        const deployResult = await this.orchestrator.execute('deploy', {
          lessons: teachResult.lessons,
          domains: 'calriven.com,soulfra.com'
        });

        allResults.deployed = deployResult.deployed;
      }
    }

    this.printFinalReport(allResults);

    return allResults;
  }

  /**
   * Deep scrape single URL (recursive)
   */
  async deepScrapeSingle(url) {
    console.log(chalk.white(`  Start URL: ${url}`));
    console.log(chalk.white(`  Max Depth: 3`));
    console.log(chalk.white(`  Max Pages: 100\n`));

    // Use orchestrator in learn mode
    const result = await this.orchestrator.execute('learn', {
      startUrl: url,
      maxDepth: 3,
      maxPages: 100,
      strategy: 'recursive',
      extractSSL: true,
      followFooters: true,
      followHeaders: true
    });

    return result;
  }

  /**
   * Teach mode only - generate lessons from existing knowledge
   */
  async teachMode() {
    console.log(chalk.yellow('📝 Teach Mode: Generating Lessons from Stored Knowledge\n'));

    const result = await this.orchestrator.execute('teach', {
      minPatterns: 3
    });

    // If publish flag set, deploy
    if (this.options.publish && result.lessons.length > 0) {
      console.log(chalk.cyan.bold('\n🚀 Deploying Lessons to Domains\n'));

      const deployResult = await this.orchestrator.execute('deploy', {
        lessons: result.lessons,
        domains: 'calriven.com,soulfra.com'
      });

      result.deployed = deployResult.deployed;
    }

    this.printFinalReport(result);

    return result;
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print final report
   */
  printFinalReport(results) {
    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n🎓 Cal\'s GoDaddy DNS Deep Learning Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    if (results.totalPages !== undefined) {
      // Multi-URL crawl
      console.log(chalk.white.bold('\n📚 Deep Crawl Results:'));
      console.log(chalk.white(`   Starting URLs: ${GODADDY_DNS_START_URLS.length}`));
      console.log(chalk.white(`   Total pages scraped: ${results.totalPages}`));
      console.log(chalk.white(`   Total links discovered: ${results.totalLinks}`));
      console.log(chalk.white(`   SSL patterns found: ${results.totalSSL}`));
      console.log(chalk.white(`   Successful sessions: ${results.sessions.length}`));
    } else if (results.stats) {
      // Single URL scrape
      console.log(chalk.white.bold('\n📚 Scraping Results:'));
      console.log(chalk.white(`   Pages scraped: ${results.stats.pagesScraped}`));
      console.log(chalk.white(`   Links discovered: ${results.stats.linksDiscovered}`));
      console.log(chalk.white(`   SSL patterns found: ${results.stats.sslPatternsFound}`));
    }

    if (results.lessons) {
      console.log(chalk.white.bold('\n📝 Lessons Generated:'));
      console.log(chalk.white(`   Total lessons: ${results.lessons.length}`));

      results.lessons.slice(0, 5).forEach((lesson, i) => {
        console.log(chalk.gray(`   ${i + 1}. ${lesson.title} (${lesson.difficulty})`));
      });

      if (results.lessons.length > 5) {
        console.log(chalk.gray(`   ... and ${results.lessons.length - 5} more`));
      }
    }

    if (results.deployed !== undefined) {
      console.log(chalk.white.bold('\n🚀 Deployment:'));
      console.log(chalk.white(`   Domains updated: ${results.deployed}`));
    }

    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✨ Cal Learned DNS from Fortune 10!\n'));

    console.log(chalk.white('What Cal Can Do Now:'));
    console.log(chalk.gray('   • Understand DNS templates, folders, profiles'));
    console.log(chalk.gray('   • Map circular navigation in GoDaddy docs'));
    console.log(chalk.gray('   • Extract SSL/security configuration patterns'));
    console.log(chalk.gray('   • Build open-source DNS manager'));
    console.log(chalk.gray('   • Teach DNS management on calriven.com'));

    console.log(chalk.white('\nNext Steps:'));
    console.log(chalk.gray('   1. npm run cal:dns:build    - Build open-source DNS manager'));
    console.log(chalk.gray('   2. npm run cal:dns:export   - Export lessons to calriven.com'));
    console.log(chalk.gray('   3. npm run cal:dns:deploy   - Deploy to all domains'));

    console.log(chalk.white('\nQuery Link Graph:'));
    console.log(chalk.gray('   SELECT * FROM doc_link_graph WHERE from_url LIKE \'%godaddy%\';'));
    console.log(chalk.gray('   SELECT link_type, COUNT(*) FROM doc_links GROUP BY link_type;'));
    console.log(chalk.gray('   SELECT * FROM ssl_knowledge;\n'));
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    url: args.find(arg => arg.startsWith('--url='))?.split('=')[1],
    all: args.includes('--all'),
    teach: args.includes('--teach'),
    publish: args.includes('--publish'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (options.help) {
    console.log(`
Cal Learns GoDaddy DNS v2 - Enhanced Recursive Scraper
=======================================================

Deep learning from Fortune 10 DNS documentation with recursive link following.

Usage:
  node bin/cal-learn-godaddy-dns-v2.js [options]

Options:
  --url=<url>     Scrape single URL recursively (max depth 3, max 100 pages)
  --all           Deep crawl all ${GODADDY_DNS_START_URLS.length} GoDaddy DNS starting URLs
  --teach         Generate lessons after learning
  --publish       Deploy lessons to domains (requires --teach)
  --verbose, -v   Show detailed logs
  --help, -h      Show this help

Examples:
  # Learn from single URL (recursive)
  node bin/cal-learn-godaddy-dns-v2.js --url=https://www.godaddy.com/help/create-a-dns-template-23870

  # Deep crawl all DNS docs
  node bin/cal-learn-godaddy-dns-v2.js --all

  # Full pipeline (learn → teach → deploy)
  node bin/cal-learn-godaddy-dns-v2.js --all --teach --publish

  # Generate lessons from existing knowledge
  node bin/cal-learn-godaddy-dns-v2.js --teach

Features:
  ✓ Recursive link following (footers, headers, nav, breadcrumbs)
  ✓ SSL/security documentation extraction
  ✓ Link graph database storage
  ✓ Circular navigation pattern detection
  ✓ Session tracking and statistics
  ✓ Teacher/Guardian orchestration layer

Environment Variables:
  DATABASE_URL=postgresql://...  PostgreSQL connection
`);
    process.exit(0);
  }

  const learner = new CalLearnGoDaddyDNSv2(options);
  learner.execute()
    .then(() => {
      console.log(chalk.green('✨ Complete!\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = CalLearnGoDaddyDNSv2;
