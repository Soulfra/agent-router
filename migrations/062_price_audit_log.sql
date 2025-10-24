-- Migration 062: Price Audit Log
-- Created: 2025-10-20
--
-- Purpose: Track suspicious or low-confidence price data for forensic analysis
--
-- This table logs price data that fails verification checks, allowing:
-- - Forensic analysis of data quality issues
-- - Detection of API manipulation or outages
-- - Historical tracking of price anomalies
-- - Debugging data integrity problems

CREATE TABLE IF NOT EXISTS price_audit_log (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  source VARCHAR(50) NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  verification_status VARCHAR(20) NOT NULL CHECK (verification_status IN ('verified', 'rejected', 'warning')),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_data JSONB NOT NULL,
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_price_audit_symbol ON price_audit_log(symbol);
CREATE INDEX idx_price_audit_logged_at ON price_audit_log(logged_at DESC);
CREATE INDEX idx_price_audit_status ON price_audit_log(verification_status);
CREATE INDEX idx_price_audit_confidence ON price_audit_log(confidence_score);

-- Composite index for common queries (symbol + time range)
CREATE INDEX idx_price_audit_symbol_time ON price_audit_log(symbol, logged_at DESC);

-- Comment on table
COMMENT ON TABLE price_audit_log IS 'Audit log for suspicious or low-confidence price data from external APIs';

-- Comment on columns
COMMENT ON COLUMN price_audit_log.confidence_score IS 'Confidence score from PriceVerifier (0-100, where 70+ is verified)';
COMMENT ON COLUMN price_audit_log.verification_status IS 'Verification result: verified (70+), warning (50-69), rejected (<50)';
COMMENT ON COLUMN price_audit_log.issues IS 'Array of verification issues (bounds check, rate-of-change, timestamp, source)';
COMMENT ON COLUMN price_audit_log.raw_data IS 'Complete price data snapshot for forensic analysis';

-- View for recent suspicious prices
CREATE OR REPLACE VIEW recent_suspicious_prices AS
SELECT
  symbol,
  price,
  source,
  confidence_score,
  verification_status,
  issues,
  logged_at,
  NOW() - logged_at AS age
FROM price_audit_log
WHERE logged_at > NOW() - INTERVAL '7 days'
ORDER BY logged_at DESC;

-- View for price data quality metrics
CREATE OR REPLACE VIEW price_quality_metrics AS
SELECT
  symbol,
  COUNT(*) AS total_suspicious_events,
  AVG(confidence_score) AS avg_confidence,
  MIN(confidence_score) AS min_confidence,
  MAX(logged_at) AS last_suspicious_event,
  COUNT(*) FILTER (WHERE verification_status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE verification_status = 'warning') AS warning_count
FROM price_audit_log
WHERE logged_at > NOW() - INTERVAL '30 days'
GROUP BY symbol
ORDER BY total_suspicious_events DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT ON price_audit_log TO your_app_user;
-- GRANT SELECT ON recent_suspicious_prices TO your_app_user;
-- GRANT SELECT ON price_quality_metrics TO your_app_user;
