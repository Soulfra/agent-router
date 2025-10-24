/**
 * Thought Process Logger
 *
 * Logs every step of AI reasoning for transparency and debugging
 *
 * Features:
 * - Captures complete reasoning chain (query → research → LLM → answer)
 * - Timestamps every step
 * - Stores intermediate states (scraped pages, extracted facts, LLM prompts)
 * - Replay capability (re-run reasoning from logs)
 * - Export formats (JSON, markdown, PDF)
 *
 * Use Cases:
 * - Debug why AI gave wrong answer
 * - Verify AI reasoning process
 * - Detect bias in sources
 * - Audit AI decisions for compliance
 *
 * Example:
 *   const logger = new ThoughtProcessLogger({ db, vault });
 *   const sessionId = await logger.startSession('What pirate treasure was found in 2025?');
 *   await logger.logStep(sessionId, 'source_selected', { source: 'duckduckgo' });
 *   await logger.logStep(sessionId, 'page_scraped', { url: '...', html: '...' });
 *   const chain = await logger.getReasoningChain(sessionId);
 */

class ThoughtProcessLogger {
  constructor(options = {}) {
    this.config = {
      db: options.db,
      vault: options.vault, // For storing large artifacts (HTML, screenshots)
      enableScreenshots: options.enableScreenshots !== false,
      enableFullHTML: options.enableFullHTML !== false,
      maxSteps: options.maxSteps || 100 // Prevent infinite loops
    };

    // Step types
    this.stepTypes = {
      QUERY_RECEIVED: 'query_received',
      STALENESS_DETECTED: 'staleness_detected',
      SOURCE_SELECTED: 'source_selected',
      PAGE_SCRAPED: 'page_scraped',
      DATA_EXTRACTED: 'data_extracted',
      BIAS_CHECKED: 'bias_checked',
      LLM_PROMPTED: 'llm_prompted',
      LLM_RESPONDED: 'llm_responded',
      ANSWER_MERGED: 'answer_merged',
      SESSION_COMPLETE: 'session_complete'
    };

    console.log('[ThoughtProcessLogger] Initialized');
  }

  /**
   * Start new reasoning session
   */
  async startSession(query, options = {}) {
    if (!this.config.db) {
      throw new Error('[ThoughtProcessLogger] Database required');
    }

    const result = await this.config.db.query(
      `INSERT INTO reasoning_sessions (query, user_id, started_at, context)
       VALUES ($1, $2, NOW(), $3)
       RETURNING id`,
      [query, options.userId || 'system', JSON.stringify(options.context || {})]
    );

    const sessionId = result.rows[0].id;

    // Log initial step
    await this.logStep(sessionId, this.stepTypes.QUERY_RECEIVED, {
      query,
      context: options.context || {}
    });

    console.log(`[ThoughtProcessLogger] Started session ${sessionId} for query: "${query}"`);

    return sessionId;
  }

