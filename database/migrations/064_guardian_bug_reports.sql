-- Guardian Bug Reports Table
--
-- Tracks Cal's autonomous bug detection and external reporting
-- Records errors sent to OpenAI/CodeRabbit/GitHub and their suggested fixes

CREATE TABLE IF NOT EXISTS guardian_bug_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Service used
  service VARCHAR(50) NOT NULL, -- 'openai', 'coderabbit', 'github'

  -- Error details
  error_message TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  snippet TEXT,
  stack_trace TEXT,

  -- AI diagnosis
  diagnosis TEXT,
  suggested_fix TEXT,
  raw_response TEXT,

  -- Resolution tracking
  status VARCHAR(50) DEFAULT 'reported', -- 'reported', 'fix_applied', 'verified', 'failed'
  resolution_notes TEXT,
  resolved_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) DEFAULT 'cal-guardian'
);

CREATE INDEX idx_guardian_reports_service ON guardian_bug_reports(service);
CREATE INDEX idx_guardian_reports_status ON guardian_bug_reports(status);
CREATE INDEX idx_guardian_reports_created ON guardian_bug_reports(created_at DESC);
CREATE INDEX idx_guardian_reports_file ON guardian_bug_reports(file_path);

COMMENT ON TABLE guardian_bug_reports IS 'Cal Guardian autonomous bug detection and external AI diagnosis';
COMMENT ON COLUMN guardian_bug_reports.service IS 'External service used: openai, coderabbit, github';
COMMENT ON COLUMN guardian_bug_reports.suggested_fix IS 'AI-suggested fix extracted from response';
COMMENT ON COLUMN guardian_bug_reports.status IS 'Lifecycle: reported → fix_applied → verified/failed';
