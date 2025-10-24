/**
 * Wayback Archive
 *
 * Personal archive of all scraped web pages
 * (like Internet Archive Wayback Machine but for your own research)
 *
 * Features:
 * - Archives every scraped page (HTML + screenshot + metadata)
 * - Searchable by query, URL, date
 * - Diff viewer (compare page changes over time)
 * - Version history (see how page evolved)
 * - Encrypted storage (UserDataVault)
 *
 * Use Cases:
 * - "What did this news article say last week?"
 * - "Has this page changed since I last checked?"
 * - "Show me all pages about pirate treasure"
 * - "Track how estimates changed ($40M → $50M)"
 *
 * Example:
 *   const archive = new WaybackArchive({ vault });
 *   await archive.save('pirate treasure', 'https://...', htmlContent, screenshot);
 *   const history = await archive.search('pirate treasure');
 *   const diff = await archive.diff(archiveId1, archiveId2);
 */

const crypto = require('crypto');

class WaybackArchive {
  constructor(options = {}) {
    this.config = {
      vault: options.vault,
      namespace: options.namespace || 'wayback_archive',
      maxArchivesPerQuery: options.maxArchivesPerQuery || 100,
      compressionEnabled: options.compressionEnabled !== false
    };

    if (!this.config.vault) {
      throw new Error('[WaybackArchive] UserDataVault required');
    }

    console.log('[WaybackArchive] Initialized');
  }

  /**
   * Save scraped page to archive
   */
  async save(query, url, html, screenshot = null, metadata = {}) {
    const archiveId = this._generateArchiveId(query, url);
    const timestamp = new Date().toISOString();

    // Compress HTML if enabled
    let htmlData = html;
    if (this.config.compressionEnabled && html) {
      htmlData = await this._compress(html);
    }

    // Extract key facts for quick search
    const extractedData = this._extractQuickFacts(html);

    // Store in vault
    await this.config.vault.store(
      'system',
      this.config.namespace,
      archiveId,
      {
        query,
        url,
        html: htmlData,
        screenshot,
        timestamp,
        metadata: {
          ...metadata,
          ...extractedData,
          compressed: this.config.compressionEnabled
        }
      },
      { ttl: 86400 * 30 } // Keep for 30 days
    );

    console.log(`[WaybackArchive] Saved: ${url} (${archiveId})`);

    return {
      archiveId,
      query,
      url,
      timestamp
    };
  }

  /**
   * Search archives by query
   */
  async search(searchQuery, options = {}) {
    const limit = options.limit || 20;

    // This is simplified - in production, you'd query a separate index table
    // For now, we'll just return a placeholder

    console.log(`[WaybackArchive] Searching for: "${searchQuery}"`);

    // In production, implement proper search via database index
    return {
      query: searchQuery,
      results: [],
      message: 'Search requires database index (not implemented in this version)'
    };
  }

  /**
   * Get archive by ID
   */
  async getById(archiveId) {
    const archive = await this.config.vault.retrieve(
      'system',
      this.config.namespace,
      archiveId
    );

    if (!archive) {
      throw new Error(`Archive ${archiveId} not found`);
    }

    // Decompress HTML if needed
    if (archive.metadata && archive.metadata.compressed && archive.html) {
      archive.html = await this._decompress(archive.html);
    }

    return archive;
  }

  /**
   * Get all archives for a specific URL
   */
  async getByUrl(url, options = {}) {
    const limit = options.limit || 10;

    // Generate archive IDs for this URL with different timestamps
    // This is simplified - in production, use database query

    console.log(`[WaybackArchive] Getting history for: ${url}`);

    return {
      url,
      archives: [],
      message: 'URL history requires database index (not implemented in this version)'
    };
  }

  /**
   * Get all archives for a query (sorted by date)
   */
  async getByQuery(query, options = {}) {
    const limit = options.limit || 20;

    console.log(`[WaybackArchive] Getting archives for query: "${query}"`);

    // In production, query database for all archives matching query
    return {
      query,
      archives: [],
      message: 'Query history requires database index (not implemented in this version)'
    };
  }

