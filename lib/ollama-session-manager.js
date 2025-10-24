/**
 * Ollama Session Manager
 *
 * Manages streaming Ollama sessions with multi-domain context sharing.
 *
 * Features:
 * - Start/end tracked work sessions (with timer)
 * - Chat with local Ollama
 * - Stream context to other models when switching domains
 * - Apply custom branding per domain
 * - Calculate costs and generate session summaries
 *
 * Use Case:
 * "I'm talking with my local Ollama, but when I hit certain models or domains
 *  I want to work with on their branding or consulting, it registers we're working
 *  on it like a timer. Ollama listens and streams context to other domains/models,
 *  then at the end we figure out costs."
 */

const MultiLLMRouter = require('./multi-llm-router');

class OllamaSessionManager {
  constructor(config = {}) {
    this.db = config.db;
    this.llmRouter = config.llmRouter || new MultiLLMRouter();
    this.verbose = config.verbose || false;

    if (!this.db) {
      throw new Error('[OllamaSessionManager] Database connection required');
    }

    // Session cache (in-memory for quick lookups)
    this.activeSessions = new Map(); // sessionId → session data

    console.log('[OllamaSessionManager] Initialized');
  }

  /**
   * Start a new streaming session
   *
   * @param {Object} params - Session parameters
   * @param {string} params.userId - User ID
   * @param {string} params.domainId - Domain/client ID (optional)
   * @param {string} params.brandId - Brand configuration ID (optional)
   * @param {number} params.roomId - Code room ID (optional)
   * @param {string} params.primaryModel - Primary model (default: 'ollama:mistral')
   * @param {string} params.sessionName - User-friendly name (optional)
   * @param {Object} params.options - Additional options
   * @returns {Promise<Object>} Session data
   */
  async startSession(params) {
    const {
      userId,
      domainId = null,
      brandId = null,
      roomId = null,
      primaryModel = 'ollama:mistral',
      sessionName = null,
      options = {}
    } = params;

    try {
      // Create session in database
      const result = await this.db.query(`
        SELECT start_ollama_session($1, $2, $3, $4, $5, $6) as session_id
      `, [userId, domainId, brandId, roomId, primaryModel, sessionName]);

      const sessionId = result.rows[0].session_id;

      // Get full session data
      const session = await this.getSession(sessionId);

      // Cache session
      this.activeSessions.set(sessionId, session);

      if (this.verbose) {
        console.log(`[OllamaSessionManager] Started session: ${sessionId}`);
      }

      return {
        success: true,
        sessionId,
        session
      };

    } catch (error) {
      console.error('[OllamaSessionManager] Start session error:', error.message);
      throw error;
    }
  }

