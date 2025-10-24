# Cal's Knowledge System - Complete Integration Guide

## Overview
Cal can now **remember**, **use**, and **learn from** debugging patterns across your entire platform:
- 🧠 Learns from debugging sessions during lessons
- 📚 Links patterns to lessons, concepts, and notes
- 🌐 Collects frontend errors automatically from student browsers
- 🎯 Suggests solutions based on past fixes
- 📊 Tracks which errors students encounter most often

## What Was Built

### 1. **Knowledge Storage** (PostgreSQL + SQLite)
- `knowledge_patterns` table - Debugging patterns with occurrence tracking
- `error_patterns` (SQLite) - Error fixes with success rates
- `notes` table - Knowledge base with embeddings
- `domain_code_examples` - Code patterns

### 2. **Knowledge Retrieval** (`lib/unified-knowledge-interface.js`)
- Unified API across all knowledge stores
- Smart ranking by priority, confidence, and relevance
- 10-minute caching for frequently accessed patterns

### 3. **Automatic Enrichment** (`middleware/knowledge-enricher.js`)
- Intercepts AI requests on `/api/knowledge` and `/api/autonomous`
- Extracts error types and keywords automatically
- Injects top 5 relevant patterns into AI context

## How To Use

### Store a Pattern (POST)
```bash
curl -X POST http://localhost:5001/api/knowledge/learn-from-session \
  -H "Content-Type: application/json" \
  -d '{
    "problem": "Failed to fetch in browser",
    "solution": "Add browser polyfills script",
    "pattern": "missing_browser_polyfills",
    "steps": ["Add script tag", "Reload page", "Error resolved"],
    "keywords": ["fetch", "polyfills", "browser"],
    "severity": "high",
    "category": "error_fix"
  }'
```

### Retrieve Patterns (GET)
```bash
# Get all patterns
curl http://localhost:5001/api/knowledge/patterns

# Filter by keyword
curl http://localhost:5001/api/knowledge/patterns?keyword=postgresql

# Filter by category
curl http://localhost:5001/api/knowledge/patterns?category=error_fix
```

### Search for Solutions
```bash
curl -X POST http://localhost:5001/api/knowledge/search-solution \
  -H "Content-Type: application/json" \
  -d '{
    "problem": "Failed to fetch",
    "keywords": ["fetch", "browser"]
  }'
```

## Example: How Cal Learns

### Before Fix
```
User: "Getting 'Failed to fetch' error"
Cal: *tries random fixes*
```

### After Fix + Learning
```
1. You fix the issue (add polyfills)
2. POST to /api/knowledge/learn-from-session
3. Pattern stored: "missing_browser_polyfills"
```

### Next Time
```
User: "Getting 'Failed to fetch' error"
↓
KnowledgeEnricher detects: errorType="fetch_error", keywords=["fetch"]
↓
UnifiedKnowledge queries: knowledge_patterns table
↓
Finds: "missing_browser_polyfills" (100% relevance, seen 3x)
↓
Injects into AI prompt:
  "## Cal's Learned Experience
   🔧 Error Fix (100% confidence, seen 3x):
      Error: fetch_error
      Fix: Add <script src='/lib/browser-polyfills.js'>"
↓
Cal suggests: "Based on previous fixes, try adding browser polyfills..."
```

## Current Status

✅ **Fully Operational**
- Migration created: `migrations/067_knowledge_patterns.sql`
- 2 patterns stored:
  1. `missing_browser_polyfills` (fetch errors)
  2. `postgresql_interval_fix` (interval overflow)
- Knowledge enrichment active on:
  - `/api/knowledge/*`
  - `/api/autonomous/*`

## Files Modified

1. **Created:**
   - `lib/unified-knowledge-interface.js` (577 lines)
   - `middleware/knowledge-enricher.js` (293 lines)
   - `migrations/067_knowledge_patterns.sql`

2. **Updated:**
   - `router.js` - Wired knowledge systems (lines 217-227, 603-621, 677-685, 931-938)
   - `lib/knowledge-query-engine.js` - Replaced stub with working implementation
   - `routes/knowledge-learning-routes.js` - Fixed PostgreSQL array handling

## Fixes Applied

1. **SQL Injection Fix** - Parameterized queries in `_searchDebuggingPatterns()`
2. **JSON Parsing Fix** - PostgreSQL `TEXT[]` and `JSONB` don't need `JSON.parse()`
3. **INSERT Fix** - Pass arrays/objects directly, not as JSON strings

## NEW: Learning Platform Integration (Migration 068)

### What's New

The knowledge system is now fully integrated with your learning platform! Students' debugging sessions are automatically tracked and patterns are learned from real classroom errors.

### New Database Tables

1. **lesson_debug_sessions** - Tracks errors during lessons
   - Links errors to specific lessons and students
   - Tracks resolution time and method
   - Auto-matches against known patterns

2. **frontend_errors** - Browser console errors
   - Captures JavaScript errors from student browsers
   - Includes stack traces and console logs
   - Auto-matches to known solutions

3. **note_pattern_mappings** - Links notes to patterns
   - Tag student notes with debugging patterns
   - Auto-detection via AI
   - Relevance scoring

### New API Endpoints

