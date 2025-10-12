# CalOS Verification Guide

Complete guide for verifying your CalOS installation is working correctly.

## Quick Verification

**One-command test:**
```bash
./scripts/e2e-test.sh
```

This runs a comprehensive end-to-end test that verifies:
- ✅ Prerequisites (Ollama, database, Node.js)
- ✅ API endpoints
- ✅ Agent execution
- ✅ Cache performance
- ✅ Database timing data
- ✅ Widget availability
- ✅ All automated tests

## Prerequisites Checklist

Before running verification tests, ensure you have:

### 1. Ollama (Required for Local Mode)

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start it:
ollama serve

# Pull a model (if needed):
ollama pull mistral
```

### 2. Database (PostgreSQL or SQLite)

**PostgreSQL:**
```bash
# Check if PostgreSQL is running
psql --version

# Check if database exists
psql -l | grep calos

# Create database if needed
createdb calos
psql calos < database/schema.sql
```

**SQLite:**
```bash
# SQLite works automatically - no setup needed!
# Just configure in .env:
# DB_TYPE=sqlite
# DB_PATH=../memory/calos.db
```

### 3. Node.js Dependencies

```bash
# Install dependencies
npm install

# Verify installation
node --version
npm list axios openai
```

## Verification Methods

### Method 1: End-to-End Test (Recommended)

The most comprehensive test - verifies everything in one go:

```bash
# Full test (creates database, runs all tests)
./scripts/e2e-test.sh

# Skip database setup (if already configured)
./scripts/e2e-test.sh --skip-db-setup

# Keep router running after test
./scripts/e2e-test.sh --keep-running
```

**What it tests:**
- Prerequisites (Ollama, database, Node.js)
- Router startup in local mode
- All API endpoints
- Agent execution with timing
- Cache hits and performance
- Database schema and indexes
- Widget files and integration
- SQL verification queries
- Automated test suite

**Expected output:**
```
═══════════════════════════════════════════════════════════════
  ✨ E2E Test Complete!
═══════════════════════════════════════════════════════════════

Summary:
  ✅ Prerequisites verified
  ✅ Router started successfully
  ✅ API endpoints working
  ✅ Agent execution working
  ✅ Cache performance verified
  ✅ Database timing data verified
  ✅ Widgets available
  ✅ SQL verification complete
  ✅ Automated tests passed
```

### Method 2: Automated Test Suite

Run the JavaScript test suite for API and feature testing:

```bash
# Start router first
node router.js --local

# In another terminal, run tests:
node scripts/test-all-features.js

# Include database tests:
node scripts/test-all-features.js --with-db
```

**What it tests:**
- Health check endpoint
- Time endpoints (unix, timezone)
- System endpoints (uptime, summary)
- Introspect endpoints (JSON, XML)
- Agents registry
- Agent execution
- Cache hit performance
- Database schema (with --with-db)
- Timing data verification (with --with-db)
- Widget files and integration
- Message store

**Expected output:**
```
╔════════════════════════════════════════╗
║  🧪 CalOS Comprehensive Feature Test  ║
╚════════════════════════════════════════╝

✅ Health check endpoint
✅ Time endpoint - unix timestamp
✅ System endpoint - uptime
✅ Agent execution
✅ Cache hit on repeated query

Test Summary:
✅ Passed:  25
❌ Failed:  0
⏭️  Skipped: 0
📊 Total:   25

✨ All tests passed!
```

### Method 3: SQL Verification

Verify database schema and performance directly:

```bash
# Run SQL verification queries
psql calos -f database/verify-install.sql

# Or view specific sections:

# 1. Check schema
psql calos -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'ai_responses'
  ORDER BY ordinal_position;
"

# 2. Check timing statistics
psql calos -c "
  SELECT
    COUNT(*) as total_queries,
    ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
    MIN(latency_ms) as min_latency_ms,
    MAX(latency_ms) as max_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms
  FROM ai_responses
  WHERE latency_ms IS NOT NULL;
"

# 3. Check cache performance
psql calos -c "
  SELECT
    COUNT(*) as total_queries,
    COUNT(*) FILTER (WHERE cache_hit) as cache_hits,
    ROUND(100.0 * COUNT(*) FILTER (WHERE cache_hit) / NULLIF(COUNT(*), 0), 2) as hit_rate_percent
  FROM ai_responses;
"

# 4. View fast responses
psql calos -c "SELECT * FROM fast_responses LIMIT 10;"

