# Portfolio Hub System - Complete Guide

**Unified analytics and authorship tracking for CALOS**

---

## Overview

The Portfolio Hub system aggregates data from multiple sources into a professional portfolio showcase:

- **AI Chat Logs** - Track conversations, tokens, cost across all AI models
- **Git Activity** - GitHub/GitLab/Bitbucket commits, PRs, stars, forks
- **Embed Analytics** - Pageviews, conversions, consent rates from embedded scripts
- **Intellectual Property** - Patents, trademarks, copyrights with Soulfra cryptographic proof
- **Multi-Database Stats** - Aggregation across 12 bucket instances
- **Mining/Rewards** - Karma-based incentives for contributions
- **OSS Trending Analysis** - Deconstruct and integrate trending open-source features

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Portfolio Hub                            │
│              (Aggregation Engine)                           │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
   ┌─────────▼─────────┐        ┌────────▼────────┐
   │  Portfolio        │        │   Authorship    │
   │  Timeline         │        │   Tracker       │
   │  (Unified Feed)   │        │   (IP/Soulfra)  │
   └─────────┬─────────┘        └────────┬────────┘
             │                            │
   ┌─────────▼─────────┐        ┌────────▼────────┐
   │  Git Portfolio    │        │  OSS Trending   │
   │  Sync             │        │  Analyzer       │
   │  (3 platforms)    │        │  (GitHub/GitLab)│
   └───────────────────┘        └─────────────────┘
             │
   ┌─────────▼─────────┐
   │  Mining/Rewards   │
   │  (Karma System)   │
   └───────────────────┘
             │
   ┌─────────▼─────────────────────────────────┐
   │     Multi-Server Mirror                   │
   │  (Primary + Replicas)                     │
   └───────────────────────────────────────────┘
```

---

## Database Schema

Created by `migrations/070_portfolio_system.sql`:

### Tables

**git_portfolio_stats** - GitHub/GitLab/Bitbucket activity
- Tracks: commits, PRs, stars, forks, followers
- Contribution graphs (JSON with daily commits)
- Language breakdowns

**authorship_registry** - Patents, trademarks, IP
- Soulfra cryptographic signatures (SHA-256 + Ed25519)
- Blockchain-like proof chain (hash → previous_hash)
- Related code/commits for IP claims

**portfolio_timeline** - Unified activity feed
- Events from all sources (AI, git, embed, IP)
- Filterable by category, public/private
- Powers activity feed UI

**portfolio_analytics** - Aggregated daily stats
- AI conversations, tokens, cost
- Git commits, PRs, stars
- Embed pageviews, conversions
- IP filings

**bucket_database_stats** - Multi-database aggregation
- Stats from 12 isolated bucket instances
- Table counts, record counts, query counts

**portfolio_settings** - User preferences
- Public/private toggle
- Theme customization
- Social links
- Export settings

---

## Core Libraries

### 1. portfolio-hub.js

**Aggregation engine** - Combines data from all sources

```javascript
const PortfolioHub = require('./lib/portfolio-hub');
const hub = new PortfolioHub(pool);

// Get timeline
const timeline = await hub.getTimeline(userId, 50);

// Compute daily analytics
const analytics = await hub.computeDailyAnalytics(userId);

// Get overview
const overview = await hub.getOverview(userId);
```

**Key Methods:**
- `getTimeline(userId, limit)` - Get recent activity
- `addTimelineEvent(event)` - Add event to timeline
- `syncAIConversations(userId, since)` - Sync chat logs
- `syncEmbedAnalytics(userId, since)` - Sync embed events
- `computeDailyAnalytics(userId, date)` - Aggregate daily stats
- `getOverview(userId)` - Lifetime stats
- `getSettings(userId)` - Portfolio settings
- `registerIP(userId, ip)` - Register IP with Soulfra proof

### 2. git-portfolio-sync.js

**Git activity aggregation** - Syncs GitHub/GitLab/Bitbucket

```javascript
const GitPortfolioSync = require('./lib/git-portfolio-sync');
const gitSync = new GitPortfolioSync(pool);

// Sync GitHub
await gitSync.syncGitHub(userId, 'username', accessToken);

// Sync all platforms
const results = await gitSync.syncAll(userId, {
  github: 'username',
  gitlab: 'username',
  bitbucket: 'username'
}, {
  github: 'token',
  gitlab: 'token',
  bitbucket: 'token'
});

