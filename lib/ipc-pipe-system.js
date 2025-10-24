/**
 * IPC Pipe System
 *
 * Standardized inter-process communication for agent mesh.
 * Provides pipes for agents to communicate with each other,
 * especially for parent-child agent communication.
 *
 * Features:
 * - Bidirectional pipes (parent ↔ child)
 * - Message routing by agent ID
 * - Protocol support (IPC, WebSocket, HTTP)
 * - Message queuing and buffering
 * - Pipe lifecycle management
 * - Error handling and retries
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class IPCPipeSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    // Pipes: Map<pipeId, pipe>
    this.pipes = new Map();

    // Agent → Pipes mapping
    this.agentPipes = new Map(); // Map<agentId, Set<pipeId>>

    // Message queue: Map<pipeId, Array<message>>
    this.messageQueues = new Map();

    // Protocol handlers
    this.protocols = {
      ipc: this.handleIPCProtocol.bind(this),
      websocket: this.handleWebSocketProtocol.bind(this),
      http: this.handleHTTPProtocol.bind(this)
    };

    // Config
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.messageTimeout = options.messageTimeout || 30000; // 30 seconds
    this.retryAttempts = options.retryAttempts || 3;

    // Stats
    this.stats = {
      totalPipes: 0,
      activePipes: 0,
      messagesSent: 0,
      messagesReceived: 0,
      messagesDropped: 0,
      errors: 0
    };

    console.log('[IPCPipeSystem] Initialized');
  }

  /**
   * Create a pipe between two agents
   */
  createPipe(fromAgentId, toAgentId, options = {}) {
    const pipeId = crypto.randomUUID();

    const pipe = {
      pipeId,
      fromAgentId,
      toAgentId,
      protocol: options.protocol || 'ipc',
      bidirectional: options.bidirectional !== false,
      status: 'active',
      createdAt: new Date(),
      metadata: options.metadata || {},

      // Stats
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      lastActivity: new Date()
    };

    this.pipes.set(pipeId, pipe);
    this.stats.totalPipes++;
    this.stats.activePipes++;

    // Track pipes for each agent
    if (!this.agentPipes.has(fromAgentId)) {
      this.agentPipes.set(fromAgentId, new Set());
    }
    this.agentPipes.get(fromAgentId).add(pipeId);

    if (!this.agentPipes.has(toAgentId)) {
      this.agentPipes.set(toAgentId, new Set());
    }
    this.agentPipes.get(toAgentId).add(pipeId);

    // Create message queue
    this.messageQueues.set(pipeId, []);

    console.log(`[IPCPipeSystem] Created pipe ${pipeId}: ${fromAgentId} → ${toAgentId} (${pipe.protocol})`);

    // Emit event
    this.emit('pipe_created', pipe);

    return pipeId;
  }

  /**
   * Send message through pipe
   */
  async sendMessage(pipeId, message, options = {}) {
    const pipe = this.pipes.get(pipeId);
    if (!pipe) {
      throw new Error(`Pipe not found: ${pipeId}`);
    }

    if (pipe.status !== 'active') {
      throw new Error(`Pipe ${pipeId} is not active (status: ${pipe.status})`);
    }

    // Create message envelope
    const envelope = {
      messageId: crypto.randomUUID(),
      pipeId,
      fromAgentId: pipe.fromAgentId,
      toAgentId: pipe.toAgentId,
      message,
      protocol: pipe.protocol,
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: options.retryAttempts || this.retryAttempts,
      timeout: options.timeout || this.messageTimeout
    };

    // Check queue size
    const queue = this.messageQueues.get(pipeId);
    if (queue.length >= this.maxQueueSize) {
      this.stats.messagesDropped++;
      throw new Error(`Message queue full for pipe ${pipeId}`);
    }

    // Add to queue
    queue.push(envelope);

    // Update stats
    pipe.messagesSent++;
    pipe.lastActivity = new Date();
    this.stats.messagesSent++;

    // Process message based on protocol
    try {
      const result = await this.processMessage(envelope);

      // Remove from queue on success
      const index = queue.indexOf(envelope);
      if (index !== -1) {
        queue.splice(index, 1);
      }

      // Emit event
      this.emit('message_sent', {
        pipeId,
        messageId: envelope.messageId,
        fromAgentId: envelope.fromAgentId,
        toAgentId: envelope.toAgentId
      });

      return result;
    } catch (error) {
      pipe.errors++;
      this.stats.errors++;

      console.error(`[IPCPipeSystem] Error sending message on pipe ${pipeId}:`, error.message);

      // Retry logic
      if (envelope.attempts < envelope.maxAttempts) {
        envelope.attempts++;
        console.log(`[IPCPipeSystem] Retrying message ${envelope.messageId} (attempt ${envelope.attempts}/${envelope.maxAttempts})`);

        // Retry after delay
        setTimeout(() => {
          this.retryMessage(envelope);
        }, 1000 * envelope.attempts); // Exponential backoff
      } else {
        // Remove from queue after max retries
        const index = queue.indexOf(envelope);
        if (index !== -1) {
          queue.splice(index, 1);
        }

        this.emit('message_failed', {
          pipeId,
          messageId: envelope.messageId,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Process message based on protocol
   */
  async processMessage(envelope) {
    const handler = this.protocols[envelope.protocol];
    if (!handler) {
      throw new Error(`Unknown protocol: ${envelope.protocol}`);
    }

    return await handler(envelope);
  }

  /**
   * Retry failed message
   */
  async retryMessage(envelope) {
    try {
      const result = await this.processMessage(envelope);

      // Remove from queue on success
      const queue = this.messageQueues.get(envelope.pipeId);
      const index = queue.indexOf(envelope);
      if (index !== -1) {
        queue.splice(index, 1);
      }

      this.emit('message_sent', {
        pipeId: envelope.pipeId,
        messageId: envelope.messageId,
        fromAgentId: envelope.fromAgentId,
        toAgentId: envelope.toAgentId,
        retried: true
      });

      return result;
    } catch (error) {
      console.error(`[IPCPipeSystem] Retry failed for message ${envelope.messageId}:`, error.message);
    }
  }

  /**
   * Handle IPC protocol (in-process communication)
   */
  async handleIPCProtocol(envelope) {
    // Emit event for in-process delivery
    this.emit('ipc_message', {
      toAgentId: envelope.toAgentId,
      fromAgentId: envelope.fromAgentId,
      message: envelope.message,
      messageId: envelope.messageId
    });

    return { success: true, protocol: 'ipc', delivered: true };
  }

  /**
   * Handle WebSocket protocol
   */
  async handleWebSocketProtocol(envelope) {
    // In production, send via WebSocket
    console.log(`[IPCPipeSystem] WebSocket message ${envelope.messageId}: ${envelope.fromAgentId} → ${envelope.toAgentId}`);

    // Emit event for WebSocket delivery
    this.emit('websocket_message', {
      toAgentId: envelope.toAgentId,
      fromAgentId: envelope.fromAgentId,
      message: envelope.message,
      messageId: envelope.messageId
    });

    return { success: true, protocol: 'websocket', delivered: true };
  }

  /**
   * Handle HTTP protocol
   */
  async handleHTTPProtocol(envelope) {
    // In production, send via HTTP POST
    console.log(`[IPCPipeSystem] HTTP message ${envelope.messageId}: ${envelope.fromAgentId} → ${envelope.toAgentId}`);

    // Emit event for HTTP delivery
    this.emit('http_message', {
      toAgentId: envelope.toAgentId,
      fromAgentId: envelope.fromAgentId,
      message: envelope.message,
      messageId: envelope.messageId
    });

    return { success: true, protocol: 'http', delivered: true };
  }

  /**
   * Receive message on pipe
   */
  receiveMessage(pipeId, message) {
    const pipe = this.pipes.get(pipeId);
    if (!pipe) {
      console.warn(`[IPCPipeSystem] Received message for unknown pipe: ${pipeId}`);
      return;
    }

    pipe.messagesReceived++;
    pipe.lastActivity = new Date();
    this.stats.messagesReceived++;

    this.emit('message_received', {
      pipeId,
      toAgentId: pipe.toAgentId,
      fromAgentId: pipe.fromAgentId,
      message
    });
  }

  /**
   * Get all pipes for an agent
   */
  getAgentPipes(agentId) {
    const pipeIds = this.agentPipes.get(agentId);
    if (!pipeIds) {
      return [];
    }

    return Array.from(pipeIds).map(pipeId => this.pipes.get(pipeId)).filter(Boolean);
  }

  /**
   * Find pipe between two agents
   */
  findPipe(fromAgentId, toAgentId) {
    for (const pipe of this.pipes.values()) {
      if (pipe.fromAgentId === fromAgentId && pipe.toAgentId === toAgentId) {
        return pipe;
      }

      // Check bidirectional
      if (pipe.bidirectional && pipe.fromAgentId === toAgentId && pipe.toAgentId === fromAgentId) {
        return pipe;
      }
    }

    return null;
  }

  /**
   * Close a pipe
   */
  closePipe(pipeId) {
    const pipe = this.pipes.get(pipeId);
    if (!pipe) {
      return false;
    }

    pipe.status = 'closed';
    pipe.closedAt = new Date();

    // Clear message queue
    this.messageQueues.delete(pipeId);

    // Update stats
    this.stats.activePipes--;

    console.log(`[IPCPipeSystem] Closed pipe ${pipeId}`);

    this.emit('pipe_closed', { pipeId, pipe });

    return true;
  }

  /**
   * Remove a pipe completely
   */
  removePipe(pipeId) {
    const pipe = this.pipes.get(pipeId);
    if (!pipe) {
      return false;
    }

    // Remove from agent mappings
    const fromPipes = this.agentPipes.get(pipe.fromAgentId);
    if (fromPipes) {
      fromPipes.delete(pipeId);
    }

    const toPipes = this.agentPipes.get(pipe.toAgentId);
    if (toPipes) {
      toPipes.delete(pipeId);
    }

    // Remove pipe and queue
    this.pipes.delete(pipeId);
    this.messageQueues.delete(pipeId);

    console.log(`[IPCPipeSystem] Removed pipe ${pipeId}`);

    this.emit('pipe_removed', { pipeId });

    return true;
  }

  /**
   * Get pipe info
   */
  getPipeInfo(pipeId) {
    const pipe = this.pipes.get(pipeId);
    if (!pipe) {
      return null;
    }

    const queue = this.messageQueues.get(pipeId) || [];

    return {
      ...pipe,
      queuedMessages: queue.length,
      uptime: Date.now() - pipe.createdAt.getTime()
    };
  }

  /**
   * Get all pipes info
   */
  getAllPipesInfo() {
    const pipesInfo = [];

    for (const [pipeId, pipe] of this.pipes.entries()) {
      pipesInfo.push(this.getPipeInfo(pipeId));
    }

    return pipesInfo;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalQueued: Array.from(this.messageQueues.values()).reduce((sum, queue) => sum + queue.length, 0),
      averageQueueSize: this.pipes.size > 0
        ? Array.from(this.messageQueues.values()).reduce((sum, queue) => sum + queue.length, 0) / this.pipes.size
        : 0
    };
  }

  /**
   * Clean up old closed pipes
   */
  cleanupOldPipes(olderThan = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [pipeId, pipe] of this.pipes.entries()) {
      if (pipe.status === 'closed' && pipe.closedAt) {
        const age = now - pipe.closedAt.getTime();
        if (age > olderThan) {
          this.removePipe(pipeId);
          cleaned++;
        }
      }
    }

    console.log(`[IPCPipeSystem] Cleaned up ${cleaned} old pipes`);
    return cleaned;
  }

  /**
   * Broadcast message to all pipes from an agent
   */
  async broadcastFromAgent(agentId, message, options = {}) {
    const pipes = this.getAgentPipes(agentId);
    const results = [];

    for (const pipe of pipes) {
      // Only send on pipes where this agent is the sender
      if (pipe.fromAgentId === agentId) {
        try {
          const result = await this.sendMessage(pipe.pipeId, message, options);
          results.push({ pipeId: pipe.pipeId, success: true, result });
        } catch (error) {
          results.push({ pipeId: pipe.pipeId, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Shutdown pipe system
   */
  async shutdown() {
    console.log(`[IPCPipeSystem] Shutting down (${this.pipes.size} pipes)...`);

    // Close all active pipes
    for (const pipeId of this.pipes.keys()) {
      this.closePipe(pipeId);
    }

    // Clear all data
    this.pipes.clear();
    this.agentPipes.clear();
    this.messageQueues.clear();

    this.removeAllListeners();

    console.log('[IPCPipeSystem] Shutdown complete');
  }
}

/**
 * Helper to integrate IPC system with SubAgentContext
 */
function connectIPCToContext(ipcSystem, subAgentContext) {
  // Listen for parent messages
  subAgentContext.on('send_to_parent', async (envelope) => {
    // Find or create pipe to parent
    let pipe = ipcSystem.findPipe(subAgentContext.agentId, subAgentContext.parentAgentId);

    if (!pipe) {
      // Create pipe
      const pipeId = ipcSystem.createPipe(
        subAgentContext.agentId,
        subAgentContext.parentAgentId,
        {
          protocol: envelope.protocol || 'ipc',
          bidirectional: true
        }
      );
      pipe = ipcSystem.pipes.get(pipeId);
    }

    // Send message
    try {
      await ipcSystem.sendMessage(pipe.pipeId, envelope.message);
    } catch (error) {
      console.error('[IPCPipeSystem] Failed to send to parent:', error.message);
    }
  });

  // Listen for child messages
  subAgentContext.on('send_to_child', async ({ childId, envelope }) => {
    // Find or create pipe to child
    let pipe = ipcSystem.findPipe(subAgentContext.agentId, childId);

    if (!pipe) {
      // Create pipe
      const pipeId = ipcSystem.createPipe(
        subAgentContext.agentId,
        childId,
        {
          protocol: 'ipc',
          bidirectional: true
        }
      );
      pipe = ipcSystem.pipes.get(pipeId);
    }

    // Send message
    try {
      await ipcSystem.sendMessage(pipe.pipeId, envelope.message);
    } catch (error) {
      console.error('[IPCPipeSystem] Failed to send to child:', error.message);
    }
  });

  // Listen for incoming IPC messages
  ipcSystem.on('ipc_message', (data) => {
    if (data.toAgentId === subAgentContext.agentId) {
      subAgentContext.emit('message', {
        from: data.fromAgentId,
        message: data.message,
        messageId: data.messageId
      });
    }
  });
}

module.exports = { IPCPipeSystem, connectIPCToContext };
