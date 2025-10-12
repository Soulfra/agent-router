-- Migration: Add algo trading and market data tables
-- Purpose: Enable algorithmic trading, technical analysis, and backtesting
-- Date: 2025-10-11

-- ============================================================
-- Step 1: Price Candles (OHLCV) Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_candles (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,  -- 'crypto' or 'stock'
  timeframe VARCHAR(10) NOT NULL,   -- '1m', '5m', '15m', '1h', '4h', '1d', '1w'

  -- OHLCV data
  open_price DECIMAL(20, 8) NOT NULL,
  high_price DECIMAL(20, 8) NOT NULL,
  low_price DECIMAL(20, 8) NOT NULL,
  close_price DECIMAL(20, 8) NOT NULL,
  volume DECIMAL(20, 2),

  -- Additional metrics
  trades_count INTEGER,
  change_percent DECIMAL(10, 4),

  -- Timing
  candle_start TIMESTAMP NOT NULL,
  candle_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure uniqueness per symbol/timeframe/period
  UNIQUE(symbol, asset_type, timeframe, candle_start)
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_time ON price_candles(symbol, timeframe, candle_start DESC);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON price_candles(timeframe, candle_start DESC);
CREATE INDEX IF NOT EXISTS idx_candles_asset ON price_candles(asset_type, candle_start DESC);

-- ============================================================
-- Step 2: Technical Indicators Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_indicators (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,   -- '1m', '5m', '1h', '1d', etc.

  -- Moving Averages
  sma_9 DECIMAL(20, 8),    -- Simple Moving Average (9 periods)
  sma_20 DECIMAL(20, 8),   -- Simple Moving Average (20 periods)
  sma_50 DECIMAL(20, 8),   -- Simple Moving Average (50 periods)
  sma_200 DECIMAL(20, 8),  -- Simple Moving Average (200 periods)
  ema_9 DECIMAL(20, 8),    -- Exponential Moving Average (9 periods)
  ema_20 DECIMAL(20, 8),   -- Exponential Moving Average (20 periods)

  -- Momentum Indicators
  rsi_14 DECIMAL(10, 4),   -- Relative Strength Index (14 periods)
  macd DECIMAL(20, 8),     -- MACD line
  macd_signal DECIMAL(20, 8),  -- MACD signal line
  macd_histogram DECIMAL(20, 8), -- MACD histogram

  -- Volatility Indicators
  bb_upper DECIMAL(20, 8),  -- Bollinger Band Upper
  bb_middle DECIMAL(20, 8), -- Bollinger Band Middle (SMA)
  bb_lower DECIMAL(20, 8),  -- Bollinger Band Lower
  atr_14 DECIMAL(20, 8),    -- Average True Range (14 periods)

  -- Volume Indicators
  volume_sma_20 DECIMAL(20, 2),  -- 20-period volume average
  obv DECIMAL(30, 2),       -- On-Balance Volume

  -- Timing
  calculated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(symbol, asset_type, timeframe, calculated_at)
);

CREATE INDEX IF NOT EXISTS idx_indicators_symbol_time ON price_indicators(symbol, timeframe, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_rsi ON price_indicators(symbol, rsi_14, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_timeframe ON price_indicators(timeframe, calculated_at DESC);

-- ============================================================
-- Step 3: Market Events Table
-- ============================================================

CREATE TABLE IF NOT EXISTS price_events (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,
  event_type VARCHAR(50) NOT NULL,  -- 'sma_cross', 'rsi_oversold', 'breakout', 'volume_spike', etc.

  -- Event details
  description TEXT,
  severity VARCHAR(20),  -- 'low', 'medium', 'high', 'critical'

  -- Metadata
  metadata JSONB,  -- Store event-specific data (e.g., {"from": 45.2, "to": 54.8})

  -- Timing
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,  -- Optional: when event is no longer relevant

  -- Actions
  notified BOOLEAN DEFAULT FALSE,
  acknowledged BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_events_symbol ON price_events(symbol, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON price_events(event_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_unnotified ON price_events(notified, detected_at DESC) WHERE notified = FALSE;
CREATE INDEX IF NOT EXISTS idx_events_severity ON price_events(severity, detected_at DESC);

-- ============================================================
-- Step 4: Backtesting Results Table
-- ============================================================

CREATE TABLE IF NOT EXISTS backtest_results (
  id SERIAL PRIMARY KEY,
  strategy_name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,

  -- Backtest parameters
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  initial_capital DECIMAL(20, 2) NOT NULL,

  -- Performance metrics
  final_capital DECIMAL(20, 2),
  total_return_percent DECIMAL(10, 4),
  total_trades INTEGER,
  winning_trades INTEGER,
  losing_trades INTEGER,
  win_rate DECIMAL(10, 4),
  max_drawdown DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),

  -- Trade log
  trades JSONB,  -- Array of trade objects

  -- Execution
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INTEGER,

  -- Notes
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_name, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_symbol ON backtest_results(symbol, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_performance ON backtest_results(total_return_percent DESC);

-- ============================================================
-- Step 5: Data Quality Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS data_quality_log (
  id SERIAL PRIMARY KEY,
  check_type VARCHAR(50) NOT NULL,  -- 'gap_detection', 'outlier_detection', 'backfill', etc.
  symbol VARCHAR(20),
  asset_type VARCHAR(20),

  -- Check results
  status VARCHAR(20) NOT NULL,  -- 'pass', 'warning', 'fail'
  issues_found INTEGER DEFAULT 0,
  issues_fixed INTEGER DEFAULT 0,

  -- Details
  details JSONB,  -- Store specific issues found

  -- Timing
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quality_symbol ON data_quality_log(symbol, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_type ON data_quality_log(check_type, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_status ON data_quality_log(status, checked_at DESC);

-- ============================================================
-- Step 6: Scheduler Jobs Log
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduler_log (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(50) NOT NULL,  -- 'candle_aggregation', 'indicator_calculation', 'gap_detection', etc.

  -- Execution
  status VARCHAR(20) NOT NULL,  -- 'running', 'success', 'failed'
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- Results
  records_processed INTEGER,
  errors_count INTEGER,
  error_message TEXT,

  -- Metadata
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_scheduler_job ON scheduler_log(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_status ON scheduler_log(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduler_failures ON scheduler_log(status, started_at DESC) WHERE status = 'failed';

-- ============================================================
-- Step 7: Views for Easy Access
-- ============================================================

-- Latest candles for each symbol/timeframe
CREATE OR REPLACE VIEW latest_candles AS
SELECT DISTINCT ON (symbol, asset_type, timeframe)
  symbol,
  asset_type,
  timeframe,
  open_price,
  high_price,
  low_price,
  close_price,
  volume,
  change_percent,
  candle_start,
  candle_end
FROM price_candles
ORDER BY symbol, asset_type, timeframe, candle_start DESC;

-- Latest indicators for each symbol/timeframe
CREATE OR REPLACE VIEW latest_indicators AS
SELECT DISTINCT ON (symbol, asset_type, timeframe)
  symbol,
  asset_type,
  timeframe,
  sma_20,
  sma_50,
  ema_20,
  rsi_14,
  macd,
  macd_signal,
  bb_upper,
  bb_middle,
  bb_lower,
  atr_14,
  calculated_at
FROM price_indicators
ORDER BY symbol, asset_type, timeframe, calculated_at DESC;

-- Active market events (not expired, not acknowledged)
CREATE OR REPLACE VIEW active_events AS
SELECT
  id,
  symbol,
  asset_type,
  event_type,
  description,
  severity,
  metadata,
  detected_at
FROM price_events
WHERE (expires_at IS NULL OR expires_at > NOW())
  AND acknowledged = FALSE
ORDER BY severity DESC, detected_at DESC;

-- Data quality summary
CREATE OR REPLACE VIEW data_quality_summary AS
SELECT
  symbol,
  asset_type,
  check_type,
  COUNT(*) as total_checks,
  SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warnings,
  SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failures,
  MAX(checked_at) as last_check
FROM data_quality_log
WHERE checked_at > NOW() - INTERVAL '7 days'
GROUP BY symbol, asset_type, check_type
ORDER BY failures DESC, warnings DESC;

-- ============================================================
-- Step 8: Helper Functions
-- ============================================================

-- Function to calculate SMA from candles
CREATE OR REPLACE FUNCTION calculate_sma(
  p_symbol VARCHAR(20),
  p_timeframe VARCHAR(10),
  p_periods INTEGER,
  p_at_time TIMESTAMP
)
RETURNS DECIMAL(20, 8) AS $$
DECLARE
  v_sma DECIMAL(20, 8);
BEGIN
  SELECT AVG(close_price) INTO v_sma
  FROM (
    SELECT close_price
    FROM price_candles
    WHERE symbol = p_symbol
      AND timeframe = p_timeframe
      AND candle_start <= p_at_time
    ORDER BY candle_start DESC
    LIMIT p_periods
  ) recent_candles;

  RETURN v_sma;
END;
$$ LANGUAGE plpgsql;

-- Function to detect price gaps
CREATE OR REPLACE FUNCTION detect_price_gaps(
  p_symbol VARCHAR(20),
  p_expected_interval INTERVAL DEFAULT '5 minutes'
)
RETURNS TABLE(gap_start TIMESTAMP, gap_end TIMESTAMP, duration INTERVAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    prev.recorded_at as gap_start,
    curr.recorded_at as gap_end,
    curr.recorded_at - prev.recorded_at as duration
  FROM price_history curr
  JOIN LATERAL (
    SELECT recorded_at
    FROM price_history
    WHERE symbol = p_symbol
      AND recorded_at < curr.recorded_at
    ORDER BY recorded_at DESC
    LIMIT 1
  ) prev ON true
  WHERE curr.symbol = p_symbol
    AND (curr.recorded_at - prev.recorded_at) > p_expected_interval * 2
  ORDER BY gap_start DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old scheduler logs (keep last 10,000)
CREATE OR REPLACE FUNCTION clean_old_scheduler_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM scheduler_log
  WHERE id NOT IN (
    SELECT id FROM scheduler_log
    ORDER BY started_at DESC
    LIMIT 10000
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 005 Complete - Algo Trading Tables';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - price_candles (OHLCV data for backtesting)';
  RAISE NOTICE '  - price_indicators (RSI, MACD, SMA, EMA, etc.)';
  RAISE NOTICE '  - price_events (market events and signals)';
  RAISE NOTICE '  - backtest_results (strategy performance)';
  RAISE NOTICE '  - data_quality_log (gap detection, outliers)';
  RAISE NOTICE '  - scheduler_log (automated job tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views created:';
  RAISE NOTICE '  - latest_candles (most recent OHLCV per timeframe)';
  RAISE NOTICE '  - latest_indicators (current technical indicators)';
  RAISE NOTICE '  - active_events (unacknowledged market events)';
  RAISE NOTICE '  - data_quality_summary (health dashboard)';
  RAISE NOTICE '';
  RAISE NOTICE 'Helper functions:';
  RAISE NOTICE '  - calculate_sma() - Calculate simple moving average';
  RAISE NOTICE '  - detect_price_gaps() - Find missing data';
  RAISE NOTICE '  - clean_old_scheduler_logs() - Maintenance';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for algo trading! Next steps:';
  RAISE NOTICE '  1. Run compute-candles.js to generate OHLCV data';
  RAISE NOTICE '  2. Run compute-indicators.js to calculate indicators';
  RAISE NOTICE '  3. Use /api/candles and /api/indicators for backtesting';
  RAISE NOTICE '============================================================';
END $$;
