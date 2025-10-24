# 🎙️ CalRiven's Autonomous Recording Mission

**Turn your phone recording into an autonomous quest with auto-transcription, GitHub repos, and gamified progress tracking.**

---

## The Problem You Solved

You were drowning in 103+ database migrations and wanted to explain CALOS in your own voice instead of writing more docs. Now CalRiven can **autonomously detect, transcribe, and publish** your phone recordings.

---

## What This Does

CalRiven's autonomous recording mission system:

1. **✅ Monitors** your file system for new audio recordings
2. **🎧 Detects** CALOS walkthrough recordings automatically
3. **📝 Transcribes** via OpenAI Whisper API
4. **📦 Generates** GitHub repositories (optional)
5. **🎮 Tracks** progress through the quest system
6. **🏆 Claims** rewards when complete
7. **📊 Logs** everything to Mission Control dashboard

---

## Quick Start

### 1. Prerequisites

```bash
# Set OpenAI API key (for transcription)
export OPENAI_API_KEY=sk-...

# Optional: Set GitHub token (for repo generation)
export GITHUB_TOKEN=ghp_...

# Run migration
npm run migrate
```

### 2. Start CalRiven's Autonomous Mission

```bash
# Start the autonomous monitoring
npm run mission:recording
```

**CalRiven will now:**
- ✅ Scan `~/Downloads`, `~/Desktop`, and `/tmp` every 30 seconds
- ✅ Detect files matching patterns like `calos-walkthrough-*.m4a`
- ✅ Wait for recording to finish (checks file size stability)
- ✅ Auto-transcribe via Whisper API
- ✅ Save transcript to `.md` file
- ✅ Update quest progress
- ✅ Generate GitHub repo (if enabled)
- ✅ Claim reward when complete

### 3. Record Your Walkthrough

```bash
# Generate the script first
npm run generate:walkthrough

# Open the script
open docs/WALKTHROUGH_SEQUENCE.md
```

**On your phone:**
1. Put in airplane mode
2. Open Voice Memos
3. Name recording: `calos-walkthrough-2025-10-22.m4a`
4. Hit record
5. Follow the script
6. Save when done
7. Transfer to `~/Downloads` or `~/Desktop`

**CalRiven detects it automatically within 30 seconds!**

---

## How It Works

### Architecture

```
Phone Recording (.m4a)
  ↓
File System (~/Downloads, ~/Desktop, /tmp)
  ↓
RecordingMissionOrchestrator (scans every 30s)
  ↓
Detected! → Check if still recording (5s wait)
  ↓
Complete! → Extract metadata
  ↓
Transcribe via OpenAI Whisper API
  ↓
Save transcript to .md file
  ↓
Update quest progress in database
  ↓
Generate GitHub repo (optional)
  ↓
Complete quest → Claim reward
  ↓
Mission Control dashboard + WebSocket updates
```

### Quest System Integration

**Quest Slug:** `record-calos-walkthrough`

**Quest Milestones:**
1. `recording_detected` - File found
2. `transcription_complete` - Whisper API done
3. `github_repo_created` - Repo generated (optional)
4. `npm_package_created` - Package created (optional)
5. `quest_complete` - Reward claimed

**Rewards:**
- ✅ Unlock `auto_transcription` feature
- ✅ Unlock `walkthrough_publisher` app
- ✅ Unlock `audio_processor` app

---

## API Endpoints

### Start/Stop Mission

```bash
# Start mission for user
curl -X POST http://localhost:5001/api/recording-mission/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "default_user"}'

# Stop mission
curl -X POST http://localhost:5001/api/recording-mission/stop

# Get status
curl http://localhost:5001/api/recording-mission/status | jq
```

### View Recordings

```bash
# Scan for all audio files
curl http://localhost:5001/api/explorer/recordings | jq

# Example response:
{
  "success": true,
  "recordings": [
    {
      "filename": "calos-walkthrough-2025-10-22.m4a",
      "path": "/Users/you/Downloads/calos-walkthrough-2025-10-22.m4a",
      "size": 52428800,
      "sizeFormatted": "50.0 MB",
      "estimatedDurationMinutes": 50,
      "modified": "2025-10-22T14:30:00.000Z",
      "looksLikeWalkthrough": true,
      "location": "Downloads"
    }
  ],
  "total": 1,
  "walkthroughCandidates": 1
}
```