#### Lesson Error Tracking
```bash
# Get common errors for a lesson
curl http://localhost:5001/api/learning/lessons/{lessonId}/common-errors

# Record a debugging session
curl -X POST http://localhost:5001/api/learning/lessons/{lessonId}/debug-session \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "errorType": "fetch_error",
    "errorMessage": "Failed to fetch",
    "studentCode": "const data = await fetch(...)",
    "lessonStep": 3
  }'

# Mark session as resolved
curl -X PATCH http://localhost:5001/api/learning/debug-session/{sessionId}/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolutionMethod": "pattern"}'
```

#### Frontend Error Collection
```bash
# Report a browser error
curl -X POST http://localhost:5001/api/knowledge/learn-from-frontend \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "pageUrl": "http://localhost:5001/training-tasks.html",
    "errorType": "js_error",
    "errorMessage": "Cannot read property of undefined",
    "stackTrace": "...",
    "browserInfo": {...}
  }'
```

### Frontend Integration

#### Auto Error Reporting
Add this to any HTML page to automatically capture and report errors:

```html
<!-- Include the error reporter library -->
<script src="/lib/cal-error-reporter.js"></script>
<script>
  // Initialize with your user ID
  CalErrorReporter.init({
    apiUrl: 'http://localhost:5001',
    userId: 'user-123',  // Current logged-in user
    enabled: true
  });
</script>
```

The reporter will automatically:
- ✅ Catch all JavaScript errors
- ✅ Capture unhandled promise rejections
- ✅ Monitor network fetch failures
- ✅ Send console.log history with each error
- ✅ Show known solutions in browser console

#### Example: Pattern-Aware Lesson UI

```javascript
// When a student starts a lesson, load common errors
async function loadLessonHints(lessonId) {
  const response = await fetch(
    `/api/learning/lessons/${lessonId}/common-errors?limit=3`
  );
  const { commonErrors } = await response.json();

  // Show hints panel
  displayHints(commonErrors);
}

// When student encounters an error, report it
async function reportStudentError(lessonId, error) {
  const response = await fetch(
    `/api/learning/lessons/${lessonId}/debug-session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        errorType: classifyError(error),
        errorMessage: error.message,
        stackTrace: error.stack,
        studentCode: editor.getValue(),
        lessonStep: currentStep
      })
    }
  );

  const { hint, sessionId } = await response.json();

  // If Cal knows this error, show the solution
  if (hint) {
    showHintPanel(hint.pattern, hint.solution);
  }

  // When student fixes it, mark as resolved
  window.addEventListener('lessonComplete', async () => {
    await fetch(`/api/learning/debug-session/${sessionId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionMethod: 'pattern' })
    });
  });
}
```

### Database Views

Migration 068 created helpful views:

```sql
-- Common errors by lesson (ranked by frequency)
SELECT * FROM lesson_common_errors WHERE lesson_id = 'lesson-uuid';

-- Notes tagged with patterns
SELECT * FROM notes_with_patterns WHERE user_id = 'user-uuid';

-- Frontend error patterns (most frequent browser errors)
SELECT * FROM frontend_error_patterns ORDER BY occurrence_count DESC;
```

### How It Works: Student Journey

1. **Student encounters error** during lesson
2. **Frontend reports error** via `CalErrorReporter`
3. **Backend matches pattern** from `knowledge_patterns`
4. **Lesson UI shows hint** based on previous solutions
5. **Student resolves error**
6. **Resolution tracked** in `lesson_debug_sessions`
7. **Pattern occurrence_count++** (improves ranking)
8. **Next student** sees better hints!

### Analytics You Can Now Track

```sql
-- Which lessons have the most debugging friction?
SELECT
  lesson_title,
  COUNT(*) as error_count,
  AVG(resolution_time) as avg_fix_time_seconds
FROM lesson_debug_sessions lds
JOIN lessons l ON lds.lesson_id = l.lesson_id
GROUP BY lesson_title
ORDER BY error_count DESC;

-- Which patterns are students encountering most?
SELECT
  pattern_name,
  COUNT(*) as occurrences,
  AVG(resolution_time) as avg_time_to_fix,
  AVG(CASE WHEN resolved THEN 1 ELSE 0 END) as resolution_rate
FROM lesson_debug_sessions lds
JOIN knowledge_patterns kp ON lds.pattern_id = kp.id
GROUP BY pattern_name
ORDER BY occurrences DESC;

-- Browser error hotspots
SELECT
  page_url,
  error_type,
  COUNT(*) as error_count
FROM frontend_errors
GROUP BY page_url, error_type
ORDER BY error_count DESC;
```

## Next Steps

### For Instructors
- ✅ Add `CalErrorReporter` to lesson pages
- ✅ Review `lesson_common_errors` to improve difficult lessons
- ✅ Add more patterns via `/api/knowledge/learn-from-session`

### For Developers
- ✅ Build UI widgets showing common lesson errors
- ✅ Create admin dashboard with error analytics
- ✅ Auto-tag student notes with relevant patterns
- ✅ Build knowledge graph visualizer

### For Students
- ✅ Your errors help future students learn faster!
- ✅ Get instant hints when you hit known issues
- ✅ See how long others took to solve the same problem
