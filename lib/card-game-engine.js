/**
 * Card Game Engine
 *
 * Core engine for multiplayer card games (UNO, CAH, Apples to Apples, etc.)
 * Supports customizable wildcards that players can modify.
 *
 * Features:
 * - Multiple game modes (Speed, Judge, Build, Custom)
 * - Deck management (shuffle, draw, discard)
 * - Player hands
 * - Turn management
 * - Win conditions
 * - Wildcard system (editable cards)
 * - Real-time gameplay
 *
 * Philosophy:
 * Like Jackbox Party Pack but fully customizable + AI bots.
 */

const crypto = require('crypto');

class CardGameEngine {
  constructor(options = {}) {
    this.db = options.db;
    this.wildcardManager = options.wildcardManager;
    this.culturePackManager = options.culturePackManager;

    this.config = {
      // Game modes
      modes: {
        speed: {
          name: 'Speed Mode',
          description: 'UNO-style: Race to empty your hand',
          maxPlayers: 10,
          minPlayers: 2,
          handSize: 7,
          winCondition: 'empty_hand'
        },
        judge: {
          name: 'Judge Mode',
          description: 'CAH-style: Judge picks best response',
          maxPlayers: 10,
          minPlayers: 3,
          handSize: 10,
          winCondition: 'points'
        },
        build: {
          name: 'Build Mode',
          description: 'Settlers-style: Collect and trade resources',
          maxPlayers: 6,
          minPlayers: 2,
          handSize: 5,
          winCondition: 'victory_points'
        },
        custom: {
          name: 'Custom Mode',
          description: 'Player-defined rules',
          maxPlayers: 10,
          minPlayers: 2,
          handSize: 7,
          winCondition: 'custom'
        }
      },

      // Card types
      cardTypes: {
        number: 'number',       // UNO numbers
        action: 'action',       // Skip, Reverse, Draw
        wild: 'wild',           // Wildcards
        prompt: 'prompt',       // CAH prompts
        response: 'response',   // CAH responses
        resource: 'resource',   // Settlers resources
        custom: 'custom'        // User-created
      },

      // UNO colors
      colors: ['red', 'blue', 'green', 'yellow'],

      // UNO numbers
      numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    };

    // Active games
    // gameId -> game state
    this.games = new Map();

    console.log('[CardGameEngine] Initialized');
  }

