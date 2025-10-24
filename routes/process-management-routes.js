/**
 * Process Management Routes
 *
 * API endpoints for CalRiven to monitor and manage background processes.
 *
 * Endpoints:
 * - GET  /api/processes             - List all processes
 * - GET  /api/processes/:id         - Get specific process status
 * - GET  /api/processes/:id/output  - Get process output (streaming)
 * - POST /api/processes/:id/kill    - Kill process
 * - POST /api/processes/cleanup     - Cleanup orphans/zombies
 * - GET  /api/processes/analyze     - Analyze (time sinks, bottlenecks)
 * - GET  /api/processes/stats       - Get stats
 * - GET  /api/processes/trends      - Get historical trends
 */

const express = require('express');

function initRoutes(processManager, processAnalyzer) {
  const router = express.Router();

  /**
   * GET /api/processes
   * List all processes
   */
  router.get('/', async (req, res) => {
    try {
      const {
        state = null,
        user = null,
        tags = null
      } = req.query;

      const filter = {};
      if (state) filter.state = state;
      if (user) filter.user = user;
      if (tags) filter.tags = tags.split(',');

      const processes = await processManager.listAll(filter);

      res.json({
        success: true,
        count: processes.length,
        processes: processes
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/processes/stats
   * Get process statistics (must come before /:id)
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = processManager.getStats();

      res.json({
        success: true,
        stats: stats
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/processes/analyze
   * Analyze processes (must come before /:id)
   */
  router.get('/analyze', async (req, res) => {
    try {
      const analysis = await processAnalyzer.analyze();

      res.json({
        success: true,
        analysis: analysis
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Analyze error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/processes/trends
   * Get historical trends (must come before /:id)
   */
  router.get('/trends', async (req, res) => {
    try {
      const {
        timeframe = 3600000  // 1 hour default
      } = req.query;

      const trends = await processAnalyzer.getTrends({
        timeframe: parseInt(timeframe)
      });

      res.json({
        success: true,
        trends: trends
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Trends error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/processes/:id
   * Get specific process status
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const status = await processManager.getStatus(id);

      res.json({
        success: true,
        process: status
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Get status error:', error);
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/processes/:id/output
   * Get process output
   */
  router.get('/:id/output', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        stream = 'both',     // stdout, stderr, or both
        tail = null,         // Last N lines
        since = null         // Since timestamp
      } = req.query;

      const options = { stream };
      if (tail) options.tail = parseInt(tail);
      if (since) options.since = parseInt(since);

      const output = await processManager.getOutput(id, options);

      res.json({
        success: true,
        processId: id,
        stream: stream,
        lineCount: output.length,
        output: output
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Get output error:', error);
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/processes/:id/kill
   * Kill a process
   */
  router.post('/:id/kill', async (req, res) => {
    try {
      const { id } = req.params;
      const { signal = 'SIGTERM' } = req.body;

      const success = await processManager.kill(id, signal);

      res.json({
        success: true,
        processId: id,
        signal: signal,
        killed: success
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Kill error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/processes/cleanup
   * Cleanup orphans, zombies, old completed jobs
   */
  router.post('/cleanup', async (req, res) => {
    try {
      const { maxAge = null } = req.body;

      const options = {};
      if (maxAge) options.maxAge = parseInt(maxAge);

      const cleaned = await processManager.cleanup(options);

      res.json({
        success: true,
        cleaned: cleaned,
        message: `Cleaned up ${cleaned} processes`
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/processes/track
   * Start tracking a new process
   */
  router.post('/track', async (req, res) => {
    try {
      const {
        command,
        description = null,
        timeout = null,
        expectedDuration = null,
        tags = [],
        user = 'api'
      } = req.body;

      if (!command) {
        return res.status(400).json({
          success: false,
          error: 'Command is required'
        });
      }

      const options = {
        description,
        timeout,
        expectedDuration,
        tags,
        user
      };

      const jobId = await processManager.track(command, options);

      res.json({
        success: true,
        jobId: jobId,
        message: `Started tracking job ${jobId}`
      });

    } catch (error) {
      console.error('[ProcessManagementAPI] Track error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = { initRoutes };
