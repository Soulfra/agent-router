# Lesson 7: Privacy & Security

**Track:** Privacy-First MCP Development
**Lesson:** 7 of 8
**XP Reward:** 130
**Time:** 45 minutes
**Prerequisites:** Lesson 6 (Code Analysis Tools)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand privacy-first design principles
- ✅ Implement zero-telemetry systems
- ✅ Secure MCP server communications
- ✅ Validate and sanitize inputs
- ✅ Handle sensitive data properly

## Privacy-First Design Principles

### 1. Zero Telemetry

**Never phone home. Never track users.**

```javascript
// ❌ BAD: Sending telemetry
async function logUsage(event) {
  await fetch('https://analytics.example.com/track', {
    method: 'POST',
    body: JSON.stringify({
      event: event,
      userId: userId,
      timestamp: Date.now()
    })
  });
}

// ✅ GOOD: Local logging only
async function logUsage(event) {
  console.log(`[Local] Event: ${event}`);
  // Optional: Write to local file
  await fs.appendFile('./logs/usage.log', `${event}\n`);
}
```

### 2. Local-Only Access

**Only listen on localhost, never expose to internet.**

```javascript
// ✅ GOOD: Localhost only
const server = app.listen(3100, 'localhost', () => {
  console.log('Server listening on http://localhost:3100');
  console.log('Not accessible from internet');
});

// ❌ BAD: Accessible from anywhere
const server = app.listen(3100, '0.0.0.0', () => {
  console.log('Server accessible from internet - DANGEROUS!');
});
```

### 3. No External Dependencies

**Use only built-in Node.js modules, no npm packages with telemetry.**

```javascript
// ✅ GOOD: Built-in modules only
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

// ❌ BAD: Third-party packages (may phone home)
const analytics = require('analytics-package');
const tracking = require('user-tracker');
```

### 4. Sandbox Everything

**Restrict file system access to project directory only.**

```javascript
// ✅ GOOD: Validate paths
function validatePath(inputPath) {
  const resolved = path.resolve(inputPath);
  const projectRoot = path.resolve('./');

  if (!resolved.startsWith(projectRoot)) {
    throw new Error('Access denied: Path outside project directory');
  }

  return resolved;
}

// ❌ BAD: No validation
function readFile(inputPath) {
  return fs.readFileSync(inputPath, 'utf8');
}
```

## Security Best Practices

### 1. Input Validation

**Always validate and sanitize inputs.**

```javascript
function validateToolInput(toolName, input) {
  // Check tool exists
  if (!tools.has(toolName)) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const tool = tools.get(toolName);
  const schema = tool.definition.inputSchema;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  // Validate types
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (input[key] !== undefined) {
      const actualType = typeof input[key];
      const expectedType = prop.type;

      if (actualType !== expectedType && expectedType !== 'any') {
        throw new Error(
          `Invalid type for ${key}: expected ${expectedType}, got ${actualType}`
        );
      }
    }
  }

  return true;
}
```

### 2. Path Traversal Prevention

**Block attempts to access files outside project.**

```javascript
function sanitizePath(userPath) {
  // Remove dangerous patterns
  const dangerous = ['..', '~', '/etc', '/usr', '/var', '/sys'];

  for (const pattern of dangerous) {
    if (userPath.includes(pattern)) {
      throw new Error(`Dangerous path pattern detected: ${pattern}`);
    }
  }

  // Ensure relative path
  if (path.isAbsolute(userPath)) {
    throw new Error('Absolute paths not allowed');
  }

  // Resolve and validate
  const resolved = path.resolve(process.cwd(), userPath);
  const projectRoot = process.cwd();

  if (!resolved.startsWith(projectRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  return resolved;
}
```

### 3. SQL Injection Prevention

**Use parameterized queries, never string concatenation.**

```javascript
// ✅ GOOD: Parameterized query
async function getUser(userId) {
  const result = await db.query(
    'SELECT * FROM users WHERE user_id = $1',
    [userId]
  );
  return result.rows[0];
}

// ❌ BAD: String concatenation
async function getUserBad(userId) {
  const result = await db.query(
    `SELECT * FROM users WHERE user_id = '${userId}'`
  );
  return result.rows[0];
}
```

### 4. Rate Limiting

**Prevent abuse with rate limits.**

