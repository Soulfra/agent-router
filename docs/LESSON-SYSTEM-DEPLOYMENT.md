# CalOS Lesson System - Deployment Edition

Complete privacy-first learning platform with 33 interactive lessons, 20 labs, and achievement system.

## Overview

The CalOS Lesson System is a standalone, offline-capable learning platform built for GitHub Pages deployment. It features:

- **33 Interactive Lessons** across 4 learning tracks
- **20 Hands-On Labs** with live coding environments
- **Progress Tracking** via localStorage (no backend needed)
- **Achievement System** with XP and level progression
- **Offline Support** via Service Worker
- **Dark Theme** matching CalOS design language
- **Mobile Responsive** for learning on any device
- **Privacy-First** - zero telemetry, local-only storage

## Quick Start

### Development

```bash
# 1. Navigate to project
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# 2. Open lesson portal
open public/lessons/index.html

# Or start a local server
npx http-server public -p 8080
open http://localhost:8080/lessons/
```

### Deployment

```bash
# 1. Generate lessons.json
node scripts/generate-lessons-json.js

# 2. Commit and push
git add .
git commit -m "Update lessons"
git push origin main

# 3. GitHub Pages auto-deploys
# Site available at: https://lessons.calos.com
```

See [GITHUB-PAGES-DEPLOY.md](./GITHUB-PAGES-DEPLOY.md) for full deployment guide.

## Learning Tracks

### Track 1: Privacy-First MCP Development (9 lessons, 1020 XP)
### Track 2: RPG Card Game Development (10 lessons, 1320 XP)
### Track 3: Zero-Dependency Architecture (7 lessons, 920 XP)
### Track 4: Multi-Tier SaaS Platform (7 lessons, 950 XP)

Total: 33 lessons, 4,210 XP

See full documentation in LESSON-SYSTEM.md for complete details.

---

**Built with ❤️ by CalOS**
