# CALOS Branding Enforcement System

## Overview

**Enforces CALOS branding** based on domain and license tier.

**TL;DR**:
- `calos.sh` domains = Full CALOS branding (logo, footer, colors)
- Self-hosted + Community tier = "Powered by CALOS" footer required
- Self-hosted + Pro/Enterprise = White-label allowed (no branding)

---

## Branding Rules

| Domain | Tier | Branding | Can Remove? |
|--------|------|----------|-------------|
| `calos.sh` | Any | Full (logo + footer + colors) | ❌ No |
| `*.calos.sh` | Any | Full (logo + footer + colors) | ❌ No |
| `example.com` | Development | None | ✅ Yes (localhost) |
| `example.com` | Community | Minimal ("Powered by CALOS" footer) | ❌ No |
| `example.com` | Pro | None (white-label) | ✅ Yes |
| `example.com` | Enterprise | None (white-label + custom) | ✅ Yes |

---

## What Gets Injected

### Full Branding (calos.sh domains)

**Header**:
- CALOS logo (gradient circle with "C")
- "CALOS" text
- Sticky header at top of page
- Purple gradient background (#667eea → #764ba2)

**Footer**:
- CALOS logo (small)
- "Powered by CALOS"
- Tagline: "Open source • Self-host free • Fair trade"
- Links: Home, Marketplace, Pricing, Docs, GitHub

### Minimal Branding (Community tier)

**Footer only**:
- Small text: "Powered by CALOS • Upgrade to remove this"
- No logo
- No colors
- No header

### No Branding (Pro/Enterprise)

Nothing injected. User controls everything.

---

## How It Works

### Server-Side (Middleware)

```javascript
// server.js
const { licenseMiddleware } = require('./lib/middleware/license-middleware');
const { brandingMiddleware, serveBrandingCSS, serveBrandingJS } = require('./lib/middleware/branding-middleware');

// 1. Check license tier
app.use(licenseMiddleware);

// 2. Inject branding based on tier
app.use(brandingMiddleware);

// 3. Serve branding assets
app.get('/calos-branding.css', serveBrandingCSS);
app.get('/calos-branding.js', serveBrandingJS);
```

**What the middleware does**:
1. Detects hostname (`calos.sh`, `example.com`, `localhost`)
2. Checks license tier from `req.license.tier`
3. Determines branding level (`full`, `minimal`, `none`)
4. Injects branding HTML into `req.branding`

### Client-Side (JavaScript)

Loaded automatically when branding is required:

```html
<script src="/calos-branding.js"></script>
```

**What the client-side script does**:
1. Detects branding level from DOM
2. Re-injects branding if user tries to remove it (Community tier)
3. Uses `MutationObserver` to watch for DOM changes
4. Checks every 5 seconds as backup

**Example**:
```javascript
// Community tier user tries to remove footer
document.querySelector('.calos-branding-footer').remove();

// → Client-side script detects removal after 1 second
// → Re-injects footer automatically
console.warn('[CALOSBranding] Branding removed! Re-injecting...');
```

---

## Integration

### Option 1: Auto-Inject (Recommended)

Use `autoInjectBranding` middleware to automatically inject branding into HTML responses:

```javascript
const { autoInjectBranding } = require('./lib/middleware/branding-middleware');

app.use(licenseMiddleware);
app.use(brandingMiddleware);
app.use(autoInjectBranding);  // Auto-inject into HTML responses

app.get('/', (req, res) => {
  res.send('<html><head></head><body><h1>Hello</h1></body></html>');
  // → Branding automatically injected
});
```

### Option 2: Manual Injection (Templates)

Use branding in your templates:

```html
<!-- EJS template -->
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
  <% if (req.branding.css) { %>
    <link rel="stylesheet" href="<%= req.branding.css %>">
  <% } %>
</head>
<body>
  <%- req.branding.header %>

  <main>
    <!-- Your content here -->
  </main>

  <%- req.branding.footer %>

  <% if (req.branding.js) { %>
    <script src="<%= req.branding.js %>"></script>
  <% } %>
</body>
</html>
```

### Option 3: Helper Function

Use the `injectBranding()` helper:

```javascript
const { injectBranding } = require('./lib/middleware/branding-middleware');

app.get('/custom', (req, res) => {
  let html = '<html><head></head><body><h1>Custom Page</h1></body></html>';

  // Inject branding
  html = injectBranding(html, req.branding);

  res.send(html);
});
```

---

## API

### `req.branding` Object

Attached to every request by `brandingMiddleware`:

```javascript
{
  level: 'full',              // 'full', 'minimal', 'none'
  header: '<div>...</div>',   // Header HTML (or empty string)
  footer: '<div>...</div>',   // Footer HTML (or empty string)
  css: '/calos-branding.css', // CSS file path (or null)
  js: '/calos-branding.js',   // JS file path (or null)
  preventRemoval: true        // Should client-side prevent removal?
}
```

### `req.license` Object

Extended by `licenseMiddleware`:

```javascript
{
  tier: 'community',          // 'development', 'community', 'pro', 'enterprise'
  valid: true,
  features: {
    whiteLabel: false,
    multiDomain: false,
    apiAccess: false,
    prioritySupport: false
  },
  allowWhiteLabel: false      // NEW: Can user remove branding?
}
```

---

## Enforcement Mechanism

### Community Tier

**Server-Side**:
- `brandingMiddleware` injects footer HTML
- `req.branding.preventRemoval = true`
- Sets `X-CALOS-Branding-Required: true` header

**Client-Side**:
- `/calos-branding.js` loads automatically
- `MutationObserver` watches for footer removal
- If removed → Re-injects after 1 second
- Checks every 5 seconds as backup

**Result**: User **cannot** remove branding on Community tier.

### Pro/Enterprise Tier

**Server-Side**:
- `brandingMiddleware` returns empty strings
- `req.branding.preventRemoval = false`
- No branding assets loaded

**Client-Side**:
- `/calos-branding.js` doesn't load
- No monitoring
- User controls everything

**Result**: User **can** white-label (remove all branding).

---

## Bypassing (Anti-Tampering)

### What Happens If User Tries to Bypass?

#### Scenario 1: Remove footer HTML (Community tier)

```javascript
// User tries this in browser console:
document.querySelector('.calos-branding-footer').remove();

// Result:
// - MutationObserver detects removal
// - Footer re-injected after 1 second
// - Console warning: "Branding removed! Re-injecting..."
```

#### Scenario 2: Block `/calos-branding.js` (Community tier)

```javascript
// User blocks script in browser
// Result:
// - Footer still injected by server (in HTML)
// - Can be removed manually, but...
// - On next page load, footer is back (server injects it)
```

#### Scenario 3: Modify CSS to hide footer (Community tier)

```css
/* User adds this CSS */
.calos-branding-footer { display: none !important; }

/* Result: Footer is hidden visually, but still in DOM */
/* License check on next verification detects tampering */
```

#### Scenario 4: Fake Pro tier (Modify `req.license.tier`)

```javascript
// User tries to modify license tier in code
req.license.tier = 'pro';  // Fake Pro tier

// Result:
// - License server verifies on next check (24h)
// - Server detects mismatch (install ID vs tier)
// - Account flagged, branding re-enforced
```

**Bottom Line**: Community tier users **cannot** permanently remove branding without upgrading.

---

## Upgrade Path

### Show Upgrade Link

In minimal branding footer:

```html
Powered by <a href="https://calos.sh">CALOS</a>
• <a href="https://calos.sh/pricing">Upgrade to remove this</a>
```

### Check White-Label Permission

```javascript
app.get('/settings', (req, res) => {
  if (req.license.allowWhiteLabel) {
    res.json({ message: 'White-label enabled! Remove branding in settings.' });
  } else {
    res.json({
      message: 'Upgrade to Pro ($29/mo) to remove branding',
      upgradeUrl: 'https://calos.sh/pricing'
    });
  }
});
```

---

## Testing

### Test Localhost (Development)

```bash
# Start server
npm start

# Open http://localhost:5001
# Expected: No branding (development tier)
```

### Test Community Tier

```javascript
// Mock license verification
req.license = {
  tier: 'community',
  allowWhiteLabel: false
};

// Expected: Minimal footer ("Powered by CALOS")
// Expected: Footer re-injects if removed
```

### Test Pro Tier

```javascript
req.license = {
  tier: 'pro',
  allowWhiteLabel: true
};

// Expected: No branding
// Expected: No client-side monitoring
```

### Test calos.sh Domain

```javascript
req.hostname = 'calos.sh';

// Expected: Full branding (logo + footer)
// Expected: Purple gradient header
// Expected: Cannot remove (re-injects)
```

---

## Customization

### Custom Branding (Enterprise)

Enterprise tier can add **custom** branding instead of CALOS branding:

```javascript
// Override branding for Enterprise tier
app.use((req, res, next) => {
  if (req.license.tier === 'enterprise') {
    req.branding = {
      level: 'custom',
      header: '<div class="my-custom-header">My Brand</div>',
      footer: '<div class="my-custom-footer">© 2024 My Company</div>',
      css: '/my-branding.css',
      js: null,
      preventRemoval: false
    };
  }
  next();
});
```

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `lib/middleware/branding-middleware.js` | Server-side branding injection | 350+ |
| `public/components/calos-branding.js` | Client-side enforcement | 400+ |
| `public/styles/calos-branding.css` | CALOS brand styles | 350+ |
| `lib/middleware/license-middleware.js` | Updated with `allowWhiteLabel` flag | 292 |

---

## Summary

✅ **calos.sh domains**: Full branding (logo, footer, colors)
✅ **Community tier**: Minimal branding ("Powered by CALOS" footer)
✅ **Pro/Enterprise tier**: White-label (no branding)
✅ **Client-side enforcement**: Re-inject if removed (Community tier)
✅ **Server-side injection**: Auto-inject into HTML responses
✅ **Graceful degradation**: Never blocks, just warns

**The WordPress model for business operating systems.**

---

**Built with ❤️ by CALOS**

*Open source • Self-host free • Fair trade • Branding enforcement*
