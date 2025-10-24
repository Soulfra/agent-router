# Author Workflow Guide - Write, Test, Publish

Complete system for creating **executable documentation** that tests itself!

## Overview

The CALOS Author Workflow enables you to:
1. **Write** - Create articles with executable code examples
2. **Test** - Automatically verify code examples work
3. **Publish** - Deploy to production with confidence
4. **Track** - Monitor views, engagement, discussions
5. **Monetize** - RSS feeds for subscribers

## Quick Start

### 1. Create a Draft Article

```bash
curl -X POST http://localhost:3001/api/author/articles \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Getting Started with Node.js",
    "slug": "nodejs-getting-started",
    "category": "tutorial",
    "tags": ["nodejs", "javascript", "beginner"],
    "content": "# Hello Node\n\n```javascript\nconsole.log(\"Hello, World!\");\n```"
  }'
```

**Response:**
```json
{
  "success": true,
  "article": {
    "article_id": 1,
    "title": "Getting Started with Node.js",
    "status": "draft",
    "has_code": true,
    "code_tested": false,
    "word_count": 3,
    "reading_time_minutes": 1
  }
}
```

### 2. Test Code Blocks

```bash
curl -X POST http://localhost:3001/api/author/articles/1/test
```

**Response:**
```json
{
  "success": true,
  "results": {
    "tests": 1,
    "passed": 1,
    "failed": 0,
    "results": [
      {
        "language": "javascript",
        "success": true,
        "output": "Hello, World!\\n"
      }
    ]
  }
}
```

### 3. Publish to Production

```bash
curl -X POST http://localhost:3001/api/author/articles/1/publish
```

**Response:**
```json
{
  "success": true,
  "article": {
    "article_id": 1,
    "status": "published",
    "published_at": "2025-10-19T15:30:00Z"
  },
  "message": "Article published successfully"
}
```

### 4. Track Analytics

```bash
curl http://localhost:3001/api/author/articles/1/analytics
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "article_id": 1,
    "title": "Getting Started with Node.js",
    "views": 127,
    "threads": 3,
    "comments": 18,
    "word_count": 3,
    "reading_time_minutes": 1
  }
}
```

## API Endpoints

### Article Management

#### Create Draft
```
POST /api/author/articles
```
**Body:**
```json
{
  "title": "Article Title",
  "slug": "article-slug",
  "category": "tutorial",
  "tags": ["tag1", "tag2"],
  "content": "Markdown content with code blocks"
}
```

#### List Articles
```
GET /api/author/articles?status=draft&category=tutorial&limit=20
```

#### Get Article
```
GET /api/author/articles/:id
```

#### Update Article
```
PUT /api/author/articles/:id
```
**Body:**
```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "status": "draft"
}
```

### Testing & Publishing

#### Test Code Blocks
```
POST /api/author/articles/:id/test
```
Extracts and runs all JavaScript code blocks in the article.

#### Publish Article
```
POST /api/author/articles/:id/publish
```
Publishes to production. **Requires code_tested = true** if article contains code.

### Analytics

#### Get Article Analytics
```
GET /api/author/articles/:id/analytics
```

#### Get Author Stats
```
GET /api/author/stats
```
**Response:**
```json
{
  "total_articles": 15,
  "published_articles": 12,
  "draft_articles": 3,
  "total_views": 2847,
  "total_words": 12543
}
```

### RSS Feed

#### Generate RSS Feed
```
GET /api/author/feed.xml
```
Returns RSS XML with last 50 published articles.

### Public Endpoints

#### List Published Articles
```
GET /api/author/published?category=tutorial&tag=nodejs&limit=20
```

## Code Testing

The author workflow supports **executable documentation** - code examples that automatically test themselves.

### Supported Languages

Currently supports **JavaScript/Node.js** code blocks:

````markdown
```javascript
// This code will be executed during testing
const sum = (a, b) => a + b;
console.log(sum(2, 3)); // Output: 5
```
````

### Safety

- Code runs in isolated Node.js process with 5-second timeout
- Only `javascript` and `js` code blocks are executed
- Other languages (python, bash, etc.) are skipped

### Test Results

Test results include:
- Success/failure status
- stdout output
- Error messages (if failed)

Example failure:
```json
{
  "language": "javascript",
  "success": false,
  "output": "",
  "error": "ReferenceError: foo is not defined"
}
```

## Integration with Content System

Published articles automatically:
1. **Added to curated content** - Appears in `/api/curation/feed`
2. **Enable forum discussions** - Readers can create threads
3. **Track engagement** - Views, comments, voting
4. **Generate RSS** - Syndication for subscribers

## Revision History

Every edit creates a revision:

```sql
SELECT
  revision_number,
  changed_at,
  changed_by,
  change_summary
