/**
 * Knowledge Learning Routes
 *
 * Feeds debugging sessions and patterns into Cal's knowledge graph
 * so the system learns common issues and their solutions.
 *
 * Example: When user gets 404 error, Cal learns to check if routes
 * are registered in router.js
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function initializeRoutes(db, { knowledgeGraph } = {}) {
  /**
   * POST /api/knowledge/learn-from-session
   * Records a problem-solution pattern from a debugging session
   */
  router.post('/learn-from-session', async (req, res) => {
    try {
      const {
        problem,
        solution,
        pattern,
        steps = [],
        keywords = [],
        context = {},
        severity = 'info'
      } = req.body;

      if (!problem || !solution) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['problem', 'solution']
        });
      }

      // Structure the learning data
      const learningEntry = {
        timestamp: new Date().toISOString(),
        problem,
        solution,
        pattern: pattern || 'general_debugging',
        steps,
        keywords,
        context,
        severity,
        category: categorizePattern(pattern)
      };

      // Store in knowledge graph if available
      if (knowledgeGraph) {
        try {
          await knowledgeGraph.addPattern({
            type: 'debugging_pattern',
            name: pattern,
            description: problem,
            solution,
            steps,
            keywords,
            context,
            metadata: {
              severity,
              category: learningEntry.category,
              timestamp: learningEntry.timestamp
            }
          });
        } catch (kgError) {
          console.error('[KnowledgeLearning] Knowledge graph error:', kgError);
          // Continue even if knowledge graph fails
        }
      }

      // Store in database for analytics
      if (db) {
        try {
          await db.query(`
            INSERT INTO knowledge_patterns (
              pattern_type,
              problem_description,
              solution_description,
              pattern_name,
              steps,
              keywords,
              context,
              severity,
              category,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (pattern_name, problem_description)
            DO UPDATE SET
              occurrence_count = knowledge_patterns.occurrence_count + 1,
              last_seen_at = NOW(),
              solution_description = EXCLUDED.solution_description,
              steps = EXCLUDED.steps
          `, [
            'debugging_pattern',
            problem,
            solution,
            pattern,
            JSON.stringify(steps),  // steps is stored as TEXT, needs stringify
            keywords,               // keywords is TEXT[], pass array directly
            context,                // context is JSONB, pass object directly
            severity,
            learningEntry.category
          ]);
        } catch (dbError) {
          // Log actual error for debugging
          console.error('[KnowledgeLearning] Database error:', dbError.message);
          console.error('[KnowledgeLearning] Error details:', dbError);
        }
      }

      res.json({
        success: true,
        message: 'Pattern learned successfully',
        pattern: learningEntry
      });

    } catch (error) {
      console.error('[KnowledgeLearning] Error:', error);
      res.status(500).json({
        error: 'Failed to learn pattern',
        message: error.message
      });
    }
  });

  /**
   * GET /api/knowledge/patterns
   * Retrieves learned patterns (optionally filtered)
   */
  router.get('/patterns', async (req, res) => {
    try {
      const {
        category,
        severity,
        keyword,
        limit = 50
      } = req.query;

      if (!db) {
        return res.json({
          patterns: [],
          message: 'Database not available'
        });
      }

      // Build query based on filters
      let query = `
        SELECT
          pattern_type,
          problem_description,
          solution_description,
          pattern_name,
          steps,
          keywords,
          context,
          severity,
          category,
          occurrence_count,
          created_at,
          last_seen_at
        FROM knowledge_patterns
        WHERE 1=1
      `;
      const params = [];

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      if (severity) {
        params.push(severity);
        query += ` AND severity = $${params.length}`;
      }

      if (keyword) {
        params.push(`%${keyword}%`);
        query += ` AND (
          problem_description ILIKE $${params.length} OR
          solution_description ILIKE $${params.length} OR
          keywords::text ILIKE $${params.length}
        )`;
      }

      params.push(Math.min(parseInt(limit), 100));
      query += ` ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT $${params.length}`;

      const result = await db.query(query, params);

      res.json({
        patterns: result.rows.map(row => ({
          pattern: row.pattern_name,
          problem: row.problem_description,
          solution: row.solution_description,
          steps: row.steps ? JSON.parse(row.steps) : [],
          keywords: row.keywords || [],  // Already a PG array, don't parse
          context: row.context || {},    // Already JSONB, don't parse
          severity: row.severity,
          category: row.category,
          occurrences: row.occurrence_count,
          firstSeen: row.created_at,
          lastSeen: row.last_seen_at
        })),
        count: result.rows.length
      });

    } catch (error) {
      console.error('[KnowledgeLearning] Error fetching patterns:', error);
      res.status(500).json({
        error: 'Failed to fetch patterns',
        message: error.message
      });
    }
  });

  /**
   * POST /api/knowledge/search-solution
   * Searches for solutions to a given problem
   */
  router.post('/search-solution', async (req, res) => {
    try {
      const { problem, keywords = [] } = req.body;

      if (!problem) {
        return res.status(400).json({
          error: 'Missing required field: problem'
        });
      }

      if (!db) {
        return res.json({
          solutions: [],
          message: 'Database not available'
        });
      }

      // Search for matching patterns
      const result = await db.query(`
        SELECT
          pattern_name,
          problem_description,
          solution_description,
          steps,
          keywords,
          severity,
          occurrence_count,
          last_seen_at,
          -- Calculate relevance score
          (
            CASE
              WHEN problem_description ILIKE $1 THEN 100
              WHEN problem_description ILIKE '%' || $2 || '%' THEN 50
              ELSE 0
            END +
            (occurrence_count * 5)
          ) as relevance_score
        FROM knowledge_patterns
        WHERE
          problem_description ILIKE '%' || $2 || '%' OR
          keywords::text ILIKE '%' || $2 || '%' OR
          EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(keywords::jsonb) kw
            WHERE kw = ANY($3::text[])
          )
        ORDER BY relevance_score DESC, occurrence_count DESC
        LIMIT 10
      `, [problem, problem, keywords]);

      res.json({
        solutions: result.rows.map(row => ({
          pattern: row.pattern_name,
          problem: row.problem_description,
          solution: row.solution_description,
          steps: JSON.parse(row.steps || '[]'),
          keywords: JSON.parse(row.keywords || '[]'),
          severity: row.severity,
          occurrences: row.occurrence_count,
          lastSeen: row.last_seen_at,
          relevance: row.relevance_score
        })),
        count: result.rows.length
      });

    } catch (error) {
      console.error('[KnowledgeLearning] Error searching solutions:', error);
      res.status(500).json({
        error: 'Failed to search solutions',
        message: error.message
      });
    }
  });

  /**
   * POST /api/knowledge/learn-from-frontend
   * Record a frontend error from browser console
   *
   * Body: {
   *   userId,
   *   sessionId,
   *   pageUrl,
   *   errorType,
   *   errorMessage,
   *   stackTrace,
   *   sourceFile,
   *   lineNumber,
   *   columnNumber,
   *   browserInfo,
   *   consoleLogs
   * }
   */
  router.post('/learn-from-frontend', async (req, res) => {
    try {
      const {
        userId,
        sessionId,
        pageUrl,
        errorType,
        errorMessage,
        stackTrace,
        sourceFile,
        lineNumber,
        columnNumber,
        browserInfo,
        consoleLogs
      } = req.body;

      if (!pageUrl || !errorType || !errorMessage) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['pageUrl', 'errorType', 'errorMessage']
        });
      }

      if (!db) {
        return res.status(503).json({
          error: 'Database not available'
        });
      }

      // Try to match against existing patterns
      const patternMatch = await db.query(`
        SELECT id, pattern_name, solution_description, severity
        FROM knowledge_patterns
        WHERE
          keywords && $1::text[] OR
          problem_description ILIKE '%' || $2 || '%'
        ORDER BY occurrence_count DESC
        LIMIT 1
      `, [[errorType], errorMessage]);

      const matchedPatternId = patternMatch.rows[0]?.id || null;
      const matchConfidence = patternMatch.rows[0] ? 0.8 : null;

      // Insert frontend error
      const errorResult = await db.query(`
        INSERT INTO frontend_errors (
          user_id,
          session_id,
          page_url,
          error_type,
          error_message,
          stack_trace,
          source_file,
          line_number,
          column_number,
          browser_info,
          console_logs,
          matched_pattern_id,
          pattern_match_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING error_id
      `, [
        userId,
        sessionId,
        pageUrl,
        errorType,
        errorMessage,
        stackTrace,
        sourceFile,
        lineNumber,
        columnNumber,
        browserInfo,
        consoleLogs,
        matchedPatternId,
        matchConfidence
      ]);

      const response = {
        success: true,
        errorId: errorResult.rows[0].error_id,
        message: 'Frontend error recorded'
      };

      // If we found a matching pattern, return the solution
      if (patternMatch.rows[0]) {
        response.knownIssue = {
          pattern: patternMatch.rows[0].pattern_name,
          solution: patternMatch.rows[0].solution_description,
          severity: patternMatch.rows[0].severity
        };
      }

      res.json(response);

    } catch (error) {
      console.error('[KnowledgeLearning] Frontend error recording failed:', error);
      res.status(500).json({
        error: 'Failed to record frontend error',
        message: error.message
      });
    }
  });

  return router;
}

/**
 * Categorize a pattern type
 */
function categorizePattern(pattern) {
  const categories = {
    missing_route: 'routing',
    missing_import: 'imports',
    missing_registration: 'routing',
    auth_error: 'authentication',
    db_error: 'database',
    migration_error: 'database',
    cors_error: 'networking',
    port_conflict: 'server',
    zombie_process: 'server'
  };

  // Check for partial matches
  for (const [key, category] of Object.entries(categories)) {
    if (pattern.includes(key)) {
      return category;
    }
  }

  return 'general';
}

module.exports = { initializeRoutes };
