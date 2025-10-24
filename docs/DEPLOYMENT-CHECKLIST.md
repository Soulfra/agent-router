# CalOS Lesson System - Deployment Checklist

Quick reference for deploying the CalOS lesson system to GitHub Pages.

## Pre-Deployment Checklist

- [ ] All 33 lesson markdown files exist in `/docs/lessons/`
- [ ] All 20 lab HTML files exist in `/public/labs/`
- [ ] `lessons.json` is up-to-date (run `node scripts/generate-lessons-json.js`)
- [ ] All file paths are correct (relative, not absolute)
- [ ] Service worker is registered in `index.html`
- [ ] CNAME file contains correct domain (`lessons.calos.com`)
- [ ] Meta tags are optimized in `index.html`
- [ ] Mobile responsiveness tested

## GitHub Pages Setup

- [ ] Repository settings → Pages → Source: `main` branch, `/public` folder
- [ ] Custom domain configured: `lessons.calos.com`
- [ ] DNS configured (CNAME record pointing to `<username>.github.io`)
- [ ] Enforce HTTPS enabled
- [ ] SSL certificate provisioned (wait 24 hours if needed)

## DNS Configuration

- [ ] CNAME record created at domain registrar
  ```
  Type:  CNAME
  Name:  lessons
  Value: calos.github.io
  TTL:   3600
  ```
- [ ] DNS propagation verified: `dig lessons.calos.com`
- [ ] SSL certificate active: `curl -I https://lessons.calos.com`

## Functionality Testing

- [ ] Portal loads at `https://lessons.calos.com/lessons/`
- [ ] All 4 tracks visible on homepage
- [ ] Track pages load with lesson lists
- [ ] Individual lessons load with markdown content
- [ ] Labs open in iframe
- [ ] Progress tracking works (complete a lesson, refresh page)
- [ ] XP and level updates correctly
- [ ] Achievements unlock properly
- [ ] Service worker registers (check DevTools → Application)
- [ ] Offline mode works (disable network in DevTools)

## Performance Testing

- [ ] Lighthouse score > 90 (Performance, Accessibility, Best Practices, SEO)
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] No console errors
- [ ] All assets load correctly (no 404s)

## SEO & Analytics

- [ ] Sitemap accessible: `https://lessons.calos.com/sitemap.xml`
- [ ] Robots.txt accessible: `https://lessons.calos.com/robots.txt`
- [ ] Meta tags visible in page source
- [ ] Open Graph tags present for social sharing
- [ ] Analytics configured (Plausible/Simple Analytics)

## Optional: CDN Setup

- [ ] Cloudflare account created
- [ ] Domain added to Cloudflare
- [ ] DNS migrated to Cloudflare
- [ ] Page rules configured for caching
- [ ] SSL mode set to "Full (strict)"
- [ ] Minification enabled (HTML, CSS, JS)

## Post-Deployment Verification

```bash
# 1. Check DNS
dig lessons.calos.com

# 2. Check SSL
curl -I https://lessons.calos.com/lessons/

# 3. Test portal
open https://lessons.calos.com/lessons/

# 4. Test specific lesson
open https://lessons.calos.com/lessons/#/mcp-development/mcp-1

# 5. Test lab
open https://lessons.calos.com/labs/mcp-client.html

# 6. Validate sitemap
curl https://lessons.calos.com/sitemap.xml

# 7. Check service worker
# DevTools → Application → Service Workers
```

## Rollback Plan

If deployment fails:

1. **Revert commit:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Disable custom domain temporarily:**
   - GitHub Settings → Pages → Custom domain → Remove

3. **Check GitHub Pages status:**
   - https://www.githubstatus.com/

4. **Review deployment logs:**
   - Repository → Actions → View workflow runs

## Common Issues

### Issue: 404 on Custom Domain
**Fix:** Wait for DNS propagation (up to 48 hours) or check CNAME file

### Issue: SSL Certificate Not Provisioning
**Fix:** Wait 24 hours, then disable/re-enable "Enforce HTTPS"

### Issue: Service Worker Not Registering
**Fix:** Must use HTTPS (or localhost for dev)

### Issue: Progress Not Saving
**Fix:** Check localStorage is enabled, not in private browsing mode

## Support

- **Documentation:** `/docs/GITHUB-PAGES-DEPLOY.md`
- **Issues:** https://github.com/calos/agent-router/issues
- **Discord:** https://discord.gg/calos

---

**Deployment Date:** _____________
**Deployed By:** _____________
**Version:** 1.0.0
**Status:** ☐ Success  ☐ Issues (describe below)

**Notes:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
