# CalOS Lesson System - Quick Start Guide

**5-Minute Deployment to GitHub Pages**

## What You Get

- 33 interactive lessons across 4 tracks
- 20 hands-on labs
- Progress tracking (no backend needed)
- Offline support
- Custom domain: `lessons.calos.com`

---

## Quick Deploy (3 Steps)

### 1. Generate Lesson Catalog

```bash
node scripts/generate-lessons-json.js
```

**Expected output:**
```
✅ Successfully generated lessons.json!
   Total lessons: 33
   Total XP: 4,210
```

### 2. Test Locally

```bash
# Start local server
npx http-server public -p 8080

# Open in browser
open http://localhost:8080/lessons/
```

Verify:
- ✅ Portal loads
- ✅ All 4 tracks visible
- ✅ Lessons load with content
- ✅ Labs open in iframe

### 3. Deploy to GitHub Pages

```bash
# Commit all files
git add public/lessons/* public/CNAME public/sitemap.xml public/robots.txt
git commit -m "Add lesson system for GitHub Pages"
git push origin main
```

**GitHub Pages Setup:**
1. Repository → Settings → Pages
2. Source: `main` branch, `/public` folder
3. Custom domain: `lessons.calos.com`
4. Enable "Enforce HTTPS"

**DNS Setup (at domain registrar):**
```
Type:  CNAME
Name:  lessons
Value: <your-github-username>.github.io
TTL:   3600
```

---

## Files Created

### Portal (`/public/lessons/`)
- `index.html` - Main lesson portal (6.2 KB)
- `app.js` - Router & state management (17 KB)
- `style.css` - Dark theme styles (16 KB)
- `lessons.json` - Lesson catalog (13 KB)
- `sw.js` - Service worker for offline (5.9 KB)

### Configuration (`/public/`)
- `CNAME` - Custom domain
- `sitemap.xml` - SEO sitemap
- `robots.txt` - Search engine directives

### Scripts (`/scripts/`)
- `generate-lessons-json.js` - Auto-generate catalog

### Documentation (`/docs/`)
- `GITHUB-PAGES-DEPLOY.md` - Complete deployment guide (800+ lines)
- `DEPLOYMENT-CHECKLIST.md` - Quick checklist
- `GITHUB-PAGES-SUMMARY.md` - Implementation summary

---

## Verify Deployment

```bash
# 1. Check DNS propagation
dig lessons.calos.com

# 2. Test HTTPS
curl -I https://lessons.calos.com/lessons/

# 3. Open portal
open https://lessons.calos.com/lessons/
```

---

## Architecture

```
User Browser
    ↓
lessons.calos.com (DNS CNAME)
    ↓
<username>.github.io/agent-router/lessons/
    ↓
GitHub Pages serves /public/ directory
    ↓
- index.html (portal)
- lessons.json (catalog)
- /docs/lessons/*.md (33 lessons)
- /labs/*.html (20 labs)
```

**Features:**
- Single-page application (SPA)
- No backend required
- Progress saved in localStorage
- Service Worker for offline
- Works on mobile and desktop

---

## Common Issues

### Portal shows 404
**Fix:** Check GitHub Pages is enabled and using `/public` folder

### DNS not resolving
**Fix:** Wait 15-60 min for DNS propagation

### SSL certificate not provisioning
**Fix:** Wait up to 24 hours after DNS propagates

### Progress not saving
**Fix:** Check localStorage is enabled (not private browsing)

---

## Next Steps

1. ✅ Deploy to GitHub Pages
2. ✅ Configure custom domain
3. ⏳ Add analytics (optional - Plausible/Simple Analytics)
4. ⏳ Set up Cloudflare CDN (optional)
5. ⏳ Create more lessons

---

## Full Documentation

For complete details, see:
- **[GITHUB-PAGES-DEPLOY.md](./docs/GITHUB-PAGES-DEPLOY.md)** - Complete deployment guide
- **[DEPLOYMENT-CHECKLIST.md](./docs/DEPLOYMENT-CHECKLIST.md)** - Pre-flight checklist
- **[GITHUB-PAGES-SUMMARY.md](./docs/GITHUB-PAGES-SUMMARY.md)** - Implementation summary

---

## Support

- **GitHub Issues:** https://github.com/calos/agent-router/issues
- **Discord:** https://discord.gg/calos
- **Documentation:** `/docs/`

---

**Built with ❤️ by CalOS**

*Privacy-first learning • Zero telemetry • Open source*
