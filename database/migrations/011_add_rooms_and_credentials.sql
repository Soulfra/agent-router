-- Code Rooms & Credential Management
-- Enables GitHub-as-source-of-truth automation with secure credential storage

-- ============================================================================
-- CODE ROOMS (Matrix-style organization)
-- ============================================================================

-- Code rooms for organizing repos by purpose/language/domain
-- Like Matrix rooms - each room is a collection of related code
CREATE TABLE IF NOT EXISTS code_rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,      -- 'python-automation', 'lua-scripts', 'api-helpers'
  slug VARCHAR(255) UNIQUE NOT NULL,       -- URL-friendly
  description TEXT,

  -- Room configuration
  room_type VARCHAR(50) DEFAULT 'language',  -- 'language', 'purpose', 'project', 'team'
  primary_language VARCHAR(50),              -- 'python', 'lua', 'javascript'
  tags TEXT[],                               -- ['automation', 'webhooks', 'cli']

  -- Ollama model for this room
  ollama_model_name VARCHAR(255),            -- 'calos-python', 'calos-lua'
  model_training_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'training', 'ready', 'failed'
  last_trained TIMESTAMP,

  -- Room statistics
  repo_count INTEGER DEFAULT 0,
  snippet_count INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,

  -- Access control
  is_public BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_code_rooms_slug ON code_rooms(slug);
CREATE INDEX idx_code_rooms_type ON code_rooms(room_type);
CREATE INDEX idx_code_rooms_language ON code_rooms(primary_language);
CREATE INDEX idx_code_rooms_model_status ON code_rooms(model_training_status);

-- Room membership (which repos belong to which rooms)
CREATE TABLE IF NOT EXISTS code_room_repositories (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES code_rooms(id) ON DELETE CASCADE,
  repo_id INTEGER REFERENCES code_repositories(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, repo_id)
);

CREATE INDEX idx_room_repos_room ON code_room_repositories(room_id);
CREATE INDEX idx_room_repos_repo ON code_room_repositories(repo_id);

-- Room chat/discussions (for collaboration)
CREATE TABLE IF NOT EXISTS code_room_messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES code_rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',  -- 'text', 'code', 'announcement'
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_room_messages_room ON code_room_messages(room_id, created_at DESC);

-- ============================================================================
-- SECURE CREDENTIAL STORAGE (Keyring)
-- ============================================================================

-- Service credentials (API keys, tokens, secrets)
CREATE TABLE IF NOT EXISTS service_credentials (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(255) NOT NULL,       -- 'github', 'openai', 'anthropic'
  credential_type VARCHAR(50) NOT NULL,     -- 'api_key', 'oauth_token', 'ssh_key'
  identifier VARCHAR(255),                  -- Username, email, or account ID

  -- Encrypted credentials
  encrypted_value TEXT NOT NULL,            -- Encrypted with app secret
  encryption_method VARCHAR(50) DEFAULT 'aes-256-gcm',
  iv TEXT,                                  -- Initialization vector
  auth_tag TEXT,                            -- Authentication tag

  -- Metadata
  description TEXT,
  scopes TEXT[],                            -- Permissions/scopes
  expires_at TIMESTAMP,

  -- Usage tracking
  last_used TIMESTAMP,
  use_count INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(service_name, credential_type, identifier)
);

CREATE INDEX idx_credentials_service ON service_credentials(service_name, is_active);
CREATE INDEX idx_credentials_expires ON service_credentials(expires_at) WHERE expires_at IS NOT NULL;

-- Credential usage audit log
CREATE TABLE IF NOT EXISTS credential_usage_log (
  id SERIAL PRIMARY KEY,
  credential_id INTEGER REFERENCES service_credentials(id) ON DELETE CASCADE,
  used_by VARCHAR(255),                     -- Agent/service that used it
  operation VARCHAR(100),                   -- 'fetch_repos', 'create_pr', 'send_email'
  success BOOLEAN,
  error_message TEXT,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credential_log_credential ON credential_usage_log(credential_id, timestamp DESC);

-- ============================================================================
-- AUTOMATION WEBHOOKS
-- ============================================================================

-- Webhook endpoints configuration
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id SERIAL PRIMARY KEY,
  endpoint_name VARCHAR(255) UNIQUE NOT NULL,
  endpoint_url TEXT NOT NULL,               -- '/api/webhook/github', '/api/webhook/gitlab'
  source VARCHAR(50) NOT NULL,              -- 'github', 'gitlab', 'bitbucket'

  -- Security
  secret_token TEXT,                        -- For webhook signature verification
  allowed_ips TEXT[],                       -- IP whitelist

  -- Configuration
  events TEXT[],                            -- ['push', 'pull_request', 'issues']
  auto_index BOOLEAN DEFAULT true,          -- Auto-index code on push
  auto_train BOOLEAN DEFAULT false,         -- Auto-retrain model
  auto_publish BOOLEAN DEFAULT false,       -- Auto-publish content

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_received TIMESTAMP,
  total_received INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_endpoints_source ON webhook_endpoints(source, is_active);

-- Webhook event log
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  endpoint_id INTEGER REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

  -- Event data
  event_type VARCHAR(100) NOT NULL,         -- 'push', 'pull_request'
  payload JSONB NOT NULL,
  headers JSONB,

  -- Processing
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'processing', 'success', 'failed'
  processed_at TIMESTAMP,
  error_message TEXT,

  -- Actions taken
  actions_performed TEXT[],                 -- ['indexed_code', 'trained_model', 'published_content']

  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_endpoint ON webhook_events(endpoint_id, received_at DESC);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);

