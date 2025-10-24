/**
 * AI Bot Pool Manager
 *
 * Manages pool of AI bots that blend in with real users in group sessions.
 * Like chess.com bots - users play with them but they feel real.
 *
 * Features:
 * - Spawn AI bots per group
 * - Realistic bot usernames (not obvious they're bots)
 * - Different personalities (friendly, roast, meme, serious)
 * - Bot-to-user ratio balancing
 * - Bot lifecycle management (join, leave, go AWOL)
 *
 * Philosophy:
 * Bots should make groups feel busy and engaging, not empty.
 * Subtle indicators show they're bots, but they act human.
 */

const crypto = require('crypto');

class AIBotPoolManager {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaClient = options.ollamaClient;

    this.config = {
      // Bot-to-user ratio
      minBotsPerGroup: options.minBotsPerGroup || 2,
      maxBotsPerGroup: options.maxBotsPerGroup || 5,
      botToUserRatio: options.botToUserRatio || 0.3, // 30% bots, 70% humans

      // Bot personalities (from meme-bot-personality.js)
      personalities: [
        'friendly',    // Nice, helpful
        'meme',        // Jokes, memes, casual
        'roast',       // Sarcastic, roasts people
        'serious',     // Professional, straight
        'chaos'        // Random, unpredictable (goes AWOL often)
      ],

      // Bot username patterns (realistic, not obvious)
      usernamePatterns: [
        'CalBot_{num}',
        'Member_{num}',
        'User_{num}',
        '{adjective}_{noun}',
        '{noun}_fan',
        'pro_{noun}',
        '{adjective}_gamer'
      ],

      // Username word lists
      adjectives: [
        'cool', 'fast', 'smart', 'wild', 'epic', 'mega', 'super', 'ultra',
        'swift', 'fierce', 'brave', 'bold', 'quick', 'sharp', 'slick'
      ],

      nouns: [
        'player', 'gamer', 'king', 'legend', 'pro', 'master', 'ninja',
        'warrior', 'hawk', 'wolf', 'tiger', 'dragon', 'phoenix', 'storm'
      ],

      // Bot activity config
      minActivityDelay: 2000,   // 2 seconds (minimum delay before bot responds)
      maxActivityDelay: 8000,   // 8 seconds (maximum delay)
      awolChance: 0.15,          // 15% chance bot goes AWOL
      reactionChance: 0.4        // 40% chance bot reacts to post
    };

    // Active bots per group
    // groupId -> Set of bot IDs
    this.groupBots = new Map();

    // Bot registry
    // botId -> { botId, username, personality, groupId, status, createdAt }
    this.botRegistry = new Map();

