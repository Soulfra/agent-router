/**
 * OpenAI Provider Adapter
 * Supports: GPT-4, GPT-4-turbo, GPT-3.5-turbo
 */

const OpenAI = require('openai');

class OpenAIAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.enabled = options.enabled !== false;
    this.defaultModel = options.defaultModel || 'gpt-4-turbo-preview';

    // Initialize client if API key available
    if (this.apiKey) {
      this.client = new OpenAI({
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
      { name: 'gpt-4-turbo-preview', contextWindow: 128000, cost: 0.01 },
      { name: 'gpt-4', contextWindow: 8192, cost: 0.03 },
      { name: 'gpt-3.5-turbo', contextWindow: 16385, cost: 0.0015 }
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
      throw new Error('OpenAI provider not available');
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
        temperature: temperature,
        ...(request.stream === false ? {} : {})
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
        throw new Error('OpenAI API key invalid');
      } else if (error.status === 429) {
        throw new Error('OpenAI rate limit exceeded');
      } else if (error.status === 500) {
        throw new Error('OpenAI server error');
      } else {
        throw new Error(`OpenAI error: ${error.message}`);
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
      throw new Error('OpenAI provider not available');
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
          // Note: Streaming doesn't return token counts
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        finishReason: 'stop',
        latency: latency,
        streamed: true
      };

    } catch (error) {
      throw new Error(`OpenAI stream error: ${error.message}`);
    }
  }

  /**
   * Format messages for OpenAI API
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

module.exports = OpenAIAdapter;
