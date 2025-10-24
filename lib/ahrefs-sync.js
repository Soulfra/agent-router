/**
 * Ahrefs SEO Integration
 *
 * Automatically fetch and sync SEO data for all domains in the portfolio:
 * - Domain Rating (DR)
 * - Backlinks count
 * - Referring domains
 * - Organic keywords
 * - Organic traffic estimates
 * - Top pages by traffic
 * - Keyword rankings
 *
 * Uses Ahrefs API for comprehensive SEO analytics across 12-domain portfolio
 */

const https = require('https');

class AhrefsSync {
  constructor(db, options = {}) {
    this.db = db;
    this.enabled = options.enabled !== false;
    this.apiKey = options.apiKey || process.env.AHREFS_API_KEY;
    this.apiHost = 'apiv2.ahrefs.com';

    console.log('[Ahrefs] Initialized', {
      enabled: this.enabled,
      hasApiKey: !!this.apiKey
    });
  }

  /**
   * Make API request to Ahrefs
   * @private
   */
  async _apiRequest(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('Ahrefs API key not configured');
    }

    const queryParams = new URLSearchParams({
      ...params,
      token: this.apiKey
    }).toString();

    const path = `/v3/${endpoint}?${queryParams}`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.apiHost,
        path: path,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Failed to parse Ahrefs response: ${error.message}`));
            }
          } else {
            reject(new Error(`Ahrefs API error: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Ahrefs API request timeout'));
      });
      req.end();
    });
  }

  /**
   * Get domain metrics (DR, backlinks, referring domains)
   */
  async getDomainMetrics(domain) {
    console.log(`[Ahrefs] Fetching metrics for ${domain}...`);

    try {
      const response = await this._apiRequest('site-explorer/metrics', {
        target: domain,
        mode: 'domain'
      });

      const metrics = response.metrics || {};

      return {
        domain: domain,
        domain_rating: metrics.domain_rating || 0,
        ahrefs_rank: metrics.ahrefs_rank || null,
        backlinks: metrics.backlinks || 0,
        referring_domains: metrics.referring_domains || 0,
        organic_keywords: metrics.organic_keywords || 0,
        organic_traffic: metrics.organic_traffic || 0,
        last_updated: new Date()
      };
    } catch (error) {
      console.error(`[Ahrefs] Error fetching metrics for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get backlinks profile
   */
  async getBacklinks(domain, limit = 100) {
    console.log(`[Ahrefs] Fetching backlinks for ${domain}...`);

    try {
      const response = await this._apiRequest('site-explorer/backlinks', {
        target: domain,
        mode: 'domain',
        limit: limit,
        order_by: 'domain_rating:desc'
      });

      return response.backlinks || [];
    } catch (error) {
      console.error(`[Ahrefs] Error fetching backlinks for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Get organic keywords
   */
  async getOrganicKeywords(domain, limit = 100) {
    console.log(`[Ahrefs] Fetching organic keywords for ${domain}...`);

    try {
      const response = await this._apiRequest('site-explorer/organic-keywords', {
        target: domain,
        mode: 'domain',
        limit: limit,
        order_by: 'traffic:desc'
      });

      return response.keywords || [];
    } catch (error) {
      console.error(`[Ahrefs] Error fetching keywords for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Get top pages by organic traffic
   */
  async getTopPages(domain, limit = 50) {
    console.log(`[Ahrefs] Fetching top pages for ${domain}...`);

    try {
      const response = await this._apiRequest('site-explorer/top-pages', {
        target: domain,
        mode: 'domain',
        limit: limit,
        order_by: 'traffic:desc'
      });

      return response.pages || [];
    } catch (error) {
      console.error(`[Ahrefs] Error fetching top pages for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Get referring domains
   */
  async getReferringDomains(domain, limit = 100) {
    console.log(`[Ahrefs] Fetching referring domains for ${domain}...`);

    try {
      const response = await this._apiRequest('site-explorer/referring-domains', {
        target: domain,
        mode: 'domain',
        limit: limit,
        order_by: 'domain_rating:desc'
      });

      return response.referring_domains || [];
    } catch (error) {
      console.error(`[Ahrefs] Error fetching referring domains for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Sync domain metrics to database
   */
  async syncDomainMetrics(domain) {
    if (!this.enabled) return;

    const metrics = await this.getDomainMetrics(domain);
    if (!metrics) return;

    // Update domain_portfolio table with SEO metrics
    try {
      await this.db.query(`
        UPDATE domain_portfolio
        SET
          seo_domain_rating = $1,
          seo_ahrefs_rank = $2,
          seo_backlinks = $3,
          seo_referring_domains = $4,
          seo_organic_keywords = $5,
          seo_organic_traffic = $6,
          seo_last_updated = $7
        WHERE domain_name = $8
      `, [
        metrics.domain_rating,
        metrics.ahrefs_rank,
        metrics.backlinks,
        metrics.referring_domains,
        metrics.organic_keywords,
        metrics.organic_traffic,
        metrics.last_updated,
        domain
      ]);

      console.log(`[Ahrefs] Updated metrics for ${domain}`);
    } catch (error) {
      console.error(`[Ahrefs] Database error for ${domain}:`, error.message);
    }
  }

  /**
   * Sync keywords to database
   */
  async syncKeywords(domain) {
    if (!this.enabled) return;

    const keywords = await this.getOrganicKeywords(domain, 1000);
    if (keywords.length === 0) return;

    try {
      // Get domain_id
      const domainResult = await this.db.query(
        'SELECT domain_id FROM domain_portfolio WHERE domain_name = $1',
        [domain]
      );

      if (domainResult.rows.length === 0) {
        console.error(`[Ahrefs] Domain not found: ${domain}`);
        return;
      }

      const domainId = domainResult.rows[0].domain_id;

      // Insert keywords
      for (const keyword of keywords) {
        await this.db.query(`
          INSERT INTO seo_keywords (
            domain_id,
            keyword,
            position,
            search_volume,
            traffic,
            cpc,
            difficulty,
            url,
            last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (domain_id, keyword)
          DO UPDATE SET
            position = EXCLUDED.position,
            search_volume = EXCLUDED.search_volume,
            traffic = EXCLUDED.traffic,
            cpc = EXCLUDED.cpc,
            difficulty = EXCLUDED.difficulty,
            url = EXCLUDED.url,
            last_updated = NOW()
        `, [
          domainId,
          keyword.keyword,
          keyword.position || null,
          keyword.volume || 0,
          keyword.traffic || 0,
          keyword.cpc || 0,
          keyword.difficulty || 0,
          keyword.best_ranking_url || null
        ]);
      }

      console.log(`[Ahrefs] Synced ${keywords.length} keywords for ${domain}`);
    } catch (error) {
      console.error(`[Ahrefs] Error syncing keywords for ${domain}:`, error.message);
    }
  }

  /**
   * Sync backlinks to database
   */
  async syncBacklinks(domain) {
    if (!this.enabled) return;

    const backlinks = await this.getBacklinks(domain, 500);
    if (backlinks.length === 0) return;

    try {
      // Get domain_id
      const domainResult = await this.db.query(
        'SELECT domain_id FROM domain_portfolio WHERE domain_name = $1',
        [domain]
      );

      if (domainResult.rows.length === 0) {
        console.error(`[Ahrefs] Domain not found: ${domain}`);
        return;
      }

      const domainId = domainResult.rows[0].domain_id;

      // Insert backlinks
      for (const backlink of backlinks) {
        await this.db.query(`
          INSERT INTO seo_backlinks (
            domain_id,
            source_url,
            source_domain,
            source_domain_rating,
            target_url,
            anchor_text,
            link_type,
            first_seen,
            last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (domain_id, source_url, target_url)
          DO UPDATE SET
            source_domain_rating = EXCLUDED.source_domain_rating,
            anchor_text = EXCLUDED.anchor_text,
            link_type = EXCLUDED.link_type,
            last_updated = NOW()
        `, [
          domainId,
          backlink.url_from,
          backlink.domain_from,
          backlink.domain_rating || 0,
          backlink.url_to,
          backlink.anchor || '',
          backlink.type || 'unknown',
          backlink.first_seen || new Date()
        ]);
      }

      console.log(`[Ahrefs] Synced ${backlinks.length} backlinks for ${domain}`);
    } catch (error) {
      console.error(`[Ahrefs] Error syncing backlinks for ${domain}:`, error.message);
    }
  }

  /**
   * Sync all domains in portfolio
   */
  async syncAllDomains() {
    if (!this.enabled) {
      console.log('[Ahrefs] Sync disabled');
      return;
    }

    console.log('[Ahrefs] Starting full portfolio sync...');

    try {
      // Get all active domains from portfolio
      const result = await this.db.query(`
        SELECT domain_id, domain_name
        FROM domain_portfolio
        WHERE status IN ('active', 'development')
        ORDER BY domain_name
      `);

      const domains = result.rows;

      console.log(`[Ahrefs] Found ${domains.length} domains to sync`);

      for (const domain of domains) {
        console.log(`\n[Ahrefs] Processing ${domain.domain_name}...`);

        // Sync metrics
        await this.syncDomainMetrics(domain.domain_name);

        // Wait to avoid rate limiting
        await this._sleep(2000);

        // Sync keywords
        await this.syncKeywords(domain.domain_name);

        // Wait to avoid rate limiting
        await this._sleep(2000);

        // Sync backlinks
        await this.syncBacklinks(domain.domain_name);

        // Wait before next domain
        await this._sleep(5000);
      }

      console.log('\n[Ahrefs] Full portfolio sync complete!');
    } catch (error) {
      console.error('[Ahrefs] Sync error:', error.message);
      throw error;
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary() {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_domains,
          AVG(seo_domain_rating) as avg_domain_rating,
          SUM(seo_backlinks) as total_backlinks,
          SUM(seo_referring_domains) as total_referring_domains,
          SUM(seo_organic_keywords) as total_organic_keywords,
          SUM(seo_organic_traffic) as total_organic_traffic
        FROM domain_portfolio
        WHERE status IN ('active', 'development')
          AND seo_last_updated IS NOT NULL
      `);

      return result.rows[0] || {};
    } catch (error) {
      console.error('[Ahrefs] Error fetching portfolio summary:', error.message);
      return {};
    }
  }

  /**
   * Get domain rankings comparison
   */
  async getDomainRankings() {
    try {
      const result = await this.db.query(`
        SELECT
          domain_name,
          seo_domain_rating,
          seo_backlinks,
          seo_referring_domains,
          seo_organic_keywords,
          seo_organic_traffic,
          seo_last_updated
        FROM domain_portfolio
        WHERE status IN ('active', 'development')
          AND seo_last_updated IS NOT NULL
        ORDER BY seo_domain_rating DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('[Ahrefs] Error fetching domain rankings:', error.message);
      return [];
    }
  }

  /**
   * Sleep helper for rate limiting
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AhrefsSync;
