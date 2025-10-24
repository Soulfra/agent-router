#!/usr/bin/env node

/**
 * Self-Healing Test System
 *
 * Automatically detects and fixes failing tests when APIs change.
 *
 * Features:
 * - Monitors test failures
 * - Analyzes what changed in the API
 * - Generates fixes using AI
 * - Applies fixes and re-runs tests
 * - Creates changelog of automatic fixes
 *
 * Usage:
 *   node lib/self-healing-test-system.js
 *   node lib/self-healing-test-system.js --auto-apply
 *   node lib/self-healing-test-system.js --platform shopify
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

class FailureAnalyzer {
  constructor() {
    this.commonPatterns = {
      statusCodeChange: /Expected status (\d+), got (\d+)/,
      fieldMissing: /Expected ([\w.]+) to exist, but it was undefined/,
      fieldValueChange: /Expected ([\w.]+) to be (.*), got (.*)/,
      authenticationError: /401|Unauthorized|Invalid token/,
      rateLimitError: /429|Too Many Requests|Rate limit/,
      notFoundError: /404|Not Found/,
      schemaChange: /invalid|not found|deprecated/i
    };
  }

  /**
   * Analyze a test failure and determine the root cause
   */
  analyzeFailure(testResult) {
    const { error, test } = testResult;
    const errorMessage = error.message || error.toString();

    const analysis = {
      test: test.name || test.content,
      platform: test.platform,
      errorType: this.detectErrorType(errorMessage),
      errorMessage,
      suggestedFix: null,
      confidence: 0
    };

    // Detect specific failure patterns
    if (this.commonPatterns.statusCodeChange.test(errorMessage)) {
      const match = errorMessage.match(this.commonPatterns.statusCodeChange);
      analysis.errorType = 'status_code_change';
      analysis.details = {
        expected: parseInt(match[1]),
        actual: parseInt(match[2])
      };
      analysis.suggestedFix = this.generateStatusCodeFix(analysis.details);
      analysis.confidence = 0.9;
    } else if (this.commonPatterns.fieldMissing.test(errorMessage)) {
      const match = errorMessage.match(this.commonPatterns.fieldMissing);
      analysis.errorType = 'field_missing';
      analysis.details = {
        field: match[1]
      };
      analysis.suggestedFix = this.generateFieldMissingFix(analysis.details);
      analysis.confidence = 0.7;
    } else if (this.commonPatterns.fieldValueChange.test(errorMessage)) {
      const match = errorMessage.match(this.commonPatterns.fieldValueChange);
      analysis.errorType = 'field_value_change';
      analysis.details = {
        field: match[1],
        expected: match[2],
        actual: match[3]
      };
      analysis.suggestedFix = this.generateFieldValueFix(analysis.details);
      analysis.confidence = 0.8;
    } else if (this.commonPatterns.authenticationError.test(errorMessage)) {
      analysis.errorType = 'authentication_error';
      analysis.suggestedFix = {
        type: 'manual',
        message: 'Check API credentials and token expiration'
      };
      analysis.confidence = 0.95;
    } else if (this.commonPatterns.rateLimitError.test(errorMessage)) {
      analysis.errorType = 'rate_limit_error';
      analysis.suggestedFix = {
        type: 'retry',
        message: 'Add exponential backoff and retry logic'
      };
      analysis.confidence = 0.95;
    }

    return analysis;
  }

  /**
   * Detect error type from message
   */
  detectErrorType(errorMessage) {
    if (this.commonPatterns.authenticationError.test(errorMessage)) {
      return 'authentication_error';
    }
    if (this.commonPatterns.rateLimitError.test(errorMessage)) {
      return 'rate_limit_error';
    }
    if (this.commonPatterns.notFoundError.test(errorMessage)) {
      return 'not_found_error';
    }
    if (this.commonPatterns.schemaChange.test(errorMessage)) {
      return 'schema_change';
    }
    return 'unknown';
  }

  /**
   * Generate fix for status code change
   */
  generateStatusCodeFix(details) {
    return {
      type: 'update_expectation',
      changes: {
        status: details.actual
      },
      reason: `API now returns ${details.actual} instead of ${details.expected}`
    };
  }

  /**
   * Generate fix for missing field
   */
  generateFieldMissingFix(details) {
    return {
      type: 'remove_expectation',
      field: details.field,
      reason: `Field ${details.field} no longer exists in API response`
    };
  }

  /**
   * Generate fix for field value change
   */
  generateFieldValueFix(details) {
    return {
      type: 'update_expectation',
      changes: {
        [details.field]: details.actual
      },
      reason: `Field ${details.field} now returns ${details.actual}`
    };
  }
}

