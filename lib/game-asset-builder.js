/**
 * Game Asset Builder
 *
 * Build game-specific assets:
 * - Sprite sheets → Texture atlases
 * - Tilemap data
 * - Inventory definitions (potions, weapons, items)
 * - Character stats
 * - Level data
 *
 * "Potions and things of that nature" - game inventory assets
 *
 * Similar to:
 * - Unity Asset Bundle: pre-built asset packages
 * - Unreal Pak Files: packaged game assets
 * - RPG Maker: database of items/equipment
 */

const crypto = require('crypto');

class GameAssetBuilder {
  constructor(options = {}) {
    this.db = options.db;

    // Default item types
    this.ITEM_TYPES = {
      POTION: 'potion',
      WEAPON: 'weapon',
      ARMOR: 'armor',
      CONSUMABLE: 'consumable',
      QUEST: 'quest_item',
      MATERIAL: 'material',
      CURRENCY: 'currency'
    };

    // Default tile types
    this.TILE_TYPES = {
      EMPTY: 0,
      WALL: 1,
      FLOOR: 2,
      DOOR: 3,
      WATER: 4,
      LAVA: 5,
      GRASS: 6,
      CHEST: 7,
      ENEMY: 8,
      NPC: 9,
      SPAWN: 10
    };

    console.log('[GameAssetBuilder] Initialized');
  }

  /**
   * Build game assets for app instance
   *
   * @param {string} appId - App ID
   * @param {object} gameConfig - Game configuration
   * @returns {Promise<object>} - Built game assets
   */
  async buildGameAssets(appId, gameConfig = {}) {
    try {
      console.log(`[GameAssetBuilder] Building game assets for app ${appId}`);

      const assets = {
        app_id: appId,
        created_at: new Date().toISOString(),
        inventory: await this.buildInventoryAssets(gameConfig),
        tilemaps: await this.buildTilemapAssets(gameConfig),
        characters: await this.buildCharacterAssets(gameConfig),
        levels: await this.buildLevelAssets(gameConfig)
      };

      // Save to database
      await this.db.query(`
        INSERT INTO game_assets (
          app_id,
          asset_data,
          created_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (app_id)
        DO UPDATE SET asset_data = $2, updated_at = NOW()
      `, [appId, JSON.stringify(assets)]);

      console.log('[GameAssetBuilder] Game assets built successfully');

      return assets;

    } catch (error) {
      console.error('[GameAssetBuilder] Build error:', error);
      throw error;
    }
  }

  /**
   * Build inventory assets (items, potions, weapons)
   *
   * @param {object} config - Configuration
   * @returns {Promise<object>} - Inventory assets
   */
  async buildInventoryAssets(config = {}) {
    const inventory = {
      items: [],
      categories: {},
      total_items: 0
    };

    // Default potions
    const potions = [
      {
        item_id: 'health_potion',
        name: 'Health Potion',
        type: this.ITEM_TYPES.POTION,
        description: 'Restores 50 HP',
        icon: '🧪',
        stats: { hp_restore: 50 },
        rarity: 'common',
        stackable: true,
        max_stack: 99,
        value: 25
      },
      {
        item_id: 'mana_potion',
        name: 'Mana Potion',
        type: this.ITEM_TYPES.POTION,
        description: 'Restores 50 MP',
        icon: '💙',
        stats: { mp_restore: 50 },
        rarity: 'common',
        stackable: true,
        max_stack: 99,
        value: 25
      },
      {
        item_id: 'super_health_potion',
        name: 'Super Health Potion',
        type: this.ITEM_TYPES.POTION,
        description: 'Restores 150 HP',
        icon: '⚗️',
        stats: { hp_restore: 150 },
        rarity: 'rare',
        stackable: true,
        max_stack: 50,
        value: 100
      }
    ];

    // Default weapons
    const weapons = [
      {
        item_id: 'wooden_sword',
        name: 'Wooden Sword',
        type: this.ITEM_TYPES.WEAPON,
        description: 'A basic wooden sword',
        icon: '🗡️',
        stats: { attack: 5, durability: 50 },
        rarity: 'common',
        stackable: false,
        value: 50
      },
      {
        item_id: 'iron_sword',
        name: 'Iron Sword',
        type: this.ITEM_TYPES.WEAPON,
        description: 'A sturdy iron sword',
        icon: '⚔️',
        stats: { attack: 15, durability: 150 },
        rarity: 'uncommon',
        stackable: false,
        value: 200
      },
      {
        item_id: 'steel_bow',
        name: 'Steel Bow',
        type: this.ITEM_TYPES.WEAPON,
        description: 'A powerful steel bow',
        icon: '🏹',
        stats: { attack: 20, range: 10, durability: 100 },
        rarity: 'rare',
        stackable: false,
        value: 350
      }
    ];

    // Default armor
    const armor = [
      {
        item_id: 'leather_armor',
        name: 'Leather Armor',
        type: this.ITEM_TYPES.ARMOR,
        description: 'Basic leather protection',
        icon: '🛡️',
        stats: { defense: 5, durability: 80 },
        rarity: 'common',
        stackable: false,
        value: 75
      },
      {
        item_id: 'iron_armor',
        name: 'Iron Armor',
        type: this.ITEM_TYPES.ARMOR,
        description: 'Heavy iron plating',
        icon: '🛡️',
        stats: { defense: 15, durability: 200 },
        rarity: 'uncommon',
        stackable: false,
        value: 300
      }
    ];

    // Combine all items
    inventory.items = [...potions, ...weapons, ...armor];

    // Categorize
    for (const item of inventory.items) {
      if (!inventory.categories[item.type]) {
        inventory.categories[item.type] = [];
      }
      inventory.categories[item.type].push(item.item_id);
    }

    inventory.total_items = inventory.items.length;

    return inventory;
  }

