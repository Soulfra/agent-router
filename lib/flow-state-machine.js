/**
 * Flow State Machine
 *
 * Universal state machine for multi-step flows like:
 * - Stripe/Coinbase onboarding
 * - YC Connect setup wizards
 * - DocuSign signing flows
 * - RuneScape-style session management (6-hour logout)
 *
 * Features:
 * - Define flows with steps
 * - Auto-generate QR codes per step
 * - Track progress (visual progress bars)
 * - Handle timeouts/auto-logout
 * - Sync state across devices
 * - Persist state to resume later
 *
 * Example Flow Definition:
 * ```javascript
 * const hubFlow = {
 *   id: 'hub-onboarding',
 *   name: 'CALOS Hub Setup',
 *   steps: [
 *     {
 *       id: 'welcome',
 *       name: 'Welcome',
 *       url: '/hub.html',
 *       qrPath: '/hub.html',
 *       timeout: null,
 *       required: false
 *     },
 *     {
 *       id: 'setup-keys',
 *       name: 'Configure API Keys',
 *       url: '/setup.html',
 *       qrPath: '/setup.html',
 *       timeout: '10m',
 *       required: true
 *     },
 *     {
 *       id: 'pair-device',
 *       name: 'Pair Mobile Device',
 *       url: '/soulfra-os.html#device-pairing',
 *       qrPath: '/api/pairing/qr',
 *       timeout: '5m',
 *       required: false
 *     },
 *     {
 *       id: 'explore',
 *       name: 'Explore Interfaces',
 *       url: '/hub.html',
 *       qrPath: null,
 *       timeout: '6h', // RuneScape-style 6-hour logout
 *       required: false
 *     },
 *     {
 *       id: 'logout',
 *       name: 'Session Ended',
 *       url: '/logout.html',
 *       qrPath: '/logout-qr',
 *       timeout: null,
 *       required: false
 *     }
 *   ]
 * };
 * ```
 *
 * Usage:
 * ```javascript
 * const flowMachine = new FlowStateMachine({ db });
 *
 * // Create session
 * const session = await flowMachine.startFlow('hub-onboarding', {
 *   userId: 'user123',
 *   flowConfig: hubFlow
 * });
 *
 * // Get current state
 * const state = await flowMachine.getCurrentState(session.id);
 * // => { step: 'welcome', progress: 0, qrCode: 'http://...', timeRemaining: null }
 *
 * // Advance to next step
 * await flowMachine.nextStep(session.id);
 *
 * // Check if timed out
 * const timedOut = await flowMachine.isTimedOut(session.id);
 * ```
 */

const crypto = require('crypto');
const QRGenerator = require('./qr-generator');

class FlowStateMachine {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;
    this.qrGen = new QRGenerator({ port: config.port || 5001 });

    // In-memory state cache (Map<sessionId, state>)
    this.sessions = new Map();

    // Registered flows (Map<flowId, flowConfig>)
    this.flows = new Map();

