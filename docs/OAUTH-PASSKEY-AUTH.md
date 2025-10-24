# OAuth & Passkey Authentication System

## Overview

Soulfra Platform provides a comprehensive authentication system that combines:
1. **OAuth 2.0** - Sign in with Google, Microsoft, GitHub, iCloud
2. **WebAuthn/Passkeys** - Biometric authentication (FaceID, TouchID, Windows Hello)
3. **Encrypted Passthrough Architecture** - Store and proxy credentials securely

This architecture allows users to build businesses on major platforms (Google Workspace, Microsoft 365, iCloud) while maintaining an encrypted security layer through Soulfra servers.

## Architecture: "Old GitHub Model"

The system is inspired by the pre-Microsoft GitHub model where:
- Users authenticate with their provider (Google, Microsoft, etc.)
- Credentials are encrypted and stored in Soulfra's database
- Access to provider APIs is proxied through Soulfra
- End-to-end encryption protects user data
- Cross-platform sync works seamlessly

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│  ┌───────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │  OAuth    │  │  Passkey   │  │  Traditional Email/Pass  │  │
│  │  Login    │  │  (FaceID)  │  │                          │  │
│  └─────┬─────┘  └──────┬─────┘  └────────────┬─────────────┘  │
└────────┼────────────────┼─────────────────────┼────────────────┘
         │                │                     │
         ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Soulfra Platform (CalOS)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Authentication Router                       │  │
