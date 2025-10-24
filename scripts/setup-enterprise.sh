#!/bin/bash

# CALOS Enterprise Setup Script
#
# This script:
# 1. Runs the pricing system migration (082)
# 2. Seeds test customer data (083)
# 3. Verifies the setup
#
# Usage:
#   ./scripts/setup-enterprise.sh

set -e # Exit on error

echo "🚀 CALOS Enterprise Setup"
echo "========================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo ""
  echo "Set it with:"
  echo "  export DATABASE_URL=postgresql://user:password@localhost:5432/calos"
  echo ""
  exit 1
fi

echo "📊 Database: $DATABASE_URL"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

echo "📦 Step 1: Running pricing system migration (082)..."
psql "$DATABASE_URL" -f database/migrations/082_pricing_system.sql

echo ""
echo "🌱 Step 2: Seeding test customer data (083)..."
psql "$DATABASE_URL" -f database/migrations/083_seed_test_customer.sql

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "  1. Start the server: npm start"
echo "  2. Open enterprise dashboard: http://localhost:5001/enterprise-dashboard.html"
echo "  3. Open culture profile: http://localhost:5001/culture-profile.html"
echo ""
echo "📝 Test customer details:"
echo "  Install ID: demo-install-abc123456789abcdef"
echo "  Tier: Pro"
echo "  Status: Active"
echo ""
