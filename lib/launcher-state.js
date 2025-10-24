/**
 * Launcher State Manager
 *
 * Track user's "installed apps" and organize into folders (iPhone-style):
 * - Apps in launcher (like iPhone home screen)
 * - Folders to organize apps
 * - Drag-and-drop positioning
 * - Sync across devices
 *
 * Similar to:
 * - iPhone launcher: apps + folders
 * - Android home screen: app drawer
 * - Windows Start Menu: pinned apps
 */

class LauncherState {
  constructor(options = {}) {
    this.db = options.db;

    console.log('[LauncherState] Initialized');
  }

  /**
   * Get user's launcher state (apps + folders)
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Launcher state
   */
  async getLauncherState(userId) {
    try {
      // Get folders
      const folders = await this.db.query(`
        SELECT
          folder_id,
          name,
          icon,
          position,
          created_at
        FROM launcher_folders
        WHERE user_id = $1
        ORDER BY position ASC
      `, [userId]);

      // Get apps (with folder assignments)
      const apps = await this.db.query(`
        SELECT
          la.app_id,
          la.folder_id,
          la.position,
          la.added_at,
          uia.template_id,
          uia.subdomain,
          at.name,
          at.icon,
          at.category
        FROM launcher_apps la
        JOIN user_installed_apps uia ON uia.app_id = la.app_id
        JOIN app_templates at ON at.template_id = uia.template_id
        WHERE la.user_id = $1
          AND uia.status = 'active'
        ORDER BY la.position ASC
      `, [userId]);

      // Organize apps by folder
      const appsByFolder = {};
      const rootApps = [];

      for (const app of apps.rows) {
        const appData = {
          app_id: app.app_id,
          template_id: app.template_id,
          name: app.name,
          icon: app.icon,
          category: app.category,
          url: `https://${app.subdomain}`,
          position: app.position
        };

        if (app.folder_id) {
          if (!appsByFolder[app.folder_id]) {
            appsByFolder[app.folder_id] = [];
          }
          appsByFolder[app.folder_id].push(appData);
        } else {
          rootApps.push(appData);
        }
      }

      // Build folder structure
      const folderStructure = folders.rows.map(folder => ({
        folder_id: folder.folder_id,
        name: folder.name,
        icon: folder.icon,
        position: folder.position,
        apps: appsByFolder[folder.folder_id] || []
      }));

      return {
        folders: folderStructure,
        apps: rootApps, // Apps not in any folder
        total_apps: apps.rows.length,
        total_folders: folders.rows.length
      };

    } catch (error) {
      console.error('[LauncherState] Get launcher state error:', error);
      return {
        folders: [],
        apps: [],
        total_apps: 0,
        total_folders: 0
      };
    }
  }

