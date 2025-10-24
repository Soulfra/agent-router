/**
 * User Context Transformer
 *
 * Transforms user preferences and settings into AI context enrichment.
 * When users log in, their settings (especially accessibility preferences like
 * high contrast mode) are remembered and automatically passed to AI/LLM interactions.
 *
 * This is the "transformer" that bridges user authentication and AI context.
 *
 * Features:
 * - Load user preferences from database
 * - Enrich prompts with accessibility context
 * - Format AI responses based on user preferences
 * - Cache user context to avoid repeated DB queries
 * - Integrate with context-profile-manager for room/model preferences
 */

const ContextProfileManager = require('./context-profile-manager');

class UserContextTransformer {
  constructor(options = {}) {
    this.db = options.db;
    this.contextProfileManager = options.contextProfileManager || null;

    // If no context profile manager provided, create one
    if (!this.contextProfileManager && this.db) {
      this.contextProfileManager = new ContextProfileManager({ db: this.db });
    }

    // Cache user contexts (TTL: 5 minutes)
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000; // 5 minutes

    // Cleanup expired cache entries every minute
    this.cacheCleanupInterval = setInterval(() => {
      this._cleanupCache();
    }, 60 * 1000);

    console.log('[UserContextTransformer] Initialized');
  }

  /**
   * Load user context from database
   *
   * @param {string} userId - User ID
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<object>} User context
   */
  async loadUserContext(userId, useCache = true) {
    try {
      // Check cache first
      if (useCache && this.cache.has(userId)) {
        const cached = this.cache.get(userId);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.context;
        }
      }

      // Load from database using view
      const result = await this.db.query(
        `SELECT * FROM user_context_profiles WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return this._getDefaultContext();
      }

      const row = result.rows[0];

      // Build context object
      const context = {
        userId: row.user_id,
        username: row.username,
        email: row.email,

        // Display preferences
        theme: row.theme || 'dark',
        language: row.language || 'en',
        timezone: row.timezone || 'UTC',

        // Accessibility preferences
        accessibility: {
          highContrast: row.high_contrast || false,
          fontSize: row.font_size || 'medium',
          reducedMotion: row.reduced_motion || false,
          screenReaderMode: row.screen_reader_mode || false,
          colorBlindMode: row.color_blind_mode || 'none'
        },

        // Notification preferences
        notifications: {
          email: row.email_notifications !== false,
          skills: row.show_skill_notifications !== false,
          xp: row.show_xp_gains !== false
        },

        // Custom preferences (JSONB)
        custom: row.custom_preferences || {},

        // Pre-generated accessibility context string
        accessibilityContext: row.accessibility_context || ''
      };

      // Cache the context
      this.cache.set(userId, {
        context: context,
        timestamp: Date.now()
      });

      return context;

    } catch (error) {
      console.error('[UserContextTransformer] Error loading context:', error);
      return this._getDefaultContext();
    }
  }

  /**
   * Enrich prompt with user context
   * Adds accessibility and preference information to system prompt
   *
   * @param {string} userId - User ID
   * @param {string} prompt - User prompt
   * @param {string} systemPrompt - System prompt (optional)
   * @returns {Promise<object>} Enriched prompt and system prompt
   */
  async enrichPrompt(userId, prompt, systemPrompt = null) {
    try {
      const context = await this.loadUserContext(userId);

      // Build enriched system prompt
      let enrichedSystemPrompt = systemPrompt || '';

      // Add accessibility context if present
      if (context.accessibilityContext) {
        enrichedSystemPrompt += '\n\n' + context.accessibilityContext;
      }

      // Add language preference
      if (context.language !== 'en') {
        enrichedSystemPrompt += `\n\nUser's preferred language: ${context.language}`;
      }

      // Add timezone for time-sensitive responses
      if (context.timezone !== 'UTC') {
        enrichedSystemPrompt += `\n\nUser's timezone: ${context.timezone}`;
      }

      return {
        prompt: prompt,
        systemPrompt: enrichedSystemPrompt.trim(),
        userContext: context
      };

    } catch (error) {
      console.error('[UserContextTransformer] Error enriching prompt:', error);
      return {
        prompt: prompt,
        systemPrompt: systemPrompt,
        userContext: this._getDefaultContext()
      };
    }
  }

  /**
   * Format AI response based on user preferences
   * Post-processes AI output for accessibility needs
   *
   * @param {string} userId - User ID
   * @param {string} response - AI response text
   * @returns {Promise<string>} Formatted response
   */
  async formatResponseForUser(userId, response) {
    try {
      const context = await this.loadUserContext(userId);

      let formatted = response;

      // Screen reader mode: Add ARIA-style descriptions
      if (context.accessibility.screenReaderMode) {
        // Add semantic markers for screen readers
        formatted = this._addScreenReaderMarkers(formatted);
      }

      // High contrast mode: Simplify color references
      if (context.accessibility.highContrast) {
        // Replace color-specific language with descriptive alternatives
        formatted = this._simplifyColorLanguage(formatted);
      }

      // Large font: Add visual hierarchy hints
      if (context.accessibility.fontSize === 'large' || context.accessibility.fontSize === 'xlarge') {
        // Emphasize headings and structure
        formatted = this._emphasizeStructure(formatted);
      }

      return formatted;

    } catch (error) {
      console.error('[UserContextTransformer] Error formatting response:', error);
      return response;
    }
  }

  /**
   * Get user context profile (includes room colors, model preferences)
   * Uses context-profile-manager for extended profile data
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} Complete context profile
   */
  async getUserContextProfile(userId) {
    try {
      // Load base context
      const baseContext = await this.loadUserContext(userId);

      // If context profile manager available, load extended profile
      if (this.contextProfileManager) {
        const extendedProfile = await this.contextProfileManager.loadProfile(userId);

        return {
          ...baseContext,
          roomColors: extendedProfile.roomColors,
          modelPreferences: extendedProfile.modelPreferences,
          activeContexts: extendedProfile.activeContexts,
          shortcuts: extendedProfile.shortcuts
        };
      }

      return baseContext;

    } catch (error) {
      console.error('[UserContextTransformer] Error loading profile:', error);
      return this._getDefaultContext();
    }
  }

  /**
   * Update user accessibility preferences
   *
   * @param {string} userId - User ID
   * @param {object} preferences - Preferences to update
   * @returns {Promise<boolean>} Success
   */
  async updateAccessibilityPreferences(userId, preferences) {
    try {
      if (!this.db) return false;

      // Call database function
      await this.db.query(
        `SELECT update_user_accessibility_preferences($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          preferences.highContrast !== undefined ? preferences.highContrast : null,
          preferences.fontSize || null,
          preferences.reducedMotion !== undefined ? preferences.reducedMotion : null,
          preferences.screenReaderMode !== undefined ? preferences.screenReaderMode : null,
          preferences.colorBlindMode || null
        ]
      );

      // Invalidate cache
      this.cache.delete(userId);

      console.log(`[UserContextTransformer] Updated accessibility preferences for user ${userId}`);
      return true;

    } catch (error) {
      console.error('[UserContextTransformer] Error updating preferences:', error);
      return false;
    }
  }

  /**
   * Invalidate cache for user
   *
   * @param {string} userId - User ID
   */
  invalidateCache(userId) {
    this.cache.delete(userId);
  }

  /**
   * Clear all cached contexts
   */
  clearCache() {
    this.cache.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Get default context for unauthenticated or missing users
   * @private
   */
  _getDefaultContext() {
    return {
      userId: null,
      username: 'anonymous',
      email: null,
      theme: 'dark',
      language: 'en',
      timezone: 'UTC',
      accessibility: {
        highContrast: false,
        fontSize: 'medium',
        reducedMotion: false,
        screenReaderMode: false,
        colorBlindMode: 'none'
      },
      notifications: {
        email: true,
        skills: true,
        xp: true
      },
      custom: {},
      accessibilityContext: ''
    };
  }

  /**
   * Add screen reader semantic markers
   * @private
   */
  _addScreenReaderMarkers(text) {
    // Add [Heading], [Code], [List] markers for screen readers
    let marked = text;

    // Markdown headings
    marked = marked.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, heading) => {
      const level = hashes.length;
      return `[Heading Level ${level}] ${heading}`;
    });

    // Code blocks
    marked = marked.replace(/```(\w+)?\n/g, '[Code Block Start]\n```$1\n');
    marked = marked.replace(/\n```/g, '\n```\n[Code Block End]');

    // Lists
    marked = marked.replace(/^[-*]\s+/gm, '[List Item] ');
    marked = marked.replace(/^\d+\.\s+/gm, '[Numbered List Item] ');

    return marked;
  }

  /**
   * Simplify color-specific language for high contrast mode
   * @private
   */
  _simplifyColorLanguage(text) {
    // Replace color references with descriptive alternatives
    const colorMappings = {
      'red': 'important/error',
      'green': 'success/positive',
      'blue': 'informational',
      'yellow': 'warning',
      'orange': 'attention',
      'gray': 'neutral',
      'purple': 'special'
    };

    let simplified = text;
    for (const [color, description] of Object.entries(colorMappings)) {
      const regex = new RegExp(`\\b${color}\\b`, 'gi');
      simplified = simplified.replace(regex, `${color} (${description})`);
    }

    return simplified;
  }

  /**
   * Emphasize structure for large fonts
   * @private
   */
  _emphasizeStructure(text) {
    // Add extra newlines for better visual separation
    let emphasized = text;

    // Add space after headings
    emphasized = emphasized.replace(/^(#{1,6}\s+.+)$/gm, '$1\n');

    // Add space before lists
    emphasized = emphasized.replace(/\n([-*]\s+)/g, '\n\n$1');

    return emphasized;
  }

  /**
   * Cleanup expired cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    for (const [userId, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= this.cacheTTL) {
        this.cache.delete(userId);
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    clearInterval(this.cacheCleanupInterval);
    this.cache.clear();
  }
}

module.exports = UserContextTransformer;
