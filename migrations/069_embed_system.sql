-- Migration 069: Embeddable Script System (Osano-like)
--
-- Tables for managing embeddable scripts that can be added to any website
-- Similar to Osano cookie consent + Auth0 + Google Tag Manager combined

-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Embed Sites: Websites that have embedded CALOS
CREATE TABLE IF NOT EXISTS embed_sites (
  id SERIAL PRIMARY KEY,
  site_id VARCHAR(32) UNIQUE NOT NULL, -- Public ID (e.g., 'ABC123DEF456')
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Site owner

  -- Site details
  domain VARCHAR(255) NOT NULL, -- e.g., 'example.com'
  name VARCHAR(255) NOT NULL, -- Display name
  description TEXT,

  -- Configuration
  config JSONB DEFAULT '{}', -- Custom configuration
  allowed_origins TEXT[], -- CORS allowed origins

  -- Features enabled
  consent_enabled BOOLEAN DEFAULT true, -- Cookie consent banner
  auth_enabled BOOLEAN DEFAULT true, -- OAuth login
  analytics_enabled BOOLEAN DEFAULT true, -- Session analytics

  -- Appearance
  theme JSONB DEFAULT '{}', -- Colors, fonts, position
  consent_text JSONB DEFAULT '{}', -- Customizable consent messages

  -- Security
  api_key VARCHAR(64) UNIQUE NOT NULL, -- Secret API key for server-side calls
  webhook_url VARCHAR(500), -- Optional webhook for events
  webhook_secret VARCHAR(64), -- HMAC secret for webhook verification

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, paused, disabled
  last_event_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_embed_sites_site_id ON embed_sites(site_id);
CREATE INDEX idx_embed_sites_user_id ON embed_sites(user_id);
CREATE INDEX idx_embed_sites_domain ON embed_sites(domain);
CREATE INDEX idx_embed_sites_status ON embed_sites(status);

-- Embed Events: Track events from embedded scripts
CREATE TABLE IF NOT EXISTS embed_events (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(32) REFERENCES embed_sites(site_id) ON DELETE CASCADE,

  -- Session tracking
  session_id VARCHAR(64) NOT NULL,
  visitor_id VARCHAR(64), -- Anonymous visitor ID (hashed)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- If logged in

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- pageview, consent, login, track, etc.
  event_name VARCHAR(100), -- Custom event name
  event_data JSONB DEFAULT '{}', -- Event metadata

  -- Page context
  page_url TEXT,
  page_title VARCHAR(500),
  referrer TEXT,

  -- Device/Browser
  user_agent TEXT,
  ip_hash VARCHAR(64), -- Hashed IP for privacy
  country_code VARCHAR(2),

  -- Timing
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_embed_events_site_id ON embed_events(site_id);
CREATE INDEX idx_embed_events_session_id ON embed_events(session_id);
CREATE INDEX idx_embed_events_visitor_id ON embed_events(visitor_id);
CREATE INDEX idx_embed_events_event_type ON embed_events(event_type);
CREATE INDEX idx_embed_events_timestamp ON embed_events(timestamp);

-- Embed Consent Records: Track consent choices
CREATE TABLE IF NOT EXISTS embed_consents (
  id SERIAL PRIMARY KEY,
  site_id VARCHAR(32) REFERENCES embed_sites(site_id) ON DELETE CASCADE,
  visitor_id VARCHAR(64) NOT NULL, -- Anonymous visitor

  -- Consent choices
  analytics_consent BOOLEAN DEFAULT false,
  marketing_consent BOOLEAN DEFAULT false,
  functional_consent BOOLEAN DEFAULT true, -- Usually required

  -- Metadata
  consent_version VARCHAR(20), -- Version of consent policy
  ip_hash VARCHAR(64),
  user_agent TEXT,

  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP, -- Optional expiration
  revoked_at TIMESTAMP
);

CREATE INDEX idx_embed_consents_site_id ON embed_consents(site_id);
CREATE INDEX idx_embed_consents_visitor_id ON embed_consents(visitor_id);
CREATE INDEX idx_embed_consents_granted_at ON embed_consents(granted_at);

-- Embed Sessions: Track visitor sessions
CREATE TABLE IF NOT EXISTS embed_sessions (
  id BIGSERIAL PRIMARY KEY,
  site_id VARCHAR(32) REFERENCES embed_sites(site_id) ON DELETE CASCADE,
  session_id VARCHAR(64) UNIQUE NOT NULL,
  visitor_id VARCHAR(64) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- If logged in

  -- Session details
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Engagement
  page_views INTEGER DEFAULT 0,
  events_count INTEGER DEFAULT 0,

  -- Entry/Exit
  entry_url TEXT,
  exit_url TEXT,
  referrer TEXT,

  -- Device
  user_agent TEXT,
  ip_hash VARCHAR(64),
  country_code VARCHAR(2),

  -- Conversions
  converted BOOLEAN DEFAULT false,
  conversion_type VARCHAR(50),
  conversion_value DECIMAL(10, 2)
);

CREATE INDEX idx_embed_sessions_site_id ON embed_sessions(site_id);
CREATE INDEX idx_embed_sessions_session_id ON embed_sessions(session_id);
CREATE INDEX idx_embed_sessions_visitor_id ON embed_sessions(visitor_id);
CREATE INDEX idx_embed_sessions_started_at ON embed_sessions(started_at);
CREATE INDEX idx_embed_sessions_converted ON embed_sessions(converted);

-- Embed Analytics: Aggregated statistics per site
CREATE TABLE IF NOT EXISTS embed_analytics (
  id SERIAL PRIMARY KEY,
  site_id VARCHAR(32) REFERENCES embed_sites(site_id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Traffic
  unique_visitors INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  total_page_views INTEGER DEFAULT 0,

  -- Engagement
  avg_session_duration DECIMAL(10, 2), -- seconds
  avg_pages_per_session DECIMAL(10, 2),
  bounce_rate DECIMAL(5, 2), -- percentage

  -- Consent
  consent_shown INTEGER DEFAULT 0,
  consent_accepted INTEGER DEFAULT 0,
  consent_rejected INTEGER DEFAULT 0,

  -- Authentication
  login_attempts INTEGER DEFAULT 0,
  successful_logins INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,

  -- Conversions
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(10, 2) DEFAULT 0,

  -- Metadata
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(site_id, date)
);

CREATE INDEX idx_embed_analytics_site_id ON embed_analytics(site_id);
CREATE INDEX idx_embed_analytics_date ON embed_analytics(date);

-- Embed Widgets: Custom widgets/components for sites
CREATE TABLE IF NOT EXISTS embed_widgets (
  id SERIAL PRIMARY KEY,
  site_id VARCHAR(32) REFERENCES embed_sites(site_id) ON DELETE CASCADE,

  -- Widget details
  widget_type VARCHAR(50) NOT NULL, -- consent, login, chat, etc.
  widget_name VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,

  -- Configuration
  config JSONB DEFAULT '{}',
  position VARCHAR(20) DEFAULT 'bottom-right', -- top-left, top-right, etc.
  z_index INTEGER DEFAULT 9999,

  -- Appearance
  custom_css TEXT,
  custom_html TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_embed_widgets_site_id ON embed_widgets(site_id);
CREATE INDEX idx_embed_widgets_widget_type ON embed_widgets(widget_type);
CREATE INDEX idx_embed_widgets_enabled ON embed_widgets(enabled);

-- Functions

-- Function: Generate random site ID
CREATE OR REPLACE FUNCTION generate_site_id() RETURNS VARCHAR(32) AS $$
DECLARE
  new_id VARCHAR(32);
BEGIN
  LOOP
    new_id := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM embed_sites WHERE site_id = new_id);
  END LOOP;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Generate API key
CREATE OR REPLACE FUNCTION generate_api_key() RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN 'sk_' || encode(gen_random_bytes(30), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function: Update embed_sites.updated_at
CREATE OR REPLACE FUNCTION update_embed_sites_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_embed_sites_updated_at
  BEFORE UPDATE ON embed_sites
  FOR EACH ROW
  EXECUTE FUNCTION update_embed_sites_updated_at();

-- Function: Update embed_sites.last_event_at on new events
CREATE OR REPLACE FUNCTION update_embed_site_last_event() RETURNS TRIGGER AS $$
BEGIN
  UPDATE embed_sites
  SET last_event_at = NEW.timestamp
  WHERE site_id = NEW.site_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_embed_site_last_event
  AFTER INSERT ON embed_events
  FOR EACH ROW
  EXECUTE FUNCTION update_embed_site_last_event();

-- Default embed site for main CALOS instance (commented out - create via dashboard)
-- INSERT INTO embed_sites (
--   site_id,
--   user_id,
--   domain,
--   name,
--   description,
--   api_key,
--   status
-- ) VALUES (
--   'CALOS_DEFAULT',
--   1,
--   'localhost',
--   'CALOS Main Instance',
--   'Default embed site for CALOS platform',
--   generate_api_key(),
--   'active'
-- ) ON CONFLICT (site_id) DO NOTHING;

-- Grant permissions (commented out - adjust for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON embed_sites TO calos;
-- GRANT SELECT, INSERT ON embed_events TO calos;
-- GRANT SELECT, INSERT, UPDATE ON embed_consents TO calos;
-- GRANT SELECT, INSERT, UPDATE ON embed_sessions TO calos;
-- GRANT SELECT, INSERT, UPDATE ON embed_analytics TO calos;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON embed_widgets TO calos;

-- GRANT USAGE, SELECT ON SEQUENCE embed_sites_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE embed_events_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE embed_consents_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE embed_sessions_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE embed_analytics_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE embed_widgets_id_seq TO calos;
