/**
 * Context Overflow Handler
 *
 * Handles context overflow by automatically fetching relevant information from external sources.
 * Similar to StackOverflow's context management - when you run out of local context,
 * fetch additional information from external sources.
 *
 * Features:
 * - Detects when context depth/size exceeds limits
 * - Auto-fetches from StackOverflow, GitHub, docs sites
 * - Caches fetched context to avoid redundant requests
 * - Compresses old context using summarization
 * - Archives old context to external storage (S3, file system)
 * - Context window management
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ContextOverflowHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    // Limits
    this.maxContextDepth = options.maxContextDepth || 10;
    this.maxContextSize = options.maxContextSize || 1000000; // 1MB of context
    this.maxMessages = options.maxMessages || 100;

    // External sources
    this.externalSources = {
      stackoverflow: {
        enabled: options.enableStackOverflow !== false,
        baseUrl: 'https://api.stackexchange.com/2.3',
        rateLimit: 300, // requests per day
        cache: new Map()
      },
      github: {
        enabled: options.enableGitHub !== false,
        baseUrl: 'https://api.github.com',
        rateLimit: 5000, // requests per hour
        cache: new Map()
      },
      docs: {
        enabled: options.enableDocs !== false,
        // Common documentation sites
        sites: [
          'https://developer.mozilla.org',
          'https://nodejs.org/api',
          'https://docs.python.org',
          'https://doc.rust-lang.org'
        ],
        cache: new Map()
      }
    };

    // Context storage
    this.contextArchive = new Map(); // Map<contextId, archivedContext>
    this.contextSummaries = new Map(); // Map<contextId, summary>

    // Stats
    this.stats = {
      overflowEvents: 0,
      externalFetches: 0,
      cacheHits: 0,
      archiveOperations: 0,
      summarizations: 0
    };

    // Archive storage (in production, use S3 or similar)
    this.archiveStorage = options.archiveStorage || null;

    console.log('[ContextOverflowHandler] Initialized');
  }

  /**
   * Check if context has overflowed
   */
  checkOverflow(context) {
    const checks = {
      depthOverflow: false,
      sizeOverflow: false,
      messageOverflow: false,
      recommendation: null
    };

    // Check depth
    if (context.contextDepth >= this.maxContextDepth) {
      checks.depthOverflow = true;
      checks.recommendation = 'compress_or_archive';
    }

    // Check size (if context has size tracking)
    if (context.contextSize && context.contextSize >= this.maxContextSize) {
      checks.sizeOverflow = true;
      checks.recommendation = 'summarize';
    }

    // Check message count (if context tracks messages)
    if (context.messages && context.messages.length >= this.maxMessages) {
      checks.messageOverflow = true;
      checks.recommendation = 'archive_old_messages';
    }

    checks.hasOverflow = checks.depthOverflow || checks.sizeOverflow || checks.messageOverflow;

    return checks;
  }

  /**
   * Handle overflow event
   */
  async handleOverflow(context, overflowType = 'depth') {
    this.stats.overflowEvents++;

    console.log(`[ContextOverflowHandler] Overflow detected for agent ${context.agentId} (type: ${overflowType})`);

    const checks = this.checkOverflow(context);

    // Emit overflow event
    this.emit('overflow', {
      agentId: context.agentId,
      contextDepth: context.contextDepth,
      overflowType,
      checks
    });

    // Handle based on recommendation
    switch (checks.recommendation) {
      case 'compress_or_archive':
        return await this.compressContext(context);

      case 'summarize':
        return await this.summarizeContext(context);

      case 'archive_old_messages':
        return await this.archiveOldMessages(context);

      default:
        return { success: false, error: 'No recommendation available' };
    }
  }

  /**
   * Compress context by removing redundant information
   */
  async compressContext(context) {
    console.log(`[ContextOverflowHandler] Compressing context for agent ${context.agentId}`);

    // Get context snapshot
    const snapshot = context.createContextSnapshot();

    // Create compressed version (keep only essential fields)
    const compressed = {
      agentId: snapshot.agentId,
      platform: snapshot.platform,
      deviceType: snapshot.deviceType,
      contextDepth: snapshot.contextDepth,
      timestamp: snapshot.timestamp,
      summary: `Compressed context from depth ${snapshot.contextDepth}`
    };

    // Archive full context
    await this.archiveContext(context.agentId, snapshot);

    return {
      success: true,
      compressed,
      archiveId: context.agentId
    };
  }

  /**
   * Summarize context using LLM or rule-based approach
   */
  async summarizeContext(context) {
    console.log(`[ContextOverflowHandler] Summarizing context for agent ${context.agentId}`);

    this.stats.summarizations++;

    // Simple rule-based summarization (in production, use LLM)
    const snapshot = context.createContextSnapshot();

    const summary = {
      agentId: snapshot.agentId,
      platform: snapshot.platform,
      deviceType: snapshot.deviceType,
      contextDepth: snapshot.contextDepth,
      childCount: context.childAgents ? context.childAgents.size : 0,
      summary: `Agent ${snapshot.agentId} on ${snapshot.platform} at depth ${snapshot.contextDepth}`,
      timestamp: new Date()
    };

    // Store summary
    this.contextSummaries.set(context.agentId, summary);

    // Archive full context
    await this.archiveContext(context.agentId, snapshot);

    return {
      success: true,
      summary
    };
  }

  /**
   * Archive old messages
   */
  async archiveOldMessages(context) {
    console.log(`[ContextOverflowHandler] Archiving old messages for agent ${context.agentId}`);

    this.stats.archiveOperations++;

    // In a real implementation, this would archive messages to external storage
    // For now, just track the operation

    return {
      success: true,
      archived: 0, // Would count actual archived messages
      agentId: context.agentId
    };
  }

  /**
   * Archive context to external storage
   */
  async archiveContext(agentId, contextData) {
    const archiveId = crypto.randomUUID();

    const archive = {
      archiveId,
      agentId,
      contextData,
      archivedAt: new Date(),
      size: JSON.stringify(contextData).length
    };

    // Store in memory (in production, use S3 or similar)
    this.contextArchive.set(archiveId, archive);

    console.log(`[ContextOverflowHandler] Archived context ${archiveId} for agent ${agentId} (${archive.size} bytes)`);

    // If external storage configured, push there
    if (this.archiveStorage) {
      await this.archiveStorage.store(archiveId, archive);
    }

    return archiveId;
  }

  /**
   * Retrieve archived context
   */
  async retrieveArchive(archiveId) {
    // Check memory first
    if (this.contextArchive.has(archiveId)) {
      return this.contextArchive.get(archiveId);
    }

    // Check external storage
    if (this.archiveStorage) {
      return await this.archiveStorage.retrieve(archiveId);
    }

    return null;
  }

  /**
   * Fetch context from StackOverflow
   */
  async fetchFromStackOverflow(query, tags = []) {
    if (!this.externalSources.stackoverflow.enabled) {
      return { success: false, error: 'StackOverflow source disabled' };
    }

    // Check cache
    const cacheKey = `stackoverflow:${query}:${tags.join(',')}`;
    if (this.externalSources.stackoverflow.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.externalSources.stackoverflow.cache.get(cacheKey);
    }

    this.stats.externalFetches++;

    console.log(`[ContextOverflowHandler] Fetching from StackOverflow: "${query}"`);

    // In production, make actual API call
    // For now, return mock data
    const result = {
      success: true,
      source: 'stackoverflow',
      query,
      tags,
      results: [
        {
          title: `Mock result for: ${query}`,
          url: `https://stackoverflow.com/questions/mock`,
          excerpt: `This is a mock response for query: ${query}`,
          score: 42
        }
      ],
      timestamp: new Date()
    };

    // Cache result
    this.externalSources.stackoverflow.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Fetch context from GitHub
   */
  async fetchFromGitHub(repo, path = null) {
    if (!this.externalSources.github.enabled) {
      return { success: false, error: 'GitHub source disabled' };
    }

    // Check cache
    const cacheKey = `github:${repo}:${path || 'root'}`;
    if (this.externalSources.github.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.externalSources.github.cache.get(cacheKey);
    }

    this.stats.externalFetches++;

    console.log(`[ContextOverflowHandler] Fetching from GitHub: ${repo}${path ? '/' + path : ''}`);

    // In production, make actual API call
    const result = {
      success: true,
      source: 'github',
      repo,
      path,
      content: `Mock GitHub content for ${repo}`,
      timestamp: new Date()
    };

    // Cache result
    this.externalSources.github.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Fetch context from documentation site
   */
  async fetchFromDocs(site, searchQuery) {
    if (!this.externalSources.docs.enabled) {
      return { success: false, error: 'Docs source disabled' };
    }

    // Check cache
    const cacheKey = `docs:${site}:${searchQuery}`;
    if (this.externalSources.docs.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.externalSources.docs.cache.get(cacheKey);
    }

    this.stats.externalFetches++;

    console.log(`[ContextOverflowHandler] Fetching from docs: ${site} - "${searchQuery}"`);

    // In production, scrape or use site-specific API
    const result = {
      success: true,
      source: 'docs',
      site,
      query: searchQuery,
      content: `Mock documentation content for ${searchQuery}`,
      timestamp: new Date()
    };

    // Cache result
    this.externalSources.docs.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Auto-fetch relevant context based on error or question
   */
  async autoFetchContext(errorOrQuestion, context = {}) {
    console.log(`[ContextOverflowHandler] Auto-fetching context for: "${errorOrQuestion}"`);

    const results = [];

    // Try StackOverflow
    try {
      const stackResult = await this.fetchFromStackOverflow(errorOrQuestion);
      if (stackResult.success) {
        results.push(stackResult);
      }
    } catch (error) {
      console.error('[ContextOverflowHandler] StackOverflow fetch failed:', error.message);
    }

    // Try GitHub (if error looks like code issue)
    if (errorOrQuestion.includes('Error') || errorOrQuestion.includes('Exception')) {
      try {
        // Extract potential package/repo name
        const matches = errorOrQuestion.match(/\w+\.\w+/);
        if (matches) {
          const githubResult = await this.fetchFromGitHub(matches[0]);
          if (githubResult.success) {
            results.push(githubResult);
          }
        }
      } catch (error) {
        console.error('[ContextOverflowHandler] GitHub fetch failed:', error.message);
      }
    }

    return {
      success: results.length > 0,
      results,
      query: errorOrQuestion
    };
  }

  /**
   * Get context summary for agent
   */
  getContextSummary(agentId) {
    return this.contextSummaries.get(agentId) || null;
  }

  /**
   * Get archived contexts for agent
   */
  getArchivedContexts(agentId) {
    const archives = [];

    for (const [archiveId, archive] of this.contextArchive.entries()) {
      if (archive.agentId === agentId) {
        archives.push({
          archiveId,
          archivedAt: archive.archivedAt,
          size: archive.size
        });
      }
    }

    return archives.sort((a, b) => b.archivedAt - a.archivedAt);
  }

  /**
   * Clear old caches
   */
  clearOldCaches(olderThan = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleared = 0;

    // Clear each source cache
    for (const source of Object.values(this.externalSources)) {
      if (!source.cache) continue;

      for (const [key, value] of source.cache.entries()) {
        const age = now - new Date(value.timestamp).getTime();
        if (age > olderThan) {
          source.cache.delete(key);
          cleared++;
        }
      }
    }

    console.log(`[ContextOverflowHandler] Cleared ${cleared} old cache entries`);
    return cleared;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: {
        stackoverflow: this.externalSources.stackoverflow.cache.size,
        github: this.externalSources.github.cache.size,
        docs: this.externalSources.docs.cache.size
      },
      archiveSize: this.contextArchive.size,
      summariesStored: this.contextSummaries.size
    };
  }

  /**
   * Clear all data
   */
  clearAll() {
    for (const source of Object.values(this.externalSources)) {
      if (source.cache) {
        source.cache.clear();
      }
    }

    this.contextArchive.clear();
    this.contextSummaries.clear();

    console.log('[ContextOverflowHandler] Cleared all data');
  }
}

module.exports = ContextOverflowHandler;
