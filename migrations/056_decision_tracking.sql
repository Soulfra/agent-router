-- Migration: Decision Tracking System
-- Adds tables for decision versioning, archiving, and todo tracking
-- Solves: "versioning and deprecation of info... so decisions can be traced and tracked"

-- ============================================================================
-- Decisions Table
-- Core table for all decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Full decision content (markdown supported)
  category TEXT DEFAULT 'general', -- 'tech', 'product', 'process', 'architecture', 'general'
  created_by TEXT NOT NULL,

  -- Context and metadata
  context JSONB DEFAULT '{}'::JSONB, -- Additional context (tags, links, related items)

  -- Status lifecycle
  status TEXT DEFAULT 'draft', -- 'draft', 'active', 'deprecated', 'archived'

  -- Version tracking
  version INT DEFAULT 1,

  -- Deprecation tracking
  deprecated_reason TEXT,
  replaced_by INT REFERENCES decisions(id), -- Decision that replaces this
  deprecated_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_category ON decisions(category);
CREATE INDEX idx_decisions_created_by ON decisions(created_by);
CREATE INDEX idx_decisions_created_at ON decisions(created_at DESC);
CREATE INDEX idx_decisions_updated_at ON decisions(updated_at DESC);
CREATE INDEX idx_decisions_replaced_by ON decisions(replaced_by);

-- Full text search on title and content
CREATE INDEX idx_decisions_search ON decisions USING gin(to_tsvector('english', title || ' ' || content));

-- ============================================================================
-- Decision Versions Table
-- Complete version history for every decision change
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_versions (
  id SERIAL PRIMARY KEY,
  decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  version INT NOT NULL,

  -- Snapshot of decision at this version
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL,

  -- Who changed it and why
  changed_by TEXT NOT NULL,
  change_reason TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(decision_id, version)
);

CREATE INDEX idx_decision_versions_decision ON decision_versions(decision_id);
CREATE INDEX idx_decision_versions_version ON decision_versions(decision_id, version DESC);
CREATE INDEX idx_decision_versions_created ON decision_versions(created_at DESC);

-- ============================================================================
-- Decision References Table
-- Links between related decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_references (
  id SERIAL PRIMARY KEY,
  decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  referenced_decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  -- Type of reference
  reference_type TEXT DEFAULT 'related', -- 'related', 'supersedes', 'superseded_by', 'blocks', 'blocked_by'

  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(decision_id, referenced_decision_id)
);

CREATE INDEX idx_decision_refs_decision ON decision_references(decision_id);
CREATE INDEX idx_decision_refs_referenced ON decision_references(referenced_decision_id);
CREATE INDEX idx_decision_refs_type ON decision_references(reference_type);

-- ============================================================================
-- Decision Archives Table
-- Archive tracking with full context
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_archives (
  id SERIAL PRIMARY KEY,
  decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  -- Archive details
  archived_by TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  archive_category TEXT DEFAULT 'historical', -- 'obsolete', 'completed', 'superseded', 'historical'
  archive_metadata JSONB DEFAULT '{}'::JSONB,

  -- Impact at time of archive
  impact_at_archive JSONB DEFAULT '{}'::JSONB, -- Snapshot of impact (todos, dependencies, etc.)

  archived_at TIMESTAMP DEFAULT NOW(),

  -- Restoration tracking
  restored_by TEXT,
  restore_reason TEXT,
  restored_at TIMESTAMP
);

CREATE INDEX idx_decision_archives_decision ON decision_archives(decision_id);
CREATE INDEX idx_decision_archives_category ON decision_archives(archive_category);
CREATE INDEX idx_decision_archives_archived ON decision_archives(archived_at DESC);
CREATE INDEX idx_decision_archives_restored ON decision_archives(restored_at);

