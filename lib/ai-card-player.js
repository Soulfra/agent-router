/**
 * AI Card Player
 *
 * Makes AI bots play card games intelligently.
 * Analyzes game state, selects best cards, makes strategic decisions.
 *
 * Powered by Ollama for context-aware card selection.
 * Fallback to rule-based logic if Ollama unavailable.
 *
 * Features:
 * - UNO strategy (color/number matching, save action cards)
 * - CAH comedy selection (funniest response wins)
 * - Resource trading (Settlers-style negotiation)
 * - Personality-driven play (aggressive, defensive, chaotic)
 *
 * Philosophy:
 * Bots should play like real people - sometimes smart, sometimes random, sometimes hilarious.
 */

class AICardPlayer {
  constructor(options = {}) {
    this.botPool = options.botPool; // AI Bot Pool Manager
    this.cardGameEngine = options.cardGameEngine;
    this.ollamaClient = options.ollamaClient;
    this.ollamaModel = options.ollamaModel || 'mistral:latest';

    this.config = {
      // Response delay (realistic thinking time)
      minThinkDelay: options.minThinkDelay || 2000, // 2 seconds
      maxThinkDelay: options.maxThinkDelay || 6000, // 6 seconds

      // Play styles per personality
      playStyles: {
        friendly: {
          aggression: 0.3, // Low aggression
          strategy: 'defensive', // Play safe
          wildCardUsage: 'conservative' // Save wilds
        },
        meme: {
          aggression: 0.5,
          strategy: 'chaotic', // Random plays for laughs
          wildCardUsage: 'frequent'
        },
        roast: {
          aggression: 0.8, // High aggression
          strategy: 'aggressive', // Attack others
          wildCardUsage: 'strategic'
        },
        serious: {
          aggression: 0.6,
          strategy: 'calculated', // Always optimal
          wildCardUsage: 'optimal'
        },
        chaos: {
          aggression: 1.0, // Max chaos
          strategy: 'random', // Unpredictable
          wildCardUsage: 'random'
        }
      },

      // CAH prompt analysis keywords
      comedyKeywords: {
        positive: ['funny', 'hilarious', 'lol', 'meme', 'joke'],
        negative: ['sad', 'serious', 'boring', 'generic'],
        edgy: ['dark', 'roast', 'savage', 'cursed'],
        wholesome: ['wholesome', 'cute', 'nice', 'sweet']
      }
    };

    console.log('[AICardPlayer] Initialized');
  }

