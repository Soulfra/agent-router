-- Migration 058: ActivityPub Federation
-- Enables CalRiven.com to federate with Mastodon and other ActivityPub servers

-- ActivityPub followers (other Mastodon users following CalRiven)
CREATE TABLE IF NOT EXISTS activitypub_followers (
  follower_id SERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL UNIQUE, -- Actor URL (e.g., https://mastodon.social/users/alice)
  inbox_url TEXT NOT NULL, -- Follower's inbox URL
  shared_inbox_url TEXT NULL, -- Shared inbox (optional)
  actor_data JSONB NULL, -- Full actor object
  followed_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW()
);

-- ActivityPub activities (incoming activities log)
CREATE TABLE IF NOT EXISTS activitypub_activities (
  activity_id SERIAL PRIMARY KEY,
  activity_type TEXT NOT NULL, -- Follow, Like, Announce, etc.
  actor_id TEXT NOT NULL,
  object_id TEXT NULL,
  activity_data JSONB NOT NULL, -- Full activity object
  received_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT false
);

-- ActivityPub outbox (CalRiven's published activities)
CREATE TABLE IF NOT EXISTS activitypub_outbox (
  outbox_id SERIAL PRIMARY KEY,
  activity_type TEXT NOT NULL, -- Create, Announce, etc.
  object_type TEXT NOT NULL, -- Note, Article, etc.
  object_id TEXT NOT NULL, -- Internal ID (article_id, etc.)
  activity_data JSONB NOT NULL, -- Full activity object
  published_at TIMESTAMP DEFAULT NOW(),
  sent_to_followers INTEGER DEFAULT 0 -- How many followers received it
);

-- RSA keys for HTTP Signatures (authentication)
CREATE TABLE IF NOT EXISTS activitypub_keys (
  key_id SERIAL PRIMARY KEY,
  actor_username TEXT NOT NULL UNIQUE, -- 'calriven'
  public_key TEXT NOT NULL, -- PEM format
  private_key TEXT NOT NULL, -- PEM format (encrypted)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_followers_actor ON activitypub_followers(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activitypub_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_actor ON activitypub_activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_outbox_object ON activitypub_outbox(object_id);

-- Insert CalRiven's RSA keys (generate new ones or use existing)
-- TODO: Generate real RSA keys
INSERT INTO activitypub_keys (actor_username, public_key, private_key)
VALUES (
  'calriven',
  '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----'
) ON CONFLICT (actor_username) DO NOTHING;

COMMENT ON TABLE activitypub_followers IS 'Mastodon/ActivityPub followers of CalRiven';
COMMENT ON TABLE activitypub_activities IS 'Incoming ActivityPub activities log';
COMMENT ON TABLE activitypub_outbox IS 'CalRiven published activities';
COMMENT ON TABLE activitypub_keys IS 'RSA keys for HTTP Signatures';
