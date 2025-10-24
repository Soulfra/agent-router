/**
 * Cross-Reference Mapper (XRef System)
 *
 * "xrefs hotkey: x" - Show all places a component is used
 *
 * Like reverse engineering tools (IDA/Ghidra), this tracks every component
 * reference throughout the system and allows instant lookup of:
 * - Where is this pattern used?
 * - What models does this bucket use?
 * - What patterns does this artifact reference?
 * - What requests use this domain?
 *
 * Think of it as a "reverse index" for the entire system
 */

class XRefMapper {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[XRefMapper] Initialized');
  }

  /**
   * Record a component relationship
   *
   * @param {object} params
   * @param {string} params.sourceType - 'request', 'bucket', 'artifact', 'workflow', 'pattern'
   * @param {string} params.sourceId - ID of source component
   * @param {string} params.targetType - 'pattern', 'model', 'bucket', 'domain', 'preset', 'artifact', 'workflow'
   * @param {string} params.targetId - ID of target component
   * @param {string} params.relationshipType - 'uses_pattern', 'uses_model', etc.
   * @param {object} [params.context] - Additional context (userId, sessionId, requestId)
   * @param {object} [params.metadata] - Any additional metadata
   * @param {number} [params.executionTimeMs] - Execution time in milliseconds
   * @param {boolean} [params.success] - Whether the operation succeeded
   * @param {string} [params.errorMessage] - Error message if failed
   * @returns {Promise<number>} - Relationship ID
   */
  async record(params) {
    const {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      context = {},
      metadata = {},
      executionTimeMs = null,
      success = true,
      errorMessage = null
    } = params;

    try {
      const result = await this.db.query(`
        SELECT record_component_relationship(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) as relationship_id
      `, [
        sourceType,
        sourceId,
        targetType,
        targetId,
        relationshipType,
        context.userId || null,
        context.sessionId || null,
        context.requestId || null,
        JSON.stringify(metadata),
        executionTimeMs,
        success,
        errorMessage
      ]);

      const relationshipId = result.rows[0].relationship_id;

      console.log(`[XRefMapper] Recorded: ${sourceType}:${sourceId} -> ${relationshipType} -> ${targetType}:${targetId}`);

      return relationshipId;

    } catch (error) {
      console.error('[XRefMapper] Record error:', error.message);
      throw error;
    }
  }

  /**
   * Record multiple relationships at once (batch insert)
   *
   * @param {Array<object>} relationships - Array of relationship objects
   * @returns {Promise<number>} - Number of relationships recorded
   */
  async recordBatch(relationships) {
    if (!relationships || relationships.length === 0) {
      return 0;
    }

    try {
      let count = 0;

      // Execute all in parallel
      await Promise.all(
        relationships.map(rel => this.record(rel))
      );

      count = relationships.length;

      console.log(`[XRefMapper] Batch recorded ${count} relationships`);

      return count;

    } catch (error) {
      console.error('[XRefMapper] Batch record error:', error.message);
      throw error;
    }
  }

  /**
   * Find all usages of a component (xrefs)
   *
   * "xrefs hotkey: x" - where is this component used?
   *
   * @param {string} componentType - Type of component
   * @param {string} componentId - ID of component
   * @param {object} [options] - Query options
   * @param {number} [options.limit] - Max results
   * @param {string} [options.relationshipType] - Filter by relationship type
   * @param {boolean} [options.successOnly] - Only successful usages
   * @returns {Promise<Array>} - Array of usage records
   */
  async findUsages(componentType, componentId, options = {}) {
    const {
      limit = 100,
      relationshipType = null,
      successOnly = false
    } = options;

    try {
      let query = `
        SELECT * FROM get_component_usages($1, $2, $3)
      `;

      const params = [componentType, componentId, limit];

      const result = await this.db.query(query, params);

      let usages = result.rows;

      // Apply filters
      if (relationshipType) {
        usages = usages.filter(u => u.relationship_type === relationshipType);
      }

      if (successOnly) {
        usages = usages.filter(u => u.success === true);
      }

      console.log(`[XRefMapper] Found ${usages.length} usages for ${componentType}:${componentId}`);

      return usages;

    } catch (error) {
      console.error('[XRefMapper] Find usages error:', error.message);
      return [];
    }
  }

  /**
   * Find all dependencies of a component
   *
   * What does this component use/depend on?
   *
   * @param {string} componentType - Type of component
   * @param {string} componentId - ID of component
   * @param {object} [options] - Query options
   * @param {number} [options.limit] - Max results
   * @param {string} [options.relationshipType] - Filter by relationship type
   * @returns {Promise<Array>} - Array of dependency records
   */
  async findDependencies(componentType, componentId, options = {}) {
    const {
      limit = 100,
      relationshipType = null
    } = options;

    try {
      const result = await this.db.query(`
        SELECT * FROM get_component_dependencies($1, $2, $3)
      `, [componentType, componentId, limit]);

      let dependencies = result.rows;

      // Apply filters
      if (relationshipType) {
        dependencies = dependencies.filter(d => d.relationship_type === relationshipType);
      }

      console.log(`[XRefMapper] Found ${dependencies.length} dependencies for ${componentType}:${componentId}`);

      return dependencies;

    } catch (error) {
      console.error('[XRefMapper] Find dependencies error:', error.message);
      return [];
    }
  }

  /**
   * Build component graph for visualization (D3.js format)
   *
   * @param {string} componentType - Root component type
   * @param {string} componentId - Root component ID
   * @param {object} [options] - Graph options
   * @param {number} [options.depth] - How many levels deep
   * @param {string} [options.format] - 'nodes-links' or 'hierarchical'
   * @returns {Promise<object>} - Graph object with nodes and links
   */
  async buildGraph(componentType, componentId, options = {}) {
    const {
      depth = 2,
      format = 'nodes-links'
    } = options;

    try {
      const result = await this.db.query(`
        SELECT * FROM get_component_graph($1, $2, $3)
      `, [componentType, componentId, depth]);

      const edges = result.rows;

      if (format === 'nodes-links') {
        return this._formatNodesLinks(edges, componentType, componentId);
      } else if (format === 'hierarchical') {
        return this._formatHierarchical(edges, componentType, componentId);
      }

      return { edges };

    } catch (error) {
      console.error('[XRefMapper] Build graph error:', error.message);
      return { nodes: [], links: [] };
    }
  }

  /**
   * Get usage statistics for a component
   *
   * @param {string} componentType - Type of component
   * @param {string} componentId - ID of component
   * @returns {Promise<object|null>} - Statistics object
   */
  async getStats(componentType, componentId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM component_usage_stats
        WHERE component_type = $1 AND component_id = $2
      `, [componentType, componentId]);

      if (result.rows.length === 0) {
        return null;
      }

      const stats = result.rows[0];

      console.log(`[XRefMapper] Stats for ${componentType}:${componentId}: ${stats.total_uses} uses, ${(stats.success_rate * 100).toFixed(1)}% success`);

      return stats;

    } catch (error) {
      console.error('[XRefMapper] Get stats error:', error.message);
      return null;
    }
  }

  /**
   * Get most used components
   *
   * @param {object} [options] - Query options
   * @param {string} [options.componentType] - Filter by type
   * @param {number} [options.limit] - Max results
   * @returns {Promise<Array>} - Array of component stats
   */
  async getMostUsed(options = {}) {
    const {
      componentType = null,
      limit = 20
    } = options;

    try {
      let query = `
        SELECT * FROM most_used_components
      `;

      const params = [];

      if (componentType) {
        query = `
          SELECT * FROM component_usage_stats
          WHERE component_type = $1
          ORDER BY total_uses DESC, success_rate DESC
          LIMIT $2
        `;
        params.push(componentType, limit);
      } else {
        query += ` LIMIT $1`;
        params.push(limit);
      }

      const result = await this.db.query(query, params);

      console.log(`[XRefMapper] Found ${result.rows.length} most used components`);

      return result.rows;

    } catch (error) {
      console.error('[XRefMapper] Get most used error:', error.message);
      return [];
    }
  }

  /**
   * Get recently used components
   *
   * @param {object} [options] - Query options
   * @param {string} [options.componentType] - Filter by type
   * @param {number} [options.limit] - Max results
   * @returns {Promise<Array>} - Array of component stats
   */
  async getRecentlyUsed(options = {}) {
    const {
      componentType = null,
      limit = 20
    } = options;

    try {
      let query = `
        SELECT * FROM recently_used_components
      `;

      const params = [];

      if (componentType) {
        query = `
          SELECT * FROM component_usage_stats
          WHERE component_type = $1
            AND last_used_at IS NOT NULL
          ORDER BY last_used_at DESC
          LIMIT $2
        `;
        params.push(componentType, limit);
      } else {
        query += ` LIMIT $1`;
        params.push(limit);
      }

      const result = await this.db.query(query, params);

      console.log(`[XRefMapper] Found ${result.rows.length} recently used components`);

      return result.rows;

    } catch (error) {
      console.error('[XRefMapper] Get recently used error:', error.message);
      return [];
    }
  }

  /**
   * Find orphaned components (not used by anything)
   *
   * @param {string} componentType - Type to check
   * @returns {Promise<Array>} - Array of orphaned component IDs
   */
  async findOrphans(componentType) {
    try {
      // This requires knowing all possible components of this type
      // For now, return components with 0 uses or not in usage stats

      const result = await this.db.query(`
        SELECT component_id
        FROM component_usage_stats
        WHERE component_type = $1
          AND total_uses = 0
        ORDER BY updated_at DESC
      `, [componentType]);

      console.log(`[XRefMapper] Found ${result.rows.length} orphaned ${componentType} components`);

      return result.rows.map(r => r.component_id);

    } catch (error) {
      console.error('[XRefMapper] Find orphans error:', error.message);
      return [];
    }
  }

  /**
   * Record pattern usage (convenience method)
   *
   * @param {string} requestId - Request ID
   * @param {string} patternId - Pattern example ID
   * @param {object} context - Context object
   * @returns {Promise<number>} - Relationship ID
   */
  async recordPatternUsage(requestId, patternId, context = {}) {
    return this.record({
      sourceType: 'request',
      sourceId: requestId,
      targetType: 'pattern',
      targetId: patternId,
      relationshipType: 'uses_pattern',
      context
    });
  }

  /**
   * Record model usage (convenience method)
   *
   * @param {string} requestId - Request ID
   * @param {string} modelName - Model name
   * @param {object} context - Context object
   * @param {number} executionTimeMs - Execution time
   * @param {boolean} success - Success flag
   * @returns {Promise<number>} - Relationship ID
   */
  async recordModelUsage(requestId, modelName, context = {}, executionTimeMs = null, success = true) {
    return this.record({
      sourceType: 'request',
      sourceId: requestId,
      targetType: 'model',
      targetId: modelName,
      relationshipType: 'uses_model',
      context,
      executionTimeMs,
      success
    });
  }

  /**
   * Record bucket usage (convenience method)
   *
   * @param {string} requestId - Request ID
   * @param {string} bucketId - Bucket ID
   * @param {object} context - Context object
   * @returns {Promise<number>} - Relationship ID
   */
  async recordBucketUsage(requestId, bucketId, context = {}) {
    return this.record({
      sourceType: 'request',
      sourceId: requestId,
      targetType: 'bucket',
      targetId: bucketId,
      relationshipType: 'uses_bucket',
      context
    });
  }

  /**
   * Format graph as nodes and links (D3.js force layout)
   * @private
   */
  _formatNodesLinks(edges, rootType, rootId) {
    const nodes = new Map();
    const links = [];

    // Add root node
    nodes.set(`${rootType}:${rootId}`, {
      id: `${rootType}:${rootId}`,
      type: rootType,
      componentId: rootId,
      isRoot: true
    });

    // Process edges
    for (const edge of edges) {
      const fromKey = `${edge.from_type}:${edge.from_id}`;
      const toKey = `${edge.to_type}:${edge.to_id}`;

      // Add nodes
      if (!nodes.has(fromKey)) {
        nodes.set(fromKey, {
          id: fromKey,
          type: edge.from_type,
          componentId: edge.from_id
        });
      }

      if (!nodes.has(toKey)) {
        nodes.set(toKey, {
          id: toKey,
          type: edge.to_type,
          componentId: edge.to_id
        });
      }

      // Add link
      links.push({
        source: fromKey,
        target: toKey,
        relationshipType: edge.relationship_type,
        depth: edge.depth,
        usageCount: edge.usage_count,
        successRate: edge.success_rate
      });
    }

    return {
      nodes: Array.from(nodes.values()),
      links
    };
  }

  /**
   * Format graph as hierarchical tree (D3.js tree/cluster)
   * @private
   */
  _formatHierarchical(edges, rootType, rootId) {
    // Build tree structure
    const root = {
      name: `${rootType}:${rootId}`,
      type: rootType,
      componentId: rootId,
      children: []
    };

    // Group edges by depth
    const byDepth = new Map();

    for (const edge of edges) {
      if (!byDepth.has(edge.depth)) {
        byDepth.set(edge.depth, []);
      }
      byDepth.get(edge.depth).push(edge);
    }

    // Build tree level by level
    let currentLevel = [root];

    for (const [depth, depthEdges] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
      const nextLevel = [];

      for (const node of currentLevel) {
        for (const edge of depthEdges) {
          if (`${edge.from_type}:${edge.from_id}` === node.name) {
            const child = {
              name: `${edge.to_type}:${edge.to_id}`,
              type: edge.to_type,
              componentId: edge.to_id,
              relationshipType: edge.relationship_type,
              usageCount: edge.usage_count,
              successRate: edge.success_rate,
              children: []
            };

            node.children.push(child);
            nextLevel.push(child);
          }
        }
      }

      currentLevel = nextLevel;
    }

    return root;
  }

  /**
   * Export xrefs for a component (for debugging)
   *
   * @param {string} componentType - Type of component
   * @param {string} componentId - ID of component
   * @returns {Promise<object>} - Complete xref data
   */
  async export(componentType, componentId) {
    try {
      const [usages, dependencies, stats] = await Promise.all([
        this.findUsages(componentType, componentId),
        this.findDependencies(componentType, componentId),
        this.getStats(componentType, componentId)
      ]);

      return {
        component: {
          type: componentType,
          id: componentId
        },
        stats,
        usages,
        dependencies,
        exportedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[XRefMapper] Export error:', error.message);
      return null;
    }
  }

  /**
   * Record project cross-reference and update builder ecosystem metrics
   * Integrates with builder case study system
   *
   * @param {string} sourceProjectId - Source project UUID
   * @param {string} targetProjectId - Target project UUID
   * @param {string} referenceType - Type of reference
   * @param {string} description - Description
   * @returns {Promise<string>} - Cross-reference ID
   */
  async recordProjectXRef(sourceProjectId, targetProjectId, referenceType, description = null) {
    try {
      const result = await this.db.query(
        `SELECT record_project_xref($1, $2, $3, $4) AS xref_id`,
        [sourceProjectId, targetProjectId, referenceType, description]
      );

      const xrefId = result.rows[0].xref_id;

      console.log(`[XRefMapper] Recorded project xref: ${sourceProjectId} -> ${targetProjectId} (${referenceType})`);

      return xrefId;

    } catch (error) {
      console.error('[XRefMapper] Error recording project xref:', error.message);
      throw error;
    }
  }

  /**
   * Get project ecosystem graph for builder dashboard
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Ecosystem graph data
   */
  async getProjectEcosystemGraph(userId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM ecosystem_graph
         WHERE source_user_id = $1 OR target_user_id = $1
         ORDER BY reference_count DESC`,
        [userId]
      );

      return {
        connections: result.rows,
        total_connections: result.rows.length
      };

    } catch (error) {
      console.error('[XRefMapper] Error getting ecosystem graph:', error.message);
      return { connections: [], total_connections: 0 };
    }
  }
}

module.exports = XRefMapper;
