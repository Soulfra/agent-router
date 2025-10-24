/**
 * Minimal File Scanner
 *
 * Fast, shallow scanning - no deep recursion
 * Uses skipdir approach for efficiency
 */

const fs = require('fs').promises;
const path = require('path');

// Skip these immediately (no recursion)
// NOTE: .git is NOT here - we need to detect it first!
const SKIP_DIRS = new Set([
  'node_modules',
  '.Trash',
  'Library',
  'Applications',
  '.npm',
  '.cache',
  'dist',
  'build',
  'coverage'
]);

class Scanner {
  constructor(rootPath, options = {}) {
    this.rootPath = rootPath;
    this.maxDepth = options.maxDepth || 3;
    this.includeHidden = options.includeHidden || false;
  }

  /**
   * Quick scan - find git repos only
   * No deep recursion, skip unnecessary dirs
   */
  async scanGitRepos() {
    const repos = [];
    await this._scanDir(this.rootPath, 0, repos);
    return repos;
  }

  /**
   * Scan directory (shallow, with skipdir)
   */
  async _scanDir(dirPath, depth, repos) {
    // Stop if too deep
    if (depth > this.maxDepth) return;

    try {
      // Read directory (fast, with types)
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      console.log(`[DEBUG] Scanning ${dirPath} (depth ${depth}): ${entries.length} entries`);

      for (const entry of entries) {
        // Skip hidden files (unless enabled)
        if (!this.includeHidden && entry.name.startsWith('.') && entry.name !== '.git') {
          continue;
        }

        // Skip immediately (no recursion)
        if (SKIP_DIRS.has(entry.name)) {
          console.log(`[DEBUG] Skipping ${entry.name} (in SKIP_DIRS)`);
          continue;
        }

        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);

          // Check if git repo (.git folder exists)
          if (entry.name === '.git') {
            // Parent dir is a git repo
            const repoPath = dirPath;
            console.log(`[DEBUG] Found .git in ${repoPath}`);
            const gitInfo = await this._quickGitInfo(repoPath);
            repos.push({
              path: repoPath,
              name: path.basename(repoPath),
              ...gitInfo
            });
            console.log(`[DEBUG] Added repo: ${path.basename(repoPath)}`);
            continue; // Don't recurse into .git
          }

          // Recurse into subdirectory
          console.log(`[DEBUG] Recursing into ${entry.name}`);
          await this._scanDir(fullPath, depth + 1, repos);
        }
      }
    } catch (error) {
      // Permission denied or other error - skip
      if (error.code !== 'EACCES' && error.code !== 'EPERM') {
        console.error(`Scan error ${dirPath}:`, error.message);
      }
    }
  }

  /**
   * Get quick git info (no git commands, just check files)
   */
  async _quickGitInfo(repoPath) {
    const info = {
      hasGit: true,
      hasRemote: false,
      remoteUrl: null,
      isDirty: false
    };

    try {
      // Check if remote exists (read .git/config)
      const configPath = path.join(repoPath, '.git', 'config');
      const config = await fs.readFile(configPath, 'utf8');

      // Quick parse for remote URL
      const remoteMatch = config.match(/\[remote "(.+?)"\][^[]*?url = (.+?)[\n\r]/);
      if (remoteMatch) {
        info.hasRemote = true;
        info.remoteUrl = remoteMatch[2].trim();
      }

      // Check if dirty (see if git status would show changes)
      // This is approximate - just check if index differs from HEAD
      const indexPath = path.join(repoPath, '.git', 'index');
      const headPath = path.join(repoPath, '.git', 'HEAD');

      const [indexStat, headStat] = await Promise.all([
        fs.stat(indexPath).catch(() => null),
        fs.stat(headPath).catch(() => null)
      ]);

      // If index is newer than HEAD, likely dirty
      if (indexStat && headStat && indexStat.mtime > headStat.mtime) {
        info.isDirty = true;
      }

    } catch (error) {
      // Can't read git files
    }

    return info;
  }

  /**
   * Full file tree (limited depth)
   */
  async getTree() {
    const tree = {
      name: path.basename(this.rootPath),
      path: this.rootPath,
      type: 'directory',
      children: []
    };

    await this._buildTree(this.rootPath, tree, 0);
    return tree;
  }

  async _buildTree(dirPath, node, depth) {
    if (depth >= this.maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip
        if (!this.includeHidden && entry.name.startsWith('.')) continue;
        if (SKIP_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        const child = {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file'
        };

        if (entry.isDirectory()) {
          child.children = [];
          await this._buildTree(fullPath, child, depth + 1);
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
      // Skip
    }
  }
}

module.exports = Scanner;
