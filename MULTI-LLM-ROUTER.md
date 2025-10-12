# Multi-LLM Router Documentation

**Intelligently route requests between multiple LLM providers with automatic fallback and cost optimization.**

---

## 🎯 Overview

The Multi-LLM Router manages 4 LLM providers:

| Provider | Models | Cost | Speed | Best For |
|----------|--------|------|-------|----------|
| **OpenAI** | GPT-4, GPT-3.5 | $$$ | Fast | Reasoning, Code |
| **Anthropic** | Claude 3 Opus/Sonnet | $$$$ | Medium | Creative, Long context |
| **DeepSeek** | DeepSeek Chat | $ | Fast | Cost-effective tasks |
| **Ollama** | Llama, CodeLlama | Free | Fastest | Privacy, Offline |

**Features:**
- ✅ Smart routing based on task type
- ✅ Automatic fallback if provider fails
- ✅ Cost optimization
- ✅ Load balancing
- ✅ Usage tracking
- ✅ Soulfra cryptographic signing
- ✅ Streaming support

---

## 🚀 Quick Start

### Installation

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Install dependencies
npm install openai @anthropic-ai/sdk

# Configure API keys in .env
nano .env
```

Add to `.env`:
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
OLLAMA_API_URL=http://localhost:11434
```

### Start Ollama (for local models)

```bash
# Start Ollama service
ollama serve

# Pull a model (if not already installed)
ollama pull llama3.2:3b
```

### Test the Router

```bash
node bin/test-multi-llm-router.js
```

---

## 💻 Usage

### Basic Completion

```javascript
const MultiLLMRouter = require('./lib/multi-llm-router');

const router = new MultiLLMRouter({
  strategy: 'smart',  // 'smart', 'cheapest', 'fastest', 'best-quality'
  fallback: true,     // Try other providers if one fails
  costOptimize: true  // Use cheaper models when possible
});

// Complete a prompt
const response = await router.complete({
  prompt: 'Explain quantum computing in simple terms',
  taskType: 'reasoning',  // 'code', 'creative', 'fact', 'reasoning'
  maxTokens: 500,
  temperature: 0.7
});

console.log(response.text);
console.log(`Provider: ${response.provider}`);
console.log(`Latency: ${response.latency}ms`);
console.log(`Tokens: ${response.usage.total_tokens}`);
```

### Streaming

```javascript
const response = await router.stream(
  {
    prompt: 'Write a story about a robot',
    taskType: 'creative',
    maxTokens: 1000
  },
  (chunk) => {
    // Called for each chunk
    process.stdout.write(chunk);
  }
);

console.log(`\nFinal response from: ${response.provider}`);
```

### Force Specific Provider

```javascript
const response = await router.complete({
  prompt: 'Code review this function',
  preferredProvider: 'ollama',  // Force local Ollama
  model: 'codellama',
  maxTokens: 500
});
```

### With System Prompt

```javascript
const response = await router.complete({
  systemPrompt: 'You are an expert Python programmer.',
  prompt: 'Write a function to parse JSON',
  taskType: 'code',
  maxTokens: 300
});
```

### Multi-turn Conversation

```javascript
const response = await router.complete({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is Python?' },
    { role: 'assistant', content: 'Python is a programming language.' },
    { role: 'user', content: 'Show me an example' }
  ],
  maxTokens: 500
});
```

---

## 🧠 Routing Strategies

### 1. Smart Routing (Default)

Routes based on task type:

| Task Type | Routing Logic |
|-----------|---------------|
| **code** | Ollama CodeLlama > GPT-4 > Claude |
| **creative** | Claude > GPT-4 > DeepSeek |
| **reasoning** | GPT-4 > Claude > DeepSeek |
| **fact** | Ollama > DeepSeek > GPT-3.5 |

```javascript
const router = new MultiLLMRouter({ strategy: 'smart' });

// Automatically selects best provider for code
const response = await router.complete({
  prompt: 'Write a binary search function',
  taskType: 'code'
});
// → Routes to Ollama CodeLlama (fast, free)

// Automatically selects best for creative
const story = await router.complete({
  prompt: 'Write a short story',
  taskType: 'creative'
});
// → Routes to Claude (best at creative writing)
```

