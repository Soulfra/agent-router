/**
 * Traffic Generator
 *
 * Auto-generate traffic to boost domain stats and SEO
 *
 * Features:
 * - Cal visits launched domains via headless browser
 * - Simulates real user behavior (scroll, click, dwell time)
 * - Integrates with network-traffic-monitor for tracking
 * - Sends analytics emails via gmail-relay
 * - Boosts domain authority, generates pageviews for analytics
 *
 * Use Case: "Having a hard time generating traffic to launched domains"
 */

const puppeteer = require('puppeteer');
const axios = require('axios');

class TrafficGenerator {
  constructor(options = {}) {
    this.db = options.db;
    this.gmailRelay = options.gmailRelay;
    this.networkMonitor = options.networkMonitor;
    this.ollamaClient = options.ollamaClient;

    this.config = {
      ollamaModel: options.ollamaModel || 'mistral:latest',
      ollamaHost: options.ollamaHost || 'http://127.0.0.1:11434',
      emailRecipients: options.emailRecipients || [],

      // Traffic generation settings
      userAgents: options.userAgents || this._getDefaultUserAgents(),
      minDwellTime: options.minDwellTime || 5000, // 5 seconds
      maxDwellTime: options.maxDwellTime || 30000, // 30 seconds
      scrollDepth: options.scrollDepth || 0.7, // Scroll to 70% of page
      clickProbability: options.clickProbability || 0.3, // 30% chance to click links

      // Session settings
      headless: options.headless !== false,
      viewport: options.viewport || { width: 1920, height: 1080 },

      // Rate limiting
      maxVisitsPerDomain: options.maxVisitsPerDomain || 10, // Per hour
      visitInterval: options.visitInterval || 60000 // 1 minute between visits
    };

    // Visit tracking
    this.visitHistory = new Map(); // domain -> [timestamps]
    this.sessions = []; // Active browser sessions

    console.log('[TrafficGenerator] Initialized');
    console.log(`  User Agents: ${this.config.userAgents.length}`);
    console.log(`  Dwell Time: ${this.config.minDwellTime}-${this.config.maxDwellTime}ms`);
  }

