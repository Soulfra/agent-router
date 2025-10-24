/**
 * Gaming Service Routes
 *
 * RESTful API for game-related AI operations using the Gaming Adapter.
 * Handles NPC dialogue, map generation, quest creation, and game asset generation.
 *
 * Uses port 11436 (Gaming/Visual Models)
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createGamingRoutes({ db, gamingAdapter }) {
  if (!gamingAdapter) {
    throw new Error('GamingAdapter required for gaming routes');
  }

  // ============================================================================
  // NPC DIALOGUE
  // ============================================================================

  /**
   * POST /api/gaming/npc-dialogue
   * Generate contextual NPC dialogue
   *
   * Request body:
   * {
   *   "npc_id": "shopkeeper_01",
   *   "location": { "x": 120, "y": 80, "map": "hollowtown_square" },
   *   "player_state": { "gold": 50, "inventory": ["sword"], "reputation": "neutral" },
   *   "conversation_history": [
   *     { "speaker": "player", "text": "Hello" },
   *     { "speaker": "npc", "text": "Greetings, traveler!" }
   *   ],
   *   "custom_prompt": "The player asks about armor" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "dialogue": "Ah, armor ye seek? I've got chainmail for 30 gold...",
   *   "emotion": "friendly",
   *   "actions": [
   *     { "type": "offer", "item": "chainmail", "price": 30 }
   *   ],
   *   "next_dialogue_ids": ["shopkeeper_buy", "shopkeeper_decline"],
   *   "relationship_change": 5
   * }
   */
  router.post('/npc-dialogue', async (req, res) => {
    try {
      const { npc_id, location, player_state, conversation_history, custom_prompt } = req.body;

      if (!npc_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: npc_id'
        });
      }

      const result = await gamingAdapter.handle({
        operation: 'npc_dialogue',
        context: { npc_id, location, player_state, conversation_history },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GamingRoutes] NPC dialogue error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // MAP GENERATION
  // ============================================================================

  /**
   * POST /api/gaming/generate-map
   * Generate game map with tiles and points of interest
   *
   * Request body:
   * {
   *   "map_name": "dark_forest",
   *   "width": 20,
   *   "height": 20,
   *   "theme": "fantasy",
   *   "features": ["shop", "quest_marker", "treasure"]
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "map_name": "dark_forest",
   *   "width": 20,
   *   "height": 20,
   *   "tiles": [
   *     { "x": 0, "y": 0, "type": "grass", "walkable": true }
   *   ],
   *   "points_of_interest": [
   *     { "x": 10, "y": 10, "type": "shop", "name": "General Store" }
   *   ],
   *   "description": "A dense forest shrouded in mist..."
   * }
   */
  router.post('/generate-map', async (req, res) => {
    try {
      const { map_name, width, height, theme, features } = req.body;

      const result = await gamingAdapter.handle({
        operation: 'map_generation',
        context: { map_name, width, height, theme, features }
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GamingRoutes] Map generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ASSET CREATION
  // ============================================================================

  /**
   * POST /api/gaming/create-asset
   * Generate game asset (item, NPC, weapon, etc.)
   *
   * Request body:
   * {
   *   "asset_type": "item",
   *   "description": "A glowing sword forged from starlight",
   *   "rarity": "legendary",
   *   "domain_brand": "soulfra" // optional: incorporate brand colors
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "name": "Sword of Starlight",
   *   "description": "...",
   *   "visual_description": "Silver blade with blue glow...",
   *   "stats": { "damage": 50, "durability": 100 },
   *   "lore": "Forged by ancient smiths..."
   * }
   */
  router.post('/create-asset', async (req, res) => {
    try {
      const { asset_type, description, rarity, domain_brand } = req.body;

      const result = await gamingAdapter.handle({
        operation: 'asset_creation',
        context: { asset_type, description, rarity, domain_brand }
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GamingRoutes] Asset creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // LOCATION QUERIES
  // ============================================================================

  /**
   * POST /api/gaming/location-query
   * Query information about a specific location
   *
   * Request body:
   * {
   *   "x": 100,
   *   "y": 200,
   *   "map": "hollowtown_square",
   *   "query_type": "what_is_here"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "description": "You are standing in the town square...",
   *   "nearby_npcs": [
   *     { "npc_id": "...", "name": "Shopkeeper", "distance": 2 }
   *   ],
   *   "nearby_pois": [
   *     { "type": "shop", "name": "General Store", "coordinates": {...} }
   *   ],
   *   "items_on_ground": [],
   *   "atmospheric_text": "The wind howls..."
   * }
   */
  router.post('/location-query', async (req, res) => {
    try {
      const { x, y, map, query_type } = req.body;

      if (x === undefined || y === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: x, y coordinates'
        });
      }

      const result = await gamingAdapter.handle({
        operation: 'coordinate_query',
        context: { x, y, map, query_type }
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GamingRoutes] Location query error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // QUEST GENERATION
  // ============================================================================

  /**
   * POST /api/gaming/generate-quest
   * Generate quest with objectives and rewards
   *
   * Request body:
   * {
   *   "quest_type": "fetch",
   *   "difficulty": "medium",
   *   "location": { "map": "dark_forest" },
   *   "player_level": 5
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "quest_id": "fetch_herbs_01",
   *   "title": "The Healer's Request",
   *   "description": "...",
   *   "objectives": [
   *     { "type": "collect", "item": "moonflower", "quantity": 5 }
   *   ],
   *   "rewards": {
   *     "gold": 100,
   *     "xp": 500,
   *     "items": ["healing_potion"]
   *   }
   * }
   */
  router.post('/generate-quest', async (req, res) => {
    try {
      const { quest_type, difficulty, location, player_level } = req.body;

      const result = await gamingAdapter.handle({
        operation: 'quest_generation',
        context: { quest_type, difficulty, location, player_level }
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GamingRoutes] Quest generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/gaming/health
   * Check if Gaming service is operational
   */
  router.get('/health', async (req, res) => {
    try {
      res.json({
        success: true,
        service: 'gaming',
        port: 11436,
        status: 'operational'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createGamingRoutes;
