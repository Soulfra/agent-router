/**
 * Data Processor Template
 *
 * Generic data processing class with async operations, error handling, and logging.
 * Use this template for building data transformation, validation, and ETL tasks.
 */

const fs = require('fs').promises;
const path = require('path');

class {{CLASS_NAME}} {
  constructor(options = {}) {
    this.config = {
      inputPath: options.inputPath,
      outputPath: options.outputPath,
      verbose: options.verbose || false,
      batchSize: options.batchSize || 100
    };

    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };

    console.log('[{{CLASS_NAME}}] Initialized');
  }

  /**
   * Process data
   */
  async process(data) {
    this.stats.startTime = Date.now();
    this.stats.processed = 0;
    this.stats.succeeded = 0;
    this.stats.failed = 0;

    console.log(`[{{CLASS_NAME}}] Processing ${Array.isArray(data) ? data.length : 1} items...`);

    try {
      let results;

      if (Array.isArray(data)) {
        results = await this.processBatch(data);
      } else {
        results = await this.processItem(data);
      }

      this.stats.endTime = Date.now();

      console.log(`[{{CLASS_NAME}}] ✅ Processing complete`);
      console.log(`[{{CLASS_NAME}}] Processed: ${this.stats.processed}, Succeeded: ${this.stats.succeeded}, Failed: ${this.stats.failed}`);
      console.log(`[{{CLASS_NAME}}] Duration: ${((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)}s`);

      return results;

    } catch (error) {
      this.stats.endTime = Date.now();
      console.error(`[{{CLASS_NAME}}] Processing failed:`, error.message);
      throw error;
    }
  }

  /**
   * Process batch of items
   */
  async processBatch(items) {
    const results = [];

    for (let i = 0; i < items.length; i += this.config.batchSize) {
      const batch = items.slice(i, i + this.config.batchSize);

      if (this.config.verbose) {
        console.log(`[{{CLASS_NAME}}] Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(items.length / this.config.batchSize)}`);
      }

      const batchResults = await Promise.allSettled(
        batch.map(item => this.processItem(item))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          this.stats.succeeded++;
        } else {
          results.push({ error: result.reason.message });
          this.stats.failed++;
        }
        this.stats.processed++;
      }
    }

    return results;
  }

  /**
   * Process single item
   */
  async processItem(item) {
    try {
      // {{PROCESS_LOGIC_PLACEHOLDER}}

      // Validate input
      this.validate(item);

      // Transform data
      const transformed = this.transform(item);

      // Validate output
      this.validate(transformed);

      return transformed;

    } catch (error) {
      console.error(`[{{CLASS_NAME}}] Item processing failed:`, error.message);
      throw error;
    }
  }

  /**
   * Validate data
   */
  validate(data) {
    if (!data) {
      throw new Error('Data is null or undefined');
    }

    // {{VALIDATION_LOGIC_PLACEHOLDER}}

    return true;
  }

  /**
   * Transform data
   */
  transform(data) {
    // {{TRANSFORM_LOGIC_PLACEHOLDER}}

    return data;
  }

  /**
   * Load data from file
   */
  async loadFromFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');

    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      // Return as string if not JSON
      return content;
    }
  }

  /**
   * Save data to file
   */
  async saveToFile(data, filePath) {
    // Create parent directory if needed
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Convert to JSON if object
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    await fs.writeFile(filePath, content);

    console.log(`[{{CLASS_NAME}}] Saved to ${filePath}`);
  }

  /**
   * Get processing stats
   */
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime ? this.stats.endTime - this.stats.startTime : null,
      successRate: this.stats.processed > 0 ? this.stats.succeeded / this.stats.processed : 0
    };
  }
}

module.exports = {{CLASS_NAME}};
