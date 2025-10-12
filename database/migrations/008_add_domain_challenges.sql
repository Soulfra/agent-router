-- Migration: Add Domain Challenge Testing System
--
-- Purpose: Track AI-generated implementations across 12 domain personalities
-- Teacher/student model where human judges competing implementations

-- ============================================================
-- Domain Challenges Table
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_prompt TEXT NOT NULL,
  challenge_type VARCHAR(50) DEFAULT 'component', -- component, integration, feature, bugfix
  context JSONB DEFAULT '{}', -- Additional context for the challenge
  expected_services TEXT[], -- Which services the implementation should use
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  winner_domain_id UUID REFERENCES domain_portfolio(domain_id),
  winner_score DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'pending' -- pending, judging, completed, archived
);

CREATE INDEX idx_challenges_status ON domain_challenges(status);
CREATE INDEX idx_challenges_created ON domain_challenges(created_at DESC);

-- ============================================================
-- Domain Implementations Table
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_implementations (
  implementation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES domain_challenges(challenge_id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,
  model_name VARCHAR(255) DEFAULT 'codellama:7b', -- Which Ollama model generated this
  implementation_code TEXT NOT NULL,
  implementation_type VARCHAR(50) DEFAULT 'html', -- html, js, jsx, component, integration
  file_name VARCHAR(255),
  description TEXT, -- AI-generated description of its implementation
  generation_time_ms INT, -- How long it took to generate
  created_at TIMESTAMP DEFAULT NOW(),

  -- Quality Metrics (automatic)
  code_length INT,
  has_comments BOOLEAN DEFAULT FALSE,
  uses_domain_colors BOOLEAN DEFAULT FALSE,
  uses_expected_services BOOLEAN DEFAULT FALSE,
  syntax_valid BOOLEAN DEFAULT TRUE,

  -- Voting Metrics (human)
  swipe_right_count INT DEFAULT 0, -- Likes
  swipe_left_count INT DEFAULT 0, -- Dislikes
  feedback_count INT DEFAULT 0, -- Detailed feedback submissions
  total_score DECIMAL(10,2) DEFAULT 0, -- Combined automatic + human score

  UNIQUE(challenge_id, domain_id)
);

CREATE INDEX idx_implementations_challenge ON domain_implementations(challenge_id);
CREATE INDEX idx_implementations_domain ON domain_implementations(domain_id);
CREATE INDEX idx_implementations_score ON domain_implementations(total_score DESC);

-- ============================================================
-- Domain Judgments Table
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_judgments (
  judgment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL REFERENCES domain_implementations(implementation_id) ON DELETE CASCADE,
  session_id UUID NOT NULL, -- Anonymous session tracking
  vote_direction VARCHAR(10) CHECK (vote_direction IN ('left', 'right')), -- left = dislike, right = like
  teacher_comment TEXT, -- Optional detailed feedback
  comparison_implementation_id UUID REFERENCES domain_implementations(implementation_id), -- What was it compared against
  judged_at TIMESTAMP DEFAULT NOW(),

  -- Quality-specific feedback
  creativity_score INT CHECK (creativity_score BETWEEN 1 AND 5),
  functionality_score INT CHECK (functionality_score BETWEEN 1 AND 5),
  code_quality_score INT CHECK (code_quality_score BETWEEN 1 AND 5),
  brand_alignment_score INT CHECK (brand_alignment_score BETWEEN 1 AND 5)
);

CREATE INDEX idx_judgments_implementation ON domain_judgments(implementation_id);
CREATE INDEX idx_judgments_session ON domain_judgments(session_id);
CREATE INDEX idx_judgments_date ON domain_judgments(judged_at DESC);

-- ============================================================
-- Challenge Leaderboard View
-- ============================================================
CREATE OR REPLACE VIEW challenge_leaderboard AS
SELECT
  dp.domain_name,
  dp.brand_name,
  dp.primary_color,
  COUNT(DISTINCT di.challenge_id) as challenges_completed,
  COUNT(DISTINCT CASE WHEN dc.winner_domain_id = dp.domain_id THEN dc.challenge_id END) as wins,
  ROUND(AVG(di.total_score), 2) as avg_score,
  SUM(di.swipe_right_count) as total_likes,
  SUM(di.swipe_left_count) as total_dislikes,
  ROUND(
    SUM(di.swipe_right_count)::DECIMAL /
    NULLIF(SUM(di.swipe_right_count + di.swipe_left_count), 0) * 100,
    2
  ) as win_rate_pct
FROM domain_portfolio dp
LEFT JOIN domain_implementations di ON dp.domain_id = di.domain_id
LEFT JOIN domain_challenges dc ON di.challenge_id = dc.challenge_id
WHERE dp.status = 'active'
GROUP BY dp.domain_id, dp.domain_name, dp.brand_name, dp.primary_color
ORDER BY wins DESC, avg_score DESC;

-- ============================================================
-- Challenge Details View (for judging interface)
-- ============================================================
CREATE OR REPLACE VIEW challenge_details AS
SELECT
  dc.challenge_id,
  dc.challenge_prompt,
  dc.challenge_type,
  dc.status,
  dc.created_at,

  -- Implementation stats
  COUNT(di.implementation_id) as total_implementations,
  COUNT(CASE WHEN di.total_score > 0 THEN 1 END) as judged_implementations,
  MAX(di.total_score) as highest_score,
  AVG(di.total_score) as avg_score,

  -- Winner info
  dp.domain_name as winner_domain,
  dp.brand_name as winner_brand,
  dc.winner_score

FROM domain_challenges dc
LEFT JOIN domain_implementations di ON dc.challenge_id = di.challenge_id
LEFT JOIN domain_portfolio dp ON dc.winner_domain_id = dp.domain_id
GROUP BY dc.challenge_id, dp.domain_name, dp.brand_name
ORDER BY dc.created_at DESC;

-- ============================================================
-- Implementation Quality View
-- ============================================================
CREATE OR REPLACE VIEW implementation_quality AS
SELECT
  di.implementation_id,
  di.challenge_id,
  dp.domain_name,
  dp.brand_name,
  dp.primary_color,

  -- Code metrics
  di.code_length,
  di.has_comments,
  di.uses_domain_colors,
  di.uses_expected_services,

  -- Voting metrics
  di.swipe_right_count,
  di.swipe_left_count,
  di.feedback_count,

  -- Detailed scores from judgments
  ROUND(AVG(dj.creativity_score), 2) as avg_creativity,
  ROUND(AVG(dj.functionality_score), 2) as avg_functionality,
  ROUND(AVG(dj.code_quality_score), 2) as avg_code_quality,
  ROUND(AVG(dj.brand_alignment_score), 2) as avg_brand_alignment,

  -- Overall
  di.total_score,
  di.created_at

FROM domain_implementations di
JOIN domain_portfolio dp ON di.domain_id = dp.domain_id
LEFT JOIN domain_judgments dj ON di.implementation_id = dj.implementation_id
GROUP BY di.implementation_id, dp.domain_name, dp.brand_name, dp.primary_color
ORDER BY di.total_score DESC;

-- ============================================================
-- Function: Calculate Implementation Score
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_implementation_score(p_implementation_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_score DECIMAL(10,2) := 0;
  v_auto_score DECIMAL(10,2) := 0;
  v_human_score DECIMAL(10,2) := 0;
  v_impl RECORD;
BEGIN
  -- Get implementation details
  SELECT * INTO v_impl
  FROM domain_implementations
  WHERE implementation_id = p_implementation_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Automatic scoring (max 50 points)
  IF v_impl.syntax_valid THEN
    v_auto_score := v_auto_score + 10;
  END IF;

  IF v_impl.has_comments THEN
    v_auto_score := v_auto_score + 5;
  END IF;

  IF v_impl.uses_domain_colors THEN
    v_auto_score := v_auto_score + 15;
  END IF;

  IF v_impl.uses_expected_services THEN
    v_auto_score := v_auto_score + 10;
  END IF;

  -- Code length bonus (up to 10 points)
  IF v_impl.code_length BETWEEN 100 AND 1000 THEN
    v_auto_score := v_auto_score + 10;
  ELSIF v_impl.code_length BETWEEN 50 AND 100 OR v_impl.code_length BETWEEN 1000 AND 2000 THEN
    v_auto_score := v_auto_score + 5;
  END IF;

  -- Human scoring (max 50 points)
  -- Swipe ratio: likes / (likes + dislikes) * 30
  IF (v_impl.swipe_right_count + v_impl.swipe_left_count) > 0 THEN
    v_human_score := v_human_score + (
      v_impl.swipe_right_count::DECIMAL /
      (v_impl.swipe_right_count + v_impl.swipe_left_count) * 30
    );
  END IF;

  -- Detailed feedback bonus (up to 20 points from avg of 4 categories)
  SELECT
    (AVG(creativity_score) + AVG(functionality_score) +
     AVG(code_quality_score) + AVG(brand_alignment_score)) / 4 * 4
  INTO v_human_score
  FROM domain_judgments
  WHERE implementation_id = p_implementation_id
    AND creativity_score IS NOT NULL;

  v_human_score := COALESCE(v_human_score, 0);

  -- Total score
  v_score := v_auto_score + v_human_score;

  -- Update the implementation
  UPDATE domain_implementations
  SET total_score = v_score
  WHERE implementation_id = p_implementation_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Determine Challenge Winner
-- ============================================================
CREATE OR REPLACE FUNCTION determine_challenge_winner(p_challenge_id UUID)
RETURNS UUID AS $$
DECLARE
  v_winner_id UUID;
  v_winner_score DECIMAL(10,2);
BEGIN
  -- Find implementation with highest score
  SELECT implementation_id, total_score
  INTO v_winner_id, v_winner_score
  FROM domain_implementations
  WHERE challenge_id = p_challenge_id
  ORDER BY total_score DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Update challenge with winner
  UPDATE domain_challenges
  SET
    winner_domain_id = (
      SELECT domain_id
      FROM domain_implementations
      WHERE implementation_id = v_winner_id
    ),
    winner_score = v_winner_score,
    status = 'completed',
    completed_at = NOW()
  WHERE challenge_id = p_challenge_id;

  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger: Update Score After Judgment
-- ============================================================
CREATE OR REPLACE FUNCTION update_score_after_judgment()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment vote counts
  IF NEW.vote_direction = 'right' THEN
    UPDATE domain_implementations
    SET swipe_right_count = swipe_right_count + 1
    WHERE implementation_id = NEW.implementation_id;
  ELSIF NEW.vote_direction = 'left' THEN
    UPDATE domain_implementations
    SET swipe_left_count = swipe_left_count + 1
    WHERE implementation_id = NEW.implementation_id;
  END IF;

  -- Increment feedback count if there's a comment or detailed scores
  IF NEW.teacher_comment IS NOT NULL OR NEW.creativity_score IS NOT NULL THEN
    UPDATE domain_implementations
    SET feedback_count = feedback_count + 1
    WHERE implementation_id = NEW.implementation_id;
  END IF;

  -- Recalculate score
  PERFORM calculate_implementation_score(NEW.implementation_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_score ON domain_judgments;
CREATE TRIGGER trigger_update_score
  AFTER INSERT ON domain_judgments
  FOR EACH ROW
  EXECUTE FUNCTION update_score_after_judgment();

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT SELECT ON domain_challenges TO postgres;
GRANT SELECT ON domain_implementations TO postgres;
GRANT SELECT ON domain_judgments TO postgres;
GRANT SELECT ON challenge_leaderboard TO postgres;
GRANT SELECT ON challenge_details TO postgres;
GRANT SELECT ON implementation_quality TO postgres;

GRANT ALL ON domain_challenges TO postgres;
GRANT ALL ON domain_implementations TO postgres;
GRANT ALL ON domain_judgments TO postgres;

-- ============================================================
-- Initial Test Challenge
-- ============================================================
INSERT INTO domain_challenges (
  challenge_id,
  challenge_prompt,
  challenge_type,
  expected_services,
  status
) VALUES (
  gen_random_uuid(),
  'Create a simple "Coming Soon" landing page component with an email signup form. Use the domain brand colors and include a tagline.',
  'component',
  ARRAY['auth', 'creative-tools'],
  'pending'
);

-- ============================================================
-- Success Message
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Domain Challenge Testing System installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - domain_challenges (track prompts and winners)';
  RAISE NOTICE '  - domain_implementations (AI-generated code from 12 domains)';
  RAISE NOTICE '  - domain_judgments (human voting and feedback)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - challenge_leaderboard (domain win rates)';
  RAISE NOTICE '  - challenge_details (challenge statistics)';
  RAISE NOTICE '  - implementation_quality (detailed scoring)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - calculate_implementation_score() (automatic + human scoring)';
  RAISE NOTICE '  - determine_challenge_winner() (find best implementation)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run migration: psql -U postgres -d calos -f 008_add_domain_challenges.sql';
  RAISE NOTICE '  2. Create domain-specific Ollama models';
  RAISE NOTICE '  3. Implement DomainChallengeBuilder class';
  RAISE NOTICE '  4. Update domain-swiper.html for judging';
END $$;
