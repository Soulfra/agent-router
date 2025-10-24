-- Migration: Marketplace, Reputation, and Communication Systems
-- Adds tables for idea marketplace, reputation/karma, GitHub activity feed, and profile communications

-- ============================================================================
-- User Reputation Table
-- Karma and trust score tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_reputation (
  user_id TEXT PRIMARY KEY,

  -- Reputation metrics
  karma INT DEFAULT 0,
  trust_score FLOAT DEFAULT 0.5, -- 0-1 scale

  -- Badge/tier
  badge TEXT DEFAULT 'newcomer', -- 'newcomer', 'contributor', 'veteran', 'legend'

  -- Reputation breakdown (cached for performance)
  reputation_breakdown JSONB DEFAULT '{}'::JSONB,

  -- Achievements
  achievements TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Timestamps
  joined_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_reputation_karma ON user_reputation(karma DESC);
CREATE INDEX idx_user_reputation_trust ON user_reputation(trust_score DESC);
CREATE INDEX idx_user_reputation_badge ON user_reputation(badge);
CREATE INDEX idx_user_reputation_activity ON user_reputation(last_activity DESC);

-- ============================================================================
-- Karma Transactions Table
-- Detailed karma history
-- ============================================================================

CREATE TABLE IF NOT EXISTS karma_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Transaction details
  action_type TEXT NOT NULL, -- 'commit', 'pr_merged', 'code_review', etc.
  karma_value INT NOT NULL, -- Karma awarded/deducted

  -- Context
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_karma_transactions_user ON karma_transactions(user_id);
CREATE INDEX idx_karma_transactions_action ON karma_transactions(action_type);
CREATE INDEX idx_karma_transactions_created ON karma_transactions(created_at DESC);

-- ============================================================================
-- User Followers Table
-- Follow/following relationships
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_followers (
  id SERIAL PRIMARY KEY,
  follower_id TEXT NOT NULL, -- User doing the following
  followee_id TEXT NOT NULL, -- User being followed

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(follower_id, followee_id),
  CHECK (follower_id != followee_id) -- Can't follow yourself
);

CREATE INDEX idx_user_followers_follower ON user_followers(follower_id);
CREATE INDEX idx_user_followers_followee ON user_followers(followee_id);
CREATE INDEX idx_user_followers_created ON user_followers(created_at DESC);

-- ============================================================================
-- Marketplace Ideas Table
-- Anonymous idea submissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_ideas (
  id SERIAL PRIMARY KEY,
  creator_id TEXT NOT NULL, -- Kept private (anonymous to buyers)

  -- Idea details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'marketing', 'product', 'technical', 'business'
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Pricing
  price DECIMAL(10, 2) DEFAULT 1.00,

  -- Stats
  vote_count INT DEFAULT 0,
  purchase_count INT DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0.00,

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'sold_out', 'archived'
  allow_preview BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_marketplace_ideas_creator ON marketplace_ideas(creator_id);
CREATE INDEX idx_marketplace_ideas_category ON marketplace_ideas(category);
CREATE INDEX idx_marketplace_ideas_status ON marketplace_ideas(status);
CREATE INDEX idx_marketplace_ideas_tags ON marketplace_ideas USING gin(tags);
CREATE INDEX idx_marketplace_ideas_votes ON marketplace_ideas(vote_count DESC);
CREATE INDEX idx_marketplace_ideas_purchases ON marketplace_ideas(purchase_count DESC);
CREATE INDEX idx_marketplace_ideas_created ON marketplace_ideas(created_at DESC);

-- Full text search on title and description
CREATE INDEX idx_marketplace_ideas_search ON marketplace_ideas
  USING gin(to_tsvector('english', title || ' ' || description));

-- ============================================================================
-- Idea Purchases Table
-- Track who purchased what
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_purchases (
  id SERIAL PRIMARY KEY,
  idea_id INT NOT NULL REFERENCES marketplace_ideas(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,

  -- Payment details
  price_paid DECIMAL(10, 2) NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,

  purchased_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(idea_id, buyer_id) -- Can't purchase same idea twice
);

CREATE INDEX idx_idea_purchases_idea ON idea_purchases(idea_id);
CREATE INDEX idx_idea_purchases_buyer ON idea_purchases(buyer_id);
CREATE INDEX idx_idea_purchases_creator ON idea_purchases(creator_id);
CREATE INDEX idx_idea_purchases_purchased ON idea_purchases(purchased_at DESC);

-- ============================================================================
-- Idea Votes Table
-- Free upvotes for ideas
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_votes (
  id SERIAL PRIMARY KEY,
  idea_id INT NOT NULL REFERENCES marketplace_ideas(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(idea_id, user_id) -- Can't vote twice
);

CREATE INDEX idx_idea_votes_idea ON idea_votes(idea_id);
CREATE INDEX idx_idea_votes_user ON idea_votes(user_id);

-- ============================================================================
-- GitHub Activity Feed Table
-- Twitter-like feed for GitHub actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS github_activity_feed (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Activity details
  activity_type TEXT NOT NULL, -- 'commit', 'pr_opened', 'pr_merged', etc.
  content JSONB NOT NULL, -- {repo, title, url, etc.}

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Social stats
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  repost_count INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_github_activity_user ON github_activity_feed(user_id);
CREATE INDEX idx_github_activity_type ON github_activity_feed(activity_type);
CREATE INDEX idx_github_activity_created ON github_activity_feed(created_at DESC);
CREATE INDEX idx_github_activity_likes ON github_activity_feed(like_count DESC);
CREATE INDEX idx_github_activity_trending ON github_activity_feed(
  (like_count + (comment_count * 2) + (repost_count * 3)) DESC
);

-- ============================================================================
-- Activity Likes Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_likes (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES github_activity_feed(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(activity_id, user_id)
);

CREATE INDEX idx_activity_likes_activity ON activity_likes(activity_id);
CREATE INDEX idx_activity_likes_user ON activity_likes(user_id);

-- ============================================================================
-- Activity Comments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_comments (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES github_activity_feed(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  comment TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_comments_activity ON activity_comments(activity_id);
CREATE INDEX idx_activity_comments_user ON activity_comments(user_id);
CREATE INDEX idx_activity_comments_created ON activity_comments(created_at DESC);

-- ============================================================================
-- Activity Reposts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_reposts (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES github_activity_feed(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  comment TEXT, -- Optional repost comment (like retweet with comment)

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(activity_id, user_id)
);

CREATE INDEX idx_activity_reposts_activity ON activity_reposts(activity_id);
CREATE INDEX idx_activity_reposts_user ON activity_reposts(user_id);

-- ============================================================================
-- Profile Messages Table
-- Communication via GitHub profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_messages (
  id SERIAL PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,

  -- Message details
  subject TEXT DEFAULT '',
  content TEXT NOT NULL,

  -- Threading
  thread_id INT, -- Self-referencing for threads

  -- Routing
  routing_category TEXT DEFAULT 'general',
  routing_slack_channel TEXT,
  routing_agent_type TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Status
  status TEXT DEFAULT 'sent', -- 'sent', 'read', 'routed_to_slack', 'handled_by_agent'

  -- Timestamps
  sent_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX idx_profile_messages_from ON profile_messages(from_user_id);
CREATE INDEX idx_profile_messages_to ON profile_messages(to_user_id);
CREATE INDEX idx_profile_messages_thread ON profile_messages(thread_id);
CREATE INDEX idx_profile_messages_status ON profile_messages(status);
CREATE INDEX idx_profile_messages_sent ON profile_messages(sent_at DESC);

-- Full text search on subject and content
CREATE INDEX idx_profile_messages_search ON profile_messages
  USING gin(to_tsvector('english', subject || ' ' || content));

-- ============================================================================
-- Message Slack Routing Table
-- Track messages routed to Slack
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_slack_routing (
  id SERIAL PRIMARY KEY,
  message_id INT NOT NULL REFERENCES profile_messages(id) ON DELETE CASCADE,

  -- Slack details
  slack_message_ts TEXT NOT NULL, -- Slack message timestamp (ID)
  slack_channel_id TEXT NOT NULL,

  routed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_slack_routing_message ON message_slack_routing(message_id);
CREATE INDEX idx_message_slack_routing_slack ON message_slack_routing(slack_message_ts);

-- ============================================================================
-- Message Agent Routing Table
-- Track messages handled by agent swarm
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_agent_routing (
  id SERIAL PRIMARY KEY,
  message_id INT NOT NULL REFERENCES profile_messages(id) ON DELETE CASCADE,

  -- Agent details
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,

  -- Response tracking
  response_at TIMESTAMP,

  routed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_agent_routing_message ON message_agent_routing(message_id);
CREATE INDEX idx_message_agent_routing_agent ON message_agent_routing(agent_id);
CREATE INDEX idx_message_agent_routing_type ON message_agent_routing(agent_type);

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- View: User Reputation Leaderboard
CREATE OR REPLACE VIEW v_reputation_leaderboard AS
SELECT
  user_id,
  karma,
  trust_score,
  badge,
  (SELECT COUNT(*) FROM user_followers WHERE followee_id = user_reputation.user_id) as follower_count,
  joined_at,
  last_activity
FROM user_reputation
ORDER BY karma DESC, trust_score DESC;

-- View: Marketplace Stats
CREATE OR REPLACE VIEW v_marketplace_stats AS
SELECT
  category,
  COUNT(*) as idea_count,
  SUM(vote_count) as total_votes,
  SUM(purchase_count) as total_purchases,
  SUM(total_revenue) as total_revenue,
  AVG(price) as avg_price
FROM marketplace_ideas
WHERE status = 'active'
GROUP BY category;

-- View: Trending Ideas
CREATE OR REPLACE VIEW v_trending_ideas AS
SELECT
  id,
  title,
  category,
  vote_count,
  purchase_count,
  (vote_count + (purchase_count * 5)) as trending_score,
  created_at
FROM marketplace_ideas
WHERE status = 'active'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY trending_score DESC;

-- View: Activity Feed Stats
CREATE OR REPLACE VIEW v_activity_stats AS
SELECT
  user_id,
  COUNT(*) as activity_count,
  SUM(like_count) as total_likes,
  SUM(comment_count) as total_comments,
  SUM(repost_count) as total_reposts,
  MAX(created_at) as last_activity
FROM github_activity_feed
GROUP BY user_id;

-- View: Communication Stats
CREATE OR REPLACE VIEW v_communication_stats AS
SELECT
  user_id,
  sent_count,
  received_count,
  unread_count,
  thread_count
FROM (
  SELECT
    COALESCE(s.user_id, r.user_id) as user_id,
    COALESCE(s.sent_count, 0) as sent_count,
    COALESCE(r.received_count, 0) as received_count,
    COALESCE(r.unread_count, 0) as unread_count,
    COALESCE(t.thread_count, 0) as thread_count
  FROM (
    SELECT from_user_id as user_id, COUNT(*) as sent_count
    FROM profile_messages
    GROUP BY from_user_id
  ) s
  FULL OUTER JOIN (
    SELECT to_user_id as user_id,
           COUNT(*) as received_count,
           COUNT(*) FILTER (WHERE status = 'sent') as unread_count
    FROM profile_messages
    GROUP BY to_user_id
  ) r ON s.user_id = r.user_id
  FULL OUTER JOIN (
    SELECT
      CASE WHEN from_user_id < to_user_id THEN from_user_id ELSE to_user_id END as user_id,
      COUNT(DISTINCT thread_id) as thread_count
    FROM profile_messages
    GROUP BY 1
  ) t ON COALESCE(s.user_id, r.user_id) = t.user_id
) combined;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update user_reputation.last_activity on karma transaction
CREATE OR REPLACE FUNCTION update_reputation_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_reputation
  SET last_activity = NOW()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reputation_activity
AFTER INSERT ON karma_transactions
FOR EACH ROW
EXECUTE FUNCTION update_reputation_activity();

-- ============================================================================
-- Sample Data
-- ============================================================================

-- Insert Cal's reputation profile
INSERT INTO user_reputation (user_id, karma, trust_score, badge, joined_at)
VALUES (
  'cal',
  10, -- Starting karma
  0.5, -- Starting trust
  'newcomer',
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE user_reputation IS 'User karma and trust scores with badge progression';
COMMENT ON TABLE karma_transactions IS 'Detailed karma transaction history';
COMMENT ON TABLE user_followers IS 'Follow/following relationships';
COMMENT ON TABLE marketplace_ideas IS 'Anonymous idea submissions for marketplace';
COMMENT ON TABLE idea_purchases IS 'Idea purchase transactions with Stripe integration';
COMMENT ON TABLE idea_votes IS 'Free upvotes for marketplace ideas';
COMMENT ON TABLE github_activity_feed IS 'Twitter-like feed for GitHub activity';
COMMENT ON TABLE activity_likes IS 'Likes on activity feed posts';
COMMENT ON TABLE activity_comments IS 'Comments on activity feed posts';
COMMENT ON TABLE activity_reposts IS 'Reposts of activity feed posts';
COMMENT ON TABLE profile_messages IS 'Communication via GitHub profiles';
COMMENT ON TABLE message_slack_routing IS 'Messages routed to Slack channels';
COMMENT ON TABLE message_agent_routing IS 'Messages handled by agent swarm';

COMMENT ON VIEW v_reputation_leaderboard IS 'User reputation leaderboard';
COMMENT ON VIEW v_marketplace_stats IS 'Marketplace statistics by category';
COMMENT ON VIEW v_trending_ideas IS 'Trending marketplace ideas';
COMMENT ON VIEW v_activity_stats IS 'GitHub activity feed statistics';
COMMENT ON VIEW v_communication_stats IS 'Communication statistics per user';
