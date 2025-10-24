# @calos/email-sdk

**Zero-dependency email SDK for CALOS hosted email API**

Send emails from your app in 3 lines of code. No SMTP setup, no Gmail API, no dependencies.

## Features

✅ **Zero dependencies** - Uses built-in `fetch()`
✅ **Tiny footprint** - ~5KB total
✅ **TypeScript support** - Full type definitions
✅ **Double opt-in** - Built-in recipient management
✅ **Rate limiting** - Automatic abuse prevention
✅ **Free tier** - 100 emails/month free
✅ **Open source** - AGPLv3 core, MIT SDK
✅ **Self-hostable** - Run on your own servers

## Installation

```bash
npm install @calos/email-sdk
```

## Quick Start

```javascript
const calos = require('@calos/email-sdk');

// Send email (that's it!)
await calos.email.send({
  apiKey: 'your-api-key',
  to: 'customer@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up.'
});
```

## Get API Key

1. Visit https://calos.ai/email
2. Sign up (free tier: 100 emails/month)
3. Copy your API key

Or set environment variable:
```bash
export CALOS_API_KEY=your-api-key
```

## Usage

### Initialize Client

```javascript
const { createClient } = require('@calos/email-sdk');

const client = createClient({
  apiKey: 'your-api-key',
  // Optional:
  baseUrl: 'https://api.calos.ai',  // Custom API URL
  timeout: 30000                      // Request timeout (ms)
});
```

### Send Email

```javascript
const result = await client.send({
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Plain text email',

  // Optional:
  html: '<p>HTML email</p>',
  from: 'noreply@yourdomain.com',
  userId: 'user123'  // For multi-tenant apps
});

if (result.success) {
  console.log('Email sent!', result.messageId);
} else {
  console.error('Error:', result.error);
}
```

### Recipient Management

#### Add Recipient (Double Opt-in)

```javascript
// Add recipient - sends confirmation email
const result = await client.addRecipient('customer@example.com', {
  metadata: { source: 'signup_form' }
});

console.log('Confirmation URL:', result.confirmationUrl);
// User clicks link → recipient approved → can receive emails
```

#### Get Recipients

```javascript
// Get all recipients
const { recipients } = await client.getRecipients();

// Filter by status
const pending = await client.getRecipients({ status: 'pending' });
const approved = await client.getRecipients({ status: 'approved' });
```

#### Remove Recipient

```javascript
await client.removeRecipient('customer@example.com');
```

### Status & Monitoring

#### Get Status

```javascript
const status = await client.getStatus();

console.log('Rate limits:', status.user.rateLimits);
console.log('Whitelist:', status.user.whitelist);
console.log('Reputation:', status.user.reputation);
```

#### Health Check

```javascript
const health = await client.healthCheck();

if (health.status === 'healthy') {
  console.log('All systems operational');
}
```

#### Send Test Email

```javascript
await client.sendTest('test@example.com');
```

## Error Handling

```javascript
const { CalosError } = require('@calos/email-sdk');

try {
  await client.send({ to: 'test@example.com', subject: 'Hi', body: 'Test' });
} catch (error) {
  if (error instanceof CalosError) {
    console.error('Status:', error.statusCode);
    console.error('Code:', error.code);
    console.error('Message:', error.message);
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `MISSING_API_KEY` | API key not provided |
| `INVALID_API_KEY` | API key is invalid |
| `NOT_WHITELISTED` | Recipient not approved (use `addRecipient()` first) |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `REPUTATION_BLOCKED` | Sender blocked due to bounces/spam |
| `NETWORK_ERROR` | Network/connection issue |
| `TIMEOUT` | Request took too long |

## Environment Variables

```bash
# API Key
CALOS_API_KEY=your-api-key

# Custom API URL (optional)
CALOS_API_URL=https://api.calos.ai
```

## TypeScript

Full TypeScript support included:

```typescript
import { CalosEmailClient, SendEmailOptions } from '@calos/email-sdk';

const client = new CalosEmailClient({ apiKey: 'your-key' });

const options: SendEmailOptions = {
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test'
};

await client.send(options);
```

## Pricing

### Free Tier
- 100 emails/month
- Double opt-in
- Basic support
- **No credit card required**

### Pro ($10/month)
- 10,000 emails/month
- 2FA support
- Priority support
- Custom domain

### Enterprise ($50/month)
- Unlimited emails
- White-label
- SLA
- Dedicated support

[View pricing →](https://calos.ai/email/pricing)

## Examples

### Newsletter Signup

```javascript
const calos = require('@calos/email-sdk');

app.post('/signup', async (req, res) => {
  const { email } = req.body;

  // Add to whitelist (sends confirmation)
  const result = await calos.email.addRecipient(email);

  res.json({
    message: 'Check your email to confirm subscription',
    confirmationUrl: result.confirmationUrl
  });
});
```

### Welcome Email After Confirmation

```javascript
app.post('/webhooks/email-confirmed', async (req, res) => {
  const { email } = req.body;

  // Send welcome email
  await calos.email.send({
    apiKey: process.env.CALOS_API_KEY,
    to: email,
    subject: 'Welcome to CALOS!',
    html: '<h1>Thanks for confirming your email</h1>'
  });

  res.json({ success: true });
});
```

### Bulk Campaign

```javascript
const recipients = await client.getRecipients({ status: 'approved' });

for (const recipient of recipients.recipients) {
  await client.send({
    to: recipient.recipient_email,
    subject: 'Monthly Newsletter',
    body: 'Your monthly update...'
  });

  // Rate limiting handled automatically
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

## Self-Hosted Option

Want to run your own instance instead of using the cloud?

**Pros:**
- Full control
- No usage limits
- Free (except server costs)

**Cons:**
- You manage infrastructure
- You handle updates
- You configure Gmail/SMTP
- No premium features

### Quick Self-Host

```bash
# Clone repo
git clone https://github.com/calos/agent-router.git
cd agent-router

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run with Docker
docker-compose up -d

# Or run directly
npm install
npm start
```

### Use Self-Hosted API

```javascript
const { createClient } = require('@calos/email-sdk');

const client = createClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-domain.com'  // ← Your self-hosted instance
});

await client.send({
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test'
});
```

**Full documentation:** [Self-Hosting Guide](https://github.com/calos/agent-router/blob/main/deployment/DEPLOY.md)

## Support

- **Docs:** https://docs.calos.ai/email
- **Discord:** https://discord.gg/calos
- **Issues:** https://github.com/calos/agent-router/issues
- **Email:** support@calos.ai

## License

MIT

---

**Built with ❤️ by CALOS**

*Zero-dependency email • No SMTP setup • Just works*
