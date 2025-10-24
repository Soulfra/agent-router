/**
 * CalRiven Website Operator
 *
 * Autonomous agent that runs CalRiven's daily website operations
 *
 * Features:
 * - Health checks + auto-recovery
 * - Automated article publishing (from LibrarianFacade)
 * - Comment responses (using CalRivenPersona)
 * - Analytics monitoring
 * - SEO optimization
 * - Chrome profile isolation (puppeteer)
 *
 * Use Case:
 *   CalRiven deploys this on his VPS → runs 24/7 → manages calriven.com autonomously
 */

const puppeteer = require('puppeteer');
const CalRivenPersona = require('./calriven-persona');
const LibrarianFacade = require('./librarian-facade');

class CalRivenWebsiteOperator {
  constructor(options = {}) {
    this.config = {
      websiteUrl: options.websiteUrl || process.env.CALRIVEN_WEBSITE_URL || 'http://localhost:5001',
      chromeProfilePath: options.chromeProfilePath || './chrome-profiles/calriven',

      // Operation intervals
      healthCheckInterval: options.healthCheckInterval || 300000, // 5 min
      articlePublishInterval: options.articlePublishInterval || 86400000, // 24 hours
      commentCheckInterval: options.commentCheckInterval || 600000, // 10 min
      analyticsInterval: options.analyticsInterval || 3600000, // 1 hour

      // Automation settings
      autoPublish: options.autoPublish !== false,
      autoRespond: options.autoRespond !== false,
      autoOptimize: options.autoOptimize !== false,

      // Dependencies
      db: options.db,
      llmRouter: options.llmRouter,
      librarian: options.librarian
    };

    // Initialize CalRiven persona
    this.persona = new CalRivenPersona({
      db: this.config.db,
      llmRouter: this.config.llmRouter,
      librarian: this.config.librarian,
      omniscientMode: true
    });

    this.browser = null;
    this.page = null;
    this.timers = [];
    this.isRunning = false;

    console.log('[CalRivenWebsiteOperator] Initialized for', this.config.websiteUrl);
  }

