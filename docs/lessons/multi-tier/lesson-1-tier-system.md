# Lesson 1: Understanding the Tier System

**Track:** Multi-Tier System Architecture
**Lesson:** 1 of 7
**XP Reward:** 100
**Time:** 25 minutes
**Prerequisites:** None

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand multi-tier architecture
- ✅ Learn CalOS tier structure
- ✅ Know feature limitations per tier
- ✅ Understand pricing models
- ✅ Implement tier checks

## CalOS Tier Structure

### Free Tier
- 100 API calls/day
- Basic features
- Community support
- Perfect for: Learning, testing

### Standard Tier ($10/month)
- 10,000 API calls/month
- All basic features
- Email support
- Perfect for: Small projects

### Pro Tier ($50/month)
- 100,000 API calls/month
- Advanced features
- Priority support
- Perfect for: Growing businesses

### Enterprise Tier (Custom)
- Unlimited API calls
- Custom features
- Dedicated support
- SLA guarantee
- Perfect for: Large organizations

## Feature Matrix

| Feature | Free | Standard | Pro | Enterprise |
|---------|------|----------|-----|------------|
| API Calls | 100/day | 10k/month | 100k/month | Unlimited |
| Card Packs | Starter only | +Standard | +Rare/Epic | +Custom |
| Storage | 100MB | 1GB | 10GB | Unlimited |
| Support | Community | Email | Priority | Dedicated |
| SLA | None | 99% | 99.9% | 99.99% |

## Implementing Tier Checks

```javascript
class TierManager {
  constructor(db) {
    this.db = db;

    this.limits = {
      free: {
        apiCalls: 100,
        resetPeriod: '1 day',
        features: ['basic_packs', 'voting']
      },
      standard: {
        apiCalls: 10000,
        resetPeriod: '1 month',
        features: ['basic_packs', 'voting', 'standard_packs', 'battles']
      },
      pro: {
        apiCalls: 100000,
        resetPeriod: '1 month',
        features: ['all']
      },
      enterprise: {
        apiCalls: Infinity,
        resetPeriod: '1 month',
        features: ['all', 'custom']
      }
    };
  }

  async getUserTier(userId) {
    const result = await this.db.query(
      'SELECT tier, api_calls_used, reset_at FROM user_subscriptions WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { tier: 'free', apiCallsUsed: 0 };
    }

    return result.rows[0];
  }

  async checkLimit(userId, feature) {
    const userTier = await this.getUserTier(userId);
    const limits = this.limits[userTier.tier];

    // Check API calls
    if (userTier.apiCallsUsed >= limits.apiCalls) {
      throw new Error('API limit exceeded. Upgrade your tier.');
    }

    // Check feature access
    if (!limits.features.includes('all') && !limits.features.includes(feature)) {
      throw new Error(`Feature '${feature}' not available in ${userTier.tier} tier`);
    }

    // Increment usage
    await this.incrementUsage(userId);

    return true;
  }

  async incrementUsage(userId) {
    await this.db.query(
      'UPDATE user_subscriptions SET api_calls_used = api_calls_used + 1 WHERE user_id = $1',
      [userId]
    );
  }
}

module.exports = TierManager;
```

## Usage Example

```javascript
const TierManager = require('./tier-manager');

async function openPack(userId, packType) {
  const tierManager = new TierManager(db);

  try {
    // Check if user can access this feature
    await tierManager.checkLimit(userId, `${packType}_pack`);

    // Open pack...
    const cards = await generateCards(packType);

    return { success: true, cards };

  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Summary

You've learned:
- ✅ Multi-tier architecture basics
- ✅ CalOS tier structure
- ✅ Feature limitations
- ✅ How to implement tier checks

## Next Lesson

**Lesson 2: BYOK Implementation**

Learn about Bring Your Own Key for API access.

## Quiz

1. What's the Free tier API limit?
   - a) 10/day
   - b) 100/day
   - c) 1000/day
   - d) Unlimited

2. What resets monthly?
   - a) Free tier
   - b) Standard and Pro tiers
   - c) Enterprise tier
   - d) None

3. When should you upgrade to Pro?
   - a) Never
   - b) When you need more API calls
   - c) Immediately
   - d) After 1 year

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** Tier System Expert (+100 XP)
