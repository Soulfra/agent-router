/**
 * NPC Manager (Role-Playing Layer)
 *
 * Features:
 * - NPC registry and personality management
 * - Hidden player mode (players controlling NPCs)
 * - Shift scheduling for role-players
 * - Personality evolution based on community sentiment
 * - Auto-reply templates with context awareness
 * - Quest and reward distribution
 * - Community interaction tracking
 */

class NPCManager {
  constructor(db, mailboxSystem) {
    if (!db) {
      throw new Error('Database instance required for NPCManager');
    }
    this.db = db;
    this.mailboxSystem = mailboxSystem;

    // Active roleplay sessions: Map<npcId, { userId, startedAt, shiftEndAt }>
    this.activeRoleplayers = new Map();

    console.log('[NPCManager] Initialized');
  }

  /**
   * Create a new NPC
   */
  async createNPC({
    npcName,
    npcType,
    personality = {},
    isRoleplay = false,
    roleplayUserId = null,
    roleplayShiftSchedule = null,
    canSendQuests = false,
    canSendRewards = false,
    autoReplyEnabled = false,
    autoReplyTemplate = null
  }) {
    try {
      const result = await this.db.query(
        `INSERT INTO npc_registry (
          npc_name,
          npc_type,
          personality,
          is_roleplay,
          roleplay_user_id,
          roleplay_shift_schedule,
          can_send_quests,
          can_send_rewards,
          auto_reply_enabled,
          auto_reply_template
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING npc_id, npc_name, npc_type`,
        [
          npcName,
          npcType,
          JSON.stringify(personality),
          isRoleplay,
          roleplayUserId,
          roleplayShiftSchedule,
          canSendQuests,
          canSendRewards,
          autoReplyEnabled,
          autoReplyTemplate
        ]
      );

      const npc = result.rows[0];

      console.log(`[NPCManager] Created NPC: ${npcName} (${npcType})`);

      return {
        success: true,
        npc
      };
    } catch (error) {
      console.error('[NPCManager] Error creating NPC:', error);
      throw error;
    }
  }

