-- 12-Bucket Integration System
--
-- Foundation for complete domain-based bucket system with reasoning logs,
-- todos, comments, and version control
--
-- Key insight: Each bucket = complete isolated instance with Ollama model,
-- workflow, profile, usage tracking, reasoning logger, version control

-- ============================================================================
-- Bucket Instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_instances (
  bucket_id TEXT PRIMARY KEY,
  bucket_name TEXT NOT NULL,
  bucket_slug TEXT UNIQUE NOT NULL,

  -- Category (Technical, Creative, Business)
  category TEXT NOT NULL,

  -- Domain association (from 12-domain portfolio)
  domain_context TEXT, -- 'code', 'creative', 'reasoning', 'fact', 'simple'
  domain_url TEXT,     -- e.g., 'matthewmauer.com', 'soulfractal.art'

  -- Assigned Ollama model
  ollama_model TEXT NOT NULL,
  model_family TEXT,   -- 'llama', 'mistral', 'codellama', etc.
  model_version TEXT,

  -- Workflow configuration
  workflow_id TEXT,
  workflow_config JSONB,

  -- Profile configuration
  profile_config JSONB, -- Room colors, preferences, etc.

  -- Usage tracking
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  avg_response_time_ms REAL,

  -- Current version
  current_version INTEGER DEFAULT 1,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'testing', 'archived')),

  -- MinIO bucket path
  minio_bucket_path TEXT,

  -- Metadata
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bucket_instances_category ON bucket_instances(category);
CREATE INDEX idx_bucket_instances_status ON bucket_instances(status);
CREATE INDEX idx_bucket_instances_domain ON bucket_instances(domain_context);


-- ============================================================================
-- Reasoning Log
-- Track WHY decisions were made, not just WHAT
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_reasoning_log (
  reasoning_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Decision context
  decision_type TEXT NOT NULL, -- 'model_selection', 'workflow_change', 'config_update', 'routing_decision'
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Request context (if applicable)
  request_id TEXT,
  prompt_text TEXT,
  user_intent TEXT,

  -- Reasoning
  reasoning TEXT NOT NULL, -- WHY this decision was made
  alternatives_considered JSONB, -- Other options evaluated
  decision_factors JSONB, -- { "cost": 0.8, "speed": 0.6, "accuracy": 0.9 }

  -- Outcome
  decision_made TEXT NOT NULL, -- WHAT was decided
  outcome TEXT, -- 'success', 'partial', 'failed'
  outcome_metrics JSONB, -- Actual performance after decision

  -- Learning
  should_repeat BOOLEAN, -- Would we make same decision again?
  lessons_learned TEXT,

  -- Metadata
  created_by TEXT, -- 'system', 'user', 'ai'
  tags TEXT[]
);

CREATE INDEX idx_reasoning_log_bucket ON bucket_reasoning_log(bucket_id);
CREATE INDEX idx_reasoning_log_version ON bucket_reasoning_log(bucket_id, version);
CREATE INDEX idx_reasoning_log_type ON bucket_reasoning_log(decision_type);
CREATE INDEX idx_reasoning_log_timestamp ON bucket_reasoning_log(timestamp DESC);


-- ============================================================================
-- Bucket Todos
-- Pending tasks per bucket, per version
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_todos (
  todo_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'blocked')),

  -- Assignment
  assigned_to TEXT, -- 'system', 'human', 'ai:mistral', etc.

  -- Reasoning
  why_needed TEXT, -- WHY this todo exists
  blocking_reason TEXT, -- If blocked, why?

  -- Completion tracking
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_effort TEXT, -- 'trivial', 'small', 'medium', 'large'
  actual_effort TEXT,

  -- Related entities
  related_reasoning_id INTEGER REFERENCES bucket_reasoning_log(reasoning_id),
  related_request_id TEXT,

  -- Metadata
  tags TEXT[]
);

CREATE INDEX idx_bucket_todos_bucket ON bucket_todos(bucket_id);
CREATE INDEX idx_bucket_todos_version ON bucket_todos(bucket_id, version);
CREATE INDEX idx_bucket_todos_status ON bucket_todos(status);
CREATE INDEX idx_bucket_todos_priority ON bucket_todos(priority DESC);


-- ============================================================================
-- Bucket Comments
-- Human and AI notes on decisions, results, improvements
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_comments (
  comment_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Comment details
  author TEXT NOT NULL, -- 'user:matthew', 'ai:mistral', 'system'
  author_type TEXT CHECK (author_type IN ('human', 'ai', 'system')),
  comment_text TEXT NOT NULL,

  -- Type
  comment_type TEXT, -- 'observation', 'suggestion', 'issue', 'praise', 'question'

  -- Related entities
  related_reasoning_id INTEGER REFERENCES bucket_reasoning_log(reasoning_id),
  related_todo_id INTEGER REFERENCES bucket_todos(todo_id),
  related_request_id TEXT,

  -- Thread support
  parent_comment_id INTEGER REFERENCES bucket_comments(comment_id),
  thread_depth INTEGER DEFAULT 0,

  -- Metadata
  timestamp TIMESTAMP DEFAULT NOW(),
  edited_at TIMESTAMP,
  tags TEXT[]
);

CREATE INDEX idx_bucket_comments_bucket ON bucket_comments(bucket_id);
CREATE INDEX idx_bucket_comments_version ON bucket_comments(bucket_id, version);
CREATE INDEX idx_bucket_comments_timestamp ON bucket_comments(timestamp DESC);
CREATE INDEX idx_bucket_comments_thread ON bucket_comments(parent_comment_id);


-- ============================================================================
-- Bucket Versions
-- Git-like version control with snapshots and reasoning diffs
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_versions (
  version_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Version metadata
  version_name TEXT, -- e.g., 'v1.2-fast-routing', 'v2.0-new-model'
  version_type TEXT, -- 'major', 'minor', 'patch', 'experimental'

  -- Snapshot
  config_snapshot JSONB NOT NULL, -- Complete bucket config at this version

  -- Changes from previous version
  changes_summary TEXT NOT NULL, -- Human-readable summary
  reasoning TEXT NOT NULL, -- WHY these changes were made
  config_diff JSONB, -- Specific config changes

  -- Performance metrics at this version
  metrics JSONB, -- { "avgResponseTime": 2100, "successRate": 0.95, "cost": 0 }

  -- Comparison with previous version
  improvement_over_previous JSONB, -- { "speed": "+15%", "cost": "-20%" }

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'rolled_back')),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,
  tags TEXT[],

  UNIQUE(bucket_id, version_number)
);

CREATE INDEX idx_bucket_versions_bucket ON bucket_versions(bucket_id);
CREATE INDEX idx_bucket_versions_number ON bucket_versions(bucket_id, version_number DESC);
CREATE INDEX idx_bucket_versions_status ON bucket_versions(status);


-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Increment bucket request count and update stats
CREATE OR REPLACE FUNCTION increment_bucket_usage(
  p_bucket_id TEXT,
  p_success BOOLEAN,
  p_response_time_ms REAL,
  p_cost_usd DECIMAL
) RETURNS VOID AS $$
BEGIN
  UPDATE bucket_instances
  SET
    total_requests = total_requests + 1,
    successful_requests = successful_requests + CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_requests = failed_requests + CASE WHEN p_success THEN 0 ELSE 1 END,
    total_cost_usd = total_cost_usd + COALESCE(p_cost_usd, 0),
    avg_response_time_ms = (
      COALESCE(avg_response_time_ms, 0) * total_requests + p_response_time_ms
    ) / (total_requests + 1),
    updated_at = NOW()
  WHERE bucket_id = p_bucket_id;
END;
$$ LANGUAGE plpgsql;


-- Create new bucket version with reasoning
CREATE OR REPLACE FUNCTION create_bucket_version(
  p_bucket_id TEXT,
  p_version_name TEXT,
  p_config_snapshot JSONB,
  p_changes_summary TEXT,
  p_reasoning TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_version_number INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM bucket_versions
  WHERE bucket_id = p_bucket_id;

  -- Insert new version
  INSERT INTO bucket_versions (
    bucket_id,
    version_number,
    version_name,
    config_snapshot,
    changes_summary,
    reasoning,
    created_by
  ) VALUES (
    p_bucket_id,
    v_version_number,
    p_version_name,
    p_config_snapshot,
    p_changes_summary,
    p_reasoning,
    'system'
  );

  -- Update bucket current version
  UPDATE bucket_instances
  SET current_version = v_version_number,
      updated_at = NOW()
  WHERE bucket_id = p_bucket_id;

  RETURN v_version_number;
END;
$$ LANGUAGE plpgsql;


-- Get bucket performance summary
CREATE OR REPLACE FUNCTION get_bucket_performance(p_bucket_id TEXT)
RETURNS TABLE(
  total_requests BIGINT,
  success_rate REAL,
  avg_response_ms REAL,
  total_cost DECIMAL,
  reasoning_count BIGINT,
  pending_todos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.total_requests::BIGINT,
    CASE WHEN b.total_requests > 0
      THEN b.successful_requests::REAL / b.total_requests::REAL
      ELSE 0
    END as success_rate,
    b.avg_response_time_ms,
    b.total_cost_usd,
    (SELECT COUNT(*) FROM bucket_reasoning_log WHERE bucket_id = p_bucket_id)::BIGINT,
    (SELECT COUNT(*) FROM bucket_todos WHERE bucket_id = p_bucket_id AND status IN ('pending', 'in_progress'))::BIGINT
  FROM bucket_instances b
  WHERE b.bucket_id = p_bucket_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Initial 12 Buckets Setup
-- ============================================================================

-- Technical Buckets
INSERT INTO bucket_instances (bucket_id, bucket_name, bucket_slug, category, domain_context, domain_url, ollama_model, model_family, description) VALUES
('bucket-code', 'Code Development', 'code', 'Technical', 'code', 'matthewmauer.com', 'codellama:7b', 'llama', 'Software development, debugging, code review'),
('bucket-devops', 'DevOps & Infrastructure', 'devops', 'Technical', 'code', 'matthewmauer.com', 'mistral:7b', 'mistral', 'Server management, deployment, monitoring'),
('bucket-data', 'Data Analysis', 'data', 'Technical', 'reasoning', 'matthewmauer.com', 'deepseek-coder:6.7b', 'deepseek', 'Data processing, statistics, analytics'),
('bucket-security', 'Security Analysis', 'security', 'Technical', 'reasoning', 'matthewmauer.com', 'mistral:7b', 'mistral', 'Security audits, vulnerability scanning');

-- Creative Buckets
INSERT INTO bucket_instances (bucket_id, bucket_name, bucket_slug, category, domain_context, domain_url, ollama_model, model_family, description) VALUES
('bucket-art', 'Art & Design', 'art', 'Creative', 'creative', 'soulfractal.art', 'llama3:8b', 'llama', 'Visual art, design concepts, creative direction'),
('bucket-writing', 'Creative Writing', 'writing', 'Creative', 'creative', 'matthewmauer.com', 'llama3:8b', 'llama', 'Stories, poetry, narrative content'),
('bucket-music', 'Music & Audio', 'music', 'Creative', 'creative', 'soulfractal.art', 'mistral:7b', 'mistral', 'Music theory, composition, audio production'),
('bucket-video', 'Video Production', 'video', 'Creative', 'creative', 'soulfractal.art', 'llama3:8b', 'llama', 'Video concepts, editing, storytelling');

-- Business Buckets
INSERT INTO bucket_instances (bucket_id, bucket_name, bucket_slug, category, domain_context, domain_url, ollama_model, model_family, description) VALUES
('bucket-consulting', 'Technical Consulting', 'consulting', 'Business', 'reasoning', 'matthewmauer.com', 'mistral:7b', 'mistral', 'Client proposals, technical architecture'),
('bucket-education', 'Education & Workshops', 'education', 'Business', 'fact', 'matthewmauer.com', 'llama3:8b', 'llama', 'Teaching materials, course content'),
('bucket-research', 'Research & Analysis', 'research', 'Business', 'reasoning', 'matthewmauer.com', 'qwen2.5-coder:7b', 'qwen', 'Market research, competitive analysis'),
('bucket-support', 'Customer Support', 'support', 'Business', 'simple', 'matthewmauer.com', 'phi3:mini', 'phi', 'Quick answers, documentation lookup');

-- Create initial version for each bucket
DO $$
DECLARE
  bucket RECORD;
BEGIN
  FOR bucket IN SELECT bucket_id, bucket_name, ollama_model FROM bucket_instances LOOP
    INSERT INTO bucket_versions (
      bucket_id,
      version_number,
      version_name,
      version_type,
      config_snapshot,
      changes_summary,
      reasoning,
      created_by
    ) VALUES (
      bucket.bucket_id,
      1,
      'v1.0-initial',
      'major',
      jsonb_build_object(
        'bucket_name', bucket.bucket_name,
        'ollama_model', bucket.ollama_model,
        'status', 'active'
      ),
      'Initial bucket configuration',
      'Created as part of 12-bucket integration system. Model selected based on bucket purpose and domain context.',
      'system'
    );
  END LOOP;
END $$;

COMMIT;
