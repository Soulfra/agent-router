# Engineering Card Game System

**Teaching Gen Z developers through roasting bad code** 🔥

Transform engineering education into a collectible card game where students learn design patterns, anti-patterns, and architectural decisions by roasting real codebases.

## Vision

> "AI will need to know what type of things to build and people could clown them and talk shit with the design ideas that are stupid. We need culture again and we could tie it to all of the stuff."

This system combines:
- **Cards Against Humanity** mechanics (fill-in-the-blank prompts)
- **Pokemon/MTG** collectibles (rarity tiers, achievements)
- **CringeProof** voting (Based/Cringe community consensus)
- **Cal AI** generation (cards from real codebases)

## Quick Start

### 1. Generate Cards from Your Codebase

```bash
# Use Cal's slash command
/generate-cards

# Or run the demo script
./bin/generate-cards-demo

# Or use AI enhancement
./bin/generate-cards-demo --ai
```

### 2. API Endpoints

```bash
# Generate cards from a project
POST /api/cards/generate
{
  "projectPath": "/path/to/project",
  "packId": "my-codebase",
  "packName": "My Project Engineering Pack",
  "maxFiles": 30,
  "useAI": false
}

# Get all culture packs
GET /api/cards/packs

# Get specific pack
GET /api/cards/packs/anti-patterns

# Reload packs after adding new ones
POST /api/cards/packs/reload
```

### 3. Play the Game

1. **Open a pack** - Get 5 random cards based on rarity drop rates
2. **Read the prompt** - "Who thought ___ was a good idea?"
3. **Vote Based/Cringe/Mid** - Learn through community consensus
4. **Collect achievements** - Complete packs, find mythic cards
5. **Build your taste score** - ELO rating for voting accuracy

## Architecture

### Culture Packs (JSON)

Located in `data/culture-packs/`:

```json
{
  "packId": "anti-patterns",
  "name": "Anti-Patterns & Bad Decisions",
  "emoji": "🤡",
  "rarity": "mythic",
  "teachingTool": true,
  "controversial": true,
  "prompts": [
    "This code has ___",
    "Who thought ___ was a good idea?",
    "___ is a code smell"
  ],
  "responses": [
    "God object with 5000 lines",
    "nested callbacks 12 levels deep",
    "microservices for todo app",
    "testing in production"
  ]
}
```

### Rarity System

| Tier | Drop Rate | Emoji | Complexity |
|------|-----------|-------|------------|
| Common | 60% | ⚪ | Basic patterns |
| Rare | 25% | 🔵 | Moderate complexity |
| Epic | 10% | 🟣 | Advanced patterns |
| Legendary | 4% | 🟠 | Expert-level |
| Mythic | 1% | 🔴 | Ultra-rare anti-patterns |

### Existing Culture Packs

**Engineering Education:**
- `2000s-engineering.json` (☕ Legendary) - Java EE, SOAP, XML hell
- `2010s-engineering.json` (🚀 Rare) - Node.js, MongoDB web scale, Docker
- `2020s-engineering.json` (☸️ Epic) - Kubernetes, microservices, AI/LLMs
- `anti-patterns.json` (🤡 Mythic) - **Teaching tool** - Bad code to roast

**Culture Vibes:**
- `gen-z.json` - Brainrot, no cap fr fr, touch grass
- `old-internet.json` - Rickroll, MySpace Tom, lolcats
- `tech-bro.json` - Disruption, web3, startup cringe
- `anime.json` - Power of friendship, beach episodes
- `2000s-nostalgia.json` - Flip phones, Blockbuster, limewire

## Components

### 1. EngineeringCardGenerator (`lib/engineering-card-generator.js`)

Analyzes codebases and generates educational cards:

```javascript
const generator = new EngineeringCardGenerator({
  anthropic,           // AI enhancement
  cringeProofEngine,  // Rate decisions
  outputDir: './data/culture-packs'
});

// Scan project for patterns
const cards = await generator.generateFromCodebase('/path/to/project', {
  maxFiles: 30,
  includeTests: false
});

// Create culture pack
const pack = await generator.createCulturePack(cards, 'my-project', {
  name: 'My Project Pack',
  emoji: '🤖',
  teachingTool: true
});
```

**Detects:**
- ✅ Anti-patterns: God objects, nested callbacks, magic numbers
- ✅ Good patterns: Design patterns, type safety, error handling
- ✅ File size issues: 500+ line files
- ✅ Code smells: Hardcoded strings, TODO comments

**Assigns rarity** based on:
- Severity (high/medium/low)
- Frequency (how many found)
- Type (anti-pattern = rarer = teaching value)

### 2. CulturePackManager (`lib/culture-pack-manager.js`)

