-- Vanity Handles System (@username like Discord/Twitter)
-- Allows users to have unique, memorable handles across the platform
-- Handles can be used for: /api/@username, messaging, payments, profiles

-- Add handle column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle_lowercase VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle_set_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle_changes_remaining INTEGER DEFAULT 1;

-- Create index for case-insensitive handle lookups
CREATE INDEX IF NOT EXISTS idx_users_handle_lowercase ON users(handle_lowercase);

-- Handle reservation system (prevents squatting on premium handles)
CREATE TABLE IF NOT EXISTS handle_reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Handle details
  handle VARCHAR(30) NOT NULL UNIQUE,
  handle_lowercase VARCHAR(30) NOT NULL UNIQUE,

  -- Reservation type
  reservation_type TEXT NOT NULL, -- 'premium', 'brand', 'system', 'blocked'

  -- Ownership
  reserved_for_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reserved_by_admin TEXT,

  -- Status
  status TEXT DEFAULT 'reserved', -- 'reserved', 'claimed', 'released'

  -- Pricing (for premium handles)
  price_cents INTEGER DEFAULT 0,

  -- Metadata
  reason TEXT,
  notes TEXT,

  -- Timestamps
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,

  CONSTRAINT handle_reservations_handle_lowercase CHECK (handle_lowercase = LOWER(handle))
);

CREATE INDEX idx_handle_reservations_status ON handle_reservations(status);
CREATE INDEX idx_handle_reservations_type ON handle_reservations(reservation_type);

-- Handle history (audit trail of handle changes)
CREATE TABLE IF NOT EXISTS handle_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Change details
  old_handle VARCHAR(30),
  new_handle VARCHAR(30) NOT NULL,

  -- Context
  change_reason TEXT,
  changed_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  changed_by_admin TEXT,

  -- IP tracking (for abuse prevention)
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handle_history_user ON handle_history(user_id, changed_at DESC);
CREATE INDEX idx_handle_history_handle ON handle_history(new_handle);

