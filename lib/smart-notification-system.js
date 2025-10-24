/**
 * Smart Notification System
 *
 * "Meme and brick them unless it's important"
 *
 * Features:
 * - Default to MEME mode (spam with jokes/roasts)
 * - BRICK mode (consensual notification flooding)
 * - IMPORTANT mode (actually notify - rare)
 * - Smart detection of what's actually important
 * - Group-based notification preferences
 *
 * Philosophy:
 * Normal apps: Everything pretends to be important
 * Our app: Everything is memes UNLESS you mark it important
 *
 * This inverts the attention economy.
 */

class SmartNotificationSystem {
  constructor(options = {}) {
    this.db = options.db;
    this.pushService = options.pushService; // For actual push notifications

    this.config = {
      // Notification modes
      modes: {
        meme: {
          level: 0,
          frequency: 'high',
          sound: 'meme',
          vibrate: [200, 100, 200],
          priority: 'low'
        },
        brick: {
          level: 1,
          frequency: 'flood', // Spam mode
          sound: 'airhorn',
          vibrate: [500, 200, 500, 200, 500],
          priority: 'max'
        },
        important: {
          level: 2,
          frequency: 'normal',
          sound: 'default',
          vibrate: [400, 100, 400],
          priority: 'high'
        }
      },

      // Auto-detect important notifications
      importantKeywords: [
        'emergency',
        'urgent',
        'asap',
        'important',
        'critical',
        'deadline',
        'tonight',
        'game time',
        'practice',
        'meet',
        'location'
      ],

      // Meme notification templates
      memeTemplates: [
        '{user} says: {message} 💀',
        'bruh {user} posted: {message}',
        '{user} is yappin: {message} lol',
        'yo {user} dropped this: {message} fr fr',
        '{user} be like: {message} no cap'
      ],

      // Brick mode messages (consensual spam)
      brickMessages: [
        '🧱 BRICK 🧱',
        'GET BRICKED LOL',
        'NOTIFICATION SPAM',
        'CHECK YOUR PHONE',
        'PAY ATTENTION',
        'HELLO???',
        'YO YO YO',
        'DING DING DING'
      ],

      // Max notifications per hour in brick mode
      maxBrickPerHour: 100,

      // Cool-down between bricks (ms)
      brickCooldown: 5000 // 5 seconds
    };

    // Brick mode tracking
    this.brickSessions = new Map(); // groupId -> { active, count, startedAt }

    console.log('[SmartNotificationSystem] Initialized');
  }

