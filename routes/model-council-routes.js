/**
 * Model Council REST API Routes
 *
 * Endpoints for starting, monitoring, and managing AI Model Council sessions
 * where multiple models collaborate (and argue) to build things.
 *
 * Endpoints:
 * - POST /api/council/build - Start a new council session
 * - GET /api/council/:sessionId - Get session details
 * - GET /api/council/:sessionId/debate - Watch live debate (SSE)
 * - GET /api/council/:sessionId/workflow - Get workflow breakdown
 * - GET /api/council/sessions - List all sessions
 * - GET /api/council/models - List model personalities
 * - GET /api/council/stats - Get council statistics
 */

const express = require('express');
const router = express.Router();
const ModelCouncil = require('../lib/model-council');
const WorkflowBuilder = require('../lib/workflow-builder');
const ModelPersonalities = require('../lib/model-personalities');

let council = null;
let workflowBuilder = null;
let personalities = null;
let db = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, agentRegistry, options = {}) {
  db = database;
  council = new ModelCouncil(agentRegistry, options);
  workflowBuilder = new WorkflowBuilder(database, agentRegistry);
  personalities = new ModelPersonalities();

  console.log('✓ Model Council routes initialized');
  return router;
}

/**
 * POST /api/council/build
 * Start a new council session to build something
 *
 * Body:
 * - task: What to build (required)
 * - metadata: Additional context (optional)
 *
 * Example:
 * {
 *   "task": "Build a developer portal with API key management",
 *   "metadata": { "requestedBy": "user123" }
 * }
 */
