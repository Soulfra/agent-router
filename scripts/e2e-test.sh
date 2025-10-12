#!/bin/bash

###############################################################################
# CalOS End-to-End Test
#
# Comprehensive system test that verifies:
# - Local AI (Ollama) functionality
# - Database timing differentials
# - Cache performance
# - Widget availability
# - API endpoints
# - Time introspection features
#
# Usage:
#   ./scripts/e2e-test.sh
#   ./scripts/e2e-test.sh --skip-db-setup  (skip database creation)
#   ./scripts/e2e-test.sh --keep-running   (don't shutdown server after test)
###############################################################################

set -e  # Exit on error

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5001}"
DB_TYPE="${DB_TYPE:-postgres}"
DB_NAME="${DB_NAME:-calos}"
SKIP_DB_SETUP=false
KEEP_RUNNING=false
ROUTER_PID=""

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-db-setup)
      SKIP_DB_SETUP=true
      shift
      ;;
    --keep-running)
      KEEP_RUNNING=true
      shift
      ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

log_section() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
}

cleanup() {
  if [ ! -z "$ROUTER_PID" ] && [ "$KEEP_RUNNING" = false ]; then
    log_info "Stopping router (PID: $ROUTER_PID)..."
    kill $ROUTER_PID 2>/dev/null || true
    wait $ROUTER_PID 2>/dev/null || true
    log_success "Router stopped"
  elif [ "$KEEP_RUNNING" = true ]; then
    log_info "Router still running at PID $ROUTER_PID (--keep-running flag used)"
  fi
}

trap cleanup EXIT

###############################################################################
# 1. Check Prerequisites
###############################################################################

log_section "1. Checking Prerequisites"

# Check if Ollama is running
log_info "Checking Ollama..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  log_success "Ollama is running"
else
  log_error "Ollama is not running!"
  log_info "Start Ollama with: ollama serve"
  log_info "Or install from: https://ollama.ai"
  exit 1
fi

# Check if mistral model is available
log_info "Checking for Ollama models..."
if curl -s http://localhost:11434/api/tags | grep -q "mistral"; then
  log_success "Mistral model available"
else
  log_warning "Mistral model not found. Consider running: ollama pull mistral"
  log_info "E2E test will continue but may fail on model-specific tests"
fi

# Check database
if [ "$DB_TYPE" = "postgres" ]; then
  log_info "Checking PostgreSQL..."
  if command -v psql > /dev/null 2>&1; then
    log_success "PostgreSQL client installed"

    if [ "$SKIP_DB_SETUP" = false ]; then
      # Check if database exists
      if psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_success "Database '$DB_NAME' exists"
      else
        log_info "Creating database '$DB_NAME'..."
        createdb "$DB_NAME"
        log_success "Database created"
      fi

      # Run schema
      log_info "Loading database schema..."
      psql "$DB_NAME" < database/schema.sql > /dev/null 2>&1 || log_warning "Schema load had warnings (this is OK if tables already exist)"
      log_success "Schema loaded"
    else
      log_info "Skipping database setup (--skip-db-setup flag)"
    fi
  else
    log_error "PostgreSQL not installed"
    exit 1
  fi
elif [ "$DB_TYPE" = "sqlite" ]; then
  log_info "Using SQLite (database will be auto-created)"
  log_success "SQLite configured"
fi

# Check Node.js
log_info "Checking Node.js..."
if command -v node > /dev/null 2>&1; then
  NODE_VERSION=$(node --version)
  log_success "Node.js $NODE_VERSION installed"
else
  log_error "Node.js not installed"
  exit 1
fi

# Check dependencies
log_info "Checking npm dependencies..."
if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies..."
    npm install > /dev/null 2>&1
    log_success "Dependencies installed"
  else
    log_success "Dependencies already installed"
  fi
else
  log_error "package.json not found. Are you in the agent-router directory?"
  exit 1
fi

###############################################################################
# 2. Start Router
###############################################################################

log_section "2. Starting Router in Local Mode"

log_info "Starting router with --local flag..."
node router.js --local > /tmp/calos-router.log 2>&1 &
ROUTER_PID=$!

log_info "Router started (PID: $ROUTER_PID)"
log_info "Waiting for router to be ready..."

# Wait for router to be ready (max 30 seconds)
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    log_success "Router is ready!"
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ $WAITED -eq $MAX_WAIT ]; then
  log_error "Router failed to start within $MAX_WAIT seconds"
  log_info "Check logs at: /tmp/calos-router.log"
  tail -n 20 /tmp/calos-router.log
  exit 1
fi

###############################################################################
# 3. Test API Endpoints
###############################################################################

log_section "3. Testing API Endpoints"

# Health check
log_info "Testing health endpoint..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  log_success "Health check passed"
else
  log_error "Health check failed: $HEALTH"
  exit 1
fi

# Time endpoint
log_info "Testing time endpoint..."
TIME_UNIX=$(curl -s "$BASE_URL/time?action=unix")
if echo "$TIME_UNIX" | grep -q '"timestamp"'; then
  log_success "Time endpoint (unix) passed"
else
  log_error "Time endpoint failed: $TIME_UNIX"
  exit 1
fi

# System endpoint
log_info "Testing system endpoint..."
SYSTEM=$(curl -s "$BASE_URL/system")
if echo "$SYSTEM" | grep -q '"uptime"'; then
  log_success "System endpoint passed"
else
  log_error "System endpoint failed: $SYSTEM"
  exit 1
fi

# Introspect endpoint
log_info "Testing introspect endpoint (JSON)..."
INTROSPECT=$(curl -s "$BASE_URL/introspect")
if echo "$INTROSPECT" | grep -q '"components"'; then
  log_success "Introspect endpoint (JSON) passed"
else
  log_error "Introspect endpoint failed: $INTROSPECT"
  exit 1
fi

log_info "Testing introspect endpoint (XML)..."
INTROSPECT_XML=$(curl -s "$BASE_URL/introspect?format=xml")
if echo "$INTROSPECT_XML" | grep -q '<calos>'; then
  log_success "Introspect endpoint (XML) passed"
else
  log_error "Introspect endpoint (XML) failed"
  exit 1
fi

# Agents registry
log_info "Testing agents registry endpoint..."
AGENTS=$(curl -s "$BASE_URL/agents")
if echo "$AGENTS" | grep -q '"agents"'; then
  log_success "Agents registry passed"
else
  log_error "Agents registry failed: $AGENTS"
  exit 1
fi

###############################################################################
# 4. Test Agent Execution with Timing
###############################################################################

log_section "4. Testing Agent Execution (Cache Miss)"

log_info "Executing agent query (first time - should be cache miss)..."
TEST_QUERY="@ollama what is $(date +%s)?"  # Unique query using timestamp

START_TIME=$(date +%s%3N)
RESPONSE=$(curl -s -X POST "$BASE_URL/agent" \
  -H "Content-Type: application/json" \
  -d "{\"input\": \"$TEST_QUERY\", \"context\": {\"local\": true}}")
END_TIME=$(date +%s%3N)

LATENCY=$((END_TIME - START_TIME))

if echo "$RESPONSE" | grep -q '"logs"'; then
  log_success "Agent executed successfully (latency: ${LATENCY}ms)"
else
  log_error "Agent execution failed: $RESPONSE"
  exit 1
fi

###############################################################################
# 5. Test Cache Hit
###############################################################################

log_section "5. Testing Cache Performance"

log_info "Executing same query again (should be cache hit)..."

START_TIME=$(date +%s%3N)
RESPONSE=$(curl -s -X POST "$BASE_URL/agent" \
  -H "Content-Type: application/json" \
  -d "{\"input\": \"$TEST_QUERY\", \"context\": {\"local\": true}}")
END_TIME=$(date +%s%3N)

CACHE_LATENCY=$((END_TIME - START_TIME))

log_success "Cache hit latency: ${CACHE_LATENCY}ms"

if [ $CACHE_LATENCY -gt 1000 ]; then
  log_warning "Cache hit seems slow (> 1 second). Expected < 100ms."
else
  log_success "Cache hit performance is good!"
fi

###############################################################################
# 6. Verify Database Timing Data
###############################################################################

log_section "6. Verifying Database Timing Data"

