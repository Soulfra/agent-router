#!/bin/bash

################################################################################
# Multi-Port Ollama Setup Script
# Manages 5 Ollama instances on ports 11434-11438
#
# Port Assignments:
#   11434 - Domain Models (soulfra, deathtodata, etc.)
#   11435 - Git-Optimized Models (codellama, starcoder, deepseek-coder)
#   11436 - Gaming/Visual Models (llava, bakllava)
#   11437 - Copilot/Autonomous Models (codellama:13b, deepseek-coder-instruct)
#   11438 - Standards/Protocol Models (mistral, phi)
#
# Usage:
#   ./setup-multi-port-ollama.sh start       # Start all 5 Ollama instances
#   ./setup-multi-port-ollama.sh stop        # Stop all 5 Ollama instances
#   ./setup-multi-port-ollama.sh restart     # Restart all instances
#   ./setup-multi-port-ollama.sh status      # Check status of all instances
#   ./setup-multi-port-ollama.sh pull-models # Pull all required models
#   ./setup-multi-port-ollama.sh logs [port] # View logs for specific port
################################################################################

set -e

# Configuration
LOG_DIR="${HOME}/.calos/ollama-logs"
PID_DIR="${HOME}/.calos/ollama-pids"

# Ports
PORT_DOMAIN=11434
PORT_GIT=11435
PORT_GAMING=11436
PORT_COPILOT=11437
PORT_PROTOCOL=11438

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

################################################################################
# Helper Functions
################################################################################

create_directories() {
  mkdir -p "$LOG_DIR"
  mkdir -p "$PID_DIR"
}

check_ollama_installed() {
  if ! command -v ollama &> /dev/null; then
    echo -e "${RED}Error: ollama is not installed${NC}"
    echo "Install ollama from: https://ollama.com/download"
    exit 1
  fi
}

get_pid_file() {
  local port=$1
  echo "$PID_DIR/ollama-${port}.pid"
}

get_log_file() {
  local port=$1
  echo "$LOG_DIR/ollama-${port}.log"
}

is_port_running() {
  local port=$1
  local pid_file=$(get_pid_file "$port")

  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      return 0 # Running
    else
      # PID file exists but process is dead
      rm -f "$pid_file"
      return 1
    fi
  fi

  return 1 # Not running
}

wait_for_port() {
  local port=$1
  local max_wait=30
  local waited=0

  echo -n "Waiting for port $port to become available"

  while [ $waited -lt $max_wait ]; do
    if curl -s "http://localhost:${port}/api/tags" > /dev/null 2>&1; then
      echo -e " ${GREEN}✓${NC}"
      return 0
    fi

    echo -n "."
    sleep 1
    waited=$((waited + 1))
  done

  echo -e " ${RED}✗${NC}"
  return 1
}

################################################################################
# Start Functions
################################################################################

start_ollama_instance() {
  local port=$1
  local name=$2
  local log_file=$(get_log_file "$port")
  local pid_file=$(get_pid_file "$port")

  if is_port_running "$port"; then
    echo -e "${YELLOW}Port $port ($name) is already running${NC}"
    return 0
  fi

  echo -e "${BLUE}Starting Ollama on port $port ($name)...${NC}"

  # Start Ollama in background
  OLLAMA_HOST=127.0.0.1:${port} ollama serve > "$log_file" 2>&1 &
  local pid=$!

  # Save PID
  echo "$pid" > "$pid_file"

  # Wait for port to be ready
  if wait_for_port "$port"; then
    echo -e "${GREEN}✓ Port $port ($name) started successfully (PID: $pid)${NC}"
    return 0
  else
    echo -e "${RED}✗ Port $port ($name) failed to start${NC}"
    echo "Check logs: tail -f $log_file"
    return 1
  fi
}

start_all() {
  echo -e "${PURPLE}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║  Starting Multi-Port Ollama Architecture      ║${NC}"
  echo -e "${PURPLE}╚════════════════════════════════════════════════╝${NC}"
  echo ""

  create_directories
  check_ollama_installed

  # Start all 5 instances
  start_ollama_instance $PORT_DOMAIN "Domain Models"
  sleep 2

  start_ollama_instance $PORT_GIT "Git Models"
  sleep 2

  start_ollama_instance $PORT_GAMING "Gaming/Visual Models"
  sleep 2

  start_ollama_instance $PORT_COPILOT "Copilot Models"
  sleep 2

  start_ollama_instance $PORT_PROTOCOL "Protocol Models"
  sleep 2

  echo ""
  echo -e "${GREEN}All Ollama instances started successfully!${NC}"
  echo ""
  show_status
}

