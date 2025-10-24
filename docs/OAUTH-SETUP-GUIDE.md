# OAuth Setup Guide

This guide walks you through getting OAuth credentials from Google, Microsoft, and GitHub to enable "Sign in with..." functionality.

## Google OAuth Setup

### 1. Go to Google Cloud Console
https://console.cloud.google.com/apis/credentials

### 2. Create a Project (if needed)
- Click "Select a project" → "New Project"
- Name: "Soulfra Platform" (or your app name)
- Click "Create"

### 3. Configure OAuth Consent Screen
- Go to "OAuth consent screen" in the left sidebar
- Select "External" (for public apps)
- Click "Create"

**Fill in required fields:**
- App name: `Soulfra Platform`
- User support email: Your email
- Developer contact: Your email
- Click "Save and Continue"

**Scopes:**
- Click "Add or Remove Scopes"
- Select:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive.readonly` (optional, for Drive access)
- Click "Update" → "Save and Continue"

**Test users (during development):**
- Add test email addresses (e.g., `lolztex@gmail.com`)
- Click "Save and Continue"

### 4. Create OAuth Client ID
- Go to "Credentials" in the left sidebar
- Click "Create Credentials" → "OAuth client ID"
- Application type: "Web application"
- Name: "Soulfra Web Client"

**Authorized redirect URIs:**
```
http://localhost:5001/api/auth/oauth/callback
https://soulfra.com/api/auth/oauth/callback
```

- Click "Create"
- Copy **Client ID** and **Client Secret**

### 5. Add to .env
```bash
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
```

---

## Microsoft OAuth Setup

### 1. Go to Azure Portal
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps

### 2. Register New Application
- Click "New registration"
- Name: `Soulfra Platform`
- Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
- Redirect URI:
  - Platform: Web
  - URI: `http://localhost:5001/api/auth/oauth/callback`
- Click "Register"

### 3. Get Application (Client) ID
- You'll see the **Application (client) ID** on the overview page
- Copy this value

