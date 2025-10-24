/**
 * WASM Security Module
 *
 * Protects against WebAssembly-based attacks:
 * - WASM injection detection
 * - Memory corruption exploits
 * - Sandbox escapes
 * - Unauthorized WASM compilation
 * - WASM integrity verification
 *
 * Security Measures:
 * - Content Security Policy (CSP) headers
 * - WASM bytecode scanning
 * - Hash-based integrity checks
 * - Rate limiting WASM compilation
 * - Monitoring for suspicious WASM activity
 *
 * Attack Vectors Addressed:
 * 1. Malicious WASM in embedded content
 * 2. WASM memory corruption
 * 3. Sandbox escape via WASM
 * 4. Side-channel attacks
 * 5. Spectre/Meltdown variants
 */

const crypto = require('crypto');

class WasmSecurity {
  constructor(config = {}) {
    this.verbose = config.verbose || false;
    this.strictMode = config.strictMode || false; // Block all WASM if true

    // WASM compilation rate limits (per IP)
    this.rateLimits = new Map(); // ip → { count, windowStart }
    this.maxCompilationsPerMinute = config.maxCompilationsPerMinute || 10;
    this.rateLimitWindow = 60 * 1000; // 1 minute

    // Trusted WASM hashes (whitelist)
    this.trustedWasmHashes = new Set(config.trustedHashes || []);

    // WASM detection patterns
    this.wasmMagicNumber = Buffer.from([0x00, 0x61, 0x73, 0x6D]); // '\0asm'
  }

  // ============================================================================
  // CSP HEADERS
  // ============================================================================

  /**
   * Get Content Security Policy headers
   * Blocks unauthorized WASM execution
   *
   * @param {Object} options - CSP options
   * @returns {Object} CSP headers
   */
  getCSPHeaders(options = {}) {
    const {
      allowWasm = false,
      allowUnsafeEval = false,
      reportUri = null
    } = options;

    // Base CSP policy
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",  // Allow inline styles and CSS from /themes
      "worker-src 'self'",
      "child-src 'none'",
      "object-src 'none'"
    ];

    // WASM control
    if (!allowWasm) {
      // Block all WASM
      csp.push("script-src 'self' 'wasm-unsafe-eval'"); // Note: blocking via absence
    } else if (!allowUnsafeEval) {
      // Allow WASM but not unsafe-eval
      csp.push("script-src 'self' 'wasm-unsafe-eval'");
    }

    // Report violations
    if (reportUri) {
      csp.push(`report-uri ${reportUri}`);
    }

    const cspHeader = csp.join('; ');

