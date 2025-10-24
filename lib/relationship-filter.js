/**
 * Relationship Filter - Family & Conflict-of-Interest Exclusion
 *
 * Prevents matching:
 * - Family members (siblings, parents, cousins)
 * - Household members (same IP/address)
 * - Same surname + age gap (likely related)
 * - Manual user blocks
 * - Phone contacts (optional)
 * - Facebook friends (optional)
 *
 * Privacy-preserving: Never reveals WHY a match was excluded
 *
 * Similar to:
 * - Dating apps (Tinder, Match.com, Bumble)
 * - Prison systems (no relatives working at same facility)
 * - Corporate conflict-of-interest policies
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class RelationshipFilter extends EventEmitter {
  constructor({ db, collaborationMatcher = null }) {
    super();

    this.db = db;
    this.collaborationMatcher = collaborationMatcher;

    // Caches for performance
    this.exclusionCache = new Map(); // Map<userId, Set<excludedUserIds>>
    this.householdCache = new Map(); // Map<userId, clusterId>

    // Cache TTL (5 minutes)
    this.cacheTTL = 5 * 60 * 1000;

    console.log('[RelationshipFilter] Initialized');
  }

  /**
   * Find matches for a user, excluding family/blocked users
   *
   * Wraps CollaborationMatcher and applies exclusion filters
   */
  async findMatches(userId, options = {}) {
    const {
      limit = 10,
      minScore = 0.5,
      includeExclusionReasons = false // Admin only - for debugging
    } = options;

    try {
      // Get all potential matches from CollaborationMatcher
      let candidates = [];

      if (this.collaborationMatcher) {
        candidates = await this.collaborationMatcher.findCollaborators(userId, {
          limit: limit * 3, // Get more candidates to filter
          minScore
        });
      } else {
        // Fallback: get all active users
        candidates = await this.getAllCandidates(userId);
      }

      // Filter out excluded users
      const filtered = [];

      for (const candidate of candidates) {
        const excludeResult = await this.isExcluded(userId, candidate.userId || candidate.user_id);

        if (!excludeResult.isExcluded) {
          // Apply soft filtering (deprioritize but don't fully exclude)
          const exclusionPenalty = excludeResult.exclusionScore || 0;

          filtered.push({
            ...candidate,
            score: candidate.score ? (candidate.score.total || candidate.score) - exclusionPenalty : 1.0 - exclusionPenalty,
            exclusionScore: includeExclusionReasons ? exclusionPenalty : undefined,
            exclusionReasons: includeExclusionReasons ? excludeResult.reasons : undefined
          });
        } else if (includeExclusionReasons) {
          // For debugging: include excluded matches
          filtered.push({
            ...candidate,
            isExcluded: true,
            exclusionReasons: excludeResult.reasons
          });
        }
      }

      // Sort by score (highest first)
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Return top N matches
      return filtered.slice(0, limit);

    } catch (error) {
      console.error('[RelationshipFilter] Error finding matches:', error);
      throw error;
    }
  }

  /**
   * Check if two users should be excluded from matching
   *
   * Returns: { isExcluded: boolean, exclusionScore: number, reasons: [] }
   */
  async isExcluded(user1Id, user2Id) {
    if (!this.db) {
      return { isExcluded: false, exclusionScore: 0, reasons: [] };
    }

    try {
      // Check cache first
      const cacheKey = `${user1Id}:${user2Id}`;
      const cached = this.exclusionCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.result;
      }

      // Use database function for hard blocks
      const hardBlockResult = await this.db.query(
        'SELECT is_match_excluded($1, $2) as is_excluded',
        [user1Id, user2Id]
      );

      const isExcluded = hardBlockResult.rows[0]?.is_excluded || false;

      // Get soft filtering score
      const softScoreResult = await this.db.query(
        'SELECT get_exclusion_score($1, $2) as score',
        [user1Id, user2Id]
      );

      const exclusionScore = parseFloat(softScoreResult.rows[0]?.score || 0);

      // Get detailed reasons (for debugging)
      const reasonsResult = await this.db.query(
        `SELECT ur.relationship_type, ur.relationship_source, ur.confidence_score, ur.is_hard_block
         FROM user_relationships ur
         WHERE ur.user_id = $1 AND ur.related_user_id = $2`,
        [user1Id, user2Id]
      );

      const reasons = reasonsResult.rows.map(r => ({
        type: r.relationship_type,
        source: r.relationship_source,
        confidence: parseFloat(r.confidence_score),
        isHardBlock: r.is_hard_block
      }));

      const result = {
        isExcluded,
        exclusionScore,
        reasons
      };

      // Cache result
      this.exclusionCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('[RelationshipFilter] Error checking exclusion:', error);
      return { isExcluded: false, exclusionScore: 0, reasons: [] };
    }
  }

  /**
   * Add manual block between two users
   */
  async blockUser(blockerId, blockedId) {
    if (!this.db) return;

    try {
      await this.db.query(
        `SELECT add_bidirectional_relationship(
          $1, $2, 'blocked', 'manual', 1, 1.0, true, '{}'
        )`,
        [blockerId, blockedId]
      );

      // Clear caches
      this.clearCacheForUser(blockerId);
      this.clearCacheForUser(blockedId);

      console.log(`[RelationshipFilter] User ${blockerId} blocked user ${blockedId}`);

      this.emit('user_blocked', { blockerId, blockedId });

    } catch (error) {
      console.error('[RelationshipFilter] Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Remove block between two users
   */
  async unblockUser(blockerId, blockedId) {
    if (!this.db) return;

    try {
      await this.db.query(
        `DELETE FROM user_relationships
         WHERE ((user_id = $1 AND related_user_id = $2) OR (user_id = $2 AND related_user_id = $1))
           AND relationship_type = 'blocked'
           AND relationship_source = 'manual'`,
        [blockerId, blockedId]
      );

      // Clear caches
      this.clearCacheForUser(blockerId);
      this.clearCacheForUser(blockedId);

      console.log(`[RelationshipFilter] User ${blockerId} unblocked user ${blockedId}`);

      this.emit('user_unblocked', { blockerId, blockedId });

    } catch (error) {
      console.error('[RelationshipFilter] Error unblocking user:', error);
      throw error;
    }
  }

  /**
   * Detect household cluster from IP address
   */
  async detectHousehold(userId, ipAddress, metadata = {}) {
    if (!this.db || !ipAddress) return;

    try {
      // Create fingerprint from IP (anonymized - use /24 subnet)
      const subnet = this.getSubnet(ipAddress);
      const fingerprint = crypto.createHash('sha256')
        .update(`ip:${subnet}`)
        .digest('hex');

      // Find or create household cluster
      let clusterResult = await this.db.query(
        `SELECT cluster_id FROM household_clusters
         WHERE cluster_fingerprint = $1`,
        [fingerprint]
      );

      let clusterId;

      if (clusterResult.rows.length === 0) {
        // Create new cluster
        const insertResult = await this.db.query(
          `INSERT INTO household_clusters (
            cluster_fingerprint, detection_method, metadata
          ) VALUES ($1, 'ip_address', $2)
          RETURNING cluster_id`,
          [fingerprint, JSON.stringify({ subnet, ...metadata })]
        );

        clusterId = insertResult.rows[0].cluster_id;
      } else {
        clusterId = clusterResult.rows[0].cluster_id;

        // Update last seen
        await this.db.query(
          `UPDATE household_clusters SET last_seen = NOW() WHERE cluster_id = $1`,
          [clusterId]
        );
      }

      // Add user to cluster
      await this.db.query(
        `INSERT INTO household_cluster_members (cluster_id, user_id, confidence_score)
         VALUES ($1, $2, 0.85)
         ON CONFLICT (cluster_id, user_id) DO NOTHING`,
        [clusterId, userId]
      );

      // Cache cluster ID
      this.householdCache.set(userId, clusterId);

      // Create relationships with other household members
      await this.createHouseholdRelationships(userId, clusterId);

      console.log(`[RelationshipFilter] User ${userId} added to household cluster ${clusterId}`);

    } catch (error) {
      console.error('[RelationshipFilter] Error detecting household:', error);
    }
  }

  /**
   * Create relationships between household members
   */
  async createHouseholdRelationships(userId, clusterId) {
    try {
      // Get other members in cluster
      const membersResult = await this.db.query(
        `SELECT user_id FROM household_cluster_members
         WHERE cluster_id = $1 AND user_id != $2`,
        [clusterId, userId]
      );

      for (const row of membersResult.rows) {
        await this.db.query(
          `SELECT add_bidirectional_relationship(
            $1, $2, 'household', 'household_detection', 1, 0.85, true,
            $3::jsonb
          )`,
          [userId, row.user_id, JSON.stringify({ clusterId })]
        );
      }

      // Clear caches for all affected users
      this.clearCacheForUser(userId);
      membersResult.rows.forEach(r => this.clearCacheForUser(r.user_id));

    } catch (error) {
      console.error('[RelationshipFilter] Error creating household relationships:', error);
    }
  }

  /**
   * Detect surname-based relationships
   */
  async detectSurnameRelationship(user1Id, user2Id, surname1, surname2, age1, age2) {
    if (!this.db || !surname1 || !surname2) return;

    try {
      // Check if surnames match (exact or phonetic)
      const surnamesMatch = await this.surnamesMatch(surname1, surname2);

      if (!surnamesMatch) return;

      const ageDiff = Math.abs(age1 - age2);

      // Heuristic 1: Large age gap (parent/child)
      if (ageDiff >= 15 && ageDiff <= 40) {
        await this.db.query(
          `SELECT add_bidirectional_relationship(
            $1, $2, 'family', 'surname_heuristic', 2, 0.75, true,
            $3::jsonb
          )`,
          [user1Id, user2Id, JSON.stringify({
            heuristic: 'parent_child',
            ageDiff,
            surname: surname1
          })]
        );

        console.log(`[RelationshipFilter] Detected likely parent/child: ${user1Id} ↔ ${user2Id} (age diff: ${ageDiff})`);
      }

      // Heuristic 2: Small age gap (siblings)
      else if (ageDiff <= 5) {
        await this.db.query(
          `SELECT add_bidirectional_relationship(
            $1, $2, 'family', 'surname_heuristic', 2, 0.75, true,
            $3::jsonb
          )`,
          [user1Id, user2Id, JSON.stringify({
            heuristic: 'siblings',
            ageDiff,
            surname: surname1
          })]
        );

        console.log(`[RelationshipFilter] Detected likely siblings: ${user1Id} ↔ ${user2Id} (age diff: ${ageDiff})`);
      }

      // Clear caches
      this.clearCacheForUser(user1Id);
      this.clearCacheForUser(user2Id);

    } catch (error) {
      console.error('[RelationshipFilter] Error detecting surname relationship:', error);
    }
  }

  /**
   * Check if two surnames match (exact or phonetic)
   */
  async surnamesMatch(surname1, surname2) {
    if (!surname1 || !surname2) return false;

    // Exact match (case-insensitive)
    if (surname1.toLowerCase() === surname2.toLowerCase()) {
      return true;
    }

    // Check database for phonetic variants
    if (this.db) {
      const result = await this.db.query(
        `SELECT EXISTS (
          SELECT 1 FROM surname_variants
          WHERE (base_surname = $1 AND variant_surname = $2)
             OR (base_surname = $2 AND variant_surname = $1)
        ) as matches`,
        [surname1.toLowerCase(), surname2.toLowerCase()]
      );

      if (result.rows[0]?.matches) {
        return true;
      }
    }

    // Simple phonetic check (Soundex-like)
    return this.soundexMatch(surname1, surname2);
  }

  /**
   * Simple Soundex implementation for surname matching
   */
  soundexMatch(str1, str2) {
    const soundex = (str) => {
      const s = str.toUpperCase();
      if (!s) return '';

      const code = s[0];
      const mapping = {
        'B': '1', 'F': '1', 'P': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6'
      };

      let result = code;
      for (let i = 1; i < s.length && result.length < 4; i++) {
        const c = mapping[s[i]];
        if (c && c !== result[result.length - 1]) {
          result += c;
        }
      }

      return result.padEnd(4, '0');
    };

    return soundex(str1) === soundex(str2);
  }

  /**
   * Get /24 subnet from IP address (anonymize for privacy)
   */
  getSubnet(ipAddress) {
    const parts = ipAddress.split('.');
    if (parts.length === 4) {
      // IPv4: use first 3 octets (e.g., 192.168.1.0/24)
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    } else {
      // IPv6: use first 48 bits
      return ipAddress.split(':').slice(0, 3).join(':') + '::';
    }
  }

  /**
   * Get all candidates (fallback if no CollaborationMatcher)
   */
  async getAllCandidates(userId) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT user_id, email, username
         FROM users
         WHERE user_id != $1
         LIMIT 100`,
        [userId]
      );

      return result.rows.map(r => ({
        userId: r.user_id,
        email: r.email,
        username: r.username,
        score: 0.5 // Neutral score
      }));

    } catch (error) {
      console.error('[RelationshipFilter] Error getting candidates:', error);
      return [];
    }
  }

  /**
   * Clear exclusion cache for a user
   */
  clearCacheForUser(userId) {
    // Clear all cache entries involving this user
    for (const key of this.exclusionCache.keys()) {
      if (key.startsWith(`${userId}:`) || key.endsWith(`:${userId}`)) {
        this.exclusionCache.delete(key);
      }
    }

    this.householdCache.delete(userId);
  }

  /**
   * Get exclusion statistics for a user
   */
  async getExclusionStats(userId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_exclusions,
          COUNT(*) FILTER (WHERE relationship_type = 'family') as family_count,
          COUNT(*) FILTER (WHERE relationship_type = 'household') as household_count,
          COUNT(*) FILTER (WHERE relationship_type = 'blocked') as blocked_count,
          COUNT(*) FILTER (WHERE relationship_type = 'friend') as friend_count,
          COUNT(*) FILTER (WHERE is_hard_block = true) as hard_blocks,
          COUNT(*) FILTER (WHERE is_hard_block = false) as soft_filters
         FROM user_relationships
         WHERE user_id = $1`,
        [userId]
      );

      return result.rows[0];

    } catch (error) {
      console.error('[RelationshipFilter] Error getting exclusion stats:', error);
      return null;
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      cacheSize: this.exclusionCache.size,
      householdCacheSize: this.householdCache.size
    };
  }
}

module.exports = RelationshipFilter;
