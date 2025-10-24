-- Migration 143: Voice Onboarding Drip Payment Milestones
-- Adds milestone-based payment system to prevent paying scammers upfront

-- Voice Onboarding Milestones Table
-- Tracks payment milestones for drip payment system
CREATE TABLE IF NOT EXISTS voice_onboarding_milestones (
  id SERIAL PRIMARY KEY,
  milestone_id INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  payment_amount NUMERIC(10, 2) NOT NULL,
  milestone_order INTEGER NOT NULL,

  -- Requirements for milestone completion
  requirements JSONB NOT NULL,  -- { minQualityScore: 70, requiresEasterHunt: true, requiresDeliverable: false }

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed the 5 milestone stages
INSERT INTO voice_onboarding_milestones (milestone_id, name, description, payment_amount, milestone_order, requirements) VALUES
(1, 'Survey Completion',
 'Complete all 10 voice questions',
 25.00,
 1,
 '{"minQualityScore": 0, "requiresEasterHunt": false, "requiresDeliverable": false, "minAnswerLength": 10}'::jsonb),

(2, 'Quality Threshold',
 'Achieve AI quality score above 70 across all answers',
 25.00,
 2,
 '{"minQualityScore": 70, "requiresEasterHunt": false, "requiresDeliverable": false, "minCoherence": 70}'::jsonb),

(3, 'Easter Hunt Match',
 'Get matched to at least one active easter hunt opportunity',
 25.00,
 3,
 '{"minQualityScore": 70, "requiresEasterHunt": true, "requiresDeliverable": false, "minMatchScore": 60}'::jsonb),

(4, 'First Deliverable',
 'Submit and get approval for first GitHub PR or design deliverable',
 50.00,
 4,
 '{"minQualityScore": 70, "requiresEasterHunt": true, "requiresDeliverable": true, "minDeliverableQuality": 60}'::jsonb),

(5, 'Second Deliverable',
 'Submit and get approval for second deliverable (proves consistency)',
 50.00,
 5,
 '{"minQualityScore": 70, "requiresEasterHunt": true, "requiresDeliverable": true, "minDeliverableQuality": 70, "requiresConsistency": true}'::jsonb);

CREATE INDEX idx_voice_milestones_order ON voice_onboarding_milestones(milestone_order);

-- User Milestone Progress Table
-- Tracks which milestones each user has completed
CREATE TABLE IF NOT EXISTS voice_onboarding_user_milestones (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  milestone_id INTEGER NOT NULL REFERENCES voice_onboarding_milestones(milestone_id),

  -- Completion status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'under_review'
  completed_at TIMESTAMP,

  -- Payment tracking
  payment_amount NUMERIC(10, 2) NOT NULL,
  payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'rejected'
  payment_transaction_id VARCHAR(255),
  paid_at TIMESTAMP,

  -- Evidence/verification
  evidence JSONB DEFAULT '{}', -- { deliverableUrl, githubPR, qualityScore, matchScore }
  reviewer_notes TEXT,
  auto_approved BOOLEAN DEFAULT false,

  -- Timestamps
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_milestone_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE,
  UNIQUE(session_id, milestone_id)
);

CREATE INDEX idx_user_milestones_session ON voice_onboarding_user_milestones(session_id);
CREATE INDEX idx_user_milestones_status ON voice_onboarding_user_milestones(status);
CREATE INDEX idx_user_milestones_payment_status ON voice_onboarding_user_milestones(payment_status);
CREATE INDEX idx_user_milestones_completed ON voice_onboarding_user_milestones(completed_at DESC);

-- Fraud Detection Flags Table
-- Tracks suspicious patterns and auto-rejection reasons
CREATE TABLE IF NOT EXISTS voice_onboarding_fraud_flags (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,

  -- Fraud detection results
  flag_type VARCHAR(100) NOT NULL, -- 'short_answers', 'repeated_content', 'low_confidence', 'spam_keywords', 'duplicate_voice', 'rushed_completion'
  severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  confidence NUMERIC(5, 2) NOT NULL, -- 0-100% confidence in fraud detection

  -- Details
  details JSONB NOT NULL, -- { avgAnswerLength: 15, repeatedAnswers: 3, spamKeywords: ['...'] }
  auto_rejected BOOLEAN DEFAULT false,

  -- Review
  reviewed_by VARCHAR(255),
  reviewer_decision VARCHAR(50), -- 'confirmed_fraud', 'false_positive', 'pending_review'
  reviewed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_fraud_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_fraud_flags_session ON voice_onboarding_fraud_flags(session_id);
CREATE INDEX idx_fraud_flags_severity ON voice_onboarding_fraud_flags(severity, auto_rejected);
CREATE INDEX idx_fraud_flags_type ON voice_onboarding_fraud_flags(flag_type);

-- AI Evaluation Scores Table
-- Stores AI-generated quality scores for each session
CREATE TABLE IF NOT EXISTS voice_onboarding_ai_scores (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL UNIQUE,

  -- Overall scores
  overall_quality_score INTEGER NOT NULL, -- 0-100
  coherence_score INTEGER NOT NULL, -- 0-100
  specificity_score INTEGER NOT NULL, -- 0-100
  passion_score INTEGER NOT NULL, -- 0-100
  viability_score INTEGER NOT NULL, -- 0-100
  feasibility_score INTEGER NOT NULL, -- 0-100

  -- Per-question breakdown
  question_scores JSONB NOT NULL, -- { "1": { quality: 85, coherence: 90, ... }, "2": {...}, ... }

  -- AI analysis
  ai_summary TEXT, -- Natural language summary from AI
  key_strengths TEXT[], -- ["Clear problem definition", "Strong technical knowledge"]
  improvement_areas TEXT[], -- ["Needs more market research", "Vague monetization"]

  -- Recommendation
  recommendation VARCHAR(50) NOT NULL, -- 'auto_approve', 'human_review', 'auto_reject'
  recommendation_confidence NUMERIC(5, 2) NOT NULL, -- 0-100%

  -- Model metadata
  model_version VARCHAR(100),
  evaluated_by VARCHAR(100), -- 'claude-3.5', 'gpt-4', 'cal-agent'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_ai_score_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_scores_overall ON voice_onboarding_ai_scores(overall_quality_score DESC);
CREATE INDEX idx_ai_scores_recommendation ON voice_onboarding_ai_scores(recommendation);

-- Deliverables Table
-- Tracks work submitted for milestone 4 & 5
CREATE TABLE IF NOT EXISTS voice_onboarding_deliverables (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  milestone_id INTEGER NOT NULL,
  deliverable_number INTEGER NOT NULL, -- 1 or 2

  -- Deliverable details
  deliverable_type VARCHAR(100) NOT NULL, -- 'github_pr', 'design', 'document', 'video'
  deliverable_url TEXT NOT NULL,
  github_pr_number INTEGER,
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Evaluation
  quality_score INTEGER, -- 0-100 (manual or AI review)
  status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'under_review', 'approved', 'rejected', 'needs_revision'
  reviewer_feedback TEXT,

  -- Timestamps
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  approved_at TIMESTAMP,

  CONSTRAINT fk_deliverable_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_deliverable_milestone FOREIGN KEY (milestone_id)
    REFERENCES voice_onboarding_milestones(milestone_id),
  UNIQUE(session_id, milestone_id, deliverable_number)
);

CREATE INDEX idx_deliverables_session ON voice_onboarding_deliverables(session_id);
CREATE INDEX idx_deliverables_status ON voice_onboarding_deliverables(status);
CREATE INDEX idx_deliverables_submitted ON voice_onboarding_deliverables(submitted_at DESC);

-- Update voice_onboarding_sessions to track milestone progress
ALTER TABLE voice_onboarding_sessions
  ADD COLUMN IF NOT EXISTS current_milestone_id INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS milestones_completed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS payment_tier VARCHAR(50) DEFAULT 'standard', -- 'standard', 'fast_track', 'top_performer'
  ADD COLUMN IF NOT EXISTS fraud_risk_level VARCHAR(20) DEFAULT 'unknown', -- 'low', 'medium', 'high', 'critical', 'unknown'
  ADD COLUMN IF NOT EXISTS auto_evaluation_status VARCHAR(50) DEFAULT 'pending'; -- 'pending', 'in_progress', 'completed', 'failed'

CREATE INDEX idx_voice_sessions_milestone ON voice_onboarding_sessions(current_milestone_id);
CREATE INDEX idx_voice_sessions_fraud_risk ON voice_onboarding_sessions(fraud_risk_level);
CREATE INDEX idx_voice_sessions_evaluation_status ON voice_onboarding_sessions(auto_evaluation_status);

-- Views

-- Milestone Progress Dashboard View
CREATE OR REPLACE VIEW voice_onboarding_milestone_dashboard AS
SELECT
  vos.session_id,
  vos.email,
  vos.username,
  vos.current_milestone_id,
  vos.milestones_completed,
  vos.total_paid,
  vos.total_reward,
  vos.fraud_risk_level,
  vos.detected_archetype,
  vos.detected_brand_domain,
  COUNT(DISTINCT voum.id) as milestones_attempted,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.status = 'completed') as milestones_completed_count,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.payment_status = 'paid') as milestones_paid_count,
  COUNT(DISTINCT voff.id) as fraud_flags_count,
  voas.overall_quality_score,
  voas.recommendation,
  vos.completed_at
FROM voice_onboarding_sessions vos
LEFT JOIN voice_onboarding_user_milestones voum ON vos.session_id = voum.session_id
LEFT JOIN voice_onboarding_fraud_flags voff ON vos.session_id = voff.session_id
LEFT JOIN voice_onboarding_ai_scores voas ON vos.session_id = voas.session_id
GROUP BY vos.session_id, voas.overall_quality_score, voas.recommendation;

-- Payment Analytics View
CREATE OR REPLACE VIEW voice_onboarding_payment_analytics_v2 AS
SELECT
  COUNT(DISTINCT vos.session_id) as total_sessions,
  COUNT(DISTINCT vos.session_id) FILTER (WHERE vos.status = 'completed') as completed_sessions,
  SUM(vos.total_paid) as total_paid_out,
  AVG(vos.total_paid) as avg_paid_per_session,

  -- Milestone breakdown
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.milestone_id = 1 AND voum.payment_status = 'paid') as milestone_1_paid,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.milestone_id = 2 AND voum.payment_status = 'paid') as milestone_2_paid,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.milestone_id = 3 AND voum.payment_status = 'paid') as milestone_3_paid,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.milestone_id = 4 AND voum.payment_status = 'paid') as milestone_4_paid,
  COUNT(DISTINCT voum.id) FILTER (WHERE voum.milestone_id = 5 AND voum.payment_status = 'paid') as milestone_5_paid,

  -- Fraud statistics
  COUNT(DISTINCT vos.session_id) FILTER (WHERE vos.fraud_risk_level = 'high' OR vos.fraud_risk_level = 'critical') as high_risk_sessions,
  COUNT(DISTINCT voff.session_id) FILTER (WHERE voff.auto_rejected = true) as auto_rejected_sessions,

  -- Quality statistics
  AVG(voas.overall_quality_score)::INTEGER as avg_quality_score,
  COUNT(DISTINCT vos.session_id) FILTER (WHERE voas.recommendation = 'auto_approve') as auto_approved_sessions,
  COUNT(DISTINCT vos.session_id) FILTER (WHERE voas.recommendation = 'human_review') as needs_review_sessions
