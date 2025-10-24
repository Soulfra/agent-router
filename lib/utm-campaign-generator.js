/**
 * UTM Campaign Generator
 *
 * Auto-generates UTM tracking parameters for ALL published content:
 * - utm_source: Platform where content is published (mastodon, blog, twitter, youtube, etc.)
 * - utm_medium: Content type (organic, social, email, video, audio, forum)
 * - utm_campaign: Campaign identifier (voice-journal-2025-10-22, privacy-series, etc.)
 * - utm_content: Variant identifier (es-alice, ja-cal, en-bob, etc.)
 * - utm_term: Topic keywords (privacy, zero-knowledge, data-brokers, etc.)
 *
 * Integrates with:
 * - Campaign Manager (lib/campaign-manager.js)
 * - Affiliate Tracker (lib/affiliate-tracker.js)
 * - Analytics tracking
 *
 * Usage:
 *   const generator = new UTMCampaignGenerator({ db });
 *
 *   const trackedUrl = generator.addUTMParams({
 *     url: 'https://soulfra.com/blog/privacy-101',
 *     source: 'mastodon',
 *     medium: 'social',
 *     campaign: 'voice-journal-2025-10-22',
 *     content: 'es-alice',
 *     term: 'privacy'
 *   });
 *   // → https://soulfra.com/blog/privacy-101?utm_source=mastodon&utm_medium=social&utm_campaign=voice-journal-2025-10-22&utm_content=es-alice&utm_term=privacy
 *
 *   // Smart generation from context
 *   const urls = await generator.generateForContent({
 *     narrative,
 *     platform: 'mastodon',
 *     language: 'es',
 *     persona: 'alice',
 *     sessionId: 'session_123'
 *   });
 */

const { EventEmitter } = require('events');
const { URL } = require('url');

