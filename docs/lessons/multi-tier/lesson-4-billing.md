# Lesson 4: Billing Dashboard

**Track:** Multi-Tier System Architecture
**Lesson:** 4 of 7
**XP Reward:** 140
**Time:** 40 minutes
**Prerequisites:** Lesson 3 (Usage Tracking)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Implement billing system
- ✅ Handle subscriptions
- ✅ Process payments
- ✅ Generate invoices
- ✅ Manage upgrades/downgrades

## Subscription Management

```javascript
class SubscriptionManager {
  constructor(db) {
    this.db = db;
  }

  async createSubscription(userId, tier, paymentMethod) {
    const pricing = {
      free: 0,
      standard: 10,
      pro: 50
    };

    await this.db.query(`
      INSERT INTO subscriptions (
        user_id,
        tier,
        price_usd,
        payment_method,
        status,
        current_period_start,
        current_period_end
      ) VALUES ($1, $2, $3, $4, 'active', NOW(), NOW() + interval '1 month')
    `, [userId, tier, pricing[tier], paymentMethod]);

    return { success: true };
  }

  async upgradeSubscription(userId, newTier) {
    // Calculate prorated amount
    const proration = await this.calculateProration(userId, newTier);

    // Update subscription
    await this.db.query(`
      UPDATE subscriptions
      SET tier = $2, price_usd = $3, updated_at = NOW()
      WHERE user_id = $1
    `, [userId, newTier, proration.newPrice]);

    // Create invoice for prorated amount
    await this.createInvoice(userId, proration.amount, 'Upgrade proration');

    return { success: true, amount: proration.amount };
  }

  async cancelSubscription(userId) {
    await this.db.query(`
      UPDATE subscriptions
      SET status = 'cancelled', cancel_at_period_end = true
      WHERE user_id = $1
    `, [userId]);

    return { success: true };
  }
}

module.exports = SubscriptionManager;
```

## Payment Processing

```javascript
async function processPayment(userId, amount, method) {
  // Record payment
  const paymentId = await db.query(`
    INSERT INTO payments (
      user_id,
      amount_usd,
      payment_method,
      status,
      created_at
    ) VALUES ($1, $2, $3, 'pending', NOW())
    RETURNING payment_id
  `, [userId, amount, method]);

  // Process payment (integrate with Stripe, etc.)
  // ... payment processing logic ...

  // Update status
  await db.query(`
    UPDATE payments
    SET status = 'completed', completed_at = NOW()
    WHERE payment_id = $1
  `, [paymentId.rows[0].payment_id]);

  return { success: true };
}
```

## Summary

You've learned:
- ✅ Subscription management
- ✅ Payment processing
- ✅ Upgrades/downgrades
- ✅ Billing logic

## Next Lesson

**Lesson 5: Rate Limiting**

Learn how to implement rate limiting to prevent abuse.

## Quiz

1. What's proration?
   - a) Full refund
   - b) Partial credit for unused time
   - c) Extra charge
   - d) Nothing

2. When does subscription renew?
   - a) Daily
   - b) Monthly
   - c) Yearly
   - d) Never

3. What happens when you cancel?
   - a) Instant termination
   - b) Access until period end
   - c) Full refund
   - d) Can't cancel

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** Billing Expert (+140 XP)
