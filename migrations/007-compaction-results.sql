/**
 * Migration: Compaction Results Storage
 *
 * Stores results from code compaction and grading pipeline
 */

-- Compaction results table
CREATE TABLE IF NOT EXISTS compaction_results (
  id SERIAL PRIMARY KEY,

  -- Project info
  project JSONB NOT NULL,  -- { title, description }

  -- Pipeline stages
  stages JSONB NOT NULL,  -- { compaction, preprocessing, localGrading, ollama }

  -- Timing data
  timing JSONB NOT NULL,  -- { compaction, preprocessing, localGrading, ollama, total }

  -- Final scores
  final_scores JSONB,  -- { local, ollama, combined }

  -- Errors (if any)
  errors JSONB DEFAULT '[]',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for compaction results
CREATE INDEX IF NOT EXISTS idx_compaction_results_created_at ON compaction_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compaction_results_project_title ON compaction_results((project->>'title'));
CREATE INDEX IF NOT EXISTS idx_compaction_results_combined_score ON compaction_results(((final_scores->>'combined')::numeric) DESC NULLS LAST);

-- View for compaction statistics
CREATE OR REPLACE VIEW compaction_statistics AS
SELECT
  COUNT(*) as total_compactions,
  AVG((stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric) as avg_token_reduction,
  AVG((stages->'compaction'->'stats'->'reduction'->>'size')::numeric) as avg_size_reduction,
  AVG((final_scores->>'local')::numeric) as avg_local_score,
  AVG((final_scores->>'ollama')::numeric) as avg_ollama_score,
  AVG((final_scores->>'combined')::numeric) as avg_combined_score,
  SUM((timing->>'total')::numeric) as total_processing_time_ms,
  AVG((timing->>'total')::numeric) as avg_processing_time_ms
FROM compaction_results
WHERE stages->'compaction' IS NOT NULL;

-- View for top scored projects
CREATE OR REPLACE VIEW top_compacted_projects AS
SELECT
  id,
  (project->>'title') as title,
  (project->>'description') as description,
  (final_scores->>'local')::numeric as local_score,
  (final_scores->>'ollama')::numeric as ollama_score,
  (final_scores->>'combined')::numeric as combined_score,
  (stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric as token_reduction,
  (timing->>'total')::numeric as processing_time_ms,
  created_at
FROM compaction_results
WHERE final_scores->>'combined' IS NOT NULL
ORDER BY (final_scores->>'combined')::numeric DESC
LIMIT 50;

-- View for recent compactions
CREATE OR REPLACE VIEW recent_compactions AS
SELECT
  id,
  (project->>'title') as title,
  (stages->'compaction'->'stats'->'original'->>'size')::numeric as original_size,
  (stages->'compaction'->'stats'->'compacted'->>'size')::numeric as compacted_size,
  (stages->'compaction'->'stats'->'reduction'->>'size')::numeric as size_reduction_pct,
  (stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric as token_reduction_pct,
  (final_scores->>'combined')::numeric as score,
  created_at
FROM compaction_results
ORDER BY created_at DESC
LIMIT 100;

-- View for grading track breakdown
CREATE OR REPLACE VIEW grading_track_breakdown AS
SELECT
  id,
  (project->>'title') as title,
  (stages->'localGrading'->'tracks'->'visual'->>'overall')::numeric as visual_score,
  (stages->'localGrading'->'tracks'->'logic'->>'overall')::numeric as logic_score,
  (stages->'localGrading'->'tracks'->'audio'->>'overall')::numeric as audio_score,
  (stages->'localGrading'->'combined'->>'overall')::numeric as combined_local_score,
  created_at
FROM compaction_results
WHERE stages->'localGrading' IS NOT NULL
ORDER BY created_at DESC;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_compaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_compaction_results_updated_at ON compaction_results;
CREATE TRIGGER update_compaction_results_updated_at
BEFORE UPDATE ON compaction_results
FOR EACH ROW
EXECUTE FUNCTION update_compaction_updated_at();

-- Function to get token savings for a project
CREATE OR REPLACE FUNCTION get_token_savings(compaction_id INTEGER)
RETURNS TABLE(
  original_tokens INTEGER,
  compacted_tokens INTEGER,
  tokens_saved INTEGER,
  reduction_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (stages->'compaction'->'stats'->'original'->>'tokens')::INTEGER,
    (stages->'compaction'->'stats'->'compacted'->>'tokens')::INTEGER,
    ((stages->'compaction'->'stats'->'original'->>'tokens')::INTEGER -
     (stages->'compaction'->'stats'->'compacted'->>'tokens')::INTEGER),
    (stages->'compaction'->'stats'->'reduction'->>'tokens')::NUMERIC
  FROM compaction_results
  WHERE id = compaction_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE compaction_results IS 'Results from code compaction and grading pipeline';
COMMENT ON COLUMN compaction_results.project IS 'Project metadata: title, description';
COMMENT ON COLUMN compaction_results.stages IS 'Pipeline stages: compaction, preprocessing, localGrading, ollama';
COMMENT ON COLUMN compaction_results.timing IS 'Timing data for each stage in milliseconds';
COMMENT ON COLUMN compaction_results.final_scores IS 'Final scores: local (math-based), ollama (AI-based), combined';
COMMENT ON COLUMN compaction_results.errors IS 'Array of errors that occurred during pipeline';

-- Sample query examples (commented out)
/*
-- Get token savings summary
SELECT
  COUNT(*) as projects,
  AVG((stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric) as avg_token_reduction,
  SUM((stages->'compaction'->'stats'->'original'->>'tokens')::numeric -
      (stages->'compaction'->'stats'->'compacted'->>'tokens')::numeric) as total_tokens_saved
FROM compaction_results;

-- Get top projects by combined score
SELECT
  (project->>'title') as title,
  (final_scores->>'combined')::numeric as score,
  (stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric as token_reduction
FROM compaction_results
WHERE final_scores->>'combined' IS NOT NULL
ORDER BY (final_scores->>'combined')::numeric DESC
LIMIT 10;

-- Get average scores by track
SELECT
  AVG((stages->'localGrading'->'tracks'->'visual'->>'overall')::numeric) as avg_visual,
  AVG((stages->'localGrading'->'tracks'->'logic'->>'overall')::numeric) as avg_logic,
  AVG((stages->'localGrading'->'tracks'->'audio'->>'overall')::numeric) as avg_audio
FROM compaction_results
WHERE stages->'localGrading' IS NOT NULL;
*/
