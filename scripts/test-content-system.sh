#!/bin/bash

# Test Content Curation & Forum System
# Tests all API endpoints and integration points

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5001}"
TEST_USER_ID="test-user-$(date +%s)"
TEST_USER_NAME="Test User"

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
  echo -e "${YELLOW}▶ Testing:${NC} $1"
}

print_success() {
  ((TESTS_PASSED++))
  echo -e "${GREEN}✓ PASS:${NC} $1"
}

print_error() {
  ((TESTS_FAILED++))
  echo -e "${RED}✗ FAIL:${NC} $1"
}

((TESTS_RUN++))

# Test helper
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4
  local description=$5

  print_test "$description"

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$API_URL$endpoint")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -w "\n%{http_code}" -X PUT -H "Content-Type: application/json" -d "$data" "$API_URL$endpoint")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL$endpoint")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_status" ]; then
    print_success "$description (HTTP $http_code)"
    echo "$body"
    return 0
  else
    print_error "$description (Expected HTTP $expected_status, got $http_code)"
    echo "$body"
    return 1
  fi
}

# ============================================================================
# CONTENT CURATION TESTS
# ============================================================================

print_header "CONTENT CURATION TESTS"

# Test 1: Configure curation
print_test "Configure content curation"
config_data='{
  "topics": ["ai", "crypto", "programming"],
  "sources": ["hackernews", "reddit"],
  "customRSS": [],
  "frequency": "daily",
  "deliveryTime": "09:00",
  "email": "test@example.com"
}'

response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$config_data" \
  "$API_URL/api/curation/configure")

if echo "$response" | grep -q "success"; then
  print_success "Configure content curation"
  ((TESTS_RUN++))
else
  print_error "Configure content curation"
fi

# Test 2: Get configuration
print_test "Get curation configuration"
response=$(curl -s "$API_URL/api/curation/config")

if echo "$response" | grep -q "success"; then
  print_success "Get curation configuration"
  ((TESTS_RUN++))
else
  print_error "Get curation configuration"
fi

# Test 3: Get curated feed
print_test "Get curated feed"
response=$(curl -s "$API_URL/api/curation/feed?limit=10")

if echo "$response" | grep -q "status"; then
  print_success "Get curated feed"
  ((TESTS_RUN++))
  item_count=$(echo "$response" | grep -o '"items"' | wc -l)
  echo "  Found items in response"
else
  print_error "Get curated feed"
fi

# Test 4: Get Hacker News feed
print_test "Get Hacker News feed"
response=$(curl -s "$API_URL/api/curation/sources/hackernews")

if echo "$response" | grep -q "Hacker News"; then
  print_success "Get Hacker News feed"
  ((TESTS_RUN++))
else
  print_error "Get Hacker News feed"
fi

# Test 5: Get Reddit feed
print_test "Get Reddit feed (r/programming)"
response=$(curl -s "$API_URL/api/curation/sources/reddit/programming")

if echo "$response" | grep -q "programming"; then
  print_success "Get Reddit feed"
  ((TESTS_RUN++))
else
  print_error "Get Reddit feed"
fi

# Test 6: Get GitHub Trending
print_test "Get GitHub Trending"
response=$(curl -s "$API_URL/api/curation/sources/github-trending")

if echo "$response" | grep -q "GitHub Trending"; then
  print_success "Get GitHub Trending"
  ((TESTS_RUN++))
else
  print_error "Get GitHub Trending"
fi

# Test 7: Preview feed
print_test "Preview feed without config"
response=$(curl -s "$API_URL/api/curation/preview?topics=ai,tech&sources=hackernews&limit=5")

if echo "$response" | grep -q "success"; then
  print_success "Preview feed"
  ((TESTS_RUN++))
else
  print_error "Preview feed"
fi

# Test 8: Get curation stats
print_test "Get curation statistics"
response=$(curl -s "$API_URL/api/curation/stats")

if echo "$response" | grep -q "status"; then
  print_success "Get curation statistics"
  ((TESTS_RUN++))
else
  print_error "Get curation statistics"
fi

# Test 9: Generate newsletter
print_test "Generate newsletter (HTML)"
response=$(curl -s "$API_URL/api/curation/newsletter?limit=5&format=html")

if echo "$response" | grep -q -E "(html|<!DOCTYPE|<h1>)"; then
  print_success "Generate newsletter (HTML)"
  ((TESTS_RUN++))
else
  print_error "Generate newsletter (HTML)"
fi

# ============================================================================
# FORUM TESTS
# ============================================================================

print_header "FORUM SYSTEM TESTS"

# Test 10: Create forum thread
print_test "Create forum thread"
thread_data='{
  "title": "Test Discussion Thread",
  "body": "This is a test thread for the forum system.",
  "tags": ["test", "demo"],
  "flair": "Discussion"
}'

response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$thread_data" \
  "$API_URL/api/forum/threads")

