/**
 * Guardian Agent
 *
 * Autonomous system monitor powered by Ollama + tools.
 * Uses ReACT pattern to detect and fix issues automatically.
 *
 * Responsibilities:
 * - Monitor system health every 60 seconds
 * - Detect API errors, database issues, test failures
 * - Diagnose root causes using reasoning
 * - Apply fixes using available tools
 * - Verify fixes worked
 * - Log all actions for audit trail
 */

const DataSource = require('../sources/data-source');
const OllamaTools = require('../lib/ollama-tools');
const ExternalBugReporter = require('../lib/external-bug-reporter');
const PatchApplicator = require('../lib/patch-applicator');

class GuardianAgent {
  constructor(options = {}) {
    this.db = options.db || null;
    this.model = options.model || 'mistral:7b';
    this.receiptParser = options.receiptParser || null;
    this.ocrAdapter = options.ocrAdapter || null;
    this.dataSource = new DataSource({
      mode: 'api',
      db: this.db,
      caching: false // Don't cache guardian results
    });
    this.tools = new OllamaTools({
      db: this.db,
      allowDangerousCommands: false, // Safety: guardian can't run dangerous commands
      receiptParser: this.receiptParser,
      ocrAdapter: this.ocrAdapter
    });
    this.bugReporter = new ExternalBugReporter({
      db: this.db,
      verbose: options.verbose
    });
    this.patchApplicator = new PatchApplicator({
      db: this.db,
      verbose: options.verbose
    });
    this.verbose = options.verbose || false;
  }

  /**
   * Run health monitoring and auto-healing
   */
  async monitor() {
    const startTime = Date.now();

    try {
      // Guardian's monitoring task
      const task = `You are the Guardian, an autonomous system monitor for CalOS.

Your mission: Ensure system reliability and fix issues automatically.

MONITORING CHECKLIST:
1. Check system health (API, database, Ollama)
2. Test critical API endpoints (/api/candles/BTC, /health)
3. Query database for recent errors
4. Check if tests are passing
5. Look for permission issues, connection errors, or failures

HEALING PROTOCOL:
- If you find issues, diagnose the root cause
- Apply fixes using available tools
- Verify fixes worked by re-testing
- Document what you did

IMPORTANT:
- Be thorough but efficient
- Only fix real problems (don't over-engineer)
- Log your reasoning
- If everything is healthy, just say "System healthy"

Begin monitoring now.`;

      // Run with ReACT pattern
      const result = await this.runWithTools(task);

      const duration = Date.now() - startTime;

      // Parse result to extract key information
      const analysis = this.analyzeResult(result);

      // Log to database
      await this.logActivity({
        eventType: 'health_check',
        severity: analysis.severity,
        diagnosis: analysis.diagnosis,
        actionTaken: analysis.actions,
        result: analysis.status,
        duration,
        toolCalls: result.toolLog || []
      });

      return {
        status: analysis.status,
        message: result.response,
        duration,
        toolsUsed: result.toolLog ? result.toolLog.length : 0,
        severity: analysis.severity
      };

    } catch (error) {
      console.error('[Guardian] Monitoring failed:', error.message);

      // Log error
      await this.logActivity({
        eventType: 'monitoring_error',
        severity: 'error',
        diagnosis: error.message,
        actionTaken: 'none',
        result: 'failed',
        duration: Date.now() - startTime
      });

      return {
        status: 'error',
        message: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Run a task with tool access (ReACT pattern)
   */
  async runWithTools(task) {
    const systemPrompt = `You are the Guardian, an autonomous system monitor.

${this.tools.getToolDefinitions()}

Use tools to investigate, diagnose, and fix issues.
Think step by step and be methodical.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task }
    ];

    // ReACT loop
    const maxIterations = 10;
    let finalResponse = '';
    const toolLog = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (this.verbose) {
        console.log(`[Guardian Iteration ${iteration + 1}]`);
      }

      // Get Ollama's response
      const response = await this.dataSource.fetchOllama(this.model, messages, {
        timeout: 60000
      });

      // Check for tool calls
      const toolCalls = this.tools.parseToolCalls(response);

      if (toolCalls.length === 0) {
        // No more tools needed
        finalResponse = response;
        break;
      }

      if (this.verbose) {
        console.log(`[Guardian] Using tools:`, toolCalls.map(t => t.tool));
      }

      // Execute tools
      const toolResults = [];
      for (const call of toolCalls) {
        const result = await this.tools.executeTool(call.tool, call.args);
        toolResults.push({
          tool: call.tool,
          args: call.args,
          result: result,
          success: !result.error
        });

        // Track in log
        toolLog.push({
          iteration: iteration + 1,
          tool: call.tool,
          args: call.args,
          success: !result.error,
          timestamp: new Date().toISOString()
        });
      }

      // Add to conversation
      messages.push({
        role: 'assistant',
        content: response
      });

      const resultsText = toolResults.map(tr => {
        return `TOOL: ${tr.tool}\nRESULT: ${JSON.stringify(tr.result, null, 2)}`;
      }).join('\n\n');

      messages.push({
        role: 'user',
        content: `${resultsText}\n\nContinue monitoring or provide final status.`
      });
    }

    if (!finalResponse) {
      finalResponse = `[Guardian] Max iterations reached. Monitoring incomplete.`;
    }

    return {
      response: finalResponse,
      toolLog: toolLog
    };
  }

  /**
   * Analyze result to extract structured information
   */
  analyzeResult(result) {
    const response = result.response.toLowerCase();
    const toolLog = result.toolLog || [];

    // Determine severity
    let severity = 'info';
    if (response.includes('error') || response.includes('failed') || response.includes('down')) {
      severity = 'error';
    } else if (response.includes('warning') || response.includes('issue')) {
      severity = 'warning';
    }

    // Determine status
    let status = 'healthy';
    if (response.includes('fixed') || response.includes('repaired')) {
      status = 'healed';
    } else if (severity === 'error') {
      status = 'unhealthy';
    }

    // Extract diagnosis (first sentence or key findings)
    const lines = result.response.split('\n').filter(l => l.trim());
    const diagnosis = lines.slice(0, 3).join(' ').substring(0, 500);

    // Extract actions from tool log
    const actions = toolLog
      .filter(t => t.tool !== 'check_health' && t.tool !== 'fetch_api')
      .map(t => t.tool)
      .join(', ');

    return {
      severity,
      status,
      diagnosis,
      actions: actions || 'monitoring_only'
    };
  }

  /**
   * Log guardian activity to database
   */
  async logActivity(data) {
    if (!this.db) {
      if (this.verbose) {
        console.log('[Guardian] No database - skipping log');
      }
      return;
    }

    try {
      await this.db.query(
        `INSERT INTO guardian_log
         (event_type, severity, diagnosis, action_taken, result, metadata, tool_calls)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.eventType,
          data.severity,
          data.diagnosis,
          data.actionTaken,
          data.result,
          JSON.stringify({
            duration: data.duration,
            model: this.model
          }),
          JSON.stringify(data.toolCalls || [])
        ]
      );

      if (this.verbose) {
        console.log(`[Guardian] Logged activity: ${data.eventType} (${data.severity})`);
      }
    } catch (error) {
      console.error('[Guardian] Failed to log activity:', error.message);
    }
  }

