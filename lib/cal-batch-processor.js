/**
 * CAL Batch Processor
 *
 * Processes multiple files/API calls in parallel with:
 * - Rate limiting (don't spam APIs)
 * - Batch grouping (send 10 at a time)
 * - Result aggregation
 * - Error handling per item
 * - Progress tracking
 *
 * Example:
 *   const processor = new CalBatchProcessor({ batchSize: 10, rateLimit: 100 });
 *   const results = await processor.processFiles(files, async (file) => {
 *     return await analyzeFile(file);
 *   });
 */

class CalBatchProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10;
    this.rateLimit = options.rateLimit || 100; // ms between batches
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 30000; // 30s per item

    this.stats = {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Process array of items in batches
   *
   * @param {Array} items - Items to process
   * @param {Function} processor - async function(item) => result
   * @param {Object} options - { onProgress, onItemComplete }
   * @returns {Promise<Array>} - Results for each item
   */
  async process(items, processor, options = {}) {
    this.stats.total = items.length;
    this.stats.processed = 0;
    this.stats.succeeded = 0;
    this.stats.failed = 0;

    const results = [];
    const { onProgress, onItemComplete } = options;

    console.log(`[BatchProcessor] Starting batch processing: ${items.length} items`);
    console.log(`[BatchProcessor] Batch size: ${this.batchSize}, Rate limit: ${this.rateLimit}ms`);

    // Process in batches
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      console.log(`[BatchProcessor] Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(items.length / this.batchSize)}`);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (item, index) => {
          const globalIndex = i + index;
          return await this._processItem(item, globalIndex, processor, {
            onItemComplete: (result) => {
              if (onItemComplete) onItemComplete(result, globalIndex);
            }
          });
        })
      );

      results.push(...batchResults);

      // Update stats
      this.stats.processed += batch.length;
      batchResults.forEach(r => {
        if (r.success) this.stats.succeeded++;
        else this.stats.failed++;
      });

      // Progress callback
      if (onProgress) {
        onProgress({
          processed: this.stats.processed,
          total: this.stats.total,
          succeeded: this.stats.succeeded,
          failed: this.stats.failed,
          progress: (this.stats.processed / this.stats.total * 100).toFixed(1)
        });
      }

      // Rate limiting (wait between batches)
      if (i + this.batchSize < items.length) {
        await this._wait(this.rateLimit);
      }
    }

    console.log(`[BatchProcessor] Completed:`, this.stats);
    return results;
  }

  /**
   * Process a single item with retry logic
   * @private
   */
  async _processItem(item, index, processor, options = {}) {
    const { onItemComplete } = options;
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Set timeout
        const result = await this._withTimeout(
          processor(item, index),
          this.timeout
        );

        const itemResult = {
          index,
          item,
          success: true,
          result,
          attempts: attempt + 1
        };

        if (onItemComplete) onItemComplete(itemResult);
        return itemResult;

      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          console.warn(`[BatchProcessor] Item ${index} failed (attempt ${attempt + 1}/${this.maxRetries + 1}):`, error.message);
          this.stats.retried++;

          // Exponential backoff
          await this._wait(Math.pow(2, attempt) * 1000);
        }
      }
    }

    // All retries failed
    const itemResult = {
      index,
      item,
      success: false,
      error: lastError.message,
      errorStack: lastError.stack,
      attempts: this.maxRetries + 1
    };

    if (onItemComplete) onItemComplete(itemResult);
    return itemResult;
  }

  /**
   * Process files in batch
   */
  async processFiles(filePaths, processor, options = {}) {
    console.log(`[BatchProcessor] Processing ${filePaths.length} files`);
    return await this.process(filePaths, processor, options);
  }

  /**
   * Batch API calls
   *
   * @param {Array} endpoints - Array of { url, method, body }
   * @param {Object} options - fetch options
   */
  async batchFetch(endpoints, options = {}) {
    console.log(`[BatchProcessor] Batch fetching ${endpoints.length} endpoints`);

    return await this.process(endpoints, async (endpoint) => {
      const { url, method = 'GET', body, headers = {} } = endpoint;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    });
  }

  /**
   * Group items by a key function
   */
  groupBy(items, keyFn) {
    const groups = {};

    items.forEach(item => {
      const key = keyFn(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  }

  /**
   * Process grouped items (useful for similar operations)
   */
  async processGrouped(items, keyFn, processor, options = {}) {
    const groups = this.groupBy(items, keyFn);
    const results = [];

    console.log(`[BatchProcessor] Processing ${Object.keys(groups).length} groups`);

    for (const [groupKey, groupItems] of Object.entries(groups)) {
      console.log(`[BatchProcessor] Processing group "${groupKey}" (${groupItems.length} items)`);

      const groupResults = await this.process(groupItems, processor, {
        ...options,
        onProgress: (progress) => {
          if (options.onProgress) {
            options.onProgress({
              ...progress,
              group: groupKey,
              groupProgress: `${progress.processed}/${groupItems.length} in group "${groupKey}"`
            });
          }
        }
      });

      results.push(...groupResults);
    }

    return results;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.total > 0
        ? (this.stats.succeeded / this.stats.total * 100).toFixed(1) + '%'
        : 'N/A',
      failureRate: this.stats.total > 0
        ? (this.stats.failed / this.stats.total * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Wait helper
   * @private
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute function with timeout
   * @private
   */
  _withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }
}

module.exports = CalBatchProcessor;
