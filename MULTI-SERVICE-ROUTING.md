# Multi-Service Routing Architecture
## CalOS Agent Router - Complete System Documentation

**Version:** 2.0
**Last Updated:** 2025-10-15
**Status:** Complete Architecture Blueprint

---

## Table of Contents

- [Chapter 1: Domain Routing (Port 5001)](#chapter-1-domain-routing-port-5001)
- [Chapter 2: Service Interface Layer](#chapter-2-service-interface-layer)
- [Chapter 3: Multi-Port Ollama Architecture](#chapter-3-multi-port-ollama-architecture)
- [Chapter 4: Format Translation & Style Adaptation](#chapter-4-format-translation--style-adaptation)
- [Chapter 5: Packet Integrity & Loop-back Verification](#chapter-5-packet-integrity--loop-back-verification)
- [Chapter 6: Personal Config & Identity Layer](#chapter-6-personal-config--identity-layer)
- [Appendix A: Complete Routing Matrix](#appendix-a-complete-routing-matrix)
- [Appendix B: Protocol Wrapping (IANA Standards)](#appendix-b-protocol-wrapping-iana-standards)

---

## Architecture Overview

The CalOS Agent Router is not just a simple domain router - it's a **multi-layer, multi-port, multi-service routing system** that coordinates:

- **12 Domains** (soulfra.com, deathtodata.com, etc.)
- **5 Service Types** (Git, Copilot, Gaming, OCR, Standard)
- **5 Ollama Ports** (11434-11438, each optimized for different workloads)
- **4 Verification Layers** (Path encryption, session blocks, consensus, identity)

### The "PDF Chapters" Analogy

Think of this system like a PDF with multiple chapters:

1. **Chapter 1** = Domain Routing (the "table of contents" - which domain are you on?)
2. **Chapter 2** = Service Interfaces (which "section" - Git? Copilot? Gaming?)
3. **Chapter 3** = Multi-Port Ollama (which "page number" - which specialized port?)
4. **Chapter 4** = Format Translation (which "print style" - code? visual? protocol?)
5. **Chapter 5** = Packet Integrity (the "binding" - ensuring no pages are lost)
6. **Chapter 6** = Personal Config (the "reader" - who are you and what's your setup?)

Together, these layers create **12 domains × 5 services × 5 ports = 300 possible routing combinations**, where each combination is optimized for a specific use case.

---

## Chapter 1: Domain Routing (Port 5001)

### Overview

Port 5001 is the **main entry point** for all HTTP requests. It handles domain detection, brand identity, and initial routing.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Port 5001 - Express Server                │
│                    (Main Entry Point)                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Environment Router         │
              │  (middleware/environment-   │
              │   router.js)                │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Domain Detection           │
              │  req.hostname →             │
              │  soulfra.com?               │
              │  deathtodata.com?           │
              │  finishthisidea.com? ...    │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Domain Context Enricher    │
              │  (lib/domain-context-       │
              │   enricher.js)              │
              │  - Loads brand identity     │
              │  - Style guide              │
              │  - Anti-patterns            │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Multi-LLM Router           │
              │  (lib/multi-llm-router.js)  │
              │  - Task type detection      │
              │  - Model selection          │
              │  - Provider routing         │
              └─────────────────────────────┘
```

### The 12 Domains

| Domain | Brand | Category | Primary RADI | Colors |
|--------|-------|----------|--------------|--------|
| soulfra.com | Soulfra | Creative | creative | #667eea, #764ba2 (purple) |
| deathtodata.com | DeathToData | Interactive | interactive | #ef4444, #dc2626 (red) |
| finishthisidea.com | Finish This Idea | Interactive | interactive | #3b82f6, #2563eb (blue) |
| finishthisrepo.com | Finish This Repo | Technical | technical | #10b981, #059669 (green) |
| dealordelete.com | Deal or Delete | Interactive | interactive | #f59e0b, #d97706 (orange) |
| saveorsink.com | Save or Sink | Interactive | interactive | #06b6d4, #0891b2 (cyan) |
| cringeproof.com | Cringeproof | Social | social | #ec4899, #db2777 (pink) |
| ipomyagent.com | IPO My Agent | Publishing | publishing | #8b5cf6, #7c3aed (violet) |
| hollowtown.com | Hollowtown | Gaming | gaming | #6366f1, #4f46e5 (indigo) |
| hookclinic.com | Hook Clinic | Creative | creative | #14b8a6, #0d9488 (teal) |
| businessaiclassroom.com | Business AI Classroom | Technical | technical | #f97316, #ea580c (orange) |
| roughsparks.com | Rough Sparks | Creative | creative | #eab308, #ca8a04 (yellow) |

### Task Type Detection

The system infers task type from prompts and routes to optimized models:

```javascript
// From lib/multi-llm-router.js
_inferTaskType(prompt) {
  const lower = prompt.toLowerCase();

  if (lower.match(/code|function|class|debug|implement/))
    return 'code';

  if (lower.match(/create|design|imagine|story|creative/))
    return 'creative';

  if (lower.match(/analyze|reason|solve|logic|prove/))
    return 'reasoning';

  if (lower.match(/encrypt|decrypt|hash|sign|verify/))
    return 'cryptography';

  if (lower.match(/data|privacy|breach|normalize/))
    return 'data';

  // ... more patterns
}
```

### Model Selection Strategy

| Task Type | Preferred Provider | Ollama Model | Reason |
|-----------|-------------------|--------------|--------|
| code | Ollama → OpenAI | codellama:7b | Fast, accurate code generation |
| creative | Anthropic → Ollama | claude-3.5-sonnet | Best creative writing |
| reasoning | DeepSeek | deepseek-r1 | Chain-of-thought reasoning |
| cryptography | Ollama | soulfra-model | Custom crypto patterns |
| data | Ollama | deathtodata-model | Privacy-first data handling |
| calos | Triangle Consensus | (multi-model) | Multi-model debate |

**See DOMAIN-ROUTING-ARCHITECTURE.md for complete Chapter 1 details.**

---

## Chapter 2: Service Interface Layer

### Overview

Different services expect different **formats, protocols, and interaction styles**. The Service Interface Layer translates between CalOS's internal format and external service expectations.

### The 5 Service Types

```
┌─────────────────────────────────────────────────────────────┐
│                   Service Interface Layer                    │
│                 (Port 5001 → Service Adapters)               │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌────────┐          ┌────────┐         ┌────────┐
   │  Git   │          │Copilot │         │ Gaming │
   │ Service│          │Service │         │Service │
   └────────┘          └────────┘         └────────┘
        │                   │                   │
        ▼                   ▼                   ▼
   Port 11435          Port 11437          Port 11436
```

### 1. Git Service Interface

**Purpose**: Interact with GitHub repositories, pull requests, issues
**Existing Code**: `agents/github-agent.js`
**Protocol**: Git CLI wrapper + GitHub REST API
**Ollama Port**: 11435 (Git-optimized models)

**Expected Format**:
```javascript
{
  service: 'git',
  operation: 'pull_request' | 'issue' | 'commit' | 'diff',
  repository: 'owner/repo',
  context: {
    branch: 'main',
    files_changed: ['src/foo.js', 'src/bar.js'],
    diff: '...',
  },
  prompt: 'Review this pull request for security issues'
}
```

**Adapter Responsibilities**:
- ✅ Wrap GitHub CLI (`gh` commands)
- ✅ Parse git diffs and format for LLM
- ✅ Generate commit messages following repo conventions
- ✅ Local-first workflow (GitHub as read-only catalog)

**Current Implementation**:
```javascript
// From agents/github-agent.js (lines 1-50)
class GitHubAgent {
  async analyzePullRequest(owner, repo, prNumber) {
    // Step 1: Fetch PR diff
    const diff = await this.execGitHub(['pr', 'diff', prNumber]);

    // Step 2: Format for LLM
    const context = this.formatDiffForLLM(diff);

    // Step 3: Send to Git-optimized Ollama port
    const analysis = await this.sendToOllama({
      port: 11435,
      model: 'codellama:7b',
      context
    });

    // Step 4: Return structured feedback
    return this.parseAnalysis(analysis);
  }
}
```

### 2. Copilot Service Interface

**Purpose**: LSP-style code completion and autonomous building
**Existing Code**: `lib/autonomous-mode.js`
**Protocol**: Language Server Protocol (LSP) + custom extensions
**Ollama Port**: 11437 (Copilot/autonomous models)

**Expected Format**:
```javascript
{
  service: 'copilot',
  operation: 'complete' | 'build' | 'refactor',
  context: {
    file_path: 'src/components/Button.jsx',
    cursor_position: { line: 42, column: 10 },
    surrounding_code: '...',
    project_context: [...] // From code indexer
  },
  prompt: 'Generate a reusable Button component'
}
```

**Adapter Responsibilities**:
- ✅ Parse LSP requests (textDocument/completion, etc.)
- ✅ Search existing code patterns (code indexer)
- ✅ Run Triangle Consensus for quality
- ✅ Return LSP-formatted responses

**Current Implementation**:
```javascript
// From lib/autonomous-mode.js (lines 30-80)
class AutonomousMode {
  async handleRequest(prompt, options = {}) {
    // Step 1: Parse intent
    const intent = await this.parseIntent(prompt);

    // Step 2: Search existing code
    const existingCode = await this.codeIndexer.search(intent);

    // Step 3: Model debate (Triangle Consensus)
    const consensus = await this.council.debate(prompt, {
      context: existingCode,
      style: options.codingStyle || 'idiomatic'
    });

    // Step 4: Generate code
    const result = await this.builder.build(consensus);

    // Step 5: Format as LSP response
    return this.formatLSPResponse(result);
  }
}
```

### 3. Gaming Service Interface

**Purpose**: NPC interactions, game maps, coordinate systems
**Existing Code**: `lib/game-asset-builder.js`, `lib/npc-manager.js`
**Protocol**: Custom game API (coordinates, sprites, maps)
**Ollama Port**: 11436 (Gaming/visual models)

**Expected Format**:
```javascript
{
  service: 'gaming',
  operation: 'npc_dialogue' | 'map_generation' | 'asset_creation',
  context: {
    game_id: 'uuid',
    location: { x: 100, y: 200, map: 'hollowtown_square' },
    npc_id: 'uuid',
    player_state: { ... }
  },
  prompt: 'Generate dialogue for shopkeeper in Hollowtown'
}
```

**Adapter Responsibilities**:
- ✅ Manage game state (coordinates, inventories, NPCs)
- ✅ Generate sprites and assets
- ✅ Handle map tile generation
- ✅ Process image OCR for text extraction

### 4. OCR Service Interface

**Purpose**: Extract text from images (maps, screenshots, documents)
**Existing Code**: `routes/iiif-routes.js` (IIIF server with Sharp)
**Missing**: Tesseract OCR integration
**Protocol**: IIIF (International Image Interoperability Framework)
**Ollama Port**: 11436 (shares port with gaming - visual processing)

**Expected Format**:
```javascript
{
  service: 'ocr',
  operation: 'extract_text' | 'image_to_markdown' | 'translate_visual',
  context: {
    image_url: 'https://iiif.calos.local/image.jpg',
    language: 'eng',
    preprocessing: ['deskew', 'denoise', 'enhance']
  },
  prompt: 'Extract text from game map screenshot'
}
```

**Adapter Responsibilities**:
- ⚠️ **MISSING**: Tesseract OCR wrapper
- ✅ Image preprocessing (Sharp library)
- ✅ IIIF manifest generation
- ⚠️ **TODO**: Text extraction from images

### 5. Standard Service Interface

**Purpose**: General-purpose chat, simple queries
**Existing Code**: `lib/multi-llm-router.js`
**Protocol**: OpenAI-compatible API
**Ollama Port**: 11434 (default domain models)

**Expected Format**:
```javascript
{
  service: 'standard',
  operation: 'chat',
  context: {
    domain: 'soulfra.com',
    task_type: 'creative',
    conversation_history: [...]
  },
  prompt: 'Help me brainstorm ideas for a new app'
}
```

This is the default fallback for all non-specialized requests.

---

## Chapter 3: Multi-Port Ollama Architecture

### Overview

Currently, all Ollama models run on a **single port 11434**. The multi-port architecture separates models by **workload type**, allowing:

1. **Parallel processing** (Git analysis + OCR extraction simultaneously)
2. **Specialized optimization** (code models on 11435, visual models on 11436)
3. **Resource isolation** (heavy gaming tasks don't block Git operations)

### Current State (Single Port)

```
┌─────────────────────────────────────────────────────────────┐
│                    Port 11434 (Ollama)                       │
│  - codellama:7b                                              │
│  - soulfra-model                                             │
│  - deathtodata-model                                         │
│  - finishthisidea-model                                      │
│  - ... (all 12 domain models)                                │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                    All requests go here
```

**Problem**: One slow request (e.g., large image OCR) blocks all other requests.

### Target State (Multi-Port)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Port 11434   │  │ Port 11435   │  │ Port 11436   │  │ Port 11437   │  │ Port 11438   │
│              │  │              │  │              │  │              │  │              │
│ Domain       │  │ Git-Optimized│  │ Gaming/Visual│  │ Copilot/Auto │  │ Standards/   │
│ Models       │  │ Models       │  │ Models + OCR │  │ Models       │  │ Protocol     │
│              │  │              │  │              │  │              │  │ Models       │
│ - soulfra    │  │ - codellama  │  │ - llava      │  │ - codellama  │  │ - mistral    │
│ - deathtodata│  │ - starcoder  │  │ - bakllava   │  │ - deepseek   │  │ - phi        │
│ - finish...  │  │ - deepseek   │  │ - soulfra    │  │ - claude API │  │ - codellama  │
│ (all 12)     │  │              │  │ - custom vis │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
      ▲                 ▲                 ▲                 ▲                 ▲
      │                 │                 │                 │                 │
      │                 │                 │                 │                 │
  Standard         Git Service      Gaming/OCR        Copilot          Protocol
  Requests         Requests          Requests         Requests         Requests
```

### Port Assignments

| Port | Purpose | Models | Use Cases |
|------|---------|--------|-----------|
| **11434** | Domain-specific models | soulfra-model, deathtodata-model, finishthisidea-model, etc. (all 12 domains) | Standard chat, domain-branded responses, creative writing |
| **11435** | Git-optimized models | codellama:7b, starcoder:7b, deepseek-coder | PR reviews, commit messages, code analysis, diff interpretation |
| **11436** | Gaming/visual models | llava:7b, bakllava, soulfra-visual, Tesseract OCR | NPC dialogue, map generation, image OCR, sprite descriptions |
| **11437** | Copilot/autonomous models | codellama:13b, deepseek-coder-instruct, claude-3.5-sonnet (API) | Code completion, autonomous building, refactoring, LSP |
| **11438** | Standards/protocol models | mistral:7b, phi:3, codellama:7b | IANA protocol translation, RFC compliance, API schema generation |

### Setup Script Structure

```bash
#!/bin/bash
# scripts/setup-multi-port-ollama.sh

# Port 11434 - Domain Models (DEFAULT)
ollama serve --port 11434 &
sleep 2
ollama pull codellama:7b
ollama pull mistral:7b
# Pull all 12 custom domain models...

# Port 11435 - Git Models
OLLAMA_HOST=127.0.0.1:11435 ollama serve &
sleep 2
OLLAMA_HOST=127.0.0.1:11435 ollama pull codellama:7b
OLLAMA_HOST=127.0.0.1:11435 ollama pull starcoder:7b
OLLAMA_HOST=127.0.0.1:11435 ollama pull deepseek-coder:6.7b

# Port 11436 - Gaming/Visual Models
OLLAMA_HOST=127.0.0.1:11436 ollama serve &
sleep 2
OLLAMA_HOST=127.0.0.1:11436 ollama pull llava:7b
OLLAMA_HOST=127.0.0.1:11436 ollama pull bakllava

# Port 11437 - Copilot Models
OLLAMA_HOST=127.0.0.1:11437 ollama serve &
sleep 2
OLLAMA_HOST=127.0.0.1:11437 ollama pull codellama:13b
OLLAMA_HOST=127.0.0.1:11437 ollama pull deepseek-coder-instruct:6.7b

# Port 11438 - Protocol Models
OLLAMA_HOST=127.0.0.1:11438 ollama serve &
sleep 2
OLLAMA_HOST=127.0.0.1:11438 ollama pull mistral:7b
OLLAMA_HOST=127.0.0.1:11438 ollama pull phi:3

echo "✅ All 5 Ollama ports configured (11434-11438)"
```

### Router Logic Enhancement

```javascript
// lib/multi-llm-router.js enhancement
class MultiLLMRouter {
  _selectOllamaPort(request) {
    // Determine which Ollama port to use

    if (request.service === 'git') {
      return 11435; // Git-optimized
    }

    if (request.service === 'gaming' || request.service === 'ocr') {
      return 11436; // Visual processing
    }

    if (request.service === 'copilot') {
      return 11437; // Autonomous/LSP
    }

    if (request.protocol || request.format === 'rfc') {
      return 11438; // Standards/protocol
    }

    // Default: domain-specific models
    return 11434;
  }

  async _callOllama(request, port = 11434) {
    const baseUrl = `http://localhost:${port}`;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        context: request.context
      })
    });

    return response.json();
  }
}
```

---

## Chapter 4: Format Translation & Style Adaptation

### Overview

Different services expect different **response formats**. A Git service wants diffs and commit messages. A Copilot service wants LSP JSON. A gaming service wants coordinates and sprite data.

The Format Translation Layer converts between these formats.

### Translation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Incoming Request                          │
│  { service: 'git', prompt: 'Review PR #42' }                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Format Router              │
              │  (middleware/format-        │
              │   router.js)                │
              │  Detects expected format    │
              └─────────────┬───────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌────────┐          ┌────────┐         ┌────────┐
   │  Git   │          │  LSP   │         │ Game   │
   │ Format │          │ Format │         │ Format │
   └────┬───┘          └────┬───┘         └────┬───┘
        │                   │                   │
        ▼                   ▼                   ▼
   Send to Port         Send to Port      Send to Port
     11435                 11437              11436
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │  LLM Processing             │
              │  (Ollama/Claude/DeepSeek)   │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Response Translator        │
              │  Converts LLM response      │
              │  back to expected format    │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Formatted Response         │
              │  { diff: '...', message: '' }│
              └─────────────────────────────┘
```

### Format Types

#### 1. Git Format

**Input**:
```javascript
{
  service: 'git',
  operation: 'commit_message',
  context: {
    diff: `
      diff --git a/src/auth.js b/src/auth.js
      + const bcrypt = require('bcrypt');
      + const saltRounds = 10;
    `,
    recent_commits: [
      'Add user registration',
      'Fix login validation'
    ]
  }
}
```

**Expected Output**:
```javascript
{
  commit_message: 'Add password hashing with bcrypt\n\nImplements secure password storage using bcrypt with 10 salt rounds.',
  confidence: 0.95,
  follows_convention: true
}
```

#### 2. LSP Format (Language Server Protocol)

**Input**:
```javascript
{
  service: 'copilot',
  operation: 'complete',
  context: {
    textDocument: {
      uri: 'file:///src/Button.jsx',
      version: 1
    },
    position: {
      line: 10,
      character: 5
    },
    surrounding_code: 'function Button({ children, '
  }
}
```

**Expected Output** (LSP CompletionList):
```javascript
{
  isIncomplete: false,
  items: [
    {
      label: 'onClick',
      kind: 5, // Field
      detail: '(event: MouseEvent) => void',
      documentation: 'Click handler function',
      insertText: 'onClick',
      sortText: '0'
    },
    {
      label: 'className',
      kind: 5,
      detail: 'string',
      insertText: 'className',
      sortText: '1'
    }
  ]
}
```

#### 3. Game Format

**Input**:
```javascript
{
  service: 'gaming',
  operation: 'npc_dialogue',
  context: {
    npc_id: 'shopkeeper_01',
    location: { x: 120, y: 80, map: 'hollowtown_square' },
    player_state: {
      gold: 50,
      inventory: ['sword', 'potion']
    },
    conversation_history: []
  },
  prompt: 'Player asks about buying armor'
}
```

**Expected Output**:
```javascript
{
  dialogue: "Ah, armor ye seek? I've got chainmail for 30 gold, or leather for 15.",
  actions: [
    { type: 'offer', item: 'chainmail', price: 30 },
    { type: 'offer', item: 'leather_armor', price: 15 }
  ],
  emotion: 'friendly',
  next_dialogue_ids: ['shopkeeper_01_buy', 'shopkeeper_01_decline']
}
```

#### 4. OCR Format

**Input**:
```javascript
{
  service: 'ocr',
  operation: 'extract_text',
  context: {
    image_url: 'https://iiif.calos.local/map_screenshot.png',
    preprocessing: ['deskew', 'enhance'],
    language: 'eng'
  }
}
```

**Expected Output**:
```javascript
{
  text: 'Hollowtown Square\nShopkeeper\nBlacksmith\nInn',
  confidence: 0.88,
  bounding_boxes: [
    { text: 'Hollowtown Square', x: 10, y: 10, w: 200, h: 30 },
    { text: 'Shopkeeper', x: 50, y: 100, w: 100, h: 20 }
  ],
  language: 'eng'
}
```

#### 5. Protocol Format (IANA/RFC)

**Input**:
```javascript
{
  service: 'standard',
  format: 'rfc',
  operation: 'validate_http_headers',
  context: {
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value'
    }
  },
  prompt: 'Check if these HTTP headers are valid'
}
```

**Expected Output**:
```javascript
{
  valid: true,
  warnings: [
    'X-Custom-Header is non-standard (consider using standard headers)'
  ],
  references: [
    'RFC 7231 - HTTP/1.1 Semantics',
    'RFC 6648 - Deprecating X- prefix'
  ],
  suggestions: [
    'Consider renaming X-Custom-Header to Custom-Header'
  ]
}
```

### Middleware Implementation

```javascript
// middleware/format-router.js
class FormatRouter {
  route(req, res, next) {
    // Detect expected format from request
    const service = req.body.service || 'standard';

    // Attach format translator
    req.formatTranslator = this.getTranslator(service);

    // Attach response formatter
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      const formatted = req.formatTranslator.format(data);
      return originalJson(formatted);
    };

    next();
  }

  getTranslator(service) {
    switch (service) {
      case 'git':
        return new GitFormatTranslator();
      case 'copilot':
        return new LSPFormatTranslator();
      case 'gaming':
        return new GameFormatTranslator();
      case 'ocr':
        return new OCRFormatTranslator();
      default:
        return new StandardFormatTranslator();
    }
  }
}
```

---

## Chapter 5: Packet Integrity & Loop-back Verification

### Overview

The user's requirement: **"making sure it all loops back into valid stuff like packets so no packet loss"**

CalOS implements **path-based encryption** and **session block management** to ensure:

1. Every request/response is **verifiable**
2. No packets are lost or tampered with
3. Complete audit trail of all interactions
4. Forward secrecy (can't decrypt without exact interaction sequence)

### Architecture: The "Loop-back" System

```
┌─────────────────────────────────────────────────────────────┐
│                    User Request                              │
│  "Generate code for authentication"                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 1: Challenge           │
              │  Generate unique challenge   │
              │  hash for this request       │
              │  challenge_hash = SHA256(    │
              │    request + timestamp +     │
              │    session_id                │
              │  )                           │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 2: LLM Processing      │
              │  Send to Ollama/Claude/etc.  │
              │  (includes challenge_hash)   │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 3: Response Hash       │
              │  response_hash = SHA256(     │
              │    llm_response +            │
              │    challenge_hash            │
              │  )                           │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 4: Proof-of-Work       │
              │  Find nonce such that:       │
              │  SHA256(response_hash +      │
              │         nonce) starts with   │
              │  '00000' (difficulty=5)      │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 5: Store Block         │
              │  INSERT INTO                 │
              │    encryption_paths          │
              │  (challenge_hash,            │
              │   response_hash, nonce,      │
              │   key_fragment)              │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 6: Verify Loop-back    │
              │  Check:                      │
              │  1. Block chain valid?       │
              │  2. All hashes match?        │
              │  3. No blocks missing?       │
              │  4. PoW correct?             │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 7: Return Response     │
              │  Response + integrity proof  │
              └─────────────────────────────┘
```

### Blockchain-Style Session Tracking

Each interaction creates a **block** in a session-specific blockchain:

```javascript
// From lib/session-block-manager.js
class SessionBlockManager {
  async addBlock(sessionId, challengeHash, responseHash, nonce) {
    // Get previous block
    const prevBlock = await this.getLatestBlock(sessionId);
    const blockIndex = prevBlock ? prevBlock.block_index + 1 : 0;

    // Calculate key fragment (from path)
    const keyFragment = this.deriveKeyFragment(
      challengeHash,
      responseHash,
      nonce
    );

    // Insert block
    await this.db.query(`
      INSERT INTO encryption_paths (
        session_id, block_index,
        challenge_hash, response_hash,
        pow_nonce, pow_difficulty,
        key_fragment, previous_block_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      sessionId, blockIndex,
      challengeHash, responseHash,
      nonce, this.difficulty,
      keyFragment, prevBlock?.response_hash
    ]);
  }

  async verifyChain(sessionId) {
    const blocks = await this.getSessionPath(sessionId);

    // Verify each block links to previous
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1];
      const curr = blocks[i];

      if (curr.previous_block_hash !== prev.response_hash) {
        throw new Error(`Block ${i} doesn't link to previous block`);
      }

      // Verify proof-of-work
      const pow = crypto.createHash('sha256')
        .update(curr.response_hash + curr.pow_nonce)
        .digest('hex');

      if (!pow.startsWith('0'.repeat(curr.pow_difficulty))) {
        throw new Error(`Block ${i} has invalid PoW`);
      }
    }

    return true; // No packet loss!
  }
}
```

### Path-Based Encryption

The encryption key is derived from the **entire conversation path**:

```javascript
// From lib/path-based-encryption.js
class PathBasedEncryption {
  async deriveSessionKey(sessionId) {
    // Get all blocks in session
    const path = await this.getSessionPath(sessionId);

    // Concatenate all key fragments
    const combinedKey = path
      .map(block => block.key_fragment)
      .join('');

    // Final key = HMAC of all fragments
    const sessionKey = crypto
      .createHmac('sha256', this.masterSecret)
      .update(combinedKey)
      .digest();

    return sessionKey;
  }

