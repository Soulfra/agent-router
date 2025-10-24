/**
 * Culture Pack Manager
 *
 * Loads and manages culture packs for card games (like CAH expansion packs).
 * Handles rotating packs, mixing multiple packs, and tracking pack stats.
 *
 * Philosophy:
 * Cards Against Humanity but the packs rotate with culture.
 * Gen Z slang today, 2000s nostalgia tomorrow, anime weeb next week.
 *
 * Features:
 * - Load packs from JSON files
 * - Mix multiple packs together
 * - Track which packs are popular
 * - Weekly/daily pack rotations
 * - Generate decks from pack combinations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CulturePackManager {
  constructor(options = {}) {
    this.packDir = options.packDir || path.join(__dirname, '../data/culture-packs');
    this.db = options.db;

    // Loaded packs (packId -> pack data)
    this.packs = new Map();

    // Active rotation (changes weekly/daily)
    this.activeRotation = null;
    this.rotationChangedAt = null;
    this.rotationInterval = options.rotationInterval || 7 * 24 * 60 * 60 * 1000; // 7 days

    console.log('[CulturePackManager] Initialized');
  }

  /**
   * Load all available packs from disk
   */
  async loadPacks() {
    try {
      const files = await fs.readdir(this.packDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      console.log(`[CulturePackManager] Loading ${jsonFiles.length} packs...`);

      for (const file of jsonFiles) {
        const packPath = path.join(this.packDir, file);
        const packData = JSON.parse(await fs.readFile(packPath, 'utf8'));

        this.packs.set(packData.packId, packData);
        console.log(`  ✓ Loaded: ${packData.name} (${packData.responses.length} responses, ${packData.prompts.length} prompts)`);
      }

      console.log(`[CulturePackManager] Loaded ${this.packs.size} culture packs`);

      // Set initial rotation
      this.updateRotation();

      return {
        success: true,
        packsLoaded: this.packs.size
      };

    } catch (error) {
      console.error('[CulturePackManager] Error loading packs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all available packs
   */
  getAvailablePacks() {
    return Array.from(this.packs.values()).map(pack => ({
      packId: pack.packId,
      name: pack.name,
      description: pack.description,
      emoji: pack.emoji,
      controversial: pack.controversial,
      tags: pack.tags,
      cardCount: pack.prompts.length + pack.responses.length
    }));
  }

  /**
   * Get current active rotation
   */
  getActiveRotation() {
    // Check if rotation needs update
    if (!this.activeRotation || Date.now() - this.rotationChangedAt > this.rotationInterval) {
      this.updateRotation();
    }

    return this.activeRotation;
  }

  /**
   * Update rotation (pick new packs)
   */
  updateRotation() {
    const allPacks = Array.from(this.packs.keys());

    if (allPacks.length === 0) {
      console.warn('[CulturePackManager] No packs loaded');
      return;
    }

    // Pick 2-3 random packs for rotation
    const numPacks = Math.min(3, Math.max(2, allPacks.length));
    const shuffled = allPacks.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numPacks);

    this.activeRotation = selected;
    this.rotationChangedAt = Date.now();

    console.log(`[CulturePackManager] New rotation: ${selected.join(', ')}`);
  }

  /**
   * Generate deck from pack IDs
   * @param {string[]} packIds - Pack IDs to include (defaults to active rotation)
   * @param {object} options - Generation options
   * @returns {Array} Deck cards
   */
  generateDeck(packIds = null, options = {}) {
    // Use active rotation if no packs specified
    const selectedPacks = packIds || this.getActiveRotation();

    if (!selectedPacks || selectedPacks.length === 0) {
      console.warn('[CulturePackManager] No packs selected');
      return [];
    }

    const deck = [];
    const {
      promptCopies = 2,    // How many copies of each prompt
      responseCopies = 5,  // How many copies of each response
      maxPrompts = 30,     // Max prompts in deck
      maxResponses = 100   // Max responses in deck
    } = options;

    // Collect all prompts and responses from selected packs
    const allPrompts = [];
    const allResponses = [];

    for (const packId of selectedPacks) {
      const pack = this.packs.get(packId);
      if (!pack) {
        console.warn(`[CulturePackManager] Pack not found: ${packId}`);
        continue;
      }

      // Add prompts
      for (const promptText of pack.prompts) {
        allPrompts.push({
          type: 'prompt',
          text: promptText,
          packId: pack.packId,
          packName: pack.name,
          packEmoji: pack.emoji,
          editable: true,
          id: crypto.randomUUID()
        });
      }

      // Add responses
      for (const responseText of pack.responses) {
        allResponses.push({
          type: 'response',
          text: responseText,
          packId: pack.packId,
          packName: pack.name,
          packEmoji: pack.emoji,
          editable: true,
          id: crypto.randomUUID()
        });
      }
    }

    // Shuffle
    allPrompts.sort(() => Math.random() - 0.5);
    allResponses.sort(() => Math.random() - 0.5);

    // Add prompts (with copies)
    const promptsToAdd = Math.min(maxPrompts, allPrompts.length);
    for (let i = 0; i < promptsToAdd; i++) {
      for (let copy = 0; copy < promptCopies; copy++) {
        deck.push({ ...allPrompts[i], id: crypto.randomUUID() });
      }
    }

    // Add responses (with copies)
    const responsesToAdd = Math.min(maxResponses, allResponses.length);
    for (let i = 0; i < responsesToAdd; i++) {
      for (let copy = 0; copy < responseCopies; copy++) {
        deck.push({ ...allResponses[i], id: crypto.randomUUID() });
      }
    }

    console.log(`[CulturePackManager] Generated deck: ${deck.length} cards from ${selectedPacks.length} packs`);

    return deck;
  }

  /**
   * Get pack by ID
   */
  getPack(packId) {
    return this.packs.get(packId);
  }

  /**
   * Track pack usage (for analytics)
   */
  async trackPackUsage(packIds, gameId) {
    if (!this.db) return;

    try {
      for (const packId of packIds) {
        await this.db.query(`
          INSERT INTO culture_pack_usage (pack_id, game_id, used_at)
          VALUES ($1, $2, NOW())
        `, [packId, gameId]);
      }
    } catch (error) {
      console.error('[CulturePackManager] Error tracking usage:', error.message);
    }
  }

  /**
   * Get pack stats
   */
  async getPackStats() {
    if (!this.db) {
      return {
        totalPacks: this.packs.size,
        activeRotation: this.activeRotation,
        rotationChangesIn: this.rotationInterval - (Date.now() - this.rotationChangedAt)
      };
    }

    try {
      const result = await this.db.query(`
        SELECT
          pack_id,
          COUNT(*) as usage_count,
          MAX(used_at) as last_used
        FROM culture_pack_usage
        WHERE used_at > NOW() - INTERVAL '30 days'
        GROUP BY pack_id
        ORDER BY usage_count DESC
      `);

      return {
        totalPacks: this.packs.size,
        activeRotation: this.activeRotation,
        rotationChangesIn: this.rotationInterval - (Date.now() - this.rotationChangedAt),
        popularPacks: result.rows
      };
    } catch (error) {
      console.error('[CulturePackManager] Error getting stats:', error.message);
      return null;
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      packsLoaded: this.packs.size,
      activeRotation: this.activeRotation,
      rotationAge: Date.now() - this.rotationChangedAt,
      rotationInterval: this.rotationInterval
    };
  }
}

module.exports = CulturePackManager;
