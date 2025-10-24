/**
 * Admin Analytics Routes
 *
 * Revenue, cost, and profit analytics for admin dashboard
 *
 * Endpoints:
 * - GET /api/admin/analytics/billing - Current month billing analytics
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/admin/analytics/billing
 * Get current month billing analytics
 *
 * Returns:
 * {
 *   success: boolean,
 *   revenue: number (cents),
 *   costs: number (cents),
 *   byokUsers: number,
 *   byokSavings: number (cents),
 *   providers: [
 *     {
 *       provider: string,
 *       totalCalls: number,
 *       totalTokens: number,
 *       systemCalls: number,
 *       systemCostCents: number,
 *       byokCalls: number
 *     }
 *   ],
 *   tiers: [
 *     {
 *       tier: string,
 *       users: number,
 *       totalTokens: number,
 *       revenue: number (cents),
 *       cost: number (cents)
 *     }
 *   ]
 * }
 */
router.get('/billing', async (req, res) => {
  try {
    // Get current billing period (monthly)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate total revenue (all user subscriptions)
    // Tier pricing: trial = $0, pro = $199, enterprise = custom
    const tierPricing = {
      trial: 0,
      pro: 19900, // $199
      enterprise: 99900 // $999
    };

    const revenueResult = await req.db.query(
      `SELECT role, COUNT(*) as count
       FROM user_sessions
       WHERE created_at >= $1
       GROUP BY role`,
      [periodStart]
    );

    let revenue = 0;
    revenueResult.rows.forEach(row => {
      const tier = row.role || 'trial';
      const price = tierPricing[tier] || 0;
      revenue += price * parseInt(row.count);
    });

    // Calculate total costs (only system API key usage)
    const costsResult = await req.db.query(
      `SELECT SUM(cost_cents) as total_cost
       FROM usage_events
       WHERE created_at >= $1
         AND created_at <= $2
         AND status = 'success'
         AND key_source = 'system'`,
      [periodStart, periodEnd]
    );

    const costs = parseInt(costsResult.rows[0]?.total_cost) || 0;

    // Count BYOK users
    const byokUsersResult = await req.db.query(
      `SELECT COUNT(DISTINCT identifier) as byok_users
       FROM service_credentials
       WHERE credential_type = 'api_key'
         AND identifier LIKE 'user_%'`
    );

    const byokUsers = parseInt(byokUsersResult.rows[0]?.byok_users) || 0;

    // Calculate BYOK savings (tokens that would have cost money)
    const byokSavingsResult = await req.db.query(
      `SELECT SUM(total_tokens) as byok_tokens
       FROM usage_events
       WHERE created_at >= $1
         AND created_at <= $2
         AND status = 'success'
         AND key_source = 'byok'`,
      [periodStart, periodEnd]
    );

    const byokTokens = parseInt(byokSavingsResult.rows[0]?.byok_tokens) || 0;
    // Estimate savings at $0.002 per 1K tokens (average)
    const byokSavings = Math.round(byokTokens / 1000 * 0.2); // cents

    // Provider breakdown
    const providerResult = await req.db.query(
      `SELECT
        provider,
        COUNT(*) as total_calls,
        SUM(total_tokens) as total_tokens,
        SUM(CASE WHEN key_source = 'system' THEN 1 ELSE 0 END) as system_calls,
        SUM(CASE WHEN key_source = 'system' THEN cost_cents ELSE 0 END) as system_cost_cents,
        SUM(CASE WHEN key_source = 'byok' THEN 1 ELSE 0 END) as byok_calls
      FROM usage_events
      WHERE created_at >= $1
        AND created_at <= $2
        AND status = 'success'
      GROUP BY provider
      ORDER BY total_calls DESC`,
      [periodStart, periodEnd]
    );

    const providers = providerResult.rows.map(row => ({
      provider: row.provider,
      totalCalls: parseInt(row.total_calls),
      totalTokens: parseInt(row.total_tokens) || 0,
      systemCalls: parseInt(row.system_calls),
      systemCostCents: parseInt(row.system_cost_cents) || 0,
      byokCalls: parseInt(row.byok_calls)
    }));

    // Tier breakdown
    const tierResult = await req.db.query(
      `SELECT
        u.role as tier,
        COUNT(DISTINCT u.user_id) as users,
        SUM(e.total_tokens) as total_tokens,
        SUM(e.cost_cents) as cost
      FROM user_sessions u
      LEFT JOIN usage_events e ON e.user_id = u.user_id
        AND e.created_at >= $1
        AND e.created_at <= $2
        AND e.status = 'success'
      WHERE u.created_at >= $1
      GROUP BY u.role
      ORDER BY users DESC`,
      [periodStart, periodEnd]
    );

    const tiers = tierResult.rows.map(row => {
      const tier = row.tier || 'trial';
      const users = parseInt(row.users);
      const tierRevenue = (tierPricing[tier] || 0) * users;

      return {
        tier,
        users,
        totalTokens: parseInt(row.total_tokens) || 0,
        revenue: tierRevenue,
        cost: parseInt(row.cost) || 0
      };
    });

    res.json({
      success: true,
      revenue,
      costs,
      byokUsers,
      byokSavings,
      providers,
      tiers
    });

  } catch (error) {
    console.error('[AdminAnalytics] Billing error:', error);
    res.status(500).json({
      error: 'Failed to get billing analytics',
      message: error.message
    });
  }
});

module.exports = router;
