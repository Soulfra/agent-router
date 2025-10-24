/**
 * Session Block Manager
 *
 * Blockchain-inspired session management where each request is a "block":
 * - Block ID = unique session identifier
 * - Priority = "gas" for queue ordering
 * - Deadline = block timeout
 * - Room = persistent execution context
 * - Status = block state (pending → executing → completed/timeout)
 *
 * Like Ethereum blocks with Blocknative-style monitoring.
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class SessionBlockManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.broadcast = options.broadcast || (() => {});

    // Active blocks in memory
    this.activeBlocks = new Map(); // blockId → block data

    // Block configuration
    this.config = {
      defaultPriority: 50, // 0-100 (higher = faster)
      defaultDeadlineMs: 300000, // 5 minutes
      urgentPriority: 90,
      lowPriority: 10,
      autoBoostThreshold: 60000, // Auto-boost if < 1 min to deadline
      ...options
    };

    console.log('[SessionBlockManager] Initialized');
  }

  /**
   * Create a new session block
   *
   * @param {object} blockData - Block configuration
   * @returns {Promise<object>} - Created block
   */
  async createBlock(blockData) {
    const blockId = blockData.blockId || crypto.randomUUID();
    const now = new Date();

    // Calculate deadline
    const deadlineMs = blockData.deadlineMs || this.config.defaultDeadlineMs;
    const deadlineAt = new Date(now.getTime() + deadlineMs);

    // Determine priority (gas)
    let priority = blockData.priority || this.config.defaultPriority;

    // Auto-set priority based on request type
    if (blockData.urgent || blockData.type === 'urgent') {
      priority = this.config.urgentPriority;
    }

    const block = {
      blockId,
      sessionId: blockData.sessionId || null,
      userId: blockData.userId || null,
      roomId: blockData.roomId || null,
      roomSlug: blockData.roomSlug || null,

      // Priority & timing (blockchain-like)
      priority, // "Gas" - higher = faster execution
      status: 'pending',
      createdAt: now,
      deadlineAt,
      executedAt: null,
      completedAt: null,
      timeoutAt: null,

      // Block data
      blockData: {
        model: blockData.model || null,
        prompt: blockData.prompt || null,
        context: blockData.context || {},
        type: blockData.type || 'agent_request',
        metadata: blockData.metadata || {}
      },

      // Results
      result: null,
      error: null,

      // Stats
      queueTime: null, // Time spent in queue
      executionTime: null // Time spent executing
    };

    // Store in memory
    this.activeBlocks.set(blockId, block);

    // Save to database
    if (this.db) {
      await this._saveBlockToDatabase(block);
    }

    // Emit event and broadcast
    const createdData = {
      blockId,
      priority,
      status: 'pending',
      deadlineAt,
      roomId: block.roomId,
      type: blockData.type
    };
    this.emit('block:created', createdData);
    this.broadcast({ type: 'session_block:created', ...createdData });

    console.log(`[SessionBlock] Created block ${blockId.slice(0, 8)} (priority: ${priority}, room: ${block.roomSlug || block.roomId || 'none'})`);

    return block;
  }

  /**
   * Update block status (state transition)
   */
  async updateBlockStatus(blockId, newStatus, data = {}) {
    const block = this.activeBlocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const oldStatus = block.status;
    block.status = newStatus;

    const now = new Date();

    // Update timestamps based on state
    switch (newStatus) {
      case 'executing':
        block.executedAt = now;
        block.queueTime = now - block.createdAt;
        break;

      case 'completed':
        block.completedAt = now;
        block.executionTime = now - (block.executedAt || block.createdAt);
        block.result = data.result || null;
        break;

      case 'timeout':
        block.timeoutAt = now;
        block.error = 'Deadline exceeded';
        break;

      case 'failed':
        block.completedAt = now;
        block.error = data.error || 'Unknown error';
        break;
    }

    // Update database
    if (this.db) {
      await this._updateBlockInDatabase(block);
    }

    // Emit event and broadcast
    const statusData = {
      blockId,
      status: newStatus,
      oldStatus,
      queueTime: block.queueTime,
      executionTime: block.executionTime,
      timestamp: now
    };
    this.emit('block:status_change', statusData);
    this.broadcast({ type: 'session_block:status', ...statusData });

    console.log(`[SessionBlock] ${blockId.slice(0, 8)}: ${oldStatus} → ${newStatus}`);

    // Clean up completed blocks after delay
    if (['completed', 'timeout', 'failed'].includes(newStatus)) {
      setTimeout(() => {
        this.activeBlocks.delete(blockId);
        console.log(`[SessionBlock] Cleaned up block ${blockId.slice(0, 8)}`);
      }, 60000); // Keep for 1 minute
    }

    return block;
  }

  /**
   * Boost block priority (increase gas)
   */
  async boostPriority(blockId, boostAmount = 10) {
    const block = this.activeBlocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const oldPriority = block.priority;
    block.priority = Math.min(100, block.priority + boostAmount);

    // Update database
    if (this.db) {
      await this.db.query(
        'UPDATE session_blocks SET priority = $1 WHERE block_id = $2',
        [block.priority, blockId]
      );
    }

    // Emit event
    this.emit('block:priority_boost', {
      blockId,
      oldPriority,
      newPriority: block.priority
    });

    console.log(`[SessionBlock] Boosted ${blockId.slice(0, 8)}: priority ${oldPriority} → ${block.priority}`);

    return block;
  }

  /**
   * Auto-boost blocks approaching deadline
   */
  autoBoostNearDeadline() {
    const now = Date.now();

    for (const [blockId, block] of this.activeBlocks) {
      if (block.status !== 'pending') continue;

      const timeToDeadline = block.deadlineAt - now;

      // Auto-boost if less than threshold and not already high priority
      if (timeToDeadline < this.config.autoBoostThreshold && block.priority < 80) {
        this.boostPriority(blockId, 20);
      }

      // Timeout if deadline exceeded
      if (timeToDeadline < 0 && block.status === 'executing') {
        this.updateBlockStatus(blockId, 'timeout');
      }
    }
  }

  /**
   * Get block by ID
   */
  getBlock(blockId) {
    return this.activeBlocks.get(blockId);
  }

  /**
   * Get blocks by room
   */
  getBlocksByRoom(roomId) {
    return Array.from(this.activeBlocks.values())
      .filter(b => b.roomId === roomId);
  }

  /**
   * Get blocks by status
   */
  getBlocksByStatus(status) {
    return Array.from(this.activeBlocks.values())
      .filter(b => b.status === status);
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const blocks = Array.from(this.activeBlocks.values());

    const stats = {
      total: blocks.length,
      pending: blocks.filter(b => b.status === 'pending').length,
      executing: blocks.filter(b => b.status === 'executing').length,
      completed: blocks.filter(b => b.status === 'completed').length,
      failed: blocks.filter(b => b.status === 'failed').length,
      timeout: blocks.filter(b => b.status === 'timeout').length,

      // Priority distribution
      highPriority: blocks.filter(b => b.priority >= 75).length,
      mediumPriority: blocks.filter(b => b.priority >= 40 && b.priority < 75).length,
      lowPriority: blocks.filter(b => b.priority < 40).length,

      // Room distribution
      byRoom: {}
    };

    // Group by room
    for (const block of blocks) {
      const roomKey = block.roomSlug || block.roomId || 'unassigned';
      stats.byRoom[roomKey] = (stats.byRoom[roomKey] || 0) + 1;
    }

    return stats;
  }

  /**
   * Save block to database
   * @private
   */
  async _saveBlockToDatabase(block) {
    try {
      await this.db.query(
        `INSERT INTO session_blocks (
          block_id, session_id, user_id, room_id, priority, status,
          deadline_at, created_at, block_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          block.blockId,
          block.sessionId,
          block.userId,
          block.roomId,
          block.priority,
          block.status,
          block.deadlineAt,
          block.createdAt,
          JSON.stringify(block.blockData)
        ]
      );
    } catch (error) {
      console.error('[SessionBlock] Database save error:', error.message);
    }
  }

  /**
   * Update block in database
   * @private
   */
  async _updateBlockInDatabase(block) {
    try {
      await this.db.query(
        `UPDATE session_blocks
         SET status = $1,
             executed_at = $2,
             completed_at = $3,
             timeout_at = $4,
             queue_time_ms = $5,
             execution_time_ms = $6,
             result = $7,
             error_message = $8
         WHERE block_id = $9`,
        [
          block.status,
          block.executedAt,
          block.completedAt,
          block.timeoutAt,
          block.queueTime,
          block.executionTime,
          block.result ? JSON.stringify(block.result) : null,
          block.error,
          block.blockId
        ]
      );
    } catch (error) {
      console.error('[SessionBlock] Database update error:', error.message);
    }
  }

  /**
   * Start auto-boost timer
   */
  startAutoBoost(intervalMs = 10000) {
    this.autoBoostInterval = setInterval(() => {
      this.autoBoostNearDeadline();
    }, intervalMs);

    console.log('[SessionBlock] Auto-boost enabled');
  }

  /**
   * Stop auto-boost timer
   */
  stopAutoBoost() {
    if (this.autoBoostInterval) {
      clearInterval(this.autoBoostInterval);
      this.autoBoostInterval = null;
    }
  }
}

module.exports = SessionBlockManager;
