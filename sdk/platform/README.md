# @calos/sdk

**Official JavaScript/TypeScript SDK for the CALOS AI Platform**

Integrate multi-LLM AI routing with usage-based billing into your applications. CALOS automatically routes requests to the best available provider (OpenAI, Anthropic, DeepSeek, Ollama) with transparent usage tracking.

[![npm version](https://badge.fury.io/js/%40calos%2Fsdk.svg)](https://www.npmjs.com/package/@calos/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🤖 **Multi-LLM Routing** - Auto-route between OpenAI, Anthropic, DeepSeek, Ollama
- 💰 **Usage-Based Billing** - Pay-per-token with transparent tracking
- 📊 **Real-Time Analytics** - Track tokens, costs, and provider usage
- 🔒 **Type-Safe** - Full TypeScript support with autocomplete
- 🚀 **Zero Dependencies** - Lightweight, works everywhere
- ⚡ **Streaming Support** - Server-sent events for real-time responses
- 🔄 **Automatic Retries** - Built-in exponential backoff
- 🎯 **Error Handling** - Custom error types for every scenario

## Installation

```bash
npm install @calos/sdk
```

or

```bash
yarn add @calos/sdk
```

or

```bash
pnpm add @calos/sdk
```

## Quick Start

```javascript
import { CALOS } from '@calos/sdk';

const calos = new CALOS({
  apiKey: 'sk-tenant-abc123' // Get from https://calos.dev/dashboard
});

// Simple completion
const response = await calos.chat.complete({
  prompt: 'Write a recipe for chocolate cake',
  model: 'gpt-4' // Optional - auto-routes if not specified
});

console.log(response.content);
console.log(`Used ${response.usage.total_tokens} tokens via ${response.provider}`);
```

## Configuration

### Basic Setup

```javascript
const calos = new CALOS({
  apiKey: 'sk-tenant-abc123',           // Required: Your CALOS API key
  baseURL: 'https://api.calos.dev',     // Optional: Custom endpoint
  timeout: 60000,                       // Optional: Request timeout (ms)
  maxRetries: 3,                        // Optional: Max retry attempts
  headers: {                            // Optional: Custom headers
    'X-Custom-Header': 'value'
  }
});
```

### TypeScript

```typescript
import { CALOS, ChatCompletionParams, ChatCompletionResponse } from '@calos/sdk';

const calos = new CALOS({
  apiKey: process.env.CALOS_API_KEY!
});

const params: ChatCompletionParams = {
  prompt: 'Explain quantum computing',
  model: 'claude-3-opus',
  maxTokens: 1000,
  temperature: 0.7
};

const response: ChatCompletionResponse = await calos.chat.complete(params);
```

## API Reference

### Chat Completions

#### `calos.chat.complete(params)`

Create a chat completion.

```javascript
const response = await calos.chat.complete({
  prompt: 'Write a haiku about AI',
  model: 'gpt-4',           // Optional: Specific model
  maxTokens: 500,           // Optional: Max output tokens
  temperature: 0.7          // Optional: Sampling temperature (0-1)
});

console.log(response.content);      // Generated text
console.log(response.usage);        // Token usage stats
console.log(response.provider);     // LLM provider used
```

**Response:**
```javascript
{
  content: "Silicon minds think...",
  usage: {
    prompt_tokens: 10,
    completion_tokens: 50,
    total_tokens: 60,
    provider: "openai"
  },
  provider: "openai",
  model: "gpt-4"
}
```

#### `calos.chat.stream(params, onChunk)`

Create a streaming chat completion.

```javascript
const response = await calos.chat.stream({
  prompt: 'Tell me a story',
  model: 'claude-3-opus'
}, (chunk) => {
  process.stdout.write(chunk); // Print each chunk as it arrives
});

console.log('\nFinal usage:', response.usage);
```

### Usage Tracking

#### `calos.usage.getCurrent()`

Get current billing period usage.

```javascript
const usage = await calos.usage.getCurrent();

console.log(`Tokens used: ${usage.tokens_used_this_period.toLocaleString()}`);
console.log(`Cost this period: $${(usage.cost_this_period_cents / 100).toFixed(2)}`);
console.log(`Billing ends: ${usage.current_period_end}`);
```

**Response:**
```javascript
{
  tokens_used_this_period: 5000000,
  tokens_limit: 10000000,
  cost_this_period_cents: 1000,
  cost_limit_cents: 5000,
  api_calls_this_period: 250,
  current_period_end: "2025-02-10T00:00:00Z",
  pricing_model: "hybrid",
  markup_percent: 50
}
```

#### `calos.usage.getByProvider(options)`

Get usage breakdown by LLM provider.

```javascript
const providers = await calos.usage.getByProvider({ days: 30 });

providers.forEach(p => {
  console.log(`${p.provider}: ${p.total_tokens.toLocaleString()} tokens`);
  console.log(`  Cost: $${(p.total_cost_cents / 100).toFixed(2)}`);
  console.log(`  Requests: ${p.requests.toLocaleString()}`);
});
```

#### `calos.usage.getUnbilled()`

Get unbilled usage for current period.

```javascript
const unbilled = await calos.usage.getUnbilled();

console.log(`Unbilled requests: ${unbilled.unbilled_requests}`);
console.log(`Projected invoice: $${(unbilled.unbilled_cost_cents / 100).toFixed(2)}`);
```

### Tenant Management (Super Admin Only)

#### `calos.tenants.list()`

List all tenants.

```javascript
const tenants = await calos.tenants.list();
console.log(`Total tenants: ${tenants.length}`);
```

#### `calos.tenants.get(tenantId)`

Get specific tenant details.

```javascript
const tenant = await calos.tenants.get('tenant-uuid');
console.log(`Tenant: ${tenant.name} (${tenant.status})`);
```

#### `calos.tenants.update(tenantId, updates)`

Update tenant settings.

```javascript
const updated = await calos.tenants.update('tenant-uuid', {
  status: 'active',
  max_users: 100
});
```

## Error Handling

The SDK provides specific error classes for different scenarios:

```javascript
import {
  CALOS,
  AuthenticationError,
  RateLimitError,
  UsageLimitError,
  APIError
} from '@calos/sdk';

const calos = new CALOS({ apiKey: 'sk-tenant-abc123' });

try {
  const response = await calos.chat.complete({ prompt: 'Hello!' });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof UsageLimitError) {
    console.error('Usage limit exceeded - upgrade plan or wait for next period');
    console.log(error.response.usage); // Show current usage
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited - retry after delay');
  } else if (error instanceof APIError) {
    console.error(`API error ${error.statusCode}: ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Advanced Examples

### Streaming with Progress

```javascript
let totalTokens = 0;

const response = await calos.chat.stream({
  prompt: 'Write a long essay about AI ethics',
  maxTokens: 2000
}, (chunk) => {
  process.stdout.write(chunk);
  totalTokens += chunk.length; // Rough estimate
});

console.log(`\n\nGenerated ${response.usage.completion_tokens} tokens`);
```

### Retry Logic with Exponential Backoff

The SDK automatically retries failed requests with exponential backoff:

```javascript
const calos = new CALOS({
  apiKey: 'sk-tenant-abc123',
  maxRetries: 5  // Retry up to 5 times
});

// Automatically retries on network errors
const response = await calos.chat.complete({ prompt: 'Hello' });
```

### Custom Tenant Subdomain

```javascript
const calos = new CALOS({
  apiKey: 'sk-tenant-abc123',
  baseURL: 'https://yourcompany.calos.dev' // Your whitelabel domain
});
```

### Usage Monitoring

```javascript
// Check usage before making request
const usage = await calos.usage.getCurrent();

if (usage.tokens_used_this_period >= usage.tokens_limit * 0.9) {
  console.warn('Warning: 90% of token quota used!');
}

// Make request
const response = await calos.chat.complete({
  prompt: 'Summarize this article...'
});

// Get updated usage
const newUsage = await calos.usage.getCurrent();
console.log(`Used ${response.usage.total_tokens} tokens`);
```

## Framework Integration

### Next.js API Route

```javascript
// app/api/chat/route.js
import { CALOS } from '@calos/sdk';
import { NextResponse } from 'next/server';

const calos = new CALOS({ apiKey: process.env.CALOS_API_KEY });

export async function POST(request) {
  const { prompt } = await request.json();

  try {
    const response = await calos.chat.complete({ prompt });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Express.js

```javascript
const express = require('express');
const { CALOS } = require('@calos/sdk');

const app = express();
const calos = new CALOS({ apiKey: process.env.CALOS_API_KEY });

app.post('/api/chat', async (req, res) => {
  try {
    const response = await calos.chat.complete({
      prompt: req.body.prompt
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

### React Hook

```typescript
import { useState } from 'react';
import { CALOS } from '@calos/sdk';

const calos = new CALOS({ apiKey: process.env.NEXT_PUBLIC_CALOS_API_KEY });

export function useChat() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const complete = async (prompt: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await calos.chat.complete({ prompt });
      setResponse(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { complete, loading, response, error };
}
```

## Environment Variables

```bash
# .env
CALOS_API_KEY=sk-tenant-abc123
CALOS_BASE_URL=https://api.calos.dev  # Optional
```

```javascript
import { CALOS } from '@calos/sdk';

const calos = new CALOS({
  apiKey: process.env.CALOS_API_KEY
});
```

## Rate Limits

CALOS automatically handles rate limiting with exponential backoff. If you exceed rate limits, the SDK will retry automatically (up to `maxRetries`).

```javascript
const calos = new CALOS({
  apiKey: 'sk-tenant-abc123',
  maxRetries: 5  // Default: 3
});
```

## Usage-Based Pricing

CALOS supports three pricing models:

1. **Pure Metered**: $0.20 per 1M tokens
2. **BYOK (Bring Your Own Key)**: $20-50/month platform fee, use your own API keys
3. **Hybrid**: $10/month + $0.15 per 1M tokens (1M tokens free)

Check your current usage:

```javascript
const usage = await calos.usage.getCurrent();
console.log(`Pricing model: ${usage.pricing_model}`);
console.log(`Cost this period: $${(usage.cost_this_period_cents / 100).toFixed(2)}`);
```

## Supported Models

CALOS automatically routes to the best available provider:

- **OpenAI**: gpt-4, gpt-4-turbo, gpt-3.5-turbo
- **Anthropic**: claude-3-opus, claude-3-sonnet, claude-3-haiku
- **DeepSeek**: deepseek-chat, deepseek-coder
- **Ollama**: llama2, mistral, codellama (local/self-hosted)

Leave `model` unspecified for automatic routing, or specify a model explicitly.

## Requirements

- Node.js >= 18.0.0
- Modern fetch API (built into Node 18+)

## License

MIT

## Support

- **Documentation**: https://docs.calos.dev/sdk
- **API Reference**: https://docs.calos.dev/api
- **Dashboard**: https://calos.dev/dashboard
- **GitHub**: https://github.com/soulfra/calos
- **Discord**: https://discord.gg/calos
- **Email**: support@calos.dev

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

**Built with ❤️ by the CALOS team**
