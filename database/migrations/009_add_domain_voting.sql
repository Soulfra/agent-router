-- Migration 009: Domain Voting & Crypto Payment System
-- Tinder-style voting on Matthew Mauer's domain portfolio
-- Users get paid in USDC for opinions

-- Domain Votes Table
-- Track swipes (like/dislike) on each domain
CREATE TABLE IF NOT EXISTS domain_votes (
  vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,

  -- User/Session tracking
  session_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255),              -- Ethereum/Polygon wallet
  user_ip VARCHAR(50),                      -- For anti-spam

  -- Vote data
  vote_direction VARCHAR(10) NOT NULL CHECK (vote_direction IN ('like', 'dislike')),
  vote_strength INT DEFAULT 5,              -- 1-10 scale (optional)

  -- Payment tracking
  reward_amount NUMERIC(10, 6) DEFAULT 0.25, -- USDC amount earned
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP,
  transaction_hash VARCHAR(255),             -- Blockchain tx hash

  -- Metadata
  referrer_code VARCHAR(50),                 -- Referral tracking
  device_type VARCHAR(50),                   -- mobile, desktop

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_domain_votes_domain ON domain_votes(domain_id);
CREATE INDEX idx_domain_votes_session ON domain_votes(session_id);
CREATE INDEX idx_domain_votes_wallet ON domain_votes(wallet_address);
CREATE INDEX idx_domain_votes_paid ON domain_votes(paid);
CREATE INDEX idx_domain_votes_created ON domain_votes(created_at DESC);

-- Domain Feedback Table
-- Detailed text feedback (earns bonus payment)
CREATE TABLE IF NOT EXISTS domain_feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,
  vote_id UUID REFERENCES domain_votes(vote_id) ON DELETE SET NULL,

  -- User/Session
  session_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255),

  -- Feedback data
  feedback_text TEXT NOT NULL,
  feedback_category VARCHAR(50),             -- 'positive', 'negative', 'suggestion', 'question'
  sentiment_score NUMERIC(3, 2),             -- -1.00 to 1.00 (AI-generated)
  word_count INT,

  -- Payment
  reward_amount NUMERIC(10, 6) DEFAULT 2.00, -- Bonus for detailed feedback
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP,
  transaction_hash VARCHAR(255),

  -- Quality scoring
  quality_score INT,                         -- 1-100
  is_spam BOOLEAN DEFAULT FALSE,
  flagged BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_domain_feedback_domain ON domain_feedback(domain_id);
CREATE INDEX idx_domain_feedback_session ON domain_feedback(session_id);
CREATE INDEX idx_domain_feedback_wallet ON domain_feedback(wallet_address);
CREATE INDEX idx_domain_feedback_paid ON domain_feedback(paid);
CREATE INDEX idx_domain_feedback_quality ON domain_feedback(quality_score DESC);

-- Crypto Payments Table
-- Track all USDC payments
CREATE TABLE IF NOT EXISTS crypto_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient
  wallet_address VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),

  -- Payment details
  amount_usdc NUMERIC(10, 6) NOT NULL,
  payment_type VARCHAR(50) NOT NULL,        -- 'vote', 'feedback', 'referral', 'bonus'
  payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

  -- Blockchain details
  network VARCHAR(50) DEFAULT 'polygon',     -- 'ethereum', 'polygon', 'base'
  transaction_hash VARCHAR(255),
  block_number BIGINT,
  gas_fee NUMERIC(18, 9),

  -- Related records
  related_vote_ids UUID[],
  related_feedback_ids UUID[],

  -- Metadata
  payment_method VARCHAR(50) DEFAULT 'direct', -- 'direct', 'batch', 'weekly'
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_crypto_payments_wallet ON crypto_payments(wallet_address);
CREATE INDEX idx_crypto_payments_status ON crypto_payments(payment_status);
CREATE INDEX idx_crypto_payments_created ON crypto_payments(created_at DESC);
CREATE INDEX idx_crypto_payments_tx ON crypto_payments(transaction_hash);

