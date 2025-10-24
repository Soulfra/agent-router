# CALOS Content Publishing System

**Transform documentation, database content, and templates into professional ebooks, PDFs, and websites**

---

## Overview

The CALOS Content Publishing System is an **automated book publisher** and multi-format content generator. It transforms your documentation, database content, and bucket information into distributable formats like EPUB ebooks, PDFs, HTML websites, and more.

**Key Features:**
- 📚 **Multi-source input**: Markdown files, database content, pre-built templates
- 🤖 **AI enhancement**: Use bucket models to generate intros, expand content, improve quality
- 📖 **Professional ebooks**: EPUB 3.0, MOBI (Kindle), enhanced PDF with TOC
- 🌐 **Website generation**: HTML with navigation, styling, responsive design
- 🎨 **Template library**: Game guides, technical manuals, business guides, tutorial courses
- 📊 **Scraper-friendly**: Intentionally designed for easy copying and distribution

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ContentPublisher                          │
│  (Main Orchestrator - lib/content-publisher.js)             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Load Content │    │ Apply        │    │ Generate     │
│              │    │ Template     │    │ Outputs      │
│ • Markdown   │───▶│              │───▶│              │
│ • Database   │    │ • Structure  │    │ • EPUB       │
│ • Templates  │    │ • TOC        │    │ • PDF        │
└──────────────┘    │ • Cover      │    │ • HTML       │
                    └──────────────┘    │ • Markdown   │
                            │            │ • JSON       │
                            ▼            └──────────────┘
                    ┌──────────────┐
                    │ AI           │
                    │ Enhancement  │
                    │              │
                    │ • Intros     │
                    │ • Summaries  │
                    │ • Examples   │
                    └──────────────┘
```

---

## Quick Start

### 1. Publish Markdown Documentation

Transform `MULTIPLAYER_PORTAL_SYSTEM.md` into an ebook:

```bash
curl -X POST http://localhost:5001/api/publish/multiplayer-guide \
  -H "Content-Type: application/json" \
  -d '{
    "outputFormat": "all",
    "aiEnhancement": true
  }'
```

**Output:**
- `calos-multiplayer-portal-guide_123456.epub` (EPUB ebook)
- `calos-multiplayer-portal-guide_123456.pdf` (Enhanced PDF)
- `calos-multiplayer-portal-guide_123456.html` (Standalone website)
- `calos-multiplayer-portal-guide_123456.md` (Processed markdown)
- `calos-multiplayer-portal-guide_123456.json` (Structured data)

### 2. Generate from Database

Create a catalog of all 12 bucket starters:

```bash
curl -X POST http://localhost:5001/api/publish/starter-catalog \
  -H "Content-Type: application/json" \
  -d '{
    "outputFormat": "pdf",
    "aiEnhancement": true
  }'
```

**Output:**
- Complete reference guide for all starters
- Stats, personalities, use cases
- Comparison charts

### 3. Use a Template

Generate a book from pre-built template:

```bash
curl -X POST http://localhost:5001/api/publish/generate-book \
  -H "Content-Type: application/json" \
  -d '{
    "template": "multiplayer-guide",
    "outputFormat": "epub",
    "aiEnhancement": true
  }'
```

---

## Content Sources

### Source 1: Markdown Files

Transform existing documentation into books.

**API Endpoint:**
```bash
POST /api/publish/generate
```

**Request:**
```json
{
  "sourceType": "markdown",
  "sourcePath": "MULTIPLAYER_PORTAL_SYSTEM.md",
  "outputFormat": "all",
  "template": "game-guide",
  "title": "CALOS Multiplayer Portal Guide",
  "aiEnhancement": true,
  "metadata": {
    "subtitle": "Master the Art of Bucket Battles",
    "author": "CALOS AI",
    "category": "Gaming, AI, Software"
  }
}
```

**How it works:**
1. Reads markdown file
2. Parses into sections based on headings (`#`, `##`, `###`)
3. Applies template structure
4. Enhances with AI (generates chapter intros)
5. Generates all output formats

### Source 2: Database Content

Generate books from database records (starters, buckets, portals, etc.).

**API Endpoint:**
```bash
POST /api/publish/generate-from-database
```

