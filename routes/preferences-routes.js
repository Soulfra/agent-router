/**
 * User Preferences API Routes
 *
 * Manages user settings and preferences including:
 * - Display preferences (theme, language, timezone)
 * - Accessibility settings (high contrast, font size, screen reader mode)
 * - Notification preferences
 * - Custom preferences (stored in JSONB)
 *
 * All routes require authentication via SSO middleware
 */

const express = require('express');
const { requireAuth } = require('../middleware/sso-auth');

function initPreferencesRoutes(db, userContextTransformer = null) {
  const router = express.Router();

  // Lazy-load context transformer if not provided
  if (!userContextTransformer && db) {
    const UserContextTransformer = require('../lib/user-context-transformer');
    userContextTransformer = new UserContextTransformer({ db });
  }

  /**
   * GET /api/preferences
   * Get current user preferences
   */
  router.get('/', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      // If context already loaded by middleware, use it
      if (req.user.context) {
        return res.json({
          success: true,
          preferences: req.user.context
        });
      }

      // Otherwise load from database
      const result = await db.query(
        `SELECT * FROM user_context_profiles WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Preferences not found',
          message: 'No preferences exist for this user'
        });
      }

      const prefs = result.rows[0];

      res.json({
        success: true,
        preferences: {
          userId: prefs.user_id,
          username: prefs.username,
          theme: prefs.theme,
          language: prefs.language,
          timezone: prefs.timezone,
          accessibility: {
            highContrast: prefs.high_contrast,
            fontSize: prefs.font_size,
            reducedMotion: prefs.reduced_motion,
            screenReaderMode: prefs.screen_reader_mode,
            colorBlindMode: prefs.color_blind_mode
          },
          notifications: {
            email: prefs.email_notifications,
            skills: prefs.show_skill_notifications,
            xp: prefs.show_xp_gains
          },
          custom: prefs.custom_preferences,
          accessibilityContext: prefs.accessibility_context
        }
      });

    } catch (error) {
      console.error('[Preferences] Error fetching preferences:', error);
      res.status(500).json({
        error: 'Failed to fetch preferences',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/preferences
   * Update user preferences
   *
   * Body: {
   *   theme?: string,
   *   language?: string,
   *   timezone?: string,
   *   emailNotifications?: boolean,
   *   showSkillNotifications?: boolean,
   *   showXpGains?: boolean
   * }
   */
  router.put('/', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      // Build SQL update
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.theme !== undefined) {
        fields.push(`theme = $${paramIndex++}`);
        values.push(updates.theme);
      }

      if (updates.language !== undefined) {
        fields.push(`language = $${paramIndex++}`);
        values.push(updates.language);
      }

      if (updates.timezone !== undefined) {
        fields.push(`timezone = $${paramIndex++}`);
        values.push(updates.timezone);
      }

      if (updates.emailNotifications !== undefined) {
        fields.push(`email_notifications = $${paramIndex++}`);
        values.push(updates.emailNotifications);
      }

      if (updates.showSkillNotifications !== undefined) {
        fields.push(`show_skill_notifications = $${paramIndex++}`);
        values.push(updates.showSkillNotifications);
      }

      if (updates.showXpGains !== undefined) {
        fields.push(`show_xp_gains = $${paramIndex++}`);
        values.push(updates.showXpGains);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          error: 'No updates provided',
          message: 'Please provide at least one preference to update'
        });
      }

      // Add updated_at and user_id
      fields.push('updated_at = NOW()');
      values.push(userId);

      // Execute update
      const result = await db.query(
        `UPDATE user_preferences
         SET ${fields.join(', ')}
         WHERE user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      // Invalidate cache if transformer available
      if (userContextTransformer) {
        userContextTransformer.invalidateCache(userId);
      }

      res.json({
        success: true,
        message: 'Preferences updated successfully',
        preferences: result.rows[0]
      });

    } catch (error) {
      console.error('[Preferences] Error updating preferences:', error);
      res.status(500).json({
        error: 'Failed to update preferences',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/preferences/accessibility
   * Update accessibility preferences specifically
   *
   * Body: {
   *   highContrast?: boolean,
   *   fontSize?: string,  // small, medium, large, xlarge
   *   reducedMotion?: boolean,
   *   screenReaderMode?: boolean,
   *   colorBlindMode?: string  // none, deuteranopia, protanopia, tritanopia
   * }
   */
  router.put('/accessibility', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const accessibility = req.body;

      // Validate fontSize if provided
      if (accessibility.fontSize && !['small', 'medium', 'large', 'xlarge'].includes(accessibility.fontSize)) {
        return res.status(400).json({
          error: 'Invalid font size',
          message: 'Font size must be: small, medium, large, or xlarge'
        });
      }

      // Validate colorBlindMode if provided
      if (accessibility.colorBlindMode && !['none', 'deuteranopia', 'protanopia', 'tritanopia'].includes(accessibility.colorBlindMode)) {
        return res.status(400).json({
          error: 'Invalid color blind mode',
          message: 'Color blind mode must be: none, deuteranopia, protanopia, or tritanopia'
        });
      }

      // Use context transformer if available
      if (userContextTransformer) {
        const success = await userContextTransformer.updateAccessibilityPreferences(userId, accessibility);

        if (!success) {
          throw new Error('Failed to update accessibility preferences');
        }

        // Load updated context
        const updatedContext = await userContextTransformer.loadUserContext(userId, false); // bypass cache

        return res.json({
          success: true,
          message: 'Accessibility preferences updated successfully',
          accessibility: updatedContext.accessibility,
          accessibilityContext: updatedContext.accessibilityContext
        });
      }

      // Fallback: direct database update
      await db.query(
        `SELECT update_user_accessibility_preferences($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          accessibility.highContrast !== undefined ? accessibility.highContrast : null,
          accessibility.fontSize || null,
          accessibility.reducedMotion !== undefined ? accessibility.reducedMotion : null,
          accessibility.screenReaderMode !== undefined ? accessibility.screenReaderMode : null,
          accessibility.colorBlindMode || null
        ]
      );

      // Get updated preferences
      const result = await db.query(
        `SELECT * FROM user_context_profiles WHERE user_id = $1`,
        [userId]
      );

      const prefs = result.rows[0];

      res.json({
        success: true,
        message: 'Accessibility preferences updated successfully',
        accessibility: {
          highContrast: prefs.high_contrast,
          fontSize: prefs.font_size,
          reducedMotion: prefs.reduced_motion,
          screenReaderMode: prefs.screen_reader_mode,
          colorBlindMode: prefs.color_blind_mode
        },
        accessibilityContext: prefs.accessibility_context
      });

    } catch (error) {
      console.error('[Preferences] Error updating accessibility:', error);
      res.status(500).json({
        error: 'Failed to update accessibility preferences',
        message: error.message
      });
    }
  });

  /**
   * GET /api/preferences/profile
   * Get complete user context profile (includes room colors, model preferences)
   */
  router.get('/profile', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      if (!userContextTransformer) {
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Context transformer not initialized'
        });
      }

      const profile = await userContextTransformer.getUserContextProfile(userId);

      res.json({
        success: true,
        profile: profile
      });

    } catch (error) {
      console.error('[Preferences] Error fetching profile:', error);
      res.status(500).json({
        error: 'Failed to fetch profile',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/preferences/custom
   * Update custom preferences (stored in JSONB field)
   *
   * Body: {
   *   key: string,
   *   value: any
   * }
   */
  router.put('/custom', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const { key, value } = req.body;

      if (!key) {
        return res.status(400).json({
          error: 'Missing key',
          message: 'Please provide a key for the custom preference'
        });
      }

      // Update JSONB preferences field
      await db.query(
        `UPDATE user_preferences
         SET preferences = jsonb_set(
           COALESCE(preferences, '{}'),
           '{${key}}',
           $1,
           true
         ),
         updated_at = NOW()
         WHERE user_id = $2`,
        [JSON.stringify(value), userId]
      );

      // Invalidate cache
      if (userContextTransformer) {
        userContextTransformer.invalidateCache(userId);
      }

      res.json({
        success: true,
        message: 'Custom preference updated successfully',
        key: key,
        value: value
      });

    } catch (error) {
      console.error('[Preferences] Error updating custom preference:', error);
      res.status(500).json({
        error: 'Failed to update custom preference',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/preferences/custom/:key
   * Delete custom preference
   */
  router.delete('/custom/:key', requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const key = req.params.key;

      // Remove from JSONB preferences field
      await db.query(
        `UPDATE user_preferences
         SET preferences = preferences - $1,
         updated_at = NOW()
         WHERE user_id = $2`,
        [key, userId]
      );

      // Invalidate cache
      if (userContextTransformer) {
        userContextTransformer.invalidateCache(userId);
      }

      res.json({
        success: true,
        message: 'Custom preference deleted successfully',
        key: key
      });

    } catch (error) {
      console.error('[Preferences] Error deleting custom preference:', error);
      res.status(500).json({
        error: 'Failed to delete custom preference',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = initPreferencesRoutes;