class UTMCampaignGenerator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;

    // Platform → medium mapping
    this.platformMedium = {
      mastodon: 'social',
      twitter: 'social',
      linkedin: 'social',
      blog: 'organic',
      youtube: 'video',
      podcast: 'audio',
      newsletter: 'email',
      forum: 'forum',
      reddit: 'forum',
      hackernews: 'forum'
    };

    // Brand → affiliate tag mapping
    this.affiliateTags = {
      soulfra: 'soulfra-20',
      deathtodata: 'deathtodata-20',
      calriven: 'calriven-20',
      calos: 'calos-20',
      roughsparks: 'roughsparks-20',
      drseuss: 'drseuss-20',
      publishing: 'publishing-20'
    };

    console.log('[UTMCampaignGenerator] Initialized');
  }

  /**
   * Add UTM parameters to URL
   */
  addUTMParams(options) {
    const {
      url,
      source,
      medium = null,
      campaign,
      content = null,
      term = null,
      affiliateTag = null
    } = options;

    try {
      const urlObj = new URL(url);

      // Add UTM parameters
      urlObj.searchParams.set('utm_source', source);

      if (medium) {
        urlObj.searchParams.set('utm_medium', medium);
      } else {
        // Auto-detect medium from source
        const autoMedium = this.platformMedium[source] || 'referral';
        urlObj.searchParams.set('utm_medium', autoMedium);
      }

      urlObj.searchParams.set('utm_campaign', campaign);

      if (content) {
        urlObj.searchParams.set('utm_content', content);
      }

      if (term) {
        urlObj.searchParams.set('utm_term', term);
      }

      // Add affiliate tag for supported domains
      if (affiliateTag && this._supportsAffiliateTag(urlObj.hostname)) {
        urlObj.searchParams.set('tag', affiliateTag);
      }

      return urlObj.toString();

    } catch (error) {
      console.error('[UTMCampaignGenerator] URL parsing error:', error.message);
      return url; // Return original URL if parsing fails
    }
  }

  /**
   * Generate UTM-tracked URLs for all links in content
   */
  async generateForContent(options) {
    const {
      narrative,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      topics = []
    } = options;

    // Build campaign identifier
    const campaign = this._buildCampaignId({
      sessionId,
      date: new Date(),
      brand
    });

    // Build content identifier (language-persona)
    const content = persona ? `${language}-${persona}` : language;

    // Build term (first topic or extract from narrative)
    const term = topics.length > 0 ? topics[0] : this._extractPrimaryTopic(narrative);

    // Get affiliate tag for brand
    const affiliateTag = brand ? this.affiliateTags[brand] : null;

    // Base UTM params
    const baseParams = {
      source: platform,
      medium: this.platformMedium[platform] || 'referral',
      campaign,
      content,
      term,
      affiliateTag
    };

    console.log(`[UTMCampaignGenerator] Generated params for ${platform} (${language}, ${persona}):`, baseParams);

    return baseParams;
  }

  /**
   * Enrich link with UTM parameters
   */
  enrichLink(url, utmParams) {
    return this.addUTMParams({
      url,
      ...utmParams
    });
  }

  /**
   * Extract all links from content and enrich with UTMs
   */
  enrichContentLinks(content, utmParams) {
    // Regex to match URLs
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;

    return content.replace(urlRegex, (match) => {
      return this.enrichLink(match, utmParams);
    });
  }

  /**
   * Build campaign ID from context
   */
  _buildCampaignId(options) {
    const { sessionId, date, brand } = options;

    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (sessionId) {
      return `voice-journal-${dateStr}-${sessionId.substring(0, 8)}`;
    }

    if (brand) {
      return `${brand}-content-${dateStr}`;
    }

    return `content-${dateStr}`;
  }

  /**
   * Extract primary topic from narrative
   */
  _extractPrimaryTopic(narrative) {
    // Try to get from themes
    if (narrative.themes && narrative.themes.length > 0) {
      return narrative.themes[0].name || narrative.themes[0];
    }

    // Try to get from title
    if (narrative.title) {
      const words = narrative.title.toLowerCase().split(/\s+/);
      // Common keywords
      const keywords = ['privacy', 'security', 'ai', 'crypto', 'blockchain', 'zero-knowledge', 'data', 'surveillance'];
      const found = words.find(w => keywords.includes(w));
      if (found) return found;
    }

    return 'content';
  }

  /**
   * Check if domain supports affiliate tags
   */
  _supportsAffiliateTag(hostname) {
    const affiliateDomains = [
      'amazon.com',
      'amazon.co.uk',
      'amazon.de',
      'amazon.fr',
      'amazon.es',
      'amazon.it',
      'amazon.ca',
      'amazon.co.jp'
    ];

    return affiliateDomains.some(domain => hostname.includes(domain));
  }

  /**
   * Track UTM campaign performance
   */
  async trackClick(options) {
    if (!this.db) return;

    const {
      url,
      source,
      medium,
      campaign,
      content,
      term,
      userId = null,
      metadata = {}
    } = options;

    try {
      await this.db.query(`
        INSERT INTO utm_campaign_clicks (
          url,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term,
          user_id,
          metadata,
          clicked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [url, source, medium, campaign, content, term, userId, JSON.stringify(metadata)]);

      this.emit('click:tracked', {
        campaign,
        source,
        medium,
        content
      });

    } catch (error) {
      console.error('[UTMCampaignGenerator] Track click error:', error.message);
    }
  }

  /**
   * Track conversion from UTM campaign
   */
  async trackConversion(options) {
    if (!this.db) return;

    const {
      campaign,
      source,
      medium,
      content,
      term,
      conversionType = 'purchase', // purchase | signup | download | click
      conversionValue = 0, // Revenue in cents
      userId = null,
      metadata = {}
    } = options;

    try {
      await this.db.query(`
        INSERT INTO utm_campaign_conversions (
          utm_campaign,
          utm_source,
          utm_medium,
          utm_content,
          utm_term,
          conversion_type,
          conversion_value_cents,
          user_id,
          metadata,
          converted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [campaign, source, medium, content, term, conversionType, conversionValue, userId, JSON.stringify(metadata)]);

      console.log(`[UTMCampaignGenerator] Conversion tracked: ${campaign} → $${conversionValue / 100}`);

      this.emit('conversion:tracked', {
        campaign,
        source,
        medium,
        content,
        conversionValue
      });

    } catch (error) {
      console.error('[UTMCampaignGenerator] Track conversion error:', error.message);
    }
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(campaign) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const query = `
      SELECT
        utm_campaign,
        utm_source,
        utm_medium,
        utm_content,
        COUNT(DISTINCT c.id) as clicks,
        COUNT(DISTINCT conv.id) as conversions,
        COALESCE(SUM(conv.conversion_value_cents), 0) as total_revenue_cents,
        CASE
          WHEN COUNT(DISTINCT c.id) > 0
          THEN (COUNT(DISTINCT conv.id)::float / COUNT(DISTINCT c.id) * 100)
          ELSE 0
        END as conversion_rate
      FROM utm_campaign_clicks c
      LEFT JOIN utm_campaign_conversions conv
        ON c.utm_campaign = conv.utm_campaign
        AND c.utm_source = conv.utm_source
        AND c.utm_content = conv.utm_content
      WHERE c.utm_campaign = $1
      GROUP BY utm_campaign, utm_source, utm_medium, utm_content
      ORDER BY total_revenue_cents DESC
    `;

    try {
      const result = await this.db.query(query, [campaign]);

      return result.rows.map(row => ({
        campaign: row.utm_campaign,
        source: row.utm_source,
        medium: row.utm_medium,
        content: row.utm_content,
        clicks: parseInt(row.clicks),
        conversions: parseInt(row.conversions),
        revenue: parseFloat(row.total_revenue_cents) / 100,
        conversionRate: parseFloat(row.conversion_rate)
      }));

    } catch (error) {
      console.error('[UTMCampaignGenerator] Performance query error:', error.message);
      return [];
    }
  }

  /**
   * Get top performing variants
   */
  async getTopPerformers(options = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const {
      metric = 'revenue', // revenue | conversions | clicks | conversion_rate
      limit = 10,
      startDate = null,
      endDate = null
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`c.clicked_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`c.clicked_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const orderByMap = {
      revenue: 'total_revenue_cents DESC',
      conversions: 'conversions DESC',
      clicks: 'clicks DESC',
      conversion_rate: 'conversion_rate DESC'
    };

    const orderBy = orderByMap[metric] || orderByMap.revenue;

    params.push(limit);

    const query = `
      SELECT
        utm_campaign,
        utm_source,
        utm_medium,
        utm_content,
        utm_term,
        COUNT(DISTINCT c.id) as clicks,
        COUNT(DISTINCT conv.id) as conversions,
        COALESCE(SUM(conv.conversion_value_cents), 0) as total_revenue_cents,
        CASE
          WHEN COUNT(DISTINCT c.id) > 0
          THEN (COUNT(DISTINCT conv.id)::float / COUNT(DISTINCT c.id) * 100)
          ELSE 0
        END as conversion_rate
      FROM utm_campaign_clicks c
      LEFT JOIN utm_campaign_conversions conv
        ON c.utm_campaign = conv.utm_campaign
        AND c.utm_source = conv.utm_source
        AND c.utm_content = conv.utm_content
      ${whereClause}
      GROUP BY utm_campaign, utm_source, utm_medium, utm_content, utm_term
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}
    `;

    try {
      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        campaign: row.utm_campaign,
        source: row.utm_source,
        medium: row.utm_medium,
        content: row.utm_content,
        term: row.utm_term,
        clicks: parseInt(row.clicks),
        conversions: parseInt(row.conversions),
        revenue: parseFloat(row.total_revenue_cents) / 100,
        conversionRate: parseFloat(row.conversion_rate)
      }));

    } catch (error) {
      console.error('[UTMCampaignGenerator] Top performers query error:', error.message);
      return [];
    }
  }

  /**
   * Generate product/service URLs with UTM tracking
   */
  generateProductURLs(options) {
    const {
      baseUrls, // { amazon: 'https://amazon.com/dp/B08X...', gumroad: '...', course: '...' }
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics = []
    } = options;

    const utmParams = {
      source: platform,
      medium: this.platformMedium[platform] || 'referral',
      campaign: this._buildCampaignId({ sessionId, date: new Date(), brand }),
      content: persona ? `${language}-${persona}` : language,
      term: topics.length > 0 ? topics[0] : 'product',
      affiliateTag: brand ? this.affiliateTags[brand] : null
    };

    const trackedUrls = {};

    for (const [key, url] of Object.entries(baseUrls)) {
      trackedUrls[key] = this.enrichLink(url, utmParams);
    }

    return trackedUrls;
  }

  /**
   * Parse UTM parameters from URL
   */
  parseUTMParams(url) {
    try {
      const urlObj = new URL(url);

      return {
        source: urlObj.searchParams.get('utm_source'),
        medium: urlObj.searchParams.get('utm_medium'),
        campaign: urlObj.searchParams.get('utm_campaign'),
        content: urlObj.searchParams.get('utm_content'),
        term: urlObj.searchParams.get('utm_term')
      };
    } catch (error) {
      return null;
    }
  }
}

module.exports = UTMCampaignGenerator;
