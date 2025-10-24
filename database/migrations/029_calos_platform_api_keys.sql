/**
 * Migration 029: CALOS Platform API Keys (Layer 1)
 *
 * Adds the table for tenant API keys that customers use to access the CALOS platform.
 * This is Layer 1 of the two-layer API key system.
 *
 * Layer 1: Customer → CALOS (these keys)
 * Layer 2: CALOS → LLM Providers (existing tenant_api_keys table from migration 021)
 *
 * Key Format: sk-tenant-{tenant_id}-{random}
 * Example: sk-tenant-550e8400-e29b-41d4-a716-446655440000-x7k9m2p4
 */

-- ============================================================================
-- 1. PLATFORM API KEYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS calos_platform_api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Key storage (NEVER store plaintext!)
  key_hash VARCHAR(255) NOT NULL,         -- bcrypt hash of full key
  key_prefix VARCHAR(50) NOT NULL,        -- First 20 chars for UI display (e.g., "sk-tenant-550e8400")
  key_suffix_last4 VARCHAR(10),           -- Last 4 chars for identification

  -- Metadata
  key_name VARCHAR(200) NOT NULL,         -- User-friendly name (e.g., "Production Key")
  description TEXT,                       -- Optional description

  -- Status
  status VARCHAR(50) DEFAULT 'active',    -- 'active', 'revoked', 'expired'

  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(100),
  last_used_endpoint VARCHAR(200),
  total_requests BIGINT DEFAULT 0,

  -- Rate limiting (per key)
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,

  -- Security
  ip_whitelist TEXT[],                    -- Optional IP whitelist (enterprise only)
  allowed_endpoints TEXT[],               -- Optional endpoint restrictions

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id),  -- User who created this key
  expires_at TIMESTAMPTZ,                     -- Optional expiration
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(user_id),
  revoked_reason TEXT
);

-- Indexes for performance
CREATE INDEX idx_calos_api_keys_tenant ON calos_platform_api_keys(tenant_id) WHERE status = 'active';
CREATE INDEX idx_calos_api_keys_status ON calos_platform_api_keys(status);
CREATE INDEX idx_calos_api_keys_created ON calos_platform_api_keys(created_at DESC);
CREATE INDEX idx_calos_api_keys_last_used ON calos_platform_api_keys(last_used_at DESC) WHERE status = 'active';

-- Unique constraint on key_hash to prevent duplicates
CREATE UNIQUE INDEX idx_calos_api_keys_hash ON calos_platform_api_keys(key_hash);

COMMENT ON TABLE calos_platform_api_keys IS 'Layer 1 API keys - customers use these to access CALOS platform';
COMMENT ON COLUMN calos_platform_api_keys.key_hash IS 'Bcrypt hash of full API key - NEVER store plaintext!';
COMMENT ON COLUMN calos_platform_api_keys.key_prefix IS 'First 20 chars of key for display (e.g., sk-tenant-550e8400)';
COMMENT ON COLUMN calos_platform_api_keys.key_suffix_last4 IS 'Last 4 chars for identification (e.g., ...m2p4)';

