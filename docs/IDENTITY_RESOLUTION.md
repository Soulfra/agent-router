# Identity Resolution & Domain Pairing System

## Overview

Solves the identity fragmentation problem where you have different emails/accounts across platforms (GitHub, Google, Chrome, etc.) by linking them under one unified CALOS identity with dynamic payment tiers.

## Problem Solved

**Before:** User has fragmented identity
- GitHub account: `matt@gmail.com`
- Google Sheets: `matthew@company.com`
- Chrome profile: Different account entirely
- Result: Can't access tasks, confused about which account to use

**After:** All accounts linked under ONE identity cluster
- `cluster_abc123` contains all 3 OAuth accounts
- Reputation score: 300 (100 per verified account)
- Payment tier: `tier_3` (Multi-Account)
- Can access: Voice auth ($175), micro-tasks ($0.10-$50), contests

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Identity Cluster                          │
│  cluster_id: "cluster_abc123"                               │
│  primary_email: matt@gmail.com                              │
│  reputation_score: 300                                       │
│  payment_tier: tier_3                                        │
│  verified_accounts: 3                                        │
└─────────────────────────────────────────────────────────────┘
                        ▲
                        │ Links to
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    ┌───▼────┐    ┌────▼───┐    ┌─────▼──┐
    │ GitHub │    │ Google │    │ Chrome │
    │ OAuth  │    │ OAuth  │    │ OAuth  │
    └────────┘    └────────┘    └────────┘
