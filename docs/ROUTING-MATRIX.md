# CALOS Routing Matrix

**Version:** 1.0.0
**Last Updated:** 2025-10-23
**Purpose:** URL routing structure for soulfra.github.io and subdomain system

---

## Overview

This document maps the URL routing structure across:
1. **GitHub Pages** (soulfra.github.io) - Hash-based SPA routing
2. **Subdomain System** (*.soulfra.com, *.calriven.com, etc.) - User/industry-specific subdomains
3. **Industry Routing** - Compliance-driven page routing

---

## Base URL Structure

### Primary Domain
```
https://soulfra.github.io
```

### Subdomain Structure
```
https://{subdomain}.{parent-domain}

Examples:
- https://matt.soulfra.com (personal subdomain)
- https://crypto.soulfra.com (industry subdomain)
- https://legal.soulfra.com (industry subdomain)
- https://healthcare.soulfra.com (industry subdomain)
```

---

## Hash Routing Table

### Authentication Routes (`#auth/*`)

| Route | Page | Description | Industry |
|-------|------|-------------|----------|
| `#auth` | `index.html` | Auth landing page | All |
| `#auth/qr` | `qr-gis-login.html` | QR code login | All |
| `#auth/oauth` | `oauth-callback.html` | OAuth callback handler | All |
| `#auth/sheets` | `sheets-qr-auth.js` | Google Sheets auth | All |
| `#auth/nextauth` | Via NextAuth integration | NextAuth flow | All |
| `#auth/passkey` | Password manager integration | Passkey/WebAuthn | All |
| `#auth/voice` | Voice onboarding system | Voice questionnaire ($175) | Premium |

### Payment Routes (`#pay/*`)

| Route | Page | Description | Industry | Compliance |
|-------|------|-------------|----------|------------|
| `#pay` | Payment landing | Choose payment method | All | N/A |
| `#pay/stripe` | Stripe integration | Credit/debit cards | Finance, Healthcare | PCI-DSS |
| `#pay/coinbase` | Coinbase Commerce | Crypto payments | Crypto | AML/KYC |
| `#pay/paypal` | Braintree/PayPal | PayPal payments | Finance, Legal | PCI-DSS |
| `#pay/donate` | `donate.html` | User 0 donations | All | N/A |

### Legal Routes (`#legal/*`)

| Route | Page | Description | Industry | Required |
|-------|------|-------------|----------|----------|
| `#legal` | Legal landing | Legal hub | All | N/A |
| `#legal/terms` | `terms-of-service.html` | Terms of Service | All | Yes |
| `#legal/privacy` | `privacy-policy.html` | Privacy Policy | All | Yes |
| `#legal/pci` | `PCI-COMPLIANCE.md` | PCI-DSS compliance | Finance | Finance only |
| `#legal/hipaa` | `HIPAA-COMPLIANCE.md` | HIPAA compliance | Healthcare | Healthcare only |
| `#legal/ferpa` | `FERPA-COMPLIANCE.md` | FERPA compliance | Education | Education only |
| `#legal/case-law` | `case-law.html` | Industry case law | All | Recommended |

### Industry Routes (`#industry/*`)

| Route | Page | Description | Allowed Payments | Compliance Docs |
|-------|------|-------------|------------------|-----------------|
| `#industry/crypto` | Crypto landing | Crypto industry | Coinbase, Stripe | AML, KYC, SEC v. Ripple |
| `#industry/finance` | Finance landing | Financial services | Stripe, PayPal | PCI-DSS, SOC 2 |
| `#industry/healthcare` | Healthcare landing | Healthcare/medical | Stripe only | HIPAA, BAA |
| `#industry/legal` | Legal landing | Legal services | Stripe, PayPal | Attorney-Client Privilege |
| `#industry/education` | Education landing | Educational services | Donations allowed | FERPA, COPPA |

### Privacy & Dashboard Routes (`#privacy/*`)

| Route | Page | Description | Industry |
|-------|------|-------------|----------|
| `#privacy` | `privacy-dashboard.html` | Privacy settings dashboard | All |
| `#privacy/data` | Data export/delete | GDPR compliance | All |
| `#privacy/cookies` | Cookie preferences | Cookie consent | All |

---

## Subdomain Routing

### Personal Subdomains
```
https://{username}.soulfra.com → User profile/dashboard
https://{username}.calriven.com → User portfolio
```

**Registry:** `lib/subdomain-registry.js`
**Method:** GitHub PR-based (like is-a.dev)

