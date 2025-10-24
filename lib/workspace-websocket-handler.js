/**
 * Workspace WebSocket Handler
 *
 * Handles WebSocket connections for collaborative workspace sessions.
 * Routes messages between clients and WorkspaceSession manager.
 *
 * Message types handled:
 * - workspace_join: Join a workspace
 * - workspace_leave: Leave a workspace
 * - file_update: File content change
 * - cursor_update: Cursor position change
 * - file_lock: Request file lock
 * - file_unlock: Release file lock
 * - git_command: Execute git operation
 * - terminal_command: Execute terminal command
 * - chat_message: Send chat message
 * - voice_toggle: Enable/disable voice
 */

const WorkspaceSession = require('./workspace-session');

class WorkspaceWebSocketHandler {
  constructor({ db, sessionOrchestrator = null, roomManager = null }) {
    this.workspaceSession = new WorkspaceSession({
      db,
      sessionOrchestrator,
      roomManager
    });

    // Track WebSocket to participant mapping
    this.wsToParticipant = new Map();
    this.participantToWs = new Map();

    console.log('[WorkspaceWebSocketHandler] Initialized');
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   */
  onConnection(ws) {
    console.log('[WorkspaceWebSocketHandler] New connection');

    // Send welcome message
    this.send(ws, {
      type: 'workspace_ready',
      message: 'Workspace connection established',
      timestamp: Date.now()
    });

    // Set up message handler
    ws.on('message', (data) => this.handleMessage(ws, data));

    // Handle disconnect
    ws.on('close', () => this.handleDisconnect(ws));
  }

  /**
   * Handle incoming message
   * @param {WebSocket} ws - WebSocket connection
   * @param {string|Buffer} data - Message data
   */
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      console.log(`[WorkspaceWebSocketHandler] Message: ${message.type}`);

      switch (message.type) {
        case 'workspace_join':
          await this.handleJoinWorkspace(ws, message);
          break;

        case 'workspace_create':
          await this.handleCreateWorkspace(ws, message);
          break;

        case 'workspace_leave':
          await this.handleLeaveWorkspace(ws, message);
          break;

        case 'file_update':
          await this.handleFileUpdate(ws, message);
          break;

        case 'cursor_update':
          this.handleCursorUpdate(ws, message);
          break;

        case 'file_lock':
          this.handleFileLock(ws, message);
          break;

        case 'file_unlock':
          this.handleFileUnlock(ws, message);
          break;

        case 'git_command':
          await this.handleGitCommand(ws, message);
          break;

        case 'terminal_command':
          await this.handleTerminalCommand(ws, message);
          break;

        case 'chat_message':
          this.handleChatMessage(ws, message);
          break;

        case 'voice_toggle':
          await this.handleVoiceToggle(ws, message);
          break;

        default:
          console.log(`[WorkspaceWebSocketHandler] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WorkspaceWebSocketHandler] Message error:', error);
      this.send(ws, {
        type: 'error',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle workspace creation
   */
  async handleCreateWorkspace(ws, message) {
    const { userId, workspaceName, projectPath, inviteAgentId, metadata } = message;

    const result = await this.workspaceSession.createWorkspace({
      userId,
      workspaceName,
      projectPath,
      inviteAgentId,
      metadata
    });

    // Register this WebSocket connection
    this.registerConnection(ws, result.workspaceId, userId);

    // Send confirmation
    this.send(ws, {
      type: 'workspace_created',
      ...result,
      timestamp: Date.now()
    });
  }

  /**
   * Handle workspace join
   */
  async handleJoinWorkspace(ws, message) {
    const { workspaceId, participantId, participantType = 'human' } = message;

    try {
      const result = await this.workspaceSession.joinWorkspace(
        workspaceId,
        participantId,
        participantType
      );

      // Register this WebSocket connection
      this.registerConnection(ws, workspaceId, participantId);

      // Register with WorkspaceSession for broadcasting
      this.workspaceSession.registerParticipant(participantId, ws);

      // Send workspace state
      this.send(ws, {
        type: 'workspace_state',
        ...result,
        timestamp: Date.now()
      });

      console.log(`[WorkspaceWebSocketHandler] ${participantId} joined ${workspaceId}`);
    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to join workspace: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle workspace leave
   */
  async handleLeaveWorkspace(ws, message) {
    const { workspaceId, participantId } = message;

    await this.workspaceSession.leaveWorkspace(workspaceId, participantId);
    this.workspaceSession.unregisterParticipant(participantId);
    this.unregisterConnection(ws);

    this.send(ws, {
      type: 'workspace_left',
      workspaceId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle file update
   */
  async handleFileUpdate(ws, message) {
    const { workspaceId, filePath, operation, participantId } = message;

    await this.workspaceSession.updateFileState(
      workspaceId,
      filePath,
      operation,
      participantId
    );

    // Broadcast is handled by WorkspaceSession
  }

  /**
   * Handle cursor update
   */
  handleCursorUpdate(ws, message) {
    const { workspaceId, participantId, filePath, position } = message;

    this.workspaceSession.updateCursor(
      workspaceId,
      participantId,
      filePath,
      position
    );

    // Broadcast is handled by WorkspaceSession
  }

  /**
   * Handle file lock request
   */
  handleFileLock(ws, message) {
    const { workspaceId, filePath, participantId } = message;

    const result = this.workspaceSession.lockFile(
      workspaceId,
      filePath,
      participantId
    );

    // Send response to requester
    this.send(ws, {
      type: 'file_lock_response',
      ...result,
      filePath,
      timestamp: Date.now()
    });

    // Broadcast is handled by WorkspaceSession if successful
  }

  /**
   * Handle file unlock
   */
  handleFileUnlock(ws, message) {
    const { workspaceId, filePath, participantId } = message;

    const result = this.workspaceSession.unlockFile(
      workspaceId,
      filePath,
      participantId
    );

    this.send(ws, {
      type: 'file_unlock_response',
      ...result,
      filePath,
      timestamp: Date.now()
    });

    // Broadcast is handled by WorkspaceSession if successful
  }

  /**
   * Handle git command
   */
  async handleGitCommand(ws, message) {
    const { workspaceId, command, participantId } = message;

    // TODO: Integrate with GitOrchestrator when implemented
    // For now, just broadcast the command
    const workspace = this.workspaceSession.getWorkspace(workspaceId);
    if (!workspace) {
      this.send(ws, {
        type: 'error',
        message: 'Workspace not found',
        timestamp: Date.now()
      });
      return;
    }

    // Broadcast git command to all participants
    this.workspaceSession.broadcastToWorkspace(workspaceId, {
      type: 'git_command',
      command,
      participantId,
      timestamp: Date.now()
    });

    console.log(`[WorkspaceWebSocketHandler] Git command: ${command} by ${participantId}`);
  }

  /**
   * Handle terminal command
   */
  async handleTerminalCommand(ws, message) {
    const { workspaceId, command, participantId } = message;

    // Broadcast terminal command to all participants
    this.workspaceSession.broadcastToWorkspace(workspaceId, {
      type: 'terminal_output',
      command,
      participantId,
      output: `$ ${command}\n[Terminal execution not yet implemented]`,
      timestamp: Date.now()
    });

    console.log(`[WorkspaceWebSocketHandler] Terminal: ${command} by ${participantId}`);
  }

  /**
   * Handle chat message
   */
  handleChatMessage(ws, message) {
    const { workspaceId, participantId, text } = message;

    // Broadcast chat message to all participants
    this.workspaceSession.broadcastToWorkspace(workspaceId, {
      type: 'chat_message',
      participantId,
      text,
      timestamp: Date.now()
    });
  }

  /**
   * Handle voice toggle
   */
  async handleVoiceToggle(ws, message) {
    const { workspaceId, participantId, enabled } = message;

    if (enabled) {
      await this.workspaceSession.enableVoiceChannel(workspaceId, participantId);
    }

    this.send(ws, {
      type: 'voice_toggle_response',
      enabled,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(ws) {
    const info = this.wsToParticipant.get(ws);

    if (info) {
      const { workspaceId, participantId } = info;

      // Leave workspace
      this.workspaceSession.leaveWorkspace(workspaceId, participantId);
      this.workspaceSession.unregisterParticipant(participantId);

      // Clean up mappings
      this.unregisterConnection(ws);

      console.log(`[WorkspaceWebSocketHandler] ${participantId} disconnected from ${workspaceId}`);
    }
  }

  /**
   * Register WebSocket connection
   * @private
   */
  registerConnection(ws, workspaceId, participantId) {
    this.wsToParticipant.set(ws, { workspaceId, participantId });
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
   * Get stats
   */
  getStats() {
    return {
      ...this.workspaceSession.getStats(),
      connections: this.wsToParticipant.size
    };
  }
}

module.exports = WorkspaceWebSocketHandler;
