# Vercel + GitHub Pages Deployment Guide

Complete guide to deploying Soulfra Network OAuth system using Vercel (backend) + GitHub Pages (frontend).

## Architecture

```
GitHub Pages (soulfra.github.io)          Vercel (soulfra-api.vercel.app)
├── login.html (OAuth buttons)            ├── /api/auth/twitter
├── index.html (landing page)             ├── /api/auth/github
├── network-map.html                      ├── /api/auth/discord
└── {username}/index.html                 ├── /api/auth/linkedin
                                          ├── /api/auth/callback
                                          ├── /api/auth/me
                                          └── /api/auth/logout
```

**User Flow:**
1. User visits `https://soulfra.github.io/login.html`
2. Clicks "Sign in with X"
3. Redirects to `https://soulfra-api.vercel.app/api/auth/twitter`
4. Twitter OAuth flow
5. Callback to `https://soulfra-api.vercel.app/api/auth/callback?provider=twitter&code=...`
6. Creates user, subdomain, sets cookie
7. Redirects back to `https://soulfra.github.io/{username}`

---

## Prerequisites

- GitHub account
- Vercel account (free tier)
- Twitter Developer account
- GitHub OAuth app
- (Optional) Discord, LinkedIn OAuth apps
- (Optional) Google Sheets for data persistence

---

## Part 1: Set Up OAuth Apps

### Twitter/X OAuth

1. Go to [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)
2. Create project → Create app
3. App Settings → User authentication settings → Set up
4. **Callback URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=twitter`
5. **Website URL:** `https://soulfra.github.io`
6. Copy **Client ID** and **Client Secret**

### GitHub OAuth

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. New OAuth App
3. **Homepage URL:** `https://soulfra.github.io`
4. **Callback URL:** `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=github`
5. Copy **Client ID** and generate **Client Secret**

### Discord OAuth

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application
3. OAuth2 → Add Redirect: `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=discord`
4. Copy **Client ID** and **Client Secret**

### LinkedIn OAuth

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Create app
3. Auth → Add redirect URL: `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback?provider=linkedin`
4. Copy **Client ID** and **Client Secret**

---

## Part 2: Deploy Backend to Vercel

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy from Project Root

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
vercel
```

Follow prompts:
- Set up and deploy? **Y**
- Which scope? (Select your account)
- Link to existing project? **N**
- Project name: `soulfra-api` (or whatever you want)
- In which directory is your code? `.` (current directory)
- Want to override settings? **N**

Vercel will deploy and give you a URL like: `https://soulfra-api.vercel.app`

### Step 4: Add Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add these variables:

```bash
# OAuth Credentials
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret

# URLs
OAUTH_CALLBACK_BASE_URL=https://soulfra-api.vercel.app
LOGIN_PAGE_URL=https://soulfra.github.io/login.html
HOME_PAGE_URL=https://soulfra.github.io
PARENT_DOMAIN=soulfra.com

# Optional: Google Sheets (for persistence)
GOOGLE_SHEETS_DB_ID=your_spreadsheet_id
GOOGLE_SHEETS_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Node Environment
NODE_ENV=production
```

### Step 5: Redeploy with Environment Variables

```bash
vercel --prod
```

Your API is now live at `https://soulfra-api.vercel.app`

---

## Part 3: Update OAuth Callback URLs

Now that you have your Vercel URL, update the callback URLs in each OAuth app:

**Twitter:**
- Old: `http://localhost:5001/auth/callback/twitter`
- New: `https://soulfra-api.vercel.app/api/auth/callback?provider=twitter`

**GitHub:**
- Old: `http://localhost:5001/auth/callback/github`
- New: `https://soulfra-api.vercel.app/api/auth/callback?provider=github`

**Discord:**
- Old: `http://localhost:5001/auth/callback/discord`
- New: `https://soulfra-api.vercel.app/api/auth/callback?provider=discord`

**LinkedIn:**
- Old: `http://localhost:5001/auth/callback/linkedin`
- New: `https://soulfra-api.vercel.app/api/auth/callback?provider=linkedin`

