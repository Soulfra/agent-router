# CALOS API Key Architecture

## Overview

CALOS uses a **two-layer API key system** to provide flexible AI routing with multiple monetization models.

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   Customer  │ ──Layer 1──────▶   │    CALOS    │ ──Layer 2──────▶   │ LLM Provider│
│  (Your App) │  sk-tenant-xxx     │  Platform   │  Platform/BYOK    │ OpenAI/etc  │
└─────────────┘                    └─────────────┘                    └─────────────┘
```

## Layer 1: Customer → CALOS (Tenant API Keys)

**Purpose**: Customers use these keys to access YOUR CALOS platform (just like how you use OpenAI's API keys to access their platform)

### Key Format
```
sk-tenant-{tenant_id}-{random_suffix}

Example: sk-tenant-550e8400-e29b-41d4-a716-446655440000-x7k9m2p4
```

### How It Works

1. **Customer Signs Up**
   - Creates account on your CALOS platform
   - Gets assigned a `tenant_id`
   - Chooses a subscription plan (Starter, Pro, Enterprise)

2. **Customer Generates API Key**
   ```bash
   POST /api/keys/generate
   Authorization: Bearer {session_token}

   Response:
   {
     "key_id": "abc-123",
     "api_key": "sk-tenant-550e8400-x7k9m2p4",
     "key_name": "Production Key",
     "created_at": "2025-01-15T10:30:00Z"
   }
   ```

3. **Customer Uses API Key**
   ```bash
   curl -X POST https://your-calos-platform.com/v1/chat/completions \
     -H "Authorization: Bearer sk-tenant-550e8400-x7k9m2p4" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

4. **CALOS Validates & Routes**
   - Validates tenant API key
   - Checks subscription status & usage limits
   - Routes to appropriate LLM provider (Layer 2)
   - Tracks usage & costs
   - Returns response to customer

### Database Storage

Stored in `calos_platform_api_keys` table (NEW - needs migration):

```sql
CREATE TABLE calos_platform_api_keys (
  key_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  key_hash VARCHAR(255) NOT NULL,    -- bcrypt hash of full key
  key_prefix VARCHAR(50) NOT NULL,   -- First 20 chars for display
  key_name VARCHAR(200),              -- User-friendly name
  status VARCHAR(50) DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Security

- **Never store plaintext keys** - only bcrypt hash
- **Show key once** on generation - customer must save it
- **Prefix only** for identification in UI (e.g., "sk-tenant-550e...")
- **Rate limiting** per key
- **Revocation** support

---

## Layer 2: CALOS → LLM Providers (Provider Keys)

**Purpose**: CALOS uses these keys to pay for OpenAI/Anthropic/DeepSeek on behalf of customers (OR customers can bring their own keys)

### Three Models

#### Model 1: Platform Keys (Default)
**YOU pay for OpenAI/Anthropic with YOUR keys, charge customers markup**

```
Customer → CALOS (pays you) → OpenAI (you pay) → Response
          Layer 1               Layer 2

