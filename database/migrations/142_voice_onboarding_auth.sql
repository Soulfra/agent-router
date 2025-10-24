-- Migration 142: Voice Onboarding Auth System
-- Unifies voice transcription + personality profiling + authentication
-- Progressive 10-question voice questionnaire ($175 total reward)

-- Voice Onboarding Sessions Table
-- Tracks each user's voice onboarding journey
CREATE TABLE IF NOT EXISTS voice_onboarding_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL UNIQUE,

  -- User identification
  email VARCHAR(255),
  username VARCHAR(100),

  -- Progress tracking
  current_question INTEGER DEFAULT 1,              -- Current question ID (1-10)
  total_questions INTEGER DEFAULT 10,
  questions_completed INTEGER DEFAULT 0,

  -- Personality & brand analysis
  detected_archetype VARCHAR(50),                  -- creator, visionary, analyst, maverick, caregiver, connector, explorer, sage
  archetype_scores JSONB DEFAULT '{}',             -- { "creator": 15, "visionary": 8, ... }
  detected_brand_domain VARCHAR(255),              -- soulfra.com, deathtodata.com, calriven.com, calos.ai
  interest_keywords TEXT[],                        -- Extracted keywords from answers

  -- Easter hunt matching
  easter_hunt_matches JSONB DEFAULT '[]',          -- Array of matching opportunities
  easter_hunt_score INTEGER DEFAULT 0,             -- Overall match score

  -- Voice biometric
  voice_signature TEXT,                            -- SHA-256 hash of voice embeddings (placeholder for now)
  voice_confidence NUMERIC(5, 2),                  -- Confidence score for voice matching

  -- Rewards & payment
  total_reward NUMERIC(10, 2) DEFAULT 0.00,        -- Total earned ($175 max)
  payout_status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'approved', 'paid'
  payout_method VARCHAR(100),                      -- Venmo, PayPal, crypto address

  -- Status
  status VARCHAR(50) DEFAULT 'active',             -- 'active', 'completed', 'abandoned'
  completion_percentage INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_voice_onboarding_sessions_session_id ON voice_onboarding_sessions(session_id);
CREATE INDEX idx_voice_onboarding_sessions_email ON voice_onboarding_sessions(email);
CREATE INDEX idx_voice_onboarding_sessions_status ON voice_onboarding_sessions(status);
CREATE INDEX idx_voice_onboarding_sessions_archetype ON voice_onboarding_sessions(detected_archetype);
CREATE INDEX idx_voice_onboarding_sessions_payout_status ON voice_onboarding_sessions(payout_status);

-- Voice Onboarding Answers Table
-- Stores individual voice answers with transcripts and analysis
CREATE TABLE IF NOT EXISTS voice_onboarding_answers (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  question_id INTEGER NOT NULL,                    -- 1-10

  -- Question context
  question_level INTEGER NOT NULL,                 -- 1 (5yo), 2 (10yo), 3 (10yo), 4 (15yo), 5 (Enterprise)
  question_age_level VARCHAR(50) NOT NULL,         -- "5 years old", "10 years old", etc.
  question_text TEXT NOT NULL,
  question_category VARCHAR(100) NOT NULL,         -- 'identity', 'problem', 'values', 'business', 'vision'

  -- Audio recording
  audio_path TEXT NOT NULL,                        -- Path to stored audio file
  audio_format VARCHAR(20) DEFAULT 'webm',         -- webm, mp3, wav, etc.
  duration_seconds NUMERIC(5, 2) NOT NULL,         -- Actual recording duration

  -- Transcription
  transcript TEXT NOT NULL,                        -- Full text transcript from Whisper
  confidence_score NUMERIC(5, 2),                  -- Transcription confidence

  -- Analysis
  analysis JSONB NOT NULL,                         -- { keywords: [], sentiment: "", archetypeSignals: [], brandDomainHints: [] }
  quality_score INTEGER,                           -- 1-100 based on depth/thoughtfulness

  -- Rewards
  reward NUMERIC(10, 2) NOT NULL,                  -- Payment for this answer

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_voice_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE,
  UNIQUE(session_id, question_id)
);

