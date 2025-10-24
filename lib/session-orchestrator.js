/**
 * Session Orchestrator
 *
 * Main orchestrator that wires together all session block components:
 * - Session Block Manager (blockchain-like blocks)
 * - Model Wrapper (internal/external routing)
 * - Priority Queue (gas-like mechanics)
 * - Context Profile Manager (color coordination)
 * - Block Monitor (real-time monitoring)
 *
 * This is the main entry point for the session block system
 */

const SessionBlockManager = require('./session-block-manager');
const ModelWrapper = require('./model-wrapper');
const PriorityQueue = require('./priority-queue');
const ContextProfileManager = require('./context-profile-manager');
const BlockMonitor = require('./block-monitor');

class SessionOrchestrator {
  constructor(options = {}) {
    this.db = options.db;
    this.broadcast = options.broadcast || (() => {});

    // Initialize all components
    this.sessionBlockManager = new SessionBlockManager({
      db: this.db,
      broadcast: this.broadcast
    });

    this.priorityQueue = new PriorityQueue({
      sessionBlockManager: this.sessionBlockManager,
      broadcast: this.broadcast
    });

    this.modelWrapper = new ModelWrapper({
      db: this.db,
      sessionBlockManager: this.sessionBlockManager,
      broadcast: this.broadcast,
      ollamaUrl: options.ollamaUrl
    });

    this.contextProfileManager = new ContextProfileManager({
      db: this.db
    });

    this.blockMonitor = new BlockMonitor({
      sessionBlockManager: this.sessionBlockManager,
      priorityQueue: this.priorityQueue,
      broadcast: this.broadcast,
      db: this.db
    });

    // Processing state
    this.processing = false;
    this.processInterval = null;

    console.log('[SessionOrchestrator] Initialized all components');
  }

  /**
   * Start the orchestrator
   */
  start() {
    // Start auto-boosting for aging blocks
    this.sessionBlockManager.startAutoBoost(10000); // Every 10s
    this.priorityQueue.startAgeBoosting(30000); // Every 30s

    // Start monitoring
    this.blockMonitor.start();

    // Start processing queue
    this.startProcessing();

    console.log('[SessionOrchestrator] Started');
  }

  /**
   * Stop the orchestrator
   */
  stop() {
    // Stop auto-boosting
    this.sessionBlockManager.stopAutoBoost();
    this.priorityQueue.stopAgeBoosting();

    // Stop monitoring
    this.blockMonitor.stop();

    // Stop processing
    this.stopProcessing();

    console.log('[SessionOrchestrator] Stopped');
  }

  /**
   * Submit a new request (create and enqueue block)
   *
   * @param {object} request - Request configuration
   * @returns {Promise<object>} - Block info
   */
  async submitRequest(request) {
    const {
      userId = null,
      sessionId = null,
      deviceId = null,
      model,
      prompt,
      context = {},
      roomId = null,
      roomSlug = null,
      priority = null,
      urgent = false,
      deadlineMs = null
    } = request;

    // Load user context profile
    let profile = null;
    if (userId) {
      profile = await this.contextProfileManager.loadProfile(userId);
    }

    // Determine room color if available
    const roomColor = roomSlug ?
      this.contextProfileManager.getRoomColor(roomSlug) : null;

    // Create session block
    const block = await this.sessionBlockManager.createBlock({
      sessionId,
      userId,
      deviceId,
      roomId,
      roomSlug,
      priority,
      urgent,
      deadlineMs,
      model,
      prompt,
      context: {
        ...context,
        profile,
        roomColor
      },
      type: 'agent_request'
    });

    // Enqueue for processing
    const queueInfo = this.priorityQueue.enqueue(block);

    console.log(`[SessionOrchestrator] Submitted block ${block.blockId.slice(0, 8)} (position: ${queueInfo.position})`);

    return {
      blockId: block.blockId,
      status: 'pending',
      priority: block.priority,
      queuePosition: queueInfo.position,
      queueSize: queueInfo.queueSize,
      deadlineAt: block.deadlineAt,
      roomColor
    };
  }

  /**
   * Start processing queue
   */
  startProcessing() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    // Process blocks continuously
    this.processInterval = setInterval(async () => {
      await this._processNextBlock();
    }, 1000); // Check every second

