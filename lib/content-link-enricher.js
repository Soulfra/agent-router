/**
 * Content Link Enricher
 *
 * Automatically finds and enriches ALL links in content with UTM tracking:
 * - GitHub repositories
 * - Amazon books/products
 * - Gumroad products
 * - Course platforms (Udemy, Skillshare, etc.)
 * - Blog posts
 * - External references
 *
 * Integrates with:
 * - UTM Campaign Generator (lib/utm-campaign-generator.js)
 * - Multi-Brand Strategy
 * - Affiliate Tracker
 *
 * Usage:
 *   const enricher = new ContentLinkEnricher({ utmGenerator, db });
 *
 *   const enriched = await enricher.enrichContent({
 *     content: "Check out my book on Amazon: https://amazon.com/dp/B08X...",
 *     platform: 'mastodon',
 *     language: 'es',
 *     persona: 'alice',
 *     brand: 'deathtodata',
 *     sessionId: 'session_123',
 *     narrative: { themes: ['privacy'], title: 'Privacy 101' }
 *   });
 *   // Returns content with all URLs enriched with UTM parameters
 */

const { EventEmitter } = require('events');
const { URL } = require('url');

class ContentLinkEnricher extends EventEmitter {
  constructor(options = {}) {
    super();

    this.utmGenerator = options.utmGenerator;
    this.db = options.db;

    // Link type detection patterns
    this.linkPatterns = {
      github: /github\.com\/[\w-]+\/[\w-]+/i,
      amazon: /amazon\.(com|co\.uk|de|fr|es|it|ca|co\.jp)\/(?:dp|gp\/product)\/[\w]+/i,
      gumroad: /gumroad\.com\/l\/[\w-]+/i,
      udemy: /udemy\.com\/course\/[\w-]+/i,
      skillshare: /skillshare\.com\/classes\/[\w-]+/i,
      youtube: /(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i,
      twitter: /twitter\.com\/[\w]+\/status\/[\d]+/i,
      mastodon: /[\w.-]+\/@[\w]+\/[\d]+/i,
      substack: /[\w-]+\.substack\.com\/p\/[\w-]+/i,
      medium: /medium\.com\/@?[\w-]+\/[\w-]+/i
    };

    // Product type → UTM term mapping
    this.productTerms = {
      book: 'book',
      course: 'course',
      repo: 'open-source',
      article: 'article',
      video: 'video',
      product: 'product',
      tool: 'tool'
    };

    // Link type → product type mapping
    this.linkTypeToProduct = {
      github: 'repo',
      amazon: 'book',
      gumroad: 'product',
      udemy: 'course',
      skillshare: 'course',
      youtube: 'video',
      substack: 'article',
      medium: 'article'
    };

    console.log('[ContentLinkEnricher] Initialized');
  }

  /**
   * Enrich all links in content with UTM tracking
   */
  async enrichContent(options) {
    const {
      content,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      narrative = {},
      topics = [],
      contentType = 'markdown' // markdown | html | plain
    } = options;

    if (!this.utmGenerator) {
      console.warn('[ContentLinkEnricher] No UTM generator provided, returning original content');
      return content;
    }

    // Generate base UTM params for this content
    const baseUTMParams = await this.utmGenerator.generateForContent({
      narrative,
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics
    });

    console.log(`[ContentLinkEnricher] Enriching content for ${platform} (${language}, ${persona || 'no-persona'})`);

    // Find all URLs in content
    const urls = this._extractURLs(content, contentType);

    console.log(`[ContentLinkEnricher] Found ${urls.length} URLs to enrich`);

    // Enrich each URL
    let enrichedContent = content;

    for (const urlInfo of urls) {
      const { url, original } = urlInfo;

      // Detect link type
      const linkType = this._detectLinkType(url);
      const productType = this.linkTypeToProduct[linkType] || 'link';

      // Build UTM params specific to this link
      const utmParams = {
        ...baseUTMParams,
        term: this.productTerms[productType] || baseUTMParams.term
      };

      // Enrich URL
      const enrichedUrl = this.utmGenerator.enrichLink(url, utmParams);

      // Replace in content
      enrichedContent = enrichedContent.replace(original, enrichedUrl);

      console.log(`[ContentLinkEnricher] Enriched ${linkType} link: ${url.substring(0, 50)}...`);

      // Track link enrichment
      if (this.db) {
        await this._trackEnrichment({
          originalUrl: url,
          enrichedUrl,
          linkType,
          productType,
          platform,
          language,
          persona,
          brand,
          sessionId
        });
      }

      this.emit('link:enriched', {
        original: url,
        enriched: enrichedUrl,
        linkType,
        productType,
        platform,
        language,
        persona
      });
    }

    console.log(`[ContentLinkEnricher] Enrichment complete: ${urls.length} links enriched`);

    return enrichedContent;
  }

  /**
   * Extract all URLs from content based on content type
   */
  _extractURLs(content, contentType) {
    const urls = [];

    if (contentType === 'markdown') {
      // Match markdown links: [text](url) and bare URLs
      const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const bareUrlRegex = /(?<![(\[])(https?:\/\/[^\s<>"\])]+)(?![)\]])/g;

      let match;

      // Markdown links
      while ((match = markdownLinkRegex.exec(content)) !== null) {
        urls.push({
          url: match[2],
          original: match[0],
          text: match[1],
          type: 'markdown'
        });
      }

      // Bare URLs (not already in markdown links)
      const contentWithoutMarkdownLinks = content.replace(markdownLinkRegex, '');
      while ((match = bareUrlRegex.exec(contentWithoutMarkdownLinks)) !== null) {
        urls.push({
          url: match[0],
          original: match[0],
          text: null,
          type: 'bare'
        });
      }

    } else if (contentType === 'html') {
      // Match HTML links: <a href="url">text</a> and bare URLs
      const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]+)"(?:[^>]*)>(.*?)<\/a>/gi;
      const bareUrlRegex = /(?<![<"])(https?:\/\/[^\s<>"]+)(?![>"])/g;

      let match;

      // HTML links
      while ((match = htmlLinkRegex.exec(content)) !== null) {
        urls.push({
          url: match[1],
          original: match[0],
          text: match[2],
          type: 'html'
        });
      }

      // Bare URLs (not already in HTML tags)
      const contentWithoutHtmlLinks = content.replace(htmlLinkRegex, '');
      while ((match = bareUrlRegex.exec(contentWithoutHtmlLinks)) !== null) {
        urls.push({
          url: match[0],
          original: match[0],
          text: null,
          type: 'bare'
        });
      }

    } else {
      // Plain text - just extract bare URLs
      const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
      let match;

      while ((match = urlRegex.exec(content)) !== null) {
        urls.push({
          url: match[1],
          original: match[0],
          text: null,
          type: 'bare'
        });
      }
    }

    return urls;
  }

  /**
   * Detect link type from URL
   */
  _detectLinkType(url) {
    for (const [type, pattern] of Object.entries(this.linkPatterns)) {
      if (pattern.test(url)) {
        return type;
      }
    }

    return 'external';
  }

  /**
   * Extract product references from narrative metadata
   */
  extractProductLinks(narrative, brand = null) {
    const products = [];

    // GitHub repositories
    if (narrative.repos && narrative.repos.length > 0) {
      for (const repo of narrative.repos) {
        products.push({
          type: 'github',
          url: `https://github.com/${repo}`,
          name: repo,
          productType: 'repo'
        });
      }
    }

    // Amazon products
    if (narrative.books && narrative.books.length > 0) {
      for (const book of narrative.books) {
        products.push({
          type: 'amazon',
          url: book.url || `https://amazon.com/dp/${book.asin}`,
          name: book.title,
          productType: 'book',
          asin: book.asin
        });
      }
    }

    // Courses
    if (narrative.courses && narrative.courses.length > 0) {
      for (const course of narrative.courses) {
        products.push({
          type: this._detectLinkType(course.url),
          url: course.url,
          name: course.title,
          productType: 'course'
        });
      }
    }

    // Gumroad products
    if (narrative.products && narrative.products.length > 0) {
      for (const product of narrative.products) {
        products.push({
          type: 'gumroad',
          url: product.url,
          name: product.name,
          productType: 'product'
        });
      }
    }

    // Related articles
    if (narrative.relatedArticles && narrative.relatedArticles.length > 0) {
      for (const article of narrative.relatedArticles) {
        products.push({
          type: this._detectLinkType(article.url),
          url: article.url,
          name: article.title,
          productType: 'article'
        });
      }
    }

    console.log(`[ContentLinkEnricher] Extracted ${products.length} product links from narrative`);

    return products;
  }

  /**
   * Generate learning path URLs with sequential UTM tracking
   */
  async generateLearningPath(options) {
    const {
      steps, // [{ title, url, type }]
      pathName,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null
    } = options;

    if (!this.utmGenerator) {
      throw new Error('UTM generator required');
    }

    const campaign = `learning-path-${pathName.toLowerCase().replace(/\s+/g, '-')}`;

    const enrichedSteps = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      const utmParams = {
        source: platform,
        medium: this.utmGenerator.platformMedium[platform] || 'referral',
        campaign,
        content: persona ? `${language}-${persona}-step${i + 1}` : `${language}-step${i + 1}`,
        term: step.type || 'learning-path',
        affiliateTag: brand ? this.utmGenerator.affiliateTags[brand] : null
      };

      const enrichedUrl = this.utmGenerator.enrichLink(step.url, utmParams);

      enrichedSteps.push({
        ...step,
        stepNumber: i + 1,
        originalUrl: step.url,
        trackedUrl: enrichedUrl,
        utmParams
      });

      console.log(`[ContentLinkEnricher] Learning path step ${i + 1}: ${step.title}`);
    }

    return {
      pathName,
      campaign,
      totalSteps: steps.length,
      steps: enrichedSteps
    };
  }

  /**
   * Batch enrich multiple content pieces
   */
  async batchEnrich(contentArray) {
    const results = [];

    for (const content of contentArray) {
      try {
        const enriched = await this.enrichContent(content);
        results.push({
          success: true,
          original: content.content.substring(0, 100),
          enriched: enriched.substring(0, 100),
          platform: content.platform,
          language: content.language
        });
      } catch (error) {
        console.error('[ContentLinkEnricher] Batch enrich error:', error.message);
        results.push({
          success: false,
          error: error.message,
          platform: content.platform,
          language: content.language
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[ContentLinkEnricher] Batch enrichment complete: ${successCount}/${contentArray.length} successful`);

    return results;
  }

  /**
   * Track link enrichment in database
   */
  async _trackEnrichment(options) {
    if (!this.db) return;

    const {
      originalUrl,
      enrichedUrl,
      linkType,
      productType,
      platform,
      language,
      persona,
      brand,
      sessionId
    } = options;

    try {
      await this.db.query(`
        INSERT INTO content_link_enrichments (
          original_url,
          enriched_url,
          link_type,
          product_type,
          platform,
          language,
          persona,
          brand,
          session_id,
          enriched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [originalUrl, enrichedUrl, linkType, productType, platform, language, persona, brand, sessionId]);

    } catch (error) {
      // Table might not exist yet - that's ok
      if (!error.message.includes('does not exist')) {
        console.error('[ContentLinkEnricher] Track enrichment error:', error.message);
      }
    }
  }

  /**
   * Get enrichment statistics
   */
  async getEnrichmentStats(filters = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const {
      platform = null,
      language = null,
      persona = null,
      brand = null,
      linkType = null,
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

    if (linkType) {
      conditions.push(`link_type = $${paramIndex++}`);
      params.push(linkType);
    }

    if (startDate) {
      conditions.push(`enriched_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`enriched_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const query = `
        SELECT
          COUNT(*) as total_enrichments,
          COUNT(DISTINCT platform) as platforms,
          COUNT(DISTINCT language) as languages,
          COUNT(DISTINCT link_type) as link_types,
          link_type,
          COUNT(*) as count
        FROM content_link_enrichments
        ${whereClause}
        GROUP BY link_type
        ORDER BY count DESC
      `;

      const result = await this.db.query(query, params);

      return {
        totalEnrichments: parseInt(result.rows[0]?.total_enrichments || 0),
        platforms: parseInt(result.rows[0]?.platforms || 0),
        languages: parseInt(result.rows[0]?.languages || 0),
        byLinkType: result.rows.map(row => ({
          linkType: row.link_type,
          count: parseInt(row.count)
        }))
      };

    } catch (error) {
      console.error('[ContentLinkEnricher] Stats query error:', error.message);
      return {
        totalEnrichments: 0,
        platforms: 0,
        languages: 0,
        byLinkType: []
      };
    }
  }
}

module.exports = ContentLinkEnricher;
