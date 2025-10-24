/**
 * Provider Router (Tenant-Aware Routing Layer)
 *
 * This is the "wrapper" that routes tenant requests to the appropriate provider:
 * 1. Check BYOK (tenant's own keys) → Use their key (they pay provider directly)
 * 2. Check subscription tier → Free/Starter uses Ollama, Pro/Enterprise uses OpenAI
 * 3. Check usage limits → Enforce token/cost limits
 * 4. Track usage → Record for billing
 *
 * This wraps the existing MultiLLMRouter and adds tenant-specific logic.
 */

const MultiLLMRouter = require('./multi-llm-router');

class ProviderRouter {
  constructor(db, keyring, multiLLMRouter) {
    this.db = db;
    this.keyring = keyring;
    this.llmRouter = multiLLMRouter || new MultiLLMRouter();
  }

  /**
   * Route a request for a specific tenant
   * This is the main entry point - the "wrapper" logic
   *
   * @param {string} tenantId - Tenant UUID
   * @param {object} request - LLM request (prompt, model, maxTokens, etc.)
   * @returns {Promise<object>} LLM response + billing info
   */
  async route(tenantId, request) {
    const startTime = Date.now();

    try {
      // Step 1: Get tenant subscription info
      const subscription = await this._getSubscription(tenantId);

      if (!subscription) {
        throw new Error('No active subscription found. Please subscribe first.');
      }

      // Step 2: Check usage limits BEFORE making request
      const withinLimits = await this._checkUsageLimits(tenantId, subscription);

      if (!withinLimits.allowed) {
        throw new Error(`Usage limit exceeded: ${withinLimits.reason}. Please upgrade or contact support.`);
      }

      // Step 3: Determine which provider to use
      const routingDecision = await this._determineProvider(tenantId, request, subscription);

      console.log(`[ProviderRouter] Tenant ${tenantId} → ${routingDecision.provider} (${routingDecision.reason})`);

      // Step 4: Make the actual LLM request
      const response = await this._executeRequest(routingDecision, request);

      // Step 5: Calculate costs
      const costs = this._calculateCosts(
        response.usage,
        routingDecision.provider,
        subscription.pricing_model,
        subscription.markup_percent
      );

      // Step 6: Record usage for billing
      await this._recordUsage(tenantId, routingDecision, response, costs);

      // Step 7: Return response with billing info
      return {
        ...response,
        provider: routingDecision.provider,
        model_used: routingDecision.model,
        billing: {
          provider_cost_cents: costs.provider_cost_cents,
          markup_cost_cents: costs.markup_cost_cents,
          total_cost_cents: costs.total_cost_cents,
          pricing_model: subscription.pricing_model
        },
        latency_ms: Date.now() - startTime
      };

    } catch (error) {
      console.error('[ProviderRouter] Routing error:', error);
      throw error;
    }
  }

  /**
   * Determine which provider to use based on tenant's setup
   * This is where the "wrapping" magic happens!
   */
  async _determineProvider(tenantId, request, subscription) {
    // Priority 1: Check if tenant has BYOK for this model
    const byokKey = await this._getBYOKKey(tenantId, request.model || 'gpt-4');

    if (byokKey) {
      return {
        provider: byokKey.provider,
        model: request.model || this._getDefaultModel(byokKey.provider),
        apiKey: byokKey.apiKey,
        reason: 'BYOK (tenant pays provider directly)',
        useBYOK: true
      };
    }

    // Priority 2: Check subscription tier
    const tier = subscription.tier_code;

    // Free and Starter tiers → Ollama (local, free)
    if (tier === 'free' || tier === 'starter') {
      return {
        provider: 'ollama',
        model: this._mapToOllamaModel(request.model || 'gpt-4'),
        apiKey: null, // Ollama is local, no API key needed
        reason: `${tier} tier → Ollama (free local models)`,
        useBYOK: false
      };
    }

    // Pro and Enterprise tiers → Platform keys (OpenAI/Anthropic with markup)
    if (tier === 'pro' || tier === 'enterprise') {
      const providerForModel = this._getProviderForModel(request.model || 'gpt-4');

      return {
        provider: providerForModel,
        model: request.model || 'gpt-4',
        apiKey: this._getPlatformKey(providerForModel), // Your platform keys from .env
        reason: `${tier} tier → Platform ${providerForModel} (with markup)`,
        useBYOK: false
      };
    }

    // Fallback to Ollama
    return {
      provider: 'ollama',
      model: this._mapToOllamaModel(request.model || 'gpt-4'),
      apiKey: null,
      reason: 'Fallback to Ollama',
      useBYOK: false
    };
  }

