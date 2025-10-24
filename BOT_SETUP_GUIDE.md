# Bot Setup Guide - Make It Actually Work

**Date:** 2025-10-22

## The Problem

You have:
- ✅ Telegram bot code (`lib/telegram-bot.js`) - **894 lines, fully built**
- ✅ QR login pages - **ready to use**
- ✅ Phone verification - **ready to use**

But it's **NOT RUNNING** because:
- ❌ No bot tokens configured
- ❌ Not started in router.js
- ❌ No database tables created

## Quick Setup (10 Minutes)

### Step 1: Create Telegram Bot

1. Open Telegram, search for [@BotFather](https://t.me/BotFather)
2. Send: `/newbot`
3. Name your bot: `CALOS Bot`
4. Username: `calos_yourname_bot` (must end with `bot`)
5. Copy the token: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### Step 2: Add Token to .env

```bash
# In /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/.env
TELEGRAM_BOT_TOKEN=paste_your_token_here
```

### Step 3: Create Database Tables

Run this SQL in your database:

```sql
-- Telegram account linking
CREATE TABLE IF NOT EXISTS telegram_accounts (
  telegram_account_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  telegram_username VARCHAR(255),
  telegram_first_name VARCHAR(255),
  telegram_last_name VARCHAR(255),
  linked_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- Linking codes (QR code pairing)
CREATE TABLE IF NOT EXISTS telegram_linking_codes (
  telegram_user_id BIGINT PRIMARY KEY,
  linking_code VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Phone verification sessions
CREATE TABLE IF NOT EXISTS telegram_verification_sessions (
  session_id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  user_id INTEGER NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Encrypted messaging sessions
CREATE TABLE IF NOT EXISTS telegram_encryption_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  challenge_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_telegram_accounts_user ON telegram_accounts(user_id);
CREATE INDEX idx_telegram_accounts_telegram ON telegram_accounts(telegram_user_id);
CREATE INDEX idx_telegram_verification_telegram ON telegram_verification_sessions(telegram_user_id);
CREATE INDEX idx_telegram_encryption_telegram ON telegram_encryption_sessions(telegram_user_id);
```

### Step 4: Wire Up in router.js

I'll create the integration code. You just need the token from Step 1.

### Step 5: Start Server & Test

```bash
npm start

# In Telegram, message your bot:
/start

# Bot will respond with linking instructions
```

## Advanced Setup (Optional)

### Add Phone Verification (Twilio)

**Why:** Verify users' phone numbers via SMS

**Cost:** ~$1/mo for phone number + $0.01/SMS

**Setup:**
1. Sign up: https://www.twilio.com (free $15 credit)
2. Buy phone number
3. Create Verify Service
4. Add to .env:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Add Discord Bot

**Setup:**
1. Go to: https://discord.com/developers/applications
2. Create New Application
3. Go to Bot tab → Add Bot
4. Copy token
5. Add to .env:
```bash
DISCORD_BOT_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

Then I'll create `lib/discord-bot.js` similar to Telegram.

## How It Works

### Account Linking Flow

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Telegram   │         │  CALOS Bot   │         │  Your System │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │────/start─────────────>│                        │
       │                        │                        │
       │<────Welcome msg────────│                        │
       │    "Use /link"         │                        │
       │                        │                        │
       │────/link──────────────>│                        │
       │                        │                        │
       │                        │───Generate code──────>│
       │                        │<──Code: ABC123────────│
       │                        │                        │
       │<────"Your code:────────│                        │
       │     ABC123"            │                        │
       │                        │                        │
       │─────────────Visit calos.app/settings────────────>│
       │                                                  │
       │─────────────Enter code: ABC123──────────────────>│
       │                                                  │
       │<─────────────✅ Account linked!──────────────────│
       │                        │                        │
       │────/status────────────>│                        │
       │                        │───Query user info────>│
       │                        │<──User data──────────│
       │<────Account info───────│                        │
       │                        │                        │
```

### Commands Available

```
/start   - Welcome message
/link    - Link Telegram to CALOS account
/verify  - Verify phone number (requires Twilio)
/balance - Check credit balance
/handle  - Set/view @username handle
/encrypt - Start encrypted messaging
/status  - View account status
/help    - Show all commands
```

### CalRiven Executive Integration

Once bot is running, connect to CalRiven:

```javascript
// CalRiven can send you updates via Telegram
await calriven.reportToOwner(); // Sends daily report via Telegram

// You can approve decisions via Telegram
/approve abc123  // Approve pending decision

// Get company status
/company_status  // Shows process, network, revenue stats
```

## What You Can Do With It

### 1. Mobile Access
- Control CALOS from phone
- Get notifications
- Approve decisions on the go

### 2. Phone Verification
- Verify users via SMS
- Two-factor authentication
- Phone-based account recovery

### 3. Encrypted Messaging
- Challenge-chain encryption
- Path-based key derivation
- Secure communications

### 4. Account Management
- Link accounts across platforms
- Set @username handles
- Check balances
- Manage settings

### 5. Executive Operations
- CalRiven sends daily reports
- Approve/reject decisions via Telegram
- Monitor company status
- Get alerts for critical issues

## Testing Checklist

Once bot is running:

- [ ] `/start` - Bot responds with welcome
- [ ] `/link` - Bot generates linking code
- [ ] Visit http://localhost:5001/settings/telegram
- [ ] Enter linking code
- [ ] Account linked successfully
- [ ] `/status` - Shows linked account info
- [ ] `/balance` - Shows credit balance
- [ ] `/handle yourusername` - Claims @username
- [ ] `/help` - Shows all commands

With Twilio (optional):
- [ ] `/verify +1234567890` - Sends SMS
- [ ] Reply with 6-digit code
- [ ] Phone verified

## Current Status

**What EXISTS:**
- ✅ Full Telegram bot implementation
- ✅ Account linking (QR codes)
- ✅ Phone verification (Twilio)
- ✅ Encrypted messaging
- ✅ Command system
- ✅ Database schema ready

**What's MISSING:**
- ❌ Bot token (you need to get from @BotFather)
- ❌ Wired up in router.js (I'll do this once you have token)
- ❌ Database tables created (run SQL above)

**Once you have the token:**
1. Add to .env
2. Run SQL migration
3. I'll wire it up
4. **IT WORKS**

## Discord vs Telegram vs WhatsApp

**Telegram (Easiest):**
- ✅ Free
- ✅ No approval needed
- ✅ Fast setup (10 min)
- ✅ Code already built
- ✅ Best for personal use

**Discord (Medium):**
- ✅ Free
- ✅ No approval needed
- ⚠️ Need to build discord-bot.js (30 min)
- ✅ Good for communities

**WhatsApp (Hardest):**
- ❌ Costs money
- ❌ Requires business account
- ❌ Approval process
- ❌ More restrictive
- ⚠️ Need to build whatsapp-bot.js (few hours)
- ✅ Best reach (everyone has WhatsApp)

## Next Steps

**To actually make it work:**

1. **Get Telegram bot token** (5 minutes)
   - Message @BotFather
   - `/newbot`
   - Copy token

2. **Add to .env** (30 seconds)
   - Paste token

3. **Run SQL migration** (1 minute)
   - Create tables

4. **Tell me you're ready** (1 second)
   - I'll wire it up in router.js
   - Start bot
   - **YOU CAN USE IT**

---

**The code is done. Just need to flip the switches.** 🤖✅
