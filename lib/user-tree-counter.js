/**
 * User Tree Counter
 *
 * Tracks user progress through decision trees, knowledge graphs, and learning paths.
 * Like tracking a player's progress through a skill tree in a game.
 *
 * Features:
 * - Track which branches users explore
 * - Identify bottlenecks (where users get stuck)
 * - Map successful paths vs dead ends
 * - Calculate completion rates
 * - Find optimal learning sequences
 *
 * Use Cases:
 * - Show progress bars/achievements
 * - Recommend next steps
 * - Identify confusing content
 * - Optimize learning paths
 */

const { Pool } = require('pg');

class UserTreeCounter {
  constructor(config = {}) {
    // Use passed pool/db if provided, otherwise create new connection
    if (config.pool || config.db) {
      this.pool = config.pool || config.db;
      console.log('[UserTreeCounter] Initialized (using passed pool)');
    } else {
      this.pool = new Pool({
        connectionString: config.databaseUrl || process.env.DATABASE_URL
      });
      console.log('[UserTreeCounter] Initialized (created new pool)');
    }
  }

  /**
   * Record node visit in a tree
   */
  async visitNode(data) {
    const {
      userId,
      identityId,
      treeId,      // 'launch-website', 'learn-git', etc.
      nodeId,      // 'setup-domain', 'first-commit', etc.
      nodeType = 'step', // 'step', 'milestone', 'checkpoint', 'decision'
      metadata = {},
      timestamp = new Date()
    } = data;

    try {
      // Record visit
      const result = await this.pool.query(`
        INSERT INTO tree_node_visits (
          user_id,
          identity_id,
          tree_id,
          node_id,
          node_type,
          metadata,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        userId,
        identityId,
        treeId,
        nodeId,
        nodeType,
        JSON.stringify(metadata),
        timestamp
      ]);

      // Update tree progress
      await this._updateTreeProgress(userId || identityId, treeId);

      return result.rows[0];

    } catch (error) {
      console.error('[UserTreeCounter] Error recording node visit:', error);
      throw error;
    }
  }

  /**
   * Mark node as completed
   */
  async completeNode(data) {
    const {
      userId,
      identityId,
      treeId,
      nodeId,
      metadata = {},
      timestamp = new Date()
    } = data;

    try {
      // Record completion
      const result = await this.pool.query(`
        INSERT INTO tree_node_completions (
          user_id,
          identity_id,
          tree_id,
          node_id,
          metadata,
          completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, tree_id, node_id)
        DO UPDATE SET
          completed_at = $6,
          metadata = $5
        RETURNING id
      `, [
        userId,
        identityId,
        treeId,
        nodeId,
        JSON.stringify(metadata),
        timestamp
      ]);

      // Update tree progress
      await this._updateTreeProgress(userId || identityId, treeId);

      return result.rows[0];

    } catch (error) {
      console.error('[UserTreeCounter] Error marking completion:', error);
      throw error;
    }
  }

  /**
   * Get user's progress in a tree
   */
  async getTreeProgress(userIdOrIdentity, treeId) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM user_tree_progress
        WHERE (user_id = $1 OR identity_id = $1)
          AND tree_id = $2
      `, [userIdOrIdentity, treeId]);

      if (result.rows.length === 0) {
        return {
          tree_id: treeId,
          nodes_visited: 0,
          nodes_completed: 0,
          nodes_total: 0,
          completion_rate: 0,
          last_node: null
        };
      }

      return result.rows[0];

    } catch (error) {
      console.error('[UserTreeCounter] Error getting progress:', error);
      return null;
    }
  }

