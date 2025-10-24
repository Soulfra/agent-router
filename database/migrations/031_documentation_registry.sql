-- Documentation Registry System
-- Enables version-aware documentation fetching and caching
-- Supports npm, GitHub, CDN, and archive.org sources

-- Documentation cache (stores fetched documentation for each package version)
CREATE TABLE IF NOT EXISTS documentation_cache (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Package identity
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  package_type TEXT DEFAULT 'npm', -- 'npm', 'github', 'pypi', 'cargo', 'maven'

  -- Source information
  source TEXT NOT NULL, -- 'npm', 'github', 'cdn', 'archive', 'manual'
  source_url TEXT,

  -- Documentation content
  readme TEXT,
  documentation JSONB DEFAULT '{}'::jsonb, -- Full API docs in structured format
  types TEXT, -- TypeScript definitions (.d.ts)
  changelog TEXT, -- CHANGELOG or release notes
  examples JSONB DEFAULT '[]'::jsonb, -- Code examples

  -- Metadata
  description TEXT,
  author TEXT,
  license TEXT,
  homepage TEXT,
  repository TEXT,
  keywords TEXT[],

  -- Dependencies (for dependency graph)
  dependencies JSONB DEFAULT '{}'::jsonb,
  dev_dependencies JSONB DEFAULT '{}'::jsonb,
  peer_dependencies JSONB DEFAULT '{}'::jsonb,

  -- Versioning
  is_latest BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  deprecated_message TEXT,
  replacement_package TEXT, -- Recommended replacement if deprecated

  -- Cache control
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  cache_ttl INTEGER DEFAULT 604800, -- 7 days in seconds

  -- Integrity
  content_hash TEXT, -- SHA256 of documentation content
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,

  UNIQUE(package_name, version, package_type)
);

CREATE INDEX idx_doc_cache_package ON documentation_cache(package_name);
CREATE INDEX idx_doc_cache_version ON documentation_cache(package_name, version);
CREATE INDEX idx_doc_cache_latest ON documentation_cache(package_name) WHERE is_latest = true;
CREATE INDEX idx_doc_cache_source ON documentation_cache(source);
CREATE INDEX idx_doc_cache_fetched ON documentation_cache(fetched_at DESC);
CREATE INDEX idx_doc_cache_accessed ON documentation_cache(last_accessed_at DESC);

-- Documentation fetch queue (async fetching)
CREATE TABLE IF NOT EXISTS documentation_fetch_queue (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What to fetch
  package_name TEXT NOT NULL,
  version TEXT, -- NULL = fetch latest
  package_type TEXT DEFAULT 'npm',
  source TEXT NOT NULL, -- 'npm', 'github', 'cdn'

  -- Priority
  priority INTEGER DEFAULT 0, -- Higher = more important
  requested_by UUID, -- user_id who requested

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Error handling
  error_message TEXT,
  last_attempt_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Prevent duplicates
  UNIQUE(package_name, version, package_type, source)
);

CREATE INDEX idx_doc_queue_status ON documentation_fetch_queue(status, priority DESC);
CREATE INDEX idx_doc_queue_pending ON documentation_fetch_queue(created_at) WHERE status = 'pending';

