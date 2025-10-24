/**
 * Handle Registry
 *
 * Manages @username handles across the platform (like Discord/Twitter)
 * Handles can be used for: profiles, messaging, payments, API access
 *
 * Features:
 * - Unique, memorable handles (3-30 chars)
 * - Case-insensitive matching
 * - Profanity filtering
 * - Premium handle reservations
 * - Change limits (prevent abuse)
 * - Audit trail
 *
 * Usage:
 * const handleRegistry = new HandleRegistry({ db });
 * const available = await handleRegistry.checkAvailability('johndoe');
 * await handleRegistry.setHandle(userId, 'johndoe');
 * const user = await handleRegistry.getUserByHandle('johndoe');
 */

class HandleRegistry {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required for HandleRegistry');
    }

    // Configuration
    this.minLength = options.minLength || 3;
    this.maxLength = options.maxLength || 30;
    this.defaultChangesAllowed = options.defaultChangesAllowed || 1;
  }

  /**
   * Check if handle is available
   *
   * @param {string} handle - Handle to check
   * @returns {Promise<object>} { available, reason }
   */
  async checkAvailability(handle) {
    try {
      const result = await this.db.query(
        'SELECT is_handle_available($1) as available',
        [handle]
      );

      const available = result.rows[0].available;

      if (available) {
        return {
          available: true,
          handle: handle.trim(),
          normalized: handle.trim().toLowerCase()
        };
      }

      // Determine why it's not available
      let reason = 'Handle not available';

      // Check if taken
      const takenResult = await this.db.query(
        'SELECT 1 FROM users WHERE handle_lowercase = $1',
        [handle.trim().toLowerCase()]
      );

      if (takenResult.rows.length > 0) {
        reason = 'Handle already taken';
      }

      // Check if reserved
      const reservedResult = await this.db.query(
        `SELECT reservation_type, price_cents
         FROM handle_reservations
         WHERE handle_lowercase = $1 AND status = 'reserved'
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [handle.trim().toLowerCase()]
      );

      if (reservedResult.rows.length > 0) {
        const reservation = reservedResult.rows[0];
        if (reservation.reservation_type === 'premium') {
          reason = `Premium handle - Purchase for $${(reservation.price_cents / 100).toFixed(2)}`;
        } else {
          reason = `Handle reserved (${reservation.reservation_type})`;
        }
      }

      // Check if blocked
      const blockedResult = await this.db.query(
        `SELECT block_reason FROM blocked_handles
         WHERE $1 LIKE handle_pattern`,
        [handle.trim().toLowerCase()]
      );

      if (blockedResult.rows.length > 0) {
        reason = `Handle blocked: ${blockedResult.rows[0].block_reason}`;
      }

      return {
        available: false,
        reason: reason
      };

    } catch (error) {
      console.error('[HandleRegistry] Error checking availability:', error);
      throw error;
    }
  }

  /**
   * Set user's handle
   *
   * @param {string} userId - User ID
   * @param {string} handle - Desired handle
   * @param {object} options - Additional options (ipAddress, userAgent)
   * @returns {Promise<object>} { success, handle, error }
   */
  async setHandle(userId, handle, options = {}) {
    try {
      const result = await this.db.query(
        `SELECT * FROM set_user_handle($1, $2, $3, $4)`,
        [
          userId,
          handle,
          options.ipAddress || null,
          options.userAgent || null
        ]
      );

      const row = result.rows[0];

      if (row.success) {
        console.log(`[HandleRegistry] User ${userId} set handle: @${row.handle}`);

        return {
          success: true,
          handle: row.handle,
          url: `/@${row.handle}`
        };
      } else {
        return {
          success: false,
          error: row.error_message
        };
      }

    } catch (error) {
      console.error('[HandleRegistry] Error setting handle:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user by handle
   *
   * @param {string} handle - Handle to look up
   * @returns {Promise<object|null>} User data or null
   */
  async getUserByHandle(handle) {
    try {
      const result = await this.db.query(
        'SELECT * FROM get_user_by_handle($1)',
        [handle]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[HandleRegistry] Error getting user by handle:', error);
      return null;
    }
  }

  /**
   * Get user's handle
   *
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Handle or null
   */
  async getHandle(userId) {
    try {
      const result = await this.db.query(
        'SELECT handle FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].handle;

    } catch (error) {
      console.error('[HandleRegistry] Error getting handle:', error);
      return null;
    }
  }

  /**
   * Get handle change history for user
   *
   * @param {string} userId - User ID
   * @param {number} limit - Max number of results
   * @returns {Promise<Array>} Handle history
   */
  async getHandleHistory(userId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT
          history_id,
          old_handle,
          new_handle,
          change_reason,
          changed_at
        FROM handle_history
        WHERE user_id = $1
        ORDER BY changed_at DESC
        LIMIT $2`,
        [userId, limit]
      );

      return result.rows;

    } catch (error) {
      console.error('[HandleRegistry] Error getting handle history:', error);
      return [];
    }
  }

  /**
   * Get handle changes remaining for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of changes remaining
   */
  async getChangesRemaining(userId) {
    try {
      const result = await this.db.query(
        'SELECT handle_changes_remaining FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return 0;
      }

      return result.rows[0].handle_changes_remaining || 0;

    } catch (error) {
      console.error('[HandleRegistry] Error getting changes remaining:', error);
      return 0;
    }
  }

  /**
   * Add handle changes (admin/purchase)
   *
   * @param {string} userId - User ID
   * @param {number} additionalChanges - Number of changes to add
   * @returns {Promise<number>} New total
   */
  async addHandleChanges(userId, additionalChanges = 1) {
    try {
      const result = await this.db.query(
        `UPDATE users
         SET handle_changes_remaining = handle_changes_remaining + $2
         WHERE user_id = $1
         RETURNING handle_changes_remaining`,
        [userId, additionalChanges]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const newTotal = result.rows[0].handle_changes_remaining;

      console.log(`[HandleRegistry] Added ${additionalChanges} changes to user ${userId}, new total: ${newTotal}`);

      return newTotal;

    } catch (error) {
      console.error('[HandleRegistry] Error adding handle changes:', error);
      throw error;
    }
  }

  /**
   * Search handles (autocomplete/suggestions)
   *
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Matching handles
   */
  async searchHandles(query, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT
          user_id,
          handle,
          username,
          created_at
        FROM users
        WHERE handle IS NOT NULL
        AND handle_lowercase LIKE $1
        ORDER BY
          CASE
            WHEN handle_lowercase = $2 THEN 0
            WHEN handle_lowercase LIKE $2 || '%' THEN 1
            ELSE 2
          END,
          created_at ASC
        LIMIT $3`,
        [`%${query.toLowerCase()}%`, query.toLowerCase(), limit]
      );

      return result.rows.map(row => ({
        userId: row.user_id,
        handle: row.handle,
        username: row.username,
        url: `/@${row.handle}`,
        createdAt: row.created_at
      }));

    } catch (error) {
      console.error('[HandleRegistry] Error searching handles:', error);
      return [];
    }
  }

  /**
   * Get premium handles available for purchase
   *
   * @returns {Promise<Array>} Available premium handles
   */
  async getPremiumHandles() {
    try {
      const result = await this.db.query(`
        SELECT * FROM available_premium_handles
        ORDER BY price_cents DESC
      `);

      return result.rows.map(row => ({
        handle: row.handle,
        priceCents: row.price_cents,
        priceDollars: row.price_dollars,
        reservedAt: row.reserved_at,
        expiresAt: row.expires_at
      }));

    } catch (error) {
      console.error('[HandleRegistry] Error getting premium handles:', error);
      return [];
    }
  }

  /**
   * Purchase premium handle
   *
   * @param {string} userId - User ID
   * @param {string} handle - Premium handle to purchase
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<object>} { success, handle, error }
   */
  async purchasePremiumHandle(userId, handle, paymentIntentId) {
    try {
      // Check if handle is premium and available
      const result = await this.db.query(
        `SELECT * FROM handle_reservations
         WHERE handle_lowercase = $1
         AND reservation_type = 'premium'
         AND status = 'reserved'
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [handle.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Premium handle not available'
        };
      }

      const reservation = result.rows[0];

      // Mark as claimed
      await this.db.query(
        `UPDATE handle_reservations
         SET status = 'claimed',
             reserved_for_user_id = $1,
             claimed_at = NOW()
         WHERE reservation_id = $2`,
        [userId, reservation.reservation_id]
      );

      // Set user's handle
      const setResult = await this.setHandle(userId, handle, {});

      if (!setResult.success) {
        // Rollback reservation claim
        await this.db.query(
          `UPDATE handle_reservations
           SET status = 'reserved',
               reserved_for_user_id = NULL,
               claimed_at = NULL
           WHERE reservation_id = $1`,
          [reservation.reservation_id]
        );

        return {
          success: false,
          error: setResult.error
        };
      }

      console.log(`[HandleRegistry] User ${userId} purchased premium handle @${handle} for $${(reservation.price_cents / 100).toFixed(2)}`);

      return {
        success: true,
        handle: handle,
        pricePaid: reservation.price_cents,
        url: `/@${handle}`
      };

    } catch (error) {
      console.error('[HandleRegistry] Error purchasing premium handle:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Suggest alternative handles if desired one is taken
   *
   * @param {string} desiredHandle - Desired handle
   * @param {number} count - Number of suggestions
   * @returns {Promise<Array>} Array of available alternative handles
   */
  async suggestAlternatives(desiredHandle, count = 5) {
    const suggestions = [];

    // Try with numbers
    for (let i = 1; i <= 99 && suggestions.length < count; i++) {
      const suggestion = `${desiredHandle}${i}`;
      const availability = await this.checkAvailability(suggestion);
      if (availability.available) {
        suggestions.push(suggestion);
      }
    }

    // Try with underscores
    if (suggestions.length < count) {
      const withUnderscore = `${desiredHandle}_`;
      const availability = await this.checkAvailability(withUnderscore);
      if (availability.available) {
        suggestions.push(withUnderscore);
      }
    }

    // Try variations
    const variations = [
      `the_${desiredHandle}`,
      `${desiredHandle}_official`,
      `real_${desiredHandle}`,
      `${desiredHandle}_real`
    ];

    for (const variation of variations) {
      if (suggestions.length >= count) break;

      const availability = await this.checkAvailability(variation);
      if (availability.available) {
        suggestions.push(variation);
      }
    }

    return suggestions.slice(0, count);
  }
}

module.exports = HandleRegistry;
