/**
 * Microsoft Graph API Adapter
 *
 * Fetches emails from Outlook/Microsoft 365 using Microsoft Graph API
 * Handles OAuth tokens and message parsing
 */

const axios = require('axios');

class MicrosoftAdapter {
  constructor(options = {}) {
    this.name = 'microsoft';
    this.maxResults = options.maxResults || 50;
    this.graphApiUrl = 'https://graph.microsoft.com/v1.0';
  }

  /**
   * Fetch messages from Microsoft Graph
   *
   * @param {object} account - Email account with OAuth tokens
   * @param {object} options - Fetch options
   * @returns {array} - Array of normalized messages
   */
  async fetchMessages(account, options = {}) {
    try {
      const headers = {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      };

      // Build query parameters
      const params = this._buildQueryParams(options);
      const maxResults = options.maxResults || this.maxResults;

      // List messages
      const response = await axios.get(
        `${this.graphApiUrl}/me/messages`,
        {
          headers,
          params: {
            ...params,
            $top: maxResults,
            $select: 'id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,isRead,flag,hasAttachments,receivedDateTime,internetMessageId,replyTo',
            $orderby: 'receivedDateTime DESC'
          }
        }
      );

      const messages = response.data.value || [];

      if (messages.length === 0) {
        return [];
      }

      console.log(`[Microsoft] Fetching ${messages.length} message(s)...`);

      // Normalize messages
      const normalized = messages.map(msg => this._normalizeMessage(msg));

      return normalized;

    } catch (error) {
      console.error('[Microsoft] Error fetching messages:', error.message);

      // Handle token refresh if needed
      if (error.response?.status === 401) {
        throw new Error('Microsoft access token expired - refresh needed');
      }

      throw new Error(`Microsoft Graph fetch failed: ${error.message}`);
    }
  }

  /**
   * Send email via Microsoft Graph
   */
  async sendMessage(account, message) {
    try {
      const headers = {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      };

      // Create message object
      const messageObject = {
        subject: message.subject,
        body: {
          contentType: message.bodyType || 'Text',
          content: message.body
        },
        toRecipients: message.to.map(email => ({
          emailAddress: { address: email }
        }))
      };

      if (message.cc && message.cc.length > 0) {
        messageObject.ccRecipients = message.cc.map(email => ({
          emailAddress: { address: email }
        }));
      }

      // Send
      const response = await axios.post(
        `${this.graphApiUrl}/me/sendMail`,
        { message: messageObject },
        { headers }
      );

      return {
        id: response.data?.id || 'sent',
        success: true
      };

    } catch (error) {
      console.error('[Microsoft] Error sending message:', error.message);
      throw new Error(`Microsoft send failed: ${error.message}`);
    }
  }

  /**
   * Mark message as read/unread
   */
  async markAsRead(account, messageId, read = true) {
    try {
      const headers = {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      };

      await axios.patch(
        `${this.graphApiUrl}/me/messages/${messageId}`,
        { isRead: read },
        { headers }
      );

      return true;

    } catch (error) {
      console.error('[Microsoft] Error marking as read:', error.message);
      return false;
    }
  }

  /**
   * Star/flag message
   */
  async setStarred(account, messageId, starred = true) {
    try {
      const headers = {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      };

      await axios.patch(
        `${this.graphApiUrl}/me/messages/${messageId}`,
        {
          flag: {
            flagStatus: starred ? 'flagged' : 'notFlagged'
          }
        },
        { headers }
      );

      return true;

    } catch (error) {
      console.error('[Microsoft] Error setting starred:', error.message);
      return false;
    }
  }

  /**
   * Get message attachments
   */
  async getAttachments(account, messageId) {
    try {
      const headers = {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.get(
        `${this.graphApiUrl}/me/messages/${messageId}/attachments`,
        { headers }
      );

      const attachments = response.data.value || [];

      return attachments.map(att => ({
        id: att.id,
        filename: att.name,
        contentType: att.contentType,
        size: att.size,
        isInline: att.isInline || false,
        contentId: att.contentId || null,
        contentBytes: att.contentBytes // Base64 encoded
      }));

    } catch (error) {
      console.error('[Microsoft] Error fetching attachments:', error.message);
      return [];
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Build query parameters for Microsoft Graph
   */
  _buildQueryParams(options) {
    const params = {};

    // Date filter
    if (options.since) {
      const sinceDate = new Date(options.since).toISOString();
      params.$filter = `receivedDateTime ge ${sinceDate}`;
    }

    // Unread only
    if (options.unreadOnly) {
      const unreadFilter = 'isRead eq false';
      params.$filter = params.$filter
        ? `${params.$filter} and ${unreadFilter}`
        : unreadFilter;
    }

    // From specific sender
    if (options.from) {
      const fromFilter = `from/emailAddress/address eq '${options.from}'`;
      params.$filter = params.$filter
        ? `${params.$filter} and ${fromFilter}`
        : fromFilter;
    }

    // Subject contains
    if (options.subject) {
      const subjectFilter = `contains(subject, '${options.subject}')`;
      params.$filter = params.$filter
        ? `${params.$filter} and ${subjectFilter}`
        : subjectFilter;
    }

    return params;
  }

  /**
   * Normalize Microsoft Graph message to standard format
   */
  _normalizeMessage(graphMessage) {
    // Parse from address
    const from = graphMessage.from?.emailAddress
      ? {
          name: graphMessage.from.emailAddress.name || null,
          address: graphMessage.from.emailAddress.address
        }
      : null;

    // Parse to addresses
    const to = (graphMessage.toRecipients || []).map(r => r.emailAddress?.address || '');

    // Parse cc addresses
    const cc = (graphMessage.ccRecipients || []).map(r => r.emailAddress?.address || '');

    // Parse reply-to
    const replyTo = graphMessage.replyTo?.[0]?.emailAddress?.address || null;

    // Extract body
    const bodyPlain = graphMessage.body?.contentType === 'text'
      ? graphMessage.body.content
      : null;

    const bodyHtml = graphMessage.body?.contentType === 'html'
      ? graphMessage.body.content
      : null;

    // Parse flags
    const isStarred = graphMessage.flag?.flagStatus === 'flagged';
    const isImportant = graphMessage.importance === 'high';

    // Parse received date
    const receivedAt = new Date(graphMessage.receivedDateTime);

    return {
      id: graphMessage.id,
      threadId: graphMessage.conversationId,
      from,
      to,
      cc,
      subject: graphMessage.subject || '(no subject)',
      bodyPlain,
      bodyHtml,
      bodyPreview: graphMessage.bodyPreview || '',
      labels: [], // Microsoft doesn't use labels like Gmail
      isRead: graphMessage.isRead || false,
      isStarred,
      isImportant,
      hasAttachments: graphMessage.hasAttachments || false,
      attachmentCount: graphMessage.hasAttachments ? 1 : 0, // Exact count requires separate API call
      attachments: [], // Would need separate call to /attachments endpoint
      receivedAt,
      inReplyTo: graphMessage.internetMessageId,
      replyTo
    };
  }
}

module.exports = MicrosoftAdapter;
