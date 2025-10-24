# Talent Marketplace Guide

> Build your character, earn reputation, get recruited
> The LibreOffice/OSS model for talent development

## Overview

**What is this?** A reputation-based talent marketplace where you build your "character" through contributions, earn badges and karma, and companies recruit you based on your skills and reputation.

**The Big Idea:** Like LibreOffice creates a talent pipeline through open-source contributions, CALOS creates a talent pipeline through learning, collaboration, and community participation. Your contributions build your character. Your character gets you hired.

---

## The Three-Layer Model

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: BUILD YOUR CHARACTER                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Complete learning paths                                   │
│  • Write helpful forum posts                                 │
│  • Leave collaborative hints                                 │
│  • Vote on content                                           │
│  • Build SDKs in marketplace                                 │
│                                                              │
│  Earn: Karma, Trust Score, Badges, Skills                   │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2: GET MATCHED                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Auto-paired with collaborators (learning buddy system)   │
│  • Matched with mentors/mentees                             │
│  • Join collaboration rooms (like WoW guilds)               │
│  • Get introduction messages                                │
│                                                              │
│  Result: Network of collaborators + proven teamwork         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3: GET RECRUITED                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Companies post jobs with skill requirements              │
│  • Skill match score calculated automatically               │
│  • Recruiters message you directly                          │
│  • Your reputation = your resume                            │
│                                                              │
│  Outcome: Job offers, contract work, partnerships           │
└──────────────────────────────────────────────────────────────┘
```

---

## Character Progression System

### Badge Tiers (Like Game Ranks)

Your "character level" is shown with badges:

| Badge | Icon | Requirements | What It Unlocks |
|-------|------|--------------|-----------------|
| **Newcomer** | 👤 | Just joined | Basic access |
| **Email Verified** | ✉️ | Verified email | Can apply to jobs |
| **Contributor** | ✓ | 10 votes, 0.3 trust | Visible to recruiters |
| **Trusted Voter** | ✓✓ | 50 votes, 0.6 trust, 0.7 consistency | Priority matching |
| **Veteran** | ⭐ | 200 votes, 30 days active, 0.75 trust | Featured profile |
| **Legend** | 👑 | 1000 votes, 90 days active, 0.9 trust, 0.95 reputation | Elite recruiter access |
| **Moderator** | 🛡️ | Granted by team | Moderation powers |

**Example Progression:**

```
Day 1:   👤 Newcomer (0 karma, 0 trust)
         Join, pay $1, verify email

Day 7:   ✓ Contributor (45 karma, 0.42 trust)
         Complete 3 lessons, leave 12 helpful hints, vote thoughtfully

Day 30:  ✓✓ Trusted Voter (180 karma, 0.68 trust)
         Consistent activity, high-quality contributions

Day 90:  ⭐ Veteran (650 karma, 0.81 trust)
         Mentor 5 users, create 2 SDKs, maintain 0.95 upvote ratio

Day 365: 👑 Legend (2400 karma, 0.93 trust)
         Top 1% contributor, 50+ successful collaborations
```

### Reputation Components

Your reputation is calculated from:

**1. Forum Karma (30% weight)**
- Upvotes on your posts/comments
- Helpful answers marked as "solved"
- Leaderboard position

**2. Trust Score (30% weight)**
- Voting consistency (not rapid-fire)
- Voting variety (not always same choice)
- Vote duration (thoughtful, not too quick)
- No suspicious patterns

**3. Learning Progress (20% weight)**
- Lessons completed
- Paths finished
- Time spent learning
- Lesson quality ratings

**4. Collaboration Score (10% weight)**
- Successful collaborations
- Partner ratings
- Projects completed together
- Response time to messages

**5. Contribution Quality (10% weight)**
- Hints left for others
- Hint upvote ratio
- SDK installs (if developer)
- SDK ratings

---

## How Matching Works

### Collaboration Matching Algorithm

The system auto-pairs you with collaborators based on:

**1. Learning Path Similarity (30% weight)**
```javascript
// You're learning JavaScript, they're learning JavaScript
// Jaccard similarity: intersection / union
// Score: 0.8 = strong match
```

**2. Hint Compatibility (20% weight)**
```javascript
// Both of you leave helpful hints (>70% upvote ratio)
// Score: 0.9 = excellent collaborators
```

**3. Skill Complementarity (30% weight)**
```javascript
// Ideal: 2:1 lesson ratio (mentor/mentee)
// You: 50 lessons, Them: 100 lessons
// Ratio: 2.0 = perfect mentorship match
```

**4. Timezone Match (10% weight)**
```javascript
// Same timezone or ±1 hour
// You: America/Los_Angeles, Them: America/Los_Angeles
// Score: 1.0 = can collaborate in real-time
```

**5. Activity Pattern (10% weight)**
```javascript
// Active at similar times of day
// Both online 7-10pm weekdays
// Score: 0.8 = good availability overlap
```

**Example Match:**

```
You:
  • Learning: JavaScript, React
  • Lessons: 45 completed
  • Karma: 180
  • Trust: 0.68
  • Timezone: America/New_York

