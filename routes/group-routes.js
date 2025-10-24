/**
 * Group Management API Routes
 *
 * Endpoints for friend groups, sports teams, communities, and notifications.
 *
 * Endpoints:
 * - POST /api/groups - Create group
 * - GET /api/groups/:groupId - Get group details
 * - PUT /api/groups/:groupId - Update group
 * - DELETE /api/groups/:groupId - Delete group
 * - GET /api/groups/user/:userId - Get user's groups
 * - POST /api/groups/:groupId/members - Add member
 * - DELETE /api/groups/:groupId/members/:userId - Remove member
 * - GET /api/groups/:groupId/members - Get members
 * - POST /api/groups/:groupId/invite - Generate invite link
 * - POST /api/groups/join/:inviteCode - Join via invite
 * - POST /api/groups/:groupId/branding - Update branding
 * - GET /api/groups/:groupId/branding - Get branding
 * - POST /api/groups/:groupId/events - Create event
 * - GET /api/groups/:groupId/events - Get events
 * - POST /api/groups/:groupId/notifications/send - Send notification
 * - POST /api/groups/:groupId/notifications/brick - Start brick mode
 * - DELETE /api/groups/:groupId/notifications/brick - Stop brick mode
 * - GET /api/groups/:groupId/notifications/preferences - Get notification preferences
 * - PUT /api/groups/:groupId/notifications/preferences - Update notification preferences
 */

const express = require('express');

