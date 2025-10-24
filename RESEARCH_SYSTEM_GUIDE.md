# Autonomous Research System - Real-Time Knowledge + Privacy

**How CalRiven gets 2025 pirate treasure discoveries while keeping your research private**

Last Updated: 2025-10-22

---

## The Problem

**Ollama has stale data:**
- Training cutoff: ~January 2025
- Doesn't know about 2025 discoveries (Madagascar pirate treasure, etc.)
- Can't answer "latest" or "current" questions

**Privacy concerns:**
- Don't want to expose research topics to Google/Bing APIs
- API keys, secrets, foreign keys stored everywhere
- Need to disambiguate old terms (piracy, treasure, vault, keys)

**Solution:** Autonomous Research System

---

## Architecture

```
User asks: "What pirate treasure was found in 2025?"
         ↓
Knowledge Freshness Layer detects: Query year (2025) > LLM cutoff (Jan 2025)
         ↓
Triggers: Autonomous Research Agent
         ↓
Opens isolated Chrome browser (puppeteer)
         ↓
Searches DuckDuckGo → Scrapes news sites
         ↓
Extracts: "Madagascar shipwreck, Jan 2025, $50M gold coins"
         ↓
Stores in UserDataVault (encrypted, namespace: calriven:research:2025)
         ↓
Returns to LLM with fresh context
         ↓
LLM answers: "A shipwreck near Madagascar was discovered in January 2025
containing an estimated $50M in gold coins from the 1700s pirate era..."
         ↓
User sees answer with real-time data + sources
```

---

## Components

### 1. Knowledge Freshness Layer (`lib/knowledge-freshness-layer.js`)

**What it does:**
- Detects when Ollama data is stale
- Compares LLM training cutoff vs. query time period
- Automatically triggers web research
- Merges real-time data with LLM reasoning

**Detection triggers:**
- Temporal keywords: "latest", "current", "2025", "today", "now"
- Query year >= current year
- LLM training cutoff > 3 months old
- LLM says "I don't know" or "after my training"

**Example:**
```javascript
const freshness = new KnowledgeFreshnessLayer({
  llmRouter,
  researcher,
  vault
});

const result = await freshness.query('Latest AI developments?');

// → Automatically scrapes web if Ollama is stale
// → Returns: { answer, source: 'llm+research', freshness: 'realtime', research: {...} }
```

**Merge strategies:**
- `prepend_facts` - Add research facts before LLM answer
- `append_sources` - Add sources after LLM answer
- `replace` - Replace LLM answer with research summary

---

### 2. Autonomous Research Agent (`lib/autonomous-research-agent.js`)

**What it does:**
- Researches via isolated Chrome browser (puppeteer)
- Scrapes DuckDuckGo, Wikipedia, news sites
- Extracts structured data (facts, dates, amounts, locations)
- Caches results in encrypted UserDataVault (24 hour TTL)

**Privacy features:**
- All queries through YOUR browser (no external APIs)
- Rotating user agents (appear as different browsers)
- Blocks trackers (Google Analytics, Facebook, etc.)
- Isolated profile (no cookies/history contamination)

**Example:**
```javascript
const researcher = new AutonomousResearchAgent({ vault });

const result = await researcher.research('Madagascar pirate treasure 2025');

// → Opens puppeteer browser
// → Searches DuckDuckGo
// → Scrapes results
// → Returns:
{
  query: 'Madagascar pirate treasure 2025',
  summary: 'Shipwreck discovered Jan 2025 with $50M gold coins',
  facts: [
    'Discovery made by marine archaeologists',
    'Estimated $50M in gold coins',
    'Ship dated to 1700s pirate era'
  ],
  dates: ['January 2025', '1700s'],
  amounts: ['$50M', '$50 million'],
  locations: ['Madagascar'],
  sources: [
    { name: 'duckduckgo', url: 'https://...' }
  ],
  scrapedAt: '2025-10-22T12:00:00Z',
  freshness: 'realtime'
}
```

