-- Migration 068: Knowledge System Integration
-- Links knowledge patterns to lessons, concepts, and notes
-- Enables Cal to learn from lesson debugging sessions and tag notes with patterns

-- ============================================================================
-- Part 1: Extend knowledge_patterns table
-- ============================================================================

-- Add optional foreign keys to link patterns to educational content
ALTER TABLE knowledge_patterns
  ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES knowledge_concepts(concept_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_note_id UUID REFERENCES user_notes(note_id) ON DELETE SET NULL;

-- Indexes for new foreign keys
CREATE INDEX IF NOT EXISTS idx_kpatterns_lesson ON knowledge_patterns(lesson_id);
CREATE INDEX IF NOT EXISTS idx_kpatterns_concept ON knowledge_patterns(concept_id);
CREATE INDEX IF NOT EXISTS idx_kpatterns_note ON knowledge_patterns(user_note_id);

-- ============================================================================
-- Part 2: Lesson Debug Sessions
-- ============================================================================

-- Track which errors students encounter during lessons
CREATE TABLE IF NOT EXISTS lesson_debug_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what
  user_id UUID,                                       -- Student encountering the error
  lesson_id UUID REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  pattern_id INTEGER REFERENCES knowledge_patterns(id) ON DELETE SET NULL,

  -- Error details
  error_type VARCHAR(100),                            -- 'syntax_error', 'fetch_error', 'import_error', etc.
  error_message TEXT,                                 -- Original error message
  stack_trace TEXT,                                   -- JS stack trace (if available)

  -- Context
  student_code TEXT,                                  -- Code that triggered the error
  browser_info JSONB,                                 -- Browser, OS, viewport
  lesson_step INTEGER,                                -- Which step of the lesson

  -- Resolution
  resolved BOOLEAN DEFAULT false,                     -- Did student solve it?
  resolution_time INTEGER,                            -- Seconds to fix (NULL if unsolved)
  resolution_method VARCHAR(100),                     -- 'hint', 'pattern', 'trial-and-error', 'gave-up'

  -- Metadata
  session_started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_debug_user ON lesson_debug_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_lesson ON lesson_debug_sessions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_debug_pattern ON lesson_debug_sessions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_debug_error_type ON lesson_debug_sessions(error_type);
CREATE INDEX IF NOT EXISTS idx_debug_resolved ON lesson_debug_sessions(resolved);
CREATE INDEX IF NOT EXISTS idx_debug_started ON lesson_debug_sessions(session_started_at DESC);

-- ============================================================================
-- Part 3: Note-Pattern Mappings
-- ============================================================================

-- Junction table: Many-to-many between user_notes and knowledge_patterns
CREATE TABLE IF NOT EXISTS note_pattern_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  note_id UUID NOT NULL REFERENCES user_notes(note_id) ON DELETE CASCADE,
  pattern_id INTEGER NOT NULL REFERENCES knowledge_patterns(id) ON DELETE CASCADE,

  -- Mapping metadata
  relevance_score FLOAT DEFAULT 1.0,                  -- How relevant is this pattern to the note (0-1)
  auto_tagged BOOLEAN DEFAULT false,                  -- Was this auto-detected by AI?
  tagged_by_user_id UUID,                             -- User who manually tagged it (NULL if auto)

  -- Timestamps
  tagged_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate mappings
  UNIQUE(note_id, pattern_id)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_note_mappings_note ON note_pattern_mappings(note_id);
CREATE INDEX IF NOT EXISTS idx_note_mappings_pattern ON note_pattern_mappings(pattern_id);
CREATE INDEX IF NOT EXISTS idx_note_mappings_auto ON note_pattern_mappings(auto_tagged);
CREATE INDEX IF NOT EXISTS idx_note_mappings_score ON note_pattern_mappings(relevance_score DESC);

-- ============================================================================
-- Part 4: Frontend Error Collection
-- ============================================================================

-- Capture browser console errors from students
CREATE TABLE IF NOT EXISTS frontend_errors (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and where
  user_id UUID,                                       -- Student (if logged in)
  session_id VARCHAR(255),                            -- Browser session ID
  page_url TEXT NOT NULL,                             -- Which page errored

  -- Error details
  error_type VARCHAR(100) NOT NULL,                   -- 'js_error', 'network_error', 'resource_error'
  error_message TEXT NOT NULL,                        -- Error message
  stack_trace TEXT,                                   -- Stack trace (if available)
  source_file TEXT,                                   -- Which file errored
  line_number INTEGER,                                -- Line number
  column_number INTEGER,                              -- Column number

  -- Browser context
  browser_info JSONB,                                 -- Browser, OS, viewport, user agent
  console_logs JSONB,                                 -- Recent console.log entries

  -- Pattern matching
  matched_pattern_id INTEGER REFERENCES knowledge_patterns(id) ON DELETE SET NULL,
  pattern_match_confidence FLOAT,                     -- 0-1 score

  -- Metadata
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX IF NOT EXISTS idx_frontend_errors_user ON frontend_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_type ON frontend_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_page ON frontend_errors(page_url);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_pattern ON frontend_errors(matched_pattern_id);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_occurred ON frontend_errors(occurred_at DESC);

-- Full-text search on error messages
CREATE INDEX IF NOT EXISTS idx_frontend_errors_search ON frontend_errors
  USING GIN(to_tsvector('english', error_message || ' ' || COALESCE(stack_trace, '')));

-- ============================================================================
-- Part 5: Utility Views
-- ============================================================================

-- View: Common errors by lesson
CREATE OR REPLACE VIEW lesson_common_errors AS
SELECT
  l.lesson_id,
  l.lesson_title,
  kp.pattern_name,
  kp.problem_description,
  kp.solution_description,
  COUNT(lds.session_id) as error_count,
  AVG(CASE WHEN lds.resolved THEN 1 ELSE 0 END) as resolution_rate,
  AVG(lds.resolution_time) as avg_resolution_time_seconds
FROM lessons l
JOIN lesson_debug_sessions lds ON l.lesson_id = lds.lesson_id
JOIN knowledge_patterns kp ON lds.pattern_id = kp.id
GROUP BY l.lesson_id, l.lesson_title, kp.pattern_name, kp.problem_description, kp.solution_description
ORDER BY error_count DESC;

-- View: Notes with pattern tags
CREATE OR REPLACE VIEW notes_with_patterns AS
SELECT
  un.note_id,
  un.user_id,
  un.note_text,
  un.tags,
  json_agg(
    json_build_object(
      'pattern_name', kp.pattern_name,
      'problem', kp.problem_description,
      'solution', kp.solution_description,
      'relevance', npm.relevance_score,
      'auto_tagged', npm.auto_tagged
    )
  ) FILTER (WHERE kp.id IS NOT NULL) as patterns
FROM user_notes un
LEFT JOIN note_pattern_mappings npm ON un.note_id = npm.note_id
LEFT JOIN knowledge_patterns kp ON npm.pattern_id = kp.id
GROUP BY un.note_id, un.user_id, un.note_text, un.tags;

-- View: Frontend error patterns
CREATE OR REPLACE VIEW frontend_error_patterns AS
SELECT
  fe.error_type,
  fe.error_message,
  fe.page_url,
  kp.pattern_name,
  kp.solution_description,
  COUNT(*) as occurrence_count,
  AVG(fe.pattern_match_confidence) as avg_confidence
FROM frontend_errors fe
LEFT JOIN knowledge_patterns kp ON fe.matched_pattern_id = kp.id
GROUP BY fe.error_type, fe.error_message, fe.page_url, kp.pattern_name, kp.solution_description
ORDER BY occurrence_count DESC;

-- ============================================================================
-- Success indicator
-- ============================================================================

SELECT 'Migration 068: Knowledge System Integration - Completed' as status;
