#!/bin/bash
# Test Documentation Backend System
# Verifies the entire backend flow works before building UI

set -e  # Exit on error

echo "======================================"
echo "Documentation Backend Test Suite"
echo "======================================"
echo ""

BASE_URL="http://localhost:5001"
PASSED=0
FAILED=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_field="$3"

  echo -n "Testing: $name... "

  response=$(curl -s "$url")

  if echo "$response" | jq -e "$expected_field" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Response: $response" | head -c 200
    echo ""
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "1. Testing Health Endpoint"
echo "----------------------------"
test_endpoint "Health check" "$BASE_URL/api/docs/test" ".success"
echo ""

echo "2. Testing Providers List"
echo "----------------------------"
test_endpoint "Get all providers" "$BASE_URL/api/docs/providers" ".providers"
test_endpoint "Provider count = 3" "$BASE_URL/api/docs/providers" '.count == 3'
test_endpoint "GitHub provider exists" "$BASE_URL/api/docs/providers" '.providers[] | select(.provider == "github")'
test_endpoint "Google provider exists" "$BASE_URL/api/docs/providers" '.providers[] | select(.provider == "google")'
test_endpoint "Microsoft provider exists" "$BASE_URL/api/docs/providers" '.providers[] | select(.provider == "microsoft")'
echo ""

echo "3. Testing Provider Data"
echo "----------------------------"
# Get GitHub snapshot ID
GITHUB_ID=$(curl -s "$BASE_URL/api/docs/providers" | jq -r '.providers[] | select(.provider == "github") | .snapshot_id')
echo "GitHub Snapshot ID: $GITHUB_ID"

test_endpoint "Get GitHub snapshot" "$BASE_URL/api/docs/snapshot/$GITHUB_ID" ".snapshot"
test_endpoint "GitHub has screenshot_dir" "$BASE_URL/api/docs/snapshot/$GITHUB_ID" ".snapshot.screenshot_dir"
test_endpoint "GitHub has base_screenshot_path" "$BASE_URL/api/docs/snapshot/$GITHUB_ID" ".snapshot.base_screenshot_path"
test_endpoint "GitHub has metadata" "$BASE_URL/api/docs/snapshot/$GITHUB_ID" ".snapshot.metadata"
test_endpoint "GitHub status is current" "$BASE_URL/api/docs/snapshot/$GITHUB_ID" '.snapshot.status == "current"'
echo ""

echo "4. Testing Stats Endpoint"
echo "----------------------------"
test_endpoint "Get stats" "$BASE_URL/api/docs/stats" ".snapshots"
test_endpoint "Stats has total_count" "$BASE_URL/api/docs/stats" ".snapshots.total_count"
test_endpoint "Stats has changes" "$BASE_URL/api/docs/stats" ".changes"
echo ""

echo "5. Testing Notes Endpoints"
echo "----------------------------"
# Create a test note
NOTE_PAYLOAD='{"snapshot_id": "'$GITHUB_ID'", "timestamp": 5.5, "note_text": "Test note from automated test", "tags": ["test", "automated"]}'
NOTE_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$NOTE_PAYLOAD" \
  "$BASE_URL/api/docs/notes")

NOTE_ID=$(echo "$NOTE_RESPONSE" | jq -r '.note.note_id')
echo "Created test note: $NOTE_ID"

test_endpoint "Create note" "echo '$NOTE_RESPONSE'" ".success"
test_endpoint "Get notes for snapshot" "$BASE_URL/api/docs/notes/$GITHUB_ID" ".notes"
test_endpoint "Note exists in list" "$BASE_URL/api/docs/notes/$GITHUB_ID" '.notes[] | select(.note_text == "Test note from automated test")'
echo ""

echo "6. Verifying File System"
echo "----------------------------"
SCREENSHOT_DIR="/Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/oauth-screenshots"

for provider in github google microsoft; do
  echo -n "Checking $provider screenshot... "
  if ls "$SCREENSHOT_DIR/$provider-"*"/base-screenshot.png" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ EXISTS${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ MISSING${NC}"
    FAILED=$((FAILED + 1))
  fi
done
echo ""

echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
else
  echo -e "Failed: 0"
fi
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo "Backend is ready for UI development!"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo "Fix backend issues before building UI"
  exit 1
fi
