/**
 * RuneLite Chat Logger
 *
 * Unix-style chat logging system with timestamps, user attribution,
 * and historical search capabilities. Like old IRC/forum logs.
 *
 * What It Does:
 * - Log all chat messages in Unix-style format
 * - Rotating log files (daily/weekly/monthly)
 * - Database storage for full-text search
 * - User activity tracking
 * - Export to CSV/JSON/Markdown
 * - grep-compatible text files
 *
 * Log Format:
 * ```
 * [2025-10-23 14:32:45] <username@github> message content
 * [2025-10-23 14:33:12] <user456@github> [clan] gz!!
 * [2025-10-23 14:33:45] * username@github leveled up Agility
 * ```
 *
 * File Structure:
 * ```
 * logs/
 *   chat/
 *     2025-10-23.log        # Daily log
 *     2025-10-24.log
 *   archive/
 *     2025-10.log.gz        # Monthly archive
 *   metadata/
 *     stats.json            # Chat statistics
 * ```
 *
 * Use Cases:
 * - Historical search: grep "twisted bow" logs/chat/*.log
 * - User history: grep "user123" logs/chat/*.log
 * - Activity tracking: What was discussed on specific dates
 * - Export for publishing: Turn logs into blog posts
 * - Accountability: Who said what and when
 *
 * Integrates with:
 * - RuneLiteIntegration (lib/runelite-integration.js) - Chat events
 * - RuneLiteAccountTracker (lib/runelite-account-tracker.js) - User linking
 * - TimelineContentAggregator (lib/timeline-content-aggregator.js) - Publishing
 *
 * Usage:
 *   const logger = new RuneLiteChatLogger({
 *     logDir: './logs/chat',
 *     db,
 *     rotation: 'daily'
 *   });
 *
 *   // Log a message
 *   await logger.log({
 *     username: 'user123',
 *     githubUsername: 'user123@github',
 *     message: 'just got 99 agility!',
 *     type: 'public',
 *     timestamp: Date.now()
 *   });
 *
 *   // Search logs
 *   const results = await logger.search('agility', {
 *     startDate: '2025-10-01',
 *     endDate: '2025-10-31'
 *   });
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

class RuneLiteChatLogger extends EventEmitter {
  constructor(options = {}) {
    super();

    this.logDir = options.logDir || path.join(__dirname, '../logs/chat');
    this.archiveDir = options.archiveDir || path.join(__dirname, '../logs/archive');
    this.metadataDir = options.metadataDir || path.join(__dirname, '../logs/metadata');
    this.db = options.db;

    // Rotation settings
    this.rotation = options.rotation || 'daily'; // daily, weekly, monthly
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.compress = options.compress !== false;

    // Current log file
    this.currentLogFile = null;
    this.currentLogStream = null;

    // Chat types
    this.chatTypes = {
      public: { prefix: '', icon: '💬' },
      clan: { prefix: '[clan]', icon: '👥' },
      private: { prefix: '[pm]', icon: '📨' },
      trade: { prefix: '[trade]', icon: '💰' },
      game: { prefix: '[game]', icon: '🎮' },
      action: { prefix: '*', icon: '⚡' } // System actions (level ups, etc.)
    };

    // Stats
    this.stats = {
      totalMessages: 0,
      messagesByType: {},
      messagesByUser: {},
      lastMessage: null
    };

    console.log('[RuneLiteChatLogger] Initialized (logDir: ' + this.logDir + ')');
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize logger (create directories, load stats)
   */
  async init() {
    console.log('[RuneLiteChatLogger] Initializing...');

    // Create directories
    await fs.mkdir(this.logDir, { recursive: true });
    await fs.mkdir(this.archiveDir, { recursive: true });
    await fs.mkdir(this.metadataDir, { recursive: true });

    // Load stats
    await this._loadStats();

    // Open current log file
    await this._openCurrentLogFile();

    console.log('[RuneLiteChatLogger] Initialized successfully');
  }

  // ============================================================================
  // Logging Methods
  // ============================================================================

  /**
   * Log a chat message
   */
  async log(options) {
    const {
      username,
      githubUsername = null,
      message,
      type = 'public',
      timestamp = Date.now(),
      metadata = {}
    } = options;

    const chatType = this.chatTypes[type] || this.chatTypes.public;

    // Format timestamp: [2025-10-23 14:32:45]
    const date = new Date(timestamp);
    const formattedTime = this._formatTimestamp(date);

    // Format user: <username@github> or <username>
    const formattedUser = githubUsername
      ? `<${githubUsername}>`
      : `<${username}>`;

    // Format message line
    let logLine;
    if (type === 'action') {
      // Action format: [timestamp] * user action
      logLine = `[${formattedTime}] ${chatType.prefix} ${githubUsername || username} ${message}\n`;
    } else {
      // Chat format: [timestamp] <user> [type] message
      const typePrefix = chatType.prefix ? ` ${chatType.prefix}` : '';
      logLine = `[${formattedTime}] ${formattedUser}${typePrefix} ${message}\n`;
    }

    // Write to log file
    await this._writeToLogFile(logLine);

    // Store in database
    if (this.db) {
      await this._storeInDB({
        username,
        githubUsername,
        message,
        type,
        timestamp: date,
        metadata
      });
    }

    // Update stats
    this.stats.totalMessages++;
    this.stats.messagesByType[type] = (this.stats.messagesByType[type] || 0) + 1;

    const userKey = githubUsername || username;
    this.stats.messagesByUser[userKey] = (this.stats.messagesByUser[userKey] || 0) + 1;
    this.stats.lastMessage = timestamp;

    // Emit event
    this.emit('message_logged', {
      username,
      githubUsername,
      message,
      type,
      timestamp
    });

    return { logLine, timestamp };
  }

  /**
   * Log multiple messages in batch
   */
  async logBatch(messages) {
    const results = [];

    for (const msg of messages) {
      const result = await this.log(msg);
      results.push(result);
    }

    return results;
  }

  // ============================================================================
  // Search & Query
  // ============================================================================

  /**
   * Search log files
   */
  async search(query, options = {}) {
    const {
      startDate = null,
      endDate = null,
      type = null,
      username = null,
      limit = 100
    } = options;

    const results = [];

    // Get log files in date range
    const logFiles = await this._getLogFilesInRange(startDate, endDate);

    for (const logFile of logFiles) {
      const filePath = path.join(this.logDir, logFile);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          // Filter by query
          if (query && !line.toLowerCase().includes(query.toLowerCase())) {
            continue;
          }

          // Filter by username
          if (username && !line.includes(`<${username}`)) {
            continue;
          }

          // Filter by type
          if (type) {
            const chatType = this.chatTypes[type];
            if (chatType && chatType.prefix && !line.includes(chatType.prefix)) {
              continue;
            }
          }

          results.push(this._parseLine(line));

          if (results.length >= limit) {
            break;
          }
        }

        if (results.length >= limit) {
          break;
        }

      } catch (error) {
        console.error(`[RuneLiteChatLogger] Error reading ${logFile}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Search database (more powerful than file search)
   */
  async searchDB(query, options = {}) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const {
      startDate = null,
      endDate = null,
      type = null,
      username = null,
      limit = 100
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Full-text search on message
    if (query) {
      conditions.push(`message ILIKE $${paramIndex++}`);
      params.push(`%${query}%`);
    }

    // Date range
    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(new Date(endDate));
    }

    // Type filter
    if (type) {
      conditions.push(`chat_type = $${paramIndex++}`);
      params.push(type);
    }

    // Username filter
    if (username) {
      conditions.push(`(runelite_username = $${paramIndex++} OR github_username = $${paramIndex++})`);
      params.push(username, username);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sql = `
      SELECT *
      FROM chat_messages
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    try {
      const result = await this.db.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('[RuneLiteChatLogger] DB search error:', error.message);
      return [];
    }
  }

  /**
   * Get user's chat history
   */
  async getUserHistory(username, limit = 100) {
    return await this.search(null, { username, limit });
  }

  /**
   * Get chat history for a specific date
   */
  async getHistoryByDate(date) {
    const logFile = this._getLogFileName(new Date(date));
    const filePath = path.join(this.logDir, logFile);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      return lines
        .filter(line => line.trim())
        .map(line => this._parseLine(line));

    } catch (error) {
      console.error(`[RuneLiteChatLogger] Error reading ${logFile}:`, error.message);
      return [];
    }
  }

  // ============================================================================
  // Export Methods
  // ============================================================================

  /**
   * Export logs to CSV
   */
  async exportCSV(options = {}) {
    const {
      startDate = null,
      endDate = null,
      outputPath = null
    } = options;

    const results = await this.search(null, { startDate, endDate, limit: 999999 });

    const csv = ['timestamp,username,github_username,type,message'];

    for (const result of results) {
      const row = [
        result.timestamp,
        result.username || '',
        result.githubUsername || '',
        result.type || '',
        `"${(result.message || '').replace(/"/g, '""')}"` // Escape quotes
      ];

      csv.push(row.join(','));
    }

    const csvContent = csv.join('\n');

    if (outputPath) {
      await fs.writeFile(outputPath, csvContent, 'utf-8');
      return outputPath;
    }

    return csvContent;
  }

  /**
   * Export logs to JSON
   */
  async exportJSON(options = {}) {
    const {
      startDate = null,
      endDate = null,
      outputPath = null,
      pretty = true
    } = options;

    const results = await this.search(null, { startDate, endDate, limit: 999999 });

    const jsonContent = JSON.stringify(results, null, pretty ? 2 : 0);

    if (outputPath) {
      await fs.writeFile(outputPath, jsonContent, 'utf-8');
      return outputPath;
    }

    return jsonContent;
  }

  /**
   * Export logs to Markdown
   */
  async exportMarkdown(options = {}) {
    const {
      startDate = null,
      endDate = null,
      outputPath = null,
      title = 'Chat Log'
    } = options;

    const results = await this.search(null, { startDate, endDate, limit: 999999 });

    const md = [`# ${title}\n`];

    let currentDate = null;

    for (const result of results) {
      const date = new Date(result.timestamp).toLocaleDateString();

      if (date !== currentDate) {
        currentDate = date;
        md.push(`\n## ${date}\n`);
      }

      const time = new Date(result.timestamp).toLocaleTimeString();
      const user = result.githubUsername || result.username;
      md.push(`**[${time}] ${user}:** ${result.message}`);
    }

    const mdContent = md.join('\n');

    if (outputPath) {
      await fs.writeFile(outputPath, mdContent, 'utf-8');
      return outputPath;
    }

    return mdContent;
  }

  // ============================================================================
  // File Management
  // ============================================================================

  /**
   * Open current log file for writing
   */
  async _openCurrentLogFile() {
    const now = new Date();
    const logFileName = this._getLogFileName(now);
    this.currentLogFile = path.join(this.logDir, logFileName);

    // Create or append to file
    try {
      await fs.access(this.currentLogFile);
    } catch {
      // File doesn't exist, create it
      await fs.writeFile(this.currentLogFile, '', 'utf-8');
    }

    console.log(`[RuneLiteChatLogger] Using log file: ${logFileName}`);
  }

  /**
   * Write line to log file
   */
  async _writeToLogFile(line) {
    try {
      await fs.appendFile(this.currentLogFile, line, 'utf-8');

      // Check if file needs rotation
      const stats = await fs.stat(this.currentLogFile);
      if (stats.size >= this.maxFileSize) {
        await this._rotateLogFile();
      }

    } catch (error) {
      console.error('[RuneLiteChatLogger] Write error:', error.message);
      throw error;
    }
  }

  /**
   * Rotate log file
   */
  async _rotateLogFile() {
    console.log('[RuneLiteChatLogger] Rotating log file...');

    const oldFile = this.currentLogFile;

    // Compress old file if enabled
    if (this.compress) {
      const content = await fs.readFile(oldFile, 'utf-8');
      const compressed = await gzip(Buffer.from(content));
      const archivePath = path.join(this.archiveDir, path.basename(oldFile) + '.gz');
      await fs.writeFile(archivePath, compressed);
      console.log(`[RuneLiteChatLogger] Compressed ${path.basename(oldFile)} → archive`);
    }

    // Open new log file
    await this._openCurrentLogFile();

    // Save stats
    await this._saveStats();
  }

  /**
   * Get log file name for a date
   */
  _getLogFileName(date) {
    if (this.rotation === 'daily') {
      return date.toISOString().split('T')[0] + '.log'; // YYYY-MM-DD.log
    } else if (this.rotation === 'weekly') {
      const week = this._getWeekNumber(date);
      return `${date.getFullYear()}-W${week}.log`;
    } else if (this.rotation === 'monthly') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.log`;
    }
  }

  /**
   * Get log files in date range
   */
  async _getLogFilesInRange(startDate, endDate) {
    const files = await fs.readdir(this.logDir);
    const logFiles = files.filter(f => f.endsWith('.log'));

    if (!startDate && !endDate) {
      return logFiles;
    }

    // Filter by date range
    return logFiles.filter(f => {
      const fileDate = this._parseLogFileName(f);
      if (!fileDate) return false;

      if (startDate && fileDate < new Date(startDate)) return false;
      if (endDate && fileDate > new Date(endDate)) return false;

      return true;
    });
  }

  /**
   * Parse log file name to date
   */
  _parseLogFileName(filename) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }

  // ============================================================================
  // Parsing & Formatting
  // ============================================================================

  /**
   * Format timestamp for log
   */
  _formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  /**
   * Parse log line
   */
  _parseLine(line) {
    // Format: [2025-10-23 14:32:45] <username@github> [type] message
    const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    const userMatch = line.match(/<([^>]+)>/);

    if (!timestampMatch) {
      return { raw: line };
    }

    const timestamp = new Date(timestampMatch[1]);
    const username = userMatch ? userMatch[1] : null;

    // Extract message (everything after username)
    let message = line;
    if (userMatch) {
      message = line.substring(line.indexOf('>') + 1).trim();
    }

    // Detect type
    let type = 'public';
    for (const [typeName, typeInfo] of Object.entries(this.chatTypes)) {
      if (typeInfo.prefix && message.startsWith(typeInfo.prefix)) {
        type = typeName;
        message = message.substring(typeInfo.prefix.length).trim();
        break;
      }
    }

    return {
      timestamp,
      username,
      githubUsername: username && username.includes('@') ? username : null,
      type,
      message,
      raw: line
    };
  }

  // ============================================================================
  // Database Storage
  // ============================================================================

  /**
   * Store message in database
   */
  async _storeInDB(data) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO chat_messages (
          github_username,
          runelite_username,
          message,
          chat_type,
          timestamp,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        data.githubUsername,
        data.username,
        data.message,
        data.type,
        data.timestamp,
        JSON.stringify(data.metadata)
      ]);

    } catch (error) {
      console.error('[RuneLiteChatLogger] DB insert error:', error.message);
    }
  }

  // ============================================================================
  // Stats Management
  // ============================================================================

  /**
   * Load stats from file
   */
  async _loadStats() {
    const statsPath = path.join(this.metadataDir, 'stats.json');

    try {
      const content = await fs.readFile(statsPath, 'utf-8');
      this.stats = JSON.parse(content);
    } catch {
      // Stats file doesn't exist, use defaults
    }
  }

  /**
   * Save stats to file
   */
  async _saveStats() {
    const statsPath = path.join(this.metadataDir, 'stats.json');

    try {
      await fs.writeFile(statsPath, JSON.stringify(this.stats, null, 2), 'utf-8');
    } catch (error) {
      console.error('[RuneLiteChatLogger] Stats save error:', error.message);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get week number
   */
  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return String(weekNo).padStart(2, '0');
  }
}

module.exports = RuneLiteChatLogger;