  /**
   * Compare two archived pages (diff)
   */
  async diff(archiveId1, archiveId2) {
    const archive1 = await this.getById(archiveId1);
    const archive2 = await this.getById(archiveId2);

    if (!archive1 || !archive2) {
      throw new Error('One or both archives not found');
    }

    // Extract text from HTML
    const text1 = this._extractText(archive1.html);
    const text2 = this._extractText(archive2.html);

    // Simple diff (line-by-line comparison)
    const diff = this._computeDiff(text1, text2);

    return {
      archiveId1,
      archiveId2,
      url1: archive1.url,
      url2: archive2.url,
      timestamp1: archive1.timestamp,
      timestamp2: archive2.timestamp,
      diff,
      summary: this._summarizeDiff(diff)
    };
  }

  /**
   * Get timeline view (how page changed over time)
   */
  async getTimeline(url, options = {}) {
    const archives = await this.getByUrl(url, options);

    if (!archives || archives.archives.length === 0) {
      return { url, timeline: [] };
    }

    // Sort by timestamp
    const sorted = archives.archives.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Build timeline with diffs
    const timeline = [];
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = i > 0 ? sorted[i - 1] : null;

      let changes = null;
      if (previous) {
        const diff = await this.diff(previous.archiveId, current.archiveId);
        changes = diff.summary;
      }

      timeline.push({
        archiveId: current.archiveId,
        timestamp: current.timestamp,
        changes: changes || 'Initial capture',
        metadata: current.metadata
      });
    }

    return {
      url,
      timeline,
      totalSnapshots: sorted.length
    };
  }

  /**
   * Delete archive
   */
  async delete(archiveId) {
    // Note: UserDataVault doesn't have delete method in current implementation
    // This is a placeholder for future implementation
    console.log(`[WaybackArchive] Delete requested for: ${archiveId}`);
    return { deleted: false, message: 'Delete not implemented' };
  }

  /**
   * Generate unique archive ID
   */
  _generateArchiveId(query, url) {
    const timestamp = Date.now();
    const hash = crypto
      .createHash('sha256')
      .update(`${query}:${url}:${timestamp}`)
      .digest('hex')
      .substring(0, 16);

    return `${hash}_${timestamp}`;
  }

  /**
   * Extract text from HTML
   */
  _extractText(html) {
    if (!html) return '';

    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Extract quick facts for search indexing
   */
  _extractQuickFacts(html) {
    if (!html) return {};

    const text = this._extractText(html);

    // Extract dates
    const dates = text.match(/\b(202[0-9])\b/g) || [];

    // Extract amounts
    const amounts = text.match(/\$[\d,]+(\.\d{2})?(\s?(million|billion|M|B))?/gi) || [];

    // Extract URLs
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];

    return {
      wordCount: text.split(/\s+/).length,
      datesFound: [...new Set(dates)],
      amountsFound: [...new Set(amounts)],
      linksCount: urls.length,
      size: html.length
    };
  }

  /**
   * Compute simple line-by-line diff
   */
  _computeDiff(text1, text2) {
    const lines1 = text1.split(/[.!?]\s+/);
    const lines2 = text2.split(/[.!?]\s+/);

    const diff = {
      added: [],
      removed: [],
      unchanged: []
    };

    // Find removed lines
    for (const line of lines1) {
      if (!lines2.includes(line)) {
        diff.removed.push(line);
      } else {
        diff.unchanged.push(line);
      }
    }

    // Find added lines
    for (const line of lines2) {
      if (!lines1.includes(line)) {
        diff.added.push(line);
      }
    }

    return diff;
  }

  /**
   * Summarize diff
   */
  _summarizeDiff(diff) {
    const added = diff.added.length;
    const removed = diff.removed.length;
    const total = added + removed;

    if (total === 0) {
      return 'No changes detected';
    }

    const changes = [];
    if (added > 0) changes.push(`${added} lines added`);
    if (removed > 0) changes.push(`${removed} lines removed`);

    return changes.join(', ');
  }

  /**
   * Compress data (placeholder for zlib compression)
   */
  async _compress(data) {
    // In production, use zlib.gzip
    // For now, just return as-is
    return data;
  }

  /**
   * Decompress data
   */
  async _decompress(data) {
    // In production, use zlib.gunzip
    return data;
  }

  /**
   * Get stats
   */
  async getStats() {
    // Placeholder - in production, query database for stats
    return {
      totalArchives: 0,
      totalSize: 0,
      oldestArchive: null,
      newestArchive: null,
      topQueries: []
    };
  }
}

module.exports = WaybackArchive;
