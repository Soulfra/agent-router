/**
 * CardCollectionManager
 *
 * Pokemon/MTG-style collectible system for culture pack cards.
 *
 * Features:
 * - Track card ownership per user
 * - Rarity-based drop rates (mythic = ultra-rare)
 * - Achievement badges for collecting sets
 * - Trading/gifting cards
 * - Print-on-demand export (PNG/PDF)
 * - Collection stats and leaderboards
 *
 * Rarity Tiers:
 * - Common:    60% drop rate (white ⚪)
 * - Rare:      25% drop rate (blue 🔵)
 * - Epic:      10% drop rate (purple 🟣)
 * - Legendary: 4% drop rate (orange 🟠)
 * - Mythic:    1% drop rate (red 🔴)
 *
 * Usage:
 *   const manager = new CardCollectionManager({ db });
 *   await manager.awardCard(userId, card);
 *   const collection = await manager.getCollection(userId);
 */

const crypto = require('crypto');

class CardCollectionManager {
  constructor(options = {}) {
    this.db = options.db;
    this.culturePackManager = options.culturePackManager;

    // Rarity drop rates (%)
    this.dropRates = {
      common: 60,
      rare: 25,
      epic: 10,
      legendary: 4,
      mythic: 1
    };

    // Rarity emojis
    this.rarityEmojis = {
      common: '⚪',
      rare: '🔵',
      epic: '🟣',
      legendary: '🟠',
      mythic: '🔴'
    };

    // Achievement badges
    this.achievements = {
      'first-card': { name: 'First Card', emoji: '🎴', requirement: 1 },
      'collector': { name: 'Collector', emoji: '📚', requirement: 10 },
      'hoarder': { name: 'Hoarder', emoji: '🏆', requirement: 50 },
      'completionist': { name: 'Completionist', emoji: '💎', requirement: 100 },
      'mythic-hunter': { name: 'Mythic Hunter', emoji: '🔴', requirement: 'mythic' },
      'pack-complete-2000s': { name: '2000s Master', emoji: '☕', requirement: 'pack-complete-2000s-engineering' },
      'pack-complete-2010s': { name: '2010s Master', emoji: '🚀', requirement: 'pack-complete-2010s-engineering' },
      'pack-complete-2020s': { name: '2020s Master', emoji: '☸️', requirement: 'pack-complete-2020s-engineering' },
      'anti-pattern-master': { name: 'Anti-Pattern Master', emoji: '🤡', requirement: 'pack-complete-anti-patterns' }
    };
  }

  /**
   * Award a card to a user (pack opening, quest reward, etc.)
   * @param {string} userId - User ID
   * @param {object} card - Card data
   * @returns {Promise<object>} - Award result
   */
  async awardCard(userId, card) {
    if (!this.db) throw new Error('Database required');

    const cardId = this.generateCardId(card);

    // Check if user already has this card
    const existingCard = await this.db.query(
      'SELECT * FROM card_collection WHERE user_id = $1 AND card_id = $2',
      [userId, cardId]
    );

    if (existingCard.rows.length > 0) {
      // Duplicate - increment count
      await this.db.query(
        'UPDATE card_collection SET count = count + 1, last_awarded = NOW() WHERE user_id = $1 AND card_id = $2',
        [userId, cardId]
      );

      return {
        cardId,
        duplicate: true,
        count: existingCard.rows[0].count + 1
      };
    }

    // New card - add to collection
    await this.db.query(
      `INSERT INTO card_collection (user_id, card_id, pack_id, rarity, prompt, response, metadata, count, first_awarded, last_awarded)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())`,
      [userId, cardId, card.packId, card.rarity, card.prompt, card.response, JSON.stringify(card.metadata || {})]
    );

    // Check for achievements
    const achievements = await this.checkAchievements(userId);

    return {
      cardId,
      duplicate: false,
      count: 1,
      newAchievements: achievements
    };
  }

