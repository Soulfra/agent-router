# 🚀 CalOS Learning Hub - Quick Deployment Guide

**Status:** ✅ Ready to deploy to Railway

## What's Been Fixed

1. ✅ Local database connection working
2. ✅ GitHub Pages redirect fixed (soulfra.github.io/learn/ now accessible)
3. ✅ Router.js configured for Railway DATABASE_URL
4. ✅ Database export scripts created
5. ✅ Automated deployment script ready

## Deploy in 3 Steps

### 1. Login to Railway
```bash
railway login
```

### 2. Run Automated Deployment
```bash
./deploy-to-railway.sh
```

This will:
- Create/link Railway project
- Add PostgreSQL addon
- Export local database
- Deploy code to Railway
- Import database schema and data
- Test API endpoint

### 3. Update Frontend
After deployment completes, update the API URL:

```bash
# Edit this file:
projects/soulfra.github.io/learn/index.html

# Change API_BASE to your Railway URL (shown after deployment)
# Then commit and push
cd projects/soulfra.github.io
git add learn/index.html
git commit -m "Update API endpoint to Railway"
git push origin main
```

## Documentation

- **Quick Status:** `DEPLOYMENT_STATUS.md` - What's done and what's next
- **Full Guide:** `RAILWAY_DEPLOYMENT_GUIDE.md` - Complete deployment tutorial
- **Manual Steps:** See RAILWAY_DEPLOYMENT_GUIDE.md for step-by-step instructions

## Test Everything

### Test Local Setup
```bash
node router.js --local
curl http://localhost:5001/api/learning/paths
```

### Test GitHub Pages (Frontend)
```bash
curl -I https://soulfra.github.io/learn/
# Should return HTTP 200 (no redirect)
```

### Test Railway (After Deployment)
```bash
curl https://your-railway-url.up.railway.app/api/learning/paths
```

## Quick Reference

### Key Files
- `deploy-to-railway.sh` - Automated deployment
- `scripts/export-db-for-railway.sh` - Database export
- `railway-db-export/` - Exported database files
- `router.js` - Backend server (lines 55, 1344-1361 modified)

### Environment Variables (Railway)
Railway auto-injects:
- `DATABASE_URL` - PostgreSQL connection string

You may want to add:
- `PORT` - (optional, defaults to Railway's PORT)
- `CORS_ORIGIN` - (optional, defaults to *)
- `ANTHROPIC_API_KEY` - (if using AI features)
- `OPENAI_API_KEY` - (if using AI features)

## Architecture

```
GitHub Pages (Frontend)
   ├─ soulfra.github.io/learn/
   └─ Calls API at Railway URL

Railway (Backend)
   ├─ Express server (router.js)
   ├─ /api/learning/* endpoints
   └─ PostgreSQL addon (DATABASE_URL)
```

## Costs

- **Free Tier:** $5/month credit (enough for hobby projects)
- **PostgreSQL:** Free for hobby (500MB storage)
- **Bandwidth:** 100GB/month free

## Support

If you hit issues:
1. Check `RAILWAY_DEPLOYMENT_GUIDE.md` - Troubleshooting section
2. Check Railway logs: `railway logs`
3. Test locally first: `node router.js --local`

---

**Ready to deploy?** Run `./deploy-to-railway.sh`
