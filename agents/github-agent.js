/**
 * GitHub Agent
 *
 * Local-first GitHub workflow:
 * - Do all work locally in CalOS
 * - Use GitHub as read-only catalog for discovering OSS
 * - Only push to GitHub when publishing
 * - GitHub as gateway to fediverse/OSS ecosystem
 *
 * Wraps script-toolkit/lib/github-sync.sh for offline-first access
 */

const GitHubCLI = require('../lib/github-cli');

class GitHubAgent {
  constructor(options = {}) {
    this.cli = new GitHubCLI();
  }

  /**
   * Process GitHub request
   * @param {string} input - User command
   * @param {object} context - Additional context
   * @returns {Promise<string>} - Result
   */
  async process(input, context = {}) {
    const lowerInput = input.toLowerCase();

    // Check prerequisites first
    const hasGH = await this.cli.checkGHCLI();
    if (!hasGH) {
      return '❌ GitHub CLI not installed\n\n' +
             'Install:\n' +
             '  brew install gh\n' +
             '  gh auth login';
    }

    const hasAuth = await this.cli.checkGHAuth();
    if (!hasAuth) {
      return '❌ Not authenticated with GitHub\n\n' +
             'Authenticate:\n' +
             '  gh auth login';
    }

    // Parse command
    if (lowerInput.includes('search') || lowerInput.includes('find')) {
      const query = this._extractSearchQuery(input);
      if (query) {
        return await this.search(query, context);
      }
    }

    if (lowerInput.includes('sync')) {
      const repo = this._extractRepo(input);
      return await this.sync(repo, context);
    }

    if (lowerInput.includes('issues') || lowerInput.includes('issue list')) {
      const state = lowerInput.includes('closed') ? 'closed' : 'open';
      return await this.listIssues(state, context);
    }

    if (lowerInput.includes('prs') || lowerInput.includes('pull request')) {
      const state = lowerInput.includes('closed') ? 'closed' : 'open';
      return await this.listPRs(state, context);
    }

    if (lowerInput.includes('stats') || lowerInput.includes('status')) {
      return await this.stats(context);
    }

    if (lowerInput.includes('view') || lowerInput.includes('info')) {
      const repo = this._extractRepo(input);
      if (repo) {
        return await this.viewRepo(repo, context);
      }
    }

    if (lowerInput.includes('clone')) {
      const repo = this._extractRepo(input);
      if (repo) {
        return await this.cloneRepo(repo, context);
      }
    }

    // Default: show help
    return this.help();
  }

  /**
   * Search GitHub repositories
   */
  async search(query, context = {}) {
    try {
      const limit = context.limit || 10;
      const result = await this.cli.searchRepos(query, limit);

      if (!result.results || result.results.length === 0) {
        return `🔍 No repositories found for: "${query}"`;
      }

      let output = `🔍 Search Results: "${query}"\n`;
      output += `📊 Found ${result.results.length} repositories\n\n`;

      for (const repo of result.results) {
        output += `📦 ${repo.fullName}\n`;
        if (repo.description) {
          output += `   ${repo.description}\n`;
        }
        output += `   ⭐ ${repo.stargazersCount || 0} stars`;
        if (repo.language) {
          output += ` | 💻 ${repo.language}`;
        }
        output += `\n   🔗 https://github.com/${repo.fullName}\n`;
        output += `\n`;
      }

      output += `💡 To sync a repo locally:\n`;
      output += `   calos ask "@github sync owner/repo"\n`;

      return output;

    } catch (error) {
      return `❌ Search failed: ${error.message}`;
    }
  }

  /**
   * Sync repository data to local database
   */
  async sync(repo = null, context = {}) {
    try {
      let output = '';

      if (repo) {
        output += `🔄 Syncing ${repo} to local database...\n\n`;
      } else {
        output += `🔄 Syncing current repository to local database...\n\n`;
      }

      const result = await this.cli.syncAll(repo);

      if (result.code !== 0) {
        return `❌ Sync failed\n${result.stderr}`;
      }

      // Parse output for success messages
      output += result.stdout;

      output += `\n💡 View synced data:\n`;
      output += `   calos ask "@github issues"\n`;
      output += `   calos ask "@github prs"\n`;
      output += `   calos ask "@github stats"\n`;

      return output;

    } catch (error) {
      return `❌ Sync failed: ${error.message}`;
    }
  }

  /**
   * List issues from local database
   */
  async listIssues(state = 'open', context = {}) {
    try {
      const result = await this.cli.getIssues(state);

      if (result.code !== 0) {
        return `❌ Failed to get issues\n${result.stderr}`;
      }

      let output = `📋 GitHub Issues (${state})\n\n`;
      output += result.stdout;

      if (result.stdout.trim().length === 0) {
        output += `No ${state} issues found in local database.\n\n`;
        output += `💡 Sync first:\n`;
        output += `   calos ask "@github sync owner/repo"\n`;
      }

      return output;

    } catch (error) {
      return `❌ Failed to list issues: ${error.message}`;
    }
  }

