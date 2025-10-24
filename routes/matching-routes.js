/**
 * Matching Routes - Family-Safe Matching API
 *
 * Provides endpoints for:
 * - Finding matches with family/relationship exclusions
 * - Manual user blocking/unblocking
 * - Importing Facebook family relationships
 * - Uploading phone contacts for exclusion
 * - Detecting household members
 * - Viewing exclusion statistics
 *
 * Privacy-preserving: Never reveals WHY a match was excluded
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * Initialize routes with database connection and filter/router
 */
function initializeRoutes(db, { relationshipFilter, relationshipRouter, collaborationMatcher } = {}) {
  if (!db) {
    throw new Error('Database connection required for matching routes');
  }

  // Backward compatibility: use relationshipRouter if available, fall back to relationshipFilter
  const matcher = relationshipRouter || relationshipFilter;

  if (!matcher) {
    console.warn('[MatchingRoutes] No relationship filter/router provided - exclusions disabled');
  }

  /**
   * GET /api/matching/find
   * Find matches for authenticated user (with configurable inclusion/exclusion mode)
   *
   * Query params:
   *   - mode: 'exclusion' (default, dating app) | 'inclusion' (family tree) | 'hybrid'
   *   - limit: Number of results (default 10, max 100)
   *   - minScore: Minimum match score (default 0.5)
   *   - includeFamilyTree: Include family tree members (inclusion mode only)
   *   - includeSphereSuggestions: Include sphere connections (inclusion mode only)
   */
  router.get('/find', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      const isDemo = req.query.demo === 'true';

      // Demo mode for browser compatibility testing
      if (!userId && isDemo) {
        const mode = req.query.mode || 'exclusion';
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);

        // Return sample data for demo mode
        const demoMatches = [
          {
            userId: 101,
            username: 'demo_user_1',
            matchScore: 85.5,
            matchedSpheres: [
              { sphere_type: 'college', sphere_value: 'Stanford', display_name: 'College', is_verified: true },
              { sphere_type: 'hobby', sphere_value: 'Photography', display_name: 'Hobby', is_verified: false }
            ],
            sharedInterests: ['AI', 'Photography', 'Travel']
          },
          {
            userId: 102,
            username: 'demo_user_2',
            matchScore: 72.3,
            matchedSpheres: [
              { sphere_type: 'college', sphere_value: 'Stanford', display_name: 'College', is_verified: true }
            ],
            sharedInterests: ['AI', 'Music']
          },
          {
            userId: 103,
            username: 'demo_user_3',
            matchScore: 68.1,
            matchedSpheres: [
              { sphere_type: 'hobby', sphere_value: 'Photography', display_name: 'Hobby', is_verified: false }
            ],
            sharedInterests: ['Photography', 'Art']
          }
        ];

        return res.json({
          matches: demoMatches.slice(0, limit),
          count: Math.min(demoMatches.length, limit),
          userId: 'demo_user',
          mode,
          demo: true,
          message: 'Demo mode - sample data for browser compatibility testing'
        });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 10, 100);
      const minScore = parseFloat(req.query.minScore) || 0.5;
      const mode = req.query.mode || 'exclusion'; // 'exclusion', 'inclusion', 'hybrid'
      const includeFamilyTree = req.query.includeFamilyTree === 'true';
      const includeSphereSuggestions = req.query.includeSphereSuggestions !== 'false';

      if (!matcher) {
        return res.json({ matches: [], count: 0, userId, mode });
      }

      const matches = await matcher.findMatches(userId, {
        limit,
        minScore,
        mode,
        includeFamilyTree,
        includeSphereSuggestions
      });

      res.json({
        matches,
        count: matches.length,
        userId,
        mode,
        includeFamilyTree,
        includeSphereSuggestions
      });

    } catch (error) {
      console.error('[Matching] Error finding matches:', error);
      res.status(500).json({
        error: 'Failed to find matches',
        details: error.message
      });
    }
  });

  /**
   * GET /api/matching/check-exclusion/:targetUserId
   * Check if current user is excluded from matching with target user
   * (For debugging - does not reveal specific reasons to end user)
   */
  router.get('/check-exclusion/:targetUserId', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const targetUserId = parseInt(req.params.targetUserId);

      if (!matcher) {
        return res.json({ isExcluded: false, message: 'Exclusion system disabled' });
      }

      const result = await matcher.isExcluded(userId, targetUserId);

      // Don't reveal specific reasons to end users (privacy)
      res.json({
        isExcluded: result.isExcluded,
        canMatch: !result.isExcluded
      });

    } catch (error) {
      console.error('[Matching] Error checking exclusion:', error);
      res.status(500).json({
        error: 'Failed to check exclusion',
        details: error.message
      });
    }
  });

  /**
   * POST /api/matching/block/:userId
   * Manually block a user
   */
  router.post('/block/:userId', async (req, res) => {
    try {
      const blockerId = req.user?.userId || req.user?.user_id;
      if (!blockerId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const blockedId = parseInt(req.params.userId);

      if (blockerId === blockedId) {
        return res.status(400).json({ error: 'Cannot block yourself' });
      }

      if (!matcher) {
        return res.status(501).json({ error: 'Blocking not available' });
      }

      await matcher.blockUser(blockerId, blockedId);

      res.json({
        success: true,
        message: 'User blocked successfully',
        blockerId,
        blockedId
      });

    } catch (error) {
      console.error('[Matching] Error blocking user:', error);
      res.status(500).json({
        error: 'Failed to block user',
        details: error.message
      });
    }
  });

  /**
   * DELETE /api/matching/block/:userId
   * Unblock a user
   */
  router.delete('/block/:userId', async (req, res) => {
    try {
      const blockerId = req.user?.userId || req.user?.user_id;
      if (!blockerId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const blockedId = parseInt(req.params.userId);

      if (!matcher) {
        return res.status(501).json({ error: 'Unblocking not available' });
      }

      await matcher.unblockUser(blockerId, blockedId);

      res.json({
        success: true,
        message: 'User unblocked successfully',
        blockerId,
        blockedId
      });

    } catch (error) {
      console.error('[Matching] Error unblocking user:', error);
      res.status(500).json({
        error: 'Failed to unblock user',
        details: error.message
      });
    }
  });

  /**
   * GET /api/matching/blocked
   * Get list of blocked users for current user
   */
  router.get('/blocked', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT ur.related_user_id, u.username, u.email, ur.created_at
         FROM user_relationships ur
         JOIN users u ON ur.related_user_id = u.user_id
         WHERE ur.user_id = $1
           AND ur.relationship_type = 'blocked'
           AND ur.relationship_source = 'manual'
         ORDER BY ur.created_at DESC`,
        [userId]
      );

      res.json({
        blockedUsers: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[Matching] Error fetching blocked users:', error);
      res.status(500).json({
        error: 'Failed to fetch blocked users',
        details: error.message
      });
    }
  });

  /**
   * POST /api/matching/import-facebook-friends
   * Import Facebook friends/family for exclusion
   *
   * Expected body: { accessToken, relationships: [{ userId, type, name }] }
   */
  router.post('/import-facebook-friends', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { relationships } = req.body;

      if (!Array.isArray(relationships)) {
        return res.status(400).json({ error: 'relationships must be an array' });
      }

      let imported = 0;
      let familyCount = 0;
      let friendCount = 0;

      for (const rel of relationships) {
        const { facebookId, type, name } = rel;

        if (!facebookId || !type) continue;

        // Find user by Facebook ID (would need facebook_id column in users table)
        const userResult = await db.query(
          `SELECT user_id FROM users WHERE facebook_id = $1 LIMIT 1`,
          [facebookId]
        );

        if (userResult.rows.length === 0) continue;

        const relatedUserId = userResult.rows[0].user_id;

        // Determine relationship type and blocking level
        let relType = 'friend';
        let isHardBlock = false;
        let degree = 1;

        if (type === 'family' || type === 'immediate_family') {
          relType = 'family';
          isHardBlock = true;
          degree = 1;
          familyCount++;
        } else if (type === 'friend') {
          relType = 'friend';
          isHardBlock = false;
          degree = 1;
          friendCount++;
        } else if (type === 'friend_of_friend') {
          relType = 'friend';
          isHardBlock = false;
          degree = 2;
        }

        // Add bidirectional relationship
        await db.query(
          `SELECT add_bidirectional_relationship(
            $1, $2, $3, 'facebook', $4, 0.95, $5, $6::jsonb
          )`,
          [
            userId,
            relatedUserId,
            relType,
            degree,
            isHardBlock,
            JSON.stringify({ facebookId, name, type })
          ]
        );

        imported++;
      }

      res.json({
        success: true,
        message: 'Facebook relationships imported',
        imported,
        family: familyCount,
        friends: friendCount
      });

    } catch (error) {
      console.error('[Matching] Error importing Facebook friends:', error);
      res.status(500).json({
        error: 'Failed to import Facebook friends',
        details: error.message
      });
    }
  });

  /**
   * POST /api/matching/import-phone-contacts
   * Upload phone contacts for exclusion (privacy-preserving via hashing)
   *
   * Expected body: { contacts: [{ phone, email }] }
   */
  router.post('/import-phone-contacts', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { contacts } = req.body;

      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: 'contacts must be an array' });
      }

      let uploaded = 0;
      let matched = 0;

      for (const contact of contacts) {
        const { phone, email } = contact;

        // Hash phone number
        if (phone) {
          const phoneHash = crypto.createHash('sha256')
            .update(phone.toLowerCase().trim())
            .digest('hex');

          await db.query(
            `INSERT INTO contact_hashes (user_id, contact_hash, contact_type)
             VALUES ($1, $2, 'phone')
             ON CONFLICT (user_id, contact_hash) DO NOTHING`,
            [userId, phoneHash]
          );

          uploaded++;

          // Find matches
          const matchResult = await db.query(
            `SELECT DISTINCT u.user_id
             FROM contact_hashes ch
             JOIN users u ON ch.user_id = u.user_id
             WHERE ch.contact_hash = $1
               AND ch.user_id != $2`,
            [phoneHash, userId]
          );

          // Create relationships with matched users
          for (const row of matchResult.rows) {
            await db.query(
              `SELECT add_bidirectional_relationship(
                $1, $2, 'friend', 'phone_contacts', 1, 0.90, false, '{}'
              )`,
              [userId, row.user_id]
            );

            matched++;
          }
        }

        // Hash email
        if (email) {
          const emailHash = crypto.createHash('sha256')
            .update(email.toLowerCase().trim())
            .digest('hex');

          await db.query(
            `INSERT INTO contact_hashes (user_id, contact_hash, contact_type)
             VALUES ($1, $2, 'email')
             ON CONFLICT (user_id, contact_hash) DO NOTHING`,
            [userId, emailHash]
          );

          uploaded++;

          // Find matches
          const matchResult = await db.query(
            `SELECT DISTINCT u.user_id
             FROM contact_hashes ch
             JOIN users u ON ch.user_id = u.user_id
             WHERE ch.contact_hash = $1
               AND ch.user_id != $2`,
            [emailHash, userId]
          );

          // Create relationships with matched users
          for (const row of matchResult.rows) {
            await db.query(
              `SELECT add_bidirectional_relationship(
                $1, $2, 'friend', 'phone_contacts', 1, 0.90, false, '{}'
              )`,
              [userId, row.user_id]
            );

            matched++;
          }
        }
      }

      res.json({
        success: true,
        message: 'Phone contacts uploaded',
        uploaded,
        matched,
        note: 'Contacts are hashed for privacy - originals not stored'
      });

    } catch (error) {
      console.error('[Matching] Error importing phone contacts:', error);
      res.status(500).json({
        error: 'Failed to import phone contacts',
        details: error.message
      });
    }
  });

  /**
   * POST /api/matching/detect-household
   * Trigger household detection for current user (uses IP from request)
   */
  router.post('/detect-household', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get IP address from request
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                        req.connection?.remoteAddress ||
                        req.socket?.remoteAddress ||
                        '0.0.0.0';

      if (!matcher) {
        return res.status(501).json({ error: 'Household detection not available' });
      }

      await matcher.detectHousehold(userId, ipAddress, {
        userAgent: req.headers['user-agent'],
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Household detection complete',
        ipAddress: ipAddress.split('.').slice(0, -1).join('.') + '.x' // Anonymize last octet
      });

    } catch (error) {
      console.error('[Matching] Error detecting household:', error);
      res.status(500).json({
        error: 'Failed to detect household',
        details: error.message
      });
    }
  });

  /**
   * GET /api/matching/exclusion-stats
   * Get exclusion statistics for current user
   */
  router.get('/exclusion-stats', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!matcher) {
        return res.json({ message: 'Exclusion system disabled' });
      }

      const stats = await matcher.getExclusionStats(userId);

      res.json({
        ...stats,
        userId,
        note: 'Specific exclusions are not revealed for privacy'
      });

    } catch (error) {
      console.error('[Matching] Error fetching exclusion stats:', error);
      res.status(500).json({
        error: 'Failed to fetch exclusion stats',
        details: error.message
      });
    }
  });

  /**
   * GET /api/matching/system-stats (Admin only)
   * Get system-wide matching statistics
   */
  router.get('/system-stats', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // TODO: Add admin check

      const result = await db.query(`
        SELECT * FROM relationship_stats
        ORDER BY relationship_count DESC
      `);

      const householdResult = await db.query(`
        SELECT
          COUNT(*) as total_clusters,
          SUM(member_count) as total_members,
          AVG(member_count)::DECIMAL(4,2) as avg_cluster_size,
          MAX(member_count) as max_cluster_size
        FROM household_clusters
        WHERE member_count > 1
      `);

      res.json({
        relationships: result.rows,
        households: householdResult.rows[0]
      });

    } catch (error) {
      console.error('[Matching] Error fetching system stats:', error);
      res.status(500).json({
        error: 'Failed to fetch system stats',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };
