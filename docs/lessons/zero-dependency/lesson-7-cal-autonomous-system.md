# Cal Autonomous System - Self-Documenting AI

**Track:** zero-dependency
**Lesson:** 7
**XP Reward:** 150
**Time:** 30 minutes
**Prerequisites:** Lesson 1-6 (Zero-Dependency basics)

## Learning Objectives

- ✅ Understand how Cal learns autonomously from the codebase
- ✅ Learn how auto-documentation prevents rebuilding features
- ✅ Integrate CalSystemIntegrator in your projects
- ✅ Set up Cal daemon for continuous learning

## Content

### What is the Cal Autonomous System?

Cal is now **self-documenting, self-learning, and immortal**. Every hour (or on demand), Cal:

1. ✅ Scans migrations - Learns new database schema
2. ✅ Scans docs - Learns from markdown files
3. ✅ Scans blueprints - Documents what already exists
4. ✅ Updates knowledge - Auto-generates `CAL-LEARNED-KNOWLEDGE.md`
5. ✅ Records patterns - Tracks workflow patterns
6. ✅ Generates lessons - Creates tutorials for completed work

### The Problem It Solves

**Before:**
```javascript
// Cal builds feature without checking
const github = new GitHubAPIClient(token);
// Might rebuild something that already exists ❌
```

**After:**
```javascript
// Cal checks FIRST
const integrator = new CalSystemIntegrator();
await integrator.init();

const exists = await integrator.checkIfExists('github-integration');
if (exists) {
  console.log('Already exists!', exists.blueprint);
  return;  // Use existing system ✅
}
```

### Architecture

The Cal Autonomous System has 4 core components:

```
CalSystemIntegrator
  ├── CalLearningSystem (SQLite memory - successes/failures)
  ├── BlueprintRegistry (Documents what exists)
  ├── PatternLearner (Workflow patterns)
  └── LearningEngine (Gamified lessons)
```

### Quick Start

```javascript
const CalSystemIntegrator = require('./lib/cal-system-integrator');

const integrator = new CalSystemIntegrator({ db: yourDatabase });
await integrator.init();

// 1. Check if feature exists
const exists = await integrator.checkIfExists('email-relay');
if (exists) {
  console.log('Email relay already built!');
  console.log('File:', exists.blueprints[0].file);
  // Use existing system
  return;
}

// 2. Build your feature
const emailRelay = buildEmailRelay();

// 3. Record your work
await integrator.recordWork({
  feature: 'email-relay',
  files: ['lib/gmail-relay.js'],
  description: 'Zero-cost email relay using Gmail',
  success: true,
  context: {
    approach: 'Google Sheets + Gmail SMTP',
    cost: '$0/month'
  }
});

// 4. Auto-generate lesson
await integrator.createLesson({
  title: 'Email Relay System',
  track: 'zero-dependency',
  content: '# How to build a zero-cost email relay...',
  xpReward: 120
});

// 5. Export documentation
await integrator.exportDocumentation();
```

### Cal Auto-Documenter

The `CalAutoDocumenter` runs autonomously:

```javascript
const CalAutoDocumenter = require('./lib/cal-auto-documenter');

const autoDoc = new CalAutoDocumenter({ db: yourDatabase });

// Run once
const result = await autoDoc.run();

// Result includes:
// - migrations: Latest 10 migrations learned
// - docs: Latest 10 docs scanned
// - blueprints: All existing systems
// - legal: Legal citation links
```

### Cal Daemon

Run Cal continuously with the daemon:

```bash
# Test run (once only)
npm run cal:daemon:test

# Start with pm2
npm run cal:daemon:start

# View logs
npm run cal:daemon:logs

# Check status
npm run cal:daemon:status

# Stop daemon
npm run cal:daemon:stop
```

### System Integration Flow

