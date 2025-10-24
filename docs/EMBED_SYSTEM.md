# CALOS Embed System - Osano-like Embeddable Scripts

**Add cookie consent, OAuth login, and analytics to ANY website with one `<script>` tag.**

---

## What Is This?

CALOS Embed is like **Osano** (cookie consent) + **Auth0** (login) + **Google Tag Manager** (analytics) combined into one embeddable script.

### Features

✅ **Cookie Consent Banner** - GDPR/CCPA compliant
✅ **OAuth Login Widget** - Social login integration
✅ **Privacy-First Analytics** - No third-party cookies
✅ **Customizable Appearance** - Brand colors, position, text
✅ **Zero Configuration** - Works out of the box
✅ **Lightweight** - ~15KB gzipped

---

## Quick Start

### 1. Deploy CALOS

Deploy your own CALOS instance using one of these methods:

- **Replit:** Fork and run (30 seconds)
- **Render.com:** Free hosting with auto-deploy
- **Railway.app:** $5/month credit included

See [ONE_CLICK_DEPLOY.md](../ONE_CLICK_DEPLOY.md) for deployment guides.

### 2. Create an Embed Site

Visit your CALOS instance at `/embed-dashboard.html`:

```
https://your-calos-instance.onrender.com/embed-dashboard.html
```

Click **"Create New Site"** and fill in:

- **Domain:** `example.com`
- **Site Name:** `My Website`
- **Description:** Brief description
- **Allowed Origins:** (optional) Restrict to specific domains

You'll get a **Site ID** and **API Key**.

### 3. Get Embed Code

Click **"Get Embed Code"** on your site card. You'll see:

```html
<!-- CALOS Embed (Consent + Auth + Analytics) -->
<script async src="https://your-calos.onrender.com/calos-embed.js" data-site-id="ABC123DEF456"></script>
```

### 4. Add to Your Website

Paste the embed code in your HTML, either:

- In the `<head>` section
- Before `</body>` tag

**That's it!** The script will automatically:

- Show cookie consent banner on first visit
- Track page views (if consent given)
- Enable OAuth login (if configured)

---

## How It Works

### Architecture

```
Your Website
    ↓
calos-embed.js (15KB)
    ↓
CALOS API (/embed/:siteId/*)
    ↓
PostgreSQL (embed_* tables)
```

### What Gets Tracked

**IF consent given:**
- Page views
- Session duration
- Referrer sources
- Feature usage
- Conversions

**Always tracked (essential):**
- Consent choices
- Authentication events

**Never tracked:**
- Third-party cookies
- Cross-site tracking
- Personal browsing history
- Keystrokes or form data

---

## Customization

### Theme Colors

```javascript
// In embed dashboard, update site config:
{
  "theme": {
    "backgroundColor": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "textColor": "white",
    "primaryColor": "#667eea"
  }
}
```

### Consent Text

```javascript
{
  "consentText": {
    "title": "We Value Your Privacy",
    "description": "Choose what data you want to share with us.",
    "acceptButton": "Accept All",
    "rejectButton": "Essential Only"
  }
}
```

### Features

Enable/disable features per site:

```javascript
{
  "consentEnabled": true,
  "authEnabled": true,
  "analyticsEnabled": true
}
```

---

## JavaScript API

The embed script exposes a global `CALOS` object:

### Track Custom Events

```javascript
// Track button click
CALOS.track('button_click', {
  buttonId: 'subscribe',
  location: 'header'
});

// Track form submission
CALOS.track('form_submit', {
  formName: 'newsletter_signup'
});
```

### Track Conversions

```javascript
// Track purchase
CALOS.conversion('purchase', 99.99, 'USD');

// Track signup
CALOS.conversion('signup', 0, 'USD');
```

### Get IDs

```javascript
const visitorId = CALOS.getVisitorId();
const sessionId = CALOS.getSessionId();
```

### Check Consent

```javascript
if (CALOS.hasConsent()) {
  // User has given consent
  loadThirdPartyScripts();
}
```

### Show Consent Banner Again

```javascript
CALOS.showConsent();
```

---

## REST API

### Public Endpoints

**GET `/embed/:siteId/config`**
Get site configuration (theme, features, text)

**POST `/embed/:siteId/event`**
Track event from embedded script

**GET `/embed/:siteId/consent?visitorId=xyz`**
Get consent status for visitor

**POST `/embed/:siteId/consent`**
Save consent preferences

### Protected Endpoints (Require Auth)

**POST `/api/embed/sites`**
Create new embed site

**GET `/api/embed/sites`**
List all sites for user

**GET `/api/embed/sites/:siteId`**
Get site details (includes API key)

