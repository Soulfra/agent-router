# QR Code Login System

Privacy-first device pairing using QR codes. Scan with your iPhone to instantly login on desktop - no password needed.

## Overview

The QR Login system enables seamless authentication between devices:
1. **Desktop**: Displays QR code
2. **iPhone**: Scans QR code with camera
3. **Backend**: Verifies session and pairs devices
4. **Both devices**: Logged in with same identity

## Features

- ✅ **Zero password** - Just scan and login
- ✅ **Privacy-first** - Uses device fingerprinting, no cookies
- ✅ **5-minute expiry** - QR codes expire for security
- ✅ **Real-time pairing** - WebSocket notifications
- ✅ **OAuth support** - Optional Google/Twitter/GitHub login
- ✅ **Cross-device sync** - Same identity across all devices

## Architecture

```
Desktop Browser                 Backend Server                 iPhone Browser
     │                               │                              │
     ├─ 1. POST /api/auth/qr/generate                              │
     │  ────────────────────────────>│                              │
     │                               │                              │
     │<─ 2. QR code (data URL) ──────│                              │
     │    + sessionId                │                              │
     │    + expiresAt                │                              │
     │                               │                              │
     ├─ 3. Display QR code           │                              │
     │    Start polling               │                              │
     │                               │                              │
     │                               │<─ 4. Scan QR code ───────────│
     │                               │    Extract sessionId         │
     │                               │                              │
     │                               │<─ 5. POST /api/auth/qr/verify│
     │                               │    { sessionId, userId,      │
     │                               │      deviceId, fingerprint } │
     │                               │                              │
     │                               ├─ 6. Verify session           │
     │                               │    Link devices               │
     │                               │                              │
     ├─ 7. GET /api/auth/qr/status   │──> 8. { verified: true }    │
     │<─────────────────────────────>│                              │
     │    (polling every 2s)         │                              │
     │                               │                              │
     ├─ 9. Login success!            │                              │
     │    Redirect to dashboard      │                              │
```

## File Structure

```
agent-router/
  lib/
    qr-login-system.js              ← Core QR login logic
  routes/
    auth-routes.js                  ← QR login API endpoints
  projects/soulfra.github.io/
    qr-login.html                   ← Desktop login page
    qr-scanner.html                 ← iPhone scanner page
```

## API Endpoints

### POST /api/auth/qr/generate
Generate QR code for desktop login

**Request:**
```json
{
  "deviceId": "optional-device-fingerprint",
  "metadata": {
    "page": "qr-login",
    "userAgent": "Mozilla/5.0...",
    "timestamp": 1234567890
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "a1b2c3d4e5f6...",
  "qrCode": "data:image/png;base64,...",
  "expiresAt": 1234567890000,
  "expiresIn": 300000
}
```

### POST /api/auth/qr/verify
Verify QR scan from iPhone

**Request:**
```json
{
  "sessionId": "a1b2c3d4e5f6...",
  "userId": "user-fingerprint-id",
  "deviceId": "iPhone User-Agent",
  "fingerprintId": "device-fingerprint",
  "authMethod": "qr-scan",
  "oauth": {
    "provider": "google",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "a1b2c3d4e5f6...",
  "userId": "user-fingerprint-id"
}
```

### GET /api/auth/qr/status/:sessionId
Check QR login status (desktop polling)

**Response (pending):**
```json
{
  "exists": true,
  "status": "pending",
  "verified": false,
  "expiresAt": 1234567890000,
  "expiresIn": 240000
}
```

**Response (verified):**
```json
{
  "exists": true,
  "status": "verified",
  "verified": true,
  "session": {
    "sessionId": "a1b2c3d4e5f6...",
    "userId": "user-fingerprint-id",
    "deviceId": "iPhone User-Agent",
    "fingerprintId": "device-fingerprint",
    "authMethod": "qr-scan",
    "verifiedAt": 1234567890000
  }
}
```

### POST /api/auth/token/create
Create login token from verified session

**Request:**
```json
{
  "sessionId": "a1b2c3d4e5f6..."
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbG...base64url...",
  "expiresAt": 1234567890000,
  "userId": "user-fingerprint-id"
}
```

### POST /api/auth/token/verify
Verify login token

**Request:**
```json
{
  "token": "eyJhbG...base64url..."
}
```

**Response:**
```json
{
  "valid": true,
  "userId": "user-fingerprint-id",
  "deviceId": "iPhone User-Agent",
  "fingerprintId": "device-fingerprint",
  "authMethod": "qr-scan"
}
```