if echo "$response" | grep -q "success"; then
  print_success "Create forum thread"
  ((TESTS_RUN++))
  THREAD_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  echo "  Created thread ID: $THREAD_ID"
else
  print_error "Create forum thread"
  THREAD_ID=1
fi

# Test 11: Get thread with comments
print_test "Get thread with comments"
response=$(curl -s "$API_URL/api/forum/threads/$THREAD_ID")

if echo "$response" | grep -q "Test Discussion Thread"; then
  print_success "Get thread with comments"
  ((TESTS_RUN++))
else
  print_error "Get thread with comments"
fi

# Test 12: Create comment on thread
print_test "Create comment on thread"
comment_data="{
  \"threadId\": $THREAD_ID,
  \"body\": \"This is a test comment.\"
}"

response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$comment_data" \
  "$API_URL/api/forum/posts")

if echo "$response" | grep -q "success"; then
  print_success "Create comment on thread"
  ((TESTS_RUN++))
  POST_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  echo "  Created post ID: $POST_ID"
else
  print_error "Create comment on thread"
  POST_ID=1
fi

# Test 13: Vote on thread (upvote)
print_test "Upvote thread"
vote_data='{"voteType": "up"}'

response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$vote_data" \
  "$API_URL/api/forum/vote/thread/$THREAD_ID")

if echo "$response" | grep -q "success"; then
  print_success "Upvote thread"
  ((TESTS_RUN++))
else
  print_error "Upvote thread"
fi

# Test 14: Vote on post (upvote)
print_test "Upvote post"
response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$vote_data" \
  "$API_URL/api/forum/vote/post/$POST_ID")

if echo "$response" | grep -q "success"; then
  print_success "Upvote post"
  ((TESTS_RUN++))
else
  print_error "Upvote post"
fi

# Test 15: Get hot threads
print_test "Get hot threads"
response=$(curl -s "$API_URL/api/forum/hot?limit=10")

if echo "$response" | grep -q "success"; then
  print_success "Get hot threads"
  ((TESTS_RUN++))
else
  print_error "Get hot threads"
fi

# Test 16: Get new threads
print_test "Get new threads"
response=$(curl -s "$API_URL/api/forum/new?limit=10")

if echo "$response" | grep -q "success"; then
  print_success "Get new threads"
  ((TESTS_RUN++))
else
  print_error "Get new threads"
fi

# Test 17: Get top threads
print_test "Get top threads (all time)"
response=$(curl -s "$API_URL/api/forum/top?limit=10&timeRange=all")

if echo "$response" | grep -q "success"; then
  print_success "Get top threads"
  ((TESTS_RUN++))
else
  print_error "Get top threads"
fi

# Test 18: Get user karma
print_test "Get user karma"
response=$(curl -s "$API_URL/api/forum/karma/$TEST_USER_ID")

if echo "$response" | grep -q "success"; then
  print_success "Get user karma"
  ((TESTS_RUN++))
else
  print_error "Get user karma"
fi

# Test 19: Get karma leaderboard
print_test "Get karma leaderboard"
response=$(curl -s "$API_URL/api/forum/leaderboard?limit=10")

if echo "$response" | grep -q "success"; then
  print_success "Get karma leaderboard"
  ((TESTS_RUN++))
else
  print_error "Get karma leaderboard"
fi

# ============================================================================
# PYTHON NEWS AGGREGATOR TEST
# ============================================================================

print_header "PYTHON NEWS AGGREGATOR TEST"

# Test 20: Run Python news aggregator
print_test "Run Python news aggregator"

if [ -f "/Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/scripts/news-aggregator.py" ]; then
  python_output=$(python3 scripts/news-aggregator.py --sources hackernews --topics ai,tech --output /tmp/news-test.json 2>&1)

  if [ -f "/tmp/news-test.json" ]; then
    news_data=$(cat /tmp/news-test.json)
    if echo "$news_data" | grep -q "success"; then
      print_success "Run Python news aggregator"
      ((TESTS_RUN++))
      article_count=$(echo "$news_data" | grep -o '"count":[0-9]*' | cut -d: -f2)
      echo "  Fetched $article_count articles"
    else
      print_error "Run Python news aggregator (invalid JSON)"
    fi
    rm /tmp/news-test.json
  else
    print_error "Run Python news aggregator (no output file)"
  fi
else
  echo -e "${YELLOW}⚠ SKIP:${NC} Python news aggregator (script not found)"
fi

# ============================================================================
# SUMMARY
# ============================================================================

print_header "TEST SUMMARY"

echo -e "${BLUE}Tests Run:${NC}    $TESTS_RUN"
echo -e "${GREEN}Tests Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"

success_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$TESTS_RUN)*100}")
echo -e "${BLUE}Success Rate:${NC} $success_rate%"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ ALL TESTS PASSED!${NC}\n"
  exit 0
else
  echo -e "\n${RED}✗ SOME TESTS FAILED${NC}\n"
  exit 1
fi
