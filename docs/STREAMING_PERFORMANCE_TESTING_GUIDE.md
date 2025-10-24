# Streaming Performance Testing Guide

> How to test streaming chat, measure delays, and identify bottlenecks

## Overview

This guide helps you test the real-time streaming chat system and identify where delays come from:
- **Network delays**: Latency between user and server
- **Code delays**: Your application logic
- **Database delays**: Query execution time
- **LLM delays**: AI provider response time (Ollama, OpenAI, etc.)

**Use Case**: You want to test chat streaming with the roughsparks user and see if delays are from your code or infrastructure.

---

## Authentication Systems: Which One to Use?

You have **three** authentication systems. Here's when to use each:

### 1. Regular Auth (Email/Password) ✅ **Use This**

**What**: Traditional username/password authentication
**When**: For testing, debugging, normal users
**Example**: roughsparks user (lolztex@gmail.com)

```bash
# Login with regular auth
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lolztex@gmail.com",
    "password": "your-password"
  }'

# Returns JWT token
# {
#   "success": true,
#   "token": "eyJhbGciOiJIUzI1NiIs...",
#   "user": {
#     "userId": "e7dc083f-61de-4567-a5b6-b21ddb09cb2d",
#     "email": "lolztex@gmail.com",
#     "username": "roughsparks"
#   }
# }
```

**Files**:
- `routes/auth-routes.js` - Login/register endpoints
- `middleware/auth.js` - JWT verification

### 2. OAuth (Google/Apple) ⚠️ **Optional**

**What**: Social login (Sign in with Google, Apple, GitHub)
**When**: For end users who want quick signup
**Example**: Google account login

```javascript
// Redirect to Google login
window.location.href = '/api/auth/oauth/google';

// User logs in with Google
// → Returns JWT token (same as regular auth)
```

**Files**:
- `lib/auth/providers/google.js` - Google OAuth
- `routes/oauth-routes.js` - OAuth endpoints

### 3. Soulfra (Zero-Knowledge) 🔒 **Advanced/Optional**

**What**: Cryptographic identity without email/password (proof-of-personhood)
**When**: For privacy-focused users, decentralized systems
**Example**: Ed25519 keypair identity

```javascript
// Create Soulfra identity
const identity = SoulfraIdentity.createIdentity();

// Prove ownership (challenge-response)
const challenge = SoulfraIdentity.createChallenge();
const proof = identity.createProof(challenge);
```

**Files**:
- `lib/soulfra-identity.js` - Zero-knowledge identity
- `lib/soulfra-signer.js` - Cryptographic signing

### Summary: Use Regular Auth

For testing streaming and performance:
1. **Use regular auth** (email/password)
2. **Login as roughsparks** (lolztex@gmail.com)
3. **Get JWT token**
4. **Test streaming chat** with that token

---

## Test Users: Real vs Ephemeral

### roughsparks (Real User)

