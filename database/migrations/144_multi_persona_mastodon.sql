-- Migration 144: Multi-Persona ActivityPub System
--
-- Extends ActivityPub to support multiple personas per brand domain
-- Each persona has unique identity, followers, personality, and topics
--
-- Example personas:
-- - Alice @alice@soulfra.com (privacy activist)
-- - Bob @bob@deathtodata.com (anti-surveillance)
-- - CalRiven @calriven@calriven.com (AI publisher)
-- - RoughSpark @roughspark@roughsparks.com (designer)

-- Personas table
CREATE TABLE IF NOT EXISTS activitypub_personas (
  persona_id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  summary TEXT,
  brand VARCHAR(50), -- soulfra, deathtodata, calriven, etc.
  personality VARCHAR(50), -- activist, technical, creative, business, whimsical
  topics JSONB DEFAULT '[]'::jsonb, -- ["privacy", "zero-knowledge", "data-rights"]
  icon_url TEXT,
  preferred_languages JSONB DEFAULT '["en"]'::jsonb,

  -- ActivityPub identity
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  actor_id TEXT NOT NULL UNIQUE,
  inbox_url TEXT NOT NULL,
  outbox_url TEXT NOT NULL,
  followers_url TEXT NOT NULL,
  following_url TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(username, domain)
);

CREATE INDEX idx_activitypub_personas_brand ON activitypub_personas(brand);
CREATE INDEX idx_activitypub_personas_username ON activitypub_personas(username);
CREATE INDEX idx_activitypub_personas_actor_id ON activitypub_personas(actor_id);

-- Followers table
CREATE TABLE IF NOT EXISTS activitypub_followers (
  follower_id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES activitypub_personas(persona_id) ON DELETE CASCADE,
  follower_actor_id TEXT NOT NULL,
  follower_inbox_url TEXT NOT NULL,
  follower_data JSONB, -- Full actor object
  status VARCHAR(20) DEFAULT 'pending', -- pending | accepted | rejected

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(persona_id, follower_actor_id)
);

CREATE INDEX idx_activitypub_followers_persona ON activitypub_followers(persona_id);
CREATE INDEX idx_activitypub_followers_status ON activitypub_followers(status);

-- Posts table
CREATE TABLE IF NOT EXISTS activitypub_posts (
  post_id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES activitypub_personas(persona_id) ON DELETE CASCADE,
  note_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  visibility VARCHAR(20) DEFAULT 'public', -- public | unlisted | followers | direct
  activity_data JSONB, -- Full Create activity object

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activitypub_posts_persona ON activitypub_posts(persona_id);
CREATE INDEX idx_activitypub_posts_language ON activitypub_posts(language);
CREATE INDEX idx_activitypub_posts_created ON activitypub_posts(created_at DESC);

-- Comments
COMMENT ON TABLE activitypub_personas IS 'Multiple ActivityPub personas per brand - Alice, Bob, CalRiven, etc.';
COMMENT ON TABLE activitypub_followers IS 'Followers for each persona';
COMMENT ON TABLE activitypub_posts IS 'Posts created by each persona';

COMMENT ON COLUMN activitypub_personas.personality IS 'activist | technical | creative | business | whimsical';
COMMENT ON COLUMN activitypub_personas.topics IS 'Array of topic tags for routing content to persona';
COMMENT ON COLUMN activitypub_personas.preferred_languages IS 'Languages this persona posts in';
