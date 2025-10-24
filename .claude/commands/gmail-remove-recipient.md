Remove a recipient from the whitelist: $ARGUMENTS

Expected format: `/project:gmail-remove-recipient [userId] [email]`

Example: `/project:gmail-remove-recipient user123 customer@example.com`

**Code:**

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

const [userId, email] = '$ARGUMENTS'.split(' ');

const success = await gateway.removeRecipient(userId, email);

if (success) {
  console.log(`✓ Removed ${email} from whitelist for user ${userId}`);
  console.log(`  Status: Deleted`);
  console.log(`  Future emails to this recipient will be blocked`);
} else {
  console.error(`✗ Failed to remove recipient`);
}
```

**What happens:**
1. Recipient removed from whitelist database
2. Can no longer receive relayed emails
3. If they were pending, confirmation link becomes invalid
4. If they were approved, future sends will fail with "not whitelisted"

**To re-add:**
Use `/project:gmail-add-recipient` - they'll need to confirm again.

**Use cases:**
- Recipient unsubscribed
- Bouncing emails (bad address)
- Spam complaints
- No longer relevant

**Note:** This doesn't send any notification to the recipient. If you want to inform them, send a farewell email first.
