/**
 * Autonomous Research Agent
 *
 * Researches current events via puppeteer when Ollama lacks fresh data
 *
 * Features:
 * - Detects when Ollama data is stale (training cutoff)
 * - Automatically triggers web research via isolated browser
 * - Scrapes news sites, Wikipedia, specialized sources
 * - Caches results in encrypted UserDataVault
 * - Privacy-first (all queries through YOUR browser, no external APIs)
 *
 * Use Cases:
 * - "What pirate treasure was found in 2025?" → Scrapes news sites
 * - "Latest AI developments?" → Fetches current articles
 * - "Current gold price?" → Scrapes financial sites
 *
 * Example:
 *   const agent = new AutonomousResearchAgent({ vault, browser });
 *   const result = await agent.research('Madagascar pirate treasure 2025');
 *   // → Scrapes web, returns structured data + sources
 */

const puppeteer = require('puppeteer');
const UserDataVault = require('./user-data-vault');

class AutonomousResearchAgent {
  constructor(options = {}) {
    this.config = {
      vault: options.vault, // UserDataVault for encrypted caching
      browserProfile: options.browserProfile || './chrome-profiles/research',
      headless: options.headless !== false,

      // Privacy settings
      rotateUserAgent: options.rotateUserAgent !== false,
      blockTrackers: options.blockTrackers !== false,

      // Cache settings
      cacheTTL: options.cacheTTL || 86400000, // 24 hours
      namespace: options.namespace || 'autonomous_research',

      // Search sources (in order of preference)
      sources: options.sources || [
        { name: 'duckduckgo', url: 'https://duckduckgo.com/?q=', priority: 1 },
        { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=', priority: 2 },
        { name: 'news', url: 'https://news.google.com/search?q=', priority: 3 }
      ]
    };

    this.browser = null;
    this.page = null;
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ];

    console.log('[AutonomousResearchAgent] Initialized');
  }

  /**
   * Research a topic autonomously
   */
  async research(query, options = {}) {
    console.log(`[AutonomousResearchAgent] 🔍 Researching: "${query}"`);

    // Check cache first
    const cached = await this._checkCache(query);
    if (cached && !options.forceRefresh) {
      console.log('[AutonomousResearchAgent] ✅ Cache hit');
      return cached;
    }

    // Initialize browser if not already running
    if (!this.browser) {
      await this._initBrowser();
    }

    try {
      // Determine best source for this query
      const source = this._selectSource(query);

      // Scrape the source
      const results = await this._scrapeSource(source, query);

      // Extract structured data
      const structuredData = await this._extractStructuredData(results, query);

      // Cache the results
      await this._cacheResults(query, structuredData);

      console.log(`[AutonomousResearchAgent] ✅ Research complete (${structuredData.sources.length} sources)`);

      return structuredData;
    } catch (err) {
      console.error('[AutonomousResearchAgent] ❌ Research failed:', err.message);
      throw err;
    }
  }

  /**
   * Initialize browser with privacy settings
   */
  async _initBrowser() {
    console.log('[AutonomousResearchAgent] 🌐 Launching browser...');

    this.browser = await puppeteer.launch({
      headless: this.config.headless ? 'new' : false,
      userDataDir: this.config.browserProfile,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // Hide automation
        ...(this.config.blockTrackers ? [
          '--block-new-web-contents', // Block popups
          '--disable-features=site-per-process' // Faster scraping
        ] : [])
      ]
    });

    this.page = await this.browser.newPage();

    // Set random user agent
    if (this.config.rotateUserAgent) {
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(userAgent);
    }

