/**
 * Cross-Device Sync Manager
 *
 * Handles synchronization of state across multiple devices:
 * - Mac (primary workstation)
 * - iPhone (mobile app)
 * - Flip phone (SMS/call interface)
 *
 * Features:
 * - Real-time state sync via WebSocket
 * - Offline queue for disconnected devices
 * - Conflict resolution (last-write-wins with version vectors)
 * - Delta sync (only send changes, not full state)
 * - Device capabilities detection
 */

const EventEmitter = require('events');

class DeviceSyncManager extends EventEmitter {
  constructor(db, mailboxSystem) {
    super();
    if (!db) {
      throw new Error('Database instance required for DeviceSyncManager');
    }
    this.db = db;
    this.mailboxSystem = mailboxSystem;

    // Connected devices: Map<deviceId, { userId, socket, deviceType, capabilities, lastSeen }>
    this.connectedDevices = new Map();

    // Offline queue: Map<deviceId, Array<syncOperation>>
    this.offlineQueue = new Map();

    // Version vectors for conflict resolution: Map<userId+entityType, Map<deviceId, version>>
    this.versionVectors = new Map();

    console.log('[DeviceSyncManager] Initialized');
  }

  /**
   * Register a device connection
   */
  registerDevice({ deviceId, userId, socket, deviceType, capabilities = {} }) {
    const device = {
      deviceId,
      userId,
      socket,
      deviceType, // 'mac', 'iphone', 'flip_phone', 'web'
      capabilities, // { hasCamera, hasBluetooth, hasGPS, screenSize, etc }
      lastSeen: new Date(),
      connected: true
    };

    this.connectedDevices.set(deviceId, device);

    // Set up socket listeners
    if (socket) {
      socket.on('disconnect', () => {
        this.handleDeviceDisconnect(deviceId);
      });

      socket.on('sync_request', (data) => {
        this.handleSyncRequest(deviceId, data);
      });

      socket.on('sync_ack', (data) => {
        this.handleSyncAck(deviceId, data);
      });
    }

    // Process offline queue
    this.processOfflineQueue(deviceId);

    console.log(`[DeviceSyncManager] Device registered: ${deviceType} (${deviceId})`);

    return {
      success: true,
      device
    };
  }