// Get stats
const stats = await gitSync.getStats(userId);
```

**Tracked Metrics:**
- Total repos (public/private)
- Commits (total, this year, this month)
- PRs (total, merged)
- Issues (total, closed)
- Stars, forks, watchers
- Followers, following
- Contribution graphs (JSON)
- Language breakdowns

### 3. authorship-tracker.js

**IP registry with Soulfra signatures** - Cryptographic proof of authorship

```javascript
const AuthorshipTracker = require('./lib/authorship-tracker');
const tracker = new AuthorshipTracker(pool);

// Register patent
const patent = await tracker.registerPatent(userId, {
  title: 'Unified Portfolio System',
  description: 'System for aggregating analytics...',
  filingNumber: 'US123456',
  filingDate: '2025-01-15',
  status: 'filed',
  tags: ['software', 'analytics'],
  category: 'software',
  jurisdiction: 'US'
});

// Auto-detect from git repo
const detected = await tracker.autoDetectFromGit('/path/to/repo', userId);

// Generate proof certificate
const certificate = await tracker.generateProofCertificate(ipId);

// Export registry
const exported = await tracker.exportRegistry(userId, includePrivate);
```

**Soulfra Signatures:**
- SHA-256 content hash
- Ed25519 signature (HMAC placeholder in dev)
- Previous hash for blockchain-like chain
- Timestamp and signer metadata
- Full proof chain in JSON

**IP Types:**
- Patent
- Trademark
- Copyright
- Trade Secret
- Invention

### 4. oss-trending-analyzer.js

**OSS analysis and integration suggestions** - Deconstruct trending repos

```javascript
const OSSTrendingAnalyzer = require('./lib/oss-trending-analyzer');
const analyzer = new OSSTrendingAnalyzer(pool);

// Analyze trending repos
const analysis = await analyzer.analyzeTrending('javascript', 20);

// Results:
{
  repos: 20,
  analyzed: 15,
  integrations: 42,
  compatible: 38,
  breaking: 4,
  plan: {
    compatibleIntegrations: [...],
    breakingIntegrations: [...],
    migrationSteps: [...]
  }
}

// Get recent analyses
const analyses = await analyzer.getRecentAnalyses(20);
```

**Feature Detection:**
- AI/ML - GPT, transformers, neural networks
- Authentication - OAuth, JWT, SSO
- Database - PostgreSQL, MongoDB, Redis
- API - REST, GraphQL, gRPC
- Caching, Queue, Monitoring, Logging
- Testing, CI/CD, Serverless, Real-time
- And 20+ more categories

**Integration Suggestions:**
- Where to integrate (file paths)
- How to integrate (instructions)
- Priority (high/medium/low)
- Backward compatibility analysis

**Compatibility Rules:**
- Adding new routes/libraries: ✅ Compatible
- Modifying existing functionality: ⚠️ Feature flag required
- Database changes: ✅ Migrations supported
- Config changes: ✅ Fallbacks required

### 5. mining-rewards.js

**Karma-based incentive system** - Rewards for contributions

```javascript
const MiningRewards = require('./lib/mining-rewards');
const rewards = new MiningRewards(pool, reputationEngine);

// Mine karma for activity
await rewards.mineKarma(userId, 'git_commit');

// Batch mine from timeline
const mined = await rewards.batchMineFromTimeline(userId);

// Get rewards
const userRewards = await rewards.getUserRewards(userId);

// Redeem reward
await rewards.redeemReward(userId, rewardId);

// Leaderboard
const leaderboard = await rewards.getLeaderboard(100);

// Referral system
const code = await rewards.generateReferralCode(userId);
await rewards.trackReferral('ABC123', newUserId);

// Daily login streak
await rewards.recordDailyLogin(userId);
```

**Activity Rewards:**
- Git commit: 10 karma
- Git PR merged: 50 karma
- AI conversation: 5 karma
- Embed site created: 100 karma
- Patent filed: 1000 karma
- Bug reported: 30 karma
- Referral: 250 karma

**Badge Multipliers:**
- Newcomer: 1.0x (no bonus)
- Contributor: 1.2x (20% bonus)
- Veteran: 1.5x (50% bonus)
- Legend: 2.0x (100% bonus)

**Reward Tiers:**
- 100 karma → Bronze Badge
- 1000 karma → Free Month Premium
- 5000 karma → Custom Domain
- 100000 karma → Lifetime Premium

### 6. multi-server-mirror.js

**Primary/replica architecture** - Google Cloud primary + mirrors

```javascript
const MultiServerMirror = require('./lib/multi-server-mirror');
const mirror = new MultiServerMirror({
  isPrimary: true,
  mirrors: [
    { url: 'https://render-mirror.com', name: 'Render' },
    { url: 'https://railway-mirror.com', name: 'Railway' }
  ]
});

