#!/bin/bash
#
# Apply llama2 → Custom Model Fixes
#
# This script applies the fixes identified by debug-llama2-references.js
# and stores the process as a "lesson" with time differential tracking.
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}=====================================================================${NC}"
echo -e "${CYAN}  Apply llama2 → Custom Model Fixes${NC}"
echo -e "${CYAN}=====================================================================${NC}"
echo ""

START_TIME=$(date +%s%3N)

# Get the latest debug results
LATEST_DEBUG=$(ls -t logs/debug-llama2-*.json | head -1)

if [ -z "$LATEST_DEBUG" ]; then
  echo -e "${RED}❌ No debug results found. Run debug-llama2-references.js first!${NC}"
  exit 1
fi

echo -e "${CYAN}📁 Using debug results from:${NC}"
echo -e "   $LATEST_DEBUG"
echo ""

# Extract replacement model
REPLACEMENT=$(cat "$LATEST_DEBUG" | jq -r '.fixes[0].replacement')
FILES=$(cat "$LATEST_DEBUG" | jq -r '.fixes[0].files[]')

echo -e "${CYAN}🔄 Replacement: llama2 → $REPLACEMENT${NC}"
echo ""

# Count files
FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo -e "${CYAN}📝 Fixing $FILE_COUNT files...${NC}"
echo ""

# Apply fixes with progress
FIXED=0
for file in $FILES; do
  FIXED=$((FIXED + 1))
  echo -e "${YELLOW}[$FIXED/$FILE_COUNT]${NC} Fixing $file..."

  # Check if file exists
  if [ ! -f "$file" ]; then
    echo -e "   ${RED}❌ File not found, skipping${NC}"
    continue
  fi

  # Count occurrences before
  BEFORE=$(grep -o "llama2" "$file" | wc -l | tr -d ' ')

  # Apply fix
  sed -i '' "s/llama2/$REPLACEMENT/g" "$file"

  # Count occurrences after
  AFTER=$(grep -o "llama2" "$file" 2>/dev/null | wc -l | tr -d ' ') || AFTER=0

  # Report
  CHANGED=$((BEFORE - AFTER))
  if [ $CHANGED -gt 0 ]; then
    echo -e "   ${GREEN}✅ Fixed $CHANGED references${NC}"
  else
    echo -e "   ${CYAN}ℹ️  No changes needed${NC}"
  fi
done

# Calculate time differential
END_TIME=$(date +%s%3N)
TOTAL_TIME=$((END_TIME - START_TIME))
XP_EARNED=$((TOTAL_TIME / 100))

echo ""
echo -e "${CYAN}=====================================================================${NC}"
echo -e "${GREEN}✨ All fixes applied!${NC}"
echo -e "${CYAN}=====================================================================${NC}"
echo ""
echo -e "${CYAN}⏱️  Time differential: ${TOTAL_TIME}ms${NC}"
echo -e "${CYAN}🎮 XP earned: $XP_EARNED${NC}"
echo ""

# Save fix results
FIX_RESULTS="logs/fix-llama2-$(date +%s).json"
cat <<EOF > "$FIX_RESULTS"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "operation": "fix_llama2_references",
  "replacement": "$REPLACEMENT",
  "files_fixed": $FILE_COUNT,
  "time_spent_ms": $TOTAL_TIME,
  "xp_earned": $XP_EARNED,
  "lesson": {
    "title": "Debug and Fix Model References",
    "learning_objectives": [
      "Use diagnostic tools to find issues",
      "Apply systematic fixes",
      "Track time differentials",
      "Store lessons in learning system"
    ],
    "skills_learned": [
      "debugging",
      "shell-scripting",
      "sed-commands",
      "time-differential-tracking"
    ]
  }
}
EOF

echo -e "${CYAN}📝 Fix results saved to:${NC}"
echo -e "   $FIX_RESULTS"
echo ""

# Verify fixes
echo -e "${CYAN}🔍 Verifying fixes...${NC}"
REMAINING=$(grep -r "llama2" lib/ routes/ --include="*.js" 2>/dev/null | wc -l | tr -d ' ') || REMAINING=0

if [ "$REMAINING" -eq 0 ]; then
  echo -e "${GREEN}   ✅ All llama2 references fixed!${NC}"
else
  echo -e "${YELLOW}   ⚠️  $REMAINING references remaining (check comments/strings)${NC}"
fi

echo ""
echo -e "${GREEN}🎓 Lesson complete! Added to learning system.${NC}"
echo ""
