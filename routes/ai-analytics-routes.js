/**
 * AI Analytics API Routes
 *
 * Endpoints for cost analytics, alerts, and A/B testing
 */

const express = require('express');
const router = express.Router();
const TrendDetector = require('../lib/trend-detector');
const CapacityMonitor = require('../lib/capacity-monitor');

module.exports = (options = {}) => {
  const {
    db,
    aiCostAnalytics,
    aiCostAlerts,
    aiABTesting,
    aiInstanceRegistry
  } = options;

  // Initialize helpers
  const trendDetector = new TrendDetector();
  const capacityMonitor = new CapacityMonitor({
    contextWindow: 200000, // 200K tokens
    tokensPerHour: 100000,
    costPerHour: 1.50,
    costPerDay: 10.00,
    requestsPerMinute: 60
  });

  /**
   * GET /api/ai-analytics/dashboard
   * Visual dashboard data with "glass of water" and inflection points
   */
  router.get('/dashboard', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      // Get cost candles for trend analysis
      const candles = await aiCostAnalytics.computeCostCandles({
        timeframe: '1h',
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        to: new Date()
      }).catch(() => []);

      // Analyze trend with inflection point detection
      const trendAnalysis = trendDetector.analyzeTrend(candles);

      // Get current usage stats
      const summary = await aiCostAnalytics.getSummary().catch(() => null);

      // Calculate context usage from recent candles
      const lastHourCandles = candles.slice(-1); // Last hour
      const contextUsedThisHour = lastHourCandles.reduce((sum, c) => sum + (c.totalPromptTokens || 0), 0);
      const totalTokensThisHour = lastHourCandles.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
      const costThisHour = lastHourCandles.reduce((sum, c) => sum + (c.totalCost || 0), 0);

      // Update capacity monitor
      capacityMonitor.updateUsage({
        contextUsed: contextUsedThisHour,
        tokensThisHour: totalTokensThisHour,
        costThisHour: costThisHour,
        costToday: summary?.last24Hours?.totalCost || 0,
        requestsThisMinute: 0
      });

      // Get capacity report
      const capacityReport = capacityMonitor.getCapacityReport();
      const overallCapacity = capacityMonitor.getOverallCapacity();

      // Get alert status
      const alertSummary = aiCostAlerts ?
        await aiCostAlerts.getAlertSummary().catch(() => null) : null;

      res.json({
        // Trend analysis with derivative sign changes
        trend: {
          state: trendAnalysis.state,
          emoji: trendAnalysis.emoji,
          message: trendAnalysis.message,
          inflectionPoint: trendAnalysis.inflectionPoint,
          transition: trendAnalysis.transition,
          derivative: trendAnalysis.derivative,
          confidence: trendAnalysis.confidence
        },

        // Capacity "glass of water" visualization
        capacity: {
          overall: overallCapacity,
          details: capacityReport
        },

        // Context token usage
        contextUsage: {
          thisHour: contextUsedThisHour,
          limit: 200000, // 200K context window
          percentUsed: ((contextUsedThisHour / 200000) * 100).toFixed(1)
        },

        // Alert status
        alerts: alertSummary,

        // Raw data for charts
        candles: candles.slice(-24), // Last 24 hours

        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting dashboard:', error);
      res.status(500).json({
        error: 'Failed to get dashboard data',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/summary
   * Get overall analytics summary
   */
  router.get('/summary', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      const summary = await aiCostAnalytics.getSummary();

      res.json(summary);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting summary:', error);
      res.status(500).json({
        error: 'Failed to get analytics summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/candles
   * Get cost candles for visualization
   *
   * Query params:
   * - provider: Filter by provider
   * - instanceName: Filter by instance
   * - timeframe: 5m, 15m, 1h, 4h, 1d, 1w (default: 1h)
   * - from: Start date (ISO string)
   * - to: End date (ISO string)
   */
  router.get('/candles', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      const {
        provider,
        instanceName,
        timeframe = '1h',
        from,
        to
      } = req.query;

      const candles = await aiCostAnalytics.computeCostCandles({
        provider,
        instanceName,
        timeframe,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined
      });

      res.json(candles);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting candles:', error);
      res.status(500).json({
        error: 'Failed to get cost candles',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/trend
   * Detect cost trend
   *
   * Query params:
   * - provider: Filter by provider
   * - instanceName: Filter by instance
   * - lookbackPeriod: 1h, 24h, 7d, etc. (default: 24h)
   */
  router.get('/trend', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      const {
        provider,
        instanceName,
        lookbackPeriod = '24h'
      } = req.query;

      const trend = await aiCostAnalytics.detectTrend({
        provider,
        instanceName,
        lookbackPeriod
      });

      res.json(trend);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error detecting trend:', error);
      res.status(500).json({
        error: 'Failed to detect trend',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/providers
   * Compare provider efficiency
   *
   * Query params:
   * - from: Start date (ISO string)
   * - to: End date (ISO string)
   * - minRequests: Minimum requests to include (default: 10)
   */
  router.get('/providers', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      const {
        from,
        to,
        minRequests = 10
      } = req.query;

      const providers = await aiCostAnalytics.compareProviders({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        minRequests: parseInt(minRequests)
      });

      res.json(providers);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error comparing providers:', error);
      res.status(500).json({
        error: 'Failed to compare providers',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/projection
   * Project future costs
   *
   * Query params:
   * - provider: Filter by provider
   * - instanceName: Filter by instance
   * - projectionPeriod: 7d, 30d, etc. (default: 7d)
   */
  router.get('/projection', async (req, res) => {
    try {
      if (!aiCostAnalytics) {
        return res.status(503).json({
          error: 'AI Cost Analytics not available'
        });
      }

      const {
        provider,
        instanceName,
        projectionPeriod = '7d'
      } = req.query;

      const projection = await aiCostAnalytics.projectCosts({
        provider,
        instanceName,
        projectionPeriod
      });

      res.json(projection);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error projecting costs:', error);
      res.status(500).json({
        error: 'Failed to project costs',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/alerts
   * Get alert status for all instances
   */
  router.get('/alerts', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const summary = await aiCostAlerts.getAlertSummary();

      res.json(summary);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting alerts:', error);
      res.status(500).json({
        error: 'Failed to get alerts',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/alerts/:instanceName
   * Check alert status for specific instance
   */
  router.get('/alerts/:instanceName', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const { instanceName } = req.params;

      const status = await aiCostAlerts.checkThresholds(instanceName);

      res.json(status);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error checking alert:', error);
      res.status(500).json({
        error: 'Failed to check alert',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/alerts/:instanceName/thresholds
   * Set custom thresholds for instance
   */
  router.post('/alerts/:instanceName/thresholds', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const { instanceName } = req.params;
      const thresholds = req.body;

      aiCostAlerts.setThresholds(instanceName, thresholds);

      res.json({
        success: true,
        message: `Thresholds set for ${instanceName}`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error setting thresholds:', error);
      res.status(500).json({
        error: 'Failed to set thresholds',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/circuit-breaker/:instanceName
   * Set up circuit breaker for instance
   */
  router.post('/circuit-breaker/:instanceName', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const { instanceName } = req.params;
      const options = req.body;

      aiCostAlerts.setCircuitBreaker(instanceName, options);

      res.json({
        success: true,
        message: `Circuit breaker set for ${instanceName}`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error setting circuit breaker:', error);
      res.status(500).json({
        error: 'Failed to set circuit breaker',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/circuit-breaker/:instanceName/reset
   * Reset circuit breaker
   */
  router.post('/circuit-breaker/:instanceName/reset', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const { instanceName } = req.params;

      aiCostAlerts.resetCircuitBreaker(instanceName);

      res.json({
        success: true,
        message: `Circuit breaker reset for ${instanceName}`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error resetting circuit breaker:', error);
      res.status(500).json({
        error: 'Failed to reset circuit breaker',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/fallback/:instanceName
   * Set up fallback rule
   */
  router.post('/fallback/:instanceName', async (req, res) => {
    try {
      if (!aiCostAlerts) {
        return res.status(503).json({
          error: 'AI Cost Alerts not available'
        });
      }

      const { instanceName } = req.params;
      const options = req.body;

      aiCostAlerts.setFallbackRule(instanceName, options);

      res.json({
        success: true,
        message: `Fallback rule set for ${instanceName}`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error setting fallback:', error);
      res.status(500).json({
        error: 'Failed to set fallback',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/experiments
   * List A/B test experiments
   *
   * Query params:
   * - status: Filter by status (running, stopped, promoted)
   */
  router.get('/experiments', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const { status } = req.query;

      const experiments = aiABTesting.listExperiments({ status });

      res.json(experiments);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error listing experiments:', error);
      res.status(500).json({
        error: 'Failed to list experiments',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/experiments
   * Create new A/B test experiment
   */
  router.post('/experiments', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const config = req.body;

      const experimentId = aiABTesting.createExperiment(config);

      res.json({
        success: true,
        experimentId,
        message: `Experiment created: ${config.name}`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error creating experiment:', error);
      res.status(500).json({
        error: 'Failed to create experiment',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/experiments/:experimentId
   * Get experiment status
   */
  router.get('/experiments/:experimentId', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const { experimentId } = req.params;

      const status = aiABTesting.getExperimentStatus(experimentId);

      res.json(status);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting experiment:', error);
      res.status(500).json({
        error: 'Failed to get experiment',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/experiments/:experimentId/stop
   * Stop experiment
   */
  router.post('/experiments/:experimentId/stop', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const { experimentId } = req.params;
      const { reason = 'manual' } = req.body;

      const results = aiABTesting.stopExperiment(experimentId, reason);

      res.json({
        success: true,
        results,
        message: 'Experiment stopped'
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error stopping experiment:', error);
      res.status(500).json({
        error: 'Failed to stop experiment',
        message: error.message
      });
    }
  });

  /**
   * POST /api/ai-analytics/experiments/:experimentId/promote
   * Promote variant to production
   */
  router.post('/experiments/:experimentId/promote', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const { experimentId } = req.params;
      const { variantName } = req.body;

      if (!variantName) {
        return res.status(400).json({
          error: 'variantName is required'
        });
      }

      const result = aiABTesting.promoteVariant(experimentId, variantName);

      res.json({
        success: true,
        result,
        message: `Variant ${variantName} promoted`
      });

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error promoting variant:', error);
      res.status(500).json({
        error: 'Failed to promote variant',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/experiments/summary
   * Get experiments summary
   */
  router.get('/experiments/summary', async (req, res) => {
    try {
      if (!aiABTesting) {
        return res.status(503).json({
          error: 'AI A/B Testing not available'
        });
      }

      const summary = aiABTesting.getSummary();

      res.json(summary);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting experiments summary:', error);
      res.status(500).json({
        error: 'Failed to get experiments summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/instances
   * List all AI instances
   */
  router.get('/instances', async (req, res) => {
    try {
      if (!aiInstanceRegistry) {
        return res.status(503).json({
          error: 'AI Instance Registry not available'
        });
      }

      const instances = aiInstanceRegistry.listInstances();

      res.json(instances);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error listing instances:', error);
      res.status(500).json({
        error: 'Failed to list instances',
        message: error.message
      });
    }
  });

  /**
   * GET /api/ai-analytics/instances/:instanceName
   * Get specific instance details
   */
  router.get('/instances/:instanceName', async (req, res) => {
    try {
      if (!aiInstanceRegistry) {
        return res.status(503).json({
          error: 'AI Instance Registry not available'
        });
      }

      const { instanceName } = req.params;

      const instance = aiInstanceRegistry.getInstance(instanceName);

      if (!instance) {
        return res.status(404).json({
          error: `Instance ${instanceName} not found`
        });
      }

      res.json(instance);

    } catch (error) {
      console.error('[AIAnalyticsRoutes] Error getting instance:', error);
      res.status(500).json({
        error: 'Failed to get instance',
        message: error.message
      });
    }
  });

  return router;
};