-- ============================================================================
-- OLLAMA TRAINING PIPELINE
-- ============================================================================

-- Training jobs queue
CREATE TABLE IF NOT EXISTS ollama_training_jobs (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES code_rooms(id),

  -- Training configuration
  model_name VARCHAR(255) NOT NULL,         -- 'calos-python', 'calos-lua'
  base_model VARCHAR(100) NOT NULL,         -- 'llama3.2:3b'
  modelfile_path TEXT,

  -- Training data
  training_data_path TEXT,                  -- Path to generated training file
  data_size_kb INTEGER,
  snippet_count INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'generating_data', 'training', 'complete', 'failed'
  progress INTEGER DEFAULT 0,               -- 0-100
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  -- Results
  model_size_mb NUMERIC,
  training_duration_seconds INTEGER,
  quality_score NUMERIC,                    -- Optional quality assessment

  -- Scheduling
  triggered_by VARCHAR(50),                 -- 'webhook', 'scheduler', 'manual'
  scheduled_for TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_training_jobs_status ON ollama_training_jobs(status, created_at DESC);
CREATE INDEX idx_training_jobs_room ON ollama_training_jobs(room_id);

-- ============================================================================
-- AUTOMATION SCHEDULER JOBS
-- ============================================================================

-- Scheduled tasks configuration
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(255) UNIQUE NOT NULL,
  job_type VARCHAR(50) NOT NULL,            -- 'index_repos', 'train_models', 'generate_content'

  -- Schedule
  schedule_expression VARCHAR(100),         -- Cron-like: '0 */6 * * *' or interval: 'every_6h'
  interval_seconds INTEGER,

  -- Configuration
  job_config JSONB,                         -- Job-specific settings

  -- Status
  is_enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  run_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scheduled_jobs_enabled ON scheduled_jobs(is_enabled, next_run);

-- Job execution history
CREATE TABLE IF NOT EXISTS job_execution_log (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

  -- Execution
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR(50) NOT NULL,              -- 'success', 'failed', 'timeout'
  error_message TEXT,

  -- Results
  result_data JSONB,                        -- Job-specific results
  metrics JSONB                             -- Performance metrics
);

CREATE INDEX idx_job_log_job ON job_execution_log(job_id, started_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Room summary with statistics
CREATE OR REPLACE VIEW room_summary AS
SELECT
  r.id,
  r.name,
  r.slug,
  r.room_type,
  r.primary_language,
  r.ollama_model_name,
  r.model_training_status,
  COUNT(DISTINCT rr.repo_id) as repo_count,
  COUNT(DISTINCT cs.id) as snippet_count,
  MAX(r.last_trained) as last_trained
FROM code_rooms r
LEFT JOIN code_room_repositories rr ON rr.room_id = r.id
LEFT JOIN code_snippets cs ON cs.repo_id = rr.repo_id
GROUP BY r.id, r.name, r.slug, r.room_type, r.primary_language, r.ollama_model_name, r.model_training_status;

-- Active webhooks summary
CREATE OR REPLACE VIEW webhook_summary AS
SELECT
  we.endpoint_name,
  we.source,
  we.is_active,
  we.last_received,
  COUNT(wl.id) as total_events,
  COUNT(wl.id) FILTER (WHERE wl.status = 'success') as successful_events,
  COUNT(wl.id) FILTER (WHERE wl.status = 'failed') as failed_events
FROM webhook_endpoints we
LEFT JOIN webhook_events wl ON wl.endpoint_id = we.id
WHERE we.is_active = true
GROUP BY we.id, we.endpoint_name, we.source, we.is_active, we.last_received;

-- Training pipeline status
CREATE OR REPLACE VIEW training_pipeline_status AS
SELECT
  r.name as room_name,
  r.ollama_model_name,
  t.status as training_status,
  t.progress,
  t.started_at,
  t.completed_at,
  t.error_message
FROM ollama_training_jobs t
JOIN code_rooms r ON r.id = t.room_id
WHERE t.status IN ('pending', 'generating_data', 'training')
ORDER BY t.created_at DESC;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update room counts when repos added/removed
CREATE OR REPLACE FUNCTION update_room_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE code_rooms
  SET
    repo_count = (
      SELECT COUNT(*) FROM code_room_repositories WHERE room_id = NEW.room_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_room_counts
  AFTER INSERT ON code_room_repositories
  FOR EACH ROW EXECUTE FUNCTION update_room_counts();

-- Log credential usage
CREATE OR REPLACE FUNCTION log_credential_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE service_credentials
  SET
    last_used = CURRENT_TIMESTAMP,
    use_count = use_count + 1
  WHERE id = NEW.credential_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_credential_usage
  AFTER INSERT ON credential_usage_log
  FOR EACH ROW EXECUTE FUNCTION log_credential_usage();

-- Auto-update timestamps
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON code_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON service_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_updated_at BEFORE UPDATE ON ollama_training_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_jobs_updated_at BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
