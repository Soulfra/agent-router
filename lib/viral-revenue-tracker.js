/**
 * Viral Revenue Tracker
 *
 * Tracks ROI and virality metrics across languages, platforms, and personas:
 * - Track cost per 1000 impressions (CPM)
 * - Measure virality metrics (shares, reach, engagement)
 * - Calculate revenue attribution
 * - Identify high-performing content patterns
 * - Auto-allocate budget to winners
 * - A/B test performance comparison
 *
 * Usage:
 *   const tracker = new ViralRevenueTracker({ db });
 *
 *   // Track post performance
 *   await tracker.trackPost({
 *     postId: 'post_123',
 *     platform: 'mastodon',
 *     language: 'es',
 *     persona: 'alice',
 *     cost: 0.05,
 *     metrics: { views: 15000, shares: 450, clicks: 890 }
 *   });
 *
 *   // Get ROI analysis
 *   const roi = await tracker.getROI({ platform: 'mastodon', language: 'es' });
 *   // → { totalCost: $2.50, totalRevenue: $145, roi: 5700%, cpm: $0.17 }
 */

const { EventEmitter } = require('events');

class ViralRevenueTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;

    // Cost per operation (in USD)
    this.costs = {
      transcription: 0.006, // per minute
      translation: 0.015, // per language
      optimization: 0.003, // per piece
      posting: 0.001 // per platform
    };

    // Revenue attribution (example values - customize based on business model)
    this.revenueModels = {
      adRevenue: {
        cpm: 3.50, // $3.50 per 1000 views (typical blog/YouTube ad revenue)
        enabled: true
      },
      affiliate: {
        conversionRate: 0.02, // 2% click-to-purchase
        avgCommission: 25.00, // $25 average affiliate commission
        enabled: true
      },
      sponsorship: {
        cpv: 0.005, // $0.005 per view (sponsored content)
        enabled: false
      },
      subscription: {
        conversionRate: 0.001, // 0.1% view-to-subscribe
        monthlyValue: 10.00, // $10/month subscription
        avgLifetime: 12, // 12 months average lifetime
        enabled: false
      }
    };

    // Virality coefficients
    this.viralityFactors = {
      share: 3.5, // Each share = 3.5x reach multiplier
      comment: 1.2, // Each comment = 1.2x engagement
      save: 2.0, // Each save/bookmark = 2x value
      clickthrough: 0.8 // Click = 0.8x intent
    };

    console.log('[ViralRevenueTracker] Initialized with', Object.keys(this.revenueModels).length, 'revenue models');
  }

  /**
   * Track post performance
   */
  async trackPost(input) {
    const {
      postId,
      sessionId = null,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      cost = 0,
      metrics = {},
      timestamp = new Date()
    } = input;

    if (!this.db) {
      throw new Error('Database required for tracking');
    }

    const {
      views = 0,
      shares = 0,
      likes = 0,
      comments = 0,
      saves = 0,
      clicks = 0,
      conversions = 0
    } = metrics;

    // Calculate derived metrics
    const viralityScore = this._calculateViralityScore(metrics);
    const engagementRate = views > 0 ? ((likes + comments + shares) / views) * 100 : 0;
    const clickThroughRate = views > 0 ? (clicks / views) * 100 : 0;
    const estimatedRevenue = this._estimateRevenue(metrics);
    const roi = cost > 0 ? ((estimatedRevenue - cost) / cost) * 100 : 0;

    try {
      await this.db.query(`
        INSERT INTO viral_performance_tracking (
          post_id,
          voice_session_id,
          platform,
          language,
          persona,
          brand,
          cost,
          views,
          shares,
          likes,
          comments,
          saves,
          clicks,
          conversions,
          virality_score,
          engagement_rate,
          click_through_rate,
          estimated_revenue,
          roi,
          tracked_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
        ON CONFLICT (post_id) DO UPDATE SET
          views = $8,
          shares = $9,
          likes = $10,
          comments = $11,
          saves = $12,
          clicks = $13,
          conversions = $14,
          virality_score = $15,
          engagement_rate = $16,
          click_through_rate = $17,
          estimated_revenue = $18,
          roi = $19,
          updated_at = NOW()
      `, [
        postId,
        sessionId,
        platform,
        language,
        persona,
        brand,
        cost,
        views,
        shares,
        likes,
        comments,
        saves,
        clicks,
        conversions,
        viralityScore,
        engagementRate,
        clickThroughRate,
        estimatedRevenue,
        roi,
        timestamp
      ]);

      console.log(`[ViralRevenueTracker] Tracked ${postId}: ${views} views, ${shares} shares, $${estimatedRevenue.toFixed(2)} revenue, ${roi.toFixed(0)}% ROI`);

      this.emit('performance:tracked', {
        postId,
        platform,
        language,
        viralityScore,
        estimatedRevenue,
        roi
      });

      return {
        postId,
        viralityScore,
        engagementRate,
        estimatedRevenue,
        roi
      };
    } catch (error) {
      console.error('[ViralRevenueTracker] Tracking error:', error.message);
      throw error;
    }
  }

  /**
   * Calculate virality score (0-100)
   */
  _calculateViralityScore(metrics) {
    const {
      views = 0,
      shares = 0,
      comments = 0,
      saves = 0,
      clicks = 0
    } = metrics;

    if (views === 0) return 0;

    // Weighted virality formula
    const shareImpact = (shares / views) * this.viralityFactors.share * 100;
    const commentImpact = (comments / views) * this.viralityFactors.comment * 100;
    const saveImpact = (saves / views) * this.viralityFactors.save * 100;
    const clickImpact = (clicks / views) * this.viralityFactors.clickthrough * 100;

    const totalScore = shareImpact + commentImpact + saveImpact + clickImpact;

    return Math.min(Math.round(totalScore), 100);
  }

  /**
   * Estimate revenue from metrics
   */
  _estimateRevenue(metrics) {
    const { views = 0, clicks = 0 } = metrics;

    let totalRevenue = 0;

    // Ad revenue
    if (this.revenueModels.adRevenue.enabled) {
      const cpm = this.revenueModels.adRevenue.cpm;
      totalRevenue += (views / 1000) * cpm;
    }

    // Affiliate revenue
    if (this.revenueModels.affiliate.enabled) {
      const conversionRate = this.revenueModels.affiliate.conversionRate;
      const avgCommission = this.revenueModels.affiliate.avgCommission;
      const conversions = clicks * conversionRate;
      totalRevenue += conversions * avgCommission;
    }

    // Sponsorship revenue
    if (this.revenueModels.sponsorship.enabled) {
      const cpv = this.revenueModels.sponsorship.cpv;
      totalRevenue += views * cpv;
    }

    // Subscription revenue
    if (this.revenueModels.subscription.enabled) {
      const conversionRate = this.revenueModels.subscription.conversionRate;
      const monthlyValue = this.revenueModels.subscription.monthlyValue;
      const avgLifetime = this.revenueModels.subscription.avgLifetime;
      const newSubscribers = views * conversionRate;
      const lifetimeValue = monthlyValue * avgLifetime;
      totalRevenue += newSubscribers * lifetimeValue;
    }

    return totalRevenue;
  }

  /**
   * Get ROI analysis
   */
  async getROI(filters = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const {
      platform = null,
      language = null,
      persona = null,
      brand = null,
      startDate = null,
      endDate = null
    } = filters;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (platform) {
      conditions.push(`platform = $${paramIndex++}`);
      params.push(platform);
    }

    if (language) {
      conditions.push(`language = $${paramIndex++}`);
      params.push(language);
    }

    if (persona) {
      conditions.push(`persona = $${paramIndex++}`);
      params.push(persona);
    }

    if (brand) {
      conditions.push(`brand = $${paramIndex++}`);
      params.push(brand);
    }

    if (startDate) {
      conditions.push(`tracked_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`tracked_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        COUNT(*) as total_posts,
        SUM(cost) as total_cost,
        SUM(estimated_revenue) as total_revenue,
        AVG(roi) as avg_roi,
        SUM(views) as total_views,
        SUM(shares) as total_shares,
        SUM(clicks) as total_clicks,
        AVG(virality_score) as avg_virality,
        AVG(engagement_rate) as avg_engagement,
        AVG(click_through_rate) as avg_ctr
      FROM viral_performance_tracking
      ${whereClause}
    `;

    try {
      const result = await this.db.query(query, params);
      const row = result.rows[0];

      const totalCost = parseFloat(row.total_cost) || 0;
      const totalRevenue = parseFloat(row.total_revenue) || 0;
      const totalViews = parseInt(row.total_views) || 0;

      return {
        filters,
        totalPosts: parseInt(row.total_posts) || 0,
        totalCost,
        totalRevenue,
        netProfit: totalRevenue - totalCost,
        roi: parseFloat(row.avg_roi) || 0,
        cpm: totalViews > 0 ? (totalCost / totalViews) * 1000 : 0,
        totalViews,
        totalShares: parseInt(row.total_shares) || 0,
        totalClicks: parseInt(row.total_clicks) || 0,
        avgVirality: parseFloat(row.avg_virality) || 0,
        avgEngagement: parseFloat(row.avg_engagement) || 0,
        avgCTR: parseFloat(row.avg_ctr) || 0
      };
    } catch (error) {
      console.error('[ViralRevenueTracker] ROI query error:', error.message);
      throw error;
    }
  }

  /**
   * Get top performing content
   */
  async getTopPerformers(criteria = 'roi', limit = 10, filters = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const validCriteria = ['roi', 'virality_score', 'estimated_revenue', 'views', 'shares'];
    const orderBy = validCriteria.includes(criteria) ? criteria : 'roi';

    const {
      platform = null,
      language = null,
      persona = null,
      brand = null
    } = filters;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (platform) {
      conditions.push(`platform = $${paramIndex++}`);
      params.push(platform);
    }

    if (language) {
      conditions.push(`language = $${paramIndex++}`);
      params.push(language);
    }

    if (persona) {
      conditions.push(`persona = $${paramIndex++}`);
      params.push(persona);
    }

    if (brand) {
      conditions.push(`brand = $${paramIndex++}`);
      params.push(brand);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);

    const query = `
      SELECT *
      FROM viral_performance_tracking
      ${whereClause}
      ORDER BY ${orderBy} DESC
      LIMIT $${paramIndex}
    `;

    try {
      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        postId: row.post_id,
        platform: row.platform,
        language: row.language,
        persona: row.persona,
        brand: row.brand,
        views: row.views,
        shares: row.shares,
        clicks: row.clicks,
        viralityScore: row.virality_score,
        engagementRate: row.engagement_rate,
        estimatedRevenue: parseFloat(row.estimated_revenue),
        roi: parseFloat(row.roi),
        trackedAt: row.tracked_at
      }));
    } catch (error) {
      console.error('[ViralRevenueTracker] Top performers query error:', error.message);
      return [];
    }
  }

  /**
   * Compare performance across dimensions
   */
  async comparePerformance(dimension = 'language') {
    if (!this.db) {
      throw new Error('Database required');
    }

    const validDimensions = ['language', 'platform', 'persona', 'brand'];
    const groupBy = validDimensions.includes(dimension) ? dimension : 'language';

    const query = `
      SELECT
        ${groupBy},
        COUNT(*) as post_count,
        AVG(virality_score) as avg_virality,
        AVG(engagement_rate) as avg_engagement,
        AVG(roi) as avg_roi,
        SUM(estimated_revenue) as total_revenue,
        SUM(cost) as total_cost,
        SUM(views) as total_views,
        SUM(shares) as total_shares
      FROM viral_performance_tracking
      GROUP BY ${groupBy}
      ORDER BY total_revenue DESC
    `;

    try {
      const result = await this.db.query(query);

      return result.rows.map(row => ({
        [groupBy]: row[groupBy],
        postCount: parseInt(row.post_count),
        avgVirality: parseFloat(row.avg_virality) || 0,
        avgEngagement: parseFloat(row.avg_engagement) || 0,
        avgROI: parseFloat(row.avg_roi) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        totalCost: parseFloat(row.total_cost) || 0,
        totalViews: parseInt(row.total_views) || 0,
        totalShares: parseInt(row.total_shares) || 0,
        cpm: parseInt(row.total_views) > 0
          ? (parseFloat(row.total_cost) / parseInt(row.total_views)) * 1000
          : 0
      }));
    } catch (error) {
      console.error('[ViralRevenueTracker] Comparison query error:', error.message);
      return [];
    }
  }

  /**
   * Get budget recommendations
   */
  async getBudgetRecommendations() {
    // Get performance by language
    const byLanguage = await this.comparePerformance('language');

    // Get performance by platform
    const byPlatform = await this.comparePerformance('platform');

    // Sort by ROI descending
    const topLanguages = byLanguage.sort((a, b) => b.avgROI - a.avgROI).slice(0, 3);
    const topPlatforms = byPlatform.sort((a, b) => b.avgROI - a.avgROI).slice(0, 3);

    return {
      topLanguages: topLanguages.map(l => ({
        language: l.language,
        roi: l.avgROI,
        recommendation: `Allocate ${this._calculateBudgetAllocation(l.avgROI)}% of budget`
      })),
      topPlatforms: topPlatforms.map(p => ({
        platform: p.platform,
        roi: p.avgROI,
        recommendation: `Allocate ${this._calculateBudgetAllocation(p.avgROI)}% of budget`
      })),
      advice: this._generateAdvice(byLanguage, byPlatform)
    };
  }

  /**
   * Calculate budget allocation percentage
   */
  _calculateBudgetAllocation(roi) {
    // Higher ROI = higher allocation
    // Scale 0-1000% ROI to 10-40% budget allocation
    const normalized = Math.min(Math.max(roi, 0), 1000);
    const percentage = 10 + (normalized / 1000) * 30;
    return Math.round(percentage);
  }

  /**
   * Generate strategic advice
   */
  _generateAdvice(byLanguage, byPlatform) {
    const advice = [];

    // Language advice
    const bestLang = byLanguage.sort((a, b) => b.avgROI - a.avgROI)[0];
    if (bestLang && bestLang.avgROI > 100) {
      advice.push(`🌍 ${bestLang.language} is crushing it with ${bestLang.avgROI.toFixed(0)}% ROI - double down on this language!`);
    }

    // Platform advice
    const bestPlatform = byPlatform.sort((a, b) => b.avgROI - a.avgROI)[0];
    if (bestPlatform && bestPlatform.avgROI > 100) {
      advice.push(`📱 ${bestPlatform.platform} is your best platform - increase posting frequency!`);
    }

    // Virality advice
    const highVirality = byLanguage.filter(l => l.avgVirality > 60);
    if (highVirality.length > 0) {
      advice.push(`🔥 ${highVirality.map(l => l.language).join(', ')} have high virality - focus on shareability!`);
    }

    return advice.length > 0 ? advice : ['Keep testing and optimizing - more data needed for recommendations'];
  }

  /**
   * Update revenue model settings
   */
  updateRevenueModel(model, settings) {
    if (this.revenueModels[model]) {
      this.revenueModels[model] = {
        ...this.revenueModels[model],
        ...settings
      };

      console.log(`[ViralRevenueTracker] Updated ${model} revenue model:`, this.revenueModels[model]);
    }
  }

  /**
   * Get performance trends over time
   */
  async getTrends(dimension = 'day', filters = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const validDimensions = ['hour', 'day', 'week', 'month'];
    const interval = validDimensions.includes(dimension) ? dimension : 'day';

    const {
      platform = null,
      language = null,
      startDate = null,
      endDate = null
    } = filters;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (platform) {
      conditions.push(`platform = $${paramIndex++}`);
      params.push(platform);
    }

    if (language) {
      conditions.push(`language = $${paramIndex++}`);
      params.push(language);
    }

    if (startDate) {
      conditions.push(`tracked_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`tracked_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        DATE_TRUNC('${interval}', tracked_at) as period,
        COUNT(*) as posts,
        AVG(virality_score) as avg_virality,
        AVG(roi) as avg_roi,
        SUM(estimated_revenue) as revenue
      FROM viral_performance_tracking
      ${whereClause}
      GROUP BY period
      ORDER BY period ASC
    `;

    try {
      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        period: row.period,
        posts: parseInt(row.posts),
        avgVirality: parseFloat(row.avg_virality) || 0,
        avgROI: parseFloat(row.avg_roi) || 0,
        revenue: parseFloat(row.revenue) || 0
      }));
    } catch (error) {
      console.error('[ViralRevenueTracker] Trends query error:', error.message);
      return [];
    }
  }
}

module.exports = ViralRevenueTracker;
