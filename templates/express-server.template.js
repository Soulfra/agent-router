/**
 * Express Server Template
 *
 * Basic Express.js server with common middleware and error handling.
 * Use this template for building web servers, APIs, and OAuth redirect servers.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

class {{CLASS_NAME}} {
  constructor(options = {}) {
    this.config = {
      port: options.port || 3000,
      hostname: options.hostname || 'localhost',
      verbose: options.verbose || false
    };

    this.app = express();
    this.server = null;
    this.isRunning = false;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    console.log('[{{CLASS_NAME}}] Initialized');
  }

  /**
   * Setup middleware
   */
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Home route
    this.app.get('/', (req, res) => {
      res.json({
        name: '{{CLASS_NAME}}',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // {{ROUTES_PLACEHOLDER}}
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('[{{CLASS_NAME}}] Error:', err.message);
      res.status(500).json({
        error: err.message
      });
    });
  }

  /**
   * Start server
   */
  async start() {
    if (this.isRunning) {
      console.log('[{{CLASS_NAME}}] Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.hostname, () => {
        this.isRunning = true;
        console.log(`[{{CLASS_NAME}}] Server started on http://${this.config.hostname}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop server
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('[{{CLASS_NAME}}] Server stopped');
        resolve();
      });
    });
  }
}

module.exports = {{CLASS_NAME}};
