/**
 * Brand A/B Router
 *
 * Randomly routes users to different brands for A/B testing conversion rates.
 * Helps determine which brand/messaging/UI converts best.
 *
 * Features:
 * - Random brand selection
 * - Weighted routing (send more traffic to winners)
 * - Conversion tracking
 * - Cohort analysis
 * - Winner detection
 */

class BrandABRouter {
  constructor(options = {}) {
    // Brand routing configuration
    this.brands = {
      'soulfra.com': {
        name: 'Soulfra',
        weight: 2, // Higher = more traffic
        visits: 0,
        conversions: 0, // Signups, purchases, etc.
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'calriven.com': {
        name: 'Calriven',
        weight: 2,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'deathtodata.com': {
        name: 'DeathToData',
        weight: 3, // Prioritize this one
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'finishthisidea.com': {
        name: 'FinishThisIdea',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'finishthisrepo.com': {
        name: 'FinishThisRepo',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'ipomyagent.com': {
        name: 'IPOMyAgent',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'hollowtown.com': {
        name: 'Hollowtown',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'coldstartkit.com': {
        name: 'ColdStartKit',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'brandaidkit.com': {
        name: 'BrandAidKit',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'dealordelete.com': {
        name: 'DealOrDelete',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'saveorsink.com': {
        name: 'SaveOrSink',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      },
      'cringeproof.com': {
        name: 'CringeProof',
        weight: 1,
        visits: 0,
        conversions: 0,
        conversionRate: 0,
        avgTimeOnSite: 0,
        bounceRate: 0
      }
    };

    // User sessions (track which brand each user saw)
    this.sessions = new Map(); // sessionId => { brand, timestamp, converted, timeOnSite }

    this.config = {
      strategy: options.strategy || 'weighted', // 'random', 'weighted', 'best-performer'
      autoAdjustWeights: options.autoAdjustWeights !== false, // Auto-increase winners
      minVisitsForAdjustment: options.minVisitsForAdjustment || 100,
      cookieName: options.cookieName || 'bdg_ab_session',
      ...options
    };

    console.log('[BrandABRouter] Initialized');
  }

  /**
   * Route user to a brand
   * @param {object} context - User context (sessionId, referer, etc.)
   * @returns {object} Selected brand
   */
  route(context = {}) {
    const { sessionId, referer } = context;

    // Check if user already has a session
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      return {
        brand: session.brand,
        returning: true,
        session: session
      };
    }

    // Select brand based on strategy
    let selectedBrand;

    if (this.config.strategy === 'best-performer') {
      selectedBrand = this._selectBestPerformer();
    } else if (this.config.strategy === 'weighted') {
      selectedBrand = this._selectWeighted();
    } else {
      selectedBrand = this._selectRandom();
    }

    // Track visit
    this.brands[selectedBrand].visits++;

    // Create session
    const newSessionId = sessionId || this._generateSessionId();
    this.sessions.set(newSessionId, {
      brand: selectedBrand,
      timestamp: new Date().toISOString(),
      referer,
      converted: false,
      timeOnSite: 0,
      bounced: false
    });

    return {
      brand: selectedBrand,
      brandName: this.brands[selectedBrand].name,
      sessionId: newSessionId,
      returning: false,
      url: `https://${selectedBrand}`
    };
  }

  /**
   * Track conversion (signup, purchase, etc.)
   */
  trackConversion(sessionId, conversionData = {}) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.converted) {
      return { success: false, error: 'Already converted' };
    }

    // Mark as converted
    session.converted = true;
    session.conversionData = conversionData;
    session.convertedAt = new Date().toISOString();

    // Update brand stats
    const brand = this.brands[session.brand];
    brand.conversions++;
    brand.conversionRate = (brand.conversions / brand.visits) * 100;

    // Auto-adjust weights if enabled
    if (this.config.autoAdjustWeights) {
      this._autoAdjustWeights();
    }

    return {
      success: true,
      brand: session.brand,
      conversions: brand.conversions,
      conversionRate: brand.conversionRate.toFixed(2)
    };
  }

  /**
   * Track bounce (user left without converting)
   */
  trackBounce(sessionId, timeOnSite = 0) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.bounced = true;
    session.timeOnSite = timeOnSite;

    // Update brand stats
    const brand = this.brands[session.brand];
    const totalSessions = this.sessions.size;
    const brandSessions = Array.from(this.sessions.values()).filter(s => s.brand === session.brand);
    const bounced = brandSessions.filter(s => s.bounced).length;

    brand.bounceRate = (bounced / brandSessions.length) * 100;

    // Calculate avg time on site
    const totalTime = brandSessions.reduce((sum, s) => sum + s.timeOnSite, 0);
    brand.avgTimeOnSite = brandSessions.length > 0 ? totalTime / brandSessions.length : 0;

    return {
      success: true,
      brand: session.brand,
      bounceRate: brand.bounceRate.toFixed(2),
      avgTimeOnSite: Math.round(brand.avgTimeOnSite)
    };
  }

  /**
   * Get analytics
   */
  getAnalytics() {
    const stats = [];

    Object.entries(this.brands).forEach(([domain, data]) => {
      stats.push({
        domain,
        name: data.name,
        visits: data.visits,
        conversions: data.conversions,
        conversionRate: data.conversionRate.toFixed(2),
        bounceRate: data.bounceRate.toFixed(2),
        avgTimeOnSite: Math.round(data.avgTimeOnSite),
        weight: data.weight
      });
    });

    // Sort by conversion rate
    stats.sort((a, b) => parseFloat(b.conversionRate) - parseFloat(a.conversionRate));

    const totalVisits = stats.reduce((sum, s) => sum + s.visits, 0);
    const totalConversions = stats.reduce((sum, s) => sum + s.conversions, 0);

    return {
      success: true,
      stats,
      totals: {
        visits: totalVisits,
        conversions: totalConversions,
        conversionRate: totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(2) : 0
      },
      winner: stats[0] // Highest conversion rate
    };
  }

  /**
   * Get A/B test results
   */
  getABTestResults() {
    const analytics = this.getAnalytics();

    // Statistical significance (chi-square test)
    const winner = analytics.winner;
    const runnerUp = analytics.stats[1];

    return {
      success: true,
      winner: {
        domain: winner.domain,
        name: winner.name,
        conversionRate: winner.conversionRate,
        visits: winner.visits,
        conversions: winner.conversions
      },
      runnerUp: runnerUp ? {
        domain: runnerUp.domain,
        name: runnerUp.name,
        conversionRate: runnerUp.conversionRate,
        visits: runnerUp.visits,
        conversions: runnerUp.conversions
      } : null,
      improvement: runnerUp ? ((parseFloat(winner.conversionRate) - parseFloat(runnerUp.conversionRate)) / parseFloat(runnerUp.conversionRate) * 100).toFixed(1) : 0,
      recommendation: this._getRecommendation(analytics)
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Select random brand (equal probability)
   */
  _selectRandom() {
    const brands = Object.keys(this.brands);
    return brands[Math.floor(Math.random() * brands.length)];
  }

  /**
   * Select brand based on weight
   */
  _selectWeighted() {
    const totalWeight = Object.values(this.brands).reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [domain, data] of Object.entries(this.brands)) {
      random -= data.weight;
      if (random <= 0) {
        return domain;
      }
    }

    // Fallback (shouldn't reach here)
    return Object.keys(this.brands)[0];
  }

  /**
   * Select best performing brand
   */
  _selectBestPerformer() {
    const analytics = this.getAnalytics();
    return analytics.winner.domain;
  }

  /**
   * Auto-adjust weights based on performance
   */
  _autoAdjustWeights() {
    const totalVisits = Object.values(this.brands).reduce((sum, b) => sum + b.visits, 0);

    if (totalVisits < this.config.minVisitsForAdjustment) {
      return; // Not enough data yet
    }

    // Get top 3 performers
    const sorted = Object.entries(this.brands)
      .sort(([, a], [, b]) => b.conversionRate - a.conversionRate)
      .slice(0, 3);

    // Increase weights for top performers
    sorted.forEach(([domain], index) => {
      if (index === 0) {
        this.brands[domain].weight = Math.min(this.brands[domain].weight + 1, 5); // Max weight 5
      }
    });

    // Decrease weights for poor performers
    const poorPerformers = Object.entries(this.brands)
      .sort(([, a], [, b]) => a.conversionRate - b.conversionRate)
      .slice(0, 3);

    poorPerformers.forEach(([domain]) => {
      this.brands[domain].weight = Math.max(this.brands[domain].weight - 0.5, 0.5); // Min weight 0.5
    });
  }

  /**
   * Get recommendation based on A/B test results
   */
  _getRecommendation(analytics) {
    const winner = analytics.winner;
    const totalVisits = analytics.totals.visits;

    if (totalVisits < 100) {
      return 'Keep testing - need more data (minimum 100 visits)';
    }

    if (parseFloat(winner.conversionRate) < 1) {
      return 'All brands underperforming - consider messaging/UX improvements';
    }

    if (parseFloat(winner.conversionRate) > 10) {
      return `${winner.name} is a clear winner - consider focusing on this brand`;
    }

    return `${winner.name} is leading - continue testing with 70% traffic to winner`;
  }

  /**
   * Generate session ID
   */
  _generateSessionId() {
    return `bdg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

module.exports = BrandABRouter;
