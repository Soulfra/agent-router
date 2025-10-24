/**
 * CalRiven Autonomous Mode
 *
 * Allows CalRiven to autonomously research topics, query models, and cache results.
 * Runs in background - CalRiven appears to "already know" answers before users ask.
 *
 * Features:
 * - Self-triggered queries (trending topics, scheduled research)
 * - Multi-model comparison (uses ModelReasoningComparator)
 * - Privacy-first (queries logged to encrypted vault, not console)
 * - Obfuscation (uses local Ollama models for sensitive queries)
 * - Analytics integration (researches top user searches)
 *
 * Use Cases:
 * - CalRiven researches trending topics daily
 * - Pre-caches answers to common questions
 * - Appears omniscient (already has answers when users ask)
 * - Keeps knowledge fresh (auto-updates stale data)
 *
 * Example:
 *   const autonomousMode = new CalRivenAutonomousMode({ calriven, comparator, vault });
 *   await autonomousMode.start(); // Runs in background
 *   // CalRiven now autonomously researches topics
 */

const ModelReasoningComparator = require('./model-reasoning-comparator');
const AutonomousResearchAgent = require('./autonomous-research-agent');

class CalRivenAutonomousMode {
  constructor(options = {}) {
    this.config = {
      calriven: options.calriven, // CalRivenPersona instance
      comparator: options.comparator, // ModelReasoningComparator
      vault: options.vault, // UserDataVault for encrypted storage
      db: options.db,

      // Autonomous behavior
      enabled: options.enabled !== false,
      researchInterval: options.researchInterval || 3600000, // 1 hour
      maxQueriesPerHour: options.maxQueriesPerHour || 10,

      // Privacy settings
      useLocalModelsOnly: options.useLocalModelsOnly || false, // Ollama only
      obfuscateQueries: options.obfuscateQueries || false,
      logToConsole: options.logToConsole || false, // Disable console logs for privacy

      // Topic sources
      enableTrendingTopics: options.enableTrendingTopics !== false,
      enableUserAnalytics: options.enableUserAnalytics !== false,
      enableScheduledTopics: options.enableScheduledTopics !== false
    };

    // Query queue
    this.queryQueue = [];
    this.queriesThisHour = 0;
    this.lastHourReset = Date.now();

    // Background interval
    this.interval = null;

    this.log('[CalRivenAutonomousMode] Initialized' + (this.config.useLocalModelsOnly ? ' (LOCAL MODELS ONLY)' : ''));
  }

  /**
   * Start autonomous mode
   */
  async start() {
    if (!this.config.enabled) {
      this.log('[CalRivenAutonomousMode] Disabled in config, not starting');
      return;
    }

    this.log('[CalRivenAutonomousMode] 🐉 Starting autonomous mode...');

    // Initial research
    await this._runResearchCycle();

    // Schedule recurring research
    this.interval = setInterval(async () => {
      await this._runResearchCycle();
    }, this.config.researchInterval);

    this.log('[CalRivenAutonomousMode] ✅ Autonomous mode started (interval: ' + (this.config.researchInterval / 1000) + 's)');
  }

  /**
   * Stop autonomous mode
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.log('[CalRivenAutonomousMode] Stopped');
  }

  /**
   * Manually trigger research on a topic
   */
  async researchTopic(topic, options = {}) {
    this.log(`[CalRivenAutonomousMode] Manual research trigger: "${topic}"`);

    return await this._executeTopic(topic, {
      priority: 'high',
      ...options
    });
  }

  /**
   * Get CalRiven's cached knowledge on a topic
   */
  async getCachedKnowledge(topic) {
    if (!this.config.vault) {
      return null;
    }

    const cacheKey = this._generateCacheKey(topic);

    try {
      const cached = await this.config.vault.retrieve(
        'calriven_autonomous',
        'research',
        cacheKey
      );

      if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
        this.log(`[CalRivenAutonomousMode] Cache hit: "${topic}"`);
        return cached;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Run research cycle
   */
  async _runResearchCycle() {
    // Reset hourly limit
    if (Date.now() - this.lastHourReset >= 3600000) {
      this.queriesThisHour = 0;
      this.lastHourReset = Date.now();
    }

    // Check rate limit
    if (this.queriesThisHour >= this.config.maxQueriesPerHour) {
      this.log('[CalRivenAutonomousMode] Rate limit reached, skipping cycle');
      return;
    }

    this.log('[CalRivenAutonomousMode] 🔍 Running research cycle...');

    // Collect topics to research
    const topics = await this._collectTopics();

    this.log(`[CalRivenAutonomousMode] Found ${topics.length} topics to research`);

    // Research each topic (up to rate limit)
    for (const topic of topics) {
      if (this.queriesThisHour >= this.config.maxQueriesPerHour) {
        this.log('[CalRivenAutonomousMode] Rate limit reached, stopping cycle');
        break;
      }

      await this._executeTopic(topic.query, topic);
      this.queriesThisHour++;
    }

    this.log(`[CalRivenAutonomousMode] ✅ Research cycle complete (${this.queriesThisHour}/${this.config.maxQueriesPerHour} queries used)`);
  }

  /**
   * Collect topics to research
   */
  async _collectTopics() {
    const topics = [];

    // 1. Trending topics (from external sources)
    if (this.config.enableTrendingTopics) {
      const trending = await this._getTrendingTopics();
      topics.push(...trending);
    }

    // 2. User analytics (top searches)
    if (this.config.enableUserAnalytics && this.config.db) {
      const analytics = await this._getUserSearchAnalytics();
      topics.push(...analytics);
    }

    // 3. Scheduled topics (predefined list)
    if (this.config.enableScheduledTopics) {
      const scheduled = this._getScheduledTopics();
      topics.push(...scheduled);
    }

    // Deduplicate
    const unique = [];
    const seen = new Set();

    for (const topic of topics) {
      const key = topic.query.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(topic);
      }
    }

    // Prioritize
    unique.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'];
    });

