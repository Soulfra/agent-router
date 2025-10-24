/**
 * Context Profile Manager
 *
 * Fast-loading user context profiles with color coordination:
 * - User preferences (theme, language, timezone)
 * - Room colors and visual organization
 * - Active contexts and history
 * - Shortcuts and favorites
 * - Model preferences per room
 *
 * Like browser profiles but for AI sessions
 */

class ContextProfileManager {
  constructor(options = {}) {
    this.db = options.db;

    // Default room colors (color-coded by language/purpose)
    this.roomColors = {
      // Languages
      'python': '#3776ab',      // Python blue
      'lua': '#000080',          // Navy blue
      'javascript': '#f7df1e',   // JS yellow
      'typescript': '#3178c6',   // TS blue
      'rust': '#ce422b',         // Rust orange
      'go': '#00add8',           // Go cyan
      'ruby': '#cc342d',         // Ruby red
      'java': '#007396',         // Java blue

      // Purpose-based
      'api': '#10b981',          // Green
      'database': '#8b5cf6',     // Purple
      'frontend': '#f59e0b',     // Orange
      'backend': '#3b82f6',      // Blue
      'automation': '#ec4899',   // Pink
      'cli': '#6b7280',          // Gray

      // Default
      'default': '#6366f1'       // Indigo
    };

    // Model priority preferences
    this.modelPreferences = {
      'python': ['ollama:codellama', 'ollama:deepseek-coder', 'gpt-4'],
      'lua': ['ollama:mistral', 'ollama:calos-model:latest', 'gpt-4'],
      'javascript': ['ollama:codellama', 'gpt-4', 'claude-3'],
      'api': ['ollama:mistral', 'gpt-4', 'claude-3'],
      'database': ['ollama:deepseek-coder', 'gpt-4'],
      'automation': ['ollama:calos-model:latest', 'gpt-4']
    };

    console.log('[ContextProfileManager] Initialized');
  }

  /**
   * Load user context profile
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Context profile
   */
  async loadProfile(userId) {
    try {
      // Load from database
      const profile = await this._loadFromDatabase(userId);

      // Enhance with room colors and model preferences
      profile.roomColors = { ...this.roomColors, ...profile.customRoomColors };
      profile.modelPreferences = { ...this.modelPreferences, ...profile.customModelPreferences };

      // Add active contexts
      profile.activeContexts = await this._getActiveContexts(userId);

      // Add shortcuts
      profile.shortcuts = await this._getShortcuts(userId);

      console.log(`[ContextProfile] Loaded profile for user ${userId}`);

      return profile;

    } catch (error) {
      console.error('[ContextProfile] Load error:', error.message);
      return this._getDefaultProfile();
    }
  }

  /**
   * Get room color
   *
   * @param {string} roomSlug - Room slug or ID
   * @returns {string} - Hex color code
   */
  getRoomColor(roomSlug) {
    // Check exact match
    if (this.roomColors[roomSlug]) {
      return this.roomColors[roomSlug];
    }

    // Check if slug contains known language
    for (const [key, color] of Object.entries(this.roomColors)) {
      if (roomSlug.toLowerCase().includes(key)) {
        return color;
      }
    }

    // Default
    return this.roomColors.default;
  }

  /**
   * Get preferred models for room
   *
   * @param {string} roomSlug - Room slug
   * @returns {array} - Ordered list of preferred models
   */
  getPreferredModels(roomSlug) {
    // Check exact match
    if (this.modelPreferences[roomSlug]) {
      return this.modelPreferences[roomSlug];
    }

    // Check if slug contains known type
    for (const [key, models] of Object.entries(this.modelPreferences)) {
      if (roomSlug.toLowerCase().includes(key)) {
        return models;
      }
    }

    // Default: internal first
    return ['ollama:mistral', 'ollama:calos-model:latest', 'gpt-4', 'claude-3'];
  }

