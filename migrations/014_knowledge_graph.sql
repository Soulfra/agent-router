-- Migration: Knowledge Graph & Learning System
-- Build personal operating system with concept tracking, leveling, and AI-assisted learning

-- Knowledge Concepts: Core concept library
CREATE TABLE IF NOT EXISTS knowledge_concepts (
  concept_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  concept_name VARCHAR(255) NOT NULL,
  concept_slug VARCHAR(255) UNIQUE NOT NULL,

  -- Classification
  category VARCHAR(100) NOT NULL, -- 'database-design', 'querying', 'optimization', 'scaling'
  difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 10),
  source_curriculum VARCHAR(100) NOT NULL, -- 'CS50-SQL', 'custom', etc.

  -- Content
  description TEXT,
  prerequisites UUID[], -- Array of concept_ids that should be learned first

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Extended data (examples, resources, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for knowledge_concepts
CREATE INDEX IF NOT EXISTS idx_concepts_slug ON knowledge_concepts(concept_slug);
CREATE INDEX IF NOT EXISTS idx_concepts_category ON knowledge_concepts(category, difficulty_level);
CREATE INDEX IF NOT EXISTS idx_concepts_difficulty ON knowledge_concepts(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_concepts_source ON knowledge_concepts(source_curriculum);

COMMENT ON TABLE knowledge_concepts IS 'Core library of learning concepts (CS50, tutorials, etc.)';
COMMENT ON COLUMN knowledge_concepts.prerequisites IS 'Array of concept_ids that are prerequisites';
COMMENT ON COLUMN knowledge_concepts.difficulty_level IS '1-10 scale, CS50 weeks map to 1-6';

-- Concept Dependencies: Knowledge graph edges
CREATE TABLE IF NOT EXISTS concept_dependencies (
  dependency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Graph edge
  concept_id UUID NOT NULL REFERENCES knowledge_concepts(concept_id) ON DELETE CASCADE,
  requires_concept_id UUID NOT NULL REFERENCES knowledge_concepts(concept_id) ON DELETE CASCADE,

  -- Strength
  strength INTEGER NOT NULL DEFAULT 5 CHECK (strength BETWEEN 1 AND 10),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (concept_id, requires_concept_id),
  CHECK (concept_id != requires_concept_id) -- No self-dependencies
);

-- Indexes for concept_dependencies
CREATE INDEX IF NOT EXISTS idx_dependencies_concept ON concept_dependencies(concept_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_requires ON concept_dependencies(requires_concept_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_strength ON concept_dependencies(concept_id, strength DESC);

COMMENT ON TABLE concept_dependencies IS 'Explicit prerequisite relationships between concepts';
COMMENT ON COLUMN concept_dependencies.strength IS '1-10: How critical is the prerequisite?';

-- User Concept Mastery: Per-user progress tracking
CREATE TABLE IF NOT EXISTS user_concept_mastery (
  mastery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  concept_id UUID NOT NULL REFERENCES knowledge_concepts(concept_id) ON DELETE CASCADE,

  -- Progress
  mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 100),
  interactions INTEGER NOT NULL DEFAULT 0, -- How many times practiced

  -- Evidence
  evidence JSONB DEFAULT '{}', -- Quiz scores, project completions, etc.

  -- Timestamps
  first_learned_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (user_id, concept_id)
);

-- Indexes for user_concept_mastery
CREATE INDEX IF NOT EXISTS idx_mastery_user ON user_concept_mastery(user_id, mastery_level DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_concept ON user_concept_mastery(concept_id, mastery_level DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_recent ON user_concept_mastery(user_id, last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_mastery_progress ON user_concept_mastery(user_id, concept_id, mastery_level);

COMMENT ON TABLE user_concept_mastery IS 'Track each user''s progress on concepts (0-100%)';
COMMENT ON COLUMN user_concept_mastery.mastery_level IS '0-100: Percentage mastery of concept';
COMMENT ON COLUMN user_concept_mastery.interactions IS 'Number of learning sessions with this concept';

-- Learning Sessions: Track LLM-assisted learning
CREATE TABLE IF NOT EXISTS learning_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  concept_id UUID REFERENCES knowledge_concepts(concept_id) ON DELETE SET NULL,

  -- LLM Details
  model_used VARCHAR(255) NOT NULL, -- e.g., 'ollama:calos-model:latest'
  provider VARCHAR(100), -- 'ollama', 'openai', 'anthropic', etc.

  -- Content
  prompt TEXT NOT NULL, -- What the user asked
  response TEXT NOT NULL, -- What the LLM taught them

  -- Authentication (double contingency)
  api_key_id UUID, -- Which calos_platform_api_keys was used
  session_auth_method VARCHAR(50), -- 'session+apikey', 'session-only', etc.

  -- Performance
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  latency_ms INTEGER,

  -- Credits & Cost
  credits_consumed INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Session Metadata
  session_metadata JSONB DEFAULT '{}', -- Extended data (rating, feedback, etc.)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for learning_sessions
CREATE INDEX IF NOT EXISTS idx_learning_user ON learning_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_concept ON learning_sessions(concept_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_tenant ON learning_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_model ON learning_sessions(model_used, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_recent ON learning_sessions(created_at DESC);

COMMENT ON TABLE learning_sessions IS 'Every AI-assisted learning session (double contingency auth)';
COMMENT ON COLUMN learning_sessions.api_key_id IS 'Which platform API key was used (double contingency)';
COMMENT ON COLUMN learning_sessions.credits_consumed IS 'Credits deducted from user_credits';

-- Function: Update user mastery after learning session
CREATE OR REPLACE FUNCTION update_user_mastery()
RETURNS TRIGGER AS $$
DECLARE
  v_mastery_gain INTEGER;
BEGIN
  -- Only update mastery if session was successful and linked to a concept
  IF NEW.success = TRUE AND NEW.concept_id IS NOT NULL THEN
    -- Calculate mastery gain (5-15 points based on tokens generated)
    v_mastery_gain := LEAST(15, GREATEST(5, NEW.tokens_output / 100));

    -- Upsert user_concept_mastery
    INSERT INTO user_concept_mastery (
      user_id,
      concept_id,
      mastery_level,
      interactions,
      last_interaction_at
    )
    VALUES (
      NEW.user_id,
      NEW.concept_id,
      v_mastery_gain,
      1,
      NEW.created_at
    )
    ON CONFLICT (user_id, concept_id)
    DO UPDATE SET
      mastery_level = LEAST(100, user_concept_mastery.mastery_level + v_mastery_gain),
      interactions = user_concept_mastery.interactions + 1,
      last_interaction_at = NEW.created_at,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update mastery after learning sessions
DROP TRIGGER IF EXISTS trigger_update_user_mastery ON learning_sessions;
CREATE TRIGGER trigger_update_user_mastery
  AFTER INSERT ON learning_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_mastery();

COMMENT ON FUNCTION update_user_mastery IS 'Auto-updates user mastery when they complete a learning session';

-- View: User Learning Level
CREATE OR REPLACE VIEW user_learning_levels AS
SELECT
  u.user_id,
  u.username,
  u.email,
  COUNT(DISTINCT ucm.concept_id) AS concepts_learned,
  COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) AS concepts_mastered,
  COALESCE(AVG(ucm.mastery_level), 0)::INTEGER AS avg_mastery,
  COALESCE(SUM(ucm.interactions), 0) AS total_interactions,
  COUNT(DISTINCT ls.session_id) AS learning_sessions,
  MAX(ucm.last_interaction_at) AS last_learning_at,

  -- Calculate "level" based on mastered concepts (every 5 concepts = 1 level)
  (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5)::INTEGER AS user_level,

  -- Level title
  CASE
    WHEN (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5) >= 10 THEN 'Database Architect'
    WHEN (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5) >= 8 THEN 'Senior Developer'
    WHEN (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5) >= 6 THEN 'Full Stack Developer'
    WHEN (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5) >= 4 THEN 'Database Designer'
    WHEN (COUNT(DISTINCT ucm.concept_id) FILTER (WHERE ucm.mastery_level >= 80) / 5) >= 2 THEN 'Junior Developer'
    ELSE 'Beginner'
  END AS level_title

FROM users u
LEFT JOIN user_concept_mastery ucm ON ucm.user_id = u.user_id
LEFT JOIN learning_sessions ls ON ls.user_id = u.user_id
GROUP BY u.user_id, u.username, u.email;

COMMENT ON VIEW user_learning_levels IS 'Calculate user level based on concept mastery';

-- View: Recommended Next Concepts
CREATE OR REPLACE VIEW recommended_next_concepts AS
WITH user_mastered AS (
  SELECT user_id, concept_id
  FROM user_concept_mastery
  WHERE mastery_level >= 80
),
user_in_progress AS (
  SELECT user_id, concept_id
  FROM user_concept_mastery
  WHERE mastery_level > 0 AND mastery_level < 80
)
SELECT
  um.user_id,
  kc.concept_id,
  kc.concept_name,
  kc.concept_slug,
  kc.category,
  kc.difficulty_level,
  kc.description,

  -- Count how many prerequisites are already mastered
  COALESCE(
    (SELECT COUNT(*)
     FROM unnest(kc.prerequisites) AS prereq_id
     WHERE EXISTS (
       SELECT 1 FROM user_mastered
       WHERE user_id = um.user_id AND concept_id = prereq_id
     )),
    0
  ) AS prerequisites_met,

  COALESCE(array_length(kc.prerequisites, 1), 0) AS prerequisites_total,

  -- Readiness score (0-100)
  CASE
    WHEN COALESCE(array_length(kc.prerequisites, 1), 0) = 0 THEN 100
    ELSE (
      COALESCE(
        (SELECT COUNT(*)
         FROM unnest(kc.prerequisites) AS prereq_id
         WHERE EXISTS (
           SELECT 1 FROM user_mastered
           WHERE user_id = um.user_id AND concept_id = prereq_id
         )),
        0
      ) * 100.0 / array_length(kc.prerequisites, 1)
    )::INTEGER
  END AS readiness_score

FROM (SELECT DISTINCT user_id FROM user_concept_mastery) um
CROSS JOIN knowledge_concepts kc
WHERE NOT EXISTS (
  SELECT 1 FROM user_mastered
  WHERE user_id = um.user_id AND concept_id = kc.concept_id
)
AND NOT EXISTS (
  SELECT 1 FROM user_in_progress
  WHERE user_id = um.user_id AND concept_id = kc.concept_id
)
ORDER BY um.user_id, readiness_score DESC, kc.difficulty_level ASC;

COMMENT ON VIEW recommended_next_concepts IS 'AI-recommended next concepts based on prerequisites met';

-- View: Knowledge Graph Stats
CREATE OR REPLACE VIEW knowledge_graph_stats AS
SELECT
  'Total Concepts' AS metric,
  COUNT(*)::TEXT AS value
FROM knowledge_concepts
UNION ALL
SELECT
  'Total Dependencies' AS metric,
  COUNT(*)::TEXT AS value
FROM concept_dependencies
UNION ALL
SELECT
  'Active Learners' AS metric,
  COUNT(DISTINCT user_id)::TEXT AS value
FROM user_concept_mastery
WHERE last_interaction_at > NOW() - INTERVAL '30 days'
UNION ALL
SELECT
  'Learning Sessions (7d)' AS metric,
  COUNT(*)::TEXT AS value
FROM learning_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
UNION ALL
SELECT
  'Avg Mastery Level' AS metric,
  ROUND(AVG(mastery_level), 1)::TEXT || '%' AS value
FROM user_concept_mastery;

COMMENT ON VIEW knowledge_graph_stats IS 'High-level stats for knowledge graph dashboard';
