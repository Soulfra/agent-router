-- Migration: GitHub Pages Projects Registry
-- Apache-style project management system
-- Each project can have its own database + billing tracking

CREATE TABLE IF NOT EXISTS github_pages_projects (
  id SERIAL PRIMARY KEY,

  -- Project identity
  project_name VARCHAR(100) UNIQUE NOT NULL, -- 'soulfra', 'calriven', 'vibecoding'
  repo_url TEXT, -- 'https://github.com/soulfra/soulfra.github.io'
  github_pages_url TEXT, -- 'https://soulfra.github.io'

  -- Database
  database_name VARCHAR(100), -- 'soulfra_db', 'calriven_db', or NULL for shared

  -- Owner
  owner_user_id VARCHAR(255) NOT NULL,

  -- Tier
  tier VARCHAR(50) DEFAULT 'trial', -- 'trial', 'pro', 'enterprise'

  -- Metadata
  description TEXT,
  tags JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended', 'archived'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_projects_owner (owner_user_id, status),
  INDEX idx_projects_name (project_name),
  INDEX idx_projects_status (status, created_at DESC)
);

COMMENT ON TABLE github_pages_projects IS 'Apache-style project registry for GitHub Pages sites';
COMMENT ON COLUMN github_pages_projects.database_name IS 'Optional separate database, NULL = shared database';

-- Project Members (Apache-style access control)
CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,

  project_id INTEGER REFERENCES github_pages_projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Role (like Apache PMC, Committer, Contributor)
  role VARCHAR(50) DEFAULT 'contributor', -- 'admin', 'committer', 'contributor'

  -- Permissions
  can_view_billing BOOLEAN DEFAULT TRUE,
  can_manage_keys BOOLEAN DEFAULT FALSE,
  can_invite_users BOOLEAN DEFAULT FALSE,
  can_delete_project BOOLEAN DEFAULT FALSE,

  -- Timestamps
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  UNIQUE(project_id, user_id),
  INDEX idx_members_project (project_id, role),
  INDEX idx_members_user (user_id)
);

COMMENT ON TABLE project_members IS 'Apache-style access control per project';

-- Project API Keys (BYOK per project)
CREATE TABLE IF NOT EXISTS project_api_keys (
  id SERIAL PRIMARY KEY,

  project_id INTEGER REFERENCES github_pages_projects(id) ON DELETE CASCADE,

  -- Provider
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek'

  -- Encrypted key (using same encryption as service_credentials)
  encrypted_key TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,

  -- Metadata
  added_by_user_id VARCHAR(255),
  label VARCHAR(100), -- 'Production OpenAI Key', 'Development Key'

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  UNIQUE(project_id, provider, label),
  INDEX idx_project_keys_project (project_id, is_active),
  INDEX idx_project_keys_provider (provider)
);

COMMENT ON TABLE project_api_keys IS 'BYOK API keys per project (not per user)';

-- Seed existing projects from /projects/ directory
INSERT INTO github_pages_projects (project_name, github_pages_url, description, status, tags)
VALUES
  ('soulfra', 'https://soulfra.github.io', 'Main SoulFra platform with QR login, BYOK, trial dashboard', 'active', '["platform", "main"]'),
  ('calriven', 'https://calriven.github.io', 'CalRiven - grep, sed, CLI tools documentation', 'active', '["docs", "cli"]'),
  ('vibecoding', 'https://vibecoding.github.io', 'VibeCoding - jq, pipes, tool combinations', 'active', '["docs", "devtools"]'),
  ('perplexity-vault', 'https://perplexity-vault.github.io', 'Perplexity Vault - JSON parsing and data tools', 'active', '["docs", "data"]'),
  ('calos-platform', 'https://calos-platform.github.io', 'CalOS Platform - full documentation hub', 'active', '["platform", "docs"]'),
  ('soulfra-org', 'https://soulfra.github.io', 'SoulFra Organization (duplicate)', 'archived', '[]')
ON CONFLICT (project_name) DO NOTHING;

COMMENT ON TABLE github_pages_projects IS 'All GitHub Pages projects tracked for multi-project billing';
