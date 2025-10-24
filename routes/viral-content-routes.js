/**
 * Viral Content Routes
 *
 * API endpoints for viral content optimization and revenue tracking:
 * - Optimize content for virality
 * - Track performance metrics
 * - Get ROI analysis
 * - View top performers
 * - Get budget recommendations
 */

const express = require('express');
const router = express.Router();

let viralOptimizer = null;
let revenueTracker = null;
let translationPipeline = null;
let languageDetector = null;
let utmGenerator = null;
let linkEnricher = null;
let learningPathGenerator = null;

// Initialize systems
function initSystems(instances) {
  viralOptimizer = instances.viralOptimizer;
  revenueTracker = instances.revenueTracker;
  translationPipeline = instances.translationPipeline;
  languageDetector = instances.languageDetector;
  utmGenerator = instances.utmGenerator;
  linkEnricher = instances.linkEnricher;
  learningPathGenerator = instances.learningPathGenerator;
}

/**
 * POST /api/viral/optimize
 * Optimize content for virality
 */
router.post('/optimize', async (req, res) => {
  try {
    if (!viralOptimizer) {
      return res.status(503).json({ error: 'Viral optimizer not initialized' });
    }

    const {
      content, // { title, body, language }
      platform = 'mastodon',
      targetAudience = 'tech',
      goal = 'engagement'
    } = req.body;

    if (!content || !content.title || !content.body) {
      return res.status(400).json({ error: 'content.title and content.body are required' });
    }

    const optimized = await viralOptimizer.optimize({
      content,
      platform,
      targetAudience,
      goal
    });

    res.json({
      success: true,
      optimized
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Optimize error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/optimize/batch
 * Optimize for multiple platforms at once
 */
router.post('/optimize/batch', async (req, res) => {
  try {
    if (!viralOptimizer) {
      return res.status(503).json({ error: 'Viral optimizer not initialized' });
    }

    const {
      content,
      platforms = ['mastodon', 'twitter', 'blog'],
      targetAudience = 'tech'
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const results = await viralOptimizer.batchOptimize(content, platforms, targetAudience);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Batch optimize error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/translate
 * Translate narrative to multiple languages
 */
router.post('/translate', async (req, res) => {
  try {
    if (!translationPipeline) {
      return res.status(503).json({ error: 'Translation pipeline not initialized' });
    }

    const {
      narrative,
      targetLanguages = ['es', 'zh', 'ja'],
      brand = 'calos',
      sourceLanguage = 'en'
    } = req.body;

    if (!narrative) {
      return res.status(400).json({ error: 'narrative is required' });
    }

    const result = await translationPipeline.translateNarrative({
      narrative,
      targetLanguages,
      brand,
      sourceLanguage
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Translate error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/languages
 * Get supported languages with speaker counts
 */
router.get('/languages', async (req, res) => {
  try {
    if (!translationPipeline) {
      return res.status(503).json({ error: 'Translation pipeline not initialized' });
    }

    const languages = translationPipeline.getSupportedLanguages();

    res.json({ languages });
  } catch (error) {
    console.error('[ViralContentRoutes] Languages error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/detect-language
 * Detect user's preferred language from request
 */
router.get('/detect-language', async (req, res) => {
  try {
    if (!languageDetector) {
      return res.status(503).json({ error: 'Language detector not initialized' });
    }

    const userId = req.query.userId || null;

    const detected = await languageDetector.detect(req, userId);
    const preload = await languageDetector.getPreloadLanguages(req, userId);

    res.json({
      detected,
      preload,
      signals: {
        browser: req.headers['accept-language'],
        ip: req.ip,
        timezone: req.headers['x-timezone'] || req.query.timezone
      }
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Detect language error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/track
 * Track post performance
 */
router.post('/track', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const {
      postId,
      sessionId = null,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      cost = 0,
      metrics = {}
    } = req.body;

    if (!postId || !platform) {
      return res.status(400).json({ error: 'postId and platform are required' });
    }

    const result = await revenueTracker.trackPost({
      postId,
      sessionId,
      platform,
      language,
      persona,
      brand,
      cost,
      metrics
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Track error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/roi
 * Get ROI analysis
 */
router.get('/roi', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const filters = {
      platform: req.query.platform || null,
      language: req.query.language || null,
      persona: req.query.persona || null,
      brand: req.query.brand || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const roi = await revenueTracker.getROI(filters);

    res.json({ roi });
  } catch (error) {
    console.error('[ViralContentRoutes] ROI error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/top-performers
 * Get top performing content
 */
router.get('/top-performers', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const criteria = req.query.criteria || 'roi';
    const limit = parseInt(req.query.limit) || 10;
    const filters = {
      platform: req.query.platform || null,
      language: req.query.language || null,
      persona: req.query.persona || null,
      brand: req.query.brand || null
    };

    const topPerformers = await revenueTracker.getTopPerformers(criteria, limit, filters);

    res.json({ topPerformers });
  } catch (error) {
    console.error('[ViralContentRoutes] Top performers error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/compare
 * Compare performance across dimensions
 */
router.get('/compare', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const dimension = req.query.dimension || 'language';

    const comparison = await revenueTracker.comparePerformance(dimension);

    res.json({ comparison, dimension });
  } catch (error) {
    console.error('[ViralContentRoutes] Compare error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/budget-recommendations
 * Get budget allocation recommendations
 */
router.get('/budget-recommendations', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const recommendations = await revenueTracker.getBudgetRecommendations();

    res.json({ recommendations });
  } catch (error) {
    console.error('[ViralContentRoutes] Budget recommendations error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/trends
 * Get performance trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    if (!revenueTracker) {
      return res.status(503).json({ error: 'Revenue tracker not initialized' });
    }

    const dimension = req.query.dimension || 'day';
    const filters = {
      platform: req.query.platform || null,
      language: req.query.language || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const trends = await revenueTracker.getTrends(dimension, filters);

    res.json({ trends, dimension });
  } catch (error) {
    console.error('[ViralContentRoutes] Trends error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/tips
 * Get viral content tips for language/platform
 */
router.get('/tips', async (req, res) => {
  try {
    if (!viralOptimizer) {
      return res.status(503).json({ error: 'Viral optimizer not initialized' });
    }

    const language = req.query.language || 'en';
    const platform = req.query.platform || 'mastodon';

    const tips = viralOptimizer.getViralTips(language, platform);

    res.json({ tips, language, platform });
  } catch (error) {
    console.error('[ViralContentRoutes] Tips error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/utm/enrich
 * Enrich content with UTM tracking parameters
 */
router.post('/utm/enrich', async (req, res) => {
  try {
    if (!linkEnricher) {
      return res.status(503).json({ error: 'Link enricher not initialized' });
    }

    const {
      content,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      narrative = {},
      topics = [],
      contentType = 'markdown'
    } = req.body;

    if (!content || !platform) {
      return res.status(400).json({ error: 'content and platform are required' });
    }

    const enriched = await linkEnricher.enrichContent({
      content,
      platform,
      language,
      persona,
      brand,
      sessionId,
      narrative,
      topics,
      contentType
    });

    res.json({
      success: true,
      enriched,
      original: content
    });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM enrich error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/utm/performance/:campaign
 * Get UTM campaign performance analytics
 */
router.get('/utm/performance/:campaign', async (req, res) => {
  try {
    if (!utmGenerator) {
      return res.status(503).json({ error: 'UTM generator not initialized' });
    }

    const { campaign } = req.params;

    const performance = await utmGenerator.getCampaignPerformance(campaign);

    res.json({ campaign, performance });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM performance error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/utm/top-performers
 * Get top performing UTM campaigns
 */
router.get('/utm/top-performers', async (req, res) => {
  try {
    if (!utmGenerator) {
      return res.status(503).json({ error: 'UTM generator not initialized' });
    }

    const metric = req.query.metric || 'revenue';
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const topPerformers = await utmGenerator.getTopPerformers({
      metric,
      limit,
      startDate,
      endDate
    });

    res.json({ topPerformers, metric });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM top performers error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/utm/track-click
 * Track UTM campaign click
 */
router.post('/utm/track-click', async (req, res) => {
  try {
    if (!utmGenerator) {
      return res.status(503).json({ error: 'UTM generator not initialized' });
    }

    const {
      url,
      source,
      medium,
      campaign,
      content,
      term,
      userId = null,
      metadata = {}
    } = req.body;

    if (!url || !source || !campaign) {
      return res.status(400).json({ error: 'url, source, and campaign are required' });
    }

    await utmGenerator.trackClick({
      url,
      source,
      medium,
      campaign,
      content,
      term,
      userId,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM track click error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/utm/track-conversion
 * Track UTM campaign conversion
 */
router.post('/utm/track-conversion', async (req, res) => {
  try {
    if (!utmGenerator) {
      return res.status(503).json({ error: 'UTM generator not initialized' });
    }

    const {
      campaign,
      source,
      medium,
      content,
      term,
      conversionType = 'purchase',
      conversionValue = 0,
      userId = null,
      metadata = {}
    } = req.body;

    if (!campaign || !source) {
      return res.status(400).json({ error: 'campaign and source are required' });
    }

    await utmGenerator.trackConversion({
      campaign,
      source,
      medium,
      content,
      term,
      conversionType,
      conversionValue,
      userId,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM track conversion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/learning-path/create
 * Create learning path with UTM tracking
 */
router.post('/learning-path/create', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const {
      title,
      description,
      steps,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      topics = []
    } = req.body;

    if (!title || !steps || !platform) {
      return res.status(400).json({ error: 'title, steps, and platform are required' });
    }

    const path = await learningPathGenerator.createPath({
      title,
      description,
      steps,
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics
    });

    res.json({
      success: true,
      path
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path create error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/learning-path/from-narrative
 * Generate learning path from narrative
 */
router.post('/learning-path/from-narrative', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const {
      narrative,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      pathTemplate = null
    } = req.body;

    if (!narrative || !platform) {
      return res.status(400).json({ error: 'narrative and platform are required' });
    }

    const path = await learningPathGenerator.generateFromNarrative({
      narrative,
      platform,
      language,
      persona,
      brand,
      sessionId,
      pathTemplate
    });

    res.json({
      success: true,
      path
    });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path from narrative error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/learning-path/performance/:pathId
 * Get learning path performance analytics
 */
router.get('/learning-path/performance/:pathId', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const { pathId } = req.params;

    const performance = await learningPathGenerator.getPathPerformance(pathId);

    if (!performance) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    res.json({ performance });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path performance error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/learning-path/top-paths
 * Get top performing learning paths
 */
router.get('/learning-path/top-paths', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const metric = req.query.metric || 'revenue';
    const limit = parseInt(req.query.limit) || 10;
    const platform = req.query.platform || null;
    const language = req.query.language || null;
    const brand = req.query.brand || null;

    const topPaths = await learningPathGenerator.getTopPaths({
      metric,
      limit,
      platform,
      language,
      brand
    });

    res.json({ topPaths, metric });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path top paths error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/learning-path/track-step
 * Track learning path step completion
 */
router.post('/learning-path/track-step', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const {
      pathId,
      stepNumber,
      userId = null,
      sessionId = null,
      timeSpent = null,
      metadata = {}
    } = req.body;

    if (!pathId || !stepNumber) {
      return res.status(400).json({ error: 'pathId and stepNumber are required' });
    }

    await learningPathGenerator.trackStepCompletion({
      pathId,
      stepNumber,
      userId,
      sessionId,
      timeSpent,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path track step error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/viral/learning-path/track-conversion
 * Track learning path conversion
 */
router.post('/learning-path/track-conversion', async (req, res) => {
  try {
    if (!learningPathGenerator) {
      return res.status(503).json({ error: 'Learning path generator not initialized' });
    }

    const {
      pathId,
      userId = null,
      sessionId = null,
      conversionType = 'purchase',
      conversionValue = 0,
      stepNumber = null,
      metadata = {}
    } = req.body;

    if (!pathId) {
      return res.status(400).json({ error: 'pathId is required' });
    }

    await learningPathGenerator.trackPathConversion({
      pathId,
      userId,
      sessionId,
      conversionType,
      conversionValue,
      stepNumber,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ViralContentRoutes] Learning path track conversion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/viral/utm/enrichment-stats
 * Get link enrichment statistics
 */
router.get('/utm/enrichment-stats', async (req, res) => {
  try {
    if (!linkEnricher) {
      return res.status(503).json({ error: 'Link enricher not initialized' });
    }

    const filters = {
      platform: req.query.platform || null,
      language: req.query.language || null,
      persona: req.query.persona || null,
      brand: req.query.brand || null,
      linkType: req.query.linkType || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const stats = await linkEnricher.getEnrichmentStats(filters);

    res.json({ stats });
  } catch (error) {
    console.error('[ViralContentRoutes] UTM enrichment stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.initSystems = initSystems;
