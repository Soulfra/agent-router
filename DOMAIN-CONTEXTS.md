# Domain Contexts & Routing Strategies

**Intelligent task-based routing across 4 LLM providers with automatic model selection.**

---

## 🎯 Overview

The CalOS Multi-LLM Router automatically selects the best provider and model based on **task type** (domain context). This ensures optimal performance, cost-efficiency, and quality for every request.

### 5 Domain Contexts

| Context | Description | Best For | Routing Logic |
|---------|-------------|----------|---------------|
| **`code`** | Programming, debugging, code review | Function generation, bug fixes, refactoring | CodeLlama (Ollama) > DeepSeek Coder > GPT-4 > Claude |
| **`creative`** | Writing, stories, creative content | Creative writing, poetry, storytelling | Claude > GPT-4 > DeepSeek > Ollama |
| **`reasoning`** | Complex analysis, logic, explanations | Philosophy, logic, complex explanations | DeepSeek Reasoner > GPT-4 > Claude > Ollama |
| **`fact`** | Simple factual queries | Facts, definitions, basic knowledge | Ollama > DeepSeek > GPT-3.5 |
| **`simple`** | Basic questions | Math, simple answers | Ollama (free and instant) |

---

## 🚀 Quick Start

### Automatic Task Detection

The router automatically infers task type from your prompt:

```javascript
const response = await router.complete({
  prompt: 'Write a function to reverse a string'
  // Automatically detects: taskType = 'code'
  // Routes to: CodeLlama (Ollama)
});
```

### Explicit Task Type

Or specify explicitly for better control:

```javascript
const response = await router.complete({
  prompt: 'Explain the halting problem',
  taskType: 'reasoning'
  // Routes to: DeepSeek Reasoner (thinking mode)
});
```

---

## 📊 Domain Context Details

### 1. Code Context (`code`)

**Use for:**
- Function generation
- Code debugging
- Code review
- Algorithm implementation
- Refactoring

**Routing logic:**
```
Ollama CodeLlama > DeepSeek Coder > GPT-4 > Claude
```

**Why:**
- CodeLlama: Specialized for code, free, fast
- DeepSeek Coder: Excellent code understanding, very cheap ($0.14/1M tokens)
- GPT-4: High quality code generation
- Claude: Good fallback for code

**Examples:**

```javascript
// Function generation
await router.complete({
  prompt: 'Write a Python function to calculate fibonacci sequence',
  taskType: 'code',
  temperature: 0.2 // Lower temperature for deterministic code
});

// Debugging
await router.complete({
  prompt: 'Debug this function: def add(a,b): return a+b+c',
  taskType: 'code',
  maxTokens: 300
});

// Code review
await router.complete({
  systemPrompt: 'You are an expert code reviewer.',
  prompt: 'Review this function for bugs and improvements:\n\n```python\n...\n```',
  taskType: 'code'
});
```

**Model Selection:**
- Ollama automatically uses `codellama:7b-instruct` for code tasks
- DeepSeek automatically uses `deepseek-coder` if available

---

### 2. Creative Context (`creative`)

**Use for:**
- Creative writing
- Storytelling
- Poetry
- Marketing copy
- Content generation

**Routing logic:**
```
Claude > GPT-4 > DeepSeek > Ollama
```

**Why:**
- Claude: Best at creative writing, nuanced language
- GPT-4: Excellent creative capabilities
- DeepSeek: Good fallback, cost-effective
- Ollama: Basic creative writing

**Examples:**

```javascript
// Creative writing
await router.complete({
  prompt: 'Write a short story about a robot discovering emotions',
  taskType: 'creative',
  maxTokens: 1000,
  temperature: 0.9 // Higher temperature for creativity
});

// Poetry
await router.complete({
  prompt: 'Write a haiku about artificial intelligence',
  taskType: 'creative',
  temperature: 0.8
});

// Marketing copy
await router.complete({
  systemPrompt: 'You are a creative copywriter.',
  prompt: 'Write a compelling product description for an AI-powered notebook',
  taskType: 'creative'
});
```

