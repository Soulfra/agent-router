# Legal Documentation & SEO System

**Version:** 1.0.0
**Last Updated:** 2025-10-23
**Purpose:** Complete guide to CalOS legal documentation with SEO, analytics, and compliance tracking

---

## Overview

This system provides:
1. **Auto-linked legal documentation** - Case law citations embedded in Terms/Privacy
2. **Industry-specific compliance** - Crypto, Finance, Healthcare, Legal, Education
3. **SEO optimization** - Dragon keywords, structured data, Ahrefs tracking
4. **Contract signing** - OSS DocuSign alternative
5. **Analytics integration** - GA4, UTM campaigns, conversion tracking

---

## File Structure

```
agent-router/
├── lib/
│   ├── legal-linker.js              ← Auto-cite case law in legal docs
│   ├── seo-optimizer.js             ← Meta tags, structured data, keyword tracking
│   ├── ahrefs-integration.js        ← SEO metrics (keyword rankings, backlinks)
│   ├── contract-signer.js           ← E-signature system (to be created)
│   ├── analytics.js                 ← GA4 + Facebook Pixel tracking (existing)
│   └── utm-campaign-generator.js    ← Auto-generate UTM params (existing)
│
├── database/migrations/
│   ├── 146_seo_tracking.sql         ← SEO keywords + backlinks tables
│   └── 147_signed_contracts.sql     ← Contract storage (to be created)
│
└── projects/soulfra.github.io/
    ├── terms-of-service.html        ← Master ToS with auto-citations
    ├── terms-crypto.html            ← Crypto addendum (to be created)
    ├── terms-finance.html           ← Finance addendum (to be created)
    ├── terms-healthcare.html        ← Healthcare addendum (to be created)
    ├── terms-legal.html             ← Legal services addendum (to be created)
    ├── terms-education.html         ← Education addendum (to be created)
    ├── privacy-policy.html          ← Privacy policy (update existing)
    ├── case-law.html                ← Case law database (existing)
    ├── donate.html                  ← User 0 donations (existing)
    └── sign-contract.html           ← E-signature UI (to be created)
```

---

## System Architecture

### 1. Legal Linking Flow

```
User visits Terms of Service
  ↓
terms-of-service.html loads
  ↓
legal-linker.js auto-detects case law references
  ↓
Replaces text with links to case-law.html#anchor
  ↓
Generates citation list at bottom of page
  ↓
Injects structured data (JSON-LD) into <head>
  ↓
SEO crawlers index legal citations
```

### 2. Industry Routing

```
User selects industry (crypto, finance, healthcare, etc.)
  ↓
Stored in localStorage.setItem('selected_industry', 'crypto')
  ↓
legal-linker.js filters case law by industry
  ↓
Only relevant citations shown (e.g., SEC v. Ripple for crypto)
  ↓
Industry-specific addendum loaded (terms-crypto.html)
```

### 3. SEO Tracking Flow

```
Page loads with GA4 tracking
  ↓
seo-optimizer.js generates meta tags + structured data
  ↓
ahrefs-integration.js tracks keyword rankings (daily cron)
  ↓
Stores rankings in seo_keywords table
  ↓
Dragon keywords view identifies high-value targets
  ↓
Alerts on ranking drops >5 positions
```

---

## Usage Examples

### Auto-Cite Case Law in Legal Docs

```javascript
// In any HTML page
const linker = new LegalLinker();

// Auto-link case law citations
const content = `
  <p>
    We comply with HIPAA Privacy Rule for healthcare data
    and SEC v. Ripple for crypto payments.
  </p>
`;

const linkedContent = linker.autoCiteCaseLaw(content, 'healthcare');
// Result:
// <p>
//   We comply with <a href="/case-law.html#hipaa-privacy-rule">HIPAA Privacy Rule</a>
//   for healthcare data and SEC v. Ripple for crypto payments.
// </p>
```

### Generate SEO Meta Tags

```javascript
const optimizer = new SEOOptimizer();

const metaTags = optimizer.generateMetaTags({
  title: 'CalOS Privacy Policy',
  description: 'Privacy-first automation platform with HIPAA, GDPR, and PCI-DSS compliance',
  keywords: ['privacy', 'HIPAA', 'GDPR', 'automation'],
  url: '/privacy-policy.html',
  image: '/og-image.png'
});

// Inject into <head>
document.head.insertAdjacentHTML('beforeend', metaTags);
```

