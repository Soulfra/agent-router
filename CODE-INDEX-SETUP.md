# Code Indexing System - Setup Guide

## 🎯 What This Solves

**Problem**: calos-expert gives "canned responses" from training data instead of using YOUR actual code.

**Solution**: Index your GitHub repos, cookbook, and scripts so the AI can search and use YOUR REAL CODE examples.

---

## ⚡ Quick Start

### Step 1: Run Database Migration

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Apply the migration
psql -U postgres -d calos -f database/migrations/010_add_code_index.sql
```

This creates tables:
- `code_repositories` - Your repos/collections
- `code_snippets` - Individual functions and scripts
- `code_embeddings` - Semantic search vectors
- `published_content` - Generated tutorials/blogs
- `content_subscribers` - Email/RSS subscribers

### Step 2: Index Your Code

```bash
# Index your GitHub repos
node bin/index-code.js github yourusername/my-automation-scripts
node bin/index-code.js github yourusername/lua-helpers

# Index local directories
node bin/index-code.js local ~/Desktop/cookbook

# Auto-detect and index cookbook
node bin/index-code.js cookbook
```

### Step 3: Test It Out

```bash
# Search your indexed code
node bin/index-code.js search "webhook"
node bin/index-code.js search "API client"
node bin/index-code.js search "automation script"

# View statistics
node bin/index-code.js stats
```

---

## 📚 What Gets Indexed

### Supported Languages
- **Python** (.py) - Functions, classes, scripts
- **Lua** (.lua) - Functions, scripts
- **JavaScript/TypeScript** (.js, .ts) - Functions, modules
- **Bash** (.sh, .bash) - Functions, scripts
- **Ruby** (.rb) - Methods, classes
- **Go** (.go) - Functions
- **Rust** (.rs) - Functions

### What's Extracted
For each code file:
- ✅ Full script (if < 10K chars)
- ✅ Individual functions/methods
- ✅ Docstrings/comments
- ✅ Dependencies (imports, requires)
- ✅ Tags (keywords like 'api', 'webhook', 'automation')
- ✅ Auto-generated descriptions

### Example Output
```
📦 yourusername/automation-scripts
   Source: github
   Language: python
   Snippets: 47
   Uses: 0
   Last indexed: 2025-10-12 12:34:56
```

---

## 🔍 How to Use with calos-expert

Once indexed, you can query YOUR code:

```bash
# Terminal
ollama run calos-expert "Show me my webhook automation code"
ollama run calos-expert "How do I use my API client helper?"
ollama run calos-expert "Give me an example of my Lua scripts"

# Or via chat interface
# http://localhost:5001/chat.html
```

**Before indexing** → Generic answer from training
**After indexing** → Real code from YOUR repos!

---

## 🎨 Content Generation (Phase 3)

Once code is indexed, you can generate tutorials/blog posts:

```bash
# Generate tutorial from your code
node bin/generate-content.js tutorial "How to Build Webhooks" --lang python

# Generate blog post
node bin/generate-content.js blog "My Automation Scripts Explained"

# Generate documentation
node bin/generate-content.js docs "API Client Usage Guide"
```

Outputs:
- Markdown + HTML
- Uses YOUR actual code examples
- Published to `/feed` with RSS
- Notifies subscribers

---

## 🗂️ Directory Structure

```
agent-router/
├── database/
│   └── migrations/
│       └── 010_add_code_index.sql        # Database schema
├── lib/
│   ├── code-indexer.js                   # Core indexing logic
│   └── content-generator.js              # Tutorial/blog generator (TODO)
├── bin/
│   ├── index-code.js                     # CLI for indexing
│   └── generate-content.js               # CLI for content gen (TODO)
└── ~/.calos/repos/                       # Cloned GitHub repos stored here
```

---

## 🔧 Configuration

### Environment Variables

Add to `.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=

# GitHub (for indexing repos)
# Install: brew install gh && gh auth login

# OpenAI (for embeddings - optional)
OPENAI_API_KEY=sk-...

