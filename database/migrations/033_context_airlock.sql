-- Context Airlock System
-- Like package.lock but for domain knowledge/contexts
--
-- Key insight: Freeze the exact state of a domain/bucket at a point in time
-- Enables: Rollback if domain "drifts", A/B testing configurations, reproducible results
--
-- Think: "Git for domain contexts" or "Docker for AI configurations"

-- ============================================================================
-- Domain Context Snapshots
-- Frozen state of a domain at a specific time
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_context_snapshots (
  snapshot_id TEXT PRIMARY KEY,

  -- Which domain/bucket
  domain_context TEXT NOT NULL,   -- 'code', 'creative', 'reasoning', 'fact', 'simple'
  bucket_id TEXT REFERENCES bucket_instances(bucket_id), -- Optional bucket association

  -- Snapshot metadata
  snapshot_name TEXT NOT NULL,    -- Human-readable name
  snapshot_tag TEXT,              -- Version tag: 'v1.0', 'prod-2024-01', 'golden'
  description TEXT,

  -- What's included in this snapshot
  snapshot_type TEXT NOT NULL DEFAULT 'full' CHECK (snapshot_type IN ('full', 'config_only', 'code_only', 'incremental')),

  -- Frozen configuration
  model_config JSONB NOT NULL,    -- {model: 'codellama:7b', temperature: 0.3, max_tokens: 2000}
  wrapper_config JSONB,            -- Wrapper settings if used
  style_guide JSONB,               -- Domain style preferences
  parameters JSONB,                -- Additional parameters

  -- Frozen code library (snapshot of patterns at this time)
  pattern_ids TEXT[],              -- Array of domain_code_examples.example_id
  artifact_ids TEXT[],             -- Array of bucket_artifacts.artifact_id

  -- Performance metrics at snapshot time
  avg_success_rate REAL,
  avg_response_time_ms REAL,
  avg_user_rating REAL,
  total_requests_at_snapshot INTEGER,

  -- Git-like metadata
  parent_snapshot_id TEXT REFERENCES domain_context_snapshots(snapshot_id), -- For incremental snapshots
  is_current BOOLEAN DEFAULT false, -- Is this the active snapshot?
  is_golden BOOLEAN DEFAULT false,  -- Is this a "known good" configuration?

  -- Deployment status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'testing', 'production', 'deprecated', 'archived')),

  -- Rollback tracking
  rolled_back_from TEXT REFERENCES domain_context_snapshots(snapshot_id),
  rollback_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  activated_at TIMESTAMPTZ,        -- When this became current
  deactivated_at TIMESTAMPTZ       -- When this stopped being current
);

CREATE INDEX idx_context_snapshots_domain ON domain_context_snapshots(domain_context);
CREATE INDEX idx_context_snapshots_bucket ON domain_context_snapshots(bucket_id);
CREATE INDEX idx_context_snapshots_tag ON domain_context_snapshots(snapshot_tag);
CREATE INDEX idx_context_snapshots_status ON domain_context_snapshots(status);
CREATE INDEX idx_context_snapshots_current ON domain_context_snapshots(is_current) WHERE is_current = true;
CREATE INDEX idx_context_snapshots_golden ON domain_context_snapshots(is_golden) WHERE is_golden = true;
CREATE INDEX idx_context_snapshots_created ON domain_context_snapshots(created_at DESC);

-- ============================================================================
-- Snapshot Diffs
-- Track what changed between snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshot_diffs (
  diff_id SERIAL PRIMARY KEY,

  -- Which snapshots
  from_snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id),
  to_snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id),

  -- What changed
  change_type TEXT NOT NULL,       -- 'config', 'pattern_added', 'pattern_removed', 'parameter_changed'
  change_path TEXT,                -- JSON path: 'model_config.temperature'
  old_value TEXT,
  new_value TEXT,

  -- Impact
  impact_level TEXT DEFAULT 'minor' CHECK (impact_level IN ('minor', 'moderate', 'major', 'breaking')),
  impact_description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshot_diffs_from ON snapshot_diffs(from_snapshot_id);
CREATE INDEX idx_snapshot_diffs_to ON snapshot_diffs(to_snapshot_id);
CREATE INDEX idx_snapshot_diffs_type ON snapshot_diffs(change_type);

