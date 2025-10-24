# Gmail Webhook Tutorial

> **Like Mailchimp but for personal Gmail accounts**

Learn how to send emails from custom addresses using your personal Gmail account, powered by CALOS.

---

## Table of Contents

1. [What Are We Building?](#what-are-we-building)
2. [Why Would You Want This?](#why-would-you-want-this)
3. [Three Tiers of Solutions](#three-tiers-of-solutions)
4. [Quick Start (Tier 1: Send-As)](#quick-start-tier-1-send-as)
5. [Full Setup (Tier 3: Webhook Relay)](#full-setup-tier-3-webhook-relay)
6. [Understanding How It Works](#understanding-how-it-works)
7. [Troubleshooting](#troubleshooting)

---

## What Are We Building?

A system that lets you send emails from custom addresses (like `support@yourcompany.com`) instead of your personal Gmail address (`you@gmail.com`).

**The Problem:**
Gmail doesn't let you truly "spoof" From addresses for security reasons.

**The Solution:**
We relay emails through CALOS servers (just like Mailchimp does) so the recipient sees your custom From address.

### Example Flow

**Before (Standard Gmail):**
```
You → Gmail → Recipient
From: you@gmail.com
```

**After (CALOS Relay):**
```
You → Gmail → CALOS → Mailchimp/SendGrid → Recipient
From: support@yourcompany.com
```

---

## Why Would You Want This?

### Use Cases

1. **Professional Branding**
   - Send support emails from `support@yourcompany.com`
   - Marketing emails from `marketing@yourcompany.com`
   - No more exposing your personal Gmail address

2. **Side Projects**
   - Build SaaS products without paying for Google Workspace
   - Send transactional emails from your app
   - Keep it simple while you validate your idea

3. **Freelancers**
   - Professional email addresses for each client
   - `hello@yourportfolio.com` instead of `freelancer123@gmail.com`

4. **Learning**
   - Understand how email relays work
   - Learn OAuth, webhooks, and email infrastructure
   - Build something real with APIs

---

## Three Tiers of Solutions

CALOS offers three approaches, from simplest to most powerful:

### Tier 1: Gmail "Send As" Aliases (Simple)
✅ **Good for:** Quick setup, testing, personal use
⚠️ **Limitation:** Shows "on behalf of" in some email clients
⏱ **Setup time:** 5 minutes

### Tier 2: Google Workspace SMTP Relay (Medium)
✅ **Good for:** Clean sending, no "on behalf of" label
⚠️ **Limitation:** Requires Google Workspace ($6/month)
⏱ **Setup time:** 15 minutes

### Tier 3: CALOS Server Relay (Advanced)
✅ **Good for:** Full control, like Mailchimp
✅ **Benefits:** Clean From, no "on behalf of", full tracking
⏱ **Setup time:** 30 minutes

**We'll cover Tier 1 and Tier 3 in this tutorial.**

---

## Quick Start (Tier 1: Send-As)

The simplest way to get started. Great for testing and personal use.

### Step 1: Prerequisites

- Personal Gmail account
- Custom email address to send from (e.g., `support@yourcompany.com`)
- Access to that email's inbox (for verification)
- CALOS account

### Step 2: Run Setup Wizard

```bash
cd agent-router
npm run gmail:setup
```

The wizard will guide you through:

1. **OAuth Authorization** - Grant CALOS access to your Gmail
2. **Configure Alias** - Set up your custom From address
3. **Verification** - Click verification link in email

### Step 3: Verify Your Alias

1. Gmail sends a verification email to your custom address
2. Check the inbox for `support@yourcompany.com`
3. Click the verification link
4. Done! Your alias is verified

### Step 4: Send Test Email

Use the CALOS API to send an email:

```bash
curl -X POST http://localhost:3000/api/gmail/send-as/YOUR_USER_ID/send \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_ACCESS_TOKEN",
    "refreshToken": "YOUR_REFRESH_TOKEN",
    "from": "support@yourcompany.com",
    "to": "friend@example.com",
    "subject": "Test Email",
    "text": "This email was sent from my custom address!",
    "html": "<p>This email was sent from my <strong>custom address</strong>!</p>"
  }'
```

### Step 5: Check Verification Status

```bash
curl "http://localhost:3000/api/gmail/send-as/YOUR_USER_ID/support@yourcompany.com/status?accessToken=YOUR_TOKEN&refreshToken=YOUR_REFRESH_TOKEN"
```

### What's Next?

- ✅ You can now send emails from custom addresses
- ⚠️ Some email clients may show "on behalf of you@gmail.com"
- 🚀 Want cleaner sending? Move to Tier 3 (Webhook Relay)

---

## Full Setup (Tier 3: Webhook Relay)

The Mailchimp approach. Full control, clean From addresses, no "on behalf of" labels.

### Architecture

```
┌─────────────────┐
│  Your Gmail     │
│  you@gmail.com  │
└────────┬────────┘
         │
         │ New Email
         ▼
┌─────────────────┐
│ Gmail Pub/Sub   │
│ Webhook         │
└────────┬────────┘
         │
         │ Notification
         ▼
┌─────────────────┐
│ CALOS Endpoint  │
│ /api/gmail/     │
│ webhook         │
└────────┬────────┘
         │
         │ Fetch Email Content
         ▼
┌─────────────────┐
│ Gmail API       │
│ (Full Message)  │
└────────┬────────┘
         │
         │ Relay
         ▼
┌─────────────────┐
│ Mailchimp/      │
│ SendGrid        │
└────────┬────────┘
         │
         │ Deliver
         ▼
┌─────────────────┐
│ Recipient       │
│ Sees: support@  │
│ yourcompany.com │
└─────────────────┘
```

### Step 1: Prerequisites

- Personal Gmail account
- Google Cloud project (free tier is fine)
- CALOS account with email service configured
- Custom domain for From address (e.g., `yourcompany.com`)
- Mailchimp or SendGrid API key

### Step 2: Set Up Google Cloud Pub/Sub

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Create a new project or select existing

2. **Enable Gmail API**
   ```bash
   gcloud services enable gmail.googleapis.com
   ```

3. **Create Pub/Sub Topic**
   ```bash
   gcloud pubsub topics create gmail-webhook-topic
   ```

4. **Create Pub/Sub Subscription**
   ```bash
   gcloud pubsub subscriptions create gmail-webhook-sub \
     --topic=gmail-webhook-topic \
     --push-endpoint=https://your-calos-domain.com/api/gmail/webhook
   ```

5. **Grant Gmail Permission**
   - Service account: `gmail-api-push@system.gserviceaccount.com`
   - Role: Pub/Sub Publisher

### Step 3: Configure Gmail Push Notifications

Use the Gmail API to watch your mailbox:

```bash
curl -X POST https://gmail.googleapis.com/gmail/v1/users/me/watch \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topicName": "projects/YOUR_PROJECT_ID/topics/gmail-webhook-topic",
    "labelIds": ["INBOX"]
  }'
```

Response:
```json
{
  "historyId": "1234567",
  "expiration": "1640000000000"
}
```

**Note:** Gmail watch expires after 7 days. You need to renew it weekly.

### Step 4: Run CALOS Setup Wizard

```bash
cd agent-router
npm run gmail:setup
```

Select option 2: "Gmail Webhook Relay (Tier 3 - Advanced)"

The wizard will:
1. Guide you through OAuth
2. Set up webhook configuration
3. Configure relay rules (optional)
4. Save everything to database

### Step 5: Configure Email Service

Edit your `.env` file:

```bash
# Email Service Provider (choose one)
EMAIL_PROVIDER=sendgrid  # or 'mailchimp', 'mailgun', 'resend'
EMAIL_API_KEY=your_sendgrid_api_key

# Custom From Address
EMAIL_FROM_ADDRESS=noreply@calos.ai
EMAIL_FROM_NAME=CALOS Platform
```

### Step 6: Test the Webhook

1. **Send yourself a test email** from another account to your Gmail
2. **Check CALOS logs** to see webhook processing:
   ```bash
   tail -f logs/gmail-webhook.log
   ```
3. **Verify relay** - Check that the email was relayed with custom From

### Step 7: Set Up Relay Rules (Optional)

You can filter which emails get relayed:

```bash
curl -X PUT http://localhost:3000/api/gmail/webhook/config/YOUR_USER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "relayRules": {
      "subject_contains": "CALOS",
      "from_domain": "example.com"
    }
  }'
```

**Available Rules:**
- `subject_contains` - Only relay if subject contains text
- `from_domain` - Only relay if sender is from domain
- `has_label` - Only relay if email has Gmail label (coming soon)

### Step 8: Monitor Statistics

Check relay statistics:

```bash
curl http://localhost:3000/api/gmail/webhook/stats/YOUR_USER_ID
```

Response:
```json
{
  "status": "success",
  "stats": {
    "total_relayed": 42,
    "successful": 40,
    "failed": 2,
    "last_relay": "2025-10-20T12:00:00Z",
    "active_days": 7
  }
}
```

---

## Understanding How It Works

### OAuth Flow

```
User → CALOS → Google OAuth → User Approves → CALOS Receives Tokens
```

1. User clicks "Authorize Gmail"
2. CALOS redirects to Google OAuth page
3. User grants permissions:
   - Read/modify Gmail messages
   - Manage Send-As settings
   - Send emails on your behalf
4. Google redirects back to CALOS with authorization code
5. CALOS exchanges code for access token + refresh token
6. Tokens stored securely in database

**Scopes Required:**
```javascript
const scopes = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing'
];
```

### Webhook Processing Flow

```
Gmail Push → Pub/Sub → CALOS → Fetch Message → Relay → Log
```

1. **New email arrives** in your Gmail inbox
2. **Gmail sends Pub/Sub notification** to your topic
3. **CALOS receives webhook** at `/api/gmail/webhook`
4. **CALOS decodes notification** (base64 encoded data)
5. **CALOS fetches new messages** via Gmail API (using historyId)
6. **CALOS checks relay rules** (subject filter, domain filter, etc.)
7. **CALOS relays via email service** (Mailchimp, SendGrid, etc.)
8. **CALOS logs transaction** to database
9. **Recipient receives email** with custom From address

### Email Relay Process

**Original Email (Gmail):**
```
From: you@gmail.com
To: customer@example.com
Subject: Support Request
Body: Hello, how can I help?
```

**Relayed Email (via CALOS):**
```
From: support@yourcompany.com
To: customer@example.com
Subject: Support Request
Body: Hello, how can I help?

Headers:
  X-Original-From: you@gmail.com
  X-Relayed-By: CALOS
  X-Original-Message-ID: 123abc456def
```

### Database Schema

**gmail_webhook_configs** - Webhook relay configurations
```sql
- user_id
- email_address (Gmail)
- access_token (OAuth)
- refresh_token (OAuth)
- relay_from_address (Custom From)
- relay_rules (JSON filter rules)
- last_history_id (Gmail sync state)
- enabled
```

**email_relay_logs** - Relay transaction logs
```sql
- user_id
- original_from (Gmail address)
- relayed_from (Custom From)
- recipient_to
- subject
- gmail_message_id
- relay_message_id
- status (sent/failed/filtered)
```

**gmail_send_as_aliases** - Send-As alias configurations
```sql
- user_id
- send_as_email (Custom address)
- display_name
- reply_to_address
- verification_status
- is_default
```

**gmail_sent_emails** - Sent email logs
```sql
- user_id
- send_as_email
- recipient_to
- subject
- gmail_message_id
- status
```

---

## Troubleshooting

### Common Issues

#### 1. "Verification email not received"

**Problem:** Gmail Send-As verification email didn't arrive

**Solutions:**
- Check spam folder for `support@yourcompany.com`
- Make sure you have access to the inbox
- Resend verification:
  ```bash
  curl -X POST http://localhost:3000/api/gmail/send-as/YOUR_USER_ID/support@yourcompany.com/verify \
    -H "Content-Type: application/json" \
    -d '{"accessToken": "...", "refreshToken": "..."}'
  ```

#### 2. "Webhook not receiving notifications"

**Problem:** Gmail sends emails but CALOS doesn't receive webhooks

**Solutions:**
- Check Gmail watch is active:
  ```bash
  curl https://gmail.googleapis.com/gmail/v1/users/me/watch \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
- Renew watch (expires after 7 days):
  ```bash
  curl -X POST https://gmail.googleapis.com/gmail/v1/users/me/watch \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -d '{"topicName": "projects/YOUR_PROJECT/topics/gmail-webhook-topic"}'
  ```
- Check Pub/Sub subscription is active in Google Cloud Console

#### 3. "Invalid OAuth tokens"

**Problem:** Access token expired or invalid

**Solutions:**
- CALOS automatically refreshes tokens using refresh token
- If refresh fails, re-run `npm run gmail:setup` to re-authorize
- Check token in database:
  ```sql
  SELECT user_id, email_address,
         LEFT(access_token, 20) as token_preview
  FROM gmail_webhook_configs
  WHERE user_id = 'YOUR_USER_ID';
  ```

#### 4. "Relay failed: Email service error"

**Problem:** CALOS received webhook but failed to relay

**Solutions:**
- Check email service credentials in `.env`:
  ```bash
  EMAIL_PROVIDER=sendgrid
  EMAIL_API_KEY=your_key_here
  ```
- Check email service status:
  ```bash
  curl http://localhost:3000/api/gmail/health
  ```
- Check relay logs:
  ```sql
  SELECT * FROM email_relay_logs
  WHERE status = 'failed'
  ORDER BY created_at DESC
  LIMIT 10;
  ```

#### 5. "Emails relaying but recipient sees 'on behalf of'"

**Problem:** Using Tier 1 (Send-As) instead of Tier 3 (Relay)

**Solution:**
- Upgrade to Tier 3 (Webhook Relay) for clean From addresses
- Follow the [Full Setup](#full-setup-tier-3-webhook-relay) guide

#### 6. "Database connection failed"

**Problem:** Cannot connect to PostgreSQL

**Solutions:**
- Check `DATABASE_URL` in `.env`:
  ```bash
  DATABASE_URL=postgresql://user:password@localhost:5432/calos
  ```
- Run migrations:
  ```bash
  psql $DATABASE_URL -f migrations/060_gmail_webhooks.sql
  ```
- Test connection:
  ```bash
  psql $DATABASE_URL -c "SELECT 1"
  ```

---

## API Reference

### Quick Reference

#### Webhook Relay (Tier 3)

```bash
# Create webhook config
POST /api/gmail/webhook/config

# Update webhook config
PUT /api/gmail/webhook/config/:userId

# Get webhook config
GET /api/gmail/webhook/config/:emailAddress

# Get relay statistics
GET /api/gmail/webhook/stats/:userId

# Receive Pub/Sub webhook
POST /api/gmail/webhook
```

#### Send-As Aliases (Tier 1)

```bash
# Add Send-As alias
POST /api/gmail/send-as

# List Send-As aliases
GET /api/gmail/send-as/:userId

# Update Send-As alias
PUT /api/gmail/send-as/:userId/:sendAsEmail

# Delete Send-As alias
DELETE /api/gmail/send-as/:userId/:sendAsEmail

# Send verification email
POST /api/gmail/send-as/:userId/:sendAsEmail/verify

# Check verification status
GET /api/gmail/send-as/:userId/:sendAsEmail/status

# Send email via Send-As
POST /api/gmail/send-as/:userId/send

# Get email statistics
GET /api/gmail/send-as/:userId/stats
```

---

## Best Practices

### Security

1. **Never expose OAuth tokens**
   - Store in environment variables
   - Encrypt in database (use pgcrypto)
   - Don't log tokens

2. **Use HTTPS for webhooks**
   - Pub/Sub requires HTTPS endpoints
   - Use Let's Encrypt for free SSL

3. **Validate webhook signatures**
   - Verify requests come from Google
   - Check Pub/Sub message format

### Performance

1. **Process webhooks asynchronously**
   - Acknowledge webhook immediately
   - Process in background job
   - Don't block Pub/Sub

2. **Batch email fetching**
   - Fetch multiple messages at once
   - Use Gmail history API efficiently

3. **Rate limiting**
   - Gmail API: 250 quota units/second
   - SendGrid: Plan-dependent limits

### Maintenance

1. **Renew Gmail watch weekly**
   - Set up cron job to renew
   - Watch expires after 7 days
   - Monitor expiration timestamp

2. **Clean up old logs**
   - Delete logs older than 90 days
   - Use database views for reporting

3. **Monitor relay health**
   - Track success/failure rates
   - Alert on high failure rate
   - Check email service quotas

---

## Next Steps

### You've Completed the Tutorial! 🎉

**What you learned:**
- ✅ How Gmail webhooks work
- ✅ How to relay emails through CALOS
- ✅ How to send from custom addresses
- ✅ How Mailchimp-style email relay works

**What you can build:**
- 📧 Professional email sending for side projects
- 🤖 Automated email responses with AI
- 📊 Email tracking and analytics
- 🔔 Custom notification systems

### Ideas to Explore

1. **AI Email Assistant**
   - Auto-reply to support emails using Claude
   - Categorize emails automatically
   - Smart email routing

2. **Newsletter System**
   - Send newsletters from Gmail
   - Track opens and clicks
   - Manage subscriber lists

3. **Team Inbox**
   - Shared inbox for team collaboration
   - Assign emails to team members
   - Track response times

4. **Email Analytics**
   - Track sent emails
   - Monitor delivery rates
   - Analyze engagement

### Resources

- **Gmail API Docs:** https://developers.google.com/gmail/api
- **Pub/Sub Docs:** https://cloud.google.com/pubsub/docs
- **CALOS Docs:** https://docs.calos.ai
- **RFC 2822 (Email Format):** https://www.rfc-editor.org/rfc/rfc2822

### Get Help

- 💬 CALOS Discord: https://discord.gg/calos
- 📧 Email: support@calos.ai
- 🐛 Report bugs: https://github.com/calos/agent-router/issues

---

## Appendix

### Environment Variables

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback

# Email Service
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=your_api_key
EMAIL_FROM_ADDRESS=noreply@calos.ai
EMAIL_FROM_NAME=CALOS Platform

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/calos

# Server
PORT=3000
NODE_ENV=production
```

### Sample Code

#### Send Email via Send-As

```javascript
const axios = require('axios');

async function sendEmail() {
  const response = await axios.post(
    'http://localhost:3000/api/gmail/send-as/user123/send',
    {
      accessToken: 'ya29...',
      refreshToken: '1//...',
      from: 'support@mycompany.com',
      to: 'customer@example.com',
      subject: 'Welcome!',
      html: '<p>Thanks for signing up!</p>'
    }
  );

  console.log('Email sent:', response.data);
}
```

#### List Send-As Aliases

```javascript
async function listAliases() {
  const response = await axios.get(
    'http://localhost:3000/api/gmail/send-as/user123',
    {
      params: {
        accessToken: 'ya29...',
        refreshToken: '1//...'
      }
    }
  );

  console.log('Aliases:', response.data.aliases);
}
```

#### Create Webhook Config

```javascript
async function createWebhookConfig() {
  const response = await axios.post(
    'http://localhost:3000/api/gmail/webhook/config',
    {
      userId: 'user123',
      emailAddress: 'you@gmail.com',
      accessToken: 'ya29...',
      refreshToken: '1//...',
      relayFromAddress: 'noreply@calos.ai',
      relayRules: {
        subject_contains: 'CALOS'
      },
      enabled: true
    }
  );

  console.log('Config created:', response.data);
}
```

---

**Built with ❤️ by CALOS**

*Have questions? Join our Discord: https://discord.gg/calos*
