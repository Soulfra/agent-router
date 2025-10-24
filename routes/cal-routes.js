/**
 * Cal Agent API Routes
 *
 * API endpoints for Cal's learning system loop
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createCalRoutes({ db, calLoop }) {
  /**
   * GET /api/cal/status
   * Get Cal's current status, tier, and progress
   */
  router.get('/status', async (req, res) => {
    try {
      const status = await calLoop.getStatus();
      res.json({ success: true, ...status });
    } catch (error) {
      console.error('[CalRoutes] Get status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/cal/start
   * Start the learning loop
   */
  router.post('/start', async (req, res) => {
    try {
      const result = await calLoop.start();
      res.json(result);
    } catch (error) {
      console.error('[CalRoutes] Start loop error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/cal/stop
   * Stop the learning loop
   */
  router.post('/stop', async (req, res) => {
    try {
      const result = calLoop.stop();
      res.json(result);
    } catch (error) {
      console.error('[CalRoutes] Stop loop error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/cal/run-lesson
   * Manually run a lesson
   */
  router.post('/run-lesson', async (req, res) => {
    try {
      await calLoop.runIteration();
      res.json({
        success: true,
        message: 'Lesson iteration completed'
      });
    } catch (error) {
      console.error('[CalRoutes] Run lesson error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/cal/logs
   * Get Cal's learning logs with tier tracking
   *
   * Query params:
   * - limit: Number of logs to return (default: 20)
   */
  router.get('/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const result = await calLoop.getLogs(limit);
      res.json(result);
    } catch (error) {
      console.error('[CalRoutes] Get logs error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/cal/stats
   * Get loop statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      res.json({
        success: true,
        stats: calLoop.stats,
        isRunning: calLoop.isRunning,
        currentIteration: calLoop.currentIteration
      });
    } catch (error) {
      console.error('[CalRoutes] Get stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createCalRoutes };
