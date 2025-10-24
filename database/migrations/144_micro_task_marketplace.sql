-- Migration 144: Micro-Task Marketplace
-- Extends existing training_tasks (026) with:
-- - Micro-payments ($0.50-$2 quick surveys)
-- - Contest submissions + voting
-- - Crowd-sourced idea filtering
-- - Integration with quest system (141) and voice onboarding (142)

-- ============================================================================
-- EXTEND EXISTING training_tasks TABLE
-- ============================================================================

ALTER TABLE training_tasks
  -- Micro-payment support
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS is_micro_task BOOLEAN DEFAULT false,

  -- Contest integration
  ADD COLUMN IF NOT EXISTS contest_id INTEGER,

  -- Quick survey specifics
  ADD COLUMN IF NOT EXISTS duration_limit_seconds INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS payment_tier VARCHAR(50) DEFAULT 'standard', -- 'micro', 'standard', 'premium', 'bounty'

  -- Crowd filtering
  ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downvotes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crowd_score INTEGER DEFAULT 0, -- upvotes - downvotes
  ADD COLUMN IF NOT EXISTS auto_approval_threshold INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS auto_rejection_threshold INTEGER DEFAULT -50;

CREATE INDEX IF NOT EXISTS idx_training_tasks_micro ON training_tasks(is_micro_task) WHERE is_micro_task = true;
CREATE INDEX IF NOT EXISTS idx_training_tasks_payment ON training_tasks(payment_amount DESC);
CREATE INDEX IF NOT EXISTS idx_training_tasks_crowd_score ON training_tasks(crowd_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_tasks_contest ON training_tasks(contest_id) WHERE contest_id IS NOT NULL;

-- ============================================================================
-- CONTESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS contests (
  id SERIAL PRIMARY KEY,
  contest_slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,

  -- Payment structure
  submission_fee NUMERIC(10, 2) DEFAULT 1.00,
  voting_fee NUMERIC(10, 2) DEFAULT 0.25,
  votes_per_payment INTEGER DEFAULT 10, -- How many votes for voting_fee

  -- Prizes
  winner_prizes JSONB NOT NULL, -- {"1st": 500.00, "2nd": 100.00, "3rd": 50.00, "top_10": 10.00}
  total_prize_pool NUMERIC(10, 2) DEFAULT 0.00,

  -- Contest rules
  max_submissions_per_user INTEGER DEFAULT 3,
  min_submission_length INTEGER DEFAULT 50,
  max_submission_length INTEGER DEFAULT 5000,
  submission_type VARCHAR(50) DEFAULT 'text', -- 'text', 'voice', 'image', 'video', 'code'

  -- Timeline
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'accepting_submissions', 'voting', 'tallying', 'completed', 'cancelled'
  submission_start TIMESTAMPTZ,
  submission_deadline TIMESTAMPTZ,
  voting_start TIMESTAMPTZ,
  voting_deadline TIMESTAMPTZ,
  winners_announced TIMESTAMPTZ,

  -- Requirements
  min_submissions_required INTEGER DEFAULT 10,
  min_votes_per_submission INTEGER DEFAULT 10,

  -- Metadata
  category VARCHAR(100),
  tags TEXT[],
  cover_image_url TEXT,
  rules_url TEXT,

  -- Creator
  created_by_user_id INTEGER,
  is_sponsored BOOLEAN DEFAULT false,
  sponsor_name VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contests_status ON contests(status);
CREATE INDEX idx_contests_category ON contests(category);
CREATE INDEX idx_contests_deadline ON contests(submission_deadline, voting_deadline);

-- ============================================================================
-- CONTEST SUBMISSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS contest_submissions (
  id SERIAL PRIMARY KEY,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  training_task_assignment_id INTEGER REFERENCES training_task_assignments(id) ON DELETE SET NULL,

  -- Submission content
  submission_type VARCHAR(50) NOT NULL, -- 'text', 'voice', 'image', 'video', 'code'
  submission_content TEXT NOT NULL,
  submission_metadata JSONB DEFAULT '{}', -- { audioUrl, imageUrl, githubRepo, etc. }

  -- Voting results
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  net_score INTEGER DEFAULT 0, -- upvotes - downvotes
  rank_position INTEGER,

  -- Payment
  submission_fee_paid NUMERIC(10, 2) DEFAULT 0.00,
  prize_won NUMERIC(10, 2) DEFAULT 0.00,
  prize_paid BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'winner', 'disqualified'
  disqualification_reason TEXT,

  -- Moderation
  flagged_count INTEGER DEFAULT 0,
  moderation_status VARCHAR(50) DEFAULT 'auto_approved', -- 'auto_approved', 'under_review', 'approved', 'rejected'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contest_id, user_id, training_task_assignment_id)
);

CREATE INDEX idx_contest_submissions_contest ON contest_submissions(contest_id);
CREATE INDEX idx_contest_submissions_user ON contest_submissions(user_id);
CREATE INDEX idx_contest_submissions_score ON contest_submissions(net_score DESC);
CREATE INDEX idx_contest_submissions_rank ON contest_submissions(rank_position ASC) WHERE rank_position IS NOT NULL;
CREATE INDEX idx_contest_submissions_status ON contest_submissions(status);

-- ============================================================================
-- IDEA VOTES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_votes (
  id SERIAL PRIMARY KEY,

  -- What's being voted on
  votable_type VARCHAR(50) NOT NULL, -- 'training_task', 'contest_submission', 'voice_onboarding_session'
  votable_id INTEGER NOT NULL,

  -- Voter
  voter_user_id INTEGER NOT NULL,

  -- Vote details
  vote_direction INTEGER NOT NULL, -- +1 for upvote, -1 for downvote
  vote_weight NUMERIC(3, 2) DEFAULT 1.00, -- Can be 0.5-2.0 based on voter reputation

  -- Payment
  payment_amount NUMERIC(10, 2) DEFAULT 0.05,
  payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'charged', 'refunded'

  -- Context
  vote_reason TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(votable_type, votable_id, voter_user_id)
);

CREATE INDEX idx_idea_votes_votable ON idea_votes(votable_type, votable_id);
CREATE INDEX idx_idea_votes_voter ON idea_votes(voter_user_id);
CREATE INDEX idx_idea_votes_direction ON idea_votes(vote_direction);

-- ============================================================================
-- MICRO TASK TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS micro_task_templates (
  id SERIAL PRIMARY KEY,
  template_slug VARCHAR(255) UNIQUE NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,

  -- Task configuration
  task_type VARCHAR(100) NOT NULL, -- 'quick_voice_survey', 'quick_text_survey', 'quick_poll', 'vote_on_idea'
  estimated_duration_seconds INTEGER NOT NULL,
  payment_amount NUMERIC(10, 2) NOT NULL,

  -- Template structure
  questions JSONB NOT NULL, -- Array of question objects
  instructions TEXT,
  example_response TEXT,

  -- Requirements
  min_response_length INTEGER,
  max_response_length INTEGER,
  required_fields TEXT[],

  -- Quality control
  auto_reject_rules JSONB DEFAULT '{}', -- { minWords: 10, blockSpam: true, checkDuplicates: true }
  requires_review BOOLEAN DEFAULT false,

  -- Metadata
  category VARCHAR(100),
  tags TEXT[],
  difficulty VARCHAR(20) DEFAULT 'easy', -- 'easy', 'medium', 'hard'

  -- Status
  is_active BOOLEAN DEFAULT true,
  total_completions INTEGER DEFAULT 0,
  avg_completion_time_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_micro_task_templates_type ON micro_task_templates(task_type);
CREATE INDEX idx_micro_task_templates_payment ON micro_task_templates(payment_amount DESC);
CREATE INDEX idx_micro_task_templates_active ON micro_task_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- USER EARNINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_micro_task_earnings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,

  -- Earnings breakdown
  total_tasks_completed INTEGER DEFAULT 0,
  total_earned NUMERIC(10, 2) DEFAULT 0.00,
  total_pending NUMERIC(10, 2) DEFAULT 0.00,
  total_paid_out NUMERIC(10, 2) DEFAULT 0.00,

  -- By task type
  voice_surveys_completed INTEGER DEFAULT 0,
  voice_surveys_earned NUMERIC(10, 2) DEFAULT 0.00,
  text_surveys_completed INTEGER DEFAULT 0,
  text_surveys_earned NUMERIC(10, 2) DEFAULT 0.00,
  votes_cast INTEGER DEFAULT 0,
  votes_earned NUMERIC(10, 2) DEFAULT 0.00,
  contest_submissions INTEGER DEFAULT 0,
  contest_winnings NUMERIC(10, 2) DEFAULT 0.00,

  -- Quality metrics
  avg_task_quality_score NUMERIC(5, 2) DEFAULT 0.00,
  rejection_count INTEGER DEFAULT 0,
  rejection_rate NUMERIC(5, 2) DEFAULT 0.00,

  -- Reputation
  reputation_score INTEGER DEFAULT 100, -- 0-200, starts at 100
  is_trusted_worker BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,

  -- Timestamps
  first_task_at TIMESTAMPTZ,
  last_task_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX idx_user_earnings_user ON user_micro_task_earnings(user_id);
CREATE INDEX idx_user_earnings_reputation ON user_micro_task_earnings(reputation_score DESC);
CREATE INDEX idx_user_earnings_trusted ON user_micro_task_earnings(is_trusted_worker) WHERE is_trusted_worker = true;

-- ============================================================================
-- PAYMENT TIERS REFERENCE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS micro_task_payment_tiers (
  id SERIAL PRIMARY KEY,
  tier_slug VARCHAR(50) UNIQUE NOT NULL,
  tier_name VARCHAR(100) NOT NULL,
  min_payment NUMERIC(10, 2) NOT NULL,
  max_payment NUMERIC(10, 2) NOT NULL,
  typical_duration_seconds INTEGER NOT NULL,
  description TEXT,
  examples TEXT[]
);

-- Seed payment tiers
INSERT INTO micro_task_payment_tiers (tier_slug, tier_name, min_payment, max_payment, typical_duration_seconds, description, examples) VALUES
('micro', 'Micro Task', 0.10, 0.50, 30,
 '30-second quick tasks like voting or simple choices',
 ARRAY['Vote on 5 app names', 'Rate 10 images', 'Answer yes/no poll']),

('quick', 'Quick Survey', 0.50, 2.00, 120,
 '1-2 minute voice or text surveys',
 ARRAY['Record 3 sentences about X', 'Answer 5 multiple choice', 'Describe your ideal Y']),

('standard', 'Standard Task', 2.00, 10.00, 600,
 '5-10 minute detailed tasks',
 ARRAY['Write 200 word review', 'Record 5 minute voice journal', 'Label 100 images']),

('premium', 'Premium Task', 10.00, 50.00, 1800,
 '15-30 minute expert tasks',
 ARRAY['Technical review', 'Code audit', 'Design feedback']),

('bounty', 'Bounty Task', 50.00, 5000.00, 86400,
 'Multi-day projects with deliverables',
 ARRAY['Build feature', 'Write documentation', 'Create tutorial series']);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Micro Tasks View
CREATE OR REPLACE VIEW active_micro_tasks AS
SELECT
  tt.id,
  tt.task_type,
  tt.payment_amount,
  tt.duration_limit_seconds,
  tt.estimated_time_seconds,
  tt.priority,
  tt.upvotes,
  tt.downvotes,
  tt.crowd_score,
  tt.status,
  tt.task_data,
  mt.template_name,
  mt.category,
  mt.difficulty
FROM training_tasks tt
LEFT JOIN micro_task_templates mt ON (tt.task_data->>'template_id')::INTEGER = mt.id
WHERE tt.is_micro_task = true
  AND tt.status = 'available'
  AND (tt.expires_at IS NULL OR tt.expires_at > NOW())
ORDER BY tt.payment_amount DESC, tt.priority DESC;

-- Contest Leaderboard View
CREATE OR REPLACE VIEW contest_leaderboards AS
SELECT
  c.id as contest_id,
  c.title as contest_title,
  c.status as contest_status,
  cs.id as submission_id,
  cs.user_id,
  cs.net_score,
  cs.rank_position,
  cs.prize_won,
  cs.status as submission_status,
  cs.submission_content,
  cs.created_at
FROM contests c
JOIN contest_submissions cs ON c.id = cs.contest_id
WHERE c.status IN ('voting', 'tallying', 'completed')
  AND cs.status != 'disqualified'
ORDER BY c.id DESC, cs.net_score DESC, cs.created_at ASC;

-- User Earnings Dashboard View
CREATE OR REPLACE VIEW user_earnings_dashboard AS
SELECT
  u.user_id,
  u.email,
  ue.total_tasks_completed,
  ue.total_earned,
  ue.total_pending,
  ue.total_paid_out,
  ue.reputation_score,
  ue.is_trusted_worker,
  ue.avg_task_quality_score,
  ue.rejection_rate,
  ue.voice_surveys_completed,
  ue.voice_surveys_earned,
  ue.votes_cast,
  ue.contest_winnings,
  ue.last_task_at
FROM users u
JOIN user_micro_task_earnings ue ON u.user_id = ue.user_id
ORDER BY ue.total_earned DESC;

-- Crowd Filtering Queue View
CREATE OR REPLACE VIEW crowd_filtering_queue AS
SELECT
  tt.id as task_id,
  tt.task_type,
  tt.payment_amount,
  tt.upvotes,
  tt.downvotes,
  tt.crowd_score,
  tt.auto_approval_threshold,
  tt.auto_rejection_threshold,
  CASE
    WHEN tt.crowd_score >= tt.auto_approval_threshold THEN 'auto_approve'
    WHEN tt.crowd_score <= tt.auto_rejection_threshold THEN 'auto_reject'
    ELSE 'needs_votes'
  END as recommended_action,
  tt.created_at
FROM training_tasks tt
WHERE tt.is_micro_task = true
  AND tt.status = 'available'
  AND (
    tt.crowd_score >= tt.auto_approval_threshold
    OR tt.crowd_score <= tt.auto_rejection_threshold
  )
ORDER BY ABS(tt.crowd_score) DESC;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update contest submission scores when votes change
CREATE OR REPLACE FUNCTION update_submission_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contest_submissions
  SET
    upvotes = (SELECT COUNT(*) FROM idea_votes WHERE votable_type = 'contest_submission' AND votable_id = NEW.votable_id AND vote_direction = 1),
    downvotes = (SELECT COUNT(*) FROM idea_votes WHERE votable_type = 'contest_submission' AND votable_id = NEW.votable_id AND vote_direction = -1),
    net_score = (SELECT SUM(vote_direction * vote_weight) FROM idea_votes WHERE votable_type = 'contest_submission' AND votable_id = NEW.votable_id),
    updated_at = NOW()
  WHERE id = NEW.votable_id AND NEW.votable_type = 'contest_submission';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_submission_score
AFTER INSERT OR UPDATE ON idea_votes
FOR EACH ROW
WHEN (NEW.votable_type = 'contest_submission')
EXECUTE FUNCTION update_submission_score();

-- Update training_tasks crowd scores when votes change
CREATE OR REPLACE FUNCTION update_task_crowd_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE training_tasks
  SET
    upvotes = (SELECT COUNT(*) FROM idea_votes WHERE votable_type = 'training_task' AND votable_id = NEW.votable_id AND vote_direction = 1),
    downvotes = (SELECT COUNT(*) FROM idea_votes WHERE votable_type = 'training_task' AND votable_id = NEW.votable_id AND vote_direction = -1),
    crowd_score = (SELECT COALESCE(SUM(vote_direction * vote_weight), 0) FROM idea_votes WHERE votable_type = 'training_task' AND votable_id = NEW.votable_id)
  WHERE id = NEW.votable_id AND NEW.votable_type = 'training_task';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_crowd_score
AFTER INSERT OR UPDATE ON idea_votes
FOR EACH ROW
WHEN (NEW.votable_type = 'training_task')
EXECUTE FUNCTION update_task_crowd_score();

-- Grant permissions
GRANT ALL PRIVILEGES ON contests TO matthewmauer;
GRANT ALL PRIVILEGES ON contest_submissions TO matthewmauer;
GRANT ALL PRIVILEGES ON idea_votes TO matthewmauer;
GRANT ALL PRIVILEGES ON micro_task_templates TO matthewmauer;
GRANT ALL PRIVILEGES ON user_micro_task_earnings TO matthewmauer;
GRANT ALL PRIVILEGES ON micro_task_payment_tiers TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE contests_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE contest_submissions_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE idea_votes_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE micro_task_templates_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE user_micro_task_earnings_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE micro_task_payment_tiers_id_seq TO matthewmauer;

-- Success indicator
SELECT 'Migration 144: Micro-Task Marketplace - Completed' as status;
