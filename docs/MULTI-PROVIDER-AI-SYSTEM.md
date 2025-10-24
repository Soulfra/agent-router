# Multi-Provider AI System

> "How do we distinguish local Claude Code from Anthropic API? Because we have local subscriptions but also API pulls."

## Overview

The CALOS platform integrates multiple AI providers with clear cost tracking and smart routing. The system distinguishes between FREE local providers (Claude Code, Ollama) and PAID API providers (Anthropic, OpenAI, DeepSeek).

## Table of Contents

- [Provider Types](#provider-types)
- [AI Instances](#ai-instances)
- [Architecture](#architecture)
- [Cost Tracking](#cost-tracking)
- [Smart Routing](#smart-routing)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)

## Provider Types

### Local Providers (FREE)

These providers run locally and incur **zero API costs**:

#### 1. Claude Code
- **Source**: Claude Code desktop app subscription
- **Cost**: $0 (included in subscription)
- **Models**: claude-sonnet-4.5, claude-opus-4, claude-haiku-4
- **Adapter**: `lib/provider-adapters/claude-code-adapter.js`
- **CLI**: `bin/cal`
- **Best For**: Coding, architecture, system design

**Key Distinction**: This is **different** from Anthropic API. Same Claude models, but:
- Claude Code = Local subscription (FREE)
- Anthropic API = Cloud API (PAID)

#### 2. Ollama
- **Source**: Local Ollama server
- **Cost**: $0 (local hardware)
- **Models**: Mistral, Llama, CodeLlama, etc.
- **Adapter**: `lib/provider-adapters/ollama-adapter.js`
- **CLI**: `bin/ralph`
- **Best For**: Privacy-first tasks, creative writing, context compression

### API Providers (PAID)

These providers use cloud APIs and incur per-token costs:

#### 1. Anthropic API
- **Source**: Anthropic cloud API
- **Cost**: ~$3-15 per 1M tokens (model dependent)
- **Models**: claude-3-5-sonnet-20241022, claude-3-opus, claude-3-haiku
- **Adapter**: `lib/provider-adapters/anthropic-adapter.js`
- **Best For**: Reasoning, analysis, coding (when Claude Code unavailable)

#### 2. OpenAI
- **Source**: OpenAI cloud API
- **Cost**: ~$10-60 per 1M tokens (model dependent)
- **Models**: gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo
- **Adapter**: `lib/provider-adapters/openai-adapter.js`
- **Best For**: General purpose, creative writing, coding

#### 3. DeepSeek
- **Source**: DeepSeek cloud API
- **Cost**: ~$0.27 per 1M tokens
- **Models**: deepseek-chat
- **Adapter**: `lib/provider-adapters/deepseek-adapter.js`
- **Best For**: Reasoning, math, analysis (cheapest option)

## AI Instances

The system provides named AI instances with distinct personalities and use cases:

### Cal (Claude Code - FREE)

```javascript
{
  name: 'cal',
  provider: 'claude-code',
  model: 'claude-sonnet-4.5',
  cost: 0,
  source: 'local-subscription',
  personality: {
    style: 'Technical but accessible, direct, no bullshit',
    expertise: ['coding', 'architecture', 'system design', 'debugging'],
    catchphrases: ['WE ALREADY HAVE THIS', 'Wire it together', 'Sign everything']
  }
}
```

**When to use**: Primary choice for all coding tasks, FREE

### Ralph (Ollama - FREE)

```javascript
{
  name: 'ralph',
  provider: 'ollama',
  model: 'mistral:latest',
  cost: 0,
  source: 'local-hardware',
  personality: {
    style: 'Creative, exploratory, philosophical',
    expertise: ['creative writing', 'brainstorming', 'context compression'],
    catchphrases: ['Let me think about this locally', 'No API needed', 'Privacy first']
  }
}
```

**When to use**: Privacy-sensitive tasks, creative work, compression, FREE

### DeepThink (DeepSeek - PAID)

```javascript
{
  name: 'deepthink',
  provider: 'deepseek',
  model: 'deepseek-chat',
  cost: 0.00027,
  source: 'api',
  personality: {
    style: 'Analytical, methodical, detail-oriented',
    expertise: ['reasoning', 'analysis', 'problem solving', 'math', 'logic']
  }
}
```

**When to use**: Complex reasoning, cheapest API option ($0.27/1M tokens)

### GPT (OpenAI - PAID)

```javascript
{
  name: 'gpt',
  provider: 'openai',
  model: 'gpt-4-turbo-preview',
  cost: 0.01,
  source: 'api',
  personality: {
    style: 'Helpful, versatile, polished',
    expertise: ['general knowledge', 'creative writing', 'coding']
  }
}
```

**When to use**: General purpose tasks when local options unavailable

### Claude (Anthropic API - PAID)

```javascript
{
  name: 'claude',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  cost: 0.003,
  source: 'api',
  personality: {
    style: 'Thoughtful, nuanced, careful',
    expertise: ['reasoning', 'analysis', 'coding', 'writing']
  }
}
```

**When to use**: When Claude Code unavailable and need Claude-quality responses

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                      │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐               │
│  │   Cal   │  │  Ralph  │  │  Router  │               │
│  │   CLI   │  │   CLI   │  │   API    │               │
│  └────┬────┘  └────┬────┘  └─────┬────┘               │
└───────┼───────────┼──────────────┼─────────────────────┘
        │           │              │
        └───────────┴──────────────┘
                    │
        ┌───────────▼────────────┐
        │ AI Instance Registry   │
        │  - Named instances     │
        │  - Usage tracking      │
        │  - Cost tracking       │
        └───────────┬────────────┘
                    │
        ┌───────────▼────────────┐
        │  Multi-LLM Router      │
        │  - Smart routing       │
        │  - Fallback handling   │
        │  - Load balancing      │
        └───────────┬────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌──────────┐
│  LOCAL  │   │   API    │   │   API    │
├─────────┤   ├──────────┤   ├──────────┤
│ Claude  │   │Anthropic │   │ OpenAI   │
│  Code   │   │   API    │   │   API    │
│         │   │          │   │          │
│  FREE   │   │  PAID    │   │  PAID    │
└─────────┘   └──────────┘   └──────────┘
    │               │               │
┌─────────┐   ┌──────────┐   ┌──────────┐
│ Ollama  │   │ DeepSeek │   │          │
│  Local  │   │   API    │   │          │
│         │   │          │   │          │
│  FREE   │   │  PAID    │   │          │
└─────────┘   └──────────┘   └──────────┘
```

### Key Classes

#### AIInstanceRegistry
**File**: `lib/ai-instance-registry.js`

Manages named AI instances with usage and cost tracking.

```javascript
const registry = new AIInstanceRegistry({ multiLLMRouter });

// Ask a specific instance
const response = await registry.ask('cal', {
  prompt: 'Explain this code'
});

// Response includes cost metadata
console.log(response.instance.costProfile);
// { type: 'local-subscription', costPerToken: 0, free: true }

// Track usage
const stats = registry.getUsageStats('cal');
// { totalRequests: 42, totalTokens: 15000, totalCost: 0 }
```

#### MultiLLMRouter
**File**: `lib/multi-llm-router.js`

Smart routing between providers with fallback and load balancing.

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',      // or 'cheapest', 'fastest', 'best-quality'
  fallback: true,         // Auto-fallback on provider failure
  loadBalance: true,      // Balance load across providers
  costOptimize: true      // Prefer cheaper providers when possible
});

const response = await router.complete({
  prompt: 'Write a function...',
  taskType: 'code',        // 'code', 'creative', 'reasoning', 'fact'
  preferredProvider: 'claude-code'  // Optional: force specific provider
});
```

#### ClaudeCodeAdapter
**File**: `lib/provider-adapters/claude-code-adapter.js`

Adapter for local Claude Code subscription.

**Key Features**:
- Checks for Claude Code CLI availability
- Falls back to Anthropic API if CLI not found
- Marks all responses with `cost: 0` and `source: 'local-subscription'`
- Distinguishes from Anthropic API adapter

```javascript
const adapter = new ClaudeCodeAdapter({
  enabled: true,
  defaultModel: 'claude-sonnet-4.5',
  cliPath: 'claude-code'
});

const response = await adapter.complete({
  prompt: 'Debug this code',
  maxTokens: 4000
});

console.log(response.source);  // 'local-subscription'
console.log(response.cost);    // 0
```

## Cost Tracking

### Per-Request Tracking

Every response includes detailed cost metadata:

```javascript
{
  text: '...',           // Response text
  model: 'claude-sonnet-4.5',
  usage: {
    prompt_tokens: 150,
    completion_tokens: 500,
    total_tokens: 650
  },
  cost: 0,              // $0 for local providers
  source: 'local-subscription',
  instance: {
    name: 'cal',
    provider: 'claude-code',
    costProfile: {
      type: 'local-subscription',
      costPerToken: 0,
      free: true
    }
  }
}
```

### Usage Statistics

Track usage per instance:

```javascript
const stats = registry.getAllUsageStats();

// Output:
[
  {
    instance: { name: 'cal', provider: 'claude-code', ... },
    stats: {
      totalRequests: 100,
      totalTokens: 50000,
      totalCost: 0,        // FREE!
      successRate: '98.0%',
      averageTokensPerRequest: 500
    }
  },
  {
    instance: { name: 'gpt', provider: 'openai', ... },
    stats: {
      totalRequests: 10,
      totalTokens: 8000,
      totalCost: 0.08,    // PAID
      successRate: '100%'
    }
  }
]
```

### Cost Optimization

Router automatically optimizes for cost:

```javascript
const router = new MultiLLMRouter({
  strategy: 'cheapest',    // Prefer cheapest available provider
  costOptimize: true
});

// Routing priority (cheapest first):
// 1. Claude Code (FREE)
// 2. Ollama (FREE)
// 3. DeepSeek ($0.27/1M tokens)
// 4. Anthropic ($3/1M tokens)
// 5. OpenAI ($10/1M tokens)
```

## Smart Routing

### Routing Strategies

#### 1. Smart Strategy (Default)
Balances quality, cost, and latency based on task type:

```javascript
taskType: 'code'       → Claude Code (if available) → OpenAI
taskType: 'creative'   → Ollama → Anthropic
taskType: 'reasoning'  → DeepSeek → Anthropic
taskType: 'fact'       → DeepSeek (cheapest) → OpenAI
```

#### 2. Cheapest Strategy
Always use cheapest available provider:

```javascript
Claude Code (FREE) → Ollama (FREE) → DeepSeek → Anthropic → OpenAI
```

#### 3. Fastest Strategy
Optimize for low latency:

```javascript
Claude Code (local) → Ollama (local) → OpenAI → DeepSeek → Anthropic
```

#### 4. Best-Quality Strategy
Optimize for output quality:

```javascript
Claude Code → Anthropic Claude Opus → GPT-4 → DeepSeek
```

### Automatic Fallback

If a provider fails, router automatically falls back:

```javascript
try {
  // Try Claude Code first
  response = await claudeCodeAdapter.complete(request);
} catch (error) {
  // Claude Code failed, fall back to Anthropic API
  response = await anthropicAdapter.complete(request);
}
```

### Load Balancing

Distribute load across providers to avoid rate limits:

```javascript
const router = new MultiLLMRouter({
  loadBalance: true,
  maxRequestsPerMinute: 60  // Per provider
});

// Automatically rotates between providers
// when approaching rate limits
```

## Usage Examples

### Example 1: Free Coding Assistant

```javascript
// Use Cal (Claude Code - FREE) for all coding
const cal = await registry.ask('cal', {
  prompt: 'Write a function to validate email addresses'
});

console.log(`Cost: $${cal.instance.costProfile.cost}`);  // $0
```

### Example 2: Privacy-First Creative Writing

```javascript
// Use Ralph (Ollama - FREE, local) for privacy
const ralph = await registry.ask('ralph', {
  prompt: 'Write a short story about AI and privacy'
});

console.log(`Processed locally: ${ralph.instance.provider === 'ollama'}`);  // true
```

### Example 3: Cost-Optimized Reasoning

```javascript
// Use DeepThink (DeepSeek - cheapest API) for reasoning
const deepthink = await registry.ask('deepthink', {
  prompt: 'Solve this math problem step by step'
});

console.log(`Cost: $${deepthink.cost.toFixed(4)}`);  // ~$0.0001
```

### Example 4: Fallback Chain

```javascript
// Router tries Claude Code → Anthropic → OpenAI
const router = new MultiLLMRouter({ fallback: true });

const response = await router.complete({
  prompt: 'Explain quantum computing',
  preferredProvider: 'claude-code',  // Try this first
  taskType: 'fact'
});

console.log(`Used provider: ${response.provider}`);
console.log(`Cost: $${response.cost}`);
```

## Configuration

### Environment Variables

```bash
# Local Providers (FREE)
CLAUDE_CODE_CLI=/path/to/claude-code  # Optional: custom CLI path
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama server URL

# API Providers (PAID)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...
```

### Router Configuration

```javascript
const router = new MultiLLMRouter({
  // Routing strategy
  strategy: 'smart',              // 'smart', 'cheapest', 'fastest', 'best-quality'

  // Features
  fallback: true,                 // Auto-fallback on failure
  loadBalance: true,              // Balance load across providers
  costOptimize: true,             // Prefer cheaper providers

  // Retry settings
  maxRetries: 2,                  // Max retry attempts

  // Provider toggles
  claudeCodeEnabled: true,        // Enable Claude Code (local, free)
  ollamaEnabled: true,            // Enable Ollama (local, free)
  anthropicEnabled: false,        // Disable Anthropic API (paid)
  openaiEnabled: false,           // Disable OpenAI API (paid)
  deepseekEnabled: false          // Disable DeepSeek API (paid)
});
```

### Instance Configuration

```javascript
const registry = new AIInstanceRegistry({ multiLLMRouter });

// Add custom instance
registry.registerInstance({
  name: 'mybot',
  displayName: 'MyBot',
  provider: 'ollama',
  model: 'llama2:latest',
  personality: {
    style: 'Friendly and helpful',
    expertise: ['general knowledge'],
    catchphrases: ['Happy to help!']
  },
  costProfile: {
    type: 'local-hardware',
    costPerToken: 0,
    free: true
  },
  enabled: true
});
```

## Provider Comparison

| Provider | Type | Cost | Speed | Quality | Use Case |
|----------|------|------|-------|---------|----------|
| **Claude Code** | Local | FREE | Fast | Excellent | Coding, architecture (primary) |
| **Ollama** | Local | FREE | Fast | Good | Privacy, creative, compression |
| **DeepSeek** | API | $0.27/1M | Medium | Good | Reasoning, math (cheapest API) |
| **Anthropic** | API | $3/1M | Medium | Excellent | Analysis, reasoning (Claude-quality) |
| **OpenAI** | API | $10/1M | Fast | Excellent | General purpose, versatile |

## Best Practices

### 1. Prefer Free Local Providers

```javascript
// GOOD: Use Cal for coding (FREE)
const response = await registry.ask('cal', { prompt: 'Write a function...' });

// AVOID: Using paid API for coding when Cal is available
const response = await registry.ask('gpt', { prompt: 'Write a function...' });
```

### 2. Use Appropriate Instance for Task

```javascript
// Coding → Cal (Claude Code)
await registry.ask('cal', { prompt: 'Debug this code' });

// Creative → Ralph (Ollama)
await registry.ask('ralph', { prompt: 'Write a story' });

// Reasoning → DeepThink (DeepSeek, cheapest API)
await registry.ask('deepthink', { prompt: 'Solve this math problem' });
```

### 3. Enable Only Needed Providers

```javascript
// If you have Claude Code, disable Anthropic API
const router = new MultiLLMRouter({
  claudeCodeEnabled: true,    // Local Claude (FREE)
  anthropicEnabled: false,    // No need for paid Claude
  ollamaEnabled: true,        // Keep Ollama (FREE)
  openaiEnabled: false,       // Disable if not needed
  deepseekEnabled: false      // Disable if not needed
});
```

### 4. Monitor Costs

```javascript
// Regular cost audits
const stats = registry.getAllUsageStats();
const totalCost = stats.reduce((sum, s) => sum + s.stats.totalCost, 0);

console.log(`Total spend: $${totalCost.toFixed(2)}`);
console.log(`Free requests: ${stats.filter(s => s.instance.costProfile.free).length}`);
```

## Troubleshooting

### Claude Code vs Anthropic Confusion

**Problem**: Both use Claude models - which is which?

**Solution**: Check `source` field in response:
```javascript
response.source === 'local-subscription'  // Claude Code (FREE)
response.source === 'api'                 // Anthropic API (PAID)
```

### High API Costs

**Problem**: Unexpected API costs

**Solution**:
1. Check usage stats: `registry.getAllUsageStats()`
2. Verify free providers enabled and working
3. Review routing strategy - use 'cheapest'

### Provider Availability

**Problem**: Provider not available

**Solution**:
```javascript
// Check what's available
const info = adapter.getInfo();
console.log(info.available);  // true/false

// Enable fallback
const router = new MultiLLMRouter({ fallback: true });
```

## See Also

- [NATURAL-LANGUAGE-COMMANDS.md](./NATURAL-LANGUAGE-COMMANDS.md) - Natural language interface
- [FRACTIONAL-AGENCY-GUIDE.md](./FRACTIONAL-AGENCY-GUIDE.md) - AI agency system
- [lib/multi-llm-router.js](../lib/multi-llm-router.js) - Router implementation
- [lib/ai-instance-registry.js](../lib/ai-instance-registry.js) - Instance registry