module.exports = function(groupManager, notificationSystem, brandingGenerator) {
  const router = express.Router();

  // ============================================================================
  // GROUP CRUD
  // ============================================================================

  /**
   * POST /api/groups
   * Create new group
   */
  router.post('/groups', async (req, res) => {
    try {
      const { ownerId, name, description, type, branding, privacy } = req.body;

      if (!ownerId || !name || !type) {
        return res.status(400).json({
          success: false,
          error: 'ownerId, name, and type required'
        });
      }

      const result = await groupManager.createGroup({
        ownerId,
        name,
        description,
        type,
        branding,
        privacy
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error creating group:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId
   * Get group details
   */
  router.get('/groups/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.query;

      const result = await groupManager.getGroup(groupId, userId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting group:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/user/:userId
   * Get user's groups
   */
  router.get('/groups/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await groupManager.getUserGroups(userId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting user groups:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // MEMBERS
  // ============================================================================

  /**
   * POST /api/groups/:groupId/members
   * Add member to group
   */
  router.post('/groups/:groupId/members', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, role, addedBy, inviteCode } = req.body;

      if (!userId || !addedBy) {
        return res.status(400).json({
          success: false,
          error: 'userId and addedBy required'
        });
      }

      const result = await groupManager.addMember({
        groupId,
        userId,
        role,
        addedBy,
        inviteCode
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error adding member:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/groups/:groupId/members/:userId
   * Remove member from group
   */
  router.delete('/groups/:groupId/members/:userId', async (req, res) => {
    try {
      const { groupId, userId } = req.params;
      const { removedBy } = req.body;

      if (!removedBy) {
        return res.status(400).json({
          success: false,
          error: 'removedBy required'
        });
      }

      const result = await groupManager.removeMember({
        groupId,
        userId,
        removedBy
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error removing member:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/members
   * Get group members
   */
  router.get('/groups/:groupId/members', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { limit = 100 } = req.query;

      const result = await groupManager.getMembers(groupId, parseInt(limit));

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting members:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // INVITES
  // ============================================================================

  /**
   * POST /api/groups/:groupId/invite
   * Generate invite link
   */
  router.post('/groups/:groupId/invite', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { createdBy, expiresIn, maxUses, role } = req.body;

      if (!createdBy) {
        return res.status(400).json({
          success: false,
          error: 'createdBy required'
        });
      }

      const result = await groupManager.generateInviteLink(groupId, createdBy, {
        expiresIn,
        maxUses,
        role
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error generating invite:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/groups/join/:inviteCode
   * Join group via invite code
   */
  router.post('/groups/join/:inviteCode', async (req, res) => {
    try {
      const { inviteCode } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId required'
        });
      }

      const result = await groupManager.joinViaInvite(inviteCode, userId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error joining via invite:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // BRANDING
  // ============================================================================

  /**
   * POST /api/groups/:groupId/branding
   * Update group branding
   */
  router.post('/groups/:groupId/branding', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { branding } = req.body;

      if (!branding) {
        return res.status(400).json({
          success: false,
          error: 'branding required'
        });
      }

      const result = await groupManager.updateGroupBranding(groupId, branding);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error updating branding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/branding
   * Get group branding
   */
  router.get('/groups/:groupId/branding', async (req, res) => {
    try {
      const { groupId } = req.params;

      const result = await brandingGenerator.getBranding(groupId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting branding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/groups/:groupId/branding/generate
   * Generate new branding for group
   */
  router.post('/groups/:groupId/branding/generate', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { name, type, customColors, customIcon } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          error: 'name and type required'
        });
      }

      const result = await brandingGenerator.generateGroupBranding({
        name,
        type,
        customColors,
        customIcon
      });

      if (result.success) {
        // Save to group
        await brandingGenerator.saveBranding(groupId, result.branding);
      }

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error generating branding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/branding/preview
   * Get branding preview HTML
   */
  router.get('/groups/:groupId/branding/preview', async (req, res) => {
    try {
      const { groupId } = req.params;

      const brandingResult = await brandingGenerator.getBranding(groupId);

      if (!brandingResult.success) {
        return res.status(404).json(brandingResult);
      }

      const html = brandingGenerator.generateBrandingPreview(brandingResult.branding);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('[GroupRoutes] Error generating preview:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  /**
   * POST /api/groups/:groupId/notifications/send
   * Send notification to group members
   */
  router.post('/groups/:groupId/notifications/send', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, fromUser, message, type, metadata } = req.body;

      if (!userId || !fromUser || !message) {
        return res.status(400).json({
          success: false,
          error: 'userId, fromUser, and message required'
        });
      }

      const result = await notificationSystem.sendNotification({
        groupId,
        userId,
        fromUser,
        message,
        type,
        metadata
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error sending notification:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/groups/:groupId/notifications/brick
   * Start brick mode (consensual notification spam)
   */
  router.post('/groups/:groupId/notifications/brick', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { initiatedBy, targetUsers, duration } = req.body;

      if (!initiatedBy || !targetUsers) {
        return res.status(400).json({
          success: false,
          error: 'initiatedBy and targetUsers required'
        });
      }

      const result = await notificationSystem.startBrickMode({
        groupId,
        initiatedBy,
        targetUsers,
        duration
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error starting brick mode:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/groups/:groupId/notifications/brick
   * Stop brick mode
   */
  router.delete('/groups/:groupId/notifications/brick', async (req, res) => {
    try {
      const { groupId } = req.params;

      const result = await notificationSystem.stopBrickMode(groupId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error stopping brick mode:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/notifications/preferences
   * Get notification preferences
   */
  router.get('/groups/:groupId/notifications/preferences', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId query parameter required'
        });
      }

      const result = await notificationSystem.getPreferences(groupId, userId);

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting preferences:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /api/groups/:groupId/notifications/preferences
   * Update notification preferences
   */
  router.put('/groups/:groupId/notifications/preferences', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, mode, muteUntil } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId required'
        });
      }

      const result = await notificationSystem.setPreferences({
        groupId,
        userId,
        mode,
        muteUntil
      });

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error updating preferences:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/notifications/stats
   * Get notification stats for group
   */
  router.get('/groups/:groupId/notifications/stats', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { days = 7 } = req.query;

      const result = await notificationSystem.getStats(groupId, parseInt(days));

      res.json(result);
    } catch (error) {
      console.error('[GroupRoutes] Error getting notification stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // EVENTS
  // ============================================================================

  /**
   * POST /api/groups/:groupId/events
   * Create group event
   */
  router.post('/groups/:groupId/events', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { createdBy, title, description, location, eventDate, metadata } = req.body;

      if (!createdBy || !title || !eventDate) {
        return res.status(400).json({
          success: false,
          error: 'createdBy, title, and eventDate required'
        });
      }

      // Would implement event creation in group manager
      // For now, return placeholder
      res.json({
        success: true,
        message: 'Event creation endpoint - to be implemented'
      });
    } catch (error) {
      console.error('[GroupRoutes] Error creating event:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/groups/:groupId/events
   * Get group events
   */
  router.get('/groups/:groupId/events', async (req, res) => {
    try {
      const { groupId } = req.params;

      // Would implement event fetching
      // For now, return placeholder
      res.json({
        success: true,
        events: [],
        message: 'Event fetching endpoint - to be implemented'
      });
    } catch (error) {
      console.error('[GroupRoutes] Error getting events:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};
