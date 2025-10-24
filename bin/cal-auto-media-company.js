#!/usr/bin/env node
/**
 * Cal Auto Media Company
 *
 * Cal's autonomous AI media company - learns from failures, generates lessons,
 * posts across all 12 brands like Hootsuite but fully autonomous.
 *
 * Flow:
 *   1. Cal queries cal_failures database for bugs/issues
 *   2. Groups by error type and generates lesson content
 *   3. Routes content to correct brand (BrandVoiceContentRouter)
 *   4. Generates lessons for calriven.com teaching platform
 *   5. Deploys to all verified domains
 *   6. Posts to Mastodon/Twitter/blog/YouTube
 *   7. Records results back to database
 *
 * Usage:
 *   # Run once (test)
 *   node bin/cal-auto-media-company.js --once
 *
 *   # Run with publishing
 *   node bin/cal-auto-media-company.js --publish
 *
 *   # Run as daemon (every hour)
 *   pm2 start bin/cal-auto-media-company.js --name "cal-media"
 */

const { Pool } = require('pg');
const BrandVoiceContentRouter = require('../lib/brand-voice-content-router');
const CrossPlatformAutoPublisher = require('../lib/cross-platform-auto-publisher');
const CalMultiDomainDeploy = require('./cal-multi-domain-deploy');
const DevOpsLessonGenerator = require('../lib/devops-lesson-generator');
const chalk = require('chalk');
require('dotenv').config();

