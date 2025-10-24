# Authentication For Everyone

**From 5-Year-Olds to Enterprise Engineers**

This guide explains how to log in, starting super simple and progressively revealing how security works under the hood.

---

## 👶 Level 1: I'm 5 Years Old

### How to Log In

**Step 1:** Click the big button
**Step 2:** You're in!

```
┌─────────────────────────┐
│                         │
│   [Sign In with 😊]    │
│                         │
└─────────────────────────┘
```

**That's it!**

The button knows who you are because:
- Your phone remembers you (like how it knows your face)
- OR you click a button for Twitter/GitHub
- OR you scan a QR code

**Why this is safe:** Your device has a secret key that only IT knows. Like a fingerprint that can't be copied.

---

## 🧒 Level 2: I'm 10 Years Old

### What Are My Options?

You have **3 ways** to log in:

#### Option 1: Use Your Face/Fingerprint (Passkey)
```
Your Phone Says: "Is this you?" 👋
You: *Look at phone* 👁️
Phone: "Yep, it's you!" ✓
Website: "Welcome back!"
```

**Why it's safe:**
- Your face/fingerprint never leaves your phone
- The phone just says "yes" or "no" to the website
- Nobody can steal your face!

#### Option 2: Click a Social Button
```
[Sign in with Twitter]  → Twitter says "This is @roughsparks"
[Sign in with GitHub]   → GitHub says "This is @roughsparks"
[Sign in with Discord]  → Discord says "This is @roughsparks"
```

**Why it's safe:**
- You're using accounts you already trust
- The website doesn't get your password
- You can revoke access anytime

#### Option 3: Scan a QR Code
```
Your Phone Camera:
┌───────────┐
│ █ ▄ █   ▀ │  ← Scan this
│   ▀ ▄ █ █ │
│ █ █   ▄ ▀ │
└───────────┘

*Beep!* → Logged in on computer
```

**Why it's safe:**
- The QR code is a one-time secret
- Only works for 60 seconds
- Your phone confirms it's you

---

## 🎓 Level 3: I'm 15 Years Old (Add Extra Protection)

### What is 2FA (Two-Factor Authentication)?

**2FA = Two ways to prove it's you**

#### Without 2FA (Less Safe):
```
1. Username + Password = You're in
   ❌ Problem: If someone steals your password, they're in too!
```

#### With 2FA (More Safe):
```
1. Username + Password
2. PLUS a 6-digit code from your phone
   ✅ Now even if someone steals your password, they can't get in!
```

### How to Set Up 2FA

**Step 1:** Turn on 2FA in settings
**Step 2:** Scan a QR code with your authenticator app
**Step 3:** Enter the 6-digit code to confirm

```
Authenticator App Shows:
┌──────────────┐
│  Soulfra     │
│   472 951    │  ← Changes every 30 seconds
│  ●●●●●○      │  ← Time left
└──────────────┘
```

**From now on:**
- Log in with password → Get code from phone → Enter code → You're in!

**Backup Codes:**
You'll get 10 special codes to save. If you lose your phone, use one of these to get back in.

---

## 🧑‍💻 Level 4: I'm 20 Years Old (How It Actually Works)

### OAuth Flow (Social Login)

When you click "Sign in with Twitter," here's what happens:

```
YOU                    YOUR APP              TWITTER
 │                         │                    │
 │  1. Click Twitter btn   │                    │
 │────────────────────────>│                    │
 │                         │                    │
 │                         │  2. Redirect       │
 │                         │─────────────────────>
 │                         │                    │
 │  3. "Allow Soulfra      │                    │
 │      to see your        │                    │
 │      Twitter profile?"  │                    │
 │<─────────────────────────────────────────────│
 │                         │                    │
 │  4. Click "Allow"       │                    │
 │─────────────────────────────────────────────>│
 │                         │                    │
 │                         │  5. Auth code      │
 │                         │<─────────────────────
 │                         │                    │
 │                         │  6. Exchange code  │
 │                         │     for token      │
 │                         │─────────────────────>
 │                         │                    │
 │                         │  7. Access token   │
 │                         │<─────────────────────
 │                         │                    │
 │  8. Logged in as        │                    │
 │      @roughsparks       │                    │
 │<────────────────────────│                    │
```

#### Key Concepts:

**Authorization Code:** A one-time code Twitter gives you (expires in ~60 seconds)

