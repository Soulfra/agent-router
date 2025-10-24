# Lesson 3: Building Your First MCP Tool

**Track:** Privacy-First MCP Development
**Lesson:** 3 of 8
**XP Reward:** 130
**Time:** 45 minutes
**Prerequisites:** Lesson 1 (Intro to MCP), Lesson 2 (MCP Client with Fetch)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand MCP tool architecture
- ✅ Create a custom MCP tool from scratch
- ✅ Add input validation and error handling
- ✅ Register your tool with the MCP server
- ✅ Test your tool using fetch()

## MCP Tool Architecture

Every MCP tool has three components:

### 1. Tool Definition (Schema)

```javascript
{
  name: 'my_custom_tool',
  description: 'What the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'First parameter'
      },
      param2: {
        type: 'number',
        description: 'Second parameter'
      }
    },
    required: ['param1']
  }
}
```

### 2. Tool Handler (Implementation)

```javascript
async function myCustomTool(input) {
  // 1. Validate input
  if (!input.param1) {
    throw new Error('param1 is required');
  }

  // 2. Execute logic
  const result = await doSomething(input.param1, input.param2);

  // 3. Return result
  return {
    success: true,
    data: result
  };
}
```

### 3. Tool Registration

```javascript
const tools = new Map();
tools.set('my_custom_tool', {
  definition: toolDefinition,
  handler: myCustomTool
});
```

## Example: Build a "Text Stats" Tool

Let's build a tool that analyzes text and returns statistics.

### Step 1: Define the Tool Schema

Create `lib/mcp-server/tools/text-stats-tool.js`:

```javascript
/**
 * Text Stats Tool
 * Analyzes text and returns statistics (word count, character count, etc.)
 */

const toolDefinition = {
  name: 'text_stats',
  description: 'Analyze text and return statistics (words, chars, lines, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to analyze'
      },
      includeDetails: {
        type: 'boolean',
        description: 'Include detailed breakdown (sentences, paragraphs)',
        default: false
      }
    },
    required: ['text']
  }
};

module.exports = { toolDefinition };
```

### Step 2: Implement the Tool Handler

Add the handler to the same file:

```javascript
/**
 * Handler function
 */
async function textStatsHandler(input) {
  // Validate input
  if (!input.text || typeof input.text !== 'string') {
    throw new Error('text must be a non-empty string');
  }

  const text = input.text;
  const includeDetails = input.includeDetails || false;

  // Calculate basic stats
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const lines = text.split('\n').length;

  const result = {
    characters: chars,
    charactersNoSpaces: charsNoSpaces,
    words: words,
    lines: lines,
    avgWordLength: words > 0 ? (charsNoSpaces / words).toFixed(2) : 0
  };

  // Add detailed stats if requested
  if (includeDetails) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0).length;

    // Word frequency (top 10)
    const wordFreq = {};
    text.toLowerCase().match(/\b\w+\b/g)?.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    result.details = {
      sentences,
      paragraphs,
      avgWordsPerSentence: sentences > 0 ? (words / sentences).toFixed(2) : 0,
      topWords
    };
  }

  return result;
}

module.exports = { toolDefinition, textStatsHandler };
```

### Step 3: Register the Tool

Edit `lib/mcp-server/calos-mcp-server.js` to add your tool:

```javascript
const { toolDefinition: textStatsDef, textStatsHandler } = require('./tools/text-stats-tool');

// In the tools Map initialization
tools.set('text_stats', {
  definition: textStatsDef,
  handler: textStatsHandler
});
```

### Step 4: Test Your Tool

Create a test HTML file `public/labs/test-text-stats.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Text Stats Tool</title>
  <style>
    body {
      font-family: monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    textarea {
      width: 100%;
      height: 200px;
      padding: 10px;
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #667eea;
      border-radius: 5px;
      font-family: monospace;
      font-size: 14px;
    }

    button {
      padding: 10px 20px;
      margin: 10px 5px 10px 0;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }

    button:hover {
      background: #764ba2;
    }

    pre {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border-left: 3px solid #667eea;
    }

    label {
      display: block;
      margin: 10px 0 5px 0;
      color: #a0a0ff;
    }
  </style>
</head>
<body>
  <h1>🔧 Text Stats Tool Tester</h1>

  <label for="textInput">Enter text to analyze:</label>
  <textarea id="textInput" placeholder="Type or paste text here...">The quick brown fox jumps over the lazy dog. This is a sample text for testing the text stats tool. It has multiple sentences and some repeated words like the and is.</textarea>

  <div>
    <label>
      <input type="checkbox" id="includeDetails"> Include detailed breakdown
    </label>
  </div>

  <button onclick="analyzeText()">Analyze Text</button>
  <button onclick="clearResults()">Clear Results</button>

  <h3>Results:</h3>
  <pre id="output">Click "Analyze Text" to see stats...</pre>

  <script>
    async function analyzeText() {
      const text = document.getElementById('textInput').value;
      const includeDetails = document.getElementById('includeDetails').checked;
      const output = document.getElementById('output');

      if (!text.trim()) {
        output.textContent = 'Error: Please enter some text';
        return;
      }

      try {
        output.textContent = 'Analyzing...';

        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tool: 'text_stats',
            input: { text, includeDetails }
          })
        });

        const data = await response.json();

        if (data.success) {
          output.textContent = JSON.stringify(data.result, null, 2);
        } else {
          output.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch (error) {
        output.textContent = 'Error: ' + error.message;
        console.error('Analysis error:', error);
      }
    }

    function clearResults() {
      document.getElementById('output').textContent = 'Click "Analyze Text" to see stats...';
    }

    // Test on load
    window.addEventListener('load', () => {
      console.log('Text Stats Tool Tester loaded');
      console.log('Make sure MCP server is running: ./bin/mcp-server');
    });
  </script>
</body>
</html>
```

