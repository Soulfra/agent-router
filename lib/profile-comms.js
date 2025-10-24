/**
 * Profile Communication Layer
 *
 * GitHub profile as communication hub, connected to Slack bots and agent swarm.
 * Solves: "people can communicate through that to us but its really our slack bots
 *          and whatever else we got going on and the agent swarm"
 *
 * Features:
 * - GitHub profile as unified inbox
 * - Route messages to Slack channels
 * - Connect to agent swarm for automated responses
 * - Communication history tracking
 * - Multi-channel message threading
 * - Auto-routing based on message type
 * - Response templates
 *
 * Use Cases:
 * - User messages via GitHub profile
 * - Message routed to appropriate Slack channel
 * - Agent swarm picks up and responds
 * - Response sent back through GitHub
 * - Full thread history maintained
 */

const { Pool } = require('pg');

class ProfileComms {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Routing rules
    this.routingRules = {
      // Technical questions → engineering channel
      technical: {
        keywords: ['code', 'bug', 'error', 'api', 'deploy', 'build', 'test'],
        slackChannel: '#engineering',
        agentType: 'technical-support'
      },

      // Product questions → product channel
      product: {
        keywords: ['feature', 'roadmap', 'pricing', 'plan', 'upgrade', 'product'],
        slackChannel: '#product',
        agentType: 'product-support'
      },

      // Collaboration → partnerships channel
      collaboration: {
        keywords: ['partner', 'collaborate', 'work together', 'team up', 'project'],
        slackChannel: '#partnerships',
        agentType: 'partnership-agent'
      },

      // Hiring → recruiting channel
      hiring: {
        keywords: ['hire', 'job', 'position', 'opportunity', 'career', 'recruiting'],
        slackChannel: '#recruiting',
        agentType: 'recruiting-agent'
      },

      // General → general channel
      general: {
        keywords: [],
        slackChannel: '#general',
        agentType: 'general-support'
      }
    };

