/**
 * Web Scraper Routes
 * Handles web scraping with puppeteer, external-fetcher, and stores to knowledge base
 */

// Node.js v18 File API polyfill
if (typeof global.File === 'undefined') {
  global.File = class File extends Blob {
    constructor(bits, name, options) {
      super(bits, options);
      this.name = name;
      this.lastModified = Date.now();
    }
  };
}

const express = require('express');
const router = express.Router();

/**
 * POST /api/scrape
 * Scrape a website and store content as a note
 *
 * Body:
 * - url: URL to scrape (required)
 * - userId: User identifier (optional)
 * - sessionId: Session identifier (optional)
 * - title: Note title (optional, defaults to page title)
 * - category: Note category (optional, defaults to 'scraped')
 * - tags: Array of tags (optional)
 * - usePuppeteer: Use headless Chrome for JavaScript rendering (optional, default: false)
 */
router.post('/scrape', async (req, res) => {
  try {
    const { url, userId, sessionId, title, category, tags, usePuppeteer } = req.body;

    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'url is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid URL format'
      });
    }

    console.log(`[Scraper] Scraping URL: ${url} (puppeteer: ${usePuppeteer || false})`);

    let content, pageTitle;

    // Use simple HTTP fetching with cheerio for static sites (more reliable)
    const https = require('https');
    const http = require('http');
    const cheerio = require('cheerio');

    const protocol = url.startsWith('https') ? https : http;

    const html = await new Promise((resolve, reject) => {
      const req = protocol.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    // Extract title
    pageTitle = $('title').text() || $('h1').first().text() || url;

    // Remove unwanted elements
    $('script, style, nav, footer, aside, iframe, noscript').remove();

    // Extract main content
    const main = $('main, article, .content, .post-content, .entry-content').first();
    content = main.length > 0 ? main.text() : $('body').text();

    // Clean up content
    content = content
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
      .trim();

    if (!content || content.length < 50) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to extract meaningful content from URL'
      });
    }

    // Store in database
    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    const noteTitle = title || pageTitle || `Scraped: ${url}`;
    const result = await db.query(`
      INSERT INTO notes (
        title,
        content,
        source,
        source_file,
        category,
        tags,
        user_id,
        session_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      noteTitle,
      content,
      'scraped',
      url,
      category || 'web-scrape',
      tags || [],
      userId || null,
      sessionId || null
    ]);

    const note = result.rows[0];

    console.log(`[Scraper] Created note ${note.id}: ${noteTitle} (${content.length} chars)`);

    res.json({
      status: 'ok',
      note: {
        id: note.id,
        title: note.title,
        contentLength: content.length,
        url: url,
        category: note.category,
        tags: note.tags,
        createdAt: note.created_at
      },
      message: `Successfully scraped ${url} and stored as note ${note.id}`
    });

  } catch (error) {
    console.error('[Scraper] Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/scrape/history
 * Get scraped notes history
 */
router.get('/history', async (req, res) => {
  try {
    const { userId, sessionId, limit = 50 } = req.query;
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    let query = `
      SELECT
        id,
        title,
        source_file as url,
        category,
        tags,
        LENGTH(content) as content_length,
        created_at
      FROM notes
      WHERE source = 'scraped'
    `;

    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (sessionId) {
      params.push(sessionId);
      query += ` AND session_id = $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      count: result.rows.length,
      notes: result.rows
    });

  } catch (error) {
    console.error('[Scraper] Error fetching history:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
