# End-to-End Testing Guide

> Stop building test infrastructure. Start testing actual features with real devices.

## Overview

This guide helps you test **real features** with **real devices** instead of just building more testing infrastructure.

**What we test**:
- Provider performance with real percentiles (Claude, DeepSeek, OpenAI, Ollama)
- Multi-device connectivity (Mac localhost → IP → iPhone)
- Rate limiting actually works
- File operations and CWD tracking
- Real user workflows, not just unit tests

---

## Part 1: Provider Performance Benchmarking

### Why This Matters

Different providers have **very** different performance characteristics:
- **DeepSeek**: Cheapest ($0.00014/1K tokens), but slowest (2-4s)
- **Anthropic (Claude)**: Mid-price ($0.003/1K tokens), fast (0.5-1.5s)
- **OpenAI (GPT-3.5)**: Fast ($0.0015/1K tokens), reliable (0.3-0.8s)
- **Ollama (local)**: Free, varies wildly (0.5s-5s depending on model/hardware)

Your percentiles should reflect these **real differences**.

### Benchmark All Providers

```bash
# Test all providers with real API calls
PASSWORD=your-password node scripts/benchmark-all-providers.js
```

This will test:
- Ollama (local models)
- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude 3.5 Sonnet, Haiku)
- DeepSeek (deepseek-chat, deepseek-reasoner)

**Expected Output**:
```
╔═══════════════════════════════════════════════╗
║  Provider Performance Benchmarks              ║
╚═══════════════════════════════════════════════╝

Provider: Ollama (llama3.2)
├─ p50:  1234ms
├─ p95:  2156ms
├─ p99:  2987ms
└─ Cost: $0 (free)

Provider: OpenAI (gpt-3.5-turbo)
├─ p50:  456ms
├─ p95:  678ms
├─ p99:  892ms
└─ Cost: $0.0015/1K tokens

Provider: Anthropic (claude-3-5-sonnet)
├─ p50:  789ms
├─ p95:  1123ms
├─ p99:  1456ms
└─ Cost: $0.003/1K tokens

Provider: DeepSeek (deepseek-chat)
├─ p50:  2345ms
├─ p95:  3456ms
├─ p99:  4567ms
└─ Cost: $0.00014/1K tokens

Recommendation: OpenAI gpt-3.5-turbo (best speed/cost)
```

### Decision Matrix

```
Which provider should you use?

Cost-sensitive (budget constrained):
  → DeepSeek (cheapest, but slow)

Speed-sensitive (user-facing apps):
  → OpenAI gpt-3.5-turbo (fast, affordable)

Quality-sensitive (complex tasks):
  → Anthropic Claude 3.5 Sonnet (best reasoning)

Privacy-sensitive (self-hosted):
  → Ollama (free, private, GPU-dependent)
```

### Testing Provider Failover

Test what happens when primary provider fails:

```bash
# Disable OpenAI and test fallback
OPENAI_API_KEY="" PASSWORD=your-password node scripts/test-provider-failover.js
```

**Expected behavior**:
1. Try OpenAI (fails - no API key)
2. Fallback to Anthropic (works)
3. Log warning about failover
4. Complete request successfully

---

## Part 2: Multi-Device Testing (Mac → iPhone)

### The Problem

You're testing on localhost, but real users access from:
- iPhone (mobile browser or app)
- iPad
- Other computers on same network

**Challenge**: localhost:5001 only works on your Mac.

### Solution: Expose via IP Address

#### Option 1: Local Network (Fast, Free)

```bash
# 1. Get your Mac's IP address
ipconfig getifaddr en0
# Output: 192.168.1.42

# 2. Start server bound to all interfaces
HOST=0.0.0.0 PORT=5001 node router.js --local

# 3. Test from Mac
curl http://192.168.1.42:5001/api/health

# 4. Open on iPhone (same WiFi network)
# Safari: http://192.168.1.42:5001/calos-os.html
```

**Firewall setup** (if connection fails):
```bash
# macOS: Allow incoming connections on port 5001
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
```

#### Option 2: ngrok (Remote Access)

```bash
# Install ngrok
brew install ngrok

# Expose localhost:5001 to internet
ngrok http 5001

# Output:
# Forwarding: https://abc123.ngrok.io -> http://localhost:5001

# Now test from anywhere:
# iPhone: https://abc123.ngrok.io/calos-os.html
```

