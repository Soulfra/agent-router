# One-Click Deploy - OAuth Starter (ColdStartKit)

Multi-provider OAuth system with auto-subdomain creation, activity tracking, and leaderboard.

**Live in 2 minutes** | **Free hosting** | **No credit card required**

---

## 🚀 Deploy Now

### Option 1: Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsoulfra%2Fagent-router&project-name=my-oauth-app&repository-name=my-oauth-app&env=TWITTER_CLIENT_ID,TWITTER_CLIENT_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,PARENT_DOMAIN&envDescription=OAuth%20credentials%20from%20Twitter%2C%20GitHub%2C%20Discord%2C%20LinkedIn&envLink=https%3A%2F%2Fgithub.com%2Fsoulfra%2Fagent-router%2Fblob%2Fmain%2Fdocs%2FSOCIAL-AUTH-SETUP.md)

**What happens when you click:**
1. Vercel clones this repo to your GitHub
2. Asks for OAuth credentials (or skip for now)
3. Deploys in ~60 seconds
4. Gives you a live URL: `https://your-app.vercel.app`

**Cost:** $0/month (Vercel free tier)

---

### Option 2: Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/oauth-starter?referralCode=soulfra)

**What happens when you click:**
1. Railway clones this repo
2. Asks for OAuth credentials
3. Deploys in ~90 seconds
4. Gives you a live URL: `https://your-app.railway.app`

**Cost:** $0/month (Railway free tier: $5 credit, ~500 hours)

---

### Option 3: Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/soulfra/agent-router)

**What happens when you click:**
1. Netlify clones this repo
2. Asks for OAuth credentials
3. Deploys in ~60 seconds
4. Gives you a live URL: `https://your-app.netlify.app`

**Cost:** $0/month (Netlify free tier)

---

## ⚡ Quick Start (No OAuth Setup)

**Don't have OAuth credentials yet?** No problem!

### Deploy with GitHub Auth Only (Zero Config)

1. Click "Deploy to Vercel" above
2. **Skip** the OAuth credential prompts (leave blank)
3. After deployment, your app will use:
   - ✅ GitHub login (via Vercel Auth - free, automatic)
   - ❌ Twitter, Discord, LinkedIn (disabled until you add credentials)

**Add other providers later:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add Twitter/Discord/LinkedIn credentials
3. Redeploy

---

## 📋 What You Get

After deploying, you'll have:

- ✅ **OAuth Login** (Twitter, GitHub, Discord, LinkedIn)
- ✅ **Auto-Subdomain Creation** (@yourhandle.yourdomain.com)
- ✅ **Activity Tracking** (30-day expiration, warnings)
- ✅ **Leaderboard System** (top 1000 = immunity)
- ✅ **Expertise Extraction** (from Twitter bio, GitHub repos)
- ✅ **Session Management** (30-day cookies)
- ✅ **Google Sheets Persistence** (optional, free)

---

## 🔑 Get OAuth Credentials (15 min)

If you want Twitter/Discord/LinkedIn login, you'll need to create OAuth apps:

### 1. Twitter/X OAuth

1. Go to [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)
2. Create app → Get **Client ID** and **Client Secret**
3. **Callback URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=twitter`

[Full Twitter setup guide →](./docs/SOCIAL-AUTH-SETUP.md#1-twitterx-oauth-setup)

### 2. GitHub OAuth

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. New OAuth App → Get **Client ID** and **Client Secret**
3. **Callback URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=github`

