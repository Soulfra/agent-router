/**
 * Diagnostic Routes
 *
 * Testing and debugging endpoints for model routing and system health
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

let modelWrapper = null;

/**
 * Initialize routes with model wrapper
 */
function initRoutes(wrapper) {
  modelWrapper = wrapper;
  console.log('✓ Diagnostic routes initialized');
  return router;
}

/**
 * GET /api/diagnostic/ollama/models
 * List all available Ollama models
 */
router.get('/ollama/models', async (req, res) => {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });

    const models = response.data.models || [];

    res.json({
      status: 'success',
      ollamaUrl,
      available: true,
      count: models.length,
      models: models.map(m => ({
        name: m.name,
        size: Math.round(m.size / 1024 / 1024) + ' MB',
        family: m.details?.family,
        parameters: m.details?.parameter_size,
        modified: m.modified_at
      }))
    });

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        status: 'error',
        message: 'Ollama not running',
        available: false,
        instructions: 'Start Ollama with: ollama serve'
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/diagnostic/model-detection
 * Test model detection logic (internal vs external)
 *
 * Body: { models: ["mistral", "gpt-4", "ollama:calos-model:latest", ...] }
 */
router.post('/model-detection', (req, res) => {
  try {
    const { models } = req.body;

    if (!models || !Array.isArray(models)) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must include "models" array'
      });
    }

    const results = models.map(model => {
      const isInternal = modelWrapper.isInternalModel(model);
      const info = modelWrapper.getModelInfo(model);

      return {
        model,
        isInternal,
        source: info.source,
        priority: info.priority,
        costPer1kTokens: info.costPer1kTokens
      };
    });

    res.json({
      status: 'success',
      results
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/diagnostic/test-model
 * Test a model with a simple prompt
 *
 * Body:
 * - model: Model name to test
 * - prompt: Optional prompt (default: "Say hello")
 */
router.post('/test-model', async (req, res) => {
  try {
    const {
      model,
      prompt = 'Say hello in one sentence'
    } = req.body;

    if (!model) {
      return res.status(400).json({
        status: 'error',
        message: 'Model name required'
      });
    }

    const startTime = Date.now();

    // Execute via model wrapper
    const result = await modelWrapper.execute({
      model,
      prompt,
      context: {},
      sessionBlock: null,
      roomId: null
    });

    const duration = Date.now() - startTime;

    res.json({
      status: 'success',
      model: result.model,
      source: result.source,
      internal: result.internal,
      response: result.response,
      tokens: result.tokens,
      durationMs: duration
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      model: req.body.model
    });
  }
});

/**
 * GET /api/diagnostic/config
 * Show current configuration
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      ollama: {
        url: process.env.OLLAMA_URL || 'http://localhost:11434',
        configured: true
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        keyPresent: process.env.OPENAI_API_KEY ? '✓' : '✗'
      },
      anthropic: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        keyPresent: process.env.ANTHROPIC_API_KEY ? '✓' : '✗'
      },
      deepseek: {
        configured: !!process.env.DEEPSEEK_API_KEY,
        keyPresent: process.env.DEEPSEEK_API_KEY ? '✓' : '✗'
      },
      modelWrapper: modelWrapper.getStats()
    };

    res.json({
      status: 'success',
      config
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/diagnostic/health
 * Overall system health check
 */
router.get('/health', async (req, res) => {
  const checks = {
    ollama: { status: 'unknown' },
    database: { status: 'unknown' },
    apiKeys: { status: 'unknown' }
  };

  // Check Ollama
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });
    checks.ollama = { status: 'healthy', url: ollamaUrl };
  } catch (error) {
    checks.ollama = {
      status: 'unhealthy',
      error: error.code === 'ECONNREFUSED' ? 'Not running' : error.message
    };
  }

  // Check API keys
  const keysConfigured = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY
  };

  const hasAnyKey = Object.values(keysConfigured).some(v => v);

  checks.apiKeys = {
    status: hasAnyKey ? 'partial' : 'none',
    configured: keysConfigured,
    warning: !hasAnyKey ? 'No external API keys configured. Only Ollama will work.' : null
  };

  const overallHealthy = checks.ollama.status === 'healthy';

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});

module.exports = { router, initRoutes };