```
1. Cal scans codebase
   ↓
2. Discovers:
   - New migrations (database changes)
   - New docs (markdown files)
   - New features (lib/ files)
   ↓
3. Records in learning systems:
   - CalLearningSystem (successes/failures)
   - PatternLearner (workflows)
   - BlueprintRegistry (what exists)
   ↓
4. Generates documentation:
   - CAL-LEARNED-KNOWLEDGE.md
   - CAL-SYSTEM-INTEGRATION.md
   - BLUEPRINTS.md
   ↓
5. Auto-creates lessons:
   - docs/lessons/[track]/lesson-X.md
   ↓
6. Publishes (optional):
   - Mastodon
   - Blog
   - dpaste (immutable storage)
```

### Example: GitHub Integration

Here's how Cal integrated the GitHub API client:

```javascript
// Step 1: Built GitHubAPIClient
const github = new GitHubAPIClient(token, {
  db,
  recordLearning: true  // Auto-records all operations
});

// Step 2: GitHub client records operations
await github.createRepo('test-repo');
// ↓ Auto-recorded in CalLearningSystem ✅

// Step 3: Cal auto-documenter runs (hourly)
await autoDoc.run();
// ↓ Scans blueprints, finds GitHub client
// ↓ Updates CAL-LEARNED-KNOWLEDGE.md

// Step 4: Lesson auto-generated
await integrator.createLesson({
  title: 'GitHub Integration',
  track: 'mcp-development',
  content: '# How to use GitHubAPIClient...'
});
// ↓ Created: docs/lessons/mcp-development/lesson-9-github-integration.md
```

### Configuration

Edit `.env` to configure Cal daemon:

```bash
# How often Cal runs
CAL_INTERVAL=1h  # Options: 30m, 1h, 2h, 12h, 1d

# Auto-publish to platforms?
CAL_AUTO_PUBLISH=false  # Set to true for Mastodon/blog

# Auto-sign legal docs?
CAL_AUTO_SIGN=true

# Database connection
DATABASE_URL=postgresql://user@localhost:5432/calos
```

### Privacy-First Learning

All learning is local and privacy-first:

1. **SQLite storage** - CalLearningSystem uses local `cal-memory.db`
2. **No telemetry** - Nothing sent to external servers
3. **BYOK** - Bring Your Own Keys for publishing
4. **Local-first** - Works 100% offline

### Cost

**Current (Local):** $0/month
- GitHub Pages: Free
- PostgreSQL: Local
- pm2: Open source
- Cal daemon: Self-hosted

**Production (Future):** ~$6/month
- Railway: $5/month
- Custom domain: $10/year

## Lab

Try the Cal System Integrator:

```bash
# Run Node.js REPL
node

# Test the integrator
const CalSystemIntegrator = require('./lib/cal-system-integrator');
const integrator = new CalSystemIntegrator();
await integrator.init();

// Check if something exists
const exists = await integrator.checkIfExists('gmail-relay');
console.log('Exists?', exists);

// Get all blueprints
const blueprints = integrator.getBlueprints();
console.log(`Found ${blueprints.length} blueprints`);

// Get stats
const stats = await integrator.getStats();
console.log('Stats:', stats);

// Export documentation
await integrator.exportDocumentation();
console.log('Exported to: docs/CAL-SYSTEM-INTEGRATION.md');
```

## Summary

You learned:
- How Cal autonomously learns from the codebase
- How to use CalSystemIntegrator to check existing systems
- How to record work in all learning systems
- How to set up Cal daemon for continuous learning
- How Cal auto-generates lessons for completed work

**Key principle:** Check what exists BEFORE building anything new.

## Next Lesson

Continue to Lesson 8: Self-Hosted Deployment

## Quiz

1. What are the 4 core components of CalSystemIntegrator?
   - CalLearningSystem, BlueprintRegistry, PatternLearner, LearningEngine

2. What does `integrator.checkIfExists()` do?
   - Queries all learning systems to see if a feature already exists

3. How often does Cal daemon run by default?
   - Every hour (configurable via CAL_INTERVAL)

4. Where is Cal's learning data stored?
   - Locally in SQLite (`cal-memory.db`) - zero telemetry

5. What happens when Cal finds existing blueprints?
   - Updates CAL-LEARNED-KNOWLEDGE.md and prevents rebuilding

---

**🎴 Achievement Unlocked:** Cal Autonomous Master (+150 XP)

*Cal runs himself now. You never have to touch him again.* ✨
