/**
 * GitHub API Client
 *
 * Wrapper around Octokit for GitHub operations:
 * - Create repos
 * - Enable GitHub Pages
 * - Create PRs
 * - List repos
 * - Manage issues
 *
 * Usage:
 *   const GitHubClient = require('./lib/github-api-client');
 *   const github = new GitHubClient(process.env.GITHUB_TOKEN);
 *   const repos = await github.listRepos('Soulfra');
 */

const { Octokit } = require('@octokit/rest');
const CalSystemIntegrator = require('./cal-system-integrator');

class GitHubAPIClient {
  constructor(token, options = {}) {
    if (!token) {
      console.warn('[GitHub] No token provided - GitHub API operations will fail');
    }

    this.octokit = new Octokit({
      auth: token,
      userAgent: 'CalOS-Agent-Router/1.0',
      log: {
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error
      }
    });

    this.token = token;

    // Optional: integrate with learning systems
    this.recordLearning = options.recordLearning !== false;
    if (this.recordLearning && options.db) {
      this.systemIntegrator = new CalSystemIntegrator({ db: options.db });
      this.systemIntegrator.init().catch(err => {
        console.warn('[GitHub] Failed to init system integrator:', err.message);
        this.recordLearning = false;
      });
    }
  }

  /**
   * Record operation in learning systems
   * @private
   */
  async _recordOperation(operation, success, context = {}) {
    if (!this.recordLearning || !this.systemIntegrator) return;

    try {
      await this.systemIntegrator.recordWork({
        feature: `github-${operation}`,
        files: ['lib/github-api-client.js'],
        description: `GitHub API: ${operation}`,
        success,
        context
      });
    } catch (error) {
      // Don't fail the operation if logging fails
      console.warn('[GitHub] Failed to record operation:', error.message);
    }
  }

  /**
   * List repositories for authenticated user or specific user
   */
  async listRepos(username = null) {
    try {
      if (username) {
        const { data } = await this.octokit.repos.listForUser({
          username,
          sort: 'updated',
          per_page: 100
        });
        return data;
      } else {
        const { data } = await this.octokit.repos.listForAuthenticatedUser({
          sort: 'updated',
          per_page: 100
        });
        return data;
      }
    } catch (error) {
      console.error('[GitHub] Failed to list repos:', error.message);
      throw error;
    }
  }

  /**
   * Create new repository
   */
  async createRepo(name, options = {}) {
    try {
      const { data } = await this.octokit.repos.createForAuthenticatedUser({
        name,
        description: options.description || `Created by CalOS`,
        private: options.private !== undefined ? options.private : false,
        auto_init: options.autoInit !== undefined ? options.autoInit : true,
        gitignore_template: options.gitignore || 'Node',
        license_template: options.license || 'mit',
        has_issues: true,
        has_projects: true,
        has_wiki: false
      });

      console.log(`[GitHub] Created repo: ${data.full_name}`);

      // Record success
      await this._recordOperation('create-repo', true, {
        repoName: name,
        fullName: data.full_name,
        repoUrl: data.html_url
      });

      return data;
    } catch (error) {
      console.error('[GitHub] Failed to create repo:', error.message);

      // Record failure
      await this._recordOperation('create-repo', false, {
        repoName: name,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Enable GitHub Pages for a repository
   */
  async enablePages(owner, repo, options = {}) {
    try {
      const { data } = await this.octokit.repos.createPagesSite({
        owner,
        repo,
        source: {
          branch: options.branch || 'main',
          path: options.path || '/'
        }
      });

      console.log(`[GitHub] Enabled GitHub Pages for ${owner}/${repo}`);
      console.log(`[GitHub] Live at: https://${owner}.github.io/${repo}`);

      return data;
    } catch (error) {
      if (error.status === 409) {
        console.log(`[GitHub] GitHub Pages already enabled for ${owner}/${repo}`);
        return { message: 'Already enabled' };
      }
      console.error('[GitHub] Failed to enable Pages:', error.message);
      throw error;
    }
  }

  /**
   * Create pull request
   */
  async createPR(owner, repo, head, base, title, body) {
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        head,
        base,
        title,
        body
      });

      console.log(`[GitHub] Created PR: ${data.html_url}`);
      return data;
    } catch (error) {
      console.error('[GitHub] Failed to create PR:', error.message);
      throw error;
    }
  }

  /**
   * Get repository details
   */
  async getRepo(owner, repo) {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo
      });
      return data;
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      console.error('[GitHub] Failed to get repo:', error.message);
      throw error;
    }
  }

  /**
   * Check if repo exists
   */
  async repoExists(owner, repo) {
    const repoData = await this.getRepo(owner, repo);
    return !!repoData;
  }

  /**
   * Get GitHub Actions workflows
   */
  async getWorkflows(owner, repo) {
    try {
      const { data } = await this.octokit.actions.listRepoWorkflows({
        owner,
        repo
      });
      return data.workflows;
    } catch (error) {
      console.error('[GitHub] Failed to get workflows:', error.message);
      return [];
    }
  }

  /**
   * Get latest workflow run status
   */
  async getWorkflowStatus(owner, repo, workflowId) {
    try {
      const { data } = await this.octokit.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowId,
        per_page: 1
      });

      if (data.workflow_runs.length === 0) {
        return null;
      }

      return data.workflow_runs[0];
    } catch (error) {
      console.error('[GitHub] Failed to get workflow status:', error.message);
      return null;
    }
  }

  /**
   * Add remote to local repo (helper method)
   */
  getRemoteURL(owner, repo, useSSH = false) {
    if (useSSH) {
      return `git@github.com:${owner}/${repo}.git`;
    } else {
      return `https://github.com/${owner}/${repo}.git`;
    }
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  parseGitHubURL(url) {
    const match = url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2],
      url: `https://github.com/${match[1]}/${match[2]}`
    };
  }

  /**
   * Get authenticated user info
   */
  async getUser() {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      return data;
    } catch (error) {
      console.error('[GitHub] Failed to get user:', error.message);
      throw error;
    }
  }

  /**
   * Check rate limit status
   */
  async getRateLimit() {
    try {
      const { data } = await this.octokit.rateLimit.get();
      return data.rate;
    } catch (error) {
      console.error('[GitHub] Failed to get rate limit:', error.message);
      throw error;
    }
  }
}

module.exports = GitHubAPIClient;
