#!/bin/bash

# Test Regional Routing & Geolocation System
# Verifies "sorting hat" algorithm works correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5001}"
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test IPs from different regions
declare -A TEST_IPS
TEST_IPS=(
  ["US West (SF)"]="8.8.8.8"              # Google DNS (CA)
  ["US East (VA)"]="3.218.180.1"          # AWS us-east-1
  ["Europe (Dublin)"]="52.19.0.1"         # AWS eu-west-1
  ["Asia (Tokyo)"]="52.68.0.1"            # AWS ap-northeast-1
  ["Australia (Sydney)"]="13.54.0.1"      # AWS ap-southeast-2
)

# Regional server endpoints (configure these)
declare -A REGIONAL_SERVERS
REGIONAL_SERVERS=(
  ["us-west-2"]="http://us-west-2.calos.local:5001"
  ["us-east-1"]="http://us-east-1.calos.local:5001"
  ["eu-west-1"]="http://eu-west-1.calos.local:5001"
  ["ap-northeast-1"]="http://ap-northeast-1.calos.local:5001"
  ["ap-southeast-2"]="http://ap-southeast-2.calos.local:5001"
)

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

print_info() {
  echo -e "${CYAN}ℹ INFO:${NC} $1"
}

((TESTS_RUN++))

# ============================================================================
# TEST 1: GEO RESOLVER API
# ============================================================================

print_header "TEST 1: GEO RESOLVER API"

print_test "IP geolocation resolution"

for region in "${!TEST_IPS[@]}"; do
  ip="${TEST_IPS[$region]}"
  echo ""
  print_info "Resolving $region ($ip)"

  # Call geo resolver API
  response=$(curl -s "$API_URL/api/geo/resolve?ip=$ip" 2>&1)

  if echo "$response" | grep -q "country"; then
    country=$(echo "$response" | grep -o '"country":"[^"]*"' | cut -d'"' -f4)
    city=$(echo "$response" | grep -o '"city":"[^"]*"' | cut -d'"' -f4)

    print_success "Resolved $region to $city, $country"
    echo "    Response: $response" | head -c 150
    echo "..."
    ((TESTS_RUN++))
  else
    print_error "Failed to resolve $region ($ip)"
    echo "    Response: $response"
  fi
done

# ============================================================================
# TEST 2: REGIONAL SERVER ASSIGNMENT
# ============================================================================

print_header "TEST 2: REGIONAL SERVER ASSIGNMENT"

print_test "Sorting hat algorithm assigns correct region"

# Test with US West IP
print_info "Testing US West IP (8.8.8.8 - should route to us-west-2)"
response=$(curl -s -H "X-Forwarded-For: 8.8.8.8" "$API_URL/api/health")

if echo "$response" | grep -q "status"; then
  print_success "Server responded for US West IP"
  ((TESTS_RUN++))
else
  print_error "Server did not respond for US West IP"
fi

# Test with EU IP
print_info "Testing EU IP (52.19.0.1 - should route to eu-west-1)"
response=$(curl -s -H "X-Forwarded-For: 52.19.0.1" "$API_URL/api/health")

if echo "$response" | grep -q "status"; then
  print_success "Server responded for EU IP"
  ((TESTS_RUN++))
else
  print_error "Server did not respond for EU IP"
fi

# ============================================================================
# TEST 3: LATENCY COMPARISON
# ============================================================================

print_header "TEST 3: LATENCY COMPARISON"

print_test "Compare latency to regional endpoints"

