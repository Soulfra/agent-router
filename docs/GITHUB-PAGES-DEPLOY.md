# GitHub Pages Deployment Guide - CalOS Lesson System

Complete guide to deploying the CalOS lesson system to GitHub Pages with custom domain support.

## Table of Contents

1. [Quick Start](#quick-start)
2. [GitHub Pages Setup](#github-pages-setup)
3. [Custom Domain Configuration](#custom-domain-configuration)
4. [DNS Configuration](#dns-configuration)
5. [SSL Certificate](#ssl-certificate)
6. [CDN Setup (Optional)](#cdn-setup-optional)
7. [Troubleshooting](#troubleshooting)
8. [Performance Optimization](#performance-optimization)

---

## Quick Start

### Prerequisites

- GitHub account with access to the repository
- Domain registrar access (for custom domain)
- Basic knowledge of DNS configuration

### File Structure

```
agent-router/
  public/
    CNAME                      # Custom domain configuration
    lessons/
      index.html               # Main lesson portal
      style.css                # Unified dark theme
      app.js                   # Lesson router and state management
      lessons.json             # Lesson catalog metadata
    labs/                      # 20 interactive labs
      mcp-client.html
      card-opener.html
      ...
    docs/
      lessons/                 # 33 lesson markdown files
        mcp-development/
        rpg-card-game/
        zero-dependency/
        multi-tier/
```

---

## GitHub Pages Setup

### Step 1: Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Pages**
3. Under **Source**, select:
   - Branch: `main` (or your default branch)
   - Folder: `/public`
4. Click **Save**

GitHub Pages will automatically deploy from the `/public` directory.

### Step 2: Verify Deployment

After a few minutes, your site will be available at:

```
https://<username>.github.io/<repository-name>/
```

For example:
```
https://calos.github.io/agent-router/
```

### Step 3: Test the Deployment

Visit the URL and verify:
- Lesson portal loads (`/lessons/`)
- All 4 tracks are visible
- Labs are accessible
- Progress tracking works (localStorage)

---

## Custom Domain Configuration

### Step 1: Add CNAME File

The CNAME file is already created at `/public/CNAME`:

```
lessons.calos.com
```

This tells GitHub Pages to serve the site at `lessons.calos.com`.

### Step 2: Configure GitHub Pages Custom Domain

1. Go to **Settings** > **Pages**
2. Under **Custom domain**, enter: `lessons.calos.com`
3. Click **Save**
4. Wait for DNS check to complete (may take a few minutes)

### Step 3: Enforce HTTPS

After DNS propagates:
1. Check **Enforce HTTPS** in GitHub Pages settings
2. GitHub will automatically provision a Let's Encrypt SSL certificate

---

## DNS Configuration

Configure DNS records at your domain registrar (e.g., Namecheap, Cloudflare, GoDaddy).

### Option 1: CNAME Record (Recommended)

**Best for:** Subdomains like `lessons.calos.com`

```
Type:  CNAME
Name:  lessons
Value: <username>.github.io
TTL:   3600 (1 hour)
```

Example:
```
Type:  CNAME
Name:  lessons
Value: calos.github.io
TTL:   3600
```

### Option 2: ANAME/ALIAS Record

**Best for:** Apex domains like `calos.com`

```
Type:  ANAME (or ALIAS)
Name:  @
Value: <username>.github.io
TTL:   3600
```

### Option 3: A Records

**Fallback option** if ANAME/ALIAS not supported:

```
Type:  A
Name:  @
Value: 185.199.108.153
TTL:   3600

Type:  A
Name:  @
Value: 185.199.109.153
TTL:   3600

Type:  A
Name:  @
Value: 185.199.110.153
TTL:   3600

Type:  A
Name:  @
Value: 185.199.111.153
TTL:   3600
```

### DNS Propagation

- Typical time: 15-60 minutes
- Maximum time: 48 hours
- Check status: `dig lessons.calos.com`

```bash
# Verify DNS propagation
dig lessons.calos.com

# Should return:
# lessons.calos.com. 3600 IN CNAME calos.github.io.
```

---

## SSL Certificate

### Automatic SSL (Let's Encrypt)

GitHub Pages automatically provisions a free Let's Encrypt SSL certificate when:

1. Custom domain is configured
2. DNS is correctly pointing to GitHub Pages
3. "Enforce HTTPS" is enabled

### Certificate Issuance Timeline

- DNS must be propagated first
- Certificate provisioning: 1-24 hours
- Auto-renewal: Every 90 days

### Verify SSL Certificate

```bash
# Check SSL certificate
curl -I https://lessons.calos.com

# Should return:
# HTTP/2 200
# server: GitHub.com
```

### Troubleshooting SSL

If certificate doesn't provision:

1. Verify DNS is correct: `dig lessons.calos.com`
2. Wait 24 hours for DNS propagation
3. Temporarily disable and re-enable "Enforce HTTPS"
4. Check GitHub Pages status: https://www.githubstatus.com/

---

## CDN Setup (Optional)

### Cloudflare CDN

**Benefits:**
- Global CDN with 200+ locations
- DDoS protection
- Page rules and caching
- Analytics
- Free tier available

#### Setup Steps

1. **Add Site to Cloudflare**
   - Sign up at https://cloudflare.com
   - Add your domain: `calos.com`
   - Follow DNS migration wizard

2. **Configure DNS in Cloudflare**
   ```
   Type:  CNAME
   Name:  lessons
   Value: calos.github.io
   Proxy: Enabled (orange cloud)
   ```

3. **Page Rules**
   - Rule: `lessons.calos.com/*`
   - Settings:
     - Cache Level: Cache Everything
     - Edge Cache TTL: 1 hour
     - Browser Cache TTL: 4 hours

4. **SSL/TLS Settings**
   - Mode: Full (strict)
   - Always Use HTTPS: On
   - Automatic HTTPS Rewrites: On

5. **Speed Settings**
   - Auto Minify: HTML, CSS, JS
   - Brotli: On
   - HTTP/2: On
   - HTTP/3: On

### Performance Settings

```
# Cloudflare Page Rule Example
lessons.calos.com/lessons/*
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 hour
  - Browser Cache TTL: 4 hours

lessons.calos.com/labs/*
  - Cache Level: Cache Everything
  - Edge Cache TTL: 30 minutes

lessons.calos.com/docs/lessons/*.md
  - Cache Level: Cache Everything
  - Edge Cache TTL: 24 hours
```

---

## Troubleshooting

### Issue: 404 on Custom Domain

**Symptoms:**
- GitHub Pages URL works
- Custom domain returns 404

**Solutions:**
1. Verify CNAME file exists in `/public/CNAME`
2. Check DNS configuration: `dig lessons.calos.com`
3. Wait for DNS propagation (up to 48 hours)
4. Clear browser cache and try incognito mode

### Issue: SSL Certificate Not Provisioning

**Symptoms:**
- "Not Secure" warning in browser
- HTTPS doesn't work

**Solutions:**
1. Verify DNS is fully propagated
2. Wait 24 hours after DNS changes
3. Temporarily disable "Enforce HTTPS", wait 5 minutes, re-enable
4. Check GitHub Pages status page

### Issue: Lessons Not Loading

**Symptoms:**
- Portal loads but lessons are blank
- 404 errors in browser console

**Solutions:**
1. Check file paths in `lessons.json`
2. Verify markdown files exist in `/docs/lessons/`
3. Check browser console for CORS errors
4. Ensure all paths are relative (not absolute)

### Issue: Labs Not Embedded

**Symptoms:**
- Lab iframe shows blank or errors
- Console shows iframe sandbox violations

**Solutions:**
1. Check lab HTML files exist in `/public/labs/`
2. Verify iframe `sandbox` attribute allows scripts
3. Ensure labs don't have CORS restrictions
4. Test labs individually outside iframe

### Issue: Progress Not Saving

**Symptoms:**
- Completed lessons reset on page refresh
- XP not persisting

**Solutions:**
1. Check localStorage is enabled in browser
2. Verify browser isn't in private/incognito mode
3. Check browser console for localStorage errors
4. Clear localStorage and try again:
   ```javascript
   localStorage.removeItem('calos-lesson-progress');
   ```

---

## Performance Optimization

### 1. Enable Caching Headers

GitHub Pages automatically sets caching headers, but you can optimize with Cloudflare:

```
# Static assets (CSS, JS)
Cache-Control: public, max-age=3600

# Lesson content (markdown)
Cache-Control: public, max-age=86400

# Lesson metadata (JSON)
Cache-Control: public, max-age=3600
```

### 2. Minimize File Sizes

```bash
# Minify CSS (optional)
npx clean-css-cli -o public/lessons/style.min.css public/lessons/style.css

# Minify JavaScript (optional)
npx terser public/lessons/app.js -o public/lessons/app.min.js
```

### 3. Lazy Load Labs

Labs are already lazy-loaded via iframe. Only loaded when user clicks "Open Lab".

### 4. Prefetch Lessons

Add to `index.html` for faster navigation:

```html
<link rel="prefetch" href="lessons.json">
<link rel="prefetch" href="/docs/lessons/mcp-development/lesson-1-intro-to-mcp.md">
```

### 5. Service Worker (Offline Support)

Create `sw.js` in `/public/lessons/`:

```javascript
const CACHE_NAME = 'calos-lessons-v1';
const urlsToCache = [
  '/lessons/',
  '/lessons/index.html',
  '/lessons/style.css',
  '/lessons/app.js',
  '/lessons/lessons.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

Register in `index.html`:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/lessons/sw.js');
}
```

### 6. Image Optimization

For lesson screenshots or diagrams:

```bash
# Optimize PNGs
npx imagemin public/lessons/images/*.png --out-dir=public/lessons/images/

# Convert to WebP
npx imagemin public/lessons/images/*.png --plugin=webp --out-dir=public/lessons/images/
```

---

## SEO Optimization

### Meta Tags

Already included in `index.html`:

```html
<meta name="description" content="CalOS Lesson System - Privacy-first learning platform with 33 interactive lessons">
<meta property="og:title" content="CalOS Lesson System">
<meta property="og:description" content="Learn privacy-first development with 33 interactive lessons">
<meta property="og:image" content="/icon-512.png">
```

### Sitemap

Create `sitemap.xml` in `/public/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://lessons.calos.com/lessons/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://lessons.calos.com/lessons/#/mcp-development</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- Add more URLs -->
</urlset>
```

### Robots.txt

Create `robots.txt` in `/public/`:

```
User-agent: *
Allow: /

Sitemap: https://lessons.calos.com/sitemap.xml
```

---

## Analytics (Privacy-First)

### Option 1: Plausible Analytics

**Why:** Open-source, privacy-first, no cookies, GDPR compliant

```html
<!-- Add to index.html -->
<script defer data-domain="lessons.calos.com" src="https://plausible.io/js/script.js"></script>
```

### Option 2: Simple Analytics

**Why:** Lightweight, privacy-focused, no GDPR consent needed

```html
<!-- Add to index.html -->
<script async defer src="https://scripts.simpleanalyticscdn.com/latest.js"></script>
<noscript><img src="https://queue.simpleanalyticscdn.com/noscript.gif" alt="" referrerpolicy="no-referrer-when-downgrade" /></noscript>
```

### Option 3: Self-Hosted Umami

**Why:** 100% privacy, open-source, self-hosted

1. Deploy Umami: https://umami.is/docs/install
2. Add tracking code to `index.html`

---

## Maintenance

### Auto-Deploy on Push

GitHub Pages automatically deploys when you push to the main branch.

**Workflow:**
1. Make changes to `/public/lessons/`
2. Commit and push to `main`
3. GitHub Actions automatically rebuilds
4. Site updates in 1-2 minutes

### Update Lessons

To add or update lessons:

1. **Add/edit markdown file:**
   ```bash
   vim docs/lessons/mcp-development/lesson-10-new-lesson.md
   ```

2. **Update lessons.json:**
   ```bash
   node scripts/generate-lessons-json.js
   ```

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Add lesson 10: New MCP feature"
   git push origin main
   ```

### Cache Busting

If users see old content:

1. **Version assets:**
   ```html
   <link rel="stylesheet" href="style.css?v=1.0.1">
   <script src="app.js?v=1.0.1"></script>
   ```

2. **Clear Cloudflare cache:**
   - Go to Cloudflare dashboard
   - Caching > Purge Everything

---

## Production Checklist

Before going live:

- [ ] All 33 lessons have markdown files
- [ ] All 20 labs are functional
- [ ] `lessons.json` is up-to-date
- [ ] CNAME file is correct
- [ ] DNS is configured
- [ ] SSL certificate is active
- [ ] Cloudflare CDN is enabled (optional)
- [ ] Analytics are configured (privacy-first)
- [ ] Sitemap and robots.txt are created
- [ ] Meta tags are optimized
- [ ] Mobile responsiveness tested
- [ ] Offline mode tested
- [ ] Progress tracking tested
- [ ] All links work (no 404s)

---

## Resources

### GitHub Pages
- Documentation: https://docs.github.com/pages
- Status: https://www.githubstatus.com/

### DNS Tools
- DNS Checker: https://dnschecker.org/
- DNS Propagation: https://www.whatsmydns.net/

### SSL Tools
- SSL Test: https://www.ssllabs.com/ssltest/
- Certificate Checker: https://www.sslshopper.com/ssl-checker.html

### Performance Tools
- PageSpeed Insights: https://pagespeed.web.dev/
- WebPageTest: https://www.webpagetest.org/
- GTmetrix: https://gtmetrix.com/

### CDN Providers
- Cloudflare: https://cloudflare.com (Free)
- Fastly: https://www.fastly.com/
- BunnyCDN: https://bunny.net/

---

## Support

### Issues
- GitHub Issues: https://github.com/calos/agent-router/issues
- Discord: https://discord.gg/calos

### Documentation
- Main README: `/README.md`
- Lesson System: `/docs/LESSON-SYSTEM.md`
- Route Reference: `/docs/ROUTE-REFERENCE.md`

---

**Built with ❤️ by CalOS**

*Privacy-first learning • Zero telemetry • Open source*
