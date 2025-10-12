-- Migration 008: Developer SDK System
-- API keys, webhooks, rate limiting, usage tracking
-- Inspired by Adobe Express SDK developer platform

-- Developers Table
-- Store developer accounts with API credentials
CREATE TABLE IF NOT EXISTS developers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  company VARCHAR(255),

  -- API Credentials
  api_key VARCHAR(64) UNIQUE NOT NULL,
  api_secret VARCHAR(64) NOT NULL,

  -- Tier & Limits
  tier VARCHAR(50) DEFAULT 'free',              -- 'free', 'pro', 'enterprise'
  rate_limit_per_hour INT DEFAULT 100,
  rate_limit_per_day INT DEFAULT 1000,
  batch_size_limit INT DEFAULT 100,
  webhook_limit INT DEFAULT 1,

  -- Security
  allowed_domains TEXT[],                        -- Domain whitelist for CORS
  ip_whitelist TEXT[],                           -- Optional IP whitelist

  -- Status
  status VARCHAR(50) DEFAULT 'active',           -- 'active', 'suspended', 'deleted'
  email_verified BOOLEAN DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX idx_developers_api_key ON developers(api_key);
CREATE INDEX idx_developers_email ON developers(email);
CREATE INDEX idx_developers_tier ON developers(tier);
CREATE INDEX idx_developers_status ON developers(status);

-- API Usage Tracking
-- Track API calls per hour for rate limiting
CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

  -- Request details
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,                   -- GET, POST, etc.

  -- Time tracking
  hour_bucket TIMESTAMP NOT NULL,                -- Truncated to hour
  requests_count INT DEFAULT 0,

  -- Response tracking
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,

  -- Performance
  avg_latency_ms INT,
  total_latency_ms BIGINT DEFAULT 0,

  UNIQUE(developer_id, endpoint, hour_bucket)
);

CREATE INDEX idx_api_usage_developer_hour ON api_usage(developer_id, hour_bucket DESC);
CREATE INDEX idx_api_usage_endpoint ON api_usage(endpoint);

-- API Request Log
-- Detailed log of individual requests (limited retention)
CREATE TABLE IF NOT EXISTS api_request_log (
  id SERIAL PRIMARY KEY,
  developer_id INT REFERENCES developers(id) ON DELETE SET NULL,

  -- Request details
  api_key VARCHAR(64),
  endpoint VARCHAR(255),
  method VARCHAR(10),
  request_headers JSONB,
  request_body JSONB,
  query_params JSONB,

  -- Response details
  status_code INT,
  response_body JSONB,
  latency_ms INT,

  -- Client info
  ip_address INET,
  user_agent TEXT,
  origin VARCHAR(255),

  -- Timestamps
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_request_log_developer ON api_request_log(developer_id, requested_at DESC);
CREATE INDEX idx_api_request_log_status ON api_request_log(status_code);
CREATE INDEX idx_api_request_log_requested ON api_request_log(requested_at DESC);

-- Webhooks Table
-- Developer-configured webhooks for events
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

  -- Webhook config
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,                        -- ['match.created', 'export.completed', etc.]
  secret VARCHAR(64) NOT NULL,                   -- For HMAC signature

  -- Delivery settings
  retry_count INT DEFAULT 3,
  timeout_seconds INT DEFAULT 30,

  -- Status
  active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP,
  last_success_at TIMESTAMP,
  last_failure_at TIMESTAMP,
  failure_count INT DEFAULT 0,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_developer ON webhooks(developer_id);
CREATE INDEX idx_webhooks_active ON webhooks(active);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);

-- Webhook Deliveries Log
-- Track webhook delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,

  -- Delivery details
  attempt INT NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL,                   -- 'pending', 'success', 'failed'
  http_status INT,
  response_body TEXT,
  error_message TEXT,
  latency_ms INT,

  -- Timestamps
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  next_retry_at TIMESTAMP
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, attempted_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';

