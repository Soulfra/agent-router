/**
 * LLM Proxy Routes
 *
 * User-authenticated LLM endpoints that route requests through MultiLLMRouter.
 * Users authenticate with API keys (Bearer tokens) and can query any LLM.
 *
 * Endpoints:
 * - POST /api/llm/chat           - Chat completion (streaming + non-streaming)
 * - POST /api/llm/completion     - Text completion
 * - GET  /api/llm/models         - List available models
 * - GET  /api/llm/usage          - Get user's usage stats
 *
 * Authentication:
 * - All endpoints require valid API key (Bearer token)
 * - See middleware/validate-api-key.js
 *
 * Features:
 * - Automatic provider selection (smart routing)
 * - Custom branding (if user has brand configured)
 * - Usage tracking and billing
 * - Rate limiting (enforced by validate-api-key middleware)
 * - Streaming support
 *
 * Usage:
 *   curl -X POST http://localhost:5001/api/llm/chat \
 *     -H "Authorization: Bearer calos_sk_abc123..." \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "messages": [{"role": "user", "content": "Hello!"}],
 *       "model": "gpt-4",
 *       "stream": false
 *     }'
 */

const express = require('express');
const router = express.Router();
const ApiKeyValidator = require('../middleware/validate-api-key');
const MultiLLMRouter = require('../lib/multi-llm-router');

/**
 * Initialize LLM router and API key validator
 * (These will be attached to router when mounted)
 */
