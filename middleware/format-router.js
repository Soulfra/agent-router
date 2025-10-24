/**
 * Format Translation Middleware
 *
 * Routes requests to appropriate service adapters based on service type.
 * Translates between different formats (Git, LSP, Game API, OCR, etc.)
 *
 * Flow:
 * 1. Detect service type from request
 * 2. Route to appropriate adapter
 * 3. Translate response to expected format
 * 4. Return formatted response
 */

const GitAdapter = require('../lib/service-adapters/git-adapter');
const CopilotAdapter = require('../lib/service-adapters/copilot-adapter');
const GamingAdapter = require('../lib/service-adapters/gaming-adapter');
const OCRAdapter = require('../lib/service-adapters/ocr-adapter');

class FormatRouter {
  constructor(options = {}) {
    this.db = options.db;

    // Initialize service adapters
    this.adapters = {
      git: new GitAdapter({
        ollamaPort: 11435,
        ollamaHost: options.ollamaHost || 'http://localhost'
      }),
      copilot: new CopilotAdapter({
        ollamaPort: 11437,
        ollamaHost: options.ollamaHost || 'http://localhost',
        codeIndexer: options.codeIndexer,
        triangleConsensus: options.triangleConsensus
      }),
      gaming: new GamingAdapter({
        ollamaPort: 11436,
        ollamaHost: options.ollamaHost || 'http://localhost',
        db: this.db,
        npcManager: options.npcManager
      }),
      ocr: new OCRAdapter({
        ollamaPort: 11436,
        ollamaHost: options.ollamaHost || 'http://localhost',
        iiifServer: options.iiifServer
      })
    };
  }

  /**
   * Express middleware function
   */
  middleware() {
    return async (req, res, next) => {
      try {
        // Detect service type from request
        const service = this._detectService(req);

        if (!service || service === 'standard') {
          // Standard service - no special formatting needed
          return next();
        }

        // Attach service adapter to request
        req.serviceAdapter = this.adapters[service];
        req.serviceType = service;

        // Attach format translator
        req.formatTranslator = this._getTranslator(service);

        // Override res.json to format response
        const originalJson = res.json.bind(res);
        res.json = (data) => {
          const formatted = req.formatTranslator.format(data);
          return originalJson(formatted);
        };

        next();
      } catch (error) {
        console.error('[FormatRouter] Error:', error);
        next(error);
      }
    };
  }

  /**
   * Detect service type from request
   *
   * Detection strategies:
   * 1. Explicit service field in body
   * 2. URL path (/api/git/*, /api/copilot/*, etc.)
   * 3. Request headers (X-Service-Type)
   * 4. Request content analysis
   */
  _detectService(req) {
    // Strategy 1: Explicit service field
    if (req.body && req.body.service) {
      return req.body.service;
    }

    // Strategy 2: URL path
    const path = req.path || req.url;

    if (path.includes('/git') || path.includes('/github')) {
      return 'git';
    }

    if (path.includes('/copilot') || path.includes('/completion') || path.includes('/lsp')) {
      return 'copilot';
    }

    if (path.includes('/gaming') || path.includes('/npc') || path.includes('/map')) {
      return 'gaming';
    }

    if (path.includes('/ocr') || path.includes('/extract') || path.includes('/vision')) {
      return 'ocr';
    }

    // Strategy 3: Headers
    const serviceHeader = req.get('X-Service-Type');
    if (serviceHeader) {
      return serviceHeader.toLowerCase();
    }

    // Strategy 4: Content analysis
    if (req.body) {
      // Git indicators
      if (req.body.diff || req.body.commit_message || req.body.pull_request || req.body.repository) {
        return 'git';
      }

      // Copilot/LSP indicators
      if (req.body.textDocument || req.body.position || req.body.operation === 'complete') {
        return 'copilot';
      }

      // Gaming indicators
      if (req.body.npc_id || req.body.map_name || req.body.location || req.body.quest_id) {
        return 'gaming';
      }

      // OCR indicators
      if (req.body.image_url || req.body.image_base64 || req.body.operation === 'extract_text') {
        return 'ocr';
      }
    }

    // Default: standard service
    return 'standard';
  }

  /**
   * Get format translator for service type
   */
  _getTranslator(service) {
    switch (service) {
      case 'git':
        return new GitFormatTranslator();
      case 'copilot':
        return new LSPFormatTranslator();
      case 'gaming':
        return new GameFormatTranslator();
      case 'ocr':
        return new OCRFormatTranslator();
      default:
        return new StandardFormatTranslator();
    }
  }
}

/**
 * Git Format Translator
 */
class GitFormatTranslator {
  format(data) {
    return {
      service: 'git',
      timestamp: new Date().toISOString(),
      data
    };
  }
}

/**
 * LSP Format Translator
 */
class LSPFormatTranslator {
  format(data) {
    // If data is already LSP-formatted (has isIncomplete, items), return as-is
    if (data && typeof data === 'object' && 'items' in data) {
      return data; // Already LSP CompletionList
    }

    // Otherwise, wrap in LSP envelope
    return {
      jsonrpc: '2.0',
      id: Date.now(),
      result: data
    };
  }
}

/**
 * Game Format Translator
 */
class GameFormatTranslator {
  format(data) {
    return {
      service: 'gaming',
      timestamp: new Date().toISOString(),
      game_time: this._getGameTime(),
      data
    };
  }

  _getGameTime() {
    // Example: Convert real time to in-game time
    // (e.g., 1 real second = 1 in-game minute)
    const now = new Date();
    return {
      real_time: now.toISOString(),
      game_time: `Day ${Math.floor(now.getTime() / 86400000)}, ${now.getHours()}:${now.getMinutes()}`
    };
  }
}

/**
 * OCR Format Translator
 */
class OCRFormatTranslator {
  format(data) {
    return {
      service: 'ocr',
      timestamp: new Date().toISOString(),
      data
    };
  }
}

/**
 * Standard Format Translator (OpenAI-compatible)
 */
class StandardFormatTranslator {
  format(data) {
    return data; // No transformation for standard
  }
}

/**
 * Route request to appropriate service adapter
 *
 * Standalone function for use in route handlers
 */
async function routeToService(request) {
  const { service, operation, context = {}, prompt } = request;

  const formatRouter = new FormatRouter({
    db: request.db,
    ollamaHost: request.ollamaHost
  });

  const adapter = formatRouter.adapters[service];

  if (!adapter) {
    throw new Error(`Unknown service: ${service}`);
  }

  const result = await adapter.handle({
    operation,
    context,
    prompt
  });

  return adapter.format(result);
}

module.exports = {
  FormatRouter,
  GitFormatTranslator,
  LSPFormatTranslator,
  GameFormatTranslator,
  OCRFormatTranslator,
  StandardFormatTranslator,
  routeToService
};
