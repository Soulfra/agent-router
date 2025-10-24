-- Documentation Tracking System
--
-- This migration creates tables to track automated documentation:
-- - Screenshots, videos, GIFs, PowerPoints of OAuth setup processes
-- - DOM structure hashes to detect when provider UIs change
-- - Annotations (arrows, boxes, text overlays) for each step
-- - Change detection history
--
-- Usage:
--   psql -d calos -f migrations/061_documentation_tracking.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Main documentation snapshots table
CREATE TABLE IF NOT EXISTS documentation_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider information
  provider VARCHAR(50) NOT NULL,              -- 'google', 'microsoft', 'github', 'icloud'
  provider_type VARCHAR(50) DEFAULT 'oauth',  -- 'oauth', 'api', 'general'
  page_url TEXT NOT NULL,                     -- URL that was documented
  page_title TEXT,                             -- Title of the page

  -- Content hashes for change detection
  dom_structure_hash TEXT NOT NULL,            -- SHA256 of key DOM selectors
  full_dom_hash TEXT,                          -- SHA256 of entire DOM (optional)
  screenshot_hash TEXT,                        -- Hash of base screenshot

  -- File paths
  screenshot_dir TEXT,                         -- Directory: 'oauth-screenshots/github-2025-10-20/'
  base_screenshot_path TEXT,                   -- Base screenshot without annotations
  annotated_screenshot_paths JSONB,            -- Array of annotated screenshot paths
  video_path TEXT,                             -- MP4 video path
  gif_path TEXT,                               -- Animated GIF path
  pptx_path TEXT,                              -- PowerPoint path
  pdf_path TEXT,                               -- PDF path

  -- Metadata
  step_count INTEGER DEFAULT 0,                -- Number of steps in tutorial
  metadata JSONB,                              -- { duration, file_sizes, dimensions, etc }
  selectors_used JSONB,                        -- Array of CSS selectors used

  -- Status tracking
  status VARCHAR(20) DEFAULT 'current',        -- 'current', 'outdated', 'broken', 'archived'
  verification_status VARCHAR(20) DEFAULT 'unverified', -- 'verified', 'unverified', 'failed'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  next_verification_at TIMESTAMPTZ,

  -- Indexing
  CONSTRAINT unique_provider_url UNIQUE(provider, page_url, status)
);

-- Annotations for each documentation step
CREATE TABLE IF NOT EXISTS documentation_annotations (
  annotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id) ON DELETE CASCADE,

  -- Step information
  step_number INTEGER NOT NULL,                -- 1, 2, 3, etc.
  step_title TEXT,                             -- "Click New OAuth App"
  step_description TEXT,                       -- Detailed instruction

  -- Selector and targeting
  selector TEXT NOT NULL,                      -- CSS selector to highlight
  selector_type VARCHAR(20),                   -- 'button', 'input', 'link', 'text'
  selector_exists BOOLEAN DEFAULT TRUE,        -- Does selector still exist?

  -- Annotation visual properties
  annotation_type VARCHAR(20) NOT NULL,        -- 'arrow', 'box', 'text', 'click', 'circle'
  position JSONB NOT NULL,                     -- { x, y, width, height }
  color VARCHAR(20) DEFAULT '#00ff00',         -- Highlight color

  -- Text content
  text_content TEXT,                           -- "Click here" or "Enter app name"
  text_position VARCHAR(20) DEFAULT 'top',     -- 'top', 'bottom', 'left', 'right'
  text_style JSONB,                            -- { fontSize, fontWeight, etc }

  -- Animation properties
  animation_type VARCHAR(20),                  -- 'pulse', 'fade', 'bounce', 'none'
  animation_duration INTEGER DEFAULT 1500,     -- Milliseconds

  -- Timing (for video/gif)
  start_time FLOAT,                            -- Seconds from video start
  duration FLOAT,                              -- How long to show (seconds)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_snapshot_step UNIQUE(snapshot_id, step_number)
);

