/**
 * Resource Manager
 *
 * Track asset/inventory state:
 * - What resources exist (manifest)
 * - Load state: empty/loading/loaded/failed
 * - Types: code, sprites, audio, textures, meshes
 * - Inventory: items, potions, equipment (for games)
 *
 * "Inventory is empty vs not empty" - track resource loading state
 *
 * Similar to:
 * - Unity Resource Manager: asset loading
 * - Unreal Asset Registry: asset tracking
 * - Game inventory systems: items, equipment
 */

class ResourceManager {
  constructor(options = {}) {
    this.db = options.db;
    this.resources = new Map(); // In-memory cache
    this.loadingPromises = new Map(); // Track in-progress loads

    // Resource states
    this.STATES = {
      EMPTY: 'empty', // Not loaded
      LOADING: 'loading', // Loading in progress
      LOADED: 'loaded', // Successfully loaded
      FAILED: 'failed' // Load failed
    };

    // Resource types
    this.TYPES = {
      CODE: 'code',
      WASM: 'wasm',
      IMAGE: 'image',
      SPRITE: 'sprite',
      AUDIO: 'audio',
      MODEL: 'model',
      DATA: 'data',
      INVENTORY_ITEM: 'inventory_item'
    };

    console.log('[ResourceManager] Initialized');
  }

  /**
   * Load manifest for app instance
   *
   * @param {string} appId - App ID
   * @param {string} manifestPath - Path to manifest file
   * @returns {Promise<object>} - Loaded manifest
   */
  async loadManifest(appId, manifestPath) {
    try {
      const fs = require('fs').promises;
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Store manifest in database
      await this.db.query(`
        INSERT INTO resource_manifests (
          app_id,
          manifest_data,
          created_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (app_id)
        DO UPDATE SET manifest_data = $2, updated_at = NOW()
      `, [appId, JSON.stringify(manifest)]);

      // Initialize resource states
      await this.initializeResources(appId, manifest);

      console.log(`[ResourceManager] Loaded manifest for app ${appId}`);

      return manifest;

    } catch (error) {
      console.error('[ResourceManager] Load manifest error:', error);
      throw error;
    }
  }

  /**
   * Initialize resources from manifest
   *
   * @param {string} appId - App ID
   * @param {object} manifest - Asset manifest
   * @returns {Promise<void>}
   */
  async initializeResources(appId, manifest) {
    const resources = [];

    // Process each asset type
    for (const [assetType, assets] of Object.entries(manifest.assets || {})) {
      for (const asset of assets) {
        resources.push({
          app_id: appId,
          resource_id: asset.hash || asset.output,
          resource_type: assetType,
          resource_path: asset.output,
          state: this.STATES.EMPTY,
          metadata: JSON.stringify(asset)
        });
      }
    }

    // Batch insert
    if (resources.length > 0) {
      for (const resource of resources) {
        await this.db.query(`
          INSERT INTO resource_states (
            app_id,
            resource_id,
            resource_type,
            resource_path,
            state,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (app_id, resource_id)
          DO UPDATE SET
            resource_type = $3,
            resource_path = $4,
            state = $5,
            metadata = $6,
            updated_at = NOW()
        `, [
          resource.app_id,
          resource.resource_id,
          resource.resource_type,
          resource.resource_path,
          resource.state,
          resource.metadata
        ]);
      }
    }

    console.log(`[ResourceManager] Initialized ${resources.length} resources`);
  }

