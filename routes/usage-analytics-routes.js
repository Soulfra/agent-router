/**
 * Usage Analytics & Model Rankings API
 *
 * Endpoints for viewing discovered usage patterns and model rankings:
 * - What are people actually asking about?
 * - Which models perform best for each use case?
 * - Cost savings analysis
 */

const express = require('express');
const router = express.Router();

let usageTracker = null;
let useCaseAnalyzer = null;
let modelRanker = null;
let minioClient = null;

/**
 * Initialize routes with analytics components
 */
function initRoutes(components) {
  usageTracker = components.usageTracker;
  useCaseAnalyzer = components.useCaseAnalyzer;
  modelRanker = components.modelRanker;
  minioClient = components.minioClient;

  console.log('✓ Usage Analytics routes initialized');
  return router;
}

/**
 * GET /api/usage/stats
 * Recent usage statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '1 hour';

    const stats = await usageTracker.getStats(timeframe);

    res.json({
      status: 'success',
      timeframe,
      stats
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/usage/patterns
 * Discover what people are actually asking about
 */
router.get('/patterns', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '1 week';

    const analysis = await useCaseAnalyzer.analyze(timeframe);

    res.json({
      status: 'success',
      ...analysis,
      insights: _generateInsights(analysis)
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/usage/common-prompts
 * Most frequent prompts
 */
router.get('/common-prompts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const prompts = await usageTracker.getCommonPrompts(limit);

    res.json({
      status: 'success',
      prompts
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/usage/categories
 * Discovered use case categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await useCaseAnalyzer.getCategories();

    res.json({
      status: 'success',
      categories
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/rankings
 * All model rankings (summary)
 */
router.get('/rankings', async (req, res) => {
  try {
    const rankings = await modelRanker.getAllRankings();

    res.json({
      status: 'success',
      rankings
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/rankings/:useCase
 * Rankings for specific use case
 */
router.get('/rankings/:useCase', async (req, res) => {
  try {
    const { useCase } = req.params;

    const rankings = await modelRanker.getRankings(useCase);

    res.json({
      status: 'success',
      ...rankings
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/rankings/refresh
 * Refresh all rankings from latest data
 */
router.post('/rankings/refresh', async (req, res) => {
  try {
    const count = await modelRanker.refreshAll();

    res.json({
      status: 'success',
      message: `Refreshed ${count} rankings`,
      count
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/rankings/compare
 * Compare two models for a use case
 *
 * Query params:
 * - useCase: Use case category
 * - modelA: First model
 * - modelB: Second model
 */
router.get('/rankings/compare', async (req, res) => {
  try {
    const { useCase, modelA, modelB } = req.query;

    if (!useCase || !modelA || !modelB) {
      return res.status(400).json({
        status: 'error',
        message: 'useCase, modelA, and modelB query params required'
      });
    }

    const comparison = await modelRanker.compareModels(useCase, modelA, modelB);

    res.json({
      status: 'success',
      ...comparison
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/savings
 * Analyze potential cost savings
 */
router.get('/savings', async (req, res) => {
  try {
    const analysis = await modelRanker.analyzeSavings();

    res.json({
      status: 'success',
      ...analysis
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/performance/:modelId/:useCase
 * Model performance trend over time
 */
router.get('/performance/:modelId/:useCase', async (req, res) => {
  try {
    const { modelId, useCase } = req.params;
    const timeframe = req.query.timeframe || '1 week';

    const trend = await modelRanker.getPerformanceTrend(modelId, useCase, timeframe);

    res.json({
      status: 'success',
      modelId,
      useCase,
      timeframe,
      trend
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/models/storage
 * MinIO model storage info
 */
router.get('/models/storage', async (req, res) => {
  try {
    if (!minioClient) {
      return res.status(503).json({
        status: 'error',
        message: 'MinIO not configured'
      });
    }

    const available = await minioClient.isAvailable();

    if (!available) {
      return res.status(503).json({
        status: 'error',
        message: 'MinIO not available'
      });
    }

    const models = await minioClient.listModels();

    res.json({
      status: 'success',
      bucket: minioClient.bucketName,
      models: models.map(m => ({
        name: m.name,
        size: m.size,
        lastModified: m.lastModified
      }))
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/usage/dashboard
 * Complete analytics dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '1 week';

    // Gather all data
    const [
      stats,
      patterns,
      rankings,
      savings,
      commonPrompts
    ] = await Promise.all([
      usageTracker.getStats(timeframe),
      useCaseAnalyzer.analyze(timeframe),
      modelRanker.getAllRankings(),
      modelRanker.analyzeSavings(),
      usageTracker.getCommonPrompts(10)
    ]);

    res.json({
      status: 'success',
      timeframe,
      dashboard: {
        stats,
        patterns,
        rankings,
        savings,
        commonPrompts,
        insights: _generateInsights(patterns)
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Generate insights from patterns
 * @private
 */
function _generateInsights(patterns) {
  const insights = [];

  if (!patterns || !patterns.routingPatterns) {
    return insights;
  }

  const { inefficiencies } = patterns.routingPatterns;

  if (inefficiencies && inefficiencies.length > 0) {
    insights.push({
      type: 'cost_optimization',
      severity: 'high',
      message: `Found ${inefficiencies.length} routing inefficiencies`,
      details: inefficiencies
    });
  }

  // Check if internal models are underutilized
  const { byModel } = patterns.routingPatterns;

  let internalRequests = 0;
  let externalRequests = 0;

  for (const [modelId, stats] of Object.entries(byModel)) {
    if (modelId.includes('ollama') || modelId.endsWith('-model')) {
      internalRequests += stats.totalRequests;
    } else {
      externalRequests += stats.totalRequests;
    }
  }

  const totalRequests = internalRequests + externalRequests;

  if (totalRequests > 0) {
    const internalPercent = (internalRequests / totalRequests) * 100;

    if (internalPercent < 50) {
      insights.push({
        type: 'underutilized_internal',
        severity: 'medium',
        message: `Only ${internalPercent.toFixed(1)}% of requests use internal Ollama models (free)`,
        suggestion: 'Route more queries to Ollama to reduce costs'
      });
    }
  }

  return insights;
}

module.exports = { router, initRoutes };
