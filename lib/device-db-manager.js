/**
 * Device Database Manager
 *
 * Manages isolated databases for different device types.
 * Each device type (Gameboy, TV remote, Electron, phone, etc.) gets its own database.
 *
 * Features:
 * - Device-specific database isolation
 * - Schema management per device type
 * - Cross-device data sync (optional)
 * - Device registration and provisioning
 * - Storage limits per device type
 * - Backup and restore per device
 */

const EventEmitter = require('events');
const { Pool } = require('pg');
const crypto = require('crypto');

class DeviceDatabaseManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Database router (from platform-db-router)
    this.dbRouter = options.dbRouter || null;

    // Registered devices: Map<deviceId, deviceInfo>
    this.devices = new Map();

    // Device types and their database configs
    this.deviceTypes = {
      'gameboy': {
        databaseId: 'gameboy_device_db',
        schema: 'gameboy_schema',
        storageLimit: 50 * 1024 * 1024, // 50MB
        tables: ['saves', 'high_scores', 'settings']
      },
      'tv-remote': {
        databaseId: 'tv_device_db',
        schema: 'tv_schema',
        storageLimit: 10 * 1024 * 1024, // 10MB
        tables: ['channels', 'favorites', 'history']
      },
      'electron': {
        databaseId: 'electron_app_db',
        schema: 'electron_schema',
        storageLimit: 500 * 1024 * 1024, // 500MB
        tables: ['windows', 'preferences', 'cache', 'local_storage']
      },
      'phone': {
        databaseId: 'mobile_db',
        schema: 'mobile_schema',
        storageLimit: 100 * 1024 * 1024, // 100MB
        tables: ['contacts', 'messages', 'photos_meta', 'app_data']
      },
      'desktop': {
        databaseId: 'desktop_db',
        schema: 'desktop_schema',
        storageLimit: 1024 * 1024 * 1024, // 1GB
        tables: ['files', 'applications', 'settings', 'cache']
      },
      'embedded': {
        databaseId: 'embedded_db',
        schema: 'embedded_schema',
        storageLimit: 5 * 1024 * 1024, // 5MB
        tables: ['sensor_data', 'config']
      },
      'cloud': {
        databaseId: 'cloud_db',
        schema: 'cloud_schema',
        storageLimit: null, // No limit
        tables: ['users', 'sessions', 'logs', 'analytics']
      }
    };

    // Device → database mapping
    this.deviceDatabases = new Map(); // Map<deviceId, databaseId>

    // Stats
    this.stats = {
      totalDevices: 0,
      devicesByType: {},
      totalStorage: 0,
      storageByDevice: {}
    };

    console.log('[DeviceDatabaseManager] Initialized with', Object.keys(this.deviceTypes).length, 'device types');
  }

  /**
   * Register a new device
   */
  async registerDevice(deviceInfo) {
    const deviceId = deviceInfo.deviceId || crypto.randomUUID();
    const deviceType = deviceInfo.deviceType;

    if (!deviceType) {
      throw new Error('Device type is required');
    }

    if (!this.deviceTypes[deviceType]) {
      throw new Error(`Unknown device type: ${deviceType}`);
    }

    const typeConfig = this.deviceTypes[deviceType];

    const device = {
      deviceId,
      deviceType,
      databaseId: typeConfig.databaseId,
      schema: typeConfig.schema,
      registeredAt: new Date(),
      lastSeen: new Date(),
      metadata: deviceInfo.metadata || {},
      storageUsed: 0,
      storageLimit: typeConfig.storageLimit,
      status: 'active'
    };

    this.devices.set(deviceId, device);
    this.deviceDatabases.set(deviceId, device.databaseId);

    // Update stats
    this.stats.totalDevices++;
    this.stats.devicesByType[deviceType] = (this.stats.devicesByType[deviceType] || 0) + 1;

    // Initialize device database schema
    await this.initializeDeviceSchema(device);

    console.log(`[DeviceDatabaseManager] Registered device ${deviceId} (${deviceType}) → ${device.databaseId}`);

    this.emit('device_registered', device);

    return device;
  }

  /**
   * Initialize database schema for device
   */
  async initializeDeviceSchema(device) {
    if (!this.dbRouter) {
      console.warn('[DeviceDatabaseManager] No DB router, skipping schema initialization');
      return;
    }

    const typeConfig = this.deviceTypes[device.deviceType];

    try {
      // Create schema if not exists
      await this.dbRouter.query(
        `CREATE SCHEMA IF NOT EXISTS ${device.schema}`,
        [],
        { databaseId: device.databaseId }
      );

      // Create device-specific tables
      for (const table of typeConfig.tables) {
        await this.createDeviceTable(device, table);
      }

      console.log(`[DeviceDatabaseManager] Initialized schema for device ${device.deviceId}`);
    } catch (error) {
      console.error(`[DeviceDatabaseManager] Error initializing schema:`, error.message);
      throw error;
    }
  }

  /**
   * Create a device-specific table
   */
  async createDeviceTable(device, tableName) {
    // Generic table structure (customize per table type)
    let createSQL = '';

    switch (tableName) {
      case 'saves':
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            save_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            game_name VARCHAR(255),
            save_data JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
        break;

      case 'settings':
      case 'preferences':
      case 'config':
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            key VARCHAR(255) NOT NULL,
            value JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(device_id, key)
          )
        `;
        break;

      case 'channels':
      case 'favorites':
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            data JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
        break;

      case 'history':
      case 'logs':
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            event_type VARCHAR(100),
            event_data JSONB,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
        break;

      case 'cache':
      case 'local_storage':
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            key VARCHAR(255) NOT NULL,
            value TEXT,
            expires_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(device_id, key)
          )
        `;
        break;

      default:
        // Generic table
        createSQL = `
          CREATE TABLE IF NOT EXISTS ${device.schema}.${tableName} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id VARCHAR(255) NOT NULL,
            data JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
    }

    if (createSQL) {
      await this.dbRouter.query(createSQL, [], { databaseId: device.databaseId });
    }
  }

  /**
   * Get device info
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Get all devices of a type
   */
  getDevicesByType(deviceType) {
    const devices = [];

    for (const device of this.devices.values()) {
      if (device.deviceType === deviceType) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Update device metadata
   */
  async updateDevice(deviceId, updates) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    // Update allowed fields
    if (updates.metadata) {
      device.metadata = { ...device.metadata, ...updates.metadata };
    }

    if (updates.status) {
      device.status = updates.status;
    }

    device.lastSeen = new Date();

    this.emit('device_updated', device);

    return device;
  }

  /**
   * Execute query on device database
   */
  async queryDevice(deviceId, sql, params = []) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (!this.dbRouter) {
      throw new Error('No database router configured');
    }

    return await this.dbRouter.query(sql, params, {
      databaseId: device.databaseId,
      deviceType: device.deviceType
    });
  }

  /**
   * Get device storage usage
   */
  async getDeviceStorage(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (!this.dbRouter) {
      return { used: 0, limit: device.storageLimit, percentage: 0 };
    }

    try {
      // Query database size for this device's schema
      const result = await this.dbRouter.query(
        `SELECT pg_total_relation_size(schemaname||'.'||tablename) as size
         FROM pg_tables
         WHERE schemaname = $1`,
        [device.schema],
        { databaseId: device.databaseId }
      );

      const totalSize = result.rows.reduce((sum, row) => sum + parseInt(row.size || 0), 0);
      device.storageUsed = totalSize;

      const percentage = device.storageLimit
        ? (totalSize / device.storageLimit * 100).toFixed(2)
        : 0;

      return {
        used: totalSize,
        limit: device.storageLimit,
        percentage: parseFloat(percentage),
        exceeded: device.storageLimit && totalSize > device.storageLimit
      };
    } catch (error) {
      console.error(`[DeviceDatabaseManager] Error getting storage for ${deviceId}:`, error.message);
      return { used: 0, limit: device.storageLimit, percentage: 0, error: error.message };
    }
  }

  /**
   * Check if device has exceeded storage limit
   */
  async checkStorageLimit(deviceId) {
    const storage = await this.getDeviceStorage(deviceId);
    return storage.exceeded;
  }

  /**
   * Sync data between devices (same user)
   */
  async syncDevices(fromDeviceId, toDeviceId, tables = []) {
    const fromDevice = this.devices.get(fromDeviceId);
    const toDevice = this.devices.get(toDeviceId);

    if (!fromDevice || !toDevice) {
      throw new Error('Device not found');
    }

    console.log(`[DeviceDatabaseManager] Syncing ${fromDeviceId} → ${toDeviceId}`);

    const syncResults = [];

    for (const table of tables) {
      try {
        // Read from source
        const data = await this.dbRouter.query(
          `SELECT * FROM ${fromDevice.schema}.${table} WHERE device_id = $1`,
          [fromDeviceId],
          { databaseId: fromDevice.databaseId }
        );

        // Write to destination
        for (const row of data.rows) {
          // Update device_id
          row.device_id = toDeviceId;

          // Insert (simplified - in production, handle conflicts)
          const columns = Object.keys(row).join(', ');
          const values = Object.values(row);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          await this.dbRouter.query(
            `INSERT INTO ${toDevice.schema}.${table} (${columns}) VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            values,
            { databaseId: toDevice.databaseId }
          );
        }

        syncResults.push({ table, synced: data.rows.length, success: true });
      } catch (error) {
        syncResults.push({ table, success: false, error: error.message });
      }
    }

    this.emit('devices_synced', {
      from: fromDeviceId,
      to: toDeviceId,
      results: syncResults
    });

    return syncResults;
  }

  /**
   * Deregister device
   */
  async deregisterDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }

    device.status = 'deregistered';
    device.deregisteredAt = new Date();

    // Update stats
    this.stats.devicesByType[device.deviceType]--;

    console.log(`[DeviceDatabaseManager] Deregistered device ${deviceId}`);

    this.emit('device_deregistered', device);

    return true;
  }

  /**
   * Remove device and all its data
   */
  async removeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }

    // Drop schema (WARNING: destroys all data!)
    if (this.dbRouter) {
      try {
        await this.dbRouter.query(
          `DROP SCHEMA IF EXISTS ${device.schema} CASCADE`,
          [],
          { databaseId: device.databaseId }
        );
      } catch (error) {
        console.error(`[DeviceDatabaseManager] Error dropping schema:`, error.message);
      }
    }

    this.devices.delete(deviceId);
    this.deviceDatabases.delete(deviceId);
    this.stats.totalDevices--;

    console.log(`[DeviceDatabaseManager] Removed device ${deviceId}`);

    this.emit('device_removed', { deviceId });

    return true;
  }

  /**
   * Get all devices
   */
  getAllDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get stats
   */
  async getStats() {
    const storageByType = {};

    for (const [deviceType, config] of Object.entries(this.deviceTypes)) {
      const devices = this.getDevicesByType(deviceType);
      let totalStorage = 0;

      for (const device of devices) {
        const storage = await this.getDeviceStorage(device.deviceId);
        totalStorage += storage.used;
      }

      storageByType[deviceType] = {
        devices: devices.length,
        storage: totalStorage,
        limit: config.storageLimit
      };
    }

    return {
      totalDevices: this.stats.totalDevices,
      devicesByType: this.stats.devicesByType,
      storageByType,
      deviceTypes: Object.keys(this.deviceTypes).length
    };
  }

  /**
   * Export device data (for backup)
   */
  async exportDeviceData(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const exportData = {
      device: { ...device },
      tables: {},
      exportedAt: new Date()
    };

    const typeConfig = this.deviceTypes[device.deviceType];

    for (const table of typeConfig.tables) {
      try {
        const result = await this.dbRouter.query(
          `SELECT * FROM ${device.schema}.${table} WHERE device_id = $1`,
          [deviceId],
          { databaseId: device.databaseId }
        );

        exportData.tables[table] = result.rows;
      } catch (error) {
        exportData.tables[table] = { error: error.message };
      }
    }

    return exportData;
  }

  /**
   * Import device data (for restore)
   */
  async importDeviceData(deviceId, exportData) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    console.log(`[DeviceDatabaseManager] Importing data for device ${deviceId}`);

    const results = [];

    for (const [table, rows] of Object.entries(exportData.tables)) {
      if (rows.error) {
        results.push({ table, success: false, error: rows.error });
        continue;
      }

      try {
        for (const row of rows) {
          const columns = Object.keys(row).join(', ');
          const values = Object.values(row);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          await this.dbRouter.query(
            `INSERT INTO ${device.schema}.${table} (${columns}) VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            values,
            { databaseId: device.databaseId }
          );
        }

        results.push({ table, imported: rows.length, success: true });
      } catch (error) {
        results.push({ table, success: false, error: error.message });
      }
    }

    return results;
  }
}

module.exports = DeviceDatabaseManager;
