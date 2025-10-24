-- Migration 059: Builder Case Study System
-- Auto-updating dashboards for $1 builders tracking their company/project journey
-- Cross-reference ecosystem showing how projects connect and reference each other

-- ============================================================================
-- BUILDER CASE STUDIES: Track builder journey from $1 investment to company
-- ============================================================================

CREATE TYPE builder_stage AS ENUM (
  'ideation',       -- Just started, exploring ideas
  'building',       -- Actively building
  'launched',       -- First deploy/launch
  'revenue',        -- First revenue
  'growing',        -- Active growth
  'scaling',        -- Scaling operations
  'exited'          -- Sold/exited
);

CREATE TYPE milestone_type AS ENUM (
  'first_login',
  'first_project',
  'first_code_commit',
  'first_deployment',
  'first_collaboration',
  'first_customer',
  'first_revenue',
  'first_100_revenue',
  'first_1k_revenue',
  'first_10k_revenue',
  'first_hire',
  'first_integration',
  'first_public_api',
  'ecosystem_contributor',
  'ecosystem_influencer'
);

CREATE TABLE IF NOT EXISTS builder_case_studies (
  case_study_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Builder identity
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),

  -- Journey metadata
  builder_stage builder_stage DEFAULT 'ideation',
  company_name VARCHAR(200),
  company_tagline TEXT,
  company_url TEXT,

  -- Initial investment
  invested_cents INTEGER DEFAULT 100, -- Default $1
  investment_date TIMESTAMPTZ DEFAULT NOW(),

  -- Current metrics (cached for dashboard)
  total_projects INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_deployments INTEGER DEFAULT 0,
  total_collaborations INTEGER DEFAULT 0,
  total_revenue_cents BIGINT DEFAULT 0,
  monthly_recurring_revenue_cents INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  total_api_calls BIGINT DEFAULT 0,

  -- Ecosystem metrics
  projects_referenced_by_others INTEGER DEFAULT 0, -- How many other projects use your code
  projects_you_reference INTEGER DEFAULT 0,        -- How many other projects you use
  ecosystem_influence_score DECIMAL(5,2) DEFAULT 0.0, -- 0-100 score

  -- Progress tracking
  days_to_first_deploy INTEGER,
  days_to_first_revenue INTEGER,
  days_to_first_collaboration INTEGER,

  -- Public visibility
  public_dashboard_enabled BOOLEAN DEFAULT TRUE,
  public_dashboard_slug VARCHAR(100) UNIQUE,
  case_study_published BOOLEAN DEFAULT FALSE,
  case_study_url TEXT,

  -- Auto-generated narrative
  latest_narrative TEXT, -- CalRiven AI-generated story
  narrative_updated_at TIMESTAMPTZ,
  narrative_signature JSONB, -- Soulfra hash

  -- Status
  active BOOLEAN DEFAULT TRUE,
  featured BOOLEAN DEFAULT FALSE, -- Featured case study

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_milestone_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_case_studies_user ON builder_case_studies(user_id);
CREATE INDEX idx_case_studies_tenant ON builder_case_studies(tenant_id);
CREATE INDEX idx_case_studies_stage ON builder_case_studies(builder_stage);
CREATE INDEX idx_case_studies_slug ON builder_case_studies(public_dashboard_slug);
CREATE INDEX idx_case_studies_featured ON builder_case_studies(featured) WHERE featured = true;
CREATE INDEX idx_case_studies_mrr ON builder_case_studies(monthly_recurring_revenue_cents DESC);
CREATE INDEX idx_case_studies_influence ON builder_case_studies(ecosystem_influence_score DESC);

COMMENT ON TABLE builder_case_studies IS 'Living case studies of builders journey from $1 to company';
COMMENT ON COLUMN builder_case_studies.ecosystem_influence_score IS 'How many other builders use this builders projects/patterns';
COMMENT ON COLUMN builder_case_studies.latest_narrative IS 'CalRiven AI-generated story of builder journey, auto-updated weekly';

-- ============================================================================
-- BUILDER MILESTONES: Track achievement milestones
-- ============================================================================

