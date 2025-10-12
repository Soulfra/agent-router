/**
 * Anthropic Provider Adapter
 * Supports: Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
 */

const Anthropic = require('@anthropic-ai/sdk');

class AnthropicAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.enabled = options.enabled !== false;
    this.defaultModel = options.defaultModel || 'claude-3-5-sonnet-20241022';

    // Initialize client if API key available
    if (this.apiKey) {
      this.client = new Anthropic({
        apiKey: this.apiKey
      });
    }
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return this.enabled && !!this.apiKey && !!this.client;
  }

  /**
   * Get available models
   */
  getModels() {
    return [
      { name: 'claude-3-opus-20240229', contextWindow: 200000, cost: 0.015 },
      { name: 'claude-3-5-sonnet-20241022', contextWindow: 200000, cost: 0.003 },
      { name: 'claude-3-haiku-20240307', contextWindow: 200000, cost: 0.00025 }
    ];
  }

  /**
   * Complete a prompt
   *
   * @param {object} request - Completion request
   * @returns {Promise<object>} Completion response
   */
  async complete(request) {
    if (!this.isAvailable()) {
      throw new Error('Anthropic provider not available');
    }

    const model = request.model || this.defaultModel;
    const maxTokens = request.maxTokens || 1000;
    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: this._formatMessages(request),
        ...(request.systemPrompt ? { system: request.systemPrompt } : {})
      });

      const latency = Date.now() - startTime;

      return {
        text: response.content[0].text,
        model: response.model,
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        },
        finishReason: response.stop_reason,
        latency: latency
      };

    } catch (error) {
      if (error.status === 401) {
        throw new Error('Anthropic API key invalid');
      } else if (error.status === 429) {
        throw new Error('Anthropic rate limit exceeded');
      } else if (error.status === 529) {
        throw new Error('Anthropic service overloaded');
      } else {
        throw new Error(`Anthropic error: ${error.message}`);
      }
    }
  }

  /**
   * Stream a completion
   *
   * @param {object} request - Completion request
   * @param {function} onChunk - Callback for each chunk
   * @returns {Promise<object>} Final response
   */
  async stream(request, onChunk) {
    if (!this.isAvailable()) {
      throw new Error('Anthropic provider not available');
    }

    const model = request.model || this.defaultModel;
    const maxTokens = request.maxTokens || 1000;
    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();
      let fullText = '';
      let usage = null;

      const stream = await this.client.messages.stream({
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: this._formatMessages(request),
        ...(request.systemPrompt ? { system: request.systemPrompt } : {})
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const delta = event.delta.text;
          fullText += delta;
          if (onChunk) {
            onChunk(delta);
          }
        } else if (event.type === 'message_stop') {
          // Get usage from final message
          if (event.message && event.message.usage) {
            usage = event.message.usage;
          }
        }
      }

      const latency = Date.now() - startTime;

      return {
        text: fullText,
        model: model,
        usage: usage ? {
          prompt_tokens: usage.input_tokens,
          completion_tokens: usage.output_tokens,
          total_tokens: usage.input_tokens + usage.output_tokens
        } : {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        finishReason: 'end_turn',
        latency: latency,
        streamed: true
      };

    } catch (error) {
      throw new Error(`Anthropic stream error: ${error.message}`);
    }
  }

  /**
   * Format messages for Anthropic API
   * @private
   */
  _formatMessages(request) {
    // If messages array provided, use it directly
    if (request.messages) {
      return request.messages;
    }

    // Add user prompt
    return [{
      role: 'user',
      content: request.prompt
    }];
  }
}

module.exports = AnthropicAdapter;
