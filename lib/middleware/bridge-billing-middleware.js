/**
 * Bridge Billing Middleware
 *
 * Tracks GitHub Pages → localhost API requests and logs to PostgreSQL
 *
 * Integrates with:
 * - lib/usage-tracker.js - Token usage tracking
 * - lib/vault-bridge.js - API key source detection
 * - middleware/tier-gate.js - Tier enforcement
 * - routes/billing-routes.js - Billing APIs
 *
 * Usage:
 *   const bridgeBillingMiddleware = require('./lib/middleware/bridge-billing-middleware');
 *   app.use(bridgeBillingMiddleware);
 */

const UsageTracker = require('../usage-tracker');
const VaultBridge = require('../vault-bridge');

class BridgeBillingMiddleware {
  constructor(db) {
    this.db = db;
    this.usageTracker = new UsageTracker(db);
    this.vaultBridge = new VaultBridge();
  }

  /**
   * Middleware function to track requests
   */
  middleware() {
    return async (req, res, next) => {
      // Only track API calls (not static files)
      if (!req.path.startsWith('/api/')) {
        return next();
      }

      // Skip health checks and billing endpoints themselves
      if (req.path === '/api/health' || req.path.startsWith('/api/billing')) {
        return next();
      }

      // Get user info
      const userId = req.user?.userId || req.headers['x-user-id'] || 'anonymous';
      const deviceFingerprint = req.headers['x-device-fingerprint'];
      const clientIp = req.headers['x-client-ip'] || req.ip;

      // Detect GitHub Pages origin
      const origin = req.headers.origin || req.headers.referer || 'unknown';
      const isGitHubPages = origin.includes('github.io');

      // Track request start time
      const startTime = Date.now();

      // Intercept response to capture usage data
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        // Calculate request duration
        const duration = Date.now() - startTime;

        // Track usage asynchronously (don't block response)
        this.trackUsage({
          userId,
          deviceFingerprint,
          clientIp,
          origin,
          isGitHubPages,
          endpoint: req.path,
          method: req.method,
          duration,
          statusCode: res.statusCode,
          request: req.body,
          response: data
        }).catch(error => {
          console.error('[BridgeBilling] Failed to track usage:', error);
        });

        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Track usage data to PostgreSQL
   */
  async trackUsage(data) {
    try {
      const {
        userId,
        deviceFingerprint,
        clientIp,
        origin,
        isGitHubPages,
        endpoint,
        method,
        duration,
        statusCode,
        request,
        response
      } = data;

      // Detect provider and model from request/response
      const provider = this.detectProvider(endpoint, request, response);
      const model = request?.model || response?.model || 'unknown';

      // Detect API key source (BYOK vs system)
      const keySource = await this.detectKeySource(userId, provider);

      // Extract token usage from response
      const tokens = this.extractTokens(response);

      // Calculate cost (only if system key, BYOK = $0)
      const costCents = keySource === 'system' ? this.calculateCost(provider, model, tokens) : 0;

      // Insert into usage_events table
      await this.db.query(
        `INSERT INTO usage_events (
          user_id,
          device_fingerprint,
          client_ip,
          origin,
          is_github_pages,
          endpoint,
          method,
          provider,
          model,
          key_source,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_cents,
          duration_ms,
          status_code,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
        [
          userId,
          deviceFingerprint,
          clientIp,
          origin,
          isGitHubPages,
          endpoint,
          method,
          provider,
          model,
          keySource,
          tokens.prompt,
          tokens.completion,
          tokens.total,
          costCents,
          duration,
          statusCode,
          statusCode < 400 ? 'success' : 'error'
        ]
      );

      // Also track in UsageTracker for daily/weekly/monthly aggregates
      if (tokens.total > 0) {
        await this.usageTracker.trackUsage(userId, {
          provider,
          model,
          tokens: tokens.total,
          costCents,
          source: isGitHubPages ? 'github-pages' : 'direct'
        });
      }

    } catch (error) {
      console.error('[BridgeBilling] Tracking error:', error);
      // Don't throw - tracking should never break the API
    }
  }

  /**
   * Detect which provider from endpoint/request/response
   */
  detectProvider(endpoint, request, response) {
    // Check model name
    const model = request?.model || response?.model || '';

    if (model.includes('gpt') || model.includes('openai')) {
      return 'openai';
    }
    if (model.includes('claude') || model.includes('anthropic')) {
      return 'anthropic';
    }
    if (model.includes('deepseek')) {
      return 'deepseek';
    }
    if (model.includes('ollama') || model.includes('llama')) {
      return 'ollama';
    }

    // Check endpoint
    if (endpoint.includes('openai')) return 'openai';
    if (endpoint.includes('anthropic')) return 'anthropic';
    if (endpoint.includes('deepseek')) return 'deepseek';
    if (endpoint.includes('ollama')) return 'ollama';

    return 'unknown';
  }

  /**
   * Detect if BYOK or system key
   */
  async detectKeySource(userId, provider) {
    try {
      // Check if user has BYOK for this provider
      const result = await this.db.query(
        `SELECT credential_value
         FROM service_credentials
         WHERE identifier = $1
           AND service_name = $2
           AND credential_type = 'api_key'
         LIMIT 1`,
        [`user_${userId}`, provider]
      );

      return result.rowCount > 0 ? 'byok' : 'system';
    } catch (error) {
      console.error('[BridgeBilling] Key source detection error:', error);
      return 'system';
    }
  }

  /**
   * Extract token usage from response
   */
  extractTokens(response) {
    // OpenAI format
    if (response?.usage) {
      return {
        prompt: response.usage.prompt_tokens || 0,
        completion: response.usage.completion_tokens || 0,
        total: response.usage.total_tokens || 0
      };
    }

    // Anthropic format
    if (response?.usage) {
      return {
        prompt: response.usage.input_tokens || 0,
        completion: response.usage.output_tokens || 0,
        total: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      };
    }

    // Ollama format
    if (response?.eval_count || response?.prompt_eval_count) {
      return {
        prompt: response.prompt_eval_count || 0,
        completion: response.eval_count || 0,
        total: (response.prompt_eval_count || 0) + (response.eval_count || 0)
      };
    }

    // Generic - estimate from response text
    if (response?.response || response?.text) {
      const text = response.response || response.text || '';
      const estimated = Math.ceil(text.length / 4); // ~4 chars per token
      return {
        prompt: 0,
        completion: estimated,
        total: estimated
      };
    }

    return { prompt: 0, completion: 0, total: 0 };
  }

  /**
   * Calculate cost in cents
   */
  calculateCost(provider, model, tokens) {
    // Pricing per 1M tokens (in cents)
    const pricing = {
      openai: {
        'gpt-4': { input: 3000, output: 6000 },
        'gpt-4-turbo': { input: 1000, output: 3000 },
        'gpt-3.5-turbo': { input: 50, output: 150 }
      },
      anthropic: {
        'claude-3-opus': { input: 1500, output: 7500 },
        'claude-3-sonnet': { input: 300, output: 1500 },
        'claude-3-haiku': { input: 25, output: 125 }
      },
      deepseek: {
        'deepseek-chat': { input: 14, output: 28 },
        'deepseek-coder': { input: 14, output: 28 }
      },
      ollama: {
        default: { input: 0, output: 0 } // FREE
      }
    };

    // Get pricing for model
    const providerPricing = pricing[provider] || {};
    const modelPricing = providerPricing[model] || providerPricing.default || { input: 0, output: 0 };

    // Calculate cost
    const inputCost = (tokens.prompt / 1000000) * modelPricing.input;
    const outputCost = (tokens.completion / 1000000) * modelPricing.output;

    return Math.ceil(inputCost + outputCost);
  }
}

/**
 * Factory function for Express middleware
 */
function createBridgeBillingMiddleware(db) {
  const middleware = new BridgeBillingMiddleware(db);
  return middleware.middleware();
}

module.exports = createBridgeBillingMiddleware;
module.exports.BridgeBillingMiddleware = BridgeBillingMiddleware;