  async encrypt(sessionId, data) {
    const key = await this.deriveSessionKey(sessionId);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  async decrypt(sessionId, encrypted, iv, authTag) {
    const key = await this.deriveSessionKey(sessionId);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }
}
```

**Key Properties**:

1. **Forward Secrecy**: Each session has unique key derived from interaction path
2. **Verifiable**: Can't decrypt without exact sequence of challenges/responses
3. **No Packet Loss**: Missing block = broken chain = decryption fails
4. **Audit Trail**: Complete history of all interactions stored as blocks

### Database Schema

```sql
-- From database/migrations/013_add_path_encryption.sql
CREATE TABLE encryption_paths (
  path_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  block_index INT NOT NULL,

  -- Challenge/Response hashes (blockchain-style)
  challenge_hash VARCHAR(64) NOT NULL,
  response_hash VARCHAR(64) NOT NULL,
  previous_block_hash VARCHAR(64), -- Links to previous block

  -- Proof-of-Work
  pow_nonce VARCHAR(64) NOT NULL,
  pow_difficulty INT DEFAULT 5,

  -- Key derivation
  key_fragment VARCHAR(128) NOT NULL, -- Part of session key

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, block_index)
);

CREATE INDEX idx_encryption_paths_session
  ON encryption_paths(session_id, block_index);
