-- Model Benchmarking System
-- Like Bitcoin mining difficulty - track model throughput for predictable block times
-- Enables: Pre-flight time estimation, dynamic chunk sizing, performance comparison

-- Model benchmarks: Measured throughput like blockchain mining rates
CREATE TABLE IF NOT EXISTS model_benchmarks (
  id SERIAL PRIMARY KEY,

  -- Model identification
  model_id TEXT UNIQUE NOT NULL,  -- e.g., 'codellama:7b', 'gpt-4', 'llama3.2:3b'
  model_family TEXT,              -- 'llama', 'mistral', 'gpt', 'claude'
  model_size TEXT,                -- '7b', '13b', '70b', etc.

  -- Throughput metrics (tokens/second) - like hash rate in mining
  avg_tokens_per_second REAL,
  p50_tokens_per_second REAL,    -- Median
  p95_tokens_per_second REAL,    -- 95th percentile
  min_tokens_per_second REAL,
  max_tokens_per_second REAL,

  -- Token metrics
  avg_prompt_tokens INTEGER,
  avg_response_tokens INTEGER,

  -- Context window
  max_context_tokens INTEGER DEFAULT 4096,

  -- Hardware requirements (for deployment planning)
  min_vram_gb INTEGER,
  min_ram_gb INTEGER,
  min_cpu_cores INTEGER,
  recommended_gpu TEXT,           -- 'M2 Max', 'RTX 4090', 'A100', etc.

  -- Cost metrics
  cost_per_million_tokens REAL,  -- Internal: electricity/depreciation, External: API cost
  cost_currency TEXT DEFAULT 'USD',

  -- Benchmark metadata
  benchmark_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  measurements_count INTEGER DEFAULT 0,

  -- Academic/industry validation
  paper_citation TEXT,            -- "Comparing GPT-4 vs Llama 3 (2024)"
  paper_url TEXT,
  hardware_spec TEXT,             -- "Apple M2 Max, 96GB RAM, macOS 14"
  silicon_vendor TEXT,            -- 'Apple', 'NVIDIA', 'AMD', 'Google TPU'

  -- Quality metrics (from usage tracking)
  avg_success_rate REAL,          -- 0.0-1.0
  avg_user_satisfaction REAL,     -- From feedback

  -- Performance characteristics
  is_fast BOOLEAN GENERATED ALWAYS AS (avg_tokens_per_second > 30) STORED,
  is_slow BOOLEAN GENERATED ALWAYS AS (avg_tokens_per_second < 10) STORED,
  is_expensive BOOLEAN GENERATED ALWAYS AS (cost_per_million_tokens > 10) STORED,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_internal BOOLEAN DEFAULT true, -- Internal (Ollama) vs External (API)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_benchmarks_model ON model_benchmarks(model_id);
CREATE INDEX idx_benchmarks_family ON model_benchmarks(model_family);
CREATE INDEX idx_benchmarks_tps ON model_benchmarks(avg_tokens_per_second DESC);
CREATE INDEX idx_benchmarks_fast ON model_benchmarks(is_fast) WHERE is_fast = true;
CREATE INDEX idx_benchmarks_active ON model_benchmarks(is_active) WHERE is_active = true;

-- Block time profiles: Like Bitcoin's 10min, RuneScape's 600ms, Monero's dynamic
CREATE TABLE IF NOT EXISTS block_time_profiles (
  id SERIAL PRIMARY KEY,

  -- Profile identification
  profile_name TEXT UNIQUE NOT NULL,  -- 'bitcoin', 'runescape', 'balanced', 'longform'
  profile_slug TEXT UNIQUE NOT NULL,

  -- Target block time (like Bitcoin's 10 min target)
  target_seconds INTEGER NOT NULL,
  tolerance_seconds INTEGER NOT NULL,

  -- Difficulty adjustment (like Bitcoin difficulty adjustment every 2016 blocks)
  auto_adjust BOOLEAN DEFAULT false,
  adjustment_window INTEGER,          -- Adjust after N blocks

  -- Use case
  description TEXT,
  best_for TEXT[],                    -- ['real-time chat', 'long documents', 'batch processing']

  -- Constraints
  min_chunk_tokens INTEGER,
  max_chunk_tokens INTEGER,

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed block time profiles
INSERT INTO block_time_profiles (profile_name, profile_slug, target_seconds, tolerance_seconds, description, best_for, min_chunk_tokens, max_chunk_tokens) VALUES
  ('bitcoin', 'bitcoin', 600, 120, 'Slow and steady like Bitcoin blocks. Predictable 10-minute blocks for large batch processing.', ARRAY['batch processing', 'overnight jobs', 'large documents'], 10000, 50000),
  ('runescape', 'runescape', 1, 0, 'Ultra-fast like RuneScape game ticks (600ms). For real-time interactive responses.', ARRAY['real-time chat', 'interactive games', 'live streaming'], 50, 500),
  ('balanced', 'balanced', 30, 10, 'Balanced approach - 30 second blocks. Good for most use cases.', ARRAY['general purpose', 'document processing', 'code analysis'], 500, 5000),
  ('longform', 'longform', 120, 30, 'Long-form content - 2 minute blocks. For deep analysis and large documents.', ARRAY['research', 'book analysis', 'large codebases'], 5000, 20000)
ON CONFLICT (profile_slug) DO NOTHING;

-- Mark 'balanced' as default
UPDATE block_time_profiles SET is_default = true WHERE profile_slug = 'balanced';

-- Benchmark measurements: Individual measurements for statistical analysis
CREATE TABLE IF NOT EXISTS benchmark_measurements (
  id SERIAL PRIMARY KEY,

  -- Which model
  model_id TEXT NOT NULL REFERENCES model_benchmarks(model_id) ON DELETE CASCADE,

  -- Measurement
  prompt_tokens INTEGER NOT NULL,
  response_tokens INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  tokens_per_second REAL GENERATED ALWAYS AS (
    CASE
      WHEN response_time_ms > 0 THEN response_tokens::REAL / (response_time_ms::REAL / 1000)
      ELSE 0
    END
  ) STORED,

  -- Context
  prompt_type TEXT,               -- 'code', 'creative', 'chat', 'analysis'
  was_cached BOOLEAN DEFAULT false,
  hardware_load REAL,             -- CPU/GPU utilization during test

  -- Metadata
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  measurement_source TEXT,        -- 'benchmark-script', 'production-usage', 'manual-test'

  -- Link to production usage if applicable
  usage_log_id INTEGER             -- References model_usage_log(id)
);

CREATE INDEX idx_measurements_model ON benchmark_measurements(model_id);
CREATE INDEX idx_measurements_tps ON benchmark_measurements(tokens_per_second DESC);
CREATE INDEX idx_measurements_date ON benchmark_measurements(measured_at DESC);

-- Model comparisons: Compare against published papers/benchmarks
CREATE TABLE IF NOT EXISTS model_comparisons (
  id SERIAL PRIMARY KEY,

  -- What we're comparing
  our_model_id TEXT NOT NULL REFERENCES model_benchmarks(model_id),

  -- Reference benchmark (from paper/industry)
  reference_name TEXT NOT NULL,   -- 'GPT-4 Technical Report', 'Llama 3 Paper'
  reference_url TEXT,
  reference_tps REAL,             -- Their reported tokens/second

  -- Our performance vs theirs
  our_tps REAL,
  performance_ratio REAL GENERATED ALWAYS AS (
    CASE
      WHEN reference_tps > 0 THEN our_tps / reference_tps
      ELSE NULL
    END
  ) STORED,

  -- Hardware comparison
  reference_hardware TEXT,        -- What they used
  our_hardware TEXT,              -- What we're using

  -- Notes
  notes TEXT,

  -- Status
  is_fair_comparison BOOLEAN DEFAULT true, -- Same hardware class?

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comparisons_model ON model_comparisons(our_model_id);
CREATE INDEX idx_comparisons_ratio ON model_comparisons(performance_ratio DESC NULLS LAST);

-- Helper functions

/**
 * Calculate model throughput from usage log
 */
CREATE OR REPLACE FUNCTION calculate_model_throughput(
  p_model_id TEXT,
  p_window_hours INTEGER DEFAULT 24
) RETURNS TABLE(
  avg_tps REAL,
  p50_tps REAL,
  p95_tps REAL,
  min_tps REAL,
  max_tps REAL,
  measurement_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(response_tokens::REAL / (response_time_ms::REAL / 1000))::REAL as avg_tps,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_tokens::REAL / (response_time_ms::REAL / 1000))::REAL as p50_tps,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_tokens::REAL / (response_time_ms::REAL / 1000))::REAL as p95_tps,
    MIN(response_tokens::REAL / (response_time_ms::REAL / 1000))::REAL as min_tps,
    MAX(response_tokens::REAL / (response_time_ms::REAL / 1000))::REAL as max_tps,
    COUNT(*)::BIGINT as measurement_count
  FROM model_usage_log
  WHERE model_id = p_model_id
    AND status = 'success'
    AND response_tokens > 0
    AND response_time_ms > 0
    AND timestamp > NOW() - (p_window_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

/**
 * Refresh benchmark from usage log
 */
CREATE OR REPLACE FUNCTION refresh_model_benchmark(
  p_model_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_throughput RECORD;
BEGIN
  -- Calculate throughput from last 24 hours
  SELECT * INTO v_throughput FROM calculate_model_throughput(p_model_id, 24);

  IF v_throughput.measurement_count = 0 THEN
    RETURN FALSE;
  END IF;

  -- Update or insert benchmark
  INSERT INTO model_benchmarks (
    model_id,
    avg_tokens_per_second,
    p50_tokens_per_second,
    p95_tokens_per_second,
    min_tokens_per_second,
    max_tokens_per_second,
    measurements_count,
    updated_at
  ) VALUES (
    p_model_id,
    v_throughput.avg_tps,
    v_throughput.p50_tps,
    v_throughput.p95_tps,
    v_throughput.min_tps,
    v_throughput.max_tps,
    v_throughput.measurement_count,
    NOW()
  )
  ON CONFLICT (model_id) DO UPDATE SET
    avg_tokens_per_second = EXCLUDED.avg_tokens_per_second,
    p50_tokens_per_second = EXCLUDED.p50_tokens_per_second,
    p95_tokens_per_second = EXCLUDED.p95_tokens_per_second,
    min_tokens_per_second = EXCLUDED.min_tokens_per_second,
    max_tokens_per_second = EXCLUDED.max_tokens_per_second,
    measurements_count = EXCLUDED.measurements_count,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

/**
 * Calculate optimal chunk size for target block time
 */
CREATE OR REPLACE FUNCTION calculate_optimal_chunk_size(
  p_model_id TEXT,
  p_target_seconds INTEGER DEFAULT 30,
  p_safety_margin REAL DEFAULT 0.7
) RETURNS INTEGER AS $$
DECLARE
  v_tps REAL;
  v_optimal_tokens INTEGER;
BEGIN
  -- Get model throughput
  SELECT avg_tokens_per_second INTO v_tps
  FROM model_benchmarks
  WHERE model_id = p_model_id
    AND is_active = true;

  IF v_tps IS NULL OR v_tps = 0 THEN
    -- Default to 4096 if no benchmark
    RETURN 4096;
  END IF;

  -- Calculate: tokens = throughput × time × safety margin
  v_optimal_tokens := FLOOR(v_tps * p_target_seconds * p_safety_margin);

  -- Clamp to reasonable range
  RETURN GREATEST(LEAST(v_optimal_tokens, 20000), 100);
END;
$$ LANGUAGE plpgsql;

/**
 * Estimate processing time for document
 */
CREATE OR REPLACE FUNCTION estimate_processing_time(
  p_model_id TEXT,
  p_total_tokens INTEGER,
  p_profile_slug TEXT DEFAULT 'balanced'
) RETURNS TABLE(
  chunk_count INTEGER,
  tokens_per_chunk INTEGER,
  block_time_seconds INTEGER,
  total_time_seconds INTEGER,
  total_minutes REAL,
  model_tps REAL
) AS $$
DECLARE
  v_profile RECORD;
  v_tps REAL;
  v_chunk_size INTEGER;
BEGIN
  -- Get profile
  SELECT * INTO v_profile FROM block_time_profiles WHERE profile_slug = p_profile_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_slug;
  END IF;

  -- Get model throughput
  SELECT avg_tokens_per_second INTO v_tps
  FROM model_benchmarks
  WHERE model_id = p_model_id;

  IF v_tps IS NULL THEN
    v_tps := 10; -- Default assumption
  END IF;

  -- Calculate optimal chunk size
  v_chunk_size := calculate_optimal_chunk_size(p_model_id, v_profile.target_seconds);

  -- Estimate
  RETURN QUERY SELECT
    CEIL(p_total_tokens::REAL / v_chunk_size)::INTEGER as chunk_count,
    v_chunk_size as tokens_per_chunk,
    v_profile.target_seconds as block_time_seconds,
    CEIL(p_total_tokens::REAL / v_chunk_size)::INTEGER * v_profile.target_seconds as total_time_seconds,
    (CEIL(p_total_tokens::REAL / v_chunk_size)::INTEGER * v_profile.target_seconds)::REAL / 60 as total_minutes,
    v_tps as model_tps;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE model_benchmarks IS 'Model throughput benchmarks - like Bitcoin mining hash rates. Enables predictable block times.';
COMMENT ON TABLE block_time_profiles IS 'Block time targets - Bitcoin (10min), RuneScape (600ms), Balanced (30s), Longform (2min)';
COMMENT ON TABLE benchmark_measurements IS 'Individual throughput measurements for statistical analysis';
COMMENT ON TABLE model_comparisons IS 'Compare our performance against published papers and industry benchmarks';
COMMENT ON FUNCTION calculate_model_throughput IS 'Calculate tokens/second from usage log over time window';
COMMENT ON FUNCTION refresh_model_benchmark IS 'Update model benchmark from recent usage data';
COMMENT ON FUNCTION calculate_optimal_chunk_size IS 'Calculate optimal chunk size to hit target block time';
COMMENT ON FUNCTION estimate_processing_time IS 'Pre-flight estimation: predict completion time before starting';
