-- Migration 018: Voice Usage Tracking & Analytics
-- Adds token usage tracking to voice transcriptions and creates unified analytics views

-- Add token tracking columns to voice_transcriptions
ALTER TABLE voice_transcriptions
ADD COLUMN IF NOT EXISTS whisper_tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS whisper_cost_usd DECIMAL(10,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS whisper_provider VARCHAR(50) DEFAULT 'local', -- 'openai', 'local', 'groq'
ADD COLUMN IF NOT EXISTS whisper_model VARCHAR(100) DEFAULT 'whisper-base.en';

-- Create unified daily usage view combining voice + learning sessions
CREATE OR REPLACE VIEW user_daily_usage AS
SELECT
  u.user_id,
  u.username,
  u.email,
  u.tenant_id,
  COALESCE(voice_stats.usage_date, learning_stats.usage_date) as usage_date,

  -- Voice stats
  COALESCE(voice_calls, 0) as voice_calls,
  COALESCE(voice_tokens, 0) as voice_tokens,
  COALESCE(voice_cost_usd, 0) as voice_cost_usd,
  COALESCE(voice_minutes, 0) as voice_minutes,

  -- Learning session stats
  COALESCE(learning_calls, 0) as learning_calls,
  COALESCE(learning_tokens, 0) as learning_tokens,
  COALESCE(learning_cost_usd, 0) as learning_cost_usd,

  -- Combined totals
  COALESCE(voice_calls, 0) + COALESCE(learning_calls, 0) as total_api_calls,
  COALESCE(voice_tokens, 0) + COALESCE(learning_tokens, 0) as total_tokens,
  COALESCE(voice_cost_usd, 0) + COALESCE(learning_cost_usd, 0) as total_cost_usd

FROM users u

-- Left join with voice daily stats
LEFT JOIN (
  SELECT
    user_id,
    tenant_id,
    DATE(created_at) as usage_date,
    COUNT(*) as voice_calls,
    SUM(whisper_tokens_used) as voice_tokens,
    SUM(whisper_cost_usd) as voice_cost_usd,
    SUM(audio_duration_seconds / 60.0) as voice_minutes
  FROM voice_transcriptions
  WHERE processing_status = 'completed'
  GROUP BY user_id, tenant_id, DATE(created_at)
) voice_stats ON u.user_id = voice_stats.user_id AND u.tenant_id = voice_stats.tenant_id

-- Left join with learning session daily stats
LEFT JOIN (
  SELECT
    user_id,
    tenant_id,
    DATE(created_at) as usage_date,
    COUNT(*) as learning_calls,
    SUM(
      COALESCE(tokens_input, 0) +
      COALESCE(tokens_output, 0)
    ) as learning_tokens,
    SUM(cost_usd) as learning_cost_usd
  FROM learning_sessions
  GROUP BY user_id, tenant_id, DATE(created_at)
) learning_stats ON u.user_id = learning_stats.user_id
  AND u.tenant_id = learning_stats.tenant_id
  AND voice_stats.usage_date = learning_stats.usage_date

WHERE voice_stats.usage_date IS NOT NULL OR learning_stats.usage_date IS NOT NULL;

-- Create cumulative usage view (all-time totals per user)
CREATE OR REPLACE VIEW user_cumulative_usage AS
SELECT
  u.user_id,
  u.username,
  u.email,
  u.tenant_id,

  -- Voice totals
  COALESCE(v.total_voice_calls, 0) as total_voice_calls,
  COALESCE(v.total_voice_tokens, 0) as total_voice_tokens,
  COALESCE(v.total_voice_cost, 0) as total_voice_cost_usd,
  COALESCE(v.total_voice_minutes, 0) as total_voice_minutes,

  -- Learning totals
  COALESCE(l.total_learning_calls, 0) as total_learning_calls,
  COALESCE(l.total_learning_tokens, 0) as total_learning_tokens,
  COALESCE(l.total_learning_cost, 0) as total_learning_cost_usd,

  -- Combined totals
  COALESCE(v.total_voice_calls, 0) + COALESCE(l.total_learning_calls, 0) as total_api_calls,
  COALESCE(v.total_voice_tokens, 0) + COALESCE(l.total_learning_tokens, 0) as total_tokens_used,
  COALESCE(v.total_voice_cost, 0) + COALESCE(l.total_learning_cost, 0) as total_cost_usd,

  -- First/last activity
  LEAST(
    COALESCE(v.first_voice_at, NOW()),
    COALESCE(l.first_learning_at, NOW())
  ) as first_activity_at,
  GREATEST(
    COALESCE(v.last_voice_at, '1970-01-01'::timestamptz),
    COALESCE(l.last_learning_at, '1970-01-01'::timestamptz)
  ) as last_activity_at

FROM users u

-- Voice aggregates
LEFT JOIN (
  SELECT
    user_id,
    tenant_id,
    COUNT(*) as total_voice_calls,
    SUM(whisper_tokens_used) as total_voice_tokens,
    SUM(whisper_cost_usd) as total_voice_cost,
    SUM(audio_duration_seconds / 60.0) as total_voice_minutes,
    MIN(created_at) as first_voice_at,
    MAX(created_at) as last_voice_at
  FROM voice_transcriptions
  WHERE processing_status = 'completed'
  GROUP BY user_id, tenant_id
) v ON u.user_id = v.user_id AND u.tenant_id = v.tenant_id

-- Learning session aggregates
LEFT JOIN (
  SELECT
    user_id,
    tenant_id,
    COUNT(*) as total_learning_calls,
    SUM(
      COALESCE(tokens_input, 0) +
      COALESCE(tokens_output, 0)
    ) as total_learning_tokens,
    SUM(cost_usd) as total_learning_cost,
    MIN(created_at) as first_learning_at,
    MAX(created_at) as last_learning_at
  FROM learning_sessions
  GROUP BY user_id, tenant_id
) l ON u.user_id = l.user_id AND u.tenant_id = l.tenant_id;

-- Create project-specific usage view
CREATE OR REPLACE VIEW project_usage_stats AS
SELECT
  pc.project_id,
  pc.project_slug,
  pc.project_name,
  pc.tenant_id,

  -- Voice stats
  COUNT(vt.transcription_id) as total_transcriptions,
  SUM(vt.whisper_tokens_used) as total_tokens,
  SUM(vt.whisper_cost_usd) as total_cost_usd,
  SUM(vt.audio_duration_seconds / 60.0) as total_minutes,
  AVG(vt.detection_confidence) as avg_detection_confidence,

  -- Temporal stats
  MIN(vt.created_at) as first_yap_at,
  MAX(vt.created_at) as last_yap_at,
  COUNT(DISTINCT vt.user_id) as unique_users,
  COUNT(DISTINCT DATE(vt.created_at)) as active_days

FROM project_contexts pc
LEFT JOIN voice_transcriptions vt ON pc.project_id = vt.project_id
WHERE vt.processing_status = 'completed' OR vt.transcription_id IS NULL
GROUP BY pc.project_id, pc.project_slug, pc.project_name, pc.tenant_id;

-- Grant permissions
GRANT SELECT ON user_daily_usage TO PUBLIC;
GRANT SELECT ON user_cumulative_usage TO PUBLIC;
GRANT SELECT ON project_usage_stats TO PUBLIC;

-- Create indexes for performance (without date functions which aren't immutable)
CREATE INDEX IF NOT EXISTS idx_voice_user_created ON voice_transcriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_tenant_created ON voice_transcriptions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_user_created ON learning_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_tenant_created ON learning_sessions(tenant_id, created_at DESC);

COMMENT ON VIEW user_daily_usage IS 'Daily usage statistics combining voice transcriptions and learning sessions';
COMMENT ON VIEW user_cumulative_usage IS 'All-time cumulative usage statistics per user';
COMMENT ON VIEW project_usage_stats IS 'Usage statistics aggregated by project';
