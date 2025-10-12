-- Intelligent Email Router System
-- Multi-account email management with AI auto-sorting
-- BinaryTree-style invisible routing with drag-and-drop corrections

-- ============================================================================
-- EMAIL ACCOUNTS
-- ============================================================================

-- Connected email accounts (via OAuth)
CREATE TABLE IF NOT EXISTS email_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,

  -- OAuth connection
  oauth_connection_id INTEGER REFERENCES user_oauth_connections(id),
  provider_id VARCHAR(100) REFERENCES oauth_providers(provider_id),

  -- Account info
  email_address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  account_type VARCHAR(50) DEFAULT 'personal', -- 'work', 'personal', 'side_project', 'other'

  -- Sync settings
  auto_sort BOOLEAN DEFAULT true,
  poll_interval INTEGER DEFAULT 60000, -- Polling interval in ms
  sync_enabled BOOLEAN DEFAULT true,

  -- Provider-specific
  provider_account_id VARCHAR(255), -- Gmail user ID, Outlook ID, etc.
  imap_settings JSONB, -- For IMAP accounts

  -- Stats
  total_emails INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP,
  last_error TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, email_address)
);

CREATE INDEX idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_oauth ON email_accounts(oauth_connection_id);
CREATE INDEX idx_email_accounts_sync ON email_accounts(sync_enabled, last_sync_at);

-- ============================================================================
-- EMAIL MESSAGES
-- ============================================================================

-- Stored email messages
CREATE TABLE IF NOT EXISTS email_messages (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES email_accounts(id) ON DELETE CASCADE,

  -- Message IDs
  message_id VARCHAR(255) NOT NULL, -- Provider's message ID
  thread_id VARCHAR(255),
  in_reply_to VARCHAR(255),

  -- Email headers
  from_address VARCHAR(500),
  from_name VARCHAR(500),
  to_address TEXT[], -- Array of recipients
  cc_address TEXT[],
  bcc_address TEXT[],
  reply_to VARCHAR(500),

  -- Content
  subject TEXT,
  body_preview TEXT, -- First 200 chars
  body_plain TEXT, -- Plain text body
  body_html TEXT, -- HTML body

  -- Metadata
  labels TEXT[], -- Provider labels
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,

  -- AI Classification
  ai_category VARCHAR(50), -- 'work', 'personal', 'side_project', 'spam', 'urgent', 'marketing'
  ai_confidence NUMERIC(3, 2), -- 0.00 - 1.00
  ai_reasoning TEXT,
  ai_classified_at TIMESTAMP,

  -- User Classification (ground truth)
  user_category VARCHAR(50),
  user_corrected BOOLEAN DEFAULT false,
  user_corrected_at TIMESTAMP,

  -- Timestamps
  received_at TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(account_id, message_id)
);

CREATE INDEX idx_email_messages_account ON email_messages(account_id, received_at DESC);
CREATE INDEX idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX idx_email_messages_unread ON email_messages(account_id, is_read, received_at DESC);
CREATE INDEX idx_email_messages_category ON email_messages(ai_category, received_at DESC);
CREATE INDEX idx_email_messages_corrected ON email_messages(user_corrected);
CREATE INDEX idx_email_messages_from ON email_messages USING GIN(to_tsvector('english', from_address));
CREATE INDEX idx_email_messages_subject ON email_messages USING GIN(to_tsvector('english', subject));

-- ============================================================================
-- EMAIL ATTACHMENTS
-- ============================================================================

