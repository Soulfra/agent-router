/**
 * Game Inventory System
 *
 * Manage player inventory for games:
 * - Items, potions, weapons, armor
 * - Empty vs filled slots
 * - Equipment management
 * - Item stacking
 * - Trading between players
 *
 * "Inventory empty versus not empty or potions and things of that nature"
 *
 * Similar to:
 * - RPG inventory systems (Skyrim, Fallout)
 * - MMO inventories (WoW, FFXIV)
 * - Item management in games
 */

const crypto = require('crypto');

class GameInventory {
  constructor(options = {}) {
    this.db = options.db;

    // Default configuration
    this.DEFAULT_SLOTS = 20;
    this.MAX_STACK = 99;

    // Item rarity tiers
    this.RARITY = {
      COMMON: 'common',
      UNCOMMON: 'uncommon',
      RARE: 'rare',
      EPIC: 'epic',
      LEGENDARY: 'legendary'
    };

    // Equipment slots
    this.EQUIPMENT_SLOTS = {
      HEAD: 'head',
      BODY: 'body',
      HANDS: 'hands',
      LEGS: 'legs',
      FEET: 'feet',
      WEAPON: 'weapon',
      SHIELD: 'shield',
      ACCESSORY_1: 'accessory_1',
      ACCESSORY_2: 'accessory_2'
    };

    console.log('[GameInventory] Initialized');
  }

  /**
   * Initialize inventory for user
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {object} config - Inventory configuration
   * @returns {Promise<object>} - Inventory
   */
  async initializeInventory(appId, userId, config = {}) {
    try {
      const totalSlots = config.totalSlots || this.DEFAULT_SLOTS;

      await this.db.query(`
        INSERT INTO player_inventories (
          app_id,
          user_id,
          total_slots,
          created_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (app_id, user_id) DO NOTHING
      `, [appId, userId, totalSlots]);

      console.log(`[GameInventory] Initialized inventory for user ${userId} (${totalSlots} slots)`);

      return await this.getInventory(appId, userId);

    } catch (error) {
      console.error('[GameInventory] Initialize error:', error);
      throw error;
    }
  }

