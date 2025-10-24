# Builder Case Study System

> **Your $1 gets you a self-documenting startup journey**

Auto-updating dashboards tracking your journey from $1 investment to company, complete with MRR charts, ecosystem influence scores, and CalRiven AI narration.

---

## What Is This?

A **living case study system** where every builder who invests $1 gets:

✅ **Auto-updating dashboard** - Real-time metrics (MRR, users, commits, deployments)
✅ **Milestone tracking** - First deploy, first revenue, first $1k, first collaboration
✅ **Ecosystem visualization** - Graph showing how your projects connect with others
✅ **CalRiven AI narration** - Weekly AI-written updates of your journey
✅ **Public portfolio** - Shareable link for investors/employers
✅ **Cross-reference database** - Track when other builders use your code/patterns

**Example:** You invest $1 → get a dashboard at `/builder/your-journey` → auto-updates as you build → becomes your living resume/case study.

---

## Architecture

### Database Schema (`migrations/059_builder_case_studies.sql`)

**5 Core Tables:**

1. **`builder_case_studies`** - Main case study record
   - Journey metadata (stage, company name, investment date)
   - Cached metrics (MRR, total revenue, projects, ecosystem influence)
   - Public dashboard settings

2. **`builder_milestones`** - Achievement tracking
   - Milestone types: `first_project`, `first_deployment`, `first_revenue`, `first_1k_revenue`, `ecosystem_influencer`
   - Days since investment for each milestone
   - CalRiven AI celebration messages

3. **`builder_metrics`** - Time-series data
   - Daily/weekly/monthly snapshots
   - Revenue, MRR, ARR, users, commits, API calls
   - Collaboration and ecosystem metrics

4. **`case_study_snapshots`** - Auto-generated summaries
   - CalRiven AI-generated narrative
   - Charts data (revenue over time, user growth)
   - Ecosystem graph visualization
   - Exportable as PDF/Markdown

5. **`project_cross_references`** - Ecosystem tracking
   - When Project A uses code/patterns from Project B
   - Reference types: `code_import`, `api_call`, `pattern_reuse`, `documentation`
   - Attribution tracking

### Core Libraries

**`lib/builder-case-study.js`**
- Manages case studies, dashboards, milestones
- Aggregates metrics from various systems
- Generates snapshots with CalRiven AI

**`lib/milestone-detector.js`**
- Auto-detects achievements
- Hooks into project creation, deployments, revenue events
- Triggers celebration messages

**`lib/metrics-aggregator.js`**
- Pulls metrics from payment, API, collaboration systems
- Runs daily/weekly/monthly to populate time-series data
- Calculates growth rates

**`routes/builder-routes.js`**
- API endpoints for dashboards, milestones, metrics
- Public portfolio pages
- Leaderboard

---

## API Endpoints

### Initialization

```bash
POST /api/builder/initialize
{
  "tenant_id": "uuid",
  "investment_cents": 100  # $1
}

# Response:
{
  "success": true,
  "case_study": {
    "case_study_id": "uuid",
    "public_dashboard_slug": "your-journey",
    "investment_date": "2025-10-19T..."
  },
  "message": "Your builder journey has begun!"
}
```

### Dashboard

```bash
GET /api/builder/dashboard
# Get your current dashboard

GET /api/builder/:slug
# Get public dashboard by slug
# Example: GET /api/builder/john-journey

# Response:
{
  "dashboard": {
    "case_study": {
      "builder_stage": "revenue",
      "monthly_recurring_revenue_cents": 50000,  # $500 MRR
      "total_revenue_cents": 250000,             # $2,500 total
      "ecosystem_influence_score": 45.2,
      "projects_referenced_by_others": 8
    },
    "milestones": [
      {
        "milestone_type": "first_revenue",
        "milestone_title": "First Revenue!",
        "days_since_investment": 12
      },
      {
        "milestone_type": "first_1k_revenue",
        "milestone_title": "Hit $1,000 Revenue!",
        "days_since_investment": 45
      }
    ],
    "metrics": [/* time-series data for charts */],
    "ecosystem": {
      "referenced_by": [/* projects using your code */],
      "references": [/* projects you use */]
    }
  }
}
```