### Industry Subdomains
```
https://crypto.soulfra.com → Crypto-specific compliance + Coinbase/Stripe
https://finance.soulfra.com → Financial services + PCI-DSS
https://healthcare.soulfra.com → HIPAA compliance + Stripe only
https://legal.soulfra.com → Legal services + case law
https://education.soulfra.com → FERPA compliance + donations
```

### Available Parent Domains
From `lib/subdomain-registry.js`:
- soulfra.com
- calriven.com
- deathtodata.com
- finishthisidea.com
- finishthisrepo.com
- ipomyagent.com
- hollowtown.com
- coldstartkit.com
- brandaidkit.com
- dealordelete.com
- saveorsink.com
- cringeproof.com

---

## Industry Compliance Matrix

See `INDUSTRY-COMPLIANCE-MATRIX.csv` for full matrix.

### Quick Reference

| Industry | Required Docs | Allowed Payments | Required Routes |
|----------|---------------|------------------|-----------------|
| **Crypto** | AML, KYC, SEC case law | Coinbase, Stripe | `#legal/case-law`, `#pay/coinbase` |
| **Finance** | PCI-DSS, SOC 2 | Stripe, PayPal | `#legal/pci`, `#pay/stripe` |
| **Healthcare** | HIPAA, BAA | Stripe only | `#legal/hipaa`, `#pay/stripe` |
| **Legal** | Attorney-Client Privilege | Stripe, PayPal | `#legal/case-law`, `#legal/terms` |
| **Education** | FERPA, COPPA | Donations OK | `#legal/ferpa`, `#pay/donate` |

---

## Payment Tier Routing

Based on reputation tier (from `database/migrations/145_identity_resolution.sql`):

| Tier | Reputation | Routes Allowed | Payment Methods |
|------|------------|----------------|-----------------|
| **Tier 1** (Unverified) | 0-99 | `#auth`, `#pay/donate` | Donations only |
| **Tier 2** (Email Verified) | 100-299 | `#auth/*`, `#pay/donate`, `#pay/stripe` | Stripe micro-payments |
| **Tier 3** (Multi-Account) | 300-599 | All except voice | All payment methods |
| **Tier 4** (Trusted) | 600-899 | All routes | All payment methods + bounties |
| **Tier 5** (Elite) | 900-1000 | All routes | All payment methods + instant payouts |

---

## DNS Mapping

### GitHub Pages (Static)
```
soulfra.github.io → GitHub Pages (static HTML/JS)
CNAME: soulfra.com → soulfra.github.io
```

### Localhost Bridge (Dynamic)
```
localhost:5001 → CalOS Agent Router (Node.js backend)
```

**Bridge:** `lib/github-pages-bridge.js`
**Purpose:** Connect static GitHub Pages to dynamic localhost API

### Subdomain DNS (Dynamic)
```
*.soulfra.com → Cloudflare/Route53 → GitHub Pages or localhost:5001
```

**Registry:** `lib/subdomain-registry.js`
**Method:** CNAME records managed via GitHub PR system

---

## Frontend Routing Implementation

### Hash Router (Client-Side)

**Location:** `soulfra.github.io/index.html`

```javascript
// Simple hash router
function route() {
  const hash = window.location.hash.slice(1) || ''; // Remove #
  const [section, ...rest] = hash.split('/');

  switch(section) {
    case 'auth':
      routeAuth(rest);
      break;
    case 'pay':
      routePayment(rest);
      break;
    case 'legal':
      routeLegal(rest);
      break;
    case 'industry':
      routeIndustry(rest);
      break;
    case 'privacy':
      routePrivacy(rest);
      break;
    default:
      showHome();
  }
}

// Listen for hash changes
window.addEventListener('hashchange', route);
window.addEventListener('load', route);
```

### Industry-Specific Routing

```javascript
function routeIndustry(path) {
  const [industry] = path;

  // Load industry-specific compliance requirements
  const compliance = getIndustryCompliance(industry);

  // Filter available payment methods
  const allowedPayments = compliance.allowedPayments;

  // Load required legal docs
  const requiredDocs = compliance.requiredDocs;

  // Render industry page with compliance constraints
  renderIndustryPage(industry, allowedPayments, requiredDocs);
}
```

---

## API Endpoints

### Gateway API
**Base:** `http://localhost:5001`
**Bridge:** `lib/github-pages-bridge.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/oauth` | POST | OAuth login |
| `/api/auth/qr` | POST | QR code login |
| `/api/auth/voice` | POST | Voice onboarding |
| `/api/payment/stripe` | POST | Stripe payment |
| `/api/payment/coinbase` | POST | Crypto payment |
| `/api/payment/donate` | POST | Donation (User 0) |
| `/api/identity/cluster` | GET | Get identity cluster |
| `/api/identity/tier` | GET | Get payment tier |
| `/api/compliance/industry` | GET | Get industry requirements |

