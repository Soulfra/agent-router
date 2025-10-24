# CAL Triangle Consensus Guide

> **Multi-provider AI queries with Triangle Consensus, CLI tools, and autonomous learning**

## 📊 Overview

The CAL Triangle System enables multi-provider AI queries (OpenAI, Anthropic, DeepSeek) with consensus calculation, CLI tools, and integration with CAL's autonomous learning systems.

**Key Components:**
1. **Triangle Consensus Engine** - Query all 3 providers, calculate consensus
2. **CAL CLI Tool** (`cal-ai`) - Terminal interface for queries
3. **API Key Manager** (`cal-keys`) - Interactive key management
4. **CAL API Client** - Internal client for autonomous learning
5. **Brand-Aware Prompting** - Context-aware prompts with documentation

---

## 🚀 Quick Start

### 1. Set Up API Keys

```bash
# Interactive setup wizard
./bin/cal-keys

# Or set specific keys
./bin/cal-keys set openai
./bin/cal-keys set anthropic
./bin/cal-keys set deepseek

# Check status
./bin/cal-keys status
```

### 2. Test Triangle Query

```bash
# Query all 3 providers with consensus
./bin/cal-ai triangle "What is the best way to learn JavaScript?"

# Or query single provider
./bin/cal-ai query "Explain async/await in JavaScript"
./bin/cal-ai query --provider anthropic "What is closure?"
```

### 3. Check System Status

```bash
./bin/cal-ai status
```

---

## 🎯 Use Cases

### 1. CLI Queries

**Single Provider:**
```bash
./bin/cal-ai query "2 + 2 = ?"
./bin/cal-ai q -p deepseek "Explain quantum computing"
```

**Triangle Consensus:**
```bash
./bin/cal-ai triangle "Should I use React or Vue?"
./bin/cal-ai t "Best practices for REST API design?"
```

### 2. Autonomous Learning (CAL)

When CAL gets stuck on a lesson (3+ failures), it automatically requests AI help:

```javascript
// In CalLearningLoop
const aiHelp = await this.requestAIHelp({
  task: "Find all JavaScript files",
  command: "find . -name '*.js'",
  error: "Permission denied",
  lessonTitle: "Command Line Basics"
});

// AI provides consensus from all 3 providers
console.log(aiHelp.consensus);  // Synthesized answer
console.log(aiHelp.confidence); // 0.0 - 1.0
```

### 3. Programmatic API Calls

**Using CalAPIClient:**
```javascript
const CalAPIClient = require('./lib/cal-api-client');
const client = new CalAPIClient();
await client.init();

// Triangle query
const result = await client.triangle({
  prompt: "How do I fix this SQL error?",
  taskType: "code",
  synthesize: true
});

console.log(result.consensus.synthesized);
console.log(result.responses.openai);
console.log(result.responses.anthropic);
console.log(result.responses.deepseek);
```

**Using Triangle Engine Directly:**
```javascript
const MultiProviderRouter = require('./lib/multi-provider-router');
const TriangleConsensusEngine = require('./lib/triangle-consensus-engine');

const router = new MultiProviderRouter();
const triangle = new TriangleConsensusEngine({ multiProviderRouter: router });

const result = await triangle.query({
  prompt: "Explain closures",
  synthesize: true,
  generateStory: true,
  context: { userId: 'user123' }
});
```

### 4. Brand-Aware Prompting

**Auto-enhance prompts with context:**
```javascript
const BrandAwarePrompter = require('./lib/brand-aware-prompting');
const prompter = new BrandAwarePrompter();
await prompter.init();

// Auto-detect context
const enhanced = await prompter.autoEnhance(
  "How does the routing system work?"
);

// Manual context selection
const enhanced = await prompter.enhance({
  prompt: "Explain our data tools",
  taskType: "educational",
  includeContext: ['dataTools', 'architecture']
});

// Create learning prompts
const prompt = await prompter.createLearningPrompt({
  lessonTitle: "Command Line Basics",
  task: "List files in directory",
  command: "ls -la",
  error: "Permission denied"
});
```

---

## 🔑 API Key Management

### Using `cal-keys`

**Interactive Mode:**
```bash
./bin/cal-keys
# Guided setup for all 3 providers
```

**Set Specific Key:**
```bash
./bin/cal-keys set openai
# Enter your OpenAI API key: sk-...
# Test this key now? (y/n): y
# ✓ OpenAI key is valid
```

