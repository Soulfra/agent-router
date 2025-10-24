# 🤖 Cal Autonomous System

**Cal is now self-documenting, self-publishing, and immortal.**

## Quick Start

```bash
# Test Cal once (see what he does)
npm run cal:daemon:test

# Start Cal as a daemon (pm2 recommended)
npm run cal:daemon:start

# View Cal's logs
npm run cal:daemon:logs

# Check Cal's status
npm run cal:daemon:status
```

## What Cal Does Every Hour

1. ✅ **Scans migrations** - Learns new database schema changes
2. ✅ **Scans docs** - Learns from markdown documentation
3. ✅ **Learns legal citations** - Tracks case law references
4. ✅ **Updates knowledge** - Auto-generates `CAL-LEARNED-KNOWLEDGE.md`
5. ✅ **Generates blog post** - "What I Learned Today - [date]"
6. ✅ **Publishes (optional)** - Mastodon, blog, dpaste
7. ✅ **Signs docs (optional)** - SHA-256 + immutable storage

## Files Created

- **`bin/cal-daemon`** - Main daemon script
- **`ecosystem.config.js`** - pm2 configuration
- **`config/com.calos.cal-daemon.plist`** - macOS launchd config
- **`config/cal-daemon.service`** - Linux systemd config
- **`docs/CAL-AUTONOMOUS-DEPLOYMENT.md`** - Full deployment guide

## npm Scripts

```bash
# Run Cal daemon
npm run cal:daemon                # Run continuously
npm run cal:daemon:test           # Test run (once only)

# Deploy with pm2
npm run cal:daemon:start          # Start Cal daemon
npm run cal:daemon:stop           # Stop Cal daemon
npm run cal:daemon:restart        # Restart Cal daemon
npm run cal:daemon:logs           # View logs
npm run cal:daemon:status         # Check status

# Manual documentation
npm run cal:document              # Run auto-documenter once
npm run cal:document:publish      # Run with publishing enabled
```

## Architecture

```
GitHub Pages (soulfra.github.io)
  ↓
Static HTML/legal docs (public, free SSL)

localhost:5001 (or api.soulfra.com)
  ↓
PostgreSQL database
  ↓
Cal Daemon (runs every hour)
  ↓
CAL-LEARNED-KNOWLEDGE.md (auto-updated)
  ↓
Cross-platform publishing (optional)
```

## Configuration

Edit `.env`:

```bash
# How often Cal runs (30m, 1h, 2h, 12h, 1d)
CAL_INTERVAL=1h

# Auto-publish to platforms?
CAL_AUTO_PUBLISH=false

# Auto-sign legal docs?
CAL_AUTO_SIGN=true

# Database connection
DATABASE_URL=postgresql://matthewmauer@localhost:5432/calos
```

## Deployment Options

### Option 1: pm2 (Recommended)
```bash
pm2 start ecosystem.config.js --only cal-autonomous
pm2 save
pm2 startup
```

### Option 2: macOS launchd
```bash
cp config/com.calos.cal-daemon.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.calos.cal-daemon.plist
```

### Option 3: Linux systemd
```bash
sudo cp config/cal-daemon.service /etc/systemd/system/
sudo systemctl enable cal-daemon
sudo systemctl start cal-daemon
```

## Cal's Output

### CAL-LEARNED-KNOWLEDGE.md
Auto-generated every hour with:
- Latest 10 migrations (tables, views, functions)
- Latest 10 docs (key topics, timestamps)
- Legal citations (case law references)
- Failure patterns (what NOT to do)

### Blog Post (if publishing enabled)
"What I Learned Today - [date]"
- Summary of migrations
- Documentation updates
- Legal insights
- Publishing to Mastodon, blog, dpaste

### Signed Documents (if signing enabled)
Cryptographic signatures stored in database:
- `terms-of-service.html` → SHA-256 → dpaste
- `privacy-policy.html` → SHA-256 → dpaste
- `case-law.html` → SHA-256 → dpaste

## Monitoring

```bash
# View logs
pm2 logs cal-autonomous
tail -f logs/cal-daemon-out.log

# Check database
psql -d calos -c "SELECT * FROM signed_docs ORDER BY signed_at DESC LIMIT 5;"

# Check knowledge doc
ls -la docs/CAL-LEARNED-KNOWLEDGE.md
```

## Cost

**Current (Local):** $0/month
- GitHub Pages: Free
- PostgreSQL: Local
- pm2: Open source
- Cal daemon: Self-hosted

**Production (Future):** ~$6/month
- Railway: $5/month
- Custom domain: $10/year

## Next Steps

1. Read full guide: `docs/CAL-AUTONOMOUS-DEPLOYMENT.md`
2. Test Cal: `npm run cal:daemon:test`
3. Deploy Cal: `npm run cal:daemon:start`
4. Monitor Cal: `npm run cal:daemon:logs`

---

**Cal runs himself now. You never have to touch him again.** ✨