Cost Flow:
- OpenAI charges: $0.01 per request
- You charge customer: $0.01 + 50% markup = $0.015
- Your profit: $0.005 per request
```

Platform keys stored in `.env`:
```bash
OPENAI_API_KEY=sk-proj-abc123...
ANTHROPIC_API_KEY=sk-ant-xyz789...
DEEPSEEK_API_KEY=sk-deep-...
```

#### Model 2: BYOK (Bring Your Own Key)
**Customer pays OpenAI directly with their own key, you charge platform fee only**

```
Customer → CALOS (pays platform fee) → OpenAI (customer pays) → Response
          Layer 1                      Layer 2 (customer's key)

Cost Flow:
- OpenAI charges: $0.01 (billed to customer's OpenAI account)
- You charge customer: $99/month platform fee only
- Customer saves on markup, you get predictable revenue
```

Customer's keys stored in `tenant_api_keys` table (EXISTING):
```sql
-- Already exists in migration 021
CREATE TABLE tenant_api_keys (
  key_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,      -- 'openai', 'anthropic'
  key_name VARCHAR(200),              -- "Production OpenAI"
  encrypted_api_key TEXT NOT NULL,    -- AES-256-GCM encrypted
  key_prefix VARCHAR(20),             -- First few chars
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Model 3: Ollama (Free Tier)
**Free users get routed to local Ollama models - no external API costs**

```
Free Tier Customer → CALOS → Ollama (localhost:11434) → Response
                     Layer 1   Layer 2 (free!)

Cost Flow:
- Ollama: $0 (runs on your server)
- You charge customer: $0 (free tier) or $9/month (starter)
- Your cost: Server hosting only
```

---

## Provider Routing Logic

When a request comes in with a tenant API key, CALOS decides which provider to use:

### Decision Tree

```javascript
async function routeRequest(tenantId, model, request) {
  // 1. Check if tenant has BYOK for this provider
  const byokKey = await getBYOKKey(tenantId, model);
  if (byokKey) {
    return routeToBYOK(byokKey, request); // Use customer's key
  }

  // 2. Check tenant's subscription tier
  const subscription = await getSubscription(tenantId);

  if (subscription.tier === 'free' || subscription.tier === 'starter') {
    // Route to Ollama (free)
    return routeToOllama(model, request);
  }

  if (subscription.tier === 'pro' || subscription.tier === 'enterprise') {
    // Check usage limits
    const withinLimits = await checkUsageLimits(tenantId);

    if (!withinLimits) {
      throw new Error('Usage limit exceeded. Upgrade or add payment method.');
    }

    // Route to platform provider keys (OpenAI/Anthropic)
    return routeToPlatformKey(model, request);
  }
}
```

### Pricing Tiers

| Tier | Provider | Cost Model | Token Limit |
|------|----------|------------|-------------|
| **Free** | Ollama only | $0/month | 100k tokens/month |
| **Starter** | Ollama only | $9/month | 1M tokens/month |
| **Pro** | OpenAI/Anthropic + Ollama | $99/month + usage | 10M included, then $0.15/M |
| **Enterprise** | OpenAI/Anthropic + Ollama | $999/month + usage | Unlimited |
| **BYOK** | Customer's keys | $99/month platform fee | Unlimited (customer pays provider) |

---

## Usage Tracking & Billing

### Every Request is Tracked

When a request completes, CALOS records:

```javascript
await recordUsageEvent({
  tenant_id: 'uuid',
  provider: 'openai',           // or 'anthropic', 'ollama', 'byok'
  model: 'gpt-4',
  tokens_input: 150,
  tokens_output: 450,
  tokens_total: 600,
  provider_cost_cents: 1,       // What OpenAI charged (if platform key)
  markup_cost_cents: 0,         // Markup (50% = 0.5 cents)
  total_cost_cents: 1,          // Total charged to tenant
  request_id: 'req-abc123',
  endpoint: '/v1/chat/completions'
});
```

Stored in `usage_billing_events` table (EXISTING).

### Monthly Invoicing

At end of billing period:

1. **Generate Invoice**
   ```sql
   SELECT generate_invoice(
     tenant_id,
     period_start,
     period_end
   );
   ```

2. **Invoice includes**:
   - Base subscription fee ($99/month)
   - Usage charges (tokens beyond included amount)
   - Total tokens used
   - Breakdown by provider

3. **Charge via Stripe**
   - Create invoice in Stripe
   - Webhook notifies when paid
   - Update `tenant_invoices.status = 'paid'`

---

## API Examples

### Customer Workflow

#### 1. Sign Up & Get Tenant Key

```bash
# Register
POST /api/auth/register
{
  "email": "customer@example.com",
  "password": "secure123",
  "tenant_name": "Acme Corp"
}

# Login
POST /api/auth/login
{
  "email": "customer@example.com",
  "password": "secure123"
}

Response: { "session_token": "sess-abc123" }

# Generate API Key
POST /api/keys/generate
Authorization: Bearer sess-abc123
{
  "key_name": "Production Key"
}

Response: {
  "api_key": "sk-tenant-550e8400-x7k9m2p4",
  "key_prefix": "sk-tenant-550e8400",
  "created_at": "2025-01-15T10:30:00Z"
}
```

#### 2. Use CALOS API

```bash
# Make LLM request
POST https://api.your-calos.com/v1/chat/completions
Authorization: Bearer sk-tenant-550e8400-x7k9m2p4
Content-Type: application/json

{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ]
}

Response: {
  "id": "req-abc123",
  "model": "gpt-4",
  "choices": [...],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 450,
    "total_tokens": 462
  },
  "cost": {
    "provider_cost_cents": 1,
    "total_cost_cents": 1,
    "currency": "USD"
  }
}
```

#### 3. Add BYOK (Optional)

```bash
# Add your own OpenAI key
POST /api/byok/add
Authorization: Bearer sess-abc123
{
  "provider": "openai",
  "api_key": "sk-proj-YourOwnOpenAIKey",
  "key_name": "My OpenAI Key"
}

Response: {
  "key_id": "byok-xyz789",
  "provider": "openai",
  "key_prefix": "sk-proj-YourO...",
  "status": "active"
}

# Now all requests will use YOUR OpenAI key instead of platform keys
# You only pay $99/month platform fee, no usage markup
```

#### 4. Manage Subscription

```bash
# View current subscription
GET /api/subscriptions/current
Authorization: Bearer sess-abc123

Response: {
  "tier": "pro",
  "status": "active",
  "tokens_used": 2500000,
  "tokens_included": 10000000,
  "tokens_remaining": 7500000,
  "cost_this_period_cents": 9900,  # $99 base + $0 overage
  "next_billing_date": "2025-02-15"
}

# Upgrade to Enterprise
POST /api/subscriptions/upgrade
Authorization: Bearer sess-abc123
{
  "tier": "enterprise"
}
```

---

## Security Best Practices

### For Tenant API Keys (Layer 1)

1. **Never log full keys** - only prefixes
2. **Bcrypt hash** before storing in database
3. **Show once** on generation - can't retrieve later
4. **Revocation** - mark `status = 'revoked'`, don't delete
5. **Rate limiting** per key (1000 requests/hour for Pro)
6. **IP whitelisting** (optional, enterprise only)

### For Provider Keys (Layer 2)

1. **Platform keys** stored in `.env` (never in database)
2. **BYOK keys** encrypted with AES-256-GCM before database storage
3. **Encryption key** stored in env var `KEYRING_ENCRYPTION_KEY`
4. **Key rotation** - allow customers to update BYOK keys
5. **Verification** - test keys before storing

---

## Implementation Checklist

- [x] Database schema (`tenant_api_keys` exists in migration 021)
- [ ] Platform API keys table (`calos_platform_api_keys` - needs migration)
- [ ] Tenant API key routes (`routes/tenant-api-key-routes.js`)
- [ ] Tenant API key auth middleware (`middleware/tenant-api-key-auth.js`)
- [ ] BYOK routes (`routes/byok-routes.js`)
- [ ] Subscription routes (`routes/subscription-routes.js`)
- [ ] Provider router (`lib/provider-router.js`)
- [ ] Stripe webhook enhancements (`routes/subscription-routes.js`)
- [ ] Usage tracking integration (exists, needs connection)
- [ ] SDK examples (`sdk/platform/example.js`)

---

## References

- Database migration: `database/migrations/021_usage_based_pricing.sql`
- Existing tenant isolation: `lib/tenant-isolation.js`
- Existing keyring: `lib/keyring.js`
- Existing API auth: `middleware/api-auth.js` (for developer keys)
- LLM routes: `routes/llm-routes.js`
- Multi-LLM router: `lib/multi-llm-router.js`

---

**Ready to implement?** Run:
```bash
npm run setup    # Configure platform keys
npm run admin    # View tenant API keys
```