CREATE TABLE IF NOT EXISTS builder_milestones (
  milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who achieved it
  case_study_id UUID NOT NULL REFERENCES builder_case_studies(case_study_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Milestone details
  milestone_type milestone_type NOT NULL,
  milestone_title VARCHAR(200) NOT NULL,
  milestone_description TEXT,

  -- Context data
  project_id UUID REFERENCES project_contexts(project_id),
  related_entity_type VARCHAR(50), -- 'deployment', 'revenue_event', 'collaboration'
  related_entity_id UUID,

  -- Metrics at milestone
  metrics_snapshot JSONB DEFAULT '{}', -- Full metrics when milestone hit

  -- Timing
  days_since_investment INTEGER, -- Days from $1 investment to this milestone
  achieved_at TIMESTAMPTZ DEFAULT NOW(),

  -- Visibility
  public BOOLEAN DEFAULT TRUE,
  celebrated BOOLEAN DEFAULT FALSE, -- Whether we sent congrats message

  -- Auto-generated content
  celebration_message TEXT, -- CalRiven AI congratulations
  social_share_text TEXT,   -- Pre-written social media post

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_milestones_case_study ON builder_milestones(case_study_id, achieved_at DESC);
CREATE INDEX idx_milestones_user ON builder_milestones(user_id, achieved_at DESC);
CREATE INDEX idx_milestones_type ON builder_milestones(milestone_type);
CREATE INDEX idx_milestones_achieved ON builder_milestones(achieved_at DESC);

COMMENT ON TABLE builder_milestones IS 'Achievement milestones in builder journey (first deploy, first revenue, etc)';
COMMENT ON COLUMN builder_milestones.days_since_investment IS 'How many days from $1 investment to hitting this milestone';

-- ============================================================================
-- BUILDER METRICS: Time-series metrics for dashboard charts
-- ============================================================================

CREATE TYPE metrics_period AS ENUM ('daily', 'weekly', 'monthly');

CREATE TABLE IF NOT EXISTS builder_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who this is for
  case_study_id UUID NOT NULL REFERENCES builder_case_studies(case_study_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Time period
  period_type metrics_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Activity metrics
  commits INTEGER DEFAULT 0,
  deployments INTEGER DEFAULT 0,
  api_calls BIGINT DEFAULT 0,
  active_projects INTEGER DEFAULT 0,

  -- Revenue metrics
  revenue_cents INTEGER DEFAULT 0,
  mrr_cents INTEGER DEFAULT 0,        -- Monthly recurring revenue
  arr_cents INTEGER DEFAULT 0,        -- Annual recurring revenue
  new_customers INTEGER DEFAULT 0,
  churned_customers INTEGER DEFAULT 0,

  -- User metrics
  total_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,

  -- Collaboration metrics
  collaborations_started INTEGER DEFAULT 0,
  collaborations_completed INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,

  -- Ecosystem metrics
  times_referenced INTEGER DEFAULT 0,  -- How many times others used your code
  new_dependencies INTEGER DEFAULT 0,  -- New projects that depend on yours

  -- Growth rates (calculated)
  revenue_growth_percent DECIMAL(8,2),
  user_growth_percent DECIMAL(8,2),
  ecosystem_growth_percent DECIMAL(8,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_metrics_case_study ON builder_metrics(case_study_id, period_start DESC);
CREATE INDEX idx_metrics_user ON builder_metrics(user_id, period_start DESC);
CREATE INDEX idx_metrics_period ON builder_metrics(period_type, period_start DESC);
CREATE UNIQUE INDEX idx_metrics_unique ON builder_metrics(case_study_id, period_type, period_start);

COMMENT ON TABLE builder_metrics IS 'Time-series metrics for dashboard charts (MRR, users, commits over time)';

-- ============================================================================
-- CASE STUDY SNAPSHOTS: Auto-generated weekly/monthly summaries
-- ============================================================================

CREATE TYPE snapshot_format AS ENUM ('markdown', 'pdf', 'html', 'json');

CREATE TABLE IF NOT EXISTS case_study_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which case study
  case_study_id UUID NOT NULL REFERENCES builder_case_studies(case_study_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Snapshot metadata
  snapshot_date DATE NOT NULL,
  snapshot_title VARCHAR(200),

  -- Content
  narrative TEXT NOT NULL,              -- CalRiven AI-generated story
  narrative_signature JSONB,            -- Soulfra signature

  -- Metrics summary
  metrics_summary JSONB NOT NULL,       -- Key metrics at this point in time
  milestones_achieved JSONB DEFAULT '[]', -- New milestones this period

  -- Charts/visualizations
  charts_data JSONB DEFAULT '{}',       -- Chart data for MRR, users, etc.
  ecosystem_graph JSONB DEFAULT '{}',   -- Cross-reference graph data

  -- Exports
  markdown_content TEXT,
  html_content TEXT,
  pdf_url TEXT,
  public_url TEXT,

  -- Sharing
  social_media_summary TEXT,            -- Pre-written tweet/post
  shared_on_federation BOOLEAN DEFAULT FALSE,
  activitypub_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_snapshots_case_study ON case_study_snapshots(case_study_id, snapshot_date DESC);
CREATE INDEX idx_snapshots_user ON case_study_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_snapshots_date ON case_study_snapshots(snapshot_date DESC);

COMMENT ON TABLE case_study_snapshots IS 'Auto-generated weekly/monthly case study updates with CalRiven narration';
COMMENT ON COLUMN case_study_snapshots.ecosystem_graph IS 'Cross-reference graph showing project dependencies';

-- ============================================================================
-- PROJECT CROSS-REFERENCES: Link projects that reference each other
-- ============================================================================

CREATE TYPE reference_type AS ENUM (
  'code_import',        -- Direct code import/dependency
  'api_call',           -- API integration
  'pattern_reuse',      -- Reused design pattern
  'data_reference',     -- References data/schema
  'documentation',      -- Links in docs
  'inspiration'         -- Inspired by
);

CREATE TABLE IF NOT EXISTS project_cross_references (
  xref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source project (the one doing the referencing)
  source_project_id UUID NOT NULL REFERENCES project_contexts(project_id),
  source_user_id UUID NOT NULL REFERENCES users(user_id),

  -- Target project (the one being referenced)
  target_project_id UUID NOT NULL REFERENCES project_contexts(project_id),
  target_user_id UUID NOT NULL REFERENCES users(user_id),

  -- Reference details
  reference_type reference_type NOT NULL,
  reference_description TEXT,

  -- Location in source
  file_path TEXT,
  line_number INTEGER,
  code_snippet TEXT,

  -- Metrics
  reference_count INTEGER DEFAULT 1,     -- How many times referenced
  first_referenced_at TIMESTAMPTZ DEFAULT NOW(),
  last_referenced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Attribution
  attribution_given BOOLEAN DEFAULT FALSE,
  attribution_text TEXT,

  -- Status
  active BOOLEAN DEFAULT TRUE,           -- Still actively used
  verified BOOLEAN DEFAULT FALSE,        -- Verified by target owner

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_xref_source ON project_cross_references(source_project_id);
CREATE INDEX idx_xref_target ON project_cross_references(target_project_id);
CREATE INDEX idx_xref_source_user ON project_cross_references(source_user_id);
CREATE INDEX idx_xref_target_user ON project_cross_references(target_user_id);
CREATE INDEX idx_xref_type ON project_cross_references(reference_type);
CREATE INDEX idx_xref_active ON project_cross_references(active) WHERE active = true;

COMMENT ON TABLE project_cross_references IS 'Track when Project A uses code/patterns from Project B';
COMMENT ON COLUMN project_cross_references.reference_count IS 'Incremented each time reference is detected';

-- ============================================================================
-- VIEWS: Dashboard queries
-- ============================================================================

-- View: Builder leaderboard by ecosystem influence
CREATE OR REPLACE VIEW builder_leaderboard AS
SELECT
  bcs.case_study_id,
  bcs.user_id,
  u.username,
  bcs.company_name,
  bcs.builder_stage,
  bcs.ecosystem_influence_score,
  bcs.projects_referenced_by_others,
  bcs.total_revenue_cents,
  bcs.monthly_recurring_revenue_cents,
  bcs.total_projects,
  bcs.public_dashboard_slug,
  bcs.investment_date,
  EXTRACT(DAY FROM NOW() - bcs.investment_date) AS days_since_investment,
  bcs.days_to_first_revenue,
  COUNT(DISTINCT bm.milestone_id) AS total_milestones
FROM builder_case_studies bcs
JOIN users u ON bcs.user_id = u.user_id
LEFT JOIN builder_milestones bm ON bcs.case_study_id = bm.case_study_id
WHERE bcs.active = true
GROUP BY bcs.case_study_id, bcs.user_id, u.username, bcs.company_name,
         bcs.builder_stage, bcs.ecosystem_influence_score, bcs.projects_referenced_by_others,
         bcs.total_revenue_cents, bcs.monthly_recurring_revenue_cents,
         bcs.total_projects, bcs.public_dashboard_slug, bcs.investment_date, bcs.days_to_first_revenue
ORDER BY bcs.ecosystem_influence_score DESC, bcs.monthly_recurring_revenue_cents DESC;

COMMENT ON VIEW builder_leaderboard IS 'Ranked builders by ecosystem influence and revenue';

-- View: Ecosystem graph data
CREATE OR REPLACE VIEW ecosystem_graph AS
SELECT
  pcr.xref_id,
  pcr.source_project_id,
  sp.project_name AS source_project_name,
  sp.brand_name AS source_brand,
  pcr.source_user_id,
  su.username AS source_username,
  pcr.target_project_id,
  tp.project_name AS target_project_name,
  tp.brand_name AS target_brand,
  pcr.target_user_id,
  tu.username AS target_username,
  pcr.reference_type,
  pcr.reference_count,
  pcr.first_referenced_at,
  pcr.last_referenced_at,
  pcr.active
FROM project_cross_references pcr
JOIN project_contexts sp ON pcr.source_project_id = sp.project_id
JOIN project_contexts tp ON pcr.target_project_id = tp.project_id
JOIN users su ON pcr.source_user_id = su.user_id
JOIN users tu ON pcr.target_user_id = tu.user_id
WHERE pcr.active = true
ORDER BY pcr.reference_count DESC;

COMMENT ON VIEW ecosystem_graph IS 'Cross-reference graph showing how projects connect';

-- View: Recent milestones across all builders
CREATE OR REPLACE VIEW recent_builder_milestones AS
SELECT
  bm.milestone_id,
  bm.user_id,
  u.username,
  bcs.company_name,
  bcs.public_dashboard_slug,
  bm.milestone_type,
  bm.milestone_title,
  bm.milestone_description,
  bm.days_since_investment,
  bm.achieved_at,
  bm.celebration_message
FROM builder_milestones bm
JOIN users u ON bm.user_id = u.user_id
JOIN builder_case_studies bcs ON bm.case_study_id = bcs.case_study_id
WHERE bm.public = true
ORDER BY bm.achieved_at DESC
LIMIT 100;

COMMENT ON VIEW recent_builder_milestones IS 'Recent achievements across all builders for celebration feed';

-- ============================================================================
-- FUNCTIONS: Auto-tracking
-- ============================================================================

/**
 * Initialize builder case study when user joins
 * Called automatically after $1 payment
 */
CREATE OR REPLACE FUNCTION initialize_builder_case_study(
  user_uuid UUID,
  tenant_uuid UUID,
  investment_cents_param INTEGER DEFAULT 100
)
RETURNS UUID AS $$
DECLARE
  case_study_uuid UUID;
  username_val VARCHAR(50);
BEGIN
  -- Get username for slug
  SELECT username INTO username_val FROM users WHERE user_id = user_uuid;

  -- Create case study
  INSERT INTO builder_case_studies (
    user_id,
    tenant_id,
    invested_cents,
    investment_date,
    public_dashboard_slug
  )
  VALUES (
    user_uuid,
    tenant_uuid,
    investment_cents_param,
    NOW(),
    username_val || '-journey'
  )
  RETURNING case_study_id INTO case_study_uuid;

  -- Record first milestone
  INSERT INTO builder_milestones (
    case_study_id,
    user_id,
    milestone_type,
    milestone_title,
    milestone_description,
    days_since_investment,
    celebration_message
  )
  VALUES (
    case_study_uuid,
    user_uuid,
    'first_login',
    'Joined the Builder Community',
    'Made $' || (investment_cents_param::FLOAT / 100)::TEXT || ' investment and started building journey',
    0,
    'Welcome to the builder community! Your journey from $' || (investment_cents_param::FLOAT / 100)::TEXT || ' to company starts now. - CalRiven'
  );

  RETURN case_study_uuid;
END;
$$ LANGUAGE plpgsql;

/**
 * Record milestone achievement
 */
CREATE OR REPLACE FUNCTION record_builder_milestone(
  user_uuid UUID,
  milestone_type_param milestone_type,
  milestone_title_param VARCHAR(200),
  milestone_description_param TEXT DEFAULT NULL,
  related_project_uuid UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  case_study_record RECORD;
  milestone_uuid UUID;
  days_elapsed INTEGER;
BEGIN
  -- Get case study
  SELECT * INTO case_study_record
  FROM builder_case_studies
  WHERE user_id = user_uuid AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active case study found for user %', user_uuid;
  END IF;

  -- Calculate days since investment
  days_elapsed := EXTRACT(DAY FROM NOW() - case_study_record.investment_date)::INTEGER;

  -- Record milestone
  INSERT INTO builder_milestones (
    case_study_id,
    user_id,
    milestone_type,
    milestone_title,
    milestone_description,
    project_id,
    days_since_investment
  )
  VALUES (
    case_study_record.case_study_id,
    user_uuid,
    milestone_type_param,
    milestone_title_param,
    milestone_description_param,
    related_project_uuid,
    days_elapsed
  )
  RETURNING milestone_id INTO milestone_uuid;

  -- Update case study last milestone
  UPDATE builder_case_studies
  SET last_milestone_at = NOW(),
      updated_at = NOW()
  WHERE case_study_id = case_study_record.case_study_id;

  -- Update days_to_first_X if this is a first
  CASE milestone_type_param
    WHEN 'first_revenue' THEN
      UPDATE builder_case_studies
      SET days_to_first_revenue = days_elapsed
      WHERE case_study_id = case_study_record.case_study_id
        AND days_to_first_revenue IS NULL;
    WHEN 'first_deployment' THEN
      UPDATE builder_case_studies
      SET days_to_first_deploy = days_elapsed
      WHERE case_study_id = case_study_record.case_study_id
        AND days_to_first_deploy IS NULL;
    WHEN 'first_collaboration' THEN
      UPDATE builder_case_studies
      SET days_to_first_collaboration = days_elapsed
      WHERE case_study_id = case_study_record.case_study_id
        AND days_to_first_collaboration IS NULL;
    ELSE
      -- No special handling
  END CASE;

  RETURN milestone_uuid;
END;
$$ LANGUAGE plpgsql;

/**
 * Record project cross-reference
 */
CREATE OR REPLACE FUNCTION record_project_xref(
  source_project_uuid UUID,
  target_project_uuid UUID,
  reference_type_param reference_type,
  reference_description_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  xref_uuid UUID;
  source_user UUID;
  target_user UUID;
  existing_xref RECORD;
BEGIN
  -- Get users
  SELECT owner_user_id INTO source_user FROM project_contexts WHERE project_id = source_project_uuid;
  SELECT owner_user_id INTO target_user FROM project_contexts WHERE project_id = target_project_uuid;

  -- Check if xref already exists
  SELECT * INTO existing_xref
  FROM project_cross_references
  WHERE source_project_id = source_project_uuid
    AND target_project_id = target_project_uuid
    AND reference_type = reference_type_param;

  IF FOUND THEN
    -- Increment count
    UPDATE project_cross_references
    SET reference_count = reference_count + 1,
        last_referenced_at = NOW(),
        updated_at = NOW()
    WHERE xref_id = existing_xref.xref_id;

    RETURN existing_xref.xref_id;
  ELSE
    -- Create new xref
    INSERT INTO project_cross_references (
      source_project_id,
      source_user_id,
      target_project_id,
      target_user_id,
      reference_type,
      reference_description
    )
    VALUES (
      source_project_uuid,
      source_user,
      target_project_uuid,
      target_user,
      reference_type_param,
      reference_description_param
    )
    RETURNING xref_id INTO xref_uuid;

    -- Update ecosystem metrics
    UPDATE builder_case_studies
    SET projects_you_reference = projects_you_reference + 1,
        updated_at = NOW()
    WHERE user_id = source_user;

    UPDATE builder_case_studies
    SET projects_referenced_by_others = projects_referenced_by_others + 1,
        ecosystem_influence_score = ecosystem_influence_score + 1.0,
        updated_at = NOW()
    WHERE user_id = target_user;

    RETURN xref_uuid;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS: Auto-update metrics
-- ============================================================================

-- Trigger: Update case study when project created
CREATE OR REPLACE FUNCTION update_case_study_on_project()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE builder_case_studies
  SET total_projects = total_projects + 1,
      updated_at = NOW()
  WHERE user_id = NEW.owner_user_id;

  -- Record milestone if first project
  IF (SELECT total_projects FROM builder_case_studies WHERE user_id = NEW.owner_user_id) = 1 THEN
    PERFORM record_builder_milestone(
      NEW.owner_user_id,
      'first_project',
      'Created First Project',
      'Started project: ' || NEW.project_name,
      NEW.project_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_case_study_on_project ON project_contexts;
CREATE TRIGGER trigger_update_case_study_on_project
  AFTER INSERT ON project_contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_case_study_on_project();

COMMENT ON FUNCTION update_case_study_on_project IS 'Auto-update case study when project created';

-- ============================================================================
-- RLS: Row-Level Security
-- ============================================================================

ALTER TABLE builder_case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_study_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_cross_references ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own case studies
CREATE POLICY case_study_owner_access ON builder_case_studies
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID)
  WITH CHECK (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Everyone can see public dashboards
CREATE POLICY case_study_public_view ON builder_case_studies
  FOR SELECT
  USING (public_dashboard_enabled = true);

CREATE POLICY milestones_owner_access ON builder_milestones
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY milestones_public_view ON builder_milestones
  FOR SELECT
  USING (public = true);

COMMENT ON POLICY case_study_public_view ON builder_case_studies IS 'Public dashboards visible to everyone';
