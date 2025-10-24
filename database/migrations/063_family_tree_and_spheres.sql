/**
 * Migration 063: Family Tree & Multi-Dimensional Spheres
 *
 * Extends relationship graph (Migration 062) to support:
 * - Family tree visualization (Ancestry.com style)
 * - Multi-dimensional sphere grouping (Snapchat college stories model)
 * - Flexible OR/AND matching logic
 * - Data brokering platform infrastructure
 *
 * Inverts exclusion logic: relationships become connection suggestions
 */

-- ============================================================
-- Family Tree Table (Parent-Child Hierarchy)
-- ============================================================
CREATE TABLE IF NOT EXISTS family_tree (
  tree_id SERIAL PRIMARY KEY,
  parent_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  child_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  relationship_label VARCHAR(50) NOT NULL, -- 'parent', 'mother', 'father', 'child', 'son', 'daughter'
  generation_diff INTEGER DEFAULT 1, -- 1 = parent→child, -1 = child→parent, 2 = grandparent→grandchild
  confidence_score DECIMAL(3, 2) DEFAULT 1.0, -- 0.0-1.0 confidence in relationship
  verification_source VARCHAR(50), -- 'manual', 'dna', 'facebook', 'birth_records', 'surname_heuristic'
  verification_date TIMESTAMP,
  metadata JSONB, -- Additional context (birth dates, DNA match percentage, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate parent-child relationships
  UNIQUE(parent_user_id, child_user_id),

  -- Prevent self-parenting
  CHECK (parent_user_id != child_user_id)
);

-- Index for finding children
CREATE INDEX idx_family_tree_parent ON family_tree(parent_user_id);

-- Index for finding parents
CREATE INDEX idx_family_tree_child ON family_tree(child_user_id);

-- Index for generation traversal
CREATE INDEX idx_family_tree_generation ON family_tree(generation_diff);

-- ============================================================
-- Sphere Definitions Table (Types of spheres)
-- ============================================================
CREATE TABLE IF NOT EXISTS sphere_definitions (
  sphere_def_id SERIAL PRIMARY KEY,
  sphere_type VARCHAR(50) UNIQUE NOT NULL, -- 'college', 'company', 'city', 'interest', 'alumni', 'graduation_year'
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  verification_required BOOLEAN DEFAULT false, -- true = requires email domain verification
  verification_method VARCHAR(50), -- 'email_domain', 'manual', 'oauth', 'api_integration'
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  pricing_tier VARCHAR(20) DEFAULT 'free', -- 'free', 'verified', 'premium'
  metadata JSONB, -- Configuration (e.g., valid email domains for .edu spheres)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default sphere types
INSERT INTO sphere_definitions (sphere_type, display_name, description, verification_required, verification_method, pricing_tier, metadata)
VALUES
  ('college', 'College/University', 'Educational institution (.edu domain)', true, 'email_domain', 'verified', '{"valid_domains": [".edu"]}'),
  ('graduation_year', 'Graduation Year', 'College graduation year', false, 'manual', 'free', '{"min_year": 1950, "max_year": 2050}'),
  ('company', 'Company/Organization', 'Current or former employer', true, 'email_domain', 'verified', '{}'),
  ('city', 'City/Location', 'Geographic location', false, 'manual', 'free', '{}'),
  ('state', 'State/Province', 'State or province', false, 'manual', 'free', '{}'),
  ('country', 'Country', 'Country of residence', false, 'manual', 'free', '{}'),
  ('interest', 'Interest/Hobby', 'Shared interests or hobbies', false, 'manual', 'free', '{}'),
  ('alumni', 'Alumni Network', 'School alumni networks', true, 'email_domain', 'premium', '{}'),
  ('profession', 'Profession', 'Job title or profession', false, 'manual', 'free', '{}')
ON CONFLICT (sphere_type) DO NOTHING;

-- ============================================================
-- User Spheres Table (User membership in spheres)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_spheres (
  user_sphere_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  sphere_def_id INTEGER NOT NULL REFERENCES sphere_definitions(sphere_def_id) ON DELETE CASCADE,
  sphere_value TEXT NOT NULL, -- e.g., 'stanford.edu', '2020', 'San Francisco', 'software_engineer'
  is_verified BOOLEAN DEFAULT false, -- true = email/domain verified, false = self-reported
  verification_method VARCHAR(50), -- 'email_domain', 'manual_admin', 'oauth', 'api'
  verified_at TIMESTAMP,
  membership_score DECIMAL(3, 2) DEFAULT 1.0, -- 0.0-1.0 confidence in membership
  is_public BOOLEAN DEFAULT true, -- true = visible to others, false = private
  is_primary BOOLEAN DEFAULT false, -- true = primary sphere (e.g., primary college)
  metadata JSONB, -- Additional attributes (e.g., major, job title, dates)
  joined_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate sphere memberships
  UNIQUE(user_id, sphere_def_id, sphere_value)
);

-- Index for finding users in a sphere
CREATE INDEX idx_user_spheres_sphere ON user_spheres(sphere_def_id, sphere_value);

-- Index for finding a user's spheres
CREATE INDEX idx_user_spheres_user ON user_spheres(user_id);

-- Index for verified spheres only
CREATE INDEX idx_user_spheres_verified ON user_spheres(is_verified, sphere_def_id, sphere_value);

-- Index for public spheres only
CREATE INDEX idx_user_spheres_public ON user_spheres(is_public, sphere_def_id);

-- ============================================================
-- Sphere Connections Table (Derived connections from spheres)
-- ============================================================
CREATE TABLE IF NOT EXISTS sphere_connections (
  connection_id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user2_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  sphere_def_id INTEGER NOT NULL REFERENCES sphere_definitions(sphere_def_id) ON DELETE CASCADE,
  sphere_value TEXT NOT NULL, -- The shared sphere value
  connection_strength DECIMAL(3, 2) DEFAULT 0.5, -- 0.0-1.0 strength of connection
  is_mutual BOOLEAN DEFAULT true, -- Both users in same sphere
  discovered_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate sphere connections
  UNIQUE(user1_id, user2_id, sphere_def_id, sphere_value)
);

-- Index for finding connections
CREATE INDEX idx_sphere_connections_user1 ON sphere_connections(user1_id, sphere_def_id);
CREATE INDEX idx_sphere_connections_user2 ON sphere_connections(user2_id, sphere_def_id);

-- ============================================================
-- DNA Matches Table (23andMe, Ancestry.com integration)
-- ============================================================
CREATE TABLE IF NOT EXISTS dna_matches (
  dna_match_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  matched_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  dna_provider VARCHAR(50) NOT NULL, -- '23andme', 'ancestry', 'myheritage', 'ftdna'
  shared_dna_percentage DECIMAL(5, 2), -- e.g., 50.00 for parent/child, 25.00 for grandparent
  shared_centimorgans INTEGER, -- Shared DNA in centimorgans (cM)
  predicted_relationship VARCHAR(100), -- 'parent', 'sibling', 'grandparent', 'first_cousin', etc.
  confidence_level VARCHAR(20), -- 'very_high', 'high', 'moderate', 'low'
  provider_match_id VARCHAR(255), -- External ID from DNA provider
  match_date TIMESTAMP NOT NULL,
  metadata JSONB, -- Additional provider data (segments, X-DNA, etc.)
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate DNA matches from same provider
  UNIQUE(user_id, matched_user_id, dna_provider),

  -- Prevent self-matching
  CHECK (user_id != matched_user_id)
);

-- Index for finding DNA relatives
CREATE INDEX idx_dna_matches_user ON dna_matches(user_id);
CREATE INDEX idx_dna_matches_matched_user ON dna_matches(matched_user_id);
CREATE INDEX idx_dna_matches_provider ON dna_matches(dna_provider);

-- ============================================================
-- Sphere Analytics Table (Data brokering metrics)
-- ============================================================
CREATE TABLE IF NOT EXISTS sphere_analytics (
  analytics_id SERIAL PRIMARY KEY,
  sphere_def_id INTEGER NOT NULL REFERENCES sphere_definitions(sphere_def_id) ON DELETE CASCADE,
  sphere_value TEXT NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_members INTEGER DEFAULT 0,
  verified_members INTEGER DEFAULT 0,
  new_members_today INTEGER DEFAULT 0,
  active_members_7d INTEGER DEFAULT 0, -- Active in last 7 days
  connection_count INTEGER DEFAULT 0, -- Total connections made through this sphere
  engagement_score DECIMAL(5, 2) DEFAULT 0.0, -- Engagement metric (0-100)
  metadata JSONB, -- Additional metrics
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(sphere_def_id, sphere_value, metric_date)
);

-- Index for time-series queries
CREATE INDEX idx_sphere_analytics_date ON sphere_analytics(metric_date DESC);
CREATE INDEX idx_sphere_analytics_sphere ON sphere_analytics(sphere_def_id, sphere_value);

-- ============================================================
-- Functions for Family Tree Management
-- ============================================================

-- Function to add parent-child relationship (bidirectional)
CREATE OR REPLACE FUNCTION add_family_relationship(
  p_parent_id INTEGER,
  p_child_id INTEGER,
  p_label VARCHAR(50),
  p_source VARCHAR(50),
  p_confidence DECIMAL DEFAULT 1.0,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  -- Insert parent → child
  INSERT INTO family_tree (
    parent_user_id, child_user_id, relationship_label,
    generation_diff, confidence_score, verification_source, metadata
  ) VALUES (
    p_parent_id, p_child_id, p_label,
    1, p_confidence, p_source, p_metadata
  ) ON CONFLICT (parent_user_id, child_user_id)
  DO UPDATE SET
    confidence_score = GREATEST(EXCLUDED.confidence_score, family_tree.confidence_score),
    updated_at = NOW();

  -- Also add to user_relationships for exclusion/inclusion system
  PERFORM add_bidirectional_relationship(
    p_parent_id, p_child_id, 'family', p_source,
    1, p_confidence, false, p_metadata
  );
END;
$$ LANGUAGE plpgsql;

-- Function to find all ancestors (recursive)
CREATE OR REPLACE FUNCTION get_ancestors(
  p_user_id INTEGER,
  p_max_generations INTEGER DEFAULT 10
) RETURNS TABLE (
  ancestor_id INTEGER,
  generation_diff INTEGER,
  relationship_path TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE ancestor_tree AS (
    -- Base case: direct parents
    SELECT
      ft.parent_user_id as ancestor_id,
      ft.generation_diff,
      ARRAY[ft.relationship_label] as relationship_path
    FROM family_tree ft
    WHERE ft.child_user_id = p_user_id

    UNION ALL

    -- Recursive case: grandparents, great-grandparents, etc.
    SELECT
      ft.parent_user_id,
      at.generation_diff + ft.generation_diff,
      at.relationship_path || ft.relationship_label
    FROM family_tree ft
    INNER JOIN ancestor_tree at ON ft.child_user_id = at.ancestor_id
    WHERE at.generation_diff < p_max_generations
  )
  SELECT * FROM ancestor_tree;
END;
$$ LANGUAGE plpgsql;

-- Function to find all descendants (recursive)
CREATE OR REPLACE FUNCTION get_descendants(
  p_user_id INTEGER,
  p_max_generations INTEGER DEFAULT 10
) RETURNS TABLE (
  descendant_id INTEGER,
  generation_diff INTEGER,
  relationship_path TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendant_tree AS (
    -- Base case: direct children
    SELECT
      ft.child_user_id as descendant_id,
      ft.generation_diff,
      ARRAY[ft.relationship_label] as relationship_path
    FROM family_tree ft
    WHERE ft.parent_user_id = p_user_id

    UNION ALL

    -- Recursive case: grandchildren, great-grandchildren, etc.
    SELECT
      ft.child_user_id,
      dt.generation_diff + ft.generation_diff,
      dt.relationship_path || ft.relationship_label
    FROM family_tree ft
    INNER JOIN descendant_tree dt ON ft.parent_user_id = dt.descendant_id
    WHERE dt.generation_diff < p_max_generations
  )
  SELECT * FROM descendant_tree;
END;
$$ LANGUAGE plpgsql;

-- Function to find all family members (ancestors + descendants + siblings)
CREATE OR REPLACE FUNCTION get_all_family(
  p_user_id INTEGER,
  p_max_generations INTEGER DEFAULT 10
) RETURNS TABLE (
  family_member_id INTEGER,
  relationship_type VARCHAR(20),
  generation_diff INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Ancestors
  SELECT ancestor_id, 'ancestor'::VARCHAR(20), generation_diff
  FROM get_ancestors(p_user_id, p_max_generations)

  UNION

  -- Descendants
  SELECT descendant_id, 'descendant'::VARCHAR(20), generation_diff
  FROM get_descendants(p_user_id, p_max_generations)

  UNION

  -- Siblings (share same parent)
  SELECT DISTINCT ft2.child_user_id, 'sibling'::VARCHAR(20), 0
  FROM family_tree ft1
  INNER JOIN family_tree ft2 ON ft1.parent_user_id = ft2.parent_user_id
  WHERE ft1.child_user_id = p_user_id
    AND ft2.child_user_id != p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Functions for Sphere Management
-- ============================================================

-- Function to find users in a sphere
CREATE OR REPLACE FUNCTION find_users_in_sphere(
  p_sphere_type VARCHAR(50),
  p_sphere_value TEXT,
  p_verified_only BOOLEAN DEFAULT false
) RETURNS TABLE (
  user_id INTEGER,
  username VARCHAR(255),
  email VARCHAR(255),
  is_verified BOOLEAN,
  membership_score DECIMAL(3, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.user_id,
    u.username,
    u.email,
    us.is_verified,
    us.membership_score
  FROM user_spheres us
  INNER JOIN users u ON us.user_id = u.user_id
  INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
  WHERE sd.sphere_type = p_sphere_type
    AND us.sphere_value = p_sphere_value
    AND us.is_public = true
    AND (NOT p_verified_only OR us.is_verified = true)
  ORDER BY us.membership_score DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to create sphere connections (batch job)
CREATE OR REPLACE FUNCTION sync_sphere_connections(
  p_sphere_def_id INTEGER,
  p_sphere_value TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_connection_count INTEGER := 0;
BEGIN
  -- Create connections between all users in this sphere
  INSERT INTO sphere_connections (user1_id, user2_id, sphere_def_id, sphere_value, connection_strength)
  SELECT
    us1.user_id,
    us2.user_id,
    p_sphere_def_id,
    p_sphere_value,
    LEAST(us1.membership_score, us2.membership_score) as connection_strength
  FROM user_spheres us1
  CROSS JOIN user_spheres us2
  WHERE us1.sphere_def_id = p_sphere_def_id
    AND us1.sphere_value = p_sphere_value
    AND us2.sphere_def_id = p_sphere_def_id
    AND us2.sphere_value = p_sphere_value
    AND us1.user_id < us2.user_id -- Avoid duplicates and self-connections
    AND us1.is_public = true
    AND us2.is_public = true
  ON CONFLICT (user1_id, user2_id, sphere_def_id, sphere_value) DO NOTHING;

  GET DIAGNOSTICS v_connection_count = ROW_COUNT;
  RETURN v_connection_count;
END;
$$ LANGUAGE plpgsql;

-- Function for flexible OR/AND sphere matching
CREATE OR REPLACE FUNCTION find_by_spheres(
  p_user_id INTEGER,
  p_sphere_filters JSONB, -- [{"sphere_type": "college", "sphere_value": "stanford.edu", "operator": "OR"}]
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  matched_user_id INTEGER,
  match_score DECIMAL(5, 2),
  matched_spheres JSONB
) AS $$
DECLARE
  v_filter JSONB;
  v_or_users INTEGER[] := ARRAY[]::INTEGER[];
  v_and_users INTEGER[];
BEGIN
  -- Process OR filters (union)
  FOR v_filter IN SELECT * FROM jsonb_array_elements(p_sphere_filters)
  LOOP
    IF v_filter->>'operator' = 'OR' THEN
      v_or_users := v_or_users || ARRAY(
        SELECT DISTINCT us.user_id
        FROM user_spheres us
        INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
        WHERE sd.sphere_type = v_filter->>'sphere_type'
          AND us.sphere_value = v_filter->>'sphere_value'
          AND us.user_id != p_user_id
          AND us.is_public = true
      );
    END IF;
  END LOOP;

  -- Process AND filters (intersection)
  v_and_users := v_or_users;

  FOR v_filter IN SELECT * FROM jsonb_array_elements(p_sphere_filters)
  LOOP
    IF v_filter->>'operator' = 'AND' THEN
      v_and_users := ARRAY(
        SELECT DISTINCT us.user_id
        FROM user_spheres us
        INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
        WHERE sd.sphere_type = v_filter->>'sphere_type'
          AND us.sphere_value = v_filter->>'sphere_value'
          AND us.user_id = ANY(v_and_users)
          AND us.is_public = true
      );
    END IF;
  END LOOP;

  -- Return matched users with scores and matched sphere details
  RETURN QUERY
  SELECT
    u.user_id,
    (
      -- Calculate match score based on number of matched spheres
      SELECT COALESCE(
        (COUNT(DISTINCT us.sphere_def_id)::DECIMAL / GREATEST(jsonb_array_length(p_sphere_filters), 1)::DECIMAL) * 100,
        50.0
      )
      FROM user_spheres us
      WHERE us.user_id = u.user_id
        AND us.is_public = true
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_sphere_filters) f
          INNER JOIN sphere_definitions sd ON sd.sphere_type = f->>'sphere_type'
          WHERE us.sphere_def_id = sd.sphere_def_id
            AND us.sphere_value = f->>'sphere_value'
        )
    )::DECIMAL(5, 2) as match_score,
    (
      -- Return matched sphere details as JSONB array
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'sphere_type', sd.sphere_type,
            'sphere_value', us.sphere_value,
            'display_name', sd.display_name,
            'is_verified', us.is_verified
          )
        ),
        '[]'::jsonb
      )
      FROM user_spheres us
      INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
      WHERE us.user_id = u.user_id
        AND us.is_public = true
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_sphere_filters) f
          WHERE sd.sphere_type = f->>'sphere_type'
            AND us.sphere_value = f->>'sphere_value'
        )
    ) as matched_spheres
  FROM users u
  WHERE u.user_id = ANY(v_and_users)
  ORDER BY match_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers
-- ============================================================

-- Trigger to sync sphere connections when user joins a sphere
CREATE OR REPLACE FUNCTION trigger_sync_sphere_connections()
RETURNS TRIGGER AS $$
BEGIN
  -- Asynchronously sync connections for this sphere
  PERFORM sync_sphere_connections(NEW.sphere_def_id, NEW.sphere_value);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_sphere_insert
AFTER INSERT ON user_spheres
FOR EACH ROW EXECUTE FUNCTION trigger_sync_sphere_connections();

-- Trigger to update sphere analytics
CREATE OR REPLACE FUNCTION update_sphere_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sphere_analytics (sphere_def_id, sphere_value, total_members, verified_members, new_members_today)
    VALUES (
      NEW.sphere_def_id,
      NEW.sphere_value,
      1,
      CASE WHEN NEW.is_verified THEN 1 ELSE 0 END,
      1
    )
    ON CONFLICT (sphere_def_id, sphere_value, metric_date)
    DO UPDATE SET
      total_members = sphere_analytics.total_members + 1,
      verified_members = sphere_analytics.verified_members + (CASE WHEN NEW.is_verified THEN 1 ELSE 0 END),
      new_members_today = sphere_analytics.new_members_today + 1;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sphere_analytics
AFTER INSERT ON user_spheres
FOR EACH ROW EXECUTE FUNCTION update_sphere_analytics();

-- ============================================================
-- Views
-- ============================================================

-- View for family tree visualization
CREATE OR REPLACE VIEW family_tree_view AS
SELECT
  ft.tree_id,
  ft.parent_user_id,
  p.username as parent_username,
  p.email as parent_email,
  ft.child_user_id,
  c.username as child_username,
  c.email as child_email,
  ft.relationship_label,
  ft.generation_diff,
  ft.confidence_score,
  ft.verification_source,
  ft.created_at
FROM family_tree ft
INNER JOIN users p ON ft.parent_user_id = p.user_id
INNER JOIN users c ON ft.child_user_id = c.user_id;

-- View for sphere membership summary
CREATE OR REPLACE VIEW sphere_membership_summary AS
SELECT
  sd.sphere_type,
  sd.display_name,
  us.sphere_value,
  COUNT(*) as member_count,
  COUNT(*) FILTER (WHERE us.is_verified = true) as verified_count,
  AVG(us.membership_score)::DECIMAL(3, 2) as avg_membership_score
FROM user_spheres us
INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
WHERE us.is_public = true
GROUP BY sd.sphere_type, sd.display_name, us.sphere_value
ORDER BY member_count DESC;

-- View for DNA match relationships
CREATE OR REPLACE VIEW dna_family_view AS
SELECT
  dm.dna_match_id,
  dm.user_id,
  u1.username as user_username,
  dm.matched_user_id,
  u2.username as matched_username,
  dm.dna_provider,
  dm.shared_dna_percentage,
  dm.predicted_relationship,
  dm.confidence_level,
  dm.match_date
FROM dna_matches dm
INNER JOIN users u1 ON dm.user_id = u1.user_id
INNER JOIN users u2 ON dm.matched_user_id = u2.user_id;

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON TABLE family_tree IS 'Parent-child hierarchical relationships for family tree visualization (Ancestry.com style)';

COMMENT ON TABLE sphere_definitions IS 'Defines types of multi-dimensional spheres (college, company, city, interests, etc.)';

COMMENT ON TABLE user_spheres IS 'User membership in various spheres with verification status and visibility controls';

COMMENT ON TABLE sphere_connections IS 'Derived connections between users based on shared sphere membership';

COMMENT ON TABLE dna_matches IS 'DNA test results from 23andMe, Ancestry.com, etc. for genetic family discovery';

COMMENT ON TABLE sphere_analytics IS 'Analytics and engagement metrics for sphere-based data brokering';

COMMENT ON FUNCTION add_family_relationship IS 'Adds parent-child relationship to family tree and syncs with user_relationships table';

COMMENT ON FUNCTION get_ancestors IS 'Recursively finds all ancestors (parents, grandparents, etc.) up to specified generations';

COMMENT ON FUNCTION get_descendants IS 'Recursively finds all descendants (children, grandchildren, etc.) up to specified generations';

COMMENT ON FUNCTION get_all_family IS 'Finds all family members (ancestors, descendants, and siblings)';

COMMENT ON FUNCTION find_users_in_sphere IS 'Finds all users in a specific sphere (e.g., all stanford.edu users)';

COMMENT ON FUNCTION sync_sphere_connections IS 'Batch job to create connections between all users in a sphere';

COMMENT ON FUNCTION find_by_spheres IS 'Flexible OR/AND query across multiple spheres (e.g., "family OR college AND city")';
