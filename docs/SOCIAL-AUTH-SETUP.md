# Social OAuth Setup Guide

Complete guide to setting up Twitter/X, GitHub, Discord, and LinkedIn OAuth for Soulfra Network.

## Overview

This guide walks you through creating OAuth apps for all supported social providers. After completing this setup, users will be able to:

- Login with Twitter/X (@yourhandle) → Auto-creates subdomain (yourhandle.soulfra.com)
- Login with GitHub → Links repos and contributions
- Login with Discord → Community integration
- Login with LinkedIn → Professional network connections

## Prerequisites

- Node.js installed
- `.env` file created (copy from `.env.example`)
- Access to the social platforms you want to enable

---

## 1. Twitter/X OAuth Setup

### Step 1: Create Twitter Developer Account

1. Go to [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)
2. Sign in with your Twitter account (@roughsparks or your account)
3. Apply for a developer account (usually instant approval)
4. Complete the required information about your use case

### Step 2: Create Twitter App

1. Click **"Create App"** or **"+ Create Project"**
2. Fill in app details:
   - **App name**: `Soulfra Network` (or your brand name)
   - **Description**: `Multi-brand network with vanity subdomains`
   - **Website**: `https://soulfra.com` (or your domain)

### Step 3: Enable OAuth 2.0

1. Navigate to **"App Settings"** → **"User authentication settings"**
2. Click **"Set up"**
3. Configure OAuth 2.0:
   - **App permissions**: Read
   - **Type of App**: Web App
   - **Callback URI / Redirect URL**:
     ```
     http://localhost:5001/auth/callback/twitter
     ```
     (For production, add: `https://yourdomain.com/auth/callback/twitter`)
   - **Website URL**: `http://localhost:5001`

### Step 4: Get Credentials

1. After saving, you'll see **Client ID** and **Client Secret**
2. Copy these values to your `.env` file:
   ```bash
   TWITTER_CLIENT_ID=your_client_id_here
   TWITTER_CLIENT_SECRET=your_client_secret_here
   ```

### Important Notes

- **Keep Client Secret private** - Never commit to git
- Twitter OAuth 2.0 uses PKCE flow (more secure than OAuth 1.0a)
- Scopes requested: `tweet.read users.read follows.read offline.access`
- Offline access enables refresh tokens (sessions persist)

---

## 2. GitHub OAuth Setup

### Step 1: Create GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in app details:
   - **Application name**: `Soulfra Network`
   - **Homepage URL**: `http://localhost:5001` (or `https://soulfra.com` for production)
   - **Authorization callback URL**:
     ```
     http://localhost:5001/auth/callback/github
     ```

### Step 2: Get Credentials

1. After creating the app, you'll see **Client ID**
2. Click **"Generate a new client secret"**
3. Copy both values to your `.env` file:
   ```bash
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

### Important Notes

- GitHub provides email address (unlike Twitter)
- Scopes requested: `read:user user:email`
- Future enhancement: Fetch user's repos and commit counts for activity tracking

---

## 3. Discord OAuth Setup

### Step 1: Create Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name: `Soulfra Network`

### Step 2: Configure OAuth2

1. Navigate to **"OAuth2"** section in sidebar
2. Add **Redirects**:
   ```
   http://localhost:5001/auth/callback/discord
   ```

### Step 3: Get Credentials

1. Copy **Client ID** and **Client Secret** from the OAuth2 page
2. Add to `.env`:
   ```bash
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   ```

### Important Notes

- Scopes requested: `identify email guilds`
- `guilds` scope allows seeing which Discord servers user is in (for community features)
- Discord provides unique avatar URLs via CDN

---

## 4. LinkedIn OAuth Setup

### Step 1: Create LinkedIn App

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Click **"Create app"**
3. Fill in details:
   - **App name**: `Soulfra Network`
   - **LinkedIn Page**: (Your company page, or create one)
   - **App logo**: Upload logo
   - **Legal agreement**: Accept terms

### Step 2: Configure OAuth

1. Navigate to **"Auth"** tab
2. Add **Authorized redirect URLs**:
   ```
   http://localhost:5001/auth/callback/linkedin
   ```

### Step 3: Get Credentials

1. Copy **Client ID** and **Client Secret** from the Auth tab
2. Add to `.env`:
   ```bash
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
   ```

### Step 4: Request API Access

1. Go to **"Products"** tab
2. Request access to **"Sign In with LinkedIn"**
3. Wait for approval (usually instant)

### Important Notes

- Scopes requested: `r_liteprofile r_emailaddress`
- LinkedIn OAuth is more restrictive than other providers
- Requires company page to create app

---

## 5. Final Configuration

### Set Callback Base URL

In your `.env` file, set the callback base URL:

```bash
# Development
OAUTH_CALLBACK_BASE_URL=http://localhost:5001

# Production
OAUTH_CALLBACK_BASE_URL=https://soulfra.com
```

**Important**: This must match the callback URLs you registered with each provider.

### Complete .env Example

```bash
# ============================================================================
# SOCIAL OAUTH
# ============================================================================

