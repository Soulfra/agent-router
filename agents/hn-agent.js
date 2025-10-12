/**
 * Hacker News Agent
 *
 * Specialized scraper for Hacker News that handles all page types:
 * - Front page, new, best, ask, show
 * - Discussion threads with nested comments
 * - Job postings
 * - User profiles
 * - Search results
 *
 * Normalizes HN's inconsistent layouts into structured JSON.
 */

const puppeteer = require('puppeteer');
const HNParser = require('../lib/hn-parser');
const fs = require('fs');
const path = require('path');

class HNAgent {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 30000;
    this.parser = new HNParser();
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../memory/hn-cache');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Process HN request
   * @param {string} input - User command
   * @param {object} context - Additional context
   * @returns {Promise<string>} - Result
   */
  async process(input, context = {}) {
    const lowerInput = input.toLowerCase();

    // Parse command
    if (lowerInput.includes('front page') || lowerInput.includes('homepage') || lowerInput.includes('top stories')) {
      return await this.scrapeFrontPage(context);
    }

    if (lowerInput.includes('new') || lowerInput.includes('newest')) {
      return await this.scrapeNew(context);
    }

    if (lowerInput.includes('best')) {
      return await this.scrapeBest(context);
    }

    if (lowerInput.includes('ask') || lowerInput.includes('ask hn')) {
      return await this.scrapeAsk(context);
    }

    if (lowerInput.includes('show') || lowerInput.includes('show hn')) {
      return await this.scrapeShow(context);
    }

    if (lowerInput.includes('jobs')) {
      return await this.scrapeJobs(context);
    }

    if (lowerInput.includes('thread') || lowerInput.includes('discussion') || lowerInput.includes('item')) {
      const itemId = this._extractItemId(input);
      if (itemId) {
        return await this.scrapeThread(itemId, context);
      }
    }

    if (lowerInput.includes('user') || lowerInput.includes('profile')) {
      const username = this._extractUsername(input);
      if (username) {
        return await this.scrapeUser(username, context);
      }
    }

    if (lowerInput.includes('search')) {
      const query = this._extractSearchQuery(input);
      if (query) {
        return await this.search(query, context);
      }
    }

    // Default: scrape front page
    return await this.scrapeFrontPage(context);
  }

  /**
   * Scrape HN front page
   */
  async scrapeFrontPage(context = {}) {
    const url = 'https://news.ycombinator.com/';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Front Page');
  }

  /**
   * Scrape newest stories
   */
  async scrapeNew(context = {}) {
    const url = 'https://news.ycombinator.com/newest';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Newest');
  }

  /**
   * Scrape best stories
   */
  async scrapeBest(context = {}) {
    const url = 'https://news.ycombinator.com/best';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Best');
  }

  /**
   * Scrape Ask HN
   */
  async scrapeAsk(context = {}) {
    const url = 'https://news.ycombinator.com/ask';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Ask HN');
  }

  /**
   * Scrape Show HN
   */
  async scrapeShow(context = {}) {
    const url = 'https://news.ycombinator.com/show';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Show HN');
  }

  /**
   * Scrape jobs
   */
  async scrapeJobs(context = {}) {
    const url = 'https://news.ycombinator.com/jobs';
    const data = await this._scrapeAndParse(url, context);

    return this._formatStoryList(data, 'Jobs');
  }

  /**
   * Scrape discussion thread
   */
  async scrapeThread(itemId, context = {}) {
    const url = `https://news.ycombinator.com/item?id=${itemId}`;
    const data = await this._scrapeAndParse(url, context);

    if (data.type !== 'thread') {
      return `❌ Failed to parse thread ${itemId}`;
    }

    let result = `✓ Hacker News Thread #${itemId}\n\n`;
    result += `📰 ${data.title}\n`;
    if (data.url) {
      result += `🔗 ${data.url}\n`;
    }
    result += `👤 ${data.author} | 📊 ${data.score} points | ⏰ ${data.time}\n`;

    if (data.text) {
      result += `\n${data.text}\n`;
    }

    result += `\n💬 ${data.commentsCount} comments:\n`;
    result += this._formatComments(data.comments, 0, context.maxComments || 10);

    // Cache to file if context requests
    if (context.cache) {
      this._cacheData(itemId, data);
    }

    // Return JSON if requested
    if (context.json) {
      return JSON.stringify(data, null, 2);
    }

    return result;
  }

