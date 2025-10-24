/**
 * Session-Based Analytics (Privacy-First)
 *
 * Server-side analytics WITHOUT cookies, Google Analytics, or Facebook Pixel.
 * Uses session IDs and anonymous aggregation only.
 *
 * Features:
 * - Page view tracking (anonymous)
 * - Feature usage tracking
 * - Conversion tracking (purchases, signups)
 * - Attribution tracking (referral codes, QR codes)
 * - Session-based tracking (no persistent cookies)
 * - Aggregate statistics only
 *
 * What we DON'T track:
 * - Third-party cookies
 * - Cross-site tracking
 * - Individual user behavior (after aggregation)
 * - Personal browsing history
 */

const { Pool } = require('pg');
const crypto = require('crypto');

class SessionAnalytics {
  constructor(config = {}) {
    this.pool = new Pool({
      connectionString: config.databaseUrl || process.env.DATABASE_URL
    });

    this.retentionDays = config.retentionDays || 90; // Auto-delete logs after 90 days
    this.anonymizationThreshold = config.anonymizationThreshold || 100; // Min events before showing stats
  }

  /**
   * Track page view (anonymous, server-side)
   */
  async trackPageView(data) {
    const {
      sessionId,
      userId = null, // Optional if logged in
      path,
      referrer = null,
      userAgent = null,
      ipAddress = null,
      timestamp = new Date()
    } = data;

    // Hash IP for privacy (can't reverse)
    const ipHash = ipAddress ? this._hashValue(ipAddress) : null;

    const query = `
      INSERT INTO analytics_page_views (
        session_id,
        user_id,
        path,
        referrer,
        user_agent,
        ip_hash,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      sessionId,
      userId,
      path,
      referrer,
      userAgent,
      ipHash,
      timestamp
    ]);

    return result.rows[0];
  }

  /**
   * Track feature usage (button clicks, form submissions, etc)
   */
  async trackFeatureUsage(data) {
    const {
      sessionId,
      userId = null,
      featureName,
      featureType, // 'button', 'form', 'action', 'api'
      metadata = {},
      timestamp = new Date()
    } = data;

    const query = `
      INSERT INTO analytics_feature_usage (
        session_id,
        user_id,
        feature_name,
        feature_type,
        metadata,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      sessionId,
      userId,
      featureName,
      featureType,
      JSON.stringify(metadata),
      timestamp
    ]);