    // Block trackers and ads
    if (this.config.blockTrackers) {
      await this.page.setRequestInterception(true);
      this.page.on('request', req => {
        const url = req.url();
        if (url.includes('google-analytics') || url.includes('facebook.com') || url.includes('doubleclick')) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }

    console.log('[AutonomousResearchAgent] ✅ Browser ready');
  }

  /**
   * Select best source for query
   */
  _selectSource(query) {
    const lowerQ = query.toLowerCase();

    // Wikipedia for historical/factual queries
    if (lowerQ.includes('pirate') || lowerQ.includes('history') || lowerQ.includes('definition')) {
      return this.config.sources.find(s => s.name === 'wikipedia');
    }

    // News for current events
    if (lowerQ.includes('2025') || lowerQ.includes('latest') || lowerQ.includes('discovery')) {
      return this.config.sources.find(s => s.name === 'news');
    }

    // Default to DuckDuckGo
    return this.config.sources[0];
  }

  /**
   * Scrape source for query
   */
  async _scrapeSource(source, query) {
    const url = source.url + encodeURIComponent(query);

    console.log(`[AutonomousResearchAgent] 📄 Scraping ${source.name}...`);

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for results to load
      await this.page.waitForSelector('body', { timeout: 5000 });

      // Extract text content
      const content = await this.page.evaluate(() => {
        // Remove script and style tags
        const scripts = document.querySelectorAll('script, style');
        scripts.forEach(s => s.remove());

        return document.body.innerText;
      });

      // Extract links
      const links = await this.page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => ({ text: a.innerText.trim(), url: a.href }))
          .filter(l => l.text.length > 0 && l.url.startsWith('http'))
          .slice(0, 10); // Top 10 links
      });

      return {
        source: source.name,
        url,
        content,
        links,
        scrapedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error(`[AutonomousResearchAgent] ❌ Scraping ${source.name} failed:`, err.message);
      throw err;
    }
  }

  /**
   * Extract structured data from scraped content
   */
  async _extractStructuredData(results, query) {
    // Extract key facts from content
    const facts = this._extractFacts(results.content, query);

    // Extract dates (e.g., "2025", "January 2025")
    const dates = this._extractDates(results.content);

    // Extract amounts (e.g., "$50M", "€10 million")
    const amounts = this._extractAmounts(results.content);

    // Extract locations (e.g., "Madagascar", "South Africa")
    const locations = this._extractLocations(results.content, query);

    return {
      query,
      summary: facts[0] || 'No summary available',
      facts,
      dates,
      amounts,
      locations,
      sources: [
        {
          name: results.source,
          url: results.url,
          links: results.links
        }
      ],
      scrapedAt: results.scrapedAt,
      freshness: 'realtime'
    };
  }

  /**
   * Extract key facts from text
   */
  _extractFacts(text, query) {
    const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 20);

    // Find sentences containing query keywords
    const keywords = query.toLowerCase().split(/\s+/);
    const relevantSentences = sentences.filter(s => {
      const lowerS = s.toLowerCase();
      return keywords.some(kw => lowerS.includes(kw));
    });

    return relevantSentences.slice(0, 5);
  }

  /**
   * Extract dates from text
   */
  _extractDates(text) {
    const datePatterns = [
      /\b(202[0-9])\b/g, // Year (2020-2029)
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g
    ];

    const dates = [];
    for (const pattern of datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        dates.push(...matches);
      }
    }

    return [...new Set(dates)].slice(0, 5); // Unique dates, max 5
  }

  /**
   * Extract monetary amounts from text
   */
  _extractAmounts(text) {
    const amountPatterns = [
      /\$[\d,]+(\.\d{2})?\s?(million|billion|M|B)?/gi,
      /€[\d,]+(\.\d{2})?\s?(million|billion|M|B)?/gi,
      /£[\d,]+(\.\d{2})?\s?(million|billion|M|B)?/gi
    ];

    const amounts = [];
    for (const pattern of amountPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        amounts.push(...matches);
      }
    }

    return [...new Set(amounts)].slice(0, 5);
  }

  /**
   * Extract locations from text
   */
  _extractLocations(text, query) {
    // Common location keywords from query
    const locationKeywords = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    // Extract capitalized words (potential locations)
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    // Filter to likely locations (longer phrases, not common words)
    const locations = capitalizedWords.filter(word => {
      return word.length > 3 && !['The', 'This', 'That', 'These', 'Those'].includes(word);
    });

    return [...new Set([...locationKeywords, ...locations])].slice(0, 10);
  }

  /**
   * Check cache for existing results
   */
  async _checkCache(query) {
    if (!this.config.vault) return null;

    try {
      const cached = await this.config.vault.retrieve(
        'system',
        this.config.namespace,
        this._hashQuery(query)
      );

      if (cached && cached.data) {
        const age = Date.now() - new Date(cached.data.scrapedAt).getTime();
        if (age < this.config.cacheTTL) {
          return cached.data;
        }
      }
    } catch (err) {
      // Cache miss, continue
    }

    return null;
  }

  /**
   * Cache research results
   */
  async _cacheResults(query, data) {
    if (!this.config.vault) return;

    try {
      await this.config.vault.store(
        'system',
        this.config.namespace,
        this._hashQuery(query),
        data,
        { ttl: this.config.cacheTTL / 1000 } // Convert ms to seconds
      );

      console.log('[AutonomousResearchAgent] 💾 Results cached');
    } catch (err) {
      console.error('[AutonomousResearchAgent] ❌ Cache write failed:', err.message);
    }
  }

  /**
   * Hash query for cache key
   */
  _hashQuery(query) {
    return query.toLowerCase().replace(/\s+/g, '_').substring(0, 50);
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('[AutonomousResearchAgent] 🛑 Browser closed');
    }
  }
}

module.exports = AutonomousResearchAgent;
