-- Migration 057: Author Workflow System
-- Enables writing, testing, and publishing executable documentation

-- Articles table (author content)
CREATE TABLE IF NOT EXISTS author_articles (
  article_id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- 'tutorial', 'guide', 'reference', 'blog'
  tags TEXT[] DEFAULT '{}',
  content TEXT NOT NULL, -- Markdown with executable code blocks
  author_id INTEGER NOT NULL REFERENCES users(user_id),
  status TEXT DEFAULT 'draft', -- 'draft', 'published', 'archived'

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP NULL,

  -- Analytics
  view_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  reading_time_minutes INTEGER DEFAULT 0,

  -- Code testing
  has_code BOOLEAN DEFAULT false,
  code_tested BOOLEAN DEFAULT false,
  last_tested_at TIMESTAMP NULL,
  test_results JSONB NULL, -- Store test execution results

  -- CalRiven Soulfra cryptographic signatures
  soulfra_hash JSONB NULL, -- SHA256/512/3-512, Blake3, Ed25519 signature
  signed_metadata JSONB NULL, -- Metadata from signing (timestamp, author, etc.)
  publication_signature JSONB NULL -- Final signature when published
);

-- Article revisions (version history)
CREATE TABLE IF NOT EXISTS author_article_revisions (
  revision_id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES author_articles(article_id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES users(user_id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_summary TEXT NULL,

  UNIQUE(article_id, revision_number)
);

-- Article collaborators (multi-author support)
CREATE TABLE IF NOT EXISTS author_collaborators (
  article_id INTEGER NOT NULL REFERENCES author_articles(article_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  role TEXT DEFAULT 'contributor', -- 'owner', 'editor', 'contributor', 'reviewer'
  added_at TIMESTAMP DEFAULT NOW(),
  added_by INTEGER NOT NULL REFERENCES users(user_id),

  PRIMARY KEY (article_id, user_id)
);

-- Article series (group related articles)
CREATE TABLE IF NOT EXISTS author_series (
  series_id SERIAL PRIMARY KEY,
  series_name TEXT NOT NULL,
  series_slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  created_by INTEGER NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  article_order INTEGER[] DEFAULT '{}' -- Ordered list of article_ids
);

-- Draft autosaves (crash recovery)
CREATE TABLE IF NOT EXISTS author_autosaves (
  autosave_id SERIAL PRIMARY KEY,
  article_id INTEGER NULL REFERENCES author_articles(article_id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(user_id),
  content TEXT NOT NULL,
  saved_at TIMESTAMP DEFAULT NOW(),

  -- Auto-cleanup old autosaves
  CONSTRAINT cleanup_after_24h CHECK (saved_at > NOW() - INTERVAL '24 hours')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_articles_author ON author_articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON author_articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published ON author_articles(published_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_articles_category ON author_articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON author_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON author_articles(slug);

CREATE INDEX IF NOT EXISTS idx_revisions_article ON author_article_revisions(article_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON author_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_autosaves_author ON author_autosaves(author_id);

-- Triggers

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_article_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_updated
  BEFORE UPDATE ON author_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_article_timestamp();

-- Auto-create revision on significant changes
CREATE OR REPLACE FUNCTION create_article_revision()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create revision if content or title changed
  IF (OLD.content != NEW.content OR OLD.title != NEW.title) THEN
    INSERT INTO author_article_revisions (
      article_id, revision_number, title, content, changed_by
    )
    SELECT
      NEW.article_id,
      COALESCE(MAX(revision_number), 0) + 1,
      NEW.title,
      NEW.content,
      NEW.author_id
    FROM author_article_revisions
    WHERE article_id = NEW.article_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_revision
  AFTER UPDATE ON author_articles
  FOR EACH ROW
  EXECUTE FUNCTION create_article_revision();

-- Auto-cleanup old autosaves (keep last 10 per user)
CREATE OR REPLACE FUNCTION cleanup_old_autosaves()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM author_autosaves
  WHERE autosave_id IN (
    SELECT autosave_id
    FROM author_autosaves
    WHERE author_id = NEW.author_id
    ORDER BY saved_at DESC
    OFFSET 10
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER autosave_cleanup
  AFTER INSERT ON author_autosaves
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_autosaves();

-- Views

-- Published articles with full metadata
CREATE OR REPLACE VIEW published_articles AS
SELECT
  a.article_id,
  a.title,
  a.slug,
  a.category,
  a.tags,
  a.content,
  a.author_id,
  u.username as author_name,
  a.published_at,
  a.view_count,
  a.word_count,
  a.reading_time_minutes,
  a.has_code,
  a.code_tested,
  -- Count discussions
  COALESCE(
    (SELECT COUNT(*)
     FROM forum_threads ft
     JOIN curated_content cc ON cc.content_id = ft.content_id
     WHERE cc.external_id = 'author-' || a.article_id::TEXT),
    0
  ) as discussion_count,
  -- Count comments
  COALESCE(
    (SELECT SUM(ft.comment_count)
     FROM forum_threads ft
     JOIN curated_content cc ON cc.content_id = ft.content_id
     WHERE cc.external_id = 'author-' || a.article_id::TEXT),
    0
  ) as comment_count
FROM author_articles a
JOIN users u ON u.user_id = a.author_id
WHERE a.status = 'published'
ORDER BY a.published_at DESC;

-- Author statistics
CREATE OR REPLACE VIEW author_stats AS
SELECT
  u.user_id,
  u.username,
  COUNT(DISTINCT a.article_id) as total_articles,
  COUNT(DISTINCT CASE WHEN a.status = 'published' THEN a.article_id END) as published_articles,
  COUNT(DISTINCT CASE WHEN a.status = 'draft' THEN a.article_id END) as draft_articles,
  SUM(CASE WHEN a.status = 'published' THEN a.view_count ELSE 0 END) as total_views,
  SUM(CASE WHEN a.status = 'published' THEN a.word_count ELSE 0 END) as total_words,
  MAX(a.published_at) as last_published_at
FROM users u
LEFT JOIN author_articles a ON a.author_id = u.user_id
GROUP BY u.user_id, u.username;

-- Sample data for testing
INSERT INTO author_articles (
  title, slug, category, tags, content, author_id, status, has_code
) VALUES (
  'Getting Started with CALOS Author',
  'getting-started-calos-author',
  'tutorial',
  ARRAY['calos', 'tutorial', 'documentation'],
  '# Getting Started with CALOS Author

Write executable documentation that tests itself!

## Example

```javascript
console.log("Hello, CALOS!");
```

This code block will be executed when you run tests.',
  1,
  'draft',
  true
) ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE author_articles IS 'Author content management - executable documentation and articles';
COMMENT ON TABLE author_article_revisions IS 'Version history for articles';
COMMENT ON TABLE author_collaborators IS 'Multi-author collaboration support';
COMMENT ON TABLE author_series IS 'Grouped article series';
COMMENT ON TABLE author_autosaves IS 'Auto-saved drafts for crash recovery';
