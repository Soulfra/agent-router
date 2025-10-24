-- Guardian Patch Applications Table
--
-- Tracks Cal's autonomous patch applications
-- Records AI-suggested fixes that were applied and their outcomes

CREATE TABLE IF NOT EXISTS guardian_patch_applications (
  patch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Patch details
  file_path TEXT NOT NULL,
  line_number INTEGER,
  description TEXT,
  old_code TEXT,
  new_code TEXT,

  -- Backup/rollback
  snapshot_id TEXT, -- Backup file path or Context Airlock snapshot ID
  rolled_back BOOLEAN DEFAULT FALSE,

  -- Verification
  success BOOLEAN NOT NULL,
  verification_error TEXT,
  tests_passed BOOLEAN,

  -- Metadata
  applied_at TIMESTAMP DEFAULT NOW(),
  applied_by VARCHAR(255) DEFAULT 'cal-guardian',
  source VARCHAR(50) -- 'openai', 'coderabbit', 'manual'
);

CREATE INDEX idx_guardian_patches_file ON guardian_patch_applications(file_path);
CREATE INDEX idx_guardian_patches_success ON guardian_patch_applications(success);
CREATE INDEX idx_guardian_patches_applied ON guardian_patch_applications(applied_at DESC);
CREATE INDEX idx_guardian_patches_rollback ON guardian_patch_applications(rolled_back);

COMMENT ON TABLE guardian_patch_applications IS 'Cal Guardian autonomous patch applications with rollback tracking';
COMMENT ON COLUMN guardian_patch_applications.snapshot_id IS 'Backup snapshot for rollback if patch fails';
COMMENT ON COLUMN guardian_patch_applications.rolled_back IS 'TRUE if patch was rolled back due to verification failure';
