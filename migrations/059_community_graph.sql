-- Migration: Community Graph & Data Acquisition
-- "Like Ryan Cohen buying GameStop: 55M PowerUp members + 33 years Game Informer data"
--
-- Ryan Cohen Strategy:
-- 1. Acquire existing community (GameStop: 55M PowerUp Rewards)
-- 2. Leverage customer data for intelligence
-- 3. Build organic superfans (r/WallStreetBets)
-- 4. Let community self-organize
--
-- CALOS Strategy:
-- 1. Consolidate scattered user data (learning + marketplace + growth + forum)
-- 2. Build unified community graph
-- 3. Track cross-system behavior
-- 4. Detect power users and momentum
-- 5. Acquire/consolidate external communities

-- ============================================================================
-- Community Members (Unified View)
-- Like PowerUp Rewards: single view across all touchpoints
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,

  -- Power score (composite metric across all systems)
  power_score INT DEFAULT 0, -- 0-1000 scale
  community_tier TEXT DEFAULT 'newcomer', -- newcomer, contributor, veteran, legend

  -- Component scores (for analysis)
  learning_score INT DEFAULT 0, -- 0-250
  reputation_score INT DEFAULT 0, -- 0-250
  growth_score INT DEFAULT 0, -- 0-300 (highest weight - building)
  forum_score INT DEFAULT 0, -- 0-200

  -- Cohort classification
  primary_cohort TEXT, -- learner, builder, leader, lurker, balanced
  cohort_tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Engagement metrics
  total_activities INT DEFAULT 0,
  active_systems INT DEFAULT 0, -- How many systems they use (1-4)
  engagement_frequency TEXT DEFAULT 'new', -- new, occasional, regular, power_user

  -- Timestamps
  first_seen TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_community_members_user ON community_members(user_id);
CREATE INDEX idx_community_members_power_score ON community_members(power_score DESC);
CREATE INDEX idx_community_members_tier ON community_members(community_tier);
CREATE INDEX idx_community_members_cohort ON community_members(primary_cohort);
CREATE INDEX idx_community_members_last_activity ON community_members(last_activity DESC);

-- ============================================================================
-- Cross-System Activity
-- Track user behavior across all CALOS systems
-- ============================================================================

