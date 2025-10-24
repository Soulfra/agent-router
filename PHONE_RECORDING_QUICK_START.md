# 📱 Phone Recording Quick Start

**You're tired of 103+ migration files. Let's just record how CALOS actually works.**

---

## The Problem

- You have 103 database migrations (with duplicates!)
- Numbers jump around (001 → 083 → 100 → 140 → 141)
- Nobody can understand the system from SQL files
- You just want to explain how it all works

## The Solution

**Record a phone walkthrough** - your voice, your way, edit out the white noise later.

---

## 3 Steps to Start Recording

### 1. Generate Walkthrough Docs (30 seconds)

```bash
npm run generate:walkthrough
```

This creates:
- ✅ `docs/WALKTHROUGH_SEQUENCE.md` - What to say (60-75 min script)
- ✅ `docs/FEATURE_CARDS/` - Quick refs for each feature (10 cards)
- ✅ `RECORDING_CHECKLIST.md` - Pre-flight checks

### 2. Setup Environment (2 minutes)

```bash
# Terminal 1: Start Ollama (local AI)
npm run ollama:start

# Terminal 2: Start CALOS server
npm start

# Wait 10 seconds, then open browser
open http://localhost:5001
```

**Verify it's working:**
- Go to http://localhost:5001 (should load)
- Go to http://localhost:5001/game-launcher (quest system)
- Go to http://localhost:5001/bot-builder-dashboard (bot platform)

### 3. Hit Record (60-75 minutes)

1. **Phone setup:**
   - Put phone in **airplane mode** (no interruptions!)
   - Open Voice Memos app
   - Place phone 6-12 inches from your mouth
   - Test recording: "testing 1 2 3" (play back to check)

2. **Open the script:**
   - Open `docs/WALKTHROUGH_SEQUENCE.md` on your computer
   - Keep it visible while recording

3. **Hit record and go:**
   - Follow the script (loosely, not rigidly)
   - Show the features in your browser
   - Explain in your own words
   - If you mess up, just pause and restart that sentence
   - **You can edit out mistakes later!**

---

## What to Say (Segment Breakdown)

Your walkthrough covers **10 major features**:

1. **Quest System** (10 min) - Game mechanics, DND Master, unlock apps through quests
2. **Room Mascots** (8 min) - Per-chat AI personalities (like podcast filters!)
3. **Self-Hosted Bot Platform** (10 min) - Create bots with CLI, zero cloud costs
4. **Invite System & Circles** (8 min) - Viral growth, sphere targeting
5. **Forum & Lore** (7 min) - Discussion quests, quality scoring
6. **Multiplayer Portals** (8 min) - Pokémon-style collaboration
7. **Network Radar & Monitoring** (6 min) - Real-time traffic viz
8. **Gmail Relay** (5 min) - Zero-cost email alternative
9. **CalRiven AI (CTO)** (7 min) - Autonomous AI executive
10. **Pricing & Licensing** (5 min) - Business model

**Total:** ~75 minutes

Each segment in `docs/WALKTHROUGH_SEQUENCE.md` has:
- ✅ What to say (talking points)
- ✅ What to show (URLs to open)
- ✅ Commands to run
- ✅ Files to reference

---

## Recording Tips

### DO:
- ✅ Be yourself (natural > perfect)
- ✅ Show, don't just tell (demo the features)
- ✅ Explain WHY it matters, not just WHAT it does
- ✅ Pause between segments (easier to edit)
- ✅ Keep going if you mess up (edit later)

### DON'T:
- ❌ Touch/move phone during recording
- ❌ Worry about being perfect
- ❌ Stop recording for small mistakes
- ❌ Read the script word-for-word (use as guide)

### Audio Quality:
- Put phone in **airplane mode** (prevent interruptions)
- Quiet room (close windows, turn off fans)
- 6-12 inches from mouth
- Consistent volume
- Avoid paper rustling, keyboard clicks

---

## After Recording

### 1. Save & Backup
```bash
# On phone: Save recording as "calos-walkthrough-2025-10-22.m4a"
# Transfer to computer
# Make backup copy
```

### 2. Edit (Optional but Recommended)