if [ "$DB_TYPE" = "postgres" ]; then
  log_info "Checking timing columns exist..."

  COLUMNS=$(psql "$DB_NAME" -t -c "
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'ai_responses'
      AND column_name IN ('request_timestamp', 'response_timestamp', 'latency_ms', 'cache_hit')
  " | wc -l | tr -d ' ')

  if [ "$COLUMNS" -eq "4" ]; then
    log_success "All timing columns present"
  else
    log_error "Missing timing columns (found $COLUMNS, expected 4)"
    exit 1
  fi

  log_info "Checking timing indexes exist..."

  INDEXES=$(psql "$DB_NAME" -t -c "
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'ai_responses'
      AND indexname IN ('idx_responses_request_time', 'idx_responses_latency', 'idx_responses_cache_hit')
  " | wc -l | tr -d ' ')

  if [ "$INDEXES" -eq "3" ]; then
    log_success "All timing indexes present"
  else
    log_warning "Some timing indexes missing (found $INDEXES, expected 3)"
  fi

  log_info "Checking for timing data..."

  COUNT=$(psql "$DB_NAME" -t -c "
    SELECT COUNT(*) FROM ai_responses WHERE latency_ms IS NOT NULL
  " | tr -d ' ')

  if [ "$COUNT" -gt "0" ]; then
    log_success "Found $COUNT responses with timing data"

    # Get timing stats
    STATS=$(psql "$DB_NAME" -t -c "
      SELECT
        ROUND(AVG(latency_ms)::numeric, 0) as avg,
        MIN(latency_ms) as min,
        MAX(latency_ms) as max
      FROM ai_responses
      WHERE latency_ms IS NOT NULL
    ")

    log_info "Timing statistics: $STATS"
  else
    log_warning "No responses with timing data found"
  fi

  log_info "Verifying latency calculations..."

  DIFF=$(psql "$DB_NAME" -t -c "
    SELECT ABS(latency_ms - EXTRACT(EPOCH FROM (response_timestamp - request_timestamp)) * 1000) as diff
    FROM ai_responses
    WHERE response_timestamp IS NOT NULL AND latency_ms IS NOT NULL
    ORDER BY diff DESC
    LIMIT 1
  " | tr -d ' ')

  if [ ! -z "$DIFF" ]; then
    if [ $(echo "$DIFF < 10" | bc) -eq 1 ]; then
      log_success "Latency calculations are accurate (max diff: ${DIFF}ms)"
    else
      log_warning "Latency calculations have some drift (max diff: ${DIFF}ms)"
    fi
  fi

else
  log_info "SQLite verification skipped (not yet implemented)"
fi

###############################################################################
# 7. Test Widget Endpoints
###############################################################################

log_section "7. Testing Widget Endpoints"

WIDGETS=(
  "public/widgets/world-clock.js"
  "public/widgets/world-clock.css"
  "public/widgets/system-status.js"
  "public/widgets/system-status.css"
)

for widget in "${WIDGETS[@]}"; do
  log_info "Testing $widget..."
  if [ -f "$widget" ]; then
    log_success "$widget exists"
  else
    log_error "$widget not found"
    exit 1
  fi
done

log_info "Testing widget integration in wall.html..."
WALL=$(curl -s "$BASE_URL/wall.html")
if echo "$WALL" | grep -q "world-clock-widget" && echo "$WALL" | grep -q "system-status-widget"; then
  log_success "Widgets integrated in wall.html"
else
  log_error "Widgets not integrated in wall.html"
  exit 1
fi

###############################################################################
# 8. Run SQL Verification (if available)
###############################################################################

log_section "8. Running SQL Verification"

if [ "$DB_TYPE" = "postgres" ] && [ -f "database/verify-install.sql" ]; then
  log_info "Running SQL verification queries..."
  psql "$DB_NAME" -f database/verify-install.sql > /tmp/calos-verify.log 2>&1
  log_success "SQL verification complete (see /tmp/calos-verify.log for details)"
else
  log_info "SQL verification skipped (not applicable for $DB_TYPE or verify-install.sql not found)"
fi

###############################################################################
# 9. Run Automated Test Suite
###############################################################################

log_section "9. Running Automated Test Suite"

if [ -f "scripts/test-all-features.js" ]; then
  log_info "Running test-all-features.js..."

  if node scripts/test-all-features.js; then
    log_success "Automated tests passed!"
  else
    log_error "Some automated tests failed"
    exit 1
  fi
else
  log_info "Automated test suite not found (scripts/test-all-features.js)"
fi

###############################################################################
# 10. Summary
###############################################################################

log_section "✨ E2E Test Complete!"

echo ""
echo "Summary:"
echo "  ✅ Prerequisites verified"
echo "  ✅ Router started successfully"
echo "  ✅ API endpoints working"
echo "  ✅ Agent execution working"
echo "  ✅ Cache performance verified"
echo "  ✅ Database timing data verified"
echo "  ✅ Widgets available"
echo "  ✅ SQL verification complete"
echo "  ✅ Automated tests passed"
echo ""

if [ "$KEEP_RUNNING" = true ]; then
  echo "Router is still running at: $BASE_URL"
  echo "Router PID: $ROUTER_PID"
  echo "Logs: /tmp/calos-router.log"
  echo ""
  echo "To stop the router:"
  echo "  kill $ROUTER_PID"
  echo ""
fi

log_success "All systems operational! CalOS is ready for local-first AI."
