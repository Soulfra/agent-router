#!/bin/bash

#
# Run Database Migrations for Talent Marketplace
#
# This script runs all marketplace-related migrations in order.
# Requires DATABASE_URL environment variable to be set.
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

echo -e "${BLUE}Talent Marketplace - Database Migration${NC}\n"

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ DATABASE_URL environment variable not set${NC}"
    echo -e "\n${YELLOW}Set DATABASE_URL first:${NC}"
    echo -e "  export DATABASE_URL=\"postgresql://user:pass@host:port/dbname\"\n"
    exit 1
fi

echo -e "${GREEN}✓ DATABASE_URL found${NC}"
echo -e "${GRAY}Database: $(echo $DATABASE_URL | sed -E 's/postgresql:\/\/[^@]+@/postgresql:\/\/***@/')${NC}\n"

# Migrations to run
MIGRATIONS=(
    "migrations/056_decision_tracking.sql"
    "migrations/057_marketplace_reputation.sql"
)

# Run each migration
for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_PATH="$ROOT_DIR/$migration"

    if [ ! -f "$MIGRATION_PATH" ]; then
        echo -e "${RED}✗ Migration file not found: $migration${NC}"
        continue
    fi

    echo -e "${BLUE}Running migration: ${migration}${NC}"

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}✗ psql command not found${NC}"
        echo -e "${YELLOW}Install PostgreSQL client tools first${NC}\n"
        exit 1
    fi

    # Run migration
    if psql "$DATABASE_URL" -f "$MIGRATION_PATH"; then
        echo -e "${GREEN}✓ Migration complete: ${migration}${NC}\n"
    else
        echo -e "${RED}✗ Migration failed: ${migration}${NC}\n"
        exit 1
    fi
done

echo -e "${GREEN}✓ All migrations completed successfully${NC}\n"

# Optional: Run validation
echo -e "${GRAY}Tip: Run 'npm test' or 'node scripts/validate-marketplace-system.js' to validate the system${NC}"
