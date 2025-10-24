/**
 * Nested Traversal System (AOE Boss Aggro Mechanics)
 *
 * Features:
 * - Tree/graph navigation for nested structures
 * - Priority-based traversal (aggro mechanics)
 * - Resource gathering (RTS tycoon style)
 * - Path optimization (find optimal route through nested data)
 * - Boss aggro system (high-priority targets get attention first)
 */

class NestedTraversal {
  constructor() {
    // Aggro table: Map<nodeId, aggroLevel>
    this.aggroTable = new Map();

    // Resource pools (tycoon mechanics)
    this.resources = {
      attention: 100,  // Limited attention resource
      energy: 100,     // Energy for traversal
      xp: 0           // XP gained from traversal
    };

    // Traversal history
    this.history = [];

    console.log('[NestedTraversal] Initialized with AOE boss aggro mechanics');
  }

  /**
   * Traverse nested structure with priority (aggro system)
   */
  async traverse(root, { maxDepth = 10, aggroThreshold = 5, collectResources = true } = {}) {
    const visited = new Set();
    const queue = [{ node: root, depth: 0, aggro: 0 }];
    const results = [];

    while (queue.length > 0) {
      // Sort by aggro (boss aggro mechanics)
      queue.sort((a, b) => b.aggro - a.aggro);

      const { node, depth, aggro } = queue.shift();

      // Check resources (tycoon mechanics)
      if (this.resources.attention <= 0) {
        console.log('[NestedTraversal] Out of attention - resting');
        await this.rest();
      }

      // Mark as visited
      if (visited.has(node.id)) {
        continue;
      }
      visited.add(node.id);

      // Consume resources
      this.consumeResources(1, 1);

      // Process node
      const result = await this.processNode(node, depth, aggro);
      results.push(result);

      // Collect resources if enabled
      if (collectResources) {
        this.collectResources(node);
      }

      // Stop at max depth
      if (depth >= maxDepth) {
        continue;
      }

      // Add children to queue with calculated aggro
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childAggro = this.calculateAggro(child, node);

          // Only add if aggro is above threshold (boss filtering)
          if (childAggro >= aggroThreshold) {
            queue.push({
              node: child,
              depth: depth + 1,
              aggro: childAggro
            });
          }
        }
      }

