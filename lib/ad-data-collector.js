/**
 * Ad Data Collector
 *
 * "Like an adblocker, but instead of blocking ads, we accept them and harvest all the data"
 *
 * Features:
 * - Intercept ad impressions/clicks from campaign tracking
 * - Extract advertiser data, creative metadata, targeting info
 * - Analyze with Ollama for insights
 * - Feed to campaign analytics
 * - Email reports via gmail-relay
 *
 * Use Case: Turn ad exposure into competitive intelligence
 */

const axios = require('axios');
const cheerio = require('cheerio');

class AdDataCollector {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaClient = options.ollamaClient;
    this.gmailRelay = options.gmailRelay;
    this.campaignManager = options.campaignManager;

    this.config = {
      ollamaModel: options.ollamaModel || 'mistral:latest',
      ollamaHost: options.ollamaHost || 'http://127.0.0.1:11434',
      emailRecipients: options.emailRecipients || [],
      autoAnalyze: options.autoAnalyze !== false,
      cacheExpiry: options.cacheExpiry || 86400000 // 24 hours
    };

    // Ad data storage
    this.adData = [];
    this.cache = new Map();

    // Ad networks to track
    this.adNetworks = [
      'google', 'facebook', 'twitter', 'linkedin', 'reddit',
      'outbrain', 'taboola', 'revcontent', 'adroll', 'criteo'
    ];

