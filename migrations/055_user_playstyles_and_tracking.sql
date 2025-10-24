-- Migration: User Playstyles and Tracking System
-- Adds tables for tracking user playstyles, tree progress, intents, and goals

-- ============================================================================
-- User Interactions Table
-- Stores all user interactions for playstyle analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_interactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  identity_id TEXT,
  interaction_type TEXT NOT NULL, -- 'question', 'action', 'navigation', 'tool_use'
  content TEXT,
  classification JSONB, -- {type, features: {directness, technical, etc}}
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),

  CONSTRAINT user_or_identity_required CHECK (user_id IS NOT NULL OR identity_id IS NOT NULL)
);

CREATE INDEX idx_user_interactions_user ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_identity ON user_interactions(identity_id);
CREATE INDEX idx_user_interactions_timestamp ON user_interactions(timestamp DESC);
CREATE INDEX idx_user_interactions_type ON user_interactions(interaction_type);

-- ============================================================================
-- User Playstyles Table
-- Stores computed playstyle profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_playstyles (
  user_id TEXT PRIMARY KEY,
  identity_id TEXT,

  -- Question Style
  question_style JSONB, -- {directness: 0.8, technical: 0.9}

  -- Learning Path
  learning_path JSONB, -- {tutorial: 0.3, docs: 0.7, trial: 0.5}

  -- Interaction Pattern
  interaction_pattern JSONB, -- {pattern: 'burst', burstiness: 0.8, avgGapMinutes: 45}

  -- Depth Preference
  depth_preference FLOAT DEFAULT 0.5,

  -- Tool Usage
  tool_usage JSONB, -- {powerUserScore: 0.7, tools: {}, mostUsed: 'vscode'}

  -- Goals (cached from intent classifier)
  goals JSONB, -- [{goal: 'launch_website', confidence: 0.95}]

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_playstyles_identity ON user_playstyles(identity_id);

-- ============================================================================
-- Tree Node Visits Table
-- Tracks which nodes users visit in decision trees
-- ============================================================================

CREATE TABLE IF NOT EXISTS tree_node_visits (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  identity_id TEXT,
  tree_id TEXT NOT NULL, -- 'launch-website', 'learn-git', etc.
  node_id TEXT NOT NULL, -- 'setup-domain', 'first-commit', etc.
  node_type TEXT DEFAULT 'step', -- 'step', 'milestone', 'checkpoint', 'decision'
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),

  CONSTRAINT user_or_identity_required CHECK (user_id IS NOT NULL OR identity_id IS NOT NULL)
);

CREATE INDEX idx_tree_visits_user ON tree_node_visits(user_id);
CREATE INDEX idx_tree_visits_identity ON tree_node_visits(identity_id);
CREATE INDEX idx_tree_visits_tree ON tree_node_visits(tree_id);
CREATE INDEX idx_tree_visits_node ON tree_node_visits(tree_id, node_id);
CREATE INDEX idx_tree_visits_timestamp ON tree_node_visits(timestamp DESC);

-- ============================================================================
-- Tree Node Completions Table
-- Tracks completed nodes
-- ============================================================================

CREATE TABLE IF NOT EXISTS tree_node_completions (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  identity_id TEXT,
  tree_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  metadata JSONB,
  completed_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT user_or_identity_required CHECK (user_id IS NOT NULL OR identity_id IS NOT NULL),
  UNIQUE(user_id, tree_id, node_id)
);

CREATE INDEX idx_tree_completions_user ON tree_node_completions(user_id);
CREATE INDEX idx_tree_completions_identity ON tree_node_completions(identity_id);
CREATE INDEX idx_tree_completions_tree ON tree_node_completions(tree_id);
CREATE INDEX idx_tree_completions_completed ON tree_node_completions(completed_at DESC);

-- ============================================================================
-- User Tree Progress Table
-- Aggregated progress for each tree
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_tree_progress (
  user_id TEXT,
  identity_id TEXT,
  tree_id TEXT NOT NULL,
  nodes_visited INT DEFAULT 0,
  nodes_completed INT DEFAULT 0,
  nodes_total INT DEFAULT 0,
  completion_rate FLOAT DEFAULT 0,
  last_node TEXT,
  last_activity TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (user_id, tree_id),
  CONSTRAINT user_or_identity_required CHECK (user_id IS NOT NULL OR identity_id IS NOT NULL)
);

CREATE INDEX idx_tree_progress_identity ON user_tree_progress(identity_id);
CREATE INDEX idx_tree_progress_completion ON user_tree_progress(completion_rate DESC);
CREATE INDEX idx_tree_progress_activity ON user_tree_progress(last_activity DESC);

