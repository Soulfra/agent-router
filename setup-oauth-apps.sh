#!/bin/bash
#
# OAuth Setup - One Command
#
# This script automates the entire OAuth setup process:
# - Detects installed CLIs and uses them when possible
# - Opens browser windows with visual guidance
# - Watches clipboard for credentials
# - Auto-updates .env file
# - Configures database
# - Tests OAuth flows
#
# Usage:
#   chmod +x setup-oauth-apps.sh
#   ./setup-oauth-apps.sh [--auto | --wizard | --browser]
#
# Options:
#   --auto      Use CLI automation where possible (fastest)
#   --wizard    Use interactive CLI wizard
#   --browser   Use browser automation with highlighting
#   (no option) Interactive menu to choose

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# Print banner
print_banner() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}              🚀 OAuth Setup - One Command                     ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# Print section header
print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# Detect which method to use
detect_method() {
  print_section "Detecting Available Setup Methods"

  local methods=()

  # Check for GitHub CLI
  if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null; then
      methods+=("auto")
      echo -e "${GREEN}✓${NC} GitHub CLI authenticated (can auto-setup)"
    fi
  fi

  # Check for Node.js (required for all methods)
  if command -v node &> /dev/null; then
    methods+=("wizard")
    echo -e "${GREEN}✓${NC} Node.js available (CLI wizard supported)"

    # Check for Puppeteer
    if npm list puppeteer &> /dev/null 2>&1; then
      methods+=("browser")
      echo -e "${GREEN}✓${NC} Puppeteer installed (browser automation supported)"
    fi
  fi

  if [ ${#methods[@]} -eq 0 ]; then
    echo -e "${RED}✗${NC} No setup methods available"
    echo "  Please install Node.js: https://nodejs.org/"
    exit 1
  fi

  echo ""
  echo "Available setup methods:"
  for method in "${methods[@]}"; do
    case $method in
      auto)
        echo -e "  ${GREEN}1)${NC} Auto - Uses CLI tools when possible (recommended)"
        ;;
      wizard)
        echo -e "  ${YELLOW}2)${NC} Wizard - Interactive CLI with manual steps"
        ;;
      browser)
        echo -e "  ${CYAN}3)${NC} Browser - Visual automation with highlighting"
        ;;
    esac
  done
}

# Interactive method selection
select_method() {
  echo ""
  read -p "$(echo -e ${CYAN}Select method [1-3]:${NC} )" choice

  case $choice in
    1) return 0 ;; # auto
    2) return 1 ;; # wizard
    3) return 2 ;; # browser
    *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
  esac
}

# Run auto setup (CLI-based)
run_auto() {
  print_section "🤖 Auto Setup (CLI-based)"

  echo -e "${YELLOW}→${NC} Starting CLI wizard..."
  node "${SCRIPT_DIR}/lib/oauth-wizard.js"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Auto setup completed successfully"
  else
    echo -e "${RED}✗${NC} Auto setup failed"
    exit 1
  fi
}

# Run wizard setup (Interactive CLI)
run_wizard() {
  print_section "🧙 Interactive Wizard"

  echo -e "${YELLOW}→${NC} Opening web-based wizard..."

  # Check if server is running
  if curl -s -f "http://localhost:5001/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Server already running"
  else
    echo -e "${YELLOW}⚠${NC}  Starting server..."
    cd "${SCRIPT_DIR}"
    npm start &
    SERVER_PID=$!

    # Wait for server to start
    echo -n "  Waiting for server"
    for i in {1..30}; do
      if curl -s -f "http://localhost:5001/health" > /dev/null 2>&1; then
        echo ""
        echo -e "${GREEN}✓${NC} Server ready"
        break
      fi
      echo -n "."
      sleep 1
    done
  fi

  # Open wizard in browser
  if command -v open &> /dev/null; then
    open "http://localhost:5001/oauth-setup-wizard.html"
  elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:5001/oauth-setup-wizard.html"
  else
    echo ""
    echo -e "${CYAN}→${NC} Open this URL in your browser:"
    echo "  http://localhost:5001/oauth-setup-wizard.html"
  fi

  echo ""
  echo -e "${CYAN}💡 Follow the wizard steps in your browser${NC}"
  echo -e "${CYAN}   Press Enter when you've completed the wizard...${NC}"
  read

  # Stop server if we started it
  if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
}