---

### 3. Reasoning Context (`reasoning`)

**Use for:**
- Complex explanations
- Logical analysis
- Philosophy
- Problem-solving
- Chain-of-thought reasoning

**Routing logic:**
```
DeepSeek Reasoner > GPT-4 > Claude > Ollama
```

**Why:**
- DeepSeek Reasoner: Thinking mode (like GPT-o1), excellent for complex reasoning
- GPT-4: Strong reasoning capabilities
- Claude: Good at explanations
- Ollama: Basic reasoning

**Examples:**

```javascript
// Philosophy
await router.complete({
  prompt: 'Explain the philosophical implications of the Chinese Room argument',
  taskType: 'reasoning',
  maxTokens: 600,
  temperature: 0.7
});

// Logical analysis
await router.complete({
  prompt: 'If all A are B, and all B are C, what can we conclude about A and C?',
  taskType: 'reasoning',
  temperature: 0.3 // Lower for precise logic
});

// Problem-solving
await router.complete({
  prompt: 'Analyze the pros and cons of nuclear energy from environmental, economic, and safety perspectives',
  taskType: 'reasoning',
  maxTokens: 800
});
```

**DeepSeek Reasoner Model:**
When routing to DeepSeek for reasoning tasks, the router may use `deepseek-reasoner` model which includes:
- Extended "thinking time" before responding
- Chain-of-thought reasoning visible in response
- Higher quality reasoning outputs

---

### 4. Fact Context (`fact`)

**Use for:**
- Factual queries
- Definitions
- Historical information
- Basic knowledge

**Routing logic:**
```
Ollama > DeepSeek > GPT-3.5
```

**Why:**
- Ollama: Free, fast, good for simple facts
- DeepSeek: Very cheap, accurate facts
- GPT-3.5: Fallback for facts

**Examples:**

```javascript
// Simple facts
await router.complete({
  prompt: 'What is the capital of France?',
  taskType: 'fact',
  maxTokens: 50,
  temperature: 0.1 // Very low for factual accuracy
});

// Historical facts
await router.complete({
  prompt: 'When did World War II end?',
  taskType: 'fact',
  maxTokens: 100
});

// Definitions
await router.complete({
  prompt: 'Define quantum entanglement',
  taskType: 'fact',
  maxTokens: 200
});
```

---

### 5. Simple Context (`simple`)

**Use for:**
- Basic math
- Simple questions
- Quick answers

**Routing logic:**
```
Ollama (free and instant)
```

**Why:**
- Ollama: Free, instant, more than sufficient for simple tasks

**Examples:**

```javascript
// Basic math
await router.complete({
  prompt: 'What is 2 + 2?',
  taskType: 'simple',
  maxTokens: 20,
  temperature: 0.0
});

// Simple questions
await router.complete({
  prompt: 'How many days are in a year?',
  taskType: 'simple',
  maxTokens: 20
});
```

---

## 🔀 Routing Strategies

The router supports 4 routing strategies:

### 1. Smart (Default)

**Task-based routing with intelligent provider selection.**

```javascript
const router = new MultiLLMRouter({ strategy: 'smart' });

await router.complete({
  prompt: 'Write a function...',
  taskType: 'code'
});
// Routes to CodeLlama (best for code)

await router.complete({
  prompt: 'Write a story...',
  taskType: 'creative'
});
// Routes to Claude (best for creative)
```

**Logic:** Uses task type to select optimal provider

**Best for:** General use, quality-focused

---

### 2. Cheapest

**Always use the cheapest available provider.**

```javascript
const router = new MultiLLMRouter({ strategy: 'cheapest' });

await router.complete({
  prompt: 'Any prompt'
});
// Always routes to: Ollama (free) or DeepSeek ($0.14/1M)
```