```

### Loop-back Verification API

```javascript
// Example: Verify a session has no packet loss
app.get('/api/sessions/:sessionId/verify', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify blockchain integrity
    const sessionBlockManager = new SessionBlockManager(db);
    await sessionBlockManager.verifyChain(sessionId);

    // Get session stats
    const blocks = await sessionBlockManager.getSessionPath(sessionId);

    res.json({
      valid: true,
      no_packet_loss: true,
      block_count: blocks.length,
      first_block: blocks[0]?.created_at,
      last_block: blocks[blocks.length - 1]?.created_at,
      chain_verified: true
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      no_packet_loss: false,
      error: error.message
    });
  }
});
```

---

## Chapter 6: Personal Config & Identity Layer

### Overview

The user's question: **"how its figuring out its our personal config to open that account or whatever"**

CalOS uses multiple identity layers to know "this is YOUR account" and load appropriate configuration:

1. **Handle Registry** (@username system)
2. **Vault Bridge** (personal API keys, secrets)
3. **Biometric Auth** (fingerprint, face ID)
4. **Soulfra Signing** (cryptographic identity)
5. **Session Management** (encrypted session paths)

### Identity Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Authentication                       │
│  "Who are you?"                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐        ┌─────────┐
   │ Handle  │         │Biometric│        │ Soulfra │
   │ @user   │         │ Auth    │        │ Signing │
   └────┬────┘         └────┬────┘        └────┬────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │  Identity Resolved          │
              │  user_id = 'uuid'           │
              │  handle = '@matthew'        │
              │  biometric_verified = true  │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Load Personal Config       │
              │  - API keys (Vault)         │
              │  - Preferred models         │
              │  - Domain preferences       │
              │  - Custom patterns          │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Create Session             │
              │  session_id = 'uuid'        │
              │  encrypted with user's key  │
              └─────────────────────────────┘
```

