/**
 * Sub-Agent Context Inheritance System
 *
 * Ensures workers/sub-agents know they are sub-agents and have parent context.
 * Provides loop-back routing to parent agents.
 *
 * Features:
 * - Parent context attachment on worker spawn
 * - isSubAgent flag with parent ID tracking
 * - Loop-back routing capability
 * - Context snapshot preservation
 * - Platform/device awareness (X, Kik, Gameboy, Electron, etc.)
 * - Database routing based on parent context
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class SubAgentContext extends EventEmitter {
  constructor(options = {}) {
    super();

    // Core context
    this.agentId = options.agentId || crypto.randomUUID();
    this.isSubAgent = options.isSubAgent || false;
    this.parentAgentId = options.parentAgentId || null;
    this.parentContext = options.parentContext || null;

    // Platform/device identification
    this.platform = options.platform || null; // 'x', 'kik', 'web', 'gameboy', 'tv-remote', 'electron'
    this.deviceType = options.deviceType || null; // 'phone', 'desktop', 'embedded', 'cloud'
    this.ipAddress = options.ipAddress || null;
    this.isLocal = options.isLocal !== undefined ? options.isLocal : true;

    // Database routing
    this.databaseId = options.databaseId || 'default';
    this.databaseShardKey = options.databaseShardKey || null;

    // Spawn metadata
    this.spawnedAt = new Date();
    this.spawnReason = options.spawnReason || null;
    this.contextSnapshot = options.contextSnapshot || {};

    // Loop-back routing
    this.parentRoutes = new Map(); // Map<parentId, routeConfig>
    if (this.parentAgentId) {
      this.addParentRoute(this.parentAgentId, options.parentRoute || {});
    }

    // Child agents spawned by this agent
    this.childAgents = new Map(); // Map<childId, childContext>

    // Context depth tracking (how many layers deep)
    this.contextDepth = options.contextDepth || 0;
    if (this.isSubAgent && this.parentContext) {
      this.contextDepth = (this.parentContext.contextDepth || 0) + 1;
    }

    // Resource limits per depth
    this.maxContextDepth = options.maxContextDepth || 10;
    this.contextOverflowHandler = options.contextOverflowHandler || null;

    console.log(`[SubAgentContext] ${this.isSubAgent ? 'Sub-agent' : 'Root agent'} ${this.agentId} initialized (depth: ${this.contextDepth})`);
  }

  /**
   * Create a child agent with inherited context
   */
  spawnChild(options = {}) {
    // Check depth limits
    if (this.contextDepth >= this.maxContextDepth) {
      if (this.contextOverflowHandler) {
        this.emit('context_overflow', {
          parentId: this.agentId,
          depth: this.contextDepth,
          options
        });
      }
      throw new Error(`Maximum context depth (${this.maxContextDepth}) exceeded`);
    }

    // Create child context
    const childContext = new SubAgentContext({
      ...options,
      isSubAgent: true,
      parentAgentId: this.agentId,
      parentContext: this,
      contextDepth: this.contextDepth + 1,

      // Inherit platform/device info if not specified
      platform: options.platform || this.platform,
      deviceType: options.deviceType || this.deviceType,
      ipAddress: options.ipAddress || this.ipAddress,
      isLocal: options.isLocal !== undefined ? options.isLocal : this.isLocal,

      // Inherit database routing if not specified
      databaseId: options.databaseId || this.databaseId,
      databaseShardKey: options.databaseShardKey || this.databaseShardKey,

      // Pass overflow handler
      contextOverflowHandler: this.contextOverflowHandler,
      maxContextDepth: this.maxContextDepth,

      // Create context snapshot
      contextSnapshot: this.createContextSnapshot(options.includeSnapshot),

      // Parent route
      parentRoute: {
        method: options.routeMethod || 'direct',
        endpoint: options.routeEndpoint || null,
        protocol: options.routeProtocol || 'ipc'
      }
    });

    // Track child
    this.childAgents.set(childContext.agentId, childContext);

    // Forward child events to parent
    childContext.on('message', (msg) => {
      this.emit('child_message', { childId: childContext.agentId, message: msg });
    });

    childContext.on('context_overflow', (data) => {
      this.emit('child_overflow', { childId: childContext.agentId, data });
    });

    console.log(`[SubAgentContext] Agent ${this.agentId} spawned child ${childContext.agentId} (depth: ${childContext.contextDepth})`);

    return childContext;
  }

  /**
   * Create a snapshot of current context (for passing to children)
   */
  createContextSnapshot(includeKeys = null) {
    const snapshot = {
      agentId: this.agentId,
      platform: this.platform,
      deviceType: this.deviceType,
      databaseId: this.databaseId,
      contextDepth: this.contextDepth,
      spawnedAt: this.spawnedAt,
      timestamp: new Date()
    };

    // Include specific keys if requested
    if (includeKeys && Array.isArray(includeKeys)) {
      for (const key of includeKeys) {
        if (this.contextSnapshot[key] !== undefined) {
          snapshot[key] = this.contextSnapshot[key];
        }
      }
    }

    // Include parent snapshot if available
    if (this.parentContext && this.parentContext.contextSnapshot) {
      snapshot.parentSnapshot = {
        agentId: this.parentContext.agentId,
        platform: this.parentContext.platform,
        deviceType: this.parentContext.deviceType,
        contextDepth: this.parentContext.contextDepth
      };
    }

    return snapshot;
  }

  /**
   * Add parent route for loop-back communication
   */
  addParentRoute(parentId, routeConfig) {
    this.parentRoutes.set(parentId, {
      parentId,
      method: routeConfig.method || 'direct',
      endpoint: routeConfig.endpoint || null,
      protocol: routeConfig.protocol || 'ipc',
      addedAt: new Date()
    });
  }

  /**
   * Send message to parent agent
   */
  async messageParent(message, options = {}) {
    if (!this.isSubAgent || !this.parentAgentId) {
      throw new Error('Cannot message parent: not a sub-agent or no parent ID');
    }

    const route = this.parentRoutes.get(this.parentAgentId);
    if (!route) {
      throw new Error(`No route to parent agent ${this.parentAgentId}`);
    }

    const envelope = {
      from: this.agentId,
      to: this.parentAgentId,
      message,
      timestamp: new Date(),
      route: route.method,
      protocol: route.protocol
    };

    // Emit for IPC system to handle
    this.emit('send_to_parent', envelope);

    console.log(`[SubAgentContext] Agent ${this.agentId} → Parent ${this.parentAgentId}: ${message.type || 'message'}`);

    return envelope;
  }

  /**
   * Send message to child agent
   */
  async messageChild(childId, message, options = {}) {
    const child = this.childAgents.get(childId);
    if (!child) {
      throw new Error(`Unknown child agent: ${childId}`);
    }

    const envelope = {
      from: this.agentId,
      to: childId,
      message,
      timestamp: new Date()
    };

    // Emit for IPC system to handle
    this.emit('send_to_child', { childId, envelope });

    console.log(`[SubAgentContext] Agent ${this.agentId} → Child ${childId}: ${message.type || 'message'}`);

    return envelope;
  }

  /**
   * Broadcast message to all children
   */
  async broadcastToChildren(message, options = {}) {
    const results = [];

    for (const [childId, child] of this.childAgents.entries()) {
      try {
        const result = await this.messageChild(childId, message, options);
        results.push({ childId, success: true, result });
      } catch (error) {
        results.push({ childId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get full context chain (from root to this agent)
   */
  getContextChain() {
    const chain = [];
    let current = this;

    while (current) {
      chain.unshift({
        agentId: current.agentId,
        isSubAgent: current.isSubAgent,
        platform: current.platform,
        deviceType: current.deviceType,
        contextDepth: current.contextDepth,
        spawnedAt: current.spawnedAt
      });

      current = current.parentContext;
    }

    return chain;
  }

  /**
   * Get root agent in context chain
   */
  getRootAgent() {
    let current = this;
    while (current.parentContext) {
      current = current.parentContext;
    }
    return current;
  }

  /**
   * Check if this agent is ancestor of another agent
   */
  isAncestorOf(agentId) {
    for (const [childId, child] of this.childAgents.entries()) {
      if (childId === agentId) {
        return true;
      }
      if (child.isAncestorOf(agentId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get platform-specific database connection info
   */
  getDatabaseConfig() {
    return {
      databaseId: this.databaseId,
      shardKey: this.databaseShardKey,
      platform: this.platform,
      deviceType: this.deviceType,
      isLocal: this.isLocal,
      ipAddress: this.ipAddress
    };
  }

  /**
   * Update context metadata
   */
  updateContext(updates) {
    const allowed = ['platform', 'deviceType', 'ipAddress', 'isLocal', 'databaseId', 'databaseShardKey'];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        this[key] = updates[key];
      }
    }

    console.log(`[SubAgentContext] Agent ${this.agentId} context updated:`, updates);
  }

  /**
   * Get agent info
   */
  getInfo() {
    return {
      agentId: this.agentId,
      isSubAgent: this.isSubAgent,
      parentAgentId: this.parentAgentId,
      platform: this.platform,
      deviceType: this.deviceType,
      databaseId: this.databaseId,
      contextDepth: this.contextDepth,
      childCount: this.childAgents.size,
      spawnedAt: this.spawnedAt,
      uptime: Date.now() - this.spawnedAt.getTime()
    };
  }

  /**
   * Get stats
   */
  getStats() {
    const chain = this.getContextChain();
    const root = this.getRootAgent();

    return {
      agentId: this.agentId,
      isSubAgent: this.isSubAgent,
      contextDepth: this.contextDepth,
      maxDepth: this.maxContextDepth,
      childCount: this.childAgents.size,
      totalChildren: this.countAllDescendants(),
      chainLength: chain.length,
      rootAgentId: root.agentId,
      platform: this.platform,
      deviceType: this.deviceType,
      databaseId: this.databaseId,
      uptime: Date.now() - this.spawnedAt.getTime()
    };
  }

  /**
   * Count all descendants (recursive)
   */
  countAllDescendants() {
    let count = this.childAgents.size;

    for (const child of this.childAgents.values()) {
      count += child.countAllDescendants();
    }

    return count;
  }

  /**
   * Clean up agent and all children
   */
  async destroy() {
    console.log(`[SubAgentContext] Destroying agent ${this.agentId} and ${this.childAgents.size} children`);

    // Destroy all children first
    for (const child of this.childAgents.values()) {
      await child.destroy();
    }

    this.childAgents.clear();
    this.parentRoutes.clear();

    // Emit destroy event
    this.emit('destroyed', { agentId: this.agentId });

    // Remove all listeners
    this.removeAllListeners();
  }
}

/**
 * Helper function to initialize worker with context
 */
function initializeWorker(WorkerClass, parentContext, options = {}) {
  // Create sub-agent context
  const context = parentContext.spawnChild({
    spawnReason: options.reason || `spawn_${WorkerClass.name}`,
    platform: options.platform || parentContext.platform,
    deviceType: options.deviceType || parentContext.deviceType,
    databaseId: options.databaseId || parentContext.databaseId,
    includeSnapshot: options.includeSnapshot || null,
    routeMethod: options.routeMethod || 'direct',
    routeProtocol: options.routeProtocol || 'ipc'
  });

  // Create worker with context
  const worker = new WorkerClass({
    ...options,
    subAgentContext: context,
    db: options.db || null // Database will be routed by platform router
  });

  // Attach context to worker
  worker.context = context;

  console.log(`[SubAgentContext] Initialized worker ${WorkerClass.name} with context ${context.agentId}`);

  return { worker, context };
}

module.exports = { SubAgentContext, initializeWorker };
