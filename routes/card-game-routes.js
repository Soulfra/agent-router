/**
 * Card Game Routes
 *
 * RESTful API for multiplayer card games:
 * - UNO-style (Speed Mode)
 * - Cards Against Humanity (Judge Mode)
 * - Apples to Apples (Judge Mode)
 * - Settlers (Build Mode)
 * - Custom modes
 *
 * Philosophy:
 * Simple API for complex card games.
 * Players + AI bots play together seamlessly.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createCardGameRoutes({ db, cardGameEngine, wildcardManager, aiCardPlayer, botPool }) {
  if (!cardGameEngine) {
    throw new Error('CardGameEngine required for card game routes');
  }

  // ============================================================================
  // GAMES
  // ============================================================================

  /**
   * POST /api/card-games/create
   * Create a new card game
   *
   * Body:
   * {
   *   "groupId": "group-uuid",
   *   "createdBy": "user-uuid",
   *   "gameMode": "speed", // speed, judge, build, custom
   *   "deckId": "deck-uuid", // optional
   *   "customRules": { ... } // optional
   * }
   */
  router.post('/create', async (req, res) => {
    try {
      const { groupId, createdBy, gameMode, deckId, customRules } = req.body;

      if (!groupId || !createdBy || !gameMode) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: groupId, createdBy, gameMode'
        });
      }

      const result = await cardGameEngine.createGame({
        groupId,
        createdBy,
        gameMode,
        deckId,
        customRules
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error creating game:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/join
   * Join a card game
   *
   * Body:
   * {
   *   "playerId": "user-uuid",
   *   "playerType": "human", // human or bot
   *   "playerData": { "username": "Player1" }
   * }
   */
  router.post('/:gameId/join', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { playerId, playerType = 'human', playerData } = req.body;

      if (!playerId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: playerId'
        });
      }

      const result = await cardGameEngine.joinGame(
        gameId,
        playerId,
        playerType,
        playerData
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error joining game:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/start
   * Start a card game
   */
  router.post('/:gameId/start', async (req, res) => {
    try {
      const { gameId } = req.params;

      const result = await cardGameEngine.startGame(gameId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error starting game:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/play-card
   * Play a card
   *
   * Body:
   * {
   *   "playerId": "user-uuid",
   *   "cardIndex": 0,
   *   "options": { "color": "red" } // optional (for wild cards)
   * }
   */
  router.post('/:gameId/play-card', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { playerId, cardIndex, options } = req.body;

      if (!playerId || cardIndex === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: playerId, cardIndex'
        });
      }

      const result = await cardGameEngine.playCard(
        gameId,
        playerId,
        cardIndex,
        options || {}
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error playing card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/draw-card
   * Draw a card from deck
   *
   * Body:
   * {
   *   "playerId": "user-uuid"
   * }
   */
  router.post('/:gameId/draw-card', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: playerId'
        });
      }

      const result = await cardGameEngine.drawCard(gameId, playerId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error drawing card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/judge-pick
   * Judge picks winner (CAH mode)
   *
   * Body:
   * {
   *   "judgeId": "user-uuid",
   *   "winnerId": "user-uuid"
   * }
   */
  router.post('/:gameId/judge-pick', async (req, res) => {
    try {
      const { gameId } = req.params;
      const { judgeId, winnerId } = req.body;

      if (!judgeId || !winnerId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: judgeId, winnerId'
        });
      }

      const result = await cardGameEngine.judgePickWinner(
        gameId,
        judgeId,
        winnerId
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error judging:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/card-games/:gameId
   * Get game state
   */
  router.get('/:gameId', (req, res) => {
    try {
      const { gameId } = req.params;

      const game = cardGameEngine.getGame(gameId);

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      res.json({
        success: true,
        game
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting game:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/card-games/:gameId/stats
   * Get game stats
   */
  router.get('/:gameId/stats', (req, res) => {
    try {
      const { gameId } = req.params;

      const stats = cardGameEngine.getGameStats(gameId);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/card-games/active
   * Get all active games
   */
  router.get('/active', (req, res) => {
    try {
      const games = cardGameEngine.getActiveGames();

      res.json({
        success: true,
        games,
        count: games.length
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting active games:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CUSTOM CARDS & WILDCARDS
  // ============================================================================

  /**
   * POST /api/card-games/cards/edit
   * Edit an existing card
   *
   * Body:
   * {
   *   "cardId": "card-uuid",
   *   "editedBy": "user-uuid",
   *   "newData": {
   *     "text": "New card text",
   *     "effect": "wild",
   *     "color": "red"
   *   },
   *   "groupId": "group-uuid"
   * }
   */
  router.post('/cards/edit', async (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { cardId, editedBy, newData, groupId } = req.body;

      if (!cardId || !editedBy || !newData) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: cardId, editedBy, newData'
        });
      }

      const result = await wildcardManager.editCard(
        cardId,
        editedBy,
        newData,
        { groupId }
      );

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error editing card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/cards/create
   * Create custom card
   *
   * Body:
   * {
   *   "createdBy": "user-uuid",
   *   "cardData": {
   *     "type": "wild",
   *     "text": "My custom wild card",
   *     "effect": "wild"
   *   },
   *   "groupId": "group-uuid"
   * }
   */
  router.post('/cards/create', async (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { createdBy, cardData, groupId } = req.body;

      if (!createdBy || !cardData) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: createdBy, cardData'
        });
      }

      const result = await wildcardManager.createCustomCard(
        createdBy,
        cardData,
        { groupId }
      );

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error creating card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/cards/:cardId/approve
   * Approve custom card
   *
   * Body:
   * {
   *   "approvedBy": "user-uuid",
   *   "groupId": "group-uuid"
   * }
   */
  router.post('/cards/:cardId/approve', async (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { cardId } = req.params;
      const { approvedBy, groupId } = req.body;

      if (!approvedBy) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: approvedBy'
        });
      }

      const result = await wildcardManager.approveCard(
        cardId,
        approvedBy,
        groupId
      );

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error approving card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/cards/:cardId/vote
   * Vote on custom card
   *
   * Body:
   * {
   *   "votedBy": "user-uuid",
   *   "vote": "up", // up or down
   *   "groupId": "group-uuid"
   * }
   */
  router.post('/cards/:cardId/vote', async (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { cardId } = req.params;
      const { votedBy, vote, groupId } = req.body;

      if (!votedBy || !vote) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: votedBy, vote'
        });
      }

      const result = await wildcardManager.voteCard(
        cardId,
        votedBy,
        vote,
        groupId
      );

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error voting card:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/card-games/cards/group/:groupId
   * Get group's custom cards
   */
  router.get('/cards/group/:groupId', (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { groupId } = req.params;
      const { includeUnapproved, cardType } = req.query;

      const cards = wildcardManager.getGroupCards(groupId, {
        includeUnapproved: includeUnapproved === 'true',
        cardType
      });

      res.json({
        success: true,
        cards,
        count: cards.length
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting group cards:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/card-games/cards/:cardId/history
   * Get card edit history
   */
  router.get('/cards/:cardId/history', (req, res) => {
    try {
      if (!wildcardManager) {
        return res.status(501).json({
          success: false,
          error: 'Wildcard manager not initialized'
        });
      }

      const { cardId } = req.params;

      const history = wildcardManager.getCardHistory(cardId);

      res.json({
        success: true,
        history,
        count: history.length
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting card history:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // AI BOTS
  // ============================================================================

  /**
   * POST /api/card-games/:gameId/spawn-bots
   * Spawn AI bots for game
   *
   * Body:
   * {
   *   "groupId": "group-uuid",
   *   "count": 2 // optional, default based on human count
   * }
   */
  router.post('/:gameId/spawn-bots', async (req, res) => {
    try {
      if (!botPool) {
        return res.status(501).json({
          success: false,
          error: 'Bot pool not initialized'
        });
      }

      const { gameId } = req.params;
      const { groupId, count } = req.body;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: groupId'
        });
      }

      const game = cardGameEngine.getGame(gameId);
      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      const humanCount = game.players.filter(p => p.playerType === 'human').length;

      // Spawn bots
      const result = await botPool.spawnBotsForGroup(groupId, humanCount);

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Join bots to game
      const joinedBots = [];
      for (const bot of result.bots || []) {
        const joinResult = await cardGameEngine.joinGame(gameId, bot.botId, 'bot', {
          username: bot.username,
          metadata: { personality: bot.personality }
        });

        if (joinResult.success) {
          joinedBots.push(bot);
        }
      }

      res.json({
        success: true,
        botsSpawned: joinedBots.length,
        bots: joinedBots
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error spawning bots:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/bot-play
   * Make bot play a card
   *
   * Body:
   * {
   *   "botId": "bot-uuid"
   * }
   */
  router.post('/:gameId/bot-play', async (req, res) => {
    try {
      if (!aiCardPlayer) {
        return res.status(501).json({
          success: false,
          error: 'AI card player not initialized'
        });
      }

      const { gameId } = req.params;
      const { botId } = req.body;

      if (!botId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: botId'
        });
      }

      const result = await aiCardPlayer.botMakePlay(gameId, botId);

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error bot playing:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/card-games/:gameId/bot-judge
   * Make bot judge responses
   *
   * Body:
   * {
   *   "botId": "bot-uuid"
   * }
   */
  router.post('/:gameId/bot-judge', async (req, res) => {
    try {
      if (!aiCardPlayer) {
        return res.status(501).json({
          success: false,
          error: 'AI card player not initialized'
        });
      }

      const { gameId } = req.params;
      const { botId } = req.body;

      if (!botId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: botId'
        });
      }

      const result = await aiCardPlayer.botJudgeResponses(gameId, botId);

      res.json(result);

    } catch (error) {
      console.error('[CardGameRoutes] Error bot judging:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * GET /api/card-games/stats
   * Get overall stats
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = {
        cardGameEngine: cardGameEngine.getStats(),
        wildcardManager: wildcardManager ? wildcardManager.getStats() : null,
        aiCardPlayer: aiCardPlayer ? aiCardPlayer.getStats() : null,
        botPool: botPool ? botPool.getStats() : null
      };

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('[CardGameRoutes] Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createCardGameRoutes;
