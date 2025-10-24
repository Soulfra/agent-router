/**
 * Model Registry Proxy Routes
 *
 * Exposes Ollama and other AI models beyond localhost.
 * Provides unified API for model discovery across multiple providers.
 *
 * Problem Solved:
 * - Ollama runs on localhost:11434 (not accessible externally)
 * - External clients need to discover available models
 * - Model tags need to be accessible outside of localhost
 *
 * Endpoints:
 * - GET  /api/models/discover - Trigger model discovery from all sources
 * - GET  /api/models - List all discovered models with filtering
 * - GET  /api/models/stats - Discovery statistics
 * - GET  /api/models/ollama/tags - Proxy to Ollama /api/tags
 * - POST /api/models/ollama/generate - Proxy to Ollama /api/generate
 * - POST /api/models/ollama/chat - Proxy to Ollama /api/chat
 * - GET  /api/models/:provider/:modelId - Get specific model info
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

// Global modelDiscoveryService instance (set via initializeModelRoutes)
let modelDiscoveryService = null;

/**
 * Initialize routes with ModelDiscoveryService instance
 */
function initializeModelRoutes({ discoveryService }) {
  modelDiscoveryService = discoveryService;
  console.log('[ModelRegistryRoutes] Initialized with ModelDiscoveryService');
}

/**
 * Middleware to ensure model service is initialized
 */
function requireModelService(req, res, next) {
  if (!modelDiscoveryService) {
    return res.status(503).json({
      error: 'Model service not initialized',
      message: 'ModelDiscoveryService is not available'
    });
  }
  next();
}

/**
 * GET /api/models/discover
 * Trigger fresh model discovery from all sources
 */
router.get('/discover', requireModelService, async (req, res) => {
  try {
    console.log('[ModelRegistryRoutes] Triggering model discovery...');

    const results = await modelDiscoveryService.discover();

    res.json({
      success: true,
      discovery: results
    });
  } catch (error) {
    console.error('[ModelRegistryRoutes] Discovery error:', error.message);
    res.status(500).json({
      error: 'Discovery failed',
      message: error.message
    });
  }
});

/**
 * GET /api/models
 * List all discovered models with optional filtering
 *
 * Query params:
 * - provider: Filter by provider (ollama, openrouter, huggingface, together, groq)
 * - family: Filter by model family (llama, mistral, gpt, claude, etc.)
 * - capabilities: Filter by capabilities (chat, code, vision, etc.)
 * - limit: Max number of results (default 1000)
 * - local: Only show local models (true/false)
 */
router.get('/', requireModelService, async (req, res) => {
  try {
    const { provider, family, capabilities, limit, local } = req.query;

    // Get models from cache
    let models = await modelDiscoveryService.getCachedModels({
      provider,
      family,
      capabilities: capabilities ? capabilities.split(',') : undefined,
      limit: limit ? parseInt(limit) : 1000
    });

    // Filter for local models if requested
    if (local === 'true') {
      models = models.filter(m => m.local === true);
    }

    // If no cached models and cache is stale, trigger discovery
    if (models.length === 0 && modelDiscoveryService.isCacheStale()) {
      console.log('[ModelRegistryRoutes] Cache stale, triggering background discovery...');
      modelDiscoveryService.discover().catch(err => {
        console.error('[ModelRegistryRoutes] Background discovery failed:', err.message);
      });
    }

    // Return last discovery results if no database
    if (models.length === 0 && modelDiscoveryService.lastDiscovery) {
      models = Object.values(modelDiscoveryService.lastDiscovery.sources)
        .flatMap(source => source.models || []);

      // Apply filters
      if (provider) {
        models = models.filter(m => m.provider === provider);
      }
      if (family) {
        models = models.filter(m => m.family === family);
      }
      if (local === 'true') {
        models = models.filter(m => m.local === true);
      }
      if (limit) {
        models = models.slice(0, parseInt(limit));
      }
    }

    res.json({
      success: true,
      count: models.length,
      cacheStale: modelDiscoveryService.isCacheStale(),
      models
    });
  } catch (error) {
    console.error('[ModelRegistryRoutes] List models error:', error.message);
    res.status(500).json({
      error: 'Failed to list models',
      message: error.message
    });
  }
});

