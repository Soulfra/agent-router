/**
 * Workflow Executor
 *
 * INTEGRATION LAYER - Connects existing systems:
 * - Uses existing Scheduler (lib/scheduler.js)
 * - Uses existing Actions Engine (lib/actions-engine.js)
 * - Uses existing Pattern Learner (lib/pattern-learner.js)
 * - Triggered by existing Webhooks (routes/webhook-routes.js)
 *
 * This doesn't rebuild anything - it WIRES EXISTING SHIT TOGETHER.
 */

const Scheduler = require('./scheduler');
const ActionsEngine = require('./actions-engine');

class WorkflowExecutor {
  constructor(options = {}) {
    this.db = options.db;
    this.scheduler = options.scheduler || new Scheduler();
    this.broadcast = options.broadcast || (() => {});

    // Don't initialize ActionsEngine here - it's initialized elsewhere
    // We'll just call its functions directly
    ActionsEngine.initEngine(this.db);

    // Workflow execution state
    this.activeExecutions = new Map();
    this.executionHistory = [];

    console.log('[WorkflowExecutor] Initialized - integrating with existing systems');
  }

  /**
   * Load workflows from database and schedule them
   * Uses EXISTING Scheduler - doesn't rebuild it
   */
  async loadAndScheduleWorkflows() {
    if (!this.db) {
      console.warn('[WorkflowExecutor] No database - skipping workflow loading');
      return;
    }

    try {
      // Get all active workflows
      const result = await this.db.query(`
        SELECT id, name, trigger_type, trigger_config, nodes, connections, enabled
        FROM workflows
        WHERE enabled = TRUE
        ORDER BY created_at
      `);

      console.log(`[WorkflowExecutor] Found ${result.rows.length} active workflows`);

      for (const workflow of result.rows) {
        if (workflow.trigger_type === 'schedule') {
          // Use EXISTING Scheduler
          const config = workflow.trigger_config || {};
          const interval = config.interval || 60000; // Default 1 minute

          this.scheduler.schedule(
            `workflow-${workflow.id}`,
            async () => await this.executeWorkflow(workflow),
            {
              interval,
              runImmediately: config.runImmediately || false
            }
          );

          console.log(`[WorkflowExecutor] Scheduled workflow "${workflow.name}" (every ${interval}ms)`);
        }
      }

      // Start the scheduler
      if (result.rows.length > 0) {
        this.scheduler.start();
      }

    } catch (error) {
      console.error('[WorkflowExecutor] Error loading workflows:', error);
    }
  }

  /**
   * Execute a workflow
   * Orchestrates existing systems - doesn't reimplement logic
   */
  async executeWorkflow(workflow, triggerData = {}) {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`[WorkflowExecutor] Starting execution ${executionId} for workflow "${workflow.name}"`);

    this.broadcast({
      type: 'workflow_start',
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      timestamp: new Date().toISOString()
    });

