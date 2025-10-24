# CALOS DNS Mapping

**Version:** 1.0.0
**Last Updated:** 2025-10-23
**Purpose:** DNS and subdomain architecture for CALOS platform

---

## Overview

This document maps the DNS architecture across:
1. **GitHub Pages** (soulfra.github.io) - Static site hosting
2. **Subdomain System** (*.soulfra.com, *.calriven.com, etc.) - Dynamic subdomains
3. **API Gateway** (localhost:5001) - Backend API server
4. **Registry System** - Subdomain registration via GitHub PRs

---

## Primary Domains

### GitHub Pages (Static Hosting)

```
soulfra.github.io → GitHub Pages (primary deployment)
```

**Type:** CNAME
**Hosting:** GitHub Pages
**SSL:** GitHub-managed (Let's Encrypt)
**Deploy:** `git push` to `soulfra/soulfra.github.io` repo
**Status:** ✅ LIVE (22+ HTML pages deployed)

### Custom Domain Mapping (Optional)

```
soulfra.com → soulfra.github.io
www.soulfra.com → soulfra.github.io
```

**DNS Records (Cloudflare/Route53):**
```
CNAME   www              soulfra.github.io
ALIAS   @                soulfra.github.io
TXT     @                "github-pages-verification=..."
```

**SSL:** GitHub Pages + Custom Domain SSL
**Config:** `CNAME` file in repo root containing `soulfra.com`

---

## Subdomain Architecture

### Dynamic Subdomain System

**Registry:** `lib/subdomain-registry.js`
**Method:** GitHub PR-based (inspired by is-a.dev)
**Available Parent Domains:** 12 total

```javascript
// From lib/subdomain-registry.js
this.availableDomains = [
  'soulfra.com',           // Primary
  'calriven.com',          // Secondary
  'deathtodata.com',       // Data privacy brand
  'finishthisidea.com',    // Idea marketplace
  'finishthisrepo.com',    // Code marketplace
  'ipomyagent.com',        // AI agent IPOs
  'hollowtown.com',        // Gaming/metaverse
  'coldstartkit.com',      // Startup tools
  'brandaidkit.com',       // Branding tools
  'dealordelete.com',      // Time-limited offers
  'saveorsink.com',        // Project rescue
  'cringeproof.com'        // Content quality filter
];
```

### Subdomain Types

#### 1. Personal Subdomains
```
{username}.soulfra.com → User profile/dashboard
{username}.calriven.com → User portfolio

Examples:
- matt.soulfra.com → Matthew's profile
- alice.calriven.com → Alice's portfolio
- dev.finishthisrepo.com → Developer showcase
```

**DNS Record:**
```
CNAME   {username}       soulfra.github.io
```

**Registration:** GitHub PR to `subdomain-registry` repo
**Verification:** GitHub account ownership check

#### 2. Industry Subdomains
```
crypto.soulfra.com → Crypto industry landing
finance.soulfra.com → Finance industry landing
healthcare.soulfra.com → Healthcare industry landing
legal.soulfra.com → Legal industry landing
education.soulfra.com → Education industry landing
```

**DNS Record:**
```
CNAME   crypto           soulfra.github.io
CNAME   finance          soulfra.github.io
CNAME   healthcare       soulfra.github.io
CNAME   legal            soulfra.github.io
CNAME   education        soulfra.github.io
```

**Routing:** Hash-based routing in `index.html`
```
crypto.soulfra.com → loads soulfra.github.io → routes to #industry/crypto
```

#### 3. Feature Subdomains
```
auth.soulfra.com → Authentication hub (#auth)
pay.soulfra.com → Payment processing (#pay)
api.soulfra.com → API documentation
docs.soulfra.com → Documentation
status.soulfra.com → System status
```

**DNS Record:**
```
CNAME   auth             soulfra.github.io
CNAME   pay              soulfra.github.io
CNAME   api              soulfra.github.io
CNAME   docs             soulfra.github.io
CNAME   status           soulfra.github.io
```

#### 4. Service Subdomains (API)
```
localhost:5001 → Local development API
api.soulfra.com → Production API (future)
```

**Current:** Development only (localhost:5001)
**Future:** Deploy API to cloud (Railway, Fly.io, Render)

**DNS Record (Future):**
```
CNAME   api              calos-api-production.railway.app
```

---

## DNS Record Types

### CNAME Records (Subdomains)

Used for all subdomains pointing to GitHub Pages:

```dns
; Personal subdomains
matt.soulfra.com.        CNAME   soulfra.github.io.
alice.calriven.com.      CNAME   soulfra.github.io.

; Industry subdomains
crypto.soulfra.com.      CNAME   soulfra.github.io.
finance.soulfra.com.     CNAME   soulfra.github.io.
healthcare.soulfra.com.  CNAME   soulfra.github.io.

; Feature subdomains
auth.soulfra.com.        CNAME   soulfra.github.io.
pay.soulfra.com.         CNAME   soulfra.github.io.
api.soulfra.com.         CNAME   soulfra.github.io.
```

**TTL:** 300 seconds (5 minutes) for flexibility
**Proxy Status:** Proxied (via Cloudflare) for DDoS protection + caching

### ALIAS/ANAME Records (Root Domain)

Used for root domain (`soulfra.com`) since CNAME not allowed on apex:

```dns
; Root domain
soulfra.com.             ALIAS   soulfra.github.io.
calriven.com.            ALIAS   soulfra.github.io.
```

**Note:** ALIAS records are Cloudflare/Route53 specific. For other DNS providers, use A records pointing to GitHub Pages IPs:

```dns
soulfra.com.             A       185.199.108.153
soulfra.com.             A       185.199.109.153
soulfra.com.             A       185.199.110.153
soulfra.com.             A       185.199.111.153
```

### TXT Records (Verification)

Used for domain ownership verification:

```dns
; GitHub Pages verification
_github-pages-challenge-soulfra.soulfra.com.  TXT  "abc123..."

; Google Workspace (if using Gmail)
soulfra.com.                                   TXT  "google-site-verification=..."
```

---

## Subdomain Registration Flow

### User Registration Process

**Registry:** `lib/subdomain-registry.js`

#### Step 1: User Requests Subdomain
```bash
# Via CLI
./bin/subdomain-register matt soulfra.com

# Or via Web UI
https://soulfra.github.io/#subdomain/register
```

#### Step 2: Verify GitHub Account
```javascript
// From lib/subdomain-registry.js
async verifyOwnership(username) {
  const response = await fetch(`https://api.github.com/users/${username}`);
  if (!response.ok) throw new Error('GitHub user not found');
  return response.json();
}
```

#### Step 3: Generate PR
```javascript
// Create subdomain config JSON
{
  "subdomain": "matt",
  "domain": "soulfra.com",
  "target": "soulfra.github.io",
  "owner": {
    "github": "matthewmauer",
    "email": "matt@example.com",
    "verified": true
  },
  "created": "2025-10-23T12:00:00Z"
}
```

#### Step 4: Admin Approval
- PR reviewed by CALOS team
- GitHub account verified
- Subdomain availability checked
- DNS records created

#### Step 5: Activation
```bash
# DNS update (Cloudflare API)
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "matt",
    "content": "soulfra.github.io",
    "ttl": 300,
    "proxied": true
  }'