-- ============================================================================
-- Context Lock Files
-- Like package.lock - exact dependencies at a point in time
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_lock_files (
  lock_id TEXT PRIMARY KEY,

  -- Associated snapshot
  snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id) ON DELETE CASCADE,

  -- Lock metadata
  lock_name TEXT NOT NULL,
  lock_version TEXT NOT NULL,      -- Semantic version

  -- Locked dependencies
  model_dependencies JSONB NOT NULL, -- {model: 'codellama:7b', hash: 'abc123', version: '1.0'}
  code_dependencies JSONB NOT NULL,  -- {patterns: [{id: 'x', hash: 'y'}], artifacts: [...]}
  external_dependencies JSONB,       -- NPM, PyPI packages with exact versions

  -- Integrity
  lock_hash TEXT NOT NULL,           -- SHA-256 of entire lock file
  verified BOOLEAN DEFAULT false,    -- Has this been verified to work?
  verification_date TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_lock_files_snapshot ON context_lock_files(snapshot_id);
CREATE INDEX idx_lock_files_hash ON context_lock_files(lock_hash);

-- ============================================================================
-- Snapshot Deployment History
-- Track when/where snapshots were deployed
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshot_deployments (
  deployment_id SERIAL PRIMARY KEY,

  -- Which snapshot
  snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id),

  -- Where deployed
  environment TEXT NOT NULL,       -- 'development', 'staging', 'production'
  bucket_id TEXT REFERENCES bucket_instances(bucket_id),

  -- Deployment metadata
  deployed_by TEXT,
  deployment_method TEXT,          -- 'manual', 'automated', 'rollback'
  deployment_reason TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'failed', 'rolled_back', 'superseded')),

  -- Performance tracking
  requests_served INTEGER DEFAULT 0,
  avg_success_rate REAL,
  avg_response_time_ms REAL,
  error_count INTEGER DEFAULT 0,

  -- Timestamps
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ             -- When this deployment ended
);

CREATE INDEX idx_deployments_snapshot ON snapshot_deployments(snapshot_id);
CREATE INDEX idx_deployments_environment ON snapshot_deployments(environment, status);
CREATE INDEX idx_deployments_bucket ON snapshot_deployments(bucket_id);
CREATE INDEX idx_deployments_date ON snapshot_deployments(deployed_at DESC);

-- ============================================================================
-- Snapshot Validation Results
-- Test results for each snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshot_validations (
  validation_id SERIAL PRIMARY KEY,

  -- Which snapshot
  snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id),

  -- Validation type
  validation_type TEXT NOT NULL,   -- 'unit_test', 'integration_test', 'performance_test', 'manual_review'

  -- Test details
  test_name TEXT,
  test_case TEXT,

  -- Result
  passed BOOLEAN NOT NULL,
  score REAL,                      -- Optional score 0.0-1.0
  error_message TEXT,
  output TEXT,

  -- Performance metrics
  execution_time_ms INTEGER,

  -- Metadata
  validated_at TIMESTAMPTZ DEFAULT NOW(),
  validated_by TEXT
);

CREATE INDEX idx_validations_snapshot ON snapshot_validations(snapshot_id);
CREATE INDEX idx_validations_type ON snapshot_validations(validation_type);
CREATE INDEX idx_validations_passed ON snapshot_validations(passed);