## Lab: Build Your Own Tool

Now it's your turn! Build a **JSON Validator Tool**.

### Requirements:

1. **Tool name:** `json_validator`
2. **Inputs:**
   - `jsonString` (string, required) - JSON to validate
   - `schema` (object, optional) - JSON schema to validate against
3. **Output:**
   - `valid` (boolean) - Is the JSON valid?
   - `parsed` (object) - Parsed JSON (if valid)
   - `error` (string) - Error message (if invalid)
   - `keys` (array) - Top-level keys (if valid)
   - `size` (number) - Size in bytes (if valid)

### Starter Code:

```javascript
// lib/mcp-server/tools/json-validator-tool.js

const toolDefinition = {
  name: 'json_validator',
  description: 'Validate and parse JSON strings',
  inputSchema: {
    type: 'object',
    properties: {
      jsonString: {
        type: 'string',
        description: 'JSON string to validate'
      }
    },
    required: ['jsonString']
  }
};

async function jsonValidatorHandler(input) {
  const { jsonString } = input;

  try {
    // TODO: Parse the JSON
    const parsed = JSON.parse(jsonString);

    // TODO: Extract top-level keys
    const keys = Object.keys(parsed);

    // TODO: Calculate size
    const size = new TextEncoder().encode(jsonString).length;

    return {
      valid: true,
      parsed,
      keys,
      size,
      error: null
    };
  } catch (error) {
    return {
      valid: false,
      parsed: null,
      keys: null,
      size: null,
      error: error.message
    };
  }
}

module.exports = { toolDefinition, jsonValidatorHandler };
```

### Testing Your Tool:

```javascript
// Test in browser console
async function testJSONValidator() {
  const response = await fetch('http://localhost:3100/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'json_validator',
      input: {
        jsonString: '{"name": "Alice", "age": 30}'
      }
    })
  });

  const data = await response.json();
  console.log(data);
}

testJSONValidator();
```

## Best Practices

### 1. Always Validate Input

```javascript
async function myToolHandler(input) {
  // Check required fields
  if (!input.requiredField) {
    throw new Error('requiredField is required');
  }

  // Check types
  if (typeof input.requiredField !== 'string') {
    throw new Error('requiredField must be a string');
  }

  // Check ranges
  if (input.count < 1 || input.count > 100) {
    throw new Error('count must be between 1 and 100');
  }

  // ... rest of handler
}
```

### 2. Handle Errors Gracefully

```javascript
async function myToolHandler(input) {
  try {
    const result = await riskyOperation(input);
    return { success: true, result };
  } catch (error) {
    console.error('[MyTool] Error:', error);
    throw new Error(`Operation failed: ${error.message}`);
  }
}
```

### 3. Return Consistent Results

```javascript
// Good: Consistent structure
return {
  data: [...],
  count: 5,
  timestamp: new Date().toISOString()
};

// Bad: Inconsistent structure
if (success) {
  return { data: [...] };
} else {
  return 'error';
}
```

### 4. Add Helpful Descriptions

```javascript
const toolDefinition = {
  name: 'my_tool',
  description: 'Clear description of what the tool does and when to use it',
  inputSchema: {
    type: 'object',
    properties: {
      param: {
        type: 'string',
        description: 'What this parameter does and what values are valid'
      }
    }
  }
};
```

## Summary

You've learned:
- ✅ How MCP tools are structured (definition + handler + registration)
- ✅ How to create a custom tool from scratch
- ✅ How to validate inputs and handle errors
- ✅ How to test your tools using fetch()

## Next Lesson

**Lesson 4: RPG Integration - Award XP**

Learn how to integrate your MCP tools with the CalOS RPG system to award XP and track achievements.

## Quiz

1. What are the three components of an MCP tool?
   - a) Name, description, output
   - b) Definition, handler, registration
   - c) Input, output, error
   - d) Schema, validation, testing

2. Where should tool validation happen?
   - a) In the client before calling
   - b) In the tool handler
   - c) In the MCP server router
   - d) All of the above

3. What should a tool handler return on success?
   - a) A string message
   - b) A consistent object structure
   - c) true or false
   - d) The raw result

**Answers:** 1-b, 2-d (but primarily in the handler), 3-b

---

**🎴 Achievement Unlocked:** Tool Builder (+130 XP)
