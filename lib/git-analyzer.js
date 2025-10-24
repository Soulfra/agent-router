/**
 * Git Analyzer - Deep git repo analysis
 *
 * Analyzes git repos to show:
 * - GitHub connection status
 * - Uncommitted changes
 * - Unpushed commits
 * - Branch info
 * - Remote sync status
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class GitAnalyzer {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 30000; // 30 seconds
  }

  /**
   * Analyze single git repo
   */
  async analyze(repoPath) {
    const cacheKey = repoPath;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const analysis = {
      path: repoPath,
      valid: false,
      branch: null,
      remote: null,
      remoteUrl: null,
      github: null,
      status: {},
      commits: {},
      sync: {},
      warnings: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Check if valid git repo
      await execAsync('git rev-parse --git-dir', { cwd: repoPath });
      analysis.valid = true;
    } catch {
      analysis.warnings.push('Not a valid git repository');
      return analysis;
    }

    // Get current branch
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
      analysis.branch = stdout.trim() || '(detached HEAD)';
    } catch (error) {
      analysis.warnings.push('Cannot determine branch');
    }

    // Get remote info
    try {
      const { stdout: remoteName } = await execAsync('git remote', { cwd: repoPath });
      analysis.remote = remoteName.trim() || null;

      if (analysis.remote) {
        const { stdout: remoteUrl } = await execAsync(`git remote get-url ${analysis.remote}`, { cwd: repoPath });
        analysis.remoteUrl = remoteUrl.trim();

        // Parse GitHub info
        const githubMatch = analysis.remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
        if (githubMatch) {
          analysis.github = {
            owner: githubMatch[1],
            repo: githubMatch[2],
            url: `https://github.com/${githubMatch[1]}/${githubMatch[2]}`
          };
        }
      } else {
        analysis.warnings.push('No remote configured');
      }
    } catch {
      analysis.warnings.push('Cannot read remote');
    }

    // Get working tree status
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
      const lines = stdout.trim().split('\n').filter(l => l);

      analysis.status = {
        modified: lines.filter(l => l.match(/^ M/)).length,
        staged: lines.filter(l => l.match(/^M /)).length,
        deleted: lines.filter(l => l.match(/^ D/)).length,
        untracked: lines.filter(l => l.match(/^\?\?/)).length,
        conflicted: lines.filter(l => l.match(/^UU/)).length,
        total: lines.length,
        clean: lines.length === 0,
        files: lines.map(l => ({
          status: l.substring(0, 2),
          file: l.substring(3)
        }))
      };

      if (analysis.status.total > 0) {
        analysis.warnings.push(`${analysis.status.total} uncommitted changes`);
      }
    } catch {
      analysis.warnings.push('Cannot read status');
    }

    // Get commit info
    try {
      const { stdout } = await execAsync('git log -1 --format="%H|%an|%ae|%ai|%s"', { cwd: repoPath });
      if (stdout.trim()) {
        const [hash, author, email, date, message] = stdout.trim().split('|');
        analysis.commits.latest = {
          hash: hash.substring(0, 7),
          fullHash: hash,
          author,
          email,
          date: new Date(date),
          message
        };
      }
    } catch {
      analysis.warnings.push('No commits found');
    }

    // Check for unpushed commits
    if (analysis.remote && analysis.branch) {
      try {
        const { stdout } = await execAsync(`git rev-list ${analysis.remote}/${analysis.branch}..HEAD --count`, { cwd: repoPath });
        const unpushed = parseInt(stdout.trim(), 10);

        analysis.commits.unpushed = unpushed;

        if (unpushed > 0) {
          analysis.warnings.push(`${unpushed} unpushed commits`);
        }
      } catch {
        // Remote branch doesn't exist
        analysis.commits.unpushed = null;
        analysis.warnings.push('Remote branch not found - never pushed');
      }
    }

    // Check for unpulled commits
    if (analysis.remote && analysis.branch) {
      try {
        await execAsync('git fetch --dry-run', { cwd: repoPath });
        const { stdout } = await execAsync(`git rev-list HEAD..${analysis.remote}/${analysis.branch} --count`, { cwd: repoPath });
        const unpulled = parseInt(stdout.trim(), 10);

        analysis.commits.unpulled = unpulled;

        if (unpulled > 0) {
          analysis.warnings.push(`${unpulled} commits behind remote`);
        }
      } catch {
        analysis.commits.unpulled = null;
      }
    }

    // Sync status
    analysis.sync = {
      hasRemote: !!analysis.remote,
      hasUnpushed: (analysis.commits.unpushed || 0) > 0,
      hasUnpulled: (analysis.commits.unpulled || 0) > 0,
      hasUncommitted: !analysis.status.clean,
      inSync: analysis.remote &&
              (analysis.commits.unpushed || 0) === 0 &&
              (analysis.commits.unpulled || 0) === 0 &&
              analysis.status.clean
    };

    // Overall health
    if (!analysis.sync.hasRemote) {
      analysis.health = 'warning';
      analysis.healthMessage = 'No remote - local only';
    } else if (!analysis.sync.inSync) {
      analysis.health = 'warning';
      analysis.healthMessage = 'Out of sync';
    } else {
      analysis.health = 'good';
      analysis.healthMessage = 'Clean and synced';
    }

    // Cache result
    this.cache.set(cacheKey, {
      data: analysis,
      timestamp: Date.now()
    });

    return analysis;
  }

  /**
   * Compare local repos to GitHub account
   */
  async compareWithGitHub(localRepos, githubUsername) {
    const comparison = {
      localOnly: [],
      githubOnly: [],
      synced: [],
      total: {
        local: localRepos.length,
        github: 0,
        matched: 0
      }
    };

    try {
      // Get GitHub repos (requires gh CLI)
      const { stdout } = await execAsync(`gh repo list ${githubUsername} --limit 100 --json name,url,updatedAt`);
      const githubRepos = JSON.parse(stdout);
      comparison.total.github = githubRepos.length;

      // Create lookup map
      const githubMap = new Map();
      githubRepos.forEach(repo => {
        githubMap.set(repo.name.toLowerCase(), repo);
      });

      // Compare
      for (const localRepo of localRepos) {
        const analysis = await this.analyze(localRepo.path);

        if (analysis.github) {
          const githubRepo = githubMap.get(analysis.github.repo.toLowerCase());

          if (githubRepo) {
            comparison.synced.push({
              local: localRepo,
              github: githubRepo,
              analysis
            });
            comparison.total.matched++;
            githubMap.delete(analysis.github.repo.toLowerCase());
          } else {
            comparison.localOnly.push({
              local: localRepo,
              analysis,
              reason: 'Remote URL points to GitHub but repo not found'
            });
          }
        } else {
          comparison.localOnly.push({
            local: localRepo,
            analysis,
            reason: analysis.remote ? 'Not a GitHub remote' : 'No remote configured'
          });
        }
      }

      // Remaining GitHub repos are GitHub-only
      comparison.githubOnly = Array.from(githubMap.values());

    } catch (error) {
      comparison.error = error.message;
    }

    return comparison;
  }

  /**
   * Get file diff summary
   */
  async getDiff(repoPath, file = null) {
    try {
      const cmd = file
        ? `git diff HEAD -- "${file}"`
        : 'git diff HEAD';

      const { stdout } = await execAsync(cmd, { cwd: repoPath });
      return stdout;
    } catch {
      return null;
    }
  }

  /**
   * Get commit history
   */
  async getHistory(repoPath, limit = 10) {
    try {
      const { stdout } = await execAsync(
        `git log -${limit} --format="%H|%an|%ae|%ai|%s"`,
        { cwd: repoPath }
      );

      return stdout.trim().split('\n').map(line => {
        const [hash, author, email, date, message] = line.split('|');
        return {
          hash: hash.substring(0, 7),
          fullHash: hash,
          author,
          email,
          date: new Date(date),
          message
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = GitAnalyzer;
