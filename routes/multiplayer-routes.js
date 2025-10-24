/**
 * Multiplayer Portal Routes
 *
 * RESTful API + WebSocket endpoints for multiplayer portal system.
 * Handles portals, chat, battles, trades, and presence.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createMultiplayerRoutes({ db, portalManager, eventBroadcaster, wss }) {
  if (!portalManager) {
    throw new Error('MultiplayerPortalManager required for multiplayer routes');
  }

  // ============================================================================
  // PORTAL MANAGEMENT
  // ============================================================================

  /**
   * POST /api/multiplayer/create-portal
   * Create new portal instance
   */
  router.post('/create-portal', async (req, res) => {
    try {
      const { userId, bucketId, portalName, visibility, maxPlayers } = req.body;

      if (!userId || !bucketId || !portalName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, bucketId, portalName'
        });
      }

      const portal = await portalManager.createPortal(userId, bucketId, portalName, {
        visibility,
        maxPlayers
      });

      res.json({
        success: true,
        portal
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Create portal error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multiplayer/join-portal
   * Join existing portal
   */
  router.post('/join-portal', async (req, res) => {
    try {
      const { portalId, userId, bucketId } = req.body;

      if (!portalId || !userId || !bucketId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: portalId, userId, bucketId'
        });
      }

      const player = await portalManager.joinPortal(portalId, userId, bucketId);

      res.json({
        success: true,
        player
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Join portal error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multiplayer/leave-portal
   * Leave portal
   */
  router.post('/leave-portal', async (req, res) => {
    try {
      const { portalId, userId } = req.body;

      if (!portalId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: portalId, userId'
        });
      }

      const player = await portalManager.leavePortal(portalId, userId);

      res.json({
        success: true,
        player
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Leave portal error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multiplayer/close-portal
   * Close portal (owner only)
   */
  router.post('/close-portal', async (req, res) => {
    try {
      const { portalId, userId } = req.body;

      if (!portalId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: portalId, userId'
        });
      }

      const portal = await portalManager.closePortal(portalId, userId);

      res.json({
        success: true,
        portal
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Close portal error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/multiplayer/active-portals
   * Get list of active portals
   */
  router.get('/active-portals', async (req, res) => {
    try {
      const { visibility, bucketId, limit } = req.query;

      const portals = await portalManager.getActivePortals({
        visibility,
        bucketId,
        limit: limit ? parseInt(limit) : 50
      });

      res.json({
        success: true,
        portals
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Get active portals error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/multiplayer/online-players/:portalId
   * Get online players in portal
   */
  router.get('/online-players/:portalId', async (req, res) => {
    try {
      const { portalId } = req.params;

      const players = await portalManager.getOnlinePlayers(parseInt(portalId));

      res.json({
        success: true,
        players
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Get online players error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CHAT
  // ============================================================================

  /**
   * POST /api/multiplayer/send-message
   * Send chat message
   */
  router.post('/send-message', async (req, res) => {
    try {
      const { portalId, userId, messageText, messageType, replyToMessageId, metadata } = req.body;

      if (!portalId || !userId || !messageText) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: portalId, userId, messageText'
        });
      }

      const message = await portalManager.sendChatMessage(portalId, userId, messageText, {
        messageType,
        replyToMessageId,
        metadata
      });

      res.json({
        success: true,
        message
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Send message error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/multiplayer/chat-history/:portalId
   * Get chat history
   */
  router.get('/chat-history/:portalId', async (req, res) => {
    try {
      const { portalId } = req.params;
      const { limit, before } = req.query;

      const messages = await portalManager.getChatHistory(parseInt(portalId), {
        limit: limit ? parseInt(limit) : 100,
        before
      });

      res.json({
        success: true,
        messages
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Get chat history error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // BATTLES
  // ============================================================================

  /**
   * POST /api/multiplayer/challenge-battle
   * Challenge another player to battle
   */
  router.post('/challenge-battle', async (req, res) => {
    try {
      const {
        portalId,
        player1UserId,
        player1BucketId,
        player2UserId,
        player2BucketId,
        prompt,
        battleType
      } = req.body;

      if (!portalId || !player1UserId || !player1BucketId || !player2UserId || !player2BucketId || !prompt) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      const battle = await portalManager.challengeBattle(
        portalId,
        player1UserId,
        player1BucketId,
        player2UserId,
        player2BucketId,
        prompt,
        battleType
      );

      res.json({
        success: true,
        battle
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Challenge battle error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multiplayer/execute-battle/:battleId
   * Execute battle (start the AI responses)
   */
  router.post('/execute-battle/:battleId', async (req, res) => {
    try {
      const { battleId } = req.params;

      const battle = await portalManager.executeBattle(parseInt(battleId));

      res.json({
        success: true,
        battle
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Execute battle error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // TRADES
  // ============================================================================

  /**
   * POST /api/multiplayer/offer-trade
   * Offer bucket trade
   */
  router.post('/offer-trade', async (req, res) => {
    try {
      const {
        portalId,
        player1UserId,
        player1BucketId,
        player2UserId,
        player2BucketId,
        tradeType
      } = req.body;

      if (!portalId || !player1UserId || !player1BucketId || !player2UserId || !player2BucketId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      const trade = await portalManager.offerTrade(
        portalId,
        player1UserId,
        player1BucketId,
        player2UserId,
        player2BucketId,
        tradeType
      );

      res.json({
        success: true,
        trade
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Offer trade error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multiplayer/accept-trade/:tradeId
   * Accept trade offer
   */
  router.post('/accept-trade/:tradeId', async (req, res) => {
    try {
      const { tradeId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: userId'
        });
      }

      const trade = await portalManager.acceptTrade(parseInt(tradeId), userId);

      res.json({
        success: true,
        trade
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Accept trade error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // COLLABORATIVE TASKS
  // ============================================================================

  /**
   * POST /api/multiplayer/create-task
   * Create collaborative task
   */
  router.post('/create-task', async (req, res) => {
    try {
      const {
        portalId,
        taskName,
        participantUserIds,
        participantBucketIds,
        workflowConfig,
        taskType,
        taskDescription,
        karmaPerParticipant
      } = req.body;

      if (!portalId || !taskName || !participantUserIds || !participantBucketIds || !workflowConfig) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      const task = await portalManager.createCollaborativeTask(
        portalId,
        taskName,
        participantUserIds,
        participantBucketIds,
        workflowConfig,
        { taskType, taskDescription, karmaPerParticipant }
      );

      res.json({
        success: true,
        task
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Create task error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // LEADERBOARDS
  // ============================================================================

  /**
   * GET /api/multiplayer/leaderboard/:portalId
   * Get portal leaderboard
   */
  router.get('/leaderboard/:portalId', async (req, res) => {
    try {
      const { portalId } = req.params;
      const { limit } = req.query;

      const leaderboard = await portalManager.getPortalLeaderboard(
        parseInt(portalId),
        limit ? parseInt(limit) : 10
      );

      res.json({
        success: true,
        leaderboard
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/multiplayer/global-leaderboard
   * Get global battle leaderboard
   */
  router.get('/global-leaderboard', async (req, res) => {
    try {
      const { limit } = req.query;

      const leaderboard = await portalManager.getGlobalLeaderboard(
        limit ? parseInt(limit) : 10
      );

      res.json({
        success: true,
        leaderboard
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Get global leaderboard error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PRESENCE
  // ============================================================================

  /**
   * POST /api/multiplayer/update-presence
   * Update player presence
   */
  router.post('/update-presence', async (req, res) => {
    try {
      const { portalId, userId, status } = req.body;

      if (!portalId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: portalId, userId'
        });
      }

      const player = await portalManager.updatePresence(portalId, userId, status);

      res.json({
        success: true,
        player
      });
    } catch (error) {
      console.error('[MultiplayerRoutes] Update presence error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // WEBSOCKET HANDLERS
  // ============================================================================

  if (wss) {
    /**
     * WebSocket connection handler
     * Client sends: { type: 'subscribe', portalId: 123, userId: 456 }
     * Server sends: { type: 'event', event: {...} }
     */
    wss.on('connection', (ws, req) => {
      console.log('[MultiplayerRoutes] WebSocket client connected');

      let subscribedPortalId = null;
      let userId = null;

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          switch (message.type) {
            case 'subscribe':
              // Subscribe to portal events
              subscribedPortalId = message.portalId;
              userId = message.userId;
              ws.clientId = `user_${userId}_portal_${subscribedPortalId}`;

              // Subscribe to event broadcaster
              if (eventBroadcaster) {
                eventBroadcaster.subscribe(ws.clientId, [
                  `portal.${subscribedPortalId}.*`,
                  'portal.chat',
                  'portal.joined',
                  'portal.left',
                  'battle.*',
                  'trade.*',
                  'presence.*'
                ]);
              }

              // Update presence
              await portalManager.updatePresence(subscribedPortalId, userId, 'online');

              ws.send(JSON.stringify({
                type: 'subscribed',
                portalId: subscribedPortalId
              }));

              console.log(`[MultiplayerRoutes] Client subscribed to portal ${subscribedPortalId}`);
              break;

            case 'unsubscribe':
              if (subscribedPortalId && userId) {
                await portalManager.updatePresence(subscribedPortalId, userId, 'offline');
              }

              if (eventBroadcaster && ws.clientId) {
                eventBroadcaster.unsubscribe(ws.clientId);
              }

              subscribedPortalId = null;
              userId = null;

              ws.send(JSON.stringify({
                type: 'unsubscribed'
              }));

              console.log('[MultiplayerRoutes] Client unsubscribed');
              break;

            case 'ping':
              // Heartbeat
              ws.send(JSON.stringify({ type: 'pong' }));
              break;

            default:
              console.warn(`[MultiplayerRoutes] Unknown message type: ${message.type}`);
          }
        } catch (error) {
          console.error('[MultiplayerRoutes] WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });

      ws.on('close', async () => {
        if (subscribedPortalId && userId) {
          try {
            await portalManager.updatePresence(subscribedPortalId, userId, 'offline');
          } catch (error) {
            console.error('[MultiplayerRoutes] Error updating presence on close:', error);
          }
        }

        if (eventBroadcaster && ws.clientId) {
          eventBroadcaster.unsubscribe(ws.clientId);
        }

        console.log('[MultiplayerRoutes] WebSocket client disconnected');
      });
    });
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  router.get('/health', async (req, res) => {
    res.json({
      success: true,
      service: 'multiplayer',
      features: [
        'portals',
        'chat',
        'battles',
        'trades',
        'collaborative-tasks',
        'leaderboards',
        'presence',
        'websocket'
      ],
      websocketAvailable: !!wss
    });
  });

  return router;
}

module.exports = createMultiplayerRoutes;
