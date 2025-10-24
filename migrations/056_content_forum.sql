-- Migration: Content Forum System
-- Purpose: Reddit/HN-style discussion threads for curated content
-- Features: Nested comments, voting, karma, old-school BBS aesthetic

-- ============================================================================
-- FORUM THREADS
-- ============================================================================

CREATE TABLE IF NOT EXISTS forum_threads (
  id SERIAL PRIMARY KEY,

  -- Thread metadata
  content_id INTEGER REFERENCES curated_content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT, -- External link or internal content

  -- Author
  author_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255),

  -- Content
  body TEXT,

  -- Engagement metrics
  score INTEGER DEFAULT 0, -- Upvotes - downvotes
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,

  -- Flags
  pinned BOOLEAN DEFAULT FALSE,
  locked BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  tags TEXT[], -- Topic tags
  flair VARCHAR(100) -- Thread flair (like Reddit)
);

-- Indexes
CREATE INDEX idx_forum_threads_content ON forum_threads(content_id);
CREATE INDEX idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX idx_forum_threads_score ON forum_threads(score DESC);
CREATE INDEX idx_forum_threads_activity ON forum_threads(last_activity_at DESC);
CREATE INDEX idx_forum_threads_created ON forum_threads(created_at DESC);
CREATE INDEX idx_forum_threads_tags ON forum_threads USING gin(tags);

-- ============================================================================
-- FORUM POSTS (Comments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forum_posts (
  id SERIAL PRIMARY KEY,

  -- Thread reference
  thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,

  -- Parent post (for nested comments)
  parent_id INTEGER REFERENCES forum_posts(id) ON DELETE CASCADE,
  depth INTEGER DEFAULT 0, -- Nesting depth (0 = top-level)

  -- Author
  author_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255),

  -- Content
  body TEXT NOT NULL,

  -- Engagement metrics
  score INTEGER DEFAULT 0, -- Upvotes - downvotes
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,

  -- Flags
  deleted BOOLEAN DEFAULT FALSE,
  edited BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  metadata JSONB -- Extra data (edit history, awards, etc.)
);

-- Indexes
CREATE INDEX idx_forum_posts_thread ON forum_posts(thread_id);
CREATE INDEX idx_forum_posts_parent ON forum_posts(parent_id);
CREATE INDEX idx_forum_posts_author ON forum_posts(author_id);
CREATE INDEX idx_forum_posts_score ON forum_posts(score DESC);
CREATE INDEX idx_forum_posts_created ON forum_posts(created_at DESC);