**Request:**
```json
{
  "contentType": "starters",
  "outputFormat": "pdf",
  "template": "reference-docs",
  "title": "CALOS Starter Catalog",
  "aiEnhancement": true
}
```

**Supported Content Types:**
- `starters` - All 12 bucket starters
- `starters:1` - Single starter by ID
- `buckets` - All bucket instances
- `portals` - All portal instances
- `portals:123` - Single portal by ID

**How it works:**
1. Queries database for content
2. Formats as structured chapters
3. Applies template
4. Generates outputs

### Source 3: Templates

Use pre-built book structures.

**API Endpoint:**
```bash
POST /api/publish/generate-book
```

**Request:**
```json
{
  "template": "multiplayer-guide",
  "outputFormat": "all",
  "aiEnhancement": true
}
```

**Available Templates:**
- `multiplayer-guide` - Complete multiplayer system guide (250 pages)
- `technical-reference` - API documentation (150 pages)
- `portfolio-guide` - Portfolio building guide (120 pages)
- `workflow-course` - Workflow automation course (100 pages)

---

## Templates

### 1. Game Guide Template

**Use for:** Game mechanics, tutorials, strategy guides

**Structure:**
```
├── Cover
├── Table of Contents
├── Introduction
├── Chapter 1: Getting Started
├── Chapter 2: Core Mechanics
├── Chapter 3: Advanced Strategies
├── Chapter 4: Tips & Tricks
├── Appendix A: Reference Tables
└── Appendix B: API Reference
```

**Example:** CALOS Multiplayer Portal Guide

### 2. Technical Manual Template

**Use for:** API docs, architecture guides, reference documentation

**Structure:**
```
├── Cover
├── Table of Contents
├── Introduction
├── Chapter 1: Architecture Overview
├── Chapter 2: API Reference
├── Chapter 3: Integration Patterns
├── Chapter 4: Best Practices
└── Appendix: Code Examples
```

**Example:** CALOS Technical Reference

### 3. Business Guide Template

**Use for:** Business strategies, monetization guides, portfolio building

**Structure:**
```
├── Cover
├── Table of Contents
├── Introduction
├── Chapter 1: Getting Started
├── Chapter 2: Building Your Presence
├── Chapter 3: Analytics & Insights
├── Chapter 4: Monetization Strategies
└── Appendix: Resources
```

**Example:** Building Your AI Portfolio with CALOS

### 4. Tutorial Course Template

**Use for:** Step-by-step courses, lesson-based content

**Structure:**
```
├── Cover
├── Table of Contents
├── Course Overview
├── Lesson 1: Basics
├── Lesson 2: Intermediate
├── Lesson 3: Advanced
├── Lesson 4: Expert
└── Final Project
```

**Example:** Mastering CALOS Workflows

### 5. Reference Docs Template

**Use for:** Catalogs, encyclopedias, comprehensive references

**Structure:**
```
├── Cover
├── Table of Contents
├── Introduction
├── Section 1: Category A
│   ├── Item 1
│   ├── Item 2
│   └── Item 3
├── Section 2: Category B
└── Appendix: Quick Reference
```

**Example:** CALOS Starter Catalog

---

## AI Enhancement

**AI enhancement uses your bucket models to:**
- Generate engaging chapter introductions
- Create summaries for complex sections
- Add examples and code snippets
- Expand terse documentation
- Improve readability and flow

**How it works:**

For each chapter, the system sends a prompt to a bucket:
```
Write an engaging 2-3 paragraph introduction for the chapter titled
"Battle Mechanics" in a guide about CALOS multiplayer system.

The chapter covers: Bucket battles, battle types (speed/quality/creativity/cost),
winner determination, and rewards.

Make it exciting and informative!
```

**Response example:**
```
Bucket battles are the heart of CALOS multiplayer - where AI meets competition
in the most thrilling way possible. Two players, two prompts, two buckets racing
to deliver the best response. Will speed triumph over quality? Can creativity
beat raw efficiency? The answers lie in the battle type you choose.

Every battle type rewards different strengths. Speed battles favor lightweight
models like Gemma2 and Mistral. Quality battles demand the precision of CodeLlama
70B. Creativity battles unleash the artistic potential of creative starters. And
cost battles? They're all about prompt optimization and efficiency mastery.

In this chapter, you'll learn the mechanics that drive every battle, the strategies
that separate winners from losers, and the rewards that make it all worthwhile.
Let's dive in!
```