  /**
   * Build tilemap assets
   *
   * @param {object} config - Configuration
   * @returns {Promise<object>} - Tilemap assets
   */
  async buildTilemapAssets(config = {}) {
    const tilemaps = {
      tilesets: [],
      maps: []
    };

    // Default tileset
    const tileset = {
      tileset_id: 'default_tileset',
      name: 'Default Tileset',
      tile_size: 32,
      tiles: {}
    };

    // Define tile properties
    for (const [name, id] of Object.entries(this.TILE_TYPES)) {
      tileset.tiles[id] = {
        id,
        name: name.toLowerCase(),
        walkable: id === this.TILE_TYPES.EMPTY || id === this.TILE_TYPES.FLOOR || id === this.TILE_TYPES.GRASS,
        sprite: null, // In production: reference to sprite atlas
        collision: id === this.TILE_TYPES.WALL
      };
    }

    tilemaps.tilesets.push(tileset);

    // Generate sample map
    const sampleMap = {
      map_id: 'starting_area',
      name: 'Starting Area',
      width: 20,
      height: 15,
      tileset_id: 'default_tileset',
      layers: {
        ground: this.generateMapLayer(20, 15, this.TILE_TYPES.FLOOR),
        walls: this.generateMapBorders(20, 15, this.TILE_TYPES.WALL),
        objects: []
      },
      spawn_points: [
        { x: 1, y: 1, type: 'player' },
        { x: 18, y: 13, type: 'goal' }
      ]
    };

    tilemaps.maps.push(sampleMap);

    return tilemaps;
  }

  /**
   * Generate map layer
   *
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {number} defaultTile - Default tile type
   * @returns {array} - 2D array of tiles
   */
  generateMapLayer(width, height, defaultTile) {
    return Array(height).fill(null).map(() =>
      Array(width).fill(defaultTile)
    );
  }

  /**
   * Generate map borders
   *
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {number} borderTile - Border tile type
   * @returns {array} - 2D array of tiles
   */
  generateMapBorders(width, height, borderTile) {
    const layer = Array(height).fill(null).map(() =>
      Array(width).fill(null)
    );

    // Top and bottom borders
    for (let x = 0; x < width; x++) {
      layer[0][x] = borderTile;
      layer[height - 1][x] = borderTile;
    }

    // Left and right borders
    for (let y = 0; y < height; y++) {
      layer[y][0] = borderTile;
      layer[y][width - 1] = borderTile;
    }

    return layer;
  }

