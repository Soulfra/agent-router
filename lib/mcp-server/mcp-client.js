/**
 * CalOS MCP Client
 *
 * Client for connecting to CalOS MCP Server
 * Zero dependencies, privacy-first
 *
 * Usage:
 *   const client = new CalOSMCPClient('http://localhost:3100');
 *   const tools = await client.listTools();
 *   const result = await client.call('database_query', { query: 'SELECT 1' });
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class CalOSMCPClient {
  constructor(serverUrl = 'http://localhost:3100') {
    this.serverUrl = serverUrl;
    this.tools = null;
  }

  /**
   * List available tools from server
   */
  async listTools() {
    const response = await this._request('GET', '/mcp/tools');
    this.tools = response.tools;
    return response;
  }

  /**
   * Call a tool on the server
   */
  async call(toolName, input = {}) {
    const response = await this._request('POST', '/mcp/call', {
      tool: toolName,
      input
    });

    if (!response.success) {
      throw new Error(response.error || 'Tool call failed');
    }

    return response.result;
  }

  /**
   * Check server health
   */
  async health() {
    return this._request('GET', '/mcp/health');
  }

  /**
   * Make HTTP request to MCP server
   */
  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (res.statusCode >= 400) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // ========================================
  // Convenience methods for common tools
  // ========================================

  /**
   * Query database
   */
  async query(sql, params = []) {
    return this.call('database_query', { query: sql, params });
  }

  /**
   * Read file
   */
  async readFile(filePath) {
    const result = await this.call('filesystem_read', { path: filePath });
    return result.content;
  }

  /**
   * Write file
   */
  async writeFile(filePath, content) {
    return this.call('filesystem_write', { path: filePath, content });
  }

  /**
   * List directory
   */
  async listDir(dirPath) {
    const result = await this.call('filesystem_list', { path: dirPath });
    return result.entries;
  }

  /**
   * Search code with grep
   */
  async grep(pattern, searchPath, ignoreCase = false) {
    return this.call('code_grep', { pattern, path: searchPath, ignoreCase });
  }

  /**
   * Find files
   */
  async find(pattern, searchPath) {
    return this.call('code_find', { pattern, path: searchPath });
  }

  /**
   * Get RPG player stats
   */
  async getPlayer(userId) {
    return this.call('rpg_get_player', { userId });
  }

  /**
   * Award XP to player
   */
  async awardXP(userId, amount, reason) {
    return this.call('rpg_award_xp', { userId, amount, reason });
  }
}

module.exports = CalOSMCPClient;