CREATE INDEX idx_voice_onboarding_answers_session ON voice_onboarding_answers(session_id);
CREATE INDEX idx_voice_onboarding_answers_question ON voice_onboarding_answers(question_id);
CREATE INDEX idx_voice_onboarding_answers_quality ON voice_onboarding_answers(quality_score DESC);
CREATE INDEX idx_voice_onboarding_answers_created ON voice_onboarding_answers(created_at DESC);

-- Voice Onboarding Questions Reference Table
-- Defines the 10 progressive questions
CREATE TABLE IF NOT EXISTS voice_onboarding_questions (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL UNIQUE,             -- 1-10
  level INTEGER NOT NULL,                          -- 1-5 (complexity level)
  age_level VARCHAR(50) NOT NULL,                  -- "5 years old", "10 years old", "15 years old", "Enterprise"

  question_text TEXT NOT NULL,
  guidance_text TEXT,                              -- Additional context/help

  -- Constraints
  min_duration INTEGER DEFAULT 5,                  -- Minimum seconds
  max_duration INTEGER DEFAULT 60,                 -- Maximum seconds

  -- Rewards
  reward NUMERIC(10, 2) NOT NULL,                  -- Payment for answering

  -- Categorization
  category VARCHAR(100) NOT NULL,                  -- 'identity', 'problem', 'values', 'business', 'vision'

  -- Analysis hints
  archetype_signals JSONB DEFAULT '{}',            -- Keywords to look for per archetype
  brand_domain_signals JSONB DEFAULT '{}',         -- Keywords to look for per domain

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_voice_onboarding_questions_id ON voice_onboarding_questions(question_id);
CREATE INDEX idx_voice_onboarding_questions_level ON voice_onboarding_questions(level);

-- Seed the 10 progressive questions
INSERT INTO voice_onboarding_questions (question_id, level, age_level, question_text, guidance_text, min_duration, max_duration, reward, category, archetype_signals, brand_domain_signals) VALUES

-- Level 1: 5 years old (Simple)
(1, 1, '5 years old',
 'What''s your name and what do you want to build?',
 'Just tell me your name and what cool thing you want to make!',
 5, 15, 5.00, 'identity',
 '{"creator": ["build", "create", "make"], "visionary": ["change", "new"], "analyst": ["solve", "figure out"]}'::jsonb,
 '{"soulfra.com": ["privacy", "security"], "deathtodata.com": ["data"], "calriven.com": ["ai", "robot"]}'::jsonb),

(2, 1, '5 years old',
 'Who do you want to help?',
 'Tell me about the people your idea will help!',
 5, 20, 10.00, 'identity',
 '{"caregiver": ["help", "support", "care"], "connector": ["people", "community"], "explorer": ["everyone", "world"]}'::jsonb,
 '{"soulfra.com": ["families", "individuals"], "deathtodata.com": ["victims", "affected"], "calriven.com": ["developers", "businesses"]}'::jsonb),

-- Level 2: 10 years old (Getting specific)
(3, 2, '10 years old',
 'What problem are you solving?',
 'Describe the specific problem you''re trying to fix.',
 10, 30, 15.00, 'problem',
 '{"analyst": ["problem", "issue", "challenge"], "visionary": ["broken", "wrong"], "maverick": ["unfair", "corrupt"]}'::jsonb,
 '{"soulfra.com": ["surveillance", "tracking", "spying"], "deathtodata.com": ["brokers", "selling data"], "calriven.com": ["expensive", "slow", "complex"]}'::jsonb),

(4, 2, '10 years old',
 'Why does this problem matter?',
 'Explain why solving this is important.',
 10, 30, 20.00, 'problem',
 '{"caregiver": ["hurting", "suffering"], "visionary": ["future", "impact"], "sage": ["understand", "truth"]}'::jsonb,
 '{"soulfra.com": ["rights", "freedom"], "deathtodata.com": ["control", "ownership"], "calriven.com": ["efficiency", "innovation"]}'::jsonb),

-- Level 3: 10 years old (Values)
(5, 3, '10 years old',
 'What values are important to you?',
 'Tell me about the principles that guide you.',
 10, 30, 25.00, 'values',
 '{"sage": ["truth", "wisdom", "learning"], "maverick": ["freedom", "independence"], "caregiver": ["kindness", "compassion"]}'::jsonb,
 '{"soulfra.com": ["privacy", "autonomy", "consent"], "deathtodata.com": ["transparency", "fairness"], "calriven.com": ["innovation", "openness"]}'::jsonb),

-- Level 4: 15 years old (Business thinking)
(6, 4, '15 years old',
 'How will you make money?',
 'Describe your business model or revenue strategy.',
 15, 45, 30.00, 'business',
 '{"analyst": ["revenue", "model", "pricing"], "creator": ["sell", "service"], "connector": ["network", "platform"]}'::jsonb,
 '{"soulfra.com": ["subscription", "premium"], "deathtodata.com": ["opt-out service", "removal"], "calriven.com": ["api", "usage-based"]}'::jsonb),

(7, 4, '15 years old',
 'What makes you different from competitors?',
 'Explain your unique advantage or differentiation.',
 15, 45, 30.00, 'business',
 '{"visionary": ["first", "only", "different"], "maverick": ["disrupt", "challenge"], "explorer": ["new approach", "unique"]}'::jsonb,
 '{"soulfra.com": ["zero-knowledge", "local-first"], "deathtodata.com": ["comprehensive", "automated"], "calriven.com": ["faster", "cheaper", "simpler"]}'::jsonb),

-- Level 5: Enterprise (Strategic thinking)
(8, 5, 'Enterprise',
 'Describe your go-to-market strategy',
 'How will you acquire customers and scale?',
 20, 60, 25.00, 'business',
 '{"analyst": ["funnel", "channels", "metrics"], "connector": ["partnerships", "community"], "creator": ["content", "inbound"]}'::jsonb,
 '{"soulfra.com": ["word-of-mouth", "viral"], "deathtodata.com": ["seo", "paid ads"], "calriven.com": ["developer relations", "docs"]}'::jsonb),

(9, 5, 'Enterprise',
 'What are your 1-year and 5-year goals?',
 'Share your short-term and long-term vision.',
 20, 60, 10.00, 'vision',
 '{"visionary": ["transform", "revolutionize"], "explorer": ["discover", "expand"], "sage": ["master", "understand"]}'::jsonb,
 '{"soulfra.com": ["millions of users", "default choice"], "deathtodata.com": ["industry standard"], "calriven.com": ["platform", "ecosystem"]}'::jsonb),

(10, 5, 'Enterprise',
 'Why will this matter in 10 years?',
 'Explain the lasting impact of your vision.',
 15, 60, 5.00, 'vision',
 '{"visionary": ["legacy", "change the world"], "sage": ["lasting", "fundamental"], "explorer": ["frontier", "pioneer"]}'::jsonb,
 '{"soulfra.com": ["human rights", "democracy"], "deathtodata.com": ["data ownership"], "calriven.com": ["ai revolution", "automation"]}'::jsonb);

-- Voice Biometric Signatures Table (Future: Real voice embeddings)
-- Currently using transcript hash as placeholder
CREATE TABLE IF NOT EXISTS voice_biometric_signatures (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,

  -- Voice characteristics (placeholder)
  voice_signature_hash TEXT NOT NULL,              -- SHA-256 hash of voice data
  voice_embedding JSONB,                           -- Future: Actual voice embeddings [0.123, 0.456, ...]

  -- Matching metadata
  confidence_score NUMERIC(5, 2),
  sample_count INTEGER DEFAULT 0,                  -- Number of voice samples collected

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_voice_biometric_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_voice_biometric_session ON voice_biometric_signatures(session_id);
CREATE INDEX idx_voice_biometric_hash ON voice_biometric_signatures(voice_signature_hash);

-- Easter Hunt Opportunities Table
-- Defines available opportunities for matching
CREATE TABLE IF NOT EXISTS easter_hunt_opportunities (
  id SERIAL PRIMARY KEY,
  hunt_id VARCHAR(100) NOT NULL UNIQUE,

  -- Opportunity details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  domain VARCHAR(255) NOT NULL,                    -- soulfra.com, etc.

  -- Requirements
  required_archetypes TEXT[],                      -- ["creator", "analyst"]
  required_keywords TEXT[],                        -- ["ai", "privacy", "security"]
  required_skills TEXT[],                          -- ["python", "react", "postgres"]

  -- Rewards
  bounty NUMERIC(10, 2),
  equity_percentage NUMERIC(5, 2),

  -- Status
  status VARCHAR(50) DEFAULT 'active',             -- 'active', 'filled', 'paused'
  slots_available INTEGER DEFAULT 1,
  slots_filled INTEGER DEFAULT 0,

  -- Metadata
  difficulty VARCHAR(50),                          -- 'beginner', 'intermediate', 'advanced', 'expert'
  time_commitment VARCHAR(100),                    -- '5 hours/week', 'full-time', etc.

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_easter_hunt_opportunities_domain ON easter_hunt_opportunities(domain);
CREATE INDEX idx_easter_hunt_opportunities_status ON easter_hunt_opportunities(status);

-- Easter Hunt Matches Table
-- Tracks matches between users and opportunities
CREATE TABLE IF NOT EXISTS easter_hunt_matches (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  hunt_id VARCHAR(100) NOT NULL,

  -- Match scoring
  match_score INTEGER NOT NULL,                    -- 0-100
  match_reasons TEXT[],                            -- Why this is a good match

  -- Status
  status VARCHAR(50) DEFAULT 'suggested',          -- 'suggested', 'interested', 'applied', 'accepted', 'rejected'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_easter_hunt_match_session FOREIGN KEY (session_id)
    REFERENCES voice_onboarding_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_easter_hunt_match_opportunity FOREIGN KEY (hunt_id)
    REFERENCES easter_hunt_opportunities(hunt_id) ON DELETE CASCADE,
  UNIQUE(session_id, hunt_id)
);

CREATE INDEX idx_easter_hunt_matches_session ON easter_hunt_matches(session_id);
CREATE INDEX idx_easter_hunt_matches_hunt ON easter_hunt_matches(hunt_id);
CREATE INDEX idx_easter_hunt_matches_score ON easter_hunt_matches(match_score DESC);
CREATE INDEX idx_easter_hunt_matches_status ON easter_hunt_matches(status);

-- Seed some example easter hunt opportunities
INSERT INTO easter_hunt_opportunities (hunt_id, name, description, domain, required_archetypes, required_keywords, required_skills, bounty, difficulty, time_commitment) VALUES
('ai-agent-builder', 'AI Agent Builder Challenge', 'Build autonomous AI agents for Cal orchestrator', 'calriven.com',
 ARRAY['creator', 'analyst'], ARRAY['ai', 'automation', 'agents'], ARRAY['python', 'nodejs'], 500.00, 'intermediate', '10 hours/week'),

('privacy-guardian', 'Privacy Guardian Project', 'Build browser extension to block surveillance trackers', 'soulfra.com',
 ARRAY['maverick', 'creator'], ARRAY['privacy', 'security', 'tracking'], ARRAY['javascript', 'chrome-extension'], 750.00, 'advanced', '15 hours/week'),

('data-broker-hunter', 'Data Broker Hunter', 'Automate opt-out requests for data brokers', 'deathtodata.com',
 ARRAY['maverick', 'analyst'], ARRAY['data broker', 'opt out', 'automation'], ARRAY['python', 'web-scraping'], 1000.00, 'advanced', '20 hours/week'),

('lofi-streaming', 'Lofi Streaming Engine', 'Improve real-time audio streaming system', 'calos.ai',
 ARRAY['creator', 'explorer'], ARRAY['audio', 'streaming', 'websockets'], ARRAY['nodejs', 'webrtc'], 400.00, 'intermediate', '8 hours/week'),

('gmail-webhook', 'Gmail Webhook System', 'Zero-cost email relay alternative to Mailchimp', 'calos.ai',
 ARRAY['creator', 'analyst'], ARRAY['email', 'automation', 'api'], ARRAY['nodejs', 'google-api'], 600.00, 'intermediate', '12 hours/week');

-- Views

-- Voice Onboarding Progress View
CREATE OR REPLACE VIEW voice_onboarding_progress AS
SELECT
  vos.session_id,
  vos.email,
  vos.username,
  vos.current_question,
  vos.questions_completed,
  vos.completion_percentage,
  vos.detected_archetype,
  vos.detected_brand_domain,
  vos.total_reward,
  vos.status,
  COUNT(voa.id) as answers_submitted,
  AVG(voa.quality_score) as avg_quality_score,
  vos.started_at,
  vos.completed_at
FROM voice_onboarding_sessions vos
LEFT JOIN voice_onboarding_answers voa ON vos.session_id = voa.session_id
GROUP BY vos.session_id;

-- Voice Onboarding Leaderboard View
CREATE OR REPLACE VIEW voice_onboarding_leaderboard AS
SELECT
  vos.session_id,
  vos.username,
  vos.detected_archetype,
  vos.completion_percentage,
  vos.total_reward,
  COUNT(voa.id) as total_answers,
  AVG(voa.quality_score) as avg_quality,
  vos.easter_hunt_score,
  vos.completed_at
FROM voice_onboarding_sessions vos
LEFT JOIN voice_onboarding_answers voa ON vos.session_id = voa.session_id
WHERE vos.status = 'completed'
GROUP BY vos.session_id
ORDER BY vos.completion_percentage DESC, vos.total_reward DESC, vos.completed_at ASC
LIMIT 100;

-- Easter Hunt Match Opportunities View
CREATE OR REPLACE VIEW easter_hunt_match_opportunities AS
SELECT
  vos.session_id,
  vos.username,
  vos.detected_archetype,
  vos.interest_keywords,
  eho.hunt_id,
  eho.name as opportunity_name,
  eho.domain,
  eho.bounty,
  ehm.match_score,
  ehm.match_reasons,
  ehm.status as match_status
FROM voice_onboarding_sessions vos
JOIN easter_hunt_matches ehm ON vos.session_id = ehm.session_id
JOIN easter_hunt_opportunities eho ON ehm.hunt_id = eho.hunt_id
WHERE eho.status = 'active'
ORDER BY ehm.match_score DESC;

-- Payment Analytics View
CREATE OR REPLACE VIEW voice_onboarding_payment_analytics AS
SELECT
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
  COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
  COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned_sessions,
  SUM(total_reward) as total_rewards_earned,
  AVG(total_reward) as avg_reward_per_session,
  SUM(total_reward) FILTER (WHERE payout_status = 'pending') as pending_payouts,
  SUM(total_reward) FILTER (WHERE payout_status = 'approved') as approved_payouts,
  SUM(total_reward) FILTER (WHERE payout_status = 'paid') as paid_payouts,
  COUNT(*) FILTER (WHERE total_reward >= 175.00) as max_reward_sessions
FROM voice_onboarding_sessions;

-- Update trigger for voice_onboarding_sessions.last_activity
CREATE OR REPLACE FUNCTION update_voice_onboarding_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_voice_onboarding_last_activity
BEFORE UPDATE ON voice_onboarding_sessions
FOR EACH ROW
EXECUTE FUNCTION update_voice_onboarding_last_activity();

-- Grant permissions
GRANT ALL PRIVILEGES ON voice_onboarding_sessions TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_answers TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_onboarding_questions TO matthewmauer;
GRANT ALL PRIVILEGES ON voice_biometric_signatures TO matthewmauer;
GRANT ALL PRIVILEGES ON easter_hunt_opportunities TO matthewmauer;
GRANT ALL PRIVILEGES ON easter_hunt_matches TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_sessions_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_answers_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_onboarding_questions_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE voice_biometric_signatures_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE easter_hunt_opportunities_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE easter_hunt_matches_id_seq TO matthewmauer;

-- Success indicator
SELECT 'Migration 142: Voice Onboarding Auth System - Completed' as status;
