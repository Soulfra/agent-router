/**
 * GitHub Publisher
 *
 * Publishes analysis results back to GitHub as:
 * - Issue comments
 * - PR comments
 * - Commit status checks
 * - Release notes
 *
 * Completes the full pipeline: Clone → Analyze → Grade → Publish
 */

const { spawn } = require('child_process');

class GitHubPublisher {
  constructor(options = {}) {
    this.useGH = options.useGH !== false; // Use gh CLI by default
  }

  /**
   * Publish results to GitHub issue
   * @param {string} repo - owner/repo format
   * @param {number} issueNumber - Issue number
   * @param {string} report - Analysis report
   * @returns {Promise<object>}
   */
  async publishToIssue(repo, issueNumber, report) {
    if (!this.useGH) {
      throw new Error('GitHub CLI publishing disabled');
    }

    // Check gh CLI
    const hasGH = await this.checkGHCLI();
    if (!hasGH) {
      throw new Error('gh CLI not installed. Install with: brew install gh');
    }

    // Format report as markdown
    const markdown = this.formatAsMarkdown(report);

    // Post comment using gh CLI
    const result = await this.execGH([
      'issue', 'comment', issueNumber.toString(),
      '--repo', repo,
      '--body', markdown
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to publish to issue: ${result.stderr}`);
    }

    return {
      success: true,
      repo,
      issueNumber,
      url: `https://github.com/${repo}/issues/${issueNumber}`
    };
  }

  /**
   * Publish results to GitHub PR
   * @param {string} repo - owner/repo format
   * @param {number} prNumber - PR number
   * @param {string} report - Analysis report
   * @returns {Promise<object>}
   */
  async publishToPR(repo, prNumber, report) {
    if (!this.useGH) {
      throw new Error('GitHub CLI publishing disabled');
    }

    const hasGH = await this.checkGHCLI();
    if (!hasGH) {
      throw new Error('gh CLI not installed. Install with: brew install gh');
    }

    const markdown = this.formatAsMarkdown(report);

    // Post PR comment
    const result = await this.execGH([
      'pr', 'comment', prNumber.toString(),
      '--repo', repo,
      '--body', markdown
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to publish to PR: ${result.stderr}`);
    }

    return {
      success: true,
      repo,
      prNumber,
      url: `https://github.com/${repo}/pull/${prNumber}`
    };
  }

  /**
   * Create new issue with results
   * @param {string} repo - owner/repo format
   * @param {string} title - Issue title
   * @param {string} report - Analysis report
   * @param {array} labels - Issue labels
   * @returns {Promise<object>}
   */
  async createIssue(repo, title, report, labels = []) {
    if (!this.useGH) {
      throw new Error('GitHub CLI publishing disabled');
    }

    const hasGH = await this.checkGHCLI();
    if (!hasGH) {
      throw new Error('gh CLI not installed');
    }

    const markdown = this.formatAsMarkdown(report);

    const args = [
      'issue', 'create',
      '--repo', repo,
      '--title', title,
      '--body', markdown
    ];

    // Add labels if provided
    if (labels.length > 0) {
      args.push('--label', labels.join(','));
    }

    const result = await this.execGH(args);

    if (result.code !== 0) {
      throw new Error(`Failed to create issue: ${result.stderr}`);
    }

    // Parse issue URL from output
    const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    return {
      success: true,
      repo,
      url
    };
  }

  /**
   * Push results to new branch and create PR
   * @param {string} repo - Local repo path
   * @param {string} branchName - Branch name
   * @param {string} report - Analysis report
   * @param {string} commitMessage - Commit message
   * @returns {Promise<object>}
   */
  async createPRWithResults(repo, branchName, report, commitMessage) {
    // This would involve:
    // 1. Create new branch
    // 2. Write report file
    // 3. Commit changes
    // 4. Push branch
    // 5. Create PR

    // For now, return a placeholder
    return {
      success: false,
      message: 'createPRWithResults not yet implemented'
    };
  }

  /**
   * Update commit status check
   * @param {string} repo - owner/repo format
   * @param {string} sha - Commit SHA
   * @param {string} state - success, failure, pending
   * @param {string} description - Status description
   * @returns {Promise<object>}
   */
  async updateCommitStatus(repo, sha, state, description) {
    // Requires GitHub API token with repo permissions
    // gh CLI doesn't have direct status API

    return {
      success: false,
      message: 'updateCommitStatus requires GitHub API'
    };
  }

  /**
   * Format report as markdown for GitHub
   */
  formatAsMarkdown(report) {
    // Check if report is already an object (from pipeline)
    if (typeof report === 'object') {
      return this.generateMarkdownFromPipeline(report);
    }

    // If it's a string, wrap in code block
    return `## 📊 Analysis Report\n\n\`\`\`\n${report}\n\`\`\``;
  }

  /**
   * Generate markdown from pipeline result object
   */
  generateMarkdownFromPipeline(pipelineResult) {
    const { project, stages, finalScores, timing } = pipelineResult;

    let md = `## 📊 Code Analysis Report\n\n`;

    // Project info
    md += `**Project:** ${project.title}\n\n`;
    if (project.description) {
      md += `${project.description}\n\n`;
    }

    // Scores
    if (finalScores) {
      md += `### 🏆 Final Scores\n\n`;

      if (finalScores.local !== null) {
        md += `- **Local (Math-Based):** ${finalScores.local}/100\n`;
      }

      if (finalScores.ollama !== null) {
        md += `- **AI-Based:** ${finalScores.ollama}/100\n`;
      }

      if (finalScores.combined !== null) {
        md += `- **Combined Score:** ⭐ **${finalScores.combined}/100**\n`;
      }

      md += `\n`;
    }

    // Depth Analysis (NEW)
    if (stages.depthAnalysis) {
      const depth = stages.depthAnalysis.depthAnalysis;
      const ranking = stages.depthAnalysis.difficultyRanking;

      md += `### 🔍 Code Complexity Analysis\n\n`;
      md += `- **Difficulty:** ${ranking.baseDifficulty.toUpperCase()} (${'⭐'.repeat(ranking.stars)})\n`;
      md += `- **Overall Depth:** ${depth.overallDepth.toFixed(2)}\n`;
      md += `- **Sudoku Equivalent:** ${depth.comparisons.sudoku}\n`;
      md += `- **LeetCode Equivalent:** ${depth.comparisons.leetcode}\n`;
      md += `- **Estimated Solving Time:** ${ranking.estimatedTime.display}\n\n`;

      if (depth.algorithms.count > 0) {
        md += `**Algorithms Detected:**\n`;
        for (const algo of depth.algorithms.items) {
          md += `- ${algo.description}\n`;
        }
        md += `\n`;
      }
    }

    // Compaction Stats
    if (stages.compaction) {
      const stats = stages.compaction.stats;
      md += `### 📦 Code Optimization\n\n`;
      md += `- **Size Reduction:** ${stats.reduction.size}%\n`;
      md += `- **Token Reduction:** ${stats.reduction.tokens}%\n`;
      md += `- **Tokens Saved:** ${(stats.original.tokens - stats.compacted.tokens).toLocaleString()}\n\n`;
    }

    // Grading Breakdown
    if (stages.localGrading && stages.localGrading.tracks) {
      md += `### 📊 Track Scores\n\n`;

      for (const [track, result] of Object.entries(stages.localGrading.tracks)) {
        if (result.error) continue;

        md += `**${track.toUpperCase()}:** ${result.overall}/100\n\n`;

        if (result.breakdown) {
          md += `<details>\n<summary>View breakdown</summary>\n\n`;
          for (const [category, score] of Object.entries(result.breakdown)) {
            md += `- ${category}: ${score}/100\n`;
          }
          md += `\n</details>\n\n`;
        }
      }
    }

    // Timing
    if (timing) {
      md += `### ⏱️ Performance\n\n`;
      md += `- **Total Time:** ${timing.total}ms\n`;
      md += `- **Compaction:** ${timing.compaction || 0}ms\n`;
      if (timing.depthAnalysis) {
        md += `- **Depth Analysis:** ${timing.depthAnalysis}ms\n`;
      }
      md += `- **Grading:** ${timing.localGrading || 0}ms\n\n`;
    }

    md += `---\n`;
    md += `*Generated by CALOS Code Analysis Pipeline*\n`;

    return md;
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
   * Execute gh CLI command
   */
  async execGH(args) {
    return new Promise((resolve, reject) => {
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

  /**
   * Generate summary for issue/PR
   */
  generateSummary(pipelineResult) {
    const { finalScores, stages } = pipelineResult;

    let summary = '';

    // Score emoji
    if (finalScores && finalScores.combined !== null) {
      const score = finalScores.combined;
      if (score >= 90) {
        summary += '🎉 **Excellent!** ';
      } else if (score >= 75) {
        summary += '✅ **Good!** ';
      } else if (score >= 60) {
        summary += '👍 **Decent** ';
      } else {
        summary += '⚠️  **Needs Improvement** ';
      }

      summary += `Score: **${score}/100**\n\n`;
    }

    // Depth difficulty
    if (stages.depthAnalysis) {
      const difficulty = stages.depthAnalysis.difficultyRanking.baseDifficulty;
      const stars = '⭐'.repeat(stages.depthAnalysis.difficultyRanking.stars);
      summary += `**Complexity:** ${difficulty.toUpperCase()} ${stars}\n`;
    }

    return summary;
  }
}

module.exports = GitHubPublisher;
