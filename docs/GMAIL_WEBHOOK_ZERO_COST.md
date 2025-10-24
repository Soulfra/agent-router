# Gmail Webhook System (Zero Cost Edition)

> **Actually free. No bullshit.**

Send emails from custom addresses using your personal Gmail, but without paying for anything.

---

## What The Fuck Is This?

The original Gmail webhook system requires:
- ❌ PostgreSQL database ($$$)
- ❌ Google Cloud Pub/Sub (complex as fuck)
- ❌ Mailchimp/SendGrid ($$$ after free tier)
- ❌ Hosted server ($$$)

**This version uses:**
- ✅ Google Sheets (free, 10M cells)
- ✅ Simple polling (no Pub/Sub setup)
- ✅ Free SMTP services (Gmail 500/day, Brevo 300/day, MailerSend 3k/month)
- ✅ Your laptop (literally free)

---

## Quick Start (5 Minutes)

### Prerequisites

- Personal Gmail account
- Google Cloud project (free tier)
- That's fucking it

### 1. Create Google Sheet

```bash
# 1. Go to https://sheets.google.com
# 2. Create new spreadsheet
# 3. Name it "CALOS Gmail Database" or whatever
# 4. Copy Spreadsheet ID from URL:
#    https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

### 2. Set Up Service Account

```bash
# Go to Google Cloud Console
# https://console.cloud.google.com

# Enable APIs
gcloud services enable sheets.googleapis.com
gcloud services enable gmail.googleapis.com

# Create service account
gcloud iam service-accounts create calos-gmail-relay \
  --display-name="CALOS Gmail Relay"

# Generate credentials
gcloud iam service-accounts keys create gmail-credentials.json \
  --iam-account=calos-gmail-relay@YOUR_PROJECT.iam.gserviceaccount.com

# Get service account email
gcloud iam service-accounts list
```

### 3. Share Sheet with Service Account

```
1. Open your Google Sheet
2. Click "Share"
3. Paste service account email: calos-gmail-relay@YOUR_PROJECT.iam.gserviceaccount.com
4. Give "Editor" permissions
5. Done
```

### 4. Set Up Gmail OAuth

```bash
# Go to Google Cloud Console → APIs & Services → Credentials
# Create OAuth 2.0 Client ID
# Type: Web application
# Authorized redirect URIs: http://localhost:3000/oauth/google/callback

# Save:
# - Client ID
# - Client Secret
```

### 5. Choose Free SMTP Provider

#### Option A: Gmail SMTP (500 emails/day)

```bash
# 1. Enable 2FA: https://myaccount.google.com/security
# 2. Generate App Password: https://myaccount.google.com/apppasswords
# 3. Save app password
```

#### Option B: Brevo (300 emails/day)

```bash
# 1. Sign up: https://www.brevo.com
# 2. Go to Settings → SMTP & API
# 3. Copy SMTP key
```

#### Option C: MailerSend (3,000 emails/month)

```bash
# 1. Sign up: https://www.mailersend.com
# 2. Verify your domain
# 3. Go to Settings → SMTP
# 4. Copy credentials
```

### 6. Run Setup Wizard

```bash
cd agent-router
npm run gmail:setup:free
```

Follow the interactive wizard. It will:
1. Set up Google Sheets database
2. Configure SMTP provider
3. Generate encryption key
4. Create `.env.gmail-free` file
5. Add your first user config

### 7. Start Polling

```bash
npm run gmail:poll
```

That's it. Your shit is running.

---

## How It Works

### Architecture

```
┌────────────────────┐
│   Your Gmail       │
│   you@gmail.com    │
└──────────┬─────────┘
           │
           │ Every 60 seconds
           ▼
┌────────────────────┐
│   CALOS Poller     │
│   (Your Laptop)    │
└──────────┬─────────┘
           │
           │ Fetch new messages
           ▼
┌────────────────────┐
│   Gmail API        │
│   historyId magic  │
└──────────┬─────────┘
           │
           │ Store configs
           ▼
┌────────────────────┐
│   Google Sheets    │
│   (Free Database)  │
└──────────┬─────────┘
           │
           │ Relay email
           ▼
┌────────────────────┐
│   Free SMTP        │
│   Gmail/Brevo/...  │
└──────────┬─────────┘
           │
           │ Deliver
           ▼
