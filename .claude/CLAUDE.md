# Gmail Webhook System (Zero Cost Edition)

This subfolder contains project-specific instructions for working with the Gmail webhook relay system.

## Quick Overview

Free email relay system that lets you send emails from custom addresses using personal Gmail.

**Think:** Mailchimp but free, using Google Sheets + Gmail API

## Architecture

```
Gmail → Polling (60s) → Google Sheets (DB) → Free SMTP → Recipient
                            ↓
                     Whitelist + Rate Limiting
```

## Key Features

- **Zero Cost:** Google Sheets (free), Gmail SMTP (500/day free)
- **Security:** Double opt-in whitelist, rate limiting, AES-256 encryption
- **Simple:** Single API gateway wraps all complexity
- **No Webhooks:** Polling instead of Pub/Sub (simpler setup)

## Main Entry Point

**`lib/gmail-gateway.js`** - Use this for everything

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

// Send email (checks whitelist, rate limits, sends)
await gateway.send({
  userId: 'user123',
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test'
});

// Add recipient (sends confirmation email)
await gateway.addRecipient('user123', 'customer@example.com');

// Check status
const status = await gateway.getStatus('user123');
```

## Available Commands

Type `/project:` to see all available commands:

- `/project:gmail-setup` - Run interactive setup wizard
- `/project:gmail-add-recipient [userId] [email]` - Add recipient with double opt-in
- `/project:gmail-status [userId]` - Check system status and limits
- `/project:gmail-send-test [email]` - Send test email
- `/project:gmail-remove-recipient [userId] [email]` - Remove recipient from whitelist
- `/project:gmail-check-limits [userId]` - View rate limits

## File Organization

```
lib/
  gmail-gateway.js              ← START HERE (API Gateway)
  gmail-relay-zero-cost.js      ← Core relay system
  google-sheets-db-adapter.js   ← Database (Sheets as DB)
  simple-encryption.js          ← AES-256-GCM encryption
  gmail-poller.js               ← Polls Gmail every 60s
  free-smtp-adapter.js          ← Gmail/Brevo/MailerSend SMTP
  recipient-whitelist-manager.js ← Double opt-in system
  rate-limiter.js               ← Prevent abuse
  email-reputation-tracker.js   ← Track bounces/spam

bin/
  gmail-setup-free              ← Interactive CLI wizard

docs/
  GMAIL_WEBHOOK_ZERO_COST.md    ← Full tutorial
  GMAIL_GATEWAY_API.md          ← API reference
```

## Security Layers

1. **Whitelist:** Recipients must confirm via email before receiving
2. **Rate Limiting:** 50/hour, 500/day per user
3. **Encryption:** OAuth tokens encrypted with AES-256-GCM
4. **Reputation:** Auto-disable users with high bounce/spam rates

## Common Tasks

### Setup New User
```bash
npm run gmail:setup:free
# Follow interactive wizard
```

### Start Polling
```bash
npm run gmail:poll
# Polls all enabled users every 60 seconds
```

### Send Test Email
```bash
npm run gmail:test your@email.com
```

### Add Recipient Programmatically
```javascript
const gateway = new GmailGateway();
await gateway.init();
await gateway.addRecipient('user123', 'customer@example.com');
// → Sends confirmation email
// → Recipient clicks link to approve
// → Now can receive emails
```

## Zero-Cost Requirements

- **Google Sheet** - Free (10M cells)
- **Google Cloud Project** - Free tier
- **Service Account** - Free
- **Gmail SMTP** - Free (500 emails/day)
  - OR Brevo (300/day)
  - OR MailerSend (3,000/month)
- **Custom Domain** - Optional ($12/year for SPF/DKIM setup)

## Rate Limits

### Per User
- **Hourly:** 50 emails
- **Daily:** 500 emails
- **Monthly:** 10,000 emails
- **Per Recipient/Day:** 10 emails

### Global (All Users)
- **Hourly:** 100 emails
- **Daily:** 500 emails

## Environment Variables

```bash
# Required
GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
GOOGLE_SHEETS_CREDENTIALS_PATH=./path/to/credentials.json
ENCRYPTION_KEY=your-32-char-key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# SMTP (choose one)
FREE_SMTP_PROVIDER=gmail  # or brevo, mailersend
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=your_app_password

# Optional
CONFIRMATION_URL=http://localhost:3000/confirm
EMAIL_FROM_ADDRESS=noreply@calos.ai
RATE_LIMIT_HOURLY=50
RATE_LIMIT_DAILY=500
```

## Debugging

### Check System Health
```javascript
const health = await gateway.healthCheck();
console.log(health);
// {
//   status: 'healthy',
//   checks: {
//     database: true,
//     smtp: true,
//     poller: true
//   }
// }
```

### View Logs
```javascript
const status = await gateway.getStatus('user123');
console.log(status);
// Shows rate limits, whitelist, reputation, recent activity
```

### Common Issues

**"Recipient not whitelisted"**
- Add recipient: `gateway.addRecipient(userId, email)`
- Recipient must click confirmation link

**"Rate limit exceeded"**
- Check limits: `gateway.getStatus(userId)`
- Wait for reset or contact admin

**"SMTP authentication failed"**
- Gmail: Use App Password, not regular password
- Brevo/MailerSend: Check API key

## Best Practices

1. **Always use gateway** - Don't instantiate components directly
2. **Add recipients first** - Send confirmation before relaying
3. **Check status regularly** - Monitor rate limits and reputation
4. **Handle errors gracefully** - All gateway methods return success/error
5. **Clean up expired** - Run `gateway.cleanup()` daily

## Testing

```javascript
// Mock mode for testing
const gateway = new GmailGateway({ mockMode: true });

// Send without actually sending
const result = await gateway.send({
  to: 'test@example.com',
  subject: 'Test'
});
```

## Migration

From Postgres to Sheets:
```javascript
// Export from Postgres
const rows = await pgPool.query('SELECT * FROM gmail_webhook_configs');

// Import to Sheets
for (const row of rows) {
  await gateway.db.insert('gmail_webhook_configs', row);
}
```

## Resources

- Full Tutorial: `docs/GMAIL_WEBHOOK_ZERO_COST.md`
- API Reference: `docs/GMAIL_GATEWAY_API.md`
- Interactive Setup: `npm run gmail:setup:free`
- Discord: https://discord.gg/calos
- Issues: https://github.com/calos/agent-router/issues
