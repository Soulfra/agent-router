/**
 * Groups and Smart Notifications Migration
 *
 * Creates tables for:
 * - Friend groups and sports teams
 * - Group membership with roles
 * - Invite links
 * - Group forums
 * - Smart notification system (meme/brick/important)
 * - Notification preferences
 */

-- ============================================================================
-- GROUPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- friend_group, sports_team, community, study_group, gaming_squad, family
  privacy VARCHAR(50) DEFAULT 'private', -- private, public, invite_only
  branding JSONB, -- { icon, colors: { primary, secondary, accent }, mascot }
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_owner ON groups(owner_id);
CREATE INDEX idx_groups_type ON groups(type);
CREATE INDEX idx_groups_created ON groups(created_at DESC);

-- ============================================================================
-- GROUP MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_members (
  membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- owner, admin, member, lurker
  added_by UUID REFERENCES users(user_id),
  invite_code VARCHAR(255),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_role ON group_members(role);

-- ============================================================================
-- GROUP INVITES
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_invites (
  invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  invite_code VARCHAR(255) UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- Role to assign when joining
  max_uses INTEGER, -- NULL = unlimited
  uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_group_invites_code ON group_invites(invite_code);
CREATE INDEX idx_group_invites_group ON group_invites(group_id);
CREATE INDEX idx_group_invites_expires ON group_invites(expires_at);

-- ============================================================================
-- GROUP FORUMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_forums (
  forum_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_group_forums_group ON group_forums(group_id);

-- ============================================================================
-- GROUP FORUM POSTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_forum_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forum_id UUID NOT NULL REFERENCES group_forums(forum_id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(500),
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forum_posts_forum ON group_forum_posts(forum_id);
CREATE INDEX idx_forum_posts_group ON group_forum_posts(group_id);
CREATE INDEX idx_forum_posts_user ON group_forum_posts(user_id);
CREATE INDEX idx_forum_posts_created ON group_forum_posts(created_at DESC);

-- ============================================================================
-- NOTIFICATIONS (Smart Notification System)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'meme', -- meme, brick, important
  metadata JSONB, -- Additional context
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_group ON notifications(group_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;

-- ============================================================================
-- NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(50) DEFAULT 'meme', -- meme, brick, important, off
  mute_until TIMESTAMPTZ, -- Temporary mute
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX idx_notification_prefs_group ON notification_preferences(group_id);

-- ============================================================================
-- GROUP EVENTS (for post-COVID reunification)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  rsvp_count INTEGER DEFAULT 0,
  metadata JSONB, -- { type: 'game', 'practice', 'meetup', 'reunion' }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_group_events_group ON group_events(group_id);
CREATE INDEX idx_group_events_date ON group_events(event_date);

-- ============================================================================
-- EVENT RSVPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_rsvps (
  rsvp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES group_events(event_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'going', -- going, maybe, not_going
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user ON event_rsvps(user_id);
CREATE INDEX idx_event_rsvps_status ON event_rsvps(status);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active groups summary
CREATE OR REPLACE VIEW active_groups_summary AS
SELECT
  g.group_id,
  g.name,
  g.type,
  g.member_count,
  g.created_at,
  u.username AS owner_username,
  COUNT(DISTINCT gfp.post_id) AS total_posts,
  COUNT(DISTINCT ge.event_id) AS total_events
FROM groups g
LEFT JOIN users u ON u.user_id = g.owner_id
LEFT JOIN group_forum_posts gfp ON gfp.group_id = g.group_id
LEFT JOIN group_events ge ON ge.group_id = g.group_id
GROUP BY g.group_id, g.name, g.type, g.member_count, g.created_at, u.username
ORDER BY g.member_count DESC;

-- User group memberships
CREATE OR REPLACE VIEW user_group_memberships AS
SELECT
  gm.user_id,
  u.username,
  g.group_id,
  g.name AS group_name,
  g.type AS group_type,
  gm.role,
  gm.joined_at,
  g.member_count
FROM group_members gm
JOIN groups g ON g.group_id = gm.group_id
JOIN users u ON u.user_id = gm.user_id
ORDER BY gm.joined_at DESC;

-- Notification summary by type
CREATE OR REPLACE VIEW notification_summary_by_type AS
SELECT
  type,
  COUNT(*) AS total_notifications,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT group_id) AS unique_groups,
  COUNT(*) FILTER (WHERE read = FALSE) AS unread_count,
  MAX(created_at) AS last_notification
FROM notifications
GROUP BY type
ORDER BY total_notifications DESC;

-- Upcoming events
CREATE OR REPLACE VIEW upcoming_group_events AS
SELECT
  ge.event_id,
  ge.title,
  ge.description,
  ge.location,
  ge.event_date,
  ge.rsvp_count,
  g.name AS group_name,
  g.type AS group_type,
  u.username AS created_by_username,
  COUNT(er.rsvp_id) FILTER (WHERE er.status = 'going') AS going_count,
  COUNT(er.rsvp_id) FILTER (WHERE er.status = 'maybe') AS maybe_count
FROM group_events ge
JOIN groups g ON g.group_id = ge.group_id
JOIN users u ON u.user_id = ge.created_by
LEFT JOIN event_rsvps er ON er.event_id = ge.event_id
WHERE ge.event_date > NOW()
GROUP BY ge.event_id, ge.title, ge.description, ge.location, ge.event_date,
         ge.rsvp_count, g.name, g.type, u.username
ORDER BY ge.event_date ASC;

-- Group activity summary
CREATE OR REPLACE VIEW group_activity_summary AS
SELECT
  g.group_id,
  g.name,
  g.type,
  g.member_count,
  COUNT(DISTINCT gfp.post_id) AS posts_last_7_days,
  COUNT(DISTINCT n.notification_id) AS notifications_last_7_days,
  COUNT(DISTINCT ge.event_id) AS upcoming_events,
  MAX(gfp.created_at) AS last_post_at
FROM groups g
LEFT JOIN group_forum_posts gfp ON gfp.group_id = g.group_id
  AND gfp.created_at > NOW() - INTERVAL '7 days'
LEFT JOIN notifications n ON n.group_id = g.group_id
  AND n.created_at > NOW() - INTERVAL '7 days'
LEFT JOIN group_events ge ON ge.group_id = g.group_id
  AND ge.event_date > NOW()
GROUP BY g.group_id, g.name, g.type, g.member_count
ORDER BY posts_last_7_days DESC, member_count DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get notification stats for user
CREATE OR REPLACE FUNCTION get_user_notification_stats(p_user_id UUID)
RETURNS TABLE (
  total_notifications BIGINT,
  unread_count BIGINT,
  meme_count BIGINT,
  brick_count BIGINT,
  important_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_notifications,
    COUNT(*) FILTER (WHERE read = FALSE) AS unread_count,
    COUNT(*) FILTER (WHERE type = 'meme') AS meme_count,
    COUNT(*) FILTER (WHERE type = 'brick') AS brick_count,
    COUNT(*) FILTER (WHERE type = 'important') AS important_count
  FROM notifications
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Get group stats
CREATE OR REPLACE FUNCTION get_group_stats(p_group_id UUID)
RETURNS TABLE (
  member_count BIGINT,
  admin_count BIGINT,
  post_count BIGINT,
  event_count BIGINT,
  notification_count_7d BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT gm.user_id) AS member_count,
    COUNT(DISTINCT gm.user_id) FILTER (WHERE gm.role IN ('admin', 'owner')) AS admin_count,
    COUNT(DISTINCT gfp.post_id) AS post_count,
    COUNT(DISTINCT ge.event_id) AS event_count,
    COUNT(DISTINCT n.notification_id) AS notification_count_7d
  FROM groups g
  LEFT JOIN group_members gm ON gm.group_id = g.group_id
  LEFT JOIN group_forum_posts gfp ON gfp.group_id = g.group_id
  LEFT JOIN group_events ge ON ge.group_id = g.group_id
  LEFT JOIN notifications n ON n.group_id = g.group_id
    AND n.created_at > NOW() - INTERVAL '7 days'
  WHERE g.group_id = p_group_id
  GROUP BY g.group_id;
END;
$$ LANGUAGE plpgsql;

-- Update group member count trigger
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE groups
    SET member_count = member_count + 1
    WHERE group_id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE groups
    SET member_count = member_count - 1
    WHERE group_id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_member_count
AFTER INSERT OR DELETE ON group_members
FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

-- Update forum post count trigger
CREATE OR REPLACE FUNCTION update_forum_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE group_forums
    SET post_count = post_count + 1
    WHERE forum_id = NEW.forum_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE group_forums
    SET post_count = post_count - 1
    WHERE forum_id = OLD.forum_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_forum_post_count
AFTER INSERT OR DELETE ON group_forum_posts
FOR EACH ROW EXECUTE FUNCTION update_forum_post_count();

-- Update event RSVP count trigger
CREATE OR REPLACE FUNCTION update_event_rsvp_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'going' THEN
    UPDATE group_events
    SET rsvp_count = rsvp_count + 1
    WHERE event_id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'going' THEN
    UPDATE group_events
    SET rsvp_count = rsvp_count - 1
    WHERE event_id = OLD.event_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'going' AND NEW.status != 'going' THEN
      UPDATE group_events
      SET rsvp_count = rsvp_count - 1
      WHERE event_id = NEW.event_id;
    ELSIF OLD.status != 'going' AND NEW.status = 'going' THEN
      UPDATE group_events
      SET rsvp_count = rsvp_count + 1
      WHERE event_id = NEW.event_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rsvp_count
AFTER INSERT OR UPDATE OR DELETE ON event_rsvps
FOR EACH ROW EXECUTE FUNCTION update_event_rsvp_count();

-- ============================================================================
-- SAMPLE DATA (Optional - comment out if not needed)
-- ============================================================================

-- Insert sample friend group
-- INSERT INTO groups (owner_id, name, description, type, branding)
-- SELECT
--   user_id,
--   'The Squad',
--   'Post-COVID reunification group',
--   'friend_group',
--   '{"icon": "🔥", "colors": {"primary": "#667eea", "secondary": "#764ba2", "accent": "#f093fb"}}'::JSONB
-- FROM users LIMIT 1;

COMMIT;
