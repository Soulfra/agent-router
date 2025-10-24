# 🎙️ CALOS System Walkthrough

**Total Duration:** 60-75 minutes
**Recording Method:** Phone audio + optional screen recording
**Edit Later:** Remove white noise, add timestamps

---

## Pre-Recording Checklist

Before you start recording:

1. **Start all services:**
   ```bash
   npm run ollama:start  # Start Ollama (local AI)
   npm start             # Start CALOS server
   ```

2. **Open browser tabs:**
   - http://localhost:5001 (main app)
   - http://localhost:5001/game-launcher (quest system)
   - http://localhost:5001/bot-builder-dashboard (bot platform)
   - http://localhost:5001/network-radar (monitoring)

3. **Audio setup:**
   - Phone on airplane mode (prevent interruptions)
   - Place phone 6-12 inches from mouth
   - Quiet room (minimal background noise)
   - Test recording first (say "testing 1 2 3")

4. **Have ready:**
   - This walkthrough doc open
   - Terminal window visible
   - Browser with localhost tabs

---

## Recording Segments

## Segment 0: Introduction (5 min)

**Start Time:** 00:00

**What to say:**

"Hey, I'm going to walk you through CALOS - the entire system I've built.

It's basically a quest-driven game platform where you unlock apps and features through invites, forum posts, and collaboration.

It sounds complicated but it's actually really intuitive once you see it.

I have like 101 database migrations now which is insane, so instead of trying to explain all that, I'm just going to show you how it actually works.

Let's dive in..."

**Show:** Main dashboard at http://localhost:5001

---

## Segment 1: Quest System (10 min)

**Start Time:** 05:00
**Category:** Game Platform

**What to say:**

- "Quest-driven platform - unlock apps through gameplay"
- "DND Master narrates your journey"
- "Invite quests, forum quests, collaboration quests"
- "Example: Invite 5 friends → unlock Pro tier"

**Show:**
- http://localhost:5001/game-launcher

**Commands to run:**
```bash
npm start
open http://localhost:5001/game-launcher
```

**Files to reference:**
- `lib/quest-engine.js`
- `lib/dungeon-master-ai.js`
- `database/migrations/141_quest_system.sql`

---

## Segment 2: Room Mascots (8 min)

**Start Time:** 15:00
**Category:** AI Personalities

**What to say:**

- "Each room has unique AI personality (like podcast filters)"
- "7 personality types: Meme, Creative, Technical, Zen, etc."
- "Meme bot: "bruh fr fr here's the fix 💀""
- "Zen bot: "Slow down, quality over speed...""
- "Custom mascots trained on room code via Ollama"

**Show:**
- http://localhost:5001/rooms

**Commands to run:**
```bash
npm run ollama:start
npm start
```

**Files to reference:**
- `lib/room-mascot-manager.js`
- `lib/room-manager.js`

---

## Segment 3: Self-Hosted Bot Platform (10 min)

**Start Time:** 23:00
**Category:** Bot Building

**What to say:**

- "100% self-hosted, zero cloud dependencies"
- "CLI wizard creates bots in 5 minutes"
- "Train custom personalities with local Ollama"
- "Meme bot personality (funny but functional)"
- "Zero API costs - everything runs locally"

**Show:**
- http://localhost:5001/bot-builder-dashboard

**Commands to run:**
```bash
npm run bot:create
npm run ollama:start
```

**Files to reference:**
- `lib/bot-builder.js`
- `lib/ollama-bot-trainer.js`
- `bin/bot-create`

---

## Segment 4: Invite System & Circles (8 min)

**Start Time:** 33:00
**Category:** Viral Growth

**What to say:**

- "Invite tree visualization (who invited whom)"
- "Sphere targeting - invite from college, company, interest groups"
- "Suggested circles: "Invite 47 more Stanford classmates""
- "Quest integration - invites unlock features"
- "Viral growth mechanics"

**Show:**
- http://localhost:5001/invites

