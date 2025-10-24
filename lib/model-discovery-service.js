/**
 * Model Discovery Service
 *
 * Auto-discovers AI models from multiple sources:
 * - Ollama (localhost)
 * - OpenRouter API
 * - HuggingFace Inference API
 * - Together.ai
 * - Groq
 * - Custom endpoints
 *
 * Features:
 * - Automatic discovery on app launch
 * - 24-hour cache TTL
 * - Manual refresh via API
 * - Per-user model preferences
 * - Model categorization (chat, code, vision, etc.)
 */

const axios = require('axios');

class ModelDiscoveryService {
  constructor(options = {}) {
    this.db = options.db;
    this.cacheDir = options.cacheDir || './.cache';
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours

    // API configuration
    this.sources = {
      ollama: {
        enabled: true,
        url: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
        requiresAuth: false
      },
      openrouter: {
        enabled: !!process.env.OPENROUTER_API_KEY,
        url: 'https://openrouter.ai/api/v1/models',
        requiresAuth: true,
        apiKey: process.env.OPENROUTER_API_KEY
      },
      huggingface: {
        enabled: !!process.env.HUGGINGFACE_API_KEY,
        url: 'https://api-inference.huggingface.co/models',
        requiresAuth: true,
        apiKey: process.env.HUGGINGFACE_API_KEY
      },
      together: {
        enabled: !!process.env.TOGETHER_API_KEY,
        url: 'https://api.together.xyz/v1/models',
        requiresAuth: true,
        apiKey: process.env.TOGETHER_API_KEY
      },
      groq: {
        enabled: !!process.env.GROQ_API_KEY,
        url: 'https://api.groq.com/openai/v1/models',
        requiresAuth: true,
        apiKey: process.env.GROQ_API_KEY
      }
    };

    this.lastDiscovery = null;
    this.discoveredModels = new Map();

    console.log('[ModelDiscovery] Initialized');
    console.log('[ModelDiscovery] Enabled sources:',
      Object.entries(this.sources)
        .filter(([_, config]) => config.enabled)
        .map(([name]) => name)
        .join(', ')
    );
  }

  /**
   * Discover models from all enabled sources
   * @returns {Promise<Object>} Discovery results
   */
  async discover() {
    console.log('[ModelDiscovery] Starting discovery...');
    const startTime = Date.now();

    const results = {
      timestamp: new Date().toISOString(),
      sources: {},
      totalModels: 0,
      newModels: 0,
      errors: []
    };

    // Discover from each source in parallel
    const discoveries = await Promise.allSettled([
      this.discoverOllama(),
      this.discoverOpenRouter(),
      this.discoverHuggingFace(),
      this.discoverTogether(),
      this.discoverGroq()
    ]);

    // Process results
    discoveries.forEach((result, index) => {
      const sourceName = ['ollama', 'openrouter', 'huggingface', 'together', 'groq'][index];

      if (result.status === 'fulfilled') {
        results.sources[sourceName] = result.value;
        results.totalModels += result.value.count;
      } else {
        results.errors.push({
          source: sourceName,
          error: result.reason.message
        });
        results.sources[sourceName] = { count: 0, error: result.reason.message };
      }
    });

    // Store in database if available
    if (this.db) {
      try {
        await this.storeDiscoveryResults(results);
      } catch (error) {
        console.error('[ModelDiscovery] Error storing results:', error.message);
      }
    }

    this.lastDiscovery = results;
    const duration = Date.now() - startTime;

    console.log(`[ModelDiscovery] Discovery complete in ${duration}ms`);
    console.log(`[ModelDiscovery] Found ${results.totalModels} total models across ${Object.keys(results.sources).length} sources`);

    return results;
  }

  /**
   * Discover Ollama models (local)
   */
  async discoverOllama() {
    if (!this.sources.ollama.enabled) {
      return { count: 0, models: [], source: 'ollama', status: 'disabled' };
    }

    try {
      const response = await axios.get(`${this.sources.ollama.url}/api/tags`, {
        timeout: 5000
      });

      const models = (response.data.models || []).map(model => {
        const detectedFamily = this._detectModelFamily(model.name);
        const reportedFamily = model.details?.family || model.details?.families?.[0];
        const architecture = model.details?.families || [];

        // Trust API data first (Ollama knows best), fall back to name detection
        const actualFamily = reportedFamily || detectedFamily || 'unknown';

        // Only warn about mismatch for known public models (not custom -model:latest builds)
        const isCustomModel = model.name.includes('-model:') || model.name.includes('-expert:');
        if (reportedFamily && detectedFamily && reportedFamily !== detectedFamily && !isCustomModel) {
          console.warn(`[ModelDiscovery] Family mismatch for ${model.name}: reported="${reportedFamily}" detected="${detectedFamily}"`);
        }

        return {
          id: `ollama:${model.name}`,
          name: model.name,
          provider: 'ollama',
          size: model.size,
          modified: model.modified_at,
          digest: model.digest,
          family: actualFamily,
          reported_family: reportedFamily,
          detected_family: detectedFamily,
          architecture: architecture,
          parameter_size: model.details?.parameter_size,
          quantization: model.details?.quantization_level,
          format: model.details?.format,
          capabilities: this._detectCapabilities(model.name),
          local: true,
          cost: 'free'
        };
      });

      console.log(`[ModelDiscovery] Ollama: Found ${models.length} models`);

      return {
        count: models.length,
        models,
        source: 'ollama',
        status: 'success'
      };
    } catch (error) {
      console.warn(`[ModelDiscovery] Ollama discovery failed: ${error.message}`);
      return { count: 0, models: [], source: 'ollama', status: 'offline' };
    }
  }

