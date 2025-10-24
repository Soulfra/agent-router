/**
 * CalOS MCP Server
 *
 * Privacy-first Model Context Protocol server implementation
 * 100% local, zero external calls, zero dependencies
 *
 * Features:
 * - Database query tools (PostgreSQL)
 * - File system tools (read, write, list)
 * - Code analysis tools (grep, find)
 * - Privacy-first (no telemetry, no external calls)
 * - Zero external dependencies (uses only Node.js built-ins)
 *
 * Usage:
 *   const mcpServer = new CalOSMCPServer({ db });
 *   await mcpServer.start(3100);
 */

const http = require('http');
const { URL } = require('url');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CalOSMCPServer {
  constructor(options = {}) {
    this.db = options.db;
    this.port = options.port || 3100;
    this.host = options.host || 'localhost';
    this.server = null;

    // Privacy settings
    this.telemetryEnabled = false; // ALWAYS false
    this.externalCallsAllowed = false; // ALWAYS false

    // Tool definitions
    this.tools = this._registerTools();

    console.log('[CalOS MCP] Initialized privacy-first MCP server');
  }

  /**
   * Register all available tools
   */
  _registerTools() {
    return {
      // Database tools
      'database_query': {
        name: 'database_query',
        description: 'Execute SQL query on local database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL query to execute' },
            params: { type: 'array', description: 'Query parameters' }
          },
          required: ['query']
        },
        handler: this._handleDatabaseQuery.bind(this)
      },

      // File system tools
      'filesystem_read': {
        name: 'filesystem_read',
        description: 'Read file contents from local filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' }
          },
          required: ['path']
        },
        handler: this._handleFileRead.bind(this)
      },

      'filesystem_write': {
        name: 'filesystem_write',
        description: 'Write content to local filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        },
        handler: this._handleFileWrite.bind(this)
      },

      'filesystem_list': {
        name: 'filesystem_list',
        description: 'List files in directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path' }
          },
          required: ['path']
        },
        handler: this._handleFileList.bind(this)
      },

      // Code analysis tools
      'code_grep': {
        name: 'code_grep',
        description: 'Search code using grep',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Pattern to search' },
            path: { type: 'string', description: 'Path to search in' },
            ignoreCase: { type: 'boolean', description: 'Case insensitive search' }
          },
          required: ['pattern', 'path']
        },
        handler: this._handleCodeGrep.bind(this)
      },

      'code_find': {
        name: 'code_find',
        description: 'Find files by name or pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'File name pattern' },
            path: { type: 'string', description: 'Path to search in' }
          },
          required: ['pattern', 'path']
        },
        handler: this._handleCodeFind.bind(this)
      },

      // RPG/Game tools
      'rpg_get_player': {
        name: 'rpg_get_player',
        description: 'Get player stats (level, XP, achievements)',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' }
          },
          required: ['userId']
        },
        handler: this._handleRPGGetPlayer.bind(this)
      },

      'rpg_award_xp': {
        name: 'rpg_award_xp',
        description: 'Award XP to player',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
            amount: { type: 'number', description: 'XP amount' },
            reason: { type: 'string', description: 'Reason for XP' }
          },
          required: ['userId', 'amount', 'reason']
        },
        handler: this._handleRPGAwardXP.bind(this)
      }
    };
  }

  /**
   * Start the MCP server
   */
  async start(port = this.port) {
    this.port = port;

    this.server = http.createServer(async (req, res) => {
      // CORS headers for local access only
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);

      // Route handlers
      if (url.pathname === '/mcp/tools' && req.method === 'GET') {
        return this._handleListTools(req, res);
      }

      if (url.pathname === '/mcp/call' && req.method === 'POST') {
        return this._handleToolCall(req, res);
      }

      if (url.pathname === '/mcp/health' && req.method === 'GET') {
        return this._handleHealth(req, res);
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    return new Promise((resolve, reject) => {
      this.server.listen(port, this.host, () => {
        console.log(`[CalOS MCP] Server listening on http://${this.host}:${port}`);
        console.log('[CalOS MCP] Privacy-first mode: NO telemetry, NO external calls');
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('[CalOS MCP] Server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle GET /mcp/tools - List available tools
   */
  _handleListTools(req, res) {
    const toolsList = Object.values(this.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    res.writeHead(200);
    res.end(JSON.stringify({
      tools: toolsList,
      privacy: {
        telemetry: false,
        externalCalls: false,
        localOnly: true
      }
    }));
  }

  /**
   * Handle POST /mcp/call - Execute tool
   */
  async _handleToolCall(req, res) {
    try {
      const body = await this._readBody(req);
      const { tool, input } = JSON.parse(body);

      if (!this.tools[tool]) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Tool '${tool}' not found` }));
        return;
      }

      // Execute tool
      const result = await this.tools[tool].handler(input);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        tool,
        result
      }));

    } catch (error) {
      console.error('[CalOS MCP] Tool call error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Tool execution failed',
        message: error.message
      }));
    }
  }

  /**
   * Handle GET /mcp/health - Health check
   */
  _handleHealth(req, res) {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      tools: Object.keys(this.tools).length,
      privacy: {
        telemetry: false,
        externalCalls: false
      },
      uptime: process.uptime()
    }));
  }

  /**
   * Read request body
   */
  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  // ========================================
  // Tool Handlers
  // ========================================

  /**
   * Database query tool
   */
  async _handleDatabaseQuery({ query, params = [] }) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    // Privacy: Only allow SELECT queries
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries allowed for privacy');
    }

    const result = await this.db.query(query, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount
    };
  }

  /**
   * File read tool
   */
  async _handleFileRead({ path: filePath }) {
    // Privacy: Only allow reading from project directory
    const projectRoot = process.cwd();
    const absolutePath = path.resolve(projectRoot, filePath);

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('Access denied: Path outside project directory');
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    return { content, path: filePath };
  }

  /**
   * File write tool
   */
  async _handleFileWrite({ path: filePath, content }) {
    // Privacy: Only allow writing to project directory
    const projectRoot = process.cwd();
    const absolutePath = path.resolve(projectRoot, filePath);

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('Access denied: Path outside project directory');
    }

    await fs.writeFile(absolutePath, content, 'utf8');
    return { success: true, path: filePath, bytes: content.length };
  }

  /**
   * File list tool
   */
  async _handleFileList({ path: dirPath }) {
    // Privacy: Only allow listing project directory
    const projectRoot = process.cwd();
    const absolutePath = path.resolve(projectRoot, dirPath);

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('Access denied: Path outside project directory');
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    return {
      path: dirPath,
      entries: entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file'
      }))
    };
  }

  /**
   * Code grep tool
   */
  async _handleCodeGrep({ pattern, path: searchPath, ignoreCase = false }) {
    const projectRoot = process.cwd();
    const absolutePath = path.resolve(projectRoot, searchPath);

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('Access denied: Path outside project directory');
    }

    const flags = ignoreCase ? '-i' : '';
    const command = `grep -r ${flags} "${pattern}" "${absolutePath}"`;

    try {
      const { stdout } = await execAsync(command);
      const matches = stdout.trim().split('\n').filter(Boolean);
      return { pattern, matches, count: matches.length };
    } catch (error) {
      // grep returns 1 when no matches found
      if (error.code === 1) {
        return { pattern, matches: [], count: 0 };
      }
      throw error;
    }
  }

  /**
   * Code find tool
   */
  async _handleCodeFind({ pattern, path: searchPath }) {
    const projectRoot = process.cwd();
    const absolutePath = path.resolve(projectRoot, searchPath);

    if (!absolutePath.startsWith(projectRoot)) {
      throw new Error('Access denied: Path outside project directory');
    }

    const command = `find "${absolutePath}" -name "${pattern}"`;

    try {
      const { stdout } = await execAsync(command);
      const files = stdout.trim().split('\n').filter(Boolean);
      return { pattern, files, count: files.length };
    } catch (error) {
      return { pattern, files: [], count: 0 };
    }
  }

  /**
   * RPG: Get player stats
   */
  async _handleRPGGetPlayer({ userId }) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    // Check if player exists in rpg_players table
    const result = await this.db.query(
      `SELECT user_id, level, xp, total_xp, achievements
       FROM rpg_players WHERE user_id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      // Create new player
      await this.db.query(
        `INSERT INTO rpg_players (user_id, level, xp, total_xp, achievements)
         VALUES ($1, 1, 0, 0, '[]')`,
        [userId]
      );

      return {
        userId,
        level: 1,
        xp: 0,
        totalXp: 0,
        achievements: [],
        newPlayer: true
      };
    }

    const player = result.rows[0];
    return {
      userId: player.user_id,
      level: player.level,
      xp: player.xp,
      totalXp: player.total_xp,
      achievements: player.achievements || [],
      newPlayer: false
    };
  }

  /**
   * RPG: Award XP to player
   */
  async _handleRPGAwardXP({ userId, amount, reason }) {
    if (!this.db) {
      throw new Error('Database not available');
    }

    // Get current player stats
    const player = await this._handleRPGGetPlayer({ userId });

    // Calculate new XP
    const newXp = player.xp + amount;
    const newTotalXp = player.totalXp + amount;

    // Check for level up (100 XP per level)
    const xpPerLevel = 100;
    let newLevel = player.level;
    let remainingXp = newXp;

    while (remainingXp >= xpPerLevel) {
      newLevel++;
      remainingXp -= xpPerLevel;
    }

    const leveledUp = newLevel > player.level;

    // Update player
    await this.db.query(
      `UPDATE rpg_players
       SET level = $1, xp = $2, total_xp = $3, updated_at = NOW()
       WHERE user_id = $4`,
      [newLevel, remainingXp, newTotalXp, userId]
    );

    // Log XP event
    await this.db.query(
      `INSERT INTO rpg_xp_log (user_id, amount, reason, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, amount, reason]
    );

    return {
      userId,
      awarded: amount,
      reason,
      level: newLevel,
      xp: remainingXp,
      totalXp: newTotalXp,
      leveledUp,
      levelsGained: newLevel - player.level
    };
  }
}

module.exports = CalOSMCPServer;
