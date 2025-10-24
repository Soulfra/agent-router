/**
 * Gaming Service Adapter
 *
 * Handles game-specific requests: NPC dialogue, map generation,
 * asset creation, coordinate systems, and visual processing.
 *
 * Supported Operations:
 * - npc_dialogue: Generate contextual NPC conversations
 * - map_generation: Create game maps and tile layouts
 * - asset_creation: Generate sprite descriptions and game assets
 * - coordinate_query: Handle location-based queries
 * - quest_generation: Create quests and storylines
 *
 * Port: 11436 (shared with OCR - visual processing)
 * Models: llava:7b, bakllava, soulfra-visual
 */

class GamingAdapter {
  constructor(options = {}) {
    this.ollamaPort = options.ollamaPort || 11436;
    this.ollamaHost = options.ollamaHost || 'http://localhost';
    this.defaultModel = options.defaultModel || 'llava:7b';
    this.db = options.db; // Database for game state
    this.npcManager = options.npcManager; // NPC management (optional)
  }

  /**
   * Main entry point for Gaming service requests
   *
   * @param {Object} request - Service request
   * @param {string} request.operation - gaming operation type
   * @param {Object} request.context - game context
   * @param {string} request.prompt - user prompt
   * @returns {Promise<Object>} Game-formatted response
   */
  async handle(request) {
    const { operation, context = {}, prompt } = request;

    switch (operation) {
      case 'npc_dialogue':
        return this.generateNPCDialogue(context, prompt);

      case 'map_generation':
        return this.generateMap(context, prompt);

      case 'asset_creation':
        return this.createAsset(context, prompt);

      case 'coordinate_query':
        return this.handleCoordinateQuery(context, prompt);

      case 'quest_generation':
        return this.generateQuest(context, prompt);

      default:
        throw new Error(`Unknown gaming operation: ${operation}`);
    }
  }