**Purpose**: Debugging and testing
**Created**: Manually registered (2025-10-13)
**User ID**: `e7dc083f-61de-4567-a5b6-b21ddb09cb2d`
**Email**: lolztex@gmail.com
**Status**: Persistent (won't be deleted)

```bash
# Check roughsparks in database
psql -U matthewmauer calos -c "SELECT user_id, username, email, created_at FROM users WHERE username = 'roughsparks';"
```

### Test Users (Ephemeral)

**Purpose**: Automated testing
**Created**: By test scripts (e.g., `scripts/test-device-pairing.sh`)
**Pattern**: `test-user-1234567890`
**Status**: Temporary (created and deleted by tests)

```bash
# Test scripts create users like this:
TEST_USER_ID="test-user-$(date +%s)"

# Register user
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$TEST_USER_ID\",
    \"password\": \"test-password-123\"
  }"

# ... run tests ...

# Clean up (delete user)
# Tests usually leave these in database - you can clean manually
```

### Summary

- **roughsparks**: Real user for manual testing
- **test-user-XXX**: Ephemeral users for automated tests

---

## Streaming Chat Performance Testing

### 1. Start Server with Performance Logging

```bash
# Start server with debug logging
LOG_LEVEL=debug node router.js --local

# Or with performance profiling
NODE_ENV=production node --prof router.js --local
```

### 2. Login as roughsparks

```bash
# Login
response=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lolztex@gmail.com",
    "password": "your-password"
  }')

# Extract JWT token
TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "JWT Token: $TOKEN"
```

### 3. Test Streaming Chat with Timing

```bash
# Test chat endpoint with timing
time curl -X POST http://localhost:5001/api/llm/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "stream": true
  }'

# Output shows:
# real    0m2.456s  ← Total time
# user    0m0.012s
# sys     0m0.008s
```

**Timing Breakdown**:
```
Total Time (2.456s):
  ├─ Network latency:     ~50ms   (user → server)
  ├─ Auth verification:   ~10ms   (JWT decode)
  ├─ Database queries:    ~20ms   (user lookup)
  ├─ LLM provider:        ~2300ms (Ollama/OpenAI)
  └─ Response streaming:  ~76ms   (server → user)
```

### 4. Test with Performance Monitoring

Create a test script that measures each layer:

```javascript
// scripts/test-streaming-performance.js

const axios = require('axios');
const { performance } = require('perf_hooks');

async function testStreamingPerformance() {
  const API_URL = 'http://localhost:5001';

  // 1. Login
  const loginStart = performance.now();
  const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
    email: 'lolztex@gmail.com',
    password: 'your-password'
  });
  const loginEnd = performance.now();

  const token = loginResponse.data.token;

  console.log(`✓ Login: ${(loginEnd - loginStart).toFixed(2)}ms`);

  // 2. Send chat message with timing
  const timings = {
    network: 0,
    auth: 0,
    database: 0,
    llm: 0,
    total: 0
  };

  const chatStart = performance.now();

  const chatResponse = await axios.post(
    `${API_URL}/api/llm/complete`,
    {
      model: 'llama3.2',
      messages: [
        { role: 'user', content: 'Write a haiku about code' }
      ],
      stream: false, // Non-streaming for easier timing
      includeTimings: true // Custom flag to return timing breakdown
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Timing-Detail': 'true' // Request timing headers
      }
    }
  );

  const chatEnd = performance.now();
  timings.total = chatEnd - chatStart;

  // Extract timing from response headers (if server implements)
  const serverTimings = chatResponse.headers['server-timing'];
  if (serverTimings) {
    console.log(`\n📊 Server Timings: ${serverTimings}`);
  }

  // Display results
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║  Streaming Chat Performance Test              ║`);
  console.log(`╚═══════════════════════════════════════════════╝`);
  console.log(``);
  console.log(`Total Time:     ${timings.total.toFixed(2)}ms`);

  if (chatResponse.data.timings) {
    const t = chatResponse.data.timings;
    console.log(`├─ Auth:        ${t.auth}ms`);
    console.log(`├─ Database:    ${t.database}ms`);
    console.log(`├─ LLM:         ${t.llm}ms`);
    console.log(`└─ Network:     ${(timings.total - t.auth - t.database - t.llm).toFixed(2)}ms`);
  }

  console.log(``);
  console.log(`Response: ${chatResponse.data.text.substring(0, 100)}...`);
}

testStreamingPerformance().catch(console.error);
```

Run it:
```bash
node scripts/test-streaming-performance.js
```

Expected output:
```
✓ Login: 45.23ms

╔═══════════════════════════════════════════════╗
║  Streaming Chat Performance Test              ║
╚═══════════════════════════════════════════════╝

Total Time:     2456.78ms
├─ Auth:        12.45ms
├─ Database:    23.67ms
├─ LLM:         2345.89ms
└─ Network:     74.77ms

Response: Code flows like water,
Functions dance through the screen,
Bug-free serenity...
```

---

## Performance Monitoring Dashboard

### Mission Control (Already Built!)

Start the monitoring dashboard:

```bash
# Terminal 1: Start server
npm run start

# Terminal 2: Start Mission Control
node monitoring/mission-control.js
```

Open dashboard:
```
http://localhost:3003/dashboard.html
```

**What you see**:
- Real-time health status (server, database, MinIO)
- WebSocket feed of logs
- Process management (auto-restart on failure)
- Request latency graphs
- Error rate tracking

**Files**:
- `monitoring/mission-control.js` - Main dashboard
- `monitoring/health-monitor.js` - Health checks
- `monitoring/process-manager.js` - Process monitoring

---

## Diagnosing Delays: Code vs Infrastructure

### Step 1: Measure Network Latency

Use the network diagnostics library:

```bash
# Test network latency
node -e "
const NetworkDiagnostics = require('./lib/network-diagnostics');
const diag = new NetworkDiagnostics();

