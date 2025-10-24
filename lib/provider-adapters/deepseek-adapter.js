/**
 * DeepSeek Provider Adapter
 * Supports: DeepSeek Chat, DeepSeek Coder
 *
 * DeepSeek uses OpenAI-compatible API
 */

const OpenAI = require('openai');

class DeepSeekAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.enabled = options.enabled !== false;
    this.defaultModel = options.defaultModel || 'deepseek-chat';
    this.baseURL = options.baseURL || 'https://api.deepseek.com/v1';

    // Initialize client if API key available
    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL
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
      { name: 'deepseek-chat', contextWindow: 32768, cost: 0.00014 },
      { name: 'deepseek-coder', contextWindow: 16384, cost: 0.00014 },
      { name: 'deepseek-reasoner', contextWindow: 32768, cost: 0.00055 } // Thinking mode (like o1)
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
      throw new Error('DeepSeek provider not available');
    }

    const model = request.model || this.defaultModel;
    const maxTokens = request.maxTokens || 1000;
    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();

      const response = await this.client.chat.completions.create({
        model: model,
        messages: this._formatMessages(request),
        max_tokens: maxTokens,
        temperature: temperature
      });

      const latency = Date.now() - startTime;

      return {
        text: response.choices[0].message.content,
        model: response.model,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens
        },
        finishReason: response.choices[0].finish_reason,
        latency: latency
      };

    } catch (error) {
      if (error.status === 401) {
        throw new Error('DeepSeek API key invalid');
      } else if (error.status === 429) {
        throw new Error('DeepSeek rate limit exceeded');
      } else if (error.status === 500) {
        throw new Error('DeepSeek server error');
      } else {
        throw new Error(`DeepSeek error: ${error.message}`);
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
      throw new Error('DeepSeek provider not available');
    }

    const model = request.model || this.defaultModel;
    const maxTokens = request.maxTokens || 1000;
    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();
      let fullText = '';

      const stream = await this.client.chat.completions.create({
        model: model,
        messages: this._formatMessages(request),
        max_tokens: maxTokens,
        temperature: temperature,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onChunk) {
            onChunk(delta);
          }
        }
      }

      const latency = Date.now() - startTime;

      return {
        text: fullText,
        model: model,
        usage: {
          // Streaming doesn't return token counts
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        finishReason: 'stop',
        latency: latency,
        streamed: true
      };

    } catch (error) {
      throw new Error(`DeepSeek stream error: ${error.message}`);
    }
  }

  /**
   * Format messages for DeepSeek API (OpenAI-compatible)
   * @private
   */
  _formatMessages(request) {
    // If messages array provided, use it directly
    if (request.messages) {
      return request.messages;
    }

    // If system prompt provided, add it
    const messages = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    // Add user prompt
    messages.push({
      role: 'user',
      content: request.prompt
    });

    return messages;
  }
}

module.exports = DeepSeekAdapter;
