-- ============================================================================
-- Video Game Lore System for Branding Bot
-- ============================================================================
-- Stores video game lore (games, characters, events, locations) and uses it
-- to generate "organic" forum discussions across your domain empire.
--
-- Strategy: Use complex video game lore as the basis for discussions that
-- could gain traction (similar to StackOverflow's niche communities).
--
-- Ethical note: All bot-generated content MUST be clearly marked as
-- bot-generated to avoid deception.
-- ============================================================================

-- Games table (video game franchises)
CREATE TABLE IF NOT EXISTS game_lore_games (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  franchise VARCHAR(255),
  genre VARCHAR(100),
  release_year INTEGER,
  developer VARCHAR(255),
  description TEXT,
  complexity_level INTEGER DEFAULT 5, -- 1-10, how deep is the lore?
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_games(slug);
CREATE INDEX ON game_lore_games(franchise);
CREATE INDEX ON game_lore_games(active);

-- Characters table (NPCs, protagonists, antagonists)
CREATE TABLE IF NOT EXISTS game_lore_characters (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES game_lore_games(id) ON DELETE CASCADE,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  role VARCHAR(100), -- protagonist, antagonist, npc, companion
  species VARCHAR(100),
  faction VARCHAR(255),
  backstory TEXT,
  motivations TEXT,
  relationships JSONB DEFAULT '[]', -- [{character_id, relationship_type, description}]
  key_quotes TEXT[],
  image_url VARCHAR(1000),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_characters(game_id);
CREATE INDEX ON game_lore_characters(slug);
CREATE INDEX ON game_lore_characters(role);
CREATE INDEX ON game_lore_characters(active);

-- Events table (major plot points, battles, discoveries)
CREATE TABLE IF NOT EXISTS game_lore_events (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES game_lore_games(id) ON DELETE CASCADE,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  event_type VARCHAR(100), -- battle, discovery, betrayal, alliance, etc.
  timeline VARCHAR(255), -- When it happened in-game chronology
  location VARCHAR(500),
  description TEXT,
  participants INTEGER[], -- Array of character IDs
  consequences TEXT,
  significance INTEGER DEFAULT 5, -- 1-10, how important is this event?
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_events(game_id);
CREATE INDEX ON game_lore_events(slug);
CREATE INDEX ON game_lore_events(event_type);
CREATE INDEX ON game_lore_events(active);

-- Locations table (worlds, cities, dungeons)
CREATE TABLE IF NOT EXISTS game_lore_locations (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES game_lore_games(id) ON DELETE CASCADE,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  location_type VARCHAR(100), -- world, region, city, dungeon, landmark
  parent_location_id INTEGER REFERENCES game_lore_locations(id),
  description TEXT,
  inhabitants VARCHAR(500)[],
  significance TEXT,
  secrets TEXT, -- Hidden lore
  related_events INTEGER[], -- Array of event IDs
  map_url VARCHAR(1000),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_locations(game_id);
CREATE INDEX ON game_lore_locations(slug);
CREATE INDEX ON game_lore_locations(location_type);
CREATE INDEX ON game_lore_locations(parent_location_id);
CREATE INDEX ON game_lore_locations(active);

-- Lore Fragments (mysteries, prophecies, hidden knowledge)
CREATE TABLE IF NOT EXISTS game_lore_fragments (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES game_lore_games(id) ON DELETE CASCADE,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  fragment_type VARCHAR(100), -- prophecy, mystery, legend, codex_entry, item_description
  content TEXT NOT NULL,
  source VARCHAR(500), -- Where this lore appears (book, NPC dialogue, item, etc.)
  related_characters INTEGER[],
  related_events INTEGER[],
  related_locations INTEGER[],
  interpretation_difficulty INTEGER DEFAULT 5, -- 1-10, how hard to understand?
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_fragments(game_id);
CREATE INDEX ON game_lore_fragments(slug);
CREATE INDEX ON game_lore_fragments(fragment_type);
CREATE INDEX ON game_lore_fragments(active);

-- Discussion Templates (how to frame bot posts)
CREATE TABLE IF NOT EXISTS game_lore_discussion_templates (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  template_type VARCHAR(100), -- question, theory, analysis, comparison, discovery
  title_template VARCHAR(1000) NOT NULL,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '{}', -- {game, character, event, location, fragment}
  suitable_for_games INTEGER[], -- Which games this works for
  engagement_potential INTEGER DEFAULT 5, -- 1-10, how likely to get responses?
  used_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON game_lore_discussion_templates(slug);
CREATE INDEX ON game_lore_discussion_templates(template_type);
CREATE INDEX ON game_lore_discussion_templates(active);

-- Bot Posts (track what the bot has posted)
CREATE TABLE IF NOT EXISTS game_lore_bot_posts (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL, -- Which domain was this posted to?
  thread_id INTEGER, -- Link to forum_threads table
  template_id INTEGER REFERENCES game_lore_discussion_templates(id),
  game_id INTEGER REFERENCES game_lore_games(id),
  title VARCHAR(1000) NOT NULL,
  body TEXT NOT NULL,
  variables_used JSONB DEFAULT '{}',
  posted_at TIMESTAMP DEFAULT NOW(),
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  engagement_score FLOAT DEFAULT 0.0, -- Calculated metric
  marked_as_bot BOOLEAN DEFAULT true, -- ALWAYS true for ethical reasons
  active BOOLEAN DEFAULT true
);

CREATE INDEX ON game_lore_bot_posts(domain);
CREATE INDEX ON game_lore_bot_posts(thread_id);
CREATE INDEX ON game_lore_bot_posts(game_id);
CREATE INDEX ON game_lore_bot_posts(posted_at);
CREATE INDEX ON game_lore_bot_posts(engagement_score);

-- Seed some example data (Dark Souls as example)
INSERT INTO game_lore_games (slug, name, franchise, genre, release_year, developer, description, complexity_level)
VALUES
  ('dark-souls', 'Dark Souls', 'Souls', 'Action RPG', 2011, 'FromSoftware', 'A dark fantasy action RPG known for its cryptic lore and interconnected world design. The story is told through item descriptions, environmental storytelling, and cryptic NPC dialogue.', 10),
  ('elden-ring', 'Elden Ring', 'Souls', 'Action RPG', 2022, 'FromSoftware', 'An open-world action RPG with deep lore written by George R.R. Martin and FromSoftware. Features a shattered world and complex demigod politics.', 9),
  ('hollow-knight', 'Hollow Knight', 'Hollow Knight', 'Metroidvania', 2017, 'Team Cherry', 'A beautifully crafted metroidvania with deep lore about a fallen kingdom and ancient gods. Story unfolds through exploration and environmental clues.', 8),
  ('mass-effect', 'Mass Effect', 'Mass Effect', 'Sci-Fi RPG', 2007, 'BioWare', 'A space opera RPG with rich lore about alien civilizations, ancient technology, and galactic politics.', 9),
  ('skyrim', 'The Elder Scrolls V: Skyrim', 'The Elder Scrolls', 'Open World RPG', 2011, 'Bethesda', 'An open-world fantasy RPG with thousands of years of in-universe history, multiple conflicting accounts, and deep philosophical themes.', 10)
ON CONFLICT (slug) DO NOTHING;

-- Example discussion templates
INSERT INTO game_lore_discussion_templates (slug, template_type, title_template, body_template, variables, suitable_for_games, engagement_potential)
VALUES
  (
    'theory-character-motivation',
    'theory',
    'Theory: Why {character_name} really {action}?',
    'I''ve been thinking about {character_name}''s motivations in {game_name}. At first, it seems like they {surface_motivation}, but if you look at {evidence_1} and {evidence_2}, there might be a deeper reason.\n\nWhat if {character_name} actually {theory}? This would explain:\n\n1. {reason_1}\n2. {reason_2}\n3. {reason_3}\n\nAm I reading too much into this, or is there something here?\n\n**Tagged as bot-generated content for transparency**',
    '{"character_name": "string", "game_name": "string", "action": "string", "surface_motivation": "string", "evidence_1": "string", "evidence_2": "string", "theory": "string", "reason_1": "string", "reason_2": "string", "reason_3": "string"}',
    ARRAY[1,2,3,4,5],
    8
  ),
  (
    'analysis-lore-fragment',
    'analysis',
    'Deep Dive: The significance of "{fragment_title}" in {game_name}',
    'I''ve been analyzing this piece of lore from {game_name}: "{fragment_content}"\n\nThis is significant because:\n\n**Historical Context**: {historical_context}\n\n**Connections**: This ties into {connection_1} and possibly {connection_2}.\n\n**Interpretation**: I think this suggests {interpretation}.\n\nWhat are your thoughts? Did I miss anything?\n\n**Tagged as bot-generated content for transparency**',
    '{"fragment_title": "string", "game_name": "string", "fragment_content": "string", "historical_context": "string", "connection_1": "string", "connection_2": "string", "interpretation": "string"}',
    ARRAY[1,2,3,4,5],
    7
  ),
  (
    'question-event-timeline',
    'question',
    'Question: Timeline confusion about {event_name} in {game_name}',
    'Can someone help me understand the timeline of {event_name}?\n\nAccording to {source_1}, it happened {timeline_1}. But {source_2} suggests {timeline_2}.\n\nAre these:\na) Two different events?\nb) The same event from different perspectives?\nc) A continuity error?\n\nHow do you reconcile this?\n\n**Tagged as bot-generated content for transparency**',
    '{"event_name": "string", "game_name": "string", "source_1": "string", "timeline_1": "string", "source_2": "string", "timeline_2": "string"}',
    ARRAY[1,2,3,4,5],
    9
  )
ON CONFLICT (slug) DO NOTHING;

-- Function to calculate engagement score
CREATE OR REPLACE FUNCTION calculate_post_engagement(
  upvotes INTEGER,
  downvotes INTEGER,
  comment_count INTEGER,
  age_hours FLOAT
) RETURNS FLOAT AS $$
BEGIN
  -- Reddit's "hot" algorithm (simplified)
  RETURN (
    (upvotes - downvotes + (comment_count * 2))::FLOAT /
    POWER(age_hours + 2, 1.5)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to update engagement score
CREATE OR REPLACE FUNCTION update_bot_post_engagement()
RETURNS TRIGGER AS $$
BEGIN
  NEW.engagement_score := calculate_post_engagement(
    NEW.upvotes,
    NEW.downvotes,
    NEW.comment_count,
    EXTRACT(EPOCH FROM (NOW() - NEW.posted_at)) / 3600.0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bot_post_engagement_trigger
BEFORE INSERT OR UPDATE ON game_lore_bot_posts
FOR EACH ROW
EXECUTE FUNCTION update_bot_post_engagement();

COMMENT ON TABLE game_lore_games IS 'Video games with rich lore for discussion generation';
COMMENT ON TABLE game_lore_characters IS 'Characters from games (for bot discussions)';
COMMENT ON TABLE game_lore_events IS 'Major events in game lore (for bot discussions)';
COMMENT ON TABLE game_lore_locations IS 'Locations in game worlds (for bot discussions)';
COMMENT ON TABLE game_lore_fragments IS 'Mysterious lore fragments (for speculation threads)';
COMMENT ON TABLE game_lore_discussion_templates IS 'Templates for generating bot discussions';
COMMENT ON TABLE game_lore_bot_posts IS 'Track bot-generated posts (ALWAYS marked as bot content)';
