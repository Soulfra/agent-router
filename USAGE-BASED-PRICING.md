# 💰 Usage-Based Pricing System

Pay-per-token pricing model - charge tenants for actual AI usage instead of fixed subscriptions.

---

## 🎯 Business Model

### Old Model (Subscription):
- **Fixed** monthly fees ($99-$999/28 days)
- Revenue capped per tenant
- Unused capacity = lost revenue
- Complex tier management

### New Model (Usage-Based):
- **Metered** pricing (pay per token consumed)
- Revenue scales with tenant usage
- No waste - charge for actual usage
- Three flexible models to choose from

---

## 💵 Pricing Models

### Model 1: Pure Metered ⚡
**Best for**: High-usage tenants, variable workloads

- **$0.00/month** base fee
- **$0.20 per 1M tokens** consumed
- No wasted capacity
- Bill at end of 28-day period

**Example:**
```
10M tokens × $0.20 = $2.00
50M tokens × $0.20 = $10.00
500M tokens × $0.20 = $100.00
```

### Model 2: BYOK (Bring Your Own Key) 🔑
**Best for**: Enterprise, those with existing AI contracts

- **$20-50/month** platform access fee
- **$0.00 per token** (they use their own API keys)
- They pay OpenAI/Anthropic directly
- We charge for platform features only

**Benefits:**
- Lower barrier to entry
- Tenant controls their AI spend
- No markup concerns

### Model 3: Hybrid (Recommended) 💎
**Best for**: Most tenants, predictable base + scale

- **$10/month** platform fee
- **$0.15 per 1M tokens**
- **1M free tokens** included in base
- Best of both worlds

**Example:**
```
Base: $10 + 1M free tokens
5M tokens = $10 + (4M × $0.15) = $10.60
20M tokens = $10 + (19M × $0.15) = $12.85
100M tokens = $10 + (99M × $0.15) = $24.85
```

---

## 🗄️ Database Schema

### New Tables:

#### tenant_api_keys
Stores tenant-provided API keys for BYOK model:
```sql
CREATE TABLE tenant_api_keys (
  key_id UUID,
  tenant_id UUID,
  provider VARCHAR(50), -- 'openai', 'anthropic', 'deepseek'
  encrypted_api_key TEXT,
  key_prefix VARCHAR(20), -- 'sk-abc...'
  active BOOLEAN,
  last_used_at TIMESTAMPTZ
);
```

#### usage_billing_events
Records every LLM API call for billing:
```sql
CREATE TABLE usage_billing_events (
  event_id UUID,
  tenant_id UUID,
  provider VARCHAR(50),
  model VARCHAR(100),
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  provider_cost_cents INTEGER, -- What we paid
  markup_cost_cents INTEGER, -- Our markup
  total_cost_cents INTEGER, -- Charged to tenant
  billed BOOLEAN,
  created_at TIMESTAMPTZ
);
```

#### tenant_invoices
Generated invoices at end of each 28-day period:
```sql
CREATE TABLE tenant_invoices (
  invoice_id UUID,
  tenant_id UUID,
  invoice_number VARCHAR(50), -- 'INV-2025-001'
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  base_price_cents INTEGER, -- Platform fee
  usage_price_cents INTEGER, -- Token costs
  total_price_cents INTEGER,
  total_tokens BIGINT,
  status VARCHAR(50) -- 'pending', 'paid', 'overdue'
);
```

### Updated Columns:

#### tenant_licenses
Added usage tracking:
```sql
ALTER TABLE tenant_licenses ADD:
  - tokens_used_this_period BIGINT
  - tokens_limit BIGINT (NULL = unlimited)
  - cost_this_period_cents INTEGER
  - cost_limit_cents INTEGER
  - pricing_model VARCHAR(50) -- 'subscription', 'metered', 'byok', 'hybrid'
  - markup_percent INTEGER DEFAULT 50
```

---

## 🔧 Usage Metering System

### lib/usage-metering.js

Automatic tracking of every LLM request:

```javascript
const UsageMetering = require('./lib/usage-metering');
const usageMetering = new UsageMetering(db);

// Check limits before request
const withinLimits = await usageMetering.checkLimits(tenantId);

// Record usage after request
await usageMetering.recordUsage({
  tenantId,
  provider: 'openai',
  model: 'gpt-4',
  tokensInput: 100,
  tokensOutput: 200,
  providerCostCents: 3, // $0.03
  markupPercent: 50, // 50% markup
  userId,
  endpoint: '/api/chat'
});

// Get current usage
const usage = await usageMetering.getTenantUsage(tenantId);
// {
//   tokens_used_this_period: 5000000,
//   tokens_limit: 10000000,
//   cost_this_period_cents: 1000,
//   pricing_model: 'hybrid'
// }
```

