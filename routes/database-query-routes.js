/**
 * Database Query Routes
 *
 * Natural language database queries via Triangle consensus API.
 * User asks in plain English, AI converts to SQL, validates safety, executes.
 *
 * Routes:
 * - POST /api/database/query - Natural language database query
 * - GET /api/database/schema - Get database schema info
 * - GET /api/database/tables - List all tables
 */

const express = require('express');
const router = express.Router();
const SQLSafetyValidator = require('../lib/sql-safety-validator');

/**
 * Initialize routes with dependencies
 */
function initRoutes(db, triangleEngine) {
  if (!db) {
    throw new Error('Database connection required for database query routes');
  }

  if (!triangleEngine) {
    throw new Error('TriangleConsensusEngine required for database query routes');
  }

  const validator = new SQLSafetyValidator();

  /**
   * POST /api/database/query
   * Natural language database query
   *
   * Request body:
   * {
   *   "query": "How many users have completed lessons?",
   *   "limit": 100, // optional, default 100
   *   "explain": true // optional, get SQL explanation
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "query": "How many users...",
   *   "sql": "SELECT COUNT(DISTINCT user_id) FROM lesson_completions",
   *   "rows": [...],
   *   "rowCount": 1,
   *   "explanation": "This query counts unique users who completed lessons",
   *   "executionTime": 23,
   *   "safe": true
   * }
   */
  router.post('/database/query', async (req, res) => {
    const startTime = Date.now();

    try {
      const userId = req.session?.userId || req.headers['x-user-id'] || req.body.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const {
        query,
        limit = 100,
        explain = false
      } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Query required and must be non-empty string'
        });
      }

      // Sanitize natural language query
      const sanitizedQuery = validator.sanitizeNaturalLanguage(query);

      // Get user context
      const userResult = await db.query(
        'SELECT id, email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = userResult.rows[0];
      user.user_id = user.id; // Normalize to expected format

      console.log(`[DatabaseQuery] User ${user.email} querying: "${sanitizedQuery}"`);

      // Get database schema context for AI
      const schemaContext = await getSchemaContext(db);

      // Construct prompt for Triangle AI
      const aiPrompt = `You are a PostgreSQL expert. Convert this natural language query to safe, read-only SQL.

DATABASE SCHEMA:
${schemaContext}

USER QUERY:
"${sanitizedQuery}"

REQUIREMENTS:
1. Output ONLY valid PostgreSQL SQL (SELECT statements only)
2. No DROP, DELETE, UPDATE, INSERT, ALTER, or other destructive operations
3. Use proper JOINs and WHERE clauses
4. Limit results to ${limit} rows
5. Use table and column names from the schema above
6. If the query is ambiguous, make reasonable assumptions
7. Add LIMIT ${limit} at the end if not specified

OUTPUT FORMAT:
Return only the SQL query, nothing else. No explanations, no markdown, just the SQL.`;

      // Query Triangle API for SQL generation
      const triangleResult = await triangleEngine.query({
        prompt: aiPrompt,
        synthesize: true,
        generateStory: false,
        taskType: 'code',
        context: {
          userId: user.user_id,
          tenantId: user.tenant_id,
          sessionId: req.session?.id || null
        }
      });

      if (!triangleResult.success || !triangleResult.consensus) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate SQL',
          details: triangleResult.error || 'No consensus response from AI providers (check API keys in .env)'
        });
      }

      // Extract SQL from consensus response
      let generatedSQL = triangleResult.consensus.trim();

      // Clean up markdown if AI added it
      generatedSQL = generatedSQL
        .replace(/```sql\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^sql\n/i, '')
        .trim();

      // Validate SQL safety
      const safetyCheck = validator.validateQuery(generatedSQL);

      if (!safetyCheck.safe) {
        return res.status(400).json({
          success: false,
          error: 'Generated SQL failed safety validation',
          details: safetyCheck.error,
          generatedSQL,
          userQuery: sanitizedQuery
        });
      }

      console.log(`[DatabaseQuery] Generated SQL: ${generatedSQL}`);

      // Execute SQL query
      const queryStartTime = Date.now();
      const result = await db.query(generatedSQL);
      const queryExecutionTime = Date.now() - queryStartTime;

      // Get explanation if requested
      let explanation = null;
      if (explain) {
        const explainPrompt = `Explain this SQL query in simple terms for a non-technical user:

QUERY: ${generatedSQL}

RESULTS: ${result.rowCount} rows returned

Provide a brief 1-2 sentence explanation of what this query does and what the results mean.`;

        const explainResult = await triangleEngine.query({
          prompt: explainPrompt,
          synthesize: true,
          generateStory: false,
          taskType: 'simple',
          context: {
            userId: user.user_id,
            tenantId: user.tenant_id,
            sessionId: req.session?.id || null
          }
        });

        if (explainResult.success) {
          explanation = explainResult.consensus;
        }
      }

      const totalExecutionTime = Date.now() - startTime;

      // Return results
      res.json({
        success: true,
        query: sanitizedQuery,
        sql: generatedSQL,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields?.map(f => ({
          name: f.name,
          dataType: f.dataTypeID
        })) || [],
        explanation,
        executionTime: queryExecutionTime,
        totalTime: totalExecutionTime,
        safe: true,
        ai: {
          confidence: triangleResult.confidence,
          providers: triangleResult.providers_succeeded
        }
      });

    } catch (error) {
      console.error('[DatabaseQuery] Query failed:', error);

      // Check if it's a SQL syntax error
      if (error.code && error.code.startsWith('42')) {
        return res.status(400).json({
          success: false,
          error: 'SQL syntax error',
          details: error.message,
          hint: 'The AI-generated SQL was invalid. Try rephrasing your query.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }
  });

  /**
   * GET /api/database/schema
   * Get database schema information
   *
   * Query params:
   * - table: specific table name (optional)
   *
   * Response:
   * {
   *   "success": true,
   *   "tables": [
   *     { name: "users", columns: [...], rowCount: 42 },
   *     ...
   *   ]
   * }
   */
  router.get('/database/schema', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { table } = req.query;

      let query;
      let params = [];

      if (table) {
        // Get schema for specific table
        query = `
          SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = $1
          ORDER BY c.ordinal_position
        `;
        params = [table];
      } else {
        // Get list of all tables
        query = `
          SELECT
            t.table_name,
            (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name) as column_count
          FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
          ORDER BY t.table_name
          LIMIT 100
        `;
      }

      const result = await db.query(query, params);

      res.json({
        success: true,
        table,
        rows: result.rows,
        rowCount: result.rowCount
      });

    } catch (error) {
      console.error('[DatabaseQuery] Schema query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch schema',
        details: error.message
      });
    }
  });

  /**
   * GET /api/database/tables
   * List all database tables
   *
   * Response:
   * {
   *   "success": true,
   *   "tables": ["users", "lessons", "learning_paths", ...],
   *   "count": 447
   * }
   */
  router.get('/database/tables', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tables = result.rows.map(row => row.table_name);

      res.json({
        success: true,
        tables,
        count: tables.length
      });

    } catch (error) {
      console.error('[DatabaseQuery] Tables list failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tables',
        details: error.message
      });
    }
  });

  return router;
}

/**
 * Get database schema context for AI prompts
 * Returns a concise summary of key tables and columns
 */
async function getSchemaContext(db) {
  try {
    // Get key tables and their columns (limit to most important ones)
    const result = await db.query(`
      SELECT
        t.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) as columns
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c
        ON c.table_schema = t.table_schema
        AND c.table_name = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name IN (
          'users', 'lessons', 'lesson_completions', 'learning_paths',
          'user_progress', 'skills', 'user_skills', 'achievements',
          'action_definitions', 'effect_definitions', 'api_keys',
          'user_sessions', 'app_templates', 'analytics_events'
        )
      GROUP BY t.table_name
      ORDER BY t.table_name
    `);

    const schemaLines = result.rows.map(row => {
      // PostgreSQL array_agg returns a string like "{col1,col2,col3}"
      const columns = Array.isArray(row.columns)
        ? row.columns
        : (row.columns || '').replace(/[{}]/g, '').split(',');
      return `${row.table_name} (${columns.join(', ')})`;
    });

    return schemaLines.join('\n');

  } catch (error) {
    console.error('[DatabaseQuery] Failed to get schema context:', error);
    return 'users, lessons, lesson_completions, learning_paths, user_progress';
  }
}

module.exports = { initRoutes };