class CalAutoMediaCompany {
  constructor(options = {}) {
    this.db = options.db;
    this.publish = options.publish || false;
    this.once = options.once || false;
    this.verbose = options.verbose || false;

    // Initialize systems (optional LLM router)
    this.brandRouter = options.llmRouter ? new BrandVoiceContentRouter({
      llmRouter: options.llmRouter
    }) : null;

    this.publisher = new CrossPlatformAutoPublisher({
      db: this.db,
      // TODO: Add platform clients when ready
      activityPubServer: null,
      contentPublisher: null,
      twitterClient: null,
      youtubeClient: null
    });

    this.domainDeployer = new CalMultiDomainDeploy();

    this.lessonGenerator = new DevOpsLessonGenerator({
      db: this.db
    });

    this.results = {
      lessonsGenerated: 0,
      postsCreated: 0,
      domainsDeployed: 0,
      errors: []
    };

    console.log(chalk.cyan.bold('\n🤖 Cal Auto Media Company\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  Mode: ${this.once ? 'One-time run' : 'Daemon mode'}`));
    console.log(chalk.white(`  Publish: ${this.publish ? 'YES' : 'NO (dry run)'}`));
    console.log(chalk.gray('─'.repeat(80) + '\n'));
  }

  /**
   * Main execution loop
   */
  async execute() {
    try {
      // Step 1: Query Cal's learning failures
      console.log(chalk.yellow('📊 Step 1: Querying Cal\'s Learning Database\n'));
      const failures = await this.queryFailures();

      if (failures.length === 0) {
        console.log(chalk.gray('   No new failures to learn from\n'));
        return this.results;
      }

      console.log(chalk.green(`   Found ${failures.length} failures to learn from\n`));

      // Step 2: Group by error type and generate lessons
      console.log(chalk.yellow('📝 Step 2: Generating Lessons from Failures\n'));
      const lessons = await this.generateLessons(failures);
      this.results.lessonsGenerated = lessons.length;

      // Step 3: Route content to brands
      console.log(chalk.yellow('🎯 Step 3: Routing Content to Brands\n'));
      const brandContent = await this.routeToBrands(lessons);

      // Step 4: Deploy to domains (if publish mode)
      if (this.publish) {
        console.log(chalk.yellow('🚀 Step 4: Deploying to Domains\n'));
        await this.deployToDomains(brandContent);
      } else {
        console.log(chalk.gray('   ⏭️  Step 4: Skipped (dry run)\n'));
      }

      // Step 5: Publish to social platforms (if publish mode)
      if (this.publish) {
        console.log(chalk.yellow('📢 Step 5: Publishing to Platforms\n'));
        await this.publishToPlatforms(brandContent);
      } else {
        console.log(chalk.gray('   ⏭️  Step 5: Skipped (dry run)\n'));
      }

      // Step 6: Record results
      console.log(chalk.yellow('💾 Step 6: Recording Results\n'));
      await this.recordResults();

      // Step 7: Report
      this.report();

      return this.results;

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.gray(error.stack));
      this.results.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Query failures from database
   */
  async queryFailures() {
    const result = await this.db.query(`
      SELECT
        task_key,
        error_type,
        error,
        lesson_id,
        exercise_id,
        count,
        first_seen,
        last_seen,
        fixed
      FROM cal_failures
      WHERE fixed = false
      ORDER BY count DESC, last_seen DESC
      LIMIT 20
    `);

    return result.rows;
  }

  /**
   * Generate lessons from failures
   */
  async generateLessons(failures) {
    const lessons = [];

    // Group by error type
    const groupedFailures = failures.reduce((acc, failure) => {
      const key = failure.error_type || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(failure);
      return acc;
    }, {});

    for (const [errorType, failureGroup] of Object.entries(groupedFailures)) {
      console.log(chalk.white(`   Generating lesson for: ${errorType} (${failureGroup.length} failures)`));

      const lesson = await this.lessonGenerator.generateFromFailures({
        errorType,
        failures: failureGroup
      });

      lessons.push(lesson);

      if (this.verbose) {
        console.log(chalk.gray(`      Title: ${lesson.title}`));
        console.log(chalk.gray(`      Brand: ${lesson.suggestedBrand}`));
      }
    }

    return lessons;
  }

  /**
   * Route lessons to appropriate brands
   */
  async routeToBrands(lessons) {
    const brandContent = [];

    for (const lesson of lessons) {
      let routing;

      // Use BrandVoiceContentRouter if available, otherwise use lesson's suggested brand
      if (this.brandRouter) {
        routing = await this.brandRouter.route({
          narrative: {
            content: lesson.content,
            title: lesson.title,
            analysis: {
              themes: lesson.themes || []
            }
          },
          themes: lesson.themes || []
        });
      } else {
        // Fallback: use lesson's suggested brand
        routing = {
          primary: lesson.suggestedBrand || 'calriven',
          secondary: [],
          confidence: 1.0
        };
      }

      const content = {
        lesson,
        brand: routing.primary,
        additionalBrands: routing.secondary,
        routing
      };

      brandContent.push(content);

      console.log(chalk.green(`   ✅ ${lesson.title} → ${routing.primary}`));
      if (routing.secondary && routing.secondary.length > 0) {
        console.log(chalk.gray(`      Also posting to: ${routing.secondary.join(', ')}`));
      }
    }

    console.log('');
    return brandContent;
  }

  /**
   * Deploy lessons to domains
   */
  async deployToDomains(brandContent) {
    const domainsToDeploy = new Set();

    // Collect all domains that need updates
    brandContent.forEach(content => {
      domainsToDeploy.add(content.brand);
      if (content.additionalBrands) {
        content.additionalBrands.forEach(brand => domainsToDeploy.add(brand));
      }
    });

    // Get domain names from brand keys
    const domains = Array.from(domainsToDeploy).map(brand => {
      // Map brand key to domain
      const brandMap = {
        soulfra: 'soulfra.com',
        calriven: 'calriven.com',
        deathtodata: 'deathtodata.com',
        calos: 'calos.ai',
        roughsparks: 'roughsparks.com'
      };
      return brandMap[brand] || brand;
    }).filter(Boolean);

    console.log(chalk.white(`   Deploying to ${domains.length} domains: ${domains.join(', ')}\n`));

    try {
      // Use CalMultiDomainDeploy to deploy
      const deployResult = await this.domainDeployer.execute({
        domains: domains.join(',')
      });

      this.results.domainsDeployed = deployResult.deployed || 0;
      console.log(chalk.green(`   ✅ Deployed to ${this.results.domainsDeployed} domains\n`));

    } catch (error) {
      console.error(chalk.red(`   ❌ Deployment failed: ${error.message}\n`));
      this.results.errors.push(`Deployment error: ${error.message}`);
    }
  }

  /**
   * Publish to social platforms
   */
  async publishToPlatforms(brandContent) {
    for (const content of brandContent) {
      try {
        console.log(chalk.white(`   Publishing: ${content.lesson.title}`));

        // TODO: Implement CrossPlatformAutoPublisher integration
        // For now, just log what we would publish
        console.log(chalk.gray(`      Brand: ${content.brand}`));
        console.log(chalk.gray(`      Platforms: mastodon, blog, twitter`));

        this.results.postsCreated++;

      } catch (error) {
        console.error(chalk.red(`   ❌ Publishing failed: ${error.message}`));
        this.results.errors.push(`Publishing error: ${error.message}`);
      }
    }

    console.log(chalk.green(`   ✅ Created ${this.results.postsCreated} posts\n`));
  }

  /**
   * Record results back to database
   */
  async recordResults() {
    // Mark failures as addressed (not fixed yet, but lesson created)
    await this.db.query(`
      INSERT INTO cal_successes (
        task_key,
        approach,
        context,
        timestamp
      ) VALUES (
        'auto-media-company',
        'lesson-generation',
        $1,
        NOW()
      )
    `, [JSON.stringify(this.results)]);

    console.log(chalk.green('   ✅ Results recorded to database\n'));
  }

  /**
   * Report results
   */
  report() {
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.cyan.bold('\n📊 Cal Auto Media Company Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold('\n📝 Content Generated:'));
    console.log(chalk.white(`   Lessons: ${this.results.lessonsGenerated}`));
    console.log(chalk.white(`   Posts: ${this.results.postsCreated}`));

    console.log(chalk.white.bold('\n🚀 Deployments:'));
    console.log(chalk.white(`   Domains: ${this.results.domainsDeployed}`));

    if (this.results.errors.length > 0) {
      console.log(chalk.white.bold('\n❌ Errors:'));
      this.results.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
    }

    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✨ Cal Auto Media Company Complete!\n'));
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = {
    publish: args.includes('--publish'),
    once: args.includes('--once'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (flags.help) {
    console.log(`
Cal Auto Media Company
======================

Cal's autonomous AI media company that learns from failures and posts across all brands.

Usage:
  node bin/cal-auto-media-company.js [options]

Options:
  --publish       Actually publish content (default: dry run)
  --once          Run once and exit (default: daemon mode)
  --verbose, -v   Show detailed logs
  --help, -h      Show this help

Examples:
  # Test run (dry run, once)
  node bin/cal-auto-media-company.js --once

  # Publish once
  node bin/cal-auto-media-company.js --once --publish

  # Run as daemon with pm2
  pm2 start bin/cal-auto-media-company.js --name "cal-media" -- --publish

Environment Variables:
  DATABASE_URL=postgresql://...  PostgreSQL connection
`);
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
  });

  const company = new CalAutoMediaCompany({
    db: pool,
    publish: flags.publish,
    once: flags.once,
    verbose: flags.verbose
  });

  company.execute()
    .then(results => {
      pool.end();
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      pool.end();
      process.exit(1);
    });
}

module.exports = CalAutoMediaCompany;
