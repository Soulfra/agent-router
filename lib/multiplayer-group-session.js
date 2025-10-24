/**
 * Multiplayer Group Session
 *
 * Like chess.com rounds but for community groups.
 * Manages real-time sessions where users + AI bots participate together.
 *
 * Features:
 * - Session state (active, paused, ended)
 * - Participant tracking (users + bots)
 * - Real-time message broadcasting
 * - Presence management (who's online)
 * - Session analytics (engagement, activity)
 *
 * Use Cases:
 * - Group chat sessions
 * - Forum discussions
 * - Live events
 * - Gaming sessions
 */

const crypto = require('crypto');

class MultiplayerGroupSession {
  constructor(options = {}) {
    this.db = options.db;
    this.botPool = options.botPool; // AI Bot Pool Manager
    this.broadcastCallback = options.broadcastCallback; // WebSocket broadcast function

    // Active sessions
    // sessionId -> session data
    this.sessions = new Map();

    // Participants per session
    // sessionId -> Map(participantId -> participant data)
    this.sessionParticipants = new Map();

    // WebSocket connections
    // participantId -> WebSocket
    this.participantConnections = new Map();

    this.config = {
      maxParticipantsPerSession: options.maxParticipantsPerSession || 100,
      sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
      minBotsPerSession: options.minBotsPerSession || 2,
      maxBotsPerSession: options.maxBotsPerSession || 5
    };

    console.log('[MultiplayerGroupSession] Initialized');
  }