  /**
   * Generate NPC dialogue with context awareness
   *
   * @param {Object} context - Game context
   * @param {string} context.npc_id - NPC identifier
   * @param {Object} context.location - Coordinates and map
   * @param {Object} context.player_state - Player inventory, stats, etc.
   * @param {Array} context.conversation_history - Previous dialogue
   * @returns {Promise<Object>} NPC dialogue response
   */
  async generateNPCDialogue(context, customPrompt) {
    const {
      npc_id,
      location = {},
      player_state = {},
      conversation_history = []
    } = context;

    if (!npc_id) {
      throw new Error('Missing required context: npc_id');
    }

    // Load NPC data from database
    let npcData = {};
    if (this.db) {
      npcData = await this._loadNPCData(npc_id);
    }

    const { x = 0, y = 0, map = 'unknown' } = location;
    const { gold = 0, inventory = [], reputation = 'neutral' } = player_state;

    const prompt = customPrompt || `
      Generate contextual dialogue for an NPC.

      NPC: ${npcData.name || npc_id}
      Personality: ${npcData.personality || 'friendly'}
      Role: ${npcData.role || 'shopkeeper'}
      Location: ${map} (${x}, ${y})

      Player State:
      - Gold: ${gold}
      - Inventory: ${inventory.join(', ') || 'empty'}
      - Reputation: ${reputation}

      ${conversation_history.length > 0 ? `Previous conversation:\n${conversation_history.map(c => `${c.speaker}: ${c.text}`).join('\n')}` : 'First interaction'}

      Generate natural, in-character dialogue that:
      1. Matches NPC personality and role
      2. Acknowledges player state (gold, inventory, reputation)
      3. Offers appropriate actions (buy/sell, quests, information)
      4. Feels immersive and context-aware

      Return JSON:
      {
        "dialogue": "The NPC's spoken words",
        "emotion": "friendly|suspicious|excited|angry|neutral",
        "actions": [
          { "type": "offer", "item": "healing_potion", "price": 50 },
          { "type": "quest", "quest_id": "fetch_herbs", "description": "..." }
        ],
        "next_dialogue_ids": ["shopkeeper_buy", "shopkeeper_decline"],
        "relationship_change": 5
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    const dialogueData = this._parseJSON(response);

    // Update NPC state in database
    if (this.db && dialogueData.relationship_change) {
      await this._updateNPCRelationship(npc_id, player_state.user_id, dialogueData.relationship_change);
    }

    return dialogueData;
  }

  /**
   * Generate game map with tiles and coordinates
   */
  async generateMap(context, customPrompt) {
    const {
      map_name = 'new_area',
      width = 20,
      height = 20,
      theme = 'fantasy',
      features = []
    } = context;

    const prompt = customPrompt || `
      Generate a game map layout.

      Map Name: ${map_name}
      Dimensions: ${width}x${height}
      Theme: ${theme}
      Features: ${features.join(', ') || 'none specified'}

      Create a map with:
      1. Tile types (grass, water, forest, mountain, etc.)
      2. Points of interest (shops, quests, landmarks)
      3. NPC spawn locations
      4. Treasure/collectible locations

      Return JSON:
      {
        "map_name": "${map_name}",
        "width": ${width},
        "height": ${height},
        "tiles": [
          { "x": 0, "y": 0, "type": "grass", "walkable": true },
          { "x": 1, "y": 0, "type": "water", "walkable": false }
        ],
        "points_of_interest": [
          { "x": 10, "y": 10, "type": "shop", "name": "General Store", "npc_id": "shopkeeper_01" }
        ],
        "spawn_points": [
          { "x": 0, "y": 0, "description": "Player spawn" }
        ],
        "description": "Brief atmospheric description of the area"
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Create game assets (sprites, items, etc.)
   */
  async createAsset(context, customPrompt) {
    const {
      asset_type = 'item',
      description = '',
      rarity = 'common',
      domain_brand = null
    } = context;

    const prompt = customPrompt || `
      Create a game asset.

      Type: ${asset_type}
      Description: ${description || 'generate one'}
      Rarity: ${rarity}
      ${domain_brand ? `Brand: ${domain_brand} (incorporate brand colors/style)` : ''}

      Generate:
      1. Asset name and description
      2. Visual description (for sprite creation)
      3. Stats/properties (if applicable)
      4. Lore/backstory

      Return JSON:
      {
        "name": "Sword of Light",
        "description": "A glowing blade forged from starlight",
        "visual_description": "Silver blade with blue glow, golden crossguard",
        "asset_type": "${asset_type}",
        "rarity": "${rarity}",
        ${asset_type === 'item' ? '"stats": { "damage": 25, "durability": 100 },' : ''}
        ${asset_type === 'npc' ? '"personality": "wise", "role": "mentor",' : ''}
        "lore": "Forged by the ancient smiths of...",
        ${domain_brand ? '"brand_elements": { "colors": ["#667eea"], "theme": "soulfra" }' : ''}
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Handle coordinate-based queries
   */
  async handleCoordinateQuery(context, customPrompt) {
    const {
      x,
      y,
      map = 'world',
      query_type = 'what_is_here'
    } = context;

    if (x === undefined || y === undefined) {
      throw new Error('Missing required context: x, y coordinates');
    }

    // Load location data from database
    let locationData = {};
    if (this.db) {
      locationData = await this._loadLocationData(map, x, y);
    }

    const prompt = customPrompt || `
      Answer a location-based query.

      Location: ${map} (${x}, ${y})
      Query: ${query_type}

      Location data:
      ${JSON.stringify(locationData, null, 2)}

      Provide contextual information about this location.

      Return JSON:
      {
        "description": "You are standing in...",
        "nearby_npcs": [
          { "npc_id": "...", "name": "...", "distance": 2 }
        ],
        "nearby_pois": [
          { "type": "shop", "name": "...", "coordinates": { "x": 11, "y": 10 } }
        ],
        "items_on_ground": [],
        "atmospheric_text": "The wind howls across the barren plains..."
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Generate quests and storylines
   */
  async generateQuest(context, customPrompt) {
    const {
      quest_type = 'fetch',
      difficulty = 'medium',
      location = {},
      player_level = 1
    } = context;

    const prompt = customPrompt || `
      Generate a quest.

      Type: ${quest_type} (fetch, kill, escort, puzzle, etc.)
      Difficulty: ${difficulty}
      Player Level: ${player_level}
      Location: ${location.map || 'any'}

      Create a quest with:
      1. Engaging title and description
      2. Clear objectives
      3. Appropriate rewards
      4. Interesting lore/backstory

      Return JSON:
      {
        "quest_id": "fetch_herbs_01",
        "title": "The Healer's Request",
        "description": "The village healer needs rare herbs from the dark forest...",
        "type": "${quest_type}",
        "difficulty": "${difficulty}",
        "objectives": [
          { "type": "collect", "item": "moonflower", "quantity": 5, "location": "dark_forest" },
          { "type": "return", "npc_id": "healer_01" }
        ],
        "rewards": {
          "gold": 100,
          "xp": 500,
          "items": ["healing_potion"],
          "reputation": { "faction": "village", "amount": 10 }
        },
        "prerequisites": [],
        "estimated_time": "15 minutes",
        "lore": "Long ago, the moonflower was used to..."
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Load NPC data from database
   */
  async _loadNPCData(npcId) {
    if (!this.db) return {};

    try {
      const result = await this.db.query(
        'SELECT * FROM npcs WHERE npc_id = $1',
        [npcId]
      );

      return result.rows[0] || {};
    } catch (error) {
      console.error('[GamingAdapter] Error loading NPC data:', error);
      return {};
    }
  }

  /**
   * Update NPC relationship score
   */
  async _updateNPCRelationship(npcId, userId, change) {
    if (!this.db || !userId) return;

    try {
      await this.db.query(`
        INSERT INTO npc_relationships (npc_id, user_id, relationship_score)
        VALUES ($1, $2, $3)
        ON CONFLICT (npc_id, user_id)
        DO UPDATE SET relationship_score = npc_relationships.relationship_score + $3
      `, [npcId, userId, change]);
    } catch (error) {
      console.error('[GamingAdapter] Error updating NPC relationship:', error);
    }
  }

  /**
   * Load location data from database
   */
  async _loadLocationData(map, x, y) {
    if (!this.db) return {};

    try {
      // Load tile data
      const tileResult = await this.db.query(`
        SELECT * FROM map_tiles
        WHERE map_name = $1 AND x = $2 AND y = $3
      `, [map, x, y]);

      // Load nearby NPCs (within 5 tiles)
      const npcResult = await this.db.query(`
        SELECT npc_id, name, x, y,
               SQRT(POWER(x - $2, 2) + POWER(y - $3, 2)) as distance
        FROM npcs
        WHERE map_name = $1
          AND SQRT(POWER(x - $2, 2) + POWER(y - $3, 2)) <= 5
        ORDER BY distance
      `, [map, x, y]);

      return {
        tile: tileResult.rows[0] || {},
        nearby_npcs: npcResult.rows || []
      };
    } catch (error) {
      console.error('[GamingAdapter] Error loading location data:', error);
      return {};
    }
  }

  /**
   * Call Ollama on Gaming/Visual port 11436
   */
  async _callOllama(request) {
    const url = `${this.ollamaHost}:${this.ollamaPort}/api/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        prompt: request.prompt,
        format: request.format || 'json',
        stream: false,
        options: {
          temperature: 0.8, // Higher temperature for creative gaming content
          top_p: 0.95
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Parse JSON response from LLM
   */
  _parseJSON(response) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/```\s*([\s\S]*?)\s*```/);

      const jsonString = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonString.trim());
    } catch (error) {
      // If parsing fails, return raw response
      return { raw_response: response, parse_error: error.message };
    }
  }

  /**
   * Format response for API
   */
  format(data) {
    return {
      service: 'gaming',
      port: this.ollamaPort,
      data,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = GamingAdapter;