**Basic Editing (30-60 min):**
- Use **Audacity** (free) or **iMovie**
- Remove white noise: Effect > Noise Reduction
- Cut out long pauses/mistakes
- Normalize audio levels

**Advanced Editing (2-3 hours):**
- Sync with screen recording
- Add chapter markers
- Create separate clips per feature
- Add intro/outro

### 3. Share
- Upload to YouTube/Vimeo/Google Drive
- Share link in docs or README
- Way better than 103 migration files!

---

## Example Recording Opening

> "Hey, I'm going to walk you through CALOS - the entire system I've built.
>
> It's basically a quest-driven game platform where you unlock apps and features through invites, forum posts, and collaboration.
>
> I have like 103 database migrations now which is insane, so instead of trying to explain all that SQL, I'm just going to show you how it actually works.
>
> Let's start with the quest system..."

[Opens http://localhost:5001/game-launcher]

> "So this is the game launcher. You can see I have a few quests here.
>
> This one says 'Build Your Circle' - invite 5 friends and you unlock Pro tier for 30 days.
>
> There's a DND Master AI that narrates the whole journey. Watch this..."

[Shows DND Master narrative]

> "See? It says 'Your circle begins to form... 3/5 invited.' It's like having a dungeon master guide you through the platform.
>
> Now let me show you room mascots - these are like podcast filters..."

---

## Quick Checklist

Before you hit record, check:

- [ ] `npm run ollama:start` running
- [ ] `npm start` running
- [ ] Browser open to localhost:5001
- [ ] Phone in airplane mode
- [ ] Voice memo app ready
- [ ] `docs/WALKTHROUGH_SEQUENCE.md` open
- [ ] Quiet room
- [ ] Water nearby (stay hydrated!)

**Ready? Hit record and follow `docs/WALKTHROUGH_SEQUENCE.md`!**

---

## Why This Works

**Instead of:**
- ❌ 103 confusing SQL migration files
- ❌ Scattered documentation
- ❌ "Just read the code"

**You get:**
- ✅ Your voice explaining the system
- ✅ Live demonstration of features
- ✅ The journey, not just the code
- ✅ Easy to understand
- ✅ Easy to update (just re-record segments)

**Phone mics are amazing now** (iPhone/Android) - the quality will be great, and you can edit out white noise easily with free tools.

---

## Need Help?

- **Walkthrough script:** `docs/WALKTHROUGH_SEQUENCE.md`
- **Feature quick refs:** `docs/FEATURE_CARDS/`
- **Recording checklist:** `RECORDING_CHECKLIST.md`
- **Regenerate anytime:** `npm run generate:walkthrough`

---

**Just hit record and explain CALOS in your own words. Way better than migration files!** 🎙️

---

## 🤖 NEW: CalRiven's Autonomous Recording Mission

Instead of manually processing your recording, let CalRiven handle it autonomously!

### Quick Setup

```bash
# 1. Set OpenAI API key (for transcription)
export OPENAI_API_KEY=sk-...

# 2. Run migration (creates quest)
npm run migrate

# 3. Start CalRiven's autonomous mission
npm run mission:recording
```

**CalRiven now monitors your file system and automatically:**
- ✅ Detects new recordings (scans `~/Downloads`, `~/Desktop`, `/tmp` every 30s)
- ✅ Waits for recording to finish
- ✅ Transcribes via OpenAI Whisper API
- ✅ Saves transcript to `.md` file
- ✅ Updates quest progress
- ✅ Generates GitHub repo (optional, set `GITHUB_TOKEN`)
- ✅ Claims rewards when complete

### Usage

1. **Name your recording** with keywords like `calos-walkthrough-2025-10-22.m4a`
2. **Save to `~/Downloads` or `~/Desktop`**
3. **CalRiven detects it automatically within 30 seconds!**
4. **View transcript** in same directory: `*_transcript.md`

### Check Status

```bash
# View mission status
npm run mission:recording:status

# Scan for recordings
npm run mission:recordings:scan

# View quest progress
curl http://localhost:5001/api/recording-mission/quest-status?userId=default_user | jq
```

### Full Documentation

See `RECORDING_MISSION.md` for complete API docs, database schema, event system, and troubleshooting.

**Now your phone recording becomes a gamified autonomous quest with auto-transcription!** 🎮