# 5. View agent performance
psql calos -c "SELECT * FROM agent_performance;"
```

### Method 4: Manual Testing

Test individual features manually:

#### 1. Health Check
```bash
curl http://localhost:5001/health
# Expected: {"status":"ok","timestamp":"..."}
```

#### 2. Time Features
```bash
# Unix timestamp
curl http://localhost:5001/time?action=unix
# Expected: {"timestamp":1234567890,"formatted":"..."}

# Timezone conversion
curl "http://localhost:5001/time?action=timezone&city=Tokyo"
# Expected: {"timezone":"Asia/Tokyo","offset":"+09:00","formatted":"..."}
```

#### 3. System Introspection
```bash
# System summary
curl http://localhost:5001/system
# Expected: {"uptime":"...","memory":{...},"components":[...]}

# XML introspection
curl http://localhost:5001/introspect?format=xml
# Expected: <calos>...</calos>
```

#### 4. Agent Execution
```bash
# Execute query with Ollama
curl -X POST http://localhost:5001/agent \
  -H "Content-Type: application/json" \
  -d '{"input": "@ollama what is 2+2?", "context": {"local": true}}'

# Expected: {"logs":[...]}
```

#### 5. Widgets
```bash
# Check widget files exist
ls -la public/widgets/
# Expected: world-clock.js, world-clock.css, system-status.js, system-status.css

# Check widget integration
curl http://localhost:5001/wall.html | grep "world-clock-widget"
# Expected: <div id="world-clock-widget"></div>
```

## Verification Checklist

Use this checklist to ensure everything is working:

### Core Features
- [ ] Ollama is running (`curl http://localhost:11434/api/tags`)
- [ ] Database is created and schema loaded
- [ ] Router starts successfully (`node router.js --local`)
- [ ] Health check returns OK (`curl http://localhost:5001/health`)

### API Endpoints
- [ ] `/time?action=unix` returns timestamp
- [ ] `/time?action=timezone&city=Tokyo` returns timezone info
- [ ] `/system` returns system summary
- [ ] `/introspect` returns JSON structure
- [ ] `/introspect?format=xml` returns XML structure
- [ ] `/agents` returns agent registry

### Agent Execution
- [ ] First query executes successfully (cache miss)
- [ ] Second identical query is faster (cache hit)
- [ ] Cache hit latency < 1 second (ideally < 100ms)
- [ ] Ollama responses are saved to database

### Database Schema
- [ ] `ai_responses` table has `request_timestamp` column
- [ ] `ai_responses` table has `response_timestamp` column
- [ ] `ai_responses` table has `latency_ms` column
- [ ] `ai_responses` table has `cache_hit` column
- [ ] Indexes exist: `idx_responses_request_time`, `idx_responses_latency`, `idx_responses_cache_hit`
- [ ] Views exist: `fast_responses`, `slow_responses`, `agent_performance`, `recent_responses`

### Timing Data
- [ ] Responses have timing information (`latency_ms IS NOT NULL`)
- [ ] Latency calculations are correct (stored ≈ calculated)
- [ ] Cache hits have low latency (< 100ms)
- [ ] Timing statistics are accurate (AVG, MIN, MAX, P95)

### Widgets
- [ ] `public/widgets/world-clock.js` exists
- [ ] `public/widgets/world-clock.css` exists
- [ ] `public/widgets/system-status.js` exists
- [ ] `public/widgets/system-status.css` exists
- [ ] `wall.html` includes world-clock-widget
- [ ] `wall.html` includes system-status-widget

### Performance
- [ ] Cache hits return in < 100ms
- [ ] Fresh Ollama queries complete in < 5 seconds
- [ ] Database queries are fast (< 10ms for simple lookups)
- [ ] Widgets update smoothly without lag

## Troubleshooting

### "Ollama not available"

**Problem:** Router can't connect to Ollama

**Solutions:**
```bash
# 1. Check if Ollama is running
curl http://localhost:11434/api/tags

# 2. If not running, start it:
ollama serve

# 3. Pull a model:
ollama pull mistral

# 4. Verify model is available:
ollama list
```

### "Database initialization failed"

**Problem:** Can't connect to database or schema not loaded

**Solutions:**
```bash
# PostgreSQL:
# 1. Check if PostgreSQL is running
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux

# 2. Create database
createdb calos

# 3. Load schema
psql calos < database/schema.sql

# SQLite:
# 1. Check .env configuration
# DB_TYPE=sqlite
# DB_PATH=../memory/calos.db

# 2. Ensure directory exists
mkdir -p ../memory
```

