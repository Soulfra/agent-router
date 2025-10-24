# Railway Deployment Guide

**Deploy the CalOS backend API to Railway with PostgreSQL**

## Current Status

- ✅ Railway CLI installed (`railway` command available)
- ✅ `railway.json` configured
- ✅ Local PostgreSQL database working with learning paths
- ⏳ Need to login to Railway and create project
- ⏳ Need to provision PostgreSQL addon
- ⏳ Need to set environment variables

## Quick Deploy (5 minutes)

### Step 1: Login to Railway

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
railway login
```

This will open your browser and authenticate you with GitHub.

### Step 2: Create New Project

```bash
# Initialize Railway project in this directory
railway init

# You'll be prompted to:
# 1. Choose "Create new project"
# 2. Name it: "calos-api"
# 3. Choose environment: "production"
```

### Step 3: Add PostgreSQL Database

```bash
# Add PostgreSQL addon to your Railway project
railway add

# Select "PostgreSQL" from the list
# Railway will automatically provision a database and inject DATABASE_URL
```

### Step 4: Set Environment Variables

Railway auto-injects `DATABASE_URL` for PostgreSQL. You need to add other required variables:

```bash
# View what needs to be set
cat .env

# Set variables one by one
railway variables set DB_TYPE=postgres
railway variables set PORT=5001

# Optional: Add API keys if using AI features
railway variables set ANTHROPIC_API_KEY=your_key_here
railway variables set OPENAI_API_KEY=your_key_here
```

**IMPORTANT:** Don't set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` individually on Railway. The `DATABASE_URL` that Railway auto-injects is used instead.

### Step 5: Update router.js to Use DATABASE_URL

The current `router.js` requires `--local` flag to enable database mode. For production, we need it to auto-detect `DATABASE_URL` from environment.

Edit `router.js` around line 55:

```javascript
// BEFORE:
const localMode = args.includes('--local');

// AFTER:
const localMode = args.includes('--local') || process.env.DATABASE_URL;
```

And update database initialization around line 1277:

```javascript
async function initDatabase() {
  if (!localMode) {
    console.log('ℹ️  Running in API mode (use --local for database caching)');
    return null;
  }

  if (dbType === 'postgres') {
    const { Pool } = require('pg');

    // Use DATABASE_URL if available (Railway), otherwise use individual params
    if (process.env.DATABASE_URL) {
      db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false // Railway requires SSL
        }
      });
      console.log('✅ Connected to PostgreSQL (Railway/Production)');
    } else {
      db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'calos',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || ''
      });
      console.log('✅ Connected to PostgreSQL (Local)');
    }
  }
}
```

### Step 6: Create Database Schema on Railway

The PostgreSQL addon starts empty. You need to run your SQL schema:

```bash
# Connect to Railway database
railway run psql $DATABASE_URL

# Then paste your schema SQL (from local database)
# Or create a migration file
```

**Quick schema export from local:**

```bash
# Export local schema
pg_dump -U matthewmauer -d calos -s > schema.sql

# Import to Railway
railway run psql $DATABASE_URL < schema.sql
```

**Export data too (learning paths, lessons):**

```bash
# Export just the learning tables
pg_dump -U matthewmauer -d calos \
  -t learning_paths \
  -t learning_lessons \
  -t learning_progress \
  --data-only \
  --column-inserts > learning_data.sql

# Import to Railway
railway run psql $DATABASE_URL < learning_data.sql
```

### Step 7: Deploy to Railway

```bash
# Deploy current code
railway up

# Railway will:
# 1. Build with: npm install
# 2. Start with: node router.js
# 3. Expose a public URL like: calos-api.up.railway.app
```

### Step 8: Get Your Public API URL

```bash
# View your deployment URL
railway open

# Or get URL programmatically
railway domain
```

You'll get a URL like: `https://calos-api-production.up.railway.app`

This is your `api.calos.dev` replacement!

### Step 9: Test Deployed API

