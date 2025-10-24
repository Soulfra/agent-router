/**
 * Workspace Session Manager
 *
 * Manages collaborative workspace sessions where both human users and AI agents
 * can work together on the same codebase in real-time.
 *
 * Think of this like Google Docs meets VSCode meets pair programming
 *
 * Features:
 * - Dual authentication (human + AI agent)
 * - Real-time presence tracking
 * - File access control
 * - Activity broadcasting
 * - Voice channel management
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class WorkspaceSession extends EventEmitter {
  constructor({ db, sessionOrchestrator = null, roomManager = null }) {
    super();

    this.db = db;
    this.sessionOrchestrator = sessionOrchestrator;
    this.roomManager = roomManager;

    // Active workspaces
    this.workspaces = new Map();

    // Connected participants (WebSocket clients)
    this.participants = new Map();

    // File locks (who's editing what)
    this.fileLocks = new Map();

    // Cursor positions (live tracking)
    this.cursors = new Map();

    console.log('[WorkspaceSession] Initialized');
  }

  /**
   * Create a new collaborative workspace
   *
   * @param {object} options - Workspace configuration
   * @returns {Promise<object>} - Workspace info
   */
  async createWorkspace({
    userId,
    workspaceName,
    projectPath = null,
    inviteAgentId = null, // AI agent to invite (optional)
    metadata = {}
  }) {
    const workspaceId = crypto.randomUUID();

    const workspace = {
      workspaceId,
      workspaceName,
      projectPath,
      createdBy: userId,
      createdAt: new Date(),
      participants: [
        {
          participantId: userId,
          type: 'human',
          role: 'owner',
          joinedAt: new Date(),
          presence: 'online'
        }
      ],
      fileState: new Map(), // Current file contents
      openFiles: [], // Which files are open
      activeFile: null, // Currently focused file
      voiceChannel: {
        enabled: false,
        participants: []
      },
      metadata
    };

    // Add AI agent if invited
    if (inviteAgentId) {
      workspace.participants.push({
        participantId: inviteAgentId,
        type: 'agent',
        role: 'collaborator',
        joinedAt: new Date(),
        presence: 'online'
      });
    }

    this.workspaces.set(workspaceId, workspace);

    // Store in database
    if (this.db) {
      await this.db.query(`
        INSERT INTO workspace_sessions (
          workspace_id,
          workspace_name,
          project_path,
          created_by,
          created_at,
          participants,
          metadata
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6)
      `, [
        workspaceId,
        workspaceName,
        projectPath,
        userId,
        JSON.stringify(workspace.participants),
        JSON.stringify(metadata)
      ]);
    }

    console.log(`[WorkspaceSession] Created workspace: ${workspaceName} (${workspaceId})`);

    // Emit event
    this.emit('workspace_created', workspace);

    return {
      workspaceId,
      workspaceName,
      participants: workspace.participants,
      inviteUrl: this._generateInviteUrl(workspaceId)
    };
  }

  /**
   * Join an existing workspace
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} participantId - User or agent ID
   * @param {string} type - 'human' or 'agent'
   * @returns {Promise<object>} - Workspace state
   */
  async joinWorkspace(workspaceId, participantId, type = 'human') {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      // Try loading from database
      if (this.db) {
        const result = await this.db.query(
          'SELECT * FROM workspace_sessions WHERE workspace_id = $1',
          [workspaceId]
        );

        if (result.rows.length === 0) {
          throw new Error(`Workspace not found: ${workspaceId}`);
        }

        // Load into memory
        const row = result.rows[0];
        this.workspaces.set(workspaceId, {
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          projectPath: row.project_path,
          createdBy: row.created_by,
          createdAt: row.created_at,
          participants: JSON.parse(row.participants || '[]'),
          fileState: new Map(),
          openFiles: [],
          activeFile: null,
          voiceChannel: {
            enabled: false,
            participants: []
          },
          metadata: JSON.parse(row.metadata || '{}')
        });
      } else {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
    }

    const ws = this.workspaces.get(workspaceId);

    // Check if already a participant
    const existing = ws.participants.find(p => p.participantId === participantId);
    if (existing) {
      existing.presence = 'online';
      existing.joinedAt = new Date();
    } else {
      // Add new participant
      ws.participants.push({
        participantId,
        type,
        role: 'collaborator',
        joinedAt: new Date(),
        presence: 'online'
      });
    }

    // Update database
    if (this.db) {
      await this.db.query(
        `UPDATE workspace_sessions
         SET participants = $1, updated_at = NOW()
         WHERE workspace_id = $2`,
        [JSON.stringify(ws.participants), workspaceId]
      );
    }

    console.log(`[WorkspaceSession] ${type} ${participantId} joined workspace ${workspaceId}`);

    // Broadcast to other participants
    this.broadcastToWorkspace(workspaceId, {
      type: 'participant_joined',
      participantId,
      participantType: type,
      timestamp: Date.now()
    }, participantId);

    // Emit event
    this.emit('participant_joined', {
      workspaceId,
      participantId,
      type
    });

    return {
      workspaceId,
      workspace: {
        ...ws,
        fileState: Object.fromEntries(ws.fileState) // Convert Map to object
      }
    };
  }

  /**
   * Leave workspace
   */
  async leaveWorkspace(workspaceId, participantId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    const participant = workspace.participants.find(p => p.participantId === participantId);
    if (participant) {
      participant.presence = 'offline';
    }

    // Remove file locks
    for (const [filePath, lockInfo] of this.fileLocks.entries()) {
      if (lockInfo.workspaceId === workspaceId && lockInfo.participantId === participantId) {
        this.fileLocks.delete(filePath);
      }
    }

    // Remove cursor
    this.cursors.delete(`${workspaceId}:${participantId}`);

    // Broadcast
    this.broadcastToWorkspace(workspaceId, {
      type: 'participant_left',
      participantId,
      timestamp: Date.now()
    }, participantId);

    console.log(`[WorkspaceSession] ${participantId} left workspace ${workspaceId}`);

    this.emit('participant_left', { workspaceId, participantId });
  }

  /**
   * Update file state (when someone edits)
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} filePath - File being edited
   * @param {object} operation - Edit operation (OT format)
   * @param {string} participantId - Who made the edit
   */
  async updateFileState(workspaceId, filePath, operation, participantId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    // Apply operation to file state
    // (This would use Operational Transform in production)
    const currentContent = workspace.fileState.get(filePath) || '';
    const newContent = this._applyOperation(currentContent, operation);
    workspace.fileState.set(filePath, newContent);

    // Broadcast to all other participants
    this.broadcastToWorkspace(workspaceId, {
      type: 'file_update',
      filePath,
      operation,
      participantId,
      timestamp: Date.now()
    }, participantId);

    console.log(`[WorkspaceSession] File updated: ${filePath} by ${participantId}`);

    this.emit('file_updated', {
      workspaceId,
      filePath,
      operation,
      participantId
    });
  }

  /**
   * Update cursor position (live tracking)
   */
  updateCursor(workspaceId, participantId, filePath, position) {
    const key = `${workspaceId}:${participantId}`;

    this.cursors.set(key, {
      participantId,
      filePath,
      position, // { line, column }
      timestamp: Date.now()
    });

    // Broadcast cursor position
    this.broadcastToWorkspace(workspaceId, {
      type: 'cursor_update',
      participantId,
      filePath,
      position,
      timestamp: Date.now()
    }, participantId);
  }

  /**
   * Lock a file for editing
   */
  lockFile(workspaceId, filePath, participantId) {
    const key = `${workspaceId}:${filePath}`;

    // Check if already locked
    if (this.fileLocks.has(key)) {
      const existing = this.fileLocks.get(key);
      if (existing.participantId !== participantId) {
        return {
          success: false,
          lockedBy: existing.participantId
        };
      }
    }

    this.fileLocks.set(key, {
      workspaceId,
      filePath,
      participantId,
      lockedAt: Date.now()
    });

    // Broadcast
    this.broadcastToWorkspace(workspaceId, {
      type: 'file_locked',
      filePath,
      participantId,
      timestamp: Date.now()
    }, participantId);

    return { success: true };
  }

  /**
   * Unlock a file
   */
  unlockFile(workspaceId, filePath, participantId) {
    const key = `${workspaceId}:${filePath}`;
    const lock = this.fileLocks.get(key);

    if (lock && lock.participantId === participantId) {
      this.fileLocks.delete(key);

      // Broadcast
      this.broadcastToWorkspace(workspaceId, {
        type: 'file_unlocked',
        filePath,
        participantId,
        timestamp: Date.now()
      }, participantId);

      return { success: true };
    }

    return { success: false };
  }

  /**
   * Enable voice channel
   */
  async enableVoiceChannel(workspaceId, participantId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    workspace.voiceChannel.enabled = true;

    if (!workspace.voiceChannel.participants.includes(participantId)) {
      workspace.voiceChannel.participants.push(participantId);
    }

    this.broadcastToWorkspace(workspaceId, {
      type: 'voice_channel_enabled',
      participantId,
      timestamp: Date.now()
    });

    console.log(`[WorkspaceSession] Voice channel enabled in ${workspaceId}`);
  }

  /**
   * Broadcast message to all participants in workspace (except sender)
   */
  broadcastToWorkspace(workspaceId, message, excludeParticipantId = null) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    for (const participant of workspace.participants) {
      if (participant.participantId === excludeParticipantId) continue;
      if (participant.presence !== 'online') continue;

      // Get WebSocket connection for this participant
      const ws = this.participants.get(participant.participantId);
      if (ws && ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Register WebSocket connection for participant
   */
  registerParticipant(participantId, websocket) {
    this.participants.set(participantId, websocket);
    console.log(`[WorkspaceSession] Registered WebSocket for ${participantId}`);
  }

  /**
   * Unregister participant
   */
  unregisterParticipant(participantId) {
    this.participants.delete(participantId);
    console.log(`[WorkspaceSession] Unregistered ${participantId}`);
  }

  /**
   * Get workspace state
   */
  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get all workspaces for a user
   */
  async getUserWorkspaces(userId) {
    if (!this.db) return [];

    const result = await this.db.query(`
      SELECT * FROM workspace_sessions
      WHERE created_by = $1
         OR participants::jsonb @> $2
      ORDER BY created_at DESC
    `, [userId, JSON.stringify([{ participantId: userId }])]);

    return result.rows;
  }

  /**
   * Apply operation to content (simplified OT)
   * @private
   */
  _applyOperation(content, operation) {
    // Simplified - real OT is more complex
    const { type, position, text } = operation;

    if (type === 'insert') {
      return content.slice(0, position) + text + content.slice(position);
    } else if (type === 'delete') {
      return content.slice(0, position) + content.slice(position + text.length);
    }

    return content;
  }

  /**
   * Generate invite URL
   * @private
   */
  _generateInviteUrl(workspaceId) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
    return `${baseUrl}/workspace/${workspaceId}`;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      activeWorkspaces: this.workspaces.size,
      onlineParticipants: this.participants.size,
      fileLocks: this.fileLocks.size,
      activeCursors: this.cursors.size
    };
  }
}

module.exports = WorkspaceSession;
