/**
 * Log Feed Server
 * Provides live log streaming via WebSocket and RSS/JSON export
 *
 * Features:
 * - Real-time WebSocket broadcasting
 * - RSS feed for external monitoring
 * - JSON feed for programmatic access
 * - Integrates with log-aggregator and health-monitor
 * - Color-coded status in feeds
 */

const WebSocket = require('ws');
const express = require('express');
const RSS = require('rss');
const path = require('path');
const HandlePool = require('../lib/handle-pool');

const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

class LogFeedServer {
  constructor(logAggregator, healthMonitor, processManager, options = {}) {
    this.logAggregator = logAggregator;
    this.healthMonitor = healthMonitor;
    this.processManager = processManager;

    this.port = options.port || 3003;
    this.maxFeedItems = options.maxFeedItems || 100;
    this.maxClients = options.maxClients || 100;

    this.clients = new Set();

    // Use HandlePool for feed buffer (supports 1000+ posts with stable handles)
    this.feedPool = new HandlePool({
      initialSize: 100,
      maxSize: 10000
    });
    this.feedHandles = []; // Track handles in order

    this.app = express();
    this.wss = null;
    this.server = null;

    // Auto-defrag every 5 minutes
    setInterval(() => {
      if (this.feedPool.shouldDefrag(0.3)) {
        console.log('🔧 Auto-defragmenting feed pool...');
        this.feedPool.defrag();
      }
    }, 300000);
  }

  /**
   * Start the server
   */
  start() {
    console.log('🚀 Starting log feed server...');

    // Setup Express routes
    this._setupRoutes();

    // Start HTTP server
    this.server = this.app.listen(this.port, () => {
      console.log(`✓ Log feed server listening on http://localhost:${this.port}`);
    });

    // Setup WebSocket server
    this.wss = new WebSocket.Server({ server: this.server });
    this._setupWebSocket();

    // Listen to log aggregator
    if (this.logAggregator) {
      this.logAggregator.on('log', this._handleLog.bind(this));
      this.logAggregator.on('error_detected', this._handleError.bind(this));
    }

    // Listen to health monitor
    if (this.healthMonitor) {
      this.healthMonitor.on('health_check', this._handleHealthCheck.bind(this));
      this.healthMonitor.on('status_change', this._handleStatusChange.bind(this));
    }

    // Listen to process manager
    if (this.processManager) {
      this.processManager.on('process_started', this._handleProcessEvent.bind(this));
      this.processManager.on('process_stopped', this._handleProcessEvent.bind(this));
      this.processManager.on('process_restarted', this._handleProcessEvent.bind(this));
      this.processManager.on('process_error', this._handleProcessEvent.bind(this));
    }

    console.log(`✓ WebSocket server ready at ws://localhost:${this.port}`);
    console.log(`✓ RSS feed at http://localhost:${this.port}/feed/rss`);
    console.log(`✓ JSON feed at http://localhost:${this.port}/feed/json`);
  }

  /**
   * Stop the server
   */
  stop() {
    console.log('🛑 Stopping log feed server...');

    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    if (this.server) {
      this.server.close();
    }

    console.log('✓ Log feed server stopped');
  }

