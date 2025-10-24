# CALOS Telemetry System

## Overview

**VS Code / Google Analytics style telemetry** for CALOS Business OS.

**TL;DR**: All tiers (Community, Pro, Enterprise) send anonymized usage data to help us improve the product. Enterprise can opt-out via air-gapped mode.

---

## What We Collect

### 1. Feature Usage
- Which features are used (POS, transcripts, crypto, marketplace)
- How often each feature is used
- Feature adoption timeline

### 2. Performance Metrics
- API response times (p50, p95, p99)
- Slow requests (> 1s)
- Database query performance

### 3. Session Analytics
- Active sessions per day
- Average session duration
- Peak usage hours

### 4. Error Reporting
- Unhandled exceptions (stack trace obfuscated)
- API errors (4xx, 5xx)
- Failed transactions
- Error frequency and patterns

### 5. Trend Analysis
- Popular features
- Common workflows
- Theme popularity
- Route patterns (RESTful, GraphQL, etc.)

---

## What We DON'T Collect

❌ **Personally Identifiable Information (PII)**:
- No email addresses
- No names
- No phone numbers
- No IP addresses (country-level only)

❌ **Sensitive Business Data**:
- No transaction amounts
- No customer data
- No QuickBooks data
- No credit card numbers (we never see them anyway)

❌ **User Content**:
- No transcript contents
- No forum post contents
- No contract details

---

## Privacy & Obfuscation

All data is **obfuscated** before transmission:

### User IDs
```javascript
// Before: "user_abc123"
// After:  "f3a2b1c0d4e5f6a7"  (SHA-256 hash)
```

### Email Addresses
```javascript
// Before: "john.doe@gmail.com"
// After:  "gmail.com"  (domain only, for trend analysis)
```

### URL Paths
```javascript
// Before: "/api/users/123/transactions/abc-def-456"
// After:  "/api/users/:id/transactions/:id"
```

### Error Messages
```javascript
// Before: "User john.doe@gmail.com not found"
// After:  "User [EMAIL] not found"
```

### Stack Traces
```javascript
// Before: 50-line stack trace with file paths
// After:  First 5 lines only, PII removed
```

---

## Telemetry by Tier

| Tier | Branding | Telemetry | Can Opt-Out? |
|------|----------|-----------|--------------|
| **Development** (localhost) | None | ❌ **None** | N/A |
| **Community** | Required | ✅ **Required** | ❌ No (in TOS) |
| **Pro** | White-label | ✅ **Required** | ❌ No (in TOS) |
| **Enterprise** | White-label | ✅ **Optional** | ✅ Yes (air-gapped) |

### Localhost Exception

**No telemetry is collected from localhost**, even if you're using Community tier:

```javascript
// Localhost = No telemetry
'localhost'
'127.0.0.1'
'192.168.x.x'
'10.x.x.x'
'*.local'
'*.localhost'
```

### Enterprise Opt-Out

Enterprise users can disable telemetry via environment variable:

```bash
# .env
TELEMETRY_DISABLED=true  # Air-gapped mode
```

---

## How It Works

### 1. Automatic Collection (Express Middleware)

```javascript
// server.js
const { telemetryMiddleware } = require('./lib/telemetry/telemetry-middleware');

app.use(licenseMiddleware);    // Check tier
app.use(telemetryMiddleware);  // Auto-collect telemetry

// Now every request is tracked automatically:
// - Method, path, status code, duration
// - Feature usage (based on endpoint)
// - Errors (if status >= 400)
```

### 2. Manual Tracking

```javascript
const { trackFeature, trackError } = require('./lib/telemetry/telemetry-middleware');

// Track specific feature usage
await trackFeature(req, 'pos_transaction', {
  method: 'card',
  amount: 4999  // Will be obfuscated
});

// Track errors
try {
  await processPayment();
} catch (error) {
  await trackError(req, error, { context: 'payment_processing' });
  throw error;
}
```

### 3. Batched Transmission

Telemetry is **batched** and sent during license verification:

```
User makes requests → Telemetry collected locally → Buffered in memory
    ↓ (every 5 min)
Flush to database
    ↓ (every 24h-30d, depending on tier)
License verification → Send batched telemetry to license.calos.sh
```

**Why batched?**
- Reduces network overhead
- Respects user's bandwidth
- More efficient for analysis

---

## Data Flow

### Client-Side