# Twitter/X OAuth 2.0
TWITTER_CLIENT_ID=V1lMa2pYTUE...
TWITTER_CLIENT_SECRET=dGhpc19pc19...

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=ghp_abc123def456...

# Discord OAuth
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=abc123def456...

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=78abc123def
LINKEDIN_CLIENT_SECRET=abc123def456...

# Callback URL (change for production)
OAUTH_CALLBACK_BASE_URL=http://localhost:5001
```

---

## 6. Testing the Login Flow

### Start the Server

```bash
npm start
# Or if using the router directly:
node router.js
```

### Test Login Page

1. Navigate to: `http://localhost:5001/login.html`
2. Click **"Sign in with X"** (or any provider)
3. You'll be redirected to the provider's OAuth page
4. Authorize the app
5. You'll be redirected back to: `http://localhost:5001/{yourhandle}`

### Expected Flow

```
User clicks "Sign in with X"
  ↓
Redirect to https://twitter.com/i/oauth2/authorize?...
  ↓
User authorizes app
  ↓
Redirect to http://localhost:5001/auth/callback/twitter?code=...
  ↓
Exchange code for access token
  ↓
Fetch user info from Twitter API
  ↓
Create/update user profile
  ↓
Auto-create subdomain: {username}.soulfra.com
  ↓
Extract expertise from bio
  ↓
Log activity (add to leaderboard)
  ↓
Set session cookie
  ↓
Redirect to http://localhost:5001/{username}
```

---

## 7. Troubleshooting

### Error: "Invalid redirect_uri"

**Problem**: Callback URL doesn't match what's registered with the provider.

**Solution**:
- Check `.env` → `OAUTH_CALLBACK_BASE_URL` matches your app settings
- Ensure you added the exact callback URL in the provider's dashboard
- For Twitter: `http://localhost:5001/auth/callback/twitter`
- For GitHub: `http://localhost:5001/auth/callback/github`

### Error: "Invalid state parameter"

**Problem**: CSRF state verification failed (possible session timeout or duplicate request).

**Solution**:
- OAuth states expire after 10 minutes
- Try initiating the login flow again
- Clear cookies and try again

### Error: "Failed to exchange code for token"

**Problem**: Client Secret is incorrect or expired.

**Solution**:
- Double-check Client Secret in `.env`
- Regenerate Client Secret in provider dashboard
- Ensure no extra spaces or quotes in `.env`

### Error: "Failed to get user info"

**Problem**: Access token is invalid or scopes are insufficient.

**Solution**:
- Check that you requested the correct scopes in provider dashboard
- Twitter: `tweet.read users.read follows.read offline.access`
- GitHub: `read:user user:email`
- Discord: `identify email guilds`
- LinkedIn: `r_liteprofile r_emailaddress`

### Error: "Not authenticated" when accessing /auth/me

**Problem**: Session cookie not set or expired.

**Solution**:
- Check browser dev tools → Application → Cookies
- Look for `session_id` cookie
- Sessions expire after 30 days
- Re-login to create new session

---

## 8. Production Deployment

### Update Callback URLs

When deploying to production, add production callback URLs to each provider:

**Twitter/X**:
- Dev: `http://localhost:5001/auth/callback/twitter`
- Prod: `https://soulfra.com/auth/callback/twitter`

**GitHub**:
- Dev: `http://localhost:5001/auth/callback/github`
- Prod: `https://soulfra.com/auth/callback/github`

(Same pattern for Discord and LinkedIn)

### Update .env for Production

```bash
OAUTH_CALLBACK_BASE_URL=https://soulfra.com
NODE_ENV=production
```

### Security Checklist

- ✅ Never commit `.env` to git (add to `.gitignore`)
- ✅ Use HTTPS in production (required by most OAuth providers)
- ✅ Set `secure: true` for cookies in production
- ✅ Rotate Client Secrets periodically
- ✅ Monitor OAuth callback errors in logs
- ✅ Rate limit login endpoints to prevent abuse

---

## 9. Next Steps

After OAuth is working:

1. **Link GitHub Contributions** → Fetch repos, count commits, add to activity score
2. **Create User Dashboard** → Show subdomains, activity, leaderboard rank
3. **Build Expertise Marketplace** → Match users by skills to bounties
4. **Add Viral Link Generator** → Branded short links for sharing
5. **Implement Auction System** → Expired/premium subdomains go to auction

---

## 10. Resources

- Twitter OAuth 2.0 Docs: https://developer.x.com/en/docs/authentication/oauth-2-0
- Twitter Brand Toolkit: https://about.x.com/en/who-we-are/brand-toolkit
- GitHub OAuth Guide: https://docs.github.com/en/developers/apps/building-oauth-apps
- Discord OAuth Guide: https://discord.com/developers/docs/topics/oauth2
- LinkedIn OAuth Guide: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication

---

## Support

Questions? Issues?
- GitHub: https://github.com/soulfra
- Email: matt@soulfra.com
- Twitter: @roughsparks
