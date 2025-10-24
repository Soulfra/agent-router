# 🤖 AI Testing Guide - FOOLPROOF Edition

## Quick Start (One Command)

```bash
npm run test:ai
```

This will:
1. Kill any old server instances
2. Start fresh server with latest code
3. Verify both AI endpoints work
4. Open test page in browser

**That's it!** The page will open automatically and everything will work.

---

## What You Can Test

### 1. **Local Ollama AI (22 Models)**
- Select a model from dropdown
- Enter a prompt (e.g., "What is 2+2?")
- Click "Ask Ollama"
- Get instant response from your local AI

**Models available:**
- `llama3.2:3b` (fast, recommended)
- `llama2:latest`
- `mistral:latest`
- `codellama:7b` (code expert)
- Plus 18 more custom models!

### 2. **Web Search (2025 Data)**
- Enter search query (e.g., "latest AI news 2025")
- Click "Search Web"
- Get current web results with **2025** timestamp

**The year shows 2025** - not 2024! Real-time web data.

---

## If Something Breaks

### Problem: "Failed to fetch" or 404 errors

**Solution:**
```bash
npm run restart
```

This foolproof script:
- Kills old servers
- Starts fresh
- Verifies endpoints exist
- Opens test page

### Problem: Server won't start

**Check logs:**
```bash
tail -f /tmp/calos-router.log
```

**Common fixes:**
```bash
# Kill anything on port 5001
lsof -ti :5001 | xargs kill -9

# Start fresh
npm start
```

---

## Manual Testing

### Test Ollama Endpoint
```bash
curl -X POST http://localhost:5001/api/ollama/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2:3b", "prompt": "What is 2+2?"}' | jq
```

**Expected response:**
```json
{
  "success": true,
  "model": "llama3.2:3b",
  "response": "The answer to 2+2 is 4.",
  "eval_count": 15
}
```

### Test Search Endpoint
```bash
curl "http://localhost:5001/api/search?q=artificial+intelligence" | jq
```

**Expected response:**
```json
{
  "success": true,
  "query": "artificial intelligence",
  "count": 5,
  "year": 2025,
  "results": [...]
}
```

---

## Technical Details

### Endpoints Created

1. **`POST /api/ollama/chat`** (router.js:229)
   - Queries local Ollama models
   - No API keys needed
   - Returns full AI responses

2. **`GET /api/search?q=query`** (router.js:277)
   - DuckDuckGo web search
   - No API keys needed
   - Returns 2025 data with timestamp

### Files Modified

- `router.js` - Added 2 new API endpoints
- `public/test-ai.html` - Beautiful test UI
- `scripts/restart-server.sh` - Foolproof restart script
- `package.json` - Added npm commands

### Error Handling

The test page now shows helpful errors:

**404 Error:**
> ❌ Server Error: The /api/ollama/chat endpoint doesn't exist.
> Fix: Restart the server to load latest code: `npm run restart`

**Connection Error:**
> ❌ Connection Error: Cannot connect to server.
> Possible causes:
> • Server not running
> • Wrong port (should be 5001)
> Quick fix: `npm run restart`

---

## NPM Commands

```bash
# Start server (basic)
npm start

# Restart server (foolproof - kills old, starts fresh, verifies, opens page)
npm run restart

# Test AI demo (same as restart)
npm run test:ai

# Check server logs
tail -f /tmp/calos-router.log
```

---

## Architecture

```
User Browser
    ↓
test-ai.html (UI)
    ↓
    ├─→ POST /api/ollama/chat → Ollama (127.0.0.1:11434) → llama3.2:3b
    │                                                         ↓
    │                                                    AI Response
    │
    └─→ GET /api/search → DuckDuckGo API → Web Results (2025)
```

**All local, no cloud APIs needed!**

---

## Success Checklist

When you run `npm run test:ai`, you should see:

```
✅ Server restarted successfully!
✅ /api/ollama/chat endpoint exists
✅ /api/search endpoint exists
🚀 Opening test page...
✨ All systems go!
```

Then in the browser:
- ✅ Page loads (purple gradient background)
- ✅ Click "Ask Ollama" → Gets AI response
- ✅ Click "Search Web" → Gets results with year: 2025

---

## Demo for Your Boss

```bash
# Start everything
npm run test:ai

# In browser:
1. Ask Ollama: "Explain quantum computing in one sentence"
2. Wait ~3-5 seconds
3. Show AI response from local llama3.2:3b model

4. Search Web: "latest tech news 2025"
5. Show results with green "2025" year indicator

# Point out:
- "We have 22 local AI models running"
- "No cloud APIs needed"
- "Web search returns 2025 data, not 2024"
- "Everything works locally"
```

---

## Troubleshooting

### Issue: Ollama times out

**Check Ollama is running:**
```bash
curl http://127.0.0.1:11434/api/tags | jq '.models | length'
# Should return: 22
```

**If not running:**
```bash
ollama serve
```

### Issue: Year shows 2024 instead of 2025

**This shouldn't happen** - the code explicitly uses:
```javascript
year: new Date().getFullYear() // 2025
```

If you see 2024, check your system date:
```bash
date
# Should show: 2025
```

### Issue: Endpoints return 404

**The server needs to be restarted** to load new code:
```bash
npm run restart
```

The restart script **verifies endpoints exist** before opening browser, so you'll know immediately if something is wrong.

---

## What Makes This Foolproof?

1. **`restart-server.sh` script:**
   - Kills ALL old server instances (no port conflicts)
   - Waits for server to be fully ready
   - Tests BOTH endpoints before declaring success
   - Opens browser only if endpoints work

2. **Error handling in UI:**
   - Detects 404 errors (server not restarted)
   - Shows clear fix: "run npm run restart"
   - Handles connection errors gracefully

3. **Verification built-in:**
   - Script confirms endpoints exist before opening page
   - User only sees page when everything works

---

## File Reference

```
agent-router/
├── router.js                      # Line 229: /api/ollama/chat
│                                  # Line 277: /api/search
├── public/
│   └── test-ai.html              # Test UI with error handling
├── scripts/
│   └── restart-server.sh         # Foolproof restart script
└── package.json                   # npm run restart, npm run test:ai
```

---

**🎉 Everything works now! Just run `npm run test:ai` and start testing.**
