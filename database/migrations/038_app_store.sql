/**
 * Migration 038: Virtual App Store
 *
 * Tables for virtual app provisioning system:
 * - App templates (marketplace)
 * - User installed apps (virtual instances)
 * - App instances (tenant isolation)
 * - QR sessions (loop verification)
 * - Biometric credentials (FaceID/TouchID)
 * - Launcher state (iPhone-style folders)
 */

-- ============================================================================
-- APP TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_templates (
  template_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL,
  category TEXT NOT NULL, -- 'social', 'gaming', 'business', 'community'
  tags JSONB DEFAULT '[]',
  features JSONB DEFAULT '[]',
  schema_sql TEXT, -- SQL to create app schema
  config JSONB DEFAULT '{}',
  price_cents INT DEFAULT 0,
  install_count INT DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 0.0,
  featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'deprecated'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_templates_category ON app_templates(category);
CREATE INDEX IF NOT EXISTS idx_app_templates_featured ON app_templates(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_app_templates_status ON app_templates(status);

COMMENT ON TABLE app_templates IS 'Pre-built app templates users can install (like Bonk Game SDK)';

-- ============================================================================
-- USER INSTALLED APPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_installed_apps (
  app_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id TEXT NOT NULL REFERENCES app_templates(template_id),
  tenant_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  folder_path TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- 'active', 'uninstalled', 'suspended'
  installed_at TIMESTAMP DEFAULT NOW(),
  uninstalled_at TIMESTAMP,
  UNIQUE(user_id, template_id, status)
);

CREATE INDEX IF NOT EXISTS idx_user_installed_apps_user ON user_installed_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_installed_apps_template ON user_installed_apps(template_id);
CREATE INDEX IF NOT EXISTS idx_user_installed_apps_status ON user_installed_apps(status);
CREATE INDEX IF NOT EXISTS idx_user_installed_apps_subdomain ON user_installed_apps(subdomain);

COMMENT ON TABLE user_installed_apps IS 'Apps installed by users (virtual provisioning - folder on server)';

-- ============================================================================
-- APP INSTANCES (TENANT ISOLATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_instances (
  tenant_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id TEXT NOT NULL REFERENCES app_templates(template_id),
  status TEXT DEFAULT 'active', -- 'active', 'suspended', 'terminated'
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_instances_user ON app_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_app_instances_template ON app_instances(template_id);

COMMENT ON TABLE app_instances IS 'Isolated tenant instances for each app installation';

-- ============================================================================
-- API KEYS (FOR APP INSTANCES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  app_id UUID REFERENCES user_installed_apps(app_id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_app ON api_keys(app_id);

COMMENT ON TABLE api_keys IS 'API keys for app instances';

-- ============================================================================
-- QR SESSIONS (LOOP VERIFICATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS qr_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  user_id UUID,
  session_type TEXT NOT NULL, -- 'login', 'purchase', 'profile_setup', 'app_install'
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'expired'
  metadata JSONB DEFAULT '{}',
  completion_data JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_token ON qr_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_user ON qr_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_status ON qr_sessions(status);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_expires ON qr_sessions(expires_at);

COMMENT ON TABLE qr_sessions IS 'QR loop verification - same QR at start and end';

-- ============================================================================
-- BIOMETRIC CREDENTIALS (FACEID/TOUCHID)
-- ============================================================================

CREATE TABLE IF NOT EXISTS biometric_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  public_key TEXT NOT NULL,
  counter INT DEFAULT 0,
  device_type TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_biometric_credentials_user ON biometric_credentials(user_id);

COMMENT ON TABLE biometric_credentials IS 'WebAuthn biometric credentials (FaceID/TouchID)';

-- ============================================================================
-- BIOMETRIC CHALLENGES (WEBAUTHN)
-- ============================================================================

CREATE TABLE IF NOT EXISTS biometric_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL, -- 'registration', 'authentication'
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_challenges_user ON biometric_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_challenges_expires ON biometric_challenges(expires_at);

COMMENT ON TABLE biometric_challenges IS 'WebAuthn challenges for biometric auth';

-- ============================================================================
-- LAUNCHER FOLDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS launcher_folders (
  folder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  position INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launcher_folders_user ON launcher_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_launcher_folders_position ON launcher_folders(user_id, position);

COMMENT ON TABLE launcher_folders IS 'iPhone-style folders in launcher';

-- ============================================================================
-- LAUNCHER APPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS launcher_apps (
  user_id UUID NOT NULL,
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  folder_id UUID REFERENCES launcher_folders(folder_id) ON DELETE SET NULL,
  position INT NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_launcher_apps_user ON launcher_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_launcher_apps_folder ON launcher_apps(folder_id);
CREATE INDEX IF NOT EXISTS idx_launcher_apps_position ON launcher_apps(user_id, folder_id, position);

COMMENT ON TABLE launcher_apps IS 'Apps in user launcher (home screen)';

-- ============================================================================
-- APP LAUNCH LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_launch_log (
  user_id UUID NOT NULL,
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  last_opened_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_app_launch_log_user ON app_launch_log(user_id, last_opened_at DESC);

COMMENT ON TABLE app_launch_log IS 'Track recently used apps';

-- ============================================================================
-- APP RATINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_ratings (
  rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL REFERENCES app_templates(template_id),
  user_id UUID NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_ratings_template ON app_ratings(template_id);
CREATE INDEX IF NOT EXISTS idx_app_ratings_user ON app_ratings(user_id);

COMMENT ON TABLE app_ratings IS 'User ratings for app templates';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update app_templates.updated_at
CREATE OR REPLACE FUNCTION update_app_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_app_templates_updated
  BEFORE UPDATE ON app_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_app_template_timestamp();

-- Auto-update app_instances.last_accessed
CREATE OR REPLACE FUNCTION update_app_instance_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app_instances
  SET last_accessed = NOW()
  WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: User's complete app inventory
CREATE OR REPLACE VIEW user_app_inventory AS
SELECT
  uia.app_id,
  uia.user_id,
  uia.template_id,
  uia.subdomain,
  uia.folder_path,
  uia.installed_at,
  at.name,
  at.description,
  at.icon,
  at.category,
  la.folder_id,
  la.position,
  lf.name as folder_name
FROM user_installed_apps uia
JOIN app_templates at ON at.template_id = uia.template_id
LEFT JOIN launcher_apps la ON la.app_id = uia.app_id AND la.user_id = uia.user_id
LEFT JOIN launcher_folders lf ON lf.folder_id = la.folder_id
WHERE uia.status = 'active';

COMMENT ON VIEW user_app_inventory IS 'Complete view of user apps with launcher organization';

-- View: Template popularity
CREATE OR REPLACE VIEW template_popularity AS
SELECT
  at.template_id,
  at.name,
  at.category,
  at.icon,
  at.install_count,
  at.rating,
  COUNT(DISTINCT uia.user_id) as active_users,
  COUNT(DISTINCT ar.rating_id) as rating_count
FROM app_templates at
LEFT JOIN user_installed_apps uia ON uia.template_id = at.template_id AND uia.status = 'active'
LEFT JOIN app_ratings ar ON ar.template_id = at.template_id
WHERE at.status = 'active'
GROUP BY at.template_id, at.name, at.category, at.icon, at.install_count, at.rating
ORDER BY at.install_count DESC;

COMMENT ON VIEW template_popularity IS 'Template popularity metrics';

-- View: Active QR sessions
CREATE OR REPLACE VIEW active_qr_sessions AS
SELECT
  session_id,
  user_id,
  session_type,
  started_at,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining
FROM qr_sessions
WHERE status = 'active'
  AND expires_at > NOW()
ORDER BY started_at DESC;

COMMENT ON VIEW active_qr_sessions IS 'Currently active QR sessions';

-- ============================================================================
-- SEED DEFAULT TEMPLATES
-- ============================================================================

INSERT INTO app_templates (template_id, name, description, icon, category, tags, features, price_cents)
VALUES
  ('dating', 'Dating App', 'Tinder-style dating app with swipe cards, matches, and chat', '💕', 'social',
   '["dating", "social", "chat", "matching"]'::jsonb,
   '["Swipe cards", "Match algorithm", "Direct messaging", "Profile photos", "Location-based matching"]'::jsonb,
   0),
  ('politics', 'Politics Forum', 'Reddit-style forum for political discussions', '🗳️', 'community',
   '["politics", "forum", "debate", "community"]'::jsonb,
   '["Threaded discussions", "Upvote/downvote", "Topic categories", "User reputation", "Moderation tools"]'::jsonb,
   0),
  ('gaming', 'Game Lobby', 'Multiplayer game lobby with matchmaking and leaderboards', '🎮', 'gaming',
   '["gaming", "multiplayer", "matchmaking", "leaderboard"]'::jsonb,
   '["Matchmaking system", "Leaderboards", "Player stats", "Team creation", "Tournament brackets"]'::jsonb,
   0),
  ('chat', 'Chat Room', 'Real-time chat with rooms, DMs, and reactions', '💬', 'social',
   '["chat", "messaging", "real-time", "social"]'::jsonb,
   '["Multiple chat rooms", "Direct messages", "Message reactions", "Typing indicators", "Read receipts"]'::jsonb,
   0),
  ('ecommerce', 'E-Commerce Store', 'Shopify-style online store with cart and checkout', '🛒', 'business',
   '["ecommerce", "store", "shopping", "payments"]'::jsonb,
   '["Product catalog", "Shopping cart", "Stripe checkout", "Order management", "Inventory tracking"]'::jsonb,
   0)
ON CONFLICT (template_id) DO NOTHING;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_apps_active ON user_installed_apps(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_qr_sessions_active ON qr_sessions(status, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_launcher_apps_user_folder ON launcher_apps(user_id, folder_id, position);

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Cleanup expired QR sessions
CREATE OR REPLACE FUNCTION cleanup_expired_qr_sessions()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  UPDATE qr_sessions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_qr_sessions IS 'Mark expired QR sessions as expired';

-- Function: Cleanup old biometric challenges
CREATE OR REPLACE FUNCTION cleanup_old_biometric_challenges()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM biometric_challenges
  WHERE expires_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_biometric_challenges IS 'Delete old biometric challenges';

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

SELECT 'Migration 038: App Store - Complete' as status;
