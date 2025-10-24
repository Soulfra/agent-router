/**
 * Workflow Routes
 *
 * API endpoints for workflow management
 * Connects workflow-builder.html to WorkflowExecutor
 *
 * Uses EXISTING WorkflowExecutor - doesn't rebuild it
 */

const express = require('express');
const router = express.Router();
const WorkflowExecutor = require('../lib/workflow-executor');

// Database connection (injected via initRoutes)
let db = null;
let workflowExecutor = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database, options = {}) {
  db = database;

  // Initialize EXISTING WorkflowExecutor
  workflowExecutor = new WorkflowExecutor({
    db,
    scheduler: options.scheduler,
    broadcast: options.broadcast
  });

  // Load existing workflows on startup
  workflowExecutor.loadAndScheduleWorkflows().catch(err => {
    console.error('[WorkflowRoutes] Error loading workflows:', err);
  });

  return router;
}

/**
 * GET /api/workflows
 * List all workflows
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        description,
        trigger_type,
        trigger_config,
        enabled,
        created_at,
        updated_at,
        created_by
      FROM workflows
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      workflows: result.rows
    });

  } catch (error) {
    console.error('[WorkflowRoutes] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/workflows/:id
 * Get single workflow with full details
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM workflows
      WHERE id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = result.rows[0];

    // Parse JSON fields
    workflow.nodes = typeof workflow.nodes === 'string'
      ? JSON.parse(workflow.nodes)
      : workflow.nodes;

    workflow.connections = typeof workflow.connections === 'string'
      ? JSON.parse(workflow.connections)
      : workflow.connections;

    workflow.trigger_config = typeof workflow.trigger_config === 'string'
      ? JSON.parse(workflow.trigger_config)
      : workflow.trigger_config;

    res.json({
      success: true,
      workflow
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/workflows
 * Create new workflow
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description = '',
      trigger_type = 'manual',
      trigger_config = {},
      nodes = [],
      connections = [],
      enabled = true
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Workflow name is required' });
    }

    // Insert into database
    const result = await db.query(`
      INSERT INTO workflows (
        name,
        description,
        trigger_type,
        trigger_config,
        nodes,
        connections,
        enabled,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, created_at
    `, [
      name,
      description,
      trigger_type,
      JSON.stringify(trigger_config),
      JSON.stringify(nodes),
      JSON.stringify(connections),
      enabled,
      req.user?.userId || null
    ]);

    const workflow = result.rows[0];

    // If enabled and has schedule trigger, schedule it
    if (enabled && trigger_type === 'schedule') {
      await workflowExecutor.loadAndScheduleWorkflows();
    }

    res.status(201).json({
      success: true,
      workflow
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/workflows/:id
 * Update existing workflow
 */
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      trigger_type,
      trigger_config,
      nodes,
      connections,
      enabled
    } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (trigger_type !== undefined) {
      updates.push(`trigger_type = $${paramCount++}`);
      values.push(trigger_type);
    }

    if (trigger_config !== undefined) {
      updates.push(`trigger_config = $${paramCount++}`);
      values.push(JSON.stringify(trigger_config));
    }

    if (nodes !== undefined) {
      updates.push(`nodes = $${paramCount++}`);
      values.push(JSON.stringify(nodes));
    }

    if (connections !== undefined) {
      updates.push(`connections = $${paramCount++}`);
      values.push(JSON.stringify(connections));
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await db.query(`
      UPDATE workflows
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, updated_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Reload workflows if schedule changed
    if (trigger_type === 'schedule' || enabled !== undefined) {
      await workflowExecutor.loadAndScheduleWorkflows();
    }

    res.json({
      success: true,
      workflow: result.rows[0]
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/workflows/:id
 * Delete workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      DELETE FROM workflows
      WHERE id = $1
      RETURNING id, name
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({
      success: true,
      message: 'Workflow deleted',
      workflow: result.rows[0]
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/workflows/:id/execute
 * Manually trigger workflow execution
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM workflows
      WHERE id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = result.rows[0];
    const triggerData = req.body || {};

    // Execute using EXISTING WorkflowExecutor
    const execution = await workflowExecutor.executeWorkflow(workflow, triggerData);

    res.json({
      success: true,
      execution
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Execute error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/workflows/:id/executions
 * Get execution history for workflow
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(`
      SELECT
        execution_id,
        status,
        duration_ms,
        error_message,
        executed_at
      FROM workflow_executions
      WHERE workflow_id = $1
      ORDER BY executed_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    res.json({
      success: true,
      executions: result.rows,
      limit,
      offset
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Executions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/workflows/stats
 * Get workflow statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await workflowExecutor.getStatistics();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[WorkflowRoutes] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/workflows/webhook/:workflowId
 * Trigger workflow from webhook
 * This is how EXISTING webhooks can trigger workflows
 */
router.post('/webhook/:workflowId', async (req, res) => {
  try {
    const result = await workflowExecutor.triggerFromWebhook(
      req.params.workflowId,
      req.body
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('[WorkflowRoutes] Webhook trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };
