/**
 * Ollama Provider Adapter
 * Supports local Ollama models: Llama, CodeLlama, Mistral, etc.
 */

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class OllamaAdapter {
  constructor(options = {}) {
    // Force IPv4 by using 127.0.0.1 instead of localhost
    this.baseURL = options.baseURL || 'http://127.0.0.1:11434';
    this.enabled = options.enabled !== false;
    this.defaultModel = options.defaultModel || 'llama3.2:3b';
    this.codeModel = options.codeModel || 'codellama:7b-instruct'; // Best for code tasks

    // Domain-specific models
    this.domainModels = {
      cryptography: 'soulfra-model', // Cryptography & identity
      data: 'deathtodata-model',     // Data analysis & ETL
      publishing: 'publishing-model', // Content & documentation
      calos: 'calos-model',           // CalOS platform
      whimsical: 'drseuss-model'      // Creative & whimsical
    };

    // Assume available by default (test on first use)
    this.available = true;
    this.installedModels = [];
  }

  /**
   * Test Ollama connection
   * @private
   */
  async _testConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`, {
        timeout: 5000
      });

      if (response.status === 200 && response.data) {
        this.installedModels = response.data.models || [];
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Get available models
   */
  getModels() {
    return [
      { name: 'llama3.2:3b', contextWindow: 128000, cost: 0 },
      { name: 'codellama:7b', contextWindow: 16384, cost: 0 },
      { name: 'codellama:7b-code', contextWindow: 16384, cost: 0 },
      { name: 'codellama:7b-instruct', contextWindow: 16384, cost: 0 },
      { name: 'mistral:7b', contextWindow: 32768, cost: 0 },
      { name: 'qwen2.5-coder:1.5b', contextWindow: 32768, cost: 0 },
      // Domain-specific models
      { name: 'soulfra-model', contextWindow: 16384, cost: 0, domain: 'cryptography' },
      { name: 'deathtodata-model', contextWindow: 8192, cost: 0, domain: 'data' },
      { name: 'publishing-model', contextWindow: 8192, cost: 0, domain: 'publishing' },
      { name: 'calos-model', contextWindow: 8192, cost: 0, domain: 'calos' },
      { name: 'drseuss-model', contextWindow: 8192, cost: 0, domain: 'whimsical' }
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
      throw new Error('Ollama provider not available. Is Ollama running?');
    }

    // Select model based on task type
    let model = request.model;
    if (!model) {
      // Check domain-specific models first
      if (this.domainModels[request.taskType]) {
        model = this.domainModels[request.taskType];
      } else if (request.taskType === 'code') {
        model = this.codeModel; // Use CodeLlama for code tasks
      } else {
        model = this.defaultModel;
      }
    }

    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();

      // Format prompt with system message if provided
      let prompt = request.prompt;
      if (request.systemPrompt) {
        prompt = `${request.systemPrompt}\n\n${request.prompt}`;
      }

      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: request.maxTokens || 1000
        }
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = response.data;
      const latency = Date.now() - startTime;

      return {
        text: data.response,
        model: model,
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        finishReason: data.done ? 'stop' : 'length',
        latency: latency,
        localModel: true
      };

    } catch (error) {
      throw new Error(`Ollama error: ${error.message}`);
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
      throw new Error('Ollama provider not available. Is Ollama running?');
    }

    // Select model based on task type
    let model = request.model;
    if (!model) {
      // Check domain-specific models first
      if (this.domainModels[request.taskType]) {
        model = this.domainModels[request.taskType];
      } else if (request.taskType === 'code') {
        model = this.codeModel; // Use CodeLlama for code tasks
      } else {
        model = this.defaultModel;
      }
    }

    const temperature = request.temperature !== undefined ? request.temperature : 0.7;

    try {
      const startTime = Date.now();
      let fullText = '';

      // Format prompt with system message if provided
      let prompt = request.prompt;
      if (request.systemPrompt) {
        prompt = `${request.systemPrompt}\n\n${request.prompt}`;
      }

      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: true,
          options: {
            temperature: temperature,
            num_predict: request.maxTokens || 1000
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      // Read stream line by line
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                fullText += data.response;
                if (onChunk) {
                  onChunk(data.response);
                }
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

      const latency = Date.now() - startTime;

      return {
        text: fullText,
        model: model,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        finishReason: 'stop',
        latency: latency,
        streamed: true,
        localModel: true
      };

    } catch (error) {
      throw new Error(`Ollama stream error: ${error.message}`);
    }
  }

  /**
   * List installed models
   */
  async listInstalledModels() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`, {
        timeout: 5000
      });

      if (response.status === 200 && response.data) {
        return response.data.models || [];
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(modelName) {
    try {
      const response = await fetch(`${this.baseURL}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          stream: false
        })
      });

      if (response.ok) {
        console.log(`✓ Pulled model: ${modelName}`);
        return true;
      }

      throw new Error(`Failed to pull model: ${response.statusText}`);
    } catch (error) {
      throw new Error(`Ollama pull error: ${error.message}`);
    }
  }
}

module.exports = OllamaAdapter;