-- Domain Claims Table
-- Users can "claim" domains to configure
CREATE TABLE IF NOT EXISTS domain_claims (
  claim_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,

  -- Claimer info
  wallet_address VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  email VARCHAR(255),

  -- Claim details
  claim_reason TEXT,                        -- Why they want to configure this domain
  proposed_use TEXT,                        -- What they plan to do with it

  -- Status
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'approved', 'active', 'rejected'
  approved_by VARCHAR(255),                 -- Admin who approved
  approved_at TIMESTAMP,

  -- Configuration
  has_hosting BOOLEAN DEFAULT FALSE,
  hosting_provider VARCHAR(100),
  has_ssl BOOLEAN DEFAULT FALSE,
  custom_domain VARCHAR(255),

  -- Billing
  monthly_fee NUMERIC(10, 2),
  billing_start_date DATE,
  billing_status VARCHAR(50),               -- 'active', 'overdue', 'cancelled'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_domain_claims_domain ON domain_claims(domain_id);
CREATE INDEX idx_domain_claims_wallet ON domain_claims(wallet_address);
CREATE INDEX idx_domain_claims_status ON domain_claims(status);

-- Referral Codes Table
-- Track referral bonuses
CREATE TABLE IF NOT EXISTS referral_codes (
  code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code details
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  creator_wallet VARCHAR(255),
  creator_session VARCHAR(255),

  -- Usage stats
  total_uses INT DEFAULT 0,
  total_rewards_earned NUMERIC(10, 6) DEFAULT 0.00,

  -- Bonus structure
  bonus_per_referral NUMERIC(10, 6) DEFAULT 5.00, -- $5 USDC per referred user

  -- Status
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_referral_codes_code ON referral_codes(referral_code);
CREATE INDEX idx_referral_codes_wallet ON referral_codes(creator_wallet);

-- Views for Analytics

-- Domain voting leaderboard
CREATE OR REPLACE VIEW domain_voting_leaderboard AS
SELECT
  dp.domain_id,
  dp.domain_name,
  dp.brand_name,
  dp.brand_tagline,
  dp.primary_color,
  COUNT(dv.vote_id) as total_votes,
  COUNT(dv.vote_id) FILTER (WHERE dv.vote_direction = 'like') as likes,
  COUNT(dv.vote_id) FILTER (WHERE dv.vote_direction = 'dislike') as dislikes,
  ROUND(
    100.0 * COUNT(dv.vote_id) FILTER (WHERE dv.vote_direction = 'like') /
    NULLIF(COUNT(dv.vote_id), 0),
    2
  ) as like_percentage,
  COUNT(DISTINCT df.feedback_id) as feedback_count,
  AVG(df.sentiment_score) as avg_sentiment
FROM domain_portfolio dp
LEFT JOIN domain_votes dv ON dp.domain_id = dv.domain_id
LEFT JOIN domain_feedback df ON dp.domain_id = df.domain_id AND df.is_spam = FALSE
GROUP BY dp.domain_id, dp.domain_name, dp.brand_name, dp.brand_tagline, dp.primary_color
ORDER BY total_votes DESC;

-- Top voters/earners
CREATE OR REPLACE VIEW top_voters AS
SELECT
  COALESCE(wallet_address, session_id) as identifier,
  wallet_address,
  COUNT(DISTINCT dv.vote_id) as total_votes,
  COUNT(DISTINCT df.feedback_id) as total_feedback,
  SUM(dv.reward_amount) + SUM(COALESCE(df.reward_amount, 0)) as total_earned_usdc,
  SUM(CASE WHEN dv.paid THEN dv.reward_amount ELSE 0 END) as paid_amount,
  SUM(CASE WHEN NOT dv.paid THEN dv.reward_amount ELSE 0 END) as pending_amount,
  MIN(dv.created_at) as first_vote_at,
  MAX(dv.created_at) as last_vote_at
FROM domain_votes dv
LEFT JOIN domain_feedback df ON dv.session_id = df.session_id
GROUP BY wallet_address, session_id
ORDER BY total_earned_usdc DESC
LIMIT 100;

-- Payment summary
CREATE OR REPLACE VIEW payment_summary AS
SELECT
  COUNT(*) as total_payments,
  SUM(amount_usdc) as total_usdc_distributed,
  COUNT(*) FILTER (WHERE payment_status = 'completed') as completed_count,
  SUM(amount_usdc) FILTER (WHERE payment_status = 'completed') as completed_amount,
  COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_count,
  SUM(amount_usdc) FILTER (WHERE payment_status = 'pending') as pending_amount,
  COUNT(DISTINCT wallet_address) as unique_wallets
FROM crypto_payments;

-- Trigger: Update domain_claims timestamp
CREATE OR REPLACE FUNCTION update_domain_claims_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_claims_update_trigger
BEFORE UPDATE ON domain_claims
FOR EACH ROW
EXECUTE FUNCTION update_domain_claims_timestamp();

-- Function: Calculate pending rewards for a session
CREATE OR REPLACE FUNCTION get_pending_rewards(p_session_id VARCHAR)
RETURNS NUMERIC AS $$
DECLARE
  total_pending NUMERIC;
BEGIN
  SELECT
    SUM(dv.reward_amount) + SUM(COALESCE(df.reward_amount, 0))
  INTO total_pending
  FROM domain_votes dv
  LEFT JOIN domain_feedback df ON dv.session_id = df.session_id AND df.paid = FALSE
  WHERE dv.session_id = p_session_id AND dv.paid = FALSE;

  RETURN COALESCE(total_pending, 0.00);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON domain_votes TO matthewmauer;
GRANT ALL PRIVILEGES ON domain_feedback TO matthewmauer;
GRANT ALL PRIVILEGES ON crypto_payments TO matthewmauer;
GRANT ALL PRIVILEGES ON domain_claims TO matthewmauer;
GRANT ALL PRIVILEGES ON referral_codes TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE domain_votes_vote_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE domain_feedback_feedback_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE crypto_payments_payment_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE domain_claims_claim_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE referral_codes_code_id_seq TO matthewmauer;

SELECT 'Migration 009: Domain Voting & Crypto Payments - Completed' as status;