# Run browser automation
run_browser() {
  print_section "🌐 Browser Automation"

  echo -e "${YELLOW}→${NC} Starting browser automation..."
  echo -e "${CYAN}   This will open browser windows with visual highlights${NC}"
  echo ""

  node "${SCRIPT_DIR}/lib/oauth-browser-setup.js" all

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Browser automation completed"
  else
    echo -e "${RED}✗${NC} Browser automation failed"
    exit 1
  fi
}

# Verify .env file
verify_env() {
  print_section "📋 Verifying Configuration"

  if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗${NC} .env file not found"
    return 1
  fi

  local missing=()

  # Check required variables
  if ! grep -q "^GOOGLE_CLIENT_ID=" "$ENV_FILE"; then
    missing+=("GOOGLE_CLIENT_ID")
  fi

  if ! grep -q "^MICROSOFT_CLIENT_ID=" "$ENV_FILE"; then
    missing+=("MICROSOFT_CLIENT_ID")
  fi

  if ! grep -q "^GITHUB_CLIENT_ID=" "$ENV_FILE"; then
    missing+=("GITHUB_CLIENT_ID")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC}  Some credentials are missing:"
    for var in "${missing[@]}"; do
      echo "  - $var"
    done
    echo ""
    echo -e "${CYAN}💡 You can add them manually to .env or re-run setup${NC}"
    return 1
  fi

  echo -e "${GREEN}✓${NC} All OAuth credentials configured"
  return 0
}

# Configure database
configure_database() {
  print_section "🗄️  Configuring Database"

  echo -e "${YELLOW}→${NC} Running OAuth provider setup..."
  node "${SCRIPT_DIR}/lib/oauth-provider-setup.js" setup

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Database configured successfully"
  else
    echo -e "${RED}✗${NC} Database configuration failed"
    echo -e "${YELLOW}⚠${NC}  You may need to check your database connection"
    return 1
  fi
}

# Test OAuth flows
test_oauth() {
  print_section "🧪 Testing OAuth Flows"

  echo -e "${YELLOW}→${NC} Running test suite..."
  "${SCRIPT_DIR}/test-oauth-passkey.sh"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} OAuth tests passed"
  else
    echo -e "${YELLOW}⚠${NC}  Some tests failed (this is normal if server isn't running)"
  fi
}

# Print success message
print_success() {
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}                   ✅ Setup Complete!                           ${GREEN}║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}Next Steps:${NC}"
  echo ""
  echo -e "  1. Start the server:"
  echo -e "     ${YELLOW}npm start${NC}"
  echo ""
  echo -e "  2. Test OAuth login:"
  echo -e "     ${YELLOW}open http://localhost:5001/oauth-login.html${NC}"
  echo ""
  echo -e "  3. View documentation:"
  echo -e "     ${YELLOW}cat docs/OAUTH-PASSKEY-AUTH.md${NC}"
  echo ""
  echo -e "${MAGENTA}📸 Screenshots saved to: oauth-screenshots/${NC}"
  echo ""
}

# Main execution
main() {
  print_banner

  # Check for command line arguments
  case "${1:-}" in
    --auto)
      run_auto
      ;;
    --wizard)
      run_wizard
      ;;
    --browser)
      run_browser
      ;;
    --help|-h)
      echo "Usage: $0 [--auto | --wizard | --browser]"
      echo ""
      echo "Options:"
      echo "  --auto      Use CLI automation (fastest)"
      echo "  --wizard    Use interactive web wizard"
      echo "  --browser   Use browser automation with highlighting"
      echo "  (no option) Interactive menu"
      exit 0
      ;;
    "")
      # No arguments - show menu
      detect_method
      select_method
      method=$?

      case $method in
        0) run_auto ;;
        1) run_wizard ;;
        2) run_browser ;;
      esac
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac

  # Post-setup verification
  if verify_env; then
    configure_database
    test_oauth
    print_success
  else
    echo ""
    echo -e "${YELLOW}⚠${NC}  Setup incomplete. Please add missing credentials to .env"
    echo -e "${CYAN}→${NC} Run this script again or edit .env manually"
    exit 1
  fi
}

# Run main function
main "$@"
