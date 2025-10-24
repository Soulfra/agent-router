# 📝 Daily Voice Journal System

**Talk, ramble, create. Let the system handle the rest.**

Transform your daily voice recordings into:
- ✅ Coherent narratives with story arcs
- ✅ Actionable GitHub issues from "I should build..."
- ✅ Math notes with LaTeX notation
- ✅ Product ideas with market analysis
- ✅ Research questions with starting points
- ✅ Multi-brand content routing (soulfra.com, deathtodata.com, calriven.com, etc.)
- ✅ Auto-publishing to Mastodon, blog, Twitter, YouTube, newsletter, podcast

---

## What Is This?

A complete autonomous system that lets you **talk daily like it's your job**, ramble about ideas/dev work/math concepts, and have the AI:

1. **Build coherent narratives** from your rambling (with story arcs, themes, insights)
2. **Extract actionable work** (dev tasks → GitHub issues, math concepts → LaTeX notes, product ideas, research questions)
3. **Route content to brand domains** based on topic (privacy → soulfra.com, data brokers → deathtodata.com, AI → calriven.com)
4. **Auto-publish everywhere** (Mastodon, blog, Twitter, YouTube, newsletter, podcast)
5. **Track daily streaks** with quest rewards (7-day streak = 100 credits, 30-day = 500 credits)

---

## Quick Start

### 1. Setup (One-Time)

```bash
# Set API keys
export OPENAI_API_KEY=sk-...        # Required for transcription
export GITHUB_TOKEN=ghp_...          # Optional for auto-creating issues
export ANTHROPIC_API_KEY=sk-ant-... # For narrative building

# Run migration
npm run migrate
```

### 2. Start Daily Mode

```bash
# Interactive CLI
npm run journal
```

Or via API:

```bash
curl -X POST http://localhost:5001/api/voice-journal/start \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "default_user",
    "schedule": "09:00",
    "timezone": "America/New_York",
    "autoPub": ["mastodon", "blog"],
    "autoExtract": true,
    "autoRoute": true,
    "promptType": "daily-reflection"
  }'
```

### 3. Record & Process

**Option A: On-demand processing**

```bash
curl -X POST http://localhost:5001/api/voice-journal/process \
  -F "userId=default_user" \
  -F "audio=@/path/to/recording.m4a" \
  -F "platforms=mastodon,blog,twitter" \
  -F "githubRepo=owner/repo"
```

**Option B: Let the autonomous system detect recordings**

Just save your recording with keywords like `calos-walkthrough-2025-10-22.m4a` in `~/Downloads`, and the system will detect it automatically within 30 seconds (via the existing RecordingMissionOrchestrator).

### 4. View Results

```bash
# Check status
npm run journal:status

# View history
npm run journal:history

# View analytics & streak
npm run journal:analytics

# View platform status
npm run journal:platforms
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Daily Voice Journal System                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  DailyVoiceJournalOrchestrator          │
        │  - Scheduled daily prompts               │
        │  - On-demand processing                  │
        │  - Quest integration (streaks)           │
        │  - Multi-brand routing                   │
        └─────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Narrative│  │   Idea   │  │  Brand   │
        │ Builder  │  │Extractor │  │ Router   │
        └──────────┘  └──────────┘  └──────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Auto-Publisher   │
                    │ - Mastodon       │
                    │ - Blog           │
                    │ - Twitter        │
                    │ - YouTube        │
                    │ - Newsletter     │
                    │ - Podcast        │
                    └──────────────────┘
```

---

## Components

### 1. VoiceNarrativeBuilder

**Transforms rambling into coherent narratives**

**Input:** Raw transcript
**Output:** Story with themes, insights, actionable items

**Features:**
- Story structure analysis (beginning, middle, end)
- Theme extraction (3-7 main themes)
- Key insight identification
- Tangent mapping (valuable vs dead-end)
- Multiple output formats:
  - Story (500-800 words)
  - Blog post (with headings, takeaways)
  - Podcast script (with timestamps)
  - Twitter thread (5-10 tweets)

**Example:**

```javascript
const builder = new VoiceNarrativeBuilder({ llmRouter });

const narrative = await builder.build({
  transcript: rawTranscript,
  metadata: { sessionType: 'morning' },
  outputFormats: ['story', 'blog', 'thread']
});

// narrative.outputs.story.title → "Building Multi-Brand Content Systems"
// narrative.analysis.themes → [{name: "Privacy Tech", description: "..."}, ...]
// narrative.analysis.insights → [{insight: "ZK proofs enable...", type: "realization"}, ...]
```

### 2. VoiceIdeaExtractor

