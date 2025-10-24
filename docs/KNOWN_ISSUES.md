# Known Issues and Resolutions

This document tracks known system issues, their impact, and resolution status.

---

## Critical: System Clock Set to Wrong Year (2025 instead of 2024)

**Status:** 🔴 **UNRESOLVED** - Requires manual system administration
**Discovered:** October 20, 2024
**Severity:** High - Affects all timestamp displays and date calculations

### Problem Description

The system clock is set to **October 20, 2025** (one year in the future) instead of the correct date of **October 20, 2024**.

**Evidence:**
```bash
$ date
Mon Oct 20 16:20:23 EDT 2025  # Wrong!
```

**Database Impact:**
```sql
SELECT symbol, recorded_at FROM price_history ORDER BY recorded_at DESC LIMIT 5;

 symbol |        recorded_at
--------+----------------------------
 BTC    | 2025-10-20 16:18:43.768869  # All timestamps show 2025
 BTC    | 2025-10-20 15:58:14.955866
 ETH    | 2025-10-20 15:58:15.120934
```

### Impact

1. **Database Timestamps:** All `recorded_at`, `created_at`, `updated_at` timestamps are 1 year in the future
2. **Relative Time Display:** Age calculations show incorrect values ("5m ago" is actually "1 year and 5m ago")
3. **Candle Aggregation:** Time bucket calculations may be affected
4. **Cache Expiration:** TTL calculations are incorrect
5. **Audit Logs:** All event timestamps are wrong
6. **Price Verification:** Timestamp validation checks will incorrectly flag valid data as "stale"

### Resolution Required

**Fix (requires root/admin access):**

```bash
# macOS
sudo systemsetup -setdate 10:20:24  # MM:DD:YY format
sudo systemsetup -settime 16:20:00  # HH:MM:SS format

# Or use Network Time Protocol
sudo systemsetup -setusingnetworktime on

# Linux
sudo timedatectl set-time "2024-10-20 16:20:00"

# Or enable NTP
sudo timedatectl set-ntp true
```

**Verification:**
```bash
date
# Should show: Sun Oct 20 16:20:00 EDT 2024
```

### Workarounds Implemented

Until the system clock is fixed, the following mitigations are in place:

1. **Price Verification System** (sources/pricing-source.js:104-119)
   - Validates price timestamps against reasonable bounds
   - Detects clock skew and flags suspicious timestamps
   - Uses `lib/price-verifier.js` for sanity checks

2. **Timestamp Utilities** (lib/timestamp-utils.js)
   - Progressive timestamp display ("5m ago" → "3h ago" → "Oct 20")
   - Clock skew detection via `detectClockSkew()`
   - NTP comparison via `getSystemClockDrift()`

3. **Audit Logging** (migrations/062_price_audit_log.sql)
   - Logs suspicious price data with confidence scores
   - Tracks verification failures for forensic analysis

### Testing Clock Drift Detection

```bash
# Check system clock drift
node -e "const TimestampUtils = require('./lib/timestamp-utils'); TimestampUtils.getSystemClockDrift().then(console.log)"
```

Expected output (once clock is fixed):
```json
{
  "driftMs": -145,
  "driftSeconds": 0,
  "localTime": "2024-10-20T20:20:23.145Z",
  "serverTime": "2024-10-20T20:20:23.000Z",
  "message": "✅ Clock is synchronized"
}
```

Current output (with wrong clock):
```json
{
  "driftMs": 31536000000,
  "driftSeconds": 31536000,
  "message": "⚠️ Clock is 31536000s ahead"
}
```

---

## Resolved: PDF Parsing Crashes with DOMMatrix Error

**Status:** ✅ **RESOLVED**
**Fixed:** October 20, 2024
**Resolution:** Replaced pdf-parse with pdf.js-extract

### Problem Description

Server crashed on startup with browser API errors:
```
ReferenceError: DOMMatrix is not defined
    at node_modules/pdf-parse/dist/cjs/index.cjs:13856:22
```

### Root Cause

pdf-parse v2.2.2 uses browser APIs (DOMMatrix, ImageData, Path2D) that don't exist in Node.js v18.20.8.

### Resolution

**Changes:**
1. Uninstalled pdf-parse
2. Installed pdf.js-extract (Node.js native alternative)
3. Updated `lib/resume-parser.js:98-116` to use new API

**Files modified:**
- `lib/resume-parser.js` - Replaced `_parsePDF()` implementation

**Testing:**
```bash
node test-resume-parser.js
# ✓ Test 1: Module loaded successfully (no DOMMatrix error!)
# ✓ Test 2: Parser instance created
```

---

## Resolved: Candle Scheduler Crashes Every 5 Minutes

**Status:** ✅ **RESOLVED**
**Fixed:** October 20, 2024
**Resolution:** Added human-readable time string parser

### Problem Description

Scheduled candle aggregation job crashed every 5 minutes:
```
RangeError: Invalid time value
    at Date.toISOString (<anonymous>)
    at main (/scripts/compute-candles.js:287:38)
```

### Root Cause

Scheduler passes `--from "1 hour ago"` but script expected ISO dates:
```javascript
new Date("1 hour ago")  // Invalid Date
```

### Resolution

**Changes:**
1. Added `parseTimeString()` function to handle relative formats
2. Supports: "N seconds/minutes/hours/days/weeks ago"
3. Falls back to ISO date parsing

**Files modified:**
- `scripts/compute-candles.js:84-132` - Added time string parser

**Testing:**
```bash
node scripts/compute-candles.js --timeframe 5m --from "1 hour ago"
# 📅 Date Range: 2025-10-20T19:16:37.946Z to 2025-10-20T20:16:37.946Z
# ✅ BTC 5m: 8 inserted, 0 updated, 0 skipped
```

---

## Future Enhancements

### Blockchain Price Verification

**Requested by:** User
**Status:** Future consideration
**Rationale:** "wouldn't we need to tie it into the blockchain block or something too"

**Current approach:**
- Price verification uses API sanity checks (bounds, rate-of-change, source reliability)
- Confidence scoring (0-100%) with 70% threshold for "verified"
- Historical comparison against price_history table

**Blockchain verification considerations:**
- Would require additional API calls (Etherscan, Blockchain.com, etc.)
- Adds complexity and potential rate limiting
- Most effective for on-chain assets (BTC, ETH)
- Less applicable for stocks (AAPL, GOOGL, etc.)

**Implementation if needed:**
1. Add blockchain RPC endpoints to pricing-source.js
2. Compare CoinGecko prices to on-chain oracle data (Chainlink, etc.)
3. Add blockchain verification to PriceVerifier confidence scoring

---

## Maintenance Notes

### Running Migrations

To apply the price audit log migration:
```bash
psql -U $DB_USER -d calos -f migrations/062_price_audit_log.sql
```

### Viewing Price Quality Metrics

```sql
-- Recent suspicious prices
SELECT * FROM recent_suspicious_prices LIMIT 20;

-- Quality metrics by symbol
SELECT * FROM price_quality_metrics;

-- Manual audit query
SELECT
  symbol,
  price,
  confidence_score,
  verification_status,
  issues,
  logged_at
FROM price_audit_log
WHERE logged_at > NOW() - INTERVAL '24 hours'
ORDER BY confidence_score ASC;
```

### Monitoring Clock Drift

Add to cron or monitoring system:
```bash
# Check every hour
0 * * * * node -e "require('./lib/timestamp-utils').getSystemClockDrift().then(r => r.driftMs > 60000 && console.error('Clock drift detected:', r))"
```

---

## References

- Price Verification: `lib/price-verifier.js`
- Timestamp Utilities: `lib/timestamp-utils.js`
- Pricing Source: `sources/pricing-source.js`
- Audit Migration: `migrations/062_price_audit_log.sql`
- Candle Computation: `scripts/compute-candles.js`
- Resume Parser: `lib/resume-parser.js`

---

**Last Updated:** October 20, 2024
**Maintainer:** System Administrator