**Test Keys:**
```bash
./bin/cal-keys test openai
./bin/cal-keys test anthropic
./bin/cal-keys test deepseek
```

**Clear Keys:**
```bash
./bin/cal-keys clear openai
```

**Check Status:**
```bash
./bin/cal-keys status
# 📊 API Key Status
# ─────────────────────────────────────────────────────────────
#   ✓ OpenAI: sk-proj...AbCd
#   ✓ Anthropic: sk-ant...XyZ1
#   ✗ DeepSeek: Not set
```

### Environment Variables

Keys are stored in `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
```

### Getting API Keys

**OpenAI:** https://platform.openai.com/api-keys
- Models: gpt-4, gpt-3.5-turbo
- Pricing: ~$0.03/1K tokens (GPT-4)

**Anthropic:** https://console.anthropic.com/
- Models: claude-3-sonnet, claude-3-opus
- Pricing: ~$0.003/1K tokens (Sonnet)

**DeepSeek:** https://platform.deepseek.com/
- Models: deepseek-chat, deepseek-coder
- Pricing: ~$0.001/1K tokens (Chat)

---

## 🎨 CLI Tool (`cal-ai`)

### Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `query` | `q` | Query single provider |
| `triangle` | `t` | Query all 3 providers with consensus |
| `status` | `s` | Check system status |
| `help` | `h` | Show help |
| `version` | `v` | Show version |

### Query Examples

**Single Provider:**
```bash
# Default (OpenAI)
./bin/cal-ai query "What is machine learning?"

# Specific provider
./bin/cal-ai q -p anthropic "Explain recursion"
./bin/cal-ai q --provider deepseek "Best sorting algorithm?"
```

**Triangle Consensus:**
```bash
# Get consensus from all 3 providers
./bin/cal-ai triangle "Should I use microservices?"

# Shorter alias
./bin/cal-ai t "What is the best database for my use case?"
```

### Output Format

**Query Output:**
```
🤖 Querying AI...
Provider: openai
Prompt: "What is machine learning?"

────────────────────────────────────────────────────────────
Machine learning is a subset of artificial intelligence...
────────────────────────────────────────────────────────────

✓ 150 input + 450 output tokens
✓ Cost: $0.0180
```

**Triangle Output:**
```
🔺 Triangle Consensus Query...
Querying: OpenAI, Anthropic, DeepSeek
Prompt: "Should I use React or Vue?"

Individual Responses:
────────────────────────────────────────────────────────────

OPENAI:
React has a larger ecosystem and community...

ANTHROPIC:
Both are excellent frameworks. React tends to...

DEEPSEEK:
Vue has a gentler learning curve for beginners...

────────────────────────────────────────────────────────────

Consensus:
Confidence: 87% (high)
────────────────────────────────────────────────────────────
Both frameworks are production-ready. React is better if you
need a large ecosystem and corporate backing. Vue is better
for smaller teams and faster prototyping...
────────────────────────────────────────────────────────────

Story:
────────────────────────────────────────────────────────────
All three AI providers agreed that both frameworks are viable.
OpenAI emphasized React's ecosystem, Anthropic focused on use
case considerations, and DeepSeek highlighted Vue's simplicity.
────────────────────────────────────────────────────────────

✓ Total Cost: $0.0450
✓ Execution Time: 3245ms
```

---

## 🤖 CAL API Client

Internal client for autonomous AI-assisted learning.

### Features

- **Auto-detects server** - Uses API if server running, falls back to direct calls
- **Retry logic** - Exponential backoff for failed requests
- **Caching** - Caches responses for repeated queries (1 hour TTL)
- **Health checks** - Monitors server availability every minute

### Usage

```javascript
const CalAPIClient = require('./lib/cal-api-client');

// Initialize
const client = new CalAPIClient({
  userId: 'cal',
  source: 'cal-learning-loop',
  enableCache: true,
  maxRetries: 3
});
await client.init();

// Triangle query
const result = await client.triangle({
  prompt: "How do I fix this error?",
  taskType: "code",
  synthesize: true,
  generateStory: false
});

// Single provider query
const result = await client.query({
  provider: 'openai',
  model: 'gpt-4',
  prompt: "Explain async/await"
});

// Check status
const status = await client.getStatus();
console.log(status.server.running);
console.log(status.fallback.available);
console.log(status.apiKeys);

// Clear cache
client.clearCache();

// Cleanup
client.destroy();
```

