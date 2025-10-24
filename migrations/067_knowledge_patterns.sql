-- Migration 067: Knowledge Patterns Table
-- Stores debugging patterns learned from Cal's sessions

CREATE TABLE IF NOT EXISTS knowledge_patterns (
  id SERIAL PRIMARY KEY,

  -- Pattern identification
  pattern_type VARCHAR(100) NOT NULL DEFAULT 'debugging_pattern',
  pattern_name VARCHAR(500) NOT NULL,

  -- Problem and solution
  problem_description TEXT NOT NULL,
  solution_description TEXT NOT NULL,

  -- Additional details
  steps TEXT,                                   -- JSON string of steps
  keywords TEXT[],                              -- Keywords for search
  context JSONB,                                -- Additional context

  -- Classification
  severity VARCHAR(50),                         -- 'critical', 'high', 'medium', 'low'
  category VARCHAR(100),                        -- 'error_fix', 'optimization', 'feature', etc.

  -- Usage tracking
  occurrence_count INTEGER DEFAULT 1,           -- How many times seen

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique patterns
  UNIQUE(pattern_name, problem_description)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_kpatterns_name ON knowledge_patterns(pattern_name);
CREATE INDEX IF NOT EXISTS idx_kpatterns_type ON knowledge_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_kpatterns_category ON knowledge_patterns(category);
CREATE INDEX IF NOT EXISTS idx_kpatterns_severity ON knowledge_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_kpatterns_occurrence ON knowledge_patterns(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_kpatterns_created ON knowledge_patterns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpatterns_last_seen ON knowledge_patterns(last_seen_at DESC);

-- Full-text search on problem and solution
CREATE INDEX IF NOT EXISTS idx_kpatterns_search ON knowledge_patterns
  USING GIN(to_tsvector('english', problem_description || ' ' || solution_description));

-- GIN index for keywords array
CREATE INDEX IF NOT EXISTS idx_kpatterns_keywords ON knowledge_patterns USING GIN(keywords);

-- Success indicator
SELECT 'Migration 067: Knowledge Patterns Table - Completed' as status;
