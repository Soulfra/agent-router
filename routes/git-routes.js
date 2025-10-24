/**
 * Git Service Routes
 *
 * RESTful API for Git/GitHub operations using the Git Adapter.
 * Handles commit messages, PR reviews, diff analysis, and issue generation.
 *
 * Uses port 11435 (Git-Optimized Models)
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createGitRoutes({ gitAdapter }) {
  if (!gitAdapter) {
    throw new Error('GitAdapter required for git routes');
  }

  // ============================================================================
  // COMMIT MESSAGES
  // ============================================================================

  /**
   * POST /api/git/commit-message
   * Generate conventional commit message from diff
   *
   * Request body:
   * {
   *   "diff": "diff --git a/src/auth.js...",
   *   "recent_commits": ["Add user registration", "Fix login validation"],
   *   "repo": "owner/repo-name", // optional
   *   "custom_prompt": "Focus on security changes" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "commit_message": "feat(auth): add password hashing\n\nImplements bcrypt...",
   *   "type": "feat",
   *   "confidence": 0.95,
   *   "follows_convention": true
   * }
   */
  router.post('/commit-message', async (req, res) => {
    try {
      const { diff, recent_commits, repo, custom_prompt } = req.body;

      if (!diff) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: diff'
        });
      }

      const result = await gitAdapter.handle({
        operation: 'commit_message',
        context: { diff, recent_commits, repo },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GitRoutes] Commit message error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PULL REQUEST ANALYSIS
  // ============================================================================

  /**
   * POST /api/git/review-pr
   * Analyze pull request and generate review
   *
   * Request body:
   * {
   *   "owner": "username",
   *   "repo": "repository",
   *   "pr_number": 42,
   *   "diff": "..." // optional if pr_number provided
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "summary": "Brief overview of changes",
   *   "security_issues": [
   *     { "severity": "high", "line": 42, "issue": "SQL injection risk", "suggestion": "Use parameterized queries" }
   *   ],
   *   "bugs": [...],
   *   "improvements": [...],
   *   "approval_recommendation": "request_changes"
   * }
   */
  router.post('/review-pr', async (req, res) => {
    try {
      const { owner, repo, pr_number, diff, custom_prompt } = req.body;

      if (!diff && !pr_number) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: diff or pr_number'
        });
      }

      const result = await gitAdapter.handle({
        operation: 'pull_request',
        context: { owner, repo, pr_number, diff },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GitRoutes] PR review error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // DIFF ANALYSIS
  // ============================================================================

  /**
   * POST /api/git/analyze-diff
   * Analyze git diff and suggest improvements
   *
   * Request body:
   * {
   *   "diff": "diff --git a/src/utils.js...",
   *   "file_path": "src/utils.js" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "summary": "Brief summary of changes",
   *   "issues": [
   *     { "type": "bug", "description": "...", "suggestion": "..." }
   *   ],
   *   "test_suggestions": ["Test case 1", "Test case 2"]
   * }
   */
  router.post('/analyze-diff', async (req, res) => {
    try {
      const { diff, file_path, custom_prompt } = req.body;

      if (!diff) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: diff'
        });
      }

      const result = await gitAdapter.handle({
        operation: 'diff',
        context: { diff, file_path },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GitRoutes] Diff analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ISSUE GENERATION
  // ============================================================================

  /**
   * POST /api/git/create-issue
   * Generate well-structured GitHub issue
   *
   * Request body:
   * {
   *   "bug_description": "App crashes when...",
   *   "steps_to_reproduce": "1. Click login\n2. Enter credentials\n3. Click submit",
   *   "expected_behavior": "Should log in successfully",
   *   "actual_behavior": "App crashes with TypeError"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "title": "Fix: Login crash on submit",
   *   "body": "Full issue description in markdown",
   *   "labels": ["bug", "priority:high"]
   * }
   */
  router.post('/create-issue', async (req, res) => {
    try {
      const {
        bug_description,
        steps_to_reproduce,
        expected_behavior,
        actual_behavior,
        custom_prompt
      } = req.body;

      const result = await gitAdapter.handle({
        operation: 'issue',
        context: {
          bug_description,
          steps_to_reproduce,
          expected_behavior,
          actual_behavior
        },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GitRoutes] Issue generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CODE REVIEW
  // ============================================================================

  /**
   * POST /api/git/review-code
   * Review code snippet for issues
   *
   * Request body:
   * {
   *   "code": "function login(user, pass) { ... }",
   *   "language": "javascript",
   *   "file_path": "src/auth.js" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "issues": [
   *     { "severity": "high", "type": "security", "description": "...", "suggestion": "..." }
   *   ],
   *   "overall_quality": "good",
   *   "suggestions": ["Use async/await", "Add error handling"]
   * }
   */
  router.post('/review-code', async (req, res) => {
    try {
      const { code, language, file_path, custom_prompt } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: code'
        });
      }

      const result = await gitAdapter.handle({
        operation: 'review',
        context: { code, language, file_path },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[GitRoutes] Code review error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/git/health
   * Check if Git service is operational
   */
  router.get('/health', async (req, res) => {
    try {
      res.json({
        success: true,
        service: 'git',
        port: 11435,
        status: 'operational'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createGitRoutes;
