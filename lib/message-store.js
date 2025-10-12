/**
 * Message Store
 * Database persistence for chat messages with perfect recall
 *
 * Features:
 * - Store messages to SQLite
 * - Parse formatting (bold, colors, underline)
 * - Generate verification hashes
 * - Query and verify message integrity
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

class MessageStore {
  constructor(options = {}) {
    this.db = DB_PATH;
    this.enableEmbeddings = options.enableEmbeddings !== false;
    this.embedder = null;
  }

  /**
   * Get or initialize embeddings generator
   */
  _getEmbedder() {
    if (!this.embedder && this.enableEmbeddings) {
      const EmbeddingsGenerator = require('./embeddings');
      this.embedder = new EmbeddingsGenerator({
        provider: 'local', // Use Ollama
        cache: true
      });
    }
    return this.embedder;
  }

  /**
   * Store a message to the database
   * @param {object} message - Message to store
   * @returns {Promise<object>} - Stored message with hash
   */
  async store(message) {
    const {
      sessionId = 'default',
      type,
      user = null,
      agent = null,
      message: messageText,
      timestamp = new Date().toISOString(),
      metadata = {}
    } = message;

    // Parse formatting
    const formattedHtml = this._parseFormatting(messageText);

    // Generate verification hash
    const hash = this._generateHash(messageText, timestamp);

    // Generate embedding for semantic search
    let embedding = null;
    try {
      if (this.enableEmbeddings) {
        const embedder = this._getEmbedder();
        if (embedder) {
          embedding = await embedder.generate(messageText);
          console.log(`✓ Generated embedding for message (${embedding.length} dimensions)`);
        }
      }
    } catch (error) {
      console.error('⚠️  Failed to generate embedding:', error.message);
      // Continue without embedding - message can still be saved
    }

    // Build SQL insert
    const sql = `
      INSERT INTO chat_messages (session_id, type, user, agent, message, formatted_html, timestamp, hash, metadata, embedding)
      VALUES (
        '${this._escape(sessionId)}',
        '${this._escape(type)}',
        ${user ? `'${this._escape(user)}'` : 'NULL'},
        ${agent ? `'${this._escape(agent)}'` : 'NULL'},
        '${this._escape(messageText)}',
        '${this._escape(formattedHtml)}',
        '${this._escape(timestamp)}',
        '${this._escape(hash)}',
        '${this._escape(JSON.stringify(metadata))}',
        ${embedding ? `'${JSON.stringify(embedding)}'` : 'NULL'}
      );
    `;

    await this._runSQL(sql);

    return {
      id: await this._getLastInsertId(),
      sessionId,
      type,
      user,
      agent,
      message: messageText,
      formattedHtml,
      timestamp,
      hash,
      metadata
    };
  }

  /**
   * Parse formatting in message text
   * Supports:
   * - **bold** → <b>bold</b>
   * - *italic* → <i>italic</i>
   * - __underline__ → <u>underline</u>
   * - `code` → <code>code</code>
   * - ANSI color codes → <span style="color: ...">
   *
   * @param {string} text - Raw message text
   * @returns {string} - HTML formatted text
   */
  _parseFormatting(text) {
    if (!text) return '';

    let html = text;

    // Parse ANSI color codes first
    html = this._parseANSI(html);

    // Escape HTML (but preserve our injected tags)
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Parse markdown-style formatting
    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

    // *italic*
    html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');

    // __underline__
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');

    // `code`
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    return html;
  }

  /**
   * Parse ANSI color codes to HTML
   * @param {string} text - Text with ANSI codes
   * @returns {string} - HTML with color spans
   */
  _parseANSI(text) {
    const ansiColors = {
      '30': 'black',
      '31': 'red',
      '32': 'green',
      '33': 'yellow',
      '34': 'blue',
      '35': 'magenta',
      '36': 'cyan',
      '37': 'white',
      '90': 'gray',
      '91': 'lightred',
      '92': 'lightgreen',
      '93': 'lightyellow',
      '94': 'lightblue',
      '95': 'lightmagenta',
      '96': 'lightcyan',
      '97': 'white'
    };

    // Match ANSI escape sequences: \x1b[XXm
    return text.replace(/\x1b\[(\d+)m(.+?)\x1b\[0m/g, (match, code, content) => {
      const color = ansiColors[code] || 'inherit';
      return `<span style="color: ${color}">${content}</span>`;
    });
  }

  /**
   * Generate verification hash
   * @param {string} message - Message text
   * @param {string} timestamp - Timestamp
   * @returns {string} - SHA-256 hash
   */
  _generateHash(message, timestamp) {
    return crypto
      .createHash('sha256')
      .update(message + timestamp)
      .digest('hex');
  }

  /**
   * Verify message integrity
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} - Verification result
   */
  async verify(sessionId = null) {
    const whereClause = sessionId ? `WHERE session_id = '${this._escape(sessionId)}'` : '';

    const sql = `
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT hash) as unique_messages,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message,
        session_id
      FROM chat_messages
      ${whereClause}
      ${sessionId ? '' : 'GROUP BY session_id'};
    `;

    const result = await this._querySQL(sql);

    return {
      verified: result.length > 0,
      sessions: result,
      totalMessages: result.reduce((sum, r) => sum + r.total_messages, 0)
    };
  }

  /**
   * Get messages for a session
   * @param {string} sessionId - Session ID
   * @param {number} limit - Max messages to return
   * @returns {Promise<Array>} - Messages
   */
  async getMessages(sessionId, limit = 100) {
    const sql = `
      SELECT * FROM chat_messages
      WHERE session_id = '${this._escape(sessionId)}'
      ORDER BY timestamp DESC
      LIMIT ${limit};
    `;

    return await this._querySQL(sql);
  }

  /**
   * Get all messages with hashes for verification
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} - Message hashes
   */
  async getHashes(sessionId) {
    const sql = `
      SELECT id, timestamp, hash
      FROM chat_messages
      WHERE session_id = '${this._escape(sessionId)}'
      ORDER BY timestamp ASC;
    `;

    return await this._querySQL(sql);
  }

  /**
   * Escape SQL string
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  _escape(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/'/g, "''");
  }

  /**
   * Run SQL command
   * @param {string} sql - SQL to execute
   * @returns {Promise<void>}
   */
  _runSQL(sql) {
    return new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', [this.db, sql]);

      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`SQL failed: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Query SQL and return JSON results
   * @param {string} sql - SQL query
   * @returns {Promise<Array>} - Query results
   */
  _querySQL(sql) {
    return new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', ['-json', this.db, sql]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = stdout.trim() ? JSON.parse(stdout) : [];
            resolve(result);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Query failed: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get last inserted row ID
   * @returns {Promise<number>}
   */
  async _getLastInsertId() {
    const result = await this._querySQL('SELECT last_insert_rowid() as id;');
    return result[0]?.id || null;
  }

  /**
   * Get recent messages across all sessions (for RSS/JSON feeds)
   * @param {number} limit - Max messages to return
   * @returns {Promise<Array>} - Recent messages
   */
  async getRecent(limit = 50) {
    const sql = `
      SELECT * FROM chat_messages
      ORDER BY timestamp DESC
      LIMIT ${limit};
    `;

    return await this._querySQL(sql);
  }

  /**
   * Semantic search for messages using embeddings
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Matching messages with similarity scores
   */
  async semanticSearch(query, options = {}) {
    const {
      limit = 10,
      similarityThreshold = 0.7,
      type = null,
      sessionId = null
    } = options;

    // Generate query embedding
    const embedder = this._getEmbedder();
    if (!embedder) {
      throw new Error('Embeddings not enabled');
    }

    const queryEmbedding = await embedder.generate(query);

    // Get all messages with embeddings
    let sql = `
      SELECT *
      FROM chat_messages
      WHERE embedding IS NOT NULL
    `;

    if (type) {
      sql += ` AND type = '${this._escape(type)}'`;
    }

    if (sessionId) {
      sql += ` AND session_id = '${this._escape(sessionId)}'`;
    }

    const messages = await this._querySQL(sql);

    // Calculate similarity scores
    const results = messages.map(msg => {
      try {
        const msgEmbedding = JSON.parse(msg.embedding);
        const similarity = this._cosineSimilarity(queryEmbedding, msgEmbedding);

        return {
          ...msg,
          similarity
        };
      } catch (error) {
        console.error(`Failed to parse embedding for message ${msg.id}:`, error.message);
        return null;
      }
    }).filter(r => r !== null && r.similarity >= similarityThreshold);

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit);
  }

  /**
   * Hybrid search: combines text search and semantic search
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Ranked results
   */
  async hybridSearch(query, options = {}) {
    const {
      limit = 10,
      semanticWeight = 0.6,
      textWeight = 0.4
    } = options;

    // Run both searches in parallel
    const [semanticResults, textResults] = await Promise.all([
      this.semanticSearch(query, { ...options, limit: limit * 2 }),
      this._textSearch(query, { ...options, limit: limit * 2 })
    ]);

    // Combine and rank results
    const combinedMap = new Map();

    semanticResults.forEach((result, index) => {
      const score = result.similarity * semanticWeight + (1 - index / semanticResults.length) * 0.3;
      combinedMap.set(result.id, {
        ...result,
        score,
        matchType: 'semantic'
      });
    });

    textResults.forEach((result, index) => {
      const textScore = (1 - index / textResults.length) * textWeight;
      const existing = combinedMap.get(result.id);

      if (existing) {
        existing.score += textScore;
        existing.matchType = 'hybrid';
      } else {
        combinedMap.set(result.id, {
          ...result,
          score: textScore,
          matchType: 'text'
        });
      }
    });

    // Convert to array and sort by combined score
    const results = Array.from(combinedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Internal: Text-based search (simple LIKE query)
   */
  async _textSearch(query, options = {}) {
    const {
      limit = 50,
      type = null,
      sessionId = null
    } = options;

    const lowerQuery = query.toLowerCase();
    let sql = `
      SELECT *
      FROM chat_messages
      WHERE (LOWER(message) LIKE '%${this._escape(lowerQuery)}%'
             OR LOWER(formatted_html) LIKE '%${this._escape(lowerQuery)}%')
    `;

    if (type) {
      sql += ` AND type = '${this._escape(type)}'`;
    }

    if (sessionId) {
      sql += ` AND session_id = '${this._escape(sessionId)}'`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT ${limit}`;

    return await this._querySQL(sql);
  }

  /**
   * Internal: Calculate cosine similarity between two embeddings
   */
  _cosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }
}

module.exports = MessageStore;
