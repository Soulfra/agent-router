/**
 * Sphere Routes - Multi-Dimensional Social Grouping
 *
 * Provides endpoints for:
 * - Joining/leaving spheres (college, company, city, interests)
 * - Email domain verification (.edu, company domains)
 * - Finding users in spheres
 * - Sphere-based matching with OR/AND logic
 * - Sphere analytics (data brokering)
 *
 * Similar to Snapchat college stories, LinkedIn alumni networks, etc.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with database connection and relationship router
 */
function initializeRoutes(db, { relationshipRouter } = {}) {
  if (!db) {
    throw new Error('Database connection required for sphere routes');
  }

  if (!relationshipRouter) {
    console.warn('[SphereRoutes] No relationship router provided - limited functionality');
  }

  /**
   * GET /api/spheres/definitions
   * Get all available sphere types
   */
  router.get('/definitions', async (req, res) => {
    try {
      const result = await db.query(
        `SELECT
          sphere_def_id,
          sphere_type,
          display_name,
          description,
          verification_required,
          verification_method,
          pricing_tier,
          is_active
        FROM sphere_definitions
        WHERE is_active = true
        ORDER BY sphere_type`
      );

      res.json({
        sphereTypes: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[Spheres] Error fetching definitions:', error);
      res.status(500).json({
        error: 'Failed to fetch sphere definitions',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/my-spheres
   * Get all spheres the authenticated user is a member of
   */
  router.get('/my-spheres', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT
          us.user_sphere_id,
          sd.sphere_type,
          sd.display_name,
          us.sphere_value,
          us.is_verified,
          us.verification_method,
          us.is_public,
          us.is_primary,
          us.membership_score,
          us.joined_at
        FROM user_spheres us
        INNER JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
        WHERE us.user_id = $1
        ORDER BY us.is_primary DESC, us.joined_at DESC`,
        [userId]
      );

      res.json({
        spheres: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[Spheres] Error fetching user spheres:', error);
      res.status(500).json({
        error: 'Failed to fetch user spheres',
        details: error.message
      });
    }
  });

  /**
   * POST /api/spheres/join
   * Join a sphere
   *
   * Body: {
   *   sphereType: 'college' | 'company' | 'city' | 'interest' | etc.,
   *   sphereValue: 'stanford.edu' | 'San Francisco' | 'software_engineer' | etc.,
   *   isPublic: true | false,
   *   isPrimary: true | false,
   *   metadata: { major: 'CS', graduationYear: 2020 }
   * }
   */
  router.post('/join', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { sphereType, sphereValue, isPublic = true, isPrimary = false, metadata = {} } = req.body;

      if (!sphereType || !sphereValue) {
        return res.status(400).json({ error: 'sphereType and sphereValue are required' });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Sphere joining not available' });
      }

      const result = await relationshipRouter.joinSphere(userId, sphereType, sphereValue, {
        isVerified: false, // Will be verified separately via email
        verificationMethod: 'manual',
        metadata,
        isPublic,
        isPrimary
      });

      res.json({
        success: true,
        message: 'Joined sphere successfully',
        ...result
      });

    } catch (error) {
      console.error('[Spheres] Error joining sphere:', error);
      res.status(500).json({
        error: 'Failed to join sphere',
        details: error.message
      });
    }
  });

  /**
   * POST /api/spheres/verify-email
   * Verify sphere membership via email domain
   *
   * Body: {
   *   email: 'user@stanford.edu',
   *   sphereType: 'college'
   * }
   */
  router.post('/verify-email', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { email, sphereType } = req.body;

      if (!email || !sphereType) {
        return res.status(400).json({ error: 'email and sphereType are required' });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Email verification not available' });
      }

      const result = await relationshipRouter.verifySphereByEmail(userId, email, sphereType);

      res.json({
        success: true,
        message: 'Email verified and sphere joined',
        ...result
      });

    } catch (error) {
      console.error('[Spheres] Error verifying email:', error);
      res.status(500).json({
        error: 'Failed to verify email',
        details: error.message
      });
    }
  });

  /**
   * DELETE /api/spheres/:sphereId
   * Leave a sphere
   */
  router.delete('/:sphereId', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sphereId = parseInt(req.params.sphereId);

      // Check ownership
      const checkResult = await db.query(
        'SELECT * FROM user_spheres WHERE user_sphere_id = $1 AND user_id = $2',
        [sphereId, userId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to leave this sphere' });
      }

      // Delete sphere membership
      await db.query(
        'DELETE FROM user_spheres WHERE user_sphere_id = $1',
        [sphereId]
      );

      res.json({
        success: true,
        message: 'Left sphere successfully',
        sphereId
      });

    } catch (error) {
      console.error('[Spheres] Error leaving sphere:', error);
      res.status(500).json({
        error: 'Failed to leave sphere',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/find-users
   * Find users in a specific sphere
   *
   * Query params:
   *   - sphereType: 'college' | 'company' | etc.
   *   - sphereValue: 'stanford.edu' | 'San Francisco' | etc.
   *   - verifiedOnly: true | false
   */
  router.get('/find-users', async (req, res) => {
    try {
      const { sphereType, sphereValue, verifiedOnly = 'false' } = req.query;

      if (!sphereType || !sphereValue) {
        return res.status(400).json({ error: 'sphereType and sphereValue are required' });
      }

      const verified = verifiedOnly === 'true';

      const result = await db.query(
        'SELECT * FROM find_users_in_sphere($1, $2, $3)',
        [sphereType, sphereValue, verified]
      );

      res.json({
        users: result.rows,
        count: result.rows.length,
        sphereType,
        sphereValue,
        verifiedOnly: verified
      });

    } catch (error) {
      console.error('[Spheres] Error finding users:', error);
      res.status(500).json({
        error: 'Failed to find users',
        details: error.message
      });
    }
  });

  /**
   * POST /api/spheres/match
   * Find matches using flexible OR/AND sphere logic
   *
   * Body: {
   *   filters: [
   *     { sphereType: 'college', sphereValue: 'stanford.edu', operator: 'OR' },
   *     { sphereType: 'city', sphereValue: 'San Francisco', operator: 'AND' }
   *   ],
   *   limit: 50
   * }
   *
   * Example: "Find users from stanford.edu OR (in San Francisco AND graduation year 2020)"
   */
  router.post('/match', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { filters = [], limit = 50 } = req.body;

      if (!Array.isArray(filters)) {
        return res.status(400).json({ error: 'filters must be an array' });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Sphere matching not available' });
      }

      // Validate filters
      for (const filter of filters) {
        if (!filter.sphereType || !filter.sphereValue) {
          return res.status(400).json({ error: 'Each filter must have sphereType and sphereValue' });
        }

        if (!['OR', 'AND'].includes(filter.operator)) {
          return res.status(400).json({ error: 'operator must be OR or AND' });
        }
      }

      const matches = await relationshipRouter.findSphereMatches(userId, filters);

      res.json({
        matches: matches.slice(0, limit),
        count: Math.min(matches.length, limit),
        totalMatches: matches.length,
        filters
      });

    } catch (error) {
      console.error('[Spheres] Error matching by spheres:', error);
      res.status(500).json({
        error: 'Failed to match by spheres',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/connections
   * Get all sphere connections for authenticated user
   * (Users connected through shared spheres)
   */
  router.get('/connections', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT
          sc.connection_id,
          sc.user2_id as connected_user_id,
          u.username,
          u.email,
          sd.sphere_type,
          sd.display_name,
          sc.sphere_value,
          sc.connection_strength,
          sc.discovered_at
        FROM sphere_connections sc
        INNER JOIN users u ON sc.user2_id = u.user_id
        INNER JOIN sphere_definitions sd ON sc.sphere_def_id = sd.sphere_def_id
        WHERE sc.user1_id = $1
        ORDER BY sc.connection_strength DESC, sc.discovered_at DESC
        LIMIT 100`,
        [userId]
      );

      res.json({
        connections: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('[Spheres] Error fetching connections:', error);
      res.status(500).json({
        error: 'Failed to fetch sphere connections',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/popular
   * Get most popular spheres (for discovery)
   *
   * Query params:
   *   - sphereType: Optional filter by type
   *   - limit: Number of results (default 20)
   */
  router.get('/popular', async (req, res) => {
    try {
      const { sphereType, limit = 20 } = req.query;

      let query = `
        SELECT
          sd.sphere_type,
          sd.display_name,
          sms.sphere_value,
          sms.member_count,
          sms.verified_count,
          sms.avg_membership_score
        FROM sphere_membership_summary sms
        INNER JOIN sphere_definitions sd ON sms.sphere_type = sd.sphere_type
        WHERE 1=1
      `;

      const params = [];

      if (sphereType) {
        query += ' AND sms.sphere_type = $1';
        params.push(sphereType);
      }

      query += ` ORDER BY sms.member_count DESC LIMIT ${parseInt(limit)}`;

      const result = await db.query(query, params);

      res.json({
        popularSpheres: result.rows,
        count: result.rows.length,
        sphereType: sphereType || 'all'
      });

    } catch (error) {
      console.error('[Spheres] Error fetching popular spheres:', error);
      res.status(500).json({
        error: 'Failed to fetch popular spheres',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/analytics/:sphereType/:sphereValue
   * Get analytics for a specific sphere (data brokering)
   *
   * Admin or verified members only
   */
  router.get('/analytics/:sphereType/:sphereValue', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { sphereType, sphereValue } = req.params;
      const days = Math.min(parseInt(req.query.days) || 30, 365);

      // Get sphere definition
      const sphereDefResult = await db.query(
        'SELECT sphere_def_id FROM sphere_definitions WHERE sphere_type = $1',
        [sphereType]
      );

      if (sphereDefResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sphere type not found' });
      }

      const sphereDefId = sphereDefResult.rows[0].sphere_def_id;

      // Check if user is a member of this sphere
      const memberResult = await db.query(
        `SELECT * FROM user_spheres
         WHERE user_id = $1 AND sphere_def_id = $2 AND sphere_value = $3`,
        [userId, sphereDefId, sphereValue]
      );

      if (memberResult.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this sphere' });
      }

      // Get analytics
      const analyticsResult = await db.query(
        `SELECT
          metric_date,
          total_members,
          verified_members,
          new_members_today,
          active_members_7d,
          connection_count,
          engagement_score
        FROM sphere_analytics
        WHERE sphere_def_id = $1
          AND sphere_value = $2
          AND metric_date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY metric_date DESC`,
        [sphereDefId, sphereValue]
      );

      // Get summary stats
      const summaryResult = await db.query(
        `SELECT
          COUNT(*) as total_members,
          COUNT(*) FILTER (WHERE is_verified = true) as verified_members,
          AVG(membership_score)::DECIMAL(3, 2) as avg_membership_score
        FROM user_spheres
        WHERE sphere_def_id = $1 AND sphere_value = $2`,
        [sphereDefId, sphereValue]
      );

      res.json({
        sphereType,
        sphereValue,
        summary: summaryResult.rows[0],
        analytics: analyticsResult.rows,
        days
      });

    } catch (error) {
      console.error('[Spheres] Error fetching analytics:', error);
      res.status(500).json({
        error: 'Failed to fetch sphere analytics',
        details: error.message
      });
    }
  });

  /**
   * POST /api/spheres/sync-connections
   * Trigger batch sync of sphere connections
   * (Admin only - updates sphere_connections table)
   */
  router.post('/sync-connections', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // TODO: Add admin check

      const { sphereType, sphereValue } = req.body;

      if (!sphereType || !sphereValue) {
        return res.status(400).json({ error: 'sphereType and sphereValue are required' });
      }

      // Get sphere definition
      const sphereDefResult = await db.query(
        'SELECT sphere_def_id FROM sphere_definitions WHERE sphere_type = $1',
        [sphereType]
      );

      if (sphereDefResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sphere type not found' });
      }

      const sphereDefId = sphereDefResult.rows[0].sphere_def_id;

      // Sync connections
      const result = await db.query(
        'SELECT sync_sphere_connections($1, $2) as connection_count',
        [sphereDefId, sphereValue]
      );

      const connectionCount = result.rows[0]?.connection_count || 0;

      res.json({
        success: true,
        message: 'Sphere connections synced',
        sphereType,
        sphereValue,
        connectionsCreated: connectionCount
      });

    } catch (error) {
      console.error('[Spheres] Error syncing connections:', error);
      res.status(500).json({
        error: 'Failed to sync sphere connections',
        details: error.message
      });
    }
  });

  /**
   * GET /api/spheres/suggestions
   * Get sphere join suggestions for authenticated user
   * Based on profile, contacts, email domain, etc.
   */
  router.get('/suggestions', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get user's email domain
      const userResult = await db.query(
        'SELECT email FROM users WHERE user_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const email = userResult.rows[0].email;
      const domain = email.split('@')[1]?.toLowerCase();

      const suggestions = [];

      // Suggest .edu spheres based on email domain
      if (domain && domain.endsWith('.edu')) {
        suggestions.push({
          sphereType: 'college',
          sphereValue: domain,
          reason: 'Email domain matches',
          canVerify: true
        });
      }

      // Suggest popular spheres in user's existing networks
      const popularInNetwork = await db.query(
        `SELECT DISTINCT
          sd.sphere_type,
          us2.sphere_value,
          COUNT(*) as connection_count
        FROM sphere_connections sc
        INNER JOIN user_spheres us2 ON sc.user2_id = us2.user_id
        INNER JOIN sphere_definitions sd ON us2.sphere_def_id = sd.sphere_def_id
        WHERE sc.user1_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM user_spheres us1
            WHERE us1.user_id = $1
              AND us1.sphere_def_id = us2.sphere_def_id
              AND us1.sphere_value = us2.sphere_value
          )
        GROUP BY sd.sphere_type, us2.sphere_value
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
        LIMIT 10`,
        [userId]
      );

      for (const row of popularInNetwork.rows) {
        suggestions.push({
          sphereType: row.sphere_type,
          sphereValue: row.sphere_value,
          reason: `${row.connection_count} connections in this sphere`,
          canVerify: false
        });
      }

      res.json({
        suggestions,
        count: suggestions.length
      });

    } catch (error) {
      console.error('[Spheres] Error fetching suggestions:', error);
      res.status(500).json({
        error: 'Failed to fetch sphere suggestions',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };
