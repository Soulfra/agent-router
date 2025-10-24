# ADR-001: Knowledge Pattern Learning System

**Status:** Accepted

**Date:** 2025-10-21

**Decision Makers:** @matthewmauer

**Tags:** #database #learning-platform #knowledge #ai #debugging

---

## Context

### The Problem

Students in the CALOS learning platform were repeatedly encountering the same errors (e.g., "Failed to fetch" in browser, PostgreSQL interval overflow). Each time, instructors had to manually help students debug, wasting time on solved problems. There was no system to:

1. **Track which errors students encounter most often**
2. **Learn from successful debugging sessions**
3. **Automatically suggest solutions to known problems**
4. **Collect frontend (browser) errors for analysis**
5. **Link debugging patterns to lessons and concepts**

### Current Situation (Before ADR-001)

- ✅ `knowledge_patterns` table existed (Migration 067) for storing patterns
- ✅ `notes` table for student note-taking
- ❌ **BUT** patterns were isolated - not connected to lessons
- ❌ **NO** frontend error collection
- ❌ **NO** student debugging session tracking
- ❌ **NO** pattern suggestions during lessons

### Constraints

- **Must integrate** with existing learning platform (lessons, concepts, notes)
- **Must not** require React/Vue (frontend is vanilla HTML/JS)
- **Must be lightweight** (students on slow connections)
- **Must respect privacy** (don't log sensitive student code)
- **Must scale** to 1000s of error reports

---

## Decision

### Core Choice

**We will build a comprehensive Knowledge Pattern Learning System** that:
1. Links patterns to lessons, concepts, and notes
2. Tracks student debugging sessions in real-time
3. Collects frontend errors automatically
4. Suggests known solutions when errors occur

### Implementation Details

**Database (Migration 068)**:
- `lesson_debug_sessions` - Tracks student errors during lessons
- `frontend_errors` - Browser console errors from students
- `note_pattern_mappings` - Links notes to patterns
- Extended `knowledge_patterns` with foreign keys to lessons/concepts/notes
- Created 3 SQL views for common queries

**API Endpoints** (added to `routes/learning-routes.js` and `routes/knowledge-learning-routes.js`):
- `GET /api/learning/lessons/:id/common-errors` - Top errors for a lesson
- `POST /api/learning/lessons/:id/debug-session` - Record debugging session
- `PATCH /api/learning/debug-session/:id/resolve` - Mark session resolved
- `POST /api/knowledge/learn-from-frontend` - Collect browser errors

**Frontend** (`public/lib/cal-error-reporter.js`):
- Lightweight JavaScript library (12KB)
- Auto-captures errors, promise rejections, fetch failures
- Sends console.log history with errors
- Shows known solutions in browser console

### Success Criteria

1. **Reduced support burden**: 50% fewer "help me debug" requests within 3 months
2. **Faster debugging**: Average student resolution time < 5 minutes for known errors
3. **Data collection**: 100+ frontend errors captured per week
4. **Pattern growth**: 50+ patterns learned within 6 months
5. **Lesson insights**: Identify top 5 hardest lessons by error frequency

---

## Consequences

### Positive Consequences

- ✅ **Students learn faster** - Instant hints for known errors
- ✅ **Instructors save time** - No more answering the same question 100x
- ✅ **Data-driven course improvement** - Analytics show which lessons are hardest
- ✅ **Self-improving system** - More students → more patterns → better hints
- ✅ **Frontend debugging capability** - Can now detect browser-specific issues
- ✅ **Knowledge reuse** - Patterns from one lesson help students in other lessons

### Negative Consequences

- ⚠️ **New complexity** - 3 new tables, 4 new endpoints, 1 new library
- ⚠️ **Privacy considerations** - Must be careful not to log student PII
- ⚠️ **Storage growth** - Error logs will grow over time (need retention policy)
- ⚠️ **Maintenance burden** - Need to monitor false positives in pattern matching
- ⚠️ **Client-side JS required** - Error reporter adds 12KB to page load

### Neutral Consequences

- 📝 **More documentation needed** - Must document ADRs (hence this doc!)
- 📝 **Team training** - Instructors need to learn how to review error analytics
- 📝 **Migration required** - Must run Migration 068 on all environments

---

## Alternatives Considered

### Alternative 1: Third-Party Error Tracking (Sentry, Rollbar, Bugsnag)

**Description:** Use existing SaaS platforms for error tracking

**Pros:**
- Mature platforms with advanced features
- No custom development needed
- Excellent UI/UX
- Integrations with Slack, Jira, etc.

**Cons:**
- **Cost:** $29-$99/month minimum
- **Privacy:** Student data sent to third party
- **Not lesson-aware:** Can't link errors to specific lessons/concepts
- **No pattern learning:** Just tracks errors, doesn't suggest solutions
- **Overkill:** We don't need performance monitoring, just error learning

**Why rejected:** Doesn't integrate with our learning platform architecture. We need domain-specific features (lesson linkage, pattern suggestions).

### Alternative 2: Simple Error Logging (No Pattern Learning)

**Description:** Just log errors to database, manual review later

**Pros:**
- Simpler implementation (1 table, 1 endpoint)
- Lower complexity
- Easier to maintain

**Cons:**
- **No real-time help:** Students still stuck debugging alone
- **Manual work:** Instructors must manually find patterns
- **Missed opportunity:** Don't leverage AI for pattern matching
- **Doesn't scale:** 1000 students = 10,000 errors to manually review

**Why rejected:** Solves data collection but not the core problem (students need help debugging NOW).

### Alternative 3: Forum/Stack Overflow Style Q&A

**Description:** Let students ask questions in a forum, other students answer

**Pros:**
- Community-driven
- Students learn by helping each other
- No AI/ML complexity

**Cons:**
- **Slow:** Takes hours for responses
- **Duplicate questions:** Same question asked 50x
- **Quality varies:** Bad answers get upvoted sometimes
- **Doesn't scale:** Requires active community

**Why rejected:** Great for novel problems, terrible for repetitive debugging (our main use case).

---

## Related Decisions

- **Builds upon:** Migration 067 (Knowledge Patterns Table)
- **Complements:** Migration 020 (Learning Platform)
- **Integrates with:** Migration 014 (Knowledge Graph)
- **See also:** `KNOWLEDGE_SYSTEM.md` for usage documentation

---

## Notes

### Implementation Checklist

- [x] Migration 068 created and tested
- [x] API endpoints added to learning-routes.js
- [x] Frontend error reporter library created
- [x] Documentation written (KNOWLEDGE_SYSTEM.md)
- [ ] Add to ACTUAL_ARCHITECTURE.md (next task)
- [ ] Instructor training materials
- [ ] Data retention policy (purge errors after 90 days?)
- [ ] Privacy policy update (inform students about error collection)

### Future Considerations

**Things to monitor:**
- Pattern match accuracy (% of errors matched to correct pattern)
- False positive rate (% of suggested solutions that don't help)
- Storage growth (GB/month of error logs)
- Query performance (as tables grow)

**Potential enhancements:**
- AI-powered pattern extraction (use LLM to auto-generate patterns from error clusters)
- Video recording of debugging sessions (with student permission)
- Integration with linting tools (suggest fixes inline in editor)
- Pattern voting (students upvote helpful patterns)
- Cross-lesson pattern discovery (patterns that apply to multiple lessons)

**Known limitations:**
- Doesn't capture errors in Node.js/backend code (only browser)
- Pattern matching is keyword-based (not semantic)
- No A/B testing of pattern suggestions
- No student feedback loop ("Was this hint helpful?")

### Deployment Notes

**Migration 068 must be run in production BEFORE deploying new code**, otherwise endpoints will error (missing tables).

**Rollback plan:** If issues arise, can disable frontend error reporter by setting `CalErrorReporter.init({ enabled: false })` in HTML pages. Backend endpoints are read-only safe to deploy.

---

## Appendix: Data Flow Diagram

```
┌─────────────────┐
│ Student Browser │
│  (training.html)│
└────────┬────────┘
         │ 1. Error occurs
         ↓
┌─────────────────────┐
│ CalErrorReporter.js │  ← Auto-captures error
└────────┬────────────┘
         │ 2. POST /api/knowledge/learn-from-frontend
         ↓
┌────────────────────────────────┐
│ routes/knowledge-learning-     │
│        routes.js               │
│  • Saves to frontend_errors    │
│  • Matches against             │
│    knowledge_patterns          │
└────────┬───────────────────────┘
         │ 3. If match found, return solution
         ↓
┌─────────────────┐
│ Browser Console │
│ "🔧 Known Issue │  ← Student sees hint!
│  Pattern: X     │
│  Solution: Y"   │
└─────────────────┘
```

**Result:** Student fixes error in < 1 minute instead of waiting for instructor help.
