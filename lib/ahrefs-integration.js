/**
 * Ahrefs Integration
 *
 * Track SEO performance metrics via Ahrefs API:
 * - Keyword rankings (dragon keywords)
 * - Backlink monitoring
 * - Competitor analysis
 * - Domain rating/authority
 * - Organic traffic estimates
 *
 * Features:
 * - Track high-difficulty "dragon keywords" (60+ difficulty, 1k+ volume)
 * - Monitor case law citation backlinks
 * - Alert on ranking drops
 * - Store historical data in PostgreSQL
 *
 * Usage:
 *   const ahrefs = new AhrefsIntegration({ apiToken, db });
 *   await ahrefs.trackKeywordRankings(['privacy-first automation', 'HIPAA compliant']);
 *   const dragonKeywords = await ahrefs.getDragonKeywords();
 *
 * @requires AHREFS_API_TOKEN environment variable
 */

const { EventEmitter } = require('events');

class AhrefsIntegration extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiToken = options.apiToken || process.env.AHREFS_API_TOKEN;
    this.db = options.db;

    // Ahrefs API base URLs
    this.apiBase = 'https://api.ahrefs.com/v3';

    // Rate limits (Ahrefs Lite: 500 req/mo)
    this.rateLimitPerMonth = 500;
    this.requestCount = 0;

    // Target domain
    this.domain = options.domain || 'soulfra.github.io';

    console.log(`[Ahrefs] Initialized for domain: ${this.domain}`);
  }

  /**
   * Check keyword rankings for target keywords
   */
  async trackKeywordRankings(keywords) {
    if (!this.apiToken) {
      console.warn('[Ahrefs] API token not set. Skipping keyword tracking.');
      return null;
    }

    try {
      const results = [];

      for (const keyword of keywords) {
        // Check rate limit
        if (this.requestCount >= this.rateLimitPerMonth) {
          console.warn('[Ahrefs] Monthly rate limit reached. Skipping remaining keywords.');
          break;
        }

        // Fetch keyword data
        const data = await this.fetchKeywordData(keyword);
        this.requestCount++;

        // Store in database
        if (this.db) {
          await this.storeKeywordRanking(keyword, data);
        }

        results.push({
          keyword,
          position: data.position || null,
          volume: data.volume || 0,
          difficulty: data.difficulty || 0,
          cpc: data.cpc || 0,
          traffic: data.traffic || 0,
          url: data.url || null
        });

        // Emit event
        this.emit('keyword_tracked', { keyword, data });

        // Alert on ranking drop
        if (data.previousPosition && data.position > data.previousPosition + 5) {
          this.emit('ranking_drop', {
            keyword,
            oldPosition: data.previousPosition,
            newPosition: data.position,
            drop: data.position - data.previousPosition
          });
        }
      }

      return results;

    } catch (error) {
      console.error('[Ahrefs] Error tracking keywords:', error);
      throw error;
    }
  }

  /**
   * Fetch keyword data from Ahrefs API
   */
  async fetchKeywordData(keyword) {
    const url = `${this.apiBase}/keywords`;
    const params = new URLSearchParams({
      token: this.apiToken,
      keyword: keyword,
      target: this.domain,
      mode: 'exact',
      output: 'json'
    });

    const response = await fetch(`${url}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Ahrefs API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract relevant fields
    return {
      keyword: keyword,
      volume: data.volume || 0,
      difficulty: data.difficulty || 0,
      cpc: data.cpc || 0,
      position: data.positions?.[0]?.position || null,
      url: data.positions?.[0]?.url || null,
      traffic: data.positions?.[0]?.traffic || 0,
      timestamp: Date.now()
    };
  }

  /**
   * Store keyword ranking in database
   */
  async storeKeywordRanking(keyword, data) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO seo_keywords (
          keyword, domain, position, volume, difficulty, cpc, traffic, url, tracked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          keyword,
          this.domain,
          data.position,
          data.volume,
          data.difficulty,
          data.cpc,
          data.traffic,
          data.url
        ]
      );

      console.log(`[Ahrefs] Stored ranking for "${keyword}": Position ${data.position || 'N/A'}`);

    } catch (error) {
      console.error('[Ahrefs] Error storing keyword ranking:', error);
    }
  }

  /**
   * Get dragon keywords (high-difficulty, high-volume)
   * Target: 60+ difficulty, 1000+ volume
   */
  async getDragonKeywords(minDifficulty = 60, minVolume = 1000) {
    if (!this.db) {
      throw new Error('Database connection required for dragon keyword analysis');
    }

    try {
      const result = await this.db.query(
        `SELECT
          keyword,
          AVG(position) as avg_position,
          MAX(volume) as volume,
          MAX(difficulty) as difficulty,
          MAX(cpc) as cpc,
          COUNT(*) as tracking_count,
          MAX(tracked_at) as last_tracked
        FROM seo_keywords
        WHERE domain = $1
          AND difficulty >= $2
          AND volume >= $3
        GROUP BY keyword
        ORDER BY difficulty DESC, volume DESC
        LIMIT 20`,
        [this.domain, minDifficulty, minVolume]
      );

      return result.rows.map(row => ({
        keyword: row.keyword,
        avgPosition: parseFloat(row.avg_position) || null,
        volume: parseInt(row.volume),
        difficulty: parseInt(row.difficulty),
        cpc: parseFloat(row.cpc),
        trackingCount: parseInt(row.tracking_count),
        lastTracked: row.last_tracked,
        potentialValue: this.calculatePotentialValue(
          parseInt(row.volume),
          parseFloat(row.cpc),
          parseFloat(row.avg_position)
        )
      }));

    } catch (error) {
      console.error('[Ahrefs] Error fetching dragon keywords:', error);
      throw error;
    }
  }

  /**
   * Calculate potential traffic value of a keyword
   * Based on volume, CPC, and current position
   */
  calculatePotentialValue(volume, cpc, position) {
    if (!position || position > 20) {
      // Not ranking in top 20 - potential value = volume * CPC * 0.3 (30% CTR if we ranked #1)
      return volume * cpc * 0.3;
    }

    // Current value = volume * CPC * CTR at current position
    const ctr = this.getCTRByPosition(position);
    const currentValue = volume * cpc * ctr;

    // Potential value = volume * CPC * CTR at position #1
    const potentialCTR = this.getCTRByPosition(1);
    const potentialValue = volume * cpc * potentialCTR;

    // Return potential gain
    return potentialValue - currentValue;
  }

  /**
   * Get CTR (Click-Through Rate) by search position
   * Based on industry average CTR data
   */
  getCTRByPosition(position) {
    const ctrMap = {
      1: 0.285,   // 28.5% CTR for position 1
      2: 0.152,   // 15.2% CTR for position 2
      3: 0.098,   // 9.8% CTR for position 3
      4: 0.069,   // 6.9% CTR for position 4
      5: 0.052,   // 5.2% CTR for position 5
      6: 0.041,   // 4.1% CTR for position 6
      7: 0.034,   // 3.4% CTR for position 7
      8: 0.029,   // 2.9% CTR for position 8
      9: 0.025,   // 2.5% CTR for position 9
      10: 0.022   // 2.2% CTR for position 10
    };

    if (position <= 10) {
      return ctrMap[position];
    } else if (position <= 20) {
      return 0.01; // 1% CTR for positions 11-20
    } else {
      return 0.005; // 0.5% CTR for positions 21+
    }
  }

  /**
   * Monitor backlinks to case law citations
   * Useful for tracking who's citing our legal documentation
   */
  async monitorCaseLawBacklinks() {
    if (!this.apiToken) {
      console.warn('[Ahrefs] API token not set. Skipping backlink monitoring.');
      return null;
    }

    try {
      const url = `${this.apiBase}/backlinks`;
      const params = new URLSearchParams({
        token: this.apiToken,
        target: this.domain,
        mode: 'domain',
        output: 'json',
        limit: 100
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Ahrefs API error: ${response.status}`);
      }

      const data = await response.json();
      this.requestCount++;

      // Filter for backlinks to case-law.html or legal docs
      const legalBacklinks = data.backlinks?.filter(link =>
        link.url_to.includes('case-law.html') ||
        link.url_to.includes('terms-of-service') ||
        link.url_to.includes('privacy-policy')
      ) || [];

      // Store in database
      if (this.db) {
        for (const link of legalBacklinks) {
          await this.storeBacklink(link);
        }
      }

      return {
        totalBacklinks: data.backlinks?.length || 0,
        legalBacklinks: legalBacklinks.length,
        links: legalBacklinks.map(link => ({
          fromUrl: link.url_from,
          toUrl: link.url_to,
          anchor: link.anchor,
          domainRating: link.domain_rating,
          trafficValue: link.traffic,
          firstSeen: link.first_seen,
          lastSeen: link.last_seen
        }))
      };

    } catch (error) {
      console.error('[Ahrefs] Error monitoring backlinks:', error);
      throw error;
    }
  }

  /**
   * Store backlink in database
   */
  async storeBacklink(link) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO seo_backlinks (
          url_from, url_to, anchor, domain_rating, traffic, first_seen, last_seen, tracked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (url_from, url_to) DO UPDATE SET
          anchor = EXCLUDED.anchor,
          domain_rating = EXCLUDED.domain_rating,
          traffic = EXCLUDED.traffic,
          last_seen = EXCLUDED.last_seen,
          tracked_at = NOW()`,
        [
          link.url_from,
          link.url_to,
          link.anchor,
          link.domain_rating,
          link.traffic,
          link.first_seen,
          link.last_seen
        ]
      );

    } catch (error) {
      console.error('[Ahrefs] Error storing backlink:', error);
    }
  }

  /**
   * Get domain rating and authority metrics
   */
  async getDomainMetrics() {
    if (!this.apiToken) {
      console.warn('[Ahrefs] API token not set. Using mock data.');
      return {
        domainRating: 0,
        urlRating: 0,
        backlinks: 0,
        referringDomains: 0,
        organicTraffic: 0,
        organicKeywords: 0
      };
    }

    try {
      const url = `${this.apiBase}/metrics`;
      const params = new URLSearchParams({
        token: this.apiToken,
        target: this.domain,
        mode: 'domain',
        output: 'json'
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Ahrefs API error: ${response.status}`);
      }

      const data = await response.json();
      this.requestCount++;

      return {
        domainRating: data.domain_rating || 0,
        urlRating: data.url_rating || 0,
        backlinks: data.backlinks || 0,
        referringDomains: data.referring_domains || 0,
        organicTraffic: data.organic_traffic || 0,
        organicKeywords: data.organic_keywords || 0,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('[Ahrefs] Error fetching domain metrics:', error);
      throw error;
    }
  }

  /**
   * Get keyword suggestions for content optimization
   */
  async getKeywordSuggestions(seedKeyword, limit = 50) {
    if (!this.apiToken) {
      console.warn('[Ahrefs] API token not set. Skipping keyword suggestions.');
      return [];
    }

    try {
      const url = `${this.apiBase}/keywords/suggestions`;
      const params = new URLSearchParams({
        token: this.apiToken,
        keyword: seedKeyword,
        limit: limit.toString(),
        output: 'json'
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Ahrefs API error: ${response.status}`);
      }

      const data = await response.json();
      this.requestCount++;

      return data.keywords?.map(k => ({
        keyword: k.keyword,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        parent: k.parent_keyword
      })) || [];

    } catch (error) {
      console.error('[Ahrefs] Error fetching keyword suggestions:', error);
      throw error;
    }
  }
}

module.exports = AhrefsIntegration;