    return unique;
  }

  /**
   * Execute research on a topic
   */
  async _executeTopic(query, options = {}) {
    const startTime = Date.now();

    this.log(`[CalRivenAutonomousMode] 🔬 Researching: "${query}"`);

    try {
      // Check cache first
      const cached = await this.getCachedKnowledge(query);
      if (cached && !options.forceRefresh) {
        this.log(`[CalRivenAutonomousMode] Using cached result for "${query}"`);
        return cached;
      }

      // Create researcher
      const researcher = new AutonomousResearchAgent({ vault: this.config.vault });

      // Configure models (local-only if enabled)
      let models = undefined; // Use default models

      if (this.config.useLocalModelsOnly) {
        models = [
          { provider: 'ollama', model: 'qwen2.5-coder:32b', name: 'Qwen 2.5 32B' },
          { provider: 'ollama', model: 'llama3.1:70b', name: 'Llama 3.1 70B' },
          { provider: 'ollama', model: 'deepseek-r1:14b', name: 'DeepSeek R1 14B' }
        ];
      }

      // Run comparison
      const comparison = await this.config.comparator.compareAll(query, {
        researcher,
        models,
        cutoffDate: new Date('2024-10-01')
      });

      // Clean up
      await researcher.close();

      // Cache result
      await this._cacheResult(query, comparison);

      const duration = Date.now() - startTime;
      this.log(`[CalRivenAutonomousMode] ✅ Research complete: "${query}" (${duration}ms, best: ${comparison.bestModel.name})`);

      return comparison;

    } catch (error) {
      this.log(`[CalRivenAutonomousMode] ❌ Research failed: "${query}" - ${error.message}`);
      return null;
    }
  }

  /**
   * Get trending topics
   */
  async _getTrendingTopics() {
    // Placeholder - implement with external APIs (Google Trends, Twitter, etc.)
    // For now, return common current events queries
    return [
      { query: 'Latest AI developments', priority: 'medium', source: 'trending' },
      { query: 'Recent scientific discoveries', priority: 'low', source: 'trending' }
    ];
  }

  /**
   * Get user search analytics
   */
  async _getUserSearchAnalytics() {
    if (!this.config.db) return [];

    try {
      // Get top searches from last 24 hours
      const result = await this.config.db.query(
        `SELECT query, COUNT(*) as count
         FROM search_analytics
         WHERE searched_at > NOW() - INTERVAL '24 hours'
         GROUP BY query
         ORDER BY count DESC
         LIMIT 5`
      );

      return result.rows.map(row => ({
        query: row.query,
        priority: row.count > 10 ? 'high' : 'medium',
        source: 'analytics',
        searchCount: parseInt(row.count)
      }));
    } catch (error) {
      // Table doesn't exist yet
      return [];
    }
  }

  /**
   * Get scheduled topics
   */
  _getScheduledTopics() {
    const hour = new Date().getHours();

    // Research different topics at different times
    const schedule = {
      0: 'Technology news overnight',
      6: 'Morning tech briefing',
      9: 'Latest AI developments',
      12: 'Midday market updates',
      15: 'Afternoon tech trends',
      18: 'Evening research roundup',
      21: 'Late night discoveries'
    };

    const topic = schedule[hour];

    return topic ? [{ query: topic, priority: 'low', source: 'scheduled' }] : [];
  }

  /**
   * Cache research result
   */
  async _cacheResult(query, comparison) {
    if (!this.config.vault) return;

    const cacheKey = this._generateCacheKey(query);

    // Store in vault (24 hour TTL)
    await this.config.vault.store(
      'calriven_autonomous',
      'research',
      cacheKey,
      {
        query,
        comparison,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString() // 24 hours
      },
      { ttl: 86400 } // 24 hours
    );

    this.log(`[CalRivenAutonomousMode] Cached result for "${query}"`);
  }

  /**
   * Generate cache key
   */
  _generateCacheKey(query) {
    return query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .substring(0, 100);
  }

  /**
   * Log message (respects privacy settings)
   */
  log(message) {
    if (this.config.logToConsole) {
      console.log(message);
    }

    // Always log to vault for debugging
    if (this.config.vault) {
      this.config.vault.store(
        'calriven_autonomous',
        'logs',
        `log_${Date.now()}`,
        { message, timestamp: new Date().toISOString() },
        { ttl: 86400 } // 1 day
      ).catch(() => {}); // Ignore errors
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      queriesThisHour: this.queriesThisHour,
      maxQueriesPerHour: this.config.maxQueriesPerHour,
      researchInterval: this.config.researchInterval,
      useLocalModelsOnly: this.config.useLocalModelsOnly,
      queueLength: this.queryQueue.length
    };
  }
}

module.exports = CalRivenAutonomousMode;
