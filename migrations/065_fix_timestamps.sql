-- Migration 065: Fix Timestamp Architecture
-- Created: 2025-10-20
--
-- Purpose: Separate source timestamps (from API) from ingestion timestamps (system time)
-- to avoid issues with system clock being wrong (currently set to 2025 instead of 2024).
--
-- CRITICAL: System clock is 1 year ahead. We should trust API timestamps, not system time.

-- ============================================================
-- Step 1: Add new timestamp columns to price_history
-- ============================================================

-- Add source_timestamp (when the price was created by the API)
ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMP;

-- Add ingested_at (when WE received the data - for debugging only)
ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- Step 2: Backfill existing data
-- ============================================================

-- Assume existing recorded_at is actually source_timestamp
-- (because we've been using API timestamps, just storing them wrong)
UPDATE price_history
SET source_timestamp = recorded_at,
    ingested_at = recorded_at
WHERE source_timestamp IS NULL;

-- ============================================================
-- Step 3: Add indexes for new timestamp columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_price_history_source_timestamp ON price_history(source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_source_time ON price_history(symbol, source_timestamp DESC);

-- ============================================================
-- Step 4: Update views to use source_timestamp
-- ============================================================

-- Drop and recreate latest_prices view
DROP VIEW IF EXISTS latest_prices CASCADE;

CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (symbol, asset_type)
  symbol,
  asset_type,
  price,
  change_24h,
  volume_24h,
  currency,
  source,
  source_timestamp AS recorded_at,  -- Use source timestamp
  ingested_at
FROM price_history
ORDER BY symbol, asset_type, source_timestamp DESC;

-- Drop and recreate price_performance_24h view
DROP VIEW IF EXISTS price_performance_24h CASCADE;

CREATE OR REPLACE VIEW price_performance_24h AS
SELECT
  symbol,
  asset_type,
  MAX(price) as high_24h,
  MIN(price) as low_24h,
  (SELECT price FROM price_history ph2
   WHERE ph2.symbol = ph1.symbol AND ph2.asset_type = ph1.asset_type
   ORDER BY source_timestamp DESC LIMIT 1) as current_price,
  ROUND(((MAX(price) - MIN(price)) / MIN(price) * 100)::numeric, 2) as volatility_percent,
  COUNT(*) as data_points
FROM price_history ph1
WHERE source_timestamp > NOW() - INTERVAL '24 hours'  -- Use source_timestamp
GROUP BY symbol, asset_type
ORDER BY volatility_percent DESC;

-- ============================================================
-- Step 5: Update trigger function to use source_timestamp
-- ============================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_record_price_history ON price_cache;

-- Update trigger function to extract and use source timestamp
CREATE OR REPLACE FUNCTION record_price_to_history()
RETURNS trigger AS $$
BEGIN
  -- Extract data from cache and insert to history
  IF (NEW.data->>'symbol' IS NOT NULL) THEN
    INSERT INTO price_history (
      symbol,
      asset_type,
      price,
      change_24h,
      volume_24h,
      currency,
      source,
      source_timestamp,  -- NEW: Use timestamp from API
      ingested_at,       -- NEW: When we received it
      recorded_at        -- Keep for backwards compatibility
    )
    VALUES (
      NEW.data->>'symbol',
      CASE
        WHEN NEW.cache_key LIKE 'crypto_%' THEN 'crypto'
        WHEN NEW.cache_key LIKE 'stock_%' THEN 'stock'
        WHEN NEW.cache_key LIKE 'commodity_%' THEN 'commodity'
        ELSE 'unknown'
      END,
      (NEW.data->>'price')::decimal,
      (NEW.data->>'change24h')::decimal,
      (NEW.data->>'volume24h')::decimal,
      COALESCE(NEW.data->>'currency', 'USD'),
      NEW.data->>'source',
      -- Extract source timestamp from lastUpdate field in JSON
      CASE
        WHEN NEW.data->>'lastUpdate' IS NOT NULL THEN (NEW.data->>'lastUpdate')::timestamp
        ELSE CURRENT_TIMESTAMP
      END,
      CURRENT_TIMESTAMP,  -- ingested_at
      CURRENT_TIMESTAMP   -- recorded_at (keep for backwards compat)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_record_price_history
  AFTER INSERT OR UPDATE ON price_cache
  FOR EACH ROW
  EXECUTE FUNCTION record_price_to_history();

-- ============================================================
-- Step 6: Create view for clock skew detection
-- ============================================================

CREATE OR REPLACE VIEW clock_skew_analysis AS
SELECT
  symbol,
  source,
  source_timestamp,
  ingested_at,
  EXTRACT(EPOCH FROM (ingested_at - source_timestamp)) AS skew_seconds,
  CASE
    WHEN ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 31536000 THEN '⚠️ MAJOR SKEW (>1 year)'
    WHEN ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 86400 THEN '⚠️ Large skew (>1 day)'
    WHEN ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 3600 THEN 'Warning (>1 hour)'
    WHEN ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 300 THEN 'Notice (>5 min)'
    ELSE '✅ OK'
  END AS skew_status
FROM price_history
WHERE source_timestamp IS NOT NULL AND ingested_at IS NOT NULL
ORDER BY ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) DESC
LIMIT 100;

-- ============================================================
-- Step 7: Helper function to get price with correct timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_price(p_symbol VARCHAR, p_asset_type VARCHAR DEFAULT NULL)
RETURNS TABLE(
  symbol VARCHAR,
  asset_type VARCHAR,
  price DECIMAL,
  source VARCHAR,
  timestamp TIMESTAMP,
  age_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.symbol,
    ph.asset_type,
    ph.price,
    ph.source,
    ph.source_timestamp AS timestamp,
    EXTRACT(EPOCH FROM (NOW() - ph.source_timestamp))::INTEGER AS age_seconds
  FROM price_history ph
  WHERE ph.symbol = p_symbol
    AND (p_asset_type IS NULL OR ph.asset_type = p_asset_type)
  ORDER BY ph.source_timestamp DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 8: Comments
-- ============================================================

COMMENT ON COLUMN price_history.source_timestamp IS 'Timestamp from the API source (trusted time)';
COMMENT ON COLUMN price_history.ingested_at IS 'When WE received the data (system time - may be wrong)';
COMMENT ON COLUMN price_history.recorded_at IS 'DEPRECATED - kept for backwards compatibility, use source_timestamp instead';

COMMENT ON VIEW clock_skew_analysis IS 'Shows difference between API timestamps and system time to detect clock issues';

-- ============================================================
-- Verification
-- ============================================================

DO $$
DECLARE
  skew_count INTEGER;
  major_skew_count INTEGER;
BEGIN
  -- Count records with significant clock skew
  SELECT COUNT(*) INTO skew_count
  FROM price_history
  WHERE ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 300;

  SELECT COUNT(*) INTO major_skew_count
  FROM price_history
  WHERE ABS(EXTRACT(EPOCH FROM (ingested_at - source_timestamp))) > 31536000;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 065 Complete - Timestamp Architecture Fixed';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Added source_timestamp column (from API)';
  RAISE NOTICE '  - Added ingested_at column (system time)';
  RAISE NOTICE '  - Updated views to use source_timestamp';
  RAISE NOTICE '  - Updated trigger to extract API timestamps';
  RAISE NOTICE '';
  RAISE NOTICE 'Clock Skew Analysis:';
  RAISE NOTICE '  - Records with >5min skew: %', skew_count;
  RAISE NOTICE '  - Records with >1 year skew: % (SYSTEM CLOCK ISSUE!)', major_skew_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT * FROM clock_skew_analysis;';
  RAISE NOTICE '  SELECT * FROM get_current_price(''BTC'');';
  RAISE NOTICE '  SELECT * FROM latest_prices;';
  RAISE NOTICE '============================================================';
END $$;
