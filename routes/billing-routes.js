/**
 * Billing Routes - User Billing Dashboard API
 *
 * Shows users their:
 * - Current tier (Trial/Pro/Enterprise)
 * - Token usage (used/limit)
 * - Provider breakdown (OpenAI vs Anthropic vs DeepSeek)
 * - Cost breakdown (BYOK = $0, System keys = charged)
 * - BYOK status (configured or not)
 * - Upgrade CTAs
 *
 * Integrates with:
 * - lib/usage-tracker.js - Token usage
 * - middleware/tier-gate.js - Tier limits
 * - lib/vault-bridge.js - API key sources
 * - routes/byok-routes.js - BYOK status
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/billing/usage
 * Get current usage for logged-in user
 *
 * Returns:
 * {
 *   userId: string,
 *   period: { start: date, end: date },
 *   usage: {
 *     openai: { calls: number, tokens: number, costCents: number },
 *     anthropic: { calls: number, tokens: number, costCents: number },
 *     deepseek: { calls: number, tokens: number, costCents: number },
 *     total: { calls: number, tokens: number, costCents: number }
 *   },
 *   keySource: {
 *     openai: 'byok' | 'system',
 *     anthropic: 'byok' | 'system',
 *     deepseek: 'byok' | 'system'
 *   }
 * }
 */
