#!/bin/bash

#
# Validate Talent Marketplace System
#
# Runs comprehensive validation tests to ensure all modules are working correctly.
# This is like running "two compilers" to catch type issues and integration problems.
#

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Check for --verbose flag
VERBOSE=""
if [[ "$*" == *"--verbose"* ]]; then
    VERBOSE="--verbose"
fi

echo -e "${BLUE}Talent Marketplace - System Validation${NC}\n"

# Change to root directory
cd "$ROOT_DIR"

# Check if validator exists
VALIDATOR="$ROOT_DIR/scripts/validate-marketplace-system.js"

if [ ! -f "$VALIDATOR" ]; then
    echo -e "${RED}✗ Validator script not found: $VALIDATOR${NC}"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    echo -e "${YELLOW}Install Node.js first${NC}\n"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js found: ${NODE_VERSION}${NC}\n"

# Run validator
echo -e "${GRAY}Running validation tests...${NC}\n"

if [ -n "$VERBOSE" ]; then
    node "$VALIDATOR" --verbose
else
    node "$VALIDATOR"
fi

# Exit with same code as validator
exit $?
