/**
 * Migration 019: Autonomous Mode System
 *
 * The "copilot mode" - user describes what they want, system builds it autonomously.
 * Connects Builder Agent + Model Council + Pattern Learner + Code Indexer.
 *
 * Vision: "Build a visitor counter widget" → 3 minutes later it's deployed
 *
 * Features:
 * - Autonomous build sessions
 * - Intent parsing and categorization
 * - Pattern matching from history
 * - Existing code search results
 * - Learning from successful builds
 * - Self-improvement tracking
 */

-- ============================================================================
-- 1. AUTONOMOUS SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User request
  prompt TEXT NOT NULL, -- Natural language: "Build a visitor counter widget"

  -- Parsed intent
  intent JSONB, -- { action, target, category, complexity, requiredSystems }

  -- Discovery phase
  similar_patterns JSONB DEFAULT '[]', -- Pattern matches found
  existing_code JSONB DEFAULT '[]', -- Relevant code files found

  -- Build phase
  council_session_id UUID REFERENCES council_sessions(session_id), -- Model Council session
  consensus JSONB, -- Final approach from Model Council

  -- Results
  result JSONB, -- Build results (files generated, tests run, etc)
  success BOOLEAN, -- Did build succeed?
  error_message TEXT, -- If failed

  -- Files generated
  files_generated JSONB DEFAULT '[]', -- Array of file paths
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000
      ELSE NULL
    END
  ) STORED
);

CREATE INDEX idx_autonomous_sessions_success ON autonomous_sessions(success);
CREATE INDEX idx_autonomous_sessions_created_at ON autonomous_sessions(created_at DESC);
CREATE INDEX idx_autonomous_sessions_duration ON autonomous_sessions(duration_ms) WHERE success = TRUE;
CREATE INDEX idx_autonomous_sessions_council ON autonomous_sessions(council_session_id) WHERE council_session_id IS NOT NULL;

COMMENT ON TABLE autonomous_sessions IS 'Autonomous mode build sessions (copilot mode)';

-- ============================================================================
-- 2. PATTERN MATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_patterns (
  pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES autonomous_sessions(session_id) ON DELETE CASCADE,

  -- Pattern details
  action VARCHAR(200) NOT NULL, -- 'build', 'fix', 'improve', 'test', 'explain'
  context JSONB NOT NULL, -- Full context of what was done

  -- Similarity
  similarity_score DECIMAL(3,2), -- 0.00 to 1.00
  matched_session_id UUID REFERENCES autonomous_sessions(session_id), -- Which past session matched

  -- Usage
  times_reused INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2), -- How often this pattern leads to success

  -- Metadata
  pattern_metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_autonomous_patterns_session ON autonomous_patterns(session_id);
CREATE INDEX idx_autonomous_patterns_action ON autonomous_patterns(action);
CREATE INDEX idx_autonomous_patterns_similarity ON autonomous_patterns(similarity_score DESC);

COMMENT ON TABLE autonomous_patterns IS 'Learned patterns from successful autonomous builds';

