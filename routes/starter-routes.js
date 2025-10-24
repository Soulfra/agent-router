/**
 * Starter Selection Routes
 *
 * Pokémon-style "Choose Your Starter" API
 * Handles starter browsing, selection, tracking, and comparison
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createStarterRoutes({ db, starterSelector, bucketPortfolioBridge }) {
  if (!starterSelector) {
    throw new Error('StarterSelector required for starter routes');
  }

  // ============================================================================
  // STARTER BROWSING
  // ============================================================================

  /**
   * GET /api/starters
   * Get all available starters (12 buckets)
   */
  router.get('/', async (req, res) => {
    try {
      const { category } = req.query;

      const starters = await starterSelector.getAvailableStarters({ category });

      res.json({
        success: true,
        count: starters.length,
        starters
      });
    } catch (error) {
      console.error('[StarterRoutes] Get starters error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/starters/:bucketId
   * Get detailed info for a specific starter
   */
  router.get('/:bucketId', async (req, res) => {
    try {
      const { bucketId } = req.params;

      const starter = await starterSelector.getStarterInfo(bucketId);

      res.json({
        success: true,
        starter
      });
    } catch (error) {
      console.error('[StarterRoutes] Get starter info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/starters/recommended/:userId
   * Get personalized starter recommendations
   */
  router.get('/recommended/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { category, modelFamily } = req.query;

      const recommendations = await starterSelector.getRecommendedStarters(
        parseInt(userId),
        { category, modelFamily }
      );

      res.json({
        success: true,
        count: recommendations.length,
        recommendations
      });
    } catch (error) {
      console.error('[StarterRoutes] Get recommendations error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/starters/compare
   * Compare two starters side-by-side
   */
  router.post('/compare', async (req, res) => {
    try {
      const { bucket1Id, bucket2Id } = req.body;

      if (!bucket1Id || !bucket2Id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: bucket1Id, bucket2Id'
        });
      }

      const comparison = await starterSelector.compareStarters(bucket1Id, bucket2Id);

      res.json({
        success: true,
        comparison
      });
    } catch (error) {
      console.error('[StarterRoutes] Compare starters error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // STARTER SELECTION
  // ============================================================================

  /**
   * POST /api/starters/choose
   * Choose starter (assign bucket to user)
   */
  router.post('/choose', async (req, res) => {
    try {
      const { userId, bucketId, selectionReason } = req.body;

      if (!userId || !bucketId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, bucketId'
        });
      }

      // Assign bucket
      const assignment = await bucketPortfolioBridge.assignBucket(
        userId,
        bucketId,
        true // isPrimary
      );

      // Initialize portfolio with bucket branding
      const portfolio = await bucketPortfolioBridge.initBucketPortfolio(userId, bucketId);

      // Log selection
      await starterSelector.logStarterInteraction(
        userId,
        null,
        'chosen',
        bucketId,
        { selectionReason }
      );

      res.json({
        success: true,
        message: 'Starter chosen successfully!',
        assignment,
        portfolio
      });
    } catch (error) {
      console.error('[StarterRoutes] Choose starter error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/starters/my-starter/:userId
   * Get user's chosen starter
   */
  router.get('/my-starter/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const bucket = await bucketPortfolioBridge.getUserBucket(parseInt(userId));

      if (!bucket) {
        return res.json({
          success: true,
          hasStarter: false,
          message: 'No starter selected yet'
        });
      }

      const starter = await starterSelector.getStarterInfo(bucket.bucket_id);

      res.json({
        success: true,
        hasStarter: true,
        starter,
        chosenAt: bucket.starter_chosen_at
      });
    } catch (error) {
      console.error('[StarterRoutes] Get my starter error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // STARTER INTERACTION TRACKING
  // ============================================================================

  /**
   * POST /api/starters/track
   * Track user interaction with starter (viewed, hovered, clicked)
   */
  router.post('/track', async (req, res) => {
    try {
      const { userId, sessionId, eventType, bucketId, timeSpentMs } = req.body;

      if (!eventType || !bucketId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: eventType, bucketId'
        });
      }

      const log = await starterSelector.logStarterInteraction(
        userId || null,
        sessionId || null,
        eventType,
        bucketId,
        { timeSpentMs }
      );

      res.json({
        success: true,
        log
      });
    } catch (error) {
      console.error('[StarterRoutes] Track interaction error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/starters/analytics
   * Get starter selection analytics
   */
  router.get('/analytics', async (req, res) => {
    try {
      const { bucketId } = req.query;

      const analytics = await starterSelector.getSelectionAnalytics(bucketId || null);

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error('[StarterRoutes] Get analytics error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PORTFOLIO BRANDING
  // ============================================================================

  /**
   * GET /api/starters/portfolio/:userId
   * Get complete portfolio with bucket branding
   */
  router.get('/portfolio/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const portfolio = await bucketPortfolioBridge.getPortfolioWithBranding(parseInt(userId));

      res.json({
        success: true,
        portfolio
      });
    } catch (error) {
      console.error('[StarterRoutes] Get portfolio error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/starters/bucket-personality/:bucketId
   * Get bucket's personality and branding
   */
  router.get('/bucket-personality/:bucketId', async (req, res) => {
    try {
      const { bucketId } = req.params;

      const personality = await bucketPortfolioBridge.getBucketPersonality(bucketId);

      res.json({
        success: true,
        personality
      });
    } catch (error) {
      console.error('[StarterRoutes] Get bucket personality error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  router.get('/health', async (req, res) => {
    res.json({
      success: true,
      service: 'starters',
      features: [
        'browse-starters',
        'choose-starter',
        'recommendations',
        'comparison',
        'tracking',
        'analytics',
        'portfolio-branding'
      ]
    });
  });

  return router;
}

module.exports = createStarterRoutes;
