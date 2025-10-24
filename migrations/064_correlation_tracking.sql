-- Migration 064: Price Correlation Tracking
-- Created: 2025-10-20
--
-- Purpose: Track correlations between different assets to identify relationships
-- like inverse correlations (BTC vs Gold) or positive correlations (tech stocks).

-- ============================================================
-- Table: price_correlations
-- ============================================================

CREATE TABLE IF NOT EXISTS price_correlations (
  id BIGSERIAL PRIMARY KEY,
  symbol1 VARCHAR(20) NOT NULL,
  symbol2 VARCHAR(20) NOT NULL,
  correlation DECIMAL(10, 4) NOT NULL,
  strength VARCHAR(20) NOT NULL,  -- 'strong', 'moderate', 'weak'
  relationship VARCHAR(20) NOT NULL,  -- 'positive', 'inverse', 'neutral'
  data_points INTEGER NOT NULL,
  timeframe VARCHAR(10) NOT NULL,  -- '24h', '7d', '30d'
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_correlations_symbols ON price_correlations(symbol1, symbol2);
CREATE INDEX IF NOT EXISTS idx_correlations_time ON price_correlations(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_correlations_timeframe ON price_correlations(timeframe, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_correlations_strength ON price_correlations(strength, ABS(correlation) DESC);

-- ============================================================
-- Views
-- ============================================================

-- View: Latest correlations for each pair
CREATE OR REPLACE VIEW latest_correlations AS
SELECT DISTINCT ON (symbol1, symbol2, timeframe)
  symbol1,
  symbol2,
  correlation,
  strength,
  relationship,
  data_points,
  timeframe,
  calculated_at,
  CASE
    WHEN ABS(correlation) >= 0.7 THEN 'Very ' ||
      CASE WHEN correlation > 0 THEN 'correlated' ELSE 'inversely correlated' END
    WHEN ABS(correlation) >= 0.4 THEN 'Moderately ' ||
      CASE WHEN correlation > 0 THEN 'correlated' ELSE 'inversely correlated' END
    ELSE 'Weakly correlated'
  END AS interpretation
FROM price_correlations
ORDER BY symbol1, symbol2, timeframe, calculated_at DESC;

-- View: Strong correlations (|r| > 0.7)
CREATE OR REPLACE VIEW strong_correlations AS
SELECT
  symbol1,
  symbol2,
  correlation,
  strength,
  relationship,
  timeframe,
  calculated_at,
  CASE
    WHEN relationship = 'positive' THEN 'Move together'
    WHEN relationship = 'inverse' THEN 'Move opposite'
    ELSE 'No clear pattern'
  END AS behavior
FROM price_correlations
WHERE ABS(correlation) >= 0.7
ORDER BY ABS(correlation) DESC, calculated_at DESC;

-- View: Inverse correlations (classic hedges)
CREATE OR REPLACE VIEW inverse_correlations AS
SELECT
  symbol1,
  symbol2,
  correlation,
  strength,
  data_points,
  timeframe,
  calculated_at,
  ABS(correlation) as inverse_strength
FROM price_correlations
WHERE correlation < -0.4
ORDER BY correlation ASC, calculated_at DESC;

-- View: BTC vs Traditional Assets
CREATE OR REPLACE VIEW btc_correlations AS
SELECT
  CASE
    WHEN symbol1 = 'BTC' THEN symbol2
    WHEN symbol2 = 'BTC' THEN symbol1
    ELSE NULL
  END AS asset,
  correlation,
  strength,
  relationship,
  timeframe,
  calculated_at
FROM price_correlations
WHERE (symbol1 = 'BTC' OR symbol2 = 'BTC')
  AND timeframe = '24h'
ORDER BY calculated_at DESC;

-- ============================================================
-- Functions
-- ============================================================

-- Function: Clean old correlation data (keep last 90 days)
CREATE OR REPLACE FUNCTION clean_old_correlations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM price_correlations
  WHERE calculated_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get correlation trend (improving or weakening)
CREATE OR REPLACE FUNCTION get_correlation_trend(
  p_symbol1 VARCHAR,
  p_symbol2 VARCHAR,
  p_timeframe VARCHAR DEFAULT '24h',
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  current_correlation DECIMAL,
  avg_correlation DECIMAL,
  trend VARCHAR,
  data_points INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_correlations AS (
    SELECT correlation, calculated_at
    FROM price_correlations
    WHERE (symbol1 = p_symbol1 AND symbol2 = p_symbol2)
       OR (symbol1 = p_symbol2 AND symbol2 = p_symbol1)
    AND timeframe = p_timeframe
    AND calculated_at >= NOW() - INTERVAL '1 day' * p_days
    ORDER BY calculated_at DESC
  )
  SELECT
    (SELECT correlation FROM recent_correlations ORDER BY calculated_at DESC LIMIT 1) as current_correlation,
    AVG(correlation)::DECIMAL(10,4) as avg_correlation,
    CASE
      WHEN (SELECT correlation FROM recent_correlations ORDER BY calculated_at DESC LIMIT 1) >
           AVG(correlation) + 0.1 THEN 'strengthening'
      WHEN (SELECT correlation FROM recent_correlations ORDER BY calculated_at DESC LIMIT 1) <
           AVG(correlation) - 0.1 THEN 'weakening'
      ELSE 'stable'
    END as trend,
    COUNT(*)::INTEGER as data_points
  FROM recent_correlations;
END;
$$ LANGUAGE plpgsql;

-- Function: Find best hedge for an asset
CREATE OR REPLACE FUNCTION find_hedge_for_asset(p_symbol VARCHAR)
RETURNS TABLE(
  hedge_symbol VARCHAR,
  correlation DECIMAL,
  strength VARCHAR,
  timeframe VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (
    CASE
      WHEN symbol1 = p_symbol THEN symbol2
      ELSE symbol1
    END
  )
    CASE
      WHEN symbol1 = p_symbol THEN symbol2
      ELSE symbol1
    END as hedge_symbol,
    correlation,
    strength,
    timeframe
  FROM price_correlations
  WHERE (symbol1 = p_symbol OR symbol2 = p_symbol)
    AND correlation < -0.4  -- Inverse correlation
    AND timeframe = '24h'
  ORDER BY
    CASE
      WHEN symbol1 = p_symbol THEN symbol2
      ELSE symbol1
    END,
    calculated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE price_correlations IS 'Tracks price correlations between asset pairs over different timeframes';
COMMENT ON COLUMN price_correlations.correlation IS 'Pearson correlation coefficient (-1 to 1)';
COMMENT ON COLUMN price_correlations.strength IS 'strong (|r|>0.7), moderate (|r|>0.4), or weak';
COMMENT ON COLUMN price_correlations.relationship IS 'positive (r>0.4), inverse (r<-0.4), or neutral';

COMMENT ON VIEW latest_correlations IS 'Most recent correlation for each asset pair and timeframe';
COMMENT ON VIEW strong_correlations IS 'Correlations with |r| > 0.7 (strong relationships)';
COMMENT ON VIEW inverse_correlations IS 'Inverse correlations (r < -0.4) useful for hedging';
COMMENT ON VIEW btc_correlations IS 'BTC correlation with all other tracked assets';

-- ============================================================
-- Initial Data / Examples
-- ============================================================

-- Note: Correlation data will be populated by the CorrelationTracker class
-- The tracker will automatically calculate correlations for these pairs:
--
-- Crypto vs Commodities (inverse expected):
--   BTC vs GOLD, ETH vs GOLD, BTC vs SILVER
--
-- Crypto pairs (positive expected):
--   BTC vs ETH, BTC vs SOL
--
-- Tech stocks (positive expected):
--   AAPL vs MSFT, GOOGL vs MSFT, TSLA vs BTC

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 064 Complete - Price Correlation Tracking';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New tables:';
  RAISE NOTICE '  - price_correlations (correlation data storage)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views:';
  RAISE NOTICE '  - latest_correlations (most recent for each pair)';
  RAISE NOTICE '  - strong_correlations (|r| > 0.7)';
  RAISE NOTICE '  - inverse_correlations (useful for hedging)';
  RAISE NOTICE '  - btc_correlations (BTC vs all assets)';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - clean_old_correlations() - cleanup old data';
  RAISE NOTICE '  - get_correlation_trend() - trend analysis';
  RAISE NOTICE '  - find_hedge_for_asset() - find inverse correlations';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT * FROM latest_correlations WHERE timeframe = ''24h'';';
  RAISE NOTICE '  SELECT * FROM inverse_correlations WHERE symbol1 = ''BTC'';';
  RAISE NOTICE '  SELECT * FROM find_hedge_for_asset(''BTC'');';
  RAISE NOTICE '  SELECT * FROM get_correlation_trend(''BTC'', ''GOLD'', ''24h'', 7);';
  RAISE NOTICE '============================================================';
END $$;