-- SDK Tokens Table
-- Short-lived tokens for client-side SDK usage
CREATE TABLE IF NOT EXISTS sdk_tokens (
  id SERIAL PRIMARY KEY,
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

  -- Token details
  token VARCHAR(128) UNIQUE NOT NULL,
  token_type VARCHAR(50) DEFAULT 'client',       -- 'client', 'server', 'temporary'

  -- Restrictions
  allowed_origins TEXT[],
  allowed_ips TEXT[],
  rate_limit_override INT,

  -- Status
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,

  -- Usage tracking
  last_used_at TIMESTAMP,
  usage_count INT DEFAULT 0,

  -- Metadata
  name VARCHAR(255),                             -- Developer-set name
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sdk_tokens_token ON sdk_tokens(token);
CREATE INDEX idx_sdk_tokens_developer ON sdk_tokens(developer_id);
CREATE INDEX idx_sdk_tokens_active ON sdk_tokens(active);
CREATE INDEX idx_sdk_tokens_expires ON sdk_tokens(expires_at);

-- Developer Subscriptions (for billing)
CREATE TABLE IF NOT EXISTS developer_subscriptions (
  id SERIAL PRIMARY KEY,
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

  -- Subscription details
  tier VARCHAR(50) NOT NULL,                     -- 'free', 'pro', 'enterprise'
  status VARCHAR(50) DEFAULT 'active',           -- 'active', 'cancelled', 'expired'

  -- Billing
  billing_cycle VARCHAR(50) DEFAULT 'monthly',   -- 'monthly', 'annual'
  amount_cents INT,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_method VARCHAR(50),                    -- 'stripe', 'paypal', etc.
  external_subscription_id VARCHAR(255),         -- Stripe subscription ID

  -- Dates
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancelled_at TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE INDEX idx_developer_subscriptions_developer ON developer_subscriptions(developer_id);
CREATE INDEX idx_developer_subscriptions_status ON developer_subscriptions(status);

-- Update trigger for developers.updated_at
CREATE OR REPLACE FUNCTION update_developers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_developers_timestamp
BEFORE UPDATE ON developers
FOR EACH ROW
EXECUTE FUNCTION update_developers_timestamp();

-- Update trigger for webhooks.updated_at
CREATE OR REPLACE FUNCTION update_webhooks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhooks_timestamp
BEFORE UPDATE ON webhooks
FOR EACH ROW
EXECUTE FUNCTION update_webhooks_timestamp();

-- Views for analytics

-- Developer usage summary
CREATE OR REPLACE VIEW developer_usage_summary AS
SELECT
  d.id as developer_id,
  d.email,
  d.name,
  d.tier,
  COUNT(DISTINCT au.hour_bucket::date) as active_days,
  SUM(au.requests_count) as total_requests,
  AVG(au.avg_latency_ms) as avg_latency_ms,
  MAX(au.hour_bucket) as last_active
FROM developers d
LEFT JOIN api_usage au ON d.id = au.developer_id
GROUP BY d.id, d.email, d.name, d.tier;

-- API endpoint popularity
CREATE OR REPLACE VIEW endpoint_popularity AS
SELECT
  endpoint,
  COUNT(DISTINCT developer_id) as unique_developers,
  SUM(requests_count) as total_requests,
  AVG(avg_latency_ms) as avg_latency_ms,
  SUM(error_count) as total_errors,
  ROUND(100.0 * SUM(error_count) / NULLIF(SUM(requests_count), 0), 2) as error_rate
FROM api_usage
GROUP BY endpoint
ORDER BY total_requests DESC;

-- Webhook success rate
CREATE OR REPLACE VIEW webhook_success_rate AS
SELECT
  w.id as webhook_id,
  w.url,
  d.email as developer_email,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE wd.status = 'success') as successful_deliveries,
  COUNT(*) FILTER (WHERE wd.status = 'failed') as failed_deliveries,
  ROUND(100.0 * COUNT(*) FILTER (WHERE wd.status = 'success') / NULLIF(COUNT(*), 0), 2) as success_rate,
  AVG(wd.latency_ms) as avg_latency_ms
FROM webhooks w
JOIN developers d ON w.developer_id = d.id
LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
GROUP BY w.id, w.url, d.email;

-- Success indicator
SELECT 'Migration 008: Developer SDK System - Completed' as status;
