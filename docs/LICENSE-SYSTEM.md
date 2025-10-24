# CALOS License Verification System

## Overview

**"Phone Home" license verification** for CALOS Business OS, modeled after VS Code and Unity.

**TL;DR**: Localhost is **always free**, no restrictions. Production deployments must verify with `license.calos.sh` to collect domain/route/theme data.

---

## Philosophy

### Fair Trade Model

You can use CALOS for free if you give us **one** of these:

1. **Data**: Let us collect domain, routes, themes, usage stats (opt-in)
2. **Contributions**: Submit themes/plugins/workflows back to us (MIT license)
3. **Credit**: Give us attribution ("Powered by CALOS")
4. **Money**: Pay $29-99/month for hosted/premium tiers
5. **Nothing**: Just use it on localhost forever (MIT license)

**We never fully disable your software**, even if the license server is down or your license expires. Graceful degradation always.

---

## License Tiers

### Development (Localhost)

**Cost**: $0 forever

**What you get**:
- ✅ Full source code (MIT license)
- ✅ All features unlocked
- ✅ No verification required
- ✅ No phone home
- ✅ No restrictions

**Hostnames that qualify**:
- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `192.168.x.x` (LAN)
- `10.x.x.x` (private network)
- `172.16.x.x - 172.31.x.x` (private network)
- `*.local`
- `*.localhost`

**Verification**: None required

---

### Community (Free Production)

**Cost**: $0 forever

**What you get**:
- ✅ 1 production domain
- ✅ All core features
- ✅ Community support (Discord, forums)
- ❌ No white-label
- ❌ No API access
- ❌ No priority support

**What we get** (choose ONE):
1. **Data**: Domain, routes, themes, usage stats (anonymized)
2. **Contributions**: Submit themes/workflows back to us
3. **Credit**: "Powered by CALOS" in footer

**Verification**: Every 24 hours

**Grace period**: 24 hours if server down

---

### Pro ($29/month)

**Cost**: $29/month

**What you get**:
- ✅ 5 production domains
- ✅ White-label (remove CALOS branding)
- ✅ Priority email support
- ✅ Advanced analytics
- ❌ No API access

**Verification**: Every 7 days

**Grace period**: 7 days if server down

---

### Enterprise ($99/month)

**Cost**: $99/month

**What you get**:
- ✅ Unlimited domains
- ✅ White-label
- ✅ API access (10k requests/day)
- ✅ Priority phone support
- ✅ SLA (99.9% uptime)
- ✅ Air-gapped mode (no phone home)

**Verification**: Every 30 days (or never if air-gapped)

**Grace period**: 30 days if server down

---

## How It Works

### Installation

When you first install CALOS, an **install ID** is generated:

```
~/.calos/install-id
  → a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

This ID is unique per installation. It's stored locally and sent during verification.

### Verification Flow

```
User visits https://example.com
    ↓
[Express Middleware] Check hostname
    ↓
Is localhost? → YES → Allow (no verification)
    ↓
NO → Check cache
    ↓
Cache valid? → YES → Allow
    ↓
NO → Phone home to license.calos.sh
    ↓
[License Server] Verify:
  - Install ID
  - Hostname (example.com)
  - Tier (community, pro, enterprise)
    ↓
[License Server] Collect data:
  - Domain
  - Routes (custom endpoints)
  - Themes (marketplace themes)
  - Stats (users, transactions)
    ↓
Return: { valid: true, tier: 'community', features: {...} }
    ↓
[Express Middleware] Cache result (24h)
    ↓
