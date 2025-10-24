/**
 * Virtual Filesystem Manager
 *
 * Manages virtual folders and files for CalOS desktop environment.
 * All files/folders stored in database, not actual filesystem.
 *
 * Features:
 * - Create/delete folders and files
 * - Move/rename items
 * - Desktop icon positioning
 * - Trash bin with auto-cleanup
 * - Recent files tracking
 * - Search by name, type, metadata
 * - Virtual paths (/Desktop, /Documents, etc.)
 *
 * Usage:
 *   const fsManager = new VirtualFilesystemManager({ db });
 *   await fsManager.createFolder({ name: 'MyFolder', parentPath: '/Desktop' });
 *   await fsManager.createFile({ name: 'doc.txt', folderPath: '/Desktop' });
 */

class VirtualFilesystemManager {
  constructor({ db, userId = null }) {
    if (!db) {
      throw new Error('Database connection required for VirtualFilesystemManager');
    }

    this.db = db;
    this.userId = userId; // null = system-wide
  }

  // ========================================================================
  // FOLDER OPERATIONS
  // ========================================================================

  /**
   * Create a new folder
   */
  async createFolder(options = {}) {
    const {
      name,
      parentPath = null, // null = root level
      parentId = null, // Alternative to parentPath
      icon = '📁',
      color = null,
      isDesktop = false,
      position = null // { x, y } for desktop icons
    } = options;

    if (!name) {
      throw new Error('Folder name required');
    }

    // Get parent folder ID if parentPath provided
    let actualParentId = parentId;
    if (parentPath && !parentId) {
      const parent = await this.getFolderByPath(parentPath);
      if (!parent) {
        throw new Error(`Parent folder not found: ${parentPath}`);
      }
      actualParentId = parent.id;
    }

    // Build full path
    const parentPathStr = parentPath || (actualParentId ? await this._getPathById('folder', actualParentId) : '');
    const fullPath = parentPathStr ? `${parentPathStr}/${name}` : `/${name}`;

    try {
      const result = await this.db.query(
        `INSERT INTO virtual_folders
         (user_id, parent_id, name, path, icon, color, is_desktop, position_x, position_y)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          this.userId,
          actualParentId,
          name,
          fullPath,
          icon,
          color,
          isDesktop,
          position?.x || null,
          position?.y || null
        ]
      );

      console.log(`[VirtualFS] Created folder: ${fullPath}`);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error(`Folder already exists: ${fullPath}`);
      }
      throw error;
    }
  }

  /**
   * Delete a folder (and all contents)
   */
  async deleteFolder(folderId) {
    // Move to trash instead of permanent delete
    await this._moveToTrash('folder', folderId);

    console.log(`[VirtualFS] Deleted folder: ${folderId}`);
  }

  /**
   * Rename a folder
   */
  async renameFolder(folderId, newName) {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Build new path
    const oldPath = folder.path;
    const pathParts = oldPath.split('/').filter(Boolean);
    pathParts[pathParts.length - 1] = newName;
    const newPath = '/' + pathParts.join('/');

    await this.db.query(
      'UPDATE virtual_folders SET name = $1, path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newName, newPath, folderId]
    );

    // Update paths of all children (folders and files)
    await this._updateChildPaths(oldPath, newPath);

    console.log(`[VirtualFS] Renamed folder: ${oldPath} -> ${newPath}`);
  }

  /**
   * Move a folder to a new parent
   */
  async moveFolder(folderId, newParentId) {
    const folder = await this.getFolderById(folderId);
    if (!folder) {
      throw new Error('Folder not found');
    }

    const newParent = await this.getFolderById(newParentId);
    if (!newParent) {
      throw new Error('New parent folder not found');
    }

    // Build new path
    const oldPath = folder.path;
    const newPath = `${newParent.path}/${folder.name}`;

    await this.db.query(
      'UPDATE virtual_folders SET parent_id = $1, path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newParentId, newPath, folderId]
    );

    // Update paths of all children
    await this._updateChildPaths(oldPath, newPath);

    console.log(`[VirtualFS] Moved folder: ${oldPath} -> ${newPath}`);
  }

  /**
   * Get folder by ID
   */
  async getFolderById(folderId) {
    const result = await this.db.query(
      'SELECT * FROM virtual_folders WHERE id = $1 AND (user_id IS NULL OR user_id = $2)',
      [folderId, this.userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get folder by path
   */
  async getFolderByPath(path) {
    const result = await this.db.query(
      'SELECT * FROM virtual_folders WHERE path = $1 AND (user_id IS NULL OR user_id = $2)',
      [path, this.userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get folder contents (files + subfolders)
   */
  async getFolderContents(folderPath) {
    const folder = await this.getFolderByPath(folderPath);
    if (!folder) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    const result = await this.db.query(
      'SELECT * FROM get_folder_contents($1, $2)',
      [folder.id, this.userId]
    );

    return result.rows;
  }

  // ========================================================================
  // FILE OPERATIONS
  // ========================================================================

  /**
   * Create a new file
   */
  async createFile(options = {}) {
    const {
      name,
      folderPath,
      folderId,
      type = 'document', // document, image, video, app, link
      mimeType = 'text/plain',
      icon = '📄',
      sizeBytes = 0,
      contentType = 'reference', // reference, inline, external
      contentReference = null,
      contentInline = null,
      metadata = null,
      isExecutable = false,
      executeUrl = null,
      isDesktop = false,
      position = null // { x, y }
    } = options;

    if (!name) {
      throw new Error('File name required');
    }

    // Get folder ID if folderPath provided
    let actualFolderId = folderId;
    if (folderPath && !folderId) {
      const folder = await this.getFolderByPath(folderPath);
      if (!folder) {
        throw new Error(`Folder not found: ${folderPath}`);
      }
      actualFolderId = folder.id;
    }

    // Build full path
    const folderPathStr = folderPath || (actualFolderId ? await this._getPathById('folder', actualFolderId) : '');
    const fullPath = folderPathStr ? `${folderPathStr}/${name}` : `/${name}`;

    try {
      const result = await this.db.query(
        `INSERT INTO virtual_files
         (user_id, folder_id, name, path, type, mime_type, icon, size_bytes,
          content_type, content_reference, content_inline, metadata,
          is_executable, execute_url, is_desktop, position_x, position_y)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          this.userId,
          actualFolderId,
          name,
          fullPath,
          type,
          mimeType,
          icon,
          sizeBytes,
          contentType,
          contentReference,
          contentInline,
          metadata ? JSON.stringify(metadata) : null,
          isExecutable,
          executeUrl,
          isDesktop,
          position?.x || null,
          position?.y || null
        ]
      );

      console.log(`[VirtualFS] Created file: ${fullPath}`);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new Error(`File already exists: ${fullPath}`);
      }
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId) {
    // Move to trash
    await this._moveToTrash('file', fileId);

    console.log(`[VirtualFS] Deleted file: ${fileId}`);
  }

  /**
   * Rename a file
   */
  async renameFile(fileId, newName) {
    const file = await this.getFileById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // Build new path
    const oldPath = file.path;
    const pathParts = oldPath.split('/').filter(Boolean);
    pathParts[pathParts.length - 1] = newName;
    const newPath = '/' + pathParts.join('/');

    await this.db.query(
      'UPDATE virtual_files SET name = $1, path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newName, newPath, fileId]
    );

    console.log(`[VirtualFS] Renamed file: ${oldPath} -> ${newPath}`);
  }

  /**
   * Move a file to a new folder
   */
  async moveFile(fileId, newFolderId) {
    const file = await this.getFileById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    const newFolder = await this.getFolderById(newFolderId);
    if (!newFolder) {
      throw new Error('New folder not found');
    }

    // Build new path
    const newPath = `${newFolder.path}/${file.name}`;

    await this.db.query(
      'UPDATE virtual_files SET folder_id = $1, path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newFolderId, newPath, fileId]
    );

    console.log(`[VirtualFS] Moved file: ${file.path} -> ${newPath}`);
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId) {
    const result = await this.db.query(
      'SELECT * FROM virtual_files WHERE id = $1 AND (user_id IS NULL OR user_id = $2)',
      [fileId, this.userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get file by path
   */
  async getFileByPath(path) {
    const result = await this.db.query(
      'SELECT * FROM virtual_files WHERE path = $1 AND (user_id IS NULL OR user_id = $2)',
      [path, this.userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update file access time and add to recent files
   */
  async accessFile(fileId) {
    await this.db.query(
      'SELECT update_file_access($1, $2)',
      [fileId, this.userId]
    );
  }

  // ========================================================================
  // DESKTOP OPERATIONS
  // ========================================================================

  /**
   * Get all items on desktop
   */
  async getDesktopItems() {
    const result = await this.db.query(
      'SELECT * FROM get_desktop_items($1)',
      [this.userId]
    );

    return result.rows;
  }

  /**
   * Update desktop icon position
   */
  async updateDesktopPosition(itemType, itemId, x, y) {
    const table = itemType === 'folder' ? 'virtual_folders' : 'virtual_files';

    await this.db.query(
      `UPDATE ${table} SET position_x = $1, position_y = $2 WHERE id = $3`,
      [x, y, itemId]
    );

    console.log(`[VirtualFS] Updated desktop position: ${itemType} ${itemId} -> (${x}, ${y})`);
  }

  /**
   * Add item to desktop
   */
  async addToDesktop(itemType, itemId, position = null) {
    const table = itemType === 'folder' ? 'virtual_folders' : 'virtual_files';

    await this.db.query(
      `UPDATE ${table}
       SET is_desktop = TRUE, position_x = $1, position_y = $2
       WHERE id = $3`,
      [position?.x || null, position?.y || null, itemId]
    );

    console.log(`[VirtualFS] Added to desktop: ${itemType} ${itemId}`);
  }

  /**
   * Remove item from desktop
   */
  async removeFromDesktop(itemType, itemId) {
    const table = itemType === 'folder' ? 'virtual_folders' : 'virtual_files';

    await this.db.query(
      `UPDATE ${table} SET is_desktop = FALSE WHERE id = $1`,
      [itemId]
    );

    console.log(`[VirtualFS] Removed from desktop: ${itemType} ${itemId}`);
  }

  // ========================================================================
  // SEARCH & RECENT
  // ========================================================================

  /**
   * Search files by name, type, or metadata
   */
  async searchFiles(query, options = {}) {
    const { type = null, limit = 50 } = options;

    let sql = `
      SELECT * FROM virtual_files
      WHERE (user_id IS NULL OR user_id = $1)
        AND (name ILIKE $2 OR path ILIKE $2)
    `;
    const params = [this.userId, `%${query}%`];

    if (type) {
      sql += ' AND type = $3';
      params.push(type);
    }

    sql += ' ORDER BY last_accessed_at DESC NULLS LAST LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Get recent files
   */
  async getRecentFiles(limit = 10) {
    const result = await this.db.query(
      `SELECT vf.*, rf.accessed_at, rf.access_count
       FROM recent_files rf
       JOIN virtual_files vf ON vf.id = rf.file_id
       WHERE rf.user_id IS NULL OR rf.user_id = $1
       ORDER BY rf.accessed_at DESC
       LIMIT $2`,
      [this.userId, limit]
    );

    return result.rows;
  }

  // ========================================================================
  // TRASH BIN
  // ========================================================================

  /**
   * Get items in trash
   */
  async getTrashItems() {
    const result = await this.db.query(
      'SELECT * FROM trash_bin WHERE user_id IS NULL OR user_id = $1 ORDER BY deleted_at DESC',
      [this.userId]
    );

    return result.rows;
  }

  /**
   * Restore item from trash
   */
  async restoreFromTrash(trashId) {
    // Get trash item
    const trashResult = await this.db.query(
      'SELECT * FROM trash_bin WHERE id = $1 AND (user_id IS NULL OR user_id = $2)',
      [trashId, this.userId]
    );

    if (trashResult.rows.length === 0) {
      throw new Error('Trash item not found');
    }

    const trashItem = trashResult.rows[0];

    // Restore item (remove from trash - item still exists in original table)
    await this.db.query('DELETE FROM trash_bin WHERE id = $1', [trashId]);

    console.log(`[VirtualFS] Restored from trash: ${trashItem.item_type} ${trashItem.item_id}`);
  }

  /**
   * Permanently delete item from trash
   */
  async emptyTrash(trashId = null) {
    if (trashId) {
      // Delete specific item
      const trashResult = await this.db.query(
        'SELECT * FROM trash_bin WHERE id = $1',
        [trashId]
      );

      if (trashResult.rows.length === 0) {
        throw new Error('Trash item not found');
      }

      const item = trashResult.rows[0];
      const table = item.item_type === 'folder' ? 'virtual_folders' : 'virtual_files';

      // Permanently delete
      await this.db.query(`DELETE FROM ${table} WHERE id = $1`, [item.item_id]);
      await this.db.query('DELETE FROM trash_bin WHERE id = $1', [trashId]);

      console.log(`[VirtualFS] Permanently deleted: ${item.item_type} ${item.item_id}`);
    } else {
      // Empty entire trash for this user
      const trashItems = await this.getTrashItems();

      for (const item of trashItems) {
        const table = item.item_type === 'folder' ? 'virtual_folders' : 'virtual_files';
        await this.db.query(`DELETE FROM ${table} WHERE id = $1`, [item.item_id]);
      }

      await this.db.query(
        'DELETE FROM trash_bin WHERE user_id IS NULL OR user_id = $1',
        [this.userId]
      );

      console.log(`[VirtualFS] Emptied trash: ${trashItems.length} items`);
    }
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  /**
   * Get path for a folder or file by ID
   */
  async _getPathById(itemType, itemId) {
    const table = itemType === 'folder' ? 'virtual_folders' : 'virtual_files';
    const result = await this.db.query(`SELECT path FROM ${table} WHERE id = $1`, [itemId]);
    return result.rows[0]?.path || null;
  }

  /**
   * Move item to trash
   */
  async _moveToTrash(itemType, itemId) {
    // Get current path
    const path = await this._getPathById(itemType, itemId);
    const table = itemType === 'folder' ? 'virtual_folders' : 'virtual_files';

    // Get parent_id
    const result = await this.db.query(
      `SELECT parent_id FROM ${table} WHERE id = $1`,
      [itemId]
    );
    const parentId = result.rows[0]?.parent_id || null;

    // Add to trash
    await this.db.query(
      `INSERT INTO trash_bin (user_id, item_type, item_id, original_path, original_parent_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [this.userId, itemType, itemId, path, parentId]
    );
  }

  /**
   * Update child paths after rename/move
   */
  async _updateChildPaths(oldPath, newPath) {
    // Update subfolders
    await this.db.query(
      `UPDATE virtual_folders
       SET path = REPLACE(path, $1, $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE path LIKE $3`,
      [oldPath, newPath, `${oldPath}/%`]
    );

    // Update files
    await this.db.query(
      `UPDATE virtual_files
       SET path = REPLACE(path, $1, $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE path LIKE $3`,
      [oldPath, newPath, `${oldPath}/%`]
    );
  }

  /**
   * Get filesystem statistics
   */
  async getStats() {
    const folderCount = await this.db.query(
      'SELECT COUNT(*) FROM virtual_folders WHERE user_id IS NULL OR user_id = $1',
      [this.userId]
    );

    const fileCount = await this.db.query(
      'SELECT COUNT(*) FROM virtual_files WHERE user_id IS NULL OR user_id = $1',
      [this.userId]
    );

    const totalSize = await this.db.query(
      'SELECT SUM(size_bytes) FROM virtual_files WHERE user_id IS NULL OR user_id = $1',
      [this.userId]
    );

    const trashCount = await this.db.query(
      'SELECT COUNT(*) FROM trash_bin WHERE user_id IS NULL OR user_id = $1',
      [this.userId]
    );

    return {
      folders: parseInt(folderCount.rows[0].count),
      files: parseInt(fileCount.rows[0].count),
      total_size_bytes: parseInt(totalSize.rows[0].sum || 0),
      trash_items: parseInt(trashCount.rows[0].count)
    };
  }
}

module.exports = VirtualFilesystemManager;