```
User visits https://example.com/api/pos
    ↓
[Express Middleware] Track request start time
    ↓
[Route Handler] Process POS transaction
    ↓
[Response] Send response to user
    ↓
[Telemetry Middleware] Calculate duration, obfuscate data
    ↓
[Telemetry Collector] Add to buffer (in-memory)
    ↓ (every 5 min or when buffer full)
[Database] Save to telemetry_events table
```

### Server-Side (License Verification)

```
Every 24h-30d (depending on tier):
    ↓
[License Verifier] Phone home to license.calos.sh
    ↓
[Get Batched Telemetry] Query last 24h of telemetry from DB
    ↓
[Send to Server] Include telemetry with verification request
    ↓
[License Server] Receive verification + telemetry
    ↓
[Analytics Pipeline] Process telemetry (aggregate, analyze trends)
```

---

## Database Schema

### Tables Created

| Table | Purpose | Retention |
|-------|---------|-----------|
| `telemetry_events` | All telemetry events (raw) | 90 days |
| `telemetry_features` | Feature usage (aggregated) | Forever |
| `telemetry_errors` | Error tracking (deduplicated) | Forever |
| `telemetry_performance` | Performance metrics | 90 days |
| `telemetry_sessions` | Session analytics | 90 days |
| `telemetry_aggregates` | Daily summaries | Forever |

### Example Queries

**Get feature usage for last 7 days:**

```sql
SELECT * FROM get_telemetry_summary('install_123', 7);
```

**Get popular features (across all installs):**

```sql
SELECT * FROM get_popular_features(10);
```

**Get error trends:**

```sql
SELECT
  error_type,
  SUM(occurrence_count) as total_occurrences
FROM telemetry_errors
WHERE last_seen_at >= NOW() - INTERVAL '30 days'
GROUP BY error_type
ORDER BY total_occurrences DESC;
```

---

## API Endpoints

### GET /api/telemetry/summary?hours=24

Get telemetry summary for current install:

```javascript
// Request
GET /api/telemetry/summary?hours=24

// Response
{
  "success": true,
  "summary": {
    "period": "24h",
    "featureUsage": [
      { "feature": "pos_transaction", "count": 50 },
      { "feature": "transcript_upload", "count": 10 }
    ],
    "performance": [
      { "path": "/api/pos/:id", "avg_duration": 123, "count": 50 }
    ],
    "errors": [
      { "error_type": "database", "count": 2 }
    ],
    "apiStats": [
      { "method": "POST", "status_code": 200, "count": 45, "avg_duration": 100 }
    ],
    "totalEvents": 60
  }
}
```

### POST /api/telemetry/flush

Manually flush telemetry buffer:

```javascript
// Request
POST /api/telemetry/flush

// Response
{
  "success": true,
  "message": "Telemetry flushed"
}
```

---

## What We Learn From Telemetry

### Traffic Patterns
- **Peak hours**: When are users most active?
- **Geographic distribution**: Which countries use CALOS?
- **Scaling needs**: Do we need more servers?

### Feature Adoption
- **Most used features**: POS, transcripts, crypto?
- **Underused features**: What needs improvement?
- **Feature combinations**: Do POS users also use QuickBooks sync?

### Performance Optimization
- **Slow endpoints**: Which APIs need optimization?
- **Error rates**: Are errors increasing?
- **Database queries**: Which queries are slow?

### Popular Workflows
- **Common automation patterns**: Which workflows are popular?
- **Theme trends**: Which themes are most downloaded?
- **Route patterns**: RESTful vs GraphQL usage?

### Capacity Planning
- **Server load**: How many requests per second?
- **Storage growth**: How much DB space needed?
- **Network bandwidth**: How much data transfer?

---

## Comparison to Industry Standards

### VS Code Telemetry

| Feature | VS Code | CALOS |
|---------|---------|-------|
| Collects usage data | ✅ | ✅ |
| Collects crash reports | ✅ | ✅ |
| Collects performance data | ✅ | ✅ |
| Obfuscates PII | ✅ | ✅ |
| Can opt-out | ✅ (partially) | ✅ (Enterprise only) |
| Telemetry viewer | ✅ | ✅ |

### Google Analytics

| Feature | Google Analytics | CALOS |
|---------|------------------|-------|
| Page views | ✅ | ✅ (API requests) |
| User sessions | ✅ | ✅ |
| Event tracking | ✅ | ✅ (feature usage) |
| Error tracking | ❌ | ✅ |
| Performance metrics | ✅ | ✅ |
| Anonymize IP | ✅ | ✅ (always) |

