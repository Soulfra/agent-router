-- Migration 145: Identity Resolution & Domain Pairing System
-- Solves identity fragmentation across OAuth providers and domain-specific task routing

-- ============================================================================
-- Identity Clusters Table
-- Master identity hub that links all OAuth accounts under one unified ID
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_clusters (
  cluster_id VARCHAR(255) PRIMARY KEY,

  -- Primary identity
  primary_email VARCHAR(255) NOT NULL,
  primary_provider VARCHAR(100), -- 'github', 'google', 'twitter', etc.
  display_name VARCHAR(255),
  avatar_url TEXT,

  -- Reputation & trust
  reputation_score INTEGER DEFAULT 0, -- 0-1000, increases with verified accounts
  trust_level VARCHAR(50) DEFAULT 'unverified', -- 'unverified', 'email_verified', 'multi_account', 'trusted', 'elite'
  verification_method VARCHAR(100), -- 'oauth', 'voice_auth', 'manual_review', 'easter_hunt'

  -- Account statistics
  linked_accounts_count INTEGER DEFAULT 0,
  verified_accounts_count INTEGER DEFAULT 0,
  pending_links_count INTEGER DEFAULT 0,

  -- Payment tier
  payment_tier VARCHAR(50) DEFAULT 'tier_1', -- 'tier_1' to 'tier_5'
  max_task_value NUMERIC(10, 2) DEFAULT 2.00, -- Max task value they can access

  -- Domain preferences
  preferred_domain VARCHAR(255), -- 'soulfra.com', 'calriven.com', 'deathtodata.com', 'roughsparks.com'
  domain_specializations TEXT[], -- ['ai-agents', 'content-creation', 'search-indexing']

  -- Activity tracking
  total_tasks_completed INTEGER DEFAULT 0,
  total_earned NUMERIC(10, 2) DEFAULT 0.00,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_identity_clusters_email ON identity_clusters(primary_email);
CREATE INDEX idx_identity_clusters_reputation ON identity_clusters(reputation_score DESC);
CREATE INDEX idx_identity_clusters_tier ON identity_clusters(payment_tier);
CREATE INDEX idx_identity_clusters_domain ON identity_clusters(preferred_domain);

-- ============================================================================
-- Identity Links Table
-- Links multiple OAuth accounts to the same identity cluster
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_links (
  id SERIAL PRIMARY KEY,
  cluster_id VARCHAR(255) NOT NULL REFERENCES identity_clusters(cluster_id) ON DELETE CASCADE,

  -- Linked account details
  provider VARCHAR(100) NOT NULL, -- 'github', 'google', 'twitter', 'discord', 'linkedin'
  provider_user_id VARCHAR(255) NOT NULL, -- User ID from OAuth provider
  provider_email VARCHAR(255), -- Email from OAuth (may differ from primary)
  provider_username VARCHAR(255), -- @handle or username

  -- Verification
  link_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'verified', 'rejected', 'expired'
  verification_method VARCHAR(100), -- 'same_email', 'same_ip', 'browser_fingerprint', 'manual_approval'
  verification_evidence JSONB DEFAULT '{}', -- { emailMatch: true, ipMatch: true, browserMatch: false }
  confidence_score INTEGER DEFAULT 0, -- 0-100, how confident we are this is the same person

  -- OAuth tokens (for future API access)
  access_token_encrypted TEXT, -- Encrypted OAuth access token
  refresh_token_encrypted TEXT, -- Encrypted refresh token
  token_expires_at TIMESTAMP,
  scopes TEXT[], -- OAuth scopes granted

  -- Account metadata from provider
  account_metadata JSONB DEFAULT '{}', -- { followers: 1500, repos: 42, bio: "..." }

  -- Timestamps
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  last_refreshed TIMESTAMP,

  UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_identity_links_cluster ON identity_links(cluster_id);
CREATE INDEX idx_identity_links_provider ON identity_links(provider, provider_user_id);
CREATE INDEX idx_identity_links_status ON identity_links(link_status);
CREATE INDEX idx_identity_links_email ON identity_links(provider_email);

-- ============================================================================
-- Account Discovery Table
-- Detects active login sessions from browser cookies/localStorage
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_discovery (
  id SERIAL PRIMARY KEY,
  cluster_id VARCHAR(255) REFERENCES identity_clusters(cluster_id) ON DELETE SET NULL,

  -- Discovered account
  platform VARCHAR(100) NOT NULL, -- 'github', 'google', 'comet', 'perplexity', 'notion', 'linear'
  detected_email VARCHAR(255), -- Email detected from session
  detected_username VARCHAR(255), -- Username/handle detected
  session_identifier TEXT, -- Cookie value or session ID (hashed)

  -- Detection metadata
  detection_method VARCHAR(100) NOT NULL, -- 'cookie_scan', 'localstorage_scan', 'browser_extension', 'manual_input'
  detection_source VARCHAR(255), -- 'chrome', 'firefox', 'safari', 'brave'
  browser_fingerprint VARCHAR(255), -- Unique browser fingerprint
  ip_address INET, -- IP address at time of detection
  user_agent TEXT, -- Browser user agent

  -- Link suggestion
  suggested_for_linking BOOLEAN DEFAULT false, -- Should we suggest linking this account?
  suggestion_confidence INTEGER DEFAULT 0, -- 0-100
  suggestion_reason TEXT, -- "Email matches primary email"

  -- User action
  user_action VARCHAR(50), -- 'ignored', 'linked', 'rejected', 'pending'
  actioned_at TIMESTAMP,

  -- Timestamps
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days' -- Auto-expire suggestions after 7 days
);

CREATE INDEX idx_account_discovery_cluster ON account_discovery(cluster_id);
CREATE INDEX idx_account_discovery_platform ON account_discovery(platform);
CREATE INDEX idx_account_discovery_email ON account_discovery(detected_email);
CREATE INDEX idx_account_discovery_suggestion ON account_discovery(suggested_for_linking, user_action);

-- ============================================================================
-- Domain Task Routing Table
-- Routes tasks to specific domains based on user skills and domain requirements
-- ============================================================================
CREATE TABLE IF NOT EXISTS domain_task_routing (
  id SERIAL PRIMARY KEY,

  -- Task definition
  task_id VARCHAR(255), -- References training_tasks or voice_onboarding_sessions
  task_type VARCHAR(100) NOT NULL, -- 'voice_auth', 'micro_task', 'contest', 'easter_hunt', 'bounty'

  -- Domain routing
  assigned_domain VARCHAR(255) NOT NULL, -- 'soulfra.com', 'calriven.com', 'deathtodata.com', 'roughsparks.com'
  domain_service VARCHAR(100) NOT NULL, -- 'auth', 'sso', 'agent-runtime', 'content', 'search', 'indexing'

  -- Requirements
  required_reputation INTEGER DEFAULT 0, -- Min reputation score to access
  required_tier VARCHAR(50) DEFAULT 'tier_1', -- Min payment tier
  required_verified_accounts INTEGER DEFAULT 0, -- Min number of verified accounts
  required_skills TEXT[], -- ['javascript', 'design', 'ai-agents']

  -- Task metadata
  payment_amount NUMERIC(10, 2) NOT NULL,
  difficulty VARCHAR(50), -- 'micro', 'quick', 'standard', 'premium', 'bounty'
  estimated_time_minutes INTEGER, -- Estimated completion time

  -- Assignment tracking
  assigned_to_cluster VARCHAR(255) REFERENCES identity_clusters(cluster_id),
  assignment_status VARCHAR(50) DEFAULT 'available', -- 'available', 'assigned', 'in_progress', 'completed', 'expired'
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_domain_task_routing_domain ON domain_task_routing(assigned_domain);
CREATE INDEX idx_domain_task_routing_type ON domain_task_routing(task_type);
CREATE INDEX idx_domain_task_routing_status ON domain_task_routing(assignment_status);
CREATE INDEX idx_domain_task_routing_cluster ON domain_task_routing(assigned_to_cluster);
CREATE INDEX idx_domain_task_routing_tier ON domain_task_routing(required_tier, required_reputation);

-- ============================================================================
-- Reputation Payment Tiers Table
-- Defines payment tiers based on reputation and verified accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS reputation_payment_tiers (
  tier_id SERIAL PRIMARY KEY,
  tier_name VARCHAR(50) UNIQUE NOT NULL, -- 'tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5'
  display_name VARCHAR(100) NOT NULL, -- 'Unverified', 'Email Verified', 'Multi-Account', 'Trusted', 'Elite'

  -- Requirements
  min_reputation INTEGER NOT NULL,
  max_reputation INTEGER NOT NULL,
  min_verified_accounts INTEGER DEFAULT 0,
  min_completed_tasks INTEGER DEFAULT 0,

  -- Payment limits
  max_task_value NUMERIC(10, 2) NOT NULL,
  max_daily_earnings NUMERIC(10, 2) NOT NULL,
  max_monthly_earnings NUMERIC(10, 2) NOT NULL,

  -- Features unlocked
  allows_voice_auth BOOLEAN DEFAULT false,
  allows_micro_tasks BOOLEAN DEFAULT true,
  allows_contests BOOLEAN DEFAULT false,
  allows_easter_hunts BOOLEAN DEFAULT false,
  allows_bounties BOOLEAN DEFAULT false,
  payment_milestones_required BOOLEAN DEFAULT true, -- Tier 5 gets instant payouts

  -- Badge
  tier_badge VARCHAR(255), -- Icon or emoji for tier
  tier_color VARCHAR(20), -- Hex color for UI

  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed the 5 payment tiers
INSERT INTO reputation_payment_tiers (
  tier_name, display_name,
  min_reputation, max_reputation,
  min_verified_accounts, min_completed_tasks,
  max_task_value, max_daily_earnings, max_monthly_earnings,
  allows_voice_auth, allows_micro_tasks, allows_contests, allows_easter_hunts, allows_bounties,
  payment_milestones_required,
  tier_badge, tier_color, description
) VALUES
-- Tier 1: Unverified (new users)
('tier_1', 'Unverified', 0, 99, 0, 0,
 2.00, 20.00, 100.00,
 false, true, false, false, false, true,
 '🆕', '#808080',
 'New users with no verified accounts. Access to micro-tasks ($0.10-$2) only. Complete tasks and verify accounts to unlock higher tiers.'),

-- Tier 2: Email Verified
('tier_2', 'Email Verified', 100, 299, 1, 5,
 10.00, 50.00, 500.00,
 false, true, false, false, false, true,
 '✉️', '#3B82F6',
 'Email verified users. Access to standard tasks ($2-$10). Complete 5+ tasks and link more accounts to advance.'),

-- Tier 3: Multi-Account (voice auth unlocked)
('tier_3', 'Multi-Account', 300, 599, 2, 20,
 175.00, 200.00, 2000.00,
 true, true, true, false, false, true,
 '🔗', '#10B981',
 'Users with 2+ verified accounts. Access to voice auth ($175), premium tasks ($10-$50), and contests. Link more accounts for bounties.'),

-- Tier 4: Trusted (easter hunts unlocked)
('tier_4', 'Trusted', 600, 899, 5, 50,
 5000.00, 1000.00, 10000.00,
 true, true, true, true, true, true,
 '⭐', '#F59E0B',
 'Trusted users with 5+ verified accounts and 50+ completed tasks. Access to easter hunts and bounties ($50-$5000). High-value opportunities.'),

-- Tier 5: Elite (instant payouts)
('tier_5', 'Elite', 900, 1000, 10, 100,
 10000.00, 5000.00, 50000.00,
 true, true, true, true, true, false,
 '👑', '#8B5CF6',
 'Elite contributors with 10+ verified accounts and 100+ completed tasks. Instant payouts (no milestones). Exclusive high-value bounties and direct partnerships.');

-- ============================================================================
-- Update existing tables with cluster_id references
-- ============================================================================

-- Link voice onboarding sessions to identity clusters
ALTER TABLE voice_onboarding_sessions
  ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(255) REFERENCES identity_clusters(cluster_id) ON DELETE SET NULL;

CREATE INDEX idx_voice_sessions_cluster ON voice_onboarding_sessions(cluster_id);

-- Link training tasks to identity clusters
ALTER TABLE training_tasks
  ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(255) REFERENCES identity_clusters(cluster_id) ON DELETE SET NULL;

CREATE INDEX idx_training_tasks_cluster ON training_tasks(cluster_id);

-- Link contest submissions to identity clusters
ALTER TABLE contest_submissions
  ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(255) REFERENCES identity_clusters(cluster_id) ON DELETE SET NULL;

CREATE INDEX idx_contest_submissions_cluster ON contest_submissions(cluster_id);

-- ============================================================================
-- Views for easy querying
-- ============================================================================

-- Identity Cluster Dashboard View
CREATE OR REPLACE VIEW identity_cluster_dashboard AS
SELECT
  ic.cluster_id,
  ic.primary_email,
  ic.display_name,
  ic.reputation_score,
  ic.trust_level,
  ic.payment_tier,
  rpt.display_name as tier_display_name,
  rpt.tier_badge,
  rpt.max_task_value,
  rpt.allows_voice_auth,
  rpt.allows_bounties,
  ic.linked_accounts_count,
  ic.verified_accounts_count,
  ic.total_tasks_completed,
  ic.total_earned,
  ic.preferred_domain,
  ic.last_active,
  COUNT(DISTINCT il.id) as total_oauth_connections,
  COUNT(DISTINCT il.id) FILTER (WHERE il.link_status = 'verified') as verified_oauth_connections,
  COUNT(DISTINCT ad.id) FILTER (WHERE ad.suggested_for_linking = true AND ad.user_action IS NULL) as pending_link_suggestions
FROM identity_clusters ic
LEFT JOIN reputation_payment_tiers rpt ON ic.payment_tier = rpt.tier_name
LEFT JOIN identity_links il ON ic.cluster_id = il.cluster_id
LEFT JOIN account_discovery ad ON ic.cluster_id = ad.cluster_id
GROUP BY ic.cluster_id, rpt.display_name, rpt.tier_badge, rpt.max_task_value, rpt.allows_voice_auth, rpt.allows_bounties;

-- Account Discovery Suggestions View
CREATE OR REPLACE VIEW account_discovery_suggestions AS
SELECT
  ad.id,
  ad.cluster_id,
  ic.primary_email,
  ic.display_name,
  ad.platform,
  ad.detected_email,
  ad.detected_username,
  ad.detection_method,
  ad.suggestion_confidence,
  ad.suggestion_reason,
  ad.discovered_at,
  ad.expires_at
FROM account_discovery ad
JOIN identity_clusters ic ON ad.cluster_id = ic.cluster_id
WHERE ad.suggested_for_linking = true
  AND ad.user_action IS NULL
  AND ad.expires_at > NOW()
ORDER BY ad.suggestion_confidence DESC, ad.discovered_at DESC;

-- Domain Task Availability View
CREATE OR REPLACE VIEW domain_task_availability AS
SELECT
  dtr.id as routing_id,
  dtr.task_id,
  dtr.task_type,
  dtr.assigned_domain,
  dtr.domain_service,
  dtr.payment_amount,
  dtr.difficulty,
  dtr.estimated_time_minutes,
  dtr.required_reputation,
  rpt.display_name as required_tier_name,
  dtr.required_verified_accounts,
  dtr.required_skills,
  dtr.assignment_status,
  COUNT(*) FILTER (WHERE ic.reputation_score >= dtr.required_reputation AND ic.payment_tier >= dtr.required_tier) as eligible_users_count
FROM domain_task_routing dtr
JOIN reputation_payment_tiers rpt ON dtr.required_tier = rpt.tier_name
LEFT JOIN identity_clusters ic ON ic.reputation_score >= dtr.required_reputation
WHERE dtr.assignment_status = 'available'
GROUP BY dtr.id, rpt.display_name;

-- ============================================================================
-- Trigger functions
-- ============================================================================

-- Auto-update identity cluster statistics when links change
CREATE OR REPLACE FUNCTION update_identity_cluster_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE identity_clusters
  SET
    linked_accounts_count = (
      SELECT COUNT(*) FROM identity_links WHERE cluster_id = NEW.cluster_id
    ),
    verified_accounts_count = (
      SELECT COUNT(*) FROM identity_links WHERE cluster_id = NEW.cluster_id AND link_status = 'verified'
    ),
    pending_links_count = (
      SELECT COUNT(*) FROM identity_links WHERE cluster_id = NEW.cluster_id AND link_status = 'pending'
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE cluster_id = NEW.cluster_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cluster_stats_on_link
AFTER INSERT OR UPDATE ON identity_links
FOR EACH ROW
EXECUTE FUNCTION update_identity_cluster_stats();

-- Auto-calculate reputation score based on verified accounts
CREATE OR REPLACE FUNCTION calculate_reputation_score()
RETURNS TRIGGER AS $$
DECLARE
  v_verified_count INTEGER;
  v_completed_tasks INTEGER;
  v_new_score INTEGER;
  v_new_tier VARCHAR(50);
BEGIN
  -- Count verified accounts
  SELECT COUNT(*) INTO v_verified_count
  FROM identity_links
  WHERE cluster_id = NEW.cluster_id AND link_status = 'verified';

  -- Count completed tasks
  SELECT
    COALESCE(SUM(vos.questions_completed), 0) +
    COALESCE(COUNT(DISTINCT tt.id) FILTER (WHERE tt.status = 'completed'), 0) +
    COALESCE(COUNT(DISTINCT cs.id), 0)
  INTO v_completed_tasks
  FROM identity_clusters ic
  LEFT JOIN voice_onboarding_sessions vos ON ic.cluster_id = vos.cluster_id
  LEFT JOIN training_tasks tt ON ic.cluster_id = tt.cluster_id
  LEFT JOIN contest_submissions cs ON ic.cluster_id = cs.cluster_id
  WHERE ic.cluster_id = NEW.cluster_id;

  -- Calculate reputation score
  -- Formula: (verified_accounts * 100) + (completed_tasks * 5)
  v_new_score := LEAST((v_verified_count * 100) + (v_completed_tasks * 5), 1000);

  -- Determine payment tier
  SELECT tier_name INTO v_new_tier
  FROM reputation_payment_tiers
  WHERE v_new_score >= min_reputation
    AND v_new_score <= max_reputation
    AND v_verified_count >= min_verified_accounts
    AND v_completed_tasks >= min_completed_tasks
  ORDER BY min_reputation DESC
  LIMIT 1;

  -- Update cluster
  UPDATE identity_clusters
  SET
    reputation_score = v_new_score,
    payment_tier = COALESCE(v_new_tier, 'tier_1'),
    max_task_value = (SELECT max_task_value FROM reputation_payment_tiers WHERE tier_name = COALESCE(v_new_tier, 'tier_1')),
    total_tasks_completed = v_completed_tasks,
    updated_at = CURRENT_TIMESTAMP
  WHERE cluster_id = NEW.cluster_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_reputation
AFTER INSERT OR UPDATE ON identity_links
FOR EACH ROW
EXECUTE FUNCTION calculate_reputation_score();

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Get or create identity cluster from OAuth
CREATE OR REPLACE FUNCTION get_or_create_identity_cluster(
  p_provider VARCHAR(100),
  p_provider_user_id VARCHAR(255),
  p_email VARCHAR(255),
  p_display_name VARCHAR(255)
)
RETURNS VARCHAR(255) AS $$
DECLARE
  v_cluster_id VARCHAR(255);
  v_existing_link RECORD;
BEGIN
  -- Check if this OAuth account is already linked
  SELECT cluster_id INTO v_cluster_id
  FROM identity_links
  WHERE provider = p_provider AND provider_user_id = p_provider_user_id;

  IF v_cluster_id IS NOT NULL THEN
    RETURN v_cluster_id;
  END IF;

  -- Check if email matches existing cluster
  IF p_email IS NOT NULL THEN
    SELECT cluster_id INTO v_cluster_id
    FROM identity_clusters
    WHERE primary_email = p_email;
  END IF;

  -- Create new cluster if not found
  IF v_cluster_id IS NULL THEN
    v_cluster_id := 'cluster_' || gen_random_uuid()::TEXT;

    INSERT INTO identity_clusters (
      cluster_id, primary_email, primary_provider, display_name, trust_level
    ) VALUES (
      v_cluster_id, p_email, p_provider, p_display_name, 'unverified'
    );
  END IF;

  -- Link OAuth account to cluster
  INSERT INTO identity_links (
    cluster_id, provider, provider_user_id, provider_email,
    link_status, verification_method
  ) VALUES (
    v_cluster_id, p_provider, p_provider_user_id, p_email,
    'verified', 'oauth'
  )
  ON CONFLICT (provider, provider_user_id) DO NOTHING;

  RETURN v_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON identity_clusters TO matthewmauer;
GRANT ALL PRIVILEGES ON identity_links TO matthewmauer;
GRANT ALL PRIVILEGES ON account_discovery TO matthewmauer;
GRANT ALL PRIVILEGES ON domain_task_routing TO matthewmauer;
GRANT ALL PRIVILEGES ON reputation_payment_tiers TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE identity_links_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE account_discovery_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE domain_task_routing_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE reputation_payment_tiers_tier_id_seq TO matthewmauer;

-- Success indicator
SELECT 'Migration 145: Identity Resolution & Domain Pairing - Completed' as status;
