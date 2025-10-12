/**
 * Room Manager - Matrix-style Code Organization
 *
 * Organizes code repositories into "rooms" by:
 * - Language (python-automation, lua-scripts)
 * - Purpose (api-helpers, webhooks, cli-tools)
 * - Project (myproject-backend, myproject-frontend)
 * - Team (team-infra, team-data)
 *
 * Each room can have its own Ollama model trained on that specific code.
 */

class RoomManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new code room
   * @param {object} roomData - Room configuration
   */
  async createRoom(roomData) {
    const slug = this._generateSlug(roomData.name);

    const result = await this.db.query(
      `INSERT INTO code_rooms (
        name, slug, description, room_type, primary_language, tags,
        ollama_model_name, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        roomData.name,
        roomData.slug || slug,
        roomData.description || null,
        roomData.roomType || 'language',
        roomData.primaryLanguage || null,
        roomData.tags || null,
        roomData.ollamaModelName || `calos-${slug}`,
        roomData.createdBy || null
      ]
    );

    console.log(`[RoomManager] Created room: ${roomData.name}`);

    return result.rows[0];
  }

  /**
   * Get room by ID or slug
   */
  async getRoom(idOrSlug) {
    let result;

    if (typeof idOrSlug === 'number') {
      result = await this.db.query(
        'SELECT * FROM room_summary WHERE id = $1',
        [idOrSlug]
      );
    } else {
      result = await this.db.query(
        'SELECT * FROM room_summary WHERE slug = $1',
        [idOrSlug]
      );
    }

    if (result.rows.length === 0) {
      throw new Error(`Room not found: ${idOrSlug}`);
    }

    return result.rows[0];
  }

  /**
   * List all rooms
   */
  async listRooms(filters = {}) {
    let sql = 'SELECT * FROM room_summary WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.roomType) {
      sql += ` AND room_type = $${paramIndex}`;
      params.push(filters.roomType);
      paramIndex++;
    }

    if (filters.language) {
      sql += ` AND primary_language = $${paramIndex}`;
      params.push(filters.language);
      paramIndex++;
    }

    sql += ' ORDER BY name';

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Add repository to a room
   */
  async addRepoToRoom(roomId, repoId) {
    try {
      await this.db.query(
        `INSERT INTO code_room_repositories (room_id, repo_id)
         VALUES ($1, $2)
         ON CONFLICT (room_id, repo_id) DO NOTHING`,
        [roomId, repoId]
      );

      console.log(`[RoomManager] Added repo ${repoId} to room ${roomId}`);

      return { success: true };
    } catch (error) {
      console.error('[RoomManager] Error adding repo to room:', error.message);
      throw error;
    }
  }

  /**
   * Remove repository from a room
   */
  async removeRepoFromRoom(roomId, repoId) {
    await this.db.query(
      'DELETE FROM code_room_repositories WHERE room_id = $1 AND repo_id = $2',
      [roomId, repoId]
    );

    console.log(`[RoomManager] Removed repo ${repoId} from room ${roomId}`);
  }

  /**
   * Get all repositories in a room
   */
  async getRoomRepos(roomId) {
    const result = await this.db.query(
      `SELECT cr.*, rr.added_at
       FROM code_repositories cr
       JOIN code_room_repositories rr ON rr.repo_id = cr.id
       WHERE rr.room_id = $1
       ORDER BY cr.name`,
      [roomId]
    );

    return result.rows;
  }

  /**
   * Get all code snippets in a room
   */
  async getRoomSnippets(roomId, filters = {}) {
    let sql = `
      SELECT cs.*
      FROM code_snippets cs
      JOIN code_room_repositories rr ON rr.repo_id = cs.repo_id
      WHERE rr.room_id = $1
    `;

    const params = [roomId];
    let paramIndex = 2;

    if (filters.language) {
      sql += ` AND cs.language = $${paramIndex}`;
      params.push(filters.language);
      paramIndex++;
    }

    if (filters.snippetType) {
      sql += ` AND cs.snippet_type = $${paramIndex}`;
      params.push(filters.snippetType);
      paramIndex++;
    }

    sql += ` ORDER BY cs.created_at DESC LIMIT ${filters.limit || 100}`;

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Auto-assign repository to appropriate rooms based on language/tags
   */
  async autoAssignRepo(repoId) {
    // Get repo details
    const repoResult = await this.db.query(
      'SELECT * FROM code_repositories WHERE id = $1',
      [repoId]
    );

    if (repoResult.rows.length === 0) {
      throw new Error(`Repository not found: ${repoId}`);
    }

    const repo = repoResult.rows[0];
    const assignments = [];

    // Assign to language room
    if (repo.language) {
      const languageRoom = await this._getOrCreateLanguageRoom(repo.language);
      await this.addRepoToRoom(languageRoom.id, repoId);
      assignments.push(languageRoom);
    }

    // Assign to purpose rooms based on name/description
    const purposeRooms = await this._detectPurposeRooms(repo);
    for (const room of purposeRooms) {
      await this.addRepoToRoom(room.id, repoId);
      assignments.push(room);
    }

    console.log(`[RoomManager] Auto-assigned repo ${repo.name} to ${assignments.length} rooms`);

    return assignments;
  }

  /**
   * Post a message to a room
   */
  async postMessage(roomId, userId, message, messageType = 'text') {
    const result = await this.db.query(
      `INSERT INTO code_room_messages (room_id, user_id, message, message_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roomId, userId, message, messageType]
    );

    return result.rows[0];
  }

  /**
   * Get room messages (chat history)
   */
  async getRoomMessages(roomId, limit = 50) {
    const result = await this.db.query(
      `SELECT m.*, u.display_name as user_name
       FROM code_room_messages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [roomId, limit]
    );

    return result.rows.reverse();
  }

  /**
   * Update room model training status
   */
  async updateModelStatus(roomId, status, error = null) {
    await this.db.query(
      `UPDATE code_rooms
       SET model_training_status = $1,
           last_trained = CASE WHEN $1 = 'ready' THEN CURRENT_TIMESTAMP ELSE last_trained END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [status, roomId]
    );

    console.log(`[RoomManager] Updated room ${roomId} model status: ${status}`);
  }

  /**
   * Search across all rooms
   */
  async searchRooms(query) {
    const result = await this.db.query(
      `SELECT * FROM room_summary
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY name`,
      [`%${query}%`]
    );

    return result.rows;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Generate URL-friendly slug
   */
  _generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get or create language-specific room
   */
  async _getOrCreateLanguageRoom(language) {
    const slug = `${language}-code`;
    const name = `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;

    // Try to find existing
    const existing = await this.db.query(
      'SELECT * FROM code_rooms WHERE slug = $1',
      [slug]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new
    return await this.createRoom({
      name: name,
      slug: slug,
      description: `All ${language} code and libraries`,
      roomType: 'language',
      primaryLanguage: language,
      tags: [language, 'code'],
      ollamaModelName: `calos-${language}`
    });
  }

  /**
   * Detect purpose-based rooms from repo name/description
   */
  async _detectPurposeRooms(repo) {
    const rooms = [];
    const text = `${repo.name} ${repo.description || ''}`.toLowerCase();

    const purposeMap = {
      'automation': ['automation', 'automate', 'script', 'scripts', 'cron', 'scheduler'],
      'api': ['api', 'rest', 'graphql', 'endpoint'],
      'webhook': ['webhook', 'webhooks', 'event'],
      'cli': ['cli', 'command', 'terminal', 'console'],
      'database': ['database', 'db', 'sql', 'postgres', 'mysql'],
      'testing': ['test', 'testing', 'spec', 'e2e'],
      'deployment': ['deploy', 'deployment', 'ci', 'cd', 'docker', 'kubernetes']
    };

    for (const [purpose, keywords] of Object.entries(purposeMap)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        const room = await this._getOrCreatePurposeRoom(purpose);
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Get or create purpose-specific room
   */
  async _getOrCreatePurposeRoom(purpose) {
    const slug = `${purpose}-tools`;
    const name = `${purpose.charAt(0).toUpperCase() + purpose.slice(1)} Tools`;

    // Try to find existing
    const existing = await this.db.query(
      'SELECT * FROM code_rooms WHERE slug = $1',
      [slug]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new
    return await this.createRoom({
      name: name,
      slug: slug,
      description: `Code related to ${purpose}`,
      roomType: 'purpose',
      tags: [purpose, 'tools'],
      ollamaModelName: `calos-${purpose}`
    });
  }

  /**
   * Get room statistics
   */
  async getRoomStats(roomId) {
    const result = await this.db.query(
      `SELECT
        COUNT(DISTINCT rr.repo_id) as repo_count,
        COUNT(DISTINCT cs.id) as snippet_count,
        COUNT(DISTINCT cs.language) as language_count,
        COUNT(DISTINCT m.id) as message_count
       FROM code_rooms r
       LEFT JOIN code_room_repositories rr ON rr.room_id = r.id
       LEFT JOIN code_snippets cs ON cs.repo_id = rr.repo_id
       LEFT JOIN code_room_messages m ON m.room_id = r.id
       WHERE r.id = $1
       GROUP BY r.id`,
      [roomId]
    );

    return result.rows[0] || {
      repo_count: 0,
      snippet_count: 0,
      language_count: 0,
      message_count: 0
    };
  }
}

module.exports = RoomManager;