  /**
   * Save profile changes
   *
   * @param {string} userId - User ID
   * @param {object} updates - Profile updates
   * @returns {Promise<boolean>} - Success
   */
  async saveProfile(userId, updates) {
    try {
      if (!this.db) return false;

      await this.db.query(
        `UPDATE user_preferences
         SET preferences = preferences || $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [JSON.stringify(updates), userId]
      );

      console.log(`[ContextProfile] Saved profile for user ${userId}`);
      return true;

    } catch (error) {
      console.error('[ContextProfile] Save error:', error.message);
      return false;
    }
  }

  /**
   * Set custom room color
   *
   * @param {string} userId - User ID
   * @param {string} roomSlug - Room slug
   * @param {string} color - Hex color
   * @returns {Promise<boolean>} - Success
   */
  async setCustomRoomColor(userId, roomSlug, color) {
    try {
      if (!this.db) return false;

      await this.db.query(
        `UPDATE user_preferences
         SET preferences = jsonb_set(
           COALESCE(preferences, '{}'),
           '{customRoomColors, ${roomSlug}}',
           $1,
           true
         )
         WHERE user_id = $2`,
        [JSON.stringify(color), userId]
      );

      console.log(`[ContextProfile] Set custom color for ${roomSlug}: ${color}`);
      return true;

    } catch (error) {
      console.error('[ContextProfile] Color save error:', error.message);
      return false;
    }
  }

  /**
   * Add shortcut
   *
   * @param {string} userId - User ID
   * @param {object} shortcut - Shortcut data
   * @returns {Promise<boolean>} - Success
   */
  async addShortcut(userId, shortcut) {
    try {
      if (!this.db) return false;

      await this.db.query(
        `UPDATE user_preferences
         SET preferences = jsonb_set(
           COALESCE(preferences, '{}'),
           '{shortcuts}',
           COALESCE(preferences->'shortcuts', '[]') || $1,
           true
         )
         WHERE user_id = $2`,
        [JSON.stringify(shortcut), userId]
      );

      console.log(`[ContextProfile] Added shortcut: ${shortcut.name}`);
      return true;

    } catch (error) {
      console.error('[ContextProfile] Shortcut save error:', error.message);
      return false;
    }
  }

  /**
   * Load from database
   * @private
   */
  async _loadFromDatabase(userId) {
    if (!this.db) {
      return this._getDefaultProfile();
    }

    try {
      const result = await this.db.query(
        `SELECT
           u.user_id,
           u.username,
           u.email,
           up.theme,
           up.language,
           up.timezone,
           up.email_notifications,
           up.show_skill_notifications,
           up.show_xp_gains,
           up.preferences
         FROM users u
         LEFT JOIN user_preferences up ON up.user_id = u.user_id
         WHERE u.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return this._getDefaultProfile();
      }

      const row = result.rows[0];
      const prefs = row.preferences || {};

      return {
        userId: row.user_id,
        username: row.username,
        email: row.email,
        theme: row.theme || 'dark',
        language: row.language || 'en',
        timezone: row.timezone || 'UTC',
        emailNotifications: row.email_notifications !== false,
        showSkillNotifications: row.show_skill_notifications !== false,
        showXpGains: row.show_xp_gains !== false,

        // Custom preferences
        customRoomColors: prefs.customRoomColors || {},
        customModelPreferences: prefs.customModelPreferences || {},
        favoriteRooms: prefs.favoriteRooms || [],
        recentRooms: prefs.recentRooms || [],
        pinnedContexts: prefs.pinnedContexts || []
      };

    } catch (error) {
      console.error('[ContextProfile] Database load error:', error.message);
      return this._getDefaultProfile();
    }
  }

  /**
   * Get active contexts (recent room activity)
   * @private
   */
  async _getActiveContexts(userId) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT DISTINCT
           sb.room_id,
           cr.name as room_name,
           cr.slug as room_slug,
           MAX(sb.created_at) as last_active
         FROM session_blocks sb
         LEFT JOIN code_rooms cr ON cr.id = sb.room_id
         WHERE sb.user_id = $1
           AND sb.created_at > NOW() - INTERVAL '24 hours'
         GROUP BY sb.room_id, cr.name, cr.slug
         ORDER BY last_active DESC
         LIMIT 10`,
        [userId]
      );

      return result.rows.map(row => ({
        roomId: row.room_id,
        roomName: row.room_name,
        roomSlug: row.room_slug,
        lastActive: row.last_active,
        color: this.getRoomColor(row.room_slug)
      }));

    } catch (error) {
      console.error('[ContextProfile] Active contexts error:', error.message);
      return [];
    }
  }

  /**
   * Get user shortcuts
   * @private
   */
  async _getShortcuts(userId) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT preferences->'shortcuts' as shortcuts
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].shortcuts) {
        return this._getDefaultShortcuts();
      }

      return result.rows[0].shortcuts;

    } catch (error) {
      console.error('[ContextProfile] Shortcuts error:', error.message);
      return this._getDefaultShortcuts();
    }
  }

  /**
   * Get default profile
   * @private
   */
  _getDefaultProfile() {
    return {
      userId: null,
      username: 'anonymous',
      email: null,
      theme: 'dark',
      language: 'en',
      timezone: 'UTC',
      emailNotifications: true,
      showSkillNotifications: true,
      showXpGains: true,
      customRoomColors: {},
      customModelPreferences: {},
      favoriteRooms: [],
      recentRooms: [],
      pinnedContexts: [],
      roomColors: this.roomColors,
      modelPreferences: this.modelPreferences,
      activeContexts: [],
      shortcuts: this._getDefaultShortcuts()
    };
  }

  /**
   * Get default shortcuts
   * @private
   */
  _getDefaultShortcuts() {
    return [
      { key: 'Ctrl+K', name: 'Quick Command', action: 'open_command_palette' },
      { key: 'Ctrl+/', name: 'Search Code', action: 'search_code' },
      { key: 'Ctrl+Shift+P', name: 'Switch Room', action: 'switch_room' },
      { key: 'Ctrl+B', name: 'Autonomous Build', action: 'autonomous_build' }
    ];
  }

  /**
   * Get color palette for UI
   */
  getColorPalette() {
    return {
      rooms: this.roomColors,
      priorities: {
        urgent: '#ef4444',    // Red
        high: '#f59e0b',      // Orange
        medium: '#10b981',    // Green
        low: '#6b7280'        // Gray
      },
      status: {
        pending: '#6b7280',   // Gray
        executing: '#3b82f6', // Blue
        completed: '#10b981', // Green
        timeout: '#f59e0b',   // Orange
        failed: '#ef4444'     // Red
      }
    };
  }
}

module.exports = ContextProfileManager;