### Response Format

**Triangle Response:**
```javascript
{
  success: true,
  responses: {
    openai: {
      success: true,
      response: "...",
      usage: { inputTokens: 150, outputTokens: 450 }
    },
    anthropic: { ... },
    deepseek: { ... }
  },
  consensus: {
    synthesized: "...",
    confidence: 0.87,
    level: "high"
  },
  story: "All three AI providers agreed that...",
  billing: {
    totalCostUSD: 0.045,
    breakdown: { openai: 0.018, anthropic: 0.015, deepseek: 0.012 }
  },
  executionTimeMs: 3245
}
```

**Query Response:**
```javascript
{
  success: true,
  response: "...",
  usage: {
    inputTokens: 150,
    outputTokens: 450,
    totalCostUSD: 0.018
  }
}
```

---

## 🎯 Brand-Aware Prompting

Enhances prompts with CALOS context and documentation.

### Features

- **Auto-loads docs** from `/docs` directory
- **Detects intent** - Automatically determines task type (technical, marketing, educational, support)
- **Injects context** - Includes relevant documentation excerpts
- **Template system** - Different styles for different use cases

### Usage

```javascript
const BrandAwarePrompter = require('./lib/brand-aware-prompting');
const prompter = new BrandAwarePrompter();
await prompter.init();

// Auto-enhance (detects intent and context)
const result = await prompter.autoEnhance(
  "How does the routing system work?"
);
console.log(result.enhanced);
console.log(result.taskType);        // "technical"
console.log(result.contextIncluded); // ["architecture"]

// Manual enhancement
const result = await prompter.enhance({
  prompt: "Explain our data tools",
  taskType: "educational",
  includeContext: ['dataTools', 'architecture'],
  maxContextLength: 2000
});

// Specialized prompts
const trianglePrompt = await prompter.createTrianglePrompt({
  question: "Best database for my use case?",
  context: { appType: 'real-time', scale: 'medium' }
});

const learningPrompt = await prompter.createLearningPrompt({
  lessonTitle: "Command Line Basics",
  task: "List files",
  command: "ls -la",
  error: "Permission denied"
});

const ragebaitPrompt = await prompter.createRagebaitPrompt({
  topic: "JavaScript frameworks",
  style: "dev",
  tone: "spicy"
});

// Check status
const status = prompter.getStatus();
console.log(status.docsLoaded);      // 5
console.log(status.availableDocs);   // ["architecture", "triangle", ...]
```

### Available Documentation

- `architecture` - ROUTE-REFERENCE.md
- `branding` - publishing-glossary.md
- `triangle` - TRIANGLE-CONSENSUS-GUIDE.md
- `dataTools` - DATA-TOOLS-GUIDE.md
- `calLearning` - CAL-LEARNING-SYSTEM.md

### Task Types

- `technical` - Code, APIs, architecture
- `marketing` - Viral content, branding, sales
- `educational` - Teaching, explaining concepts
- `support` - Help, troubleshooting, customer support

---

## 🔌 API Endpoints

Base URL: `http://localhost:5001`

### Triangle Consensus

**POST `/api/chat/triangle`**

Query all 3 providers with consensus.

```bash
curl -X POST http://localhost:5001/api/chat/triangle \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the best database?",
    "taskType": "technical",
    "synthesize": true,
    "generateStory": true,
    "context": {
      "userId": "user123",
      "source": "web-app"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "responses": {
    "openai": { "success": true, "response": "...", "usage": {...} },
    "anthropic": { "success": true, "response": "...", "usage": {...} },
    "deepseek": { "success": true, "response": "...", "usage": {...} }
  },
  "consensus": {
    "synthesized": "All three providers agree that...",
    "confidence": 0.87,
    "level": "high"
  },
  "story": "OpenAI emphasized performance...",
  "billing": {
    "totalCostUSD": 0.045,
    "breakdown": { "openai": 0.018, "anthropic": 0.015, "deepseek": 0.012 }
  },
  "executionTimeMs": 3245
}
```

### Batch Queries

**POST `/api/triangle/batch`**

Query multiple prompts in parallel.

```bash
curl -X POST http://localhost:5001/api/triangle/batch \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": [
      "What is React?",
      "What is Vue?",
      "What is Angular?"
    ],
    "synthesize": true
  }'
```