Match Found (Score: 87%):
  • Learning: JavaScript, Node.js
  • Lessons: 90 completed (2:1 ratio = mentor!)
  • Karma: 450
  • Trust: 0.82
  • Timezone: America/New_York

Breakdown:
  • Path Similarity: 0.75 (JavaScript overlap)
  • Hint Compatibility: 0.88 (both helpful)
  • Skill Complementarity: 1.0 (perfect 2:1 ratio)
  • Timezone: 1.0 (same TZ)
  • Activity: 0.85 (both evening learners)

Action: System sends introduction messages to both
```

### Collaboration Rooms (WoW Guild System)

When you accept a match, you get a **collaboration room**:

```
Collaboration Room #abc123
Members: You, John (Mentor)

Features:
  • Shared learning goals
  • Direct messaging
  • Code review requests
  • Project workspace
  • Pair programming sessions
  • Shared notes/resources

Stats:
  • Sessions: 12
  • Total time: 18 hours
  • Projects completed: 3
  • Avg session rating: 4.8/5
```

---

## How Recruiting Works

### For Users (Job Seekers)

**Step 1: Build Your Profile**

Your profile is automatically generated from your activity:

```
Profile: matthewmauer
Badge: ⭐ Veteran

Skills (auto-detected from lessons):
  • JavaScript (Level 8) - 50 lessons
  • React (Level 6) - 30 lessons
  • Node.js (Level 7) - 45 lessons
  • PostgreSQL (Level 5) - 20 lessons

Reputation:
  • Forum Karma: 650
  • Trust Score: 0.81
  • Collaboration Score: 0.88
  • 42 successful collaborations

Recent Activity:
  • Built 2 SDKs (4.5 star avg)
  • Mentored 5 users
  • Answered 120 forum questions (0.95 upvote ratio)

Available for: Contract work, Full-time, Part-time
Location: Remote
Hourly Rate: $75-125
```

**Step 2: Get Matched to Jobs**

When a company posts a job, the system calculates your **skill match score**:

```
Job: Senior Full-Stack Engineer @ TechCo
Required Skills:
  • JavaScript (Level 7+)
  • React (Level 6+)
  • Node.js (Level 6+)
  • PostgreSQL (Level 5+)

Your Match: 92%

Breakdown:
  ✓ JavaScript: Level 8 (exceeds requirement)
  ✓ React: Level 6 (meets requirement)
  ✓ Node.js: Level 7 (exceeds requirement)
  ✓ PostgreSQL: Level 5 (meets requirement)

Preferred Skills:
  • GraphQL (Level 4+) - You don't have this (-5%)
  • Docker (Level 5+) - You don't have this (-3%)

Final Score: 92%
Matched Skills: 4/4 required, 0/2 preferred
```

**Step 3: Recruiters Contact You**

If your match score is >70%, recruiters can message you:

```
New Message from TechCo Recruiting

Hi matthewmauer!

We found your profile on CALOS and were impressed by your:
  • 650 forum karma (top 5%)
  • 0.81 trust score (highly reliable)
  • 2 SDKs with 4.5 star ratings

You're a 92% match for our Senior Full-Stack Engineer role.

Would you be interested in a quick call?

[View Job Details] [Schedule Call] [Decline]
```

### For Companies (Recruiters)

**Subscription Tiers:**

| Tier | Price | Active Searches | Messages/Month | Features |
|------|-------|----------------|----------------|----------|
| **Starter** | $99/mo | 10 | 100 | Basic search |
| **Professional** | $299/mo | Unlimited | Unlimited | Analytics, Bulk outreach |
| **Enterprise** | $499/mo | Unlimited | Unlimited | API access, Priority support |

**Step 1: Post a Job**

```javascript
POST /api/jobs