### Milestones

```bash
POST /api/builder/milestones
{
  "milestone_type": "first_deployment",
  "title": "First Deployment!",
  "description": "Deployed to production",
  "project_id": "uuid"
}

GET /api/builder/milestones?limit=50
# Get your milestones
```

### Metrics

```bash
POST /api/builder/metrics
{
  "period_type": "monthly",
  "period_start": "2025-10-01",
  "metrics": {
    "revenue_cents": 50000,
    "mrr_cents": 50000,
    "commits": 120,
    "deployments": 8,
    "total_users": 45
  }
}
```

### Ecosystem

```bash
GET /api/builder/ecosystem
# Get cross-reference graph

POST /api/builder/project-xref
{
  "source_project_id": "your-project-uuid",
  "target_project_id": "their-project-uuid",
  "reference_type": "code_import",
  "description": "Using their authentication library"
}
# Records that you're using someone else's code
# Updates their ecosystem_influence_score
```

### Snapshots

```bash
POST /api/builder/snapshot
# Generate case study snapshot with CalRiven AI narrative

# Response:
{
  "snapshot": {
    "narrative": "45 days since investing $1...",  # CalRiven AI-written
    "metrics_summary": { /* key metrics */ },
    "charts_data": { /* for visualizations */ },
    "ecosystem_graph": { /* network map */ }
  }
}
```

### Leaderboard

```bash
GET /api/builder/leaderboard?limit=50&sort_by=ecosystem
# Sort by: ecosystem, revenue, milestones

# Response:
{
  "leaderboard": [
    {
      "username": "alice",
      "company_name": "Alice's Startup",
      "ecosystem_influence_score": 85.2,
      "monthly_recurring_revenue_cents": 100000,
      "days_since_investment": 120,
      "total_milestones": 12
    }
  ]
}
```

---

## Auto-Detection Examples

### Milestone Auto-Detection

The system **automatically** detects and records milestones:

**First Project:**
```javascript
// When user creates their first project
await milestoneDetector.checkProjectMilestones(userId, projectId);
// → Records "first_project" milestone
```

**First Deployment:**
```javascript
// When deployment happens
await milestoneDetector.checkDeploymentMilestones(userId, projectId);
// → Records "first_deployment" milestone
// → Updates case_study.days_to_first_deploy
```

**Revenue Milestones:**
```javascript
// When revenue is recorded
await milestoneDetector.checkRevenueMilestones(userId, revenueCents);
// → Auto-detects: first_revenue, first_100_revenue, first_1k_revenue, first_10k_revenue
```

**Ecosystem Milestones:**
```javascript
// When someone uses your code
await milestoneDetector.checkEcosystemMilestones(userId);
// → Detects: first_integration, ecosystem_contributor (5+ projects), ecosystem_influencer (10+)
```

### Metrics Aggregation

**Daily/Weekly/Monthly Automation:**

```javascript
// Run from cron/scheduler
const aggregator = new MetricsAggregator({ db, builderCaseStudy });

// Daily at midnight
await aggregator.runDailyAggregation();

// Weekly on Sunday
await aggregator.runWeeklyAggregation();

// Monthly on 1st
await aggregator.runMonthlyAggregation();
```

This pulls data from:
- **Payment system** → revenue, MRR, ARR
- **Voice transcriptions** → deployments (detected from intent)
- **Usage events** → API calls
- **User sessions** → active users
- **Project cross-references** → ecosystem metrics
- **Mailbox** → collaboration messages

---

## Cross-Reference System Integration

### Recording Project Dependencies

```javascript
// Automatic detection when Project A imports from Project B
const xrefMapper = new XRefMapper({ db });

await xrefMapper.recordProjectXRef(
  sourceProjectId,  // Project A
  targetProjectId,  // Project B
  'code_import',
  'Using their auth library'
);

// This triggers:
// 1. Creates project_cross_references entry
// 2. Updates source builder: projects_you_reference++
// 3. Updates target builder: projects_referenced_by_others++
// 4. Updates target builder: ecosystem_influence_score++
```

