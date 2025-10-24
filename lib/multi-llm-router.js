/**
 * Multi-LLM Router
 *
 * Intelligently routes requests between multiple LLM providers:
 * - Claude Code (Local subscription - FREE)
 * - OpenAI (GPT-4, GPT-3.5)
 * - Anthropic (Claude 3 Opus, Sonnet - API)
 * - DeepSeek (DeepSeek Chat)
 * - Ollama (Local models: Llama, CodeLlama, Mistral)
 *
 * Features:
 * - Smart routing based on task type, cost, latency
 * - Automatic fallback if provider fails
 * - Load balancing across providers
 * - Usage tracking and analytics
 * - Soulfra cryptographic signing
 */

const ClaudeCodeAdapter = require('./provider-adapters/claude-code-adapter');
const OpenAIAdapter = require('./provider-adapters/openai-adapter');
const AnthropicAdapter = require('./provider-adapters/anthropic-adapter');
const DeepSeekAdapter = require('./provider-adapters/deepseek-adapter');
const OllamaAdapter = require('./provider-adapters/ollama-adapter');
const SoulfraSigner = require('./soulfra-signer');
const credentialProvider = require('./credential-provider');
const outputFormatter = require('./output-formatter');

class MultiLLMRouter {
  constructor(options = {}) {
    this.options = options;

    // Initialize Soulfra signer for request signing
    this.signer = options.signer || null;

    // Provider adapters
    this.providers = {
      'claude-code': new ClaudeCodeAdapter({
        enabled: options.claudeCodeEnabled !== false,
        defaultModel: 'claude-sonnet-4.5'
      }),
      openai: new OpenAIAdapter({
        apiKey: credentialProvider.getOpenAIKey(),
        enabled: options.openaiEnabled !== false
      }),
      anthropic: new AnthropicAdapter({
        apiKey: credentialProvider.getAnthropicKey(),
        enabled: options.anthropicEnabled !== false
      }),
      deepseek: new DeepSeekAdapter({
        apiKey: credentialProvider.getDeepSeekKey(),
        enabled: options.deepseekEnabled !== false
      }),
      ollama: new OllamaAdapter({
        baseURL: credentialProvider.getOllamaURL(),
        enabled: options.ollamaEnabled !== false
      })
    };

    // Routing configuration
    this.config = {
      strategy: options.strategy || 'smart', // 'smart', 'cheapest', 'fastest', 'best-quality'
      fallback: options.fallback !== false,
      loadBalance: options.loadBalance !== false,
      costOptimize: options.costOptimize !== false,
      maxRetries: options.maxRetries || 2
    };

    // Usage statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {}
    };