**Access Token:** A key that lets the app access your Twitter profile
- Like a temporary visitor badge
- Can be revoked anytime

**PKCE (Proof Key for Code Exchange):**
Extra security to prevent token theft:
1. App generates random `code_verifier`
2. Hashes it to create `code_challenge`
3. Sends `code_challenge` to Twitter
4. When exchanging code, must provide original `code_verifier`
5. Twitter checks: `hash(code_verifier) === code_challenge`

**Why PKCE matters:** Even if someone steals the authorization code, they can't use it without the `code_verifier`.

### Passkey Flow (WebAuthn)

```
YOU                    YOUR APP              YOUR DEVICE
 │                         │                      │
 │  1. Click "Sign In"     │                      │
 │────────────────────────>│                      │
 │                         │                      │
 │                         │  2. Challenge        │
 │                         │       (random data)  │
 │                         │─────────────────────>│
 │                         │                      │
 │  3. "Scan face          │                      │
 │      to sign in"        │                      │
 │<────────────────────────────────────────────────│
 │                         │                      │
 │  4. *Scan face*         │                      │
 │─────────────────────────────────────────────────>
 │                         │                      │
 │                         │  5. Signed challenge │
 │                         │      (proof it's you)│
 │                         │<─────────────────────│
 │                         │                      │
 │  6. Verify signature    │                      │
 │      ✓ Logged in!       │                      │
 │<────────────────────────│                      │
```

**What your device does:**
1. Stores a **private key** in secure hardware (Secure Enclave/TPM)
2. Never reveals the private key (not even to the operating system!)
3. Signs the challenge with the private key
4. App verifies signature with the **public key**

**Math behind it (simplified):**
```javascript
// Registration
privateKey = device.generateKey()  // Stored in secure hardware
publicKey = derive(privateKey)     // Sent to server

// Login
challenge = server.generateRandom()
signature = device.sign(challenge, privateKey)  // Biometric required!
verified = server.verify(signature, publicKey, challenge)
```

### 2FA Flow (TOTP - Time-based One-Time Password)

```
Setup Phase:
┌─────────────┐         ┌──────────────┐
│   Server    │         │  Your Phone  │
│             │  QR Code│              │
│  Secret Key │────────>│  Scan        │
│  x7k9p2... │         │  Secret Key  │
│             │         │  x7k9p2...   │
└─────────────┘         └──────────────┘

Login Phase:
┌─────────────┐         ┌──────────────┐
│   Server    │         │  Your Phone  │
│             │         │              │
│ TOTP(key,   │         │ TOTP(key,    │
│  timestamp) │         │  timestamp)  │
│  = 472951   │    ?    │  = 472951    │
│             │<────────│  Type code   │
│  ✓ Match!   │         │              │
└─────────────┘         └──────────────┘
```

**The TOTP Algorithm:**
```python
# Both server and phone do this:
import hmac
import time

def generate_totp(secret_key):
    # Get current 30-second time window
    time_step = int(time.time() / 30)

    # Generate HMAC-SHA1 hash
    hash = hmac.new(secret_key, time_step, 'sha1')

    # Extract 6 digits
    offset = hash[-1] & 0x0F
    code = (hash[offset:offset+4] & 0x7FFFFFFF) % 1000000

    return str(code).zfill(6)  # Pad with zeros: "000123"

# Server and phone generate same code because:
# - They share the secret key
# - They use the same timestamp (±30 seconds tolerance)
```

**Why it works:**
- Both sides have the same secret
- Both use the current time
- Codes change every 30 seconds
- Old codes can't be reused

---

## 🏢 Level 5: I'm an Enterprise Engineer

### Security Architecture

#### Authentication Stack

```
┌─────────────────────────────────────────┐
│         CLIENT (Browser/Mobile)         │
├─────────────────────────────────────────┤
│  • WebAuthn Level 2 (FIDO2)            │
│  • OAuth 2.0 + PKCE (RFC 7636)         │
│  • TOTP (RFC 6238)                     │
│  • Session cookies (HttpOnly, Secure)  │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│      API LAYER (FastAPI/Express)        │
├─────────────────────────────────────────┤
│  • BiometricAuth.js (WebAuthn)         │
│  • SocialAuth.js (OAuth 2.0)           │
│  • TwoFactorAuth.js (TOTP)             │
│  • Session management (30-day expiry)  │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│       DATABASE (PostgreSQL/SQLite)      │
├─────────────────────────────────────────┤
│  • Users (external_id, provider)       │
│  • Sessions (session_id, expires_at)   │
│  • Passkeys (credential_id, pub_key)   │
│  • TwoFactor (encrypted_secret)        │
│  • Activity (login tracking)           │
└─────────────────────────────────────────┘
```