  /**
   * List PRs from local database
   */
  async listPRs(state = 'open', context = {}) {
    try {
      const result = await this.cli.getPRs(state);

      if (result.code !== 0) {
        return `❌ Failed to get PRs\n${result.stderr}`;
      }

      let output = `🔀 GitHub Pull Requests (${state})\n\n`;
      output += result.stdout;

      if (result.stdout.trim().length === 0) {
        output += `No ${state} PRs found in local database.\n\n`;
        output += `💡 Sync first:\n`;
        output += `   calos ask "@github sync owner/repo"\n`;
      }

      return output;

    } catch (error) {
      return `❌ Failed to list PRs: ${error.message}`;
    }
  }

  /**
   * Get database stats
   */
  async stats(context = {}) {
    try {
      const result = await this.cli.getStats();

      if (result.code !== 0) {
        return `❌ Failed to get stats\n${result.stderr}`;
      }

      return `📊 GitHub Local Database Stats\n\n${result.stdout}`;

    } catch (error) {
      return `❌ Failed to get stats: ${error.message}`;
    }
  }

  /**
   * View repository info
   */
  async viewRepo(repo, context = {}) {
    try {
      const result = await this.cli.viewRepo(repo);

      if (!result.info) {
        return `❌ Failed to view repository: ${repo}`;
      }

      const info = result.info;
      let output = `📦 ${info.name}\n\n`;

      if (info.description) {
        output += `${info.description}\n\n`;
      }

      output += `🔗 ${info.url}\n`;
      output += `⭐ ${info.stargazersCount || 0} stars | 🔀 ${info.forksCount || 0} forks\n`;
      output += `🌿 Default branch: ${info.defaultBranch || 'main'}\n`;

      if (info.languages && info.languages.length > 0) {
        output += `💻 Languages: ${info.languages.join(', ')}\n`;
      }

      output += `📅 Updated: ${info.updatedAt}\n`;

      output += `\n💡 Actions:\n`;
      output += `   calos ask "@github sync ${repo}"\n`;
      output += `   calos ask "@github clone ${repo}"\n`;

      return output;

    } catch (error) {
      return `❌ Failed to view repo: ${error.message}`;
    }
  }

  /**
   * Clone repository
   */
  async cloneRepo(repo, context = {}) {
    try {
      const targetDir = context.targetDir || null;

      let output = `📥 Cloning ${repo}...\n\n`;

      const result = await this.cli.cloneRepo(repo, targetDir);

      if (result.code !== 0) {
        return `❌ Clone failed\n${result.stderr}`;
      }

      output += result.stdout;
      output += result.stderr; // gh clone outputs to stderr

      output += `\n✓ Repository cloned successfully\n`;

      return output;

    } catch (error) {
      return `❌ Clone failed: ${error.message}`;
    }
  }

  /**
   * Help/usage
   */
  help() {
    return `
🐙 GitHub Agent - Local-First OSS Discovery

Usage:
  calos ask "@github search <query>"       # Search repositories
  calos ask "@github sync owner/repo"      # Sync repo to local DB
  calos ask "@github issues"               # List synced issues
  calos ask "@github prs"                  # List synced PRs
  calos ask "@github stats"                # Database statistics
  calos ask "@github view owner/repo"      # View repo info
  calos ask "@github clone owner/repo"     # Clone repository

Philosophy:
  - Work 100% locally in CalOS
  - Use GitHub as read-only catalog for OSS discovery
  - Only push to GitHub when publishing
  - GitHub as gateway to fediverse/OSS ecosystem

Examples:
  calos ask "@github search anthropic"
  calos ask "@github sync anthropics/anthropic-sdk-python"
  calos ask "@github view vercel/next.js"
  calos ask "@github clone openai/openai-python"

Local Database:
  - Issues, PRs, comments cached at ~/.deathtodata/local.db
  - Offline-first workflow like Claude Code or Ollama
  - Sync once, query many times without API calls
    `.trim();
  }

  /**
   * Internal: Extract search query from input
   */
  _extractSearchQuery(input) {
    const patterns = [
      /search[:\s]+"([^"]+)"/i,
      /search[:\s]+(.+)/i,
      /find[:\s]+"([^"]+)"/i,
      /find[:\s]+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Internal: Extract repo from input
   */
  _extractRepo(input) {
    // Match owner/repo pattern
    const match = input.match(/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/);
    return match ? match[1] : null;
  }
}

module.exports = GitHubAgent;
