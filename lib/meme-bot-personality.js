/**
 * Meme Bot Personality - Humorous Wrapper for Telegram Bot
 *
 * A bot that LOOKS like it's just memeing around, but actually does serious work.
 *
 * Pattern:
 * - Surface: Casual, humorous, meme-filled responses
 * - Core: Proper account linking, verification, security
 *
 * Examples:
 * - Normal: "Your linking code is: ABC123"
 * - Meme: "lol ok here's ur code: ABC123 💀 don't lose it bruh"
 *
 * - Normal: "Account linked successfully"
 * - Meme: "yooo ur in 🔥 account linked fr fr no cap"
 *
 * - Normal: "Phone verification code sent"
 * - Meme: "sent u a text, check ur phone bestie 📱"
 *
 * The bot is funny, but it's NOT careless. Security is maintained.
 */

const TelegramBot = require('./telegram-bot');

class MemeBotPersonality extends TelegramBot {
  constructor(options) {
    super(options);
    console.log('[MemeBotPersonality] 😎 Meme mode activated');
  }

  /**
   * Override _handleStart with meme personality
   */
  async _handleStart(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const username = message.from.username || 'User';

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (linkedUser) {
      await this.sendMessage(chatId,
        `yooo what's good @${username} 👋\n\n` +
        `ur telegram is linked to: *${linkedUser.email}*\n\n` +
        `type /help if u forgot what this thing does lol`
      );
    } else {
      await this.sendMessage(chatId,
        `yooo welcome to CALOS @${username} 😎\n\n` +
        `🔗 ur telegram isn't linked yet tho\n\n` +
        `here's what u gotta do:\n` +
        `1. make an account at calos.app/register (takes like 2 min)\n` +
        `2. use */link* to connect ur account\n\n` +
        `or just type /help idk whatever works`
      );
    }
  }

