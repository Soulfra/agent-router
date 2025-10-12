/**
 * Agent Mesh - Distributed Agent Network
 *
 * Enables agents to discover, communicate with, and delegate to each other
 * in a "mycelium-like" pattern - interconnected network with emergent behavior.
 *
 * Features:
 * - Agent-to-agent communication
 * - Automatic delegation chains
 * - Load balancing across network
 * - Fault tolerance
 * - Discovery protocol
 * - Health monitoring
 */

const EventEmitter = require('events');

class AgentMesh extends EventEmitter {
  constructor(options = {}) {
    super();

    this.nodes = new Map(); // agentId -> node info
    this.connections = new Map(); // agentId -> Set<connected agentIds>
    this.messageQueue = [];
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.maxHops = options.maxHops || 5; // Prevent infinite delegation loops

    // Start health monitoring
    this._startHealthMonitoring();
  }

  /**
   * Register an agent node in the mesh
   */
  registerNode(agentId, metadata = {}) {
    if (this.nodes.has(agentId)) {
      console.warn(`Agent ${agentId} already registered in mesh`);
      return false;
    }

    const node = {
      id: agentId,
      ...metadata,
      status: 'online',
      lastSeen: Date.now(),
      capabilities: metadata.capabilities || [],
      connections: new Set(),
      stats: {
        messagesReceived: 0,
        messagesSent: 0,
        delegationsReceived: 0,
        delegationsSent: 0,
        successfulRequests: 0,
        failedRequests: 0
      }
    };

    this.nodes.set(agentId, node);
    this.connections.set(agentId, new Set());

    console.log(`🕸️  Agent ${agentId} joined the mesh`);

    this.emit('node:join', { agentId, node });

    return true;
  }

  /**
   * Remove agent from mesh
   */
  unregisterNode(agentId) {
    if (!this.nodes.has(agentId)) {
      return false;
    }

    // Remove all connections
    for (const [nodeId, connections] of this.connections) {
      connections.delete(agentId);
    }

    this.connections.delete(agentId);
    this.nodes.delete(agentId);

    console.log(`🕸️  Agent ${agentId} left the mesh`);

    this.emit('node:leave', { agentId });

    return true;
  }

  /**
   * Connect two agents
   */
  connect(agentId1, agentId2) {
    if (!this.nodes.has(agentId1) || !this.nodes.has(agentId2)) {
      return false;
    }

    this.connections.get(agentId1).add(agentId2);
    this.connections.get(agentId2).add(agentId1);

    const node1 = this.nodes.get(agentId1);
    const node2 = this.nodes.get(agentId2);

    node1.connections.add(agentId2);
    node2.connections.add(agentId1);

    console.log(`🔗 Connected ${agentId1} ↔ ${agentId2}`);

    this.emit('connection:created', { agentId1, agentId2 });

    return true;
  }

  /**
   * Disconnect two agents
   */
  disconnect(agentId1, agentId2) {
    if (!this.connections.has(agentId1) || !this.connections.has(agentId2)) {
      return false;
    }

    this.connections.get(agentId1).delete(agentId2);
    this.connections.get(agentId2).delete(agentId1);

    const node1 = this.nodes.get(agentId1);
    const node2 = this.nodes.get(agentId2);

    if (node1) node1.connections.delete(agentId2);
    if (node2) node2.connections.delete(agentId1);

    console.log(`❌ Disconnected ${agentId1} ↮ ${agentId2}`);

    this.emit('connection:removed', { agentId1, agentId2 });

    return true;
  }

  /**
   * Send message from one agent to another
   */
  async sendMessage(fromAgent, toAgent, message, metadata = {}) {
    if (!this.nodes.has(fromAgent) || !this.nodes.has(toAgent)) {
      throw new Error(`Agent not found in mesh: ${fromAgent} or ${toAgent}`);
    }

    const messageId = this._generateMessageId();

    const messageEnvelope = {
      id: messageId,
      from: fromAgent,
      to: toAgent,
      message,
      metadata,
      timestamp: Date.now(),
      hops: 0,
      path: [fromAgent]
    };

    // Update stats
    const senderNode = this.nodes.get(fromAgent);
    const receiverNode = this.nodes.get(toAgent);

    senderNode.stats.messagesSent++;
    receiverNode.stats.messagesReceived++;

    this.emit('message:sent', messageEnvelope);

    return messageEnvelope;
  }

  /**
   * Delegate task to another agent (with routing)
   */
  async delegate(fromAgent, toAgent, task, options = {}) {
    const delegation = {
      id: this._generateMessageId(),
      from: fromAgent,
      to: toAgent,
      task,
      options,
      timestamp: Date.now(),
      hops: 0,
      path: [fromAgent],
      reason: options.reason || 'manual-delegation'
    };

    console.log(`🔀 Delegation: ${fromAgent} → ${toAgent} (${delegation.reason})`);

    // Update stats
    const senderNode = this.nodes.get(fromAgent);
    const receiverNode = this.nodes.get(toAgent);

    if (senderNode) senderNode.stats.delegationsSent++;
    if (receiverNode) receiverNode.stats.delegationsReceived++;

    this.emit('delegation:created', delegation);

    return delegation;
  }

