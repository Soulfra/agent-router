/**
 * Ollama Routes
 *
 * API routes for Ollama model management and chat
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/**
 * GET /api/ollama/models
 * List all available Ollama models
 */
router.get('/models', async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });

    const models = response.data.models || [];

    res.json({
      status: 'success',
      ollamaUrl: OLLAMA_URL,
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
        ollamaUrl: OLLAMA_URL,
        available: false,
        message: 'Ollama service is not running',
        hint: 'Run: npm run ollama:start'
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/ollama/status
 * Check Ollama service health
 */
router.get('/status', async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });

    res.json({
      status: 'running',
      ollamaUrl: OLLAMA_URL,
      modelCount: response.data.models?.length || 0
    });

  } catch (error) {
    res.status(503).json({
      status: 'offline',
      ollamaUrl: OLLAMA_URL,
      error: error.message
    });
  }
});

/**
 * POST /api/ollama/generate
 * Generate text with Ollama model
 */
router.post('/generate', async (req, res) => {
  try {
    const { model, prompt, stream = false } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'Model and prompt are required'
      });
    }

    // Forward request to Ollama
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model,
        prompt,
        stream: false // Always disable streaming for simplicity
      },
      {
        timeout: 120000, // 2 minute timeout for generation
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Return response
    res.json({
      status: 'success',
      model,
      response: response.data.response || response.data.content || '',
      content: response.data.response || response.data.content || '',
      context: response.data.context,
      done: response.data.done
    });

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        status: 'error',
        message: 'Ollama service is not running',
        hint: 'Run: npm run ollama:start'
      });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(504).json({
        status: 'error',
        message: 'Generation timed out - model may be too large or busy'
      });
    }

    console.error('Ollama generate error:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.response?.data?.error || error.message
    });
  }
});

module.exports = router;