  /**
   * Build character assets
   *
   * @param {object} config - Configuration
   * @returns {Promise<object>} - Character assets
   */
  async buildCharacterAssets(config = {}) {
    const characters = {
      classes: [],
      stats: {}
    };

    // Default character classes
    const classes = [
      {
        class_id: 'warrior',
        name: 'Warrior',
        description: 'Strong melee fighter',
        icon: '⚔️',
        base_stats: {
          hp: 120,
          mp: 30,
          attack: 15,
          defense: 12,
          speed: 8,
          magic: 5
        },
        equipment_slots: ['weapon', 'armor', 'shield', 'accessory']
      },
      {
        class_id: 'mage',
        name: 'Mage',
        description: 'Powerful magic user',
        icon: '🧙',
        base_stats: {
          hp: 80,
          mp: 150,
          attack: 7,
          defense: 6,
          speed: 10,
          magic: 20
        },
        equipment_slots: ['staff', 'robe', 'hat', 'accessory']
      },
      {
        class_id: 'rogue',
        name: 'Rogue',
        description: 'Fast and agile',
        icon: '🗡️',
        base_stats: {
          hp: 90,
          mp: 50,
          attack: 12,
          defense: 8,
          speed: 18,
          magic: 8
        },
        equipment_slots: ['dagger', 'light_armor', 'accessory', 'accessory']
      }
    ];

    characters.classes = classes;

    // Stat formulas
    characters.stats = {
      hp_per_level: 10,
      mp_per_level: 5,
      stat_growth_rate: 1.1
    };

    return characters;
  }

  /**
   * Build level assets
   *
   * @param {object} config - Configuration
   * @returns {Promise<object>} - Level assets
   */
  async buildLevelAssets(config = {}) {
    const levels = {
      progression: [],
      experience_curve: []
    };

    // Generate level progression (1-100)
    for (let level = 1; level <= 100; level++) {
      const expRequired = Math.floor(100 * Math.pow(level, 1.5));

      levels.progression.push({
        level,
        exp_required: expRequired,
        total_exp: levels.experience_curve[level - 2]?.total_exp || 0 + expRequired
      });

      levels.experience_curve.push({
        level,
        total_exp: (levels.experience_curve[level - 2]?.total_exp || 0) + expRequired
      });
    }

    return levels;
  }

  /**
   * Generate texture atlas from sprites
   *
   * @param {array} spritePaths - Paths to sprite images
   * @returns {Promise<object>} - Texture atlas
   */
  async generateTextureAtlas(spritePaths) {
    // In production: use sharp/jimp to create actual atlas
    // For now: return metadata

    const atlas = {
      atlas_id: crypto.randomUUID(),
      width: 512,
      height: 512,
      sprites: []
    };

    let x = 0;
    let y = 0;
    const spriteSize = 32;

    for (const spritePath of spritePaths) {
      atlas.sprites.push({
        sprite_id: path.basename(spritePath, path.extname(spritePath)),
        path: spritePath,
        x,
        y,
        width: spriteSize,
        height: spriteSize
      });

      x += spriteSize;
      if (x >= atlas.width) {
        x = 0;
        y += spriteSize;
      }
    }

    return atlas;
  }

  /**
   * Build item drop tables
   *
   * @param {object} config - Configuration
   * @returns {object} - Drop tables
   */
  buildDropTables(config = {}) {
    const dropTables = {
      common_enemy: [
        { item_id: 'health_potion', drop_rate: 0.3 },
        { item_id: 'mana_potion', drop_rate: 0.2 },
        { item_id: 'wooden_sword', drop_rate: 0.05 }
      ],
      rare_enemy: [
        { item_id: 'super_health_potion', drop_rate: 0.4 },
        { item_id: 'iron_sword', drop_rate: 0.2 },
        { item_id: 'leather_armor', drop_rate: 0.15 }
      ],
      boss: [
        { item_id: 'steel_bow', drop_rate: 0.5 },
        { item_id: 'iron_armor', drop_rate: 0.4 },
        { item_id: 'super_health_potion', drop_rate: 0.8, quantity: 3 }
      ],
      chest: [
        { item_id: 'health_potion', drop_rate: 0.6, quantity: 2 },
        { item_id: 'mana_potion', drop_rate: 0.6, quantity: 2 },
        { item_id: 'iron_sword', drop_rate: 0.1 }
      ]
    };

    return dropTables;
  }

  /**
   * Get game assets
   *
   * @param {string} appId - App ID
   * @returns {Promise<object>} - Game assets
   */
  async getGameAssets(appId) {
    try {
      const result = await this.db.query(`
        SELECT asset_data FROM game_assets WHERE app_id = $1
      `, [appId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].asset_data;

    } catch (error) {
      console.error('[GameAssetBuilder] Get assets error:', error);
      return null;
    }
  }
}

module.exports = GameAssetBuilder;