-- Change detection history
CREATE TABLE IF NOT EXISTS documentation_changes (
  change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What changed
  provider VARCHAR(50) NOT NULL,
  page_url TEXT,
  change_type VARCHAR(50) NOT NULL,            -- 'selector_missing', 'layout_change', 'text_change', 'url_change'
  severity VARCHAR(20) DEFAULT 'medium',       -- 'low', 'medium', 'high', 'critical'

  -- Change details
  selector TEXT,                                -- Which selector was affected
  old_value TEXT,                               -- Previous state
  new_value TEXT,                               -- Current state
  diff_details JSONB,                           -- Detailed diff information

  -- Response
  auto_regenerated BOOLEAN DEFAULT FALSE,       -- Did we auto-regenerate docs?
  regeneration_status VARCHAR(20),             -- 'pending', 'success', 'failed', 'skipped'
  regeneration_error TEXT,

  -- Related snapshot
  affected_snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id),
  new_snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id),

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  -- Notifications
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ
);

-- Verification schedule and results
CREATE TABLE IF NOT EXISTS documentation_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id) ON DELETE CASCADE,

  -- Verification details
  verification_type VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'manual', 'triggered'
  verification_method VARCHAR(20),                   -- 'dom_hash', 'selector_check', 'screenshot_diff'

  -- Results
  status VARCHAR(20) NOT NULL,                 -- 'passed', 'failed', 'warning'
  selectors_checked INTEGER DEFAULT 0,
  selectors_found INTEGER DEFAULT 0,
  selectors_missing JSONB,                     -- Array of missing selectors

  -- Performance
  execution_time_ms INTEGER,

  -- Details
  result_details JSONB,
  error_message TEXT,

  -- Timestamps
  verified_at TIMESTAMPTZ DEFAULT NOW(),

  -- Actions taken
  action_taken VARCHAR(50),                    -- 'none', 'flagged_outdated', 'auto_regenerated'
  action_result TEXT
);

