/**
 * Alpha Discovery API Routes
 *
 * Endpoints for tracking financial document views and discovering alpha signals.
 */

const express = require('express');
const router = express.Router();
const AlphaDiscoveryEngine = require('../lib/alpha-discovery-engine');

// Initialize alpha engine (singleton)
const alphaEngine = new AlphaDiscoveryEngine({
  trendingThreshold: 10,
  trendingWindow: 3600000, // 1 hour
  signalStrength: 0.5
});

/**
 * POST /api/alpha/track-view
 * Track a document view
 *
 * Body:
 * {
 *   userId: "user-123",
 *   document: {
 *     type: "earnings",
 *     ticker: "AAPL",
 *     title: "Apple Q4 2024 Earnings",
 *     url: "https://example.com/AAPL-Q4-2024.pdf",
 *     category: "stocks"
 *   },
 *   context: {
 *     source: "github",
 *     referer: "/repos/financial-docs"
 *   }
 * }
 */
router.post('/track-view', async (req, res) => {
  try {
    const { userId, document, context } = req.body;

    if (!userId || !document) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, document'
      });
    }

    const result = await alphaEngine.trackView(userId, document, context);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[AlphaRoutes] Track view error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track view',
      message: error.message
    });
  }
});

/**
 * GET /api/alpha/trending
 * Get trending documents and tickers
 *
 * Query params:
 * - window: Time window in seconds (default: 3600 = 1 hour)
 */
router.get('/trending', async (req, res) => {
  try {
    const windowMs = parseInt(req.query.window) * 1000 || 3600000;

    const trending = await alphaEngine.getTrending(windowMs);

    res.json({
      success: true,
      ...trending
    });
  } catch (error) {
    console.error('[AlphaRoutes] Trending error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trending',
      message: error.message
    });
  }
});

/**
 * GET /api/alpha/signals
 * Get alpha signals (investment opportunities)
 *
 * Query params:
 * - minStrength: Minimum signal strength 0-1 (default: 0.5)
 */
router.get('/signals', async (req, res) => {
  try {
    const minStrength = parseFloat(req.query.minStrength) || 0.5;

    const signals = await alphaEngine.getAlphaSignals(minStrength);

    res.json({
      success: true,
      signals,
      total: signals.length
    });
  } catch (error) {
    console.error('[AlphaRoutes] Signals error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get signals',
      message: error.message
    });
  }
});

/**
 * GET /api/alpha/connections/:userId
 * Find users with similar viewing patterns for side hustle collaboration
 */
router.get('/connections/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await alphaEngine.findConnections(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[AlphaRoutes] Connections error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find connections',
      message: error.message
    });
  }
});

/**
 * GET /api/alpha/analytics
 * Get analytics summary
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await alphaEngine.getAnalytics();

    res.json({
      success: true,
      ...analytics
    });
  } catch (error) {
    console.error('[AlphaRoutes] Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

/**
 * POST /api/alpha/simulate
 * Simulate views for testing (development only)
 */
router.post('/simulate', async (req, res) => {
  try {
    const { count = 100 } = req.body;

    const tickers = ['AAPL', 'TSLA', 'NVDA', 'GOOGL', 'MSFT', 'AMZN'];
    const categories = ['stocks', 'options', 'crypto', 'side-hustle'];
    const types = ['earnings', 'filing', 'strategy', 'repo'];

    const views = [];

    for (let i = 0; i < count; i++) {
      const ticker = tickers[Math.floor(Math.random() * tickers.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const type = types[Math.floor(Math.random() * types.length)];

      const result = await alphaEngine.trackView(
        `user-${Math.floor(Math.random() * 50)}`,
        {
          type,
          ticker,
          title: `${ticker} ${type}`,
          category
        },
        {
          source: 'simulation',
          referer: '/test'
        }
      );

      views.push(result);
    }

    const trending = await alphaEngine.getTrending();
    const signals = await alphaEngine.getAlphaSignals(0.3);

    res.json({
      success: true,
      simulatedViews: views.length,
      trending,
      signals
    });
  } catch (error) {
    console.error('[AlphaRoutes] Simulate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to simulate views',
      message: error.message
    });
  }
});

module.exports = router;
