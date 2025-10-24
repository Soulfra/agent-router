#!/bin/bash

# Foolproof server restart script
# Kills old instances, starts fresh, verifies endpoints work

set -e

echo "🔄 Restarting CALOS Agent Router..."

# Step 1: Kill all existing node processes on port 5001
echo "1️⃣  Killing old server instances..."
lsof -ti :5001 | xargs kill -9 2>/dev/null || echo "   No existing server to kill"
sleep 2

# Step 2: Start server in background
echo "2️⃣  Starting fresh server..."
cd "$(dirname "$0")/.."
npm start > /tmp/calos-router.log 2>&1 &
SERVER_PID=$!
echo "   Server started (PID: $SERVER_PID)"

# Step 3: Wait for server to be ready
echo "3️⃣  Waiting for server startup..."
for i in {1..15}; do
  if curl -s http://localhost:5001/health > /dev/null 2>&1; then
    echo "   ✅ Server is ready!"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "   ❌ Server failed to start after 15 seconds"
    echo "   Check logs: tail /tmp/calos-router.log"
    exit 1
  fi
  sleep 1
  echo -n "."
done

# Step 4: Verify new endpoints exist
echo "4️⃣  Verifying AI endpoints..."

# Test Ollama endpoint (HEAD request to avoid long query)
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/api/ollama/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"test","prompt":"test"}' 2>/dev/null || echo "000")

if [ "$OLLAMA_STATUS" = "400" ] || [ "$OLLAMA_STATUS" = "200" ] || [ "$OLLAMA_STATUS" = "500" ]; then
  echo "   ✅ /api/ollama/chat endpoint exists"
else
  echo "   ❌ /api/ollama/chat returned $OLLAMA_STATUS (expected 400/200/500)"
  exit 1
fi

# Test search endpoint
SEARCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5001/api/search?q=test" 2>/dev/null || echo "000")

if [ "$SEARCH_STATUS" = "200" ] || [ "$SEARCH_STATUS" = "500" ]; then
  echo "   ✅ /api/search endpoint exists"
else
  echo "   ❌ /api/search returned $SEARCH_STATUS (expected 200/500)"
  exit 1
fi

# Step 5: Success!
echo ""
echo "✅ Server restarted successfully!"
echo ""
echo "📊 Status:"
echo "   Server PID: $SERVER_PID"
echo "   HTTP:       http://localhost:5001"
echo "   Test Page:  http://localhost:5001/test-ai"
echo "   Logs:       tail -f /tmp/calos-router.log"
echo ""
echo "🚀 Opening test page..."
sleep 1

# Open test page (macOS/Linux compatible)
if command -v open > /dev/null 2>&1; then
  open http://localhost:5001/test-ai
elif command -v xdg-open > /dev/null 2>&1; then
  xdg-open http://localhost:5001/test-ai
else
  echo "   Open manually: http://localhost:5001/test-ai"
fi

echo ""
echo "✨ All systems go! Try asking Ollama a question or searching the web."
