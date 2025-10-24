/**
 * CALOS Culture Analyzer
 *
 * Analyzes telemetry data to understand customer usage patterns ("culture")
 *
 * This is the "scientist" part - we analyze:
 * - Which features they use most
 * - How they use them
 * - Team size and behavior patterns
 * - Tech stack detection
 * - Upsell opportunities
 * - Unused features (wasted value)
 *
 * Usage:
 *   const CultureAnalyzer = require('./culture-analyzer');
 *   const analyzer = new CultureAnalyzer({ db });
 *   const culture = await analyzer.analyze(installId);
 */

class CultureAnalyzer {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('[Culture Analyzer] Database required');
    }
  }

  /**
   * Analyze customer culture
   *
   * @param {string} installId - Install ID
   * @returns {object} Culture profile
   */
  async analyze(installId) {
    console.log(`[Culture Analyzer] Analyzing culture for ${installId}...`);

    try {
      // Get subscription info
      const subscription = await this.getSubscription(installId);

      // Get telemetry events (last 90 days)
      const events = await this.getTelemetryEvents(installId, 90);

      // Analyze patterns
      const culture = {
        installId,
        analyzedAt: new Date(),

        // Basic info
        subscription: {
          tier: subscription.tier_slug,
          status: subscription.status,
          createdAt: subscription.created_at,
          daysActive: this.calculateDaysActive(subscription.created_at)
        },

        // Feature usage
        features: await this.analyzeFeatures(events),

        // User behavior
        behavior: await this.analyzeBehavior(events, installId),

        // Team insights
        team: await this.analyzeTeam(events, installId),

        // Tech stack detection
        techStack: this.detectTechStack(events),

        // Performance
        performance: await this.analyzePerformance(events),

        // Upsell opportunities
        upsells: await this.identifyUpsells(installId, subscription, events),

        // Health score (0-100)
        healthScore: 0 // Calculated at end
      };

      // Calculate health score
      culture.healthScore = this.calculateHealthScore(culture);

      console.log(`[Culture Analyzer] Analysis complete for ${installId}: Health score ${culture.healthScore}`);

      return culture;
    } catch (error) {
      console.error('[Culture Analyzer] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(installId) {
    const result = await this.db.query(`
      SELECT * FROM subscription_plans
      WHERE install_id = $1
      LIMIT 1
    `, [installId]);

    if (result.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    return result.rows[0];
  }

  /**
   * Get telemetry events
   */
  async getTelemetryEvents(installId, days = 90) {
    const result = await this.db.query(`
      SELECT *
      FROM telemetry_events
      WHERE install_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY created_at ASC
    `, [installId]);

    return result.rows;
  }

  /**
   * Analyze feature usage
   */
  async analyzeFeatures(events) {
    const featureCounts = {};
    const featureFirstUse = {};
    const featureLastUse = {};

    events.forEach(event => {
      const feature = event.event_type;

      if (!featureCounts[feature]) {
        featureCounts[feature] = 0;
        featureFirstUse[feature] = event.created_at;
      }

      featureCounts[feature]++;
      featureLastUse[feature] = event.created_at;
    });

    // Sort by usage
    const sortedFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([feature, count]) => ({
        feature,
        count,
        firstUsed: featureFirstUse[feature],
        lastUsed: featureLastUse[feature],
        daysSinceLastUse: this.daysSince(featureLastUse[feature])
      }));

    return {
      total: events.length,
      unique: Object.keys(featureCounts).length,
      mostUsed: sortedFeatures.slice(0, 10),
      leastUsed: sortedFeatures.slice(-10).reverse(),
      unused: await this.findUnusedFeatures(installId, Object.keys(featureCounts))
    };
  }

  /**
   * Find unused features (paid for but never used)
   */
  async findUnusedFeatures(installId, usedFeatures) {
    // Get subscription tier
    const subscription = await this.getSubscription(installId);
    const tier = subscription.tier_slug;

    // All available features by tier
    const allFeatures = {
      community: ['basic_dashboard', 'api_access'],
      pro: ['basic_dashboard', 'api_access', 'transcripts', 'pos', 'crypto', 'quickbooks', 'white_label'],
      enterprise: ['basic_dashboard', 'api_access', 'transcripts', 'pos', 'crypto', 'quickbooks', 'white_label', 'multi_domain', 'priority_support', 'custom_integrations']
    };

    const tierFeatures = allFeatures[tier] || [];
    const unused = tierFeatures.filter(f => !usedFeatures.includes(f));

    return unused;
  }

  /**
   * Analyze user behavior
   */
  async analyzeBehavior(events, installId) {
    if (events.length === 0) {
      return {
        workingHours: {},
        activedays: [],
        peakDay: null,
        peakHour: null,
        sessionDuration: 0
      };
    }

    // Working hours (by hour of day)
    const hourCounts = Array(24).fill(0);
    const dayCounts = Array(7).fill(0);

    events.forEach(event => {
      const date = new Date(event.created_at);
      const hour = date.getHours();
      const day = date.getDay();

      hourCounts[hour]++;
      dayCounts[day]++;
    });

    // Find peak hour and day
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakDay = dayCounts.indexOf(Math.max(...dayCounts));

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Active days (which days they use it)
    const activeDays = dayCounts
      .map((count, index) => ({ day: dayNames[index], count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count);

    // Estimate session duration (time between events)
    const sessionGaps = [];
    for (let i = 1; i < events.length; i++) {
      const gap = new Date(events[i].created_at) - new Date(events[i - 1].created_at);
      if (gap < 30 * 60 * 1000) { // Less than 30 minutes = same session
        sessionGaps.push(gap);
      }
    }

    const avgSessionDuration = sessionGaps.length > 0
      ? sessionGaps.reduce((a, b) => a + b, 0) / sessionGaps.length / 1000 / 60 // Minutes
      : 0;

    return {
      workingHours: {
        peakHour: `${peakHour}:00 - ${peakHour + 1}:00`,
        hourlyDistribution: hourCounts
      },
      activeDays,
      peakDay: dayNames[peakDay],
      peakHour,
      sessionDuration: Math.round(avgSessionDuration)
    };
  }

  /**
   * Analyze team size and structure
   */
  async analyzeTeam(events, installId) {
    // Estimate team size from concurrent usage patterns
    // Group events by 5-minute windows
    const windows = {};

    events.forEach(event => {
      const timestamp = new Date(event.created_at);
      const windowKey = Math.floor(timestamp.getTime() / (5 * 60 * 1000));

      if (!windows[windowKey]) {
        windows[windowKey] = new Set();
      }

      // Use user identifier from event data if available
      const userId = event.event_data?.userId || 'unknown';
      windows[windowKey].add(userId);
    });

    // Maximum concurrent users in any 5-minute window
    const maxConcurrent = Math.max(...Object.values(windows).map(users => users.size));

    // Estimate team size (max concurrent * 1.5)
    const estimatedTeamSize = Math.max(1, Math.ceil(maxConcurrent * 1.5));

    // Usage frequency (events per day)
    const daysActive = this.calculateDaysActive(events[0]?.created_at || new Date());
    const eventsPerDay = events.length / Math.max(daysActive, 1);

    return {
      estimatedSize: estimatedTeamSize,
      maxConcurrentUsers: maxConcurrent,
      eventsPerDay: Math.round(eventsPerDay),
      intensity: eventsPerDay > 100 ? 'high' : eventsPerDay > 20 ? 'medium' : 'low'
    };
  }

  /**
   * Detect tech stack from telemetry
   */
  detectTechStack(events) {
    const stack = {
      frameworks: new Set(),
      languages: new Set(),
      platforms: new Set(),
      integrations: new Set()
    };

    events.forEach(event => {
      const data = event.event_data || {};

      // Detect from user agent, API calls, etc.
      if (data.userAgent) {
        if (data.userAgent.includes('Chrome')) stack.platforms.add('Chrome');
        if (data.userAgent.includes('Safari')) stack.platforms.add('Safari');
        if (data.userAgent.includes('Firefox')) stack.platforms.add('Firefox');
        if (data.userAgent.includes('Mobile')) stack.platforms.add('Mobile');
      }

      // Detect integrations
      if (event.event_type.includes('quickbooks')) stack.integrations.add('QuickBooks');
      if (event.event_type.includes('stripe')) stack.integrations.add('Stripe');
      if (event.event_type.includes('crypto')) stack.integrations.add('Crypto Payments');
      if (event.event_type.includes('pos')) stack.integrations.add('POS System');
    });

    return {
      frameworks: Array.from(stack.frameworks),
      languages: Array.from(stack.languages),
      platforms: Array.from(stack.platforms),
      integrations: Array.from(stack.integrations)
    };
  }

  /**
   * Analyze performance issues
   */
  async analyzePerformance(events) {
    const errors = events.filter(e => e.event_type === 'error' || e.event_type.includes('error'));
    const slowRequests = events.filter(e => {
      const duration = e.event_data?.duration;
      return duration && duration > 1000; // > 1 second
    });

    // Group errors by type
    const errorTypes = {};
    errors.forEach(error => {
      const type = error.event_data?.errorType || 'unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });

    return {
      totalErrors: errors.length,
      errorRate: events.length > 0 ? (errors.length / events.length) * 100 : 0,
      errorTypes,
      slowRequests: slowRequests.length,
      slowRequestRate: events.length > 0 ? (slowRequests.length / events.length) * 100 : 0
    };
  }

  /**
   * Identify upsell opportunities
   */
  async identifyUpsells(installId, subscription, events) {
    const upsells = [];

    // Get current usage
    const usage = await this.getCurrentUsage(installId, subscription);

    // Check if approaching limits
    const limits = await this.getLimits(subscription.tier_slug);

    Object.keys(usage).forEach(usageType => {
      const current = usage[usageType] || 0;
      const limit = limits[usageType];

      if (limit !== 'Infinity' && limit > 0) {
        const pct = (current / limit) * 100;

        if (pct >= 80) {
          upsells.push({
            type: 'limit_approaching',
            feature: usageType,
            current,
            limit,
            percent: Math.round(pct),
            recommendation: `Upgrade to ${subscription.tier_slug === 'community' ? 'Pro' : 'Enterprise'} for unlimited ${usageType}`,
            priority: pct >= 95 ? 'high' : 'medium'
          });
        }
      }
    });

    // Check for unused features they paid for
    const featureAnalysis = await this.analyzeFeatures(events);
    if (featureAnalysis.unused.length > 0) {
      upsells.push({
        type: 'unused_features',
        features: featureAnalysis.unused,
        recommendation: 'Customer has features they\'re not using. Consider reaching out to help with adoption.',
        priority: 'low'
      });
    }

    // Check for high usage (could afford higher tier)
    const eventsPerDay = events.length / Math.max(this.calculateDaysActive(subscription.created_at), 1);
    if (eventsPerDay > 200 && subscription.tier_slug === 'community') {
      upsells.push({
        type: 'high_usage',
        eventsPerDay: Math.round(eventsPerDay),
        recommendation: 'Customer has high usage on free tier. Strong candidate for Pro upgrade.',
        priority: 'high'
      });
    }

    // Check for multi-domain usage (enterprise feature)
    if (subscription.tier_slug !== 'enterprise') {
      const domains = new Set();
      events.forEach(event => {
        if (event.event_data?.domain) {
          domains.add(event.event_data.domain);
        }
      });

      if (domains.size > 1) {
        upsells.push({
          type: 'multi_domain',
          domainCount: domains.size,
          recommendation: 'Customer using multiple domains. Upsell to Enterprise for multi-domain support.',
          priority: 'high'
        });
      }
    }

    return upsells;
  }

  /**
   * Get current usage
   */
  async getCurrentUsage(installId, subscription) {
    const result = await this.db.query(`
      SELECT
        usage_type,
        SUM(usage_count) as total
      FROM usage_tracking
      WHERE install_id = $1
        AND created_at >= $2
      GROUP BY usage_type
    `, [installId, subscription.current_period_start]);

    const usage = {};
    result.rows.forEach(row => {
      usage[row.usage_type] = parseInt(row.total);
    });

    return usage;
  }

  /**
   * Get tier limits
   */
  async getLimits(tierSlug) {
    const result = await this.db.query(`
      SELECT
        limit_transcripts,
        limit_pos_transactions,
        limit_crypto_charges,
        limit_locations,
        limit_api_requests
      FROM license_tiers
      WHERE tier_slug = $1
    `, [tierSlug]);

    if (result.rows.length === 0) {
      return {};
    }

    const row = result.rows[0];

    return {
      transcripts: row.limit_transcripts || 'Infinity',
      pos_transactions: row.limit_pos_transactions || 'Infinity',
      crypto: row.limit_crypto_charges || 'Infinity',
      locations: row.limit_locations || 'Infinity',
      api_requests: row.limit_api_requests || 'Infinity'
    };
  }

  /**
   * Calculate health score (0-100)
   */
  calculateHealthScore(culture) {
    let score = 100;

    // Deduct points for issues
    if (culture.features.unused.length > 0) {
      score -= culture.features.unused.length * 5; // -5 per unused feature
    }

    if (culture.performance.errorRate > 5) {
      score -= 20; // High error rate
    } else if (culture.performance.errorRate > 1) {
      score -= 10; // Moderate error rate
    }

    if (culture.behavior.sessionDuration < 5) {
      score -= 15; // Very short sessions = not engaged
    }

    if (culture.team.intensity === 'low') {
      score -= 10; // Low activity
    }

    // Add points for good behavior
    if (culture.features.unique > 5) {
      score += 10; // Using many features
    }

    if (culture.team.intensity === 'high') {
      score += 10; // High activity
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper: Calculate days since date
   */
  daysSince(date) {
    const now = new Date();
    const then = new Date(date);
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper: Calculate days active
   */
  calculateDaysActive(createdAt) {
    return this.daysSince(createdAt);
  }
}

module.exports = CultureAnalyzer;
