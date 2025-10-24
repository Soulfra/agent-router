/**
 * Automated Flow Builder
 *
 * Like DocuSign but for payments, subscriptions, and workflows
 *
 * Multi-step flows with:
 * - Status tracking at each step
 * - Automatic retry/recovery
 * - Email notifications
 * - Badge rewards on completion
 *
 * Example flows:
 * 1. Signup → Verify Email → Subscribe → Pay → Badge
 * 2. Webhook → Process → Notify → Log
 * 3. Payment → Credits → Badge → Email
 */

const crypto = require('crypto');

class AutomatedFlowBuilder {
  constructor(options = {}) {
    this.db = options.db;
    this.broadcast = options.broadcast || (() => {});
  }

  /**
   * Create a new flow from template or custom definition
   */
  async createFlow(definition) {
    const flowId = crypto.randomUUID();

    const flow = {
      id: flowId,
      name: definition.name,
      description: definition.description,
      steps: definition.steps.map((step, index) => ({
        id: crypto.randomUUID(),
        order: index,
        name: step.name,
        type: step.type, // action, condition, wait, notify
        config: step.config,
        status: 'pending',
        retryConfig: step.retryConfig || { maxRetries: 3, backoff: 'exponential' }
      })),
      trigger: definition.trigger || 'manual',
      metadata: definition.metadata || {},
      created_at: new Date()
    };

    // Save to database
    await this.db.query(`
      INSERT INTO automated_flows (
        id, name, description, steps, trigger, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      flow.id,
      flow.name,
      flow.description,
      JSON.stringify(flow.steps),
      flow.trigger,
      JSON.stringify(flow.metadata),
      flow.created_at
    ]);

    console.log(`[FlowBuilder] ✓ Created flow: ${flow.name} (${flow.id})`);
    return flow;
  }

  /**
   * Execute a flow (like signing a DocuSign document)
   */
  async executeFlow(flowId, context = {}) {
    // Get flow definition
    const flowResult = await this.db.query(`
      SELECT * FROM automated_flows WHERE id = $1
    `, [flowId]);

    if (flowResult.rows.length === 0) {
      throw new Error(`Flow ${flowId} not found`);
    }

    const flow = flowResult.rows[0];
    flow.steps = JSON.parse(flow.steps);

    // Create execution record
    const executionId = `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const execution = {
      id: executionId,
      flow_id: flowId,
      status: 'in_progress',
      current_step: 0,
      context,
      step_results: {},
      started_at: new Date()
    };

    await this.db.query(`
      INSERT INTO flow_executions (
        id, flow_id, status, current_step, context, step_results, started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      execution.id,
      execution.flow_id,
      execution.status,
      execution.current_step,
      JSON.stringify(execution.context),
      JSON.stringify(execution.step_results),
      execution.started_at
    ]);

    console.log(`[FlowBuilder] 🚀 Executing flow: ${flow.name} (${executionId})`);

    // Execute steps sequentially
    try {
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        console.log(`[FlowBuilder] Step ${i + 1}/${flow.steps.length}: ${step.name}`);

        // Update current step
        await this.updateExecutionStep(executionId, i, 'in_progress');

        // Execute step with retry logic
        const result = await this.executeStepWithRetry(step, execution);

        // Store result
        execution.step_results[step.id] = result;
        execution.context = { ...execution.context, ...result.context };

        // Update step status
        await this.updateExecutionStep(executionId, i, 'completed', result);

        // Broadcast progress
        this.broadcast({
          type: 'flow_progress',
          execution_id: executionId,
          step: i + 1,
          total: flow.steps.length,
          step_name: step.name,
          status: 'completed'
        });
      }

      // Flow completed successfully
      await this.completeExecution(executionId, 'completed', execution);

      console.log(`[FlowBuilder] ✅ Flow completed: ${executionId}`);
      return {
        success: true,
        execution_id: executionId,
        results: execution.step_results
      };

    } catch (error) {
      console.error(`[FlowBuilder] ❌ Flow failed: ${executionId}`, error);

      await this.completeExecution(executionId, 'failed', execution, error.message);

      return {
        success: false,
        execution_id: executionId,
        error: error.message
      };
    }
  }

  /**
   * Execute a single step with retry logic
   */
  async executeStepWithRetry(step, execution) {
    const maxRetries = step.retryConfig.maxRetries;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await this.executeStep(step, execution);
        return result;

      } catch (error) {
        attempt++;

        if (attempt > maxRetries) {
          throw error;
        }

        // Calculate backoff delay
        const delay = step.retryConfig.backoff === 'exponential'
          ? Math.pow(2, attempt) * 1000
          : 1000;

        console.log(`[FlowBuilder] ⚠️ Step failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Execute a single step based on type
   */
  async executeStep(step, execution) {
    switch (step.type) {
      case 'action':
        return await this.executeActionStep(step, execution);

      case 'condition':
        return await this.executeConditionStep(step, execution);

      case 'http':
        return await this.executeHttpStep(step, execution);

      case 'notify':
        return await this.executeNotifyStep(step, execution);

      case 'wait':
        return await this.executeWaitStep(step, execution);

      case 'database':
        return await this.executeDatabaseStep(step, execution);

      case 'badge':
        return await this.executeBadgeStep(step, execution);

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute action step (CALOS actions)
   */
  async executeActionStep(step, execution) {
    const ActionsEngine = require('./actions-engine');

    const userId = execution.context.user_id || execution.context.userId;
    const actionCode = step.config.action_code;
    const actionData = this.interpolateContext(step.config.action_data, execution.context);

    const result = await ActionsEngine.executeAction(userId, actionCode, actionData);

    return {
      success: result.success,
      context: result.effects || {}
    };
  }

  /**
   * Execute condition step (if/else logic)
   */
  async executeConditionStep(step, execution) {
    const condition = step.config.condition;
    const value = this.resolveValue(condition.field, execution.context);

    let passed = false;

    switch (condition.operator) {
      case 'equals':
        passed = value == condition.value;
        break;
      case 'not_equals':
        passed = value != condition.value;
        break;
      case 'greater_than':
        passed = value > condition.value;
        break;
      case 'less_than':
        passed = value < condition.value;
        break;
      case 'contains':
        passed = String(value).includes(condition.value);
        break;
    }

    return {
      success: true,
      context: { condition_passed: passed }
    };
  }

  /**
   * Execute HTTP request step
   */
  async executeHttpStep(step, execution) {
    const axios = require('axios');

    const url = this.interpolateContext(step.config.url, execution.context);
    const method = step.config.method || 'GET';
    const headers = step.config.headers || {};
    const body = this.interpolateContext(step.config.body, execution.context);

    const response = await axios({
      method,
      url,
      headers,
      data: body
    });

    return {
      success: true,
      context: { http_response: response.data }
    };
  }

  /**
   * Execute notification step (email, SMS, push)
   */
  async executeNotifyStep(step, execution) {
    const type = step.config.type; // email, sms, push
    const recipient = this.interpolateContext(step.config.recipient, execution.context);
    const message = this.interpolateContext(step.config.message, execution.context);

    if (type === 'email') {
      // Send email (integrate with existing email system)
      console.log(`[FlowBuilder] 📧 Email to ${recipient}: ${message}`);

      // TODO: Integrate with SendGrid or existing email system
      // await emailService.send({ to: recipient, subject: message });
    }

    return {
      success: true,
      context: { notified: recipient }
    };
  }

  /**
   * Execute wait step (delay)
   */
  async executeWaitStep(step, execution) {
    const duration = step.config.duration || 1000;
    await new Promise(resolve => setTimeout(resolve, duration));

    return {
      success: true,
      context: {}
    };
  }

  /**
   * Execute database step (query)
   */
  async executeDatabaseStep(step, execution) {
    const query = this.interpolateContext(step.config.query, execution.context);
    const params = step.config.params || [];

    const result = await this.db.query(query, params);

    return {
      success: true,
      context: { query_result: result.rows }
    };
  }

  /**
   * Execute badge step (award badge)
   */
  async executeBadgeStep(step, execution) {
    const userId = execution.context.user_id || execution.context.userId;
    const badgeType = step.config.badge_type;

    // Award badge
    await this.db.query(`
      INSERT INTO user_badges (user_id, badge_type, earned_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT DO NOTHING
    `, [userId, badgeType]);

    console.log(`[FlowBuilder] 🏆 Awarded badge ${badgeType} to user ${userId}`);

    return {
      success: true,
      context: { badge_awarded: badgeType }
    };
  }

  /**
   * Interpolate context variables into strings
   */
  interpolateContext(value, context) {
    if (typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return context[key] || match;
      });
    }

    if (typeof value === 'object' && value !== null) {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.interpolateContext(val, context);
      }
      return result;
    }

    return value;
  }

  /**
   * Resolve value from context
   */
  resolveValue(path, context) {
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) break;
    }

    return value;
  }