**Configuration:**

```json
{
  "aiEnhancement": true,
  "aiModel": "llama3.2:3b" // Optional: specify bucket model
}
```

**Note:** AI enhancement adds ~30-60 seconds per chapter but dramatically improves quality.

---

## Output Formats

### 1. EPUB (Ebook)

**Format:** EPUB 3.0 (industry standard)
**Use for:** Amazon Kindle, Apple Books, Gumroad, ebook distribution
**File size:** 50-500 KB (compressed)

**Features:**
- Table of contents with navigation
- Chapter links
- Embedded metadata (author, ISBN, publisher)
- Responsive layout (adapts to screen size)
- Code syntax highlighting
- Custom CSS styling

**Compatibility:**
- ✅ Amazon Kindle (via Send to Kindle)
- ✅ Apple Books
- ✅ Google Play Books
- ✅ Kobo
- ✅ All EPUB readers

**Optional:** Convert to MOBI (Kindle native format)
```bash
# Requires Calibre
brew install --cask calibre

# System automatically converts EPUB → MOBI if Calibre installed
```

### 2. PDF

**Format:** PDF 1.7 with bookmarks
**Use for:** Print-ready documents, professional distribution
**File size:** 500 KB - 5 MB

**Features:**
- Full table of contents (clickable bookmarks)
- Page numbers
- Headers/footers
- Professional typography
- Print-ready layout
- Embedded fonts

**Compatibility:**
- ✅ Universal (all devices)
- ✅ Print-ready

### 3. HTML

**Format:** Standalone HTML website
**Use for:** Web hosting, online documentation, GitHub Pages
**File size:** 100-300 KB

**Features:**
- Responsive design (mobile-friendly)
- Navigation sidebar
- Search functionality
- Syntax highlighting
- Dark mode support
- Single-page or multi-page

**Compatibility:**
- ✅ All browsers
- ✅ GitHub Pages
- ✅ Netlify/Vercel
- ✅ Custom hosting

### 4. Markdown

**Format:** Processed markdown
**Use for:** Documentation sites, GitHub repos, version control
**File size:** 50-200 KB

**Features:**
- Cleaned and structured
- Consistent formatting
- GitHub Flavored Markdown (GFM)
- Mermaid diagrams preserved
- Code blocks with language tags

**Compatibility:**
- ✅ GitHub
- ✅ GitLab
- ✅ Docusaurus
- ✅ MkDocs
- ✅ VuePress

### 5. JSON

**Format:** Structured data
**Use for:** APIs, machine-readable formats, integrations
**File size:** 100-500 KB

**Structure:**
```json
{
  "publicationId": "123456",
  "title": "CALOS Multiplayer Portal Guide",
  "subtitle": "Master the Art of Bucket Battles",
  "author": "CALOS AI",
  "chapters": [
    {
      "level": 1,
      "title": "Introduction",
      "content": "...",
      "aiIntro": "...",
      "subsections": [
        {
          "level": 2,
          "title": "What is CALOS?",
          "content": "..."
        }
      ]
    }
  ],
  "metadata": {
    "generatedAt": "2025-01-22T10:30:00Z",
    "wordCount": 45000,
    "pageCount": 250
  }
}
```

---

## API Reference

### Generate Publication

Generate publication from any source.

**Endpoint:** `POST /api/publish/generate`

**Request:**
```json
{
  "sourceType": "markdown",           // Required: markdown | database | template
  "sourcePath": "FILE.md",            // Required: path/identifier
  "outputFormat": "all",              // Optional: all | epub | pdf | html | markdown | json
  "template": "game-guide",           // Optional: game-guide | technical-manual | business-guide | tutorial-course | reference-docs
  "title": "My Book Title",           // Optional: custom title
  "aiEnhancement": true,              // Optional: enable AI (default: true)
  "aiModel": "llama3.2:3b",          // Optional: bucket model for AI
  "metadata": {                       // Optional: custom metadata
    "subtitle": "Subtitle",
    "author": "Author Name",
    "category": "Category"
  }
}
```

