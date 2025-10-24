#!/bin/bash
# Import database to Railway
# Usage: railway run ./import-to-railway.sh

echo "📥 Importing CalOS database to Railway..."

# Import schema first
echo "1️⃣  Creating database schema..."
psql $DATABASE_URL < schema.sql

# Import learning data
echo "2️⃣  Importing learning paths and lessons..."
psql $DATABASE_URL < learning_data.sql

# Import other data (ignore errors if tables don't exist)
echo "3️⃣  Importing other essential data..."
psql $DATABASE_URL < essential_data.sql 2>/dev/null || echo "⚠️  Some essential tables skipped"

echo "✅ Database import complete!"
