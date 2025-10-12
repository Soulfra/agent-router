-- CalOS Database Verification Queries
-- Run these to verify your installation is correct

-- ============================================================
-- 1. Check Schema Version
-- ============================================================

\echo '============================================================'
\echo '1. Checking Database Schema'
\echo '============================================================'
\echo ''

-- Check ai_responses table structure
\echo 'ai_responses table columns:'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'ai_responses'
ORDER BY ordinal_position;

\echo ''
\echo 'Expected columns: id, request_timestamp, response_timestamp, latency_ms, provider, model, ...'
\echo ''

-- ============================================================
-- 2. Verify Indexes Exist
-- ============================================================

\echo '============================================================'
\echo '2. Checking Indexes'
\echo '============================================================'
\echo ''

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('ai_responses', 'agent_metrics', 'conversations')
ORDER BY tablename, indexname;

\echo ''

-- ============================================================
-- 3. Verify Views Exist
-- ============================================================

\echo '============================================================'
\echo '3. Checking Views'
\echo '============================================================'
\echo ''

SELECT
  table_name as view_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

\echo ''
\echo 'Expected views: recent_responses, fast_responses, slow_responses, agent_performance, dataset_summary'
\echo ''

-- ============================================================
-- 4. Check Data Exists
-- ============================================================

\echo '============================================================'
\echo '4. Checking Data'
\echo '============================================================'
\echo ''

-- Count records in main tables
SELECT
  'ai_responses' as table_name,
  COUNT(*) as record_count,
  COUNT(latency_ms) as with_timing,
  MIN(request_timestamp) as oldest,
  MAX(request_timestamp) as newest
FROM ai_responses
UNION ALL
SELECT
  'agent_metrics',
  COUNT(*),
  COUNT(value),
  MIN(timestamp),
  MAX(timestamp)
FROM agent_metrics
UNION ALL
SELECT
  'conversations',
  COUNT(*),
  COUNT(message_count),
  MIN(started_at),
  MAX(updated_at)
FROM conversations;

\echo ''

-- ============================================================
-- 5. Timing Statistics
-- ============================================================

\echo '============================================================'
\echo '5. Timing Statistics'
\echo '============================================================'
\echo ''

-- Overall latency stats
\echo 'Overall latency stats:'
SELECT
  COUNT(*) as total_queries,
  COUNT(latency_ms) as queries_with_timing,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
  MIN(latency_ms) as min_latency_ms,
  MAX(latency_ms) as max_latency_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency_ms
FROM ai_responses
WHERE latency_ms IS NOT NULL;

\echo ''

-- Latency by provider
\echo 'Latency by provider:'
SELECT
  provider,
  model,
  COUNT(*) as queries,
  ROUND(AVG(latency_ms)::numeric, 2) as avg_ms,
  MIN(latency_ms) as min_ms,
  MAX(latency_ms) as max_ms,
  COUNT(*) FILTER (WHERE cache_hit) as cache_hits
FROM ai_responses
WHERE latency_ms IS NOT NULL
GROUP BY provider, model
ORDER BY avg_ms;

\echo ''

-- ============================================================
-- 6. Cache Performance
-- ============================================================

\echo '============================================================'
\echo '6. Cache Performance'
\echo '============================================================'
\echo ''

SELECT
  COUNT(*) as total_queries,
  COUNT(*) FILTER (WHERE cache_hit) as cache_hits,
  COUNT(*) FILTER (WHERE NOT cache_hit) as cache_misses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cache_hit) / NULLIF(COUNT(*), 0), 2) as hit_rate_percent,
  ROUND(AVG(latency_ms) FILTER (WHERE cache_hit)::numeric, 2) as avg_cache_hit_ms,
  ROUND(AVG(latency_ms) FILTER (WHERE NOT cache_hit)::numeric, 2) as avg_cache_miss_ms
FROM ai_responses;

\echo ''

-- ============================================================
-- 7. Fast Responses (< 100ms)
-- ============================================================

\echo '============================================================'
\echo '7. Fast Responses (< 100ms)'
\echo '============================================================'
\echo ''

SELECT * FROM fast_responses LIMIT 10;

\echo ''

-- ============================================================
-- 8. Slow Responses (> 5 seconds)
-- ============================================================

\echo '============================================================'
\echo '8. Slow Responses (> 5 seconds)'
\echo '============================================================'
\echo ''

SELECT * FROM slow_responses LIMIT 10;

\echo ''

-- ============================================================
-- 9. Agent Performance (last 24 hours)
-- ============================================================

\echo '============================================================'
\echo '9. Agent Performance (last 24 hours)'
\echo '============================================================'
\echo ''

SELECT * FROM agent_performance;

\echo ''

-- ============================================================
-- 10. Recent Activity
-- ============================================================

\echo '============================================================'
\echo '10. Recent Activity'
\echo '============================================================'
\echo ''

SELECT
  request_timestamp,
  ROUND(latency_ms::numeric, 0) as latency_ms,
  cache_hit,
  provider,
  model,
  LEFT(query_text, 50) as query_preview
FROM ai_responses
ORDER BY request_timestamp DESC
LIMIT 10;

\echo ''

-- ============================================================
-- 11. Time Differential Verification
-- ============================================================

\echo '============================================================'
\echo '11. Time Differential Verification'
\echo '============================================================'
\echo ''

-- Verify calculated latency matches stored latency
SELECT
  id,
  request_timestamp,
  response_timestamp,
  latency_ms as stored_latency,
  EXTRACT(EPOCH FROM (response_timestamp - request_timestamp)) * 1000 as calculated_latency,
  ABS(latency_ms - EXTRACT(EPOCH FROM (response_timestamp - request_timestamp)) * 1000) as diff
FROM ai_responses
WHERE response_timestamp IS NOT NULL
  AND latency_ms IS NOT NULL
ORDER BY diff DESC
LIMIT 10;

\echo ''
\echo 'Note: diff should be close to 0 (calculated matches stored)'
\echo ''

-- ============================================================
-- Summary
-- ============================================================

\echo '============================================================'
\echo 'VERIFICATION SUMMARY'
\echo '============================================================'
\echo ''
\echo 'If you see:'
\echo '  ✓ Columns: request_timestamp, response_timestamp, latency_ms exist'
\echo '  ✓ Indexes: idx_responses_request_time, idx_responses_latency exist'
\echo '  ✓ Views: fast_responses, slow_responses, agent_performance exist'
\echo '  ✓ Data: Queries have timing information'
\echo '  ✓ Cache: Hit rate percentage is calculated'
\echo ''
\echo 'Then your CalOS database is properly configured!'
\echo ''
\echo 'To test in local mode:'
\echo '  1. Start Ollama: ollama serve'
\echo '  2. Start router: node router.js --local'
\echo '  3. Make query: curl -X POST http://localhost:5001/agent -H "Content-Type: application/json" -d'"'"'{"input": "@ollama test"}'"'"
\echo '  4. Re-run this script to see new data'
\echo '============================================================'
