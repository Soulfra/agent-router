/**
 * Workspace API Routes
 *
 * REST API endpoints for collaborative workspace management.
 *
 * Endpoints:
 * - POST /api/workspace/create - Create new workspace
 * - GET /api/workspace/:id - Get workspace state
 * - GET /api/workspace/user/:userId - List user's workspaces
 * - POST /api/workspace/:id/invite - Generate invite URL
 * - GET /api/workspace/stats - Get system stats
 */

const express = require('express');
const router = express.Router();

function initWorkspaceRoutes(workspaceHandler) {
  if (!workspaceHandler) {
    throw new Error('Workspace handler is required');
  }

  const workspaceSession = workspaceHandler.workspaceSession;

  /**
   * Create a new workspace
   * POST /api/workspace/create
   */
  router.post('/create', async (req, res) => {
    try {
      const {
        userId,
        workspaceName,
        projectPath = null,
        inviteAgentId = null,
        metadata = {}
      } = req.body;

      // Validation
      if (!userId || !workspaceName) {
        return res.status(400).json({
          success: false,
          error: 'userId and workspaceName are required'
        });
      }

      const result = await workspaceSession.createWorkspace({
        userId,
        workspaceName,
        projectPath,
        inviteAgentId,
        metadata
      });

      res.json({
        success: true,
        workspace: result
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Create error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace state
   * GET /api/workspace/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const workspace = workspaceSession.getWorkspace(id);

      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }

      res.json({
        success: true,
        workspace: {
          ...workspace,
          fileState: Object.fromEntries(workspace.fileState) // Convert Map to object
        }
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Get workspace error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get all workspaces for a user
   * GET /api/workspace/user/:userId
   */
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const workspaces = await workspaceSession.getUserWorkspaces(userId);

      res.json({
        success: true,
        workspaces
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Get user workspaces error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Generate invite URL
   * POST /api/workspace/:id/invite
   */
  router.post('/:id/invite', async (req, res) => {
    try {
      const { id } = req.params;

      const workspace = workspaceSession.getWorkspace(id);

      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }

      const inviteUrl = workspaceSession._generateInviteUrl(id);

      res.json({
        success: true,
        inviteUrl,
        workspaceId: id,
        workspaceName: workspace.workspaceName
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Generate invite error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get system statistics
   * GET /api/workspace/stats
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = workspaceHandler.getStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Get stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get active participants in a workspace
   * GET /api/workspace/:id/participants
   */
  router.get('/:id/participants', async (req, res) => {
    try {
      const { id } = req.params;

      const workspace = workspaceSession.getWorkspace(id);

      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }

      const participants = workspace.participants.filter(p => p.presence === 'online');

      res.json({
        success: true,
        participants
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Get participants error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get file locks in a workspace
   * GET /api/workspace/:id/locks
   */
  router.get('/:id/locks', async (req, res) => {
    try {
      const { id } = req.params;

      const workspace = workspaceSession.getWorkspace(id);

      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found'
        });
      }

      // Get all locks for this workspace
      const locks = [];
      for (const [key, lockInfo] of workspaceSession.fileLocks.entries()) {
        if (lockInfo.workspaceId === id) {
          locks.push({
            filePath: lockInfo.filePath,
            participantId: lockInfo.participantId,
            lockedAt: lockInfo.lockedAt
          });
        }
      }

      res.json({
        success: true,
        locks
      });
    } catch (error) {
      console.error('[WorkspaceRoutes] Get locks error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Health check
   * GET /api/workspace/health
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'ok',
      timestamp: Date.now()
    });
  });

  return router;
}

module.exports = initWorkspaceRoutes;