[Full GitHub setup guide →](./docs/SOCIAL-AUTH-SETUP.md#2-github-oauth-setup)

### 3. Discord OAuth

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Get **Client ID** and **Client Secret**
3. **Redirect URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=discord`

[Full Discord setup guide →](./docs/SOCIAL-AUTH-SETUP.md#3-discord-oauth-setup)

### 4. LinkedIn OAuth

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Create app → Get **Client ID** and **Client Secret**
3. **Redirect URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=linkedin`

[Full LinkedIn setup guide →](./docs/SOCIAL-AUTH-SETUP.md#4-linkedin-oauth-setup)

---

## 🎯 After Deployment

### 1. Test Your Login

Go to: `https://YOUR-VERCEL-URL.vercel.app/login.html`

Click "Sign in with X" (or GitHub/Discord/LinkedIn)

### 2. Check Your User Profile

Open browser console:

```javascript
fetch('https://YOUR-VERCEL-URL.vercel.app/api/auth/me', {
  credentials: 'include'
})
.then(res => res.json())
.then(console.log)
```

Should see:

```json
{
  "success": true,
  "user": {
    "userId": "user_123...",
    "vanitySubdomain": "yourhandle",
    "expertise": ["javascript", "python"],
    "activity": {
      "totalScore": 1,
      "daysUntilExpiration": 30
    },
    "leaderboard": {
      "globalRank": 1,
      "globalScore": 1
    }
  }
}
```

### 3. Connect Custom Domain (Optional)

**Want to use your own domain?**

1. Buy domain: `yourdomain.com` ($12/year)
2. Vercel Dashboard → Your Project → Settings → Domains
3. Add domain: `yourdomain.com` and `api.yourdomain.com`
4. Update DNS records (Vercel shows you how)
5. Update OAuth callback URLs to use your domain

[Custom domain setup guide →](./docs/VERCEL-DEPLOY-GUIDE.md#custom-domain-setup-recommended)

---

## 💾 Add Google Sheets Persistence (Optional)

By default, user data is stored in-memory (lost on restart). Add Google Sheets for free persistence:

### 1. Create Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create new spreadsheet: "My OAuth DB"
3. Copy Spreadsheet ID from URL

### 2. Create Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project → Enable Google Sheets API
3. Create Service Account → Download JSON key
4. Share spreadsheet with service account email

### 3. Add to Vercel

Vercel Dashboard → Environment Variables:

```bash
GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
GOOGLE_SHEETS_SERVICE_ACCOUNT={"type":"service_account",...}
```

[Full Google Sheets setup →](./docs/VERCEL-DEPLOY-GUIDE.md#part-6-optional---add-google-sheets-persistence)

---

## 🛠️ Local Development

Want to run locally before deploying?

```bash
# Clone repo
git clone https://github.com/soulfra/agent-router.git
cd agent-router

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Add your OAuth credentials to .env
# (See docs/SOCIAL-AUTH-SETUP.md for setup guide)

# Run locally
npm start

# Visit http://localhost:5001/login.html
```

---

## 📚 Full Documentation

- **[Social Auth Setup Guide](./docs/SOCIAL-AUTH-SETUP.md)** - Step-by-step OAuth app creation
- **[Vercel Deployment Guide](./docs/VERCEL-DEPLOY-GUIDE.md)** - Full deployment walkthrough
- **[API Reference](./docs/API-REFERENCE.md)** - API endpoints and usage

---

## 🎨 Customize

### Change Branding

Edit `public/login.html`:

```html
<h1>Your Brand Name</h1>
<p>Your tagline</p>
```

### Change Colors

Edit `public/login.html` CSS:

```css
background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
```

### Add Your Domain

Update `.env`:

```bash
PARENT_DOMAIN=yourdomain.com
```

---

## 🏆 ColdStartKit Template

This is an official **ColdStartKit** template.

**ColdStartKit** = Startup Launch Templates (one of 12 BillionDollarGame brands)

More templates:
- 🔐 **OAuth Starter** (this one)
- 📧 **Email Marketing Kit** (coming soon)
- 💳 **Stripe Payments Starter** (coming soon)
- 🎮 **Multiplayer Game Starter** (coming soon)

[Browse all templates →](https://coldstartkit.com/templates)

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/soulfra/agent-router/issues)
- **Email:** matt@soulfra.com
- **Twitter:** [@roughsparks](https://twitter.com/roughsparks)
- **Discord:** [Join our Discord](https://discord.gg/soulfra)

---

## 📄 License

MIT License - Free to use for personal and commercial projects

---

**Built with ❤️ by Soulfra Network**

*Part of the BillionDollarGame - 12 interconnected brands, one mission*