### "Cache hits are slow"

**Problem:** Cache performance is poor (> 100ms)

**Solutions:**
```bash
# 1. Check indexes exist
psql calos -c "
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'ai_responses'
"

# 2. Rebuild indexes if needed
psql calos -c "REINDEX TABLE ai_responses;"

# 3. Vacuum database
psql calos -c "VACUUM ANALYZE ai_responses;"

# 4. Check database size
psql calos -c "
  SELECT pg_size_pretty(pg_database_size('calos'))
"
```

### "Timing data is missing"

**Problem:** `latency_ms` column is NULL for all responses

**Solutions:**
```bash
# 1. Check schema is up to date
psql calos -f database/migrations/001_add_time_differentials.sql

# 2. Verify columns exist
psql calos -c "
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ai_responses'
    AND column_name IN ('request_timestamp', 'response_timestamp', 'latency_ms')
"

# 3. Make a new query to test
curl -X POST http://localhost:5001/agent \
  -H "Content-Type: application/json" \
  -d '{"input": "@ollama test", "context": {"local": true}}'

# 4. Check if timing was recorded
psql calos -c "
  SELECT request_timestamp, response_timestamp, latency_ms
  FROM ai_responses
  ORDER BY request_timestamp DESC
  LIMIT 1
"
```

### "E2E test fails on agent execution"

**Problem:** Agent queries fail or timeout

**Solutions:**
```bash
# 1. Check Ollama is running and has models
ollama list

# 2. Test Ollama directly
curl -X POST http://localhost:11434/api/chat \
  -d '{"model":"mistral","messages":[{"role":"user","content":"test"}],"stream":false}'

# 3. Check router logs
tail -f /tmp/calos-router.log

# 4. Increase timeout (if needed)
# Edit scripts/e2e-test.sh and increase timeout value
```

### "Widgets not loading"

**Problem:** Widgets don't appear or JavaScript errors

**Solutions:**
```bash
# 1. Check files exist
ls -la public/widgets/

# 2. Verify integration in HTML
curl http://localhost:5001/wall.html | grep widget

# 3. Check browser console for errors
# Open http://localhost:5001/wall.html in browser
# Open DevTools (F12) and check Console tab

# 4. Verify widget scripts are loading
curl http://localhost:5001/widgets/world-clock.js
curl http://localhost:5001/widgets/system-status.js
```

## Performance Benchmarks

Expected performance for a healthy CalOS installation:

| Metric | Expected | Acceptable | Poor |
|--------|----------|------------|------|
| Health check | < 10ms | < 50ms | > 100ms |
| Cache hit | < 10ms | < 100ms | > 500ms |
| Fresh Ollama query | < 2s | < 5s | > 10s |
| Database query | < 5ms | < 20ms | > 100ms |
| Widget load | < 100ms | < 500ms | > 1s |
| Time endpoint | < 10ms | < 50ms | > 100ms |

Run these queries to check your performance:

```sql
-- Overall latency stats
SELECT
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  MIN(latency_ms) as min_latency_ms,
  MAX(latency_ms) as max_latency_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency_ms
FROM ai_responses
WHERE latency_ms IS NOT NULL;

-- Cache hit vs miss performance
SELECT
  cache_hit,
  COUNT(*) as requests,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  MIN(latency_ms) as min_latency_ms,
  MAX(latency_ms) as max_latency_ms
FROM ai_responses
GROUP BY cache_hit;

-- Fast responses (< 100ms)
SELECT COUNT(*) as fast_responses
FROM ai_responses
WHERE latency_ms < 100;

-- Slow responses (> 5 seconds)
SELECT COUNT(*) as slow_responses
FROM ai_responses
WHERE latency_ms > 5000;
```

## Next Steps

Once verification is complete:

1. **[Local-First Guide](LOCAL-FIRST.md)** - Learn about running CalOS completely offline
2. **[Time & Introspection](../TIME-AND-INTROSPECTION.md)** - Explore time and system features
3. **[Widget Development](public/widgets/README.md)** - Create your own widgets
4. **[Database Schema](database/README.md)** - Understand the database structure

## Getting Help

If verification fails and troubleshooting doesn't help:

1. Check logs: `/tmp/calos-router.log`
2. Review schema: `psql calos -f database/verify-install.sql`
3. Test manually: Follow "Method 4: Manual Testing" above
4. Create issue: https://github.com/yourusername/calos/issues (replace with actual repo)

---

**Remember:** CalOS works best when fully local with Ollama! 🚀
