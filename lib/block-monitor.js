/**
 * Block Monitor
 *
 * Real-time monitoring system inspired by Blocknative:
 * - WebSocket broadcasts for all block state changes
 * - Queue position updates
 * - Deadline countdowns
 * - Priority changes (gas wars)
 * - Room congestion alerts
 *
 * Like Blocknative's mempool monitoring but for AI sessions
 */

const EventEmitter = require('events');

class BlockMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sessionBlockManager = options.sessionBlockManager;
    this.priorityQueue = options.priorityQueue;
    this.broadcast = options.broadcast || (() => {});
    this.db = options.db;

    // Monitor configuration
    this.config = {
      updateIntervalMs: options.updateIntervalMs || 5000, // 5 seconds
      deadlineWarningMs: options.deadlineWarningMs || 60000, // 1 minute warning
      congestionThreshold: options.congestionThreshold || 10, // Queue depth > 10 = congested
      ...options
    };

    // Monitoring state
    this.monitoringActive = false;
    this.updateInterval = null;
    this.subscribers = new Set(); // WebSocket clients

    // Statistics
    this.stats = {
      totalBroadcasts: 0,
      totalUpdates: 0,
      subscribers: 0
    };

    console.log('[BlockMonitor] Initialized');
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.monitoringActive) {
      console.log('[BlockMonitor] Already active');
      return;
    }

    this.monitoringActive = true;

    // Subscribe to block manager events
    this._subscribeToEvents();

    // Start periodic updates
    this.updateInterval = setInterval(() => {
      this._broadcastQueueUpdate();
    }, this.config.updateIntervalMs);

    console.log('[BlockMonitor] Started monitoring');
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.monitoringActive = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('[BlockMonitor] Stopped monitoring');
  }

  /**
   * Add subscriber (WebSocket client)
   */
  addSubscriber(subscriberId) {
    this.subscribers.add(subscriberId);
    this.stats.subscribers = this.subscribers.size;

    console.log(`[BlockMonitor] Subscriber added: ${subscriberId} (total: ${this.subscribers.size})`);

    // Send initial state
    this._sendInitialState(subscriberId);
  }

  /**
   * Remove subscriber
   */
  removeSubscriber(subscriberId) {
    this.subscribers.delete(subscriberId);
    this.stats.subscribers = this.subscribers.size;

    console.log(`[BlockMonitor] Subscriber removed: ${subscriberId} (total: ${this.subscribers.size})`);
  }

  /**
   * Broadcast block event
   * @private
   */
  _broadcastBlockEvent(eventType, data) {
    const message = {
      type: `block_monitor:${eventType}`,
      timestamp: new Date().toISOString(),
      data
    };

    this.broadcast(message);
    this.emit(eventType, data);

    this.stats.totalBroadcasts++;
  }

  /**
   * Subscribe to block manager and queue events
   * @private
   */
  _subscribeToEvents() {
    // Session Block Manager events
    if (this.sessionBlockManager) {
      this.sessionBlockManager.on('block:created', (data) => {
        this._broadcastBlockEvent('block_created', {
          ...data,
          color: this._getStatusColor('pending')
        });
      });

      this.sessionBlockManager.on('block:status_change', (data) => {
        this._broadcastBlockEvent('block_status_change', {
          ...data,
          color: this._getStatusColor(data.status)
        });

        // Check for deadline warnings
        if (data.status === 'executing') {
          this._scheduleDeadlineWarning(data.blockId);
        }
      });

      this.sessionBlockManager.on('block:priority_boost', (data) => {
        this._broadcastBlockEvent('block_priority_boost', {
          ...data,
          priorityColor: this._getPriorityColor(data.newPriority)
        });
      });
    }

    // Priority Queue events
    if (this.priorityQueue) {
      this.priorityQueue.on('block:enqueued', (data) => {
        this._broadcastBlockEvent('block_enqueued', data);
      });

      this.priorityQueue.on('block:dequeued', (data) => {
        this._broadcastBlockEvent('block_dequeued', data);
      });

      this.priorityQueue.on('block:boosted', (data) => {
        this._broadcastBlockEvent('block_boosted', data);
      });

      this.priorityQueue.on('block:dropped', (data) => {
        this._broadcastBlockEvent('block_dropped', data);
      });
    }
  }

  /**
   * Broadcast queue update
   * @private
   */
  _broadcastQueueUpdate() {
    if (!this.priorityQueue) return;

    const queueStats = this.priorityQueue.getStats();
    const blockStats = this.sessionBlockManager ?
      this.sessionBlockManager.getQueueStats() : {};

    // Check for congestion
    const congestionAlerts = this._checkCongestion(queueStats);

    this._broadcastBlockEvent('queue_update', {
      queueStats,
      blockStats,
      congestionAlerts,
      timestamp: new Date().toISOString()
    });

    this.stats.totalUpdates++;
  }

  /**
   * Check for room congestion
   * @private
   */
  _checkCongestion(queueStats) {
    const alerts = [];

    for (const [roomId, roomStats] of Object.entries(queueStats.queuesByRoom || {})) {
      if (roomStats.depth > this.config.congestionThreshold) {
        alerts.push({
          roomId,
          depth: roomStats.depth,
          severity: roomStats.depth > this.config.congestionThreshold * 2 ? 'high' : 'medium',
          avgPriority: roomStats.avgPriority,
          message: `Room ${roomId} is congested (${roomStats.depth} blocks in queue)`
        });
      }
    }

    return alerts;
  }

  /**
   * Schedule deadline warning
   * @private
   */
  _scheduleDeadlineWarning(blockId) {
    const block = this.sessionBlockManager.getBlock(blockId);
    if (!block) return;

    const timeToDeadline = block.deadlineAt - Date.now();

    if (timeToDeadline > 0 && timeToDeadline <= this.config.deadlineWarningMs) {
      // Warn immediately if already close
      this._broadcastBlockEvent('deadline_warning', {
        blockId,
        timeToDeadline,
        severity: timeToDeadline < 30000 ? 'critical' : 'warning'
      });
    } else if (timeToDeadline > this.config.deadlineWarningMs) {
      // Schedule future warning
      setTimeout(() => {
        this._broadcastBlockEvent('deadline_warning', {
          blockId,
          timeToDeadline: this.config.deadlineWarningMs,
          severity: 'warning'
        });
      }, timeToDeadline - this.config.deadlineWarningMs);
    }
  }

  /**
   * Send initial state to new subscriber
   * @private
   */
  _sendInitialState(subscriberId) {
    const queueStats = this.priorityQueue ? this.priorityQueue.getStats() : {};
    const blockStats = this.sessionBlockManager ?
      this.sessionBlockManager.getQueueStats() : {};

    this.broadcast({
      type: 'block_monitor:initial_state',
      subscriberId,
      data: {
        queueStats,
        blockStats,
        activeBlocks: this._getActiveBlocksSnapshot(),
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get snapshot of active blocks
   * @private
   */
  _getActiveBlocksSnapshot() {
    if (!this.sessionBlockManager) return [];

    const pending = this.sessionBlockManager.getBlocksByStatus('pending');
    const executing = this.sessionBlockManager.getBlocksByStatus('executing');

    return [...pending, ...executing].map(block => ({
      blockId: block.blockId,
      roomId: block.roomId,
      priority: block.priority,
      status: block.status,
      createdAt: block.createdAt,
      deadlineAt: block.deadlineAt,
      timeToDeadline: block.deadlineAt - Date.now(),
      color: this._getStatusColor(block.status),
      priorityColor: this._getPriorityColor(block.priority)
    }));
  }

  /**
   * Get status color
   * @private
   */
  _getStatusColor(status) {
    const colors = {
      pending: '#6b7280',    // Gray
      executing: '#3b82f6',  // Blue
      completed: '#10b981',  // Green
      timeout: '#f59e0b',    // Orange
      failed: '#ef4444'      // Red
    };

    return colors[status] || colors.pending;
  }

  /**
   * Get priority color
   * @private
   */
  _getPriorityColor(priority) {
    if (priority >= 75) return '#ef4444';      // Red (urgent)
    if (priority >= 50) return '#f59e0b';      // Orange (high)
    if (priority >= 25) return '#10b981';      // Green (medium)
    return '#6b7280';                          // Gray (low)
  }

  /**
   * Get monitor statistics
   */
  getStats() {
    return {
      ...this.stats,
      monitoringActive: this.monitoringActive,
      updateIntervalMs: this.config.updateIntervalMs,
      subscribers: this.subscribers.size
    };
  }

  /**
   * Get real-time dashboard data
   */
  async getDashboardData() {
    const queueStats = this.priorityQueue ? this.priorityQueue.getStats() : {};
    const blockStats = this.sessionBlockManager ?
      this.sessionBlockManager.getQueueStats() : {};

    // Get recent database metrics if available
    let dbMetrics = null;
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM get_block_stats()');
        dbMetrics = result.rows.reduce((acc, row) => {
          acc[row.metric] = parseFloat(row.value);
          return acc;
        }, {});
      } catch (error) {
        console.error('[BlockMonitor] Database metrics error:', error.message);
      }
    }

    return {
      queueStats,
      blockStats,
      dbMetrics,
      activeBlocks: this._getActiveBlocksSnapshot(),
      congestionAlerts: this._checkCongestion(queueStats),
      monitorStats: this.getStats(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BlockMonitor;