### Ecosystem Graph

```javascript
// Get ecosystem visualization
const ecosystem = await builderCaseStudy.getEcosystemConnections(userId);

// Returns:
{
  "referenced_by": [
    {
      "source_project_name": "Alice's App",
      "reference_type": "api_call",
      "reference_count": 15
    }
  ],
  "references": [
    {
      "target_project_name": "Bob's Auth Lib",
      "reference_type": "code_import"
    }
  ]
}
```

---

## CalRiven AI Integration

### Auto-Generated Narratives

When you generate a snapshot:

```javascript
const snapshot = await builderCaseStudy.generateSnapshot(caseStudyId);
```

CalRiven AI persona writes a narrative like:

```
45 days since investing $1.

Current Progress:
- Stage: revenue
- Projects: 3
- MRR: $500
- Total Revenue: $2,500
- Ecosystem Influence: 45.2

The builder has hit significant milestones: first deployment (12 days),
first revenue (12 days), and crossed $1k revenue (45 days). 8 other projects
now depend on their code, showing strong ecosystem adoption.

Their pattern of rapid deployment and early monetization is noteworthy.
The 12-day time-to-revenue suggests product-market fit.

Recent work on API integrations has increased ecosystem influence by 15 points.

Keep building! - CalRiven
```

---

## Dashboard Workflow

### 1. User Invests $1

```javascript
// After payment processed
const caseStudy = await builderCaseStudy.initializeCaseStudy(
  userId,
  tenantId,
  100  // $1
);

// Creates:
// - builder_case_studies entry
// - public_dashboard_slug: "username-journey"
// - Records "first_login" milestone
```

### 2. User Builds

As user works:

```javascript
// Auto-detected by system hooks:
await milestoneDetector.checkProjectMilestones(userId, projectId);
await milestoneDetector.checkDeploymentMilestones(userId, projectId);
await milestoneDetector.checkRevenueMilestones(userId, revenueCents);
```

### 3. Daily/Weekly Metrics Update

```javascript
// Cron runs at midnight
await aggregator.aggregateMetrics(userId, 'daily', new Date());

// Populates builder_metrics with:
// - commits, deployments, API calls
// - revenue, MRR, users
// - collaboration activity
```

### 4. Weekly Snapshot

```javascript
// Weekly cron
const snapshot = await builderCaseStudy.generateSnapshot(caseStudyId);

// Creates case_study_snapshots with:
// - CalRiven AI narrative
// - Metrics summary
// - Charts data
// - Ecosystem graph
```

### 5. Public Dashboard

User shares: `https://calriven.com/builder/alice-journey`

Shows:
- Current stage and metrics
- MRR/revenue charts
- Milestone timeline
- Ecosystem graph visualization
- Latest CalRiven AI narrative

---

## Database Functions

### Initialize Case Study

```sql
SELECT initialize_builder_case_study(
  'user-uuid',
  'tenant-uuid',
  100  -- $1 in cents
);
-- Returns case_study_id
-- Creates first_login milestone automatically
```

### Record Milestone

```sql
SELECT record_builder_milestone(
  'user-uuid',
  'first_revenue',
  'First Revenue!',
  'Made $10 from first customer',
  'project-uuid'
);
-- Returns milestone_id
-- Updates case_study.days_to_first_revenue if null
```

### Record Project Cross-Reference

```sql
SELECT record_project_xref(
  'source-project-uuid',
  'target-project-uuid',
  'code_import',
  'Using their API client library'
);
-- Returns xref_id
-- Updates ecosystem metrics for both users
```

---

## Views for Analytics

### Builder Leaderboard

```sql
SELECT * FROM builder_leaderboard
ORDER BY ecosystem_influence_score DESC
LIMIT 50;
```

Returns:
- Username, company name, stage
- Ecosystem influence score
- MRR, total revenue
- Days since investment, days to first revenue
- Total milestones achieved

### Ecosystem Graph

```sql
SELECT * FROM ecosystem_graph
WHERE target_user_id = 'user-uuid';
```

Returns all projects/builders using this user's code.

### Recent Milestones

```sql
SELECT * FROM recent_builder_milestones
LIMIT 100;
```

