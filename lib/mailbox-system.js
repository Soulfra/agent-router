/**
 * Internal Mailbox System (WoW-Style)
 *
 * Features:
 * - User-to-user messaging
 * - NPC mail (system notifications, quests, rewards)
 * - Attachments (vouchers, credits, items)
 * - Read receipts and delivery tracking
 * - Cross-device sync support
 * - Role-playing layer (NPCs can be hidden players)
 * - Generational influence tracking
 */

class MailboxSystem {
  constructor(db) {
    if (!db) {
      throw new Error('Database instance required for MailboxSystem');
    }
    this.db = db;
    console.log('[MailboxSystem] Initialized');
  }

  /**
   * Send mail from one user to another
   */
  async sendMail({ fromUserId, toUserId, subject, body, messageType = 'user', metadata = {} }) {
    try {
      const result = await this.db.query(
        `SELECT send_mail($1, $2, $3, $4, $5) AS message_id`,
        [fromUserId, toUserId, subject, body, messageType]
      );

      const messageId = result.rows[0].message_id;

      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        await this.db.query(
          `UPDATE mailbox_messages
           SET metadata = $1, updated_at = NOW()
           WHERE message_id = $2`,
          [JSON.stringify(metadata), messageId]
        );
      }

      return {
        success: true,
        message_id: messageId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        sent_at: new Date()
      };
    } catch (error) {
      console.error('[MailboxSystem] Error sending mail:', error);
      throw error;
    }
  }

  /**
   * Send NPC mail (from an NPC character)
   */
  async sendNpcMail({ npcId, toUserId, subject, body, attachments = [] }) {
    try {
      const result = await this.db.query(
        `SELECT send_npc_mail($1, $2, $3, $4) AS message_id`,
        [npcId, toUserId, subject, body]
      );

      const messageId = result.rows[0].message_id;

      // Add attachments if provided
      if (attachments.length > 0) {
        await this.addAttachments(messageId, attachments);
      }

      return {
        success: true,
        message_id: messageId,
        npc_id: npcId,
        to_user_id: toUserId,
        sent_at: new Date()
      };
    } catch (error) {
      console.error('[MailboxSystem] Error sending NPC mail:', error);
      throw error;
    }
  }

  /**
   * Get user's inbox
   */
  async getInbox(userId, { includeRead = false, limit = 50, offset = 0 } = {}) {
    try {
      const result = await this.db.query(
        `SELECT
          message_id,
          from_user_id,
          subject,
          body,
          message_type,
          npc_name,
          has_attachments,
          attachment_count,
          status,
          sent_at,
          read_at
         FROM get_inbox($1, $2)
         LIMIT $3 OFFSET $4`,
        [userId, includeRead, limit, offset]
      );

      return {
        success: true,
        messages: result.rows,
        count: result.rows.length,
        has_more: result.rows.length === limit
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting inbox:', error);
      throw error;
    }
  }

  /**
   * Get a specific message
   */
  async getMessage(messageId, userId) {
    try {
      const result = await this.db.query(
        `SELECT
          m.*,
          COALESCE(
            json_agg(
              json_build_object(
                'attachment_id', a.attachment_id,
                'attachment_type', a.attachment_type,
                'attachment_data', a.attachment_data,
                'voucher_id', a.voucher_id,
                'item_type', a.item_type,
                'item_quantity', a.item_quantity,
                'claimed', a.claimed,
                'claimed_at', a.claimed_at
              )
            ) FILTER (WHERE a.attachment_id IS NOT NULL),
            '[]'
          ) AS attachments
         FROM mailbox_messages m
         LEFT JOIN mailbox_attachments a ON m.message_id = a.message_id
         WHERE m.message_id = $1 AND m.to_user_id = $2
         GROUP BY m.message_id`,
        [messageId, userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Message not found or access denied'
        };
      }

      return {
        success: true,
        message: result.rows[0]
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting message:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markRead(messageId, userId) {
    try {
      const result = await this.db.query(
        `SELECT mark_mail_read($1, $2) AS success`,
        [messageId, userId]
      );

      return {
        success: result.rows[0].success,
        message_id: messageId,
        read_at: new Date()
      };
    } catch (error) {
      console.error('[MailboxSystem] Error marking message read:', error);
      throw error;
    }
  }

  /**
   * Archive message
   */
  async archiveMessage(messageId, userId) {
    try {
      await this.db.query(
        `UPDATE mailbox_messages
         SET status = 'archived', updated_at = NOW()
         WHERE message_id = $1 AND to_user_id = $2`,
        [messageId, userId]
      );

      return {
        success: true,
        message_id: messageId
      };
    } catch (error) {
      console.error('[MailboxSystem] Error archiving message:', error);
      throw error;
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId, userId) {
    try {
      await this.db.query(
        `UPDATE mailbox_messages
         SET status = 'deleted', updated_at = NOW()
         WHERE message_id = $1 AND to_user_id = $2`,
        [messageId, userId]
      );

      return {
        success: true,
        message_id: messageId
      };
    } catch (error) {
      console.error('[MailboxSystem] Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Add attachments to a message
   */
  async addAttachments(messageId, attachments) {
    try {
      for (const attachment of attachments) {
        await this.db.query(
          `INSERT INTO mailbox_attachments (
            message_id,
            attachment_type,
            attachment_data,
            voucher_id,
            item_type,
            item_quantity
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            messageId,
            attachment.type,
            JSON.stringify(attachment.data || {}),
            attachment.voucherId || null,
            attachment.itemType || null,
            attachment.itemQuantity || 1
          ]
        );
      }

      // Update message attachment count
      await this.db.query(
        `UPDATE mailbox_messages
         SET
           has_attachments = TRUE,
           attachment_count = (
             SELECT COUNT(*) FROM mailbox_attachments WHERE message_id = $1
           ),
           updated_at = NOW()
         WHERE message_id = $1`,
        [messageId]
      );

      return {
        success: true,
        message_id: messageId,
        attachment_count: attachments.length
      };
    } catch (error) {
      console.error('[MailboxSystem] Error adding attachments:', error);
      throw error;
    }
  }

  /**
   * Claim attachment (mark as claimed)
   */
  async claimAttachment(attachmentId, userId) {
    try {
      // Verify user has access to this attachment
      const checkResult = await this.db.query(
        `SELECT a.*, m.to_user_id
         FROM mailbox_attachments a
         JOIN mailbox_messages m ON a.message_id = m.message_id
         WHERE a.attachment_id = $1`,
        [attachmentId]
      );

      if (checkResult.rows.length === 0) {
        return {
          success: false,
          error: 'Attachment not found'
        };
      }

      const attachment = checkResult.rows[0];

      if (attachment.to_user_id !== userId) {
        return {
          success: false,
          error: 'Access denied'
        };
      }

      if (attachment.claimed) {
        return {
          success: false,
          error: 'Attachment already claimed'
        };
      }

      // Mark as claimed
      await this.db.query(
        `UPDATE mailbox_attachments
         SET claimed = TRUE, claimed_at = NOW()
         WHERE attachment_id = $1`,
        [attachmentId]
      );

      return {
        success: true,
        attachment_id: attachmentId,
        attachment_type: attachment.attachment_type,
        attachment_data: attachment.attachment_data,
        claimed_at: new Date()
      };
    } catch (error) {
      console.error('[MailboxSystem] Error claiming attachment:', error);
      throw error;
    }
  }

  /**
   * Get unread mail count
   */
  async getUnreadCount(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          unread_count,
          unread_npc_count,
          unread_quest_count,
          unread_with_attachments
         FROM unread_mail_counts
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: true,
          unread_count: 0,
          unread_npc_count: 0,
          unread_quest_count: 0,
          unread_with_attachments: 0
        };
      }

      return {
        success: true,
        ...result.rows[0]
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Get sent messages
   */
  async getSentMessages(userId, { limit = 50, offset = 0 } = {}) {
    try {
      const result = await this.db.query(
        `SELECT
          message_id,
          to_user_id,
          subject,
          body,
          message_type,
          has_attachments,
          attachment_count,
          status,
          sent_at,
          read_at
         FROM mailbox_messages
         WHERE from_user_id = $1
         ORDER BY sent_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return {
        success: true,
        messages: result.rows,
        count: result.rows.length,
        has_more: result.rows.length === limit
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting sent messages:', error);
      throw error;
    }
  }

  /**
   * Track cross-device sync
   */
  async syncToDevice(messageId, deviceId) {
    try {
      await this.db.query(
        `UPDATE mailbox_messages
         SET
           synced_to_devices = array_append(
             COALESCE(synced_to_devices, ARRAY[]::UUID[]),
             $2::UUID
           ),
           last_sync_at = NOW(),
           updated_at = NOW()
         WHERE message_id = $1
           AND NOT ($2::UUID = ANY(COALESCE(synced_to_devices, ARRAY[]::UUID[])))`,
        [messageId, deviceId]
      );

      return {
        success: true,
        message_id: messageId,
        device_id: deviceId,
        synced_at: new Date()
      };
    } catch (error) {
      console.error('[MailboxSystem] Error syncing to device:', error);
      throw error;
    }
  }

  /**
   * Get messages needing sync for a device
   */
  async getMessagesForSync(userId, deviceId, { since = null } = {}) {
    try {
      const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days

      const result = await this.db.query(
        `SELECT
          message_id,
          from_user_id,
          subject,
          body,
          message_type,
          npc_name,
          has_attachments,
          attachment_count,
          status,
          sent_at,
          read_at,
          synced_to_devices
         FROM mailbox_messages
         WHERE to_user_id = $1
           AND (
             NOT ($2::UUID = ANY(COALESCE(synced_to_devices, ARRAY[]::UUID[])))
             OR updated_at > $3
           )
           AND status != 'deleted'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY sent_at DESC`,
        [userId, deviceId, sinceDate]
      );

      return {
        success: true,
        messages: result.rows,
        count: result.rows.length,
        device_id: deviceId,
        since: sinceDate
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting messages for sync:', error);
      throw error;
    }
  }

  /**
   * Create generational influence
   */
  async createInfluence({ sourceType, sourceId, effectType, targetType, targetId, sourceGeneration, affectsGeneration, weight = 1.0, effectData = {} }) {
    try {
      const result = await this.db.query(
        `INSERT INTO generational_influences (
          source_type,
          source_id,
          effect_type,
          target_type,
          target_id,
          source_generation,
          affects_generation,
          weight,
          effect_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING influence_id`,
        [
          sourceType,
          sourceId,
          effectType,
          targetType,
          targetId,
          sourceGeneration,
          affectsGeneration,
          weight,
          JSON.stringify(effectData)
        ]
      );

      return {
        success: true,
        influence_id: result.rows[0].influence_id
      };
    } catch (error) {
      console.error('[MailboxSystem] Error creating influence:', error);
      throw error;
    }
  }

  /**
   * Get influences affecting current generation
   */
  async getActiveInfluences(generation, { targetType = null, targetId = null } = {}) {
    try {
      let query = `
        SELECT
          influence_id,
          source_type,
          source_id,
          effect_type,
          target_type,
          target_id,
          source_generation,
          affects_generation,
          weight,
          effect_data,
          created_at
        FROM generational_influences
        WHERE affects_generation = $1
      `;
      const params = [generation];

      if (targetType) {
        query += ` AND target_type = $${params.length + 1}`;
        params.push(targetType);
      }

      if (targetId) {
        query += ` AND target_id = $${params.length + 1}`;
        params.push(targetId);
      }

      query += ` ORDER BY weight DESC, created_at DESC`;

      const result = await this.db.query(query, params);

      return {
        success: true,
        influences: result.rows,
        count: result.rows.length,
        generation
      };
    } catch (error) {
      console.error('[MailboxSystem] Error getting active influences:', error);
      throw error;
    }
  }
}

module.exports = MailboxSystem;
