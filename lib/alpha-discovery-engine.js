/**
 * Alpha Discovery Engine
 *
 * Tracks what financial documents, repos, and data users are viewing
 * to discover investment opportunities ("alpha") before the market reacts.
 *
 * Core Concept: Wisdom of the Crowd
 * - If 100 users suddenly view Tesla earnings → signal
 * - If options traders view specific repos → potential play
 * - If DoorDash drivers research financials → coordinate strategies
 *
 * Features:
 * - Document view tracking (tickers, earnings, strategies)
 * - Trending detection (hourly/daily spikes)
 * - Alpha signal generation (early movers, contrarian plays)
 * - Side hustle connections (link users with similar interests)
 */

class AlphaDiscoveryEngine {
  constructor(options = {}) {
    // In-memory storage (replace with database in production)
    this.views = []; // { userId, document, timestamp, context }
    this.signals = []; // { type, ticker, strength, timestamp }
    this.userProfiles = new Map(); // userId => { sideHustles, interests, skills }

    // Configuration
    this.config = {
      trendingThreshold: options.trendingThreshold || 10, // Min views to be "trending"
      trendingWindow: options.trendingWindow || 3600000, // 1 hour in ms
      signalStrength: options.signalStrength || 0.5, // 0-1, how strong signal must be
      maxViews: options.maxViews || 100000, // Max views to store in memory
      ...options
    };

    console.log('[AlphaDiscoveryEngine] Initialized');
  }

  // ============================================================================
  // View Tracking
  // ============================================================================

  /**
   * Track a document view
   * @param {string} userId - User ID
   * @param {object} document - Document metadata
   * @param {object} context - View context (source, referer, etc.)
   */
  async trackView(userId, document, context = {}) {
    const view = {
      userId,
      document: {
        type: document.type || 'unknown', // 'earnings', 'filing', 'repo', 'strategy'
        ticker: document.ticker || null, // AAPL, TSLA, etc.
        title: document.title || '',
        url: document.url || '',
        category: document.category || 'general', // 'options', 'stocks', 'crypto', 'side-hustle'
        ...document
      },
      context: {
        source: context.source || 'web', // 'github', 'web', 'api'
        referer: context.referer || null,
        userAgent: context.userAgent || null,
        ...context
      },
      timestamp: new Date().toISOString()
    };

    this.views.push(view);

    // Limit memory usage
    if (this.views.length > this.config.maxViews) {
      this.views = this.views.slice(-this.config.maxViews);
    }

    // Update user profile
    this._updateUserProfile(userId, document);

    // Check for new signals
    await this._detectSignals();

    return { status: 'tracked', viewId: this.views.length - 1 };
  }

