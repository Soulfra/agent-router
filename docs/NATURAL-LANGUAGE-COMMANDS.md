# Natural Language Commands

> "People aren't going to want to learn our terms - use catch phrases or wake words"

## Overview

The CALOS platform provides natural language interfaces to AI systems, removing technical barriers and allowing users to interact using everyday language.

## Table of Contents

- [Quick Start](#quick-start)
- [CLI Tools](#cli-tools)
- [Wake Words](#wake-words)
- [Commands](#commands)
- [Examples](#examples)
- [Architecture](#architecture)

## Quick Start

### Installation

```bash
# Make CLIs accessible globally (optional)
ln -s /path/to/agent-router/bin/cal /usr/local/bin/cal
ln -s /path/to/agent-router/bin/ralph /usr/local/bin/ralph
```

### Basic Usage

```bash
# Ask Cal (Claude Code - FREE)
cal what's next?

# Ask Ralph (Ollama - FREE, privacy-first)
ralph compress this text into a haiku
```

## CLI Tools

### Cal - Claude Code Interface

Cal provides access to local Claude Code (desktop app subscription).

**Key Features:**
- ✅ FREE (local subscription, no API costs)
- ✅ Natural language commands
- ✅ Time-aware (knows today's date)
- ✅ Todo management integration
- ✅ Offline-capable

**Usage:**
```bash
cal <natural language input>
```

**Examples:**
```bash
# Todo management
cal what's next?
cal show me pending tasks
cal add buy groceries
cal mark done first task

# Time queries
cal what day is it?
cal what time is it?

# Data fetching
cal check price of bitcoin
cal get weather forecast

# General queries
cal help me debug this error
cal explain this code
```

### Ralph - Ollama Interface

Ralph provides access to local Ollama models with creative and compression capabilities.

**Key Features:**
- ✅ FREE (local models)
- ✅ Privacy-first (all processing local)
- ✅ Context compression (haiku mode)
- ✅ Creative tasks
- ✅ Works offline

**Usage:**
```bash
ralph <natural language input>
```

**Examples:**
```bash
# Context compression
ralph compress this long text into a haiku
ralph summarize this article

# Creative tasks
ralph write a story about...
ralph help me brainstorm ideas for...

# Model management
ralph what models are available?
ralph show available models

# General queries
ralph explain this concept
ralph help me understand...
```

## Wake Words

Wake words trigger specific AI instances and extract the prompt that follows.

### Available Wake Words

| Wake Word | Instance | Provider | Cost |
|-----------|----------|----------|------|
| hey cal, hi cal, ask cal | cal | Claude Code | FREE |
| hey ralph, hi ralph, ask ralph | ralph | Ollama | FREE |

### Examples

```bash
# Direct wake word usage
cal hey cal, what's next?           # Routes to Cal instance
ralph ask ralph about compression   # Routes to Ralph instance

# Wake words are optional when using CLI directly
cal what's next?                    # Implicit Cal instance
ralph compress text                 # Implicit Ralph instance
```

## Commands

Commands are natural language patterns that map to system actions.

### Todo Commands

**List Todos**
```bash
# Patterns: what's next, show todos, pending tasks
cal what's next?
cal whats next                      # Typos OK (fuzzy matching)
cal show me my todos
cal pending tasks
```

**Add Todo**
```bash
# Patterns: add to list, add task, create todo, remind me
cal add buy milk
cal add to list: call dentist
cal remind me to exercise
cal create task review code
```

**Mark Done**
```bash
# Patterns: mark done, complete, check off
cal mark done buy milk
cal complete first task
cal check off exercise
```

### Time Commands

**Current Time/Date**
```bash
# Patterns: what time is it, what day is it
cal what time is it?
cal what day is it?
cal whats the date?
cal current time
```

### Data Fetch Commands

**Check Price**
```bash
# Patterns: check price, what's the price, how much
cal check price of bitcoin
cal whats the price of ethereum
cal how much is a tesla stock?
```

**Fetch Data**
```bash
# Patterns: get data, fetch data, look up
cal get weather forecast
cal fetch latest news
cal look up information about...
```

### Help Commands

**Show Help**
```bash
# Patterns: help, what can you do, commands
cal help
cal what can you do?
cal show me commands
```

## Fuzzy Matching

Commands use fuzzy matching - "close enough" works!

### Tolerance Levels

- **Exact Match** (highest priority): 10x weight
- **Starts With**: 5x weight
- **Contains**: 3x weight
- **Fuzzy Distance**: 2x weight (Levenshtein distance ≤ 3)
- **Keyword Match**: 1x weight

### Examples

All of these work:
```bash
cal what's next?       # Exact
cal whats next         # Missing apostrophe
cal what is next       # Expanded contraction
cal wats next          # Typo (1 char distance)
cal show next          # Keyword match
```

## Time-Aware Queries

All AI instances are time-aware and know the **current** date, not just their training cutoff.

### How It Works

1. System injects current date/time into AI context
2. AI receives: "Today's Date: Tuesday, October 20, 2025 3:45 PM EDT"
3. AI can answer time-sensitive questions accurately

### Examples

```bash
# Time queries
cal what day is it?
# → "Today is Tuesday, October 20, 2025"

# Relative dates
cal remind me tomorrow
# → Creates todo with due date: October 21, 2025

# Fresh data (if web search enabled)
cal what's trending today?
# → Fetches fresh data from web, not training data
```

## Architecture

### Component Stack

```
┌─────────────────────────────────────┐
│         CLI (bin/cal, bin/ralph)    │
│  Natural language input from user   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│        Wake Word Router             │
│  - Fuzzy pattern matching           │
│  - Route to commands or AI          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────┐
│  Commands   │  │  AI Instances    │
│  - Todos    │  │  - Cal           │
│  - Time     │  │  - Ralph         │
│  - Data     │  │  - DeepThink     │
└─────────────┘  └──────────────────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────┐
│ Local Cache │  │ Multi-LLM Router │
│ DecisionTodo│  │ Provider Adapters│
└─────────────┘  └──────────────────┘
```

### Key Classes

**WakeWordRouter** (`lib/wake-word-router.js`)
- Natural language command routing
- Fuzzy pattern matching via FuzzyMatcher
- Wake word detection and extraction

**FuzzyMatcher** (`lib/fuzzy-matcher.js`)
- Levenshtein distance calculation
- Multiple matching strategies
- Confidence scoring

**TimeAwareAI** (`lib/time-aware-ai.js`)
- Injects current date/time into context
- Detects queries needing fresh data
- Calculates relative dates

**AIInstanceRegistry** (`lib/ai-instance-registry.js`)
- Manages named AI instances (cal, ralph, etc.)
- Tracks usage per instance
- Routes queries to appropriate provider

**LocalTodoCache** (`lib/local-todo-cache.js`)
- Hybrid local file + database
- Works offline
- Auto-syncs when connection restored

## Configuration

### Environment Variables

```bash
# Database (optional - system works without it)
DB_USER=matthewmauer
DB_HOST=localhost
DB_NAME=soulfra
DB_PORT=5432

# Ollama (required for Ralph)
OLLAMA_HOST=http://127.0.0.1:11434

# API Keys (optional - for non-local providers)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...
```

### Cache Location

Local cache stored at:
```
~/.calos/todos.json
```

## Troubleshooting

### "Database not available"

System works in local-only mode. Features still available:
- ✅ Natural language commands
- ✅ Local todo cache
- ✅ AI queries
- ❌ Database sync (pending writes queued for when DB available)

### "Ollama not running"

Start Ollama:
```bash
ollama serve
```

Check status:
```bash
ralph what models are available?
```

### "Claude Code CLI not available"

The Claude Code adapter will fall back to Anthropic API if:
- Claude Code CLI not installed
- `ANTHROPIC_API_KEY` environment variable set

For true local-only (FREE), install Claude Code desktop app.

### Fuzzy Matching Not Working

Check confidence threshold in FuzzyMatcher:
```javascript
const matcher = new FuzzyMatcher({
  maxDistance: 3,       // Max edit distance
  minSimilarity: 0.6    // 60% similarity required
});
```

Lower `minSimilarity` for more lenient matching.

## Best Practices

### Command Design

When adding new commands:

1. **Use multiple aliases**
   ```javascript
   patterns: [
     { pattern: 'what\'s next', aliases: ['whats next', 'show next', 'next task'] }
   ]
   ```

2. **Include keywords**
   ```javascript
   patterns: [
     { pattern: 'add task', keywords: ['add', 'create', 'new', 'task', 'todo'] }
   ]
   ```

3. **Test fuzzy variations**
   ```bash
   cal whats next    # Missing apostrophe
   cal wats next     # Typo
   cal show next     # Different verb
   ```

### Time-Aware Best Practices

1. **Always inject time context** for time-sensitive queries
2. **Use TimeAwareAI.smartQuery()** for automatic fresh data detection
3. **Calculate relative dates** using TimeAwareAI.calculateRelativeDate()

### Local-First Design

1. **Cache aggressively** - assume offline mode
2. **Queue writes** when database unavailable
3. **Sync opportunistically** when connection restored
4. **Provide feedback** about online/offline status

## Extension Guide

### Adding New Commands

1. Register in Wake Word Router:
```javascript
wakeWordRouter.registerCommand({
  name: 'my_command',
  patterns: [
    {
      pattern: 'do something',
      aliases: ['make it happen', 'perform action'],
      keywords: ['do', 'something', 'action']
    }
  ],
  action: 'my_action',
  handler: async (input, context) => {
    // Your logic here
    return {
      success: true,
      type: 'my_result',
      data: {...}
    };
  },
  description: 'Does something cool'
});
```

2. Handle in CLI display logic (bin/cal or bin/ralph)

### Adding New AI Instances

1. Create provider adapter (if needed)
2. Register instance:
```javascript
aiInstanceRegistry.registerInstance({
  name: 'myai',
  displayName: 'MyAI',
  provider: 'my-provider',
  model: 'my-model',
  personality: {
    style: 'Professional and friendly',
    expertise: ['coding', 'math'],
    catchphrases: ['Let me help with that'],
    values: ['Accuracy', 'Speed']
  },
  costProfile: {
    type: 'api',
    costPerToken: 0.001,
    free: false,
    source: 'MyAI API'
  },
  enabled: true
});
```

3. Add wake word:
```javascript
wakeWordRouter.registerWakeWord({
  name: 'myai',
  patterns: [{ pattern: 'hey myai' }],
  instance: 'myai',
  description: 'Trigger MyAI instance'
});
```

## See Also

- [MULTI-PROVIDER-AI-SYSTEM.md](./MULTI-PROVIDER-AI-SYSTEM.md) - Provider architecture
- [FRACTIONAL-AGENCY-GUIDE.md](./FRACTIONAL-AGENCY-GUIDE.md) - AI agency system
- [bin/cal](../bin/cal) - Cal CLI source
- [bin/ralph](../bin/ralph) - Ralph CLI source
