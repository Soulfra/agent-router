-- Migration 145: Voice Journal Multi-Language Translations
--
-- Auto-translate voice journals to 8 languages for 3.7B global reach:
-- - Spanish (es) - 500M speakers
-- - Chinese (zh) - 1.4B speakers
-- - Japanese (ja) - 125M speakers
-- - Portuguese (pt) - 260M speakers
-- - French (fr) - 300M speakers
-- - German (de) - 130M speakers
-- - Hindi (hi) - 600M speakers
-- - Arabic (ar) - 420M speakers

-- Extend voice_journal_translations table (may already exist from migration 143)
CREATE TABLE IF NOT EXISTS voice_journal_translations (
  translation_id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  translated_content JSONB NOT NULL, -- { story: {...}, blog: {...}, thread: {...}, podcast: {...} }

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(session_id, target_language)
);

CREATE INDEX idx_voice_journal_translations_session ON voice_journal_translations(session_id);
CREATE INDEX idx_voice_journal_translations_language ON voice_journal_translations(target_language);

-- User language preferences
CREATE TABLE IF NOT EXISTS user_language_preferences (
  user_id VARCHAR(255) PRIMARY KEY,
  preferred_language VARCHAR(10) NOT NULL,
  detected_languages JSONB DEFAULT '[]'::jsonb, -- ["es", "en"] - detected from browser/IP
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_language_preferences_language ON user_language_preferences(preferred_language);

-- Forum posts from voice journals
CREATE TABLE IF NOT EXISTS voice_forum_posts (
  voice_forum_post_id SERIAL PRIMARY KEY,
  thread_id VARCHAR(255) NOT NULL, -- References forum_threads.thread_id
  user_id VARCHAR(255) NOT NULL,
  voice_session_id VARCHAR(255), -- References voice_journal_sessions.session_id

  insight_title TEXT NOT NULL,
  insight_type VARCHAR(50), -- discussion | insight | question | showoff | debate
  quality_score INTEGER, -- 1-10
  engagement_potential INTEGER, -- 1-10
  novelty_score INTEGER, -- 1-10
  tags JSONB DEFAULT '[]'::jsonb,
  discussion_questions JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(thread_id)
);

CREATE INDEX idx_voice_forum_posts_user ON voice_forum_posts(user_id);
CREATE INDEX idx_voice_forum_posts_session ON voice_forum_posts(voice_session_id);
CREATE INDEX idx_voice_forum_posts_type ON voice_forum_posts(insight_type);

-- Comments
COMMENT ON TABLE voice_journal_translations IS 'Multi-language translations of voice journals (8 languages, 3.7B reach)';
COMMENT ON TABLE user_language_preferences IS 'User language preferences (auto-detected or manually set)';
COMMENT ON TABLE voice_forum_posts IS 'Forum posts auto-extracted from voice journal insights';

COMMENT ON COLUMN voice_journal_translations.translated_content IS 'Full narrative outputs in target language: story, blog, thread, podcast';
COMMENT ON COLUMN user_language_preferences.detected_languages IS 'Languages detected from browser, IP, timezone';
COMMENT ON COLUMN voice_forum_posts.insight_type IS 'discussion | insight | question | showoff | debate';
