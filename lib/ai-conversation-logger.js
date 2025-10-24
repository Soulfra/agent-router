/**
 * AI Conversation Logger
 *
 * Logs ALL AI API calls across CALOS for:
 * - Auditing (what did the AI say?)
 * - Debugging (why did it fail?)
 * - Forum posting (share important conversations)
 * - CSV export (download conversation history)
 * - Cost tracking (how much are we spending?)
 *
 * Usage:
 *   const logger = new AIConversationLogger({ db });
 *
 *   // Before API call
 *   await logger.logConversation({
 *     service: 'openai',
 *     model: 'gpt-4',
 *     userPrompt: 'How do I fix this bug?',
 *     assistantResponse: 'Try running npm install',
 *     purpose: 'bug_diagnosis',
 *     contextSource: 'guardian'
 *   });
 */

const { getTimeService } = require('./time-service');

class AIConversationLogger {
  constructor(options = {}) {
    this.db = options.db;
    this.verbose = options.verbose || false;

    // Auto-post to forum settings
    this.autoPostToForum = options.autoPostToForum !== false;
    this.autoPostPurposes = options.autoPostPurposes || [
      'bug_diagnosis',
      'critical_error',
      'security_issue'
    ];

    // Cost estimation (USD per 1K tokens)
    this.costPerToken = {
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
      'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
      'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
      'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
      'claude-3-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
      'claude-3-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
      'mistral:7b': { input: 0, output: 0 }, // Local = free
      'llama2': { input: 0, output: 0 }
    };

    console.log('[AIConversationLogger] Initialized');
  }

  /**
   * Log a conversation
   *
   * @param {Object} conversation
   * @param {string} conversation.service - 'openai', 'anthropic', 'ollama', etc.
   * @param {string} conversation.model - 'gpt-4', 'claude-3-opus', etc.
   * @param {string} conversation.userPrompt - User's prompt
   * @param {string} conversation.assistantResponse - AI's response
   * @param {string} conversation.systemPrompt - System prompt (optional)
   * @param {Object} conversation.fullRequest - Full API request (optional)
   * @param {Object} conversation.fullResponse - Full API response (optional)
   * @param {number} conversation.promptTokens - Token count
   * @param {number} conversation.completionTokens - Token count
   * @param {number} conversation.latencyMs - Response time
   * @param {string} conversation.purpose - 'bug_diagnosis', 'lesson_help', 'chat', etc.
   * @param {string} conversation.contextSource - 'guardian', 'learning_engine', etc.
   * @param {string} conversation.relatedEntityType - 'bug_report', 'lesson', etc. (optional)
   * @param {string} conversation.relatedEntityId - ID of related entity (optional)
   * @param {string} conversation.endpoint - API endpoint (optional)
   * @param {string} conversation.status - 'completed', 'failed', 'timeout'
   * @param {string} conversation.errorMessage - Error if failed (optional)
   * @param {string} conversation.createdBy - Who initiated this (default: 'cal')
   * @returns {Promise<Object>} - Logged conversation record
   */
  async logConversation(conversation) {
    try {
      const timeService = getTimeService();

      const {
        service,
        model,
        userPrompt,
        assistantResponse,
        systemPrompt = null,
        fullRequest = null,
        fullResponse = null,
        promptTokens = null,
        completionTokens = null,
        latencyMs = null,
        purpose = 'general',
        contextSource = 'unknown',
        relatedEntityType = null,
        relatedEntityId = null,
        endpoint = null,
        status = 'completed',
        errorMessage = null,
        createdBy = 'cal'
      } = conversation;

      // Calculate total tokens
      const totalTokens = (promptTokens || 0) + (completionTokens || 0);

      // Estimate cost
      const estimatedCost = this.estimateCost(model, promptTokens, completionTokens);

      // Check for sensitive data
      const containsSensitiveData = this.detectSensitiveData(userPrompt, assistantResponse);

      // Insert into database
      const result = await this.db.query(
        `INSERT INTO ai_conversations (
          service,
          model,
          endpoint,
          user_prompt,
          system_prompt,
          assistant_response,
          full_request,
          full_response,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          latency_ms,
          purpose,
          context_source,
          related_entity_type,
          related_entity_id,
          status,
          error_message,
          contains_sensitive_data,
          created_by,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *`,
        [
          service,
          model,
          endpoint,
          userPrompt,
          systemPrompt,
          assistantResponse,
          fullRequest ? JSON.stringify(fullRequest) : null,
          fullResponse ? JSON.stringify(fullResponse) : null,
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCost,
          latencyMs,
          purpose,
          contextSource,
          relatedEntityType,
          relatedEntityId,
          status,
          errorMessage,
          containsSensitiveData,
          createdBy,
          timeService.now()
        ]
      );

      const record = result.rows[0];

      if (this.verbose) {
        console.log(`[AIConversationLogger] Logged ${service}/${model} conversation`);
        console.log(`  Purpose: ${purpose}`);
        console.log(`  Tokens: ${totalTokens} (~$${estimatedCost?.toFixed(4) || '0.0000'})`);
        console.log(`  ID: ${record.conversation_id}`);
      }

      // Auto-post to forum if important
      if (this.autoPostToForum && this.autoPostPurposes.includes(purpose) && !containsSensitiveData) {
        await this.postToForum(record);
      }

      return record;

    } catch (error) {
      console.error('[AIConversationLogger] Failed to log conversation:', error);
      throw error;
    }
  }