  /**
   * Open a card pack (random cards based on rarity)
   * @param {string} userId - User ID
   * @param {string} packId - Pack to open
   * @param {number} cardCount - Cards per pack (default 5)
   * @returns {Promise<Array>} - Cards awarded
   */
  async openPack(userId, packId, cardCount = 5) {
    if (!this.culturePackManager) {
      throw new Error('CulturePackManager required');
    }

    const pack = this.culturePackManager.getPack(packId);
    if (!pack) throw new Error(`Pack not found: ${packId}`);

    const cards = [];

    for (let i = 0; i < cardCount; i++) {
      // Determine rarity based on drop rates
      const rarity = this.rollRarity();

      // Pick random card from pack with matching rarity
      const card = this.pickRandomCard(pack, rarity);

      // Award card
      const result = await this.awardCard(userId, {
        ...card,
        packId,
        rarity: card.rarity || rarity
      });

      cards.push({
        ...card,
        ...result
      });
    }

    return cards;
  }

  /**
   * Roll for card rarity based on drop rates
   * @returns {string} - Rarity tier
   */
  rollRarity() {
    const roll = Math.random() * 100;
    let cumulative = 0;

    // Check in order: mythic → legendary → epic → rare → common
    const tiers = ['mythic', 'legendary', 'epic', 'rare', 'common'];

    for (const tier of tiers) {
      cumulative += this.dropRates[tier];
      if (roll < cumulative) {
        return tier;
      }
    }

    return 'common'; // Fallback
  }

  /**
   * Pick a random card from a pack (matching rarity if possible)
   * @param {object} pack - Culture pack
   * @param {string} preferredRarity - Preferred rarity
   * @returns {object} - Card data
   */
  pickRandomCard(pack, preferredRarity) {
    const prompt = pack.prompts[Math.floor(Math.random() * pack.prompts.length)];
    const response = pack.responses[Math.floor(Math.random() * pack.responses.length)];

    return {
      prompt,
      response,
      rarity: pack.rarity || preferredRarity,
      packId: pack.packId,
      metadata: {
        packName: pack.name,
        emoji: pack.emoji,
        tags: pack.tags
      }
    };
  }

  /**
   * Generate unique card ID
   * @param {object} card - Card data
   * @returns {string} - Card ID
   */
  generateCardId(card) {
    const hash = crypto.createHash('sha256');
    hash.update(`${card.packId}:${card.prompt}:${card.response}`);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Get user's card collection
   * @param {string} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<object>} - Collection data
   */
  async getCollection(userId, options = {}) {
    if (!this.db) throw new Error('Database required');

    const {
      packId = null,
      rarity = null,
      sortBy = 'rarity', // 'rarity', 'acquired', 'count'
      limit = 100
    } = options;

    let query = 'SELECT * FROM card_collection WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (packId) {
      query += ` AND pack_id = $${paramIndex}`;
      params.push(packId);
      paramIndex++;
    }

    if (rarity) {
      query += ` AND rarity = $${paramIndex}`;
      params.push(rarity);
      paramIndex++;
    }

    // Sort
    if (sortBy === 'rarity') {
      query += ` ORDER BY
        CASE rarity
          WHEN 'mythic' THEN 1
          WHEN 'legendary' THEN 2
          WHEN 'epic' THEN 3
          WHEN 'rare' THEN 4
          WHEN 'common' THEN 5
        END`;
    } else if (sortBy === 'acquired') {
      query += ' ORDER BY first_awarded DESC';
    } else if (sortBy === 'count') {
      query += ' ORDER BY count DESC';
    }

