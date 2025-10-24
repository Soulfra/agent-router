/**
 * Model Discovery System
 * Auto-discovers models from Ollama, OpenRouter, HuggingFace, Together, Groq
 */

-- Discovered models registry
CREATE TABLE IF NOT EXISTS discovered_models (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) UNIQUE NOT NULL, -- e.g., "ollama:llama2", "openrouter:gpt-4"
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL, -- 'ollama', 'openrouter', 'huggingface', etc.
  family VARCHAR(100), -- Primary family (trusts API first, falls back to detection)
  reported_family VARCHAR(100), -- What the API/source claims
  detected_family VARCHAR(100), -- What we detect from the name
  architecture JSONB DEFAULT '[]'::jsonb, -- ['llama', 'transformer'] - can have multiple
  parameter_size VARCHAR(50), -- '7B', '13B', '70B', etc.
  quantization VARCHAR(50), -- 'Q4_K_M', 'Q8_0', etc.
  format VARCHAR(50), -- 'gguf', 'safetensors', etc.
  capabilities JSONB DEFAULT '[]'::jsonb, -- ['chat', 'code', 'vision']
  metadata JSONB DEFAULT '{}'::jsonb, -- Full model info
  discovered_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Model discovery events (tracking when scans happened)
CREATE TABLE IF NOT EXISTS model_discovery_events (
  id SERIAL PRIMARY KEY,
  total_models INTEGER DEFAULT 0,
  sources_scanned INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User model preferences (favorites, hidden, custom names)
CREATE TABLE IF NOT EXISTS user_model_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- References users(id) but without constraint for now
  model_id VARCHAR(255) NOT NULL,
  is_favorite BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  custom_name VARCHAR(255),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, model_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discovered_models_provider ON discovered_models(provider);
CREATE INDEX IF NOT EXISTS idx_discovered_models_family ON discovered_models(family);
CREATE INDEX IF NOT EXISTS idx_discovered_models_last_seen ON discovered_models(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_model_prefs_user ON user_model_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_model_prefs_model ON user_model_preferences(model_id);
CREATE INDEX IF NOT EXISTS idx_user_model_prefs_favorite ON user_model_preferences(user_id, is_favorite) WHERE is_favorite = true;

-- GIN index for JSONB capabilities search
CREATE INDEX IF NOT EXISTS idx_discovered_models_capabilities ON discovered_models USING GIN (capabilities);

-- Comments
COMMENT ON TABLE discovered_models IS 'Registry of all discovered AI models from various providers';
COMMENT ON TABLE model_discovery_events IS 'Log of model discovery scans';
COMMENT ON TABLE user_model_preferences IS 'Per-user model preferences and usage stats';
