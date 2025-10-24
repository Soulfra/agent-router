# CALOS Agent Router

AI-powered routing system with Gmail webhook integration, lofi streaming, ELO voting, and real-time collaboration.

## Project Overview

CALOS Agent Router is a comprehensive platform that combines:
1. **AI Agent Routing** - Multi-model AI routing with ELO-based selection
2. **Gmail Webhook System** - Free email relay using Google Sheets + Gmail API (zero-cost alternative to Mailchimp)
3. **Dev Ragebait Generator** - Viral dev meme generator with GIF/MP4 output and domain branding
4. **Lofi Streaming** - Real-time audio streaming with WebSockets
5. **Community Acquisition** - Data-driven community engagement tools

## Quick Start

### Gmail Webhook System (New!)
```bash
# Interactive setup wizard
npm run gmail:setup:free

# Start polling Gmail
npm run gmail:poll

# Send test email
npm run gmail:test your@email.com
```

See `.claude/CLAUDE.md` for detailed Gmail webhook documentation.

### Dev Ragebait Generator
```bash
# Start server and open ragebait generator
npm run ragebait

# Or open manually
npm start
open http://localhost:5001/ragebait-generator.html
```

See `docs/RAGEBAIT-API.md` for API documentation.

### Available Slash Commands

Gmail Webhook Commands:
- `/project:gmail-setup` - Run setup wizard
- `/project:gmail-add-recipient [userId] [email]` - Add recipient with double opt-in
- `/project:gmail-status [userId]` - Check system status
- `/project:gmail-send-test [email]` - Send test email
- `/project:gmail-remove-recipient [userId] [email]` - Remove recipient
- `/project:gmail-check-limits [userId]` - View rate limits

## Architecture

### Gmail Webhook System

**Zero-cost email relay** alternative to Mailchimp/SendGrid:

```
Gmail → Polling (60s) → Google Sheets (DB) → Free SMTP → Recipient
                            ↓
                     Whitelist + Rate Limiting + Encryption
```

**Key Files:**
- `lib/gmail-gateway.js` - **START HERE** - Single API gateway for everything
- `lib/gmail-relay-zero-cost.js` - Core relay system
- `lib/google-sheets-db-adapter.js` - Makes Sheets act like a database
- `lib/simple-encryption.js` - AES-256-GCM encryption for OAuth tokens
- `lib/gmail-poller.js` - Polls Gmail every 60s (no webhooks needed)
- `lib/free-smtp-adapter.js` - Gmail/Brevo/MailerSend SMTP support
- `lib/recipient-whitelist-manager.js` - Double opt-in anti-spam system
- `lib/rate-limiter.js` - Prevent abuse (50/hour, 500/day per user)

**Security Features:**
1. Double opt-in whitelist (recipients must confirm)
2. Rate limiting (hourly/daily/monthly)
3. AES-256 encryption (OAuth tokens)
4. Reputation tracking (auto-disable bad actors)

**Zero-Cost Stack:**
- Google Sheets (free, 10M cells)
- Gmail SMTP (500/day) or Brevo (300/day) or MailerSend (3k/month)
- Google Cloud (free tier)
- No PostgreSQL, no Pub/Sub, no paid services

### Agent Router Core

Multi-model AI routing system with ELO-based selection:

- `router.js` - Main router with ELO voting system
- `lib/agent-selector.js` - Model selection logic
- `lib/elo-system.js` - ELO rating for model performance

### Community Acquisition

Data-driven community engagement:

- `lib/community-acquisition-system.js` - Main acquisition engine
- `routes/community-acquisition-routes.js` - API endpoints
- `bin/community` - CLI tool for community management

### Dev Ragebait Generator

Viral dev meme generator with GIF/MP4 output:

- `lib/dev-ragebait-generator.js` - Core generator with 11 templates
- `routes/mobile-routes.js` - API endpoints (ragebait section)
- `public/ragebait-generator.html` - Web UI with domain branding

## File Organization