**Files to reference:**
- `lib/invite-quest-tracker.js`
- `lib/affiliate-tracker.js`
- `database/migrations/063_family_tree_and_spheres.sql`

---

## Segment 5: Forum & Lore System (7 min)

**Start Time:** 41:00
**Category:** Community

**What to say:**

- "Forum participation unlocks features"
- "Quality scoring (upvotes + comments)"
- "Lore bot generates discussions (marked as bot content)"
- "Game lore drives organic conversations"
- "Quest progress through forum engagement"

**Show:**
- http://localhost:5001/forum

**Files to reference:**
- `lib/forum-quest-integration.js`
- `lib/lore-bot-generator.js`
- `database/migrations/100_game_lore_system.sql`

---

## Segment 6: Multiplayer Portals (8 min)

**Start Time:** 48:00
**Category:** Collaboration

**What to say:**

- "Pokémon-style multiplayer for bucket instances"
- "Real-time chat with WebSockets"
- "Bucket battles (PvP)"
- "Collaborative tasks"
- "Leaderboards and karma"

**Show:**
- http://localhost:5001/portals

**Files to reference:**
- `lib/multiplayer-portal-manager.js`
- `database/migrations/071_bucket_portfolio_integration.sql`

---

## Segment 7: Network Radar & Process Monitor (6 min)

**Start Time:** 56:00
**Category:** DevOps

**What to say:**

- "Real-time network traffic visualization"
- "Process monitoring dashboard"
- "Track connections, bandwidth, protocols"
- "Process CPU/memory stats"
- "CalRiven as CTO can auto-manage"

**Show:**
- http://localhost:5001/network-radar
- http://localhost:5001/process-monitor

**Commands to run:**
```bash
npm start
```

**Files to reference:**
- `lib/network-traffic-monitor.js`
- `lib/network-analytics.js`
- `lib/shell-process-manager.js`

---

## Segment 8: Gmail Relay (Zero Cost) (5 min)

**Start Time:** 62:00
**Category:** Email

**What to say:**

- "Free email relay - no Mailchimp/SendGrid"
- "Uses Gmail SMTP (500/day free)"
- "Google Sheets as database"
- "Double opt-in whitelist"
- "Zero cost alternative"

**Commands to run:**
```bash
npm run gmail:setup:free
npm run gmail:poll
```

**Files to reference:**
- `lib/gmail-relay-zero-cost.js`
- `lib/google-sheets-db-adapter.js`

---

## Segment 9: CalRiven AI (CTO/CEO) (7 min)

**Start Time:** 67:00
**Category:** AI Agent

**What to say:**

- "AI CTO/CEO with autonomous decision-making"
- "Company structure: you're owner, CalRiven is CTO"
- "Autonomous mode - auto-runs tasks"
- "Privacy-first (encrypted vault)"
- "Makes executive decisions within limits"

**Files to reference:**
- `lib/calriven-persona.js`
- `lib/company-structure.js`
- `lib/calriven-autonomous-mode.js`

---

## Segment 10: Pricing & Licensing (5 min)

**Start Time:** 74:00
**Category:** Business Model

**What to say:**

- "Development (localhost): $0 forever"
- "Community: $0 + share data OR contribute code"
- "Pro: $29/mo"
- "Self-Hosted: One-time $99 (unlimited)"
- "Quest unlocks - earn features through gameplay"

**Show:**
- http://localhost:5001/pricing-calculator

**Files to reference:**
- `lib/pricing-calculator.js`
- `lib/license-verifier.js`
- `database/migrations/082_pricing_system.sql`

---

## Segment 11: Wrap-Up (5 min)

**Start Time:** 79:00

**What to say:**

"So that's CALOS - a quest-driven platform where the game mechanics drive feature unlocks and viral growth.

Everything runs locally with Ollama, zero API costs, completely self-hosted if you want.

The quest system makes it engaging, the DND Master makes it fun, the room mascots make each space unique.

And all of this is built to grow organically through invite circles and forum engagement.

Hope this walkthrough helped you understand how it all fits together!"

**End recording.**