  /**
   * Setup Express routes
   */
  _setupRoutes() {
    this.app.use(express.json());

    // RSS feed
    this.app.get('/feed/rss', (req, res) => {
      this._generateRSSFeed(req, res);
    });

    // JSON feed
    this.app.get('/feed/json', (req, res) => {
      this._generateJSONFeed(req, res);
    });

    // Health status
    this.app.get('/status', (req, res) => {
      if (this.healthMonitor) {
        res.json(this.healthMonitor.getSystemHealth());
      } else {
        res.json({ status: 'unknown' });
      }
    });

    // Process status
    this.app.get('/processes', (req, res) => {
      if (this.processManager) {
        res.json(this.processManager.getAllStatus());
      } else {
        res.json({});
      }
    });

    // Recent logs (last N entries)
    this.app.get('/logs/recent', async (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const logs = await this._getRecentLogs(limit);
      res.json(logs);
    });

    // Error patterns
    this.app.get('/errors/patterns', async (req, res) => {
      if (this.logAggregator) {
        const patterns = await this.logAggregator.getErrorPatterns(20);
        res.json(patterns);
      } else {
        res.json([]);
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }

  /**
   * Setup WebSocket server
   */
  _setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      // Check client limit
      if (this.clients.size >= this.maxClients) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Server at capacity'
        }));
        ws.close();
        return;
      }

      console.log(`📡 Client connected (${this.clients.size + 1} total)`);
      this.clients.add(ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to CalOS log feed',
        timestamp: new Date().toISOString()
      }));

      // Send current system status
      if (this.healthMonitor) {
        ws.send(JSON.stringify({
          type: 'system_health',
          data: this.healthMonitor.getSystemHealth()
        }));
      }

      // Handle messages from client
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleClientMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON'
          }));
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`📡 Client disconnected (${this.clients.size} remaining)`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Handle client message
   * @param {WebSocket} ws - WebSocket connection
   * @param {object} data - Message data
   */
  _handleClientMessage(ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'subscribe':
        // Could implement channel subscriptions here
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: data.channel || 'all'
        }));
        break;

      case 'get_status':
        if (this.healthMonitor) {
          ws.send(JSON.stringify({
            type: 'system_health',
            data: this.healthMonitor.getSystemHealth()
          }));
        }
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${data.type}`
        }));
    }
  }

  /**
   * Broadcast to all connected clients
   * @param {object} message - Message to broadcast
   */
  _broadcast(message) {
    const json = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  /**
   * Handle log entry
   * @param {object} entry - Log entry
   */
  _handleLog(entry) {
    // Add to feed pool
    const handle = this.feedPool.allocate({
      type: 'log',
      ...entry
    });

    this.feedHandles.push(handle);

    // Trim if exceeds max
    if (this.feedHandles.length > this.maxFeedItems) {
      const oldHandle = this.feedHandles.shift();
      this.feedPool.free(oldHandle);
    }

    // Broadcast to clients
    this._broadcast({
      type: 'log',
      data: entry
    });
  }

  /**
   * Handle error detection
   * @param {object} error - Error object
   */
  _handleError(error) {
    // Add to feed pool
    const handle = this.feedPool.allocate({
      type: 'error',
      timestamp: new Date().toISOString(),
      ...error
    });

    this.feedHandles.push(handle);

    // Trim if exceeds max
    if (this.feedHandles.length > this.maxFeedItems) {
      const oldHandle = this.feedHandles.shift();
      this.feedPool.free(oldHandle);
    }

    // Broadcast to clients
    this._broadcast({
      type: 'error_detected',
      data: error
    });
  }

  /**
   * Handle health check
   * @param {object} event - Health check event
   */
  _handleHealthCheck(event) {
    // Broadcast to clients
    this._broadcast({
      type: 'health_check',
      data: event
    });
  }

  /**
   * Handle status change
   * @param {object} event - Status change event
   */
  _handleStatusChange(event) {
    // Add to feed pool
    const handle = this.feedPool.allocate({
      type: 'status_change',
      timestamp: new Date().toISOString(),
      ...event
    });

    this.feedHandles.push(handle);

    // Trim if exceeds max
    if (this.feedHandles.length > this.maxFeedItems) {
      const oldHandle = this.feedHandles.shift();
      this.feedPool.free(oldHandle);
    }

    // Broadcast to clients
    this._broadcast({
      type: 'status_change',
      data: event
    });
  }

  /**
   * Handle process event
   * @param {object} event - Process event
   */
  _handleProcessEvent(event) {
    // Add to feed pool
    const handle = this.feedPool.allocate({
      type: 'process_event',
      timestamp: new Date().toISOString(),
      ...event
    });

    this.feedHandles.push(handle);

    // Trim if exceeds max
    if (this.feedHandles.length > this.maxFeedItems) {
      const oldHandle = this.feedHandles.shift();
      this.feedPool.free(oldHandle);
    }

    // Broadcast to clients
    this._broadcast({
      type: 'process_event',
      data: event
    });
  }

  /**
   * Generate RSS feed
   * @param {object} req - Request
   * @param {object} res - Response
   */
  async _generateRSSFeed(req, res) {
    const feed = new RSS({
      title: 'CalOS System Logs',
      description: 'Live system logs and events from CalOS',
      feed_url: `http://localhost:${this.port}/feed/rss`,
      site_url: `http://localhost:${this.port}`,
      language: 'en',
      ttl: 60 // 1 minute
    });

    // Get recent logs from handle pool
    const recentHandles = this.feedHandles.slice(-50).reverse();
    for (const handle of recentHandles) {
      const item = this.feedPool.get(handle);
      if (!item) continue;

      const title = this._formatFeedTitle(item);
      const description = this._formatFeedDescription(item);

      feed.item({
        title,
        description,
        date: item.timestamp || new Date(),
        custom_elements: [
          { type: item.type },
          { level: item.level || 'INFO' },
          { source: item.source || 'unknown' }
        ]
      });
    }

    res.set('Content-Type', 'application/rss+xml');
    res.send(feed.xml({ indent: true }));
  }

  /**
   * Generate JSON feed
   * @param {object} req - Request
   * @param {object} res - Response
   */
  async _generateJSONFeed(req, res) {
    const limit = parseInt(req.query.limit) || 50;
    const recentHandles = this.feedHandles.slice(-limit).reverse();

    const items = [];
    for (const handle of recentHandles) {
      const item = this.feedPool.get(handle);
      if (item) {
        items.push({
          id: `${item.timestamp}-${item.type}`,
          title: this._formatFeedTitle(item),
          content_text: this._formatFeedDescription(item),
          date_published: item.timestamp || new Date().toISOString(),
          tags: [item.type, item.level || 'INFO', item.source || 'unknown'].filter(Boolean)
        });
      }
    }

    res.json({
      version: '1.0',
      title: 'CalOS System Logs',
      home_page_url: `http://localhost:${this.port}`,
      feed_url: `http://localhost:${this.port}/feed/json`,
      items
    });
  }

  /**
   * Format feed title
   * @param {object} item - Feed item
   * @returns {string} - Formatted title
   */
  _formatFeedTitle(item) {
    switch (item.type) {
      case 'log':
        return `[${item.level}] ${item.source}: ${item.message.substring(0, 50)}...`;
      case 'error':
        return `❌ Error: ${item.error_type || item.type}`;
      case 'status_change':
        return `${item.to} ${item.name}: Status changed to ${item.color}`;
      case 'process_event':
        return `${item.name}: ${Object.keys(item)[2] || 'event'}`;
      default:
        return `[${item.type}] Event`;
    }
  }

  /**
   * Format feed description
   * @param {object} item - Feed item
   * @returns {string} - Formatted description
   */
  _formatFeedDescription(item) {
    switch (item.type) {
      case 'log':
        return item.message;
      case 'error':
        return `${item.rawLine || item.type}\nAuto-fix: ${item.autoFix || 'none'}`;
      case 'status_change':
        return `${item.name} changed from ${item.from} to ${item.to}\nDetails: ${JSON.stringify(item.details)}`;
      case 'process_event':
        return JSON.stringify(item, null, 2);
      default:
        return JSON.stringify(item, null, 2);
    }
  }

  /**
   * Get recent logs from database
   * @param {number} limit - Number of logs
   * @returns {Promise<Array>} - Log entries
   */
  async _getRecentLogs(limit) {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM log_entries
        ORDER BY timestamp DESC
        LIMIT ${limit};
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const logs = JSON.parse(stdout || '[]');
            resolve(logs);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to get logs: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = LogFeedServer;
