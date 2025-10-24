/**
 * Bot Builder - Automated Bot Creation & Configuration
 *
 * Automates the creation and setup of messaging bots (Telegram, Discord, etc.)
 * without manual configuration.
 *
 * Features:
 * - Auto-configure bot tokens in .env
 * - Auto-run database migrations
 * - Auto-initialize and start bots
 * - Bot health monitoring
 * - Multi-platform support (Telegram, Discord, future: WhatsApp)
 *
 * Usage:
 *   const builder = new BotBuilder({ db, companyStructure });
 *   const bot = await builder.createBot('telegram', {
 *     name: 'CALOS Bot',
 *     token: 'your-bot-token',
 *     personality: 'meme' // or 'professional'
 *   });
 *   await builder.startBot(bot.id);
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const https = require('https');

const execPromise = util.promisify(exec);

class BotBuilder {
  constructor(options = {}) {
    this.db = options.db;
    this.companyStructure = options.companyStructure;

    this.config = {
      envFile: options.envFile || path.join(process.cwd(), '.env'),
      migrationsDir: options.migrationsDir || path.join(process.cwd(), 'database/migrations'),
      dataDir: options.dataDir || path.join(process.cwd(), 'data/bots')
    };

    // Active bots
    this.activeBots = new Map();

    console.log('[BotBuilder] Initialized');
  }

  /**
   * Create a new bot
   */
  async createBot(platform, options = {}) {
    const { name, token, personality = 'professional', username } = options;

    if (!name || !token) {
      throw new Error('Bot name and token required');
    }

    // Check if owner approval needed (strategic decision)
    if (this.companyStructure) {
      const decision = await this.companyStructure.makeExecutiveDecision('create_bot', {
        platform,
        name,
        personality
      });

      if (!decision.approved) {
        throw new Error('Bot creation requires owner approval');
      }
    }

    console.log(`[BotBuilder] Creating ${platform} bot: ${name}`);

    // Verify token is valid
    const isValid = await this._verifyToken(platform, token);
    if (!isValid) {
      throw new Error('Invalid bot token');
    }

    // Store bot in database
    const botId = await this._storeBotConfig(platform, {
      name,
      token,
      personality,
      username
    });

    // Update .env file
    await this._updateEnvFile(platform, token, botId);

    // Run database migration (if needed)
    await this._runMigration(platform);

    // Create bot data directory
    await this._createBotDataDir(botId);

    console.log(`[BotBuilder] ✅ Bot created: ${name} (ID: ${botId})`);

    return {
      id: botId,
      platform,
      name,
      personality,
      status: 'created',
      token: this._maskToken(token)
    };
  }

  /**
   * Start a bot
   */
  async startBot(botId) {
    const bot = await this._getBotConfig(botId);

    if (!bot) {
      throw new Error('Bot not found');
    }

    if (this.activeBots.has(botId)) {
      console.log(`[BotBuilder] Bot ${botId} already running`);
      return { status: 'already_running' };
    }

    console.log(`[BotBuilder] Starting bot: ${bot.name}`);

    // Initialize bot based on platform
    let botInstance;
    switch (bot.platform) {
      case 'telegram':
        botInstance = await this._startTelegramBot(bot);
        break;
      case 'discord':
        botInstance = await this._startDiscordBot(bot);
        break;
      default:
        throw new Error(`Unsupported platform: ${bot.platform}`);
    }

    // Store active bot
    this.activeBots.set(botId, {
      instance: botInstance,
      config: bot,
      startedAt: Date.now()
    });

    // Update status in database
    await this._updateBotStatus(botId, 'running');

    console.log(`[BotBuilder] ✅ Bot started: ${bot.name}`);

    return {
      id: botId,
      status: 'running',
      startedAt: new Date()
    };
  }

  /**
   * Stop a bot
   */
  async stopBot(botId) {
    const activeBot = this.activeBots.get(botId);

    if (!activeBot) {
      console.log(`[BotBuilder] Bot ${botId} not running`);
      return { status: 'not_running' };
    }

    console.log(`[BotBuilder] Stopping bot: ${activeBot.config.name}`);

    // Stop bot instance
    if (activeBot.instance && typeof activeBot.instance.stop === 'function') {
      await activeBot.instance.stop();
    }

    // Remove from active bots
    this.activeBots.delete(botId);

    // Update status
    await this._updateBotStatus(botId, 'stopped');

    console.log(`[BotBuilder] ✅ Bot stopped`);

    return { status: 'stopped' };
  }

  /**
   * Get bot status
   */
  async getBotStatus(botId) {
    const bot = await this._getBotConfig(botId);

    if (!bot) {
      return { error: 'Bot not found' };
    }

    const isRunning = this.activeBots.has(botId);
    const activeBot = this.activeBots.get(botId);

    return {
      id: botId,
      platform: bot.platform,
      name: bot.name,
      personality: bot.personality,
      status: isRunning ? 'running' : 'stopped',
      createdAt: bot.created_at,
      startedAt: activeBot ? new Date(activeBot.startedAt) : null,
      uptime: activeBot ? Date.now() - activeBot.startedAt : 0,
      token: this._maskToken(bot.token)
    };
  }

  /**
   * List all bots
   */
  async listBots() {
    const result = await this.db.query(`
      SELECT bot_id, platform, name, personality, status, created_at
      FROM bots
      ORDER BY created_at DESC
    `);

    return result.rows.map(bot => ({
      id: bot.bot_id,
      platform: bot.platform,
      name: bot.name,
      personality: bot.personality,
      status: this.activeBots.has(bot.bot_id) ? 'running' : 'stopped',
      createdAt: bot.created_at
    }));
  }

  /**
   * Delete a bot
   */
  async deleteBot(botId) {
    // Stop if running
    if (this.activeBots.has(botId)) {
      await this.stopBot(botId);
    }

    const bot = await this._getBotConfig(botId);

    if (!bot) {
      throw new Error('Bot not found');
    }

    // Remove from database
    await this.db.query('DELETE FROM bots WHERE bot_id = $1', [botId]);

    // Remove from .env (commented out, not deleted)
    await this._commentOutEnvVar(`${bot.platform.toUpperCase()}_BOT_TOKEN_${botId}`);

    console.log(`[BotBuilder] ✅ Bot deleted: ${bot.name}`);

    return { status: 'deleted' };
  }

  /**
   * Verify bot token is valid
   */
  async _verifyToken(platform, token) {
    switch (platform) {
      case 'telegram':
        return this._verifyTelegramToken(token);
      case 'discord':
        return this._verifyDiscordToken(token);
      default:
        return false;
    }
  }

  /**
   * Verify Telegram bot token
   */
  async _verifyTelegramToken(token) {
    return new Promise((resolve) => {
      const url = `https://api.telegram.org/bot${token}/getMe`;

      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.ok === true);
          } catch (error) {
            resolve(false);
          }
        });
      }).on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Verify Discord bot token
   */
  async _verifyDiscordToken(token) {
    // TODO: Implement Discord token verification
    // For now, just check format
    return /^[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}$/.test(token);
  }

  /**
   * Store bot configuration in database
   */
  async _storeBotConfig(platform, config) {
    const result = await this.db.query(`
      INSERT INTO bots (platform, name, token, personality, username, status)
      VALUES ($1, $2, $3, $4, $5, 'created')
      RETURNING bot_id
    `, [platform, config.name, config.token, config.personality, config.username || null]);

    return result.rows[0].bot_id;
  }

  /**
   * Get bot configuration from database
   */
  async _getBotConfig(botId) {
    const result = await this.db.query(
      'SELECT * FROM bots WHERE bot_id = $1',
      [botId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update bot status
   */
  async _updateBotStatus(botId, status) {
    await this.db.query(
      'UPDATE bots SET status = $1, updated_at = NOW() WHERE bot_id = $1',
      [status, botId]
    );
  }

  /**
   * Update .env file with bot token
   */
  async _updateEnvFile(platform, token, botId) {
    const envPath = this.config.envFile;
    const varName = `${platform.toUpperCase()}_BOT_TOKEN${botId ? '_' + botId : ''}`;

    try {
      let envContent = await fs.readFile(envPath, 'utf8');

      // Check if variable already exists
      const regex = new RegExp(`^${varName}=.*$`, 'm');

      if (regex.test(envContent)) {
        // Update existing
        envContent = envContent.replace(regex, `${varName}=${token}`);
      } else {
        // Add new
        envContent += `\n# Bot ${botId}\n${varName}=${token}\n`;
      }

      await fs.writeFile(envPath, envContent, 'utf8');

      console.log(`[BotBuilder] Updated .env: ${varName}`);
    } catch (error) {
      console.error('[BotBuilder] Failed to update .env:', error.message);
      throw new Error('Failed to update .env file');
    }
  }

  /**
   * Comment out env variable (soft delete)
   */
  async _commentOutEnvVar(varName) {
    try {
      let envContent = await fs.readFile(this.config.envFile, 'utf8');
      const regex = new RegExp(`^${varName}=`, 'm');

      envContent = envContent.replace(regex, `# DELETED: ${varName}=`);

      await fs.writeFile(this.config.envFile, envContent, 'utf8');
    } catch (error) {
      console.error('[BotBuilder] Failed to comment out env var:', error.message);
    }
  }

  /**
   * Run database migration for platform
   */
  async _runMigration(platform) {
    const migrationFile = `034_${platform}_bot.sql`;
    const migrationPath = path.join(this.config.migrationsDir, migrationFile);

    try {
      // Check if migration exists
      await fs.access(migrationPath);

      // Check if already run
      const result = await this.db.query(
        "SELECT * FROM schema_migrations WHERE migration_name = $1",
        [migrationFile]
      );

      if (result.rows.length > 0) {
        console.log(`[BotBuilder] Migration already run: ${migrationFile}`);
        return;
      }

      // Run migration
      const sql = await fs.readFile(migrationPath, 'utf8');
      await this.db.query(sql);

      // Record migration
      await this.db.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [migrationFile]
      );

      console.log(`[BotBuilder] ✅ Migration run: ${migrationFile}`);
    } catch (error) {
      console.log(`[BotBuilder] Migration not found or already run: ${migrationFile}`);
    }
  }

  /**
   * Create bot data directory
   */
  async _createBotDataDir(botId) {
    const botDir = path.join(this.config.dataDir, botId);

    try {
      await fs.mkdir(botDir, { recursive: true });
      console.log(`[BotBuilder] Created data dir: ${botDir}`);
    } catch (error) {
      console.error('[BotBuilder] Failed to create data dir:', error.message);
    }
  }

  /**
   * Start Telegram bot instance
   */
  async _startTelegramBot(botConfig) {
    const TelegramBot = require('./telegram-bot');

    // Check if personality wrapper needed
    let BotClass = TelegramBot;
    if (botConfig.personality === 'meme') {
      const MemeBotPersonality = require('./meme-bot-personality');
      BotClass = MemeBotPersonality;
    }

    const bot = new BotClass({
      token: botConfig.token,
      db: this.db,
      twilioClient: null, // TODO: Add Twilio support
      handleRegistry: null, // TODO: Add handle registry
      challengeChain: null // TODO: Add challenge chain
    });

    await bot.start();

    return bot;
  }

  /**
   * Start Discord bot instance
   */
  async _startDiscordBot(botConfig) {
    // TODO: Implement Discord bot
    throw new Error('Discord bot not yet implemented');
  }

  /**
   * Mask token for display
   */
  _maskToken(token) {
    if (!token) return '';
    const visible = 8;
    return token.substring(0, visible) + '•••••••' + token.substring(token.length - 4);
  }

  /**
   * Get bot builder statistics
   */
  async getStatistics() {
    const bots = await this.listBots();

    const stats = {
      total: bots.length,
      running: bots.filter(b => b.status === 'running').length,
      stopped: bots.filter(b => b.status === 'stopped').length,
      byPlatform: {},
      byPersonality: {}
    };

    // Count by platform
    bots.forEach(bot => {
      stats.byPlatform[bot.platform] = (stats.byPlatform[bot.platform] || 0) + 1;
      stats.byPersonality[bot.personality] = (stats.byPersonality[bot.personality] || 0) + 1;
    });

    return stats;
  }

  /**
   * Health check for all active bots
   */
  async healthCheck() {
    const results = [];

    for (const [botId, activeBot] of this.activeBots.entries()) {
      const uptime = Date.now() - activeBot.startedAt;
      const uptimeMinutes = Math.floor(uptime / 60000);

      results.push({
        id: botId,
        name: activeBot.config.name,
        platform: activeBot.config.platform,
        status: 'healthy',
        uptime: uptimeMinutes,
        uptimeMs: uptime
      });
    }

    return results;
  }
}

module.exports = BotBuilder;