### 4. Create Client Secret
- Go to "Certificates & secrets" in left sidebar
- Click "New client secret"
- Description: "Soulfra Web Client"
- Expires: 24 months (or custom)
- Click "Add"
- **Copy the secret value immediately** (you won't see it again!)

### 5. Configure API Permissions
- Go to "API permissions"
- Click "Add a permission"
- Select "Microsoft Graph"
- Choose "Delegated permissions"
- Add:
  - `openid`
  - `email`
  - `profile`
  - `User.Read`
  - `Files.Read` (for OneDrive access)
- Click "Add permissions"

### 6. Add Redirect URIs
- Go to "Authentication"
- Under "Platform configurations" → "Web" → "Redirect URIs"
- Add:
  - `http://localhost:5001/api/auth/oauth/callback`
  - `https://soulfra.com/api/auth/oauth/callback`
- Click "Save"

### 7. Add to .env
```bash
MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789abc
MICROSOFT_CLIENT_SECRET=abc~123def-456.ghi789
```

---

## GitHub OAuth Setup

### 1. Go to GitHub Developer Settings
https://github.com/settings/developers

### 2. Create OAuth App
- Click "New OAuth App"
- Application name: `Soulfra Platform`
- Homepage URL: `http://localhost:5001` (or `https://soulfra.com`)
- Application description: "Soulfra Platform authentication"
- Authorization callback URL: `http://localhost:5001/api/auth/oauth/callback`
- Click "Register application"

### 3. Get Client ID and Secret
- You'll see the **Client ID** immediately
- Click "Generate a new client secret"
- Copy the **Client secret** (you won't see it again!)

### 4. Add to .env
```bash
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=abc123def456ghi789jkl012mno345pqr678stu901
```

---

## iCloud OAuth Setup (Advanced)

**Note**: iCloud OAuth requires an Apple Developer account ($99/year).

### 1. Sign in to Apple Developer
https://developer.apple.com/account/

### 2. Register an App ID
- Go to "Certificates, Identifiers & Profiles"
- Click "Identifiers" → "+" button
- Select "App IDs" → "Continue"
- Type: "App"
- Description: "Soulfra Platform"
- Bundle ID: `com.soulfra.platform` (reverse domain notation)
- Capabilities: Check "Sign In with Apple"
- Click "Continue" → "Register"

### 3. Create a Services ID
- Go to "Identifiers" → "+" button
- Select "Services IDs" → "Continue"
- Description: "Soulfra Web Service"
- Identifier: `com.soulfra.platform.web`
- Check "Sign In with Apple"
- Click "Configure"

**Sign In with Apple Configuration:**
- Primary App ID: Select the App ID you created
- Domains: `soulfra.com` (or your domain)
- Return URLs: `https://soulfra.com/api/auth/oauth/callback`
- Click "Save" → "Continue" → "Register"

### 4. Create a Key
- Go to "Keys" → "+" button
- Key Name: "Soulfra Sign In with Apple Key"
- Check "Sign In with Apple"
- Click "Configure"
- Primary App ID: Select your App ID
- Click "Save" → "Continue" → "Register"
- Download the `.p8` key file (you can only download once!)
- Note the **Key ID**

### 5. Get Team ID
- Go to "Membership" in the left sidebar
- Copy your **Team ID**

### 6. Add to .env
```bash
ICLOUD_CLIENT_ID=com.soulfra.platform.web
ICLOUD_CLIENT_SECRET=/path/to/AuthKey_ABC123DEF4.p8
ICLOUD_TEAM_ID=ABC123DEF4
ICLOUD_KEY_ID=ABC123DEF4
```

**Note**: iCloud OAuth is more complex and requires additional server-side JWT signing. Consider starting with Google/Microsoft/GitHub first.

---

## Complete .env Configuration

Once you have all credentials, your `.env` should look like:

```bash
# OAuth Configuration
OAUTH_CALLBACK_URL=http://localhost:5001/api/auth/oauth/callback

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456

# Microsoft OAuth
MICROSOFT_CLIENT_ID=12345678-1234-1234-1234-123456789abc
MICROSOFT_CLIENT_SECRET=abc~123def-456.ghi789

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=abc123def456ghi789jkl012mno345pqr678stu901

# WebAuthn/Passkey Configuration
RP_NAME=Soulfra Platform
RP_ID=localhost
RP_ORIGIN=http://localhost:5001

# Security
OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

---

## Setup OAuth Providers in Database

After adding credentials to `.env`, run:

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
node lib/oauth-provider-setup.js setup
```

You should see:
```
✅ Configured Google (google)
✅ Configured Microsoft (microsoft)
✅ Configured GitHub (github)
```

---

## Test OAuth Flow

### 1. Start the server
```bash
npm start
```

### 2. Open the login page
```bash
open http://localhost:5001/oauth-login.html
```

### 3. Click "Continue with Google" (or Microsoft/GitHub)

### 4. Authorize on the provider's site

### 5. You should be redirected back to the dashboard

---

## Troubleshooting

### "Invalid redirect URI"
- Make sure the redirect URI in your `.env` matches **exactly** what you configured in the provider console
- Common mistake: Forgetting `/api/auth/oauth/callback` at the end

### "Access denied" or "Insufficient permissions"
- Check that you added all required scopes in the provider console
- For Google: Re-configure OAuth consent screen scopes
- For Microsoft: Re-add API permissions

### "Client authentication failed"
- Check that your Client ID and Client Secret are correct
- Make sure there are no extra spaces or quotes in `.env`

### "This app hasn't been verified" (Google)
- This is normal during development
- Click "Advanced" → "Go to Soulfra Platform (unsafe)"
- In production, you'll need to submit for verification

### "The redirect URI included is not valid" (Microsoft)
- Go back to Azure Portal → Authentication
- Make sure redirect URI is added under "Web" platform
- Click "Save"

---

## Production Deployment

When deploying to production:

### 1. Update Redirect URIs in Provider Consoles
- Change from `http://localhost:5001` to `https://soulfra.com`

### 2. Update .env
```bash
OAUTH_CALLBACK_URL=https://soulfra.com/api/auth/oauth/callback
RP_ID=soulfra.com
RP_ORIGIN=https://soulfra.com
```

### 3. Re-run Setup
```bash
node lib/oauth-provider-setup.js setup
```

### 4. Enable SSL/TLS
- Passkeys **require** HTTPS in production
- Use Let's Encrypt or Cloudflare for free SSL

### 5. Verify OAuth Flow
```bash
./test-oauth-passkey.sh
```

---

## Security Checklist

- [ ] OAuth credentials stored in `.env` (not committed to git)
- [ ] `OAUTH_ENCRYPTION_KEY` is 64-character random hex
- [ ] HTTPS enabled in production
- [ ] CORS configured to only allow your domains
- [ ] Rate limiting enabled on auth endpoints
- [ ] Session tokens have reasonable expiry (1 hour recommended)
- [ ] Refresh tokens rotate on use
- [ ] Audit logging enabled for all auth attempts

---

## Resources

- **Google OAuth**: https://developers.google.com/identity/protocols/oauth2
- **Microsoft OAuth**: https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
- **GitHub OAuth**: https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps
- **Apple Sign In**: https://developer.apple.com/sign-in-with-apple/
- **WebAuthn**: https://webauthn.guide/

---

**Last Updated**: 2025-10-20