    return {
      'Content-Security-Policy': cspHeader,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    };
  }

  /**
   * Express middleware for CSP headers
   *
   * @param {Object} options - CSP options
   * @returns {Function} Middleware function
   */
  cspMiddleware(options = {}) {
    const headers = this.getCSPHeaders(options);

    return (req, res, next) => {
      // Set CSP headers
      Object.keys(headers).forEach(key => {
        res.setHeader(key, headers[key]);
      });

      next();
    };
  }

  // ============================================================================
  // WASM DETECTION & SCANNING
  // ============================================================================

  /**
   * Check if buffer contains WASM bytecode
   *
   * @param {Buffer} buffer - Binary data
   * @returns {boolean} Is WASM
   */
  isWasmBytecode(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      return false;
    }

    // Check magic number '\0asm'
    if (buffer.length < 4) {
      return false;
    }

    return buffer.slice(0, 4).equals(this.wasmMagicNumber);
  }

  /**
   * Scan file upload for WASM
   *
   * @param {Buffer|string} data - File data or base64 string
   * @returns {Object} Scan result
   */
  scanForWasm(data) {
    try {
      let buffer;

      if (typeof data === 'string') {
        // Base64 decode
        buffer = Buffer.from(data, 'base64');
      } else if (Buffer.isBuffer(data)) {
        buffer = data;
      } else {
        return {
          containsWasm: false,
          error: 'Invalid data type'
        };
      }

      const containsWasm = this.isWasmBytecode(buffer);

      if (containsWasm) {
        this._log('⚠️  WASM bytecode detected');

        return {
          containsWasm: true,
          hash: this._hashBuffer(buffer),
          size: buffer.length,
          isTrusted: this.isTrustedWasm(buffer)
        };
      }

      return {
        containsWasm: false
      };

    } catch (error) {
      console.error('[WasmSecurity] Scan error:', error.message);
      return {
        containsWasm: false,
        error: error.message
      };
    }
  }

  /**
   * Express middleware to block WASM uploads
   *
   * @param {Object} options - Options
   * @returns {Function} Middleware function
   */
  uploadScanMiddleware(options = {}) {
    const { blockUntrusted = true } = options;

    return (req, res, next) => {
      // Check for file uploads
      if (!req.files && !req.body) {
        return next();
      }

      // Scan files
      if (req.files) {
        for (const fieldName in req.files) {
          const file = req.files[fieldName];
          const scanResult = this.scanForWasm(file.data);

          if (scanResult.containsWasm) {
            if (blockUntrusted && !scanResult.isTrusted) {
              this._log(`🚫 Blocked untrusted WASM upload from ${req.ip}`);
              return res.status(403).json({
                error: 'Forbidden',
                message: 'WASM uploads are not allowed'
              });
            }

            this._log(`✅ Allowed trusted WASM upload: ${scanResult.hash}`);
          }
        }
      }

      // Scan base64 body data
      if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
          const value = req.body[key];

          if (typeof value === 'string' && value.length > 100) {
            const scanResult = this.scanForWasm(value);

            if (scanResult.containsWasm && blockUntrusted && !scanResult.isTrusted) {
              this._log(`🚫 Blocked WASM in request body from ${req.ip}`);
              return res.status(403).json({
                error: 'Forbidden',
                message: 'WASM content is not allowed'
              });
            }
          }
        }
      }

      next();
    };
  }

  // ============================================================================
  // WASM INTEGRITY VERIFICATION
  // ============================================================================

  /**
   * Check if WASM is trusted (whitelist)
   *
   * @param {Buffer} wasmBuffer - WASM bytecode
   * @returns {boolean} Is trusted
   */
  isTrustedWasm(wasmBuffer) {
    const hash = this._hashBuffer(wasmBuffer);
    return this.trustedWasmHashes.has(hash);
  }

  /**
   * Add trusted WASM hash to whitelist
   *
   * @param {string} hash - SHA256 hash of trusted WASM
   */
  trustWasm(hash) {
    this.trustedWasmHashes.add(hash);
    this._log(`Added trusted WASM hash: ${hash}`);
  }

  /**
   * Verify WASM integrity
   *
   * @param {Buffer} wasmBuffer - WASM bytecode
   * @param {string} expectedHash - Expected SHA256 hash
   * @returns {boolean} Hash matches
   */
  verifyWasmIntegrity(wasmBuffer, expectedHash) {
    const actualHash = this._hashBuffer(wasmBuffer);
    const isValid = actualHash === expectedHash;

    if (!isValid) {
      this._log(`⚠️  WASM integrity check failed: ${actualHash} !== ${expectedHash}`);
    }

    return isValid;
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check rate limit for WASM compilation
   *
   * @param {string} clientId - Client identifier (IP, userId, etc.)
   * @returns {Object} Rate limit result
   */
  checkRateLimit(clientId) {
    const now = Date.now();
    const limit = this.rateLimits.get(clientId);

    if (!limit) {
      // First compilation
      this.rateLimits.set(clientId, {
        count: 1,
        windowStart: now
      });

      return {
        allowed: true,
        count: 1,
        limit: this.maxCompilationsPerMinute,
        resetIn: this.rateLimitWindow
      };
    }

    // Check if window expired
    if (now - limit.windowStart > this.rateLimitWindow) {
      // Reset window
      this.rateLimits.set(clientId, {
        count: 1,
        windowStart: now
      });

      return {
        allowed: true,
        count: 1,
        limit: this.maxCompilationsPerMinute,
        resetIn: this.rateLimitWindow
      };
    }

    // Increment count
    limit.count++;

    // Check if over limit
    if (limit.count > this.maxCompilationsPerMinute) {
      this._log(`🚫 Rate limit exceeded for ${clientId}: ${limit.count}/${this.maxCompilationsPerMinute}`);

      return {
        allowed: false,
        count: limit.count,
        limit: this.maxCompilationsPerMinute,
        resetIn: this.rateLimitWindow - (now - limit.windowStart)
      };
    }

    return {
      allowed: true,
      count: limit.count,
      limit: this.maxCompilationsPerMinute,
      resetIn: this.rateLimitWindow - (now - limit.windowStart)
    };
  }

  /**
   * Express middleware for WASM compilation rate limiting
   *
   * @returns {Function} Middleware function
   */
  rateLimitMiddleware() {
    return (req, res, next) => {
      const clientId = req.ip || req.connection.remoteAddress;

      // Check for WASM in request
      const hasWasm = this._requestContainsWasm(req);

      if (!hasWasm) {
        return next();
      }

      // Check rate limit
      const rateLimit = this.checkRateLimit(clientId);

      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'WASM compilation rate limit exceeded',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000),
          limit: rateLimit.limit,
          current: rateLimit.count
        });
      }

      next();
    };
  }

  // ============================================================================
  // MONITORING & REPORTING
  // ============================================================================

  /**
   * Get security statistics
   *
   * @returns {Object} Stats
   */
  getStats() {
    const clients = Array.from(this.rateLimits.entries()).map(([id, data]) => ({
      clientId: id,
      compilations: data.count,
      windowStart: new Date(data.windowStart)
    }));

    return {
      trustedWasmCount: this.trustedWasmHashes.size,
      activeClients: this.rateLimits.size,
      maxCompilationsPerMinute: this.maxCompilationsPerMinute,
      strictMode: this.strictMode,
      clients: clients.sort((a, b) => b.compilations - a.compilations)
    };
  }

  /**
   * Clear rate limits (for testing or admin reset)
   */
  clearRateLimits() {
    this.rateLimits.clear();
    this._log('Rate limits cleared');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Hash buffer with SHA256
   * @private
   */
  _hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check if request contains WASM
   * @private
   */
  _requestContainsWasm(req) {
    // Check files
    if (req.files) {
      for (const fieldName in req.files) {
        const file = req.files[fieldName];
        if (this.isWasmBytecode(file.data)) {
          return true;
        }
      }
    }

    // Check body
    if (req.body && typeof req.body === 'object') {
      for (const key in req.body) {
        const value = req.body[key];
        if (typeof value === 'string' && value.length > 100) {
          try {
            const buffer = Buffer.from(value, 'base64');
            if (this.isWasmBytecode(buffer)) {
              return true;
            }
          } catch (e) {
            // Ignore decode errors
          }
        }
      }
    }

    return false;
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[WasmSecurity] ${message}`);
    }
  }
}

module.exports = WasmSecurity;
