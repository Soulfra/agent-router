/**
 * Relationship Router - Unified Inclusion & Exclusion System
 *
 * Extends RelationshipFilter to support BOTH:
 * - Family/friend EXCLUSION (dating app mode - avoid relatives)
 * - Family/friend INCLUSION (Ancestry.com mode - find relatives)
 * - Multi-dimensional sphere grouping (Snapchat college stories model)
 *
 * Mode switching:
 * - mode: 'exclusion' (default) - Filter OUT relationships (dating apps)
 * - mode: 'inclusion' - Filter IN relationships (family tree, social spheres)
 * - mode: 'hybrid' - Both (e.g., find family OR college friends)
 */

const crypto = require('crypto');
const EventEmitter = require('events');
const RelationshipFilter = require('./relationship-filter');

class RelationshipRouter extends EventEmitter {
  constructor({ db, collaborationMatcher = null, defaultMode = 'exclusion' }) {
    super();

    this.db = db;
    this.collaborationMatcher = collaborationMatcher;
    this.defaultMode = defaultMode; // 'exclusion', 'inclusion', or 'hybrid'

    // Caches
    this.familyTreeCache = new Map(); // Map<userId, familyMembers[]>
    this.sphereCache = new Map(); // Map<userId, spheres[]>
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes

    // Legacy RelationshipFilter for backward compatibility
    this.relationshipFilter = new RelationshipFilter({ db, collaborationMatcher });

    console.log(`[RelationshipRouter] Initialized (mode: ${defaultMode})`);
  }

  /**
   * Find matches with configurable inclusion/exclusion mode
   *
   * @param {number} userId - User to find matches for
   * @param {object} options - Configuration
   *   - mode: 'exclusion' | 'inclusion' | 'hybrid'
   *   - sphereFilters: [{ sphere_type, sphere_value, operator: 'OR'|'AND' }]
   *   - includeFamilyTree: boolean
   *   - includeSphereSuggestions: boolean
   */
  async findMatches(userId, options = {}) {
    const {
      mode = this.defaultMode,
      limit = 10,
      minScore = 0.5,
      sphereFilters = [],
      includeFamilyTree = false,
      includeSphereSuggestions = false,
      includeReasons = false // Admin debug mode
    } = options;

    try {
      if (mode === 'exclusion') {
        // Legacy exclusion mode (dating apps)
        return await this.relationshipFilter.findMatches(userId, {
          limit,
          minScore,
          includeExclusionReasons: includeReasons
        });
      } else if (mode === 'inclusion') {
        // Family inclusion mode (Ancestry.com)
        return await this.findFamilyAndSpheres(userId, {
          limit,
          sphereFilters,
          includeFamilyTree,
          includeSphereSuggestions,
          includeReasons
        });
      } else if (mode === 'hybrid') {
        // Hybrid mode: find family OR sphere matches, exclude blocked users
        return await this.findHybridMatches(userId, {
          limit,
          minScore,
          sphereFilters,
          includeFamilyTree,
          includeReasons
        });
      } else {
        throw new Error(`Invalid mode: ${mode}. Must be 'exclusion', 'inclusion', or 'hybrid'`);
      }
    } catch (error) {
      console.error('[RelationshipRouter] Error finding matches:', error);
      throw error;
    }
  }

  /**
   * Find family members and sphere connections (INCLUSION mode)
   */
  async findFamilyAndSpheres(userId, options = {}) {
    const {
      limit = 50,
      sphereFilters = [],
      includeFamilyTree = true,
      includeSphereSuggestions = true,
      includeReasons = false
    } = options;

    const matches = [];

    try {
      // 1. Find family tree members
      if (includeFamilyTree) {
        const familyMembers = await this.getFamilyMembers(userId);
        for (const member of familyMembers) {
          matches.push({
            userId: member.family_member_id,
            matchType: 'family',
            relationshipType: member.relationship_type,
            generationDiff: member.generation_diff,
            score: this.calculateFamilyScore(member),
            reasons: includeReasons ? [{ type: 'family', ...member }] : undefined
          });
        }
      }

      // 2. Find sphere-based connections
      if (includeSphereSuggestions) {
        const sphereMatches = await this.findSphereMatches(userId, sphereFilters);
        for (const match of sphereMatches) {
          matches.push({
            userId: match.matched_user_id,
            matchType: 'sphere',
            spheres: match.matched_spheres,
            score: match.match_score,
            reasons: includeReasons ? match.matched_spheres : undefined
          });
        }
      }

      // 3. Find DNA matches (if available)
      const dnaMatches = await this.getDNAMatches(userId);
      for (const match of dnaMatches) {
        matches.push({
          userId: match.matched_user_id,
          matchType: 'dna',
          dnaProvider: match.dna_provider,
          sharedDNA: match.shared_dna_percentage,
          predictedRelationship: match.predicted_relationship,
          score: this.calculateDNAScore(match),
          reasons: includeReasons ? [{ type: 'dna', ...match }] : undefined
        });
      }

      // 4. Deduplicate and sort by score
      const deduped = this.deduplicateMatches(matches);
      deduped.sort((a, b) => b.score - a.score);

      return deduped.slice(0, limit);

    } catch (error) {
      console.error('[RelationshipRouter] Error finding family/spheres:', error);
      throw error;
    }
  }

