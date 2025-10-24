# Provider Test Scripts

Test each AI provider individually before running Triangle Consensus.

## Quick Start

```bash
# Test all providers at once
node scripts/test-all-providers.js

# Or test individually
node scripts/test-openai.js
node scripts/test-anthropic.js
node scripts/test-deepseek.js
```

## Setup

1. **Add API keys to `.env` file:**

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
```

2. **Run tests:**

Each script will:
- ✓ Verify API key exists
- ✓ Make a test query ("What is 2+2?")
- ✓ Show response and cost
- ✓ Report success/failure

## Individual Provider Tests

### OpenAI
```bash
node scripts/test-openai.js
```

Tests: `gpt-4` model
Cost: ~$0.0018 per test

### Anthropic
```bash
node scripts/test-anthropic.js
```

Tests: `claude-3-sonnet-20240229` model
Cost: ~$0.0003 per test

### DeepSeek
```bash
node scripts/test-deepseek.js
```

Tests: `deepseek-chat` model
Cost: ~$0.00003 per test (cheapest!)

## All Providers Test

```bash
node scripts/test-all-providers.js
```

Runs all three tests sequentially and shows summary:
```
📊 TEST SUMMARY
✅ Passed: 3/3
   ✓ test-openai
   ✓ test-anthropic
   ✓ test-deepseek

🎯 ALL PROVIDERS WORKING!
🔺 Triangle Consensus System is ready to use!
```

## Common Issues

### API Key Not Found
```
❌ OPENAI_API_KEY not found in .env file
```

**Fix:** Add your API key to `.env`

### Invalid API Key
```
❌ FAILED! OpenAI API error:
   Status: 401
```

**Fix:** Check your API key is correct and not expired

### No Credits
```
❌ FAILED! OpenAI API error:
   Status: 429
```

**Fix:** Add billing/credits to your provider account

### Rate Limited
```
❌ FAILED! Rate limit exceeded
```

**Fix:** Wait a few seconds and try again

## After All Tests Pass

Once all 3 providers work, you can use Triangle Consensus:

```bash
curl -X POST http://localhost:5001/api/chat/triangle \
  -H "Content-Type: application/json" \
  -H "x-user-id: YOUR_USER_ID" \
  -d '{
    "prompt": "What is the capital of France?",
    "synthesize": true,
    "generateStory": true
  }'
```

This will query all 3 providers, calculate consensus, and generate a story!