class FixGenerator {
  constructor() {
    this.ollamaUrl = 'http://localhost:11434';
  }

  /**
   * Generate a fix using AI analysis
   */
  async generateFix(analysis, testSource) {
    if (analysis.confidence >= 0.8 && analysis.suggestedFix) {
      // High confidence fix, use suggested fix
      return this.applyPatternBasedFix(analysis.suggestedFix, testSource);
    }

    // Low confidence, use AI to analyze
    return await this.generateAIFix(analysis, testSource);
  }

  /**
   * Apply a pattern-based fix
   */
  applyPatternBasedFix(suggestedFix, testSource) {
    switch (suggestedFix.type) {
      case 'update_expectation':
        return this.updateExpectations(testSource, suggestedFix.changes);
      case 'remove_expectation':
        return this.removeExpectation(testSource, suggestedFix.field);
      case 'retry':
        return this.addRetryLogic(testSource);
      default:
        return {
          success: false,
          message: suggestedFix.message || 'Manual intervention required'
        };
    }
  }

  /**
   * Update test expectations
   */
  updateExpectations(testSource, changes) {
    let updated = testSource;

    // Parse test source
    try {
      if (testSource.trim().startsWith('{')) {
        // JSON format
        const test = JSON.parse(testSource);
        if (test.expect) {
          test.expect = { ...test.expect, ...changes };
        }
        updated = JSON.stringify(test, null, 2);
      } else if (testSource.includes('Expect:')) {
        // HTTP format
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'status') {
            updated = updated.replace(/Expect:\s+\d+/, `Expect: ${value}`);
          }
        }
      } else if (testSource.includes('assert ')) {
        // Assertion format
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'status') {
            updated = updated.replace(
              /assert response\.status === \d+/,
              `assert response.status === ${value}`
            );
          }
        }
      }

      return {
        success: true,
        originalSource: testSource,
        updatedSource: updated,
        changes
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove expectation from test
   */
  removeExpectation(testSource, field) {
    let updated = testSource;

    try {
      if (testSource.trim().startsWith('{')) {
        // JSON format
        const test = JSON.parse(testSource);
        if (test.expect && test.expect[field]) {
          delete test.expect[field];
        }
        updated = JSON.stringify(test, null, 2);
      } else if (testSource.includes('Expect:')) {
        // HTTP format - remove line with field
        const lines = testSource.split('\n');
        updated = lines.filter(line => !line.includes(`body.${field}`)).join('\n');
      } else if (testSource.includes('assert ')) {
        // Assertion format - remove assertion line
        const lines = testSource.split('\n');
        updated = lines.filter(line => !line.includes(`response.${field}`)).join('\n');
      }

      return {
        success: true,
        originalSource: testSource,
        updatedSource: updated,
        removed: field
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add retry logic to test
   */
  addRetryLogic(testSource) {
    // This would add retry logic to the test runner, not the test itself
    return {
      success: true,
      message: 'Retry logic should be added at test runner level',
      recommendation: 'Add exponential backoff to test executor'
    };
  }

  /**
   * Generate fix using AI
   */
  async generateAIFix(analysis, testSource) {
    try {
      const prompt = this.buildAIPrompt(analysis, testSource);
      const response = await this.queryOllama(prompt);

      return {
        success: true,
        aiGenerated: true,
        analysis: response,
        confidence: 0.6
      };
    } catch (error) {
      return {
        success: false,
        error: `AI fix generation failed: ${error.message}`
      };
    }
  }

  /**
   * Build prompt for AI
   */
  buildAIPrompt(analysis, testSource) {
    return `You are a test fixing assistant. Analyze this failing test and suggest a fix.

Test Platform: ${analysis.platform}
Error Type: ${analysis.errorType}
Error Message: ${analysis.errorMessage}

Test Source:
${testSource}

Provide:
1. Root cause of the failure
2. Specific fix to apply
3. Updated test source code
4. Explanation of the change

Format your response as JSON:
{
  "rootCause": "...",
  "fix": "...",
  "updatedSource": "...",
  "explanation": "..."
}`;
  }

  /**
   * Query Ollama for AI analysis
   */
  async queryOllama(prompt) {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'calos-model:latest',
        prompt,
        stream: false
      }, {
        timeout: 30000
      });

      if (response.data && response.data.response) {
        try {
          return JSON.parse(response.data.response);
        } catch {
          return { analysis: response.data.response };
        }
      }

      return null;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('  Note: Ollama not available for AI-assisted fixes');
      }
      throw error;
    }
  }
}

class TestFixer {
  constructor(options = {}) {
    this.options = {
      autoApply: options.autoApply || false,
      backupDir: options.backupDir || './test-backups',
      verbose: options.verbose || false
    };

    this.fixes = [];
  }

