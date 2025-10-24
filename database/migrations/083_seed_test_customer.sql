/**
 * CALOS Test Customer Seed Data
 *
 * Creates sample customer for testing enterprise dashboard
 * and culture profile analysis
 *
 * Run this after 082_pricing_system.sql
 *
 * Usage:
 *   psql $DATABASE_URL -f 083_seed_test_customer.sql
 */

-- Ensure we have a user (use existing or create demo user)
DO $$
BEGIN
  -- Check if user with ID 1 exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = 1) THEN
    -- Create demo user
    INSERT INTO users (user_id, email, username, password_hash, created_at)
    VALUES (
      1,
      'demo@calos.sh',
      'demo',
      'demo_password_hash', -- Not used for enterprise
      NOW()
    );

    RAISE NOTICE 'Created demo user (ID: 1)';
  ELSE
    RAISE NOTICE 'Using existing user (ID: 1)';
  END IF;
END $$;

-- Create test customer subscription
INSERT INTO subscription_plans (
  user_id,
  install_id,
  tier_id,
  tier_slug,
  billing_period,
  status,
  current_period_start,
  current_period_end,
  trial_ends_at,
  created_at,
  updated_at
)
SELECT
  1, -- User ID
  'demo-install-abc123456789abcdef', -- Install ID (32 chars)
  tier_id,
  'pro', -- Tier slug
  'monthly',
  'active',
  NOW() - INTERVAL '15 days', -- Started 15 days ago
  NOW() + INTERVAL '15 days', -- Ends in 15 days
  NULL, -- No trial
  NOW() - INTERVAL '15 days',
  NOW()
FROM license_tiers
WHERE tier_slug = 'pro'
ON CONFLICT (user_id, install_id) DO NOTHING;

-- Create sample telemetry events (simulate 30 days of usage)
INSERT INTO telemetry_events (install_id, event_type, event_data, created_at)
SELECT
  'demo-install-abc123456789abcdef',
  event_types.type,
  jsonb_build_object(
    'source', 'demo',
    'userId', 'user_' || (random() * 5 + 1)::int, -- Simulate 5 users
    'duration', (random() * 1000 + 100)::int,
    'userAgent', user_agents.agent
  ),
  NOW() - (random() * INTERVAL '30 days') -- Random time in last 30 days
FROM
  generate_series(1, 500), -- 500 events
  (VALUES
    ('page_view'),
    ('api_call'),
    ('feature_used'),
    ('button_click'),
    ('transcript_upload'),
    ('pos_transaction'),
    ('quickbooks_sync'),
    ('dashboard_view'),
    ('report_generated')
  ) AS event_types(type),
  (VALUES
    ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0'),
    ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0'),
    ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')
  ) AS user_agents(agent)
WHERE random() < 0.1 -- Only 10% to get ~50 events
LIMIT 100;

-- Create sample usage tracking (billable events)
INSERT INTO usage_tracking (user_id, install_id, usage_type, usage_count, is_billable, created_at)
SELECT
  1,
  'demo-install-abc123456789abcdef',
  usage_types.type,
  (random() * 10 + 1)::int, -- Random count 1-10
  false, -- Pro tier gets unlimited for most things
  NOW() - (random() * INTERVAL '30 days')
FROM
  generate_series(1, 50),
  (VALUES
    ('transcript'),
    ('pos_in_person'),
    ('pos_online'),
    ('crypto'),
    ('location'),
    ('api_request')
  ) AS usage_types(type)
WHERE random() < 0.3 -- ~15 events
LIMIT 50;

-- Create brand config for the demo customer
INSERT INTO brand_configs (
  install_id,
  domain,
  brand_name,
  primary_color,
  logo_url,
  custom_css,
  created_at,
  updated_at
) VALUES (
  'demo-install-abc123456789abcdef',
  'demo.calos.sh',
  'Demo Corp',
  '#667eea',
  NULL,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (install_id) DO NOTHING;

-- Output summary
DO $$
DECLARE
  event_count INTEGER;
  usage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO event_count FROM telemetry_events WHERE install_id = 'demo-install-abc123456789abcdef';
  SELECT COUNT(*) INTO usage_count FROM usage_tracking WHERE install_id = 'demo-install-abc123456789abcdef';

  RAISE NOTICE '✓ Test customer created successfully';
  RAISE NOTICE '  Install ID: demo-install-abc123456789abcdef';
  RAISE NOTICE '  Tier: Pro';
  RAISE NOTICE '  Status: Active';
  RAISE NOTICE '  Telemetry events: %', event_count;
  RAISE NOTICE '  Usage records: %', usage_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Access enterprise dashboard:';
  RAISE NOTICE '  http://localhost:5001/enterprise-dashboard.html';
  RAISE NOTICE '';
  RAISE NOTICE 'Access culture profile:';
  RAISE NOTICE '  http://localhost:5001/culture-profile.html?install_id=demo-install-abc123456789abcdef';
END $$;
