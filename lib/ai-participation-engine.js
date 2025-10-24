/**
 * AI Participation Engine
 *
 * Makes AI bots participate in group sessions like real users.
 * Context-aware responses, realistic delays, personality-driven behavior.
 *
 * Features:
 * - Auto-comment on posts (using Ollama/GPT)
 * - Realistic typing indicators + delays
 * - Context-aware responses (reads conversation history)
 * - Personality-driven behavior (friendly, roast, meme, etc.)
 * - "AWOL" mode switching (friendly → roast)
 * - Reactions (emojis, likes)
 *
 * Philosophy:
 * Bots should feel human - not perfect, sometimes funny, sometimes chaos.
 */

class AIParticipationEngine {
  constructor(options = {}) {
    this.botPool = options.botPool; // AI Bot Pool Manager
    this.session = options.session; // Multiplayer Group Session
    this.ollamaClient = options.ollamaClient;
    this.ollamaModel = options.ollamaModel || 'mistral:latest';

    this.config = {
      // Response generation
      maxResponseLength: options.maxResponseLength || 200,
      contextWindow: options.contextWindow || 5, // Last 5 messages

      // Personality prompts
      personalityPrompts: {
        friendly: 'You are a friendly, helpful group member. Keep responses short, casual, and supportive.',
        meme: 'You are a meme lord. Use casual slang, emojis (💀, 🔥, fr fr, no cap), keep it funny and light. Keep responses very short.',
        roast: 'You are sarcastic and love to roast people. Be witty but not mean. Use humor. Keep it short.',
        serious: 'You are professional and straight to the point. No emojis, no slang. Brief and clear.',
        chaos: 'You are unpredictable and chaotic. Mix everything - sometimes nice, sometimes roast, random emojis. Keep it wild but short.'
      },

      // Reaction emojis
      reactionEmojis: [
        '👍', '❤️', '😂', '🔥', '💀', '✨', '🎯', '💯',
        '😎', '🤔', '👀', '💪', '🙌', '⚡', '🚀'
      ],

      // AWOL triggers (bot switches personality)
      awolTriggers: [
        'your code sucks',
        'you\'re stupid',
        'this is dumb',
        'terrible',
        'worst',
        'useless'
      ]
    };

    // Message queue per bot (to avoid spamming)
    this.botMessageQueues = new Map();

    console.log('[AIParticipationEngine] Initialized');
  }

  /**
   * Bot should respond to message?
   */
  shouldBotRespond(botId, message, participants) {
    const bot = this.botPool.getBot(botId);
    if (!bot) return false;

    // Always respond if directly mentioned
    if (message.includes(`@${bot.username}`) || message.includes(bot.username)) {
      return true;
    }

    // Check bot's reaction chance
    return this.botPool.shouldBotReact(botId);
  }