---

## Part 4: Deploy Frontend to GitHub Pages

### Step 1: Create GitHub Repository

```bash
# If you don't have a repo yet
git remote add origin https://github.com/soulfra/soulfra.github.io.git
```

### Step 2: Update Login Page

Edit `public/login.html` to point to Vercel API:

```html
<a href="https://soulfra-api.vercel.app/api/auth/twitter" class="oauth-button twitter-button">
  Sign in with X
</a>

<a href="https://soulfra-api.vercel.app/api/auth/github" class="oauth-button github-button">
  Sign in with GitHub
</a>

<a href="https://soulfra-api.vercel.app/api/auth/discord" class="oauth-button discord-button">
  Sign in with Discord
</a>

<a href="https://soulfra-api.vercel.app/api/auth/linkedin" class="oauth-button linkedin-button">
  Sign in with LinkedIn
</a>
```

Also update the `/auth/me` fetch call:

```javascript
fetch('https://soulfra-api.vercel.app/api/auth/me', {
  credentials: 'include'
})
.then(res => res.json())
.then(data => {
  if (data.success && data.user) {
    window.location.href = `/${data.user.vanitySubdomain}`;
  }
});
```

### Step 3: Copy Public Files to GitHub Pages Repo

```bash
# Copy everything from public/ to your GitHub Pages repo
cp -r public/* ../soulfra.github.io/

# Or if public/ IS your GitHub Pages repo:
git add .
git commit -m "Add OAuth login page"
git push origin main
```

### Step 4: Enable GitHub Pages

1. Go to GitHub repo → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main** / (root)
4. Save

Your site will be live at `https://soulfra.github.io` in ~1 minute.

---

## Part 5: Test the Flow

### Step 1: Visit Login Page

Go to: `https://soulfra.github.io/login.html`

### Step 2: Click "Sign in with X"

Should redirect to: `https://soulfra-api.vercel.app/api/auth/twitter`
Then to: `https://twitter.com/i/oauth2/authorize?...`

### Step 3: Authorize App

Click "Authorize app" on Twitter

### Step 4: Callback

Should redirect to: `https://soulfra-api.vercel.app/api/auth/callback?provider=twitter&code=...&state=...`

Then back to: `https://soulfra.github.io/{yourhandle}`

### Step 5: Check User Data

Open browser console and run:

```javascript
fetch('https://soulfra-api.vercel.app/api/auth/me', {
  credentials: 'include'
})
.then(res => res.json())
.then(console.log)
```

Should see your user profile:

```json
{
  "success": true,
  "user": {
    "userId": "user_1234567890_abcdef12",
    "email": null,
    "primaryProvider": "twitter",
    "vanitySubdomain": "roughsparks",
    "expertise": ["javascript", "python", "web3"],
    "socialProfiles": {
      "twitter": {
        "username": "roughsparks",
        "displayName": "Matthew Mauer",
        "avatarUrl": "https://...",
        "bio": "...",
        "followers": 1234
      }
    },
    "activity": {
      "totalScore": 1,
      "lastActivityAt": "2025-10-22T...",
      "daysUntilExpiration": 30,
      "hasImmunity": false
    },
    "leaderboard": {
      "globalRank": 1,
      "globalScore": 1,
      "brandRanks": { "soulfra.com": 1 }
    }
  }
}
```

---

## Part 6: Optional - Add Google Sheets Persistence

### Why?

By default, user data is stored in-memory and lost when Vercel spins down your serverless functions. Google Sheets adds free persistence.

### Step 1: Create Google Sheets Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create new spreadsheet: "Soulfra Network DB"
3. Copy Spreadsheet ID from URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

### Step 2: Create Google Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project: "Soulfra Network"
3. Enable Google Sheets API
4. Create Service Account → Download JSON key
5. Share spreadsheet with service account email (e.g., `soulfra@....iam.gserviceaccount.com`)

### Step 3: Add to Vercel Environment Variables