**Logic:** Cost priority: Ollama ($0) > DeepSeek ($0.14) > OpenAI ($3) > Anthropic ($15)

**Best for:** High-volume, cost-sensitive applications

---

### 3. Fastest

**Use the provider with lowest average latency.**

```javascript
const router = new MultiLLMRouter({ strategy: 'fastest' });

await router.complete({
  prompt: 'Quick response needed'
});
// Routes to provider with best latency stats
// Typically: Ollama (local, ~200ms)
```

**Logic:** Uses latency statistics from previous requests

**Best for:** Real-time applications, low latency requirements

---

### 4. Best Quality

**Always use the highest quality models.**

```javascript
const router = new MultiLLMRouter({ strategy: 'best-quality' });

await router.complete({
  prompt: 'Important business document'
});
// Always routes to: Claude Opus or GPT-4
```

**Logic:** Quality priority: Anthropic (4) > OpenAI (3) > DeepSeek (2) > Ollama (1)

**Best for:** Critical content, quality-focused applications

---

## 🧪 Testing

### Run Comprehensive Tests

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Test all domain contexts and routing strategies
node bin/test-domain-contexts.js
```

**Tests:**
- ✅ Code generation & debugging
- ✅ Creative writing & poetry
- ✅ Complex reasoning & logic
- ✅ Factual queries & definitions
- ✅ Simple math & basic questions
- ✅ All 4 routing strategies
- ✅ Parameter variations (temperature, length, system prompts)
- ✅ Fallback mechanism

### Quick Test

```javascript
const MultiLLMRouter = require('./lib/multi-llm-router');

const router = new MultiLLMRouter({ strategy: 'smart' });

// Test code context
const codeResponse = await router.complete({
  prompt: 'Write a function to reverse a string',
  taskType: 'code'
});

console.log(`Provider: ${codeResponse.provider}`);
console.log(`Model: ${codeResponse.model}`);
console.log(`Response: ${codeResponse.text}`);
```

---

## ⚙️ Configuration

### Router Options

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',        // 'smart', 'cheapest', 'fastest', 'best-quality'
  fallback: true,           // Auto-fallback if provider fails
  costOptimize: true,       // Prefer cheaper providers
  loadBalance: true         // Distribute load
});
```

### Request Options

```javascript
const response = await router.complete({
  // Required
  prompt: 'Your prompt',

  // Task type (optional, auto-detected if not provided)
  taskType: 'code' | 'creative' | 'reasoning' | 'fact' | 'simple',

  // Optional parameters
  systemPrompt: 'You are a helpful assistant',
  maxTokens: 1000,
  temperature: 0.7,        // 0.0 (deterministic) to 2.0 (very creative)

  // Force specific provider/model (overrides routing)
  preferredProvider: 'ollama',
  model: 'codellama:7b-instruct'
});
```

### Provider-Specific Configuration

#### Ollama

```javascript
const router = new MultiLLMRouter({
  ollamaEnabled: true,
  ollamaConfig: {
    baseURL: 'http://localhost:11434',
    defaultModel: 'llama3.2:3b',
    codeModel: 'codellama:7b-instruct' // Used for code tasks
  }
});
```

#### DeepSeek

```javascript
const router = new MultiLLMRouter({
  deepseekEnabled: true,
  deepseekConfig: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: 'deepseek-chat',
    // Reasoner model used for reasoning tasks
  }
});
```

---

## 📈 Performance Characteristics

### Typical Latencies

| Provider | Model | Latency | Context Window |
|----------|-------|---------|----------------|
| Ollama | llama3.2:3b | 200-500ms | 128K |
| Ollama | codellama:7b | 300-800ms | 16K |
| DeepSeek | deepseek-chat | 500-1500ms | 32K |
| DeepSeek | deepseek-reasoner | 2000-5000ms | 32K (thinking mode) |
| OpenAI | gpt-3.5-turbo | 1000-2000ms | 16K |
| OpenAI | gpt-4 | 2000-4000ms | 8K |
| Anthropic | claude-3-sonnet | 1500-3000ms | 200K |