-- Blocked handles (profanity, impersonation, abuse)
CREATE TABLE IF NOT EXISTS blocked_handles (
  block_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern matching
  handle_pattern VARCHAR(50) NOT NULL UNIQUE, -- Can include wildcards: 'admin*', '*fuck*'

  -- Block details
  block_reason TEXT NOT NULL, -- 'profanity', 'impersonation', 'system_reserved', 'abuse'
  blocked_by_admin TEXT,

  -- Metadata
  notes TEXT,

  -- Timestamp
  blocked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blocked_handles_reason ON blocked_handles(block_reason);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check if handle is available
CREATE OR REPLACE FUNCTION is_handle_available(
  p_handle TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_handle_lowercase TEXT;
  v_is_taken BOOLEAN;
  v_is_blocked BOOLEAN;
BEGIN
  -- Normalize handle
  v_handle_lowercase := LOWER(TRIM(p_handle));

  -- Check basic format (3-30 chars, alphanumeric + underscore)
  IF v_handle_lowercase !~ '^[a-z0-9_]{3,30}$' THEN
    RETURN FALSE;
  END IF;

  -- Check if already taken
  SELECT EXISTS(
    SELECT 1 FROM users WHERE handle_lowercase = v_handle_lowercase
  ) INTO v_is_taken;

  IF v_is_taken THEN
    RETURN FALSE;
  END IF;

  -- Check if reserved
  SELECT EXISTS(
    SELECT 1 FROM handle_reservations
    WHERE handle_lowercase = v_handle_lowercase
    AND status = 'reserved'
    AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_is_taken;

  IF v_is_taken THEN
    RETURN FALSE;
  END IF;

  -- Check if blocked
  SELECT EXISTS(
    SELECT 1 FROM blocked_handles
    WHERE v_handle_lowercase LIKE handle_pattern
  ) INTO v_is_blocked;

  IF v_is_blocked THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Set user handle
CREATE OR REPLACE FUNCTION set_user_handle(
  p_user_id UUID,
  p_handle TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT,
  handle TEXT
) AS $$
DECLARE
  v_handle_normalized TEXT;
  v_handle_lowercase TEXT;
  v_old_handle TEXT;
  v_changes_remaining INTEGER;
  v_is_available BOOLEAN;
BEGIN
  -- Normalize handle
  v_handle_normalized := TRIM(p_handle);
  v_handle_lowercase := LOWER(v_handle_normalized);

  -- Check if available
  v_is_available := is_handle_available(v_handle_normalized);

  IF NOT v_is_available THEN
    RETURN QUERY SELECT FALSE, 'Handle not available or invalid'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Get user's current handle and remaining changes
  SELECT users.handle, users.handle_changes_remaining
  INTO v_old_handle, v_changes_remaining
  FROM users
  WHERE users.user_id = p_user_id;

  -- Check if user has changes remaining (unless first time setting handle)
  IF v_old_handle IS NOT NULL AND v_changes_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, 'No handle changes remaining'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Update user's handle
  UPDATE users
  SET
    handle = v_handle_normalized,
    handle_lowercase = v_handle_lowercase,
    handle_set_at = NOW(),
    handle_changes_remaining = CASE
      WHEN users.handle IS NULL THEN users.handle_changes_remaining -- First time, don't decrement
      ELSE users.handle_changes_remaining - 1
    END
  WHERE users.user_id = p_user_id;

  -- Log handle change
  INSERT INTO handle_history (
    user_id,
    old_handle,
    new_handle,
    change_reason,
    ip_address,
    user_agent
  ) VALUES (
    p_user_id,
    v_old_handle,
    v_handle_normalized,
    CASE WHEN v_old_handle IS NULL THEN 'initial_set' ELSE 'user_change' END,
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_handle_normalized;
END;
$$ LANGUAGE plpgsql;

-- Get user by handle
CREATE OR REPLACE FUNCTION get_user_by_handle(
  p_handle TEXT
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  username TEXT,
  handle TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_handle_lowercase TEXT;
BEGIN
  v_handle_lowercase := LOWER(TRIM(p_handle));

  RETURN QUERY
  SELECT
    users.user_id,
    users.email,
    users.username,
    users.handle,
    users.created_at
  FROM users
  WHERE users.handle_lowercase = v_handle_lowercase;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Available premium handles
CREATE OR REPLACE VIEW available_premium_handles AS
SELECT
  handle,
  price_cents,
  price_cents / 100.0 as price_dollars,
  reserved_at,
  expires_at
FROM handle_reservations
WHERE reservation_type = 'premium'
  AND status = 'reserved'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY price_cents DESC;

-- Recent handle changes
CREATE OR REPLACE VIEW recent_handle_changes AS
SELECT
  u.user_id,
  u.email,
  u.username,
  hh.old_handle,
  hh.new_handle,
  hh.change_reason,
  hh.changed_at
FROM handle_history hh
JOIN users u ON u.user_id = hh.user_id
ORDER BY hh.changed_at DESC
LIMIT 100;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Block common profanity and system handles
INSERT INTO blocked_handles (handle_pattern, block_reason, blocked_by_admin) VALUES
  -- System reserved
  ('admin', 'system_reserved', 'system'),
  ('administrator', 'system_reserved', 'system'),
  ('root', 'system_reserved', 'system'),
  ('system', 'system_reserved', 'system'),
  ('support', 'system_reserved', 'system'),
  ('help', 'system_reserved', 'system'),
  ('mod', 'system_reserved', 'system'),
  ('moderator', 'system_reserved', 'system'),
  ('official', 'system_reserved', 'system'),
  ('staff', 'system_reserved', 'system'),
  ('team', 'system_reserved', 'system'),
  ('calos', 'system_reserved', 'system'),
  ('api', 'system_reserved', 'system'),
  ('www', 'system_reserved', 'system'),
  ('ftp', 'system_reserved', 'system'),
  ('mail', 'system_reserved', 'system'),

  -- Common profanity patterns (wildcards)
  ('%fuck%', 'profanity', 'system'),
  ('%shit%', 'profanity', 'system'),
  ('%ass%', 'profanity', 'system'),
  ('%damn%', 'profanity', 'system'),
  ('%bitch%', 'profanity', 'system'),
  ('%nigga%', 'profanity', 'system'),
  ('%nigger%', 'profanity', 'system'),
  ('%fag%', 'profanity', 'system'),
  ('%cunt%', 'profanity', 'system'),
  ('%dick%', 'profanity', 'system'),
  ('%cock%', 'profanity', 'system'),
  ('%pussy%', 'profanity', 'system')
ON CONFLICT DO NOTHING;

-- Reserve premium short handles (1-2 char, 3-letter words)
INSERT INTO handle_reservations (handle, handle_lowercase, reservation_type, price_cents, reason) VALUES
  ('god', 'god', 'premium', 100000, 'Ultra-premium 3-letter word'),
  ('ceo', 'ceo', 'premium', 50000, 'Premium title'),
  ('vip', 'vip', 'premium', 50000, 'Premium status'),
  ('pro', 'pro', 'premium', 25000, 'Popular abbreviation'),
  ('dev', 'dev', 'premium', 25000, 'Developer handle'),
  ('ai', 'ai', 'premium', 100000, 'Premium 2-letter'),
  ('og', 'og', 'premium', 75000, 'Premium 2-letter'),
  ('gm', 'gm', 'premium', 50000, 'Premium 2-letter'),
  ('dm', 'dm', 'premium', 50000, 'Premium 2-letter'),
  ('pm', 'pm', 'premium', 50000, 'Premium 2-letter')
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust based on your setup)
-- GRANT ALL ON users TO your_app_user;
-- GRANT ALL ON handle_reservations TO your_app_user;
-- GRANT ALL ON handle_history TO your_app_user;
-- GRANT ALL ON blocked_handles TO your_app_user;