  /**
   * Generate bot response to message
   */
  async generateBotResponse(botId, message, context = {}) {
    try {
      const bot = this.botPool.getBot(botId);
      if (!bot) {
        return { success: false, error: 'Bot not found' };
      }

      // Check if bot should go AWOL
      if (this.botPool.shouldBotGoAWOL(botId, message)) {
        // Switch personality
        bot.personality = 'roast';
        bot.status = 'awol';
        this.botPool.updateBotActivity(botId, { type: 'awol' });

        console.log(`[AIParticipationEngine] Bot ${bot.username} went AWOL!`);
      }

      // Build context from conversation history
      const conversationContext = this._buildConversationContext(context.recentMessages || []);

      // Generate response
      const response = await this._generateAIResponse(
        bot.personality,
        message,
        conversationContext,
        bot.username
      );

      return {
        success: true,
        response,
        bot,
        personality: bot.personality
      };

    } catch (error) {
      console.error('[AIParticipationEngine] Error generating response:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bot posts response to session
   */
  async botPostToSession(sessionId, botId, message, context = {}) {
    try {
      // Generate response
      const result = await this.generateBotResponse(botId, message, context);

      if (!result.success) {
        return result;
      }

      const bot = result.bot;

      // Simulate typing delay (realistic)
      const typingDelay = this.botPool.getBotResponseDelay();

      // Send typing indicator
      this.session.broadcastToSession(sessionId, {
        type: 'participant_typing',
        sessionId,
        participantId: bot.botId,
        username: bot.username,
        isTyping: true,
        timestamp: Date.now()
      });

      // Wait for typing delay
      await this._sleep(typingDelay);

      // Post message
      await this.session.postMessage(
        sessionId,
        bot.botId,
        result.response,
        'text'
      );

      // Update bot activity
      this.botPool.updateBotActivity(bot.botId, { type: 'message' });

      // Stop typing indicator
      this.session.broadcastToSession(sessionId, {
        type: 'participant_typing',
        sessionId,
        participantId: bot.botId,
        username: bot.username,
        isTyping: false,
        timestamp: Date.now()
      });

      return {
        success: true,
        response: result.response,
        bot
      };

    } catch (error) {
      console.error('[AIParticipationEngine] Error bot posting:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bot reacts to message
   */
  async botReactToMessage(sessionId, botId, messageId) {
    try {
      const bot = this.botPool.getBot(botId);
      if (!bot) {
        return { success: false, error: 'Bot not found' };
      }

      // Select random emoji
      const emoji = this._selectRandomEmoji();

      // Add reaction
      await this.session.addReaction(sessionId, bot.botId, messageId, emoji);

      // Update bot activity
      this.botPool.updateBotActivity(bot.botId, { type: 'reaction' });

      return {
        success: true,
        emoji,
        bot
      };

    } catch (error) {
      console.error('[AIParticipationEngine] Error bot reacting:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Auto-participate in session (bots respond to messages)
   */
  async autoParticipate(sessionId, newMessage, recentMessages = []) {
    try {
      // Get session
      const session = this.session.getSession(sessionId);
      if (!session) return;

      // Get online bot participants
      const participants = this.session.getOnlineParticipants(sessionId);
      const bots = participants.filter(p => p.participantType === 'bot');

      if (bots.length === 0) return;

      // Decide which bots should respond
      const respondingBots = [];

      for (const bot of bots) {
        if (this.shouldBotRespond(bot.participantId, newMessage.message, participants)) {
          respondingBots.push(bot);
        }
      }

      // Randomly select 1-2 bots to respond (not all)
      const maxResponders = Math.min(respondingBots.length, Math.random() > 0.5 ? 2 : 1);
      const selectedBots = respondingBots.slice(0, maxResponders);

      // Bots respond sequentially (not simultaneously - more realistic)
      for (const bot of selectedBots) {
        await this.botPostToSession(sessionId, bot.participantId, newMessage.message, {
          recentMessages
        });

        // Small delay between bot responses
        await this._sleep(Math.random() * 2000 + 1000); // 1-3 seconds
      }

      // Other bots might just react
      const reactingBots = bots.filter(b => !selectedBots.includes(b));
      for (const bot of reactingBots) {
        if (Math.random() < 0.3) { // 30% chance to react
          await this.botReactToMessage(sessionId, bot.participantId, newMessage.messageId);
        }
      }

      return {
        success: true,
        respondedBots: selectedBots.length,
        reactedBots: reactingBots.length
      };

    } catch (error) {
      console.error('[AIParticipationEngine] Error auto-participating:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate AI response using Ollama
   * @private
   */
  async _generateAIResponse(personality, message, context, botUsername) {
    // Fallback to simple responses if Ollama not available
    if (!this.ollamaClient) {
      return this._generateFallbackResponse(personality, message);
    }

    try {
      const systemPrompt = this.config.personalityPrompts[personality] || this.config.personalityPrompts.friendly;

      const prompt = `
${systemPrompt}

Conversation context:
${context}

User said: "${message}"

Your response (keep it under 50 words, very casual):
`.trim();

      const response = await this.ollamaClient.chat({
        model: this.ollamaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: {
          temperature: 0.9,
          max_tokens: this.config.maxResponseLength
        }
      });

      let botResponse = response.message.content.trim();

      // Truncate if too long
      if (botResponse.length > this.config.maxResponseLength) {
        botResponse = botResponse.substring(0, this.config.maxResponseLength) + '...';
      }

      return botResponse;

    } catch (error) {
      console.warn('[AIParticipationEngine] Ollama error, using fallback:', error.message);
      return this._generateFallbackResponse(personality, message);
    }
  }

  /**
   * Generate fallback response (no Ollama)
   * @private
   */
  _generateFallbackResponse(personality, message) {
    const responses = {
      friendly: [
        'sounds good!',
        'i agree',
        'that makes sense',
        'yeah totally',
        'for sure!'
      ],
      meme: [
        'lol fr fr',
        'bruh 💀',
        'no cap',
        'that\'s fire 🔥',
        'yo this is wild'
      ],
      roast: [
        'bruh that\'s mid',
        'lol sure buddy',
        'okay whatever you say',
        'not even close',
        'yikes'
      ],
      serious: [
        'Understood.',
        'Noted.',
        'Makes sense.',
        'Agreed.',
        'Correct.'
      ],
      chaos: [
        'LMAO WHAT 😂',
        'bruh... okay????',
        'yo this is random 🎲',
        'CHAOS MODE 🔥💀',
        'idk man seems wild'
      ]
    };

    const list = responses[personality] || responses.friendly;
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Build conversation context
   * @private
   */
  _buildConversationContext(recentMessages) {
    if (!recentMessages || recentMessages.length === 0) {
      return 'No previous context.';
    }

    const contextMessages = recentMessages.slice(-this.config.contextWindow);

    return contextMessages
      .map(msg => `${msg.username}: ${msg.message}`)
      .join('\n');
  }

  /**
   * Select random emoji
   * @private
   */
  _selectRandomEmoji() {
    return this.config.reactionEmojis[
      Math.floor(Math.random() * this.config.reactionEmojis.length)
    ];
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
      totalBots: this.botPool.botRegistry.size,
      personalities: Object.keys(this.config.personalityPrompts),
      reactionEmojis: this.config.reactionEmojis.length,
      ollamaAvailable: !!this.ollamaClient
    };
  }
}

module.exports = AIParticipationEngine;
