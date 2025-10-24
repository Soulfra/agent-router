Add a recipient to the whitelist: $ARGUMENTS

Expected format: `/project:gmail-add-recipient [userId] [email]`

Example: `/project:gmail-add-recipient user123 customer@example.com`

This will:
1. Add recipient to whitelist with status "pending"
2. Send double opt-in confirmation email to recipient
3. Recipient receives email with confirmation link
4. Recipient clicks link to approve
5. Status changes to "approved"
6. Now emails can be relayed to this recipient

**Code Example:**

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

const result = await gateway.addRecipient('$ARGUMENTS'.split(' ')[0], '$ARGUMENTS'.split(' ')[1]);

if (result.success) {
  console.log(`✓ Confirmation email sent to ${result.recipient}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Expires: ${result.expiresAt}`);
  console.log(`  Confirmation URL: ${result.confirmationUrl}`);
} else {
  console.error(`✗ Error: ${result.error}`);
}
```

**Security:**
- Max 20 pending confirmations per user
- Max 100 total recipients per user
- Confirmations expire after 7 days
- Recipients can be resent confirmation if needed

**Anti-Spam:**
- Recipient MUST click confirmation link
- Can't send until approved
- 35% better open rates with double opt-in
- Protects sender reputation
