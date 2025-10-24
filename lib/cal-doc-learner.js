/**
 * CAL Doc Learner
 *
 * Fetches and learns from URLs, documentation, and external resources.
 * Builds a knowledge base of patterns, best practices, and solutions.
 *
 * Example:
 *   const learner = new CalDocLearner();
 *   await learner.learnFromUrl('https://docs.example.com/api');
 *   const knowledge = await learner.query('How to handle errors?');
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

class CalDocLearner {
  constructor(options = {}) {
    this.knowledgeBasePath = options.knowledgeBasePath || path.join(__dirname, '../logs/cal-doc-knowledge.json');
    this.cacheDir = options.cacheDir || path.join(__dirname, '../logs/doc-cache');
    this.maxCacheAge = options.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7 days

    this.knowledge = {
      sources: {},       // { url: { content, patterns, lastFetched, metadata } }
      patterns: {},      // { patternId: { type, examples, sources[] } }
      topics: {},        // { topicName: { relatedSources, keyPoints[] } }
      bestPractices: [], // [{ practice, source, confidence }]
      errorSolutions: {} // { errorPattern: [{ solution, source, successRate }] }
    };

    this.loaded = false;
  }

  /**
   * Load knowledge base
   */
  async load() {
    try {
      const data = await fs.readFile(this.knowledgeBasePath, 'utf8');
      this.knowledge = JSON.parse(data);
      this.loaded = true;

      console.log('[DocLearner] Loaded doc knowledge:', {
        sources: Object.keys(this.knowledge.sources).length,
        patterns: Object.keys(this.knowledge.patterns).length,
        topics: Object.keys(this.knowledge.topics).length,
        bestPractices: this.knowledge.bestPractices.length
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[DocLearner] No existing knowledge base, starting fresh');
        this.loaded = true;
      } else {
        console.error('[DocLearner] Failed to load:', error.message);
      }
    }
  }

  /**
   * Save knowledge base
   */
  async save() {
    try {
      const dir = path.dirname(this.knowledgeBasePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.knowledgeBasePath, JSON.stringify(this.knowledge, null, 2));
      console.log('[DocLearner] Saved doc knowledge');
    } catch (error) {
      console.error('[DocLearner] Failed to save:', error.message);
    }
  }

  /**
   * Learn from a URL
   */
  async learnFromUrl(url, options = {}) {
    if (!this.loaded) await this.load();

    console.log(`[DocLearner] Learning from: ${url}`);

    try {
      // Check cache first
      const cached = await this._getCached(url);
      if (cached && !options.forceRefresh) {
        console.log('[DocLearner] Using cached content');
        return await this._analyzeContent(url, cached.content, cached.metadata);
      }

      // Fetch content
      const { content, contentType } = await this._fetchUrl(url);

      // Cache the content
      await this._cacheContent(url, content, { contentType });

      // Analyze and extract knowledge
      const analysis = await this._analyzeContent(url, content, { contentType });

      // Store in knowledge base
      this.knowledge.sources[url] = {
        content: content.substring(0, 10000), // Store first 10KB
        contentType,
        lastFetched: new Date().toISOString(),
        analysis
      };

      await this.save();

      console.log('[DocLearner] ✓ Learned from URL:', {
        url,
        patterns: analysis.patterns.length,
        topics: analysis.topics.length,
        bestPractices: analysis.bestPractices.length
      });

      return analysis;

    } catch (error) {
      console.error('[DocLearner] Failed to learn from URL:', error.message);
      throw error;
    }
  }

  /**
   * Learn from multiple URLs in batch
   */
  async learnFromUrls(urls, options = {}) {
    const results = [];

    for (const url of urls) {
      try {
        const analysis = await this.learnFromUrl(url, options);
        results.push({ url, success: true, analysis });

        // Rate limiting (be nice to servers)
        await this._wait(options.rateLimit || 1000);
      } catch (error) {
        results.push({ url, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Query knowledge base
   */
  query(searchTerm) {
    if (!this.loaded) return null;

    const results = {
      sources: [],
      patterns: [],
      bestPractices: [],
      errorSolutions: []
    };

    const lowerSearch = searchTerm.toLowerCase();

    // Search sources
    Object.entries(this.knowledge.sources).forEach(([url, data]) => {
      if (data.content.toLowerCase().includes(lowerSearch)) {
        results.sources.push({ url, relevance: this._calculateRelevance(lowerSearch, data.content) });
      }
    });

    // Search patterns
    Object.entries(this.knowledge.patterns).forEach(([patternId, pattern]) => {
      if (patternId.toLowerCase().includes(lowerSearch) ||
          JSON.stringify(pattern).toLowerCase().includes(lowerSearch)) {
        results.patterns.push(pattern);
      }
    });

    // Search best practices
    this.knowledge.bestPractices.forEach(practice => {
      if (practice.practice.toLowerCase().includes(lowerSearch)) {
        results.bestPractices.push(practice);
      }
    });

    // Search error solutions
    Object.entries(this.knowledge.errorSolutions).forEach(([errorPattern, solutions]) => {
      if (errorPattern.toLowerCase().includes(lowerSearch)) {
        results.errorSolutions.push({ errorPattern, solutions });
      }
    });

    // Sort by relevance
    results.sources.sort((a, b) => b.relevance - a.relevance);
    results.bestPractices.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Get solution for an error
   */
  getSolutionForError(errorMessage) {
    if (!this.loaded) return null;

    // Try to match error patterns
    for (const [errorPattern, solutions] of Object.entries(this.knowledge.errorSolutions)) {
      const regex = new RegExp(errorPattern, 'i');
      if (regex.test(errorMessage)) {
        return {
          pattern: errorPattern,
          solutions: solutions.sort((a, b) => b.successRate - a.successRate)
        };
      }
    }

    return null;
  }

  /**
   * Add best practice from successful approach
   */
  async addBestPractice(practice, source, confidence = 0.8) {
    if (!this.loaded) await this.load();

    // Check if already exists
    const existing = this.knowledge.bestPractices.find(p => p.practice === practice);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
    } else {
      this.knowledge.bestPractices.push({
        practice,
        sources: [source],
        confidence,
        addedAt: new Date().toISOString()
      });
    }

    await this.save();
  }

  /**
   * Add error solution
   */
  async addErrorSolution(errorPattern, solution, source, successRate = 1.0) {
    if (!this.loaded) await this.load();

    if (!this.knowledge.errorSolutions[errorPattern]) {
      this.knowledge.errorSolutions[errorPattern] = [];
    }

    this.knowledge.errorSolutions[errorPattern].push({
      solution,
      source,
      successRate,
      addedAt: new Date().toISOString()
    });

    await this.save();
  }

  /**
   * Fetch URL content
   * @private
   */
  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            content: data,
            contentType: res.headers['content-type'] || 'text/plain'
          });
        });
      }).on('error', reject);
    });
  }

  /**
   * Analyze content and extract knowledge
   * @private
   */
  async _analyzeContent(url, content, metadata) {
    const analysis = {
      patterns: [],
      topics: [],
      bestPractices: [],
      errorSolutions: [],
      codeExamples: []
    };

    // Extract code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      analysis.codeExamples.push({
        language: match[1] || 'unknown',
        code: match[2],
        source: url
      });
    }

    // Extract error patterns and solutions
    const errorSectionRegex = /(?:Error|Exception|Problem|Issue):\s*([^\n]+)\n(?:Solution|Fix|Resolution):\s*([^\n]+)/gi;
    while ((match = errorSectionRegex.exec(content)) !== null) {
      const errorPattern = match[1].trim();
      const solution = match[2].trim();

      analysis.errorSolutions.push({ errorPattern, solution });

      // Add to global knowledge
      await this.addErrorSolution(errorPattern, solution, url);
    }

    // Extract best practices (lines starting with "Best practice:", "Tip:", etc.)
    const bestPracticeRegex = /(?:Best practice|Tip|Recommendation|Prefer):\s*([^\n]+)/gi;
    while ((match = bestPracticeRegex.exec(content)) !== null) {
      const practice = match[1].trim();
      analysis.bestPractices.push(practice);

      // Add to global knowledge
      await this.addBestPractice(practice, url);
    }

    // Extract topics (headers)
    const headerRegex = /^#+\s+(.+)$/gm;
    while ((match = headerRegex.exec(content)) !== null) {
      const topic = match[1].trim();
      analysis.topics.push(topic);

      // Add to topics knowledge
      if (!this.knowledge.topics[topic]) {
        this.knowledge.topics[topic] = {
          relatedSources: [],
          keyPoints: []
        };
      }
      if (!this.knowledge.topics[topic].relatedSources.includes(url)) {
        this.knowledge.topics[topic].relatedSources.push(url);
      }
    }

    return analysis;
  }

  /**
   * Cache content to disk
   * @private
   */
  async _cacheContent(url, content, metadata) {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      const cacheKey = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

      await fs.writeFile(cachePath, JSON.stringify({
        url,
        content,
        metadata,
        cachedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('[DocLearner] Failed to cache:', error.message);
    }
  }

  /**
   * Get cached content
   * @private
   */
  async _getCached(url) {
    try {
      const cacheKey = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

      const data = await fs.readFile(cachePath, 'utf8');
      const cached = JSON.parse(data);

      // Check if cache is still fresh
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      if (age > this.maxCacheAge) {
        return null; // Cache expired
      }

      return cached;
    } catch (error) {
      return null; // Not cached
    }
  }

  /**
   * Calculate relevance score
   * @private
   */
  _calculateRelevance(searchTerm, content) {
    const lowerContent = content.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();

    // Count occurrences
    const matches = (lowerContent.match(new RegExp(lowerSearch, 'g')) || []).length;

    // Bonus for exact match
    const exactMatch = lowerContent.includes(lowerSearch) ? 0.5 : 0;

    return matches + exactMatch;
  }

  /**
   * Wait helper
   * @private
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get summary
   */
  getSummary() {
    if (!this.loaded) return null;

    return {
      totalSources: Object.keys(this.knowledge.sources).length,
      totalPatterns: Object.keys(this.knowledge.patterns).length,
      totalTopics: Object.keys(this.knowledge.topics).length,
      totalBestPractices: this.knowledge.bestPractices.length,
      totalErrorSolutions: Object.keys(this.knowledge.errorSolutions).length,
      topTopics: Object.entries(this.knowledge.topics)
        .sort((a, b) => b[1].relatedSources.length - a[1].relatedSources.length)
        .slice(0, 5)
        .map(([topic, data]) => ({
          topic,
          sources: data.relatedSources.length
        })),
      recentSources: Object.entries(this.knowledge.sources)
        .sort((a, b) => new Date(b[1].lastFetched) - new Date(a[1].lastFetched))
        .slice(0, 5)
        .map(([url, data]) => ({
          url,
          lastFetched: data.lastFetched
        }))
    };
  }
}

module.exports = CalDocLearner;