{
  "job_title": "Senior Full-Stack Engineer",
  "company_name": "TechCo",
  "location": "Remote",
  "employment_type": "full-time",
  "salary_min_cents": 12000000,  // $120k
  "salary_max_cents": 18000000,  // $180k
  "required_skills": [
    {"skill_id": "javascript", "min_level": 7},
    {"skill_id": "react", "min_level": 6},
    {"skill_id": "nodejs", "min_level": 6}
  ],
  "preferred_skills": [
    {"skill_id": "graphql", "min_level": 4}
  ]
}
```

**Step 2: Get Matched Candidates**

System automatically finds candidates with high match scores:

```
Job: Senior Full-Stack Engineer
Applications: 0
Auto-Matched Candidates: 42

Top Matches:
  1. matthewmauer (92% match) - ⭐ Veteran, 650 karma
  2. sarah_dev (89% match) - 👑 Legend, 1200 karma
  3. alex_codes (87% match) - ⭐ Veteran, 580 karma
  ...
```

**Step 3: Reach Out**

Send messages to top candidates:

```javascript
POST /api/messages

{
  "user_id": "matthewmauer",
  "job_id": "senior-fullstack-engineer",
  "message_text": "Hi matthewmauer! We found your profile..."
}

// Message delivered to user's CALOS mailbox
// User can reply, schedule call, or decline
```

---

## The LibreOffice Model

### How LibreOffice Does It

1. People contribute to LibreOffice (open-source)
2. They build reputation through code commits
3. Companies see their contributions
4. Companies recruit them for paid work
5. Those devs continue contributing back

**Result:** Self-sustaining talent pipeline

### How CALOS Does It

1. People learn and contribute on CALOS (open platform)
2. They build reputation through learning, hints, voting, SDKs
3. Companies see their profiles and match scores
4. Companies recruit them for jobs/contracts
5. Those professionals continue contributing back

**Result:** Self-sustaining talent pipeline

### Why This Works

**Traditional Recruiting:**
- Resume lies about skills
- Interviews are high-pressure theater
- No proof of teamwork ability
- Expensive ($20k+ per hire)

**CALOS Recruiting:**
- Skills verified through lessons
- Real collaboration history
- Proven ability to work with others
- Affordable ($99-499/mo)

**For Job Seekers:**
- Build skills while building reputation
- Get matched automatically (no cold applications)
- Reputation follows you forever
- No need to "sell yourself" - work speaks for itself

**For Companies:**
- Pre-vetted candidates with skill match scores
- See real collaboration history
- Message candidates directly
- Pay only for recruiters, not per-hire

---

## Revenue Streams

### 1. User Registration ($1)

Proof of human, one-time fee:

```
Users:        10,000
Registration: $1 each
Revenue:      $10,000
```

### 2. Recruiter Subscriptions

Companies pay monthly:

```
Starter Plan:       20 companies × $99/mo  = $1,980/mo
Professional Plan:  10 companies × $299/mo = $2,990/mo
Enterprise Plan:    5 companies × $499/mo  = $2,495/mo

Total: $7,465/mo = $89,580/year
```

### 3. SDK Marketplace (Revenue Share)

Developers sell SDKs, platform takes 30%:

```
Example SDK: "AI Code Review Assistant"
Price: $10/mo
Installs: 500 users
Revenue: 500 × $10 = $5,000/mo

