/**
 * GitHub CLI Wrapper
 * Wraps script-toolkit/lib/github-sync.sh for local-first GitHub workflow
 */

const { spawn } = require('child_process');
const path = require('path');

// Path to github-sync.sh in script-toolkit
const GITHUB_SYNC_PATH = path.join(__dirname, '../../../script-toolkit/lib/github-sync.sh');
const LOCAL_DB_PATH = path.join(__dirname, '../../../script-toolkit/lib/local-db.sh');

class GitHubCLI {
  constructor() {
    this.syncPath = GITHUB_SYNC_PATH;
    this.dbPath = LOCAL_DB_PATH;
  }

  /**
   * Execute github-sync.sh command
   * @param {string[]} args - Command arguments
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async exec(args = []) {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', [this.syncPath, ...args], {
        cwd: path.dirname(this.syncPath),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute local-db.sh function
   * @param {string} command - SQL or db function to run
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async execDB(command) {
    return new Promise((resolve, reject) => {
      const script = `
source ${this.dbPath}
${command}
      `.trim();

      const proc = spawn('bash', ['-c', script], {
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Sync issues from GitHub repo
   */
  async syncIssues(repo = null) {
    const args = ['--issues'];
    if (repo) {
      args.push('--repo', repo);
    }
    return await this.exec(args);
  }

  /**
   * Sync PRs from GitHub repo
   */
  async syncPRs(repo = null) {
    const args = ['--prs'];
    if (repo) {
      args.push('--repo', repo);
    }
    return await this.exec(args);
  }

  /**
   * Sync all data from GitHub repo
   */
  async syncAll(repo = null) {
    const args = [];
    if (repo) {
      args.push('--repo', repo);
    }
    return await this.exec(args);
  }

  /**
   * Get issues from local database
   */
  async getIssues(state = 'open') {
    return await this.execDB(`db_get_issues "${state}"`);
  }

  /**
   * Get PRs from local database
   */
  async getPRs(state = 'open') {
    return await this.execDB(`db_get_prs "${state}"`);
  }

  /**
   * Get database stats
   */
  async getStats() {
    return await this.execDB('db_stats');
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    return await this.execDB('db_sync_status');
  }

  /**
   * Query local database with SQLite
   * @param {string} query - SQL query
   */
  async query(sqlQuery) {
    const dbPath = path.join(process.env.HOME, '.deathtodata/local.db');
    return new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', ['-header', '-column', dbPath, sqlQuery]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if gh CLI is available
   */
  async checkGHCLI() {
    return new Promise((resolve) => {
      const proc = spawn('which', ['gh']);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Check if gh is authenticated
   */
  async checkGHAuth() {
    return new Promise((resolve) => {
      const proc = spawn('gh', ['auth', 'status']);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Search repositories on GitHub using gh CLI
   */
  async searchRepos(query, limit = 10) {
    return new Promise((resolve, reject) => {
      const proc = spawn('gh', [
        'search', 'repos',
        query,
        '--limit', limit.toString(),
        '--json', 'fullName,description,stargazersCount,language,updatedAt'
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const results = JSON.parse(stdout);
            resolve({ results, code: 0 });
          } catch (error) {
            reject(new Error(`Failed to parse search results: ${error.message}`));
          }
        } else {
          reject(new Error(`gh search failed: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * View repository info using gh CLI
   */
  async viewRepo(repo) {
    return new Promise((resolve, reject) => {
      const proc = spawn('gh', [
        'repo', 'view', repo,
        '--json', 'name,description,stargazersCount,forksCount,url,defaultBranch,languages,updatedAt'
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const info = JSON.parse(stdout);
            resolve({ info, code: 0 });
          } catch (error) {
            reject(new Error(`Failed to parse repo info: ${error.message}`));
          }
        } else {
          reject(new Error(`gh repo view failed: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Clone repository using gh CLI
   */
  async cloneRepo(repo, targetDir = null) {
    return new Promise((resolve, reject) => {
      const args = ['repo', 'clone', repo];
      if (targetDir) {
        args.push(targetDir);
      }

      const proc = spawn('gh', args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = GitHubCLI;