### GET /api/auth/qr/stats
Get QR login system stats

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalSessions": 15,
    "pendingSessions": 3,
    "verifiedSessions": 12,
    "activeWebsockets": 2,
    "byAuthMethod": {
      "qr-scan": 12,
      "device-fingerprint": 3
    },
    "byOAuthProvider": {
      "google": 5,
      "twitter": 2
    }
  }
}
```

## Usage

### Desktop (qr-login.html)

1. Visit `https://soulfra.github.io/qr-login.html`
2. QR code is generated automatically
3. Desktop polls `/api/auth/qr/status/:sessionId` every 2 seconds
4. When iPhone scans and verifies, desktop receives notification
5. Login token is created and stored in localStorage
6. Redirects to dashboard

### iPhone (qr-scanner.html)

1. Scan QR code with iPhone camera
2. Opens `https://soulfra.github.io/qr-scanner.html?sessionId=...`
3. Extracts sessionId from QR payload
4. Sends fingerprint + userId to `/api/auth/qr/verify`
5. Shows success message
6. Desktop is now logged in

### Local Development

Start backend:
```bash
cd ~/Desktop/CALOS_ROOT/agent-router
npm start -- --local
```

Test flow:
```bash
# Desktop: Visit in browser
open http://localhost:5001/qr-login.html

# iPhone: Scan QR (or manually visit)
# http://localhost:5001/qr-scanner.html?sessionId=<id-from-qr>
```

### Production (GitHub Pages)

Frontend:
- `https://soulfra.github.io/qr-login.html` (desktop)
- `https://soulfra.github.io/qr-scanner.html` (iPhone)

Backend:
- `https://api.calos.dev/api/auth/qr/*` (deployed separately)

## Security Features

1. **Session Expiry** - QR codes expire after 5 minutes
2. **One-time Use** - Each QR can only be verified once
3. **Device Fingerprinting** - Uses Canvas/WebGL/Audio for unique ID
4. **No PII Storage** - Only stores hashed fingerprints
5. **HTTPS Only** - All communication encrypted in production
6. **Token Expiry** - Login tokens expire after 7 days

## Privacy Guarantees

- ❌ No cookies
- ❌ No Google/Facebook tracking pixels
- ❌ No email/phone collection (unless OAuth used)
- ✅ Device fingerprint only (hashed)
- ✅ Data stored in localStorage
- ✅ User controls sync

## Integration with Identity Tracker

The QR login system integrates with the CalOS Identity Tracker:

```javascript
// Desktop generates fingerprint
const fingerprint = window.CalOSIdentity?.fingerprint;

// Sends to backend in QR generation
POST /api/auth/qr/generate { deviceId: fingerprint }

// iPhone extracts same fingerprint
const fingerprint = window.CalOSIdentity?.fingerprint;

// Sends to backend in verification
POST /api/auth/qr/verify {
  userId: fingerprint,
  fingerprintId: fingerprint
}

// Backend links both devices to same identity
```

## OAuth Support (Optional)

To add OAuth login:

```javascript
// iPhone: Before verifying QR
const googleUser = await signInWithGoogle();

// Send OAuth data with verification
POST /api/auth/qr/verify {
  sessionId: "...",
  userId: googleUser.id,
  fingerprintId: fingerprint,
  authMethod: "oauth-qr",
  oauth: {
    provider: "google",
    email: googleUser.email,
    name: googleUser.name,
    profileUrl: googleUser.picture
  }
}
```

## WebSocket Support (Future)

For real-time pairing without polling:

```javascript
// Desktop: Connect WebSocket
const ws = new WebSocket('wss://api.calos.dev/ws/qr-login');
ws.send(JSON.stringify({ sessionId }));

// Backend: Notify on verification
ws.send(JSON.stringify({
  type: 'login-success',
  session: { ... }
}));
```

## Troubleshooting

**QR code not scanning:**
- Ensure camera permissions enabled on iPhone
- Check QR code is displayed correctly (white background)
- Try adjusting distance/angle

**Verification fails:**
- Check backend is running (`npm start -- --local`)
- Verify sessionId matches between desktop/iPhone
- Check browser console for errors

**Polling timeout:**
- QR codes expire after 5 minutes
- Generate new QR code and try again

**Token expired:**
- Login tokens expire after 7 days
- Generate new QR code to re-authenticate

## Next Steps

1. **Add jsQR library** - Actual QR code detection (currently uses URL params)
2. **WebSocket support** - Replace polling with real-time notifications
3. **OAuth integration** - Add Google/Twitter/GitHub login buttons
4. **Biometric auth** - Face ID/Touch ID on iPhone
5. **Multi-device sync** - Sync sessions across all devices

## Resources

- Frontend: https://soulfra.github.io/qr-login.html
- Backend: https://github.com/soulfra/agent-router
- Identity Tracker: https://soulfra.github.io/identity-tracker.js
- QR Library: https://github.com/cozmo/jsQR

---

**Built with ❤️ by SoulFra**

*Zero cookies • Privacy-first • MIT Licensed*