-- ============================================================================
-- 3. CODE MATCHES (from Code Indexer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_code_matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES autonomous_sessions(session_id) ON DELETE CASCADE,

  -- Match details
  file_path TEXT NOT NULL,
  match_score DECIMAL(5,4), -- Similarity score from pgvector
  match_reason TEXT, -- Why this file was matched

  -- Usage
  was_helpful BOOLEAN, -- Did this code help the build?
  incorporated BOOLEAN DEFAULT FALSE, -- Was code reused/referenced?

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_autonomous_code_matches_session ON autonomous_code_matches(session_id);
CREATE INDEX idx_autonomous_code_matches_score ON autonomous_code_matches(match_score DESC);
CREATE INDEX idx_autonomous_code_matches_helpful ON autonomous_code_matches(was_helpful) WHERE was_helpful = TRUE;

COMMENT ON TABLE autonomous_code_matches IS 'Code search results from autonomous builds';

-- ============================================================================
-- 4. SELF-IMPROVEMENT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_improvements (
  improvement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was improved
  improvement_type VARCHAR(100) NOT NULL, -- 'prompt_optimization', 'pattern_learning', 'code_reuse', etc
  description TEXT NOT NULL,

  -- Metrics
  baseline_metric DECIMAL(10,2), -- Before improvement
  improved_metric DECIMAL(10,2), -- After improvement
  improvement_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN baseline_metric > 0
      THEN ((improved_metric - baseline_metric) / baseline_metric) * 100
      ELSE NULL
    END
  ) STORED,

  -- Evidence
  evidence JSONB, -- Session IDs, stats, etc that prove improvement

  -- Implementation
  implemented BOOLEAN DEFAULT FALSE,
  implemented_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_autonomous_improvements_type ON autonomous_improvements(improvement_type);
CREATE INDEX idx_autonomous_improvements_impact ON autonomous_improvements(improvement_percentage DESC NULLS LAST);
CREATE INDEX idx_autonomous_improvements_implemented ON autonomous_improvements(implemented, created_at);

COMMENT ON TABLE autonomous_improvements IS 'Self-improvement tracking for autonomous mode';

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

/**
 * Get autonomous mode statistics
 */
CREATE OR REPLACE FUNCTION get_autonomous_stats()
RETURNS TABLE(
  total_builds INTEGER,
  successful_builds INTEGER,
  success_rate DECIMAL(5,2),
  avg_duration_ms DECIMAL(10,2),
  total_files_generated INTEGER,
  avg_files_per_build DECIMAL(5,2),
  test_pass_rate DECIMAL(5,2),
  patterns_learned INTEGER,
  improvements_made INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_builds,
    COUNT(*) FILTER (WHERE success = TRUE)::INTEGER as successful_builds,
    (COUNT(*) FILTER (WHERE success = TRUE)::DECIMAL / NULLIF(COUNT(*), 0) * 100) as success_rate,
    AVG(duration_ms) as avg_duration_ms,
    SUM(jsonb_array_length(files_generated))::INTEGER as total_files_generated,
    AVG(jsonb_array_length(files_generated)) as avg_files_per_build,
    (
      SUM(tests_passed)::DECIMAL /
      NULLIF(SUM(tests_passed + tests_failed), 0) * 100
    ) as test_pass_rate,
    (SELECT COUNT(*) FROM autonomous_patterns)::INTEGER as patterns_learned,
    (SELECT COUNT(*) FROM autonomous_improvements WHERE implemented = TRUE)::INTEGER as improvements_made
  FROM autonomous_sessions;
END;
$$ LANGUAGE plpgsql;

/**
 * Record pattern match for learning
 */
CREATE OR REPLACE FUNCTION record_pattern_match(
  p_session_id UUID,
  p_action VARCHAR(200),
  p_context JSONB,
  p_similarity DECIMAL(3,2),
  p_matched_session UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_pattern_id UUID;
BEGIN
  INSERT INTO autonomous_patterns (
    session_id,
    action,
    context,
    similarity_score,
    matched_session_id
  ) VALUES (
    p_session_id,
    p_action,
    p_context,
    p_similarity,
    p_matched_session
  )
  RETURNING pattern_id INTO v_pattern_id;

  RETURN v_pattern_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Update pattern success rate after session completes
 */
CREATE OR REPLACE FUNCTION update_pattern_success_rates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.success IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    -- Update patterns from this session
    UPDATE autonomous_patterns ap
    SET
      times_reused = times_reused + 1,
      success_rate = (
        SELECT
          COUNT(*) FILTER (WHERE asess.success = TRUE)::DECIMAL /
          NULLIF(COUNT(*), 0)
        FROM autonomous_sessions asess
        JOIN autonomous_patterns ap2 ON ap2.session_id = asess.session_id
        WHERE ap2.action = ap.action
      )
    WHERE ap.session_id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patterns_on_session_complete
AFTER UPDATE OF success, completed_at ON autonomous_sessions
FOR EACH ROW
WHEN (NEW.success IS NOT NULL AND NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION update_pattern_success_rates();

/**
 * Find similar sessions for pattern matching
 */
CREATE OR REPLACE FUNCTION find_similar_sessions(
  p_prompt TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
  session_id UUID,
  prompt TEXT,
  intent JSONB,
  similarity DECIMAL(3,2),
  success BOOLEAN,
  duration_ms INTEGER,
  files_generated JSONB
) AS $$
BEGIN
  -- Simple text similarity using word overlap
  -- In production, this would use embeddings/pgvector
  RETURN QUERY
  SELECT
    asess.session_id,
    asess.prompt,
    asess.intent,
    0.8::DECIMAL(3,2) as similarity, -- Placeholder
    asess.success,
    asess.duration_ms,
    asess.files_generated
  FROM autonomous_sessions asess
  WHERE asess.success = TRUE
    AND asess.completed_at IS NOT NULL
  ORDER BY asess.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. VIEWS
-- ============================================================================

-- Recent autonomous builds
CREATE OR REPLACE VIEW recent_autonomous_builds AS
SELECT
  asess.session_id,
  asess.prompt,
  asess.intent->>'category' as category,
  asess.intent->>'complexity' as complexity,
  asess.success,
  asess.duration_ms,
  jsonb_array_length(asess.files_generated) as file_count,
  asess.tests_passed,
  asess.tests_failed,
  asess.created_at,
  asess.completed_at,
  cs.status as council_status
FROM autonomous_sessions asess
LEFT JOIN council_sessions cs ON cs.session_id = asess.council_session_id
ORDER BY asess.created_at DESC
LIMIT 50;

-- Top patterns by success rate
CREATE OR REPLACE VIEW top_autonomous_patterns AS
SELECT
  ap.action,
  COUNT(DISTINCT ap.session_id) as usage_count,
  AVG(ap.similarity_score) as avg_similarity,
  AVG(ap.success_rate) as avg_success_rate,
  ap.pattern_metadata
FROM autonomous_patterns ap
GROUP BY ap.action, ap.pattern_metadata
HAVING COUNT(DISTINCT ap.session_id) > 2
ORDER BY avg_success_rate DESC NULLS LAST, usage_count DESC
LIMIT 20;

-- Self-improvement leaderboard
CREATE OR REPLACE VIEW autonomous_improvement_leaderboard AS
SELECT
  ai.improvement_type,
  COUNT(*) as improvement_count,
  AVG(ai.improvement_percentage) as avg_improvement,
  SUM(CASE WHEN ai.implemented THEN 1 ELSE 0 END) as implemented_count,
  MAX(ai.improvement_percentage) as best_improvement
FROM autonomous_improvements ai
GROUP BY ai.improvement_type
ORDER BY avg_improvement DESC NULLS LAST;

COMMENT ON VIEW recent_autonomous_builds IS 'Recent autonomous mode builds with stats';
COMMENT ON VIEW top_autonomous_patterns IS 'Most successful patterns for reuse';
COMMENT ON VIEW autonomous_improvement_leaderboard IS 'Self-improvement tracking';
