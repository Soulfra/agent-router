/**
 * Ollama Stream Handler
 *
 * WebSocket handler for real-time Ollama streaming sessions.
 * Enables live chat streaming, context broadcasting, and session monitoring.
 *
 * Features:
 * - Real-time message streaming (like ChatGPT interface)
 * - Broadcast messages to multiple clients
 * - Session state sync
 * - Context streaming events
 * - Auto-reconnect support
 *
 * WebSocket Message Types:
 * - session_start: Start new session
 * - session_end: End session
 * - message_send: Send user message
 * - message_stream: Streaming assistant response (SSE-style)
 * - message_complete: Full message delivered
 * - context_stream: Context sent to another model
 * - session_update: Session stats updated
 * - error: Error occurred
 */

const OllamaSessionManager = require('./ollama-session-manager');

class OllamaStreamHandler {
  constructor(config = {}) {
    this.db = config.db;
    this.sessionManager = config.sessionManager || new OllamaSessionManager({ db: this.db });
    this.verbose = config.verbose || false;

    // Track WebSocket connections
    this.connections = new Map(); // ws → {userId, sessionId, metadata}
    this.sessionSubscribers = new Map(); // sessionId → Set of ws connections

    console.log('[OllamaStreamHandler] Initialized');
  }

  /**
   * Handle new WebSocket connection
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} metadata - Connection metadata
   */
  onConnection(ws, metadata = {}) {
    const connectionId = this.generateConnectionId();

    if (this.verbose) {
      console.log(`[OllamaStreamHandler] New connection: ${connectionId}`);
    }

    // Store connection
    this.connections.set(ws, {
      connectionId,
      userId: metadata.userId || null,
      sessionId: null,
      connectedAt: new Date()
    });

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      connectionId,
      timestamp: Date.now(),
      message: 'Connected to Ollama streaming service'
    });

    // Set up message handler
    ws.on('message', (data) => this.handleMessage(ws, data));

    // Handle disconnect
    ws.on('close', () => this.handleDisconnect(ws));

    // Handle errors
    ws.on('error', (error) => {
      console.error('[OllamaStreamHandler] WebSocket error:', error.message);
    });
  }

  /**
   * Handle incoming WebSocket message
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {string|Buffer} data - Message data
   */
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      if (this.verbose) {
        console.log(`[OllamaStreamHandler] Message: ${message.type}`);
      }

      switch (message.type) {
        case 'session_start':
          await this.handleSessionStart(ws, message);
          break;

        case 'session_end':
          await this.handleSessionEnd(ws, message);
          break;

        case 'message_send':
          await this.handleMessageSend(ws, message);
          break;

        case 'domain_switch':
          await this.handleDomainSwitch(ws, message);
          break;

        case 'session_subscribe':
          await this.handleSessionSubscribe(ws, message);
          break;

        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          console.log(`[OllamaStreamHandler] Unknown message type: ${message.type}`);
      }

    } catch (error) {
      console.error('[OllamaStreamHandler] Message error:', error.message);
      this.send(ws, {
        type: 'error',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle session start request
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message data
   */
  async handleSessionStart(ws, message) {
    const {
      userId,
      domainId,
      brandId,
      roomId,
      primaryModel = 'ollama:mistral',
      sessionName
    } = message;

    try {
      // Start session
      const result = await this.sessionManager.startSession({
        userId,
        domainId,
        brandId,
        roomId,
        primaryModel,
        sessionName
      });

      // Update connection info
      const conn = this.connections.get(ws);
      conn.userId = userId;
      conn.sessionId = result.sessionId;

      // Subscribe to session
      this.subscribeToSession(ws, result.sessionId);

      // Send confirmation
      this.send(ws, {
        type: 'session_started',
        sessionId: result.sessionId,
        session: result.session,
        timestamp: Date.now()
      });

      // Broadcast to other subscribers
      this.broadcast(result.sessionId, {
        type: 'session_update',
        sessionId: result.sessionId,
        event: 'started',
        timestamp: Date.now()
      }, ws); // Exclude sender

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to start session: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle session end request
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message data
   */
  async handleSessionEnd(ws, message) {
    const { sessionId } = message;

    try {
      // End session
      const result = await this.sessionManager.endSession(sessionId);

      // Send summary
      this.send(ws, {
        type: 'session_ended',
        sessionId,
        summary: result.summary,
        timestamp: Date.now()
      });

      // Broadcast to other subscribers
      this.broadcast(sessionId, {
        type: 'session_update',
        sessionId,
        event: 'ended',
        summary: result.summary,
        timestamp: Date.now()
      }, ws);

      // Unsubscribe all
      this.unsubscribeFromSession(sessionId);

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to end session: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle message send (user sending message to Ollama)
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message data
   */
  async handleMessageSend(ws, message) {
    const { sessionId, content, options = {} } = message;

    try {
      // Broadcast user message immediately
      this.broadcast(sessionId, {
        type: 'message_received',
        sessionId,
        role: 'user',
        content,
        timestamp: Date.now()
      });

      // Send to Ollama and stream response
      // Note: This is a simplified version. Real streaming would use Ollama's streaming API
      const result = await this.sessionManager.sendMessage(sessionId, content, options);

      // Stream assistant response (for now, send complete response)
      // In production, we'd chunk this and send multiple message_stream events
      this.broadcast(sessionId, {
        type: 'message_stream',
        sessionId,
        role: 'assistant',
        content: result.response,
        model: result.model,
        provider: result.provider,
        timestamp: Date.now()
      });

      // Send completion event
      this.broadcast(sessionId, {
        type: 'message_complete',
        sessionId,
        usage: result.usage,
        cost: result.cost,
        latencyMs: result.latencyMs,
        timestamp: Date.now()
      });

      // Send session stats update
      const summary = await this.sessionManager.getSessionSummary(sessionId);
      this.broadcast(sessionId, {
        type: 'session_stats',
        sessionId,
        stats: {
          totalMessages: summary.total_messages,
          totalTokens: summary.total_tokens,
          totalCost: summary.total_cost
        },
        timestamp: Date.now()
      });

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to send message: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle domain switch request
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message data
   */
  async handleDomainSwitch(ws, message) {
    const {
      sessionId,
      targetDomainId,
      targetModel,
      targetProvider,
      reason
    } = message;

    try {
      // Notify subscribers context streaming is starting
      this.broadcast(sessionId, {
        type: 'context_streaming',
        sessionId,
        targetDomain: targetDomainId,
        targetModel,
        status: 'starting',
        timestamp: Date.now()
      });

      // Switch domain and stream context
      const result = await this.sessionManager.switchDomain(sessionId, {
        targetDomainId,
        targetModel,
        targetProvider,
        reason
      });

      // Notify completion
      this.broadcast(sessionId, {
        type: 'context_streamed',
        sessionId,
        result,
        timestamp: Date.now()
      });

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to switch domain: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle session subscribe (join existing session)
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message data
   */
  async handleSessionSubscribe(ws, message) {
    const { sessionId } = message;

    try {
      // Get session data
      const session = await this.sessionManager.getSession(sessionId);

      // Update connection
      const conn = this.connections.get(ws);
      conn.sessionId = sessionId;

      // Subscribe
      this.subscribeToSession(ws, sessionId);

      // Send session state
      const summary = await this.sessionManager.getSessionSummary(sessionId);
      const history = await this.sessionManager.getConversationHistory(sessionId, 50);

      this.send(ws, {
        type: 'session_subscribed',
        sessionId,
        session,
        summary,
        history,
        timestamp: Date.now()
      });

    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: `Failed to subscribe to session: ${error.message}`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle WebSocket disconnect
   *
   * @param {WebSocket} ws - WebSocket connection
   */
  handleDisconnect(ws) {
    const conn = this.connections.get(ws);

    if (conn) {
      if (this.verbose) {
        console.log(`[OllamaStreamHandler] Disconnect: ${conn.connectionId}`);
      }

      // Unsubscribe from session
      if (conn.sessionId) {
        this.unsubscribeFromSession(conn.sessionId, ws);
      }

      // Remove connection
      this.connections.delete(ws);
    }
  }

  /**
   * Subscribe WebSocket to a session
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} sessionId - Session ID
   * @private
   */
  subscribeToSession(ws, sessionId) {
    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }

    this.sessionSubscribers.get(sessionId).add(ws);

    if (this.verbose) {
      console.log(`[OllamaStreamHandler] Subscribed to session: ${sessionId}`);
    }
  }

  /**
   * Unsubscribe WebSocket from a session
   *
   * @param {string} sessionId - Session ID
   * @param {WebSocket} ws - WebSocket connection (optional - if not provided, unsubscribe all)
   * @private
   */
  unsubscribeFromSession(sessionId, ws = null) {
    const subscribers = this.sessionSubscribers.get(sessionId);

    if (!subscribers) return;

    if (ws) {
      subscribers.delete(ws);
    } else {
      subscribers.clear();
    }

    if (subscribers.size === 0) {
      this.sessionSubscribers.delete(sessionId);
    }
  }

  /**
   * Broadcast message to all subscribers of a session
   *
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message to broadcast
   * @param {WebSocket} exclude - WebSocket to exclude (optional)
   * @private
   */
  broadcast(sessionId, message, exclude = null) {
    const subscribers = this.sessionSubscribers.get(sessionId);

    if (!subscribers) return;

    const payload = JSON.stringify(message);

    for (const ws of subscribers) {
      if (ws !== exclude && ws.readyState === 1) { // 1 = OPEN
        ws.send(payload);
      }
    }
  }

  /**
   * Send message to a specific WebSocket
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   * @private
   */
  send(ws, message) {
    if (ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Generate unique connection ID
   *
   * @returns {string} Connection ID
   * @private
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get connection stats
   *
   * @returns {Object} Stats
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      activeSessions: this.sessionSubscribers.size,
      sessionsWithSubscribers: Array.from(this.sessionSubscribers.entries()).map(([sessionId, subs]) => ({
        sessionId,
        subscribers: subs.size
      }))
    };
  }
}

module.exports = OllamaStreamHandler;