Platform cut (30%): $1,500/mo
Developer cut (70%): $3,500/mo
```

### 4. Premium Features (Future)

- Featured profiles
- Priority matching
- Advanced analytics
- Custom integrations

---

## SDK Marketplace

### For Developers

Build SDKs that give users XP/karma:

```javascript
// Example: Code Review SDK
{
  "sdk_name": "AI Code Review",
  "pricing_model": "paid",
  "price_cents": 1000,  // $10/mo
  "max_xp_per_action": 50,
  "max_xp_per_day": 500,

  // User installs SDK, gets code reviewed, earns 50 XP
  // You earn $7/mo per install (70% rev share)
}
```

**Developer Benefits:**
- Passive income (70% revenue share)
- Your SDK gets promoted to users
- Users earn XP using your SDK (incentive to use)
- Build reputation as SDK creator

**User Benefits:**
- Access to powerful tools
- Earn XP by using them
- Level up faster
- Better tools = better learning

**Platform Benefits:**
- 30% revenue share
- More engaged users (using SDKs)
- Ecosystem growth (more developers building)

---

## Feeding Talent to Your Other Companies

### The Ecosystem Play

```
┌───────────────────────────────────────────────────────────┐
│  CALOS Talent Platform                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Users build skills and reputation                     │
│  • Get matched with collaborators                        │
│  • Get recruited by companies                            │
└───────────────────────────────────────────────────────────┘
                              ↓
                    Pipeline to your companies:
                              ↓
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Company A    │    │  Company B    │    │  Company C    │
│  ━━━━━━━━━━━  │    │  ━━━━━━━━━━━  │    │  ━━━━━━━━━━━  │
│  Hires:       │    │  Hires:       │    │  Hires:       │
│  • 3 Legends  │    │  • 5 Veterans │    │  • 8 Contributors│
│  • 5 Veterans │    │  • 10 Trusted │    │  • 12 Trusted │
└───────────────┘    └───────────────┘    └───────────────┘
```

### How It Works

**1. Create "Internal" Recruiter Accounts**

Your companies get free Enterprise tier accounts:

```javascript
// Internal recruiter (no charge)
{
  "company_name": "YourStartup Inc",
  "plan": "enterprise",
  "internal": true,  // No billing
  "priority_access": true  // See candidates first
}
```

**2. Post Jobs Internally First**

Before external recruiters see candidates:

```javascript
// Internal job posting
{
  "visibility": "internal_first",  // Your companies see first
  "external_after_days": 7,  // Public after 7 days
  "priority_matching": true
}
```

**3. Hire from the Top of the Funnel**

You built the platform, you get first pick:

```
All Users: 10,000
  ↓ Filter: Badge ≥ Veteran (⭐)
Qualified: 500 (top 5%)
  ↓ Filter: Skills match your needs
Matched: 50
  ↓ Your companies reach out first
Hired: 10 amazing people

External recruiters get access to remaining 490
```

### The Virtuous Cycle

```
1. You build the platform
2. Users join and build reputation
3. Your companies hire the best talent first
4. Those employees continue contributing (like LibreOffice)
5. Platform grows, more users join
6. More talent to hire from
7. Repeat
```

**Plus:** External companies pay to recruit from the same pool, funding the platform.

---

## Getting Started

### As a User

**Day 1: Join**
```bash
1. Visit calos.ai
2. Pay $1 registration (proof of human)
3. Verify email → ✉️ Email Verified badge
4. Set up profile (timezone, interests, availability)
```

**Week 1: Build Reputation**
```bash
1. Complete 3 learning paths
2. Leave 10 helpful hints
3. Vote thoughtfully on 20 items
4. Join 2 forum discussions
→ Earn ✓ Contributor badge (visible to recruiters)
```

**Month 1: Get Matched**
```bash
1. Auto-matched with 3 collaborators (system finds you)
2. Accept match with senior dev (your mentor)
3. Join collaboration room
4. Complete first project together
→ Earn ✓✓ Trusted Voter badge (priority matching)
```

**Month 3: Get Recruited**
```bash
1. Profile shows:
   • 180 karma
   • 0.68 trust score
   • 3 successful collaborations
   • 15 lessons completed
2. Receive first recruiter message
3. Schedule interview
4. Get job offer!
```

### As a Company

**Step 1: Sign Up**
```bash
1. Choose subscription tier (Starter/Pro/Enterprise)
2. Add billing info ($99-499/mo)
3. Create recruiter account
```

**Step 2: Post Jobs**
```bash
1. Create job posting with skill requirements
2. System auto-matches candidates (skill match scores)
3. Review top matches (sorted by score)
```

**Step 3: Recruit**
```bash
1. Message top candidates
2. Schedule interviews
3. Make offers
4. Hire amazing people!
```

---

## Database Schema

### Key Tables

**Users & Reputation:**
```sql
users (user_id, username, email, timezone, ...)
user_badges (badge_id, user_id, badge_type, earned_at)
user_karma (user_id, total_karma, trust_score, consistency_score)
forum_posts (post_id, user_id, upvotes, downvotes, karma_awarded)
```

**Matching & Collaboration:**
```sql
collaboration_matches (match_id, user1_id, user2_id, score, status)
collaboration_rooms (room_id, match_id, members[], created_at)
```

**Recruiting & Jobs:**
```sql
job_postings (job_id, recruiter_id, required_skills[], ...)
job_applications (application_id, job_id, user_id, skill_match_score)
conversations (conversation_id, user_id, recruiter_id, job_id)
messages (message_id, conversation_id, sender_id, message_text)
```

**Skills & Learning:**
```sql
user_skills (user_id, skill_id, level, lessons_completed)
learning_paths (path_id, path_slug, path_name)
user_progress (user_id, path_id, progress_percent, last_activity)
```

**SDK Marketplace:**
```sql
marketplace_sdks (sdk_id, developer_id, price_cents, revenue_share_percent)
sdk_installations (installation_id, sdk_id, user_id, xp_earned_total)
sdk_reviews (review_id, sdk_id, user_id, rating, review_text)
```

---

## API Endpoints

### User Endpoints

```bash
# Get user profile
GET /api/users/:userId