### 1. Handle Registry (@username)

```javascript
// From lib/handle-registry.js
class HandleRegistry {
  async registerHandle(handle, userId, publicKey) {
    // Check handle availability
    const existing = await this.db.query(
      'SELECT * FROM handle_registry WHERE handle = $1',
      [handle]
    );

    if (existing.rows.length > 0) {
      throw new Error(`Handle ${handle} already taken`);
    }

    // Register handle
    await this.db.query(`
      INSERT INTO handle_registry (
        handle, user_id, public_key, status
      ) VALUES ($1, $2, $3, 'active')
    `, [handle, userId, publicKey]);

    return { handle, user_id: userId };
  }

  async resolveHandle(handle) {
    const result = await this.db.query(
      'SELECT user_id, public_key FROM handle_registry WHERE handle = $1',
      [handle]
    );

    if (result.rows.length === 0) {
      throw new Error(`Handle ${handle} not found`);
    }

    return result.rows[0];
  }
}
```

### 2. Vault Bridge (Personal API Keys)

```javascript
// From lib/vault-bridge.js
class VaultBridge {
  async getAPIKey(userId, provider) {
    // Fetch from encrypted vault
    const result = await this.db.query(`
      SELECT encrypted_key, iv, auth_tag
      FROM user_vault
      WHERE user_id = $1 AND key_name = $2
    `, [userId, `${provider}_api_key`]);

    if (result.rows.length === 0) {
      return null; // No key stored
    }

    // Decrypt using user's session key
    const { encrypted_key, iv, auth_tag } = result.rows[0];
    const sessionKey = await this.getSessionKey(userId);

    const decrypted = await this.decrypt(
      encrypted_key,
      iv,
      auth_tag,
      sessionKey
    );

    return decrypted;
  }

  async setAPIKey(userId, provider, apiKey) {
    // Encrypt with user's session key
    const sessionKey = await this.getSessionKey(userId);
    const { encrypted, iv, authTag } = await this.encrypt(apiKey, sessionKey);

    // Store in vault
    await this.db.query(`
      INSERT INTO user_vault (
        user_id, key_name, encrypted_key, iv, auth_tag
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, key_name) DO UPDATE
        SET encrypted_key = $3, iv = $4, auth_tag = $5
    `, [userId, `${provider}_api_key`, encrypted, iv, authTag]);
  }
}
```

### 3. Biometric Authentication

```javascript
// From lib/biometric-auth.js
class BiometricAuth {
  async verify(userId, biometricData) {
    // Get stored biometric template
    const result = await this.db.query(
      'SELECT template_hash FROM biometric_auth WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('No biometric template registered');
    }

    const storedHash = result.rows[0].template_hash;

    // Compare biometric data (using secure comparison)
    const providedHash = await this.hashBiometric(biometricData);
    const match = crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(providedHash, 'hex')
    );

    if (!match) {
      throw new Error('Biometric verification failed');
    }

    return { verified: true, user_id: userId };
  }
}
```

### 4. Soulfra Signing (Cryptographic Identity)

```javascript
// From lib/soulfra-signer.js
class SoulfraSigner {
  async signRequest(userId, requestData) {
    // Get user's private key (from vault)
    const privateKey = await this.vault.getPrivateKey(userId);

    // Sign request
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(JSON.stringify(requestData))
      .sign(privateKey, 'hex');

    return {
      ...requestData,
      signature,
      signer: userId,
      signed_at: new Date().toISOString()
    };
  }

  async verifySignature(signedRequest) {
    const { signature, signer, ...data } = signedRequest;

    // Get signer's public key
    const publicKey = await this.handleRegistry.getPublicKey(signer);

    // Verify signature
    const valid = crypto
      .createVerify('RSA-SHA256')
      .update(JSON.stringify(data))
      .verify(publicKey, signature, 'hex');

    if (!valid) {
      throw new Error('Invalid signature');
    }

    return { valid: true, signer };
  }
}
```