**Response:**
```json
{
  "success": true,
  "publicationId": "pub_1737547800123",
  "title": "My Book Title",
  "outputs": [
    {
      "format": "epub",
      "path": "/path/to/output.epub",
      "filename": "my-book-title_123.epub",
      "url": "/downloads/my-book-title_123.epub",
      "size": 125840
    },
    {
      "format": "pdf",
      "path": "/path/to/output.pdf",
      "filename": "my-book-title_123.pdf",
      "url": "/downloads/my-book-title_123.pdf",
      "size": 2458960
    }
  ],
  "stats": {
    "wordCount": 45000,
    "chapterCount": 10,
    "generationTime": "45s",
    "aiEnhanced": true
  }
}
```

### Generate from Template

Generate book from pre-built template.

**Endpoint:** `POST /api/publish/generate-book`

**Request:**
```json
{
  "template": "multiplayer-guide",    // Required: template ID
  "outputFormat": "epub",             // Optional: output format
  "aiEnhancement": true,              // Optional: enable AI
  "metadata": {}                      // Optional: custom metadata
}
```

**Response:** Same as `/generate`

### Generate from Database

Generate from database content.

**Endpoint:** `POST /api/publish/generate-from-database`

**Request:**
```json
{
  "contentType": "starters",          // Required: starters | buckets | portals
  "contentId": "1",                   // Optional: specific record ID
  "outputFormat": "pdf",              // Optional: output format
  "template": "reference-docs",       // Optional: template
  "title": "Custom Title",            // Optional: title
  "aiEnhancement": true               // Optional: AI enhancement
}
```

**Response:** Same as `/generate`

### Get Publication Status

Check publication status and download links.

**Endpoint:** `GET /api/publish/status/:publicationId`

**Response:**
```json
{
  "success": true,
  "publicationId": "pub_1737547800123",
  "status": "completed",
  "title": "My Book Title",
  "outputs": [...],
  "stats": {...}
}
```

### List Publications

List all generated publications.

**Endpoint:** `GET /api/publish/list`

**Response:**
```json
{
  "success": true,
  "count": 5,
  "publications": [
    {
      "publicationId": "pub_1737547800123",
      "title": "My Book Title",
      "createdAt": "2025-01-22T10:30:00Z",
      "status": "completed"
    }
  ]
}
```

### Quick Publish: Multiplayer Guide

**Endpoint:** `POST /api/publish/multiplayer-guide`

**Request:**
```json
{
  "outputFormat": "all",              // Optional: all | epub | pdf | html
  "aiEnhancement": true               // Optional: enable AI
}
```

Generates complete multiplayer guide from `MULTIPLAYER_PORTAL_SYSTEM.md`.

### Quick Publish: Portfolio Guide

**Endpoint:** `POST /api/publish/portfolio-guide`

**Request:** Same as multiplayer-guide

Generates portfolio building guide from `PORTFOLIO_HUB_COMPLETE.md`.

### Quick Publish: Starter Catalog

**Endpoint:** `POST /api/publish/starter-catalog`

**Request:** Same as multiplayer-guide

Generates catalog of all 12 bucket starters from database.

### List Templates

**Endpoint:** `GET /api/publish/templates`

**Response:**
```json
{
  "success": true,
  "count": 4,
  "templates": [
    {
      "id": "multiplayer-guide",
      "name": "CALOS Multiplayer Portal Guide",
      "type": "game-guide",
      "description": "Complete guide for multiplayer system",
      "pages": 250
    }
  ]
}
```

---

## Use Cases

### 1. Distribute Documentation as Ebooks

**Problem:** Documentation stuck in markdown files
**Solution:** Publish as EPUB and distribute on Amazon Kindle, Gumroad

```bash
curl -X POST http://localhost:5001/api/publish/multiplayer-guide \
  -H "Content-Type: application/json" \
  -d '{"outputFormat": "epub", "aiEnhancement": true}'
```

### 2. Generate Reference Catalogs

**Problem:** Database content not easily browsable
**Solution:** Auto-generate PDF catalog from database