################################################################################
# Stop Functions
################################################################################

stop_ollama_instance() {
  local port=$1
  local name=$2
  local pid_file=$(get_pid_file "$port")

  if ! is_port_running "$port"; then
    echo -e "${YELLOW}Port $port ($name) is not running${NC}"
    return 0
  fi

  local pid=$(cat "$pid_file")
  echo -e "${BLUE}Stopping Ollama on port $port ($name, PID: $pid)...${NC}"

  kill "$pid" 2>/dev/null || true
  rm -f "$pid_file"

  # Wait for process to die
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ $waited -lt 10 ]; do
    sleep 1
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${YELLOW}Process $pid didn't stop gracefully, killing forcefully${NC}"
    kill -9 "$pid" 2>/dev/null || true
  fi

  echo -e "${GREEN}✓ Port $port ($name) stopped${NC}"
}

stop_all() {
  echo -e "${PURPLE}Stopping all Ollama instances...${NC}"
  echo ""

  stop_ollama_instance $PORT_DOMAIN "Domain Models"
  stop_ollama_instance $PORT_GIT "Git Models"
  stop_ollama_instance $PORT_GAMING "Gaming/Visual Models"
  stop_ollama_instance $PORT_COPILOT "Copilot Models"
  stop_ollama_instance $PORT_PROTOCOL "Protocol Models"

  echo ""
  echo -e "${GREEN}All Ollama instances stopped${NC}"
}

################################################################################
# Status Functions
################################################################################

show_status() {
  echo -e "${PURPLE}╔════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║              Multi-Port Ollama Status                              ║${NC}"
  echo -e "${PURPLE}╚════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  printf "%-8s %-25s %-10s %-10s\n" "PORT" "SERVICE" "STATUS" "PID"
  printf "%-8s %-25s %-10s %-10s\n" "----" "-------" "------" "---"

  check_port_status $PORT_DOMAIN "Domain Models"
  check_port_status $PORT_GIT "Git-Optimized Models"
  check_port_status $PORT_GAMING "Gaming/Visual Models"
  check_port_status $PORT_COPILOT "Copilot/Autonomous Models"
  check_port_status $PORT_PROTOCOL "Standards/Protocol Models"

  echo ""
}

check_port_status() {
  local port=$1
  local name=$2
  local pid_file=$(get_pid_file "$port")

  if is_port_running "$port"; then
    local pid=$(cat "$pid_file")
    printf "${GREEN}%-8s${NC} %-25s ${GREEN}%-10s${NC} %-10s\n" "$port" "$name" "RUNNING" "$pid"
  else
    printf "${RED}%-8s${NC} %-25s ${RED}%-10s${NC} %-10s\n" "$port" "$name" "STOPPED" "-"
  fi
}

################################################################################
# Model Pulling Functions
################################################################################

pull_models_for_port() {
  local port=$1
  local name=$2
  shift 2
  local models=("$@")

  echo -e "${BLUE}Pulling models for port $port ($name)...${NC}"

  for model in "${models[@]}"; do
    echo -e "  ${YELLOW}→ Pulling $model...${NC}"
    OLLAMA_HOST=127.0.0.1:${port} ollama pull "$model"
    echo -e "  ${GREEN}✓ $model pulled${NC}"
  done

  echo ""
}

pull_all_models() {
  echo -e "${PURPLE}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║  Pulling Models for All Ports                  ║${NC}"
  echo -e "${PURPLE}╚════════════════════════════════════════════════╝${NC}"
  echo ""

  # Ensure all instances are running
  if ! is_port_running $PORT_DOMAIN; then
    echo -e "${RED}Error: Ollama instances must be running to pull models${NC}"
    echo "Run: $0 start"
    exit 1
  fi

  # Port 11434 - Domain Models
  pull_models_for_port $PORT_DOMAIN "Domain Models" \
    "codellama:7b" \
    "mistral:7b"

  # Port 11435 - Git Models
  pull_models_for_port $PORT_GIT "Git Models" \
    "codellama:7b" \
    "starcoder:7b" \
    "deepseek-coder:6.7b"

  # Port 11436 - Gaming/Visual Models
  pull_models_for_port $PORT_GAMING "Gaming/Visual Models" \
    "llava:7b" \
    "bakllava"

  # Port 11437 - Copilot Models
  pull_models_for_port $PORT_COPILOT "Copilot Models" \
    "codellama:13b" \
    "deepseek-coder-instruct:6.7b"

  # Port 11438 - Protocol Models
  pull_models_for_port $PORT_PROTOCOL "Protocol Models" \
    "mistral:7b" \
    "phi:3"

  echo -e "${GREEN}All models pulled successfully!${NC}"
  echo ""
  echo -e "${YELLOW}Note: Custom domain models (soulfra-model, deathtodata-model, etc.)${NC}"
  echo -e "${YELLOW}must be built separately using their Modelfiles in ollama-models/${NC}"
}

