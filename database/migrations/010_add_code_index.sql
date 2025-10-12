-- Code Index System
-- For indexing user's GitHub repos, cookbook, and automation scripts
-- Enables calos-expert to query REAL CODE instead of giving canned responses

-- ============================================================================
-- CODE REPOSITORY INDEX
-- ============================================================================

-- User's code repositories (GitHub, local cookbook, etc.)
CREATE TABLE IF NOT EXISTS code_repositories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL,              -- 'github', 'local', 'cookbook'
  repo_url TEXT,                            -- GitHub URL or local path
  local_path TEXT,                          -- Local filesystem path
  language VARCHAR(50),                     -- Primary language
  description TEXT,
  last_indexed TIMESTAMP,
  file_count INTEGER DEFAULT 0,
  snippet_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_code_repos_source ON code_repositories(source);
CREATE INDEX idx_code_repos_active ON code_repositories(is_active);

-- ============================================================================
-- CODE SNIPPETS (Actual code from user's repos)
-- ============================================================================

-- Individual code files and functions
CREATE TABLE IF NOT EXISTS code_snippets (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES code_repositories(id) ON DELETE CASCADE,

  -- File info
  file_path TEXT NOT NULL,                  -- Relative path in repo
  filename VARCHAR(255) NOT NULL,
  language VARCHAR(50) NOT NULL,            -- 'python', 'lua', 'javascript', 'bash'

  -- Code content
  code TEXT NOT NULL,                       -- Full code
  function_name VARCHAR(255),               -- Function/class name (if applicable)
  snippet_type VARCHAR(50),                 -- 'function', 'class', 'script', 'config'

  -- Documentation
  docstring TEXT,                           -- Extracted docstring/comments
  description TEXT,                         -- AI-generated description
  tags TEXT[],                              -- ['automation', 'api', 'webhook']

  -- Usage metadata
  dependencies TEXT[],                      -- Required libraries
  example_usage TEXT,                       -- Example of how to use this code

  -- Line info for linking back to source
  start_line INTEGER,
  end_line INTEGER,

  -- Search optimization
  search_vector tsvector,                   -- Full-text search

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(repo_id, file_path, function_name)
);

CREATE INDEX idx_code_snippets_repo ON code_snippets(repo_id);
CREATE INDEX idx_code_snippets_language ON code_snippets(language);
CREATE INDEX idx_code_snippets_type ON code_snippets(snippet_type);
CREATE INDEX idx_code_snippets_filename ON code_snippets(filename);
CREATE INDEX idx_code_snippets_tags ON code_snippets USING GIN(tags);

-- Full-text search index
CREATE INDEX idx_code_snippets_search ON code_snippets USING GIN(search_vector);

-- Update search_vector automatically
CREATE OR REPLACE FUNCTION update_code_snippet_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.filename, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.function_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.docstring, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.code, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_code_snippet_search
  BEFORE INSERT OR UPDATE ON code_snippets
  FOR EACH ROW EXECUTE FUNCTION update_code_snippet_search_vector();

-- ============================================================================
-- SEMANTIC CODE SEARCH (Vector Embeddings)
-- ============================================================================

-- Code embeddings for semantic similarity search
CREATE TABLE IF NOT EXISTS code_embeddings (
  id SERIAL PRIMARY KEY,
  snippet_id INTEGER NOT NULL REFERENCES code_snippets(id) ON DELETE CASCADE,
  embedding vector(1536),                   -- OpenAI text-embedding-ada-002
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  embedding_source VARCHAR(50) DEFAULT 'combined',  -- 'code', 'description', 'combined'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snippet_id, embedding_source)
);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS idx_code_embeddings_vector ON code_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_code_embeddings_snippet ON code_embeddings(snippet_id);

-- ============================================================================
-- CODE USAGE TRACKING
-- ============================================================================