  /**
   * Hybrid mode: Find family/spheres, exclude blocked users
   */
  async findHybridMatches(userId, options = {}) {
    const {
      limit = 10,
      minScore = 0.5,
      sphereFilters = [],
      includeFamilyTree = true,
      includeReasons = false
    } = options;

    try {
      // Get inclusion matches
      const inclusionMatches = await this.findFamilyAndSpheres(userId, {
        limit: limit * 2,
        sphereFilters,
        includeFamilyTree,
        includeReasons
      });

      // Filter out manually blocked users
      const filtered = [];
      for (const match of inclusionMatches) {
        const isBlocked = await this.isUserBlocked(userId, match.userId);
        if (!isBlocked && match.score >= minScore) {
          filtered.push(match);
        }
      }

      return filtered.slice(0, limit);

    } catch (error) {
      console.error('[RelationshipRouter] Error finding hybrid matches:', error);
      throw error;
    }
  }

  /**
   * Get all family members (ancestors + descendants + siblings)
   */
  async getFamilyMembers(userId, maxGenerations = 10) {
    // Check cache
    const cacheKey = `family:${userId}`;
    const cached = this.familyTreeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const result = await this.db.query(
        'SELECT * FROM get_all_family($1, $2)',
        [userId, maxGenerations]
      );

      const data = result.rows;

      // Cache result
      this.familyTreeCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;

    } catch (error) {
      console.error('[RelationshipRouter] Error getting family members:', error);
      return [];
    }
  }

  /**
   * Find sphere-based matches with flexible OR/AND logic
   */
  async findSphereMatches(userId, sphereFilters = []) {
    if (!sphereFilters || sphereFilters.length === 0) {
      // No filters - find all sphere connections
      return await this.getAllSphereConnections(userId);
    }

    try {
      // Use database function for complex queries
      const result = await this.db.query(
        'SELECT * FROM find_by_spheres($1, $2, $3)',
        [userId, JSON.stringify(sphereFilters), 100]
      );

      return result.rows.map(row => ({
        matched_user_id: row.matched_user_id,
        match_score: parseFloat(row.match_score),
        matched_spheres: row.matched_spheres
      }));

    } catch (error) {
      console.error('[RelationshipRouter] Error finding sphere matches:', error);
      return [];
    }
  }

  /**
   * Get all sphere connections for a user
   */
  async getAllSphereConnections(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          sc.user2_id as matched_user_id,
          sc.connection_strength as match_score,
          jsonb_agg(
            jsonb_build_object(
              'sphere_type', sd.sphere_type,
              'sphere_value', sc.sphere_value,
              'display_name', sd.display_name
            )
          ) as matched_spheres
        FROM sphere_connections sc
        INNER JOIN sphere_definitions sd ON sc.sphere_def_id = sd.sphere_def_id
        WHERE sc.user1_id = $1
        GROUP BY sc.user2_id, sc.connection_strength
        ORDER BY sc.connection_strength DESC
        LIMIT 100`,
        [userId]
      );

      return result.rows.map(row => ({
        matched_user_id: row.matched_user_id,
        match_score: parseFloat(row.match_score),
        matched_spheres: row.matched_spheres
      }));

    } catch (error) {
      console.error('[RelationshipRouter] Error getting sphere connections:', error);
      return [];
    }
  }

  /**
   * Get DNA matches for a user
   */
  async getDNAMatches(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          matched_user_id,
          dna_provider,
          shared_dna_percentage,
          shared_centimorgans,
          predicted_relationship,
          confidence_level
        FROM dna_matches
        WHERE user_id = $1
        ORDER BY shared_dna_percentage DESC`,
        [userId]
      );

      return result.rows;

    } catch (error) {
      console.error('[RelationshipRouter] Error getting DNA matches:', error);
      return [];
    }
  }

  /**
   * Add user to a sphere
   */
  async joinSphere(userId, sphereType, sphereValue, options = {}) {
    const {
      isVerified = false,
      verificationMethod = 'manual',
      metadata = {},
      isPublic = true,
      isPrimary = false
    } = options;

    try {
      // Get sphere definition
      const sphereDefResult = await this.db.query(
        'SELECT sphere_def_id FROM sphere_definitions WHERE sphere_type = $1',
        [sphereType]
      );

      if (sphereDefResult.rows.length === 0) {
        throw new Error(`Invalid sphere type: ${sphereType}`);
      }

      const sphereDefId = sphereDefResult.rows[0].sphere_def_id;

      // Add user to sphere
      await this.db.query(
        `INSERT INTO user_spheres (
          user_id, sphere_def_id, sphere_value, is_verified,
          verification_method, is_public, is_primary, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, sphere_def_id, sphere_value)
        DO UPDATE SET
          is_verified = EXCLUDED.is_verified,
          verification_method = EXCLUDED.verification_method,
          updated_at = NOW()`,
        [userId, sphereDefId, sphereValue, isVerified, verificationMethod, isPublic, isPrimary, JSON.stringify(metadata)]
      );

      // Clear cache
      this.clearCacheForUser(userId);

      console.log(`[RelationshipRouter] User ${userId} joined sphere ${sphereType}:${sphereValue}`);

      this.emit('sphere_joined', { userId, sphereType, sphereValue });

      // Trigger sphere connection sync (happens via trigger)
      return { success: true, sphereType, sphereValue };

    } catch (error) {
      console.error('[RelationshipRouter] Error joining sphere:', error);
      throw error;
    }
  }

  /**
   * Verify sphere membership via email domain
   */
  async verifySphereByEmail(userId, email, sphereType) {
    try {
      // Extract domain from email
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) {
        throw new Error('Invalid email format');
      }

      // Get sphere definition
      const sphereDefResult = await this.db.query(
        `SELECT sphere_def_id, metadata
        FROM sphere_definitions
        WHERE sphere_type = $1
          AND verification_required = true
          AND verification_method = 'email_domain'`,
        [sphereType]
      );

      if (sphereDefResult.rows.length === 0) {
        throw new Error(`Sphere type ${sphereType} does not support email verification`);
      }

      const sphereDef = sphereDefResult.rows[0];
      const validDomains = sphereDef.metadata?.valid_domains || [];

      // Check if domain is valid
      const isValid = validDomains.some(validDomain => domain.endsWith(validDomain));

      if (!isValid) {
        throw new Error(`Email domain ${domain} is not valid for ${sphereType}`);
      }

      // Add user to verified sphere
      await this.joinSphere(userId, sphereType, domain, {
        isVerified: true,
        verificationMethod: 'email_domain',
        metadata: { email, verifiedAt: new Date() }
      });

      return { success: true, sphereType, sphereValue: domain, verified: true };

    } catch (error) {
      console.error('[RelationshipRouter] Error verifying sphere:', error);
      throw error;
    }
  }

  /**
   * Add family relationship
   */
  async addFamilyRelationship(parentId, childId, label, source, options = {}) {
    const {
      confidence = 1.0,
      metadata = {}
    } = options;

    try {
      await this.db.query(
        'SELECT add_family_relationship($1, $2, $3, $4, $5, $6)',
        [parentId, childId, label, source, confidence, JSON.stringify(metadata)]
      );

      // Clear caches
      this.clearCacheForUser(parentId);
      this.clearCacheForUser(childId);

      console.log(`[RelationshipRouter] Added family relationship: ${parentId} (${label}) → ${childId}`);

      this.emit('family_relationship_added', { parentId, childId, label, source });

      return { success: true, parentId, childId, label };

    } catch (error) {
      console.error('[RelationshipRouter] Error adding family relationship:', error);
      throw error;
    }
  }

  /**
   * Import DNA matches from 23andMe, Ancestry.com, etc.
   */
  async importDNAMatches(userId, dnaProvider, matches) {
    let imported = 0;

    try {
      for (const match of matches) {
        const {
          matchedUserId,
          sharedDNA,
          sharedCentimorgans,
          predictedRelationship,
          confidenceLevel,
          providerMatchId,
          metadata = {}
        } = match;

        // Insert DNA match
        await this.db.query(
          `INSERT INTO dna_matches (
            user_id, matched_user_id, dna_provider, shared_dna_percentage,
            shared_centimorgans, predicted_relationship, confidence_level,
            provider_match_id, match_date, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
          ON CONFLICT (user_id, matched_user_id, dna_provider)
          DO UPDATE SET
            shared_dna_percentage = EXCLUDED.shared_dna_percentage,
            shared_centimorgans = EXCLUDED.shared_centimorgans,
            predicted_relationship = EXCLUDED.predicted_relationship,
            confidence_level = EXCLUDED.confidence_level,
            metadata = EXCLUDED.metadata`,
          [
            userId,
            matchedUserId,
            dnaProvider,
            sharedDNA,
            sharedCentimorgans,
            predictedRelationship,
            confidenceLevel,
            providerMatchId,
            JSON.stringify(metadata)
          ]
        );

        // If confidence is high, add to family tree
        if (confidenceLevel === 'very_high' || confidenceLevel === 'high') {
          const label = this.inferFamilyLabel(predictedRelationship, sharedDNA);
          if (label) {
            await this.addFamilyRelationship(
              userId,
              matchedUserId,
              label,
              `dna_${dnaProvider}`,
              { confidence: sharedDNA / 100, metadata: { dnaProvider, sharedDNA } }
            );
          }
        }

        imported++;
      }

      console.log(`[RelationshipRouter] Imported ${imported} DNA matches from ${dnaProvider}`);

      return { success: true, imported, provider: dnaProvider };

    } catch (error) {
      console.error('[RelationshipRouter] Error importing DNA matches:', error);
      throw error;
    }
  }

  /**
   * Infer family tree label from DNA relationship
   */
  inferFamilyLabel(predictedRelationship, sharedDNA) {
    const rel = predictedRelationship?.toLowerCase() || '';

    // Parent/child (50% shared DNA)
    if (rel.includes('parent') || rel.includes('child') || sharedDNA >= 45) {
      return 'parent'; // Will be bidirectional
    }

    // Sibling (25-50% shared DNA)
    if (rel.includes('sibling') || rel.includes('brother') || rel.includes('sister')) {
      return 'sibling';
    }

    // Grandparent (25% shared DNA)
    if (rel.includes('grandparent') || rel.includes('grandchild')) {
      return 'grandparent';
    }

    // Don't add more distant relationships to family tree
    return null;
  }

  /**
   * Check if a user is manually blocked
   */
  async isUserBlocked(userId, targetUserId) {
    try {
      const result = await this.db.query(
        `SELECT EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = $1
            AND related_user_id = $2
            AND relationship_type = 'blocked'
            AND relationship_source = 'manual'
        ) as is_blocked`,
        [userId, targetUserId]
      );

      return result.rows[0]?.is_blocked || false;

    } catch (error) {
      console.error('[RelationshipRouter] Error checking if user is blocked:', error);
      return false;
    }
  }

  /**
   * Calculate family match score based on closeness
   */
  calculateFamilyScore(familyMember) {
    const { relationship_type, generation_diff } = familyMember;

    // Closer relatives = higher score
    if (relationship_type === 'sibling') {
      return 1.0;
    } else if (relationship_type === 'ancestor' || relationship_type === 'descendant') {
      // Parents/children = 0.9, grandparents = 0.7, etc.
      return Math.max(0.5, 1.0 - (Math.abs(generation_diff) * 0.15));
    }

    return 0.5;
  }

  /**
   * Calculate DNA match score
   */
  calculateDNAScore(dnaMatch) {
    const { shared_dna_percentage, confidence_level } = dnaMatch;

    let baseScore = (shared_dna_percentage || 0) / 100;

    // Boost for high confidence
    if (confidence_level === 'very_high') {
      baseScore *= 1.2;
    } else if (confidence_level === 'high') {
      baseScore *= 1.1;
    } else if (confidence_level === 'low') {
      baseScore *= 0.8;
    }

    return Math.min(1.0, baseScore);
  }

  /**
   * Deduplicate matches (same user from different sources)
   */
  deduplicateMatches(matches) {
    const seen = new Map();

    for (const match of matches) {
      const existing = seen.get(match.userId);

      if (!existing || match.score > existing.score) {
        // Keep highest-scoring match
        seen.set(match.userId, match);
      } else if (existing && match.matchType !== existing.matchType) {
        // Merge match types
        existing.matchType = `${existing.matchType},${match.matchType}`;
        existing.score = Math.max(existing.score, match.score);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Clear caches for a user
   */
  clearCacheForUser(userId) {
    // Clear family tree cache
    this.familyTreeCache.delete(`family:${userId}`);

    // Clear sphere cache
    for (const key of this.sphereCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.sphereCache.delete(key);
      }
    }

    // Clear relationship filter cache
    this.relationshipFilter.clearCacheForUser(userId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      mode: this.defaultMode,
      familyTreeCacheSize: this.familyTreeCache.size,
      sphereCacheSize: this.sphereCache.size,
      filterStats: this.relationshipFilter.getStats()
    };
  }

  // ============================================================
  // Backward Compatibility - Proxy methods to RelationshipFilter
  // ============================================================

  async isExcluded(user1Id, user2Id) {
    return await this.relationshipFilter.isExcluded(user1Id, user2Id);
  }

  async blockUser(blockerId, blockedId) {
    return await this.relationshipFilter.blockUser(blockerId, blockedId);
  }

  async unblockUser(blockerId, blockedId) {
    return await this.relationshipFilter.unblockUser(blockerId, blockedId);
  }

  async detectHousehold(userId, ipAddress, metadata = {}) {
    return await this.relationshipFilter.detectHousehold(userId, ipAddress, metadata);
  }

  async getExclusionStats(userId) {
    return await this.relationshipFilter.getExclusionStats(userId);
  }
}

module.exports = RelationshipRouter;