/**
 * GET /api/models/stats
 * Get model discovery statistics
 */
router.get('/stats', requireModelService, (req, res) => {
  try {
    const stats = modelDiscoveryService.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[ModelRegistryRoutes] Stats error:', error.message);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * GET /api/models/ollama/tags
 * Proxy to Ollama /api/tags endpoint
 *
 * This exposes local Ollama models beyond localhost
 */
router.get('/ollama/tags', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

    console.log('[ModelRegistryRoutes] Proxying request to Ollama /api/tags');

    const response = await axios.get(`${ollamaUrl}/api/tags`, {
      timeout: 10000
    });

    res.json(response.data);
  } catch (error) {
    console.error('[ModelRegistryRoutes] Ollama tags proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama not available',
        message: 'Ollama is not running or not accessible at localhost:11434'
      });
    }

    res.status(500).json({
      error: 'Ollama proxy error',
      message: error.message
    });
  }
});

/**
 * POST /api/models/ollama/generate
 * Proxy to Ollama /api/generate endpoint
 *
 * Body:
 * - model: string (model name)
 * - prompt: string
 * - stream: boolean (optional)
 * - options: object (optional)
 */
router.post('/ollama/generate', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const { model, prompt, stream = false, options = {} } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['model', 'prompt']
      });
    }

    console.log(`[ModelRegistryRoutes] Proxying generate request to Ollama: ${model}`);

    if (stream) {
      // For streaming responses, pipe the response
      const response = await axios.post(
        `${ollamaUrl}/api/generate`,
        { model, prompt, stream: true, options },
        { responseType: 'stream', timeout: 300000 }
      );

      res.setHeader('Content-Type', 'application/x-ndjson');
      response.data.pipe(res);
    } else {
      // For non-streaming responses
      const response = await axios.post(
        `${ollamaUrl}/api/generate`,
        { model, prompt, stream: false, options },
        { timeout: 300000 }
      );

      res.json(response.data);
    }
  } catch (error) {
    console.error('[ModelRegistryRoutes] Ollama generate proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama not available',
        message: 'Ollama is not running or not accessible'
      });
    }

    res.status(500).json({
      error: 'Ollama proxy error',
      message: error.message
    });
  }
});

/**
 * POST /api/models/ollama/chat
 * Proxy to Ollama /api/chat endpoint
 *
 * Body:
 * - model: string (model name)
 * - messages: array of {role, content}
 * - stream: boolean (optional)
 * - options: object (optional)
 */
router.post('/ollama/chat', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const { model, messages, stream = false, options = {} } = req.body;

    if (!model || !messages) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['model', 'messages']
      });
    }

    console.log(`[ModelRegistryRoutes] Proxying chat request to Ollama: ${model}`);

    if (stream) {
      // For streaming responses, pipe the response
      const response = await axios.post(
        `${ollamaUrl}/api/chat`,
        { model, messages, stream: true, options },
        { responseType: 'stream', timeout: 300000 }
      );

      res.setHeader('Content-Type', 'application/x-ndjson');
      response.data.pipe(res);
    } else {
      // For non-streaming responses
      const response = await axios.post(
        `${ollamaUrl}/api/chat`,
        { model, messages, stream: false, options },
        { timeout: 300000 }
      );

      res.json(response.data);
    }
  } catch (error) {
    console.error('[ModelRegistryRoutes] Ollama chat proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama not available',
        message: 'Ollama is not running or not accessible'
      });
    }

    res.status(500).json({
      error: 'Ollama proxy error',
      message: error.message
    });
  }
});

/**
 * POST /api/models/ollama/embeddings
 * Proxy to Ollama /api/embeddings endpoint
 *
 * Body:
 * - model: string (model name)
 * - prompt: string
 */
