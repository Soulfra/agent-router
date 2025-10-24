# Lesson 3: Usage Tracking

**Track:** Multi-Tier System Architecture
**Lesson:** 3 of 7
**XP Reward:** 130
**Time:** 35 minutes
**Prerequisites:** Lesson 2 (BYOK)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Track API usage metrics
- ✅ Display usage dashboards
- ✅ Implement usage alerts
- ✅ Generate usage reports
- ✅ Analyze usage patterns

## Usage Tracking System

```javascript
class UsageTracker {
  constructor(db) {
    this.db = db;
  }

  async trackRequest(userId, endpoint, tokens, cost) {
    await this.db.query(`
      INSERT INTO usage_events (
        user_id,
        endpoint,
        tokens_used,
        cost_usd,
        created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [userId, endpoint, tokens, cost]);
  }

  async getUserUsage(userId, period = '30 days') {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        DATE(created_at) as date
      FROM usage_events
      WHERE user_id = $1 AND created_at >= NOW() - $2::interval
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [userId, period]);

    return result.rows;
  }

  async getRemainingQuota(userId) {
    const tier = await this.getTier(userId);
    const used = await this.getMonthlyUsage(userId);

    return {
      limit: tier.limit,
      used: used,
      remaining: tier.limit - used,
      resetDate: this.getResetDate()
    };
  }
}

module.exports = UsageTracker;
```

## Usage Dashboard API

```javascript
GET /api/usage/:userId

// Response
{
  current_period: {
    requests: 5234,
    tokens: 125000,
    cost: 2.50,
    limit: 10000
  },
  daily_breakdown: [
    { date: '2025-01-15', requests: 523, tokens: 12500 },
    { date: '2025-01-14', requests: 412, tokens: 9800 }
  ],
  top_endpoints: [
    { endpoint: '/api/gaming/open-pack', calls: 1523 },
    { endpoint: '/api/learning/complete-lesson', calls: 892 }
  ]
}
```

## Summary

You've learned:
- ✅ Usage tracking implementation
- ✅ Dashboard metrics
- ✅ Quota management
- ✅ Usage reporting

## Next Lesson

**Lesson 4: Billing Dashboard**

Learn how to build billing and payment systems.

## Quiz

1. What should you track?
   - a) Requests only
   - b) Requests, tokens, and cost
   - c) Nothing
   - d) Only errors

2. When does usage reset?
   - a) Daily
   - b) Monthly
   - c) Never
   - d) Yearly

3. Why track usage?
   - a) Enforce limits
   - b) Show users metrics
   - c) Plan capacity
   - d) All of the above

**Answers:** 1-b, 2-b, 3-d

---

**🎴 Achievement Unlocked:** Usage Tracker (+130 XP)
