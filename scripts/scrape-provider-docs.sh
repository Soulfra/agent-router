#!/bin/bash
#
# Provider Documentation Scraper
# Keeps model wrappers updated with latest provider APIs
#
# Usage:
#   ./scripts/scrape-provider-docs.sh [provider]
#   ./scripts/scrape-provider-docs.sh anthropic
#   ./scripts/scrape-provider-docs.sh all
#

set -e

PROVIDER=${1:-all}
DOCS_DIR="./docs/provider-scraped"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $DOCS_DIR

echo "📚 Provider Documentation Scraper"
echo ""

scrape_anthropic() {
  echo "🤖 Scraping Anthropic Claude API docs..."
  curl -s https://docs.anthropic.com/en/api/getting-started > $DOCS_DIR/anthropic_${TIMESTAMP}.html
  curl -s https://docs.anthropic.com/en/api/messages > $DOCS_DIR/anthropic_messages_${TIMESTAMP}.html
  curl -s https://docs.anthropic.com/en/api/rate-limits > $DOCS_DIR/anthropic_limits_${TIMESTAMP}.html
  echo "  ✓ Anthropic docs saved"
}

scrape_openai() {
  echo "🤖 Scraping OpenAI API docs..."
  curl -s https://platform.openai.com/docs/api-reference/chat > $DOCS_DIR/openai_chat_${TIMESTAMP}.html
  curl -s https://platform.openai.com/docs/guides/rate-limits > $DOCS_DIR/openai_limits_${TIMESTAMP}.html
  curl -s https://platform.openai.com/docs/models > $DOCS_DIR/openai_models_${TIMESTAMP}.html
  echo "  ✓ OpenAI docs saved"
}

scrape_deepseek() {
  echo "🤖 Scraping DeepSeek API docs..."
  curl -s https://platform.deepseek.com/api-docs/quick_start > $DOCS_DIR/deepseek_quickstart_${TIMESTAMP}.html
  curl -s https://platform.deepseek.com/api-docs/api/chat > $DOCS_DIR/deepseek_chat_${TIMESTAMP}.html
  echo "  ✓ DeepSeek docs saved"
}

scrape_ollama() {
  echo "🤖 Scraping Ollama API docs..."
  curl -s https://github.com/ollama/ollama/blob/main/docs/api.md > $DOCS_DIR/ollama_api_${TIMESTAMP}.md
  curl -s https://ollama.com/library > $DOCS_DIR/ollama_models_${TIMESTAMP}.html
  echo "  ✓ Ollama docs saved"
}

# Extract schema changes
extract_schemas() {
  echo ""
  echo "🔍 Extracting API schemas..."

  node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

const docsDir = './docs/provider-scraped';
const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.html') || f.endsWith('.md'));

const schemas = {
  anthropic: { models: [], limits: {}, endpoints: [] },
  openai: { models: [], limits: {}, endpoints: [] },
  deepseek: { models: [], limits: {}, endpoints: [] },
  ollama: { models: [], limits: {}, endpoints: [] }
};

// Simple regex extraction (replace with proper HTML parsing if needed)
files.forEach(file => {
  const content = fs.readFileSync(path.join(docsDir, file), 'utf8');

  if (file.includes('anthropic')) {
    // Extract Claude model names
    const models = content.match(/claude-[a-z0-9\-]+/gi) || [];
    schemas.anthropic.models = [...new Set(models)];
  }

  if (file.includes('openai')) {
    // Extract GPT model names
    const models = content.match(/gpt-[a-z0-9\-\.]+/gi) || [];
    schemas.openai.models = [...new Set(models)];
  }

  if (file.includes('deepseek')) {
    // Extract DeepSeek model names
    const models = content.match(/deepseek-[a-z0-9\-]+/gi) || [];
    schemas.deepseek.models = [...new Set(models)];
  }
});

fs.writeFileSync(
  './docs/provider-schemas.json',
  JSON.stringify(schemas, null, 2)
);

console.log('  ✓ Schemas extracted to docs/provider-schemas.json');
NODE_EOF
}

# Execute scraping
if [ "$PROVIDER" = "all" ]; then
  scrape_anthropic
  scrape_openai
  scrape_deepseek
  scrape_ollama
  extract_schemas
elif [ "$PROVIDER" = "anthropic" ]; then
  scrape_anthropic
  extract_schemas
elif [ "$PROVIDER" = "openai" ]; then
  scrape_openai
  extract_schemas
elif [ "$PROVIDER" = "deepseek" ]; then
  scrape_deepseek
  extract_schemas
elif [ "$PROVIDER" = "ollama" ]; then
  scrape_ollama
  extract_schemas
else
  echo "❌ Unknown provider: $PROVIDER"
  echo "Available: anthropic, openai, deepseek, ollama, all"
  exit 1
fi

echo ""
echo "✅ Documentation scraping complete!"
echo ""
echo "📂 Scraped docs: $DOCS_DIR"
echo "📋 Schema summary: docs/provider-schemas.json"
echo ""
echo "🔄 Next Steps:"
echo "   1. Review changes: cat docs/provider-schemas.json"
echo "   2. Update adapters: lib/provider-adapters/*.js"
echo "   3. Test: npm run test:providers"
echo ""
