/**
 * Email Poller
 *
 * Polls multiple email accounts and ingests messages for AI routing
 * Supports Gmail API, Microsoft Graph, and IMAP
 */

const EventEmitter = require('events');

class EmailPoller extends EventEmitter {
  constructor(db, options = {}) {
    super();
    this.db = db;
    this.adapters = {};
    this.pollingIntervals = new Map();
    this.isRunning = false;

    // Configuration
    this.defaultPollInterval = options.defaultPollInterval || 60000; // 1 minute
    this.maxMessagesPerPoll = options.maxMessagesPerPoll || 50;
    this.enableAutoClassification = options.enableAutoClassification !== false;
  }

  /**
   * Register an email adapter
   */
  registerAdapter(providerId, adapter) {
    this.adapters[providerId] = adapter;
    console.log(`[EmailPoller] Registered adapter: ${providerId}`);
  }

  /**
   * Start polling all enabled accounts
   */
  async start() {
    if (this.isRunning) {
      console.warn('[EmailPoller] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[EmailPoller] Starting email polling...');

    // Get all enabled accounts
    const accounts = await this.getEnabledAccounts();
    console.log(`[EmailPoller] Found ${accounts.length} enabled account(s)`);

    // Start polling each account
    for (const account of accounts) {
      await this.startPollingAccount(account);
    }

    // Emit started event
    this.emit('started', { accountCount: accounts.length });
  }

  /**
   * Stop polling all accounts
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    console.log('[EmailPoller] Stopping email polling...');

    // Clear all intervals
    for (const [accountId, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
      console.log(`[EmailPoller] Stopped polling account ${accountId}`);
    }

    this.pollingIntervals.clear();
    this.emit('stopped');
  }

  /**
   * Start polling a specific account
   */
  async startPollingAccount(account) {
    const adapter = this.adapters[account.provider_id];

    if (!adapter) {
      console.error(`[EmailPoller] No adapter for provider: ${account.provider_id}`);
      return;
    }

    console.log(`[EmailPoller] Starting poll for ${account.email_address} (${account.provider_id})`);

    // Initial poll
    await this.pollAccount(account, adapter);

    // Schedule periodic polling
    const interval = setInterval(async () => {
      if (this.isRunning) {
        await this.pollAccount(account, adapter);
      }
    }, account.poll_interval || this.defaultPollInterval);

    this.pollingIntervals.set(account.id, interval);
  }

  /**
   * Poll a single account for new messages
   */
  async pollAccount(account, adapter) {
    try {
      console.log(`\n[EmailPoller] Polling ${account.email_address}...`);

      // Get last sync time
      const lastSync = account.last_sync_at;

      // Fetch new messages via adapter
      const messages = await adapter.fetchMessages(account, {
        since: lastSync,
        maxResults: this.maxMessagesPerPoll,
        includeBody: true
      });

      if (messages.length === 0) {
        console.log(`[EmailPoller] No new messages for ${account.email_address}`);
        await this.updateLastSync(account.id, null);
        return;
      }

      console.log(`[EmailPoller] Found ${messages.length} new message(s)`);

      // Store messages in database
      let stored = 0;
      let errors = 0;

      for (const message of messages) {
        try {
          await this.storeMessage(account.id, message);
          stored++;

          // Emit event for real-time processing
          this.emit('message', {
            accountId: account.id,
            messageId: message.id,
            from: message.from,
            subject: message.subject
          });

        } catch (error) {
          console.error(`[EmailPoller] Failed to store message:`, error.message);
          errors++;
        }
      }

      console.log(`[EmailPoller] Stored ${stored} message(s), ${errors} error(s)`);

      // Update last sync time
      await this.updateLastSync(account.id, null);

      // Emit batch complete event
      this.emit('batch-complete', {
        accountId: account.id,
        messageCount: stored,
        errorCount: errors
      });

    } catch (error) {
      console.error(`[EmailPoller] Error polling ${account.email_address}:`, error.message);

      // Update account with error
      await this.updateLastSync(account.id, error.message);

      this.emit('error', {
        accountId: account.id,
        error: error.message
      });
    }
  }

  /**
   * Store message in database
   */
  async storeMessage(accountId, message) {
    // Check if message already exists
    const existing = await this.db.query(
      'SELECT id FROM email_messages WHERE account_id = $1 AND message_id = $2',
      [accountId, message.id]
    );

    if (existing.rows.length > 0) {
      console.log(`[EmailPoller] Message already exists: ${message.id}`);
      return existing.rows[0].id;
    }

    // Insert message
    const result = await this.db.query(`
      INSERT INTO email_messages (
        account_id,
        message_id,
        thread_id,
        in_reply_to,
        from_address,
        from_name,
        to_address,
        cc_address,
        bcc_address,
        reply_to,
        subject,
        body_preview,
        body_plain,
        body_html,
        labels,
        is_read,
        is_starred,
        is_important,
        has_attachments,
        attachment_count,
        received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING id
    `, [
      accountId,
      message.id,
      message.threadId || null,
      message.inReplyTo || null,
      message.from?.address || message.from,
      message.from?.name || null,
      message.to || [],
      message.cc || [],
      message.bcc || [],
      message.replyTo || null,
      message.subject || '(no subject)',
      message.bodyPreview || (message.bodyPlain || message.bodyHtml || '').substring(0, 200),
      message.bodyPlain || null,
      message.bodyHtml || null,
      message.labels || [],
      message.isRead || false,
      message.isStarred || false,
      message.isImportant || false,
      message.hasAttachments || false,
      message.attachmentCount || 0,
      message.receivedAt || new Date()
    ]);

    const messageDbId = result.rows[0].id;

    // Store attachments if any
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        await this.db.query(`
          INSERT INTO email_attachments (
            message_id,
            filename,
            content_type,
            size_bytes,
            is_inline,
            content_id
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          messageDbId,
          attachment.filename,
          attachment.contentType,
          attachment.size,
          attachment.isInline || false,
          attachment.contentId || null
        ]);
      }
    }

    // Trigger auto-classification if enabled
    if (this.enableAutoClassification) {
      this.emit('classify', {
        messageId: messageDbId,
        accountId: accountId
      });
    }

    return messageDbId;
  }

  /**
   * Update account last sync time
   */
  async updateLastSync(accountId, error = null) {
    await this.db.query(`
      UPDATE email_accounts
      SET
        last_sync_at = NOW(),
        last_error = $2
      WHERE id = $1
    `, [accountId, error]);
  }

  /**
   * Get all enabled email accounts
   */
  async getEnabledAccounts() {
    const result = await this.db.query(`
      SELECT
        a.*,
        c.access_token,
        c.refresh_token
      FROM email_accounts a
      LEFT JOIN user_oauth_connections c ON c.id = a.oauth_connection_id
      WHERE a.sync_enabled = true
      ORDER BY a.last_sync_at ASC NULLS FIRST
    `);

    return result.rows;
  }

  /**
   * Get account by ID
   */
  async getAccount(accountId) {
    const result = await this.db.query(`
      SELECT
        a.*,
        c.access_token,
        c.refresh_token
      FROM email_accounts a
      LEFT JOIN user_oauth_connections c ON c.id = a.oauth_connection_id
      WHERE a.id = $1
    `, [accountId]);

    return result.rows[0];
  }

  /**
   * Manually trigger poll for specific account
   */
  async pollAccountById(accountId) {
    const account = await this.getAccount(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    if (!account.sync_enabled) {
      throw new Error(`Account sync is disabled: ${accountId}`);
    }

    const adapter = this.adapters[account.provider_id];

    if (!adapter) {
      throw new Error(`No adapter for provider: ${account.provider_id}`);
    }

    await this.pollAccount(account, adapter);
  }

  /**
   * Get polling status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activePolls: this.pollingIntervals.size,
      adapters: Object.keys(this.adapters)
    };
  }
}

module.exports = EmailPoller;
