#!/bin/bash
# Export database schema and data for Railway deployment

echo "📦 Exporting CalOS database for Railway deployment..."

DB_USER="matthewmauer"
DB_NAME="calos"
OUTPUT_DIR="/Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/railway-db-export"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Export full schema (structure only)
echo "1️⃣  Exporting database schema..."
pg_dump -U "$DB_USER" -d "$DB_NAME" -s > "$OUTPUT_DIR/schema.sql"
echo "✓ Schema exported to: $OUTPUT_DIR/schema.sql"

# Export learning system data
echo "2️⃣  Exporting learning paths and lessons..."
pg_dump -U "$DB_USER" -d "$DB_NAME" \
  -t learning_paths \
  -t learning_lessons \
  -t learning_progress \
  --data-only \
  --column-inserts > "$OUTPUT_DIR/learning_data.sql"
echo "✓ Learning data exported to: $OUTPUT_DIR/learning_data.sql"

# Export essential tables (if they exist)
echo "3️⃣  Exporting other essential data..."
pg_dump -U "$DB_USER" -d "$DB_NAME" \
  -t users \
  -t sessions \
  -t projects \
  -t domains \
  --data-only \
  --column-inserts > "$OUTPUT_DIR/essential_data.sql" 2>/dev/null || echo "⚠️  Some essential tables don't exist (OK for fresh deploy)"

# Create combined import script
echo "4️⃣  Creating combined import script..."
cat > "$OUTPUT_DIR/import-to-railway.sh" <<'EOF'
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
EOF

chmod +x "$OUTPUT_DIR/import-to-railway.sh"

# Show summary
echo ""
echo "✅ Export complete!"
echo ""
echo "📂 Files created:"
echo "   - schema.sql (database structure)"
echo "   - learning_data.sql (learning paths + lessons)"
echo "   - essential_data.sql (users, sessions, etc)"
echo "   - import-to-railway.sh (run this on Railway)"
echo ""
echo "📍 Location: $OUTPUT_DIR"
echo ""
echo "🚀 Next steps:"
echo "1. Deploy to Railway: railway up"
echo "2. Copy SQL files to Railway:"
echo "   railway run bash < railway-db-export/import-to-railway.sh"
echo ""
echo "Or manually:"
echo "   railway run psql \$DATABASE_URL < railway-db-export/schema.sql"
echo "   railway run psql \$DATABASE_URL < railway-db-export/learning_data.sql"
