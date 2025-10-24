/**
 * Cal Doc Learning Orchestrator
 *
 * Teacher/Guardian orchestration layer that coordinates Cal's Fortune 10 learning:
 * - Recursive documentation scraping (links, footers, headers, SSL docs)
 * - Knowledge extraction and pattern analysis
 * - Lesson generation from learned patterns
 * - Multi-domain deployment
 * - Autonomous monitoring and updates
 *
 * Integrates:
 * - CalDocLearner - Document fetching and knowledge extraction
 * - GuardianAgent - Autonomous monitoring and fixing
 * - CalMetaOrchestrator - Multi-track coordination
 * - DocScraper - HTML parsing and link extraction
 * - DevOpsLessonGenerator - Lesson creation from patterns
 *
 * Usage:
 *   const orchestrator = new CalDocLearningOrchestrator({ db });
 *   await orchestrator.execute('learn', { startUrl: 'https://...' });
 */

const EventEmitter = require('events');
const { Pool } = require('pg');
const chalk = require('chalk');

class CalDocLearningOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.db = config.db;
    this.verbose = config.verbose || false;

    // Core systems (optional, will be created if not provided)
    this.docLearner = config.docLearner || null;
    this.guardian = config.guardian || null;
    this.metaOrchestrator = config.metaOrchestrator || null;
    this.docScraper = config.docScraper || null;
    this.lessonGenerator = config.lessonGenerator || null;

    // Orchestration state
    this.currentMode = null;
    this.currentSession = null;
    this.stats = {
      pagesScraped: 0,
      linksDiscovered: 0,
      sslPatternsFound: 0,
      lessonsGenerated: 0,
      deploymentsCompleted: 0,
      errors: []
    };

    console.log('[CalDocLearningOrchestrator] Initialized');
  }

  /**
   * Execute orchestration based on mode
   *
   * Modes:
   * - 'learn' - Scrape and extract knowledge from URLs
   * - 'teach' - Generate lessons from stored knowledge
   * - 'monitor' - Watch for documentation updates
   * - 'deploy' - Push lessons to domains
   * - 'full' - Run complete pipeline (learn → teach → deploy)
   */
  async execute(mode, options = {}) {
    this.currentMode = mode;

    console.log(chalk.cyan.bold(`\n🎓 Cal Doc Learning Orchestrator - ${mode.toUpperCase()} Mode\n`));
    console.log(chalk.gray('─'.repeat(80)));

    try {
      switch (mode) {
        case 'learn':
          return await this.runLearnMode(options);

        case 'teach':
          return await this.runTeachMode(options);

        case 'monitor':
          return await this.runMonitorMode(options);

        case 'deploy':
          return await this.runDeployMode(options);

        case 'full':
          return await this.runFullPipeline(options);

        default:
          throw new Error(`Unknown mode: ${mode}`);
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Orchestration Error:'), error.message);
      console.log(chalk.gray(error.stack));
      this.stats.errors.push(error.message);
      throw error;
    } finally {
      this.printReport();
    }
  }

  /**
   * Learn Mode: Scrape documentation and extract knowledge
   */
  async runLearnMode(options = {}) {
    const {
      startUrl,
      maxDepth = 3,
      maxPages = 100,
      strategy = 'recursive',
      extractSSL = true,
      followFooters = true,
      followHeaders = true
    } = options;

    if (!startUrl) {
      throw new Error('startUrl required for learn mode');
    }

    console.log(chalk.yellow('📚 Learn Mode: Scraping Documentation\n'));
    console.log(chalk.white(`  Start URL: ${startUrl}`));
    console.log(chalk.white(`  Strategy: ${strategy}`));
    console.log(chalk.white(`  Max Depth: ${maxDepth}`));
    console.log(chalk.white(`  Max Pages: ${maxPages}\n`));

    // Create scraping session
    this.currentSession = await this.createScrapingSession({
      startUrl,
      strategy,
      maxDepth,
      maxPages
    });

    console.log(chalk.gray(`  Session ID: ${this.currentSession.id}\n`));

    // Initialize systems if needed
    await this.ensureSystemsInitialized();

    // Execute recursive scraping
    const visited = new Set();
    const queue = [{ url: startUrl, depth: 0, parentUrl: null, linkType: 'start' }];

    while (queue.length > 0 && this.stats.pagesScraped < maxPages) {
      const { url, depth, parentUrl, linkType } = queue.shift();

      if (visited.has(url) || depth > maxDepth) {
        continue;
      }

      visited.add(url);

      try {
        console.log(chalk.white(`  [${this.stats.pagesScraped + 1}/${maxPages}] Scraping: ${url}`));
        console.log(chalk.gray(`    Depth: ${depth}, Type: ${linkType}`));

        // Scrape page
        const pageData = await this.scrapePage(url, {
          depth,
          parentUrl,
          linkType,
          extractSSL,
          sessionId: this.currentSession.id
        });

        this.stats.pagesScraped++;

        // Extract and classify links
        const links = await this.extractAndClassifyLinks(pageData, url, depth);

        // Add links to queue based on options
        for (const link of links) {
          if (visited.has(link.url)) continue;

          const shouldFollow = (
            (followFooters && link.type === 'footer') ||
            (followHeaders && link.type === 'header') ||
            link.type === 'content' ||
            link.type === 'nav' ||
            link.type === 'breadcrumb'
          );

          if (shouldFollow && depth < maxDepth) {
            queue.push({
              url: link.url,
              depth: depth + 1,
              parentUrl: url,
              linkType: link.type
            });
          }
        }

        this.stats.linksDiscovered += links.length;

        // Check for SSL/security content
        if (extractSSL && this.isSSLRelated(pageData)) {
          await this.extractSSLKnowledge(pageData);
          this.stats.sslPatternsFound++;
        }

        console.log(chalk.green(`    ✓ Links found: ${links.length}, SSL: ${this.isSSLRelated(pageData) ? 'Yes' : 'No'}\n`));

      } catch (error) {
        console.error(chalk.red(`    ✗ Error: ${error.message}\n`));
        this.stats.errors.push(`Scraping ${url}: ${error.message}`);
      }

      // Rate limiting
      await this.wait(2000);
    }

    // Complete session
    await this.completeScrapingSession(this.currentSession.id, this.stats);

    console.log(chalk.green(`\n✅ Learn Mode Complete: ${this.stats.pagesScraped} pages scraped\n`));

    return {
      success: true,
      stats: this.stats,
      sessionId: this.currentSession.id
    };
  }

  /**
   * Teach Mode: Generate lessons from stored knowledge
   */
  async runTeachMode(options = {}) {
    const {
      sessionId = null,
      topic = null,
      minPatterns = 3
    } = options;

    console.log(chalk.yellow('📝 Teach Mode: Generating Lessons\n'));

    if (!this.lessonGenerator) {
      const DevOpsLessonGenerator = require('./devops-lesson-generator');
      this.lessonGenerator = new DevOpsLessonGenerator({ db: this.db });
    }

    // Query knowledge from database
    let query = 'SELECT * FROM godaddy_dns_knowledge WHERE 1=1';
    const params = [];

    if (sessionId) {
      query += ' AND scraping_session_id = $1';
      params.push(sessionId);
    }

    if (topic) {
      query += ` AND topic = $${params.length + 1}`;
      params.push(topic);
    }

    const result = await this.db.query(query, params);
    const knowledge = result.rows;

    console.log(chalk.white(`  Found ${knowledge.length} knowledge entries\n`));

    // Group by topic
    const byTopic = knowledge.reduce((acc, entry) => {
      if (!acc[entry.topic]) acc[entry.topic] = [];
      acc[entry.topic].push(entry);
      return acc;
    }, {});

    // Generate lessons for each topic with enough patterns
    const lessons = [];

    for (const [topicName, entries] of Object.entries(byTopic)) {
      if (entries.length < minPatterns) {
        console.log(chalk.gray(`  ⏭  Skipping ${topicName}: only ${entries.length} patterns\n`));
        continue;
      }

      console.log(chalk.white(`  Generating lesson for: ${topicName} (${entries.length} patterns)`));

      try {
        // Extract patterns and create lesson
        const lesson = await this.generateLessonFromKnowledge(topicName, entries);
        lessons.push(lesson);
        this.stats.lessonsGenerated++;

        console.log(chalk.green(`    ✓ ${lesson.title}\n`));

      } catch (error) {
        console.error(chalk.red(`    ✗ Error: ${error.message}\n`));
        this.stats.errors.push(`Lesson generation for ${topicName}: ${error.message}`);
      }
    }

    console.log(chalk.green(`\n✅ Teach Mode Complete: ${lessons.length} lessons generated\n`));

    return {
      success: true,
      lessons,
      stats: this.stats
    };
  }

  /**
   * Monitor Mode: Watch for documentation updates
   */
  async runMonitorMode(options = {}) {
    const { interval = 3600000 } = options; // 1 hour default

    console.log(chalk.yellow('👁️  Monitor Mode: Watching for Updates\n'));
    console.log(chalk.white(`  Check interval: ${interval / 1000}s\n`));

    if (!this.guardian) {
      console.log(chalk.gray('  Guardian agent not available, using simple polling\n'));
    }

    // TODO: Implement monitoring loop
    // - Check for new pages on documentation site
    // - Compare with stored knowledge
    // - Alert on significant changes
    // - Auto-scrape if new content detected

    throw new Error('Monitor mode not yet implemented');
  }

  /**
   * Deploy Mode: Push lessons to domains
   */
  async runDeployMode(options = {}) {
    const { lessons = null, domains = null } = options;

    console.log(chalk.yellow('🚀 Deploy Mode: Publishing Lessons\n'));

    if (!lessons) {
      throw new Error('lessons array required for deploy mode');
    }

    // Use CalMultiDomainDeploy
    const CalMultiDomainDeploy = require('../bin/cal-multi-domain-deploy');
    const deployer = new CalMultiDomainDeploy();

    // Deploy to specified domains or all verified domains
    const domainList = domains || 'calriven.com,soulfra.com';

    console.log(chalk.white(`  Deploying ${lessons.length} lessons to: ${domainList}\n`));

    try {
      const result = await deployer.execute({ domains: domainList });
      this.stats.deploymentsCompleted = result.deployed || 0;

      console.log(chalk.green(`\n✅ Deploy Mode Complete: ${this.stats.deploymentsCompleted} domains updated\n`));

      return {
        success: true,
        deployed: this.stats.deploymentsCompleted,
        stats: this.stats
      };

    } catch (error) {
      console.error(chalk.red(`  ✗ Deployment failed: ${error.message}\n`));
      this.stats.errors.push(`Deployment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Full Pipeline: Run complete learn → teach → deploy workflow
   */
  async runFullPipeline(options = {}) {
    console.log(chalk.yellow('🔄 Full Pipeline Mode\n'));

    // Step 1: Learn
    const learnResult = await this.runLearnMode(options);

    // Step 2: Teach
    const teachResult = await this.runTeachMode({
      sessionId: learnResult.sessionId
    });

    // Step 3: Deploy (if lessons generated and publish flag set)
    if (options.publish && teachResult.lessons.length > 0) {
      await this.runDeployMode({
        lessons: teachResult.lessons,
        domains: options.domains
      });
    }

    console.log(chalk.green('\n✅ Full Pipeline Complete\n'));

    return {
      success: true,
      learn: learnResult,
      teach: teachResult,
      stats: this.stats
    };
  }

  /**
   * Scrape a single page and store in database
   */
  async scrapePage(url, options = {}) {
    const { depth, parentUrl, linkType, extractSSL, sessionId } = options;

    // Use DocScraper for HTML parsing
    if (!this.docScraper) {
      const DocScraper = require('./doc-scraper');
      this.docScraper = new DocScraper({ verbose: this.verbose });
    }

    const pageData = await this.docScraper.scrapePage(url, { extractLinks: true });

    // Store in database
    await this.db.query(`
      INSERT INTO godaddy_dns_knowledge (
        url, topic, concept, pattern, depth, parent_url,
        link_type, is_ssl_related, scraping_session_id, learned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (url) DO UPDATE SET
        depth = EXCLUDED.depth,
        parent_url = EXCLUDED.parent_url,
        link_type = EXCLUDED.link_type,
        is_ssl_related = EXCLUDED.is_ssl_related,
        learned_at = NOW()
    `, [
      url,
      this.extractTopicFromUrl(url),
      pageData.title || 'Untitled',
      JSON.stringify(pageData.sections || []),
      depth,
      parentUrl,
      linkType,
      extractSSL && this.isSSLRelated(pageData),
      sessionId
    ]);

    return pageData;
  }

  /**
   * Extract and classify all links from page
   */
  async extractAndClassifyLinks(pageData, sourceUrl, depth) {
    const links = [];

    // Classify links by where they appear
    const linkTypes = {
      footer: [],
      header: [],
      nav: [],
      breadcrumb: [],
      content: [],
      sidebar: []
    };

    // Simple heuristic: URLs in pageData.links are content links
    // TODO: Enhance DocScraper to return link types
    for (const link of pageData.links || []) {
      links.push({
        url: link,
        type: 'content',
        text: '',
        depth: depth + 1
      });
    }

    // Store links in database
    for (const link of links) {
      try {
        await this.db.query(`
          INSERT INTO doc_links (
            url, source_page, link_text, link_type, depth
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (url, source_page, link_type) DO NOTHING
        `, [link.url, sourceUrl, link.text, link.type, link.depth]);

        // Store in link graph
        await this.db.query(`
          INSERT INTO doc_link_graph (
            from_url, to_url, link_type, context
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (from_url, to_url, link_type) DO UPDATE
          SET weight = doc_link_graph.weight + 1
        `, [sourceUrl, link.url, link.type, '']);

      } catch (error) {
        // Ignore unique constraint violations
      }
    }

    this.stats.linksDiscovered += links.length;

    return links;
  }

  /**
   * Check if page is SSL/security related
   */
  isSSLRelated(pageData) {
    const sslTerms = [
      'ssl', 'tls', 'certificate', 'https', 'security',
      'encryption', 'secure', 'cert', 'ca authority'
    ];

    const content = JSON.stringify(pageData).toLowerCase();
    return sslTerms.some(term => content.includes(term));
  }

  /**
   * Extract SSL knowledge from page
   */
  async extractSSLKnowledge(pageData) {
    // TODO: Implement sophisticated SSL pattern extraction
    // For now, just store that this page has SSL content

    await this.db.query(`
      INSERT INTO ssl_knowledge (
        url, topic, ssl_concept, learned_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (url, ssl_concept) DO NOTHING
    `, [
      pageData.url,
      'ssl-configuration',
      pageData.title || 'SSL Documentation'
    ]);
  }

  /**
   * Generate lesson from knowledge entries
   */
  async generateLessonFromKnowledge(topic, entries) {
    // Group concepts and patterns
    const concepts = entries.map(e => e.concept);
    const patterns = entries.flatMap(e => {
      try {
        return JSON.parse(e.pattern || '[]');
      } catch {
        return [];
      }
    });

    const lesson = {
      id: `lesson-${topic}-${Date.now()}`,
      title: `Mastering ${topic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      topic,
      concepts,
      patterns,
      difficulty: patterns.length >= 10 ? 'advanced' : 'intermediate',
      xp: 100 + (patterns.length * 10),
      generatedAt: new Date().toISOString(),
      source: 'fortune-10-docs',
      entries: entries.length
    };

    return lesson;
  }

  /**
   * Create scraping session record
   */
  async createScrapingSession(options) {
    const sessionId = `session-${Date.now()}`;

    const result = await this.db.query(`
      INSERT INTO doc_scraping_sessions (
        session_id, start_url, strategy, max_depth, max_pages, status
      ) VALUES ($1, $2, $3, $4, $5, 'running')
      RETURNING *
    `, [
      sessionId,
      options.startUrl,
      options.strategy,
      options.maxDepth,
      options.maxPages
    ]);

    return { id: sessionId, ...result.rows[0] };
  }

  /**
   * Complete scraping session
   */
  async completeScrapingSession(sessionId, stats) {
    await this.db.query(`
      UPDATE doc_scraping_sessions
      SET completed_at = NOW(),
          status = 'completed',
          stats = $2
      WHERE session_id = $1
    `, [sessionId, JSON.stringify(stats)]);
  }

  /**
   * Extract topic from URL
   */
  extractTopicFromUrl(url) {
    // Simple heuristic: look for topic in URL path
    const match = url.match(/\/help\/([^\/\-]+)/);
    return match ? match[1] : 'general';
  }

  /**
   * Ensure all required systems are initialized
   */
  async ensureSystemsInitialized() {
    if (!this.docScraper) {
      const DocScraper = require('./doc-scraper');
      this.docScraper = new DocScraper({ verbose: this.verbose });
    }

    if (!this.lessonGenerator) {
      const DevOpsLessonGenerator = require('./devops-lesson-generator');
      this.lessonGenerator = new DevOpsLessonGenerator({ db: this.db });
    }
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print orchestration report
   */
  printReport() {
    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n📊 Orchestration Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold('\n📚 Learning:'));
    console.log(chalk.white(`   Pages scraped: ${this.stats.pagesScraped}`));
    console.log(chalk.white(`   Links discovered: ${this.stats.linksDiscovered}`));
    console.log(chalk.white(`   SSL patterns found: ${this.stats.sslPatternsFound}`));

    console.log(chalk.white.bold('\n📝 Teaching:'));
    console.log(chalk.white(`   Lessons generated: ${this.stats.lessonsGenerated}`));

    console.log(chalk.white.bold('\n🚀 Deployment:'));
    console.log(chalk.white(`   Domains deployed: ${this.stats.deploymentsCompleted}`));

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
}

module.exports = CalDocLearningOrchestrator;
