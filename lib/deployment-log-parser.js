/**
 * Deployment Log Parser
 *
 * Parses deployment logs from multiple sources:
 * - GitHub Actions logs
 * - deploy.sh script output
 * - Git push/pull output
 * - GitHub Pages build logs
 *
 * Extracts meaningful errors and feeds them into log-aggregator.js
 *
 * Example:
 *   const parser = new DeploymentLogParser();
 *   const parsed = parser.parseDeployScript(stdout);
 *   // { success: true, steps: [...], errors: [], warnings: [] }
 */

class DeploymentLogParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;

    // Regex patterns for different log formats
    this.patterns = {
      // deploy.sh step markers
      deployStep: /^(🔍|✓|❌|⚠️|📝|🔗|📦|⬆️|📄|✅)\s+(.+)$/,

      // Git output patterns
      gitPush: /^To\s+(https?:\/\/github\.com\/.+)$/,
      gitCommit: /^\[(\w+)\s+([a-f0-9]+)\]\s+(.+)$/,
      gitError: /^error:\s+(.+)$/,
      gitFatal: /^fatal:\s+(.+)$/,

      // GitHub Actions patterns
      actionsStep: /^##\[(\w+)\](.+)$/,
      actionsError: /^Error:\s+(.+)$/,
      actionsWarning: /^Warning:\s+(.+)$/,

      // GitHub Pages specific
      pagesEnabled: /GitHub Pages (already )?enabled/,
      pagesDisabled: /GitHub Pages (is )?(not|disabled)/,
      pagesBuildSuccess: /Your site is published at (.+)$/,
      pagesBuildFailed: /Page build failed/
    };

    console.log('[DeploymentLogParser] Initialized');
  }

  /**
   * Parse deploy.sh script output
   */
  parseDeployScript(logText) {
    const lines = logText.split('\n');
    const result = {
      success: false,
      steps: [],
      errors: [],
      warnings: [],
      metadata: {
        timestamp: new Date().toISOString(),
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse deploy.sh steps
      const stepMatch = trimmed.match(this.patterns.deployStep);
      if (stepMatch) {
        const [, emoji, message] = stepMatch;
        const step = {
          emoji,
          message,
          status: this.getStepStatus(emoji),
          timestamp: new Date().toISOString()
        };

        result.steps.push(step);
        result.metadata.totalSteps++;

        if (step.status === 'success') {
          result.metadata.completedSteps++;
        } else if (step.status === 'error') {
          result.metadata.failedSteps++;
          result.errors.push(message);
        } else if (step.status === 'warning') {
          result.warnings.push(message);
        }

        continue;
      }

      // Parse git commit
      const commitMatch = trimmed.match(this.patterns.gitCommit);
      if (commitMatch) {
        const [, branch, hash, message] = commitMatch;
        result.steps.push({
          type: 'commit',
          branch,
          hash,
          message,
          status: 'success',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      // Parse git push
      const pushMatch = trimmed.match(this.patterns.gitPush);
      if (pushMatch) {
        const [, repoUrl] = pushMatch;
        result.steps.push({
          type: 'push',
          repoUrl,
          status: 'success',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      // Parse git errors
      const gitErrorMatch = trimmed.match(this.patterns.gitError);
      if (gitErrorMatch) {
        result.errors.push({
          type: 'git_error',
          message: gitErrorMatch[1],
          line: trimmed
        });
        continue;
      }

      // Parse git fatal errors
      const gitFatalMatch = trimmed.match(this.patterns.gitFatal);
      if (gitFatalMatch) {
        result.errors.push({
          type: 'git_fatal',
          message: gitFatalMatch[1],
          line: trimmed,
          severity: 'critical'
        });
        continue;
      }

      // Parse GitHub Pages status
      if (this.patterns.pagesEnabled.test(trimmed)) {
        result.steps.push({
          type: 'pages_enabled',
          message: trimmed,
          status: 'success',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      if (this.patterns.pagesBuildSuccess.test(trimmed)) {
        const urlMatch = trimmed.match(this.patterns.pagesBuildSuccess);
        result.steps.push({
          type: 'pages_published',
          url: urlMatch ? urlMatch[1] : null,
          message: trimmed,
          status: 'success',
          timestamp: new Date().toISOString()
        });
        result.success = true; // Deployment confirmed successful
        continue;
      }

      if (this.patterns.pagesBuildFailed.test(trimmed)) {
        result.errors.push({
          type: 'pages_build_failed',
          message: trimmed,
          severity: 'critical'
        });
        continue;
      }
    }

    // Determine overall success
    if (result.errors.length === 0 && result.metadata.completedSteps > 0) {
      result.success = true;
    }

    return result;
  }

  /**
   * Parse GitHub Actions workflow log
   */
  parseGitHubActions(logText) {
    const lines = logText.split('\n');
    const result = {
      success: false,
      steps: [],
      errors: [],
      warnings: [],
      metadata: {
        workflow: null,
        job: null,
        timestamp: new Date().toISOString()
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse Actions step markers
      const stepMatch = trimmed.match(this.patterns.actionsStep);
      if (stepMatch) {
        const [, command, message] = stepMatch;
        result.steps.push({
          command,
          message: message.trim(),
          timestamp: new Date().toISOString()
        });
        continue;
      }

      // Parse Actions errors
      const errorMatch = trimmed.match(this.patterns.actionsError);
      if (errorMatch) {
        result.errors.push({
          type: 'actions_error',
          message: errorMatch[1],
          line: trimmed
        });
        continue;
      }

      // Parse Actions warnings
      const warningMatch = trimmed.match(this.patterns.actionsWarning);
      if (warningMatch) {
        result.warnings.push({
          type: 'actions_warning',
          message: warningMatch[1],
          line: trimmed
        });
        continue;
      }
    }

    result.success = result.errors.length === 0;

    return result;
  }

  /**
   * Parse git push/pull output
   */
  parseGitOutput(logText) {
    const result = {
      success: false,
      operations: [],
      errors: [],
      warnings: [],
      metadata: {}
    };

    const lines = logText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for errors
      if (this.patterns.gitError.test(trimmed)) {
        const match = trimmed.match(this.patterns.gitError);
        result.errors.push({
          type: 'git_error',
          message: match[1],
          line: trimmed
        });
        continue;
      }

      // Check for fatal errors
      if (this.patterns.gitFatal.test(trimmed)) {
        const match = trimmed.match(this.patterns.gitFatal);
        result.errors.push({
          type: 'git_fatal',
          message: match[1],
          line: trimmed,
          severity: 'critical'
        });
        continue;
      }

      // Check for push success
      if (this.patterns.gitPush.test(trimmed)) {
        const match = trimmed.match(this.patterns.gitPush);
        result.operations.push({
          type: 'push',
          destination: match[1],
          success: true
        });
        result.success = true;
        continue;
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Extract error summary from parsed logs
   */
  extractErrorSummary(parsedLog) {
    const errors = parsedLog.errors || [];

    if (errors.length === 0) {
      return { hasErrors: false, summary: 'No errors detected' };
    }

    const summary = {
      hasErrors: true,
      totalErrors: errors.length,
      criticalErrors: errors.filter(e => e.severity === 'critical').length,
      errorTypes: {},
      messages: []
    };

    for (const error of errors) {
      const type = error.type || 'unknown';
      summary.errorTypes[type] = (summary.errorTypes[type] || 0) + 1;
      summary.messages.push(error.message || error.line);
    }

    return summary;
  }

  /**
   * Determine step status from emoji
   */
  getStepStatus(emoji) {
    const statusMap = {
      '✓': 'success',
      '✅': 'success',
      '🟢': 'success',
      '❌': 'error',
      '🔴': 'error',
      '⚠️': 'warning',
      '🟡': 'warning',
      '🔍': 'in_progress',
      '📝': 'in_progress',
      '🔗': 'in_progress',
      '📦': 'in_progress',
      '⬆️': 'in_progress',
      '📄': 'in_progress'
    };

    return statusMap[emoji] || 'unknown';
  }

  /**
   * Format parsed log for human readability
   */
  formatForDisplay(parsedLog) {
    const lines = [];

    lines.push('═══════════════════════════════════════');
    lines.push('  Deployment Log Summary');
    lines.push('═══════════════════════════════════════');
    lines.push('');

    // Overall status
    lines.push(`Status: ${parsedLog.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    lines.push('');

    // Steps
    if (parsedLog.steps && parsedLog.steps.length > 0) {
      lines.push('Steps:');
      for (const step of parsedLog.steps) {
        const statusIcon = step.status === 'success' ? '✓' :
                          step.status === 'error' ? '✗' :
                          step.status === 'warning' ? '⚠' : '○';
        const message = step.message || step.type;
        lines.push(`  ${statusIcon} ${message}`);
      }
      lines.push('');
    }

    // Errors
    if (parsedLog.errors && parsedLog.errors.length > 0) {
      lines.push('Errors:');
      for (const error of parsedLog.errors) {
        lines.push(`  ✗ ${error.message || error.line}`);
      }
      lines.push('');
    }

    // Warnings
    if (parsedLog.warnings && parsedLog.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of parsedLog.warnings) {
        lines.push(`  ⚠ ${typeof warning === 'string' ? warning : warning.message}`);
      }
      lines.push('');
    }

    // Metadata
    if (parsedLog.metadata) {
      lines.push('Metadata:');
      for (const [key, value] of Object.entries(parsedLog.metadata)) {
        lines.push(`  ${key}: ${value}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════');

    return lines.join('\n');
  }
}

module.exports = DeploymentLogParser;