### Statistics

**GET `/api/triangle/stats`**

Get system statistics.

```bash
curl http://localhost:5001/api/triangle/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalQueries": 1234,
    "averageConfidence": 0.83,
    "providerUsage": {
      "openai": 1234,
      "anthropic": 1234,
      "deepseek": 1234
    },
    "totalCostUSD": 145.67
  }
}
```

---

## 🧠 CAL Learning Integration

CAL automatically requests AI help when stuck on lessons (3+ failures).

### How It Works

1. **CAL attempts exercise** - Tries to execute command
2. **Exercise fails** - Error recorded in learning systems
3. **Failure count reaches 3** - Triggers AI help request
4. **Triangle query sent** - All 3 providers asked for help
5. **Consensus generated** - Synthesized answer from all providers
6. **CAL learns** - Suggestion stored for future attempts

### Example Flow

```javascript
// lib/cal-learning-loop.js

// Exercise fails
catch (error) {
  // Record failure
  const failureCount = await this.failureLearner.getFailureCount(skillId);

  // If stuck (3+ failures), ask AI
  if (failureCount >= 3 && this.calAPIClient) {
    const aiHelp = await this.requestAIHelp({
      task: exercise.task,
      command: exercise.command,
      error: error.message,
      explanation: exercise.explanation,
      lessonTitle: nextLesson.lesson_title
    });

    if (aiHelp.success) {
      console.log('AI Consensus:', aiHelp.consensus);
      console.log('Confidence:', aiHelp.confidence);

      // Store for future attempts
      await this.failureLearner.recordAISuggestion(
        skillId,
        aiHelp.consensus,
        { confidence: aiHelp.confidence, attribution: 'ai-assisted' }
      );
    }
  }
}
```

### Attribution System

CAL tracks whether success was due to:
- **Skill** - 90%+ success rate (Cal mastered it)
- **Mixed** - 60-90% success rate (Learning in progress)
- **Luck** - <60% success rate (Needs more practice)
- **AI-assisted** - Success after AI help

---

## 📊 Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      User / CAL                             │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─── CLI (bin/cal-ai) ──────────────┐
             │                                    │
             ├─── API Client (lib/cal-api-client)│
             │                                    │
             └─── Web API (routes/triangle)      │
                                                  ↓
┌────────────────────────────────────────────────────────────┐
│              Triangle Consensus Engine                      │
│         (lib/triangle-consensus-engine.js)                  │
└────────────┬───────────────────────────────────────────────┘
             │
             ├──→ MultiProviderRouter ──┐
             │                           │
             └──→ String Similarity ─────┤
                                         ↓
┌────────────────────────────────────────────────────────────┐
│                    API Providers                            │
├────────────────┬────────────────┬────────────────────────┤
│  OpenAI        │  Anthropic     │  DeepSeek               │
│  (gpt-4)       │  (claude-3)    │  (deepseek-chat)        │
└────────────────┴────────────────┴─────────────────────────┘
```

### Data Flow

1. **Request** - User/CAL sends query
2. **Route** - Triangle Engine distributes to all providers
3. **Query** - Each provider processes independently
4. **Collect** - Responses gathered
5. **Consensus** - String similarity calculates agreement
6. **Synthesize** - Meta-query generates final answer
7. **Story** - Narrative explains differences
8. **Return** - Complete result sent back

### Files Reference

**Core Libraries:**
- `lib/triangle-consensus-engine.js` - Main consensus engine
- `lib/multi-provider-router.js` - Routes to OpenAI/Anthropic/DeepSeek
- `lib/cal-api-client.js` - Internal API client
- `lib/brand-aware-prompting.js` - Context-aware prompts

**CLI Tools:**
- `bin/cal-ai` - Multi-provider query CLI
- `bin/cal-keys` - API key management

**API Routes:**
- `routes/triangle-routes.js` - Triangle API endpoints

**Learning Integration:**
- `lib/cal-learning-loop.js` - Autonomous learning with AI help

---

## 🛠️ Configuration

### Environment Variables

```bash
# API Keys
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# Server
PORT=5001

