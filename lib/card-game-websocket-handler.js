/**
 * Card Game WebSocket Handler
 *
 * Real-time WebSocket communication for multiplayer card games.
 * Connects users + AI bots for UNO, CAH, Apples to Apples, Settlers, etc.
 *
 * Message Types:
 * - game_create: Create new game
 * - game_join: Join game
 * - game_start: Start game
 * - game_play_card: Play a card
 * - game_draw_card: Draw from deck
 * - game_judge_vote: Judge picks winner (CAH mode)
 * - game_leave: Leave game
 * - bot_auto_play: Auto-play for AI bots
 *
 * Philosophy:
 * Real-time card games that feel instant.
 * Bots play alongside humans seamlessly.
 */

class CardGameWebSocketHandler {
  constructor({ db, cardGameEngine, aiCardPlayer, botPool, gameCompletionHandler }) {
    this.db = db;
    this.cardGameEngine = cardGameEngine;
    this.aiCardPlayer = aiCardPlayer;
    this.botPool = botPool;
    this.gameCompletionHandler = gameCompletionHandler;

    // Track WebSocket to player mapping
    this.wsToPlayer = new Map();
    this.playerToWs = new Map();

    // Track active games
    this.activeGames = new Set();

    console.log('[CardGameWebSocketHandler] Initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  onConnection(ws) {
    console.log('[CardGameWebSocketHandler] New connection');

    // Send welcome
    this.send(ws, {
      type: 'card_game_ready',
      message: 'Connected to card game system',
      timestamp: Date.now()
    });

    // Set up message handler
    ws.on('message', (data) => this.handleMessage(ws, data));

    // Handle disconnect
    ws.on('close', () => this.handleDisconnect(ws));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      console.log(`[CardGameWebSocketHandler] Message: ${message.type}`);

      switch (message.type) {
        case 'game_create':
          await this.handleCreateGame(ws, message);
          break;

        case 'game_join':
          await this.handleJoinGame(ws, message);
          break;

        case 'game_start':
          await this.handleStartGame(ws, message);
          break;

        case 'game_play_card':
          await this.handlePlayCard(ws, message);
          break;

        case 'game_draw_card':
          await this.handleDrawCard(ws, message);
          break;

        case 'game_judge_vote':
          await this.handleJudgeVote(ws, message);
          break;

        case 'game_leave':
          await this.handleLeaveGame(ws, message);
          break;

        case 'bot_spawn':
          await this.handleBotSpawn(ws, message);
          break;

        default:
          console.log(`[CardGameWebSocketHandler] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[CardGameWebSocketHandler] Message error:', error);
      this.send(ws, {
        type: 'error',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle game creation
   */
  async handleCreateGame(ws, message) {
    const { groupId, createdBy, gameMode, deckId, customRules } = message;

    const result = await this.cardGameEngine.createGame({
      groupId,
      createdBy,
      gameMode,
      deckId,
      customRules
    });

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    const gameId = result.game.gameId;
    this.activeGames.add(gameId);

    // Send confirmation
    this.send(ws, {
      type: 'game_created',
      ...result,
      timestamp: Date.now()
    });

    console.log(`[CardGameWebSocketHandler] Game created: ${gameId} (${gameMode})`);
  }

  /**
   * Handle join game
   */
  async handleJoinGame(ws, message) {
    const { gameId, playerId, playerType = 'human', playerData } = message;

    try {
      const result = await this.cardGameEngine.joinGame(
        gameId,
        playerId,
        playerType,
        playerData
      );

      if (!result.success) {
        this.send(ws, {
          type: 'error',
          message: result.error,
          timestamp: Date.now()
        });
        return;
      }

      // Register WebSocket connection
      this.registerConnection(ws, gameId, playerId);

      // Send game state
      this.send(ws, {
        type: 'game_joined',
        ...result,
        timestamp: Date.now()
      });

      // Broadcast to other players
      this.broadcastToGame(gameId, {
        type: 'player_joined',
        gameId,
        player: result.player,
        playerCount: result.game.players.length,
        timestamp: Date.now()
      }, playerId); // Exclude self

      console.log(`[CardGameWebSocketHandler] ${playerId} joined game ${gameId}`);

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to join game: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle start game
   */
  async handleStartGame(ws, message) {
    const { gameId } = message;

    const result = await this.cardGameEngine.startGame(gameId);

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Broadcast game started to all players
    this.broadcastToGame(gameId, {
      type: 'game_started',
      ...result,
      timestamp: Date.now()
    });

    // If first player is a bot, auto-play
    if (result.game.status === 'active') {
      await this._checkBotTurn(gameId);
    }
  }

  /**
   * Handle play card
   */
  async handlePlayCard(ws, message) {
    const { gameId, playerId, cardIndex, options } = message;

    const result = await this.cardGameEngine.playCard(
      gameId,
      playerId,
      cardIndex,
      options
    );

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Broadcast card played to all players
    this.broadcastToGame(gameId, {
      type: 'card_played',
      gameId,
      playerId,
      cardPlayed: result.cardPlayed,
      game: result.game,
      timestamp: Date.now()
    });

    // Check for winner
    if (result.winner) {
      // Process game completion (vibe scoring, leaderboard, quests, ELO)
      if (this.gameCompletionHandler) {
        const game = this.cardGameEngine.getGame(gameId);
        await this.gameCompletionHandler.handleCompletion(game, result.winner);
      }

      this.broadcastToGame(gameId, {
        type: 'game_ended',
        gameId,
        winner: result.winner,
        finalStats: result.finalStats,
        timestamp: Date.now()
      });
      return;
    }

    // Check if next player is a bot
    await this._checkBotTurn(gameId);
  }

  /**
   * Handle draw card
   */
  async handleDrawCard(ws, message) {
    const { gameId, playerId } = message;

    const result = await this.cardGameEngine.drawCard(gameId, playerId);

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Send card drawn to player (private)
    this.send(ws, {
      type: 'card_drawn',
      gameId,
      card: result.card,
      handSize: result.handSize,
      timestamp: Date.now()
    });

    // Broadcast to others (no card details)
    this.broadcastToGame(gameId, {
      type: 'player_drew_card',
      gameId,
      playerId,
      handSize: result.handSize,
      timestamp: Date.now()
    }, playerId); // Exclude self
  }

  /**
   * Handle judge vote (CAH mode)
   */
  async handleJudgeVote(ws, message) {
    const { gameId, judgeId, winnerId } = message;

    const result = await this.cardGameEngine.judgePickWinner(
      gameId,
      judgeId,
      winnerId
    );

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Broadcast winner selected
    this.broadcastToGame(gameId, {
      type: 'round_winner',
      gameId,
      winnerId,
      winningCard: result.winningCard,
      scores: result.scores,
      timestamp: Date.now()
    });

    // Check if game ended (reached win condition)
    if (result.gameWinner) {
      // Process game completion (vibe scoring, leaderboard, quests, ELO)
      if (this.gameCompletionHandler) {
        const game = this.cardGameEngine.getGame(gameId);
        await this.gameCompletionHandler.handleCompletion(game, result.gameWinner);
      }

      this.broadcastToGame(gameId, {
        type: 'game_ended',
        gameId,
        winner: result.gameWinner,
        finalStats: result.finalStats,
        timestamp: Date.now()
      });
      return;
    }

    // Start next round
    this.broadcastToGame(gameId, {
      type: 'next_round',
      gameId,
      currentJudge: result.nextJudge,
      timestamp: Date.now()
    });

    // Check if next judge is a bot
    await this._checkBotTurn(gameId);
  }

  /**
   * Handle leave game
   */
  async handleLeaveGame(ws, message) {
    const { gameId, playerId } = message;

    await this.cardGameEngine.leaveGame(gameId, playerId);
    this.unregisterConnection(ws);

    this.send(ws, {
      type: 'game_left',
      gameId,
      timestamp: Date.now()
    });

    // Broadcast to others
    this.broadcastToGame(gameId, {
      type: 'player_left',
      gameId,
      playerId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle bot spawn request
   */
  async handleBotSpawn(ws, message) {
    const { gameId, groupId, count = 1 } = message;

    const game = this.cardGameEngine.getGame(gameId);
    if (!game) {
      this.send(ws, {
        type: 'error',
        message: 'Game not found',
        timestamp: Date.now()
      });
      return;
    }

    const humanCount = game.players.filter(p => p.playerType === 'human').length;

    // Spawn bots
    const result = await this.botPool.spawnBotsForGroup(groupId, humanCount);

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Join bots to game
    for (const bot of result.bots || []) {
      await this.cardGameEngine.joinGame(gameId, bot.botId, 'bot', {
        username: bot.username,
        metadata: { personality: bot.personality }
      });
    }

    this.send(ws, {
      type: 'bots_spawned',
      gameId,
      botsSpawned: result.botsSpawned,
      bots: result.bots,
      timestamp: Date.now()
    });

    // Broadcast to others
    this.broadcastToGame(gameId, {
      type: 'bots_joined',
      gameId,
      bots: result.bots,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(ws) {
    const info = this.wsToPlayer.get(ws);

    if (info) {
      const { gameId, playerId } = info;

      // Leave game
      this.cardGameEngine.leaveGame(gameId, playerId);

      // Clean up mappings
      this.unregisterConnection(ws);

      // Broadcast disconnect
      this.broadcastToGame(gameId, {
        type: 'player_disconnected',
        gameId,
        playerId,
        timestamp: Date.now()
      });

      console.log(`[CardGameWebSocketHandler] ${playerId} disconnected from ${gameId}`);
    }
  }

  /**
   * Check if it's a bot's turn and auto-play
   * @private
   */
  async _checkBotTurn(gameId) {
    try {
      const game = this.cardGameEngine.getGame(gameId);
      if (!game || game.status !== 'active') return;

      const currentPlayer = game.players[game.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.playerType !== 'bot') return;

      // Bot's turn - auto-play after delay
      const botId = currentPlayer.playerId;

      // Broadcast that bot is thinking
      this.broadcastToGame(gameId, {
        type: 'bot_thinking',
        gameId,
        botId,
        username: currentPlayer.username,
        timestamp: Date.now()
      });

      // Bot makes play (includes think delay)
      const result = await this.aiCardPlayer.botMakePlay(gameId, botId);

      if (result.success) {
        // Broadcast bot's play
        this.broadcastToGame(gameId, {
          type: 'card_played',
          gameId,
          playerId: botId,
          cardPlayed: result.card,
          reasoning: result.reasoning,
          game: result.game,
          timestamp: Date.now()
        });

        // Check for winner
        if (result.winner) {
          // Process game completion (vibe scoring, leaderboard, quests, ELO)
          if (this.gameCompletionHandler) {
            const game = this.cardGameEngine.getGame(gameId);
            await this.gameCompletionHandler.handleCompletion(game, result.winner);
          }

          this.broadcastToGame(gameId, {
            type: 'game_ended',
            gameId,
            winner: result.winner,
            finalStats: result.finalStats,
            timestamp: Date.now()
          });
          return;
        }

        // Check if next player is also a bot (chain bot plays)
        await this._checkBotTurn(gameId);
      }

    } catch (error) {
      console.error('[CardGameWebSocketHandler] Error bot auto-play:', error);
    }
  }

  /**
   * Register WebSocket connection
   * @private
   */
  registerConnection(ws, gameId, playerId) {
    this.wsToPlayer.set(ws, { gameId, playerId });
    this.playerToWs.set(playerId, ws);
  }

  /**
   * Unregister WebSocket connection
   * @private
   */
  unregisterConnection(ws) {
    const info = this.wsToPlayer.get(ws);
    if (info) {
      this.playerToWs.delete(info.playerId);
      this.wsToPlayer.delete(ws);
    }
  }

  /**
   * Send message to WebSocket client
   * @private
   */
  send(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all players in game
   */
  broadcastToGame(gameId, message, excludePlayerId = null) {
    const game = this.cardGameEngine.getGame(gameId);
    if (!game) return;

    for (const player of game.players) {
      if (excludePlayerId && player.playerId === excludePlayerId) {
        continue; // Skip excluded player
      }

      const ws = this.playerToWs.get(player.playerId);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      connections: this.wsToPlayer.size,
      activeGames: this.activeGames.size,
      ...this.cardGameEngine.getStats()
    };
  }
}

module.exports = CardGameWebSocketHandler;
