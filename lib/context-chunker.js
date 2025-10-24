/**
 * Context Chunker
 * Intelligently splits large prompts to fit within model token limits
 *
 * Fixes: "prompt=1542939 tokens → truncated to 4096"
 * Now uses tiktoken for accurate token counting
 */

const tokenCounter = require('./token-counter');

class ContextChunker {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 4096;
    this.overlapTokens = options.overlapTokens || 200; // Overlap for context continuity
    this.safetyMargin = options.safetyMargin || 500;    // Leave room for response
    this.modelId = options.modelId || 'gpt-4'; // Default model for token counting

    // Block time profile (like Bitcoin's 10min blocks, RuneScape's 600ms ticks)
    this.blockTimeProfile = options.blockTimeProfile || null; // 'bitcoin', 'runescape', 'balanced', 'longform'
    this.targetBlockTime = options.targetBlockTime || null; // seconds (overrides profile)

    // Database connection for benchmark-based chunk sizing
    this.db = options.db || null;
  }

  /**
   * Count tokens accurately using tiktoken
   * @param {string} text - Text to count
   * @param {string} modelId - Model ID (optional, uses instance default)
   * @returns {number} - Accurate token count
   */
  countTokens(text, modelId = null) {
    return tokenCounter.count(text, modelId || this.modelId);
  }

  /**
   * Estimate tokens quickly (fallback for performance)
   * @param {string} text - Text to estimate
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    return tokenCounter.estimate(text);
  }

  /**
   * Check if prompt needs chunking
   * @param {string} prompt - Prompt to check
   * @param {string} modelId - Model ID (optional)
   * @returns {boolean} - True if chunking needed
   */
  needsChunking(prompt, modelId = null) {
    const tokens = this.countTokens(prompt, modelId);
    const limit = this.maxTokens - this.safetyMargin;
    return tokens > limit;
  }

  /**
   * Split text into chunks with overlap for context
   * @param {string} text - Text to split
   * @param {number} chunkSize - Size of each chunk in tokens
   * @param {string} modelId - Model ID (optional)
   * @returns {Array<string>} - Array of chunks
   */
  splitIntoChunks(text, chunkSize = null, modelId = null) {
    if (!text) return [];

    const actualChunkSize = chunkSize || (this.maxTokens - this.safetyMargin);

    // Check if text fits in one chunk
    const totalTokens = this.countTokens(text, modelId);
    if (totalTokens <= actualChunkSize) {
      return [text];
    }

    // Calculate characters per token for this text
    const charsPerToken = Math.max(text.length / totalTokens, 1);

    // Calculate character-based chunk size
    const charsPerChunk = Math.floor(actualChunkSize * charsPerToken);
    const overlapChars = Math.min(
      Math.floor(this.overlapTokens * charsPerToken),
      Math.floor(charsPerChunk * 0.5) // Overlap can't be more than 50% of chunk
    );

    const chunks = [];
    let startPos = 0;

    while (startPos < text.length) {
      const endPos = Math.min(startPos + charsPerChunk, text.length);
      let chunk = text.substring(startPos, endPos);
      let actualEndPos = endPos;

      // Try to break at sentence boundary
      if (endPos < text.length) {
        const lastPeriod = chunk.lastIndexOf('. ');
        const lastNewline = chunk.lastIndexOf('\n\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunk.length / 2) {
          // Found good break point
          chunk = chunk.substring(0, breakPoint + 1);
          actualEndPos = startPos + chunk.length;
        }
      }

      chunks.push(chunk);

      // Move start position with overlap for context continuity
      const nextStart = actualEndPos - overlapChars;

      // Ensure we always move forward by at least 25% of chunk size
      const minStep = Math.max(Math.floor(charsPerChunk * 0.25), 1);
      startPos = Math.max(nextStart, startPos + minStep);

      // If we've covered the whole document, stop
      if (actualEndPos >= text.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Create prompts for each chunk with context preservation
   * @param {string} systemPrompt - System/instruction prompt
   * @param {string} userContent - Large user content to chunk
   * @param {string} modelId - Model ID (optional)
   * @returns {Array<object>} - Array of {prompt, chunkIndex, totalChunks, tokens}
   */
  createChunkedPrompts(systemPrompt, userContent, modelId = null) {
    const chunks = this.splitIntoChunks(userContent, null, modelId);
    const totalChunks = chunks.length;

    return chunks.map((chunk, index) => {
      let prompt = systemPrompt;

      if (totalChunks > 1) {
        prompt += `\n\n[Part ${index + 1} of ${totalChunks}]\n\n`;
      }

      prompt += chunk;

      if (index < totalChunks - 1) {
        prompt += `\n\n[Continued in next part...]`;
      }

      return {
        prompt,
        chunkIndex: index,
        totalChunks,
        tokens: this.countTokens(prompt, modelId)
      };
    });
  }

  /**
   * Combine chunk responses
   * @param {Array<string>} responses - Responses from each chunk
   * @returns {string} - Combined response
   */
  combineResponses(responses) {
    // Remove any "[Part X of Y]" markers from responses
    const cleaned = responses.map(r =>
      r.replace(/\[Part \d+ of \d+\]/g, '')
       .replace(/\[Continued in next part\.\.\.\]/g, '')
       .trim()
    );

    // Join with spacing
    return cleaned.join('\n\n');
  }

  /**
   * Smart chunking strategy selector
   * @param {string} prompt - Full prompt
   * @param {string} modelId - Model ID (optional)
   * @returns {object} - Strategy recommendation
   */
  recommendStrategy(prompt, modelId = null) {
    const tokens = this.countTokens(prompt, modelId);
    const limit = this.maxTokens - this.safetyMargin;

    if (tokens <= limit) {
      return {
        strategy: 'direct',
        reason: 'Prompt fits within token limit',
        chunks: 1,
        estimatedTime: 1
      };
    }

    const chunks = Math.ceil(tokens / limit);

    if (chunks <= 3) {
      return {
        strategy: 'sequential_chunks',
        reason: 'Moderate size - sequential processing',
        chunks,
        estimatedTime: chunks * 1.5 // Estimate 1.5s per chunk
      };
    }

    if (chunks <= 10) {
      return {
        strategy: 'parallel_chunks',
        reason: 'Large size - parallel processing recommended',
        chunks,
        estimatedTime: Math.ceil(chunks / 3) * 1.5 // Parallel batches
      };
    }

    return {
      strategy: 'summarize_first',
      reason: 'Very large - consider summarizing first',
      chunks,
      estimatedTime: chunks * 1.5,
      warning: 'Prompt may be too large for effective processing'
    };
  }

  /**
   * Get chunking statistics
   * @param {string} text - Text to analyze
   * @param {string} modelId - Model ID (optional)
   * @returns {object} - Statistics
   */
  getStats(text, modelId = null) {
    const tokens = this.countTokens(text, modelId);
    const limit = this.maxTokens - this.safetyMargin;
    const chunks = this.splitIntoChunks(text, null, modelId);

    return {
      totalTokens: tokens,
      limit,
      needsChunking: tokens > limit,
      chunkCount: chunks.length,
      avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + this.countTokens(c, modelId), 0) / chunks.length),
      strategy: this.recommendStrategy(text, modelId)
    };
  }

  /**
   * Calculate optimal chunk size based on model throughput and target block time
   * Like Bitcoin difficulty adjustment - adjust chunk size to hit target block time
   *
   * @param {string} modelId - Model ID
   * @param {number} targetSeconds - Target block time in seconds
   * @param {number} safetyMargin - Safety margin (0.0-1.0), default 0.7
   * @returns {Promise<number>} - Optimal chunk size in tokens
   */
  async calculateOptimalChunkSize(modelId = null, targetSeconds = null, safetyMargin = 0.7) {
    if (!this.db) {
      // Fallback to maxTokens if no database
      return this.maxTokens - this.safetyMargin;
    }

    const model = modelId || this.modelId;
    const target = targetSeconds || this.targetBlockTime || 30; // Default 30s

    try {
      const result = await this.db.query(
        'SELECT calculate_optimal_chunk_size($1, $2, $3) as chunk_size',
        [model, target, safetyMargin]
      );

      return result.rows[0]?.chunk_size || (this.maxTokens - this.safetyMargin);
    } catch (error) {
      console.warn('[ContextChunker] Failed to calculate optimal chunk size:', error.message);
      return this.maxTokens - this.safetyMargin;
    }
  }

  /**
   * Estimate processing time for text using block time profiles
   * Pre-flight estimation before starting processing
   *
   * @param {string} text - Text to process
   * @param {string} modelId - Model ID (optional)
   * @param {string} profileSlug - Block time profile ('bitcoin', 'runescape', 'balanced', 'longform')
   * @returns {Promise<object>} - Estimation {chunkCount, tokensPerChunk, blockTimeSeconds, totalTimeSeconds, totalMinutes, modelTps}
   */
  async estimateProcessingTime(text, modelId = null, profileSlug = null) {
    if (!this.db) {
      // Fallback estimation without database
      const tokens = this.countTokens(text, modelId);
      const chunkSize = this.maxTokens - this.safetyMargin;
      const chunkCount = Math.ceil(tokens / chunkSize);
      const estimatedTimePerChunk = 30; // Assume 30s per chunk

      return {
        chunkCount,
        tokensPerChunk: chunkSize,
        blockTimeSeconds: estimatedTimePerChunk,
        totalTimeSeconds: chunkCount * estimatedTimePerChunk,
        totalMinutes: (chunkCount * estimatedTimePerChunk) / 60,
        modelTps: null
      };
    }

    const model = modelId || this.modelId;
    const profile = profileSlug || this.blockTimeProfile || 'balanced';
    const totalTokens = this.countTokens(text, model);

    try {
      const result = await this.db.query(
        'SELECT chunk_count, tokens_per_chunk, block_time_seconds, total_time_seconds, total_minutes, model_tps FROM estimate_processing_time($1, $2, $3)',
        [model, totalTokens, profile]
      );

      if (!result.rows[0]) return null;

      // Map snake_case to camelCase
      const row = result.rows[0];
      return {
        chunkCount: row.chunk_count,
        tokensPerChunk: row.tokens_per_chunk,
        blockTimeSeconds: row.block_time_seconds,
        totalTimeSeconds: row.total_time_seconds,
        totalMinutes: row.total_minutes,
        modelTps: row.model_tps
      };
    } catch (error) {
      console.warn('[ContextChunker] Failed to estimate processing time:', error.message);
      return null;
    }
  }

  /**
   * Set block time profile
   * @param {string} profile - Profile slug ('bitcoin', 'runescape', 'balanced', 'longform')
   */
  setBlockTimeProfile(profile) {
    this.blockTimeProfile = profile;
  }

  /**
   * Set target block time directly
   * @param {number} seconds - Target block time in seconds
   */
  setTargetBlockTime(seconds) {
    this.targetBlockTime = seconds;
  }

  /**
   * Get available block time profiles from database
   * @returns {Promise<Array>} - List of profiles
   */
  async getBlockTimeProfiles() {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT
          profile_name,
          profile_slug,
          target_seconds,
          description,
          best_for,
          is_default
        FROM block_time_profiles
        WHERE is_active = true
        ORDER BY target_seconds ASC
      `);

      return result.rows;
    } catch (error) {
      console.warn('[ContextChunker] Failed to get block time profiles:', error.message);
      return null;
    }
  }
}

module.exports = ContextChunker;