┌────────────────────┐
│   Recipient        │
│   Sees: support@   │
│   yourcompany.com  │
└────────────────────┘
```

### Why Polling Instead of Webhooks?

**Webhooks (complex):**
- Set up Google Cloud Pub/Sub
- Configure push endpoint
- Need public HTTPS URL
- Manage subscriptions
- Renew watch every 7 days

**Polling (simple):**
- Run `npm run gmail:poll`
- That's it

**Trade-off:**
- Up to 60 second delay (who cares for most use cases)
- More API requests (but still well under free tier limits)

### Why Google Sheets Instead of PostgreSQL?

**PostgreSQL:**
- Install locally or pay for hosting
- Set up schema, migrations
- Manage backups
- Configure connection pooling

**Google Sheets:**
- Already exists (you have Google account)
- Visual (can inspect data in browser)
- No setup, no maintenance
- Free forever (10M cells = plenty)
- Built-in auth (service account)

**Trade-off:**
- Slower queries (but fine for <1000 users)
- 100 requests/min rate limit (plenty for personal use)
- No SQL (but we have a nice adapter)

### Encryption

OAuth tokens are encrypted with AES-256-GCM before storing in Google Sheets.

**Why?**
- Google Sheets is not a secure store
- Anyone with editor access can see data
- Encryption key stored separately (your .env file)

**How it works:**
```javascript
// Store
const encrypted = encryption.encrypt(token);
// Sheets sees: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// Retrieve
const token = encryption.decrypt(encrypted);
// Your app sees: "ya29.a0AfH6SMBx..."
```

---

## Commands

### Setup

```bash
# First time setup
npm run gmail:setup:free

# Add more user configurations
npm run gmail:setup:free
# (Choose option 2: Add User Configuration)
```

### Running

```bash
# Start poller (runs forever)
npm run gmail:poll

# Send test email
npm run gmail:test your-email@example.com

# View status
node -e "const r=require('./lib/gmail-relay-zero-cost');const relay=new r();relay.init().then(()=>console.log(relay.getStatus()))"
```

### Deployment

#### Option 1: Your Laptop (Easiest)

```bash
# Just run it
npm run gmail:poll

# Keep running in background
nohup npm run gmail:poll > gmail-poller.log 2>&1 &

# Or use screen/tmux
screen -S gmail-poller
npm run gmail:poll
# Ctrl+A, D to detach
```

#### Option 2: Free Hosting (Always Free Tier)

**Replit:**
```bash
# 1. Import repo to Replit
# 2. Add secrets (environment variables)
# 3. Run: npm run gmail:poll
# 4. Enable "Always On" (replit.com/pricing - free tier has this)
```

**Railway:**
```bash
# 1. Connect GitHub repo
# 2. Add environment variables
# 3. Start command: npm run gmail:poll
# 4. Free tier: 500 hours/month (plenty)
```

**Fly.io:**
```bash
# 1. Install flyctl
# 2. fly launch
# 3. Add secrets: fly secrets set ENCRYPTION_KEY=...
# 4. Deploy: fly deploy
# 5. Free tier: 3 VMs, 160GB transfer
```

#### Option 3: Cron Job (For Low Volume)

```bash
# If you only need to check Gmail a few times per day

# Add to crontab
crontab -e

# Check every 5 minutes
*/5 * * * * cd /path/to/agent-router && npm run gmail:poll:once

# Check every hour
0 * * * * cd /path/to/agent-router && npm run gmail:poll:once
```

---

## Configuration

### Environment Variables

```bash
# .env.gmail-free

# Google Sheets Database
GOOGLE_SHEETS_DB_ID=1ABC123...XYZ789
GOOGLE_SHEETS_CREDENTIALS_PATH=./gmail-credentials.json

# Encryption
ENCRYPTION_KEY=your-32-character-key-here-1234567890

# SMTP Provider (choose one)
FREE_SMTP_PROVIDER=gmail    # or brevo, mailersend

# Gmail SMTP (if using Gmail)
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop

# Brevo SMTP (if using Brevo)
BREVO_API_KEY=xkeysib-...

# MailerSend SMTP (if using MailerSend)
MAILERSEND_API_KEY=mlsn....

# Gmail OAuth
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback

# Default From Address
EMAIL_FROM_ADDRESS=noreply@calos.ai
```

### Relay Rules (Optional)

```javascript
// Only relay emails with "CALOS" in subject
{
  "subject_contains": "CALOS"
}

