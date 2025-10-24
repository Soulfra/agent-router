/**
 * Ollama Tools System
 *
 * Provides tools/functions that Ollama agents can call autonomously
 * using the ReACT pattern (Reasoning and Acting).
 *
 * Pattern: AI describes what tool to use, we execute it, feed result back
 */

const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class OllamaTools {
  constructor(options = {}) {
    this.db = options.db || null;
    this.allowDangerousCommands = options.allowDangerousCommands || false;
    this.maxCommandTimeout = options.maxCommandTimeout || 30000;
    this.toolExecutionLog = [];

    // Receipt parsing dependencies
    this.receiptParser = options.receiptParser || null;
    this.ocrAdapter = options.ocrAdapter || null;
  }

  /**
   * Get tool definitions for Ollama system prompt
   */
  getToolDefinitions() {
    return `
AVAILABLE TOOLS:
You can use these tools to interact with the system. To use a tool, output:
TOOL: tool_name
ARGS: {json args}

1. fetch_api
   Description: Fetch data from external APIs
   Args: { "url": "string", "method": "GET|POST", "body": "json" }
   Example: TOOL: fetch_api
            ARGS: {"url": "http://localhost:5001/health", "method": "GET"}

2. query_database
   Description: Query PostgreSQL database
   Args: { "sql": "SELECT query", "params": ["array", "of", "params"] }
   Example: TOOL: query_database
            ARGS: {"sql": "SELECT * FROM price_history LIMIT 5"}

3. run_command
   Description: Execute safe shell commands (read-only preferred)
   Args: { "command": "string" }
   Example: TOOL: run_command
            ARGS: {"command": "ls -la"}

4. read_file
   Description: Read file contents
   Args: { "path": "/absolute/path/to/file" }
   Example: TOOL: read_file
            ARGS: {"path": "/tmp/test.txt"}

5. write_file
   Description: Write content to file
   Args: { "path": "/absolute/path", "content": "string" }
   Example: TOOL: write_file
            ARGS: {"path": "/tmp/output.txt", "content": "Hello world"}

6. run_tests
   Description: Execute test suites
   Args: { "suite": "unit|integration|all" }
   Example: TOOL: run_tests
            ARGS: {"suite": "unit"}

7. check_health
   Description: Check system health (API, DB, services)
   Args: {}
   Example: TOOL: check_health
            ARGS: {}

8. get_logs
   Description: Retrieve service logs
   Args: { "service": "router|scheduler|guardian", "lines": 50 }
   Example: TOOL: get_logs
            ARGS: {"service": "router", "lines": 20}

9. fix_permissions
   Description: Fix common permission issues
   Args: { "resource": "database|files" }
   Example: TOOL: fix_permissions
            ARGS: {"resource": "database"}

10. restart_service
    Description: Restart system services
    Args: { "service": "router|scheduler" }
    Example: TOOL: restart_service
             ARGS: {"service": "router"}

11. parse_receipt
    Description: Parse receipt from email text or structured data
    Args: { "text": "receipt text", "merchant": "stripe|paypal|square|amazon|auto" }
    Example: TOOL: parse_receipt
             ARGS: {"text": "Receipt from Stripe\\nAmount: $29.00...", "merchant": "auto"}

12. scan_receipt_image
    Description: OCR receipt image and auto-categorize expense
    Args: { "image_path": "/path/to/receipt.jpg" }
    Example: TOOL: scan_receipt_image
             ARGS: {"image_path": "/tmp/calos-ocr-uploads/receipt-123.jpg"}

After using a tool, I will provide the result prefixed with RESULT:
You can then continue reasoning and use more tools if needed.
`.trim();
  }

  /**
   * Parse tool calls from Ollama response
   * Looks for pattern: TOOL: name\nARGS: {json}
   * Handles multiple formats: JSON, HTML, relaxed JSON, plain text
   */
  parseToolCalls(text) {
    const toolCalls = [];

    // Detect and extract text from HTML if present
    if (text.includes('<!DOCTYPE') || text.includes('<html>') || text.includes('<body>')) {
      text = this._extractTextFromHTML(text);
    }

    const toolRegex = /TOOL:\s*(\w+)\s*\nARGS:\s*({[\s\S]*?})/g;

    let match;
    while ((match = toolRegex.exec(text)) !== null) {
      try {
        const toolName = match[1].trim();
        const argsText = match[2];

        // Try standard JSON parsing first
        let args;
        try {
          args = JSON.parse(argsText);
        } catch (jsonError) {
          // Try relaxed JSON parsing (single quotes, trailing commas, etc.)
          try {
            args = this._relaxedJSONParse(argsText);
          } catch (relaxedError) {
            // Fallback: treat as raw text
            console.warn('[OllamaTools] Could not parse tool args as JSON, using raw text');
            args = { raw: argsText, parseError: jsonError.message };
          }
        }

        toolCalls.push({
          tool: toolName,
          args: args
        });
      } catch (error) {
        console.error('[OllamaTools] Failed to parse tool call:', error.message);
      }
    }

    return toolCalls;
  }

  /**
   * Extract text content from HTML response
   */
  _extractTextFromHTML(html) {
    try {
      // Remove script and style tags
      let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // Remove all HTML tags
      text = text.replace(/<[^>]+>/g, ' ');

      // Decode HTML entities
      text = text.replace(/&nbsp;/g, ' ')
                 .replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'");

      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();

      return text;
    } catch (error) {
      console.warn('[OllamaTools] HTML extraction failed, returning original text');
      return html;
    }
  }

  /**
   * Parse JSON with relaxed syntax (single quotes, trailing commas, unquoted keys)
   */
  _relaxedJSONParse(text) {
    try {
      // Convert single quotes to double quotes
      let relaxed = text.replace(/'/g, '"');

      // Remove trailing commas
      relaxed = relaxed.replace(/,(\s*[}\]])/g, '$1');

      // Try to quote unquoted keys (simple heuristic)
      relaxed = relaxed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      return JSON.parse(relaxed);
    } catch (error) {
      throw new Error(`Relaxed JSON parse failed: ${error.message}`);
    }
  }

  /**
   * Execute a tool and return result
   */
  async executeTool(toolName, args = {}) {
    const startTime = Date.now();

    try {
      let result;

      switch (toolName) {
        case 'fetch_api':
          result = await this._fetchAPI(args);
          break;
        case 'query_database':
          result = await this._queryDatabase(args);
          break;
        case 'run_command':
          result = await this._runCommand(args);
          break;
        case 'read_file':
          result = await this._readFile(args);
          break;
        case 'write_file':
          result = await this._writeFile(args);
          break;
        case 'run_tests':
          result = await this._runTests(args);
          break;
        case 'check_health':
          result = await this._checkHealth(args);
          break;
        case 'get_logs':
          result = await this._getLogs(args);
          break;
        case 'fix_permissions':
          result = await this._fixPermissions(args);
          break;
        case 'restart_service':
          result = await this._restartService(args);
          break;
        case 'parse_receipt':
          result = await this._parseReceipt(args);
          break;
        case 'scan_receipt_image':
          result = await this._scanReceiptImage(args);
          break;
        default:
          result = { error: `Unknown tool: ${toolName}` };
      }

      const duration = Date.now() - startTime;

      // Log execution
      this.toolExecutionLog.push({
        timestamp: new Date().toISOString(),
        tool: toolName,
        args,
        result: typeof result === 'string' ? result.substring(0, 200) : result,
        duration,
        success: !result.error
      });

      return result;

    } catch (error) {
      return {
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Tool implementations
   */

  async _fetchAPI(args) {
    const { url, method = 'GET', body = null } = args;

    try {
      const response = await axios({
        url,
        method,
        data: body,
        timeout: 10000
      });

      return {
        status: response.status,
        data: response.data
      };
    } catch (error) {
      return {
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async _queryDatabase(args) {
    if (!this.db) {
      return { error: 'Database not available' };
    }

    const { sql, params = [] } = args;

    // Safety check: block destructive queries unless explicitly allowed
    const destructiveKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER'];
    const sqlUpper = sql.toUpperCase();

    if (!this.allowDangerousCommands) {
      for (const keyword of destructiveKeywords) {
        if (sqlUpper.includes(keyword)) {
          return { error: `Dangerous SQL keyword '${keyword}' not allowed` };
        }
      }
    }

    try {
      const result = await this.db.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async _runCommand(args) {
    const { command } = args;

    // Safet check: block dangerous commands
    const dangerous = ['rm -rf', 'dd if=', 'mkfs', ':(){:|:&};:'];

    if (!this.allowDangerousCommands) {
      for (const pattern of dangerous) {
        if (command.includes(pattern)) {
          return { error: `Dangerous command pattern '${pattern}' not allowed` };
        }
      }
    }

    return new Promise((resolve) => {
      exec(command, {
        timeout: this.maxCommandTimeout,
        maxBuffer: 1024 * 1024 // 1MB
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            error: error.message,
            stdout: stdout.substring(0, 500),
            stderr: stderr.substring(0, 500)
          });
        } else {
          resolve({
            stdout: stdout.substring(0, 1000),
            stderr: stderr ? stderr.substring(0, 500) : ''
          });
        }
      });
    });
  }

  async _readFile(args) {
    const { path: filePath } = args;

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return {
        path: filePath,
        content: content.substring(0, 5000), // Limit to 5KB
        size: content.length
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async _writeFile(args) {
    const { path: filePath, content } = args;

    // Safety: don't allow writing to system directories
    const systemDirs = ['/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin'];
    const absPath = path.resolve(filePath);

    if (!this.allowDangerousCommands) {
      for (const sysDir of systemDirs) {
        if (absPath.startsWith(sysDir)) {
          return { error: `Writing to system directory ${sysDir} not allowed` };
        }
      }
    }

    try {
      await fs.writeFile(filePath, content, 'utf8');
      return {
        path: filePath,
        written: content.length
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async _runTests(args) {
    const { suite = 'all' } = args;

    const command = `node scripts/test-runner.js --suite ${suite} --output json`;

    return new Promise((resolve) => {
      exec(command, {
        cwd: path.join(__dirname, '..'),
        timeout: 120000, // 2 minutes
        env: { ...process.env, DB_USER: process.env.DB_USER || process.env.USER }
      }, (error, stdout, stderr) => {
        try {
          // Try to parse JSON test results
          const jsonMatch = stdout.match(/{[\s\S]*}/);
          if (jsonMatch) {
            const results = JSON.parse(jsonMatch[0]);
            resolve(results);
          } else {
            resolve({
              error: error ? error.message : null,
              output: stdout.substring(0, 1000)
            });
          }
        } catch (parseError) {
          resolve({
            error: 'Failed to parse test results',
            output: stdout.substring(0, 1000)
          });
        }
      });
    });
  }

  async _checkHealth(args) {
    const health = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Check API
    try {
      const apiResponse = await axios.get('http://localhost:5001/health', { timeout: 5000 });
      health.services.api = {
        status: 'up',
        uptime: apiResponse.data.uptime
      };
    } catch (error) {
      health.services.api = {
        status: 'down',
        error: error.message
      };
    }

    // Check database
    if (this.db) {
      try {
        await this.db.query('SELECT NOW()');
        health.services.database = { status: 'up' };
      } catch (error) {
        health.services.database = {
          status: 'down',
          error: error.message
        };
      }
    } else {
      health.services.database = { status: 'not_configured' };
    }

    // Check Ollama
    try {
      const ollamaResponse = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 5000 });
      health.services.ollama = {
        status: 'up',
        models: ollamaResponse.data.models?.length || 0
      };
    } catch (error) {
      health.services.ollama = {
        status: 'down',
        error: error.message
      };
    }

    return health;
  }

  async _getLogs(args) {
    const { service = 'router', lines = 50 } = args;

    const logFiles = {
      router: '/tmp/router.log',
      scheduler: '/tmp/scheduler.log',
      guardian: '/tmp/guardian.log'
    };

    const logFile = logFiles[service];
    if (!logFile) {
      return { error: `Unknown service: ${service}` };
    }

    return new Promise((resolve) => {
      exec(`tail -n ${lines} ${logFile} 2>&1`, (error, stdout, stderr) => {
        if (error) {
          resolve({ error: `Log file not found or unreadable: ${logFile}` });
        } else {
          resolve({
            service,
            lines: stdout.split('\n').length,
            content: stdout.substring(0, 2000)
          });
        }
      });
    });
  }

  async _fixPermissions(args) {
    const { resource } = args;

    if (resource === 'database') {
      if (!this.db) {
        return { error: 'Database not available' };
      }

      try {
        const username = process.env.DB_USER || process.env.USER;

        await this.db.query(`
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${username};
          GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${username};
        `);

        return {
          resource: 'database',
          action: 'granted_permissions',
          user: username
        };
      } catch (error) {
        return { error: error.message };
      }
    } else {
      return { error: `Unknown resource: ${resource}` };
    }
  }

  async _restartService(args) {
    const { service } = args;

    // Safety: this is a dangerous operation
    if (!this.allowDangerousCommands) {
      return {
        error: 'Service restart not allowed (set allowDangerousCommands: true)'
      };
    }

    // Implementation would depend on how services are managed
    // For now, return a placeholder
    return {
      service,
      action: 'restart_requested',
      note: 'Service restart functionality not fully implemented yet'
    };
  }

  /**
   * Parse receipt from text
   */
  async _parseReceipt(args) {
    if (!this.receiptParser) {
      return { error: 'Receipt parser not available' };
    }

    const { text, merchant = 'auto' } = args;

    if (!text) {
      return { error: 'Missing required argument: text' };
    }

    try {
      // Create a mock email message from the text
      const message = {
        id: `manual_${Date.now()}`,
        from: merchant !== 'auto' ? `noreply@${merchant}.com` : 'unknown@example.com',
        subject: 'Receipt',
        body: text,
        date: new Date().toISOString()
      };

      const receipt = await this.receiptParser.parseReceipt(message);

      if (!receipt) {
        return {
          error: 'Could not parse receipt from text',
          suggestion: 'Try scan_receipt_image if you have an image'
        };
      }

      return {
        success: true,
        receipt: {
          merchant: receipt.merchant,
          amount: receipt.amount,
          order_id: receipt.order_id,
          date: receipt.receipt_date,
          category: receipt.expense_category_name,
          category_icon: receipt.expense_category_icon,
          category_badge: receipt.expense_category_badge
        }
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Scan receipt image using OCR and auto-categorize
   */
  async _scanReceiptImage(args) {
    if (!this.ocrAdapter || !this.receiptParser) {
      return {
        error: 'OCR or receipt parser not available',
        hint: 'Make sure Tesseract is installed: brew install tesseract'
      };
    }

    const { image_path } = args;

    if (!image_path) {
      return { error: 'Missing required argument: image_path' };
    }

    try {
      // Step 1: Extract text from image using OCR
      console.log(`[OllamaTools] Scanning receipt image: ${image_path}`);

      const ocrResult = await this.ocrAdapter.handle({
        operation: 'extract_text',
        context: {
          image_url: image_path,
          preprocessing: ['deskew', 'enhance', 'denoise']
        }
      });

      if (!ocrResult.text) {
        return {
          error: 'No text found in image',
          ocr_confidence: ocrResult.confidence
        };
      }

      console.log(`[OllamaTools] OCR extracted ${ocrResult.text.length} characters (confidence: ${ocrResult.confidence})`);

      // Step 2: Parse receipt from OCR text
      const message = {
        id: `ocr_${Date.now()}`,
        from: 'receipt@scanner.local',
        subject: 'Scanned Receipt',
        body: ocrResult.enhanced_text || ocrResult.text,
        date: new Date().toISOString()
      };

      const receipt = await this.receiptParser.parseReceipt(message);

      if (!receipt) {
        // Still return OCR text even if parsing failed
        return {
          success: false,
          error: 'Could not parse structured receipt data',
          ocr_text: ocrResult.enhanced_text || ocrResult.text,
          ocr_confidence: ocrResult.confidence,
          suggestion: 'Receipt scanned but format not recognized. Try parse_receipt manually.'
        };
      }

      // Success!
      return {
        success: true,
        receipt: {
          merchant: receipt.merchant || 'Unknown',
          amount: receipt.amount || 'N/A',
          order_id: receipt.order_id || 'N/A',
          date: receipt.receipt_date || new Date().toISOString(),
          category: receipt.expense_category_name,
          category_icon: receipt.expense_category_icon,
          category_badge: receipt.expense_category_badge
        },
        ocr: {
          text: ocrResult.text.substring(0, 500), // First 500 chars
          confidence: ocrResult.confidence,
          enhanced: !!ocrResult.enhanced_text
        }
      };
    } catch (error) {
      return {
        error: error.message,
        hint: 'Check if image file exists and Tesseract is installed'
      };
    }
  }

  /**
   * Get execution log
   */
  getExecutionLog() {
    return this.toolExecutionLog;
  }

  /**
   * Clear execution log
   */
  clearExecutionLog() {
    this.toolExecutionLog = [];
  }
}

module.exports = OllamaTools;
