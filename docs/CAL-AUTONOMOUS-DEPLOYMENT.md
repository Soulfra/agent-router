# Cal Autonomous Deployment Guide

**Version:** 1.0.0
**Last Updated:** 2025-10-24
**Purpose:** Deploy Cal as an autonomous, self-documenting AI system

---

## Overview

This guide walks you through deploying Cal as a **fully autonomous daemon** that:

1. ✅ **Runs on a schedule** - Every hour (configurable)
2. ✅ **Scans codebase** - Migrations, docs, legal files
3. ✅ **Updates knowledge** - CAL-LEARNED-KNOWLEDGE.md
4. ✅ **Generates blog posts** - "What I Learned Today"
5. ✅ **Publishes cross-platform** - Mastodon, blog, dpaste (optional)
6. ✅ **Signs documents** - SHA-256 + dpaste storage (optional)
7. ✅ **Never requires human intervention** - Cal runs himself!

---

## Quick Start

### Option 1: pm2 (Recommended)

```bash
# Install pm2 globally
npm install -g pm2

# Start Cal daemon
pm2 start ecosystem.config.js --only cal-autonomous

# Save configuration (auto-restart on reboot)
pm2 save
pm2 startup

# View logs
pm2 logs cal-autonomous

# Monitor
pm2 monit
```

### Option 2: Direct execution (Testing)

```bash
# Run once (for testing)
node bin/cal-daemon --once --verbose

# Run continuously (Ctrl+C to stop)
node bin/cal-daemon

# Run with auto-publish
CAL_AUTO_PUBLISH=true node bin/cal-daemon

# Run every 30 minutes
CAL_INTERVAL=30m node bin/cal-daemon
```

### Option 3: macOS launchd (System service)

```bash
# Copy launchd config
cp config/com.calos.cal-daemon.plist ~/Library/LaunchAgents/

# Load service
launchctl load ~/Library/LaunchAgents/com.calos.cal-daemon.plist

# Check status
launchctl list | grep cal-daemon

# View logs
tail -f logs/cal-daemon-out.log

# Unload service
launchctl unload ~/Library/LaunchAgents/com.calos.cal-daemon.plist
```

### Option 4: Linux systemd (System service)

```bash
# Copy systemd config
sudo cp config/cal-daemon.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start cal-daemon

# Enable auto-start on boot
sudo systemctl enable cal-daemon

# Check status
sudo systemctl status cal-daemon

# View logs
sudo journalctl -u cal-daemon -f

# Stop service
sudo systemctl stop cal-daemon
```

---

## Configuration

### Environment Variables

Create or update `.env` file:

```bash
# Database connection
DATABASE_URL=postgresql://matthewmauer@localhost:5432/calos

# Cal daemon settings
CAL_INTERVAL=1h              # How often Cal runs (30m, 1h, 2h, 12h, 1d)
CAL_AUTO_PUBLISH=false       # Auto-publish blog posts
CAL_AUTO_SIGN=true           # Auto-sign legal docs

# Publishing platforms
MASTODON_ACCESS_TOKEN=your_token
BLOG_API_KEY=your_key
DPASTE_API_URL=https://dpaste.com/api/v2/

# Google Search (optional)
GOOGLE_SEARCH_API_KEY=your_key
GOOGLE_SEARCH_ENGINE_ID=your_id
```

### Scheduler Intervals

| Interval | Example | Use Case |
|----------|---------|----------|
| `30m` | Every 30 minutes | High-frequency updates |
| `1h` | Every hour | **Recommended default** |
| `2h` | Every 2 hours | Medium-frequency updates |
| `12h` | Every 12 hours | Twice daily |
| `1d` | Every 24 hours | Daily summary |

---

## What Cal Does Autonomously

### 1. Scans Migrations

Cal reads all `.sql` files in `database/migrations/` and extracts:

- **Tables** - New table definitions
- **Views** - SQL views created
- **Functions** - PostgreSQL functions
- **Indexes** - Database indexes

**Example output:**
```markdown
## 🗄️ Migration Knowledge

### 147. signed contracts
- **Tables:** signed_docs, doc_verifications
- **Views:** unsigned_docs, verification_audit_trail
- **Functions:** get_latest_signature(), verify_document()
```

### 2. Scans Documentation

Cal reads all `.md` files in `docs/` and extracts:

- **File name** - Document title
- **Size** - File size in bytes
- **Modified date** - Last updated timestamp
- **Key topics** - First 5 H2/H3 headings

**Example output:**
```markdown
## 📚 Documentation Learned

### LEGAL-DOCS-SEO-GUIDE
- **Modified:** 2025-10-23T16:47:50.978Z
- **Size:** 15521 bytes
- **Key Topics:** Legal Documentation, SEO System, File Structure
```

### 3. Learns Legal Citations

Cal scans `projects/soulfra.github.io/*.html` for case law references:

- **Terms of Service** - Compliance citations
- **Privacy Policy** - GDPR, HIPAA, CCPA references
- **Case Law Database** - Legal precedents