Allow request
```

### Graceful Degradation

If the license server is down or unreachable:

1. **First 24h**: Use cached license (grace period)
2. **After 24h**: Show warning banner but **still allow requests**
3. **Never block**: Software always works, even without verification

**We never pull a Unity.** Your software will never stop working.

---

## What We Collect

During verification, we collect:

### 1. Domain
```json
{
  "hostname": "example.com"
}
```

### 2. Install ID
```json
{
  "installId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

### 3. Routes (Custom Endpoints)
```json
{
  "routes": [
    "/api/my-custom-route",
    "/api/my-business-logic",
    "/webhook/stripe-integration"
  ]
}
```

**Fair trade**: If you contribute these routes back to CALOS (open source), we feature them on the marketplace.

### 4. Themes (Marketplace Themes)
```json
{
  "themes": [
    {
      "themeId": "theme_soulfra_dark",
      "name": "Soulfra Dark",
      "version": "1.2.0",
      "author": "Soulfra",
      "installedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 5. Usage Stats (Anonymized)
```json
{
  "stats": {
    "users": 25,
    "transcripts": 143,
    "posTransactions": 567,
    "cryptoCharges": 12,
    "forumPosts": 89
  }
}
```

**No PII**: We don't collect usernames, emails, IP addresses, or transaction details.

---

## Implementation

### 1. Apply Middleware Globally

```javascript
// server.js
const { licenseMiddleware } = require('./lib/middleware/license-middleware');

app.use(licenseMiddleware);  // Apply to all routes
```

Now every request checks the license. Localhost is always allowed, production verifies.

### 2. Require Specific Tier

```javascript
const { requireTier } = require('./lib/middleware/license-middleware');

// Enterprise-only feature
app.get('/api/white-label', requireTier('enterprise'), (req, res) => {
  res.json({ branding: 'custom' });
});
```

Returns 403 if user's tier is too low.

### 3. Require Specific Feature

```javascript
const { requireFeature } = require('./lib/middleware/license-middleware');

// API access required
app.get('/api/external', requireFeature('apiAccess'), (req, res) => {
  res.json({ data: [...] });
});
```

Returns 403 if user doesn't have the feature.

### 4. Optional License Check

```javascript
const { optionalLicenseCheck } = require('./lib/middleware/license-middleware');

// Just attach license info, don't block
app.use(optionalLicenseCheck);

app.get('/dashboard', (req, res) => {
  if (req.license?.tier === 'pro') {
    // Show pro features
  }
});
```

### 5. License Info Endpoint

```javascript
const { setupLicenseRoutes } = require('./lib/middleware/license-middleware');

app.use('/api/license', setupLicenseRoutes());
```

**Routes**:
- `GET /api/license` - Get license info
- `POST /api/license/clear` - Clear cache (force re-verification)

---

## Database Schema

### Tables Created

| Table | Purpose |
|-------|---------|
| `license_verifications` | Log of all verification events |
| `license_accounts` | License accounts (link users to tiers) |
| `license_domains` | Domains linked to accounts |
| `custom_routes` | Custom routes collected during verification |
| `license_analytics` | Aggregated usage stats |

### Example Query: Get License Status

```sql
SELECT * FROM get_license_status('a1b2c3d4...', 'example.com');
```

Returns:
```
tier        | community
features    | {"whiteLabel": false, "multiDomain": false}
verified    | true
expires_at  | 2024-01-16 10:30:00
is_expired  | false
```

### Example Query: Get Domain Usage

```sql
SELECT * FROM get_domain_usage('example.com', 30);
```

Returns:
```
total_verifications     | 856
unique_installs         | 1
avg_users               | 25.3
avg_transcripts         | 143.7
avg_pos_transactions    | 567.2
total_custom_routes     | 45
total_themes            | 12
```

---

## License Server

### Deployment

The license server runs at `license.calos.sh`. It's a separate Express app.

**Endpoints**:
- `POST /verify` - Verify license and collect data
- `GET /status` - Server health check

### Verify Endpoint

**Request**:
```json
POST /verify
{
  "installId": "a1b2c3d4...",
  "hostname": "example.com",
  "routes": ["/api/custom"],
  "themes": [{...}],
  "stats": {...}
}
```

**Response**:
```json
{
  "valid": true,
  "tier": "community",
  "features": {
    "whiteLabel": false,
    "multiDomain": false,
    "apiAccess": false,
    "prioritySupport": false
  },
  "message": "License valid for community tier",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

### Example License Server

```javascript
// license-server.js
const express = require('express');
const { recordLicenseVerification } = require('./lib/license-db');

const app = express();
app.use(express.json());

app.post('/verify', async (req, res) => {
  const { installId, hostname, routes, themes, stats } = req.body;

  // Check if account exists
  const account = await getAccountByInstallId(installId);

  // Default to community tier
  const tier = account?.tier || 'community';
  const features = account?.features || {
    whiteLabel: false,
    multiDomain: false,
    apiAccess: false,
    prioritySupport: false
  };

  // Record verification + collect data
  await recordLicenseVerification(installId, hostname, tier, features, {
    routes,
    themes,
    stats
  });

  res.json({
    valid: true,
    tier,
    features,
    message: `License valid for ${tier} tier`,
    expiresAt: getExpirationDate(tier)
  });
});

app.listen(3000, () => console.log('License server running on port 3000'));
```

---

## CLI Tools

### Check License Status

```bash
node -e "
const LicenseVerifier = require('./lib/license-verifier');
const verifier = new LicenseVerifier();
await verifier.initialize();
const info = await verifier.getLicenseInfo('example.com');
console.log(info);
"
```

**Output**:
```json
{
  "hostname": "example.com",
  "tier": "community",
  "valid": true,
  "status": "valid",
  "cachedAt": "2024-01-15T10:30:00Z",
  "features": {
    "whiteLabel": false,
    "multiDomain": false
  }
}
```

### Clear License Cache

```bash
curl -X POST http://localhost:5001/api/license/clear
```

Forces re-verification on next request.

### View Install ID

```bash
cat ~/.calos/install-id
```

**Output**:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

---

## Security

### No PII Collected

We **never** collect:
- ❌ Usernames
- ❌ Emails (unless you link your account)
- ❌ IP addresses
- ❌ Transaction details (amounts, customers)
- ❌ Credit card numbers (we never see them anyway - Stripe handles it)
- ❌ QuickBooks data

We **only** collect:
- ✅ Domain (example.com)
- ✅ Install ID (UUID)
- ✅ Routes (endpoint paths like `/api/custom`)
- ✅ Themes (theme IDs + versions)
- ✅ Usage stats (counts only, no details)

### Encryption

- **In transit**: TLS 1.2+ (HTTPS)
- **At rest**: PostgreSQL encryption (AES-256)
- **Install ID**: Stored locally in `~/.calos/install-id` (plain text, not secret)

### Opt-Out

To opt out of data collection, either:
1. **Stay on localhost** (never verifies)
2. **Upgrade to Enterprise** (air-gapped mode)
3. **Self-host license server** (your own `license.calos.sh`)

---

## Competitive Analysis

### vs. WordPress (Open Source)

| Feature | WordPress | CALOS |
|---------|-----------|-------|
| Self-hosted free | ✅ | ✅ |
| License verification | ❌ (none) | ✅ (production only) |
| Data collection | ❌ | ✅ (opt-in) |
| Marketplace | 50k+ plugins | Growing |
| Revenue split | 50/50 | 70/30 |

### vs. Unity (Game Engine)

| Feature | Unity | CALOS |
|---------|-------|-------|
| Free tier | ✅ (Personal) | ✅ (Community) |
| License check | ✅ (Required) | ✅ (Production only) |
| Offline mode | ❌ (Must verify) | ✅ (Grace period) |
| Disable if no license | ✅ (Yes, infamous) | ❌ (Never) |
| Fair trade model | ❌ | ✅ (Data OR money) |

### vs. VS Code (IDE)

| Feature | VS Code | CALOS |
|---------|---------|-------|
| Open source | ✅ (MIT) | ✅ (MIT) |
| Telemetry | ✅ (Opt-in) | ✅ (Required for production) |
| Localhost free | ✅ | ✅ |
| Commercial use | ✅ | ✅ |
| Phone home | ✅ (Telemetry) | ✅ (License verification) |

**CALOS is closest to VS Code**, but we're explicit about the data we collect.

---

## FAQ

### For Users

**Q: Is localhost really free forever?**
A: Yes. No verification, no phone home, no restrictions. MIT license.

**Q: What if I don't want to share data?**
A: Either stay on localhost (free) or upgrade to Enterprise ($99/mo) with air-gapped mode.

**Q: What if the license server is down?**
A: 24h grace period. After that, a warning banner appears but the software still works.

**Q: Will you ever disable my software like Unity?**
A: **Never.** Graceful degradation only. We'll warn you, but never block.

**Q: Can I self-host the license server?**
A: Yes! Run your own `license.calos.sh` and set `LICENSE_SERVER_URL` in `.env`.

**Q: What if I want to remove "Powered by CALOS"?**
A: Upgrade to Pro ($29/mo) or Enterprise ($99/mo) for white-label.

---

### For Developers

**Q: How do I test license verification locally?**
A: Just use `localhost`. License middleware automatically bypasses verification.

**Q: How do I force a re-verification?**
A: `POST /api/license/clear` to clear cache.

**Q: How do I mock the license server in tests?**
A: Set `LICENSE_SERVER_URL=http://localhost:3001` and run a mock server.

**Q: What if I'm building a SaaS on top of CALOS?**
A: Community tier (free) works fine for 1 domain. Upgrade to Pro for 5 domains.

**Q: Can I contribute routes back to CALOS?**
A: Yes! Submit a PR to `https://github.com/calos/agent-router`. We'll feature it.

---

## Resources

- **License Server**: https://license.calos.sh
- **Pricing**: https://calos.sh/pricing
- **Marketplace**: https://calos.sh/marketplace
- **Documentation**: https://docs.calos.sh
- **GitHub**: https://github.com/calos/agent-router
- **Discord**: https://discord.gg/calos

---

## Summary

✅ **Localhost**: Free forever, no verification
✅ **Production**: Verify with license.calos.sh every 24h-30d (tier-dependent)
✅ **Fair trade**: Data OR money OR credit
✅ **Graceful degradation**: Never fully disable
✅ **Open source**: MIT license, self-host license server
✅ **No PII**: Only domain, routes, themes, usage counts

**The WordPress model for business operating systems.**

---

**Built with ❤️ by CALOS**

*Open source • Self-host free • Fair trade • Never disable*
