-- Migration: Add pricing and market data tables
-- Purpose: Track cryptocurrency and stock prices with caching
-- Date: 2025-10-11

-- ============================================================
-- Step 1: Price Cache Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(100) NOT NULL UNIQUE,
  data JSONB NOT NULL,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_cache_key ON price_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_price_cache_time ON price_cache(cached_at DESC);

-- ============================================================
-- Step 2: Price History Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,  -- 'crypto' or 'stock'
  price DECIMAL(20, 8) NOT NULL,
  change_24h DECIMAL(10, 4),
  volume_24h DECIMAL(20, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  source VARCHAR(50),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_type ON price_history(asset_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history(recorded_at DESC);

-- ============================================================
-- Step 3: Price Alerts Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,  -- 'crypto' or 'stock'
  condition VARCHAR(10) NOT NULL,  -- 'above' or 'below'
  target_price DECIMAL(20, 8) NOT NULL,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notification_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol, triggered);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id, triggered);

-- ============================================================
-- Step 4: Watchlist Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_watchlist (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,  -- 'crypto' or 'stock'
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(user_id, symbol, asset_type)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON price_watchlist(user_id);

-- ============================================================
-- Step 5: Views for Easy Access
-- ============================================================

-- Latest prices view
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (symbol, asset_type)
  symbol,
  asset_type,
  price,
  change_24h,
  volume_24h,
  currency,
  source,
  recorded_at
FROM price_history
ORDER BY symbol, asset_type, recorded_at DESC;

-- Active price alerts view
CREATE OR REPLACE VIEW active_price_alerts AS
SELECT
  id,
  user_id,
  symbol,
  asset_type,
  condition,
  target_price,
  created_at
FROM price_alerts
WHERE triggered = FALSE
ORDER BY created_at DESC;

-- Price performance view (last 24 hours)
CREATE OR REPLACE VIEW price_performance_24h AS
SELECT
  symbol,
  asset_type,
  MAX(price) as high_24h,
  MIN(price) as low_24h,
  (SELECT price FROM price_history ph2
   WHERE ph2.symbol = ph1.symbol AND ph2.asset_type = ph1.asset_type
   ORDER BY recorded_at DESC LIMIT 1) as current_price,
  ROUND(((MAX(price) - MIN(price)) / MIN(price) * 100)::numeric, 2) as volatility_percent,
  COUNT(*) as data_points
FROM price_history ph1
WHERE recorded_at > NOW() - INTERVAL '24 hours'
GROUP BY symbol, asset_type
ORDER BY volatility_percent DESC;

-- ============================================================
-- Step 6: Functions
-- ============================================================

-- Function to clean old cache (keep last 1000 entries)
CREATE OR REPLACE FUNCTION clean_old_price_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM price_cache
  WHERE id NOT IN (
    SELECT id FROM price_cache
    ORDER BY cached_at DESC
    LIMIT 1000
  );
END;
$$ LANGUAGE plpgsql;

-- Function to record price to history
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
      recorded_at
    )
    VALUES (
      NEW.data->>'symbol',
      CASE
        WHEN NEW.cache_key LIKE 'crypto_%' THEN 'crypto'
        WHEN NEW.cache_key LIKE 'stock_%' THEN 'stock'
        ELSE 'unknown'
      END,
      (NEW.data->>'price')::decimal,
      (NEW.data->>'change24h')::decimal,
      (NEW.data->>'volume24h')::decimal,
      COALESCE(NEW.data->>'currency', 'USD'),
      NEW.data->>'source',
      CURRENT_TIMESTAMP
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically record to history
CREATE TRIGGER trigger_record_price_history
  AFTER INSERT OR UPDATE ON price_cache
  FOR EACH ROW
  EXECUTE FUNCTION record_price_to_history();

-- ============================================================
-- Step 7: Initial Data / Examples
-- ============================================================

-- Add some common watchlist items (optional)
-- INSERT INTO price_watchlist (user_id, symbol, asset_type, notes)
-- VALUES
--   ('system', 'BTC', 'crypto', 'Bitcoin'),
--   ('system', 'ETH', 'crypto', 'Ethereum'),
--   ('system', 'AAPL', 'stock', 'Apple Inc.'),
--   ('system', 'GOOGL', 'stock', 'Alphabet Inc.');

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 002 Complete - Pricing Tables';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - price_cache (caches API responses)';
  RAISE NOTICE '  - price_history (stores price over time)';
  RAISE NOTICE '  - price_alerts (user price alerts)';
  RAISE NOTICE '  - price_watchlist (user watchlists)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views created:';
  RAISE NOTICE '  - latest_prices (most recent price for each asset)';
  RAISE NOTICE '  - active_price_alerts (pending alerts)';
  RAISE NOTICE '  - price_performance_24h (24hr price stats)';
  RAISE NOTICE '';
  RAISE NOTICE 'Price tracking enabled! Use:';
  RAISE NOTICE '  GET /api/price/btc';
  RAISE NOTICE '  GET /api/price/eth';
  RAISE NOTICE '  GET /api/price/stock/AAPL';
  RAISE NOTICE '============================================================';
END $$;