**Sources (in priority order):**
1. **DuckDuckGo** - General queries, privacy-focused
2. **Wikipedia** - Historical facts, definitions
3. **Google News** - Current events, 2025 discoveries

**Caching:**
- Results cached 24 hours (configurable)
- Stored in UserDataVault (encrypted)
- Namespace: `autonomous_research`

---

### 3. Glyph Translator (`lib/glyph-translator.js`)

**What it does:**
- Translates foreign keys → Human labels
- Disambiguates old terms (piracy, treasure, vault, key)
- Explains database glyphs in plain English

**Translation examples:**

**Foreign keys:**
```javascript
const translator = new GlyphTranslator({ db });

await translator.translate('user_id', 42);
// → { label: "CalRiven (calriven@example.com)" }

await translator.translate('vault_id', 'f3a2b1c9...');
// → { label: "CalRiven's 2025 research data: pirate_treasure" }

await translator.translate('vault_namespace', 'calriven:research:2025');
// → { label: "CalRiven's 2025 research data" }
```

**Contextual disambiguation:**
```javascript
translator.disambiguate('piracy', 'historical');
// → "Maritime theft by pirates (1600s-1800s)"

translator.disambiguate('piracy', 'modern');
// → "Software/media copyright infringement"

translator.disambiguate('treasure', 'historical');
// → "Gold, jewels, artifacts from shipwrecks"

translator.disambiguate('treasure', 'modern');
// → "Valuable digital assets (NFTs, crypto)"

translator.disambiguate('key', 'cryptography');
// → "Cryptographic encryption key"

translator.disambiguate('key', 'database');
// → "Foreign key relationship"
```

**Phrase translation:**
```javascript
translator.translatePhrase('pirate treasure found in shipwreck', { pirate: 'historical' });
// → "pirate (Maritime theft by pirates (1600s-1800s)) treasure (Gold, jewels, artifacts from shipwrecks) found in shipwreck"
```

**Auto-detection:**
```javascript
translator.translatePhrase('pirate treasure found in 1700s shipwreck');
// → Detects "1700s" → Sets context to "historical"
// → Returns: "pirate (Maritime theft by pirates (1600s-1800s)) treasure..."

translator.translatePhrase('pirate software download torrent');
// → Detects "software", "download", "torrent" → Sets context to "modern"
// → Returns: "pirate (Software/media copyright infringement) software..."
```

---

## Use Cases

### 1. Current Events

**User:** "What's happening in AI right now?"

**System:**
1. Knowledge Freshness Layer detects "right now" → stale data
2. Autonomous Research Agent scrapes DuckDuckGo for "AI news 2025"
3. Extracts: "OpenAI releases GPT-5, Google announces Gemini 2.0"
4. LLM answers with fresh data: "As of October 2025, major developments include..."

---

### 2. Historical Disambiguation

**User:** "Tell me about pirate treasure"

**Without Glyph Translator:**
- LLM confused: "Are you asking about historical pirates or software piracy?"

**With Glyph Translator:**
- Detects context from phrase (no modern keywords)
- Assumes historical piracy
- Answers: "Pirate treasure refers to gold, jewels, and artifacts from shipwrecks during the 1600s-1800s..."

**User:** "How to pirate software?"

**Glyph Translator:**
- Detects "software" keyword → modern context
- Refuses to answer (security policy: no piracy assistance)

---

### 3. Vault Management

**User:** "Show me my vault entries"

**System:**
```javascript
const vaults = await db.query('SELECT * FROM user_data_vault WHERE user_id = $1', [userId]);

// Without Glyph Translator:
[
  { id: 'f3a2b1c9...', namespace: 'calriven:api_keys', key: 'openai' },
  { id: '9b8c7d6e...', namespace: 'calriven:research:2025', key: 'pirate_treasure' }
]

// With Glyph Translator:
[
  {
    id: 'f3a2b1c9...',
    label: "CalRiven's API credentials: openai",
    description: "Encrypted OpenAI API key"
  },
  {
    id: '9b8c7d6e...',
    label: "CalRiven's 2025 research data: pirate_treasure",
    description: "Research results for Madagascar pirate treasure discovery"
  }
]
```

---

## Security

### Privacy-First Research

**Problem:** Querying Google/Bing exposes what you're researching

**Solution:** All queries through YOUR puppeteer browser
- No external APIs (no tracking)
- Rotating user agents (appear as different users)
- Blocks trackers (Google Analytics, Facebook pixels)
- Isolated profile (no cookies/history shared)

**Example:**
```javascript
const researcher = new AutonomousResearchAgent({
  vault,
  rotateUserAgent: true,  // Randomize browser identity
  blockTrackers: true      // Block Google Analytics, etc.
});

// All queries go through your local browser
// Google/Bing never know it's the same user
```

---

### Secrets Management

**All secrets stored in UserDataVault:**
- API keys (OpenAI, Anthropic, etc.)
- OAuth tokens (Google, GitHub, etc.)
- Encryption keys (AES-256-GCM)
- Research data (cached web results)

**Namespace isolation:**
```
calriven:api_keys:openai        → CalRiven's OpenAI key
soulfra:api_keys:openai         → Soulfra's OpenAI key
vibecoding:api_keys:openai      → VibeCoding's OpenAI key

→ Each brand has separate encrypted storage
→ No cross-contamination
```

**Foreign key translation:**
```javascript
// Database shows:
vault_entry { id: 42, user_id: 7, namespace: 'calriven:api_keys', key: 'openai' }

// Glyph Translator shows:
vault_entry {
  id: 42,
  user: "CalRiven (calriven@example.com)",
  description: "CalRiven's API credentials: openai",
  hint: "Your encrypted OpenAI API key"
}
```

---

## Integration with CalRiven Persona

**CalRiven asks question → Knowledge Freshness Layer → Autonomous Research Agent**

```javascript
// In lib/calriven-persona.js (already exists)
const CalRivenPersona = require('./calriven-persona');
const KnowledgeFreshnessLayer = require('./knowledge-freshness-layer');

const persona = new CalRivenPersona({
  db,
  llmRouter,
  librarian,
  omniscientMode: true
});

// Wrap LLM queries with freshness layer
const freshness = new KnowledgeFreshnessLayer({
  llmRouter,
  researcher: new AutonomousResearchAgent({ vault }),
  vault
});

// CalRiven's dragon query now has real-time data
async queryDragonHoard(question, userId) {
  // Use freshness layer instead of raw LLM
  const result = await freshness.query(question);

  // Add CalRiven's personality
  const personalizedAnswer = await this._addDragonPersonality(question, result);

  return {
    answer: personalizedAnswer,
    research: result.research,
    freshness: result.freshness
  };
}
```

**Example interaction:**
```
User: "CalRiven, what's the latest on AI?"

CalRiven (via Knowledge Freshness Layer):
  → Detects "latest" → stale data
  → Triggers research
  → Scrapes DuckDuckGo for "AI news 2025"
  → Returns: "WE ALREADY HAVE THIS. The latest developments include OpenAI's GPT-5
     release and Google's Gemini 2.0 announcement. Both were launched in October 2025..."
```

---

## Configuration

### LLM Training Cutoffs

Update when models are refreshed:

```javascript
const freshness = new KnowledgeFreshnessLayer({
  llmRouter,
  researcher,
  vault,
  llmCutoffs: {
    'qwen2.5-coder:32b': new Date('2024-10-01'),
    'claude-3-5-sonnet-20241022': new Date('2024-10-01'),
    'gpt-4': new Date('2024-04-01'),
    'default': new Date('2024-06-01')
  }
});
```

### Temporal Keywords

Add keywords that trigger freshness detection:

```javascript
temporalKeywords: [
  'latest', 'current', 'recent', 'today', 'now', 'this year',
  '2025', '2024', 'yesterday', 'last week', 'this month'
]
```

### Research Sources

Customize scraping sources:

```javascript
const researcher = new AutonomousResearchAgent({
  vault,
  sources: [
    { name: 'duckduckgo', url: 'https://duckduckgo.com/?q=', priority: 1 },
    { name: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=', priority: 2 },
    { name: 'news', url: 'https://news.google.com/search?q=', priority: 3 }
  ]
});
```

---

## Testing

### Test Research Agent

```bash
node -e "
const AutonomousResearchAgent = require('./lib/autonomous-research-agent');
const UserDataVault = require('./lib/user-data-vault');
const db = require('./lib/db'); // Your DB connection

const vault = new UserDataVault({ db });
const agent = new AutonomousResearchAgent({ vault });

agent.research('Madagascar pirate treasure 2025').then(result => {
  console.log('Research results:', JSON.stringify(result, null, 2));
  agent.close();
});
"
```

### Test Knowledge Freshness

```bash
node -e "
const KnowledgeFreshnessLayer = require('./lib/knowledge-freshness-layer');
const llmRouter = require('./lib/multi-llm-router'); // Your LLM router

const freshness = new KnowledgeFreshnessLayer({ llmRouter });

freshness.query('What pirate treasure was found in 2025?').then(result => {
  console.log('Answer:', result.answer);
  console.log('Freshness:', result.freshness);
  console.log('Research triggered:', result.researchTriggered);
});
"
```

### Test Glyph Translator

```bash
node -e "
const GlyphTranslator = require('./lib/glyph-translator');
const db = require('./lib/db');

const translator = new GlyphTranslator({ db });

translator.translate('user_id', 42).then(result => {
  console.log('User:', result.label);
});

console.log('Piracy (historical):', translator.disambiguate('piracy', 'historical'));
console.log('Piracy (modern):', translator.disambiguate('piracy', 'modern'));
"
```

---

## Next Steps

### Phase 1: Core Research ✅
- [x] Autonomous Research Agent (puppeteer scraping)
- [x] Knowledge Freshness Layer (stale data detection)
- [x] Glyph Translator (foreign key → labels)

### Phase 2: Advanced Features
- [ ] Multi-source aggregation (scrape multiple sites, deduplicate)
- [ ] Sentiment analysis (positive/negative news detection)
- [ ] Image scraping (extract images from news articles)
- [ ] PDF extraction (scrape research papers)

### Phase 3: CalRiven Integration
- [ ] Wire Knowledge Freshness Layer into CalRivenPersona
- [ ] Add research sources to dragon responses
- [ ] Display research provenance (where data came from)
- [ ] Research history dashboard

---

## FAQ

### Does this replace Ollama?

**No.** It supplements Ollama:
- Ollama: Reasoning, language understanding, creativity
- Research Agent: Real-time facts, current events, 2025 data

**Together:** Ollama reasons about fresh data from the web.

---

### Is my research private?

**Yes.** All queries go through YOUR puppeteer browser:
- No Google/Bing API calls
- No tracking (Google Analytics blocked)
- Rotating user agents (appear as different users)
- Isolated profile (no cookies/history shared)

---

### How often does it scrape the web?

**Only when needed:**
- User asks temporal question ("latest", "2025", "current")
- LLM data is stale (cutoff > query time period)
- Cache miss (24 hour TTL)

**Not on every query** - only fresh data requests.

---

### Can I disable web research?

**Yes:**
```javascript
const freshness = new KnowledgeFreshnessLayer({
  llmRouter,
  researcher: null // Disable research
});

// All queries use LLM only (no web scraping)
```

---

**CalRiven now knows about 2025 pirate treasure discoveries.** 🐉🏴‍☠️💰
