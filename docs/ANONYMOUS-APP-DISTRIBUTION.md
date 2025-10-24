# Anonymous App Distribution Pipeline

**Build → Deploy → Distribute apps anonymously through GitHub, Google Drive, and custom DNS**

## What This Does

Creates a complete pipeline for building and distributing web apps **anonymously**:

1. **Generate apps** from APIs (using existing API-to-App generator)
2. **Deploy to GitHub** (auto-create repos, enable GitHub Pages)
3. **Publish to Google Drive** (distribute via drive.google.com/start/apps)
4. **Configure custom DNS** (cards.calos.games → your app)
5. **Anonymous authentication** (users log in with GitHub/Google, get pseudonymous identities)

## Quick Start

### 1. One-Command Deployment

```bash
npm run deploy-app -- \
  --name my-card-game \
  --path ./generated/my-card-game \
  --github \
  --google-drive \
  --dns cards.calos.games
```

This will:
- Create GitHub repo + enable Pages
- Upload to Google Drive
- Configure DNS
- Set up anonymous OAuth
- Return all URLs

### 2. Programmatic Usage

```javascript
const AppDeploymentPipeline = require('./lib/app-deployment-pipeline');

const pipeline = new AppDeploymentPipeline({ db });

const deployment = await pipeline.deployApp('./generated/my-app', {
  name: 'my-card-game',
  deployTo: ['github', 'google-drive', 'dns'],
  customDomain: 'cards.calos.games',
  googleTokens: userGoogleTokens
});

console.log('Deployed to:');
console.log('  GitHub:', deployment.urls.github);
console.log('  GitHub Pages:', deployment.urls.githubPages);
console.log('  Google Drive:', deployment.urls.googleDrive);
console.log('  Custom Domain:', deployment.urls.customDomain);
```

## Architecture

```
User → Cal AI → API-to-App Generator
                      ↓
               Generated App
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓              ↓
    GitHub        Google         Custom
    Pages          Drive           DNS
        ↓             ↓              ↓
   username.      drive.google   cards.calos
   github.io       .com/start     .games
                    /apps
        └─────────────┼─────────────┘
                      ↓
           Anonymous OAuth Bridge
                      ↓
            Players log in as:
         @anon_swift_fox_123
           (no real names)
```

## Components

### 1. GitHubAppPublisher (`lib/github-app-publisher.js`)

Auto-deploys apps to GitHub:

```javascript
const publisher = new GitHubAppPublisher({ githubToken });

await publisher.publishApp('./my-app', {
  name: 'my-card-game',
  description: 'Awesome card game',
  enablePages: true,
  enableActions: true
});
// Creates repo, pushes code, enables Pages, sets up Actions
```

**Features:**
- ✅ Auto-create GitHub repos
- ✅ Push code via git
- ✅ Enable GitHub Pages
- ✅ Set up GitHub Actions workflow
- ✅ Configure webhooks
- ✅ Fork to user's account (optional)

### 2. GoogleDriveAppPublisher (`lib/google-drive-app-publisher.js`)

Publishes apps to Google Drive:

```javascript
const publisher = new GoogleDriveAppPublisher();
await publisher.initialize(googleOAuthTokens);

await publisher.publishApp('./my-app', {
  name: 'My Card Game',
  category: 'GAMES',
  public: true
});
// Uploads to Drive, creates shareable link
```

**Features:**
- ✅ Upload app files to Drive
- ✅ Create public shareable folders
- ✅ Generate drive.google.com/start/apps links
- ✅ Workspace Marketplace publishing (coming soon)

### 3. AnonymousIdentityRouter (`lib/anonymous-identity-router.js`)

Matrix-style anonymous authentication:

```javascript
const router = new AnonymousIdentityRouter({ db });

const identity = await router.authenticateUser('github', githubProfile);
// Returns: { anonymousId: 'usr_abc123', handle: '@anon_swift_fox_456' }
```

**Features:**
- ✅ Pseudonymous handles (@anon_swift_fox_123)
- ✅ Link multiple OAuth providers to one anonymous ID
- ✅ No real names/emails exposed
- ✅ Revocable access tokens
- ✅ Zero-knowledge architecture

### 4. GameDNSRouter (`lib/game-dns-router.js`)

Custom DNS management:

```javascript
const dns = new GameDNSRouter({ provider: 'cloudflare' });

await dns.createRecord('cards.calos.games', 'CNAME', 'user.github.io', {
  proxied: true // DDoS protection
});
```

**Providers:**
- ✅ Cloudflare DNS API (managed, easy)
- ✅ Self-hosted BIND9 (full control)

### 5. AppDeploymentPipeline (`lib/app-deployment-pipeline.js`)

Orchestrates everything:

```javascript
const pipeline = new AppDeploymentPipeline({ db });

const deployment = await pipeline.deployApp('./my-app', {
  name: 'my-card-game',
  deployTo: ['github', 'google-drive', 'dns'],
  customDomain: 'cards.calos.games'
});
```

**Features:**
- ✅ End-to-end deployment
- ✅ Status tracking
- ✅ Rollback support
- ✅ Webhook notifications

## Example Flow

### Build and Deploy a Card Game