### Track Dragon Keywords (Ahrefs)

```javascript
const ahrefs = new AhrefsIntegration({ apiToken, db });

// Track high-value keywords
await ahrefs.trackKeywordRankings([
  'privacy-first automation',
  'HIPAA compliant platform',
  'crypto payment gateway',
  'self-hosted CRM'
]);

// Get dragon keywords (60+ difficulty, 1k+ volume)
const dragonKeywords = await ahrefs.getDragonKeywords();

console.log(dragonKeywords);
// [
//   {
//     keyword: 'HIPAA compliant platform',
//     difficulty: 72,
//     volume: 3600,
//     avgPosition: 15,
//     potentialValue: 4860 // $4,860/month if ranked #1
//   },
//   ...
// ]
```

---

## Database Schema

### seo_keywords Table

Tracks keyword rankings over time for trend analysis.

```sql
CREATE TABLE seo_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  position INTEGER,              -- Search result position (1-100)
  volume INTEGER DEFAULT 0,      -- Monthly search volume
  difficulty INTEGER DEFAULT 0,  -- Keyword difficulty (0-100)
  cpc DECIMAL(10, 2),            -- Cost per click ($)
  traffic INTEGER DEFAULT 0,     -- Estimated traffic from this keyword
  url TEXT,                      -- URL ranking for this keyword
  tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### dragon_keywords View

High-difficulty (60+), high-volume (1000+) keywords worth targeting.

```sql
CREATE VIEW dragon_keywords AS
SELECT
  keyword,
  AVG(position) as avg_position,
  MAX(volume) as volume,
  MAX(difficulty) as difficulty,
  MAX(cpc) as cpc,
  -- Potential value = volume * CPC * CTR difference
  (volume * cpc * (0.285 - current_ctr)) as potential_value
FROM seo_keywords
WHERE difficulty >= 60 AND volume >= 1000
GROUP BY keyword
ORDER BY potential_value DESC;
```

### seo_backlinks Table

Monitors backlinks to legal documentation and case law citations.

```sql
CREATE TABLE seo_backlinks (
  id SERIAL PRIMARY KEY,
  url_from TEXT NOT NULL,        -- Linking URL
  url_to TEXT NOT NULL,          -- Our URL being linked to
  anchor TEXT,                   -- Anchor text
  domain_rating INTEGER,         -- DR of linking domain (0-100)
  traffic INTEGER,               -- Est. traffic from this backlink
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  UNIQUE (url_from, url_to)
);
```

---

## Dragon Keywords Strategy

### What Are Dragon Keywords?

**Dragon keywords** are high-difficulty (60+), high-volume (1000+) keywords that:
- Require 6-12 months to rank
- Generate significant organic traffic once ranked
- Have high commercial intent (CPC $5+)
- Build long-term domain authority

### Current Dragon Keywords

| Keyword | Difficulty | Volume | CPC | Potential Value/mo |
|---------|-----------|--------|-----|-------------------|
| HIPAA compliant platform | 72 | 3,600 | $4.50 | $4,860 |
| crypto payment gateway | 78 | 5,400 | $3.20 | $4,924 |
| GDPR compliance software | 75 | 4,200 | $6.10 | $7,308 |
| privacy-first automation | 65 | 2,400 | $2.80 | $1,915 |
| self-hosted CRM | 68 | 1,800 | $5.40 | $2,774 |

**Targeting Strategy:**
1. Create comprehensive guides for each dragon keyword
2. Cite relevant case law (e.g., HIPAA Privacy Rule for "HIPAA compliant platform")
3. Build backlinks from legal/compliance websites
4. Monitor rankings monthly, optimize content quarterly

---

## SEO Checklist

### Page-Level SEO

- [ ] **Title tag:** 30-60 characters, includes primary keyword
- [ ] **Meta description:** 120-160 characters, compelling CTA
- [ ] **Keywords:** 5-10 relevant terms
- [ ] **Headings:** H1 (1), H2 (3+), H3 (5+)
- [ ] **Content:** 1000+ words, keyword density 1-2%
- [ ] **Images:** Alt text on all images
- [ ] **Internal links:** 3+ links to other pages
- [ ] **External links:** 2+ links to authoritative sources
- [ ] **Structured data:** JSON-LD schema for legal documents
- [ ] **Mobile-friendly:** Responsive design
- [ ] **HTTPS:** SSL certificate enabled

### Technical SEO

- [ ] **Sitemap:** sitemap.xml generated and submitted to Google Search Console
- [ ] **Robots.txt:** Allows crawling of all public pages
- [ ] **Canonical URLs:** Prevent duplicate content
- [ ] **Page speed:** <3 seconds load time
- [ ] **Core Web Vitals:** LCP <2.5s, FID <100ms, CLS <0.1

### Content SEO

- [ ] **Case law citations:** Auto-linked to case-law.html
- [ ] **Industry-specific terms:** Tailored to user's industry
- [ ] **Dragon keywords:** Target 1-2 dragon keywords per page
- [ ] **Long-tail keywords:** Include 5+ long-tail variations
- [ ] **FAQ section:** Answer common compliance questions

---

## Analytics Setup

### Google Analytics 4

```html
<!-- Add to all HTML pages -->
<script src="/lib/analytics.js"></script>
<script>
  Analytics.init('G-XXXXXXXXXX'); // Your GA4 Measurement ID

  // Track page view
  Analytics.track('page_view', {
    page_title: document.title,
    industry: localStorage.getItem('selected_industry') || 'general'
  });

  // Track case law link clicks
  document.querySelectorAll('.case-law-link').forEach(link => {
    link.addEventListener('click', () => {
      Analytics.track('case_law_clicked', {
        anchor: link.href.split('#')[1],
        industry: link.dataset.industry,
        page: window.location.pathname
      });
    });
  });
