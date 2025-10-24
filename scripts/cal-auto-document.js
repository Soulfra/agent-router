#!/usr/bin/env node

/**
 * Cal Auto-Document Script
 *
 * Run Cal's autonomous documentation system:
 * - Scan codebase for new migrations, docs, legal files
 * - Update CAL-LEARNED-KNOWLEDGE.md
 * - Generate blog post
 * - Publish cross-platform (optional)
 * - Sign all legal docs with SHA-256
 *
 * Usage:
 *   node scripts/cal-auto-document.js [--publish] [--no-sign] [--verbose]
 *
 * Cron (hourly):
 *   0 * * * * cd /path/to/agent-router && node scripts/cal-auto-document.js
 */

const CalAutoDocumenter = require('../lib/cal-auto-documenter');
const { Pool } = require('pg');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  publish: args.includes('--publish'),
  noSign: args.includes('--no-sign'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (flags.help) {
  console.log(`
Cal Auto-Document Script
========================

Autonomous documentation system that learns from the codebase and publishes discoveries.

Usage:
  node scripts/cal-auto-document.js [options]

Options:
  --publish       Publish blog post to Mastodon/blog/dpaste
  --no-sign       Skip cryptographic signing of legal docs
  --verbose, -v   Show detailed logs
  --help, -h      Show this help message

Examples:
  # Basic run (scan + update docs only)
  node scripts/cal-auto-document.js

  # Full run (scan + publish + sign)
  node scripts/cal-auto-document.js --publish

  # Scan without signing
  node scripts/cal-auto-document.js --no-sign

Cron Setup (hourly):
  0 * * * * cd /path/to/agent-router && node scripts/cal-auto-document.js >> logs/cal-auto-doc.log 2>&1

Output:
  - CAL-LEARNED-KNOWLEDGE.md (updated with discoveries)
  - Blog post (if --publish)
  - Signed docs in database (if not --no-sign)
`);
  process.exit(0);
}

// Main function
async function main() {
  console.log('\n🤖 Cal Auto-Documenter Starting...\n');

  // Initialize database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Test database connection
    await pool.query('SELECT NOW()');

    // Initialize Cal Auto-Documenter
    const autoDoc = new CalAutoDocumenter({
      db: pool,
      autoPublish: flags.publish,
      autoSign: !flags.noSign,
      searchGoogle: false, // TODO: Enable when Google Search API configured
      platforms: ['mastodon', 'blog', 'dpaste'],
      schedule: 'immediate'
    });

    // Listen for events
    autoDoc.on('cycle_complete', (data) => {
      console.log('\n✅ Documentation cycle complete!\n');

      if (flags.verbose) {
        console.log('Discoveries:', JSON.stringify(data.discoveries, null, 2));
        console.log('Blog Post:', data.blogPost.title);
      }

      console.log(`Duration: ${data.duration}ms`);
      console.log(`Timestamp: ${data.timestamp}\n`);
    });

    autoDoc.on('cycle_error', (error) => {
      console.error('\n❌ Documentation cycle failed:', error.message);
      if (flags.verbose) {
        console.error(error.stack);
      }
    });

    // Run the documentation cycle
    const result = await autoDoc.run();

    // Show summary
    if (result.success) {
      console.log('\n📊 Summary:');
      console.log(`  New Migrations: ${result.discoveries.migrations.length}`);
      console.log(`  New Docs: ${result.discoveries.docs.length}`);
      console.log(`  Legal Insights: ${result.discoveries.legal.length}`);
      console.log(`  Failure Patterns: ${result.discoveries.failures.length}`);

      if (flags.publish && result.blogPost) {
        console.log(`\n📝 Blog Post: "${result.blogPost.title}"`);
        console.log(`  Tags: ${result.blogPost.tags.join(', ')}`);
      }

      if (!flags.noSign) {
        console.log(`\n🔒 Legal docs signed with SHA-256`);
      }

      console.log('\n✨ Cal has documented everything!\n');
      process.exit(0);
    } else {
      console.error('\n❌ Documentation failed:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (flags.verbose) {
      console.error(error.stack);
    }
    process.exit(1);

  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