  /**
   * Get tenant's BYOK key for a specific model/provider
   */
  async _getBYOKKey(tenantId, model) {
    try {
      // Determine which provider this model needs
      const provider = this._getProviderForModel(model);

      // Check if tenant has a BYOK key for this provider
      const result = await this.db.query(
        `SELECT key_id, provider FROM tenant_api_keys
         WHERE tenant_id = $1 AND provider = $2 AND active = TRUE
         LIMIT 1`,
        [tenantId, provider]
      );

      if (result.rows.length === 0) {
        return null; // No BYOK key
      }

      const key = result.rows[0];

      // Retrieve the actual API key from keyring (encrypted storage)
      const apiKey = await this.keyring.getCredential(provider, 'api_key', tenantId);

      return {
        provider: key.provider,
        apiKey: apiKey
      };

    } catch (error) {
      console.warn('[ProviderRouter] BYOK check failed:', error.message);
      return null;
    }
  }

  /**
   * Get tenant subscription info
   */
  async _getSubscription(tenantId) {
    try {
      const result = await this.db.query(
        `SELECT
          tl.tenant_id,
          tl.pricing_model,
          tl.markup_percent,
          tl.tokens_used_this_period,
          tl.tokens_limit,
          tl.cost_this_period_cents,
          tl.cost_limit_cents,
          pt.tier_code,
          pt.tier_name
        FROM tenant_licenses tl
        JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
        WHERE tl.tenant_id = $1 AND tl.status = 'active'
        LIMIT 1`,
        [tenantId]
      );

      return result.rows[0] || null;

    } catch (error) {
      console.error('[ProviderRouter] Subscription check failed:', error);
      return null;
    }
  }

  /**
   * Check if tenant is within usage limits
   */
  async _checkUsageLimits(tenantId, subscription) {
    try {
      // Check token limit
      if (subscription.tokens_limit) {
        if (subscription.tokens_used_this_period >= subscription.tokens_limit) {
          return {
            allowed: false,
            reason: `Token limit exceeded (${subscription.tokens_used_this_period}/${subscription.tokens_limit})`
          };
        }
      }

      // Check cost limit
      if (subscription.cost_limit_cents) {
        if (subscription.cost_this_period_cents >= subscription.cost_limit_cents) {
          return {
            allowed: false,
            reason: `Cost limit exceeded ($${subscription.cost_this_period_cents / 100}/$${subscription.cost_limit_cents / 100})`
          };
        }
      }

      return { allowed: true };

    } catch (error) {
      console.error('[ProviderRouter] Usage limit check failed:', error);
      // Fail open (allow request if check fails)
      return { allowed: true };
    }
  }

  /**
   * Execute the actual LLM request using MultiLLMRouter
   */
  async _executeRequest(routingDecision, request) {
    try {
      // If using BYOK, temporarily override the provider's API key
      if (routingDecision.useBYOK && routingDecision.apiKey) {
        // Create a custom adapter with tenant's key
        return await this.llmRouter.complete({
          ...request,
          model: routingDecision.model,
          preferredProvider: routingDecision.provider,
          apiKeyOverride: routingDecision.apiKey
        });
      }

      // Otherwise use platform keys (from MultiLLMRouter)
      return await this.llmRouter.complete({
        ...request,
        model: routingDecision.model,
        preferredProvider: routingDecision.provider
      });

    } catch (error) {
      console.error('[ProviderRouter] LLM request failed:', error);
      throw new Error(`LLM request failed: ${error.message}`);
    }
  }