    console.log('[AdDataCollector] Initialized');
    console.log(`  Tracking ${this.adNetworks.length} ad networks`);
  }

  /**
   * Collect ad data from impression
   */
  async collectImpression(impressionData) {
    try {
      console.log('[AdDataCollector] Collecting impression data');

      const extracted = {
        type: 'impression',
        timestamp: Date.now(),
        url: impressionData.url || null,
        referrer: impressionData.referrer || null,
        userAgent: impressionData.userAgent || null,

        // Ad metadata
        adNetwork: this._detectAdNetwork(impressionData),
        adId: impressionData.adId || null,
        campaignId: impressionData.campaignId || null,
        creativeId: impressionData.creativeId || null,

        // Targeting data (extracted from URL params)
        targeting: this._extractTargeting(impressionData.url),

        // Context
        context: {
          page: impressionData.page || null,
          placement: impressionData.placement || null,
          device: impressionData.device || null
        },

        // Raw data
        raw: impressionData
      };

      // Fetch ad creative if URL provided
      if (extracted.url) {
        extracted.creative = await this._fetchCreative(extracted.url);
      }

      // Analyze with Ollama
      if (this.config.autoAnalyze) {
        extracted.analysis = await this._analyzeAd(extracted);
      }

      // Store
      const adId = await this._storeAdData(extracted);
      extracted.id = adId;

      // Add to in-memory collection
      this.adData.push(extracted);

      // Send report if significant
      if (this._isSignificant(extracted)) {
        await this._sendAdReport(extracted);
      }

      return {
        success: true,
        ad_id: adId,
        data: extracted
      };

    } catch (error) {
      console.error('[AdDataCollector] Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Collect ad data from click
   */
  async collectClick(clickData) {
    try {
      console.log('[AdDataCollector] Collecting click data');

      const extracted = {
        type: 'click',
        timestamp: Date.now(),
        url: clickData.url || null,
        destination: clickData.destination || null,

        // Ad metadata
        adNetwork: this._detectAdNetwork(clickData),
        adId: clickData.adId || null,

        // Click tracking params
        clickId: clickData.clickId || null,
        trackingParams: this._extractTrackingParams(clickData.destination),

        // Attribution
        impressionId: clickData.impressionId || null,
        timeSinceImpression: clickData.timeSinceImpression || null,

        // Raw data
        raw: clickData
      };

      // Fetch landing page
      if (extracted.destination) {
        extracted.landingPage = await this._fetchLandingPage(extracted.destination);
      }

      // Analyze
      if (this.config.autoAnalyze) {
        extracted.analysis = await this._analyzeClick(extracted);
      }

      // Store
      const clickId = await this._storeClickData(extracted);
      extracted.id = clickId;

      return {
        success: true,
        click_id: clickId,
        data: extracted
      };

    } catch (error) {
      console.error('[AdDataCollector] Click error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect ad network from URL/params
   */
  _detectAdNetwork(data) {
    const url = data.url || data.destination || '';

    for (const network of this.adNetworks) {
      if (url.toLowerCase().includes(network)) {
        return network;
      }
    }

    // Check referrer
    const referrer = data.referrer || '';
    for (const network of this.adNetworks) {
      if (referrer.toLowerCase().includes(network)) {
        return network;
      }
    }

    return 'unknown';
  }

  /**
   * Extract targeting parameters from URL
   */
  _extractTargeting(url) {
    if (!url) return {};

    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams);

      // Common targeting param patterns
      const targeting = {};

      // Demographics
      if (params.age) targeting.age = params.age;
      if (params.gender) targeting.gender = params.gender;
      if (params.location) targeting.location = params.location;
      if (params.geo) targeting.geo = params.geo;

      // Interests
      if (params.interests) targeting.interests = params.interests.split(',');
      if (params.keywords) targeting.keywords = params.keywords.split(',');
      if (params.topics) targeting.topics = params.topics.split(',');

      // Behavior
      if (params.segment) targeting.segment = params.segment;
      if (params.audience) targeting.audience = params.audience;

      return targeting;
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract tracking parameters
   */
  _extractTrackingParams(url) {
    if (!url) return {};

    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams);

      // Common tracking params
      return {
        utm_source: params.utm_source,
        utm_medium: params.utm_medium,
        utm_campaign: params.utm_campaign,
        utm_term: params.utm_term,
        utm_content: params.utm_content,
        gclid: params.gclid, // Google Click ID
        fbclid: params.fbclid, // Facebook Click ID
        msclkid: params.msclkid // Microsoft Click ID
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Fetch ad creative content
   */
  async _fetchCreative(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AdDataCollector/1.0)'
        }
      });

      const $ = cheerio.load(response.data);

      return {
        title: $('title').text(),
        description: $('meta[name="description"]').attr('content'),
        images: $('img').map((i, el) => $(el).attr('src')).get().slice(0, 5),
        text: $('body').text().slice(0, 500)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Fetch landing page content
   */
  async _fetchLandingPage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AdDataCollector/1.0)'
        }
      });

      const $ = cheerio.load(response.data);

      return {
        title: $('title').text(),
        h1: $('h1').first().text(),
        cta: $('button, .cta, [class*="button"]').map((i, el) => $(el).text()).get().slice(0, 3),
        forms: $('form').length,
        pricing: this._extractPricing($)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Extract pricing info from page
   */
  _extractPricing($) {
    const pricePatterns = [
      /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
      /€\d+(?:,\d{3})*(?:\.\d{2})?/g,
      /£\d+(?:,\d{3})*(?:\.\d{2})?/g
    ];

    const text = $('body').text();
    const prices = [];

    for (const pattern of pricePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        prices.push(...matches);
      }
    }

    return prices.slice(0, 5);
  }

  /**
   * Analyze ad with Ollama
   */
  async _analyzeAd(adData) {
    const prompt = `Analyze this advertisement:

Ad Network: ${adData.adNetwork}
URL: ${adData.url}
Targeting: ${JSON.stringify(adData.targeting)}
Creative: ${JSON.stringify(adData.creative)}

Provide:
1. Advertiser Identity (who's running this ad?)
2. Target Audience (who are they trying to reach?)
3. Value Proposition (what's the offer?)
4. Ad Quality (low/medium/high)
5. Competitive Insights (how could we compete?)

Be concise.`;

    try {
      const response = await axios.post(`${this.config.ollamaHost}/api/generate`, {
        model: this.config.ollamaModel,
        prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      return `Analysis unavailable: ${error.message}`;
    }
  }

  /**
   * Analyze click behavior
   */
  async _analyzeClick(clickData) {
    const prompt = `Analyze this ad click:

Destination: ${clickData.destination}
Tracking Params: ${JSON.stringify(clickData.trackingParams)}
Landing Page: ${JSON.stringify(clickData.landingPage)}

Provide:
1. Conversion Likelihood (low/medium/high)
2. Landing Page Quality (low/medium/high)
3. Funnel Strategy (what's their conversion strategy?)
4. Optimization Ideas (how to improve conversion)

Be concise.`;

    try {
      const response = await axios.post(`${this.config.ollamaHost}/api/generate`, {
        model: this.config.ollamaModel,
        prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      return `Analysis unavailable: ${error.message}`;
    }
  }

  /**
   * Store ad data in database
   */
  async _storeAdData(adData) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO ad_data_collection (
          type,
          ad_network,
          url,
          targeting,
          creative,
          analysis,
          raw_data,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `, [
        adData.type,
        adData.adNetwork,
        adData.url,
        JSON.stringify(adData.targeting),
        JSON.stringify(adData.creative),
        adData.analysis,
        JSON.stringify(adData.raw)
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.warn('[AdDataCollector] Failed to store ad data:', error.message);
      return null;
    }
  }

  /**
   * Store click data
   */
  async _storeClickData(clickData) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO ad_click_collection (
          ad_network,
          destination,
          tracking_params,
          landing_page,
          analysis,
          raw_data,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `, [
        clickData.adNetwork,
        clickData.destination,
        JSON.stringify(clickData.trackingParams),
        JSON.stringify(clickData.landingPage),
        clickData.analysis,
        JSON.stringify(clickData.raw)
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.warn('[AdDataCollector] Failed to store click data:', error.message);
      return null;
    }
  }

  /**
   * Check if ad is significant enough to report
   */
  _isSignificant(adData) {
    // Report if:
    // - From major network
    // - Has targeting data
    // - Creative was successfully fetched
    return (
      this.adNetworks.includes(adData.adNetwork) ||
      Object.keys(adData.targeting).length > 0 ||
      (adData.creative && !adData.creative.error)
    );
  }

  /**
   * Send ad report via email
   */
  async _sendAdReport(adData) {
    if (!this.gmailRelay || this.config.emailRecipients.length === 0) return;

    const subject = `Ad Data Collected: ${adData.adNetwork} - ${adData.type}`;
    const body = `
Ad Data Collection Report

Type: ${adData.type}
Network: ${adData.adNetwork}
URL: ${adData.url}

🎯 Targeting:
${JSON.stringify(adData.targeting, null, 2)}

🎨 Creative:
${adData.creative ? JSON.stringify(adData.creative, null, 2) : 'Not available'}

🤖 AI Analysis:
${adData.analysis || 'Not analyzed'}

📊 View Full Data: http://localhost:5001/api/auto-analytics/ads/${adData.id}

---
Auto-generated by Ad Data Collector
`;

    for (const recipient of this.config.emailRecipients) {
      try {
        await this.gmailRelay.send({
          userId: 'cal',
          to: recipient,
          subject,
          body
        });
      } catch (error) {
        console.error('[AdDataCollector] Email failed:', error.message);
      }
    }
  }

  /**
   * Get collection summary
   */
  async getSummary(limit = 20) {
    if (!this.db) {
      return {
        success: true,
        inMemory: this.adData.slice(-limit)
      };
    }

    try {
      const result = await this.db.query(`
        SELECT
          id,
          type,
          ad_network,
          url,
          targeting,
          created_at
        FROM ad_data_collection
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return {
        success: true,
        data: result.rows,
        total: this.adData.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get network analytics
   */
  getNetworkStats() {
    const stats = {};

    for (const ad of this.adData) {
      const network = ad.adNetwork;
      if (!stats[network]) {
        stats[network] = {
          impressions: 0,
          clicks: 0,
          targeting: new Set()
        };
      }

      if (ad.type === 'impression') {
        stats[network].impressions++;
      } else if (ad.type === 'click') {
        stats[network].clicks++;
      }

      // Collect targeting params
      for (const key in ad.targeting) {
        stats[network].targeting.add(key);
      }
    }

    // Convert sets to arrays
    for (const network in stats) {
      stats[network].targeting = Array.from(stats[network].targeting);
    }

    return stats;
  }
}

module.exports = AdDataCollector;