-- ============================================================================
-- Context Drift Detection
-- Track when domains drift from their snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_drift_log (
  drift_id SERIAL PRIMARY KEY,

  -- Which snapshot (baseline)
  snapshot_id TEXT NOT NULL REFERENCES domain_context_snapshots(snapshot_id),

  -- Current state
  bucket_id TEXT REFERENCES bucket_instances(bucket_id),
  domain_context TEXT NOT NULL,

  -- What drifted
  drift_type TEXT NOT NULL,        -- 'config_change', 'pattern_added', 'pattern_removed', 'performance_degradation'
  drift_severity TEXT DEFAULT 'low' CHECK (drift_severity IN ('low', 'medium', 'high', 'critical')),

  -- Details
  expected_value TEXT,
  actual_value TEXT,
  drift_magnitude REAL,            -- How much drift (percentage or absolute)

  -- Impact
  performance_impact TEXT,         -- Description of performance impact
  requests_affected INTEGER,

  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolution_action TEXT,          -- 'rollback', 'update_snapshot', 'ignore'
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drift_log_snapshot ON context_drift_log(snapshot_id);
CREATE INDEX idx_drift_log_bucket ON context_drift_log(bucket_id);
CREATE INDEX idx_drift_log_severity ON context_drift_log(drift_severity);
CREATE INDEX idx_drift_log_resolved ON context_drift_log(resolved);
CREATE INDEX idx_drift_log_detected ON context_drift_log(detected_at DESC);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Current (active) snapshots per domain
CREATE OR REPLACE VIEW active_domain_snapshots AS
SELECT
  dcs.snapshot_id,
  dcs.domain_context,
  dcs.bucket_id,
  dcs.snapshot_name,
  dcs.snapshot_tag,
  dcs.status,
  dcs.is_golden,
  dcs.activated_at,
  dcs.avg_success_rate,
  dcs.avg_user_rating
FROM domain_context_snapshots dcs
WHERE dcs.is_current = true
ORDER BY dcs.domain_context;

-- Golden (known-good) snapshots
CREATE OR REPLACE VIEW golden_snapshots AS
SELECT
  dcs.snapshot_id,
  dcs.domain_context,
  dcs.snapshot_name,
  dcs.snapshot_tag,
  dcs.avg_success_rate,
  dcs.avg_response_time_ms,
  dcs.avg_user_rating,
  dcs.created_at
FROM domain_context_snapshots dcs
WHERE dcs.is_golden = true
ORDER BY dcs.domain_context, dcs.avg_success_rate DESC;

-- Recent drift events
CREATE OR REPLACE VIEW recent_drift_events AS
SELECT
  cdl.drift_id,
  cdl.domain_context,
  cdl.drift_type,
  cdl.drift_severity,
  cdl.expected_value,
  cdl.actual_value,
  cdl.performance_impact,
  cdl.resolved,
  cdl.detected_at,
  dcs.snapshot_name
FROM context_drift_log cdl
JOIN domain_context_snapshots dcs ON cdl.snapshot_id = dcs.snapshot_id
WHERE cdl.detected_at > NOW() - INTERVAL '7 days'
ORDER BY cdl.detected_at DESC, cdl.drift_severity DESC;

-- Snapshot performance comparison
CREATE OR REPLACE VIEW snapshot_performance_comparison AS
SELECT
  sd.snapshot_id,
  dcs.domain_context,
  dcs.snapshot_tag,
  sd.environment,
  sd.requests_served,
  sd.avg_success_rate,
  sd.avg_response_time_ms,
  sd.error_count,
  (sd.error_count::REAL / NULLIF(sd.requests_served, 0)) as error_rate
FROM snapshot_deployments sd
JOIN domain_context_snapshots dcs ON sd.snapshot_id = dcs.snapshot_id
WHERE sd.status = 'active'
ORDER BY sd.environment, dcs.domain_context;

-- ============================================================================
-- Helper Functions
-- ============================================================================

/**
 * Create snapshot from current domain state
 */
CREATE OR REPLACE FUNCTION create_domain_snapshot(
  p_domain_context TEXT,
  p_snapshot_name TEXT,
  p_snapshot_tag TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_snapshot_id TEXT;
  v_pattern_ids TEXT[];
  v_artifact_ids TEXT[];
BEGIN
  -- Generate snapshot ID
  v_snapshot_id := 'snap_' || gen_random_uuid()::TEXT;

  -- Get current patterns
  SELECT array_agg(example_id)
  INTO v_pattern_ids
  FROM domain_code_examples
  WHERE domain_context = p_domain_context
    AND status = 'active'
    AND is_current = true;

  -- Get current artifacts
  SELECT array_agg(artifact_id)
  INTO v_artifact_ids
  FROM bucket_artifacts
  WHERE domain_context = p_domain_context
    AND status = 'active'
    AND is_current = true
  LIMIT 1000; -- Reasonable limit

  -- Create snapshot
  INSERT INTO domain_context_snapshots (
    snapshot_id,
    domain_context,
    snapshot_name,
    snapshot_tag,
    description,
    snapshot_type,
    pattern_ids,
    artifact_ids,
    model_config,
    parameters
  ) VALUES (
    v_snapshot_id,
    p_domain_context,
    p_snapshot_name,
    p_snapshot_tag,
    p_description,
    'full',
    v_pattern_ids,
    v_artifact_ids,
    '{}'::JSONB, -- Placeholder
    '{}'::JSONB  -- Placeholder
  );

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Activate a snapshot (make it current)
 */
CREATE OR REPLACE FUNCTION activate_snapshot(
  p_snapshot_id TEXT,
  p_activated_by TEXT DEFAULT 'system'
) RETURNS BOOLEAN AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Get domain from snapshot
  SELECT domain_context INTO v_domain
  FROM domain_context_snapshots
  WHERE snapshot_id = p_snapshot_id;

  IF v_domain IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found: %', p_snapshot_id;
  END IF;

  -- Deactivate current snapshot
  UPDATE domain_context_snapshots
  SET
    is_current = false,
    deactivated_at = NOW()
  WHERE domain_context = v_domain
    AND is_current = true;

  -- Activate new snapshot
  UPDATE domain_context_snapshots
  SET
    is_current = true,
    activated_at = NOW(),
    status = 'production'
  WHERE snapshot_id = p_snapshot_id;

  -- Log deployment
  INSERT INTO snapshot_deployments (
    snapshot_id,
    environment,
    deployed_by,
    deployment_method,
    status
  ) VALUES (
    p_snapshot_id,
    'production',
    p_activated_by,
    'manual',
    'active'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

/**
 * Rollback to previous snapshot
 */
CREATE OR REPLACE FUNCTION rollback_to_snapshot(
  p_domain_context TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_previous_snapshot_id TEXT;
  v_current_snapshot_id TEXT;
BEGIN
  -- Get current snapshot
  SELECT snapshot_id INTO v_current_snapshot_id
  FROM domain_context_snapshots
  WHERE domain_context = p_domain_context
    AND is_current = true;

  -- Get previous golden snapshot
  SELECT snapshot_id INTO v_previous_snapshot_id
  FROM domain_context_snapshots
  WHERE domain_context = p_domain_context
    AND is_golden = true
    AND snapshot_id != v_current_snapshot_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_previous_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'No previous golden snapshot found for domain: %', p_domain_context;
  END IF;

  -- Mark current snapshot as rolled back
  UPDATE domain_context_snapshots
  SET
    rolled_back_from = v_current_snapshot_id,
    rollback_reason = p_reason
  WHERE snapshot_id = v_previous_snapshot_id;

  -- Activate previous snapshot
  PERFORM activate_snapshot(v_previous_snapshot_id, 'rollback');

  RETURN v_previous_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Ensure only one current snapshot per domain
CREATE OR REPLACE FUNCTION enforce_single_current_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE domain_context_snapshots
    SET is_current = false, deactivated_at = NOW()
    WHERE domain_context = NEW.domain_context
      AND snapshot_id != NEW.snapshot_id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_single_current_snapshot
  BEFORE INSERT OR UPDATE ON domain_context_snapshots
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION enforce_single_current_snapshot();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE domain_context_snapshots IS 'Frozen state of a domain at a specific time - like package.lock for AI contexts';
COMMENT ON TABLE snapshot_diffs IS 'Track what changed between snapshots';
COMMENT ON TABLE context_lock_files IS 'Exact dependencies at a point in time (package.lock equivalent)';
COMMENT ON TABLE snapshot_deployments IS 'Track when/where snapshots were deployed';
COMMENT ON TABLE snapshot_validations IS 'Test results for each snapshot';
COMMENT ON TABLE context_drift_log IS 'Detect when domains drift from their snapshots';
COMMENT ON COLUMN domain_context_snapshots.is_golden IS 'Known-good configuration that can be used for rollback';
COMMENT ON FUNCTION create_domain_snapshot IS 'Create snapshot from current domain state';
COMMENT ON FUNCTION activate_snapshot IS 'Make a snapshot the active/current one';
COMMENT ON FUNCTION rollback_to_snapshot IS 'Rollback to previous golden snapshot';
