#!/bin/bash

echo "Testing Domain Voting API..."
echo

# 1. Get a random domain card
echo "1. GET /api/domain-voting/card"
CARD=$(curl -s http://localhost:5002/api/domain-voting/card)
echo "$CARD" | python3 -m json.tool
DOMAIN_ID=$(echo "$CARD" | python3 -c "import sys, json; print(json.load(sys.stdin)['domain']['domain_id'])")
echo
echo "Domain ID: $DOMAIN_ID"
echo

# 2. Vote on the domain
echo "2. POST /api/domain-voting/vote"
VOTE_RESULT=$(curl -s -X POST http://localhost:5002/api/domain-voting/vote \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"test_session_123\",\"domainId\":\"$DOMAIN_ID\",\"voteDirection\":\"like\",\"walletAddress\":\"0x1234567890123456789012345678901234567890\"}")
echo "$VOTE_RESULT" | python3 -m json.tool
echo

# 3. Submit feedback
echo "3. POST /api/domain-voting/feedback"
FEEDBACK_RESULT=$(curl -s -X POST http://localhost:5002/api/domain-voting/feedback \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"test_session_123\",\"domainId\":\"$DOMAIN_ID\",\"feedbackText\":\"This is a great domain name! I think it would work really well for a music production platform. The branding is strong and memorable.\"}")
echo "$FEEDBACK_RESULT" | python3 -m json.tool
echo

# 4. Check pending rewards
echo "4. GET /api/domain-voting/pending-rewards/test_session_123"
curl -s http://localhost:5002/api/domain-voting/pending-rewards/test_session_123 | python3 -m json.tool
echo

# 5. Get voting stats
echo "5. GET /api/domain-voting/stats"
curl -s http://localhost:5002/api/domain-voting/stats | python3 -m json.tool | head -50
echo

echo "✅ API tests completed!"