### Middleware Integration:

```javascript
const { requireTenant } = require('./lib/tenant-isolation');

router.post('/api/chat',
  requireTenant, // Identify tenant
  usageMetering.enforceMiddleware(), // Check limits
  async (req, res) => {
    const llmRouter = new MultiLLMRouter();
    const meteredRouter = usageMetering.wrapRouter(llmRouter);

    // Make LLM request (usage automatically tracked)
    const response = await meteredRouter.complete({
      prompt: req.body.prompt,
      model: 'gpt-4'
    }, req.tenantId, req.session.userId);

    res.json(response);
  }
);
```

---

## 📊 Billing Flow

### 1. Real-Time Tracking
Every LLM request:
1. Check if tenant is within limits
2. Make API call
3. Record usage event:
   - Tokens used (input + output)
   - Provider cost
   - Markup cost
   - Total cost
4. Update tenant's running total

### 2. Limit Enforcement
Before each request:
- Check `tokens_used_this_period` vs `tokens_limit`
- Check `cost_this_period_cents` vs `cost_limit_cents`
- Reject if exceeded → return 429 error

### 3. Invoice Generation
At end of 28-day period (automated cron):
```sql
SELECT reset_tenant_usage(); -- Runs daily

-- For each expired period:
1. Generate invoice (base fee + usage)
2. Mark all usage events as 'billed'
3. Reset usage counters to 0
4. Start new 28-day period
```

### 4. Payment Collection
- Send invoice to tenant
- Charge via Stripe (auto-pay if card on file)
- Update invoice status to 'paid'

---

## 📈 Usage Analytics

### Database Functions:

```sql
-- Check if tenant can make request
SELECT check_usage_limits('tenant_uuid');

-- Record usage event
SELECT record_usage_event(
  'tenant_uuid',
  'openai',
  'gpt-4',
  100, -- tokens in
  200, -- tokens out
  3, -- provider cost cents
  50 -- markup %
);

-- Generate invoice
SELECT generate_invoice(
  'tenant_uuid',
  '2025-01-01', -- period start
  '2025-01-29' -- period end
);
```

### Views:

```sql
-- Quick tenant usage summary
SELECT * FROM tenant_usage_summary
WHERE tenant_id = 'uuid';

-- Usage breakdown by provider
SELECT * FROM usage_by_provider
WHERE tenant_id = 'uuid';
```

---

## 🎨 Admin Dashboard Updates

### New Sections:

**Usage Overview:**
- Total tokens consumed (all tenants)
- Total revenue from usage
- Average tokens per tenant
- Top 10 tenants by usage

**Per-Tenant Drill-Down:**
- Tokens used this period
- Cost this period
- Usage by provider (OpenAI vs Anthropic vs etc)
- Usage trend chart
- Projected invoice amount

**Billing Management:**
- Pending invoices
- Overdue invoices
- Revenue by period
- Churn risk (tenants approaching limits)

---

## 💡 Implementation Examples

### Example 1: Basic Metered Setup

```javascript
// routes/chat-routes.js
const UsageMetering = require('../lib/usage-metering');
const usageMetering = new UsageMetering(db);

router.post('/chat', requireTenant, async (req, res) => {
  // Check limits
  if (!await usageMetering.checkLimits(req.tenantId)) {
    return res.status(429).json({
      error: 'Usage limit exceeded',
      message: 'Upgrade your plan or wait for next billing cycle'
    });
  }

  // Make LLM request
  const llmRouter = new MultiLLMRouter();
  const response = await llmRouter.complete({
    prompt: req.body.message,
    model: 'gpt-4'
  });

  // Record usage
  await usageMetering.recordUsage({
    tenantId: req.tenantId,
    provider: response.provider,
    model: 'gpt-4',
    tokensInput: response.usage.prompt_tokens,
    tokensOutput: response.usage.completion_tokens,
    providerCostCents: 3,
    userId: req.session.userId
  });

  res.json(response);
});
```

### Example 2: BYOK Model

