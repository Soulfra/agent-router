# Complete Payment → Email → Access Flow

**Last Updated:** 2025-10-20

## Overview

This document shows the complete flow from payment to email confirmation to content access, tying together:
1. Stripe payment processing
2. Email confirmations
3. Database registration
4. Content access control ("unencrypting the site")

---

## Architecture Flow

```
User Visits Site → Stripe Checkout → Payment Success → Webhook → Email + Database → Login → Premium Access
```

### Detailed Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 1: USER CLICKS "SUBSCRIBE" BUTTON                             │
│                                                                      │
│  Location: https://calos.app/pricing.html                          │
│  User clicks: "Subscribe to Pro - $10/month"                       │
│                                                                      │
│  Frontend code:                                                      │
│  fetch('/api/subscriptions/create', {                              │
│    method: 'POST',                                                  │
│    body: JSON.stringify({ tierId: 'pro', email: 'user@email.com' })│
│  })                                                                  │
│  .then(res => window.location.href = res.checkoutUrl)              │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 2: STRIPE HOSTED CHECKOUT                                     │
│                                                                      │
│  User redirected to: https://checkout.stripe.com/...               │
│  • Enter payment details (card number, expiry, CVV)                │
│  • Billing address                                                  │
│  • Click "Subscribe"                                                │
│                                                                      │
│  Stripe processes:                                                  │
│  • Creates customer (if new)                                        │
│  • Creates subscription                                             │
│  • Charges $10                                                      │
│  • Generates invoice                                                │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 3: STRIPE SENDS WEBHOOK TO CALOS                             │
│                                                                      │
│  POST https://calos.app/api/webhook/stripe                         │
│  Event: checkout.session.completed                                  │
│  {                                                                   │
│    customer: "cus_123abc",                                          │
│    subscription: "sub_456def",                                      │
│    amount_total: 1000,  // $10.00 in cents                         │
│    customer_email: "user@email.com",                               │
│    metadata: {                                                       │
│      tenant_id: "uuid-tenant-id"                                    │
│    }                                                                 │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 4: CALOS PROCESSES WEBHOOK                                    │
│                                                                      │
│  File: routes/webhook-routes.js                                     │
│                                                                      │
│  1. Verify signature (Stripe webhook secret)                        │
│  2. Update database:                                                 │
│     UPDATE tenant_licenses SET                                       │
│       tier_id = 'pro_tier_uuid',                                    │
│       stripe_subscription_id = 'sub_456def',                        │
│       status = 'active'                                             │
│     WHERE tenant_id = 'uuid-tenant-id'                              │
│                                                                      │
│  3. Add credits (if plan includes credits):                         │
│     INSERT INTO user_credits                                         │
│       (user_id, balance_cents, lifetime_purchased_cents)            │
│     VALUES (user_id, 1000, 1000)                                    │
│                                                                      │
│  4. Send confirmation email:                                        │
│     emailSender.sendSubscriptionConfirmation(                       │
│       "user@email.com",                                             │
│       {                                                              │
│         plan: "Pro",                                                │
│         price: 10,                                                  │
│         billingPeriod: "month",                                     │
│         nextBillingDate: "Nov 20, 2025"                            │
│       }                                                              │
│     )                                                                │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 5: USER RECEIVES EMAIL                                        │
│                                                                      │
│  Subject: "Welcome to CalOS Pro! 🚀"                                │
│                                                                      │
│  Body:                                                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Welcome to Pro!                                                │ │
│  │                                                                 │ │
│  │ Your subscription is now active.                               │ │
│  │                                                                 │ │
│  │ What's Included:                                               │ │
│  │ ✅ OAuth documentation tutorials                               │ │
│  │ ✅ Screenshot annotation tools                                 │ │
│  │ ✅ Video/GIF generation                                        │ │
│  │ ✅ Premium API access                                          │ │
│  │                                                                 │ │
│  │ Billing: $10/month                                             │ │
│  │ Next billing: Nov 20, 2025                                     │ │
│  │                                                                 │ │
│  │ [Access Dashboard] [View Docs]                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 6: USER LOGS IN → PREMIUM CONTENT UNLOCKED                   │
│                                                                      │
│  User returns to site and logs in:                                  │
│  • OAuth (Sign in with Google/GitHub/Microsoft)                    │
│  • OR email/password                                                │
│                                                                      │
│  Middleware checks tier:                                            │
│  1. Get user's tenant_id from session                               │
│  2. Query tenant_licenses:                                          │
│     SELECT tier_code FROM tenant_licenses tl                        │
│     JOIN platform_tiers pt ON pt.tier_id = tl.tier_id             │
│     WHERE tl.tenant_id = $1                                         │
│                                                                      │
│  3. If tier_code = 'pro' or 'enterprise':                          │
│     → Allow access to premium docs                                  │
│     → Higher API rate limits                                        │
│     → Enable video/GIF generation                                   │
│                                                                      │
│  4. If tier_code = 'free':                                          │
│     → Return 402 Payment Required for premium content              │
│     → Show "Upgrade to Pro" banners                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Code Implementation

### 1. Email System (`lib/email-sender.js`)

```javascript
const EmailSender = require('../lib/email-sender');
const emailSender = new EmailSender();

// Send subscription confirmation
await emailSender.sendSubscriptionConfirmation('user@email.com', {
  plan: 'Pro',
  price: 10,
  billingPeriod: 'month',
  nextBillingDate: '2025-11-20'
});

// Send payment confirmation
await emailSender.sendPaymentConfirmation('user@email.com', {
  amount: 1000, // cents
  currency: 'USD',
  plan: 'Pro',
  invoiceUrl: 'https://stripe.com/invoice.pdf'
});
```

**Supported Providers:**
- SendGrid (set `EMAIL_PROVIDER=sendgrid`)
- Mailgun (set `EMAIL_PROVIDER=mailgun`)
- Postmark (set `EMAIL_PROVIDER=postmark`)
- SMTP (set `EMAIL_PROVIDER=smtp`)

### 2. Webhook Handler (`routes/webhook-routes.js`)

```javascript
// Stripe webhook endpoint
router.post('/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'checkout.session.completed':
      // 1. Update database
      await db.query(`UPDATE tenant_licenses SET tier_id = $1`, [proTierId]);

      // 2. Send email
      await emailSender.sendSubscriptionConfirmation(email, details);
      break;

    case 'invoice.paid':
      await emailSender.sendPaymentConfirmation(email, details);
      break;

    case 'invoice.payment_failed':
      await emailSender.sendPaymentFailed(email, { reason: 'Card declined' });
      break;
  }
});
```

### 3. Content Access Control (`middleware/tier-gate.js`)

```javascript
// Middleware to check user's subscription tier
async function requireTier(requiredTier) {
  return async (req, res, next) => {
    const userId = req.session.userId;

    const result = await db.query(`
      SELECT pt.tier_code
      FROM users u
      JOIN tenant_licenses tl ON tl.tenant_id = u.tenant_id
      JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
      WHERE u.user_id = $1
    `, [userId]);

    const userTier = result.rows[0]?.tier_code || 'free';

    const tierHierarchy = { free: 0, pro: 1, enterprise: 2 };

    if (tierHierarchy[userTier] >= tierHierarchy[requiredTier]) {
      next(); // User has access
    } else {
      res.status(402).json({
        error: 'Payment Required',
        message: `This content requires ${requiredTier} tier`,
        upgradeUrl: '/pricing.html'
      });
    }
  };
}

// Usage in routes
router.get('/premium-tutorials', requireTier('pro'), async (req, res) => {
  // Only pro/enterprise users can access
});
```

### 4. Frontend Pricing Page (`public/pricing.html`)

```html
<div class="pricing-tiers">
  <div class="tier">
    <h3>Free</h3>
    <p>$0/month</p>
    <ul>
      <li>✅ Basic OAuth tutorials</li>
      <li>❌ Video generation</li>
      <li>❌ Premium features</li>
    </ul>
    <button onclick="signup('free')">Sign Up</button>
  </div>

  <div class="tier popular">
    <h3>Pro</h3>
    <p>$10/month</p>
    <ul>
      <li>✅ All OAuth tutorials</li>
      <li>✅ Video/GIF generation</li>
      <li>✅ Screenshot annotations</li>
      <li>✅ Premium API access</li>
    </ul>
    <button onclick="subscribe('pro')">Subscribe</button>
  </div>

  <div class="tier">
    <h3>Enterprise</h3>
    <p>$50/month</p>
    <ul>
      <li>✅ Everything in Pro</li>
      <li>✅ Unlimited usage</li>
      <li>✅ Priority support</li>
      <li>✅ Custom integrations</li>
    </ul>
    <button onclick="subscribe('enterprise')">Contact Sales</button>
  </div>
</div>

<script>
async function subscribe(tier) {
  const response = await fetch('/api/subscriptions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tierId: tier,
      email: userEmail // Get from session/input
    })
  });

  const { checkoutUrl } = await response.json();
  window.location.href = checkoutUrl; // Redirect to Stripe
}
</script>
```

---

## Environment Variables

Add to `.env`:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email Configuration (choose one provider)
EMAIL_PROVIDER=sendgrid  # or mailgun, postmark, smtp
EMAIL_FROM=noreply@calos.app
EMAIL_FROM_NAME="CalOS Platform"

# SendGrid
SENDGRID_API_KEY=SG...

# Mailgun
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.calos.app

# Postmark
POSTMARK_SERVER_TOKEN=...

# SMTP (Generic)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## Testing the Flow

### 1. Test Webhook Locally (Stripe CLI)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to localhost
stripe listen --forward-to localhost:5001/api/webhook/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

### 2. Test Email Sending

```bash
# Test email sender directly
node -e "
const EmailSender = require('./lib/email-sender');
const sender = new EmailSender();
sender.sendSubscriptionConfirmation('your-email@gmail.com', {
  plan: 'Pro',
  price: 10,
  billingPeriod: 'month'
});
"
```

### 3. Test Access Control

```bash
# Try to access premium content as free user (should fail)
curl http://localhost:5001/api/docs/premium-tutorials
# Returns: 402 Payment Required

# Subscribe to Pro tier, then try again (should work)
curl http://localhost:5001/api/docs/premium-tutorials \
  -H "Cookie: session=..."
# Returns: Premium content
```

---

## What Gets "Unencrypted" for Paid Users

### Free Tier
- ✅ Basic OAuth tutorials (GitHub only)
- ✅ API documentation
- ❌ Video/GIF generation
- ❌ Screenshot annotations
- ❌ Premium provider tutorials (Google, Microsoft, iCloud)
- ⚠️ Rate limited: 10 API calls/day

### Pro Tier ($10/month)
- ✅ All OAuth tutorials (GitHub, Google, Microsoft, iCloud)
- ✅ Video/GIF generation
- ✅ Screenshot annotations with arrows/boxes
- ✅ Premium API access
- ✅ Rate limit: 1000 calls/day
- ✅ Download tutorial videos/GIFs

### Enterprise Tier ($50/month)
- ✅ Everything in Pro
- ✅ Unlimited API calls
- ✅ Custom tutorial creation
- ✅ Priority support
- ✅ White-label options

---

## Database Tables

### tenant_licenses
```sql
CREATE TABLE tenant_licenses (
  license_id UUID PRIMARY KEY,
  tenant_id UUID,
  tier_id UUID,  -- Links to platform_tiers (free/pro/enterprise)
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(20),  -- 'active', 'past_due', 'cancelled'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### platform_tiers
```sql
CREATE TABLE platform_tiers (
  tier_id UUID PRIMARY KEY,
  tier_code VARCHAR(50),  -- 'free', 'pro', 'enterprise'
  tier_name VARCHAR(100),  -- 'Free', 'Pro', 'Enterprise'
  monthly_price_cents INTEGER,  -- 0, 1000, 5000
  features JSONB,  -- What's included
  rate_limit INTEGER  -- API calls per day
);
```

---

## API Reference

### Create Subscription
```http
POST /api/subscriptions/create
Content-Type: application/json

{
  "tierId": "pro",
  "email": "user@email.com"
}

Response:
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

### Check Access Level
```http
GET /api/subscriptions/current

Response:
{
  "tier": "pro",
  "status": "active",
  "nextBillingDate": "2025-11-20",
  "features": ["oauth_tutorials", "video_generation", "annotations"]
}
```

### Access Premium Content
```http
GET /api/docs/premium-tutorials

If Free User:
Status: 402 Payment Required
{
  "error": "This content requires Pro subscription",
  "upgradeUrl": "/pricing.html"
}

If Pro User:
Status: 200 OK
{
  "tutorials": [...]
}
```

---

## Troubleshooting

### Webhook Not Receiving Events
1. Check Stripe Dashboard → Webhooks → Check endpoint status
2. Verify `STRIPE_WEBHOOK_SECRET` matches dashboard
3. Test with Stripe CLI: `stripe listen`

### Email Not Sending
1. Check email provider API key
2. Verify `EMAIL_PROVIDER` env var is set
3. Test email sender directly (see Testing section)
4. Check spam folder

### User Not Getting Access After Payment
1. Check `tenant_licenses` table - is tier updated?
2. Check session - is user logged in with correct tenant?
3. Check middleware - is `requireTier` applied to route?

---

## Next Steps

1. **Set up Stripe**
   - Create account at stripe.com
   - Get API keys (Developers → API keys)
   - Configure webhook endpoint (Developers → Webhooks)

2. **Configure Email**
   - Choose provider (SendGrid recommended for transactional)
   - Get API key
   - Verify sender domain

3. **Define Premium Content**
   - Decide what's free vs pro
   - Update docs routes with `requireTier` middleware

4. **Test Flow**
   - Test payment with Stripe test cards
   - Verify email delivery
   - Confirm access control works

---

**Questions?** See `docs/SYSTEM-ARCHITECTURE-DIAGRAM.md` for how this fits into the overall platform.
