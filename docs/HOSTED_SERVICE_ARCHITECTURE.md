# CALOS Email API - Hosted Service Architecture

## Overview

Instead of making users install 20+ dependencies, we host the Gmail webhook system and provide a tiny SDK that just calls our API.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S APP                              │
│                                                                 │
│  npm install @calos/email-sdk  (5KB, zero dependencies)        │
│                                                                 │
│  const calos = require('@calos/email-sdk');                    │
│  await calos.email.send({ ... });                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTPS Request
                       │ X-API-Key: calos_abc123...
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR HOSTED API                              │
│                (Render/Railway/Docker)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ API Routes (/api/gmail/webhook/*)                       │  │
│  │  - Validate API key                                      │  │
│  │  - Check rate limits                                     │  │
│  │  - Check reputation                                      │  │
│  │  - Verify whitelist                                      │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │ Gmail Gateway (lib/gmail-gateway.js)                    │  │
│  │  - Rate Limiter                                          │  │
│  │  - Reputation Tracker                                    │  │
│  │  - Whitelist Manager                                     │  │
│  │  - 2FA System                                            │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │ Storage (Google Sheets)                                  │  │
│  │  - API keys                                              │  │
│  │  - Rate limits                                           │  │
│  │  - Reputation scores                                     │  │
│  │  - Whitelist                                             │  │
│  │  - 2FA secrets                                           │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │ SMTP Provider (Free Tier)                                │  │
│  │  - Gmail (500/day)                                       │  │
│  │  - Brevo (300/day)                                       │  │
│  │  - MailerSend (3k/month)                                 │  │
│  └──────────────────┬───────────────────────────────────────┘  │
└────────────────────┬┘                                           │
                     │                                            │
                     ▼                                            │
            Recipient's Email ✓                                   │
```

## Components

### 1. Client SDK (`@calos/email-sdk`)

**Location:** `sdk/email-sdk/`

**Size:** ~5KB

**Dependencies:** Zero (uses built-in `fetch`)

**What it does:**
- Wraps API calls in nice JavaScript methods
- Handles errors
- Provides TypeScript types

**Code:**
```javascript
const calos = require('@calos/email-sdk');

await calos.email.send({
  apiKey: 'calos_abc123...',
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test'
});
```

**Under the hood:**
```javascript
fetch('https://api.calos.ai/api/gmail/webhook/send', {
  method: 'POST',
  headers: {
    'X-API-Key': 'calos_abc123...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: 'customer@example.com',
    subject: 'Hello',
    text: 'Test'
  })
})
```

That's it! No dependencies, no complexity.

---

### 2. API Routes (`routes/gmail-webhook-zero-cost-routes.js`)

**What it does:**
- Receives HTTP requests from SDK
- Authenticates API keys
- Validates inputs
- Calls Gmail Gateway
- Returns responses

**Key Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/send` | POST | Send email |
| `/recipients` | POST | Add recipient (double opt-in) |
| `/recipients/:userId` | GET | Get recipients |
| `/recipients` | DELETE | Remove recipient |
| `/status/:userId` | GET | Get user status |
| `/test` | POST | Send test email |
| `/health` | GET | Health check |
| `/keys` | POST | Create API key (admin) |

---

### 3. API Key Manager (`lib/api-key-manager.js`)

**What it does:**
- Generates secure API keys
- Validates keys on each request
- Tracks usage per key
- Manages tiers (free/pro/enterprise)
- Revokes keys

**Key Features:**
- Keys are hashed (SHA-256) before storage
- Never stores plain keys (except on creation)
- Each key tied to userId + tier
- Automatic usage tracking

**Tiers:**

| Tier | Monthly Limit | Hourly Limit | Cost |
|------|---------------|--------------|------|
| Free | 100 emails | 10/hour | $0 |
| Pro | 10,000 emails | 100/hour | $10 |
| Enterprise | Unlimited | 1000/hour | $50 |

---

### 4. Gmail Gateway (`lib/gmail-gateway.js`)

**What it does:**
- Single API for all Gmail webhook functionality
- Wraps complexity behind simple methods
- Handles all security checks

**Security Checks (on every send):**
1. ✓ Recipient whitelisted?
2. ✓ Rate limit OK?
3. ✓ Reputation score OK?
4. ✓ SMTP available?

If all pass → Send email ✓

---

### 5. Storage (Google Sheets)

**Why Sheets?**
- **Free:** 10M cells (plenty for small apps)
- **No setup:** No database server to manage
- **Visual:** Can view/edit data in browser
- **Backups:** Built-in version history

**Sheets Created:**

| Sheet Name | Purpose |
|------------|---------|
| `api_keys` | API keys (hashed) |
| `rate_limits` | User/recipient/global limits |
| `email_reputation` | Reputation scores |
| `recipient_whitelist` | Double opt-in recipients |
| `two_factor_auth` | 2FA secrets |
| `gmail_webhook_configs` | Gmail configs |

---

### 6. SMTP Provider

**Free Options:**

| Provider | Free Limit | Setup Difficulty |
|----------|-----------|------------------|
| Gmail | 500/day | Easy (app password) |
| Brevo | 300/day | Medium (API key) |
| MailerSend | 3k/month | Medium (domain verify) |

**Configured via environment variables:**
```bash
FREE_SMTP_PROVIDER=gmail
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=your_16_char_password
```

---

## Request Flow

### Example: Send Email

1. **User's App**
   ```javascript
   await calos.email.send({
     apiKey: 'calos_abc123...',
     to: 'customer@example.com',
     subject: 'Hi',
     body: 'Test'
   });
   ```

2. **SDK → API**
   ```
   POST https://api.calos.ai/api/gmail/webhook/send
   Headers:
     X-API-Key: calos_abc123...
     Content-Type: application/json
   Body:
     {"to":"customer@example.com","subject":"Hi","text":"Test"}
   ```

3. **API Routes**
   - Validates API key → Gets userId
   - Calls Gateway with userId

4. **Gmail Gateway**
   - Checks whitelist → ✓ Approved
   - Checks rate limits → ✓ 5/50 hourly
   - Checks reputation → ✓ Score 98
   - Calls SMTP → Send!

5. **SMTP Provider**
   - Gmail sends email
   - Returns message ID

6. **Response Chain**
   ```
   Gateway → Routes → SDK → User's App
   ```

7. **User Receives**
   ```javascript
   {
     success: true,
     messageId: 'abc123',
     provider: 'gmail'
   }
   ```

---

## Deployment Options

### Option 1: Render.com (Recommended)

**Pros:**
- Free tier (750 hours/month)
- Auto-deploy from GitHub
- HTTPS included
- Easy setup

**Cons:**
- Sleeps after 15min inactivity
- Slower on free tier

**Deploy:**
1. Push code to GitHub
2. Connect to Render
3. Add environment variables
4. Deploy!

**URL:** `https://your-app.onrender.com`

---

### Option 2: Railway.app

**Pros:**
- $5/month credit (free for small apps)
- No sleep
- Fast
- Great DX

**Cons:**
- Eventually costs money (after credit)

**Deploy:**
```bash
railway login
railway up
```

**URL:** Generated automatically

---

### Option 3: Docker (Self-hosted)

**Pros:**
- Full control
- No vendor lock-in
- Can run anywhere

**Cons:**
- More setup
- You manage infrastructure

**Deploy:**
```bash
docker build -t calos-email-api .
docker run -p 3000:3000 --env-file .env calos-email-api
```

---

## Cost Breakdown

### Free Tier (100 emails/month)

| Component | Cost |
|-----------|------|
| Hosting (Render) | $0 |
| Database (Sheets) | $0 |
| SMTP (Gmail) | $0 |
| **Total** | **$0/month** |

### Pro Tier (10,000 emails/month)

| Component | Cost |
|-----------|------|
| Hosting (Render Starter) | $7 |
| Database (Sheets) | $0 |
| SMTP (SendGrid) | $19.95 |
| **Total** | **$26.95/month** |
| **Charge users** | **$10/month** |
| **Your margin** | **-$16.95** (subsidize or increase price) |

### Enterprise Tier (Unlimited)

| Component | Cost |
|-----------|------|
| Hosting (Render Standard) | $25 |
| Database (PostgreSQL) | $7 |
| SMTP (Mailgun) | $35+ |
| **Total** | **$67+/month** |
| **Charge users** | **$50/month** |
| **Your margin** | **-$17** (volume pricing needed) |

**Note:** Margins improve with scale (bulk SMTP pricing, shared hosting costs).

---

## Comparison: Before vs. After

### Before (User installs everything)

**User's package.json:**
```json
{
  "dependencies": {
    "googleapis": "^164.1.0",          // 50MB+
    "otpauth": "^9.4.1",               // 2MB
    "qrcode": "^1.5.4",                // 1MB
    "nodemailer": "^7.0.9",            // 3MB
    // ... 16 more packages
    // Total: ~80MB, 20+ dependencies
  }
}
```

**User's setup:**
1. Set up Google Cloud project
2. Enable Sheets API
3. Create service account
4. Download credentials
5. Share spreadsheet
6. Set up Gmail SMTP
7. Configure environment variables
8. Run migrations
9. Start server

**Time:** ~2 hours

---

### After (User installs SDK)

**User's package.json:**
```json
{
  "dependencies": {
    "@calos/email-sdk": "^1.0.0"      // 5KB, zero dependencies
  }
}
```

**User's setup:**
1. Get API key from calos.ai
2. Use SDK

**Time:** ~5 minutes

---

## Security

### API Key Security

- Keys hashed (SHA-256) before storage
- Never stored in plain text
- Validated on every request
- Can be revoked instantly

### Data Security

- All OAuth tokens encrypted (AES-256-GCM)
- HTTPS only
- Rate limiting per key
- Reputation tracking
- Double opt-in whitelist

### Infrastructure Security

- Environment variables (not committed)
- Service accounts (not user credentials)
- Minimal permissions
- Regular key rotation

---

## Monitoring

### Built-in Endpoints

**Health Check:**
```bash
curl https://api.calos.ai/api/gmail/webhook/health
```

**Status:**
```bash
curl https://api.calos.ai/api/gmail/webhook/status/user123 \
  -H "X-API-Key: calos_abc123..."
```

### Metrics to Track

- Requests per minute
- Success/failure rate
- Average response time
- SMTP delivery rate
- Error types
- API key usage

### Logging

All requests logged:
```
[2025-10-20 12:00:00] POST /send userId=user123 to=customer@example.com result=success
[2025-10-20 12:00:01] POST /send userId=user456 to=test@example.com result=rate_limited
```

---

## Next Steps

1. **Deploy API** (choose Render/Railway/Docker)
2. **Publish SDK to NPM**
3. **Create landing page** (calos.ai/email)
4. **Add payment** (Stripe for pro tier)
5. **Marketing** (Product Hunt, Reddit, HN)

---

## Future Enhancements

### Phase 2
- [ ] Webhook for email events (open, click, bounce)
- [ ] Email templates
- [ ] A/B testing
- [ ] Analytics dashboard
- [ ] Bulk sending

### Phase 3
- [ ] SMS sending
- [ ] Push notifications
- [ ] In-app messaging
- [ ] Omnichannel orchestration

---

**🚀 Ready to ship!**

The hosted service architecture eliminates complexity for users while giving you control of the platform.
