/**
 * Multiplayer WebSocket Handler
 *
 * Real-time WebSocket handler for multiplayer group sessions.
 * Connects users + AI bots via WebSockets for instant communication.
 *
 * Message Types:
 * - session_create: Create new session
 * - session_join: Join session
 * - session_leave: Leave session
 * - session_message: Post message
 * - message_reaction: React to message
 * - typing_indicator: User typing
 * - bot_spawn: Spawn AI bots
 *
 * Philosophy:
 * Real-time communication that makes groups feel alive.
 * Users + bots interact seamlessly.
 */

class MultiplayerWebSocketHandler {
  constructor({ db, botPool, session, participationEngine }) {
    this.db = db;
    this.botPool = botPool; // AI Bot Pool Manager
    this.session = session; // Multiplayer Group Session
    this.participationEngine = participationEngine; // AI Participation Engine

    // Track WebSocket to participant mapping
    this.wsToParticipant = new Map();
    this.participantToWs = new Map();

    // Recent messages per session (for context)
    this.sessionMessageHistory = new Map();

    console.log('[MultiplayerWebSocketHandler] Initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  onConnection(ws) {
    console.log('[MultiplayerWebSocketHandler] New connection');

    // Send welcome
    this.send(ws, {
      type: 'multiplayer_ready',
      message: 'Connected to multiplayer system',
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

      console.log(`[MultiplayerWebSocketHandler] Message: ${message.type}`);

      switch (message.type) {
        case 'session_create':
          await this.handleCreateSession(ws, message);
          break;

        case 'session_join':
          await this.handleJoinSession(ws, message);
          break;

        case 'session_leave':
          await this.handleLeaveSession(ws, message);
          break;

        case 'session_message':
          await this.handleSessionMessage(ws, message);
          break;

        case 'message_reaction':
          await this.handleMessageReaction(ws, message);
          break;

        case 'typing_indicator':
          this.handleTypingIndicator(ws, message);
          break;

        case 'bot_spawn':
          await this.handleBotSpawn(ws, message);
          break;

        case 'bot_remove':
          await this.handleBotRemove(ws, message);
          break;

        default:
          console.log(`[MultiplayerWebSocketHandler] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[MultiplayerWebSocketHandler] Message error:', error);
      this.send(ws, {
        type: 'error',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle session creation
   */
  async handleCreateSession(ws, message) {
    const { groupId, createdBy, sessionName, metadata } = message;

    const result = await this.session.createSession({
      groupId,
      createdBy,
      sessionName,
      metadata
    });

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    const sessionId = result.session.sessionId;

    // Initialize message history for session
    this.sessionMessageHistory.set(sessionId, []);

    // Send confirmation
    this.send(ws, {
      type: 'session_created',
      ...result,
      timestamp: Date.now()
    });

    console.log(`[MultiplayerWebSocketHandler] Session created: ${sessionId}`);
  }

  /**
   * Handle join session
   */
  async handleJoinSession(ws, message) {
    const { sessionId, participantId, participantType = 'human', participantData } = message;

    try {
      const result = await this.session.joinSession(
        sessionId,
        participantId,
        participantType,
        participantData
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
      this.registerConnection(ws, sessionId, participantId);

      // Register with session for broadcasting
      this.session.registerParticipantConnection(participantId, ws);

      // Get recent message history
      const recentMessages = this.sessionMessageHistory.get(sessionId) || [];

      // Send session state
      this.send(ws, {
        type: 'session_joined',
        ...result,
        recentMessages: recentMessages.slice(-20), // Last 20 messages
        timestamp: Date.now()
      });

      console.log(`[MultiplayerWebSocketHandler] ${participantId} joined ${sessionId}`);

      // Auto-spawn bots if needed
      if (participantType === 'human') {
        await this._autoSpawnBots(sessionId);
      }

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to join session: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle leave session
   */
  async handleLeaveSession(ws, message) {
    const { sessionId, participantId } = message;

    await this.session.leaveSession(sessionId, participantId);
    this.session.unregisterParticipantConnection(participantId);
    this.unregisterConnection(ws);

    this.send(ws, {
      type: 'session_left',
      sessionId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle session message
   */
  async handleSessionMessage(ws, message) {
    const { sessionId, participantId, text } = message;

    const result = await this.session.postMessage(sessionId, participantId, text, 'text');

    if (!result.success) {
      this.send(ws, {
        type: 'error',
        message: result.error,
        timestamp: Date.now()
      });
      return;
    }

    // Store in message history
    const history = this.sessionMessageHistory.get(sessionId) || [];
    history.push(result.message);

    // Keep last 50 messages
    if (history.length > 50) {
      history.shift();
    }
    this.sessionMessageHistory.set(sessionId, history);

    // Trigger AI bot participation
    await this.participationEngine.autoParticipate(
      sessionId,
      result.message,
      history.slice(-5) // Last 5 messages for context
    );
  }

  /**
   * Handle message reaction
   */
  async handleMessageReaction(ws, message) {
    const { sessionId, participantId, messageId, reaction } = message;

    await this.session.addReaction(sessionId, participantId, messageId, reaction);
  }

  /**
   * Handle typing indicator
   */
  handleTypingIndicator(ws, message) {
    const { sessionId, participantId, isTyping } = message;

    const info = this.wsToParticipant.get(ws);
    if (!info) return;

    // Broadcast typing indicator
    this.session.broadcastToSession(sessionId, {
      type: 'participant_typing',
      sessionId,
      participantId,
      isTyping,
      timestamp: Date.now()
    });
  }

  /**
   * Handle bot spawn request
   */
  async handleBotSpawn(ws, message) {
    const { sessionId, groupId, count = 1 } = message;

    const participants = this.session.getOnlineParticipants(sessionId);
    const humanCount = participants.filter(p => p.participantType === 'human').length;

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

    // Join bots to session
    for (const bot of result.bots || []) {
      await this.session.joinSession(sessionId, bot.botId, 'bot', {
        username: bot.username,
        metadata: { personality: bot.personality }
      });
    }

    this.send(ws, {
      type: 'bots_spawned',
      sessionId,
      botsSpawned: result.botsSpawned,
      bots: result.bots,
      timestamp: Date.now()
    });
  }

  /**
   * Handle bot remove request
   */
  async handleBotRemove(ws, message) {
    const { sessionId, botId } = message;

    await this.session.leaveSession(sessionId, botId);
    await this.botPool.removeBot(botId);

    this.send(ws, {
      type: 'bot_removed',
      sessionId,
      botId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(ws) {
    const info = this.wsToParticipant.get(ws);

    if (info) {
      const { sessionId, participantId } = info;

      // Leave session
      this.session.leaveSession(sessionId, participantId);
      this.session.unregisterParticipantConnection(participantId);

      // Clean up mappings
      this.unregisterConnection(ws);

      console.log(`[MultiplayerWebSocketHandler] ${participantId} disconnected from ${sessionId}`);
    }
  }

  /**
   * Register WebSocket connection
   * @private
   */
  registerConnection(ws, sessionId, participantId) {
    this.wsToParticipant.set(ws, { sessionId, participantId });
    this.participantToWs.set(participantId, ws);
  }

  /**
   * Unregister WebSocket connection
   * @private
   */
  unregisterConnection(ws) {
    const info = this.wsToParticipant.get(ws);
    if (info) {
      this.participantToWs.delete(info.participantId);
      this.wsToParticipant.delete(ws);
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
   * Auto-spawn bots for session
   * @private
   */
  async _autoSpawnBots(sessionId) {
    try {
      const sessionData = this.session.getSession(sessionId);
      if (!sessionData) return;

      const participants = this.session.getOnlineParticipants(sessionId);
      const humanCount = participants.filter(p => p.participantType === 'human').length;
      const botCount = participants.filter(p => p.participantType === 'bot').length;

      // Spawn bots if needed
      if (botCount < 2 && humanCount > 0) {
        const result = await this.botPool.spawnBotsForGroup(sessionData.groupId, humanCount);

        if (result.success && result.bots) {
          // Join bots to session
          for (const bot of result.bots) {
            await this.session.joinSession(sessionId, bot.botId, 'bot', {
              username: bot.username,
              metadata: { personality: bot.personality }
            });
          }

          console.log(`[MultiplayerWebSocketHandler] Auto-spawned ${result.botsSpawned} bots for session ${sessionId}`);
        }
      }
    } catch (error) {
      console.error('[MultiplayerWebSocketHandler] Error auto-spawning bots:', error);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      connections: this.wsToParticipant.size,
      activeSessions: this.sessionMessageHistory.size,
      ...this.session.getStats(),
      ...this.botPool.getStats()
    };
  }
}

module.exports = MultiplayerWebSocketHandler;