  /**
   * Update execution step status
   */
  async updateExecutionStep(executionId, stepIndex, status, result = {}) {
    await this.db.query(`
      UPDATE flow_executions
      SET current_step = $2,
          step_results = jsonb_set(
            COALESCE(step_results, '{}'::jsonb),
            $3::text[],
            $4::jsonb
          ),
          updated_at = NOW()
      WHERE id = $1
    `, [
      executionId,
      stepIndex,
      [`step_${stepIndex}`],
      JSON.stringify({ status, result })
    ]);
  }

  /**
   * Complete execution
   */
  async completeExecution(executionId, status, execution, error = null) {
    await this.db.query(`
      UPDATE flow_executions
      SET status = $2,
          step_results = $3,
          error_message = $4,
          completed_at = NOW()
      WHERE id = $1
    `, [
      executionId,
      status,
      JSON.stringify(execution.step_results),
      error
    ]);
  }

  /**
   * Get flow execution status
   */
  async getExecutionStatus(executionId) {
    const result = await this.db.query(`
      SELECT
        fe.*,
        af.name as flow_name,
        af.steps as flow_steps
      FROM flow_executions fe
      JOIN automated_flows af ON af.id = fe.flow_id
      WHERE fe.id = $1
    `, [executionId]);

    if (result.rows.length === 0) {
      return null;
    }

    const execution = result.rows[0];
    execution.context = JSON.parse(execution.context);
    execution.step_results = JSON.parse(execution.step_results);
    execution.flow_steps = JSON.parse(execution.flow_steps);

    return execution;
  }

  /**
   * List all flows
   */
  async listFlows() {
    const result = await this.db.query(`
      SELECT
        id,
        name,
        description,
        trigger,
        created_at,
        (SELECT COUNT(*) FROM flow_executions WHERE flow_id = automated_flows.id) as execution_count
      FROM automated_flows
      ORDER BY created_at DESC
    `);

    return result.rows;
  }
}

module.exports = AutomatedFlowBuilder;
