# OAuth Starter Template

**Multi-provider OAuth with auto-subdomain creation**

Login with Twitter, GitHub, Discord, or LinkedIn. Auto-creates subdomains like `@yourhandle.yourdomain.com`. Includes activity tracking and leaderboards.

---

## 🚀 Quick Start (3 Steps)

### 1. Use This Template

Click "Use this template" button above, or:

```bash
gh repo create my-oauth-app --template coldstartkit/oauth-starter
cd my-oauth-app
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env - add your OAuth credentials
```

### 3. Deploy

```bash
vercel
```

Done! Your OAuth system is live.

---

## 🎨 Customize Branding

Edit `public/login.html`:

```html
<!-- Change these -->
<h1>Your Brand Name</h1>
<p>Your tagline</p>

<!-- Change colors -->
<style>
  background: linear-gradient(135deg, #YOUR_COLOR_1, #YOUR_COLOR_2);
</style>
```

---

## 🔑 Get OAuth Credentials

Need help setting up Twitter/GitHub/Discord/LinkedIn OAuth?

See: [docs/SOCIAL-AUTH-SETUP.md](./docs/SOCIAL-AUTH-SETUP.md)

---

## 📚 What's Included

- ✅ Twitter/X OAuth
- ✅ GitHub OAuth
- ✅ Discord OAuth
- ✅ LinkedIn OAuth
- ✅ Auto-subdomain creation (`@handle.yourdomain.com`)
- ✅ Activity tracking (30-day expiration)
- ✅ Leaderboard (top 1000 = immunity)
- ✅ Expertise extraction (from bio/repos)
- ✅ Google Sheets persistence (optional)

---

## 🛠️ Development

```bash
npm start
# Visit http://localhost:5001/login.html
```

---

## 📄 License

MIT

---

**Part of ColdStartKit** - Startup launch templates by Soulfra Network
