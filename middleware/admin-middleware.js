/**
 * Admin Middleware
 *
 * Protects admin routes and checks admin permissions
 * Requires user to be authenticated and have admin role
 */

// Database connection (injected via initMiddleware)
let db = null;

/**
 * Initialize middleware with database connection
 */
function initMiddleware(database) {
  db = database;
}

/**
 * Check if user has admin or superadmin role
 */
async function requireAdmin(req, res, next) {
  try {
    // Verify user is authenticated first
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Get user role from database
    const userResult = await db.query(
      'SELECT role, status FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Check if user has admin role
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      // Log unauthorized access attempt
      await logAdminAction({
        adminUserId: req.user.userId,
        actionType: 'unauthorized_admin_access',
        description: 'Attempted to access admin route without permission',
        ipAddress: req.ip || req.connection.remoteAddress,
        metadata: {
          path: req.path,
          method: req.method,
          userRole: user.role
        }
      });

      return res.status(403).json({
        error: 'Admin access required',
        code: 'FORBIDDEN'
      });
    }

    // Attach role to request
    req.user.role = user.role;

    next();
  } catch (error) {
    console.error('[AdminMiddleware] Error checking admin access:', error);
    res.status(500).json({
      error: 'Failed to verify admin access',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Require superadmin role (highest level)
 */
async function requireSuperadmin(req, res, next) {
  try {
    // Run admin check first
    await new Promise((resolve, reject) => {
      requireAdmin(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user is superadmin specifically
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        error: 'Superadmin access required',
        code: 'FORBIDDEN_SUPERADMIN'
      });
    }

    next();
  } catch (error) {
    console.error('[AdminMiddleware] Error checking superadmin access:', error);
    res.status(500).json({
      error: 'Failed to verify superadmin access',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Check if user has specific permission
 */
async function requirePermission(permissionName) {
  return async (req, res, next) => {
    try {
      // Verify admin first
      await new Promise((resolve, reject) => {
        requireAdmin(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Superadmins have all permissions
      if (req.user.role === 'superadmin') {
        return next();
      }

      // Check if admin role has this permission
      const permissionResult = await db.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN admin_permissions ap ON rp.permission_id = ap.permission_id
        WHERE rp.role = $1 AND ap.name = $2
      `, [req.user.role, permissionName]);

      if (permissionResult.rows.length === 0) {
        return res.status(403).json({
          error: `Permission required: ${permissionName}`,
          code: 'FORBIDDEN_PERMISSION'
        });
      }

      next();
    } catch (error) {
      console.error('[AdminMiddleware] Error checking permission:', error);
      res.status(500).json({
        error: 'Failed to verify permission',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Check if user is admin or owns the resource
 * @param {function} getResourceOwnerId - Function that returns owner user_id from request
 */
function requireAdminOrOwner(getResourceOwnerId) {
  return async (req, res, next) => {
    try {
      // Get resource owner ID
      const ownerId = await getResourceOwnerId(req);

      // If user owns the resource, allow access
      if (req.user && req.user.userId === ownerId) {
        return next();
      }

      // Otherwise, require admin access
      return requireAdmin(req, res, next);
    } catch (error) {
      console.error('[AdminMiddleware] Error checking admin or owner:', error);
      res.status(500).json({
        error: 'Failed to verify access',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Log admin action to audit trail
 */
async function logAdminAction(action) {
  if (!db) return;

  try {
    await db.query(`
      INSERT INTO admin_actions (
        admin_user_id,
        action_type,
        target_user_id,
        target_resource,
        description,
        metadata,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      action.adminUserId || null,
      action.actionType,
      action.targetUserId || null,
      action.targetResource || null,
      action.description || null,
      action.metadata ? JSON.stringify(action.metadata) : '{}',
      action.ipAddress || null
    ]);
  } catch (error) {
    console.error('[AdminMiddleware] Error logging admin action:', error);
    // Don't throw - logging failure shouldn't break the request
  }
}

/**
 * Get user's admin permissions
 */
async function getUserPermissions(userId) {
  if (!db) return { role: 'user', permissions: [] };

  try {
    // Get user role
    const userResult = await db.query(
      'SELECT role FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return { role: 'user', permissions: [] };
    }

    const role = userResult.rows[0].role;

    // Superadmin has all permissions
    if (role === 'superadmin') {
      const allPermissions = await db.query('SELECT name FROM admin_permissions');
      return {
        role: 'superadmin',
        permissions: allPermissions.rows.map(p => p.name)
      };
    }

    // Get role-specific permissions
    const permissionsResult = await db.query(`
      SELECT ap.name
      FROM role_permissions rp
      JOIN admin_permissions ap ON rp.permission_id = ap.permission_id
      WHERE rp.role = $1
    `, [role]);

    return {
      role,
      permissions: permissionsResult.rows.map(p => p.name)
    };
  } catch (error) {
    console.error('[AdminMiddleware] Error getting user permissions:', error);
    return { role: 'user', permissions: [] };
  }
}

/**
 * Check if user has admin role (without middleware)
 */
async function isAdmin(userId) {
  if (!db) return false;

  try {
    const result = await db.query(
      'SELECT role FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) return false;

    const role = result.rows[0].role;
    return role === 'admin' || role === 'superadmin';
  } catch (error) {
    console.error('[AdminMiddleware] Error checking if user is admin:', error);
    return false;
  }
}

module.exports = {
  initMiddleware,
  requireAdmin,
  requireSuperadmin,
  requirePermission,
  requireAdminOrOwner,
  logAdminAction,
  getUserPermissions,
  isAdmin
};
