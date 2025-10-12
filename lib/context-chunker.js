/**
 * Context Chunker
 * Intelligently splits large prompts to fit within model token limits
 *
 * Fixes: "prompt=1542939 tokens → truncated to 4096"
 */

class ContextChunker {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 4096;
    this.overlapTokens = options.overlapTokens || 200; // Overlap for context continuity
    this.safetyMargin = options.safetyMargin || 500;    // Leave room for response
  }

  /**
   * Estimate token count (rough approximation)
   * Real tokenization would use tiktoken or similar
   * @param {string} text - Text to count
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token on average
    // This is conservative and works for most models
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if prompt needs chunking
   * @param {string} prompt - Prompt to check
   * @returns {boolean} - True if chunking needed
   */
  needsChunking(prompt) {
    const tokens = this.estimateTokens(prompt);
    const limit = this.maxTokens - this.safetyMargin;
    return tokens > limit;
  }

  /**
   * Split text into chunks with overlap for context
   * @param {string} text - Text to split
   * @param {number} chunkSize - Size of each chunk in tokens
   * @returns {Array<string>} - Array of chunks
   */
  splitIntoChunks(text, chunkSize = null) {
    const actualChunkSize = chunkSize || (this.maxTokens - this.safetyMargin);
    const chunks = [];

    // Estimate characters per chunk
    const charsPerChunk = actualChunkSize * 4;
    const overlapChars = this.overlapTokens * 4;

    let startPos = 0;

    while (startPos < text.length) {
      const endPos = Math.min(startPos + charsPerChunk, text.length);
      let chunk = text.substring(startPos, endPos);

      // Try to break at sentence boundary
      if (endPos < text.length) {
        const lastPeriod = chunk.lastIndexOf('. ');
        const lastNewline = chunk.lastIndexOf('\n\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunk.length / 2) {
          // Found good break point
          chunk = chunk.substring(0, breakPoint + 1);
        }
      }

      chunks.push(chunk);

      // Move start position with overlap for context continuity
      startPos = endPos - overlapChars;
    }

    return chunks;
  }

  /**
   * Create prompts for each chunk with context preservation
   * @param {string} systemPrompt - System/instruction prompt
   * @param {string} userContent - Large user content to chunk
   * @returns {Array<object>} - Array of {prompt, chunkIndex, totalChunks}
   */
  createChunkedPrompts(systemPrompt, userContent) {
    const chunks = this.splitIntoChunks(userContent);
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
        tokens: this.estimateTokens(prompt)
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
   * @returns {object} - Strategy recommendation
   */
  recommendStrategy(prompt) {
    const tokens = this.estimateTokens(prompt);
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
   * @returns {object} - Statistics
   */
  getStats(text) {
    const tokens = this.estimateTokens(text);
    const limit = this.maxTokens - this.safetyMargin;
    const chunks = this.splitIntoChunks(text);

    return {
      totalTokens: tokens,
      limit,
      needsChunking: tokens > limit,
      chunkCount: chunks.length,
      avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + this.estimateTokens(c), 0) / chunks.length),
      strategy: this.recommendStrategy(text)
    };
  }
}

module.exports = ContextChunker;