// Only relay emails from specific domain
{
  "from_domain": "example.com"
}

// Combine rules
{
  "subject_contains": "Support",
  "from_domain": "customer.com"
}
```

---

## API Usage

### Programmatic Setup

```javascript
const GmailRelayZeroCost = require('./lib/gmail-relay-zero-cost');

const relay = new GmailRelayZeroCost({
  spreadsheetId: 'YOUR_SHEET_ID',
  credentialsPath: './gmail-credentials.json',
  encryptionKey: 'your-encryption-key',
  smtpProvider: 'gmail',
  pollInterval: 60000 // 60 seconds
});

// Initialize
await relay.init();

// Add user config
await relay.createConfig({
  userId: 'user123',
  emailAddress: 'user@gmail.com',
  accessToken: 'ya29...',
  refreshToken: '1//...',
  relayFromAddress: 'support@mycompany.com',
  relayRules: {
    subject_contains: 'Support'
  },
  enabled: true
});

// Start polling
await relay.startAll();

// Get stats
const stats = await relay.getStats('user123');
console.log(stats);
// {
//   total_relayed: 42,
//   successful: 40,
//   failed: 2,
//   last_relay: '2025-10-20T12:00:00Z',
//   active_days: 7
// }
```

### Direct Database Access

```javascript
const GoogleSheetsDBAdapter = require('./lib/google-sheets-db-adapter');

const db = new GoogleSheetsDBAdapter({
  spreadsheetId: 'YOUR_SHEET_ID',
  credentialsPath: './gmail-credentials.json'
});

await db.init();

// Query
const configs = await db.query('gmail_webhook_configs', {
  user_id: 'user123'
});

// Insert
await db.insert('email_relay_logs', {
  user_id: 'user123',
  original_from: 'user@gmail.com',
  relayed_from: 'support@mycompany.com',
  recipient_to: 'customer@example.com',
  subject: 'Support Request',
  status: 'sent'
});

// Update
await db.update(
  'gmail_webhook_configs',
  { user_id: 'user123' },
  { enabled: false }
);

// Count
const count = await db.count('email_relay_logs', {
  user_id: 'user123',
  status: 'sent'
});
```

### Custom SMTP

```javascript
const FreeSMTPAdapter = require('./lib/free-smtp-adapter');

const smtp = new FreeSMTPAdapter({
  provider: 'custom',
  customHost: 'smtp.example.com',
  customPort: 587,
  customUser: 'user@example.com',
  customPass: 'password',
  customSecure: false
});

// Send email
await smtp.send({
  from: 'support@mycompany.com',
  to: 'customer@example.com',
  subject: 'Test Email',
  html: '<p>Hello world</p>'
});

// Test connection
const isOk = await smtp.verify();
```

---

## Limits & Costs

### Free Tier Limits

**Gmail SMTP:**
- 500 emails/day
- Free forever
- No verification needed (for your own domain)

**Brevo:**
- 300 emails/day
- Free forever
- Requires account signup

**MailerSend:**
- 3,000 emails/month (~100/day)
- Free forever
- Requires domain verification

**Google Sheets:**
- 10M cells (plenty for 10,000+ configs)
- 100 requests/min (fine for personal use)
- Free forever

**Gmail API:**
- 1 billion requests/day (you'll never hit this)
- Free forever

### Monthly Cost

**Zero. Dollars.**

Seriously:
- Google Sheets: $0
- Gmail API: $0
- Free SMTP: $0
- Your laptop: $0 (already have it)

**Optional costs:**
- Hosting (if you want 24/7): $0-5/month (Replit/Railway free tier)

---

## Troubleshooting

### "SMTP authentication failed"

**Gmail:**
- Make sure 2FA is enabled
- Use App Password, not regular password
- App Password format: `abcd efgh ijkl mnop` (with spaces)

**Brevo/MailerSend:**
- Check API key is correct
- Make sure account is verified

### "Sheets API error: Permission denied"

- Make sure you shared Sheet with service account email
- Service account needs "Editor" permissions
- Check credentials file path is correct

### "No new messages found"

- Make sure `last_history_id` is set (first poll initializes this)
- Check Gmail account is receiving emails
- Wait 60 seconds for next poll

### "Encryption error: invalid key"

- Encryption key must be 32+ characters
- Same key must be used for encrypt and decrypt
- Don't change key after storing data (or re-encrypt everything)

### "Rate limit exceeded"

- Google Sheets: 100 requests/min
- Solution: Reduce polling frequency or use caching
- Gmail API: 250 quota units/second (you won't hit this)

---

## Advanced Usage

### Multiple Users

```bash
# Add multiple Gmail accounts