    // Initialize provider stats
    for (const provider of Object.keys(this.providers)) {
      this.stats.byProvider[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        tokens: 0,
        cost: 0,
        averageLatency: 0
      };
    }
  }

  /**
   * Route a completion request to the best provider
   *
   * @param {object} request - Completion request
   * @param {string} request.prompt - User prompt
   * @param {string} request.model - Preferred model (optional)
   * @param {string} request.taskType - Task type: 'code', 'creative', 'fact', 'reasoning'
   * @param {number} request.maxTokens - Max tokens to generate
   * @param {number} request.temperature - Temperature (0-2)
   * @param {string} request.preferredProvider - Force specific provider (optional)
   * @returns {Promise<object>} Completion response
   */
  async complete(request) {
    this.stats.totalRequests++;

    // Sign request with Soulfra if signer available
    const signedRequest = this.signer
      ? this.signer.createAuditEntry('llm_request', request)
      : { data: request };

    try {
      // Ensure taskType is set (infer if not provided)
      if (!request.taskType) {
        request.taskType = this._inferTaskType(request.prompt);
      }

      // Select provider based on strategy
      const provider = this._selectProvider(request);

      console.log(`[MultiLLMRouter] Routing to ${provider} for ${request.taskType} task (strategy: ${this.config.strategy})`);

      // Execute request
      const response = await this._executeRequest(provider, request);

      // Format output to remove PPT/slide artifacts and clean markdown
      const formattedText = outputFormatter.format(response.text, {
        removeArtifacts: true,
        cleanMarkdown: true,
        normalizeWhitespace: true,
        fixCodeBlocks: true
      });

      // Update statistics
      this._updateStats(provider, response, true);

      // Sign response with Soulfra
      const signedResponse = this.signer
        ? this.signer.createAuditEntry('llm_response', response)
        : { data: response };

      this.stats.successfulRequests++;

      return {
        ...response,
        text: formattedText, // Use formatted text instead of raw
        provider: provider,
        signedRequest: signedRequest,
        signedResponse: signedResponse
      };

    } catch (error) {
      console.error(`[MultiLLMRouter] Error:`, error.message);

      // Try fallback providers if enabled
      if (this.config.fallback) {
        return await this._fallback(request, error);
      }

      this.stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Stream a completion request
   *
   * @param {object} request - Completion request
   * @param {function} onChunk - Callback for each chunk
   * @returns {Promise<object>} Final response
   */
  async stream(request, onChunk) {
    const provider = this._selectProvider(request);

    console.log(`[MultiLLMRouter] Streaming from ${provider}`);

    try {
      const response = await this.providers[provider].stream(request, onChunk);

      // Format output to remove PPT/slide artifacts and clean markdown
      const formattedText = outputFormatter.format(response.text, {
        removeArtifacts: true,
        cleanMarkdown: true,
        normalizeWhitespace: true,
        fixCodeBlocks: true
      });

      this._updateStats(provider, response, true);
      this.stats.successfulRequests++;

      return {
        ...response,
        text: formattedText, // Use formatted text instead of raw
        provider: provider
      };

    } catch (error) {
      console.error(`[MultiLLMRouter] Stream error:`, error.message);

      if (this.config.fallback) {
        // Note: Fallback for streaming is limited (can't resume mid-stream)
        return await this._fallback(request, error);
      }

      this.stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Select the best provider for a request
   * @private
   */
  _selectProvider(request) {
    // Force specific provider if requested
    if (request.preferredProvider) {
      const provider = this.providers[request.preferredProvider];
      if (provider && provider.isAvailable()) {
        return request.preferredProvider;
      }
    }

    // Get available providers
    const available = Object.keys(this.providers).filter(name =>
      this.providers[name].isAvailable()
    );

    if (available.length === 0) {
      throw new Error('No LLM providers available');
    }

    // Select based on strategy
    switch (this.config.strategy) {
      case 'cheapest':
        return this._selectCheapest(available, request);

      case 'fastest':
        return this._selectFastest(available, request);

      case 'best-quality':
        return this._selectBestQuality(available, request);

      case 'smart':
      default:
        return this._selectSmart(available, request);
    }
  }

  /**
   * Smart selection based on task type
   * @private
   */
  _selectSmart(available, request) {
    const taskType = request.taskType || this._inferTaskType(request.prompt);

    switch (taskType) {
      case 'code':
        // Code tasks: Prefer local CodeLlama > GPT-4 > Claude
        if (available.includes('ollama') && request.prompt.length < 4000) {
          return 'ollama'; // Fast, free, good for code
        }
        if (available.includes('openai')) {
          return 'openai'; // GPT-4 excellent at code
        }
        if (available.includes('anthropic')) {
          return 'anthropic';
        }
        break;

      case 'creative':
        // Creative tasks: Claude > GPT-4 > DeepSeek
        if (available.includes('anthropic')) {
          return 'anthropic'; // Claude best for creative
        }
        if (available.includes('openai')) {
          return 'openai';
        }
        break;

      case 'reasoning':
        // Complex reasoning: DeepSeek Reasoner > GPT-4 > Claude
        if (available.includes('deepseek')) {
          return 'deepseek'; // DeepSeek Reasoner (thinking mode)
        }
        if (available.includes('openai')) {
          return 'openai'; // GPT-4 excellent at reasoning
        }
        if (available.includes('anthropic')) {
          return 'anthropic';
        }
        break;

      case 'fact':
      case 'simple':
        // Simple facts: Ollama > DeepSeek > GPT-3.5
        if (available.includes('ollama')) {
          return 'ollama'; // Free and fast
        }
        if (available.includes('deepseek')) {
          return 'deepseek'; // Very cheap
        }
        if (available.includes('openai')) {
          return 'openai';
        }
        break;

      case 'cryptography':
        // Cryptography & identity: Ollama soulfra-model (specialized)
        if (available.includes('ollama')) {
          return 'ollama'; // soulfra-model specialized for crypto
        }
        if (available.includes('openai')) {
          return 'openai'; // GPT-4 good at crypto
        }
        break;

      case 'data':
        // Data processing: Ollama deathtodata-model > DeepSeek
        if (available.includes('ollama')) {
          return 'ollama'; // deathtodata-model specialized for ETL
        }
        if (available.includes('deepseek')) {
          return 'deepseek'; // Good at data processing
        }
        break;

      case 'publishing':
        // Publishing & documentation: Ollama publishing-model
        if (available.includes('ollama')) {
          return 'ollama'; // publishing-model specialized for docs
        }
        if (available.includes('anthropic')) {
          return 'anthropic'; // Claude good at writing
        }
        break;

      case 'calos':
        // CalOS platform: Ollama calos-model (specialized)
        if (available.includes('ollama')) {
          return 'ollama'; // calos-model knows CalOS architecture
        }
        break;

      case 'whimsical':
        // Whimsical & creative: Ollama drseuss-model > Claude
        if (available.includes('ollama')) {
          return 'ollama'; // drseuss-model for whimsical content
        }
        if (available.includes('anthropic')) {
          return 'anthropic'; // Claude creative
        }
        break;
    }

    // Default: Use first available
    return available[0];
  }

  /**
   * Select cheapest provider
   * @private
   */
  _selectCheapest(available, request) {
    const costs = {
      ollama: 0,        // Free (local)
      deepseek: 0.14,   // $0.14 per 1M tokens
      openai: 3.00,     // $3.00 per 1M tokens (GPT-3.5)
      anthropic: 15.00  // $15.00 per 1M tokens (Claude Sonnet)
    };

    const sorted = available.sort((a, b) => costs[a] - costs[b]);
    return sorted[0];
  }

  /**
   * Select fastest provider
   * @private
   */
  _selectFastest(available, request) {
    // Use latency statistics
    const sorted = available.sort((a, b) => {
      const latencyA = this.stats.byProvider[a].averageLatency || 1000;
      const latencyB = this.stats.byProvider[b].averageLatency || 1000;
      return latencyA - latencyB;
    });

    return sorted[0];
  }

  /**
   * Select best quality provider
   * @private
   */
  _selectBestQuality(available, request) {
    // Quality ranking (subjective)
    const quality = {
      anthropic: 4, // Claude Opus best
      openai: 3,    // GPT-4 excellent
      deepseek: 2,  // DeepSeek good
      ollama: 1     // Ollama decent
    };

    const sorted = available.sort((a, b) => quality[b] - quality[a]);
    return sorted[0];
  }

  /**
   * Infer task type from prompt
   * @private
   */
  _inferTaskType(prompt) {
    const lower = prompt.toLowerCase();

    // Cryptography keywords
    if (
      lower.includes('cryptograph') ||
      lower.includes('encrypt') ||
      lower.includes('signature') ||
      lower.includes('ed25519') ||
      lower.includes('soulfra') ||
      lower.includes('zero-knowledge') ||
      lower.includes('proof-of-work') ||
      lower.includes('identity')
    ) {
      return 'cryptography';
    }

    // Data processing keywords
    if (
      lower.includes('csv') ||
      lower.includes('parse') ||
      lower.includes('etl') ||
      lower.includes('transform') ||
      lower.includes('data') && (lower.includes('clean') || lower.includes('process')) ||
      lower.includes('enum') ||
      lower.includes('array') ||
      lower.includes('import') ||
      lower.includes('export')
    ) {
      return 'data';
    }

    // Publishing keywords
    if (
      lower.includes('document') ||
      lower.includes('readme') ||
      lower.includes('markdown') ||
      lower.includes('api documentation') ||
      lower.includes('tutorial') ||
      lower.includes('guide')
    ) {
      return 'publishing';
    }

    // CalOS keywords
    if (
      lower.includes('calos') ||
      lower.includes('skill') && lower.includes('xp') ||
      lower.includes('action') && lower.includes('effect') ||
      lower.includes('gamification') ||
      lower.includes('progression')
    ) {
      return 'calos';
    }

    // Whimsical keywords
    if (
      lower.includes('whimsical') ||
      lower.includes('dr seuss') ||
      lower.includes('dr. seuss') ||
      lower.includes('playful') ||
      (lower.includes('fun') && (lower.includes('explain') || lower.includes('explanation')))
    ) {
      return 'whimsical';
    }

    // Code-related keywords
    if (
      lower.includes('code') ||
      lower.includes('function') ||
      lower.includes('debug') ||
      lower.includes('implement') ||
      lower.includes('```')
    ) {
      return 'code';
    }

    // Creative keywords
    if (
      lower.includes('write') ||
      lower.includes('story') ||
      lower.includes('creative') ||
      lower.includes('poem') ||
      lower.includes('blog')
    ) {
      return 'creative';
    }

    // Reasoning keywords
    if (
      lower.includes('analyze') ||
      lower.includes('explain') ||
      lower.includes('why') ||
      lower.includes('how') ||
      lower.includes('compare')
    ) {
      return 'reasoning';
    }

    // Fact keywords
    if (
      lower.includes('what is') ||
      lower.includes('define') ||
      lower.includes('who is') ||
      lower.includes('when did')
    ) {
      return 'fact';
    }

    return 'simple';
  }

  /**
   * Execute request on specific provider
   * @private
   */
  async _executeRequest(providerName, request) {
    const provider = this.providers[providerName];

    const startTime = Date.now();

    try {
      const response = await provider.complete(request);

      const latency = Date.now() - startTime;
      response.latency = latency;

      return response;

    } catch (error) {
      const latency = Date.now() - startTime;
      this._updateStats(providerName, { latency }, false);

      throw new Error(`${providerName} error: ${error.message}`);
    }
  }

  /**
   * Fallback to other providers if primary fails
   * @private
   */
  async _fallback(request, originalError) {
    console.warn(`[MultiLLMRouter] Attempting fallback after error: ${originalError.message}`);

    const available = Object.keys(this.providers).filter(name =>
      this.providers[name].isAvailable()
    );

    // Try each provider in order
    for (const provider of available) {
      try {
        console.log(`[MultiLLMRouter] Fallback to ${provider}`);

        const response = await this._executeRequest(provider, request);

        // Format output to remove PPT/slide artifacts and clean markdown
        const formattedText = outputFormatter.format(response.text, {
          removeArtifacts: true,
          cleanMarkdown: true,
          normalizeWhitespace: true,
          fixCodeBlocks: true
        });

        this._updateStats(provider, response, true);
        this.stats.successfulRequests++;

        return {
          ...response,
          text: formattedText, // Use formatted text instead of raw
          provider: provider,
          fallback: true,
          originalError: originalError.message
        };

      } catch (error) {
        console.error(`[MultiLLMRouter] Fallback ${provider} failed:`, error.message);
        // Continue to next provider
      }
    }

    // All fallbacks failed
    this.stats.failedRequests++;
    throw new Error(`All providers failed. Last error: ${originalError.message}`);
  }

  /**
   * Update usage statistics
   * @private
   */
  _updateStats(provider, response, success) {
    const providerStats = this.stats.byProvider[provider];

    providerStats.requests++;

    if (success) {
      providerStats.successes++;

      if (response.usage) {
        const tokens = response.usage.total_tokens || 0;
        providerStats.tokens += tokens;
        this.stats.totalTokens += tokens;

        // Calculate cost (approximate)
        const cost = this._estimateCost(provider, tokens);
        providerStats.cost += cost;
        this.stats.totalCost += cost;
      }

      if (response.latency) {
        // Update average latency
        const totalLatency = providerStats.averageLatency * (providerStats.successes - 1) + response.latency;
        providerStats.averageLatency = Math.round(totalLatency / providerStats.successes);
      }

    } else {
      providerStats.failures++;
    }
  }

  /**
   * Estimate cost for a request
   * @private
   */
  _estimateCost(provider, tokens) {
    const costPer1MTokens = {
      openai: 3.00,      // GPT-3.5 avg
      anthropic: 15.00,  // Claude Sonnet avg
      deepseek: 0.14,    // DeepSeek
      ollama: 0          // Local (free)
    };

    const cost = (costPer1MTokens[provider] || 0) * (tokens / 1000000);
    return cost;
  }

  /**
   * Get usage statistics
   */
  getStats() {
    return {
      ...this.stats,
      config: this.config,
      providers: Object.keys(this.providers).map(name => ({
        name,
        available: this.providers[name].isAvailable(),
        ...this.stats.byProvider[name]
      }))
    };
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Object.keys(this.providers)
      .filter(name => this.providers[name].isAvailable())
      .map(name => ({
        name,
        models: this.providers[name].getModels(),
        stats: this.stats.byProvider[name]
      }));
  }

  /**
   * Test all providers
   */
  async testAll() {
    const results = {};

    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        console.log(`[MultiLLMRouter] Testing ${name}...`);

        const response = await provider.complete({
          prompt: 'Say "Hello" and nothing else.',
          maxTokens: 10
        });

        results[name] = {
          success: true,
          response: response.text,
          latency: response.latency
        };

        console.log(`✓ ${name}: ${response.text}`);

      } catch (error) {
        results[name] = {
          success: false,
          error: error.message
        };

        console.error(`✗ ${name}: ${error.message}`);
      }
    }

    return results;
  }
}

module.exports = MultiLLMRouter;