  /**
   * Load resource
   *
   * @param {string} appId - App ID
   * @param {string} resourceId - Resource ID
   * @returns {Promise<object>} - Loaded resource
   */
  async loadResource(appId, resourceId) {
    const cacheKey = `${appId}:${resourceId}`;

    // Check cache
    if (this.resources.has(cacheKey)) {
      const cached = this.resources.get(cacheKey);
      if (cached.state === this.STATES.LOADED) {
        return cached;
      }
    }

    // Check if already loading
    if (this.loadingPromises.has(cacheKey)) {
      return await this.loadingPromises.get(cacheKey);
    }

    // Start loading
    const loadPromise = this._loadResource(appId, resourceId);
    this.loadingPromises.set(cacheKey, loadPromise);

    try {
      const resource = await loadPromise;
      this.resources.set(cacheKey, resource);
      return resource;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Internal resource loading
   *
   * @param {string} appId - App ID
   * @param {string} resourceId - Resource ID
   * @returns {Promise<object>} - Loaded resource
   */
  async _loadResource(appId, resourceId) {
    try {
      // Update state to loading
      await this.updateResourceState(appId, resourceId, this.STATES.LOADING);

      // Get resource info
      const result = await this.db.query(`
        SELECT * FROM resource_states
        WHERE app_id = $1 AND resource_id = $2
      `, [appId, resourceId]);

      if (result.rows.length === 0) {
        throw new Error(`Resource ${resourceId} not found`);
      }

      const resourceInfo = result.rows[0];

      // Load resource data (in production: actually load from disk/CDN)
      const resourceData = {
        ...resourceInfo,
        data: null, // Placeholder
        loaded_at: new Date()
      };

      // Update state to loaded
      await this.updateResourceState(appId, resourceId, this.STATES.LOADED);

      console.log(`[ResourceManager] Loaded resource ${resourceId}`);

      return resourceData;

    } catch (error) {
      console.error(`[ResourceManager] Load error for ${resourceId}:`, error);

      // Update state to failed
      await this.updateResourceState(appId, resourceId, this.STATES.FAILED);

      throw error;
    }
  }

  /**
   * Update resource state
   *
   * @param {string} appId - App ID
   * @param {string} resourceId - Resource ID
   * @param {string} state - New state
   * @returns {Promise<void>}
   */
  async updateResourceState(appId, resourceId, state) {
    try {
      await this.db.query(`
        UPDATE resource_states
        SET state = $1, updated_at = NOW()
        WHERE app_id = $2 AND resource_id = $3
      `, [state, appId, resourceId]);

    } catch (error) {
      console.error('[ResourceManager] Update state error:', error);
    }
  }

  /**
   * Get resource state
   *
   * @param {string} appId - App ID
   * @param {string} resourceId - Resource ID
   * @returns {Promise<object>} - Resource state
   */
  async getResourceState(appId, resourceId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM resource_states
        WHERE app_id = $1 AND resource_id = $2
      `, [appId, resourceId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[ResourceManager] Get state error:', error);
      return null;
    }
  }

  /**
   * Get all resources for app
   *
   * @param {string} appId - App ID
   * @param {object} filters - Filter options
   * @returns {Promise<array>} - Resources
   */
  async getResources(appId, filters = {}) {
    try {
      let query = `
        SELECT * FROM resource_states
        WHERE app_id = $1
      `;

      const params = [appId];
      let paramCount = 2;

      if (filters.type) {
        query += ` AND resource_type = $${paramCount++}`;
        params.push(filters.type);
      }

      if (filters.state) {
        query += ` AND state = $${paramCount++}`;
        params.push(filters.state);
      }

      query += ` ORDER BY created_at ASC`;

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ResourceManager] Get resources error:', error);
      return [];
    }
  }

  /**
   * Get resource statistics
   *
   * @param {string} appId - App ID
   * @returns {Promise<object>} - Resource stats
   */
  async getResourceStats(appId) {
    try {
      const result = await this.db.query(`
        SELECT
          resource_type,
          state,
          COUNT(*) as count
        FROM resource_states
        WHERE app_id = $1
        GROUP BY resource_type, state
        ORDER BY resource_type, state
      `, [appId]);

      const stats = {
        total: 0,
        by_type: {},
        by_state: {
          empty: 0,
          loading: 0,
          loaded: 0,
          failed: 0
        }
      };

      for (const row of result.rows) {
        const count = parseInt(row.count);
        stats.total += count;

        if (!stats.by_type[row.resource_type]) {
          stats.by_type[row.resource_type] = 0;
        }
        stats.by_type[row.resource_type] += count;

        stats.by_state[row.state] += count;
      }

      return stats;

    } catch (error) {
      console.error('[ResourceManager] Get stats error:', error);
      return { total: 0, by_type: {}, by_state: {} };
    }
  }

  /**
   * Preload resources
   *
   * @param {string} appId - App ID
   * @param {array} resourceIds - Resource IDs to preload
   * @returns {Promise<array>} - Loaded resources
   */
  async preloadResources(appId, resourceIds) {
    const loaded = [];

    for (const resourceId of resourceIds) {
      try {
        const resource = await this.loadResource(appId, resourceId);
        loaded.push(resource);
      } catch (error) {
        console.error(`[ResourceManager] Preload error for ${resourceId}:`, error);
      }
    }

    console.log(`[ResourceManager] Preloaded ${loaded.length}/${resourceIds.length} resources`);

    return loaded;
  }

  /**
   * Unload resource (free memory)
   *
   * @param {string} appId - App ID
   * @param {string} resourceId - Resource ID
   * @returns {Promise<void>}
   */
  async unloadResource(appId, resourceId) {
    const cacheKey = `${appId}:${resourceId}`;

    // Remove from cache
    this.resources.delete(cacheKey);

    // Update state to empty
    await this.updateResourceState(appId, resourceId, this.STATES.EMPTY);

    console.log(`[ResourceManager] Unloaded resource ${resourceId}`);
  }

  /**
   * Clear all resources for app
   *
   * @param {string} appId - App ID
   * @returns {Promise<void>}
   */
  async clearResources(appId) {
    // Remove from cache
    for (const key of this.resources.keys()) {
      if (key.startsWith(`${appId}:`)) {
        this.resources.delete(key);
      }
    }

    // Reset states to empty
    await this.db.query(`
      UPDATE resource_states
      SET state = $1, updated_at = NOW()
      WHERE app_id = $2
    `, [this.STATES.EMPTY, appId]);

    console.log(`[ResourceManager] Cleared all resources for app ${appId}`);
  }

  /**
   * Get inventory for app (game items)
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Inventory
   */
  async getInventory(appId, userId) {
    try {
      const result = await this.db.query(`
        SELECT
          item_id,
          item_type,
          quantity,
          metadata
        FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        ORDER BY item_type, item_id
      `, [appId, userId]);

      const inventory = {
        user_id: userId,
        app_id: appId,
        total_slots: 20, // Default
        used_slots: result.rows.length,
        empty_slots: 20 - result.rows.length,
        items: result.rows
      };

      return inventory;

    } catch (error) {
      console.error('[ResourceManager] Get inventory error:', error);
      return { user_id: userId, app_id: appId, total_slots: 20, used_slots: 0, empty_slots: 20, items: [] };
    }
  }

  /**
   * Add item to inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {object} item - Item to add
   * @returns {Promise<object>} - Added item
   */
  async addInventoryItem(appId, userId, item) {
    try {
      const result = await this.db.query(`
        INSERT INTO inventory_items (
          app_id,
          user_id,
          item_id,
          item_type,
          quantity,
          metadata,
          acquired_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
      `, [
        appId,
        userId,
        item.item_id || crypto.randomUUID(),
        item.item_type,
        item.quantity || 1,
        JSON.stringify(item.metadata || {})
      ]);

      console.log(`[ResourceManager] Added item ${item.item_type} to inventory`);

      return result.rows[0];

    } catch (error) {
      console.error('[ResourceManager] Add inventory item error:', error);
      throw error;
    }
  }

  /**
   * Remove item from inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {string} itemId - Item ID
   * @returns {Promise<boolean>}
   */
  async removeInventoryItem(appId, userId, itemId) {
    try {
      const result = await this.db.query(`
        DELETE FROM inventory_items
        WHERE app_id = $1 AND user_id = $2 AND item_id = $3
        RETURNING item_id
      `, [appId, userId, itemId]);

      if (result.rows.length > 0) {
        console.log(`[ResourceManager] Removed item ${itemId} from inventory`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[ResourceManager] Remove inventory item error:', error);
      return false;
    }
  }
}

module.exports = ResourceManager;
