# CalOS Lesson System

**Interactive, beginner-friendly lessons teaching all CalOS systems**

Zero dependencies • Privacy-first • Gamified learning

## Overview

The CalOS Lesson System is a comprehensive tutorial platform that teaches developers how to use all the systems we've built:

- **Privacy-First MCP Servers** - Build your own Model Context Protocol servers
- **RPG/Card Game Systems** - Gamification, collectibles, achievements
- **Zero-Dependency Architecture** - Build without npm dependencies
- **Multi-Tier Systems** - OSS + paid tiers, BYOK, billing

## Lesson Tracks

### 1. Privacy-First MCP Development (8 lessons, 940 XP)

Learn to build privacy-first MCP servers from scratch.

| # | Title | XP | Lab |
|---|-------|-----|-----|
| 1 | Introduction to CalOS MCP Servers | 100 | `./bin/mcp-server` |
| 2 | Using MCP Client with Fetch | 120 | `/labs/mcp-client.html` |
| 3 | Building Your First MCP Tool | 130 | Add custom tool |
| 4 | RPG Integration - Award XP | 120 | Award XP via MCP |
| 5 | File System Tools | 110 | Note-taking app |
| 6 | Code Analysis Tools | 120 | Code search UI |
| 7 | Privacy & Security | 130 | Security audit |
| 8 | Deploy Your Own MCP Server | 110 | Production setup |

**Learning Path:** `mcp-development`
**Location:** `docs/lessons/mcp-development/`
**Labs:** `public/labs/mcp-*.html`

### 2. RPG/Card Game Development (10 lessons, 1,250 XP)

Build gamified learning experiences.

| # | Title | XP | Lab |
|---|-------|-----|-----|
| 1 | Understanding the Card Game System | 100 | Open card pack |
| 2 | Fetch API Basics | 110 | Call API endpoints |
| 3 | Opening Card Packs | 120 | Pack opening UI |
| 4 | Card Collection UI | 130 | Collection viewer |
| 5 | Roasting System - Vote on Code | 140 | Code roasting UI |
| 6 | RPG Player Progression | 120 | Player stats dashboard |
| 7 | Quest System | 130 | Quest tracker |
| 8 | Achievements & Badges | 120 | Achievement showcase |
| 9 | Leaderboards | 130 | Leaderboard UI |
| 10 | Final Project - Full Game Loop | 150 | Complete game |

**Learning Path:** `rpg-card-game`
**Location:** `docs/lessons/rpg-card-game/`
**Labs:** `public/labs/cards-*.html`

### 3. Zero-Dependency Architecture (6 lessons, 720 XP)

Learn to build without external dependencies.

| # | Title | XP | Lab |
|---|-------|-----|-----|
| 1 | Understanding CalOS Schema | 100 | Validate data |
| 2 | Privacy-First Data Handling | 130 | Field-level encryption |
| 3 | Split Licensing Strategy | 110 | License your project |
| 4 | Build Without npm Dependencies | 140 | Zero-dep component |
| 5 | Database Design | 120 | Design privacy-first table |
| 6 | Deployment Without Vendors | 120 | Self-hosted deploy |

**Learning Path:** `zero-dependency`
**Location:** `docs/lessons/zero-dependency/`
**Labs:** `public/labs/zero-dep-*.html`

### 4. Multi-Tier System (7 lessons, 910 XP)

Understand OSS + paid tier architecture.

| # | Title | XP | Lab |
|---|-------|-----|-----|
| 1 | Understanding the Tier System | 100 | Check user tier |
| 2 | BYOK Implementation | 140 | Add BYOK key |
| 3 | Usage Tracking | 130 | Track usage |
| 4 | Billing Dashboard | 140 | Build billing UI |
| 5 | Rate Limiting | 120 | Rate limit UI |
| 6 | Multi-Project Management | 140 | Create project |
| 7 | Self-Service Portal | 140 | Self-service UI |