router.post('/build', async (req, res) => {
  try {
    const { task, metadata = {} } = req.body;

    if (!task || typeof task !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Task description is required'
      });
    }

    console.log(`[CouncilAPI] Starting council session for: "${task}"`);

    // Start council session
    const sessionId = await council.startSession(task, { metadata });

    res.json({
      status: 'success',
      sessionId,
      message: 'Council session started',
      pollUrl: `/api/council/${sessionId}`,
      debateUrl: `/api/council/${sessionId}/debate`
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to start session:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/:sessionId
 * Get full session details
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session from memory
    const session = council.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Format response
    const response = {
      status: 'success',
      session: {
        sessionId: session.sessionId,
        task: session.task,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        modelCount: session.models.length,
        models: session.models,
        proposals: session.proposals.map(p => ({
          model: p.modelDisplay,
          character: p.character,
          emoji: p.emoji,
          proposal: p.proposal,
          duration: p.duration,
          timedOut: p.timedOut,
          error: p.error
        })),
        debates: session.debates,
        consensus: session.consensus,
        votes: session.votes,
        metadata: session.metadata
      }
    };

    res.json(response);

  } catch (error) {
    console.error('[CouncilAPI] Failed to get session:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/:sessionId/status
 * Get quick session status (lighter than full details)
 */
router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const status = council.getSessionStatus(sessionId);

    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    res.json({
      status: 'success',
      ...status
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to get status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/:sessionId/debate
 * Watch live debate as Server-Sent Events (SSE)
 */
router.get('/:sessionId/debate', (req, res) => {
  const { sessionId } = req.params;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Listen for council events
  const handleProposal = (data) => {
    if (data.sessionId === sessionId) {
      res.write(`data: ${JSON.stringify({ type: 'proposal', data })}\n\n`);
    }
  };

  const handleDebate = (data) => {
    if (data.sessionId === sessionId) {
      res.write(`data: ${JSON.stringify({ type: 'debate', data })}\n\n`);
    }
  };

  const handleConsensus = (data) => {
    if (data.sessionId === sessionId) {
      res.write(`data: ${JSON.stringify({ type: 'consensus', data })}\n\n`);
    }
  };

  const handleComplete = (data) => {
    if (data.sessionId === sessionId) {
      res.write(`data: ${JSON.stringify({ type: 'completed', data })}\n\n`);
      res.end();
    }
  };

  // Attach listeners
  council.on('session:proposal', handleProposal);
  council.on('session:debate', handleDebate);
  council.on('session:consensus_reached', handleConsensus);
  council.on('session:completed', handleComplete);

  // Clean up on client disconnect
  req.on('close', () => {
    council.removeListener('session:proposal', handleProposal);
    council.removeListener('session:debate', handleDebate);
    council.removeListener('session:consensus_reached', handleConsensus);
    council.removeListener('session:completed', handleComplete);
  });
});

/**
 * GET /api/council/:sessionId/workflow
 * Get workflow breakdown for a completed session
 */
router.get('/:sessionId/workflow', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Check if session exists and is completed
    const session = council.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Session not yet completed',
        currentStatus: session.status
      });
    }

    // Get workflow from database (or build if not exists)
    let workflow = await workflowBuilder.getWorkflow(sessionId);

    if (workflow.length === 0) {
      // Build workflow from consensus
      workflow = await workflowBuilder.buildWorkflow(
        sessionId,
        session.consensus,
        session.proposals
      );
    }

    res.json({
      status: 'success',
      sessionId,
      taskCount: workflow.length,
      workflow: workflow.map(task => ({
        workflowId: task.workflow_id,
        title: task.task_title,
        description: task.task_description,
        type: task.task_type,
        assignedModel: task.assigned_model,
        priority: task.priority,
        estimatedDuration: task.estimated_duration_minutes,
        status: task.status,
        dependsOn: task.depends_on,
        createdAt: task.created_at
      }))
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to get workflow:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/council/:sessionId/workflow/:workflowId/status
 * Update task status
 */
router.post('/:sessionId/workflow/:workflowId/status', async (req, res) => {
  try {
    const { sessionId, workflowId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    await workflowBuilder.updateTaskStatus(workflowId, status);

    res.json({
      status: 'success',
      workflowId,
      newStatus: status
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to update task status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/sessions
 * List all council sessions
 *
 * Query params:
 * - status: Filter by status (running, completed, failed)
 * - limit: Max results (default: 50)
 */
router.get('/sessions', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    let sessions = council.getAllSessions();

    // Filter by status
    if (status) {
      sessions = sessions.filter(s => s.status === status);
    }

    // Sort by start time (newest first)
    sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    // Limit results
    sessions = sessions.slice(0, parseInt(limit));

    // Return summary
    const summary = sessions.map(s => ({
      sessionId: s.sessionId,
      task: s.task,
      status: s.status,
      modelCount: s.models.length,
      proposalCount: s.proposals.length,
      debateCount: s.debates.length,
      hasConsensus: !!s.consensus,
      startedAt: s.startedAt,
      completedAt: s.completedAt
    }));

    res.json({
      status: 'success',
      count: summary.length,
      sessions: summary
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to list sessions:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/models
 * List all model personalities
 */
router.get('/models', (req, res) => {
  try {
    const models = personalities.getAllPersonalities();

    res.json({
      status: 'success',
      count: models.length,
      models
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to list models:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/council/stats
 * Get aggregate statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get stats from database
    const result = await db.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
        COUNT(*) FILTER (WHERE status = 'running') as active_sessions,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_sessions,
        AVG(duration_ms) FILTER (WHERE status = 'completed') as avg_duration_ms
      FROM council_sessions
    `);

    const stats = result.rows[0];

    // Get top models
    const topModelsResult = await db.query(`
      SELECT * FROM get_top_council_models(5)
    `);

    res.json({
      status: 'success',
      stats: {
        totalSessions: parseInt(stats.total_sessions),
        completedSessions: parseInt(stats.completed_sessions),
        activeSessions: parseInt(stats.active_sessions),
        failedSessions: parseInt(stats.failed_sessions),
        averageDuration: stats.avg_duration_ms ? Math.round(stats.avg_duration_ms) : null,
        topModels: topModelsResult.rows
      }
    });

  } catch (error) {
    console.error('[CouncilAPI] Failed to get stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = { router, initRoutes };
