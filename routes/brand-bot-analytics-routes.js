/**
 * Brand & Bot Analytics API Routes
 *
 * Endpoints:
 * - GET /api/analytics/brands - Brand engagement summary
 * - GET /api/analytics/brands/:brand - Specific brand analytics
 * - GET /api/analytics/models - Model preference data
 * - GET /api/analytics/bots/behavior - Bot behavior stats
 * - GET /api/analytics/awol-events - AWOL event timeline
 * - GET /api/analytics/funny-moments - Funny moments log
 * - POST /api/analytics/track/interaction - Track brand interaction
 * - POST /api/analytics/track/bot-message - Track bot message
 * - POST /api/analytics/track/funny-moment - Log funny moment
 */

const express = require('express');

module.exports = function(behaviorTracker, engagementAnalytics) {
  const router = express.Router();

  // ============================================================================
  // BRAND ANALYTICS
  // ============================================================================

  /**
   * GET /api/analytics/brands
   * Get brand engagement summary
   */
  router.get('/brands', async (req, res) => {
    try {
      const result = await engagementAnalytics.getBrandEngagement();

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting brand engagement:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/brands/:brand
   * Get specific brand analytics
   */
  router.get('/brands/:brand', async (req, res) => {
    try {
      const { brand } = req.params;
      const { timeframe = '7 days' } = req.query;

      const [engagement, timeline] = await Promise.all([
        engagementAnalytics.getBrandEngagement(brand),
        engagementAnalytics.getEngagementTimeline(brand, timeframe)
      ]);

      res.json({
        success: true,
        brand,
        engagement: engagement.data,
        timeline: timeline.timeline
      });
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting brand details:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/top-brands
   * Get top performing brands
   */
  router.get('/top-brands', async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      const result = await engagementAnalytics.getTopBrands(parseInt(limit));

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting top brands:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/cross-brand
   * Get cross-brand analytics
   */
  router.get('/cross-brand', async (req, res) => {
    try {
      const result = await engagementAnalytics.getCrossBrandAnalytics();

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting cross-brand analytics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // MODEL ANALYTICS
  // ============================================================================

  /**
   * GET /api/analytics/models
   * Get model preference statistics
   */
  router.get('/models', async (req, res) => {
    try {
      const { brand } = req.query;

      const result = await engagementAnalytics.getModelPreferences(brand);

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting model preferences:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // BOT BEHAVIOR ANALYTICS
  // ============================================================================

  /**
   * GET /api/analytics/bots/behavior
   * Get bot behavior statistics
   */
  router.get('/bots/behavior', async (req, res) => {
    try {
      const { botId } = req.query;

      if (botId) {
        const result = await behaviorTracker.getBotBehaviorStats(botId);
        res.json(result);
      } else {
        // Get all bots behavior summary (would need to query DB)
        res.json({
          success: true,
          message: 'Specify botId parameter to get specific bot stats'
        });
      }
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting bot behavior:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/personality-switches
   * Get personality switch history
   */
  router.get('/personality-switches', async (req, res) => {
    try {
      const { botId, limit = 50 } = req.query;

      const result = await behaviorTracker.getPersonalitySwitches(
        botId,
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting personality switches:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // AWOL EVENTS
  // ============================================================================

  /**
   * GET /api/analytics/awol-events
   * Get AWOL event timeline
   */
  router.get('/awol-events', async (req, res) => {
    try {
      const { botId, limit = 20 } = req.query;

      const result = await behaviorTracker.getAWOLEvents(
        botId,
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting AWOL events:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/roast-effectiveness
   * Get roast effectiveness scores
   */
  router.get('/roast-effectiveness', async (req, res) => {
    try {
      const { botId } = req.query;

      const result = await behaviorTracker.getRoastEffectiveness(botId);

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting roast effectiveness:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // FUNNY MOMENTS
  // ============================================================================

  /**
   * GET /api/analytics/funny-moments
   * Get funny moments log
   */
  router.get('/funny-moments', async (req, res) => {
    try {
      const { brand, limit = 20 } = req.query;

      const result = await engagementAnalytics.getFunnyMoments(
        brand,
        parseInt(limit)
      );

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting funny moments:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // TRACKING ENDPOINTS (POST)
  // ============================================================================

  /**
   * POST /api/analytics/track/interaction
   * Track brand interaction
   */
  router.post('/track/interaction', async (req, res) => {
    try {
      const { brand, userId, model, messageLength, sessionId, metadata } = req.body;

      if (!brand || !userId) {
        return res.status(400).json({
          success: false,
          error: 'brand and userId required'
        });
      }

      const result = await engagementAnalytics.trackInteraction({
        brand,
        userId,
        model,
        messageLength,
        sessionId,
        metadata
      });

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error tracking interaction:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/analytics/track/bot-message
   * Track bot message and detect personality
   */
  router.post('/track/bot-message', async (req, res) => {
    try {
      const { botId, message, context } = req.body;

      if (!botId || !message) {
        return res.status(400).json({
          success: false,
          error: 'botId and message required'
        });
      }

      const result = await behaviorTracker.trackMessage(botId, message, context);

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error tracking bot message:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/analytics/track/funny-moment
   * Log a funny moment
   */
  router.post('/track/funny-moment', async (req, res) => {
    try {
      const { brand, botId, message, context, funniness = 5 } = req.body;

      if (!brand || !message) {
        return res.status(400).json({
          success: false,
          error: 'brand and message required'
        });
      }

      const result = await engagementAnalytics.logFunnyMoment({
        brand,
        botId,
        message,
        context,
        funniness
      });

      res.json({
        success: true,
        moment: result
      });
    } catch (error) {
      console.error('[BrandBotAnalytics] Error logging funny moment:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/analytics/track/model-interaction
   * Track model interaction
   */
  router.post('/track/model-interaction', async (req, res) => {
    try {
      const { model, userId, brand, prompt, response, rating } = req.body;

      if (!model || !userId || !prompt || !response) {
        return res.status(400).json({
          success: false,
          error: 'model, userId, prompt, and response required'
        });
      }

      const interactionId = await engagementAnalytics.trackModelInteraction({
        model,
        userId,
        brand,
        prompt,
        response,
        rating
      });

      res.json({
        success: true,
        interactionId
      });
    } catch (error) {
      console.error('[BrandBotAnalytics] Error tracking model interaction:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/analytics/track/user-reaction
   * Track user reaction to bot message
   */
  router.post('/track/user-reaction', async (req, res) => {
    try {
      const { botId, messageId, reaction } = req.body;

      if (!botId || !messageId || !reaction) {
        return res.status(400).json({
          success: false,
          error: 'botId, messageId, and reaction required'
        });
      }

      const result = await behaviorTracker.trackUserReaction(
        botId,
        messageId,
        reaction
      );

      res.json(result);
    } catch (error) {
      console.error('[BrandBotAnalytics] Error tracking user reaction:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * GET /api/analytics/dashboard/summary
   * Get complete dashboard summary
   */
  router.get('/dashboard/summary', async (req, res) => {
    try {
      const [brands, models, awol, funny] = await Promise.all([
        engagementAnalytics.getBrandEngagement(),
        engagementAnalytics.getModelPreferences(),
        behaviorTracker.getAWOLEvents(null, 10),
        engagementAnalytics.getFunnyMoments(null, 10)
      ]);

      res.json({
        success: true,
        summary: {
          brands: brands.brands || {},
          models: models.models || {},
          recentAWOL: awol.events || [],
          recentFunny: funny.moments || []
        }
      });
    } catch (error) {
      console.error('[BrandBotAnalytics] Error getting dashboard summary:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};