### Cost Comparison (per 1M tokens)

| Provider | Model | Cost |
|----------|-------|------|
| Ollama | All models | $0.00 (local) |
| DeepSeek | deepseek-chat | $0.14 |
| DeepSeek | deepseek-coder | $0.14 |
| DeepSeek | deepseek-reasoner | $0.55 |
| OpenAI | gpt-3.5-turbo | $3.00 |
| OpenAI | gpt-4 | $30.00 |
| Anthropic | claude-3-sonnet | $3.00 |
| Anthropic | claude-3-opus | $15.00 |

---

## 🎯 Best Practices

### 1. Use Explicit Task Types

For critical requests, specify task type explicitly:

```javascript
// Good: Explicit task type
await router.complete({
  prompt: 'Implement a binary search tree',
  taskType: 'code'
});

// OK: Auto-detection (less precise)
await router.complete({
  prompt: 'Implement a binary search tree'
  // Router infers: taskType = 'code'
});
```

### 2. Adjust Temperature by Task

Different tasks need different creativity levels:

```javascript
// Code: Low temperature (deterministic)
await router.complete({
  prompt: 'Write a function...',
  taskType: 'code',
  temperature: 0.2
});

// Creative: High temperature (creative)
await router.complete({
  prompt: 'Write a story...',
  taskType: 'creative',
  temperature: 0.9
});

// Facts: Very low temperature (accurate)
await router.complete({
  prompt: 'What is...',
  taskType: 'fact',
  temperature: 0.1
});
```

### 3. Use System Prompts for Context

Provide context via system prompts:

```javascript
await router.complete({
  systemPrompt: 'You are an expert Python developer with 10 years of experience.',
  prompt: 'Review this code for security vulnerabilities',
  taskType: 'code'
});
```

### 4. Set Appropriate Max Tokens

Different tasks need different response lengths:

```javascript
// Simple: Short response
await router.complete({
  prompt: 'What is 2+2?',
  taskType: 'simple',
  maxTokens: 20
});

// Complex: Longer response
await router.complete({
  prompt: 'Explain quantum mechanics',
  taskType: 'reasoning',
  maxTokens: 1000
});
```

### 5. Enable Fallback

Always enable fallback for production:

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',
  fallback: true,  // Auto-fallback if provider fails
  maxRetries: 2    // Try up to 2 alternatives
});
```

---

## 🐛 Troubleshooting

### "No providers available"

**Cause:** No LLM providers configured or available

**Solution:**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Or configure API keys in .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
```

### Wrong provider selected

**Cause:** Task type not specified or incorrectly inferred

**Solution:** Explicitly specify task type
```javascript
await router.complete({
  prompt: 'Your prompt',
  taskType: 'code' // Explicit task type
});
```

### Model not found (Ollama)

**Cause:** Requested model not installed

**Solution:**
```bash
# Check installed models
ollama list

# Pull model
ollama pull codellama:7b-instruct
```

### DeepSeek API key invalid

**Cause:** Missing or invalid API key

**Solution:**
```bash
# Get API key from https://platform.deepseek.com/api_keys
# Add to .env
echo "DEEPSEEK_API_KEY=sk-..." >> .env
```

---

## 🎉 Next Steps

**Phase 1: Production Deployment** ✅
- OpenAPI specification generated
- Domain contexts tested
- Model routing optimized

**Phase 2: Advanced Features** (Future)
- Caching layer for common queries
- Response quality scoring
- Adaptive routing based on feedback
- Model fine-tuning integration

**Phase 3: Monitoring & Analytics** (Future)
- Real-time performance dashboards
- Cost tracking by context
- Quality metrics per provider
- A/B testing framework

---

**You now have a production-ready multi-LLM router with intelligent domain-based routing!** 🚀