### Personal Config Loading

Once identity is verified, load user's personal configuration:

```javascript
// Personal config structure
{
  user_id: 'uuid',
  handle: '@matthew',
  preferences: {
    default_domain: 'soulfra.com',
    preferred_models: {
      code: 'codellama:7b',
      creative: 'claude-3.5-sonnet',
      reasoning: 'deepseek-r1'
    },
    api_keys: {
      openai: 'sk-...', // From vault
      anthropic: 'sk-ant-...',
      deepseek: 'sk-...'
    },
    custom_patterns: [
      {
        name: 'React Component',
        template: '...',
        triggers: ['component', 'react']
      }
    ],
    gaming: {
      active_character_id: 'uuid',
      home_map: 'hollowtown_square',
      inventory_id: 'uuid'
    }
  },
  session: {
    session_id: 'uuid',
    encryption_key: '...', // Derived from path
    created_at: '2025-10-15T...',
    last_activity: '2025-10-15T...'
  }
}
```

### Middleware: Identity Resolver

```javascript
// middleware/identity-resolver.js
class IdentityResolver {
  async resolve(req, res, next) {
    try {
      // Step 1: Extract identity from request
      const handle = req.headers['x-handle'];
      const biometric = req.headers['x-biometric'];
      const signature = req.headers['x-signature'];

      // Step 2: Resolve handle to user_id
      const { user_id, public_key } = await this.handleRegistry.resolveHandle(handle);

      // Step 3: Verify biometric (if provided)
      if (biometric) {
        await this.biometricAuth.verify(user_id, biometric);
      }

      // Step 4: Verify signature (if provided)
      if (signature) {
        await this.soulfraSigner.verifySignature({
          ...req.body,
          signature,
          signer: user_id
        });
      }

      // Step 5: Load personal config
      const config = await this.loadPersonalConfig(user_id);

      // Step 6: Attach to request
      req.user = {
        user_id,
        handle,
        config,
        verified: true
      };

      next();
    } catch (error) {
      res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    }
  }
}
```

