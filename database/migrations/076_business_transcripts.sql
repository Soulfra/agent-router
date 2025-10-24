-- Migration 076: Business Transcripts & Analysis System
-- NotebookLM-style document processor for turning transcripts into business projects
--
-- Purpose:
-- - Upload audio files (transcribe via OpenAI Whisper)
-- - Upload text transcripts
-- - AI analysis: Extract business opportunities, revenue models, action items
-- - Generate actionable business projects
-- - Track quota (free: 5/month, pro: unlimited)
--
-- Privacy:
-- - Users own all content
-- - Can export/delete anytime
-- - Audio files deleted after transcription
--
-- Revenue:
-- - Free: 5 transcripts/month
-- - Pro: Unlimited + QuickBooks sync ($29/month)
-- - Enterprise: API access + custom models ($99/month)

-- ============================================================================
-- BUSINESS TRANSCRIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_transcripts (
  transcript_id VARCHAR(100) PRIMARY KEY,

  -- Ownership
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  transcript_text TEXT NOT NULL,

  -- Metadata
  language VARCHAR(10) DEFAULT 'en',
  duration_seconds INTEGER,           -- For audio transcripts
  word_count INTEGER,
  source_type VARCHAR(20) NOT NULL,   -- 'audio', 'text', 'url'
  source_metadata JSONB DEFAULT '{}', -- { filename, segments, etc }

  -- Status
  status VARCHAR(50) DEFAULT 'pending_analysis', -- 'pending_analysis', 'analyzing', 'analyzed', 'analysis_failed'
  error_message TEXT,
  analyzed_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_user_id
  ON business_transcripts(user_id);

CREATE INDEX IF NOT EXISTS idx_transcripts_status
  ON business_transcripts(status);

CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
  ON business_transcripts(created_at DESC);

COMMENT ON TABLE business_transcripts IS 'User-uploaded transcripts (audio or text) for business analysis';
COMMENT ON COLUMN business_transcripts.source_type IS 'Type of transcript: audio, text, url';
COMMENT ON COLUMN business_transcripts.status IS 'Analysis status: pending_analysis, analyzing, analyzed, analysis_failed';

-- ============================================================================
-- TRANSCRIPT ANALYSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS transcript_analyses (
  analysis_id VARCHAR(100) PRIMARY KEY,

  -- Transcript
  transcript_id VARCHAR(100) NOT NULL REFERENCES business_transcripts(transcript_id) ON DELETE CASCADE,

  -- AI Analysis Results
  opportunities JSONB DEFAULT '[]',           -- Business opportunities identified
  revenue_models JSONB DEFAULT '[]',          -- Monetization strategies
  target_market JSONB DEFAULT '{}',           -- Demographics, industries, pain points
  action_items JSONB DEFAULT '[]',            -- Concrete next steps
  resources_required JSONB DEFAULT '{}',      -- Tech stack, team, budget
  competitive_landscape JSONB DEFAULT '[]',   -- Similar products/services
  unique_value_proposition TEXT,              -- What makes this different

  -- Quality Metrics
  confidence_score INTEGER DEFAULT 0,         -- 0-100 score of analysis quality

  -- AI Metadata
  analysis_metadata JSONB DEFAULT '{}',       -- { model, tokens_used, etc }

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analyses_transcript_id
  ON transcript_analyses(transcript_id);

CREATE INDEX IF NOT EXISTS idx_analyses_confidence_score
  ON transcript_analyses(confidence_score DESC);

COMMENT ON TABLE transcript_analyses IS 'AI-powered business analysis of transcripts';
COMMENT ON COLUMN transcript_analyses.opportunities IS 'Array of business opportunities identified by AI';
COMMENT ON COLUMN transcript_analyses.confidence_score IS 'Quality score (0-100) based on analysis completeness';

-- ============================================================================
-- BUSINESS PROJECTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_projects (
  project_id VARCHAR(100) PRIMARY KEY,

  -- Ownership
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Source
  transcript_id VARCHAR(100) NOT NULL REFERENCES business_transcripts(transcript_id) ON DELETE CASCADE,
  analysis_id VARCHAR(100) NOT NULL REFERENCES transcript_analyses(analysis_id) ON DELETE CASCADE,

  -- Project Details
  project_name TEXT NOT NULL,
  project_description TEXT,

  -- Business Model
  revenue_model JSONB DEFAULT '[]',           -- From analysis
  target_market JSONB DEFAULT '{}',           -- From analysis

  -- Status
  status VARCHAR(50) DEFAULT 'draft',         -- 'draft', 'active', 'paused', 'completed', 'cancelled'

  -- Analysis Data (denormalized for quick access)
  opportunities JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  resources_required JSONB DEFAULT '{}',

  -- Integration Status
  stripe_product_id VARCHAR(255),             -- Stripe product created
  stripe_price_id VARCHAR(255),               -- Stripe price created
  quickbooks_account_id VARCHAR(255),         -- QuickBooks account created

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  launched_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON business_projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_transcript_id
  ON business_projects(transcript_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON business_projects(status);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
  ON business_projects(created_at DESC);

COMMENT ON TABLE business_projects IS 'Business projects generated from transcript analysis';
COMMENT ON COLUMN business_projects.status IS 'Project status: draft, active, paused, completed, cancelled';
COMMENT ON COLUMN business_projects.stripe_product_id IS 'Stripe product ID if created';
COMMENT ON COLUMN business_projects.quickbooks_account_id IS 'QuickBooks account ID if synced';

-- ============================================================================
-- PROJECT ACTION ITEMS (Track progress)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_action_items (
  item_id SERIAL PRIMARY KEY,

  -- Project
  project_id VARCHAR(100) NOT NULL REFERENCES business_projects(project_id) ON DELETE CASCADE,

  -- Action Item
  title TEXT NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium',      -- 'low', 'medium', 'high', 'critical'
  category VARCHAR(50),                       -- 'product', 'marketing', 'sales', 'operations'

  -- Status
  status VARCHAR(50) DEFAULT 'todo',          -- 'todo', 'in_progress', 'completed', 'blocked'
  completed_at TIMESTAMP,
  blocked_reason TEXT,

  -- Assignment
  assigned_to UUID REFERENCES users(user_id),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_action_items_project_id
  ON project_action_items(project_id);

CREATE INDEX IF NOT EXISTS idx_action_items_status
  ON project_action_items(status);

CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to
  ON project_action_items(assigned_to);

COMMENT ON TABLE project_action_items IS 'Action items extracted from business analysis';
COMMENT ON COLUMN project_action_items.priority IS 'Priority: low, medium, high, critical';
COMMENT ON COLUMN project_action_items.status IS 'Status: todo, in_progress, completed, blocked';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Update transcript updated_at timestamp
 */
CREATE OR REPLACE FUNCTION update_transcript_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_transcript_timestamp ON business_transcripts;
CREATE TRIGGER trigger_update_transcript_timestamp
  BEFORE UPDATE ON business_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_transcript_timestamp();

DROP TRIGGER IF EXISTS trigger_update_project_timestamp ON business_projects;
CREATE TRIGGER trigger_update_project_timestamp
  BEFORE UPDATE ON business_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_transcript_timestamp();

/**
 * Get user's monthly transcript count (for quota checking)
 */
CREATE OR REPLACE FUNCTION get_user_transcript_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM business_transcripts
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', NOW());

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_transcript_count IS 'Get number of transcripts created this month (for quota)';

/**
 * Get project completion percentage
 */
CREATE OR REPLACE FUNCTION get_project_completion(p_project_id VARCHAR(100))
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_percentage INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM project_action_items
  WHERE project_id = p_project_id;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_completed
  FROM project_action_items
  WHERE project_id = p_project_id
    AND status = 'completed';

  v_percentage := (v_completed::FLOAT / v_total::FLOAT * 100)::INTEGER;

  RETURN v_percentage;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_completion IS 'Calculate project completion percentage based on action items';

-- ============================================================================
-- SEED DATA / DEFAULTS
-- ============================================================================

-- None needed - this is a user-driven system