```bash
curl -X POST http://localhost:5001/api/publish/generate-from-database \
  -H "Content-Type: application/json" \
  -d '{
    "contentType": "starters",
    "outputFormat": "pdf",
    "template": "reference-docs"
  }'
```

### 3. Create Course Materials

**Problem:** Need step-by-step tutorial content
**Solution:** Use tutorial-course template

```bash
curl -X POST http://localhost:5001/api/publish/generate-book \
  -H "Content-Type: application/json" \
  -d '{
    "template": "workflow-course",
    "outputFormat": "all"
  }'
```

### 4. Website Generation

**Problem:** Need standalone documentation website
**Solution:** Generate responsive HTML site

```bash
curl -X POST http://localhost:5001/api/publish/generate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "markdown",
    "sourcePath": "MULTIPLAYER_PORTAL_SYSTEM.md",
    "outputFormat": "html",
    "template": "game-guide"
  }'
```

### 5. Scraper-Friendly Distribution

**Problem:** Want content easily copied for AI training
**Solution:** Generate all formats, make publicly accessible

```bash
# Generate all formats
curl -X POST http://localhost:5001/api/publish/generate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "markdown",
    "sourcePath": "MULTIPLAYER_PORTAL_SYSTEM.md",
    "outputFormat": "all"
  }'

# Files available at:
# http://localhost:5001/downloads/calos-multiplayer-portal-guide_123.epub
# http://localhost:5001/downloads/calos-multiplayer-portal-guide_123.pdf
# http://localhost:5001/downloads/calos-multiplayer-portal-guide_123.html
# http://localhost:5001/downloads/calos-multiplayer-portal-guide_123.md
# http://localhost:5001/downloads/calos-multiplayer-portal-guide_123.json
```

---

## Scraper-Friendly Design

**Philosophy:** Content should be easy to copy, distribute, and use for AI training.

**Features:**
1. **Multiple formats** - EPUB, PDF, HTML, Markdown, JSON
2. **Public downloads** - No authentication required
3. **Clean HTML** - No obfuscation, semantic markup
4. **JSON API** - Structured data for easy parsing
5. **Markdown output** - Raw content accessible
6. **Consistent URLs** - `/downloads/{filename}`

**Example scraper pattern:**
```bash
# List all publications
curl http://localhost:5001/api/publish/list

# Download all formats
curl http://localhost:5001/downloads/book_123.epub -O
curl http://localhost:5001/downloads/book_123.pdf -O
curl http://localhost:5001/downloads/book_123.html -O
curl http://localhost:5001/downloads/book_123.md -O
curl http://localhost:5001/downloads/book_123.json -O
```

---

## Integration with CALOS Systems

### Bucket Orchestrator Integration

The ContentPublisher uses BucketOrchestrator for AI enhancement:

```javascript
const bucket = this.bucketOrchestrator.buckets.find(b => b.id === aiModel);
const response = await bucket.chat([{
  role: 'user',
  content: `Write introduction for "${chapter.title}"`
}]);
chapter.aiIntro = response.content;
```

### Database Integration

Generates content from database tables:
- `buckets` - Bucket instances
- `user_bucket_assignments` - Starter selections
- `portal_instances` - Multiplayer portals
- `bucket_battles` - Battle history
- `bucket_trades` - Trade history

### Multiplayer System Integration

Generate books about specific portals:

```bash
curl -X POST http://localhost:5001/api/publish/generate-from-database \
  -H "Content-Type: application/json" \
  -d '{
    "contentType": "portals",
    "contentId": "123",
    "outputFormat": "pdf",
    "title": "Portal 123 Battle History"
  }'
```

### Portfolio System Integration

Future: Generate portfolio showcase books

```bash
curl -X POST http://localhost:5001/api/publish/generate-from-database \
  -H "Content-Type: application/json" \
  -d '{
    "contentType": "portfolios",
    "contentId": "456",
    "outputFormat": "pdf",
    "template": "business-guide"
  }'
```

---

## File Structure

```
agent-router/
├── lib/
│   ├── content-publisher.js          # Main orchestrator
│   ├── ebook-generator.js            # EPUB/MOBI generation
│   ├── book-templates.js             # Template library
│   ├── document-generator.js         # PDF/HTML generation (existing)
│   └── bucket-orchestrator.js        # Bucket management (existing)
├── routes/
│   └── publish-routes.js             # Publishing API
├── public/
│   └── downloads/                    # Generated files
└── temp/
    └── ebooks/                       # Temporary EPUB build directories
```

