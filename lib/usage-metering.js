/**
 * Usage Metering Middleware
 *
 * Tracks LLM API usage per tenant for billing:
 * - Hooks into MultiLLMRouter to record every request
 * - Tracks tokens (in/out), costs, provider used
 * - Enforces usage limits (tokens/cost caps)
 * - Records billing events for invoicing
 */

class UsageMetering {
  constructor(db) {
    this.db = db;
  }

  /**
   * Check if tenant is within usage limits before making request
   */
  async checkLimits(tenantId) {
    try {
      const result = await this.db.query(
        'SELECT check_usage_limits($1) AS within_limits',
        [tenantId]
      );

      return result.rows[0].within_limits;
    } catch (error) {
      console.error('Error checking usage limits:', error);
      return false; // Fail safe - deny if error
    }
  }

  /**
   * Record usage after LLM request completes
   *
   * @param {object} usage - Usage details
   * @param {string} usage.tenantId - Tenant UUID
   * @param {string} usage.provider - LLM provider ('openai', 'anthropic', etc.)
   * @param {string} usage.model - Model used ('gpt-4', 'claude-3-opus', etc.)
   * @param {number} usage.tokensInput - Input tokens
   * @param {number} usage.tokensOutput - Output tokens
   * @param {number} usage.providerCostCents - Cost charged by provider (in cents)
   * @param {number} usage.markupPercent - Markup percentage (default 50%)
   * @param {string} usage.userId - User who made request (optional)
   * @param {string} usage.endpoint - API endpoint called (optional)
   */
  async recordUsage(usage) {
    const {
      tenantId,
      provider,
      model,
      tokensInput = 0,
      tokensOutput = 0,
      providerCostCents = 0,
      markupPercent = 50,
      userId = null,
      endpoint = null
    } = usage;

    try {
      const result = await this.db.query(
        `SELECT record_usage_event($1, $2, $3, $4, $5, $6, $7, $8, $9) AS event_id`,
        [
          tenantId,
          provider,
          model,
          tokensInput,
          tokensOutput,
          providerCostCents,
          markupPercent,
          userId,
          endpoint
        ]
      );

      const eventId = result.rows[0].event_id;

      console.log(
        `[UsageMetering] Recorded: ${tokensInput + tokensOutput} tokens, $${providerCostCents / 100} (tenant: ${tenantId})`
      );

      return eventId;
    } catch (error) {
      console.error('[UsageMetering] Error recording usage:', error);
      throw error;
    }
  }

