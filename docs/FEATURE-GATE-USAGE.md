# Feature Gate Manager - Usage Guide

## Overview

The Feature Gate Manager provides **unified access control** for all platform features. It's a single-line check system (like 2FA before transaction) that determines if a user can access a feature based on:

- **Subscription status** (active/inactive)
- **Credits remaining** (prepaid balance)
- **Tier level** (free/starter/pro/enterprise)
- **Beta access** (private features)
- **Pay-per-feature unlocks** (granular monetization)
- **Rate limits** (daily/monthly caps)

## Concept

### Connection → Analysis (Like 2FA)

Just like 2FA requires authentication before allowing a transaction, Feature Gates check a single condition before allowing feature access:

```javascript
// OLD way (scattered checks):
router.post('/endpoint', requireAuth, async (req, res) => {
  // Manually check subscription
  // Manually check credits
  // Manually check tier
  // ... lots of repetition
});

// NEW way (unified gate):
router.post('/endpoint',
  featureGate.require('feature_name', { checkCredits: true, minCredits: 100 }),
  async (req, res) => {
    // Access granted! All checks passed.
  }
);
```

### Controlled Leaks (FOIA-style)

Only expose features that are **contractually allowed**:
- Free tier → limited features
- Starter tier → more features
- Pro tier → most features
- Enterprise tier → all features

### Pay-Per-Feature (Monetize Partials)

Allow users to buy individual features without full subscription:

```
User wants "secure messaging" but doesn't need full Pro plan
→ Charge $5/month for just that feature
→ Unlock with featureGate.unlockFeature(userId, 'secure_messaging', 500, 'pi_xxx')
```

### Find Top Producers

Analytics dashboard shows:
- Which features generate most revenue (pay-per-feature unlocks)
- Which features have most usage (total uses)
- Which features have most blocked attempts (unmet demand)

## Installation

Feature Gate Manager is automatically initialized in `router.js` when database is available.

## Usage

### 1. Basic Feature Gate

Simplest usage - just check if feature is accessible:

```javascript
const express = require('express');
const router = express.Router();

function initRoutes(db, featureGate) {
  // Allow access only if user has subscription & feature in their tier
  router.get('/endpoint',
    featureGate.require('my_feature'),
    async (req, res) => {
      res.json({ message: 'Access granted!' });
    }
  );

  return router;
}
```

### 2. Credits Check

Require minimum credits balance:

```javascript
router.post('/generate-report',
  featureGate.require('report_generation', {
    checkCredits: true,
    minCredits: 500  // Require $5.00 in credits
  }),
  async (req, res) => {
    // User has at least 500 credits
    res.json({ report: '...' });
  }
);
```

### 3. Credits Deduction

Automatically deduct credits on access:

```javascript
router.post('/send-sms',
  featureGate.require('sms_sending', {
    checkCredits: true,
    deductCredits: 50  // Deduct 50 cents per SMS
  }),
  async (req, res) => {
    // Credits deducted automatically
    // req.featureAccess.creditsDeducted = 50
    await sendSMS(req.body.to, req.body.message);
    res.json({ sent: true });
  }
);
```

### 4. Tier Requirement

Require specific tier level:

```javascript
router.get('/analytics',
  featureGate.require('advanced_analytics', {
    tierRequired: 'pro'  // Requires Pro or Enterprise tier
  }),
  async (req, res) => {
    // User is Pro or Enterprise tier
    res.json({ analytics: '...' });
  }
);
```

### 5. Manual Check (No Middleware)

Check access manually in code:

```javascript
router.post('/complex-action', async (req, res) => {
  const userId = req.user.userId;

  // Check multiple features
  const access = await featureGate.checkMultiple(userId, [
    'feature_a',
    'feature_b',
    'feature_c'
  ]);

  if (!access.allAllowed) {
    return res.status(403).json({
      error: 'Missing required features',
      details: access.features
    });
  }

  // All features available
  res.json({ success: true });
});
```

### 6. Grant Beta Access

Give users early access to beta features:

```javascript
// Admin endpoint
router.post('/admin/grant-beta', requireAdmin, async (req, res) => {
  const { userId, featureName } = req.body;

  await featureGate.grantBetaAccess(userId, featureName, req.user.email);

  res.json({ granted: true });
});
```

### 7. Pay-Per-Feature Unlock

Sell individual features:

```javascript
router.post('/purchase-feature', async (req, res) => {
  const { featureName, paymentIntentId } = req.body;
  const userId = req.user.userId;

  // Get feature price
  const feature = await db.query(
    `SELECT feature_price_cents FROM feature_definitions WHERE feature_name = $1`,
    [featureName]
  );

  const priceCents = feature.rows[0].feature_price_cents;

  // Verify Stripe payment
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status === 'succeeded') {
    // Unlock feature permanently
    await featureGate.unlockFeature(userId, featureName, priceCents, paymentIntentId);

    res.json({
      unlocked: true,
      feature: featureName,
      price: (priceCents / 100).toFixed(2)
    });
  }
});
```

## Example: Applying to Existing Routes

### Before (No Gates):

```javascript
// routes/secure-messaging-routes.js

router.post('/messages/send', requireAuth, async (req, res) => {
  // No subscription check
  // No credits check
  // No tier check
  // Anyone authenticated can use this

  const encrypted = await pathEncryption.encryptWithPath(...);
  // ...
});
```

