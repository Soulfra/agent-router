# Cal Autonomous Coding System

Cal now writes and debugs code autonomously using Ollama. This is a complete system for autonomous software development with learning capabilities.

## Overview

Cal is an AI agent that:
- **Writes code** using Ollama based on task specifications
- **Debugs code** autonomously when errors occur
- **Learns** from successes and failures
- **Reflects** on its work to improve over time
- **Breaks down** complex tasks into steps
- **Uses templates** for proven patterns

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CAL AUTONOMOUS SYSTEM                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐         ┌──────▼──────┐      ┌──────▼──────┐
   │Knowledge│         │  Learning   │      │    Ollama   │
   │  Base   │◄────────│   System    │──────►│ calos-expert│
   │(SQLite) │         │  (SQLite)   │      │     Model   │
   └────┬────┘         └──────┬──────┘      └──────┬──────┘
        │                     │                     │
        └──────────┬──────────┴──────────┬──────────┘
                   │                     │
           ┌───────▼────────┐    ┌───────▼────────┐
           │ Code Writer    │    │   Debugger     │
           │ Task Delegator │    │ Self-Reflection│
           └────────────────┘    └────────────────┘
```

## Components

### 1. Knowledge Base (`lib/cal-knowledge-base.js`)

Cal's brain - stores everything Cal knows.

**Pre-loaded Knowledge:**
- DNS recursion patterns (loop prevention, max_depth)
- Token counting (tiktoken, API limits)
- OAuth flows (authorization code, token exchange)
- Common patterns (file I/O, async loops, error handling)
- Anti-patterns (infinite loops, memory leaks)

**Usage:**
```javascript
const kb = new CalKnowledgeBase();
await kb.init();

// Query knowledge
const dnsKnowledge = await kb.query('dns', 'recursive');
console.log(dnsKnowledge.patterns); // Best practices
console.log(dnsKnowledge.antiPatterns); // Mistakes to avoid
console.log(dnsKnowledge.examples); // Code examples
```

### 2. Learning System (`lib/cal-learning-system.js`)

Cal's memory - records every success and failure.

**Features:**
- Records task attempts with outcomes
- Tracks patterns that work/fail
- Calculates success rates
- Provides relevant lessons for new tasks

**Usage:**
```javascript
const learning = new CalLearningSystem();
await learning.init();

// Record success
await learning.recordSuccess('oauth-server', 'Built working OAuth flow', {
  whatWorked: 'Used simple-oauth2 library',
  lesson: 'Authorization code flow is most secure',
  confidence: 0.9
});

// Get lessons for similar task
const lessons = await learning.getRelevantLessons('oauth', 5);
```

### 3. Code Writer (`lib/cal-code-writer.js`)

Cal's hands - writes code autonomously.

**Workflow:**
1. Gathers knowledge from knowledge base
2. Reviews past lessons on similar tasks
3. Builds comprehensive prompt for Ollama
4. Generates code using `calos-expert` model
5. Validates syntax with `node --check`
6. Records attempt in learning system
7. Retries up to 3 times if needed

**Usage:**
```javascript
const writer = new CalCodeWriter({
  knowledgeBase,
  learningSystem
});

const result = await writer.writeFile('lib/oauth-server.js', {
  type: 'oauth-server',
  description: 'OAuth redirect server for Google and GitHub',
  features: ['authorization_code', 'token_exchange', 'callback_handling']
});

if (result.success) {
  console.log(`✅ Cal wrote ${result.filePath} in ${result.attempt} attempts`);
}
```

### 4. Debugger (`lib/cal-debugger.js`)

Cal's diagnostic tool - fixes bugs autonomously.

**Workflow:**
1. Receives error message and failing code
2. Gathers debugging knowledge (common causes)
3. Reviews past similar errors and fixes
4. Uses Ollama to analyze the error
5. Generates fix
6. Tests fix with `node --check`
7. Retries up to 3 times if needed
8. Records debugging attempt

**Usage:**
```javascript
const debugger = new CalDebugger({
  knowledgeBase,
  learningSystem
});

const result = await debugger.debug({
  filePath: 'lib/broken-code.js',
  errorMessage: 'ReferenceError: foo is not defined',
  code: '...',
  context: { taskType: 'oauth-server' }
});

if (result.success) {
  console.log(`✅ Cal fixed bug: ${result.reasoning}`);
  await debugger.applyFix(result.filePath, result.fixedCode);
}
```

### 5. Task Delegator (`lib/cal-task-delegator.js`)

Cal's planner - breaks down complex tasks.

**Features:**
- Breaks tasks into 5-10 actionable steps
- Identifies dependencies between steps
- Estimates complexity (low/medium/high)
- Prioritizes steps
- Suggests approach based on knowledge

**Usage:**
```javascript
const delegator = new CalTaskDelegator({
  knowledgeBase,
  learningSystem
});

const plan = await delegator.breakDown({
  description: 'Build OAuth server for Google and GitHub',
  type: 'oauth-server',
  constraints: ['Must use localhost:3000', 'Save tokens to .env']
});

console.log(`Task broken into ${plan.totalSteps} steps`);
plan.steps.forEach(step => {
  console.log(`${step.step}. [${step.complexity}] ${step.task}`);
});
```

### 6. Self-Reflection (`lib/cal-self-reflection.js`)

Cal's self-improvement system.

**Features:**
- Reviews recent task attempts
- Identifies patterns in successes/failures
- Uses Ollama to extract lessons
- Updates knowledge base with new patterns
- Generates actionable improvements

**Usage:**
```javascript
const reflection = new CalSelfReflection({
  knowledgeBase,
  learningSystem
});

const result = await reflection.reflect({ period: '7d' });

