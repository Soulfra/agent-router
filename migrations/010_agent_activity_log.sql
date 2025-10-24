-- Migration: Agent Activity Log
-- Tracks what agents are doing across the system
-- Logs every agent action with full context

CREATE TABLE IF NOT EXISTS agent_activity_log (
  id SERIAL PRIMARY KEY,
  activity_id UUID UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Agent identification
  agent VARCHAR(100) NOT NULL, -- '@ollama:mistral', '@gpt4', '@claude'

  -- User/Session identification
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  device_id VARCHAR(255),
  identity_id UUID, -- Links to identity_graph

  -- Domain context
  origin_domain VARCHAR(255),
  domain_context VARCHAR(100), -- 'nonprofit', 'privacy', 'creative', etc.

  -- Request/Response
  input TEXT,
  result TEXT,
  duration_ms INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'error', 'timeout'
  error_message TEXT,

  -- Profile detection
  detected_profile VARCHAR(50),
  profile_confidence NUMERIC(5,2),

  -- Geolocation
  geolocation JSONB,
  client_ip VARCHAR(50),

  -- Platform
  platform VARCHAR(50), -- 'mobile-ios', 'web', 'api'

  -- Full context (for debugging)
  full_context JSONB,

  -- Indexes for common queries
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_activity_user ON agent_activity_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_session ON agent_activity_log(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_log(agent, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_domain ON agent_activity_log(origin_domain, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_identity ON agent_activity_log(identity_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_timestamp ON agent_activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_status ON agent_activity_log(status);

-- Index for UUID lookups
CREATE INDEX IF NOT EXISTS idx_agent_activity_uuid ON agent_activity_log(activity_id);

COMMENT ON TABLE agent_activity_log IS 'Tracks all agent activity across the system with full context';
COMMENT ON COLUMN agent_activity_log.agent IS 'Agent identifier like @ollama:mistral, @gpt4, @claude';
COMMENT ON COLUMN agent_activity_log.identity_id IS 'Links to unified identity graph';
COMMENT ON COLUMN agent_activity_log.origin_domain IS 'Domain where request originated (soulfra.com, deathtodata.com, etc.)';
COMMENT ON COLUMN agent_activity_log.detected_profile IS 'ICP profile detected (casual, professional, creative, etc.)';
COMMENT ON COLUMN agent_activity_log.geolocation IS 'Geolocation data (city, region, country, timezone)';
COMMENT ON COLUMN agent_activity_log.full_context IS 'Complete context object for debugging';
