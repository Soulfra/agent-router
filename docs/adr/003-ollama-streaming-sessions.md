# ADR-003: Ollama Streaming Sessions with Multi-Domain Context Sharing

**Status:** Accepted

**Date:** 2024-10-22

**Decision Makers:** @matthewmauer, Claude

**Tags:** #database #ollama #sessions #billing #context-sharing #multi-llm

---

## Context

### The Problem

Users need to track work sessions when chatting with local Ollama, but want to:
1. **Track time** - How long did I work on Client ABC?
2. **Switch contexts** - Stream conversation history to GPT-4 when client needs OpenAI
3. **Track costs** - Local Ollama is free, but GPT-4 costs money - bill per client
4. **Apply branding** - Use custom branding when switching to client domains
5. **Generate summaries** - End-of-session report: duration, costs, which clients

**User Quote:**
> "I'm talking with my local Ollama, but when I hit certain models or domains I want to work with on their branding or consulting, it registers we're working on it like a timer. Ollama listens and streams context to other domains/models, then at the end we figure out costs."

### Current Situation

**Before this ADR:**
- Users chat with Ollama via `multi-llm-router.js`
- No session tracking (conversations lost)
- No timer (can't bill hourly)
- No context sharing between models
- No per-client cost breakdown

**Existing Infrastructure:**
- `users` table (user auth)
- `domain_portfolio` table (12 client domains)
- `user_brands` table (custom branding per client)
- `multi-llm-router.js` (routes to Ollama/OpenAI/Anthropic)
- `user_llm_usage` table (tracks individual LLM calls)

### Constraints

1. **Database**: PostgreSQL (already in use)
2. **LLM Providers**: Ollama (local, free) + OpenAI/Anthropic (paid)
3. **Billing**: Need per-client cost tracking
4. **Integration**: Must work with existing auth, domains, branding systems
5. **Performance**: Real-time WebSocket streaming for chat

---

## Decision

### Core Choice

**We will create a 3-table system** to track Ollama streaming sessions with multi-domain context sharing:

1. **`ollama_streaming_sessions`** - Session-level tracking (timer, domain, costs)
2. **`ollama_session_messages`** - Every message in the conversation
3. **`ollama_context_streams`** - When context is shared to other models

### Implementation Details

#### Database Schema

**Session Table:**
```sql
CREATE TABLE ollama_streaming_sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  domain_id UUID REFERENCES domain_portfolio(domain_id), -- Which client
  brand_id UUID REFERENCES user_brands(id),              -- Custom branding

  -- Timer
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR(20), -- 'active', 'ended'

  -- Primary model
  primary_model VARCHAR(100), -- 'ollama:mistral'

  -- Stats
  total_messages INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(10, 6),

  -- Soulfra signing
  soulfra_hash JSONB
);
```

**Messages Table:**
```sql
CREATE TABLE ollama_session_messages (
  message_id UUID PRIMARY KEY,
  session_id UUID REFERENCES ollama_streaming_sessions(session_id),

  role VARCHAR(20), -- 'user', 'assistant'
  content TEXT,
  timestamp TIMESTAMP,

  model VARCHAR(100), -- Which model generated this
  provider VARCHAR(50), -- 'ollama', 'openai', 'anthropic'

  tokens INTEGER,
  cost_usd NUMERIC(10, 6),

  -- Context sharing
  shared_to_domains UUID[], -- Which clients received this as context
  shared_to_models VARCHAR[] -- Which models received this
);
```

**Context Streams Table:**
```sql
CREATE TABLE ollama_context_streams (
  stream_id UUID PRIMARY KEY,
  session_id UUID,

  source_model VARCHAR(100), -- 'ollama:mistral'
  target_model VARCHAR(100), -- 'gpt-4'
  target_domain_id UUID,     -- Which client

  context_snapshot JSONB,    -- Array of messages sent
  message_count INTEGER,
  total_tokens INTEGER,

  reason VARCHAR(100),       -- 'domain_switch', 'model_upgrade'
  streamed_at TIMESTAMP,
  cost_usd NUMERIC(10, 6)
);
```

#### API Endpoints

```javascript
POST   /api/ollama/session/start       // Start timer
POST   /api/ollama/session/:id/chat    // Send message
POST   /api/ollama/session/:id/switch  // Switch domain/model
POST   /api/ollama/session/:id/end     // End timer, get summary
GET    /api/ollama/session/:id/summary // Get session report
GET    /api/ollama/sessions            // List all sessions
```

#### Core Libraries

1. **`lib/ollama-session-manager.js`** - Session lifecycle, message handling
2. **`lib/ollama-stream-handler.js`** - WebSocket real-time streaming
3. **`routes/ollama-session-routes.js`** - REST API endpoints

### Success Criteria

✅ Users can start/end sessions with accurate timers
✅ Messages logged with correct model/provider/cost
✅ Context successfully streams from Ollama → GPT-4 when switching domains
✅ End-of-session summary shows cost breakdown per client
✅ Integration with existing user_brands for custom branding
✅ Soulfra hash validates session integrity

---

## Consequences

### Positive Consequences

1. **Accurate Billing**: Track costs per client (Ollama = $0, GPT-4 = $$$)
2. **Session Continuity**: Context preserved when switching models
3. **Time Tracking**: Hourly billing for consulting work
4. **Audit Trail**: Complete record of all conversations
5. **Multi-Domain Support**: Work on multiple clients in one session
6. **Cryptographic Verification**: Soulfra hash proves authenticity
7. **Real-Time Streaming**: WebSocket enables chat-like experience

### Negative Consequences

1. **Database Growth**: 3 new tables, potentially large message history
2. **Complexity**: More moving parts than simple chat log
3. **Token Estimation**: Rough estimate for Ollama (no official token count)
4. **Storage Costs**: Full message content stored (could be large)

### Neutral Consequences

1. **Separate from `user_llm_usage`**: Distinct tracking (sessions vs. individual calls)
2. **PostgreSQL-only**: No support for other databases without migration

---

## Alternatives Considered

### Alternative 1: Single Table
**Description**: Store everything in one `ollama_sessions` table with JSONB for messages

**Pros**:
- Simpler schema (1 table instead of 3)
- Easier queries (no joins)

**Cons**:
- **Rejected because**: Hard to query individual messages, poor performance at scale, no referential integrity for context streams

### Alternative 2: Use Existing `user_llm_usage` Table
**Description**: Extend `user_llm_usage` to track sessions

**Pros**:
- Reuses existing table
- No migration needed

**Cons**:
- **Rejected because**: `user_llm_usage` is per-request, not per-session. Can't track timer, context streams, or multi-message conversations.

### Alternative 3: File-Based Storage (JSON/CSV)
**Description**: Store sessions as JSON files, parse for summaries

**Pros**:
- No database overhead
- Easy export

**Cons**:
- **Rejected because**: Can't query across sessions, no relational integrity, hard to integrate with domains/brands

---

## Related Decisions

- **Related to**: ADR-002 (dependency management - uses multi-llm-router.js)
- **Related to**: Migration 069 (user_brands table)
- **Related to**: Migration 070 (user_llm_usage table)
- **See also**: STARTUP-GUIDE.md, OLLAMA_SESSION_API.md

---

## Notes

### Implementation Checklist

- [x] Database migration (071_ollama_streaming_sessions.sql)
- [x] Session manager (lib/ollama-session-manager.js)
- [x] WebSocket handler (lib/ollama-stream-handler.js)
- [x] API routes (routes/ollama-session-routes.js)
- [ ] Guardian integration (lib/ollama-session-guardian.js)
- [ ] Soulfra signing (update session manager)
- [ ] Student tutorial (docs/OLLAMA_STREAMING_TUTORIAL.md)
- [ ] API reference (docs/OLLAMA_SESSION_API.md)
- [ ] Integration guide (docs/OLLAMA_SESSION_INTEGRATION.md)
- [x] STARTUP-GUIDE.md updates
- [x] Tests added (manual curl tests documented)
- [ ] Deployment plan (mount routes in router.js)

### Future Considerations

1. **Auto-Archive Old Sessions**: Move sessions >90 days to cold storage
2. **Token Counting**: Integrate tiktoken for accurate Ollama token counts
3. **Session Replay**: Recreate conversation from message history
4. **Export to CSV**: Download session summaries as spreadsheet
5. **Multi-User Sessions**: Collaborative sessions (multiple users, one session)
6. **Voice Integration**: Transcribe voice → text messages in sessions

### Monitor

- Session duration distribution (are most sessions <1hr or >5hr?)
- Context stream frequency (how often do users switch models?)
- Cost per client (which clients generate most LLM costs?)
- Stuck sessions (sessions started but never ended)
