/**
 * Usage Tracker Library
 *
 * Tracks and reports on daily/weekly/monthly API usage for quota enforcement
 * and analytics. Works with migration 043 (user_tiers_quotas.sql).
 *
 * Features:
 * - Daily usage tracking with provider breakdown
 * - Quota enforcement for free tier
 * - Usage analytics and reporting
 * - Cost tracking integration
 */

class UsageTracker {
  constructor(db) {
    this.db = db;

    if (!this.db) {
      console.warn('[UsageTracker] No database connection - tracker disabled');
    }
  }

  /**
   * Record a usage event (detailed log)
   */
  async recordEvent(params) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `INSERT INTO usage_events (
          user_id, provider, model,
          prompt_tokens, completion_tokens, total_tokens,
          cost_cents, latency_ms, status, error_message,
          task_type, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING event_id`,
        [
          params.userId, params.provider, params.model,
          params.promptTokens || 0, params.completionTokens || 0, params.totalTokens || 0,
          params.costCents || 0, params.latencyMs || 0, params.status || 'success',
          params.errorMessage || null, params.taskType || null,
          params.ipAddress || null, params.userAgent || null
        ]
      );

      const eventId = result.rows[0].event_id;

      // Increment daily usage if successful
      if (params.status === 'success') {
        await this.incrementDailyUsage(
          params.userId, params.provider,
          params.totalTokens || 0, params.costCents || 0
        );
      }

      return eventId;

    } catch (error) {
      console.error('[UsageTracker] Error recording event:', error);
      return null;
    }
  }

  /**
   * Increment daily usage counters
   */
  async incrementDailyUsage(userId, provider, tokens, costCents) {
    if (!this.db) return;

    try {
      await this.db.query(
        'SELECT increment_daily_usage($1, $2, $3, $4)',
        [userId, provider, tokens || 0, costCents || 0]
      );
    } catch (error) {
      console.error('[UsageTracker] Error incrementing daily usage:', error);
    }
  }

  /**
   * Get daily usage for a user
   */
  async getDailyUsage(userId, date = null) {
    if (!this.db) return null;

    try {
      const targetDate = date || new Date();
      const dateStr = targetDate.toISOString().split('T')[0];

      const result = await this.db.query(
        `SELECT * FROM user_daily_usage
        WHERE user_id = $1 AND usage_date = $2`,
        [userId, dateStr]
      );

      if (result.rows.length === 0) {
        return {
          usage_date: dateStr,
          queries_count: 0,
          tokens_used: 0,
          cost_cents: 0,
          queries_by_provider: {},
          tokens_by_provider: {},
          cost_by_provider: {}
        };
      }

      return result.rows[0];

    } catch (error) {
      console.error('[UsageTracker] Error getting daily usage:', error);
      return null;
    }
  }

  /**
   * Get weekly usage summary
   */
  async getWeeklyUsage(userId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT
          SUM(queries_count)::INTEGER as total_queries,
          SUM(tokens_used)::INTEGER as total_tokens,
          SUM(cost_cents)::INTEGER as total_cost_cents,
          COUNT(DISTINCT usage_date)::INTEGER as days_active
        FROM user_daily_usage
        WHERE user_id = $1
          AND usage_date >= CURRENT_DATE - INTERVAL '7 days'`,
        [userId]
      );

      return result.rows[0];

    } catch (error) {
      console.error('[UsageTracker] Error getting weekly usage:', error);
      return null;
    }
  }

  /**
   * Get monthly usage summary
   */
  async getMonthlyUsage(userId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT
          SUM(queries_count)::INTEGER as total_queries,
          SUM(tokens_used)::INTEGER as total_tokens,
          SUM(cost_cents)::INTEGER as total_cost_cents,
          COUNT(DISTINCT usage_date)::INTEGER as days_active
        FROM user_daily_usage
        WHERE user_id = $1
          AND usage_date >= DATE_TRUNC('month', CURRENT_DATE)`,
        [userId]
      );

      return result.rows[0];

    } catch (error) {
      console.error('[UsageTracker] Error getting monthly usage:', error);
      return null;
    }
  }

  /**
   * Check if user is over quota
   */
  async isOverQuota(userId) {
    if (!this.db) return false;

    try {
      const result = await this.db.query(
        'SELECT is_user_over_quota($1) as over_quota',
        [userId]
      );

      return result.rows[0]?.over_quota || false;

    } catch (error) {
      console.error('[UsageTracker] Error checking quota:', error);
      return false;
    }
  }

  /**
   * Get usage breakdown by provider
   */
  async getProviderBreakdown(userId, days = 30) {
    if (!this.db) return {};

    try {
      const result = await this.db.query(
        `SELECT
          provider,
          COUNT(*)::INTEGER as query_count,
          SUM(total_tokens)::INTEGER as total_tokens,
          SUM(cost_cents)::INTEGER as total_cost_cents,
          AVG(latency_ms)::INTEGER as avg_latency_ms,
          COUNT(*) FILTER (WHERE status = 'success')::INTEGER as success_count,
          COUNT(*) FILTER (WHERE status = 'error')::INTEGER as error_count
        FROM usage_events
        WHERE user_id = $1
          AND created_at >= NOW() - $2::INTERVAL
        GROUP BY provider
        ORDER BY total_cost_cents DESC`,
        [userId, `${days} days`]
      );

      const breakdown = {};
      result.rows.forEach(row => {
        breakdown[row.provider] = {
          query_count: row.query_count,
          total_tokens: row.total_tokens,
          total_cost_cents: row.total_cost_cents,
          total_cost_dollars: (row.total_cost_cents / 100).toFixed(2),
          avg_latency_ms: row.avg_latency_ms,
          success_count: row.success_count,
          error_count: row.error_count,
          success_rate: ((row.success_count / row.query_count) * 100).toFixed(1)
        };
      });

      return breakdown;

    } catch (error) {
      console.error('[UsageTracker] Error getting provider breakdown:', error);
      return {};
    }
  }

  /**
   * Get comprehensive usage summary
   */
  async getUsageSummary(userId) {
    if (!this.db) return null;

    try {
      const [
        dailyUsage,
        weeklyUsage,
        monthlyUsage,
        providerBreakdown,
        isOverQuota
      ] = await Promise.all([
        this.getDailyUsage(userId),
        this.getWeeklyUsage(userId),
        this.getMonthlyUsage(userId),
        this.getProviderBreakdown(userId, 30),
        this.isOverQuota(userId)
      ]);

      // Get user tier and limits
      const tierResult = await this.db.query(
        `SELECT u.tier, tc.*
        FROM users u
        LEFT JOIN user_tier_configs tc ON u.tier = tc.tier
        WHERE u.user_id = $1`,
        [userId]
      );

      const tier = tierResult.rows[0] || {};

      return {
        tier: {
          name: tier.tier || 'free',
          display_name: tier.name || 'Free',
          max_queries_per_day: tier.max_queries_per_day,
          max_tokens_per_day: tier.max_tokens_per_day,
          allowed_providers: tier.allowed_providers || [],
          requires_credits: tier.requires_credits || false
        },
        today: {
          queries: dailyUsage?.queries_count || 0,
          tokens: dailyUsage?.tokens_used || 0,
          cost_cents: dailyUsage?.cost_cents || 0,
          cost_dollars: ((dailyUsage?.cost_cents || 0) / 100).toFixed(2),
          is_over_quota: isOverQuota
        },
        week: {
          queries: weeklyUsage?.total_queries || 0,
          tokens: weeklyUsage?.total_tokens || 0,
          cost_cents: weeklyUsage?.total_cost_cents || 0,
          cost_dollars: ((weeklyUsage?.total_cost_cents || 0) / 100).toFixed(2),
          days_active: weeklyUsage?.days_active || 0
        },
        month: {
          queries: monthlyUsage?.total_queries || 0,
          tokens: monthlyUsage?.total_tokens || 0,
          cost_cents: monthlyUsage?.total_cost_cents || 0,
          cost_dollars: ((monthlyUsage?.total_cost_cents || 0) / 100).toFixed(2),
          days_active: monthlyUsage?.days_active || 0
        },
        provider_breakdown: providerBreakdown
      };

    } catch (error) {
      console.error('[UsageTracker] Error getting usage summary:', error);
      return null;
    }
  }

  /**
   * Get recent usage events
   */
  async getRecentEvents(userId, limit = 50) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT
          event_id, provider, model, prompt_tokens, completion_tokens,
          total_tokens, cost_cents, latency_ms, status, error_message,
          task_type, created_at
        FROM usage_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map(event => ({
        ...event,
        cost_dollars: (event.cost_cents / 100).toFixed(2)
      }));

    } catch (error) {
      console.error('[UsageTracker] Error getting recent events:', error);
      return [];
    }
  }

  /**
   * Get system-wide usage stats (admin)
   */
  async getSystemUsageStats(days = 7) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(DISTINCT user_id)::INTEGER as active_users,
          COUNT(*)::INTEGER as total_queries,
          SUM(total_tokens)::INTEGER as total_tokens,
          SUM(cost_cents)::INTEGER as total_cost_cents,
          AVG(latency_ms)::INTEGER as avg_latency_ms,
          COUNT(*) FILTER (WHERE status = 'success')::INTEGER as success_count,
          COUNT(*) FILTER (WHERE status = 'error')::INTEGER as error_count,
          COUNT(*) FILTER (WHERE status = 'blocked')::INTEGER as blocked_count
        FROM usage_events
        WHERE created_at >= NOW() - $1::INTERVAL`,
        [`${days} days`]
      );

      const stats = result.rows[0];

      return {
        period_days: days,
        active_users: stats.active_users,
        total_queries: stats.total_queries,
        total_tokens: stats.total_tokens,
        total_cost_cents: stats.total_cost_cents,
        total_cost_dollars: (stats.total_cost_cents / 100).toFixed(2),
        avg_latency_ms: stats.avg_latency_ms,
        success_count: stats.success_count,
        error_count: stats.error_count,
        blocked_count: stats.blocked_count,
        success_rate: ((stats.success_count / stats.total_queries) * 100).toFixed(1)
      };

    } catch (error) {
      console.error('[UsageTracker] Error getting system stats:', error);
      return null;
    }
  }
}

module.exports = UsageTracker;