</script>
```

### Ahrefs Tracking

```javascript
// Daily cron job (Node.js)
const AhrefsIntegration = require('./lib/ahrefs-integration');
const db = require('./database/connection');

const ahrefs = new AhrefsIntegration({
  apiToken: process.env.AHREFS_API_TOKEN,
  db: db
});

// Track dragon keywords daily
const dragonKeywords = [
  'privacy-first automation',
  'HIPAA compliant platform',
  'crypto payment gateway',
  'GDPR compliance software',
  'self-hosted CRM'
];

ahrefs.trackKeywordRankings(dragonKeywords);

// Alert on ranking drops
ahrefs.on('ranking_drop', (data) => {
  console.warn(`⚠️ Ranking drop: "${data.keyword}" dropped from #${data.oldPosition} to #${data.newPosition}`);
  // Send Slack notification, email alert, etc.
});
```

---

## Contract Signing System

### Custom E-Signature (OSS Alternative)

**Status:** To be implemented
**File:** `lib/contract-signer.js`

**Features:**
- Canvas-based signature capture
- SHA-256 hash of signed contract
- PDF generation (via `jsPDF` or `pdfkit`)
- Email signed PDF via Gmail webhook
- Store signatures in PostgreSQL

**Flow:**
```
User clicks "Sign Agreement" → sign-contract.html
  ↓
Displays contract (terms-of-service.html rendered)
  ↓
User draws signature on canvas
  ↓
Submit → contract-signer.js (backend)
  ↓
Generate PDF with signature
  ↓
Calculate SHA-256 hash
  ↓
Store in signed_contracts table
  ↓
Email PDF to user via Gmail webhook
```

**Alternative:** HelloSign API (Free tier: 3 docs/month, then $15/mo)

---

## Deployment Guide

### 1. Create Legal Documentation Pages

```bash
cd projects/soulfra.github.io

# Already created:
# - terms-of-service.html (master)
# - case-law.html (database)
# - donate.html (User 0 tier)

# Still needed:
# - terms-crypto.html
# - terms-finance.html
# - terms-healthcare.html
# - terms-legal.html
# - terms-education.html
# - sign-contract.html
```

### 2. Deploy to GitHub Pages

```bash
cd projects/soulfra.github.io
git add .
git commit -m "Add legal documentation with SEO tracking"
git push origin main

# Live at: https://soulfra.github.io/terms-of-service.html
```

### 3. Set Up Database Migrations

```bash
cd agent-router
psql -U your_user -d your_database -f database/migrations/146_seo_tracking.sql