FROM author_article_revisions
WHERE article_id = 1
ORDER BY revision_number DESC;
```

## Autosave

Drafts are auto-saved every few minutes (last 10 saves kept per user):

```bash
curl -X POST http://localhost:3001/api/author/autosave \
  -d '{"article_id": 1, "content": "Auto-saved content..."}'
```

## Collaboration

Multiple authors can work on same article:

```sql
INSERT INTO author_collaborators (article_id, user_id, role)
VALUES (1, 5, 'editor');
```

**Roles:**
- `owner` - Full control
- `editor` - Can edit and publish
- `contributor` - Can edit, cannot publish
- `reviewer` - Read-only with comment rights

## Article Series

Group related articles:

```sql
INSERT INTO author_series (series_name, series_slug, article_order)
VALUES ('Node.js Basics', 'nodejs-basics', ARRAY[1, 2, 3, 4]);
```

## Database Schema

### Main Tables

**author_articles** - Article content and metadata
- `article_id` - Primary key
- `title`, `slug`, `content` - Article data
- `status` - draft, published, archived
- `has_code`, `code_tested` - Code testing flags
- `word_count`, `reading_time_minutes` - Analytics

**author_article_revisions** - Version history
- Tracks every edit with timestamp and author

**author_collaborators** - Multi-author support
- Maps users to articles with roles

**author_series** - Grouped articles
- Ordered collections of related content

**author_autosaves** - Crash recovery
- Auto-saved drafts (24-hour TTL)

### Views

**published_articles** - Public articles with full metadata
**author_stats** - Per-author statistics

## Example Workflow

### 1. Draft Phase
```bash
# Create draft
POST /api/author/articles → article_id = 1

# Auto-save while writing (every 2 minutes)
POST /api/author/autosave

# Update draft
PUT /api/author/articles/1

# Review revision history
GET /api/author/articles/1/revisions
```

### 2. Testing Phase
```bash
# Test code examples
POST /api/author/articles/1/test

# Fix failures, update article
PUT /api/author/articles/1

# Re-test until all pass
POST /api/author/articles/1/test → success: true
```

### 3. Publishing Phase
```bash
# Publish to production
POST /api/author/articles/1/publish

# Article now appears in:
# - /api/author/published
# - /api/curation/feed
# - /api/author/feed.xml
```

### 4. Monitoring Phase
```bash
# Track performance
GET /api/author/articles/1/analytics

# Monitor discussions
GET /api/forum/threads?content_id=author-1

# Check author stats
GET /api/author/stats
```

## Best Practices

### 1. Test Before Publishing
Always run tests before publishing:
```bash
npm run test-article 1
```

### 2. Use Descriptive Slugs
Good: `nodejs-async-await-tutorial`
Bad: `article-1`

### 3. Tag Appropriately
Use 3-5 relevant tags for discovery

### 4. Include Code Examples
Executable examples help readers verify concepts work

### 5. Write Useful Revision Summaries
```sql
UPDATE author_articles
SET change_summary = 'Fixed typo in code example, added error handling section'
WHERE article_id = 1;
```

## Troubleshooting

### Code Tests Failing

**Problem:** Tests fail but code looks correct

**Solution:** Check for:
- Missing dependencies (add `require()` statements)
- Asynchronous code (tests don't wait for promises)
- Console output expectations

### Publishing Blocked

**Problem:** Cannot publish article

**Possible Causes:**
- Code not tested (`code_tested = false`)
- Article already published
- Missing required fields

**Solution:**
```bash
# Check article status
GET /api/author/articles/1

# Run tests
POST /api/author/articles/1/test

# Then publish
POST /api/author/articles/1/publish
```

### Low View Count

**Problem:** Article has few views

**Solutions:**
- Add to prominent category
- Use popular tags
- Cross-post to forum
- Include in newsletter
- Share RSS feed URL

## Migration

Run database migration:
```bash
psql $DATABASE_URL -f migrations/057_author_workflow.sql
```

## Files Created

- `lib/author-workflow.js` - Core workflow engine
- `routes/author-routes.js` - API endpoints
- `migrations/057_author_workflow.sql` - Database schema
- Wired into `router.js` at line ~1200

## Next Steps

1. **Set up database** - Run migration
2. **Write first article** - Create draft with code examples
3. **Test examples** - Verify code works
4. **Publish** - Deploy to production
5. **Monitor** - Track views and engagement
6. **Iterate** - Update based on feedback

---

**🎉 You're now an author! Start writing executable documentation that tests itself.**