```javascript
// Tenant provides their own API key
router.post('/api-keys', requireTenant, async (req, res) => {
  const { provider, apiKey, keyName } = req.body;

  // Encrypt API key before storing
  const encrypted = encrypt(apiKey);

  await db.query(`
    INSERT INTO tenant_api_keys (tenant_id, provider, encrypted_api_key, key_name, key_prefix)
    VALUES ($1, $2, $3, $4, $5)
  `, [req.tenantId, provider, encrypted, keyName, apiKey.substring(0, 10)]);

  res.json({ success: true });
});

// Use tenant's API key for requests
router.post('/chat', requireTenant, async (req, res) => {
  // Get tenant's API key
  const key = await db.query(`
    SELECT encrypted_api_key FROM tenant_api_keys
    WHERE tenant_id = $1 AND provider = 'openai' AND active = TRUE
    LIMIT 1
  `, [req.tenantId]);

  const apiKey = decrypt(key.rows[0].encrypted_api_key);

  // Use their key (no usage metering needed - they pay directly)
  const llmRouter = new MultiLLMRouter({
    openaiKey: apiKey // Override with tenant's key
  });

  const response = await llmRouter.complete({
    prompt: req.body.message
  });

  res.json(response);
});
```

---

## 🚀 Migration Path

### Phase 1: Deploy Infrastructure ✅
- [x] Add usage tracking columns
- [x] Create billing events table
- [x] Create API key management table
- [x] Add usage metering middleware
- [x] Run migration

### Phase 2: Enable Tracking (Current)
- [ ] Hook usage metering into all LLM routes
- [ ] Test with sandbox tenant
- [ ] Verify usage recording

### Phase 3: UI & Dashboards
- [ ] Build tenant usage dashboard
- [ ] Add usage charts
- [ ] Show projected costs
- [ ] Update admin panel with usage analytics

### Phase 4: Billing Automation
- [ ] Set up daily cron for invoice generation
- [ ] Stripe integration for auto-billing
- [ ] Email notifications (usage alerts, invoices)

### Phase 5: Launch
- [ ] Migrate existing tenants (grandfathered at old rates?)
- [ ] Market new pricing model
- [ ] Monitor and optimize

---

## 📊 Revenue Projections

### Scenario 1: Metered Only
**10 tenants, avg 50M tokens/month:**
```
10 × 50M × $0.20 = $100/month
At 100 tenants = $1,000/month
At 1,000 tenants = $10,000/month
```

### Scenario 2: Hybrid Model (Recommended)
**100 tenants, avg 20M tokens/month:**
```
Base: 100 × $10 = $1,000
Usage: 100 × 19M × $0.15 = $285
Total: $1,285/month
```

**High-usage tenant (500M tokens):**
```
Base: $10
Usage: 499M × $0.15 = $74.85
Total: $84.85/month
```

### Scenario 3: BYOK Model
**50 tenants, $30/month platform fee:**
```
50 × $30 = $1,500/month
(No usage revenue - they pay providers directly)
```

---

## 🎯 Recommended Approach

**Start with Hybrid Model:**

1. **Low Base Fee**: $10/month keeps barrier low
2. **Included Tokens**: 1M free tokens = goodwill
3. **Fair Metering**: $0.15 per 1M = 1.5x provider costs
4. **Predictable**: Tenants know minimum cost
5. **Scalable**: Revenue grows with usage

**Migration Strategy:**
- Grandfather existing tenants at $99/month (subscription)
- New tenants get hybrid pricing
- Offer migration incentive: "Save up to 90% with usage-based pricing"

---

## 🔗 Next Steps

### Immediate:
1. Deploy usage tracking to production
2. Test with internal tenant
3. Build usage dashboard UI

### Week 1:
1. Hook all LLM routes into usage metering
2. Set up Stripe webhook for invoice payments
3. Create usage alert system

### Month 1:
1. Launch hybrid pricing publicly
2. Migrate 10-20 beta tenants
3. Monitor usage patterns and adjust pricing

---

## 🎉 Benefits of Usage-Based Pricing

### For Tenants:
- ✅ Pay only for what you use
- ✅ No expensive upfront costs
- ✅ Scale up/down freely
- ✅ Transparent billing

### For Platform:
- ✅ Revenue scales with usage
- ✅ Attracts more customers (lower barrier)
- ✅ Fair pricing (heavy users pay more)
- ✅ Predictable margins (markup on costs)

---

**Ready to switch to usage-based pricing! 🚀**

See `database/migrations/021_usage_based_pricing.sql` and `lib/usage-metering.js` for implementation.
