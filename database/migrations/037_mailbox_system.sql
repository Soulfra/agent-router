/**
 * Migration 037: Internal Mailbox System (WoW-Style)
 *
 * Features:
 * - User-to-user messaging
 * - NPC mail (system notifications, quests)
 * - Attachments (items, vouchers, rewards)
 * - Read receipts and delivery tracking
 * - Cross-device sync
 * - Role-playing layer (NPCs can be hidden players)
 */

-- ============================================================================
-- MAILBOX MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mailbox_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sender/Recipient
  from_user_id UUID REFERENCES users(user_id), -- NULL for system/NPC mail
  to_user_id UUID NOT NULL REFERENCES users(user_id),

  -- Message content
  subject VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,

  -- Message type
  message_type VARCHAR(50) DEFAULT 'user',
  -- Types: 'user', 'npc', 'system', 'quest', 'reward', 'roleplay'

  -- NPC/Role-play metadata
  npc_id UUID, -- Reference to NPC if from NPC
  npc_name VARCHAR(100), -- Display name (e.g., "Innkeeper", "Quest Giver")
  is_roleplay BOOLEAN DEFAULT FALSE, -- True if NPC is actually a hidden player
  roleplay_user_id UUID REFERENCES users(user_id), -- Hidden player behind NPC

  -- Status
  status VARCHAR(50) DEFAULT 'unread',
  -- Statuses: 'unread', 'read', 'archived', 'deleted'

  read_at TIMESTAMPTZ,

  -- Attachments
  has_attachments BOOLEAN DEFAULT FALSE,
  attachment_count INTEGER DEFAULT 0,

  -- Money attachment (in-game currency)
  attached_credits_cents INTEGER DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMPTZ, -- Mail can expire (like WoW)
  can_reply BOOLEAN DEFAULT TRUE,

  -- Delivery tracking
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,

  -- Cross-device sync
  synced_to_devices UUID[], -- Array of device IDs that have seen this message
  last_sync_at TIMESTAMPTZ,

  -- Generational influence
  generation INTEGER DEFAULT 1, -- Pokemon-style generation tracking
  influences_future BOOLEAN DEFAULT FALSE, -- This mail affects future generations
  influenced_by_message_id UUID, -- Reference to message that influenced this one

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_mailbox_to_user ON mailbox_messages(to_user_id);
CREATE INDEX idx_mailbox_from_user ON mailbox_messages(from_user_id);
CREATE INDEX idx_mailbox_status ON mailbox_messages(to_user_id, status);
CREATE INDEX idx_mailbox_type ON mailbox_messages(message_type);
CREATE INDEX idx_mailbox_npc ON mailbox_messages(npc_id);
CREATE INDEX idx_mailbox_sent_at ON mailbox_messages(sent_at DESC);
CREATE INDEX idx_mailbox_expires ON mailbox_messages(expires_at);
CREATE INDEX idx_mailbox_generation ON mailbox_messages(generation);

-- ============================================================================
-- MAILBOX ATTACHMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mailbox_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message_id UUID NOT NULL REFERENCES mailbox_messages(message_id) ON DELETE CASCADE,

  -- Attachment type
  attachment_type VARCHAR(50) NOT NULL,
  -- Types: 'voucher', 'credits', 'item', 'achievement', 'file'

  -- Attachment data
  attachment_data JSONB NOT NULL,

  -- Voucher reference (if attachment is a voucher code)
  voucher_id UUID REFERENCES vouchers(voucher_id),

  -- Item reference (for in-game items)
  item_type VARCHAR(100),
  item_quantity INTEGER DEFAULT 1,

  -- Status
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_attachments_message ON mailbox_attachments(message_id);
CREATE INDEX idx_attachments_voucher ON mailbox_attachments(voucher_id);
CREATE INDEX idx_attachments_claimed ON mailbox_attachments(claimed);