  /**
   * Send notification (auto-detects mode)
   */
  async sendNotification({ groupId, userId, fromUser, message, type = 'auto', metadata = {} }) {
    try {
      // Auto-detect mode if type is 'auto'
      if (type === 'auto') {
        type = this._detectNotificationType(message, metadata);
      }

      // Get notification config
      const config = this.config.modes[type] || this.config.modes.meme;

      // Format notification based on type
      const notification = await this._formatNotification({
        groupId,
        userId,
        fromUser,
        message,
        type,
        config,
        metadata
      });

      // Store in database
      await this._storeNotification({
        groupId,
        userId,
        fromUser,
        message: notification.body,
        type,
        metadata
      });

      // Send push notification if service available
      if (this.pushService) {
        await this.pushService.send({
          userId,
          title: notification.title,
          body: notification.body,
          icon: notification.icon,
          sound: config.sound,
          vibrate: config.vibrate,
          priority: config.priority,
          data: {
            groupId,
            type,
            ...metadata
          }
        });
      }

      return {
        success: true,
        type,
        notification
      };

    } catch (error) {
      console.error('[SmartNotificationSystem] Error sending notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start brick mode (consensual notification spam)
   */
  async startBrickMode({ groupId, initiatedBy, targetUsers, duration = 60000 }) {
    try {
      // Check if brick mode already active
      if (this.brickSessions.has(groupId)) {
        return {
          success: false,
          error: 'Brick mode already active for this group'
        };
      }

      // Create brick session
      const session = {
        active: true,
        initiatedBy,
        targetUsers,
        count: 0,
        startedAt: Date.now(),
        endsAt: Date.now() + duration
      };

      this.brickSessions.set(groupId, session);

      // Start brick spam loop
      this._brickLoop(groupId, session);

      console.log(`[SmartNotificationSystem] Brick mode started for group ${groupId}`);

      return {
        success: true,
        session: {
          groupId,
          endsAt: new Date(session.endsAt)
        }
      };

    } catch (error) {
      console.error('[SmartNotificationSystem] Error starting brick mode:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop brick mode
   */
  async stopBrickMode(groupId) {
    const session = this.brickSessions.get(groupId);

    if (!session) {
      return {
        success: false,
        error: 'Brick mode not active'
      };
    }

    session.active = false;
    this.brickSessions.delete(groupId);

    console.log(`[SmartNotificationSystem] Brick mode stopped for group ${groupId}`);

    return {
      success: true,
      totalNotifications: session.count
    };
  }

  /**
   * Set notification preferences for user in group
   */
  async setPreferences({ groupId, userId, mode, muteUntil = null }) {
    try {
      await this.db.query(`
        INSERT INTO notification_preferences (
          group_id,
          user_id,
          mode,
          mute_until,
          updated_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (group_id, user_id)
        DO UPDATE SET
          mode = $3,
          mute_until = $4,
          updated_at = NOW()
      `, [groupId, userId, mode, muteUntil]);

      return { success: true };

    } catch (error) {
      console.error('[SmartNotificationSystem] Error setting preferences:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's notification preferences
   */
  async getPreferences(groupId, userId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM notification_preferences
        WHERE group_id = $1 AND user_id = $2
      `, [groupId, userId]);

      if (result.rows.length === 0) {
        // Default preferences
        return {
          success: true,
          preferences: {
            mode: 'meme',
            mute_until: null
          }
        };
      }

      return {
        success: true,
        preferences: result.rows[0]
      };

    } catch (error) {
      console.error('[SmartNotificationSystem] Error getting preferences:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect notification type based on content
   */
  _detectNotificationType(message, metadata = {}) {
    const lower = message.toLowerCase();

    // Check for important keywords
    for (const keyword of this.config.importantKeywords) {
      if (lower.includes(keyword)) {
        return 'important';
      }
    }

    // Check metadata flags
    if (metadata.important === true) {
      return 'important';
    }

    if (metadata.brick === true) {
      return 'brick';
    }

    // Default to meme mode
    return 'meme';
  }

  /**
   * Format notification based on type
   */
  async _formatNotification({ groupId, userId, fromUser, message, type, config, metadata }) {
    let title, body, icon;

    // Get group name
    const groupResult = await this.db.query(
      'SELECT name FROM groups WHERE group_id = $1',
      [groupId]
    );
    const groupName = groupResult.rows[0]?.name || 'Group';

    // Get from user name
    const fromUserName = fromUser.username || fromUser.name || 'Someone';

    switch (type) {
      case 'meme':
        // Random meme template
        const template = this.config.memeTemplates[
          Math.floor(Math.random() * this.config.memeTemplates.length)
        ];
        title = `${groupName} 😂`;
        body = template
          .replace('{user}', fromUserName)
          .replace('{message}', message);
        icon = '💀';
        break;

      case 'brick':
        // Brick spam message
        const brickMsg = this.config.brickMessages[
          Math.floor(Math.random() * this.config.brickMessages.length)
        ];
        title = `🧱 ${groupName} 🧱`;
        body = `${brickMsg} - ${fromUserName}: ${message}`;
        icon = '🧱';
        break;

      case 'important':
        // Serious notification
        title = `⚠️ ${groupName}`;
        body = `${fromUserName}: ${message}`;
        icon = '⚠️';
        break;

      default:
        title = groupName;
        body = `${fromUserName}: ${message}`;
        icon = '💬';
    }

    return {
      title,
      body,
      icon
    };
  }

  /**
   * Store notification in database
   */
  async _storeNotification({ groupId, userId, fromUser, message, type, metadata }) {
    try {
      await this.db.query(`
        INSERT INTO notifications (
          group_id,
          user_id,
          from_user_id,
          message,
          type,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        groupId,
        userId,
        fromUser.userId || fromUser.user_id,
        message,
        type,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      console.warn('[SmartNotificationSystem] Failed to store notification:', error.message);
    }
  }

  /**
   * Brick loop (spam notifications)
   */
  async _brickLoop(groupId, session) {
    // Check if session still active
    if (!session.active || Date.now() > session.endsAt) {
      this.stopBrickMode(groupId);
      return;
    }

    // Check max limit
    if (session.count >= this.config.maxBrickPerHour) {
      console.log(`[SmartNotificationSystem] Brick mode hit max limit for ${groupId}`);
      this.stopBrickMode(groupId);
      return;
    }

    // Send brick notification to all target users
    for (const userId of session.targetUsers) {
      await this.sendNotification({
        groupId,
        userId,
        fromUser: { userId: session.initiatedBy, username: 'Brick Master' },
        message: this.config.brickMessages[
          Math.floor(Math.random() * this.config.brickMessages.length)
        ],
        type: 'brick'
      });
    }

    session.count++;

    // Schedule next brick
    setTimeout(() => {
      this._brickLoop(groupId, session);
    }, this.config.brickCooldown);
  }

  /**
   * Get notification stats for group
   */
  async getStats(groupId, days = 7) {
    try {
      const result = await this.db.query(`
        SELECT
          type,
          COUNT(*) as count
        FROM notifications
        WHERE group_id = $1
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY type
        ORDER BY count DESC
      `, [groupId]);

      const stats = {
        total: 0,
        byType: {}
      };

      for (const row of result.rows) {
        stats.byType[row.type] = parseInt(row.count);
        stats.total += parseInt(row.count);
      }

      return {
        success: true,
        stats
      };

    } catch (error) {
      console.error('[SmartNotificationSystem] Error getting stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SmartNotificationSystem;
