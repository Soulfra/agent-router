/**
 * Migration 061: Recruiting Integration
 *
 * Adds support for:
 * - Resume uploads and parsing
 * - Talent scoring and ranking
 * - Integration between onboarding surveys and recruiting pipeline
 * - Top performer identification for OSS programs
 */

-- Add resume fields to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS resume_skills JSONB,
  ADD COLUMN IF NOT EXISTS resume_file_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_parsed_data JSONB;

-- Add index for resume skills (for faster skill matching)
CREATE INDEX IF NOT EXISTS idx_user_profiles_resume_skills
  ON user_profiles USING GIN (resume_skills);

-- Create candidate_rankings table for caching talent scores
CREATE TABLE IF NOT EXISTS candidate_rankings (
  ranking_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  total_score DECIMAL(5, 2) NOT NULL,
  percentile INTEGER NOT NULL,
  is_top_performer BOOLEAN DEFAULT false,
  scores JSONB NOT NULL, -- Breakdown: { surveyCompletion, surveyQuality, skillMatch, brandIdeas, portfolio, engagement }
  recommendation TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for finding top performers
CREATE INDEX IF NOT EXISTS idx_candidate_rankings_score
  ON candidate_rankings(total_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_rankings_top_performers
  ON candidate_rankings(is_top_performer, total_score DESC)
  WHERE is_top_performer = true;

-- Ensure brand_ideas has user_id reference
-- (This table was created in migration 008, but we need to ensure it links to users properly)
DO $$
BEGIN
  -- Add user_id if not exists (for easy querying)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brand_ideas' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE brand_ideas ADD COLUMN user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE;

    -- Populate user_id from profile_id
    UPDATE brand_ideas bi
    SET user_id = up.user_id
    FROM user_profiles up
    WHERE bi.profile_id = up.id AND up.user_id IS NOT NULL;
  END IF;
END $$;

-- Create index for brand ideas by user
CREATE INDEX IF NOT EXISTS idx_brand_ideas_user_id
  ON brand_ideas(user_id)
  WHERE user_id IS NOT NULL;

-- Add survey level to user_profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'survey_level'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN survey_level INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create view for recruiting analytics
CREATE OR REPLACE VIEW recruiting_analytics AS
SELECT
  u.user_id,
  u.email,
  up.full_name,
  up.preferred_name,
  up.survey_level,
  up.completed_levels,
  up.completion_percentage,
  up.earned_amount,
  up.resume_skills,
  up.resume_file_path,
  cr.total_score,
  cr.percentile,
  cr.is_top_performer,
  cr.scores as talent_scores,
  cr.recommendation,
  COUNT(DISTINCT bi.idea_id) as brand_ideas_count,
  AVG(bi.viability_score)::INTEGER as avg_viability,
  AVG(bi.actionability_score)::INTEGER as avg_actionability,
  COUNT(DISTINCT sr.response_id) as survey_responses_count,
  AVG(sr.quality_score)::INTEGER as avg_response_quality,
  ja.job_id,
  ja.skill_match_score,
  ja.status as application_status,
  ja.created_at as applied_at
FROM users u
LEFT JOIN user_profiles up ON u.user_id = up.user_id
LEFT JOIN candidate_rankings cr ON u.user_id = cr.user_id
LEFT JOIN brand_ideas bi ON u.user_id = bi.user_id
LEFT JOIN survey_responses sr ON up.id = sr.profile_id
LEFT JOIN job_applications ja ON u.user_id = ja.user_id
GROUP BY
  u.user_id, u.email, up.full_name, up.preferred_name,
  up.survey_level, up.completed_levels, up.completion_percentage,
  up.earned_amount, up.resume_skills, up.resume_file_path,
  cr.total_score, cr.percentile, cr.is_top_performer,
  cr.scores, cr.recommendation, ja.job_id, ja.skill_match_score,
  ja.status, ja.created_at;

-- Create function to automatically update ranking timestamp
CREATE OR REPLACE FUNCTION update_ranking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for ranking updates
DROP TRIGGER IF EXISTS trigger_update_ranking_timestamp ON candidate_rankings;
CREATE TRIGGER trigger_update_ranking_timestamp
  BEFORE UPDATE ON candidate_rankings
  FOR EACH ROW
  EXECUTE FUNCTION update_ranking_timestamp();

-- Insert default job posting for testing (if none exist)
INSERT INTO job_postings (
  title, company, location, job_type, description,
  required_skills, salary_range, is_active
)
SELECT
  'Senior Software Engineer - AI/ML',
  'CALOS',
  'Remote',
  'full-time',
  'We are seeking exceptional engineers to contribute to our AI routing platform and OSS programs. You will work with cutting-edge AI models, build scalable infrastructure, and help shape the future of multi-model AI systems.',
  ARRAY['javascript', 'typescript', 'python', 'node.js', 'react', 'postgresql', 'aws', 'docker', 'llm', 'machine learning']::TEXT[],
  '$120,000 - $200,000',
  true
WHERE NOT EXISTS (SELECT 1 FROM job_postings WHERE company = 'CALOS');

-- Add comment for documentation
COMMENT ON TABLE candidate_rankings IS 'Cached talent scores and rankings for recruiting pipeline. Scores are calculated from surveys, resumes, brand ideas, portfolios, and engagement metrics.';

COMMENT ON VIEW recruiting_analytics IS 'Comprehensive view of candidate data combining surveys, resumes, brand ideas, and applications for recruiting insights.';

-- Grant permissions (if using role-based access)
-- GRANT SELECT ON recruiting_analytics TO recruiter_role;
-- GRANT ALL ON candidate_rankings TO recruiter_role;