-- ============================================================================
-- NPC REGISTRY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS npc_registry (
  npc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NPC identity
  npc_name VARCHAR(100) NOT NULL UNIQUE,
  npc_type VARCHAR(50) NOT NULL,
  -- Types: 'quest_giver', 'innkeeper', 'merchant', 'storyline', 'hidden_player'

  -- Role-play layer
  is_roleplay BOOLEAN DEFAULT FALSE,
  roleplay_user_id UUID REFERENCES users(user_id), -- Player controlling this NPC
  roleplay_shift_schedule TEXT, -- When player is "on duty" as NPC

  -- NPC personality (affects message tone)
  personality JSONB DEFAULT '{}',
  -- { "tone": "friendly", "greeting": "Greetings, traveler!", "signature": "- The Innkeeper" }

  -- Generational evolution
  generation INTEGER DEFAULT 1,
  evolves_with_community BOOLEAN DEFAULT TRUE, -- Personality changes based on user interactions
  interaction_count INTEGER DEFAULT 0,
  sentiment_score NUMERIC(5, 2) DEFAULT 0.00, -- Tracks community sentiment toward NPC

  -- Mail behavior
  can_send_quests BOOLEAN DEFAULT FALSE,
  can_send_rewards BOOLEAN DEFAULT FALSE,
  auto_reply_enabled BOOLEAN DEFAULT FALSE,
  auto_reply_template TEXT,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_npc_name ON npc_registry(npc_name);
CREATE INDEX idx_npc_type ON npc_registry(npc_type);
CREATE INDEX idx_npc_roleplay ON npc_registry(is_roleplay, roleplay_user_id);
CREATE INDEX idx_npc_active ON npc_registry(active);

-- ============================================================================
-- GENERATIONAL INFLUENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS generational_influences (
  influence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source (what happened)
  source_type VARCHAR(50) NOT NULL,
  -- Types: 'message', 'quest', 'community_action', 'player_choice'

  source_id UUID, -- Reference to message, quest, etc.

  -- Effect (what changes)
  effect_type VARCHAR(50) NOT NULL,
  -- Types: 'npc_personality', 'world_state', 'quest_availability', 'loot_table'

  target_type VARCHAR(50) NOT NULL, -- 'npc', 'quest', 'world'
  target_id UUID, -- Reference to affected entity

  -- Generational tracking
  source_generation INTEGER NOT NULL,
  affects_generation INTEGER NOT NULL, -- Which generation(s) see this effect

  -- Influence strength
  weight NUMERIC(5, 2) DEFAULT 1.00, -- How much this influence matters (0-1)

  -- Effect data
  effect_data JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_influences_source ON generational_influences(source_type, source_id);
CREATE INDEX idx_influences_target ON generational_influences(target_type, target_id);
CREATE INDEX idx_influences_generation ON generational_influences(affects_generation);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Send mail to user
 * Usage: SELECT send_mail('sender-uuid', 'recipient-uuid', 'Subject', 'Body', 'user');
 */
CREATE OR REPLACE FUNCTION send_mail(
  from_user UUID,
  to_user UUID,
  mail_subject VARCHAR(200),
  mail_body TEXT,
  mail_type VARCHAR(50) DEFAULT 'user'
)
RETURNS UUID AS $$
DECLARE
  new_message_id UUID;
BEGIN
  INSERT INTO mailbox_messages (
    from_user_id, to_user_id, subject, body, message_type, status
  )
  VALUES (
    from_user, to_user, mail_subject, mail_body, mail_type, 'unread'
  )
  RETURNING message_id INTO new_message_id;

  RETURN new_message_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark mail as read
 */
CREATE OR REPLACE FUNCTION mark_mail_read(mail_id UUID, reader_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE mailbox_messages
  SET
    status = 'read',
    read_at = NOW(),
    updated_at = NOW()
  WHERE message_id = mail_id
    AND to_user_id = reader_user_id
    AND status = 'unread';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Get inbox for user
 */
CREATE OR REPLACE FUNCTION get_inbox(user_uuid UUID, include_read BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  message_id UUID,
  from_user_id UUID,
  subject VARCHAR(200),
  body TEXT,
  message_type VARCHAR(50),
  npc_name VARCHAR(100),
  has_attachments BOOLEAN,
  attachment_count INTEGER,
  status VARCHAR(50),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.message_id,
    m.from_user_id,
    m.subject,
    m.body,
    m.message_type,
    m.npc_name,
    m.has_attachments,
    m.attachment_count,
    m.status,
    m.sent_at,
    m.read_at
  FROM mailbox_messages m
  WHERE m.to_user_id = user_uuid
    AND (include_read OR m.status = 'unread')
    AND m.status != 'deleted'
    AND (m.expires_at IS NULL OR m.expires_at > NOW())
  ORDER BY m.sent_at DESC;
END;
$$ LANGUAGE plpgsql;

/**
 * Send NPC mail
 */
CREATE OR REPLACE FUNCTION send_npc_mail(
  npc_uuid UUID,
  to_user UUID,
  mail_subject VARCHAR(200),
  mail_body TEXT
)
RETURNS UUID AS $$
DECLARE
  npc_record RECORD;
  new_message_id UUID;
BEGIN
  -- Get NPC info
  SELECT * INTO npc_record
  FROM npc_registry
  WHERE npc_id = npc_uuid AND active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NPC not found or inactive';
  END IF;

  -- Create message
  INSERT INTO mailbox_messages (
    from_user_id, to_user_id, subject, body,
    message_type, npc_id, npc_name,
    is_roleplay, roleplay_user_id,
    status
  )
  VALUES (
    NULL, to_user, mail_subject, mail_body,
    'npc', npc_uuid, npc_record.npc_name,
    npc_record.is_roleplay, npc_record.roleplay_user_id,
    'unread'
  )
  RETURNING message_id INTO new_message_id;

  -- Update NPC interaction count
  UPDATE npc_registry
  SET
    interaction_count = interaction_count + 1,
    updated_at = NOW()
  WHERE npc_id = npc_uuid;

  RETURN new_message_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Unread mail count by user
CREATE OR REPLACE VIEW unread_mail_counts AS
SELECT
  to_user_id AS user_id,
  COUNT(*) AS unread_count,
  SUM(CASE WHEN message_type = 'npc' THEN 1 ELSE 0 END) AS unread_npc_count,
  SUM(CASE WHEN message_type = 'quest' THEN 1 ELSE 0 END) AS unread_quest_count,
  SUM(CASE WHEN has_attachments THEN 1 ELSE 0 END) AS unread_with_attachments
FROM mailbox_messages
WHERE status = 'unread'
  AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY to_user_id;

-- NPC mail statistics
CREATE OR REPLACE VIEW npc_mail_stats AS
SELECT
  n.npc_id,
  n.npc_name,
  n.npc_type,
  n.is_roleplay,
  COUNT(m.message_id) AS total_messages_sent,
  SUM(CASE WHEN m.status = 'read' THEN 1 ELSE 0 END) AS messages_read,
  ROUND(
    SUM(CASE WHEN m.status = 'read' THEN 1 ELSE 0 END)::NUMERIC /
    NULLIF(COUNT(m.message_id), 0) * 100,
    2
  ) AS read_rate_percent,
  n.interaction_count,
  n.sentiment_score
FROM npc_registry n
LEFT JOIN mailbox_messages m ON n.npc_id = m.npc_id
WHERE n.active = TRUE
GROUP BY n.npc_id, n.npc_name, n.npc_type, n.is_roleplay, n.interaction_count, n.sentiment_score
ORDER BY total_messages_sent DESC;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Create some starter NPCs
INSERT INTO npc_registry (npc_name, npc_type, personality, can_send_quests, can_send_rewards)
VALUES
  ('The Innkeeper', 'innkeeper', '{"tone": "friendly", "greeting": "Welcome, traveler!", "signature": "- The Innkeeper"}', FALSE, TRUE),
  ('Quest Master', 'quest_giver', '{"tone": "authoritative", "greeting": "Seek adventure?", "signature": "- Quest Master"}', TRUE, TRUE),
  ('System Administrator', 'system', '{"tone": "formal", "greeting": "Greetings.", "signature": "- CalOS System"}', FALSE, FALSE),
  ('The Merchant', 'merchant', '{"tone": "business", "greeting": "Looking to trade?", "signature": "- The Merchant"}', FALSE, TRUE)
ON CONFLICT (npc_name) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE mailbox_messages IS 'WoW-style internal mailbox for user-to-user and NPC messaging';
COMMENT ON TABLE mailbox_attachments IS 'Attachments for mailbox messages (vouchers, items, credits)';
COMMENT ON TABLE npc_registry IS 'Registry of NPCs that can send mail (some are hidden players)';
COMMENT ON TABLE generational_influences IS 'Cross-generation effects (Pokemon-style influence)';
COMMENT ON FUNCTION send_mail IS 'Send mail from one user to another';
COMMENT ON FUNCTION send_npc_mail IS 'Send mail from an NPC to a user';
COMMENT ON FUNCTION get_inbox IS 'Get inbox messages for a user';