### After (With Gates):

```javascript
// routes/secure-messaging-routes.js

function initRoutes(db, challengeChain, pathEncryption, featureGate) {
  router.post('/messages/send',
    // Single-line gate check!
    featureGate.require('secure_messaging', {
      checkCredits: true,
      minCredits: 10,  // Require 10 cents to send
      deductCredits: 10  // Deduct on send
    }),
    async (req, res) => {
      // Access granted:
      // - User authenticated
      // - Subscription active
      // - Pro tier or higher
      // - Has >= 10 credits
      // - Credits deducted

      const encrypted = await pathEncryption.encryptWithPath(...);
      // ...
    }
  );

  return router;
}
```

## Analytics

### Top Revenue Features

Find which features make the most money:

```bash
GET /api/feature-analytics/top-revenue?limit=10
```

Response:
```json
{
  "features": [
    {
      "feature": "secure_messaging",
      "unlockCount": 145,
      "totalRevenue": 725.00,
      "avgPrice": 5.00,
      "firstPurchase": "2025-10-01T...",
      "latestPurchase": "2025-10-13T..."
    }
  ]
}
```

### Top Usage Features

Find which features are used most:

```bash
GET /api/feature-analytics/top-usage?limit=10
```

Response:
```json
{
  "features": [
    {
      "feature": "api_access",
      "totalUses": 50000,
      "successfulUses": 48000,
      "blockedAttempts": 2000,
      "uniqueUsers": 150
    }
  ]
}
```

### Blocked Access (Unmet Demand)

Find which features users want but can't access:

```bash
GET /api/feature-analytics/blocked
```

Shows features with high blocked attempt counts → indicators of demand for upgrades.

## Database Schema

### Feature Definitions

Define all features in your platform:

```sql
INSERT INTO feature_definitions (
  feature_name,
  display_name,
  description,
  requires_subscription,
  min_tier_code,
  is_paid_feature,
  feature_price_cents
) VALUES (
  'secure_messaging',
  'Secure Messaging',
  'End-to-end encrypted messaging with path-based keys',
  TRUE,
  'pro',
  TRUE,
  500  -- $5.00 to unlock separately
);
```

### Beta Features

Mark feature as beta:

```sql
UPDATE feature_definitions
SET is_beta = TRUE, status = 'beta'
WHERE feature_name = 'new_experimental_feature';
```

Then grant specific users access:

```sql
SELECT grant_beta_access(
  '550e8400-e29b-41d4-a716-446655440000',  -- user_id
  'new_experimental_feature',
  'admin@example.com'
);
```

## Best Practices

### 1. Define Features First

Before using gates, define your features in `feature_definitions` table:

```sql
-- List all 50 features in your platform
INSERT INTO feature_definitions (...) VALUES (...);
```

### 2. Use Descriptive Names

Feature names should be clear:
- ✅ `secure_messaging`, `telegram_bot`, `apple_pay`
- ❌ `feature1`, `msg`, `f_001`

### 3. Start Conservative

Default to requiring subscription + tier:

```javascript
featureGate.require('new_feature', {
  tierRequired: 'pro'  // Default to Pro tier
})
```

Then analyze usage and adjust.

### 4. Monitor Blocked Attempts

High blocked attempts = unmet demand = opportunity to:
- Upsell subscriptions
- Offer pay-per-feature unlock
- Add to lower tier

### 5. Test Thoroughly

Test all access paths:
- No subscription
- Wrong tier
- Insufficient credits
- Beta access
- Pay-per-feature unlock

## Migration Strategy

### Phase 1: Add Gates to New Features

Start with new features only:

```javascript
// New feature - use gates from day 1
router.post('/new-feature',
  featureGate.require('new_feature'),
  handler
);
```

### Phase 2: Gradually Add to Existing Routes

Pick most valuable features first:

```javascript
// High-value existing feature
router.post('/premium-feature',
  featureGate.require('premium_feature', { tierRequired: 'pro' }),
  handler
);
```

### Phase 3: Apply to All Routes

Eventually all routes should have gates:

```bash
# Find routes without gates:
grep -r "router\.(get|post|put|delete)" routes/*.js | grep -v "featureGate"
```

## Troubleshooting

### "Feature not found" error

Feature not defined in `feature_definitions` table:

```sql
-- Add it
INSERT INTO feature_definitions (feature_name, display_name, ...)
VALUES ('my_feature', 'My Feature', ...);
```

### "Access denied" for admin

Admins should always have access. Check:

```sql
-- Verify admin flag
SELECT is_admin FROM users WHERE user_id = '...';

-- If FALSE, set TRUE
UPDATE users SET is_admin = TRUE WHERE user_id = '...';
```

### Feature not appearing in analytics

No usage logged yet. Access the feature at least once to generate analytics data.

## Summary

Feature Gate Manager provides a **single gate** (like 2FA) that checks:
1. User authenticated ✓
2. Subscription active ✓
3. Credits sufficient ✓
4. Tier appropriate ✓
5. Beta access granted ✓
6. Pay-per-feature unlocked ✓
7. Rate limits okay ✓

**One line of code** replaces dozens of manual checks.

**Analytics dashboard** shows which features are "top producers" (most revenue/usage).

**Pay-per-feature** allows granular monetization without requiring full subscriptions.