    console.log('[ProfileComms] Initialized');
  }

  /**
   * Send message to user (via GitHub profile)
   *
   * @param {Object} data
   * @param {string} data.fromUserId - Sender (can be agent swarm)
   * @param {string} data.toUserId - Recipient
   * @param {string} data.subject - Message subject
   * @param {string} data.content - Message content
   * @param {string} data.threadId - Thread ID (for replies)
   * @param {Object} data.metadata - Additional metadata
   * @returns {Object} Sent message
   */
  async sendMessage(data) {
    try {
      const {
        fromUserId,
        toUserId,
        subject = '',
        content,
        threadId = null,
        metadata = {}
      } = data;

      if (!fromUserId || !toUserId || !content) {
        throw new Error('fromUserId, toUserId, and content are required');
      }

      // Determine routing
      const routing = this._determineRouting(content);

      // Create message
      const result = await this.pool.query(`
        INSERT INTO profile_messages (
          from_user_id,
          to_user_id,
          subject,
          content,
          thread_id,
          routing_category,
          routing_slack_channel,
          routing_agent_type,
          metadata,
          status,
          sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *
      `, [
        fromUserId,
        toUserId,
        subject,
        content,
        threadId,
        routing.category,
        routing.slackChannel,
        routing.agentType,
        JSON.stringify(metadata),
        'sent'
      ]);

      const message = result.rows[0];

      // If no thread, create one
      if (!threadId) {
        await this.pool.query(`
          UPDATE profile_messages
          SET thread_id = $1
          WHERE id = $1
        `, [message.id]);

        message.thread_id = message.id;
      }

      console.log(`[ProfileComms] Message sent from ${fromUserId} to ${toUserId}`);

      return this._formatMessage(message);

    } catch (error) {
      console.error('[ProfileComms] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Route message to Slack
   *
   * @param {number} messageId
   * @param {Object} slackData
   * @param {string} slackData.slackMessageTs - Slack message timestamp (ID)
   * @param {string} slackData.slackChannelId - Slack channel ID
   * @returns {Object} Routing info
   */
  async routeToSlack(messageId, slackData) {
    try {
      const { slackMessageTs, slackChannelId } = slackData;

      // Record Slack routing
      await this.pool.query(`
        INSERT INTO message_slack_routing (
          message_id,
          slack_message_ts,
          slack_channel_id,
          routed_at
        ) VALUES ($1, $2, $3, NOW())
      `, [messageId, slackMessageTs, slackChannelId]);

      // Update message status
      await this.pool.query(`
        UPDATE profile_messages
        SET status = 'routed_to_slack'
        WHERE id = $1
      `, [messageId]);

      console.log(`[ProfileComms] Message ${messageId} routed to Slack`);

      return {
        messageId,
        slackMessageTs,
        slackChannelId
      };

    } catch (error) {
      console.error('[ProfileComms] Error routing to Slack:', error);
      throw error;
    }
  }

  /**
   * Route message to agent swarm
   *
   * @param {number} messageId
   * @param {Object} agentData
   * @param {string} agentData.agentId - Agent that picked up message
   * @param {string} agentData.agentType - Type of agent
   * @returns {Object} Agent routing info
   */
  async routeToAgent(messageId, agentData) {
    try {
      const { agentId, agentType } = agentData;

      // Record agent routing
      await this.pool.query(`
        INSERT INTO message_agent_routing (
          message_id,
          agent_id,
          agent_type,
          routed_at
        ) VALUES ($1, $2, $3, NOW())
      `, [messageId, agentId, agentType]);

      // Update message status
      await this.pool.query(`
        UPDATE profile_messages
        SET status = 'handled_by_agent'
        WHERE id = $1
      `, [messageId]);

      console.log(`[ProfileComms] Message ${messageId} routed to agent ${agentId}`);

      return {
        messageId,
        agentId,
        agentType
      };

    } catch (error) {
      console.error('[ProfileComms] Error routing to agent:', error);
      throw error;
    }
  }

  /**
   * Get user's inbox
   *
   * @param {string} userId
   * @param {Object} options
   * @param {string} options.status - Filter by status
   * @param {number} options.limit
   * @param {number} options.offset
   * @returns {Array} Messages
   */
  async getInbox(userId, options = {}) {
    try {
      const { status = null, limit = 50, offset = 0 } = options;

      const conditions = ['to_user_id = $1'];
      const values = [userId];
      let paramIndex = 2;

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      values.push(limit, offset);

      const result = await this.pool.query(`
        SELECT * FROM profile_messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY sent_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, values);

      return result.rows.map(row => this._formatMessage(row));

    } catch (error) {
      console.error('[ProfileComms] Error getting inbox:', error);
      return [];
    }
  }

  /**
   * Get message thread
   *
   * @param {number} threadId
   * @returns {Array} Thread messages
   */
  async getThread(threadId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM profile_messages
        WHERE thread_id = $1
        ORDER BY sent_at ASC
      `, [threadId]);

      return result.rows.map(row => this._formatMessage(row));

    } catch (error) {
      console.error('[ProfileComms] Error getting thread:', error);
      return [];
    }
  }

  /**
   * Reply to message
   *
   * @param {number} originalMessageId
   * @param {Object} replyData
   * @param {string} replyData.fromUserId
   * @param {string} replyData.content
   * @param {Object} replyData.metadata
   * @returns {Object} Reply message
   */
  async replyToMessage(originalMessageId, replyData) {
    try {
      const { fromUserId, content, metadata = {} } = replyData;

      // Get original message
      const originalResult = await this.pool.query(`
        SELECT * FROM profile_messages WHERE id = $1
      `, [originalMessageId]);

      if (originalResult.rows.length === 0) {
        throw new Error(`Message ${originalMessageId} not found`);
      }

      const original = originalResult.rows[0];

      // Send reply in same thread
      const reply = await this.sendMessage({
        fromUserId,
        toUserId: original.from_user_id, // Reply to original sender
        subject: `Re: ${original.subject || ''}`,
        content,
        threadId: original.thread_id || originalMessageId,
        metadata: {
          ...metadata,
          inReplyTo: originalMessageId
        }
      });

      console.log(`[ProfileComms] Reply sent to message ${originalMessageId}`);

      return reply;

    } catch (error) {
      console.error('[ProfileComms] Error replying:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   *
   * @param {number} messageId
   * @param {string} userId
   * @returns {boolean} Success
   */
  async markAsRead(messageId, userId) {
    try {
      const result = await this.pool.query(`
        UPDATE profile_messages
        SET status = 'read',
            read_at = NOW()
        WHERE id = $1 AND to_user_id = $2
      `, [messageId, userId]);

      return result.rowCount > 0;

    } catch (error) {
      console.error('[ProfileComms] Error marking as read:', error);
      return false;
    }
  }

  /**
   * Get unread count
   *
   * @param {string} userId
   * @returns {number} Unread count
   */
  async getUnreadCount(userId) {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM profile_messages
        WHERE to_user_id = $1
          AND status = 'sent'
          AND read_at IS NULL
      `, [userId]);

      return parseInt(result.rows[0].count);

    } catch (error) {
      console.error('[ProfileComms] Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Get communication stats
   *
   * @param {string} userId
   * @returns {Object} Stats
   */
  async getCommunicationStats(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE to_user_id = $1) as received_count,
          COUNT(*) FILTER (WHERE from_user_id = $1) as sent_count,
          COUNT(*) FILTER (WHERE to_user_id = $1 AND status = 'sent') as unread_count,
          COUNT(DISTINCT thread_id) FILTER (WHERE to_user_id = $1 OR from_user_id = $1) as thread_count
        FROM profile_messages
        WHERE to_user_id = $1 OR from_user_id = $1
      `, [userId]);

      const stats = result.rows[0];

      return {
        receivedCount: parseInt(stats.received_count),
        sentCount: parseInt(stats.sent_count),
        unreadCount: parseInt(stats.unread_count),
        threadCount: parseInt(stats.thread_count)
      };

    } catch (error) {
      console.error('[ProfileComms] Error getting stats:', error);
      return { receivedCount: 0, sentCount: 0, unreadCount: 0, threadCount: 0 };
    }
  }

  /**
   * Search messages
   *
   * @param {string} userId
   * @param {string} query
   * @param {Object} options
   * @param {number} options.limit
   * @returns {Array} Matching messages
   */
  async searchMessages(userId, query, options = {}) {
    try {
      const { limit = 50 } = options;

      const result = await this.pool.query(`
        SELECT * FROM profile_messages
        WHERE (to_user_id = $1 OR from_user_id = $1)
          AND (
            subject ILIKE $2
            OR content ILIKE $2
          )
        ORDER BY sent_at DESC
        LIMIT $3
      `, [userId, `%${query}%`, limit]);

      return result.rows.map(row => this._formatMessage(row));

    } catch (error) {
      console.error('[ProfileComms] Error searching messages:', error);
      return [];
    }
  }

  /**
   * Get Slack routing for message
   *
   * @param {number} messageId
   * @returns {Object} Slack routing info
   */
  async getSlackRouting(messageId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM message_slack_routing
        WHERE message_id = $1
        ORDER BY routed_at DESC
        LIMIT 1
      `, [messageId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        slackMessageTs: row.slack_message_ts,
        slackChannelId: row.slack_channel_id,
        routedAt: row.routed_at
      };

    } catch (error) {
      console.error('[ProfileComms] Error getting Slack routing:', error);
      return null;
    }
  }

  /**
   * Get agent routing for message
   *
   * @param {number} messageId
   * @returns {Object} Agent routing info
   */
  async getAgentRouting(messageId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM message_agent_routing
        WHERE message_id = $1
        ORDER BY routed_at DESC
        LIMIT 1
      `, [messageId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        agentId: row.agent_id,
        agentType: row.agent_type,
        routedAt: row.routed_at,
        responseAt: row.response_at
      };

    } catch (error) {
      console.error('[ProfileComms] Error getting agent routing:', error);
      return null;
    }
  }

  /**
   * Determine routing based on message content
   * @private
   */
  _determineRouting(content) {
    const lowerContent = content.toLowerCase();

    // Check each category
    for (const [category, rule] of Object.entries(this.routingRules)) {
      if (category === 'general') continue; // Check general last

      for (const keyword of rule.keywords) {
        if (lowerContent.includes(keyword)) {
          return {
            category,
            slackChannel: rule.slackChannel,
            agentType: rule.agentType
          };
        }
      }
    }

    // Default to general
    return {
      category: 'general',
      slackChannel: this.routingRules.general.slackChannel,
      agentType: this.routingRules.general.agentType
    };
  }

  /**
   * Format message for output
   * @private
   */
  _formatMessage(row) {
    return {
      id: row.id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      subject: row.subject,
      content: row.content,
      threadId: row.thread_id,
      routing: {
        category: row.routing_category,
        slackChannel: row.routing_slack_channel,
        agentType: row.routing_agent_type
      },
      metadata: row.metadata,
      status: row.status,
      sentAt: row.sent_at,
      readAt: row.read_at
    };
  }
}

module.exports = ProfileComms;
