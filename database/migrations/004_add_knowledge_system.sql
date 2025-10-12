-- Migration 004: Knowledge Management System
-- Voice-first note-taking with NotebookLM-style features

-- Notes/Knowledge Entries
-- Core storage for voice memos, uploaded docs, and user notes
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500),
  content TEXT NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',          -- 'voice', 'upload', 'manual', 'generated'
  source_file VARCHAR(500),                     -- Original filename if uploaded
  source_path TEXT,                             -- Local file path if stored
  mime_type VARCHAR(100),                       -- File MIME type

  -- Metadata
  tags TEXT[],
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',          -- 'active', 'archived', 'deleted'

  -- Voice-specific fields
  audio_path TEXT,                              -- Path to original voice recording
  transcription_confidence NUMERIC(3,2),        -- 0.00-1.00

  -- Semantic search
  embedding vector(1536),                       -- For similarity search

  -- User/session tracking
  user_id VARCHAR(100),
  session_id VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notes
CREATE INDEX idx_notes_source ON notes(source);
CREATE INDEX idx_notes_category ON notes(category);
CREATE INDEX idx_notes_status ON notes(status);
CREATE INDEX idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX idx_notes_created ON notes(created_at DESC);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_session ON notes(session_id);

-- Full-text search index
CREATE INDEX idx_notes_search ON notes USING GIN(to_tsvector('english', title || ' ' || content));

-- Vector similarity index for semantic search
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON notes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Document Chunks
-- For large documents, break into chunks for better embedding/retrieval
CREATE TABLE IF NOT EXISTS document_chunks (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,                 -- Order within document
  content TEXT NOT NULL,
  embedding vector(1536),
  token_count INTEGER,

  -- Metadata
  metadata JSONB,                               -- Page numbers, section titles, etc.

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(note_id, chunk_index)
);

CREATE INDEX idx_chunks_note ON document_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Knowledge Chat History
-- Conversations with the knowledge base (Q&A sessions)
CREATE TABLE IF NOT EXISTS knowledge_chats (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  user_query TEXT NOT NULL,
  ai_response TEXT NOT NULL,

  -- Context
  source_notes INTEGER[],                       -- Array of note IDs used
  context_chunks INTEGER[],                     -- Array of chunk IDs used

  -- Metadata
  model VARCHAR(100),                           -- AI model used
  latency_ms INTEGER,
  confidence_score NUMERIC(3,2),

  -- Voice
  voice_input BOOLEAN DEFAULT FALSE,
  voice_output BOOLEAN DEFAULT FALSE,
  audio_path TEXT,                              -- Path to TTS output

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kchats_session ON knowledge_chats(session_id);
CREATE INDEX idx_kchats_created ON knowledge_chats(created_at DESC);
CREATE INDEX idx_kchats_notes ON knowledge_chats USING GIN(source_notes);

-- Generated Documents
-- Track exports and generated content
CREATE TABLE IF NOT EXISTS generated_documents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  format VARCHAR(50) NOT NULL,                  -- 'pdf', 'markdown', 'html', 'docx', 'json'
  template VARCHAR(100),                        -- 'summary', 'report', 'outline', 'blog', 'custom'

  -- Source
  source_notes INTEGER[],                       -- Notes included in generation
  generation_prompt TEXT,                       -- Prompt used for AI generation

  -- Output
  content TEXT,                                 -- Generated content (for text formats)
  file_path TEXT,                               -- Path to generated file
  file_size INTEGER,                            -- File size in bytes

  -- Metadata
  status VARCHAR(50) DEFAULT 'completed',       -- 'pending', 'generating', 'completed', 'failed'
  error_message TEXT,

  -- User approval workflow
  approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,

  user_id VARCHAR(100),
  session_id VARCHAR(100),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_at TIMESTAMP
);

CREATE INDEX idx_gendocs_format ON generated_documents(format);
CREATE INDEX idx_gendocs_status ON generated_documents(status);
CREATE INDEX idx_gendocs_user ON generated_documents(user_id);
CREATE INDEX idx_gendocs_created ON generated_documents(created_at DESC);
CREATE INDEX idx_gendocs_notes ON generated_documents USING GIN(source_notes);

-- Note Relationships
-- Link related notes (references, follows-up, summarizes, etc.)
CREATE TABLE IF NOT EXISTS note_relationships (
  id SERIAL PRIMARY KEY,
  source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,       -- 'references', 'follows_up', 'summarizes', 'related'

  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(source_note_id, target_note_id, relationship_type)
);

CREATE INDEX idx_note_rels_source ON note_relationships(source_note_id);
CREATE INDEX idx_note_rels_target ON note_relationships(target_note_id);
CREATE INDEX idx_note_rels_type ON note_relationships(relationship_type);

-- Knowledge Approval Queue
-- Pending actions that need user approval
CREATE TABLE IF NOT EXISTS knowledge_approvals (
  id SERIAL PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL,             -- 'create_note', 'update_note', 'generate_doc', 'delete_note'

  -- Proposed action details
  proposed_data JSONB NOT NULL,                 -- What AI wants to do
  reasoning TEXT,                               -- Why AI suggests this

  -- Context
  related_notes INTEGER[],
  session_id VARCHAR(100),
  user_id VARCHAR(100),

  -- Status
  status VARCHAR(50) DEFAULT 'pending',         -- 'pending', 'approved', 'rejected', 'expired'
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX idx_approvals_status ON knowledge_approvals(status);
CREATE INDEX idx_approvals_user ON knowledge_approvals(user_id);
CREATE INDEX idx_approvals_session ON knowledge_approvals(session_id);
CREATE INDEX idx_approvals_created ON knowledge_approvals(created_at DESC);

-- Note Access Log (for analytics and "recently accessed")
CREATE TABLE IF NOT EXISTS note_access_log (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  access_type VARCHAR(50) NOT NULL,             -- 'view', 'edit', 'chat', 'export'

  user_id VARCHAR(100),
  session_id VARCHAR(100),

  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_note ON note_access_log(note_id, accessed_at DESC);
CREATE INDEX idx_access_user ON note_access_log(user_id, accessed_at DESC);

-- Update trigger for notes.updated_at
CREATE OR REPLACE FUNCTION update_notes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notes_timestamp
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION update_notes_timestamp();

-- Views for common queries

-- Recent notes view
CREATE OR REPLACE VIEW recent_notes AS
SELECT
  id,
  title,
  LEFT(content, 200) as preview,
  source,
  category,
  tags,
  created_at,
  updated_at,
  accessed_at
FROM notes
WHERE status = 'active'
ORDER BY updated_at DESC;

-- Note statistics view
CREATE OR REPLACE VIEW note_statistics AS
SELECT
  COUNT(*) as total_notes,
  COUNT(*) FILTER (WHERE source = 'voice') as voice_notes,
  COUNT(*) FILTER (WHERE source = 'upload') as uploaded_docs,
  COUNT(*) FILTER (WHERE source = 'manual') as manual_notes,
  COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days') as notes_this_week,
  COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days') as notes_this_month
FROM notes
WHERE status = 'active';

-- Chat session summary view
CREATE OR REPLACE VIEW chat_sessions AS
SELECT
  session_id,
  COUNT(*) as message_count,
  MIN(created_at) as started_at,
  MAX(created_at) as last_message_at,
  (SELECT COUNT(DISTINCT note_id) FROM unnest(array_agg(source_notes)) AS note_id) as unique_notes_referenced
FROM knowledge_chats
GROUP BY session_id
ORDER BY last_message_at DESC;

-- Success indicator
SELECT 'Migration 004: Knowledge Management System - Completed' as status;
