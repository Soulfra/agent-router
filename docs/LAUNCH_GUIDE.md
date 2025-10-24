# CALOS AI Edutech Platform - Launch Guide

## Overview

Your AI edutech platform is now ready to launch! This guide shows you how to go from "awesome in theory" to "working system" in 4 phases.

## What You Have Now

### ✅ Already Built (100% Complete)
- **Learning Platform** - 12 paths, 117 lessons, gamification system
- **RL Command Learner** - Q-learning optimization engine
- **Learning Loop Agent** - Ollama fine-tuning automation
- **Training Tasks Framework** - Gamified data collection
- **Meme Generator** - 5 viral dev templates
- **Agent Router** - Multi-model ELO voting

### 📦 Just Created (Ready to Use)
- **Architecture Documentation** - `docs/AI_PLATFORM_ARCHITECTURE.md`
- **Edutech Report Generator** - `scripts/generate-edutech-report.js`
- **Platform Launcher** - `scripts/launch-platform.js`
- **Meme Milestone Engine** - `lib/meme-milestone-engine.js`
- **OSS Weights Exporter** - `scripts/export-oss-weights.js`

## Quick Start (3 Commands)

```bash
# 1. Generate current state report
node scripts/generate-edutech-report.js

# 2. Launch the platform
node scripts/launch-platform.js

# 3. Watch it run!
# Platform will auto-generate memes, collect training data, optimize with RL
```

## Phase 1: Understand Current State (5 minutes)

### Generate Your First Report

```bash
# Full platform report
node scripts/generate-edutech-report.js

# JSON format for automation
node scripts/generate-edutech-report.js --format=json > current-state.json

# Single domain report
node scripts/generate-edutech-report.js --domain=soulfra.com
```

**What You'll See:**
- Learning metrics: 12 paths, 117 lessons, completion rates
- Training data: How many examples collected (probably 0 initially)
- Model versions: Any fine-tuned models (probably none yet)
- RL optimization: Command success rates
- Viral engagement: Meme performance

**Example Output:**
```
📊 CALOS EDUTECH PLATFORM REPORT
======================================================================
Generated: 2025-01-15T10:30:00Z
Period: 30d
======================================================================

🏥 OVERALL HEALTH SCORE
Score: 45/100 (FAIR)
Breakdown:
  Learning Platform: 18/30
  Training Data: 0/25
  Model Performance: 0/20
  RL Optimization: 12/15
  Viral Engagement: 0/10

📚 LEARNING PLATFORM
Paths: 12/12 active
Lessons: 117/117 active
Total Learners: 0
Completion Rate: 0%
```

This shows you're ready to onboard users!

## Phase 2: Launch Platform (2 minutes)

### Start All Components

```bash
# Full launch (RL + Memes + Fine-tuning)
node scripts/launch-platform.js

# Minimal launch (just learning + training tasks)
node scripts/launch-platform.js --disable-rl --disable-memes --disable-finetuning

# Dry run (test without changes)
node scripts/launch-platform.js --dry-run
```

**What Happens:**
1. ✅ Learning Engine initialized (12 paths, 117 lessons)
2. ✅ Training Task Collector started (creates `training_tasks` table)
3. ✅ RL Optimizer activated (starts learning command patterns)
4. ✅ Meme Generator watching for milestones
5. ✅ Platform monitoring every 30 seconds

**Example Output:**
```
🚀 Launching CALOS AI Edutech Platform...

📚 Initializing Learning Engine...
   ✓ Learning paths: 12
   ✓ Active lessons: 117

🎯 Initializing Training Task Collector...
   ✓ Training task collector ready

🧠 Initializing RL Command Optimizer...
   ✓ Commands tracked: 42
   ✓ Avg success rate: 73.2%

🎨 Initializing Meme Generator...
   ✓ Meme templates loaded: 5

✅ Platform launched successfully!
   Port: 3000
   RL Optimizer: enabled
   Meme Generator: enabled
   Fine-tuning: enabled

📊 Run 'node scripts/generate-edutech-report.js' to view platform metrics

──────────────────────────────────────────────────
📊 PLATFORM STATUS
──────────────────────────────────────────────────
Uptime: 0m 5s
Lessons Completed: 0
Training Examples: 0
Memes Generated: 0
Fine-tunes Triggered: 0
──────────────────────────────────────────────────
```

Platform is now running! Leave it running in a terminal.

## Phase 3: Simulate User Flow (10 minutes)

### Test the Full Pipeline

Open a new terminal and simulate a user completing lessons:

```javascript
// test-user-flow.js
const LearningEngine = require('./lib/learning-engine');
const { Pool } = require('pg');

const db = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'calos',
  user: 'matthewmauer'
});

const engine = new LearningEngine(db);

(async () => {
  await engine.init();

  // Get or create test user
  const user = await engine.getOrCreateUser('test-user-123', 'testuser@example.com');

  // Get first learning path
  const paths = await db.query('SELECT path_id FROM learning_paths LIMIT 1');
  const pathId = paths.rows[0].path_id;

  // Complete first 3 lessons
  for (let i = 1; i <= 3; i++) {
    const lessons = await db.query(
      'SELECT lesson_id FROM lessons WHERE path_id = $1 AND lesson_number = $2',
      [pathId, i]
    );

    if (lessons.rows.length > 0) {
      const lessonId = lessons.rows[0].lesson_id;

      console.log(`Completing lesson ${i}...`);
      await engine.completeLesson(user.user_id, lessonId, pathId, {
        score: 95,
        timeSpent: 15 * 60 // 15 minutes
      });

      console.log(`✓ Lesson ${i} complete!`);
    }
  }

  console.log('\n✅ User flow test complete!');
  await db.end();
})();
```

Run it:
```bash
DB_USER=matthewmauer node test-user-flow.js
```

**What You'll See:**
1. Platform detects lesson completions
2. Creates training tasks for each lesson
3. RL system learns which lesson types work best
4. Meme generated when user levels up

## Phase 4: Export OSS Weights (When Ready)

### After Collecting 100+ Training Examples

```bash
# Check if you have any fine-tuned models
node scripts/export-oss-weights.js

# Export latest model
node scripts/export-oss-weights.js --latest

# Export specific version
node scripts/export-oss-weights.js calos-v1.2

# Export and push to Hugging Face
HF_TOKEN=your_token node scripts/export-oss-weights.js calos-v1.2 --push-hf
```

**What Gets Created:**
```
models/oss/calos-v1.2/
  calos-v1.2.gguf           # Model weights (GGUF format)
  README.md                  # Model card with training details
  metadata.json              # Metrics and version info
```

**Model Card Includes:**
- Training examples count
- Performance score
- Base model info
- Intended use & limitations
- How to use with Ollama/llama.cpp
- Citation

## Success Metrics

### Week 1: Platform Launch
- [ ] Platform running 24/7
- [ ] 10+ users onboarded
- [ ] 50+ lessons completed
- [ ] 25+ training tasks collected

### Week 2: Data Collection
- [ ] 100+ training examples
- [ ] First fine-tune triggered
- [ ] RL Q-values converging
- [ ] 5+ memes generated

### Week 3: Model Release
- [ ] calos-v1.1 exported
- [ ] Model pushed to Hugging Face
- [ ] Model card published
- [ ] Community feedback collected

### Week 4: Viral Growth
- [ ] 1+ viral meme (>10K views)
- [ ] 100+ signups from viral content
- [ ] Second model version released
- [ ] 500+ training examples

## Architecture Recap

```
USER COMPLETES LESSON
       ↓
[Learning Engine] Awards XP, checks level up
       ↓
[Training Tasks] Creates vote/rate/chat task
       ↓
[Learning Loop] Accumulates examples → Fine-tunes at 100
       ↓
[OSS Weights] Exports GGUF → Pushes to Hugging Face
       ↓
[Meme Engine] Generates viral content on milestones
       ↓
VIRAL GROWTH → MORE USERS → MORE DATA → BETTER MODELS
```

## Common Commands

```bash
# Check platform health
node scripts/generate-edutech-report.js

# Launch platform
node scripts/launch-platform.js

# Export model weights
node scripts/export-oss-weights.js --latest

# Test meme generation
node -e "const Gen = require('./lib/dev-ragebait-generator'); \
  const g = new Gen(); \
  g.generate('npm-install').then(r => console.log(r));"

# Check Ollama models
ollama list | grep calos

# View training tasks
psql -U matthewmauer -d calos -c "SELECT task_type, COUNT(*) FROM training_tasks GROUP BY task_type;"
```

## Next Steps

1. **NOW:** Run `node scripts/generate-edutech-report.js` to see current state
2. **TODAY:** Launch platform with `node scripts/launch-platform.js`
3. **THIS WEEK:** Onboard first 10 users, collect 100 training examples
4. **NEXT WEEK:** Fine-tune first model, export to Hugging Face
5. **ONGOING:** Monitor viral memes, iterate on content strategy

## Troubleshooting

### "Database connection failed"
```bash
# Check PostgreSQL is running
psql -U matthewmauer -d calos -c "SELECT 1"

# Set DB_USER if needed
export DB_USER=matthewmauer
```

### "Ollama not found"
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

### "No models found"
The platform will work without Ollama initially. Fine-tuning requires:
1. Users complete lessons
2. Training tasks collected
3. Learning loop agent running: `node agents/learning-loop.js`

## Support

- **Docs:** `docs/AI_PLATFORM_ARCHITECTURE.md`
- **Issues:** https://github.com/calos/agent-router/issues
- **Discord:** https://discord.gg/calos

---

**You're ready to launch! 🚀**

Run these 3 commands and you'll have a working AI edutech platform with RL optimization, viral meme generation, and OSS weight export.