**Example output:**
```markdown
## ⚖️ Legal Documentation

### terms-of-service.html
- **Citations:** 11
- **Referenced Cases:** HIPAA Privacy Rule, GDPR, PCI-DSS v4.0
```

### 4. Reviews Failure Patterns

Cal learns from `lib/failure-learner.js` knowledge base:

- **What NOT to do** - Failed approaches
- **Successful patterns** - What worked
- **Recommendations** - Best practices

### 5. Updates CAL-LEARNED-KNOWLEDGE.md

Cal auto-generates comprehensive documentation:

```markdown
# CAL Learned Knowledge

**Last Updated:** 2025-10-24T01:00:00.000Z

## 📊 Summary
- **New Migrations:** 2
- **New Docs:** 5
- **Legal Citations:** 27

## 🗄️ Migration Knowledge
[10 latest migrations with tables, views, functions]

## 📚 Documentation Learned
[10 latest docs with key topics]

## ⚖️ Legal Documentation
[Case law citations from all HTML pages]
```

### 6. Generates Blog Post

Cal creates "What I Learned Today" blog post:

**Title:** `What I Learned Today - October 24, 2025`

**Content:**
```markdown
# What I Learned Today

## Database Migrations

I discovered 2 new migrations today:
- **Migration 147:** Signed contracts with SHA-256 verification
- **Migration 146:** SEO tracking with dragon keywords

## Documentation Updates

I learned about:
- Legal documentation with automatic case law linking
- SEO optimization strategies for compliance keywords

## Legal Citations

I found 27 case law references across our legal docs...
```

### 7. Publishes Cross-Platform (Optional)

If `CAL_AUTO_PUBLISH=true`, Cal publishes to:

- ✅ **Mastodon** - Federated social media
- ✅ **Blog** - Markdown blog posts
- ✅ **dpaste.com** - Immutable paste storage
- 🔜 **Newsletter** - Via Gmail webhook
- 🔜 **Twitter/X** - Thread publishing

### 8. Signs Legal Docs (Optional)

If `CAL_AUTO_SIGN=true`, Cal cryptographically signs:

- `terms-of-service.html` → SHA-256 hash → dpaste
- `privacy-policy.html` → SHA-256 hash → dpaste
- `case-law.html` → SHA-256 hash → dpaste

**Stored in database:**
```sql
SELECT * FROM signed_docs;
-- file_path | hash | dpaste_id | signed_at
-- terms-of-service.html | abc123... | xyz789 | 2025-10-24 01:00:00
```

---

## Monitoring Cal

### View Logs

**pm2:**
```bash
pm2 logs cal-autonomous
pm2 logs cal-autonomous --lines 100
```

**macOS launchd:**
```bash
tail -f logs/cal-daemon-out.log
tail -f logs/cal-daemon-error.log
```

**Linux systemd:**
```bash
sudo journalctl -u cal-daemon -f
sudo journalctl -u cal-daemon --since "1 hour ago"
```

### Check Status

**pm2:**
```bash
pm2 status
pm2 monit
```

**macOS launchd:**
```bash
launchctl list | grep cal-daemon
```

**Linux systemd:**
```bash
sudo systemctl status cal-daemon
```

### Verify Cal is Running

```bash
# Check for Cal process
ps aux | grep cal-daemon

# Check database for recent updates
psql -d calos -c "SELECT * FROM signed_docs ORDER BY signed_at DESC LIMIT 5;"

# Check knowledge doc timestamp
ls -la docs/CAL-LEARNED-KNOWLEDGE.md
```

---

## Troubleshooting

### Cal daemon won't start

**Issue:** Process exits immediately

**Solution:**
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test database connection
psql $DATABASE_URL -c "SELECT NOW();"

# Run with verbose logging
node bin/cal-daemon --once --verbose
```

### dpaste SSL errors

**Issue:** `Error: write EPROTO ... SSL routines`

**Solution:**
```bash
# Disable signing temporarily
CAL_AUTO_SIGN=false node bin/cal-daemon

# Or use alternative paste service (update lib/doc-signer.js)
```

### Cal not updating knowledge doc

**Issue:** CAL-LEARNED-KNOWLEDGE.md not changing

**Solution:**
```bash
# Check file permissions
ls -la docs/CAL-LEARNED-KNOWLEDGE.md

# Run manually to debug
node scripts/cal-auto-document.js --verbose

# Check scheduler logs
pm2 logs cal-autonomous | grep "Cal waking up"
```

### pm2 not persisting after reboot

**Issue:** Cal stops after restart

**Solution:**
```bash
# Save pm2 configuration
pm2 save

# Configure auto-startup
pm2 startup
# Follow the command it outputs (run with sudo)

# Verify startup is configured
pm2 list
```

---

## Production Deployment

### Phase 1: Local Development (Current)

```
soulfra.github.io (GitHub Pages) → Static HTML
  ↓
