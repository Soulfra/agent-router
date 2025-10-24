/**
 * Token Counter
 *
 * Accurate token counting using tiktoken library.
 * Supports different model encodings (GPT, Claude, Llama).
 *
 * Why accurate tokens matter:
 * - Context window management (don't exceed model limits)
 * - Cost estimation (API providers charge per token)
 * - Chunk sizing (optimal block times require accurate token counts)
 * - Throughput measurement (tokens/second calculations)
 */

const { encoding_for_model, get_encoding } = require('tiktoken');

class TokenCounter {
  constructor() {
    // Cache encoders to avoid repeated initialization
    this.encoders = new Map();

    // Default to cl100k_base (used by GPT-4, GPT-3.5-turbo, text-embedding-ada-002)
    this.defaultEncoding = 'cl100k_base';
  }

  /**
   * Get encoder for a specific model
   */
  getEncoder(modelId) {
    if (this.encoders.has(modelId)) {
      return this.encoders.get(modelId);
    }

    let encoder;

    // Try model-specific encoding first
    try {
      encoder = encoding_for_model(modelId);
    } catch (error) {
      // Fall back to encoding type based on model family
      const lower = modelId.toLowerCase();

      if (lower.includes('gpt-4') || lower.includes('gpt-3.5')) {
        encoder = get_encoding('cl100k_base');
      } else if (lower.includes('gpt-3') || lower.includes('davinci') || lower.includes('curie')) {
        encoder = get_encoding('p50k_base');
      } else if (lower.includes('codex')) {
        encoder = get_encoding('p50k_edit');
      } else {
        // Default for Llama, Claude, Mistral, etc.
        encoder = get_encoding('cl100k_base');
      }
    }

    this.encoders.set(modelId, encoder);
    return encoder;
  }

  /**
   * Count tokens in text for a specific model
   */
  count(text, modelId = 'gpt-4') {
    if (!text) return 0;

    // For very large texts, use estimation to avoid memory issues
    if (text.length > 100000) {
      return this.estimate(text);
    }

    try {
      const encoder = this.getEncoder(modelId);
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (error) {
      // Fallback to character-based estimation
      return this.estimate(text);
    }
  }

  /**
   * Count tokens for multiple texts (batch)
   */
  countBatch(texts, modelId = 'gpt-4') {
    return texts.map(text => this.count(text, modelId));
  }

  /**
   * Estimate tokens (faster, less accurate)
   * Uses character count / 4 heuristic
   */
  estimate(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text fits within context window
   */
  fitsInContext(text, modelId = 'gpt-4', maxTokens = 4096) {
    const tokens = this.count(text, modelId);
    return tokens <= maxTokens;
  }

  /**
   * Truncate text to fit within token limit
   */
  truncate(text, modelId = 'gpt-4', maxTokens = 4096) {
    if (!text) return '';

    const encoder = this.getEncoder(modelId);
    const tokens = encoder.encode(text);

    if (tokens.length <= maxTokens) {
      return text;
    }

    // Truncate tokens and decode back to text
    const truncatedTokens = tokens.slice(0, maxTokens);
    return encoder.decode(truncatedTokens);
  }


  /**
   * Get model context window size
   */
  getContextWindow(modelId) {
    const lower = modelId.toLowerCase();

    // OpenAI models
    if (lower.includes('gpt-4-turbo')) return 128000;
    if (lower.includes('gpt-4-32k')) return 32768;
    if (lower.includes('gpt-4')) return 8192;
    if (lower.includes('gpt-3.5-turbo-16k')) return 16384;
    if (lower.includes('gpt-3.5-turbo')) return 4096;

    // Anthropic models
    if (lower.includes('claude-3')) return 200000;
    if (lower.includes('claude-2.1')) return 200000;
    if (lower.includes('claude-2')) return 100000;
    if (lower.includes('claude')) return 100000;

    // Llama models
    if (lower.includes('llama-3') || lower.includes('llama3')) return 8192;
    if (lower.includes('llama-2') || lower.includes('calos-model:latest')) return 4096;
    if (lower.includes('codellama')) return 16384;

    // Mistral models
    if (lower.includes('mistral')) return 8192;

    // Qwen models
    if (lower.includes('qwen')) return 32768;

    // Default
    return 4096;
  }

  /**
   * Calculate token cost for model
   */
  calculateCost(tokens, modelId, type = 'input') {
    const lower = modelId.toLowerCase();

    // Cost per 1M tokens (USD)
    const costs = {
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-4': { input: 30, output: 60 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'deepseek': { input: 0.14, output: 0.28 },
    };

    // Find matching cost
    for (const [model, pricing] of Object.entries(costs)) {
      if (lower.includes(model)) {
        return (tokens / 1_000_000) * pricing[type];
      }
    }

    // Internal models (Ollama) are free
    if (lower.startsWith('ollama:') ||
        lower.includes('llama') ||
        lower.includes('mistral') ||
        lower.includes('qwen') ||
        lower.includes('phi')) {
      return 0;
    }

    // Unknown model - assume medium cost
    return (tokens / 1_000_000) * 1.0;
  }

  /**
   * Clean up encoders
   */
  dispose() {
    for (const encoder of this.encoders.values()) {
      encoder.free();
    }
    this.encoders.clear();
  }
}

// Singleton instance
const tokenCounter = new TokenCounter();

module.exports = tokenCounter;