```

#### Step 6: Propagation
- DNS propagation: 5-60 minutes
- SSL certificate: Automatic via GitHub Pages
- User notified via email

---

## SSL/TLS Configuration

### GitHub Pages SSL (Automatic)

GitHub automatically provisions SSL for custom domains via Let's Encrypt:

```
soulfra.github.io → ✅ SSL (automatic)
soulfra.com → ✅ SSL (after CNAME verification)
*.soulfra.com → ✅ SSL (wildcard via GitHub Pages)
```

**Requirements:**
1. CNAME record pointing to `soulfra.github.io`
2. `CNAME` file in repo containing custom domain
3. "Enforce HTTPS" enabled in GitHub Pages settings

**Certificate Type:** Let's Encrypt (90-day renewal, auto-renewed)
**Protocols:** TLS 1.2, TLS 1.3
**Cipher Suites:** Modern (forward secrecy enabled)

### Cloudflare SSL (Optional)

If using Cloudflare in front of GitHub Pages:

**SSL Mode:** Full (strict)
**Edge Certificates:** Universal SSL (automatic)
**Client Certificates:** Optional for API endpoints

```
User → Cloudflare (SSL) → GitHub Pages (SSL) → Static Site
     HTTPS             HTTPS
```

---

## API Gateway DNS

### Current Architecture (Development)

```
soulfra.github.io (Browser)
  ↓ fetch()
localhost:5001 (API)
```

**Bridge:** `lib/github-pages-bridge.js`
**CORS:** Disabled (same-origin via localhost)
**Auth:** BYOK (Bring Your Own Key) via localStorage

### Future Architecture (Production)

```
soulfra.github.io (Browser)
  ↓ fetch()
api.soulfra.com (API)
  ↓
Railway/Fly.io/Render (Node.js)
```

**DNS Record:**
```dns
api.soulfra.com.    CNAME    calos-api.railway.app.
```

**CORS:** Allowed origins:
```javascript
const allowedOrigins = [
  'https://soulfra.github.io',
  'https://soulfra.com',
  'https://*.soulfra.com',
  'https://*.calriven.com'
];
```

**SSL:** Platform-managed (Railway/Fly.io)
**Auth:** JWT + API keys + BYOK

---

## Domain-Specific Routing

### Hash-Based Routing

Each subdomain can route to different hash routes:

```
crypto.soulfra.com → loads soulfra.github.io#industry/crypto
  ↓ JavaScript detects subdomain
