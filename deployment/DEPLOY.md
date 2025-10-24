# Deployment Guide: CALOS Email API

Deploy your own hosted email API in under 10 minutes.

## Quick Deploy Options

### Option 1: Render.com (Recommended - Easiest)

**Cost:** Free ($0/month, 750 hours)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add CALOS Email API"
   git push
   ```

2. **Connect to Render**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Render automatically detects `render.yaml`

3. **Add Environment Variables**
   In Render dashboard, add:
   ```
   GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
   GOOGLE_SHEETS_CREDENTIALS_PATH=./credentials.json
   ENCRYPTION_KEY=your-32-char-encryption-key
   FREE_SMTP_PROVIDER=gmail
   GMAIL_SMTP_USER=you@gmail.com
   GMAIL_APP_PASSWORD=your_app_password
   ADMIN_SECRET=your-admin-secret
   CONFIRMATION_URL=https://your-app.onrender.com/api/gmail/webhook/confirm
   ```

4. **Deploy!**
   - Click "Create Web Service"
   - Render builds and deploys automatically
   - Your API is live at: `https://your-app.onrender.com`

---

### Option 2: Railway.app

**Cost:** $5/month credit (effectively free for small apps)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login**
   ```bash
   railway login
   ```

3. **Deploy**
   ```bash
   railway up
   ```

4. **Add Environment Variables**
   ```bash
   railway variables set GOOGLE_SHEETS_DB_ID=your_id
   railway variables set ENCRYPTION_KEY=your_key
   # ... (add all vars from above)
   ```

5. **Get URL**
   ```bash
   railway domain
   ```

---

### Option 3: Docker (Self-hosted)

**Cost:** Depends on hosting (DigitalOcean, AWS, etc.)

1. **Build Image**
   ```bash
   docker build -t calos-email-api .
   ```

2. **Create `.env` file**
   ```env
   GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
   ENCRYPTION_KEY=your-32-char-key
   # ... (all environment variables)
   ```

3. **Run Container**
   ```bash
   docker run -p 3000:3000 --env-file .env calos-email-api
   ```

4. **Production (with Docker Compose)**
   ```yaml
   version: '3'
   services:
     email-api:
       build: .
       ports:
         - "3000:3000"
       env_file:
         - .env
       restart: unless-stopped
   ```

   ```bash
   docker-compose up -d
   ```

---

## Environment Variables

### Required

```bash
# Google Sheets Database
GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
GOOGLE_SHEETS_CREDENTIALS_PATH=./credentials.json

# Encryption (for OAuth tokens)
ENCRYPTION_KEY=your-32-char-encryption-key-abc123

# SMTP Provider
FREE_SMTP_PROVIDER=gmail  # or brevo, mailersend

# Gmail SMTP (if using Gmail)
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password

# Admin Access
ADMIN_SECRET=your-secret-for-creating-api-keys

# Confirmation URL
CONFIRMATION_URL=https://your-domain.com/api/gmail/webhook/confirm
```

### Optional

```bash
# Port (default: 3000)
PORT=3000

# Node environment
NODE_ENV=production

# CORS origin
CORS_ORIGIN=*

# Email from address
EMAIL_FROM_ADDRESS=noreply@calos.ai
```

---

## Setup Google Sheets Database