**PATCH `/api/embed/sites/:siteId`**
Update site configuration

**DELETE `/api/embed/sites/:siteId`**
Delete site

**GET `/api/embed/sites/:siteId/analytics`**
Get analytics for site

**POST `/api/embed/sites/:siteId/compute-analytics`**
Manually compute analytics for a date

---

## Analytics Dashboard

### View Analytics

Visit the embed dashboard:

```
https://your-calos.onrender.com/embed-dashboard.html
```

### Metrics Tracked

- **Unique Visitors** - Daily/weekly/monthly
- **Total Sessions** - Number of visits
- **Total Page Views** - Pages viewed
- **Avg Session Duration** - Time on site
- **Avg Pages Per Session** - Engagement
- **Bounce Rate** - Single-page visits
- **Consent Stats** - Shown, accepted, rejected
- **Auth Stats** - Login attempts, signups
- **Conversions** - Purchases, signups, etc.

### Daily Aggregation

Analytics are computed daily via cron job:

```bash
# Run daily at midnight
0 0 * * * curl -X POST https://your-calos.onrender.com/api/embed/sites/ABC123/compute-analytics
```

Or manually trigger:

```bash
curl -X POST https://your-calos.onrender.com/api/embed/sites/ABC123/compute-analytics \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-01-15"}'
```

---

## CORS Configuration

### Allowed Origins

By default, all origins are allowed. To restrict:

1. Go to embed dashboard
2. Click site settings
3. Add allowed origins:

```
https://example.com
https://www.example.com
https://*.example.com
```

### Wildcard Patterns

- `https://example.com` - Exact match
- `https://*.example.com` - Subdomain wildcard
- `*` - Allow all (default)

---

## Database Schema

### Tables

- **embed_sites** - Registered sites
- **embed_events** - Raw events from embedded scripts
- **embed_consents** - Consent preferences
- **embed_sessions** - Visitor sessions
- **embed_analytics** - Aggregated daily statistics
- **embed_widgets** - Custom widgets (future)

### Migration

Run migration to create tables:

```bash
npm run migrate
```

Or manually:

```bash
psql $DATABASE_URL < migrations/069_embed_system.sql
```

---

## Comparison to Alternatives

| Feature | CALOS Embed | Osano | Auth0 | Google Analytics |
|---------|-------------|-------|-------|------------------|
| Cookie Consent | ✅ | ✅ | ❌ | ❌ |
| OAuth Login | ✅ | ❌ | ✅ | ❌ |
| Analytics | ✅ | ❌ | ❌ | ✅ |
| Privacy-First | ✅ | ✅ | ⚠️ | ❌ |
| Self-Hosted | ✅ | ❌ | ❌ | ❌ |
| Free Tier | ✅ | Limited | Limited | ✅ |
| Custom Branding | ✅ | ❌ | ❌ | ❌ |

---

## Use Cases

### 1. Add Consent Banner to Existing Site

```html
<!-- Just add this line -->
<script async src="https://your-calos.onrender.com/calos-embed.js" data-site-id="ABC123"></script>
```

Instant GDPR/CCPA compliance!

### 2. Add Social Login

Enable `authEnabled` in dashboard, configure OAuth providers, and visitors can log in with Google/GitHub/etc.

### 3. Track Custom Events

```javascript
// Track video plays
document.querySelector('video').addEventListener('play', () => {
  CALOS.track('video_play', { videoId: 'intro-video' });
});

// Track downloads
document.querySelector('.download-btn').addEventListener('click', () => {
  CALOS.track('file_download', { fileName: 'whitepaper.pdf' });
});
```

### 4. E-Commerce Conversions

```javascript
// After successful purchase
CALOS.conversion('purchase', cartTotal, 'USD');
```

### 5. Track Attribution

The embed script automatically captures:
- Referrer URL
- UTM parameters
- Entry/exit pages

View attribution in analytics dashboard.

---

## Privacy & Compliance

### GDPR Compliant

- ✅ Consent banner shown on first visit
- ✅ Opt-in required for analytics
- ✅ Clear consent choices
- ✅ Revocable consent
- ✅ Data retention limits (90 days)

### CCPA Compliant

- ✅ Opt-out mechanism
- ✅ "Do Not Sell" support
- ✅ Visitor IDs anonymized
- ✅ No third-party sharing

### Privacy Features

- **IP Hashing** - IPs hashed (SHA-256), not stored raw
- **Anonymous Visitor IDs** - Random UUIDs
- **No Third-Party Cookies** - Only first-party session storage
- **Data Retention** - Auto-delete after 90 days
- **No Cross-Site Tracking** - Each site isolated

