/**
 * Telegram Bot Integration
 *
 * Connects CALOS platform to Telegram for:
 * - User authentication via Telegram
 * - Phone verification (integrated with Twilio)
 * - Messaging and notifications
 * - Bot commands for account management
 *
 * Features:
 * - /start - Welcome message and account linking
 * - /verify - Phone verification via SMS
 * - /balance - Check credit balance
 * - /handle - Set/view @username handle
 * - /encrypt - Start encrypted messaging session
 * - /help - Command list
 *
 * Integration:
 * - Auth system: Links Telegram accounts to CALOS users
 * - Twilio: Phone verification via SMS
 * - Credits: Check balance, purchase
 * - Handles: Set/view @username handles
 * - Secure messaging: Path-based encryption
 *
 * Usage:
 * const bot = new TelegramBot({
 *   token: process.env.TELEGRAM_BOT_TOKEN,
 *   db,
 *   twilioClient,
 *   handleRegistry,
 *   challengeChain
 * });
 * await bot.start();
 */

const { EventEmitter } = require('events');
const https = require('https');

class TelegramBot extends EventEmitter {
  constructor(options = {}) {
    super();

    this.token = options.token;
    this.db = options.db;
    this.twilioClient = options.twilioClient;
    this.handleRegistry = options.handleRegistry;
    this.challengeChain = options.challengeChain;

    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN required');
    }

    if (!this.db) {
      throw new Error('Database connection required');
    }

    // Configuration
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
    this.updateOffset = 0;
    this.pollingInterval = options.pollingInterval || 3000; // 3 seconds
    this.isPolling = false;

    // Command handlers
    this.commands = new Map();
    this._registerCommands();