**Benefits**:
- Works from anywhere (not just same WiFi)
- HTTPS enabled (required for some features)
- Can share URL with others for testing

**Drawbacks**:
- Slower (goes through ngrok servers)
- URL changes each time (unless paid plan)
- Security concern (publicly accessible)

### iPhone Testing Checklist

Once you have iPhone connected to your server:

**1. Test Login**
```
☐ Open http://192.168.1.42:5001/calos-os.html on iPhone
☐ Click 🔐 login icon
☐ Login as roughsparks
☐ Verify profile shows correctly
```

**2. Test Chat (Streaming)**
```
☐ Click 💬 chat icon
☐ Send message: "Hello"
☐ Verify streaming works (text appears gradually)
☐ Check latency on iPhone (should be < 100ms slower than Mac)
```

**3. Test File Upload**
```
☐ Click 📁 files icon
☐ Upload photo from iPhone
☐ Verify file appears in list
☐ Check database: psql -U matthewmauer calos -c "SELECT * FROM user_files WHERE user_id = 'roughsparks-user-id';"
☐ Verify file stored in MinIO
```

**4. Test Device Pairing**
```
☐ On Mac: Generate QR code for pairing
☐ On iPhone: Scan QR code
☐ Verify both devices see same user_id
☐ Verify shared credits balance
☐ Test: Spend credits on iPhone, check Mac sees update
```

**5. Test File Explorer / Pilot**
```
☐ Open file explorer on iPhone
☐ Navigate to project directory
☐ Verify files load correctly
☐ Test file operations (rename, delete, move)
☐ Check CWD doesn't reset unexpectedly
```

### Troubleshooting iPhone Connection

**Issue**: iPhone can't reach Mac server

**Diagnosis**:
```bash
# On Mac: Check server is listening on all interfaces
lsof -i :5001
# Should show: *:5001 (not localhost:5001)

# On iPhone: Open Safari Developer Console
# Settings → Safari → Advanced → Web Inspector
# Connect iPhone to Mac via USB
# Safari on Mac → Develop → [Your iPhone]
```

**Fix**:
```bash
# Restart server with HOST=0.0.0.0
HOST=0.0.0.0 node router.js --local
```

**Issue**: Slow performance on iPhone

**Diagnosis**:
```bash
# Test latency from iPhone to Mac
# On iPhone Safari console:
fetch('http://192.168.1.42:5001/api/health')
  .then(r => r.json())
  .then(console.log)
```

**Expected**: < 50ms on same WiFi

**Fix**: Switch to 5GHz WiFi band (faster than 2.4GHz)

---

## Part 3: Rate Limiting Verification

### Why Test This

You have rate limiting code (`lib/rate-limiter.js`, `middleware/tier-gate.js`), but does it actually work?

### Test Rate Limits

#### Test 1: Hit Hourly Limit

```bash
# Register new test user (starts on FREE tier)
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-rate-limit@example.com",
    "password": "test123",
    "username": "test-ratelimit"
  }'

# Extract JWT token
TOKEN="..."

# Check tier
curl http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Expected: tier: "starter" (10 req/hour, 50 req/day)

# Make 11 requests (should hit limit on 11th)
for i in {1..11}; do
  echo "Request $i:"
  curl -X POST http://localhost:5001/api/llm/complete \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hi"}],"stream":false}'
  echo ""
  sleep 1
done
```

**Expected Output**:
```
Request 1: ✓ Success
Request 2: ✓ Success
...
Request 10: ✓ Success
Request 11: ✗ 429 Too Many Requests
{
  "error": "Rate limit exceeded",
  "tier": "starter",
  "limits": {
    "hourly": 10,
    "daily": 50
  },
  "remaining": {
    "hourly": 0,
    "daily": 40
  },
  "resetAt": {
    "hourly": "2025-01-20T15:00:00Z",
    "daily": "2025-01-21T00:00:00Z"
  }
}
```

**If this works**: Rate limiting is working! ✓

**If all requests succeed**: Rate limiting is NOT enforced. Need to debug.

#### Test 2: Verify Tier Upgrades