---

## Troubleshooting

### Script Not Loading

**Problem:** `net::ERR_BLOCKED_BY_CLIENT` in console

**Solution:** Ad blocker is blocking the script. Test in incognito mode.

### CORS Errors

**Problem:** `Access-Control-Allow-Origin` error

**Solution:** Add your domain to allowed origins in embed dashboard.

### Events Not Tracking

**Problem:** No events appearing in analytics

**Checklist:**
1. Consent given? (check browser console: `CALOS.hasConsent()`)
2. Site status active? (check embed dashboard)
3. `analyticsEnabled` true? (check site config)

### Consent Banner Not Showing

**Problem:** Banner doesn't appear

**Checklist:**
1. `consentEnabled` true in site config
2. Consent not already given (check localStorage: `calos_visitor_id`)
3. Clear localStorage and refresh

---

## Advanced

### Webhooks

Configure a webhook URL to receive events in real-time:

```javascript
// In site settings
{
  "webhookUrl": "https://your-api.com/calos-webhook",
  "webhookSecret": "your-secret-key"
}
```

Events are POSTed with HMAC signature for verification.

### Server-Side Tracking

Use API key for server-side event tracking:

```bash
curl -X POST https://your-calos.onrender.com/embed/ABC123/event \
  -H "Authorization: Bearer sk_yourapikey" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "visitorId": "visitor-xyz",
    "eventType": "conversion",
    "eventName": "purchase",
    "eventData": { "value": 99.99, "currency": "USD" }
  }'
```

### Custom Widgets

Future feature: Build custom widgets (chat, feedback forms, etc.)

```javascript
// Coming soon
{
  "widgets": [
    {
      "type": "chat",
      "position": "bottom-right",
      "config": { "greeting": "Hi! How can we help?" }
    }
  ]
}
```

---

## Pricing

**CALOS Embed is FREE!**

- ✅ Unlimited sites
- ✅ Unlimited events
- ✅ Unlimited visitors
- ✅ Full analytics
- ✅ Custom branding

**Costs:**
- Hosting: Free (Render/Replit) or $7/month (24/7 uptime)
- Database: Free (SQLite) or $7/month (PostgreSQL)

**Total: $0-14/month**

Compare to:
- Osano: $149/month
- Auth0: $23/month
- Google Analytics: Free (but tracks everything)

---

## Support

### Documentation

- [Deployment Guide](ONE_CLICK_DEPLOY.md)
- [API Reference](EMBED_API.md)
- [Privacy Policy Template](PRIVACY_POLICY_TEMPLATE.md)

### Community

- Discord: https://discord.gg/calos
- Issues: https://github.com/calos/agent-router/issues

### Contributing

Pull requests welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Examples

### Basic Implementation

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <!-- CALOS Embed -->
  <script async src="https://your-calos.onrender.com/calos-embed.js" data-site-id="ABC123"></script>
</head>
<body>
  <h1>Welcome!</h1>
  <button onclick="CALOS.track('cta_click', { cta: 'hero' })">
    Get Started
  </button>
</body>
</html>
```

### E-Commerce Example

```html
<!-- Product page -->
<script>
document.addEventListener('DOMContentLoaded', () => {
  // Track product view
  CALOS.track('product_view', {
    productId: '{{ product.id }}',
    productName: '{{ product.name }}',
    price: {{ product.price }}
  });
});
</script>

<!-- Checkout success page -->
<script>
CALOS.conversion('purchase', {{ order.total }}, 'USD');
</script>
```

### SaaS Example

```html
<!-- After signup -->
<script>
CALOS.conversion('signup', 0, 'USD');
CALOS.track('signup_complete', {
  plan: 'free',
  source: '{{ referrer }}'
});
</script>

<!-- After upgrade -->
<script>
CALOS.conversion('upgrade', {{ plan.price }}, 'USD');
CALOS.track('plan_upgrade', {
  fromPlan: 'free',
  toPlan: 'pro'
});
</script>
```

---

## Roadmap

### Planned Features

- [ ] **Custom Widgets** - Chat, feedback forms, surveys
- [ ] **A/B Testing** - Test different consent texts
- [ ] **Heat Maps** - Click tracking visualization
- [ ] **Session Replay** - Watch visitor sessions
- [ ] **Real-Time Dashboard** - Live visitor tracking
- [ ] **Email Alerts** - Anomaly detection
- [ ] **Multi-Language** - Automatic translation
- [ ] **Dark Mode** - Theme support

---

**Made with ❤️ by CALOS**

*Privacy-first • Self-hosted • Free forever*
