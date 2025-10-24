/**
 * Migration 018: Model Council System
 *
 * Multi-model collaborative building system where AI models work together
 * (and argue) to solve problems. Each model gets a timed slot, with
 * entertaining debates and consensus building.
 *
 * Features:
 * - Council sessions with multiple models
 * - Model proposals (each model's contribution)
 * - Inter-model debates
 * - Consensus building
 * - Voting system
 * - Workflow breakdown
 */

-- ============================================================================
-- 1. COUNCIL SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task details
  task TEXT NOT NULL, -- What to build
  task_type VARCHAR(50), -- 'backend', 'frontend', 'database', 'fullstack', 'general'

  -- Session status
  status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'

  -- Model participation
  models JSONB NOT NULL DEFAULT '[]', -- Array of model names that participated
  model_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(models)) STORED,

  -- Results
  consensus JSONB, -- Final consensus (approach, confidence, supporting_models)
  winning_proposal UUID, -- References council_proposals(proposal_id) - added later
  vote_results JSONB, -- Final vote tallies

  -- Metadata
  task_metadata JSONB DEFAULT '{}',
  error_message TEXT, -- If status = 'failed'

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
      ELSE NULL
    END
  ) STORED
);

CREATE INDEX idx_council_sessions_status ON council_sessions(status);
CREATE INDEX idx_council_sessions_task_type ON council_sessions(task_type);
CREATE INDEX idx_council_sessions_started_at ON council_sessions(started_at DESC);

COMMENT ON TABLE council_sessions IS 'AI Model Council collaborative building sessions';

-- ============================================================================
-- 2. MODEL PROPOSALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES council_sessions(session_id) ON DELETE CASCADE,

  -- Model details
  model_name VARCHAR(200) NOT NULL, -- ollama:llama2, etc
  model_display_name VARCHAR(200), -- "Llama2"
  model_character VARCHAR(200), -- "Optimistic Generalist"
  model_emoji VARCHAR(10), -- "🦙"

  -- Proposal content
  proposal TEXT NOT NULL,
  formatted_proposal TEXT, -- With personality formatting

  -- Performance
  duration_ms INTEGER, -- How long model took to respond
  timed_out BOOLEAN DEFAULT FALSE,
  error_message TEXT,

  -- Metadata
  proposal_metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_council_proposals_session ON council_proposals(session_id, created_at);
CREATE INDEX idx_council_proposals_model ON council_proposals(model_name);
CREATE INDEX idx_council_proposals_duration ON council_proposals(duration_ms) WHERE timed_out = FALSE;

COMMENT ON TABLE council_proposals IS 'Individual model proposals in council sessions';

