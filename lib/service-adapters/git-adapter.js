/**
 * Git Service Adapter
 *
 * Translates between CalOS internal format and Git service expectations.
 * Routes to Ollama port 11435 (Git-optimized models).
 *
 * Supported Operations:
 * - pull_request: Analyze PRs, generate reviews
 * - commit_message: Generate conventional commit messages
 * - diff: Analyze git diffs and suggest improvements
 * - issue: Generate issue descriptions and bug reports
 * - review: Code review feedback
 *
 * Port: 11435
 * Models: codellama:7b, starcoder:7b, deepseek-coder:6.7b
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class GitAdapter {
  constructor(options = {}) {
    this.ollamaPort = options.ollamaPort || 11435;
    this.ollamaHost = options.ollamaHost || 'http://localhost';
    this.defaultModel = options.defaultModel || 'codellama:7b';
    this.localFirst = options.localFirst !== false; // Default: true
  }

  /**
   * Main entry point for Git service requests
   *
   * @param {Object} request - Service request
   * @param {string} request.operation - git operation type
   * @param {Object} request.context - git context (diff, repo, etc.)
   * @param {string} request.prompt - user prompt
   * @returns {Promise<Object>} Formatted git response
   */
  async handle(request) {
    const { operation, context = {}, prompt } = request;

    switch (operation) {
      case 'commit_message':
        return this.generateCommitMessage(context, prompt);

      case 'pull_request':
        return this.analyzePullRequest(context, prompt);

      case 'diff':
        return this.analyzeDiff(context, prompt);

      case 'issue':
        return this.generateIssue(context, prompt);

      case 'review':
        return this.reviewCode(context, prompt);

      default:
        throw new Error(`Unknown git operation: ${operation}`);
    }
  }

  /**
   * Generate conventional commit message from diff
   */
  async generateCommitMessage(context, customPrompt) {
    const { diff, recent_commits = [], repo = '' } = context;

    if (!diff) {
      throw new Error('Missing required context: diff');
    }

    // Analyze recent commits to follow convention
    const commitStyle = this._inferCommitStyle(recent_commits);

    const prompt = customPrompt || `
      Generate a conventional commit message for this diff.

      ${commitStyle ? `Follow this style (based on recent commits):\n${commitStyle}\n` : ''}

      Diff:
      \`\`\`
      ${diff}
      \`\`\`

      Requirements:
      1. Use conventional commit format: <type>(<scope>): <subject>
      2. Types: feat, fix, docs, style, refactor, test, chore
      3. Keep subject line under 50 characters
      4. Add body if needed (wrap at 72 characters)
      5. Focus on "why" not "what" (the diff shows "what")

      Return JSON format:
      {
        "commit_message": "feat(auth): add password hashing\\n\\nImplements bcrypt...",
        "type": "feat",
        "confidence": 0.95,
        "follows_convention": true
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Analyze pull request and generate review
   */
  async analyzePullRequest(context, customPrompt) {
    const { owner, repo, pr_number, diff } = context;

    if (!diff && !pr_number) {
      throw new Error('Missing required context: diff or pr_number');
    }

    // Fetch PR diff if pr_number provided
    let prDiff = diff;
    if (pr_number && !diff) {
      prDiff = await this._fetchPRDiff(owner, repo, pr_number);
    }

    const prompt = customPrompt || `
      Review this pull request and provide constructive feedback.

      Pull Request Diff:
      \`\`\`
      ${prDiff}
      \`\`\`

      Analyze for:
      1. **Security Issues**: SQL injection, XSS, hardcoded secrets
      2. **Bugs**: Logic errors, edge cases, null checks
      3. **Code Quality**: Readability, naming, DRY violations
      4. **Performance**: N+1 queries, unnecessary loops
      5. **Best Practices**: Idiomatic patterns, framework conventions

      Return JSON format:
      {
        "summary": "Brief overview of changes",
        "security_issues": [
          { "severity": "high", "line": 42, "issue": "...", "suggestion": "..." }
        ],
        "bugs": [...],
        "improvements": [...],
        "approval_recommendation": "approve" | "request_changes" | "comment"
      }
    `;

    const response = await this._callOllama({
      model: 'deepseek-coder:6.7b', // Best for reasoning
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Analyze git diff and suggest improvements
   */
  async analyzeDiff(context, customPrompt) {
    const { diff, file_path } = context;

    if (!diff) {
      throw new Error('Missing required context: diff');
    }

    const prompt = customPrompt || `
      Analyze this git diff and suggest improvements.

      ${file_path ? `File: ${file_path}\n` : ''}
      Diff:
      \`\`\`
      ${diff}
      \`\`\`

      Provide:
      1. Summary of changes
      2. Potential issues or improvements
      3. Testing suggestions

      Return JSON format:
      {
        "summary": "Brief summary of changes",
        "issues": [
          { "type": "bug|style|performance", "description": "...", "suggestion": "..." }
        ],
        "test_suggestions": ["Test case 1", "Test case 2"]
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Generate GitHub issue from description
   */
  async generateIssue(context, customPrompt) {
    const { bug_description, steps_to_reproduce, expected_behavior, actual_behavior } = context;

    const prompt = customPrompt || `
      Generate a well-structured GitHub issue.

      ${bug_description ? `Description: ${bug_description}\n` : ''}
      ${steps_to_reproduce ? `Steps: ${steps_to_reproduce}\n` : ''}
      ${expected_behavior ? `Expected: ${expected_behavior}\n` : ''}
      ${actual_behavior ? `Actual: ${actual_behavior}\n` : ''}

      Create a clear, actionable issue with:
      1. Title (concise, descriptive)
      2. Description
      3. Steps to reproduce
      4. Expected vs actual behavior
      5. Suggested labels

      Return JSON format:
      {
        "title": "Issue title",
        "body": "Full issue description in markdown",
        "labels": ["bug", "priority:high"]
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Review code snippet
   */
  async reviewCode(context, customPrompt) {
    const { code, language, file_path } = context;

    if (!code) {
      throw new Error('Missing required context: code');
    }

    const prompt = customPrompt || `
      Review this code for issues and improvements.

      ${language ? `Language: ${language}\n` : ''}
      ${file_path ? `File: ${file_path}\n` : ''}

      Code:
      \`\`\`${language || ''}
      ${code}
      \`\`\`

      Analyze for:
      - Security vulnerabilities
      - Bugs or logic errors
      - Performance issues
      - Code quality and readability
      - Best practices

      Return JSON format:
      {
        "issues": [
          { "severity": "high|medium|low", "type": "security|bug|performance|style", "description": "...", "suggestion": "..." }
        ],
        "overall_quality": "excellent|good|fair|poor",
        "suggestions": ["...", "..."]
      }
    `;

    const response = await this._callOllama({
      model: 'deepseek-coder:6.7b',
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Call Ollama on Git-optimized port 11435
   */
  async _callOllama(request) {
    const url = `${this.ollamaHost}:${this.ollamaPort}/api/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        prompt: request.prompt,
        format: request.format || 'json',
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Fetch PR diff using GitHub CLI
   */
  async _fetchPRDiff(owner, repo, prNumber) {
    if (this.localFirst) {
      // Local-first: warn user we're accessing GitHub
      console.warn(`[GitAdapter] Fetching PR #${prNumber} from GitHub (read-only)`);
    }

    try {
      const { stdout } = await execAsync(`gh pr diff ${prNumber} --repo ${owner}/${repo}`);
      return stdout;
    } catch (error) {
      throw new Error(`Failed to fetch PR diff: ${error.message}`);
    }
  }

  /**
   * Infer commit message style from recent commits
   */
  _inferCommitStyle(recentCommits) {
    if (!recentCommits || recentCommits.length === 0) {
      return null;
    }

    // Check if conventional commits are used
    const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+/;
    const usesConventional = recentCommits.some(msg => conventionalPattern.test(msg));

    if (usesConventional) {
      return 'Conventional Commits (feat/fix/docs/etc.)';
    }

    // Check for emoji commits
    const emojiPattern = /^(✨|🐛|📝|💄|♻️|✅|🔧)/;
    const usesEmoji = recentCommits.some(msg => emojiPattern.test(msg));

    if (usesEmoji) {
      return 'Emoji Commits (✨ feat, 🐛 fix, etc.)';
    }

    // Fallback: show example from recent commits
    return `Example: ${recentCommits[0]}`;
  }

  /**
   * Parse JSON response from LLM
   */
  _parseJSON(response) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/```\s*([\s\S]*?)\s*```/);

      const jsonString = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonString.trim());
    } catch (error) {
      // If parsing fails, return raw response
      return { raw_response: response, parse_error: error.message };
    }
  }

  /**
   * Format response for API
   */
  format(data) {
    return {
      service: 'git',
      port: this.ollamaPort,
      data,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = GitAdapter;