  /**
   * Create new session
   */
  async createSession({ groupId, createdBy, sessionName, metadata = {} }) {
    try {
      const sessionId = `session-${crypto.randomUUID()}`;

      const session = {
        sessionId,
        groupId,
        createdBy,
        sessionName: sessionName || `Session ${new Date().toISOString()}`,
        status: 'active', // active, paused, ended
        createdAt: Date.now(),
        startedAt: Date.now(),
        endedAt: null,
        metadata,
        stats: {
          totalMessages: 0,
          totalParticipants: 0,
          totalBots: 0,
          totalReactions: 0
        }
      };

      // Store session
      this.sessions.set(sessionId, session);
      this.sessionParticipants.set(sessionId, new Map());

      // Store in database
      if (this.db) {
        await this._storeSessionInDB(session);
      }

      console.log(`[MultiplayerGroupSession] Created session: ${sessionId} for group ${groupId}`);

      return {
        success: true,
        session
      };

    } catch (error) {
      console.error('[MultiplayerGroupSession] Error creating session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Join session
   */
  async joinSession(sessionId, participantId, participantType = 'human', participantData = {}) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (session.status !== 'active') {
        return { success: false, error: 'Session is not active' };
      }

      const participants = this.sessionParticipants.get(sessionId);

      // Check if already joined
      if (participants.has(participantId)) {
        return { success: false, error: 'Already in session' };
      }

      // Check participant limit
      if (participants.size >= this.config.maxParticipantsPerSession) {
        return { success: false, error: 'Session is full' };
      }

      const participant = {
        participantId,
        participantType, // 'human' or 'bot'
        username: participantData.username || `User_${participantId.slice(0, 8)}`,
        joinedAt: Date.now(),
        status: 'online', // online, idle, offline
        metadata: participantData.metadata || {}
      };

      // Add participant
      participants.set(participantId, participant);

      // Update stats
      session.stats.totalParticipants++;
      if (participantType === 'bot') {
        session.stats.totalBots++;
      }

      console.log(`[MultiplayerGroupSession] ${participant.username} joined session ${sessionId}`);

      // Broadcast join event
      this.broadcastToSession(sessionId, {
        type: 'participant_joined',
        sessionId,
        participant,
        onlineCount: this._getOnlineCount(sessionId),
        timestamp: Date.now()
      });

      return {
        success: true,
        session,
        participant,
        onlineParticipants: this.getOnlineParticipants(sessionId)
      };

    } catch (error) {
      console.error('[MultiplayerGroupSession] Error joining session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Leave session
   */
  async leaveSession(sessionId, participantId) {
    try {
      const participants = this.sessionParticipants.get(sessionId);
      if (!participants || !participants.has(participantId)) {
        return { success: false, error: 'Not in session' };
      }

      const participant = participants.get(participantId);
      participant.status = 'offline';
      participant.leftAt = Date.now();

      // Remove from participants (keep record for analytics)
      participants.delete(participantId);

      // Remove WebSocket connection
      this.participantConnections.delete(participantId);

      console.log(`[MultiplayerGroupSession] ${participant.username} left session ${sessionId}`);

      // Broadcast leave event
      this.broadcastToSession(sessionId, {
        type: 'participant_left',
        sessionId,
        participantId,
        username: participant.username,
        onlineCount: this._getOnlineCount(sessionId),
        timestamp: Date.now()
      });

      return { success: true, participant };

    } catch (error) {
      console.error('[MultiplayerGroupSession] Error leaving session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Post message to session
   */
  async postMessage(sessionId, participantId, message, messageType = 'text') {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const participants = this.sessionParticipants.get(sessionId);
      const participant = participants?.get(participantId);

      if (!participant) {
        return { success: false, error: 'Not in session' };
      }

      const messageId = `msg-${crypto.randomUUID()}`;
      const messageData = {
        messageId,
        sessionId,
        participantId,
        participantType: participant.participantType,
        username: participant.username,
        message,
        messageType, // text, image, reaction
        createdAt: Date.now(),
        reactions: []
      };

      // Update stats
      session.stats.totalMessages++;

      // Store message in database
      if (this.db) {
        await this._storeMessageInDB(messageData);
      }

      // Broadcast message
      this.broadcastToSession(sessionId, {
        type: 'session_message',
        ...messageData,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: messageData
      };

    } catch (error) {
      console.error('[MultiplayerGroupSession] Error posting message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(sessionId, participantId, messageId, reaction) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const participants = this.sessionParticipants.get(sessionId);
      const participant = participants?.get(participantId);

      if (!participant) {
        return { success: false, error: 'Not in session' };
      }

      const reactionData = {
        reactionId: `reaction-${crypto.randomUUID()}`,
        sessionId,
        messageId,
        participantId,
        username: participant.username,
        reaction, // emoji or text
        createdAt: Date.now()
      };

      // Update stats
      session.stats.totalReactions++;

      // Store reaction in database
      if (this.db) {
        await this._storeReactionInDB(reactionData);
      }

      // Broadcast reaction
      this.broadcastToSession(sessionId, {
        type: 'message_reaction',
        ...reactionData,
        timestamp: Date.now()
      });

      return {
        success: true,
        reaction: reactionData
      };

    } catch (error) {
      console.error('[MultiplayerGroupSession] Error adding reaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update participant status (online, idle, offline)
   */
  updateParticipantStatus(sessionId, participantId, status) {
    const participants = this.sessionParticipants.get(sessionId);
    const participant = participants?.get(participantId);

    if (!participant) return { success: false, error: 'Not in session' };

    participant.status = status;
    participant.lastActivityAt = Date.now();

    // Broadcast status change
    this.broadcastToSession(sessionId, {
      type: 'participant_status',
      sessionId,
      participantId,
      username: participant.username,
      status,
      timestamp: Date.now()
    });

    return { success: true, participant };
  }

  /**
   * Get online participants
   */
  getOnlineParticipants(sessionId) {
    const participants = this.sessionParticipants.get(sessionId);
    if (!participants) return [];

    return Array.from(participants.values()).filter(p => p.status === 'online');
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * End session
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.status = 'ended';
    session.endedAt = Date.now();

    // Broadcast session ended
    this.broadcastToSession(sessionId, {
      type: 'session_ended',
      sessionId,
      stats: session.stats,
      timestamp: Date.now()
    });

    // Remove all participants
    const participants = this.sessionParticipants.get(sessionId);
    if (participants) {
      for (const participantId of participants.keys()) {
        await this.leaveSession(sessionId, participantId);
      }
    }

    console.log(`[MultiplayerGroupSession] Ended session: ${sessionId}`);

    return { success: true, session };
  }

  /**
   * Broadcast message to all participants in session
   */
  broadcastToSession(sessionId, message) {
    const participants = this.sessionParticipants.get(sessionId);
    if (!participants) return;

    for (const participantId of participants.keys()) {
      const ws = this.participantConnections.get(participantId);
      if (ws && ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    }

    // Also call external broadcast callback if provided
    if (this.broadcastCallback) {
      this.broadcastCallback(sessionId, message);
    }
  }

  /**
   * Register WebSocket connection for participant
   */
  registerParticipantConnection(participantId, ws) {
    this.participantConnections.set(participantId, ws);
  }

  /**
   * Unregister WebSocket connection
   */
  unregisterParticipantConnection(participantId) {
    this.participantConnections.delete(participantId);
  }

  /**
   * Get stats for session
   */
  getSessionStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const participants = this.sessionParticipants.get(sessionId);
    const onlineCount = this._getOnlineCount(sessionId);

    return {
      ...session.stats,
      currentParticipants: participants?.size || 0,
      onlineParticipants: onlineCount,
      duration: Date.now() - session.startedAt,
      messagesPerMinute: this._calculateMessagesPerMinute(session)
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get online count
   * @private
   */
  _getOnlineCount(sessionId) {
    const participants = this.sessionParticipants.get(sessionId);
    if (!participants) return 0;

    return Array.from(participants.values()).filter(p => p.status === 'online').length;
  }

  /**
   * Calculate messages per minute
   * @private
   */
  _calculateMessagesPerMinute(session) {
    const durationMinutes = (Date.now() - session.startedAt) / 60000;
    if (durationMinutes === 0) return 0;

    return (session.stats.totalMessages / durationMinutes).toFixed(2);
  }

  /**
   * Store session in database
   * @private
   */
  async _storeSessionInDB(session) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO multiplayer_sessions (
          session_id,
          group_id,
          created_by,
          session_name,
          status,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        session.sessionId,
        session.groupId,
        session.createdBy,
        session.sessionName,
        session.status,
        JSON.stringify(session.metadata)
      ]);

    } catch (error) {
      console.warn('[MultiplayerGroupSession] Failed to store session:', error.message);
    }
  }

  /**
   * Store message in database
   * @private
   */
  async _storeMessageInDB(message) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO session_messages (
          message_id,
          session_id,
          participant_id,
          participant_type,
          username,
          message,
          message_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        message.messageId,
        message.sessionId,
        message.participantId,
        message.participantType,
        message.username,
        message.message,
        message.messageType
      ]);

    } catch (error) {
      console.warn('[MultiplayerGroupSession] Failed to store message:', error.message);
    }
  }

  /**
   * Store reaction in database
   * @private
   */
  async _storeReactionInDB(reaction) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO message_reactions (
          reaction_id,
          session_id,
          message_id,
          participant_id,
          username,
          reaction,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        reaction.reactionId,
        reaction.sessionId,
        reaction.messageId,
        reaction.participantId,
        reaction.username,
        reaction.reaction
      ]);

    } catch (error) {
      console.warn('[MultiplayerGroupSession] Failed to store reaction:', error.message);
    }
  }
}

module.exports = MultiplayerGroupSession;