FROM voice_onboarding_sessions vos
LEFT JOIN voice_onboarding_user_milestones voum ON vos.session_id = voum.session_id
LEFT JOIN voice_onboarding_fraud_flags voff ON vos.session_id = voff.session_id
LEFT JOIN voice_onboarding_ai_scores voas ON vos.session_id = voas.session_id;

-- Fraud Detection Dashboard View
CREATE OR REPLACE VIEW voice_onboarding_fraud_dashboard AS
SELECT
  voff.session_id,
  vos.email,
  vos.username,
  voff.flag_type,
  voff.severity,
  voff.confidence,
  voff.details,
  voff.auto_rejected,
  voff.reviewer_decision,
  voas.overall_quality_score,
  vos.fraud_risk_level,
  vos.total_reward,
  vos.total_paid,
  voff.created_at,
  voff.reviewed_at
FROM voice_onboarding_fraud_flags voff
JOIN voice_onboarding_sessions vos ON voff.session_id = vos.session_id
LEFT JOIN voice_onboarding_ai_scores voas ON vos.session_id = voas.session_id
WHERE voff.severity IN ('high', 'critical') OR voff.auto_rejected = true
ORDER BY voff.created_at DESC;

-- Human Review Queue View
-- Sessions that need manual review
CREATE OR REPLACE VIEW voice_onboarding_review_queue AS
SELECT
  vos.session_id,
  vos.email,
  vos.username,
  vos.questions_completed,
  vos.detected_archetype,
  voas.overall_quality_score,
  voas.recommendation,
  voas.recommendation_confidence,
  voas.key_strengths,
  voas.improvement_areas,
  COUNT(DISTINCT voff.id) as fraud_flags_count,
  COUNT(DISTINCT ehm.id) as easter_hunt_matches_count,
  vos.completed_at