    try {
      // Parse workflow structure
      const nodes = typeof workflow.nodes === 'string'
        ? JSON.parse(workflow.nodes)
        : workflow.nodes;

      const connections = typeof workflow.connections === 'string'
        ? JSON.parse(workflow.connections)
        : workflow.connections;

      // Track execution state
      const execution = {
        id: executionId,
        workflowId: workflow.id,
        startTime,
        nodes: new Map(),
        context: { ...triggerData }
      };

      this.activeExecutions.set(executionId, execution);

      // Find trigger node
      const triggerNode = nodes.find(n => n.type === 'trigger' || n.category === 'trigger');
      if (!triggerNode) {
        throw new Error('No trigger node found in workflow');
      }

      // Execute nodes in order (following connections)
      await this.executeNodeChain(triggerNode, nodes, connections, execution);

      // Execution complete
      const duration = Date.now() - startTime;
      console.log(`[WorkflowExecutor] Completed ${executionId} in ${duration}ms`);

      // Log to database
      if (this.db) {
        await this.db.query(`
          INSERT INTO workflow_executions (
            execution_id, workflow_id, status, duration_ms, context, executed_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [executionId, workflow.id, 'success', duration, JSON.stringify(execution.context)]);
      }

      this.broadcast({
        type: 'workflow_complete',
        executionId,
        workflowId: workflow.id,
        duration,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        executionId,
        duration,
        context: execution.context
      };

    } catch (error) {
      console.error(`[WorkflowExecutor] Execution ${executionId} failed:`, error);

      // Log failure to database
      if (this.db) {
        await this.db.query(`
          INSERT INTO workflow_executions (
            execution_id, workflow_id, status, error_message, executed_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [executionId, workflow.id, 'failed', error.message]);
      }

      this.broadcast({
        type: 'workflow_error',
        executionId,
        workflowId: workflow.id,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute chain of nodes following connections
   */
  async executeNodeChain(startNode, allNodes, connections, execution) {
    const visited = new Set();
    const queue = [startNode];

    while (queue.length > 0) {
      const node = queue.shift();

      if (visited.has(node.id)) {
        continue;
      }

      visited.add(node.id);

      console.log(`[WorkflowExecutor] Executing node: ${node.name} (${node.type})`);

      // Execute node using EXISTING systems
      const result = await this.executeNode(node, execution);

      // Store node result in execution context
      execution.nodes.set(node.id, {
        status: result.success ? 'success' : 'failed',
        result: result.data,
        error: result.error
      });

      // Update execution context with node output
      if (result.success && result.data) {
        execution.context[node.id] = result.data;
      }

      // Find next nodes
      const nextConnections = connections.filter(c => c.from === node.id);
      for (const conn of nextConnections) {
        const nextNode = allNodes.find(n => n.id === conn.to);
        if (nextNode) {
          queue.push(nextNode);
        }
      }
    }
  }

  /**
   * Execute individual node
   * Routes to EXISTING systems based on node type
   */
  async executeNode(node, execution) {
    try {
      const config = node.config || {};

      switch (node.type) {
        case 'trigger':
          // Trigger nodes don't execute anything
          return { success: true, data: execution.context };

        case 'delay':
          // Simple delay
          const delayMs = config.delay || 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return { success: true, data: { delayed: delayMs } };

        case 'http':
          // HTTP request using existing fetch
          return await this.executeHttpNode(config, execution.context);

        case 'condition':
          // Conditional logic
          return await this.executeConditionNode(config, execution.context);

        case 'action':
          // Use EXISTING Actions Engine
          return await this.executeActionNode(config, execution.context);

        // Agent nodes - delegate to existing agent system
        default:
          if (node.category === 'agent') {
            return await this.executeAgentNode(node, execution.context);
          }

          console.warn(`[WorkflowExecutor] Unknown node type: ${node.type}`);
          return { success: false, error: `Unknown node type: ${node.type}` };
      }
    } catch (error) {
      console.error(`[WorkflowExecutor] Node execution failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute HTTP request node
   */
  async executeHttpNode(config, context) {
    const url = this.interpolateString(config.url, context);
    const method = config.method || 'GET';
    const headers = config.headers || {};
    const body = config.body ? this.interpolateString(config.body, context) : undefined;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(JSON.parse(body)) : undefined
    });

    const data = await response.json();

    return {
      success: response.ok,
      data: {
        status: response.status,
        body: data
      }
    };
  }

  /**
   * Execute condition node (if/else)
   */
  async executeConditionNode(config, context) {
    const condition = config.condition || '';
    const left = this.interpolateString(config.left, context);
    const right = this.interpolateString(config.right, context);
    const operator = config.operator || '===';

    let result;
    switch (operator) {
      case '===':
        result = left === right;
        break;
      case '!==':
        result = left !== right;
        break;
      case '>':
        result = parseFloat(left) > parseFloat(right);
        break;
      case '<':
        result = parseFloat(left) < parseFloat(right);
        break;
      case '>=':
        result = parseFloat(left) >= parseFloat(right);
        break;
      case '<=':
        result = parseFloat(left) <= parseFloat(right);
        break;
      default:
        result = false;
    }

    return {
      success: true,
      data: { condition: result, left, right, operator }
    };
  }

  /**
   * Execute action node using EXISTING Actions Engine
   */
  async executeActionNode(config, context) {
    const actionCode = config.actionCode;
    const actionData = config.actionData || {};

    // Interpolate action data with context
    const interpolatedData = {};
    for (const [key, value] of Object.entries(actionData)) {
      interpolatedData[key] = this.interpolateString(value, context);
    }

    // Use EXISTING Actions Engine
    const result = await ActionsEngine.executeAction(
      config.userId || context.userId,
      actionCode,
      interpolatedData
    );

    return {
      success: result.success,
      data: result,
      error: result.error
    };
  }

  /**
   * Execute agent node - delegates to existing agent system
   */
  async executeAgentNode(node, context) {
    // This would integrate with existing agent-runner.js
    // For now, just log
    console.log(`[WorkflowExecutor] Agent node: ${node.name}`);

    return {
      success: true,
      data: { agent: node.name, context }
    };
  }

  /**
   * Interpolate string with context variables
   * Replace {{variableName}} with actual values
   */
  interpolateString(str, context) {
    if (typeof str !== 'string') return str;

    return str.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(context, key.trim());
      return value !== undefined ? value : match;
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) =>
      current?.[key], obj
    );
  }

  /**
   * Trigger workflow execution from webhook
   * This is how EXISTING webhooks can trigger workflows
   */
  async triggerFromWebhook(workflowId, webhookData) {
    if (!this.db) return;

    try {
      const result = await this.db.query(`
        SELECT id, name, trigger_type, trigger_config, nodes, connections, enabled
        FROM workflows
        WHERE id = $1 AND enabled = TRUE
      `, [workflowId]);

      if (result.rows.length === 0) {
        console.warn(`[WorkflowExecutor] Workflow ${workflowId} not found or disabled`);
        return { success: false, error: 'Workflow not found' };
      }

      const workflow = result.rows[0];
      return await this.executeWorkflow(workflow, webhookData);

    } catch (error) {
      console.error('[WorkflowExecutor] Error triggering workflow from webhook:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get execution statistics
   */
  async getStatistics() {
    if (!this.db) return null;

    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_executions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(duration_ms) as avg_duration_ms
      FROM workflow_executions
      WHERE executed_at > NOW() - INTERVAL '24 hours'
    `);

    return result.rows[0];
  }

  /**
   * Stop all scheduled workflows
   */
  stop() {
    this.scheduler.stop();
    console.log('[WorkflowExecutor] Stopped all scheduled workflows');
  }
}

module.exports = WorkflowExecutor;
