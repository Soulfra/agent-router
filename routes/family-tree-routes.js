/**
 * Family Tree Routes - Ancestry.com Style Family Discovery
 *
 * Provides endpoints for:
 * - Viewing family tree (ancestors, descendants, siblings)
 * - Adding family relationships
 * - DNA test integration (23andMe, Ancestry.com)
 * - Family discovery suggestions
 * - Privacy controls for family visibility
 *
 * Privacy-first: Users control who can see their family connections
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with database connection and relationship router
 */
function initializeRoutes(db, { relationshipRouter } = {}) {
  if (!db) {
    throw new Error('Database connection required for family tree routes');
  }

  if (!relationshipRouter) {
    console.warn('[FamilyTreeRoutes] No relationship router provided - limited functionality');
  }

  /**
   * GET /api/family-tree/me
   * Get authenticated user's complete family tree
   */
  router.get('/me', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const maxGenerations = Math.min(parseInt(req.query.maxGenerations) || 5, 10);

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Family tree not available' });
      }

      const familyMembers = await relationshipRouter.getFamilyMembers(userId, maxGenerations);

      // Group by relationship type
      const grouped = {
        ancestors: familyMembers.filter(m => m.relationship_type === 'ancestor'),
        descendants: familyMembers.filter(m => m.relationship_type === 'descendant'),
        siblings: familyMembers.filter(m => m.relationship_type === 'sibling')
      };

      res.json({
        userId,
        maxGenerations,
        totalFamily: familyMembers.length,
        ancestors: grouped.ancestors.length,
        descendants: grouped.descendants.length,
        siblings: grouped.siblings.length,
        familyTree: grouped
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching family tree:', error);
      res.status(500).json({
        error: 'Failed to fetch family tree',
        details: error.message
      });
    }
  });

  /**
   * GET /api/family-tree/ancestors
   * Get all ancestors (parents, grandparents, etc.)
   */
  router.get('/ancestors', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const maxGenerations = Math.min(parseInt(req.query.maxGenerations) || 5, 10);

      const result = await db.query(
        'SELECT * FROM get_ancestors($1, $2)',
        [userId, maxGenerations]
      );

      // Enrich with user details
      const ancestors = [];
      for (const row of result.rows) {
        const userResult = await db.query(
          'SELECT user_id, username, email FROM users WHERE user_id = $1',
          [row.ancestor_id]
        );

        if (userResult.rows.length > 0) {
          ancestors.push({
            ...userResult.rows[0],
            generationDiff: row.generation_diff,
            relationshipPath: row.relationship_path
          });
        }
      }

      res.json({
        ancestors,
        count: ancestors.length,
        maxGenerations
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching ancestors:', error);
      res.status(500).json({
        error: 'Failed to fetch ancestors',
        details: error.message
      });
    }
  });

  /**
   * GET /api/family-tree/descendants
   * Get all descendants (children, grandchildren, etc.)
   */
  router.get('/descendants', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const maxGenerations = Math.min(parseInt(req.query.maxGenerations) || 5, 10);

      const result = await db.query(
        'SELECT * FROM get_descendants($1, $2)',
        [userId, maxGenerations]
      );

      // Enrich with user details
      const descendants = [];
      for (const row of result.rows) {
        const userResult = await db.query(
          'SELECT user_id, username, email FROM users WHERE user_id = $1',
          [row.descendant_id]
        );

        if (userResult.rows.length > 0) {
          descendants.push({
            ...userResult.rows[0],
            generationDiff: row.generation_diff,
            relationshipPath: row.relationship_path
          });
        }
      }

      res.json({
        descendants,
        count: descendants.length,
        maxGenerations
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching descendants:', error);
      res.status(500).json({
        error: 'Failed to fetch descendants',
        details: error.message
      });
    }
  });

  /**
   * POST /api/family-tree/add-parent
   * Add a parent relationship
   *
   * Body: { parentId, label: 'mother'|'father'|'parent' }
   */
  router.post('/add-parent', async (req, res) => {
    try {
      const childId = req.user?.userId || req.user?.user_id;
      if (!childId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { parentId, label } = req.body;

      if (!parentId || !label) {
        return res.status(400).json({ error: 'parentId and label are required' });
      }

      if (childId === parentId) {
        return res.status(400).json({ error: 'Cannot add yourself as parent' });
      }

      if (!['mother', 'father', 'parent'].includes(label)) {
        return res.status(400).json({ error: 'Invalid label. Must be: mother, father, or parent' });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Family tree not available' });
      }

      await relationshipRouter.addFamilyRelationship(
        parentId,
        childId,
        label,
        'manual',
        { confidence: 1.0 }
      );

      res.json({
        success: true,
        message: 'Parent added successfully',
        parentId,
        childId,
        label
      });

    } catch (error) {
      console.error('[FamilyTree] Error adding parent:', error);
      res.status(500).json({
        error: 'Failed to add parent',
        details: error.message
      });
    }
  });

  /**
   * POST /api/family-tree/add-child
   * Add a child relationship
   *
   * Body: { childId, label: 'son'|'daughter'|'child' }
   */
  router.post('/add-child', async (req, res) => {
    try {
      const parentId = req.user?.userId || req.user?.user_id;
      if (!parentId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { childId, label } = req.body;

      if (!childId || !label) {
        return res.status(400).json({ error: 'childId and label are required' });
      }

      if (parentId === childId) {
        return res.status(400).json({ error: 'Cannot add yourself as child' });
      }

      if (!['son', 'daughter', 'child'].includes(label)) {
        return res.status(400).json({ error: 'Invalid label. Must be: son, daughter, or child' });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'Family tree not available' });
      }

      await relationshipRouter.addFamilyRelationship(
        parentId,
        childId,
        label,
        'manual',
        { confidence: 1.0 }
      );

      res.json({
        success: true,
        message: 'Child added successfully',
        parentId,
        childId,
        label
      });

    } catch (error) {
      console.error('[FamilyTree] Error adding child:', error);
      res.status(500).json({
        error: 'Failed to add child',
        details: error.message
      });
    }
  });

  /**
   * DELETE /api/family-tree/relationship/:relationshipId
   * Remove a family relationship
   */
  router.delete('/relationship/:relationshipId', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const relationshipId = parseInt(req.params.relationshipId);

      // Check ownership (user must be parent or child in relationship)
      const checkResult = await db.query(
        `SELECT * FROM family_tree
         WHERE tree_id = $1
           AND (parent_user_id = $2 OR child_user_id = $2)`,
        [relationshipId, userId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized to delete this relationship' });
      }

      // Delete relationship
      await db.query(
        'DELETE FROM family_tree WHERE tree_id = $1',
        [relationshipId]
      );

      res.json({
        success: true,
        message: 'Relationship deleted successfully',
        relationshipId
      });

    } catch (error) {
      console.error('[FamilyTree] Error deleting relationship:', error);
      res.status(500).json({
        error: 'Failed to delete relationship',
        details: error.message
      });
    }
  });

  /**
   * GET /api/family-tree/dna-matches
   * Get DNA test matches (23andMe, Ancestry.com, etc.)
   */
  router.get('/dna-matches', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const provider = req.query.provider; // Optional filter

      let query = `
        SELECT
          dm.dna_match_id,
          dm.matched_user_id,
          u.username,
          u.email,
          dm.dna_provider,
          dm.shared_dna_percentage,
          dm.shared_centimorgans,
          dm.predicted_relationship,
          dm.confidence_level,
          dm.match_date
        FROM dna_matches dm
        INNER JOIN users u ON dm.matched_user_id = u.user_id
        WHERE dm.user_id = $1
      `;

      const params = [userId];

      if (provider) {
        query += ' AND dm.dna_provider = $2';
        params.push(provider);
      }

      query += ' ORDER BY dm.shared_dna_percentage DESC';

      const result = await db.query(query, params);

      res.json({
        dnaMatches: result.rows,
        count: result.rows.length,
        provider: provider || 'all'
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching DNA matches:', error);
      res.status(500).json({
        error: 'Failed to fetch DNA matches',
        details: error.message
      });
    }
  });

  /**
   * POST /api/family-tree/import-dna
   * Import DNA test results from 23andMe, Ancestry.com, etc.
   *
   * Body: {
   *   provider: '23andme' | 'ancestry' | 'myheritage' | 'ftdna',
   *   matches: [{
   *     matchedUserId,
   *     sharedDNA,
   *     sharedCentimorgans,
   *     predictedRelationship,
   *     confidenceLevel,
   *     providerMatchId,
   *     metadata
   *   }]
   * }
   */
  router.post('/import-dna', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { provider, matches } = req.body;

      if (!provider || !matches || !Array.isArray(matches)) {
        return res.status(400).json({ error: 'provider and matches array are required' });
      }

      const validProviders = ['23andme', 'ancestry', 'myheritage', 'ftdna'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
      }

      if (!relationshipRouter) {
        return res.status(501).json({ error: 'DNA import not available' });
      }

      const result = await relationshipRouter.importDNAMatches(userId, provider, matches);

      res.json({
        success: true,
        message: 'DNA matches imported successfully',
        ...result
      });

    } catch (error) {
      console.error('[FamilyTree] Error importing DNA matches:', error);
      res.status(500).json({
        error: 'Failed to import DNA matches',
        details: error.message
      });
    }
  });

  /**
   * GET /api/family-tree/suggestions
   * Get family discovery suggestions based on surname, age, location, etc.
   */
  router.get('/suggestions', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get current user's profile
      const userResult = await db.query(
        'SELECT username, email FROM users WHERE user_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Find potential family members via:
      // 1. Same surname (from user_relationships with surname_heuristic source)
      // 2. Phone contacts
      // 3. Facebook friends marked as family

      const suggestions = await db.query(
        `SELECT DISTINCT
          ur.related_user_id,
          u.username,
          u.email,
          ur.relationship_type,
          ur.relationship_source,
          ur.confidence_score,
          ur.metadata
        FROM user_relationships ur
        INNER JOIN users u ON ur.related_user_id = u.user_id
        WHERE ur.user_id = $1
          AND ur.relationship_type = 'family'
          AND ur.relationship_source IN ('surname_heuristic', 'facebook')
          AND NOT EXISTS (
            -- Exclude users already in family tree
            SELECT 1 FROM family_tree ft
            WHERE (ft.parent_user_id = $1 AND ft.child_user_id = ur.related_user_id)
               OR (ft.child_user_id = $1 AND ft.parent_user_id = ur.related_user_id)
          )
        ORDER BY ur.confidence_score DESC
        LIMIT 20`,
        [userId]
      );

      res.json({
        suggestions: suggestions.rows,
        count: suggestions.rows.length
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching suggestions:', error);
      res.status(500).json({
        error: 'Failed to fetch suggestions',
        details: error.message
      });
    }
  });

  /**
   * GET /api/family-tree/stats
   * Get family tree statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Count family members by type
      const familyStats = await db.query(
        `SELECT * FROM get_all_family($1, 10)`,
        [userId]
      );

      const dnaStats = await db.query(
        `SELECT
          COUNT(*) as total_dna_matches,
          COUNT(DISTINCT dna_provider) as providers_used,
          AVG(shared_dna_percentage)::DECIMAL(5,2) as avg_shared_dna
        FROM dna_matches
        WHERE user_id = $1`,
        [userId]
      );

      const treeStats = await db.query(
        `SELECT
          COUNT(*) FILTER (WHERE relationship_label IN ('mother', 'father', 'parent')) as parents,
          COUNT(*) FILTER (WHERE relationship_label IN ('son', 'daughter', 'child')) as children,
          MAX(generation_diff) as max_ancestor_generations
        FROM family_tree
        WHERE parent_user_id = $1 OR child_user_id = $1`,
        [userId]
      );

      res.json({
        totalFamily: familyStats.rows.length,
        ancestors: familyStats.rows.filter(m => m.relationship_type === 'ancestor').length,
        descendants: familyStats.rows.filter(m => m.relationship_type === 'descendant').length,
        siblings: familyStats.rows.filter(m => m.relationship_type === 'sibling').length,
        dna: dnaStats.rows[0],
        tree: treeStats.rows[0]
      });

    } catch (error) {
      console.error('[FamilyTree] Error fetching stats:', error);
      res.status(500).json({
        error: 'Failed to fetch stats',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };
