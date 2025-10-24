/**
 * Content Curation Routes
 *
 * API endpoints for content curation system:
 * - Configure curation preferences
 * - Fetch curated feed
 * - Generate newsletters
 * - Preview content
 */

const express = require('express');
const router = express.Router();
const ContentCurator = require('../lib/content-curator');

let db = null;
let curator = null;

/**
 * Initialize routes with database
 */
function initRoutes(database) {
  db = database;
  curator = new ContentCurator(db);
  return router;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * POST /api/curation/configure
 * Save user curation configuration
 */
router.post('/configure', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const config = req.body;

    // Validate configuration
    if (!config.topics && !config.sources && !config.customRSS) {
      return res.status(400).json({
        status: 'error',
        error: 'Configuration must include at least topics, sources, or custom RSS feeds'
      });
    }

    const result = await curator.saveConfiguration(userId, config);

    res.json({
      status: 'success',
      configId: result.configId,
      message: 'Curation configuration saved successfully'
    });
  } catch (error) {
    console.error('[CurationRoutes] Error saving configuration:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/curation/config
 * Get user curation configuration
 */
router.get('/config', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const config = await curator.getConfiguration(userId);

    if (!config) {
      return res.status(404).json({
        status: 'error',
        error: 'No configuration found for user'
      });
    }

    res.json({
      status: 'success',
      config
    });
  } catch (error) {
    console.error('[CurationRoutes] Error getting configuration:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// FEED
// ============================================================================

/**
 * GET /api/curation/feed
 * Get curated content feed for user
 *
 * Query params:
 * - limit: Number of items (default: 50)
 * - offset: Pagination offset (default: 0)
 * - minScore: Minimum relevance score (default: 0)
 */
router.get('/feed', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const minScore = parseFloat(req.query.minScore) || 0;

    const feed = await curator.getCuratedFeed(userId, { limit, offset, minScore });

    res.json({
      status: 'success',
      items: feed.items,
      total: feed.total,
      pagination: {
        limit,
        offset,
        hasMore: (offset + limit) < feed.total
      },
      config: feed.config
    });
  } catch (error) {
    console.error('[CurationRoutes] Error getting feed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      items: []
    });
  }
});

// ============================================================================
// SOURCE-SPECIFIC ENDPOINTS
// ============================================================================

/**
 * GET /api/curation/sources/hackernews
 * Get Hacker News feed
 */
router.get('/sources/hackernews', async (req, res) => {
  try {
    const items = await curator.fetchHackerNews();

    res.json({
      status: 'success',
      source: 'Hacker News',
      items,
      count: items.length
    });
  } catch (error) {
    console.error('[CurationRoutes] Error fetching Hacker News:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/curation/sources/reddit/:subreddit
 * Get Reddit feed for specific subreddit
 */
router.get('/sources/reddit/:subreddit', async (req, res) => {
  try {
    const subreddit = req.params.subreddit;
    const items = await curator.fetchReddit(subreddit);

    res.json({
      status: 'success',
      source: `r/${subreddit}`,
      items,
      count: items.length
    });
  } catch (error) {
    console.error(`[CurationRoutes] Error fetching Reddit r/${req.params.subreddit}:`, error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/curation/sources/github-trending
 * Get GitHub trending repositories
 */
router.get('/sources/github-trending', async (req, res) => {
  try {
    const items = await curator.fetchGitHubTrending();

    res.json({
      status: 'success',
      source: 'GitHub Trending',
      items,
      count: items.length
    });
  } catch (error) {
    console.error('[CurationRoutes] Error fetching GitHub Trending:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * POST /api/curation/sources/rss
 * Fetch custom RSS feed
 *
 * Body:
 * - url: RSS feed URL
 */
router.post('/sources/rss', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        status: 'error',
        error: 'RSS feed URL is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid URL format'
      });
    }

    const items = await curator.fetchRSS(url);

    res.json({
      status: 'success',
      source: 'RSS Feed',
      url,
      items,
      count: items.length
    });
  } catch (error) {
    console.error('[CurationRoutes] Error fetching RSS feed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// NEWSLETTER
// ============================================================================

/**
 * GET /api/curation/newsletter
 * Generate newsletter for user
 *
 * Query params:
 * - limit: Number of items (default: 10)
 * - format: 'html' or 'text' (default: 'html')
 */
router.get('/newsletter', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const limit = parseInt(req.query.limit) || 10;
    const format = req.query.format || 'html';

    const newsletter = await curator.generateNewsletter(userId, { limit });

    if (format === 'text') {
      res.type('text/plain').send(newsletter.plainText);
    } else {
      res.type('text/html').send(newsletter.html);
    }
  } catch (error) {
    console.error('[CurationRoutes] Error generating newsletter:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * POST /api/curation/newsletter/send
 * Send newsletter via email
 */
router.post('/newsletter/send', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const config = await curator.getConfiguration(userId);

    if (!config || !config.email) {
      return res.status(400).json({
        status: 'error',
        error: 'No email configured for newsletters'
      });
    }

    const newsletter = await curator.generateNewsletter(userId, { limit: 10 });

    // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
    // For now, return success
    res.json({
      status: 'success',
      message: `Newsletter would be sent to ${config.email}`,
      itemCount: newsletter.itemCount,
      preview: newsletter.html.slice(0, 500) + '...'
    });
  } catch (error) {
    console.error('[CurationRoutes] Error sending newsletter:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// PREVIEW
// ============================================================================

/**
 * GET /api/curation/preview
 * Preview curated content without saving configuration
 *
 * Query params:
 * - topics: Comma-separated topics
 * - sources: Comma-separated sources
 * - limit: Number of items (default: 10)
 */
router.get('/preview', async (req, res) => {
  try {
    const topics = req.query.topics ? req.query.topics.split(',') : [];
    const sources = req.query.sources ? req.query.sources.split(',') : [];
    const limit = parseInt(req.query.limit) || 10;

    // Temporary user ID for preview
    const tempUserId = `preview-${Date.now()}`;

    // Save temporary config
    await curator.saveConfiguration(tempUserId, {
      topics,
      sources,
      customRSS: [],
      frequency: 'realtime',
      deliveryTime: '09:00',
      email: ''
    });

    // Get feed
    const feed = await curator.getCuratedFeed(tempUserId, { limit });

    // Clean up temporary config (optional)
    // await db.query('DELETE FROM curation_configs WHERE user_id = $1', [tempUserId]);

    res.json({
      status: 'success',
      items: feed.items,
      count: feed.items.length,
      preview: true
    });
  } catch (error) {
    console.error('[CurationRoutes] Error generating preview:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// STATS
// ============================================================================

/**
 * GET /api/curation/stats
 * Get curation statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const config = await curator.getConfiguration(userId);

    if (!config) {
      return res.json({
        status: 'success',
        configured: false,
        stats: null
      });
    }

    // Get feed stats
    const feed = await curator.getCuratedFeed(userId, { limit: 100 });

    // Calculate stats
    const sourceBreakdown = {};
    feed.items.forEach(item => {
      sourceBreakdown[item.source] = (sourceBreakdown[item.source] || 0) + 1;
    });

    const topicBreakdown = {};
    feed.items.forEach(item => {
      item.topics.forEach(topic => {
        topicBreakdown[topic] = (topicBreakdown[topic] || 0) + 1;
      });
    });

    res.json({
      status: 'success',
      configured: true,
      stats: {
        totalItems: feed.total,
        sourceBreakdown,
        topicBreakdown,
        configuredTopics: config.topics.length,
        configuredSources: config.sources.length + config.customRSS.length,
        frequency: config.frequency,
        lastUpdated: config.updatedAt
      }
    });
  } catch (error) {
    console.error('[CurationRoutes] Error getting stats:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = {
  router,
  initRoutes
};