    console.log('[AIBotPoolManager] Initialized');
  }

  /**
   * Spawn bots for a group based on current user count
   */
  async spawnBotsForGroup(groupId, currentUserCount) {
    try {
      // Calculate how many bots we need
      const targetBots = this._calculateTargetBots(currentUserCount);
      const currentBots = this.getGroupBots(groupId).length;

      const botsToSpawn = targetBots - currentBots;

      if (botsToSpawn <= 0) {
        console.log(`[AIBotPoolManager] Group ${groupId} has enough bots (${currentBots})`);
        return { success: true, botsSpawned: 0, currentBots };
      }

      const spawnedBots = [];

      for (let i = 0; i < botsToSpawn; i++) {
        const bot = await this.createBot(groupId);
        spawnedBots.push(bot);
      }

      console.log(`[AIBotPoolManager] Spawned ${botsToSpawn} bots for group ${groupId}`);

      return {
        success: true,
        botsSpawned: botsToSpawn,
        bots: spawnedBots,
        totalBots: currentBots + botsToSpawn
      };

    } catch (error) {
      console.error('[AIBotPoolManager] Error spawning bots:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a bot
   */
  async createBot(groupId, options = {}) {
    const botId = `bot-${crypto.randomUUID()}`;
    const username = options.username || this._generateBotUsername();
    const personality = options.personality || this._selectPersonality();

    const bot = {
      botId,
      username,
      personality,
      groupId,
      status: 'active', // active, idle, awol
      isBot: true,
      createdAt: Date.now(),
      metadata: {
        messagesPosted: 0,
        reactionsGiven: 0,
        awolCount: 0,
        lastActivityAt: Date.now()
      }
    };

    // Register bot
    this.botRegistry.set(botId, bot);

    // Add to group
    if (!this.groupBots.has(groupId)) {
      this.groupBots.set(groupId, new Set());
    }
    this.groupBots.get(groupId).add(botId);

    // Store in database (optional)
    if (this.db) {
      await this._storeBotInDB(bot);
    }

    console.log(`[AIBotPoolManager] Created bot: ${username} (${personality}) for group ${groupId}`);

    return bot;
  }

  /**
   * Remove bot from group
   */
  async removeBot(botId) {
    const bot = this.botRegistry.get(botId);
    if (!bot) return { success: false, error: 'Bot not found' };

    const { groupId } = bot;

    // Remove from group
    if (this.groupBots.has(groupId)) {
      this.groupBots.get(groupId).delete(botId);
    }

    // Remove from registry
    this.botRegistry.delete(botId);

    console.log(`[AIBotPoolManager] Removed bot: ${bot.username}`);

    return { success: true, bot };
  }

  /**
   * Get all bots for a group
   */
  getGroupBots(groupId) {
    if (!this.groupBots.has(groupId)) return [];

    const botIds = Array.from(this.groupBots.get(groupId));
    return botIds.map(id => this.botRegistry.get(id)).filter(Boolean);
  }

  /**
   * Get bot by ID
   */
  getBot(botId) {
    return this.botRegistry.get(botId);
  }

  /**
   * Update bot activity
   */
  updateBotActivity(botId, activity) {
    const bot = this.botRegistry.get(botId);
    if (!bot) return;

    bot.metadata.lastActivityAt = Date.now();

    if (activity.type === 'message') {
      bot.metadata.messagesPosted++;
    } else if (activity.type === 'reaction') {
      bot.metadata.reactionsGiven++;
    } else if (activity.type === 'awol') {
      bot.metadata.awolCount++;
      bot.status = 'awol';
    }

    console.log(`[AIBotPoolManager] Bot ${bot.username} activity: ${activity.type}`);
  }

  /**
   * Reset bot from AWOL
   */
  resetBotFromAWOL(botId) {
    const bot = this.botRegistry.get(botId);
    if (!bot) return;

    bot.status = 'active';
    bot.personality = this._selectPersonality();

    console.log(`[AIBotPoolManager] Bot ${bot.username} reset from AWOL, new personality: ${bot.personality}`);
  }

  /**
   * Should bot go AWOL?
   */
  shouldBotGoAWOL(botId, trigger) {
    const bot = this.botRegistry.get(botId);
    if (!bot) return false;

    // Chaos personality goes AWOL more often
    if (bot.personality === 'chaos') {
      return Math.random() < this.config.awolChance * 2;
    }

    // Check trigger keywords (from smart-notification-system.js)
    const awolTriggers = [
      'your code sucks',
      'you\'re stupid',
      'this is dumb',
      'this sucks',
      'terrible'
    ];

    if (trigger && awolTriggers.some(t => trigger.toLowerCase().includes(t))) {
      return true;
    }

    // Random chance
    return Math.random() < this.config.awolChance;
  }

  /**
   * Should bot react to message?
   */
  shouldBotReact(botId) {
    return Math.random() < this.config.reactionChance;
  }

  /**
   * Get bot response delay (realistic)
   */
  getBotResponseDelay() {
    return Math.floor(
      Math.random() * (this.config.maxActivityDelay - this.config.minActivityDelay) +
      this.config.minActivityDelay
    );
  }

  /**
   * Rebalance bots based on user count
   */
  async rebalanceGroupBots(groupId, currentUserCount) {
    const targetBots = this._calculateTargetBots(currentUserCount);
    const currentBots = this.getGroupBots(groupId);

    const diff = targetBots - currentBots.length;

    if (diff > 0) {
      // Spawn more bots
      return await this.spawnBotsForGroup(groupId, currentUserCount);
    } else if (diff < 0) {
      // Remove excess bots
      const botsToRemove = currentBots.slice(0, Math.abs(diff));
      for (const bot of botsToRemove) {
        await this.removeBot(bot.botId);
      }

      return {
        success: true,
        botsRemoved: Math.abs(diff),
        totalBots: currentBots.length - Math.abs(diff)
      };
    }

    return { success: true, botsChanged: 0, totalBots: currentBots.length };
  }

  /**
   * Get stats
   */
  getStats() {
    const totalBots = this.botRegistry.size;
    const activeGroups = this.groupBots.size;

    const personalityBreakdown = {};
    for (const bot of this.botRegistry.values()) {
      personalityBreakdown[bot.personality] = (personalityBreakdown[bot.personality] || 0) + 1;
    }

    return {
      totalBots,
      activeGroups,
      personalityBreakdown,
      averageBotsPerGroup: totalBots / activeGroups || 0
    };
  }

  /**
   * Calculate target bot count based on user count
   * @private
   */
  _calculateTargetBots(userCount) {
    if (userCount === 0) {
      return this.config.minBotsPerGroup;
    }

    const targetBots = Math.ceil(userCount * this.config.botToUserRatio);

    return Math.max(
      this.config.minBotsPerGroup,
      Math.min(this.config.maxBotsPerGroup, targetBots)
    );
  }

  /**
   * Generate realistic bot username
   * @private
   */
  _generateBotUsername() {
    const pattern = this.config.usernamePatterns[
      Math.floor(Math.random() * this.config.usernamePatterns.length)
    ];

    if (pattern.includes('{adjective}')) {
      const adj = this.config.adjectives[
        Math.floor(Math.random() * this.config.adjectives.length)
      ];
      const noun = this.config.nouns[
        Math.floor(Math.random() * this.config.nouns.length)
      ];

      return pattern
        .replace('{adjective}', adj)
        .replace('{noun}', noun);
    }

    if (pattern.includes('{noun}')) {
      const noun = this.config.nouns[
        Math.floor(Math.random() * this.config.nouns.length)
      ];

      return pattern.replace('{noun}', noun);
    }

    if (pattern.includes('{num}')) {
      const num = Math.floor(Math.random() * 1000);
      return pattern.replace('{num}', num);
    }

    return pattern;
  }

  /**
   * Select random personality
   * @private
   */
  _selectPersonality() {
    return this.config.personalities[
      Math.floor(Math.random() * this.config.personalities.length)
    ];
  }

  /**
   * Store bot in database
   * @private
   */
  async _storeBotInDB(bot) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO ai_bots (
          bot_id,
          username,
          personality,
          group_id,
          status,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (bot_id)
        DO UPDATE SET
          username = $2,
          personality = $3,
          status = $5,
          metadata = $6,
          updated_at = NOW()
      `, [
        bot.botId,
        bot.username,
        bot.personality,
        bot.groupId,
        bot.status,
        JSON.stringify(bot.metadata)
      ]);

    } catch (error) {
      console.warn('[AIBotPoolManager] Failed to store bot in DB:', error.message);
    }
  }
}

module.exports = AIBotPoolManager;
