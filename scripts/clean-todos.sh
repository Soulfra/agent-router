#!/bin/bash
# TODO Cleanup Script for CalOS Agent Router
# Analyzes and categorizes all TODO/FIXME comments

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📋 TODO/FIXME Analysis"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Output file
OUTPUT_FILE="TODO_REPORT.md"

# Create report header
cat > "$OUTPUT_FILE" <<EOF
# TODO/FIXME Report
Generated: $(date)

## Summary

EOF

# Count todos by type
echo -e "${BLUE}📊 Analyzing TODO comments...${NC}"
TODO_COUNT=$(grep -ri "TODO\|FIXME\|@todo" --include="*.js" --include="*.html" --include="*.md" . 2>/dev/null | wc -l | tr -d ' ')
echo "   Total TODO/FIXME comments: $TODO_COUNT"

# Count by file type
JS_COUNT=$(grep -ri "TODO\|FIXME\|@todo" --include="*.js" . 2>/dev/null | wc -l | tr -d ' ')
HTML_COUNT=$(grep -ri "TODO\|FIXME\|@todo" --include="*.html" . 2>/dev/null | wc -l | tr -d ' ')
MD_COUNT=$(grep -ri "TODO\|FIXME\|@todo" --include="*.md" . 2>/dev/null | wc -l | tr -d ' ')

echo "   JavaScript files: $JS_COUNT"
echo "   HTML files: $HTML_COUNT"
echo "   Markdown files: $MD_COUNT"
echo ""

# Add summary to report
cat >> "$OUTPUT_FILE" <<EOF
- **Total TODO/FIXME comments:** $TODO_COUNT
- **JavaScript files:** $JS_COUNT
- **HTML files:** $HTML_COUNT
- **Markdown files:** $MD_COUNT

## Top Files with Most TODOs

EOF

# Find files with most TODOs
echo -e "${BLUE}📁 Top 20 files with most TODOs:${NC}"
grep -ric "TODO\|FIXME\|@todo" --include="*.js" --include="*.html" --include="*.md" . 2>/dev/null \
  | sort -t: -k2 -rn \
  | head -20 \
  | while IFS=: read -r file count; do
    if [ "$count" -gt 0 ]; then
      echo "   $count - $file"
      echo "- \`$file\`: **$count** TODOs" >> "$OUTPUT_FILE"
    fi
  done
echo ""

# Add categories section
cat >> "$OUTPUT_FILE" <<EOF

## TODOs by Category

### Critical (FIXME)

EOF

# Find critical FIXMEs
echo -e "${RED}🔴 Critical FIXMEs:${NC}"
grep -rn "FIXME" --include="*.js" --include="*.html" . 2>/dev/null | head -10 | while IFS=: read -r file line content; do
  echo "   $file:$line"
  echo "- \`$file:$line\` - ${content#*FIXME}" >> "$OUTPUT_FILE"
done
echo ""

# Add TODO categories
cat >> "$OUTPUT_FILE" <<EOF

### General TODOs

EOF

# Find TODOs by area
echo -e "${YELLOW}💡 TODO Categories:${NC}"

# AI/Model TODOs
AI_TODOS=$(grep -ric "TODO.*\(model\|ollama\|ai\|llm\)" --include="*.js" . 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo "   AI/Model related: $AI_TODOS"
echo "- **AI/Model related:** $AI_TODOS" >> "$OUTPUT_FILE"

# Auth TODOs
AUTH_TODOS=$(grep -ric "TODO.*\(auth\|oauth\|login\|jwt\)" --include="*.js" . 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo "   Auth related: $AUTH_TODOS"
echo "- **Auth related:** $AUTH_TODOS" >> "$OUTPUT_FILE"

# Database TODOs
DB_TODOS=$(grep -ric "TODO.*\(database\|postgres\|sql\)" --include="*.js" . 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo "   Database related: $DB_TODOS"
echo "- **Database related:** $DB_TODOS" >> "$OUTPUT_FILE"

# Email TODOs
EMAIL_TODOS=$(grep -ric "TODO.*\(email\|gmail\|smtp\)" --include="*.js" . 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo "   Email related: $EMAIL_TODOS"
echo "- **Email related:** $EMAIL_TODOS" >> "$OUTPUT_FILE"

echo ""

# Sample TODOs from each major area
cat >> "$OUTPUT_FILE" <<EOF

## Sample TODOs

### From lib/ (Backend Logic)

EOF

echo -e "${BLUE}📦 Sample TODOs from lib/:${NC}"
grep -rn "TODO\|FIXME" --include="*.js" lib/ 2>/dev/null | head -5 | while IFS=: read -r file line content; do
  echo "   $file:$line"
  echo "\`$file:$line\`" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "${content}" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
done

cat >> "$OUTPUT_FILE" <<EOF

### From routes/ (API Endpoints)

EOF

echo -e "${BLUE}🛣️  Sample TODOs from routes/:${NC}"
grep -rn "TODO\|FIXME" --include="*.js" routes/ 2>/dev/null | head -5 | while IFS=: read -r file line content; do
  echo "   $file:$line"
  echo "\`$file:$line\`" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "${content}" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
done

cat >> "$OUTPUT_FILE" <<EOF

### From public/ (Frontend)

EOF

echo -e "${BLUE}🎨 Sample TODOs from public/:${NC}"
grep -rn "TODO\|FIXME" --include="*.html" --include="*.js" public/ 2>/dev/null | head -5 | while IFS=: read -r file line content; do
  echo "   $file:$line"
  echo "\`$file:$line\`" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "${content}" >> "$OUTPUT_FILE"
  echo "\`\`\`" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
done

# Recommendations
cat >> "$OUTPUT_FILE" <<EOF

## Recommendations

### Immediate Actions

1. **Review all FIXMEs** - These indicate broken or incomplete functionality
2. **Migrate to GitHub Issues** - Convert TODOs to tracked issues
3. **Prioritize by area:**
   - Critical: Auth, database, payment processing
   - High: AI/model integration, email system
   - Medium: UI/UX improvements
   - Low: Documentation, refactoring

### Cleanup Strategy

\`\`\`bash
# 1. Create GitHub issues for all FIXMEs
grep -rn "FIXME" --include="*.js" . | while read line; do
  # Use gh CLI to create issues
  echo "Issue: \$line"
done

# 2. Remove completed TODOs
# Review each TODO and remove if already implemented

# 3. Add issue numbers to remaining TODOs
# Example: // TODO(#123): Implement feature X
\`\`\`

### Best Practices Going Forward

- Use GitHub Issues instead of inline TODOs for features
- Only use TODO for small, immediate fixes
- Use FIXME for broken code that needs urgent attention
- Include issue numbers: \`// TODO(#456): Description\`
- Regular cleanup: Monthly TODO review

EOF

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Report generated: $OUTPUT_FILE${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Quick stats
echo -e "${BLUE}📊 Quick Stats:${NC}"
echo "   Total TODOs: $TODO_COUNT across 124 files"
echo "   Density: $(echo "scale=1; $TODO_COUNT / 124" | bc) TODOs per file (avg)"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "   1. Review $OUTPUT_FILE"
echo "   2. Create GitHub issues for FIXMEs"
echo "   3. Remove completed TODOs"
echo "   4. Add issue numbers to remaining TODOs"
echo ""
