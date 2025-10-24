-- Migration: Admin Role System
--
-- Purpose: Add role-based access control and make roughsparks an admin
-- Enables admin panel, user management, system configuration

-- ============================================================
-- Add role column to users table
-- ============================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Add index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Valid roles: 'user', 'admin', 'superadmin'
-- superadmin = full system access
-- admin = user management, content moderation
-- user = standard access

-- ============================================================
-- Create admin permissions table
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50), -- user_management, content, system, analytics
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default permissions
INSERT INTO admin_permissions (name, description, category) VALUES
  ('manage_users', 'Create, edit, and delete users', 'user_management'),
  ('manage_roles', 'Assign roles and permissions', 'user_management'),
  ('view_analytics', 'Access system analytics and reports', 'analytics'),
  ('manage_content', 'Moderate and manage user content', 'content'),
  ('manage_domains', 'Configure domain portfolio', 'system'),
  ('manage_agents', 'Configure AI agents and routing', 'system'),
  ('manage_challenges', 'Create and manage challenges', 'content'),
  ('manage_buckets', 'Manage token buckets and challenges', 'system'),
  ('view_logs', 'Access system logs and audit trails', 'system'),
  ('manage_billing', 'Access billing and payment systems', 'user_management')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Create role-permission mapping table
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(20) NOT NULL,
  permission_id UUID REFERENCES admin_permissions(permission_id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role, permission_id)
);

-- Grant all permissions to superadmin
INSERT INTO role_permissions (role, permission_id)
SELECT 'superadmin', permission_id FROM admin_permissions
ON CONFLICT DO NOTHING;

-- Grant subset to admin
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', permission_id FROM admin_permissions
WHERE category IN ('user_management', 'content', 'analytics')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Create admin action log (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL, -- create_user, delete_user, update_role, etc.
  target_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  target_resource VARCHAR(100), -- What was affected
  description TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_user_id);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_user_id);
CREATE INDEX idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at);

-- ============================================================
-- Make roughsparks / lolztex@gmail.com a superadmin
-- ============================================================

-- Update existing user if they exist
UPDATE users
SET role = 'superadmin'
WHERE email = 'lolztex@gmail.com';

-- If user doesn't exist, create them as superadmin (they'll set password on first login)
INSERT INTO users (
  email,
  username,
  display_name,
  role,
  password_hash,
  email_verified,
  status,
  created_at
)
VALUES (
  'lolztex@gmail.com',
  'roughsparks',
  'RoughSparks',
  'superadmin',
  '$2b$10$placeholder.hash.will.be.reset.on.first.login', -- Placeholder, requires password reset
  TRUE, -- Pre-verified
  'active',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'superadmin',
  username = COALESCE(users.username, 'roughsparks'),
  display_name = COALESCE(users.display_name, 'RoughSparks');

-- Log the admin creation
INSERT INTO admin_actions (
  admin_user_id,
  action_type,
  target_user_id,
  description,
  metadata
)
SELECT
  user_id,
  'create_superadmin',
  user_id,
  'System migration: Created superadmin account for roughsparks',
  '{"migration": "011_add_admin_roles", "auto_created": true}'::jsonb
FROM users
WHERE email = 'lolztex@gmail.com';

-- ============================================================
-- Grant Permissions
-- ============================================================
COMMENT ON TABLE admin_permissions IS 'Granular permissions for role-based access control';
COMMENT ON TABLE role_permissions IS 'Maps permissions to roles (admin, superadmin)';
COMMENT ON TABLE admin_actions IS 'Audit log of all admin actions for security and compliance';
COMMENT ON COLUMN users.role IS 'User role: user (default), admin (moderation), superadmin (full access)';