  /**
   * Bot makes a play in the game
   */
  async botMakePlay(gameId, botId) {
    try {
      const game = this.cardGameEngine.getGame(gameId);
      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      const bot = this.botPool.getBot(botId);
      if (!bot) {
        return { success: false, error: 'Bot not found' };
      }

      const player = game.players.find(p => p.playerId === botId);
      if (!player) {
        return { success: false, error: 'Bot not in game' };
      }

      // Check if it's bot's turn
      if (game.currentPlayerIndex !== game.players.indexOf(player)) {
        return { success: false, error: 'Not bot\'s turn' };
      }

      // Think delay (realistic)
      const thinkDelay = this._getThinkDelay(bot.personality);
      await this._sleep(thinkDelay);

      // Select best card based on game mode
      let cardPlay;

      if (game.gameMode === 'speed') {
        cardPlay = await this._selectSpeedModeCard(game, player, bot);
      } else if (game.gameMode === 'judge') {
        cardPlay = await this._selectJudgeModeCard(game, player, bot);
      } else if (game.gameMode === 'build') {
        cardPlay = await this._selectBuildModeCard(game, player, bot);
      } else {
        // Custom mode - use generic strategy
        cardPlay = await this._selectGenericCard(game, player, bot);
      }

      if (!cardPlay.success) {
        return cardPlay;
      }

      // Play the card
      const result = await this.cardGameEngine.playCard(
        gameId,
        botId,
        cardPlay.cardIndex,
        cardPlay.options
      );

      return {
        success: true,
        card: cardPlay.card,
        cardIndex: cardPlay.cardIndex,
        options: cardPlay.options,
        reasoning: cardPlay.reasoning,
        ...result
      };

    } catch (error) {
      console.error('[AICardPlayer] Error bot making play:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bot judges responses (CAH-style)
   */
  async botJudgeResponses(gameId, botId) {
    try {
      const game = this.cardGameEngine.getGame(gameId);
      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      const bot = this.botPool.getBot(botId);
      if (!bot) {
        return { success: false, error: 'Bot not found' };
      }

      // Get prompt card
      const promptCard = game.currentPrompt;
      if (!promptCard) {
        return { success: false, error: 'No prompt card' };
      }

      // Get submitted responses
      const responses = game.submittedCards || [];
      if (responses.length === 0) {
        return { success: false, error: 'No responses to judge' };
      }

      // Think delay
      const thinkDelay = this._getThinkDelay(bot.personality);
      await this._sleep(thinkDelay);

      // Select funniest response
      const selection = await this._selectFunniestResponse(
        promptCard,
        responses,
        bot
      );

      // Pick winner
      const result = await this.cardGameEngine.judgePickWinner(
        gameId,
        botId,
        selection.winnerId
      );

      return {
        success: true,
        winnerId: selection.winnerId,
        reasoning: selection.reasoning,
        ...result
      };

    } catch (error) {
      console.error('[AICardPlayer] Error bot judging:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Select card for Speed Mode (UNO-style)
   * @private
   */
  async _selectSpeedModeCard(game, player, bot) {
    try {
      const topCard = game.discardPile[game.discardPile.length - 1];
      const playStyle = this.config.playStyles[bot.personality] || this.config.playStyles.friendly;

      // Find playable cards
      const playableCards = [];
      for (let i = 0; i < player.hand.length; i++) {
        const card = player.hand[i];
        if (this.cardGameEngine.canPlayCard(card, topCard)) {
          playableCards.push({ card, index: i });
        }
      }

      if (playableCards.length === 0) {
        return { success: false, error: 'No playable cards - must draw' };
      }

      // Strategy: Select best card based on personality

      let selectedCard;
      let selectedIndex;
      let reasoning = '';

      if (playStyle.strategy === 'aggressive') {
        // Prioritize action cards (Skip, Reverse, Draw 2)
        const actionCards = playableCards.filter(c => c.card.type === 'action' || c.card.type === 'wild');
        if (actionCards.length > 0 && Math.random() < playStyle.aggression) {
          const pick = actionCards[Math.floor(Math.random() * actionCards.length)];
          selectedCard = pick.card;
          selectedIndex = pick.index;
          reasoning = `Aggressive play: Using ${selectedCard.action || 'wild'} to attack`;
        }
      }

      if (!selectedCard && playStyle.strategy === 'defensive') {
        // Prioritize number cards (save action cards for later)
        const numberCards = playableCards.filter(c => c.card.type === 'number');
        if (numberCards.length > 0) {
          const pick = numberCards[Math.floor(Math.random() * numberCards.length)];
          selectedCard = pick.card;
          selectedIndex = pick.index;
          reasoning = 'Defensive play: Saving action cards for later';
        }
      }

      if (!selectedCard && playStyle.strategy === 'chaotic') {
        // Random card for chaos
        const pick = playableCards[Math.floor(Math.random() * playableCards.length)];
        selectedCard = pick.card;
        selectedIndex = pick.index;
        reasoning = 'Chaos mode: Playing random card 💀';
      }

      // Default: Play first playable card
      if (!selectedCard) {
        const pick = playableCards[0];
        selectedCard = pick.card;
        selectedIndex = pick.index;
        reasoning = 'Standard play: First available card';
      }

      // Handle wild card color selection
      let options = {};
      if (selectedCard.type === 'wild') {
        // Choose color based on hand composition
        options.color = this._chooseWildColor(player.hand);
        reasoning += ` (choosing ${options.color})`;
      }

      return {
        success: true,
        card: selectedCard,
        cardIndex: selectedIndex,
        options,
        reasoning
      };

    } catch (error) {
      console.error('[AICardPlayer] Error selecting speed card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Select card for Judge Mode (CAH-style)
   * @private
   */
  async _selectJudgeModeCard(game, player, bot) {
    try {
      const promptCard = game.currentPrompt;
      if (!promptCard) {
        return { success: false, error: 'No prompt card' };
      }

      const responseCards = player.hand.filter(c => c.type === 'response');

      if (responseCards.length === 0) {
        return { success: false, error: 'No response cards in hand' };
      }

      // Use Ollama to select funniest response
      let selectedCard;
      let selectedIndex;
      let reasoning = '';

      if (this.ollamaClient) {
        try {
          const selection = await this._ollamaSelectFunny(
            promptCard.text,
            responseCards,
            bot.personality
          );

          selectedCard = responseCards[selection.cardIndex];
          selectedIndex = player.hand.indexOf(selectedCard);
          reasoning = selection.reasoning;

        } catch (error) {
          console.warn('[AICardPlayer] Ollama error, using fallback:', error.message);
        }
      }

      // Fallback: Random selection with personality bias
      if (!selectedCard) {
        const keywords = this.config.comedyKeywords;
        const playStyle = this.config.playStyles[bot.personality];

        // Filter by personality preference
        let candidates = responseCards;

        if (playStyle.strategy === 'aggressive') {
          // Prefer edgy responses
          const edgy = responseCards.filter(c =>
            keywords.edgy.some(kw => c.text.toLowerCase().includes(kw))
          );
          if (edgy.length > 0) candidates = edgy;
        } else if (playStyle.strategy === 'defensive') {
          // Prefer wholesome responses
          const wholesome = responseCards.filter(c =>
            keywords.wholesome.some(kw => c.text.toLowerCase().includes(kw))
          );
          if (wholesome.length > 0) candidates = wholesome;
        }

        selectedCard = candidates[Math.floor(Math.random() * candidates.length)];
        selectedIndex = player.hand.indexOf(selectedCard);
        reasoning = `${bot.personality} pick: "${selectedCard.text}"`;
      }

      return {
        success: true,
        card: selectedCard,
        cardIndex: selectedIndex,
        options: {},
        reasoning
      };

    } catch (error) {
      console.error('[AICardPlayer] Error selecting judge card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Select card for Build Mode (Settlers-style)
   * @private
   */
  async _selectBuildModeCard(game, player, bot) {
    // Simplified resource strategy
    try {
      const resourceCards = player.hand.filter(c => c.type === 'resource');

      if (resourceCards.length === 0) {
        return { success: false, error: 'No resource cards' };
      }

      // Play most common resource
      const resourceCounts = {};
      resourceCards.forEach(card => {
        const resource = card.resource || 'unknown';
        resourceCounts[resource] = (resourceCounts[resource] || 0) + 1;
      });

      const mostCommon = Object.keys(resourceCounts).reduce((a, b) =>
        resourceCounts[a] > resourceCounts[b] ? a : b
      );

      const selectedCard = resourceCards.find(c => c.resource === mostCommon);
      const selectedIndex = player.hand.indexOf(selectedCard);

      return {
        success: true,
        card: selectedCard,
        cardIndex: selectedIndex,
        options: {},
        reasoning: `Building with ${mostCommon} (have ${resourceCounts[mostCommon]})`
      };

    } catch (error) {
      console.error('[AICardPlayer] Error selecting build card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Select card for generic/custom modes
   * @private
   */
  async _selectGenericCard(game, player, bot) {
    // Just play first card
    if (player.hand.length === 0) {
      return { success: false, error: 'No cards in hand' };
    }

    return {
      success: true,
      card: player.hand[0],
      cardIndex: 0,
      options: {},
      reasoning: 'Generic play: First card'
    };
  }

  /**
   * Select funniest response (CAH judging)
   * @private
   */
  async _selectFunniestResponse(promptCard, responses, bot) {
    try {
      if (this.ollamaClient) {
        // Use Ollama to judge
        const prompt = `
You are judging a Cards Against Humanity game.

Prompt: "${promptCard.text}"

Responses:
${responses.map((r, i) => `${i + 1}. ${r.card.text} (by ${r.username})`).join('\n')}

Pick the FUNNIEST response (1-${responses.length}). Consider:
- ${bot.personality === 'roast' ? 'Dark humor, edgy jokes' : ''}
- ${bot.personality === 'meme' ? 'Meme culture, internet humor' : ''}
- ${bot.personality === 'chaos' ? 'Absurdity, randomness' : ''}
- ${bot.personality === 'friendly' ? 'Wholesome humor, clever wordplay' : ''}

Your response (just the number):`.trim();

        const response = await this.ollamaClient.chat({
          model: this.ollamaModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: {
            temperature: 0.8
          }
        });

        const answer = response.message.content.trim();
        const pickedNumber = parseInt(answer.match(/\d+/)?.[0] || '1');
        const pickedIndex = Math.max(0, Math.min(pickedNumber - 1, responses.length - 1));

        return {
          winnerId: responses[pickedIndex].playerId,
          reasoning: `Picked response #${pickedNumber}: "${responses[pickedIndex].card.text}"`
        };

      } else {
        // Fallback: Random selection
        const winner = responses[Math.floor(Math.random() * responses.length)];
        return {
          winnerId: winner.playerId,
          reasoning: `Random pick: "${winner.card.text}"`
        };
      }

    } catch (error) {
      console.warn('[AICardPlayer] Error judging, using random:', error.message);
      const winner = responses[Math.floor(Math.random() * responses.length)];
      return {
        winnerId: winner.playerId,
        reasoning: `Random pick: "${winner.card.text}"`
      };
    }
  }

  /**
   * Use Ollama to select funniest card
   * @private
   */
  async _ollamaSelectFunny(promptText, responseCards, personality) {
    const prompt = `
You are playing Cards Against Humanity with a ${personality} personality.

Prompt: "${promptText}"

Your cards:
${responseCards.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}

Pick the FUNNIEST card (1-${responseCards.length}) that best completes the prompt.

Your response (just the number):`.trim();

    const response = await this.ollamaClient.chat({
      model: this.ollamaModel,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: {
        temperature: 0.8
      }
    });

    const answer = response.message.content.trim();
    const pickedNumber = parseInt(answer.match(/\d+/)?.[0] || '1');
    const cardIndex = Math.max(0, Math.min(pickedNumber - 1, responseCards.length - 1));

    return {
      cardIndex,
      reasoning: `Ollama picked: "${responseCards[cardIndex].text}"`
    };
  }

  /**
   * Choose wild card color based on hand composition
   * @private
   */
  _chooseWildColor(hand) {
    // Count colors in hand
    const colorCounts = {
      red: 0,
      blue: 0,
      green: 0,
      yellow: 0
    };

    hand.forEach(card => {
      if (card.color && colorCounts.hasOwnProperty(card.color)) {
        colorCounts[card.color]++;
      }
    });

    // Pick most common color
    const colors = Object.keys(colorCounts);
    const mostCommon = colors.reduce((a, b) =>
      colorCounts[a] > colorCounts[b] ? a : b
    );

    return mostCommon;
  }

  /**
   * Get think delay based on personality
   * @private
   */
  _getThinkDelay(personality) {
    // Chaos/meme bots think fast, serious bots think slow
    const delayMultiplier = {
      chaos: 0.5,
      meme: 0.7,
      friendly: 1.0,
      roast: 0.8,
      serious: 1.2
    };

    const multiplier = delayMultiplier[personality] || 1.0;
    const range = this.config.maxThinkDelay - this.config.minThinkDelay;
    const delay = this.config.minThinkDelay + (Math.random() * range);

    return delay * multiplier;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      playStyles: Object.keys(this.config.playStyles).length,
      ollamaAvailable: !!this.ollamaClient,
      thinkDelayRange: `${this.config.minThinkDelay}-${this.config.maxThinkDelay}ms`
    };
  }
}

module.exports = AICardPlayer;
