# CalOS Split License Structure

**Different parts, different licenses. Keep your game engine private.**

## Philosophy

Not everything needs to be public. CalOS uses a split licensing strategy:

- 🔒 **Core Game Engine** - PRIVATE (not on GitHub)
- 🆓 **Public API** - MIT (free to use)
- 🎨 **Game Assets** - CC BY-NC (attribution, non-commercial)
- 📚 **SDK/Libraries** - MIT (already done)
- 📖 **Documentation** - CC BY-SA (share-alike)
- 🖥️ **Server Code** - AGPLv3 (copyleft, network use)

This gives you:
- Privacy for your core IP (game engine)
- Freedom for users (MIT API)
- Protection against commercial exploitation (CC BY-NC assets)
- Copyleft for server code (AGPLv3)

## License Breakdown

### 1. Core Game Engine (PRIVATE)

**Location:** NOT ON GITHUB
- `lib/game-engine-2d.js` (if kept private)
- `lib/rpg-engine.js` (if kept private)
- Game logic, physics, rendering core

**License:** PRIVATE / Proprietary

**Why:** Your core IP. Don't give away the secret sauce.

**Alternatives:**
- Keep it completely private
- OR use Godot/Unity/Phaser (existing engines)
- OR publish under AGPLv3 (copyleft)

**Current Status:** Not created yet, decision pending

---

### 2. Public API (MIT)

**Location:** `lib/api/`, `routes/`, SDKs
- `routes/agent-routes.js`
- `routes/card-routes.js`
- `routes/rpg-routes.js`
- Client SDKs (JavaScript, Python)

**License:** MIT

**Why:** Make it easy for users to integrate. No barriers.

**Permissions:**
- ✅ Use commercially
- ✅ Modify and redistribute
- ✅ Private forks
- ✅ No attribution required (but appreciated)

**Example:**
```javascript
// MIT License - Use freely
const CalOSAPI = require('@calos/sdk');

const client = new CalOSAPI('your-api-key');
await client.cards.openPack('anti-patterns');
```

---

### 3. Game Assets (CC BY-NC 4.0)

**Location:** `public/assets/`, `data/culture-packs/`
- Card pack JSON files
- Sprites, images, sounds
- Culture pack content
- Achievement icons

**License:** Creative Commons Attribution-NonCommercial 4.0

**Why:** Share freely, but prevent commercial exploitation.

**Permissions:**
- ✅ Use for personal projects
- ✅ Remix and adapt
- ✅ Attribution required
- ❌ NO commercial use

**Example:**
```json
// data/culture-packs/anti-patterns.json
// © 2025 CALOS
// CC BY-NC 4.0 License
{
  "packId": "anti-patterns",
  "name": "Anti-Patterns & Bad Decisions",
  "responses": ["God object with 5000 lines", ...]
}
```

---

### 4. SDK/Libraries (MIT)

**Location:** `lib/` (public utilities)
- `lib/gmail-gateway.js`
- `lib/culture-pack-manager.js`
- `lib/qr-generator.js`
- `lib/rate-limiter.js`

**License:** MIT (already done)

**Why:** Encourage ecosystem growth.

**Current Status:** ✅ Already MIT licensed

---

### 5. Documentation (CC BY-SA 4.0)

**Location:** `docs/`, `README.md`, `.claude/CLAUDE.md`
- `docs/MCP-SERVER.md`
- `docs/ENGINEERING-CARD-GAME.md`
- `docs/GMAIL_WEBHOOK_TUTORIAL.md`
- All README files

**License:** Creative Commons Attribution-ShareAlike 4.0

**Why:** Knowledge should be free and shareable.

**Permissions:**
- ✅ Use freely
- ✅ Remix and adapt
- ✅ Commercial use OK
- ✅ Must share under same license
- ✅ Attribution required

---

### 6. Server Code (AGPLv3)

**Location:** `server.js`, `router.js`, backend services
- `server.js`
- `router.js`
- `lib/agent-selector.js`
- `lib/database-router.js`
- `lib/mcp-server/` (MCP server implementation)

**License:** AGPLv3 (already done)

**Why:** Network copyleft - if you run it as a service, you must share source.

**Permissions:**
- ✅ Use freely
- ✅ Modify
- ✅ Commercial use OK
- ⚠️ MUST share modifications if running as service
- ⚠️ MUST credit original authors

**Current Status:** ✅ Already AGPLv3 licensed

---

## File-by-File Mapping

### PRIVATE (Keep Off GitHub)
```
lib/game-engine-2d.js          → PRIVATE (core engine)
lib/rpg-engine.js              → PRIVATE (game logic)
```

### MIT License
```
lib/api/                       → MIT
routes/                        → MIT
lib/gmail-gateway.js           → MIT
lib/culture-pack-manager.js    → MIT
lib/qr-generator.js            → MIT
lib/rate-limiter.js            → MIT
sdk/                           → MIT
```

### CC BY-NC 4.0 (Assets)
```
data/culture-packs/*.json      → CC BY-NC 4.0
public/assets/                 → CC BY-NC 4.0
public/sprites/                → CC BY-NC 4.0
public/sounds/                 → CC BY-NC 4.0
```

### CC BY-SA 4.0 (Docs)
```
docs/                          → CC BY-SA 4.0
README.md                      → CC BY-SA 4.0
.claude/CLAUDE.md              → CC BY-SA 4.0
schema/README.md               → CC BY-SA 4.0
```

### AGPLv3 (Server)
```
server.js                      → AGPLv3
router.js                      → AGPLv3
lib/agent-selector.js          → AGPLv3
lib/database-router.js         → AGPLv3
lib/mcp-server/                → AGPLv3
migrations/                    → AGPLv3
```

---

## How to Apply Licenses

### 1. Private Files (Keep Off GitHub)

**Action:** Don't commit to GitHub. Keep in separate repo or local only.

```bash
# Add to .gitignore
echo "lib/game-engine-2d.js" >> .gitignore
echo "lib/rpg-engine.js" >> .gitignore
```

### 2. MIT Files (Public API)

Add header to each file:

```javascript
/**
 * CalOS Public API
 *
 * MIT License
 * Copyright (c) 2025 CALOS
 *
 * Permission is hereby granted, free of charge...
 * See LICENSE-MIT for full license text.
 */
```

### 3. CC BY-NC Files (Assets)

Add header to JSON files:

```json
{
  "_license": "CC BY-NC 4.0",
  "_copyright": "© 2025 CALOS",
  "_attribution": "https://github.com/calos/agent-router",
  "packId": "anti-patterns",
  ...
}
```

### 4. AGPLv3 Files (Server)

Add header to each file:

```javascript
/**
 * CalOS Agent Router
 *
 * AGPLv3 License
 * Copyright (c) 2025 CALOS
 *
 * This program is free software: you can redistribute it and/or modify...
 * See LICENSE for full license text.
 */
```

---

## FAQs

### Why split licenses?

**Answer:** Different parts serve different purposes:
- Core engine = your IP (keep private)
- API = encourage adoption (MIT)
- Assets = prevent commercial exploitation (CC BY-NC)
- Server = copyleft for service providers (AGPLv3)
- Docs = free knowledge (CC BY-SA)

### Can I use a different game engine?

**Answer:** Yes! Options:
- **Godot** (MIT) - Open source, 2D/3D
- **Unity** (proprietary) - Commercial license
- **Phaser** (MIT) - HTML5 game framework
- **LÖVE** (Zlib) - Lua game engine
- **Custom** (your choice) - Keep private or open source

### Can I change licenses later?

**Answer:** Mostly yes:
- ✅ Can make private code public
- ✅ Can relicense your own code
- ❌ Can't revoke existing licenses (MIT, CC, AGPLv3)
- ❌ Can't relicense contributions from others without permission

### What if someone violates the license?

**Answer:**
- **MIT/CC:** Attribution violations - ask nicely, usually resolved
- **CC BY-NC:** Commercial use - send cease & desist
- **AGPLv3:** Not sharing source - legal action (last resort)

### Do I need a lawyer?

**Answer:** For basic setup, no. For commercial licensing or enforcement, yes.

---

## Recommended Setup

### Option 1: Maximum Privacy
```
Core Engine:    PRIVATE (not on GitHub)
API:            MIT
Assets:         CC BY-NC
Server:         AGPLv3
Docs:           CC BY-SA
```

### Option 2: Open Source Everything
```
Core Engine:    AGPLv3 or MIT
API:            MIT
Assets:         CC BY-NC
Server:         AGPLv3
Docs:           CC BY-SA
```

### Option 3: Use Existing Engine
```
Core Engine:    Godot (MIT) or Phaser (MIT)
API:            MIT
Assets:         CC BY-NC
Server:         AGPLv3
Docs:           CC BY-SA
```

---

## License Files

Create these files:

- `LICENSE` - AGPLv3 (server code, already exists)
- `LICENSE-MIT` - MIT (API, SDK)
- `LICENSE-CC-BY-NC` - CC BY-NC 4.0 (assets)
- `LICENSE-CC-BY-SA` - CC BY-SA 4.0 (docs)
- `LICENSE-SPLIT.md` - This file (explains structure)

---

## Current Status

- ✅ `LICENSE` (AGPLv3) - Exists
- ✅ SDK already MIT licensed
- ⏳ Need to create `LICENSE-MIT`
- ⏳ Need to create `LICENSE-CC-BY-NC`
- ⏳ Need to create `LICENSE-CC-BY-SA`
- ⏳ Need to add license headers to files
- ⏳ Need to decide: Keep game engine private or use Godot/Phaser?

---

**Built with 🔥 by CALOS**

*Different parts, different licenses. Own your IP.*