│  │  • /api/auth/oauth/*/authorize (OAuth 2.0 + PKCE)       │  │
│  │  • /api/auth/passkey/* (WebAuthn)                       │  │
│  │  • /api/auth/register, /api/auth/login                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Encrypted Credential Storage (Postgres)        │  │
│  │  • oauth_tokens (AES-256 encrypted)                     │  │
│  │  • biometric_credentials (device-stored keys)           │  │
│  │  • sessions (JWT tokens)                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            API Proxy Layer (Encrypted Passthrough)       │  │
│  │  • Decrypt tokens when proxying requests                │  │
│  │  • Rate limiting, logging, monitoring                   │  │
│  │  • Cross-domain SSO coordination                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬──────────────────┬───────────────────┬────────────┘
             │                  │                   │
             ▼                  ▼                   ▼
    ┌────────────────┐  ┌──────────────┐  ┌────────────────┐
    │  Google APIs   │  │ Microsoft 365│  │  GitHub/iCloud │
    │  (Drive, etc)  │  │  (OneDrive)  │  │                │
    └────────────────┘  └──────────────┘  └────────────────┘
```

## OAuth 2.0 Authentication

### Supported Providers

| Provider | Domain Detection | Scopes |
|----------|------------------|--------|
| **Google** | @gmail.com, @googlemail.com | Drive, Email, Profile |
| **Microsoft** | @outlook.com, @hotmail.com, @live.com | OneDrive, Email, Profile |
| **GitHub** | N/A (manual selection) | User, Email, Repos (read) |
| **iCloud** | @icloud.com, @me.com, @mac.com | Email, Name |

### OAuth Flow

```javascript
// 1. User clicks "Sign in with Google"
GET /api/auth/oauth/google/authorize

// 2. Redirects to Google with PKCE challenge
→ https://accounts.google.com/o/oauth2/v2/auth?
    client_id=...
    redirect_uri=http://localhost:5001/api/auth/oauth/callback
    response_type=code
    scope=openid+email+profile+https://www.googleapis.com/auth/drive.readonly
    state=encrypted_state_token
    code_challenge=SHA256(random_verifier)
    code_challenge_method=S256

// 3. User authorizes on Google

// 4. Google redirects back
GET /api/auth/oauth/callback?code=...&state=...

// 5. Exchange code for tokens (with PKCE verifier)
POST https://oauth2.googleapis.com/token
{
  code: "authorization_code",
  code_verifier: "random_verifier_from_step_2",
  grant_type: "authorization_code",
  redirect_uri: "http://localhost:5001/api/auth/oauth/callback"
}

// 6. Encrypt and store tokens
INSERT INTO oauth_tokens (
  user_id, provider_id,
  access_token, refresh_token, encrypted = true
)

// 7. Create Soulfra session
→ Set-Cookie: calos_session=jwt_token
→ Redirect to dashboard
```

### Security Features

1. **PKCE (Proof Key for Code Exchange)** - Prevents authorization code interception
2. **State Parameter Validation** - Prevents CSRF attacks
3. **Token Encryption** - AES-256-CBC encryption before database storage
4. **Scope Minimization** - Only request necessary permissions
5. **Token Rotation** - Refresh tokens when access tokens expire

### Configuration

Add OAuth credentials to `.env`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

Get credentials from:
- **Google**: https://console.cloud.google.com/apis/credentials
- **Microsoft**: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps
- **GitHub**: https://github.com/settings/developers

Then run:

```bash
node lib/oauth-provider-setup.js setup
```

## Passkey/WebAuthn Authentication

### What are Passkeys?

Passkeys are cryptographic credentials stored in your device's secure enclave:
- **iOS/macOS**: FaceID, TouchID
- **Android**: Fingerprint, Face Unlock
- **Windows**: Windows Hello (Face, Fingerprint, PIN)

**Benefits:**
- No passwords to remember or type
- Resistant to phishing (origin-bound)
- Never transmitted over network (only signatures)
- Syncs across devices via iCloud/Google Password Manager

### Passkey Registration Flow

```javascript
// 1. User clicks "Register Passkey"
POST /api/auth/passkey/register/options
{ email: "user@example.com" }

// 2. Server generates challenge
←─ {
  challenge: "random_32_bytes",
  rp: { name: "Soulfra", id: "localhost" },
  user: { id: "uuid", name: "user@example.com" },
  challengeId: "challenge_uuid"
}

// 3. Browser prompts for biometric
navigator.credentials.create({ publicKey: options })
→ User scans face/fingerprint

// 4. Device generates key pair
// Private key: Stored in secure enclave (never leaves device)
// Public key: Sent to server

// 5. Verify and store
POST /api/auth/passkey/register/verify
{
  challengeId: "challenge_uuid",
  credential: { id: "...", publicKey: "..." }
}

// 6. Success
←─ { success: true, credentialId: "..." }
```

### Passkey Authentication Flow

```javascript
// 1. User clicks "Sign in with Passkey"
POST /api/auth/passkey/authenticate/options
{ email: "user@example.com" } // Optional

// 2. Server generates auth challenge
←─ {
  challenge: "random_32_bytes",
  rpId: "localhost",
  allowCredentials: [{ type: "public-key", id: "cred_id" }],
  challengeId: "challenge_uuid"
}

// 3. Browser prompts for biometric
navigator.credentials.get({ publicKey: options })
→ User scans face/fingerprint

// 4. Device signs challenge with private key
// Signature proves:
//   - User has the private key (authentication)
//   - User is physically present (biometric check)
//   - Challenge is fresh (prevents replay)

// 5. Verify signature
POST /api/auth/passkey/authenticate/verify
{
  challengeId: "challenge_uuid",
  credential: {
    id: "cred_id",
    signature: "...",
    authenticatorData: "...",
    clientDataJSON: "..."
  }
}

// 6. Create session
←─ {
  success: true,
  token: "jwt_session_token",
  user: { userId: "...", email: "..." }
}
```

### Passkey API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/passkey/register/options` | POST | Generate registration options |
| `/api/auth/passkey/register/verify` | POST | Verify and save passkey |
| `/api/auth/passkey/authenticate/options` | POST | Generate auth options |
| `/api/auth/passkey/authenticate/verify` | POST | Verify passkey and sign in |
| `/api/auth/passkey/credentials` | GET | List user's passkeys (auth required) |
| `/api/auth/passkey/credentials/:id` | DELETE | Remove a passkey (auth required) |
| `/api/auth/passkey/check/:email` | GET | Check if user has passkey |

### Configuration

Add to `.env`:

```bash
# WebAuthn Configuration
RP_NAME=Soulfra Platform
RP_ID=localhost
RP_ORIGIN=http://localhost:5001
```

For production:
```bash
RP_ID=soulfra.com
RP_ORIGIN=https://soulfra.com
```

**Important**: `RP_ID` must match your domain. For local testing use `localhost`, for production use your actual domain without `https://`.

## Encrypted Passthrough Architecture

### How It Works

When a user authenticates via OAuth:

1. **Token Exchange**: Authorization code → Access + Refresh tokens
2. **Encryption**: Tokens encrypted with AES-256-CBC before storage
3. **Database Storage**: Encrypted tokens stored in `oauth_tokens` table
4. **Proxy Requests**: When user needs provider API access:
   - Decrypt tokens from database
   - Add `Authorization: Bearer {token}` header
   - Forward request to provider API
   - Return response to user
5. **Token Refresh**: When access token expires, use refresh token to get new one

### Database Schema

```sql
-- OAuth Tokens (Encrypted)
CREATE TABLE oauth_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  provider_id VARCHAR(50),
  access_token TEXT,  -- AES-256 encrypted
  refresh_token TEXT, -- AES-256 encrypted
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Biometric Credentials (Public keys only)
CREATE TABLE biometric_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  public_key TEXT, -- Stored on server (safe)
  counter INTEGER DEFAULT 0,
  device_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Biometric Challenges (Temporary, 5-minute TTL)
CREATE TABLE biometric_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  challenge TEXT,
  type VARCHAR(20), -- 'registration' or 'authentication'
  expires_at TIMESTAMPTZ
);
```

### Encryption Implementation

```javascript
const crypto = require('crypto');

// Encrypt token before storage
function encryptToken(token) {
  const encryptionKey = process.env.OAUTH_ENCRYPTION_KEY; // 32 bytes
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

// Decrypt token when needed
function decryptToken(encryptedToken) {
  const [ivHex, encrypted] = encryptedToken.split(':');
  const encryptionKey = process.env.OAUTH_ENCRYPTION_KEY;
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Example: Proxying Google Drive API

```javascript
// User wants to list Google Drive files
app.get('/api/drive/files', requireAuth, async (req, res) => {
  const userId = req.user.userId;

  // 1. Get encrypted OAuth token from database
  const result = await db.query(`
    SELECT access_token, expires_at, refresh_token
    FROM oauth_tokens
    WHERE user_id = $1 AND provider_id = 'google'
  `, [userId]);

  let { access_token, expires_at, refresh_token } = result.rows[0];

  // 2. Check if expired
  if (new Date() > expires_at) {
    // Refresh token
    access_token = await refreshGoogleToken(refresh_token);
  }

  // 3. Decrypt token
  const decryptedToken = decryptToken(access_token);

  // 4. Proxy request to Google
  const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    headers: {
      'Authorization': `Bearer ${decryptedToken}`
    }
  });

  // 5. Return response
  const files = await driveResponse.json();
  res.json(files);
});
```

## Frontend Integration

### Complete Login Page

A ready-to-use login page is available at `/oauth-login.html`:

```html
<!-- Features -->
✓ OAuth buttons (Google, Microsoft, GitHub, iCloud)
✓ Passkey/biometric authentication
✓ Auto-detection of available providers
✓ Email/password fallback
✓ Responsive design
✓ Error handling
```

### OAuth Login Button

```html
<a href="/api/auth/oauth/google/authorize"
   class="oauth-button">
  <svg><!-- Google icon --></svg>
  <span>Continue with Google</span>
</a>
```

### Passkey Login (JavaScript)

```javascript
async function loginWithPasskey() {
  // 1. Get authentication options
  const optionsRes = await fetch('/api/auth/passkey/authenticate/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const { options } = await optionsRes.json();

  // 2. Convert challenge to ArrayBuffer
  const publicKey = {
    ...options,
    challenge: base64urlDecode(options.challenge)
  };

  // 3. Prompt for biometric
  const credential = await navigator.credentials.get({ publicKey });

  // 4. Verify with server
  const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: options.challengeId,
      credential: {
        id: credential.id,
        signature: base64urlEncode(credential.response.signature),
        // ... other fields
      }
    })
  });

  const { token, user } = await verifyRes.json();

  // 5. Store session token
  localStorage.setItem('auth_token', token);

  // 6. Redirect to dashboard
  window.location.href = '/dashboard.html';
}
```

## Testing

### Test with RoughSparks Account

A test user is configured:
- **Email**: `lolztex@gmail.com`
- **User ID**: `e7dc083f-61de-4567-a5b6-b21ddb09cb2d`
- **Role**: Superadmin

### OAuth Setup Workflow

```bash
# 1. Configure providers
vim .env  # Add OAuth credentials

# 2. Run setup script
node lib/oauth-provider-setup.js setup

# 3. List configured providers
node lib/oauth-provider-setup.js list

# 4. Test specific provider
node lib/oauth-provider-setup.js test google

# 5. Start server
npm start

# 6. Open login page
open http://localhost:5001/oauth-login.html

# 7. Click "Continue with Google"
# 8. Authorize on Google
# 9. Should redirect to dashboard
```

### Passkey Testing

```bash
# 1. Ensure biometric device available
# iOS: FaceID or TouchID
# Android: Fingerprint
# Windows: Windows Hello
# macOS: TouchID

# 2. Open login page
open http://localhost:5001/oauth-login.html

# 3. Click "Sign in with Passkey"
# 4. First time: Will prompt to register
# 5. Subsequent times: Will authenticate directly

# 6. Check registered passkeys
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5001/api/auth/passkey/credentials
```

### Email Flow Testing

```bash
# 1. Register new user
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "username": "testuser"
  }'

# 2. Check console for verification email (EMAIL_PROVIDER=console)
# Look for: [EmailService] Email would be sent to: test@example.com

# 3. Register passkey for user
# Login first, then POST to /api/auth/passkey/register/options

# 4. Test OAuth
# Visit: http://localhost:5001/api/auth/oauth/google/authorize
```

## Security Best Practices

### Token Management

1. **Encryption Key Rotation**: Regularly rotate `OAUTH_ENCRYPTION_KEY`
2. **Token Expiration**: Enforce short-lived access tokens (1 hour)
3. **Refresh Token Limits**: Limit refresh token lifetime (90 days)
4. **Scope Minimization**: Only request necessary permissions

### Passkey Security

1. **Challenge Expiry**: Challenges expire after 5 minutes
2. **Counter Tracking**: Detect cloned authenticators via counter
3. **User Verification**: Always require biometric (userVerification: 'required')
4. **Origin Binding**: Credentials only work on registered domain

### General Security

1. **HTTPS Only** (in production)
2. **CORS Restrictions**: Limit allowed origins
3. **Rate Limiting**: Prevent brute force
4. **Audit Logging**: Log all auth attempts
5. **Session Management**: Short-lived JWTs, secure cookies

## Troubleshooting

### OAuth Issues

**Problem**: "Invalid redirect URI"
- Ensure `OAUTH_CALLBACK_URL` in `.env` matches provider config
- Check provider console (Google Cloud, Azure Portal)

**Problem**: "Insufficient scopes"
- Add required scopes to provider config in `oauth-provider-setup.js`
- Re-run setup script

### Passkey Issues

**Problem**: "Passkeys not supported"
- Check browser: Chrome 109+, Safari 16+, Edge 109+
- Ensure HTTPS (or localhost for testing)

**Problem**: "User verification failed"
- Ensure biometric enrolled on device
- Check device settings (FaceID/TouchID/Windows Hello enabled)

**Problem**: "Invalid RP ID"
- For localhost: Use `RP_ID=localhost` (no port)
- For production: Use domain without protocol (`soulfra.com`)

### Database Issues

**Problem**: "biometric_credentials table does not exist"
- Run migration: `psql -d calos -f migrations/create_biometric_tables.sql`

**Problem**: "Encryption key not set"
- Add to `.env`: `OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)`

## Production Deployment

### Environment Variables

```bash
# OAuth
GOOGLE_CLIENT_ID=prod-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=prod-secret
OAUTH_CALLBACK_URL=https://soulfra.com/api/auth/oauth/callback

# WebAuthn
RP_NAME=Soulfra Platform
RP_ID=soulfra.com
RP_ORIGIN=https://soulfra.com

# Security
OAUTH_ENCRYPTION_KEY=<64-char-hex-key>
SESSION_SECRET=<random-secret>

# Email (for verification)
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=SG.your-api-key
BASE_URL=https://soulfra.com
```

### SSL/TLS Configuration

Passkeys **require** HTTPS in production (localhost exception for testing).

### Database Backups

Encrypt backups since they contain encrypted OAuth tokens.

### Monitoring

Monitor:
- OAuth success/failure rates
- Token refresh failures
- Passkey registration/auth rates
- API proxy latency

## References

- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [WebAuthn W3C Spec](https://www.w3.org/TR/webauthn-2/)
- [Passkeys.dev](https://passkeys.dev/)
- [Google OAuth Docs](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft OAuth Docs](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)

---

**Created**: 2025-10-20
**Last Updated**: 2025-10-20
**Version**: 1.0.0