-- ============================================================================
-- FORUM VOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS forum_votes (
  id SERIAL PRIMARY KEY,

  -- Vote target (thread or post)
  thread_id INTEGER REFERENCES forum_threads(id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES forum_posts(id) ON DELETE CASCADE,

  -- Voter
  user_id VARCHAR(255) NOT NULL,

  -- Vote direction
  vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up', 'down')),

  -- Timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT vote_target_check CHECK (
    (thread_id IS NOT NULL AND post_id IS NULL) OR
    (thread_id IS NULL AND post_id IS NOT NULL)
  ),
  UNIQUE(user_id, thread_id),
  UNIQUE(user_id, post_id)
);

-- Indexes
CREATE INDEX idx_forum_votes_thread ON forum_votes(thread_id);
CREATE INDEX idx_forum_votes_post ON forum_votes(post_id);
CREATE INDEX idx_forum_votes_user ON forum_votes(user_id);

-- ============================================================================
-- USER KARMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS forum_karma (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,

  -- Karma scores
  post_karma INTEGER DEFAULT 0, -- Karma from threads
  comment_karma INTEGER DEFAULT 0, -- Karma from comments
  total_karma INTEGER DEFAULT 0, -- Total karma

  -- Activity stats
  threads_created INTEGER DEFAULT 0,
  comments_created INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_forum_karma_user ON forum_karma(user_id);
CREATE INDEX idx_forum_karma_total ON forum_karma(total_karma DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp for threads
CREATE OR REPLACE FUNCTION update_forum_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_forum_threads_timestamp
  BEFORE UPDATE ON forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_forum_thread_timestamp();

-- Auto-update updated_at timestamp for posts
CREATE OR REPLACE FUNCTION update_forum_post_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  NEW.edited = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_forum_posts_timestamp
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW
  WHEN (OLD.body IS DISTINCT FROM NEW.body)
  EXECUTE FUNCTION update_forum_post_timestamp();

-- Update thread comment count when post is created/deleted
CREATE OR REPLACE FUNCTION update_thread_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads
    SET comment_count = comment_count + 1,
        last_activity_at = CURRENT_TIMESTAMP
    WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_threads
    SET comment_count = comment_count - 1
    WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER thread_comment_count_trigger
  AFTER INSERT OR DELETE ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_comment_count();

-- Update thread score when vote is created/updated/deleted
CREATE OR REPLACE FUNCTION update_thread_score()
RETURNS TRIGGER AS $$
DECLARE
  thread_upvotes INTEGER;
  thread_downvotes INTEGER;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.thread_id IS NOT NULL THEN
      SELECT
        COUNT(*) FILTER (WHERE vote_type = 'up'),
        COUNT(*) FILTER (WHERE vote_type = 'down')
      INTO thread_upvotes, thread_downvotes
      FROM forum_votes
      WHERE thread_id = NEW.thread_id;

      UPDATE forum_threads
      SET upvotes = thread_upvotes,
          downvotes = thread_downvotes,
          score = thread_upvotes - thread_downvotes
      WHERE id = NEW.thread_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.thread_id IS NOT NULL THEN
      SELECT
        COUNT(*) FILTER (WHERE vote_type = 'up'),
        COUNT(*) FILTER (WHERE vote_type = 'down')
      INTO thread_upvotes, thread_downvotes
      FROM forum_votes
      WHERE thread_id = OLD.thread_id;

      UPDATE forum_threads
      SET upvotes = thread_upvotes,
          downvotes = thread_downvotes,
          score = thread_upvotes - thread_downvotes
      WHERE id = OLD.thread_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER thread_score_trigger
  AFTER INSERT OR UPDATE OR DELETE ON forum_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_score();

-- Update post score when vote is created/updated/deleted
CREATE OR REPLACE FUNCTION update_post_score()
RETURNS TRIGGER AS $$
DECLARE
  post_upvotes INTEGER;
  post_downvotes INTEGER;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.post_id IS NOT NULL THEN
      SELECT
        COUNT(*) FILTER (WHERE vote_type = 'up'),
        COUNT(*) FILTER (WHERE vote_type = 'down')
      INTO post_upvotes, post_downvotes
      FROM forum_votes
      WHERE post_id = NEW.post_id;

      UPDATE forum_posts
      SET upvotes = post_upvotes,
          downvotes = post_downvotes,
          score = post_upvotes - post_downvotes
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      SELECT
        COUNT(*) FILTER (WHERE vote_type = 'up'),
        COUNT(*) FILTER (WHERE vote_type = 'down')
      INTO post_upvotes, post_downvotes
      FROM forum_votes
      WHERE post_id = OLD.post_id;

      UPDATE forum_posts
      SET upvotes = post_upvotes,
          downvotes = post_downvotes,
          score = post_upvotes - post_downvotes
      WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_score_trigger
  AFTER INSERT OR UPDATE OR DELETE ON forum_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_score();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get hot threads (Reddit-style hot algorithm)
CREATE OR REPLACE FUNCTION get_hot_threads(p_limit INTEGER DEFAULT 25)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  url TEXT,
  author_name VARCHAR,
  score INTEGER,
  comment_count INTEGER,
  created_at TIMESTAMP,
  hotness FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.url,
    t.author_name,
    t.score,
    t.comment_count,
    t.created_at,
    -- Hot ranking algorithm (simplified Reddit hot)
    (t.score::FLOAT / POWER(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.created_at)) / 3600 + 2, 1.5)) AS hotness
  FROM forum_threads t
  WHERE NOT t.archived
  ORDER BY hotness DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get thread with nested comments
CREATE OR REPLACE FUNCTION get_thread_with_comments(p_thread_id INTEGER)
RETURNS TABLE (
  post_id INTEGER,
  parent_id INTEGER,
  depth INTEGER,
  author_name VARCHAR,
  body TEXT,
  score INTEGER,
  created_at TIMESTAMP,
  edited BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE comment_tree AS (
    -- Base case: top-level comments
    SELECT
      p.id,
      p.parent_id,
      p.depth,
      p.author_name,
      p.body,
      p.score,
      p.created_at,
      p.edited,
      ARRAY[p.id] AS path
    FROM forum_posts p
    WHERE p.thread_id = p_thread_id AND p.parent_id IS NULL AND NOT p.deleted

    UNION ALL

    -- Recursive case: child comments
    SELECT
      p.id,
      p.parent_id,
      p.depth,
      p.author_name,
      p.body,
      p.score,
      p.created_at,
      p.edited,
      ct.path || p.id
    FROM forum_posts p
    INNER JOIN comment_tree ct ON p.parent_id = ct.id
    WHERE p.thread_id = p_thread_id AND NOT p.deleted
  )
  SELECT
    ct.id,
    ct.parent_id,
    ct.depth,
    ct.author_name,
    ct.body,
    ct.score,
    ct.created_at,
    ct.edited
  FROM comment_tree ct
  ORDER BY ct.path;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE forum_threads IS 'Discussion threads for curated content';
COMMENT ON TABLE forum_posts IS 'Comments/replies in discussion threads (nested)';
COMMENT ON TABLE forum_votes IS 'Upvotes/downvotes for threads and posts';
COMMENT ON TABLE forum_karma IS 'User karma scores and activity stats';

COMMENT ON FUNCTION get_hot_threads IS 'Get trending threads using hot algorithm';
COMMENT ON FUNCTION get_thread_with_comments IS 'Get thread with nested comment tree';