  /**
   * Start autonomous operations
   */
  async start() {
    if (this.isRunning) {
      console.log('[CalRivenWebsiteOperator] Already running');
      return;
    }

    console.log('[CalRivenWebsiteOperator] 🚀 Starting autonomous operations...');

    // Launch Chrome with isolated profile
    this.browser = await puppeteer.launch({
      headless: 'new',
      userDataDir: this.config.chromeProfilePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();

    // Set user agent (pretend to be CalRiven browsing his own site)
    await this.page.setUserAgent('CalRiven-Autonomous-Operator/1.0');

    this.isRunning = true;

    // Start operation loops
    this._startHealthChecks();
    if (this.config.autoPublish) this._startArticlePublishing();
    if (this.config.autoRespond) this._startCommentMonitoring();
    if (this.config.autoOptimize) this._startAnalyticsMonitoring();

    console.log('[CalRivenWebsiteOperator] ✅ All operations started');
  }

  /**
   * Stop autonomous operations
   */
  async stop() {
    if (!this.isRunning) return;

    console.log('[CalRivenWebsiteOperator] 🛑 Stopping operations...');

    // Clear all timers
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];

    // Close browser
    if (this.browser) await this.browser.close();

    this.isRunning = false;
    console.log('[CalRivenWebsiteOperator] Stopped');
  }

  /**
   * Health check loop
   */
  _startHealthChecks() {
    const check = async () => {
      try {
        console.log('[CalRivenWebsiteOperator] 🏥 Health check...');

        const response = await fetch(`${this.config.websiteUrl}/health`);

        if (!response.ok) {
          console.error('[CalRivenWebsiteOperator] ❌ Site unhealthy:', response.status);
          await this._attemptAutoRecovery();
        } else {
          const health = await response.json();
          console.log('[CalRivenWebsiteOperator] ✅ Site healthy:', health.status);
        }
      } catch (err) {
        console.error('[CalRivenWebsiteOperator] ❌ Health check failed:', err.message);
        await this._attemptAutoRecovery();
      }
    };

    // Run immediately, then on interval
    check();
    const timer = setInterval(check, this.config.healthCheckInterval);
    this.timers.push(timer);
  }

  /**
   * Auto-recovery if site is down
   */
  async _attemptAutoRecovery() {
    console.log('[CalRivenWebsiteOperator] 🔧 Attempting auto-recovery...');

    // Try restarting the application (assumes PM2 is running)
    try {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec('pm2 restart calriven', (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });

      console.log('[CalRivenWebsiteOperator] ✅ Application restarted');
    } catch (err) {
      console.error('[CalRivenWebsiteOperator] ❌ Auto-recovery failed:', err.message);
      // TODO: Send alert to Discord/Slack
    }
  }

  /**
   * Automated article publishing loop
   */
  _startArticlePublishing() {
    const publish = async () => {
      try {
        console.log('[CalRivenWebsiteOperator] 📝 Generating new article...');

        // Ask Librarian for trending topics in CalRiven's domain
        const topicSuggestion = await this.persona.librarian.query(
          'What should CalRiven write about next? Consider: federation, identity, AI, cryptography',
          { userId: 'calriven_autonomous' }
        );

        // Generate article using CalRiven's persona
        const article = await this._generateArticle(topicSuggestion.data);

        // Publish to database
        await this.config.db.query(
          `INSERT INTO author_articles (title, content, status, created_at)
           VALUES ($1, $2, 'published', NOW())`,
          [article.title, article.content]
        );

        console.log('[CalRivenWebsiteOperator] ✅ Article published:', article.title);
      } catch (err) {
        console.error('[CalRivenWebsiteOperator] ❌ Article publishing failed:', err.message);
      }
    };

    // Publish immediately, then daily
    publish();
    const timer = setInterval(publish, this.config.articlePublishInterval);
    this.timers.push(timer);
  }

  /**
   * Generate article using CalRiven's voice
   */
  async _generateArticle(topic) {
    const response = await this.config.llmRouter.complete({
      prompt: `You are CalRiven. Write a blog post about:

${topic}

Your style:
- Technical but accessible
- Short paragraphs, clear examples
- Build on existing work
- Values: Federation, self-sovereign identity, cryptographic signing

Title: (1-10 words)
Content: (300-500 words)

Format:
TITLE: <title>
---
<content>`,
      taskType: 'creative',
      maxTokens: 800,
      temperature: 0.8
    });

    const lines = response.text.split('\n');
    const titleLine = lines.find(l => l.startsWith('TITLE:'));
    const title = titleLine ? titleLine.replace('TITLE:', '').trim() : 'Untitled';
    const content = lines.slice(lines.indexOf('---') + 1).join('\n').trim();

    return { title, content };
  }

  /**
   * Comment monitoring loop
   */
  _startCommentMonitoring() {
    const monitor = async () => {
      try {
        console.log('[CalRivenWebsiteOperator] 💬 Checking for new comments...');

        // Get unanswered comments
        const comments = await this.config.db.query(
          `SELECT comment_id, author, body, article_id
           FROM article_comments
           WHERE replied_by_calriven = false
           ORDER BY created_at DESC
           LIMIT 10`
        );

        for (const comment of comments.rows) {
          // Get article context
          const article = await this.config.db.query(
            'SELECT title FROM author_articles WHERE article_id = $1',
            [comment.article_id]
          );

          // Generate response using CalRiven's persona
          const response = await this.persona.respondToComment(
            comment,
            { title: article.rows[0]?.title || 'Unknown' }
          );

          // Save response
          await this.config.db.query(
            `INSERT INTO article_comments (article_id, author, body, in_reply_to, created_at)
             VALUES ($1, 'CalRiven', $2, $3, NOW())`,
            [comment.article_id, response.response, comment.comment_id]
          );

          // Mark original as replied
          await this.config.db.query(
            'UPDATE article_comments SET replied_by_calriven = true WHERE comment_id = $1',
            [comment.comment_id]
          );

          console.log('[CalRivenWebsiteOperator] ✅ Responded to comment from', comment.author);
        }
      } catch (err) {
        console.error('[CalRivenWebsiteOperator] ❌ Comment monitoring failed:', err.message);
      }
    };

    const timer = setInterval(monitor, this.config.commentCheckInterval);
    this.timers.push(timer);
  }

  /**
   * Analytics monitoring loop
   */
  _startAnalyticsMonitoring() {
    const monitor = async () => {
      try {
        console.log('[CalRivenWebsiteOperator] 📊 Checking analytics...');

        // Navigate to analytics page (if exists)
        await this.page.goto(`${this.config.websiteUrl}/analytics`, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        // Screenshot for debugging
        await this.page.screenshot({
          path: './logs/analytics-screenshot.png',
          fullPage: true
        });

        // Extract metrics from page
        const metrics = await this.page.evaluate(() => {
          const pageViews = document.querySelector('[data-metric="pageviews"]')?.innerText;
          const visitors = document.querySelector('[data-metric="visitors"]')?.innerText;
          return { pageViews, visitors };
        });

        console.log('[CalRivenWebsiteOperator] 📈 Metrics:', metrics);

        // Store in database
        await this.config.db.query(
          `INSERT INTO site_analytics (date, page_views, visitors, recorded_at)
           VALUES (CURRENT_DATE, $1, $2, NOW())
           ON CONFLICT (date) DO UPDATE SET page_views = $1, visitors = $2`,
          [metrics.pageViews || 0, metrics.visitors || 0]
        );

      } catch (err) {
        console.error('[CalRivenWebsiteOperator] ❌ Analytics monitoring failed:', err.message);
      }
    };

    const timer = setInterval(monitor, this.config.analyticsInterval);
    this.timers.push(timer);
  }

  /**
   * Run one-time operation (for testing)
   */
  async runOperation(operationType) {
    switch (operationType) {
      case 'health':
        await this._startHealthChecks();
        break;
      case 'publish':
        await this._startArticlePublishing();
        break;
      case 'comments':
        await this._startCommentMonitoring();
        break;
      case 'analytics':
        await this._startAnalyticsMonitoring();
        break;
      default:
        throw new Error(`Unknown operation: ${operationType}`);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      websiteUrl: this.config.websiteUrl,
      profilePath: this.config.chromeProfilePath,
      operations: {
        healthChecks: true,
        articlePublishing: this.config.autoPublish,
        commentMonitoring: this.config.autoRespond,
        analyticsMonitoring: this.config.autoOptimize
      },
      activeTimers: this.timers.length
    };
  }
}

module.exports = CalRivenWebsiteOperator;