**Extracts actionable work from your rambling**

**Input:** Transcript + narrative
**Output:** Dev tasks, math concepts, product ideas, research questions

**Features:**
- Dev task extraction ("I should build..." → GitHub issue)
- Math concept extraction (with LaTeX notation)
- Product idea extraction (with market analysis)
- Research question extraction (with starting points)
- Automatic artifact creation (GitHub issues, database notes)

**Example:**

```javascript
const extractor = new VoiceIdeaExtractor({
  llmRouter,
  githubToken,
  db
});

const extracted = await extractor.extract({
  transcript,
  narrative
});

// extracted.devTasks → [{task: "Add auth to API", priority: "high", timeframe: "now"}, ...]
// extracted.mathConcepts → [{name: "Matrix Multiplication", notation: "...", difficulty: "medium"}, ...]
// extracted.productIdeas → [{idea: "SaaS for...", monetization: "subscription", marketSize: "medium"}, ...]

// Create artifacts
const artifacts = await extractor.createArtifacts(extracted, {
  createGitHubIssues: true,
  githubRepo: 'owner/repo',
  saveMathNotes: true,
  saveProductIdeas: true,
  saveResearch: true
});

// artifacts.githubIssues → [{task: "...", issueNumber: 42, url: "https://github.com/..."}, ...]
```

### 3. BrandVoiceContentRouter

**Routes content to the right brand domain**

**Brands:**
- **soulfra.com** - Identity, privacy, self-sovereignty, zero-knowledge
- **deathtodata.com** - Data broker disruption, anti-surveillance
- **calriven.com** - AI, publishing, federation, technical architecture
- **calos.ai** - General tech, systems, architecture
- **roughsparks.com** - UI/UX, design, creative coding
- **drseuss.consulting** - Business, whimsical consulting
- **publishing.bot** - Content automation, publishing workflows

**Algorithm:**
- 30% keyword-based scoring
- 70% LLM-based classification
- Primary brand (highest score) + secondary brands (score >= 60)
- Cross-post threshold: 70

**Example:**

```javascript
const router = new BrandVoiceContentRouter({ llmRouter });

const routing = await router.route({
  narrative,
  themes: narrative.analysis.themes
});

// routing.routing.primary → {brand: "soulfra", domain: "soulfra.com", confidence: 92}
// routing.routing.secondary → [{brand: "calriven", domain: "calriven.com", confidence: 68}, ...]
// routing.routing.crossPost → true (if secondary score >= 70)
```

### 4. CrossPlatformAutoPublisher

**Publishes to all platforms at once**

**Platforms:**
- **Mastodon** - ActivityPub federation
- **Blog** - Content Publishing System
- **Twitter/X** - Thread generator
- **YouTube** - Script + optional video upload
- **Newsletter** - Draft for review
- **Podcast** - RSS feed episode

**Example:**

```javascript
const publisher = new CrossPlatformAutoPublisher({
  db,
  activityPubServer,
  contentPublisher,
  twitterClient,
  youtubeClient,
  newsletterService,
  podcastRSSGenerator
});

const results = await publisher.publish({
  narrative,
  routing: routing.routing,
  platforms: ['mastodon', 'blog', 'twitter'],
  metadata: { sessionId, userId }
});

// results.published → {mastodon: {...}, blog: {...}, twitter: {...}}
// results.urls → {mastodon: "https://...", blog: "https://...", twitter: "https://..."}
```

### 5. DailyVoiceJournalOrchestrator

**Ties everything together**

**Features:**
- Scheduled daily prompts (e.g., "9am every day")
- On-demand processing
- Quest integration (daily streak rewards)
- Session history & analytics
- Multi-brand cross-posting

**Example:**

```javascript
const orchestrator = new DailyVoiceJournalOrchestrator({
  db,
  llmRouter,
  questEngine,
  recordingOrchestrator
});

// Start daily autonomous mode
await orchestrator.start('user123', {
  schedule: '09:00',
  timezone: 'America/New_York',
  autoPub: ['mastodon', 'blog'],
  autoExtract: true,
  autoRoute: true,
  promptType: 'daily-reflection'
});

// Process recording on-demand
const session = await orchestrator.processRecording({
  userId: 'user123',
  audioPath: '/path/to/recording.m4a',
  platforms: ['mastodon', 'blog', 'twitter'],
  metadata: { githubRepo: 'owner/repo' }
});

// session.narrative → Full narrative with all outputs
// session.routing → Brand routing results
// session.published → Published URLs
// session.extracted → Extracted work (dev tasks, math, ideas, research)
```

---

## API Reference

### POST /api/voice-journal/start

