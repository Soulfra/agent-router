/**
 * Context Haiku Compression
 *
 * "Shrink context down into a haiku and then back out"
 *
 * Problem:
 * - Large contexts (conversations, logs, documents) consume massive tokens
 * - Need to compress contexts into minimal representations
 * - Must be able to reconstruct/expand compressed contexts
 * - Ollama models need to work with pasted content
 *
 * Solution:
 * - AI-powered context compression using Ollama
 * - Multi-level compression (summary, outline, haiku)
 * - Bidirectional: compress → expand
 * - Storage of compressed contexts with metadata
 *
 * Compression Levels:
 * 1. summary (50% compression) - Detailed summary with key points
 * 2. outline (80% compression) - Structured outline of main topics
 * 3. haiku (95% compression) - Ultra-minimal representation
 *
 * Example:
 * Large context (10,000 tokens) →
 * Haiku (500 tokens) →
 * Expanded context (8,000 tokens, reconstructed)
 */

const axios = require('axios');
const crypto = require('crypto');

class ContextHaikuCompressor {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaUrl = options.ollamaUrl || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    this.defaultModel = options.defaultModel || 'mistral:latest';

    // Compression cache
    // Map: contextHash -> compressed context
    this.compressionCache = new Map();
    this.maxCacheSize = options.maxCacheSize || 1000;

