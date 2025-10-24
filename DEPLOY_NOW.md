# Deploy Now - 3 Simple Steps

You already have everything configured. Just push and deploy!

## Step 1: Create GitHub Repo

Go to: https://github.com/new

- **Name:** `agent-router`
- **Public** (so contributions show on your profile)
- **Don't** add README/license (you have them already)

Click "Create repository"

## Step 2: Push Code

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
git push -u origin main
```

If this is your first push and the repo is empty, you might see:
```
Enumerating objects: 1234, done.
Writing objects: 100% (1234/1234), done.
```

## Step 3: Deploy to Render

1. Go to: https://render.com
2. Sign in with GitHub
3. Click **"New +"** → **"Web Service"**
4. Find and select: **`Soulfra/agent-router`**
5. Render sees `deployment/render.yaml` and auto-configures
6. Click **"Create Web Service"**

**Done!** Render builds and deploys automatically.

Your API will be live at: `https://agent-router.onrender.com`

## What Happens Automatically

Render reads `deployment/render.yaml` and:
- ✅ Runs `npm ci` (installs dependencies)
- ✅ Starts with `npm start`
- ✅ Sets environment: `NODE_ENV=production`
- ✅ Uses port: `5001`
- ✅ Enables CORS: `*`
- ✅ Uses SQLite (no database setup needed!)

## Test Your Deployment

```bash
# Replace with your actual Render URL
RENDER_URL="https://agent-router.onrender.com"

# Health check
curl $RENDER_URL/

# Learning API
curl $RENDER_URL/api/learning/paths
```

## Add PostgreSQL (Optional)

If you want to use PostgreSQL instead of SQLite:

1. Render Dashboard → **"New +"** → **"PostgreSQL"**
2. Name it: `agent-router-db`
3. Click **"Create Database"**
4. Render auto-injects `DATABASE_URL` into your web service
5. Redeploy (Render → Your Web Service → **"Manual Deploy"** → **"Deploy latest commit"**)

Your router.js will auto-detect `DATABASE_URL` and use PostgreSQL!

## Update Frontend

Once deployed, update the learning hub to use your production API:

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/projects/soulfra.github.io
nano learn/index.html

# Find line ~40 and change:
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5001'
  : 'https://agent-router.onrender.com';  # <-- Your Render URL

# Save and push
git add learn/index.html
git commit -m "Connect learning hub to production API"
git push origin main
```

Wait 1-2 minutes for GitHub Pages to rebuild, then test:
```
https://soulfra.github.io/learn/
```

## Fix GitHub Contributions

If commits aren't showing on your GitHub profile, set git email to match your GitHub account:

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Option 1: Use GitHub noreply email
git config user.email "211064529+Soulfra@users.noreply.github.com"

# Option 2: Use your verified email (check: https://github.com/settings/emails)
git config user.email "your-verified-email@example.com"

# Verify
git config user.email
```

Then your next commits will appear on your profile!

## Alternative: Railway (If You Prefer)

If you'd rather use Railway (you have it installed):

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
railway login
railway init  # Links to github.com/Soulfra/agent-router
railway up    # Deploys
```

Railway reads `railway.json` and auto-configures.

## Alternative: One-Click Vercel

Click this button from `DEPLOY.md`:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSoulfra%2Fagent-router)

Vercel clones your repo and deploys instantly.

---

**Ready?** Start with Step 1 above!

See `SIMPLE_DEPLOY.md` for full details and troubleshooting.