-- ============================================================================
-- User Goals Table
-- Inferred goals from intent classifier
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_goals (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  identity_id TEXT,
  goal TEXT NOT NULL, -- 'launch_website', 'learn_programming', etc.
  confidence FLOAT DEFAULT 0.5,
  evidence INT DEFAULT 0, -- Number of interactions supporting this goal
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'abandoned'
  inferred_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT user_or_identity_required CHECK (user_id IS NOT NULL OR identity_id IS NOT NULL),
  UNIQUE(user_id, goal)
);

CREATE INDEX idx_user_goals_user ON user_goals(user_id);
CREATE INDEX idx_user_goals_identity ON user_goals(identity_id);
CREATE INDEX idx_user_goals_goal ON user_goals(goal);
CREATE INDEX idx_user_goals_status ON user_goals(status);
CREATE INDEX idx_user_goals_confidence ON user_goals(confidence DESC);

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- View: Active Users with Playstyles
CREATE OR REPLACE VIEW v_active_users_playstyles AS
SELECT
  u.user_id,
  u.identity_id,
  u.question_style,
  u.learning_path,
  u.depth_preference,
  u.tool_usage,
  COUNT(i.id) as interaction_count,
  MAX(i.timestamp) as last_interaction
FROM user_playstyles u
LEFT JOIN user_interactions i
  ON u.user_id = i.user_id OR u.identity_id = i.identity_id
WHERE i.timestamp > NOW() - INTERVAL '30 days'
GROUP BY u.user_id, u.identity_id, u.question_style, u.learning_path, u.depth_preference, u.tool_usage;

-- View: Tree Progress Summary
CREATE OR REPLACE VIEW v_tree_progress_summary AS
SELECT
  tree_id,
  COUNT(DISTINCT user_id) as users_count,
  AVG(completion_rate) as avg_completion,
  MAX(completion_rate) as max_completion,
  COUNT(*) FILTER (WHERE completion_rate >= 1.0) as completed_count,
  COUNT(*) FILTER (WHERE completion_rate > 0 AND completion_rate < 1.0) as in_progress_count
FROM user_tree_progress
GROUP BY tree_id;

-- View: Popular Goals
CREATE OR REPLACE VIEW v_popular_goals AS
SELECT
  goal,
  COUNT(DISTINCT user_id) as users_with_goal,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned_count
FROM user_goals
GROUP BY goal
ORDER BY users_with_goal DESC;

-- View: User Segments
CREATE OR REPLACE VIEW v_user_segments AS
SELECT
  user_id,
  identity_id,
  CASE
    WHEN (question_style->>'technical')::FLOAT > 0.7 AND depth_preference > 0.7
      THEN 'power_user'
    WHEN (question_style->>'technical')::FLOAT < 0.4 AND (learning_path->>'tutorial')::FLOAT > 0.5
      THEN 'beginner'
    WHEN (question_style->>'directness')::FLOAT > 0.6
      THEN 'builder'
    WHEN (question_style->>'directness')::FLOAT < 0.4
      THEN 'explorer'
    ELSE 'general'
  END as segment,
  question_style,
  learning_path,
  depth_preference
FROM user_playstyles;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update user_playstyles.updated_at on change
CREATE OR REPLACE FUNCTION update_playstyle_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_playstyle_timestamp
BEFORE UPDATE ON user_playstyles
FOR EACH ROW
EXECUTE FUNCTION update_playstyle_timestamp();

-- ============================================================================
-- Sample Data for Cal
-- ============================================================================

-- Insert Cal's initial profile
INSERT INTO user_playstyles (user_id, identity_id, question_style, learning_path)
VALUES (
  'cal',
  'cal',
  '{"directness": 0.5, "technical": 0.5}'::JSONB,
  '{"tutorial": 0.33, "docs": 0.33, "trial": 0.33}'::JSONB
)
ON CONFLICT (user_id) DO NOTHING;

-- Insert Cal's initial goal
INSERT INTO user_goals (user_id, identity_id, goal, confidence, evidence, status)
VALUES (
  'cal',
  'cal',
  'launch_website',
  0.95,
  1,
  'active'
)
ON CONFLICT (user_id, goal) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE user_interactions IS 'All user interactions for playstyle analysis';
COMMENT ON TABLE user_playstyles IS 'Computed user playstyle profiles';
COMMENT ON TABLE tree_node_visits IS 'User visits to tree nodes';
COMMENT ON TABLE tree_node_completions IS 'Completed tree nodes';
COMMENT ON TABLE user_tree_progress IS 'Aggregated tree progress per user';
COMMENT ON TABLE user_goals IS 'Inferred user goals from behavior';

COMMENT ON VIEW v_active_users_playstyles IS 'Active users with their playstyles';
COMMENT ON VIEW v_tree_progress_summary IS 'Summary of progress across all trees';
COMMENT ON VIEW v_popular_goals IS 'Most common user goals';
COMMENT ON VIEW v_user_segments IS 'User segments based on playstyle';