```javascript
const rateLimits = new Map();

function checkRateLimit(userId, limit = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `${userId}:${Math.floor(now / windowMs)}`;

  const current = rateLimits.get(key) || 0;

  if (current >= limit) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  rateLimits.set(key, current + 1);

  // Cleanup old entries
  for (const [k, v] of rateLimits.entries()) {
    const [uid, window] = k.split(':');
    if (parseInt(window) < Math.floor((now - windowMs * 2) / windowMs)) {
      rateLimits.delete(k);
    }
  }

  return true;
}
```

## Lab: Security Audit Tool

Build a tool that audits your code for security issues.

### Create Security Audit Tool

```javascript
// lib/mcp-server/tools/security-audit-tool.js

const toolDefinition = {
  name: 'security_audit',
  description: 'Audit code for common security issues',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to audit (default: ./)'
      }
    }
  }
};

async function securityAuditHandler(input) {
  const path = input.path || './';
  const issues = [];

  // Check 1: Find hardcoded secrets
  const secrets = await searchPattern({
    pattern: '(password|secret|key|token)\\s*=\\s*["\'][^"\']{8,}["\']',
    path,
    ignoreCase: true
  });

  if (secrets.count > 0) {
    issues.push({
      severity: 'high',
      category: 'secrets',
      message: 'Potential hardcoded secrets found',
      count: secrets.count,
      matches: secrets.matches
    });
  }

  // Check 2: Find SQL concatenation
  const sqlInjection = await searchPattern({
    pattern: 'query\\([^$]*\\$\\{|query\\([^$]*\\+',
    path,
    ignoreCase: false
  });

  if (sqlInjection.count > 0) {
    issues.push({
      severity: 'critical',
      category: 'sql_injection',
      message: 'Potential SQL injection vulnerabilities',
      count: sqlInjection.count,
      matches: sqlInjection.matches
    });
  }

  // Check 3: Find eval() usage
  const evalUsage = await searchPattern({
    pattern: 'eval\\(',
    path,
    ignoreCase: false
  });

  if (evalUsage.count > 0) {
    issues.push({
      severity: 'critical',
      category: 'eval',
      message: 'Dangerous eval() usage found',
      count: evalUsage.count,
      matches: evalUsage.matches
    });
  }

  // Check 4: Find console.log (information leak)
  const consoleLogs = await searchPattern({
    pattern: 'console\\.log',
    path,
    ignoreCase: false
  });

  if (consoleLogs.count > 0) {
    issues.push({
      severity: 'low',
      category: 'information_leak',
      message: 'console.log statements (potential info leak)',
      count: consoleLogs.count,
      matches: consoleLogs.matches.slice(0, 5) // First 5 only
    });
  }

  // Check 5: Find missing input validation
  const missingValidation = await searchPattern({
    pattern: 'req\\.(body|params|query)\\.[a-zA-Z]+ [^=]*[^{]$',
    path,
    ignoreCase: false
  });

  if (missingValidation.count > 0) {
    issues.push({
      severity: 'medium',
      category: 'input_validation',
      message: 'Potential missing input validation',
      count: missingValidation.count,
      matches: missingValidation.matches.slice(0, 5)
    });
  }

  // Calculate risk score
  const riskScore = issues.reduce((score, issue) => {
    const severityScores = { low: 1, medium: 5, high: 10, critical: 20 };
    return score + (severityScores[issue.severity] * issue.count);
  }, 0);

  return {
    path,
    issuesFound: issues.length,
    totalProblems: issues.reduce((sum, i) => sum + i.count, 0),
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    issues,
    scannedAt: new Date().toISOString()
  };
}

function getRiskLevel(score) {
  if (score === 0) return 'safe';
  if (score < 10) return 'low';
  if (score < 50) return 'medium';
  if (score < 100) return 'high';
  return 'critical';
}

async function searchPattern(options) {
  // Use code_grep tool (implementation depends on your MCP setup)
  // This is a simplified version
  return {
    count: 0,
    matches: []
  };
}

module.exports = { toolDefinition, securityAuditHandler };
```

### Test the Audit Tool