### 2. Cheapest

Always use the cheapest available provider:

```javascript
const router = new MultiLLMRouter({ strategy: 'cheapest' });

const response = await router.complete({
  prompt: 'What is 2+2?'
});
// → Routes to Ollama (free) or DeepSeek ($0.14/1M tokens)
```

### 3. Fastest

Use the fastest provider based on latency:

```javascript
const router = new MultiLLMRouter({ strategy: 'fastest' });

const response = await router.complete({
  prompt: 'Quick answer needed'
});
// → Routes to Ollama (local, instant) or fastest cloud provider
```

### 4. Best Quality

Always use the highest quality models:

```javascript
const router = new MultiLLMRouter({ strategy: 'best-quality' });

const response = await router.complete({
  prompt: 'Write important business document'
});
// → Routes to Claude Opus or GPT-4
```

---

## 🛡️ Fallback Mechanism

If the primary provider fails, automatically fallback to others:

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',
  fallback: true,    // Enable fallback
  maxRetries: 2      // Max fallback attempts
});

const response = await router.complete({
  prompt: 'Hello',
  preferredProvider: 'anthropic'  // Try Anthropic first
});

if (response.fallback) {
  console.log(`Fallback! Used ${response.provider}`);
  console.log(`Original error: ${response.originalError}`);
}
```

**Fallback order:**
1. Try preferred provider
2. If fails, try next available provider
3. Continue until success or all providers exhausted

---

## 📊 Usage Statistics

Track usage across all providers:

```javascript
const stats = router.getStats();

console.log(stats);
// {
//   totalRequests: 42,
//   successfulRequests: 40,
//   failedRequests: 2,
//   totalTokens: 15234,
//   totalCost: 0.0456,  // In USD
//   byProvider: {
//     openai: {
//       requests: 15,
//       successes: 15,
//       failures: 0,
//       tokens: 8234,
//       cost: 0.0247,
//       averageLatency: 1234
//     },
//     anthropic: { ... },
//     deepseek: { ... },
//     ollama: { ... }
//   }
// }
```

**Get available providers:**

```javascript
const available = router.getAvailableProviders();

console.log(available);
// [
//   {
//     name: 'openai',
//     models: [
//       { name: 'gpt-4', contextWindow: 8192, cost: 0.03 },
//       { name: 'gpt-3.5-turbo', contextWindow: 16385, cost: 0.0015 }
//     ],
//     stats: { requests: 15, ... }
//   },
//   ...
// ]
```

---

## 🔐 Soulfra Integration

Sign all requests and responses with Soulfra:

```javascript
const SoulfraIdentity = require('./lib/soulfra-identity');

// Load your identity
const identity = SoulfraIdentity.fromJSON(
  require('./.soulfra/identity.json')
);

// Create router with Soulfra signer
const router = new MultiLLMRouter({
  signer: identity.signer
});

// All requests/responses now signed
const response = await router.complete({
  prompt: 'Hello'
});

console.log(response.signedRequest);  // Soulfra signature
console.log(response.signedResponse); // Soulfra signature

// Verify signatures
const valid = identity.signer.verify(response.signedResponse);
console.log(`Response verified: ${valid}`);
```

**Benefits:**
- ✅ Cryptographic proof of all LLM interactions
- ✅ Tamper-proof audit trail
- ✅ Verify responses haven't been modified
- ✅ Self-sovereign identity (no OAuth)

---

## ⚙️ Configuration

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# DeepSeek
DEEPSEEK_API_KEY=sk-...

# Ollama (local)
OLLAMA_API_URL=http://localhost:11434
```

### Router Options