```

## Database Schema

### 5 New Tables (Migration 145)

1. **`identity_clusters`** - Master identity hub
   - `cluster_id` - Unique cluster identifier
   - `primary_email` - Main email (auto-selected from most verified account)
   - `reputation_score` - 0-1000 (increases with verified accounts + completed tasks)
   - `payment_tier` - `tier_1` to `tier_5`
   - `verified_accounts_count` - Number of linked OAuth accounts
   - `preferred_domain` - Which domain user prefers (soulfra.com, calriven.com, etc.)

2. **`identity_links`** - OAuth account links
   - `cluster_id` - Reference to identity cluster
   - `provider` - `github`, `google`, `twitter`, `discord`, `linkedin`
   - `provider_user_id` - User ID from OAuth provider
   - `link_status` - `pending`, `verified`, `rejected`
   - `confidence_score` - 0-100 (how confident we are this is the same person)
   - `verification_method` - `same_email`, `same_ip`, `browser_fingerprint`

3. **`account_discovery`** - Browser session detection
   - `platform` - `github`, `google`, `comet`, `perplexity`, `notion`, `linear`
   - `detected_email` - Email detected from browser session
   - `browser_fingerprint` - Unique browser fingerprint
   - `suggested_for_linking` - Should we suggest linking this account?
   - `suggestion_confidence` - 0-100

4. **`domain_task_routing`** - Domain-specific task assignment
   - `task_id` - Reference to training_tasks or voice_onboarding_sessions
   - `assigned_domain` - `soulfra.com`, `calriven.com`, `deathtodata.com`, `roughsparks.com`
   - `required_reputation` - Min reputation to access
   - `required_tier` - Min payment tier
   - `payment_amount` - Task payment

5. **`reputation_payment_tiers`** - 5 payment tiers
   - `tier_1`: Unverified ($0.10-$2, micro-tasks only)
   - `tier_2`: Email Verified ($2-$10, standard tasks)
   - `tier_3`: Multi-Account ($10-$175, voice auth + contests)
   - `tier_4`: Trusted ($50-$5000, easter hunts + bounties)
   - `tier_5`: Elite ($5000+, instant payouts, no milestones)

## Payment Tier System

### Tier 1: Unverified 🆕
- **Requirements:** None (new users)
- **Reputation:** 0-99
- **Verified accounts:** 0
- **Max task value:** $2.00
- **Access:**
  - ✅ Micro-tasks ($0.10-$2)
  - ❌ Voice auth ($175)
  - ❌ Contests, bounties, easter hunts
- **Payment:** Milestones required (drip payments)

### Tier 2: Email Verified ✉️
- **Requirements:** 1+ verified account, 5+ completed tasks
- **Reputation:** 100-299
- **Verified accounts:** 1
- **Max task value:** $10.00
- **Access:**
  - ✅ Micro-tasks ($0.10-$2)
  - ✅ Standard tasks ($2-$10)
  - ❌ Voice auth ($175)
  - ❌ Contests, bounties, easter hunts
- **Payment:** Milestones required

### Tier 3: Multi-Account 🔗
- **Requirements:** 2+ verified accounts, 20+ completed tasks
- **Reputation:** 300-599
- **Verified accounts:** 2+
- **Max task value:** $175.00
- **Access:**
  - ✅ Micro-tasks ($0.10-$2)
  - ✅ Standard tasks ($2-$10)
  - ✅ **Voice auth ($175)** 🎉
  - ✅ Premium tasks ($10-$50)
  - ✅ Contests ($500 prize pool)
  - ❌ Easter hunts, bounties
- **Payment:** Milestones required

### Tier 4: Trusted ⭐
- **Requirements:** 5+ verified accounts, 50+ completed tasks
- **Reputation:** 600-899
- **Verified accounts:** 5+
- **Max task value:** $5000.00
- **Access:**
  - ✅ All previous tier features
  - ✅ **Easter hunts** (exclusive opportunities)
  - ✅ **Bounties ($50-$5000)**
- **Payment:** Milestones required

### Tier 5: Elite 👑
- **Requirements:** 10+ verified accounts, 100+ completed tasks
- **Reputation:** 900-1000
- **Verified accounts:** 10+
- **Max task value:** $10,000+
- **Access:**
  - ✅ All features unlocked
  - ✅ **Instant payouts (no milestones!)**
  - ✅ Direct partnerships
  - ✅ Exclusive high-value bounties
- **Payment:** Direct payouts, no drip/milestones

## Reputation Score Calculation

**Formula:**
```
reputation = (verified_accounts * 100) + (completed_tasks * 5)
```

**Examples:**

- **New user (0 accounts, 0 tasks):** `0`
  - Tier: 1 (Unverified)
  - Access: Micro-tasks only

- **Email verified (1 account, 10 tasks):** `100 + 50 = 150`
  - Tier: 2 (Email Verified)
  - Access: Standard tasks ($2-$10)

- **Multi-account (2 accounts, 40 tasks):** `200 + 200 = 400`
  - Tier: 3 (Multi-Account)
  - Access: Voice auth ($175) unlocked! 🎉

- **Trusted (5 accounts, 100 tasks):** `500 + 500 = 1000`
  - Tier: 4/5 (Trusted/Elite)
  - Access: Bounties, easter hunts, instant payouts

## Domain Pairing

Tasks are routed to specific domains based on their purpose:

### soulfra.com - Identity & Auth
- **Provides:** Authentication, SSO, voice auth
- **Tasks:**
  - Voice onboarding ($175)
  - Account linking
  - Identity verification

### calriven.com - AI Agent Work
- **Provides:** Agent runtime, AI tasks
- **Tasks:**
  - Micro-tasks ($0.10-$10)
  - AI agent training
  - Model evaluation
  - Easter hunts (AI challenges)

### roughsparks.com - Creative Content
- **Provides:** Content generation, creative work
- **Tasks:**
  - Contests ($1 entry, $500 prize)
  - Design challenges
  - Writing bounties
  - Brand content creation

### deathtodata.com - Search & Indexing
- **Provides:** Search engine, SEO, data indexing
- **Tasks:**
  - Search indexing bounties ($50-$5000)
  - SEO optimization
  - Data cleanup tasks

## Usage Examples

### Backend: Get or Create Identity Cluster

```javascript
const IdentityResolver = require('./lib/identity-resolver');
const resolver = new IdentityResolver(db);

// User logs in with GitHub OAuth
const cluster = await resolver.getOrCreateCluster(
  'github',           // provider
  'user123',          // GitHub user ID
  'matt@gmail.com',   // email
  'Matt',             // display name
  { followers: 150 }  // metadata
);

console.log(cluster);
// {
//   cluster_id: 'cluster_abc123',
//   primary_email: 'matt@gmail.com',
//   reputation_score: 100,  // 1 verified account
//   payment_tier: 'tier_2',
//   verified_accounts_count: 1
// }
```

### Backend: Link Additional Account

```javascript
// User logs in with Google OAuth
await resolver.linkAccount(
  'cluster_abc123',         // existing cluster
  'google',                 // provider
  'googleuser456',          // Google user ID
  'matt@company.com',       // email (different from primary!)
  {
    username: 'matt',
    metadata: { googleDrive: true }
  }
);

