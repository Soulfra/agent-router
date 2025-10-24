# CALOS Infrastructure Guide

**Complete System Architecture & Configuration**

This guide explains how CALOS works under the hood and how to configure network access, phone forwarding, and understand the database system.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Migrations (No Python Needed!)](#database-migrations)
3. [Ollama Network Configuration](#ollama-network-configuration)
4. [Phone Forwarding with Twilio](#phone-forwarding-with-twilio)
5. [The Two-Layer API Key System](#two-layer-api-key-system)
6. [Complete Request Flow](#complete-request-flow)
7. [Troubleshooting](#troubleshooting)

---

## System Architecture

CALOS is a **wrapper/proxy** system built entirely in **Node.js/JavaScript**. No Python, Go, Zig, or Java required.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CUSTOMER LAYER                          │
│  (Mobile Apps, Web Apps, CLI Tools, Third-Party Services)      │
└─────────────────────────────────────────────────────────────────┘
                                ↓
                     Bearer: sk-tenant-xxx
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      CALOS PLATFORM (YOU)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Tenant API Key Auth → Check subscription → Route       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                ↓                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            PROVIDER ROUTER (the "wrapper")              │   │
│  │  1. BYOK? → Use tenant's key                            │   │
│  │  2. Free/Starter? → Ollama (local, free)                │   │
│  │  3. Pro/Enterprise? → OpenAI/Anthropic (platform keys)  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           ↓                  ↓                   ↓
    [Ollama Local]     [OpenAI API]      [Anthropic API]
    localhost:11434    api.openai.com    api.anthropic.com
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Main Router** | Express.js | HTTP server, handles all requests |
| **Database** | PostgreSQL | Tenant data, usage, billing |
| **Keyring** | AES-256-GCM | Encrypted credential storage |
| **Provider Router** | Node.js | Smart LLM routing logic (the wrapper) |
| **Multi-LLM Router** | Node.js | Actual API calls to providers |
| **Twilio Integration** | Twilio SDK | Phone/SMS forwarding |
| **Stripe Integration** | Stripe SDK | Subscription billing |

---

## Database Migrations

### ❌ MYTH: "We need Python for UUID generation"
### ✅ TRUTH: PostgreSQL has built-in UUIDs

**All migrations are pure SQL.** No Python needed!

#### How UUID Generation Works

```sql
-- Every table uses PostgreSQL's built-in function
CREATE TABLE tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`gen_random_uuid()`** is a native PostgreSQL function (added in PostgreSQL 13+). It generates cryptographically secure UUIDs using the database's crypto module.

#### Migration Files

All migrations are in `database/migrations/`:

```
001_initial_schema.sql          → Core tables (tenants, users, sessions)
021_billing_system.sql          → Usage tracking, pricing models
029_calos_platform_api_keys.sql → Tenant API keys (Layer 1)
030_credits_system.sql          → Prepaid credits for phone/SMS
```

**Running migrations:**

```bash
# Initialize database
npm run setup

# Or manually via psql
psql -U your_user -d calos_platform -f database/migrations/001_initial_schema.sql
```

#### Why No Python?

- **UUIDs**: PostgreSQL's `gen_random_uuid()`
- **Timestamps**: PostgreSQL's `NOW()` and `TIMESTAMPTZ`
- **JSON**: PostgreSQL's native `JSONB` type
- **Encryption**: Node.js `lib/keyring.js` handles AES-256-GCM

**The entire stack is SQL + Node.js. Simple.**

---

## Ollama Network Configuration

By default, Ollama runs on `localhost:11434` (only accessible from the same machine).

### Expose Ollama on Your Local Network

**Step 1: Configure Ollama to listen on all interfaces**

```bash
# Edit .env
OLLAMA_HOST=0.0.0.0:11434
```

Or export directly:

```bash
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

**Step 2: Update CALOS to use network IP**

```bash
# .env
OLLAMA_BASE_URL=http://192.168.1.87:11434
```

**Step 3: Test from another device**

```bash
# From another computer/phone on the same network
curl http://192.168.1.87:11434/api/version

# Should return: {"version":"0.9.6"}
```

### Security Considerations

⚠️ **Warning**: Exposing Ollama on `0.0.0.0` allows **anyone on your network** to access it.

**Recommended:**
- Use firewall rules to restrict access
- Or bind to specific local IP: `OLLAMA_HOST=192.168.1.87:11434`
- For production, use reverse proxy with authentication

### Accessing from Mobile Phone

Once Ollama is on `192.168.1.87:11434`, you can:

1. **Direct API calls:**
   ```bash
   # From your phone (using Termux or similar)
   curl http://192.168.1.87:11434/api/generate \
     -d '{"model":"llama2","prompt":"hello"}'
   ```

2. **Through CALOS platform:**
   ```bash
   # CALOS automatically routes free-tier requests to Ollama
   curl http://192.168.1.87:3000/v1/chat/completions \
     -H "Authorization: Bearer sk-tenant-xxx"
   ```

---

## Phone Forwarding with Twilio

**Good news: This is already implemented!** See `routes/twilio-routes.js` and `database/migrations/030_credits_system.sql`.

### How Phone Forwarding Works

```
Your Phone          Twilio Cloud              Your Server
────────────        ─────────────             ─────────────

Call → 555-1234  →  Twilio receives  →  POST /api/twilio/voice
                    incoming call
                                      →  Your server processes

                    Twilio forwards   ←  Return TwiML instructions
                    to destination

Forwarded call   ←  Call connected
answered
```

### Setup Process

**1. Get Twilio Phone Number**

- Sign up at https://www.twilio.com
- Purchase a phone number (e.g., `+1-555-123-4567`)
- Costs ~$1/month + usage

**2. Configure Webhooks**

In Twilio Console → Phone Numbers → Configure:

```
Voice & Fax:
  When a call comes in:
    Webhook: https://your-server.com/api/twilio/voice
    HTTP POST

Messaging:
  When a message comes in:
    Webhook: https://your-server.com/api/twilio/sms
    HTTP POST
```

**3. Add Twilio Credentials to .env**

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567
```

**4. Test Phone Verification**

```bash
# Request verification code
curl -X POST http://localhost:3000/api/twilio/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+15559876543",
    "user_id": "your-user-uuid"
  }'

# Verify code
curl -X POST http://localhost:3000/api/twilio/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+15559876543",
    "code": "123456",
    "user_id": "your-user-uuid"
  }'
```

**5. Send SMS**

```bash
curl -X POST http://localhost:3000/api/twilio/send-sms \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15559876543",
    "message": "Hello from CALOS!",
    "user_id": "your-user-uuid"
  }'
```

### Credit System

Every SMS/call deducts from prepaid credits:

| Action | Cost | Your Profit |
|--------|------|-------------|
| SMS (outbound) | 10 credits | 74% margin |
| SMS (inbound) | 5 credits | 50% margin |
| Voice (per minute) | 20 credits | 26% margin |

**Credit Packages:**

```sql
SELECT * FROM platform_tiers;

tier_code    | base_price_cents | credits_included
-------------|------------------|------------------
free         | 0                | 100
starter      | 2900             | 1000
pro          | 9900             | 5000
enterprise   | 29900            | 20000
```

### Forwarding Calls from One Phone to Another

Already works! When someone calls your Twilio number:

```javascript
// routes/twilio-routes.js automatically handles this
router.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Forward to your personal phone
  twiml.dial(process.env.FORWARD_TO_NUMBER || '+15559876543');

  res.type('text/xml');
  res.send(twiml.toString());
});
```

Set forwarding destination:

```bash
# .env
FORWARD_TO_NUMBER=+15559876543
```

---

## Two-Layer API Key System

### Layer 1: Customer → CALOS

**Format:** `sk-tenant-<tenant_id>-<random>`

Example: `sk-tenant-a1b2c3d4-e5f6-7890-abcd-ef1234567890-4a3b2c1d`

**Storage:**
- Key is hashed with bcrypt (10 rounds)
- Stored in `calos_platform_api_keys` table
- Validated by `middleware/tenant-api-key-auth.js`

**Usage:**

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-tenant-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role":"user","content":"hello"}]
  }'
```

### Layer 2: CALOS → LLM Providers

**Three models:**

1. **BYOK (Bring Your Own Key)**
   - Tenant adds their OpenAI/Anthropic key via `/api/byok/add`
   - Encrypted with AES-256-GCM in `lib/keyring.js`
   - Provider Router uses tenant's key
   - Tenant pays provider directly, CALOS charges platform fee

2. **Platform Keys (Pro/Enterprise)**
   - CALOS uses its own OpenAI/Anthropic keys from `.env`
   - CALOS pays provider, charges tenant with markup
   - Markup configured in `tenant_licenses` table

3. **Ollama (Free/Starter)**
   - Uses local Ollama models (free, no API key)
   - No external API costs
   - Slower, but zero marginal cost

### How Routing Decisions Are Made

See `lib/provider-router.js`:

```javascript
async route(tenantId, request) {
  // Step 1: Check BYOK
  const byokKey = await this._getBYOKKey(tenantId, request.model);
  if (byokKey) {
    return { provider: 'openai', apiKey: byokKey.apiKey, useBYOK: true };
  }

  // Step 2: Check subscription tier
  const subscription = await this._getSubscription(tenantId);

  if (subscription.tier_code === 'free' || subscription.tier_code === 'starter') {
    return { provider: 'ollama', model: 'llama2' };
  }

  if (subscription.tier_code === 'pro' || subscription.tier_code === 'enterprise') {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }
}
```

---

## Complete Request Flow

### Example: Customer makes a chat completion request

```
1. Customer App
   ↓ POST /v1/chat/completions
   ↓ Authorization: Bearer sk-tenant-abc123-xyz789

2. middleware/tenant-api-key-auth.js
   ↓ Extract Bearer token
   ↓ Check cache (5 min TTL)
   ↓ If not cached: Query database, bcrypt.compare()
   ↓ Check rate limits (60/min, 1000/hour, 10000/day)
   ↓ Check IP whitelist, endpoint restrictions
   ↓ Set req.tenantId and req.apiKey

3. routes/chat-routes.js (or similar)
   ↓ Validate request body
   ↓ Call ProviderRouter.route(tenantId, request)

4. lib/provider-router.js
   ↓ Get subscription: SELECT * FROM tenant_licenses WHERE tenant_id = ?
   ↓ Check usage limits: tokens_used < tokens_limit
   ↓ Check BYOK: SELECT * FROM tenant_api_keys WHERE tenant_id = ?
   ↓ If BYOK: apiKey = keyring.getCredential(provider, 'api_key', tenantId)
   ↓ If no BYOK: Determine provider based on tier
   ↓   - free/starter → ollama
   ↓   - pro/enterprise → openai (platform key)

5. lib/multi-llm-router.js
   ↓ Make actual API call to provider
   ↓ If Ollama: POST http://localhost:11434/api/chat
   ↓ If OpenAI: POST https://api.openai.com/v1/chat/completions
   ↓ If Anthropic: POST https://api.anthropic.com/v1/messages

6. lib/provider-router.js (continued)
   ↓ Calculate costs:
   ↓   - Ollama: $0
   ↓   - OpenAI: $0.03/1K input + $0.06/1K output
   ↓   - Anthropic: $0.015/1K input + $0.075/1K output
   ↓ Apply markup (if not BYOK): total_cost = provider_cost * (1 + markup_percent/100)
   ↓ Record usage: INSERT INTO calos_api_key_usage_log
   ↓ Update tenant_licenses: tokens_used_this_period += total_tokens

7. Response to customer
   ↓ {
   ↓   "choices": [...],
   ↓   "usage": {"prompt_tokens":10,"completion_tokens":20},
   ↓   "provider": "openai",
   ↓   "billing": {
   ↓     "provider_cost_cents": 3,
   ↓     "markup_cost_cents": 1,
   ↓     "total_cost_cents": 4
   ↓   }
   ↓ }
```

### Webhook Flow (External Service → CALOS)

Example: Stripe payment received

```
1. Customer pays on Stripe

2. Stripe Cloud
   ↓ POST https://your-server.com/webhooks/stripe
   ↓ Headers:
   ↓   Stripe-Signature: t=xxx,v1=yyy
   ↓ Body:
   ↓   { "type": "invoice.paid", "data": {...} }

3. routes/webhook-routes.js
   ↓ Verify HMAC signature
   ↓ const sig = req.headers['stripe-signature']
   ↓ const event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET)
   ↓ If signature invalid: 400 Bad Request

4. Process webhook
   ↓ if (event.type === 'invoice.paid')
   ↓   → Update tenant_licenses: status = 'active'
   ↓   → Add credits: user_credits += credits_included
   ↓ if (event.type === 'subscription.deleted')
   ↓   → Update tenant_licenses: status = 'cancelled'

5. Respond to Stripe
   ↓ 200 OK (must respond within 30 seconds!)
```

---

## Troubleshooting

### Issue: "No Python module named uuid"
**Solution:** You don't need Python! PostgreSQL handles UUIDs natively with `gen_random_uuid()`.

### Issue: Can't access Ollama from phone
**Solution:**
1. Check Ollama is running: `curl http://localhost:11434/api/version`
2. Set `OLLAMA_HOST=0.0.0.0:11434` in environment
3. Restart Ollama: `ollama serve`
4. Check firewall: `sudo ufw allow 11434/tcp`
5. Test from phone: `curl http://192.168.1.87:11434/api/version`

### Issue: Twilio webhooks return 404
**Solution:**
1. Check server is running: `npm start`
2. Use public URL (ngrok for testing): `ngrok http 3000`
3. Update Twilio webhook URL to: `https://xyz.ngrok.io/api/twilio/voice`
4. Check route exists: `grep -r "router.post('/voice'" routes/`

### Issue: API key validation fails
**Solution:**
1. Check key format: Must be `sk-tenant-<tenant_id>-<random>`
2. Check database: `SELECT * FROM calos_platform_api_keys WHERE key_prefix LIKE 'sk-tenant-%'`
3. Check key is active: `status = 'active'`
4. Check rate limits: `rate_limit_per_minute`, `rate_limit_per_hour`, `rate_limit_per_day`

### Issue: Provider Router always uses Ollama
**Solution:**
1. Check subscription tier: `SELECT tier_code FROM tenant_licenses WHERE tenant_id = ?`
2. Check BYOK keys: `SELECT * FROM tenant_api_keys WHERE tenant_id = ?`
3. Check platform keys in .env: `echo $OPENAI_API_KEY`
4. Check provider router logs: `grep -i "ProviderRouter" logs/`

### Issue: Phone forwarding doesn't work
**Solution:**
1. Check Twilio credentials: `echo $TWILIO_ACCOUNT_SID`
2. Check webhook is configured in Twilio Console
3. Check credits: `SELECT credits_remaining FROM user_credits WHERE user_id = ?`
4. Check phone is verified: `SELECT * FROM verified_phones WHERE phone_number = ?`

---

## Summary

**Key Takeaways:**

1. ✅ **All Node.js/JavaScript** - No Python, Go, Zig, or Java
2. ✅ **PostgreSQL handles UUIDs** - `gen_random_uuid()` is built-in
3. ✅ **Ollama can be network-accessible** - Set `OLLAMA_HOST=0.0.0.0:11434`
4. ✅ **Phone forwarding already works** - Configure Twilio webhooks to your server
5. ✅ **Two-layer API system** - Customer → CALOS (Bearer token) → Provider (API key)
6. ✅ **Wrapper architecture** - CALOS sits between customers and external services
7. ✅ **Webhook pattern** - External services POST to your server (not polling)

**Everything is simpler than it seems. CALOS is just a smart wrapper around external APIs.**

---

For more details:
- API Key Architecture: `docs/API-KEY-ARCHITECTURE.md`
- Quick Start: `docs/QUICK-START.md`
- Database Schema: `database/migrations/`
- Provider Routing Logic: `lib/provider-router.js`
- Twilio Integration: `routes/twilio-routes.js`