  /**
   * Get player inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Inventory
   */
  async getInventory(appId, userId) {
    try {
      // Get inventory info
      const inventoryResult = await this.db.query(`
        SELECT * FROM player_inventories
        WHERE app_id = $1 AND user_id = $2
      `, [appId, userId]);

      if (inventoryResult.rows.length === 0) {
        // Initialize if doesn't exist
        return await this.initializeInventory(appId, userId);
      }

      const inventory = inventoryResult.rows[0];

      // Get items
      const itemsResult = await this.db.query(`
        SELECT * FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        ORDER BY slot_index ASC
      `, [appId, userId]);

      // Get equipped items
      const equippedResult = await this.db.query(`
        SELECT * FROM equipped_items
        WHERE app_id = $1 AND user_id = $2
      `, [appId, userId]);

      const items = itemsResult.rows;
      const usedSlots = items.length;
      const emptySlots = inventory.total_slots - usedSlots;

      return {
        user_id: userId,
        app_id: appId,
        total_slots: inventory.total_slots,
        used_slots: usedSlots,
        empty_slots: emptySlots,
        capacity_percent: ((usedSlots / inventory.total_slots) * 100).toFixed(2),
        items: items,
        equipped: equippedResult.rows,
        stats: {
          total_items: usedSlots,
          by_type: await this.getItemsByType(appId, userId),
          by_rarity: await this.getItemsByRarity(appId, userId),
          total_value: await this.getTotalValue(appId, userId)
        }
      };

    } catch (error) {
      console.error('[GameInventory] Get inventory error:', error);
      throw error;
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
  async addItem(appId, userId, item) {
    try {
      // Check if inventory is full
      const inventory = await this.getInventory(appId, userId);

      if (inventory.empty_slots === 0 && !item.stackable) {
        throw new Error('Inventory is full');
      }

      // Check if item is stackable and already exists
      if (item.stackable) {
        const existingItem = await this.findStackableItem(appId, userId, item.item_id);

        if (existingItem) {
          // Stack with existing item
          return await this.stackItem(appId, userId, existingItem.slot_index, item.quantity || 1);
        }
      }

      // Find next available slot
      const nextSlot = await this.findNextEmptySlot(appId, userId);

      if (nextSlot === null) {
        throw new Error('No available slots');
      }

      // Add item
      const result = await this.db.query(`
        INSERT INTO inventory_items (
          app_id,
          user_id,
          slot_index,
          item_id,
          item_type,
          item_name,
          quantity,
          rarity,
          stackable,
          max_stack,
          value,
          metadata,
          acquired_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `, [
        appId,
        userId,
        nextSlot,
        item.item_id,
        item.item_type,
        item.item_name || item.name,
        item.quantity || 1,
        item.rarity || this.RARITY.COMMON,
        item.stackable || false,
        item.max_stack || this.MAX_STACK,
        item.value || 0,
        JSON.stringify(item.metadata || {})
      ]);

      console.log(`[GameInventory] Added ${item.item_name} to slot ${nextSlot}`);

      return result.rows[0];

    } catch (error) {
      console.error('[GameInventory] Add item error:', error);
      throw error;
    }
  }

  /**
   * Remove item from inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {number} slotIndex - Slot index
   * @param {number} quantity - Quantity to remove (for stackable items)
   * @returns {Promise<boolean>}
   */
  async removeItem(appId, userId, slotIndex, quantity = null) {
    try {
      // Get item
      const itemResult = await this.db.query(`
        SELECT * FROM inventory_items
        WHERE app_id = $1 AND user_id = $2 AND slot_index = $3
      `, [appId, userId, slotIndex]);

      if (itemResult.rows.length === 0) {
        throw new Error('Item not found');
      }

      const item = itemResult.rows[0];

      // If stackable and quantity specified
      if (item.stackable && quantity && quantity < item.quantity) {
        // Decrease quantity
        await this.db.query(`
          UPDATE inventory_items
          SET quantity = quantity - $1
          WHERE app_id = $2 AND user_id = $3 AND slot_index = $4
        `, [quantity, appId, userId, slotIndex]);

        console.log(`[GameInventory] Removed ${quantity}x ${item.item_name} from slot ${slotIndex}`);
        return true;
      }

      // Remove entire item
      await this.db.query(`
        DELETE FROM inventory_items
        WHERE app_id = $1 AND user_id = $2 AND slot_index = $3
      `, [appId, userId, slotIndex]);

      console.log(`[GameInventory] Removed ${item.item_name} from slot ${slotIndex}`);

      return true;

    } catch (error) {
      console.error('[GameInventory] Remove item error:', error);
      throw error;
    }
  }

  /**
   * Equip item
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {number} slotIndex - Inventory slot index
   * @param {string} equipSlot - Equipment slot
   * @returns {Promise<object>} - Equipped item
   */
  async equipItem(appId, userId, slotIndex, equipSlot) {
    try {
      // Get item
      const itemResult = await this.db.query(`
        SELECT * FROM inventory_items
        WHERE app_id = $1 AND user_id = $2 AND slot_index = $3
      `, [appId, userId, slotIndex]);

      if (itemResult.rows.length === 0) {
        throw new Error('Item not found');
      }

      const item = itemResult.rows[0];

      // Check if equipment slot is already occupied
      const existingEquipped = await this.db.query(`
        SELECT * FROM equipped_items
        WHERE app_id = $1 AND user_id = $2 AND equipment_slot = $3
      `, [appId, userId, equipSlot]);

      // Unequip existing item
      if (existingEquipped.rows.length > 0) {
        await this.unequipItem(appId, userId, equipSlot);
      }

      // Equip new item
      await this.db.query(`
        INSERT INTO equipped_items (
          app_id,
          user_id,
          equipment_slot,
          item_id,
          item_type,
          item_name,
          metadata,
          equipped_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (app_id, user_id, equipment_slot)
        DO UPDATE SET
          item_id = $4,
          item_type = $5,
          item_name = $6,
          metadata = $7,
          equipped_at = NOW()
      `, [
        appId,
        userId,
        equipSlot,
        item.item_id,
        item.item_type,
        item.item_name,
        item.metadata
      ]);

      // Remove from inventory (optional - depends on game design)
      // await this.removeItem(appId, userId, slotIndex);

      console.log(`[GameInventory] Equipped ${item.item_name} to ${equipSlot}`);

      return { item_id: item.item_id, equipment_slot: equipSlot };

    } catch (error) {
      console.error('[GameInventory] Equip item error:', error);
      throw error;
    }
  }

  /**
   * Unequip item
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {string} equipSlot - Equipment slot
   * @returns {Promise<boolean>}
   */
  async unequipItem(appId, userId, equipSlot) {
    try {
      await this.db.query(`
        DELETE FROM equipped_items
        WHERE app_id = $1 AND user_id = $2 AND equipment_slot = $3
      `, [appId, userId, equipSlot]);

      console.log(`[GameInventory] Unequipped item from ${equipSlot}`);

      return true;

    } catch (error) {
      console.error('[GameInventory] Unequip item error:', error);
      return false;
    }
  }

  /**
   * Find stackable item in inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {string} itemId - Item ID
   * @returns {Promise<object>} - Stackable item or null
   */
  async findStackableItem(appId, userId, itemId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM inventory_items
        WHERE app_id = $1
          AND user_id = $2
          AND item_id = $3
          AND stackable = true
          AND quantity < max_stack
        LIMIT 1
      `, [appId, userId, itemId]);

      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      console.error('[GameInventory] Find stackable item error:', error);
      return null;
    }
  }

  /**
   * Stack item (increase quantity)
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {number} slotIndex - Slot index
   * @param {number} quantity - Quantity to add
   * @returns {Promise<object>} - Updated item
   */
  async stackItem(appId, userId, slotIndex, quantity) {
    try {
      const result = await this.db.query(`
        UPDATE inventory_items
        SET quantity = LEAST(quantity + $1, max_stack)
        WHERE app_id = $2 AND user_id = $3 AND slot_index = $4
        RETURNING *
      `, [quantity, appId, userId, slotIndex]);

      console.log(`[GameInventory] Stacked ${quantity} items to slot ${slotIndex}`);

      return result.rows[0];

    } catch (error) {
      console.error('[GameInventory] Stack item error:', error);
      throw error;
    }
  }

  /**
   * Find next empty slot
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Slot index or null
   */
  async findNextEmptySlot(appId, userId) {
    try {
      const result = await this.db.query(`
        SELECT total_slots FROM player_inventories
        WHERE app_id = $1 AND user_id = $2
      `, [appId, userId]);

      if (result.rows.length === 0) return null;

      const totalSlots = result.rows[0].total_slots;

      // Get all used slots
      const usedSlotsResult = await this.db.query(`
        SELECT slot_index FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        ORDER BY slot_index ASC
      `, [appId, userId]);

      const usedSlots = new Set(usedSlotsResult.rows.map(r => r.slot_index));

      // Find first unused slot
      for (let i = 0; i < totalSlots; i++) {
        if (!usedSlots.has(i)) {
          return i;
        }
      }

      return null;

    } catch (error) {
      console.error('[GameInventory] Find empty slot error:', error);
      return null;
    }
  }

  /**
   * Get items by type
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Items grouped by type
   */
  async getItemsByType(appId, userId) {
    try {
      const result = await this.db.query(`
        SELECT item_type, COUNT(*) as count, SUM(quantity) as total_quantity
        FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        GROUP BY item_type
      `, [appId, userId]);

      const byType = {};
      for (const row of result.rows) {
        byType[row.item_type] = {
          count: parseInt(row.count),
          total_quantity: parseInt(row.total_quantity)
        };
      }

      return byType;

    } catch (error) {
      console.error('[GameInventory] Get items by type error:', error);
      return {};
    }
  }

  /**
   * Get items by rarity
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Items grouped by rarity
   */
  async getItemsByRarity(appId, userId) {
    try {
      const result = await this.db.query(`
        SELECT rarity, COUNT(*) as count
        FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        GROUP BY rarity
      `, [appId, userId]);

      const byRarity = {};
      for (const row of result.rows) {
        byRarity[row.rarity] = parseInt(row.count);
      }

      return byRarity;

    } catch (error) {
      console.error('[GameInventory] Get items by rarity error:', error);
      return {};
    }
  }

  /**
   * Get total inventory value
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Total value
   */
  async getTotalValue(appId, userId) {
    try {
      const result = await this.db.query(`
        SELECT SUM(value * quantity) as total_value
        FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
      `, [appId, userId]);

      return parseInt(result.rows[0].total_value) || 0;

    } catch (error) {
      console.error('[GameInventory] Get total value error:', error);
      return 0;
    }
  }

  /**
   * Sort inventory
   *
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @param {string} sortBy - Sort criteria (type, rarity, value, name)
   * @returns {Promise<void>}
   */
  async sortInventory(appId, userId, sortBy = 'type') {
    try {
      let orderClause = 'item_type ASC, item_name ASC';

      switch (sortBy) {
        case 'rarity':
          orderClause = 'rarity DESC, item_name ASC';
          break;
        case 'value':
          orderClause = 'value DESC, item_name ASC';
          break;
        case 'name':
          orderClause = 'item_name ASC';
          break;
      }

      // Get sorted items
      const result = await this.db.query(`
        SELECT * FROM inventory_items
        WHERE app_id = $1 AND user_id = $2
        ORDER BY ${orderClause}
      `, [appId, userId]);

      // Update slot indices
      for (let i = 0; i < result.rows.length; i++) {
        await this.db.query(`
          UPDATE inventory_items
          SET slot_index = $1
          WHERE app_id = $2 AND user_id = $3 AND item_id = $4
        `, [i, appId, userId, result.rows[i].item_id]);
      }

      console.log(`[GameInventory] Sorted inventory by ${sortBy}`);

    } catch (error) {
      console.error('[GameInventory] Sort inventory error:', error);
      throw error;
    }
  }
}

module.exports = GameInventory;
