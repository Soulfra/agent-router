/**
 * Migration 062: Relationship Graph & Family Exclusion System
 *
 * Prevents matching family members, household members, or blocked users
 * in dating/matching applications (similar to prison conflict-of-interest rules).
 *
 * Multi-source detection:
 * - Facebook social graph (family members)
 * - Phone contacts (people you know)
 * - Surname matching (same last name + age gap)
 * - Household detection (shared IP/address)
 * - Manual user blocks
 *
 * Privacy-preserving: Never reveals WHY a match was excluded
 */

-- ============================================================
-- User Relationships Table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_relationships (
  relationship_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  related_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL, -- 'family', 'friend', 'coworker', 'blocked', 'friend_of_friend'
  relationship_source VARCHAR(50) NOT NULL, -- 'facebook', 'manual', 'phone_contacts', 'household_detection', 'surname_heuristic'
  degree INTEGER DEFAULT 1, -- 1 = direct (sibling), 2 = friend-of-friend, etc.
  confidence_score DECIMAL(3, 2) DEFAULT 1.0, -- 0.0-1.0 confidence in relationship detection
  is_hard_block BOOLEAN DEFAULT false, -- true = never match, false = soft filter
  metadata JSONB, -- Additional context (e.g., Facebook relationship type, shared address)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate relationships
  UNIQUE(user_id, related_user_id, relationship_type, relationship_source)
);

-- Index for fast exclusion lookups
CREATE INDEX idx_user_relationships_lookup
  ON user_relationships(user_id, related_user_id, is_hard_block);

-- Index for relationship type filtering
CREATE INDEX idx_user_relationships_type
  ON user_relationships(relationship_type, is_hard_block);

-- Index for source tracking
CREATE INDEX idx_user_relationships_source
  ON user_relationships(relationship_source);

-- ============================================================
-- Household Clusters Table (IP/Address-based detection)
-- ============================================================
CREATE TABLE IF NOT EXISTS household_clusters (
  cluster_id SERIAL PRIMARY KEY,
  cluster_fingerprint VARCHAR(64) UNIQUE NOT NULL, -- Hash of IP + location + device fingerprints
  detection_method VARCHAR(50) NOT NULL, -- 'ip_address', 'physical_address', 'payment_method', 'wifi_network'
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  member_count INTEGER DEFAULT 0,
  metadata JSONB -- Shared attributes (anonymized IP subnet, city, etc.)
);

-- User to cluster mapping
CREATE TABLE IF NOT EXISTS household_cluster_members (
  cluster_id INTEGER REFERENCES household_clusters(cluster_id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  confidence_score DECIMAL(3, 2) DEFAULT 1.0,
  PRIMARY KEY (cluster_id, user_id)
);

-- Index for finding household members
CREATE INDEX idx_household_cluster_members_user
  ON household_cluster_members(user_id);

-- ============================================================
-- Surname Variants Table (Phonetic matching)
-- ============================================================
CREATE TABLE IF NOT EXISTS surname_variants (
  variant_id SERIAL PRIMARY KEY,
  base_surname VARCHAR(100) NOT NULL,
  variant_surname VARCHAR(100) NOT NULL,
  phonetic_code VARCHAR(20), -- Soundex or Metaphone code
  similarity_score DECIMAL(3, 2) DEFAULT 1.0, -- 1.0 = exact match, 0.8 = very similar
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(base_surname, variant_surname)
);

-- Index for phonetic lookups
CREATE INDEX idx_surname_variants_phonetic
  ON surname_variants(phonetic_code);

CREATE INDEX idx_surname_variants_base
  ON surname_variants(base_surname);

-- ============================================================
-- Contact Hashes Table (Privacy-preserving phone contact matching)
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_hashes (
  hash_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  contact_hash VARCHAR(64) NOT NULL, -- SHA256 hash of phone/email
  contact_type VARCHAR(20) NOT NULL, -- 'phone', 'email'
  uploaded_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, contact_hash)
);

-- Index for finding contact overlaps
CREATE INDEX idx_contact_hashes_lookup
  ON contact_hashes(contact_hash);