console.log(`Success rate: ${result.stats.successRate * 100}%`);
result.improvements.forEach(imp => {
  console.log(`${imp.priority}: ${imp.action}`);
});
```

## Code Templates

Located in `templates/`:

1. **express-server.template.js** - For building web servers, APIs
2. **data-processor.template.js** - For data transformation, ETL
3. **api-client.template.js** - For API integrations

Templates use `{{PLACEHOLDER}}` syntax for customization.

## CLI Tools

### `bin/cal-teach` - Teach Cal New Concepts

```bash
# Teach a concept
cal-teach concept dns recursive "Recursive DNS follows CNAME chains"

# Teach a pattern
cal-teach pattern tokens counting "Always use tiktoken for accurate counts"

# Teach an anti-pattern
cal-teach anti-pattern loops infinite "Never use while(true) without break"

# Teach a lesson
cal-teach lesson oauth "Save tokens to .env immediately"

# Teach by example
cal-teach example oauth authCode "OAuth flow" ./oauth-example.js

# View Cal's stats
cal-teach stats

# Trigger self-reflection
cal-teach reflect --period 7d

# List knowledge
cal-teach list dns

# Search knowledge
cal-teach search "recursive"
```

## Complete Workflow Example

```javascript
// 1. Initialize Cal's systems
const knowledgeBase = new CalKnowledgeBase();
const learningSystem = new CalLearningSystem();
await knowledgeBase.init();
await learningSystem.init();

// 2. Break down task
const delegator = new CalTaskDelegator({ knowledgeBase, learningSystem });
const plan = await delegator.breakDown({
  description: 'Build token counter utility',
  type: 'token-counter',
  features: ['Count tokens', 'Support GPT-4 and Claude', 'Validate input']
});

console.log(`Task plan: ${plan.totalSteps} steps`);

// 3. Write code
const writer = new CalCodeWriter({ knowledgeBase, learningSystem });
const writeResult = await writer.writeFile('lib/token-counter.js', {
  type: 'token-counter',
  description: plan.taskDescription,
  features: plan.features
});

if (writeResult.success) {
  console.log(`✅ Cal wrote code in ${writeResult.attempt} attempts`);

  // 4. Test the code
  try {
    const TokenCounter = require('./lib/token-counter');
    const counter = new TokenCounter();
    const result = counter.count('Hello world', 'gpt-4');
    console.log(`✅ Tests passed: ${result.tokens} tokens`);
  } catch (error) {
    console.log(`❌ Tests failed: ${error.message}`);

    // 5. Debug if needed
    const debugger = new CalDebugger({ knowledgeBase, learningSystem });
    const debugResult = await debugger.debug({
      filePath: 'lib/token-counter.js',
      errorMessage: error.message,
      code: writeResult.code
    });

    if (debugResult.success) {
      console.log(`✅ Cal fixed bug: ${debugResult.reasoning}`);
      await debugger.applyFix('lib/token-counter.js', debugResult.fixedCode);
    }
  }
}

// 6. Reflect on work
const reflection = new CalSelfReflection({ knowledgeBase, learningSystem });
const insights = await reflection.reflect({ period: '24h' });
console.log(`Success rate: ${insights.stats.successRate * 100}%`);
```

## Testing

Run the autonomous coding test:

```bash
node test-cal-autonomous.js
```

This tests Cal's ability to:
1. Break down a task
2. Write code from scratch
3. Validate syntax
4. Debug errors
5. Learn from the experience

## Key Features

✅ **Autonomous** - Cal writes code without human intervention
✅ **Learning** - Cal improves over time by recording successes/failures
✅ **Self-Healing** - Cal debugs its own errors
✅ **Knowledge-Based** - Cal uses proven patterns and avoids known mistakes
✅ **Reflective** - Cal analyzes its work and identifies improvements
✅ **Template-Based** - Cal starts with proven code structures
✅ **Ollama-Powered** - Uses local `calos-expert` model for code generation

## Data Storage

Both systems use SQLite databases:

- **Knowledge Base:** `cal-memory.db` (concepts, patterns, anti-patterns, examples)
- **Learning System:** `cal-memory.db` (lessons, task attempts, patterns)

Both share the same database file for efficiency.

## Future Enhancements

- [ ] Add more templates (database clients, CLI tools, etc.)
- [ ] Support more Ollama models (llama3.2, codellama)
- [ ] Add code review capability
- [ ] Implement test generation
- [ ] Add documentation generation
- [ ] Support non-JavaScript languages
- [ ] Add collaborative coding (multiple Cals working together)

## Teaching Cal New Concepts

You can teach Cal new things using the `cal-teach` CLI:

```bash
# Teach DNS concepts
cal-teach concept dns nonrecursive "Non-recursive queries check immediate server only"

# Teach rate limiting patterns
cal-teach pattern ratelimiting api "Use sliding window for accurate rate limits"

# Teach common mistakes
cal-teach anti-pattern async loops "Never use forEach with async/await"

# Teach from experience
cal-teach lesson api-integration "Always implement retry logic with exponential backoff"
```

Cal will use this knowledge the next time it writes similar code.

## How Cal Learns

1. **Before writing code:** Cal queries knowledge base for relevant patterns
2. **While writing code:** Cal follows best practices and avoids anti-patterns
3. **After writing code:** Cal records what worked/failed in learning system
4. **Periodically:** Cal reflects on recent work and updates knowledge base

This creates a virtuous cycle: Cal gets better with every task.

## Credits

Built with:
- **Ollama** - Local AI inference
- **SQLite** - Lightweight data storage
- **Node.js** - Runtime environment
- **CALOS** - Autonomous operating system

---

**Cal is now autonomous. Let him write your code.**