localhost:5001 (API) → PostgreSQL → Cal daemon
```

**Status:** ✅ Working

### Phase 2: Cloud Deployment (Future)

**Deploy API to Railway/Fly.io:**

```bash
# Install Railway CLI
npm install -g railway

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# Configure DATABASE_URL
railway variables set DATABASE_URL=postgresql://...

# Deploy Cal daemon
railway variables set CAL_INTERVAL=1h
railway variables set CAL_AUTO_PUBLISH=true
```

**DNS Configuration:**
```dns
api.soulfra.com → CNAME → your-app.railway.app
```

**Update GitHub Pages:**
```javascript
// In soulfra.github.io JS files
const API_URL = 'https://api.soulfra.com'; // Instead of localhost:5001
```

### Phase 3: Multi-Region (Future)

```
Cloudflare → Load Balancer
  ↓
api-us.soulfra.com → US region (Railway)
api-eu.soulfra.com → EU region (Fly.io)
```

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| **GitHub Pages** | Free | $0/month |
| **PostgreSQL** | Local | $0/month |
| **pm2** | Open source | $0/month |
| **Cal daemon** | Self-hosted | $0/month |
| **Total (Current)** | | **$0/month** |

**Production Costs:**

| Service | Plan | Cost |
|---------|------|------|
| **Railway** | Hobby | $5/month |
| **PostgreSQL** | Railway | Included |
| **Custom Domain** | Cloudflare | $10/year |
| **Total (Production)** | | **~$6/month** |

---

## Security Considerations

### 1. Environment Variables

Never commit `.env` to git:

```bash
# .gitignore
.env
```

Use secrets management in production:
```bash
# Railway
railway variables set DATABASE_URL=postgresql://...

# Fly.io
fly secrets set DATABASE_URL=postgresql://...
```

### 2. Database Access

Restrict PostgreSQL access:
```sql
-- Create read-only user for Cal
CREATE USER cal_readonly WITH PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cal_readonly;
```

### 3. Rate Limiting

Cal respects rate limits:
- **dpaste.com:** 100 uploads/day
- **Mastodon:** 300 posts/day
- **Gmail webhook:** 500 emails/day

### 4. Log Rotation

Prevent logs from filling disk:

```bash
# Install logrotate (Linux)
sudo apt install logrotate

# Configure rotation
sudo nano /etc/logrotate.d/cal-daemon

# Add:
/path/to/agent-router/logs/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
}
```

---

## Advanced Configuration

### Custom Scheduling Logic

Edit `bin/cal-daemon` to add custom schedules:

```javascript
// Example: Run Cal every hour, but publish only at 9am daily
scheduler.schedule('cal-auto-document', async () => {
  const hour = new Date().getHours();
  const shouldPublish = hour === 9; // Publish at 9am only

  const autoDoc = new CalAutoDocumenter({
    db: pool,
    autoPublish: shouldPublish,
    autoSign: true
  });

  await autoDoc.run();
}, { interval: 60 * 60 * 1000 }); // Still run every hour
```

### Multi-Language Publishing

Enable translation pipeline:

```javascript
const autoDoc = new CalAutoDocumenter({
  db: pool,
  autoPublish: true,
  translationPipeline: new TranslationPipeline({
    targetLanguages: ['es', 'fr', 'de', 'ja']
  })
});
```

### Google Search Integration

Enable external learning:

```javascript
const autoDoc = new CalAutoDocumenter({
  db: pool,
  searchGoogle: true,
  googleSearchAPI: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY,
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID
  }
});
```

---

## Next Steps

1. ✅ **Test Cal daemon locally**
   ```bash
   node bin/cal-daemon --once --verbose
   ```

2. ✅ **Deploy with pm2**
   ```bash
   pm2 start ecosystem.config.js --only cal-autonomous
   pm2 save
   pm2 startup
   ```

3. ✅ **Enable auto-publish** (when ready)
   ```bash
   pm2 stop cal-autonomous
   pm2 delete cal-autonomous
   CAL_AUTO_PUBLISH=true pm2 start ecosystem.config.js --only cal-autonomous
   pm2 save
   ```

4. 🔜 **Deploy to production**
   - Choose platform (Railway/Fly.io)
   - Configure DNS (api.soulfra.com)
   - Migrate database
   - Update GitHub Pages API URL

5. 🔜 **Monitor and optimize**
   - Track Cal's learning progress
   - Review blog posts for quality
   - Adjust scheduling intervals
   - Enable additional platforms

---

## Support & Resources

- **Cal Daemon:** `bin/cal-daemon`
- **Auto-Documenter:** `lib/cal-auto-documenter.js`
- **Doc Signer:** `lib/doc-signer.js`
- **Scheduler:** `lib/scheduler.js`
- **Knowledge Doc:** `docs/CAL-LEARNED-KNOWLEDGE.md`

**Related Docs:**
- `LEGAL-DOCS-SEO-GUIDE.md` - Legal documentation system
- `DNS-MAPPING.md` - Domain configuration
- `ROUTING-MATRIX.md` - URL routing structure

---

**Built with ❤️ by CALOS**

*Self-documenting • Self-publishing • Immortal • All in one*
