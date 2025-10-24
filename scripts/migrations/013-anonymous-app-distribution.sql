-- Anonymous App Distribution Pipeline Migration
-- GitHub + Google Drive + DNS + Anonymous OAuth

-- Anonymous identities (Matrix-style pseudonymous users)
CREATE TABLE IF NOT EXISTS anonymous_identities (
  id SERIAL PRIMARY KEY,
  anonymous_id VARCHAR(100) NOT NULL UNIQUE,
  handle VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_identities_anonymous_id ON anonymous_identities(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_identities_handle ON anonymous_identities(handle);

-- Identity providers (link GitHub/Google/etc to anonymous ID)
CREATE TABLE IF NOT EXISTS identity_providers (
  id SERIAL PRIMARY KEY,
  anonymous_id VARCHAR(100) NOT NULL REFERENCES anonymous_identities(anonymous_id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,          -- github, google, twitter, discord
  provider_user_id VARCHAR(255) NOT NULL, -- Provider's user ID
  profile_data JSONB,                     -- Encrypted profile data
  linked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_providers_anonymous ON identity_providers(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_identity_providers_provider ON identity_providers(provider, provider_user_id);

-- App deployments (GitHub)
CREATE TABLE IF NOT EXISTS app_deployments (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL,
  repo_url TEXT NOT NULL,
  pages_url TEXT,
  clone_url TEXT,
  api_url TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  app_path TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_deployments_name ON app_deployments(app_name);

-- Google Drive deployments
CREATE TABLE IF NOT EXISTS google_drive_deployments (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL,
  folder_id VARCHAR(255) NOT NULL,
  share_link TEXT NOT NULL,
  app_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  category VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_drive_deployments_name ON google_drive_deployments(app_name);
CREATE INDEX IF NOT EXISTS idx_google_drive_deployments_folder ON google_drive_deployments(folder_id);

-- DNS records
CREATE TABLE IF NOT EXISTS dns_records (
  id SERIAL PRIMARY KEY,
  subdomain VARCHAR(255) NOT NULL UNIQUE,
  record_type VARCHAR(20) NOT NULL,      -- CNAME, A, AAAA, TXT
  target TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL,          -- cloudflare, self-hosted
  record_id VARCHAR(255),                 -- Provider's record ID
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dns_records_subdomain ON dns_records(subdomain);
CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider);

-- App deployment pipeline (orchestration tracking)
CREATE TABLE IF NOT EXISTS app_deployment_pipeline (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL,
  app_path TEXT,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  success BOOLEAN DEFAULT FALSE,
  steps JSONB,                            -- Array of deployment steps
  urls JSONB,                             -- Deployed URLs
  error TEXT,
  metadata JSONB,
  INDEX idx_pipeline_name (app_name),
  INDEX idx_pipeline_started (started_at DESC)
);

-- App OAuth configs (which providers to allow)
CREATE TABLE IF NOT EXISTS app_oauth_configs (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL UNIQUE,
  allow_github BOOLEAN DEFAULT TRUE,
  allow_google BOOLEAN DEFAULT TRUE,
  allow_twitter BOOLEAN DEFAULT FALSE,
  allow_discord BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_oauth_configs_name ON app_oauth_configs(app_name);