    console.log('[SessionOrchestrator] Started processing queue');
  }

  /**
   * Stop processing queue
   */
  stopProcessing() {
    this.processing = false;

    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    console.log('[SessionOrchestrator] Stopped processing queue');
  }

  /**
   * Process next block in queue
   * @private
   */
  async _processNextBlock() {
    if (!this.processing) return;

    // Dequeue highest priority block
    const block = this.priorityQueue.dequeue();

    if (!block) {
      // No blocks to process
      return;
    }

    console.log(`[SessionOrchestrator] Processing block ${block.blockId.slice(0, 8)}`);

    try {
      // Execute model via wrapper
      const result = await this.modelWrapper.execute({
        model: block.blockData.model,
        prompt: block.blockData.prompt,
        context: block.blockData.context,
        sessionBlock: block,
        roomId: block.roomId
      });

      console.log(`[SessionOrchestrator] Completed block ${block.blockId.slice(0, 8)}`);

      return {
        blockId: block.blockId,
        status: 'completed',
        result
      };

    } catch (error) {
      console.error(`[SessionOrchestrator] Failed to process block ${block.blockId.slice(0, 8)}:`, error.message);

      return {
        blockId: block.blockId,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Get block status
   *
   * @param {string} blockId - Block ID
   * @returns {object|null} - Block status
   */
  getBlockStatus(blockId) {
    const block = this.sessionBlockManager.getBlock(blockId);

    if (!block) {
      return null;
    }

    // Get queue position if pending
    let queuePosition = null;
    if (block.status === 'pending') {
      const queueDepth = this.priorityQueue.getQueueDepth(block.roomId);
      queuePosition = queueDepth; // Approximate
    }

    return {
      blockId: block.blockId,
      status: block.status,
      priority: block.priority,
      queuePosition,
      createdAt: block.createdAt,
      deadlineAt: block.deadlineAt,
      timeToDeadline: block.deadlineAt - Date.now(),
      executedAt: block.executedAt,
      completedAt: block.completedAt,
      queueTime: block.queueTime,
      executionTime: block.executionTime,
      result: block.result,
      error: block.error
    };
  }

  /**
   * Boost block priority
   *
   * @param {string} blockId - Block ID
   * @param {number} boostAmount - Amount to boost
   * @returns {boolean} - Success
   */
  async boostBlockPriority(blockId, boostAmount = 10) {
    // Boost in both queue and block manager
    const queueBoosted = this.priorityQueue.boostPriority(blockId, boostAmount);
    const blockBoosted = await this.sessionBlockManager.boostPriority(blockId, boostAmount);

    return queueBoosted && blockBoosted;
  }

  /**
   * Cancel block
   *
   * @param {string} blockId - Block ID
   * @returns {boolean} - Success
   */
  async cancelBlock(blockId) {
    // Remove from queue
    this.priorityQueue.remove(blockId);

    // Update block status
    await this.sessionBlockManager.updateBlockStatus(blockId, 'failed', {
      error: 'Cancelled by user'
    });

    console.log(`[SessionOrchestrator] Cancelled block ${blockId.slice(0, 8)}`);

    return true;
  }

  /**
   * Get dashboard data
   *
   * @returns {Promise<object>} - Dashboard data
   */
  async getDashboardData() {
    return await this.blockMonitor.getDashboardData();
  }

  /**
   * Get statistics
   *
   * @returns {object} - Combined statistics
   */
  getStats() {
    return {
      sessionBlocks: this.sessionBlockManager.getQueueStats(),
      priorityQueue: this.priorityQueue.getStats(),
      modelWrapper: this.modelWrapper.getStats(),
      blockMonitor: this.blockMonitor.getStats(),
      processing: this.processing
    };
  }

  /**
   * Add monitor subscriber
   *
   * @param {string} subscriberId - Subscriber ID
   */
  addMonitorSubscriber(subscriberId) {
    this.blockMonitor.addSubscriber(subscriberId);
  }

  /**
   * Remove monitor subscriber
   *
   * @param {string} subscriberId - Subscriber ID
   */
  removeMonitorSubscriber(subscriberId) {
    this.blockMonitor.removeSubscriber(subscriberId);
  }
}

module.exports = SessionOrchestrator;