router.post('/ollama/embeddings', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const { model, prompt } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['model', 'prompt']
      });
    }

    console.log(`[ModelRegistryRoutes] Proxying embeddings request to Ollama: ${model}`);

    const response = await axios.post(
      `${ollamaUrl}/api/embeddings`,
      { model, prompt },
      { timeout: 60000 }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[ModelRegistryRoutes] Ollama embeddings proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama not available',
        message: 'Ollama is not running or not accessible'
      });
    }

    res.status(500).json({
      error: 'Ollama proxy error',
      message: error.message
    });
  }
});

/**
 * GET /api/models/ollama/show/:modelName
 * Proxy to Ollama /api/show endpoint to get model details
 */
router.get('/ollama/show/:modelName', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const { modelName } = req.params;

    console.log(`[ModelRegistryRoutes] Proxying show request to Ollama: ${modelName}`);

    const response = await axios.post(
      `${ollamaUrl}/api/show`,
      { name: modelName },
      { timeout: 10000 }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[ModelRegistryRoutes] Ollama show proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama not available',
        message: 'Ollama is not running or not accessible'
      });
    }

    res.status(500).json({
      error: 'Ollama proxy error',
      message: error.message
    });
  }
});

/**
 * GET /api/models/:provider/:modelId
 * Get specific model information
 */
router.get('/:provider/:modelId', requireModelService, async (req, res) => {
  try {
    const { provider, modelId } = req.params;
    const fullModelId = `${provider}:${modelId}`;

    // Try to get from cache
    const models = await modelDiscoveryService.getCachedModels({ limit: 10000 });
    const model = models.find(m => m.id === fullModelId);

    if (!model && modelDiscoveryService.lastDiscovery) {
      // Try last discovery results
      const allModels = Object.values(modelDiscoveryService.lastDiscovery.sources)
        .flatMap(source => source.models || []);
      const foundModel = allModels.find(m => m.id === fullModelId);

      if (foundModel) {
        return res.json({
          success: true,
          model: foundModel
        });
      }
    }

    if (!model) {
      return res.status(404).json({
        error: 'Model not found',
        modelId: fullModelId
      });
    }

    res.json({
      success: true,
      model
    });
  } catch (error) {
    console.error('[ModelRegistryRoutes] Get model error:', error.message);
    res.status(500).json({
      error: 'Failed to get model',
      message: error.message
    });
  }
});

/**
 * GET /api/models/families
 * List all model families with counts
 */
router.get('/families', requireModelService, async (req, res) => {
  try {
    const models = await modelDiscoveryService.getCachedModels({ limit: 10000 });

    // If no cached models, use last discovery
    let allModels = models;
    if (models.length === 0 && modelDiscoveryService.lastDiscovery) {
      allModels = Object.values(modelDiscoveryService.lastDiscovery.sources)
        .flatMap(source => source.models || []);
    }

    // Count by family
    const families = {};
    for (const model of allModels) {
      const family = model.family || 'unknown';
      if (!families[family]) {
        families[family] = {
          family,
          count: 0,
          providers: new Set(),
          examples: []
        };
      }
      families[family].count++;
      families[family].providers.add(model.provider);
      if (families[family].examples.length < 3) {
        families[family].examples.push(model.name);
      }
    }

    // Convert providers Set to Array
    const familiesArray = Object.values(families).map(f => ({
      ...f,
      providers: Array.from(f.providers)
    }));

    res.json({
      success: true,
      count: familiesArray.length,
      families: familiesArray.sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    console.error('[ModelRegistryRoutes] Get families error:', error.message);
    res.status(500).json({
      error: 'Failed to get families',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

  res.json({
    success: true,
    status: 'healthy',
    modelServiceInitialized: !!modelDiscoveryService,
    ollamaUrl,
    cacheStale: modelDiscoveryService ? modelDiscoveryService.isCacheStale() : true,
    timestamp: new Date()
  });
});

module.exports = {
  router,
  initializeModelRoutes
};