```bash
# Step 1: Generate app from API
npm run generate -- \
  --api https://api.example.com \
  --platform web \
  --name card-game

# Step 2: Deploy everywhere
npm run deploy-app -- \
  --name card-game \
  --path ./generated/card-game \
  --github \
  --google-drive \
  --dns cards.calos.games

# Output:
# ✓ GitHub repo created: https://github.com/calos/card-game
# ✓ GitHub Pages deployed: https://calos.github.io/card-game
# ✓ Google Drive uploaded: https://drive.google.com/drive/folders/ABC123
# ✓ DNS configured: cards.calos.games → calos.github.io/card-game
# ✓ Anonymous auth enabled
#
# Share link: https://cards.calos.games
# Players log in as: @anon_swift_fox_123 (GitHub) or @anon_brave_tiger_456 (Google)
```

### Anonymous User Login

```javascript
// User clicks "Sign in with GitHub"
const githubProfile = await getGitHubProfile(accessToken);

// Route through AnonymousIdentityRouter
const identity = await anonymousRouter.authenticateUser('github', githubProfile);

// App receives:
{
  anonymousId: 'usr_abc123_def456',
  handle: '@anon_swift_fox_789',
  displayName: 'Player 1234',
  avatarUrl: 'https://www.gravatar.com/avatar/...?d=identicon',
  sessionToken: 'base64_encrypted_token',
  providers: ['github']
}

// Real GitHub username NEVER exposed to the app
// User is just "@anon_swift_fox_789"
```

## Environment Variables

```bash
# GitHub
GITHUB_TOKEN=ghp_your_token
WEBHOOK_URL=https://your-server.com/webhooks/github

# Google
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-server.com/api/auth/oauth/callback

# DNS (Cloudflare)
DNS_PROVIDER=cloudflare
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ZONE_ID=your_zone_id

# OR DNS (Self-hosted)
DNS_PROVIDER=self-hosted
DNS_ZONE_FILE=/etc/bind/zones/calos.games.zone
DNS_RELOAD_COMMAND="sudo systemctl reload bind9"

# Database
DATABASE_URL=postgresql://...
```

## Database Setup

```bash
# Run migration
psql $DATABASE_URL < scripts/migrations/013-anonymous-app-distribution.sql
```

This creates:
- `anonymous_identities` - Pseudonymous user identities
- `identity_providers` - OAuth provider linkages
- `app_deployments` - GitHub deployments
- `google_drive_deployments` - Google Drive deployments
- `dns_records` - Custom DNS records
- `app_deployment_pipeline` - Deployment orchestration tracking
- `app_oauth_configs` - Per-app OAuth settings

## API Routes

```javascript
// Deploy an app
POST /api/deploy/app
{
  "name": "my-card-game",
  "path": "./generated/my-card-game",
  "deployTo": ["github", "google-drive", "dns"],
  "customDomain": "cards.calos.games",
  "googleTokens": { ... }
}

// Get deployment status
GET /api/deploy/status/:appName

// List deployments
GET /api/deploy/list

// Rollback deployment
POST /api/deploy/rollback/:appName

// Anonymous authentication
POST /api/auth/anonymous
{
  "provider": "github",
  "profile": { ... }
}

// DNS management
POST /api/dns/create
{
  "subdomain": "cards.calos.games",
  "type": "CNAME",
  "target": "user.github.io"
}

GET /api/dns/list
DELETE /api/dns/:subdomain
```

## Use Cases

### 1. Anonymous Game Distribution

```
Build game → Deploy to GitHub Pages → Custom domain (cards.calos.games)
                ↓
Players log in with GitHub → Get anonymous identity (@anon_swift_fox_123)
                ↓
Play game, no real names exposed
```

### 2. Rapid Prototyping

```
Generate app from API → Deploy to GitHub + Google Drive in one command
                ↓
Share link instantly, no server setup required
```

### 3. Community App Store

```
Users build apps → Deploy through your pipeline → Custom DNS (*.calos.games)
                ↓
Curated app directory, all hosted for free
```

## Security

### Anonymous Identity

- Real names NEVER exposed to apps
- Pseudonymous handles generated randomly
- Avatar URLs are generic Gravatars (identicons)
- Session tokens expire after 24 hours
- Users can revoke access anytime

### OAuth Bridging

```
User → GitHub OAuth → Your Router → Anonymous ID
                  ↓
        (Real identity stays on your server)
                  ↓
    App receives anonymous handle only
```

### Zero-Knowledge Architecture

- Your router never stores real emails/names
- Only stores: provider ID + anonymous ID mapping
- Apps can't reverse-lookup real identities
- Encrypted OAuth tokens in database

## Roadmap

- [ ] **Google Workspace Marketplace** publishing
- [ ] **Google Apps Script** web app hosting
- [ ] **Vercel/Netlify** deployment support
- [ ] **Docker** containerized deployments
- [ ] **IPFS** decentralized hosting
- [ ] **ENS** Ethereum domain names
- [ ] **Print-on-demand** QR codes for physical distribution
- [ ] **Mobile app** wrapper (Capacitor/React Native)

## Examples

See `examples/anonymous-app-distribution/` for complete examples:
- Card game with anonymous multiplayer
- API dashboard with Google Drive hosting
- Community app store

---

**Built with ❤️ by CALOS**

*Anonymous • Free • Instant distribution*