    // Timeout handlers (Map<sessionId, timeoutHandle>)
    this.timeouts = new Map();
  }

  // ============================================================================
  // FLOW REGISTRATION
  // ============================================================================

  /**
   * Register a flow definition
   * @param {Object} flowConfig - Flow configuration
   */
  registerFlow(flowConfig) {
    if (!flowConfig.id || !flowConfig.steps) {
      throw new Error('Flow must have id and steps');
    }

    this.flows.set(flowConfig.id, flowConfig);

    if (this.verbose) {
      console.log(`[FlowStateMachine] Registered flow: ${flowConfig.id} (${flowConfig.steps.length} steps)`);
    }
  }

  /**
   * Get registered flow by ID
   * @param {string} flowId - Flow ID
   * @returns {Object|null} Flow config
   */
  getFlow(flowId) {
    return this.flows.get(flowId) || null;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new flow session
   * @param {string} flowId - Flow ID
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session info
   */
  async startFlow(flowId, options = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const sessionId = options.sessionId || crypto.randomUUID();
    const userId = options.userId || null;

    const session = {
      id: sessionId,
      flowId,
      userId,
      currentStep: 0,
      stepHistory: [],
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      completed: false,
      metadata: options.metadata || {}
    };

    // Cache session
    this.sessions.set(sessionId, session);

    // Persist to database if available
    if (this.db) {
      await this.db.query(`
        INSERT INTO flow_sessions (
          session_id,
          flow_id,
          user_id,
          current_step,
          started_at,
          last_activity,
          completed,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        sessionId,
        flowId,
        userId,
        0,
        session.startedAt,
        session.lastActivity,
        false,
        JSON.stringify(session.metadata)
      ]);
    }

    // Start timeout timer for first step
    await this._startStepTimeout(sessionId, flow.steps[0]);

    if (this.verbose) {
      console.log(`[FlowStateMachine] Started flow session: ${sessionId} (flow: ${flowId})`);
    }

    return {
      sessionId,
      flowId,
      flowName: flow.name,
      totalSteps: flow.steps.length,
      currentStep: this._getStepInfo(flow, 0)
    };
  }

  /**
   * Get current session state
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Current state
   */
  async getCurrentState(sessionId) {
    let session = this.sessions.get(sessionId);

    // Load from DB if not in cache
    if (!session && this.db) {
      const result = await this.db.query(
        `SELECT * FROM flow_sessions WHERE session_id = $1`,
        [sessionId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        session = {
          id: row.session_id,
          flowId: row.flow_id,
          userId: row.user_id,
          currentStep: row.current_step,
          stepHistory: row.step_history || [],
          startedAt: row.started_at,
          lastActivity: row.last_activity,
          completed: row.completed,
          metadata: row.metadata || {}
        };
        this.sessions.set(sessionId, session);
      }
    }

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const flow = this.flows.get(session.flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${session.flowId}`);
    }

    const currentStepConfig = flow.steps[session.currentStep];
    const progress = ((session.currentStep / flow.steps.length) * 100).toFixed(0);

    // Generate QR code if step has qrPath
    let qrCode = null;
    if (currentStepConfig.qrPath) {
      qrCode = this.qrGen.generateLocalURL(currentStepConfig.qrPath);
    }

    // Calculate time remaining if step has timeout
    let timeRemaining = null;
    if (currentStepConfig.timeout) {
      const lastActivity = new Date(session.lastActivity);
      const timeoutMs = this._parseTimeout(currentStepConfig.timeout);
      const elapsed = Date.now() - lastActivity.getTime();
      timeRemaining = Math.max(0, timeoutMs - elapsed);
    }

    return {
      sessionId,
      flowId: session.flowId,
      flowName: flow.name,
      currentStep: session.currentStep,
      totalSteps: flow.steps.length,
      progress: parseInt(progress),
      stepInfo: this._getStepInfo(flow, session.currentStep),
      qrCode,
      timeRemaining,
      completed: session.completed,
      metadata: session.metadata
    };
  }

  /**
   * Advance to next step
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} New state
   */
  async nextStep(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const flow = this.flows.get(session.flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${session.flowId}`);
    }

    // Clear current step timeout
    this._clearStepTimeout(sessionId);

    // Add current step to history
    session.stepHistory.push({
      stepIndex: session.currentStep,
      completedAt: new Date().toISOString()
    });

    // Move to next step
    session.currentStep += 1;
    session.lastActivity = new Date().toISOString();

    // Check if completed
    if (session.currentStep >= flow.steps.length) {
      session.completed = true;
      session.currentStep = flow.steps.length - 1; // Stay on last step
    }

    // Update cache and DB
    this.sessions.set(sessionId, session);

    if (this.db) {
      await this.db.query(`
        UPDATE flow_sessions
        SET current_step = $1,
            step_history = $2,
            last_activity = $3,
            completed = $4
        WHERE session_id = $5
      `, [
        session.currentStep,
        JSON.stringify(session.stepHistory),
        session.lastActivity,
        session.completed,
        sessionId
      ]);
    }

    // Start timeout for new step
    if (!session.completed) {
      await this._startStepTimeout(sessionId, flow.steps[session.currentStep]);
    }

    if (this.verbose) {
      console.log(`[FlowStateMachine] Advanced to step ${session.currentStep} (session: ${sessionId})`);
    }

    return this.getCurrentState(sessionId);
  }

  /**
   * Go to specific step
   * @param {string} sessionId - Session ID
   * @param {number} stepIndex - Step index
   * @returns {Promise<Object>} New state
   */
  async goToStep(sessionId, stepIndex) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const flow = this.flows.get(session.flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${session.flowId}`);
    }

    if (stepIndex < 0 || stepIndex >= flow.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    // Clear current step timeout
    this._clearStepTimeout(sessionId);

    session.currentStep = stepIndex;
    session.lastActivity = new Date().toISOString();

    this.sessions.set(sessionId, session);

    if (this.db) {
      await this.db.query(`
        UPDATE flow_sessions
        SET current_step = $1, last_activity = $2
        WHERE session_id = $3
      `, [session.currentStep, session.lastActivity, sessionId]);
    }

    // Start timeout for new step
    await this._startStepTimeout(sessionId, flow.steps[session.currentStep]);

    return this.getCurrentState(sessionId);
  }

  /**
   * Update session activity (prevents timeout)
   * @param {string} sessionId - Session ID
   */
  async updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = new Date().toISOString();
    this.sessions.set(sessionId, session);

    if (this.db) {
      await this.db.query(
        `UPDATE flow_sessions SET last_activity = $1 WHERE session_id = $2`,
        [session.lastActivity, sessionId]
      );
    }
  }

  /**
   * Check if session has timed out
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if timed out
   */
  async isTimedOut(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return true;

    const flow = this.flows.get(session.flowId);
    if (!flow) return true;

    const currentStepConfig = flow.steps[session.currentStep];
    if (!currentStepConfig.timeout) return false;

    const lastActivity = new Date(session.lastActivity);
    const timeoutMs = this._parseTimeout(currentStepConfig.timeout);
    const elapsed = Date.now() - lastActivity.getTime();

    return elapsed >= timeoutMs;
  }

  /**
   * End session (logout)
   * @param {string} sessionId - Session ID
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this._clearStepTimeout(sessionId);
      this.sessions.delete(sessionId);

      if (this.db) {
        await this.db.query(
          `UPDATE flow_sessions SET completed = true WHERE session_id = $1`,
          [sessionId]
        );
      }

      if (this.verbose) {
        console.log(`[FlowStateMachine] Ended session: ${sessionId}`);
      }
    }
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  _getStepInfo(flow, stepIndex) {
    const step = flow.steps[stepIndex];
    return {
      index: stepIndex,
      id: step.id,
      name: step.name,
      url: step.url,
      required: step.required || false,
      hasQR: !!step.qrPath,
      hasTimeout: !!step.timeout
    };
  }

  _parseTimeout(timeoutStr) {
    if (!timeoutStr) return null;

    const match = timeoutStr.match(/^(\d+)(s|m|h)$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return null;
    }
  }

  async _startStepTimeout(sessionId, stepConfig) {
    if (!stepConfig.timeout) return;

    const timeoutMs = this._parseTimeout(stepConfig.timeout);
    if (!timeoutMs) return;

    const handle = setTimeout(async () => {
      if (this.verbose) {
        console.log(`[FlowStateMachine] Session timed out: ${sessionId}`);
      }

      await this.endSession(sessionId);
    }, timeoutMs);

    this.timeouts.set(sessionId, handle);
  }

  _clearStepTimeout(sessionId) {
    const handle = this.timeouts.get(sessionId);
    if (handle) {
      clearTimeout(handle);
      this.timeouts.delete(sessionId);
    }
  }
}

module.exports = FlowStateMachine;
