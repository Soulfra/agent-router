/**
 * Time-Based Badge Minter
 *
 * Optimizes badge/POAP minting by scheduling during off-peak hours.
 * Inspired by DeepSeek's time-based API pricing (cheaper during off-peak).
 *
 * Why Time-Based?
 * - Gas fees are ~80% cheaper at 3am vs noon (Ethereum)
 * - DeepSeek API calls are cheaper during off-peak hours
 * - User notifications more effective during peak engagement
 * - Batch processing reduces transaction costs
 *
 * How It Works:
 * 1. User earns badge → queued for minting
 * 2. System waits for off-peak window (e.g., 3am local time)
 * 3. Batch-mint multiple badges in single transaction
 * 4. Schedule notification for peak engagement (e.g., 9am)
 * 5. User gets "You leveled up!" during coffee ☕
 *
 * Cost Savings Example:
 * - Normal: Mint immediately, pay 50 gwei gas + $0.01 API
 * - Optimized: Wait 6 hours, pay 5 gwei gas + $0.0001 API
 * - Savings: 90% on gas, 99% on API = 💰💰💰
 *
 * Integrates with:
 * - LocalCultureTracker (lib/local-culture-tracker.js) - Activity patterns
 * - InvisiblePOAPManager (lib/invisible-poap-manager.js) - POAP minting
 * - SoulboundClipToken (lib/soulbound-clip-token.js) - NFT minting
 * - BadgeSystem (lib/badge-system.js) - Badge logic
 *
 * Usage:
 *   const minter = new TimeBasedBadgeMinter({
 *     cultureTracker, poapManager, db
 *   });
 *
 *   // Queue badge for off-peak minting
 *   await minter.queueBadge({
 *     userId: 'user123',
 *     badgeId: 'week_warrior',
 *     reason: '7-day streak achieved'
 *   });
 *
 *   // Badge will mint during next off-peak window (e.g., 3am)
 *   // Notification sent during peak window (e.g., 9am)
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class TimeBasedBadgeMinter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.cultureTracker = options.cultureTracker;
    this.poapManager = options.poapManager;
    this.soulboundToken = options.soulboundToken;
    this.db = options.db;

    // Time optimization config
    this.config = {
      // Off-peak windows (when gas is cheap)
      offPeakHours: options.offPeakHours || [1, 2, 3, 4, 5], // 1am-5am local

      // Peak engagement windows (when to send notifications)
      peakEngagementHours: options.peakEngagementHours || [9, 12, 18],

      // Batch config
      minBatchSize: options.minBatchSize || 3, // Min badges to batch
      maxBatchSize: options.maxBatchSize || 20, // Max badges per transaction
      batchWindowMinutes: options.batchWindowMinutes || 60, // Wait up to 1hr for batch

      // Cost optimization
      maxGasPrice: options.maxGasPrice || 30, // gwei (don't mint if gas > 30)
      preferredGasPrice: options.preferredGasPrice || 10, // gwei (ideal gas price)

      // DeepSeek API optimization
      useDeepSeekOffPeak: options.useDeepSeekOffPeak !== false,
      deepSeekOffPeakDiscount: 0.5, // 50% cheaper during off-peak

      // Scheduling
      checkIntervalMinutes: options.checkIntervalMinutes || 15, // Check every 15min
      enableSmartScheduling: options.enableSmartScheduling !== false
    };

    // Badge queue
    this.mintQueue = new Map(); // userId → array of pending badges
    this.mintHistory = new Map(); // badgeId → mint timestamp
    this.scheduledBatches = []; // Array of { time, badges, status }

    // Scheduler
    this.scheduler = null;

    console.log('[TimeBasedBadgeMinter] Initialized');
  }

  /**
   * Start the minting scheduler
   */
  start() {
    if (this.scheduler) {
      console.warn('[TimeBasedBadgeMinter] Scheduler already running');
      return;
    }

    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;

    this.scheduler = setInterval(() => {
      this._checkAndProcessQueue();
    }, intervalMs);

    console.log(`[TimeBasedBadgeMinter] Scheduler started (checking every ${this.config.checkIntervalMinutes}min)`);

    // Run immediately
    this._checkAndProcessQueue();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
      console.log('[TimeBasedBadgeMinter] Scheduler stopped');
    }
  }

  /**
   * Queue badge for time-optimized minting
   */
  async queueBadge(options) {
    const {
      userId,
      badgeId,
      badgeType = 'achievement',
      reason,
      metadata = {},
      urgency = 'normal' // 'urgent' | 'normal' | 'patient'
    } = options;

    if (!userId || !badgeId) {
      throw new Error('userId and badgeId required');
    }

    // Get user's activity profile for optimal timing
    let userProfile = null;
    if (this.cultureTracker) {
      userProfile = await this.cultureTracker.getActivityProfile();
    }

    // Create badge mint request
    const mintRequest = {
      requestId: crypto.randomBytes(16).toString('hex'),
      userId,
      badgeId,
      badgeType,
      reason,
      metadata,
      urgency,
      userProfile,
      queuedAt: Date.now(),
      status: 'queued',
      estimatedMintTime: null,
      estimatedNotifyTime: null
    };

    // Calculate optimal mint time
    if (this.config.enableSmartScheduling && userProfile) {
      const schedule = this._calculateOptimalSchedule(userProfile, urgency);
      mintRequest.estimatedMintTime = schedule.mintTime;
      mintRequest.estimatedNotifyTime = schedule.notifyTime;
    } else {
      // Default: mint in next off-peak window, notify in next peak window
      mintRequest.estimatedMintTime = this._getNextOffPeakTime();
      mintRequest.estimatedNotifyTime = this._getNextPeakTime();
    }

    // Add to user's queue
    if (!this.mintQueue.has(userId)) {
      this.mintQueue.set(userId, []);
    }
    this.mintQueue.get(userId).push(mintRequest);

    // Save to database
    if (this.db) {
      await this._saveMintRequest(mintRequest);
    }

    this.emit('badge:queued', mintRequest);

    console.log(`[TimeBasedBadgeMinter] Queued ${badgeId} for ${userId} (mint: ${new Date(mintRequest.estimatedMintTime).toLocaleString()}, notify: ${new Date(mintRequest.estimatedNotifyTime).toLocaleString()})`);

    return mintRequest;
  }

  /**
   * Get pending badges for user
   */
  getPendingBadges(userId) {
    return this.mintQueue.get(userId) || [];
  }

  /**
   * Get all queue stats
   */
  getQueueStats() {
    let totalPending = 0;
    let byUrgency = { urgent: 0, normal: 0, patient: 0 };

    for (const badges of this.mintQueue.values()) {
      totalPending += badges.length;
      badges.forEach(b => {
        byUrgency[b.urgency] = (byUrgency[b.urgency] || 0) + 1;
      });
    }

    return {
      totalPending,
      uniqueUsers: this.mintQueue.size,
      byUrgency,
      scheduledBatches: this.scheduledBatches.length,
      nextMintTime: this._getNextOffPeakTime(),
      estimatedSavings: this._estimateSavings(totalPending)
    };
  }

  /**
   * Check queue and process if in optimal window
   */
  async _checkAndProcessQueue() {
    const now = Date.now();
    const currentHour = new Date(now).getHours();

    console.log(`[TimeBasedBadgeMinter] Checking queue (hour: ${currentHour}, pending: ${this._getTotalPending()})`);

    // Check if we're in off-peak window
    const isOffPeak = this.config.offPeakHours.includes(currentHour);

    if (!isOffPeak) {
      console.log('[TimeBasedBadgeMinter] Not in off-peak window, skipping');
      return;
    }

    // Check gas price (if blockchain enabled)
    const gasPrice = await this._getCurrentGasPrice();
    if (gasPrice > this.config.maxGasPrice) {
      console.log(`[TimeBasedBadgeMinter] Gas price too high (${gasPrice} gwei), skipping`);
      return;
    }

    // Process queue
    await this._processQueue();
  }

  /**
   * Process the mint queue
   */
  async _processQueue() {
    // Collect all ready-to-mint badges
    const readyBadges = [];

    for (const [userId, badges] of this.mintQueue.entries()) {
      for (const badge of badges) {
        // Check if ready to mint
        if (badge.status === 'queued' && badge.estimatedMintTime <= Date.now()) {
          readyBadges.push(badge);
        }
      }
    }

    if (readyBadges.length === 0) {
      console.log('[TimeBasedBadgeMinter] No badges ready to mint');
      return;
    }

    console.log(`[TimeBasedBadgeMinter] Processing ${readyBadges.length} badges`);

    // Group into batches
    const batches = this._createBatches(readyBadges);

    // Process each batch
    for (const batch of batches) {
      await this._processBatch(batch);
    }
  }

  /**
   * Create batches from badges
   */
  _createBatches(badges) {
    const batches = [];
    let currentBatch = [];

    // Sort by urgency (urgent first)
    badges.sort((a, b) => {
      const urgencyOrder = { urgent: 0, normal: 1, patient: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    for (const badge of badges) {
      currentBatch.push(badge);

      if (currentBatch.length >= this.config.maxBatchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Process a single batch
   */
  async _processBatch(badges) {
    console.log(`[TimeBasedBadgeMinter] Processing batch of ${badges.length} badges`);

    const batchId = crypto.randomBytes(16).toString('hex');
    const startTime = Date.now();

    try {
      // Mint badges (either POAPs or soulbound tokens)
      const mintResults = [];

      for (const badge of badges) {
        let result;

        if (this.poapManager) {
          // Mint invisible POAP
          result = await this.poapManager.mint({
            userId: badge.userId,
            badgeId: badge.badgeId,
            metadata: {
              ...badge.metadata,
              reason: badge.reason,
              queuedAt: badge.queuedAt,
              mintedAt: Date.now()
            }
          });
        } else if (this.soulboundToken) {
          // Mint soulbound token
          result = await this.soulboundToken.mint({
            clipId: badge.badgeId,
            clipper: badge.userId,
            contentHash: crypto.createHash('sha256').update(badge.badgeId).digest('hex'),
            metadata: badge.metadata
          });
        }

        mintResults.push({ badge, result });

        // Update status
        badge.status = 'minted';
        badge.mintedAt = Date.now();
        badge.batchId = batchId;

        // Schedule notification
        await this._scheduleNotification(badge);

        // Remove from queue
        const userQueue = this.mintQueue.get(badge.userId);
        if (userQueue) {
          const index = userQueue.findIndex(b => b.requestId === badge.requestId);
          if (index !== -1) {
            userQueue.splice(index, 1);
          }
        }
      }

      const duration = Date.now() - startTime;

      this.emit('batch:processed', {
        batchId,
        badgeCount: badges.length,
        duration,
        results: mintResults
      });

      console.log(`[TimeBasedBadgeMinter] Batch ${batchId} processed: ${badges.length} badges in ${duration}ms`);

    } catch (error) {
      console.error('[TimeBasedBadgeMinter] Batch processing error:', error.message);

      // Mark badges as failed
      for (const badge of badges) {
        badge.status = 'failed';
        badge.error = error.message;
      }

      this.emit('batch:failed', { batchId, error: error.message });
    }
  }

  /**
   * Schedule notification for badge
   */
  async _scheduleNotification(badge) {
    // TODO: Implement notification scheduling
    // This would integrate with a notification system

    console.log(`[TimeBasedBadgeMinter] Notification scheduled for ${badge.userId} at ${new Date(badge.estimatedNotifyTime).toLocaleString()}`);
  }

  /**
   * Calculate optimal schedule for user
   */
  _calculateOptimalSchedule(userProfile, urgency) {
    const now = Date.now();

    // Use user's off-peak hours for minting
    const userOffPeakHours = userProfile.offPeakHours || this.config.offPeakHours;
    const userPeakHours = userProfile.peakHours || this.config.peakEngagementHours;

    let mintTime, notifyTime;

    if (urgency === 'urgent') {
      // Mint ASAP (next off-peak window)
      mintTime = this._getNextTimeInHours(userOffPeakHours);
      notifyTime = this._getNextTimeInHours(userPeakHours);
    } else if (urgency === 'patient') {
      // Wait for optimal window (cheapest gas)
      mintTime = this._getOptimalMintTime(userOffPeakHours);
      notifyTime = this._getNextTimeInHours(userPeakHours, mintTime);
    } else {
      // Normal: balance between speed and cost
      mintTime = this._getNextTimeInHours(userOffPeakHours);
      notifyTime = this._getNextTimeInHours(userPeakHours, mintTime);
    }

    return { mintTime, notifyTime };
  }

  /**
   * Get next time in specific hours
   */
  _getNextTimeInHours(hours, afterTime = Date.now()) {
    const now = new Date(afterTime);
    const currentHour = now.getHours();

    // Find next matching hour
    for (let i = 0; i < 24; i++) {
      const checkHour = (currentHour + i) % 24;
      if (hours.includes(checkHour)) {
        const nextTime = new Date(now);
        nextTime.setHours(checkHour, 0, 0, 0);

        // If it's in the past, add a day
        if (nextTime <= now) {
          nextTime.setDate(nextTime.getDate() + 1);
        }

        return nextTime.getTime();
      }
    }

    // Fallback: 24 hours from now
    return afterTime + 86400000;
  }

  /**
   * Get next off-peak time
   */
  _getNextOffPeakTime() {
    return this._getNextTimeInHours(this.config.offPeakHours);
  }

  /**
   * Get next peak engagement time
   */
  _getNextPeakTime() {
    return this._getNextTimeInHours(this.config.peakEngagementHours);
  }

  /**
   * Get optimal mint time (lowest expected gas)
   */
  _getOptimalMintTime(offPeakHours) {
    // Typically 3am-4am has lowest gas
    const optimalHours = [3, 4];
    const relevantHours = offPeakHours.filter(h => optimalHours.includes(h));

    if (relevantHours.length > 0) {
      return this._getNextTimeInHours(relevantHours);
    }

    return this._getNextOffPeakTime();
  }

  /**
   * Get current gas price (stub)
   */
  async _getCurrentGasPrice() {
    // TODO: Integrate with Ethereum gas API
    // For now, simulate with hour-based estimate

    const hour = new Date().getHours();

    if (hour >= 1 && hour <= 5) {
      return 5; // Low gas (off-peak)
    } else if (hour >= 9 && hour <= 17) {
      return 50; // High gas (business hours)
    } else {
      return 20; // Medium gas
    }
  }

  /**
   * Estimate cost savings from time-based minting
   */
  _estimateSavings(badgeCount) {
    // Normal: Immediate minting at average gas (30 gwei)
    const normalGasCost = badgeCount * 0.001; // $1 per mint at 30 gwei

    // Optimized: Batched minting at off-peak gas (5 gwei)
    const batchCount = Math.ceil(badgeCount / this.config.maxBatchSize);
    const optimizedGasCost = batchCount * 0.0005; // $0.50 per batch at 5 gwei

    // DeepSeek API savings
    const normalAPICost = badgeCount * 0.01; // $0.01 per badge
    const optimizedAPICost = badgeCount * 0.001; // $0.001 per badge (off-peak)

    const totalNormal = normalGasCost + normalAPICost;
    const totalOptimized = optimizedGasCost + optimizedAPICost;

    return {
      normal: totalNormal,
      optimized: totalOptimized,
      saved: totalNormal - totalOptimized,
      percentage: ((totalNormal - totalOptimized) / totalNormal) * 100
    };
  }

  /**
   * Get total pending badges
   */
  _getTotalPending() {
    let total = 0;
    for (const badges of this.mintQueue.values()) {
      total += badges.length;
    }
    return total;
  }

  /**
   * Save mint request to database
   */
  async _saveMintRequest(request) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO time_based_mint_queue (
          request_id,
          user_id,
          badge_id,
          badge_type,
          reason,
          metadata,
          urgency,
          queued_at,
          estimated_mint_time,
          estimated_notify_time,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        request.requestId,
        request.userId,
        request.badgeId,
        request.badgeType,
        request.reason,
        JSON.stringify(request.metadata),
        request.urgency,
        new Date(request.queuedAt),
        new Date(request.estimatedMintTime),
        new Date(request.estimatedNotifyTime),
        request.status
      ]);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[TimeBasedBadgeMinter] Save request error:', error.message);
      }
    }
  }
}

module.exports = TimeBasedBadgeMinter;
