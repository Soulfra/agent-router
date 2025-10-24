/**
 * Usage Routes - API endpoints for viewing usage data and quotas
 *
 * Provides endpoints for users to view their AI query usage, check quotas,
 * and monitor their tier limits. Integrates with migration 043 tier system.
 */

const express = require('express');
const router = express.Router();
const UsageTracker = require('../lib/usage-tracker');

/**
 * Initialize routes with database connection
 */
function initializeRoutes(db) {
  if (!db) {
    throw new Error('Database connection required for usage routes');
  }

  const usageTracker = new UsageTracker(db);

  /**
   * GET /api/usage/summary
   * Get comprehensive usage summary for authenticated user
   */
  router.get('/summary', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const summary = await usageTracker.getUsageSummary(userId);

      if (!summary) {
        return res.status(500).json({ error: 'Failed to fetch usage summary' });
      }

      res.json(summary);

    } catch (error) {
      console.error('[Usage] Error fetching summary:', error);
      res.status(500).json({
        error: 'Failed to fetch usage summary',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/daily
   * Get today's usage or usage for specific date
   */
  router.get('/daily', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const date = req.query.date ? new Date(req.query.date) : new Date();
      const usage = await usageTracker.getDailyUsage(userId, date);

      if (!usage) {
        return res.status(500).json({ error: 'Failed to fetch daily usage' });
      }

      res.json(usage);

    } catch (error) {
      console.error('[Usage] Error fetching daily usage:', error);
      res.status(500).json({
        error: 'Failed to fetch daily usage',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/weekly
   * Get this week's usage summary
   */
  router.get('/weekly', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const usage = await usageTracker.getWeeklyUsage(userId);

      if (!usage) {
        return res.status(500).json({ error: 'Failed to fetch weekly usage' });
      }

      res.json(usage);

    } catch (error) {
      console.error('[Usage] Error fetching weekly usage:', error);
      res.status(500).json({
        error: 'Failed to fetch weekly usage',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/monthly
   * Get this month's usage summary
   */
  router.get('/monthly', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const usage = await usageTracker.getMonthlyUsage(userId);

      if (!usage) {
        return res.status(500).json({ error: 'Failed to fetch monthly usage' });
      }

      res.json(usage);

    } catch (error) {
      console.error('[Usage] Error fetching monthly usage:', error);
      res.status(500).json({
        error: 'Failed to fetch monthly usage',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/quota
   * Check if user is over quota
   */
  router.get('/quota', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isOverQuota = await usageTracker.isOverQuota(userId);
      const dailyUsage = await usageTracker.getDailyUsage(userId);

      // Get tier limits
      const tierResult = await db.query(
        `SELECT u.tier, tc.max_queries_per_day, tc.max_tokens_per_day
        FROM users u
        LEFT JOIN user_tier_configs tc ON u.tier = tc.tier
        WHERE u.user_id = $1`,
        [userId]
      );

      const tier = tierResult.rows[0] || {};

      res.json({
        is_over_quota: isOverQuota,
        tier: tier.tier || 'free',
        daily_usage: {
          queries: dailyUsage?.queries_count || 0,
          tokens: dailyUsage?.tokens_used || 0
        },
        daily_limits: {
          queries: tier.max_queries_per_day,
          tokens: tier.max_tokens_per_day
        },
        remaining: {
          queries: tier.max_queries_per_day 
            ? Math.max(0, tier.max_queries_per_day - (dailyUsage?.queries_count || 0))
            : null,
          tokens: tier.max_tokens_per_day
            ? Math.max(0, tier.max_tokens_per_day - (dailyUsage?.tokens_used || 0))
            : null
        }
      });

    } catch (error) {
      console.error('[Usage] Error checking quota:', error);
      res.status(500).json({
        error: 'Failed to check quota',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/providers
   * Get usage breakdown by provider
   */
  router.get('/providers', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const days = parseInt(req.query.days) || 30;
      const breakdown = await usageTracker.getProviderBreakdown(userId, days);

      res.json({
        period_days: days,
        breakdown: breakdown
      });

    } catch (error) {
      console.error('[Usage] Error fetching provider breakdown:', error);
      res.status(500).json({
        error: 'Failed to fetch provider breakdown',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/recent
   * Get recent usage events
   */
  router.get('/recent', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const events = await usageTracker.getRecentEvents(userId, limit);

      res.json({
        events: events,
        count: events.length,
        limit: limit
      });

    } catch (error) {
      console.error('[Usage] Error fetching recent events:', error);
      res.status(500).json({
        error: 'Failed to fetch recent events',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/tier
   * Get user's tier information and limits
   */
  router.get('/tier', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT u.tier, tc.*
        FROM users u
        LEFT JOIN user_tier_configs tc ON u.tier = tc.tier
        WHERE u.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const tier = result.rows[0];

      res.json({
        tier: tier.tier,
        name: tier.name,
        description: tier.description,
        limits: {
          max_queries_per_day: tier.max_queries_per_day,
          max_tokens_per_day: tier.max_tokens_per_day
        },
        allowed_providers: tier.allowed_providers,
        allowed_models: tier.allowed_models,
        requires_credits: tier.requires_credits,
        cost_per_query_cents: tier.cost_per_query_cents,
        features: {
          has_priority_queue: tier.has_priority_queue,
          has_faster_response: tier.has_faster_response,
          can_use_streaming: tier.can_use_streaming
        }
      });

    } catch (error) {
      console.error('[Usage] Error fetching tier info:', error);
      res.status(500).json({
        error: 'Failed to fetch tier information',
        details: error.message
      });
    }
  });

  /**
   * GET /api/usage/stats (Admin only)
   * Get system-wide usage statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      // Check if user is admin
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // TODO: Add admin check
      // For now, just return stats

      const days = parseInt(req.query.days) || 7;
      const stats = await usageTracker.getSystemUsageStats(days);

      if (!stats) {
        return res.status(500).json({ error: 'Failed to fetch system stats' });
      }

      res.json(stats);

    } catch (error) {
      console.error('[Usage] Error fetching system stats:', error);
      res.status(500).json({
        error: 'Failed to fetch system stats',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };
