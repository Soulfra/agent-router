/**
 * Component Relationships (Cross-Reference System)
 *
 * Tracks where every component is used throughout the system
 * Enables "xrefs hotkey: x" functionality - show all usage sites
 *
 * Components tracked:
 * - Buckets (bucket-code, bucket-creative, etc.)
 * - Domains (code, creative, reasoning, etc.)
 * - Models (deepseek-r1, claude-3-5-sonnet-20241022, etc.)
 * - Patterns (from domain_code_examples)
 * - Artifacts (from bucket_artifacts)
 * - Workflows
 * - Presets (from domain_parameter_presets)
 *
 * Relationship types:
 * - uses_pattern: Request/Artifact uses a pattern from domain library
 * - uses_model: Request uses a specific model
 * - uses_bucket: Request routed to bucket
 * - uses_domain: Request operates in domain context
 * - uses_preset: Bucket uses a parameter preset
 * - uses_artifact: Artifact references another artifact
 * - depends_on: General dependency relationship
 */

-- Drop existing objects if they exist
DROP TABLE IF EXISTS component_relationships CASCADE;
DROP TABLE IF EXISTS component_usage_stats CASCADE;
DROP INDEX IF EXISTS idx_component_relationships_source;
DROP INDEX IF EXISTS idx_component_relationships_target;
DROP INDEX IF EXISTS idx_component_relationships_type;
DROP INDEX IF EXISTS idx_component_relationships_lookup;

-- Main relationship tracking table
CREATE TABLE component_relationships (
  relationship_id SERIAL PRIMARY KEY,

  -- Source component (the component doing the using)
  source_type TEXT NOT NULL, -- 'request', 'bucket', 'artifact', 'workflow'
  source_id TEXT NOT NULL,

  -- Target component (the component being used)
  target_type TEXT NOT NULL, -- 'pattern', 'model', 'bucket', 'domain', 'preset', 'artifact'
  target_id TEXT NOT NULL,

  -- Relationship details
  relationship_type TEXT NOT NULL, -- 'uses_pattern', 'uses_model', 'uses_bucket', etc.

  -- Context
  user_id UUID,
  session_id TEXT,
  request_id UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Performance tracking
  execution_time_ms INTEGER,
  success BOOLEAN,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CHECK (source_type IN ('request', 'bucket', 'artifact', 'workflow', 'pattern')),
  CHECK (target_type IN ('pattern', 'model', 'bucket', 'domain', 'preset', 'artifact', 'workflow')),
  CHECK (relationship_type IN (
    'uses_pattern',
    'uses_model',
    'uses_bucket',
    'uses_domain',
    'uses_preset',
    'uses_artifact',
    'depends_on',
    'references',
    'extends'
  ))
);

-- Usage statistics (aggregated view)
CREATE TABLE component_usage_stats (
  stat_id SERIAL PRIMARY KEY,

  -- Component being tracked
  component_type TEXT NOT NULL,
  component_id TEXT NOT NULL,

  -- Usage metrics
  total_uses INTEGER DEFAULT 0,
  successful_uses INTEGER DEFAULT 0,
  failed_uses INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,

  -- Performance metrics
  avg_execution_time_ms REAL,
  min_execution_time_ms INTEGER,
  max_execution_time_ms INTEGER,

  -- Relationship metrics
  unique_users INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  unique_sources INTEGER DEFAULT 0, -- How many different components use this

  -- Time metrics
  first_used_at TIMESTAMP,
  last_used_at TIMESTAMP,

  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(component_type, component_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_component_relationships_source ON component_relationships(source_type, source_id);
CREATE INDEX idx_component_relationships_target ON component_relationships(target_type, target_id);
CREATE INDEX idx_component_relationships_type ON component_relationships(relationship_type);
CREATE INDEX idx_component_relationships_lookup ON component_relationships(target_type, target_id, relationship_type);
CREATE INDEX idx_component_relationships_user ON component_relationships(user_id);
CREATE INDEX idx_component_relationships_session ON component_relationships(session_id);
CREATE INDEX idx_component_relationships_request ON component_relationships(request_id);
CREATE INDEX idx_component_relationships_created ON component_relationships(created_at);

CREATE INDEX idx_component_usage_stats_lookup ON component_usage_stats(component_type, component_id);
CREATE INDEX idx_component_usage_stats_uses ON component_usage_stats(total_uses DESC);
CREATE INDEX idx_component_usage_stats_success ON component_usage_stats(success_rate DESC);

-- Function to record a relationship
CREATE OR REPLACE FUNCTION record_component_relationship(
  p_source_type TEXT,
  p_source_id TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_relationship_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_execution_time_ms INTEGER DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_relationship_id INTEGER;
BEGIN
  -- Insert relationship
  INSERT INTO component_relationships (
    source_type,
    source_id,
    target_type,
    target_id,
    relationship_type,
    user_id,
    session_id,
    request_id,
    metadata,
    execution_time_ms,
    success,
    error_message
  ) VALUES (
    p_source_type,
    p_source_id,
    p_target_type,
    p_target_id,
    p_relationship_type,
    p_user_id,
    p_session_id,
    p_request_id,
    p_metadata,
    p_execution_time_ms,
    p_success,
    p_error_message
  ) RETURNING relationship_id INTO v_relationship_id;

  -- Update usage stats (async trigger will handle this)
  RETURN v_relationship_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get all usages of a component (xrefs)
CREATE OR REPLACE FUNCTION get_component_usages(
  p_component_type TEXT,
  p_component_id TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  source_type TEXT,
  source_id TEXT,
  relationship_type TEXT,
  user_id UUID,
  session_id TEXT,
  request_id UUID,
  created_at TIMESTAMP,
  execution_time_ms INTEGER,
  success BOOLEAN,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.source_type,
    cr.source_id,
    cr.relationship_type,
    cr.user_id,
    cr.session_id,
    cr.request_id,
    cr.created_at,
    cr.execution_time_ms,
    cr.success,
    cr.metadata
  FROM component_relationships cr
  WHERE cr.target_type = p_component_type
    AND cr.target_id = p_component_id
  ORDER BY cr.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get all dependencies of a component
CREATE OR REPLACE FUNCTION get_component_dependencies(
  p_component_type TEXT,
  p_component_id TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  target_type TEXT,
  target_id TEXT,
  relationship_type TEXT,
  created_at TIMESTAMP,
  execution_time_ms INTEGER,
  success BOOLEAN,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.target_type,
    cr.target_id,
    cr.relationship_type,
    cr.created_at,
    cr.execution_time_ms,
    cr.success,
    cr.metadata
  FROM component_relationships cr
  WHERE cr.source_type = p_component_type
    AND cr.source_id = p_component_id
  ORDER BY cr.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get component graph (for visualization)
CREATE OR REPLACE FUNCTION get_component_graph(
  p_component_type TEXT,
  p_component_id TEXT,
  p_depth INTEGER DEFAULT 2
) RETURNS TABLE (
  from_type TEXT,
  from_id TEXT,
  to_type TEXT,
  to_id TEXT,
  relationship_type TEXT,
  depth INTEGER,
  usage_count INTEGER,
  success_rate REAL
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph AS (
    -- Base case: direct relationships
    SELECT
      cr.source_type as from_type,
      cr.source_id as from_id,
      cr.target_type as to_type,
      cr.target_id as to_id,
      cr.relationship_type,
      1 as depth,
      COUNT(*)::INTEGER as usage_count,
      AVG(CASE WHEN cr.success THEN 1.0 ELSE 0.0 END)::REAL as success_rate
    FROM component_relationships cr
    WHERE (cr.source_type = p_component_type AND cr.source_id = p_component_id)
       OR (cr.target_type = p_component_type AND cr.target_id = p_component_id)
    GROUP BY cr.source_type, cr.source_id, cr.target_type, cr.target_id, cr.relationship_type

    UNION

    -- Recursive case: follow relationships
    SELECT
      cr.source_type,
      cr.source_id,
      cr.target_type,
      cr.target_id,
      cr.relationship_type,
      g.depth + 1,
      COUNT(*)::INTEGER,
      AVG(CASE WHEN cr.success THEN 1.0 ELSE 0.0 END)::REAL
    FROM component_relationships cr
    JOIN graph g ON (
      (cr.source_type = g.to_type AND cr.source_id = g.to_id)
      OR (cr.target_type = g.from_type AND cr.target_id = g.from_id)
    )
    WHERE g.depth < p_depth
    GROUP BY cr.source_type, cr.source_id, cr.target_type, cr.target_id, cr.relationship_type, g.depth
  )
  SELECT * FROM graph
  ORDER BY depth, usage_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update usage stats
CREATE OR REPLACE FUNCTION update_component_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert stats for target component
  INSERT INTO component_usage_stats (
    component_type,
    component_id,
    total_uses,
    successful_uses,
    failed_uses,
    success_rate,
    avg_execution_time_ms,
    min_execution_time_ms,
    max_execution_time_ms,
    unique_users,
    unique_sessions,
    unique_sources,
    first_used_at,
    last_used_at,
    updated_at
  )
  SELECT
    NEW.target_type,
    NEW.target_id,
    1,
    CASE WHEN NEW.success THEN 1 ELSE 0 END,
    CASE WHEN NEW.success THEN 0 ELSE 1 END,
    CASE WHEN NEW.success THEN 1.0 ELSE 0.0 END,
    NEW.execution_time_ms::REAL,
    NEW.execution_time_ms,
    NEW.execution_time_ms,
    1,
    1,
    1,
    NEW.created_at,
    NEW.created_at,
    NOW()
  ON CONFLICT (component_type, component_id) DO UPDATE SET
    total_uses = component_usage_stats.total_uses + 1,
    successful_uses = component_usage_stats.successful_uses + CASE WHEN NEW.success THEN 1 ELSE 0 END,
    failed_uses = component_usage_stats.failed_uses + CASE WHEN NEW.success THEN 0 ELSE 1 END,
    success_rate = (component_usage_stats.successful_uses + CASE WHEN NEW.success THEN 1 ELSE 0 END)::REAL /
                   (component_usage_stats.total_uses + 1)::REAL,
    avg_execution_time_ms = CASE
      WHEN NEW.execution_time_ms IS NOT NULL THEN
        (COALESCE(component_usage_stats.avg_execution_time_ms, 0) * component_usage_stats.total_uses + NEW.execution_time_ms) /
        (component_usage_stats.total_uses + 1)
      ELSE component_usage_stats.avg_execution_time_ms
    END,
    min_execution_time_ms = CASE
      WHEN NEW.execution_time_ms IS NOT NULL THEN
        LEAST(COALESCE(component_usage_stats.min_execution_time_ms, NEW.execution_time_ms), NEW.execution_time_ms)
      ELSE component_usage_stats.min_execution_time_ms
    END,
    max_execution_time_ms = CASE
      WHEN NEW.execution_time_ms IS NOT NULL THEN
        GREATEST(COALESCE(component_usage_stats.max_execution_time_ms, NEW.execution_time_ms), NEW.execution_time_ms)
      ELSE component_usage_stats.max_execution_time_ms
    END,
    last_used_at = NEW.created_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_component_usage_stats
AFTER INSERT ON component_relationships
FOR EACH ROW
EXECUTE FUNCTION update_component_usage_stats();

-- Helper view: Most used components
CREATE OR REPLACE VIEW most_used_components AS
SELECT
  component_type,
  component_id,
  total_uses,
  successful_uses,
  success_rate,
  avg_execution_time_ms,
  unique_users,
  unique_sessions,
  last_used_at
FROM component_usage_stats
WHERE total_uses > 0
ORDER BY total_uses DESC, success_rate DESC
LIMIT 100;

-- Helper view: Recently used components
CREATE OR REPLACE VIEW recently_used_components AS
SELECT
  component_type,
  component_id,
  total_uses,
  success_rate,
  last_used_at
FROM component_usage_stats
WHERE last_used_at IS NOT NULL
ORDER BY last_used_at DESC
LIMIT 100;

-- Helper view: Component performance
CREATE OR REPLACE VIEW component_performance AS
SELECT
  component_type,
  component_id,
  total_uses,
  success_rate,
  avg_execution_time_ms,
  min_execution_time_ms,
  max_execution_time_ms,
  last_used_at
FROM component_usage_stats
WHERE total_uses >= 10 -- Minimum 10 uses for statistical relevance
ORDER BY success_rate DESC, avg_execution_time_ms ASC;

COMMENT ON TABLE component_relationships IS 'Tracks all component usage relationships (xrefs) throughout the system';
COMMENT ON TABLE component_usage_stats IS 'Aggregated usage statistics for each component';
COMMENT ON FUNCTION record_component_relationship IS 'Records a new component relationship/usage';
COMMENT ON FUNCTION get_component_usages IS 'Gets all usages of a component (xrefs hotkey: x)';
COMMENT ON FUNCTION get_component_dependencies IS 'Gets all dependencies of a component';
COMMENT ON FUNCTION get_component_graph IS 'Builds a relationship graph for visualization (D3.js)';
