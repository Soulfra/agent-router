/**
 * Bucket Map-Reduce
 *
 * Tile-based document processing using buckets as temporary workspaces.
 * Like RuneScape cakes: Split document into slices, each bucket eats a slice, combine results.
 *
 * Map Phase:   Document → Chunks → Route to buckets (parallel)
 * Reduce Phase: Bucket results → Aggregate → Final response
 *
 * Use cases:
 * - Large document analysis (split 100 pages → 10 buckets)
 * - Multi-file code review (each file → different bucket)
 * - Data processing (10k rows → chunks → parallel processing)
 */

const ContextChunker = require('./context-chunker');

class BucketMapReduce {
  constructor(options = {}) {
    this.bucketOrchestrator = options.bucketOrchestrator;
    this.chunker = new ContextChunker({
      maxTokens: options.maxTokens || 4096,
      overlapTokens: options.overlapTokens || 200,
      safetyMargin: options.safetyMargin || 500
    });

    // Aggregation strategies
    this.strategies = {
      concatenate: this._concatenateResults.bind(this),
      summarize: this._summarizeResults.bind(this),
      statistics: this._statisticsResults.bind(this),
      structured: this._structuredResults.bind(this)
    };
  }

  /**
   * Check if document needs map-reduce processing
   *
   * @param {string} document - Document to check
   * @returns {boolean} - True if chunking needed
   */
  needsMapReduce(document) {
    return this.chunker.needsChunking(document);
  }

  /**
   * Get recommended strategy for document
   *
   * @param {string} document - Document to analyze
   * @returns {object} - Strategy recommendation
   */
  recommendStrategy(document) {
    const stats = this.chunker.getStats(document);
    return stats.strategy;
  }

  /**
   * Execute full map-reduce pipeline
   *
   * @param {object} params - { document, systemPrompt, strategy, userId, sessionId }
   * @returns {Promise<object>} - Aggregated result
   */
  async execute(params) {
    const {
      document,
      systemPrompt = '',
      strategy = 'auto',
      userId,
      sessionId,
      context = {}
    } = params;

    console.log('[BucketMapReduce] Starting map-reduce processing...');

    const startTime = Date.now();

    // Step 1: Analyze document and determine strategy
    const stats = this.chunker.getStats(document);
    const actualStrategy = strategy === 'auto' ? stats.strategy.strategy : strategy;

    console.log(`[BucketMapReduce] Document: ${stats.totalTokens} tokens`);
    console.log(`[BucketMapReduce] Chunks: ${stats.chunkCount}`);
    console.log(`[BucketMapReduce] Strategy: ${actualStrategy}`);

    // If document fits in single bucket, skip map-reduce
    if (actualStrategy === 'direct') {
      console.log('[BucketMapReduce] Document fits in single bucket, routing directly');
      return await this.bucketOrchestrator.route({
        prompt: document,
        userId,
        sessionId,
        context
      });
    }

    // Step 2: MAP - Create chunks and route to buckets
    const mapResult = await this._mapPhase(document, systemPrompt, {
      userId,
      sessionId,
      context,
      strategy: actualStrategy
    });

    // Step 3: REDUCE - Aggregate results
    const reduceResult = await this._reducePhase(mapResult, actualStrategy);

    const totalTime = Date.now() - startTime;

    console.log(`[BucketMapReduce] Complete in ${totalTime}ms`);

    return {
      ...reduceResult,
      metadata: {
        mapReduce: true,
        strategy: actualStrategy,
        chunks: mapResult.chunks.length,
        bucketsUsed: mapResult.results.length,
        totalTime,
        stats
      }
    };
  }

  /**
   * MAP PHASE: Split document and route to buckets
   * @private
   */
  async _mapPhase(document, systemPrompt, options) {
    console.log('[BucketMapReduce] MAP phase: Chunking and routing...');

    // Create chunks with prompts
    const chunkedPrompts = this.chunker.createChunkedPrompts(systemPrompt, document);

    console.log(`[BucketMapReduce] Created ${chunkedPrompts.length} chunks`);

    // Route each chunk to a bucket (in parallel)
    const routingPromises = chunkedPrompts.map(async (chunk, index) => {
      console.log(`[BucketMapReduce]   Routing chunk ${index + 1}/${chunkedPrompts.length} (${chunk.tokens} tokens)`);

      try {
        const result = await this.bucketOrchestrator.route({
          prompt: chunk.prompt,
          userId: options.userId,
          sessionId: options.sessionId,
          context: {
            ...options.context,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            isChunk: true
          }
        });

        return {
          chunkIndex: chunk.chunkIndex,
          success: true,
          bucketId: result.bucketId,
          bucketName: result.bucketName,
          response: result.response,
          responseTime: result.responseTime,
          reasoning: result.reasoning
        };

      } catch (error) {
        console.error(`[BucketMapReduce]   Chunk ${index + 1} failed:`, error.message);

        return {
          chunkIndex: chunk.chunkIndex,
          success: false,
          error: error.message
        };
      }
    });

    // Execute all chunks in parallel
    const results = await Promise.all(routingPromises);

    // Check for failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn(`[BucketMapReduce] ${failures.length}/${results.length} chunks failed`);
    }

