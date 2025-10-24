-- Migration: Identity Resolution & Ad Attribution System
--
-- Purpose: Connect all identity fragments into unified identity graph
-- Tracks: Cookie → Device → User → Handle → Badge → Affiliate → Receipt → Location
--
-- Complete ad attribution: Ad click → Cookie → Landing → Signup → Purchase

-- ============================================================================
-- IDENTITY GRAPH TABLE
-- ============================================================================
-- Connects all identity fragments for a single person

CREATE TABLE IF NOT EXISTS identity_graph (
  identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identifiers
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  cookie_id VARCHAR(128), -- Analytics cookie (GA, custom)
  device_fingerprint VARCHAR(64), -- SHA-256 hash of device characteristics
  email VARCHAR(255),
  vanity_handle VARCHAR(30), -- @username

  -- Trust & verification
  badge_level VARCHAR(50) DEFAULT 'newcomer', -- Badge system integration
  verified_email BOOLEAN DEFAULT FALSE,
  verified_phone BOOLEAN DEFAULT FALSE,

  -- Attribution
  affiliate_code VARCHAR(50), -- Which affiliate referred this identity
  referrer_url TEXT,

  -- Location
  ip_address INET,
  location JSONB, -- {country, region, city, lat, lng}

  -- Device info
  user_agent TEXT,
  platform VARCHAR(50), -- iOS, Android, Web, Desktop

  -- Activity tracking
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for fast lookups
CREATE INDEX idx_identity_graph_user ON identity_graph(user_id);
CREATE INDEX idx_identity_graph_cookie ON identity_graph(cookie_id);
CREATE INDEX idx_identity_graph_fingerprint ON identity_graph(device_fingerprint);
CREATE INDEX idx_identity_graph_email ON identity_graph(email);
CREATE INDEX idx_identity_graph_handle ON identity_graph(vanity_handle);
CREATE INDEX idx_identity_graph_affiliate ON identity_graph(affiliate_code);
CREATE INDEX idx_identity_graph_last_seen ON identity_graph(last_seen DESC);

-- ============================================================================
-- ATTRIBUTION EVENTS TABLE
-- ============================================================================
-- Tracks complete attribution path: Ad → Click → Landing → Signup → Purchase

CREATE TABLE IF NOT EXISTS attribution_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID REFERENCES identity_graph(identity_id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'ad_impression', 'ad_click', 'landing', 'signup', 'purchase'
  event_data JSONB DEFAULT '{}', -- Event-specific data

  -- Attribution parameters
  referrer TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(200),
  utm_content VARCHAR(200),
  utm_term VARCHAR(200),

  -- Affiliate tracking
  affiliate_code VARCHAR(50),

  -- Session info
  session_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attribution_events_identity ON attribution_events(identity_id, created_at DESC);
CREATE INDEX idx_attribution_events_type ON attribution_events(event_type);
CREATE INDEX idx_attribution_events_affiliate ON attribution_events(affiliate_code);
CREATE INDEX idx_attribution_events_campaign ON attribution_events(utm_campaign);
CREATE INDEX idx_attribution_events_created ON attribution_events(created_at DESC);

-- ============================================================================
-- RECEIPT DATA TABLE
-- ============================================================================
-- Parsed email receipts with purchase data

CREATE TABLE IF NOT EXISTS receipt_data (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  email_id VARCHAR(255), -- Email message ID

  -- Merchant details
  merchant VARCHAR(100), -- 'stripe', 'paypal', 'amazon', etc.
  order_id VARCHAR(100),

  -- Purchase details
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method VARCHAR(50), -- 'visa', 'mastercard', 'paypal', 'ach'
  status VARCHAR(50) DEFAULT 'completed',

  -- Items purchased
  items JSONB DEFAULT '[]',

  -- Dates
  receipt_date TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Email metadata
  email_from VARCHAR(255),
  email_subject TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_receipt_data_user ON receipt_data(user_id, receipt_date DESC);
CREATE INDEX idx_receipt_data_merchant ON receipt_data(merchant);
CREATE INDEX idx_receipt_data_order ON receipt_data(order_id);
CREATE INDEX idx_receipt_data_received ON receipt_data(received_at DESC);

-- ============================================================================
-- GEO LOCATIONS TABLE (Cache)
-- ============================================================================
-- IP address → location resolution cache

CREATE TABLE IF NOT EXISTS geo_locations (
  ip_address INET PRIMARY KEY,

  -- Geographic data
  country VARCHAR(100),
  country_code VARCHAR(2),
  region VARCHAR(100),
  region_code VARCHAR(10),
  city VARCHAR(100),
  zip VARCHAR(20),

  -- Coordinates
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Timezone
  timezone VARCHAR(50),

  -- ISP info
  isp VARCHAR(200),
  org VARCHAR(200),
  as_number VARCHAR(100),

  -- Cache metadata
  resolved_at TIMESTAMPTZ DEFAULT NOW(),
  hits INTEGER DEFAULT 0
);

CREATE INDEX idx_geo_locations_country ON geo_locations(country_code);
CREATE INDEX idx_geo_locations_city ON geo_locations(city);
CREATE INDEX idx_geo_locations_resolved ON geo_locations(resolved_at DESC);

-- ============================================================================
-- TRACKING COOKIES TABLE
-- ============================================================================
-- Cookie-based tracking for attribution

CREATE TABLE IF NOT EXISTS tracking_cookies (
  cookie_id VARCHAR(128) PRIMARY KEY,
  identity_id UUID REFERENCES identity_graph(identity_id) ON DELETE CASCADE,

  -- Cookie details
  cookie_value TEXT,
  domain VARCHAR(255),
  path VARCHAR(255) DEFAULT '/',
  expires_at TIMESTAMPTZ,

  -- Attribution params (set when cookie created)
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(200),
  affiliate_code VARCHAR(50),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_cookies_identity ON tracking_cookies(identity_id);
CREATE INDEX idx_tracking_cookies_affiliate ON tracking_cookies(affiliate_code);
CREATE INDEX idx_tracking_cookies_expires ON tracking_cookies(expires_at);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Complete identity view with all fragments
CREATE OR REPLACE VIEW identity_complete AS
SELECT
  ig.*,
  u.email as user_email,
  u.handle as user_handle,
  u.created_at as user_created_at,
  (SELECT COUNT(*) FROM attribution_events WHERE identity_id = ig.identity_id) as event_count,
  (SELECT COUNT(*) FROM receipt_data WHERE user_id = ig.user_id) as purchase_count,
  (SELECT SUM(amount_cents) FROM receipt_data WHERE user_id = ig.user_id) as lifetime_value_cents
FROM identity_graph ig
LEFT JOIN users u ON u.user_id = ig.user_id;

-- Attribution funnel view
CREATE OR REPLACE VIEW attribution_funnel AS
SELECT
  ig.identity_id,
  ig.affiliate_code,
  (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'ad_click') as first_click,
  (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'landing') as first_landing,
  (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'signup') as first_signup,
  (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'purchase') as first_purchase,
  EXTRACT(EPOCH FROM (
    (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'purchase') -
    (SELECT MIN(created_at) FROM attribution_events WHERE identity_id = ig.identity_id AND event_type = 'ad_click')
  )) / 3600 as hours_to_convert
FROM identity_graph ig;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update last_seen timestamp on identity graph
CREATE OR REPLACE FUNCTION update_identity_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE identity_graph
  SET last_seen = NOW()
  WHERE identity_id = NEW.identity_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attribution_event_updates_last_seen
  AFTER INSERT ON attribution_events
  FOR EACH ROW
  EXECUTE FUNCTION update_identity_last_seen();

-- Increment geo location hits
CREATE OR REPLACE FUNCTION increment_geo_hits()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE geo_locations
  SET hits = hits + 1
  WHERE ip_address = NEW.ip_address;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger would be on queries, not inserts
-- For now, manual increment when cache hit

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Create sample identity with all fragments
INSERT INTO identity_graph (
  identity_id,
  cookie_id,
  device_fingerprint,
  email,
  vanity_handle,
  badge_level,
  affiliate_code,
  ip_address,
  location,
  user_agent,
  platform
) VALUES (
  gen_random_uuid(),
  'GA1.2.1234567890.1234567890',
  'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
  'user@example.com',
  'johndoe',
  'contributor',
  'GOOGLE-PARTNER',
  '8.8.8.8'::inet,
  '{"country": "US", "city": "Mountain View", "lat": 37.4056, "lng": -122.0775}'::jsonb,
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'macOS'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE identity_graph IS 'Unified identity graph connecting all user fragments';
COMMENT ON TABLE attribution_events IS 'Complete attribution path from ad to conversion';
COMMENT ON TABLE receipt_data IS 'Parsed email receipts with purchase data';
COMMENT ON TABLE geo_locations IS 'IP → location resolution cache';
COMMENT ON TABLE tracking_cookies IS 'Cookie-based tracking for attribution';

COMMENT ON VIEW identity_complete IS 'Complete identity with user data and activity counts';
COMMENT ON VIEW attribution_funnel IS 'Time-to-convert metrics for attribution analysis';
