-- Migration: Idea Growth Tracking System
-- "we can build our index while piggybacking... dogfeed based off what our own users want to do"
--
-- This migration adds:
-- - Real-time idea momentum tracking (velocity, acceleration)
-- - Inflection point detection (when growth changes direction)
-- - Potential scoring (predictive analytics)
-- - Activity tracking (actual usage, not just votes)
-- - Cross-platform index (piggyback on Google Sheets, etc.)
--
-- Unlike traditional marketplaces that track votes/engagement,
-- we track ACTUAL USAGE: forked, implemented, iterated

-- ============================================================================
-- Idea Activities Table
-- Track what users ACTUALLY DO with ideas (not just votes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_activities (
  id SERIAL PRIMARY KEY,
  idea_id TEXT NOT NULL, -- Can reference marketplace_ideas.id OR external sources

  -- Activity type: what the user DID
  activity_type TEXT NOT NULL,
  -- Options:
  --   'viewed'       - Looked at the idea
  --   'forked'       - Copied to use themselves
  --   'implemented'  - Actually built it (HIGHEST VALUE)
  --   'referenced'   - Mentioned in their work
  --   'iterated'     - Built on top of it
  --   'submitted'    - Original submission
  --   'shared'       - Shared with others

  -- Context
  metadata JSONB DEFAULT '{}'::JSONB,
  -- Suggested metadata fields:
  -- {
  --   "userId": "user123",
  --   "source": "marketplace|google_sheets|github",
  --   "repositoryUrl": "https://github.com/...",
  --   "implementationDetails": "..."
  -- }

  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_idea_activities_idea ON idea_activities(idea_id);
CREATE INDEX idx_idea_activities_type ON idea_activities(activity_type);
CREATE INDEX idx_idea_activities_timestamp ON idea_activities(timestamp DESC);
CREATE INDEX idx_idea_activities_user ON idea_activities((metadata->>'userId'));

-- ============================================================================
-- Idea Growth State Table
-- Snapshots of idea growth metrics over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_growth_state (
  id SERIAL PRIMARY KEY,
  idea_id TEXT NOT NULL,

  -- Growth metrics (calculated via finite differences)
  growth_state JSONB NOT NULL,
  -- Structure:
  -- {
  --   "velocity": {
  --     "current": 0.5,        // First derivative (growth rate)
  --     "shortTerm": 0.5,      // Last 3 periods
  --     "mediumTerm": 0.3,     // Last 7 periods
  --     "longTerm": 0.2        // Last 30 periods
  --   },
  --   "acceleration": {
  --     "current": 0.1,        // Second derivative (growth change)
  --     "shortTerm": 0.1
  --   },
  --   "momentum": 15.0,        // velocity * unique_users
  --   "potential": 75,         // 0-100 score (predictive)
  --   "stage": {
  --     "type": "ACCELERATING",
  --     "emoji": "🚀",
  --     "description": "Rapid growth"
  --   },
  --   "uniqueUsers": 30,
  --   "totalActivities": 120,
  --   "lastActivity": "2025-10-20T12:00:00Z"
  -- }

  -- Inflection point detection (when growth changes direction)
  inflection JSONB DEFAULT '{}'::JSONB,
  -- Structure:
  -- {
  --   "isInflection": true,
  --   "type": "TAKEOFF",     // TAKEOFF, PEAK, PLATEAU, RECOVERY, DECLINING
  --   "emoji": "🚀",
  --   "message": "Idea is taking off! Growth accelerating.",
  --   "previousVelocity": 0.1,
  --   "currentVelocity": 0.5,
  --   "change": 0.4,
  --   "timestamp": "2025-10-20T12:00:00Z"
  -- }

  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_idea_growth_state_idea ON idea_growth_state(idea_id);
CREATE INDEX idx_idea_growth_state_updated ON idea_growth_state(updated_at DESC);
CREATE INDEX idx_idea_growth_state_potential ON idea_growth_state(((growth_state->>'potential')::int) DESC);
CREATE INDEX idx_idea_growth_state_momentum ON idea_growth_state(((growth_state->>'momentum')::float) DESC);
CREATE INDEX idx_idea_growth_state_stage ON idea_growth_state((growth_state->'stage'->>'type'));
CREATE INDEX idx_idea_growth_state_inflection ON idea_growth_state((inflection->>'type'));

-- ============================================================================
-- Idea Index Table
-- Cross-platform idea tracking (piggyback strategy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_index (
  id SERIAL PRIMARY KEY,
  idea_id TEXT NOT NULL UNIQUE, -- Global idea ID

  -- Source (where the idea is stored)
  source TEXT NOT NULL, -- 'marketplace', 'google_sheets', 'github', 'external'
  source_id TEXT, -- ID in source system (e.g., Google Sheet ID)

  -- Basic metadata
  title TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Cross-references
  marketplace_idea_id INT REFERENCES marketplace_ideas(id) ON DELETE SET NULL,
  external_url TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  migrated_at TIMESTAMP, -- When migrated to our database
  last_synced_at TIMESTAMP -- Last sync with source
);

CREATE INDEX idx_idea_index_idea ON idea_index(idea_id);
CREATE INDEX idx_idea_index_source ON idea_index(source);
CREATE INDEX idx_idea_index_marketplace ON idea_index(marketplace_idea_id);
CREATE INDEX idx_idea_index_created ON idea_index(created_at DESC);
CREATE INDEX idx_idea_index_tags ON idea_index USING gin(tags);

-- Full text search on title
CREATE INDEX idx_idea_index_search ON idea_index
  USING gin(to_tsvector('english', title));

-- ============================================================================
-- File Index Table
-- Track files in external systems (Google Drive, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_index (
  id SERIAL PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE,

  -- Source
  source TEXT NOT NULL, -- 'google_drive', 's3', 'local'
  source_id TEXT, -- Folder ID in source system

  -- File details
  name TEXT NOT NULL,
  url TEXT,
  mime_type TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_index_file ON file_index(file_id);
CREATE INDEX idx_file_index_source ON file_index(source);
CREATE INDEX idx_file_index_name ON file_index(name);

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- View: High-Potential Ideas
-- Ideas with potential > 50, ranked by potential score
CREATE OR REPLACE VIEW v_high_potential_ideas AS
SELECT
  idx.idea_id,
  idx.title,
  idx.category,
  idx.source,
  gs.growth_state,
  gs.inflection,
  (gs.growth_state->>'potential')::int as potential_score,
  (gs.growth_state->>'momentum')::float as momentum,
  gs.growth_state->'stage'->>'type' as growth_stage,
  gs.updated_at
FROM idea_index idx
JOIN idea_growth_state gs ON idx.idea_id = gs.idea_id
WHERE (gs.growth_state->>'potential')::int > 50
ORDER BY (gs.growth_state->>'potential')::int DESC, gs.updated_at DESC;

-- View: Trending Ideas (Accelerating Growth)
CREATE OR REPLACE VIEW v_trending_ideas AS
SELECT
  idx.idea_id,
  idx.title,
  idx.category,
  gs.growth_state,
  (gs.growth_state->>'potential')::int as potential_score,
  (gs.growth_state->>'momentum')::float as momentum,
  gs.growth_state->'velocity'->>'current' as velocity,
  gs.growth_state->'acceleration'->>'current' as acceleration,
  gs.updated_at
FROM idea_index idx
JOIN idea_growth_state gs ON idx.idea_id = gs.idea_id
WHERE gs.growth_state->'stage'->>'type' = 'ACCELERATING'
ORDER BY (gs.growth_state->>'potential')::int DESC
LIMIT 50;

-- View: Ideas at Inflection Points
-- Real-time detection of growth changes
CREATE OR REPLACE VIEW v_ideas_at_inflection AS
SELECT
  idx.idea_id,
  idx.title,
  idx.category,
  gs.inflection->>'type' as inflection_type,
  gs.inflection->>'emoji' as emoji,
  gs.inflection->>'message' as message,
  (gs.inflection->>'previousVelocity')::float as previous_velocity,
  (gs.inflection->>'currentVelocity')::float as current_velocity,
  (gs.inflection->>'change')::float as velocity_change,
  gs.updated_at
FROM idea_index idx
JOIN idea_growth_state gs ON idx.idea_id = gs.idea_id
WHERE gs.inflection->>'isInflection' = 'true'
ORDER BY gs.updated_at DESC;

-- View: Activity Heatmap
-- What are users ACTUALLY doing with ideas?
CREATE OR REPLACE VIEW v_activity_heatmap AS
SELECT
  activity_type,
  COUNT(*) as activity_count,
  COUNT(DISTINCT idea_id) as unique_ideas,
  COUNT(DISTINCT metadata->>'userId') as unique_users,
  DATE_TRUNC('day', timestamp) as activity_date
FROM idea_activities
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY activity_type, DATE_TRUNC('day', timestamp)
ORDER BY activity_date DESC, activity_count DESC;

-- View: Ideas Needing Migration
-- High-potential ideas from external sources that should be migrated
CREATE OR REPLACE VIEW v_ideas_needing_migration AS
SELECT
  idx.idea_id,
  idx.title,
  idx.source,
  idx.source_id,
  (gs.growth_state->>'potential')::int as potential_score,
  idx.created_at,
  idx.migrated_at
FROM idea_index idx
JOIN idea_growth_state gs ON idx.idea_id = gs.idea_id
WHERE idx.source != 'marketplace'
  AND idx.marketplace_idea_id IS NULL
  AND (gs.growth_state->>'potential')::int >= 70
ORDER BY (gs.growth_state->>'potential')::int DESC;

-- View: Idea Growth Timeline
-- Time series of growth snapshots
CREATE OR REPLACE VIEW v_idea_growth_timeline AS
SELECT
  gs.idea_id,
  idx.title,
  (gs.growth_state->>'potential')::int as potential,
  (gs.growth_state->>'momentum')::float as momentum,
  (gs.growth_state->'velocity'->>'current')::float as velocity,
  (gs.growth_state->'acceleration'->>'current')::float as acceleration,
  gs.growth_state->'stage'->>'type' as stage,
  gs.inflection->>'type' as inflection_type,
  gs.updated_at
FROM idea_growth_state gs
JOIN idea_index idx ON gs.idea_id = idx.idea_id
ORDER BY gs.idea_id, gs.updated_at DESC;

-- View: Dogfooding Dashboard
-- Track CALOS idea usage (dogfooding strategy)
CREATE OR REPLACE VIEW v_dogfooding_dashboard AS
SELECT
  idx.idea_id,
  idx.title,
  idx.category,
  COUNT(DISTINCT CASE WHEN a.activity_type = 'implemented' THEN a.metadata->>'userId' END) as implementers,
  COUNT(DISTINCT CASE WHEN a.activity_type = 'forked' THEN a.metadata->>'userId' END) as forkers,
  COUNT(DISTINCT CASE WHEN a.activity_type = 'iterated' THEN a.metadata->>'userId' END) as iterators,
  (gs.growth_state->>'potential')::int as potential_score,
  gs.growth_state->'stage'->>'type' as growth_stage,
  idx.created_at
FROM idea_index idx
LEFT JOIN idea_activities a ON idx.idea_id = a.idea_id
LEFT JOIN idea_growth_state gs ON idx.idea_id = (
  SELECT idea_id FROM idea_growth_state
  WHERE idea_id = idx.idea_id
  ORDER BY updated_at DESC
  LIMIT 1
)
WHERE idx.source = 'marketplace' OR idx.category = 'calos'
GROUP BY idx.idea_id, idx.title, idx.category, gs.growth_state, idx.created_at
ORDER BY (gs.growth_state->>'potential')::int DESC NULLS LAST;

-- ============================================================================
-- Activity Weight Configuration Table
-- Configurable weights for potential scoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_weights (
  activity_type TEXT PRIMARY KEY,
  weight INT NOT NULL,
  description TEXT
);

INSERT INTO activity_weights (activity_type, weight, description) VALUES
  ('viewed', 1, 'User viewed the idea'),
  ('forked', 5, 'User copied idea to use'),
  ('implemented', 20, 'User actually built it (highest value)'),
  ('referenced', 10, 'User mentioned in their work'),
  ('iterated', 15, 'User built on top of it'),
  ('submitted', 0, 'Original submission (neutral)'),
  ('shared', 3, 'User shared with others')
ON CONFLICT (activity_type) DO UPDATE SET
  weight = EXCLUDED.weight,
  description = EXCLUDED.description;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Get latest growth state for an idea
CREATE OR REPLACE FUNCTION get_latest_growth_state(p_idea_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_growth_state JSONB;
BEGIN
  SELECT growth_state INTO v_growth_state
  FROM idea_growth_state
  WHERE idea_id = p_idea_id
  ORDER BY updated_at DESC
  LIMIT 1;

  RETURN v_growth_state;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if idea needs migration
CREATE OR REPLACE FUNCTION needs_migration(p_idea_id TEXT, p_threshold INT DEFAULT 70)
RETURNS BOOLEAN AS $$
DECLARE
  v_potential INT;
  v_migrated BOOLEAN;
BEGIN
  -- Get potential score
  SELECT (growth_state->>'potential')::int INTO v_potential
  FROM idea_growth_state
  WHERE idea_id = p_idea_id
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Check if already migrated
  SELECT (marketplace_idea_id IS NOT NULL) INTO v_migrated
  FROM idea_index
  WHERE idea_id = p_idea_id;

  RETURN (v_potential >= p_threshold AND NOT v_migrated);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update last_synced_at when idea_index is modified
CREATE OR REPLACE FUNCTION update_idea_index_sync()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_synced_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_idea_index_sync
BEFORE UPDATE ON idea_index
FOR EACH ROW
EXECUTE FUNCTION update_idea_index_sync();

-- ============================================================================
-- Sample Data (for testing)
-- ============================================================================

-- Sample idea in index
INSERT INTO idea_index (idea_id, source, title, category, tags)
VALUES (
  'idea_calos_growth_tracker',
  'marketplace',
  'Idea Growth Tracker - Track Momentum Not Votes',
  'platform',
  ARRAY['growth', 'analytics', 'dogfooding']
)
ON CONFLICT (idea_id) DO NOTHING;

-- Sample activities (dogfooding)
INSERT INTO idea_activities (idea_id, activity_type, metadata)
VALUES
  ('idea_calos_growth_tracker', 'submitted', '{"userId": "cal", "source": "marketplace"}'),
  ('idea_calos_growth_tracker', 'implemented', '{"userId": "cal", "source": "marketplace", "repositoryUrl": "https://github.com/calos/agent-router"}'),
  ('idea_calos_growth_tracker', 'viewed', '{"userId": "user1", "source": "marketplace"}'),
  ('idea_calos_growth_tracker', 'forked', '{"userId": "user2", "source": "marketplace"}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE idea_activities IS 'Track what users ACTUALLY DO with ideas (not just votes)';
COMMENT ON TABLE idea_growth_state IS 'Snapshots of idea growth metrics: velocity, acceleration, momentum, potential';
COMMENT ON TABLE idea_index IS 'Cross-platform idea tracking (piggyback on Google Sheets, GitHub, etc.)';
COMMENT ON TABLE file_index IS 'Track files in external systems (Google Drive, S3, etc.)';
COMMENT ON TABLE activity_weights IS 'Configurable weights for potential scoring algorithm';

COMMENT ON VIEW v_high_potential_ideas IS 'Ideas with potential > 50, ranked by score';
COMMENT ON VIEW v_trending_ideas IS 'Ideas with accelerating growth (stage = ACCELERATING)';
COMMENT ON VIEW v_ideas_at_inflection IS 'Real-time inflection point detection (growth direction changes)';
COMMENT ON VIEW v_activity_heatmap IS 'What users are actually doing with ideas';
COMMENT ON VIEW v_ideas_needing_migration IS 'High-potential external ideas that should be migrated to marketplace';
COMMENT ON VIEW v_idea_growth_timeline IS 'Time series of growth snapshots';
COMMENT ON VIEW v_dogfooding_dashboard IS 'Track CALOS idea usage (dogfooding strategy)';

COMMENT ON FUNCTION get_latest_growth_state(TEXT) IS 'Get latest growth state for an idea';
COMMENT ON FUNCTION needs_migration(TEXT, INT) IS 'Check if idea needs migration based on potential threshold';
