-- Path-Based Encryption System
-- Stores challenge-response sequences used to derive encryption keys
--
-- Concept: Encryption key = HMAC_SHA256(path of all challenge-response pairs)
-- Like Bitcoin mining: specific sequence generates key
-- Like Ghidra: need exact execution path to decrypt
-- Forward secrecy: each conversation path = unique key

-- Encryption path blocks (challenge-response pairs)
CREATE TABLE IF NOT EXISTS encryption_paths (
  path_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session tracking
  session_id VARCHAR(255) NOT NULL,
  block_index INTEGER NOT NULL, -- Sequential: 0, 1, 2, ...

  -- Challenge-response hashes
  challenge_hash VARCHAR(64) NOT NULL, -- SHA256 of challenge
  response_hash VARCHAR(64) NOT NULL, -- SHA256 of response

  -- Proof-of-work details
  pow_nonce VARCHAR(255), -- Nonce used for PoW
  pow_difficulty INTEGER, -- Difficulty level (leading zeros required)

  -- Key derivation
  key_fragment VARCHAR(64) NOT NULL, -- SHA256 of (challenge + response + nonce + difficulty + timestamp)

  -- Metadata
  block_timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(session_id, block_index)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_encryption_paths_session ON encryption_paths(session_id, block_index);
CREATE INDEX IF NOT EXISTS idx_encryption_paths_timestamp ON encryption_paths(block_timestamp);

-- Encrypted messages (stored with path metadata)
CREATE TABLE IF NOT EXISTS encrypted_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sender/recipient
  sender_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,

  -- Encryption details
  session_id VARCHAR(255) NOT NULL, -- Session used to derive encryption key
  path_length INTEGER NOT NULL, -- Number of path blocks at encryption time

  -- Encrypted payload
  iv VARCHAR(32) NOT NULL, -- Initialization vector (hex)
  auth_tag VARCHAR(32) NOT NULL, -- Authentication tag for GCM (hex)
  ciphertext TEXT NOT NULL, -- Encrypted message (hex)

  -- Metadata
  algorithm VARCHAR(50) DEFAULT 'aes-256-gcm',
  encrypted_at TIMESTAMPTZ DEFAULT NOW(),
  decrypted_at TIMESTAMPTZ, -- Set when successfully decrypted

  -- Message type
  message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'file', 'image', etc.
  content_length INTEGER -- Original plaintext length
);

-- Indexes for message retrieval
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_sender ON encrypted_messages(sender_user_id, encrypted_at DESC);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_recipient ON encrypted_messages(recipient_user_id, encrypted_at DESC);
CREATE INDEX IF NOT EXISTS idx_encrypted_messages_session ON encrypted_messages(session_id);

-- Challenge chains (sequential PoW challenges for key derivation)
CREATE TABLE IF NOT EXISTS challenge_chains (
  chain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session tracking
  session_id VARCHAR(255) NOT NULL UNIQUE,
  encryption_session_id VARCHAR(255) REFERENCES encryption_sessions(session_id) ON DELETE CASCADE,

  -- Participant
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Chain state
  current_index INTEGER DEFAULT 0, -- Current challenge index
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'abandoned', 'expired'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_challenge_at TIMESTAMPTZ
);

-- Indexes for chain lookup
CREATE INDEX IF NOT EXISTS idx_challenge_chains_session ON challenge_chains(session_id);
CREATE INDEX IF NOT EXISTS idx_challenge_chains_user ON challenge_chains(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_chains_status ON challenge_chains(status);

-- Individual challenges in chain
CREATE TABLE IF NOT EXISTS chain_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chain reference
  session_id VARCHAR(255) NOT NULL,

  -- Challenge details
  challenge_index INTEGER NOT NULL,
  challenge_nonce VARCHAR(64) NOT NULL, -- Challenge to solve
  difficulty INTEGER NOT NULL, -- PoW difficulty (leading zeros)

  -- Chaining
  previous_response VARCHAR(255), -- Previous response (makes challenges dependent)

  -- Response tracking
  response_nonce VARCHAR(255), -- User's response
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(session_id, challenge_index)
);

-- Indexes for challenge lookup
CREATE INDEX IF NOT EXISTS idx_chain_challenges_session ON chain_challenges(session_id, challenge_index);
CREATE INDEX IF NOT EXISTS idx_chain_challenges_verified ON chain_challenges(verified);

-- Session path metadata (tracks active encryption sessions)
CREATE TABLE IF NOT EXISTS encryption_sessions (
  session_id VARCHAR(255) PRIMARY KEY,

  -- Participants
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Path state
  current_block_index INTEGER DEFAULT -1, -- Latest block index
  total_blocks INTEGER DEFAULT 0,
  last_challenge_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,

  -- Key status
  key_derived BOOLEAN DEFAULT FALSE,
  key_derived_at TIMESTAMPTZ,
  key_expires_at TIMESTAMPTZ,

  -- Session lifecycle
  session_started_at TIMESTAMPTZ DEFAULT NOW(),
  session_expires_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active' -- 'active', 'expired', 'completed'
);