  /**
   * Find best agent for a task (capability-based routing)
   */
  findBestAgent(capability, exclude = []) {
    let bestAgent = null;
    let lowestLoad = Infinity;

    for (const [agentId, node] of this.nodes) {
      // Skip excluded agents
      if (exclude.includes(agentId)) continue;

      // Skip offline agents
      if (node.status !== 'online') continue;

      // Check capability
      if (!node.capabilities.includes(capability)) continue;

      // Get current load (requests / maxConcurrent)
      const load = node.currentLoad || 0;
      const max = node.maxConcurrent || 10;
      const loadRatio = load / max;

      if (loadRatio < lowestLoad) {
        lowestLoad = loadRatio;
        bestAgent = agentId;
      }
    }

    return bestAgent;
  }

  /**
   * Find delegation path using breadth-first search
   */
  findDelegationPath(fromAgent, capability, maxHops = this.maxHops) {
    if (!this.nodes.has(fromAgent)) {
      return null;
    }

    // BFS to find agent with capability
    const queue = [[fromAgent]];
    const visited = new Set([fromAgent]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      // Check if current agent has capability
      const currentNode = this.nodes.get(current);
      if (currentNode && currentNode.capabilities.includes(capability) && current !== fromAgent) {
        return path;
      }

      // Exceeded max hops
      if (path.length >= maxHops) continue;

      // Explore connections
      const connections = this.connections.get(current) || new Set();
      for (const neighbor of connections) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get agent neighbors (directly connected)
   */
  getNeighbors(agentId) {
    if (!this.connections.has(agentId)) {
      return [];
    }

    return Array.from(this.connections.get(agentId));
  }

  /**
   * Get all agents with a specific capability
   */
  getAgentsByCapability(capability) {
    const agents = [];

    for (const [agentId, node] of this.nodes) {
      if (node.capabilities.includes(capability)) {
        agents.push(agentId);
      }
    }

    return agents;
  }

  /**
   * Update node status
   */
  updateNodeStatus(agentId, status) {
    const node = this.nodes.get(agentId);
    if (!node) return false;

    const oldStatus = node.status;
    node.status = status;
    node.lastSeen = Date.now();

    if (oldStatus !== status) {
      console.log(`🕸️  ${agentId} status: ${oldStatus} → ${status}`);
      this.emit('node:status_change', { agentId, oldStatus, newStatus: status });
    }

    return true;
  }

  /**
   * Get mesh statistics
   */
  getStats() {
    const stats = {
      totalNodes: this.nodes.size,
      onlineNodes: 0,
      offlineNodes: 0,
      totalConnections: 0,
      totalMessages: 0,
      totalDelegations: 0,
      avgConnectionsPerNode: 0,
      capabilities: new Set()
    };

    for (const [agentId, node] of this.nodes) {
      if (node.status === 'online') {
        stats.onlineNodes++;
      } else {
        stats.offlineNodes++;
      }

      stats.totalMessages += node.stats.messagesSent + node.stats.messagesReceived;
      stats.totalDelegations += node.stats.delegationsSent + node.stats.delegationsReceived;

      node.capabilities.forEach(cap => stats.capabilities.add(cap));
    }

    for (const connections of this.connections.values()) {
      stats.totalConnections += connections.size;
    }

    stats.totalConnections = stats.totalConnections / 2; // Each connection counted twice
    stats.avgConnectionsPerNode = stats.totalNodes > 0
      ? (stats.totalConnections * 2) / stats.totalNodes
      : 0;

    stats.capabilities = Array.from(stats.capabilities);

    return stats;
  }

  /**
   * Get network topology (for visualization)
   */
  getTopology() {
    const topology = {
      nodes: [],
      edges: []
    };

    // Add nodes
    for (const [agentId, node] of this.nodes) {
      topology.nodes.push({
        id: agentId,
        label: node.name || agentId,
        status: node.status,
        capabilities: node.capabilities,
        connections: node.connections.size
      });
    }

    // Add edges (undirected)
    const added = new Set();
    for (const [agentId1, connections] of this.connections) {
      for (const agentId2 of connections) {
        const edge = [agentId1, agentId2].sort().join('--');
        if (!added.has(edge)) {
          topology.edges.push({
            source: agentId1,
            target: agentId2
          });
          added.add(edge);
        }
      }
    }

    return topology;
  }

  /**
   * Internal: Start health monitoring
   */
  _startHealthMonitoring() {
    setInterval(() => {
      const now = Date.now();
      const timeout = this.healthCheckInterval * 2;

      for (const [agentId, node] of this.nodes) {
        if (now - node.lastSeen > timeout && node.status === 'online') {
          console.log(`⚠️  ${agentId} appears offline (last seen ${Math.floor((now - node.lastSeen) / 1000)}s ago)`);
          this.updateNodeStatus(agentId, 'offline');
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Internal: Generate unique message ID
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = AgentMesh;