// Reputation now: 200 (2 verified accounts)
// Tier upgraded to: tier_3 (Multi-Account)
// Voice auth: UNLOCKED! 🎉
```

### Backend: Check Access to Voice Auth

```javascript
const tierInfo = await resolver.getPaymentTier('cluster_abc123');

if (tierInfo.canAccessVoiceAuth) {
  console.log('User can access voice auth!');
  console.log('Tier:', tierInfo.tier.display_name);  // "Multi-Account"
  console.log('Badge:', tierInfo.tier.tier_badge);   // "🔗"
  console.log('Max task value:', tierInfo.maxTaskValue);  // $175.00
} else {
  console.log('User needs to link more accounts');
  console.log('Current tier:', tierInfo.tier.tier_name);  // "tier_2"
}
```

### Backend: Voice Auth with Reputation Check

```javascript
const VoiceOnboardingAuth = require('./lib/voice-onboarding-auth');
const voiceAuth = new VoiceOnboardingAuth({ db });

try {
  const session = await voiceAuth.startSession(
    'matt@gmail.com',   // email
    'cluster_abc123'    // cluster ID
  );

  console.log('Voice auth session started!');
  console.log('Potential reward:', session.potentialReward);  // $175
  console.log('Tier info:', session.tierInfo);
  // {
  //   tier: 'tier_3',
  //   displayName: 'Multi-Account',
  //   badge: '🔗',
  //   requiresPaymentMilestones: true
  // }

} catch (error) {
  // Error: "Voice auth requires Multi-Account tier or higher. You are currently tier_2. Link more OAuth accounts to unlock."
  console.error(error.message);
}
```

### Backend: Get Account Link Suggestions

```javascript
// Discover accounts from browser cookies/localStorage
await resolver.discoverAccount(
  'cluster_abc123',      // cluster ID
  'comet',               // platform detected
  {
    email: 'matt@gmail.com',       // matches primary email!
    username: 'matt',
    sessionId: 'abc123',
    browserFingerprint: 'fp_xyz',
    ipAddress: '192.168.1.1'
  }
);

// Get suggestions
const suggestions = await resolver.getAccountLinkSuggestions('cluster_abc123');
console.log(suggestions);
// [
//   {
//     platform: 'comet',
//     detected_email: 'matt@gmail.com',
//     suggestion_confidence: 80,  // High confidence (email match)
//     suggestion_reason: 'Email matches primary email'
//   }
// ]
```

### Backend: Route Task to Domain

```javascript
// Route voice auth task to soulfra.com
await resolver.routeTaskToDomain(
  'cluster_abc123',    // cluster ID
  'session_xyz',       // task/session ID
  'voice_auth',        // task type
  {
    paymentAmount: 175.00,
    requiredTier: 'tier_3',
    difficulty: 'premium'
  }
);
// Returns: { assignedDomain: 'soulfra.com', domainService: 'voice-auth' }