function createLLMProxyRouter(db, config = {}) {
  const validator = new ApiKeyValidator({ db, verbose: config.verbose });
  const llmRouter = new MultiLLMRouter(config.llm || {});

  // Apply API key validation to all routes
  router.use(validator.middleware());

  /**
   * POST /api/llm/chat
   * Chat completion endpoint (OpenAI-compatible)
   *
   * Body:
   *   {
   *     "messages": [
   *       {"role": "system", "content": "You are a helpful assistant"},
   *       {"role": "user", "content": "Hello!"}
   *     ],
   *     "model": "gpt-4",           // Optional: auto-select if not provided
   *     "temperature": 0.7,         // Optional: default 0.7
   *     "max_tokens": 2000,         // Optional: default 2000
   *     "stream": false,            // Optional: streaming (default false)
   *     "taskType": "reasoning"     // Optional: helps router select provider
   *   }
   *
   * Response (non-streaming):
   *   {
   *     "id": "chat-uuid",
   *     "object": "chat.completion",
   *     "created": 1234567890,
   *     "model": "gpt-4",
   *     "provider": "openai",
   *     "choices": [
   *       {
   *         "index": 0,
   *         "message": {
   *           "role": "assistant",
   *           "content": "Hello! How can I help you?"
   *         },
   *         "finish_reason": "stop"
   *       }
   *     ],
   *     "usage": {
   *       "prompt_tokens": 12,
   *       "completion_tokens": 8,
   *       "total_tokens": 20
   *     },
   *     "cost": {
   *       "estimated_usd": 0.0012
   *     }
   *   }
   */
  router.post('/chat', async (req, res) => {
    const { userId, apiKeyId } = req.user;

    try {
      const {
        messages,
        model,
        temperature = 0.7,
        max_tokens = 2000,
        stream = false,
        taskType = 'general'
      } = req.body;

      // Validate required fields
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'messages array is required'
        });
      }

      // Build prompt from messages
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

      // Route request through MultiLLMRouter
      const startTime = Date.now();
      const response = await llmRouter.complete({
        prompt,
        model: model || undefined, // Let router auto-select if not specified
        taskType,
        maxTokens: max_tokens,
        temperature,
        preferredProvider: req.body.provider // Optional override
      });

      const latencyMs = Date.now() - startTime;

      // Log usage to database
      await db.query(`
        INSERT INTO user_llm_usage (
          user_id,
          api_key_id,
          provider,
          model,
          endpoint,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          latency_ms,
          task_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        userId,
        apiKeyId,
        response.provider,
        response.model,
        'chat',
        response.usage?.promptTokens || 0,
        response.usage?.completionTokens || 0,
        response.usage?.totalTokens || 0,
        response.cost?.estimatedUSD || 0,
        latencyMs,
        taskType
      ]);

      // Apply custom branding if configured
      let content = response.text;
      if (req.user.brandConfig) {
        content = applyBranding(content, req.user.brandConfig);
      }

      // Return OpenAI-compatible response
      res.json({
        id: `chat-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        provider: response.provider,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: response.usage?.promptTokens || 0,
          completion_tokens: response.usage?.completionTokens || 0,
          total_tokens: response.usage?.totalTokens || 0
        },
        cost: {
          estimated_usd: response.cost?.estimatedUSD || 0
        },
        latency_ms: latencyMs
      });

    } catch (error) {
      console.error('[LLMProxyRoutes] Chat error:', error.message);

      // Check if it's a provider error
      if (error.provider) {
        return res.status(502).json({
          error: 'Bad Gateway',
          message: `LLM provider error: ${error.message}`,
          provider: error.provider
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process chat request'
      });
    }
  });

  /**
   * POST /api/llm/completion
   * Simple text completion
   *
   * Body:
   *   {
   *     "prompt": "Once upon a time",
   *     "model": "gpt-3.5-turbo",
   *     "max_tokens": 100
   *   }
   *
   * Response:
   *   {
   *     "id": "completion-uuid",
   *     "text": "... generated text ...",
   *     "model": "gpt-3.5-turbo",
   *     "provider": "openai",
   *     "usage": { ... },
   *     "cost": { ... }
   *   }
   */
  router.post('/completion', async (req, res) => {
    const { userId, apiKeyId } = req.user;

    try {
      const {
        prompt,
        model,
        max_tokens = 1000,
        temperature = 0.7,
        taskType = 'general'
      } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'prompt is required'
        });
      }

      const startTime = Date.now();
      const response = await llmRouter.complete({
        prompt,
        model,
        taskType,
        maxTokens: max_tokens,
        temperature
      });

      const latencyMs = Date.now() - startTime;

      // Log usage
      await db.query(`
        INSERT INTO user_llm_usage (
          user_id, api_key_id, provider, model, endpoint,
          prompt_tokens, completion_tokens, total_tokens,
          estimated_cost_usd, latency_ms, task_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        userId,
        apiKeyId,
        response.provider,
        response.model,
        'completion',
        response.usage?.promptTokens || 0,
        response.usage?.completionTokens || 0,
        response.usage?.totalTokens || 0,
        response.cost?.estimatedUSD || 0,
        latencyMs,
        taskType
      ]);

      res.json({
        id: `completion-${Date.now()}`,
        text: response.text,
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        cost: response.cost,
        latency_ms: latencyMs
      });

    } catch (error) {
      console.error('[LLMProxyRoutes] Completion error:', error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process completion request'
      });
    }
  });

  /**
   * GET /api/llm/models
   * List available models
   *
   * Response:
   *   {
   *     "models": [
   *       {
   *         "id": "gpt-4",
   *         "provider": "openai",
   *         "name": "GPT-4",
   *         "contextWindow": 8192,
   *         "costPer1kTokens": { "prompt": 0.03, "completion": 0.06 }
   *       },
   *       ...
   *     ]
   *   }
   */
  router.get('/models', async (req, res) => {
    try {
      const models = [
        // OpenAI
        {
          id: 'gpt-4',
          provider: 'openai',
          name: 'GPT-4',
          contextWindow: 8192,
          costPer1kTokens: { prompt: 0.03, completion: 0.06 }
        },
        {
          id: 'gpt-3.5-turbo',
          provider: 'openai',
          name: 'GPT-3.5 Turbo',
          contextWindow: 4096,
          costPer1kTokens: { prompt: 0.0015, completion: 0.002 }
        },
        // Anthropic
        {
          id: 'claude-3-opus',
          provider: 'anthropic',
          name: 'Claude 3 Opus',
          contextWindow: 200000,
          costPer1kTokens: { prompt: 0.015, completion: 0.075 }
        },
        {
          id: 'claude-3-sonnet',
          provider: 'anthropic',
          name: 'Claude 3 Sonnet',
          contextWindow: 200000,
          costPer1kTokens: { prompt: 0.003, completion: 0.015 }
        },
        // DeepSeek
        {
          id: 'deepseek-chat',
          provider: 'deepseek',
          name: 'DeepSeek Chat',
          contextWindow: 32768,
          costPer1kTokens: { prompt: 0.0014, completion: 0.0028 }
        },
        // Ollama (local - free)
        {
          id: 'llama2',
          provider: 'ollama',
          name: 'Llama 2 (Local)',
          contextWindow: 4096,
          costPer1kTokens: { prompt: 0, completion: 0 }
        },
        {
          id: 'mistral',
          provider: 'ollama',
          name: 'Mistral (Local)',
          contextWindow: 8192,
          costPer1kTokens: { prompt: 0, completion: 0 }
        }
      ];

      res.json({ models });

    } catch (error) {
      console.error('[LLMProxyRoutes] List models error:', error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list models'
      });
    }
  });

  /**
   * GET /api/llm/usage
   * Get user's LLM usage statistics
   *
   * Query params:
   *   ?days=7  // Last N days (default: 7)
   *
   * Response:
   *   {
   *     "userId": "uuid",
   *     "period": { "start": "...", "end": "..." },
   *     "totalRequests": 123,
   *     "totalTokens": 45678,
   *     "totalCost": 12.34,
   *     "byProvider": { ... },
   *     "byModel": { ... },
   *     "byDay": [ ... ]
   *   }
   */
  router.get('/usage', async (req, res) => {
    const { userId } = req.user;
    const days = parseInt(req.query.days || 7);

    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const result = await db.query(`
        SELECT
          DATE(created_at) as date,
          provider,
          model,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(estimated_cost_usd) as cost
        FROM user_llm_usage
        WHERE user_id = $1 AND created_at > $2
        GROUP BY DATE(created_at), provider, model
        ORDER BY date DESC
      `, [userId, startDate]);

      // Aggregate data
      const byDay = {};
      const byProvider = {};
      const byModel = {};
      let totalRequests = 0;
      let totalTokens = 0;
      let totalCost = 0;

      for (const row of result.rows) {
        const date = row.date.toISOString().split('T')[0];
        const provider = row.provider;
        const model = row.model;
        const requests = parseInt(row.requests);
        const tokens = parseInt(row.tokens || 0);
        const cost = parseFloat(row.cost || 0);

        // By day
        if (!byDay[date]) {
          byDay[date] = { date, requests: 0, tokens: 0, cost: 0 };
        }
        byDay[date].requests += requests;
        byDay[date].tokens += tokens;
        byDay[date].cost += cost;

        // By provider
        if (!byProvider[provider]) {
          byProvider[provider] = { requests: 0, tokens: 0, cost: 0 };
        }
        byProvider[provider].requests += requests;
        byProvider[provider].tokens += tokens;
        byProvider[provider].cost += cost;

        // By model
        if (!byModel[model]) {
          byModel[model] = { requests: 0, tokens: 0, cost: 0 };
        }
        byModel[model].requests += requests;
        byModel[model].tokens += tokens;
        byModel[model].cost += cost;

        // Totals
        totalRequests += requests;
        totalTokens += tokens;
        totalCost += cost;
      }

      res.json({
        userId,
        period: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
          days
        },
        totalRequests,
        totalTokens,
        totalCost: totalCost.toFixed(4),
        byProvider,
        byModel,
        byDay: Object.values(byDay)
      });

    } catch (error) {
      console.error('[LLMProxyRoutes] Usage error:', error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get usage statistics'
      });
    }
  });

  return router;
}

/**
 * Apply custom branding to LLM response
 * (Inject logo, signature, etc.)
 *
 * @param {string} content - LLM response text
 * @param {Object} brandConfig - User's brand configuration
 * @returns {string} Branded content
 */
function applyBranding(content, brandConfig) {
  if (!brandConfig || !brandConfig.enabled) {
    return content;
  }

  let branded = content;

  // Add signature at the end
  if (brandConfig.signature) {
    branded += `\n\n---\n${brandConfig.signature}`;
  }

  // Add watermark
  if (brandConfig.watermark) {
    branded += `\n\n_Powered by ${brandConfig.watermark}_`;
  }

  return branded;
}

module.exports = createLLMProxyRouter;
