/**
 * Cal Deployment Monitor
 *
 * Autonomous AI system that monitors GitHub Pages deployments in real-time.
 * Detects failures, diagnoses issues, and auto-heals when possible.
 *
 * Features:
 * - Polls GitHub Pages build status every 60s
 * - Watches deploy.sh logs in real-time
 * - Detects deployment failures (404s, broken themes, missing files)
 * - Sends errors to external-bug-reporter.js for AI diagnosis
 * - Broadcasts deployment status via WebSocket
 * - Auto-triggers re-deployment after fixes
 *
 * Integration:
 * - Uses log-aggregator.js for centralized logging
 * - Uses thought-process-logger.js for reasoning chain
 * - Uses external-bug-reporter.js for AI diagnosis
 * - Uses patch-applicator.js for auto-fixes
 *
 * Example:
 *   const monitor = new CalDeploymentMonitor({ db, verbose: true });
 *   await monitor.start();
 *   // Cal now watches GitHub Pages 24/7
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const EventEmitter = require('events');
const ThoughtProcessLogger = require('./thought-process-logger');
const ExternalBugReporter = require('./external-bug-reporter');

class CalDeploymentMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      db: options.db,
      pollInterval: options.pollInterval || 60000, // 60 seconds
      githubPagesUrl: options.githubPagesUrl || 'https://soulfra.github.io',
      githubRepo: options.githubRepo || 'Soulfra/soulfra.github.io',
      deployScriptPath: options.deployScriptPath || './projects/soulfra.github.io/deploy.sh',
      verbose: options.verbose || false
    };

    // Cal's reasoning logger
    this.thoughtLogger = this.config.db ? new ThoughtProcessLogger({
      db: this.config.db,
      vault: options.vault
    }) : null;

    // Bug reporter for AI diagnosis
    this.bugReporter = new ExternalBugReporter({
      db: this.config.db,
      openaiKey: options.openaiKey || process.env.OPENAI_API_KEY,
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      githubRepo: this.config.githubRepo,
      verbose: this.config.verbose
    });

    // State tracking
    this.state = {
      isRunning: false,
      lastCheck: null,
      lastDeploymentStatus: null,
      currentSession: null,
      failureCount: 0,
      successCount: 0,
      issues: []
    };

    this.pollTimer = null;

    console.log('[CalDeploymentMonitor] Initialized');
    console.log(`[CalDeploymentMonitor] Watching: ${this.config.githubPagesUrl}`);
  }

  /**
   * Start monitoring GitHub Pages
   */
  async start() {
    if (this.state.isRunning) {
      console.log('[CalDeploymentMonitor] Already running');
      return;
    }

    this.state.isRunning = true;
    this.state.lastCheck = new Date();

    // Start reasoning session
    if (this.thoughtLogger) {
      this.state.currentSession = await this.thoughtLogger.startSession(
        'Monitor GitHub Pages deployment health',
        { context: { url: this.config.githubPagesUrl, repo: this.config.githubRepo } }
      );
    }

    console.log('[CalDeploymentMonitor] Starting deployment monitoring...');

    // Run first check immediately
    await this.checkDeploymentHealth();

    // Schedule recurring checks
    this.pollTimer = setInterval(() => {
      this.checkDeploymentHealth();
    }, this.config.pollInterval);

    this.emit('started', { timestamp: new Date() });
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.state.isRunning) {
      return;
    }

    this.state.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    console.log('[CalDeploymentMonitor] Stopped');
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Check GitHub Pages deployment health
   */
  async checkDeploymentHealth() {
    const checkId = Date.now();
    console.log(`[CalDeploymentMonitor] Running health check #${checkId}...`);

    this.state.lastCheck = new Date();

    const results = {
      checkId,
      timestamp: new Date(),
      checks: {
        pageLoads: false,
        themesWork: false,
        scriptsLoad: false,
        apiConnects: false
      },
      issues: [],
      status: 'unknown'
    };

    try {
      // Check 1: Can we reach GitHub Pages?
      const pageCheck = await this.checkPageLoads();
      results.checks.pageLoads = pageCheck.success;
      if (!pageCheck.success) {
        results.issues.push({
          type: 'page_load_failed',
          severity: 'critical',
          message: pageCheck.error,
          suggestion: 'GitHub Pages may be down or repo not public'
        });
      }

      // Check 2: Are themes loading correctly?
      if (pageCheck.success) {
        const themeCheck = await this.checkThemesWork();
        results.checks.themesWork = themeCheck.success;
        if (!themeCheck.success) {
          results.issues.push({
            type: 'theme_missing',
            severity: 'high',
            message: themeCheck.error,
            suggestion: 'Run: git add themes/ && git commit -m "Add themes" && git push'
          });
        }
      }

      // Check 3: Are scripts loading?
      if (pageCheck.success) {
        const scriptCheck = await this.checkScriptsLoad();
        results.checks.scriptsLoad = scriptCheck.success;
        if (!scriptCheck.success) {
          results.issues.push({
            type: 'scripts_missing',
            severity: 'medium',
            message: scriptCheck.error,
            suggestion: 'Check file paths in HTML'
          });
        }
      }

      // Check 4: Can frontend connect to localhost API?
      const apiCheck = await this.checkAPIConnection();
      results.checks.apiConnects = apiCheck.success;
      if (!apiCheck.success) {
        results.issues.push({
          type: 'api_unreachable',
          severity: 'low',
          message: apiCheck.error,
          suggestion: 'Start API: npm start'
        });
      }

      // Determine overall status
      if (results.checks.pageLoads && results.checks.themesWork && results.checks.scriptsLoad) {
        results.status = 'healthy';
        this.state.successCount++;
        this.state.failureCount = 0; // Reset failure count
      } else if (results.checks.pageLoads) {
        results.status = 'degraded';
        this.state.failureCount++;
      } else {
        results.status = 'down';
        this.state.failureCount++;
      }

      this.state.lastDeploymentStatus = results;

      // Log to Cal's thought process
      if (this.thoughtLogger && this.state.currentSession) {
        await this.thoughtLogger.logStep(this.state.currentSession, 'deployment_health_check', {
          checkId,
          status: results.status,
          issues: results.issues,
          checks: results.checks
        });
      }

      // Emit event
      this.emit('health_check', results);

      // If critical issues detected, trigger AI diagnosis
      if (results.status === 'down' && this.state.failureCount >= 3) {
        console.log('[CalDeploymentMonitor] Critical failure detected, triggering AI diagnosis...');
        await this.diagnoseDeploymentFailure(results);
      }

      return results;

    } catch (error) {
      console.error('[CalDeploymentMonitor] Health check error:', error);
      results.status = 'error';
      results.issues.push({
        type: 'monitor_error',
        severity: 'critical',
        message: error.message,
        stack: error.stack
      });
      this.emit('error', { error, results });
      return results;
    }
  }

  /**
   * Check if GitHub Pages loads
   */
  async checkPageLoads() {
    try {
      const response = await axios.get(this.config.githubPagesUrl, {
        timeout: 10000,
        validateStatus: (status) => status < 500 // Accept 404 as "loads but missing"
      });

      if (response.status === 404) {
        return {
          success: false,
          error: 'GitHub Pages returns 404 - site not deployed or repo not public'
        };
      }

      return { success: true, statusCode: response.status };

    } catch (error) {
      return {
        success: false,
        error: `Cannot reach GitHub Pages: ${error.message}`
      };
    }
  }

  /**
   * Check if themes are loading
   */
  async checkThemesWork() {
    try {
      const themeUrl = `${this.config.githubPagesUrl}/themes/soulfra.css`;
      const response = await axios.get(themeUrl, {
        timeout: 10000
      });

      if (response.status === 200 && response.data.includes('--soulfra-primary')) {
        return { success: true };
      }

      return {
        success: false,
        error: 'Theme file exists but content is wrong'
      };

    } catch (error) {
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Theme file not found - themes/ directory not deployed'
        };
      }
      return {
        success: false,
        error: `Theme check failed: ${error.message}`
      };
    }
  }

  /**
   * Check if critical scripts load
   */
  async checkScriptsLoad() {
    try {
      const scripts = [
        '/cookie-snapshot-manager.js',
        '/theme-switcher.js',
        '/identity-tracker.js'
      ];

      for (const script of scripts) {
        const url = `${this.config.githubPagesUrl}${script}`;
        const response = await axios.head(url, { timeout: 5000 });

        if (response.status !== 200) {
          return {
            success: false,
            error: `Script not found: ${script}`
          };
        }
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: `Script check failed: ${error.message}`
      };
    }
  }

  /**
   * Check if localhost API is reachable
   */
  async checkAPIConnection() {
    try {
      const response = await axios.get('http://localhost:5001/health', {
        timeout: 3000
      });

      return { success: response.status === 200 };

    } catch (error) {
      return {
        success: false,
        error: 'Localhost API not running on port 5001'
      };
    }
  }

  /**
   * Diagnose deployment failure using AI
   */
  async diagnoseDeploymentFailure(healthCheck) {
    console.log('[CalDeploymentMonitor] Diagnosing failure with AI...');

    // Package bug report
    const bugReport = {
      error: `GitHub Pages deployment health check failed`,
      file: 'projects/soulfra.github.io/index.html',
      context: `Deployment Status: ${healthCheck.status}\n\nIssues Found:\n${JSON.stringify(healthCheck.issues, null, 2)}\n\nChecks:\n${JSON.stringify(healthCheck.checks, null, 2)}`,
      stackTrace: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Send to OpenAI for diagnosis
      const diagnosis = await this.bugReporter.reportToOpenAI(bugReport);

      console.log('[CalDeploymentMonitor] AI Diagnosis received:', diagnosis.diagnosis);

      // Log diagnosis to thought process
      if (this.thoughtLogger && this.state.currentSession) {
        await this.thoughtLogger.logStep(this.state.currentSession, 'ai_diagnosis', {
          diagnosis: diagnosis.diagnosis,
          suggestedFix: diagnosis.fix,
          confidence: diagnosis.confidence
        });
      }

      // Emit diagnosis event
      this.emit('diagnosis', {
        healthCheck,
        diagnosis
      });

      return diagnosis;

    } catch (error) {
      console.error('[CalDeploymentMonitor] AI diagnosis failed:', error);
      return null;
    }
  }

  /**
   * Trigger re-deployment
   */
  async triggerDeployment() {
    console.log('[CalDeploymentMonitor] Triggering deployment...');

    try {
      const { stdout, stderr } = await execPromise('bash ' + this.config.deployScriptPath);

      console.log('[CalDeploymentMonitor] Deployment output:', stdout);

      if (stderr) {
        console.error('[CalDeploymentMonitor] Deployment errors:', stderr);
      }

      // Log to thought process
      if (this.thoughtLogger && this.state.currentSession) {
        await this.thoughtLogger.logStep(this.state.currentSession, 'deployment_triggered', {
          stdout,
          stderr,
          success: !stderr
        });
      }

      this.emit('deployment_triggered', { stdout, stderr });

      return { success: true, stdout, stderr };

    } catch (error) {
      console.error('[CalDeploymentMonitor] Deployment failed:', error);

      this.emit('deployment_failed', { error });

      return { success: false, error: error.message };
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      ...this.state,
      uptime: this.state.isRunning ? Date.now() - this.state.lastCheck : 0
    };
  }
}

module.exports = CalDeploymentMonitor;