```bash
# Upgrade user to PRO tier (1000 req/hour)
psql -U matthewmauer calos -c "
UPDATE users
SET subscription_tier = 'pro',
    subscription_status = 'active'
WHERE email = 'test-rate-limit@example.com';
"

# Make 11 requests again (should all succeed now)
for i in {1..11}; do
  echo "Request $i:"
  curl -X POST http://localhost:5001/api/llm/complete \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hi"}],"stream":false}'
  echo ""
  sleep 1
done
```

**Expected**: All 11 requests succeed (PRO tier has 1000 req/hour limit)

#### Test 3: Verify OSS Mode (No Limits)

```bash
# Run server in OSS mode
CALOS_MODE=oss node router.js --local

# Make 100 requests (should all succeed - no limits in OSS mode)
for i in {1..100}; do
  curl -X POST http://localhost:5001/api/llm/complete \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hi"}],"stream":false}' \
    > /dev/null 2>&1 && echo "✓ Request $i" || echo "✗ Request $i"
done
```

**Expected**: All 100 succeed (OSS mode has unlimited requests)

### Rate Limit Test Script

```javascript
// scripts/test-rate-limiting.js

const axios = require('axios');

async function testRateLimiting() {
  const API_URL = 'http://localhost:5001';

  // 1. Register test user
  console.log('1. Registering test user...');
  const registerResponse = await axios.post(`${API_URL}/api/auth/register`, {
    email: `rate-test-${Date.now()}@example.com`,
    password: 'test123',
    username: `ratetest${Date.now()}`
  });

  const token = registerResponse.data.token;
  const user = registerResponse.data.user;

  console.log(`✓ Registered: ${user.email}`);
  console.log(`  Tier: ${user.tier || 'starter'}`);
  console.log('');

  // 2. Check tier limits
  const meResponse = await axios.get(`${API_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const limits = meResponse.data.rateLimits || { hourly: 10, daily: 50 };
  console.log(`Rate Limits:`);
  console.log(`  Hourly: ${limits.hourly} req/hour`);
  console.log(`  Daily: ${limits.daily} req/day`);
  console.log('');

  // 3. Test hitting limit
  console.log(`3. Testing rate limit (will make ${limits.hourly + 1} requests)...`);

  let successCount = 0;
  let rateLimitCount = 0;

  for (let i = 0; i < limits.hourly + 1; i++) {
    try {
      await axios.post(
        `${API_URL}/api/llm/complete`,
        {
          model: 'llama3.2',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false
        },
        {
          headers: { 'Authorization': `Bearer ${token}` },
          timeout: 30000
        }
      );

      successCount++;
      console.log(`  Request ${i + 1}: ✓ Success`);

    } catch (error) {
      if (error.response?.status === 429) {
        rateLimitCount++;
        console.log(`  Request ${i + 1}: ✗ Rate limited (429)`);
        console.log(`    Response:`, error.response.data);
      } else {
        console.log(`  Request ${i + 1}: ✗ Error (${error.message})`);
      }
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Rate Limiting Test Results                   ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log(`Successful Requests: ${successCount}`);
  console.log(`Rate Limited:        ${rateLimitCount}`);
  console.log('');

  if (rateLimitCount > 0) {
    console.log('✓ PASS: Rate limiting is working!');
    console.log(`  Limit enforced at ${successCount} requests`);
  } else {
    console.log('✗ FAIL: Rate limiting NOT enforced!');
    console.log(`  All ${successCount} requests succeeded (expected some to be rate limited)`);
  }

  console.log('');
}

testRateLimiting().catch(console.error);
```

Run it:
```bash
node scripts/test-rate-limiting.js
```

---

## Part 4: CWD Tracking & File Operations

### The Problem

File operations can fail when:
- Working directory (CWD) changes unexpectedly
- Relative paths break after CWD reset
- Pilot/autopilot loses context mid-operation

### Monitor CWD Changes

Add CWD tracking to file operations:

```javascript
// lib/cwd-tracker.js

class CWDTracker {
  constructor() {
    this.initialCWD = process.cwd();
    this.cwdHistory = [{ cwd: this.initialCWD, timestamp: Date.now() }];
    this.resetCount = 0;

    // Monitor CWD every 100ms
    this.monitor = setInterval(() => this.check(), 100);
  }

  check() {
    const currentCWD = process.cwd();

    if (currentCWD !== this.cwdHistory[this.cwdHistory.length - 1].cwd) {
      this.cwdHistory.push({ cwd: currentCWD, timestamp: Date.now() });

      // Log CWD change
      console.warn(`[CWD Changed] ${this.cwdHistory[this.cwdHistory.length - 2].cwd} → ${currentCWD}`);

      // Check if reset to initial
      if (currentCWD === this.initialCWD) {
        this.resetCount++;
        console.warn(`[CWD Reset] Count: ${this.resetCount}`);
      }

      // Emit event for subscribers
      this.emit('cwd-change', {
        from: this.cwdHistory[this.cwdHistory.length - 2].cwd,
        to: currentCWD,
        isReset: currentCWD === this.initialCWD
      });
    }
  }

  getHistory() {
    return this.cwdHistory;
  }

  getResetCount() {
    return this.resetCount;
  }

  stop() {
    clearInterval(this.monitor);
  }
}

module.exports = CWDTracker;
```

**Use it**:
```javascript
const CWDTracker = require('./lib/cwd-tracker');
const tracker = new CWDTracker();

tracker.on('cwd-change', (change) => {
  console.log(`CWD changed: ${change.from} → ${change.to}`);

  if (change.isReset) {
    console.warn('⚠️  CWD reset to initial directory!');
  }
});

// Later: check if CWD changed during operation
if (tracker.getResetCount() > 0) {
  console.warn(`CWD was reset ${tracker.getResetCount()} times during session`);
}
```

### Test File Operations with CWD Tracking

```bash
# Test file upload with CWD monitoring
PASSWORD=your-password node scripts/test-file-operations-cwd.js
```

**This test**:
1. Uploads file via API
2. Monitors CWD throughout operation
3. Verifies file saved to correct location
4. Checks if CWD changed during operation
5. Reports any CWD resets

**Expected output**:
```
Uploading file: test.txt
  Initial CWD: /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
  ✓ File uploaded successfully
  ✓ File saved to MinIO: user-files/roughsparks/test.txt
  ✓ Database record created
  Final CWD: /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
  CWD changes: 0
  CWD resets: 0

✓ PASS: File operations work correctly with stable CWD
```

**If CWD changed**:
```
⚠️  WARNING: CWD changed during file operation!
  Changes detected: 3
  Resets to initial: 1

CWD History:
  1. /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router (initial)
  2. /tmp (changed by file operation)
  3. /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router (reset)

This may cause issues with relative file paths!
```

---

## Part 5: Feature Validation Checklist

### Stop Testing Infrastructure. Test Features.

**Don't test**:
- "Does the rate limiter class work?" (unit test)
- "Can I create a test user?" (infrastructure)
- "Does the database connect?" (health check)

**Do test**:
- "Can roughsparks login on iPhone and chat?" (real feature)
- "Does rate limiting actually block requests?" (real behavior)
- "Can I upload a file from iPhone and see it on Mac?" (real workflow)

### Real User Workflows to Test

#### Workflow 1: New User Signup → Chat

```
User Story: "As a new user, I want to sign up and start chatting immediately"

Test Steps:
☐ 1. Open app on iPhone
☐ 2. Click "Sign Up"
☐ 3. Enter email/password
☐ 4. Click "Register"
☐ 5. Verify automatically logged in (no second login)
☐ 6. Click "Chat"
☐ 7. Send message: "Hello"
☐ 8. Verify streaming response appears
☐ 9. Check response time (< 3s acceptable)
☐ 10. Send second message
☐ 11. Verify context maintained (bot remembers first message)

Pass Criteria:
- Signup works on first try
- No need to login separately
- Chat responds within 3s
- Context works (multi-turn conversation)
```

#### Workflow 2: Multi-Device Pairing

```
User Story: "As a user, I want to use CALOS on both my laptop and iPhone"

Test Steps:
☐ 1. Login on Mac
☐ 2. Open Settings → Devices
☐ 3. Click "Pair New Device"
☐ 4. QR code appears
☐ 5. On iPhone: Click "Pair with QR Code"
☐ 6. Scan QR code with iPhone camera
☐ 7. iPhone shows "Pairing..."
☐ 8. iPhone shows "Paired successfully"
☐ 9. Verify both devices show same username/email
☐ 10. On Mac: Check credits balance (e.g., 100)
☐ 11. On iPhone: Send chat message (costs 10 credits)
☐ 12. On Mac: Refresh credits (should show 90)

Pass Criteria:
- QR code pairing works without errors
- Both devices see same user_id
- Credits sync across devices
- Changes on one device appear on other
```

#### Workflow 3: File Upload → File Explorer

```
User Story: "As a user, I want to upload files and browse them"

Test Steps:
☐ 1. Login on iPhone
☐ 2. Click "Files" icon
☐ 3. Click "Upload"
☐ 4. Select photo from camera roll
☐ 5. Wait for upload (show progress bar)
☐ 6. Verify file appears in list
☐ 7. Click file to preview
☐ 8. On Mac: Open Files
☐ 9. Verify same file appears on Mac
☐ 10. Click file on Mac (should download/preview)
☐ 11. On iPhone: Delete file
☐ 12. On Mac: Refresh (file should disappear)

Pass Criteria:
- Upload works on iPhone
- File syncs to Mac within 5 seconds
- Preview works on both devices
- Delete syncs across devices
```

#### Workflow 4: Rate Limit Hit → Upgrade

```
User Story: "As a free user, I hit rate limits and upgrade to PRO"

Test Steps:
☐ 1. Login as free user (10 req/hour)
☐ 2. Send 10 chat messages quickly
☐ 3. Send 11th message
☐ 4. Verify error: "Rate limit exceeded"
☐ 5. Error shows "Upgrade to PRO" button
☐ 6. Click upgrade button
☐ 7. Redirected to /pricing
☐ 8. Select PRO plan ($199/mo)
☐ 9. Enter payment info (Stripe)
☐ 10. Payment succeeds
☐ 11. Redirected back to chat
☐ 12. Send 11th message again
☐ 13. Message succeeds (PRO tier has 1000 req/hour)

Pass Criteria:
- Rate limit triggers at correct count
- Error message is clear
- Upgrade flow works smoothly
- Limits update immediately after payment
```

### Automated E2E Test Suite

```bash
# Run all E2E tests
node scripts/e2e-test-suite.js
```

**Tests**:
1. User signup flow
2. Login flow
3. Chat with streaming
4. File upload
5. Multi-device pairing
6. Rate limiting
7. Upgrade flow

**Expected output**:
```
╔═══════════════════════════════════════════════╗
║  E2E Test Suite Results                       ║
╚═══════════════════════════════════════════════╝

✓ User Signup Flow         (passed in 2.3s)
✓ Login Flow               (passed in 1.1s)
✓ Chat with Streaming      (passed in 3.8s)
✓ File Upload              (passed in 4.2s)
✓ Multi-Device Pairing     (passed in 5.6s)
✓ Rate Limiting            (passed in 12.4s)
✗ Upgrade Flow             (failed - Stripe test mode)

7 tests run
6 passed
1 failed

Overall: 85.7% pass rate
```

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│  E2E Testing Workflow                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Benchmark Providers (Real Performance)              │
│     node scripts/benchmark-all-providers.js             │
│                                                         │
│  2. Test on iPhone (Multi-Device)                       │
│     HOST=0.0.0.0 node router.js --local                 │
│     iPhone Safari: http://192.168.1.42:5001             │
│                                                         │
│  3. Verify Rate Limits (Actually Work)                  │
│     node scripts/test-rate-limiting.js                  │
│                                                         │
│  4. Monitor CWD (File Operations)                       │
│     node scripts/test-file-operations-cwd.js            │
│                                                         │
│  5. Test Real Workflows (Not Just Infra)                │
│     node scripts/e2e-test-suite.js                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key Insight**: Test features users actually use, not just infrastructure that exists.

---

## Related Documentation

- [STREAMING_PERFORMANCE_TESTING_GUIDE.md](./STREAMING_PERFORMANCE_TESTING_GUIDE.md) - Performance testing
- [NETWORK_TESTING_GUIDE.md](./NETWORK_TESTING_GUIDE.md) - Network diagnostics
- [MULTI_DEVICE_FEDERATION_GUIDE.md](./MULTI_DEVICE_FEDERATION_GUIDE.md) - Device pairing
- [ROUGHSPARKS-SETUP.md](../ROUGHSPARKS-SETUP.md) - Test user setup
