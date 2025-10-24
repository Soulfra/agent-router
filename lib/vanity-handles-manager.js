/**
 * Vanity Handles Manager
 *
 * Manages @username handles like Discord/Twitter
 * Uses database schema from 032_vanity_handles.sql
 */

class VanityHandlesManager {
  constructor(db) {
    this.db = db;
    console.log('[VanityHandles] Initialized');
  }

  /**
   * Check if handle is available
   * Uses is_handle_available() database function
   */
  async checkAvailability(handle) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        'SELECT is_handle_available($1) as available',
        [handle]
      );

      const available = result.rows[0].available;

      if (!available) {
        // Check why it's unavailable
        const taken = await this.db.query(
          'SELECT id, handle FROM users WHERE handle_lowercase = LOWER($1)',
          [handle]
        );

        if (taken.rows.length > 0) {
          return {
            available: false,
            reason: 'Handle already taken',
            takenBy: taken.rows[0].id
          };
        }

        const reserved = await this.db.query(
          `SELECT reservation_type, price_cents
           FROM handle_reservations
           WHERE handle_lowercase = LOWER($1)
           AND status = 'reserved'
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [handle]
        );

        if (reserved.rows.length > 0) {
          const res = reserved.rows[0];
          return {
            available: false,
            reason: `Reserved (${res.reservation_type})`,
            premium: res.reservation_type === 'premium',
            price: res.price_cents
          };
        }

        const blocked = await this.db.query(
          `SELECT block_reason
           FROM blocked_handles
           WHERE LOWER($1) LIKE handle_pattern`,
          [handle]
        );

        if (blocked.rows.length > 0) {
          return {
            available: false,
            reason: `Blocked (${blocked.rows[0].block_reason})`
          };
        }

        return {
          available: false,
          reason: 'Invalid format (3-30 chars, alphanumeric + underscore)'
        };
      }

      return {
        available: true,
        handle: handle
      };
    } catch (error) {
      console.error('[VanityHandles] Error checking availability:', error.message);
      throw error;
    }
  }

  /**
   * Claim a handle for a user
   * Uses set_user_handle() database function
   */
  async claimHandle(userId, handle, ipAddress = null, userAgent = null) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        'SELECT * FROM set_user_handle($1, $2, $3, $4)',
        [userId, handle, ipAddress, userAgent]
      );

      const row = result.rows[0];

      if (!row.success) {
        return {
          success: false,
          error: row.error_message
        };
      }

      console.log(`[VanityHandles] User ${userId} claimed @${row.handle}`);

      return {
        success: true,
        handle: row.handle
      };
    } catch (error) {
      console.error('[VanityHandles] Error claiming handle:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user by handle
   * Uses get_user_by_handle() database function
   */
  async getUserByHandle(handle) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

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
      console.error('[VanityHandles] Error getting user by handle:', error.message);
      throw error;
    }
  }

  /**
   * Get all premium handles available for purchase
   */
  async getPremiumHandles() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          handle,
          price_cents,
          price_cents / 100.0 as price_dollars,
          reason,
          reserved_at
         FROM handle_reservations
         WHERE reservation_type = 'premium'
           AND status = 'reserved'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY price_cents DESC
         LIMIT 50`
      );

      return result.rows;
    } catch (error) {
      console.error('[VanityHandles] Error getting premium handles:', error.message);
      throw error;
    }
  }

  /**
   * Get recent handle changes
   */
  async getRecentChanges(limit = 50) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          u.user_id,
          u.email,
          u.username,
          hh.old_handle,
          hh.new_handle,
          hh.change_reason,
          hh.changed_at
         FROM handle_history hh
         JOIN users u ON u.user_id = hh.user_id
         ORDER BY hh.changed_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[VanityHandles] Error getting recent changes:', error.message);
      throw error;
    }
  }

  /**
   * Get overall stats
   */
  async getStats() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const totalResult = await this.db.query(
        'SELECT COUNT(*)::integer as count FROM users WHERE handle IS NOT NULL'
      );

      const premiumResult = await this.db.query(
        `SELECT COUNT(*)::integer as count
         FROM handle_reservations
         WHERE reservation_type = 'premium'
         AND status = 'reserved'`
      );

      const recentResult = await this.db.query(
        `SELECT COUNT(*)::integer as count
         FROM handle_history
         WHERE changed_at > NOW() - INTERVAL '24 hours'`
      );

      return {
        total: parseInt(totalResult.rows[0].count),
        premium: parseInt(premiumResult.rows[0].count),
        recent_changes_24h: parseInt(recentResult.rows[0].count)
      };
    } catch (error) {
      console.error('[VanityHandles] Error getting stats:', error.message);
      throw error;
    }
  }

  /**
   * Reserve a handle (admin only)
   */
  async reserveHandle(handle, type, priceCents = 0, reservedForUserId = null, reason = null) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `INSERT INTO handle_reservations
         (handle, handle_lowercase, reservation_type, price_cents, reserved_for_user_id, reason)
         VALUES ($1, LOWER($1), $2, $3, $4, $5)
         RETURNING *`,
        [handle, type, priceCents, reservedForUserId, reason]
      );

      console.log(`[VanityHandles] Reserved @${handle} (${type})`);

      return result.rows[0];
    } catch (error) {
      console.error('[VanityHandles] Error reserving handle:', error.message);
      throw error;
    }
  }

  /**
   * Get user's handle history
   */
  async getUserHistory(userId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          old_handle,
          new_handle,
          change_reason,
          changed_at
         FROM handle_history
         WHERE user_id = $1
         ORDER BY changed_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error('[VanityHandles] Error getting user history:', error.message);
      throw error;
    }
  }
}

module.exports = VanityHandlesManager;
