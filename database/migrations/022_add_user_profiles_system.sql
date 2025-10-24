-- User Profiles & ICP Segmentation System
-- Enables A/B testing, profile-based routing, and personalization

-- User profiles (detected or selected)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Profile assignment
  detected_profile TEXT,           -- Auto-detected from behavior
  selected_profile TEXT,           -- User-selected profile
  confidence REAL DEFAULT 0,       -- Detection confidence (0-1)

  -- History tracking
  profile_history JSONB DEFAULT '[]'::jsonb,  -- Array of {profile, confidence, timestamp}

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_detected ON user_profiles(detected_profile) WHERE detected_profile IS NOT NULL;
CREATE INDEX idx_user_profiles_selected ON user_profiles(selected_profile) WHERE selected_profile IS NOT NULL;
CREATE INDEX idx_user_profiles_confidence ON user_profiles(confidence);

-- ICP segment definitions
CREATE TABLE IF NOT EXISTS icp_segments (
  id SERIAL PRIMARY KEY,

  -- Segment identity
  segment_name TEXT UNIQUE NOT NULL,
  segment_id TEXT UNIQUE NOT NULL,  -- e.g., 'developer', 'content_creator'
  description TEXT,

  -- Characteristics
  keywords TEXT[],                  -- Identifying keywords
  typical_domains TEXT[],           -- Preferred domain models
  avg_session_length_minutes INTEGER,
  typical_prompt_length INTEGER,
  uses_code_blocks BOOLEAN DEFAULT false,

  -- Performance baselines
  expected_success_rate REAL,
  expected_response_time_ms INTEGER,
  expected_cost_per_session REAL,

  -- Conversion metrics (for monetization tracking)
  avg_conversion_rate REAL,
  avg_lifetime_value_usd REAL,

  -- Sample data
  example_prompts JSONB,            -- Array of example prompts

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial ICP segments
INSERT INTO icp_segments (segment_id, segment_name, description, keywords, typical_domains, avg_session_length_minutes, typical_prompt_length, uses_code_blocks)
VALUES
  ('developer', 'Developer', 'Software engineers, programmers, DevOps',
   ARRAY['code', 'function', 'debug', 'api', 'git', 'deploy', 'test', 'npm', 'docker'],
   ARRAY['code', 'cryptography', 'data'], 45, 200, true),

  ('content_creator', 'Content Creator', 'Marketers, writers, designers, social media',
   ARRAY['blog', 'marketing', 'seo', 'content', 'campaign', 'social media', 'creative'],
   ARRAY['creative', 'publishing', 'whimsical'], 30, 150, false),

  ('executive', 'Executive/Manager', 'Business leaders, managers, decision-makers',
   ARRAY['summary', 'insights', 'strategy', 'roi', 'metrics', 'forecast', 'decision'],
   ARRAY['reasoning', 'publishing'], 15, 100, false),

  ('data_analyst', 'Data Analyst', 'Data scientists, analysts, BI professionals',
   ARRAY['csv', 'data', 'analyze', 'pandas', 'sql', 'etl', 'visualization'],
   ARRAY['data', 'reasoning'], 40, 180, true),

  ('technical_writer', 'Technical Writer', 'Documentation specialists, technical communicators',
   ARRAY['documentation', 'readme', 'guide', 'tutorial', 'api docs', 'manual'],
   ARRAY['publishing', 'code'], 35, 160, true),

  ('student', 'Student/Learner', 'Students, learners, educators',
   ARRAY['learn', 'explain', 'understand', 'homework', 'study', 'tutorial'],
   ARRAY['reasoning', 'whimsical', 'publishing'], 25, 120, false),

  ('researcher', 'Researcher', 'Academic researchers, scientists, analysts',
   ARRAY['research', 'study', 'paper', 'hypothesis', 'analysis', 'methodology'],
   ARRAY['reasoning', 'data', 'publishing'], 50, 250, false),

  ('casual', 'Casual User', 'General users, casual inquiries, simple tasks',
   ARRAY['hi', 'help', 'question', 'simple', 'recommend', 'compare'],
   ARRAY['simple', 'fact', 'creative'], 10, 80, false)
ON CONFLICT (segment_id) DO NOTHING;

-- Profile preferences (user-specific overrides)
CREATE TABLE IF NOT EXISTS user_profile_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Preferences
  preferred_domains TEXT[],         -- Domain order preference
  preferred_model_versions JSONB,   -- {domain: version} mapping
  preferred_wrappers JSONB,         -- {domain: wrapper} mapping

  -- UI preferences
  show_code_explanations BOOLEAN DEFAULT true,
  preferred_output_format TEXT DEFAULT 'markdown',  -- 'markdown', 'plain', 'code-only'
  preferred_verbosity TEXT DEFAULT 'normal',        -- 'concise', 'normal', 'detailed'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Profile performance tracking (aggregated metrics per profile)
CREATE TABLE IF NOT EXISTS profile_performance_stats (
  id SERIAL PRIMARY KEY,

  -- What profile
  profile_id TEXT NOT NULL,

  -- Time period
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage metrics
  total_requests INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,

  -- Performance metrics
  avg_success_rate REAL,
  avg_response_time_ms REAL,
  avg_cost_per_request REAL,

  -- Engagement metrics
  avg_session_length_minutes REAL,
  avg_requests_per_session REAL,
  avg_followup_rate REAL,

  -- Domain distribution (JSONB: {domain: count})
  domain_distribution JSONB,

  -- Conversion metrics (for monetization)
  new_trials INTEGER DEFAULT 0,
  trial_to_paid INTEGER DEFAULT 0,
  total_revenue_usd REAL DEFAULT 0,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(profile_id, date)
);

CREATE INDEX idx_profile_stats_profile ON profile_performance_stats(profile_id);
CREATE INDEX idx_profile_stats_date ON profile_performance_stats(date DESC);

-- Function to refresh profile stats
CREATE OR REPLACE FUNCTION refresh_profile_performance_stats(days_back INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  -- Aggregate usage data by profile and date
  INSERT INTO profile_performance_stats (
    profile_id,
    date,
    total_requests,
    unique_users,
    avg_success_rate,
    avg_response_time_ms,
    avg_cost_per_request,
    domain_distribution,
    updated_at
  )
  SELECT
    COALESCE(up.selected_profile, up.detected_profile) as profile_id,
    DATE(mul.timestamp) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT mul.user_id) as unique_users,
    COUNT(*) FILTER (WHERE mul.status = 'success')::REAL / COUNT(*)::REAL as avg_success_rate,
    AVG(mul.response_time_ms) as avg_response_time_ms,
    AVG(mul.cost_usd) as avg_cost_per_request,
    jsonb_object_agg(
      COALESCE(mul.use_case_category, 'unknown'),
      COUNT(*)
    ) as domain_distribution,
    NOW() as updated_at
  FROM model_usage_log mul
  LEFT JOIN user_profiles up ON up.user_id = mul.user_id
  WHERE mul.timestamp >= CURRENT_DATE - (days_back || ' days')::INTERVAL
    AND COALESCE(up.selected_profile, up.detected_profile) IS NOT NULL
  GROUP BY COALESCE(up.selected_profile, up.detected_profile), DATE(mul.timestamp)
  ON CONFLICT (profile_id, date) DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    unique_users = EXCLUDED.unique_users,
    avg_success_rate = EXCLUDED.avg_success_rate,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    avg_cost_per_request = EXCLUDED.avg_cost_per_request,
    domain_distribution = EXCLUDED.domain_distribution,
    updated_at = NOW();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update user_profiles.updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_update_timestamp
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profiles_timestamp();

-- Comments for documentation
COMMENT ON TABLE user_profiles IS 'User profile assignments (detected or selected) for personalization and A/B testing';
COMMENT ON TABLE icp_segments IS 'Ideal Customer Profile segments with characteristics and baselines';
COMMENT ON TABLE user_profile_preferences IS 'User-specific preference overrides per profile';
COMMENT ON TABLE profile_performance_stats IS 'Aggregated performance metrics per profile over time';
COMMENT ON FUNCTION refresh_profile_performance_stats IS 'Refresh profile stats from usage logs (call daily)';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON user_profiles TO agent_router_app;
-- GRANT SELECT ON icp_segments TO agent_router_app;
-- GRANT SELECT, INSERT, UPDATE ON user_profile_preferences TO agent_router_app;
-- GRANT SELECT ON profile_performance_stats TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'User Profiles & ICP System installed successfully!';
  RAISE NOTICE '- 8 ICP segments seeded';
  RAISE NOTICE '- Profile detection ready';
  RAISE NOTICE '- Performance tracking enabled';
  RAISE NOTICE 'Next: Run refresh_profile_performance_stats() daily via cron';
END $$;
