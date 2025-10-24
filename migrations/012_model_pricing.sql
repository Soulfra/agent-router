-- Migration: Model Pricing Tables
-- Real-time AI model pricing and performance tracking

-- Model Pricing: Store fetched pricing data from providers
CREATE TABLE IF NOT EXISTS model_pricing (
  id SERIAL PRIMARY KEY,

  -- Model identification
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'ollama', etc.
  model_name VARCHAR(255) NOT NULL,

  -- Pricing (per 1K tokens)
  input_price_per_1k DECIMAL(10, 6) NOT NULL,
  output_price_per_1k DECIMAL(10, 6) NOT NULL,

  -- Model characteristics
  quality_score INTEGER, -- 0-100
  speed_score INTEGER, -- 0-100
  context_window INTEGER,

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (provider, model_name),
  CHECK (input_price_per_1k >= 0),
  CHECK (output_price_per_1k >= 0),
  CHECK (quality_score >= 0 AND quality_score <= 100),
  CHECK (speed_score >= 0 AND speed_score <= 100)
);

CREATE INDEX idx_model_pricing_provider ON model_pricing(provider, fetched_at DESC);
CREATE INDEX idx_model_pricing_cost ON model_pricing(input_price_per_1k, output_price_per_1k);
CREATE INDEX idx_model_pricing_quality ON model_pricing(quality_score DESC);

COMMENT ON TABLE model_pricing IS 'Real-time AI model pricing fetched from provider APIs';
COMMENT ON COLUMN model_pricing.quality_score IS 'Model quality score (0-100) based on benchmarks';
COMMENT ON COLUMN model_pricing.speed_score IS 'Model speed score (0-100) based on latency tests';

-- Model Performance History: Track actual performance over time
CREATE TABLE IF NOT EXISTS model_performance (
  id SERIAL PRIMARY KEY,

  -- Model
  provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(255) NOT NULL,

  -- Performance metrics
  avg_latency_ms INTEGER,
  avg_quality_rating DECIMAL(3, 2), -- User ratings 0-5
  success_rate DECIMAL(5, 2), -- Percentage
  total_requests INTEGER DEFAULT 0,

  -- Time window
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_model_performance_provider ON model_performance(provider, model_name, measured_at DESC);
CREATE INDEX idx_model_performance_latency ON model_performance(avg_latency_ms);

COMMENT ON TABLE model_performance IS 'Historical performance metrics for AI models';

-- Model Recommendations: Track what ModelClarityEngine recommends
CREATE TABLE IF NOT EXISTS model_recommendations (
  id SERIAL PRIMARY KEY,

  -- Request context
  session_id VARCHAR(255),
  user_id VARCHAR(255),
  tenant_id UUID,

  -- Prompt analysis
  prompt_length INTEGER,
  prompt_complexity INTEGER, -- 1=simple, 2=moderate, 3=complex
  has_code BOOLEAN DEFAULT FALSE,
  has_reasoning BOOLEAN DEFAULT FALSE,

  -- Recommendation
  recommended_provider VARCHAR(50),
  recommended_model VARCHAR(255),
  recommendation_score DECIMAL(5, 2),
  reasoning TEXT,

  -- Alternatives considered
  alternatives JSONB, -- Array of {provider, model, score}

  -- Budget mode
  budget_mode VARCHAR(50), -- 'lowest', 'balanced', 'quality'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_model_recs_session ON model_recommendations(session_id, created_at DESC);
CREATE INDEX idx_model_recs_user ON model_recommendations(user_id, created_at DESC);
CREATE INDEX idx_model_recs_tenant ON model_recommendations(tenant_id, created_at DESC);
CREATE INDEX idx_model_recs_recommended ON model_recommendations(recommended_provider, recommended_model);

COMMENT ON TABLE model_recommendations IS 'Track ModelClarityEngine recommendations for analysis';

-- Price Correlations: Track pricing correlations with crypto/stocks
CREATE TABLE IF NOT EXISTS ai_price_correlations (
  id SERIAL PRIMARY KEY,

  -- AI model pricing
  provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  ai_cost_per_1k DECIMAL(10, 6),

  -- External price (from PricingSource)
  asset_type VARCHAR(50), -- 'crypto', 'stock', 'commodity'
  asset_symbol VARCHAR(20), -- 'BTC', 'AAPL', etc.
  asset_price DECIMAL(20, 8),

  -- Correlation
  correlation_coefficient DECIMAL(5, 4), -- -1 to 1
  sample_size INTEGER,

  -- Time window
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  window_days INTEGER DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_corr_model ON ai_price_correlations(provider, model_name, calculated_at DESC);
CREATE INDEX idx_price_corr_asset ON ai_price_correlations(asset_symbol, calculated_at DESC);
CREATE INDEX idx_price_corr_strength ON ai_price_correlations(ABS(correlation_coefficient) DESC);

COMMENT ON TABLE ai_price_correlations IS 'Correlations between AI model pricing and crypto/stock prices for HFT algo';