  /**
   * Create new game
   */
  async createGame({ groupId, createdBy, gameMode = 'speed', deckId = null, customRules = {} }) {
    try {
      const gameId = `game-${crypto.randomUUID()}`;

      const modeConfig = this.config.modes[gameMode] || this.config.modes.speed;

      const game = {
        gameId,
        groupId,
        createdBy,
        gameMode,
        deckId,
        status: 'waiting', // waiting, active, paused, ended
        currentTurn: null,
        currentPhase: 'waiting', // waiting, draw, play, judge, trade
        currentJudge: null, // For judge mode
        direction: 1, // 1 = forward, -1 = reverse (UNO)
        createdAt: Date.now(),
        startedAt: null,
        endedAt: null,
        customRules,
        config: modeConfig,
        players: [], // { playerId, playerType, username, hand: [], score: 0 }
        drawPile: [],
        discardPile: [],
        currentPrompt: null, // For judge mode
        playedCards: new Map(), // playerId -> card (for judge mode)
        metadata: {}
      };

      // Initialize deck
      if (deckId) {
        game.drawPile = await this.loadDeck(deckId, gameMode);
      } else {
        game.drawPile = this.generateDefaultDeck(gameMode);
      }

      // Shuffle deck
      this.shuffleDeck(game.drawPile);

      // Track which packs were used
      if (game.drawPile.length > 0 && game.drawPile[0].packId) {
        game.metadata.culturePacks = [...new Set(game.drawPile.map(card => card.packId))];
      }

      // Store game
      this.games.set(gameId, game);

      // Store in database
      if (this.db) {
        await this._storeGameInDB(game);
      }

      console.log(`[CardGameEngine] Created ${gameMode} game: ${gameId}`);

      return {
        success: true,
        game
      };

    } catch (error) {
      console.error('[CardGameEngine] Error creating game:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Join game
   */
  async joinGame(gameId, playerId, playerType = 'human', playerData = {}) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      if (game.status !== 'waiting') {
        return { success: false, error: 'Game already started' };
      }

      // Check if already joined
      if (game.players.find(p => p.playerId === playerId)) {
        return { success: false, error: 'Already in game' };
      }

      // Check player limit
      if (game.players.length >= game.config.maxPlayers) {
        return { success: false, error: 'Game is full' };
      }

      const player = {
        playerId,
        playerType, // 'human' or 'bot'
        username: playerData.username || `Player_${playerId.slice(0, 8)}`,
        hand: [],
        score: 0,
        victoryPoints: 0,
        joinedAt: Date.now(),
        metadata: playerData.metadata || {}
      };

      game.players.push(player);

      console.log(`[CardGameEngine] ${player.username} joined game ${gameId}`);

      return {
        success: true,
        game,
        player
      };

    } catch (error) {
      console.error('[CardGameEngine] Error joining game:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start game
   */
  async startGame(gameId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      if (game.players.length < game.config.minPlayers) {
        return {
          success: false,
          error: `Need at least ${game.config.minPlayers} players`
        };
      }

      // Deal cards to players
      for (const player of game.players) {
        for (let i = 0; i < game.config.handSize; i++) {
          const card = this.drawCard(game);
          if (card) {
            player.hand.push(card);
          }
        }
      }

      // Set initial state based on game mode
      if (game.gameMode === 'speed') {
        // UNO-style: Start with first card in discard pile
        const startCard = this.drawCard(game);
        if (startCard) {
          game.discardPile.push(startCard);
        }
        game.currentTurn = game.players[0].playerId;
        game.currentPhase = 'play';

      } else if (game.gameMode === 'judge') {
        // CAH-style: First player is judge
        game.currentJudge = game.players[0].playerId;
        game.currentPhase = 'draw';
        // Judge draws prompt card
        const promptCard = this.drawPromptCard(game);
        if (promptCard) {
          game.currentPrompt = promptCard;
          game.currentPhase = 'play'; // Other players play responses
        }

      } else if (game.gameMode === 'build') {
        // Settlers-style: Players collect resources
        game.currentTurn = game.players[0].playerId;
        game.currentPhase = 'trade';
      }

      game.status = 'active';
      game.startedAt = Date.now();

      console.log(`[CardGameEngine] Game ${gameId} started with ${game.players.length} players`);

      return {
        success: true,
        game
      };

    } catch (error) {
      console.error('[CardGameEngine] Error starting game:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Play card
   */
  async playCard(gameId, playerId, cardIndex, options = {}) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      const player = game.players.find(p => p.playerId === playerId);
      if (!player) {
        return { success: false, error: 'Player not in game' };
      }

      if (cardIndex < 0 || cardIndex >= player.hand.length) {
        return { success: false, error: 'Invalid card index' };
      }

      const card = player.hand[cardIndex];

      // Validate play based on game mode
      if (game.gameMode === 'speed') {
        // UNO-style: Check if card matches top of discard pile
        const topCard = game.discardPile[game.discardPile.length - 1];
        if (!this.canPlayCard(card, topCard, options)) {
          return { success: false, error: 'Cannot play that card' };
        }
      }

      // Remove card from hand
      player.hand.splice(cardIndex, 1);

      // Add to discard pile or played cards
      if (game.gameMode === 'speed') {
        game.discardPile.push(card);

        // Apply card effect
        await this.applyCardEffect(game, card, playerId, options);

      } else if (game.gameMode === 'judge') {
        // CAH-style: Store played card for judging
        game.playedCards.set(playerId, card);

        // Check if all non-judge players have played
        const nonJudgePlayers = game.players.filter(p => p.playerId !== game.currentJudge);
        if (game.playedCards.size === nonJudgePlayers.length) {
          game.currentPhase = 'judge'; // Judge picks winner
        }
      }

      // Draw new card (if in judge mode)
      if (game.gameMode === 'judge') {
        const newCard = this.drawCard(game);
        if (newCard) {
          player.hand.push(newCard);
        }
      }

      // Check win condition
      const winner = this.checkWinCondition(game);
      if (winner) {
        game.status = 'ended';
        game.endedAt = Date.now();
        game.metadata.winner = winner;
      }

      return {
        success: true,
        card,
        game,
        winner: winner || null
      };

    } catch (error) {
      console.error('[CardGameEngine] Error playing card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Draw card
   */
  drawCard(game) {
    if (game.drawPile.length === 0) {
      // Reshuffle discard pile
      if (game.discardPile.length > 1) {
        const topCard = game.discardPile.pop();
        game.drawPile = [...game.discardPile];
        game.discardPile = [topCard];
        this.shuffleDeck(game.drawPile);
      } else {
        return null; // No cards left
      }
    }

    return game.drawPile.pop();
  }

  /**
   * Draw prompt card (for judge mode)
   */
  drawPromptCard(game) {
    const promptCards = game.drawPile.filter(c => c.type === this.config.cardTypes.prompt);
    if (promptCards.length === 0) return null;

    const card = promptCards[Math.floor(Math.random() * promptCards.length)];
    game.drawPile = game.drawPile.filter(c => c !== card);
    return card;
  }

  /**
   * Can play card? (UNO-style matching)
   */
  canPlayCard(card, topCard, options = {}) {
    if (!topCard) return true;

    // Wild cards can always be played
    if (card.type === this.config.cardTypes.wild) return true;

    // Match color or number
    if (card.color === topCard.color) return true;
    if (card.number !== undefined && card.number === topCard.number) return true;
    if (card.action === topCard.action) return true;

    return false;
  }

  /**
   * Apply card effect (UNO-style)
   */
  async applyCardEffect(game, card, playerId, options = {}) {
    if (!card.effect) return;

    switch (card.effect) {
      case 'skip':
        this.nextTurn(game, 2); // Skip next player
        break;

      case 'reverse':
        game.direction *= -1; // Reverse direction
        this.nextTurn(game);
        break;

      case 'draw2':
        this.nextTurn(game);
        const nextPlayer = game.players.find(p => p.playerId === game.currentTurn);
        if (nextPlayer) {
          for (let i = 0; i < 2; i++) {
            const drawnCard = this.drawCard(game);
            if (drawnCard) nextPlayer.hand.push(drawnCard);
          }
        }
        break;

      case 'wild':
        // Set color (from options)
        if (options.color) {
          card.color = options.color;
        }
        this.nextTurn(game);
        break;

      case 'wild_draw4':
        if (options.color) {
          card.color = options.color;
        }
        this.nextTurn(game);
        const nextPlayer4 = game.players.find(p => p.playerId === game.currentTurn);
        if (nextPlayer4) {
          for (let i = 0; i < 4; i++) {
            const drawnCard = this.drawCard(game);
            if (drawnCard) nextPlayer4.hand.push(drawnCard);
          }
        }
        break;

      default:
        this.nextTurn(game);
    }
  }

  /**
   * Next turn
   */
  nextTurn(game, skip = 1) {
    const currentIndex = game.players.findIndex(p => p.playerId === game.currentTurn);
    const nextIndex = (currentIndex + (skip * game.direction) + game.players.length) % game.players.length;
    game.currentTurn = game.players[nextIndex].playerId;
  }

  /**
   * Judge picks winner (CAH mode)
   */
  async judgePickWinner(gameId, judgeId, winnerPlayerId) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.currentJudge !== judgeId) {
      return { success: false, error: 'Not the judge' };
    }

    const winner = game.players.find(p => p.playerId === winnerPlayerId);
    if (!winner) {
      return { success: false, error: 'Invalid winner' };
    }

    // Award point
    winner.score++;

    // Clear played cards
    game.playedCards.clear();

    // Next judge
    const currentIndex = game.players.findIndex(p => p.playerId === game.currentJudge);
    const nextIndex = (currentIndex + 1) % game.players.length;
    game.currentJudge = game.players[nextIndex].playerId;

    // Draw new prompt
    const newPrompt = this.drawPromptCard(game);
    if (newPrompt) {
      game.currentPrompt = newPrompt;
    }

    game.currentPhase = 'play';

    // Check win condition
    const gameWinner = this.checkWinCondition(game);
    if (gameWinner) {
      game.status = 'ended';
      game.endedAt = Date.now();
      game.metadata.winner = gameWinner;
    }

    return {
      success: true,
      winner,
      game
    };
  }

  /**
   * Check win condition
   */
  checkWinCondition(game) {
    if (game.config.winCondition === 'empty_hand') {
      // UNO-style: First to empty hand wins
      const winner = game.players.find(p => p.hand.length === 0);
      return winner || null;

    } else if (game.config.winCondition === 'points') {
      // CAH-style: First to N points wins
      const targetPoints = game.customRules.targetPoints || 7;
      const winner = game.players.find(p => p.score >= targetPoints);
      return winner || null;

    } else if (game.config.winCondition === 'victory_points') {
      // Settlers-style: First to N victory points
      const targetVP = game.customRules.targetVictoryPoints || 10;
      const winner = game.players.find(p => p.victoryPoints >= targetVP);
      return winner || null;
    }

    return null;
  }

  /**
   * Generate default deck (UNO-style)
   */
  generateDefaultDeck(gameMode) {
    const deck = [];

    if (gameMode === 'speed') {
      // UNO deck
      for (const color of this.config.colors) {
        // Number cards (0-9)
        for (const number of this.config.numbers) {
          deck.push({ type: 'number', color, number, id: crypto.randomUUID() });
          if (number > 0) {
            deck.push({ type: 'number', color, number, id: crypto.randomUUID() }); // Duplicate
          }
        }

        // Action cards
        for (let i = 0; i < 2; i++) {
          deck.push({ type: 'action', color, action: 'skip', effect: 'skip', id: crypto.randomUUID() });
          deck.push({ type: 'action', color, action: 'reverse', effect: 'reverse', id: crypto.randomUUID() });
          deck.push({ type: 'action', color, action: 'draw2', effect: 'draw2', id: crypto.randomUUID() });
        }
      }

      // Wild cards
      for (let i = 0; i < 4; i++) {
        deck.push({ type: 'wild', action: 'wild', effect: 'wild', text: 'Wild', editable: true, id: crypto.randomUUID() });
        deck.push({ type: 'wild', action: 'wild_draw4', effect: 'wild_draw4', text: 'Wild Draw 4', editable: true, id: crypto.randomUUID() });
      }

    } else if (gameMode === 'judge') {
      // CAH-style deck (simplified)
      // Prompt cards
      const prompts = [
        'The next viral meme will be ___',
        'The worst invention is ___',
        'Touch grass speedrun WR is ___',
        'Your mom\'s favorite app is ___',
        'The most cringe thing in 2025 is ___',
        'Best way to annoy your friends: ___',
        'The next big social media platform: ___',
        'What ruined the internet? ___'
      ];

      for (const text of prompts) {
        deck.push({ type: 'prompt', text, editable: true, id: crypto.randomUUID() });
      }

      // Response cards
      const responses = [
        'your mom', 'capitalism', 'wet socks', 'mondays', 'ai-generated cringe 💀',
        'touching grass', 'wifi', 'bruh momento', 'just vibing fr', 'no cap',
        'fr fr', 'the vibes', 'clout', 'memes', 'your code', 'stackoverflow'
      ];

      for (const text of responses) {
        for (let i = 0; i < 5; i++) { // Multiple copies
          deck.push({ type: 'response', text, editable: true, id: crypto.randomUUID() });
        }
      }
    }

    return deck;
  }

  /**
   * Shuffle deck
   */
  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  /**
   * Load deck from database or culture packs
   */
  async loadDeck(deckId, gameMode = 'judge') {
    // Check if deckId is actually pack IDs (comma-separated)
    if (deckId.includes(',')) {
      const packIds = deckId.split(',').map(id => id.trim());
      if (this.culturePackManager) {
        return this.culturePackManager.generateDeck(packIds);
      }
    }

    // Check if it's "random" or "rotation"
    if (deckId === 'random' || deckId === 'rotation') {
      if (this.culturePackManager) {
        const rotation = this.culturePackManager.getActiveRotation();
        return this.culturePackManager.generateDeck(rotation);
      }
    }

    // Check if it's a single pack ID
    if (this.culturePackManager) {
      const pack = this.culturePackManager.getPack(deckId);
      if (pack) {
        return this.culturePackManager.generateDeck([deckId]);
      }
    }

    // Fallback: Try to load from database
    if (this.db) {
      try {
        const result = await this.db.query('SELECT * FROM custom_decks WHERE deck_id = $1', [deckId]);
        if (result.rows.length > 0) {
          return JSON.parse(result.rows[0].cards);
        }
      } catch (error) {
        console.warn(`[CardGameEngine] Error loading deck from DB: ${error.message}`);
      }
    }

    // Final fallback: Generate default deck
    console.warn(`[CardGameEngine] Deck ${deckId} not found, using default`);
    return this.generateDefaultDeck(gameMode);
  }

  /**
   * Get game
   */
  getGame(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Store game in database
   * @private
   */
  async _storeGameInDB(game) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO card_games (
          game_id,
          group_id,
          created_by,
          game_mode,
          deck_id,
          status,
          custom_rules,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        game.gameId,
        game.groupId,
        game.createdBy,
        game.gameMode,
        game.deckId,
        game.status,
        JSON.stringify(game.customRules)
      ]);

    } catch (error) {
      console.warn('[CardGameEngine] Failed to store game:', error.message);
    }
  }
}

module.exports = CardGameEngine;
