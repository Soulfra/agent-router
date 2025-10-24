# Timer-Based Bounce Detection & Session Tracking

**Built for:** Spam filtering, analytics, residential IP proxy tracking, call routing

---

## 🎯 What This Solves

### The Problem
When visitors come to your website:
- Some bounce immediately (bots, scrapers, wrong link)
- Some fail to load resources (ENOENT errors)
- Affiliate cookies don't work across localhost ↔ IP transitions
- Hard to detect spam vs. real users

### The Solution
**Timer-based bounce detection** - like a heartbeat monitor:
- Client sends heartbeat every 5 seconds
- If timer doesn't move → user bounced or failed
- Track IP rotations (residential proxy use case)
- Session-based affiliate tracking (no cookies needed)
- Spam score calculation

---

## 🚀 Quick Start

### 1. Run Database Migration

```bash
# Apply the bounce tracking migration
psql -h localhost -U matthewmauer -d calos -f database/migrations/041_add_bounce_tracking.sql
```

### 2. Add Heartbeat Client to Your Pages

```html
<!-- Add to any HTML page -->
<script src="/js/heartbeat-client.js" data-auto-start="true"></script>
```

That's it! The heartbeat will automatically:
- ✅ Start sending 5-second updates
- ✅ Track user interactions (clicks, scrolls, keypresses)
- ✅ Detect bounces (no interaction, fast exit)
- ✅ Preserve session across localhost ↔ IP transitions
- ✅ Track affiliate codes from URL params

### 3. Integrate Session Tracking Routes

The routes are created in `routes/session-tracking-routes.js` and need to be wired into `router.js` (see Integration section below).

---

## 📊 How It Works

### Client Side (Browser)

```javascript
// Automatically starts on page load
const heartbeat = new SessionHeartbeat({
  interval: 5000, // 5-second timer
  endpoint: '/api/session/heartbeat'
});

heartbeat.start();

// Every 5 seconds, sends:
{
  sessionId: "abc-123-def-456",
  page: "/landing-page",
  heartbeatCount: 12,
  interactionCount: 5,
  affiliateCode: "PARTNER123", // from ?ref=PARTNER123
  campaignId: "summer-sale"
}
```

### Server Side (Node.js)

```javascript
// Server receives heartbeat
POST /api/session/heartbeat

// Updates database:
- last_heartbeat_at = NOW()
- heartbeat_count += 1
- total_interactions = 5

// Bounce detector runs every minute:
- If no heartbeat for 30s → bounce_detected = true
- If duration < 5s + no interactions → bounce
- Calculates spam_score (0-100)
```

---

## 🔍 Bounce Detection Logic

### What Counts as a Bounce?

1. **No Heartbeat (30s)**
   ```
   User lands on page
   → Heartbeat #1 at 0s
   → No heartbeat #2
   → After 30s: BOUNCED (reason: no_heartbeat_30s)
   ```

2. **Fast Exit + No Interaction**
   ```
   User lands on page
   → Duration: 3 seconds
   → Interactions: 0
   → BOUNCED (reason: fast_exit_no_interaction)
   ```

3. **Zero Interactions**
   ```
   User lands on page
   → Session duration: 45 seconds
   → Interactions: 0 (no clicks, scrolls, nothing)
   → BOUNCED (reason: zero_interactions)
   ```

4. **Insufficient Heartbeats**
   ```
   User lands on page
   → Heartbeat count: 1
   → Expected: 2+ for real user
   → BOUNCED (reason: insufficient_heartbeats)
   ```

---

## 🔐 Cross-Domain Session Tracking

### The Cookie Problem

```
localhost:5001 → sets cookie for "localhost" ❌
192.168.1.87:5001 → different domain, cookie lost! ❌
```

### The Session-Based Solution

```
1. User clicks affiliate link:
   https://localhost:5001?ref=PARTNER123

2. Client generates session ID:
   sessionId = "abc-123-def-456"

3. URL updated to include session:
   https://localhost:5001?ref=PARTNER123&sid=abc-123-def-456

4. User switches to IP:
   https://192.168.1.87:5001?sid=abc-123-def-456

5. Session preserved! ✅
   - Same sessionId from URL
   - Affiliate code retrieved from database
   - No cookies needed
```

---

## 💰 Residential IP Proxy Tracking

### Use Case: Free Business Line via Call Routing

Track IP rotations as residential proxies change:

```javascript
// Session starts on IP A
{
  ip_address: "123.45.67.89",
  ip_rotations: 0
}

// IP rotates to IP B (proxy change)
{
  ip_address: "98.76.54.32",
  ip_rotations: 1,
  ip_history: [
    { ip: "123.45.67.89", timestamp: "2025-10-14T10:00:00Z" },
    { ip: "98.76.54.32", timestamp: "2025-10-14T10:05:23Z" }
  ]
}

// Track across all rotations
- Same sessionId preserved
- Call routing works across IPs
- Free business line achieved!
```

---

## 🎯 Spam Filtering

### Spam Score Calculation (0-100)