    console.log('[ContextHaiku] Initialized');
    console.log(`[ContextHaiku] Ollama URL: ${this.ollamaUrl}`);
    console.log(`[ContextHaiku] Default model: ${this.defaultModel}`);
  }

  /**
   * Compress context into a haiku
   *
   * @param {Object} params
   * @param {string} params.context - The context to compress
   * @param {string} params.level - Compression level (summary, outline, haiku)
   * @param {string} params.model - Ollama model to use (optional)
   * @param {Object} params.metadata - Additional metadata (optional)
   * @returns {Promise<Object>} Compressed result
   */
  async compress({ context, level = 'haiku', model = null, metadata = {} }) {
    const startTime = Date.now();
    const contextHash = this._hashContext(context);

    // Check cache
    const cacheKey = `${contextHash}:${level}`;
    if (this.compressionCache.has(cacheKey)) {
      console.log('[ContextHaiku] Cache hit for compression');
      return this.compressionCache.get(cacheKey);
    }

    const compressionModel = model || this.defaultModel;

    console.log(`[ContextHaiku] Compressing ${context.length} chars to ${level} using ${compressionModel}`);

    // Generate compression prompt based on level
    const prompt = this._buildCompressionPrompt(context, level);

    try {
      // Call Ollama to compress
      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: compressionModel,
          prompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more consistent compression
            top_p: 0.9
          }
        },
        { timeout: 120000 }
      );

      const compressed = response.data.response.trim();
      const compressionRatio = (compressed.length / context.length) * 100;

      const result = {
        compressionId: crypto.randomUUID(),
        contextHash,
        originalLength: context.length,
        compressedLength: compressed.length,
        compressionRatio: compressionRatio.toFixed(2) + '%',
        level,
        model: compressionModel,
        compressed,
        metadata: {
          ...metadata,
          compressedAt: new Date().toISOString(),
          duration: Date.now() - startTime
        }
      };

      // Cache result
      this.compressionCache.set(cacheKey, result);
      if (this.compressionCache.size > this.maxCacheSize) {
        const firstKey = this.compressionCache.keys().next().value;
        this.compressionCache.delete(firstKey);
      }

      // Store in database if available
      if (this.db) {
        await this._storeCompression(contextHash, context, result);
      }

      console.log(`[ContextHaiku] Compressed ${context.length} → ${compressed.length} chars (${result.compressionRatio}) in ${result.metadata.duration}ms`);

      return result;
    } catch (error) {
      console.error('[ContextHaiku] Compression error:', error.message);
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  /**
   * Expand a compressed haiku back into full context
   *
   * @param {Object} params
   * @param {string} params.compressed - The compressed context
   * @param {string} params.level - Original compression level
   * @param {string} params.model - Ollama model to use (optional)
   * @param {Object} params.hints - Hints to guide expansion (optional)
   * @returns {Promise<Object>} Expanded result
   */
  async expand({ compressed, level = 'haiku', model = null, hints = {} }) {
    const startTime = Date.now();
    const expansionModel = model || this.defaultModel;

    console.log(`[ContextHaiku] Expanding ${compressed.length} chars from ${level} using ${expansionModel}`);

    // Generate expansion prompt based on level
    const prompt = this._buildExpansionPrompt(compressed, level, hints);

    try {
      // Call Ollama to expand
      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: expansionModel,
          prompt,
          stream: false,
          options: {
            temperature: 0.7, // Higher temperature for more creative expansion
            top_p: 0.9
          }
        },
        { timeout: 120000 }
      );

      const expanded = response.data.response.trim();
      const expansionRatio = (expanded.length / compressed.length).toFixed(2);

      const result = {
        expansionId: crypto.randomUUID(),
        compressedLength: compressed.length,
        expandedLength: expanded.length,
        expansionRatio: `${expansionRatio}x`,
        level,
        model: expansionModel,
        expanded,
        metadata: {
          expandedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          hints
        }
      };

      console.log(`[ContextHaiku] Expanded ${compressed.length} → ${expanded.length} chars (${result.expansionRatio}) in ${result.metadata.duration}ms`);

      return result;
    } catch (error) {
      console.error('[ContextHaiku] Expansion error:', error.message);
      throw new Error(`Expansion failed: ${error.message}`);
    }
  }

  /**
   * Compress and store context for later retrieval
   */
  async compressAndStore({ context, level = 'haiku', model = null, tags = [], description = '' }) {
    const compression = await this.compress({ context, level, model });

    const stored = {
      ...compression,
      originalContext: context,
      tags,
      description,
      storedAt: new Date().toISOString()
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO compressed_contexts (
          compression_id, context_hash, original_context, compressed,
          original_length, compressed_length, compression_ratio,
          level, model, tags, description, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          compression.compressionId,
          compression.contextHash,
          context,
          compression.compressed,
          compression.originalLength,
          compression.compressedLength,
          compression.compressionRatio,
          level,
          model || this.defaultModel,
          JSON.stringify(tags),
          description,
          JSON.stringify(compression.metadata)
        ]
      );
    }

    return stored;
  }

  /**
   * Retrieve compressed context by ID or hash
   */
  async retrieve({ compressionId = null, contextHash = null }) {
    if (!this.db) {
      throw new Error('Database required for retrieval');
    }

    let query, params;
    if (compressionId) {
      query = 'SELECT * FROM compressed_contexts WHERE compression_id = $1';
      params = [compressionId];
    } else if (contextHash) {
      query = 'SELECT * FROM compressed_contexts WHERE context_hash = $1 ORDER BY created_at DESC LIMIT 1';
      params = [contextHash];
    } else {
      throw new Error('Either compressionId or contextHash is required');
    }

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Round-trip test: compress → expand → compare
   */
  async roundTripTest({ context, level = 'haiku', model = null }) {
    console.log('[ContextHaiku] Starting round-trip test...');

    const startTime = Date.now();

    // Step 1: Compress
    const compressed = await this.compress({ context, level, model });

    // Step 2: Expand
    const expanded = await this.expand({
      compressed: compressed.compressed,
      level,
      model,
      hints: { originalLength: context.length }
    });

    // Step 3: Compare
    const similarity = this._calculateSimilarity(context, expanded.expanded);

    const result = {
      testId: crypto.randomUUID(),
      originalLength: context.length,
      compressedLength: compressed.compressedLength,
      expandedLength: expanded.expandedLength,
      compressionRatio: compressed.compressionRatio,
      expansionRatio: expanded.expansionRatio,
      similarity: similarity.toFixed(2) + '%',
      duration: Date.now() - startTime,
      level,
      model: model || this.defaultModel,
      original: context,
      compressed: compressed.compressed,
      expanded: expanded.expanded
    };

    console.log(`[ContextHaiku] Round-trip test complete: ${context.length} → ${compressed.compressedLength} → ${expanded.expandedLength} chars, ${result.similarity} similarity`);

    return result;
  }

  /**
   * Build compression prompt based on level
   * @private
   */
  _buildCompressionPrompt(context, level) {
    const prompts = {
      summary: `Summarize the following context into a detailed summary that captures all key points, decisions, and important details. Be comprehensive but concise.

Context:
${context}

Detailed Summary:`,

      outline: `Create a structured outline of the following context. Include main topics, subtopics, and key points. Use bullet points and hierarchical structure.

Context:
${context}

Structured Outline:`,

      haiku: `Compress the following context into an ultra-minimal representation. Extract only the most essential information: key entities, main actions, critical decisions, and core concepts. Be extremely concise.

Context:
${context}

Minimal Representation:`
    };

    return prompts[level] || prompts.haiku;
  }

  /**
   * Build expansion prompt based on level
   * @private
   */
  _buildExpansionPrompt(compressed, level, hints = {}) {
    const basePrompt = {
      summary: `Expand the following summary into a full, detailed context. Elaborate on each point with reasonable assumptions and details.

Summary:
${compressed}

Expanded Context:`,

      outline: `Expand the following outline into a complete, detailed context. Fill in details for each topic and subtopic with reasonable explanations.

Outline:
${compressed}

Expanded Context:`,

      haiku: `Expand the following minimal representation into a full, detailed context. Reconstruct the narrative, add reasonable details, and make it comprehensive.

Minimal Representation:
${compressed}

Expanded Context:`
    };

    let prompt = basePrompt[level] || basePrompt.haiku;

    // Add hints if provided
    if (hints.originalLength) {
      prompt = `Target length: approximately ${hints.originalLength} characters.\n\n${prompt}`;
    }

    if (hints.style) {
      prompt = `Writing style: ${hints.style}\n\n${prompt}`;
    }

    return prompt;
  }

  /**
   * Hash context for caching/deduplication
   * @private
   */
  _hashContext(context) {
    return crypto.createHash('sha256').update(context).digest('hex').substring(0, 16);
  }

  /**
   * Calculate similarity between two texts (simple character-based)
   * @private
   */
  _calculateSimilarity(text1, text2) {
    // Simple Jaccard similarity on word sets
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return (intersection.size / union.size) * 100;
  }

  /**
   * Store compression in database
   * @private
   */
  async _storeCompression(contextHash, originalContext, result) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO context_compressions (
          compression_id, context_hash, original_length, compressed_length,
          compression_ratio, level, model, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (compression_id) DO NOTHING`,
        [
          result.compressionId,
          contextHash,
          result.originalLength,
          result.compressedLength,
          result.compressionRatio,
          result.level,
          result.model,
          JSON.stringify(result.metadata)
        ]
      );
    } catch (error) {
      console.error('[ContextHaiku] Error storing compression:', error.message);
    }
  }

  /**
   * Get compression statistics
   */
  async getStats() {
    const stats = {
      cacheSize: this.compressionCache.size,
      maxCacheSize: this.maxCacheSize,
      ollamaUrl: this.ollamaUrl,
      defaultModel: this.defaultModel
    };

    if (this.db) {
      try {
        const result = await this.db.query(`
          SELECT
            COUNT(*) as total_compressions,
            AVG(CAST(REPLACE(compression_ratio, '%', '') AS FLOAT)) as avg_compression_ratio,
            COUNT(DISTINCT level) as compression_levels,
            COUNT(DISTINCT model) as models_used
          FROM context_compressions
        `);

        stats.database = result.rows[0];
      } catch (error) {
        console.error('[ContextHaiku] Error getting stats:', error.message);
      }
    }

    return stats;
  }

  /**
   * Clear compression cache
   */
  clearCache() {
    const size = this.compressionCache.size;
    this.compressionCache.clear();
    console.log(`[ContextHaiku] Cleared cache (${size} entries)`);
  }
}

module.exports = ContextHaikuCompressor;