CREATE TABLE IF NOT EXISTS cross_system_activity (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  member_id UUID REFERENCES community_members(member_id) ON DELETE CASCADE,

  -- Activity details
  system_name TEXT NOT NULL, -- learning, marketplace, growth, forum, github
  activity_type TEXT NOT NULL, -- lesson_completed, idea_implemented, post_created, etc.
  activity_subtype TEXT, -- More specific classification

  -- Context
  reference_id TEXT, -- ID of related object (lesson_id, idea_id, post_id, etc.)
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Impact scoring
  impact_value INT DEFAULT 1, -- Weighted value (implementation=50, comment=1, etc.)

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cross_system_user ON cross_system_activity(user_id);
CREATE INDEX idx_cross_system_member ON cross_system_activity(member_id);
CREATE INDEX idx_cross_system_system ON cross_system_activity(system_name);
CREATE INDEX idx_cross_system_type ON cross_system_activity(activity_type);
CREATE INDEX idx_cross_system_created ON cross_system_activity(created_at DESC);
CREATE INDEX idx_cross_system_impact ON cross_system_activity(impact_value DESC);

-- ============================================================================
-- Community Cohorts
-- User segments with shared behavior patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_cohorts (
  cohort_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_name TEXT NOT NULL UNIQUE,

  -- Cohort definition
  description TEXT,
  defining_characteristics JSONB NOT NULL,
  -- Example:
  -- {
  --   "min_implementations": 3,
  --   "min_power_score": 200,
  --   "required_systems": ["growth", "marketplace"]
  -- }

  -- Cohort stats
  member_count INT DEFAULT 0,
  avg_power_score DECIMAL(10,2),
  avg_engagement_rate DECIMAL(5,2),

  -- Momentum tracking
  velocity DECIMAL(10,2) DEFAULT 0, -- Growth rate
  acceleration DECIMAL(10,2) DEFAULT 0, -- Rate of change
  momentum DECIMAL(10,2) DEFAULT 0, -- Velocity * scale
  stage TEXT DEFAULT 'DORMANT', -- DORMANT, GROWING, ACCELERATING, STABLE, DECLINING

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_community_cohorts_name ON community_cohorts(cohort_name);
CREATE INDEX idx_community_cohorts_count ON community_cohorts(member_count DESC);
CREATE INDEX idx_community_cohorts_momentum ON community_cohorts(momentum DESC);
CREATE INDEX idx_community_cohorts_stage ON community_cohorts(stage);

-- ============================================================================
-- Cohort Membership
-- Many-to-many relationship (users can be in multiple cohorts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cohort_membership (
  id SERIAL PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES community_cohorts(cohort_id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES community_members(member_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Membership details
  fit_score DECIMAL(5,2) DEFAULT 1.0, -- How well they fit cohort (0-1)
  is_primary BOOLEAN DEFAULT false, -- Is this their primary cohort?

  joined_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(cohort_id, member_id)
);

CREATE INDEX idx_cohort_membership_cohort ON cohort_membership(cohort_id);
CREATE INDEX idx_cohort_membership_member ON cohort_membership(member_id);
CREATE INDEX idx_cohort_membership_user ON cohort_membership(user_id);
CREATE INDEX idx_cohort_membership_primary ON cohort_membership(is_primary) WHERE is_primary = true;

-- ============================================================================
-- Community Momentum Snapshots
-- Time series data for tracking cohort/community growth
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_momentum_snapshots (
  id SERIAL PRIMARY KEY,
  cohort_id UUID REFERENCES community_cohorts(cohort_id) ON DELETE CASCADE,

  -- If NULL, this is for entire community
  is_global BOOLEAN DEFAULT false,

  -- Metrics snapshot
  member_count INT NOT NULL,
  active_members INT, -- Active in last 7 days
  total_activities INT,
  avg_power_score DECIMAL(10,2),

  -- Momentum
  velocity DECIMAL(10,2),
  acceleration DECIMAL(10,2),
  momentum DECIMAL(10,2),
  stage TEXT,

  snapshot_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_momentum_snapshots_cohort ON community_momentum_snapshots(cohort_id);
CREATE INDEX idx_momentum_snapshots_global ON community_momentum_snapshots(is_global) WHERE is_global = true;
CREATE INDEX idx_momentum_snapshots_time ON community_momentum_snapshots(snapshot_at DESC);

-- ============================================================================
-- External Community Sources
-- Track consolidated/acquired communities (like Game Informer data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_community_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL UNIQUE,

  -- Source details
  source_type TEXT NOT NULL, -- discord, github, twitter, slack, oss_project, etc.
  source_url TEXT,
  description TEXT,

  -- Import stats
  members_imported INT DEFAULT 0,
  activities_imported INT DEFAULT 0,
  last_import_at TIMESTAMP,

  -- Metadata
  import_config JSONB DEFAULT '{}'::JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_external_sources_name ON external_community_sources(source_name);
CREATE INDEX idx_external_sources_type ON external_community_sources(source_type);
CREATE INDEX idx_external_sources_last_import ON external_community_sources(last_import_at DESC);

-- ============================================================================
-- External Community Members
-- Link imported members to their source
-- ============================================================================

CREATE TABLE IF NOT EXISTS external_community_members (
  id SERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES external_community_sources(source_id) ON DELETE CASCADE,
  member_id UUID REFERENCES community_members(member_id) ON DELETE CASCADE,

  -- External identity
  external_user_id TEXT NOT NULL,
  external_username TEXT,
  external_email TEXT,

  -- Import metadata
  imported_metadata JSONB DEFAULT '{}'::JSONB,
  imported_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(source_id, external_user_id)
);

CREATE INDEX idx_external_members_source ON external_community_members(source_id);
CREATE INDEX idx_external_members_member ON external_community_members(member_id);
CREATE INDEX idx_external_members_external_id ON external_community_members(external_user_id);

-- ============================================================================
-- Views
-- ============================================================================

-- View: Power User Leaderboard
CREATE OR REPLACE VIEW v_power_user_leaderboard AS
SELECT
  cm.user_id,
  cm.power_score,
  cm.community_tier,
  cm.primary_cohort,
  cm.total_activities,
  cm.active_systems,
  cm.last_activity,
  ur.karma,
  ur.badge as reputation_badge,
  (SELECT COUNT(*) FROM user_followers WHERE followee_id = cm.user_id) as followers
FROM community_members cm
LEFT JOIN user_reputation ur ON cm.user_id = ur.user_id
ORDER BY cm.power_score DESC;

-- View: Cohort Overview
CREATE OR REPLACE VIEW v_cohort_overview AS
SELECT
  c.cohort_name,
  c.description,
  c.member_count,
  c.avg_power_score,
  c.momentum,
  c.stage,
  COUNT(cm.member_id) as actual_members,
  c.updated_at
FROM community_cohorts c
LEFT JOIN cohort_membership cm ON c.cohort_id = cm.cohort_id
GROUP BY c.cohort_id, c.cohort_name, c.description, c.member_count,
         c.avg_power_score, c.momentum, c.stage, c.updated_at
ORDER BY c.momentum DESC;

-- View: Cross-System Engagement
CREATE OR REPLACE VIEW v_cross_system_engagement AS
SELECT
  user_id,
  COUNT(DISTINCT system_name) as systems_used,
  COUNT(*) as total_activities,
  COALESCE(SUM(impact_value), 0) as total_impact,
  MAX(created_at) as last_activity,
  jsonb_object_agg(system_name, system_count) as system_breakdown
FROM (
  SELECT
    user_id,
    system_name,
    COUNT(*) as system_count
  FROM cross_system_activity
  GROUP BY user_id, system_name
) subquery
GROUP BY user_id
ORDER BY total_impact DESC;

-- View: Community Growth Timeline
CREATE OR REPLACE VIEW v_community_growth_timeline AS
SELECT
  DATE_TRUNC('day', snapshot_at) as day,
  AVG(member_count) as avg_members,
  AVG(active_members) as avg_active,
  AVG(total_activities) as avg_activities,
  AVG(momentum) as avg_momentum
FROM community_momentum_snapshots
WHERE is_global = true
GROUP BY DATE_TRUNC('day', snapshot_at)
ORDER BY day DESC;

-- View: Builder Activity (highest value users)
CREATE OR REPLACE VIEW v_builder_activity AS
SELECT
  cm.user_id,
  cm.power_score,
  cm.community_tier,
  COUNT(DISTINCT csa.reference_id) FILTER (WHERE csa.activity_type = 'idea_implemented') as implementations,
  COUNT(DISTINCT csa.reference_id) FILTER (WHERE csa.activity_type = 'idea_forked') as forks,
  COUNT(DISTINCT csa.reference_id) FILTER (WHERE csa.activity_type = 'idea_iterated') as iterations,
  COALESCE(SUM(csa.impact_value), 0) as total_impact
FROM community_members cm
LEFT JOIN cross_system_activity csa ON cm.user_id = csa.user_id
WHERE csa.system_name = 'growth' OR csa.system_name IS NULL
GROUP BY cm.user_id, cm.power_score, cm.community_tier
ORDER BY total_impact DESC;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Update member power score
CREATE OR REPLACE FUNCTION update_member_power_score(p_user_id TEXT)
RETURNS void AS $$
DECLARE
  v_learning_score INT;
  v_reputation_score INT;
  v_growth_score INT;
  v_forum_score INT;
  v_total_score INT;
  v_tier TEXT;
BEGIN
  -- Calculate component scores
  SELECT
    LEAST(
      COALESCE(SUM(total_xp) / 100, 0) +
      COALESCE(COUNT(DISTINCT CASE WHEN completion_status = 'completed' THEN path_id END) * 20, 0),
      250
    ) INTO v_learning_score
  FROM user_progress
  WHERE user_id = p_user_id;

  SELECT
    LEAST(
      COALESCE(karma / 10, 0) +
      COALESCE(trust_score * 100, 0),
      250
    ) INTO v_reputation_score
  FROM user_reputation
  WHERE user_id = p_user_id;

  SELECT
    LEAST(
      COALESCE(COUNT(DISTINCT CASE WHEN activity_type = 'implemented' THEN idea_id END) * 50, 0) +
      COALESCE(COUNT(DISTINCT CASE WHEN activity_type = 'iterated' THEN idea_id END) * 30, 0) +
      COALESCE(COUNT(DISTINCT CASE WHEN activity_type = 'forked' THEN idea_id END) * 10, 0),
      300
    ) INTO v_growth_score
  FROM idea_activities
  WHERE metadata->>'userId' = p_user_id;

  SELECT
    LEAST(
      COALESCE((SELECT COUNT(*) FROM forum_posts WHERE author_id = p_user_id) * 10, 0) +
      COALESCE((SELECT COUNT(*) FROM forum_comments WHERE author_id = p_user_id) * 2, 0),
      200
    ) INTO v_forum_score;

  -- Total score
  v_total_score := COALESCE(v_learning_score, 0) +
                   COALESCE(v_reputation_score, 0) +
                   COALESCE(v_growth_score, 0) +
                   COALESCE(v_forum_score, 0);

  -- Determine tier
  IF v_total_score >= 800 THEN
    v_tier := 'legend';
  ELSIF v_total_score >= 500 THEN
    v_tier := 'veteran';
  ELSIF v_total_score >= 200 THEN
    v_tier := 'contributor';
  ELSE
    v_tier := 'newcomer';
  END IF;

  -- Update or insert
  INSERT INTO community_members (
    user_id,
    power_score,
    community_tier,
    learning_score,
    reputation_score,
    growth_score,
    forum_score,
    last_activity
  ) VALUES (
    p_user_id,
    v_total_score,
    v_tier,
    v_learning_score,
    v_reputation_score,
    v_growth_score,
    v_forum_score,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    power_score = v_total_score,
    community_tier = v_tier,
    learning_score = v_learning_score,
    reputation_score = v_reputation_score,
    growth_score = v_growth_score,
    forum_score = v_forum_score,
    last_activity = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: Record cross-system activity
CREATE OR REPLACE FUNCTION record_cross_system_activity(
  p_user_id TEXT,
  p_system_name TEXT,
  p_activity_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_impact_value INT DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void AS $$
DECLARE
  v_member_id UUID;
BEGIN
  -- Get or create member_id
  SELECT member_id INTO v_member_id
  FROM community_members
  WHERE user_id = p_user_id;

  IF v_member_id IS NULL THEN
    INSERT INTO community_members (user_id)
    VALUES (p_user_id)
    RETURNING member_id INTO v_member_id;
  END IF;

  -- Record activity
  INSERT INTO cross_system_activity (
    user_id,
    member_id,
    system_name,
    activity_type,
    reference_id,
    impact_value,
    metadata
  ) VALUES (
    p_user_id,
    v_member_id,
    p_system_name,
    p_activity_type,
    p_reference_id,
    p_impact_value,
    p_metadata
  );

  -- Update power score
  PERFORM update_member_power_score(p_user_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update community_members.updated_at
CREATE OR REPLACE FUNCTION update_community_member_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_community_member_timestamp
BEFORE UPDATE ON community_members
FOR EACH ROW
EXECUTE FUNCTION update_community_member_timestamp();

-- ============================================================================
-- Initial Default Cohorts
-- ============================================================================

INSERT INTO community_cohorts (cohort_name, description, defining_characteristics) VALUES
  ('builders', 'Users who implement ideas', '{"min_implementations": 3, "systems": ["growth"]}'::JSONB),
  ('learners', 'Users focused on education', '{"min_paths_completed": 2, "systems": ["learning"]}'::JSONB),
  ('leaders', 'Community influencers', '{"min_followers": 10, "systems": ["forum", "github"]}'::JSONB),
  ('balanced', 'Active across multiple systems', '{"min_active_systems": 3}'::JSONB)
ON CONFLICT (cohort_name) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE community_members IS 'Unified community profile - like PowerUp Rewards single customer view';
COMMENT ON TABLE cross_system_activity IS 'Track user behavior across all CALOS systems';
COMMENT ON TABLE community_cohorts IS 'User segments with shared behavior patterns';
COMMENT ON TABLE cohort_membership IS 'Many-to-many: users can belong to multiple cohorts';
COMMENT ON TABLE community_momentum_snapshots IS 'Time series tracking cohort/community growth';
COMMENT ON TABLE external_community_sources IS 'Track acquired/consolidated communities (like Game Informer)';
COMMENT ON TABLE external_community_members IS 'Link imported members to source';

COMMENT ON VIEW v_power_user_leaderboard IS 'Top contributors ranked by power score';
COMMENT ON VIEW v_cohort_overview IS 'Summary of all cohorts and their momentum';
COMMENT ON VIEW v_cross_system_engagement IS 'User engagement across systems';
COMMENT ON VIEW v_community_growth_timeline IS 'Community growth over time';
COMMENT ON VIEW v_builder_activity IS 'Users who actually BUILD (highest value)';

COMMENT ON FUNCTION update_member_power_score(TEXT) IS 'Calculate and update user power score across all systems';
COMMENT ON FUNCTION record_cross_system_activity(TEXT, TEXT, TEXT, TEXT, INT, JSONB) IS 'Record activity and auto-update power score';
