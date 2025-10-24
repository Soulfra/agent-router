/**
 * Migration 099: Job Tracking Fields
 *
 * Adds engagement tracking, expiration dates, status workflows,
 * and urgency levels to job postings.
 *
 * Features:
 * - View and application counters
 * - Published/expiration dates
 * - Interview status workflow
 * - Urgency levels for badges
 */

-- Add tracking fields
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applications_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepting_applications BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS interview_status VARCHAR(50) DEFAULT 'accepting';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_job_postings_published
  ON job_postings(published_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_job_postings_expires
  ON job_postings(expires_at)
  WHERE is_active = true AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_urgency
  ON job_postings(urgency_level, published_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_job_postings_status
  ON job_postings(interview_status)
  WHERE is_active = true;

-- Add check constraints
ALTER TABLE job_postings
  DROP CONSTRAINT IF EXISTS check_urgency_level,
  ADD CONSTRAINT check_urgency_level
    CHECK (urgency_level IN ('urgent', 'normal', 'low'));

ALTER TABLE job_postings
  DROP CONSTRAINT IF EXISTS check_interview_status,
  ADD CONSTRAINT check_interview_status
    CHECK (interview_status IN ('accepting', 'reviewing', 'filled', 'closed'));

-- Function to auto-set published_at when is_active becomes true
CREATE OR REPLACE FUNCTION set_job_published_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If job is being activated and published_at is not set
  IF NEW.is_active = true AND OLD.is_active = false AND NEW.published_at IS NULL THEN
    NEW.published_at = NOW();

    -- Auto-set expiration to 60 days if not set
    IF NEW.expires_at IS NULL THEN
      NEW.expires_at = NOW() + INTERVAL '60 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_job_published_at ON job_postings;
CREATE TRIGGER trigger_set_job_published_at
  BEFORE UPDATE ON job_postings
  FOR EACH ROW
  EXECUTE FUNCTION set_job_published_at();

-- Function to auto-expire jobs
CREATE OR REPLACE FUNCTION auto_expire_jobs()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE job_postings
  SET
    is_active = false,
    interview_status = 'closed',
    accepting_applications = false
  WHERE
    is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_job_views(p_job_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE job_postings
  SET views_count = views_count + 1
  WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment application count
CREATE OR REPLACE FUNCTION increment_job_applications(p_job_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE job_postings
  SET applications_count = applications_count + 1
  WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing active jobs with published_at if not set
UPDATE job_postings
SET
  published_at = created_at,
  expires_at = created_at + INTERVAL '60 days'
WHERE
  is_active = true
  AND published_at IS NULL;

-- View for jobs with stats
CREATE OR REPLACE VIEW job_postings_with_stats AS
SELECT
  j.*,
  CASE
    WHEN j.expires_at IS NULL THEN NULL
    WHEN j.expires_at < NOW() THEN 0
    ELSE EXTRACT(EPOCH FROM (j.expires_at - NOW()))::INTEGER
  END as seconds_until_expiration,
  CASE
    WHEN j.published_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - j.published_at))::INTEGER
  END as seconds_since_published,
  CASE
    WHEN j.applications_count = 0 THEN 0
    ELSE ROUND((j.applications_count::NUMERIC / NULLIF(j.views_count, 0)) * 100, 2)
  END as conversion_rate,
  CASE
    WHEN j.published_at IS NULL THEN 'draft'
    WHEN j.published_at > NOW() - INTERVAL '7 days' THEN 'new'
    WHEN j.expires_at IS NOT NULL AND j.expires_at < NOW() + INTERVAL '7 days' THEN 'closing_soon'
    WHEN j.expires_at IS NOT NULL AND j.expires_at < NOW() THEN 'expired'
    ELSE 'active'
  END as badge_status
FROM job_postings j;

-- Grant permissions
GRANT SELECT ON job_postings_with_stats TO PUBLIC;

-- Comments
COMMENT ON COLUMN job_postings.views_count IS 'Number of times job detail page was viewed';
COMMENT ON COLUMN job_postings.applications_count IS 'Number of applications received';
COMMENT ON COLUMN job_postings.published_at IS 'When job was first published (activated)';
COMMENT ON COLUMN job_postings.expires_at IS 'When job posting expires and becomes inactive';
COMMENT ON COLUMN job_postings.accepting_applications IS 'Whether job is currently accepting new applications';
COMMENT ON COLUMN job_postings.urgency_level IS 'Urgency level for badge display: urgent, normal, low';
COMMENT ON COLUMN job_postings.interview_status IS 'Interview workflow status: accepting, reviewing, filled, closed';

COMMENT ON FUNCTION auto_expire_jobs() IS 'Run daily to automatically expire jobs past their expiration date';
COMMENT ON FUNCTION increment_job_views(INTEGER) IS 'Increment view counter when job detail page is loaded';
COMMENT ON FUNCTION increment_job_applications(INTEGER) IS 'Increment application counter when someone applies';

COMMENT ON VIEW job_postings_with_stats IS 'Job postings with calculated stats, time remaining, and badge status';