Loads and rotates culture packs:

```javascript
const manager = new CulturePackManager({ db });
await manager.loadPacks();

// Get active rotation (changes weekly)
const rotation = manager.getActiveRotation(); // ['2000s-nostalgia', 'anime', 'gen-z']

// Generate deck from specific packs
const deck = manager.generateDeck(['anti-patterns', '2020s-engineering'], {
  promptCopies: 2,
  responseCopies: 5
});
```

### 3. CardCollectionManager (`lib/card-collection-manager.js`)

Pokemon/MTG-style collectible system:

```javascript
const collection = new CardCollectionManager({
  db,
  culturePackManager
});

// Open a pack (5 cards with rarity-based drops)
const cards = await collection.openPack('user123', 'anti-patterns', 5);
// Returns: [
//   { prompt: "This code has ___", response: "God object with 5000 lines", rarity: "mythic", duplicate: false },
//   ...
// ]

// Get user's collection
const userCards = await collection.getCollection('user123', {
  packId: 'anti-patterns',
  rarity: 'mythic',
  sortBy: 'rarity'
});

// Check achievements
const achievements = await collection.getAchievements('user123');
// ['🎴 First Card', '🔴 Mythic Hunter', '🤡 Anti-Pattern Master']
```

**Achievements:**
- 🎴 First Card (1 card)
- 📚 Collector (10 cards)
- 🏆 Hoarder (50 cards)
- 💎 Completionist (100 cards)
- 🔴 Mythic Hunter (find a mythic)
- ☕ 2000s Master (complete 2000s pack)
- 🚀 2010s Master (complete 2010s pack)
- ☸️ 2020s Master (complete 2020s pack)
- 🤡 Anti-Pattern Master (complete anti-patterns pack)

### 4. CardRoastingEngine (`lib/card-roasting-engine.js`)

Teaching through roasting - vote on engineering decisions:

```javascript
const roaster = new CardRoastingEngine({
  db,
  cringeProofEngine,
  eloCalculator
});

// Submit vote
await roaster.submitVote('user123', cardId, 'cringe', 'This is a god object fr fr');

// Get consensus
const consensus = await roaster.calculateConsensus(cardId);
// {
//   verdict: 'cringe',
//   confidence: 0.87,  // 87% agreement
//   votes: { based: 2, cringe: 15, mid: 1 },
//   cringeProofScore: 85,
//   expert_consensus: 'cringe'
// }

// Get educational explanation
const explanation = await roaster.getEducationalExplanation(cardId);
// "This is a god object - a class that knows/does too much. It violates
//  Single Responsibility Principle and becomes a maintenance nightmare..."
```

**Features:**
- 🔥 **Based** - Good pattern, industry standard
- 💀 **Cringe** - Bad pattern, avoid this
- 😐 **Mid** - Context-dependent, sometimes OK

**Taste Score (ELO):**
- Starts at 1200
- Increases when you vote with expert consensus
- Decreases when you vote against experts
- 1500+ = Expert level (your votes influence consensus)

**Card Burning:**
- When 70%+ vote "cringe", card gets "burned"
- Marked as community-approved teaching example
- Used for future educational content

## Cal AI Integration

Cal can now generate cards from any codebase:

```bash
# Use the slash command
/generate-cards

# Cal will:
1. Scan the current project
2. Detect patterns and anti-patterns
3. Generate prompts and responses
4. Assign rarity based on complexity
5. Create culture pack JSON file
6. Reload packs into the game
```

**Example Cal workflow:**

```
User: "Generate cards from this codebase"
Cal: "Analyzing agent-router codebase..."
     - Found 12 anti-patterns
     - Found 8 good patterns
     - Created 20 cards (3 mythic, 5 legendary, 7 epic, 5 rare)
     - Pack ID: generated-1737669600
     - Saved to data/culture-packs/generated-1737669600.json
     - Reloaded culture packs (9 packs now available)
```

## Database Schema

### Collections
```sql
CREATE TABLE card_collection (
  user_id VARCHAR(255),
  card_id VARCHAR(32),     -- Hash of packId:prompt:response
  pack_id VARCHAR(100),
  rarity VARCHAR(20),      -- common, rare, epic, legendary, mythic
  prompt TEXT,
  response TEXT,
  count INTEGER,           -- Duplicates owned
  first_awarded TIMESTAMP,
  UNIQUE(user_id, card_id)
);
```

### Roasting/Voting
```sql
CREATE TABLE card_roast_votes (
  user_id VARCHAR(255),
  card_id VARCHAR(32),
  vote_type VARCHAR(20),   -- based, cringe, mid
  roast_comment TEXT,
  UNIQUE(user_id, card_id)
);

CREATE TABLE user_taste_scores (
  user_id VARCHAR(255),
  taste_score INTEGER,     -- ELO rating
  votes_cast INTEGER,
  correct_votes INTEGER,   -- Matching expert consensus
);
```

## Usage Examples

### Teaching Anti-Patterns

**Student plays card:**
```
Prompt: "This code has ___"
Response: "nested callbacks 12 levels deep"
Rarity: Mythic 🔴
Pack: Anti-Patterns 🤡
```

**Students vote:**
- 15 vote "Cringe" 💀
- 2 vote "Mid" 😐
- 87% consensus = **CRINGE**

**AI explains:**
> "Callback hell (nested callbacks 12+ levels) makes code unreadable and unmaintainable.
> Modern async/await syntax solves this. This pattern was common in 2010s Node.js but
> is now considered a major anti-pattern."

**Card gets burned** - marked as teaching example ✓

**Student's taste score:**
- Voted "Cringe" ✓ (matched expert consensus)
- Taste score: 1200 → 1216 (+16)

### Collecting & Achievements

```bash
# User opens 10 packs
- Total cards: 50
- Unique cards: 32
- Duplicates: 18
- Mythic: 1 (god object)
- Legendary: 3 (SOAP, XML config, EJB)
- Epic: 8
- Rare: 12
- Common: 8

# Achievements unlocked:
🎴 First Card
📚 Collector (10+ cards)
🔴 Mythic Hunter (found mythic)

# Taste score: 1247 (36 votes, 72% accuracy)
# Rank: #142 on leaderboard
```

## File Structure

```
agent-router/
  data/culture-packs/          ← Culture pack JSON files
    anti-patterns.json         ← 🤡 Teaching pack (mythic)
    2000s-engineering.json     ← ☕ Legendary
    2010s-engineering.json     ← 🚀 Rare
    2020s-engineering.json     ← ☸️ Epic
    gen-z.json
    anime.json
    ...

  lib/
    engineering-card-generator.js  ← Generate cards from code
    culture-pack-manager.js        ← Load/rotate packs
    card-collection-manager.js     ← Pokemon/MTG collectibles
    card-roasting-engine.js        ← Based/Cringe voting

  bin/
    generate-cards-demo            ← Demo script

  .claude/commands/
    generate-cards.md              ← Cal slash command

  scripts/migrations/
    011-card-collection-system.sql
    012-card-roasting-system.sql
```

## API Routes

```
POST   /api/cards/generate              Generate cards from codebase
GET    /api/cards/packs                 List all culture packs
GET    /api/cards/packs/:packId         Get specific pack
POST   /api/cards/packs/reload          Reload packs from disk

POST   /api/cards/collection/open       Open a pack (get 5 random cards)
GET    /api/cards/collection/:userId    Get user's collection
GET    /api/cards/achievements/:userId  Get achievements

POST   /api/cards/roast/vote            Vote Based/Cringe/Mid
GET    /api/cards/roast/consensus/:id   Get voting consensus
GET    /api/cards/roast/leaderboard     Taste score leaderboard
GET    /api/cards/roast/top             Funniest roast comments
```

## Future Features

- [ ] **Print-on-demand** - Export cards to PNG/PDF for physical printing
- [ ] **Trading** - Gift/trade cards with other players
- [ ] **Custom packs** - Users create their own culture packs
- [ ] **Tournament mode** - Compete in roasting tournaments
- [ ] **Streamer integration** - Twitch overlay for live roasting
- [ ] **Discord bot** - Play via Discord commands
- [ ] **Mobile app** - Native iOS/Android experience
- [ ] **NFT integration** - Blockchain collectibles (maybe?)

## Philosophy

> "Teaching Gen Z through memes, culture, and roasting. Because boring docs don't work anymore."

This system turns engineering education into:
- **Gamification** - Collect cards, earn achievements, climb leaderboards
- **Social learning** - Community consensus teaches taste
- **Real examples** - Cards from actual codebases, not textbooks
- **AI-enhanced** - Cal generates content, explains patterns
- **Culture-first** - Gen Z slang, anime references, dev humor

Instead of:
> "Chapter 12: Design Patterns - The Singleton Pattern ensures only one instance..."

You get:
> **Card drawn:** "This uses ___ when you should ___"
> **Response:** "Singleton pattern / Dependency injection"
> **Roast:** "Singletons are just global state with extra steps fr fr"
> **Consensus:** 78% Cringe 💀
> **Learn:** Why DI > Singletons in modern architecture

---

**Built with 🔥 by CALOS**

*Roast bad code. Collect mythics. Learn engineering.*