  /**
   * Apply a fix to a test file
   */
  async applyFix(filePath, lineNumber, originalSource, updatedSource) {
    try {
      // Backup original file
      await this.backupFile(filePath);

      // Read file
      let content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Find and replace test block
      let inTestBlock = false;
      let testBlockStart = -1;
      let testBlockEnd = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.match(/^```test:/)) {
          if (i >= lineNumber - 5 && i <= lineNumber + 5) {
            inTestBlock = true;
            testBlockStart = i + 1;
          }
        } else if (line.match(/^```$/) && inTestBlock) {
          testBlockEnd = i;
          break;
        }
      }

      if (testBlockStart !== -1 && testBlockEnd !== -1) {
        // Replace test block content
        const before = lines.slice(0, testBlockStart);
        const after = lines.slice(testBlockEnd);
        const updated = [...before, updatedSource, ...after];

        content = updated.join('\n');
        fs.writeFileSync(filePath, content);

        this.fixes.push({
          file: filePath,
          lineNumber,
          originalSource,
          updatedSource,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          message: `Fixed test at ${filePath}:${lineNumber}`
        };
      }

      return {
        success: false,
        message: 'Could not locate test block in file'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup a file before modifying
   */
  async backupFile(filePath) {
    const backupPath = path.join(
      this.options.backupDir,
      path.basename(filePath) + '.' + Date.now() + '.bak'
    );

    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(filePath, backupPath);

    if (this.options.verbose) {
      console.log(`  Backed up: ${backupPath}`);
    }
  }

  /**
   * Get all fixes applied
   */
  getFixes() {
    return this.fixes;
  }

  /**
   * Generate fix report
   */
  generateReport() {
    const report = {
      totalFixes: this.fixes.length,
      fixes: this.fixes,
      timestamp: new Date().toISOString()
    };

    return report;
  }
}

class SelfHealingTestSystem {
  constructor(options = {}) {
    this.options = {
      autoApply: options.autoApply || false,
      platform: options.platform || null,
      maxRetries: options.maxRetries || 3,
      outputDir: options.outputDir || './test-results',
      verbose: options.verbose || false
    };

    this.analyzer = new FailureAnalyzer();
    this.fixGenerator = new FixGenerator();
    this.testFixer = new TestFixer(options);

    this.results = {
      totalTests: 0,
      failedTests: 0,
      fixedTests: 0,
      unfixableTests: 0,
      analyses: [],
      fixes: []
    };
  }

  /**
   * Run the self-healing test system
   */
  async run() {
    console.log('Self-Healing Test System');
    console.log('='.repeat(50));
    console.log(`Auto-apply: ${this.options.autoApply ? 'YES' : 'NO'}`);
    if (this.options.platform) {
      console.log(`Platform filter: ${this.options.platform}`);
    }
    console.log('='.repeat(50) + '\n');

    // Step 1: Run tests and collect failures
    console.log('Step 1: Running tests...\n');
    const failures = await this.runTestsAndCollectFailures();

    if (failures.length === 0) {
      console.log('✓ All tests passed! No fixes needed.\n');
      return this.generateFinalReport();
    }

    console.log(`\nFound ${failures.length} failing test(s)\n`);

    // Step 2: Analyze failures
    console.log('Step 2: Analyzing failures...\n');
    for (const failure of failures) {
      const analysis = this.analyzer.analyzeFailure(failure);
      this.results.analyses.push(analysis);

      console.log(`  Test: ${analysis.test}`);
      console.log(`  Error: ${analysis.errorType}`);
      console.log(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

      if (analysis.suggestedFix) {
        console.log(`  Fix: ${analysis.suggestedFix.reason || analysis.suggestedFix.message}`);
      }
      console.log('');
    }

    // Step 3: Generate fixes
    console.log('Step 3: Generating fixes...\n');
    for (const analysis of this.results.analyses) {
      const failure = failures.find(f => f.test.content === analysis.test);
      if (!failure) continue;

      const fix = await this.fixGenerator.generateFix(analysis, failure.test.content);

      if (fix.success) {
        console.log(`  ✓ Generated fix for: ${analysis.test}`);
        this.results.fixes.push({
          analysis,
          fix,
          failure
        });
      } else {
        console.log(`  ✗ Could not generate fix for: ${analysis.test}`);
        this.results.unfixableTests++;
      }
    }

    console.log('');

    // Step 4: Apply fixes (if auto-apply enabled)
    if (this.options.autoApply) {
      console.log('Step 4: Applying fixes...\n');
      await this.applyFixes();
    } else {
      console.log('Step 4: Fixes ready (use --auto-apply to apply)\n');
      this.showFixPreview();
    }

    // Step 5: Re-run tests to verify
    if (this.options.autoApply) {
      console.log('\nStep 5: Re-running tests to verify fixes...\n');
      await this.verifyFixes();
    }

    return this.generateFinalReport();
  }

  /**
   * Run tests and collect failures
   */
  async runTestsAndCollectFailures() {
    const failures = [];

    try {
      // Run executable docs tests
      const { ExecutableDocsRunner } = require('./executable-docs-runner.js');
      const runner = new ExecutableDocsRunner({ verbose: false });

      await runner.runDirectory('.');

      // Collect failures
      for (const result of runner.executor.results) {
        if (result.status === 'fail') {
          failures.push({
            test: result,
            error: { message: result.error }
          });
        }
      }

      this.results.totalTests = runner.executor.results.length;
      this.results.failedTests = failures.length;

    } catch (error) {
      console.error(`Error running tests: ${error.message}`);
    }

    return failures;
  }

  /**
   * Apply all generated fixes
   */
  async applyFixes() {
    for (const { fix, failure } of this.results.fixes) {
      if (!fix.updatedSource) continue;

      console.log(`  Applying fix to: ${failure.test.file}:${failure.test.lineNumber}`);

      const result = await this.testFixer.applyFix(
        failure.test.file,
        failure.test.lineNumber,
        failure.test.content,
        fix.updatedSource
      );

      if (result.success) {
        console.log(`  ✓ ${result.message}`);
        this.results.fixedTests++;
      } else {
        console.log(`  ✗ ${result.error || result.message}`);
      }
    }
  }

  /**
   * Show preview of fixes without applying
   */
  showFixPreview() {
    console.log('Fix Preview:');
    console.log('-'.repeat(50));

    for (const { fix, failure } of this.results.fixes) {
      console.log(`\nFile: ${failure.test.file}:${failure.test.lineNumber}`);
      console.log('Original:');
      console.log(failure.test.content);
      console.log('\nFixed:');
      console.log(fix.updatedSource || 'No source changes');
      console.log('-'.repeat(50));
    }
  }

  /**
   * Verify fixes by re-running tests
   */
  async verifyFixes() {
    const failures = await this.runTestsAndCollectFailures();

    if (failures.length === 0) {
      console.log('✓ All tests now passing!\n');
    } else {
      console.log(`⚠ ${failures.length} test(s) still failing\n`);
    }
  }

  /**
   * Generate final report
   */
  generateFinalReport() {
    const report = {
      summary: {
        totalTests: this.results.totalTests,
        failedTests: this.results.failedTests,
        fixedTests: this.results.fixedTests,
        unfixableTests: this.results.unfixableTests,
        successRate: this.results.failedTests > 0
          ? ((this.results.fixedTests / this.results.failedTests) * 100).toFixed(1)
          : 100
      },
      analyses: this.results.analyses,
      fixes: this.testFixer.getFixes(),
      timestamp: new Date().toISOString()
    };

    // Save report
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(this.options.outputDir, `self-healing-report-${timestamp}.json`);

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('SELF-HEALING REPORT');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Failed Tests: ${report.summary.failedTests}`);
    console.log(`Fixed Tests: ${report.summary.fixedTests}`);
    console.log(`Unfixable Tests: ${report.summary.unfixableTests}`);
    console.log(`Success Rate: ${report.summary.successRate}%`);
    console.log('='.repeat(50));
    console.log(`\nReport saved to: ${reportPath}\n`);

    return report;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Self-Healing Test System

Automatically detects and fixes failing tests when APIs change.

Usage:
  node lib/self-healing-test-system.js [options]

Options:
  --auto-apply       Automatically apply fixes
  --platform <name>  Only fix tests for specific platform
  --output <dir>     Output directory for reports (default: ./test-results)
  --verbose          Show detailed output

Examples:
  # Analyze failures but don't apply fixes
  node lib/self-healing-test-system.js

  # Auto-fix failing tests
  node lib/self-healing-test-system.js --auto-apply

  # Fix only Shopify tests
  node lib/self-healing-test-system.js --auto-apply --platform shopify
    `);
    process.exit(0);
  }

  const options = {
    autoApply: args.includes('--auto-apply'),
    platform: args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null,
    outputDir: args.includes('--output') ? args[args.indexOf('--output') + 1] : './test-results',
    verbose: args.includes('--verbose')
  };

  const system = new SelfHealingTestSystem(options);

  system.run().then(report => {
    process.exit(report.summary.unfixableTests > 0 ? 1 : 0);
  }).catch(error => {
    console.error(`Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { SelfHealingTestSystem, FailureAnalyzer, FixGenerator, TestFixer };
