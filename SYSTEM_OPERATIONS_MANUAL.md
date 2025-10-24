# CalOS System Operations Manual

**Version**: 2.0.0
**Classification**: Internal Operations
**Last Updated**: 2025-10-19
**Status**: ✅ OPERATIONAL

> **NASA-Style Operations Manual** - Complete system architecture, bootstrap sequence, and integration flows for CalOS platform operations.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Phase 1: Bootstrap Sequence](#phase-1-bootstrap-sequence)
3. [Phase 2: User Onboarding Flow](#phase-2-user-onboarding-flow)
4. [Phase 3: Request Routing & Execution](#phase-3-request-routing--execution)
5. [Phase 4: Content Integration](#phase-4-content-integration)
6. [Phase 5: Integration Points](#phase-5-integration-points)
7. [Phase 6: Testing & Verification](#phase-6-testing--verification)
8. [Emergency Procedures](#emergency-procedures)
9. [Operational Checklist](#operational-checklist)

---

## System Overview

### Mission Statement
CalOS is a **multi-tenant AI platform** that routes user requests to optimal AI models (Ollama local models or cloud APIs), tracks usage via credits, and provides content curation and collaboration tools.

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     CALOS PLATFORM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ FRONTEND    │  │ MIDDLEWARE   │  │ BACKEND            │     │
│  │             │  │              │  │                    │     │
│  │ - Web UI    │─▶│ - Express    │─▶│ - PostgreSQL       │     │
│  │ - Mobile    │  │ - WebSocket  │  │ - Redis Cache      │     │
│  │ - Voice     │  │ - Auth       │  │ - Stripe           │     │
│  │ - PWA       │  │ - Router     │  │ - Ollama           │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ AI MODEL LAYER (Multi-LLM Router)                      │     │
│  ├────────────────────────────────────────────────────────┤     │
│  │                                                          │     │
│  │ Ollama (Local - FREE)         Cloud APIs (Paid)       │     │
│  │ ├─ soulfra        (creative)   ├─ OpenAI    ($$$$)    │     │
│  │ ├─ deathtodata    (analytics)  ├─ Anthropic ($$$$)    │     │
│  │ ├─ saveorsink     (triage)     ├─ DeepSeek  ($)       │     │
│  │ └─ roughsparks    (technical)  └─ (fallback chain)    │     │
│  │                                                          │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### System Responsibilities

| Layer | Component | Responsibility | Port |
|-------|-----------|----------------|------|
| **Frontend** | Web UI | User interaction, content display | 5001 (HTTP) |
| **Frontend** | WebSocket | Real-time updates, chat, notifications | 5001 (WS) |
| **Auth** | BiometricAuth | Face ID/Touch ID via WebAuthn | 5001 |
| **Auth** | DevicePairing | QR codes, WiFi proximity pairing | 5001 |
| **Routing** | Multi-LLM Router | Model selection, fallback, cost optimization | N/A |
| **AI Models** | Ollama | Local models (soulfra, deathtodata, etc.) | 11434+ |
| **AI Models** | Cloud APIs | OpenAI, Anthropic, DeepSeek | External |
| **Billing** | Credits System | Token tracking, Stripe payments | 5001 |
| **Content** | Curator | News aggregation, curation, forums | 5001 |
| **Database** | PostgreSQL | Persistent storage | 5432 |
| **Cache** | Redis (optional) | Session cache, rate limiting | 6379 |

---

## Phase 1: Bootstrap Sequence

### 1.1 Pre-Flight Checks

**Before starting CalOS**, verify system requirements:

```bash
# Check Node.js version (v18+)
node --version

# Check PostgreSQL (running)
psql -U postgres -c "SELECT version();"

# Check Ollama (installed)
ollama --version

# Check disk space (>10GB free)
df -h

# Check memory (>4GB available)
free -h
```

**Required Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/calos

# AI APIs (optional - Ollama works without these)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Ollama
OLLAMA_URL=http://localhost:11434

# Session
SESSION_SECRET=random-32-char-string
JWT_SECRET=random-32-char-string

# Domain
DOMAIN=calos.ai
PORT=5001
```

### 1.2 Bootstrap Sequence (Order Matters!)

**Step 1: Database Initialization**
```bash
# Start PostgreSQL
sudo service postgresql start

# Run migrations
npm run migrate

# Verify schema
psql $DATABASE_URL -c "\dt"
```

**Expected Tables:**
- ✅ `users`
- ✅ `user_credits`
- ✅ `biometric_challenges`
- ✅ `device_pairings`
- ✅ `curation_configs`
- ✅ `curated_content`
- ✅ `forum_threads`
- ✅ `forum_posts`
- ✅ `forum_votes`
- ✅ (50+ more tables...)

**Step 2: Start Ollama & Load Models**
```bash
# Start Ollama service
ollama serve &

# Pull base models
ollama pull llama3.2:3b
ollama pull codellama:7b

# Create custom domain models
cd ollama-models
./setup-models.sh

# Verify models loaded
ollama list
```

**Expected Models:**
- ✅ `soulfra:latest` (creative persona)
- ✅ `deathtodata:latest` (analytics persona)
- ✅ `saveorsink:latest` (triage persona)
- ✅ `roughsparks:latest` (technical persona)

**Step 3: Start Express Server**
```bash
# Development mode
npm run dev

# Production mode
NODE_ENV=production npm start
```

**Step 4: Verify Health Checks**
```bash
# Server health
curl http://localhost:5001/health

# Expected: {"status": "ok", "database": "connected", "uptime": 123}

# Ollama connectivity
curl http://localhost:5001/api/ollama/models

# Expected: {"models": ["soulfra", "deathtodata", ...]}

# Database connectivity
curl http://localhost:5001/api/health/database

# Expected: {"connected": true, "tables": 87}
```

### 1.3 Readiness Gates

System is **READY** when all checks pass:

- [ ] ✅ PostgreSQL is online and migrated
- [ ] ✅ Ollama is running with all custom models
- [ ] ✅ Express server started successfully
- [ ] ✅ WebSocket server accepting connections
- [ ] ✅ All health endpoints return HTTP 200

**If any check fails**, see [Emergency Procedures](#emergency-procedures).

---

## Phase 2: User Onboarding Flow

### 2.1 New User Registration

**Flow Diagram:**

```
User Action                    System Response
─────────────────────────────────────────────────────────────
1. Visit /register              → Render registration form
                                  (email, password fields)

2. Submit form                  → Validate email format
   POST /api/auth/register        Check if email exists
                                  Hash password (bcrypt)
                                  Insert into users table
                                  Generate JWT session token

3. Store JWT in cookie          → Set session cookie
                                  httpOnly, secure, sameSite

4. Redirect to /onboarding      → Load onboarding wizard
```

**Registration API:**

```javascript
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "displayName": "John Doe"
}

// Response
{
  "status": "success",
  "userId": "uuid-here",
  "session": {
    "token": "jwt-token-here",
    "expiresAt": "2025-10-20T12:00:00Z"
  }
}
```

**Database Changes:**

```sql
INSERT INTO users (id, email, password_hash, display_name, created_at)
VALUES (gen_random_uuid(), 'user@example.com', '$2b$10$...', 'John Doe', NOW());

INSERT INTO user_credits (user_id, balance_cents)
VALUES (user_id, 1000); -- $10 free trial credits
```

### 2.2 Biometric Enrollment (Face ID/Touch ID)

**Flow:**

```
User Action                    System Response
─────────────────────────────────────────────────────────────
1. Click "Enable Face ID"       → Generate WebAuthn challenge
   (on mobile/Mac)                Store challenge in DB (5 min TTL)

2. Face scan prompt appears     → Browser calls navigator.credentials.create()
   (iOS/Mac native)               User scans face/fingerprint

3. Browser returns credential   → Verify credential signature
                                  Store public key in database
                                  Mark device as "biometric-enabled"

4. Future logins                → User scans face → instant auth
                                  No password needed
```

**WebAuthn Registration API:**

```javascript
// Step 1: Get challenge
GET /api/auth/biometric/register-options
{
  "userId": "uuid-here"
}

// Response
{
  "challenge": "base64-challenge",
  "rp": {"name": "CALOS", "id": "calos.ai"},
  "user": {"id": "uuid", "name": "user@example.com"},
  "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
  "authenticatorSelection": {
    "authenticatorAttachment": "platform",
    "userVerification": "required"
  },
  "challengeId": "challenge-uuid"
}

// Step 2: Submit credential
POST /api/auth/biometric/register
{
  "challengeId": "challenge-uuid",
  "credential": {
    "id": "credential-id",
    "rawId": "base64-raw-id",
    "response": {
      "clientDataJSON": "base64-data",
      "attestationObject": "base64-attestation"
    },
    "type": "public-key"
  }
}

// Response
{
  "status": "success",
  "credentialId": "credential-id-saved"
}
```

### 2.3 Device Pairing (Multi-Device Setup)

**Scenario:** User has logged in on desktop, wants to pair mobile device.

**Flow:**

```
Desktop (Source Device)         Mobile (Target Device)
─────────────────────────────────────────────────────────────
1. Click "Add Device"
   POST /api/auth/pair/initiate

2. Receive QR code
   (contains pairing_code + URL)

3. Display QR code to user      → User scans QR with mobile camera

                                4. Open pairing URL on mobile
                                   GET /pair?code=ABC123

                                5. Prompt for biometric on mobile
                                   (Face ID/Touch ID)

                                6. Complete pairing
                                   POST /api/auth/pair/complete
                                   {code, deviceInfo}

7. Notification: "iPhone paired" ← Device added to account

8. Both devices now trusted     → Shared session state
```

**Database Changes:**

```sql
INSERT INTO device_pairings (
  user_id,
  device_fingerprint,
  device_nickname,
  platform,
  trust_level,
  paired_at
)
VALUES (
  user_id,
  'sha256-fingerprint',
  'My iPhone',
  'iOS',
  'biometric',
  NOW()
);
```

### 2.4 Initial Credits Allocation

**New User Credits:**

- **Free Trial**: $10.00 (1,000 cents)
- **Welcome Bonus**: $1.00 (100 cents) - if referred
- **Total**: $11.00 (1,100 cents)

**Credit Types:**

| Service | Cost | Example |
|---------|------|---------|
| OpenAI GPT-4 | $0.03/1K tokens | 1000 tokens = 3 cents |
| Anthropic Claude | $0.02/1K tokens | 1000 tokens = 2 cents |
| DeepSeek | $0.001/1K tokens | 1000 tokens = 0.1 cents |
| Ollama (Local) | FREE | Unlimited |

**Usage Tracking:**

```sql
-- After each API call
INSERT INTO usage_log (
  user_id,
  provider,
  model,
  tokens_used,
  cost_cents,
  created_at
)
VALUES (
  user_id,
  'openai',
  'gpt-4',
  1250,
  4, -- $0.04
  NOW()
);

-- Update user balance
UPDATE user_credits
SET balance_cents = balance_cents - 4,
    lifetime_spent_cents = lifetime_spent_cents + 4
WHERE user_id = user_id;
```

---

## Phase 3: Request Routing & Execution

### 3.1 Request Flow Overview

```
┌────────┐     ┌──────────┐     ┌───────────────┐     ┌──────────┐
│ User   │────▶│  Auth    │────▶│   Multi-LLM   │────▶│ AI Model │
│ Request│     │ Validate │     │    Router     │     │ Provider │
└────────┘     └──────────┘     └───────────────┘     └──────────┘
                    │                    │                   │
                    ▼                    ▼                   ▼
             Check credits         Route by task        Execute
             Verify session        Cost optimize        Generate
             Device trust          Select model         Response
                    │                    │                   │
                    ▼                    ▼                   ▼
             ┌──────────┐     ┌───────────────┐     ┌──────────┐
             │ Deduct   │◀────│   Track       │◀────│ Return   │
             │ Credits  │     │   Usage       │     │ Response │
             └──────────┘     └───────────────┘     └──────────┘
```

### 3.2 Authentication Phase

**Step 1: Session Validation**

```javascript
// Middleware: extractAuth
const token = req.cookies.session || req.headers['authorization'];
const decoded = jwt.verify(token, JWT_SECRET);

// Check if session still valid
const session = await db.query(
  'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
  [decoded.sessionId]
);

if (!session.rows.length) {
  throw new Error('Session expired');
}

req.user = {
  userId: session.user_id,
  email: session.email,
  deviceId: session.device_id
};
```

**Step 2: Device Trust Verification**

```javascript
// Check if device is trusted
const device = await db.query(
  `SELECT trust_level FROM device_pairings
   WHERE user_id = $1 AND device_fingerprint = $2`,
  [req.user.userId, req.deviceFingerprint]
);

if (!device.rows.length) {
  // Unknown device - require additional auth
  return res.status(403).json({
    error: 'Device not trusted',
    action: 'pair_device'
  });
}

if (device.rows[0].trust_level === 'biometric') {
  // High-trust device - allow sensitive operations
  req.user.trustLevel = 'high';
} else {
  // Password-only device - limited access
  req.user.trustLevel = 'medium';
}
```

**Step 3: Credit Balance Check**

```javascript
// Get user balance
const balance = await db.query(
  'SELECT balance_cents FROM user_credits WHERE user_id = $1',
  [req.user.userId]
);

req.user.balanceCents = balance.rows[0]?.balance_cents || 0;

// Minimum balance check
if (req.user.balanceCents < 10) {
  return res.status(402).json({
    error: 'Insufficient credits',
    balance: req.user.balanceCents,
    message: 'Purchase more credits to continue'
  });
}
```

### 3.3 Multi-LLM Router Decision Tree

```
User Request
   │
   ├─ Check user preference
   │   └─ preferredProvider in request?
   │       ├─ Yes → Use that provider (if available)
   │       └─ No → Continue to task-based routing
   │
   ├─ Analyze task type
   │   ├─ taskType = "code" → Prefer CodeLlama or OpenAI
   │   ├─ taskType = "creative" → Prefer Claude or soulfra
   │   ├─ taskType = "reasoning" → Prefer GPT-4 or roughsparks
   │   ├─ taskType = "analytics" → Prefer deathtodata
   │   └─ taskType = "fact" → Prefer DeepSeek (cheap)
   │
   ├─ Cost optimization check
   │   ├─ User has credits > $5 → Allow expensive models
   │   ├─ User has credits < $5 → Prefer cheaper models
   │   └─ User has credits < $1 → Force Ollama only
   │
   ├─ Model selection
   │   ├─ Try primary provider
   │   │   ├─ Success → Return response
   │   │   └─ Fail → Continue to fallback
   │   │
   │   ├─ Try fallback #1
   │   │   ├─ Success → Return response
   │   │   └─ Fail → Continue to fallback #2
   │   │
   │   └─ Try fallback #2 (Ollama)
   │       ├─ Success → Return response
   │       └─ Fail → Return error
   │
   └─ Return response + metadata
```

### 3.4 Model Routing Examples

**Example 1: Code Generation Request**

```javascript
POST /api/chat/complete
{
  "prompt": "Write a Python function to reverse a string",
  "taskType": "code",
  "maxTokens": 500
}

// Router decision:
// 1. Task = "code" → Prefer codellama or gpt-4
// 2. User balance = $8.50 → Can afford OpenAI
// 3. Check OpenAI availability → Available
// 4. Route to: OpenAI GPT-4
// 5. Cost: ~$0.015 (500 tokens)

// Response:
{
  "text": "def reverse_string(s):\n    return s[::-1]",
  "provider": "openai",
  "model": "gpt-4",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 15,
    "total_tokens": 27
  },
  "cost_cents": 2,
  "latency_ms": 1200
}
```

**Example 2: Creative Writing (Low Balance)**

```javascript
POST /api/chat/complete
{
  "prompt": "Write a poem about mountains",
  "taskType": "creative",
  "maxTokens": 300
}

// Router decision:
// 1. Task = "creative" → Prefer Claude or soulfra
// 2. User balance = $0.45 → Too low for Claude ($$$)
// 3. Fallback to: Ollama (soulfra model)
// 4. Cost: FREE

// Response:
{
  "text": "Peaks that touch the sky so high...",
  "provider": "ollama",
  "model": "soulfra",
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 150,
    "total_tokens": 158
  },
  "cost_cents": 0,
  "latency_ms": 800
}
```

**Example 3: Custom Ollama Model (Domain-Specific)**

```javascript
POST /api/chat/complete
{
  "prompt": "Generate CSS for a purple gradient button",
  "preferredProvider": "ollama",
  "model": "soulfra", // Creative domain model
  "maxTokens": 200
}

// Router decision:
// 1. preferredProvider = "ollama" → Use Ollama
// 2. model = "soulfra" → Load soulfra model
// 3. Cost: FREE

// Response includes soulfra brand voice:
{
  "text": "/* Soulfra Creative Button */\n.btn {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  ...\n}",
  "provider": "ollama",
  "model": "soulfra",
  "cost_cents": 0
}
```

### 3.5 Credit Deduction & Usage Logging

**After successful response:**

```javascript
// Calculate actual cost
const costCents = calculateCost(provider, model, tokensUsed);

// Deduct from user balance
await db.query(`
  UPDATE user_credits
  SET balance_cents = balance_cents - $1,
      lifetime_spent_cents = lifetime_spent_cents + $1,
      last_spent_at = NOW()
  WHERE user_id = $2
`, [costCents, userId]);

// Log usage for analytics
await db.query(`
  INSERT INTO usage_log (
    user_id,
    provider,
    model,
    prompt,
    response,
    tokens_used,
    cost_cents,
    latency_ms,
    task_type,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
`, [userId, provider, model, prompt, response, tokensUsed, costCents, latencyMs, taskType]);

// Update rate limiting counters
await redis.incr(`rate_limit:${userId}:${hour}`);
```

---

## Phase 4: Content Integration

### 4.1 Content Curation ↔ Model Routing

**Scenario:** User wants AI-curated news summaries

**Flow:**

```
1. User configures content preferences
   POST /api/curation/configure
   {topics: ["ai", "crypto"], sources: ["hackernews"]}

2. System fetches articles from sources
   GET Hacker News API → 30 articles

3. User requests AI summary
   "Hey Cal, summarize today's AI news"

4. Voice command detected
   → VoiceContentBridge routes to Multi-LLM Router

5. Router analyzes task
   - taskType: "summarization"
   - preferredProvider: depends on credit balance

6. If balance > $5:
   → Route to Claude (excellent at summarization)

   If balance < $5:
   → Route to Ollama (deathtodata model for analytics)

7. Generate summary
   Input: 30 article titles + descriptions
   Output: "Today's top AI stories: GPT-5 announced, ..."

8. Broadcast via WebSocket
   → Display in unified feed

9. Deduct credits
   Claude: ~$0.10 for 2000 tokens
   Ollama: FREE
```

**API Integration:**

```javascript
// In lib/voice-content-bridge.js
async handleTopicNews({ match, userId }) {
  const topic = match[1]; // "ai"

  // Get curated feed
  const feed = await curator.getCuratedFeed(userId, { limit: 20 });

  // Filter by topic
  const articles = feed.items.filter(item =>
    item.topics.includes(topic)
  );

  // Ask AI to summarize
  const router = new MultiLLMRouter({ strategy: 'smart' });

  const summary = await router.complete({
    systemPrompt: 'You are a news summarizer. Be concise.',
    prompt: `Summarize these ${topic} articles:\n${JSON.stringify(articles)}`,
    taskType: 'summarization',
    maxTokens: 500
  });

  // Broadcast to user
  this.broadcast({
    type: 'curated_summary',
    topic,
    summary: summary.text,
    articleCount: articles.length,
    provider: summary.provider,
    cost: summary.cost_cents
  });
}
```

### 4.2 Forum Discussions ↔ AI Moderation

**Use Case:** Automatically moderate forum posts using AI

**Flow:**

```
1. User posts comment
   POST /api/forum/posts
   {threadId, body: "This is spam..."}

2. Before saving, check for spam/toxicity
   → Multi-LLM Router with taskType: "moderation"

3. Route to cheap model (DeepSeek or Ollama)
   Prompt: "Is this spam or toxic? Yes/No: <comment>"

4. If model says "Yes":
   → Flag comment for review
   → Don't publish immediately

   If model says "No":
   → Publish immediately
   → Update forum_posts table

5. Cost: ~$0.001 per moderation (very cheap)
```

### 4.3 Ollama Models Can Trigger External APIs

**Scenario:** User asks soulfra model to "fetch latest design trends"

**Current Limitation:** Ollama models can't make HTTP requests directly.

**Solution:** Tool-use pattern (function calling)

```javascript
// In lib/multi-llm-router.js
const response = await router.complete({
  prompt: "Fetch latest design trends",
  model: "soulfra",
  tools: [
    {
      name: "fetch_web",
      description: "Fetch content from a URL",
      parameters: {
        url: "string"
      }
    }
  ]
});

// If model returns tool call:
if (response.toolCalls) {
  for (const call of response.toolCalls) {
    if (call.name === "fetch_web") {
      // Execute scraping
      const content = await scraper.fetch(call.parameters.url);

      // Send back to model
      const finalResponse = await router.complete({
        prompt: "Here's the content I fetched: " + content,
        model: "soulfra"
      });
    }
  }
}
```

---

## Phase 5: Integration Points

### 5.1 Authentication ↔ Credits

**Integration:** Session includes credit balance

```javascript
// In middleware/auth.js
req.user = {
  userId: session.user_id,
  email: session.email,
  balanceCents: await getBalance(session.user_id),
  subscriptionTier: await getTier(session.user_id)
};

// Routes can check balance before expensive operations
if (req.user.balanceCents < 50) {
  return res.status(402).json({
    error: 'Insufficient credits for GPT-4'
  });
}
```

### 5.2 Credits ↔ Model Router

**Integration:** Router respects credit limits

```javascript
// In lib/multi-llm-router.js
async selectProvider(request, userBalance) {
  // If balance low, force cheap providers
  if (userBalance < 100) { // < $1
    return 'ollama'; // Free
  }

  if (userBalance < 500) { // < $5
    // Avoid GPT-4, use DeepSeek or Ollama
    return this.selectFrom(['deepseek', 'ollama']);
  }

  // Normal routing logic
  return this.smartRoute(request);
}
```

### 5.3 Model Router ↔ Content Curator

**Integration:** Content can be processed by AI

```javascript
// In lib/content-curator.js
async generateNewsletter(userId, options) {
  const feed = await this.getCuratedFeed(userId, { limit: 10 });

  // Use AI to write newsletter intro
  const router = new MultiLLMRouter({ strategy: 'cheapest' });

  const intro = await router.complete({
    prompt: `Write a newsletter intro for these articles: ${JSON.stringify(feed.items)}`,
    taskType: 'creative',
    maxTokens: 200
  });

  return {
    intro: intro.text,
    articles: feed.items,
    aiCost: intro.cost_cents
  };
}
```

### 5.4 Voice Wake Word ↔ All Systems

**Integration:** Voice commands can trigger any action

```javascript
// In lib/voice-content-bridge.js
const commandPatterns = [
  // Content curation
  {
    pattern: /show me (.*?) news/i,
    handler: this.handleTopicNews // → Content Curator
  },

  // AI chat
  {
    pattern: /ask (.*?) about (.*)/i,
    handler: this.handleAIChat // → Multi-LLM Router
  },

  // Forum
  {
    pattern: /what's trending in forums/i,
    handler: this.handleForumTrending // → Content Forum
  },

  // Credits
  {
    pattern: /how many credits do i have/i,
    handler: this.handleCreditsCheck // → Credits System
  }
];
```

### 5.5 WebSocket ↔ Real-time Updates

**Integration:** All systems can broadcast updates

```javascript
// In router.js
const broadcast = (message) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// Any system can broadcast:

// Content Curator
broadcast({
  type: 'new_article',
  article: {...}
});

// Model Router
broadcast({
  type: 'ai_response',
  text: response.text,
  provider: 'openai'
});

// Credits System
broadcast({
  type: 'balance_update',
  balanceCents: newBalance
});

// Forum
broadcast({
  type: 'new_comment',
  threadId, comment: {...}
});
```

---

## Phase 6: Testing & Verification

### 6.1 System Health Checks

**Run full system check:**

```bash
# Test script
./scripts/test-content-system.sh

# Or manual checks:

# 1. Health endpoint
curl http://localhost:5001/health

# 2. Database connectivity
curl http://localhost:5001/api/health/database

# 3. Ollama models
curl http://localhost:11434/api/tags

# 4. Authentication
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# 5. Credits balance
curl -H "Cookie: session=<token>" \
  http://localhost:5001/api/credits/balance

# 6. Content curation
curl http://localhost:5001/api/curation/feed?limit=5

# 7. Forum
curl http://localhost:5001/api/forum/hot?limit=5

# 8. AI completion
curl -X POST http://localhost:5001/api/chat/complete \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","maxTokens":20}'
```

### 6.2 Integration Tests

**Test complete user flow:**

```bash
# Integration test suite
npm test -- --grep "integration"

# Or manual flow:

# 1. Register user
USER_ID=$(curl -X POST http://localhost:5001/api/auth/register \
  -d '{"email":"test@example.com","password":"test123"}' | jq -r '.userId')

# 2. Configure content
curl -X POST http://localhost:5001/api/curation/configure \
  -H "X-User-Id: $USER_ID" \
  -d '{"topics":["ai"],"sources":["hackernews"]}'

# 3. Get curated feed
curl "http://localhost:5001/api/curation/feed?limit=5" \
  -H "X-User-Id: $USER_ID"

# 4. Ask AI to summarize
curl -X POST http://localhost:5001/api/chat/complete \
  -H "X-User-Id: $USER_ID" \
  -d '{"prompt":"Summarize the top AI news","taskType":"summarization"}'

# 5. Check credits deducted
curl http://localhost:5001/api/credits/balance \
  -H "X-User-Id: $USER_ID"

# 6. Create forum thread
THREAD_ID=$(curl -X POST http://localhost:5001/api/forum/threads \
  -H "X-User-Id: $USER_ID" \
  -d '{"title":"Test Thread","body":"Test"}' | jq -r '.thread.id')

# 7. Vote on thread
curl -X POST "http://localhost:5001/api/forum/vote/thread/$THREAD_ID" \
  -H "X-User-Id: $USER_ID" \
  -d '{"voteType":"up"}'

# All steps should succeed
```

### 6.3 Performance Benchmarks

**Target Metrics:**

| Metric | Target | Actual |
|--------|--------|--------|
| Server startup | < 5 seconds | ⏱️ |
| Health check latency | < 50ms | ⏱️ |
| Database query (simple) | < 10ms | ⏱️ |
| Ollama response (local) | < 1 second | ⏱️ |
| OpenAI response | < 3 seconds | ⏱️ |
| WebSocket message | < 100ms | ⏱️ |
| Content feed load | < 500ms | ⏱️ |
| Forum thread load | < 200ms | ⏱️ |

**Run benchmarks:**

```bash
# Apache Bench
ab -n 1000 -c 10 http://localhost:5001/health

# Ollama throughput
time curl -X POST http://localhost:11434/api/generate \
  -d '{"model":"soulfra","prompt":"Hello","stream":false}'

# Database load test
pgbench -c 10 -j 2 -t 1000 $DATABASE_URL
```

---

## Emergency Procedures

### E.1 Server Down

**Symptoms:** HTTP 502/503, no response

**Diagnosis:**

```bash
# Check if process running
ps aux | grep node

# Check port usage
lsof -i :5001

# Check logs
tail -f logs/calos.log
```

**Recovery:**

```bash
# Kill existing processes
killall node

# Restart
npm run start:quiet &

# Verify
curl http://localhost:5001/health
```

### E.2 Database Connection Lost

**Symptoms:** `{"error": "Database connection failed"}`

**Diagnosis:**

```bash
# Check PostgreSQL status
sudo service postgresql status

# Try manual connection
psql $DATABASE_URL -c "SELECT 1;"
```

**Recovery:**

```bash
# Restart PostgreSQL
sudo service postgresql restart

# Wait for readiness
until psql $DATABASE_URL -c "SELECT 1;" > /dev/null 2>&1; do
  echo "Waiting for PostgreSQL..."
  sleep 1
done

# Restart CalOS
npm run start:quiet &
```

### E.3 Ollama Not Responding

**Symptoms:** Ollama calls timeout

**Diagnosis:**

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Check process
ps aux | grep ollama
```

**Recovery:**

```bash
# Restart Ollama
killall ollama
ollama serve &

# Reload models
ollama pull llama3.2:3b

# Test
curl -X POST http://localhost:11434/api/generate \
  -d '{"model":"llama3.2:3b","prompt":"test"}'
```

### E.4 Credits System Malfunction

**Symptoms:** Balance incorrect, deductions not working

**Diagnosis:**

```bash
# Check user_credits table
psql $DATABASE_URL -c "SELECT * FROM user_credits WHERE user_id = 'uuid';"

# Check recent transactions
psql $DATABASE_URL -c "SELECT * FROM usage_log WHERE user_id = 'uuid' ORDER BY created_at DESC LIMIT 10;"
```

**Recovery:**

```bash
# Recalculate balance
psql $DATABASE_URL << EOF
UPDATE user_credits
SET balance_cents = (
  SELECT COALESCE(SUM(amount_cents), 0)
  FROM credit_transactions
  WHERE user_id = 'uuid' AND type = 'purchase'
) - (
  SELECT COALESCE(SUM(cost_cents), 0)
  FROM usage_log
  WHERE user_id = 'uuid'
)
WHERE user_id = 'uuid';
EOF

# Verify
psql $DATABASE_URL -c "SELECT * FROM user_credits WHERE user_id = 'uuid';"
```

---

## Operational Checklist

### Daily Checklist

- [ ] Check system health endpoints
- [ ] Review error logs (`logs/error.log`)
- [ ] Monitor credit balance for test users
- [ ] Verify Ollama models loaded
- [ ] Check WebSocket connection count
- [ ] Review usage metrics

### Weekly Checklist

- [ ] Database backup
- [ ] Update Ollama models if new versions available
- [ ] Review API costs (OpenAI/Anthropic)
- [ ] Analyze content curation effectiveness
- [ ] Check forum moderation queue
- [ ] Test authentication flows (biometric, device pairing)

### Monthly Checklist

- [ ] Security audit (review sessions, device trust)
- [ ] Performance optimization (slow queries)
- [ ] Update dependencies (`npm update`)
- [ ] Review and archive old forum threads
- [ ] Analyze user engagement metrics
- [ ] Plan feature releases

---

## Appendix A: Port Assignments

| Service | Port | Protocol | Status |
|---------|------|----------|--------|
| CalOS HTTP | 5001 | HTTP | Required |
| CalOS WebSocket | 5001 | WS | Required |
| PostgreSQL | 5432 | TCP | Required |
| Ollama (primary) | 11434 | HTTP | Required |
| Ollama (soulfra) | 11435 | HTTP | Optional |
| Ollama (deathtodata) | 11436 | HTTP | Optional |
| Ollama (saveorsink) | 11437 | HTTP | Optional |
| Ollama (roughsparks) | 11438 | HTTP | Optional |
| Redis | 6379 | TCP | Optional |

## Appendix B: Environment Variables

See `.env.example` for complete list.

## Appendix C: Database Schema

87 tables total. See `migrations/` for complete schema.

Key tables:
- `users` - User accounts
- `user_credits` - Credit balances
- `sessions` - Active sessions
- `device_pairings` - Trusted devices
- `curation_configs` - Content preferences
- `curated_content` - Content cache
- `forum_threads` - Discussion threads
- `forum_posts` - Comments (nested)
- `forum_votes` - Upvotes/downvotes
- `usage_log` - AI usage tracking

---

**End of Manual**

For questions, see: `docs/CONTENT_FLOW.md`, `CALOS-ARCHITECTURE.md`, `MULTI-LLM-ROUTER.md`

**Status**: ✅ SYSTEM OPERATIONAL