-- ============================================================================
-- 2. API KEY USAGE LOG (Detailed tracking per key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS calos_api_key_usage_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  key_id UUID NOT NULL REFERENCES calos_platform_api_keys(key_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Request details
  request_id VARCHAR(255),
  endpoint VARCHAR(200) NOT NULL,
  method VARCHAR(10) NOT NULL,           -- GET, POST, etc.

  -- Response
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,

  -- Token usage (copied from usage_billing_events)
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,

  -- Client info
  ip_address VARCHAR(100),
  user_agent TEXT,
  origin VARCHAR(500),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX idx_api_key_usage_key ON calos_api_key_usage_log(key_id, created_at DESC);
CREATE INDEX idx_api_key_usage_tenant ON calos_api_key_usage_log(tenant_id, created_at DESC);
CREATE INDEX idx_api_key_usage_created ON calos_api_key_usage_log(created_at DESC);

-- Partition by month for performance (optional, can be added later)
-- CREATE INDEX idx_api_key_usage_created_month ON calos_api_key_usage_log((DATE_TRUNC('month', created_at)));

COMMENT ON TABLE calos_api_key_usage_log IS 'Detailed usage log for platform API keys';

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

/**
 * Log API key usage
 * Called after every request made with a platform API key
 */
CREATE OR REPLACE FUNCTION log_platform_api_key_usage(
  p_key_id UUID,
  p_tenant_id UUID,
  p_endpoint VARCHAR(200),
  p_method VARCHAR(10),
  p_status_code INTEGER,
  p_latency_ms INTEGER DEFAULT NULL,
  p_ip_address VARCHAR(100) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Insert usage log
  INSERT INTO calos_api_key_usage_log (
    key_id, tenant_id, endpoint, method,
    status_code, latency_ms, ip_address, user_agent, request_id
  ) VALUES (
    p_key_id, p_tenant_id, p_endpoint, p_method,
    p_status_code, p_latency_ms, p_ip_address, p_user_agent, p_request_id
  )
  RETURNING log_id INTO v_log_id;

  -- Update key last_used stats
  UPDATE calos_platform_api_keys
  SET
    last_used_at = NOW(),
    last_used_ip = p_ip_address,
    last_used_endpoint = p_endpoint,
    total_requests = total_requests + 1
  WHERE key_id = p_key_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Check rate limits for a platform API key
 */
CREATE OR REPLACE FUNCTION check_platform_api_key_rate_limit(
  p_key_id UUID,
  p_period VARCHAR(10)  -- 'minute', 'hour', 'day'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_key RECORD;
  v_count INTEGER;
  v_since TIMESTAMPTZ;
  v_limit INTEGER;
BEGIN
  -- Get key with limits
  SELECT * INTO v_key
  FROM calos_platform_api_keys
  WHERE key_id = p_key_id AND status = 'active';

  IF v_key IS NULL THEN
    RETURN FALSE; -- Key doesn't exist or is not active
  END IF;

  -- Determine time period and limit
  CASE p_period
    WHEN 'minute' THEN
      v_since := NOW() - INTERVAL '1 minute';
      v_limit := v_key.rate_limit_per_minute;
    WHEN 'hour' THEN
      v_since := NOW() - INTERVAL '1 hour';
      v_limit := v_key.rate_limit_per_hour;
    WHEN 'day' THEN
      v_since := NOW() - INTERVAL '1 day';
      v_limit := v_key.rate_limit_per_day;
    ELSE
      RETURN FALSE; -- Invalid period
  END CASE;

  -- Count requests in period
  SELECT COUNT(*) INTO v_count
  FROM calos_api_key_usage_log
  WHERE key_id = p_key_id AND created_at >= v_since;

  -- Check if within limit
  RETURN v_count < v_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Revoke a platform API key
 */
CREATE OR REPLACE FUNCTION revoke_platform_api_key(
  p_key_id UUID,
  p_revoked_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE calos_platform_api_keys
  SET
    status = 'revoked',
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revoked_reason = p_reason
  WHERE key_id = p_key_id AND status = 'active';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Get API key usage summary
 */
CREATE OR REPLACE FUNCTION get_platform_api_key_usage_summary(
  p_key_id UUID,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days'
)
RETURNS TABLE (
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  total_tokens BIGINT,
  total_cost_cents BIGINT,
  avg_latency_ms NUMERIC,
  first_request TIMESTAMPTZ,
  last_request TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status_code < 400)::BIGINT,
    COUNT(*) FILTER (WHERE status_code >= 400)::BIGINT,
    COALESCE(SUM(tokens_total), 0)::BIGINT,
    COALESCE(SUM(cost_cents), 0)::BIGINT,
    COALESCE(AVG(latency_ms), 0)::NUMERIC,
    MIN(created_at),
    MAX(created_at)
  FROM calos_api_key_usage_log
  WHERE key_id = p_key_id AND created_at >= p_since;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. VIEWS FOR ANALYTICS
-- ============================================================================

-- Active platform API keys with usage stats
CREATE OR REPLACE VIEW active_platform_api_keys AS
SELECT
  k.key_id,
  k.tenant_id,
  t.tenant_name,
  k.key_prefix,
  k.key_suffix_last4,
  k.key_name,
  k.status,
  k.created_at,
  k.last_used_at,
  k.total_requests,
  k.rate_limit_per_hour,
  k.rate_limit_per_day,
  -- Usage in last 24 hours
  (
    SELECT COUNT(*)
    FROM calos_api_key_usage_log l
    WHERE l.key_id = k.key_id AND l.created_at >= NOW() - INTERVAL '24 hours'
  ) AS requests_last_24h,
  -- Usage in last hour
  (
    SELECT COUNT(*)
    FROM calos_api_key_usage_log l
    WHERE l.key_id = k.key_id AND l.created_at >= NOW() - INTERVAL '1 hour'
  ) AS requests_last_hour
FROM calos_platform_api_keys k
JOIN tenants t ON t.tenant_id = k.tenant_id
WHERE k.status = 'active'
ORDER BY k.last_used_at DESC NULLS LAST;

COMMENT ON VIEW active_platform_api_keys IS 'Active platform API keys with usage statistics';

-- Platform API key usage by endpoint
CREATE OR REPLACE VIEW platform_api_key_usage_by_endpoint AS
SELECT
  k.tenant_id,
  t.tenant_name,
  k.key_name,
  l.endpoint,
  COUNT(*) AS requests,
  COUNT(*) FILTER (WHERE l.status_code < 400) AS successful,
  COUNT(*) FILTER (WHERE l.status_code >= 400) AS failed,
  AVG(l.latency_ms)::INTEGER AS avg_latency_ms,
  SUM(l.tokens_total) AS total_tokens,
  SUM(l.cost_cents) AS total_cost_cents
FROM calos_api_key_usage_log l
JOIN calos_platform_api_keys k ON k.key_id = l.key_id
JOIN tenants t ON t.tenant_id = k.tenant_id
WHERE l.created_at >= NOW() - INTERVAL '30 days'
GROUP BY k.tenant_id, t.tenant_name, k.key_name, l.endpoint
ORDER BY requests DESC;

COMMENT ON VIEW platform_api_key_usage_by_endpoint IS 'Platform API key usage breakdown by endpoint (last 30 days)';

-- ============================================================================
-- 5. CLEANUP JOBS (Optional - run periodically)
-- ============================================================================

/**
 * Archive old usage logs (move to cold storage or delete)
 * Recommended: Run monthly
 */
CREATE OR REPLACE FUNCTION archive_old_platform_api_key_logs(
  p_days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete logs older than specified days
  DELETE FROM calos_api_key_usage_log
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION archive_old_platform_api_key_logs IS 'Archive/delete old usage logs (default: keep 90 days)';

-- ============================================================================
-- DONE
-- ============================================================================

COMMENT ON DATABASE calos IS 'CalOS - Multi-LLM routing platform with two-layer API keys';
