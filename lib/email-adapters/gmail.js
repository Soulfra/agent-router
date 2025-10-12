/**
 * Gmail API Adapter
 *
 * Fetches emails from Gmail using Google APIs
 * Handles OAuth tokens and message parsing
 */

const { google } = require('googleapis');

class GmailAdapter {
  constructor(options = {}) {
    this.name = 'gmail';
    this.maxResults = options.maxResults || 50;
  }

  /**
   * Fetch messages from Gmail
   *
   * @param {object} account - Email account with OAuth tokens
   * @param {object} options - Fetch options
   * @returns {array} - Array of normalized messages
   */
  async fetchMessages(account, options = {}) {
    try {
      // Create OAuth2 client
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token
      });

      const gmail = google.gmail({ version: 'v1', auth });

      // Build query
      const query = this._buildQuery(options);
      const maxResults = options.maxResults || this.maxResults;

      // List messages
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: maxResults
      });

      const messageList = listResponse.data.messages || [];

      if (messageList.length === 0) {
        return [];
      }

      console.log(`[Gmail] Fetching ${messageList.length} message(s)...`);

      // Fetch full message details
      const messages = [];

      for (const msg of messageList) {
        try {
          const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full'
          });

          const normalized = this._normalizeMessage(messageData.data);
          messages.push(normalized);

        } catch (error) {
          console.error(`[Gmail] Error fetching message ${msg.id}:`, error.message);
        }
      }

      return messages;

    } catch (error) {
      console.error('[Gmail] Error fetching messages:', error.message);
      throw new Error(`Gmail fetch failed: ${error.message}`);
    }
  }

  /**
   * Send email via Gmail
   */
  async sendMessage(account, message) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token
      });

      const gmail = google.gmail({ version: 'v1', auth });

      // Create RFC 2822 formatted email
      const email = this._createRFC2822Email(message);

      // Encode to base64url
      const encodedMessage = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId
      };

    } catch (error) {
      console.error('[Gmail] Error sending message:', error.message);
      throw new Error(`Gmail send failed: ${error.message}`);
    }
  }

  /**
   * Mark message as read/unread
   */
  async markAsRead(account, messageId, read = true) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token
      });

      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: read ? ['UNREAD'] : [],
          addLabelIds: read ? [] : ['UNREAD']
        }
      });

      return true;

    } catch (error) {
      console.error('[Gmail] Error marking as read:', error.message);
      return false;
    }
  }

  /**
   * Star/unstar message
   */
  async setStarred(account, messageId, starred = true) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token
      });

      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: starred ? ['STARRED'] : [],
          removeLabelIds: starred ? [] : ['STARRED']
        }
      });

      return true;

    } catch (error) {
      console.error('[Gmail] Error setting starred:', error.message);
      return false;
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Build Gmail query string
   */
  _buildQuery(options) {
    const parts = [];

    // Date filter
    if (options.since) {
      const sinceDate = new Date(options.since);
      const timestamp = Math.floor(sinceDate.getTime() / 1000);
      parts.push(`after:${timestamp}`);
    }

    // Unread only
    if (options.unreadOnly) {
      parts.push('is:unread');
    }

    // From specific sender
    if (options.from) {
      parts.push(`from:${options.from}`);
    }

    // Subject contains
    if (options.subject) {
      parts.push(`subject:"${options.subject}"`);
    }

    // Exclude spam and trash
    parts.push('-in:spam');
    parts.push('-in:trash');

    return parts.join(' ');
  }

  /**
   * Normalize Gmail message to standard format
   */
  _normalizeMessage(gmailMessage) {
    const headers = gmailMessage.payload.headers;
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : null;
    };

    // Extract body
    const { plain, html } = this._extractBody(gmailMessage.payload);

    // Parse labels
    const labels = gmailMessage.labelIds || [];
    const isRead = !labels.includes('UNREAD');
    const isStarred = labels.includes('STARRED');
    const isImportant = labels.includes('IMPORTANT');

    // Parse from address
    const fromHeader = getHeader('From');
    const from = this._parseEmailAddress(fromHeader);

    // Parse to addresses
    const toHeader = getHeader('To');
    const to = this._parseEmailAddresses(toHeader);

    // Parse CC addresses
    const ccHeader = getHeader('Cc');
    const cc = this._parseEmailAddresses(ccHeader);

    // Internal date
    const receivedAt = new Date(parseInt(gmailMessage.internalDate));

    return {
      id: gmailMessage.id,
      threadId: gmailMessage.threadId,
      from,
      to,
      cc,
      subject: getHeader('Subject') || '(no subject)',
      bodyPlain: plain,
      bodyHtml: html,
      bodyPreview: gmailMessage.snippet || plain?.substring(0, 200) || '',
      labels: labels.filter(l => !['UNREAD', 'STARRED', 'IMPORTANT', 'INBOX'].includes(l)),
      isRead,
      isStarred,
      isImportant,
      hasAttachments: this._hasAttachments(gmailMessage.payload),
      attachmentCount: this._countAttachments(gmailMessage.payload),
      attachments: this._extractAttachments(gmailMessage.payload),
      receivedAt,
      inReplyTo: getHeader('In-Reply-To'),
      replyTo: getHeader('Reply-To')
    };
  }

  /**
   * Extract plain and HTML body from Gmail payload
   */
  _extractBody(payload) {
    let plain = '';
    let html = '';

    const extractFromPart = (part) => {
      if (part.mimeType === 'text/plain' && part.body.data) {
        plain = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };

    if (payload.body && payload.body.data) {
      if (payload.mimeType === 'text/plain') {
        plain = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload.mimeType === 'text/html') {
        html = Buffer.from(payload.body.data, 'base64').toString('utf8');
      }
    } else if (payload.parts) {
      payload.parts.forEach(extractFromPart);
    }

    return { plain, html };
  }

  /**
   * Check if message has attachments
   */
  _hasAttachments(payload) {
    if (payload.parts) {
      return payload.parts.some(part =>
        part.filename && part.filename.length > 0 && part.body && part.body.attachmentId
      );
    }
    return false;
  }

  /**
   * Count attachments
   */
  _countAttachments(payload) {
    if (!payload.parts) return 0;

    return payload.parts.filter(part =>
      part.filename && part.filename.length > 0 && part.body && part.body.attachmentId
    ).length;
  }

  /**
   * Extract attachment metadata
   */
  _extractAttachments(payload) {
    const attachments = [];

    if (payload.parts) {
      payload.parts.forEach(part => {
        if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            contentType: part.mimeType,
            size: part.body.size || 0,
            attachmentId: part.body.attachmentId,
            isInline: part.headers?.some(h =>
              h.name.toLowerCase() === 'content-disposition' &&
              h.value.toLowerCase().startsWith('inline')
            )
          });
        }
      });
    }

    return attachments;
  }

  /**
   * Parse email address from header
   */
  _parseEmailAddress(header) {
    if (!header) return null;

    // Match: "Name <email@domain.com>" or just "email@domain.com"
    const match = header.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);

    if (match) {
      return {
        name: match[1]?.trim() || null,
        address: match[2]?.trim()
      };
    }

    return { name: null, address: header.trim() };
  }

  /**
   * Parse multiple email addresses
   */
  _parseEmailAddresses(header) {
    if (!header) return [];

    return header.split(',').map(addr => {
      const parsed = this._parseEmailAddress(addr.trim());
      return parsed?.address || addr.trim();
    });
  }

  /**
   * Create RFC 2822 email format
   */
  _createRFC2822Email(message) {
    const lines = [];

    lines.push(`From: ${message.from}`);
    lines.push(`To: ${message.to.join(', ')}`);

    if (message.cc && message.cc.length > 0) {
      lines.push(`Cc: ${message.cc.join(', ')}`);
    }

    lines.push(`Subject: ${message.subject}`);
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('');
    lines.push(message.body);

    return lines.join('\r\n');
  }
}

module.exports = GmailAdapter;
