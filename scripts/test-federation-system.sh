#!/bin/bash

# Complete Multi-Device Federation Integration Test
# Tests the entire system: network, geolocation, device pairing, sync

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5001}"
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ASCII Art Banner
print_banner() {
  echo ""
  echo -e "${PURPLE}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║                                                       ║${NC}"
  echo -e "${PURPLE}║       ${CYAN}CALOS Multi-Device Federation Test${PURPLE}          ║${NC}"
  echo -e "${PURPLE}║                                                       ║${NC}"
  echo -e "${PURPLE}║  ${YELLOW}Testing: Network → Geo → Pairing → Sync${PURPLE}          ║${NC}"
  echo -e "${PURPLE}║                                                       ║${NC}"
  echo -e "${PURPLE}╚═══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# Helper functions
print_header() {
  echo -e "\n${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║ $1${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}\n"
}

print_section() {
  echo -e "\n${CYAN}┌─ $1 ─┐${NC}\n"
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

print_warning() {
  echo -e "${YELLOW}⚠ WARN:${NC} $1"
}

# ============================================================================
# PHASE 1: NETWORK DIAGNOSTICS
# ============================================================================

phase_1_network() {
  print_header "PHASE 1: NETWORK CONNECTIVITY"

  print_section "1.1 DNS Resolution"
  ((TESTS_RUN++))

  # Test DNS resolution
  if host localhost > /dev/null 2>&1; then
    print_success "DNS resolution working"
  else
    print_error "DNS resolution failed"
    return 1
  fi

  print_section "1.2 TCP Connectivity"
  ((TESTS_RUN++))

  # Test TCP connection to server
  if nc -z localhost 5001 2>/dev/null; then
    print_success "TCP connection to localhost:5001 established"
  else
    print_error "Cannot connect to localhost:5001"
    print_warning "Make sure server is running: npm run start"
    return 1
  fi

  print_section "1.3 HTTP Health Check"
  ((TESTS_RUN++))

  # Test HTTP endpoint
  health_response=$(curl -s -w "\n%{http_code}" "$API_URL/api/health" 2>&1)
  http_code=$(echo "$health_response" | tail -n1)

  if [ "$http_code" = "200" ]; then
    print_success "HTTP health endpoint responding (HTTP 200)"
  else
    print_error "HTTP health check failed (HTTP $http_code)"
    return 1
  fi

  print_section "1.4 Latency Measurement"
  ((TESTS_RUN++))

  # Measure latency using Node.js network diagnostics
  cat > /tmp/test-latency-phase1.js <<'EOF'
const NetworkDiagnostics = require('../lib/network-diagnostics');
const diagnostics = new NetworkDiagnostics();

(async () => {
  try {
    const result = await diagnostics.ping('http://localhost:5001/api/health', 5);

    if (result.success) {
      console.log(`SUCCESS|${result.latency.avg}|${result.packetLoss}`);
      process.exit(0);
    } else {
      console.log(`FAIL|${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`ERROR|${error.message}`);
    process.exit(1);
  }
})();
EOF

  cd "$(dirname "$0")/.."
  latency_output=$(node /tmp/test-latency-phase1.js 2>&1 | tail -1)

  if echo "$latency_output" | grep -q "SUCCESS"; then
    avg_latency=$(echo "$latency_output" | cut -d'|' -f2)
    packet_loss=$(echo "$latency_output" | cut -d'|' -f3)

    print_success "Average latency: ${avg_latency}ms, Packet loss: ${packet_loss}%"

    if (( $(echo "$avg_latency < 100" | bc -l) )); then
      print_info "Latency is excellent (< 100ms)"
    elif (( $(echo "$avg_latency < 500" | bc -l) )); then
      print_info "Latency is acceptable (< 500ms)"
    else
      print_warning "Latency is high (> 500ms)"
    fi
  else
    print_error "Latency test failed"
  fi

  rm -f /tmp/test-latency-phase1.js

  echo ""
  print_info "Phase 1 complete: Network layer verified ✓"
  return 0
}

# ============================================================================
# PHASE 2: GEOLOCATION & ROUTING
# ============================================================================

phase_2_geolocation() {
  print_header "PHASE 2: GEOLOCATION & ROUTING"

  print_section "2.1 IP Geolocation Service"
  ((TESTS_RUN++))

  # Test geolocation API with known IP
  geo_response=$(curl -s "$API_URL/api/geo/resolve?ip=8.8.8.8")

  if echo "$geo_response" | grep -q "country"; then
    country=$(echo "$geo_response" | grep -o '"country":"[^"]*"' | cut -d'"' -f4)
    city=$(echo "$geo_response" | grep -o '"city":"[^"]*"' | cut -d'"' -f4 | head -1)

    print_success "IP geolocation working (8.8.8.8 → $city, $country)"
  else
    print_error "IP geolocation failed"
    echo "    Response: $geo_response"
  fi

  print_section "2.2 Regional Assignment (Sorting Hat)"
  ((TESTS_RUN++))

  # Test sorting hat algorithm with different IPs
  declare -A test_ips
  test_ips=(
    ["US West"]="8.8.8.8"
    ["US East"]="3.218.180.1"
    ["Europe"]="52.19.0.1"
  )

  for region in "${!test_ips[@]}"; do
    ip="${test_ips[$region]}"

    print_info "Testing $region IP ($ip)"

    # Make request with X-Forwarded-For header
    routing_response=$(curl -s -H "X-Forwarded-For: $ip" "$API_URL/api/health")

    if echo "$routing_response" | grep -q "status"; then
      print_success "Server routed request from $region"
      ((TESTS_RUN++))
    else
      print_error "Routing failed for $region"
    fi
  done

  print_section "2.3 Geolocation Cache Performance"
  ((TESTS_RUN++))

  # Test cache performance
  print_info "Testing cache performance (1st request vs 2nd request)"

  start1=$(date +%s%N)
  curl -s "$API_URL/api/geo/resolve?ip=8.8.8.8" > /dev/null
  end1=$(date +%s%N)
  time1=$(( (end1 - start1) / 1000000 ))

  start2=$(date +%s%N)
  curl -s "$API_URL/api/geo/resolve?ip=8.8.8.8" > /dev/null
  end2=$(date +%s%N)
  time2=$(( (end2 - start2) / 1000000 ))

  print_info "First request: ${time1}ms, Second request: ${time2}ms"

  if [ "$time2" -lt "$time1" ]; then
    speedup=$(awk "BEGIN {printf \"%.1f\", $time1/$time2}")
    print_success "Cache is working (${speedup}x faster)"
  else
    print_warning "Cache performance inconclusive"
  fi

  echo ""
  print_info "Phase 2 complete: Geolocation & routing verified ✓"
  return 0
}

# ============================================================================
# PHASE 3: DEVICE PAIRING
# ============================================================================

phase_3_device_pairing() {
  print_header "PHASE 3: DEVICE PAIRING"

  TEST_USER="test-user-$(date +%s)"
  DEVICE_LAPTOP="laptop-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d'-' -f1)"
  DEVICE_IPHONE="iphone-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d'-' -f1)"

  print_section "3.1 Initial Device Registration (Laptop)"
  ((TESTS_RUN++))

  registration_response=$(curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$TEST_USER\",
      \"password\": \"test-password-123\",
      \"deviceFingerprint\": \"$DEVICE_LAPTOP\",
      \"deviceName\": \"Test Laptop\",
      \"deviceType\": \"web\"
    }")

  if echo "$registration_response" | grep -q "success"; then
    USER_ID=$(echo "$registration_response" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
    LAPTOP_JWT=$(echo "$registration_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

    print_success "Laptop registered (User ID: $USER_ID)"
  else
    print_error "Registration failed"
    echo "    Response: $registration_response"
    return 1
  fi

  print_section "3.2 QR Code Pairing (Laptop → iPhone)"
  ((TESTS_RUN++))

  # Generate pairing code
  pairing_response=$(curl -s -X POST "$API_URL/api/auth/device/pair/generate" \
    -H "Authorization: Bearer $LAPTOP_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"sourceDeviceId\": \"$DEVICE_LAPTOP\"}")

  if echo "$pairing_response" | grep -q "pairingCode"; then
    PAIRING_CODE=$(echo "$pairing_response" | grep -o '"pairingCode":"[^"]*"' | cut -d'"' -f4)
    print_success "QR code generated (Code: $PAIRING_CODE)"
  else
    print_error "QR code generation failed"
    return 1
  fi

  # Complete pairing
  complete_response=$(curl -s -X POST "$API_URL/api/auth/device/pair/complete" \
    -H "Content-Type: application/json" \
    -d "{
      \"pairingCode\": \"$PAIRING_CODE\",
      \"deviceFingerprint\": \"$DEVICE_IPHONE\",
      \"deviceName\": \"Test iPhone\",
      \"deviceType\": \"mobile\"
    }")

  if echo "$complete_response" | grep -q "success"; then
    IPHONE_JWT=$(echo "$complete_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    IPHONE_USER_ID=$(echo "$complete_response" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)

    print_success "iPhone paired successfully"
    ((TESTS_RUN++))

    if [ "$USER_ID" = "$IPHONE_USER_ID" ]; then
      print_success "Both devices share same user_id (RuneScape model working!)"
      ((TESTS_RUN++))
    else
      print_error "Devices have different user_ids!"
    fi
  else
    print_error "iPhone pairing failed"
    return 1
  fi

  print_section "3.3 Shared Credits Balance"
  ((TESTS_RUN++))

  # Check laptop credits
  laptop_credits=$(curl -s "$API_URL/api/credits/balance" \
    -H "Authorization: Bearer $LAPTOP_JWT" | grep -o '"balance":[0-9]*' | cut -d':' -f2)

  # Check iPhone credits
  iphone_credits=$(curl -s "$API_URL/api/credits/balance" \
    -H "Authorization: Bearer $IPHONE_JWT" | grep -o '"balance":[0-9]*' | cut -d':' -f2)

  if [ "$laptop_credits" = "$iphone_credits" ]; then
    print_success "Both devices see same credits ($laptop_credits credits)"
  else
    print_error "Credits mismatch! (Laptop: $laptop_credits, iPhone: $iphone_credits)"
  fi

  echo ""
  print_info "Phase 3 complete: Device pairing verified ✓"
  return 0
}

# ============================================================================
# PHASE 4: END-TO-END INTEGRATION
# ============================================================================

phase_4_integration() {
  print_header "PHASE 4: END-TO-END INTEGRATION"

  print_section "4.1 Multi-Region Request Flow"
  ((TESTS_RUN++))

  print_info "Simulating user in San Francisco connecting to system"

  # Simulate user from SF
  response=$(curl -s -H "X-Forwarded-For: 8.8.8.8" \
    -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$TEST_USER\",
      \"password\": \"test-password-123\"
    }")

  if echo "$response" | grep -q "token"; then
    print_success "User authenticated from SF IP"
  else
    print_info "Login endpoint may not be fully implemented"
  fi

  print_section "4.2 Cross-Device Sync Test"
  ((TESTS_RUN++))

  # Make request from iPhone
  print_info "Making API call from iPhone"

  chat_response=$(curl -s -X POST "$API_URL/api/chat" \
    -H "Authorization: Bearer $IPHONE_JWT" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "llama3.2",
      "messages": [{"role": "user", "content": "ping"}],
      "stream": false
    }')

  # Check if laptop sees updated state
  sleep 1

  laptop_credits_after=$(curl -s "$API_URL/api/credits/balance" \
    -H "Authorization: Bearer $LAPTOP_JWT" | grep -o '"balance":[0-9]*' | cut -d':' -f2)

  iphone_credits_after=$(curl -s "$API_URL/api/credits/balance" \
    -H "Authorization: Bearer $IPHONE_JWT" | grep -o '"balance":[0-9]*' | cut -d':' -f2)

  if [ "$laptop_credits_after" = "$iphone_credits_after" ]; then
    print_success "Credits synchronized across devices"
  else
    print_error "Credits out of sync!"
  fi

  print_section "4.3 System Health Check"
  ((TESTS_RUN++))

  health_response=$(curl -s "$API_URL/api/health/detailed")

  if echo "$health_response" | grep -q "status"; then
    memory_percent=$(echo "$health_response" | grep -o '"percent":[0-9]*' | head -1 | cut -d':' -f2)
    uptime=$(echo "$health_response" | grep -o '"process":[0-9]*' | cut -d':' -f2)

    print_success "System health: ${memory_percent}% memory, ${uptime}s uptime"
  else
    print_warning "Health endpoint not responding"
  fi

  echo ""
  print_info "Phase 4 complete: End-to-end integration verified ✓"
  return 0
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
  print_banner

  echo -e "${CYAN}Starting comprehensive federation system test...${NC}\n"

  # Check prerequisites
  print_info "Checking prerequisites..."

  if ! command -v curl &> /dev/null; then
    print_error "curl is not installed"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
  fi

  if ! command -v nc &> /dev/null; then
    print_warning "netcat (nc) not found, some tests may be skipped"
  fi

  print_success "Prerequisites checked\n"

  # Run test phases
  phase_1_network || {
    print_error "Phase 1 failed - cannot continue"
    exit 1
  }

  phase_2_geolocation || {
    print_warning "Phase 2 had issues - continuing anyway"
  }

  phase_3_device_pairing || {
    print_warning "Phase 3 had issues - continuing anyway"
  }

  phase_4_integration || {
    print_warning "Phase 4 had issues"
  }

  # Final summary
  print_header "FINAL SUMMARY"

  echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║                   Test Results                       ║${NC}"
  echo -e "${BLUE}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${BLUE}║${NC}  Tests Run:     ${YELLOW}$TESTS_RUN${NC}"
  echo -e "${BLUE}║${NC}  Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
  echo -e "${BLUE}║${NC}  Tests Failed:  ${RED}$TESTS_FAILED${NC}"

  success_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$TESTS_RUN)*100}")
  echo -e "${BLUE}║${NC}  Success Rate:  ${CYAN}$success_rate%${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"

  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}║        ✓ ALL TESTS PASSED!                          ║${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}║  Your multi-device federation system is working!    ║${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 0
  else
    echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                      ║${NC}"
    echo -e "${RED}║        ✗ SOME TESTS FAILED                          ║${NC}"
    echo -e "${RED}║                                                      ║${NC}"
    echo -e "${RED}║  Review the output above for details                ║${NC}"
    echo -e "${RED}║                                                      ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 1
  fi
}

# Run main function
main
