/**
 * Soulfra Broadcaster
 *
 * Twitch-style streaming infrastructure for live coding collaboration
 * with AI-powered code execution and viewer interaction.
 *
 * Features:
 * - Live coding streams with real-time synchronization
 * - Viewer chat and interaction
 * - Twitch-style commands (!execute, !analyze, !help)
 * - AI-powered code evaluation via Soulfra
 * - Collaborative code execution
 * - Stream analytics and viewer engagement
 * - Integration with EventBroadcaster for distributed streaming
 */

const EventEmitter = require('events');

class SoulfraBroadcaster extends EventEmitter {
  constructor(options = {}) {
    super();

    // Dependencies
    this.soulfraClient = options.soulfraClient || null;
    this.eventBroadcaster = options.eventBroadcaster || null;
    this.db = options.db || null;

    // Streaming configuration
    this.maxViewers = options.maxViewers || 1000;
    this.allowViewerExecution = options.allowViewerExecution !== false;
    this.cooldownPeriod = options.cooldownPeriod || 5000; // 5s between viewer commands

    // Active streams
    this.streams = new Map(); // stream_id -> stream object
    this.viewers = new Map(); // viewer_id -> viewer object

    // Command handlers
    this.commands = new Map();
    this._registerDefaultCommands();

    // Rate limiting
    this.commandCooldowns = new Map(); // viewer_id -> last command timestamp

    // Statistics
    this.stats = {
      totalStreams: 0,
      activeStreams: 0,
      totalViewers: 0,
      commandsExecuted: 0,
      codeExecutions: 0
    };

    console.log('[SoulfraBroadcaster] Initialized');
  }