```
agent-router/
  .claude/
    CLAUDE.md                     ← Gmail webhook project docs
    commands/                     ← Slash commands
      gmail-setup.md
      gmail-add-recipient.md
      gmail-status.md
      gmail-send-test.md
      ...

  lib/
    # Gmail Webhook System (Zero Cost)
    gmail-gateway.js              ← API Gateway (use this!)
    gmail-relay-zero-cost.js      ← Core relay
    google-sheets-db-adapter.js   ← Sheets as DB
    simple-encryption.js          ← AES-256 encryption
    gmail-poller.js               ← Polling engine
    free-smtp-adapter.js          ← Free SMTP
    recipient-whitelist-manager.js ← Anti-spam
    rate-limiter.js               ← Abuse prevention

    # Agent Router Core
    agent-selector.js
    elo-system.js
    lofi-streaming-engine.js

    # Community Acquisition
    community-acquisition-system.js
    email-service.js
    mailer-engine.js

    # Dev Ragebait Generator
    dev-ragebait-generator.js
    qr-generator.js

  bin/
    gmail-setup-free              ← Interactive wizard
    gmail-setup                   ← Full version
    community                     ← Community CLI

  docs/
    GMAIL_WEBHOOK_ZERO_COST.md    ← Zero-cost tutorial
    GMAIL_WEBHOOK_TUTORIAL.md     ← Full tutorial
    GMAIL_GATEWAY_API.md          ← API reference
    RAGEBAIT-API.md               ← Ragebait API reference
    ROUTE-REFERENCE.md            ← Route quick reference
```

## Common Tasks

### Gmail Webhook System

```javascript
// Simple API - everything through gateway
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

// Add recipient (double opt-in)
await gateway.addRecipient('user123', 'customer@example.com');

// Send email (auto-checks whitelist + rate limits)
await gateway.send({
  userId: 'user123',
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test email'
});

// Check status
const status = await gateway.getStatus('user123');
console.log(status.user.rateLimits);  // 12/50 hourly, 143/500 daily
console.log(status.user.whitelist);   // 15 total, 12 approved, 3 pending
console.log(status.user.reputation);  // score: 98, bounces: 2

// Start/stop polling
await gateway.startPolling();
gateway.stopPolling();
```

### Agent Router

```javascript
const router = require('./router');

// Route request to best AI model
const response = await router.route({
  prompt: 'Explain quantum computing',
  context: { domain: 'science', complexity: 'advanced' }
});
```

### Community Acquisition

```bash
# CLI tool
./bin/community analyze
./bin/community export-contacts
./bin/community send-campaign
```

## Environment Variables

### Gmail Webhook (Required)
```bash
GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
GOOGLE_SHEETS_CREDENTIALS_PATH=./path/to/credentials.json
ENCRYPTION_KEY=your-32-char-key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

FREE_SMTP_PROVIDER=gmail  # or brevo, mailersend
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

### Agent Router
```bash
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
DATABASE_URL=postgresql://...
```

## Testing

```bash
# All tests
npm test

# Gmail webhook tests
npm run gmail:test your@email.com

# Agent router tests
npm run test:domain
```

## Documentation

- **Gmail Webhook (Zero Cost):** `docs/GMAIL_WEBHOOK_ZERO_COST.md`
- **Gmail Webhook (Full):** `docs/GMAIL_WEBHOOK_TUTORIAL.md`
- **Gmail Gateway API:** `docs/GMAIL_GATEWAY_API.md`
- **Ragebait Generator API:** `docs/RAGEBAIT-API.md`
- **Route Reference:** `docs/ROUTE-REFERENCE.md`
- **Community Acquisition:** `COMMUNITY_ACQUISITION_GUIDE.md`

## Resources

- Gmail Webhook Setup: `npm run gmail:setup:free`
- Slash Commands: Type `/project:` to see all
- Discord: https://discord.gg/calos
- Issues: https://github.com/calos/agent-router/issues

---

**Built with ❤️ by CALOS**

*Zero-cost email relay • AI routing • Dev meme generator • Community acquisition • All in one*
