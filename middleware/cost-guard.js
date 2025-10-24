/**
 * Cost Guard Middleware
 *
 * Enforces user tier quotas and credit limits for AI queries.
 *
 * 3-Tier Access Model:
 * - DEVELOPER: Unlimited free access (for platform developers)
 * - FREE: Limited to Ollama models only, 100 queries/day max
 * - PAID: Pay-as-you-go credits for all models
 *
 * Integration:
 * - Uses tier system from migration 043 (user_tiers_quotas.sql)
 * - Uses credit system from migration 030 (credits_system.sql)
 * - Works with multi-LLM router's cost optimization
 */

class CostGuard {
  constructor(options = {}) {
    this.db = options.db;
    this.enabled = options.enabled !== false; // Default: enabled

    // Provider whitelist for free tier (only free models)
    this.freeProviders = ['ollama', 'claude-code'];

    // Cost per query (in cents) by provider
    this.providerCosts = {
      'ollama': 0,        // Free (local)
      'claude-code': 0,   // Free (local CLI)
      'openai': 10,       // $0.10 per query
      'anthropic': 8,     // $0.08 per query
      'deepseek': 5       // $0.05 per query
    };

    console.log(`[CostGuard] Initialized - Enabled: ${this.enabled}`);
  }

  /**
   * Middleware to check tier limits and credit balance before AI request
   */
  async checkBeforeRequest(req, res, next) {
    try {
      // Skip if disabled or no database
      if (!this.enabled || !this.db) {
        return next();
      }

      // Get user ID from request
      const userId = req.user?.userId || req.user?.user_id || req.headers['x-user-id'];

      if (!userId) {
        // Anonymous request - block for now
        return res.status(401).json({
          status: 'error',
          error: 'Authentication required',
          message: 'Please log in to use AI models',
          code: 'AUTH_REQUIRED'
        });
      }

      // Get provider from request body
      const provider = req.body?.provider || 'openai';
      const model = req.body?.model || 'default';

      // Get user tier
      const userTier = await this._getUserTier(userId);

      if (!userTier) {
        return res.status(400).json({
          status: 'error',
          error: 'Invalid user',
          message: 'User tier not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Attach tier to request for downstream use
      req.userTier = userTier;
      req.provider = provider;

      // ===================================================================
      // DEVELOPER TIER: Bypass all checks
      // ===================================================================
      if (userTier === 'developer') {
        console.log(`[CostGuard] Developer tier - bypassing checks for user ${userId}`);
        return next();
      }

      // ===================================================================
      // FREE TIER: Check quota and provider restrictions
      // ===================================================================
      if (userTier === 'free') {
        // Check if provider is allowed for free tier
        if (!this.freeProviders.includes(provider)) {
          return res.status(403).json({
            status: 'error',
            error: 'Provider not allowed',
            message: `Free tier only supports: ${this.freeProviders.join(', ')}. Upgrade to paid tier for access to ${provider}.`,
            code: 'PROVIDER_RESTRICTED',
            tier: 'free',
            allowed_providers: this.freeProviders,
            upgrade_url: '/pricing'
          });
        }

        // Check if user is over daily quota
        const isOverQuota = await this._checkQuota(userId);

        if (isOverQuota) {
          // Get current usage for error message
          const usage = await this._getDailyUsage(userId);

          return res.status(429).json({
            status: 'error',
            error: 'Daily quota exceeded',
            message: `You've used ${usage.queries_count} / 100 queries today. Quota resets at midnight UTC.`,
            code: 'QUOTA_EXCEEDED',
            tier: 'free',
            usage: usage,
            upgrade_url: '/pricing'
          });
        }

        // Free tier passed checks
        console.log(`[CostGuard] Free tier - quota OK for user ${userId}`);
        return next();
      }

      // ===================================================================
      // PAID TIER: Check credit balance
      // ===================================================================
      if (userTier === 'paid') {
        const cost = this.providerCosts[provider] || 10; // Default: 10 cents

        // Check if user can afford this query
        const canAfford = await this._checkCredits(userId, cost);

        if (!canAfford) {
          const balance = await this._getBalance(userId);

          return res.status(402).json({
            status: 'error',
            error: 'Insufficient credits',
            message: `This query costs ${cost} credits. Your balance: ${balance} credits.`,
            code: 'INSUFFICIENT_CREDITS',
            tier: 'paid',
            balance_cents: balance,
            balance_usd: (balance / 100).toFixed(2),
            required_cents: cost,
            required_usd: (cost / 100).toFixed(2),
            purchase_url: '/credits/purchase'
          });
        }

        // Paid tier passed checks (will deduct after successful response)
        console.log(`[CostGuard] Paid tier - credit check OK for user ${userId} (cost: ${cost}c)`);
        req.queryCost = cost; // Attach cost for post-request deduction
        return next();
      }

      // Unknown tier
      return res.status(400).json({
        status: 'error',
        error: 'Invalid tier',
        message: `Unknown tier: ${userTier}`,
        code: 'INVALID_TIER'
      });

    } catch (error) {
      console.error('[CostGuard] Error in checkBeforeRequest:', error);

      // Fail open: allow request but log error
      console.warn('[CostGuard] Allowing request despite error (fail-open)');
      next();
    }
  }

  /**
   * Middleware to track usage AFTER successful AI request
   */
  async trackAfterRequest(req, res, next) {
    try {
      // Skip if disabled or no database
      if (!this.enabled || !this.db) {
        return next();
      }

      const userId = req.user?.userId || req.user?.user_id || req.headers['x-user-id'];
      const userTier = req.userTier;
      const provider = req.provider || req.body?.provider || 'openai';

      if (!userId || !userTier) {
        return next(); // No user info, can't track
      }

      // Intercept response to get token usage
      const originalJson = res.json.bind(res);

      res.json = async (body) => {
        try {
          // Only track successful responses
          if (body.status === 'success' || body.response || body.choices) {
            const tokens = this._extractTokens(body);
            const cost = req.queryCost || this.providerCosts[provider] || 0;

            // ===================================================================
            // DEVELOPER TIER: Track usage (no cost)
            // ===================================================================
            if (userTier === 'developer') {
              await this._incrementUsage(userId, provider, tokens, 0);
              console.log(`[CostGuard] Tracked developer usage: ${tokens} tokens, ${provider}`);
            }

            // ===================================================================
            // FREE TIER: Track usage (no cost)
            // ===================================================================
            else if (userTier === 'free') {
              await this._incrementUsage(userId, provider, tokens, 0);
              console.log(`[CostGuard] Tracked free tier usage: ${tokens} tokens, ${provider}`);
            }

            // ===================================================================
            // PAID TIER: Deduct credits and track usage
            // ===================================================================
            else if (userTier === 'paid' && cost > 0) {
              // Deduct credits
              await this._deductCredits(userId, cost, provider, req.body?.model);

              // Track usage
              await this._incrementUsage(userId, provider, tokens, cost);

              console.log(`[CostGuard] Deducted ${cost}c and tracked usage: ${tokens} tokens, ${provider}`);
            }
          }
        } catch (error) {
          console.error('[CostGuard] Error tracking usage:', error);
          // Don't block response on tracking error
        }

        return originalJson(body);
      };

      next();

    } catch (error) {
      console.error('[CostGuard] Error in trackAfterRequest:', error);
      next();
    }
  }

  /**
   * Get user's tier from database
   */
  async _getUserTier(userId) {
    try {
      const result = await this.db.query(
        `SELECT tier FROM users WHERE user_id = $1`,
        [userId]
      );

      return result.rows[0]?.tier || 'free'; // Default to free tier

    } catch (error) {
      console.error('[CostGuard] Error getting user tier:', error);
      return 'free'; // Fail safe to free tier
    }
  }

  /**
   * Check if user is over daily quota (FREE tier only)
   */
  async _checkQuota(userId) {
    try {
      const result = await this.db.query(
        `SELECT is_user_over_quota($1) as over_quota`,
        [userId]
      );

      return result.rows[0]?.over_quota || false;

    } catch (error) {
      console.error('[CostGuard] Error checking quota:', error);
      return false; // Fail open
    }
  }

  /**
   * Get daily usage stats for user
   */
  async _getDailyUsage(userId) {
    try {
      const result = await this.db.query(
        `SELECT queries_count, tokens_used, cost_cents
         FROM user_daily_usage
         WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
        [userId]
      );

      return result.rows[0] || { queries_count: 0, tokens_used: 0, cost_cents: 0 };

    } catch (error) {
      console.error('[CostGuard] Error getting daily usage:', error);
      return { queries_count: 0, tokens_used: 0, cost_cents: 0 };
    }
  }

  /**
   * Check if user has enough credits (PAID tier only)
   */
  async _checkCredits(userId, cost) {
    try {
      const result = await this.db.query(
        `SELECT can_afford($1, $2) as can_afford`,
        [userId, cost]
      );

      return result.rows[0]?.can_afford || false;

    } catch (error) {
      console.error('[CostGuard] Error checking credits:', error);
      return false; // Fail closed (no credits = no access)
    }
  }

  /**
   * Get user's credit balance
   */
  async _getBalance(userId) {
    try {
      const result = await this.db.query(
        `SELECT get_user_balance($1) as balance`,
        [userId]
      );

      return result.rows[0]?.balance || 0;

    } catch (error) {
      console.error('[CostGuard] Error getting balance:', error);
      return 0;
    }
  }

  /**
   * Deduct credits from user (PAID tier only)
   */
  async _deductCredits(userId, cost, provider, model) {
    try {
      await this.db.query(
        `SELECT deduct_credits($1, $2, $3, $4, NULL, $5)`,
        [
          userId,
          cost,
          'ai_query',
          `AI query: ${provider}/${model}`,
          JSON.stringify({ provider, model })
        ]
      );

      console.log(`[CostGuard] Deducted ${cost} credits from user ${userId}`);

    } catch (error) {
      console.error('[CostGuard] Error deducting credits:', error);
      throw error; // Propagate error so we know if deduction failed
    }
  }

  /**
   * Increment daily usage counter (ALL tiers)
   */
  async _incrementUsage(userId, provider, tokens, cost) {
    try {
      await this.db.query(
        `SELECT increment_daily_usage($1, $2, $3, $4)`,
        [userId, provider, tokens || 0, cost || 0]
      );

    } catch (error) {
      console.error('[CostGuard] Error incrementing usage:', error);
      // Don't throw - tracking is best-effort
    }
  }

  /**
   * Extract token count from AI response
   */
  _extractTokens(responseBody) {
    // Try different response formats
    if (responseBody.usage?.total_tokens) {
      return responseBody.usage.total_tokens;
    }

    if (responseBody.usage?.prompt_tokens && responseBody.usage?.completion_tokens) {
      return responseBody.usage.prompt_tokens + responseBody.usage.completion_tokens;
    }

    if (typeof responseBody.tokens === 'number') {
      return responseBody.tokens;
    }

    // Default estimate: ~1 token per 4 characters
    if (responseBody.response || responseBody.text) {
      const text = responseBody.response || responseBody.text;
      return Math.ceil(text.length / 4);
    }

    return 0; // Unknown format
  }

  /**
   * Get usage summary for user
   */
  async getUserUsageSummary(userId) {
    try {
      // Get tier
      const tier = await this._getUserTier(userId);

      // Get daily usage
      const dailyUsage = await this._getDailyUsage(userId);

      // Get credit balance (for paid tier)
      const balance = tier === 'paid' ? await this._getBalance(userId) : null;

      // Get tier config
      const tierConfig = await this._getTierConfig(tier);

      return {
        tier: tier,
        daily_usage: dailyUsage,
        credit_balance_cents: balance,
        credit_balance_usd: balance ? (balance / 100).toFixed(2) : null,
        tier_limits: tierConfig,
        is_over_quota: tier === 'free' ? await this._checkQuota(userId) : false
      };

    } catch (error) {
      console.error('[CostGuard] Error getting usage summary:', error);
      return null;
    }
  }

  /**
   * Get tier configuration from database
   */
  async _getTierConfig(tier) {
    try {
      const result = await this.db.query(
        `SELECT * FROM user_tier_configs WHERE tier = $1`,
        [tier]
      );

      return result.rows[0] || null;

    } catch (error) {
      console.error('[CostGuard] Error getting tier config:', error);
      return null;
    }
  }
}

module.exports = CostGuard;
