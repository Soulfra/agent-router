/**
 * Tier Gate Middleware
 *
 * Enforces tier-based limits before allowing requests.
 * Integrates with existing subscription system + usage metering.
 *
 * Tiers:
 * - FREE (OSS):        Self-hosted, unlimited, no billing
 * - STARTER (Cloud):   $49/mo  - 100K tokens, basic support
 * - PRO (Cloud):       $199/mo - 1M tokens, priority, BYOK
 * - ENTERPRISE (Cloud): Custom - Unlimited, SLA, dedicated
 */

class TierGate {
  constructor(options = {}) {
    this.db = options.db;
    this.mode = process.env.CALOS_MODE || 'cloud'; // 'oss' or 'cloud'

    // Tier definitions
    this.tiers = {
      oss: {
        name: 'Open Source',
        price: 0,
        tokensPerMonth: Infinity,
        domainsAllowed: Infinity,
        support: 'community',
        byok: true,
        billing: null
      },
      starter: {
        name: 'Starter',
        price: 4900, // $49.00 in cents
        tokensPerMonth: 100000,
        domainsAllowed: 1,
        support: 'email',
        byok: false,
        billing: 'monthly'
      },
      pro: {
        name: 'Pro',
        price: 19900, // $199.00 in cents
        tokensPerMonth: 1000000,
        domainsAllowed: 5,
        support: 'priority',
        byok: true,
        billing: 'monthly'
      },
      enterprise: {
        name: 'Enterprise',
        price: null, // Custom pricing
        tokensPerMonth: Infinity,
        domainsAllowed: Infinity,
        support: 'dedicated',
        byok: true,
        billing: 'custom'
      }
    };

    console.log(`[TierGate] Initialized - Mode: ${this.mode.toUpperCase()}`);
  }

  /**
   * Middleware function to check tier limits
   */
  async checkLimits(req, res, next) {
    try {
      // OSS mode: no limits, no billing
      if (this.mode === 'oss') {
        req.tier = 'oss';
        req.tierData = this.tiers.oss;
        return next();
      }

      // Cloud mode: check tier and limits
      const userId = req.user?.userId || req.headers['x-user-id'];
      const tenantId = req.tenantId || req.user?.tenant_id;

      if (!userId && !tenantId) {
        // Anonymous request - allow but track
        req.tier = 'anonymous';
        req.tierData = { ...this.tiers.starter, tokensPerMonth: 1000 }; // 1K tokens for free trial
        return next();
      }

      // Get user's tier from database
      const tierData = await this._getUserTier(userId, tenantId);

      if (!tierData) {
        return res.status(402).json({
          status: 'error',
          error: 'No active subscription',
          message: 'Please upgrade to continue using the API',
          upgrade_url: '/pricing'
        });
      }

      req.tier = tierData.tier_code;
      req.tierData = { ...this.tiers[tierData.tier_code], ...tierData };

      // Check usage limits
      const usage = await this._getUsage(userId, tenantId);

      // Token limit check
      if (usage.tokens_this_month >= tierData.tokens_limit) {
        return res.status(429).json({
          status: 'error',
          error: 'Token limit exceeded',
          message: `You've used ${usage.tokens_this_month} / ${tierData.tokens_limit} tokens this month`,
          usage: usage,
          tier: tierData.tier_name,
          upgrade_url: '/pricing'
        });
      }

      // Domain limit check (if applicable)
      if (tierData.domains_limit && usage.domains_used > tierData.domains_limit) {
        return res.status(429).json({
          status: 'error',
          error: 'Domain limit exceeded',
          message: `You've used ${usage.domains_used} / ${tierData.domains_limit} domains`,
          tier: tierData.tier_name,
          upgrade_url: '/pricing'
        });
      }

      // Attach usage to request for downstream tracking
      req.usage = usage;

      next();

    } catch (error) {
      console.error('[TierGate] Error checking limits:', error);

      // Fail open: allow request but log error
      req.tier = 'unknown';
      req.tierData = this.tiers.starter;
      next();
    }
  }

  /**
   * Get user's tier from database
   */
  async _getUserTier(userId, tenantId) {
    if (!this.db) return null;

    try {
      // Check tenant license first
      if (tenantId) {
        const result = await this.db.query(
          `SELECT tl.*, pt.tier_code, pt.tier_name, pt.tokens_limit, pt.domains_limit
           FROM tenant_licenses tl
           JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
           WHERE tl.tenant_id = $1 AND tl.status = 'active' AND tl.expires_at > NOW()
           ORDER BY pt.tier_id DESC
           LIMIT 1`,
          [tenantId]
        );

        if (result.rows.length > 0) {
          return result.rows[0];
        }
      }

      // Check user subscription
      if (userId) {
        const result = await this.db.query(
          `SELECT us.*, pt.tier_code, pt.tier_name, pt.tokens_limit, pt.domains_limit
           FROM user_subscriptions us
           JOIN platform_tiers pt ON pt.tier_id = us.tier_id
           WHERE us.user_id = $1 AND us.status = 'active' AND us.current_period_end > NOW()
           ORDER BY pt.tier_id DESC
           LIMIT 1`,
          [userId]
        );

        if (result.rows.length > 0) {
          return result.rows[0];
        }
      }

      return null;

    } catch (error) {
      console.error('[TierGate] Error getting tier:', error);
      return null;
    }
  }

  /**
   * Get current usage for this billing period
   */
  async _getUsage(userId, tenantId) {
    if (!this.db) {
      return {
        tokens_this_month: 0,
        api_calls_this_month: 0,
        domains_used: 0
      };
    }

    try {
      // Get usage from usage metering system
      const identifier = tenantId || userId;

      const result = await this.db.query(
        `SELECT
          COALESCE(SUM(tokens_input + tokens_output), 0)::INTEGER as tokens_this_month,
          COUNT(*)::INTEGER as api_calls_this_month,
          COUNT(DISTINCT origin_domain)::INTEGER as domains_used
         FROM usage_events
         WHERE (tenant_id = $1 OR user_id = $2)
           AND created_at >= date_trunc('month', NOW())`,
        [tenantId, userId]
      );

      return result.rows[0];

    } catch (error) {
      console.error('[TierGate] Error getting usage:', error);
      return {
        tokens_this_month: 0,
        api_calls_this_month: 0,
        domains_used: 0
      };
    }
  }

  /**
   * Get tier information
   */
  getTier(tierCode) {
    return this.tiers[tierCode] || null;
  }

  /**
   * List all tiers
   */
  listTiers() {
    return Object.entries(this.tiers).map(([code, data]) => ({
      code,
      ...data
    }));
  }

  /**
   * Check if user can upgrade to a tier
   */
  canUpgrade(currentTier, targetTier) {
    const tierOrder = ['starter', 'pro', 'enterprise'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const targetIndex = tierOrder.indexOf(targetTier);

    return targetIndex > currentIndex;
  }

  /**
   * Calculate overage charges
   */
  calculateOverage(usage, limits) {
    const tokensOver = Math.max(0, usage.tokens_this_month - limits.tokensPerMonth);

    // $0.01 per 1K tokens overage
    const overageCents = Math.ceil(tokensOver / 1000) * 1;

    return {
      tokens_over: tokensOver,
      overage_cost_cents: overageCents,
      overage_cost_dollars: (overageCents / 100).toFixed(2)
    };
  }
}

module.exports = TierGate;
