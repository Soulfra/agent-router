-- Migration 007: Profile Swiper System
-- Tinder-style interface for generating and matching profile combinations
-- First names + Surnames + Emails + Phone numbers + Domains

-- First Names Database
-- Curated list of first names with metadata
CREATE TABLE IF NOT EXISTS first_names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  gender VARCHAR(20),                         -- 'male', 'female', 'neutral'
  origin VARCHAR(100),                        -- 'english', 'spanish', 'arabic', etc.
  popularity INT DEFAULT 50,                  -- 1-100 popularity score
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_first_names_gender ON first_names(gender);
CREATE INDEX idx_first_names_origin ON first_names(origin);
CREATE INDEX idx_first_names_popularity ON first_names(popularity DESC);

-- Last Names Database
-- Surname database with frequency data
CREATE TABLE IF NOT EXISTS last_names (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  origin VARCHAR(100),                        -- 'english', 'spanish', 'chinese', etc.
  frequency INT DEFAULT 50,                   -- 1-100 frequency score
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_last_names_origin ON last_names(origin);
CREATE INDEX idx_last_names_frequency ON last_names(frequency DESC);

-- Domain Names Database
-- Email domain pool for generation
CREATE TABLE IF NOT EXISTS domain_names (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) DEFAULT 'free',            -- 'free', 'corporate', 'custom', 'edu'
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_domain_names_type ON domain_names(type);
CREATE INDEX idx_domain_names_active ON domain_names(active);

-- Phone Patterns Database
-- Country-specific phone number formatting rules
CREATE TABLE IF NOT EXISTS phone_patterns (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(10) NOT NULL,          -- 'US', 'UK', 'CA', 'AU', etc.
  country_name VARCHAR(100),
  pattern VARCHAR(100) NOT NULL,              -- '(###) ###-####'
  example VARCHAR(50),                        -- '(555) 123-4567'
  dial_code VARCHAR(10),                      -- '+1', '+44', etc.
  metadata JSONB DEFAULT '{}',
  UNIQUE(country_code, pattern)
);

CREATE INDEX idx_phone_patterns_country ON phone_patterns(country_code);

-- Profile Matches Database
-- Accepted profile combinations from swiper
CREATE TABLE IF NOT EXISTS profile_matches (
  id SERIAL PRIMARY KEY,

  -- Name components
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(200) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,

  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(50),
  domain VARCHAR(255),

  -- Location
  country_code VARCHAR(10),
  country_name VARCHAR(100),

  -- Additional metadata
  metadata JSONB DEFAULT '{}',                -- birthdate, address, company, job title, etc.

  -- Scoring
  match_score INT DEFAULT 50,                 -- Algorithm-generated match quality score

  -- Source tracking
  first_name_origin VARCHAR(100),
  last_name_origin VARCHAR(100),
  generation_method VARCHAR(50) DEFAULT 'random', -- 'random', 'weighted', 'manual'

  -- User/session tracking
  session_id VARCHAR(100),
  user_id VARCHAR(100),

  -- Export status
  exported BOOLEAN DEFAULT false,
  export_format VARCHAR(50),                  -- 'vcard', 'csv', 'json'
  exported_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for profile_matches
CREATE INDEX idx_profile_matches_full_name ON profile_matches(full_name);
CREATE INDEX idx_profile_matches_email ON profile_matches(email);
CREATE INDEX idx_profile_matches_session ON profile_matches(session_id);
CREATE INDEX idx_profile_matches_user ON profile_matches(user_id);
CREATE INDEX idx_profile_matches_created ON profile_matches(created_at DESC);
CREATE INDEX idx_profile_matches_score ON profile_matches(match_score DESC);
CREATE INDEX idx_profile_matches_exported ON profile_matches(exported);

-- Full-text search on names
CREATE INDEX idx_profile_matches_search ON profile_matches
  USING GIN(to_tsvector('english', first_name || ' ' || last_name || ' ' || email));

-- Swipe History Database
-- Track all swipes for analytics and duplicate prevention
CREATE TABLE IF NOT EXISTS swipe_history (
  id SERIAL PRIMARY KEY,

  -- Profile that was shown
  profile_data JSONB NOT NULL,                -- Full profile card data

  -- Swipe action
  direction VARCHAR(10) NOT NULL,             -- 'left' (reject) or 'right' (accept)

  -- Match ID if accepted
  match_id INTEGER REFERENCES profile_matches(id) ON DELETE SET NULL,

  -- User/session tracking
  session_id VARCHAR(100),
  user_id VARCHAR(100),

  -- Timestamp
  swiped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for swipe_history
CREATE INDEX idx_swipe_history_direction ON swipe_history(direction);
CREATE INDEX idx_swipe_history_session ON swipe_history(session_id);
CREATE INDEX idx_swipe_history_user ON swipe_history(user_id);
CREATE INDEX idx_swipe_history_swiped ON swipe_history(swiped_at DESC);
CREATE INDEX idx_swipe_history_match ON swipe_history(match_id);

-- Contact Exports Database
-- Track export history and download files
CREATE TABLE IF NOT EXISTS contact_exports (
  id SERIAL PRIMARY KEY,

  -- Export details
  export_format VARCHAR(50) NOT NULL,         -- 'vcard', 'csv', 'json', 'xlsx'
  profile_ids INTEGER[],                      -- Array of profile_match IDs included
  profile_count INTEGER,

  -- File details
  file_path TEXT,
  file_size BIGINT,                           -- Size in bytes

  -- Filters used
  filters JSONB DEFAULT '{}',                 -- Search/filter criteria used

  -- User/session tracking
  session_id VARCHAR(100),
  user_id VARCHAR(100),

  -- Download tracking
  downloaded BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_exports_format ON contact_exports(export_format);
CREATE INDEX idx_contact_exports_user ON contact_exports(user_id);
CREATE INDEX idx_contact_exports_created ON contact_exports(created_at DESC);

-- Update trigger for profile_matches.updated_at
CREATE OR REPLACE FUNCTION update_profile_matches_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profile_matches_timestamp
BEFORE UPDATE ON profile_matches
FOR EACH ROW
EXECUTE FUNCTION update_profile_matches_timestamp();

-- Views for common queries

-- Recent matches view
CREATE OR REPLACE VIEW recent_matches AS
SELECT
  id,
  full_name,
  email,
  phone,
  country_code,
  match_score,
  created_at
FROM profile_matches
ORDER BY created_at DESC;

-- Swipe statistics view
CREATE OR REPLACE VIEW swipe_statistics AS
SELECT
  COUNT(*) as total_swipes,
  COUNT(*) FILTER (WHERE direction = 'right') as accepted,
  COUNT(*) FILTER (WHERE direction = 'left') as rejected,
  ROUND(100.0 * COUNT(*) FILTER (WHERE direction = 'right') / NULLIF(COUNT(*), 0), 2) as accept_rate,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) as unique_users
FROM swipe_history;

-- Popular name combinations view
CREATE OR REPLACE VIEW popular_names AS
SELECT
  first_name,
  last_name,
  COUNT(*) as match_count,
  AVG(match_score) as avg_score
FROM profile_matches
GROUP BY first_name, last_name
HAVING COUNT(*) > 1
ORDER BY match_count DESC, avg_score DESC
LIMIT 50;

-- Domain usage statistics
CREATE OR REPLACE VIEW domain_statistics AS
SELECT
  domain,
  COUNT(*) as usage_count,
  COUNT(DISTINCT session_id) as unique_sessions
FROM profile_matches
GROUP BY domain
ORDER BY usage_count DESC;

-- Success indicator
SELECT 'Migration 007: Profile Swiper System - Completed' as status;
