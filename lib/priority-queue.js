/**
 * Priority Queue
 *
 * Gas-like priority queuing system for session blocks:
 * - Higher priority ("gas price") = faster execution
 * - Room-scoped queues (like separate networks)
 * - Auto-boosting for deadline-critical blocks
 * - Fair queuing with age-based boosting
 *
 * Like Ethereum mempool but for AI requests
 */

const EventEmitter = require('events');

class PriorityQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sessionBlockManager = options.sessionBlockManager;
    this.broadcast = options.broadcast || (() => {});

    // Queue configuration
    this.config = {
      maxQueueSize: options.maxQueueSize || 1000,
      ageBoostIntervalMs: options.ageBoostIntervalMs || 30000, // Boost every 30s
      ageBoostAmount: options.ageBoostAmount || 5, // +5 priority per interval
      maxPriority: 100,
      minPriority: 0,
      ...options
    };

    // Room-based queues
    this.queues = new Map(); // roomId → priority queue

    // Global queue for unassigned blocks
    this.globalQueue = [];

    // Statistics
    this.stats = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      totalBoosted: 0
    };

    console.log('[PriorityQueue] Initialized');
  }

  /**
   * Enqueue a session block
   *
   * @param {object} sessionBlock - Block to enqueue
   * @returns {object} - Queue info
   */
  enqueue(sessionBlock) {
    const { blockId, roomId, priority } = sessionBlock;

    // Get or create room queue
    const queue = this._getOrCreateRoomQueue(roomId);

    // Check queue size limit
    if (queue.length >= this.config.maxQueueSize) {
      // Drop lowest priority block
      const dropped = this._dropLowestPriority(queue);
      console.warn(`[PriorityQueue] Queue full, dropped block ${dropped.blockId.slice(0, 8)}`);
      this.stats.totalDropped++;
    }

    // Add to queue with metadata
    const queueItem = {
      ...sessionBlock,
      enqueuedAt: Date.now(),
      initialPriority: priority,
      boosts: 0
    };

    queue.push(queueItem);

    // Sort by priority (highest first)
    queue.sort((a, b) => b.priority - a.priority);

    this.stats.totalEnqueued++;

    // Calculate queue position
    const position = queue.findIndex(item => item.blockId === blockId);

    console.log(`[PriorityQueue] Enqueued ${blockId.slice(0, 8)} (priority: ${priority}, position: ${position + 1}/${queue.length}, room: ${roomId || 'global'})`);

    // Emit event
    const queueData = {
      blockId,
      roomId: roomId || null,
      priority,
      position: position + 1,
      queueSize: queue.length
    };
    this.emit('block:enqueued', queueData);
    this.broadcast({ type: 'priority_queue:enqueued', ...queueData });

    return queueData;
  }

  /**
   * Dequeue highest priority block
   *
   * @param {number} roomId - Room to dequeue from (optional)
   * @returns {object|null} - Session block or null if queue empty
   */
  dequeue(roomId = null) {
    let queue;

    if (roomId !== null) {
      // Room-specific dequeue
      queue = this.queues.get(roomId);
      if (!queue || queue.length === 0) {
        return null;
      }
    } else {
      // Global dequeue: find highest priority across all rooms
      queue = this._findHighestPriorityQueue();
      if (!queue || queue.length === 0) {
        return null;
      }
    }

    // Remove highest priority (first item after sorting)
    const item = queue.shift();

    this.stats.totalDequeued++;

    // Calculate queue time
    const queueTime = Date.now() - item.enqueuedAt;

    console.log(`[PriorityQueue] Dequeued ${item.blockId.slice(0, 8)} (priority: ${item.priority}, queue time: ${queueTime}ms, room: ${item.roomId || 'global'})`);

    // Emit event
    const dequeueData = {
      blockId: item.blockId,
      roomId: item.roomId || null,
      priority: item.priority,
      queueTime
    };
    this.emit('block:dequeued', dequeueData);
    this.broadcast({ type: 'priority_queue:dequeued', ...dequeueData });

    return item;
  }

  /**
   * Peek at highest priority block without removing
   *
   * @param {number} roomId - Room to peek (optional)
   * @returns {object|null} - Session block or null
   */
  peek(roomId = null) {
    let queue;

    if (roomId !== null) {
      queue = this.queues.get(roomId);
    } else {
      queue = this._findHighestPriorityQueue();
    }

    return queue && queue.length > 0 ? queue[0] : null;
  }

  /**
   * Boost priority of a specific block
   *
   * @param {string} blockId - Block to boost
   * @param {number} boostAmount - Amount to increase priority
   * @returns {boolean} - Success
   */
  boostPriority(blockId, boostAmount = 10) {
    // Search all queues
    for (const [roomId, queue] of this.queues) {
      const item = queue.find(i => i.blockId === blockId);

      if (item) {
        const oldPriority = item.priority;
        item.priority = Math.min(this.config.maxPriority, item.priority + boostAmount);
        item.boosts++;

        // Re-sort queue
        queue.sort((a, b) => b.priority - a.priority);

        this.stats.totalBoosted++;

        console.log(`[PriorityQueue] Boosted ${blockId.slice(0, 8)}: ${oldPriority} → ${item.priority}`);

        // Emit event
        this.emit('block:boosted', {
          blockId,
          oldPriority,
          newPriority: item.priority,
          roomId
        });

        // Also update session block manager
        if (this.sessionBlockManager) {
          this.sessionBlockManager.boostPriority(blockId, boostAmount);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Age-based priority boosting
   * Older blocks get priority boost to prevent starvation
   */
  boostOldBlocks() {
    const now = Date.now();
    let boostedCount = 0;

    for (const [roomId, queue] of this.queues) {
      for (const item of queue) {
        const age = now - item.enqueuedAt;

        // Boost if older than interval
        if (age > this.config.ageBoostIntervalMs) {
          const intervalsOld = Math.floor(age / this.config.ageBoostIntervalMs);
          const expectedBoosts = Math.min(5, intervalsOld); // Cap at 5 boosts
          const neededBoosts = expectedBoosts - item.boosts;

          if (neededBoosts > 0) {
            const oldPriority = item.priority;
            item.priority = Math.min(
              this.config.maxPriority,
              item.priority + (this.config.ageBoostAmount * neededBoosts)
            );
            item.boosts += neededBoosts;

            boostedCount++;

            console.log(`[PriorityQueue] Age-boosted ${item.blockId.slice(0, 8)}: ${oldPriority} → ${item.priority} (age: ${Math.round(age / 1000)}s)`);
          }
        }
      }

      // Re-sort after boosting
      if (boostedCount > 0) {
        queue.sort((a, b) => b.priority - a.priority);
      }
    }

    if (boostedCount > 0) {
      console.log(`[PriorityQueue] Age-boosted ${boostedCount} blocks`);
      this.stats.totalBoosted += boostedCount;
    }

    return boostedCount;
  }

  /**
   * Remove block from queue
   *
   * @param {string} blockId - Block to remove
   * @returns {boolean} - Success
   */
  remove(blockId) {
    for (const [roomId, queue] of this.queues) {
      const index = queue.findIndex(item => item.blockId === blockId);

      if (index !== -1) {
        queue.splice(index, 1);
        console.log(`[PriorityQueue] Removed ${blockId.slice(0, 8)} from room ${roomId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get queue depth by room
   *
   * @param {number} roomId - Room ID (optional)
   * @returns {number} - Queue size
   */
  getQueueDepth(roomId = null) {
    if (roomId !== null) {
      const queue = this.queues.get(roomId);
      return queue ? queue.length : 0;
    }

    // Total across all rooms
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get queue statistics
   *
   * @returns {object} - Statistics
   */
  getStats() {
    const queueStats = {
      ...this.stats,
      activeQueues: this.queues.size,
      totalQueueDepth: this.getQueueDepth(),
      queuesByRoom: {}
    };

    // Per-room stats
    for (const [roomId, queue] of this.queues) {
      queueStats.queuesByRoom[roomId] = {
        depth: queue.length,
        avgPriority: queue.reduce((sum, item) => sum + item.priority, 0) / queue.length || 0,
        oldestAge: queue.length > 0 ? Date.now() - Math.min(...queue.map(i => i.enqueuedAt)) : 0
      };
    }

    return queueStats;
  }

  /**
   * Get or create room queue
   * @private
   */
  _getOrCreateRoomQueue(roomId) {
    const key = roomId || 'global';

    if (!this.queues.has(key)) {
      this.queues.set(key, []);
    }

    return this.queues.get(key);
  }

  /**
   * Find queue with highest priority block
   * @private
   */
  _findHighestPriorityQueue() {
    let highestQueue = null;
    let highestPriority = -1;

    for (const queue of this.queues.values()) {
      if (queue.length > 0 && queue[0].priority > highestPriority) {
        highestPriority = queue[0].priority;
        highestQueue = queue;
      }
    }

    return highestQueue;
  }

  /**
   * Drop lowest priority block from queue
   * @private
   */
  _dropLowestPriority(queue) {
    // Find lowest priority
    let lowestIndex = 0;
    let lowestPriority = queue[0].priority;

    for (let i = 1; i < queue.length; i++) {
      if (queue[i].priority < lowestPriority) {
        lowestPriority = queue[i].priority;
        lowestIndex = i;
      }
    }

    // Remove and return
    const dropped = queue.splice(lowestIndex, 1)[0];

    // Emit event
    this.emit('block:dropped', {
      blockId: dropped.blockId,
      priority: dropped.priority,
      reason: 'queue_full'
    });

    return dropped;
  }

  /**
   * Start age-based boosting interval
   */
  startAgeBoosting(intervalMs = 30000) {
    this.ageBoostInterval = setInterval(() => {
      this.boostOldBlocks();
    }, intervalMs);

    console.log('[PriorityQueue] Age-based boosting enabled');
  }

  /**
   * Stop age-based boosting interval
   */
  stopAgeBoosting() {
    if (this.ageBoostInterval) {
      clearInterval(this.ageBoostInterval);
      this.ageBoostInterval = null;
    }
  }

  /**
   * Clear all queues
   */
  clear() {
    this.queues.clear();
    this.globalQueue = [];
    console.log('[PriorityQueue] Cleared all queues');
  }
}

module.exports = PriorityQueue;