FROM voice_onboarding_sessions vos
LEFT JOIN voice_onboarding_ai_scores voas ON vos.session_id = voas.session_id
LEFT JOIN voice_onboarding_fraud_flags voff ON vos.session_id = voff.session_id
LEFT JOIN easter_hunt_matches ehm ON vos.session_id = ehm.session_id
WHERE
  vos.status = 'completed'
  AND (
    voas.recommendation = 'human_review'
    OR (voas.overall_quality_score >= 40 AND voas.overall_quality_score < 70)
    OR EXISTS (SELECT 1 FROM voice_onboarding_fraud_flags WHERE session_id = vos.session_id AND reviewer_decision IS NULL)
  )
GROUP BY vos.session_id, voas.overall_quality_score, voas.recommendation,
  voas.recommendation_confidence, voas.key_strengths, voas.improvement_areas
ORDER BY vos.completed_at DESC;

-- Update trigger for voice_onboarding_user_milestones
CREATE OR REPLACE FUNCTION update_milestone_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_milestone_timestamp
BEFORE UPDATE ON voice_onboarding_user_milestones
FOR EACH ROW
EXECUTE FUNCTION update_milestone_timestamp();

-- Grant permissions
GRANT ALL PRIVILEGES ON voice_onboarding_milestones TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_user_milestones TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_fraud_flags TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_ai_scores TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_deliverables TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_milestones_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_user_milestones_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_fraud_flags_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_ai_scores_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_deliverables_id_seq TO matthewmauer;

-- Success indicator
SELECT 'Migration 143: Voice Onboarding Drip Payment Milestones - Completed' as status;
