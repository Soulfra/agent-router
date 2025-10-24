# Lesson 6: Code Analysis Tools

**Track:** Privacy-First MCP Development
**Lesson:** 6 of 8
**XP Reward:** 120
**Time:** 40 minutes
**Prerequisites:** Lesson 5 (File System Tools)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Search code with grep patterns
- ✅ Find files by name or pattern
- ✅ Analyze codebases efficiently
- ✅ Build code search interfaces
- ✅ Extract insights from search results

## Code Analysis MCP Tools

The MCP server provides two code analysis tools:

### 1. `code_grep` - Search Code Content

```javascript
// Request
{
  tool: 'code_grep',
  input: {
    pattern: 'TODO',
    path: './lib',
    ignoreCase: true
  }
}

// Response
{
  pattern: 'TODO',
  path: './lib',
  count: 5,
  matches: [
    './lib/agent-selector.js:42: // TODO: Add caching',
    './lib/elo-system.js:15: // TODO: Implement decay',
    './lib/mailer-engine.js:88: // TODO: Add retry logic'
  ]
}
```

### 2. `code_find` - Find Files by Name

```javascript
// Request
{
  tool: 'code_find',
  input: {
    pattern: '*.js',
    path: './lib'
  }
}

// Response
{
  pattern: '*.js',
  path: './lib',
  count: 23,
  files: [
    './lib/agent-selector.js',
    './lib/elo-system.js',
    './lib/mailer-engine.js'
  ]
}
```

## Example 1: Find All TODOs

```javascript
async function findAllTODOs(directory = './lib') {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'code_grep',
        input: {
          pattern: 'TODO|FIXME|HACK',
          path: directory,
          ignoreCase: false
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;

    console.log(`Found ${result.count} TODOs in ${directory}:`);
    console.log('─'.repeat(60));

    result.matches.forEach(match => {
      // Parse: filename:line: content
      const [file, line, ...content] = match.split(':');
      console.log(`📌 ${file}`);
      console.log(`   Line ${line}: ${content.join(':').trim()}`);
    });

    return result;

  } catch (error) {
    console.error('Failed to find TODOs:', error);
    throw error;
  }
}

// Usage
findAllTODOs('./lib');
```

## Example 2: Find All Test Files

```javascript
async function findTestFiles(directory = './') {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'code_find',
        input: {
          pattern: '*test*.js',
          path: directory
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;

    console.log(`Found ${result.count} test files:`);
    result.files.forEach(file => {
      console.log(`  🧪 ${file}`);
    });

    return result;

  } catch (error) {
    console.error('Failed to find test files:', error);
    throw error;
  }
}

// Usage
findTestFiles('./');
```

## Example 3: Search for API Endpoints

```javascript
async function findAPIEndpoints() {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'code_grep',
        input: {
          pattern: 'router\\.(get|post|put|delete|patch)',
          path: './routes',
          ignoreCase: false
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;

    // Group by file
    const byFile = {};
    result.matches.forEach(match => {
      const file = match.split(':')[0];
      if (!byFile[file]) byFile[file] = [];
      byFile[file].push(match);
    });

    console.log(`Found ${result.count} API endpoints:`);
    console.log('─'.repeat(60));

    Object.entries(byFile).forEach(([file, matches]) => {
      console.log(`\n📄 ${file}`);
      matches.forEach(match => {
        const content = match.split(':').slice(2).join(':').trim();
        console.log(`   ${content}`);
      });
    });

    return result;

  } catch (error) {
    console.error('Failed to find API endpoints:', error);
    throw error;
  }
}

// Usage
findAPIEndpoints();
```

## Lab: Build a Code Search Dashboard

Create an interactive code search tool with multiple search types.

### HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>Code Search Dashboard</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .search-box {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
    }

    input[type="text"] {
      width: 100%;
      padding: 12px;
      background: #2a2a3e;
      color: #e0e0e0;
      border: 1px solid #667eea;
      border-radius: 5px;
      font-family: monospace;
      font-size: 14px;
      margin: 10px 0;
    }

    .search-options {
      display: flex;
      gap: 15px;
      margin: 10px 0;
    }

    .search-options label {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    button {
      padding: 12px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 5px;
    }

    button:hover {
      background: #764ba2;
    }

    button.secondary {
      background: #444;
    }

    button.secondary:hover {
      background: #555;
    }

    .results {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      min-height: 200px;
    }

    .result-item {
      background: #2a2a3e;
      padding: 15px;
      margin: 10px 0;
      border-radius: 5px;
      border-left: 3px solid #667eea;
    }

    .result-file {
      color: #64ffda;
      font-weight: bold;
    }

    .result-line {
      color: #ffd700;
      margin: 0 10px;
    }

    .result-content {
      color: #e0e0e0;
      margin-top: 5px;
      padding-left: 20px;
      border-left: 2px solid #444;
    }

    .stats {
      background: #2a2a3e;
      padding: 10px 15px;
      border-radius: 5px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
    }

    .quick-searches {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #888;
    }
  </style>
</head>
<body>
  <h1>🔍 Code Search Dashboard</h1>

  <div class="search-box">
    <h3>Search Code</h3>
    <input type="text" id="searchPattern" placeholder="Enter search pattern (supports regex)">
    <input type="text" id="searchPath" placeholder="Path to search (default: ./)" value="./">

    <div class="search-options">
      <label>
        <input type="radio" name="searchType" value="grep" checked> Content (grep)
      </label>
      <label>
        <input type="radio" name="searchType" value="find"> Filename (find)
      </label>
      <label>
        <input type="checkbox" id="ignoreCase"> Ignore case
      </label>
    </div>

    <button onclick="search()">🔍 Search</button>
    <button class="secondary" onclick="clearResults()">Clear</button>

    <div class="quick-searches">
      <strong>Quick:</strong>
      <button class="secondary" onclick="quickSearch('TODO|FIXME|HACK')">TODOs</button>
      <button class="secondary" onclick="quickSearch('router\\.(get|post)')">API Routes</button>
      <button class="secondary" onclick="quickSearch('async function')">Async Functions</button>
      <button class="secondary" onclick="quickSearch('console\\.log')">Console Logs</button>
    </div>
  </div>

  <div class="results" id="results">
    <p>Enter a search pattern and click Search...</p>
  </div>

  <script>
    async function search() {
      const pattern = document.getElementById('searchPattern').value;
      const path = document.getElementById('searchPath').value || './';
      const searchType = document.querySelector('input[name="searchType"]:checked').value;
      const ignoreCase = document.getElementById('ignoreCase').checked;

      if (!pattern) {
        alert('Please enter a search pattern');
        return;
      }

      const results = document.getElementById('results');
      results.innerHTML = '<div class="loading">Searching...</div>';

      try {
        const tool = searchType === 'grep' ? 'code_grep' : 'code_find';
        const input = searchType === 'grep'
          ? { pattern, path, ignoreCase }
          : { pattern, path };

        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, input })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        displayResults(data.result, searchType);

      } catch (error) {
        results.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayResults(result, searchType) {
      const results = document.getElementById('results');

      if (searchType === 'grep') {
        displayGrepResults(result);
      } else {
        displayFindResults(result);
      }
    }

    function displayGrepResults(result) {
      const results = document.getElementById('results');

      if (result.count === 0) {
        results.innerHTML = '<p>No matches found.</p>';
        return;
      }

      let html = `
        <div class="stats">
          <span><strong>Pattern:</strong> ${escapeHtml(result.pattern)}</span>
          <span><strong>Matches:</strong> ${result.count}</span>
        </div>
      `;

      result.matches.forEach(match => {
        const parts = match.split(':');
        const file = parts[0];
        const line = parts[1];
        const content = parts.slice(2).join(':').trim();

        html += `
          <div class="result-item">
            <div>
              <span class="result-file">${escapeHtml(file)}</span>
              <span class="result-line">Line ${line}</span>
            </div>
            <div class="result-content">${escapeHtml(content)}</div>
          </div>
        `;
      });

      results.innerHTML = html;
    }

    function displayFindResults(result) {
      const results = document.getElementById('results');

      if (result.count === 0) {
        results.innerHTML = '<p>No files found.</p>';
        return;
      }

      let html = `
        <div class="stats">
          <span><strong>Pattern:</strong> ${escapeHtml(result.pattern)}</span>
          <span><strong>Files:</strong> ${result.count}</span>
        </div>
      `;

      result.files.forEach(file => {
        html += `
          <div class="result-item">
            <span class="result-file">📄 ${escapeHtml(file)}</span>
          </div>
        `;
      });

      results.innerHTML = html;
    }

    function quickSearch(pattern) {
      document.getElementById('searchPattern').value = pattern;
      document.querySelector('input[value="grep"]').checked = true;
      search();
    }

    function clearResults() {
      document.getElementById('results').innerHTML =
        '<p>Enter a search pattern and click Search...</p>';
      document.getElementById('searchPattern').value = '';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Handle Enter key
    document.getElementById('searchPattern').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') search();
    });
  </script>
</body>
</html>
```

Save as `public/labs/code-search.html` and open in browser.

## Advanced Patterns

### Find Unused Variables

```javascript
// Search for variable declarations
const declarations = await code_grep({
  pattern: '(const|let|var) \\w+',
  path: './lib'
});

// Search for usage (simplified)
// In practice, this would need more sophisticated analysis
```

### Find All Imports

```javascript
const imports = await code_grep({
  pattern: "^(import|require\\()",
  path: './lib',
  ignoreCase: false
});
```

### Find Functions

```javascript
const functions = await code_grep({
  pattern: 'function \\w+|const \\w+ = \\(',
  path: './lib',
  ignoreCase: false
});
```

## Best Practices

### 1. Use Specific Patterns

```javascript
// Good: Specific
code_grep({ pattern: 'router\\.post' })

// Bad: Too broad
code_grep({ pattern: 'post' })
```

### 2. Limit Search Scope

```javascript
// Good: Specific directory
code_grep({ pattern: 'TODO', path: './lib' })

// Bad: Entire project (slow)
code_grep({ pattern: 'TODO', path: './' })
```

### 3. Escape Special Characters

```javascript
// Escape dots in patterns
const pattern = 'console\\.log';  // Matches console.log
// Not: 'console.log' (matches consoleXlog)
```

## Summary

You've learned:
- ✅ How to search code content with grep
- ✅ How to find files by name pattern
- ✅ How to build code search interfaces
- ✅ Advanced search patterns and techniques

## Next Lesson

**Lesson 7: Privacy & Security**

Learn about privacy-first design, data protection, and security best practices.

## Quiz

1. Which tool searches file contents?
   - a) code_find
   - b) code_grep
   - c) code_search
   - d) grep_code

2. What does `*test*.js` match?
   - a) Only test.js
   - b) Files containing 'test' in name
   - c) JavaScript test files
   - d) All .js files

3. How do you search for `console.log` correctly?
   - a) console.log
   - b) console\\.log
   - c) console\.log
   - d) "console.log"

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** Code Detective (+120 XP)
