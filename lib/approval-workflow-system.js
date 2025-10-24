#!/usr/bin/env node

/**
 * Approval Workflow System
 *
 * Manages approval workflow for automated test fixes.
 * Creates branches, shows diffs, requires approval before merging.
 *
 * Features:
 * - Git branch creation for each fix batch
 * - Diff preview before approval
 * - Version tracking
 * - Changelog generation
 * - Rollback support
 *
 * Usage:
 *   node lib/approval-workflow-system.js create <fix-report-path>
 *   node lib/approval-workflow-system.js list
 *   node lib/approval-workflow-system.js approve <branch-name>
 *   node lib/approval-workflow-system.js reject <branch-name>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class GitManager {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false
    };
  }

  /**
   * Check if git is available and repo is initialized
   */
  isGitRepo() {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch (error) {
      throw new Error('Failed to get current branch');
    }
  }

  /**
   * Create a new branch
   */
  createBranch(branchName) {
    try {
      execSync(`git checkout -b ${branchName}`, { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      return true;
    } catch (error) {
      throw new Error(`Failed to create branch: ${branchName}`);
    }
  }

  /**
   * Switch to a branch
   */
  checkoutBranch(branchName) {
    try {
      execSync(`git checkout ${branchName}`, { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      return true;
    } catch (error) {
      throw new Error(`Failed to checkout branch: ${branchName}`);
    }
  }

  /**
   * Get list of branches matching pattern
   */
  listBranches(pattern = 'test-fix-*') {
    try {
      const output = execSync(`git branch --list '${pattern}'`, { encoding: 'utf-8' });
      return output
        .split('\n')
        .map(line => line.trim().replace(/^\* /, ''))
        .filter(line => line.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Commit changes
   */
  commit(message) {
    try {
      execSync('git add .', { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      execSync(`git commit -m "${message}"`, { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      return true;
    } catch (error) {
      throw new Error('Failed to commit changes');
    }
  }

  /**
   * Get diff of changes
   */
  getDiff(fromBranch = null) {
    try {
      const command = fromBranch
        ? `git diff ${fromBranch}...HEAD`
        : 'git diff HEAD';

      return execSync(command, { encoding: 'utf-8' });
    } catch {
      return '';
    }
  }

  /**
   * Get commit log
   */
  getLog(count = 10) {
    try {
      return execSync(`git log -${count} --oneline`, { encoding: 'utf-8' });
    } catch {
      return '';
    }
  }

  /**
   * Merge branch
   */
  mergeBranch(branchName, baseBranch = 'main') {
    try {
      this.checkoutBranch(baseBranch);
      execSync(`git merge ${branchName}`, { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      return true;
    } catch (error) {
      throw new Error(`Failed to merge branch: ${branchName}`);
    }
  }

  /**
   * Delete branch
   */
  deleteBranch(branchName) {
    try {
      execSync(`git branch -D ${branchName}`, { stdio: this.options.verbose ? 'inherit' : 'ignore' });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete branch: ${branchName}`);
    }
  }

  /**
   * Get uncommitted changes
   */
  hasUncommittedChanges() {
    try {
      const output = execSync('git status --porcelain', { encoding: 'utf-8' });
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }
}

class VersionTracker {
  constructor(trackerPath = '.test-fix-versions.json') {
    this.trackerPath = trackerPath;
    this.versions = this.loadVersions();
  }

  /**
   * Load version history
   */
  loadVersions() {
    try {
      if (fs.existsSync(this.trackerPath)) {
        return JSON.parse(fs.readFileSync(this.trackerPath, 'utf-8'));
      }
    } catch (error) {
      console.error('Failed to load version history:', error.message);
    }

    return {
      versions: [],
      currentVersion: 0
    };
  }

  /**
   * Save version history
   */
  saveVersions() {
    fs.writeFileSync(this.trackerPath, JSON.stringify(this.versions, null, 2));
  }

  /**
   * Add a new version
   */
  addVersion(fixReport, branchName, status = 'pending') {
    const version = {
      version: ++this.versions.currentVersion,
      branchName,
      timestamp: new Date().toISOString(),
      status, // pending, approved, rejected
      fixCount: fixReport.summary.fixedTests,
      failedTests: fixReport.summary.failedTests,
      fixes: fixReport.fixes.map(fix => ({
        file: fix.file,
        lineNumber: fix.lineNumber,
        timestamp: fix.timestamp
      }))
    };

    this.versions.versions.push(version);
    this.saveVersions();

    return version;
  }

  /**
   * Update version status
   */
  updateVersionStatus(branchName, status) {
    const version = this.versions.versions.find(v => v.branchName === branchName);
    if (version) {
      version.status = status;
      version.updatedAt = new Date().toISOString();
      this.saveVersions();
    }
  }

  /**
   * Get version by branch name
   */
  getVersion(branchName) {
    return this.versions.versions.find(v => v.branchName === branchName);
  }

  /**
   * Get all versions
   */
  getAllVersions() {
    return this.versions.versions;
  }

  /**
   * Get approved versions
   */
  getApprovedVersions() {
    return this.versions.versions.filter(v => v.status === 'approved');
  }
}

class ChangelogGenerator {
  constructor(changelogPath = 'TEST-FIXES-CHANGELOG.md') {
    this.changelogPath = changelogPath;
  }

  /**
   * Add entry to changelog
   */
  addEntry(version, fixReport) {
    let changelog = '';

    if (fs.existsSync(this.changelogPath)) {
      changelog = fs.readFileSync(this.changelogPath, 'utf-8');
    } else {
      changelog = '# Test Fixes Changelog\n\nAutomatic test fixes approved and merged.\n\n';
    }

    const entry = this.generateEntry(version, fixReport);

    // Insert at the top (after header)
    const lines = changelog.split('\n');
    const headerEnd = lines.findIndex((line, i) => i > 2 && line.trim() === '');
    if (headerEnd !== -1) {
      lines.splice(headerEnd + 1, 0, entry);
    } else {
      lines.push(entry);
    }

    changelog = lines.join('\n');
    fs.writeFileSync(this.changelogPath, changelog);
  }

  /**
   * Generate changelog entry
   */
  generateEntry(version, fixReport) {
    const date = new Date(version.timestamp).toISOString().split('T')[0];

    let entry = `## Version ${version.version} - ${date}\n\n`;
    entry += `**Branch**: \`${version.branchName}\`\n`;
    entry += `**Status**: ${version.status}\n`;
    entry += `**Tests Fixed**: ${version.fixCount}\n\n`;

    if (fixReport && fixReport.fixes && fixReport.fixes.length > 0) {
      entry += '### Changes\n\n';

      for (const fix of fixReport.fixes) {
        entry += `- Fixed test in \`${fix.file}\` at line ${fix.lineNumber}\n`;
      }

      entry += '\n';
    }

    return entry;
  }
}

class ApprovalWorkflowSystem {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      baseBranch: options.baseBranch || 'main'
    };

    this.gitManager = new GitManager(options);
    this.versionTracker = new VersionTracker();
    this.changelogGenerator = new ChangelogGenerator();
  }

  /**
   * Create approval workflow from fix report
   */
  async createApprovalWorkflow(fixReportPath) {
    console.log('Creating approval workflow...\n');

    // Check if git repo
    if (!this.gitManager.isGitRepo()) {
      console.log('⚠ Not a git repository. Initializing git...');
      execSync('git init', { stdio: 'ignore' });
      console.log('✓ Git repository initialized\n');
    }

    // Load fix report
    const fixReport = this.loadFixReport(fixReportPath);

    if (fixReport.summary.fixedTests === 0) {
      console.log('No fixes to create workflow for.');
      return;
    }

    // Save current branch
    const originalBranch = this.gitManager.getCurrentBranch();

    // Create branch name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const branchName = `test-fix-${timestamp}-v${this.versionTracker.versions.currentVersion + 1}`;

    console.log(`Creating branch: ${branchName}`);

    // Check for uncommitted changes
    if (this.gitManager.hasUncommittedChanges()) {
      console.log('⚠ You have uncommitted changes. Commit or stash them first.');
      return;
    }

    // Create and checkout branch
    this.gitManager.createBranch(branchName);
    console.log(`✓ Branch created: ${branchName}\n`);

    // Commit fixes
    const commitMessage = `Automatic test fixes (${fixReport.summary.fixedTests} tests)

Generated by Self-Healing Test System
- Tests fixed: ${fixReport.summary.fixedTests}
- Failed tests: ${fixReport.summary.failedTests}
- Success rate: ${fixReport.summary.successRate}%

🤖 Generated with CalOS Agent Router`;

    this.gitManager.commit(commitMessage);
    console.log('✓ Changes committed\n');

    // Add version
    const version = this.versionTracker.addVersion(fixReport, branchName, 'pending');
    console.log(`✓ Version ${version.version} created\n`);

    // Show diff
    console.log('Diff preview:');
    console.log('='.repeat(50));
    const diff = this.gitManager.getDiff(originalBranch);
    console.log(diff || 'No diff available');
    console.log('='.repeat(50) + '\n');

    // Return to original branch
    this.gitManager.checkoutBranch(originalBranch);

    console.log(`Workflow created successfully!`);
    console.log(`\nNext steps:`);
    console.log(`1. Review changes: git diff ${originalBranch}...${branchName}`);
    console.log(`2. Approve: npm run workflow:approve ${branchName}`);
    console.log(`3. Reject: npm run workflow:reject ${branchName}\n`);

    return {
      branchName,
      version,
      originalBranch
    };
  }

  /**
   * List pending approval workflows
   */
  listWorkflows() {
    console.log('Approval Workflows\n');
    console.log('='.repeat(50));

    const versions = this.versionTracker.getAllVersions();

    if (versions.length === 0) {
      console.log('No workflows found.');
      return;
    }

    for (const version of versions) {
      const statusSymbol = {
        pending: '⏳',
        approved: '✓',
        rejected: '✗'
      }[version.status] || '?';

      console.log(`\n${statusSymbol} Version ${version.version} - ${version.status.toUpperCase()}`);
      console.log(`  Branch: ${version.branchName}`);
      console.log(`  Created: ${new Date(version.timestamp).toLocaleString()}`);
      console.log(`  Tests Fixed: ${version.fixCount}`);
      console.log(`  Failed Tests: ${version.failedTests}`);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Show summary
    const pending = versions.filter(v => v.status === 'pending').length;
    const approved = versions.filter(v => v.status === 'approved').length;
    const rejected = versions.filter(v => v.status === 'rejected').length;

    console.log(`Total: ${versions.length}`);
    console.log(`Pending: ${pending}`);
    console.log(`Approved: ${approved}`);
    console.log(`Rejected: ${rejected}\n`);
  }

  /**
   * Approve a workflow
   */
  async approveWorkflow(branchName) {
    console.log(`Approving workflow: ${branchName}\n`);

    // Get version
    const version = this.versionTracker.getVersion(branchName);
    if (!version) {
      console.log('Workflow not found.');
      return;
    }

    if (version.status === 'approved') {
      console.log('Workflow already approved.');
      return;
    }

    // Show diff
    const originalBranch = this.gitManager.getCurrentBranch();
    console.log('Changes to be merged:');
    console.log('='.repeat(50));
    const diff = this.gitManager.getDiff(`${originalBranch}...${branchName}`);
    console.log(diff || 'No diff available');
    console.log('='.repeat(50) + '\n');

    // Confirm
    const confirmed = await this.confirm('Approve and merge these changes?');

    if (!confirmed) {
      console.log('Approval cancelled.');
      return;
    }

    // Merge branch
    console.log('Merging branch...');
    this.gitManager.mergeBranch(branchName, this.options.baseBranch);
    console.log('✓ Branch merged\n');

    // Update version
    this.versionTracker.updateVersionStatus(branchName, 'approved');
    console.log('✓ Version marked as approved\n');

    // Add changelog entry
    const fixReportPath = this.findFixReport(version);
    if (fixReportPath) {
      const fixReport = this.loadFixReport(fixReportPath);
      this.changelogGenerator.addEntry(version, fixReport);
      console.log('✓ Changelog updated\n');
    }

    // Delete branch (optional)
    const deleteBranch = await this.confirm('Delete the merged branch?');
    if (deleteBranch) {
      this.gitManager.deleteBranch(branchName);
      console.log('✓ Branch deleted\n');
    }

    console.log('Workflow approved successfully!\n');
  }

  /**
   * Reject a workflow
   */
  async rejectWorkflow(branchName, reason = null) {
    console.log(`Rejecting workflow: ${branchName}\n`);

    // Get version
    const version = this.versionTracker.getVersion(branchName);
    if (!version) {
      console.log('Workflow not found.');
      return;
    }

    if (version.status === 'rejected') {
      console.log('Workflow already rejected.');
      return;
    }

    // Confirm
    if (!reason) {
      reason = await this.prompt('Reason for rejection (optional): ');
    }

    const confirmed = await this.confirm('Reject this workflow?');

    if (!confirmed) {
      console.log('Rejection cancelled.');
      return;
    }

    // Update version
    version.rejectionReason = reason;
    this.versionTracker.updateVersionStatus(branchName, 'rejected');
    console.log('✓ Version marked as rejected\n');

    // Delete branch
    const deleteBranch = await this.confirm('Delete the rejected branch?');
    if (deleteBranch) {
      this.gitManager.deleteBranch(branchName);
      console.log('✓ Branch deleted\n');
    }

    console.log('Workflow rejected.\n');
  }

  /**
   * Load fix report
   */
  loadFixReport(reportPath) {
    try {
      return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Failed to load fix report: ${error.message}`);
    }
  }

  /**
   * Find fix report for version
   */
  findFixReport(version) {
    const reportDir = './test-results';
    const files = fs.readdirSync(reportDir);

    // Find report file closest to version timestamp
    const versionTime = new Date(version.timestamp).getTime();

    let closestFile = null;
    let closestDiff = Infinity;

    for (const file of files) {
      if (!file.startsWith('self-healing-report-')) continue;

      const filePath = path.join(reportDir, file);
      const stats = fs.statSync(filePath);
      const diff = Math.abs(stats.mtime.getTime() - versionTime);

      if (diff < closestDiff) {
        closestDiff = diff;
        closestFile = filePath;
      }
    }

    return closestFile;
  }

  /**
   * Prompt for user input
   */
  async prompt(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Confirm action
   */
  async confirm(question) {
    const answer = await this.prompt(`${question} (y/N): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
Approval Workflow System

Manage approval workflow for automated test fixes.

Commands:
  create <report-path>  Create approval workflow from fix report
  list                  List all workflows
  approve <branch>      Approve and merge workflow
  reject <branch>       Reject workflow

Options:
  --verbose             Show detailed output
  --base <branch>       Base branch for merging (default: main)

Examples:
  # Create workflow from fix report
  node lib/approval-workflow-system.js create test-results/self-healing-report-2025-01-15.json

  # List workflows
  node lib/approval-workflow-system.js list

  # Approve workflow
  node lib/approval-workflow-system.js approve test-fix-2025-01-15-v1

  # Reject workflow
  node lib/approval-workflow-system.js reject test-fix-2025-01-15-v1
    `);
    process.exit(0);
  }

  const options = {
    verbose: args.includes('--verbose'),
    baseBranch: args.includes('--base') ? args[args.indexOf('--base') + 1] : 'main'
  };

  const system = new ApprovalWorkflowSystem(options);

  (async () => {
    try {
      switch (command) {
        case 'create':
          if (!args[1]) {
            console.error('Error: Fix report path required');
            process.exit(1);
          }
          await system.createApprovalWorkflow(args[1]);
          break;

        case 'list':
          system.listWorkflows();
          break;

        case 'approve':
          if (!args[1]) {
            console.error('Error: Branch name required');
            process.exit(1);
          }
          await system.approveWorkflow(args[1]);
          break;

        case 'reject':
          if (!args[1]) {
            console.error('Error: Branch name required');
            process.exit(1);
          }
          await system.rejectWorkflow(args[1]);
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = { ApprovalWorkflowSystem, GitManager, VersionTracker, ChangelogGenerator };