-- ============================================================================
-- 3. MODEL DEBATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_debates (
  debate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES council_sessions(session_id) ON DELETE CASCADE,

  -- Debating models
  model1_name VARCHAR(200) NOT NULL,
  model1_display_name VARCHAR(200),
  model2_name VARCHAR(200) NOT NULL,
  model2_display_name VARCHAR(200),

  -- Debate details
  topic VARCHAR(500), -- What they're debating
  comment TEXT NOT NULL, -- Description of the debate

  -- Outcome
  winner VARCHAR(200), -- Which model "won" the debate (if applicable)
  audience_favorite VARCHAR(200), -- User-voted favorite

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_council_debates_session ON council_debates(session_id, created_at);

COMMENT ON TABLE council_debates IS 'Debates between models during council sessions';

-- ============================================================================
-- 4. CONSENSUS THEMES
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_themes (
  theme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES council_sessions(session_id) ON DELETE CASCADE,

  -- Theme details
  theme_name VARCHAR(200) NOT NULL, -- "MVP first", "API-first", etc
  theme_description TEXT,

  -- Support
  supporting_models JSONB DEFAULT '[]', -- Array of model names
  support_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(supporting_models)) STORED,
  confidence DECIMAL(3,2), -- 0.00 to 1.00

  -- Ranking
  rank INTEGER, -- 1 = most popular theme

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_council_themes_session ON council_themes(session_id, rank);

COMMENT ON TABLE council_themes IS 'Extracted themes and approaches from proposals';

-- ============================================================================
-- 5. WORKFLOW TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_workflows (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES council_sessions(session_id) ON DELETE CASCADE,

  -- Task details
  task_title VARCHAR(500) NOT NULL,
  task_description TEXT,
  task_type VARCHAR(50), -- 'frontend', 'backend', 'database', 'devops', etc

  -- Assignment
  assigned_model VARCHAR(200), -- Which model should handle this
  priority INTEGER DEFAULT 5, -- 1-10 (1 = highest)
  estimated_duration_minutes INTEGER,

  -- Dependencies
  depends_on UUID REFERENCES council_workflows(workflow_id), -- Previous task that must complete first
  blocks JSONB DEFAULT '[]', -- Array of workflow_ids this blocks

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'blocked'

  -- Metadata
  task_metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_council_workflows_session ON council_workflows(session_id, priority DESC);
CREATE INDEX idx_council_workflows_assigned ON council_workflows(assigned_model);
CREATE INDEX idx_council_workflows_status ON council_workflows(status) WHERE status != 'completed';
CREATE INDEX idx_council_workflows_depends ON council_workflows(depends_on) WHERE depends_on IS NOT NULL;

COMMENT ON TABLE council_workflows IS 'Breakdown of tasks from council consensus';

-- ============================================================================
-- 6. MODEL PERFORMANCE STATS
-- ============================================================================

CREATE TABLE IF NOT EXISTS council_model_stats (
  model_name VARCHAR(200) PRIMARY KEY,

  -- Participation
  total_sessions INTEGER DEFAULT 0,
  total_proposals INTEGER DEFAULT 0,

  -- Performance
  avg_response_time_ms DECIMAL(10,2),
  timeout_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Success metrics
  times_in_consensus INTEGER DEFAULT 0, -- How often this model's ideas make it to consensus
  times_won_vote INTEGER DEFAULT 0, -- How often this model wins the final vote

  -- Debate stats
  debates_participated INTEGER DEFAULT 0,
  debates_won INTEGER DEFAULT 0,

  -- Last activity
  last_session_id UUID REFERENCES council_sessions(session_id),
  last_seen TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_council_model_stats_performance ON council_model_stats(avg_response_time_ms);
CREATE INDEX idx_council_model_stats_success ON council_model_stats(times_won_vote DESC);

COMMENT ON TABLE council_model_stats IS 'Aggregate performance statistics per model';

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

/**
 * Update model statistics after a session
 */
CREATE OR REPLACE FUNCTION update_council_model_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stats for models that participated
  IF NEW.status = 'completed' THEN
    -- Update participation counts
    WITH proposal_stats AS (
      SELECT
        model_name,
        COUNT(*) as proposal_count,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN timed_out THEN 1 ELSE 0 END) as timeouts,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as errors
      FROM council_proposals
      WHERE session_id = NEW.session_id
        AND timed_out = FALSE
      GROUP BY model_name
    )
    INSERT INTO council_model_stats (
      model_name,
      total_sessions,
      total_proposals,
      avg_response_time_ms,
      timeout_count,
      error_count,
      last_session_id,
      last_seen
    )
    SELECT
      model_name,
      1,
      proposal_count,
      avg_duration,
      timeouts,
      errors,
      NEW.session_id,
      NOW()
    FROM proposal_stats
    ON CONFLICT (model_name) DO UPDATE SET
      total_sessions = council_model_stats.total_sessions + 1,
      total_proposals = council_model_stats.total_proposals + EXCLUDED.total_proposals,
      avg_response_time_ms = (
        (council_model_stats.avg_response_time_ms * council_model_stats.total_proposals +
         EXCLUDED.avg_response_time_ms * EXCLUDED.total_proposals) /
        (council_model_stats.total_proposals + EXCLUDED.total_proposals)
      ),
      timeout_count = council_model_stats.timeout_count + EXCLUDED.timeout_count,
      error_count = council_model_stats.error_count + EXCLUDED.error_count,
      last_session_id = NEW.session_id,
      last_seen = NOW(),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_model_stats_on_session_complete
AFTER UPDATE OF status ON council_sessions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION update_council_model_stats();

/**
 * Get top performing models
 */
CREATE OR REPLACE FUNCTION get_top_council_models(
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
  model_name VARCHAR(200),
  total_sessions INTEGER,
  win_rate DECIMAL(5,2),
  avg_response_ms DECIMAL(10,2),
  reliability_score DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cms.model_name,
    cms.total_sessions,
    CASE
      WHEN cms.total_sessions > 0
      THEN (cms.times_won_vote::DECIMAL / cms.total_sessions * 100)
      ELSE 0
    END as win_rate,
    cms.avg_response_time_ms,
    -- Reliability = (1 - timeout_rate) * (1 - error_rate)
    (
      (1.0 - COALESCE(cms.timeout_count::DECIMAL / NULLIF(cms.total_proposals, 0), 0)) *
      (1.0 - COALESCE(cms.error_count::DECIMAL / NULLIF(cms.total_proposals, 0), 0))
    ) * 100 as reliability_score
  FROM council_model_stats cms
  WHERE cms.total_sessions > 0
  ORDER BY reliability_score DESC, win_rate DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- Active council sessions (for monitoring)
CREATE OR REPLACE VIEW active_council_sessions AS
SELECT
  cs.session_id,
  cs.task,
  cs.task_type,
  cs.status,
  cs.model_count,
  cs.started_at,
  EXTRACT(EPOCH FROM (NOW() - cs.started_at)) * 1000 as running_duration_ms,
  COUNT(DISTINCT cp.proposal_id) as proposals_received,
  COUNT(DISTINCT cd.debate_id) as debates_count
FROM council_sessions cs
LEFT JOIN council_proposals cp ON cp.session_id = cs.session_id
LEFT JOIN council_debates cd ON cd.session_id = cs.session_id
WHERE cs.status = 'running'
GROUP BY cs.session_id, cs.task, cs.task_type, cs.status, cs.model_count, cs.started_at;

-- Session summaries (for history)
CREATE OR REPLACE VIEW council_session_summaries AS
SELECT
  cs.session_id,
  cs.task,
  cs.task_type,
  cs.status,
  cs.model_count,
  COUNT(DISTINCT cp.proposal_id) as proposal_count,
  COUNT(DISTINCT cd.debate_id) as debate_count,
  COUNT(DISTINCT cw.workflow_id) as task_count,
  cs.consensus->>'approach' as winning_approach,
  cs.vote_results->'winner'->>'model' as winning_model,
  cs.duration_ms,
  cs.started_at,
  cs.completed_at
FROM council_sessions cs
LEFT JOIN council_proposals cp ON cp.session_id = cs.session_id
LEFT JOIN council_debates cd ON cd.session_id = cs.session_id
LEFT JOIN council_workflows cw ON cw.session_id = cs.session_id
WHERE cs.status = 'completed'
GROUP BY cs.session_id, cs.task, cs.task_type, cs.status, cs.model_count,
         cs.consensus, cs.vote_results, cs.duration_ms, cs.started_at, cs.completed_at;

COMMENT ON DATABASE calos IS 'CalOS - AI Model Council collaborative building system';