  /**
   * Calculate costs based on usage and pricing model
   */
  _calculateCosts(usage, provider, pricingModel, markupPercent) {
    // Token counts
    const tokensInput = usage?.prompt_tokens || 0;
    const tokensOutput = usage?.completion_tokens || 0;
    const tokensTotal = tokensInput + tokensOutput;

    // Provider costs (what OpenAI/Anthropic charges)
    let providerCostCents = 0;

    if (provider === 'ollama') {
      // Ollama is free
      providerCostCents = 0;
    } else if (provider === 'openai') {
      // GPT-4: $0.03/1K input, $0.06/1K output
      providerCostCents = Math.ceil(
        (tokensInput / 1000) * 3 + (tokensOutput / 1000) * 6
      );
    } else if (provider === 'anthropic') {
      // Claude: $0.015/1K input, $0.075/1K output
      providerCostCents = Math.ceil(
        (tokensInput / 1000) * 1.5 + (tokensOutput / 1000) * 7.5
      );
    } else if (provider === 'deepseek') {
      // DeepSeek: $0.001/1K tokens
      providerCostCents = Math.ceil((tokensTotal / 1000) * 0.1);
    }

    // Markup (only for non-BYOK)
    let markupCostCents = 0;
    if (pricingModel === 'metered' || pricingModel === 'hybrid') {
      markupCostCents = Math.ceil((providerCostCents * markupPercent) / 100);
    }

    // Total (what we charge the tenant)
    const totalCostCents = providerCostCents + markupCostCents;

    return {
      provider_cost_cents: providerCostCents,
      markup_cost_cents: markupCostCents,
      total_cost_cents: totalCostCents
    };
  }

  /**
   * Record usage for billing (uses existing function from migration 021)
   */
  async _recordUsage(tenantId, routingDecision, response, costs) {
    try {
      await this.db.query(
        `SELECT record_usage_event($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          routingDecision.provider,
          routingDecision.model,
          response.usage?.prompt_tokens || 0,
          response.usage?.completion_tokens || 0,
          costs.provider_cost_cents,
          costs.markup_cost_cents
        ]
      );
    } catch (error) {
      console.error('[ProviderRouter] Usage recording failed:', error);
      // Don't throw - usage tracking failure shouldn't block the response
    }
  }

  /**
   * Get platform API key from environment
   */
  _getPlatformKey(provider) {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY;
      case 'deepseek':
        return process.env.DEEPSEEK_API_KEY;
      default:
        return null;
    }
  }

  /**
   * Determine which provider a model belongs to
   */
  _getProviderForModel(model) {
    if (model.startsWith('gpt-') || model.includes('openai')) {
      return 'openai';
    }
    if (model.startsWith('claude-') || model.includes('anthropic')) {
      return 'anthropic';
    }
    if (model.startsWith('deepseek-')) {
      return 'deepseek';
    }
    return 'openai'; // Default to OpenAI
  }

  /**
   * Get default model for a provider
   */
  _getDefaultModel(provider) {
    switch (provider) {
      case 'openai':
        return 'gpt-4';
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022';
      case 'deepseek':
        return 'deepseek-chat';
      case 'ollama':
        return 'calos-model:latest';
      default:
        return 'gpt-4';
    }
  }

  /**
   * Map commercial models to free Ollama equivalents
   */
  _mapToOllamaModel(model) {
    const modelMap = {
      'gpt-4': 'calos-model:latest',
      'gpt-3.5-turbo': 'calos-model:latest:7b',
      'claude-3-opus': 'calos-model:latest:70b',
      'claude-3-sonnet': 'calos-model:latest:13b',
      'claude-3-5-sonnet-20241022': 'calos-model:latest:13b'
    };

    return modelMap[model] || 'calos-model:latest';
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return this.llmRouter.stats;
  }
}

module.exports = ProviderRouter;