Start daily autonomous mode

**Request:**

```json
{
  "userId": "default_user",
  "schedule": "09:00",
  "timezone": "America/New_York",
  "autoPub": ["mastodon", "blog"],
  "autoExtract": true,
  "autoRoute": true,
  "promptType": "daily-reflection"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Daily voice journal started for default_user",
  "schedule": {
    "userId": "default_user",
    "schedule": "09:00",
    "timezone": "America/New_York",
    "autoPub": ["mastodon", "blog"],
    "status": "active"
  }
}
```

### POST /api/voice-journal/stop

Stop autonomous mode

**Request:**

```json
{
  "userId": "default_user"
}
```

### POST /api/voice-journal/process

Process recording on-demand

**Request:**

```bash
curl -X POST http://localhost:5001/api/voice-journal/process \
  -F "userId=default_user" \
  -F "audio=@/path/to/recording.m4a" \
  -F "platforms=mastodon,blog,twitter" \
  -F "githubRepo=owner/repo"
```

**Response:**

```json
{
  "success": true,
  "message": "Recording processed successfully",
  "session": {
    "sessionId": "uuid",
    "status": "complete",
    "narrative": {
      "title": "Building Multi-Brand Content Systems",
      "themes": ["Privacy Tech", "AI Publishing", "Federation"],
      "insights": 8
    },
    "routing": {
      "primaryBrand": "soulfra",
      "primaryDomain": "soulfra.com",
      "confidence": 92
    },
    "published": {
      "platforms": ["mastodon", "blog"],
      "urls": {
        "mastodon": "https://mastodon.social/@user/...",
        "blog": "https://soulfra.com/blog/building-multi-brand-..."
      }
    },
    "extracted": {
      "devTasks": 3,
      "mathConcepts": 1,
      "productIdeas": 2,
      "researchQuestions": 4
    }
  }
}
```

### GET /api/voice-journal/status

Get orchestrator status

**Query params:**
- `userId` (optional) - Get status for specific user

**Response:**

```json
{
  "success": true,
  "status": {
    "userId": "default_user",
    "schedule": {
      "schedule": "09:00",
      "timezone": "America/New_York",
      "autoPub": ["mastodon", "blog"],
      "status": "active"
    },
    "activeSessions": 0,
    "status": "active"
  }
}
```

### GET /api/voice-journal/sessions

Get session history

**Query params:**
- `userId` (required)
- `limit` (default: 30)
- `offset` (default: 0)
- `status` (optional) - Filter by status

**Response:**

```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "uuid",
      "status": "complete",
      "primary_brand": "soulfra",
      "primary_domain": "soulfra.com",
      "narrative_summary": {
        "title": "Building Multi-Brand Content Systems",
        "themes": ["Privacy Tech", "AI Publishing"]
      },
      "published_platforms": ["mastodon", "blog"],
      "created_at": "2025-10-22T09:00:00Z",
      "completed_at": "2025-10-22T09:05:00Z"
    }
  ],
  "total": 42,
  "limit": 30,
  "offset": 0
}
```

### GET /api/voice-journal/analytics

Get analytics and streak

**Query params:**
- `userId` (required)
- `period` (default: "30days")

**Response:**

```json
{
  "success": true,
  "analytics": {
    "total_sessions": 42,
    "completed_sessions": 40,
    "avg_processing_time": "00:05:23",
    "brands_used": ["soulfra", "calriven", "calos"],
    "days_active": 35,
    "streak": 12,
    "total_dev_tasks": 58,
    "total_math_concepts": 12,
    "total_product_ideas": 23,
    "total_research_questions": 34,
    "period": "30days"
  }
}
```

### GET /api/voice-journal/platforms

Get platform status

**Response:**

```json
{
  "success": true,
  "platforms": {
    "mastodon": {
      "enabled": true,
      "format": "federated_post",
      "capabilities": {
        "images": true,
        "threads": true
      },
      "maxLength": 500
    },
    "blog": {
      "enabled": true,
      "format": "markdown",
      "capabilities": {
        "images": true,
        "html": true
      }
    }
  }
}
```

---

## Database Schema

### voice_journal_sessions

Tracks all recording sessions

