Run the Gmail webhook setup wizard:

```bash
cd agent-router
npm run gmail:setup:free
```

This interactive wizard will guide you through:

1. **Google Sheets Setup**
   - Create new Google Spreadsheet
   - Share with service account
   - Copy Spreadsheet ID

2. **SMTP Provider Selection**
   - Gmail (500 emails/day)
   - Brevo (300 emails/day)
   - MailerSend (3,000 emails/month)

3. **Encryption Key Generation**
   - Generates secure 32-byte key
   - Stores in `.env.gmail-free`

4. **OAuth Configuration**
   - Google Client ID/Secret
   - Redirect URI setup

5. **First User Configuration**
   - Gmail account to relay from
   - Custom From address
   - Relay rules (optional)

The wizard creates `.env.gmail-free` with all settings.

After setup, you can:
- Start polling: `npm run gmail:poll`
- Send test: `npm run gmail:test your@email.com`
- Add recipients: `/project:gmail-add-recipient`
