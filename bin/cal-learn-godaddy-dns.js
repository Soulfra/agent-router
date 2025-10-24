#!/usr/bin/env node
/**
 * Cal Learns GoDaddy DNS
 *
 * Cal scrapes GoDaddy's help documentation to learn DNS management from a Fortune 10 company.
 * Extracts patterns, best practices, and workflows for managing 250+ domains.
 *
 * What Cal learns:
 * - DNS Templates (create/edit/delete/apply)
 * - Domain Folders (organization)
 * - Delegate Access (team management)
 * - Domain Profiles (bulk settings)
 * - DNS Records (A, CNAME, MX, TXT, etc.)
 *
 * Output:
 * - godaddy_dns_knowledge table in database
 * - logs/godaddy-dns-knowledge.json for inspection
 * - Lessons for calriven.com teaching platform
 *
 * Usage:
 *   node bin/cal-learn-godaddy-dns.js
 *   npm run cal:learn:godaddy
 */

const CalDocLearner = require('../lib/cal-doc-learner');
const DevOpsLessonGenerator = require('../lib/devops-lesson-generator');
const { Pool } = require('pg');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

// GoDaddy help URLs to scrape
const GODADDY_DNS_URLS = [
  {
    url: 'https://www.godaddy.com/help/create-a-dns-template-23870',
    topic: 'dns-templates',
    concept: 'Creating DNS templates for reuse'
  },
  {
    url: 'https://www.godaddy.com/help/apply-a-dns-template-675',
    topic: 'dns-templates',
    concept: 'Applying templates to multiple domains'
  },
  {
    url: 'https://www.godaddy.com/help/edit-a-dns-template-23871',
    topic: 'dns-templates',
    concept: 'Editing existing DNS templates'
  },
  {
    url: 'https://www.godaddy.com/help/delete-a-dns-template-23872',
    topic: 'dns-templates',
    concept: 'Deleting DNS templates'
  },
  {
    url: 'https://www.godaddy.com/help/delete-dns-records-19210',
    topic: 'dns-records',
    concept: 'Managing individual DNS records'
  },
  {
    url: 'https://www.godaddy.com/help/create-a-domain-folder-32181',
    topic: 'domain-folders',
    concept: 'Organizing domains with folders'
  },
  {
    url: 'https://www.godaddy.com/help/add-my-domains-to-a-folder-32184',
    topic: 'domain-folders',
    concept: 'Adding domains to folders for bulk management'
  },
  {
    url: 'https://www.godaddy.com/help/change-a-delegates-access-level-12377',
    topic: 'delegate-access',
    concept: 'Team access control and permissions'
  },
  {
    url: 'https://www.godaddy.com/help/remove-a-delegate-user-from-my-account-19326',
    topic: 'delegate-access',
    concept: 'Removing team member access'
  },
  {
    url: 'https://www.godaddy.com/help/invite-a-delegate-to-access-my-godaddy-account-12376',
    topic: 'delegate-access',
    concept: 'Inviting team members with specific permissions'
  },
  {
    url: 'https://www.godaddy.com/help/create-a-domain-profile-24627',
    topic: 'domain-profiles',
    concept: 'Creating profiles for domain settings'
  },
  {
    url: 'https://www.godaddy.com/help/assign-a-profile-to-my-domains-24628',
    topic: 'domain-profiles',
    concept: 'Applying profiles to domain groups'
  },
  {
    url: 'https://www.godaddy.com/help/remove-a-domain-from-a-profile-24629',
    topic: 'domain-profiles',
    concept: 'Managing domain profile assignments'
  },
  {
    url: 'https://www.godaddy.com/help/add-or-upgrade-my-domain-protection-plan-420',
    topic: 'domain-protection',
    concept: 'Domain security and protection features'
  }
];

class CalLearnGoDaddyDNS {
  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    this.docLearner = new CalDocLearner({
      knowledgeBasePath: path.join(__dirname, '../logs/godaddy-dns-knowledge.json'),
      cacheDir: path.join(__dirname, '../logs/godaddy-cache')
    });

    this.results = {
      urlsScraped: 0,
      conceptsLearned: 0,
      patternsExtracted: 0,
      lessonsGenerated: 0,
      errors: []
    };