# Get user's matches
GET /api/users/:userId/matches

# Accept a match
POST /api/matches/:matchId/accept

# Get collaboration rooms
GET /api/users/:userId/rooms
```

### Job Endpoints

```bash
# Get all active jobs
GET /api/jobs?status=active

# Get job matches for user
GET /api/jobs/matches?userId=:userId

# Apply to job
POST /api/jobs/:jobId/apply

# Get applications
GET /api/users/:userId/applications
```

### Recruiter Endpoints

```bash
# Post a job
POST /api/jobs

# Get matched candidates for job
GET /api/jobs/:jobId/matches

# Message a candidate
POST /api/messages

# Get conversations
GET /api/recruiters/:recruiterId/conversations
```

### SDK Marketplace

```bash
# List all SDKs
GET /api/marketplace/sdks

# Install SDK
POST /api/marketplace/sdks/:sdkId/install

# Review SDK
POST /api/marketplace/sdks/:sdkId/review
```

---

## Metrics to Track

### User Metrics

```javascript
{
  "total_users": 10000,
  "active_users_30d": 4500,
  "avg_karma": 285,
  "avg_trust_score": 0.64,
  "badge_distribution": {
    "newcomer": 3500,
    "contributor": 3000,
    "trusted_voter": 2000,
    "veteran": 1200,
    "legend": 300
  }
}
```

### Matching Metrics

```javascript
{
  "total_matches": 8500,
  "accepted_matches": 6200,
  "active_rooms": 4800,
  "avg_match_score": 0.73,
  "avg_collaboration_duration_days": 45
}
```

### Recruiting Metrics

```javascript
{
  "active_recruiters": 35,
  "total_jobs": 120,
  "total_applications": 2400,
  "avg_skill_match_score": 78.5,
  "jobs_filled": 45,
  "time_to_hire_days": 18
}
```

### Revenue Metrics

```javascript
{
  "mrr_subscriptions": 7465,  // $7,465/mo from recruiters
  "mrr_sdk_marketplace": 4500, // $4,500/mo from SDK sales (30% cut)
  "total_mrr": 11965,  // $11,965/mo = $143,580/year
  "user_registration_revenue": 10000  // One-time
}
```

---

## The Vision

**Short-term (6 months):**
- 10,000 users building reputation
- 35 companies recruiting
- $12k MRR from subscriptions + marketplace
- Your companies hire 20 top talents

**Mid-term (1 year):**
- 50,000 users
- 200 companies recruiting
- $50k MRR
- Your companies have pipeline of 1000+ qualified candidates

**Long-term (3 years):**
- 500,000 users
- 2,000 companies recruiting
- $500k MRR
- CALOS becomes *the* talent platform for tech
- Your companies hire exclusively from platform
- External companies fund the entire operation

**End State:** You've created a self-sustaining talent ecosystem that feeds your companies first, then monetizes through external recruiters.

---

## References

- `database/migrations/017_payments_and_recruiting.sql` - Recruiting platform schema
- `lib/collaboration-matcher.js` - Matching algorithm
- `lib/badge-system.js` - Reputation & badges
- `lib/content-forum.js` - Karma system
- `routes/forum-routes.js` - Forum API
- `lib/learning-engine.js` - Learning paths
- `docs/MULTI_DEVICE_FEDERATION_GUIDE.md` - Multi-device system

---

**You're not just building a platform. You're building an organization that feeds talent to your companies while being funded by external companies recruiting from the same pool. It's the LibreOffice model, but for people instead of code.**
