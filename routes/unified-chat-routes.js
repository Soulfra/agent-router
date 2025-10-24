/**
 * Unified Chat API Routes
 *
 * Single endpoint that routes to ALL LLM providers:
 * - DeepSeek (deepseek-*)
 * - Anthropic (claude-*)
 * - OpenAI (gpt-*)
 * - Ollama (everything else)
 *
 * Endpoint: POST /api/chat
 *
 * Request:
 * {
 *   "model": "gpt-4" | "claude-3-5-sonnet-20241022" | "deepseek-chat" | "llama3.2:3b",
 *   "prompt": "Your message here",
 *   "systemPrompt": "Optional system prompt",
 *   "domain": "calos.ai" | "soulfra.com" | etc (for domain-specific branding)
 * }
 *
 * Response:
 * {
 *   "response": "AI response text",
 *   "model": "actual-model-used",
 *   "provider": "openai" | "anthropic" | "deepseek" | "ollama",
 *   "usage": { "total_tokens": 100 }
 * }
 */

const express = require('express');
const router = express.Router();

const AnthropicAdapter = require('../lib/provider-adapters/anthropic-adapter');
const OpenAIAdapter = require('../lib/provider-adapters/openai-adapter');
const DeepSeekAdapter = require('../lib/provider-adapters/deepseek-adapter');
const OllamaAdapter = require('../lib/provider-adapters/ollama-adapter');
const DomainSystemPrompts = require('../lib/domain-system-prompts');

// Initialize providers
const providers = {
  anthropic: new AnthropicAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY,
    enabled: !!process.env.ANTHROPIC_API_KEY
  }),
  openai: new OpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY,
    enabled: !!process.env.OPENAI_API_KEY
  }),
  deepseek: new DeepSeekAdapter({
    apiKey: process.env.DEEPSEEK_API_KEY,
    enabled: !!process.env.DEEPSEEK_API_KEY
  }),
  ollama: new OllamaAdapter({
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    enabled: true // Always enabled (local)
  })
};

const domainPrompts = new DomainSystemPrompts();

/**
 * POST /api/chat
 * Unified chat endpoint - routes to appropriate provider
 */
router.post('/chat', async (req, res) => {
  try {
    const { model, prompt, systemPrompt, domain, temperature, maxTokens } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields: model and prompt'
      });
    }

    // Determine provider based on model name
    const provider = determineProvider(model);

    console.log(`[UnifiedChat] Routing to ${provider} for model: ${model}`);

    // Check if provider is available
    if (!providers[provider].isAvailable()) {
      // Fallback to Ollama if primary provider unavailable
      if (provider !== 'ollama' && providers.ollama.isAvailable()) {
        console.log(`[UnifiedChat] ${provider} unavailable, falling back to Ollama`);
        return await handleOllamaFallback(req, res, model, prompt, systemPrompt, domain);
      }

      return res.status(503).json({
        error: `${provider} provider not available`,
        hint: provider === 'ollama'
          ? 'Run: ollama serve'
          : `Set ${provider.toUpperCase()}_API_KEY in .env file`
      });
    }

    // Get domain-specific system prompt if domain provided
    let finalSystemPrompt = systemPrompt;
    if (domain && !systemPrompt) {
      finalSystemPrompt = domainPrompts.getPrompt(domain);
    }

    // Build request
    const request = {
      model,
      prompt,
      systemPrompt: finalSystemPrompt,
      temperature: temperature !== undefined ? temperature : 0.7,
      maxTokens: maxTokens || 2000
    };

    // Call provider
    const startTime = Date.now();
    const response = await providers[provider].complete(request);
    const latency = Date.now() - startTime;

    // Return unified response
    res.json({
      response: response.text,
      model: response.model || model,
      provider: provider,
      usage: response.usage,
      latency: latency
    });

  } catch (error) {
    console.error('[UnifiedChat] Error:', error);

    res.status(500).json({
      error: error.message,
      provider: error.provider || 'unknown'
    });
  }
});

/**
 * GET /api/chat/models
 * List all available models from all providers
 */
