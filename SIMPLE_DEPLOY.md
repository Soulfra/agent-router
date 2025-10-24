# Simple Deployment - You Already Have Everything!

**Status:** Ready to deploy with existing configs ✅

## TL;DR - 3 Commands to Deploy

```bash
# 1. Create GitHub repo (if needed)
# Go to: https://github.com/new
# Name: agent-router
# Public, no README

# 2. Push code
git push -u origin main

# 3. Deploy to Render (auto-detects render.yaml)
# Go to: https://render.com
# Click "New +" → "Web Service" → Connect GitHub → Select "agent-router"
# Done! Render deploys automatically
```

## What You Already Have

We discovered you have **3 deployment configs already set up**:

1. ✅ **Render** - `deployment/render.yaml` (recommended, easiest)
2. ✅ **Railway** - `railway.json`
3. ✅ **Vercel** - `vercel.json`

Plus one-click deploy buttons in `DEPLOY.md` and `ONE_CLICK_DEPLOY.md`.

**We were overcomplicating it!** No need for manual Railway CLI, database exports, or complex scripts.

## Option 1: Render (Recommended)

**Why:** Auto-detects `render.yaml`, free PostgreSQL, $0/month

### Steps:

1. **Create GitHub repo:**
   - Go to https://github.com/new
   - Name: `agent-router`
   - Public (so GitHub contributions show up)
   - **Don't** add README (we already have one)

2. **Push code:**
   ```bash
   git push -u origin main
   ```

3. **Deploy on Render:**
   - Go to https://render.com
   - Sign in with GitHub
   - Click "New +" → "Web Service"
   - Select repository: `Soulfra/agent-router`
   - Render auto-detects `deployment/render.yaml`
   - Click "Create Web Service"
   - **Done!** Render builds and deploys

4. **Add Database (if needed):**
   - Render Dashboard → "New +" → "PostgreSQL"
   - Free tier (90 days, then $7/month)
   - Render auto-injects `DATABASE_URL`

5. **Get your URL:**
   ```
   https://agent-router.onrender.com
   ```

### What Render Automatically Does:

- ✅ Runs `npm ci` (install dependencies)
- ✅ Starts with `npm start`
- ✅ Sets `NODE_ENV=production`
- ✅ Exposes on port 5001
- ✅ Enables CORS
- ✅ Connects to PostgreSQL if you add it

## Option 2: Railway (Already Have CLI)

**Why:** You already have Railway CLI installed

### Steps:

1. **Push to GitHub** (same as above)

2. **Deploy with CLI:**
   ```bash
   railway login
   railway init  # Links to GitHub repo
   railway up    # Deploys
   ```

3. **Add PostgreSQL:**
   ```bash
   railway add
   # Select: PostgreSQL
   ```

4. **Get URL:**
   ```bash
   railway domain
   ```

Railway auto-detects `railway.json` and uses its config.

## Option 3: Vercel (Instant Deploy)

**Why:** One-click deploy button already configured

### Steps:

1. **Click the deploy button** in `DEPLOY.md`:
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSoulfra%2Fagent-router)

2. **Vercel clones your repo** and deploys instantly

3. **Add environment variables** in Vercel dashboard (if needed)

**Note:** Vercel is best for serverless/API routes. For full Node.js server, use Render or Railway.

## Fix GitHub Contributions Not Showing

If your commits aren't appearing on your GitHub profile:

### Issue: Git email doesn't match GitHub account

**Current situation:**
- Git commits as: `Cal <cal@calos.dev>`
- GitHub account: `Soulfra <211064529+Soulfra@users.noreply.github.com>`

### Fix:

```bash
# Set git email to match GitHub
git config user.name "Soulfra"
git config user.email "211064529+Soulfra@users.noreply.github.com"

# Or use your primary GitHub email
git config user.email "matthewmauer@gmail.com"  # (or whatever email is verified on GitHub)
```

### Why This Matters:

1. GitHub only shows contributions if commit email matches account email
2. Private repos don't show contributions by default (make repo public)
3. Commits must be on default branch (`main`)

### Check if Fixed:

```bash
# See current config
git config user.name
git config user.email

# Should match one of your GitHub verified emails
# Check at: https://github.com/settings/emails
```

## Update Frontend After Deploy

Once deployed, update the API URL in the learning hub:

```bash
cd projects/soulfra.github.io
nano learn/index.html

# Change line ~40:
# const API_BASE = 'https://your-render-url.onrender.com'

git add learn/index.html
git commit -m "Update API endpoint to production URL"
git push origin main
```

## Environment Variables (Add in Platform Dashboard)

Render/Railway/Vercel will ask for these (or set later in dashboard):

```env
# Auto-injected by platform (don't set manually)
DATABASE_URL=postgresql://...  # Auto-set when you add PostgreSQL

# Optional: Add if using AI features
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
DEEPSEEK_API_KEY=your_key

# Already have defaults in code
PORT=5001
CORS_ORIGIN=*
```

## Cost Comparison

| Platform | Free Tier | Paid Plan | Database |
|----------|-----------|-----------|----------|
| **Render** | 750 hrs/month | $7/month (24/7) | Free 90 days, then $7/month |
| **Railway** | $5 credit/month | Pay-as-you-go | Included in credit |
| **Vercel** | Unlimited | $20/month (pro) | Not included (use Neon, Supabase) |

## Test After Deployment

```bash
# Health check
curl https://your-url.com/

# Learning API
curl https://your-url.com/api/learning/paths

# Should return:
# {"success":true,"paths":[{"path_name":"Debugging Mastery",...}]}
```

## Next Steps

1. **Today:**
   - [ ] Create GitHub repo
   - [ ] Push code: `git push -u origin main`
   - [ ] Deploy on Render (or Railway/Vercel)

2. **After deployment:**
   - [ ] Add PostgreSQL (if using database features)
   - [ ] Update frontend API URL
   - [ ] Test learning hub at soulfra.github.io/learn/

3. **Optional:**
   - [ ] Set up custom domain (api.calos.dev)
   - [ ] Add environment variables for AI features
   - [ ] Set up monitoring/alerts

## Resources

- **Existing Deploy Guides:**
  - `ONE_CLICK_DEPLOY.md` - Deploy buttons for all platforms
  - `DEPLOY.md` - OAuth setup guide
  - `deployment/DEPLOY.md` - Email API deployment

- **Deployment Configs:**
  - `deployment/render.yaml` - Render configuration
  - `railway.json` - Railway configuration
  - `vercel.json` - Vercel configuration

- **GitHub Contribution Docs:**
  - https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions

---

**Bottom line:** Push to GitHub, connect to Render, done. Everything else is already configured!
