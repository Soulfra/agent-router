/**
 * Decision Tracker
 *
 * Version control for decisions with full history tracking.
 * Solves: "versioning and deprecation of info... so decisions can be traced and tracked"
 *
 * Features:
 * - Create decisions with full context
 * - Version history (why decisions changed)
 * - Deprecation tracking (why decisions became obsolete)
 * - Reference linking (what decisions relate to this?)
 * - Impact analysis (what depends on this decision?)
 * - Status lifecycle: draft → active → deprecated → archived
 * - Restoration capability
 *
 * Use Cases:
 * - Track why we chose a technology/approach
 * - Record when decisions become outdated
 * - Understand decision dependencies
 * - Find related decisions quickly
 * - Restore old decisions if needed
 */

const { Pool } = require('pg');

class DecisionTracker {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    console.log('[DecisionTracker] Initialized');
  }

  /**
   * Create new decision
   *
   * @param {Object} data
   * @param {string} data.title - Decision title
   * @param {string} data.content - Full decision content (markdown supported)
   * @param {string} data.category - Category (tech, product, process, architecture)
   * @param {string} data.createdBy - User who made decision
   * @param {Object} data.context - Additional context (tags, links, related items)
   * @param {string[]} data.references - IDs of related decisions
   * @param {string} data.status - draft, active, deprecated, archived (default: draft)
   * @returns {Object} Created decision
   */
  async createDecision(data) {
    try {
      const {
        title,
        content,
        category = 'general',
        createdBy,
        context = {},
        references = [],
        status = 'draft'
      } = data;

      if (!title || !content) {
        throw new Error('Title and content are required');
      }

      // Create decision
      const result = await this.pool.query(`
        INSERT INTO decisions (
          title,
          content,
          category,
          created_by,
          context,
          status,
          version,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [title, content, category, createdBy, JSON.stringify(context), status, 1]);

      const decision = result.rows[0];

      // Create initial version history
      await this._recordVersion(decision.id, {
        version: 1,
        title,
        content,
        context,
        status,
        changedBy: createdBy,
        changeReason: 'Initial creation'
      });

      // Create references
      if (references.length > 0) {
        await this.addReferences(decision.id, references, createdBy);
      }

      console.log(`[DecisionTracker] Created decision: ${title} (ID: ${decision.id})`);

      return this._formatDecision(decision);

    } catch (error) {
      console.error('[DecisionTracker] Error creating decision:', error);
      throw error;
    }
  }

  /**
   * Update decision (creates new version)
   *
   * @param {number} decisionId
   * @param {Object} updates
   * @param {string} updates.title - New title
   * @param {string} updates.content - New content
   * @param {Object} updates.context - Updated context
   * @param {string} updates.status - New status
   * @param {string} updates.updatedBy - Who made update
   * @param {string} updates.changeReason - Why update was made
   * @returns {Object} Updated decision
   */
  async updateDecision(decisionId, updates) {
    try {
      const { title, content, context, status, updatedBy, changeReason } = updates;

      if (!updatedBy || !changeReason) {
        throw new Error('updatedBy and changeReason are required for updates');
      }

      // Get current version
      const current = await this.getDecision(decisionId);

      if (!current) {
        throw new Error(`Decision ${decisionId} not found`);
      }

      const newVersion = current.version + 1;

      // Update decision
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }

      if (content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        updateValues.push(content);
      }

      if (context !== undefined) {
        updateFields.push(`context = $${paramIndex++}`);
        updateValues.push(JSON.stringify(context));
      }

      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }

      updateFields.push(`version = $${paramIndex++}`);
      updateValues.push(newVersion);

      updateFields.push(`updated_at = NOW()`);

      updateValues.push(decisionId);

      const result = await this.pool.query(`
        UPDATE decisions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);

      const updated = result.rows[0];

      // Record version history
      await this._recordVersion(decisionId, {
        version: newVersion,
        title: title || current.title,
        content: content || current.content,
        context: context || current.context,
        status: status || current.status,
        changedBy: updatedBy,
        changeReason
      });

      console.log(`[DecisionTracker] Updated decision ${decisionId} to v${newVersion}: ${changeReason}`);

      return this._formatDecision(updated);

    } catch (error) {
      console.error('[DecisionTracker] Error updating decision:', error);
      throw error;
    }
  }

  /**
   * Deprecate decision
   *
   * @param {number} decisionId
   * @param {string} reason - Why decision is deprecated
   * @param {number} replacedBy - ID of decision that replaces this (optional)
   * @param {string} deprecatedBy - Who deprecated it
   * @returns {Object} Deprecated decision
   */
  async deprecateDecision(decisionId, reason, replacedBy = null, deprecatedBy) {
    try {
      if (!reason || !deprecatedBy) {
        throw new Error('reason and deprecatedBy are required for deprecation');
      }

      const result = await this.pool.query(`
        UPDATE decisions
        SET status = 'deprecated',
            deprecated_reason = $1,
            replaced_by = $2,
            deprecated_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [reason, replacedBy, decisionId]);

      if (result.rows.length === 0) {
        throw new Error(`Decision ${decisionId} not found`);
      }

      const decision = result.rows[0];

      // Record deprecation in history
      await this._recordVersion(decisionId, {
        version: decision.version + 1,
        title: decision.title,
        content: decision.content,
        context: decision.context,
        status: 'deprecated',
        changedBy: deprecatedBy,
        changeReason: `Deprecated: ${reason}`
      });

      console.log(`[DecisionTracker] Deprecated decision ${decisionId}: ${reason}`);

      return this._formatDecision(decision);

    } catch (error) {
      console.error('[DecisionTracker] Error deprecating decision:', error);
      throw error;
    }
  }

  /**
   * Archive decision
   *
   * @param {number} decisionId
   * @param {string} archivedBy
   * @returns {Object} Archived decision
   */
  async archiveDecision(decisionId, archivedBy) {
    try {
      return await this.updateDecision(decisionId, {
        status: 'archived',
        updatedBy: archivedBy,
        changeReason: 'Archived decision'
      });

    } catch (error) {
      console.error('[DecisionTracker] Error archiving decision:', error);
      throw error;
    }
  }

  /**
   * Restore decision from deprecated/archived to active
   *
   * @param {number} decisionId
   * @param {string} restoredBy
   * @param {string} reason - Why restoring
   * @returns {Object} Restored decision
   */
  async restoreDecision(decisionId, restoredBy, reason) {
    try {
      return await this.updateDecision(decisionId, {
        status: 'active',
        updatedBy: restoredBy,
        changeReason: `Restored: ${reason}`
      });

    } catch (error) {
      console.error('[DecisionTracker] Error restoring decision:', error);
      throw error;
    }
  }

  /**
   * Get decision by ID
   *
   * @param {number} decisionId
   * @param {Object} options
   * @param {boolean} options.includeHistory - Include version history
   * @param {boolean} options.includeReferences - Include related decisions
   * @param {boolean} options.includeImpact - Include what depends on this
   * @returns {Object} Decision
   */
  async getDecision(decisionId, options = {}) {
    try {
      const {
        includeHistory = false,
        includeReferences = false,
        includeImpact = false
      } = options;

      const result = await this.pool.query(`
        SELECT * FROM decisions WHERE id = $1
      `, [decisionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const decision = this._formatDecision(result.rows[0]);

      // Include version history
      if (includeHistory) {
        decision.history = await this.getHistory(decisionId);
      }

      // Include references
      if (includeReferences) {
        decision.references = await this.getReferences(decisionId);
      }

      // Include impact analysis
      if (includeImpact) {
        decision.impact = await this.getImpact(decisionId);
      }

      return decision;

    } catch (error) {
      console.error('[DecisionTracker] Error getting decision:', error);
      throw error;
    }
  }

  /**
   * Get decision history (all versions)
   *
   * @param {number} decisionId
   * @returns {Array} Version history
   */
  async getHistory(decisionId) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM decision_versions
        WHERE decision_id = $1
        ORDER BY version DESC
      `, [decisionId]);

      return result.rows.map(v => ({
        version: v.version,
        title: v.title,
        content: v.content,
        context: v.context,
        status: v.status,
        changedBy: v.changed_by,
        changeReason: v.change_reason,
        createdAt: v.created_at
      }));

    } catch (error) {
      console.error('[DecisionTracker] Error getting history:', error);
      return [];
    }
  }

  /**
   * Add references to other decisions
   *
   * @param {number} decisionId
   * @param {number[]} referencedIds - IDs of decisions to reference
   * @param {string} createdBy
   * @param {string} referenceType - 'related', 'supersedes', 'superseded_by', 'blocks', 'blocked_by'
   * @returns {Array} Created references
   */
  async addReferences(decisionId, referencedIds, createdBy, referenceType = 'related') {
    try {
      const references = [];

      for (const refId of referencedIds) {
        const result = await this.pool.query(`
          INSERT INTO decision_references (
            decision_id,
            referenced_decision_id,
            reference_type,
            created_by,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (decision_id, referenced_decision_id) DO NOTHING
          RETURNING *
        `, [decisionId, refId, referenceType, createdBy]);

        if (result.rows.length > 0) {
          references.push(result.rows[0]);
        }
      }

      console.log(`[DecisionTracker] Added ${references.length} references to decision ${decisionId}`);

      return references;

    } catch (error) {
      console.error('[DecisionTracker] Error adding references:', error);
      throw error;
    }
  }

  /**
   * Get all references for a decision
   *
   * @param {number} decisionId
   * @returns {Object} References (outgoing and incoming)
   */
  async getReferences(decisionId) {
    try {
      // Outgoing references (this decision references others)
      const outgoing = await this.pool.query(`
        SELECT
          r.reference_type,
          r.created_at,
          d.id,
          d.title,
          d.status,
          d.category
        FROM decision_references r
        JOIN decisions d ON r.referenced_decision_id = d.id
        WHERE r.decision_id = $1
        ORDER BY r.created_at DESC
      `, [decisionId]);

      // Incoming references (others reference this decision)
      const incoming = await this.pool.query(`
        SELECT
          r.reference_type,
          r.created_at,
          d.id,
          d.title,
          d.status,
          d.category
        FROM decision_references r
        JOIN decisions d ON r.decision_id = d.id
        WHERE r.referenced_decision_id = $1
        ORDER BY r.created_at DESC
      `, [decisionId]);

      return {
        outgoing: outgoing.rows,
        incoming: incoming.rows
      };

    } catch (error) {
      console.error('[DecisionTracker] Error getting references:', error);
      return { outgoing: [], incoming: [] };
    }
  }

  /**
   * Get impact analysis (what depends on this decision?)
   *
   * @param {number} decisionId
   * @returns {Object} Impact analysis
   */
  async getImpact(decisionId) {
    try {
      // Get todos linked to this decision
      const todos = await this.pool.query(`
        SELECT id, title, status, created_at
        FROM decision_todos
        WHERE decision_id = $1
        ORDER BY created_at DESC
      `, [decisionId]);

      // Get decisions that reference this
      const dependentDecisions = await this.pool.query(`
        SELECT
          d.id,
          d.title,
          d.status,
          r.reference_type
        FROM decision_references r
        JOIN decisions d ON r.decision_id = d.id
        WHERE r.referenced_decision_id = $1
          AND r.reference_type IN ('blocks', 'blocked_by')
      `, [decisionId]);

      return {
        todos: todos.rows,
        dependentDecisions: dependentDecisions.rows,
        impactScore: this._calculateImpactScore(todos.rows, dependentDecisions.rows)
      };

    } catch (error) {
      console.error('[DecisionTracker] Error getting impact:', error);
      return { todos: [], dependentDecisions: [], impactScore: 0 };
    }
  }

  /**
   * Search decisions
   *
   * @param {Object} filters
   * @param {string} filters.query - Text search
   * @param {string} filters.category - Filter by category
   * @param {string} filters.status - Filter by status
   * @param {string} filters.createdBy - Filter by creator
   * @param {Date} filters.createdAfter - Created after date
   * @param {Date} filters.createdBefore - Created before date
   * @returns {Array} Matching decisions
   */
  async searchDecisions(filters = {}) {
    try {
      const {
        query,
        category,
        status,
        createdBy,
        createdAfter,
        createdBefore
      } = filters;

      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (query) {
        conditions.push(`(title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`);
        values.push(`%${query}%`);
        paramIndex++;
      }

      if (category) {
        conditions.push(`category = $${paramIndex}`);
        values.push(category);
        paramIndex++;
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (createdBy) {
        conditions.push(`created_by = $${paramIndex}`);
        values.push(createdBy);
        paramIndex++;
      }

      if (createdAfter) {
        conditions.push(`created_at >= $${paramIndex}`);
        values.push(createdAfter);
        paramIndex++;
      }

      if (createdBefore) {
        conditions.push(`created_at <= $${paramIndex}`);
        values.push(createdBefore);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.pool.query(`
        SELECT * FROM decisions
        ${whereClause}
        ORDER BY updated_at DESC
      `, values);

      return result.rows.map(d => this._formatDecision(d));

    } catch (error) {
      console.error('[DecisionTracker] Error searching decisions:', error);
      return [];
    }
  }

  /**
   * Get decision timeline
   *
   * @param {Object} options
   * @param {Date} options.startDate - Start date
   * @param {Date} options.endDate - End date
   * @param {string} options.category - Filter by category
   * @returns {Array} Timeline of decisions
   */
  async getTimeline(options = {}) {
    try {
      const { startDate, endDate, category } = options;

      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      if (category) {
        conditions.push(`category = $${paramIndex}`);
        values.push(category);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.pool.query(`
        SELECT
          id,
          title,
          category,
          status,
          created_by,
          created_at,
          updated_at,
          deprecated_at
        FROM decisions
        ${whereClause}
        ORDER BY created_at ASC
      `, values);

      return result.rows;

    } catch (error) {
      console.error('[DecisionTracker] Error getting timeline:', error);
      return [];
    }
  }

  /**
   * Record version in history
   * @private
   */
  async _recordVersion(decisionId, versionData) {
    try {
      const { version, title, content, context, status, changedBy, changeReason } = versionData;

      await this.pool.query(`
        INSERT INTO decision_versions (
          decision_id,
          version,
          title,
          content,
          context,
          status,
          changed_by,
          change_reason,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [decisionId, version, title, content, JSON.stringify(context), status, changedBy, changeReason]);

    } catch (error) {
      console.error('[DecisionTracker] Error recording version:', error);
    }
  }

  /**
   * Calculate impact score
   * @private
   */
  _calculateImpactScore(todos, dependentDecisions) {
    // Simple scoring: 1 point per todo, 2 points per dependent decision
    const todoScore = todos.filter(t => t.status === 'pending').length;
    const decisionScore = dependentDecisions.length * 2;

    return todoScore + decisionScore;
  }

  /**
   * Format decision for output
   * @private
   */
  _formatDecision(row) {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      context: row.context,
      deprecatedReason: row.deprecated_reason,
      replacedBy: row.replaced_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deprecatedAt: row.deprecated_at
    };
  }
}

module.exports = DecisionTracker;
