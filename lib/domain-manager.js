/**
 * Domain Portfolio Manager
 *
 * Manages Matthew Mauer's 12-domain portfolio:
 * - WHOIS data collection
 * - Partner rotation logic
 * - Cross-domain analytics
 * - Trademark tracking
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class DomainManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Add a new domain to the portfolio
   */
  async addDomain(domainData) {
    const {
      domain_name,
      brand_name,
      brand_tagline,
      brand_description,
      logo_url,
      primary_color,
      secondary_color,
      category,
      primary_radi,
      secondary_radi = [],
      services = [],
      keywords = []
    } = domainData;

    const query = `
      INSERT INTO domain_portfolio (
        domain_id, domain_name, brand_name, brand_tagline, brand_description,
        logo_url, primary_color, secondary_color, category, primary_radi,
        secondary_radi, services, keywords, owner_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (domain_name)
      DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        brand_tagline = EXCLUDED.brand_tagline,
        brand_description = EXCLUDED.brand_description,
        logo_url = EXCLUDED.logo_url,
        primary_color = EXCLUDED.primary_color,
        updated_at = NOW()
      RETURNING *;
    `;

    const domain_id = uuidv4();
    const values = [
      domain_id,
      domain_name,
      brand_name,
      brand_tagline || null,
      brand_description || null,
      logo_url || null,
      primary_color || '#667eea',
      secondary_color || '#764ba2',
      category || 'business',
      primary_radi || 'business',
      secondary_radi,
      services,
      keywords,
      'Matthew Mauer',
      'active'
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Fetch WHOIS data for a domain
   * (In production, use a WHOIS API service)
   */
  async fetchWHOIS(domain_name) {
    try {
      // For now, return mock data
      // In production, integrate with WHOIS API: https://www.whoisxmlapi.com/
      const mockData = {
        registrar: 'Example Registrar',
        registration_date: '2020-01-01',
        expiry_date: '2026-01-01',
        nameservers: ['ns1.example.com', 'ns2.example.com'],
        owner_email: 'matthew@example.com'
      };

      // Update database
      const query = `
        UPDATE domain_portfolio
        SET
          registrar = $1,
          registration_date = $2,
          expiry_date = $3,
          nameservers = $4,
          owner_email = $5,
          last_whois_check = NOW(),
          updated_at = NOW()
        WHERE domain_name = $6
        RETURNING *;
      `;

      const values = [
        mockData.registrar,
        mockData.registration_date,
        mockData.expiry_date,
        mockData.nameservers,
        mockData.owner_email,
        domain_name
      ];

      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error(`WHOIS fetch failed for ${domain_name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all active domains
   * @param {boolean} includePrivate - Include domains with public_display=false
   */
  async getActiveDomains(includePrivate = false) {
    const query = includePrivate
      ? `SELECT * FROM domain_portfolio WHERE status = 'active' ORDER BY monthly_visitors DESC;`
      : `SELECT * FROM active_domains ORDER BY monthly_visitors DESC;`;

    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Toggle public display for a domain
   */
  async togglePublicDisplay(domain_name, isPublic) {
    const query = `
      UPDATE domain_portfolio
      SET public_display = $1, updated_at = NOW()
      WHERE domain_name = $2
      RETURNING *;
    `;
    const result = await this.db.query(query, [isPublic, domain_name]);
    return result.rows[0];
  }

  /**
   * Get partner suggestions for a domain
   * Uses smart rotation: category match + least recently shown
   */
  async getPartnerSuggestions(domain_name, count = 4) {
    // First, get the source domain ID
    const domainQuery = `
      SELECT domain_id FROM domain_portfolio
      WHERE domain_name = $1 AND status = 'active';
    `;
    const domainResult = await this.db.query(domainQuery, [domain_name]);

    if (domainResult.rows.length === 0) {
      throw new Error(`Domain ${domain_name} not found or inactive`);
    }

    const source_domain_id = domainResult.rows[0].domain_id;

    // Use the database function for smart partner selection
    const query = `SELECT * FROM get_partner_suggestions($1, $2);`;
    const result = await this.db.query(query, [source_domain_id, count]);

    // Log the rotation for analytics
    if (result.rows.length > 0) {
      const partner_ids = result.rows.map(r => r.domain_id);
      await this.logRotation(source_domain_id, partner_ids);
    }

    return result.rows;
  }

  /**
   * Log a partner rotation
   */
  async logRotation(source_domain_id, displayed_partner_ids) {
    const query = `
      INSERT INTO partner_rotations (
        rotation_id, source_domain_id, displayed_partner_ids, last_rotated_at
      ) VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
    const values = [uuidv4(), source_domain_id, displayed_partner_ids];
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Track a partner click
   */
  async trackPartnerClick(source_domain_name, target_domain_name, session_id, referrer = null) {
    // Get domain IDs
    const domainQuery = `
      SELECT domain_id FROM domain_portfolio WHERE domain_name = $1;
    `;

    const [sourceResult, targetResult] = await Promise.all([
      this.db.query(domainQuery, [source_domain_name]),
      this.db.query(domainQuery, [target_domain_name])
    ]);

    if (sourceResult.rows.length === 0 || targetResult.rows.length === 0) {
      throw new Error('Source or target domain not found');
    }

    const source_domain_id = sourceResult.rows[0].domain_id;
    const target_domain_id = targetResult.rows[0].domain_id;

    // Insert click tracking
    const query = `
      INSERT INTO partner_clicks (
        click_id, source_domain_id, target_domain_id, session_id, referrer, clicked_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;

    const values = [uuidv4(), source_domain_id, target_domain_id, session_id, referrer];
    const result = await this.db.query(query, values);

    // Also log to cross-domain analytics
    await this.logAnalyticsEvent({
      session_id,
      event_type: 'partner_click',
      source_domain_id,
      target_domain_id,
      page_path: '/partner-link'
    });

    return result.rows[0];
  }

  /**
   * Log cross-domain analytics event
   */
  async logAnalyticsEvent(eventData) {
    const {
      session_id,
      event_type,
      source_domain_id,
      target_domain_id = null,
      utm_source = null,
      utm_medium = null,
      utm_campaign = null,
      utm_content = null,
      conversion_type = null,
      conversion_value = null,
      user_agent = null,
      referrer = null,
      page_path = null
    } = eventData;

    const query = `
      INSERT INTO cross_domain_analytics (
        event_id, session_id, event_type, source_domain_id, target_domain_id,
        utm_source, utm_medium, utm_campaign, utm_content,
        conversion_type, conversion_value, user_agent, referrer, page_path, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *;
    `;

    const values = [
      uuidv4(),
      session_id,
      event_type,
      source_domain_id,
      target_domain_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      conversion_type,
      conversion_value,
      user_agent,
      referrer,
      page_path
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Track a conversion (signup, purchase, etc.)
   */
  async trackConversion(session_id, domain_name, conversion_type, conversion_value = 0) {
    // Get domain ID
    const domainQuery = `
      SELECT domain_id FROM domain_portfolio WHERE domain_name = $1;
    `;
    const domainResult = await this.db.query(domainQuery, [domain_name]);

    if (domainResult.rows.length === 0) {
      throw new Error(`Domain ${domain_name} not found`);
    }

    const domain_id = domainResult.rows[0].domain_id;

    // Update partner_clicks if this came from a partner link
    const updateClickQuery = `
      UPDATE partner_clicks
      SET converted = TRUE, conversion_value = $1
      WHERE session_id = $2 AND target_domain_id = $3
      RETURNING *;
    `;
    await this.db.query(updateClickQuery, [conversion_value, session_id, domain_id]);

    // Log to analytics
    return await this.logAnalyticsEvent({
      session_id,
      event_type: 'conversion',
      source_domain_id: domain_id,
      conversion_type,
      conversion_value
    });
  }

  /**
   * Get portfolio analytics summary
   */
  async getPortfolioSummary() {
    const queries = {
      totalDomains: `SELECT COUNT(*) as count FROM domain_portfolio WHERE status = 'active';`,
      totalClicks: `SELECT COUNT(*) as count FROM partner_clicks;`,
      totalConversions: `SELECT COUNT(*) as count FROM partner_clicks WHERE converted = TRUE;`,
      totalRevenue: `SELECT SUM(conversion_value) as total FROM partner_clicks WHERE converted = TRUE;`,
      topPerformers: `
        SELECT domain_name, total_clicks_received, total_conversions
        FROM partner_performance
        ORDER BY total_clicks_received DESC
        LIMIT 5;
      `,
      recentActivity: `
        SELECT event_type, COUNT(*) as count
        FROM cross_domain_analytics
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY event_type
        ORDER BY count DESC;
      `
    };

    const results = await Promise.all(
      Object.entries(queries).map(async ([key, query]) => {
        const result = await this.db.query(query);
        return [key, result.rows];
      })
    );

    return Object.fromEntries(results);
  }

  /**
   * Add or update keyword tracking
   */
  async trackKeyword(keywordData) {
    const {
      keyword,
      primary_domain_name,
      search_volume = 0,
      competition_level = 'medium',
      suggested_bid = 0,
      quality_score = null
    } = keywordData;

    // Get primary domain ID
    const domainQuery = `
      SELECT domain_id FROM domain_portfolio WHERE domain_name = $1;
    `;
    const domainResult = await this.db.query(domainQuery, [primary_domain_name]);

    if (domainResult.rows.length === 0) {
      throw new Error(`Domain ${primary_domain_name} not found`);
    }

    const primary_domain_id = domainResult.rows[0].domain_id;

    const query = `
      INSERT INTO keyword_tracking (
        keyword_id, keyword, primary_domain_id, search_volume,
        competition_level, suggested_bid, quality_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (keyword)
      DO UPDATE SET
        search_volume = EXCLUDED.search_volume,
        competition_level = EXCLUDED.competition_level,
        suggested_bid = EXCLUDED.suggested_bid,
        quality_score = EXCLUDED.quality_score,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      uuidv4(),
      keyword.toLowerCase(),
      primary_domain_id,
      search_volume,
      competition_level,
      suggested_bid,
      quality_score
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get keyword performance for AdWords optimization
   */
  async getKeywordPerformance(limit = 50) {
    const query = `
      SELECT * FROM keyword_performance
      ORDER BY quality_score DESC NULLS LAST, clicks DESC
      LIMIT $1;
    `;
    const result = await this.db.query(query, [limit]);
    return result.rows;
  }

  /**
   * Generate word map from recent searches/conversions
   */
  async generateWordMap(days = 30) {
    // Extract keywords from cross-domain analytics
    const query = `
      SELECT
        utm_content as keyword,
        COUNT(*) as mentions,
        SUM(CASE WHEN event_type = 'conversion' THEN 1 ELSE 0 END) as conversions,
        AVG(conversion_value) as avg_value
      FROM cross_domain_analytics
      WHERE timestamp > NOW() - INTERVAL '${days} days'
        AND utm_content IS NOT NULL
      GROUP BY utm_content
      ORDER BY conversions DESC, mentions DESC
      LIMIT 100;
    `;

    const result = await this.db.query(query);

    // Generate word map with frequency and conversion scores
    return result.rows.map(row => ({
      word: row.keyword,
      frequency: parseInt(row.mentions),
      conversions: parseInt(row.conversions),
      value: parseFloat(row.avg_value) || 0,
      score: parseInt(row.conversions) * 10 + parseInt(row.mentions)
    }));
  }

  /**
   * Add trademark information
   */
  async addTrademark(trademarkData) {
    const {
      domain_name,
      trademark_name,
      trademark_symbol = '™',
      registration_number = null,
      registration_date = null,
      trademark_class = null,
      jurisdiction = 'US',
      description = null
    } = trademarkData;

    // Get domain ID
    const domainQuery = `
      SELECT domain_id FROM domain_portfolio WHERE domain_name = $1;
    `;
    const domainResult = await this.db.query(domainQuery, [domain_name]);

    if (domainResult.rows.length === 0) {
      throw new Error(`Domain ${domain_name} not found`);
    }

    const domain_id = domainResult.rows[0].domain_id;

    const query = `
      INSERT INTO trademark_info (
        trademark_id, domain_id, trademark_name, trademark_symbol,
        registration_number, registration_date, trademark_class,
        jurisdiction, description, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const values = [
      uuidv4(),
      domain_id,
      trademark_name,
      trademark_symbol,
      registration_number,
      registration_date,
      trademark_class,
      jurisdiction,
      description,
      registration_number ? 'registered' : 'pending'
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get all trademarks in the portfolio
   */
  async getTrademarks() {
    const query = `
      SELECT
        t.*,
        dp.domain_name,
        dp.brand_name
      FROM trademark_info t
      JOIN domain_portfolio dp ON t.domain_id = dp.domain_id
      ORDER BY t.registration_date DESC NULLS LAST;
    `;
    const result = await this.db.query(query);
    return result.rows;
  }
}

module.exports = DomainManager;