**Learning Path:** `multi-tier`
**Location:** `docs/lessons/multi-tier/`
**Labs:** `public/labs/billing-*.html`

## Total: 31 Lessons, 3,820 XP

## Lesson Structure

Each lesson includes:

### 1. Lesson File (Markdown)

```markdown
# Lesson Title

**Track:** Track Name
**Lesson:** X of Y
**XP Reward:** 100
**Time:** 20 minutes
**Prerequisites:** Previous lessons

## Learning Objectives
- ✅ Objective 1
- ✅ Objective 2

## Content
[Tutorial content with code samples]

## Lab
[Interactive exercise]

## Summary
[What you learned]

## Next Lesson
[Link to next]

## Quiz
[3-5 questions]

---

**🎴 Achievement Unlocked:** Name (+100 XP)
```

### 2. Interactive Lab (HTML)

Each lesson has a corresponding lab in `public/labs/`:
- **Runnable code** in browser
- **No setup required** (just open the HTML file)
- **Instant feedback**
- **Copy-paste examples**

### 3. API Integration

All lessons use existing CalOS APIs:
- `GET /api/mcp/tools` - List MCP tools
- `POST /api/mcp/call` - Call MCP tools
- `GET /api/cards/packs` - List card packs
- `POST /api/cards/collection/open` - Open pack
- `GET /api/rpg/player/:userId` - Get player stats
- `POST /api/rpg/award-xp` - Award XP

## How to Use

### For Students

1. **Browse lessons** at `/learning-dashboard.html`
2. **Pick a track** (MCP, RPG, Zero-Dep, Multi-Tier)
3. **Read the lesson** (markdown file)
4. **Complete the lab** (interactive HTML)
5. **Earn XP** and level up
6. **Unlock achievements**

### For Teachers/Cal

1. **Assign lessons** to users
2. **Track progress** via dashboard
3. **Award bonus XP** for completions
4. **Generate reports** on learner progress

## File Structure

```
agent-router/
  docs/lessons/
    mcp-development/
      lesson-1-intro-to-mcp.md
      lesson-2-mcp-client-fetch.md
      ...
    rpg-card-game/
      lesson-1-card-game-intro.md
      lesson-2-fetch-basics.md
      ...
    zero-dependency/
      lesson-1-calos-schema.md
      ...
    multi-tier/
      lesson-1-tier-system.md
      ...

  public/labs/
    mcp-client.html
    card-opener.html
    rpg-dashboard.html
    privacy-checker.html
    billing-ui.html
    ...

  docs/
    LESSON-SYSTEM.md            ← This file
```

## Integration with Existing Systems

### 1. Learning Platform

Add new tracks to `scripts/seed-learning-paths.js`:

```javascript
{
  domain: 'calos.com',
  pathSlug: 'mcp-development',
  pathName: 'Privacy-First MCP Development',
  description: 'Build privacy-first Model Context Protocol servers',
  iconEmoji: '🔧',
  lessons: [
    { title: 'Introduction to CalOS MCP Servers', xpReward: 100 },
    { title: 'Using MCP Client with Fetch', xpReward: 120 },
    // ... 6 more lessons
  ]
}
```

### 2. RPG System

XP is awarded automatically via:
- `POST /api/rpg/award-xp`
- MCP tool: `rpg_award_xp`
- Lesson completion triggers

### 3. Card Game System

Lessons integrate with existing card system:
- Open packs as rewards
- Unlock special cards
- Complete card-based quests

### 4. Usage Tracking

All lab interactions tracked via:
- `POST /api/usage/track`
- Privacy-first (hashed IPs/fingerprints)
- BYOK vs system key usage

## Lab Examples

### MCP Client Lab

Location: `public/labs/mcp-client.html`

Features:
- **Server status** checker
- **Quick actions** (health, tools, read file, player stats)
- **Custom tool call** form
- **Live output** display

### Card Opener Lab

Location: `public/labs/card-opener.html` (to be created)