  /**
   * Create folder
   *
   * @param {string} userId - User ID
   * @param {string} name - Folder name
   * @param {string} icon - Folder icon
   * @returns {Promise<object>} - Created folder
   */
  async createFolder(userId, name, icon = '📁') {
    try {
      const result = await this.db.query(`
        INSERT INTO launcher_folders (
          folder_id,
          user_id,
          name,
          icon,
          position,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          (SELECT COALESCE(MAX(position), 0) + 1 FROM launcher_folders WHERE user_id = $1),
          NOW()
        )
        RETURNING *
      `, [userId, name, icon]);

      console.log(`[LauncherState] Created folder ${name} for user ${userId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[LauncherState] Create folder error:', error);
      throw error;
    }
  }

  /**
   * Delete folder (moves apps to root)
   *
   * @param {string} userId - User ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<boolean>}
   */
  async deleteFolder(userId, folderId) {
    try {
      // Move apps to root
      await this.db.query(`
        UPDATE launcher_apps
        SET folder_id = NULL
        WHERE user_id = $1 AND folder_id = $2
      `, [userId, folderId]);

      // Delete folder
      const result = await this.db.query(`
        DELETE FROM launcher_folders
        WHERE folder_id = $1 AND user_id = $2
        RETURNING folder_id
      `, [folderId, userId]);

      if (result.rows.length > 0) {
        console.log(`[LauncherState] Deleted folder ${folderId}`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[LauncherState] Delete folder error:', error);
      return false;
    }
  }

  /**
   * Rename folder
   *
   * @param {string} userId - User ID
   * @param {string} folderId - Folder ID
   * @param {string} name - New name
   * @returns {Promise<boolean>}
   */
  async renameFolder(userId, folderId, name) {
    try {
      const result = await this.db.query(`
        UPDATE launcher_folders
        SET name = $1
        WHERE folder_id = $2 AND user_id = $3
        RETURNING folder_id
      `, [name, folderId, userId]);

      return result.rows.length > 0;

    } catch (error) {
      console.error('[LauncherState] Rename folder error:', error);
      return false;
    }
  }

  /**
   * Move app to folder
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @param {string} folderId - Folder ID (null = root)
   * @returns {Promise<boolean>}
   */
  async moveAppToFolder(userId, appId, folderId) {
    try {
      const result = await this.db.query(`
        UPDATE launcher_apps
        SET folder_id = $1
        WHERE user_id = $2 AND app_id = $3
        RETURNING app_id
      `, [folderId, userId, appId]);

      if (result.rows.length > 0) {
        console.log(`[LauncherState] Moved app ${appId} to folder ${folderId || 'root'}`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[LauncherState] Move app error:', error);
      return false;
    }
  }

  /**
   * Reorder apps
   *
   * @param {string} userId - User ID
   * @param {array} appPositions - Array of {app_id, position}
   * @returns {Promise<boolean>}
   */
  async reorderApps(userId, appPositions) {
    try {
      // Update positions in batch
      for (const { app_id, position } of appPositions) {
        await this.db.query(`
          UPDATE launcher_apps
          SET position = $1
          WHERE user_id = $2 AND app_id = $3
        `, [position, userId, app_id]);
      }

      console.log(`[LauncherState] Reordered ${appPositions.length} apps`);
      return true;

    } catch (error) {
      console.error('[LauncherState] Reorder apps error:', error);
      return false;
    }
  }

  /**
   * Reorder folders
   *
   * @param {string} userId - User ID
   * @param {array} folderPositions - Array of {folder_id, position}
   * @returns {Promise<boolean>}
   */
  async reorderFolders(userId, folderPositions) {
    try {
      // Update positions in batch
      for (const { folder_id, position } of folderPositions) {
        await this.db.query(`
          UPDATE launcher_folders
          SET position = $1
          WHERE user_id = $2 AND folder_id = $3
        `, [position, userId, folder_id]);
      }

      console.log(`[LauncherState] Reordered ${folderPositions.length} folders`);
      return true;

    } catch (error) {
      console.error('[LauncherState] Reorder folders error:', error);
      return false;
    }
  }

  /**
   * Add app to launcher
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @param {string} folderId - Folder ID (optional)
   * @returns {Promise<boolean>}
   */
  async addApp(userId, appId, folderId = null) {
    try {
      await this.db.query(`
        INSERT INTO launcher_apps (
          user_id,
          app_id,
          folder_id,
          position,
          added_at
        )
        VALUES ($1, $2, $3, (
          SELECT COALESCE(MAX(position), 0) + 1
          FROM launcher_apps
          WHERE user_id = $1 AND folder_id IS NOT DISTINCT FROM $3
        ), NOW())
      `, [userId, appId, folderId]);

      console.log(`[LauncherState] Added app ${appId} to launcher`);
      return true;

    } catch (error) {
      console.error('[LauncherState] Add app error:', error);
      return false;
    }
  }

  /**
   * Remove app from launcher
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @returns {Promise<boolean>}
   */
  async removeApp(userId, appId) {
    try {
      const result = await this.db.query(`
        DELETE FROM launcher_apps
        WHERE user_id = $1 AND app_id = $2
        RETURNING app_id
      `, [userId, appId]);

      if (result.rows.length > 0) {
        console.log(`[LauncherState] Removed app ${appId} from launcher`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[LauncherState] Remove app error:', error);
      return false;
    }
  }

  /**
   * Get app count in folder
   *
   * @param {string} folderId - Folder ID
   * @returns {Promise<number>}
   */
  async getAppCountInFolder(folderId) {
    try {
      const result = await this.db.query(`
        SELECT COUNT(*) as count
        FROM launcher_apps
        WHERE folder_id = $1
      `, [folderId]);

      return parseInt(result.rows[0].count);

    } catch (error) {
      console.error('[LauncherState] Get app count error:', error);
      return 0;
    }
  }

  /**
   * Search launcher apps
   *
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @returns {Promise<array>} - Matching apps
   */
  async searchApps(userId, query) {
    try {
      const result = await this.db.query(`
        SELECT
          la.app_id,
          la.folder_id,
          uia.subdomain,
          at.name,
          at.icon,
          at.category,
          lf.name as folder_name
        FROM launcher_apps la
        JOIN user_installed_apps uia ON uia.app_id = la.app_id
        JOIN app_templates at ON at.template_id = uia.template_id
        LEFT JOIN launcher_folders lf ON lf.folder_id = la.folder_id
        WHERE la.user_id = $1
          AND uia.status = 'active'
          AND (
            at.name ILIKE $2
            OR at.category ILIKE $2
          )
        ORDER BY at.name ASC
        LIMIT 20
      `, [userId, `%${query}%`]);

      return result.rows.map(row => ({
        app_id: row.app_id,
        name: row.name,
        icon: row.icon,
        category: row.category,
        url: `https://${row.subdomain}`,
        folder_name: row.folder_name
      }));

    } catch (error) {
      console.error('[LauncherState] Search apps error:', error);
      return [];
    }
  }

  /**
   * Get launcher stats
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Stats
   */
  async getStats(userId) {
    try {
      const apps = await this.db.query(`
        SELECT COUNT(*) as count
        FROM launcher_apps
        WHERE user_id = $1
      `, [userId]);

      const folders = await this.db.query(`
        SELECT COUNT(*) as count
        FROM launcher_folders
        WHERE user_id = $1
      `, [userId]);

      const categories = await this.db.query(`
        SELECT
          at.category,
          COUNT(*) as count
        FROM launcher_apps la
        JOIN user_installed_apps uia ON uia.app_id = la.app_id
        JOIN app_templates at ON at.template_id = uia.template_id
        WHERE la.user_id = $1
          AND uia.status = 'active'
        GROUP BY at.category
        ORDER BY count DESC
      `, [userId]);

      return {
        total_apps: parseInt(apps.rows[0].count),
        total_folders: parseInt(folders.rows[0].count),
        categories: categories.rows
      };

    } catch (error) {
      console.error('[LauncherState] Get stats error:', error);
      return {
        total_apps: 0,
        total_folders: 0,
        categories: []
      };
    }
  }

  /**
   * Sync launcher state across devices
   *
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {object} state - Launcher state from device
   * @returns {Promise<object>} - Merged state
   */
  async syncState(userId, deviceId, state) {
    try {
      // Get server state
      const serverState = await this.getLauncherState(userId);

      // Merge states (server takes precedence)
      // In production: implement proper CRDT or last-write-wins

      console.log(`[LauncherState] Synced state for device ${deviceId}`);

      return serverState;

    } catch (error) {
      console.error('[LauncherState] Sync state error:', error);
      throw error;
    }
  }

  /**
   * Get recently used apps
   *
   * @param {string} userId - User ID
   * @param {number} limit - Max results
   * @returns {Promise<array>} - Recently used apps
   */
  async getRecentlyUsed(userId, limit = 10) {
    try {
      const result = await this.db.query(`
        SELECT
          la.app_id,
          uia.subdomain,
          at.name,
          at.icon,
          al.last_opened_at
        FROM launcher_apps la
        JOIN user_installed_apps uia ON uia.app_id = la.app_id
        JOIN app_templates at ON at.template_id = uia.template_id
        LEFT JOIN app_launch_log al ON al.app_id = la.app_id AND al.user_id = la.user_id
        WHERE la.user_id = $1
          AND uia.status = 'active'
        ORDER BY al.last_opened_at DESC NULLS LAST
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map(row => ({
        app_id: row.app_id,
        name: row.name,
        icon: row.icon,
        url: `https://${row.subdomain}`,
        last_opened_at: row.last_opened_at
      }));

    } catch (error) {
      console.error('[LauncherState] Get recently used error:', error);
      return [];
    }
  }

  /**
   * Log app launch
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @returns {Promise<void>}
   */
  async logAppLaunch(userId, appId) {
    try {
      await this.db.query(`
        INSERT INTO app_launch_log (user_id, app_id, last_opened_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, app_id)
        DO UPDATE SET last_opened_at = NOW()
      `, [userId, appId]);

    } catch (error) {
      console.error('[LauncherState] Log launch error:', error);
    }
  }
}

module.exports = LauncherState;