    query += ` LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(query, params);

    return {
      cards: result.rows,
      total: result.rows.length,
      stats: await this.getCollectionStats(userId)
    };
  }

  /**
   * Get collection statistics
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Stats
   */
  async getCollectionStats(userId) {
    if (!this.db) throw new Error('Database required');

    const stats = await this.db.query(
      `SELECT
        COUNT(*) as total_cards,
        SUM(count) as total_owned,
        COUNT(CASE WHEN rarity = 'mythic' THEN 1 END) as mythic_count,
        COUNT(CASE WHEN rarity = 'legendary' THEN 1 END) as legendary_count,
        COUNT(CASE WHEN rarity = 'epic' THEN 1 END) as epic_count,
        COUNT(CASE WHEN rarity = 'rare' THEN 1 END) as rare_count,
        COUNT(CASE WHEN rarity = 'common' THEN 1 END) as common_count,
        COUNT(DISTINCT pack_id) as packs_collected
      FROM card_collection
      WHERE user_id = $1`,
      [userId]
    );

    return stats.rows[0];
  }

  /**
   * Check for new achievements
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Newly unlocked achievements
   */
  async checkAchievements(userId) {
    const stats = await this.getCollectionStats(userId);
    const newAchievements = [];

    // Check total card count achievements
    for (const [achievementId, achievement] of Object.entries(this.achievements)) {
      if (typeof achievement.requirement === 'number') {
        if (parseInt(stats.total_cards) >= achievement.requirement) {
          const unlocked = await this.unlockAchievement(userId, achievementId);
          if (unlocked) newAchievements.push(achievement);
        }
      }
    }

    // Check mythic achievement
    if (parseInt(stats.mythic_count) > 0) {
      const unlocked = await this.unlockAchievement(userId, 'mythic-hunter');
      if (unlocked) newAchievements.push(this.achievements['mythic-hunter']);
    }

    // Check pack completion achievements
    const packCompletions = await this.checkPackCompletions(userId);
    for (const packId of packCompletions) {
      const achievementId = `pack-complete-${packId}`;
      if (this.achievements[achievementId]) {
        const unlocked = await this.unlockAchievement(userId, achievementId);
        if (unlocked) newAchievements.push(this.achievements[achievementId]);
      }
    }

    return newAchievements;
  }

  /**
   * Check which packs user has completed
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Completed pack IDs
   */
  async checkPackCompletions(userId) {
    if (!this.db || !this.culturePackManager) return [];

    const completions = [];

    for (const [packId, pack] of this.culturePackManager.packs.entries()) {
      const userCards = await this.db.query(
        'SELECT DISTINCT prompt, response FROM card_collection WHERE user_id = $1 AND pack_id = $2',
        [userId, packId]
      );

      // Check if user has all unique cards from this pack
      const totalCards = pack.prompts.length * pack.responses.length;
      if (userCards.rows.length >= totalCards) {
        completions.push(packId);
      }
    }

    return completions;
  }

  /**
   * Unlock an achievement for a user
   * @param {string} userId - User ID
   * @param {string} achievementId - Achievement ID
   * @returns {Promise<boolean>} - True if newly unlocked
   */
  async unlockAchievement(userId, achievementId) {
    if (!this.db) return false;

    const existing = await this.db.query(
      'SELECT * FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
      [userId, achievementId]
    );

    if (existing.rows.length > 0) return false; // Already unlocked

    await this.db.query(
      'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES ($1, $2, NOW())',
      [userId, achievementId]
    );

    return true;
  }

  /**
   * Get user's achievements
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Achievements
   */
  async getAchievements(userId) {
    if (!this.db) return [];

    const result = await this.db.query(
      'SELECT * FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC',
      [userId]
    );

    return result.rows.map(row => ({
      ...this.achievements[row.achievement_id],
      achievementId: row.achievement_id,
      unlockedAt: row.unlocked_at
    }));
  }

  /**
   * Get collection leaderboard
   * @param {number} limit - Top N users
   * @returns {Promise<Array>} - Leaderboard
   */
  async getLeaderboard(limit = 10) {
    if (!this.db) return [];

    const result = await this.db.query(
      `SELECT
        user_id,
        COUNT(*) as total_cards,
        SUM(count) as total_owned,
        COUNT(CASE WHEN rarity = 'mythic' THEN 1 END) as mythic_count,
        COUNT(DISTINCT pack_id) as packs_collected
      FROM card_collection
      GROUP BY user_id
      ORDER BY total_cards DESC, mythic_count DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }
}

module.exports = CardCollectionManager;