window.location.hostname === 'crypto.soulfra.com'
  ↓ Auto-routes to
window.location.hash = '#industry/crypto'
```

**Implementation:**
```javascript
// In index.html
window.addEventListener('load', () => {
  const subdomain = window.location.hostname.split('.')[0];

  const subdomainRoutes = {
    'crypto': '#industry/crypto',
    'finance': '#industry/finance',
    'healthcare': '#industry/healthcare',
    'legal': '#industry/legal',
    'education': '#industry/education',
    'auth': '#auth',
    'pay': '#pay',
    'docs': '#docs',
    'status': '#status'
  };

  const route = subdomainRoutes[subdomain];
  if (route && !window.location.hash) {
    window.location.hash = route;
  }
});
```

---

## DNS Provider Configuration

### Cloudflare (Recommended)

**Advantages:**
- Free SSL certificates
- DDoS protection
- CDN caching
- API for automation
- Analytics

**DNS Records:**
```dns
; Root domain
soulfra.com.              ALIAS   soulfra.github.io.  [Proxied]
www.soulfra.com.          CNAME   soulfra.github.io.  [Proxied]

; Industry subdomains
crypto.soulfra.com.       CNAME   soulfra.github.io.  [Proxied]
finance.soulfra.com.      CNAME   soulfra.github.io.  [Proxied]
healthcare.soulfra.com.   CNAME   soulfra.github.io.  [Proxied]

; Personal subdomains (dynamic)
matt.soulfra.com.         CNAME   soulfra.github.io.  [Proxied]
alice.soulfra.com.        CNAME   soulfra.github.io.  [Proxied]