### View Sessions

```bash
# Get all recording sessions
curl http://localhost:5001/api/recording-mission/sessions?userId=default_user | jq

# Get specific session details
curl http://localhost:5001/api/recording-mission/sessions/SESSION_UUID | jq

# View active missions
curl http://localhost:5001/api/recording-mission/active | jq

# View mission logs
curl http://localhost:5001/api/recording-mission/logs | jq
```

### Quest Status

```bash
# Check quest status
curl http://localhost:5001/api/recording-mission/quest-status?userId=default_user | jq
```

---

## Database Schema

### `recording_sessions` table

Tracks all recording attempts:

```sql
CREATE TABLE recording_sessions (
  session_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  quest_id INTEGER REFERENCES quests(quest_id),

  -- Recording details
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  estimated_duration_minutes INTEGER,

  -- Processing status
  status TEXT DEFAULT 'detected', -- detected, transcribing, transcribed, complete, error
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  transcription_started_at TIMESTAMPTZ,
  transcription_completed_at TIMESTAMPTZ,

  -- Transcription results
  transcription_text TEXT,
  transcription_duration_seconds INTEGER,
  transcription_path TEXT,

  -- Artifacts
  github_repo_url TEXT,
  npm_package_name TEXT,

  -- Metadata
  milestones JSONB DEFAULT '[]'::jsonb
);
```

### `recording_mission_logs` table

CalRiven's autonomous action logs:

```sql
CREATE TABLE recording_mission_logs (
  log_id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES recording_sessions(session_id),
  user_id TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB,
  message TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `active_recording_missions` view

Dashboard view:

```sql
CREATE VIEW active_recording_missions AS
SELECT
  rs.session_id,
  rs.user_id,
  rs.file_name,
  rs.status,
  q.quest_name,
  uqp.status as quest_status,
  rs.transcription_completed_at IS NOT NULL as transcription_complete,
  rs.github_repo_url IS NOT NULL as github_repo_created
FROM recording_sessions rs
LEFT JOIN quests q ON rs.quest_id = q.quest_id
LEFT JOIN user_quest_progress uqp ON uqp.quest_id = q.quest_id
WHERE rs.status != 'complete'
ORDER BY rs.detected_at DESC;
```

---

## Configuration

### Environment Variables

```bash
# Required for transcription
OPENAI_API_KEY=sk-...

# Optional for GitHub repo generation
GITHUB_TOKEN=ghp_...

# Database connection
DATABASE_URL=postgresql://localhost/calos
```

### Orchestrator Config

```javascript
const config = {
  // Recording detection
  scanInterval: 30000, // 30 seconds
  recordingPaths: [
    '~/Downloads',
    '~/Desktop',
    '/tmp'
  ],

  // Features
  enableTranscription: true,  // Requires OPENAI_API_KEY
  enableGitHubRepo: false,    // Requires GITHUB_TOKEN
  enableNpmPackage: false,    // Not implemented yet

  // Logging
  logToConsole: true,
  logToVault: false
};
```

---

## Event System

The orchestrator emits events you can listen to:

```javascript
orchestrator.on('mission:started', ({ userId }) => {
  console.log(`Mission started for ${userId}`);
});

orchestrator.on('recording:detected', ({ filePath, size }) => {
  console.log(`New recording: ${filePath} (${size} bytes)`);
});

orchestrator.on('transcription:complete', ({ filePath, transcription }) => {
  console.log(`Transcribed: ${transcription.path}`);
});

orchestrator.on('github:created', ({ repo }) => {
  console.log(`GitHub repo: ${repo.url}`);
});

orchestrator.on('quest:completed', ({ userId, questSlug, reward }) => {
  console.log(`Quest complete! Reward:`, reward);
});