  /**
   * Log a reasoning step
   */
  async logStep(sessionId, stepType, data = {}) {
    if (!this.config.db) {
      console.warn('[ThoughtProcessLogger] Database not configured, skipping log');
      return;
    }

    // Check step count (prevent infinite loops)
    const countResult = await this.config.db.query(
      'SELECT COUNT(*) FROM reasoning_steps WHERE session_id = $1',
      [sessionId]
    );

    const stepCount = parseInt(countResult.rows[0].count);
    if (stepCount >= this.config.maxSteps) {
      console.error(`[ThoughtProcessLogger] Max steps (${this.config.maxSteps}) reached for session ${sessionId}`);
      return;
    }

    // Store large artifacts in vault
    const artifacts = {};

    if (data.html && this.config.enableFullHTML) {
      const htmlId = await this._storeArtifact(sessionId, 'html', data.html);
      artifacts.htmlId = htmlId;
      delete data.html; // Remove from main data (stored separately)
    }

    if (data.screenshot && this.config.enableScreenshots) {
      const screenshotId = await this._storeArtifact(sessionId, 'screenshot', data.screenshot);
      artifacts.screenshotId = screenshotId;
      delete data.screenshot;
    }

    // Insert step
    await this.config.db.query(
      `INSERT INTO reasoning_steps (session_id, step_type, step_number, data, artifacts, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        sessionId,
        stepType,
        stepCount + 1,
        JSON.stringify(data),
        JSON.stringify(artifacts)
      ]
    );

    console.log(`[ThoughtProcessLogger] Logged step ${stepCount + 1}: ${stepType}`);
  }

  /**
   * End reasoning session
   */
  async endSession(sessionId, finalAnswer, metadata = {}) {
    if (!this.config.db) return;

    await this.logStep(sessionId, this.stepTypes.SESSION_COMPLETE, {
      finalAnswer,
      metadata
    });

    await this.config.db.query(
      `UPDATE reasoning_sessions
       SET ended_at = NOW(), final_answer = $1, metadata = $2
       WHERE id = $3`,
      [finalAnswer, JSON.stringify(metadata), sessionId]
    );

    console.log(`[ThoughtProcessLogger] Ended session ${sessionId}`);
  }

  /**
   * Get complete reasoning chain for a session
   */
  async getReasoningChain(sessionId) {
    if (!this.config.db) {
      throw new Error('[ThoughtProcessLogger] Database required');
    }

    // Get session
    const sessionResult = await this.config.db.query(
      'SELECT * FROM reasoning_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const session = sessionResult.rows[0];

    // Get steps
    const stepsResult = await this.config.db.query(
      `SELECT * FROM reasoning_steps
       WHERE session_id = $1
       ORDER BY step_number ASC`,
      [sessionId]
    );

    const steps = stepsResult.rows;

    // Load artifacts for each step
    for (const step of steps) {
      if (step.artifacts) {
        const artifacts = JSON.parse(step.artifacts);

        if (artifacts.htmlId) {
          step.html = await this._loadArtifact(artifacts.htmlId);
        }

        if (artifacts.screenshotId) {
          step.screenshot = await this._loadArtifact(artifacts.screenshotId);
        }
      }
    }

    return {
      sessionId: session.id,
      query: session.query,
      userId: session.user_id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      finalAnswer: session.final_answer,
      metadata: session.metadata ? JSON.parse(session.metadata) : {},
      context: session.context ? JSON.parse(session.context) : {},
      steps: steps.map(s => ({
        stepNumber: s.step_number,
        stepType: s.step_type,
        timestamp: s.timestamp,
        data: s.data ? JSON.parse(s.data) : {},
        html: s.html,
        screenshot: s.screenshot
      })),
      duration: session.ended_at
        ? new Date(session.ended_at) - new Date(session.started_at)
        : null
    };
  }

  /**
   * Export reasoning chain as markdown
   */
  async exportMarkdown(sessionId) {
    const chain = await this.getReasoningChain(sessionId);

    let md = `# Reasoning Chain: ${chain.query}\n\n`;
    md += `**Session ID:** ${chain.sessionId}\n`;
    md += `**Started:** ${new Date(chain.startedAt).toLocaleString()}\n`;
    md += `**Duration:** ${chain.duration ? (chain.duration / 1000).toFixed(2) + 's' : 'In progress'}\n\n`;
    md += `---\n\n`;

    for (const step of chain.steps) {
      md += `## Step ${step.stepNumber}: ${this._formatStepType(step.stepType)}\n\n`;
      md += `**Timestamp:** ${new Date(step.timestamp).toLocaleString()}\n\n`;

      // Format step data
      if (Object.keys(step.data).length > 0) {
        md += `**Data:**\n\`\`\`json\n${JSON.stringify(step.data, null, 2)}\n\`\`\`\n\n`;
      }

      if (step.html) {
        md += `**HTML Captured:** ${step.html.length} bytes\n\n`;
      }

      if (step.screenshot) {
        md += `**Screenshot:** Available\n\n`;
      }

      md += `---\n\n`;
    }

    if (chain.finalAnswer) {
      md += `## Final Answer\n\n${chain.finalAnswer}\n\n`;
    }

    return md;
  }

  /**
   * Export reasoning chain as JSON
   */
  async exportJSON(sessionId) {
    const chain = await this.getReasoningChain(sessionId);

    // Remove binary data for JSON export
    for (const step of chain.steps) {
      if (step.screenshot) {
        step.screenshot = '<binary data>';
      }
    }

    return JSON.stringify(chain, null, 2);
  }

  /**
   * Search reasoning sessions
   */
  async searchSessions(query, options = {}) {
    if (!this.config.db) {
      throw new Error('[ThoughtProcessLogger] Database required');
    }

    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const result = await this.config.db.query(
      `SELECT id, query, user_id, started_at, ended_at, final_answer
       FROM reasoning_sessions
       WHERE query ILIKE $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(limit = 10) {
    if (!this.config.db) {
      throw new Error('[ThoughtProcessLogger] Database required');
    }

    const result = await this.config.db.query(
      `SELECT id, query, user_id, started_at, ended_at
       FROM reasoning_sessions
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Store large artifact in vault
   */
  async _storeArtifact(sessionId, type, data) {
    if (!this.config.vault) return null;

    const key = `reasoning_${sessionId}_${type}_${Date.now()}`;

    await this.config.vault.store(
      'system',
      'reasoning_artifacts',
      key,
      { data, type },
      { ttl: 86400 * 7 } // 7 days
    );

    return key;
  }

  /**
   * Load artifact from vault
   */
  async _loadArtifact(artifactId) {
    if (!this.config.vault) return null;

    try {
      const artifact = await this.config.vault.retrieve(
        'system',
        'reasoning_artifacts',
        artifactId
      );

      return artifact ? artifact.data : null;
    } catch (err) {
      console.error('[ThoughtProcessLogger] Failed to load artifact:', err.message);
      return null;
    }
  }

  /**
   * Format step type for display
   */
  _formatStepType(stepType) {
    return stepType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Delete old sessions (cleanup)
   */
  async cleanup(daysToKeep = 30) {
    if (!this.config.db) return;

    const result = await this.config.db.query(
      `DELETE FROM reasoning_sessions
       WHERE started_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`,
      []
    );

    console.log(`[ThoughtProcessLogger] Deleted ${result.rowCount} old sessions`);

    return result.rowCount;
  }
}

module.exports = ThoughtProcessLogger;