```bash
GOOGLE_SHEETS_DB_ID=1A2B3C4D5E6F7G8H9I0J
GOOGLE_SHEETS_SERVICE_ACCOUNT={"type":"service_account","project_id":"soulfra-network",...}
```

### Step 4: Redeploy

```bash
vercel --prod
```

Now user data persists in Google Sheets!

---

## Troubleshooting

### Error: "Invalid redirect_uri"

**Problem:** OAuth callback URL doesn't match what's registered.

**Solution:**
- Check Vercel URL matches exactly
- Include `?provider=twitter` in callback URL
- Use `https://` not `http://` in production

### Error: "Session not found"

**Problem:** Cookies not being set/sent.

**Solution:**
- Check `credentials: 'include'` in fetch calls
- Ensure `SameSite=Lax` in cookies
- Use same domain for API and frontend (or CORS properly configured)

### Error: "Failed to exchange code for token"

**Problem:** Client Secret is wrong or missing.

**Solution:**
- Double-check environment variables in Vercel dashboard
- Regenerate Client Secret in OAuth app
- Redeploy: `vercel --prod`

### Cookies Not Working Across Domains

**Problem:** GitHub Pages and Vercel are different domains.

**Solution 1 - Custom Domain:**
- Buy domain: `soulfra.com`
- Frontend: `soulfra.com` (GitHub Pages)
- API: `api.soulfra.com` (Vercel)
- Cookies work because same root domain

**Solution 2 - localStorage (less secure):**
Instead of cookies, return JWT token and store in localStorage.

---

## Custom Domain Setup (Recommended)

### Step 1: Buy Domain

Buy `soulfra.com` (or whatever domain)

### Step 2: Configure GitHub Pages

1. GitHub repo → Settings → Pages
2. Custom domain: `soulfra.com`
3. Enforce HTTPS

### Step 3: Configure Vercel

1. Vercel project → Settings → Domains
2. Add domain: `api.soulfra.com`
3. Add DNS records (Vercel will show you)

### Step 4: Update Environment Variables

```bash
OAUTH_CALLBACK_BASE_URL=https://api.soulfra.com
LOGIN_PAGE_URL=https://soulfra.com/login.html
HOME_PAGE_URL=https://soulfra.com
```

### Step 5: Update OAuth Apps

Update all callback URLs:
- `https://api.soulfra.com/api/auth/callback?provider=twitter`
- `https://api.soulfra.com/api/auth/callback?provider=github`
- etc.

### Step 6: Update Login Page

```html
<a href="https://api.soulfra.com/api/auth/twitter">Sign in with X</a>
```

```javascript
fetch('https://api.soulfra.com/api/auth/me', { credentials: 'include' })
```

Now cookies work perfectly because frontend and API share root domain!

---

## Costs

- **Vercel:** Free (100GB bandwidth, 100 hours serverless)
- **GitHub Pages:** Free (1GB storage, 100GB bandwidth)
- **Google Sheets:** Free (10M cells, 100 requests/min)
- **Custom Domain:** ~$12/year (if you want one)

**Total: $0/month** (or $1/month if you buy a domain)

---

## Next Steps

1. **Test OAuth flow end-to-end**
2. **Create user dashboard** (`/{username}/index.html`)
3. **Add subdomain routing** (Cloudflare Workers or Vercel Edge)
4. **Build activity tracking UI** (show points, rank, immunity)
5. **Create leaderboard page** (top 1000 users)
6. **Add domain auction system** (for expired/premium subdomains)
7. **Link GitHub contributions** (fetch repos, count commits)
8. **Create viral link generator** (branded short links + QR codes)

---

## Support

- Issues: https://github.com/soulfra/agent-router/issues
- Docs: See `docs/SOCIAL-AUTH-SETUP.md`
- Email: matt@soulfra.com
- Twitter: @roughsparks

---

**🎉 You now have a fully functional, zero-cost OAuth system with Twitter/GitHub/Discord/LinkedIn login, auto-subdomain creation, and activity-based validation!**
