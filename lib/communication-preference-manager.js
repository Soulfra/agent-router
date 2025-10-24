/**
 * Communication Preference Manager
 *
 * Manages user communication channel preferences (email, SMS, push notifications).
 * Privacy-first design: users control ALL communication.
 *
 * Features:
 * - Email enabled by default (zero-cost via Gmail gateway)
 * - SMS is OPT-IN ONLY (privacy-first, GDPR/CCPA compliant)
 * - Push notifications opt-in
 * - Quiet hours support
 * - Rate limiting (prevent spam)
 * - Unsubscribe handling
 *
 * Integration:
 * - Communication Log (track all messages sent)
 * - Rate Limiting (database functions)
 * - Quiet Hours (timezone-aware)
 */

class CommunicationPreferenceManager {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    this._log('Initialized');
  }

  // ============================================================================
  // PREFERENCE MANAGEMENT
  // ============================================================================

  /**
   * Get user's communication preferences
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Preferences
   */
  async getPreferences(userId) {
    try {
      const result = await this.db.query(`
        SELECT *
        FROM communication_preferences
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // Create default preferences if not exists
        return await this.createDefaultPreferences(userId);
      }

      return result.rows[0];

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Get preferences error:', error.message);
      throw error;
    }
  }

  /**
   * Create default preferences for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created preferences
   */
  async createDefaultPreferences(userId) {
    try {
      const result = await this.db.query(`
        INSERT INTO communication_preferences (user_id)
        VALUES ($1)
        RETURNING *
      `, [userId]);

      this._log(`Created default preferences for user ${userId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Create default preferences error:', error.message);
      throw error;
    }
  }

  /**
   * Update user communication preferences
   *
   * @param {string} userId - User ID
   * @param {Object} updates - Preference updates
   * @returns {Promise<Object>} Updated preferences
   */
  async updatePreferences(userId, updates = {}) {
    try {
      const {
        email_enabled,
        sms_enabled,
        push_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
        quiet_hours_timezone,
        max_emails_per_day,
        max_sms_per_day,
        max_push_per_day,
        notify_contract_signed,
        notify_contract_shared,
        notify_credits_earned,
        notify_forum_replies,
        notify_social_mentions,
        notify_campaign_updates
      } = updates;

      // Build SET clause dynamically
      const setClauses = [];
      const values = [userId];
      let paramIndex = 2;

      if (email_enabled !== undefined) {
        setClauses.push(`email_enabled = $${paramIndex++}`);
        values.push(email_enabled);
      }

      if (sms_enabled !== undefined) {
        // SMS can only be enabled if phone is verified
        setClauses.push(`sms_enabled = CASE WHEN phone_verified THEN $${paramIndex++} ELSE false END`);
        values.push(sms_enabled);
      }

      if (push_enabled !== undefined) {
        setClauses.push(`push_enabled = $${paramIndex++}`);
        values.push(push_enabled);
      }

      if (quiet_hours_enabled !== undefined) {
        setClauses.push(`quiet_hours_enabled = $${paramIndex++}`);
        values.push(quiet_hours_enabled);
      }

      if (quiet_hours_start !== undefined) {
        setClauses.push(`quiet_hours_start = $${paramIndex++}`);
        values.push(quiet_hours_start);
      }

      if (quiet_hours_end !== undefined) {
        setClauses.push(`quiet_hours_end = $${paramIndex++}`);
        values.push(quiet_hours_end);
      }

      if (quiet_hours_timezone !== undefined) {
        setClauses.push(`quiet_hours_timezone = $${paramIndex++}`);
        values.push(quiet_hours_timezone);
      }

      if (max_emails_per_day !== undefined) {
        setClauses.push(`max_emails_per_day = $${paramIndex++}`);
        values.push(max_emails_per_day);
      }

      if (max_sms_per_day !== undefined) {
        setClauses.push(`max_sms_per_day = $${paramIndex++}`);
        values.push(max_sms_per_day);
      }

      if (max_push_per_day !== undefined) {
        setClauses.push(`max_push_per_day = $${paramIndex++}`);
        values.push(max_push_per_day);
      }

      // Notification type preferences
      if (notify_contract_signed !== undefined) {
        setClauses.push(`notify_contract_signed = $${paramIndex++}`);
        values.push(notify_contract_signed);
      }

      if (notify_contract_shared !== undefined) {
        setClauses.push(`notify_contract_shared = $${paramIndex++}`);
        values.push(notify_contract_shared);
      }

      if (notify_credits_earned !== undefined) {
        setClauses.push(`notify_credits_earned = $${paramIndex++}`);
        values.push(notify_credits_earned);
      }

      if (notify_forum_replies !== undefined) {
        setClauses.push(`notify_forum_replies = $${paramIndex++}`);
        values.push(notify_forum_replies);
      }

      if (notify_social_mentions !== undefined) {
        setClauses.push(`notify_social_mentions = $${paramIndex++}`);
        values.push(notify_social_mentions);
      }

      if (notify_campaign_updates !== undefined) {
        setClauses.push(`notify_campaign_updates = $${paramIndex++}`);
        values.push(notify_campaign_updates);
      }

      if (setClauses.length === 0) {
        throw new Error('No valid updates provided');
      }

      setClauses.push(`updated_at = NOW()`);

      const query = `
        UPDATE communication_preferences
        SET ${setClauses.join(', ')}
        WHERE user_id = $1
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('User preferences not found');
      }

      this._log(`Updated preferences for user ${userId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Update preferences error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // CHANNEL CHECKS
  // ============================================================================

  /**
   * Check if user can receive message on channel
   *
   * @param {string} userId - User ID
   * @param {string} channel - Channel ('email', 'sms', 'push')
   * @param {string} eventType - Event type (e.g., 'contract_signed')
   * @returns {Promise<Object>} Check result
   */
  async canSendMessage(userId, channel, eventType) {
    try {
      const prefs = await this.getPreferences(userId);

      // Check if channel is enabled
      if (!this._isChannelEnabled(prefs, channel)) {
        return {
          allowed: false,
          reason: `${channel} notifications disabled`,
          preferences: prefs
        };
      }

      // Check if event type is enabled
      if (!this._isEventTypeEnabled(prefs, eventType)) {
        return {
          allowed: false,
          reason: `${eventType} notifications disabled`,
          preferences: prefs
        };
      }

      // Check rate limit
      const rateLimitOk = await this._checkRateLimit(userId, channel);
      if (!rateLimitOk) {
        return {
          allowed: false,
          reason: `Rate limit exceeded for ${channel}`,
          preferences: prefs
        };
      }

      // Check quiet hours
      const isQuietHours = await this._isQuietHours(userId);
      if (isQuietHours) {
        return {
          allowed: false,
          reason: 'Currently in quiet hours',
          preferences: prefs
        };
      }

      // All checks passed
      return {
        allowed: true,
        preferences: prefs
      };

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Can send message error:', error.message);
      throw error;
    }
  }

  /**
   * Check if channel is enabled
   *
   * @param {Object} prefs - User preferences
   * @param {string} channel - Channel name
   * @returns {boolean} Is enabled
   */
  _isChannelEnabled(prefs, channel) {
    switch (channel) {
      case 'email':
        return prefs.email_enabled === true;
      case 'sms':
        return prefs.sms_enabled === true && prefs.phone_verified === true;
      case 'push':
        return prefs.push_enabled === true;
      default:
        return false;
    }
  }

  /**
   * Check if event type is enabled
   *
   * @param {Object} prefs - User preferences
   * @param {string} eventType - Event type
   * @returns {boolean} Is enabled
   */
  _isEventTypeEnabled(prefs, eventType) {
    const eventMap = {
      'contract_signed': 'notify_contract_signed',
      'contract_shared': 'notify_contract_shared',
      'credits_earned': 'notify_credits_earned',
      'forum_reply': 'notify_forum_replies',
      'social_mention': 'notify_social_mentions',
      'campaign_update': 'notify_campaign_updates'
    };

    const prefKey = eventMap[eventType];
    if (!prefKey) {
      return true; // Unknown event types are allowed by default
    }

    return prefs[prefKey] === true;
  }

  /**
   * Check rate limit
   *
   * @param {string} userId - User ID
   * @param {string} channel - Channel name
   * @returns {Promise<boolean>} Is within rate limit
   */
  async _checkRateLimit(userId, channel) {
    try {
      const result = await this.db.query(`
        SELECT check_message_rate_limit($1, $2) as allowed
      `, [userId, channel]);

      return result.rows[0].allowed;

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Check rate limit error:', error.message);
      return true; // Allow on error (fail open)
    }
  }

  /**
   * Check if it's quiet hours
   *
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Is quiet hours
   */
  async _isQuietHours(userId) {
    try {
      const result = await this.db.query(`
        SELECT is_quiet_hours($1) as quiet_hours
      `, [userId]);

      return result.rows[0].quiet_hours;

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Check quiet hours error:', error.message);
      return false; // Allow on error (fail open)
    }
  }

  // ============================================================================
  // UNSUBSCRIBE
  // ============================================================================

  /**
   * Unsubscribe user from all communications
   *
   * @param {string} userId - User ID
   * @param {string} reason - Optional unsubscribe reason
   * @returns {Promise<Object>} Unsubscribe result
   */
  async unsubscribeAll(userId, reason = null) {
    try {
      const result = await this.db.query(`
        UPDATE communication_preferences
        SET
          email_enabled = false,
          sms_enabled = false,
          push_enabled = false,
          unsubscribed_at = NOW(),
          unsubscribe_reason = $2,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, reason]);

      this._log(`User ${userId} unsubscribed from all communications`);

      return {
        success: true,
        message: 'Unsubscribed from all communications',
        preferences: result.rows[0]
      };

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Unsubscribe all error:', error.message);
      throw error;
    }
  }

  /**
   * Unsubscribe user by token (from email link)
   *
   * @param {string} token - Unsubscribe token
   * @param {string} reason - Optional unsubscribe reason
   * @returns {Promise<Object>} Unsubscribe result
   */
  async unsubscribeByToken(token, reason = null) {
    try {
      const result = await this.db.query(`
        UPDATE communication_preferences
        SET
          email_enabled = false,
          sms_enabled = false,
          push_enabled = false,
          unsubscribed_at = NOW(),
          unsubscribe_reason = $2,
          updated_at = NOW()
        WHERE unsubscribe_token = $1
        RETURNING user_id, *
      `, [token, reason]);

      if (result.rows.length === 0) {
        throw new Error('Invalid unsubscribe token');
      }

      const userId = result.rows[0].user_id;
      this._log(`User ${userId} unsubscribed via token`);

      return {
        success: true,
        message: 'Unsubscribed from all communications',
        userId,
        preferences: result.rows[0]
      };

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Unsubscribe by token error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get communication stats for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Stats
   */
  async getStats(userId) {
    try {
      const prefs = await this.getPreferences(userId);

      // Get message counts by channel
      const messageStats = await this.db.query(`
        SELECT
          channel,
          COUNT(*) as total_sent,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
          COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked
        FROM communication_log
        WHERE user_id = $1
        GROUP BY channel
      `, [userId]);

      const stats = {
        preferences: {
          email_enabled: prefs.email_enabled,
          sms_enabled: prefs.sms_enabled,
          push_enabled: prefs.push_enabled,
          phone_verified: prefs.phone_verified
        },
        totals: {
          emails_sent: prefs.total_emails_sent,
          sms_sent: prefs.total_sms_sent,
          push_sent: prefs.total_push_sent
        },
        last_sent: {
          email: prefs.last_email_sent_at,
          sms: prefs.last_sms_sent_at,
          push: prefs.last_push_sent_at
        },
        by_channel: {}
      };

      // Add detailed stats by channel
      messageStats.rows.forEach(row => {
        stats.by_channel[row.channel] = {
          total_sent: parseInt(row.total_sent),
          delivered: parseInt(row.delivered),
          failed: parseInt(row.failed),
          opened: parseInt(row.opened),
          clicked: parseInt(row.clicked),
          open_rate: row.total_sent > 0 ? (parseInt(row.opened) / parseInt(row.total_sent) * 100).toFixed(2) + '%' : '0%',
          click_rate: row.total_sent > 0 ? (parseInt(row.clicked) / parseInt(row.total_sent) * 100).toFixed(2) + '%' : '0%'
        };
      });

      return stats;

    } catch (error) {
      console.error('[CommunicationPreferenceManager] Get stats error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[CommunicationPreferenceManager] ${message}`);
    }
  }
}

module.exports = CommunicationPreferenceManager;