    return {
      chunks: chunkedPrompts,
      results: results.filter(r => r.success),
      failures
    };
  }

  /**
   * REDUCE PHASE: Aggregate bucket results
   * @private
   */
  async _reducePhase(mapResult, strategy) {
    console.log('[BucketMapReduce] REDUCE phase: Aggregating results...');

    // Sort results by chunk index
    const sortedResults = mapResult.results.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Extract responses
    const responses = sortedResults.map(r => r.response);

    // Apply aggregation strategy
    const aggregationFn = this.strategies[strategy] || this.strategies.concatenate;
    const aggregatedResponse = await aggregationFn(responses, sortedResults);

    // Combine reasoning from all buckets
    const combinedReasoning = this._combineReasoning(sortedResults);

    // Calculate aggregate performance
    const totalResponseTime = sortedResults.reduce((sum, r) => sum + (r.responseTime || 0), 0);
    const avgResponseTime = totalResponseTime / sortedResults.length;

    return {
      success: true,
      response: aggregatedResponse,
      reasoning: combinedReasoning,
      performance: {
        totalResponseTime,
        avgResponseTime,
        chunksProcessed: sortedResults.length,
        chunksFailed: mapResult.failures.length
      },
      buckets: sortedResults.map(r => ({
        bucketId: r.bucketId,
        bucketName: r.bucketName,
        chunkIndex: r.chunkIndex
      }))
    };
  }

  /**
   * AGGREGATION STRATEGY: Concatenate
   * Simply join all responses together
   * @private
   */
  _concatenateResults(responses) {
    return this.chunker.combineResponses(responses);
  }

  /**
   * AGGREGATION STRATEGY: Summarize
   * Use another bucket to summarize combined results
   * @private
   */
  async _summarizeResults(responses, results) {
    const combined = this.chunker.combineResponses(responses);

    // Use bucket-writing to create summary
    console.log('[BucketMapReduce] Creating summary of combined results...');

    try {
      const summaryResult = await this.bucketOrchestrator.route({
        prompt: `Summarize the following text concisely:\n\n${combined}`,
        context: {
          intent: 'summarize',
          isSummary: true
        }
      });

      return summaryResult.response;

    } catch (error) {
      console.error('[BucketMapReduce] Summary failed, falling back to concatenation');
      return combined;
    }
  }

  /**
   * AGGREGATION STRATEGY: Statistics
   * Extract statistics from each chunk and combine
   * @private
   */
  _statisticsResults(responses, results) {
    const stats = {
      totalChunks: responses.length,
      totalLength: 0,
      totalWords: 0,
      bucketsUsed: {},
      responses: []
    };

    for (const result of results) {
      const response = result.response;

      stats.totalLength += response.length;
      stats.totalWords += response.split(/\s+/).length;

      // Track which buckets were used
      stats.bucketsUsed[result.bucketId] = (stats.bucketsUsed[result.bucketId] || 0) + 1;

      stats.responses.push({
        chunkIndex: result.chunkIndex,
        bucketId: result.bucketId,
        length: response.length,
        words: response.split(/\s+/).length,
        preview: response.substring(0, 100)
      });
    }

    return `
# Document Processing Statistics

**Chunks Processed**: ${stats.totalChunks}
**Total Length**: ${stats.totalLength} characters
**Total Words**: ${stats.totalWords} words
**Average Chunk Size**: ${Math.round(stats.totalLength / stats.totalChunks)} characters

## Buckets Used
${Object.entries(stats.bucketsUsed).map(([id, count]) => `- ${id}: ${count} chunks`).join('\n')}

## Chunk Responses
${stats.responses.map(r => `
### Chunk ${r.chunkIndex + 1} (${r.bucketId})
- Length: ${r.length} chars, ${r.words} words
- Preview: ${r.preview}...
`).join('\n')}
    `.trim();
  }

  /**
   * AGGREGATION STRATEGY: Structured
   * Parse JSON from each bucket and merge objects
   * @private
   */
  _structuredResults(responses) {
    const merged = {};

    for (let i = 0; i < responses.length; i++) {
      try {
        const parsed = JSON.parse(responses[i]);
        Object.assign(merged, parsed);
      } catch (error) {
        console.warn(`[BucketMapReduce] Chunk ${i} not valid JSON, skipping`);
      }
    }

    return JSON.stringify(merged, null, 2);
  }

  /**
   * Combine reasoning from all buckets
   * @private
   */
  _combineReasoning(results) {
    const reasoningParts = results
      .filter(r => r.reasoning)
      .map(r => `**Chunk ${r.chunkIndex + 1} (${r.bucketName}):**\n${r.reasoning.why}`)
      .join('\n\n');

    return {
      why: `Map-Reduce processing across ${results.length} chunks:\n\n${reasoningParts}`,
      decisionFactors: {
        chunking: true,
        parallelProcessing: true,
        bucketsUsed: results.length
      }
    };
  }

  /**
   * Get statistics about document
   *
   * @param {string} document - Document to analyze
   * @returns {object} - Statistics
   */
  getDocumentStats(document) {
    return this.chunker.getStats(document);
  }

  /**
   * Classify chunk to determine best bucket
   * (Simple keyword-based for now, can be enhanced)
   *
   * @param {string} chunk - Chunk to classify
   * @returns {string} - Suggested category ('code', 'creative', 'data', etc.)
   */
  classifyChunk(chunk) {
    const lower = chunk.toLowerCase();

    // Code patterns
    if (/(function|class|const|var|let|import|export|return|if|for|while)/i.test(chunk)) {
      return 'code';
    }

    // Data patterns
    if (/(table|csv|json|data|rows|columns|statistics|numbers)/i.test(lower)) {
      return 'data';
    }

    // Creative writing patterns
    if (/(story|narrative|character|plot|scene|dialogue)/i.test(lower)) {
      return 'creative';
    }

    // Default
    return 'general';
  }
}

module.exports = BucketMapReduce;