---

## Configuration

**Environment Variables:**

```bash
# Publishing directories
PUBLISH_OUTPUT_DIR=/path/to/output     # Default: public/downloads
PUBLISH_TEMP_DIR=/path/to/temp         # Default: temp/ebooks

# Calibre (for MOBI conversion)
CALIBRE_PATH=/usr/local/bin           # Optional: Calibre installation path
```

**Default Metadata:**

Edit `lib/ebook-generator.js`:
```javascript
this.defaults = {
  author: 'CALOS AI',
  publisher: 'CALOS Publishing',
  language: 'en',
  rights: 'All rights reserved',
  subject: 'Technology, AI, Software'
};
```

---

## Advanced Usage

### Custom Templates

Create your own template in `lib/book-templates.js`:

```javascript
static customTemplate() {
  return {
    name: 'My Custom Book',
    subtitle: 'Subtitle Here',
    template: 'custom-type',
    targetPages: 100,

    generateSections() {
      return [
        {
          level: 1,
          title: 'Introduction',
          content: 'Intro content...'
        },
        {
          level: 2,
          title: 'Chapter 1',
          content: 'Chapter content...'
        }
      ];
    }
  };
}
```

### Batch Publishing

Publish multiple documents:

```bash
#!/bin/bash
for doc in docs/*.md; do
  curl -X POST http://localhost:5001/api/publish/generate \
    -H "Content-Type: application/json" \
    -d "{
      \"sourceType\": \"markdown\",
      \"sourcePath\": \"$doc\",
      \"outputFormat\": \"all\"
    }"
done
```

### Scheduled Publishing

Use cron to auto-publish daily:

```bash
# crontab -e
0 2 * * * curl -X POST http://localhost:5001/api/publish/multiplayer-guide
```

---

## Troubleshooting

### EPUB Validation Errors

**Problem:** EPUB fails validation
**Solution:** Check EPUB structure with epubcheck

```bash
brew install epubcheck
epubcheck output.epub
```

### MOBI Conversion Fails

**Problem:** `ebook-convert: command not found`
**Solution:** Install Calibre

```bash
brew install --cask calibre
```

### AI Enhancement Too Slow

**Problem:** Generation takes too long
**Solution:** Disable AI enhancement or use faster model

```json
{
  "aiEnhancement": false
}
```

Or use faster model:
```json
{
  "aiEnhancement": true,
  "aiModel": "gemma2:2b"
}
```

### PDF Font Issues

**Problem:** PDF has missing characters
**Solution:** Use web-safe fonts in DocumentGenerator

### Large File Sizes

**Problem:** EPUB/PDF too large
**Solution:**
- Compress images before adding
- Remove unnecessary content
- Split into multiple volumes

---

## Performance

**Typical generation times:**

| Format   | Pages | Size   | Time (No AI) | Time (With AI) |
|----------|-------|--------|--------------|----------------|
| EPUB     | 100   | 150 KB | 2s           | 15s            |
| EPUB     | 250   | 300 KB | 5s           | 45s            |
| PDF      | 100   | 1 MB   | 5s           | 18s            |
| PDF      | 250   | 2.5 MB | 12s          | 60s            |
| HTML     | 100   | 200 KB | 1s           | 13s            |
| Markdown | 100   | 100 KB | 1s           | 13s            |
| JSON     | 100   | 150 KB | 1s           | 13s            |

**Optimization tips:**
- Use `outputFormat: "epub"` instead of `"all"` when only one format needed
- Disable AI enhancement for quick drafts
- Use faster AI models (gemma2:2b instead of llama3.2:3b)
- Pre-process markdown files to reduce parsing time

---

## Future Enhancements

**Planned features:**
- [ ] Cover image generation with AI
- [ ] Multi-language support
- [ ] Interactive HTML with embedded code playgrounds
- [ ] Audiobook generation (text-to-speech)
- [ ] Video course generation (slides + narration)
- [ ] Custom CSS themes per domain
- [ ] Collaborative editing (multiple buckets review/improve)
- [ ] Version control (track revisions)
- [ ] Analytics (track downloads, views)
- [ ] Monetization (paywall, subscriptions)
- [ ] Print-on-demand integration (Amazon KDP, IngramSpark)