Features:
- **Pack selection** (anti-patterns, 2000s, 2010s, 2020s)
- **Pack opening animation**
- **Rarity display** (common → mythic)
- **Collection tracker**

### RPG Dashboard Lab

Location: `public/labs/rpg-dashboard.html` (to be created)

Features:
- **Player stats** (level, XP, achievements)
- **XP award form**
- **Quest tracker**
- **Leaderboard**

### Privacy Checker Lab

Location: `public/labs/privacy-checker.html` (to be created)

Features:
- **Schema validator** (CalOS schema)
- **PII detector** (find unencrypted sensitive data)
- **Encryption tester**
- **Privacy score**

## Gamification

### XP System

- **Lesson completion:** 100-150 XP
- **Lab completion:** +20% bonus
- **Quiz perfect score:** +10% bonus
- **Helping others:** +50 XP
- **Creating custom tools:** +200 XP

### Achievements

- 🎴 **First Lesson** - Complete first lesson (any track)
- 🔧 **MCP Master** - Complete all MCP lessons
- 🎮 **Game Dev** - Complete all RPG lessons
- 🔒 **Privacy Advocate** - Complete all Zero-Dep lessons
- 💰 **Business Builder** - Complete all Multi-Tier lessons
- 🏆 **CalOS University Graduate** - Complete all 31 lessons

### Leaderboards

- **Total XP** - Lifetime learning points
- **Lessons completed** - Number of lessons
- **Fastest learner** - Time to complete track
- **Helper rank** - XP from helping others

## API Endpoints

### Lesson Progress

```
GET  /api/learning/paths/:pathSlug
POST /api/learning/enroll
POST /api/learning/complete-lesson
GET  /api/learning/progress/:userId
```

### Labs

```
GET  /labs/mcp-client.html
GET  /labs/card-opener.html
GET  /labs/rpg-dashboard.html
GET  /labs/privacy-checker.html
GET  /labs/billing-ui.html
```

### RPG Integration

```
GET  /api/rpg/player/:userId
POST /api/rpg/award-xp
GET  /api/rpg/achievements/:userId
GET  /api/rpg/leaderboard
```

## Development Roadmap

### Phase 1: MCP Development Track (Completed)
- ✅ Lesson 1: Intro to MCP
- ✅ Lesson 2: MCP Client with Fetch
- ✅ Lab: MCP Client
- ⏳ Lessons 3-8

### Phase 2: RPG/Card Game Track
- ⏳ Lesson 1: Card Game Intro
- ⏳ Lesson 2: Fetch Basics
- ⏳ Lab: Card Opener
- ⏳ Lab: RPG Dashboard
- ⏳ Lessons 3-10

### Phase 3: Zero-Dependency Track
- ⏳ Lesson 1: CalOS Schema
- ⏳ Lab: Privacy Checker
- ⏳ Lessons 2-6

### Phase 4: Multi-Tier Track
- ⏳ Lesson 1: Tier System
- ⏳ Lab: Billing UI
- ⏳ Lessons 2-7

### Phase 5: Integration
- ⏳ Update seed script
- ⏳ Add to learning dashboard
- ⏳ Create achievement badges
- ⏳ Build leaderboard UI

## Philosophy

### Beginner-Friendly
- Start with basic `fetch()`
- Build complexity gradually
- No assumptions about prior knowledge
- Lots of copy-paste examples

### Privacy-First
- Teach encryption/hashing
- Emphasize zero telemetry
- Show local-only patterns
- Explain BYOK benefits

### Gamified
- XP for every lesson
- Achievements unlock
- Leaderboard competition
- Card pack rewards

### Zero Dependencies
- Vanilla JavaScript only
- No frameworks (React, Vue, etc.)
- Pure CSS (no Tailwind)
- Built-in browser APIs

### Real-World
- Uses actual CalOS systems
- Production-ready code
- Best practices throughout
- Industry-standard patterns

---

**Built with 🔥 by CALOS**

*Interactive learning. Zero dependencies. Privacy-first.*