(async () => {
  const result = await diag.ping('http://localhost:5001/api/health', 5);
  console.log('Network Latency:', result.latency);
  console.log('Packet Loss:', result.packetLoss + '%');
})();
"
```

**Expected**: < 50ms avg latency

**If high** (> 100ms):
- Network issue (slow connection, VPN, etc.)
- Not a code problem

### Step 2: Measure Database Performance

```bash
# Test database query speed
psql -U matthewmauer calos -c "\timing on" -c "SELECT * FROM users WHERE username = 'roughsparks';"
```

**Expected**: < 20ms

**If slow** (> 100ms):
- Database needs indexing
- Too many connections
- Missing indexes on `users` table

Fix:
```sql
-- Add index if missing
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

### Step 3: Measure LLM Provider Speed

Test directly (bypassing your code):

```bash
# Test Ollama directly
time curl http://localhost:11434/api/generate \
  -d '{
    "model": "llama3.2",
    "prompt": "Hello",
    "stream": false
  }'

# Test OpenAI directly (if using)
time curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Expected**:
- Ollama (local): 500ms - 2s (depends on model size)
- OpenAI: 200ms - 1s
- DeepSeek: 300ms - 1.5s

**If slow**:
- LLM provider issue (not your code)
- Model too large (use smaller model)
- GPU not available (Ollama CPU mode is slow)

### Step 4: Measure Code Execution Time

Add timing to your code:

```javascript
// routes/llm-routes.js

router.post('/api/llm/complete', requireAuth, async (req, res) => {
  const timings = {};
  const startTime = Date.now();

  // Time auth
  const authStart = Date.now();
  // ... auth verification ...
  timings.auth = Date.now() - authStart;

  // Time database
  const dbStart = Date.now();
  const user = await db.query('SELECT * FROM users WHERE user_id = ?', [req.user.userId]);
  timings.database = Date.now() - dbStart;

  // Time LLM
  const llmStart = Date.now();
  const response = await multiLLMRouter.complete(req.body);
  timings.llm = Date.now() - llmStart;

  timings.total = Date.now() - startTime;

  // Log timing
  console.log('[Performance]', timings);

  // Return with timing info
  res.json({
    ...response,
    timings // Include in response for debugging
  });
});
```

### Step 5: Compare Results

```
Timing Breakdown:
├─ Network:   50ms   (2%)   ← Network Diagnostics test
├─ Auth:      10ms   (0.4%) ← JWT verification
├─ Database:  20ms   (0.8%) ← User lookup
└─ LLM:       2400ms (96.8%) ← Ollama generation

Conclusion: 96.8% of time is LLM generation (NOT your code!)
```

**Decision Tree**:

```
Is total time > 3s?
├─ YES → Check LLM timing
│   ├─ LLM > 2s → LLM is slow (not your code)
│   │   └─ Solution: Use faster model (gpt-3.5-turbo vs gpt-4)
│   └─ LLM < 500ms → Check other components
│       ├─ Network > 100ms → Network issue
│       ├─ Database > 50ms → Database needs optimization
│       └─ Code > 200ms → Your code has a problem
└─ NO → Performance is good ✓
```

---

## Load Testing: Simulating Multiple Users

### Using Apache Bench

```bash
# Install Apache Bench
brew install httpd  # macOS
# or
sudo apt-get install apache2-utils  # Linux

# Create test script with login
cat > /tmp/chat-request.json <<EOF
{
  "model": "llama3.2",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}
EOF

# Get JWT token first
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lolztex@gmail.com","password":"your-password"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Load test: 100 requests, 10 concurrent users
ab -n 100 -c 10 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -p /tmp/chat-request.json \
  http://localhost:5001/api/llm/complete
