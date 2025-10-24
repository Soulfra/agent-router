#!/bin/bash
#
# Master Diagnostic Script
# Uses YOUR existing tools to check everything
#
# Created: $(date)
# Usage: ./master-diagnostic.sh

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emojis
CHECK="✅"
CROSS="❌"
INFO="ℹ️"
ROCKET="🚀"
GEAR="⚙️"
EYES="👀"

# Create logs directory
mkdir -p logs

# Timestamp for this run
TIMESTAMP=$(date +%s)
LOG_DIR="logs/diagnostic-$TIMESTAMP"
mkdir -p "$LOG_DIR"

echo ""
echo "${CYAN}════════════════════════════════════════${NC}"
echo "${CYAN}  CalOS Master Diagnostic${NC}"
echo "${CYAN}  Using YOUR existing tools${NC}"
echo "${CYAN}════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# STEP 1: VOS - Verify Operating System
# ============================================================================

echo "${BLUE}${GEAR} Step 1/5: Running VOS (Verify Operating System)...${NC}"
echo ""

if npm run vos > "$LOG_DIR/vos.log" 2>&1; then
  cat "$LOG_DIR/vos.log"
  echo ""
  echo "${GREEN}${CHECK} VOS check complete${NC}"
else
  echo "${RED}${CROSS} VOS check failed${NC}"
  echo "${YELLOW}${INFO} Check $LOG_DIR/vos.log for details${NC}"
fi

echo ""

# ============================================================================
# STEP 2: Check if server is running
# ============================================================================

echo "${BLUE}${GEAR} Step 2/5: Checking if server is running...${NC}"

if lsof -i :5001 > /dev/null 2>&1; then
  PID=$(lsof -ti :5001)
  echo "${GREEN}${CHECK} Server is running (PID: $PID)${NC}"
  echo "   Port: 5001"
  echo "   Process: $(ps -p $PID -o comm=)"
else
  echo "${YELLOW}${INFO} Server is not running${NC}"
  echo ""
  echo "Would you like to start it?"
  echo "  1) Normal mode: npm start"
  echo "  2) Quiet mode: npm run start:quiet"
  echo "  3) Animated: npm run start:animated"
  echo ""
fi

echo ""

# ============================================================================
# STEP 3: Check Ollama
# ============================================================================

echo "${BLUE}${GEAR} Step 3/5: Checking Ollama...${NC}"

if curl -s http://localhost:11434/api/tags > "$LOG_DIR/ollama-models.json" 2>&1; then
  MODEL_COUNT=$(cat "$LOG_DIR/ollama-models.json" | grep -o "\"name\"" | wc -l | tr -d ' ')
  echo "${GREEN}${CHECK} Ollama is running${NC}"
  echo "   Models loaded: $MODEL_COUNT"
  echo "   Details: $LOG_DIR/ollama-models.json"
else
  echo "${YELLOW}${INFO} Ollama not responding${NC}"
  echo "   Start with: ollama serve"
fi

echo ""

# ============================================================================
# STEP 4: Check PostgreSQL
# ============================================================================

echo "${BLUE}${GEAR} Step 4/5: Checking PostgreSQL...${NC}"

if command -v psql &> /dev/null; then
  if psql -U $USER -d calos -c "SELECT COUNT(*) FROM domains;" > "$LOG_DIR/postgres.log" 2>&1; then
    DOMAIN_COUNT=$(tail -3 "$LOG_DIR/postgres.log" | head -1 | tr -d ' ')
    echo "${GREEN}${CHECK} PostgreSQL is running${NC}"
    echo "   Database: calos"
    echo "   Domains configured: $DOMAIN_COUNT"
  else
    echo "${YELLOW}${INFO} PostgreSQL running but database 'calos' not accessible${NC}"
    echo "   Create with: createdb calos"
    echo "   Run migrations: npm run migrate"
  fi
else
  echo "${YELLOW}${INFO} PostgreSQL not installed${NC}"
  echo "   Install: brew install postgresql"
fi

echo ""

# ============================================================================
# STEP 5: Check interfaces
# ============================================================================

echo "${BLUE}${GEAR} Step 5/5: Checking interfaces...${NC}"

if lsof -i :5001 > /dev/null 2>&1; then
  echo "${GREEN}${CHECK} Interfaces available:${NC}"
  echo ""
  echo "  ${CYAN}${EYES} Theater:${NC}"
  echo "     http://localhost:5001/theater.html"
  echo ""
  echo "  ${CYAN}${EYES} Chat:${NC}"
  echo "     http://localhost:5001/chat.html"
  echo ""
  echo "  ${CYAN}${EYES} Ollama Terminal:${NC}"
  echo "     http://localhost:5001/ollama-terminal.html"
  echo ""
  echo "  ${CYAN}${EYES} Model Grid:${NC}"
  echo "     http://localhost:5001/model-grid.html"
  echo ""
else
  echo "${YELLOW}${INFO} Server not running - interfaces not accessible${NC}"
  echo "   Start server first"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "${CYAN}════════════════════════════════════════${NC}"
echo "${CYAN}  Diagnostic Complete${NC}"
echo "${CYAN}════════════════════════════════════════${NC}"
echo ""
echo "${INFO} Logs saved to: $LOG_DIR"
echo ""
echo "${ROCKET} Quick actions:"
echo ""
echo "  ${GREEN}Open chat:${NC}"
echo "  open http://localhost:5001/chat.html"
echo ""
echo "  ${GREEN}Open theater:${NC}"
echo "  open http://localhost:5001/theater.html"
echo ""
echo "  ${GREEN}Check models:${NC}"
echo "  curl http://localhost:11434/api/tags | jq"
echo ""
echo "  ${GREEN}Watch logs:${NC}"
echo "  tail -f $LOG_DIR/vos.log"
echo ""
