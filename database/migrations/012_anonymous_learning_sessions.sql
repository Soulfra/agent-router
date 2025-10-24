-- Anonymous Learning Sessions Schema
-- Tracks free learning progress without requiring account creation
-- Privacy-first: Uses fingerprint IDs, no PII stored

-- Anonymous learning sessions
CREATE TABLE IF NOT EXISTS anonymous_learning_sessions (
  id SERIAL PRIMARY KEY,
  fingerprint_id VARCHAR(16) NOT NULL,

  -- Cookie-based interests (privacy-safe)
  cookie_interests JSONB DEFAULT '{}',
  cookie_categories JSONB DEFAULT '{}',
  suggested_paths JSONB DEFAULT '[]',

  -- Learning progress
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  current_path VARCHAR(100),
  lessons_started INTEGER DEFAULT 0,
  lessons_completed INTEGER DEFAULT 0,

  -- Engagement tracking
  total_time_seconds INTEGER DEFAULT 0,
  last_active_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  -- Migration flag (when user creates account)
  migrated_to_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  migrated_at TIMESTAMP,

  UNIQUE(fingerprint_id)
);

-- Anonymous lesson completions
CREATE TABLE IF NOT EXISTS anonymous_lesson_completions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES anonymous_learning_sessions(id) ON DELETE CASCADE,
  fingerprint_id VARCHAR(16) NOT NULL,

  lesson_id INTEGER, -- FK to lessons table (add constraint when lessons table exists)
  domain VARCHAR(100) NOT NULL,
  lesson_slug VARCHAR(200) NOT NULL,

  -- Completion details
  completed_at TIMESTAMP DEFAULT NOW(),
  time_spent_seconds INTEGER,
  attempts INTEGER DEFAULT 1,
  xp_earned INTEGER DEFAULT 0,

  -- Code submissions (optional)
  code_submitted TEXT,
  test_results JSONB,

  UNIQUE(fingerprint_id, lesson_id)
);

-- Anonymous page visits (for click tracking on homepage)
CREATE TABLE IF NOT EXISTS anonymous_page_visits (
  id SERIAL PRIMARY KEY,
  fingerprint_id VARCHAR(16) NOT NULL,
  session_id INTEGER REFERENCES anonymous_learning_sessions(id) ON DELETE CASCADE,

  -- Page details
  url TEXT NOT NULL,
  pathname VARCHAR(500),
  page_title VARCHAR(500),
  referrer TEXT,

  -- Click tracking
  element_clicked VARCHAR(200),
  click_text VARCHAR(200),
  click_position JSONB, -- {x: 123, y: 456}

  -- Timing
  time_on_page_seconds INTEGER,
  visited_at TIMESTAMP DEFAULT NOW(),

  -- Interests extracted from visit
  interests_detected JSONB DEFAULT '[]'
);

