# Easy Deploy Guide - CALOS Agent Router

**Get your own CALOS instance running in under 5 minutes - no coding required!**

---

## 🚀 Choose Your Method

### Option 1: Render.com (Recommended - Free Forever)
**Best for:** Permanent hosting, production use
**Cost:** FREE ($0/month with 750 hours)
**Time:** 3-5 minutes

[👉 Deploy to Render Now](#deploy-to-render)

---

### Option 2: Replit (Instant - Perfect for Testing)
**Best for:** Quick testing, demos, learning
**Cost:** FREE (public repls)
**Time:** 30 seconds

[👉 Fork on Replit Now](#fork-on-replit)

---

### Option 3: Railway.app (Easy with Auto-Setup)
**Best for:** Simple setup, good free tier
**Cost:** FREE ($5 credit/month)
**Time:** 2-3 minutes

[👉 Deploy to Railway Now](#deploy-to-railway)

---

## Deploy to Render

### Step 1: Click the Button
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/agent-router)

### Step 2: Sign In
- Click "Sign in with GitHub"
- Allow Render to access your repos

### Step 3: Configure (Optional)
Most settings work out of the box! Optionally add:
- `OPENAI_API_KEY` - For GPT models
- `ANTHROPIC_API_KEY` - For Claude
- `DEEPSEEK_API_KEY` - For DeepSeek

Click "Skip" if you don't have API keys yet!

### Step 4: Deploy
- Click "Create Web Service"
- Wait 2-3 minutes
- Get your URL: `https://your-app.onrender.com`

### Step 5: Done!
Open your URL and see the setup wizard!

---

## Fork on Replit

### Step 1: Click the Button
[![Run on Replit](https://replit.com/badge/github/YOUR_USERNAME/agent-router)](https://replit.com/github/YOUR_USERNAME/agent-router)

### Step 2: Sign In
- Click "Sign up" or "Log in"
- Use GitHub, Google, or email

### Step 3: Click "Fork"
- Replit copies the project to your account
- Auto-installs all dependencies

### Step 4: Click "Run"
- Green "Run" button at the top
- Server starts automatically
- URL appears in "Webview" tab

### Step 5: Done!
Your CALOS instance is live at your Replit URL!

**Note:** Replit apps sleep after inactivity (paid plans keep them awake).

---

## Deploy to Railway

### Step 1: Click the Button
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)

### Step 2: Sign In
- Click "Login with GitHub"
- Allow Railway access

### Step 3: Configure
Railway auto-detects settings from `railway.json`:
- PostgreSQL database (auto-created)
- Environment variables (set if needed)

### Step 4: Deploy
- Click "Deploy Now"
- Wait 1-2 minutes
- Get public URL

### Step 5: Done!
Browse to your Railway URL!

---

## After Deployment

### What You'll See
1. **Setup Wizard** - Guides you through configuration
2. **Dashboard** - Main control panel
3. **API Docs** - Interactive API documentation

### Initial Setup Steps
1. Create an admin account
2. (Optional) Add API keys for AI models
3. (Optional) Configure email/OAuth
4. Start using CALOS!

---

## Troubleshooting

### "Build Failed" on Render
**Solution:** Check that all dependencies are in `package.json`
- Run: `npm install` locally first
- Commit `package-lock.json`
- Push to GitHub
- Retry deployment

### "Server Not Responding" on Replit
**Solution:** Replit might need a database
- Click "Database" tab in Replit
- Enable PostgreSQL
- Restart the server

### "Port Already in Use"
**Solution:** Each platform auto-assigns ports
- Render: Uses PORT env var
- Replit: Uses port 5001
- Railway: Auto-detects

---

## Free Tier Limits

### Render.com
- ✅ 750 hours/month (enough for 1 app running 24/7)
- ✅ 512MB RAM
- ✅ Shared CPU
- ⚠️ Apps sleep after 15 min inactivity (wake on request)

### Replit
- ✅ Unlimited public repls
- ✅ 1 GB storage
- ✅ Shared CPU
- ⚠️ Apps sleep when inactive

### Railway.app
- ✅ $5 credit/month
- ✅ 512MB RAM
- ✅ 1GB disk
- ⚠️ Pay if you exceed credit

---

## Upgrade Options

### Need 24/7 Uptime?
**Render Starter:** $7/month (no sleep)
**Railway Starter:** $5/month (more resources)

### Need More Power?
**Render Standard:** $15/month (1GB RAM)
**Railway Pro:** $20/month (8GB RAM)

### Self-Host?
See [DEPLOY.md](deployment/DEPLOY.md) for Docker/VPS options.

---

## Next Steps

### 1. Test Your Deployment
```bash
# Check if server is running
curl https://your-app-url.com/health

# Check workspace
curl https://your-app-url.com/collab-workspace.html
```

### 2. Try the Features
- Open collaborative workspace
- Generate a meme
- Test AI routing
- Explore the dashboard

### 3. Customize
- Add your own branding
- Configure domains
- Set up OAuth
- Add more features!

---

## Video Tutorials

### Deploy to Render
🎥 [Watch 3-minute tutorial](#) (Coming soon!)

### Fork on Replit
🎥 [Watch 1-minute tutorial](#) (Coming soon!)

### Railway Deployment
🎥 [Watch 2-minute tutorial](#) (Coming soon!)

---

## Support

### Need Help?
- 📚 [Full Documentation](README.md)
- 💬 [Discord Community](#)
- 🐛 [Report Issues](https://github.com/YOUR_USERNAME/agent-router/issues)
- 📧 Email: support@calos.com

---

## What's Included (Out of the Box)

✅ **AI Agent Router** - Multi-model routing (GPT-4, Claude, Ollama)
✅ **Collaborative Workspace** - Real-time code editing
✅ **Meme Generator API** - Viral content creation
✅ **Domain Ecosystem** - Multi-domain routing
✅ **Gmail Webhook** - Zero-cost email system
✅ **ELO Voting** - Community ranking
✅ **Lofi Streaming** - Audio streaming
✅ **EdTech Platform** - Learning paths
✅ **OAuth System** - SSO provider/consumer
✅ **Payment Integration** - Stripe ready

---

## Success!

If you see the CALOS setup wizard, **you're done!** 🎉

Your instance is live and ready to use.

---

**Made with ❤️ by the CALOS team**

*No coding required • Deploy in minutes • Free forever*