```javascript
let spamScore = 0;

// Low heartbeat count (< 2)
if (heartbeat_count < 2) spamScore += 30;

// No interactions
if (total_interactions === 0) spamScore += 25;

// Very short session (< 3s)
if (duration_ms < 3000) spamScore += 20;

// Bounce detected
if (bounce_detected) spamScore += 15;

// Excessive IP rotations (> 5)
if (ip_rotations > 5) spamScore += 10;

// Total: 0-100
// 0-30 = Normal
// 31-60 = Suspicious
// 61-100 = Likely spam/bot
```

---

## 📈 Analytics Views

### Bounce Rate by Page

```sql
SELECT * FROM bounce_analytics_by_page;
```

| page | total_sessions | bounced_sessions | bounce_rate_percent | avg_bounce_time_ms |
|------|----------------|------------------|---------------------|-------------------|
| /landing | 1000 | 350 | 35.00 | 2450 |
| /pricing | 500 | 75 | 15.00 | 4200 |

### Potential Spam Sessions

```sql
SELECT * FROM potential_spam_sessions;
```

| session_id | spam_score | bounce_detected | heartbeat_count | bot_reason |
|-----------|------------|-----------------|-----------------|------------|
| abc-123 | 85 | true | 1 | fast_exit |
| def-456 | 70 | true | 0 | no_heartbeat |

### Active Sessions

```sql
SELECT * FROM active_sessions;
```

| session_id | page | heartbeat_count | session_duration_seconds | ip_rotations |
|-----------|------|-----------------|-------------------------|--------------|
| xyz-789 | /chat | 45 | 225 | 0 |
| uvw-012 | /pricing | 12 | 60 | 2 |

---

## 🛠️ API Endpoints

### POST /api/session/heartbeat
Send heartbeat from client

**Request:**
```json
{
  "sessionId": "abc-123-def-456",
  "page": "/landing-page",
  "heartbeatCount": 12,
  "interactionCount": 5,
  "affiliateCode": "PARTNER123"
}
```

**Response:**
```json
{
  "status": "success",
  "sessionId": "abc-123-def-456",
  "heartbeatCount": 12
}
```

### POST /api/session/start
Start new session

### POST /api/session/end
End session

### GET /api/session/stats/:sessionId
Get session statistics

### GET /api/session/analytics/bounce
Get bounce analytics

### GET /api/session/active
Get active session count

---

## 🔧 Integration with Router

Add to `router.js`:

```javascript
// Import
const SessionHeartbeatManager = require('./lib/session-heartbeat');
const sessionTrackingRoutes = require('./routes/session-tracking-routes');

// Initialize
const sessionHeartbeat = new SessionHeartbeatManager({ db });
sessionHeartbeat.start();

// Mount routes
app.use('/api/session', sessionTrackingRoutes(sessionHeartbeat));
```

---

## 🎓 Example Use Cases

### 1. Affiliate Link Tracking (Cross-Domain)

```html
<!-- Affiliate shares this link -->
https://localhost:5001?ref=PARTNER123

<!-- User scans QR on phone, gets IP-based link -->
https://192.168.1.87:5001?sid=abc-123&ref=PARTNER123

<!-- Conversion tracked! ✅ -->
```

### 2. Bot Detection

```javascript
// Bot visit:
- heartbeat_count: 1
- total_interactions: 0
- duration_ms: 500
- spam_score: 75 → BLOCKED

// Real user:
- heartbeat_count: 24
- total_interactions: 12
- duration_ms: 120000
- spam_score: 0 → ALLOWED
```

### 3. Residential IP Proxy for Call Routing

```javascript
// Track call routing across IP rotations
Session A:
  - IP1: 123.45.67.89 (0:00 - 5:00)
  - IP2: 98.76.54.32 (5:00 - 10:00)
  - IP3: 111.222.33.44 (10:00 - 15:00)

Total duration: 15 minutes
IP rotations: 2
Affiliate preserved: ✅
Call routing active: ✅
```

---

## 📊 Database Schema

Key columns in `visit_sessions`:

- `last_heartbeat_at` - Timestamp of last heartbeat
- `heartbeat_count` - Number of heartbeats received
- `bounce_detected` - Boolean flag for bounces
- `bounce_reason` - Why it bounced
- `ip_rotations` - Number of IP changes
- `ip_history` - JSONB array of IP changes
- `affiliate_code` - Affiliate ref from URL
- `spam_score` - 0-100 spam likelihood

---

## 🎯 Next Steps

1. ✅ Add heartbeat script to your landing pages
2. ✅ Run database migration
3. ✅ Integrate routes into router.js
4. ✅ Monitor bounce analytics
5. ✅ Adjust spam score thresholds
6. ✅ Build residential IP proxy system

---

## 💡 Pro Tips

**For Call Routing:**
- Track `ip_rotations` to detect proxy switches
- Use `ip_history` for routing decisions
- Session ID persists across IPs

**For Affiliate Tracking:**
- Always include `?ref=CODE` in URLs
- Session ID auto-added to URL
- Works across localhost ↔ IP transitions

**For Spam Filtering:**
- Bounce rate > 60% = review page
- Spam score > 70 = likely bot
- Heartbeat count < 2 = suspicious

---

**Built for indie hackers learning to build their own infrastructure.** 🚀

From plans, to lessons, to becoming an indie hacker.