router.get('/usage', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Get current billing period (monthly)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Query usage from usage_events table
    const usageResult = await req.db.query(
      `SELECT
        provider,
        COUNT(*) as calls,
        SUM(total_tokens) as tokens,
        SUM(cost_cents) as cost_cents
      FROM usage_events
      WHERE user_id = $1
        AND status = 'success'
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY provider`,
      [userId, periodStart, periodEnd]
    );

    // Build usage breakdown
    const usage = {};
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCostCents = 0;

    usageResult.rows.forEach(row => {
      const provider = row.provider;
      const calls = parseInt(row.calls) || 0;
      const tokens = parseInt(row.tokens) || 0;
      const costCents = parseInt(row.cost_cents) || 0;

      usage[provider] = { calls, tokens, costCents };
      totalCalls += calls;
      totalTokens += tokens;
      totalCostCents += costCents;
    });

    usage.total = {
      calls: totalCalls,
      tokens: totalTokens,
      costCents: totalCostCents
    };

    // Check BYOK status for each provider
    const keySource = {};
    const byokResult = await req.db.query(
      `SELECT service_name as provider
      FROM service_credentials
      WHERE identifier = $1 AND credential_type = 'api_key'`,
      [`user_${userId}`]
    );

    byokResult.rows.forEach(row => {
      keySource[row.provider] = 'byok';
    });

    // Default to 'system' if not BYOK
    ['openai', 'anthropic', 'deepseek'].forEach(provider => {
      if (!keySource[provider]) {
        keySource[provider] = 'system';
      }
    });

    res.json({
      success: true,
      userId,
      period: {
        start: periodStart,
        end: periodEnd
      },
      usage,
      keySource
    });

  } catch (error) {
    console.error('[Billing] Usage error:', error);
    res.status(500).json({
      error: 'Failed to get usage',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/tier
 * Get user's current tier and limits
 *
 * Returns:
 * {
 *   userId: string,
 *   tier: 'trial' | 'pro' | 'enterprise',
 *   tierData: {
 *     name: string,
 *     price: number (cents),
 *     tokensPerMonth: number,
 *     domainsAllowed: number,
 *     support: string,
 *     byok: boolean
 *   },
 *   usage: {
 *     tokens: number,
 *     limit: number,
 *     percentage: number
 *   }
 * }
 */
router.get('/tier', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Get user's tier from role_manager or database
    // For now, default to 'trial' if not found
    const tierResult = await req.db.query(
      `SELECT role FROM user_sessions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    const tier = tierResult.rows[0]?.role || 'trial';

    // Tier definitions (from middleware/tier-gate.js)
    const tiers = {
      trial: {
        name: 'Trial',
        price: 0,
        tokensPerMonth: 1000,
        domainsAllowed: 1,
        support: 'community',
        byok: false
      },
      pro: {
        name: 'Pro',
        price: 19900, // $199
        tokensPerMonth: 1000000,
        domainsAllowed: 5,
        support: 'priority',
        byok: true
      },
      enterprise: {
        name: 'Enterprise',
        price: null,
        tokensPerMonth: Infinity,
        domainsAllowed: Infinity,
        support: 'dedicated',
        byok: true
      }
    };

    const tierData = tiers[tier] || tiers.trial;

    // Get current usage
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usageResult = await req.db.query(
      `SELECT SUM(total_tokens) as tokens
      FROM usage_events
      WHERE user_id = $1
        AND status = 'success'
        AND created_at >= $2
        AND created_at <= $3`,
      [userId, periodStart, periodEnd]
    );

    const tokensUsed = parseInt(usageResult.rows[0]?.tokens) || 0;
    const tokensLimit = tierData.tokensPerMonth;
    const percentage = tokensLimit === Infinity ? 0 : (tokensUsed / tokensLimit) * 100;

    res.json({
      success: true,
      userId,
      tier,
      tierData,
      usage: {
        tokens: tokensUsed,
        limit: tokensLimit,
        percentage: Math.round(percentage)
      }
    });

  } catch (error) {
    console.error('[Billing] Tier error:', error);
    res.status(500).json({
      error: 'Failed to get tier',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/keys
 * Get user's API key status (which keys are BYOK vs system)
 *
 * Returns:
 * {
 *   userId: string,
 *   keys: {
 *     openai: { source: 'byok' | 'system', addedAt: date | null },
 *     anthropic: { source: 'byok' | 'system', addedAt: date | null },
 *     deepseek: { source: 'byok' | 'system', addedAt: date | null }
 *   },
 *   byokEnabled: boolean
 * }
 */
router.get('/keys', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Query BYOK keys
    const byokResult = await req.db.query(
      `SELECT service_name as provider, created_at
      FROM service_credentials
      WHERE identifier = $1 AND credential_type = 'api_key'`,
      [`user_${userId}`]
    );

    const keys = {
      openai: { source: 'system', addedAt: null },
      anthropic: { source: 'system', addedAt: null },
      deepseek: { source: 'system', addedAt: null }
    };

    byokResult.rows.forEach(row => {
      keys[row.provider] = {
        source: 'byok',
        addedAt: row.created_at
      };
    });

    const byokEnabled = byokResult.rowCount > 0;

    res.json({
      success: true,
      userId,
      keys,
      byokEnabled
    });

  } catch (error) {
    console.error('[Billing] Keys error:', error);
    res.status(500).json({
      error: 'Failed to get keys',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/history
 * Get billing history (past months)
 *
 * Returns:
 * {
 *   userId: string,
 *   history: [
 *     {
 *       month: string (YYYY-MM),
 *       usage: { calls, tokens, costCents },
 *       charged: boolean
 *     }
 *   ]
 * }
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Get last 6 months of usage
    const result = await req.db.query(
      `SELECT
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as calls,
        SUM(total_tokens) as tokens,
        SUM(cost_cents) as cost_cents
      FROM usage_events
      WHERE user_id = $1
        AND status = 'success'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC`,
      [userId]
    );

    const history = result.rows.map(row => ({
      month: row.month.toISOString().substring(0, 7), // YYYY-MM
      usage: {
        calls: parseInt(row.calls),
        tokens: parseInt(row.tokens),
        costCents: parseInt(row.cost_cents)
      },
      charged: parseInt(row.cost_cents) > 0
    }));

    res.json({
      success: true,
      userId,
      history
    });

  } catch (error) {
    console.error('[Billing] History error:', error);
    res.status(500).json({
      error: 'Failed to get history',
      message: error.message
    });
  }
});

module.exports = router;