  /**
   * Override _handleLink with meme personality
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
        `🔗 *Link Ur Account*\n\n` +
        `lol ok here's ur code: *${linkingCode}*\n\n` +
        `go to calos.app/settings/telegram and paste this in\n\n` +
        `u got 10 mins before it expires so don't sleep on it 💤`
      );
    } else {
      // User provided linking code
      const linkingCode = args[0];
      const result = await this._linkAccountWithCode(telegramUserId, linkingCode, message.from);

      if (result.success) {
        await this.sendMessage(chatId,
          `✅ *yooo ur in* 🔥\n\n` +
          `ur telegram is now linked to: *${result.email}*\n\n` +
          `type /help to see what u can do fr fr no cap`
        );
      } else {
        await this.sendMessage(chatId,
          `❌ *bruh that didn't work*\n\n` +
          `${result.error}\n\n` +
          `try */link* again to get a new code (without the old one)`
        );
      }
    }
  }

  /**
   * Override _handleVerify with meme personality
   */
  async _handleVerify(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const args = message.text.split(' ').slice(1);

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ nah u gotta link ur account first\n\nuse */link* bestie`
      );
      return;
    }

    if (!this.twilioClient) {
      await this.sendMessage(chatId,
        `❌ phone verification ain't set up yet lol\n\nask the admin to configure twilio or smth`
      );
      return;
    }

    if (args.length === 0) {
      await this.sendMessage(chatId,
        `📱 *Verify Ur Phone*\n\n` +
        `type: */verify +1234567890*\n\n` +
        `(use ur actual number tho)\n\n` +
        `we'll send u a code via text`
      );
      return;
    }

    // Send verification code
    const phoneNumber = args[0];

    try {
      // Create verification session
      const sessionId = await this._createVerificationSession(
        telegramUserId,
        linkedUser.user_id,
        phoneNumber
      );

      // Send SMS via Twilio
      await this.twilioClient.verify
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications
        .create({ to: phoneNumber, channel: 'sms' });

      await this.sendMessage(chatId,
        `📱 sent u a text bestie\n\n` +
        `check ur phone for the code and reply with:\n` +
        `*/verify <code>*\n\n` +
        `(the code expires in 10 min so don't forget)`
      );
    } catch (error) {
      await this.sendMessage(chatId,
        `❌ *bruh something went wrong*\n\n` +
        `couldn't send the code to *${phoneNumber}*\n\n` +
        `make sure the number is right (include country code like +1)`
      );
    }
  }

  /**
   * Override _handleBalance with meme personality
   */
  async _handleBalance(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ link ur account first using */link*`
      );
      return;
    }

    // Get balance from database
    const balance = await this._getUserBalance(linkedUser.user_id);

    if (balance === null) {
      await this.sendMessage(chatId,
        `❌ couldn't get ur balance rn\n\ntry again later idk`
      );
      return;
    }

    const balanceStr = balance.toFixed(2);
    let emoji = '💸';
    let comment = '';

    if (balance === 0) {
      emoji = '💀';
      comment = '\n\nu broke lol';
    } else if (balance < 5) {
      emoji = '⚠️';
      comment = '\n\nlow funds fr fr';
    } else if (balance > 100) {
      emoji = '🤑';
      comment = '\n\nok big spender i see u';
    }

    await this.sendMessage(chatId,
      `${emoji} *Balance*\n\n` +
      `u got *$${balanceStr}* left${comment}\n\n` +
      `don't spend it all on gifs`
    );
  }

  /**
   * Override _handleHandle with meme personality
   */
  async _handleHandle(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const args = message.text.split(' ').slice(1);

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ link ur account first using */link*`
      );
      return;
    }

    if (args.length === 0) {
      // Show current handle
      const currentHandle = await this._getUserHandle(linkedUser.user_id);

      if (currentHandle) {
        await this.sendMessage(chatId,
          `ur handle is: *@${currentHandle}*\n\n` +
          `(kinda mid ngl, u should change it)`
        );
      } else {
        await this.sendMessage(chatId,
          `u don't have a handle yet lol\n\n` +
          `set one with: */handle yourcoolname*`
        );
      }
      return;
    }

    // Set new handle
    const newHandle = args[0].replace('@', '');

    try {
      await this._setUserHandle(linkedUser.user_id, newHandle);

      await this.sendMessage(chatId,
        `✅ *handle claimed* 🔥\n\n` +
        `ur new handle is: *@${newHandle}*\n\n` +
        `goes hard fr`
      );
    } catch (error) {
      await this.sendMessage(chatId,
        `❌ *couldn't set that handle*\n\n` +
        `someone already took it probably\n\n` +
        `try a different one`
      );
    }
  }

  /**
   * Override _handleEncrypt with meme personality
   */
  async _handleEncrypt(message) {
    const chatId = message.chat.id;

    await this.sendTyping(chatId);

    await this.sendMessage(chatId,
      `🔐 *Encrypted Messaging*\n\n` +
      `encrypted dm's aren't ready yet lol\n\n` +
      `coming soon tho fr\n\n` +
      `(using path-based challenge-chain encryption or whatever the tech nerds call it)`
    );
  }

  /**
   * Override _handleStatus with meme personality
   */
  async _handleStatus(message) {
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    await this.sendTyping(chatId);

    const linkedUser = await this._getLinkedUser(telegramUserId);

    if (!linkedUser) {
      await this.sendMessage(chatId,
        `❌ link ur account first using */link*`
      );
      return;
    }

    const balance = await this._getUserBalance(linkedUser.user_id);
    const handle = await this._getUserHandle(linkedUser.user_id);
    const linkDate = new Date(linkedUser.linked_at).toLocaleDateString();

    await this.sendMessage(chatId,
      `📊 *Ur Status*\n\n` +
      `*Email:* ${linkedUser.email}\n` +
      `*Handle:* ${handle ? '@' + handle : 'not set'}\n` +
      `*Balance:* $${balance ? balance.toFixed(2) : '0.00'}\n` +
      `*Linked:* ${linkDate}\n\n` +
      `lookin good bestie 😎`
    );
  }

  /**
   * Override _handleHelp with meme personality
   */
  async _handleHelp(message) {
    const chatId = message.chat.id;

    await this.sendTyping(chatId);

    await this.sendMessage(chatId,
      `🤖 *CALOS Bot Commands*\n\n` +
      `*/start* - welcome msg (u already know)\n` +
      `*/link* - link ur telegram to CALOS\n` +
      `*/verify* - verify ur phone (needs twilio)\n` +
      `*/balance* - check how much money u got left\n` +
      `*/handle* - set or view ur @username\n` +
      `*/status* - see ur account info\n` +
      `*/encrypt* - encrypted messaging (coming soon)\n` +
      `*/help* - this list lol\n\n` +
      `fr tho this bot is actually useful\n` +
      `it just talks like it's not 💀`
    );
  }

  /**
   * Get user balance (helper)
   */
  async _getUserBalance(userId) {
    try {
      const result = await this.db.query(
        'SELECT balance FROM users WHERE user_id = $1',
        [userId]
      );

      return result.rows[0]?.balance || 0;
    } catch (error) {
      console.error('[MemeBotPersonality] Failed to get balance:', error);
      return null;
    }
  }

  /**
   * Get user handle (helper)
   */
  async _getUserHandle(userId) {
    try {
      const result = await this.db.query(
        'SELECT handle FROM user_handles WHERE user_id = $1',
        [userId]
      );

      return result.rows[0]?.handle || null;
    } catch (error) {
      console.error('[MemeBotPersonality] Failed to get handle:', error);
      return null;
    }
  }

  /**
   * Set user handle (helper)
   */
  async _setUserHandle(userId, handle) {
    await this.db.query(
      `INSERT INTO user_handles (user_id, handle)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET handle = $2, updated_at = NOW()`,
      [userId, handle]
    );
  }
}

module.exports = MemeBotPersonality;