### OAuth 2.0 Implementation

#### Supported Providers

| Provider | OAuth Version | Scopes | Special Features |
|----------|---------------|--------|------------------|
| Twitter/X | OAuth 2.0 | `tweet.read users.read` | PKCE required, no email |
| GitHub | OAuth 2.0 | `read:user user:email` | Repo access for expertise |
| Discord | OAuth 2.0 | `identify email guilds` | Guild/role integration |
| LinkedIn | OAuth 2.0 | `r_liteprofile r_emailaddress` | Professional network |

#### PKCE Implementation (RFC 7636)

```javascript
// Code Challenge Generation
function generatePKCE() {
  // 1. Generate code verifier (43-128 characters)
  const codeVerifier = base64url(crypto.randomBytes(32))

  // 2. Generate code challenge (SHA-256 hash)
  const codeChallenge = base64url(
    crypto.createHash('sha256')
      .update(codeVerifier)
      .digest()
  )

  return { codeVerifier, codeChallenge }
}

// Authorization Request
const authUrl = `https://twitter.com/i/oauth2/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${CALLBACK_URL}&` +
  `response_type=code&` +
  `scope=tweet.read%20users.read&` +
  `state=${STATE}&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256`

// Token Exchange (after callback)
const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: authorizationCode,
    grant_type: 'authorization_code',
    redirect_uri: CALLBACK_URL,
    code_verifier: codeVerifier  // ← Must match!
  })
})
```

### WebAuthn Implementation

#### Registration Options

```javascript
const publicKeyCredentialCreationOptions = {
  challenge: crypto.randomBytes(32),
  rp: {
    name: "Soulfra Network",
    id: "soulfra.com"  // Must match domain
  },
  user: {
    id: Uint8Array.from(userId, c => c.charCodeAt(0)),
    name: "user@example.com",
    displayName: "User Name"
  },
  pubKeyCredParams: [
    { alg: -7, type: "public-key" },   // ES256
    { alg: -257, type: "public-key" }  // RS256
  ],
  authenticatorSelection: {
    authenticatorAttachment: "platform",  // Require built-in (FaceID/TouchID)
    requireResidentKey: false,
    userVerification: "required"  // Biometric required
  },
  timeout: 60000,
  attestation: "none"  // Don't verify authenticator model
}
```

#### Authentication Verification

```javascript
async function verifyAssertion(credential, challenge, storedPublicKey) {
  // 1. Verify challenge matches
  const clientData = JSON.parse(
    base64url.decode(credential.response.clientDataJSON)
  )
  if (clientData.challenge !== challenge) {
    throw new Error('Challenge mismatch')
  }

  // 2. Verify origin
  if (clientData.origin !== 'https://soulfra.com') {
    throw new Error('Origin mismatch')
  }

  // 3. Verify signature
  const authData = credential.response.authenticatorData
  const signature = credential.response.signature

  const signedData = Buffer.concat([
    authData,
    crypto.createHash('sha256').update(clientData).digest()
  ])

  const verified = crypto.verify(
    'sha256',
    signedData,
    storedPublicKey,
    signature
  )

  if (!verified) {
    throw new Error('Signature verification failed')
  }

  // 4. Check counter (prevent replay attacks)
  const counter = authData.readUInt32BE(33)
  if (counter <= storedCounter) {
    throw new Error('Cloned authenticator detected')
  }

  return true
}
```

### Security Features

#### Session Management

```javascript
// Create session (30-day expiry)
const session = {
  sessionId: crypto.randomBytes(32).toString('hex'),
  userId: user.userId,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
}

// Set HTTP-only cookie
res.cookie('session_id', session.sessionId, {
  httpOnly: true,        // No JavaScript access
  secure: true,          // HTTPS only
  sameSite: 'strict',    // CSRF protection
  maxAge: 30 * 24 * 60 * 60 * 1000
})
```

#### Rate Limiting

```javascript
// 2FA verification: 5 attempts per 15 minutes
const rateLimiter = {
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many failed attempts. Try again in 15 minutes.'
}

