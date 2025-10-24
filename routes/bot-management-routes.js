/**
 * Bot Management API Routes
 *
 * RESTful API for managing bots (Telegram, Discord, etc.)
 *
 * Routes:
 * - POST /api/bots/create - Create new bot
 * - GET /api/bots - List all bots
 * - GET /api/bots/:id - Get bot details
 * - POST /api/bots/:id/start - Start bot
 * - POST /api/bots/:id/stop - Stop bot
 * - DELETE /api/bots/:id - Delete bot
 * - GET /api/bots/:id/stats - Get bot statistics
 * - GET /api/bots/:id/events - Get bot events
 * - GET /api/bots/statistics - Global bot statistics
 */

const express = require('express');
const router = express.Router();

module.exports = (botBuilder) => {
  /**
   * POST /api/bots/create
   * Create a new bot
   */
  router.post('/create', async (req, res) => {
    try {
      const { platform, name, token, personality, username } = req.body;

      if (!platform || !name || !token) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: platform, name, token'
        });
      }

      const bot = await botBuilder.createBot(platform, {
        name,
        token,
        personality: personality || 'professional',
        username
      });

      res.json({
        success: true,
        bot
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Create error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots
   * List all bots
   */
  router.get('/', async (req, res) => {
    try {
      const bots = await botBuilder.listBots();

      res.json({
        success: true,
        bots,
        count: bots.length
      });
    } catch (error) {
      console.error('[BotManagementRoutes] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/:id
   * Get bot details
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const status = await botBuilder.getBotStatus(id);

      if (status.error) {
        return res.status(404).json({
          success: false,
          error: status.error
        });
      }

      res.json({
        success: true,
        bot: status
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Get bot error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/bots/:id/start
   * Start a bot
   */
  router.post('/:id/start', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await botBuilder.startBot(id);

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Start error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/bots/:id/stop
   * Stop a bot
   */
  router.post('/:id/stop', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await botBuilder.stopBot(id);

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Stop error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/bots/:id
   * Delete a bot
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await botBuilder.deleteBot(id);

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/:id/stats
   * Get bot statistics
   */
  router.get('/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await botBuilder.db.query(`
        SELECT
          bs.*,
          b.name,
          b.platform,
          b.personality,
          b.status
        FROM bot_statistics bs
        JOIN bots b ON b.bot_id = bs.bot_id
        WHERE bs.bot_id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Bot not found'
        });
      }

      const stats = result.rows[0];

      res.json({
        success: true,
        stats: {
          messagesSent: parseInt(stats.messages_sent),
          messagesReceived: parseInt(stats.messages_received),
          commandsExecuted: parseInt(stats.commands_executed),
          usersServed: parseInt(stats.users_served),
          uptimeSeconds: parseInt(stats.uptime_seconds),
          uptimeHours: Math.floor(parseInt(stats.uptime_seconds) / 3600),
          restarts: stats.restarts,
          errorsCount: stats.errors_count,
          statsResetAt: stats.stats_reset_at
        }
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Get stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/:id/events
   * Get bot events
   */
  router.get('/:id/events', async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const eventType = req.query.type;

      let query = `
        SELECT
          event_id,
          event_type,
          message,
          event_data,
          created_at
        FROM bot_events
        WHERE bot_id = $1
      `;

      const params = [id];

      if (eventType) {
        query += ' AND event_type = $2';
        params.push(eventType);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await botBuilder.db.query(query, params);

      res.json({
        success: true,
        events: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Get events error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/:id/commands
   * Get bot commands log
   */
  router.get('/:id/commands', async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const result = await botBuilder.db.query(`
        SELECT
          command_id,
          command_name,
          platform_user_id,
          status,
          error_message,
          execution_time_ms,
          executed_at
        FROM bot_commands_log
        WHERE bot_id = $1
        ORDER BY executed_at DESC
        LIMIT $2
      `, [id, limit]);

      res.json({
        success: true,
        commands: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Get commands error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/statistics
   * Global bot statistics
   */
  router.get('/statistics/global', async (req, res) => {
    try {
      const stats = await botBuilder.getStatistics();

      // Get active bots health
      const health = await botBuilder.healthCheck();

      res.json({
        success: true,
        statistics: {
          ...stats,
          activeBots: health
        }
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Get global stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/bots/:id/verify-token
   * Verify bot token is valid
   */
  router.post('/:id/verify-token', async (req, res) => {
    try {
      const { id } = req.params;

      const bot = await botBuilder._getBotConfig(id);

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'Bot not found'
        });
      }

      const isValid = await botBuilder._verifyToken(bot.platform, bot.token);

      res.json({
        success: true,
        valid: isValid
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Verify token error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/bots/health
   * Health check for all bots
   */
  router.get('/health/all', async (req, res) => {
    try {
      const health = await botBuilder.healthCheck();

      res.json({
        success: true,
        health,
        count: health.length
      });
    } catch (error) {
      console.error('[BotManagementRoutes] Health check error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};