```bash
# Get your Railway URL first
RAILWAY_URL=$(railway domain 2>&1 | grep "https" | awk '{print $1}')

# Test learning paths endpoint
curl $RAILWAY_URL/api/learning/paths
```

Expected response:
```json
{
  "success": true,
  "paths": [{
    "path_name": "Debugging Mastery",
    "total_lessons": 10,
    "path_slug": "debugging-mastery"
  }]
}
```

### Step 10: Update Frontend to Use Railway URL

Edit `projects/soulfra.github.io/learn/index.html`:

```javascript
// BEFORE:
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://api.calos.dev';

// AFTER:
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://calos-api-production.up.railway.app'; // <-- Your Railway URL
```

Commit and push to GitHub:

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/projects/soulfra.github.io
git add learn/index.html
git commit -m "Update API endpoint to Railway deployment"
git push origin main
```

### Step 11: Custom Domain (Optional)

If you own `api.calos.dev`, you can add it as a custom domain:

```bash
# Add custom domain
railway domain add api.calos.dev

# Railway will show you DNS records to add:
# CNAME: api.calos.dev → calos-api-production.up.railway.app
```

Then update DNS at your registrar.

## Architecture After Deployment

```
┌─────────────────────────────────────────────────────────┐
│         GitHub Pages (soulfra.github.io)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │  learn/index.html                                │   │
│  │  - Frontend learning hub                         │   │
│  │  - Makes API calls to Railway                    │   │
│  └─────────────────┬────────────────────────────────┘   │
└────────────────────┼────────────────────────────────────┘
                     │
                     │ HTTPS Requests
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Railway (calos-api-production.up.railway.app)   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  router.js                                       │   │
│  │  - Serves /api/learning/* endpoints              │   │
│  │  - Connects to PostgreSQL via DATABASE_URL       │   │
│  └─────────────────┬────────────────────────────────┘   │
│                    │                                     │
│                    ▼                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL Addon                                │   │
│  │  - learning_paths (Debugging Mastery, etc)       │   │
│  │  - learning_lessons (10 lessons)                 │   │
│  │  - learning_progress (user XP tracking)          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Cost

- **Free Tier:** $5 credit/month (enough for small projects)
- **PostgreSQL:** Free for hobby projects (500MB storage)
- **Bandwidth:** 100GB/month free

## Troubleshooting

### "Cannot GET /api/learning/paths"

**Cause:** Database not initialized (running in API mode)

**Fix:** Make sure `DATABASE_URL` environment variable is set on Railway, and router.js is updated to auto-detect it.

### "SSL SYSCALL error: EOF detected"

**Cause:** Railway PostgreSQL requires SSL connection

**Fix:** Make sure your Pool config includes:
```javascript
ssl: {
  rejectUnauthorized: false
}
```

### "column lp.active does not exist"

**Cause:** Schema mismatch (we already fixed this locally)

**Fix:** Make sure you exported the latest SQL schema with `status` column (not `active` boolean).

### CORS errors from frontend

**Cause:** Railway URL needs CORS headers

**Fix:** Add CORS middleware in router.js:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
```

## Next Steps

1. [ ] Login to Railway: `railway login`
2. [ ] Create project: `railway init`
3. [ ] Add PostgreSQL: `railway add` → PostgreSQL
4. [ ] Update router.js to auto-detect DATABASE_URL
5. [ ] Export local database schema: `pg_dump -s`
6. [ ] Import schema to Railway: `railway run psql $DATABASE_URL < schema.sql`
7. [ ] Deploy: `railway up`
8. [ ] Get URL: `railway domain`
9. [ ] Test API: `curl https://your-url.up.railway.app/api/learning/paths`
10. [ ] Update frontend: Edit `learn/index.html` API_BASE
11. [ ] Push to GitHub: `git commit && git push`

## Resources

- Railway Docs: https://docs.railway.app/
- Railway CLI: https://docs.railway.app/develop/cli
- PostgreSQL on Railway: https://docs.railway.app/databases/postgresql

---

**Built with ❤️ for CalOS Platform**