################################################################################
# Logs Functions
################################################################################

show_logs() {
  local port=$1

  if [ -z "$port" ]; then
    echo -e "${YELLOW}Showing logs for all ports (last 20 lines each):${NC}"
    echo ""

    for p in $PORT_DOMAIN $PORT_GIT $PORT_GAMING $PORT_COPILOT $PORT_PROTOCOL; do
      local log_file=$(get_log_file "$p")
      echo -e "${BLUE}=== Port $p ===${NC}"
      if [ -f "$log_file" ]; then
        tail -20 "$log_file"
      else
        echo "(no logs yet)"
      fi
      echo ""
    done
  else
    local log_file=$(get_log_file "$port")
    echo -e "${BLUE}Following logs for port $port:${NC}"
    echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
    echo ""

    if [ -f "$log_file" ]; then
      tail -f "$log_file"
    else
      echo -e "${RED}No log file found: $log_file${NC}"
      exit 1
    fi
  fi
}

################################################################################
# Test Functions
################################################################################

test_all_ports() {
  echo -e "${PURPLE}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║  Testing All Ollama Ports                      ║${NC}"
  echo -e "${PURPLE}╚════════════════════════════════════════════════╝${NC}"
  echo ""

  for port in $PORT_DOMAIN $PORT_GIT $PORT_GAMING $PORT_COPILOT $PORT_PROTOCOL; do
    echo -e "${BLUE}Testing port $port...${NC}"

    if curl -s "http://localhost:${port}/api/tags" > /dev/null 2>&1; then
      local model_count=$(curl -s "http://localhost:${port}/api/tags" | grep -o '"name"' | wc -l | tr -d ' ')
      echo -e "  ${GREEN}✓ Port $port is responding ($model_count models available)${NC}"
    else
      echo -e "  ${RED}✗ Port $port is not responding${NC}"
    fi
  done

  echo ""
}

################################################################################
# Main Command Router
################################################################################

show_help() {
  echo "Multi-Port Ollama Setup Script"
  echo ""
  echo "Usage: $0 [command] [options]"
  echo ""
  echo "Commands:"
  echo "  start         Start all 5 Ollama instances (ports 11434-11438)"
  echo "  stop          Stop all Ollama instances"
  echo "  restart       Restart all instances"
  echo "  status        Show status of all instances"
  echo "  pull-models   Pull all required models for each port"
  echo "  test          Test connectivity to all ports"
  echo "  logs [port]   View logs (all ports or specific port)"
  echo ""
  echo "Port Assignments:"
  echo "  11434 - Domain Models (soulfra, deathtodata, etc.)"
  echo "  11435 - Git-Optimized Models (codellama, starcoder)"
  echo "  11436 - Gaming/Visual Models (llava, bakllava)"
  echo "  11437 - Copilot/Autonomous Models (codellama:13b)"
  echo "  11438 - Standards/Protocol Models (mistral, phi)"
  echo ""
  echo "Examples:"
  echo "  $0 start              # Start all instances"
  echo "  $0 status             # Check status"
  echo "  $0 logs 11435         # View logs for Git port"
  echo "  $0 pull-models        # Pull all models"
  echo ""
}

# Main command router
case "${1:-}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    sleep 2
    start_all
    ;;
  status)
    show_status
    ;;
  pull-models)
    pull_all_models
    ;;
  test)
    test_all_ports
    ;;
  logs)
    show_logs "${2:-}"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo -e "${RED}Error: Unknown command '${1:-}'${NC}"
    echo ""
    show_help
    exit 1
    ;;
esac
