/**
 * Cal Error Reporter
 *
 * Automatically captures JavaScript errors and reports them to Cal's knowledge system.
 * Include this script in your HTML to enable frontend error learning.
 *
 * Usage:
 *   <script src="/lib/cal-error-reporter.js"></script>
 *   <script>
 *     CalErrorReporter.init({
 *       apiUrl: 'http://localhost:5001',
 *       userId: 'user-123',  // Optional
 *       enabled: true
 *     });
 *   </script>
 */

(function(window) {
  'use strict';

  const CalErrorReporter = {
    config: {
      apiUrl: '',
      userId: null,
      sessionId: null,
      enabled: true,
      maxConsoleLogs: 10,
      reportToConsole: true
    },

    consoleLogs: [],
    originalConsoleLog: null,
    originalConsoleError: null,
    originalConsoleWarn: null,

    /**
     * Initialize the error reporter
     */
    init: function(options = {}) {
      Object.assign(this.config, options);

      // Generate session ID if not provided
      if (!this.config.sessionId) {
        this.config.sessionId = this.generateSessionId();
      }

      // Install global error handler
      this.installErrorHandlers();

      // Intercept console methods
      this.interceptConsole();

      if (this.config.reportToConsole) {
        console.log('[CalErrorReporter] Initialized', {
          sessionId: this.config.sessionId,
          userId: this.config.userId || 'anonymous'
        });
      }
    },

    /**
     * Install global error handlers
     */
    installErrorHandlers: function() {
      const self = this;

      // Catch unhandled JavaScript errors
      window.addEventListener('error', function(event) {
        self.reportError({
          errorType: 'js_error',
          errorMessage: event.message,
          sourceFile: event.filename,
          lineNumber: event.lineno,
          columnNumber: event.colno,
          stackTrace: event.error?.stack || null
        });
      }, true);

      // Catch unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        self.reportError({
          errorType: 'unhandled_rejection',
          errorMessage: event.reason?.message || String(event.reason),
          stackTrace: event.reason?.stack || null
        });
      });

      // Catch network errors (fetch failures)
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).catch(function(error) {
          self.reportError({
            errorType: 'network_error',
            errorMessage: `Fetch failed: ${args[0]}`,
            stackTrace: error.stack
          });
          throw error; // Re-throw to maintain normal behavior
        });
      };
    },

    /**
     * Intercept console methods to capture logs
     */
    interceptConsole: function() {
      const self = this;

      // Save originals
      this.originalConsoleLog = console.log;
      this.originalConsoleError = console.error;
      this.originalConsoleWarn = console.warn;

      // Intercept console.log
      console.log = function(...args) {
        self.addConsoleLog('log', args);
        self.originalConsoleLog.apply(console, args);
      };

      // Intercept console.error
      console.error = function(...args) {
        self.addConsoleLog('error', args);
        self.originalConsoleError.apply(console, args);
      };

      // Intercept console.warn
      console.warn = function(...args) {
        self.addConsoleLog('warn', args);
        self.originalConsoleWarn.apply(console, args);
      };
    },

    /**
     * Add console log to buffer
     */
    addConsoleLog: function(level, args) {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      this.consoleLogs.push({
        level: level,
        message: message,
        timestamp: new Date().toISOString()
      });

      // Keep only last N logs
      if (this.consoleLogs.length > this.config.maxConsoleLogs) {
        this.consoleLogs.shift();
      }
    },

    /**
     * Report an error to the backend
     */
    reportError: function(errorData) {
      if (!this.config.enabled || !this.config.apiUrl) {
        return;
      }

      const payload = {
        userId: this.config.userId,
        sessionId: this.config.sessionId,
        pageUrl: window.location.href,
        browserInfo: this.getBrowserInfo(),
        consoleLogs: this.consoleLogs,
        ...errorData
      };

      // Send to backend (don't await to avoid blocking)
      fetch(`${this.config.apiUrl}/api/knowledge/learn-from-frontend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(response => response.json())
      .then(data => {
        if (this.config.reportToConsole) {
          console.log('[CalErrorReporter] Error reported:', data);

          // If there's a known solution, show it
          if (data.knownIssue) {
            console.warn('[CalErrorReporter] 🔧 Known Issue Detected!');
            console.warn(`Pattern: ${data.knownIssue.pattern}`);
            console.warn(`Solution: ${data.knownIssue.solution}`);
            console.warn(`Severity: ${data.knownIssue.severity}`);
          }
        }
      })
      .catch(err => {
        // Don't report errors about reporting errors (infinite loop!)
        if (this.config.reportToConsole) {
          console.error('[CalErrorReporter] Failed to report error:', err);
        }
      });
    },

    /**
     * Get browser information
     */
    getBrowserInfo: function() {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height
        },
        url: window.location.href,
        referrer: document.referrer
      };
    },

    /**
     * Generate a unique session ID
     */
    generateSessionId: function() {
      return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Manually report an error (for use in try-catch blocks)
     */
    reportManualError: function(error, context = {}) {
      this.reportError({
        errorType: 'manual_error',
        errorMessage: error.message || String(error),
        stackTrace: error.stack || null,
        ...context
      });
    }
  };

  // Expose to window
  window.CalErrorReporter = CalErrorReporter;

})(window);