-- ============================================================================
-- Decision Todos Table
-- Todos linked to decisions for complete traceability
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_todos (
  id SERIAL PRIMARY KEY,
  decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  -- Todo details
  title TEXT NOT NULL,
  description TEXT DEFAULT '',

  -- Assignment and tracking
  assigned_to TEXT,
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  due_date TIMESTAMP,

  -- Context and metadata
  context JSONB DEFAULT '{}'::JSONB,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'blocked', 'completed', 'archived'

  -- Completion tracking
  completed_by TEXT,
  completed_at TIMESTAMP,
  completion_notes JSONB,

  -- Archive tracking
  archived_at TIMESTAMP,

  -- Audit
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_decision_todos_decision ON decision_todos(decision_id);
CREATE INDEX idx_decision_todos_status ON decision_todos(status);
CREATE INDEX idx_decision_todos_assigned ON decision_todos(assigned_to);
CREATE INDEX idx_decision_todos_priority ON decision_todos(priority);
CREATE INDEX idx_decision_todos_due ON decision_todos(due_date);
CREATE INDEX idx_decision_todos_tags ON decision_todos USING gin(tags);
CREATE INDEX idx_decision_todos_created ON decision_todos(created_at DESC);

-- ============================================================================
-- Todo Dependencies Table
-- Track todo dependencies (what blocks what)
-- ============================================================================

CREATE TABLE IF NOT EXISTS todo_dependencies (
  id SERIAL PRIMARY KEY,
  todo_id INT NOT NULL REFERENCES decision_todos(id) ON DELETE CASCADE,
  depends_on_todo_id INT NOT NULL REFERENCES decision_todos(id) ON DELETE CASCADE,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(todo_id, depends_on_todo_id),
  CHECK (todo_id != depends_on_todo_id) -- Can't depend on itself
);

CREATE INDEX idx_todo_deps_todo ON todo_dependencies(todo_id);
CREATE INDEX idx_todo_deps_depends ON todo_dependencies(depends_on_todo_id);

-- ============================================================================
-- Todo Archives Table
-- Archive completed todos with full context
-- ============================================================================

CREATE TABLE IF NOT EXISTS todo_archives (
  id SERIAL PRIMARY KEY,
  todo_id INT NOT NULL REFERENCES decision_todos(id) ON DELETE CASCADE,
  decision_id INT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  -- Full context snapshot
  full_context JSONB NOT NULL, -- Complete todo + decision context at archive time

  -- Archive tracking
  archived_by TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_todo_archives_todo ON todo_archives(todo_id);
CREATE INDEX idx_todo_archives_decision ON todo_archives(decision_id);
CREATE INDEX idx_todo_archives_archived ON todo_archives(archived_at DESC);

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- View: Active Decisions Summary
CREATE OR REPLACE VIEW v_active_decisions AS
SELECT
  d.id,
  d.title,
  d.category,
  d.status,
  d.created_by,
  d.created_at,
  d.updated_at,
  COUNT(DISTINCT t.id) as todo_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') as pending_todo_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_todo_count,
  COUNT(DISTINCT dr.id) as reference_count
FROM decisions d
LEFT JOIN decision_todos t ON d.id = t.decision_id
LEFT JOIN decision_references dr ON d.id = dr.decision_id
WHERE d.status IN ('draft', 'active')
GROUP BY d.id
ORDER BY d.updated_at DESC;

-- View: Decision Impact Analysis
CREATE OR REPLACE VIEW v_decision_impact AS
SELECT
  d.id,
  d.title,
  d.category,
  d.status,
  COUNT(DISTINCT t.id) as total_todos,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') as pending_todos,
  COUNT(DISTINCT dr_out.id) as outgoing_refs,
  COUNT(DISTINCT dr_in.id) as incoming_refs,
  -- Impact score: pending todos + (incoming refs * 2)
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') +
    (COUNT(DISTINCT dr_in.id) * 2) as impact_score
FROM decisions d
LEFT JOIN decision_todos t ON d.id = t.decision_id
LEFT JOIN decision_references dr_out ON d.id = dr_out.decision_id
LEFT JOIN decision_references dr_in ON d.id = dr_in.referenced_decision_id
GROUP BY d.id
ORDER BY impact_score DESC;

-- View: Decision Timeline
CREATE OR REPLACE VIEW v_decision_timeline AS
SELECT
  d.id,
  d.title,
  d.category,
  d.status,
  d.created_by,
  d.created_at,
  d.updated_at,
  d.deprecated_at,
  CASE
    WHEN d.deprecated_at IS NOT NULL THEN 'deprecated'
    WHEN d.status = 'archived' THEN 'archived'
    WHEN d.status = 'active' THEN 'active'
    WHEN d.status = 'draft' THEN 'draft'
  END as timeline_status,
  COALESCE(
    json_agg(
      json_build_object(
        'id', ref_d.id,
        'title', ref_d.title,
        'type', dr.reference_type
      ) ORDER BY dr.created_at
    ) FILTER (WHERE ref_d.id IS NOT NULL),
    '[]'
  ) as references
FROM decisions d
LEFT JOIN decision_references dr ON d.id = dr.decision_id
LEFT JOIN decisions ref_d ON dr.referenced_decision_id = ref_d.id
GROUP BY d.id
ORDER BY d.created_at DESC;

-- View: Todo Summary by Decision
CREATE OR REPLACE VIEW v_todo_summary AS
SELECT
  d.id as decision_id,
  d.title as decision_title,
  d.category,
  COUNT(t.id) as total_todos,
  COUNT(t.id) FILTER (WHERE t.status = 'pending') as pending,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress') as in_progress,
  COUNT(t.id) FILTER (WHERE t.status = 'blocked') as blocked,
  COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed,
  COUNT(t.id) FILTER (WHERE t.priority = 'critical') as critical_count,
  COUNT(t.id) FILTER (WHERE t.priority = 'high') as high_count,
  COUNT(t.id) FILTER (WHERE t.due_date < NOW() AND t.status = 'pending') as overdue_count
FROM decisions d
LEFT JOIN decision_todos t ON d.id = t.decision_id
GROUP BY d.id
ORDER BY overdue_count DESC, critical_count DESC;

-- View: Archived Decisions
CREATE OR REPLACE VIEW v_archived_decisions AS
SELECT
  d.id,
  d.title,
  d.category,
  d.created_by,
  d.created_at,
  a.archived_by,
  a.archive_reason,
  a.archive_category,
  a.archived_at,
  a.restored_by,
  a.restored_at,
  CASE WHEN a.restored_at IS NULL THEN true ELSE false END as currently_archived
FROM decisions d
JOIN decision_archives a ON d.id = a.decision_id
ORDER BY a.archived_at DESC;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update decisions.updated_at on change
CREATE OR REPLACE FUNCTION update_decision_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_decision_timestamp
BEFORE UPDATE ON decisions
FOR EACH ROW
EXECUTE FUNCTION update_decision_timestamp();

-- Update decision_todos.updated_at on change
CREATE OR REPLACE FUNCTION update_todo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_todo_timestamp
BEFORE UPDATE ON decision_todos
FOR EACH ROW
EXECUTE FUNCTION update_todo_timestamp();

-- ============================================================================
-- Sample Data
-- ============================================================================

-- Insert sample decision
INSERT INTO decisions (title, content, category, created_by, status)
VALUES (
  'Implement Decision Tracking System',
  '# Decision: Implement Decision Tracking System

## Context
We need a way to track decisions, understand why they were made, and trace their evolution over time.

## Decision
Implement a comprehensive decision tracking system with:
- Version control for decisions
- Deprecation tracking
- Todo management linked to decisions
- Archive system with full context

## Rationale
- Answers "why did we do this?"
- Enables decision tracing
- Prevents loss of context
- Supports decision evolution

## Consequences
- All major decisions must be documented
- Team can understand decision history
- Technical debt can be traced to decisions
- Onboarding becomes easier',
  'architecture',
  'system',
  'active'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE decisions IS 'Core decisions with version tracking and lifecycle management';
COMMENT ON TABLE decision_versions IS 'Complete version history for every decision change';
COMMENT ON TABLE decision_references IS 'Links between related decisions (supersedes, blocks, etc.)';
COMMENT ON TABLE decision_archives IS 'Archive tracking with restoration capability';
COMMENT ON TABLE decision_todos IS 'Todos linked to decisions for complete traceability';
COMMENT ON TABLE todo_dependencies IS 'Todo dependencies (what blocks what)';
COMMENT ON TABLE todo_archives IS 'Archived todos with full context snapshot';

COMMENT ON VIEW v_active_decisions IS 'Active decisions with todo and reference counts';
COMMENT ON VIEW v_decision_impact IS 'Decision impact analysis with impact scores';
COMMENT ON VIEW v_decision_timeline IS 'Timeline view of all decisions with references';
COMMENT ON VIEW v_todo_summary IS 'Todo summary by decision with status counts';
COMMENT ON VIEW v_archived_decisions IS 'Archived decisions with archive details';
