-- Domain Code Library
-- Domain-specific code patterns and examples
--
-- Key insight: NOT user repos (that's code_snippets), but AI-generated examples
-- "This is how we do authentication in business domain" vs "code domain"
-- Each domain has its own library of patterns, styles, and best practices
--
-- Think: "Domain-specific design patterns" or "Domain style guide"

-- ============================================================================
-- Domain Code Examples
-- Pattern library per domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_code_examples (
  example_id TEXT PRIMARY KEY,

  -- Which domain
  domain_context TEXT NOT NULL, -- 'code', 'creative', 'reasoning', 'fact', 'simple'
  domain_url TEXT,              -- Optional link to domain from portfolio

  -- Pattern classification
  pattern_name TEXT NOT NULL,   -- 'api_authentication', 'data_validation', 'error_handling'
  pattern_category TEXT,        -- 'security', 'data', 'ui', 'api', 'utility'
  pattern_type TEXT NOT NULL,   -- 'function', 'class', 'component', 'module', 'snippet'

  -- Language/framework
  language TEXT NOT NULL,       -- 'javascript', 'python', 'lua', 'typescript'
  framework TEXT,               -- 'express', 'react', 'flask', null

  -- The code
  code TEXT NOT NULL,
  code_hash TEXT,               -- SHA-256 for deduplication

  -- Documentation
  title TEXT NOT NULL,          -- Human-readable title
  description TEXT NOT NULL,    -- What this pattern does
  usage_notes TEXT,             -- How/when to use this pattern
  example_usage TEXT,           -- Code showing how to use this

  -- Context
  use_cases TEXT[],             -- ['rest_api', 'auth', 'validation']
  tags TEXT[],                  -- ['async', 'error-handling', 'middleware']
  related_patterns TEXT[],      -- Array of other pattern_names

  -- Original generation context
  original_prompt TEXT,         -- The prompt that generated this
  generated_by_model TEXT,      -- Which model created this
  generated_from_artifact_id TEXT REFERENCES bucket_artifacts(artifact_id), -- Link to artifact

  -- Quality metrics
  complexity_score TEXT,        -- 'simple', 'moderate', 'complex'
  maintainability_score REAL,  -- 0.0-1.0
  user_rating REAL,             -- Average user rating
  times_used INTEGER DEFAULT 0,
  success_rate REAL,            -- % of times this worked without modification

  -- Domain-specific metadata
  domain_style JSONB,           -- Domain preferences: {indent: 2, quotes: 'single', etc}
  domain_conventions JSONB,     -- Naming conventions, file structure, etc.

  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  superseded_by TEXT REFERENCES domain_code_examples(example_id),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived', 'testing')),
  visibility TEXT DEFAULT 'domain' CHECK (visibility IN ('private', 'domain', 'public')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domain_examples_domain ON domain_code_examples(domain_context);
CREATE INDEX idx_domain_examples_pattern ON domain_code_examples(pattern_name);
CREATE INDEX idx_domain_examples_category ON domain_code_examples(pattern_category);
CREATE INDEX idx_domain_examples_language ON domain_code_examples(language);
CREATE INDEX idx_domain_examples_hash ON domain_code_examples(code_hash);
CREATE INDEX idx_domain_examples_tags ON domain_code_examples USING GIN(tags);
CREATE INDEX idx_domain_examples_use_cases ON domain_code_examples USING GIN(use_cases);
CREATE INDEX idx_domain_examples_status ON domain_code_examples(status, is_current);

-- ============================================================================
-- Domain Style Guides
-- Define coding style/conventions per domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_style_guides (
  id SERIAL PRIMARY KEY,

  -- Which domain
  domain_context TEXT NOT NULL UNIQUE,

  -- Style preferences
  indent_style TEXT DEFAULT 'spaces',      -- 'spaces', 'tabs'
  indent_size INTEGER DEFAULT 2,
  quote_style TEXT DEFAULT 'single',       -- 'single', 'double'
  line_length INTEGER DEFAULT 100,
  trailing_commas BOOLEAN DEFAULT true,

  -- Naming conventions
  variable_case TEXT DEFAULT 'camelCase',  -- 'camelCase', 'snake_case', 'PascalCase'
  function_case TEXT DEFAULT 'camelCase',
  class_case TEXT DEFAULT 'PascalCase',
  constant_case TEXT DEFAULT 'UPPER_SNAKE',

  -- Code organization
  file_structure JSONB,                    -- Preferred directory structure
  import_order TEXT[],                     -- Order of imports: ['system', 'external', 'internal']

  -- Language-specific preferences
  language_preferences JSONB,              -- {javascript: {semicolons: true}, python: {max_line: 88}}

  -- Documentation requirements
  requires_docstrings BOOLEAN DEFAULT true,
  docstring_style TEXT,                    -- 'jsdoc', 'numpy', 'google'

  -- Best practices
  best_practices TEXT[],                   -- Array of guidelines
  anti_patterns TEXT[],                    -- Things to avoid

  -- Metadata
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domain_styles_domain ON domain_style_guides(domain_context);

-- ============================================================================
-- Domain Pattern Usage
-- Track which patterns are used and how successful they are
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_pattern_usage (
  id SERIAL PRIMARY KEY,

  -- Which pattern
  example_id TEXT NOT NULL REFERENCES domain_code_examples(example_id) ON DELETE CASCADE,

  -- Usage context
  used_in_request_id TEXT,
  used_in_artifact_id TEXT REFERENCES bucket_artifacts(artifact_id),
  used_by TEXT,                    -- User or bucket

  -- Outcome
  success BOOLEAN DEFAULT true,
  modified BOOLEAN DEFAULT false,  -- Was the pattern modified before use?
  modifications TEXT,              -- What changes were made?

  -- Feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  feedback_text TEXT,

  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pattern_usage_example ON domain_pattern_usage(example_id);
CREATE INDEX idx_pattern_usage_timestamp ON domain_pattern_usage(timestamp DESC);
CREATE INDEX idx_pattern_usage_success ON domain_pattern_usage(success);

-- ============================================================================
-- Domain Anti-Patterns
-- Track things that DON'T work well in each domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_anti_patterns (
  id SERIAL PRIMARY KEY,

  -- Which domain
  domain_context TEXT NOT NULL,

  -- Anti-pattern identification
  anti_pattern_name TEXT NOT NULL,
  anti_pattern_category TEXT,      -- 'security', 'performance', 'maintainability'

  -- The bad code
  bad_code_example TEXT NOT NULL,
  why_bad TEXT NOT NULL,           -- Why this is an anti-pattern

  -- The good alternative
  good_code_example TEXT,
  why_good TEXT,

  -- Severity
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),

  -- Detection
  auto_detect_pattern TEXT,        -- Regex or pattern to detect this
  times_detected INTEGER DEFAULT 0,

  -- Related patterns
  related_good_pattern_id TEXT REFERENCES domain_code_examples(example_id),

  -- Metadata
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anti_patterns_domain ON domain_anti_patterns(domain_context);
CREATE INDEX idx_anti_patterns_severity ON domain_anti_patterns(severity);
CREATE INDEX idx_anti_patterns_category ON domain_anti_patterns(anti_pattern_category);

-- ============================================================================
-- Domain Knowledge Graph
-- Relationships between patterns, concepts, and domains
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_knowledge_graph (
  id SERIAL PRIMARY KEY,

  -- Source node
  source_type TEXT NOT NULL,       -- 'pattern', 'concept', 'domain', 'anti_pattern'
  source_id TEXT NOT NULL,         -- ID of source entity

  -- Target node
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- Relationship
  relationship_type TEXT NOT NULL, -- 'depends_on', 'related_to', 'alternative_to', 'extends', 'uses'
  relationship_strength REAL DEFAULT 0.5 CHECK (relationship_strength >= 0 AND relationship_strength <= 1),

  -- Context
  context TEXT,                    -- Why this relationship exists

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_graph_source ON domain_knowledge_graph(source_type, source_id);
CREATE INDEX idx_knowledge_graph_target ON domain_knowledge_graph(target_type, target_id);
CREATE INDEX idx_knowledge_graph_type ON domain_knowledge_graph(relationship_type);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Top patterns per domain
CREATE OR REPLACE VIEW top_domain_patterns AS
SELECT
  dce.domain_context,
  dce.pattern_category,
  dce.pattern_name,
  dce.title,
  dce.language,
  dce.times_used,
  dce.success_rate,
  dce.user_rating,
  COUNT(DISTINCT dpu.id) as usage_count
FROM domain_code_examples dce
LEFT JOIN domain_pattern_usage dpu ON dce.example_id = dpu.example_id
WHERE dce.status = 'active' AND dce.is_current = true
GROUP BY dce.domain_context, dce.pattern_category, dce.pattern_name, dce.title, dce.language, dce.times_used, dce.success_rate, dce.user_rating
ORDER BY dce.domain_context, usage_count DESC, dce.times_used DESC
LIMIT 100;

-- Domain coverage (how many patterns per domain)
CREATE OR REPLACE VIEW domain_pattern_coverage AS
SELECT
  domain_context,
  COUNT(*) as total_patterns,
  COUNT(DISTINCT pattern_category) as categories,
  COUNT(DISTINCT language) as languages,
  AVG(success_rate) as avg_success_rate,
  SUM(times_used) as total_uses
FROM domain_code_examples
WHERE status = 'active' AND is_current = true
GROUP BY domain_context
ORDER BY total_patterns DESC;

-- Pattern relationships (which patterns work well together)
CREATE OR REPLACE VIEW pattern_relationships AS
SELECT
  dkg.source_id as pattern_1,
  dkg.target_id as pattern_2,
  dkg.relationship_type,
  dkg.relationship_strength,
  dce1.title as pattern_1_title,
  dce2.title as pattern_2_title
FROM domain_knowledge_graph dkg
JOIN domain_code_examples dce1 ON dkg.source_id = dce1.example_id
JOIN domain_code_examples dce2 ON dkg.target_id = dce2.example_id
WHERE dkg.source_type = 'pattern' AND dkg.target_type = 'pattern'
ORDER BY dkg.relationship_strength DESC;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_domain_examples_updated_at
  BEFORE UPDATE ON domain_code_examples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_styles_updated_at
  BEFORE UPDATE ON domain_style_guides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_anti_patterns_updated_at
  BEFORE UPDATE ON domain_anti_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Increment times_used on pattern usage
CREATE OR REPLACE FUNCTION increment_pattern_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.success THEN
    UPDATE domain_code_examples
    SET
      times_used = times_used + 1,
      success_rate = (
        SELECT AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)
        FROM domain_pattern_usage
        WHERE example_id = NEW.example_id
      )
    WHERE example_id = NEW.example_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_pattern_usage
  AFTER INSERT ON domain_pattern_usage
  FOR EACH ROW EXECUTE FUNCTION increment_pattern_usage();

-- ============================================================================
-- Helper Functions
-- ============================================================================

/**
 * Get recommended patterns for a domain + use case
 */
CREATE OR REPLACE FUNCTION get_domain_patterns(
  p_domain TEXT,
  p_language TEXT,
  p_use_case TEXT DEFAULT NULL
) RETURNS TABLE(
  example_id TEXT,
  pattern_name TEXT,
  title TEXT,
  description TEXT,
  code TEXT,
  success_rate REAL,
  times_used INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dce.example_id,
    dce.pattern_name,
    dce.title,
    dce.description,
    dce.code,
    dce.success_rate,
    dce.times_used
  FROM domain_code_examples dce
  WHERE dce.domain_context = p_domain
    AND dce.language = p_language
    AND dce.status = 'active'
    AND dce.is_current = true
    AND (p_use_case IS NULL OR p_use_case = ANY(dce.use_cases))
  ORDER BY dce.success_rate DESC NULLS LAST, dce.times_used DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE domain_code_examples IS 'Domain-specific code patterns and examples (not user repos, but AI-generated design patterns per domain)';
COMMENT ON TABLE domain_style_guides IS 'Coding style and conventions per domain (indent, quotes, naming, etc.)';
COMMENT ON TABLE domain_anti_patterns IS 'Things that DON''T work well in each domain';
COMMENT ON TABLE domain_knowledge_graph IS 'Relationships between patterns, concepts, and domains';
COMMENT ON COLUMN domain_code_examples.domain_context IS 'Which domain this pattern belongs to (code, creative, reasoning, fact, simple)';
COMMENT ON COLUMN domain_code_examples.pattern_name IS 'Unique identifier for this pattern (e.g., api_authentication, data_validation)';