Community activity feed showing all builders' achievements.

---

## Example User Journey

**Day 1:** Pay $1 → Case study initialized
- Dashboard created: `/builder/alice-journey`
- Milestone: "Joined the Builder Community"

**Day 3:** Create first project
- Auto-detected: "first_project" milestone
- Dashboard shows: 1 project

**Day 12:** Deploy to production + First customer pays $10
- Auto-detected: "first_deployment", "first_revenue" milestones
- `days_to_first_deploy`: 12
- `days_to_first_revenue`: 12
- Dashboard updates: Stage → "revenue"

**Day 25:** Another builder integrates your API
- Auto-detected: "first_integration" milestone
- `ecosystem_influence_score`: +1.0
- Cross-reference created in database

**Day 45:** Hit $1,000 total revenue
- Auto-detected: "first_1k_revenue" milestone
- `days_to_first_1k`: 45
- CalRiven AI generates snapshot with narrative

**Day 90:** 8 projects now use your code
- Auto-detected: "ecosystem_contributor" milestone
- `ecosystem_influence_score`: 45.2
- Leaderboard rank improves

**Your dashboard shows:**
- Stage: Growing
- MRR: $500
- Total Revenue: $2,500
- 3 projects
- 8 ecosystem connections
- Charts showing growth trajectory
- CalRiven AI narrative explaining your journey

---

## Integration Points

### 1. Payment System
```javascript
// After successful $1 payment
await builderCaseStudy.initializeCaseStudy(userId, tenantId, 100);
```

### 2. Project System
```javascript
// After project created
await milestoneDetector.checkProjectMilestones(userId, projectId);
```

### 3. Deployment System
```javascript
// After deployment
await milestoneDetector.checkDeploymentMilestones(userId, projectId);
```

### 4. Revenue Tracking
```javascript
// After revenue recorded
await milestoneDetector.checkRevenueMilestones(userId, revenueCents);
```

### 5. Code Imports
```javascript
// When code imports detected
await xrefMapper.recordProjectXRef(sourceProjectId, targetProjectId, 'code_import');
```

---

## Configuration

### Environment Variables

```bash
# CalRiven AI (for narrative generation)
CALRIVEN_PRIVATE_KEY="..." # Ed25519 for Soulfra signatures
CALRIVEN_PUBLIC_KEY="..."

# LLM providers (for CalRiven AI)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
```

### Cron Jobs

```cron
# Daily metrics aggregation
0 0 * * * node -e "require('./lib/metrics-aggregator').runDailyAggregation()"

# Weekly metrics aggregation
0 0 * * 0 node -e "require('./lib/metrics-aggregator').runWeeklyAggregation()"

# Monthly metrics aggregation
0 0 1 * * node -e "require('./lib/metrics-aggregator').runMonthlyAggregation()"

# Weekly snapshot generation
0 0 * * 0 node -e "require('./scripts/generate-snapshots').run()"
```

---

## File Structure

```
migrations/
  └── 059_builder_case_studies.sql  # Database schema

lib/
  ├── builder-case-study.js          # Core manager
  ├── milestone-detector.js          # Auto-detect achievements
  ├── metrics-aggregator.js          # Pull metrics from systems
  └── xref-mapper.js                 # Cross-reference tracking (enhanced)

routes/
  └── builder-routes.js              # API endpoints

router.js                            # Wired at line 1238
```

---

## Summary

The Builder Case Study System creates **self-documenting startup journeys** for every $1 builder:

✅ **Auto-tracking** - Milestones, metrics, ecosystem connections
✅ **Auto-updating** - Daily/weekly/monthly snapshots
✅ **Auto-narrating** - CalRiven AI writes your story
✅ **Auto-visualizing** - Dashboards, charts, ecosystem graphs
✅ **Auto-sharing** - Public portfolio for investors/employers

**The result:** Your $1 investment becomes a living case study showing exactly how you went from idea → company, complete with metrics, milestones, and AI narration.

Perfect for:
- Builders tracking their journey
- Investors seeing real-time progress
- Employers evaluating candidates
- Community seeing who's making an impact