    console.log('[TelegramBot] Initialized');
  }

  /**
   * Start bot (long polling)
   */
  async start() {
    try {
      // Set bot commands
      await this._setBotCommands();

      // Start polling
      this.isPolling = true;
      console.log('[TelegramBot] Starting polling...');
      this._poll();

      this.emit('started');

    } catch (error) {
      console.error('[TelegramBot] Start error:', error);
      throw error;
    }
  }

  /**
   * Stop bot
   */
  stop() {
    this.isPolling = false;
    console.log('[TelegramBot] Stopped');
    this.emit('stopped');
  }

  /**
   * Send message to user
   *
   * @param {number} chatId - Telegram chat ID
   * @param {string} text - Message text (supports Markdown)
   * @param {object} options - Additional options
   * @returns {Promise<object>} Sent message
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      const response = await this._apiRequest('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'Markdown',
        reply_markup: options.replyMarkup || null,
        disable_web_page_preview: options.disableWebPagePreview || false
      });

      return response.result;

    } catch (error) {
      console.error('[TelegramBot] Send message error:', error);
      throw error;
    }
  }

  /**
   * Send typing action
   *
   * @param {number} chatId - Telegram chat ID
   */
  async sendTyping(chatId) {
    await this._apiRequest('sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    });
  }

  // ============================================================================
  // COMMAND HANDLERS
  // ============================================================================

  /**
   * Register command handlers
   */
  _registerCommands() {
    this.commands.set('/start', this._handleStart.bind(this));
    this.commands.set('/verify', this._handleVerify.bind(this));
    this.commands.set('/balance', this._handleBalance.bind(this));
    this.commands.set('/handle', this._handleHandle.bind(this));
    this.commands.set('/encrypt', this._handleEncrypt.bind(this));
    this.commands.set('/help', this._handleHelp.bind(this));
    this.commands.set('/link', this._handleLink.bind(this));
    this.commands.set('/status', this._handleStatus.bind(this));
  }

  /**
   * /start - Welcome message
   */
  async _handleStart(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const username = message.from.username || 'User';

    await this.sendTyping(chatId);

    // Check if Telegram account is linked to CALOS user
    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (linkedUser) {
      await this.sendMessage(chatId,
        `👋 Welcome back, @${username}!\n\n` +
        `Your Telegram is linked to CALOS account: *${linkedUser.email}*\n\n` +
        `Use /help to see available commands.`
      );
    } else {
      await this.sendMessage(chatId,
        `👋 Welcome to CALOS, @${username}!\n\n` +
        `🔗 Your Telegram account is not yet linked.\n\n` +
        `To get started:\n` +
        `1. Create account at https://calos.app/register\n` +
        `2. Use */link <code>* to connect your account\n\n` +
        `Or use /help for more info.`
      );
    }
  }

  /**
   * /link - Link Telegram to CALOS account
   */
  async _handleLink(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const args = message.text.split(' ').slice(1);

    await this.sendTyping(chatId);

    if (args.length === 0) {
      // Generate linking code
      const linkingCode = await this._generateLinkingCode(telegramUserId);

      await this.sendMessage(chatId,
        `🔗 *Link Your Account*\n\n` +
        `Your linking code: *${linkingCode}*\n\n` +
        `Go to https://calos.app/settings/telegram and enter this code.\n\n` +
        `Code expires in 10 minutes.`
      );
    } else {
      // User provided linking code
      const linkingCode = args[0];
      const result = await this._linkAccountWithCode(telegramUserId, linkingCode, message.from);

      if (result.success) {
        await this.sendMessage(chatId,
          `✅ *Account Linked!*\n\n` +
          `Your Telegram is now linked to: *${result.email}*\n\n` +
          `Use /help to see what you can do.`
        );
      } else {
        await this.sendMessage(chatId,
          `❌ *Linking Failed*\n\n` +
          `${result.error}\n\n` +
          `Use */link* (without code) to generate a new code.`
        );
      }
    }
  }

  /**
   * /verify - Phone verification
   */
  async _handleVerify(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const args = message.text.split(' ').slice(1);

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ Please link your account first using */link*`
      );
      return;
    }

    if (!this.twilioClient) {
      await this.sendMessage(chatId,
        `❌ Phone verification not configured.`
      );
      return;
    }

    if (args.length === 0) {
      await this.sendMessage(chatId,
        `📱 *Phone Verification*\n\n` +
        `Usage: */verify +1234567890*\n\n` +
        `We'll send you a 6-digit code via SMS.`
      );
      return;
    }

    const phoneNumber = args[0];

    try {
      // Send verification code via Twilio
      const verification = await this.twilioClient.verify
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications
        .create({ to: phoneNumber, channel: 'sms' });

      if (verification.status === 'pending') {
        await this.sendMessage(chatId,
          `📨 *Verification Code Sent!*\n\n` +
          `A 6-digit code was sent to *${phoneNumber}*.\n\n` +
          `Reply with the code to verify.`
        );

        // Store verification session
        await this.db.query(
          `INSERT INTO telegram_verification_sessions (
            telegram_user_id,
            user_id,
            phone_number,
            expires_at
          ) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
          [telegramUserId, linkedUser.user_id, phoneNumber]
        );
      }

    } catch (error) {
      console.error('[TelegramBot] Verification error:', error);
      await this.sendMessage(chatId,
        `❌ Failed to send verification code. Please check the phone number.`
      );
    }
  }

  /**
   * /balance - Check credit balance
   */
  async _handleBalance(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ Please link your account first using */link*`
      );
      return;
    }

    const result = await this.db.query(
      `SELECT credits_remaining, credits_purchased
       FROM user_credits
       WHERE user_id = $1`,
      [linkedUser.user_id]
    );

    if (result.rows.length === 0) {
      await this.sendMessage(chatId,
        `💳 *Your Balance*\n\n` +
        `Credits: *$0.00*\n\n` +
        `Purchase credits at https://calos.app/credits`
      );
    } else {
      const credits = result.rows[0];
      const remaining = (credits.credits_remaining / 100).toFixed(2);
      const total = (credits.credits_purchased / 100).toFixed(2);

      await this.sendMessage(chatId,
        `💳 *Your Balance*\n\n` +
        `Available: *$${remaining}*\n` +
        `Total purchased: *$${total}*\n\n` +
        `Buy more at https://calos.app/credits`
      );
    }
  }

  /**
   * /handle - Manage @username handle
   */
  async _handleHandle(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const args = message.text.split(' ').slice(1);

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ Please link your account first using */link*`
      );
      return;
    }

    if (!this.handleRegistry) {
      await this.sendMessage(chatId,
        `❌ Handle system not configured.`
      );
      return;
    }

    if (args.length === 0) {
      // Show current handle
      const currentHandle = await this.handleRegistry.getHandle(linkedUser.user_id);

      if (currentHandle) {
        await this.sendMessage(chatId,
          `🏷️  *Your Handle*\n\n` +
          `@${currentHandle}\n\n` +
          `Profile: https://calos.app/@${currentHandle}\n\n` +
          `To change: */handle <newhandle>*`
        );
      } else {
        await this.sendMessage(chatId,
          `🏷️  *No Handle Set*\n\n` +
          `Claim your unique @username:\n` +
          `*/handle yourusername*`
        );
      }
    } else {
      // Set new handle
      const desiredHandle = args[0].replace(/^@/, '');

      const result = await this.handleRegistry.setHandle(linkedUser.user_id, desiredHandle);

      if (result.success) {
        await this.sendMessage(chatId,
          `✅ *Handle Claimed!*\n\n` +
          `Your handle: *@${result.handle}*\n\n` +
          `Profile: https://calos.app/@${result.handle}`
        );
      } else {
        await this.sendMessage(chatId,
          `❌ *Failed*\n\n${result.error}`
        );
      }
    }
  }

  /**
   * /encrypt - Start encrypted messaging session
   */
  async _handleEncrypt(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ Please link your account first using */link*`
      );
      return;
    }

    if (!this.challengeChain) {
      await this.sendMessage(chatId,
        `❌ Encryption system not configured.`
      );
      return;
    }

    // Start challenge chain
    const sessionId = `tg-${Date.now()}-${telegramUserId}`;

    try {
      const chain = await this.challengeChain.startChain(sessionId, linkedUser.user_id);

      await this.sendMessage(chatId,
        `🔐 *Encrypted Messaging Session*\n\n` +
        `Solve ${chain.requirements.minChainLength} challenges to derive encryption key.\n\n` +
        `Challenge 1/${chain.requirements.minChainLength}:\n` +
        `\`${chain.challenge.substring(0, 16)}...\`\n\n` +
        `Find a nonce where SHA256(challenge + nonce) starts with ${chain.difficulty} zeros.\n\n` +
        `Reply with your nonce.`
      );

      // Store session
      await this.db.query(
        `INSERT INTO telegram_encryption_sessions (
          telegram_user_id,
          session_id,
          challenge_index
        ) VALUES ($1, $2, $3)`,
        [telegramUserId, sessionId, 0]
      );

    } catch (error) {
      console.error('[TelegramBot] Encrypt error:', error);
      await this.sendMessage(chatId,
        `❌ Failed to start encryption session.`
      );
    }
  }

  /**
   * /status - Account status
   */
  async _handleStatus(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ Account not linked. Use */link* to get started.`
      );
      return;
    }

    const handle = await this.handleRegistry?.getHandle(linkedUser.user_id);

    await this.sendMessage(chatId,
      `📊 *Account Status*\n\n` +
      `Email: *${linkedUser.email}*\n` +
      `Handle: ${handle ? `*@${handle}*` : '_Not set_'}\n` +
      `Telegram: *@${message.from.username || 'no username'}*\n\n` +
      `Use /help for available commands.`
    );
  }

  /**
   * /help - Command list
   */
  async _handleHelp(message) {
    const chatId = message.chat.id;

    await this.sendTyping(chatId);

    await this.sendMessage(chatId,
      `🤖 *CALOS Telegram Bot*\n\n` +
      `*Account Management:*\n` +
      `/start - Welcome message\n` +
      `/link - Link Telegram to CALOS account\n` +
      `/status - View account status\n\n` +
      `*Features:*\n` +
      `/verify - Verify phone number (SMS)\n` +
      `/balance - Check credit balance\n` +
      `/handle - Set/view @username handle\n` +
      `/encrypt - Start encrypted messaging\n\n` +
      `*Help:*\n` +
      `/help - Show this message\n\n` +
      `Visit https://calos.app for more info.`
    );
  }

  // ============================================================================
  // TELEGRAM API
  // ============================================================================

  /**
   * Long polling for updates
   */
  async _poll() {
    while (this.isPolling) {
      try {
        const updates = await this._getUpdates();

        for (const update of updates) {
          this._handleUpdate(update);
          this.updateOffset = update.update_id + 1;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.pollingInterval));

      } catch (error) {
        console.error('[TelegramBot] Polling error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer on error
      }
    }
  }

  /**
   * Get updates from Telegram
   */
  async _getUpdates() {
    const response = await this._apiRequest('getUpdates', {
      offset: this.updateOffset,
      timeout: 30
    });

    return response.result || [];
  }

  /**
   * Handle incoming update
   */
  async _handleUpdate(update) {
    try {
      if (update.message) {
        const message = update.message;

        // Check for commands
        if (message.text && message.text.startsWith('/')) {
          const command = message.text.split(' ')[0];
          const handler = this.commands.get(command);

          if (handler) {
            await handler(message);
          } else {
            await this.sendMessage(message.chat.id,
              `Unknown command. Use /help for available commands.`
            );
          }
        } else if (message.text) {
          // Check if user is in verification session
          await this._handleTextMessage(message);
        }

        this.emit('message', message);
      }

    } catch (error) {
      console.error('[TelegramBot] Update handler error:', error);
    }
  }

  /**
   * Handle text message (verification codes, etc.)
   */
  async _handleTextMessage(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const text = message.text;

    // Check for verification session
    const verifySession = await this.db.query(
      `SELECT * FROM telegram_verification_sessions
       WHERE telegram_user_id = $1
       AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [telegramUserId]
    );

    if (verifySession.rows.length > 0) {
      const session = verifySession.rows[0];

      // Check if message is verification code (6 digits)
      if (/^\d{6}$/.test(text)) {
        await this._verifyCode(session, text, chatId);
        return;
      }
    }

    // Check for encryption session
    const encryptSession = await this.db.query(
      `SELECT * FROM telegram_encryption_sessions
       WHERE telegram_user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [telegramUserId]
    );

    if (encryptSession.rows.length > 0) {
      await this._handleEncryptionResponse(encryptSession.rows[0], text, chatId);
      return;
    }
  }

  /**
   * Verify SMS code
   */
  async _verifyCode(session, code, chatId) {
    try {
      const check = await this.twilioClient.verify
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks
        .create({ to: session.phone_number, code });

      if (check.status === 'approved') {
        await this.sendMessage(chatId,
          `✅ *Phone Verified!*\n\n` +
          `Your phone number is now verified.`
        );

        // Delete session
        await this.db.query(
          `DELETE FROM telegram_verification_sessions WHERE session_id = $1`,
          [session.session_id]
        );
      } else {
        await this.sendMessage(chatId,
          `❌ Invalid code. Please try again.`
        );
      }

    } catch (error) {
      console.error('[TelegramBot] Verify code error:', error);
      await this.sendMessage(chatId,
        `❌ Verification failed. Please try again.`
      );
    }
  }

  /**
   * Handle encryption challenge response
   */
  async _handleEncryptionResponse(session, nonce, chatId) {
    try {
      const result = await this.challengeChain.verifyAndContinue(session.session_id, { nonce });

      if (result.keyDerived) {
        await this.sendMessage(chatId,
          `🔐 *Encryption Key Derived!*\n\n` +
          `Path length: ${result.pathLength}\n\n` +
          `Your messages are now encrypted.`
        );

        // Delete session
        await this.db.query(
          `DELETE FROM telegram_encryption_sessions WHERE session_id = $1`,
          [session.session_id]
        );

      } else if (result.canComplete) {
        await this.sendMessage(chatId,
          `✅ Challenge ${result.challengeIndex + 1} verified!\n\n` +
          `You can complete the chain now, or continue for stronger encryption.\n\n` +
          `Next challenge: \`${result.challenge.substring(0, 16)}...\`\n\n` +
          `Reply with nonce or send /complete`
        );

        // Update session
        await this.db.query(
          `UPDATE telegram_encryption_sessions
           SET challenge_index = $2
           WHERE session_id = $1`,
          [session.session_id, result.challengeIndex]
        );

      } else {
        await this.sendMessage(chatId,
          `✅ Challenge ${result.challengeIndex + 1}/${result.minLength} verified!\n\n` +
          `Next challenge: \`${result.challenge.substring(0, 16)}...\`\n\n` +
          `Reply with nonce.`
        );

        // Update session
        await this.db.query(
          `UPDATE telegram_encryption_sessions
           SET challenge_index = $2
           WHERE session_id = $1`,
          [session.session_id, result.challengeIndex]
        );
      }

    } catch (error) {
      console.error('[TelegramBot] Encryption response error:', error);
      await this.sendMessage(chatId,
        `❌ Invalid nonce. Try again.`
      );
    }
  }

  /**
   * Make Telegram API request
   */
  async _apiRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(params);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(`${this.apiUrl}/${method}`, options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(body);

            if (response.ok) {
              resolve(response);
            } else {
              reject(new Error(response.description || 'API request failed'));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Set bot commands (for Telegram UI)
   */
  async _setBotCommands() {
    await this._apiRequest('setMyCommands', {
      commands: [
        { command: 'start', description: 'Welcome message' },
        { command: 'link', description: 'Link Telegram to CALOS account' },
        { command: 'verify', description: 'Verify phone number' },
        { command: 'balance', description: 'Check credit balance' },
        { command: 'handle', description: 'Manage @username handle' },
        { command: 'encrypt', description: 'Start encrypted messaging' },
        { command: 'status', description: 'View account status' },
        { command: 'help', description: 'Show help message' }
      ]
    });
  }

  // ============================================================================
  // DATABASE HELPERS
  // ============================================================================

  /**
   * Get linked CALOS user from Telegram ID
   */
  async _getLinkedUser(telegramUserId) {
    const result = await this.db.query(
      `SELECT u.user_id, u.email, u.username
       FROM users u
       JOIN telegram_accounts ta ON ta.user_id = u.user_id
       WHERE ta.telegram_user_id = $1`,
      [telegramUserId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Generate linking code
   */
  async _generateLinkingCode(telegramUserId) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    await this.db.query(
      `INSERT INTO telegram_linking_codes (
        telegram_user_id,
        linking_code,
        expires_at
      ) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
      ON CONFLICT (telegram_user_id) DO UPDATE
      SET linking_code = $2, expires_at = NOW() + INTERVAL '10 minutes', created_at = NOW()`,
      [telegramUserId, code]
    );

    return code;
  }

  /**
   * Link account with code
   */
  async _linkAccountWithCode(telegramUserId, linkingCode, telegramProfile) {
    try {
      // Find linking code
      const result = await this.db.query(
        `SELECT user_id FROM telegram_linking_codes
         WHERE linking_code = $1
         AND expires_at > NOW()`,
        [linkingCode]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid or expired code' };
      }

      const userId = result.rows[0].user_id;

      // Link account
      await this.db.query(
        `INSERT INTO telegram_accounts (
          user_id,
          telegram_user_id,
          telegram_username,
          telegram_first_name,
          telegram_last_name
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (telegram_user_id) DO UPDATE
        SET user_id = $1, telegram_username = $3`,
        [
          userId,
          telegramUserId,
          telegramProfile.username,
          telegramProfile.first_name,
          telegramProfile.last_name
        ]
      );

      // Delete linking code
      await this.db.query(
        `DELETE FROM telegram_linking_codes WHERE linking_code = $1`,
        [linkingCode]
      );

      // Get user email
      const userResult = await this.db.query(
        `SELECT email FROM users WHERE user_id = $1`,
        [userId]
      );

      return {
        success: true,
        email: userResult.rows[0].email
      };

    } catch (error) {
      console.error('[TelegramBot] Link account error:', error);
      return { success: false, error: 'Linking failed' };
    }
  }
}

module.exports = TelegramBot;