---

## Navigation Matrix

### Primary Navigation

```
Home (#)
├── Auth (#auth)
│   ├── QR Login (#auth/qr)
│   ├── OAuth (#auth/oauth)
│   ├── Google Sheets (#auth/sheets)
│   └── Voice Onboarding (#auth/voice) [Premium]
├── Payments (#pay)
│   ├── Stripe (#pay/stripe)
│   ├── Coinbase (#pay/coinbase)
│   ├── PayPal (#pay/paypal)
│   └── Donate (#pay/donate) [User 0]
├── Legal (#legal)
│   ├── Terms (#legal/terms)
│   ├── Privacy (#legal/privacy)
│   ├── PCI Compliance (#legal/pci) [Finance]
│   ├── HIPAA Compliance (#legal/hipaa) [Healthcare]
│   ├── FERPA Compliance (#legal/ferpa) [Education]
│   └── Case Law (#legal/case-law)
├── Industries (#industry)
│   ├── Crypto (#industry/crypto)
│   ├── Finance (#industry/finance)
│   ├── Healthcare (#industry/healthcare)
│   ├── Legal (#industry/legal)
│   └── Education (#industry/education)
└── Privacy (#privacy)
    ├── Dashboard (#privacy)
    ├── Data Export/Delete (#privacy/data)
    └── Cookie Preferences (#privacy/cookies)
```

---

## Existing Pages (soulfra.github.io)

### Current Deployed Pages
From `projects/soulfra.github.io/`:

1. `index.html` - Homepage
2. `qr-gis-login.html` - QR login
3. `oauth-callback.html` - OAuth handler
4. `privacy-policy.html` - Privacy policy
5. `privacy-dashboard.html` - Privacy settings
6. `sheets-qr-auth.js` - Google Sheets auth
7. Plus 15+ other HTML pages

### Missing Pages (To Create)
1. `donate.html` - User 0 donation page
2. `case-law.html` - Industry case law
3. `terms-of-service.html` - Terms of Service
4. `industry-crypto.html` - Crypto industry landing
5. `industry-finance.html` - Finance industry landing
6. `industry-healthcare.html` - Healthcare industry landing
7. `industry-legal.html` - Legal industry landing
8. `industry-education.html` - Education industry landing

---

## Case Law Integration

### Crypto Industry
- **SEC v. Ripple** (2023) - XRP not a security
- **Tornado Cash** (2022) - Smart contract sanctions
- **Coinbase v. Bielski** (2023) - Securities classification

### Finance Industry
- **PCI-DSS v3.2.1** - Payment card security standards
- **Gramm-Leach-Bliley Act** - Financial privacy

### Healthcare Industry
- **HIPAA Privacy Rule** - Protected health information
- **Business Associate Agreement** requirements

### Legal Industry
- **Attorney-Client Privilege** - Communication protection
- **ABA Model Rules** - Professional conduct

### Education Industry
- **FERPA** - Student privacy
- **COPPA** - Children's online privacy

---

## Implementation Checklist

- [x] Document routing structure
- [x] Map hash routes to pages
- [x] Define subdomain structure
- [x] Map industry compliance requirements
- [ ] Create missing HTML pages
- [ ] Implement hash router in index.html
- [ ] Add industry-specific routing logic
- [ ] Create case-law.html with industry precedents
- [ ] Create donate.html for User 0 tier
- [ ] Update navigation to use hash routing
- [ ] Test routing across all pages
- [ ] Deploy to soulfra.github.io

---

## References

- **Subdomain Registry:** `lib/subdomain-registry.js`
- **GitHub Pages Bridge:** `lib/github-pages-bridge.js`
- **Identity Resolution:** `database/migrations/145_identity_resolution.sql`
- **Payment Tiers:** `docs/IDENTITY_RESOLUTION.md`
- **Industry Compliance:** `INDUSTRY-COMPLIANCE-MATRIX.csv` (to be created)
- **DNS Mapping:** `DNS-MAPPING.md` (to be created)

---

**Next Steps:**
1. Create `INDUSTRY-COMPLIANCE-MATRIX.csv`
2. Create `DNS-MAPPING.md`
3. Create `donate.html`
4. Create `case-law.html`
5. Implement hash routing in `index.html`
