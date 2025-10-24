/**
 * Unified Model Wrapper
 *
 * Single interface for ALL models (internal Ollama + external Claude/GPT):
 * - Internal models: Direct execution (fast, no API costs)
 * - External models: Rate-limited API calls
 * - Room-aware context management
 * - Session block integration
 *
 * Priority: Internal models execute first
 */

const axios = require('axios');
const OpenAI = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');

class ModelWrapper {
  constructor(options = {}) {
    this.db = options.db;
    this.sessionBlockManager = options.sessionBlockManager;
    this.broadcast = options.broadcast || (() => {});

    // Model configurations
    this.config = {
      ollamaUrl: options.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
      openaiKey: options.openaiKey || process.env.OPENAI_API_KEY,
      anthropicKey: options.anthropicKey || process.env.ANTHROPIC_API_KEY,
      deepseekKey: options.deepseekKey || process.env.DEEPSEEK_API_KEY,

      // Rate limiting
      externalRateLimitMs: options.externalRateLimitMs || 1000, // 1 req/sec for external APIs
      internalConcurrency: options.internalConcurrency || 5 // 5 concurrent internal
    };

    // Initialize API clients
    if (this.config.openaiKey) {
      this.openai = new OpenAI({ apiKey: this.config.openaiKey });
    }

    if (this.config.anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: this.config.anthropicKey });
    }

    // Rate limiting state
    this.lastExternalCall = 0;
    this.internalRunning = 0;

    console.log('[ModelWrapper] Initialized');
  }

  /**
   * Execute model request (unified interface)
   *
   * @param {object} request - Request configuration
   * @returns {Promise<object>} - Model response
   */
  async execute(request) {
    const {
      model,
      prompt,
      context = {},
      sessionBlock = null,
      roomId = null
    } = request;

    // Determine if internal or external
    const isInternal = this.isInternalModel(model);

    console.log(`[ModelWrapper] Executing ${model} (${isInternal ? 'INTERNAL' : 'external'})`);

    // Update session block status
    if (sessionBlock) {
      await this.sessionBlockManager.updateBlockStatus(sessionBlock.blockId, 'executing');
    }

    try {
      let result;

      if (isInternal) {
        // Internal: Direct to Ollama (FAST, priority)
        result = await this.executeInternal(model, prompt, context, roomId);
      } else {
        // External: Rate-limited API calls
        result = await this.executeExternal(model, prompt, context, roomId);
      }

      // Update session block with result
      if (sessionBlock) {
        await this.sessionBlockManager.updateBlockStatus(
          sessionBlock.blockId,
          'completed',
          { result }
        );
      }

      return result;

    } catch (error) {
      console.error(`[ModelWrapper] Execution error:`, error.message);

      // Update session block with error
      if (sessionBlock) {
        await this.sessionBlockManager.updateBlockStatus(
          sessionBlock.blockId,
          'failed',
          { error: error.message }
        );
      }

      throw error;
    }
  }

  /**
   * Execute internal Ollama model (FAST, no API costs)
   * @private
   */
  async executeInternal(model, prompt, context, roomId) {
    // Wait for available concurrency slot
    while (this.internalRunning >= this.config.internalConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.internalRunning++;

    try {
      // Extract Ollama model name (remove 'ollama:' prefix if present)
      const ollamaModel = model.replace(/^ollama:/i, '');

      // Build messages array for chat API
      const messages = [];

      // Add system message if provided
      if (context.systemPrompt) {
        messages.push({ role: 'system', content: context.systemPrompt });
      }

      // Add conversation history
      if (context.history && Array.isArray(context.history)) {
        messages.push(...context.history);
      }

      // Add room context to user message if available
      let userMessage = prompt;
      if (roomId && context.roomContext) {
        userMessage = `[Room: ${context.roomContext.name}]\n${prompt}`;
      }

      messages.push({ role: 'user', content: userMessage });

      // Call Ollama /api/chat (same API as DataSource for consistency)
      const response = await axios.post(
        `${this.config.ollamaUrl}/api/chat`,
        {
          model: ollamaModel,
          messages: messages,
          stream: false,
          options: {
            temperature: context.temperature || 0.7,
            top_p: context.top_p || 0.9,
            num_predict: context.max_tokens || 2000
          }
        },
        {
          timeout: 120000 // 2 minute timeout
        }
      );

      return {
        model: ollamaModel,
        response: response.data.message.content,
        source: 'ollama',
        internal: true,
        tokens: response.data.eval_count || null
      };

    } finally {
      this.internalRunning--;
    }
  }

  /**
   * Execute external API model (Claude, GPT, etc.)
   * @private
   */
  async executeExternal(model, prompt, context, roomId) {
    // Rate limiting: Wait if needed
    const now = Date.now();
    const timeSinceLastCall = now - this.lastExternalCall;
    if (timeSinceLastCall < this.config.externalRateLimitMs) {
      const waitTime = this.config.externalRateLimitMs - timeSinceLastCall;
      console.log(`[ModelWrapper] Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastExternalCall = Date.now();

    // Route to appropriate API
    if (model.includes('gpt') || model.includes('openai')) {
      return await this.executeOpenAI(model, prompt, context, roomId);
    } else if (model.includes('claude')) {
      return await this.executeClaude(model, prompt, context, roomId);
    } else if (model.includes('deepseek')) {
      return await this.executeDeepSeek(model, prompt, context, roomId);
    } else {
      throw new Error(`Unknown external model: ${model}`);
    }
  }

  /**
   * Execute OpenAI model
   * @private
   */
  async executeOpenAI(model, prompt, context, roomId) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const messages = [
      { role: 'system', content: context.systemPrompt || 'You are a helpful AI assistant.' }
    ];

    // Add conversation history
    if (context.history && Array.isArray(context.history)) {
      messages.push(...context.history);
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.openai.chat.completions.create({
      model: model.replace(/^openai:/i, '') || 'gpt-4',
      messages,
      temperature: context.temperature || 0.7,
      max_tokens: context.max_tokens || 1000
    });

    return {
      model: response.model,
      response: response.choices[0].message.content,
      source: 'openai',
      internal: false,
      tokens: response.usage.total_tokens
    };
  }

  /**
   * Execute Claude model
   * @private
   */
  async executeClaude(model, prompt, context, roomId) {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const messages = [];

    // Add conversation history
    if (context.history && Array.isArray(context.history)) {
      messages.push(...context.history.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })));
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.anthropic.messages.create({
      model: model.replace(/^claude:/i, '') || 'claude-3-sonnet-20240229',
      max_tokens: context.max_tokens || 1024,
      system: context.systemPrompt || 'You are a helpful AI assistant.',
      messages
    });

    return {
      model: response.model,
      response: response.content[0].text,
      source: 'anthropic',
      internal: false,
      tokens: response.usage.input_tokens + response.usage.output_tokens
    };
  }

  /**
   * Execute DeepSeek model
   * @private
   */
  async executeDeepSeek(model, prompt, context, roomId) {
    if (!this.config.deepseekKey) {
      throw new Error('DeepSeek API key not configured');
    }

    // DeepSeek uses OpenAI-compatible API
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: context.systemPrompt || 'You are a helpful AI assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: context.temperature || 0.7,
        max_tokens: context.max_tokens || 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.deepseekKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      model: 'deepseek-chat',
      response: response.data.choices[0].message.content,
      source: 'deepseek',
      internal: false,
      tokens: response.data.usage.total_tokens
    };
  }

  /**
   * Check if model is internal (Ollama)
   */
  isInternalModel(model) {
    const modelLower = model.toLowerCase();

    // Explicit ollama: prefix
    if (modelLower.startsWith('ollama:')) {
      return true;
    }

    // Known Ollama model families
    const ollamaModels = [
      'mistral',
      'llama',       // calos-model:latest, llama3, llama3.2
      'codellama',
      'phi',
      'qwen',        // qwen, qwen2.5-coder
      'deepseek-coder',
      'llava',       // vision model
      'nomic',       // embeddings
      'orca',
      'vicuna',
      'wizard',
      'neural-chat',
      'starling'
    ];

    // Check if model name contains any Ollama model family
    if (ollamaModels.some(m => modelLower.includes(m))) {
      return true;
    }

    // Custom model patterns (ends with -model or -expert)
    if (modelLower.endsWith('-model') || modelLower.endsWith('-expert')) {
      return true;
    }

    // External API patterns
    if (modelLower.includes('gpt') ||
        modelLower.includes('claude') ||
        modelLower.includes('openai') ||
        modelLower.includes('anthropic')) {
      return false;
    }

    // Default: assume internal if no explicit external markers
    // This allows custom Ollama models to work by default
    return true;
  }

  /**
   * Get model info
   */
  getModelInfo(model) {
    const isInternal = this.isInternalModel(model);

    return {
      model,
      isInternal,
      source: isInternal ? 'ollama' : this.getExternalSource(model),
      priority: isInternal ? 'high' : 'low', // Internal = high priority
      costPer1kTokens: isInternal ? 0 : this.getModelCost(model)
    };
  }

  /**
   * Get external source name
   * @private
   */
  getExternalSource(model) {
    if (model.includes('gpt') || model.includes('openai')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('deepseek')) return 'deepseek';
    return 'unknown';
  }

  /**
   * Get model cost estimate
   * @private
   */
  getModelCost(model) {
    // Rough estimates (USD per 1k tokens)
    if (model.includes('gpt-4')) return 0.03;
    if (model.includes('gpt-3.5')) return 0.002;
    if (model.includes('claude-3-opus')) return 0.015;
    if (model.includes('claude-3-sonnet')) return 0.003;
    if (model.includes('deepseek')) return 0.001;
    return 0;
  }

  /**
   * Get wrapper statistics
   */
  getStats() {
    return {
      internalRunning: this.internalRunning,
      internalConcurrency: this.config.internalConcurrency,
      lastExternalCall: this.lastExternalCall,
      rateLimitMs: this.config.externalRateLimitMs
    };
  }
}

module.exports = ModelWrapper;
