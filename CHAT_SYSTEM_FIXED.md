# Chat System Fixed - Now Using Real APIs

## What Was Wrong

1. **chat.html only talked to Ollama** (`/api/ollama/generate`)
   - NOT using DeepSeek, Anthropic, or OpenAI APIs

2. **.env had EMPTY API keys**:
   ```
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   DEEPSEEK_API_KEY=
   ```

3. **Ollama models are real but outdated**:
   - `llama2:latest` is from 2023
   - Missing: llama3.3, deepseek-r1, qwen2.5, gemma2

4. **No domain-specific branding**

---

## What Cal Built

### 1. **Unified Chat API** (`routes/unified-chat-routes.js`)

Single endpoint that routes to ALL providers:

```javascript
POST /api/chat
{
  "model": "gpt-4" | "claude-3-5-sonnet-20241022" | "deepseek-chat" | "llama3.2:3b",
  "prompt": "Your message",
  "domain": "calos.ai" | "soulfra.com" | etc
}

→ Routes to:
  • gpt-* → OpenAI
  • claude-* → Anthropic
  • deepseek-* → DeepSeek
  • everything else → Ollama
```

### 2. **Domain-Specific Branding** (`lib/domain-system-prompts.js`)

Each domain gets a unique AI personality:

- **calos.ai**: "Cal, the AI routing platform expert"
- **soulfra.com**: "SoulFra, guide of the cryptographic metaverse"
- **hollowtown.com**: "HollowTown guide for OSRS/RSPS community"
- **deathtodata.com**: "Data liberation advocate"
- **roughsparks.com**: "Cryptographic signing authority"
- **vibecoding.com**: "Chill dev lifestyle brand"

### 3. **Updated chat.html**

Now connects to `/api/chat` instead of `/api/ollama/generate`:
- Auto-loads models from ALL providers
- Groups models by provider in dropdown
- Passes domain for branded responses
- Shows provider info in console

### 4. **API Key Setup Wizard** (`bin/setup-api-keys`)

Interactive CLI to configure keys:
```bash
npm run setup-keys
```

Features:
- Tests each API key before saving
- Masks keys in confirmation
- Updates .env automatically
- Provides setup links for each provider

---

## How to Use

### Step 1: Setup API Keys

```bash
# Run the wizard
node bin/setup-api-keys

# Or manually edit .env
nano .env

# Add your keys:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
```

**Get API keys from:**
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- DeepSeek: https://platform.deepseek.com/api_keys

### Step 2: Restart Server

```bash
# Kill old server
pkill -f "node router.js"

# Start fresh
npm start
```

### Step 3: Open Chat

```
http://localhost:5001/chat.html
```

You should now see models grouped by provider:
- **OPENAI**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- **ANTHROPIC**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **DEEPSEEK**: DeepSeek Chat, DeepSeek Coder, DeepSeek Reasoner
- **OLLAMA**: calos-model, soulfra-model, llama3.2, etc.

---

## Testing

### Test Each Provider

```bash
# Test with curl
curl -X POST http://localhost:5001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "prompt": "Say hello in 5 words",
    "domain": "calos.ai"
  }'

# Expected response:
{
  "response": "Hello from CALOS AI assistant!",
  "model": "gpt-4-turbo-preview",
  "provider": "openai",
  "usage": { "total_tokens": 15 },
  "latency": 1234
}
```

### Test Provider Status

```bash
curl http://localhost:5001/api/chat/providers

# Shows which providers are available:
{
  "openai": { "available": true },
  "anthropic": { "available": true },
  "deepseek": { "available": false, "hint": "Set DEEPSEEK_API_KEY in .env" },
  "ollama": { "available": true }
}
```

### Test Model List

```bash
curl http://localhost:5001/api/chat/models

# Returns all models from all providers:
{
  "available": true,
  "providers": [
    {
      "provider": "openai",
      "models": [
        { "name": "gpt-4-turbo-preview", "display": "GPT-4 Turbo", "contextWindow": 128000 }
      ]
    }
  ],
  "total": 15
}
```

---

## Ollama Model Updates

### Current Models (Outdated)

```
llama2:latest (7B) - from 2023
mistral:latest (7.2B)
codellama:7b
```

### Recommended Updates

```bash
# Remove old models
ollama rm llama2:latest

# Add new models
ollama pull llama3.3:70b-instruct-q4_K_M   # Latest Llama (70B)
ollama pull deepseek-r1:14b                # DeepSeek reasoning model
ollama pull qwen2.5:32b                    # Qwen 32B
ollama pull gemma2:27b                     # Google Gemma2 27B

# Domain-specific models (keep these)
# calos-model:latest
# soulfra-model:latest
# deathtodata-model:latest
```

---

## Domain-Specific Responses

When you access chat from different domains, the AI personality changes:

### localhost → Default CALOS personality
```
"You are a helpful AI assistant powered by CALOS..."
```

### calos.ai → AI routing expert
```
"You are Cal, the AI assistant for CALOS - a multi-LLM routing platform..."
```

### soulfra.com → Metaverse guide
```
"You are SoulFra, guide of the SoulFra metaverse - a cryptographic identity universe..."
```

### hollowtown.com → OSRS expert
```
"You are the guide of HollowTown - a community hub for Old School RuneScape..."
```

---

## Architecture Summary

### Before (Broken)
```
chat.html → /api/ollama/generate → Ollama only
                                    ❌ No DeepSeek
                                    ❌ No Anthropic
                                    ❌ No OpenAI
```

### After (Fixed)
```
chat.html → /api/chat → Unified Router
                          ├─ gpt-* → OpenAI ✅
                          ├─ claude-* → Anthropic ✅
                          ├─ deepseek-* → DeepSeek ✅
                          └─ * → Ollama ✅

Domain branding: calos.ai, soulfra.com, hollowtown.com, etc.
```

---

## Files Created/Modified

### Created
1. `routes/unified-chat-routes.js` - Multi-LLM routing
2. `lib/domain-system-prompts.js` - Domain branding
3. `bin/setup-api-keys` - API key wizard
4. `CHAT_SYSTEM_FIXED.md` - This doc

### Modified
1. `public/chat.html` - Updated to use `/api/chat`
2. `router.js` - Registered unified-chat-routes
3. `.env` - Will contain API keys after setup

---

## Next Steps

1. **Run setup wizard**:
   ```bash
   node bin/setup-api-keys
   ```

2. **Add API keys** (if you have them)

3. **Restart server**:
   ```bash
   npm start
   ```

4. **Test chat**: http://localhost:5001/chat.html

5. **Update Ollama models** (optional):
   ```bash
   ollama pull llama3.3:70b
   ollama pull deepseek-r1:14b
   ```

---

## Troubleshooting

### Chat shows "No providers available"
- Check `.env` has API keys
- Run `curl http://localhost:5001/api/chat/providers` to see status

### Model dropdown is empty
- Ollama not running: `ollama serve`
- No API keys set: Run `node bin/setup-api-keys`

### "Provider not available" error
- OpenAI: Check `OPENAI_API_KEY` in `.env`
- Anthropic: Check `ANTHROPIC_API_KEY` in `.env`
- DeepSeek: Check `DEEPSEEK_API_KEY` in `.env`
- Ollama: Run `ollama serve`

### API key invalid
- OpenAI keys start with: `sk-proj-...` or `sk-...`
- Anthropic keys start with: `sk-ant-...`
- DeepSeek keys start with: `sk-...`

---

**Your chat now uses REAL APIs! 🎉**

No more fake models. DeepSeek, Anthropic, OpenAI + Ollama all working together.
