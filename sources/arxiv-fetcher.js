/**
 * ArXiv Paper Fetcher
 *
 * Fetches research papers from ArXiv API and caches them locally.
 * Supports search, metadata extraction, and PDF downloads.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

class ArXivFetcher {
  constructor(options = {}) {
    this.db = options.db || null;
    this.pdfDir = options.pdfDir || path.join(__dirname, '../../memory/papers');
    this.baseUrl = 'http://export.arxiv.org/api/query';

    // Ensure PDF directory exists
    if (!fs.existsSync(this.pdfDir)) {
      fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  /**
   * Search ArXiv for papers
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Array of papers
   */
  async search(query, options = {}) {
    const {
      maxResults = 10,
      sortBy = 'relevance', // 'relevance', 'lastUpdatedDate', 'submittedDate'
      sortOrder = 'descending',
      start = 0
    } = options;

    try {
      const url = `${this.baseUrl}?search_query=${encodeURIComponent(query)}&start=${start}&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

      console.log(`🔍 Searching ArXiv: "${query}"`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'CalOS-ArXiv-Fetcher/1.0'
        }
      });

      // Parse XML response
      const parsed = await parseStringPromise(response.data);
      const entries = parsed.feed?.entry || [];

      if (entries.length === 0) {
        console.log('  No results found');
        return [];
      }

      // Extract paper metadata
      const papers = entries.map(entry => this._parsePaper(entry));

      console.log(`  Found ${papers.length} papers`);

      // Cache to database if available
      if (this.db) {
        for (const paper of papers) {
          await this._cachePaper(paper);
        }
      }

      return papers;

    } catch (error) {
      console.error('ArXiv search error:', error.message);
      throw error;
    }
  }

  /**
   * Get paper by ArXiv ID
   * @param {string} arxivId - ArXiv ID (e.g., '2103.00020' or '2103.00020v1')
   * @returns {Promise<object>} - Paper metadata
   */
  async getPaper(arxivId) {
    // Check cache first
    if (this.db) {
      const cached = await this._getCachedPaper(arxivId);
      if (cached) {
        console.log(`📦 Cache hit for arXiv:${arxivId}`);
        return cached;
      }
    }

    // Fetch from ArXiv
    try {
      const url = `${this.baseUrl}?id_list=${arxivId}`;

      console.log(`🔍 Fetching arXiv:${arxivId}`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'CalOS-ArXiv-Fetcher/1.0'
        }
      });

      const parsed = await parseStringPromise(response.data);
      const entry = parsed.feed?.entry?.[0];

      if (!entry) {
        throw new Error(`Paper ${arxivId} not found`);
      }

      const paper = this._parsePaper(entry);

      // Cache to database
      if (this.db) {
        await this._cachePaper(paper);
      }

      console.log(`✓ Fetched: ${paper.title}`);

      return paper;

    } catch (error) {
      console.error(`Error fetching arXiv:${arxivId}:`, error.message);
      throw error;
    }
  }

  /**
   * Download PDF for a paper
   * @param {string} arxivId - ArXiv ID
   * @returns {Promise<string>} - Path to downloaded PDF
   */
  async downloadPdf(arxivId) {
    const paper = await this.getPaper(arxivId);

    if (paper.pdf_path && fs.existsSync(paper.pdf_path)) {
      console.log(`📦 PDF already downloaded: ${paper.pdf_path}`);
      return paper.pdf_path;
    }

    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const pdfPath = path.join(this.pdfDir, `${arxivId}.pdf`);

    try {
      console.log(`📥 Downloading PDF: ${pdfUrl}`);

      const response = await axios.get(pdfUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'CalOS-ArXiv-Fetcher/1.0'
        }
      });

      const writer = fs.createWriteStream(pdfPath);

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`✓ PDF saved: ${pdfPath}`);

      // Update database with PDF path
      if (this.db) {
        await this.db.query(
          'UPDATE arxiv_papers SET pdf_path = $1 WHERE arxiv_id = $2',
          [pdfPath, arxivId]
        );
      }

      return pdfPath;

    } catch (error) {
      console.error(`Error downloading PDF for ${arxivId}:`, error.message);
      throw error;
    }
  }

  /**
   * Search by category
   * @param {string} category - ArXiv category (e.g., 'cs.AI', 'cs.LG')
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Array of papers
   */
  async searchByCategory(category, options = {}) {
    return await this.search(`cat:${category}`, options);
  }

  /**
   * Search by author
   * @param {string} author - Author name
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Array of papers
   */
  async searchByAuthor(author, options = {}) {
    return await this.search(`au:${author}`, options);
  }

  /**
   * Internal: Parse paper entry from ArXiv API
   */
  _parsePaper(entry) {
    // Extract ArXiv ID from URL
    const idMatch = entry.id[0].match(/arxiv\.org\/abs\/(.+)$/);
    const arxivId = idMatch ? idMatch[1] : entry.id[0];

    // Extract authors
    const authors = (entry.author || []).map(a => a.name[0]);

    // Extract categories
    const categories = (entry.category || []).map(c => c.$.term);

    // Extract published date
    const publishedDate = entry.published ? entry.published[0].split('T')[0] : null;

    return {
      arxiv_id: arxivId,
      title: entry.title[0].replace(/\s+/g, ' ').trim(),
      authors: authors,
      abstract: entry.summary[0].replace(/\s+/g, ' ').trim(),
      pdf_url: `https://arxiv.org/pdf/${arxivId}.pdf`,
      published_date: publishedDate,
      categories: categories,
      metadata: {
        updated: entry.updated ? entry.updated[0] : null,
        links: entry.link || []
      }
    };
  }

  /**
   * Internal: Cache paper to database
   */
  async _cachePaper(paper) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO arxiv_papers
         (arxiv_id, title, authors, abstract, pdf_url, published_date, categories, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (arxiv_id)
         DO UPDATE SET
           title = EXCLUDED.title,
           authors = EXCLUDED.authors,
           abstract = EXCLUDED.abstract,
           updated_at = CURRENT_TIMESTAMP`,
        [
          paper.arxiv_id,
          paper.title,
          paper.authors,
          paper.abstract,
          paper.pdf_url,
          paper.published_date,
          paper.categories,
          JSON.stringify(paper.metadata)
        ]
      );

      console.log(`  💾 Cached arXiv:${paper.arxiv_id}`);

    } catch (error) {
      console.error('Cache write error:', error.message);
    }
  }

  /**
   * Internal: Get cached paper from database
   */
  async _getCachedPaper(arxivId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT * FROM arxiv_papers WHERE arxiv_id = $1`,
        [arxivId]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }

      return null;

    } catch (error) {
      console.error('Cache lookup error:', error.message);
      return null;
    }
  }

  /**
   * Get papers from database by category
   */
  async getCachedByCategory(category, limit = 10) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.query(
      `SELECT * FROM arxiv_papers
       WHERE $1 = ANY(categories)
       ORDER BY published_date DESC
       LIMIT $2`,
      [category, limit]
    );

    return result.rows || [];
  }

  /**
   * Get recently cached papers
   */
  async getRecentPapers(limit = 10) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.query(
      `SELECT * FROM arxiv_papers
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows || [];
  }

  /**
   * Get paper statistics
   */
  async getStats() {
    if (!this.db) {
      return { error: 'Database not initialized' };
    }

    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_papers,
        COUNT(pdf_path) as downloaded_pdfs,
        COUNT(DISTINCT unnest(categories)) as unique_categories,
        MAX(published_date) as latest_paper
      FROM arxiv_papers
    `);

    return result.rows[0] || {};
  }
}

module.exports = ArXivFetcher;
