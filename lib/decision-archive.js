/**
 * Decision Archive
 *
 * Archive system with searchable references and restoration capability.
 * Solves: "archived or referenced files so the decisions can be traced and tracked"
 *
 * Features:
 * - Archive old decisions while keeping them searchable
 * - Timeline view of decision evolution
 * - Reference tracing (follow decision chains)
 * - Impact analysis before archiving
 * - Restoration with full history
 * - Archive categories (obsolete, completed, superseded)
 * - Bulk archiving operations
 *
 * Use Cases:
 * - Clean up old decisions without losing history
 * - Trace decision lineage (how did we get here?)
 * - Understand why old decisions were made
 * - Restore decisions if situation changes
 * - Generate decision reports/summaries
 */

const DecisionTracker = require('./decision-tracker');

class DecisionArchive {
  constructor(config = {}) {
    this.tracker = config.tracker || new DecisionTracker(config);
    this.pool = this.tracker.pool;

    console.log('[DecisionArchive] Initialized');
  }

  /**
   * Archive decision with reason
   *
   * @param {number} decisionId
   * @param {Object} data
   * @param {string} data.archivedBy - Who archived it
   * @param {string} data.reason - Why archiving
   * @param {string} data.archiveCategory - 'obsolete', 'completed', 'superseded', 'historical'
   * @param {Object} data.metadata - Additional archive metadata
   * @returns {Object} Archived decision
   */
  async archiveDecision(decisionId, data) {
    try {
      const { archivedBy, reason, archiveCategory = 'historical', metadata = {} } = data;

      if (!archivedBy || !reason) {
        throw new Error('archivedBy and reason are required');
      }

      // Check impact before archiving
      const impact = await this.tracker.getImpact(decisionId);

      if (impact.impactScore > 5) {
        console.warn(`[DecisionArchive] Warning: Decision ${decisionId} has high impact score (${impact.impactScore})`);
      }

      // Create archive entry
      await this.pool.query(`
        INSERT INTO decision_archives (
          decision_id,
          archived_by,
          archive_reason,
          archive_category,
          archive_metadata,
          impact_at_archive,
          archived_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        decisionId,
        archivedBy,
        reason,
        archiveCategory,
        JSON.stringify(metadata),
        JSON.stringify(impact)
      ]);

      // Update decision status to archived
      const archived = await this.tracker.archiveDecision(decisionId, archivedBy);

      console.log(`[DecisionArchive] Archived decision ${decisionId}: ${reason}`);

      return {
        ...archived,
        archiveCategory,
        archiveReason: reason,
        impactAtArchive: impact
      };

    } catch (error) {
      console.error('[DecisionArchive] Error archiving decision:', error);
      throw error;
    }
  }

  /**
   * Bulk archive decisions
   *
   * @param {number[]} decisionIds
   * @param {Object} data - Archive data (same as archiveDecision)
   * @returns {Array} Archived decisions
   */
  async bulkArchive(decisionIds, data) {
    try {
      const archived = [];

      for (const id of decisionIds) {
        try {
          const result = await this.archiveDecision(id, data);
          archived.push(result);
        } catch (error) {
          console.error(`[DecisionArchive] Failed to archive decision ${id}:`, error.message);
        }
      }

      console.log(`[DecisionArchive] Bulk archived ${archived.length}/${decisionIds.length} decisions`);

      return archived;

    } catch (error) {
      console.error('[DecisionArchive] Error in bulk archive:', error);
      throw error;
    }
  }

  /**
   * Restore decision from archive
   *
   * @param {number} decisionId
   * @param {string} restoredBy
   * @param {string} reason - Why restoring
   * @returns {Object} Restored decision
   */
  async restoreDecision(decisionId, restoredBy, reason) {
    try {
      // Update archive entry
      await this.pool.query(`
        UPDATE decision_archives
        SET restored_at = NOW(),
            restored_by = $1,
            restore_reason = $2
        WHERE decision_id = $3 AND restored_at IS NULL
      `, [restoredBy, reason, decisionId]);

      // Restore decision to active
      const restored = await this.tracker.restoreDecision(decisionId, restoredBy, reason);

      console.log(`[DecisionArchive] Restored decision ${decisionId}: ${reason}`);

      return restored;

    } catch (error) {
      console.error('[DecisionArchive] Error restoring decision:', error);
      throw error;
    }
  }

  /**
   * Get archive history for decision
   *
   * @param {number} decisionId
   * @returns {Array} Archive history (may have been archived/restored multiple times)
   */
  async getArchiveHistory(decisionId) {
    try {
      const result = await this.pool.query(`
        SELECT
          archived_by,
          archive_reason,
          archive_category,
          archive_metadata,
          impact_at_archive,
          archived_at,
          restored_by,
          restore_reason,
          restored_at
        FROM decision_archives
        WHERE decision_id = $1
        ORDER BY archived_at DESC
      `, [decisionId]);

      return result.rows.map(r => ({
        archivedBy: r.archived_by,
        archiveReason: r.archive_reason,
        archiveCategory: r.archive_category,
        archiveMetadata: r.archive_metadata,
        impactAtArchive: r.impact_at_archive,
        archivedAt: r.archived_at,
        restoredBy: r.restored_by,
        restoreReason: r.restore_reason,
        restoredAt: r.restored_at
      }));

    } catch (error) {
      console.error('[DecisionArchive] Error getting archive history:', error);
      return [];
    }
  }

  /**
   * Search archived decisions
   *
   * @param {Object} filters
   * @param {string} filters.query - Text search
   * @param {string} filters.archiveCategory - Filter by archive category
   * @param {Date} filters.archivedAfter - Archived after date
   * @param {Date} filters.archivedBefore - Archived before date
   * @param {boolean} filters.includeRestored - Include restored decisions (default: false)
   * @returns {Array} Archived decisions
   */
  async searchArchive(filters = {}) {
    try {
      const {
        query,
        archiveCategory,
        archivedAfter,
        archivedBefore,
        includeRestored = false
      } = filters;

      const conditions = ['d.status = \'archived\''];
      const values = [];
      let paramIndex = 1;

      if (query) {
        conditions.push(`(d.title ILIKE $${paramIndex} OR d.content ILIKE $${paramIndex})`);
        values.push(`%${query}%`);
        paramIndex++;
      }

      if (archiveCategory) {
        conditions.push(`a.archive_category = $${paramIndex}`);
        values.push(archiveCategory);
        paramIndex++;
      }

      if (archivedAfter) {
        conditions.push(`a.archived_at >= $${paramIndex}`);
        values.push(archivedAfter);
        paramIndex++;
      }

      if (archivedBefore) {
        conditions.push(`a.archived_at <= $${paramIndex}`);
        values.push(archivedBefore);
        paramIndex++;
      }

      if (!includeRestored) {
        conditions.push('a.restored_at IS NULL');
      }

      const result = await this.pool.query(`
        SELECT
          d.*,
          a.archived_by,
          a.archive_reason,
          a.archive_category,
          a.archived_at,
          a.restored_by,
          a.restored_at
        FROM decisions d
        JOIN decision_archives a ON d.id = a.decision_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.archived_at DESC
      `, values);

      return result.rows.map(r => ({
        ...this.tracker._formatDecision(r),
        archivedBy: r.archived_by,
        archiveReason: r.archive_reason,
        archiveCategory: r.archive_category,
        archivedAt: r.archived_at,
        restoredBy: r.restored_by,
        restoredAt: r.restored_at
      }));

    } catch (error) {
      console.error('[DecisionArchive] Error searching archive:', error);
      return [];
    }
  }

  /**
   * Get decision lineage (trace decision chain)
   * Follows references to show how decisions evolved
   *
   * @param {number} decisionId
   * @param {Object} options
   * @param {number} options.maxDepth - Max depth to traverse (default: 5)
   * @param {string} options.referenceType - Filter by reference type (default: all)
   * @returns {Object} Decision lineage tree
   */
  async getLineage(decisionId, options = {}) {
    try {
      const { maxDepth = 5, referenceType = null } = options;

      const lineage = {
        decision: await this.tracker.getDecision(decisionId),
        parents: [],
        children: []
      };

      // Get parent decisions (what led to this?)
      const parents = await this._traceParents(decisionId, referenceType, maxDepth, 1);
      lineage.parents = parents;

      // Get child decisions (what came from this?)
      const children = await this._traceChildren(decisionId, referenceType, maxDepth, 1);
      lineage.children = children;

      return lineage;

    } catch (error) {
      console.error('[DecisionArchive] Error getting lineage:', error);
      return null;
    }
  }

  /**
   * Get decision timeline view
   * Shows all decisions in chronological order with relationships
   *
   * @param {Object} options
   * @param {Date} options.startDate
   * @param {Date} options.endDate
   * @param {string} options.category - Filter by category
   * @param {boolean} options.includeArchived - Include archived decisions
   * @returns {Array} Timeline entries
   */
  async getTimelineView(options = {}) {
    try {
      const { startDate, endDate, category, includeArchived = false } = options;

      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`d.created_at >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`d.created_at <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      if (category) {
        conditions.push(`d.category = $${paramIndex}`);
        values.push(category);
        paramIndex++;
      }

      if (!includeArchived) {
        conditions.push(`d.status != 'archived'`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.pool.query(`
        SELECT
          d.id,
          d.title,
          d.category,
          d.status,
          d.created_by,
          d.created_at,
          d.updated_at,
          d.deprecated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ref_d.id,
                'title', ref_d.title,
                'referenceType', dr.reference_type
              )
            ) FILTER (WHERE ref_d.id IS NOT NULL),
            '[]'
          ) as references
        FROM decisions d
        LEFT JOIN decision_references dr ON d.id = dr.decision_id
        LEFT JOIN decisions ref_d ON dr.referenced_decision_id = ref_d.id
        ${whereClause}
        GROUP BY d.id
        ORDER BY d.created_at ASC
      `, values);

      return result.rows.map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        deprecatedAt: r.deprecated_at,
        references: r.references
      }));

    } catch (error) {
      console.error('[DecisionArchive] Error getting timeline view:', error);
      return [];
    }
  }

  /**
   * Generate decision summary report
   *
   * @param {Object} filters - Same as searchArchive
   * @returns {Object} Summary report
   */
  async generateSummaryReport(filters = {}) {
    try {
      const decisions = await this.tracker.searchDecisions(filters);
      const archived = await this.searchArchive(filters);

      const report = {
        totalDecisions: decisions.length,
        archivedDecisions: archived.length,
        byStatus: {},
        byCategory: {},
        recentActivity: [],
        topDeprecated: [],
        highImpact: []
      };

      // Count by status
      for (const d of decisions) {
        report.byStatus[d.status] = (report.byStatus[d.status] || 0) + 1;
      }

      // Count by category
      for (const d of decisions) {
        report.byCategory[d.category] = (report.byCategory[d.category] || 0) + 1;
      }

      // Recent activity (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      report.recentActivity = decisions
        .filter(d => new Date(d.updatedAt) > weekAgo)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 10);

      // Top deprecated (recently deprecated)
      report.topDeprecated = decisions
        .filter(d => d.status === 'deprecated' && d.deprecatedAt)
        .sort((a, b) => new Date(b.deprecatedAt) - new Date(a.deprecatedAt))
        .slice(0, 5);

      // High impact decisions (get impact for top 20 most recent)
      const recent = decisions.slice(0, 20);
      const withImpact = await Promise.all(
        recent.map(async d => ({
          ...d,
          impact: await this.tracker.getImpact(d.id)
        }))
      );

      report.highImpact = withImpact
        .sort((a, b) => b.impact.impactScore - a.impact.impactScore)
        .slice(0, 5);

      return report;

    } catch (error) {
      console.error('[DecisionArchive] Error generating summary:', error);
      return null;
    }
  }

  /**
   * Trace parent decisions recursively
   * @private
   */
  async _traceParents(decisionId, referenceType, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) {
      return [];
    }

    try {
      const conditions = ['dr.decision_id = $1'];
      const values = [decisionId];

      if (referenceType) {
        conditions.push('dr.reference_type = $2');
        values.push(referenceType);
      }

      const result = await this.pool.query(`
        SELECT
          d.id,
          d.title,
          d.status,
          d.category,
          dr.reference_type,
          dr.created_at as linked_at
        FROM decision_references dr
        JOIN decisions d ON dr.referenced_decision_id = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY dr.created_at DESC
      `, values);

      const parents = [];

      for (const row of result.rows) {
        const parent = {
          id: row.id,
          title: row.title,
          status: row.status,
          category: row.category,
          referenceType: row.reference_type,
          linkedAt: row.linked_at,
          depth: currentDepth,
          parents: []
        };

        // Recurse
        if (currentDepth < maxDepth) {
          parent.parents = await this._traceParents(row.id, referenceType, maxDepth, currentDepth + 1);
        }

        parents.push(parent);
      }

      return parents;

    } catch (error) {
      console.error('[DecisionArchive] Error tracing parents:', error);
      return [];
    }
  }

  /**
   * Trace child decisions recursively
   * @private
   */
  async _traceChildren(decisionId, referenceType, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) {
      return [];
    }

    try {
      const conditions = ['dr.referenced_decision_id = $1'];
      const values = [decisionId];

      if (referenceType) {
        conditions.push('dr.reference_type = $2');
        values.push(referenceType);
      }

      const result = await this.pool.query(`
        SELECT
          d.id,
          d.title,
          d.status,
          d.category,
          dr.reference_type,
          dr.created_at as linked_at
        FROM decision_references dr
        JOIN decisions d ON dr.decision_id = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY dr.created_at ASC
      `, values);

      const children = [];

      for (const row of result.rows) {
        const child = {
          id: row.id,
          title: row.title,
          status: row.status,
          category: row.category,
          referenceType: row.reference_type,
          linkedAt: row.linked_at,
          depth: currentDepth,
          children: []
        };

        // Recurse
        if (currentDepth < maxDepth) {
          child.children = await this._traceChildren(row.id, referenceType, maxDepth, currentDepth + 1);
        }

        children.push(child);
      }

      return children;

    } catch (error) {
      console.error('[DecisionArchive] Error tracing children:', error);
      return [];
    }
  }
}

module.exports = DecisionArchive;
