-- Migration 071: Ollama Streaming Sessions
-- Creates tables for tracking Ollama conversations with multi-domain context sharing
--
-- Purpose:
-- - Track work sessions with timer (duration tracking)
-- - Stream conversations from local Ollama to other models (GPT-4, Claude) when needed
-- - Associate sessions with domains/clients for billing
-- - Apply custom branding per domain
-- - Generate end-of-session summaries with costs breakdown
--
-- Use Case:
-- "I'm talking with my local Ollama, but when I hit certain models or domains
--  I want to work with on their branding or consulting, it registers we're working
--  on it like a timer. Ollama listens and streams context to other domains/models,
--  then at the end we figure out costs."

-- ============================================================================
-- 1. STREAMING SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ollama_streaming_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & authentication
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES user_api_keys(id), -- If using API key auth

  -- Context assignment
  domain_id UUID REFERENCES domain_portfolio(domain_id), -- Which client/project
  room_id INTEGER REFERENCES code_rooms(id),             -- Persistent code room context
  brand_id UUID REFERENCES user_brands(id),              -- Custom branding configuration

  -- Session lifecycle (timer functionality)
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER, -- Calculated on end
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'ended', 'cancelled'

  -- Primary model (usually local Ollama)
  primary_model VARCHAR(100) NOT NULL, -- 'ollama:llama2', 'ollama:mistral', 'ollama:codellama'
  primary_provider VARCHAR(50) DEFAULT 'ollama',

  -- Context streaming configuration
  auto_stream_enabled BOOLEAN DEFAULT true, -- Auto-stream context when switching models
  stream_threshold INTEGER DEFAULT 5,       -- Stream context after N messages
  context_window_size INTEGER DEFAULT 10,   -- How many messages to include in context

  -- Session metadata
  session_name VARCHAR(255),                -- User-friendly name (e.g., "Client ABC Pricing Calculator")
  description TEXT,
  tags VARCHAR(100)[],                      -- ['consulting', 'development', 'urgent']

  -- Statistics (updated as session progresses)
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  context_shared_with JSONB DEFAULT '[]',  -- Array of {model, domain, timestamp}

  -- Billing
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  billed BOOLEAN DEFAULT false,
  billed_at TIMESTAMP,
  invoice_id UUID, -- Link to tenant_invoices if applicable

  -- Contract workflow (DocuSign-like)
  contract_status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'review', 'approved', 'signed', 'executed', 'completed', 'cancelled'
  approved_at TIMESTAMP,                       -- When user approved costs
  approved_cost_usd NUMERIC(10, 6),           -- Approved cost ceiling
  signed_at TIMESTAMP,                        -- When user signed (Soulfra signature)
  contract_pdf_url TEXT,                      -- Generated PDF export URL
  public_share_url TEXT,                      -- Public link for sharing signed contract
  contract_terms TEXT,                        -- Terms user agreed to

  -- Versioning (track changes to active sessions)
  version INTEGER DEFAULT 1,                  -- Auto-increment on major changes
  version_history JSONB DEFAULT '[]',         -- [{version, timestamp, changes, reason}]
  parent_session_id UUID REFERENCES ollama_streaming_sessions(session_id), -- Session forking

  -- Soulfra cryptographic signing
  soulfra_hash JSONB,                         -- {sha256, sha512, sha3_512, blake3b, ed25519_signature}
  soulfra_signed_at TIMESTAMP,                -- When Soulfra signature was applied
  soulfra_version VARCHAR(20) DEFAULT '1.0.0', -- Soulfra standard version

  -- Session immutability (once signed, can't edit)
  is_immutable BOOLEAN DEFAULT false,         -- True after Soulfra signing
  immutable_since TIMESTAMP,                  -- When session became immutable

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ollama_sessions_user ON ollama_streaming_sessions(user_id, started_at DESC);
CREATE INDEX idx_ollama_sessions_status ON ollama_streaming_sessions(status) WHERE status = 'active';
CREATE INDEX idx_ollama_sessions_domain ON ollama_streaming_sessions(domain_id, started_at DESC);
CREATE INDEX idx_ollama_sessions_room ON ollama_streaming_sessions(room_id);
CREATE INDEX idx_ollama_sessions_unbilled ON ollama_streaming_sessions(billed) WHERE billed = false;
CREATE INDEX idx_ollama_sessions_contract_status ON ollama_streaming_sessions(contract_status);
CREATE INDEX idx_ollama_sessions_signed ON ollama_streaming_sessions(signed_at DESC) WHERE signed_at IS NOT NULL;
CREATE INDEX idx_ollama_sessions_version ON ollama_streaming_sessions(parent_session_id, version);

COMMENT ON TABLE ollama_streaming_sessions IS 'Track Ollama work sessions with timer and context streaming';
COMMENT ON COLUMN ollama_streaming_sessions.duration_seconds IS 'Total session duration (calculated on end)';
COMMENT ON COLUMN ollama_streaming_sessions.context_shared_with IS 'Array of models/domains that received context: [{model, domain_id, timestamp}]';
COMMENT ON COLUMN ollama_streaming_sessions.contract_status IS 'Contract workflow state: draft → review → approved → signed → executed → completed';
COMMENT ON COLUMN ollama_streaming_sessions.soulfra_hash IS 'Cryptographic proof of session integrity (Soulfra Layer0 standard)';
COMMENT ON COLUMN ollama_streaming_sessions.is_immutable IS 'True after Soulfra signing - session cannot be modified';
COMMENT ON COLUMN ollama_streaming_sessions.version IS 'Session version number - incremented on major changes (domain switch, model upgrade)';
COMMENT ON COLUMN ollama_streaming_sessions.version_history IS 'History of all version changes: [{version, timestamp, changes, reason}]';

-- ============================================================================
-- 2. SESSION MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ollama_session_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session reference
  session_id UUID NOT NULL REFERENCES ollama_streaming_sessions(session_id) ON DELETE CASCADE,

  -- Message data
  role VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Model that generated this (for assistant messages)
  model VARCHAR(100),
  provider VARCHAR(50),       -- 'ollama', 'openai', 'anthropic', 'deepseek'

  -- Context streaming
  shared_to_domains UUID[],   -- Which domains received this message as context
  shared_to_models VARCHAR[], -- Which other models received this as context
  is_context_message BOOLEAN DEFAULT false, -- True if this was sent as context to another model

  -- Token usage
  tokens INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,

  -- Cost (usually $0 for Ollama, $$$ for external models)
  cost_usd NUMERIC(10, 6) DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Store additional data (temperature, max_tokens, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ollama_messages_session ON ollama_session_messages(session_id, timestamp);
CREATE INDEX idx_ollama_messages_provider ON ollama_session_messages(provider);
CREATE INDEX idx_ollama_messages_shared ON ollama_session_messages(session_id) WHERE array_length(shared_to_domains, 1) > 0;

COMMENT ON TABLE ollama_session_messages IS 'Every message in an Ollama streaming session';
COMMENT ON COLUMN ollama_session_messages.shared_to_domains IS 'Which domains received this message as context';
COMMENT ON COLUMN ollama_session_messages.is_context_message IS 'True if sent as context (not a direct user message)';

-- ============================================================================
-- 3. CONTEXT STREAMING EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ollama_context_streams (
  stream_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session reference
  session_id UUID NOT NULL REFERENCES ollama_streaming_sessions(session_id) ON DELETE CASCADE,

  -- From → To
  source_model VARCHAR(100) NOT NULL,      -- 'ollama:mistral' (your local conversation)
  target_model VARCHAR(100) NOT NULL,      -- 'gpt-4' (client needs OpenAI)
  target_provider VARCHAR(50) NOT NULL,    -- 'openai', 'anthropic'
  target_domain_id UUID REFERENCES domain_portfolio(domain_id), -- Which client domain

  -- What was sent
  context_snapshot JSONB NOT NULL,         -- Array of last N messages [{role, content, timestamp}]
  message_count INTEGER NOT NULL,
  total_tokens INTEGER DEFAULT 0,

  -- When & why
  streamed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason VARCHAR(100),                     -- 'domain_switch', 'model_upgrade', 'consultation', 'manual'
  triggered_by VARCHAR(50) DEFAULT 'auto', -- 'auto', 'user', 'threshold'

  -- Billing (cost of sending context to external model)
  cost_usd NUMERIC(10, 6) DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ollama_streams_session ON ollama_context_streams(session_id, streamed_at DESC);
CREATE INDEX idx_ollama_streams_domain ON ollama_context_streams(target_domain_id, streamed_at DESC);
CREATE INDEX idx_ollama_streams_models ON ollama_context_streams(source_model, target_model);

COMMENT ON TABLE ollama_context_streams IS 'Track when context is streamed from Ollama to other models';
COMMENT ON COLUMN ollama_context_streams.context_snapshot IS 'Snapshot of messages sent as context';
COMMENT ON COLUMN ollama_context_streams.reason IS 'Why context was streamed (domain_switch, model_upgrade, etc.)';

-- ============================================================================
-- 4. SESSION SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW ollama_session_summary AS
SELECT
  s.session_id,
  s.user_id,
  s.session_name,
  s.status,

  -- Timing
  s.started_at,
  s.ended_at,
  s.duration_seconds,
  CASE
    WHEN s.duration_seconds IS NOT NULL THEN
      CONCAT(
        FLOOR(s.duration_seconds / 3600)::TEXT, 'h ',
        FLOOR((s.duration_seconds % 3600) / 60)::TEXT, 'm'
      )
    ELSE NULL
  END as duration_formatted,

  -- Domain/branding
  s.domain_id,
  d.domain_name,
  b.brand_name,

  -- Primary model
  s.primary_model,

  -- Message statistics
  COUNT(DISTINCT m.message_id) as total_messages,
  SUM(m.tokens) as total_tokens,

  -- Message breakdown by role
  COUNT(m.message_id) FILTER (WHERE m.role = 'user') as user_messages,
  COUNT(m.message_id) FILTER (WHERE m.role = 'assistant') as assistant_messages,

  -- Cost breakdown
  COALESCE(SUM(m.cost_usd), 0) as total_cost,
  COALESCE(SUM(m.cost_usd) FILTER (WHERE m.provider = 'ollama'), 0) as ollama_cost,
  COALESCE(SUM(m.cost_usd) FILTER (WHERE m.provider != 'ollama'), 0) as external_cost,

  -- Provider breakdown
  jsonb_object_agg(
    COALESCE(m.provider, 'unknown'),
    jsonb_build_object(
      'messages', COUNT(m.message_id),
      'tokens', SUM(m.tokens),
      'cost', SUM(m.cost_usd)
    )
  ) FILTER (WHERE m.provider IS NOT NULL) as provider_breakdown,

  -- Context sharing statistics
  COUNT(DISTINCT cs.target_domain_id) as domains_shared_with,
  COUNT(cs.stream_id) as context_stream_count,
  COALESCE(SUM(cs.cost_usd), 0) as context_stream_cost,

  -- Hourly rate calculation (for billing)
  CASE
    WHEN s.duration_seconds > 0 THEN
      ROUND((COALESCE(SUM(m.cost_usd), 0) / (s.duration_seconds / 3600.0))::NUMERIC, 2)
    ELSE NULL
  END as cost_per_hour

FROM ollama_streaming_sessions s
LEFT JOIN domain_portfolio d ON s.domain_id = d.domain_id
LEFT JOIN user_brands b ON s.brand_id = b.id
LEFT JOIN ollama_session_messages m ON s.session_id = m.session_id
LEFT JOIN ollama_context_streams cs ON s.session_id = cs.session_id
GROUP BY
  s.session_id,
  s.user_id,
  s.session_name,
  s.status,
  s.started_at,
  s.ended_at,
  s.duration_seconds,
  s.domain_id,
  d.domain_name,
  b.brand_name,
  s.primary_model;

COMMENT ON VIEW ollama_session_summary IS 'Complete session summary with costs, timing, and statistics';

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function: Start a new streaming session
CREATE OR REPLACE FUNCTION start_ollama_session(
  p_user_id UUID,
  p_domain_id UUID DEFAULT NULL,
  p_brand_id UUID DEFAULT NULL,
  p_room_id INTEGER DEFAULT NULL,
  p_primary_model VARCHAR(100) DEFAULT 'ollama:mistral',
  p_session_name VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  INSERT INTO ollama_streaming_sessions (
    user_id,
    domain_id,
    brand_id,
    room_id,
    primary_model,
    session_name,
    status
  ) VALUES (
    p_user_id,
    p_domain_id,
    p_brand_id,
    p_room_id,
    p_primary_model,
    p_session_name,
    'active'
  ) RETURNING session_id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION start_ollama_session IS 'Start a new tracked Ollama streaming session';

-- Function: End a streaming session
CREATE OR REPLACE FUNCTION end_ollama_session(
  p_session_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_duration INTEGER;
BEGIN
  -- Get start time
  SELECT started_at INTO v_start_time
  FROM ollama_streaming_sessions
  WHERE session_id = p_session_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Calculate duration
  v_duration := EXTRACT(EPOCH FROM (NOW() - v_start_time))::INTEGER;

  -- Update session
  UPDATE ollama_streaming_sessions
  SET
    status = 'ended',
    ended_at = NOW(),
    duration_seconds = v_duration
  WHERE session_id = p_session_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION end_ollama_session IS 'End a streaming session and calculate duration';

-- Function: Get active sessions for user
CREATE OR REPLACE FUNCTION get_active_ollama_sessions(
  p_user_id UUID
)
RETURNS TABLE(
  session_id UUID,
  session_name VARCHAR,
  domain_name VARCHAR,
  primary_model VARCHAR,
  started_at TIMESTAMP,
  message_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.session_id,
    s.session_name,
    d.domain_name,
    s.primary_model,
    s.started_at,
    COUNT(m.message_id) as message_count
  FROM ollama_streaming_sessions s
  LEFT JOIN domain_portfolio d ON s.domain_id = d.domain_id
  LEFT JOIN ollama_session_messages m ON s.session_id = m.session_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
  GROUP BY s.session_id, s.session_name, d.domain_name, s.primary_model, s.started_at
  ORDER BY s.started_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_ollama_sessions IS 'Get all active sessions for a user';