  /**
   * Get all trees for a user
   */
  async getAllProgress(userIdOrIdentity) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM user_tree_progress
        WHERE user_id = $1 OR identity_id = $1
        ORDER BY last_activity DESC
      `, [userIdOrIdentity]);

      return result.rows;

    } catch (error) {
      console.error('[UserTreeCounter] Error getting all progress:', error);
      return [];
    }
  }

  /**
   * Analyze bottlenecks in a tree
   */
  async analyzeBottlenecks(treeId, options = {}) {
    const {
      minUsers = 5,  // Minimum users to consider
      threshold = 0.5 // % who get stuck
    } = options;

    try {
      // Get all visits and completions for this tree
      const visits = await this.pool.query(`
        SELECT
          node_id,
          COUNT(DISTINCT user_id) as visit_count
        FROM tree_node_visits
        WHERE tree_id = $1
        GROUP BY node_id
      `, [treeId]);

      const completions = await this.pool.query(`
        SELECT
          node_id,
          COUNT(DISTINCT user_id) as completion_count
        FROM tree_node_completions
        WHERE tree_id = $1
        GROUP BY node_id
      `, [treeId]);

      // Build completion rate map
      const completionMap = {};
      for (const row of completions.rows) {
        completionMap[row.node_id] = parseInt(row.completion_count);
      }

      // Find bottlenecks
      const bottlenecks = [];

      for (const visit of visits.rows) {
        const visitCount = parseInt(visit.visit_count);
        const completionCount = completionMap[visit.node_id] || 0;

        if (visitCount >= minUsers) {
          const completionRate = completionCount / visitCount;

          if (completionRate < threshold) {
            bottlenecks.push({
              node_id: visit.node_id,
              visits: visitCount,
              completions: completionCount,
              completion_rate: completionRate,
              stuck_users: visitCount - completionCount
            });
          }
        }
      }

      // Sort by stuck users (highest first)
      bottlenecks.sort((a, b) => b.stuck_users - a.stuck_users);

      return bottlenecks;

    } catch (error) {
      console.error('[UserTreeCounter] Error analyzing bottlenecks:', error);
      return [];
    }
  }

  /**
   * Find successful paths through tree
   */
  async findSuccessfulPaths(treeId, options = {}) {
    const {
      minUsers = 3,
      completed = true
    } = options;

    try {
      // Get users who completed the tree
      const completedUsers = await this.pool.query(`
        SELECT DISTINCT user_id
        FROM user_tree_progress
        WHERE tree_id = $1
          AND completion_rate >= 0.8
      `, [treeId]);

      if (completedUsers.rows.length < minUsers) {
        return { paths: [], message: 'Not enough completed users' };
      }

      // Get their paths
      const paths = [];

      for (const user of completedUsers.rows) {
        const path = await this.pool.query(`
          SELECT node_id, timestamp
          FROM tree_node_visits
          WHERE user_id = $1 AND tree_id = $2
          ORDER BY timestamp ASC
        `, [user.user_id, treeId]);

        if (path.rows.length > 0) {
          paths.push({
            user_id: user.user_id,
            path: path.rows.map(n => n.node_id),
            duration_ms: new Date(path.rows[path.rows.length - 1].timestamp) -
                        new Date(path.rows[0].timestamp)
          });
        }
      }

      // Find common sequences
      const sequences = this._findCommonSequences(paths);

      return {
        paths,
        commonSequences: sequences,
        stats: {
          totalPaths: paths.length,
          avgDuration: paths.reduce((sum, p) => sum + p.duration_ms, 0) / paths.length
        }
      };

    } catch (error) {
      console.error('[UserTreeCounter] Error finding paths:', error);
      return { paths: [], error: error.message };
    }
  }

  /**
   * Get next recommended node
   */
  async getNextRecommendation(userIdOrIdentity, treeId) {
    try {
      // Get user's current progress
      const progress = await this.getTreeProgress(userIdOrIdentity, treeId);

      if (!progress.last_node) {
        // First node in tree
        return { node_id: 'start', reason: 'Beginning of tree' };
      }

      // Get successful paths
      const paths = await this.findSuccessfulPaths(treeId);

      if (paths.paths.length === 0) {
        return { node_id: null, reason: 'No successful paths found' };
      }

      // Find most common next step from current position
      const nextSteps = {};

      for (const path of paths.paths) {
        const currentIndex = path.path.indexOf(progress.last_node);

        if (currentIndex >= 0 && currentIndex < path.path.length - 1) {
          const nextNode = path.path[currentIndex + 1];
          nextSteps[nextNode] = (nextSteps[nextNode] || 0) + 1;
        }
      }

      // Get most common next step
      const recommended = Object.entries(nextSteps)
        .sort((a, b) => b[1] - a[1])[0];

      if (recommended) {
        return {
          node_id: recommended[0],
          reason: `${recommended[1]} users went here next`,
          confidence: recommended[1] / paths.paths.length
        };
      }

      return { node_id: null, reason: 'End of common paths' };

    } catch (error) {
      console.error('[UserTreeCounter] Error getting recommendation:', error);
      return { node_id: null, error: error.message };
    }
  }

  /**
   * Update tree progress summary
   */
  async _updateTreeProgress(userIdOrIdentity, treeId) {
    try {
      // Count visits
      const visits = await this.pool.query(`
        SELECT COUNT(DISTINCT node_id) as count
        FROM tree_node_visits
        WHERE (user_id = $1 OR identity_id = $1) AND tree_id = $2
      `, [userIdOrIdentity, treeId]);

      const nodesVisited = parseInt(visits.rows[0].count);

      // Count completions
      const completions = await this.pool.query(`
        SELECT COUNT(DISTINCT node_id) as count
        FROM tree_node_completions
        WHERE (user_id = $1 OR identity_id = $1) AND tree_id = $2
      `, [userIdOrIdentity, treeId]);

      const nodesCompleted = parseInt(completions.rows[0].count);

      // Get last node
      const last = await this.pool.query(`
        SELECT node_id
        FROM tree_node_visits
        WHERE (user_id = $1 OR identity_id = $1) AND tree_id = $2
        ORDER BY timestamp DESC
        LIMIT 1
      `, [userIdOrIdentity, treeId]);

      const lastNode = last.rows[0]?.node_id || null;

      // Get tree definition to know total nodes
      // For now, we'll estimate based on what we see
      const nodesTotal = Math.max(nodesVisited, nodesCompleted);

      const completionRate = nodesTotal > 0 ? nodesCompleted / nodesTotal : 0;

      // Upsert progress
      await this.pool.query(`
        INSERT INTO user_tree_progress (
          user_id,
          identity_id,
          tree_id,
          nodes_visited,
          nodes_completed,
          nodes_total,
          completion_rate,
          last_node,
          last_activity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id, tree_id)
        DO UPDATE SET
          nodes_visited = $4,
          nodes_completed = $5,
          nodes_total = $6,
          completion_rate = $7,
          last_node = $8,
          last_activity = NOW()
      `, [
        userIdOrIdentity,
        userIdOrIdentity,
        treeId,
        nodesVisited,
        nodesCompleted,
        nodesTotal,
        completionRate,
        lastNode
      ]);

    } catch (error) {
      console.error('[UserTreeCounter] Error updating progress:', error);
    }
  }

  /**
   * Find common sequences in paths
   */
  _findCommonSequences(paths, minLength = 2) {
    const sequences = {};

    for (const pathData of paths) {
      const path = pathData.path;

      // Extract all subsequences
      for (let len = minLength; len <= path.length; len++) {
        for (let i = 0; i <= path.length - len; i++) {
          const seq = path.slice(i, i + len).join(' → ');
          sequences[seq] = (sequences[seq] || 0) + 1;
        }
      }
    }

    // Return sequences that appear in >30% of paths
    const threshold = paths.length * 0.3;
    const common = {};

    for (const [seq, count] of Object.entries(sequences)) {
      if (count >= threshold) {
        common[seq] = {
          count,
          frequency: count / paths.length
        };
      }
    }

    return common;
  }
}

module.exports = UserTreeCounter;
