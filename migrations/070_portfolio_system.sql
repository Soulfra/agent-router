-- Migration 070: Portfolio Hub System
--
-- Unified analytics and authorship tracking system that aggregates:
-- - AI chat logs (from ai_conversations)
-- - Embed analytics (from embed_events)
-- - Git activity (GitHub, GitLab, Bitbucket)
-- - Multi-database stats (across 12 buckets)
-- - Intellectual property (patents, trademarks, authorship)
--
-- Creates a professional portfolio showcase with cryptographic proof of authorship

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Git Portfolio Stats
-- ============================================================================

-- Sync GitHub/GitLab/Bitbucket activity
CREATE TABLE IF NOT EXISTS git_portfolio_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- REFERENCES users(id) when available

  -- Git platform
  platform VARCHAR(50) NOT NULL, -- 'github', 'gitlab', 'bitbucket'
  username VARCHAR(255) NOT NULL,
  profile_url VARCHAR(500),

  -- Repository stats
  total_repos INTEGER DEFAULT 0,
  public_repos INTEGER DEFAULT 0,
  private_repos INTEGER DEFAULT 0,

  -- Contribution stats
  total_commits INTEGER DEFAULT 0,
  commits_this_year INTEGER DEFAULT 0,
  commits_this_month INTEGER DEFAULT 0,
  total_prs INTEGER DEFAULT 0,
  prs_merged INTEGER DEFAULT 0,
  total_issues INTEGER DEFAULT 0,
  issues_closed INTEGER DEFAULT 0,

  -- Social stats
  total_stars INTEGER DEFAULT 0,
  total_forks INTEGER DEFAULT 0,
  total_watchers INTEGER DEFAULT 0,
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,

  -- Contribution graph (JSON with daily contributions)
  contribution_graph JSONB DEFAULT '{}',

  -- Language breakdown
  languages JSONB DEFAULT '{}', -- {"JavaScript": 45.2, "Python": 30.1, ...}

  -- Sync metadata
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'syncing', 'completed', 'failed'
  sync_error TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(platform, username)
);

CREATE INDEX idx_git_portfolio_user ON git_portfolio_stats(user_id);
CREATE INDEX idx_git_portfolio_platform ON git_portfolio_stats(platform);
CREATE INDEX idx_git_portfolio_username ON git_portfolio_stats(username);
CREATE INDEX idx_git_portfolio_last_synced ON git_portfolio_stats(last_synced_at);

-- ============================================================================
-- Authorship Registry (Patents, Trademarks, IP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS authorship_registry (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- REFERENCES users(id) when available

  -- IP type
  ip_type VARCHAR(50) NOT NULL, -- 'patent', 'trademark', 'copyright', 'trade_secret', 'invention'

  -- Title and description
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Filing/registration
  filing_number VARCHAR(255),
  filing_date DATE,
  registration_number VARCHAR(255),
  registration_date DATE,
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'filed', 'pending', 'registered', 'rejected', 'expired'

  -- Related work
  related_files TEXT[], -- File paths
  related_repos TEXT[], -- Git repo URLs
  related_commits TEXT[], -- Git commit SHAs
  related_code JSONB, -- Code snippets with signatures

  -- Cryptographic proof (Soulfra signatures)
  soulfra_hash VARCHAR(64), -- SHA-256 hash of content
  soulfra_signature TEXT, -- Ed25519 signature
  signed_at TIMESTAMP,
  signed_by VARCHAR(255),

  -- Chain of custody
  previous_hash VARCHAR(64), -- Links to previous entry (blockchain-like)
  proof_chain JSONB, -- Full chain of evidence

  -- Metadata
  tags TEXT[],
  category VARCHAR(100),
  jurisdiction VARCHAR(100), -- 'US', 'EU', 'International', etc.

  -- Visibility
  is_public BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_authorship_user ON authorship_registry(user_id);
CREATE INDEX idx_authorship_type ON authorship_registry(ip_type);
CREATE INDEX idx_authorship_status ON authorship_registry(status);
CREATE INDEX idx_authorship_filing_date ON authorship_registry(filing_date);
CREATE INDEX idx_authorship_hash ON authorship_registry(soulfra_hash);
CREATE INDEX idx_authorship_category ON authorship_registry(category);

-- ============================================================================
-- Portfolio Timeline (Unified Activity Feed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_timeline (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER, -- REFERENCES users(id) when available

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'chat', 'commit', 'embed_event', 'patent_filed', 'trademark', etc.
  event_category VARCHAR(50), -- 'ai', 'git', 'analytics', 'ip', 'general'

  -- Event data
  title VARCHAR(500),
  description TEXT,
  event_data JSONB, -- Full event details

  -- Related entities
  related_type VARCHAR(50), -- 'ai_conversation', 'git_commit', 'embed_site', 'patent', etc.
  related_id VARCHAR(255), -- ID of related entity
  related_url VARCHAR(500), -- Link to entity

  -- Source tracking
  source VARCHAR(100), -- 'ai_conversations', 'github', 'embed_events', 'authorship_registry', etc.
  source_id VARCHAR(255), -- Original record ID

  -- Visibility
  is_public BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,

  -- Timestamps
  event_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_user ON portfolio_timeline(user_id);
CREATE INDEX idx_timeline_type ON portfolio_timeline(event_type);
CREATE INDEX idx_timeline_category ON portfolio_timeline(event_category);
CREATE INDEX idx_timeline_timestamp ON portfolio_timeline(event_timestamp DESC);
CREATE INDEX idx_timeline_source ON portfolio_timeline(source, source_id);
CREATE INDEX idx_timeline_public ON portfolio_timeline(is_public);
CREATE INDEX idx_timeline_featured ON portfolio_timeline(is_featured);

-- ============================================================================
-- Portfolio Analytics (Aggregated Stats)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- REFERENCES users(id) when available
  date DATE NOT NULL,

  -- AI/Chat stats
  ai_conversations_count INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd DECIMAL(10, 4) DEFAULT 0,

  -- Git stats
  git_commits_count INTEGER DEFAULT 0,
  git_prs_count INTEGER DEFAULT 0,
  git_stars_gained INTEGER DEFAULT 0,

  -- Embed analytics stats
  embed_events_count INTEGER DEFAULT 0,
  embed_pageviews INTEGER DEFAULT 0,
  embed_unique_visitors INTEGER DEFAULT 0,

  -- Authorship stats
  ip_filings_count INTEGER DEFAULT 0,
  patents_filed INTEGER DEFAULT 0,
  trademarks_filed INTEGER DEFAULT 0,

  -- Bucket/database stats (multi-database aggregation)
  bucket_records_created INTEGER DEFAULT 0,
  bucket_queries_executed INTEGER DEFAULT 0,

  -- Totals
  total_activities INTEGER DEFAULT 0,

  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, date)
);

CREATE INDEX idx_portfolio_analytics_user ON portfolio_analytics(user_id);
CREATE INDEX idx_portfolio_analytics_date ON portfolio_analytics(date DESC);

-- ============================================================================
-- Bucket Database Stats (Multi-Database Aggregation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_database_stats (
  id SERIAL PRIMARY KEY,
  bucket_id VARCHAR(50) NOT NULL,
  bucket_name VARCHAR(255),

  -- Database metrics
  total_tables INTEGER DEFAULT 0,
  total_records BIGINT DEFAULT 0,
  database_size_mb DECIMAL(10, 2) DEFAULT 0,

  -- Activity metrics
  records_created_today INTEGER DEFAULT 0,
  records_updated_today INTEGER DEFAULT 0,
  records_deleted_today INTEGER DEFAULT 0,
  queries_today INTEGER DEFAULT 0,

  -- Table breakdown (top tables by size)
  top_tables JSONB DEFAULT '[]', -- [{"table": "users", "count": 1000}, ...]

  -- Last activity
  last_write_at TIMESTAMP,
  last_read_at TIMESTAMP,

  -- Computed
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(bucket_id)
);

CREATE INDEX idx_bucket_stats_bucket ON bucket_database_stats(bucket_id);
CREATE INDEX idx_bucket_stats_computed ON bucket_database_stats(computed_at DESC);

-- ============================================================================
-- Portfolio Settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_settings (
  user_id INTEGER PRIMARY KEY, -- REFERENCES users(id) when available

  -- Visibility
  is_public BOOLEAN DEFAULT false,
  public_url_slug VARCHAR(255) UNIQUE,

  -- Display preferences
  show_ai_stats BOOLEAN DEFAULT true,
  show_git_stats BOOLEAN DEFAULT true,
  show_embed_stats BOOLEAN DEFAULT true,
  show_ip_registry BOOLEAN DEFAULT false, -- Private by default

  -- Theme
  theme JSONB DEFAULT '{"primaryColor": "#667eea", "layout": "timeline"}',

  -- Social links
  social_links JSONB DEFAULT '{}', -- {"github": "username", "linkedin": "profile", ...}

  -- Export settings
  auto_export_enabled BOOLEAN DEFAULT false,
  export_format VARCHAR(50) DEFAULT 'json', -- 'json', 'pdf', 'csv'
  export_schedule VARCHAR(50), -- 'daily', 'weekly', 'monthly'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Views for Quick Analytics
-- ============================================================================

-- Unified portfolio overview
CREATE OR REPLACE VIEW portfolio_overview AS
SELECT
  pa.user_id,
  -- Lifetime totals
  SUM(pa.ai_conversations_count) as total_ai_conversations,
  SUM(pa.ai_tokens_used) as total_ai_tokens,
  SUM(pa.ai_cost_usd) as total_ai_cost,
  SUM(pa.git_commits_count) as total_git_commits,
  SUM(pa.git_prs_count) as total_git_prs,
  SUM(pa.embed_events_count) as total_embed_events,
  SUM(pa.ip_filings_count) as total_ip_filings,

  -- This month
  SUM(CASE WHEN pa.date >= date_trunc('month', CURRENT_DATE) THEN pa.total_activities ELSE 0 END) as activities_this_month,

  -- This year
  SUM(CASE WHEN pa.date >= date_trunc('year', CURRENT_DATE) THEN pa.total_activities ELSE 0 END) as activities_this_year
FROM portfolio_analytics pa
GROUP BY pa.user_id;

-- Git portfolio summary
CREATE OR REPLACE VIEW git_portfolio_summary AS
SELECT
  user_id,
  SUM(total_commits) as total_commits_all_platforms,
  SUM(total_prs) as total_prs_all_platforms,
  SUM(total_stars) as total_stars_all_platforms,
  SUM(total_forks) as total_forks_all_platforms,
  COUNT(*) as platforms_count
FROM git_portfolio_stats
GROUP BY user_id;

-- IP registry summary
CREATE OR REPLACE VIEW ip_registry_summary AS
SELECT
  user_id,
  COUNT(*) as total_ip_entries,
  COUNT(*) FILTER (WHERE ip_type = 'patent') as patents_count,
  COUNT(*) FILTER (WHERE ip_type = 'trademark') as trademarks_count,
  COUNT(*) FILTER (WHERE ip_type = 'copyright') as copyrights_count,
  COUNT(*) FILTER (WHERE status = 'registered') as registered_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count
FROM authorship_registry
GROUP BY user_id;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Update portfolio_analytics.updated_at
CREATE OR REPLACE FUNCTION update_portfolio_analytics_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_portfolio_analytics
  BEFORE UPDATE ON portfolio_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_analytics_updated_at();

-- Function: Update git_portfolio_stats.updated_at
CREATE OR REPLACE FUNCTION update_git_portfolio_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_git_portfolio
  BEFORE UPDATE ON git_portfolio_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_git_portfolio_updated_at();

-- Function: Update authorship_registry.updated_at
CREATE OR REPLACE FUNCTION update_authorship_registry_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_authorship_registry
  BEFORE UPDATE ON authorship_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_authorship_registry_updated_at();

-- Grant permissions (commented out - adjust for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON git_portfolio_stats TO calos;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON authorship_registry TO calos;
-- GRANT SELECT, INSERT ON portfolio_timeline TO calos;
-- GRANT SELECT, INSERT, UPDATE ON portfolio_analytics TO calos;
-- GRANT SELECT, INSERT, UPDATE ON bucket_database_stats TO calos;
-- GRANT SELECT, INSERT, UPDATE ON portfolio_settings TO calos;

-- GRANT USAGE, SELECT ON SEQUENCE git_portfolio_stats_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE authorship_registry_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE portfolio_timeline_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE portfolio_analytics_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE bucket_database_stats_id_seq TO calos;