-- User notes (tied to video timestamps)
CREATE TABLE IF NOT EXISTS user_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- NULL for anonymous notes
  snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id) ON DELETE CASCADE,

  -- Note content
  timestamp FLOAT,  -- Video timestamp in seconds (e.g., 5.5 = 5.5 seconds)
  note_text TEXT NOT NULL,
  tags TEXT[],  -- Array of tags

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentation export jobs
CREATE TABLE IF NOT EXISTS documentation_exports (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES documentation_snapshots(snapshot_id) ON DELETE CASCADE,

  -- Export configuration
  export_format VARCHAR(20) NOT NULL,          -- 'gif', 'video', 'pptx', 'pdf', 'html'
  output_path TEXT NOT NULL,

  -- Options
  export_options JSONB,                        -- Format-specific options

  -- Status
  status VARCHAR(20) DEFAULT 'pending',        -- 'pending', 'processing', 'completed', 'failed'
  progress INTEGER DEFAULT 0,                  -- 0-100

  -- Results
  file_size_bytes BIGINT,
  duration_ms INTEGER,
  error_message TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_snapshots_provider ON documentation_snapshots(provider);
CREATE INDEX idx_snapshots_status ON documentation_snapshots(status);
CREATE INDEX idx_snapshots_created ON documentation_snapshots(created_at DESC);
CREATE INDEX idx_snapshots_verification ON documentation_snapshots(next_verification_at) WHERE status = 'current';

CREATE INDEX idx_annotations_snapshot ON documentation_annotations(snapshot_id);
CREATE INDEX idx_annotations_step ON documentation_annotations(step_number);
CREATE INDEX idx_annotations_selector ON documentation_annotations(selector);

CREATE INDEX idx_changes_provider ON documentation_changes(provider);
CREATE INDEX idx_changes_detected ON documentation_changes(detected_at DESC);
CREATE INDEX idx_changes_unresolved ON documentation_changes(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX idx_verifications_snapshot ON documentation_verifications(snapshot_id);
CREATE INDEX idx_verifications_status ON documentation_verifications(status);
CREATE INDEX idx_verifications_date ON documentation_verifications(verified_at DESC);

CREATE INDEX idx_exports_snapshot ON documentation_exports(snapshot_id);
CREATE INDEX idx_exports_status ON documentation_exports(status);
CREATE INDEX idx_exports_format ON documentation_exports(export_format);

CREATE INDEX idx_notes_snapshot ON user_notes(snapshot_id);
CREATE INDEX idx_notes_timestamp ON user_notes(timestamp);
CREATE INDEX idx_notes_created ON user_notes(created_at DESC);

-- Helper functions

-- Function to mark snapshot as outdated and create change record
CREATE OR REPLACE FUNCTION mark_snapshot_outdated(
  p_snapshot_id UUID,
  p_change_type VARCHAR(50),
  p_details TEXT
) RETURNS UUID AS $$
DECLARE
  v_change_id UUID;
  v_provider VARCHAR(50);
BEGIN
  -- Get provider
  SELECT provider INTO v_provider
  FROM documentation_snapshots
  WHERE snapshot_id = p_snapshot_id;

  -- Update snapshot status
  UPDATE documentation_snapshots
  SET
    status = 'outdated',
    updated_at = NOW()
  WHERE snapshot_id = p_snapshot_id;

  -- Create change record
  INSERT INTO documentation_changes (
    provider,
    change_type,
    affected_snapshot_id,
    old_value,
    new_value
  ) VALUES (
    v_provider,
    p_change_type,
    p_snapshot_id,
    'current',
    'outdated'
  ) RETURNING change_id INTO v_change_id;

  RETURN v_change_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get current documentation for a provider
CREATE OR REPLACE FUNCTION get_current_documentation(p_provider VARCHAR(50))
RETURNS TABLE (
  snapshot_id UUID,
  page_url TEXT,
  screenshot_dir TEXT,
  step_count INTEGER,
  created_at TIMESTAMPTZ,
  annotations JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.snapshot_id,
    ds.page_url,
    ds.screenshot_dir,
    ds.step_count,
    ds.created_at,
    jsonb_agg(
      jsonb_build_object(
        'step', da.step_number,
        'title', da.step_title,
        'selector', da.selector,
        'type', da.annotation_type,
        'text', da.text_content
      ) ORDER BY da.step_number
    ) as annotations
  FROM documentation_snapshots ds
  LEFT JOIN documentation_annotations da ON ds.snapshot_id = da.snapshot_id
  WHERE ds.provider = p_provider
    AND ds.status = 'current'
  GROUP BY ds.snapshot_id, ds.page_url, ds.screenshot_dir, ds.step_count, ds.created_at
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if documentation needs verification
CREATE OR REPLACE FUNCTION needs_verification()
RETURNS TABLE (
  snapshot_id UUID,
  provider VARCHAR(50),
  page_url TEXT,
  last_verified_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.snapshot_id,
    ds.provider,
    ds.page_url,
    ds.last_verified_at
  FROM documentation_snapshots ds
  WHERE ds.status = 'current'
    AND (
      ds.next_verification_at IS NULL
      OR ds.next_verification_at < NOW()
    )
  ORDER BY ds.last_verified_at ASC NULLS FIRST
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_snapshots_updated_at
  BEFORE UPDATE ON documentation_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON documentation_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

-- Insert initial verification schedule (every 24 hours for OAuth providers)
INSERT INTO documentation_snapshots (
  provider,
  provider_type,
  page_url,
  page_title,
  dom_structure_hash,
  status,
  next_verification_at
) VALUES
  ('github', 'oauth', 'https://github.com/settings/developers', 'GitHub OAuth Apps', 'initial', 'unverified', NOW() + INTERVAL '1 day'),
  ('google', 'oauth', 'https://console.cloud.google.com/apis/credentials', 'Google Cloud Credentials', 'initial', 'unverified', NOW() + INTERVAL '1 day'),
  ('microsoft', 'oauth', 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps', 'Azure App Registrations', 'initial', 'unverified', NOW() + INTERVAL '1 day')
ON CONFLICT (provider, page_url, status) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Documentation tracking system initialized';
  RAISE NOTICE '   Tables created: 6';
  RAISE NOTICE '   Functions created: 4';
  RAISE NOTICE '   Indexes created: 15';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Use these functions:';
  RAISE NOTICE '   SELECT * FROM get_current_documentation(''github'');';
  RAISE NOTICE '   SELECT * FROM needs_verification();';
  RAISE NOTICE '   SELECT mark_snapshot_outdated(''uuid'', ''selector_missing'', ''details'');';
END $$;