  /**
   * Scrape user profile
   */
  async scrapeUser(username, context = {}) {
    const url = `https://news.ycombinator.com/user?id=${username}`;
    const data = await this._scrapeAndParse(url, context);

    if (data.type !== 'user') {
      return `❌ Failed to parse user ${username}`;
    }

    let result = `✓ Hacker News User: ${username}\n\n`;
    result += `📊 Karma: ${data.karma}\n`;
    result += `📅 Created: ${data.created}\n`;

    if (data.about) {
      result += `\nAbout:\n${data.about}\n`;
    }

    if (context.json) {
      return JSON.stringify(data, null, 2);
    }

    return result;
  }

  /**
   * Search Hacker News
   */
  async search(query, context = {}) {
    // HN uses Algolia for search
    const url = `https://hn.algolia.com/?q=${encodeURIComponent(query)}`;

    return `🔍 Searching HN for: "${query}"\n\n` +
           `Visit: ${url}\n\n` +
           `Note: HN search uses Algolia. For better results, use the web interface or API directly.`;
  }

  /**
   * Internal: Scrape URL and parse with Puppeteer
   */
  async _scrapeAndParse(url, context = {}) {
    let browser;
    try {
      console.log(`🕷️  Scraping HN: ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      // Set user agent to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      const html = await page.content();

      // Parse with HNParser
      const data = this.parser.parse(url, html);

      console.log(`✓ Parsed ${data.type} from HN`);

      return data;

    } catch (error) {
      console.error('HN scraping error:', error.message);
      throw error;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Internal: Format story list
   */
  _formatStoryList(data, title) {
    if (data.type !== 'story_list') {
      return `❌ Unexpected data type: ${data.type}`;
    }

    let result = `✓ Hacker News - ${title}\n`;
    result += `📊 ${data.count} stories\n\n`;

    for (const story of data.stories.slice(0, 30)) {
      result += `${story.rank}. ${story.title}\n`;
      if (story.domain) {
        result += `   🌐 ${story.domain}\n`;
      }
      result += `   👤 ${story.author || 'unknown'} | 📊 ${story.score} points | 💬 ${story.commentsCount} comments\n`;
      if (story.url) {
        result += `   🔗 ${story.url}\n`;
      }
      if (story.commentsUrl) {
        result += `   💬 ${story.commentsUrl}\n`;
      }
      result += '\n';
    }

    return result;
  }

  /**
   * Internal: Format comments tree
   */
  _formatComments(comments, indent = 0, maxComments = 10, count = { value: 0 }) {
    let result = '';

    for (const comment of comments) {
      if (count.value >= maxComments) break;

      const indentStr = '  '.repeat(indent);
      result += `${indentStr}👤 ${comment.author} (${comment.time})\n`;
      result += `${indentStr}${comment.text.substring(0, 200)}${comment.text.length > 200 ? '...' : ''}\n\n`;

      count.value++;

      if (comment.children && comment.children.length > 0) {
        result += this._formatComments(comment.children, indent + 1, maxComments, count);
      }
    }

    return result;
  }

  /**
   * Internal: Cache data to file
   */
  _cacheData(id, data) {
    const filename = `hn_${id}_${Date.now()}.json`;
    const filepath = path.join(this.cacheDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    console.log(`💾 Cached HN data: ${filepath}`);
  }

  /**
   * Internal: Extract item ID from input
   */
  _extractItemId(input) {
    const match = input.match(/\b(\d{7,})\b/);
    return match ? match[1] : null;
  }

  /**
   * Internal: Extract username from input
   */
  _extractUsername(input) {
    const match = input.match(/user[:\s]+(\w+)/i) || input.match(/@(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Internal: Extract search query from input
   */
  _extractSearchQuery(input) {
    const match = input.match(/search[:\s]+"([^"]+)"/i) ||
                  input.match(/search[:\s]+(.+)/i);
    return match ? match[1].trim() : null;
  }
}

module.exports = HNAgent;
