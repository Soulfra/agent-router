#!/bin/bash
# Foreign Key / Primary Key Audit Script
# Scans all migrations for FK/PK mismatches
#
# Issues to find:
# 1. REFERENCES users(id) - BROKEN (column doesn't exist, should be users(user_id))
# 2. INTEGER ... REFERENCES users(user_id) - TYPE MISMATCH (should be UUID)
# 3. Missing table references (lessons, etc.)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

MIGRATIONS_DIR="database/migrations"
OUTPUT_FILE="FK_AUDIT_REPORT.md"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🔍 Foreign Key / Primary Key Audit"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Create report header
cat > "$OUTPUT_FILE" <<EOF
# Foreign Key / Primary Key Audit Report
Generated: $(date)

## Executive Summary

**Critical Issues Found:**

EOF

echo -e "${BLUE}📊 Analyzing foreign key constraints...${NC}"

# Issue 1: References to users(id) - BROKEN
echo -e "${RED}🔴 Issue 1: REFERENCES users(id) - Column doesn't exist${NC}"
echo ""  >> "$OUTPUT_FILE"
echo "## Issue 1: REFERENCES users(id) - BROKEN" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Problem:** Foreign keys reference \`users(id)\` but the column doesn't exist." >> "$OUTPUT_FILE"
echo "**users table PRIMARY KEY:** \`user_id UUID\`" >> "$OUTPUT_FILE"
echo "**Fix:** Change \`users(id)\` → \`users(user_id)\`" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

USERS_ID_COUNT=$(grep -r "REFERENCES users(id)" "$MIGRATIONS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "   Found: $USERS_ID_COUNT occurrences"
echo "**Count:** $USERS_ID_COUNT occurrences" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ "$USERS_ID_COUNT" -gt 0 ]; then
  echo "### Files with REFERENCES users(id):" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  grep -rn "REFERENCES users(id)" "$MIGRATIONS_DIR" 2>/dev/null | while IFS=: read -r file line content; do
    echo "$file:$line" >> "$OUTPUT_FILE"
    echo "   $file:$line"
  done
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
fi

# Issue 2: INTEGER type with users(user_id) - TYPE MISMATCH
echo ""
echo -e "${YELLOW}⚠️  Issue 2: INTEGER ... REFERENCES users(user_id) - Type Mismatch${NC}"
echo ""  >> "$OUTPUT_FILE"
echo "## Issue 2: INTEGER type for users(user_id) FK - TYPE MISMATCH" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Problem:** Foreign keys use \`INTEGER\` type but \`users.user_id\` is \`UUID\`." >> "$OUTPUT_FILE"
echo "**Fix:** Change \`INTEGER\` → \`UUID\`" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

INTEGER_USERS_COUNT=$(grep -rE "INTEGER.*REFERENCES users\(user_id\)" "$MIGRATIONS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "   Found: $INTEGER_USERS_COUNT occurrences"
echo "**Count:** $INTEGER_USERS_COUNT occurrences" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ "$INTEGER_USERS_COUNT" -gt 0 ]; then
  echo "### Files with INTEGER type mismatch:" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  grep -rnE "INTEGER.*REFERENCES users\(user_id\)" "$MIGRATIONS_DIR" 2>/dev/null | while IFS=: read -r file line content; do
    echo "$file:$line" >> "$OUTPUT_FILE"
    echo "   $file:$line"
  done
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
fi

# Issue 3: Correct UUID references (for comparison)
echo ""
echo -e "${GREEN}✅ Correct: UUID ... REFERENCES users(user_id)${NC}"
echo ""  >> "$OUTPUT_FILE"
echo "## Correct References (for comparison)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

UUID_USERS_COUNT=$(grep -rE "UUID.*REFERENCES users\(user_id\)" "$MIGRATIONS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "   Found: $UUID_USERS_COUNT correct references"
echo "**Correct UUID references:** $UUID_USERS_COUNT" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Total broken FK count
TOTAL_BROKEN=$((USERS_ID_COUNT + INTEGER_USERS_COUNT))
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${RED}🚨 Total Broken Foreign Keys: $TOTAL_BROKEN${NC}"
echo -e "${GREEN}✅ Correct Foreign Keys: $UUID_USERS_COUNT${NC}"
echo "═══════════════════════════════════════════════════════════"

# Update executive summary
sed -i '' "3a\\
- **Total Broken FKs:** $TOTAL_BROKEN\\
- **REFERENCES users(id):** $USERS_ID_COUNT (column doesn't exist)\\
- **INTEGER type mismatch:** $INTEGER_USERS_COUNT (should be UUID)\\
- **Correct UUID FKs:** $UUID_USERS_COUNT\\
" "$OUTPUT_FILE"

# Recommendations
cat >> "$OUTPUT_FILE" <<EOF

## Recommended Fix Strategy

### Option A: Single Master Migration (Safest)

Create \`database/migrations/200_fix_all_fk_constraints.sql\`:

\`\`\`sql
-- Fix all users(id) → users(user_id)
-- Fix all INTEGER → UUID for users FKs
-- Drop broken constraints
-- Add correct constraints
\`\`\`

### Option B: Edit Migrations Directly (Clean but risky)

Only if database hasn't been deployed to production:
1. Edit each migration file
2. Change \`users(id)\` → \`users(user_id)\`
3. Change \`INTEGER\` → \`UUID\` for all users FKs
4. Drop database and re-run migrations

### Option C: Application-Level Gateway (Temporary workaround)

Create ID mapping layer in code:
- API uses simple \`id\` integers
- Gateway maps to \`user_id UUID\`
- Similar to XML/JSON mapping pattern

## Standards Going Forward

**RULE:** All foreign keys to \`users\` table MUST use:
\`\`\`sql
user_id UUID REFERENCES users(user_id) ON DELETE CASCADE
\`\`\`

**NOT:**
- ❌ \`user_id INTEGER REFERENCES users(id)\`
- ❌ \`user_id INTEGER REFERENCES users(user_id)\`
- ❌ \`id INTEGER REFERENCES users(user_id)\`

## Next Steps

1. Review this report: \`$OUTPUT_FILE\`
2. Choose fix strategy (A, B, or C)
3. Create migration/gateway as needed
4. Test on dev database first
5. Document standard in \`docs/DATABASE_STANDARDS.md\`

EOF

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Report generated: $OUTPUT_FILE${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Show quick summary
echo -e "${BLUE}📊 Quick Summary:${NC}"
echo "   Broken FKs: $TOTAL_BROKEN across $(grep -rl "REFERENCES users" "$MIGRATIONS_DIR" 2>/dev/null | wc -l | tr -d ' ') files"
echo "   Correct FKs: $UUID_USERS_COUNT"
echo "   Success Rate: $(echo "scale=1; $UUID_USERS_COUNT * 100 / ($UUID_USERS_COUNT + $TOTAL_BROKEN)" | bc)%"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "   1. Review $OUTPUT_FILE"
echo "   2. Choose fix strategy (master migration recommended)"
echo "   3. Test on dev database"
echo "   4. Document FK standards"
echo ""
