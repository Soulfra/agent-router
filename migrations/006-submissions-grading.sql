/**
 * Migration: Submissions and Multi-Track Grading System
 *
 * Creates tables for:
 * - Submissions (with content type separation)
 * - Grading results (per track)
 * - Track metadata
 */

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  challenge_id INTEGER,
  file_name VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT,

  -- Content type and processing
  content_type VARCHAR(50) NOT NULL,  -- 'full-stack', 'python', 'javascript', 'css', 'audio', 'unknown'
  raw_content TEXT NOT NULL,
  tracks JSONB NOT NULL,  -- Separated content by track: { visual, logic, audio, html, etc. }
  grading_tracks TEXT[] NOT NULL,  -- Which tracks to grade: ['visual', 'logic', 'audio']

  -- Metadata
  metadata JSONB,  -- { originalSize, processedSize, reduction, timestamp, etc. }

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for submissions
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge_id ON submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_content_type ON submissions(content_type);
CREATE INDEX IF NOT EXISTS idx_submissions_grading_tracks ON submissions USING GIN(grading_tracks);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);

-- Grading results table
CREATE TABLE IF NOT EXISTS grading_results (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  track VARCHAR(50) NOT NULL,  -- 'visual', 'logic', 'audio'

  -- Grading results
  result JSONB NOT NULL,  -- Complete evaluation result with breakdown, feedback, etc.
  score NUMERIC(5,2) NOT NULL,  -- Overall score for quick access

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one result per submission per track (can be updated)
  UNIQUE(submission_id, track)
);

-- Indexes for grading results
CREATE INDEX IF NOT EXISTS idx_grading_results_submission_id ON grading_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_grading_results_track ON grading_results(track);
CREATE INDEX IF NOT EXISTS idx_grading_results_score ON grading_results(score DESC);
CREATE INDEX IF NOT EXISTS idx_grading_results_created_at ON grading_results(created_at DESC);

-- Track statistics view
CREATE OR REPLACE VIEW track_statistics AS
SELECT
  track,
  COUNT(*) as total_gradings,
  AVG(score) as average_score,
  MIN(score) as min_score,
  MAX(score) as max_score,
  STDDEV(score) as score_stddev
FROM grading_results
GROUP BY track;

-- Submission statistics view
CREATE OR REPLACE VIEW submission_statistics AS
SELECT
  s.content_type,
  COUNT(DISTINCT s.id) as total_submissions,
  COUNT(DISTINCT s.user_id) as unique_users,
  AVG(s.file_size) as avg_file_size,
  COUNT(DISTINCT s.challenge_id) as challenges_with_submissions
FROM submissions s
GROUP BY s.content_type;

-- Combined scores view
CREATE OR REPLACE VIEW combined_scores AS
SELECT
  s.id as submission_id,
  s.user_id,
  s.challenge_id,
  s.file_name,
  s.content_type,
  s.grading_tracks,
  AVG(gr.score) as average_score,
  COUNT(gr.track) as tracks_graded,
  JSONB_OBJECT_AGG(gr.track, gr.score) as scores_by_track,
  s.created_at
FROM submissions s
LEFT JOIN grading_results gr ON s.id = gr.submission_id
GROUP BY s.id;

-- Leaderboard view (top scores)
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  cs.submission_id,
  cs.user_id,
  cs.challenge_id,
  cs.file_name,
  cs.content_type,
  cs.average_score,
  cs.scores_by_track,
  cs.created_at,
  RANK() OVER (ORDER BY cs.average_score DESC) as rank
FROM combined_scores cs
WHERE cs.tracks_graded > 0
ORDER BY cs.average_score DESC;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_submissions_updated_at ON submissions;
CREATE TRIGGER update_submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_grading_results_updated_at ON grading_results;
CREATE TRIGGER update_grading_results_updated_at
BEFORE UPDATE ON grading_results
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional, for testing)
-- INSERT INTO submissions (user_id, challenge_id, file_name, file_size, content_type, raw_content, tracks, grading_tracks, metadata)
-- VALUES
--   ('test-user-1', 1, 'app.html', 1500, 'full-stack',
--    '<style>.header { color: blue; }</style><script>function test() { return 42; }</script>',
--    '{"visual": ".header { color: blue; }", "logic": "function test() { return 42; }"}',
--    ARRAY['visual', 'logic'],
--    '{"originalSize": 1500, "processedSize": 800, "reduction": 46.7}'::jsonb);

COMMENT ON TABLE submissions IS 'Code submissions with content separated by track';
COMMENT ON TABLE grading_results IS 'Grading results for each track (visual, logic, audio)';
COMMENT ON COLUMN submissions.tracks IS 'Separated content: { visual: CSS, logic: JS/Python, audio: audio code }';
COMMENT ON COLUMN submissions.grading_tracks IS 'Array of tracks to grade: [visual, logic, audio]';
COMMENT ON COLUMN grading_results.result IS 'Complete evaluation: { overall, breakdown, feedback, metadata }';