```

**Expected Output**:
```
Concurrency Level:      10
Time taken for tests:   24.567 seconds
Complete requests:      100
Failed requests:        0
Total transferred:      245678 bytes
Requests per second:    4.07 [#/sec] (mean)
Time per request:       2456.7 [ms] (mean)
Time per request:       245.7 [ms] (mean, across all concurrent requests)

Percentage of the requests served within a certain time (ms)
  50%   2340
  66%   2450
  75%   2560
  80%   2670
  90%   2890
  95%   3120
  98%   3450
  99%   3780
 100%   4230 (longest request)
```

### Using Custom Load Test Script

```javascript
// scripts/load-test-streaming.js

const axios = require('axios');
const { performance } = require('perf_hooks');

async function loadTest() {
  const API_URL = 'http://localhost:5001';
  const USERS = 10;  // Concurrent users
  const REQUESTS_PER_USER = 10;

  // Login once
  const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
    email: 'lolztex@gmail.com',
    password: 'your-password'
  });

  const token = loginResponse.data.token;

  console.log(`\n🚀 Load Test: ${USERS} users, ${REQUESTS_PER_USER} requests each\n`);

  const results = {
    total: 0,
    successes: 0,
    failures: 0,
    timings: []
  };

  // Create user promises
  const userPromises = [];

  for (let user = 0; user < USERS; user++) {
    const userPromise = (async () => {
      for (let req = 0; req < REQUESTS_PER_USER; req++) {
        results.total++;

        try {
          const start = performance.now();

          const response = await axios.post(
            `${API_URL}/api/llm/complete`,
            {
              model: 'llama3.2',
              messages: [{ role: 'user', content: `Test message ${req}` }],
              stream: false
            },
            {
              headers: { 'Authorization': `Bearer ${token}` }
            }
          );

          const duration = performance.now() - start;

          results.successes++;
          results.timings.push(duration);

          console.log(`✓ User ${user + 1}, Request ${req + 1}: ${duration.toFixed(0)}ms`);

        } catch (error) {
          results.failures++;
          console.log(`✗ User ${user + 1}, Request ${req + 1}: FAILED (${error.message})`);
        }
      }
    })();

    userPromises.push(userPromise);
  }

  // Wait for all users to complete
  await Promise.all(userPromises);

  // Calculate stats
  const sortedTimings = results.timings.sort((a, b) => a - b);
  const avg = sortedTimings.reduce((a, b) => a + b, 0) / sortedTimings.length;
  const p50 = sortedTimings[Math.floor(sortedTimings.length * 0.5)];
  const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)];
  const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)];

  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║  Load Test Results                            ║`);
  console.log(`╚═══════════════════════════════════════════════╝`);
  console.log(``);
  console.log(`Total Requests:  ${results.total}`);
  console.log(`Successes:       ${results.successes} (${(results.successes/results.total*100).toFixed(1)}%)`);
  console.log(`Failures:        ${results.failures} (${(results.failures/results.total*100).toFixed(1)}%)`);
  console.log(``);
  console.log(`Average Time:    ${avg.toFixed(0)}ms`);
  console.log(`Median (p50):    ${p50.toFixed(0)}ms`);
  console.log(`p95:             ${p95.toFixed(0)}ms`);
  console.log(`p99:             ${p99.toFixed(0)}ms`);
  console.log(`Min:             ${sortedTimings[0].toFixed(0)}ms`);
  console.log(`Max:             ${sortedTimings[sortedTimings.length - 1].toFixed(0)}ms`);
  console.log(``);
}

loadTest().catch(console.error);
```

Run it:
```bash
node scripts/load-test-streaming.js
```

---

## Performance Optimization Tips

### 1. Use Faster Models

```javascript
// Slow (4-6s response time)
{ model: 'llama3.1:70b' }

// Medium (2-3s response time)
{ model: 'llama3.2' }

// Fast (500ms-1s response time)
{ model: 'llama3.2:1b' }
{ model: 'gpt-3.5-turbo' }
```

### 2. Enable Response Caching

```javascript
// routes/llm-routes.js

const cache = new Map();

router.post('/api/llm/complete', requireAuth, async (req, res) => {
  const cacheKey = JSON.stringify(req.body);

  // Check cache
  if (cache.has(cacheKey)) {
    console.log('✓ Cache hit');
    return res.json(cache.get(cacheKey));
  }

  // Call LLM
  const response = await multiLLMRouter.complete(req.body);

  // Store in cache (5 min TTL)
  cache.set(cacheKey, response);
  setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);

  res.json(response);
});
```

### 3. Use Connection Pooling

