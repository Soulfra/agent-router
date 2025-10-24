/**
 * Multi-Provider Router Service
 *
 * Universal router for Ollama, OpenAI, Anthropic, and DeepSeek
 * Tracks provider-specific tokens, costs, and metadata
 * Answers: "which tokens came from each provider?"
 */

const axios = require('axios');

class MultiProviderRouter {
  constructor(options = {}) {
    // Support both old (db) and new ({ db, vaultBridge }) signatures
    if (options.db) {
      this.db = options.db;
      this.vaultBridge = options.vaultBridge || null;
    } else {
      // Legacy: constructor(db) - for backwards compatibility
      this.db = options;
      this.vaultBridge = null;
    }

    if (this.vaultBridge) {
      console.log('[MultiProviderRouter] VaultBridge enabled - Hybrid BYOK active (user keys + platform keys)');
    } else {
      console.log('[MultiProviderRouter] VaultBridge not available - Using .env keys only');
    }
  }

  /**
   * Route request to appropriate provider
   *
   * @param {Object} options - Routing options
   * @param {string} options.provider - Provider name (ollama, openai, anthropic, deepseek)
   * @param {string} options.model - Model name
   * @param {string} options.prompt - User prompt
   * @param {Object} options.metadata - Additional metadata (user_id, tenant_id, etc.)
   * @returns {Promise<Object>} Provider response with usage tracking
   */
  async route(options) {
    const { provider, model, prompt, metadata = {} } = options;

    console.log(`[MultiProviderRouter] Routing to ${provider}/${model}`);

    switch (provider.toLowerCase()) {
      case 'ollama':
        return this.routeOllama({ model, prompt, metadata });
      case 'openai':
        return this.routeOpenAI({ model, prompt, metadata });
      case 'anthropic':
        return this.routeAnthropic({ model, prompt, metadata });
      case 'deepseek':
        return this.routeDeepSeek({ model, prompt, metadata });
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Route to Ollama (local self-hosted)
   */
  async routeOllama({ model, prompt, metadata }) {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

    try {
      const response = await axios.post(`${ollamaUrl}/api/generate`, {
        model: model.replace('ollama:', ''),
        prompt,
        stream: false
      }, {
        timeout: 120000 // 2 minute timeout
      });

      const inputTokens = Math.floor(prompt.length / 4); // Rough estimate
      const outputTokens = response.data.eval_count || 0;

      return {
        provider: 'ollama',
        model,
        success: true,
        response: response.data.response,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        },
        cost_usd: 0, // Ollama is free (self-hosted)
        provider_metadata: {
          model_version: response.data.model || model,
          eval_count: response.data.eval_count,
          eval_duration: response.data.eval_duration,
          load_duration: response.data.load_duration,
          total_duration: response.data.total_duration
        },
        provider_model_id: response.data.model || model,
        provider_request_id: null, // Ollama doesn't provide request IDs
        latency_ms: response.data.total_duration
          ? Math.floor(response.data.total_duration / 1000000) // Convert nanoseconds to ms
          : null
      };
    } catch (error) {
      console.error('[MultiProviderRouter] Ollama error:', error.message);
      throw new Error(`Ollama error: ${error.message}`);
    }
  }

  /**
   * Route to OpenAI
   */
  async routeOpenAI({ model, prompt, metadata }) {
    // Get API key via VaultBridge (3-tier fallback: user → system → error)
    let apiKey;
    let keySource = 'env'; // Track where key came from

    if (this.vaultBridge) {
      try {
        const keyData = await this.vaultBridge.getKey('openai', {
          userId: metadata.userId,
          tenantId: metadata.tenantId,
          sessionId: metadata.sessionId
        });
        apiKey = keyData.key;
        keySource = keyData.source; // 'tenant_byok', 'user_key', or 'system_key'
        console.log(`[MultiProviderRouter] Using ${keySource} for OpenAI`);
      } catch (error) {
        throw new Error(`OpenAI API key not available: ${error.message}`);
      }
    } else {
      // Fallback to process.env if VaultBridge not available
      apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable not set');
      }
    }

    const startTime = Date.now();

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.data.usage;
      const cost = await this.calculateCost('openai', model, usage.prompt_tokens, usage.completion_tokens);

      return {
        provider: 'openai',
        model,
        success: true,
        response: response.data.choices[0].message.content,
        usage: {
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens
        },
        cost_usd: cost,
        key_source: keySource, // Which key was used: tenant_byok, user_key, system_key, or env
        provider_metadata: {
          finish_reason: response.data.choices[0].finish_reason,
          system_fingerprint: response.data.system_fingerprint,
          model_version: response.data.model
        },
        provider_model_id: response.data.model,
        provider_request_id: response.data.id,
        latency_ms: latencyMs
      };
    } catch (error) {
      console.error('[MultiProviderRouter] OpenAI error:', error.response?.data || error.message);
      throw new Error(`OpenAI error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Route to Anthropic
   */
  async routeAnthropic({ model, prompt, metadata }) {
    // Get API key via VaultBridge (3-tier fallback: user → system → error)
    let apiKey;
    let keySource = 'env';

    if (this.vaultBridge) {
      try {
        const keyData = await this.vaultBridge.getKey('anthropic', {
          userId: metadata.userId,
          tenantId: metadata.tenantId,
          sessionId: metadata.sessionId
        });
        apiKey = keyData.key;
        keySource = keyData.source;
        console.log(`[MultiProviderRouter] Using ${keySource} for Anthropic`);
      } catch (error) {
        throw new Error(`Anthropic API key not available: ${error.message}`);
      }
    } else {
      apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable not set');
      }
    }

    const startTime = Date.now();

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096
      }, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.data.usage;
      const cost = await this.calculateCost('anthropic', model, usage.input_tokens, usage.output_tokens);

      return {
        provider: 'anthropic',
        model,
        success: true,
        response: response.data.content[0].text,
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          total_tokens: usage.input_tokens + usage.output_tokens
        },
        cost_usd: cost,
        key_source: keySource,
        provider_metadata: {
          stop_reason: response.data.stop_reason,
          stop_sequence: response.data.stop_sequence,
          model_version: response.data.model
        },
        provider_model_id: response.data.model,
        provider_request_id: response.data.id,
        latency_ms: latencyMs
      };
    } catch (error) {
      console.error('[MultiProviderRouter] Anthropic error:', error.response?.data || error.message);
      throw new Error(`Anthropic error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Route to DeepSeek
   */
  async routeDeepSeek({ model, prompt, metadata }) {
    // Get API key via VaultBridge (3-tier fallback: user → system → error)
    let apiKey;
    let keySource = 'env';

    if (this.vaultBridge) {
      try {
        const keyData = await this.vaultBridge.getKey('deepseek', {
          userId: metadata.userId,
          tenantId: metadata.tenantId,
          sessionId: metadata.sessionId
        });
        apiKey = keyData.key;
        keySource = keyData.source;
        console.log(`[MultiProviderRouter] Using ${keySource} for DeepSeek`);
      } catch (error) {
        throw new Error(`DeepSeek API key not available: ${error.message}`);
      }
    } else {
      apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY environment variable not set');
      }
    }

    const startTime = Date.now();

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.data.usage;
      const cost = await this.calculateCost('deepseek', model, usage.prompt_tokens, usage.completion_tokens);

      return {
        provider: 'deepseek',
        model,
        success: true,
        response: response.data.choices[0].message.content,
        usage: {
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens
        },
        cost_usd: cost,
        key_source: keySource,
        provider_metadata: {
          finish_reason: response.data.choices[0].finish_reason,
          model_version: response.data.model
        },
        provider_model_id: response.data.model,
        provider_request_id: response.data.id,
        latency_ms: latencyMs
      };
    } catch (error) {
      console.error('[MultiProviderRouter] DeepSeek error:', error.response?.data || error.message);
      throw new Error(`DeepSeek error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Calculate cost using provider_costs table
   */
  async calculateCost(provider, model, inputTokens, outputTokens) {
    try {
      const result = await this.db.query(
        'SELECT calculate_provider_cost($1, $2, $3, $4) AS cost',
        [provider, model, inputTokens, outputTokens]
      );

      return parseFloat(result.rows[0].cost) || 0;
    } catch (error) {
      console.warn(`[MultiProviderRouter] Cost calculation failed: ${error.message}`);
      return 0; // Default to 0 if cost calculation fails
    }
  }

  /**
   * Get provider usage statistics
   */
  async getProviderStats() {
    try {
      const result = await this.db.query('SELECT * FROM provider_usage_breakdown');
      return result.rows;
    } catch (error) {
      console.error('[MultiProviderRouter] Error fetching provider stats:', error);
      throw error;
    }
  }

  /**
   * Get user's provider preferences
   */
  async getUserProviderPreferences(userId) {
    try {
      const result = await this.db.query(
        'SELECT * FROM user_provider_preferences WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('[MultiProviderRouter] Error fetching user preferences:', error);
      throw error;
    }
  }
}

module.exports = MultiProviderRouter;
