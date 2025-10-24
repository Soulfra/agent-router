#!/usr/bin/env node

/**
 * URL Index & Tracker
 *
 * Tracks every URL the system fetches with metadata and annotations.
 * Provides visibility into what external resources we depend on.
 *
 * Features:
 * - Track all URL fetches with metadata
 * - Annotate URLs with comments and tags
 * - Link URLs to packages
 * - Usage analytics
 * - Critical URL marking
 * - Cache management
 *
 * Usage:
 *   const urlIndex = new URLIndex({ db });
 *   await urlIndex.track('https://registry.npmjs.org/left-pad', 'npm_registry', 200, true);
 *   const urls = await urlIndex.search({ domain: 'npmjs.org' });
 */

const crypto = require('crypto');
const { URL } = require('url');

class URLIndex {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required for URLIndex');
    }
  }

  /**
   * Track a URL fetch
   *
   * @param {string} url - URL that was fetched
   * @param {string} urlType - Type of URL (npm_registry, github_api, cdn, documentation, scrape)
   * @param {number} statusCode - HTTP status code
   * @param {boolean} success - Whether fetch was successful
   * @param {object} metadata - Additional metadata
   * @returns {Promise<number>} - URL ID
   */
  async track(url, urlType = 'unknown', statusCode = 200, success = true, metadata = {}) {
    const urlHash = this.generateHash(url);
    const parsedUrl = new URL(url);

    try {
      const result = await this.db.query(
        `INSERT INTO url_index (
          url,
          url_hash,
          url_type,
          domain,
          path,
          last_status_code,
          last_fetch_success,
          fetch_count,
          first_fetched_at,
          last_fetched_at,
          content_type,
          content_size,
          content_hash,
          last_error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8, $9, $10, $11)
        ON CONFLICT (url_hash) DO UPDATE SET
          fetch_count = url_index.fetch_count + 1,
          last_status_code = $6,
          last_fetch_success = $7,
          last_fetched_at = CURRENT_TIMESTAMP,
          content_type = COALESCE($8, url_index.content_type),
          content_size = COALESCE($9, url_index.content_size),
          content_hash = COALESCE($10, url_index.content_hash),
          last_error = CASE WHEN $7 = false THEN $11 ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          url,
          urlHash,
          urlType,
          parsedUrl.hostname,
          parsedUrl.pathname + parsedUrl.search,
          statusCode,
          success,
          metadata.contentType || null,
          metadata.contentSize || null,
          metadata.contentHash || null,
          metadata.error || null
        ]
      );

      return result.rows[0].id;

    } catch (error) {
      console.error('[URLIndex] Track error:', error.message);
      throw error;
    }
  }

  /**
   * Get URL information
   *
   * @param {string} url - URL to look up
   * @returns {Promise<object|null>} - URL info or null
   */
  async get(url) {
    const urlHash = this.generateHash(url);

    const result = await this.db.query(
      'SELECT * FROM url_index WHERE url_hash = $1',
      [urlHash]
    );

    return result.rows[0] || null;
  }

  /**
   * Search URLs
   *
   * @param {object} filters - Search filters
   * @returns {Promise<array>} - Matching URLs
   */
  async search(filters = {}) {
    const {
      domain = null,
      urlType = null,
      critical = null,
      tags = null,
      minFetchCount = null,
      limit = 100,
      offset = 0
    } = filters;

    let query = 'SELECT * FROM url_index WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (domain) {
      query += ` AND domain = $${paramIndex++}`;
      params.push(domain);
    }

    if (urlType) {
      query += ` AND url_type = $${paramIndex++}`;
      params.push(urlType);
    }

    if (critical !== null) {
      query += ` AND is_critical = $${paramIndex++}`;
      params.push(critical);
    }

    if (tags) {
      query += ` AND tags && $${paramIndex++}`;
      params.push(tags);
    }

    if (minFetchCount !== null) {
      query += ` AND fetch_count >= $${paramIndex++}`;
      params.push(minFetchCount);
    }

    query += ` ORDER BY fetch_count DESC, last_fetched_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Annotate a URL with comments
   *
   * @param {string} url - URL to annotate
   * @param {string} comment - Comment text
   * @returns {Promise<void>}
   */
  async annotate(url, comment) {
    const urlHash = this.generateHash(url);

    await this.db.query(
      `UPDATE url_index
       SET comments = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE url_hash = $2`,
      [comment, urlHash]
    );
  }

  /**
   * Tag a URL
   *
   * @param {string} url - URL to tag
   * @param {array} tags - Tags to add
   * @returns {Promise<void>}
   */
  async tag(url, tags) {
    const urlHash = this.generateHash(url);

    await this.db.query(
      `UPDATE url_index
       SET tags = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE url_hash = $2`,
      [tags, urlHash]
    );
  }

  /**
   * Mark URL as critical
   *
   * @param {string} url - URL to mark
   * @param {boolean} critical - Whether critical
   * @returns {Promise<void>}
   */
  async markCritical(url, critical = true) {
    const urlHash = this.generateHash(url);

    await this.db.query(
      `UPDATE url_index
       SET is_critical = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE url_hash = $2`,
      [critical, urlHash]
    );
  }

  /**
   * Link URL to a package
   *
   * @param {string} url - URL to link
   * @param {number} packageId - Package ID
   * @returns {Promise<void>}
   */
  async linkToPackage(url, packageId) {
    const urlHash = this.generateHash(url);

    await this.db.query(
      `UPDATE url_index
       SET related_package_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE url_hash = $2`,
      [packageId, urlHash]
    );
  }

  /**
   * Get most frequently accessed URLs
   *
   * @param {number} limit - Number of results
   * @returns {Promise<array>} - Top URLs
   */
  async topUrls(limit = 10) {
    const result = await this.db.query(
      `SELECT
        url,
        url_type,
        domain,
        fetch_count,
        last_fetch_success,
        is_critical,
        tags,
        comments
       FROM url_index
       ORDER BY fetch_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get URLs by domain
   *
   * @param {string} domain - Domain name
   * @returns {Promise<array>} - URLs for domain
   */
  async byDomain(domain) {
    const result = await this.db.query(
      `SELECT * FROM url_index
       WHERE domain = $1
       ORDER BY fetch_count DESC`,
      [domain]
    );

    return result.rows;
  }

  /**
   * Get failed URLs (for debugging)
   *
   * @param {number} limit - Number of results
   * @returns {Promise<array>} - Failed URLs
   */
  async failedUrls(limit = 50) {
    const result = await this.db.query(
      `SELECT
        url,
        url_type,
        last_status_code,
        last_error,
        fetch_count,
        last_fetched_at
       FROM url_index
       WHERE last_fetch_success = false
       ORDER BY last_fetched_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get URL statistics
   *
   * @returns {Promise<object>} - Statistics
   */
  async statistics() {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_urls,
        COUNT(*) FILTER (WHERE is_critical = true) as critical_urls,
        COUNT(*) FILTER (WHERE last_fetch_success = false) as failed_urls,
        SUM(fetch_count) as total_fetches,
        COUNT(DISTINCT domain) as unique_domains,
        COUNT(DISTINCT url_type) as unique_types,
        AVG(fetch_count) as avg_fetches_per_url
      FROM url_index
    `);

    const stats = result.rows[0];

    // Get top domains
    const topDomainsResult = await this.db.query(`
      SELECT
        domain,
        COUNT(*) as url_count,
        SUM(fetch_count) as total_fetches
      FROM url_index
      GROUP BY domain
      ORDER BY total_fetches DESC
      LIMIT 10
    `);

    stats.top_domains = topDomainsResult.rows;

    // Get URLs by type
    const byTypeResult = await this.db.query(`
      SELECT
        url_type,
        COUNT(*) as count
      FROM url_index
      GROUP BY url_type
      ORDER BY count DESC
    `);

    stats.by_type = byTypeResult.rows;

    return stats;
  }

  /**
   * Export URLs to JSON
   *
   * @param {object} filters - Optional filters
   * @returns {Promise<array>} - URLs as JSON
   */
  async export(filters = {}) {
    const urls = await this.search({ ...filters, limit: 10000 });

    return urls.map(url => ({
      url: url.url,
      type: url.url_type,
      domain: url.domain,
      fetchCount: url.fetch_count,
      critical: url.is_critical,
      tags: url.tags,
      comments: url.comments,
      firstFetched: url.first_fetched_at,
      lastFetched: url.last_fetched_at
    }));
  }

  /**
   * Import URLs from JSON
   *
   * @param {array} urls - URLs to import
   * @returns {Promise<number>} - Number imported
   */
  async import(urls) {
    let imported = 0;

    for (const urlData of urls) {
      try {
        await this.track(
          urlData.url,
          urlData.type || 'imported',
          200,
          true
        );

        if (urlData.critical) {
          await this.markCritical(urlData.url, true);
        }

        if (urlData.tags) {
          await this.tag(urlData.url, urlData.tags);
        }

        if (urlData.comments) {
          await this.annotate(urlData.url, urlData.comments);
        }

        imported++;
      } catch (error) {
        console.error(`[URLIndex] Failed to import ${urlData.url}:`, error.message);
      }
    }

    return imported;
  }

  /**
   * Clean up old URL entries
   *
   * @param {number} daysOld - Remove URLs not fetched in N days
   * @param {boolean} keepCritical - Don't delete critical URLs
   * @returns {Promise<number>} - Number deleted
   */
  async cleanup(daysOld = 90, keepCritical = true) {
    let query = `
      DELETE FROM url_index
      WHERE last_fetched_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
    `;

    if (keepCritical) {
      query += ' AND is_critical = false';
    }

    const result = await this.db.query(query);
    return result.rowCount;
  }

  /**
   * Generate URL hash
   *
   * @private
   */
  generateHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  /**
   * Bulk track multiple URLs
   *
   * @param {array} urls - Array of URL tracking data
   * @returns {Promise<number>} - Number tracked
   */
  async bulkTrack(urls) {
    let tracked = 0;

    for (const urlData of urls) {
      try {
        await this.track(
          urlData.url,
          urlData.type || 'unknown',
          urlData.statusCode || 200,
          urlData.success !== false,
          urlData.metadata || {}
        );
        tracked++;
      } catch (error) {
        console.error(`[URLIndex] Failed to track ${urlData.url}:`, error.message);
      }
    }

    return tracked;
  }

  /**
   * Get dependency chain for a URL
   * (URLs that this URL depends on, if it's a package)
   *
   * @param {string} url - URL to analyze
   * @returns {Promise<array>} - Dependency chain
   */
  async dependencyChain(url) {
    const urlHash = this.generateHash(url);

    // Get the URL's package
    const result = await this.db.query(
      'SELECT related_package_id FROM url_index WHERE url_hash = $1',
      [urlHash]
    );

    if (!result.rows[0] || !result.rows[0].related_package_id) {
      return [];
    }

    const packageId = result.rows[0].related_package_id;

    // Get package dependencies
    const depsResult = await this.db.query(`
      SELECT
        pd.child_package_name,
        pd.child_package_version,
        pd.depth_level,
        ui.url,
        ui.url_type,
        ui.is_critical
      FROM package_dependencies pd
      LEFT JOIN vendored_packages vp
        ON vp.package_name = pd.child_package_name
        AND vp.package_version = pd.child_package_version
      LEFT JOIN url_index ui
        ON ui.related_package_id = vp.id
      WHERE pd.parent_package_id = $1
      ORDER BY pd.depth_level, pd.child_package_name
    `, [packageId]);

    return depsResult.rows;
  }
}

module.exports = URLIndex;