  /**
   * Update user profile based on viewing behavior
   */
  _updateUserProfile(userId, document) {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        interests: new Map(), // topic => view count
        tickers: new Map(), // ticker => view count
        categories: new Map(), // category => view count
        lastSeen: new Date()
      });
    }

    const profile = this.userProfiles.get(userId);

    // Track interests
    if (document.type) {
      profile.interests.set(document.type, (profile.interests.get(document.type) || 0) + 1);
    }

    if (document.ticker) {
      profile.tickers.set(document.ticker, (profile.tickers.get(document.ticker) || 0) + 1);
    }

    if (document.category) {
      profile.categories.set(document.category, (profile.categories.get(document.category) || 0) + 1);
    }

    profile.lastSeen = new Date();
  }

  // ============================================================================
  // Trending Detection
  // ============================================================================

  /**
   * Get trending documents in a time window
   * @param {number} windowMs - Time window in milliseconds
   */
  async getTrending(windowMs = this.config.trendingWindow) {
    const now = Date.now();
    const cutoff = new Date(now - windowMs);

    // Filter views within window
    const recentViews = this.views.filter(v => new Date(v.timestamp) > cutoff);

    // Group by ticker
    const tickerCounts = new Map();
    const docCounts = new Map();

    recentViews.forEach(view => {
      if (view.document.ticker) {
        tickerCounts.set(view.document.ticker, (tickerCounts.get(view.document.ticker) || 0) + 1);
      }

      const docKey = view.document.title || view.document.url;
      if (docKey) {
        docCounts.set(docKey, (docCounts.get(docKey) || 0) + 1);
      }
    });

    // Calculate trending (compare to previous window)
    const trending = {
      tickers: this._calculateTrendingTickers(tickerCounts, windowMs),
      documents: this._calculateTrendingDocs(docCounts, windowMs),
      totalViews: recentViews.length,
      uniqueUsers: new Set(recentViews.map(v => v.userId)).size,
      window: `${windowMs / 1000}s`
    };

    return trending;
  }

  /**
   * Calculate trending tickers with growth percentage
   */
  _calculateTrendingTickers(currentCounts, windowMs) {
    const now = Date.now();
    const prevCutoff = new Date(now - windowMs * 2);
    const currentCutoff = new Date(now - windowMs);

    // Get previous window counts for comparison
    const prevViews = this.views.filter(v => {
      const ts = new Date(v.timestamp);
      return ts > prevCutoff && ts <= currentCutoff;
    });

    const prevCounts = new Map();
    prevViews.forEach(view => {
      if (view.document.ticker) {
        prevCounts.set(view.document.ticker, (prevCounts.get(view.document.ticker) || 0) + 1);
      }
    });

    // Calculate growth
    const trending = [];
    for (const [ticker, currentCount] of currentCounts.entries()) {
      const prevCount = prevCounts.get(ticker) || 0;
      const growth = prevCount > 0 ? ((currentCount - prevCount) / prevCount) * 100 : 100;

      if (currentCount >= this.config.trendingThreshold) {
        trending.push({
          ticker,
          views: currentCount,
          prevViews: prevCount,
          growth: Math.round(growth),
          trend: growth > 0 ? 'up' : 'down'
        });
      }
    }

    return trending.sort((a, b) => b.growth - a.growth);
  }

  /**
   * Calculate trending documents
   */
  _calculateTrendingDocs(currentCounts, windowMs) {
    const trending = [];

    for (const [doc, count] of currentCounts.entries()) {
      if (count >= this.config.trendingThreshold) {
        trending.push({ document: doc, views: count });
      }
    }

    return trending.sort((a, b) => b.views - a.views).slice(0, 20);
  }

  // ============================================================================
  // Alpha Signal Detection
  // ============================================================================

  /**
   * Detect alpha signals from viewing patterns
   */
  async _detectSignals() {
    const trending = await this.getTrending(this.config.trendingWindow);
    const newSignals = [];

    // Signal 1: Unusual spike in ticker views
    trending.tickers.forEach(ticker => {
      if (ticker.growth > 200 && ticker.views >= 20) {
        newSignals.push({
          type: 'spike',
          ticker: ticker.ticker,
          strength: Math.min(ticker.growth / 500, 1.0), // 0-1
          reason: `${ticker.views} views (+${ticker.growth}% from previous hour)`,
          timestamp: new Date().toISOString(),
          action: 'investigate'
        });
      }
    });

    // Signal 2: Contrarian play (everyone viewing, might be overbought)
    trending.tickers.forEach(ticker => {
      if (ticker.views > 100) {
        newSignals.push({
          type: 'contrarian',
          ticker: ticker.ticker,
          strength: Math.min(ticker.views / 200, 1.0),
          reason: `${ticker.views} views (possible overcrowding)`,
          timestamp: new Date().toISOString(),
          action: 'consider_short'
        });
      }
    });

    // Store signals
    this.signals.push(...newSignals);

    // Keep only recent signals (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 86400000);
    this.signals = this.signals.filter(s => new Date(s.timestamp) > oneDayAgo);

    return newSignals;
  }

  /**
   * Get current alpha signals
   * @param {number} minStrength - Minimum signal strength (0-1)
   */
  async getAlphaSignals(minStrength = this.config.signalStrength) {
    return this.signals
      .filter(s => s.strength >= minStrength)
      .sort((a, b) => b.strength - a.strength);
  }

  // ============================================================================
  // Side Hustle Connections
  // ============================================================================

  /**
   * Find users with similar interests for side hustle collaboration
   * @param {string} userId - User to find connections for
   */
  async findConnections(userId) {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) {
      return { connections: [], reason: 'No profile found' };
    }

    const connections = [];

    // Find users with overlapping interests
    for (const [otherUserId, otherProfile] of this.userProfiles.entries()) {
      if (otherUserId === userId) continue;

      const similarity = this._calculateSimilarity(userProfile, otherProfile);

      if (similarity > 0.3) { // 30% similarity threshold
        connections.push({
          userId: otherUserId,
          similarity: Math.round(similarity * 100),
          sharedInterests: this._getSharedInterests(userProfile, otherProfile),
          lastSeen: otherProfile.lastSeen
        });
      }
    }

    return {
      connections: connections.sort((a, b) => b.similarity - a.similarity).slice(0, 10),
      totalFound: connections.length
    };
  }

  /**
   * Calculate similarity between two user profiles
   */
  _calculateSimilarity(profile1, profile2) {
    let sharedWeight = 0;
    let totalWeight = 0;

    // Compare tickers
    for (const [ticker, count1] of profile1.tickers.entries()) {
      totalWeight += count1;
      const count2 = profile2.tickers.get(ticker) || 0;
      if (count2 > 0) {
        sharedWeight += Math.min(count1, count2);
      }
    }

    // Compare categories
    for (const [category, count1] of profile1.categories.entries()) {
      totalWeight += count1;
      const count2 = profile2.categories.get(category) || 0;
      if (count2 > 0) {
        sharedWeight += Math.min(count1, count2);
      }
    }

    return totalWeight > 0 ? sharedWeight / totalWeight : 0;
  }

  /**
   * Get shared interests between two profiles
   */
  _getSharedInterests(profile1, profile2) {
    const shared = [];

    // Shared tickers
    for (const [ticker, count] of profile1.tickers.entries()) {
      if (profile2.tickers.has(ticker)) {
        shared.push({ type: 'ticker', value: ticker, strength: count });
      }
    }

    // Shared categories
    for (const [category, count] of profile1.categories.entries()) {
      if (profile2.categories.has(category)) {
        shared.push({ type: 'category', value: category, strength: count });
      }
    }

    return shared.sort((a, b) => b.strength - a.strength).slice(0, 5);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get analytics summary
   */
  async getAnalytics() {
    const now = Date.now();
    const oneHourAgo = new Date(now - 3600000);
    const oneDayAgo = new Date(now - 86400000);

    const hourlyViews = this.views.filter(v => new Date(v.timestamp) > oneHourAgo);
    const dailyViews = this.views.filter(v => new Date(v.timestamp) > oneDayAgo);

    return {
      totalViews: this.views.length,
      hourlyViews: hourlyViews.length,
      dailyViews: dailyViews.length,
      activeUsers: this.userProfiles.size,
      activeSignals: this.signals.length,
      topTickers: this._getTopTickers(dailyViews, 10),
      topCategories: this._getTopCategories(dailyViews, 5)
    };
  }

  /**
   * Get top tickers by view count
   */
  _getTopTickers(views, limit = 10) {
    const counts = new Map();
    views.forEach(v => {
      if (v.document.ticker) {
        counts.set(v.document.ticker, (counts.get(v.document.ticker) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([ticker, count]) => ({ ticker, views: count }));
  }

  /**
   * Get top categories by view count
   */
  _getTopCategories(views, limit = 5) {
    const counts = new Map();
    views.forEach(v => {
      if (v.document.category) {
        counts.set(v.document.category, (counts.get(v.document.category) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category, count]) => ({ category, views: count }));
  }
}

module.exports = AlphaDiscoveryEngine;