// OAuth callback: 10 per minute per IP
const oauthLimiter = {
  windowMs: 60 * 1000,
  max: 10
}
```

#### Encryption at Rest

```javascript
// Encrypt 2FA secrets with AES-256-GCM
function encryptSecret(secret, masterKey) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)

  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  }
}
```

### API Reference

#### Endpoints

```
POST   /auth/register/passkey          - Register new passkey
POST   /auth/login/passkey              - Login with passkey
GET    /auth/:provider                  - Initiate OAuth flow
GET    /auth/callback/:provider         - OAuth callback
POST   /auth/2fa/setup                  - Setup 2FA
POST   /auth/2fa/verify                 - Verify 2FA code
GET    /auth/me                         - Get current user
POST   /auth/logout                     - Logout
GET    /auth/sessions                   - List active sessions
DELETE /auth/sessions/:sessionId        - Revoke session
```

#### Example: OAuth Login Flow

```bash
# 1. Get authorization URL
curl https://api.soulfra.com/auth/twitter?redirect=/dashboard

# Response: Redirect URL
{
  "authUrl": "https://twitter.com/i/oauth2/authorize?client_id=..."
}

# 2. User authorizes → Twitter redirects to callback
GET /auth/callback/twitter?code=xxx&state=yyy

# 3. Server exchanges code for token, creates session
{
  "success": true,
  "user": {
    "userId": "user_abc123",
    "username": "roughsparks",
    "provider": "twitter",
    "vanitySubdomain": "roughsparks.soulfra.com"
  },
  "session": {
    "sessionId": "sess_xyz789",
    "expiresAt": "2025-11-21T00:00:00Z"
  }
}
```

### Compliance & Standards

#### Implemented RFCs

- **RFC 6749**: OAuth 2.0 Authorization Framework
- **RFC 7636**: PKCE for OAuth Public Clients
- **RFC 6238**: TOTP Algorithm
- **RFC 8705**: OAuth 2.0 Mutual-TLS Client Authentication

#### WebAuthn Level 2

- Supports platform authenticators (FaceID, TouchID, Windows Hello)
- User verification required
- Resident keys optional (for usernameless login)
- Attestation: "none" (privacy-preserving)

#### Security Audit Checklist

- [x] HTTPS enforced in production
- [x] HTTP-only, Secure cookies
- [x] CSRF protection (SameSite=strict)
- [x] Rate limiting on auth endpoints
- [x] Secrets encrypted at rest (AES-256-GCM)
- [x] OAuth state parameter validation
- [x] PKCE for all OAuth flows
- [x] Session expiry (30 days max)
- [x] Counter verification (WebAuthn replay protection)
- [x] Origin validation (WebAuthn, OAuth)
- [x] Input validation (Pydantic/Joi schemas)
- [x] SQL injection prevention (parameterized queries)
- [x] XSS prevention (CSP headers)

---

## 🎯 Summary: Security Levels

| Level | Methods | Security Rating | Use Case |
|-------|---------|----------------|----------|
| **1** | Social login (OAuth) | 🔒🔒 Medium | Quick sign-up |
| **2** | Passkey (FaceID/TouchID) | 🔒🔒🔒🔒 High | Daily use |
| **3** | OAuth + 2FA | 🔒🔒🔒🔒 High | Extra protection |
| **4** | Passkey + 2FA | 🔒🔒🔒🔒🔒 Enterprise | Maximum security |

**Recommendation**: Start with OAuth (easy), add passkey (convenient), enable 2FA for sensitive accounts (secure).

---

## 📚 Further Reading

### For Users
- [How to Set Up 2FA (5 Minutes)](./2FA_SETUP.md)
- [What is a Passkey?](./PASSKEY_EXPLAINED.md)
- [Why OAuth is Safe](./OAUTH_SAFETY.md)

### For Developers
- [OAuth 2.0 Complete Guide](./OAUTH_GUIDE.md)
- [WebAuthn Implementation](./WEBAUTHN_GUIDE.md)
- [Session Security Best Practices](./SESSION_SECURITY.md)

### Standards & Specs
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/)
- [TOTP RFC 6238](https://tools.ietf.org/html/rfc6238)

---

**Questions?** Open an issue on [GitHub](https://github.com/soulfra/agent-router/issues) or [join our Discord](https://discord.gg/soulfra).
