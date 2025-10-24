/**
 * Embed Manager - Backend for Embeddable Script System
 *
 * Provides Osano-like embeddable scripts for any website.
 * Combines: Cookie consent + OAuth + Analytics in one <script> tag
 *
 * Features:
 * - Generate embed sites and API keys
 * - Track events from embedded scripts
 * - Manage consent preferences
 * - Handle CORS for embedding
 * - Aggregate analytics
 *
 * Usage:
 *   const manager = new EmbedManager();
 *   const site = await manager.createSite({ domain: 'example.com', userId: 123 });
 *   await manager.trackEvent(siteId, { event_type: 'pageview', page_url: '/' });
 */

const { Pool } = require('pg');
const crypto = require('crypto');

class EmbedManager {
  constructor(config = {}) {
    this.pool = new Pool({
      connectionString: config.databaseUrl || process.env.DATABASE_URL
    });
  }

  /**
   * Create a new embed site
   *
   * @param {Object} data - Site data
   * @returns {Promise<Object>} Created site with siteId and apiKey
   */
  async createSite(data) {
    const {
      userId,
      domain,
      name,
      description = '',
      allowedOrigins = [],
      config = {},
      theme = {},
      consentText = {}
    } = data;

    const query = `
      INSERT INTO embed_sites (
        site_id,
        user_id,
        domain,
        name,
        description,
        allowed_origins,
        config,
        theme,
        consent_text,
        api_key
      ) VALUES (
        generate_site_id(),
        $1, $2, $3, $4, $5, $6, $7, $8,
        generate_api_key()
      )
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId,
      domain,
      name,
      description,
      allowedOrigins,
      JSON.stringify(config),
      JSON.stringify(theme),
      JSON.stringify(consentText)
    ]);

    return result.rows[0];
  }

  /**
   * Get site by site ID
   */
  async getSite(siteId) {
    const query = `
      SELECT * FROM embed_sites
      WHERE site_id = $1
    `;

    const result = await this.pool.query(query, [siteId]);
    return result.rows[0];
  }

  /**
   * Get site by API key (for server-side auth)
   */
  async getSiteByApiKey(apiKey) {
    const query = `
      SELECT * FROM embed_sites
      WHERE api_key = $1 AND status = 'active'
    `;

    const result = await this.pool.query(query, [apiKey]);
    return result.rows[0];
  }

  /**
   * Get all sites for a user
   */
  async getUserSites(userId) {
    const query = `
      SELECT * FROM embed_sites
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Update site configuration
   */
  async updateSite(siteId, updates) {
    const allowedFields = [
      'name',
      'description',
      'domain',
      'allowed_origins',
      'config',
      'theme',
      'consent_text',
      'consent_enabled',
      'auth_enabled',
      'analytics_enabled',
      'webhook_url',
      'webhook_secret',
      'status'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);

        // JSON fields need to be stringified
        if (['config', 'theme', 'consent_text'].includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }

        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(siteId);

    const query = `
      UPDATE embed_sites
      SET ${fields.join(', ')}
      WHERE site_id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete site
   */
  async deleteSite(siteId) {
    const query = `
      DELETE FROM embed_sites
      WHERE site_id = $1
      RETURNING site_id
    `;

    const result = await this.pool.query(query, [siteId]);
    return result.rowCount > 0;
  }

  /**
   * Track event from embedded script
   *
   * @param {string} siteId - Site ID
   * @param {Object} event - Event data
   * @returns {Promise<Object>} Created event
   */
  async trackEvent(siteId, event) {
    const {
      sessionId,
      visitorId = null,
      userId = null,
      eventType,
      eventName = null,
      eventData = {},
      pageUrl = null,
      pageTitle = null,
      referrer = null,
      userAgent = null,
      ipAddress = null,
      countryCode = null
    } = event;

    // Hash IP for privacy
    const ipHash = ipAddress ? this._hashValue(ipAddress) : null;

    const query = `
      INSERT INTO embed_events (
        site_id,
        session_id,
        visitor_id,
        user_id,
        event_type,
        event_name,
        event_data,
        page_url,
        page_title,
        referrer,
        user_agent,
        ip_hash,
        country_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, timestamp
    `;

    const result = await this.pool.query(query, [
      siteId,
      sessionId,
      visitorId,
      userId,
      eventType,
      eventName,
      JSON.stringify(eventData),
      pageUrl,
      pageTitle,
      referrer,
      userAgent,
      ipHash,
      countryCode
    ]);

    // Update or create session
    await this._updateSession(siteId, sessionId, visitorId, userId, event);

    return result.rows[0];
  }

  /**
   * Update or create session
   */
  async _updateSession(siteId, sessionId, visitorId, userId, event) {
    const { pageUrl, referrer, userAgent, ipAddress, countryCode } = event;
    const ipHash = ipAddress ? this._hashValue(ipAddress) : null;

    // Check if session exists
    const checkQuery = `
      SELECT id, page_views, events_count
      FROM embed_sessions
      WHERE session_id = $1
    `;

    const existing = await this.pool.query(checkQuery, [sessionId]);

    if (existing.rows.length > 0) {
      // Update existing session
      const session = existing.rows[0];

      const updateQuery = `
        UPDATE embed_sessions
        SET
          last_seen_at = CURRENT_TIMESTAMP,
          page_views = $1,
          events_count = $2,
          exit_url = $3,
          user_id = COALESCE($4, user_id)
        WHERE session_id = $5
      `;

      await this.pool.query(updateQuery, [
        session.page_views + (event.eventType === 'pageview' ? 1 : 0),
        session.events_count + 1,
        pageUrl,
        userId,
        sessionId
      ]);
    } else {
      // Create new session
      const insertQuery = `
        INSERT INTO embed_sessions (
          site_id,
          session_id,
          visitor_id,
          user_id,
          entry_url,
          referrer,
          user_agent,
          ip_hash,
          country_code,
          page_views,
          events_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 1)
      `;

      await this.pool.query(insertQuery, [
        siteId,
        sessionId,
        visitorId,
        userId,
        pageUrl,
        referrer,
        userAgent,
        ipHash,
        countryCode
      ]);
    }
  }

  /**
   * Save consent preferences
   */
  async saveConsent(siteId, consent) {
    const {
      visitorId,
      analyticsConsent = false,
      marketingConsent = false,
      functionalConsent = true,
      consentVersion = '1.0',
      ipAddress = null,
      userAgent = null,
      expiresAt = null
    } = consent;

    const ipHash = ipAddress ? this._hashValue(ipAddress) : null;

    // Revoke any existing consents for this visitor
    await this.pool.query(
      'UPDATE embed_consents SET revoked_at = CURRENT_TIMESTAMP WHERE site_id = $1 AND visitor_id = $2 AND revoked_at IS NULL',
      [siteId, visitorId]
    );

    // Insert new consent
    const query = `
      INSERT INTO embed_consents (
        site_id,
        visitor_id,
        analytics_consent,
        marketing_consent,
        functional_consent,
        consent_version,
        ip_hash,
        user_agent,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      siteId,
      visitorId,
      analyticsConsent,
      marketingConsent,
      functionalConsent,
      consentVersion,
      ipHash,
      userAgent,
      expiresAt
    ]);

    return result.rows[0];
  }

  /**
   * Get consent for visitor
   */
  async getConsent(siteId, visitorId) {
    const query = `
      SELECT * FROM embed_consents
      WHERE site_id = $1
        AND visitor_id = $2
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY granted_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [siteId, visitorId]);
    return result.rows[0] || null;
  }

  /**
   * Get analytics for site
   *
   * @param {string} siteId - Site ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Analytics data
   */
  async getAnalytics(siteId, startDate, endDate) {
    const query = `
      SELECT * FROM embed_analytics
      WHERE site_id = $1
        AND date >= $2
        AND date <= $3
      ORDER BY date ASC
    `;

    const result = await this.pool.query(query, [siteId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Compute analytics for a specific date
   * (Run daily via cron)
   */
  async computeAnalytics(siteId, date) {
    // Get date range
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Count unique visitors
    const visitorsQuery = `
      SELECT COUNT(DISTINCT visitor_id) as count
      FROM embed_events
      WHERE site_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
        AND visitor_id IS NOT NULL
    `;

    const visitorsResult = await this.pool.query(visitorsQuery, [siteId, startOfDay, endOfDay]);
    const uniqueVisitors = parseInt(visitorsResult.rows[0].count);

    // Count sessions
    const sessionsQuery = `
      SELECT COUNT(*) as count
      FROM embed_sessions
      WHERE site_id = $1
        AND started_at >= $2
        AND started_at <= $3
    `;

    const sessionsResult = await this.pool.query(sessionsQuery, [siteId, startOfDay, endOfDay]);
    const totalSessions = parseInt(sessionsResult.rows[0].count);

    // Count page views
    const pageViewsQuery = `
      SELECT COUNT(*) as count
      FROM embed_events
      WHERE site_id = $1
        AND event_type = 'pageview'
        AND timestamp >= $2
        AND timestamp <= $3
    `;

    const pageViewsResult = await this.pool.query(pageViewsQuery, [siteId, startOfDay, endOfDay]);
    const totalPageViews = parseInt(pageViewsResult.rows[0].count);

    // Average session duration
    const durationQuery = `
      SELECT AVG(EXTRACT(EPOCH FROM (last_seen_at - started_at))) as avg_duration
      FROM embed_sessions
      WHERE site_id = $1
        AND started_at >= $2
        AND started_at <= $3
        AND last_seen_at > started_at
    `;

    const durationResult = await this.pool.query(durationQuery, [siteId, startOfDay, endOfDay]);
    const avgSessionDuration = parseFloat(durationResult.rows[0].avg_duration) || 0;

    // Average pages per session
    const pagesPerSessionQuery = `
      SELECT AVG(page_views) as avg_pages
      FROM embed_sessions
      WHERE site_id = $1
        AND started_at >= $2
        AND started_at <= $3
    `;

    const pagesPerSessionResult = await this.pool.query(pagesPerSessionQuery, [siteId, startOfDay, endOfDay]);
    const avgPagesPerSession = parseFloat(pagesPerSessionResult.rows[0].avg_pages) || 0;

    // Bounce rate (sessions with only 1 page view)
    const bounceQuery = `
      SELECT
        COUNT(*) FILTER (WHERE page_views = 1) as bounces,
        COUNT(*) as total
      FROM embed_sessions
      WHERE site_id = $1
        AND started_at >= $2
        AND started_at <= $3
    `;

    const bounceResult = await this.pool.query(bounceQuery, [siteId, startOfDay, endOfDay]);
    const bounces = parseInt(bounceResult.rows[0].bounces);
    const totalForBounce = parseInt(bounceResult.rows[0].total);
    const bounceRate = totalForBounce > 0 ? (bounces / totalForBounce) * 100 : 0;

    // Consent stats
    const consentQuery = `
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'consent_shown') as shown,
        COUNT(*) FILTER (WHERE event_name = 'consent_accepted') as accepted,
        COUNT(*) FILTER (WHERE event_name = 'consent_rejected') as rejected
      FROM embed_events
      WHERE site_id = $1
        AND event_type = 'consent'
        AND timestamp >= $2
        AND timestamp <= $3
    `;

    const consentResult = await this.pool.query(consentQuery, [siteId, startOfDay, endOfDay]);
    const consentShown = parseInt(consentResult.rows[0].shown) || 0;
    const consentAccepted = parseInt(consentResult.rows[0].accepted) || 0;
    const consentRejected = parseInt(consentResult.rows[0].rejected) || 0;

    // Auth stats
    const authQuery = `
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'login_attempt') as attempts,
        COUNT(*) FILTER (WHERE event_name = 'login_success') as success,
        COUNT(*) FILTER (WHERE event_name = 'signup_success') as signups
      FROM embed_events
      WHERE site_id = $1
        AND event_type = 'auth'
        AND timestamp >= $2
        AND timestamp <= $3
    `;

    const authResult = await this.pool.query(authQuery, [siteId, startOfDay, endOfDay]);
    const loginAttempts = parseInt(authResult.rows[0].attempts) || 0;
    const successfulLogins = parseInt(authResult.rows[0].success) || 0;
    const newSignups = parseInt(authResult.rows[0].signups) || 0;

    // Conversions
    const conversionQuery = `
      SELECT
        COUNT(*) as count,
        SUM((event_data->>'value')::DECIMAL) as total_value
      FROM embed_events
      WHERE site_id = $1
        AND event_type = 'conversion'
        AND timestamp >= $2
        AND timestamp <= $3
    `;

    const conversionResult = await this.pool.query(conversionQuery, [siteId, startOfDay, endOfDay]);
    const conversions = parseInt(conversionResult.rows[0].count) || 0;
    const conversionValue = parseFloat(conversionResult.rows[0].total_value) || 0;

    // Insert or update analytics
    const upsertQuery = `
      INSERT INTO embed_analytics (
        site_id,
        date,
        unique_visitors,
        total_sessions,
        total_page_views,
        avg_session_duration,
        avg_pages_per_session,
        bounce_rate,
        consent_shown,
        consent_accepted,
        consent_rejected,
        login_attempts,
        successful_logins,
        new_signups,
        conversions,
        conversion_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (site_id, date)
      DO UPDATE SET
        unique_visitors = EXCLUDED.unique_visitors,
        total_sessions = EXCLUDED.total_sessions,
        total_page_views = EXCLUDED.total_page_views,
        avg_session_duration = EXCLUDED.avg_session_duration,
        avg_pages_per_session = EXCLUDED.avg_pages_per_session,
        bounce_rate = EXCLUDED.bounce_rate,
        consent_shown = EXCLUDED.consent_shown,
        consent_accepted = EXCLUDED.consent_accepted,
        consent_rejected = EXCLUDED.consent_rejected,
        login_attempts = EXCLUDED.login_attempts,
        successful_logins = EXCLUDED.successful_logins,
        new_signups = EXCLUDED.new_signups,
        conversions = EXCLUDED.conversions,
        conversion_value = EXCLUDED.conversion_value,
        computed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(upsertQuery, [
      siteId,
      date,
      uniqueVisitors,
      totalSessions,
      totalPageViews,
      avgSessionDuration,
      avgPagesPerSession,
      bounceRate,
      consentShown,
      consentAccepted,
      consentRejected,
      loginAttempts,
      successfulLogins,
      newSignups,
      conversions,
      conversionValue
    ]);

    return result.rows[0];
  }

  /**
   * Get embed code for site
   */
  getEmbedCode(siteId, options = {}) {
    const baseUrl = options.baseUrl || process.env.BASE_URL || 'http://localhost:5001';
    const async = options.async !== false;

    return `<!-- CALOS Embed (Consent + Auth + Analytics) -->
<script ${async ? 'async ' : ''}src="${baseUrl}/calos-embed.js" data-site-id="${siteId}"></script>`;
  }

  /**
   * Verify CORS origin
   */
  isOriginAllowed(site, origin) {
    if (!site.allowed_origins || site.allowed_origins.length === 0) {
      return true; // Allow all if not configured
    }

    // Check exact match
    if (site.allowed_origins.includes(origin)) {
      return true;
    }

    // Check wildcard patterns
    return site.allowed_origins.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(origin);
      }
      return false;
    });
  }

  /**
   * Hash value for privacy (SHA-256)
   */
  _hashValue(value) {
    return crypto
      .createHash('sha256')
      .update(value)
      .digest('hex');
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = EmbedManager;
