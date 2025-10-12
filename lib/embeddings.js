/**
 * Embeddings Utility
 *
 * Generates vector embeddings for text using OpenAI's embedding models
 * or local alternatives. Used for semantic search and similarity matching.
 */

const OpenAI = require('openai');
const crypto = require('crypto');

class EmbeddingsGenerator {
  constructor(options = {}) {
    this.provider = options.provider || 'openai'; // 'openai' or 'local'
    this.model = options.model || 'text-embedding-ada-002';
    this.db = options.db || null;
    this.cacheEnabled = options.cache !== false;

    // Initialize OpenAI client
    if (this.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @param {object} options - Generation options
   * @returns {Promise<Array>} - Embedding vector
   */
  async generate(text, options = {}) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Check cache first
    if (this.cacheEnabled && this.db) {
      const cached = await this._getCachedEmbedding(text);
      if (cached) {
        return cached;
      }
    }

    let embedding;

    if (this.provider === 'openai') {
      embedding = await this._generateOpenAI(text, options);
    } else if (this.provider === 'local') {
      embedding = await this._generateLocal(text, options);
    } else {
      throw new Error(`Unsupported provider: ${this.provider}`);
    }

    // Cache embedding
    if (this.cacheEnabled && this.db) {
      await this._cacheEmbedding(text, embedding);
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * @param {Array<string>} texts - Array of texts
   * @returns {Promise<Array<Array>>} - Array of embeddings
   */
  async generateBatch(texts) {
    if (this.provider === 'openai') {
      return await this._generateOpenAIBatch(texts);
    } else {
      // Fallback to sequential generation
      const embeddings = [];
      for (const text of texts) {
        embeddings.push(await this.generate(text));
      }
      return embeddings;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {Array} embedding1 - First embedding
   * @param {Array} embedding2 - Second embedding
   * @returns {number} - Similarity score (0-1)
   */
  cosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Find most similar texts from a list
   * @param {string} query - Query text
   * @param {Array<{text: string, embedding?: Array}>} candidates - Candidate texts
   * @param {number} topK - Number of results to return
   * @returns {Promise<Array>} - Top K similar texts with scores
   */
  async findSimilar(query, candidates, topK = 5) {
    const queryEmbedding = await this.generate(query);

    const results = [];

    for (const candidate of candidates) {
      let candidateEmbedding = candidate.embedding;

      if (!candidateEmbedding) {
        candidateEmbedding = await this.generate(candidate.text);
      }

      const similarity = this.cosineSimilarity(queryEmbedding, candidateEmbedding);

      results.push({
        ...candidate,
        similarity: similarity
      });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }

  /**
   * Search for similar cached responses in database
   * @param {string} query - Query text
   * @param {string} provider - AI provider filter
   * @param {string} model - Model filter
   * @param {number} threshold - Minimum similarity (0-1)
   * @param {number} limit - Max results
   * @returns {Promise<Array>} - Similar responses
   */
  async searchSimilarResponses(query, provider = null, model = null, threshold = 0.8, limit = 5) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const queryEmbedding = await this.generate(query);

    // Build query with filters
    let sql = `
      SELECT
        r.id,
        r.provider,
        r.model,
        r.query_text,
        r.response,
        r.created_at,
        1 - (e.embedding <=> $1::vector) AS similarity
      FROM ai_responses r
      JOIN ai_embeddings e ON r.id = e.response_id
      WHERE 1 - (e.embedding <=> $1::vector) > $2
    `;

    const params = [JSON.stringify(queryEmbedding), threshold];
    let paramIndex = 3;

    if (provider) {
      sql += ` AND r.provider = $${paramIndex}`;
      params.push(provider);
      paramIndex++;
    }

    if (model) {
      sql += ` AND r.model = $${paramIndex}`;
      params.push(model);
      paramIndex++;
    }

    sql += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(sql, params);

    return result.rows || [];
  }

  /**
   * Store embedding for a response in database
   * @param {number} responseId - Response ID
   * @param {string} text - Text to embed
   */
  async storeResponseEmbedding(responseId, text) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const embedding = await this.generate(text);

    await this.db.query(
      `INSERT INTO ai_embeddings (response_id, embedding, embedding_model)
       VALUES ($1, $2, $3)
       ON CONFLICT (response_id) DO NOTHING`,
      [responseId, JSON.stringify(embedding), this.model]
    );

    console.log(`💾 Stored embedding for response ${responseId}`);
  }

  /**
   * Internal: Generate embedding using OpenAI
   */
  async _generateOpenAI(text, options = {}) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        ...options
      });

      return response.data[0].embedding;

    } catch (error) {
      console.error('OpenAI embedding error:', error.message);
      throw error;
    }
  }

  /**
   * Internal: Generate embeddings in batch using OpenAI
   */
  async _generateOpenAIBatch(texts) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts
      });

      return response.data.map(item => item.embedding);

    } catch (error) {
      console.error('OpenAI batch embedding error:', error.message);
      throw error;
    }
  }

  /**
   * Internal: Generate embedding using local model (Ollama)
   */
  async _generateLocal(text, options = {}) {
    if (!this.ollamaClient) {
      const OllamaEmbeddings = require('./ollama-embeddings');
      this.ollamaClient = new OllamaEmbeddings({
        model: options.model || 'nomic-embed-text:latest'
      });
    }

    try {
      return await this.ollamaClient.generate(text);
    } catch (error) {
      console.error('Ollama embedding failed:', error.message);
      throw new Error(`Local embedding failed: ${error.message}`);
    }
  }

  /**
   * Internal: Get cached embedding from database
   */
  async _getCachedEmbedding(text) {
    if (!this.db) return null;

    try {
      const textHash = this._hashText(text);

      const result = await this.db.query(
        `SELECT embedding FROM embedding_cache WHERE text_hash = $1`,
        [textHash]
      );

      if (result.rows && result.rows.length > 0) {
        return JSON.parse(result.rows[0].embedding);
      }

      return null;

    } catch (error) {
      // Cache lookup is optional
      return null;
    }
  }

  /**
   * Internal: Cache embedding to database
   */
  async _cacheEmbedding(text, embedding) {
    if (!this.db) return;

    try {
      const textHash = this._hashText(text);

      await this.db.query(
        `INSERT INTO embedding_cache (text_hash, text, embedding, model)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (text_hash) DO NOTHING`,
        [textHash, text, JSON.stringify(embedding), this.model]
      );

    } catch (error) {
      // Cache write is optional
      console.error('Embedding cache write error:', error.message);
    }
  }

  /**
   * Internal: Hash text for cache key
   */
  _hashText(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}

module.exports = EmbeddingsGenerator;