  /**
   * Generate traffic to a domain
   */
  async generateTraffic(domain, options = {}) {
    const visits = options.visits || 1;
    const delay = options.delay || this.config.visitInterval;

    console.log(`[TrafficGenerator] Generating ${visits} visits to ${domain}`);

    // Check rate limits
    if (!this._checkRateLimit(domain, visits)) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        limit: this.config.maxVisitsPerDomain
      };
    }

    const results = [];

    for (let i = 0; i < visits; i++) {
      const result = await this._visit(domain, options);
      results.push(result);

      // Track visit
      this._trackVisit(domain);

      // Delay between visits
      if (i < visits - 1) {
        await this._sleep(delay);
      }
    }

    // Send summary report
    await this._sendTrafficReport(domain, results);

    return {
      success: true,
      visits: results.length,
      results
    };
  }

  /**
   * Visit a domain (simulate real user)
   */
  async _visit(domain, options = {}) {
    let browser = null;

    try {
      // Launch browser
      browser = await puppeteer.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security'
        ]
      });

      const page = await browser.newPage();

      // Set random user agent
      const userAgent = this._randomUserAgent();
      await page.setUserAgent(userAgent);

      // Set viewport
      await page.setViewport(this.config.viewport);

      // Navigate to page
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      console.log(`[TrafficGenerator] Visiting: ${url}`);

      const startTime = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const loadTime = Date.now() - startTime;

      // Simulate human behavior
      await this._simulateHumanBehavior(page);

      // Extract page data
      const pageData = await this._extractPageData(page);

      // Analyze with Ollama
      const analysis = await this._analyzePageWithOllama(pageData, url);

      const visitData = {
        url,
        userAgent,
        statusCode: response.status(),
        loadTime,
        dwellTime: Date.now() - startTime - loadTime,
        pageData,
        analysis,
        timestamp: new Date().toISOString()
      };

      // Store visit
      await this._storeVisit(visitData);

      await browser.close();

      return {
        success: true,
        data: visitData
      };

    } catch (error) {
      if (browser) await browser.close();

      console.error('[TrafficGenerator] Visit error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Simulate human-like behavior on page
   */
  async _simulateHumanBehavior(page) {
    // Random dwell time
    const dwellTime = this._randomInt(this.config.minDwellTime, this.config.maxDwellTime);

    // Scroll through page
    const scrollSteps = 5;
    const scrollDelay = dwellTime / scrollSteps;

    for (let i = 0; i < scrollSteps; i++) {
      const scrollDepth = (i + 1) / scrollSteps * this.config.scrollDepth;
      await page.evaluate((depth) => {
        window.scrollTo(0, document.body.scrollHeight * depth);
      }, scrollDepth);

      await this._sleep(scrollDelay);
    }

    // Random clicks (30% probability)
    if (Math.random() < this.config.clickProbability) {
      try {
        const links = await page.$$('a');
        if (links.length > 0) {
          const randomLink = links[this._randomInt(0, links.length - 1)];
          await randomLink.click();
          await this._sleep(2000); // Wait after click
        }
      } catch (error) {
        // Click might navigate away, that's ok
      }
    }

    // Scroll back up
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await this._sleep(1000);
  }

  /**
   * Extract page data
   */
  async _extractPageData(page) {
    return await page.evaluate(() => {
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || null,
        h1: document.querySelector('h1')?.textContent || null,
        linkCount: document.querySelectorAll('a').length,
        imageCount: document.querySelectorAll('img').length,
        wordCount: document.body.textContent.split(/\s+/).length,
        hasAnalytics: !!(window.gtag || window.ga || window._gaq),
        hasChatbot: !!document.querySelector('[class*="chat"], [id*="chat"]')
      };
    });
  }

  /**
   * Analyze page with Ollama
   */
  async _analyzePageWithOllama(pageData, url) {
    const prompt = `Analyze this website visit:

URL: ${url}
Title: ${pageData.title}
Description: ${pageData.description}
H1: ${pageData.h1}
Links: ${pageData.linkCount}
Images: ${pageData.imageCount}
Word Count: ${pageData.wordCount}
Has Analytics: ${pageData.hasAnalytics}
Has Chatbot: ${pageData.hasChatbot}

Provide:
1. Page Quality (low/medium/high)
2. SEO Assessment (good/needs work)
3. Engagement Potential (low/medium/high)
4. Improvement Ideas (3 quick wins)

Be concise.`;

    try {
      const response = await axios.post(`${this.config.ollamaHost}/api/generate`, {
        model: this.config.ollamaModel,
        prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      return `Analysis unavailable: ${error.message}`;
    }
  }

  /**
   * Store visit data
   */
  async _storeVisit(visitData) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO traffic_generation (
          url,
          user_agent,
          status_code,
          load_time_ms,
          dwell_time_ms,
          page_data,
          analysis,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `, [
        visitData.url,
        visitData.userAgent,
        visitData.statusCode,
        visitData.loadTime,
        visitData.dwellTime,
        JSON.stringify(visitData.pageData),
        visitData.analysis
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.warn('[TrafficGenerator] Failed to store visit:', error.message);
      return null;
    }
  }

  /**
   * Send traffic report via email
   */
  async _sendTrafficReport(domain, results) {
    if (!this.gmailRelay || this.config.emailRecipients.length === 0) return;

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const avgLoadTime = results
      .filter(r => r.success && r.data)
      .reduce((sum, r) => sum + r.data.loadTime, 0) / successful || 0;

    const avgDwellTime = results
      .filter(r => r.success && r.data)
      .reduce((sum, r) => sum + r.data.dwellTime, 0) / successful || 0;

    const subject = `Traffic Generation Report: ${domain}`;
    const body = `
Traffic Generation Summary

Domain: ${domain}
Total Visits: ${results.length}
Successful: ${successful}
Failed: ${failed}

📊 Metrics:
Avg Load Time: ${Math.round(avgLoadTime)}ms
Avg Dwell Time: ${Math.round(avgDwellTime)}ms

🤖 AI Insights:
${results[0]?.data?.analysis || 'No analysis available'}

📈 View Full Report: http://localhost:5001/api/auto-analytics/traffic?domain=${encodeURIComponent(domain)}

---
Auto-generated by Traffic Generator
`;

    for (const recipient of this.config.emailRecipients) {
      try {
        await this.gmailRelay.send({
          userId: 'cal',
          to: recipient,
          subject,
          body
        });
      } catch (error) {
        console.error('[TrafficGenerator] Email failed:', error.message);
      }
    }
  }

  /**
   * Check rate limit for domain
   */
  _checkRateLimit(domain, requestedVisits) {
    if (!this.visitHistory.has(domain)) {
      return true;
    }

    const visits = this.visitHistory.get(domain);
    const oneHourAgo = Date.now() - 3600000;

    // Count visits in last hour
    const recentVisits = visits.filter(t => t > oneHourAgo).length;

    return (recentVisits + requestedVisits) <= this.config.maxVisitsPerDomain;
  }

  /**
   * Track visit timestamp
   */
  _trackVisit(domain) {
    if (!this.visitHistory.has(domain)) {
      this.visitHistory.set(domain, []);
    }

    this.visitHistory.get(domain).push(Date.now());

    // Clean old timestamps (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    const visits = this.visitHistory.get(domain);
    this.visitHistory.set(domain, visits.filter(t => t > oneHourAgo));
  }

  /**
   * Get default user agents
   */
  _getDefaultUserAgents() {
    return [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Random user agent
   */
  _randomUserAgent() {
    return this.config.userAgents[
      this._randomInt(0, this.config.userAgents.length - 1)
    ];
  }

  /**
   * Random integer between min and max (inclusive)
   */
  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Sleep for ms
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get traffic summary
   */
  async getSummary(domain = null, limit = 20) {
    if (!this.db) {
      return {
        success: false,
        error: 'Database not available'
      };
    }

    try {
      let query = `
        SELECT
          url,
          status_code,
          load_time_ms,
          dwell_time_ms,
          created_at
        FROM traffic_generation
      `;

      const params = [];

      if (domain) {
        query += ` WHERE url LIKE $1`;
        params.push(`%${domain}%`);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return {
        success: true,
        visits: result.rows
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TrafficGenerator;