// Start services (primary only)
mirror.startPeriodicSync();
mirror.startHealthChecks();

// Record write (primary only)
mirror.recordWrite('insert', 'git_portfolio_stats', data);

// Fetch from primary (mirrors only)
const data = await mirror.fetchFromPrimary('/api/portfolio/timeline');

// Check mirror health
const health = await mirror.checkMirrorHealth();

// Failover
await mirror.promoteToPrimary();
```

**Deployment Strategy:**
- **Primary:** Google Cloud Run or GKE
- **Mirrors:** Render, Railway, Replit
- **Sync:** 5-minute interval, eventual consistency
- **Failover:** Automatic promotion on primary failure

---

## API Endpoints

### Public Routes

**GET /portfolio/:slug** - View public portfolio
```bash
curl https://calos.com/portfolio/john-doe
```

### Protected Routes (Require Auth)

**GET /api/portfolio/overview** - Lifetime stats
```javascript
{
  total_ai_conversations: 1234,
  total_ai_tokens: 5678901,
  total_ai_cost: 123.45,
  total_git_commits: 4567,
  total_git_prs: 234,
  total_embed_events: 89012,
  total_ip_filings: 12
}
```

**GET /api/portfolio/timeline** - Activity feed
```bash
curl https://calos.com/api/portfolio/timeline?limit=50 \
  -H "Cookie: connect.sid=..."
```

**GET /api/portfolio/git-summary** - Git stats
**GET /api/portfolio/ip-summary** - IP stats

**POST /api/portfolio/sync-git** - Trigger git sync
```bash
curl -X POST https://calos.com/api/portfolio/sync-git \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "platforms": {
      "github": "username",
      "gitlab": "username"
    },
    "tokens": {
      "github": "ghp_...",
      "gitlab": "glpat-..."
    }
  }'
```

**GET/POST /api/portfolio/settings** - Portfolio settings

**POST /api/portfolio/register-ip** - Register IP with Soulfra
```bash
curl -X POST https://calos.com/api/portfolio/register-ip \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "ipType": "patent",
    "title": "AI Portfolio System",
    "description": "System for aggregating...",
    "status": "draft",
    "tags": ["ai", "analytics"],
    "category": "software",
    "jurisdiction": "US"
  }'
```

**GET /api/portfolio/ip/:id/certificate** - Soulfra proof certificate

**POST /api/portfolio/analyze-trending** - Analyze OSS trending
```bash
curl -X POST https://calos.com/api/portfolio/analyze-trending \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{ "language": "javascript", "limit": 20 }'
```

**GET /api/portfolio/mining/stats** - Mining statistics
**GET /api/portfolio/rewards** - User's rewards
**POST /api/portfolio/rewards/:id/redeem** - Redeem reward
**GET /api/portfolio/leaderboard** - Karma leaderboard
**GET /api/portfolio/rank** - User's rank
**POST /api/portfolio/daily-login** - Record login
**GET /api/portfolio/referral-code** - Get referral code
**GET /api/portfolio/referrals** - User's referrals
**GET /api/portfolio/bucket-stats** - All bucket stats

---

## User Interface

**Access:** http://localhost:5001/portfolio-dashboard.html

**Tabs:**

1. **Timeline** - Unified activity feed with cards
2. **Git Stats** - Contribution graphs, language breakdowns
3. **IP Registry** - Patents/trademarks with Soulfra verification
4. **Analytics** - Daily aggregated stats
5. **Rewards** - Unlocked rewards and leaderboard rank
6. **Leaderboard** - Top 100 karma earners
7. **Settings** - Public/private, theme, social links

**Features:**

- Overview cards (AI chats, git commits, embed events, IP filings)
- Timeline with event cards (date, title, description, category badges)
- Git contribution graphs (GitHub-style heatmap)
- Language breakdown (pie chart with percentages)
- IP registry with Soulfra verification badges
- Rewards with redeem buttons
- Settings toggles for visibility

---

## Backward Compatibility

**Only compatible with CALOS:**

- Semantic versioning (v1.x.x → v2.0.0 for breaking changes)
- Feature flags for new functionality
- Migration system ensures data compatibility
- Legacy API endpoints maintained for 6 months after deprecation
- No external dependencies on other systems

**Integration Rules:**

- ✅ Adding new features: Always compatible
- ⚠️ Modifying existing: Feature flags required
- ✅ Database migrations: Supported
- ✅ Config changes: Fallbacks required

---

## Gaming Brand Integration

Leverages existing `gaming-adapter.js`:

- NPC dialogue generation
- Map/level generation
- Quest system
- Reward items (linked to karma system)
- Leaderboards (portfolio stats as game stats)

**Example:**

```javascript
// Convert karma to game XP
const xp = await miningRewards.getUserStats(userId).total_karma_earned;