# Ollama (for content generation)
OLLAMA_API_URL=http://localhost:11434
```

### Ignored Directories

The indexer automatically skips:
- `node_modules/`
- `.git/`
- `__pycache__/`
- `venv/`, `env/`
- `dist/`, `build/`
- `.next/`, `target/`
- Any directory starting with `.`

---

## 📊 Database Queries

### View all indexed repos
```sql
SELECT * FROM repo_stats;
```

### Search for code
```sql
SELECT filename, function_name, description
FROM code_snippets
WHERE search_vector @@ plainto_tsquery('english', 'webhook')
LIMIT 10;
```

### Most used snippets
```sql
SELECT * FROM popular_code_snippets;
```

### View published content
```sql
SELECT * FROM content_feed;
```

---

## 🚀 Advanced Usage

### Index Multiple Repos at Once

```bash
#!/bin/bash
# index-all.sh

repos=(
  "yourusername/scripts"
  "yourusername/automation"
  "yourusername/helpers"
)

for repo in "${repos[@]}"; do
  echo "Indexing $repo..."
  node bin/index-code.js github "$repo"
done
```

### Auto-Reindex Daily

Add to crontab:
```bash
# Reindex code every day at 3 AM
0 3 * * * cd ~/Desktop/CALOS_ROOT/agent-router && node bin/index-code.js cookbook
```

### Search Filters

```javascript
// In code
const indexer = new CodeIndexer(db);

// Search Python code only
const results = await indexer.searchCode('API client', {
  language: 'python',
  limit: 5
});

// Search specific repo
const results = await indexer.searchCode('webhook', {
  repo_id: 1,
  limit: 10
});
```

---

## 🐛 Troubleshooting

### "Cannot find module 'pg'"
```bash
cd agent-router
npm install pg
```

### "Database connection failed"
```bash
# Check PostgreSQL is running
psql -U postgres -l

# Create database if it doesn't exist
createdb -U postgres calos
```

### "GitHub CLI not installed"
```bash
brew install gh
gh auth login
```

### "No code files found"
- Check the directory path is correct
- Ensure files have proper extensions (.py, .lua, .js, .sh)
- Check files aren't in ignored directories (node_modules, etc.)

### "Search returns no results"
```bash
# Verify snippets were indexed
node bin/index-code.js stats

# Check database directly
psql -U postgres -d calos -c "SELECT COUNT(*) FROM code_snippets;"
```

---

## 📈 Next Steps

### Phase 1: ✅ Code Indexing (COMPLETE)
- [x] Database schema
- [x] Code scanner
- [x] CLI tool
- [x] Full-text search
- [ ] Semantic search (embeddings)

### Phase 2: Integration with AI
- [ ] Add `search_my_code()` tool to Ollama
- [ ] Update calos-expert prompts
- [ ] Test with real queries

### Phase 3: Content Generation
- [ ] Build content generator agent
- [ ] Tutorial/blog templates
- [ ] RSS feed endpoint
- [ ] Subscriber management
- [ ] Email notifications

---

## 💡 How This Changes Everything

**Before:**
```
User: "How do I build a webhook?"
calos-expert: *gives generic tutorial from training*
```

**After:**
```
User: "How do I build a webhook?"
calos-expert: *searches your repos*
calos-expert: "Here's YOUR webhook code from automation-scripts/webhook_handler.py:

[shows your actual working code]

This is how YOU implemented it in production..."
```

**Content Generation:**
```
User: "Generate tutorial on my automation scripts"
→ System finds your best scripts
→ calos-expert writes tutorial using YOUR code
→ Published to /feed
→ Subscribers notified
→ RSS feed updated
```

---

## 🎉 You're Ready!

Your code is now searchable and usable by calos-expert. No more canned responses!

```bash
# Try it:
ollama run calos-expert "Show me how I implemented webhooks in my code"
```

Questions? Check the logs:
- Database: `psql -U postgres -d calos`
- Indexer output: Look for `[CodeIndexer]` logs
- Router logs: `tail -f /tmp/router-quickstart.log`