      // Record history
      this.history.push({
        nodeId: node.id,
        depth,
        aggro,
        timestamp: new Date()
      });
    }

    return {
      success: true,
      results,
      visited: visited.size,
      resources: this.resources,
      history: this.history
    };
  }

  /**
   * Calculate aggro for a node (AOE boss mechanics)
   */
  calculateAggro(node, parent) {
    let aggro = 0;

    // Base aggro from node properties
    if (node.priority) {
      aggro += node.priority * 2;
    }

    // Aggro from comments (engagement)
    if (node.commentCount) {
      aggro += node.commentCount * 0.5;
    }

    // Aggro from likes/reactions
    if (node.likeCount) {
      aggro += node.likeCount * 0.3;
    }

    // Threat level (high priority targets)
    if (node.threatLevel) {
      aggro += node.threatLevel * 3;
    }

    // Proximity aggro (close to parent = higher aggro)
    if (parent && node.timestamp && parent.timestamp) {
      const timeDiff = Math.abs(node.timestamp - parent.timestamp);
      const proximityAggro = Math.max(0, 5 - timeDiff / 1000); // Decay over time
      aggro += proximityAggro;
    }

    // Existing aggro from table
    if (this.aggroTable.has(node.id)) {
      aggro += this.aggroTable.get(node.id);
    }

    return aggro;
  }

  /**
   * Process a node (execute action)
   */
  async processNode(node, depth, aggro) {
    console.log(`[NestedTraversal] Processing node ${node.id} (depth: ${depth}, aggro: ${aggro})`);

    // Update aggro table
    this.aggroTable.set(node.id, aggro);

    return {
      nodeId: node.id,
      depth,
      aggro,
      data: node.data || node,
      processed: true,
      xp: this.calculateXP(node, depth, aggro)
    };
  }

  /**
   * Calculate XP reward
   */
  calculateXP(node, depth, aggro) {
    const baseXP = 10;
    const depthBonus = depth * 5;
    const aggroBonus = aggro * 2;
    const totalXP = baseXP + depthBonus + aggroBonus;

    this.resources.xp += totalXP;

    return totalXP;
  }

  /**
   * Consume resources (tycoon mechanics)
   */
  consumeResources(attention, energy) {
    this.resources.attention = Math.max(0, this.resources.attention - attention);
    this.resources.energy = Math.max(0, this.resources.energy - energy);
  }

  /**
   * Collect resources from node (RTS gathering)
   */
  collectResources(node) {
    if (node.resources) {
      if (node.resources.attention) {
        this.resources.attention += node.resources.attention;
      }
      if (node.resources.energy) {
        this.resources.energy += node.resources.energy;
      }
    }
  }

  /**
   * Rest to regenerate resources
   */
  async rest(duration = 1000) {
    await new Promise(resolve => setTimeout(resolve, duration));

    this.resources.attention = Math.min(100, this.resources.attention + 20);
    this.resources.energy = Math.min(100, this.resources.energy + 20);

    console.log('[NestedTraversal] Rested - resources regenerated');
  }

  /**
   * Find optimal path through nested structure
   */
  async findOptimalPath(root, target, { maxDepth = 10 } = {}) {
    const queue = [{ node: root, path: [root.id], depth: 0, score: 0 }];
    const visited = new Set();
    let bestPath = null;
    let bestScore = -Infinity;

    while (queue.length > 0) {
      // Sort by score (greedy best-first search)
      queue.sort((a, b) => b.score - a.score);

      const { node, path, depth, score } = queue.shift();

      // Found target
      if (node.id === target.id) {
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }
        continue;
      }

      // Mark as visited
      if (visited.has(node.id)) {
        continue;
      }
      visited.add(node.id);

      // Stop at max depth
      if (depth >= maxDepth) {
        continue;
      }

      // Explore children
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childAggro = this.calculateAggro(child, node);
          const childScore = score + childAggro;

          queue.push({
            node: child,
            path: [...path, child.id],
            depth: depth + 1,
            score: childScore
          });
        }
      }
    }

    return {
      success: bestPath !== null,
      path: bestPath,
      score: bestScore,
      steps: bestPath ? bestPath.length : 0
    };
  }

  /**
   * Add aggro to a node (manual aggro generation)
   */
  addAggro(nodeId, amount) {
    const current = this.aggroTable.get(nodeId) || 0;
    this.aggroTable.set(nodeId, current + amount);

    console.log(`[NestedTraversal] Added ${amount} aggro to node ${nodeId} (total: ${current + amount})`);
  }

  /**
   * Reset aggro for a node
   */
  resetAggro(nodeId) {
    this.aggroTable.delete(nodeId);
    console.log(`[NestedTraversal] Reset aggro for node ${nodeId}`);
  }

  /**
   * Get aggro table
   */
  getAggroTable() {
    return Object.fromEntries(this.aggroTable);
  }

  /**
   * Get resources
   */
  getResources() {
    return { ...this.resources };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Export traversal as graph
   */
  exportGraph() {
    const nodes = [];
    const edges = [];

    for (const entry of this.history) {
      nodes.push({
        id: entry.nodeId,
        aggro: entry.aggro,
        depth: entry.depth,
        timestamp: entry.timestamp
      });
    }

    // Create edges from history sequence
    for (let i = 0; i < this.history.length - 1; i++) {
      edges.push({
        from: this.history[i].nodeId,
        to: this.history[i + 1].nodeId
      });
    }

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        totalXP: this.resources.xp
      }
    };
  }
}

module.exports = NestedTraversal;
