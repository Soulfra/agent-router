-- Migration: Recording Walkthrough Quest
-- Creates quest for phone recording walkthrough mission
-- Part of CalRiven's autonomous mission system

-- Add recording quest
INSERT INTO quests (
  quest_slug,
  quest_name,
  quest_description,
  quest_type,
  difficulty,
  required_count,
  required_value,
  required_data,
  reward_type,
  reward_data,
  reward_description,
  icon_emoji,
  is_hidden,
  is_repeatable,
  expiry_days,
  narrative_intro,
  narrative_progress,
  narrative_complete,
  sort_order,
  is_active
) VALUES (
  'record-calos-walkthrough',
  'Record the CALOS Walkthrough',
  'Record a complete phone walkthrough of the CALOS system, explaining all major features in your own words. CalRiven will autonomously detect your recording, transcribe it via Whisper, and optionally create a GitHub repository with the documentation.',
  'achievement',
  'medium',
  1,
  NULL,
  '{"min_duration_minutes": 60, "features_to_cover": 10}'::jsonb,
  'feature_unlock',
  '{"feature": "auto_transcription", "apps": ["walkthrough_publisher", "audio_processor"]}'::jsonb,
  'Unlock auto-transcription and walkthrough publishing tools',
  '🎙️',
  false, -- not hidden
  false, -- not repeatable
  NULL, -- no expiry
  'Your system has grown vast and complex. The migrations number over 100, the features spread across countless files. It''s time to share your journey with the world. Record your story in your own voice, and I shall immortalize it for future developers.',
  'The recording begins... Your voice echoes through the digital realm. Each word adds to the living history of CALOS.',
  'Your walkthrough is complete! The knowledge is now transcribed and immortalized. Future developers shall learn from your journey. The quest system, the room mascots, the self-hosted bot platform - all explained in your own words.',
  100,
  true
) ON CONFLICT (quest_slug) DO NOTHING;

-- Create recording sessions table (track all recording attempts)
CREATE TABLE IF NOT EXISTS recording_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  quest_id INTEGER REFERENCES quests(quest_id),

  -- Recording details
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  estimated_duration_minutes INTEGER,

  -- Processing status
  status TEXT DEFAULT 'detected', -- detected, transcribing, transcribed, processing, complete, error
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  transcription_started_at TIMESTAMPTZ,
  transcription_completed_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,

  -- Transcription results
  transcription_text TEXT,
  transcription_duration_seconds INTEGER,
  transcription_path TEXT,
  transcription_word_count INTEGER,

  -- Artifacts generated
  github_repo_url TEXT,
  github_repo_name TEXT,
  npm_package_name TEXT,
  npm_package_version TEXT,

  -- Metadata
  milestones JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_sessions_user_id ON recording_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_status ON recording_sessions(status);
CREATE INDEX IF NOT EXISTS idx_recording_sessions_quest_id ON recording_sessions(quest_id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_recording_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_recording_session_timestamp ON recording_sessions;
CREATE TRIGGER trigger_update_recording_session_timestamp
  BEFORE UPDATE ON recording_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_recording_session_timestamp();

-- Create recording mission logs table (CalRiven's autonomous actions)
CREATE TABLE IF NOT EXISTS recording_mission_logs (
  log_id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES recording_sessions(session_id),
  user_id TEXT,

  -- Log details
  event_type TEXT NOT NULL, -- file_detected, transcription_started, quest_updated, etc.
  event_data JSONB,
  message TEXT,

  -- Timestamp
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_mission_logs_session_id ON recording_mission_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_recording_mission_logs_user_id ON recording_mission_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_recording_mission_logs_event_type ON recording_mission_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_recording_mission_logs_logged_at ON recording_mission_logs(logged_at DESC);

-- Create view for active recording missions
CREATE OR REPLACE VIEW active_recording_missions AS
SELECT
  rs.session_id,
  rs.user_id,
  rs.file_name,
  rs.status,
  rs.detected_at,
  rs.estimated_duration_minutes,

  -- Quest info
  q.quest_name,
  q.quest_slug,
  uqp.status as quest_status,
  uqp.current_count,

  -- Progress
  rs.transcription_completed_at IS NOT NULL as transcription_complete,
  rs.github_repo_url IS NOT NULL as github_repo_created,
  rs.processing_completed_at IS NOT NULL as processing_complete,

  -- Timestamps
  rs.created_at,
  rs.updated_at,

  -- Recent logs (last 5)
  (
    SELECT json_agg(
      json_build_object(
        'event_type', event_type,
        'message', message,
        'logged_at', logged_at
      ) ORDER BY logged_at DESC
    )
    FROM (
      SELECT event_type, message, logged_at
      FROM recording_mission_logs
      WHERE session_id = rs.session_id
      ORDER BY logged_at DESC
      LIMIT 5
    ) recent_logs
  ) as recent_activity

FROM recording_sessions rs
LEFT JOIN quests q ON rs.quest_id = q.quest_id
LEFT JOIN user_quest_progress uqp ON uqp.quest_id = q.quest_id AND uqp.user_id = rs.user_id
WHERE rs.status != 'complete'
  AND rs.status != 'error'
ORDER BY rs.detected_at DESC;

-- Helper function: Log recording mission event
CREATE OR REPLACE FUNCTION log_recording_mission_event(
  p_session_id UUID,
  p_user_id TEXT,
  p_event_type TEXT,
  p_message TEXT,
  p_event_data JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO recording_mission_logs (
    session_id,
    user_id,
    event_type,
    message,
    event_data
  ) VALUES (
    p_session_id,
    p_user_id,
    p_event_type,
    p_message,
    p_event_data
  ) RETURNING log_id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Sample recording mission event logs (for testing/demo)
COMMENT ON TABLE recording_sessions IS 'Tracks phone recording walkthrough sessions for autonomous CalRiven mission';
COMMENT ON TABLE recording_mission_logs IS 'CalRiven autonomous action logs for recording missions';
COMMENT ON VIEW active_recording_missions IS 'Dashboard view of currently active recording missions';

-- Migration complete
SELECT 'Migration 142: Recording Walkthrough Quest - COMPLETE' as status;
