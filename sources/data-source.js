/**
 * Data Source Abstraction Layer
 *
 * Provides a unified interface for fetching AI responses from either:
 * - Live API calls (OpenAI, Claude, DeepSeek, Ollama)
 * - Local database cache (for --local mode)
 *
 * Key design principle: Maintain IDENTICAL output format and behavior
 * regardless of whether we fetch from API or database.
 */

const axios = require('axios');
const OpenAI = require('openai');
const crypto = require('crypto');

class DataSource {
  constructor(options = {}) {
    this.mode = options.mode || 'api'; // 'api' or 'local'
    this.db = options.db || null; // Database connection (when local mode)
    this.cachingEnabled = options.caching !== false; // Default: true

    // Initialize OpenAI client for API mode
    if (this.mode === 'api') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Set mode dynamically (api or local)
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Set database connection for local mode
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * Fetch from OpenAI (or local cache if in local mode)
   */
  async fetchOpenAI(model, messages, options = {}) {
    const context = options.context || {};
    const requestTimestamp = new Date();  // Track request start time

    // Check if we should use local mode
    const useLocal = context.local || this.mode === 'local';

    if (useLocal && this.db) {
      // Try to fetch from local database
      const cached = await this._fetchFromCache('openai', model, messages);
      if (cached) {
        const responseTimestamp = new Date();
        const latencyMs = responseTimestamp - requestTimestamp;

        // Track cache hit metric
        if (this.db) {
          await this._recordMetric('@openai:' + model, 'cache_hit', latencyMs, cached.id);
        }

        return cached.response;
      }

      // If no cache and strict local mode, return error
      if (context.strictLocal) {
        return '⚠️ No cached response available in local mode. Run without --local to fetch from API.';
      }
    }

    // Fetch from API
    if (!process.env.OPENAI_API_KEY) {
      return '⚠️ OpenAI API key not configured. Set OPENAI_API_KEY in .env file.';
    }

    const response = await this.openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000
    });

    const responseTimestamp = new Date();
    const latencyMs = responseTimestamp - requestTimestamp;
    const content = response.choices[0].message.content;

    // Cache response if caching enabled
    if (this.cachingEnabled && this.db) {
      await this._cacheResponse('openai', model, messages, content, response, {
        requestTimestamp,
        responseTimestamp,
        latencyMs
      });
    }

    // Track latency metric
    if (this.db) {
      await this._recordMetric('@openai:' + model, 'latency', latencyMs);
    }