### GitHub Telemetry

| Feature | GitHub | CALOS |
|---------|--------|-------|
| Collects CI/CD data | ✅ | ✅ (feature usage) |
| Collects error data | ✅ | ✅ |
| Open source telemetry | ✅ (OpenTelemetry) | ✅ |
| Batched transmission | ✅ | ✅ |

---

## Integration Example

### server.js

```javascript
const express = require('express');
const { licenseMiddleware } = require('./lib/middleware/license-middleware');
const { telemetryMiddleware, setupTelemetryRoutes } = require('./lib/telemetry/telemetry-middleware');

const app = express();

// 1. Check license tier
app.use(licenseMiddleware);

// 2. Collect telemetry (respects tier settings)
app.use(telemetryMiddleware);

// 3. Setup telemetry API routes
app.use('/api/telemetry', setupTelemetryRoutes());

// Your routes...
app.get('/api/pos/:id', async (req, res) => {
  // Telemetry automatically tracked
  const transaction = await getPOSTransaction(req.params.id);
  res.json(transaction);
});

app.listen(5001);
```

### Manual Feature Tracking

```javascript
const { trackFeature } = require('./lib/telemetry/telemetry-middleware');

app.post('/api/pos/transactions', async (req, res) => {
  // Process transaction
  const transaction = await createPOSTransaction(req.body);

  // Track feature usage
  await trackFeature(req, 'pos_transaction', {
    paymentMethod: req.body.method,
    success: true
  });

  res.json(transaction);
});
```

---

## Cleanup & Retention

Telemetry data is automatically cleaned up after **90 days**:

```sql
-- Run nightly
SELECT * FROM cleanup_telemetry_data(90);
```

**What's kept forever:**
- Aggregated feature usage (`telemetry_features`)
- Error summaries (`telemetry_errors`)
- Daily aggregates (`telemetry_aggregates`)

**What's deleted after 90 days:**
- Raw events (`telemetry_events`)
- Performance data (`telemetry_performance`)
- Session data (`telemetry_sessions`)

---

## FAQ

### For Users

**Q: Can I opt-out of telemetry?**
A: Yes, if you're on Enterprise tier and use air-gapped mode (`TELEMETRY_DISABLED=true`). Community and Pro tiers have telemetry as part of the TOS.

**Q: What if I'm on localhost?**
A: No telemetry is collected from localhost, ever.

**Q: Can you see my transaction amounts?**
A: No. We obfuscate all sensitive data before collection.

**Q: Can you see my customer emails?**
A: No. Email addresses are never collected.

**Q: How often is telemetry sent?**
A: Batched every 24h-30d (depending on tier) during license verification.

**Q: Can I view my own telemetry?**
A: Yes. `GET /api/telemetry/summary?hours=24`

---

### For Developers

**Q: How do I track a custom feature?**
A: `await trackFeature(req, 'my_feature', { metadata });`

**Q: How do I opt-out during development?**
A: Just use `localhost`. No telemetry is collected.

**Q: Can I see what data is being sent?**
A: Yes. Check the `telemetry_events` table in your local database.

**Q: What if telemetry collection fails?**
A: It fails silently. Your app continues to work normally.

**Q: How much database space does telemetry use?**
A: ~1-10 MB per 10k events. Auto-cleaned after 90 days.

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `lib/telemetry/telemetry-obfuscator.js` | Data anonymization | 400+ |
| `lib/telemetry/telemetry-collector.js` | Telemetry collection | 450+ |
| `lib/telemetry/telemetry-middleware.js` | Express middleware | 350+ |
| `database/migrations/081_telemetry_system.sql` | Database schema | 450+ |
| `lib/license-verifier.js` | Updated with telemetry batching | 600+ |

---

## Summary

✅ **All tiers** send telemetry (except localhost)
✅ **All data obfuscated** (no PII)
✅ **Batched transmission** (every 24h-30d)
✅ **Enterprise can opt-out** (air-gapped mode)
✅ **Automatic collection** (Express middleware)
✅ **Trend analysis** (popular features, error rates, performance)

**The VS Code model for business operating systems.**

---

**Built with ❤️ by CALOS**

*Open source • Self-host free • Fair trade • Privacy-first telemetry*