  /**
   * Estimate cost of API call
   */
  estimateCost(model, promptTokens, completionTokens) {
    // Normalize model name
    const modelKey = Object.keys(this.costPerToken).find(k => model.includes(k));

    if (!modelKey || !promptTokens || !completionTokens) {
      return null;
    }

    const costs = this.costPerToken[modelKey];
    const inputCost = promptTokens * costs.input;
    const outputCost = completionTokens * costs.output;

    return inputCost + outputCost;
  }

  /**
   * Detect sensitive data in prompts/responses
   * (Simple heuristic - can be improved)
   */
  detectSensitiveData(userPrompt, assistantResponse) {
    const combined = (userPrompt + ' ' + assistantResponse).toLowerCase();

    const sensitivePatterns = [
      /api[_-]?key/i,
      /secret/i,
      /password/i,
      /token/i,
      /credential/i,
      /private[_-]?key/i,
      /bearer /i,
      /sk-[a-zA-Z0-9]{20,}/i, // OpenAI key pattern
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/i // Email
    ];

    return sensitivePatterns.some(pattern => pattern.test(combined));
  }

  /**
   * Post conversation to content forum
   */
  async postToForum(conversationRecord) {
    try {
      const ContentForum = require('./content-forum');
      const forum = new ContentForum(this.db);

      const title = `[AI ${conversationRecord.purpose}] ${conversationRecord.model} - ${this.truncate(conversationRecord.user_prompt, 80)}`;

      const body = `**Model:** ${conversationRecord.service}/${conversationRecord.model}

**Purpose:** ${conversationRecord.purpose}
**Context:** ${conversationRecord.context_source}

---

**User Prompt:**
\`\`\`
${conversationRecord.user_prompt}
\`\`\`

**AI Response:**
\`\`\`
${conversationRecord.assistant_response}
\`\`\`

---

**Metadata:**
- Tokens: ${conversationRecord.total_tokens}
- Cost: $${conversationRecord.estimated_cost_usd?.toFixed(4) || '0.0000'}
- Latency: ${conversationRecord.latency_ms}ms
- Conversation ID: ${conversationRecord.conversation_id}
`;

      const thread = await forum.createThread({
        userId: 'cal',
        userName: 'Cal (AI System Admin)',
        title,
        body,
        tags: ['ai-conversation', conversationRecord.service, conversationRecord.purpose],
        flair: 'AI Log'
      });

      // Update conversation record with forum thread ID
      await this.db.query(
        `UPDATE ai_conversations
         SET posted_to_forum = TRUE, forum_thread_id = $1
         WHERE conversation_id = $2`,
        [thread.id, conversationRecord.conversation_id]
      );

      console.log(`[AIConversationLogger] Posted to forum: /forum/thread/${thread.id}`);

      return thread;

    } catch (error) {
      console.error('[AIConversationLogger] Failed to post to forum:', error);
      // Don't throw - forum posting is optional
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId) {
    const result = await this.db.query(
      'SELECT * FROM ai_conversations WHERE conversation_id = $1',
      [conversationId]
    );

    return result.rows[0];
  }

  /**
   * Get recent conversations
   */
  async getRecentConversations(limit = 50, options = {}) {
    let sql = 'SELECT * FROM ai_conversations';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (options.service) {
      conditions.push(`service = $${paramIndex++}`);
      params.push(options.service);
    }

    if (options.model) {
      conditions.push(`model = $${paramIndex++}`);
      params.push(options.model);
    }

    if (options.purpose) {
      conditions.push(`purpose = $${paramIndex++}`);
      params.push(options.purpose);
    }

    if (options.contextSource) {
      conditions.push(`context_source = $${paramIndex++}`);
      params.push(options.contextSource);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Get conversation stats
   */
  async getStats(options = {}) {
    let sql = 'SELECT * FROM ai_conversation_stats';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (options.service) {
      conditions.push(`service = $${paramIndex++}`);
      params.push(options.service);
    }

    if (options.model) {
      conditions.push(`model = $${paramIndex++}`);
      params.push(options.model);
    }

    if (options.purpose) {
      conditions.push(`purpose = $${paramIndex++}`);
      params.push(options.purpose);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Search conversations
   */
  async searchConversations(query, limit = 50) {
    const result = await this.db.query(
      `SELECT *,
              ts_rank(to_tsvector('english', user_prompt), plainto_tsquery('english', $1)) +
              ts_rank(to_tsvector('english', assistant_response), plainto_tsquery('english', $1)) as relevance
       FROM ai_conversations
       WHERE to_tsvector('english', user_prompt || ' ' || assistant_response) @@ plainto_tsquery('english', $1)
       ORDER BY relevance DESC, created_at DESC
       LIMIT $2`,
      [query, limit]
    );

    return result.rows;
  }

  /**
   * Helper: Truncate text
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = AIConversationLogger;