```sql
CREATE TABLE voice_journal_sessions (
  session_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  audio_path TEXT,
  transcript TEXT,
  metadata JSONB,

  -- Narrative
  narrative_summary JSONB,

  -- Extracted work
  extracted_summary JSONB,

  -- Routing
  primary_brand TEXT,
  primary_domain TEXT,
  routing_confidence INTEGER,

  -- Publishing
  published_platforms TEXT[],
  published_urls JSONB,

  -- Status
  status TEXT DEFAULT 'processing',
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### voice_journal_schedules

Daily automation schedules

```sql
CREATE TABLE voice_journal_schedules (
  schedule_id UUID PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  schedule_time TEXT NOT NULL,
  timezone TEXT DEFAULT 'America/New_York',
  auto_publish_platforms JSONB,
  auto_extract_enabled BOOLEAN,
  auto_route_enabled BOOLEAN,
  prompt_type TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### voice_math_notes

Mathematical concepts from journals

```sql
CREATE TABLE voice_math_notes (
  note_id UUID PRIMARY KEY,
  session_id UUID REFERENCES voice_journal_sessions(session_id),
  concept_name TEXT NOT NULL,
  description TEXT,
  notation TEXT,  -- LaTeX
  applications TEXT,
  related_topics JSONB,
  difficulty TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### voice_product_ideas

Product/business ideas from journals

```sql
CREATE TABLE voice_product_ideas (
  idea_id UUID PRIMARY KEY,
  session_id UUID REFERENCES voice_journal_sessions(session_id),
  idea_description TEXT NOT NULL,
  target_market TEXT,
  monetization TEXT,
  difficulty TEXT,
  market_size TEXT,
  unique_value TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### voice_research_questions

Research questions from journals

```sql
CREATE TABLE voice_research_questions (
  question_id UUID PRIMARY KEY,
  session_id UUID REFERENCES voice_journal_sessions(session_id),
  question TEXT NOT NULL,
  motivation TEXT,
  starting_points JSONB,
  difficulty TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Quest Integration

### Daily Voice Journal Quest

```json
{
  "quest_key": "daily-voice-journal",
  "quest_name": "Daily Voice Journaler",
  "completion_criteria": {
    "type": "streak",
    "target": 7,
    "unit": "sessions"
  },
  "rewards": {
    "credits": 50,
    "badge": "daily_journaler",
    "unlocks": ["voice_analytics_dashboard"]
  }
}
```

### Weekly Streak Quest

```json
{
  "quest_key": "weekly-voice-streak",
  "completion_criteria": {
    "type": "streak",
    "target": 7,
    "unit": "days"
  },
  "rewards": {
    "credits": 100,
    "badge": "weekly_streak",
    "bonus_multiplier": 1.5
  }
}
```

### Monthly Streak Quest

```json
{
  "quest_key": "monthly-voice-streak",
  "completion_criteria": {
    "type": "streak",
    "target": 30,
    "unit": "days"
  },
  "rewards": {
    "credits": 500,
    "badge": "monthly_streak",
    "bonus_multiplier": 2.0,
    "unlocks": ["voice_journal_premium"]
  }
}
```

---

## CLI Commands

```bash
# Start interactive CLI
npm run journal

# View status
npm run journal:status

# View history
npm run journal:history

# View analytics
npm run journal:analytics

# View platform status
npm run journal:platforms
```

---

## Example Workflow

### Daily Routine

**9:00 AM - Scheduled prompt**

System sends notification: "Time for your daily journal!"

**9:05 AM - Record on phone**

Save recording as `calos-journal-2025-10-22.m4a` in `~/Downloads`

**9:06 AM - System detects automatically**

Within 30 seconds:
- ✅ File detected
- ✅ Transcribed via OpenAI Whisper
- ✅ Narrative built (story, themes, insights)
- ✅ Ideas extracted (3 dev tasks → GitHub issues, 1 math concept → LaTeX note, 2 product ideas)
- ✅ Content routed (92% confidence → soulfra.com)
- ✅ Published to Mastodon + blog
- ✅ Quest progress updated (12-day streak!)

**9:11 AM - Check results**

```bash
npm run journal:analytics
# 🔥 Current streak: 12 days
# Total sessions: 42
# Completed: 40
# Dev tasks extracted: 58 GitHub issues created
```

Visit https://soulfra.com/blog/... to see published blog post!

---

## Advanced Usage

### Custom Brand Routing

```javascript
const router = new BrandVoiceContentRouter({ llmRouter });

// Suggest content adaptations for secondary brands
const adaptations = await router.suggestAdaptations(routing, narrative);

// adaptations.soulfra → {action: "publish", adaptation: "none", title: "...", content: "..."}
// adaptations.calriven → {action: "adapt_and_publish", adaptation: "tone_and_focus", title: "...", opening: "..."}
```

### Multi-Brand Cross-Posting

```javascript
const publisher = new CrossPlatformAutoPublisher({...});

// Publish to primary + all secondary brands
const results = await publisher.publishMultiBrand({
  narrative,
  routing,
  platforms: ['mastodon', 'blog']
});

// results.primary → Published to soulfra.com
// results.secondary → [calriven.com, calos.ai]
```

### Scheduled Publishing

```javascript
const futureDate = new Date('2025-10-23T09:00:00Z');

const results = await publisher.publish({
  narrative,
  routing: routing.routing,
  platforms: ['mastodon', 'blog'],
  schedule: futureDate  // Publish later
});

// results.scheduled → {mastodon: {publicationId: "...", scheduledFor: "2025-10-23T09:00:00Z"}}
```

### Test Publication (Dry Run)

```javascript
const testResult = await publisher.testPublish({
  narrative,
  routing: routing.routing,
  platforms: ['mastodon', 'blog', 'twitter']
});

// testResult.platforms → {mastodon: {enabled: true, wouldPublish: true}, ...}
// testResult.contentPreview → {mastodon: {title: "...", characterCount: 245}, ...}
```

---

## Cost Estimate

### OpenAI Whisper API
- **$0.006 per minute**
- 60-min recording = ~$0.36
- Daily journaling (20 min/day) = ~$3.60/month

### LLM Processing (Anthropic)
- **$3 per million input tokens, $15 per million output tokens**
- ~10k tokens per session (narrative + extraction + routing)
- Daily journaling = ~$0.50/month

### GitHub API
- **Free** for public repos

### Publishing Platforms
- **Mastodon** - Free (self-hosted or use existing server)
- **Blog** - Free (self-hosted)
- **Twitter/X** - Free (basic tier)
- **YouTube** - Free
- **Newsletter** - Free (< 1k subscribers on most platforms)
- **Podcast** - Free (RSS feed)

**Total: ~$5/month for daily journaling** 🎉

---

## Security Notes

- ✅ Database uses parameterized queries
- ✅ API keys loaded from environment variables
- ✅ File paths validated
- ✅ Quest system prevents duplicate rewards
- ✅ Event logs stored in database (audit trail)
- ⚠️ Transcripts saved unencrypted (consider encryption for sensitive content)
- ⚠️ Published content is public by default (configure platform privacy settings if needed)

---

## Troubleshooting

### "Voice journal orchestrator not initialized"

**Solution:** Ensure the server is fully started and the orchestrator is registered in `router.js`:

```javascript
const voiceJournalRoutes = require('./routes/voice-journal-routes');
const DailyVoiceJournalOrchestrator = require('./lib/daily-voice-journal-orchestrator');

const voiceOrchestrator = new DailyVoiceJournalOrchestrator({
  db,
  llmRouter,
  questEngine,
  recordingOrchestrator
});

app.use('/api/voice-journal', voiceJournalRoutes);
voiceJournalRoutes.initOrchestrator(voiceOrchestrator);
```

### "Platform not enabled"

**Solution:** Check platform status:

```bash
npm run journal:platforms
```

If a platform shows `✗`, configure the required client in the orchestrator options.

### "Transcription failed"

**Solution:** Ensure `OPENAI_API_KEY` is set and valid:

```bash
echo $OPENAI_API_KEY  # Should show sk-...
```

### "GitHub issue creation failed"

**Solution:** Ensure `GITHUB_TOKEN` is set and has `repo` scope:

```bash
echo $GITHUB_TOKEN  # Should show ghp_...
```

---

## Summary

You now have a **complete daily voice journaling system** where you can:

1. **Talk daily** (like it's your job)
2. **Ramble freely** about ideas, dev work, math, products
3. **Get coherent narratives** automatically
4. **Extract actionable work** (GitHub issues, LaTeX notes, product ideas)
5. **Route to brand domains** (soulfra, deathtodata, calriven, etc.)
6. **Auto-publish everywhere** (Mastodon, blog, Twitter, YouTube, newsletter, podcast)
7. **Track daily streaks** with quest rewards

**All with a single command:** `npm run journal`

No more manual transcription. No more scattered notes. Just talk and let the system handle the rest! 🎙️🤖

---

## Files Created

- `lib/voice-narrative-builder.js` - Transform rambling into narratives
- `lib/voice-idea-extractor.js` - Extract actionable work
- `lib/brand-voice-content-router.js` - Route to brand domains
- `lib/cross-platform-auto-publisher.js` - Publish everywhere
- `lib/daily-voice-journal-orchestrator.js` - Orchestrate the whole system
- `routes/voice-journal-routes.js` - API endpoints
- `database/migrations/143_daily_voice_journal.sql` - Database schema
- `scripts/start-daily-journal.js` - Interactive CLI

---

**Built with CalRiven AI - Talk daily, build daily, publish daily! 🎉**