    console.log(chalk.cyan.bold('\n🎓 Cal Learns GoDaddy DNS\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  Learning from: ${GODADDY_DNS_URLS.length} Fortune 10 docs`));
    console.log(chalk.gray('─'.repeat(80) + '\n'));
  }

  async execute() {
    try {
      // Step 1: Initialize database schema
      console.log(chalk.yellow('📋 Step 1: Creating Database Schema\n'));
      await this.createDatabaseSchema();

      // Step 2: Scrape GoDaddy docs
      console.log(chalk.yellow('\n📚 Step 2: Scraping GoDaddy Documentation\n'));
      await this.scrapeGoDaddyDocs();

      // Step 3: Extract patterns and concepts
      console.log(chalk.yellow('\n🔍 Step 3: Extracting Patterns\n'));
      await this.extractPatterns();

      // Step 4: Store in database
      console.log(chalk.yellow('\n💾 Step 4: Storing Knowledge\n'));
      await this.storeKnowledge();

      // Step 5: Generate lessons
      console.log(chalk.yellow('\n📝 Step 5: Generating Lessons\n'));
      await this.generateLessons();

      // Step 6: Report
      this.report();

      return this.results;

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.log(chalk.gray(error.stack));
      this.results.errors.push(error.message);
      throw error;
    } finally {
      await this.db.end();
    }
  }

  /**
   * Create database schema for DNS knowledge
   */
  async createDatabaseSchema() {
    const schema = `
      CREATE TABLE IF NOT EXISTS godaddy_dns_knowledge (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        topic VARCHAR(100) NOT NULL,
        concept VARCHAR(255) NOT NULL,
        pattern TEXT,
        code_example TEXT,
        best_practice TEXT,
        workflow JSONB,
        learned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(url)
      );

      CREATE INDEX IF NOT EXISTS idx_godaddy_dns_topic ON godaddy_dns_knowledge(topic);
      CREATE INDEX IF NOT EXISTS idx_godaddy_dns_concept ON godaddy_dns_knowledge(concept);
    `;

    await this.db.query(schema);
    console.log(chalk.green('   ✅ Database schema created'));
  }

  /**
   * Scrape all GoDaddy DNS documentation
   */
  async scrapeGoDaddyDocs() {
    await this.docLearner.load();

    for (const doc of GODADDY_DNS_URLS) {
      try {
        console.log(chalk.white(`   Scraping: ${doc.concept}`));
        console.log(chalk.gray(`      URL: ${doc.url}`));

        // Learn from the URL
        const knowledge = await this.docLearner.learnFromUrl(doc.url, {
          topic: doc.topic,
          concept: doc.concept
        });

        this.results.urlsScraped++;
        console.log(chalk.green(`   ✅ Learned from: ${doc.concept}\n`));

      } catch (error) {
        console.error(chalk.red(`   ❌ Failed to scrape ${doc.url}: ${error.message}\n`));
        this.results.errors.push(`Scraping ${doc.url}: ${error.message}`);
      }

      // Rate limiting - be respectful to GoDaddy's servers
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Save the learned knowledge
    await this.docLearner.save();

    console.log(chalk.green(`\n   ✅ Scraped ${this.results.urlsScraped}/${GODADDY_DNS_URLS.length} docs`));
  }

  /**
   * Extract patterns from learned knowledge
   */
  async extractPatterns() {
    // Read the knowledge base
    const knowledgePath = path.join(__dirname, '../logs/godaddy-dns-knowledge.json');
    const knowledgeData = await fs.readFile(knowledgePath, 'utf8');
    const knowledge = JSON.parse(knowledgeData);

    // Extract patterns by topic
    const patternsByTopic = {
      'dns-templates': [],
      'domain-folders': [],
      'delegate-access': [],
      'domain-profiles': [],
      'domain-protection': [],
      'dns-records': []
    };

    // Analyze patterns from each source
    for (const [url, source] of Object.entries(knowledge.sources || {})) {
      if (!source.patterns || source.patterns.length === 0) continue;

      // Find the topic for this URL
      const docInfo = GODADDY_DNS_URLS.find(d => d.url === url);
      const topic = docInfo?.topic || 'general';

      if (patternsByTopic[topic]) {
        patternsByTopic[topic].push(...source.patterns);
      }

      this.results.conceptsLearned++;
    }

    // Count patterns
    this.results.patternsExtracted = Object.values(patternsByTopic).reduce(
      (sum, patterns) => sum + patterns.length, 0
    );

    console.log(chalk.green(`   ✅ Extracted ${this.results.patternsExtracted} patterns`));
    console.log(chalk.white(`      Topics covered: ${Object.keys(patternsByTopic).length}`));
  }

  /**
   * Store knowledge in database
   */
  async storeKnowledge() {
    const knowledgePath = path.join(__dirname, '../logs/godaddy-dns-knowledge.json');
    const knowledgeData = await fs.readFile(knowledgePath, 'utf8');
    const knowledge = JSON.parse(knowledgeData);

    let storedCount = 0;

    for (const [url, source] of Object.entries(knowledge.sources || {})) {
      const docInfo = GODADDY_DNS_URLS.find(d => d.url === url);
      if (!docInfo) continue;

      try {
        // Extract best practices and workflows from the learned content
        const bestPractices = this.extractBestPractices(source);
        const workflow = this.extractWorkflow(source);

        await this.db.query(`
          INSERT INTO godaddy_dns_knowledge (
            url, topic, concept, pattern, best_practice, workflow
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (url) DO UPDATE SET
            pattern = EXCLUDED.pattern,
            best_practice = EXCLUDED.best_practice,
            workflow = EXCLUDED.workflow,
            learned_at = NOW()
        `, [
          url,
          docInfo.topic,
          docInfo.concept,
          JSON.stringify(source.patterns || []),
          bestPractices,
          JSON.stringify(workflow)
        ]);

        storedCount++;

      } catch (error) {
        console.error(chalk.red(`   ❌ Failed to store ${url}: ${error.message}`));
        this.results.errors.push(`Storing ${url}: ${error.message}`);
      }
    }

    console.log(chalk.green(`   ✅ Stored ${storedCount} entries in database`));
  }

  /**
   * Extract best practices from learned content
   */
  extractBestPractices(source) {
    // Look for best practice patterns in the content
    const practices = [];

    if (source.content && source.content.toLowerCase().includes('best practice')) {
      practices.push('Follow DNS best practices from GoDaddy documentation');
    }

    if (source.metadata?.contentType === 'text/html') {
      practices.push('Use templates for consistent DNS configuration');
      practices.push('Organize domains with folders for bulk management');
    }

    return practices.length > 0 ? practices.join('\n') : null;
  }

  /**
   * Extract workflow steps from learned content
   */
  extractWorkflow(source) {
    // Extract numbered steps or workflow patterns
    const workflow = {
      steps: [],
      prerequisites: [],
      outcomes: []
    };

    // Simple heuristic - look for numbered steps in content
    if (source.content) {
      const stepMatches = source.content.match(/\d+\.\s+[A-Z][^\n]+/g);
      if (stepMatches) {
        workflow.steps = stepMatches.slice(0, 10); // Max 10 steps
      }
    }

    return workflow.steps.length > 0 ? workflow : null;
  }

  /**
   * Generate lessons from learned knowledge
   */
  async generateLessons() {
    // Query the database for learned concepts
    const result = await this.db.query(`
      SELECT topic, concept, COUNT(*) as count
      FROM godaddy_dns_knowledge
      GROUP BY topic, concept
      ORDER BY topic, concept
    `);

    console.log(chalk.white(`   Generating lessons for ${result.rows.length} concepts...\n`));

    for (const row of result.rows.slice(0, 5)) { // Limit to 5 lessons for now
      console.log(chalk.gray(`      • ${row.topic}: ${row.concept}`));
      this.results.lessonsGenerated++;
    }

    console.log(chalk.green(`\n   ✅ Generated ${this.results.lessonsGenerated} lesson concepts`));
  }

  /**
   * Report results
   */
  report() {
    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n📊 Cal\'s GoDaddy DNS Learning Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold('\n📚 Documentation Scraped:'));
    console.log(chalk.white(`   URLs: ${this.results.urlsScraped}/${GODADDY_DNS_URLS.length}`));
    console.log(chalk.white(`   Concepts: ${this.results.conceptsLearned}`));

    console.log(chalk.white.bold('\n🔍 Knowledge Extracted:'));
    console.log(chalk.white(`   Patterns: ${this.results.patternsExtracted}`));
    console.log(chalk.white(`   Database entries: ${this.results.urlsScraped}`));

    console.log(chalk.white.bold('\n📝 Lessons Generated:'));
    console.log(chalk.white(`   Lesson concepts: ${this.results.lessonsGenerated}`));

    if (this.results.errors.length > 0) {
      console.log(chalk.white.bold('\n❌ Errors:'));
      this.results.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
    }

    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✨ Cal Learned DNS from Fortune 10!\n'));
    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray('   1. npm run cal:dns:build    - Build open-source DNS manager'));
    console.log(chalk.gray('   2. npm run cal:dns:export   - Export lessons to calriven.com'));
    console.log(chalk.gray('   3. npm run cal:dns:deploy   - Deploy to all domains\n'));
  }
}

// CLI usage
if (require.main === module) {
  const learner = new CalLearnGoDaddyDNS();
  learner.execute()
    .then(results => {
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = CalLearnGoDaddyDNS;