---

## Appendix A: Complete Routing Matrix

### The 300 Routing Combinations

**12 Domains × 5 Services × 5 Ports = 300 combinations**

Example combinations:

| Domain | Service | Port | Model | Use Case |
|--------|---------|------|-------|----------|
| soulfra.com | standard | 11434 | soulfra-model | Creative writing with purple brand |
| soulfra.com | git | 11435 | codellama:7b | PR review with Soulfra style guide |
| soulfra.com | gaming | 11436 | llava:7b | Visual NPC dialogue in Soulfra game |
| deathtodata.com | standard | 11434 | deathtodata-model | Privacy-focused chat with red brand |
| deathtodata.com | ocr | 11436 | tesseract + llava | Extract text from privacy documents |
| finishthisrepo.com | git | 11435 | starcoder:7b | Code completion for repo |
| finishthisrepo.com | copilot | 11437 | deepseek-coder | Autonomous code generation |
| hollowtown.com | gaming | 11436 | soulfra-visual | Game map generation |
| hollowtown.com | ocr | 11436 | tesseract | OCR on game screenshots |

### Routing Decision Tree

```
Request arrives
│
├─ Domain detected? → Load domain context (colors, style, anti-patterns)
│
├─ Service type detected?
│  ├─ git → Port 11435, Git adapter, Git format
│  ├─ copilot → Port 11437, LSP adapter, LSP format
│  ├─ gaming → Port 11436, Game adapter, Game format
│  ├─ ocr → Port 11436, OCR adapter, OCR format
│  └─ standard → Port 11434, Standard adapter, OpenAI format
│
├─ Task type detected? → Select model (code, creative, reasoning, etc.)
│
├─ User identity verified? → Load personal config (API keys, preferences)
│
├─ Session path verified? → Check blockchain integrity (no packet loss)
│
└─ Send to appropriate Ollama port + format response
```

---

