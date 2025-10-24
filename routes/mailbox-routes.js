/**
 * Mailbox API Routes (WoW-Style Internal Messaging)
 *
 * Endpoints:
 * - POST   /mailbox/send          - Send mail to another user
 * - POST   /mailbox/npc/send      - Send NPC mail
 * - GET    /mailbox/inbox         - Get inbox messages
 * - GET    /mailbox/sent          - Get sent messages
 * - GET    /mailbox/:id           - Get specific message
 * - POST   /mailbox/:id/read      - Mark message as read
 * - POST   /mailbox/:id/archive   - Archive message
 * - DELETE /mailbox/:id           - Delete message
 * - POST   /mailbox/:id/attach    - Add attachments
 * - POST   /mailbox/attach/:id/claim - Claim attachment
 * - GET    /mailbox/unread        - Get unread count
 * - GET    /mailbox/sync          - Get messages for device sync
 * - POST   /mailbox/sync/:id      - Mark message as synced to device
 * - POST   /mailbox/influence     - Create generational influence
 * - GET    /mailbox/influence     - Get active influences
 */

const express = require('express');

function initMailboxRoutes(mailboxSystem) {
  const router = express.Router();

  /**
   * Send mail to another user
   * POST /mailbox/send
   * Body: { toUserId, subject, body, messageType?, metadata? }
   */
  router.post('/send', async (req, res) => {
    try {
      const { toUserId, subject, body, messageType, metadata } = req.body;
      const fromUserId = req.user?.user_id || req.headers['x-user-id'];

      if (!fromUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!toUserId || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: toUserId, subject, body'
        });
      }

      const result = await mailboxSystem.sendMail({
        fromUserId,
        toUserId,
        subject,
        body,
        messageType: messageType || 'user',
        metadata: metadata || {}
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error sending mail:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Send NPC mail
   * POST /mailbox/npc/send
   * Body: { npcId, toUserId, subject, body, attachments? }
   */
  router.post('/npc/send', async (req, res) => {
    try {
      const { npcId, toUserId, subject, body, attachments } = req.body;

      if (!npcId || !toUserId || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: npcId, toUserId, subject, body'
        });
      }

      const result = await mailboxSystem.sendNpcMail({
        npcId,
        toUserId,
        subject,
        body,
        attachments: attachments || []
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error sending NPC mail:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get inbox
   * GET /mailbox/inbox
   * Query: includeRead, limit, offset
   */
  router.get('/inbox', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const includeRead = req.query.includeRead === 'true';
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const result = await mailboxSystem.getInbox(userId, {
        includeRead,
        limit,
        offset
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting inbox:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get sent messages
   * GET /mailbox/sent
   * Query: limit, offset
   */
  router.get('/sent', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const result = await mailboxSystem.getSentMessages(userId, {
        limit,
        offset
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting sent messages:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get specific message
   * GET /mailbox/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const messageId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.getMessage(messageId, userId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting message:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Mark message as read
   * POST /mailbox/:id/read
   */
  router.post('/:id/read', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const messageId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.markRead(messageId, userId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error marking message read:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Archive message
   * POST /mailbox/:id/archive
   */
  router.post('/:id/archive', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const messageId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.archiveMessage(messageId, userId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error archiving message:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Delete message
   * DELETE /mailbox/:id
   */
  router.delete('/:id', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const messageId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.deleteMessage(messageId, userId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error deleting message:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Add attachments to message
   * POST /mailbox/:id/attach
   * Body: { attachments: [{ type, data, voucherId?, itemType?, itemQuantity? }] }
   */
  router.post('/:id/attach', async (req, res) => {
    try {
      const messageId = req.params.id;
      const { attachments } = req.body;

      if (!attachments || !Array.isArray(attachments)) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid attachments array'
        });
      }

      const result = await mailboxSystem.addAttachments(messageId, attachments);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error adding attachments:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Claim attachment
   * POST /mailbox/attach/:id/claim
   */
  router.post('/attach/:id/claim', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const attachmentId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.claimAttachment(attachmentId, userId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error claiming attachment:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get unread count
   * GET /mailbox/unread
   */
  router.get('/unread', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await mailboxSystem.getUnreadCount(userId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting unread count:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get messages for device sync
   * GET /mailbox/sync
   * Query: deviceId, since
   */
  router.get('/sync', async (req, res) => {
    try {
      const userId = req.user?.user_id || req.headers['x-user-id'];
      const deviceId = req.query.deviceId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Missing deviceId query parameter'
        });
      }

      const since = req.query.since ? new Date(req.query.since) : null;

      const result = await mailboxSystem.getMessagesForSync(userId, deviceId, {
        since
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting sync messages:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Mark message as synced to device
   * POST /mailbox/sync/:id
   * Body: { deviceId }
   */
  router.post('/sync/:id', async (req, res) => {
    try {
      const messageId = req.params.id;
      const { deviceId } = req.body;

      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Missing deviceId in request body'
        });
      }

      const result = await mailboxSystem.syncToDevice(messageId, deviceId);

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error syncing to device:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Create generational influence
   * POST /mailbox/influence
   * Body: {
   *   sourceType, sourceId, effectType, targetType, targetId,
   *   sourceGeneration, affectsGeneration, weight?, effectData?
   * }
   */
  router.post('/influence', async (req, res) => {
    try {
      const {
        sourceType,
        sourceId,
        effectType,
        targetType,
        targetId,
        sourceGeneration,
        affectsGeneration,
        weight,
        effectData
      } = req.body;

      if (!sourceType || !effectType || !targetType || !sourceGeneration || !affectsGeneration) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      const result = await mailboxSystem.createInfluence({
        sourceType,
        sourceId,
        effectType,
        targetType,
        targetId,
        sourceGeneration,
        affectsGeneration,
        weight: weight || 1.0,
        effectData: effectData || {}
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error creating influence:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get active influences for generation
   * GET /mailbox/influence
   * Query: generation, targetType?, targetId?
   */
  router.get('/influence', async (req, res) => {
    try {
      const generation = parseInt(req.query.generation, 10);
      const targetType = req.query.targetType;
      const targetId = req.query.targetId;

      if (!generation) {
        return res.status(400).json({
          success: false,
          error: 'Missing generation query parameter'
        });
      }

      const result = await mailboxSystem.getActiveInfluences(generation, {
        targetType,
        targetId
      });

      res.json(result);
    } catch (error) {
      console.error('[MailboxRoutes] Error getting influences:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = initMailboxRoutes;