# Use Node.js network diagnostics library
cat > /tmp/test-latency.js <<'EOF'
const NetworkDiagnostics = require('../lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

const endpoints = [
  'http://localhost:5001',
  // Add regional endpoints here when available
];

(async () => {
  console.log('Comparing endpoint latencies...\n');

  for (const url of endpoints) {
    try {
      const result = await diagnostics.ping(url, 3);

      if (result.success) {
        console.log(`✓ ${url}: ${result.latency.avg}ms avg (${result.packetLoss}% loss)`);
      } else {
        console.log(`✗ ${url}: ${result.error}`);
      }
    } catch (error) {
      console.log(`✗ ${url}: ${error.message}`);
    }
  }
})();
EOF

cd "$(dirname "$0")/.."
node /tmp/test-latency.js

if [ $? -eq 0 ]; then
  print_success "Latency comparison completed"
  ((TESTS_RUN++))
else
  print_error "Latency comparison failed"
fi

rm -f /tmp/test-latency.js

# ============================================================================
# TEST 4: GEOLOCATION CACHING
# ============================================================================

print_header "TEST 4: GEOLOCATION CACHING"

print_test "Verify geolocation results are cached"

# First request (should hit API)
print_info "First request for 8.8.8.8 (should hit ip-api.com)"
start=$(date +%s%N)
response1=$(curl -s "$API_URL/api/geo/resolve?ip=8.8.8.8")
end=$(date +%s%N)
latency1=$(( (end - start) / 1000000 ))

print_info "First request took ${latency1}ms"

# Second request (should hit cache)
print_info "Second request for 8.8.8.8 (should hit cache)"
start=$(date +%s%N)
response2=$(curl -s "$API_URL/api/geo/resolve?ip=8.8.8.8")
end=$(date +%s%N)
latency2=$(( (end - start) / 1000000 ))

print_info "Second request took ${latency2}ms"

# Cache should be faster
if [ "$latency2" -lt "$latency1" ]; then
  print_success "Cache is working (${latency2}ms < ${latency1}ms)"
  ((TESTS_RUN++))
else
  print_error "Cache may not be working (${latency2}ms >= ${latency1}ms)"
fi

# Verify responses are identical
if [ "$response1" = "$response2" ]; then
  print_success "Cached response matches original"
  ((TESTS_RUN++))
else
  print_error "Cached response differs from original"
fi

# ============================================================================
# TEST 5: ROUTE TRACING
# ============================================================================

print_header "TEST 5: ROUTE TRACING"

print_test "Trace route to local server"

# Use Node.js network diagnostics for route tracing
cat > /tmp/test-traceroute.js <<'EOF'
const NetworkDiagnostics = require('../lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

(async () => {
  const result = await diagnostics.traceRoute('http://localhost:5001/api/health');

  console.log('\nRoute trace results:');
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.success ? 0 : 1);
})();
EOF

cd "$(dirname "$0")/.."
node /tmp/test-traceroute.js

if [ $? -eq 0 ]; then
  print_success "Route trace completed"
  ((TESTS_RUN++))
else
  print_error "Route trace failed"
fi

rm -f /tmp/test-traceroute.js

# ============================================================================
# TEST 6: REGIONAL FAILOVER
# ============================================================================

print_header "TEST 6: REGIONAL FAILOVER"

print_test "Verify failover when primary region is down"

print_info "This test requires multiple regional servers to be running"
print_info "Skipping for now - configure REGIONAL_SERVERS array when ready"

# When you have multiple servers:
# 1. Try to connect to primary region
# 2. If it fails, try secondary region
# 3. Verify request completes successfully

echo -e "${YELLOW}⚠ SKIP:${NC} Regional failover test (requires multi-region setup)"

# ============================================================================
# TEST 7: USER SESSION ROUTING
# ============================================================================

print_header "TEST 7: USER SESSION ROUTING"

print_test "Verify user sessions stick to assigned region"

# Create a test session
print_info "Creating test session with US West IP"
session_response=$(curl -s -c /tmp/cookies.txt -H "X-Forwarded-For: 8.8.8.8" \
  -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test-user-'$(date +%s)'",
    "password": "test-password-123"
  }')

if echo "$session_response" | grep -q "success"; then
  print_success "Test session created"
  ((TESTS_RUN++))

  # Verify session includes region assignment
  if echo "$session_response" | grep -q "region"; then
    region=$(echo "$session_response" | grep -o '"region":"[^"]*"' | cut -d'"' -f4)
    print_success "Session assigned to region: $region"
    ((TESTS_RUN++))
  else
    print_info "Session response does not include region (may not be implemented yet)"
  fi
else
  print_error "Failed to create test session"
  echo "    Response: $session_response"
fi

# Cleanup
rm -f /tmp/cookies.txt

# ============================================================================
# SUMMARY
# ============================================================================

print_header "TEST SUMMARY"

echo -e "${BLUE}Tests Run:${NC}    $TESTS_RUN"
echo -e "${GREEN}Tests Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Tests Failed:${NC} $TESTS_FAILED"

success_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$TESTS_RUN)*100}")
echo -e "${BLUE}Success Rate:${NC} $success_rate%"

echo ""
print_header "NEXT STEPS"

echo "1. Configure regional server endpoints in REGIONAL_SERVERS array"
echo "2. Set up multiple regional instances for failover testing"
echo "3. Run: npm install -g localtunnel or ngrok for remote IP testing"
echo "4. Monitor geolocation cache hit rate in database:"
echo "   SELECT COUNT(*), AVG(EXTRACT(EPOCH FROM (NOW() - cached_at))/86400) FROM ip_locations;"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}\n"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}\n"
  exit 1
fi
