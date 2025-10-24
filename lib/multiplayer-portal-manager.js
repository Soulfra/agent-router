/**
 * Multiplayer Portal Manager
 *
 * Manages portal instances, player presence, battles, trades, and collaborative tasks.
 * Transforms the bucket system into a Pokémon-style multiplayer game.
 *
 * Features:
 * - Portal lifecycle (create, join, leave, close)
 * - Player presence tracking
 * - Chat message routing
 * - Bucket battles (Pokémon-style PvP)
 * - Bucket trading
 * - Collaborative workflows
 * - Real-time event broadcasting
 */

const EventEmitter = require('events');

class MultiplayerPortalManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.eventBroadcaster = options.eventBroadcaster; // For real-time events
    this.bucketOrchestrator = options.bucketOrchestrator; // For bucket operations

    // Active portals (in-memory cache)
    this.activePortals = new Map(); // portal_id -> portal instance

    // Active players (in-memory cache)
    this.activePlayers = new Map(); // user_id -> [portal_ids]

    // Battle mechanics
    this.battleTypes = {
      speed: 'Fastest response wins',
      quality: 'Best quality response wins (human judgment)',
      creativity: 'Most creative response wins',
      cost: 'Lowest cost wins'
    };

    console.log('[MultiplayerPortalManager] Initialized');
  }

  // ============================================================================
  // Portal Lifecycle
  // ============================================================================

  /**
   * Create a new portal instance
   */
  async createPortal(userId, bucketId, portalName, options = {}) {
    const { visibility = 'private', maxPlayers = 10 } = options;

    const query = `SELECT create_portal_instance($1, $2, $3, $4)`;
    const result = await this.db.query(query, [userId, bucketId, portalName, visibility]);

    const portal = result.rows[0].create_portal_instance;

    // Cache portal
    this.activePortals.set(portal.portal_id, portal);

    // Track user
    if (!this.activePlayers.has(userId)) {
      this.activePlayers.set(userId, []);
    }
    this.activePlayers.get(userId).push(portal.portal_id);

    // Broadcast event
    this.eventBroadcaster?.broadcast('portal.created', {
      portalId: portal.portal_id,
      portalName,
      bucketId,
      userId,
      visibility
    });

    console.log(`[MultiplayerPortalManager] Portal created: ${portalName} (${portal.portal_id})`);

    return portal;
  }

  /**
   * Join an existing portal
   */
  async joinPortal(portalId, userId, bucketId) {
    const query = `SELECT join_portal($1, $2, $3)`;
    const result = await this.db.query(query, [portalId, userId, bucketId]);

    const player = result.rows[0].join_portal;

    // Track user
    if (!this.activePlayers.has(userId)) {
      this.activePlayers.set(userId, []);
    }
    if (!this.activePlayers.get(userId).includes(portalId)) {
      this.activePlayers.get(userId).push(portalId);
    }

    // Broadcast event
    this.eventBroadcaster?.broadcast('portal.joined', {
      portalId,
      userId,
      bucketId,
      timestamp: player.joined_at
    });

    console.log(`[MultiplayerPortalManager] User ${userId} joined portal ${portalId}`);

    return player;
  }

  /**
   * Leave a portal
   */
  async leavePortal(portalId, userId) {
    const query = `
      UPDATE portal_players
      SET status = 'offline', left_at = CURRENT_TIMESTAMP
      WHERE portal_id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [portalId, userId]);

    // Remove from active players
    if (this.activePlayers.has(userId)) {
      const portals = this.activePlayers.get(userId);
      const index = portals.indexOf(portalId);
      if (index > -1) {
        portals.splice(index, 1);
      }
    }

    // Broadcast event
    this.eventBroadcaster?.broadcast('portal.left', {
      portalId,
      userId,
      timestamp: new Date().toISOString()
    });

    console.log(`[MultiplayerPortalManager] User ${userId} left portal ${portalId}`);

    return result.rows[0];
  }

  /**
   * Close a portal
   */
  async closePortal(portalId, userId) {
    // Verify ownership
    const ownerCheck = await this.db.query(
      'SELECT user_id FROM portal_instances WHERE portal_id = $1',
      [portalId]
    );

    if (ownerCheck.rows[0]?.user_id !== userId) {
      throw new Error('Only portal owner can close the portal');
    }

    const query = `
      UPDATE portal_instances
      SET status = 'closed', closed_at = CURRENT_TIMESTAMP
      WHERE portal_id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [portalId]);

    // Remove from cache
    this.activePortals.delete(portalId);

    // Broadcast event
    this.eventBroadcaster?.broadcast('portal.closed', {
      portalId,
      userId,
      timestamp: new Date().toISOString()
    });

    console.log(`[MultiplayerPortalManager] Portal ${portalId} closed`);

    return result.rows[0];
  }

  /**
   * Get active portals
   */
  async getActivePortals(filters = {}) {
    let whereClauses = ["pi.status = 'active'"];
    let values = [];
    let paramIndex = 1;

    if (filters.visibility) {
      whereClauses.push(`pi.visibility = $${paramIndex++}`);
      values.push(filters.visibility);
    }

    if (filters.bucketId) {
      whereClauses.push(`pi.bucket_id = $${paramIndex++}`);
      values.push(filters.bucketId);
    }

    const query = `
      SELECT * FROM active_portals_summary
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY online_players DESC, created_at DESC
      LIMIT ${filters.limit || 50}
    `;

    const result = await this.db.query(query, values);
    return result.rows;
  }

  // ============================================================================
  // Chat
  // ============================================================================

  /**
   * Send chat message
   */
  async sendChatMessage(portalId, userId, messageText, options = {}) {
    const { messageType = 'chat', replyToMessageId = null, metadata = {} } = options;

    const query = `
      INSERT INTO portal_chat_messages (
        portal_id, user_id, message_text, message_type, reply_to_message_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      portalId,
      userId,
      messageText,
      messageType,
      replyToMessageId,
      JSON.stringify(metadata)
    ]);

    const message = result.rows[0];

    // Broadcast to portal
    this.eventBroadcaster?.broadcast('portal.chat', {
      portalId,
      messageId: message.message_id,
      userId,
      messageText,
      messageType,
      timestamp: message.timestamp
    });

    return message;
  }

  /**
   * Get chat history
   */
  async getChatHistory(portalId, options = {}) {
    const { limit = 100, before = null } = options;

    let query = `
      SELECT * FROM portal_chat_messages
      WHERE portal_id = $1 AND is_deleted = false
    `;

    const values = [portalId];

    if (before) {
      query += ` AND timestamp < $2`;
      values.push(before);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${values.length + 1}`;
    values.push(limit);

    const result = await this.db.query(query, values);
    return result.rows.reverse(); // Oldest first
  }

  // ============================================================================
  // Bucket Battles (Pokémon-Style PvP)
  // ============================================================================

  /**
   * Challenge player to bucket battle
   */
  async challengeBattle(portalId, player1UserId, player1BucketId, player2UserId, player2BucketId, prompt, battleType = 'speed') {
    if (!this.battleTypes[battleType]) {
      throw new Error(`Invalid battle type: ${battleType}`);
    }

    const query = `
      INSERT INTO bucket_battles (
        portal_id, player1_user_id, player1_bucket_id,
        player2_user_id, player2_bucket_id,
        battle_type, prompt, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `;

    const result = await this.db.query(query, [
      portalId,
      player1UserId,
      player1BucketId,
      player2UserId,
      player2BucketId,
      battleType,
      prompt
    ]);

    const battle = result.rows[0];

    // Broadcast challenge
    this.eventBroadcaster?.broadcast('battle.challenged', {
      battleId: battle.battle_id,
      portalId,
      player1UserId,
      player2UserId,
      battleType,
      prompt
    });

    // Send chat notification
    await this.sendChatMessage(portalId, player1UserId, `⚔️ Battle challenge sent!`, {
      messageType: 'battle',
      metadata: { battleId: battle.battle_id, action: 'challenged' }
    });

    console.log(`[MultiplayerPortalManager] Battle ${battle.battle_id} created`);

    return battle;
  }

  /**
   * Execute bucket battle
   */
  async executeBattle(battleId) {
    // Get battle details
    const battleQuery = await this.db.query(
      'SELECT * FROM bucket_battles WHERE battle_id = $1',
      [battleId]
    );

    const battle = battleQuery.rows[0];

    if (!battle) {
      throw new Error('Battle not found');
    }

    if (battle.status !== 'pending') {
      throw new Error('Battle already started or completed');
    }

    // Update status
    await this.db.query(
      "UPDATE bucket_battles SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE battle_id = $1",
      [battleId]
    );

    // Broadcast start
    this.eventBroadcaster?.broadcast('battle.started', {
      battleId,
      portalId: battle.portal_id,
      player1BucketId: battle.player1_bucket_id,
      player2BucketId: battle.player2_bucket_id
    });

    console.log(`[MultiplayerPortalManager] Executing battle ${battleId}...`);

    // Execute both bucket requests concurrently
    const [result1, result2] = await Promise.all([
      this._executeBucketRequest(battle.player1_bucket_id, battle.prompt),
      this._executeBucketRequest(battle.player2_bucket_id, battle.prompt)
    ]);

    // Determine winner
    const { winner, winnerReason } = this._determineBattleWinner(
      battle.battle_type,
      result1,
      result2
    );

    // Award karma
    const karmaP1 = winner === 'player1' ? 50 : 10;
    const karmaP2 = winner === 'player2' ? 50 : 10;

    // Update battle
    const updateQuery = `
      UPDATE bucket_battles SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        player1_response = $1,
        player1_response_time_ms = $2,
        player1_tokens = $3,
        player1_cost_usd = $4,
        player2_response = $5,
        player2_response_time_ms = $6,
        player2_tokens = $7,
        player2_cost_usd = $8,
        winner = $9,
        winner_reason = $10,
        karma_awarded_p1 = $11,
        karma_awarded_p2 = $12
      WHERE battle_id = $13
      RETURNING *
    `;

    const completedBattle = await this.db.query(updateQuery, [
      result1.response,
      result1.responseTimeMs,
      result1.tokens,
      result1.costUsd,
      result2.response,
      result2.responseTimeMs,
      result2.tokens,
      result2.costUsd,
      winner,
      winnerReason,
      karmaP1,
      karmaP2,
      battleId
    ]);

    // Broadcast completion
    this.eventBroadcaster?.broadcast('battle.completed', {
      battleId,
      portalId: battle.portal_id,
      winner,
      winnerReason,
      karmaP1,
      karmaP2
    });

    // Send chat notification
    const winnerName = winner === 'player1' ? 'Player 1' : 'Player 2';
    await this.sendChatMessage(battle.portal_id, null, `🏆 Battle complete! ${winnerName} wins!`, {
      messageType: 'battle',
      metadata: { battleId, winner, winnerReason }
    });

    console.log(`[MultiplayerPortalManager] Battle ${battleId} completed. Winner: ${winner}`);

    return completedBattle.rows[0];
  }

  /**
   * Execute bucket request (helper)
   * @private
   */
  async _executeBucketRequest(bucketId, prompt) {
    const startTime = Date.now();

    try {
      const bucket = this.bucketOrchestrator.buckets.get(bucketId);

      if (!bucket) {
        throw new Error(`Bucket ${bucketId} not found`);
      }

      const response = await bucket.chat([
        { role: 'user', content: prompt }
      ]);

      const responseTimeMs = Date.now() - startTime;

      return {
        response: response.content,
        responseTimeMs,
        tokens: response.usage?.total_tokens || 0,
        costUsd: response.costUsd || 0
      };
    } catch (error) {
      console.error(`[MultiplayerPortalManager] Error executing bucket ${bucketId}:`, error.message);
      return {
        response: `Error: ${error.message}`,
        responseTimeMs: Date.now() - startTime,
        tokens: 0,
        costUsd: 0
      };
    }
  }

  /**
   * Determine battle winner
   * @private
   */
  _determineBattleWinner(battleType, result1, result2) {
    switch (battleType) {
      case 'speed':
        return result1.responseTimeMs < result2.responseTimeMs
          ? { winner: 'player1', winnerReason: `${result1.responseTimeMs}ms vs ${result2.responseTimeMs}ms` }
          : { winner: 'player2', winnerReason: `${result2.responseTimeMs}ms vs ${result1.responseTimeMs}ms` };

      case 'cost':
        return result1.costUsd < result2.costUsd
          ? { winner: 'player1', winnerReason: `$${result1.costUsd} vs $${result2.costUsd}` }
          : { winner: 'player2', winnerReason: `$${result2.costUsd} vs $${result1.costUsd}` };

      case 'quality':
      case 'creativity':
        // These require human judgment - return tie for now
        // TODO: Implement voting system
        return { winner: 'tie', winnerReason: 'Requires human judgment (voting)' };

      default:
        return { winner: 'tie', winnerReason: 'Unknown battle type' };
    }
  }

  // ============================================================================
  // Bucket Trades
  // ============================================================================

  /**
   * Offer bucket trade
   */
  async offerTrade(portalId, player1UserId, player1BucketId, player2UserId, player2BucketId, tradeType = 'swap') {
    const query = `
      INSERT INTO bucket_trades (
        portal_id, player1_user_id, player1_bucket_id,
        player2_user_id, player2_bucket_id, trade_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'offered')
      RETURNING *
    `;

    const result = await this.db.query(query, [
      portalId,
      player1UserId,
      player1BucketId,
      player2UserId,
      player2BucketId,
      tradeType
    ]);

    const trade = result.rows[0];

    // Broadcast trade offer
    this.eventBroadcaster?.broadcast('trade.offered', {
      tradeId: trade.trade_id,
      portalId,
      player1UserId,
      player2UserId,
      tradeType
    });

    // Send chat notification
    await this.sendChatMessage(portalId, player1UserId, `🔄 Trade offered!`, {
      messageType: 'trade',
      metadata: { tradeId: trade.trade_id, action: 'offered' }
    });

    console.log(`[MultiplayerPortalManager] Trade ${trade.trade_id} offered`);

    return trade;
  }

  /**
   * Accept trade
   */
  async acceptTrade(tradeId, userId) {
    // Get trade details
    const tradeQuery = await this.db.query(
      'SELECT * FROM bucket_trades WHERE trade_id = $1',
      [tradeId]
    );

    const trade = tradeQuery.rows[0];

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.status !== 'offered') {
      throw new Error('Trade is no longer available');
    }

    // Check if user is player2
    if (trade.player2_user_id !== userId) {
      throw new Error('Only the trade recipient can accept');
    }

    // Accept trade
    const query = `
      UPDATE bucket_trades
      SET status = 'accepted',
          player2_accepted = true,
          accepted_at = CURRENT_TIMESTAMP
      WHERE trade_id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [tradeId]);

    // Execute trade (swap bucket assignments)
    await this._executeTrade(trade);

    // Broadcast
    this.eventBroadcaster?.broadcast('trade.accepted', {
      tradeId,
      portalId: trade.portal_id
    });

    console.log(`[MultiplayerPortalManager] Trade ${tradeId} accepted and executed`);

    return result.rows[0];
  }

  /**
   * Execute trade (swap buckets)
   * @private
   */
  async _executeTrade(trade) {
    // Swap bucket assignments
    await this.db.query(`
      UPDATE user_bucket_assignments
      SET bucket_id = CASE
        WHEN user_id = $1 THEN $2
        WHEN user_id = $3 THEN $4
      END
      WHERE (user_id = $1 OR user_id = $3)
        AND is_primary_bucket = true
    `, [
      trade.player1_user_id,
      trade.player2_bucket_id,
      trade.player2_user_id,
      trade.player1_bucket_id
    ]);

    // Mark trade complete
    await this.db.query(
      "UPDATE bucket_trades SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE trade_id = $1",
      [trade.trade_id]
    );

    // Send chat notification
    await this.sendChatMessage(trade.portal_id, null, `✅ Trade completed!`, {
      messageType: 'trade',
      metadata: { tradeId: trade.trade_id, action: 'completed' }
    });
  }

  // ============================================================================
  // Collaborative Tasks
  // ============================================================================

  /**
   * Create collaborative task
   */
  async createCollaborativeTask(portalId, taskName, participantUserIds, participantBucketIds, workflowConfig, options = {}) {
    const { taskType = 'chain', taskDescription = '', karmaPerParticipant = 25 } = options;

    const query = `
      INSERT INTO collaborative_tasks (
        portal_id, task_name, task_description, task_type,
        participant_user_ids, participant_bucket_ids,
        workflow_config, karma_per_participant, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `;

    const result = await this.db.query(query, [
      portalId,
      taskName,
      taskDescription,
      taskType,
      participantUserIds,
      participantBucketIds,
      JSON.stringify(workflowConfig),
      karmaPerParticipant
    ]);

    const task = result.rows[0];

    // Broadcast
    this.eventBroadcaster?.broadcast('task.created', {
      taskId: task.task_id,
      portalId,
      taskName,
      participants: participantUserIds.length
    });

    console.log(`[MultiplayerPortalManager] Collaborative task ${task.task_id} created`);

    return task;
  }

  // ============================================================================
  // Leaderboards
  // ============================================================================

  /**
   * Get portal leaderboard
   */
  async getPortalLeaderboard(portalId, limit = 10) {
    const query = `
      SELECT * FROM portal_leaderboards
      WHERE portal_id = $1
      ORDER BY total_karma_earned DESC, battles_won DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [portalId, limit]);
    return result.rows;
  }

  /**
   * Get global battle leaderboard
   */
  async getGlobalLeaderboard(limit = 10) {
    const query = `
      SELECT * FROM global_battle_leaderboard
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows;
  }

  // ============================================================================
  // Presence
  // ============================================================================

  /**
   * Update player presence
   */
  async updatePresence(portalId, userId, status = 'online') {
    const query = `
      UPDATE portal_players
      SET status = $1, last_seen_at = CURRENT_TIMESTAMP
      WHERE portal_id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [status, portalId, userId]);

    // Broadcast
    this.eventBroadcaster?.broadcast('presence.update', {
      portalId,
      userId,
      status
    });

    return result.rows[0];
  }

  /**
   * Get online players in portal
   */
  async getOnlinePlayers(portalId) {
    const query = `
      SELECT * FROM portal_players
      WHERE portal_id = $1 AND status = 'online'
      ORDER BY joined_at
    `;

    const result = await this.db.query(query, [portalId]);
    return result.rows;
  }
}

module.exports = MultiplayerPortalManager;