  /**
   * Unregister device (disconnect)
   */
  handleDeviceDisconnect(deviceId) {
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.connected = false;
      device.lastSeen = new Date();
      console.log(`[DeviceSyncManager] Device disconnected: ${deviceId}`);

      // Emit disconnect event
      this.emit('device_disconnected', { deviceId, device });
    }
  }

  /**
   * Get all devices for a user
   */
  getUserDevices(userId) {
    const devices = [];
    for (const [deviceId, device] of this.connectedDevices.entries()) {
      if (device.userId === userId) {
        devices.push({
          deviceId,
          deviceType: device.deviceType,
          connected: device.connected,
          lastSeen: device.lastSeen,
          capabilities: device.capabilities
        });
      }
    }
    return devices;
  }

  /**
   * Sync entity to all user's devices
   */
  async syncToUserDevices(userId, { entityType, entityId, action, data, sourceDeviceId = null }) {
    const devices = this.getUserDevices(userId);
    const syncOperation = {
      entityType, // 'mailbox', 'session', 'preference', 'artifact'
      entityId,
      action, // 'create', 'update', 'delete', 'read'
      data,
      timestamp: new Date(),
      sourceDeviceId
    };

    const results = [];

    for (const device of devices) {
      // Don't sync back to source device
      if (device.deviceId === sourceDeviceId) {
        continue;
      }

      // Filter data based on device capabilities
      const filteredData = this.filterDataForDevice(data, device);

      if (device.connected) {
        // Send immediately
        const result = await this.sendSyncToDevice(device.deviceId, {
          ...syncOperation,
          data: filteredData
        });
        results.push(result);
      } else {
        // Queue for later
        this.queueSyncOperation(device.deviceId, {
          ...syncOperation,
          data: filteredData
        });
        results.push({
          deviceId: device.deviceId,
          queued: true
        });
      }
    }

    return {
      success: true,
      synced: results.filter(r => !r.queued).length,
      queued: results.filter(r => r.queued).length,
      results
    };
  }

  /**
   * Send sync operation to a specific device
   */
  async sendSyncToDevice(deviceId, syncOperation) {
    const device = this.connectedDevices.get(deviceId);

    if (!device || !device.connected || !device.socket) {
      return {
        deviceId,
        success: false,
        error: 'Device not connected'
      };
    }

    try {
      // Update version vector
      const versionKey = `${device.userId}:${syncOperation.entityType}:${syncOperation.entityId}`;
      if (!this.versionVectors.has(versionKey)) {
        this.versionVectors.set(versionKey, new Map());
      }
      const versions = this.versionVectors.get(versionKey);
      const currentVersion = versions.get(deviceId) || 0;
      versions.set(deviceId, currentVersion + 1);

      // Send via WebSocket
      device.socket.emit('sync_update', {
        ...syncOperation,
        version: currentVersion + 1,
        versionVector: Object.fromEntries(versions)
      });

      return {
        deviceId,
        success: true,
        version: currentVersion + 1
      };
    } catch (error) {
      console.error(`[DeviceSyncManager] Error sending sync to ${deviceId}:`, error);
      return {
        deviceId,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Queue sync operation for offline device
   */
  queueSyncOperation(deviceId, syncOperation) {
    if (!this.offlineQueue.has(deviceId)) {
      this.offlineQueue.set(deviceId, []);
    }

    const queue = this.offlineQueue.get(deviceId);
    queue.push(syncOperation);

    // Limit queue size (keep last 1000 operations)
    if (queue.length > 1000) {
      queue.shift();
    }

    console.log(`[DeviceSyncManager] Queued sync for offline device ${deviceId} (queue size: ${queue.length})`);
  }

  /**
   * Process offline queue when device reconnects
   */
  async processOfflineQueue(deviceId) {
    if (!this.offlineQueue.has(deviceId)) {
      return;
    }

    const queue = this.offlineQueue.get(deviceId);
    console.log(`[DeviceSyncManager] Processing ${queue.length} queued operations for ${deviceId}`);

    const results = [];
    for (const operation of queue) {
      const result = await this.sendSyncToDevice(deviceId, operation);
      results.push(result);
    }

    // Clear queue
    this.offlineQueue.delete(deviceId);

    return {
      success: true,
      processed: results.length,
      results
    };
  }

  /**
   * Filter data based on device capabilities
   */
  filterDataForDevice(data, device) {
    const filtered = { ...data };

    // Flip phone: strip images, videos, large attachments
    if (device.deviceType === 'flip_phone') {
      delete filtered.images;
      delete filtered.videos;
      delete filtered.attachments;

      // Truncate text for small screen
      if (filtered.body && filtered.body.length > 160) {
        filtered.body = filtered.body.substring(0, 157) + '...';
      }
    }

    // iPhone: optimize image sizes
    if (device.deviceType === 'iphone' && filtered.images) {
      filtered.images = filtered.images.map(img => ({
        ...img,
        url: img.thumbnailUrl || img.url
      }));
    }

    // Web/Mac: send everything
    return filtered;
  }

  /**
   * Handle sync request from device
   */
  async handleSyncRequest(deviceId, { entityType, since = null }) {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      return;
    }

    try {
      let results = [];

      // Mailbox sync
      if (entityType === 'mailbox' && this.mailboxSystem) {
        const sinceDate = since ? new Date(since) : null;
        const mailboxData = await this.mailboxSystem.getMessagesForSync(
          device.userId,
          deviceId,
          { since: sinceDate }
        );
        results = mailboxData.messages;
      }

      // Send sync response
      device.socket.emit('sync_response', {
        entityType,
        results,
        timestamp: new Date()
      });

      console.log(`[DeviceSyncManager] Sent ${results.length} ${entityType} items to ${deviceId}`);
    } catch (error) {
      console.error(`[DeviceSyncManager] Error handling sync request:`, error);
      device.socket.emit('sync_error', {
        entityType,
        error: error.message
      });
    }
  }

  /**
   * Handle sync acknowledgment from device
   */
  handleSyncAck(deviceId, { entityType, entityId, version }) {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      return;
    }

    // Update version vector
    const versionKey = `${device.userId}:${entityType}:${entityId}`;
    if (!this.versionVectors.has(versionKey)) {
      this.versionVectors.set(versionKey, new Map());
    }

    const versions = this.versionVectors.get(versionKey);
    versions.set(deviceId, version);

    console.log(`[DeviceSyncManager] Sync ack from ${deviceId}: ${entityType}:${entityId} v${version}`);
  }

  /**
   * Resolve conflicts using version vectors
   */
  resolveConflict(entityType, entityId, updates) {
    const versionKey = `${updates[0].userId}:${entityType}:${entityId}`;
    const versions = this.versionVectors.get(versionKey) || new Map();

    // Last-write-wins based on version vector dominance
    let winner = updates[0];
    let maxVersion = 0;

    for (const update of updates) {
      const version = versions.get(update.deviceId) || 0;
      if (version > maxVersion) {
        maxVersion = version;
        winner = update;
      }
    }

    return winner;
  }

  /**
   * Get sync statistics
   */
  getStats() {
    const stats = {
      connectedDevices: 0,
      disconnectedDevices: 0,
      queuedOperations: 0,
      devicesByType: {},
      versionVectorCount: this.versionVectors.size
    };

    for (const device of this.connectedDevices.values()) {
      if (device.connected) {
        stats.connectedDevices++;
      } else {
        stats.disconnectedDevices++;
      }

      const type = device.deviceType;
      stats.devicesByType[type] = (stats.devicesByType[type] || 0) + 1;
    }

    for (const queue of this.offlineQueue.values()) {
      stats.queuedOperations += queue.length;
    }

    return stats;
  }

  /**
   * Force sync all devices for a user
   */
  async forceSyncAll(userId) {
    const devices = this.getUserDevices(userId);
    const results = [];

    for (const device of devices) {
      if (device.connected) {
        const deviceObj = this.connectedDevices.get(device.deviceId);
        if (deviceObj && deviceObj.socket) {
          deviceObj.socket.emit('force_sync', {
            timestamp: new Date()
          });
          results.push({ deviceId: device.deviceId, synced: true });
        }
      }
    }

    return {
      success: true,
      synced: results.length,
      devices: results
    };
  }

  /**
   * Clean up old version vectors (older than 30 days)
   */
  cleanupOldVersions() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [key, versions] of this.versionVectors.entries()) {
      for (const [deviceId, version] of versions.entries()) {
        const device = this.connectedDevices.get(deviceId);
        if (!device || device.lastSeen < thirtyDaysAgo) {
          versions.delete(deviceId);
          cleaned++;
        }
      }

      // Remove empty version vectors
      if (versions.size === 0) {
        this.versionVectors.delete(key);
      }
    }

    console.log(`[DeviceSyncManager] Cleaned up ${cleaned} old version entries`);
    return cleaned;
  }
}

module.exports = DeviceSyncManager;
