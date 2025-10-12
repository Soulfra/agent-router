-- CalOS Database Schema
-- Supports local mode with cached AI responses, embeddings, papers, and fine-tuning data

-- Enable pgvector extension for semantic search (PostgreSQL only)
-- For SQLite, embeddings will use JSON arrays
CREATE EXTENSION IF NOT EXISTS vector;

-- AI Responses Cache
-- Stores responses from all AI providers for local mode
-- OPTIMIZED: Timestamps as first columns after id for faster time-range queries
CREATE TABLE IF NOT EXISTS ai_responses (
  id SERIAL PRIMARY KEY,
  request_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,  -- When query was received
  response_timestamp TIMESTAMP,                                     -- When response was generated
  latency_ms INTEGER,                                               -- Request→response time differential
  provider VARCHAR(50) NOT NULL,           -- 'openai', 'anthropic', 'deepseek', 'ollama'
  model VARCHAR(100) NOT NULL,             -- 'gpt-4', 'claude-3-5-sonnet', etc.
  query_hash VARCHAR(64) NOT NULL,         -- SHA256 hash of messages for exact match
  query_text TEXT,                         -- Last user message for reference
  messages JSONB NOT NULL,                 -- Full conversation messages
  response TEXT NOT NULL,                  -- AI response content
  metadata JSONB,                          -- Additional data (tokens, cost, source, etc.)
  cache_hit BOOLEAN DEFAULT FALSE,         -- Whether this was a cache hit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, model, query_hash)
);

-- Indexes optimized for time-based queries
CREATE INDEX idx_responses_provider_model ON ai_responses(provider, model);
CREATE INDEX idx_responses_query_hash ON ai_responses(query_hash);
CREATE INDEX idx_responses_request_time ON ai_responses(request_timestamp DESC);
CREATE INDEX idx_responses_latency ON ai_responses(latency_ms) WHERE latency_ms IS NOT NULL;
CREATE INDEX idx_responses_cache_hit ON ai_responses(cache_hit);
CREATE INDEX idx_responses_created_at ON ai_responses(created_at DESC);

-- AI Embeddings for Semantic Search
-- Maps responses to vector embeddings for similarity search
CREATE TABLE IF NOT EXISTS ai_embeddings (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
  embedding vector(1536),                  -- OpenAI text-embedding-ada-002 dimension
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(response_id)
);

-- Vector similarity index (PostgreSQL with pgvector)
-- For fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON ai_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ArXiv Papers Cache
-- Store fetched papers for offline access and fine-tuning
CREATE TABLE IF NOT EXISTS arxiv_papers (
  id SERIAL PRIMARY KEY,
  arxiv_id VARCHAR(50) NOT NULL UNIQUE,    -- e.g., '2103.00020v1'
  title TEXT NOT NULL,
  authors TEXT[],
  abstract TEXT,
  pdf_url TEXT,
  published_date DATE,
  categories TEXT[],                        -- e.g., ['cs.AI', 'cs.LG']
  pdf_path TEXT,                            -- Local file path if downloaded
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_arxiv_id ON arxiv_papers(arxiv_id);
CREATE INDEX idx_arxiv_categories ON arxiv_papers USING GIN(categories);
CREATE INDEX idx_arxiv_published ON arxiv_papers(published_date DESC);

-- Paper Embeddings for Semantic Search
CREATE TABLE IF NOT EXISTS paper_embeddings (
  id SERIAL PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES arxiv_papers(id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  source VARCHAR(50) DEFAULT 'abstract',   -- 'abstract', 'full_text', 'title'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(paper_id, source)
);

CREATE INDEX IF NOT EXISTS idx_paper_embeddings_vector ON paper_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Fine-Tuning Datasets
-- Store training data for model fine-tuning
CREATE TABLE IF NOT EXISTS fine_tune_datasets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  provider VARCHAR(50),                     -- Target provider: 'openai', 'ollama', etc.
  base_model VARCHAR(100),                  -- Base model to fine-tune from
  format VARCHAR(50) DEFAULT 'chat',        -- 'chat', 'completion', 'instruct'
  data JSONB NOT NULL,                      -- Training examples
  validation_data JSONB,                    -- Validation set
  status VARCHAR(50) DEFAULT 'draft',       -- 'draft', 'ready', 'training', 'complete'
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_datasets_provider ON fine_tune_datasets(provider);
CREATE INDEX idx_datasets_status ON fine_tune_datasets(status);

-- Fine-Tuning Runs
-- Track fine-tuning job executions
CREATE TABLE IF NOT EXISTS fine_tune_runs (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES fine_tune_datasets(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  base_model VARCHAR(100) NOT NULL,
  fine_tuned_model VARCHAR(100),            -- Resulting model name
  job_id VARCHAR(255),                      -- Provider's job ID
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'running', 'success', 'failed'
  hyperparameters JSONB,                    -- Training config
  metrics JSONB,                            -- Loss, accuracy, etc.
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_runs_dataset ON fine_tune_runs(dataset_id);
CREATE INDEX idx_runs_status ON fine_tune_runs(status);

-- Agent Metrics
-- Track agent performance and usage
-- OPTIMIZED: Timestamp as second column for time-range queries
CREATE TABLE IF NOT EXISTS agent_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  agent_id VARCHAR(100) NOT NULL,           -- '@gpt4', '@ollama:mistral', etc.
  metric_type VARCHAR(50) NOT NULL,         -- 'request', 'error', 'latency', 'cache_hit'
  value NUMERIC,                            -- Latency in ms, token count, etc.
  response_id INTEGER REFERENCES ai_responses(id) ON DELETE SET NULL,  -- Link to cached response
  metadata JSONB,
  request_hash VARCHAR(64)                  -- Link to specific request
);

CREATE INDEX idx_metrics_timestamp ON agent_metrics(timestamp DESC);
CREATE INDEX idx_metrics_agent ON agent_metrics(agent_id, timestamp DESC);
CREATE INDEX idx_metrics_type ON agent_metrics(metric_type);
CREATE INDEX idx_metrics_response ON agent_metrics(response_id) WHERE response_id IS NOT NULL;

-- Conversation History
-- Persistent multi-agent conversation threads
-- OPTIMIZED: Timestamps early for time-range queries
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  title TEXT,
  messages JSONB NOT NULL,                  -- Array of message objects
  agents_used TEXT[],                       -- Which agents participated
  message_count INTEGER DEFAULT 0,          -- Quick access to conversation length
  last_agent VARCHAR(100)                   -- Last agent that responded
);

CREATE INDEX idx_conversations_started ON conversations(started_at DESC);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_conversations_agent ON conversations(last_agent) WHERE last_agent IS NOT NULL;

-- User Preferences
-- Store user settings and custom routing rules
CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Helper Functions

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_ai_responses_updated_at BEFORE UPDATE ON ai_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_arxiv_papers_updated_at BEFORE UPDATE ON arxiv_papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON fine_tune_datasets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_runs_updated_at BEFORE UPDATE ON fine_tune_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Recent cached responses with timing info
CREATE OR REPLACE VIEW recent_responses AS
SELECT
  id,
  request_timestamp,
  response_timestamp,
  latency_ms,
  provider,
  model,
  query_text,
  LENGTH(response) as response_length,
  cache_hit,
  created_at
FROM ai_responses
ORDER BY request_timestamp DESC
LIMIT 100;

-- Fast responses (under 100ms)
CREATE OR REPLACE VIEW fast_responses AS
SELECT
  provider,
  model,
  latency_ms,
  cache_hit,
  request_timestamp
FROM ai_responses
WHERE latency_ms < 100 AND latency_ms IS NOT NULL
ORDER BY request_timestamp DESC;

-- Slow responses (over 5 seconds)
CREATE OR REPLACE VIEW slow_responses AS
SELECT
  provider,
  model,
  latency_ms,
  query_text,
  request_timestamp
FROM ai_responses
WHERE latency_ms > 5000 AND latency_ms IS NOT NULL
ORDER BY latency_ms DESC;

-- Agent performance summary (last 24 hours)
CREATE OR REPLACE VIEW agent_performance AS
SELECT
  agent_id,
  COUNT(*) as total_requests,
  AVG(value) FILTER (WHERE metric_type = 'latency') as avg_latency_ms,
  MIN(value) FILTER (WHERE metric_type = 'latency') as min_latency_ms,
  MAX(value) FILTER (WHERE metric_type = 'latency') as max_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'latency') as p95_latency_ms,
  COUNT(*) FILTER (WHERE metric_type = 'cache_hit') as cache_hits,
  COUNT(*) FILTER (WHERE metric_type = 'error') as error_count,
  COUNT(*) FILTER (WHERE metric_type = 'request') as request_count
FROM agent_metrics
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY agent_id
ORDER BY total_requests DESC;

-- Dataset summary
CREATE OR REPLACE VIEW dataset_summary AS
SELECT
  d.id,
  d.name,
  d.provider,
  d.status,
  jsonb_array_length(d.data) as training_examples,
  COUNT(r.id) as total_runs,
  COUNT(r.id) FILTER (WHERE r.status = 'success') as successful_runs
FROM fine_tune_datasets d
LEFT JOIN fine_tune_runs r ON r.dataset_id = d.id
GROUP BY d.id, d.name, d.provider, d.status, d.data;
