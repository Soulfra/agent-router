# Domain Verification System

**No more fake domains - only verify what actually exists**

## Problem Solved

**Before:** Made up fake domains like "calos.ai", "calos.games", "cards.calos.games" that don't exist
**After:** Verify ALL domains via DNS, publish public whitelist, use YOUR real domains

## Your REAL Domains

1. **calriven.com** - Main domain
2. **soulfra.com** - Creative collaboration
3. **deathtodata.com** - Privacy-first
4. **finishthisidea.com** - Project completion
5. **dealordelete.com** - Decision making
6. **saveorsink.com** - System rescue
7. **cringeproof.com** - Social optimization
8. **finishthisrepo.com** - Code completion
9. **ipomyagent.com** - AI agents
10. **hollowtown.com** - Gaming
11. **hookclinic.com** - Content creation
12. **businessaiclassroom.com** - Education
13. **roughsparks.com** - Music production

## Public Whitelist

**URL:** `https://calriven.com/domains.json`

```json
{
  "version": "1.0.0",
  "totalDomains": 13,
  "verifiedDomains": 13,
  "domains": [
    {
      "domain": "calriven.com",
      "verified": true,
      "type": "main",
      "ipv4": ["..."],
      "githubPages": "https://your-username.github.io/calriven"
    },
    ...
  ]
}
```

## Usage

### Verify All Domains

```bash
node -e "const DomainVerifier = require('./lib/domain-verifier'); \
  new DomainVerifier().verifyAll().then(console.log)"
```

### Generate Whitelist

```bash
node -e "const DomainVerifier = require('./lib/domain-verifier'); \
  new DomainVerifier().generateWhitelist().then(r => \
  console.log('Whitelist generated:', r.verifiedDomains + '/' + r.totalDomains))"
```

### Check if Domain is Whitelisted

```javascript
const DomainVerifier = require('./lib/domain-verifier');
const verifier = new DomainVerifier();

const isReal = await verifier.isWhitelisted('calriven.com'); // true
const isFake = await verifier.isWhitelisted('calos.ai'); // false
```

### Add New Domain

```javascript
const result = await verifier.addDomain('newdomain.com');
// Verifies via DNS before adding
// Auto-updates public whitelist
```

## How It Works

1. **DNS Verification** - Checks if domain resolves (A/AAAA records)
2. **Public Whitelist** - Saves to `public/domains.json`
3. **Database Storage** - Tracks verification history
4. **Auto-Update** - Regenerates whitelist on add/remove

## API Routes

```javascript
// Verify a domain
POST /api/domains/verify
{ "domain": "calriven.com" }

// Get whitelist
GET /api/domains/whitelist
GET /domains.json (public)

// Add domain (requires auth)
POST /api/domains/add
{ "domain": "newdomain.com" }

// Check if whitelisted
GET /api/domains/check/:domain
```

## Real Culture Packs

Fixed card game to use REAL patterns from YOUR codebase:

```bash
# Generate culture packs from YOUR code
./bin/generate-real-culture-packs

# This scans agent-router/ for:
# - God objects
# - Nested callbacks
# - Magic numbers
# - TODO comments
# - Design patterns
# - REAL code from YOUR files
```

**Before:** Blank emojis, fake patterns
**After:** "God object in router.js" (REAL file), "nested callbacks in lib/oauth-wizard.js" (REAL pattern)

## Database Schema

```sql
CREATE TABLE domain_verifications (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  verified BOOLEAN DEFAULT FALSE,
  ipv4 JSONB,
  ipv6 JSONB,
  verified_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE known_domains (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  added_at TIMESTAMP DEFAULT NOW()
);
```

## Benefits

✅ **Verifiable** - Anyone can check domains.json
✅ **No fake domains** - Only DNS-verified domains
✅ **Public source of truth** - Hosted at calriven.com/domains.json
✅ **Auto-updating** - Regenerates on changes
✅ **Real patterns** - Card game uses YOUR actual code

## Migration

Replaced all fake references:

```
calos.ai → calriven.com
calos.games → apps.calriven.com
cards.calos.games → cards.calriven.com
*.calos.* → *.calriven.com
```

Now everything uses YOUR real domain!