  /**
   * Get NPC by ID
   */
  async getNPC(npcId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM npc_registry WHERE npc_id = $1`,
        [npcId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'NPC not found'
        };
      }

      return {
        success: true,
        npc: result.rows[0]
      };
    } catch (error) {
      console.error('[NPCManager] Error getting NPC:', error);
      throw error;
    }
  }

  /**
   * Get all NPCs
   */
  async getAllNPCs({ includeInactive = false } = {}) {
    try {
      let query = `SELECT * FROM npc_registry`;
      if (!includeInactive) {
        query += ` WHERE active = TRUE`;
      }
      query += ` ORDER BY npc_name`;

      const result = await this.db.query(query);

      return {
        success: true,
        npcs: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      console.error('[NPCManager] Error getting NPCs:', error);
      throw error;
    }
  }

  /**
   * Update NPC personality
   */
  async updatePersonality(npcId, personalityUpdates) {
    try {
      const result = await this.db.query(
        `UPDATE npc_registry
         SET
           personality = personality || $1::jsonb,
           updated_at = NOW()
         WHERE npc_id = $2
         RETURNING npc_id, npc_name, personality`,
        [JSON.stringify(personalityUpdates), npcId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'NPC not found'
        };
      }

      console.log(`[NPCManager] Updated personality for ${result.rows[0].npc_name}`);

      return {
        success: true,
        npc: result.rows[0]
      };
    } catch (error) {
      console.error('[NPCManager] Error updating personality:', error);
      throw error;
    }
  }

  /**
   * Start roleplay shift (player takes control of NPC)
   */
  async startRoleplayShift(npcId, userId, { shiftDurationMinutes = 60 } = {}) {
    try {
      // Check if NPC is roleplay-enabled
      const npcResult = await this.getNPC(npcId);
      if (!npcResult.success) {
        return npcResult;
      }

      const npc = npcResult.npc;

      if (!npc.is_roleplay) {
        return {
          success: false,
          error: 'NPC is not roleplay-enabled'
        };
      }

      // Check if NPC is already being controlled
      if (this.activeRoleplayers.has(npcId)) {
        return {
          success: false,
          error: 'NPC is already being controlled by another player'
        };
      }

      // Start shift
      const shift = {
        userId,
        npcId,
        startedAt: new Date(),
        shiftEndAt: new Date(Date.now() + shiftDurationMinutes * 60 * 1000)
      };

      this.activeRoleplayers.set(npcId, shift);

      console.log(`[NPCManager] Player ${userId} started roleplay shift as ${npc.npc_name}`);

      return {
        success: true,
        shift
      };
    } catch (error) {
      console.error('[NPCManager] Error starting roleplay shift:', error);
      throw error;
    }
  }

  /**
   * End roleplay shift
   */
  async endRoleplayShift(npcId) {
    if (!this.activeRoleplayers.has(npcId)) {
      return {
        success: false,
        error: 'No active roleplay shift for this NPC'
      };
    }

    const shift = this.activeRoleplayers.get(npcId);
    this.activeRoleplayers.delete(npcId);

    const duration = Date.now() - shift.startedAt.getTime();

    console.log(`[NPCManager] Roleplay shift ended for NPC ${npcId} (duration: ${Math.round(duration / 60000)}m)`);

    return {
      success: true,
      shift,
      durationMs: duration
    };
  }

  /**
   * Check if player is currently roleplaying as NPC
   */
  isPlayerRoleplaying(npcId, userId) {
    const shift = this.activeRoleplayers.get(npcId);
    return shift && shift.userId === userId;
  }

  /**
   * Send NPC mail (handles auto-reply logic)
   */
  async sendNPCMail({ npcId, toUserId, subject, body, attachments = [] }) {
    try {
      // Get NPC details
      const npcResult = await this.getNPC(npcId);
      if (!npcResult.success) {
        return npcResult;
      }

      const npc = npcResult.npc;

      // Apply personality to message
      const personalizedBody = this.applyPersonality(body, npc.personality);

      // Send mail
      const mailResult = await this.mailboxSystem.sendNpcMail({
        npcId,
        toUserId,
        subject,
        body: personalizedBody,
        attachments
      });

      return mailResult;
    } catch (error) {
      console.error('[NPCManager] Error sending NPC mail:', error);
      throw error;
    }
  }

  /**
   * Handle incoming message to NPC (auto-reply or forward to roleplayer)
   */
  async handleIncomingMessage({ npcId, fromUserId, subject, body }) {
    try {
      const npcResult = await this.getNPC(npcId);
      if (!npcResult.success) {
        return npcResult;
      }

      const npc = npcResult.npc;

      // If there's an active roleplayer, notify them
      if (this.activeRoleplayers.has(npcId)) {
        const shift = this.activeRoleplayers.get(npcId);
        // Forward to roleplayer
        await this.mailboxSystem.sendMail({
          fromUserId: null, // System message
          toUserId: shift.userId,
          subject: `[NPC: ${npc.npc_name}] ${subject}`,
          body: `You received a message while roleplaying as ${npc.npc_name}:\n\n${body}`,
          messageType: 'roleplay_notification'
        });

        return {
          success: true,
          forwarded: true,
          toUserId: shift.userId
        };
      }

      // Auto-reply if enabled
      if (npc.auto_reply_enabled && npc.auto_reply_template) {
        const replyBody = this.generateAutoReply(npc.auto_reply_template, {
          fromUserId,
          subject,
          body
        });

        await this.sendNPCMail({
          npcId,
          toUserId: fromUserId,
          subject: `Re: ${subject}`,
          body: replyBody
        });

        return {
          success: true,
          autoReplied: true
        };
      }

      return {
        success: true,
        queued: true,
        message: 'Message queued for NPC'
      };
    } catch (error) {
      console.error('[NPCManager] Error handling incoming message:', error);
      throw error;
    }
  }

  /**
   * Apply personality traits to message
   */
  applyPersonality(body, personality) {
    const { tone, greeting, signature } = personality;

    let personalizedBody = body;

    // Add greeting if available
    if (greeting) {
      personalizedBody = `${greeting}\n\n${personalizedBody}`;
    }

    // Add signature if available
    if (signature) {
      personalizedBody = `${personalizedBody}\n\n${signature}`;
    }

    // Adjust tone (basic implementation)
    if (tone === 'formal') {
      personalizedBody = personalizedBody.replace(/hey/gi, 'Greetings');
    } else if (tone === 'friendly') {
      personalizedBody = personalizedBody.replace(/greetings/gi, 'Hey there');
    }

    return personalizedBody;
  }

  /**
   * Generate auto-reply from template
   */
  generateAutoReply(template, { fromUserId, subject, body }) {
    let reply = template;

    // Replace placeholders
    reply = reply.replace(/\{subject\}/g, subject);
    reply = reply.replace(/\{userId\}/g, fromUserId);
    reply = reply.replace(/\{timestamp\}/g, new Date().toISOString());

    return reply;
  }

  /**
   * Update community sentiment for NPC
   */
  async updateSentiment(npcId, sentimentDelta) {
    try {
      const result = await this.db.query(
        `UPDATE npc_registry
         SET
           sentiment_score = sentiment_score + $1,
           interaction_count = interaction_count + 1,
           updated_at = NOW()
         WHERE npc_id = $2
         RETURNING npc_id, npc_name, sentiment_score, interaction_count`,
        [sentimentDelta, npcId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'NPC not found'
        };
      }

      const npc = result.rows[0];

      // Trigger personality evolution if sentiment crosses threshold
      if (Math.abs(npc.sentiment_score) > 10) {
        await this.evolvePersonality(npcId, npc.sentiment_score);
      }

      return {
        success: true,
        npc
      };
    } catch (error) {
      console.error('[NPCManager] Error updating sentiment:', error);
      throw error;
    }
  }

  /**
   * Evolve NPC personality based on community interactions
   */
  async evolvePersonality(npcId, sentimentScore) {
    try {
      const npcResult = await this.getNPC(npcId);
      if (!npcResult.success) {
        return npcResult;
      }

      const npc = npcResult.npc;

      if (!npc.evolves_with_community) {
        return {
          success: false,
          message: 'NPC personality is static'
        };
      }

      const personality = npc.personality;

      // Evolve tone based on sentiment
      if (sentimentScore > 10) {
        personality.tone = 'friendly';
        personality.greeting = 'Hello, friend!';
      } else if (sentimentScore < -10) {
        personality.tone = 'distant';
        personality.greeting = 'Yes?';
      }

      await this.updatePersonality(npcId, personality);

      console.log(`[NPCManager] Evolved personality for ${npc.npc_name} based on sentiment ${sentimentScore}`);

      return {
        success: true,
        evolved: true,
        newPersonality: personality
      };
    } catch (error) {
      console.error('[NPCManager] Error evolving personality:', error);
      throw error;
    }
  }

  /**
   * Get NPC statistics
   */
  async getNPCStats() {
    try {
      const result = await this.db.query(
        `SELECT * FROM npc_mail_stats`
      );

      return {
        success: true,
        stats: result.rows,
        activeRoleplayers: this.activeRoleplayers.size
      };
    } catch (error) {
      console.error('[NPCManager] Error getting NPC stats:', error);
      throw error;
    }
  }

  /**
   * Send quest mail from NPC
   */
  async sendQuest({ npcId, toUserId, questTitle, questDescription, rewards = [] }) {
    try {
      const npcResult = await this.getNPC(npcId);
      if (!npcResult.success) {
        return npcResult;
      }

      const npc = npcResult.npc;

      if (!npc.can_send_quests) {
        return {
          success: false,
          error: 'NPC cannot send quests'
        };
      }

      // Create quest mail
      const attachments = rewards.map(reward => ({
        type: 'reward',
        data: reward
      }));

      const mailResult = await this.sendNPCMail({
        npcId,
        toUserId,
        subject: `Quest: ${questTitle}`,
        body: questDescription,
        attachments
      });

      console.log(`[NPCManager] Quest sent from ${npc.npc_name}: ${questTitle}`);

      return mailResult;
    } catch (error) {
      console.error('[NPCManager] Error sending quest:', error);
      throw error;
    }
  }

  /**
   * Clean up expired roleplay shifts
   */
  cleanupExpiredShifts() {
    const now = Date.now();
    let cleaned = 0;

    for (const [npcId, shift] of this.activeRoleplayers.entries()) {
      if (now > shift.shiftEndAt.getTime()) {
        this.activeRoleplayers.delete(npcId);
        cleaned++;
        console.log(`[NPCManager] Expired roleplay shift for NPC ${npcId}`);
      }
    }

    return cleaned;
  }
}

module.exports = NPCManager;