1. **Create Google Sheet**
   - Go to [sheets.google.com](https://sheets.google.com)
   - Create new spreadsheet
   - Copy spreadsheet ID from URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

2. **Enable Google Sheets API**
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Create project (or use existing)
   - Enable "Google Sheets API"
   - Create service account
   - Download credentials JSON
   - Share spreadsheet with service account email

3. **Set Environment Variable**
   ```bash
   GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
   GOOGLE_SHEETS_CREDENTIALS_PATH=./credentials.json
   ```

---

## Setup Gmail SMTP

### Option 1: Gmail (500 emails/day free)

1. **Enable 2FA**
   - Go to [myaccount.google.com](https://myaccount.google.com)
   - Security → 2-Step Verification

2. **Generate App Password**
   - Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Create app password for "Mail"
   - Copy 16-character password

3. **Set Environment Variables**
   ```bash
   FREE_SMTP_PROVIDER=gmail
   GMAIL_SMTP_USER=you@gmail.com
   GMAIL_APP_PASSWORD=your_16_char_password
   ```

### Option 2: Brevo (300 emails/day free)

1. Sign up at [brevo.com](https://brevo.com)
2. Get SMTP credentials
3. Set environment variables

### Option 3: MailerSend (3000 emails/month free)

1. Sign up at [mailersend.com](https://mailersend.com)
2. Verify domain
3. Get API key

---

## First-Time Setup

### 1. Deploy the API

Follow one of the deploy options above.

### 2. Create Your First API Key

```bash
curl -X POST https://your-app.onrender.com/api/gmail/webhook/keys \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "tier": "free",
    "adminSecret": "your-admin-secret"
  }'
```

Response:
```json
{
  "success": true,
  "apiKey": "calos_abc123...",
  "userId": "your-user-id",
  "tier": "free",
  "message": "Save this key - it will not be shown again"
}
```

**⚠️ SAVE THIS KEY!** You won't see it again.

### 3. Test Your API

```bash
# Send test email
curl -X POST https://your-app.onrender.com/api/gmail/webhook/test \
  -H "X-API-Key: calos_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com"}'
```

### 4. Use the SDK

```bash
npm install @calos/email-sdk
```

```javascript
const calos = require('@calos/email-sdk');

await calos.email.send({
  apiKey: 'calos_abc123...',
  to: 'customer@example.com',
  subject: 'Hello',
  body: 'Test email'
});
```

---

## Monitoring

### Health Check

```bash
curl https://your-app.onrender.com/api/gmail/webhook/health
```

### Status

```bash
curl https://your-app.onrender.com/api/gmail/webhook/status \
  -H "X-API-Key: your-key"
```

### Logs

**Render:**
- Go to dashboard → Logs tab

**Railway:**
```bash
railway logs
```

**Docker:**
```bash
docker logs calos-email-api
```

---

## Scaling

### Free Tier Limits

- **Render:** 750 hours/month, sleeps after 15min inactivity
- **Railway:** $5/month credit (covers small apps)
- **Gmail SMTP:** 500 emails/day
- **Brevo:** 300 emails/day

### Upgrade Options

**Render:**
- Starter: $7/month (no sleep)
- Standard: $25/month (more resources)

**Railway:**
- Pay per usage (starts at $5/month credit)

**SMTP:**
- SendGrid: $19.95/month (40k emails)
- Mailgun: $35/month (50k emails)

---

## Troubleshooting

### API Not Responding

1. Check health endpoint:
   ```bash
   curl https://your-app.onrender.com/api/gmail/webhook/health
   ```

2. Check logs for errors

3. Verify environment variables are set

### Emails Not Sending

1. Check SMTP credentials
2. Verify recipient is whitelisted:
   ```bash
   curl https://your-app.onrender.com/api/gmail/webhook/recipients/your-user-id \
     -H "X-API-Key: your-key"
   ```

3. Check rate limits:
   ```bash
   curl https://your-app.onrender.com/api/gmail/webhook/status/your-user-id \
     -H "X-API-Key: your-key"
   ```

### Google Sheets Errors

1. Verify service account has access to sheet
2. Check credentials path is correct
3. Ensure Sheets API is enabled

---

## Security Best Practices

1. **Never commit secrets to Git**
   ```bash
   # Add to .gitignore
   .env
   credentials.json
   ```

2. **Rotate API keys regularly**
   ```bash
   # Create new key
   curl -X POST .../keys -d '{"userId":"user","tier":"free","adminSecret":"..."}'

   # Update apps to use new key

   # Revoke old key (TODO: implement revoke endpoint)
   ```

3. **Use HTTPS only**
   - Render and Railway provide HTTPS automatically

4. **Limit CORS**
   ```bash
   CORS_ORIGIN=https://yourdomain.com
   ```

5. **Monitor usage**
   - Check logs regularly
   - Set up alerts for errors

---

## Support

- **Documentation:** https://docs.calos.ai/email
- **Discord:** https://discord.gg/calos
- **Issues:** https://github.com/calos/agent-router/issues

---

**🚀 Ready to deploy!**