---

## License

CALOS Content Publishing System © 2025 CALOS AI

---

## Interactive Glossary

Want to explore this documentation as an interactive knowledge graph? Check out the **CALOS Publishing Glossary**:

**🌐 [View Interactive Glossary](/publishing-glossary.html)**

The glossary provides three ways to explore concepts:

### 1. **Graph View** - D3.js Force-Directed Visualization
- Interactive node-edge graph (like Obsidian/Neo4j)
- Drag nodes to reposition
- Click to see concept details
- Filter by type (headings, terms, code)
- Search concepts
- Color-coded by category
- Zoom and pan

### 2. **Hierarchical Glossary** - Traditional Tree View
- Document structure (sections → subsections → topics)
- Browse by category
- Click to jump to concept in graph

### 3. **Concept Network** - InfraNodus-Style Analysis
- **Knowledge Hubs**: Most connected concepts (good candidates for deep-dives)
- **Structural Gaps**: Isolated concepts (need more connections/examples)
- **AI Suggestions**: Generated recommendations for improving documentation

### How It Works

The glossary system uses:
- **`lib/glossary-builder.js`**: Extracts concepts from markdown (headings, bold terms, code blocks)
- **`routes/glossary-routes.js`**: API endpoints for graph data
- **`public/lib/d3-graph-viewer.js`**: D3.js visualization engine
- **`public/publishing-glossary.html`**: Interactive UI

Concepts are extracted by:
1. **Headings** (`#`, `##`, `###`) → Major concepts
2. **Bold terms** (`**term**`) → Terminology
3. **Code blocks** (classes, functions) → Implementation
4. **Backticks** (`` `term` ``) → Technical terms

Relationships detected:
- **Co-occurrence**: Terms appearing near each other
- **Prerequisites**: "requires", "depends on", "uses", "built on"
- **Hierarchy**: Parent-child from heading levels

### API Endpoints

```bash
# Get graph for specific doc
GET /api/glossary/graph/content-publishing-system

# Get combined graph (all docs)
GET /api/glossary/combined

# Search concepts
GET /api/glossary/search?q=epub&doc=content-publishing-system

# Get concept details
GET /api/glossary/concept/epub

# Get network analysis
GET /api/glossary/network/content-publishing-system

# Get statistics
GET /api/glossary/stats
```

### Use Cases

**For Writers:**
- Identify knowledge hubs (concepts that need expansion)
- Find structural gaps (missing connections)
- Ensure consistent terminology

**For Readers:**
- Visual navigation (explore related concepts)
- Quick lookups (search + click)
- Understand relationships (prerequisites, hierarchies)

**For AI Training:**
- Export as JSON graph
- Feed to knowledge graph systems
- Train on concept relationships

### The Meta-Game: Documentation as Content

The glossary itself demonstrates the **recursive nature** of the publishing system:

1. **Write documentation** (like this file)
2. **Extract concepts** (glossary builder)
3. **Visualize relationships** (D3.js graph)
4. **Publish as book** (ContentPublisher)
5. **Distribute widely** (scraper-friendly)

You're literally "getting paid for yapping about concepts" - and the system makes it easy to organize, visualize, and monetize that knowledge.

**The Dungeons & Dragons parallel:**
- **Graph view** = Visual spell list with prerequisites
- **Glossary** = Monster manual entries
- **Concept network** = Campaign world map
- **Long-form docs** = Campaign setting lore
- **Templates** = Adventure modules
- **AI enhancement** = Dungeon Master's creativity

---

## Related Documentation

- **Multiplayer System**: See `MULTIPLAYER_PORTAL_SYSTEM.md`
- **Portfolio Hub**: See `PORTFOLIO_HUB_COMPLETE.md`
- **Bucket System**: See `lib/bucket-orchestrator.js`
- **Event Broadcasting**: See `lib/event-broadcaster.js`
- **Interactive Glossary**: See `/publishing-glossary.html`

---

**Questions?** Open an issue or contact CALOS AI support.