-- Track when code snippets are used in AI responses
CREATE TABLE IF NOT EXISTS code_usage (
  id SERIAL PRIMARY KEY,
  snippet_id INTEGER REFERENCES code_snippets(id) ON DELETE CASCADE,
  used_in_response INTEGER REFERENCES ai_responses(id) ON DELETE CASCADE,
  query TEXT,                               -- User's original query
  context VARCHAR(100),                     -- 'answer', 'tutorial', 'example'
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_code_usage_snippet ON code_usage(snippet_id, timestamp DESC);
CREATE INDEX idx_code_usage_response ON code_usage(used_in_response);

-- ============================================================================
-- CONTENT GENERATION (For subscriber publishing)
-- ============================================================================

-- Generated content (tutorials, blog posts, documentation)
CREATE TABLE IF NOT EXISTS published_content (
  id SERIAL PRIMARY KEY,

  -- Content metadata
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,        -- URL-friendly slug
  content_type VARCHAR(50) NOT NULL,        -- 'tutorial', 'blog', 'docs', 'video_script'

  -- Content
  markdown_content TEXT NOT NULL,           -- Markdown source
  html_content TEXT,                        -- Rendered HTML
  excerpt TEXT,                             -- Short description

  -- Code sources
  code_snippets INTEGER[],                  -- Array of snippet IDs used
  source_repos INTEGER[],                   -- Array of repo IDs referenced

  -- Organization
  tags TEXT[],
  category VARCHAR(100),
  language VARCHAR(50),                     -- Programming language focus

  -- SEO & sharing
  featured_image TEXT,
  og_image TEXT,
  meta_description TEXT,

  -- Publishing
  status VARCHAR(50) DEFAULT 'draft',       -- 'draft', 'published', 'archived'
  published_at TIMESTAMP,
  author VARCHAR(255),
  view_count INTEGER DEFAULT 0,

  -- RSS
  guid VARCHAR(255) UNIQUE,                 -- For RSS feed

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_published_content_status ON published_content(status, published_at DESC);
CREATE INDEX idx_published_content_slug ON published_content(slug);
CREATE INDEX idx_published_content_tags ON published_content USING GIN(tags);
CREATE INDEX idx_published_content_category ON published_content(category);

-- ============================================================================
-- SUBSCRIBER SYSTEM
-- ============================================================================

-- Email/RSS subscribers
CREATE TABLE IF NOT EXISTS content_subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),

  -- Subscription preferences
  subscribed_to VARCHAR(50)[] DEFAULT ARRAY['all'],  -- ['all', 'tutorials', 'python', 'lua']
  notification_method VARCHAR(50)[] DEFAULT ARRAY['email'],  -- ['email', 'rss']

  -- Status
  verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  unsubscribed BOOLEAN DEFAULT false,

  -- Metadata
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscribers_email ON content_subscribers(email);
CREATE INDEX idx_subscribers_verified ON content_subscribers(verified, unsubscribed);

-- Content notification queue
CREATE TABLE IF NOT EXISTS content_notifications (
  id SERIAL PRIMARY KEY,
  content_id INTEGER REFERENCES published_content(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES content_subscribers(id) ON DELETE CASCADE,

  -- Delivery
  method VARCHAR(50) NOT NULL,              -- 'email', 'webhook', 'push'
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMP,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_status ON content_notifications(status, created_at DESC);
CREATE INDEX idx_notifications_subscriber ON content_notifications(subscriber_id);

-- ============================================================================
-- CONTENT GENERATION QUEUE
-- ============================================================================

-- Queue for AI-generated content creation
CREATE TABLE IF NOT EXISTS content_generation_queue (
  id SERIAL PRIMARY KEY,

  -- Request
  topic TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,        -- 'tutorial', 'blog', 'docs'
  target_language VARCHAR(50),              -- Programming language focus
  target_repos INTEGER[],                   -- Specific repos to pull from

  -- Generation
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'generating', 'complete', 'failed'
  progress INTEGER DEFAULT 0,               -- 0-100
  result_content_id INTEGER REFERENCES published_content(id),

  -- Context
  user_prompt TEXT,                         -- Original user request
  generation_params JSONB,                  -- AI parameters used

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_queue_status ON content_generation_queue(status, created_at DESC);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Most used code snippets
CREATE OR REPLACE VIEW popular_code_snippets AS
SELECT
  cs.id,
  cs.filename,
  cs.function_name,
  cs.language,
  cs.description,
  COUNT(cu.id) as usage_count,
  MAX(cu.timestamp) as last_used
FROM code_snippets cs
LEFT JOIN code_usage cu ON cu.snippet_id = cs.id
GROUP BY cs.id, cs.filename, cs.function_name, cs.language, cs.description
ORDER BY usage_count DESC
LIMIT 100;

-- Repository statistics
CREATE OR REPLACE VIEW repo_stats AS
SELECT
  cr.id,
  cr.name,
  cr.source,
  cr.language,
  COUNT(DISTINCT cs.id) as total_snippets,
  COUNT(DISTINCT cu.id) as total_uses,
  MAX(cr.last_indexed) as last_indexed
FROM code_repositories cr
LEFT JOIN code_snippets cs ON cs.repo_id = cr.id
LEFT JOIN code_usage cu ON cu.snippet_id = cs.id
WHERE cr.is_active = true
GROUP BY cr.id, cr.name, cr.source, cr.language;

-- Published content feed
CREATE OR REPLACE VIEW content_feed AS
SELECT
  pc.id,
  pc.title,
  pc.slug,
  pc.content_type,
  pc.excerpt,
  pc.tags,
  pc.published_at,
  pc.view_count,
  array_length(pc.code_snippets, 1) as code_snippet_count
FROM published_content pc
WHERE pc.status = 'published'
ORDER BY pc.published_at DESC
LIMIT 50;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update repo file counts
CREATE OR REPLACE FUNCTION update_repo_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE code_repositories
  SET
    snippet_count = (
      SELECT COUNT(*) FROM code_snippets WHERE repo_id = NEW.repo_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.repo_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_repo_counts
  AFTER INSERT ON code_snippets
  FOR EACH ROW EXECUTE FUNCTION update_repo_counts();

-- Auto-update updated_at timestamps
CREATE TRIGGER update_code_repos_updated_at BEFORE UPDATE ON code_repositories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_snippets_updated_at BEFORE UPDATE ON code_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_published_content_updated_at BEFORE UPDATE ON published_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscribers_updated_at BEFORE UPDATE ON content_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
