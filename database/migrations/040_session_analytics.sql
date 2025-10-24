/**
 * Migration 040: Session-Based Analytics (Privacy-First)
 *
 * Replace cookie-based tracking with server-side session analytics.
 *
 * Tables:
 * - analytics_page_views (anonymous page view tracking)
 * - analytics_feature_usage (feature/button click tracking)
 * - analytics_conversions (purchase/signup tracking)
 * - analytics_attribution (referral/affiliate tracking)
 *
 * What we DON'T track:
 * - Third-party cookies
 * - Cross-site tracking
 * - Personal browsing history
 */

-- ============================================================================
-- ANALYTICS PAGE VIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_page_views (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT, -- Hashed IP (can't be reversed)
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_page_views_session ON analytics_page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_user ON analytics_page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_path ON analytics_page_views(path);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_timestamp ON analytics_page_views(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_date_range ON analytics_page_views(timestamp, path);

COMMENT ON TABLE analytics_page_views IS 'Anonymous page view tracking (server-side only)';
COMMENT ON COLUMN analytics_page_views.ip_hash IS 'SHA-256 hash of IP address (one-way, for security not tracking)';

-- ============================================================================
-- ANALYTICS FEATURE USAGE
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_feature_usage (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  feature_name TEXT NOT NULL,
  feature_type TEXT NOT NULL, -- 'button', 'form', 'action', 'api'
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_feature_usage_session ON analytics_feature_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_feature_usage_user ON analytics_feature_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_feature_usage_feature ON analytics_feature_usage(feature_name);
CREATE INDEX IF NOT EXISTS idx_analytics_feature_usage_type ON analytics_feature_usage(feature_type);
CREATE INDEX IF NOT EXISTS idx_analytics_feature_usage_timestamp ON analytics_feature_usage(timestamp);

COMMENT ON TABLE analytics_feature_usage IS 'Track feature usage (button clicks, form submissions)';

-- ============================================================================
-- ANALYTICS CONVERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_conversions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  conversion_type TEXT NOT NULL, -- 'purchase', 'signup', 'subscription'
  conversion_value NUMERIC(10, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  referral_code TEXT,
  affiliate_code TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_conversions_session ON analytics_conversions(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_conversions_user ON analytics_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_conversions_type ON analytics_conversions(conversion_type);
CREATE INDEX IF NOT EXISTS idx_analytics_conversions_referral ON analytics_conversions(referral_code);
CREATE INDEX IF NOT EXISTS idx_analytics_conversions_affiliate ON analytics_conversions(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_analytics_conversions_timestamp ON analytics_conversions(timestamp);

COMMENT ON TABLE analytics_conversions IS 'Track conversions (purchases, signups, subscriptions)';

-- ============================================================================
-- ANALYTICS ATTRIBUTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_attribution (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  conversion_id INT REFERENCES analytics_conversions(id) ON DELETE CASCADE,
  referral_code TEXT,
  affiliate_code TEXT,
  conversion_value NUMERIC(10, 2) DEFAULT 0,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_attribution_session ON analytics_attribution(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_attribution_user ON analytics_attribution(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_attribution_conversion ON analytics_attribution(conversion_id);
CREATE INDEX IF NOT EXISTS idx_analytics_attribution_referral ON analytics_attribution(referral_code);
CREATE INDEX IF NOT EXISTS idx_analytics_attribution_affiliate ON analytics_attribution(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_analytics_attribution_timestamp ON analytics_attribution(timestamp);

COMMENT ON TABLE analytics_attribution IS 'Track attribution for referrals and affiliates';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Daily page view summary
CREATE OR REPLACE VIEW analytics_daily_page_views AS
SELECT
  DATE(timestamp) as date,
  path,
  COUNT(*) as view_count,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
FROM analytics_page_views
GROUP BY DATE(timestamp), path
ORDER BY date DESC, view_count DESC;

COMMENT ON VIEW analytics_daily_page_views IS 'Daily aggregated page view statistics';

-- View: Daily feature usage summary
CREATE OR REPLACE VIEW analytics_daily_feature_usage AS
SELECT
  DATE(timestamp) as date,
  feature_name,
  feature_type,
  COUNT(*) as usage_count,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
FROM analytics_feature_usage
GROUP BY DATE(timestamp), feature_name, feature_type
ORDER BY date DESC, usage_count DESC;

COMMENT ON VIEW analytics_daily_feature_usage IS 'Daily aggregated feature usage statistics';

-- View: Daily conversion summary
CREATE OR REPLACE VIEW analytics_daily_conversions AS
SELECT
  DATE(timestamp) as date,
  conversion_type,
  COUNT(*) as conversion_count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(conversion_value) as total_value,
  AVG(conversion_value) as avg_value,
  currency
FROM analytics_conversions
GROUP BY DATE(timestamp), conversion_type, currency
ORDER BY date DESC, conversion_count DESC;

COMMENT ON VIEW analytics_daily_conversions IS 'Daily aggregated conversion statistics';

-- View: Attribution performance
CREATE OR REPLACE VIEW analytics_attribution_performance AS
SELECT
  COALESCE(referral_code, affiliate_code) as code,
  CASE
    WHEN referral_code IS NOT NULL THEN 'referral'
    ELSE 'affiliate'
  END as code_type,
  COUNT(*) as conversion_count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(conversion_value) as total_value,
  AVG(conversion_value) as avg_value,
  MIN(timestamp) as first_conversion,
  MAX(timestamp) as last_conversion
FROM analytics_attribution
WHERE referral_code IS NOT NULL OR affiliate_code IS NOT NULL
GROUP BY code, code_type
ORDER BY total_value DESC;

COMMENT ON VIEW analytics_attribution_performance IS 'Attribution performance by referral/affiliate code';

-- View: Session duration statistics
CREATE OR REPLACE VIEW analytics_session_duration AS
SELECT
  session_id,
  MIN(timestamp) as session_start,
  MAX(timestamp) as session_end,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) as duration_seconds,
  COUNT(*) as page_views
FROM analytics_page_views
GROUP BY session_id
HAVING COUNT(*) > 1;

COMMENT ON VIEW analytics_session_duration IS 'Session duration and page view count';

-- View: Top referrers
CREATE OR REPLACE VIEW analytics_top_referrers AS
SELECT
  referrer,
  COUNT(*) as visit_count,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
  MAX(timestamp) as last_visit
FROM analytics_page_views
WHERE referrer IS NOT NULL AND referrer != ''
GROUP BY referrer
ORDER BY visit_count DESC;

COMMENT ON VIEW analytics_top_referrers IS 'Top traffic sources by referrer';

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Clean up old analytics data (GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_old_analytics(retention_days INT DEFAULT 90)
RETURNS TABLE (
  table_name TEXT,
  deleted_rows BIGINT
) AS $$
DECLARE
  cutoff_date TIMESTAMP;
  deleted_count BIGINT;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;

  -- Clean up page views
  DELETE FROM analytics_page_views WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_page_views'::TEXT, deleted_count;

  -- Clean up feature usage
  DELETE FROM analytics_feature_usage WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_feature_usage'::TEXT, deleted_count;

  -- Clean up conversions
  DELETE FROM analytics_conversions WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_conversions'::TEXT, deleted_count;

  -- Clean up attribution (cascade will handle this from conversions)
  DELETE FROM analytics_attribution WHERE timestamp < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN QUERY SELECT 'analytics_attribution'::TEXT, deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_analytics IS 'Auto-delete analytics data older than retention period (GDPR compliance)';

-- Function: Get analytics summary for date range
CREATE OR REPLACE FUNCTION get_analytics_summary(
  start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  metric TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'total_page_views'::TEXT, COUNT(*)::BIGINT
  FROM analytics_page_views
  WHERE timestamp BETWEEN start_date AND end_date
  UNION ALL
  SELECT 'unique_sessions'::TEXT, COUNT(DISTINCT session_id)::BIGINT
  FROM analytics_page_views
  WHERE timestamp BETWEEN start_date AND end_date
  UNION ALL
  SELECT 'unique_users'::TEXT, COUNT(DISTINCT user_id)::BIGINT
  FROM analytics_page_views
  WHERE timestamp BETWEEN start_date AND end_date AND user_id IS NOT NULL
  UNION ALL
  SELECT 'total_conversions'::TEXT, COUNT(*)::BIGINT
  FROM analytics_conversions
  WHERE timestamp BETWEEN start_date AND end_date
  UNION ALL
  SELECT 'total_conversion_value'::TEXT, COALESCE(SUM(conversion_value), 0)::BIGINT
  FROM analytics_conversions
  WHERE timestamp BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_analytics_summary IS 'Get high-level analytics summary for date range';

-- ============================================================================
-- SCHEDULED CLEANUP (Optional - requires pg_cron extension)
-- ============================================================================

-- Uncomment if pg_cron is installed:
-- SELECT cron.schedule('cleanup-old-analytics', '0 2 * * *', 'SELECT cleanup_old_analytics(90)');

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to app user (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT SELECT ON ALL VIEWS IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 040: Session-Based Analytics (Privacy-First) - Complete' as status;
