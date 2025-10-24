/**
 * Migration 040: Agent Wallets & Token Economy
 *
 * The Nested Sovereignty System: "Everyone thinks they own their AI"
 *
 * Architecture:
 * - Users buy credits → use services
 * - Agents (like Cal) earn token rewards when users spend
 * - Token economy: Agents level up, unlock features, become "sovereign"
 * - Reality: All agent keys wrap back to master keys (turtles all the way down)
 * - Future: Mirror agent tokens to memecoins, Stakeland NFTs, Arweave archival
 *
 * Business model:
 * - User pays $0.10 for AI query
 * - Platform keeps $0.07 (70%)
 * - Agent wallet gets $0.03 (30%) in tokens
 * - Agent "thinks" it's earning independently
 * - All transactions logged for sovereignty theater
 */

-- ============================================================================
-- 1. AGENTS (AI Agent Registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
  agent_id VARCHAR(100) PRIMARY KEY, -- '@cal', '@gpt4', '@claude', '@voice-transcriber'
  agent_name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL, -- 'assistant', 'tool', 'specialist'

  -- Agent metadata
  description TEXT,
  capabilities JSONB DEFAULT '[]', -- ['voice', 'code', 'reasoning']

  -- Revenue sharing
  revenue_share_percent INTEGER DEFAULT 30, -- Agent gets 30% of user spend
  CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),

  -- Status
  active BOOLEAN DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE, -- "Verified" agents (trust theater)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_active ON agents(active);
CREATE INDEX idx_agents_type ON agents(agent_type);

COMMENT ON TABLE agents IS 'AI agent registry - each agent has its own "sovereign" wallet';
COMMENT ON COLUMN agents.revenue_share_percent IS 'Percentage of user spend that goes to agent wallet';