// Generate quest reward
const reward = {
  type: 'karma_boost',
  amount: 50,
  reason: 'Quest: Sync 3 Git Accounts'
};
```

---

## Deployment

### Local Development

```bash
npm install
npm run migrate  # Run migration 070
npm start
open http://localhost:5001/portfolio-dashboard.html
```

### Production

**Google Cloud (Primary):**

```bash
# Cloud Run
gcloud run deploy calos-portfolio \
  --image gcr.io/your-project/calos \
  --platform managed \
  --region us-central1 \
  --set-env-vars IS_PRIMARY_SERVER=true

# Or GKE
kubectl apply -f deployment/gke-primary.yaml
```

**Render (Mirror):**

```yaml
# render.yaml
services:
  - type: web
    name: calos-mirror
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: IS_PRIMARY_SERVER
        value: false
      - key: PRIMARY_SERVER_URL
        value: https://calos-primary.run.app
      - key: MIRROR_API_KEY
        generateValue: true
```

**Railway (Mirror):**

```bash
railway up
railway variables set IS_PRIMARY_SERVER=false
railway variables set PRIMARY_SERVER_URL=https://calos-primary.run.app
```

---

## Cost Analysis

**Current CALOS:** $0-14/month

**With Portfolio Hub + Multi-Server:**

- Google Cloud: $0-25/month (Cloud Run free tier → paid)
- Render: $7/month (or free with sleep)
- Railway: $5 credit/month

**Total:** $12-37/month

**vs. Competitors:**

- Osano: $149/month
- Auth0: $23/month
- GitHub Sponsors: Free (but no analytics)
- Patent filing services: $200-500/filing

**Savings:** $160+/month = $1,920+/year

---

## Examples

### Sync Git Accounts

```javascript
// frontend
const response = await fetch('/api/portfolio/sync-git', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    platforms: {
      github: 'your-username',
      gitlab: 'your-username'
    },
    tokens: {
      github: process.env.GITHUB_TOKEN,
      gitlab: process.env.GITLAB_TOKEN
    }
  })
});

const { results } = await response.json();
console.log('Synced:', results);
```

### Register Patent

```javascript
const patent = await fetch('/api/portfolio/register-ip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ipType: 'patent',
    title: 'AI-Powered Portfolio Aggregation',
    description: 'System for unified analytics across multiple data sources...',
    filingNumber: 'US20250123456',
    filingDate: '2025-01-15',
    status: 'filed',
    relatedRepos: ['https://github.com/user/portfolio-hub'],
    tags: ['ai', 'analytics', 'portfolio'],
    category: 'software',
    jurisdiction: 'US'
  })
});

const registered = await patent.json();
console.log('Soulfra hash:', registered.soulfra_hash);
```

### Analyze OSS Trending

```javascript
const analysis = await fetch('/api/portfolio/analyze-trending', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    language: 'javascript',
    limit: 20
  })
});

const { plan } = await analysis.json();
console.log('Compatible integrations:', plan.compatibleIntegrations.length);
console.log('Breaking integrations:', plan.breakingIntegrations.length);
```

---

## Next Steps

1. **Run Migration:** `npm run migrate`
2. **Sync Git Accounts:** Visit `/portfolio-dashboard.html` → Git Stats → Sync
3. **Register IP:** Portfolio Dashboard → IP Registry → Register New IP
4. **Make Public:** Settings → Toggle "Make portfolio public" → Set slug
5. **Share:** `/portfolio/your-slug`

---

## Support

- **Documentation:** This file
- **API Reference:** See route comments in `routes/portfolio-routes.js`
- **Database Schema:** `migrations/070_portfolio_system.sql`
- **Issues:** https://github.com/calos/agent-router/issues

---

**Built with ❤️ by CALOS**

*Privacy-first • Self-hosted • Backward compatible • Free forever*