; API subdomain (future)
api.soulfra.com.          CNAME   calos-api.railway.app. [DNS Only]
```

**Page Rules:**
```
*soulfra.com/* → Cache Level: Standard, Browser TTL: 4 hours
api.soulfra.com/* → Cache Level: Bypass (API should not cache)
```

### Route53 (AWS)

**Advantages:**
- ALIAS records for apex domains
- Geo-routing
- Health checks
- Integration with AWS services

**DNS Records:**
```dns
; Root domain (ALIAS)
soulfra.com.              ALIAS   soulfra.github.io.

; Subdomains (CNAME)
*.soulfra.com.            CNAME   soulfra.github.io.
```

**Note:** Wildcard CNAME (`*.soulfra.com`) covers all subdomains but may not work with GitHub Pages. Prefer individual CNAME records.

---

## Security Considerations

### DNS Security Extensions (DNSSEC)

**Status:** Not supported by GitHub Pages
**Workaround:** Use Cloudflare proxy mode for DDoS protection

### Subdomain Takeover Prevention

**Risk:** Dangling CNAME records pointing to deleted GitHub Pages
**Mitigation:**
1. Regular audits of CNAME records
2. Monitor for 404 errors on subdomains
3. Delete unused CNAME records

**Example Attack:**
```
old-project.soulfra.com → CNAME → deleted-repo.github.io
                                    ↑ Attacker recreates deleted-repo
```

**Prevention:**
```javascript
// In lib/subdomain-registry.js
async checkSubdomainHealth(subdomain, domain) {
  const url = `https://${subdomain}.${domain}`;
  const response = await fetch(url);
  if (response.status === 404) {
    console.warn(`Subdomain takeover risk: ${subdomain}.${domain}`);
  }
}
```

### Content Security Policy (CSP)

**Recommendation:** Add CSP headers to prevent XSS

```html
<!-- In index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' http://localhost:5001 https://api.soulfra.com;
  img-src 'self' data: https:;
  font-src 'self';
  frame-ancestors 'none';
">
```

---

## Monitoring & Analytics

### DNS Monitoring

**Tools:**
- Cloudflare Analytics (if using Cloudflare)
- DNSPerf for uptime monitoring
- UptimeRobot for subdomain health checks

**Metrics:**
- DNS query volume
- Response time
- Error rate (NXDOMAIN, SERVFAIL)

### Subdomain Analytics

Track subdomain usage via Google Analytics or Plausible:

```javascript
// In index.html
const subdomain = window.location.hostname.split('.')[0];
if (subdomain !== 'soulfra' && subdomain !== 'www') {
  // Track custom dimension
  gtag('event', 'subdomain_visit', {
    subdomain: subdomain,
    full_hostname: window.location.hostname
  });
}
```

---

## Migration Plan

### Phase 1: GitHub Pages (Current)
```
soulfra.github.io → GitHub Pages (static)
localhost:5001 → Development API
```

✅ **Status:** LIVE

### Phase 2: Custom Domain
```
soulfra.com → GitHub Pages (custom domain)
*.soulfra.com → Subdomain system
localhost:5001 → Development API
```

**TODO:**
1. Purchase domain (soulfra.com) if not owned
2. Configure DNS (Cloudflare)
3. Add CNAME file to repo
4. Enable "Enforce HTTPS" in GitHub Pages settings

### Phase 3: Production API
```
soulfra.com → GitHub Pages (static)
api.soulfra.com → Railway/Fly.io (API)
```

**TODO:**
1. Deploy API to production (Railway/Fly.io/Render)
2. Configure CNAME for api.soulfra.com
3. Update github-pages-bridge.js to use production API
4. Migrate environment variables

### Phase 4: Multi-Region (Future)
```
soulfra.com → Cloudflare CDN → GitHub Pages
api-us.soulfra.com → US region API
api-eu.soulfra.com → EU region API
```

**Geo-Routing:**
```
User in US → api-us.soulfra.com
User in EU → api-eu.soulfra.com
```

---

## Subdomain Limits

### GitHub Pages Limits
- **Subdomains:** Unlimited (DNS limited, not GitHub)
- **SSL Certificates:** Automatic for all subdomains
- **Bandwidth:** 100 GB/month soft limit
- **Build Size:** 1 GB repository size limit

### DNS Provider Limits

**Cloudflare (Free Plan):**
- DNS records: Unlimited
- Proxied traffic: Unlimited
- Page Rules: 3 (upgrade for more)

**Route53:**
- Hosted zones: 500 (soft limit)
- Records per zone: 10,000
- Queries: $0.40/million (first billion queries)

---

## Documentation & Tools

### Subdomain Registry Files
- `lib/subdomain-registry.js` - Core registry logic
- `bin/subdomain-register` - CLI tool
- `docs/SUBDOMAIN-REGISTRY.md` - Full documentation

### DNS Management Tools
- Cloudflare API: `lib/cloudflare-dns-manager.js` (to be created)
- Route53 API: `lib/route53-dns-manager.js` (to be created)

### Testing & Validation
```bash
# Check DNS propagation
dig matt.soulfra.com

# Check SSL certificate
openssl s_client -connect matt.soulfra.com:443 -servername matt.soulfra.com

# Check subdomain routing
curl -I https://crypto.soulfra.com
```

---

## Quick Reference

### DNS Record Cheat Sheet

| Record Type | Use Case | Example |
|-------------|----------|---------|
| **CNAME** | Subdomain → GitHub Pages | `matt.soulfra.com → soulfra.github.io` |
| **ALIAS** | Root domain → GitHub Pages | `soulfra.com → soulfra.github.io` |
| **A** | Root domain → IP (fallback) | `soulfra.com → 185.199.108.153` |
| **TXT** | Domain verification | `_github-pages-challenge-soulfra` |
| **MX** | Email routing (if needed) | `soulfra.com → mx.google.com` |

### Subdomain Naming Rules

✅ **Allowed:**
- Lowercase letters (a-z)
- Numbers (0-9)
- Hyphens (-) in middle

❌ **Not Allowed:**
- Uppercase letters
- Underscores (_)
- Special characters (@, #, $, etc.)
- Starting/ending with hyphen

**Examples:**
- ✅ `matt.soulfra.com`
- ✅ `crypto-finance.soulfra.com`
- ✅ `api-v2.soulfra.com`
- ❌ `Matt.soulfra.com` (uppercase)
- ❌ `my_subdomain.soulfra.com` (underscore)
- ❌ `-test.soulfra.com` (starts with hyphen)

---

## Next Steps

1. **Purchase Domains** (if not owned)
   - soulfra.com (primary)
   - calriven.com (secondary)
   - Other brandaidkit.com, dealordelete.com, etc.

2. **Configure DNS**
   - Set up Cloudflare or Route53
   - Add CNAME records for subdomains
   - Enable SSL/TLS

3. **Deploy Subdomain Registry**
   - Set up GitHub repo for PR-based registration
   - Configure Cloudflare API for automation
   - Test registration flow

4. **Deploy Production API**
   - Choose platform (Railway/Fly.io/Render)
   - Configure api.soulfra.com CNAME
   - Update github-pages-bridge.js

---

**Related Docs:**
- `ROUTING-MATRIX.md` - URL routing structure
- `INDUSTRY-COMPLIANCE-MATRIX.csv` - Industry compliance mapping
- `lib/subdomain-registry.js` - Subdomain registration logic
- `lib/github-pages-bridge.js` - Static-to-API bridge
