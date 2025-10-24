/**
 * Session Block API Routes
 *
 * REST API for the blockchain-inspired session block system:
 * - Submit requests (create blocks)
 * - Check status
 * - Boost priority (increase gas)
 * - Cancel blocks
 * - Monitor queues
 * - Get dashboard data
 */

const express = require('express');
const router = express.Router();

let orchestrator = null;

/**
 * Initialize routes with orchestrator
 */
function initRoutes(sessionOrchestrator) {
  orchestrator = sessionOrchestrator;
  console.log('✓ Session Block routes initialized');
  return router;
}

/**
 * POST /api/blocks/submit
 * Submit a new request (create session block)
 *
 * Body:
 * - model: Model to use
 * - prompt: User prompt
 * - context: Additional context (optional)
 * - roomId: Room ID (optional)
 * - roomSlug: Room slug (optional)
 * - priority: Initial priority 0-100 (optional)
 * - urgent: Mark as urgent (optional)
 * - deadlineMs: Deadline in milliseconds (optional)
 * - userId: User ID (optional)
 * - sessionId: Session ID (optional)
 */
router.post('/submit', async (req, res) => {
  try {
    const {
      model,
      prompt,
      context = {},
      roomId = null,
      roomSlug = null,
      priority = null,
      urgent = false,
      deadlineMs = null,
      userId = null,
      sessionId = null,
      deviceId = null
    } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'Model and prompt are required'
      });
    }

    const result = await orchestrator.submitRequest({
      model,
      prompt,
      context,
      roomId,
      roomSlug,
      priority,
      urgent,
      deadlineMs,
      userId,
      sessionId,
      deviceId
    });

    res.json({
      status: 'success',
      ...result
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Submit error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/blocks/:blockId
 * Get block status
 */
router.get('/:blockId', (req, res) => {
  try {
    const { blockId } = req.params;

    const status = orchestrator.getBlockStatus(blockId);

    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Block not found'
      });
    }

    res.json({
      status: 'success',
      block: status
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Status error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/blocks/:blockId/boost
 * Boost block priority (increase gas)
 *
 * Body:
 * - boostAmount: Amount to boost (default: 10)
 */
router.post('/:blockId/boost', async (req, res) => {
  try {
    const { blockId } = req.params;
    const { boostAmount = 10 } = req.body;

    const success = await orchestrator.boostBlockPriority(blockId, boostAmount);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: 'Block not found or already processed'
      });
    }

    res.json({
      status: 'success',
      blockId,
      boostAmount
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Boost error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/blocks/:blockId
 * Cancel block
 */
router.delete('/:blockId', async (req, res) => {
  try {
    const { blockId } = req.params;

    const success = await orchestrator.cancelBlock(blockId);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: 'Block not found or already processed'
      });
    }

    res.json({
      status: 'success',
      blockId,
      message: 'Block cancelled'
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Cancel error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/blocks/stats
 * Get system statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = orchestrator.getStats();

    res.json({
      status: 'success',
      stats
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Stats error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/blocks/dashboard
 * Get dashboard data (Blocknative-style monitoring)
 */
router.get('/dashboard', async (req, res) => {
  try {
    const data = await orchestrator.getDashboardData();

    res.json({
      status: 'success',
      ...data
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Dashboard error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/blocks/monitor/subscribe
 * Subscribe to real-time updates
 *
 * Body:
 * - subscriberId: Unique subscriber ID
 */
router.post('/monitor/subscribe', (req, res) => {
  try {
    const { subscriberId } = req.body;

    if (!subscriberId) {
      return res.status(400).json({
        status: 'error',
        message: 'Subscriber ID required'
      });
    }

    orchestrator.addMonitorSubscriber(subscriberId);

    res.json({
      status: 'success',
      subscriberId,
      message: 'Subscribed to block monitor'
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Subscribe error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/blocks/monitor/unsubscribe
 * Unsubscribe from real-time updates
 *
 * Body:
 * - subscriberId: Unique subscriber ID
 */
router.post('/monitor/unsubscribe', (req, res) => {
  try {
    const { subscriberId } = req.body;

    if (!subscriberId) {
      return res.status(400).json({
        status: 'error',
        message: 'Subscriber ID required'
      });
    }

    orchestrator.removeMonitorSubscriber(subscriberId);

    res.json({
      status: 'success',
      subscriberId,
      message: 'Unsubscribed from block monitor'
    });

  } catch (error) {
    console.error('[SessionBlockAPI] Unsubscribe error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = { router, initRoutes };