```javascript
const router = new MultiLLMRouter({
  // Routing strategy
  strategy: 'smart',          // 'smart', 'cheapest', 'fastest', 'best-quality'

  // Fallback settings
  fallback: true,             // Enable automatic fallback
  maxRetries: 2,              // Max fallback attempts

  // Optimization
  costOptimize: true,         // Prefer cheaper providers when possible
  loadBalance: true,          // Distribute load across providers

  // Provider-specific settings
  openaiEnabled: true,        // Enable OpenAI
  anthropicEnabled: true,     // Enable Anthropic
  deepseekEnabled: true,      // Enable DeepSeek
  ollamaEnabled: true,        // Enable Ollama

  // Soulfra signing
  signer: soulfraIdentity     // Optional: Sign all requests
});
```

### Request Options

```javascript
const response = await router.complete({
  // Required
  prompt: 'Your prompt here',

  // Optional
  systemPrompt: 'You are a helpful assistant',
  messages: [...],              // For multi-turn conversations
  taskType: 'code',             // 'code', 'creative', 'fact', 'reasoning'
  maxTokens: 1000,
  temperature: 0.7,             // 0.0 to 2.0
  preferredProvider: 'ollama',  // Force specific provider
  model: 'gpt-4'                // Force specific model
});
```

---

## 🧪 Testing

Run the test suite:

```bash
node bin/test-multi-llm-router.js
```

**Tests:**
1. ✅ Test all providers
2. ✅ Smart routing for different task types
3. ✅ Streaming
4. ✅ Cost optimization
5. ✅ Fallback mechanism
6. ✅ Usage statistics

---

## 🔧 Provider Adapters

Each provider has its own adapter:

### OpenAI Adapter
- Models: GPT-4, GPT-3.5-turbo
- Cost: $3-$30 per 1M tokens
- Best for: General reasoning, code

### Anthropic Adapter
- Models: Claude 3 Opus, Sonnet, Haiku
- Cost: $0.25-$15 per 1M tokens
- Best for: Creative writing, long context (200K tokens)

### DeepSeek Adapter
- Models: DeepSeek Chat, DeepSeek Coder
- Cost: $0.14 per 1M tokens
- Best for: Cost-effective inference

### Ollama Adapter
- Models: Llama, CodeLlama, Mistral, etc.
- Cost: Free (local)
- Best for: Privacy, offline, instant responses

---

## 📈 Performance

**Typical Latencies:**

| Provider | Latency | Context Window |
|----------|---------|----------------|
| Ollama | 50-200ms | 32K-128K |
| DeepSeek | 500-1000ms | 32K |
| OpenAI | 1000-2000ms | 8K-128K |
| Anthropic | 1000-3000ms | 200K |

**Cost Comparison:**

| Provider | 100K tokens | 1M tokens |
|----------|-------------|-----------|
| Ollama | $0.00 | $0.00 |
| DeepSeek | $0.01 | $0.14 |
| OpenAI (GPT-3.5) | $0.30 | $3.00 |
| Anthropic (Sonnet) | $0.30 | $3.00 |
| OpenAI (GPT-4) | $3.00 | $30.00 |

---

## 🐛 Troubleshooting

### "No LLM providers available"

**Solution:**
```bash
# Check .env file has API keys
cat .env

# Or start Ollama
ollama serve
```

### "OpenAI API key invalid"

**Solution:**
```bash
# Verify API key
export OPENAI_API_KEY=sk-...
node -e "console.log(process.env.OPENAI_API_KEY)"

# Test with OpenAI CLI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### "Ollama provider not available"

**Solution:**
```bash
# Start Ollama service
ollama serve

# Pull a model
ollama pull llama3.2:3b

# Test connection
curl http://localhost:11434/api/tags
```

### "All providers failed"

**Solution:**
- Check internet connection
- Verify all API keys are valid
- Check provider status pages
- Enable fallback: `fallback: true`

---

## 🎉 Next Steps

**Phase 2: Blackbox Security**
- Encrypt API keys with Soulfra
- Code obfuscation
- Runtime integrity checks
- Trademark watermarking

**Phase 3: Device Sync**
- iPhone ↔ Mac database sync
- iCloud CloudKit integration
- Offline-first operation

**Phase 4: Voice Interface**
- Speech-to-text (Whisper)
- Text-to-speech (already built)
- Wake word detection

---

**You now have a production-ready multi-LLM router with intelligent routing, automatic fallback, and cost optimization!** 🚀