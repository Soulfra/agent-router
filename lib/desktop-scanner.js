/**
 * Desktop Scanner - Find all your shit
 *
 * Scans ~/Desktop for:
 * - Git repositories
 * - package.json files
 * - CSS themes
 * - README files
 * - Project directories
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class DesktopScanner {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.join(require('os').homedir(), 'Desktop');
    this.maxDepth = options.maxDepth || 4;
    this.ignorePatterns = options.ignorePatterns || [
      'node_modules',
      '.Trash',
      '.git/objects',
      '.git/refs',
      'Library',
      'Applications'
    ];
  }

  /**
   * Scan entire desktop
   */
  async scan() {
    const results = {
      gitRepos: [],
      projects: [],
      themes: [],
      readmes: [],
      scanTime: new Date().toISOString(),
      totalFiles: 0,
      totalDirs: 0
    };

    try {
      await this._scanDirectory(this.rootPath, 0, results);
    } catch (error) {
      console.error('Desktop scan error:', error);
    }

    return results;
  }

  /**
   * Recursively scan directory
   */
  async _scanDirectory(dirPath, depth, results) {
    if (depth > this.maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip ignored patterns
        if (this._shouldIgnore(entry.name)) continue;

        if (entry.isDirectory()) {
          results.totalDirs++;

          // Check if git repo
          if (entry.name === '.git') {
            await this._scanGitRepo(path.dirname(fullPath), results);
            continue; // Don't recurse into .git
          }

          // Check for package.json (project)
          try {
            const packagePath = path.join(fullPath, 'package.json');
            await fs.access(packagePath);
            await this._scanProject(fullPath, results);
          } catch {
            // No package.json
          }

          // Recurse
          await this._scanDirectory(fullPath, depth + 1, results);
        } else if (entry.isFile()) {
          results.totalFiles++;

          // Check for README
          if (entry.name.match(/^README/i)) {
            results.readmes.push({
              path: fullPath,
              name: entry.name,
              dir: path.dirname(fullPath)
            });
          }

          // Check for CSS themes
          if (entry.name.match(/theme|style/i) && entry.name.endsWith('.css')) {
            await this._scanTheme(fullPath, results);
          }
        }
      }
    } catch (error) {
      // Permission denied or other error - skip
      if (error.code !== 'EACCES' && error.code !== 'EPERM') {
        console.error(`Error scanning ${dirPath}:`, error.message);
      }
    }
  }

  /**
   * Scan git repository
   */
  async _scanGitRepo(repoPath, results) {
    try {
      const gitInfo = {
        path: repoPath,
        name: path.basename(repoPath),
        remote: null,
        remoteUrl: null,
        branch: null,
        status: {},
        lastCommit: null
      };

      // Get remote
      try {
        const { stdout: remote } = await execAsync('git remote', { cwd: repoPath });
        gitInfo.remote = remote.trim() || null;

        if (gitInfo.remote) {
          const { stdout: remoteUrl } = await execAsync(`git remote get-url ${gitInfo.remote}`, { cwd: repoPath });
          gitInfo.remoteUrl = remoteUrl.trim();
        }
      } catch {
        gitInfo.remote = null;
      }

      // Get branch
      try {
        const { stdout: branch } = await execAsync('git branch --show-current', { cwd: repoPath });
        gitInfo.branch = branch.trim();
      } catch {
        gitInfo.branch = null;
      }

      // Get status
      try {
        const { stdout: status } = await execAsync('git status --porcelain', { cwd: repoPath });
        const lines = status.trim().split('\n').filter(l => l);
        gitInfo.status = {
          modified: lines.filter(l => l.startsWith(' M')).length,
          added: lines.filter(l => l.startsWith('A ')).length,
          deleted: lines.filter(l => l.startsWith(' D')).length,
          untracked: lines.filter(l => l.startsWith('??')).length,
          total: lines.length,
          clean: lines.length === 0
        };
      } catch {
        gitInfo.status = { clean: true, total: 0 };
      }

      // Get last commit
      try {
        const { stdout: commit } = await execAsync('git log -1 --format="%H|%an|%ae|%ai|%s"', { cwd: repoPath });
        const [hash, author, email, date, message] = commit.trim().split('|');
        gitInfo.lastCommit = { hash, author, email, date, message };
      } catch {
        gitInfo.lastCommit = null;
      }

      results.gitRepos.push(gitInfo);
    } catch (error) {
      console.error(`Error scanning git repo ${repoPath}:`, error.message);
    }
  }

  /**
   * Scan project (package.json)
   */
  async _scanProject(projectPath, results) {
    try {
      const packagePath = path.join(projectPath, 'package.json');
      const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));

      results.projects.push({
        path: projectPath,
        name: path.basename(projectPath),
        packageName: packageData.name,
        version: packageData.version,
        description: packageData.description,
        scripts: Object.keys(packageData.scripts || {}),
        dependencies: Object.keys(packageData.dependencies || {}).length,
        devDependencies: Object.keys(packageData.devDependencies || {}).length
      });
    } catch (error) {
      // Invalid package.json
    }
  }

  /**
   * Scan CSS theme file
   */
  async _scanTheme(themePath, results) {
    try {
      const content = await fs.readFile(themePath, 'utf8');
      const lines = content.split('\n');

      // Extract CSS variables
      const variables = [];
      const variableRegex = /--([a-zA-Z0-9-]+):\s*([^;]+);/g;
      let match;

      while ((match = variableRegex.exec(content)) !== null) {
        variables.push({
          name: match[1],
          value: match[2].trim()
        });
      }

      results.themes.push({
        path: themePath,
        name: path.basename(themePath),
        lines: lines.length,
        variables: variables,
        hasVariables: variables.length > 0,
        size: content.length
      });
    } catch (error) {
      // Error reading theme
    }
  }

  /**
   * Check if should ignore path
   */
  _shouldIgnore(name) {
    return this.ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern || name.startsWith(pattern);
    });
  }

  /**
   * Get directory tree structure
   */
  async getTree(startPath = this.rootPath, maxDepth = 3) {
    const tree = {
      name: path.basename(startPath),
      path: startPath,
      type: 'directory',
      children: []
    };

    await this._buildTree(startPath, tree, 0, maxDepth);
    return tree;
  }

  async _buildTree(dirPath, node, depth, maxDepth) {
    if (depth >= maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (this._shouldIgnore(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        const child = {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file'
        };

        if (entry.isDirectory()) {
          // Check for git
          try {
            await fs.access(path.join(fullPath, '.git'));
            child.hasGit = true;
          } catch {
            child.hasGit = false;
          }

          // Check for package.json
          try {
            await fs.access(path.join(fullPath, 'package.json'));
            child.hasPackage = true;
          } catch {
            child.hasPackage = false;
          }

          child.children = [];
          await this._buildTree(fullPath, child, depth + 1, maxDepth);
        } else {
          // File metadata
          try {
            const stats = await fs.stat(fullPath);
            child.size = stats.size;
            child.modified = stats.mtime;
          } catch {
            // Can't stat
          }
        }

        node.children.push(child);
      }

      // Sort: directories first, then alphabetically
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      // Permission denied
    }
  }

  /**
   * Quick scan - just git repos
   */
  async quickScanGit() {
    const results = [];
    await this._quickScanGitRecursive(this.rootPath, 0, results);
    return results;
  }

  async _quickScanGitRecursive(dirPath, depth, results) {
    if (depth > this.maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (this._shouldIgnore(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.name === '.git') {
          const repoResults = { gitRepos: [] };
          await this._scanGitRepo(path.dirname(fullPath), repoResults);
          results.push(...repoResults.gitRepos);
          continue;
        }

        await this._quickScanGitRecursive(fullPath, depth + 1, results);
      }
    } catch (error) {
      // Skip
    }
  }
}

module.exports = DesktopScanner;