  /**
   * Discover OpenRouter models
   */
  async discoverOpenRouter() {
    if (!this.sources.openrouter.enabled) {
      return { count: 0, models: [], source: 'openrouter', status: 'disabled' };
    }

    try {
      const response = await axios.get(this.sources.openrouter.url, {
        headers: {
          'Authorization': `Bearer ${this.sources.openrouter.apiKey}`
        },
        timeout: 10000
      });

      const models = (response.data.data || []).map(model => ({
        id: `openrouter:${model.id}`,
        name: model.id,
        provider: 'openrouter',
        description: model.description,
        contextLength: model.context_length,
        pricing: {
          prompt: model.pricing?.prompt,
          completion: model.pricing?.completion
        },
        family: this._detectModelFamily(model.id),
        capabilities: this._detectCapabilities(model.id),
        local: false,
        cost: 'variable'
      }));

      console.log(`[ModelDiscovery] OpenRouter: Found ${models.length} models`);

      return {
        count: models.length,
        models,
        source: 'openrouter',
        status: 'success'
      };
    } catch (error) {
      console.warn(`[ModelDiscovery] OpenRouter discovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover HuggingFace models
   */
  async discoverHuggingFace() {
    if (!this.sources.huggingface.enabled) {
      return { count: 0, models: [], source: 'huggingface', status: 'disabled' };
    }

    try {
      // Get featured text-generation models
      const response = await axios.get('https://huggingface.co/api/models', {
        params: {
          pipeline_tag: 'text-generation',
          sort: 'downloads',
          limit: 50,
          full: true
        },
        headers: {
          'Authorization': `Bearer ${this.sources.huggingface.apiKey}`
        },
        timeout: 10000
      });

      const models = (response.data || [])
        .filter(model => model.private !== true)
        .map(model => ({
          id: `huggingface:${model.id}`,
          name: model.id,
          provider: 'huggingface',
          downloads: model.downloads,
          likes: model.likes,
          tags: model.tags,
          family: this._detectModelFamily(model.id),
          capabilities: this._detectCapabilities(model.id),
          local: false,
          cost: 'free'
        }));

      console.log(`[ModelDiscovery] HuggingFace: Found ${models.length} models`);

      return {
        count: models.length,
        models,
        source: 'huggingface',
        status: 'success'
      };
    } catch (error) {
      console.warn(`[ModelDiscovery] HuggingFace discovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover Together.ai models
   */
  async discoverTogether() {
    if (!this.sources.together.enabled) {
      return { count: 0, models: [], source: 'together', status: 'disabled' };
    }

    try {
      const response = await axios.get(this.sources.together.url, {
        headers: {
          'Authorization': `Bearer ${this.sources.together.apiKey}`
        },
        timeout: 10000
      });

      const models = (response.data || []).map(model => ({
        id: `together:${model.id}`,
        name: model.id,
        provider: 'together',
        contextLength: model.context_length,
        family: this._detectModelFamily(model.id),
        capabilities: this._detectCapabilities(model.id),
        local: false,
        cost: 'variable'
      }));

      console.log(`[ModelDiscovery] Together.ai: Found ${models.length} models`);

      return {
        count: models.length,
        models,
        source: 'together',
        status: 'success'
      };
    } catch (error) {
      console.warn(`[ModelDiscovery] Together.ai discovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover Groq models
   */
  async discoverGroq() {
    if (!this.sources.groq.enabled) {
      return { count: 0, models: [], source: 'groq', status: 'disabled' };
    }

    try {
      const response = await axios.get(this.sources.groq.url, {
        headers: {
          'Authorization': `Bearer ${this.sources.groq.apiKey}`
        },
        timeout: 10000
      });

      const models = (response.data.data || []).map(model => ({
        id: `groq:${model.id}`,
        name: model.id,
        provider: 'groq',
        contextLength: model.context_window,
        family: this._detectModelFamily(model.id),
        capabilities: this._detectCapabilities(model.id),
        local: false,
        cost: 'low'
      }));

      console.log(`[ModelDiscovery] Groq: Found ${models.length} models`);

      return {
        count: models.length,
        models,
        source: 'groq',
        status: 'success'
      };
    } catch (error) {
      console.warn(`[ModelDiscovery] Groq discovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect model family from name
   * @private
   */
  _detectModelFamily(modelName) {
    const name = modelName.toLowerCase();

    if (name.includes('gpt') || name.includes('chatgpt')) return 'gpt';
    if (name.includes('claude')) return 'claude';
    if (name.includes('llama')) return 'llama';
    if (name.includes('mistral')) return 'mistral';
    if (name.includes('mixtral')) return 'mixtral';
    if (name.includes('gemma')) return 'gemma';
    if (name.includes('qwen')) return 'qwen';
    if (name.includes('codellama') || name.includes('code-llama')) return 'codellama';
    if (name.includes('phi')) return 'phi';
    if (name.includes('falcon')) return 'falcon';
    if (name.includes('deepseek')) return 'deepseek';
    if (name.includes('yi')) return 'yi';

    return 'unknown';
  }

  /**
   * Detect model capabilities from name
   * @private
   */
  _detectCapabilities(modelName) {
    const name = modelName.toLowerCase();
    const capabilities = ['chat'];

    if (name.includes('code') || name.includes('coder')) {
      capabilities.push('code');
    }
    if (name.includes('vision') || name.includes('llava')) {
      capabilities.push('vision');
    }
    if (name.includes('instruct')) {
      capabilities.push('instruction-following');
    }
    if (name.includes('embed')) {
      capabilities.push('embeddings');
    }

    return capabilities;
  }

  /**
   * Store discovery results in database
   * @private
   */
  async storeDiscoveryResults(results) {
    if (!this.db) return;

    // Flatten all models from all sources
    const allModels = [];
    Object.values(results.sources).forEach(source => {
      if (source.models) {
        allModels.push(...source.models);
      }
    });

    // Insert or update models
    for (const model of allModels) {
      try {
        await this.db.query(
          `INSERT INTO discovered_models (
            model_id, name, provider, family, reported_family, detected_family,
            architecture, parameter_size, quantization, format, capabilities,
            metadata, discovered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (model_id) DO UPDATE SET
            name = $2,
            provider = $3,
            family = $4,
            reported_family = $5,
            detected_family = $6,
            architecture = $7,
            parameter_size = $8,
            quantization = $9,
            format = $10,
            capabilities = $11,
            metadata = $12,
            last_seen_at = NOW()`,
          [
            model.id,
            model.name,
            model.provider,
            model.family,
            model.reported_family || null,
            model.detected_family || null,
            JSON.stringify(model.architecture || []),
            model.parameter_size || null,
            model.quantization || null,
            model.format || null,
            JSON.stringify(model.capabilities),
            JSON.stringify(model)
          ]
        );
      } catch (error) {
        console.error(`[ModelDiscovery] Error storing model ${model.id}:`, error.message);
      }
    }

    // Store discovery event
    await this.db.query(
      `INSERT INTO model_discovery_events (
        total_models, sources_scanned, errors, metadata
      )
      VALUES ($1, $2, $3, $4)`,
      [
        results.totalModels,
        Object.keys(results.sources).length,
        JSON.stringify(results.errors),
        JSON.stringify(results)
      ]
    );
  }

  /**
   * Get cached models
   */
  async getCachedModels(options = {}) {
    if (!this.db) {
      return this.lastDiscovery ?
        Object.values(this.lastDiscovery.sources).flatMap(s => s.models || []) :
        [];
    }

    const { provider, family, capabilities, limit = 1000 } = options;

    let query = 'SELECT * FROM discovered_models WHERE 1=1';
    const params = [];

    if (provider) {
      params.push(provider);
      query += ` AND provider = $${params.length}`;
    }

    if (family) {
      params.push(family);
      query += ` AND family = $${params.length}`;
    }

    if (capabilities && capabilities.length > 0) {
      params.push(JSON.stringify(capabilities));
      query += ` AND capabilities @> $${params.length}`;
    }

    query += ` ORDER BY last_seen_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Check if cache is stale
   */
  isCacheStale() {
    if (!this.lastDiscovery) return true;

    const lastDiscoveryTime = new Date(this.lastDiscovery.timestamp).getTime();
    const now = Date.now();

    return (now - lastDiscoveryTime) > this.cacheTTL;
  }

  /**
   * Get discovery statistics
   */
  getStats() {
    return {
      lastDiscovery: this.lastDiscovery?.timestamp,
      cacheStale: this.isCacheStale(),
      totalModels: this.lastDiscovery?.totalModels || 0,
      sources: Object.entries(this.sources).map(([name, config]) => ({
        name,
        enabled: config.enabled,
        count: this.lastDiscovery?.sources[name]?.count || 0
      }))
    };
  }
}

module.exports = ModelDiscoveryService;
