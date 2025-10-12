/**
 * Stream Monitor
 * Monitors streams for errors and implements retry logic
 *
 * Fixes: Broken pipes, timeouts, connection failures
 */

const EventEmitter = require('events');
const ContextChunker = require('./context-chunker');

class StreamMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxRetries = options.maxRetries || 3;
    this.initialBackoff = options.initialBackoff || 1000; // ms
    this.maxBackoff = options.maxBackoff || 10000; // ms
    this.timeout = options.timeout || 60000; // ms
    this.chunker = new ContextChunker(options.chunker || {});
  }

  /**
   * Execute with retry logic
   * @param {Function} fn - Async function to execute
   * @param {object} context - Execution context
   * @returns {Promise<any>} - Result
   */
  async executeWithRetry(fn, context = {}) {
    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Emit attempt event
        this.emit('attempt', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          context
        });

        // Execute with timeout
        const result = await this._executeWithTimeout(fn, context);

        // Success!
        this.emit('success', {
          attempt: attempt + 1,
          context,
          result
        });

        return result;

      } catch (error) {
        lastError = error;

        const errorType = this._classifyError(error);

        this.emit('error', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          errorType,
          error: error.message,
          context
        });

        // Check if error is retryable
        if (!this._isRetryable(error)) {
          throw error;
        }

        // Last attempt?
        if (attempt === this.maxRetries - 1) {
          // Try chunking as last resort if prompt is large
          if (errorType === 'broken_pipe' || errorType === 'timeout') {
            if (context.prompt && this.chunker.needsChunking(context.prompt)) {
              console.log('💡 Last retry: attempting chunked execution...');
              return await this._executeChunked(fn, context);
            }
          }

          throw error;
        }

        // Calculate backoff
        const backoff = this._calculateBackoff(attempt);

        console.log(`⏳ Retrying in ${backoff}ms (attempt ${attempt + 2}/${this.maxRetries})...`);

        await this._sleep(backoff);
      }
    }

    throw lastError;
  }

  /**
   * Execute with timeout
   * @param {Function} fn - Function to execute
   * @param {object} context - Context
   * @returns {Promise<any>} - Result
   */
  async _executeWithTimeout(fn, context) {
    return Promise.race([
      fn(context),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), this.timeout)
      )
    ]);
  }

  /**
   * Execute with chunking for large prompts
   * @param {Function} fn - Function to execute
   * @param {object} context - Context with prompt
   * @returns {Promise<any>} - Combined result
   */
  async _executeChunked(fn, context) {
    const { prompt, ...rest } = context;

    // Create chunked prompts
    const systemPrompt = rest.systemPrompt || '';
    const chunks = this.chunker.createChunkedPrompts(systemPrompt, prompt);

    console.log(`📦 Chunking large prompt: ${chunks.length} chunks`);

    const responses = [];

    for (const chunk of chunks) {
      console.log(`  Processing chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}...`);

      const chunkContext = {
        ...rest,
        prompt: chunk.prompt,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks
      };

      try {
        const response = await this._executeWithTimeout(fn, chunkContext);
        responses.push(response);
      } catch (error) {
        console.error(`  Chunk ${chunk.chunkIndex + 1} failed:`, error.message);
        throw error;
      }
    }

    // Combine responses
    const combined = this.chunker.combineResponses(responses);

    console.log(`✓ Combined ${responses.length} chunk responses`);

    return combined;
  }

  /**
   * Classify error type
   * @param {Error} error - Error object
   * @returns {string} - Error type
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('broken pipe')) return 'broken_pipe';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('econnrefused')) return 'connection_refused';
    if (message.includes('econnreset')) return 'connection_reset';
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('truncat')) return 'truncation';

    return 'unknown';
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error object
   * @returns {boolean} - True if retryable
   */
  _isRetryable(error) {
    const errorType = this._classifyError(error);

    const retryableTypes = [
      'broken_pipe',
      'timeout',
      'connection_refused',
      'connection_reset',
      'rate_limit'
    ];

    return retryableTypes.includes(errorType);
  }

  /**
   * Calculate exponential backoff
   * @param {number} attempt - Attempt number (0-indexed)
   * @returns {number} - Backoff time in milliseconds
   */
  _calculateBackoff(attempt) {
    const backoff = Math.min(
      this.initialBackoff * Math.pow(2, attempt),
      this.maxBackoff
    );

    // Add jitter to avoid thundering herd
    const jitter = Math.random() * 0.3 * backoff;

    return Math.floor(backoff + jitter);
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Monitor stream for errors
   * @param {ReadableStream} stream - Stream to monitor
   * @param {object} options - Options
   * @returns {Promise<string>} - Complete stream data
   */
  async monitorStream(stream, options = {}) {
    return new Promise((resolve, reject) => {
      let data = '';
      let timeout = null;

      // Set timeout
      if (options.timeout) {
        timeout = setTimeout(() => {
          stream.destroy();
          reject(new Error('timeout'));
        }, options.timeout);
      }

      stream.on('data', (chunk) => {
        data += chunk.toString();

        // Reset timeout on data
        if (timeout) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            stream.destroy();
            reject(new Error('timeout'));
          }, options.timeout);
        }

        // Emit progress
        this.emit('stream_data', {
          length: data.length,
          chunk: chunk.toString()
        });
      });

      stream.on('end', () => {
        if (timeout) clearTimeout(timeout);

        this.emit('stream_end', {
          totalLength: data.length
        });

        resolve(data);
      });

      stream.on('error', (error) => {
        if (timeout) clearTimeout(timeout);

        this.emit('stream_error', {
          error: error.message
        });

        reject(error);
      });

      // Detect broken pipe
      stream.on('close', () => {
        if (timeout) clearTimeout(timeout);

        // If closed before 'end' event, it's likely a broken pipe
        if (!stream.readableEnded) {
          reject(new Error('broken pipe'));
        }
      });
    });
  }

  /**
   * Get retry statistics
   * @returns {object} - Statistics
   */
  getStats() {
    return {
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      initialBackoff: this.initialBackoff,
      maxBackoff: this.maxBackoff
    };
  }
}

module.exports = StreamMonitor;
