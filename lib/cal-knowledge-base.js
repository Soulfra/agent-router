/**
 * Cal Knowledge Base
 *
 * Stores everything Cal knows about:
 * - DNS (recursive vs non-recursive, loops, TTL, CNAME chains)
 * - Token counting (API limits, estimation, chunking)
 * - OAuth flows (authorization code, implicit, client credentials)
 * - Common patterns (file I/O, database connections, error handling)
 * - Anti-patterns (infinite loops, memory leaks, race conditions)
 *
 * Cal queries this before writing new code to avoid known mistakes.
 *
 * Usage:
 *   const kb = new CalKnowledgeBase();
 *   const dnsKnowledge = kb.query('dns', 'recursive');
 *   // Returns: concepts, patterns, anti-patterns, examples
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class CalKnowledgeBase {
  constructor(options = {}) {
    this.config = {
      dbPath: options.dbPath || path.join(__dirname, '../cal-memory.db'),
      verbose: options.verbose || false
    };

    this.db = null;
    this.isInitialized = false;

    // Pre-loaded knowledge (will be saved to DB on first run)
    this.baseKnowledge = {
      dns: {
        recursive: {
          concept: 'Recursive DNS queries follow CNAME/NS chains until final IP',
          patterns: [
            'Always set max_depth limit (recommended: 10)',
            'Cache intermediate results to avoid repeat queries',
            'Use timeout for each query (recommended: 5s)',
            'Track visited domains to detect loops'
          ],
          antiPatterns: [
            'NEVER follow unlimited CNAME chains',
            'NEVER query same domain twice in same chain',
            'NEVER ignore timeout limits'
          ],
          examples: [
            {
              title: 'Recursive DNS with loop prevention',
              code: `async function resolveDNS(domain, visited = new Set(), depth = 0) {
  if (depth > 10) throw new Error('Max recursion depth');
  if (visited.has(domain)) throw new Error('DNS loop detected');

  visited.add(domain);
  const result = await dns.resolve(domain);

  if (result.type === 'CNAME') {
    return resolveDNS(result.value, visited, depth + 1);
  }

  return result;
}`
            }
          ]
        },
        nonRecursive: {
          concept: 'Non-recursive queries only check immediate DNS server',
          patterns: [
            'Faster but may return referrals instead of final answer',
            'Useful for checking if DNS propagated',
            'Good for getting NS records directly'
          ]
        }
      },

      tokens: {
        counting: {
          concept: 'API tokens determine cost and limits. Must count before sending.',
          patterns: [
            'Use tiktoken library for accurate counting',
            'GPT-4: ~4 characters ≈ 1 token',
            'GPT-3.5: ~4 characters ≈ 1 token',
            'Claude: ~5 characters ≈ 1 token',
            'Always check model limits before API call',
            'Split large requests into chunks if needed'
          ],
          antiPatterns: [
            'NEVER send without counting first',
            'NEVER assume character count = token count',
            'NEVER ignore API token limits'
          ],
          examples: [
            {
              title: 'Token counting and chunking',
              code: `const { encoding_for_model } = require('tiktoken');

async function sendWithTokenLimit(text, model, maxTokens) {
  const enc = encoding_for_model(model);
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokens) {
    return await api.send(text);
  }

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunk = tokens.slice(i, i + maxTokens);
    chunks.push(enc.decode(chunk));
  }

  const results = [];
  for (const chunk of chunks) {
    results.push(await api.send(chunk));
  }

  return results;
}`
            }
          ]
        },
        limits: {
          concept: 'Different models have different token limits',
          patterns: [
            'GPT-4: 8k, 32k, 128k variants',
            'GPT-3.5-turbo: 4k, 16k variants',
            'Claude: 100k, 200k variants',
            'Check both input AND output limits',
            'Reserve tokens for system prompts'
          ]
        }
      },

      oauth: {
        authorizationCode: {
          concept: 'Most secure OAuth flow for server-side apps',
          patterns: [
            '1. Redirect user to /authorize endpoint',
            '2. User approves, redirected back with code',
            '3. Exchange code for access token',
            '4. Store access token securely',
            '5. Use refresh token when expired'
          ],
          antiPatterns: [
            'NEVER expose client secret in frontend',
            'NEVER store tokens in localStorage (use httpOnly cookies)',
            'NEVER skip CSRF protection (use state parameter)'
          ],
          examples: [
            {
              title: 'OAuth Authorization Code Flow',
              code: `// Step 1: Redirect to authorization
const authUrl = \`https://oauth.example.com/authorize?
  client_id=\${clientId}&
  redirect_uri=\${redirectUri}&
  response_type=code&
  scope=\${scopes}&
  state=\${randomState}\`;

// Step 2: Handle callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (state !== storedState) {
    throw new Error('CSRF detected');
  }

  // Step 3: Exchange code for token
  const token = await fetch('https://oauth.example.com/token', {
    method: 'POST',
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  // Step 4: Store token securely
  await saveTokenToDatabase(token);
});`
            }
          ]
        }
      },

      patterns: {
        fileIO: {
          concept: 'Safe file operations with error handling',
          patterns: [
            'Always check if file exists before reading',
            'Use try-catch for all file operations',
            'Close file handles properly',
            'Use atomic writes for critical files',
            'Create parent directories if needed'
          ],
          examples: [
            {
              title: 'Safe file write',
              code: `const fs = require('fs').promises;
const path = require('path');

async function safeWriteFile(filePath, content) {
  // Create parent directory
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Write to temp file first
  const tempPath = \`\${filePath}.tmp\`;
  await fs.writeFile(tempPath, content);

  // Atomic rename
  await fs.rename(tempPath, filePath);
}`
            }
          ]
        },

        asyncLoop: {
          concept: 'Handle async operations in loops correctly',
          patterns: [
            'Use for...of for sequential async operations',
            'Use Promise.all() for parallel async operations',
            'Set concurrency limits for large arrays',
            'Handle errors for each operation'
          ],
          antiPatterns: [
            'NEVER use forEach with async/await',
            'NEVER ignore Promise.all() rejections',
            'NEVER run unbounded parallel operations'
          ]
        }
      },

      antiPatterns: {
        infiniteLoops: {
          concept: 'Loops without exit conditions',
          patterns: [
            'Always have a maximum iteration count',
            'Use break conditions explicitly',
            'Add timeout for long-running loops',
            'Track visited states to prevent cycles'
          ]
        },

        memoryLeaks: {
          concept: 'Unreleased memory causes crashes',
          patterns: [
            'Clear intervals and timeouts',
            'Remove event listeners when done',
            'Close database connections',
            'Clear large arrays/objects when done'
          ]
        }
      }
    };
  }

  /**
   * Initialize database
   */
  async init() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.config.dbPath, async (err) => {
        if (err) return reject(err);

        // Create tables
        await this.createTables();

        // Load base knowledge if empty
        await this.loadBaseKnowledge();

        this.isInitialized = true;
        console.log('[CalKnowledgeBase] Initialized');
        resolve();
      });
    });
  }

  /**
   * Create database tables
   */
  createTables() {
    return new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          topic TEXT NOT NULL,
          type TEXT NOT NULL, -- concept, pattern, antiPattern, example
          content TEXT NOT NULL,
          metadata TEXT, -- JSON
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(category, topic, type, content)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * Load base knowledge into database
   */
  async loadBaseKnowledge() {
    // Check if knowledge already loaded
    const count = await this.count();
    if (count > 0) {
      console.log(`[CalKnowledgeBase] ${count} entries already loaded`);
      return;
    }

    console.log('[CalKnowledgeBase] Loading base knowledge...');

    for (const [category, topics] of Object.entries(this.baseKnowledge)) {
      for (const [topic, data] of Object.entries(topics)) {
        // Store concept
        if (data.concept) {
          await this.add(category, topic, 'concept', data.concept);
        }

        // Store patterns
        if (data.patterns) {
          for (const pattern of data.patterns) {
            await this.add(category, topic, 'pattern', pattern);
          }
        }

        // Store anti-patterns
        if (data.antiPatterns) {
          for (const antiPattern of data.antiPatterns) {
            await this.add(category, topic, 'antiPattern', antiPattern);
          }
        }

        // Store examples
        if (data.examples) {
          for (const example of data.examples) {
            await this.add(category, topic, 'example', JSON.stringify(example));
          }
        }
      }
    }

    const newCount = await this.count();
    console.log(`[CalKnowledgeBase] Loaded ${newCount} entries`);
  }

  /**
   * Add knowledge entry
   */
  add(category, topic, type, content, metadata = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO knowledge (category, topic, type, content, metadata) VALUES (?, ?, ?, ?, ?)`,
        [category, topic, type, content, metadata ? JSON.stringify(metadata) : null],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Query knowledge
   */
  query(category, topic = null) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM knowledge WHERE category = ?';
      const params = [category];

      if (topic) {
        sql += ' AND topic = ?';
        params.push(topic);
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);

        // Group by type
        const result = {
          category,
          topic,
          concepts: [],
          patterns: [],
          antiPatterns: [],
          examples: []
        };

        for (const row of rows) {
          const content = row.type === 'example' ? JSON.parse(row.content) : row.content;

          switch (row.type) {
            case 'concept':
              result.concepts.push(content);
              break;
            case 'pattern':
              result.patterns.push(content);
              break;
            case 'antiPattern':
              result.antiPatterns.push(content);
              break;
            case 'example':
              result.examples.push(content);
              break;
          }
        }

        resolve(result);
      });
    });
  }

  /**
   * Count knowledge entries
   */
  count() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM knowledge', (err, row) => {
        if (err) return reject(err);
        resolve(row.count);
      });
    });
  }

  /**
   * Search knowledge
   */
  search(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM knowledge WHERE
         category LIKE ? OR
         topic LIKE ? OR
         content LIKE ?
         LIMIT 10`,
        [`%${query}%`, `%${query}%`, `%${query}%`],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  }

  /**
   * Close database
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = CalKnowledgeBase;
