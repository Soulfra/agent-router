/**
 * Author Workflow API Routes
 *
 * Endpoints for writing, testing, and publishing content
 */

const express = require('express');
const AuthorWorkflow = require('../lib/author-workflow');
const CalRivenPersona = require('../lib/calriven-persona');

function initAuthorRoutes(db, llmRouter) {
  const router = express.Router();
  const author = new AuthorWorkflow({ db });

  // Initialize CalRiven AI Persona (if LLM router provided)
  const calriven = llmRouter ? new CalRivenPersona({
    db,
    llmRouter,
    calrivenPrivateKey: process.env.CALRIVEN_PRIVATE_KEY,
    calrivenPublicKey: process.env.CALRIVEN_PUBLIC_KEY
  }) : null;

  // Middleware: Require authentication (placeholder)
  const requireAuth = (req, res, next) => {
    // TODO: Integrate with actual auth system
    req.userId = 1; // Hardcoded for now
    next();
  };

  /**
   * POST /api/author/articles
   * Create new draft article
   */
  router.post('/articles', requireAuth, async (req, res) => {
    try {
      const { title, slug, category, tags, content } = req.body;

      if (!title || !slug || !category || !content) {
        return res.status(400).json({
          error: 'Missing required fields: title, slug, category, content'
        });
      }

      const article = await author.createDraft({
        title,
        slug,
        category,
        tags: tags || [],
        content,
        author_id: req.userId
      });

      res.json({
        success: true,
        article: article
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error creating draft:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/articles
   * List articles (with filters)
   */
  router.get('/articles', requireAuth, async (req, res) => {
    try {
      const { status, category, limit = 50 } = req.query;

      let query = `
        SELECT * FROM author_articles
        WHERE author_id = $1
      `;
      const params = [req.userId];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await db.query(query, params);

      res.json({
        success: true,
        articles: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error listing articles:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/articles/:id
   * Get specific article
   */
  router.get('/articles/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `SELECT * FROM author_articles WHERE article_id = $1 AND author_id = $2`,
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      res.json({
        success: true,
        article: result.rows[0]
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error getting article:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/author/articles/:id
   * Update article
   */
  router.put('/articles/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, tags, status } = req.body;

      const updates = [];
      const params = [id, req.userId];

      if (title) {
        params.push(title);
        updates.push(`title = $${params.length}`);
      }

      if (content) {
        params.push(content);
        updates.push(`content = $${params.length}`);
      }

      if (category) {
        params.push(category);
        updates.push(`category = $${params.length}`);
      }

      if (tags) {
        params.push(tags);
        updates.push(`tags = $${params.length}`);
      }

      if (status) {
        params.push(status);
        updates.push(`status = $${params.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const result = await db.query(
        `UPDATE author_articles
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE article_id = $1 AND author_id = $2
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      res.json({
        success: true,
        article: result.rows[0]
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error updating article:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/author/articles/:id/test
   * Test code blocks in article
   */
  router.post('/articles/:id/test', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verify ownership
      const check = await db.query(
        `SELECT 1 FROM author_articles WHERE article_id = $1 AND author_id = $2`,
        [id, req.userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const results = await author.testArticle(id);

      res.json({
        success: results.success,
        results: results
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error testing article:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/author/articles/:id/review
   * Have CalRiven AI review article before publishing
   */
  router.post('/articles/:id/review', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      if (!calriven) {
        return res.status(503).json({ error: 'CalRiven AI not available (LLM router not configured)' });
      }

      // Get article
      const result = await db.query(
        `SELECT * FROM author_articles WHERE article_id = $1 AND author_id = $2`,
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const article = result.rows[0];

      // CalRiven reviews the article
      const review = await calriven.reviewArticle(article);

      res.json({
        success: true,
        review: review
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error reviewing article:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/author/articles/:id/publish
   * Publish article to production
   */
  router.post('/articles/:id/publish', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verify ownership
      const check = await db.query(
        `SELECT 1 FROM author_articles WHERE article_id = $1 AND author_id = $2`,
        [id, req.userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const published = await author.publish(id);

      res.json({
        success: true,
        article: published,
        message: 'Article published successfully'
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error publishing article:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/articles/:id/analytics
   * Get article analytics
   */
  router.get('/articles/:id/analytics', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verify ownership
      const check = await db.query(
        `SELECT 1 FROM author_articles WHERE article_id = $1 AND author_id = $2`,
        [id, req.userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const analytics = await author.getAnalytics(id);

      res.json({
        success: true,
        analytics: analytics
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error getting analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/feed.xml
   * Generate RSS feed for published articles
   */
  router.get('/feed.xml', async (req, res) => {
    try {
      const xml = await author.generateRSSFeed();

      res.set('Content-Type', 'application/xml');
      res.send(xml);

    } catch (error) {
      console.error('[AuthorRoutes] Error generating feed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/stats
   * Get author statistics
   */
  router.get('/stats', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT * FROM author_stats WHERE user_id = $1`,
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          stats: {
            total_articles: 0,
            published_articles: 0,
            draft_articles: 0,
            total_views: 0,
            total_words: 0
          }
        });
      }

      res.json({
        success: true,
        stats: result.rows[0]
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error getting stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/author/autosave
   * Auto-save draft
   */
  router.post('/autosave', requireAuth, async (req, res) => {
    try {
      const { article_id, content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content required' });
      }

      await db.query(
        `INSERT INTO author_autosaves (article_id, author_id, content)
         VALUES ($1, $2, $3)`,
        [article_id || null, req.userId, content]
      );

      res.json({
        success: true,
        message: 'Autosaved'
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error autosaving:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/author/published
   * List all published articles (public endpoint)
   */
  router.get('/published', async (req, res) => {
    try {
      const { category, tag, limit = 20 } = req.query;

      let query = `SELECT * FROM published_articles WHERE 1=1`;
      const params = [];

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      if (tag) {
        params.push(tag);
        query += ` AND $${params.length} = ANY(tags)`;
      }

      query += ` ORDER BY published_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await db.query(query, params);

      res.json({
        success: true,
        articles: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[AuthorRoutes] Error listing published:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = initAuthorRoutes;