  /**
   * Get recent guardian activity
   */
  async getRecentActivity(limit = 10) {
    if (!this.db) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT id, timestamp, event_type, severity, diagnosis, action_taken, result
         FROM guardian_log
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[Guardian] Failed to fetch activity:', error.message);
      return [];
    }
  }

  /**
   * Get guardian statistics
   */
  async getStats() {
    if (!this.db) {
      return { error: 'Database not available' };
    }

    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE result = 'healthy') as healthy_count,
          COUNT(*) FILTER (WHERE result = 'healed') as healed_count,
          COUNT(*) FILTER (WHERE result = 'unhealthy') as unhealthy_count,
          COUNT(*) FILTER (WHERE severity = 'error') as error_count,
          MAX(timestamp) as last_check
        FROM guardian_log
        WHERE timestamp > NOW() - INTERVAL '24 hours'
      `);

      return result.rows[0];
    } catch (error) {
      console.error('[Guardian] Failed to fetch stats:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Report error to external AI service for diagnosis
   *
   * @param {Error} error - The error object
   * @param {Object} context - Additional context (file, line, source)
   * @returns {Promise<Object>} - AI diagnosis and suggested fix
   */
  async reportError(error, context = {}) {
    console.log('[Guardian] Reporting error to external AI for diagnosis...');

    // Package bug report
    const bugReport = this.bugReporter.packageBugReport(error, context);

    // Send to OpenAI for diagnosis
    const result = await this.bugReporter.reportToOpenAI(bugReport);

    if (result.success) {
      console.log('[Guardian] Received AI diagnosis:');
      console.log(`  Diagnosis: ${result.diagnosis}`);
      console.log(`  Fix: ${result.fix}`);

      return result;
    } else {
      console.error('[Guardian] AI diagnosis failed:', result.error);
      return result;
    }
  }

  /**
   * Detect error, report to AI, and auto-apply fix
   *
   * @param {Error} error - The error to fix
   * @param {Object} context - Context (file, line, stackTrace)
   * @returns {Promise<Object>} - Result of auto-healing attempt
   */
  async autoHealError(error, context = {}) {
    console.log('[Guardian] Starting auto-heal workflow...');

    try {
      // Step 1: Report to AI for diagnosis
      const diagnosis = await this.reportError(error, context);

      if (!diagnosis.success || !diagnosis.fix) {
        return {
          success: false,
          error: 'Failed to get AI diagnosis or suggested fix'
        };
      }

      // Step 2: Parse AI suggestion into patch format
      const patch = this.patchApplicator.parseSuggestion(
        diagnosis.fix,
        context.file
      );

      if (!patch) {
        console.warn('[Guardian] Could not parse AI suggestion into patch');
        return {
          success: false,
          error: 'Could not parse AI suggestion',
          diagnosis
        };
      }

      // Step 3: Apply patch
      console.log('[Guardian] Applying AI-suggested patch...');
      const patchResult = await this.patchApplicator.applyPatch(patch);

      if (patchResult.success) {
        console.log('[Guardian] ✓ Auto-heal successful!');

        return {
          success: true,
          diagnosis,
          patch: patchResult
        };
      } else {
        console.warn('[Guardian] Patch application failed:', patchResult.error);

        return {
          success: false,
          diagnosis,
          patchError: patchResult.error
        };
      }

    } catch (error) {
      console.error('[Guardian] Auto-heal workflow failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GuardianAgent;