  /**
   * Get tenant's current usage for this period
   */
  async getTenantUsage(tenantId) {
    try {
      const result = await this.db.query(
        `SELECT
          tokens_used_this_period,
          tokens_limit,
          cost_this_period_cents,
          cost_limit_cents,
          api_calls_this_period,
          current_period_end,
          pricing_model,
          markup_percent
        FROM tenant_licenses
        WHERE tenant_id = $1 AND status = 'active'
        LIMIT 1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting tenant usage:', error);
      return null;
    }
  }

  /**
   * Get usage breakdown by provider
   */
  async getUsageByProvider(tenantId, days = 30) {
    try {
      const result = await this.db.query(
        `SELECT
          provider,
          COUNT(*) AS requests,
          SUM(tokens_total) AS total_tokens,
          SUM(total_cost_cents) AS total_cost_cents,
          AVG(tokens_total) AS avg_tokens_per_request
        FROM usage_billing_events
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY provider
        ORDER BY total_cost_cents DESC`,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting usage by provider:', error);
      return [];
    }
  }

  /**
   * Get unbilled usage for tenant
   */
  async getUnbilledUsage(tenantId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) AS unbilled_requests,
          SUM(tokens_total) AS unbilled_tokens,
          SUM(total_cost_cents) AS unbilled_cost_cents
        FROM usage_billing_events
        WHERE tenant_id = $1 AND billed = FALSE`,
        [tenantId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error getting unbilled usage:', error);
      return null;
    }
  }

  /**
   * Estimate cost for a request (before making it)
   *
   * @param {string} provider - LLM provider
   * @param {number} estimatedTokens - Estimated tokens for request
   * @param {number} markupPercent - Markup percentage
   * @returns {number} Estimated cost in cents
   */
  estimateCost(provider, estimatedTokens, markupPercent = 50) {
    // Cost per 1M tokens (in cents)
    const costPer1MTokens = {
      openai: 300, // $3.00 per 1M tokens (GPT-3.5 avg)
      anthropic: 1500, // $15.00 per 1M tokens (Claude Sonnet)
      deepseek: 14, // $0.14 per 1M tokens
      ollama: 0, // Free (local)
      together: 100 // $1.00 per 1M tokens
    };

    const baseCost = (costPer1MTokens[provider] || 0) * (estimatedTokens / 1000000);
    const markupCost = (baseCost * markupPercent) / 100;

    return Math.round(baseCost + markupCost);
  }

  /**
   * Middleware to enforce limits before LLM requests
   *
   * Usage:
   * ```js
   * const usageMetering = new UsageMetering(db);
   * router.post('/api/chat', usageMetering.enforceMiddleware(), async (req, res) => {
   *   // Make LLM request
   *   // Usage is automatically tracked
   * });
   * ```
   */
  enforceMiddleware() {
    return async (req, res, next) => {
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Tenant identification required',
          hint: 'Use subdomain, custom domain, or X-Tenant-ID header'
        });
      }

      // Check if tenant is within limits
      const withinLimits = await this.checkLimits(tenantId);

      if (!withinLimits) {
        // Get current usage to show in error
        const usage = await this.getTenantUsage(tenantId);

        return res.status(429).json({
          error: 'Usage limit exceeded',
          usage: {
            tokensUsed: usage.tokens_used_this_period,
            tokensLimit: usage.tokens_limit,
            costUsed: usage.cost_this_period_cents,
            costLimit: usage.cost_limit_cents
          },
          message:
            'You have reached your usage limit for this billing period. Upgrade your plan or wait for the next billing cycle.'
        });
      }

      // Attach usage metering instance to request for later use
      req.usageMetering = this;

      next();
    };
  }

  /**
   * Wrap MultiLLMRouter to automatically track usage
   *
   * Usage:
   * ```js
   * const router = new MultiLLMRouter();
   * const meteredRouter = usageMetering.wrapRouter(router);
   * const response = await meteredRouter.complete({ ... });
   * ```
   */
  wrapRouter(llmRouter) {
    const usageMetering = this;

    return {
      /**
       * Complete with usage tracking
       */
      async complete(request, tenantId, userId = null) {
        // Check limits first
        const withinLimits = await usageMetering.checkLimits(tenantId);
        if (!withinLimits) {
          throw new Error('Usage limit exceeded');
        }

        // Make LLM request
        const response = await llmRouter.complete(request);

        // Record usage
        if (response.usage && response.provider) {
          await usageMetering.recordUsage({
            tenantId,
            provider: response.provider,
            model: request.model || 'unknown',
            tokensInput: response.usage.prompt_tokens || 0,
            tokensOutput: response.usage.completion_tokens || 0,
            providerCostCents: usageMetering._calculateProviderCost(
              response.provider,
              response.usage.total_tokens || 0
            ),
            userId,
            endpoint: request.endpoint || 'llm_complete'
          });
        }

        return response;
      },

      /**
       * Stream with usage tracking
       */
      async stream(request, onChunk, tenantId, userId = null) {
        // Check limits first
        const withinLimits = await usageMetering.checkLimits(tenantId);
        if (!withinLimits) {
          throw new Error('Usage limit exceeded');
        }

        // Make streaming LLM request
        const response = await llmRouter.stream(request, onChunk);

        // Record usage after stream completes
        if (response.usage && response.provider) {
          await usageMetering.recordUsage({
            tenantId,
            provider: response.provider,
            model: request.model || 'unknown',
            tokensInput: response.usage.prompt_tokens || 0,
            tokensOutput: response.usage.completion_tokens || 0,
            providerCostCents: usageMetering._calculateProviderCost(
              response.provider,
              response.usage.total_tokens || 0
            ),
            userId,
            endpoint: request.endpoint || 'llm_stream'
          });
        }

        return response;
      },

      // Pass through other methods
      getStats: () => llmRouter.getStats(),
      getAvailableProviders: () => llmRouter.getAvailableProviders(),
      testAll: () => llmRouter.testAll()
    };
  }

  /**
   * Calculate provider cost (what we pay them)
   * @private
   */
  _calculateProviderCost(provider, tokens) {
    const costPer1MTokens = {
      openai: 300, // $3.00 per 1M tokens
      anthropic: 1500, // $15.00 per 1M tokens
      deepseek: 14, // $0.14 per 1M tokens
      ollama: 0, // Free
      together: 100 // $1.00 per 1M tokens
    };

    const cost = (costPer1MTokens[provider] || 0) * (tokens / 1000000);
    return Math.round(cost);
  }
}

module.exports = UsageMetering;
