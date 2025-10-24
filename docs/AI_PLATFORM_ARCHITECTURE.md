# CALOS AI Edutech Platform - System Architecture

## How Everything Works Together

Your AI platform has 4 main components that feed into each other:

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER TAKES LESSONS                            │
│              (lib/learning-engine.js)                            │
│   - Complete lessons, earn XP, level up                          │
│   - Get achievements, maintain streaks                           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              GAMIFIED DATA COLLECTION                            │
│              (lib/training-tasks.js)                             │
│   - Vote on AI outputs (ELO system)                              │
│   - Rate responses, chat, generate memes                         │
│   - Collect training data while users learn                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONTINUOUS FINE-TUNING                              │
│              (agents/learning-loop.js)                           │
│   - Accumulate examples from training tasks                      │
│   - Fine-tune Ollama models when threshold reached               │
│   - Version and tag improved models                              │
│   - Generate OSS weights for export                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              RL OPTIMIZATION                                     │
│              (lib/rl-command-learner.js)                         │
│   - Learn which commands work best                               │
│   - Optimize lesson delivery based on success rates              │
│   - Provide fix strategies for failed tasks                      │
│   - Track Q-values and rewards over time                         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Example

**Day 1:**
1. User completes "Web3 Basics" lesson → Earns 50 XP
2. System prompts: "Vote on these 2 AI explanations of blockchain"
3. User votes → Training data collected
4. Vote stored in PostgreSQL with quality score

**Day 7:**
1. 100 training examples collected across all users
2. `learning-loop.js` triggers fine-tuning on Ollama
3. New model version `calos-v1.1` created
4. Model weights exported to `models/oss/calos-v1.1.gguf`

**Day 30:**
1. RL system notices "interactive coding lessons" have 85% completion
2. RL system notices "long video lessons" have 40% completion
3. Q-values updated: interactive lessons get higher score
4. Platform automatically prioritizes interactive content

**Day 60:**
1. User reaches Level 10, completes 50 lessons
2. System generates achievement meme: "npm install developer_god_mode"
3. Meme auto-posted to Twitter with hashtags
4. Viral engagement drives new signups

## Current Status: What's Built

### ✅ Fully Built
- **Learning Engine** (`lib/learning-engine.js`) - Complete gamification system
- **Database Schema** (`migrations/020_learning_platform.sql`) - 12 paths, 117 lessons seeded
- **Training Tasks Framework** (`lib/training-tasks.js`) - Data collection ready
- **RL Command Learner** (`lib/rl-command-learner.js`) - Q-learning implementation
- **Learning Loop Agent** (`agents/learning-loop.js`) - Fine-tuning automation
- **Meme Generator** (`lib/dev-ragebait-generator.js`) - 5 viral templates
- **Agent Router** (`router.js`) - Multi-model routing with ELO

### ⚠️ Partially Built (Needs Integration)
- No central orchestrator connecting all components
- No reporting/analytics dashboard
- No automated meme posting on milestones
- No OSS weights export pipeline

### ❌ Not Built Yet
- Edutech report generator
- Platform launcher script
- Meme milestone integration
- Model versioning API

## What We Need to Build

### 1. Platform Launcher (`scripts/launch-platform.js`)
Orchestrates all components:
```javascript
// Pseudo-code
await learningEngine.init();
await trainingTasks.startCollecting();
await learningLoop.startMonitoring();  // Fine-tune when threshold hit
await rlOptimizer.startLearning();
await memeGenerator.watchMilestones();  // Generate viral content on achievements
```

### 2. Edutech Report Generator (`scripts/generate-edutech-report.js`)
Analytics and metrics:
- Learning metrics: completion rates, average XP per lesson, streak retention
- Training metrics: examples collected, quality scores, diversity
- Model metrics: fine-tuning frequency, performance improvements, version history
- RL metrics: Q-value convergence, reward trends, command success rates
- Engagement metrics: meme shares, viral reach, user growth

### 3. Meme Milestone Integration (`lib/meme-milestone-engine.js`)
Auto-generate viral content on events:
- Level up → "Finally escaped tutorial hell" meme
- Streak milestone → "Day 30 of coding: Still no senior role" meme
- Achievement unlocked → "npm install confidence" meme
- Lesson complete → Domain-specific ragebait

### 4. OSS Weights Pipeline (`scripts/export-oss-weights.js`)
Model versioning and distribution:
- Export Ollama models to GGUF format
- Tag with version, metrics, training data size
- Push to Hugging Face
- Generate model cards with performance stats

## Implementation Priority

**Phase 1: Reporting (Week 1)**
- Build edutech report generator
- Create analytics dashboard queries
- Show current state of all systems

**Phase 2: Integration (Week 2)**
- Build platform launcher
- Connect learning-engine → training-tasks
- Connect training-tasks → learning-loop
- Connect RL optimizer to lesson delivery

**Phase 3: Viral Growth (Week 3)**
- Integrate meme generator with achievements
- Auto-post to Twitter on milestones
- Track engagement metrics

**Phase 4: OSS Community (Week 4)**
- Export fine-tuned model weights
- Create model cards
- Push to Hugging Face
- Enable community contributions

## Success Metrics

**Learning Platform:**
- 100+ active users per domain
- 60%+ lesson completion rate
- 7-day streak retention > 40%

**Training Data:**
- 10K+ quality training examples per month
- Diversity score > 0.7 (not all same type)
- User quality score average > 75/100

**Model Performance:**
- Fine-tune every 100 examples (weekly initially)
- 10%+ improvement in evaluation metrics per version
- 5+ model versions in first 3 months

**Viral Engagement:**
- 500+ meme shares per month
- 20%+ of memes go viral (>10K views)
- 10%+ of viral traffic converts to signups

## Tech Stack Summary

- **Database:** PostgreSQL (calos) with 461 tables
- **AI Models:** Ollama (local), Anthropic Claude, OpenAI
- **Fine-tuning:** Ollama Modelfile + incremental training
- **RL:** Q-learning (epsilon-greedy exploration)
- **Memes:** Sharp (image), FFmpeg (GIF/MP4)
- **Routing:** Multi-model ELO voting system

## Next Steps

1. Generate current state report (see what data we have)
2. Build platform launcher (connect the pieces)
3. Test end-to-end flow with 1 user
4. Scale to all 12 domains
5. Export first OSS model weights