```html
<!DOCTYPE html>
<html>
<head>
  <title>Security Audit Dashboard</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .risk-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 12px;
    }

    .risk-safe { background: #00ff00; color: #000; }
    .risk-low { background: #90ee90; color: #000; }
    .risk-medium { background: #ffa500; color: #000; }
    .risk-high { background: #ff6b6b; color: #fff; }
    .risk-critical { background: #ff0000; color: #fff; }

    .issue-card {
      background: #1a1a2e;
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
      border-left: 4px solid;
    }

    .issue-card.critical { border-left-color: #ff0000; }
    .issue-card.high { border-left-color: #ff6b6b; }
    .issue-card.medium { border-left-color: #ffa500; }
    .issue-card.low { border-left-color: #90ee90; }

    .summary {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }

    button {
      padding: 12px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    button:hover {
      background: #764ba2;
    }

    pre {
      background: #0f0f23;
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <h1>🔒 Security Audit Dashboard</h1>

  <div>
    <input type="text" id="auditPath" placeholder="Path to audit (default: ./)" value="./" style="padding: 10px; width: 300px;">
    <button onclick="runAudit()">Run Security Audit</button>
  </div>

  <div id="results"></div>

  <script>
    async function runAudit() {
      const path = document.getElementById('auditPath').value || './';
      const results = document.getElementById('results');

      results.innerHTML = '<p>Running security audit...</p>';

      try {
        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'security_audit',
            input: { path }
          })
        });

        const data = await response.json();

        if (data.success) {
          displayAuditResults(data.result);
        } else {
          results.innerHTML = `<p style="color: #ff6b6b;">Error: ${data.error}</p>`;
        }
      } catch (error) {
        results.innerHTML = `<p style="color: #ff6b6b;">Failed to run audit: ${error.message}</p>`;
      }
    }

    function displayAuditResults(audit) {
      const results = document.getElementById('results');

      let html = `
        <div class="summary">
          <h2>Audit Results</h2>
          <p><strong>Path:</strong> ${audit.path}</p>
          <p><strong>Risk Level:</strong> <span class="risk-badge risk-${audit.riskLevel}">${audit.riskLevel.toUpperCase()}</span></p>
          <p><strong>Risk Score:</strong> ${audit.riskScore}</p>
          <p><strong>Issues Found:</strong> ${audit.issuesFound}</p>
          <p><strong>Total Problems:</strong> ${audit.totalProblems}</p>
          <p><strong>Scanned:</strong> ${new Date(audit.scannedAt).toLocaleString()}</p>
        </div>
      `;

      if (audit.issues.length > 0) {
        html += '<h3>Issues Detected:</h3>';

        audit.issues.forEach(issue => {
          html += `
            <div class="issue-card ${issue.severity}">
              <h4>⚠️ ${issue.message}</h4>
              <p><strong>Severity:</strong> ${issue.severity.toUpperCase()}</p>
              <p><strong>Category:</strong> ${issue.category}</p>
              <p><strong>Occurrences:</strong> ${issue.count}</p>
              <details>
                <summary>Show matches</summary>
                <pre>${issue.matches.join('\n')}</pre>
              </details>
            </div>
          `;
        });
      } else {
        html += '<p style="color: #00ff00;">✅ No security issues detected!</p>';
      }

      results.innerHTML = html;
    }
  </script>
</body>
</html>
```

Save as `public/labs/security-audit.html`.

## Encryption Best Practices

### Encrypt Sensitive Data

```javascript
const crypto = require('crypto');

function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text, key) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

## Summary

You've learned:
- ✅ Privacy-first design principles (zero telemetry, local-only)
- ✅ Security best practices (validation, sanitization, rate limiting)
- ✅ How to prevent common vulnerabilities
- ✅ How to build security audit tools

## Next Lesson

**Lesson 8: Deploy Your Own MCP Server**

Learn how to deploy and maintain your own MCP server in production.

## Quiz

1. What's the #1 privacy-first principle?
   - a) Encrypt everything
   - b) Zero telemetry - never track users
   - c) Use HTTPS
   - d) Hash passwords

2. How should you prevent path traversal attacks?
   - a) Block `..` in paths
   - b) Validate resolved paths stay in project
   - c) Use relative paths only
   - d) All of the above

3. What's wrong with `eval(userInput)`?
   - a) It's slow
   - b) It allows arbitrary code execution
   - c) It's deprecated
   - d) Nothing

**Answers:** 1-b, 2-d, 3-b

---

**🎴 Achievement Unlocked:** Security Guardian (+130 XP)
