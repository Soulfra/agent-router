# Gmail Gateway API Reference

Complete API reference for the Gmail webhook system (zero-cost version).

## Table of Contents

- [Authentication](#authentication)
- [REST API Endpoints](#rest-api-endpoints)
- [JavaScript API (Gateway)](#javascript-api-gateway)
- [Rate Limiting](#rate-limiting)
- [Error Codes](#error-codes)
- [Security Best Practices](#security-best-practices)
- [Examples](#examples)

## Authentication

All API endpoints (except `/confirm/:token`) require authentication.

### API Key

Include API key in request header or query parameter:

```bash
# Header
curl -H "X-API-Key: your-api-key" https://api.example.com/api/gmail/webhook/status

# Query parameter
curl https://api.example.com/api/gmail/webhook/status?apiKey=your-api-key
```

Set API key in environment:
```bash
GMAIL_WEBHOOK_API_KEY=your-secret-api-key
```

### Webhook Signature Verification

For webhook callbacks (bounce, spam), requests must include signature:

```javascript
const crypto = require('crypto');
const payload = JSON.stringify(requestBody);
const signature = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

// Include in header
headers: {
  'X-Webhook-Signature': signature
}
```

## REST API Endpoints

### Send Email

**POST** `/api/gmail/webhook/send`

Send email via gateway with all security checks.

**Request:**
```json
{
  "userId": "user123",
  "from": "noreply@calos.ai",
  "to": "customer@example.com",
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>"
}
```

**Response (Success):**
```json
{
  "success": true,
  "messageId": "abc123",
  "provider": "gmail",
  "recipients": 1
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Recipient not whitelisted",
  "code": "NOT_WHITELISTED",
  "recipient": "customer@example.com",
  "hint": "Add recipient: gateway.addRecipient('user123', 'customer@example.com')"
}
```

---

### Add Recipient

**POST** `/api/gmail/webhook/recipients`

Add recipient to whitelist (sends confirmation email).

**Request:**
```json
{
  "userId": "user123",
  "recipientEmail": "customer@example.com",
  "metadata": {
    "source": "signup_form",
    "subscribed_to": "newsletter"
  }
}
```

**Response:**
```json
{
  "success": true,
  "recipient": "customer@example.com",
  "status": "pending",
  "token": "abc123...",
  "expiresAt": "2025-10-27T12:00:00.000Z",
  "confirmationUrl": "https://api.example.com/api/gmail/webhook/confirm/abc123"
}
```

---

### Get Recipients

**GET** `/api/gmail/webhook/recipients/:userId`

Get all recipients for a user.

**Query Parameters:**
- `status` (optional): Filter by status (`pending`, `approved`, `rejected`)

**Response:**
```json
{
  "success": true,
  "recipients": [
    {
      "user_id": "user123",
      "recipient_email": "customer@example.com",
      "status": "approved",
      "confirmed_at": "2025-10-20T12:00:00.000Z",
      "bounce_count": "0",
      "spam_complaint": "false"
    }
  ],
  "count": 1
}
```

---

### Remove Recipient

**DELETE** `/api/gmail/webhook/recipients`

Remove recipient from whitelist.

**Request:**
```json
{
  "userId": "user123",
  "recipientEmail": "customer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recipient removed"
}
```

---

### Confirm Subscription

**GET/POST** `/api/gmail/webhook/confirm/:token`

Confirm email subscription (no authentication required).

**Response (Success):**
```html
<!DOCTYPE html>
<html>
  <body>
    <div class="success">✓ Email Confirmed</div>
    <div class="message">
      Your email address has been successfully confirmed.
    </div>
  </body>
</html>
```

**Response (Error):**
```html
<!DOCTYPE html>
<html>
  <body>
    <div class="error">✗ Confirmation Failed</div>
    <div class="message">
      Invalid or expired confirmation token
    </div>
  </body>
</html>
```

---

### Get User Status

**GET** `/api/gmail/webhook/status/:userId`

Get comprehensive status for a user.

**Response:**
```json
{
  "system": {
    "initialized": true,
    "poller": {
      "active": 3,
      "pollInterval": 60000
    },
    "smtp": {
      "provider": "gmail",
      "limits": {
        "daily": 500,
        "free": true
      }
    }
  },
  "user": {
    "userId": "user123",
    "rateLimits": {
      "hourly": {
        "current": 12,
        "limit": 50,
        "resetAt": "2025-10-20T13:00:00.000Z"
      },
      "daily": {
        "current": 143,
        "limit": 500,
        "resetAt": "2025-10-21T00:00:00.000Z"
      },
      "monthly": {
        "current": 2341,
        "limit": 10000,
        "resetAt": "2025-11-01T00:00:00.000Z"
      },
      "total": 2341
    },
    "whitelist": {
      "total": 15,
      "approved": 12,
      "pending": 3,
      "rejected": 0,
      "bounces": 2,
      "spamComplaints": 0
    },
    "reputation": {
      "score": 98,
      "status": "excellent",
      "bounces": 2,
      "spamComplaints": 0,
      "totalSends": 2341
    },
    "relayStats": {
      "total_relayed": 287,
      "successful": 285,
      "failed": 2,
      "last_relay": "2025-10-20T12:00:00Z"
    }
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

---

### Get Global Status

**GET** `/api/gmail/webhook/status`

Get global system status (no userId).

**Response:**
```json
{
  "system": {
    "initialized": true,
    "poller": { "active": 3 },
    "smtp": { "provider": "gmail" }
  },
  "global": {
    "rateLimits": {
      "hourly": {
        "current": 45,
        "limit": 100,
        "percentage": "45.0",
        "resetAt": "2025-10-20T13:00:00.000Z"
      },
      "daily": {
        "current": 287,
        "limit": 500,
        "percentage": "57.4",
        "resetAt": "2025-10-21T00:00:00.000Z"
      }
    }
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

---

### Send Test Email

**POST** `/api/gmail/webhook/test`

Send test email (bypasses whitelist).

**Request:**
```json
{
  "to": "test@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "abc123",
  "provider": "gmail"
}
```

---

### Health Check

**GET** `/api/gmail/webhook/health`

Check system health.

**Response (Healthy):**
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "smtp": true,
    "poller": true
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

**Response (Unhealthy):**
```json
{
  "status": "degraded",
  "checks": {
    "database": true,
    "smtp": false,
    "poller": true
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

---

### Record Bounce (Webhook)

**POST** `/api/gmail/webhook/bounce`

Record email bounce (webhook callback from SMTP provider).

Requires signature verification.

**Request:**
```json
{
  "userId": "user123",
  "recipientEmail": "bounced@example.com",
  "bounceType": "hard"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bounce recorded"
}
```

---

### Record Spam Complaint (Webhook)

**POST** `/api/gmail/webhook/spam`

Record spam complaint (webhook callback from SMTP provider).

Requires signature verification.

**Request:**
```json
{
  "userId": "user123",
  "recipientEmail": "complained@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Spam complaint recorded"
}
```

---

## JavaScript API (Gateway)

### Initialization

```javascript
const GmailGateway = require('./lib/gmail-gateway');

const gateway = new GmailGateway({
  spreadsheetId: process.env.GOOGLE_SHEETS_DB_ID,
  credentialsPath: './credentials.json',
  encryptionKey: process.env.ENCRYPTION_KEY,
  smtpProvider: 'gmail', // or 'brevo', 'mailersend'
  confirmationBaseUrl: 'https://example.com/api/gmail/webhook/confirm'
});

await gateway.init();
```

### Methods

#### `gateway.send(options)`

Send email with all security checks.

```javascript
const result = await gateway.send({
  userId: 'user123',
  from: 'noreply@calos.ai',
  to: 'customer@example.com',
  subject: 'Hello',
  text: 'Plain text',
  html: '<p>HTML</p>'
});

if (result.success) {
  console.log('Email sent:', result.messageId);
} else {
  console.error('Error:', result.error, result.code);
}
```

#### `gateway.addRecipient(userId, email, options)`

Add recipient to whitelist.

```javascript
const result = await gateway.addRecipient('user123', 'customer@example.com', {
  metadata: { source: 'signup' }
});

console.log('Confirmation URL:', result.confirmationUrl);
```

#### `gateway.confirmRecipient(token)`

Confirm recipient subscription.

```javascript
const result = await gateway.confirmRecipient('abc123...');

if (result.success) {
  console.log('Confirmed:', result.recipient);
}
```

#### `gateway.removeRecipient(userId, email)`

Remove recipient from whitelist.

```javascript
const success = await gateway.removeRecipient('user123', 'customer@example.com');
```

#### `gateway.getRecipients(userId, status)`

Get all recipients for a user.

```javascript
const recipients = await gateway.getRecipients('user123', 'approved');
```

#### `gateway.getStatus(userId)`

Get comprehensive status.

```javascript
// User status
const status = await gateway.getStatus('user123');

// Global status
const globalStatus = await gateway.getStatus();
```

#### `gateway.sendTest(email)`

Send test email.

```javascript
const result = await gateway.sendTest('test@example.com');
```

#### `gateway.healthCheck()`

Check system health.

```javascript
const health = await gateway.healthCheck();

if (health.status === 'healthy') {
  console.log('All systems operational');
}
```

#### `gateway.startPolling()`

Start polling Gmail for all users.

```javascript
await gateway.startPolling();
```

#### `gateway.stopPolling()`

Stop all polling.

```javascript
gateway.stopPolling();
```

#### `gateway.recordBounce(userId, email)`

Record email bounce.

```javascript
await gateway.recordBounce('user123', 'bounced@example.com');
```

#### `gateway.recordSpamComplaint(userId, email)`

Record spam complaint.

```javascript
await gateway.recordSpamComplaint('user123', 'complained@example.com');
```

---

## Rate Limiting

### User Limits (Default)

- **Hourly:** 50 emails
- **Daily:** 500 emails
- **Monthly:** 10,000 emails

### Recipient Limits

- **Daily:** 10 emails per recipient (prevents harassment)

### Global Limits

- **Hourly:** 100 emails (all users combined)
- **Daily:** 500 emails (matches free SMTP limits)

### Reset Times

- **Hourly:** Top of next hour
- **Daily:** Midnight UTC
- **Monthly:** 1st of month at midnight UTC

### Rate Limit Responses

When rate limit is exceeded:

```json
{
  "success": false,
  "error": "Rate limit exceeded: Hourly user limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "allowed": false,
  "reason": "Hourly user limit exceeded",
  "limit": 50,
  "current": 50,
  "resetAt": "2025-10-20T13:00:00.000Z"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_RECIPIENT` | No `to` field provided |
| `MISSING_SUBJECT` | No `subject` provided |
| `MISSING_BODY` | No `text` or `html` provided |
| `NOT_WHITELISTED` | Recipient not on approved whitelist |
| `RATE_LIMIT_EXCEEDED` | User or global rate limit exceeded |
| `REPUTATION_BLOCKED` | Sender blocked due to low reputation |
| `SEND_ERROR` | Error sending email via SMTP |
| `MISSING_API_KEY` | API key not provided |
| `INVALID_API_KEY` | API key is invalid |
| `MISSING_SIGNATURE` | Webhook signature not provided |
| `INVALID_SIGNATURE` | Webhook signature is invalid |
| `MISSING_USER_ID` | No `userId` provided |
| `MISSING_FIELDS` | Required fields missing |
| `ADD_RECIPIENT_ERROR` | Error adding recipient |
| `CONFIRM_ERROR` | Error confirming recipient |
| `STATUS_ERROR` | Error getting status |
| `TEST_ERROR` | Error sending test email |

---

## Security Best Practices

### 1. API Key Management

- **Never commit API keys to version control**
- Store in environment variables
- Rotate keys regularly
- Use different keys for dev/staging/production

```bash
# .env
GMAIL_WEBHOOK_API_KEY=your-secret-key-here
```

### 2. Webhook Signature Verification

Always verify webhooks from SMTP providers:

```javascript
const crypto = require('crypto');

function verifyWebhook(req) {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}
```

### 3. HTTPS Only

Always use HTTPS in production:

```javascript
if (process.env.NODE_ENV === 'production' && req.protocol !== 'https') {
  return res.redirect('https://' + req.hostname + req.url);
}
```

### 4. Rate Limiting

Implement additional rate limiting at the API gateway level:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/gmail/webhook', limiter);
```

### 5. Input Validation

Always validate and sanitize inputs:

```javascript
const { body, validationResult } = require('express-validator');

app.post('/api/gmail/webhook/send', [
  body('userId').isString().trim().escape(),
  body('to').isEmail().normalizeEmail(),
  body('subject').isString().trim(),
  body('text').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // ... proceed
});
```

### 6. Encryption

All OAuth tokens and secrets are encrypted using AES-256-GCM:

```javascript
const SimpleEncryption = require('./lib/simple-encryption');

const encryption = new SimpleEncryption(process.env.ENCRYPTION_KEY);
const encrypted = encryption.encrypt(sensitiveData);
```

---

## Examples

### Complete Send Flow

```javascript
const GmailGateway = require('./lib/gmail-gateway');

async function sendEmail() {
  const gateway = new GmailGateway();
  await gateway.init();

  // 1. Add recipient
  const addResult = await gateway.addRecipient('user123', 'customer@example.com');
  console.log('Confirmation URL:', addResult.confirmationUrl);

  // 2. User clicks confirmation link (handled by API endpoint)

  // 3. Send email
  const sendResult = await gateway.send({
    userId: 'user123',
    to: 'customer@example.com',
    subject: 'Welcome!',
    text: 'Thank you for subscribing.'
  });

  if (sendResult.success) {
    console.log('✓ Email sent:', sendResult.messageId);
  } else {
    console.error('✗ Error:', sendResult.error);
  }
}
```

### Monitoring System Health

```javascript
const GmailGateway = require('./lib/gmail-gateway');

async function monitorHealth() {
  const gateway = new GmailGateway();
  await gateway.init();

  setInterval(async () => {
    const health = await gateway.healthCheck();

    if (health.status !== 'healthy') {
      console.error('⚠️  System unhealthy:', health);
      // Send alert
    }

    const status = await gateway.getStatus();
    console.log('Global usage:', status.global.rateLimits);
  }, 60000); // Every minute
}
```

### Handling Webhooks

```javascript
const express = require('express');
const app = express();
const GmailGateway = require('./lib/gmail-gateway');

let gateway;

app.post('/webhooks/bounce', async (req, res) => {
  const { userId, recipientEmail, bounceType } = req.body;

  if (!gateway) {
    gateway = new GmailGateway();
    await gateway.init();
  }

  await gateway.recordBounce(userId, recipientEmail);

  res.json({ success: true });
});

app.post('/webhooks/spam', async (req, res) => {
  const { userId, recipientEmail } = req.body;

  if (!gateway) {
    gateway = new GmailGateway();
    await gateway.init();
  }

  await gateway.recordSpamComplaint(userId, recipientEmail);

  res.json({ success: true });
});
```

### Bulk Email Campaign

```javascript
const GmailGateway = require('./lib/gmail-gateway');

async function sendCampaign(userId, recipients, subject, body) {
  const gateway = new GmailGateway();
  await gateway.init();

  const results = {
    sent: 0,
    failed: 0,
    rateLimited: 0,
    notWhitelisted: 0
  };

  for (const recipient of recipients) {
    const result = await gateway.send({
      userId,
      to: recipient,
      subject,
      text: body
    });

    if (result.success) {
      results.sent++;
    } else if (result.code === 'RATE_LIMIT_EXCEEDED') {
      results.rateLimited++;
      console.log('Rate limited, waiting 1 hour...');
      await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
    } else if (result.code === 'NOT_WHITELISTED') {
      results.notWhitelisted++;
    } else {
      results.failed++;
    }

    // Delay between sends
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
```

---

## Support

For issues or questions:

- GitHub Issues: https://github.com/calos/agent-router/issues
- Discord: https://discord.gg/calos
- Docs: See `.claude/CLAUDE.md` for project-specific info

---

**Built with ❤️ by CALOS**

*Zero-cost email relay • AI routing • Community acquisition • All in one*