-- ============================================================
-- Exclusion Rules Table (Configurable filtering rules)
-- ============================================================
CREATE TABLE IF NOT EXISTS exclusion_rules (
  rule_id SERIAL PRIMARY KEY,
  rule_name VARCHAR(100) UNIQUE NOT NULL,
  rule_type VARCHAR(50) NOT NULL, -- 'family', 'household', 'surname', 'manual_block', 'friend'
  is_enabled BOOLEAN DEFAULT true,
  is_hard_block BOOLEAN DEFAULT true, -- true = never match, false = deprioritize
  min_confidence DECIMAL(3, 2) DEFAULT 0.7, -- Minimum confidence to apply rule
  priority INTEGER DEFAULT 100, -- Higher = checked first
  rule_config JSONB, -- Rule-specific config (e.g., age gap for surname matching)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default exclusion rules
INSERT INTO exclusion_rules (rule_name, rule_type, is_enabled, is_hard_block, min_confidence, priority, rule_config)
VALUES
  ('Immediate Family', 'family', true, true, 0.9, 1000, '{"degrees": [1], "sources": ["facebook", "manual"]}'),
  ('Extended Family', 'family', true, true, 0.8, 900, '{"degrees": [2], "sources": ["facebook"]}'),
  ('Same Household', 'household', true, true, 0.85, 800, '{"max_cluster_size": 10}'),
  ('Same Surname + Age Gap', 'surname', true, true, 0.75, 700, '{"min_age_gap": 15, "max_age_gap": 40}'),
  ('Same Surname + Similar Age', 'surname', true, true, 0.75, 600, '{"max_age_gap": 5}'),
  ('Manual Block', 'manual_block', true, true, 1.0, 2000, '{}'),
  ('Phone Contacts', 'friend', true, false, 0.9, 500, '{"sources": ["phone_contacts"]}'),
  ('Facebook Friends', 'friend', true, false, 0.9, 400, '{"sources": ["facebook"], "degrees": [1]}'),
  ('Friends of Friends', 'friend', false, false, 0.7, 300, '{"sources": ["facebook"], "degrees": [2]}')
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================================
-- Functions for Relationship Management
-- ============================================================

-- Function to add bidirectional relationship
CREATE OR REPLACE FUNCTION add_bidirectional_relationship(
  p_user1_id INTEGER,
  p_user2_id INTEGER,
  p_type VARCHAR(50),
  p_source VARCHAR(50),
  p_degree INTEGER DEFAULT 1,
  p_confidence DECIMAL DEFAULT 1.0,
  p_is_hard_block BOOLEAN DEFAULT false,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  -- Insert relationship user1 → user2
  INSERT INTO user_relationships (
    user_id, related_user_id, relationship_type, relationship_source,
    degree, confidence_score, is_hard_block, metadata
  ) VALUES (
    p_user1_id, p_user2_id, p_type, p_source,
    p_degree, p_confidence, p_is_hard_block, p_metadata
  ) ON CONFLICT (user_id, related_user_id, relationship_type, relationship_source)
  DO UPDATE SET
    confidence_score = GREATEST(EXCLUDED.confidence_score, user_relationships.confidence_score),
    updated_at = NOW();

  -- Insert relationship user2 → user1 (bidirectional)
  INSERT INTO user_relationships (
    user_id, related_user_id, relationship_type, relationship_source,
    degree, confidence_score, is_hard_block, metadata
  ) VALUES (
    p_user2_id, p_user1_id, p_type, p_source,
    p_degree, p_confidence, p_is_hard_block, p_metadata
  ) ON CONFLICT (user_id, related_user_id, relationship_type, relationship_source)
  DO UPDATE SET
    confidence_score = GREATEST(EXCLUDED.confidence_score, user_relationships.confidence_score),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to check if two users should be excluded from matching
CREATE OR REPLACE FUNCTION is_match_excluded(
  p_user1_id INTEGER,
  p_user2_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_exclusion BOOLEAN;
BEGIN
  -- Check for any hard block relationships
  SELECT EXISTS (
    SELECT 1
    FROM user_relationships ur
    JOIN exclusion_rules er ON ur.relationship_type = er.rule_type
    WHERE ur.user_id = p_user1_id
      AND ur.related_user_id = p_user2_id
      AND ur.is_hard_block = true
      AND er.is_enabled = true
      AND ur.confidence_score >= er.min_confidence
  ) INTO v_has_exclusion;

  RETURN v_has_exclusion;
END;
$$ LANGUAGE plpgsql;

-- Function to get exclusion score (for soft filtering)
CREATE OR REPLACE FUNCTION get_exclusion_score(
  p_user1_id INTEGER,
  p_user2_id INTEGER
) RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL;
BEGIN
  -- Sum up weighted exclusion scores
  SELECT COALESCE(SUM(
    ur.confidence_score *
    (CASE WHEN ur.is_hard_block THEN 1.0 ELSE 0.3 END) *
    (er.priority / 1000.0)
  ), 0.0)
  FROM user_relationships ur
  JOIN exclusion_rules er ON ur.relationship_type = er.rule_type
  WHERE ur.user_id = p_user1_id
    AND ur.related_user_id = p_user2_id
    AND er.is_enabled = true
    AND ur.confidence_score >= er.min_confidence
  INTO v_score;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers
-- ============================================================

-- Trigger to update household cluster member count
CREATE OR REPLACE FUNCTION update_household_cluster_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE household_clusters
    SET member_count = member_count + 1,
        last_seen = NOW()
    WHERE cluster_id = NEW.cluster_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE household_clusters
    SET member_count = member_count - 1
    WHERE cluster_id = OLD.cluster_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_household_count
AFTER INSERT OR DELETE ON household_cluster_members
FOR EACH ROW EXECUTE FUNCTION update_household_cluster_count();

-- ============================================================
-- Views
-- ============================================================

-- View for relationship statistics
CREATE OR REPLACE VIEW relationship_stats AS
SELECT
  relationship_type,
  relationship_source,
  COUNT(*) as relationship_count,
  AVG(confidence_score)::DECIMAL(3,2) as avg_confidence,
  COUNT(*) FILTER (WHERE is_hard_block = true) as hard_blocks,
  COUNT(*) FILTER (WHERE is_hard_block = false) as soft_filters
FROM user_relationships
GROUP BY relationship_type, relationship_source
ORDER BY relationship_count DESC;

-- View for household detection summary
CREATE OR REPLACE VIEW household_summary AS
SELECT
  hc.cluster_id,
  hc.detection_method,
  hc.member_count,
  hc.first_seen,
  hc.last_seen,
  array_agg(DISTINCT hcm.user_id) as member_ids
FROM household_clusters hc
LEFT JOIN household_cluster_members hcm ON hc.cluster_id = hcm.cluster_id
GROUP BY hc.cluster_id, hc.detection_method, hc.member_count, hc.first_seen, hc.last_seen
HAVING hc.member_count > 1
ORDER BY hc.member_count DESC;

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON TABLE user_relationships IS 'Stores relationships between users for match exclusion (family, friends, blocked users). Privacy-preserving - never reveals WHY a match was excluded to end users.';

COMMENT ON TABLE household_clusters IS 'Detects users from same household via IP address, location, payment methods. Used to prevent matching family members who live together.';

COMMENT ON TABLE surname_variants IS 'Phonetic surname matching to catch variants (Smith ≈ Smyth). Used with age gap heuristics to detect parent/child or sibling relationships.';

COMMENT ON TABLE contact_hashes IS 'Privacy-preserving storage of phone/email contacts. Hashed to enable overlap detection without storing raw contact data.';

COMMENT ON TABLE exclusion_rules IS 'Configurable filtering rules for match exclusion. Allows enabling/disabling different exclusion strategies and adjusting thresholds.';

COMMENT ON FUNCTION add_bidirectional_relationship IS 'Adds a relationship between two users in both directions (A→B and B→A). Merges confidence scores if relationship already exists.';

COMMENT ON FUNCTION is_match_excluded IS 'Returns true if two users should NOT be matched due to hard block relationships (family, manual block, etc.).';

COMMENT ON FUNCTION get_exclusion_score IS 'Calculates weighted exclusion score for soft filtering (deprioritize but don''t fully exclude). Used for friends, colleagues, etc.';
