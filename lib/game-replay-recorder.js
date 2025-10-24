/**
 * Game Replay Recorder
 *
 * Battle.net-style replay system for emoji card games.
 * Records every action like StarCraft .rep files.
 *
 * Philosophy:
 * "Every game tells a story. Capture it frame-by-frame."
 * - Blizzard Entertainment, Battle.net Design Doc (1996)
 *
 * Features:
 * - Records all player actions (card plays, draws, judge votes)
 * - Stores game metadata (players, mode, winner, duration)
 * - Compresses replay data (JSON → gzip)
 * - Links to match history
 * - Enables spectator playback
 *
 * Integration:
 * - CardGameEngine emits events
 * - ReplayRecorder captures to memory
 * - On game_ended, saves to database
 * - ReplayPlayer can load and playback
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class GameReplayRecorder extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;

    // Active recordings (gameId → replay object)
    this.activeRecordings = new Map();

    // Configuration
    this.config = {
      compression: options.compression !== false, // gzip by default
      maxReplaySize: options.maxReplaySize || 10 * 1024 * 1024, // 10MB limit
      saveToDatabase: options.saveToDatabase !== false,
      retentionDays: options.retentionDays || 90, // Keep replays 90 days
    };

    console.log('[GameReplayRecorder] Initialized (Battle.net style)');
  }

  /**
   * Start recording a new game
   * @param {string} gameId - Game ID to record
   * @param {object} gameMetadata - Initial game metadata
   */
  startRecording(gameId, gameMetadata = {}) {
    if (this.activeRecordings.has(gameId)) {
      console.warn(`[GameReplayRecorder] Already recording game ${gameId}`);
      return;
    }

    const replay = {
      gameId,
      replayId: `replay-${crypto.randomUUID()}`,
      version: '1.0.0', // Replay format version
      startTime: Date.now(),
      endTime: null,

      // Game metadata
      metadata: {
        gameMode: gameMetadata.gameMode,
        players: gameMetadata.players || [],
        createdBy: gameMetadata.createdBy,
        groupId: gameMetadata.groupId,
        customRules: gameMetadata.customRules || {}
      },

      // Action timeline
      actions: [],

      // Game state checkpoints (every N actions)
      checkpoints: [],
      checkpointInterval: 50, // Checkpoint every 50 actions

      // Statistics
      stats: {
        totalActions: 0,
        actionTypes: {},
        playerActions: {}
      }
    };

    this.activeRecordings.set(gameId, replay);

    // Record initial game state as checkpoint 0
    this.recordCheckpoint(gameId, {
      checkpoint: 0,
      timestamp: Date.now(),
      gameState: gameMetadata.initialState || {}
    });

    console.log(`[GameReplayRecorder] Started recording game ${gameId}`);
    this.emit('recording_started', { gameId, replayId: replay.replayId });
  }

  /**
   * Record a game action
   * @param {string} gameId - Game ID
   * @param {object} action - Action data
   */
  recordAction(gameId, action) {
    const replay = this.activeRecordings.get(gameId);
    if (!replay) {
      console.warn(`[GameReplayRecorder] No active recording for game ${gameId}`);
      return;
    }

    // Add timestamp if not present
    if (!action.timestamp) {
      action.timestamp = Date.now();
    }

    // Calculate relative timestamp (milliseconds since game start)
    action.relativeTime = action.timestamp - replay.startTime;

    // Add action to timeline
    replay.actions.push(action);
    replay.stats.totalActions++;

    // Track action types
    replay.stats.actionTypes[action.type] = (replay.stats.actionTypes[action.type] || 0) + 1;

    // Track player actions
    if (action.playerId) {
      replay.stats.playerActions[action.playerId] = (replay.stats.playerActions[action.playerId] || 0) + 1;
    }

    // Create checkpoint if interval reached
    if (replay.actions.length % replay.checkpointInterval === 0 && action.gameState) {
      this.recordCheckpoint(gameId, {
        checkpoint: replay.checkpoints.length,
        timestamp: action.timestamp,
        actionIndex: replay.actions.length - 1,
        gameState: action.gameState
      });
    }

    this.emit('action_recorded', { gameId, action });
  }

  /**
   * Record a game state checkpoint (for fast seeking)
   * @param {string} gameId - Game ID
   * @param {object} checkpoint - Checkpoint data
   */
  recordCheckpoint(gameId, checkpoint) {
    const replay = this.activeRecordings.get(gameId);
    if (!replay) return;

    replay.checkpoints.push(checkpoint);
  }

  /**
   * Stop recording and save replay
   * @param {string} gameId - Game ID
   * @param {object} finalMetadata - Final game data (winner, scores, etc.)
   */
  async stopRecording(gameId, finalMetadata = {}) {
    const replay = this.activeRecordings.get(gameId);
    if (!replay) {
      console.warn(`[GameReplayRecorder] No active recording for game ${gameId}`);
      return null;
    }

    // Finalize replay
    replay.endTime = Date.now();
    replay.duration = replay.endTime - replay.startTime;

    // Add final metadata
    replay.metadata = {
      ...replay.metadata,
      ...finalMetadata,
      winner: finalMetadata.winner,
      finalScores: finalMetadata.finalScores,
      vibeAnalysis: finalMetadata.vibeAnalysis,
      eloChanges: finalMetadata.eloChanges
    };

    // Compress replay data
    let replayData = JSON.stringify(replay);
    let compressed = false;

    if (this.config.compression) {
      try {
        const compressedBuffer = await gzip(replayData);
        if (compressedBuffer.length < replayData.length) {
          replayData = compressedBuffer.toString('base64');
          compressed = true;
        }
      } catch (error) {
        console.warn('[GameReplayRecorder] Compression failed, storing uncompressed:', error.message);
      }
    }

    // Check size limit
    const finalSize = Buffer.byteLength(replayData);
    if (finalSize > this.config.maxReplaySize) {
      console.warn(`[GameReplayRecorder] Replay too large (${finalSize} bytes), not saving`);
      this.activeRecordings.delete(gameId);
      return null;
    }

    // Save to database
    if (this.config.saveToDatabase && this.db) {
      try {
        await this._saveToDatabase(replay, replayData, compressed, finalSize);
      } catch (error) {
        console.error('[GameReplayRecorder] Failed to save replay to database:', error);
      }
    }

    // Remove from active recordings
    this.activeRecordings.delete(gameId);

    console.log(`[GameReplayRecorder] Stopped recording game ${gameId} (${finalSize} bytes, ${replay.stats.totalActions} actions)`);
    this.emit('recording_stopped', {
      gameId,
      replayId: replay.replayId,
      duration: replay.duration,
      actions: replay.stats.totalActions,
      size: finalSize
    });

    return {
      replayId: replay.replayId,
      duration: replay.duration,
      actions: replay.stats.totalActions,
      size: finalSize,
      compressed
    };
  }

  /**
   * Save replay to database
   * @private
   */
  async _saveToDatabase(replay, replayData, compressed, size) {
    await this.db.query(`
      INSERT INTO game_replays (
        replay_id,
        game_id,
        game_mode,
        players,
        winner,
        duration_ms,
        action_count,
        replay_data,
        compressed,
        size_bytes,
        metadata,
        created_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW() + INTERVAL '${this.config.retentionDays} days')
    `, [
      replay.replayId,
      replay.gameId,
      replay.metadata.gameMode,
      JSON.stringify(replay.metadata.players),
      replay.metadata.winner?.playerId || null,
      replay.duration,
      replay.stats.totalActions,
      replayData,
      compressed,
      size,
      JSON.stringify(replay.metadata)
    ]);

    console.log(`[GameReplayRecorder] Saved replay ${replay.replayId} to database`);
  }

  /**
   * Load replay from database
   * @param {string} replayId - Replay ID
   * @returns {object} - Replay object
   */
  async loadReplay(replayId) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    const result = await this.db.query(
      'SELECT * FROM game_replays WHERE replay_id = $1',
      [replayId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Replay not found: ${replayId}`);
    }

    const row = result.rows[0];
    let replayData = row.replay_data;

    // Decompress if needed
    if (row.compressed) {
      const buffer = Buffer.from(replayData, 'base64');
      const decompressed = await gunzip(buffer);
      replayData = decompressed.toString('utf8');
    }

    const replay = JSON.parse(replayData);

    console.log(`[GameReplayRecorder] Loaded replay ${replayId} (${row.action_count} actions)`);

    return replay;
  }

  /**
   * Get replay metadata (without full action timeline)
   * @param {string} replayId - Replay ID
   */
  async getReplayMetadata(replayId) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    const result = await this.db.query(`
      SELECT
        replay_id,
        game_id,
        game_mode,
        players,
        winner,
        duration_ms,
        action_count,
        size_bytes,
        compressed,
        metadata,
        created_at
      FROM game_replays
      WHERE replay_id = $1
    `, [replayId]);

    if (result.rows.length === 0) {
      throw new Error(`Replay not found: ${replayId}`);
    }

    return result.rows[0];
  }

  /**
   * List replays for a player
   * @param {string} playerId - Player ID
   * @param {number} limit - Max replays to return
   */
  async getPlayerReplays(playerId, limit = 50) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    const result = await this.db.query(`
      SELECT
        replay_id,
        game_id,
        game_mode,
        players,
        winner,
        duration_ms,
        action_count,
        created_at
      FROM game_replays
      WHERE players::text LIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [`%${playerId}%`, limit]);

    return result.rows;
  }

  /**
   * Delete expired replays
   */
  async cleanupExpiredReplays() {
    if (!this.db) return;

    const result = await this.db.query(`
      DELETE FROM game_replays
      WHERE expires_at < NOW()
      RETURNING replay_id
    `);

    console.log(`[GameReplayRecorder] Deleted ${result.rowCount} expired replays`);

    return result.rowCount;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      activeRecordings: this.activeRecordings.size,
      config: this.config
    };
  }
}

module.exports = GameReplayRecorder;