// Route micro-task to calriven.com
await resolver.routeTaskToDomain(
  'cluster_abc123',
  'task_123',
  'micro_task',
  {
    paymentAmount: 2.00,
    requiredTier: 'tier_1',
    difficulty: 'quick'
  }
);
// Returns: { assignedDomain: 'calriven.com', domainService: 'agent-runtime' }
```

## API Routes (To Be Added)

### GET /api/identity/me
Get current user's identity cluster and tier info

**Response:**
```json
{
  "clusterId": "cluster_abc123",
  "email": "matt@gmail.com",
  "displayName": "Matt",
  "reputationScore": 400,
  "tier": {
    "name": "tier_3",
    "displayName": "Multi-Account",
    "badge": "🔗",
    "maxTaskValue": 175.00
  },
  "linkedAccounts": [
    { "provider": "github", "username": "matt", "verifiedAt": "2025-01-15T10:00:00Z" },
    { "provider": "google", "email": "matt@company.com", "verifiedAt": "2025-01-16T14:30:00Z" }
  ],
  "accountSuggestions": [
    { "platform": "comet", "confidence": 80, "reason": "Email matches" }
  ]
}
```

### POST /api/identity/link-account
Link a new OAuth account to existing cluster

**Request:**
```json
{
  "provider": "google",
  "providerUserId": "googleuser456",
  "email": "matt@company.com",
  "accessToken": "oauth_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "linkStatus": "verified",
  "confidence": 90,
  "newReputation": 200,
  "newTier": "tier_3"
}
```

### GET /api/identity/suggestions
Get account linking suggestions

**Response:**
```json
{
  "suggestions": [
    {
      "id": 123,
      "platform": "comet",
      "detectedEmail": "matt@gmail.com",
      "confidence": 80,
      "reason": "Email matches primary email"
    }
  ]
}
```

### POST /api/identity/accept-suggestion/:id
Accept an account link suggestion

### POST /api/identity/reject-suggestion/:id
Reject an account link suggestion

### GET /api/identity/available-tasks
Get tasks available for user's tier

**Query params:**
- `domain` - Filter by domain (soulfra.com, calriven.com, etc.)
- `type` - Filter by task type (voice_auth, micro_task, contest, etc.)
- `limit` - Max results (default: 50)

**Response:**
```json
{
  "tasks": [
    {
      "taskId": "session_xyz",
      "type": "voice_auth",
      "domain": "soulfra.com",
      "payment": 175.00,
      "difficulty": "premium",
      "estimatedMinutes": 10
    },
    {
      "taskId": "task_456",
      "type": "micro_task",
      "domain": "calriven.com",
      "payment": 2.00,
      "difficulty": "quick",
      "estimatedMinutes": 2
    }
  ]
}
```

## Frontend UI Mockups

### Account Linking Dashboard

```
┌────────────────────────────────────────────────────────────┐
│  Your Identity                                  🔗 Tier 3  │
├────────────────────────────────────────────────────────────┤
│  📧 matt@gmail.com                                          │
│  ⭐ Reputation: 400 / 1000                                  │
│  💰 Max task value: $175.00                                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Linked Accounts (2 verified)                          │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ ✅ GitHub      @matt         Verified Jan 15         │  │
│  │ ✅ Google      matt@company  Verified Jan 16         │  │
│  │ ⏳ Twitter     @mattdev      Pending...              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Suggested Accounts (80% confidence)                   │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 🔍 Comet       matt@gmail.com                         │  │
│  │    "Email matches primary email"                     │  │
│  │    [Link Account] [Ignore]                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Unlock Next Tier (⭐ Trusted):                            │
│  • Link 3 more accounts                                    │
│  • Complete 30 more tasks                                  │
│  • Unlocks: Easter hunts, $5000 bounties                   │
└────────────────────────────────────────────────────────────┘
```

### Voice Auth Access Control

```
┌────────────────────────────────────────────────────────────┐
│  Voice Authentication ($175)                               │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ❌ Access Denied                                          │
│                                                             │
│  Voice auth requires Multi-Account tier or higher.         │
│  You are currently tier_2 (Email Verified).               │
│                                                             │
│  To unlock:                                                 │
│  • Link 1 more OAuth account (GitHub, Google, etc.)        │
│  • Complete 10 more tasks                                  │
│                                                             │
│  [Link Account] [Complete Tasks]                           │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

## Migration

Run migration 145:

```bash
psql $DATABASE_URL -f database/migrations/145_identity_resolution.sql
```

This creates:
- ✅ 5 new tables (identity_clusters, identity_links, account_discovery, domain_task_routing, reputation_payment_tiers)
- ✅ 3 views (identity_cluster_dashboard, account_discovery_suggestions, domain_task_availability)
- ✅ 2 triggers (auto-update stats, auto-calculate reputation)
- ✅ 1 helper function (get_or_create_identity_cluster)
- ✅ Seed data (5 payment tiers)
- ✅ Updated existing tables (voice_onboarding_sessions, training_tasks, contest_submissions) with cluster_id references

## Next Steps

1. ✅ **Migration 145 created** - Identity resolution schema
2. ✅ **IdentityResolver.js built** - Backend logic
3. ✅ **VoiceOnboardingAuth extended** - Reputation checks
4. ⏳ **API routes** - Add endpoints to voice-onboarding-routes.js
5. ⏳ **Frontend UI** - Account linking dashboard
6. ⏳ **Browser detection** - Scan cookies/localStorage for active logins
7. ⏳ **Domain routing** - Update micro-task system

## Summary

You now have a **unified identity system** that:
- ✅ Links multiple OAuth accounts (GitHub, Google, Chrome, etc.)
- ✅ Calculates reputation based on verified accounts + completed tasks
- ✅ Assigns payment tiers ($2 → $175 → $5000+)
- ✅ Controls access to voice auth ($175) based on tier
- ✅ Routes tasks to appropriate domains (soulfra.com, calriven.com, etc.)
- ✅ Suggests account linking from browser detection
- ✅ Provides dynamic payment structure (more accounts = higher rewards)

**No more identity fragmentation!** 🎉