-- Email attachments metadata
CREATE TABLE IF NOT EXISTS email_attachments (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES email_messages(id) ON DELETE CASCADE,

  -- Attachment info
  filename VARCHAR(500),
  content_type VARCHAR(200),
  size_bytes INTEGER,

  -- Storage
  storage_path TEXT, -- Where file is stored
  is_inline BOOLEAN DEFAULT false,
  content_id VARCHAR(255), -- For inline images

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_attachments_message ON email_attachments(message_id);

-- ============================================================================
-- ROUTING RULES
-- ============================================================================

-- Learned and manual routing rules
CREATE TABLE IF NOT EXISTS email_routing_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES email_accounts(id) ON DELETE CASCADE,

  -- Rule definition
  rule_type VARCHAR(50) NOT NULL, -- 'sender', 'domain', 'keyword', 'subject_pattern', 'learned'
  pattern TEXT NOT NULL, -- Email, domain, or keyword pattern
  target_category VARCHAR(50) NOT NULL,

  -- Priority
  priority INTEGER DEFAULT 0, -- Higher = applied first

  -- Learning metrics
  confidence NUMERIC(3, 2) DEFAULT 1.00,
  times_applied INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  times_corrected INTEGER DEFAULT 0,
  last_applied TIMESTAMP,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_auto_learned BOOLEAN DEFAULT false,

  -- Metadata
  description TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_routing_rules_user ON email_routing_rules(user_id, is_active);
CREATE INDEX idx_routing_rules_pattern ON email_routing_rules(pattern);
CREATE INDEX idx_routing_rules_priority ON email_routing_rules(priority DESC);

-- ============================================================================
-- CLASSIFICATION HISTORY
-- ============================================================================

-- Track all classification attempts for learning
CREATE TABLE IF NOT EXISTS email_classification_history (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES email_messages(id) ON DELETE CASCADE,

  -- Classification
  classified_as VARCHAR(50),
  confidence NUMERIC(3, 2),
  reasoning TEXT,

  -- Model info
  model_name VARCHAR(100),
  model_version VARCHAR(50),

  -- Was it correct?
  was_correct BOOLEAN,
  corrected_to VARCHAR(50),

  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_classification_history_message ON email_classification_history(message_id);
CREATE INDEX idx_classification_history_correct ON email_classification_history(was_correct);

-- ============================================================================
-- SMART ACTIONS
-- ============================================================================

-- Auto-actions triggered by routing
CREATE TABLE IF NOT EXISTS email_auto_actions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,

  -- Trigger
  trigger_category VARCHAR(50), -- Which category triggers this
  trigger_condition JSONB, -- Additional conditions

  -- Action
  action_type VARCHAR(50), -- 'archive', 'delete', 'mark_read', 'star', 'notify', 'auto_reply'
  action_params JSONB,

  -- Settings
  is_enabled BOOLEAN DEFAULT true,
  delay_seconds INTEGER DEFAULT 0,

  -- Stats
  times_triggered INTEGER DEFAULT 0,
  last_triggered TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auto_actions_user ON email_auto_actions(user_id, is_enabled);
CREATE INDEX idx_auto_actions_category ON email_auto_actions(trigger_category);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Apply routing rule to message
CREATE OR REPLACE FUNCTION apply_routing_rule(
  p_message_id INTEGER,
  p_rule_id INTEGER
) RETURNS VOID AS $$
BEGIN
  -- Update message category
  UPDATE email_messages
  SET
    ai_category = (SELECT target_category FROM email_routing_rules WHERE id = p_rule_id),
    ai_confidence = (SELECT confidence FROM email_routing_rules WHERE id = p_rule_id),
    ai_reasoning = 'Applied routing rule #' || p_rule_id::TEXT,
    ai_classified_at = NOW()
  WHERE id = p_message_id;

  -- Update rule stats
  UPDATE email_routing_rules
  SET
    times_applied = times_applied + 1,
    last_applied = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

-- Learn from user correction
CREATE OR REPLACE FUNCTION learn_from_correction(
  p_message_id INTEGER,
  p_new_category VARCHAR
) RETURNS VOID AS $$
DECLARE
  v_from_address VARCHAR;
  v_from_domain VARCHAR;
  v_user_id INTEGER;
  v_account_id INTEGER;
  v_old_category VARCHAR;
BEGIN
  -- Get message details
  SELECT
    from_address,
    SUBSTRING(from_address FROM '@(.*)$'),
    m.ai_category,
    a.user_id,
    m.account_id
  INTO
    v_from_address,
    v_from_domain,
    v_old_category,
    v_user_id,
    v_account_id
  FROM email_messages m
  JOIN email_accounts a ON a.id = m.account_id
  WHERE m.id = p_message_id;

  -- Mark message as corrected
  UPDATE email_messages
  SET
    user_category = p_new_category,
    user_corrected = true,
    user_corrected_at = NOW()
  WHERE id = p_message_id;

  -- Update existing rule if it mis-classified
  UPDATE email_routing_rules
  SET
    times_corrected = times_corrected + 1,
    confidence = GREATEST(0.1, confidence - 0.1),
    updated_at = NOW()
  WHERE user_id = v_user_id
    AND rule_type = 'sender'
    AND pattern = v_from_address
    AND target_category = v_old_category;

  -- Create or strengthen rule for correct classification
  INSERT INTO email_routing_rules (
    user_id,
    account_id,
    rule_type,
    pattern,
    target_category,
    priority,
    confidence,
    is_auto_learned
  ) VALUES (
    v_user_id,
    v_account_id,
    'sender',
    v_from_address,
    p_new_category,
    5,
    0.7,
    true
  )
  ON CONFLICT ON CONSTRAINT email_routing_rules_pkey DO NOTHING;

  -- Also create domain rule if sender rule doesn't exist
  INSERT INTO email_routing_rules (
    user_id,
    account_id,
    rule_type,
    pattern,
    target_category,
    priority,
    confidence,
    is_auto_learned
  ) VALUES (
    v_user_id,
    v_account_id,
    'domain',
    v_from_domain,
    p_new_category,
    3,
    0.5,
    true
  )
  ON CONFLICT ON CONSTRAINT email_routing_rules_pkey DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Get user's unified inbox
CREATE OR REPLACE FUNCTION get_unified_inbox(
  p_user_id INTEGER,
  p_category VARCHAR DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  message_id INTEGER,
  account_email VARCHAR,
  account_type VARCHAR,
  from_address VARCHAR,
  from_name VARCHAR,
  subject TEXT,
  body_preview TEXT,
  category VARCHAR,
  confidence NUMERIC,
  is_read BOOLEAN,
  is_starred BOOLEAN,
  has_attachments BOOLEAN,
  received_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    a.email_address,
    a.account_type,
    m.from_address,
    m.from_name,
    m.subject,
    m.body_preview,
    COALESCE(m.user_category, m.ai_category) as category,
    m.ai_confidence,
    m.is_read,
    m.is_starred,
    m.has_attachments,
    m.received_at
  FROM email_messages m
  JOIN email_accounts a ON a.id = m.account_id
  WHERE a.user_id = p_user_id
    AND (p_category IS NULL OR COALESCE(m.user_category, m.ai_category) = p_category)
  ORDER BY m.received_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Email account summary
CREATE OR REPLACE VIEW email_account_summary AS
SELECT
  a.id,
  a.user_id,
  a.email_address,
  a.account_type,
  a.sync_enabled,
  a.last_sync_at,
  COUNT(m.id) as total_messages,
  COUNT(m.id) FILTER (WHERE m.is_read = false) as unread_count,
  COUNT(m.id) FILTER (WHERE m.user_corrected = true) as corrections_count,
  a.created_at
FROM email_accounts a
LEFT JOIN email_messages m ON m.account_id = a.id
GROUP BY a.id;

-- Routing rule effectiveness
CREATE OR REPLACE VIEW routing_rule_effectiveness AS
SELECT
  r.id,
  r.user_id,
  r.rule_type,
  r.pattern,
  r.target_category,
  r.confidence,
  r.times_applied,
  r.times_corrected,
  CASE
    WHEN r.times_applied > 0
    THEN ROUND((r.times_applied - r.times_corrected)::NUMERIC / r.times_applied::NUMERIC, 2)
    ELSE 1.0
  END as accuracy,
  r.is_active,
  r.created_at
FROM email_routing_rules r
WHERE r.times_applied > 0
ORDER BY accuracy DESC, r.times_applied DESC;

-- Category distribution
CREATE OR REPLACE VIEW email_category_distribution AS
SELECT
  a.user_id,
  a.email_address,
  COALESCE(m.user_category, m.ai_category) as category,
  COUNT(*) as message_count,
  COUNT(*) FILTER (WHERE m.is_read = false) as unread_count,
  COUNT(*) FILTER (WHERE m.user_corrected = true) as corrected_count
FROM email_messages m
JOIN email_accounts a ON a.id = m.account_id
WHERE COALESCE(m.user_category, m.ai_category) IS NOT NULL
GROUP BY a.user_id, a.email_address, COALESCE(m.user_category, m.ai_category);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update account unread count
CREATE OR REPLACE FUNCTION update_account_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE email_accounts
  SET unread_count = (
    SELECT COUNT(*)
    FROM email_messages
    WHERE account_id = NEW.account_id AND is_read = false
  )
  WHERE id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_unread_count
  AFTER INSERT OR UPDATE OF is_read ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_account_unread_count();

-- Auto-update timestamps
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_messages_updated_at
  BEFORE UPDATE ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routing_rules_updated_at
  BEFORE UPDATE ON email_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Default auto-actions for spam
INSERT INTO email_auto_actions (user_id, trigger_category, action_type, action_params, is_enabled)
VALUES
  (1, 'spam', 'archive', '{"after_days": 7}'::jsonb, false), -- Disabled by default
  (1, 'marketing', 'mark_read', '{}'::jsonb, false),
  (1, 'urgent', 'notify', '{"push": true, "email": false}'::jsonb, false);

-- Default routing patterns (can be customized per user)
-- These are just examples and will be created per-user on first email sync