npm run gmail:setup:free
# Choose option 2: Add User Configuration
# Repeat for each user
```

Each user gets their own polling thread, all running in parallel.

### IP Whitelisting

```javascript
// Add IP whitelist to relay rules

await relay.createConfig({
  userId: 'user123',
  emailAddress: 'user@gmail.com',
  accessToken: '...',
  refreshToken: '...',
  relayRules: {
    allowed_ips: ['123.45.67.89', '98.76.54.32']
  }
});

// In gmail-poller.js, add IP check:
if (config.relay_rules?.allowed_ips) {
  const clientIp = getClientIP(); // implement this
  if (!config.relay_rules.allowed_ips.includes(clientIp)) {
    return; // Skip relay
  }
}
```

### Custom Domain

```javascript
// Use your own domain in From address

await relay.createConfig({
  relayFromAddress: 'support@yourdomain.com',
  // ... other config
});

// Note: For best deliverability, set up SPF/DKIM/DMARC:
// 1. Add SPF record: v=spf1 include:_spf.google.com ~all
// 2. Set up DKIM in Gmail/Brevo/MailerSend settings
// 3. Add DMARC record: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

### Webhook Endpoint (Optional)

```javascript
// Instead of polling, expose webhook endpoint

const express = require('express');
const app = express();

app.post('/gmail/webhook', async (req, res) => {
  const { userId } = req.body;

  // Trigger poll manually
  await relay.poller.poll(userId);

  res.json({ status: 'ok' });
});

app.listen(3000);

// Then trigger from external source (cron, other service, etc.)
```

---

## Migration

### From Postgres to Sheets

```javascript
// Export from Postgres
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const configs = await pool.query('SELECT * FROM gmail_webhook_configs');

// Import to Sheets
const GoogleSheetsDBAdapter = require('./lib/google-sheets-db-adapter');
const db = new GoogleSheetsDBAdapter();

for (const config of configs.rows) {
  await db.insert('gmail_webhook_configs', config);
}
```

### From Sheets to Postgres

```javascript
// Export from Sheets
const db = new GoogleSheetsDBAdapter();
const configs = await db.query('gmail_webhook_configs');

// Import to Postgres
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

for (const config of configs) {
  await pool.query(`
    INSERT INTO gmail_webhook_configs (...) VALUES (...)
  `, [config.user_id, ...]);
}
```

---

## FAQ

### Q: Is this actually free?

A: Yes. All services have generous free tiers that never expire.

### Q: What happens if I hit the SMTP limit?

A: Switch to another provider. The system supports multiple providers, just change `FREE_SMTP_PROVIDER` env var.

### Q: Can I use this for production?

A: For low-volume (<500 emails/day), yes. For high-volume, upgrade to the full version with Postgres + webhooks.

### Q: Is Google Sheets secure for storing OAuth tokens?

A: Tokens are encrypted with AES-256-GCM. Encryption key is stored separately. Even if someone accesses your Sheet, they can't decrypt tokens without the key.

### Q: Can I inspect the data?

A: Yes! Open your Google Sheet in browser. You'll see all configs, logs, etc. (tokens are encrypted though).

### Q: How do I back up my data?

A: Google Sheets has version history. Or export to CSV: File → Download → CSV.

### Q: Can I use SQLite instead of Sheets?

A: Yes! Replace `GoogleSheetsDBAdapter` with `better-sqlite3`. Already have it installed.

---

## Next Steps

### Built with this system?

- Send us a PR with your use case
- We'll add it to showcase
- Help others learn

### Want more features?

- Check out the full version: `docs/GMAIL_WEBHOOK_TUTORIAL.md`
- Postgres + webhooks + full dashboard
- Better for high-volume production use

### Questions?

- Discord: https://discord.gg/calos
- Email: support@calos.ai
- Issues: https://github.com/calos/agent-router/issues

---

**Built with ❤️ and zero dollars**

*Prove you can ship something before paying for infrastructure*