router.get('/chat/models', async (req, res) => {
  try {
    const allModels = [];

    // OpenAI models
    if (providers.openai.isAvailable()) {
      allModels.push({
        provider: 'openai',
        models: [
          { name: 'gpt-4-turbo-preview', display: 'GPT-4 Turbo', contextWindow: 128000 },
          { name: 'gpt-4', display: 'GPT-4', contextWindow: 8192 },
          { name: 'gpt-3.5-turbo', display: 'GPT-3.5 Turbo', contextWindow: 16385 }
        ]
      });
    }

    // Anthropic models
    if (providers.anthropic.isAvailable()) {
      allModels.push({
        provider: 'anthropic',
        models: [
          { name: 'claude-3-5-sonnet-20241022', display: 'Claude 3.5 Sonnet', contextWindow: 200000 },
          { name: 'claude-3-opus-20240229', display: 'Claude 3 Opus', contextWindow: 200000 },
          { name: 'claude-3-haiku-20240307', display: 'Claude 3 Haiku', contextWindow: 200000 }
        ]
      });
    }

    // DeepSeek models
    if (providers.deepseek.isAvailable()) {
      allModels.push({
        provider: 'deepseek',
        models: [
          { name: 'deepseek-chat', display: 'DeepSeek Chat', contextWindow: 32768 },
          { name: 'deepseek-coder', display: 'DeepSeek Coder', contextWindow: 16384 },
          { name: 'deepseek-reasoner', display: 'DeepSeek Reasoner', contextWindow: 32768 }
        ]
      });
    }

    // Ollama models (fetch from running instance)
    if (providers.ollama.isAvailable()) {
      const axios = require('axios');
      try {
        const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });

        const ollamaModels = response.data.models.map(m => ({
          name: m.name,
          display: m.name.split(':')[0].toUpperCase() + ' ' + (m.details?.parameter_size || ''),
          contextWindow: 4096 // Default
        }));

        allModels.push({
          provider: 'ollama',
          models: ollamaModels
        });
      } catch (error) {
        console.error('[UnifiedChat] Failed to fetch Ollama models:', error.message);
      }
    }

    res.json({
      available: allModels.length > 0,
      providers: allModels,
      total: allModels.reduce((sum, p) => sum + p.models.length, 0)
    });

  } catch (error) {
    console.error('[UnifiedChat] Models error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/chat/providers
 * Check which providers are available
 */
router.get('/chat/providers', (req, res) => {
  res.json({
    openai: {
      available: providers.openai.isAvailable(),
      hint: !providers.openai.isAvailable() ? 'Set OPENAI_API_KEY in .env' : null
    },
    anthropic: {
      available: providers.anthropic.isAvailable(),
      hint: !providers.anthropic.isAvailable() ? 'Set ANTHROPIC_API_KEY in .env' : null
    },
    deepseek: {
      available: providers.deepseek.isAvailable(),
      hint: !providers.deepseek.isAvailable() ? 'Set DEEPSEEK_API_KEY in .env' : null
    },
    ollama: {
      available: providers.ollama.isAvailable(),
      hint: !providers.ollama.isAvailable() ? 'Run: ollama serve' : null
    }
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine provider based on model name
 */
function determineProvider(model) {
  if (model.startsWith('gpt-')) {
    return 'openai';
  } else if (model.startsWith('claude-')) {
    return 'anthropic';
  } else if (model.startsWith('deepseek-')) {
    return 'deepseek';
  } else {
    return 'ollama';
  }
}

/**
 * Map external models to Ollama equivalents
 */
function mapToOllamaModel(externalModel) {
  const mapping = {
    'gpt-4': 'llama3.2:3b',
    'gpt-3.5-turbo': 'llama3.2:3b',
    'claude-3-5-sonnet-20241022': 'llama3.2:3b',
    'deepseek-chat': 'qwen2.5-coder:1.5b'
  };

  return mapping[externalModel] || 'llama3.2:3b';
}

/**
 * Handle fallback to Ollama when primary provider fails
 */
async function handleOllamaFallback(req, res, model, prompt, systemPrompt, domain) {
  const ollamaModel = mapToOllamaModel(model);

  console.log(`[UnifiedChat] Falling back: ${model} → ollama:${ollamaModel}`);

  const request = {
    model: ollamaModel,
    prompt,
    systemPrompt: systemPrompt || (domain ? domainPrompts.getPrompt(domain) : null),
    temperature: 0.7,
    maxTokens: 2000
  };

  const response = await providers.ollama.complete(request);

  res.json({
    response: response.text,
    model: ollamaModel,
    provider: 'ollama',
    fallback: true,
    originalModel: model,
    usage: response.usage
  });
}

module.exports = router;