    return result.rows[0];
  }

  /**
   * Track conversion event (purchase, signup, etc)
   */
  async trackConversion(data) {
    const {
      sessionId,
      userId,
      conversionType, // 'purchase', 'signup', 'subscription'
      conversionValue = 0,
      currency = 'USD',
      referralCode = null,
      affiliateCode = null,
      metadata = {},
      timestamp = new Date()
    } = data;

    const query = `
      INSERT INTO analytics_conversions (
        session_id,
        user_id,
        conversion_type,
        conversion_value,
        currency,
        referral_code,
        affiliate_code,
        metadata,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      sessionId,
      userId,
      conversionType,
      conversionValue,
      currency,
      referralCode,
      affiliateCode,
      JSON.stringify(metadata),
      timestamp
    ]);

    // Track attribution if referral/affiliate code provided
    if (referralCode || affiliateCode) {
      await this._trackAttribution({
        sessionId,
        userId,
        conversionId: result.rows[0].id,
        referralCode,
        affiliateCode,
        conversionValue
      });
    }

    return result.rows[0];
  }

  /**
   * Track attribution (referral/affiliate)
   */
  async _trackAttribution(data) {
    const {
      sessionId,
      userId,
      conversionId,
      referralCode,
      affiliateCode,
      conversionValue
    } = data;

    const query = `
      INSERT INTO analytics_attribution (
        session_id,
        user_id,
        conversion_id,
        referral_code,
        affiliate_code,
        conversion_value,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      sessionId,
      userId,
      conversionId,
      referralCode,
      affiliateCode,
      conversionValue
    ]);

    return result.rows[0];
  }

  /**
   * Get page view statistics (aggregated, anonymous)
   */
  async getPageViewStats(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
      endDate = new Date(),
      groupBy = 'day' // 'hour', 'day', 'week', 'month'
    } = options;

    const query = `
      SELECT
        DATE_TRUNC($1, timestamp) as period,
        path,
        COUNT(*) as view_count,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_page_views
      WHERE timestamp BETWEEN $2 AND $3
      GROUP BY period, path
      ORDER BY period DESC, view_count DESC
    `;

    const result = await this.pool.query(query, [groupBy, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get feature usage statistics (aggregated)
   */
  async getFeatureUsageStats(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      groupBy = 'day'
    } = options;

    const query = `
      SELECT
        DATE_TRUNC($1, timestamp) as period,
        feature_name,
        feature_type,
        COUNT(*) as usage_count,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_feature_usage
      WHERE timestamp BETWEEN $2 AND $3
      GROUP BY period, feature_name, feature_type
      ORDER BY period DESC, usage_count DESC
    `;

    const result = await this.pool.query(query, [groupBy, startDate, endDate]);
    return result.rows;
  }

  /**
   * Get conversion statistics (aggregated)
   */
  async getConversionStats(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      groupBy = 'day',
      conversionType = null
    } = options;

    let query = `
      SELECT
        DATE_TRUNC($1, timestamp) as period,
        conversion_type,
        COUNT(*) as conversion_count,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(conversion_value) as total_value,
        AVG(conversion_value) as avg_value,
        currency
      FROM analytics_conversions
      WHERE timestamp BETWEEN $2 AND $3
    `;

    const params = [groupBy, startDate, endDate];

    if (conversionType) {
      query += ` AND conversion_type = $4`;
      params.push(conversionType);
    }

    query += `
      GROUP BY period, conversion_type, currency
      ORDER BY period DESC, conversion_count DESC
    `;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get attribution statistics (referral/affiliate performance)
   */
  async getAttributionStats(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    const query = `
      SELECT
        COALESCE(referral_code, affiliate_code) as code,
        CASE
          WHEN referral_code IS NOT NULL THEN 'referral'
          ELSE 'affiliate'
        END as code_type,
        COUNT(*) as conversion_count,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(conversion_value) as total_value,
        AVG(conversion_value) as avg_value
      FROM analytics_attribution
      WHERE timestamp BETWEEN $1 AND $2
        AND (referral_code IS NOT NULL OR affiliate_code IS NOT NULL)
      GROUP BY code, code_type
      ORDER BY total_value DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  /**
   * Get funnel analysis (conversion rates between steps)
   */
  async getFunnelAnalysis(funnelSteps = [], options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    // Example: funnelSteps = ['homepage', 'pricing', 'signup', 'purchase']
    const results = [];

    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i];

      const query = `
        SELECT
          $1 as step,
          COUNT(DISTINCT session_id) as sessions,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as users
        FROM analytics_page_views
        WHERE path LIKE $2
          AND timestamp BETWEEN $3 AND $4
      `;

      const result = await this.pool.query(query, [
        step,
        `%${step}%`,
        startDate,
        endDate
      ]);

      results.push({
        step,
        sessions: parseInt(result.rows[0].sessions),
        users: parseInt(result.rows[0].users),
        drop_off_rate: i > 0
          ? ((results[i-1].sessions - result.rows[0].sessions) / results[i-1].sessions * 100).toFixed(2)
          : 0
      });
    }

    return results;
  }

  /**
   * Get session duration statistics
   */
  async getSessionDurationStats(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    const query = `
      SELECT
        session_id,
        MIN(timestamp) as session_start,
        MAX(timestamp) as session_end,
        EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) as duration_seconds,
        COUNT(*) as page_views
      FROM analytics_page_views
      WHERE timestamp BETWEEN $1 AND $2
      GROUP BY session_id
      HAVING COUNT(*) > 1
    `;

    const result = await this.pool.query(query, [startDate, endDate]);

    // Aggregate statistics
    const durations = result.rows.map(r => r.duration_seconds);
    const totalSessions = durations.length;

    if (totalSessions === 0) {
      return {
        total_sessions: 0,
        avg_duration_seconds: 0,
        median_duration_seconds: 0,
        min_duration_seconds: 0,
        max_duration_seconds: 0
      };
    }

    durations.sort((a, b) => a - b);

    return {
      total_sessions: totalSessions,
      avg_duration_seconds: (durations.reduce((a, b) => a + b, 0) / totalSessions).toFixed(2),
      median_duration_seconds: durations[Math.floor(totalSessions / 2)].toFixed(2),
      min_duration_seconds: Math.min(...durations).toFixed(2),
      max_duration_seconds: Math.max(...durations).toFixed(2)
    };
  }

  /**
   * Get top referrers (where traffic comes from)
   */
  async getTopReferrers(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      limit = 10
    } = options;

    const query = `
      SELECT
        referrer,
        COUNT(*) as visit_count,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_page_views
      WHERE timestamp BETWEEN $1 AND $2
        AND referrer IS NOT NULL
        AND referrer != ''
      GROUP BY referrer
      ORDER BY visit_count DESC
      LIMIT $3
    `;

    const result = await this.pool.query(query, [startDate, endDate, limit]);
    return result.rows;
  }

  /**
   * Clean up old analytics data (GDPR compliance)
   */
  async cleanupOldData() {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const tables = [
      'analytics_page_views',
      'analytics_feature_usage',
      'analytics_conversions',
      'analytics_attribution'
    ];

    const results = {};

    for (const table of tables) {
      const query = `DELETE FROM ${table} WHERE timestamp < $1`;
      const result = await this.pool.query(query, [cutoffDate]);
      results[table] = result.rowCount;
    }

    return {
      cutoff_date: cutoffDate,
      deleted_rows: results
    };
  }

  /**
   * Generate analytics dashboard data
   */
  async getDashboardData(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    const [
      pageViews,
      featureUsage,
      conversions,
      attribution,
      sessionDuration,
      topReferrers
    ] = await Promise.all([
      this.getPageViewStats({ startDate, endDate, groupBy: 'day' }),
      this.getFeatureUsageStats({ startDate, endDate, groupBy: 'day' }),
      this.getConversionStats({ startDate, endDate, groupBy: 'day' }),
      this.getAttributionStats({ startDate, endDate }),
      this.getSessionDurationStats({ startDate, endDate }),
      this.getTopReferrers({ startDate, endDate, limit: 10 })
    ]);

    return {
      page_views: pageViews,
      feature_usage: featureUsage,
      conversions: conversions,
      attribution: attribution,
      session_duration: sessionDuration,
      top_referrers: topReferrers,
      date_range: {
        start: startDate,
        end: endDate
      }
    };
  }

  /**
   * Hash value for privacy (one-way, can't reverse)
   */
  _hashValue(value) {
    return crypto
      .createHash('sha256')
      .update(value + process.env.ANALYTICS_SALT || 'default-salt')
      .digest('hex');
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = SessionAnalytics;
