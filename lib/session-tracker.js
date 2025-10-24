/**
 * Session Tracker - "UPC Pairing" for visit duration tracking
 *
 * Tracks user sessions from connect → disconnect with:
 * - Duration tracking
 * - Click/interaction heatmaps
 * - Room-based presence (like Twitch/YouTube viewers)
 * - Song listening history
 */

const crypto = require('crypto');

class SessionTracker {
  constructor(db) {
    this.db = db;
    this.activeSessions = new Map(); // sessionId -> session data
    this.roomOccupancy = new Map(); // roomName -> Set of sessionIds
  }

  /**
   * Start a new session when user connects
   */
  startSession(deviceId, userId = null, page = 'unknown', metadata = {}) {
    const sessionId = crypto.randomUUID();

    const session = {
      sessionId,
      deviceId,
      userId,
      page,
      startTime: Date.now(),
      lastActivity: Date.now(),
      interactions: [],
      currentRoom: null,
      metadata: {
        userAgent: metadata.userAgent || null,
        referrer: metadata.referrer || null,
        ip: metadata.ip || null
      }
    };

    this.activeSessions.set(sessionId, session);

    console.log(`📍 Session started: ${sessionId.slice(0, 8)} on ${page}`);

    return sessionId;
  }

  /**
   * Join a room (like lofi streaming room)
   */
  joinRoom(sessionId, roomName) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    // Leave previous room if any
    if (session.currentRoom) {
      this.leaveRoom(sessionId);
    }

    // Join new room
    if (!this.roomOccupancy.has(roomName)) {
      this.roomOccupancy.set(roomName, new Set());
    }

    this.roomOccupancy.get(roomName).add(sessionId);
    session.currentRoom = roomName;
    session.roomJoinedAt = Date.now();

    console.log(`🚪 Session ${sessionId.slice(0, 8)} joined room: ${roomName} (${this.getRoomCount(roomName)} viewers)`);

    return {
      success: true,
      roomName,
      viewerCount: this.getRoomCount(roomName)
    };
  }

  /**
   * Leave a room
   */
  leaveRoom(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.currentRoom) return false;

    const roomName = session.currentRoom;
    const room = this.roomOccupancy.get(roomName);

    if (room) {
      room.delete(sessionId);

      // Clean up empty rooms
      if (room.size === 0) {
        this.roomOccupancy.delete(roomName);
      }
    }

    const timeInRoom = Date.now() - session.roomJoinedAt;
    session.currentRoom = null;
    session.roomJoinedAt = null;

    console.log(`🚪 Session ${sessionId.slice(0, 8)} left room: ${roomName} (${timeInRoom}ms)`);

    return { success: true, timeInRoom };
  }

  /**
   * Get viewer count for a room
   */
  getRoomCount(roomName) {
    const room = this.roomOccupancy.get(roomName);
    return room ? room.size : 0;
  }

  /**
   * Get all viewers in a room
   */
  getRoomViewers(roomName) {
    const room = this.roomOccupancy.get(roomName);
    if (!room) return [];

    return Array.from(room).map(sessionId => {
      const session = this.activeSessions.get(sessionId);
      return {
        sessionId,
        deviceId: session.deviceId,
        userId: session.userId,
        joinedAt: session.roomJoinedAt,
        lastActivity: session.lastActivity
      };
    });
  }

  /**
   * Record an interaction (click, hover, scroll)
   */
  recordInteraction(sessionId, interactionType, data = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    const interaction = {
      type: interactionType,
      timestamp: Date.now(),
      data
    };

    session.interactions.push(interaction);
    session.lastActivity = Date.now();

    // Keep only last 100 interactions to prevent memory bloat
    if (session.interactions.length > 100) {
      session.interactions.shift();
    }

    return true;
  }

  /**
   * End session and save to database
   */
  async endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    // Leave room if still in one
    if (session.currentRoom) {
      this.leaveRoom(sessionId);
    }

    const endTime = Date.now();
    const duration = endTime - session.startTime;

    // Save to database
    try {
      await this.db.query(`
        INSERT INTO visit_sessions (
          session_id,
          device_id,
          user_id,
          page,
          start_time,
          end_time,
          duration_ms,
          total_interactions,
          interaction_data,
          metadata
        )
        VALUES ($1, $2, $3, $4, to_timestamp($5/1000.0), to_timestamp($6/1000.0), $7, $8, $9, $10)
      `, [
        session.sessionId,
        session.deviceId,
        session.userId,
        session.page,
        session.startTime,
        endTime,
        duration,
        session.interactions.length,
        JSON.stringify(session.interactions),
        JSON.stringify(session.metadata)
      ]);

      console.log(`💾 Session saved: ${sessionId.slice(0, 8)} (${(duration / 1000).toFixed(1)}s, ${session.interactions.length} interactions)`);
    } catch (err) {
      console.error('❌ Failed to save session:', err.message);
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    return {
      sessionId,
      duration,
      interactions: session.interactions.length,
      page: session.page
    };
  }

  /**
   * Update session activity (heartbeat)
   */
  updateActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Get session stats
   */
  getSessionStats(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      deviceId: session.deviceId,
      page: session.page,
      currentRoom: session.currentRoom,
      duration: Date.now() - session.startTime,
      interactions: session.interactions.length,
      lastActivity: Date.now() - session.lastActivity
    };
  }

  /**
   * Get all active sessions count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Get all rooms and their viewer counts
   */
  getAllRooms() {
    const rooms = [];
    for (const [roomName, viewers] of this.roomOccupancy.entries()) {
      rooms.push({
        name: roomName,
        viewers: viewers.size
      });
    }
    return rooms;
  }

  /**
   * Clean up stale sessions (no activity for configured timeout, default 8 hours)
   */
  async cleanupStaleSessions() {
    const now = Date.now();
    const timeoutHours = parseInt(process.env.SESSION_TIMEOUT_HOURS) || 8; // Default 8 hours
    const timeout = timeoutHours * 60 * 60 * 1000;

    const staleSessionIds = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > timeout) {
        staleSessionIds.push(sessionId);
      }
    }

    for (const sessionId of staleSessionIds) {
      console.log(`🧹 Cleaning up stale session: ${sessionId.slice(0, 8)} (inactive for ${timeoutHours}h)`);
      await this.endSession(sessionId);
    }

    if (staleSessionIds.length > 0) {
      console.log(`🧹 Cleaned up ${staleSessionIds.length} stale session(s) (timeout: ${timeoutHours}h)`);
    }

    return staleSessionIds.length;
  }
}

module.exports = SessionTracker;