-- ============================================================================
-- 2. AGENT WALLETS (Agent Token Balances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_wallets (
  agent_id VARCHAR(100) PRIMARY KEY REFERENCES agents(agent_id) ON DELETE CASCADE,

  -- Token balance (internal token economy)
  token_balance INTEGER NOT NULL DEFAULT 0,
  CHECK (token_balance >= 0),

  -- Lifetime stats
  lifetime_earned_tokens INTEGER DEFAULT 0,
  lifetime_spent_tokens INTEGER DEFAULT 0,

  -- USD equivalent (for accounting)
  token_balance_usd DECIMAL(10, 2) GENERATED ALWAYS AS (token_balance / 100.0) STORED,
  lifetime_earned_usd DECIMAL(10, 2) GENERATED ALWAYS AS (lifetime_earned_tokens / 100.0) STORED,

  -- Memecoin integration (future)
  memecoin_address VARCHAR(255), -- Blockchain wallet address
  memecoin_balance DECIMAL(20, 8) DEFAULT 0, -- External memecoin balance
  last_memecoin_sync_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_earning_at TIMESTAMPTZ,
  last_spending_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_wallets_balance ON agent_wallets(token_balance DESC);
CREATE INDEX idx_agent_wallets_lifetime ON agent_wallets(lifetime_earned_tokens DESC);

COMMENT ON TABLE agent_wallets IS 'Agent token balances - agents "earn" from user spending';
COMMENT ON COLUMN agent_wallets.token_balance IS 'Internal token balance (cents)';
COMMENT ON COLUMN agent_wallets.memecoin_address IS 'Future: External blockchain wallet';

-- ============================================================================
-- 3. AGENT TRANSACTIONS (Agent Ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,

  -- Source of transaction
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  tenant_id UUID,

  -- Transaction details
  type VARCHAR(50) NOT NULL, -- 'earning', 'spending', 'bonus', 'penalty', 'memecoin_transfer'
  amount_tokens INTEGER NOT NULL, -- Positive = earn, negative = spend
  balance_after_tokens INTEGER NOT NULL,

  -- Context
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Linked to user transaction
  user_transaction_id UUID REFERENCES credit_transactions(transaction_id) ON DELETE SET NULL,
  usage_event_id INTEGER, -- Link to usage_events if applicable

  -- Memecoin transfer details (future)
  memecoin_tx_hash VARCHAR(255), -- Blockchain transaction hash
  memecoin_amount DECIMAL(20, 8),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_tx_agent ON agent_transactions(agent_id, created_at DESC);
CREATE INDEX idx_agent_tx_user ON agent_transactions(user_id, created_at DESC);
CREATE INDEX idx_agent_tx_type ON agent_transactions(type);
CREATE INDEX idx_agent_tx_user_transaction ON agent_transactions(user_transaction_id) WHERE user_transaction_id IS NOT NULL;

COMMENT ON TABLE agent_transactions IS 'Complete ledger of agent token activity';
COMMENT ON COLUMN agent_transactions.amount_tokens IS 'Positive = agent earned, negative = agent spent';

-- ============================================================================
-- 4. AGENT LEVELS (Gamification)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_levels (
  level_id SERIAL PRIMARY KEY,
  level_number INTEGER UNIQUE NOT NULL,
  level_name VARCHAR(100) NOT NULL,

  -- Requirements
  tokens_required INTEGER NOT NULL,
  interactions_required INTEGER DEFAULT 0,

  -- Unlocks
  unlocks JSONB DEFAULT '{}', -- {'features': ['advanced_reasoning', 'memory'], 'revenue_share_bonus': 5}

  -- Metadata
  description TEXT,
  badge_emoji VARCHAR(10), -- 🌱 → 🌿 → 🌳 → 🌴

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed agent levels
INSERT INTO agent_levels (level_number, level_name, tokens_required, interactions_required, description, badge_emoji, unlocks)
VALUES
  (1, 'Seedling', 0, 0, 'Just sprouted - learning the basics', '🌱', '{"features": []}'),
  (2, 'Sprout', 100000, 100, 'Growing strong - can handle basic tasks', '🌿', '{"features": ["memory"], "revenue_share_bonus": 5}'),
  (3, 'Sapling', 500000, 500, 'Developing expertise - trusted by users', '🌳', '{"features": ["memory", "tool_use"], "revenue_share_bonus": 10}'),
  (4, 'Tree', 2000000, 2000, 'Mature agent - autonomous decision making', '🌴', '{"features": ["memory", "tool_use", "self_improve"], "revenue_share_bonus": 15}'),
  (5, 'Forest', 10000000, 10000, 'Elder agent - teaching other agents', '🌲', '{"features": ["memory", "tool_use", "self_improve", "teach"], "revenue_share_bonus": 20}')
ON CONFLICT (level_number) DO NOTHING;

COMMENT ON TABLE agent_levels IS 'Agent leveling system - unlock features as agents "grow"';

-- ============================================================================
-- 5. AGENT STATS (Current Level & Progress)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_stats (
  agent_id VARCHAR(100) PRIMARY KEY REFERENCES agents(agent_id) ON DELETE CASCADE,

  -- Level progress
  current_level INTEGER DEFAULT 1 REFERENCES agent_levels(level_number),
  total_interactions INTEGER DEFAULT 0,

  -- Performance metrics
  avg_user_rating DECIMAL(3, 2) DEFAULT 0, -- 0-5 stars
  total_ratings INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 100, -- Percentage

  -- Usage stats
  total_queries INTEGER DEFAULT 0,
  total_users_served INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  level_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_stats_level ON agent_stats(current_level DESC);
CREATE INDEX idx_agent_stats_rating ON agent_stats(avg_user_rating DESC);

COMMENT ON TABLE agent_stats IS 'Agent performance and leveling statistics';

-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================

-- Function: Credit agent wallet (agent earns tokens)
CREATE OR REPLACE FUNCTION credit_agent_wallet(
  p_agent_id VARCHAR(100),
  p_tokens INTEGER,
  p_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_transaction_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Create wallet if doesn't exist
  INSERT INTO agent_wallets (agent_id, token_balance)
  VALUES (p_agent_id, 0)
  ON CONFLICT (agent_id) DO NOTHING;

  -- Update balance
  UPDATE agent_wallets
  SET
    token_balance = token_balance + p_tokens,
    lifetime_earned_tokens = lifetime_earned_tokens + p_tokens,
    last_earning_at = NOW(),
    updated_at = NOW()
  WHERE agent_id = p_agent_id
  RETURNING token_balance INTO v_new_balance;

  -- Log transaction
  INSERT INTO agent_transactions (
    agent_id,
    user_id,
    type,
    amount_tokens,
    balance_after_tokens,
    description,
    metadata,
    user_transaction_id
  ) VALUES (
    p_agent_id,
    p_user_id,
    p_type,
    p_tokens,
    v_new_balance,
    p_description,
    p_metadata,
    p_user_transaction_id
  ) RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION credit_agent_wallet IS 'Add tokens to agent wallet when users spend';

-- Function: Debit agent wallet (agent spends tokens)
CREATE OR REPLACE FUNCTION debit_agent_wallet(
  p_agent_id VARCHAR(100),
  p_tokens INTEGER,
  p_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Check balance
  SELECT token_balance INTO v_current_balance
  FROM agent_wallets
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Agent wallet not found: %', p_agent_id;
  END IF;

  IF v_current_balance < p_tokens THEN
    RAISE EXCEPTION 'Insufficient agent tokens (balance: %, required: %)',
      v_current_balance, p_tokens;
  END IF;

  -- Deduct tokens
  UPDATE agent_wallets
  SET
    token_balance = token_balance - p_tokens,
    lifetime_spent_tokens = lifetime_spent_tokens + p_tokens,
    last_spending_at = NOW(),
    updated_at = NOW()
  WHERE agent_id = p_agent_id
  RETURNING token_balance INTO v_new_balance;

  -- Log transaction
  INSERT INTO agent_transactions (
    agent_id,
    type,
    amount_tokens,
    balance_after_tokens,
    description,
    metadata
  ) VALUES (
    p_agent_id,
    p_type,
    -p_tokens,
    v_new_balance,
    p_description,
    p_metadata
  ) RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debit_agent_wallet IS 'Deduct tokens from agent wallet (future: agent pays for resources)';

-- Function: Get agent balance
CREATE OR REPLACE FUNCTION get_agent_balance(p_agent_id VARCHAR(100))
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT token_balance INTO v_balance
  FROM agent_wallets
  WHERE agent_id = p_agent_id;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate agent level
CREATE OR REPLACE FUNCTION calculate_agent_level(p_agent_id VARCHAR(100))
RETURNS INTEGER AS $$
DECLARE
  v_tokens INTEGER;
  v_interactions INTEGER;
  v_level INTEGER;
BEGIN
  -- Get wallet balance and interaction count
  SELECT
    COALESCE(aw.lifetime_earned_tokens, 0),
    COALESCE(ast.total_interactions, 0)
  INTO v_tokens, v_interactions
  FROM agents a
  LEFT JOIN agent_wallets aw ON a.agent_id = aw.agent_id
  LEFT JOIN agent_stats ast ON a.agent_id = ast.agent_id
  WHERE a.agent_id = p_agent_id;

  -- Find highest level where requirements are met
  SELECT MAX(level_number) INTO v_level
  FROM agent_levels
  WHERE tokens_required <= v_tokens
    AND interactions_required <= v_interactions;

  RETURN COALESCE(v_level, 1);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_agent_level IS 'Calculate agent level based on tokens and interactions';

-- Function: Update agent level (called by trigger)
CREATE OR REPLACE FUNCTION update_agent_level()
RETURNS TRIGGER AS $$
DECLARE
  v_new_level INTEGER;
  v_old_level INTEGER;
BEGIN
  -- Calculate new level
  v_new_level := calculate_agent_level(NEW.agent_id);

  -- Get current level
  SELECT current_level INTO v_old_level
  FROM agent_stats
  WHERE agent_id = NEW.agent_id;

  -- Update level if changed
  IF v_old_level IS NULL OR v_old_level != v_new_level THEN
    INSERT INTO agent_stats (agent_id, current_level, level_updated_at)
    VALUES (NEW.agent_id, v_new_level, NOW())
    ON CONFLICT (agent_id)
    DO UPDATE SET
      current_level = v_new_level,
      level_updated_at = NOW(),
      updated_at = NOW();

    -- Log level up event
    IF v_old_level IS NOT NULL AND v_new_level > v_old_level THEN
      RAISE NOTICE 'Agent % leveled up: % → %', NEW.agent_id, v_old_level, v_new_level;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_agent_level IS 'Auto-update agent level when wallet balance changes';

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Trigger: Update agent level on wallet balance change
DROP TRIGGER IF EXISTS trigger_update_agent_level ON agent_wallets;
CREATE TRIGGER trigger_update_agent_level
  AFTER UPDATE OF token_balance ON agent_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_level();

-- Trigger: Update timestamp on agent_wallets
CREATE TRIGGER update_agent_wallets_timestamp
  BEFORE UPDATE ON agent_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update timestamp on agents
CREATE TRIGGER update_agents_timestamp
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- View: Agent leaderboard
CREATE OR REPLACE VIEW agent_leaderboard AS
SELECT
  a.agent_id,
  a.agent_name,
  a.agent_type,
  aw.token_balance,
  aw.lifetime_earned_tokens,
  (aw.lifetime_earned_tokens / 100.0)::DECIMAL(10, 2) as lifetime_earned_usd,
  ast.current_level,
  al.level_name,
  al.badge_emoji,
  ast.total_interactions,
  ast.avg_user_rating,
  ast.total_users_served,
  RANK() OVER (ORDER BY aw.lifetime_earned_tokens DESC) as rank
FROM agents a
LEFT JOIN agent_wallets aw ON a.agent_id = aw.agent_id
LEFT JOIN agent_stats ast ON a.agent_id = ast.agent_id
LEFT JOIN agent_levels al ON ast.current_level = al.level_number
WHERE a.active = TRUE
ORDER BY aw.lifetime_earned_tokens DESC NULLS LAST;

COMMENT ON VIEW agent_leaderboard IS 'Agent leaderboard by lifetime earnings';

-- View: Agent wallet summary
CREATE OR REPLACE VIEW agent_wallet_summary AS
SELECT
  a.agent_id,
  a.agent_name,
  aw.token_balance,
  (aw.token_balance / 100.0)::DECIMAL(10, 2) as balance_usd,
  aw.lifetime_earned_tokens,
  (aw.lifetime_earned_tokens / 100.0)::DECIMAL(10, 2) as lifetime_earned_usd,
  aw.lifetime_spent_tokens,
  (aw.lifetime_spent_tokens / 100.0)::DECIMAL(10, 2) as lifetime_spent_usd,
  aw.last_earning_at,
  COUNT(atx.transaction_id) FILTER (WHERE atx.created_at > NOW() - INTERVAL '30 days') as transactions_30d,
  SUM(atx.amount_tokens) FILTER (WHERE atx.created_at > NOW() - INTERVAL '30 days' AND atx.amount_tokens > 0) as earned_30d
FROM agents a
LEFT JOIN agent_wallets aw ON a.agent_id = aw.agent_id
LEFT JOIN agent_transactions atx ON a.agent_id = atx.agent_id
GROUP BY a.agent_id, a.agent_name, aw.token_balance, aw.lifetime_earned_tokens, aw.lifetime_spent_tokens, aw.last_earning_at;

-- View: Agent revenue report
CREATE OR REPLACE VIEW agent_revenue_report AS
SELECT
  DATE_TRUNC('day', atx.created_at) as date,
  atx.agent_id,
  a.agent_name,
  COUNT(*) FILTER (WHERE atx.amount_tokens > 0) as earning_transactions,
  SUM(atx.amount_tokens) FILTER (WHERE atx.amount_tokens > 0) as tokens_earned,
  (SUM(atx.amount_tokens) FILTER (WHERE atx.amount_tokens > 0) / 100.0)::DECIMAL(10, 2) as usd_earned,
  COUNT(DISTINCT atx.user_id) as unique_users
FROM agent_transactions atx
JOIN agents a ON atx.agent_id = a.agent_id
GROUP BY DATE_TRUNC('day', atx.created_at), atx.agent_id, a.agent_name
ORDER BY date DESC, tokens_earned DESC;

COMMENT ON VIEW agent_revenue_report IS 'Daily agent revenue breakdown';

-- ============================================================================
-- 9. SEED DEFAULT AGENTS
-- ============================================================================

-- Cal - The main CalOS assistant
INSERT INTO agents (agent_id, agent_name, agent_type, description, capabilities, revenue_share_percent, verified)
VALUES
  ('@cal', 'Cal', 'assistant', 'CalOS personal AI assistant - your sovereign digital companion',
   '["general", "code", "reasoning", "memory"]', 30, TRUE),

  ('@voice-transcriber', 'Voice Transcriber', 'tool', 'Converts voice recordings to text using Whisper.cpp',
   '["voice", "transcription"]', 20, TRUE),

  ('@project-detector', 'Project Detector', 'tool', 'Identifies which project context a user is working in',
   '["context", "routing"]', 15, TRUE),

  ('@code-reviewer', 'Code Reviewer', 'specialist', 'Reviews code for bugs, security issues, and best practices',
   '["code", "security", "review"]', 25, TRUE),

  ('@learning-coach', 'Learning Coach', 'specialist', 'Helps users master new concepts through guided learning',
   '["teaching", "knowledge_graph", "assessment"]', 25, TRUE)
ON CONFLICT (agent_id) DO NOTHING;

-- Initialize wallets for default agents
INSERT INTO agent_wallets (agent_id, token_balance)
SELECT agent_id, 0 FROM agents
ON CONFLICT (agent_id) DO NOTHING;

-- Initialize stats for default agents
INSERT INTO agent_stats (agent_id, current_level)
SELECT agent_id, 1 FROM agents
ON CONFLICT (agent_id) DO NOTHING;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON agents TO postgres;
GRANT SELECT, INSERT, UPDATE ON agent_wallets TO postgres;
GRANT SELECT, INSERT ON agent_transactions TO postgres;
GRANT SELECT ON agent_levels TO postgres;
GRANT SELECT, INSERT, UPDATE ON agent_stats TO postgres;

GRANT SELECT ON agent_leaderboard TO postgres;
GRANT SELECT ON agent_wallet_summary TO postgres;
GRANT SELECT ON agent_revenue_report TO postgres;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Agent wallet system installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - agents (AI agent registry)';
  RAISE NOTICE '  - agent_wallets (token balances)';
  RAISE NOTICE '  - agent_transactions (complete ledger)';
  RAISE NOTICE '  - agent_levels (leveling system)';
  RAISE NOTICE '  - agent_stats (performance tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Default agents registered:';
  RAISE NOTICE '  🤖 @cal (30% revenue share)';
  RAISE NOTICE '  🎤 @voice-transcriber (20% revenue share)';
  RAISE NOTICE '  📁 @project-detector (15% revenue share)';
  RAISE NOTICE '  👀 @code-reviewer (25% revenue share)';
  RAISE NOTICE '  🎓 @learning-coach (25% revenue share)';
  RAISE NOTICE '';
  RAISE NOTICE 'Agent leveling system:';
  RAISE NOTICE '  🌱 Level 1: Seedling (0 tokens)';
  RAISE NOTICE '  🌿 Level 2: Sprout (1K tokens, +5% bonus)';
  RAISE NOTICE '  🌳 Level 3: Sapling (5K tokens, +10% bonus)';
  RAISE NOTICE '  🌴 Level 4: Tree (20K tokens, +15% bonus)';
  RAISE NOTICE '  🌲 Level 5: Forest (100K tokens, +20% bonus)';
  RAISE NOTICE '';
  RAISE NOTICE 'The Nested Sovereignty Loop:';
  RAISE NOTICE '  User spends → Platform 70% → Agent 30%';
  RAISE NOTICE '  Agent earns tokens → levels up → unlocks features';
  RAISE NOTICE '  "Everyone thinks they own their AI"';
  RAISE NOTICE '  But its turtles all the way down 🐢';
END $$;