-- Anonymous achievements (gamification)
CREATE TABLE IF NOT EXISTS anonymous_achievements (
  id SERIAL PRIMARY KEY,
  fingerprint_id VARCHAR(16) NOT NULL,
  session_id INTEGER REFERENCES anonymous_learning_sessions(id) ON DELETE CASCADE,

  achievement_type VARCHAR(100) NOT NULL, -- 'first_lesson', 'streak_3_days', etc.
  achievement_name VARCHAR(200) NOT NULL,
  achievement_description TEXT,
  xp_reward INTEGER DEFAULT 0,

  earned_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(fingerprint_id, achievement_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_anon_sessions_fingerprint ON anonymous_learning_sessions(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_anon_sessions_last_active ON anonymous_learning_sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_anon_sessions_migrated ON anonymous_learning_sessions(migrated_to_user_id);

CREATE INDEX IF NOT EXISTS idx_anon_completions_fingerprint ON anonymous_lesson_completions(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_anon_completions_session ON anonymous_lesson_completions(session_id);
CREATE INDEX IF NOT EXISTS idx_anon_completions_lesson ON anonymous_lesson_completions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_anon_completions_domain ON anonymous_lesson_completions(domain);

CREATE INDEX IF NOT EXISTS idx_anon_visits_fingerprint ON anonymous_page_visits(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_anon_visits_session ON anonymous_page_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_anon_visits_pathname ON anonymous_page_visits(pathname);

CREATE INDEX IF NOT EXISTS idx_anon_achievements_fingerprint ON anonymous_achievements(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_anon_achievements_session ON anonymous_achievements(session_id);

-- Functions for common operations

-- Get or create anonymous session
CREATE OR REPLACE FUNCTION get_or_create_anonymous_session(
  p_fingerprint_id VARCHAR(16),
  p_cookie_interests JSONB DEFAULT '{}',
  p_cookie_categories JSONB DEFAULT '{}',
  p_suggested_paths JSONB DEFAULT '[]'
)
RETURNS anonymous_learning_sessions AS $$
DECLARE
  v_session anonymous_learning_sessions;
BEGIN
  -- Try to get existing session
  SELECT * INTO v_session
  FROM anonymous_learning_sessions
  WHERE fingerprint_id = p_fingerprint_id
  AND migrated_to_user_id IS NULL;

  -- Create if doesn't exist
  IF NOT FOUND THEN
    INSERT INTO anonymous_learning_sessions (
      fingerprint_id,
      cookie_interests,
      cookie_categories,
      suggested_paths
    ) VALUES (
      p_fingerprint_id,
      p_cookie_interests,
      p_cookie_categories,
      p_suggested_paths
    )
    RETURNING * INTO v_session;
  ELSE
    -- Update last_active_at
    UPDATE anonymous_learning_sessions
    SET last_active_at = NOW(),
        cookie_interests = p_cookie_interests,
        cookie_categories = p_cookie_categories,
        suggested_paths = p_suggested_paths
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql;

-- Complete a lesson (anonymous)
CREATE OR REPLACE FUNCTION complete_anonymous_lesson(
  p_fingerprint_id VARCHAR(16),
  p_lesson_id INTEGER,
  p_domain VARCHAR(100),
  p_lesson_slug VARCHAR(200),
  p_time_spent_seconds INTEGER,
  p_xp_earned INTEGER DEFAULT 10,
  p_code_submitted TEXT DEFAULT NULL,
  p_test_results JSONB DEFAULT NULL
)
RETURNS anonymous_lesson_completions AS $$
DECLARE
  v_session anonymous_learning_sessions;
  v_completion anonymous_lesson_completions;
BEGIN
  -- Get or create session
  SELECT * INTO v_session
  FROM get_or_create_anonymous_session(p_fingerprint_id);

  -- Insert or update completion
  INSERT INTO anonymous_lesson_completions (
    session_id,
    fingerprint_id,
    lesson_id,
    domain,
    lesson_slug,
    time_spent_seconds,
    xp_earned,
    code_submitted,
    test_results
  ) VALUES (
    v_session.id,
    p_fingerprint_id,
    p_lesson_id,
    p_domain,
    p_lesson_slug,
    p_time_spent_seconds,
    p_xp_earned,
    p_code_submitted,
    p_test_results
  )
  ON CONFLICT (fingerprint_id, lesson_id)
  DO UPDATE SET
    attempts = anonymous_lesson_completions.attempts + 1,
    completed_at = NOW(),
    time_spent_seconds = EXCLUDED.time_spent_seconds,
    code_submitted = EXCLUDED.code_submitted,
    test_results = EXCLUDED.test_results
  RETURNING * INTO v_completion;

  -- Update session stats
  UPDATE anonymous_learning_sessions
  SET
    lessons_completed = (
      SELECT COUNT(DISTINCT lesson_id)
      FROM anonymous_lesson_completions
      WHERE session_id = v_session.id
    ),
    xp = xp + p_xp_earned,
    level = FLOOR((xp + p_xp_earned) / 100) + 1,
    last_active_at = NOW()
  WHERE id = v_session.id;

  RETURN v_completion;
END;
$$ LANGUAGE plpgsql;

-- Track page visit with click
CREATE OR REPLACE FUNCTION track_anonymous_page_visit(
  p_fingerprint_id VARCHAR(16),
  p_url TEXT,
  p_pathname VARCHAR(500),
  p_page_title VARCHAR(500),
  p_referrer TEXT DEFAULT NULL,
  p_element_clicked VARCHAR(200) DEFAULT NULL,
  p_click_text VARCHAR(200) DEFAULT NULL,
  p_click_position JSONB DEFAULT NULL,
  p_time_on_page_seconds INTEGER DEFAULT 0,
  p_interests_detected JSONB DEFAULT '[]'
)
RETURNS anonymous_page_visits AS $$
DECLARE
  v_session anonymous_learning_sessions;
  v_visit anonymous_page_visits;
BEGIN
  -- Get or create session
  SELECT * INTO v_session
  FROM get_or_create_anonymous_session(p_fingerprint_id);

  -- Insert visit
  INSERT INTO anonymous_page_visits (
    fingerprint_id,
    session_id,
    url,
    pathname,
    page_title,
    referrer,
    element_clicked,
    click_text,
    click_position,
    time_on_page_seconds,
    interests_detected
  ) VALUES (
    p_fingerprint_id,
    v_session.id,
    p_url,
    p_pathname,
    p_page_title,
    p_referrer,
    p_element_clicked,
    p_click_text,
    p_click_position,
    p_time_on_page_seconds,
    p_interests_detected
  )
  RETURNING * INTO v_visit;

  -- Update session total time
  UPDATE anonymous_learning_sessions
  SET
    total_time_seconds = total_time_seconds + p_time_on_page_seconds,
    last_active_at = NOW()
  WHERE id = v_session.id;

  RETURN v_visit;
END;
$$ LANGUAGE plpgsql;

-- Migrate anonymous session to user account
CREATE OR REPLACE FUNCTION migrate_anonymous_session_to_user(
  p_fingerprint_id VARCHAR(16),
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session anonymous_learning_sessions;
  v_lesson_count INTEGER;
BEGIN
  -- Get session
  SELECT * INTO v_session
  FROM anonymous_learning_sessions
  WHERE fingerprint_id = p_fingerprint_id
  AND migrated_to_user_id IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Migrate lesson completions to user_progress
  INSERT INTO user_progress (
    user_id,
    lesson_id,
    domain,
    completed,
    completed_at,
    time_spent_seconds,
    xp_earned
  )
  SELECT
    p_user_id,
    lesson_id,
    domain,
    true,
    completed_at,
    time_spent_seconds,
    xp_earned
  FROM anonymous_lesson_completions
  WHERE session_id = v_session.id
  ON CONFLICT (user_id, lesson_id) DO NOTHING;

  -- Update user XP
  UPDATE users
  SET xp = xp + v_session.xp
  WHERE id = p_user_id;

  -- Mark session as migrated
  UPDATE anonymous_learning_sessions
  SET
    migrated_to_user_id = p_user_id,
    migrated_at = NOW()
  WHERE id = v_session.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get anonymous session stats
CREATE OR REPLACE FUNCTION get_anonymous_session_stats(p_fingerprint_id VARCHAR(16))
RETURNS TABLE (
  session_id INTEGER,
  xp INTEGER,
  level INTEGER,
  lessons_completed INTEGER,
  total_time_seconds INTEGER,
  suggested_paths JSONB,
  top_interests JSONB,
  recent_lessons JSONB,
  achievements_earned INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.xp,
    s.level,
    s.lessons_completed,
    s.total_time_seconds,
    s.suggested_paths,
    s.cookie_interests,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'domain', domain,
          'lesson_slug', lesson_slug,
          'completed_at', completed_at,
          'xp_earned', xp_earned
        )
        ORDER BY completed_at DESC
      )
      FROM anonymous_lesson_completions
      WHERE session_id = s.id
      LIMIT 5
    ) as recent_lessons,
    (
      SELECT COUNT(*)::INTEGER
      FROM anonymous_achievements
      WHERE session_id = s.id
    ) as achievements_earned
  FROM anonymous_learning_sessions s
  WHERE s.fingerprint_id = p_fingerprint_id
  AND s.migrated_to_user_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old anonymous sessions (older than 90 days with no activity)
CREATE OR REPLACE FUNCTION cleanup_old_anonymous_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM anonymous_learning_sessions
  WHERE last_active_at < NOW() - INTERVAL '90 days'
  AND migrated_to_user_id IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE anonymous_learning_sessions IS 'Tracks free learning sessions without requiring account creation. Privacy-first: uses fingerprint IDs, no PII.';
COMMENT ON TABLE anonymous_lesson_completions IS 'Lesson completions for anonymous users. Can be migrated to user accounts.';
COMMENT ON TABLE anonymous_page_visits IS 'Tracks homepage clicks and page visits for anonymous users to understand interests.';
COMMENT ON TABLE anonymous_achievements IS 'Gamification achievements for anonymous users.';

COMMENT ON FUNCTION get_or_create_anonymous_session IS 'Gets existing session or creates new one. Updates last_active_at.';
COMMENT ON FUNCTION complete_anonymous_lesson IS 'Records lesson completion for anonymous user. Awards XP and updates stats.';
COMMENT ON FUNCTION track_anonymous_page_visit IS 'Tracks page visit with optional click data. Used for homepage click tracking.';
COMMENT ON FUNCTION migrate_anonymous_session_to_user IS 'Migrates all anonymous progress to user account when they sign up.';
COMMENT ON FUNCTION get_anonymous_session_stats IS 'Returns complete stats for anonymous session.';
COMMENT ON FUNCTION cleanup_old_anonymous_sessions IS 'Deletes anonymous sessions older than 90 days with no activity.';