orchestrator.on('recording:error', ({ filePath, error }) => {
  console.error(`Error processing ${filePath}:`, error);
});
```

---

## Manual Processing

If CalRiven misses a recording, manually trigger processing:

```bash
curl -X POST http://localhost:5001/api/recording-mission/process-manual \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/Users/you/Downloads/calos-walkthrough.m4a",
    "userId": "default_user"
  }'
```

---

## Transcription Output

Example transcript saved to `.md`:

```markdown
# CALOS Walkthrough Transcription

**Recorded:** 2025-10-22T14:30:00.000Z
**Duration:** 3600 seconds
**File:** calos-walkthrough-2025-10-22.m4a

---

Hey, I'm going to walk you through CALOS - the entire system I've built.

It's basically a quest-driven game platform where you unlock apps and features through invites, forum posts, and collaboration...

[Full transcription text here]

---

*Transcribed by CalRiven AI via OpenAI Whisper*
```

---

## GitHub Repo Generation (Optional)

If `enableGitHubRepo: true` and `GITHUB_TOKEN` is set:

**Repo name:** `calos-walkthrough-recording`

**Contains:**
- `README.md` - Overview
- `TRANSCRIPT.md` - Full transcription
- `WALKTHROUGH_SEQUENCE.md` - Original script
- `FEATURE_CARDS/` - Feature reference cards
- Video embedding instructions

---

## Troubleshooting

### "Orchestrator not initialized"
Run migration first: `npm run migrate`

### "Transcription failed"
Check `OPENAI_API_KEY`: `echo $OPENAI_API_KEY`

### "Recording not detected"
- Filename must contain keywords: `calos`, `walkthrough`, `recording`, `demo`, or `system`
- File must be in `~/Downloads`, `~/Desktop`, or `/tmp`
- Check scan manually: `npm run mission:recordings:scan`

### "Quest not found"
Run migration: `npm run migrate`
This creates the `record-calos-walkthrough` quest.

### "File still being written"
CalRiven waits 5 seconds and checks if file size changed. If recording is still active, it skips and tries next scan.

---

## NPM Scripts

```bash
# Start autonomous mission
npm run mission:recording

# Check mission status (requires jq)
npm run mission:recording:status

# Scan for recordings
npm run mission:recordings:scan

# Generate walkthrough script
npm run generate:walkthrough

# Run migration (creates quest)
npm run migrate
```

---

## Mission Control Dashboard

**Coming soon:** Real-time dashboard at `http://localhost:5001/recording-mission-dashboard.html`

Features:
- Live mission status
- Recording detection events
- Transcription progress
- Quest completion
- WebSocket updates

---

## What's Next

### Not Yet Implemented

- ❌ NPM package generation
- ❌ Mission Control dashboard UI
- ❌ CalRiven autonomous decision-making
- ❌ Chapter markers in transcript
- ❌ Automatic GitHub push

### Future Features

- Sync with screen recording
- Generate video chapters
- Auto-publish to YouTube
- AI-generated summary
- Multi-language transcription

---

## Example Workflow

```bash
# 1. Generate walkthrough script
npm run generate:walkthrough

# 2. Start CalRiven's mission
npm run mission:recording

# (CalRiven is now monitoring autonomously...)

# 3. Record on your phone
# - Name: calos-walkthrough-2025-10-22.m4a
# - Follow docs/WALKTHROUGH_SEQUENCE.md
# - Save when done

# 4. Transfer to ~/Downloads
# (CalRiven detects within 30s)

# 5. Wait for transcription
# (Check logs in terminal)

# 6. View transcript
cat ~/Downloads/calos-walkthrough-2025-10-22_transcript.md

# 7. Check quest status
npm run mission:recording:status

# 8. Quest complete! Reward claimed.
```

---

## Credits

Built with:
- **OpenAI Whisper** - Audio transcription
- **CALOS Quest Engine** - Gamification system
- **CalRiven AI** - Autonomous orchestration
- **Mission Control** - Real-time monitoring

---

**Now you can document CALOS in your own voice instead of writing migration #143! 🎙️**