-- Indexes for session management
CREATE INDEX IF NOT EXISTS idx_encryption_sessions_user ON encryption_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_encryption_sessions_status ON encryption_sessions(status);
CREATE INDEX IF NOT EXISTS idx_encryption_sessions_expires ON encryption_sessions(session_expires_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get path length for session
CREATE OR REPLACE FUNCTION get_encryption_path_length(
  p_session_id VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
  v_length INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_length
  FROM encryption_paths
  WHERE session_id = p_session_id;

  RETURN v_length;
END;
$$ LANGUAGE plpgsql;

-- Validate path integrity
CREATE OR REPLACE FUNCTION validate_path_integrity(
  p_session_id VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_index INTEGER := 0;
  v_max_index INTEGER;
  v_block_exists BOOLEAN;
BEGIN
  -- Get max block index
  SELECT COALESCE(MAX(block_index), -1)
  INTO v_max_index
  FROM encryption_paths
  WHERE session_id = p_session_id;

  -- Check if path is empty
  IF v_max_index = -1 THEN
    RETURN FALSE;
  END IF;

  -- Verify all blocks are sequential (no gaps)
  WHILE v_current_index <= v_max_index LOOP
    SELECT EXISTS(
      SELECT 1
      FROM encryption_paths
      WHERE session_id = p_session_id
      AND block_index = v_current_index
    ) INTO v_block_exists;

    IF NOT v_block_exists THEN
      RETURN FALSE;
    END IF;

    v_current_index := v_current_index + 1;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Start new encryption session
CREATE OR REPLACE FUNCTION start_encryption_session(
  p_user_id UUID,
  p_session_duration_minutes INTEGER DEFAULT 60
)
RETURNS VARCHAR AS $$
DECLARE
  v_session_id VARCHAR;
BEGIN
  -- Generate session ID
  v_session_id := 'enc-' || encode(gen_random_bytes(16), 'hex');

  -- Create session record
  INSERT INTO encryption_sessions (
    session_id,
    user_id,
    session_expires_at
  ) VALUES (
    v_session_id,
    p_user_id,
    NOW() + (p_session_duration_minutes || ' minutes')::INTERVAL
  );

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Complete encryption session (marks key as derived)
CREATE OR REPLACE FUNCTION complete_encryption_session(
  p_session_id VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_path_length INTEGER;
BEGIN
  -- Get path length
  v_path_length := get_encryption_path_length(p_session_id);

  -- Update session
  UPDATE encryption_sessions
  SET
    total_blocks = v_path_length,
    key_derived = TRUE,
    key_derived_at = NOW(),
    key_expires_at = NOW() + INTERVAL '1 hour',
    status = 'completed'
  WHERE session_id = p_session_id
  AND status = 'active';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active encryption sessions
CREATE OR REPLACE VIEW active_encryption_sessions AS
SELECT
  es.session_id,
  es.user_id,
  u.email,
  u.username,
  es.current_block_index,
  es.total_blocks,
  es.key_derived,
  es.session_started_at,
  es.session_expires_at,
  EXTRACT(EPOCH FROM (es.session_expires_at - NOW())) as seconds_until_expiry
FROM encryption_sessions es
JOIN users u ON u.user_id = es.user_id
WHERE es.status = 'active'
AND es.session_expires_at > NOW()
ORDER BY es.session_started_at DESC;

-- Path statistics by session
CREATE OR REPLACE VIEW encryption_path_stats AS
SELECT
  ep.session_id,
  COUNT(*) as block_count,
  MIN(ep.block_timestamp) as first_block_at,
  MAX(ep.block_timestamp) as last_block_at,
  AVG(ep.pow_difficulty) as avg_pow_difficulty,
  EXTRACT(EPOCH FROM (MAX(ep.block_timestamp) - MIN(ep.block_timestamp))) as path_duration_seconds
FROM encryption_paths ep
GROUP BY ep.session_id
ORDER BY last_block_at DESC;

-- Recent encrypted messages
CREATE OR REPLACE VIEW recent_encrypted_messages AS
SELECT
  em.message_id,
  em.sender_user_id,
  s.username as sender_username,
  em.recipient_user_id,
  r.username as recipient_username,
  em.session_id,
  em.path_length,
  em.message_type,
  em.content_length,
  em.encrypted_at,
  em.decrypted_at,
  CASE
    WHEN em.decrypted_at IS NOT NULL THEN 'decrypted'
    ELSE 'encrypted'
  END as status
FROM encrypted_messages em
JOIN users s ON s.user_id = em.sender_user_id
JOIN users r ON r.user_id = em.recipient_user_id
ORDER BY em.encrypted_at DESC
LIMIT 100;

-- ============================================================================
-- CLEANUP TASKS
-- ============================================================================

-- Clean expired paths (run periodically)
-- DELETE FROM encryption_paths WHERE block_timestamp < NOW() - INTERVAL '1 hour';

-- Clean expired sessions
-- UPDATE encryption_sessions SET status = 'expired' WHERE session_expires_at < NOW() AND status = 'active';

-- Grant permissions (adjust based on your setup)
-- GRANT ALL ON encryption_paths TO your_app_user;
-- GRANT ALL ON encrypted_messages TO your_app_user;
-- GRANT ALL ON encryption_sessions TO your_app_user;