## Appendix B: Protocol Wrapping (IANA Standards)

### IANA Integration

The user mentioned: **"we are also wrapping the iana.org and whatever else too"**

IANA (Internet Assigned Numbers Authority) maintains:
- Port numbers (11434-11438 are in the "Dynamic/Private" range 49152-65535... actually no, they're in the registered range)
- Protocol standards
- HTTP headers
- Media types

### Port 11438: Standards/Protocol Models

This port handles:

1. **RFC Compliance Checking**
2. **HTTP Header Validation**
3. **API Schema Generation** (OpenAPI, JSON Schema)
4. **Protocol Translation** (REST → GraphQL, SOAP → REST, etc.)

### Example: HTTP Header Validation

```javascript
// Service running on Port 11438
class ProtocolValidator {
  async validateHTTPHeaders(headers) {
    // Send to Protocol-optimized model
    const response = await fetch('http://localhost:11438/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mistral:7b',
        prompt: `
          Validate these HTTP headers against IANA standards and RFCs:

          ${JSON.stringify(headers, null, 2)}

          Check:
          1. Are all headers valid per IANA registry?
          2. Are deprecated headers used? (e.g., X- prefix)
          3. Are required headers missing?
          4. RFC references for each header

          Return JSON format:
          {
            "valid": true/false,
            "warnings": [...],
            "errors": [...],
            "references": ["RFC 7231", ...]
          }
        `
      })
    });

    return response.json();
  }
}
```

### Example: OpenAPI Schema Generation

```javascript
// Generate OpenAPI spec from code
class SchemaGenerator {
  async generateOpenAPISpec(routeCode) {
    const response = await fetch('http://localhost:11438/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'codellama:7b',
        prompt: `
          Generate OpenAPI 3.0 spec for this Express route:

          ${routeCode}

          Follow OpenAPI standards and include:
          - Request/response schemas
          - Status codes
          - Examples
          - Security requirements
        `
      })
    });

    return response.json();
  }
}
```

### IANA Port Registry Consideration

**Current Ports**:
- 11434-11438 are in the **"registered" range** (1024-49151)
- Should we register with IANA?
- Or use dynamic range (49152-65535)?

**Recommendation**: Keep 11434-11438 for local development. For production, consider dynamic range or official registration.

---

## Implementation Roadmap

### Phase 1: Multi-Port Ollama Setup ✅ (Next)
1. Create `scripts/setup-multi-port-ollama.sh`
2. Test running 5 Ollama instances simultaneously
3. Update `lib/multi-llm-router.js` to route by port

### Phase 2: Service Adapters ⚠️
1. `lib/service-adapters/git-adapter.js`
2. `lib/service-adapters/copilot-adapter.js`
3. `lib/service-adapters/gaming-adapter.js`
4. `lib/service-adapters/ocr-adapter.js` (requires Tesseract integration)

### Phase 3: Format Translation ⚠️
1. `middleware/format-router.js`
2. Format translators for each service type
3. LSP compliance testing

### Phase 4: OCR Integration ⚠️
1. Install Tesseract (`brew install tesseract` or `apt install tesseract-ocr`)
2. Add Tesseract wrapper to `lib/service-adapters/ocr-adapter.js`
3. Integrate with IIIF routes (`routes/iiif-routes.js`)

### Phase 5: Documentation ⚠️
1. This document (MULTI-SERVICE-ROUTING.md) ✅
2. API documentation for each service adapter
3. Deployment guide for multi-port setup

---

## Quick Start Guide

### Running the Complete System

```bash
# 1. Start all 5 Ollama ports
./scripts/setup-multi-port-ollama.sh

# 2. Start main router (port 5001)
npm run start

# 3. Verify all ports are running
curl http://localhost:11434/api/tags  # Domain models
curl http://localhost:11435/api/tags  # Git models
curl http://localhost:11436/api/tags  # Gaming/visual models
curl http://localhost:11437/api/tags  # Copilot models
curl http://localhost:11438/api/tags  # Protocol models

# 4. Test domain routing
curl -H "Host: soulfra.com" http://localhost:5001/api/chat \
  -d '{"prompt": "Create a purple button"}'

# 5. Test Git service
curl -H "Host: finishthisrepo.com" http://localhost:5001/api/chat \
  -d '{"service": "git", "operation": "commit_message", "context": {"diff": "..."}}'

# 6. Test session integrity
curl http://localhost:5001/api/sessions/{session_id}/verify
```

---

## Conclusion

This multi-service routing architecture transforms CalOS from a simple domain router into a sophisticated, multi-port, multi-service system that:

1. **Routes by domain** (12 brands, each with unique identity)
2. **Routes by service** (Git, Copilot, Gaming, OCR, Standard)
3. **Routes by port** (5 specialized Ollama instances)
4. **Translates formats** (LSP, Git, Game API, OCR, Protocol)
5. **Verifies integrity** (Path-based encryption, blockchain-style sessions)
6. **Personalizes config** (Handle registry, vault, biometric auth)

The result: **300 routing combinations**, each optimized for a specific use case, all coordinated through a single entry point (port 5001) and verified through a blockchain-style integrity system ensuring "no packet loss."

**Next Steps**: Implement Phase 1 (Multi-Port Ollama Setup) and begin testing the complete routing matrix.

---

**Document Version:** 2.0
**Generated:** 2025-10-15
**Authors:** CalOS Team
**Status:** Architecture Blueprint - Ready for Implementation
