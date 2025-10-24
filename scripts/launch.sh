#!/bin/bash

# CALOS Launch Script
#
# Quick launcher for all CALOS apps
#
# Usage:
#   ./scripts/launch.sh [app]
#
# Examples:
#   ./scripts/launch.sh              # Show menu
#   ./scripts/launch.sh soulfra      # Open SoulFra OS
#   ./scripts/launch.sh enterprise   # Open enterprise dashboard
#   ./scripts/launch.sh ios          # Open iOS simulator

set -e

PORT=5001
BASE_URL="http://localhost:$PORT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 CALOS Launcher${NC}"
echo ""

# Check if server is running
if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Server not running${NC}"
  echo ""
  read -p "Start server? (y/n) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Starting server...${NC}"
    cd "$(dirname "$0")/.."
    npm start &
    SERVER_PID=$!

    # Wait for server to start
    echo "Waiting for server to start..."
    for i in {1..30}; do
      if curl -s "$BASE_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server started${NC}"
        sleep 1
        break
      fi
      sleep 1
    done
  else
    echo -e "${RED}Exiting. Start server with: npm start${NC}"
    exit 1
  fi
fi

# Parse command
APP=$1

# If no app specified, show menu
if [ -z "$APP" ]; then
  echo "Select an app to launch:"
  echo ""
  echo "  1) Enterprise Dashboard  (admin view)"
  echo "  2) SoulFra OS            (network ops center)"
  echo "  3) Culture Profile       (customer analysis)"
  echo "  4) Usage Monitoring      (usage tracking)"
  echo "  5) Pricing Calculator    (pricing tool)"
  echo "  6) Main Dashboard        (home)"
  echo ""
  echo "  7) iOS Simulator         (open Xcode)"
  echo "  8) All Pages             (list all 79 pages)"
  echo ""
  read -p "Choice (1-8): " choice

  case $choice in
    1) APP="enterprise";;
    2) APP="soulfra";;
    3) APP="culture";;
    4) APP="usage";;
    5) APP="pricing";;
    6) APP="dashboard";;
    7) APP="ios";;
    8) APP="list";;
    *) echo -e "${RED}Invalid choice${NC}"; exit 1;;
  esac
fi

# Launch app
case $APP in
  enterprise|admin)
    URL="$BASE_URL/enterprise-dashboard.html"
    echo -e "${GREEN}Opening Enterprise Dashboard...${NC}"
    ;;

  soulfra|soul)
    URL="$BASE_URL/soulfra-os.html"
    echo -e "${GREEN}Opening SoulFra OS...${NC}"
    ;;

  culture|profile)
    URL="$BASE_URL/culture-profile.html"
    echo -e "${GREEN}Opening Culture Profile...${NC}"
    ;;

  usage|monitor)
    URL="$BASE_URL/usage-monitoring.html"
    echo -e "${GREEN}Opening Usage Monitoring...${NC}"
    ;;

  pricing|calculator)
    URL="$BASE_URL/pricing-calculator.html"
    echo -e "${GREEN}Opening Pricing Calculator...${NC}"
    ;;

  dashboard|home)
    URL="$BASE_URL/dashboard.html"
    echo -e "${GREEN}Opening Main Dashboard...${NC}"
    ;;

  ios|xcode)
    echo -e "${GREEN}Opening iOS project in Xcode...${NC}"
    cd "$(dirname "$0")/.."
    npm run ios:open
    exit 0
    ;;

  list|all)
    echo -e "${GREEN}All available pages:${NC}"
    echo ""
    ls -1 public/*.html | sed 's|public/||' | sed "s|^|  $BASE_URL/|"
    echo ""
    exit 0
    ;;

  *)
    echo -e "${RED}Unknown app: $APP${NC}"
    echo ""
    echo "Available apps:"
    echo "  enterprise, soulfra, culture, usage, pricing, dashboard, ios, list"
    exit 1
    ;;
esac

# Open URL
if [ -n "$URL" ]; then
  echo -e "${BLUE}$URL${NC}"

  # Detect OS and open
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$URL"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "$URL"
  else
    echo "Please open: $URL"
  fi
fi

echo ""
echo -e "${GREEN}✓ Done${NC}"
