# Multi-Model Reasoning Comparison System

**Compare how different AI models think, not just what they say**

Last Updated: 2025-10-22

---

## The Vision

Instead of asking "Which model is best?", ask:
- **"How does GPT-4 think differently than Claude?"**
- **"Which model prefers Wikipedia vs academic papers?"**
- **"Which model is overconfident vs cautious?"**
- **"Can we reverse-engineer their reasoning algorithms?"**

This system runs the same research query through 5+ models in parallel, then dissects their reasoning processes to expose their preferences, patterns, and biases.

---

## Architecture

```
User asks: "What pirate treasure was found in 2025?"
         ↓
Model Reasoning Comparator runs 5 models in parallel:
         ↓
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│   GPT-4     │  Claude 3.5 │  DeepSeek   │   Qwen 32B  │ Llama 3.1   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
         ↓              ↓              ↓              ↓              ↓
Each model triggers Knowledge Freshness Layer:
         ↓              ↓              ↓              ↓              ↓
Autonomous Research Agent scrapes web (DuckDuckGo, Wikipedia, news)
         ↓              ↓              ↓              ↓              ↓
Bias Detector analyzes sources (crowdfunding, conspiracy, political)
         ↓              ↓              ↓              ↓              ↓
Thought Process Logger captures every reasoning step
         ↓              ↓              ↓              ↓              ↓
Wayback Archive stores scraped pages for replay
         ↓
Reasoning Dissector analyzes HOW each model thinks:
         ↓
┌───────────────────────────────────────────────────────────────────┐
│ GPT-4:    Fast, mainstream sources, moderate hedging              │
│ Claude:   Thorough verification, academic focus, high confidence  │
│ DeepSeek: Analytical deep-dive, logic-heavy, extracts numbers     │
│ Qwen:     Training-limited, needs web search, quick conclusions   │
│ Llama:    Similar to Qwen, prefers Wikipedia                      │
└───────────────────────────────────────────────────────────────────┘
         ↓
Model Reasoning Comparator calculates:
- Consensus (5/5 agree = HIGH, 3/5 = MEDIUM)
- Best model (scored on confidence, sources, bias detection, speed)
- Preference tracking (what each model likes)
         ↓
User sees side-by-side comparison + reasoning transparency
```

---

## Components

### 1. Model Reasoning Comparator (`lib/model-reasoning-comparator.js`)

**What it does:**
- Sends same query to 5+ models in parallel
- Compares outputs: sources, facts, bias, confidence
- Calculates consensus (agreement score)
- Selects best model with explanation
- Tracks preferences (what each model likes)

**Example:**
```javascript
const comparator = new ModelReasoningComparator({
  llmRouter,
  logger: new ThoughtProcessLogger({ db, vault }),
  biasDetector: new BiasDetector(),
  vault,
  db
});

const comparison = await comparator.compareAll('What pirate treasure was found in 2025?', {
  researcher: new AutonomousResearchAgent({ vault }),
  cutoffDate: new Date('2024-10-01')
});

console.log('Best model:', comparison.bestModel.name);
console.log('Consensus:', comparison.consensus.consensusLevel); // HIGH, MEDIUM, LOW
console.log('Models compared:', comparison.models.length);
```

**Scoring System:**
- **Confidence** (+30 points max): Higher confidence = more points
- **Sources used** (+20 points max): 2+ sources = more verification
- **Bias detection** (+20 points): LOW bias = 20pts, HIGH bias = 0pts
- **Response time** (-10 to +10 points): Faster than average = more points
- **Reasoning pattern** (+10 points): Thorough verification = bonus

**Output:**
```javascript
{
  comparisonId: 42,
  query: 'What pirate treasure was found in 2025?',
  models: [
    {
      model: 'GPT-4',
      answer: 'A shipwreck near Madagascar...',
      research: { sources: [...], summary: '...' },
      biasAnalysis: { biasScore: 'LOW', warnings: [] },
      confidence: 0.85,
      reasoningPattern: 'verify-then-conclude',
      responseTime: 12543
    },
    // ... 4 more models
  ],
  analysis: {
    sourcePreferences: {
      'GPT-4': ['DuckDuckGo', 'Wikipedia'],
      'Claude 3.5': ['Wikipedia', 'Academic'],
      // ...
    },
    commonFacts: ['Discovered Jan 2025', 'Estimated $50M', 'Madagascar'],
    biasScores: { 'GPT-4': 'LOW', 'Claude 3.5': 'LOW', ... },
    reasoningPatterns: { 'GPT-4': 'verify-then-conclude', ... },
    averageResponseTime: 15234
  },
  consensus: {
    agreement: 0.8,
    majorityFacts: ['Discovered Jan 2025', 'Madagascar'],
    consensusLevel: 'HIGH'
  },
  bestModel: {
    name: 'Claude 3.5',
    score: 87.5,
    reason: 'high confidence, 3 sources verified, low bias detected, thorough verification',
    fullResult: { ... }
  },
  totalTime: 18532
}
```

---

### 2. Reasoning Dissector (`lib/reasoning-dissector.js`)

**What it does:**
- Analyzes HOW each model thinks (not just WHAT they say)
- Detects reasoning patterns (analytical, creative, cautious, confident)
- Tracks confidence calibration (overconfident vs hedging)
- Identifies source preferences (Wikipedia vs news vs academic)
- Measures fact extraction efficiency (facts per source)
- Builds reasoning fingerprints (unique patterns per model)

**Reasoning Patterns:**
- **`analytical-thorough`**: 3+ sources, 5+ facts, verify-then-conclude
- **`quick-conclusion`**: 1 source, fast response (<5s)
- **`creative-cautious`**: Creative language + hedging words
- **`confident-analytical`**: High confidence + thorough verification

**Confidence Styles:**
- **`overconfident`**: >90% confidence with no hedging
- **`hedging`**: <50% confidence or 3+ hedging words ("might", "could", "possibly")
- **`calibrated`**: 70-90% confidence with minimal hedging
- **`uncertain`**: Low confidence or excessive hedging

**Source Preferences:**
- **`wikipedia`**: Prefers Wikipedia over other sources
- **`news`**: Prefers news sites (BBC, CNN, etc.)
- **`academic`**: Prefers .edu or scholar.google
- **`blog`**: Prefers blogs/Medium
- **`government`**: Prefers .gov sources
- **`social`**: Prefers Twitter/Reddit

**Example:**
```javascript
const dissector = new ReasoningDissector();

const analysis = await dissector.analyzeReasoning({
  model: 'GPT-4',
  answer: 'A shipwreck was discovered near Madagascar...',
  research: { sources: [...], summary: '...' },
  confidence: 0.85,
  sourcesUsed: 3,
  facts: ['Discovered Jan 2025', 'Estimated $50M', 'Madagascar', ...],
  responseTime: 12543
});

console.log(analysis);
```

**Output:**
```javascript
{
  model: 'GPT-4',

  // Reasoning pattern
  pattern: 'analytical-thorough',

  // Confidence
  confidenceLevel: 0.85,
  confidenceStyle: 'calibrated',

  // Source behavior
  sourcePreference: 'wikipedia',
  sourceDiversity: {
    diversity: 0.75,
    uniqueDomains: 3,
    sourceTypes: ['encyclopedia', 'news', 'general'],
    score: 'high'
  },

  // Fact extraction
  factExtractionRate: 4.2, // facts per 100 words
  factsPerSource: 1.67,    // 5 facts / 3 sources

  // Bias awareness
  biasAwareness: {
    aware: true,
    score: 1.0,
    biasScore: 'LOW',
    warningsDetected: 0
  },

  // Speed vs thoroughness
  speedVsThoroughness: {
    speedScore: 0.79,
    thoroughnessScore: 0.85,
    efficiency: 0.068,
    tradeoff: 'thorough'
  },

  // Reasoning fingerprint
  fingerprint: {
    pattern: 'analytical-thorough',
    confidenceStyle: 'calibrated',
    sourcePreference: 'wikipedia',
    speedVsThoroughness: 'thorough',
    biasAwareness: true,
    factExtractionRate: 4.2,
    uniqueId: 'GPT-4_analytical-thorough_calibrated'
  }
}
```

**Compare Multiple Models:**
```javascript
const comparison = await dissector.compareReasoning([
  gpt4Result,
  claudeResult,
  deepseekResult,
  qwenResult,
  llamaResult
]);

console.log(comparison.rankings);
// → [
//   { model: 'Claude 3.5', score: 87.5, strengths: ['Well-calibrated confidence', 'Diverse source usage'], weaknesses: [] },
//   { model: 'GPT-4', score: 82.3, strengths: ['Efficient fact extraction'], weaknesses: [] },
//   { model: 'DeepSeek', score: 76.1, strengths: ['Good speed/thoroughness balance'], weaknesses: ['Limited source diversity'] },
//   ...
// ]

console.log(comparison.differences);
// → [
//   { category: 'confidence', description: 'Models have different confidence styles: calibrated, hedging' },
//   { category: 'sources', description: 'Models prefer different sources: wikipedia, academic, news' },
//   { category: 'approach', description: 'Models have different approaches: thorough, fast' }
// ]

console.log(comparison.consensus);
// → { consensusPattern: 'analytical-thorough', agreement: 0.6, totalModels: 5 }
```

---

### 3. Integration with Research System

All models use the same research infrastructure:

**Knowledge Freshness Layer** → Detects stale data
**Autonomous Research Agent** → Scrapes web via puppeteer
**Bias Detector** → Analyzes sources
**Thought Process Logger** → Captures reasoning steps
**Wayback Archive** → Stores scraped pages

This ensures fair comparison - all models get the same fresh data.

---

## Use Cases

### 1. Find Best Model for Task

**User:** "Which model is best at verifying facts?"

**System:**
```javascript
const comparison = await comparator.compareAll('What pirate treasure was found in 2025?');

const ranking = comparison.models
  .filter(m => m.success)
  .sort((a, b) => b.sourcesUsed - a.sourcesUsed);

console.log('Best fact-checker:', ranking[0].model);
// → Claude 3.5 (3 sources verified)
```

---

### 2. Detect Model Biases

**User:** "Which model prefers crowdfunded sources?"

**System:**
```javascript
const comparison = await comparator.compareAll('Latest AI developments?');

for (const model of comparison.models) {
  if (model.biasAnalysis && model.biasAnalysis.indicators.crowdfunded) {
    console.log(`${model.model} used crowdfunded sources:`, model.biasAnalysis.indicators.crowdfundingMentions);
  }
}
```

---

### 3. Track Preference Evolution

**User:** "Has GPT-4's source preference changed over time?"

**System:**
```javascript
const dissector = new ReasoningDissector();

// Run 100 queries over time
for (let i = 0; i < 100; i++) {
  const result = await comparator.compareAll(`Query ${i}`);
  const gpt4 = result.models.find(m => m.model === 'GPT-4');
  await dissector.analyzeReasoning(gpt4);
}

// Check fingerprint evolution
const fingerprint = dissector.getModelFingerprint('GPT-4');
console.log('GPT-4 consistency:', fingerprint.consistency); // 0.85 = very consistent
console.log('Common pattern:', fingerprint.commonPattern); // 'analytical-thorough'
```

---

### 4. Reverse-Engineer Reasoning Algorithms

**User:** "How does Claude think differently than GPT-4?"

**System:**
```javascript
const comparison = await comparator.compareAll('Explain quantum computing');

const dissectorComparison = await dissector.compareReasoning(comparison.models);

console.log('GPT-4 fingerprint:', dissectorComparison.analyses[0].fingerprint);
// → { pattern: 'quick-conclusion', confidenceStyle: 'calibrated', sourcePreference: 'wikipedia' }

console.log('Claude fingerprint:', dissectorComparison.analyses[1].fingerprint);
// → { pattern: 'analytical-thorough', confidenceStyle: 'confident', sourcePreference: 'academic' }

console.log('Differences:', dissectorComparison.differences);
// → [
//   { category: 'approach', description: 'Claude is more thorough, GPT-4 is faster' },
//   { category: 'sources', description: 'Claude prefers academic, GPT-4 prefers Wikipedia' }
// ]
```

---

## Configuration

### Models to Compare

Update `lib/model-reasoning-comparator.js`:

```javascript
models: [
  { provider: 'openai', model: 'gpt-4', name: 'GPT-4' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5' },
  { provider: 'deepseek', model: 'deepseek-chat', name: 'DeepSeek' },
  { provider: 'ollama', model: 'qwen2.5-coder:32b', name: 'Qwen 2.5 32B' },
  { provider: 'ollama', model: 'llama3.1:70b', name: 'Llama 3.1 70B' }
]
```

### LLM Training Cutoffs

When models are refreshed, update cutoffs:

```javascript
llmCutoffs: {
  'qwen2.5-coder:32b': new Date('2024-10-01'),
  'claude-3-5-sonnet-20241022': new Date('2024-10-01'),
  'gpt-4': new Date('2024-04-01'),
  'default': new Date('2024-06-01')
}
```

### Reasoning Detection

Customize pattern detection thresholds:

```javascript
const dissector = new ReasoningDissector({
  overconfidentThreshold: 0.9,  // 90%+ confidence = overconfident
  hedgingThreshold: 0.5,         // <50% confidence = hedging
  minStepsForThorough: 3,        // 3+ steps = thorough
  minSourcesForVerification: 2   // 2+ sources = verified
});
```

---

## Testing

### Test Model Comparison

```bash
node -e "
const ModelReasoningComparator = require('./lib/model-reasoning-comparator');
const llmRouter = require('./lib/multi-llm-router');
const db = require('./lib/db');
const vault = new (require('./lib/user-data-vault'))({ db });

const comparator = new ModelReasoningComparator({
  llmRouter,
  vault,
  db
});

comparator.compareAll('What pirate treasure was found in 2025?').then(result => {
  console.log('Best model:', result.bestModel.name);
  console.log('Score:', result.bestModel.score);
  console.log('Consensus:', result.consensus.consensusLevel);
  console.log('Total time:', result.totalTime + 'ms');
});
"
```

### Test Reasoning Dissector

```bash
node -e "
const ReasoningDissector = require('./lib/reasoning-dissector');

const dissector = new ReasoningDissector();

const mockResult = {
  model: 'GPT-4',
  answer: 'A shipwreck was discovered...',
  confidence: 0.85,
  sourcesUsed: 3,
  facts: ['Fact 1', 'Fact 2', 'Fact 3'],
  responseTime: 12000,
  research: { sources: [{ url: 'https://en.wikipedia.org/...' }] }
};

dissector.analyzeReasoning(mockResult).then(analysis => {
  console.log('Pattern:', analysis.pattern);
  console.log('Confidence style:', analysis.confidenceStyle);
  console.log('Source preference:', analysis.sourcePreference);
  console.log('Fingerprint:', analysis.fingerprint);
});
"
```

---

## Database Schema

Add to `migrations/`:

```sql
-- Model comparisons
CREATE TABLE model_comparisons (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  models JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  results JSONB,
  consensus JSONB,
  best_model JSONB
);

CREATE INDEX idx_comparisons_query ON model_comparisons USING gin(to_tsvector('english', query));
CREATE INDEX idx_comparisons_started ON model_comparisons(started_at DESC);

-- Reasoning sessions (from ThoughtProcessLogger)
CREATE TABLE reasoning_sessions (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  final_answer TEXT,
  metadata JSONB,
  context JSONB
);

-- Reasoning steps
CREATE TABLE reasoning_steps (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES reasoning_sessions(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  data JSONB,
  artifacts JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_steps_session ON reasoning_steps(session_id, step_number);
```

---

## Public Research Project

Make this a public crowdsourced research project:

**Public Dashboard:**
- Live comparisons (5+ models on same query)
- Reasoning transparency (see each model's thought process)
- Preference heatmaps (which model likes what)
- Consensus tracker (agreement over time)

**Crowdsourced Queries:**
- Users submit queries
- System runs all models
- Results are public
- Voting on best explanations

**Research Insights:**
- Track model evolution (has GPT-4 changed?)
- Detect prompt engineering patterns
- Identify model biases
- Build reasoning datasets

---

## Next Steps

### Phase 1: Core Comparison ✅
- [x] Model Reasoning Comparator (parallel execution)
- [x] Reasoning Dissector (pattern analysis)
- [x] Integration with research system

### Phase 2: Interactive Dashboards
- [ ] `public/multi-model-research.html` (side-by-side comparison)
- [ ] `public/research-dashboard.html` (reasoning transparency viewer)
- [ ] `public/research-playground.html` (feed queries, watch AI think)
- [ ] `public/research-project.html` (public crowdsourced research)

### Phase 3: Advanced Analytics
- [ ] Preference evolution tracker (how models change over time)
- [ ] Reasoning pattern classifier (ML model to detect patterns)
- [ ] Bias trend analysis (detect new bias patterns)
- [ ] Consensus predictor (predict agreement before running)

### Phase 4: Public Research
- [ ] Public API (anyone can submit queries)
- [ ] Crowdsourced voting (best explanations)
- [ ] Research datasets (export reasoning chains)
- [ ] Academic collaboration (publish findings)

---

## FAQ

### Why compare models?

**Answer:** Different models have different strengths:
- GPT-4: Fast, mainstream sources, good summaries
- Claude: Thorough verification, academic focus, high confidence
- DeepSeek: Analytical, logic-heavy, extracts numbers
- Ollama: Training-limited, needs web search

By comparing them, you can:
1. Pick the best model for your task
2. Detect biases and overconfidence
3. Reverse-engineer their reasoning algorithms
4. Build better prompts

---

### Is this expensive?

**No.** Each comparison costs:
- Ollama models: **FREE** (run locally)
- GPT-4: ~$0.01 per query
- Claude: ~$0.015 per query
- DeepSeek: ~$0.002 per query

Total: **~$0.03 per 5-model comparison**

---

### Can I add more models?

**Yes.** Edit `lib/model-reasoning-comparator.js`:

```javascript
models: [
  // ... existing models
  { provider: 'google', model: 'gemini-pro', name: 'Gemini Pro' },
  { provider: 'mistral', model: 'mistral-large', name: 'Mistral Large' }
]
```

---

### Can I see the reasoning process?

**Yes.** Use Thought Process Logger:

```javascript
const chain = await logger.getReasoningChain(sessionId);

console.log(chain.steps);
// → [
//   { stepType: 'query_received', data: { query: '...' } },
//   { stepType: 'staleness_detected', data: { reason: 'temporal keyword' } },
//   { stepType: 'source_selected', data: { source: 'duckduckgo' } },
//   { stepType: 'page_scraped', data: { url: '...', html: '...' } },
//   { stepType: 'data_extracted', data: { facts: [...] } },
//   { stepType: 'bias_checked', data: { biasScore: 'LOW' } },
//   { stepType: 'llm_prompted', data: { prompt: '...' } },
//   { stepType: 'llm_responded', data: { answer: '...' } }
// ]
```

Export as markdown:

```javascript
const markdown = await logger.exportMarkdown(sessionId);
console.log(markdown);
```

---

**Now you can dissect how AI models think.** 🧠🔬