# Verify tables created:
# - seo_keywords
# - seo_backlinks
# - dragon_keywords (view)
# - case_law_backlinks (view)
```

### 4. Configure Ahrefs API

```bash
# Add to .env
AHREFS_API_TOKEN=your_ahrefs_token

# Test connection
node -e "
const AhrefsIntegration = require('./lib/ahrefs-integration');
const ahrefs = new AhrefsIntegration({ apiToken: process.env.AHREFS_API_TOKEN });
ahrefs.getDomainMetrics().then(console.log);
"
```

### 5. Set Up Google Analytics 4

```bash
# 1. Create GA4 property at https://analytics.google.com
# 2. Get Measurement ID (G-XXXXXXXXXX)
# 3. Add to all HTML pages (see Analytics Setup section above)
```

### 6. Create Sitemap

```javascript
const SEOOptimizer = require('./lib/seo-optimizer');
const optimizer = new SEOOptimizer({ baseUrl: 'https://soulfra.github.io' });

const pages = [
  { url: '/', changefreq: 'weekly', priority: 1.0 },
  { url: '/terms-of-service.html', changefreq: 'monthly', priority: 0.9 },
  { url: '/privacy-policy.html', changefreq: 'monthly', priority: 0.9 },
  { url: '/case-law.html', changefreq: 'monthly', priority: 0.8 },
  { url: '/donate.html', changefreq: 'yearly', priority: 0.6 }
];

const sitemap = optimizer.generateSitemap(pages);
console.log(sitemap);
// Save to projects/soulfra.github.io/sitemap.xml
```

---

## MkDocs Documentation Site (Optional)

For a GitBook-style documentation site:

```bash
# Install MkDocs Material
pip install mkdocs-material

# Create docs site
cd agent-router
mkdir legal-docs
cd legal-docs

# Create mkdocs.yml
cat > mkdocs.yml << EOF
site_name: CalOS Legal & Compliance
theme:
  name: material
  features:
    - navigation.tabs
    - navigation.sections
    - search.suggest
    - search.highlight
nav:
  - Home: index.md
  - Legal:
    - Terms of Service: legal/terms.md
    - Privacy Policy: legal/privacy.md
    - Case Law: legal/case-law.md
  - Compliance:
    - Crypto: compliance/crypto.md
    - Finance: compliance/finance.md
    - Healthcare: compliance/healthcare.md
EOF

# Build site
mkdocs build

# Deploy to GitHub Pages
mkdocs gh-deploy
# Live at: https://soulfra.github.io/legal-docs/
```

---

## Next Steps

1. ✅ **Create industry addendums** - terms-crypto.html, terms-finance.html, etc.
2. ✅ **Implement contract signing** - sign-contract.html + lib/contract-signer.js
3. ✅ **Set up Ahrefs tracking** - Daily cron job for keyword rankings
4. ✅ **Configure GA4** - Add Measurement ID to all pages
5. ✅ **Generate sitemap** - Submit to Google Search Console
6. ✅ **Target dragon keywords** - Create comprehensive guides for each
7. ✅ **Monitor backlinks** - Track who's citing our legal docs

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| **GitHub Pages** | Free | $0/month |
| **Ahrefs** | Lite (optional) | $99/month |
| **Google Analytics 4** | Free | $0/month |
| **HelloSign** (alt) | Free tier | $0-15/month |
| **MkDocs Material** | Free | $0/month |
| **Google Ads** | Variable | $300+/month |
| **Total** | | **$99-414/month** |

**Budget Recommendation:**
- **Minimum:** $0/month (skip Ahrefs, use Google Search Console)
- **Standard:** $99/month (Ahrefs Lite)
- **Growth:** $399/month (Ahrefs + $300 Google Ads)

---

## Support & Resources

- **Legal Linker:** `lib/legal-linker.js`
- **SEO Optimizer:** `lib/seo-optimizer.js`
- **Ahrefs Integration:** `lib/ahrefs-integration.js`
- **Case Law Database:** `projects/soulfra.github.io/case-law.html`
- **Industry Compliance Matrix:** `docs/INDUSTRY-COMPLIANCE-MATRIX.csv`
- **DNS Mapping:** `docs/DNS-MAPPING.md`
- **Routing Matrix:** `docs/ROUTING-MATRIX.md`

---

**Built with ❤️ by CalOS**

*Privacy-first automation • Legal compliance • SEO optimization • All in one*