    return content;
  }

  /**
   * Fetch from Claude/Anthropic (or local cache)
   */
  async fetchClaude(messages, options = {}) {
    const context = options.context || {};
    const useLocal = context.local || this.mode === 'local';

    if (useLocal && this.db) {
      const cached = await this._fetchFromCache('anthropic', 'claude-3-5-sonnet-20241022', messages);
      if (cached) {
        return cached.response;
      }

      if (context.strictLocal) {
        return '⚠️ No cached response available in local mode. Run without --local to fetch from API.';
      }
    }

    // Fetch from API
    if (!process.env.ANTHROPIC_API_KEY) {
      return '⚠️ Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env file.';
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: options.max_tokens || 1024,
        messages: messages,
        system: options.system || 'You are Cal, a helpful AI assistant in the CalOS operating system.'
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.content[0].text;

    // Cache response
    if (this.cachingEnabled && this.db) {
      await this._cacheResponse('anthropic', 'claude-3-5-sonnet-20241022', messages, content, response.data);
    }

    return content;
  }

  /**
   * Fetch from DeepSeek (or local cache)
   */
  async fetchDeepSeek(messages, options = {}) {
    const context = options.context || {};
    const useLocal = context.local || this.mode === 'local';

    if (useLocal && this.db) {
      const cached = await this._fetchFromCache('deepseek', 'deepseek-chat', messages);
      if (cached) {
        return cached.response;
      }

      if (context.strictLocal) {
        return '⚠️ No cached response available in local mode. Run without --local to fetch from API.';
      }
    }

    // Fetch from API
    if (!process.env.DEEPSEEK_API_KEY) {
      return '⚠️ DeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env file.';
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;

    // Cache response
    if (this.cachingEnabled && this.db) {
      await this._cacheResponse('deepseek', 'deepseek-chat', messages, content, response.data);
    }

    return content;
  }

  /**
   * Fetch from Ollama (or local cache)
   */
  async fetchOllama(model, messages, options = {}) {
    const context = options.context || {};
    const useLocal = context.local || this.mode === 'local';

    if (useLocal && this.db) {
      const cached = await this._fetchFromCache('ollama', model, messages);
      if (cached) {
        return cached.response;
      }

      if (context.strictLocal) {
        return '⚠️ No cached response available in local mode. Run without --local to fetch from API.';
      }
    }

    // Fetch from Ollama API
    const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';

    try {
      const response = await axios.post(
        `${ollamaUrl}/api/chat`,
        {
          model: model,
          messages: messages,
          stream: false
        },
        {
          timeout: options.timeout || 60000
        }
      );

      const content = response.data.message.content;

      // Cache response
      if (this.cachingEnabled && this.db) {
        await this._cacheResponse('ollama', model, messages, content, response.data);
      }

      return content;

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return `⚠️ Ollama not running. Start Ollama with: ollama serve\nOr install from: https://ollama.ai`;
      }
      throw error;
    }
  }

  /**
   * Internal: Fetch from cache
   */
  async _fetchFromCache(provider, model, messages) {
    if (!this.db) return null;

    try {
      // Generate query hash for cache lookup
      const queryHash = this._hashMessages(messages);

      // Query database for cached response
      const result = await this.db.query(
        `SELECT id, response, metadata, created_at, latency_ms
         FROM ai_responses
         WHERE provider = $1
           AND model = $2
           AND query_hash = $3
         ORDER BY created_at DESC
         LIMIT 1`,
        [provider, model, queryHash]
      );

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`📦 Cache hit for ${provider}:${model} (original latency: ${row.latency_ms}ms)`);
        return {
          id: row.id,
          response: row.response,
          metadata: row.metadata,
          cached: true,
          cachedAt: row.created_at,
          originalLatency: row.latency_ms
        };
      }

      // Try semantic search if exact match not found
      const semanticMatch = await this._semanticSearch(provider, model, messages);
      if (semanticMatch) {
        console.log(`🔍 Semantic match found for ${provider}:${model}`);
        return semanticMatch;
      }

      return null;

    } catch (error) {
      console.error('Cache lookup error:', error.message);
      return null;
    }
  }

  /**
   * Internal: Cache response to database
   * @param {object} timing - Optional timing data {requestTimestamp, responseTimestamp, latencyMs}
   */
  async _cacheResponse(provider, model, messages, response, metadata = {}, timing = {}) {
    if (!this.db) return;

    try {
      const queryHash = this._hashMessages(messages);
      const queryText = messages[messages.length - 1]?.content || '';

      // Extract timing information
      const requestTimestamp = timing.requestTimestamp || new Date();
      const responseTimestamp = timing.responseTimestamp || new Date();
      const latencyMs = timing.latencyMs || (responseTimestamp - requestTimestamp);

      await this.db.query(
        `INSERT INTO ai_responses
         (request_timestamp, response_timestamp, latency_ms, provider, model, query_hash, query_text, messages, response, metadata, cache_hit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (provider, model, query_hash)
         DO UPDATE SET
           response = EXCLUDED.response,
           metadata = EXCLUDED.metadata,
           response_timestamp = EXCLUDED.response_timestamp,
           latency_ms = EXCLUDED.latency_ms,
           updated_at = CURRENT_TIMESTAMP`,
        [
          requestTimestamp,
          responseTimestamp,
          latencyMs,
          provider,
          model,
          queryHash,
          queryText,
          JSON.stringify(messages),
          response,
          JSON.stringify(metadata),
          false  // cache_hit = false (this is a fresh API call)
        ]
      );

      console.log(`💾 Cached response for ${provider}:${model} (${latencyMs}ms)`);

    } catch (error) {
      console.error('Cache write error:', error.message);
    }
  }

  /**
   * Internal: Semantic search for similar queries
   * (Requires embeddings table and pgvector extension)
   */
  async _semanticSearch(provider, model, messages, threshold = 0.85) {
    if (!this.db) return null;

    try {
      // Get embedding for current query
      const queryText = messages[messages.length - 1]?.content || '';
      const embedding = await this._getEmbedding(queryText);

      if (!embedding) return null;

      // Find similar cached responses using cosine similarity
      const result = await this.db.query(
        `SELECT r.response, r.metadata, r.created_at,
                1 - (e.embedding <=> $1::vector) AS similarity
         FROM ai_responses r
         JOIN ai_embeddings e ON r.id = e.response_id
         WHERE r.provider = $2
           AND r.model = $3
           AND 1 - (e.embedding <=> $1::vector) > $4
         ORDER BY similarity DESC
         LIMIT 1`,
        [JSON.stringify(embedding), provider, model, threshold]
      );

      if (result.rows && result.rows.length > 0) {
        const match = result.rows[0];
        console.log(`  Similarity: ${(match.similarity * 100).toFixed(1)}%`);
        return {
          response: match.response,
          metadata: match.metadata,
          cached: true,
          cachedAt: match.created_at,
          similarity: match.similarity
        };
      }

      return null;

    } catch (error) {
      // Semantic search is optional - don't fail if not available
      if (error.message.includes('does not exist')) {
        console.log('⚠️ Semantic search not available (missing embeddings table or pgvector extension)');
      } else {
        console.error('Semantic search error:', error.message);
      }
      return null;
    }
  }

  /**
   * Internal: Generate embedding for semantic search
   */
  async _getEmbedding(text) {
    if (!process.env.OPENAI_API_KEY) {
      return null; // Embeddings require OpenAI API key
    }

    try {
      const EmbeddingsGenerator = require('../lib/embeddings');
      const embedder = new EmbeddingsGenerator({
        provider: 'openai',
        model: 'text-embedding-ada-002',
        db: this.db,
        cache: true
      });

      return await embedder.generate(text);

    } catch (error) {
      console.error('Embedding generation error:', error.message);
      return null;
    }
  }

  /**
   * Internal: Record agent metric
   * @param {string} agentId - Agent identifier (e.g., '@gpt4', '@ollama:mistral')
   * @param {string} metricType - Type of metric ('latency', 'cache_hit', 'error', 'request')
   * @param {number} value - Metric value (e.g., latency in ms)
   * @param {number} responseId - Optional link to ai_responses table
   * @param {string} requestHash - Optional request hash
   */
  async _recordMetric(agentId, metricType, value, responseId = null, requestHash = null) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO agent_metrics
         (agent_id, metric_type, value, response_id, request_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [agentId, metricType, value, responseId, requestHash]
      );
    } catch (error) {
      // Don't log metric errors - they're not critical
      // console.error('Metric recording error:', error.message);
    }
  }

  /**
   * Internal: Hash messages for cache key
   */
  _hashMessages(messages) {
    const normalized = JSON.stringify(messages, null, 0);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}

module.exports = DataSource;