# Database (for CAL learning)
DATABASE_URL=postgresql://...
```

### CalAPIClient Options

```javascript
new CalAPIClient({
  serverUrl: 'http://localhost:5001',  // API server
  userId: 'cal',                        // User ID for tracking
  source: 'cal-learning-loop',          // Source identifier
  maxRetries: 3,                        // Retry failed requests
  retryDelay: 1000,                     // Initial retry delay (ms)
  enableCache: true,                    // Cache responses
  cacheMaxSize: 100,                    // Max cached items
  cacheTTL: 3600000,                    // Cache lifetime (1 hour)
  healthCheckInterval: 60000            // Server health check (1 min)
})
```

### BrandAwarePrompter Options

```javascript
new BrandAwarePrompter({
  docsDir: path.join(__dirname, '../docs'),
  brandName: 'CALOS',
  tagline: 'Community Acquisition & Learning Operating System'
})
```

---

## 🔍 Troubleshooting

### API Keys Not Working

```bash
# Check status
./bin/cal-keys status

# Test individual keys
./bin/cal-keys test openai
./bin/cal-keys test anthropic
./bin/cal-keys test deepseek

# Reset and re-enter
./bin/cal-keys clear openai
./bin/cal-keys set openai
```

### Server Not Running

```bash
# Check if server is up
./bin/cal-ai status

# Start server
npm start

# Or start in background
npm run start:quiet &
```

### CalAPIClient Fallback

If server is down, CalAPIClient automatically falls back to direct module calls:

```
[CalAPIClient] Server not running, loading fallback modules...
[CalAPIClient] Fallback modules loaded
[CalAPIClient] Ready (server: down, using fallback)
```

### Cache Issues

```javascript
// Clear cache programmatically
client.clearCache();

// Or disable cache
const client = new CalAPIClient({ enableCache: false });
```

### Low Confidence Consensus

If consensus confidence is low (<0.6), providers disagree significantly:

- Check if question is subjective
- Try rephrasing question
- Use `generateStory: true` to see why they disagree

---

## 📈 Best Practices

### 1. Cost Optimization

- **Cache repeated queries** - Enable caching in CalAPIClient
- **Use single provider for simple questions** - Save Triangle for complex decisions
- **Choose cheaper models** - DeepSeek is 10x cheaper than GPT-4

### 2. Prompt Engineering

- **Be specific** - "Best database for real-time chat app" > "Best database"
- **Provide context** - Use BrandAwarePrompter to inject docs
- **Set task type** - Helps AI understand intent (technical, marketing, etc.)

### 3. Consensus Quality

- **High confidence (>0.8)** - Strong agreement, reliable answer
- **Medium confidence (0.6-0.8)** - Some differences, read story for nuance
- **Low confidence (<0.6)** - Major disagreements, question may be subjective

### 4. CAL Learning

- **Monitor help requests** - `stats.helpRequests` tracks AI assistance
- **Attribution tracking** - Know when CAL mastered vs got lucky
- **Failure threshold** - 3 failures triggers AI help (adjustable)

---

## 🎯 Examples

### Example 1: Technical Question

```bash
./bin/cal-ai triangle "What is the difference between REST and GraphQL?"
```

**Result:**
- High confidence (0.92)
- All providers agree on core differences
- Synthesized answer covers strengths/weaknesses

### Example 2: Subjective Question

```bash
./bin/cal-ai triangle "Which programming language is best?"
```

**Result:**
- Low confidence (0.45)
- Providers disagree based on use case
- Story explains nuance

### Example 3: CAL Learning

CAL fails to list files 3 times:

```
[CalLearningLoop] Exercise 1/5: List all JavaScript files
[CalLearningLoop] Command: find . -name '*.js'
[CalLearningLoop] ⚠️ Command failed (non-critical)
[CalLearningLoop] 🤔 Cal is stuck (3 failures). Requesting AI assistance...
[CalLearningLoop] 🧠 AI Consensus:
[CalLearningLoop]    The error "Permission denied" occurs because you're trying to search system directories...
[CalLearningLoop]    Confidence: 94%
```

CAL learns from AI consensus and stores suggestion for future attempts.

---

## 📚 Additional Resources

- **Triangle Consensus Guide:** `docs/TRIANGLE-CONSENSUS-GUIDE.md`
- **Data Tools Guide:** `docs/DATA-TOOLS-GUIDE.md`
- **Route Reference:** `docs/ROUTE-REFERENCE.md`
- **CAL Learning System:** `docs/CAL-LEARNING-SYSTEM.md`

---

**Built with ❤️ by CALOS**

*Multi-provider AI • Triangle Consensus • Autonomous Learning • CLI Tools*
