/**
 * Copilot Service Routes
 *
 * RESTful API for LSP-compatible code operations using the Copilot Adapter.
 * Handles code completion, autonomous building, refactoring, explanation, and bug fixing.
 *
 * Uses port 11437 (Copilot/Autonomous Models)
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createCopilotRoutes({ copilotAdapter }) {
  if (!copilotAdapter) {
    throw new Error('CopilotAdapter required for copilot routes');
  }

  // ============================================================================
  // CODE COMPLETION (LSP-compatible)
  // ============================================================================

  /**
   * POST /api/copilot/complete
   * LSP-compatible code completion
   *
   * Request body:
   * {
   *   "textDocument": {
   *     "uri": "file:///src/Button.jsx",
   *     "version": 1
   *   },
   *   "position": {
   *     "line": 10,
   *     "character": 5
   *   },
   *   "surrounding_code": "function Button({ children, ",
   *   "language": "javascript"
   * }
   *
   * Response (LSP CompletionList):
   * {
   *   "isIncomplete": false,
   *   "items": [
   *     {
   *       "label": "onClick",
   *       "kind": 5,
   *       "detail": "(event: MouseEvent) => void",
   *       "documentation": "Click handler function",
   *       "insertText": "onClick",
   *       "sortText": "0"
   *     }
   *   ]
   * }
   */
  router.post('/complete', async (req, res) => {
    try {
      const { textDocument, position, surrounding_code, language, custom_prompt } = req.body;

      const result = await copilotAdapter.handle({
        operation: 'complete',
        context: { textDocument, position, surrounding_code, language },
        prompt: custom_prompt
      });

      // Return LSP-formatted response
      res.json(result);
    } catch (error) {
      console.error('[CopilotRoutes] Complete error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // AUTONOMOUS BUILDING
  // ============================================================================

  /**
   * POST /api/copilot/build
   * Autonomously build feature from description
   *
   * Request body:
   * {
   *   "prompt": "Create a reusable Button component with variants",
   *   "project_context": "React + TypeScript project",
   *   "coding_style": "idiomatic",
   *   "file_structure": ["src/components/", "src/hooks/"]
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "files": [
   *     {
   *       "path": "src/components/Button.tsx",
   *       "code": "...",
   *       "description": "Reusable button component"
   *     }
   *   ],
   *   "tests": [
   *     {
   *       "path": "src/components/Button.test.tsx",
   *       "code": "...",
   *       "description": "Unit tests for Button"
   *     }
   *   ],
   *   "documentation": "Brief usage guide"
   * }
   */
  router.post('/build', async (req, res) => {
    try {
      const { prompt, project_context, coding_style, file_structure } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: prompt'
        });
      }

      const result = await copilotAdapter.handle({
        operation: 'build',
        context: { project_context, coding_style, file_structure },
        prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[CopilotRoutes] Build error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CODE REFACTORING
  // ============================================================================

  /**
   * POST /api/copilot/refactor
   * Refactor code for better quality
   *
   * Request body:
   * {
   *   "code": "function processData(data) { ... }",
   *   "language": "javascript",
   *   "refactor_type": "performance" // general, performance, readability
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "refactored_code": "...",
   *   "changes": [
   *     { "type": "extracted_function", "description": "...", "reason": "..." }
   *   ],
   *   "improvement_summary": "Reduced time complexity from O(n²) to O(n)"
   * }
   */
  router.post('/refactor', async (req, res) => {
    try {
      const { code, language, refactor_type, custom_prompt } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: code'
        });
      }

      const result = await copilotAdapter.handle({
        operation: 'refactor',
        context: { code, language, refactor_type },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[CopilotRoutes] Refactor error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CODE EXPLANATION
  // ============================================================================

  /**
   * POST /api/copilot/explain
   * Explain code in detail
   *
   * Request body:
   * {
   *   "code": "const memoized = useMemo(() => heavyComputation(data), [data]);",
   *   "language": "javascript",
   *   "detail_level": "medium" // low, medium, high
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "summary": "Brief overview",
   *   "explanation": "Detailed explanation",
   *   "key_concepts": ["memoization", "React hooks"],
   *   "complexity": "O(1)",
   *   "potential_issues": ["data dependency may cause re-renders"]
   * }
   */
  router.post('/explain', async (req, res) => {
    try {
      const { code, language, detail_level, custom_prompt } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: code'
        });
      }

      const result = await copilotAdapter.handle({
        operation: 'explain',
        context: { code, language, detail_level },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[CopilotRoutes] Explain error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // BUG FIXING
  // ============================================================================

  /**
   * POST /api/copilot/fix
   * Fix bugs in code
   *
   * Request body:
   * {
   *   "code": "function divide(a, b) { return a / b; }",
   *   "language": "javascript",
   *   "error_message": "TypeError: Cannot read property 'length' of undefined",
   *   "stack_trace": "at divide (index.js:42:10)" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "bug_identified": "Division by zero not handled",
   *   "root_cause": "No validation for b === 0",
   *   "fixed_code": "function divide(a, b) { if (b === 0) throw new Error('Division by zero'); return a / b; }",
   *   "explanation": "Added validation to prevent division by zero",
   *   "prevention": "Always validate input parameters"
   * }
   */
  router.post('/fix', async (req, res) => {
    try {
      const { code, language, error_message, stack_trace, custom_prompt } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: code'
        });
      }

      const result = await copilotAdapter.handle({
        operation: 'fix',
        context: { code, language, error_message, stack_trace },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[CopilotRoutes] Fix error:', error);
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
   * GET /api/copilot/health
   * Check if Copilot service is operational
   */
  router.get('/health', async (req, res) => {
    try {
      res.json({
        success: true,
        service: 'copilot',
        port: 11437,
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

module.exports = createCopilotRoutes;
