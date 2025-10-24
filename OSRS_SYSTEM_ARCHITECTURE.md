# OSRS Integration + Identity System Architecture

## Created Files (This Session)

### Grand Exchange & OSRS Integration
1. ✅ **lib/osrs-wiki-client.js** (650 lines)
   - MediaWiki API wrapper for OSRS Wiki
   - Item/monster/quest lookups
   - **Grand Exchange Prices**: `getAllLatestPrices()`, `get5MinutePrices()`, `get1HourPrices()`, `getTimeseries()`
   - Caching with TTL
   - Rate limiting (60 req/min)

2. ✅ **lib/ge-price-fetcher.js** (460 lines)
   - Bulk price updates (all ~3700 items)
   - Price change detection & alerts
   - Watch list management
   - Database storage for historical data
   - Auto-updates every 60 seconds

3. ✅ **lib/runelite-integration.js** (600 lines)
   - Connect to RuneLite HTTP API + WebSocket
   - Event capture (XP, loot, level-ups, deaths, kills)
   - Clipworthy detection (rare drops, boss kills)
   - Player state tracking
   - Session statistics

4. ✅ **lib/ai-research-assistant.js** (700 lines)
   - Ollama-powered research (local LLM)
   - Auto-research game events
   - OSRS Wiki integration
   - Multiple output formats (overlay, chat, voice)
   - GitHub context storage

### Chat & Logging
5. ✅ **lib/runelite-chat-logger.js** (750 lines)
   - Unix-style chat logs: `[2025-10-23 14:32:45] <user@github> message`
   - Daily/weekly/monthly rotation
   - Full-text search
   - Export to CSV/JSON/Markdown
   - grep-compatible log files

### Identity & Database
6. ✅ **lib/github-identity-resolver.js** (450 lines)
   - **Auto-detect from git config**: `Soulfra`, `211064529+Soulfra@users.noreply.github.com`
   - Link GitHub → database users
   - Link GitHub → RuneLite accounts
   - Repo context tracking

7. ✅ **database/migrations/059_add_github_runelite_system.sql** (300 lines)
   - `github_identities` - Link GitHub → users
   - `runelite_accounts` - Link GitHub → OSRS
   - `chat_messages` - Unix logs with full-text search
   - `user_activities` - XP, loot, kills, deaths
   - `ge_prices` - Historical price data
   - `game_sessions` - Session tracking
   - `dev_meme_events` - Track :q, vim exits, console.log
   - `dev_meme_stats` - Pre-aggregated meme counts
   - Triggers for auto-incrementing stats

---

## Architecture Overview

### Current Git Identity
```
User: Soulfra
Email: 211064529+Soulfra@users.noreply.github.com
Repo: https://github.com/Soulfra/agent-router.git
Branch: main
```

### Identity Hierarchy (Planned)
```
Matthew Mauer (real person)
  └── Soulfra (GitHub)
      ├── Signed by: RoughSparks (authority)
      └── Persona: Cal Mauer
          └── Calriven (separate - selling AgentZero)
```

### Domain Empire
```
calos.ai         → Platform
soulfra.com      → Universe/Metaverse
hollowtown.com   → Community Hub / RSPS Listing (planned)
deathtodata.com  → Data Liberation / Privacy
roughsparks.com  → Authority / Signing
vibecoding.com   → Developer Brand
```

### System Flow
```
RuneLite (game client)
    ↓
GitHub Identity (Soulfra from git config)
    ↓
Database (users, github_identities, runelite_accounts)
    ↓
Chat Logger (Unix-style logs)
    ↓
Activity Tracking (XP, loot, kills)
    ↓
GE Price Fetcher (real-time prices)
    ↓
AI Research Assistant (Ollama + Wiki)
    ↓
Dev Meme Tracker (:q, vim exits, etc.)
```

---

## Database Schema (Migration 059)

### GitHub → Users
```sql
github_identities (
  id, user_id, github_username, github_email,
  github_user_id, access_token, is_primary
)
```

### GitHub → RuneLite
```sql
runelite_accounts (
  id, github_identity_id, runelite_username,
  display_name, is_active
)
```

### Chat Logs
```sql
chat_messages (
  id, github_username, runelite_username,
  message, chat_type, timestamp, session_id, metadata
)
-- Full-text search index on message
```

### User Activities
```sql
user_activities (
  id, github_username, runelite_username,
  activity_type, activity_data, timestamp,
  session_id, clipworthy
)
-- Types: xp_gain, loot, kill, death, level_up, quest_complete
```

### GE Prices
```sql
ge_prices (
  id, item_id, item_name,
  high_price, low_price, volume, timestamp
)
```

### Sessions
```sql
game_sessions (
  id, github_username, runelite_username,
  start_time, end_time, duration_seconds,
  total_xp, total_loot_value, chat_count,
  activity_count, clipworthy_count
)
```

### Developer Memes
```sql
dev_meme_events (
  id, github_username, meme_type, context,
  severity, timestamp
)
-- Types: vim_exit, force_push, console_log, npm_install, semicolon

dev_meme_stats (
  github_username, vim_exits, force_pushes,
  console_logs, npm_installs, total_memes, last_meme_at
)
-- Auto-incremented via trigger
```

---

## API Endpoints (Planned)

### Identity
- `GET /api/identity/current` - Get current GitHub identity from git config
- `POST /api/identity/link-runelite` - Link RuneLite account
- `GET /api/identity/hierarchy` - Get identity chain

### Chat
- `GET /api/chat/history?startDate&endDate&username` - Search chat logs
- `GET /api/chat/export?format=csv|json|md` - Export logs
- `GET /api/chat/mine` - Current user's chat history

### Prices
- `GET /api/prices/latest` - All latest GE prices
- `GET /api/prices/item/:id` - Single item price
- `GET /api/prices/timeseries/:id?timestep=1h` - Historical data
- `GET /api/prices/movers` - Top price movers

### Activity
- `GET /api/activity/user/:username` - User's activity timeline
- `GET /api/activity/session/:id` - Session details
- `GET /api/activity/clipworthy` - Clipworthy moments

### Memes
- `GET /api/memes/stats/:username` - User's meme stats
- `GET /api/memes/leaderboard` - Top meme producers
- `POST /api/memes/track` - Track a meme event

---

## Log File Structure

```
logs/
  chat/
    2025-10-23.log        # Daily chat logs
    2025-10-24.log
  archive/
    2025-10.log.gz        # Monthly compressed
  metadata/
    stats.json            # Chat statistics
```

### Log Format
```
[2025-10-23 14:32:45] <Soulfra@github> just got 99 agility!
[2025-10-23 14:33:12] <user456@github> [clan] gz!!
[2025-10-23 14:33:45] * Soulfra@github leveled up Agility
```

### Search with grep
```bash
grep "Soulfra" logs/chat/*.log
grep "99" logs/chat/*.log | grep -i "agility"
grep ":q" logs/chat/*.log  # Find vim exit memes
```

---

## Python Automation (Planned)

### Triggers
```python
# scripts/user_login.py
def on_user_login(user_id, github_username, runelite_username):
    # Initialize session
    # Load user preferences
    # Start GE price tracking
    # Connect to RuneLite WebSocket

# scripts/user_reset.py
def on_user_reset(user_id):
    # Clear session data
    # Archive old logs
    # Reset preferences
```

### Integration
```javascript
// In identity-bridge.js
const pythonRunner = require('./python-automation-runner');

// On login
await pythonRunner.run('scripts/user_login.py', {
  userId: user.id,
  githubUsername: identity.githubUsername,
  runeliteUsername: runeliteAccount.runelite_username
});
```

---

## RuneScape Guild System (Planned)

### Features
- **Developer Tier**: GitHub contributors
- **Player Tier**: Active OSRS players
- **Clan Battles**: Weekly events
- **Reputation System**: Based on code contributions + gameplay
- **Custom RSPS**: Build own private server
- **Community Hub**: HollowTown.com listing site

### Integration
```
GitHub → Developer Tier
  └── Code contributions tracked
  └── Chat participation logged
  └── Dev memes counted (:q attempts, etc.)

RuneLite → Player Tier
  └── XP gains tracked
  └── Rare drops = reputation boost
  └── Clan battle participation

Combined → Guild Reputation
  └── Publishing pipeline (turn activities into content)
  └── Soulbound NFTs for achievements
  └── Time-optimized badge minting
```

---

## Next Steps

### Phase 1: Identity Bridge (In Progress)
1. ✅ GitHub identity resolver
2. ✅ Database migration
3. ⏳ Identity bridge (central service)
4. ⏳ Dev meme tracker

### Phase 2: Community Guild
1. Community guild system
2. HollowTown.com hub
3. RSPS integration
4. Clan battle system

### Phase 3: Python Automation
1. Python runner service
2. Login/reset triggers
3. Event-driven scripts
4. Session management

### Phase 4: Production
1. Quiet mode → production transition
2. Domain routing (hollowtown.com, etc.)
3. Multi-tenant support
4. AgentZero packaging

---

## Developer Humor Integration

### Tracked Memes
- `:q`, `:wq`, `:x` - Vim exit attempts
- `git push --force` - Force push warnings
- `console.log('here')` - Debug logging
- `npm install` - Dependency jokes
- Missing semicolons
- Merge conflicts
- `rm -rf /` close calls

### Stats Dashboard
```json
{
  "Soulfra": {
    "vim_exits": 12,
    "force_pushes": 3,
    "console_logs": 156,
    "npm_installs": 89,
    "badges": ["Vim Survivor", "Console.log Master"]
  }
}
```

---

## Environment Files

```
.env               - Main config
.env.soulfra       - SoulFra domain config
.env.calriven      - Calriven domain config
.env.vibecoding    - VibeCoding brand config
.env.perplexity    - Perplexity API config
```

---

## Questions Answered

### Q: How do we know which GitHub account we're logged in as?
**A:** `github-identity-resolver.js` auto-detects from `git config --get user.name` and `git config --get user.email`

### Q: How does this connect to our database/extensions?
**A:** Migration 059 creates tables that link GitHub → users → RuneLite → chat → activities

### Q: What about hollowtown.com and deathtodata.com?
**A:**
- HollowTown = Community hub / RSPS listing site (like RULOCUS)
- DeathToData = Data liberation / privacy-focused identity

### Q: How does the chat bot work with the router?
**A:** RuneLite events → GitHub identity → Chat logger → Database → API routes → Publishing

### Q: What's the hierarchy?
**A:** Matthew Mauer → Soulfra (GitHub) → signed by RoughSparks → Cal Mauer persona → Calriven (selling AgentZero)

### Q: Is this quiet/fatal mode?
**A:** Yes, currently in testing mode (`start-quiet.js`). Need to transition to production.

---

## Total Lines of Code Created

~4,000 lines across 7 files:
- 650: OSRS Wiki client
- 460: GE price fetcher
- 600: RuneLite integration
- 700: AI research assistant
- 750: Chat logger
- 450: GitHub identity resolver
- 300: Database migration

**Status:** Foundation complete. Ready for identity bridge + guild system.