  /**
   * Send a message in a session
   *
   * @param {string} sessionId - Session ID
   * @param {string} message - User message
   * @param {Object} options - Optional settings
   * @returns {Promise<Object>} Assistant response
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      // Get session
      const session = await this.getSession(sessionId);

      if (session.status !== 'active') {
        throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
      }

      // Log user message
      await this.logMessage({
        sessionId,
        role: 'user',
        content: message,
        model: null,
        provider: null,
        tokens: this.estimateTokens(message),
        cost: 0
      });

      // Get conversation history for context
      const history = await this.getConversationHistory(sessionId, options.contextWindow || 10);

      // Build prompt with history
      const prompt = this.buildPromptWithHistory(history, message);

      // Send to primary model (usually Ollama)
      const startTime = Date.now();
      const response = await this.llmRouter.complete({
        prompt,
        model: session.primary_model,
        preferredProvider: session.primary_provider || 'ollama',
        maxTokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7
      });

      const latencyMs = Date.now() - startTime;

      // Log assistant response
      await this.logMessage({
        sessionId,
        role: 'assistant',
        content: response.text,
        model: response.model,
        provider: response.provider,
        tokens: response.usage?.totalTokens || 0,
        promptTokens: response.usage?.promptTokens || 0,
        completionTokens: response.usage?.completionTokens || 0,
        cost: response.cost?.estimatedUSD || 0
      });

      // Update session statistics
      await this.updateSessionStats(sessionId);

      // Check if we should auto-stream context to other models
      if (session.auto_stream_enabled) {
        await this.checkAutoStream(sessionId, session);
      }

      return {
        success: true,
        response: response.text,
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        cost: response.cost,
        latencyMs
      };

    } catch (error) {
      console.error('[OllamaSessionManager] Send message error:', error.message);
      throw error;
    }
  }

  /**
   * Switch domain/model and stream context
   *
   * @param {string} sessionId - Session ID
   * @param {Object} params - Switch parameters
   * @returns {Promise<Object>} Stream result
   */
  async switchDomain(sessionId, params) {
    const {
      targetDomainId,
      targetModel,
      targetProvider,
      reason = 'domain_switch'
    } = params;

    try {
      const session = await this.getSession(sessionId);

      // Get conversation history to stream as context
      const contextWindow = session.context_window_size || 10;
      const history = await this.getConversationHistory(sessionId, contextWindow);

      // Build context snapshot
      const contextSnapshot = history.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        model: msg.model
      }));

      // Estimate tokens in context
      const totalTokens = history.reduce((sum, msg) => sum + (msg.tokens || 0), 0);

      // Stream context to target model (this creates the context in target model)
      const contextPrompt = this.buildContextPrompt(history);
      const response = await this.llmRouter.complete({
        prompt: contextPrompt,
        model: targetModel,
        preferredProvider: targetProvider,
        maxTokens: 100, // Small response to acknowledge context
        temperature: 0.5
      });

      const streamCost = response.cost?.estimatedUSD || 0;

      // Log context stream
      await this.db.query(`
        INSERT INTO ollama_context_streams (
          session_id,
          source_model,
          target_model,
          target_provider,
          target_domain_id,
          context_snapshot,
          message_count,
          total_tokens,
          reason,
          triggered_by,
          cost_usd
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        sessionId,
        session.primary_model,
        targetModel,
        targetProvider,
        targetDomainId,
        JSON.stringify(contextSnapshot),
        history.length,
        totalTokens,
        reason,
        'user',
        streamCost
      ]);

      // Update session with new domain
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET
          domain_id = $2,
          context_shared_with = context_shared_with || $3::jsonb,
          updated_at = NOW()
        WHERE session_id = $1
      `, [
        sessionId,
        targetDomainId,
        JSON.stringify([{
          model: targetModel,
          provider: targetProvider,
          domain_id: targetDomainId,
          timestamp: new Date().toISOString()
        }])
      ]);

      if (this.verbose) {
        console.log(`[OllamaSessionManager] Switched domain: ${sessionId} → ${targetDomainId}`);
      }

      return {
        success: true,
        contextStreamed: true,
        messageCount: history.length,
        totalTokens,
        cost: streamCost,
        targetModel,
        targetDomain: targetDomainId
      };

    } catch (error) {
      console.error('[OllamaSessionManager] Switch domain error:', error.message);
      throw error;
    }
  }

  /**
   * End a session and generate summary
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session summary
   */
  async endSession(sessionId) {
    try {
      // End session (calculates duration)
      await this.db.query(`SELECT end_ollama_session($1)`, [sessionId]);

      // Get summary
      const summary = await this.getSessionSummary(sessionId);

      // Remove from cache
      this.activeSessions.delete(sessionId);

      if (this.verbose) {
        console.log(`[OllamaSessionManager] Ended session: ${sessionId} (${summary.duration_formatted})`);
      }

      return {
        success: true,
        summary
      };

    } catch (error) {
      console.error('[OllamaSessionManager] End session error:', error.message);
      throw error;
    }
  }

  /**
   * Get session data
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session data
   * @private
   */
  async getSession(sessionId) {
    // Check cache first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }

    const result = await this.db.query(`
      SELECT * FROM ollama_streaming_sessions WHERE session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Get conversation history
   *
   * @param {string} sessionId - Session ID
   * @param {number} limit - Max messages to retrieve
   * @returns {Promise<Array>} Message history
   * @private
   */
  async getConversationHistory(sessionId, limit = 10) {
    const result = await this.db.query(`
      SELECT * FROM ollama_session_messages
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [sessionId, limit]);

    return result.rows.reverse(); // Return chronological order
  }

  /**
   * Log a message
   *
   * @param {Object} params - Message parameters
   * @returns {Promise<string>} Message ID
   * @private
   */
  async logMessage(params) {
    const {
      sessionId,
      role,
      content,
      model,
      provider,
      tokens = 0,
      promptTokens = 0,
      completionTokens = 0,
      cost = 0
    } = params;

    const result = await this.db.query(`
      INSERT INTO ollama_session_messages (
        session_id,
        role,
        content,
        model,
        provider,
        tokens,
        prompt_tokens,
        completion_tokens,
        cost_usd
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING message_id
    `, [sessionId, role, content, model, provider, tokens, promptTokens, completionTokens, cost]);

    return result.rows[0].message_id;
  }

  /**
   * Update session statistics
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   * @private
   */
  async updateSessionStats(sessionId) {
    await this.db.query(`
      UPDATE ollama_streaming_sessions
      SET
        total_messages = (SELECT COUNT(*) FROM ollama_session_messages WHERE session_id = $1),
        total_tokens = (SELECT COALESCE(SUM(tokens), 0) FROM ollama_session_messages WHERE session_id = $1),
        estimated_cost_usd = (SELECT COALESCE(SUM(cost_usd), 0) FROM ollama_session_messages WHERE session_id = $1),
        updated_at = NOW()
      WHERE session_id = $1
    `, [sessionId]);
  }

  /**
   * Check if we should auto-stream context
   *
   * @param {string} sessionId - Session ID
   * @param {Object} session - Session data
   * @returns {Promise<void>}
   * @private
   */
  async checkAutoStream(sessionId, session) {
    // Check if message count exceeds threshold
    if (session.total_messages >= session.stream_threshold) {
      // Auto-stream logic would go here
      // For now, just log
      if (this.verbose) {
        console.log(`[OllamaSessionManager] Auto-stream threshold reached: ${sessionId}`);
      }
    }
  }

  /**
   * Build prompt with conversation history
   *
   * @param {Array} history - Message history
   * @param {string} newMessage - New user message
   * @returns {string} Combined prompt
   * @private
   */
  buildPromptWithHistory(history, newMessage) {
    const lines = history.map(msg => `${msg.role}: ${msg.content}`);
    lines.push(`user: ${newMessage}`);
    return lines.join('\n');
  }

  /**
   * Build context prompt for streaming to another model
   *
   * @param {Array} history - Message history
   * @returns {string} Context prompt
   * @private
   */
  buildContextPrompt(history) {
    const context = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    return `Here is the conversation context so far:\n\n${context}\n\nPlease acknowledge that you understand this context.`;
  }

  /**
   * Estimate tokens in text (rough approximation)
   *
   * @param {string} text - Text to estimate
   * @returns {number} Estimated tokens
   * @private
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get session summary
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Summary data
   */
  async getSessionSummary(sessionId) {
    const result = await this.db.query(`
      SELECT * FROM ollama_session_summary WHERE session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      throw new Error(`Session summary not found: ${sessionId}`);
    }

    return result.rows[0];
  }

  /**
   * Get active sessions for a user
   *
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Active sessions
   */
  async getActiveSessions(userId) {
    const result = await this.db.query(`
      SELECT * FROM get_active_ollama_sessions($1)
    `, [userId]);

    return result.rows;
  }

  /**
   * List all sessions for a user
   *
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Sessions
   */
  async listSessions(userId, options = {}) {
    const { limit = 50, status = null } = options;

    let query = `
      SELECT
        s.*,
        d.domain_name,
        b.brand_name
      FROM ollama_streaming_sessions s
      LEFT JOIN domain_portfolio d ON s.domain_id = d.domain_id
      LEFT JOIN user_brands b ON s.brand_id = b.id
      WHERE s.user_id = $1
    `;

    const params = [userId];

    if (status) {
      query += ` AND s.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY s.started_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.query(query, params);

    return result.rows;
  }
}

module.exports = OllamaSessionManager;
