Send a test email to: $ARGUMENTS

This tests your SMTP configuration without requiring whitelist approval.

**Usage:** `/project:gmail-send-test email@example.com`

**Quick Command:**

```bash
npm run gmail:test $ARGUMENTS
```

**Or Programmatically:**

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

const result = await gateway.sendTest('$ARGUMENTS');

if (result.success) {
  console.log(`✓ Test email sent successfully!`);
  console.log(`  Message ID: ${result.messageId}`);
  console.log(`  Provider: ${result.provider}`);
} else {
  console.error(`✗ Failed to send test email`);
  console.error(`  Error: ${result.error}`);
}
```

**What the test email contains:**
- Subject: "CALOS Test Email"
- From: Your configured FROM address
- Body: System info (provider, timestamp)
- Confirms SMTP is working

**Troubleshooting:**

If test fails:

1. **Gmail SMTP:**
   - Check you're using App Password (not regular password)
   - Enable 2FA first
   - Generate app password at: https://myaccount.google.com/apppasswords

2. **Brevo:**
   - Check API key is correct
   - Verify account is active
   - Get key at: brevo.com → Settings → SMTP & API

3. **MailerSend:**
   - Verify domain is confirmed
   - Check API key
   - Get key at: mailersend.com → Settings → SMTP

**Common Errors:**

- "Authentication failed" → Wrong credentials
- "Connection timeout" → Network/firewall issue
- "Rate limit exceeded" → Too many tests, wait a minute
