/**
 * Code Indexer
 *
 * Scans user's GitHub repos, cookbook, and local scripts to index code snippets.
 * Enables calos-expert to search and use REAL CODE from user's own projects
 * instead of giving generic "canned responses".
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execAsync = promisify(exec);

class CodeIndexer {
  constructor(db) {
    this.db = db;

    // Supported file extensions by language
    this.languageExtensions = {
      python: ['.py'],
      lua: ['.lua'],
      javascript: ['.js', '.mjs', '.ts'],
      bash: ['.sh', '.bash'],
      ruby: ['.rb'],
      go: ['.go'],
      rust: ['.rs']
    };

    // Patterns to detect function definitions
    this.functionPatterns = {
      python: /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm,
      lua: /^function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm,
      javascript: /^(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(|^(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s*)?\(/gm,
      bash: /^function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(|^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)\s*\{/gm
    };

    // Docstring patterns
    this.docstringPatterns = {
      python: /"""([\s\S]*?)"""|'''([\s\S]*?)'''/,
      javascript: /\/\*\*([\s\S]*?)\*\//,
      bash: /^#\s*@description\s+(.+)/m
    };
  }

  /**
   * Index a GitHub repository
   * @param {string} repoUrl - GitHub repo URL or owner/repo
   * @param {string} localPath - Where to clone/store locally
   */
  async indexGitHubRepo(repoUrl, localPath = null) {
    console.log(`[CodeIndexer] Indexing GitHub repo: ${repoUrl}`);

    // Normalize repo URL
    let repoName = repoUrl;
    if (repoUrl.includes('github.com')) {
      const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
      if (match) {
        repoName = match[1].replace('.git', '');
      }
    }

    // Default local path
    if (!localPath) {
      localPath = path.join(process.env.HOME, '.calos', 'repos', repoName.replace('/', '_'));
    }

    // Clone or update repo
    if (!fs.existsSync(localPath)) {
      console.log(`[CodeIndexer] Cloning ${repoName}...`);
      await execAsync(`gh repo clone ${repoName} ${localPath}`);
    } else {
      console.log(`[CodeIndexer] Updating ${repoName}...`);
      await execAsync(`cd ${localPath} && git pull`);
    }

    // Get repo metadata
    const { stdout: repoInfo } = await execAsync(`gh repo view ${repoName} --json name,description,primaryLanguage`);
    const metadata = JSON.parse(repoInfo);

    // Insert or update repo in database
    const repoRecord = await this._upsertRepository({
      name: repoName,
      source: 'github',
      repo_url: `https://github.com/${repoName}`,
      local_path: localPath,
      language: metadata.primaryLanguage?.name || 'unknown',
      description: metadata.description,
      metadata: metadata
    });

    // Scan directory for code files
    const snippets = await this.scanDirectory(localPath, repoRecord.id);

    console.log(`[CodeIndexer] ✓ Indexed ${snippets.length} code snippets from ${repoName}`);

    return {
      repo: repoRecord,
      snippets: snippets
    };
  }

  /**
   * Index a local directory (cookbook, scripts folder, etc.)
   * @param {string} dirPath - Path to directory
   * @param {string} name - Name for this collection
   */
  async indexLocalDirectory(dirPath, name = null) {
    console.log(`[CodeIndexer] Indexing local directory: ${dirPath}`);

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    if (!name) {
      name = path.basename(dirPath);
    }

    // Insert or update repo in database
    const repoRecord = await this._upsertRepository({
      name: name,
      source: 'local',
      repo_url: null,
      local_path: dirPath,
      language: 'mixed',
      description: `Local code collection: ${name}`
    });

    // Scan directory for code files
    const snippets = await this.scanDirectory(dirPath, repoRecord.id);

    console.log(`[CodeIndexer] ✓ Indexed ${snippets.length} code snippets from ${name}`);

    return {
      repo: repoRecord,
      snippets: snippets
    };
  }

  /**
   * Scan a directory for code files
   * @param {string} dirPath - Directory to scan
   * @param {number} repoId - Repo ID in database
   */
  async scanDirectory(dirPath, repoId) {
    const snippets = [];
    const files = this._getCodeFiles(dirPath);

    console.log(`[CodeIndexer] Found ${files.length} code files to process`);

    for (const file of files) {
      try {
        const fileSnippets = await this.parseCodeFile(file, repoId);
        snippets.push(...fileSnippets);
      } catch (error) {
        console.error(`[CodeIndexer] Error parsing ${file}:`, error.message);
      }
    }

    // Update repo file counts
    await this.db.query(
      'UPDATE code_repositories SET file_count = $1, last_indexed = NOW() WHERE id = $2',
      [files.length, repoId]
    );

    return snippets;
  }

  /**
   * Parse a code file and extract functions/snippets
   * @param {string} filePath - Path to code file
   * @param {number} repoId - Repo ID
   */
  async parseCodeFile(filePath, repoId) {
    const code = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const language = this._detectLanguage(filePath);
    const snippets = [];

    // Extract entire file as a snippet (for scripts)
    if (code.length < 10000) {  // Only for small files
      const docstring = this._extractDocstring(code, language);

      const snippet = await this._insertSnippet({
        repo_id: repoId,
        file_path: filePath,
        filename: filename,
        language: language,
        code: code,
        function_name: null,
        snippet_type: 'script',
        docstring: docstring,
        description: this._generateDescription(code, language, docstring),
        tags: this._extractTags(code, language),
        dependencies: this._extractDependencies(code, language),
        start_line: 1,
        end_line: code.split('\n').length
      });

      snippets.push(snippet);
    }

    // Extract individual functions
    const functions = this._extractFunctions(code, language);
    for (const func of functions) {
      const snippet = await this._insertSnippet({
        repo_id: repoId,
        file_path: filePath,
        filename: filename,
        language: language,
        code: func.code,
        function_name: func.name,
        snippet_type: 'function',
        docstring: func.docstring,
        description: this._generateDescription(func.code, language, func.docstring),
        tags: this._extractTags(func.code, language),
        dependencies: this._extractDependencies(func.code, language),
        start_line: func.startLine,
        end_line: func.endLine
      });

      snippets.push(snippet);
    }

    return snippets;
  }

  /**
   * Extract functions from code
   */
  _extractFunctions(code, language) {
    const functions = [];
    const pattern = this.functionPatterns[language];

    if (!pattern) {
      return functions;
    }

    const lines = code.split('\n');
    let match;

    while ((match = pattern.exec(code)) !== null) {
      const funcName = match[1] || match[2];
      if (!funcName) continue;

      // Find function start line
      const beforeMatch = code.substring(0, match.index);
      const startLine = beforeMatch.split('\n').length;

      // Extract function body (naive approach - finds next function or end of file)
      let endLine = lines.length;
      for (let i = startLine; i < lines.length; i++) {
        const nextLine = lines[i];
        // Check if we hit another function definition
        if (i > startLine && pattern.test(nextLine)) {
          endLine = i - 1;
          break;
        }
      }

      const funcCode = lines.slice(startLine - 1, endLine).join('\n');
      const docstring = this._extractDocstring(funcCode, language);

      functions.push({
        name: funcName,
        code: funcCode,
        docstring: docstring,
        startLine: startLine,
        endLine: endLine
      });
    }

    return functions;
  }

  /**
   * Extract docstring/comments from code
   */
  _extractDocstring(code, language) {
    const pattern = this.docstringPatterns[language];
    if (!pattern) return null;

    const match = code.match(pattern);
    if (match) {
      return (match[1] || match[2] || match[0]).trim();
    }

    return null;
  }

  /**
   * Generate description from code (simple heuristics)
   */
  _generateDescription(code, language, docstring) {
    if (docstring) {
      // Use first line of docstring
      return docstring.split('\n')[0].trim();
    }

    // Generate from code
    const firstLine = code.split('\n')[0].trim();
    if (firstLine.startsWith('#') || firstLine.startsWith('//')) {
      return firstLine.replace(/^[#\/]+\s*/, '');
    }

    return `${language} code snippet`;
  }

  /**
   * Extract tags from code (imports, keywords)
   */
  _extractTags(code, language) {
    const tags = new Set();

    // Common keywords
    const keywords = ['api', 'webhook', 'automation', 'cli', 'database', 'http', 'rest', 'graphql'];
    const codeLower = code.toLowerCase();

    for (const keyword of keywords) {
      if (codeLower.includes(keyword)) {
        tags.add(keyword);
      }
    }

    // Language-specific imports
    if (language === 'python') {
      const imports = code.match(/^import\s+(\w+)|^from\s+(\w+)/gm) || [];
      imports.forEach(imp => {
        const match = imp.match(/\w+$/);
        if (match) tags.add(match[0]);
      });
    }

    return Array.from(tags);
  }

  /**
   * Extract dependencies (imports, requires)
   */
  _extractDependencies(code, language) {
    const deps = new Set();

    if (language === 'python') {
      const matches = code.matchAll(/^(?:import|from)\s+([\w.]+)/gm);
      for (const match of matches) {
        deps.add(match[1].split('.')[0]);
      }
    } else if (language === 'javascript') {
      const matches = code.matchAll(/require\(['"]([^'"]+)['"]\)|from\s+['"]([^'"]+)['"]/gm);
      for (const match of matches) {
        deps.add(match[1] || match[2]);
      }
    }

    return Array.from(deps);
  }

  /**
   * Get all code files in directory recursively
   */
  _getCodeFiles(dirPath, maxDepth = 10) {
    const files = [];

    const walk = (dir, depth = 0) => {
      if (depth > maxDepth) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common ignore patterns
        if (this._shouldIgnore(entry.name)) continue;

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile() && this._isCodeFile(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    walk(dirPath);
    return files;
  }

  /**
   * Check if file should be ignored
   */
  _shouldIgnore(name) {
    const ignorePatterns = [
      'node_modules',
      '.git',
      '__pycache__',
      'venv',
      'env',
      '.pytest_cache',
      'dist',
      'build',
      '.next',
      'target'
    ];

    return ignorePatterns.includes(name) || name.startsWith('.');
  }

  /**
   * Check if file is a code file
   */
  _isCodeFile(filename) {
    const ext = path.extname(filename);
    for (const extensions of Object.values(this.languageExtensions)) {
      if (extensions.includes(ext)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detect language from file extension
   */
  _detectLanguage(filePath) {
    const ext = path.extname(filePath);
    for (const [language, extensions] of Object.entries(this.languageExtensions)) {
      if (extensions.includes(ext)) {
        return language;
      }
    }
    return 'unknown';
  }

  /**
   * Insert or update repository in database
   */
  async _upsertRepository(data) {
    const result = await this.db.query(
      `INSERT INTO code_repositories (name, source, repo_url, local_path, language, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name, source) DO UPDATE
       SET local_path = EXCLUDED.local_path,
           language = EXCLUDED.language,
           description = EXCLUDED.description,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
       RETURNING *`,
      [
        data.name,
        data.source,
        data.repo_url,
        data.local_path,
        data.language,
        data.description,
        JSON.stringify(data.metadata || {})
      ]
    );

    return result.rows[0];
  }

  /**
   * Insert snippet into database
   */
  async _insertSnippet(data) {
    const result = await this.db.query(
      `INSERT INTO code_snippets (
        repo_id, file_path, filename, language, code, function_name,
        snippet_type, docstring, description, tags, dependencies,
        start_line, end_line
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (repo_id, file_path, function_name) DO UPDATE
      SET code = EXCLUDED.code,
          docstring = EXCLUDED.docstring,
          description = EXCLUDED.description,
          tags = EXCLUDED.tags,
          dependencies = EXCLUDED.dependencies,
          updated_at = NOW()
      RETURNING *`,
      [
        data.repo_id,
        data.file_path,
        data.filename,
        data.language,
        data.code,
        data.function_name,
        data.snippet_type,
        data.docstring,
        data.description,
        data.tags,
        data.dependencies,
        data.start_line,
        data.end_line
      ]
    );

    return result.rows[0];
  }

  /**
   * Search code snippets (full-text search)
   * @param {string} query - Search query
   * @param {object} filters - Optional filters (language, repo, etc.)
   */
  async searchCode(query, filters = {}) {
    let sql = `
      SELECT cs.*, cr.name as repo_name, cr.source as repo_source,
             ts_rank(cs.search_vector, plainto_tsquery('english', $1)) as rank
      FROM code_snippets cs
      JOIN code_repositories cr ON cr.id = cs.repo_id
      WHERE cs.search_vector @@ plainto_tsquery('english', $1)
    `;

    const params = [query];
    let paramIndex = 2;

    if (filters.language) {
      sql += ` AND cs.language = $${paramIndex}`;
      params.push(filters.language);
      paramIndex++;
    }

    if (filters.repo_id) {
      sql += ` AND cs.repo_id = $${paramIndex}`;
      params.push(filters.repo_id);
      paramIndex++;
    }

    sql += ` ORDER BY rank DESC LIMIT ${filters.limit || 10}`;

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Get repository statistics
   */
  async getStats() {
    const result = await this.db.query(`
      SELECT * FROM repo_stats ORDER BY total_snippets DESC
    `);

    return result.rows;
  }
}

module.exports = CodeIndexer;
