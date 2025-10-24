/**
 * Flow Routes
 *
 * API endpoints for automated flows (DocuSign-style)
 * Search by emoji, status, category
 * Execute multi-step flows with retry/badge/email
 */

const express = require('express');
const router = express.Router();
const AutomatedFlowBuilder = require('../lib/automated-flow-builder');
const FlowTemplates = require('../lib/flow-templates');

// Database connection (injected via initRoutes)
let db = null;
let flowBuilder = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  flowBuilder = new AutomatedFlowBuilder({ db });
  return router;
}

// ============================================================================
// LIST TEMPLATES
// ============================================================================

/**
 * GET /api/flows/templates
 * List all flow templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = FlowTemplates.getAllTemplates();

    res.json({
      success: true,
      templates: templates.map(t => ({
        name: t.name,
        description: t.description,
        category: t.metadata.category,
        emoji: t.metadata.emoji,
        steps: t.steps.length,
        trigger: t.trigger
      }))
    });

  } catch (error) {
    console.error('[FlowRoutes] List templates error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/flows/templates/emoji/:emoji
 * Search templates by emoji
 *
 * Example: /api/flows/templates/emoji/💰
 */
router.get('/templates/emoji/:emoji', async (req, res) => {
  try {
    const emoji = decodeURIComponent(req.params.emoji);
    const templates = FlowTemplates.getTemplatesByEmoji(emoji);

    res.json({
      success: true,
      emoji,
      templates: templates.map(t => ({
        name: t.name,
        description: t.description,
        category: t.metadata.category,
        steps: t.steps.length
      }))
    });

  } catch (error) {
    console.error('[FlowRoutes] Search by emoji error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/flows/templates/category/:category
 * Search templates by category
 *
 * Example: /api/flows/templates/category/payment
 */
router.get('/templates/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const templates = FlowTemplates.getTemplatesByCategory(category);

    res.json({
      success: true,
      category,
      templates: templates.map(t => ({
        name: t.name,
        description: t.description,
        emoji: t.metadata.emoji,
        steps: t.steps.length
      }))
    });

  } catch (error) {
    console.error('[FlowRoutes] Search by category error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/flows/templates/:name
 * Get full template definition
 */
router.get('/templates/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const templates = FlowTemplates.getAllTemplates();
    const template = templates.find(t =>
      t.name.toLowerCase().replace(/\s+/g, '-') === name.toLowerCase()
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('[FlowRoutes] Get template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CREATE FLOW
// ============================================================================

/**
 * POST /api/flows/create
 * Create flow from template or custom definition
 *
 * Body:
 * {
 *   "template": "payment" | "signup" | "subscription" | "affiliate",
 *   "name": "Custom Payment Flow" (optional),
 *   "context": { ... } (optional - for execution after creation)
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const { template, name, context } = req.body;

    let flowDefinition;

    if (template) {
      // Use template
      const templates = {
        'payment': FlowTemplates.paymentFlow,
        'signup': FlowTemplates.signupFlow,
        'subscription': FlowTemplates.subscriptionFlow,
        'affiliate': FlowTemplates.affiliateFlow,
        'webhook': FlowTemplates.webhookFlow,
        'scheduled': FlowTemplates.scheduledTaskFlow,
        'recovery': FlowTemplates.errorRecoveryFlow
      };

      const templateFn = templates[template.toLowerCase()];
      if (!templateFn) {
        return res.status(400).json({ error: 'Invalid template name' });
      }

      flowDefinition = templateFn();

      // Override name if provided
      if (name) {
        flowDefinition.name = name;
      }

    } else {
      // Custom flow definition
      flowDefinition = req.body;
    }

    // Create flow
    const flow = await flowBuilder.createFlow(flowDefinition);

    // Optionally execute immediately with context
    let execution = null;
    if (context) {
      execution = await flowBuilder.executeFlow(flow.id, context);
    }

    res.status(201).json({
      success: true,
      flow: {
        id: flow.id,
        name: flow.name,
        steps: flow.steps.length
      },
      execution
    });

  } catch (error) {
    console.error('[FlowRoutes] Create flow error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EXECUTE FLOW
// ============================================================================

/**
 * POST /api/flows/:id/execute
 * Execute flow with context data
 *
 * Body:
 * {
 *   "context": {
 *     "user_id": "...",
 *     "amount": 50,
 *     ... other variables
 *   }
 * }
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { context = {} } = req.body;

    const result = await flowBuilder.executeFlow(id, context);

    res.json({
      success: result.success,
      execution_id: result.execution_id,
      results: result.results,
      error: result.error
    });

  } catch (error) {
    console.error('[FlowRoutes] Execute flow error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET EXECUTION STATUS
// ============================================================================

/**
 * GET /api/flows/executions/:executionId
 * Get execution status and results
 */
router.get('/executions/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;

    const execution = await flowBuilder.getExecutionStatus(executionId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json({
      success: true,
      execution: {
        id: execution.id,
        flow_name: execution.flow_name,
        status: execution.status,
        current_step: execution.current_step,
        total_steps: execution.flow_steps.length,
        step_results: execution.step_results,
        context: execution.context,
        started_at: execution.started_at,
        completed_at: execution.completed_at,
        error_message: execution.error_message
      }
    });

  } catch (error) {
    console.error('[FlowRoutes] Get execution status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// LIST FLOWS
// ============================================================================

/**
 * GET /api/flows
 * List all flows
 */
router.get('/', async (req, res) => {
  try {
    const flows = await flowBuilder.listFlows();

    res.json({
      success: true,
      flows
    });

  } catch (error) {
    console.error('[FlowRoutes] List flows error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SEARCH FLOWS
// ============================================================================

/**
 * GET /api/flows/search
 * Search flows by various criteria
 *
 * Query params:
 * - emoji: 💰, 👤, 🔗
 * - category: payment, authentication, webhook
 * - status: active, paused
 */
router.get('/search', async (req, res) => {
  try {
    const { emoji, category, status } = req.query;

    let query = `SELECT * FROM automated_flows WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (emoji) {
      query += ` AND metadata->>'emoji' = $${paramCount}`;
      params.push(emoji);
      paramCount++;
    }

    if (category) {
      query += ` AND metadata->>'category' = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      flows: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        trigger: row.trigger,
        metadata: row.metadata,
        created_at: row.created_at
      }))
    });

  } catch (error) {
    console.error('[FlowRoutes] Search flows error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// QUICK EXECUTE (Template → Execution in one call)
// ============================================================================

/**
 * POST /api/flows/quick-execute
 * Create flow from template and execute immediately
 *
 * Body:
 * {
 *   "template": "payment",
 *   "context": {
 *     "user_id": "...",
 *     "amount": 50
 *   }
 * }
 */
router.post('/quick-execute', async (req, res) => {
  try {
    const { template, context } = req.body;

    // Get template
    const templates = {
      'payment': FlowTemplates.paymentFlow,
      'signup': FlowTemplates.signupFlow,
      'subscription': FlowTemplates.subscriptionFlow,
      'affiliate': FlowTemplates.affiliateFlow,
      'webhook': FlowTemplates.webhookFlow
    };

    const templateFn = templates[template.toLowerCase()];
    if (!templateFn) {
      return res.status(400).json({ error: 'Invalid template name' });
    }

    const flowDefinition = templateFn();

    // Create and execute
    const flow = await flowBuilder.createFlow(flowDefinition);
    const result = await flowBuilder.executeFlow(flow.id, context);

    res.json({
      success: result.success,
      flow_id: flow.id,
      execution_id: result.execution_id,
      results: result.results,
      error: result.error
    });

  } catch (error) {
    console.error('[FlowRoutes] Quick execute error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WEBHOOK TRIGGER
// ============================================================================

/**
 * POST /api/flows/webhook/:flowId
 * Trigger flow from webhook (GitHub, Stripe, etc.)
 */
router.post('/webhook/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;

    const result = await flowBuilder.executeFlow(flowId, {
      webhook_payload: req.body,
      webhook_headers: req.headers,
      received_at: new Date().toISOString()
    });

    res.json({
      success: result.success,
      execution_id: result.execution_id
    });

  } catch (error) {
    console.error('[FlowRoutes] Webhook trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };
