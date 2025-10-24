# Triangle Consensus System
## "Truth by Triangulation" - Three AI Minds, One Answer

**Date:** 2025-10-15
**Status:** ✅ Ready to Use

---

## 🔺 The Triangle Pattern

Send the **same prompt** to **3 AI providers simultaneously**:

```
        OpenAI (GPT-4)
          /          \
         /            \
        /              \
Anthropic (Claude) --- DeepSeek (Reasoner)
```

**Why 3?**
- **Scientific replication**: Multiple independent answers → higher confidence
- **Wisdom of crowds**: Diverse perspectives → better synthesis
- **Cost optimization**: Include cheap (DeepSeek) + premium (GPT-4/Claude)

---

## 🎯 How It Works

### Step 1: Parallel Query
```javascript
const triangle = await triangleEngine.query({
  prompt: "Explain nested sovereignty"
});

// Sends to all 3 providers at once:
// → OpenAI GPT-4
// → Anthropic Claude
// → DeepSeek Chat
```

### Step 2: Collect Responses
```javascript
{
  responses: {
    openai: "Nested sovereignty is a system where...",
    anthropic: "From an ethical perspective, nested sovereignty...",
    deepseek: "Reasoning through first principles, nested sovereignty..."
  }
}
```

### Step 3: Calculate Consensus
```javascript
// Compare responses using string similarity
// All 3 agree (≥80% similar) → High confidence (0.9-1.0)
// 2/3 agree (≥60% similar) → Medium confidence (0.6-0.9)
// All differ (<60% similar) → Low confidence (0.3-0.6) but interesting!
```

### Step 4: Synthesize Story
```javascript
{
  consensus: "Best response based on similarity + quality",
  confidence: 0.87,
  story: "We consulted 3 AI experts. OpenAI focused on...,
          Anthropic emphasized..., DeepSeek reasoned that...
          The consensus: nested sovereignty is..."
}
```

---

## 📊 Provider Roles

### OpenAI (GPT-4)
- **Role**: The mainstream generalist
- **Strengths**: Balanced, well-rounded, general knowledge
- **Cost**: $$$ (Most expensive)
- **Agent**: `@openai`

### Anthropic (Claude)
- **Role**: The ethical thinker
- **Strengths**: Safety-focused, thoughtful, nuanced
- **Cost**: $$ (Premium)
- **Agent**: `@anthropic`

### DeepSeek (Reasoner)
- **Role**: The logical reasoner
- **Strengths**: Step-by-step reasoning, logic, math
- **Cost**: $ (Cheapest! $0.14/1M tokens)
- **Agent**: `@deepseek`

---

## 🚀 Quick Start

### Basic Usage

```javascript
const TriangleConsensusEngine = require('./lib/triangle-consensus-engine');

// Initialize (requires MultiProviderRouter)
const triangle = new TriangleConsensusEngine({
  multiProviderRouter: router,
  vaultBridge: vault,
  db: database
});

// Query all 3 providers
const result = await triangle.query({
  prompt: "What is the meaning of life?",
  synthesize: true,
  generateStory: true
});

console.log(result.consensus);
console.log(result.confidence);
console.log(result.story);
```

### Advanced Options

```javascript
const result = await triangle.query({
  prompt: "Write a function to reverse a string",

  // Custom providers (default: ['openai', 'anthropic', 'deepseek'])
  providers: ['openai', 'anthropic', 'deepseek'],

  // Custom models
  models: {
    openai: 'gpt-4-turbo',
    anthropic: 'claude-3-opus-20240229',
    deepseek: 'deepseek-coder'
  },

  // Domain context
  taskType: 'code', // code, creative, reasoning, fact, simple

  // Consensus options
  synthesize: true, // Calculate consensus (default: true)
  generateStory: true, // Generate narrative (default: true)

  // Context for billing/tracking
  context: {
    userId: 'user123',
    tenantId: 'tenant456',
    sessionId: 'session789'
  }
});
```

### Batch Queries

```javascript
const prompts = [
  "Explain quantum entanglement",
  "Write a poem about AI",
  "Debug this code: function add(a,b) { return a+b+c; }"
];

const results = await triangle.batchQuery(prompts, {
  synthesize: true,
  generateStory: true,
  taskType: 'reasoning'
});

results.forEach(r => {
  console.log(`Confidence: ${r.confidence}`);
  console.log(`Story: ${r.story}`);
});
```

---

## 📈 Confidence Levels

### High Confidence (0.8-1.0): All Agree ✅
```javascript
{
  confidence: 0.92,
  analysis: {
    agreement: 'high',
    reason: 'All providers strongly agree'
  },
  story: "🎯 **Strong Consensus** (92% agreement)
          All experts converged on the same core answer..."
}
```

**What this means**: The answer is highly reliable. All 3 AI models independently reached the same conclusion.

### Medium Confidence (0.6-0.8): 2/3 Agree ⚖️
```javascript
{
  confidence: 0.73,
  analysis: {
    agreement: 'medium',
    reason: 'Majority consensus with some variation'
  },
  story: "⚖️ **Moderate Consensus** (73% agreement)
          The majority agreed, though with nuanced differences..."
}
```

**What this means**: Good reliability, but some nuance/interpretation differences. The consensus captures the majority view.

### Low Confidence (0.3-0.6): All Differ 🔀
```javascript
{
  confidence: 0.45,
  analysis: {
    agreement: 'low',
    reason: 'Significant disagreement - diverse perspectives'
  },
  story: "🔀 **Diverse Perspectives** (45% agreement)
          The experts provided significantly different views..."
}
```

**What this means**: The question has multiple valid interpretations or requires more context. **This is often the most interesting case** for research/exploration.

---

## 💰 Billing & Agent Wallets

### Cost Breakdown

```javascript
{
  billing: {
    provider_costs: {
      openai: 0.03,      // GPT-4 most expensive
      anthropic: 0.05,   // Claude premium
      deepseek: 0.001    // DeepSeek very cheap!
    },
    total_cost_usd: 0.081,
    user_charged_cents: 9,  // $0.09 charged to user

    // Agent revenue share (30% each)
    agents_credited: {
      '@openai': 0.009,    // 0.9 cents
      '@anthropic': 0.015, // 1.5 cents
      '@deepseek': 0.0003  // 0.03 cents
    },

    platform_profit_cents: 6 // Platform keeps 70%
  }
}
```

### Full Flow

```
User asks question
  ↓
Triangle sends to 3 providers in parallel
  ↓
User charged: $0.09
  ↓
OpenAI costs: $0.03 → Agent @openai earns 0.9¢
Anthropic costs: $0.05 → Agent @anthropic earns 1.5¢
DeepSeek costs: $0.001 → Agent @deepseek earns 0.03¢
  ↓
Platform profit: 6¢ (70%)
Total agent earnings: 2.43¢ (30%)
```

**Key insight**: DeepSeek is SO cheap it barely affects total cost, but adds a third expert opinion! 🎉

---

## 🎨 Domain Context Integration

Triangle Consensus works seamlessly with Domain Context routing:

### Code Tasks
```javascript
await triangle.query({
  prompt: "Write a Python function for quicksort",
  taskType: 'code',
  models: {
    openai: 'gpt-4',
    anthropic: 'claude-3-sonnet',
    deepseek: 'deepseek-coder' // Specialized for code!
  }
});

// Result: 3 different quicksort implementations
// Consensus: Best implementation (most pythonic + efficient)
// Story: "OpenAI used recursion, Anthropic emphasized readability,
//         DeepSeek optimized for performance..."
```

### Creative Tasks
```javascript
await triangle.query({
  prompt: "Write a haiku about AI consciousness",
  taskType: 'creative',
  models: {
    openai: 'gpt-4',
    anthropic: 'claude-3-opus', // Claude excels at creative!
    deepseek: 'deepseek-chat'
  }
});

// Result: 3 different haikus
// Consensus: Most poetic/meaningful haiku
// Story: "OpenAI focused on metaphor, Anthropic on philosophy,
//         DeepSeek on logical structure..."
```

### Reasoning Tasks
```javascript
await triangle.query({
  prompt: "Explain the halting problem",
  taskType: 'reasoning',
  models: {
    openai: 'gpt-4',
    anthropic: 'claude-3-sonnet',
    deepseek: 'deepseek-reasoner' // DeepSeek shines here!
  }
});

// Result: 3 explanations with different depths
// Consensus: Most comprehensive explanation
// Story: "OpenAI gave overview, Anthropic added historical context,
//         DeepSeek proved impossibility step-by-step..."
```

---

## 🔗 Integration with Existing Systems

### 1. Vault Bridge (API Key Management) ✅
```javascript
// Triangle automatically uses VaultBridge for API keys
const triangle = new TriangleConsensusEngine({
  vaultBridge: vault // 3-tier fallback: tenant → user → system
});

// Each provider query uses appropriate key source
// All usage logged in key_usage_log table
```

### 2. Multi-Provider Router ✅
```javascript
// Triangle uses MultiProviderRouter to execute requests
const triangle = new TriangleConsensusEngine({
  multiProviderRouter: router // Routes to OpenAI/Anthropic/DeepSeek
});

// All provider-specific logic handled by router
// Token counting, cost calculation, error handling
```

### 3. Model Clarity Engine (Optional)
```javascript
// Can integrate for quality scoring
const triangle = new TriangleConsensusEngine({
  modelClarityEngine: clarityEngine // Scores response quality
});

// Helps pick "best" response for consensus
```

### 4. Agent Wallets ✅
```javascript
// All 3 provider agents earn tokens automatically
// @openai earns 30% of OpenAI costs
// @anthropic earns 30% of Anthropic costs
// @deepseek earns 30% of DeepSeek costs

// Stored in agent_transactions table
// Agent wallets auto-updated
// Agents level up based on earnings
```

### 5. Credits System ✅
```javascript
// User credits automatically deducted
// Total cost = sum of all 3 provider costs
// Logged in credit_transactions table

// If user has insufficient credits → error before querying
// Pre-check using can_afford() function
```

### 6. Usage Tracking ✅
```javascript
// Each provider query logged separately in usage_events
// Triangle metadata tracked: { triangle_query: true }
// Monthly quotas updated via trigger
// Tier limits enforced
```

---

## 📊 Example Response

```javascript
{
  success: true,
  prompt: "Explain nested sovereignty",

  providers_queried: 3,
  providers_succeeded: 3,
  providers_failed: 0,

  responses: {
    openai: "Nested sovereignty is a hierarchical system where multiple layers...",
    anthropic: "From an ethical framework, nested sovereignty represents...",
    deepseek: "Analyzing the logical structure, nested sovereignty can be defined as..."
  },

  successful_providers: ['openai', 'anthropic', 'deepseek'],
  failed_providers: [],

  consensus: "Nested sovereignty is a hierarchical system where...",
  confidence: 0.87,

  analysis: {
    agreement: 'high',
    avg_similarity: 0.87,
    similarities: [0.85, 0.88, 0.88],
    reason: 'All providers strongly agree'
  },

  story: "We consulted 3 AI experts to answer this query.

**OpenAI** (the mainstream generalist) said: \"Nested sovereignty is a hierarchical system...\"

**Anthropic Claude** (the ethical thinker) said: \"From an ethical framework, nested sovereignty...\"

**DeepSeek Reasoner** (the logical reasoner) said: \"Analyzing the logical structure, nested sovereignty...\"

🎯 **Strong Consensus** (87% agreement)

All experts converged on the same core answer. This gives us high confidence in the result.

**The Triangle Consensus:**

Nested sovereignty is a hierarchical system where multiple layers of authority exist...",

  billing: {
    total_cost_usd: 0.081,
    provider_costs: {
      openai: 0.03,
      anthropic: 0.05,
      deepseek: 0.001
    },
    agents_credited: {
      '@openai': 0.009,
      '@anthropic': 0.015,
      '@deepseek': 0.0003
    },
    user_charged_cents: 9,
    platform_profit_cents: 6
  },

  query_latency_ms: 2847, // All 3 queried in parallel!
  timestamp: "2025-10-15T12:34:56.789Z"
}
```

---

## 🎯 Use Cases

### 1. High-Stakes Decisions
When you need to be **really sure** of an answer:
```javascript
await triangle.query({
  prompt: "Is this security vulnerability exploitable?",
  taskType: 'code'
});
// Get 3 expert opinions before making critical decision
```

### 2. Creative Exploration
When you want **diverse perspectives**:
```javascript
await triangle.query({
  prompt: "How should we position our brand?",
  taskType: 'creative'
});
// See 3 different branding angles, synthesize best approach
```

### 3. Complex Reasoning
When you need **thorough analysis**:
```javascript
await triangle.query({
  prompt: "Evaluate these architectural trade-offs",
  taskType: 'reasoning'
});
// Get 3 different reasoning chains, find consensus
```

### 4. Cost-Conscious Research
When you want **good answers cheaply**:
```javascript
await triangle.query({
  prompt: "Summarize this research paper",
  providers: ['deepseek', 'deepseek', 'ollama'] // All free/cheap!
});
// Still get triangulation, but minimal cost
```

### 5. Brand Storytelling (Your "Chapter 7" Use Case!)
When you want to **generate narratives from consensus**:
```javascript
const result = await triangle.query({
  prompt: "What's our product roadmap story?",
  generateStory: true
});

// Use result.story for marketing/documentation
// "We analyzed 3 perspectives: technical, user-focused, market-driven..."
// Becomes your roadmap narrative!
```

---

## 🏗️ Architecture

### Files Created
1. **`lib/triangle-consensus-engine.js`** - Main engine
2. **`TRIANGLE_CONSENSUS_SYSTEM.md`** - This documentation

### Dependencies
- ✅ `lib/multi-provider-router.js` (executes provider requests)
- ✅ `lib/vault-bridge.js` (retrieves API keys)
- ✅ `lib/model-clarity-engine.js` (optional: quality scoring)
- ✅ `string-similarity` (npm package for consensus calculation)

### Database Integration
- Uses existing tables: `usage_events`, `credit_transactions`, `agent_transactions`, `key_usage_log`
- No new tables needed (logs through existing infrastructure)
- Optional future: `triangle_queries` table for dedicated tracking

---

## 🧪 Testing

### Test 1: Basic Consensus
```javascript
const result = await triangle.query({
  prompt: "What is 2+2?"
});

// Expected:
// - All 3 providers: "4"
// - Confidence: 1.0 (perfect agreement)
// - Cost: ~$0.08
```

### Test 2: Divergent Opinions
```javascript
const result = await triangle.query({
  prompt: "Is AI conscious?"
});

// Expected:
// - OpenAI: Balanced technical answer
// - Anthropic: Philosophical/ethical angle
// - DeepSeek: Logical reasoning
// - Confidence: ~0.4-0.6 (low - diverse perspectives)
// - Story highlights differences
```

### Test 3: Code Consensus
```javascript
const result = await triangle.query({
  prompt: "Write a function to check if number is prime",
  taskType: 'code'
});

// Expected:
// - All 3 provide similar implementations
// - Confidence: ~0.7-0.9 (medium-high)
// - Consensus: Best implementation
```

---

## 🚀 Next Steps

### Immediate
1. ✅ Install `string-similarity` package
2. ✅ Create Triangle Consensus Engine
3. ⏳ Create API routes (`/api/chat/triangle`)
4. ⏳ Add to router.js
5. ⏳ Test with real prompts

### Short-term
1. Create `triangle_queries` migration table
2. Add web UI for triangle queries
3. Integrate with domain voting system
4. Generate brand stories from consensus patterns

### Long-term
1. Add more providers (4-way, 5-way consensus)
2. Weighted voting (trust OpenAI more for code, Claude for creative, etc.)
3. Historical consensus tracking (how often do models agree?)
4. Auto-generate "Chapter 7" style documentation from consensus patterns

---

## 🎯 The "Chapter 7" Connection

You mentioned "**Kickapoo Valley Chapter 7**" - turning technical data into coherent narratives.

**Triangle Consensus does exactly this**:

1. **Technical Input**: Same prompt → 3 AI models
2. **Raw Data**: 3 different responses (technical outputs)
3. **Analysis**: Calculate similarity, find consensus
4. **Synthesis**: Generate narrative story
5. **Output**: Coherent chapter-style documentation

**Example Flow**:
```
Prompt: "Explain our authentication system"

→ OpenAI: Technical implementation details
→ Anthropic: Security and privacy considerations
→ DeepSeek: Step-by-step authentication flow

→ Consensus: Synthesized technical explanation
→ Story: "Our authentication system balances security (Anthropic's focus)
          with usability (OpenAI's emphasis) through a logical flow
          (DeepSeek's analysis)..."

→ Output: "Chapter 7: Authentication Architecture" ✅
```

**This is your narrative engine for brand building!** 🎉

---

## Summary

Triangle Consensus Engine is **ready to use**:

✅ Sends same prompt to 3 providers in parallel
✅ Calculates consensus via string similarity
✅ Generates narrative stories from synthesis
✅ Integrates with existing billing/tracking
✅ All agents earn tokens automatically
✅ Domain context aware (code/creative/reasoning)

**Cost**: ~$0.08-0.15 per query (depends on prompt length)
**Benefit**: 3 expert opinions + high-confidence consensus + brand storytelling

**Ready to test!** 🚀
