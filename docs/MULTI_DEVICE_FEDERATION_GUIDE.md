# Multi-Device Federation Guide

> How to pair laptop, iPhone, voice assistants, and more to a single user account
> RuneScape-style user identity that works across all entry points

## Table of Contents

1. [Core Concept: Central Identity Model](#core-concept-central-identity-model)
2. [Device Pairing Flows](#device-pairing-flows)
3. [Geolocation-Based Routing](#geolocation-based-routing)
4. [Entry Point Integration](#entry-point-integration)
5. [Security & Privacy](#security--privacy)
6. [Implementation Examples](#implementation-examples)

---

## Core Concept: Central Identity Model

Think of it like **RuneScape's player ID system**: You have one account, but you can log in from any "world" (device/platform). Your character (user data) persists across all worlds.

### The Three-Layer Identity Model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: CENTRAL USER ACCOUNT (PostgreSQL)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • user_id: unique identifier (like RuneScape player ID)    │
│  • credits_balance: shared across all devices               │
│  • preferences: curated topics, model preferences           │
│  • history: all interactions from all devices               │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
┌───────────────▼───┐  ┌──────▼──────┐  ┌──▼──────────────┐
│  Layer 2: DEVICES │  │   DEVICES   │  │    DEVICES      │
│  ━━━━━━━━━━━━━━━━ │  │ ━━━━━━━━━━━ │  │  ━━━━━━━━━━━━━  │
│  Laptop           │  │  iPhone     │  │  Voice Assistant│
│  device_id: abc123│  │  device_id: │  │  device_id:     │
│  fingerprint: ... │  │  def456     │  │  ghi789         │
│  trust_level: ... │  │  Face ID    │  │  Wake word      │
└───────────────────┘  └─────────────┘  └─────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│  Layer 3: LOCAL SESSIONS (JWT Tokens)                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • JWT contains: user_id, device_id, session_id             │
│  • Expires after inactivity (configurable)                  │
│  • Each device has its own token, all point to same user_id │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Central user account (Layer 1)
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  credits_balance INTEGER DEFAULT 1000,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Linked devices (Layer 2)
CREATE TABLE user_devices (
  device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  device_fingerprint TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_type TEXT, -- 'web', 'mobile', 'voice', 'desktop'
  trust_level INTEGER DEFAULT 0, -- 0=unverified, 1=verified, 2=trusted
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active sessions (Layer 3)
CREATE TABLE user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  device_id UUID REFERENCES user_devices(device_id),
  jwt_token TEXT,
  ip_address INET,
  location_id INTEGER REFERENCES ip_locations(id),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Device Pairing Flows

### Flow 1: QR Code Pairing (Laptop → iPhone)

**Scenario:** You're logged in on your laptop, want to add your iPhone.

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Generate Pairing Code (Laptop)                     │
└─────────────────────────────────────────────────────────────┘

POST /api/auth/device/pair/generate
{
  "userId": "user-123",
  "sourceDeviceId": "laptop-abc"
}

Response:
{
  "pairingCode": "XKCD-1234-ABCD",
  "qrData": "jwt-encoded-payload",
  "expiresIn": 300  // 5 minutes
}

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Scan QR Code (iPhone)                              │
└─────────────────────────────────────────────────────────────┘

[iPhone camera scans QR code]
→ Extracts: userId, pairingCode, sessionId

POST /api/auth/device/pair/complete
{
  "pairingCode": "XKCD-1234-ABCD",
  "deviceFingerprint": "iphone-def-456",
  "deviceName": "Matthew's iPhone",
  "deviceType": "mobile"
}

Response:
{
  "status": "success",
  "deviceId": "iphone-def",
  "userId": "user-123",  // Same as laptop!
  "jwt": "eyJhbGc...",
  "creditsBalance": 950  // Shared balance
}

┌─────────────────────────────────────────────────────────────┐
│  RESULT: Both devices now linked to user-123                │
│  • Laptop: device_id=laptop-abc, user_id=user-123          │
│  • iPhone: device_id=iphone-def, user_id=user-123          │
│  • Both share same credits balance, history, preferences    │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:** Uses `lib/device-pairing.js` → `generatePairingCode()` and `completePairing()`

---

### Flow 2: WiFi Proximity Auto-Pairing

**Scenario:** Your laptop and iPhone are on the same WiFi network. Auto-pair them.

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Detect Same WiFi Network                           │
└─────────────────────────────────────────────────────────────┘

Laptop:  192.168.1.100 (WiFi: "Home Network")
iPhone:  192.168.1.101 (WiFi: "Home Network")

Server detects:
• Both devices on same subnet (192.168.1.x)
• Both authenticated to same user_id
• Within 30-minute pairing window

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Auto-Pair with Notification                        │
└─────────────────────────────────────────────────────────────┘

[Laptop shows notification]
"New device detected: Matthew's iPhone. Pair automatically?"
[Accept] [Deny]

[Accept] →
POST /api/auth/device/pair/auto
{
  "userId": "user-123",
  "sourceDeviceId": "laptop-abc",
  "targetDeviceFingerprint": "iphone-def-456",
  "networkMatch": true
}

Response:
{
  "status": "paired",
  "trustLevel": 1  // Elevated to "verified" due to network match
}
```

**Implementation:** Uses `lib/device-pairing.js` → `autoDetectNearbyDevices()`

---

### Flow 3: Voice Assistant Pairing

**Scenario:** Add Alexa/Google Home to your account.

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Voice Skill Authorization                          │
└─────────────────────────────────────────────────────────────┘

User: "Alexa, ask CALOS to check my credits"
Alexa: "This device is not linked. Visit app.calos.ai/pair to link."

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Web-Based Device Code Flow                         │
└─────────────────────────────────────────────────────────────┘

User visits: https://app.calos.ai/pair

1. Login to web UI (already logged in on laptop)
2. Enter device code: "VOICE-7890"
3. Server links voice assistant to user_id

POST /api/auth/device/pair/voice
{
  "userId": "user-123",
  "deviceCode": "VOICE-7890",
  "deviceType": "voice_assistant",
  "assistantType": "alexa"
}

┌─────────────────────────────────────────────────────────────┐
│  RESULT: Voice assistant linked                             │
└─────────────────────────────────────────────────────────────┘

User: "Alexa, ask CALOS to check my credits"
Alexa: "You have 950 credits remaining."

[Query authenticated via user_id=user-123]
```

**Implementation:** Uses OAuth 2.0 device authorization grant + `lib/device-pairing.js`

---

## Geolocation-Based Routing

### The "Sorting Hat" Algorithm

When a user connects from a new IP, the system:

1. **Resolves IP to Location** (`lib/geo-resolver.js`)
2. **Assigns Regional Server** (lowest latency)
3. **Caches Location** (30-day TTL)
4. **Routes Future Requests** to assigned server

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: IP Resolution                                      │
└─────────────────────────────────────────────────────────────┘

User connects from IP: 203.0.113.45

POST /internal/geo/resolve
{
  "ipAddress": "203.0.113.45"
}

Response (from ip-api.com):
{
  "country": "United States",
  "countryCode": "US",
  "region": "CA",
  "regionName": "California",
  "city": "San Francisco",
  "lat": 37.7749,
  "lon": -122.4194,
  "timezone": "America/Los_Angeles",
  "isp": "Comcast Cable"
}

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Regional Server Assignment                         │
└─────────────────────────────────────────────────────────────┘

Available servers:
• us-west-1  (Oregon)    → Distance: 500 miles
• us-west-2  (N. California) → Distance: 50 miles ✓ CLOSEST
• us-east-1  (Virginia)  → Distance: 2,500 miles

Assign user to: us-west-2

UPDATE user_sessions SET region='us-west-2', location_id=<cached_location>
WHERE user_id='user-123' AND device_id='laptop-abc';

┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Route Future Requests                              │
└─────────────────────────────────────────────────────────────┘

All future API calls from this device → us-west-2
• Lower latency (50ms vs 150ms)
• Regulatory compliance (GDPR, CCPA by region)
• Load balancing across regions
```

**Implementation:**

```javascript
// In router.js or middleware
const GeoResolver = require('./lib/geo-resolver');
const geoResolver = new GeoResolver(db);

app.use(async (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'];

  // Resolve location
  const location = await geoResolver.resolve(clientIp);

  // Assign regional server (sorting hat)
  const region = selectClosestRegion(location);
  req.assignedRegion = region;

  // Cache in session
  if (req.session) {
    req.session.region = region;
    req.session.location = location;
  }

  next();
});

function selectClosestRegion(location) {
  const regions = [
    { id: 'us-west-2', lat: 37.7749, lon: -122.4194 },
    { id: 'us-east-1', lat: 38.9072, lon: -77.0369 },
    { id: 'eu-west-1', lat: 53.3498, lon: -6.2603 }
  ];

  // Calculate haversine distance, return closest
  return regions.reduce((closest, region) => {
    const dist = haversineDistance(location.lat, location.lon, region.lat, region.lon);
    return dist < closest.dist ? { ...region, dist } : closest;
  }, { dist: Infinity }).id;
}
```

---

## Entry Point Integration

### All Roads Lead to `user_id`

```
┌───────────────────────────────────────────────────────────────┐
│  Entry Point 1: Web UI (Browser)                             │
└───────────────────────────────────────────────────────────────┘

https://app.calos.ai/login
↓
POST /api/auth/login { username, password }
↓
JWT issued: { user_id: "user-123", device_id: "laptop-abc" }
↓
All API calls include: Authorization: Bearer <jwt>


┌───────────────────────────────────────────────────────────────┐
│  Entry Point 2: Mobile App (React Native)                    │
└───────────────────────────────────────────────────────────────┘

Open app → Face ID prompt
↓
POST /api/auth/biometric { publicKey, signature, challenge }
↓
JWT issued: { user_id: "user-123", device_id: "iphone-def" }
↓
App stores JWT in secure keychain


┌───────────────────────────────────────────────────────────────┐
│  Entry Point 3: Voice Assistant (Wake Word)                  │
└───────────────────────────────────────────────────────────────┘

"Hey CALOS, summarize my feed"
↓
Voice SDK → POST /api/voice/query { deviceId: "alexa-ghi", query: "..." }
↓
Lookup: device_id="alexa-ghi" → user_id="user-123"
↓
Process query with user's preferences/credits


┌───────────────────────────────────────────────────────────────┐
│  Entry Point 4: Desktop App (Electron)                       │
└───────────────────────────────────────────────────────────────┘

Launch app → Auto-login from saved session
↓
Refresh JWT: POST /api/auth/refresh { refreshToken }
↓
New JWT issued: { user_id: "user-123", device_id: "desktop-jkl" }
```

**Critical Point:** All entry points authenticate to the same `user_id`. Device type doesn't matter.

---

## Security & Privacy

### Trust Level Progression

Devices progress through trust levels based on verification:

```
Level 0: UNVERIFIED
├─ New device, not yet verified
├─ Limited access (read-only)
└─ Cannot spend credits

Level 1: VERIFIED
├─ Passed one verification method:
│  • QR code pairing from trusted device
│  • WiFi proximity to trusted device
│  • Biometric authentication (Face ID)
├─ Normal access
└─ Can spend credits (with limits)

Level 2: TRUSTED
├─ Multiple verification methods passed
├─ Used consistently for 30+ days
├─ No suspicious activity
├─ Full access
└─ Can manage other devices
```

**Implementation:**

```javascript
// In lib/device-pairing.js
async elevateTrustLevel(deviceId, method) {
  const device = await this.getDevice(deviceId);

  // Award trust points
  const trustPoints = {
    'qr_code': 10,
    'wifi_proximity': 8,
    'biometric': 12,
    'consistent_use': 5  // awarded daily
  };

  device.trust_score += trustPoints[method];

  // Promote to next level
  if (device.trust_score >= 30 && device.trust_level === 0) {
    device.trust_level = 1; // Verified
  } else if (device.trust_score >= 100 && device.trust_level === 1) {
    device.trust_level = 2; // Trusted
  }

  await this.updateDevice(deviceId, device);
}
```

### Zero-Knowledge Identity Option

For users who don't want to create an account with email/password:

```javascript
// In lib/soulfra-identity.js
const identity = SoulfraIdentity.createIdentity();

// User's identity is ONLY their keypair
// No name, email, phone, or location stored
// Server only knows public key: "ed25519:Abc123..."

// To authenticate:
const challenge = await fetch('/api/auth/challenge');
const signature = identity.sign(challenge);

POST /api/auth/soulfra
{
  "publicKey": identity.publicKey,
  "signature": signature,
  "challenge": challenge
}

// Server verifies signature, issues JWT
// user_id = hash(publicKey)
```

**Privacy Benefits:**
- No PII stored
- Cannot be deanonymized by server
- User controls identity (no password reset = no recovery)
- Reputation tied to cryptographic identity

---

## Implementation Examples

### Example 1: Complete Laptop → iPhone Pairing Flow

```javascript
// ============================================================================
// LAPTOP: Generate QR Code
// ============================================================================

const DevicePairing = require('./lib/device-pairing');
const pairing = new DevicePairing(db);

const session = await pairing.generatePairingCode(
  'user-123',         // userId
  'laptop-abc'        // sourceDeviceId
);

console.log('QR Code Data:', session.qrData);
// Display QR code on screen


// ============================================================================
// IPHONE: Scan QR Code
// ============================================================================

// [User scans QR code with camera]

const qrPayload = decodeQRCode(scannedImage);
// qrPayload = { sessionId: '...', userId: 'user-123', code: 'XKCD-1234' }

const result = await pairing.completePairing(
  qrPayload.code,              // pairingCode
  'iphone-fingerprint-456',    // deviceFingerprint
  {
    deviceName: "Matthew's iPhone",
    deviceType: 'mobile'
  }
);

console.log('Pairing complete!');
console.log('Device ID:', result.deviceId);
console.log('User ID:', result.userId);  // Same as laptop!
console.log('JWT:', result.jwt);


// ============================================================================
// RESULT: Both devices linked to user-123
// ============================================================================

// Query user's devices
const devices = await db.query(
  'SELECT * FROM user_devices WHERE user_id = $1',
  ['user-123']
);

console.log(devices.rows);
/*
[
  { device_id: 'laptop-abc', device_name: 'Laptop', trust_level: 2 },
  { device_id: 'iphone-def', device_name: "Matthew's iPhone", trust_level: 1 }
]
*/
```

---

### Example 2: Geolocation-Based Routing

```javascript
// ============================================================================
// MIDDLEWARE: Resolve IP and Assign Region
// ============================================================================

const GeoResolver = require('./lib/geo-resolver');
const geoResolver = new GeoResolver(db);

app.use(async (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'];

  // Resolve location (cached for 30 days)
  const location = await geoResolver.resolve(clientIp);

  console.log('User location:', location.city, location.region);
  // "User location: San Francisco CA"

  // Assign region (sorting hat)
  const region = selectClosestRegion(location);
  req.assignedRegion = region;

  console.log('Assigned region:', region);
  // "Assigned region: us-west-2"

  next();
});


// ============================================================================
// ROUTER: Use Assigned Region
// ============================================================================

app.post('/api/chat', async (req, res) => {
  const region = req.assignedRegion;  // from middleware

  // Route to regional LLM instance
  const llmEndpoint = {
    'us-west-2': 'http://llm-us-west-2.internal:11434',
    'us-east-1': 'http://llm-us-east-1.internal:11434',
    'eu-west-1': 'http://llm-eu-west-1.internal:11434'
  }[region];

  // Forward request to regional server
  const response = await fetch(`${llmEndpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });

  res.json(await response.json());
});
```

---

### Example 3: Voice Assistant Integration

```javascript
// ============================================================================
// VOICE SKILL: Handle Query
// ============================================================================

// Alexa Skill Lambda Handler
exports.handler = async (event) => {
  const userId = event.session.user.userId;  // Alexa user ID
  const query = event.request.intent.slots.query.value;

  // Lookup linked CALOS account
  const device = await db.query(
    'SELECT user_id FROM user_devices WHERE device_fingerprint = $1',
    [`alexa-${userId}`]
  );

  if (!device.rows.length) {
    return {
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: 'This device is not linked. Visit app.calos.ai/pair to link your account.'
        }
      }
    };
  }

  const calosUserId = device.rows[0].user_id;

  // Query CALOS API with user's account
  const response = await fetch('https://api.calos.ai/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOICE_API_KEY}`,
      'X-User-ID': calosUserId,
      'X-Device-ID': `alexa-${userId}`
    },
    body: JSON.stringify({
      model: 'llama3.2',
      messages: [{ role: 'user', content: query }]
    })
  });

  const result = await response.json();

  return {
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: result.message.content
      }
    }
  };
};
```

---

## Summary: The RuneScape Model

```
┌───────────────────────────────────────────────────────────────┐
│  JUST LIKE RUNESCAPE                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                               │
│  Your CALOS Account = Your RuneScape Character               │
│  ├─ One user_id, persists everywhere                         │
│  ├─ Credits balance = Your gold/items (shared)               │
│  └─ Preferences/history = Your stats/quest progress          │
│                                                               │
│  Devices = Different "Worlds" (servers)                      │
│  ├─ Laptop = World 1                                         │
│  ├─ iPhone = World 2                                         │
│  ├─ Voice Assistant = World 3                                │
│  └─ All worlds see same character (user_id)                  │
│                                                               │
│  Geolocation Routing = World Selection                       │
│  ├─ US users → US worlds (servers)                           │
│  ├─ EU users → EU worlds (servers)                           │
│  └─ Automatic based on your IP ("sorting hat")               │
│                                                               │
│  Device Pairing = "Members" Verification                     │
│  ├─ Unverified = F2P account (limited access)                │
│  ├─ Verified = Members account (normal access)               │
│  └─ Trusted = Veteran account (full access)                  │
└───────────────────────────────────────────────────────────────┘
```

**Key Takeaway:** Your `user_id` is your identity. Devices are just different "windows" into the same account. Pair as many devices as you want—they all share the same credits, preferences, and history.

---

## Next Steps

1. **Test Device Pairing**: Use test script to verify QR code flow
   ```bash
   bash scripts/test-device-pairing.sh
   ```

2. **Configure Geolocation**: Set up regional servers in `config.json`
   ```json
   {
     "regions": {
       "us-west-2": { "endpoint": "http://...", "lat": 37.77, "lon": -122.41 },
       "us-east-1": { "endpoint": "http://...", "lat": 38.90, "lon": -77.03 }
     }
   }
   ```

3. **Implement Voice Pairing**: Create device authorization flow for Alexa/Google Home

4. **Monitor Geolocation Cache**: Check `ip_locations` table for cache hit rate
   ```sql
   SELECT COUNT(*), AVG(EXTRACT(EPOCH FROM (NOW() - cached_at))/86400) as avg_age_days
   FROM ip_locations
   WHERE cached_at > NOW() - INTERVAL '30 days';
   ```

---

## References

- `lib/device-pairing.js` - QR code and WiFi proximity pairing
- `lib/geo-resolver.js` - IP geolocation and caching
- `lib/soulfra-identity.js` - Zero-knowledge cryptographic identity
- `lib/biometric-auth.js` - Face ID / Touch ID integration
- `SYSTEM_OPERATIONS_MANUAL.md` - Phase 2: User Onboarding & Device Pairing
