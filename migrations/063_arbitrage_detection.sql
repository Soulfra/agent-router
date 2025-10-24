-- Migration 063: Arbitrage Detection System
-- Created: 2025-10-20
--
-- Purpose: Track price discrepancies across multiple sources for
-- arbitrage opportunities and data quality monitoring.

-- ============================================================
-- Table: arbitrage_opportunities
-- ============================================================

CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  source1 VARCHAR(50) NOT NULL,
  price1 DECIMAL(20, 8) NOT NULL,
  source2 VARCHAR(50) NOT NULL,
  price2 DECIMAL(20, 8) NOT NULL,
  spread_absolute DECIMAL(20, 8) NOT NULL,
  spread_percent DECIMAL(10, 4) NOT NULL,
  is_data_error BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_arbitrage_symbol ON arbitrage_opportunities(symbol);
CREATE INDEX idx_arbitrage_detected_at ON arbitrage_opportunities(detected_at DESC);
CREATE INDEX idx_arbitrage_spread ON arbitrage_opportunities(spread_percent DESC);
CREATE INDEX idx_arbitrage_error ON arbitrage_opportunities(is_data_error, detected_at DESC);

-- ============================================================
-- Table: price_sources
-- ============================================================

CREATE TABLE IF NOT EXISTS price_sources (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL UNIQUE,
  total_fetches INTEGER DEFAULT 0,
  successful_fetches INTEGER DEFAULT 0,
  failed_fetches INTEGER DEFAULT 0,
  avg_spread_percent DECIMAL(10, 4) DEFAULT 0,
  reliability_score DECIMAL(5, 2) DEFAULT 100,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_sources_reliability ON price_sources(reliability_score DESC);
CREATE INDEX idx_sources_updated ON price_sources(last_updated DESC);

-- ============================================================
-- Views
-- ============================================================

-- View: Recent arbitrage opportunities (last 24 hours)
CREATE OR REPLACE VIEW recent_arbitrage AS
SELECT
  symbol,
  source1,
  price1,
  source2,
  price2,
  spread_absolute,
  spread_percent,
  is_data_error,
  detected_at,
  NOW() - detected_at AS age
FROM arbitrage_opportunities
WHERE detected_at > NOW() - INTERVAL '24 hours'
ORDER BY spread_percent DESC, detected_at DESC;

-- View: Arbitrage summary by symbol
CREATE OR REPLACE VIEW arbitrage_summary AS
SELECT
  symbol,
  COUNT(*) AS total_opportunities,
  AVG(spread_percent) AS avg_spread,
  MAX(spread_percent) AS max_spread,
  MIN(spread_percent) AS min_spread,
  MAX(detected_at) AS last_opportunity,
  COUNT(*) FILTER (WHERE is_data_error = TRUE) AS data_errors
FROM arbitrage_opportunities
WHERE detected_at > NOW() - INTERVAL '7 days'
GROUP BY symbol
ORDER BY total_opportunities DESC;

-- View: Source reliability ranking
CREATE OR REPLACE VIEW source_reliability_ranking AS
SELECT
  source_name,
  total_fetches,
  successful_fetches,
  failed_fetches,
  ROUND((successful_fetches::float / NULLIF(total_fetches, 0) * 100)::numeric, 2) AS success_rate,
  avg_spread_percent,
  reliability_score,
  CASE
    WHEN reliability_score >= 95 THEN 'Excellent'
    WHEN reliability_score >= 85 THEN 'Good'
    WHEN reliability_score >= 70 THEN 'Fair'
    ELSE 'Poor'
  END AS rating,
  last_updated
FROM price_sources
ORDER BY reliability_score DESC;

-- ============================================================
-- Functions
-- ============================================================

-- Function: Clean old arbitrage opportunities (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_arbitrage()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM arbitrage_opportunities
  WHERE detected_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get best source for a symbol
CREATE OR REPLACE FUNCTION get_best_source(p_symbol VARCHAR)
RETURNS TABLE(
  source_name VARCHAR,
  reliability_score DECIMAL,
  recent_spread DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.source_name,
    ps.reliability_score,
    COALESCE(recent_arb.avg_spread, 0) AS recent_spread
  FROM price_sources ps
  LEFT JOIN (
    SELECT
      source1 AS source_name,
      AVG(spread_percent) AS avg_spread
    FROM arbitrage_opportunities
    WHERE symbol = p_symbol
      AND detected_at > NOW() - INTERVAL '24 hours'
    GROUP BY source1
  ) recent_arb ON ps.source_name = recent_arb.source_name
  ORDER BY ps.reliability_score DESC, recent_spread ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Initial data / seed
-- ============================================================

-- Register common price sources
INSERT INTO price_sources (source_name, reliability_score) VALUES
  ('coingecko', 100),
  ('yahoo_finance', 100),
  ('alpha_vantage', 100),
  ('cryptocompare', 100),
  ('metals_api', 100)
ON CONFLICT (source_name) DO NOTHING;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE arbitrage_opportunities IS 'Records price discrepancies between sources that may indicate arbitrage opportunities or data errors';
COMMENT ON TABLE price_sources IS 'Tracks reliability and performance of each price data source';

COMMENT ON COLUMN arbitrage_opportunities.spread_percent IS 'Percentage difference: (price2 - price1) / price1 * 100';
COMMENT ON COLUMN arbitrage_opportunities.is_data_error IS 'TRUE if spread > 20% (likely bad data)';
COMMENT ON COLUMN price_sources.reliability_score IS 'Calculated as: success_rate - (avg_spread / 10)';

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 063 Complete - Arbitrage Detection System';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New tables:';
  RAISE NOTICE '  - arbitrage_opportunities (price discrepancies)';
  RAISE NOTICE '  - price_sources (source reliability tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views:';
  RAISE NOTICE '  - recent_arbitrage (last 24 hours)';
  RAISE NOTICE '  - arbitrage_summary (summary by symbol)';
  RAISE NOTICE '  - source_reliability_ranking';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT * FROM recent_arbitrage WHERE spread_percent > 2;';
  RAISE NOTICE '  SELECT * FROM source_reliability_ranking;';
  RAISE NOTICE '  SELECT * FROM arbitrage_summary;';
  RAISE NOTICE '============================================================';
END $$;