  /**
   * Create a new live coding stream
   *
   * @param {string} streamerId - Streamer's user ID
   * @param {Object} options - Stream options
   * @returns {Object} Stream object
   */
  createStream(streamerId, options = {}) {
    const streamId = options.streamId || this._generateStreamId();

    const stream = {
      id: streamId,
      streamerId,
      title: options.title || 'Live Coding Stream',
      description: options.description || '',
      language: options.language || 'javascript',
      viewers: new Set(),
      chat: [],
      code: options.initialCode || '',
      status: 'active',
      startedAt: new Date(),
      metadata: options.metadata || {}
    };

    this.streams.set(streamId, stream);
    this.stats.totalStreams++;
    this.stats.activeStreams++;

    // Broadcast stream creation
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.created', {
        streamId,
        streamerId,
        title: stream.title
      });
    }

    console.log(`[SoulfraBroadcaster] Stream created: ${streamId} by ${streamerId}`);

    return stream;
  }

  /**
   * Join a stream as a viewer
   *
   * @param {string} streamId - Stream ID
   * @param {string} viewerId - Viewer's user ID
   * @param {Object} viewerInfo - Viewer information
   * @returns {boolean} Success status
   */
  joinStream(streamId, viewerId, viewerInfo = {}) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      console.error(`[SoulfraBroadcaster] Stream not found: ${streamId}`);
      return false;
    }

    if (stream.viewers.size >= this.maxViewers) {
      console.warn(`[SoulfraBroadcaster] Stream ${streamId} is full`);
      return false;
    }

    // Add viewer to stream
    stream.viewers.add(viewerId);

    // Track viewer
    this.viewers.set(viewerId, {
      id: viewerId,
      username: viewerInfo.username || `viewer_${viewerId}`,
      streamId,
      joinedAt: new Date(),
      ...viewerInfo
    });

    this.stats.totalViewers++;

    // Broadcast join event
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.viewer.joined', {
        streamId,
        viewerId,
        viewerCount: stream.viewers.size
      });
    }

    this.emit('viewer:join', { streamId, viewerId, stream });

    console.log(`[SoulfraBroadcaster] Viewer ${viewerId} joined stream ${streamId} (${stream.viewers.size} viewers)`);

    return true;
  }

  /**
   * Leave a stream
   *
   * @param {string} streamId - Stream ID
   * @param {string} viewerId - Viewer's user ID
   */
  leaveStream(streamId, viewerId) {
    const stream = this.streams.get(streamId);

    if (!stream) return;

    stream.viewers.delete(viewerId);
    this.viewers.delete(viewerId);

    // Broadcast leave event
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.viewer.left', {
        streamId,
        viewerId,
        viewerCount: stream.viewers.size
      });
    }

    this.emit('viewer:leave', { streamId, viewerId, stream });

    console.log(`[SoulfraBroadcaster] Viewer ${viewerId} left stream ${streamId} (${stream.viewers.size} viewers)`);
  }

  /**
   * Send a chat message
   *
   * @param {string} streamId - Stream ID
   * @param {string} viewerId - Viewer's user ID
   * @param {string} message - Chat message
   * @returns {Object} Chat message object
   */
  sendChatMessage(streamId, viewerId, message) {
    const stream = this.streams.get(streamId);
    const viewer = this.viewers.get(viewerId);

    if (!stream || !viewer) return null;

    const chatMessage = {
      id: this._generateMessageId(),
      viewerId,
      username: viewer.username,
      message,
      timestamp: new Date(),
      type: 'chat'
    };

    stream.chat.push(chatMessage);

    // Check if message is a command
    if (message.startsWith('!')) {
      this._handleCommand(streamId, viewerId, message);
    }

    // Broadcast chat message
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.chat.message', {
        streamId,
        message: chatMessage
      });
    }

    this.emit('chat:message', { streamId, message: chatMessage });

    return chatMessage;
  }

  /**
   * Update stream code (streamer only)
   *
   * @param {string} streamId - Stream ID
   * @param {string} code - Updated code
   * @param {string} userId - User ID (must be streamer)
   * @returns {boolean} Success status
   */
  updateCode(streamId, code, userId) {
    const stream = this.streams.get(streamId);

    if (!stream) return false;

    // Only streamer can update code
    if (stream.streamerId !== userId) {
      console.warn(`[SoulfraBroadcaster] Unauthorized code update attempt by ${userId}`);
      return false;
    }

    stream.code = code;

    // Broadcast code update
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.code.updated', {
        streamId,
        code
      });
    }

    this.emit('code:update', { streamId, code });

    return true;
  }

  /**
   * Execute code via Soulfra (streamer or viewers if enabled)
   *
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @param {string} code - Code to execute (optional, uses stream code if not provided)
   * @returns {Promise<Object>} Execution result
   */
  async executeCode(streamId, userId, code = null) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error('Stream not found');
    }

    // Check permissions
    const isStreamer = stream.streamerId === userId;
    if (!isStreamer && !this.allowViewerExecution) {
      throw new Error('Viewer code execution is disabled');
    }

    // Check cooldown for viewers
    if (!isStreamer) {
      const lastCommand = this.commandCooldowns.get(userId);
      if (lastCommand && Date.now() - lastCommand < this.cooldownPeriod) {
        const remaining = Math.ceil((this.cooldownPeriod - (Date.now() - lastCommand)) / 1000);
        throw new Error(`Cooldown active. Wait ${remaining}s`);
      }
      this.commandCooldowns.set(userId, Date.now());
    }

    const codeToExecute = code || stream.code;

    if (!this.soulfraClient) {
      throw new Error('Soulfra client not configured');
    }

    this.stats.codeExecutions++;

    // Execute code via Soulfra
    const result = await this.soulfraClient.generate(
      `Analyze and execute this ${stream.language} code:\n\n${codeToExecute}\n\nProvide the output and any errors.`,
      {
        temperature: 0.3,
        maxTokens: 1000
      }
    );

    // Broadcast execution result
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.code.executed', {
        streamId,
        userId,
        result: {
          output: result.text.substring(0, 500) // Truncate for broadcast
        }
      });
    }

    this.emit('code:execute', { streamId, userId, result });

    return {
      success: true,
      output: result.text,
      model: result.model,
      executedBy: userId
    };
  }

  /**
   * Handle chat commands
   * @private
   */
  _handleCommand(streamId, viewerId, message) {
    const parts = message.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(command);

    if (!handler) {
      return;
    }

    this.stats.commandsExecuted++;

    try {
      handler.call(this, streamId, viewerId, args);
    } catch (error) {
      console.error(`[SoulfraBroadcaster] Command error (${command}):`, error.message);
    }
  }

  /**
   * Register default commands
   * @private
   */
  _registerDefaultCommands() {
    // !execute - Execute current code
    this.registerCommand('execute', async function(streamId, viewerId, args) {
      try {
        const result = await this.executeCode(streamId, viewerId);

        this.sendChatMessage(streamId, 'system', `✓ Code executed by @${this.viewers.get(viewerId)?.username}: ${result.output.substring(0, 200)}...`);
      } catch (error) {
        this.sendChatMessage(streamId, 'system', `✗ Execution failed: ${error.message}`);
      }
    });

    // !analyze - Analyze code
    this.registerCommand('analyze', async function(streamId, viewerId, args) {
      const stream = this.streams.get(streamId);
      if (!stream || !this.soulfraClient) return;

      const analysis = await this.soulfraClient.generate(
        `Analyze this ${stream.language} code for bugs, improvements, and best practices:\n\n${stream.code}`,
        { temperature: 0.5, maxTokens: 500 }
      );

      this.sendChatMessage(streamId, 'system', `📊 Code Analysis: ${analysis.text.substring(0, 300)}...`);
    });

    // !help - Show commands
    this.registerCommand('help', function(streamId, viewerId, args) {
      const commands = Array.from(this.commands.keys()).map(cmd => `!${cmd}`).join(', ');
      this.sendChatMessage(streamId, 'system', `Available commands: ${commands}`);
    });

    // !viewers - Show viewer count
    this.registerCommand('viewers', function(streamId, viewerId, args) {
      const stream = this.streams.get(streamId);
      if (!stream) return;

      this.sendChatMessage(streamId, 'system', `👥 ${stream.viewers.size} viewers watching`);
    });
  }

  /**
   * Register a custom command
   *
   * @param {string} name - Command name (without !)
   * @param {Function} handler - Command handler function
   */
  registerCommand(name, handler) {
    this.commands.set(name.toLowerCase(), handler);
    console.log(`[SoulfraBroadcaster] Registered command: !${name}`);
  }

  /**
   * End a stream
   *
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID (must be streamer)
   * @returns {boolean} Success status
   */
  endStream(streamId, userId) {
    const stream = this.streams.get(streamId);

    if (!stream) return false;

    if (stream.streamerId !== userId) {
      console.warn(`[SoulfraBroadcaster] Unauthorized stream end attempt by ${userId}`);
      return false;
    }

    stream.status = 'ended';
    stream.endedAt = new Date();

    // Notify all viewers
    stream.viewers.forEach(viewerId => {
      this.leaveStream(streamId, viewerId);
    });

    this.stats.activeStreams--;

    // Broadcast stream end
    if (this.eventBroadcaster) {
      this.eventBroadcaster.broadcast('stream.ended', {
        streamId,
        duration: stream.endedAt - stream.startedAt
      });
    }

    this.emit('stream:end', { streamId, stream });

    console.log(`[SoulfraBroadcaster] Stream ended: ${streamId}`);

    return true;
  }

  /**
   * Get stream information
   *
   * @param {string} streamId - Stream ID
   * @returns {Object|null} Stream object
   */
  getStream(streamId) {
    return this.streams.get(streamId) || null;
  }

  /**
   * Get all active streams
   *
   * @returns {Array} Array of active streams
   */
  getActiveStreams() {
    return Array.from(this.streams.values()).filter(s => s.status === 'active');
  }

  /**
   * Get stream statistics
   *
   * @param {string} streamId - Stream ID
   * @returns {Object|null} Stream statistics
   */
  getStreamStats(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) return null;

    return {
      streamId,
      viewerCount: stream.viewers.size,
      chatMessages: stream.chat.length,
      duration: stream.endedAt
        ? stream.endedAt - stream.startedAt
        : Date.now() - stream.startedAt,
      status: stream.status
    };
  }

  /**
   * Get overall statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      activeViewers: this.viewers.size,
      totalCommands: this.commands.size
    };
  }

  /**
   * Generate unique stream ID
   * @private
   */
  _generateStreamId() {
    return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate unique message ID
   * @private
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

module.exports = SoulfraBroadcaster;
