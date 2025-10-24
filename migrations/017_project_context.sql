-- Migration: Project Context System
-- Voice-driven project tracking with multi-brand tagging
-- Enables phone → voice → transcription → project tagging → export pipeline

-- ============================================================================
-- PROJECT CONTEXTS: Master list of all projects/brands
-- ============================================================================

CREATE TYPE project_type AS ENUM (
  'brand',           -- Marketing/brand projects (soulfra, deathtodata)
  'product',         -- Product development
  'repo',            -- Code repositories (finishthisrepo)
  'idea',            -- Idea incubation (finishthisidea)
  'campaign',        -- Marketing campaigns
  'dealflow'         -- Deal tracking (dealordelete)
);

CREATE TABLE IF NOT EXISTS project_contexts (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Project identity
  project_slug VARCHAR(100) UNIQUE NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  project_type project_type NOT NULL,

  -- Brand association
  brand_name VARCHAR(100), -- 'soulfra', 'deathtodata', 'calos', 'roughsparks'

  -- Ownership
  owner_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL,

  -- Project metadata
  description TEXT,
  keywords TEXT[], -- For intent detection from voice

  -- Visual/formatting preferences
  brand_color VARCHAR(7), -- Hex color (#3b82f6 for soulfra)
  font_family VARCHAR(100), -- 'Inter', 'Space Grotesk', etc.
  formatting_rules JSONB DEFAULT '{}', -- Export formatting preferences

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'archived', 'completed'

  -- Links
  github_repo_url TEXT,
  domain_url TEXT,

  -- Stats
  voice_sessions_count INTEGER DEFAULT 0,
  total_transcriptions INTEGER DEFAULT 0,
  total_exports INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_project_slug ON project_contexts(project_slug);
CREATE INDEX idx_project_owner ON project_contexts(owner_user_id, status);
CREATE INDEX idx_project_tenant ON project_contexts(tenant_id, status);
CREATE INDEX idx_project_type ON project_contexts(project_type, status);
CREATE INDEX idx_project_brand ON project_contexts(brand_name, status);
CREATE INDEX idx_project_activity ON project_contexts(last_activity_at DESC);

COMMENT ON TABLE project_contexts IS 'Master list of all projects/brands for voice tagging';
COMMENT ON COLUMN project_contexts.keywords IS 'Keywords for voice intent detection (e.g., ["auth", "sso", "login"] for soulfra)';
COMMENT ON COLUMN project_contexts.formatting_rules IS 'Brand-specific export formatting (colors, fonts, layout)';

-- Seed initial projects (using roughsparks' tenant_id if available, or a placeholder)
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- Try to get roughsparks' tenant_id, or use a default placeholder
  SELECT tenant_id INTO default_tenant_id FROM users WHERE username = 'roughsparks' LIMIT 1;

  IF default_tenant_id IS NULL THEN
    -- If no user exists yet, create a placeholder tenant for system projects
    INSERT INTO tenants (tenant_name, subdomain, status)
    VALUES ('System', 'system', 'active')
    ON CONFLICT (subdomain) DO NOTHING
    RETURNING tenant_id INTO default_tenant_id;

    -- If even that fails, just pick any existing tenant
    IF default_tenant_id IS NULL THEN
      SELECT tenant_id INTO default_tenant_id FROM tenants LIMIT 1;
    END IF;
  END IF;

  -- Now insert projects with the tenant_id
  INSERT INTO project_contexts (project_slug, project_name, project_type, brand_name, brand_color, keywords, description, tenant_id)
  VALUES
    ('soulfra', 'Soulfra Identity Platform', 'brand', 'soulfra', '#3b82f6',
     ARRAY['auth', 'sso', 'identity', 'login', 'authentication', 'oauth'],
     'Universal SSO and authentication platform', default_tenant_id),

    ('deathtodata', 'Death to Data', 'brand', 'deathtodata', '#ef4444',
     ARRAY['search', 'seo', 'philosophy', 'data', 'search engine'],
     'Search engine philosophy and programmatic SEO', default_tenant_id),

    ('dealordelete', 'Deal or Delete', 'dealflow', 'dealordelete', '#10b981',
     ARRAY['deal', 'negotiation', 'marketplace', 'trade', 'offer'],
     'Deal negotiation and marketplace platform', default_tenant_id),

    ('finishthisidea', 'Finish This Idea', 'idea', 'finishthisidea', '#f59e0b',
     ARRAY['idea', 'brainstorm', 'concept', 'startup', 'business'],
     'Idea incubation and validation system', default_tenant_id),

    ('finishthisrepo', 'Finish This Repo', 'repo', 'finishthisrepo', '#8b5cf6',
     ARRAY['repo', 'code', 'github', 'project', 'development'],
     'Code repository completion tracking', default_tenant_id),

    ('calos', 'CalOS Platform', 'product', 'calos', '#06b6d4',
     ARRAY['calos', 'agent', 'ai', 'platform', 'os'],
     'Operating system for AI agents', default_tenant_id),

    ('roughsparks', 'Rough Sparks', 'brand', 'roughsparks', '#ec4899',
     ARRAY['creative', 'spark', 'inspiration', 'idea', 'innovation'],
     'Creative sparks and idea generation', default_tenant_id)
  ON CONFLICT (project_slug) DO NOTHING;
END $$;

-- ============================================================================
-- VOICE TRANSCRIPTIONS: Link voice recordings to projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_transcriptions (
  transcription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User/Session
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(session_id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL,

  -- Project context
  project_id UUID REFERENCES project_contexts(project_id) ON DELETE SET NULL,
  detected_project_slug VARCHAR(100), -- Auto-detected from keywords
  detection_confidence DECIMAL(5,2), -- 0.00-1.00

  -- Voice data
  audio_format VARCHAR(20), -- 'webm', 'mp3', 'wav'
  audio_size_bytes INTEGER,
  audio_duration_seconds DECIMAL(10,2),
  storage_path TEXT, -- S3/local path to audio file

  -- Transcription
  raw_transcript TEXT NOT NULL,
  cleaned_transcript TEXT, -- Processed/cleaned version
  detected_language VARCHAR(10) DEFAULT 'en',

  -- Intent parsing
  detected_intent VARCHAR(100), -- 'create_feature', 'bug_fix', 'brainstorm', etc.
  intent_confidence DECIMAL(5,2),
  extracted_entities JSONB DEFAULT '{}', -- Entities like feature names, tech stack

  -- Source
  source_device VARCHAR(100), -- 'iPhone 15 Pro', 'Android', 'Web'
  source_ip INET,
  geolocation JSONB,

  -- Processing
  transcription_model VARCHAR(100) DEFAULT 'whisper-base.en',
  transcription_latency_ms INTEGER,
  processing_status VARCHAR(50) DEFAULT 'completed', -- 'processing', 'completed', 'failed'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_voice_user ON voice_transcriptions(user_id, created_at DESC);
CREATE INDEX idx_voice_session ON voice_transcriptions(session_id, created_at DESC);
CREATE INDEX idx_voice_project ON voice_transcriptions(project_id, created_at DESC);
CREATE INDEX idx_voice_tenant ON voice_transcriptions(tenant_id, created_at DESC);
CREATE INDEX idx_voice_status ON voice_transcriptions(processing_status);
CREATE INDEX idx_voice_intent ON voice_transcriptions(detected_intent);

COMMENT ON TABLE voice_transcriptions IS 'Voice recordings transcribed and linked to projects';
COMMENT ON COLUMN voice_transcriptions.detected_project_slug IS 'Auto-detected from keywords in transcript';
COMMENT ON COLUMN voice_transcriptions.extracted_entities IS 'Named entities like feature names, tech stack, competitors';

-- ============================================================================
-- PROJECT SESSION LOGS: Temporary pipeline runs scraped to permanent storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_session_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session linkage
  transcription_id UUID REFERENCES voice_transcriptions(transcription_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES project_contexts(project_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Pipeline execution
  pipeline_job_id VARCHAR(255), -- From PipelineOrchestrator
  pipeline_stage VARCHAR(100), -- 'transcription', 'intent', 'build', 'test', 'deploy'
  command_executed TEXT,
  working_directory TEXT,

  -- Log data
  stdout_raw TEXT, -- Raw stdout from pipeline
  stderr_raw TEXT, -- Raw stderr
  stdout_ansi TEXT, -- ANSI-colored version (preserved)
  stderr_ansi TEXT,
  exit_code INTEGER,

  -- Parsing/analysis
  log_level VARCHAR(20), -- 'info', 'warning', 'error', 'success'
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,

  -- Syntax highlighting metadata
  syntax_language VARCHAR(50), -- 'bash', 'javascript', 'python'
  highlighted_html TEXT, -- HTML with syntax highlighting for export
  color_scheme VARCHAR(50) DEFAULT 'github-dark',

  -- Performance
  duration_ms INTEGER,
  memory_peak_mb DECIMAL(10,2),
  cpu_usage_percent DECIMAL(5,2),

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_logs_transcription ON project_session_logs(transcription_id);
CREATE INDEX idx_logs_project ON project_session_logs(project_id, created_at DESC);
CREATE INDEX idx_logs_user ON project_session_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_pipeline ON project_session_logs(pipeline_job_id);
CREATE INDEX idx_logs_level ON project_session_logs(log_level, created_at DESC);
CREATE INDEX idx_logs_errors ON project_session_logs(error_count DESC) WHERE error_count > 0;

COMMENT ON TABLE project_session_logs IS 'Pipeline execution logs scraped from /tmp into permanent storage';
COMMENT ON COLUMN project_session_logs.stdout_ansi IS 'Preserves ANSI color codes for colored terminal output';
COMMENT ON COLUMN project_session_logs.highlighted_html IS 'Pre-rendered HTML for PDF exports';

-- ============================================================================
-- EXPORT ARTIFACTS: PDF, Markdown, SharePoint outputs
-- ============================================================================

CREATE TYPE export_format AS ENUM ('pdf', 'markdown', 'json', 'html', 'docx');
CREATE TYPE export_destination AS ENUM ('local', 'sharepoint', 's3', 'github', 'email');

CREATE TABLE IF NOT EXISTS export_artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source data
  transcription_id UUID REFERENCES voice_transcriptions(transcription_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES project_contexts(project_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Export config
  format export_format NOT NULL,
  destination export_destination NOT NULL,

  -- File info
  filename VARCHAR(255) NOT NULL,
  file_size_bytes INTEGER,
  storage_path TEXT, -- Local/S3/SharePoint path
  public_url TEXT, -- Public access URL if available

  -- Content metadata
  title VARCHAR(500),
  includes_voice_transcript BOOLEAN DEFAULT TRUE,
  includes_session_logs BOOLEAN DEFAULT TRUE,
  includes_code_diffs BOOLEAN DEFAULT FALSE,
  includes_ai_responses BOOLEAN DEFAULT TRUE,

  -- Formatting applied
  brand_color VARCHAR(7), -- From project_contexts
  font_family VARCHAR(100),
  color_scheme VARCHAR(50), -- 'light', 'dark', 'brand'
  syntax_highlighting BOOLEAN DEFAULT TRUE,

  -- SharePoint metadata
  sharepoint_metadata JSONB DEFAULT '{}', -- Tags, categories, etc.
  sharepoint_site_url TEXT,
  sharepoint_document_id VARCHAR(255),

  -- Status
  export_status VARCHAR(50) DEFAULT 'completed', -- 'processing', 'completed', 'failed'
  error_message TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ -- Optional expiration for temp exports
);

-- Indexes
CREATE INDEX idx_export_transcription ON export_artifacts(transcription_id);
CREATE INDEX idx_export_project ON export_artifacts(project_id, requested_at DESC);
CREATE INDEX idx_export_user ON export_artifacts(user_id, requested_at DESC);
CREATE INDEX idx_export_format ON export_artifacts(format);
CREATE INDEX idx_export_destination ON export_artifacts(destination);
CREATE INDEX idx_export_status ON export_artifacts(export_status);
CREATE INDEX idx_export_expires ON export_artifacts(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE export_artifacts IS 'Generated exports (PDF, Markdown, etc.) from voice sessions';
COMMENT ON COLUMN export_artifacts.sharepoint_metadata IS 'Tags and categories for SharePoint filtering';
COMMENT ON COLUMN export_artifacts.expires_at IS 'Auto-cleanup date for temporary exports';

-- ============================================================================
-- VIEWS: Useful aggregations
-- ============================================================================

-- View: Project activity summary
CREATE OR REPLACE VIEW project_activity_summary AS
SELECT
  pc.project_id,
  pc.project_slug,
  pc.project_name,
  pc.brand_name,
  pc.brand_color,
  COUNT(DISTINCT vt.transcription_id) AS total_voice_sessions,
  COUNT(DISTINCT psl.log_id) AS total_pipeline_runs,
  COUNT(DISTINCT ea.artifact_id) AS total_exports,
  MAX(vt.created_at) AS last_voice_session_at,
  MAX(psl.created_at) AS last_pipeline_run_at,
  MAX(ea.requested_at) AS last_export_at,
  pc.status AS project_status
FROM project_contexts pc
LEFT JOIN voice_transcriptions vt ON pc.project_id = vt.project_id
LEFT JOIN project_session_logs psl ON pc.project_id = psl.project_id
LEFT JOIN export_artifacts ea ON pc.project_id = ea.project_id
GROUP BY pc.project_id, pc.project_slug, pc.project_name, pc.brand_name, pc.brand_color, pc.status;

COMMENT ON VIEW project_activity_summary IS 'Project dashboard showing activity across voice/pipelines/exports';

-- View: Recent voice yaps by user
CREATE OR REPLACE VIEW recent_voice_yaps AS
SELECT
  vt.transcription_id,
  vt.user_id,
  u.username,
  vt.project_id,
  pc.project_name,
  pc.brand_name,
  pc.brand_color,
  vt.raw_transcript,
  vt.detected_intent,
  vt.intent_confidence,
  vt.source_device,
  vt.created_at,
  COUNT(psl.log_id) AS pipeline_runs,
  COUNT(ea.artifact_id) AS exports_generated
FROM voice_transcriptions vt
JOIN users u ON vt.user_id = u.user_id
LEFT JOIN project_contexts pc ON vt.project_id = pc.project_id
LEFT JOIN project_session_logs psl ON vt.transcription_id = psl.transcription_id
LEFT JOIN export_artifacts ea ON vt.transcription_id = ea.transcription_id
GROUP BY vt.transcription_id, vt.user_id, u.username, vt.project_id,
         pc.project_name, pc.brand_name, pc.brand_color, vt.raw_transcript,
         vt.detected_intent, vt.intent_confidence, vt.source_device, vt.created_at
ORDER BY vt.created_at DESC;

COMMENT ON VIEW recent_voice_yaps IS 'All voice sessions with project context and activity';

-- ============================================================================
-- TRIGGERS: Auto-update stats
-- ============================================================================

-- Trigger: Update project stats on new voice transcription
CREATE OR REPLACE FUNCTION update_project_voice_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE project_contexts
  SET
    voice_sessions_count = voice_sessions_count + 1,
    total_transcriptions = total_transcriptions + 1,
    last_activity_at = NOW(),
    updated_at = NOW()
  WHERE project_id = NEW.project_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_voice_stats ON voice_transcriptions;
CREATE TRIGGER trigger_update_project_voice_stats
  AFTER INSERT ON voice_transcriptions
  FOR EACH ROW
  WHEN (NEW.project_id IS NOT NULL)
  EXECUTE FUNCTION update_project_voice_stats();

-- Trigger: Update project stats on new export
CREATE OR REPLACE FUNCTION update_project_export_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE project_contexts
  SET
    total_exports = total_exports + 1,
    last_activity_at = NOW(),
    updated_at = NOW()
  WHERE project_id = NEW.project_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_export_stats ON export_artifacts;
CREATE TRIGGER trigger_update_project_export_stats
  AFTER INSERT ON export_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_project_export_stats();

COMMENT ON FUNCTION update_project_voice_stats IS 'Auto-increment voice session counters';
COMMENT ON FUNCTION update_project_export_stats IS 'Auto-increment export counters';

-- ============================================================================
-- RLS: Row-Level Security for project isolation
-- ============================================================================

-- Enable RLS on project tables
ALTER TABLE project_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_artifacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own tenant's projects
CREATE POLICY project_tenant_isolation ON project_contexts
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY voice_tenant_isolation ON voice_transcriptions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY logs_tenant_isolation ON project_session_logs
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY export_tenant_isolation ON export_artifacts
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

COMMENT ON POLICY project_tenant_isolation ON project_contexts IS 'Tenant-isolated project access';
COMMENT ON POLICY voice_tenant_isolation ON voice_transcriptions IS 'Tenant-isolated voice transcriptions';
