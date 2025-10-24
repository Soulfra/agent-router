/**
 * Decision Todo System
 *
 * Todos linked to decisions for complete traceability.
 * Solves: "we need todos but also archived or referenced files so the decisions can be traced and tracked"
 *
 * Features:
 * - Create todos from decisions
 * - Track WHY todo exists (linked decision)
 * - Understand decision → todo → action chain
 * - Archive completed todos with full context
 * - Find all todos related to a decision
 * - Track todo dependencies
 * - Priority and deadline management
 *
 * Use Cases:
 * - "Why are we doing this?" → See linked decision
 * - "What needs to happen for this decision?" → See todos
 * - "This todo is done, what was the context?" → See decision + archive
 * - Track action items from architecture decisions
 * - Understand technical debt todos (what decision caused this?)
 */

const { Pool } = require('pg');

class DecisionTodo {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    console.log('[DecisionTodo] Initialized');
  }

  /**
   * Create todo from decision
   *
   * @param {Object} data
   * @param {number} data.decisionId - Decision that spawned this todo
   * @param {string} data.title - Todo title
   * @param {string} data.description - Detailed description
   * @param {string} data.assignedTo - User assigned to (optional)
   * @param {string} data.priority - 'low', 'medium', 'high', 'critical'
   * @param {Date} data.dueDate - Due date (optional)
   * @param {Object} data.context - Additional context
   * @param {string[]} data.tags - Tags for categorization
   * @param {number[]} data.dependsOn - IDs of todos this depends on
   * @param {string} data.createdBy - Who created todo
   * @returns {Object} Created todo
   */
  async createTodo(data) {
    try {
      const {
        decisionId,
        title,
        description = '',
        assignedTo = null,
        priority = 'medium',
        dueDate = null,
        context = {},
        tags = [],
        dependsOn = [],
        createdBy
      } = data;

      if (!decisionId || !title || !createdBy) {
        throw new Error('decisionId, title, and createdBy are required');
      }

      // Verify decision exists
      const decisionCheck = await this.pool.query(
        'SELECT id, title FROM decisions WHERE id = $1',
        [decisionId]
      );

      if (decisionCheck.rows.length === 0) {
        throw new Error(`Decision ${decisionId} not found`);
      }

      const decision = decisionCheck.rows[0];

      // Create todo
      const result = await this.pool.query(`
        INSERT INTO decision_todos (
          decision_id,
          title,
          description,
          assigned_to,
          priority,
          due_date,
          context,
          tags,
          status,
          created_by,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `, [
        decisionId,
        title,
        description,
        assignedTo,
        priority,
        dueDate,
        JSON.stringify(context),
        tags,
        'pending',
        createdBy
      ]);

      const todo = result.rows[0];

      // Add dependencies
      if (dependsOn.length > 0) {
        await this.addDependencies(todo.id, dependsOn);
      }

      console.log(`[DecisionTodo] Created todo "${title}" from decision "${decision.title}"`);

      return this._formatTodo(todo, decision);

    } catch (error) {
      console.error('[DecisionTodo] Error creating todo:', error);
      throw error;
    }
  }

  /**
   * Update todo
   *
   * @param {number} todoId
   * @param {Object} updates
   * @returns {Object} Updated todo
   */
  async updateTodo(todoId, updates) {
    try {
      const {
        title,
        description,
        assignedTo,
        priority,
        dueDate,
        context,
        tags,
        status
      } = updates;

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title);
      }

      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(description);
      }

      if (assignedTo !== undefined) {
        updateFields.push(`assigned_to = $${paramIndex++}`);
        updateValues.push(assignedTo);
      }

      if (priority !== undefined) {
        updateFields.push(`priority = $${paramIndex++}`);
        updateValues.push(priority);
      }

      if (dueDate !== undefined) {
        updateFields.push(`due_date = $${paramIndex++}`);
        updateValues.push(dueDate);
      }

      if (context !== undefined) {
        updateFields.push(`context = $${paramIndex++}`);
        updateValues.push(JSON.stringify(context));
      }

      if (tags !== undefined) {
        updateFields.push(`tags = $${paramIndex++}`);
        updateValues.push(tags);
      }

      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);

        // If completing, set completed_at
        if (status === 'completed') {
          updateFields.push(`completed_at = NOW()`);
        }
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(todoId);

      const result = await this.pool.query(`
        UPDATE decision_todos
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);

      if (result.rows.length === 0) {
        throw new Error(`Todo ${todoId} not found`);
      }

      const todo = result.rows[0];

      // Get decision info
      const decisionResult = await this.pool.query(
        'SELECT id, title FROM decisions WHERE id = $1',
        [todo.decision_id]
      );

      return this._formatTodo(todo, decisionResult.rows[0]);

    } catch (error) {
      console.error('[DecisionTodo] Error updating todo:', error);
      throw error;
    }
  }

  /**
   * Complete todo
   *
   * @param {number} todoId
   * @param {string} completedBy
   * @param {Object} completionNotes - Optional notes about completion
   * @returns {Object} Completed todo
   */
  async completeTodo(todoId, completedBy, completionNotes = {}) {
    try {
      const result = await this.pool.query(`
        UPDATE decision_todos
        SET status = 'completed',
            completed_at = NOW(),
            completed_by = $1,
            completion_notes = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [completedBy, JSON.stringify(completionNotes), todoId]);

      if (result.rows.length === 0) {
        throw new Error(`Todo ${todoId} not found`);
      }

      const todo = result.rows[0];

      // Get decision info
      const decisionResult = await this.pool.query(
        'SELECT id, title FROM decisions WHERE id = $1',
        [todo.decision_id]
      );

      console.log(`[DecisionTodo] Completed todo: ${todo.title}`);

      return this._formatTodo(todo, decisionResult.rows[0]);

    } catch (error) {
      console.error('[DecisionTodo] Error completing todo:', error);
      throw error;
    }
  }

  /**
   * Archive todo with full context
   *
   * @param {number} todoId
   * @param {string} archivedBy
   * @param {string} archiveReason
   * @returns {Object} Archived todo
   */
  async archiveTodo(todoId, archivedBy, archiveReason) {
    try {
      // Get full todo with decision context
      const todo = await this.getTodo(todoId, { includeDecision: true, includeDependencies: true });

      if (!todo) {
        throw new Error(`Todo ${todoId} not found`);
      }

      // Create archive entry
      await this.pool.query(`
        INSERT INTO todo_archives (
          todo_id,
          decision_id,
          full_context,
          archived_by,
          archive_reason,
          archived_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        todoId,
        todo.decisionId,
        JSON.stringify(todo),
        archivedBy,
        archiveReason
      ]);

      // Update todo status
      await this.pool.query(`
        UPDATE decision_todos
        SET status = 'archived',
            archived_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [todoId]);

      console.log(`[DecisionTodo] Archived todo: ${todo.title} (${archiveReason})`);

      return todo;

    } catch (error) {
      console.error('[DecisionTodo] Error archiving todo:', error);
      throw error;
    }
  }

  /**
   * Get todo by ID
   *
   * @param {number} todoId
   * @param {Object} options
   * @param {boolean} options.includeDecision - Include linked decision
   * @param {boolean} options.includeDependencies - Include todo dependencies
   * @returns {Object} Todo
   */
  async getTodo(todoId, options = {}) {
    try {
      const { includeDecision = false, includeDependencies = false } = options;

      const result = await this.pool.query(`
        SELECT t.*, d.id as decision_id, d.title as decision_title
        FROM decision_todos t
        JOIN decisions d ON t.decision_id = d.id
        WHERE t.id = $1
      `, [todoId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const todo = this._formatTodo(row, {
        id: row.decision_id,
        title: row.decision_title
      });

      // Include full decision
      if (includeDecision) {
        const decisionResult = await this.pool.query(
          'SELECT * FROM decisions WHERE id = $1',
          [row.decision_id]
        );

        if (decisionResult.rows.length > 0) {
          todo.decision = {
            id: decisionResult.rows[0].id,
            title: decisionResult.rows[0].title,
            content: decisionResult.rows[0].content,
            status: decisionResult.rows[0].status,
            category: decisionResult.rows[0].category
          };
        }
      }

      // Include dependencies
      if (includeDependencies) {
        todo.dependencies = await this.getDependencies(todoId);
      }

      return todo;

    } catch (error) {
      console.error('[DecisionTodo] Error getting todo:', error);
      return null;
    }
  }

  /**
   * Get all todos for a decision
   *
   * @param {number} decisionId
   * @param {Object} options
   * @param {string} options.status - Filter by status
   * @param {string} options.assignedTo - Filter by assignee
   * @returns {Array} Todos
   */
  async getTodosForDecision(decisionId, options = {}) {
    try {
      const { status, assignedTo } = options;

      const conditions = ['decision_id = $1'];
      const values = [decisionId];
      let paramIndex = 2;

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (assignedTo) {
        conditions.push(`assigned_to = $${paramIndex}`);
        values.push(assignedTo);
        paramIndex++;
      }

      const result = await this.pool.query(`
        SELECT t.*, d.title as decision_title
        FROM decision_todos t
        JOIN decisions d ON t.decision_id = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          due_date ASC NULLS LAST,
          created_at ASC
      `, values);

      return result.rows.map(row => this._formatTodo(row, {
        id: decisionId,
        title: row.decision_title
      }));

    } catch (error) {
      console.error('[DecisionTodo] Error getting todos for decision:', error);
      return [];
    }
  }

  /**
   * Search todos
   *
   * @param {Object} filters
   * @param {string} filters.query - Text search
   * @param {string} filters.status - Filter by status
   * @param {string} filters.priority - Filter by priority
   * @param {string} filters.assignedTo - Filter by assignee
   * @param {string[]} filters.tags - Filter by tags
   * @param {Date} filters.dueBefore - Due before date
   * @returns {Array} Matching todos
   */
  async searchTodos(filters = {}) {
    try {
      const { query, status, priority, assignedTo, tags, dueBefore } = filters;

      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (query) {
        conditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
        values.push(`%${query}%`);
        paramIndex++;
      }

      if (status) {
        conditions.push(`t.status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (priority) {
        conditions.push(`t.priority = $${paramIndex}`);
        values.push(priority);
        paramIndex++;
      }

      if (assignedTo) {
        conditions.push(`t.assigned_to = $${paramIndex}`);
        values.push(assignedTo);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        conditions.push(`t.tags && $${paramIndex}`);
        values.push(tags);
        paramIndex++;
      }

      if (dueBefore) {
        conditions.push(`t.due_date <= $${paramIndex}`);
        values.push(dueBefore);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.pool.query(`
        SELECT t.*, d.id as decision_id, d.title as decision_title
        FROM decision_todos t
        JOIN decisions d ON t.decision_id = d.id
        ${whereClause}
        ORDER BY
          CASE t.priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          t.due_date ASC NULLS LAST,
          t.created_at ASC
      `, values);

      return result.rows.map(row => this._formatTodo(row, {
        id: row.decision_id,
        title: row.decision_title
      }));

    } catch (error) {
      console.error('[DecisionTodo] Error searching todos:', error);
      return [];
    }
  }

  /**
   * Add dependencies (this todo depends on others)
   *
   * @param {number} todoId
   * @param {number[]} dependsOnIds - IDs of todos this depends on
   * @returns {Array} Created dependencies
   */
  async addDependencies(todoId, dependsOnIds) {
    try {
      const dependencies = [];

      for (const depId of dependsOnIds) {
        const result = await this.pool.query(`
          INSERT INTO todo_dependencies (
            todo_id,
            depends_on_todo_id,
            created_at
          ) VALUES ($1, $2, NOW())
          ON CONFLICT (todo_id, depends_on_todo_id) DO NOTHING
          RETURNING *
        `, [todoId, depId]);

        if (result.rows.length > 0) {
          dependencies.push(result.rows[0]);
        }
      }

      console.log(`[DecisionTodo] Added ${dependencies.length} dependencies to todo ${todoId}`);

      return dependencies;

    } catch (error) {
      console.error('[DecisionTodo] Error adding dependencies:', error);
      throw error;
    }
  }

  /**
   * Get todo dependencies
   *
   * @param {number} todoId
   * @returns {Object} Dependencies (blocking and blocked by)
   */
  async getDependencies(todoId) {
    try {
      // Get todos this one depends on (blockers)
      const blockers = await this.pool.query(`
        SELECT
          t.id,
          t.title,
          t.status,
          t.priority,
          td.created_at as linked_at
        FROM todo_dependencies td
        JOIN decision_todos t ON td.depends_on_todo_id = t.id
        WHERE td.todo_id = $1
        ORDER BY t.priority, t.due_date
      `, [todoId]);

      // Get todos that depend on this one (blocked)
      const blocked = await this.pool.query(`
        SELECT
          t.id,
          t.title,
          t.status,
          t.priority,
          td.created_at as linked_at
        FROM todo_dependencies td
        JOIN decision_todos t ON td.todo_id = t.id
        WHERE td.depends_on_todo_id = $1
        ORDER BY t.priority, t.due_date
      `, [todoId]);

      return {
        blockers: blockers.rows,
        blocked: blocked.rows,
        isBlocked: blockers.rows.some(b => b.status !== 'completed')
      };

    } catch (error) {
      console.error('[DecisionTodo] Error getting dependencies:', error);
      return { blockers: [], blocked: [], isBlocked: false };
    }
  }

  /**
   * Get overdue todos
   *
   * @param {string} assignedTo - Filter by assignee (optional)
   * @returns {Array} Overdue todos
   */
  async getOverdueTodos(assignedTo = null) {
    try {
      const conditions = [
        't.status = \'pending\'',
        't.due_date IS NOT NULL',
        't.due_date < NOW()'
      ];

      const values = [];

      if (assignedTo) {
        conditions.push('t.assigned_to = $1');
        values.push(assignedTo);
      }

      const result = await this.pool.query(`
        SELECT t.*, d.id as decision_id, d.title as decision_title
        FROM decision_todos t
        JOIN decisions d ON t.decision_id = d.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.due_date ASC
      `, values);

      return result.rows.map(row => this._formatTodo(row, {
        id: row.decision_id,
        title: row.decision_title
      }));

    } catch (error) {
      console.error('[DecisionTodo] Error getting overdue todos:', error);
      return [];
    }
  }

  /**
   * Format todo for output
   * @private
   */
  _formatTodo(row, decision) {
    return {
      id: row.id,
      decisionId: decision.id,
      decisionTitle: decision.title,
      title: row.title,
      description: row.description,
      assignedTo: row.assigned_to,
      priority: row.priority,
      dueDate: row.due_date,
      status: row.status,
      context: row.context,
      tags: row.tags || [],
      createdBy: row.created_by,
      completedBy: row.completed_by,
      completionNotes: row.completion_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      archivedAt: row.archived_at
    };
  }
}

module.exports = DecisionTodo;