```javascript
// lib/database.js

const pool = new Pool({
  max: 20,                // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

### 4. Enable Streaming (Real-Time Response)

```javascript
// Instead of waiting for full response:
{ stream: false }  // Wait for complete response (2-3s)

// Stream chunks as they arrive:
{ stream: true }   // Start showing response immediately (feels faster)
```

### 5. Implement Request Queuing

```javascript
// lib/request-queue.js

class RequestQueue {
  constructor(maxConcurrent = 5) {
    this.queue = [];
    this.active = 0;
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue(fn) {
    // Wait if too many active requests
    while (this.active >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.active++;

    try {
      return await fn();
    } finally {
      this.active--;
    }
  }
}

const queue = new RequestQueue(5);

// Use in routes
const response = await queue.enqueue(() =>
  multiLLMRouter.complete(req.body)
);
```

---

## Troubleshooting

### Issue: High latency (> 5s)

**Diagnosis**:
```bash
# 1. Check network
node lib/network-diagnostics.js

# 2. Check database
psql -U matthewmauer calos -c "\timing on" -c "SELECT 1;"

# 3. Check LLM
curl http://localhost:11434/api/generate -d '{"model":"llama3.2","prompt":"Hi"}'
```

**Fix**:
- Network: Use local server (not remote)
- Database: Add indexes, reduce connections
- LLM: Use faster model or switch provider

### Issue: Streaming broken/slow

**Diagnosis**:
```javascript
// Check stream monitor logs
const StreamMonitor = require('./lib/stream-monitor');
const monitor = new StreamMonitor();

monitor.on('error', (err) => {
  console.log('Stream error:', err);
});

monitor.on('retry', (attempt) => {
  console.log('Retrying:', attempt);
});
```

**Fix**:
- Check `lib/stream-monitor.js` retry logic
- Increase timeout: `new StreamMonitor({ timeout: 120000 })`
- Enable chunking for large prompts

### Issue: Bot detection blocking requests

**Error**: "Authentication required. This endpoint uses bot detection."

**Fix**: Use JWT token in Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:5001/api/llm/complete
```

**Files to check**:
- `routes/llm-routes.js:82-105` - Bot detection middleware
- `lib/bot-detector.js` - Bot detection logic

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│  Streaming Performance Testing Workflow                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Choose Auth System:                                 │
│     ✓ Regular auth (email/password) ← Use this         │
│     ○ OAuth (Google/Apple)                              │
│     ○ Soulfra (zero-knowledge)                          │
│                                                         │
│  2. Login as roughsparks:                               │
│     curl -X POST .../api/auth/login                     │
│                                                         │
│  3. Test streaming:                                     │
│     curl -X POST .../api/llm/complete                   │
│                                                         │
│  4. Measure performance:                                │
│     ├─ Network: lib/network-diagnostics.js              │
│     ├─ Database: psql \timing on                        │
│     ├─ LLM: curl ollama/openai directly                 │
│     └─ Code: Add timing logs                            │
│                                                         │
│  5. Load test:                                          │
│     ab -n 100 -c 10 http://localhost:5001/...           │
│                                                         │
│  6. Monitor:                                            │
│     node monitoring/mission-control.js                  │
│     http://localhost:3003/dashboard.html                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Quick Start**:
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lolztex@gmail.com","password":"your-password"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. Test chat
time curl -X POST http://localhost:5001/api/llm/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hi"}],"stream":false}'

# 3. Start monitoring
node monitoring/mission-control.js
# Open: http://localhost:3003/dashboard.html
```

---

## Related Documentation

- [NETWORK_TESTING_GUIDE.md](./NETWORK_TESTING_GUIDE.md) - Network diagnostics
- [ROUGHSPARKS-SETUP.md](../ROUGHSPARKS-SETUP.md) - roughsparks user setup
- [MULTI_DEVICE_FEDERATION_GUIDE.md](./MULTI_DEVICE_FEDERATION_GUIDE.md) - Device pairing
- [PUBLIC_BROWSING_SOCIAL_LOGIN_GUIDE.md](./PUBLIC_BROWSING_SOCIAL_LOGIN_GUIDE.md) - OAuth setup
- `lib/multi-llm-router.js` - LLM routing implementation
- `lib/stream-monitor.js` - Stream monitoring
- `monitoring/mission-control.js` - Performance dashboard