-- Documentation search index (full-text search)
CREATE TABLE IF NOT EXISTS documentation_search_index (
  search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  doc_id UUID REFERENCES documentation_cache(doc_id) ON DELETE CASCADE,

  -- Searchable content
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  search_vector tsvector,

  -- Metadata for search results
  title TEXT,
  summary TEXT,
  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_search_vector ON documentation_search_index USING gin(search_vector);
CREATE INDEX idx_doc_search_package ON documentation_search_index(package_name);

-- Documentation usage analytics
CREATE TABLE IF NOT EXISTS documentation_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  doc_id UUID REFERENCES documentation_cache(doc_id) ON DELETE SET NULL,

  -- What was accessed
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  section TEXT, -- Specific section/API accessed (e.g., 'stripe.checkout.create')

  -- Who accessed it
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  session_id UUID,

  -- Context
  query TEXT, -- Search query that led to this doc
  use_case TEXT, -- What they were trying to do

  -- Feedback
  was_helpful BOOLEAN,
  feedback TEXT,

  -- Metadata
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_usage_package ON documentation_usage(package_name, accessed_at DESC);
CREATE INDEX idx_doc_usage_user ON documentation_usage(user_id, accessed_at DESC);
CREATE INDEX idx_doc_usage_helpful ON documentation_usage(package_name) WHERE was_helpful = true;

-- Package version timeline (tracks all versions ever published)
CREATE TABLE IF NOT EXISTS package_version_timeline (
  timeline_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  package_name TEXT NOT NULL,
  package_type TEXT DEFAULT 'npm',

  -- Version info
  version TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  is_prerelease BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,

  -- Changes
  changelog_entry TEXT,
  breaking_changes TEXT[],
  new_features TEXT[],
  bug_fixes TEXT[],

  -- Links
  release_notes_url TEXT,
  commit_hash TEXT,
  tag_name TEXT,

  -- Stats
  downloads_total BIGINT DEFAULT 0,
  downloads_last_week BIGINT DEFAULT 0,

  -- Metadata
  indexed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(package_name, version, package_type)
);

CREATE INDEX idx_version_timeline_package ON package_version_timeline(package_name, published_at DESC);
CREATE INDEX idx_version_timeline_latest ON package_version_timeline(package_name, published_at DESC, is_prerelease);

-- Documentation API endpoints (tracks external API documentation)
CREATE TABLE IF NOT EXISTS documentation_api_endpoints (
  endpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  doc_id UUID REFERENCES documentation_cache(doc_id) ON DELETE CASCADE,

  -- API endpoint details
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  method TEXT NOT NULL, -- 'GET', 'POST', 'PUT', 'DELETE', etc.
  path TEXT NOT NULL, -- '/api/checkout/sessions'

  -- Documentation
  description TEXT,
  parameters JSONB DEFAULT '[]'::jsonb, -- Array of parameter definitions
  request_body JSONB, -- Request schema
  response_schema JSONB, -- Response schema
  examples JSONB DEFAULT '[]'::jsonb, -- Code examples

  -- Metadata
  is_deprecated BOOLEAN DEFAULT false,
  deprecated_since TEXT, -- Version when deprecated
  replacement_endpoint TEXT,

  -- Authentication
  requires_auth BOOLEAN DEFAULT true,
  auth_types TEXT[], -- ['api_key', 'oauth', 'jwt']

  -- Rate limiting
  rate_limit TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(package_name, version, method, path)
);

CREATE INDEX idx_api_endpoints_package ON documentation_api_endpoints(package_name, version);
CREATE INDEX idx_api_endpoints_method ON documentation_api_endpoints(method, path);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Latest version of each package
CREATE OR REPLACE VIEW latest_package_versions AS
SELECT DISTINCT ON (package_name, package_type)
  package_name,
  package_type,
  version,
  description,
  fetched_at,
  is_deprecated,
  homepage,
  repository
FROM documentation_cache
ORDER BY package_name, package_type, fetched_at DESC;

-- Popular packages (most accessed)
CREATE OR REPLACE VIEW popular_packages AS
SELECT
  package_name,
  version,
  COUNT(*) as access_count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(CASE WHEN was_helpful = true THEN 1 ELSE 0 END) as helpfulness_score,
  MAX(accessed_at) as last_accessed
FROM documentation_usage
WHERE accessed_at >= NOW() - INTERVAL '30 days'
GROUP BY package_name, version
ORDER BY access_count DESC
LIMIT 100;

-- Deprecated packages needing attention
CREATE OR REPLACE VIEW deprecated_packages_in_use AS
SELECT
  dc.package_name,
  dc.version,
  dc.deprecated_message,
  dc.replacement_package,
  COUNT(DISTINCT du.user_id) as active_users,
  MAX(du.accessed_at) as last_used
FROM documentation_cache dc
JOIN documentation_usage du ON du.doc_id = dc.doc_id
WHERE dc.is_deprecated = true
  AND du.accessed_at >= NOW() - INTERVAL '7 days'
GROUP BY dc.package_name, dc.version, dc.deprecated_message, dc.replacement_package
ORDER BY active_users DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get documentation for a specific package version
CREATE OR REPLACE FUNCTION get_documentation(
  p_package_name TEXT,
  p_version TEXT DEFAULT NULL, -- NULL = get latest
  p_package_type TEXT DEFAULT 'npm'
)
RETURNS TABLE (
  doc_id UUID,
  package_name TEXT,
  version TEXT,
  readme TEXT,
  documentation JSONB,
  types TEXT,
  is_cached BOOLEAN,
  fetched_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Try to get from cache
  RETURN QUERY
  SELECT
    dc.doc_id,
    dc.package_name,
    dc.version,
    dc.readme,
    dc.documentation,
    dc.types,
    true as is_cached,
    dc.fetched_at
  FROM documentation_cache dc
  WHERE dc.package_name = p_package_name
    AND dc.package_type = p_package_type
    AND (p_version IS NULL AND dc.is_latest = true OR dc.version = p_version)
  LIMIT 1;

  -- If not found and version not specified, return NULL
  -- Caller should queue a fetch request
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Update access statistics
  UPDATE documentation_cache
  SET last_accessed_at = NOW(),
      access_count = access_count + 1
  WHERE documentation_cache.package_name = p_package_name
    AND documentation_cache.package_type = p_package_type
    AND (p_version IS NULL AND documentation_cache.is_latest = true OR documentation_cache.version = p_version);
END;
$$ LANGUAGE plpgsql;

-- Queue documentation fetch
CREATE OR REPLACE FUNCTION queue_documentation_fetch(
  p_package_name TEXT,
  p_version TEXT,
  p_package_type TEXT DEFAULT 'npm',
  p_source TEXT DEFAULT 'npm',
  p_priority INTEGER DEFAULT 0,
  p_requested_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  -- Insert into queue (ON CONFLICT updates priority if higher)
  INSERT INTO documentation_fetch_queue (
    package_name,
    version,
    package_type,
    source,
    priority,
    requested_by
  )
  VALUES (
    p_package_name,
    p_version,
    p_package_type,
    p_source,
    p_priority,
    p_requested_by
  )
  ON CONFLICT (package_name, version, package_type, source)
  DO UPDATE SET
    priority = GREATEST(documentation_fetch_queue.priority, EXCLUDED.priority),
    status = CASE
      WHEN documentation_fetch_queue.status = 'failed' THEN 'pending'
      ELSE documentation_fetch_queue.status
    END
  RETURNING queue_id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql;

-- Search documentation
CREATE OR REPLACE FUNCTION search_documentation(
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  package_name TEXT,
  version TEXT,
  title TEXT,
  summary TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dsi.package_name,
    dsi.version,
    dsi.title,
    dsi.summary,
    ts_rank(dsi.search_vector, websearch_to_tsquery('english', p_query)) as relevance
  FROM documentation_search_index dsi
  WHERE dsi.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY relevance DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Update search index for a documentation entry
CREATE OR REPLACE FUNCTION update_documentation_search_index(
  p_doc_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_package_name TEXT;
  v_version TEXT;
  v_readme TEXT;
  v_description TEXT;
  v_keywords TEXT[];
  v_search_content TEXT;
  v_search_vector tsvector;
BEGIN
  -- Get documentation content
  SELECT
    package_name,
    version,
    readme,
    description,
    keywords
  INTO
    v_package_name,
    v_version,
    v_readme,
    v_description,
    v_keywords
  FROM documentation_cache
  WHERE doc_id = p_doc_id;

  -- Build search content
  v_search_content := COALESCE(v_package_name, '') || ' ' ||
                      COALESCE(v_description, '') || ' ' ||
                      COALESCE(v_readme, '') || ' ' ||
                      COALESCE(array_to_string(v_keywords, ' '), '');

  -- Create search vector
  v_search_vector := to_tsvector('english', v_search_content);

  -- Insert or update search index
  INSERT INTO documentation_search_index (
    doc_id,
    package_name,
    version,
    search_vector,
    title,
    summary,
    tags
  )
  VALUES (
    p_doc_id,
    v_package_name,
    v_version,
    v_search_vector,
    v_package_name || ' ' || v_version,
    LEFT(v_description, 200),
    v_keywords
  )
  ON CONFLICT (doc_id) DO UPDATE SET
    search_vector = EXCLUDED.search_vector,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    tags = EXCLUDED.tags,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Automatically update search index when documentation is added/updated
CREATE OR REPLACE FUNCTION trigger_update_search_index()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_documentation_search_index(NEW.doc_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_search_index_on_doc_insert
AFTER INSERT OR UPDATE ON documentation_cache
FOR EACH ROW
EXECUTE FUNCTION trigger_update_search_index();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert commonly used packages to pre-populate cache
-- These will be fetched on first startup
INSERT INTO documentation_fetch_queue (package_name, version, package_type, source, priority) VALUES
  ('stripe', 'latest', 'npm', 'npm', 100),
  ('twilio', 'latest', 'npm', 'npm', 100),
  ('express', 'latest', 'npm', 'npm', 90),
  ('react', 'latest', 'npm', 'npm', 90),
  ('vue', 'latest', 'npm', 'npm', 90),
  ('axios', 'latest', 'npm', 'npm', 80),
  ('lodash', 'latest', 'npm', 'npm', 80),
  ('moment', 'latest', 'npm', 'npm', 70),
  ('@anthropic-ai/sdk', 'latest', 'npm', 'npm', 100),
  ('openai', 'latest', 'npm', 'npm', 100)
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust based on your database setup)
-- GRANT ALL ON documentation_cache TO your_app_user;
-- GRANT ALL ON documentation_fetch_queue TO your_app_user;
-- GRANT ALL ON documentation_search_index TO your_app_user;
-- GRANT ALL ON documentation_usage TO your_app_user;
-- GRANT ALL ON package_version_timeline TO your_app_user;
-- GRANT ALL ON documentation_api_endpoints TO your_app_user;
