/**
 * Workflow Builder
 *
 * Takes council consensus and breaks it down into actionable tasks.
 * Assigns tasks to appropriate models based on their capabilities.
 * Creates dependencies and priority ordering.
 */

const { v4: uuidv4 } = require('uuid');

class WorkflowBuilder {
  constructor(db, agentRegistry) {
    this.db = db;
    this.agentRegistry = agentRegistry;
  }

  /**
   * Build workflow from council session
   *
   * @param {String} sessionId - Council session ID
   * @param {Object} consensus - Council consensus object
   * @param {Array} proposals - All model proposals
   * @returns {Array} - Array of workflow tasks
   */
  async buildWorkflow(sessionId, consensus, proposals) {
    console.log(`[WorkflowBuilder] Building workflow for session ${sessionId}...`);

    // Get session details
    const session = await this.db.query(
      'SELECT task, task_type FROM council_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (session.rows.length === 0) {
      throw new Error('Session not found');
    }

    const { task, task_type } = session.rows[0];

    // Generate tasks based on task type and consensus
    const tasks = this.generateTasks(task, task_type, consensus, proposals);

    // Assign models to tasks
    const assignedTasks = this.assignModels(tasks);

    // Create dependencies
    const orderedTasks = this.createDependencies(assignedTasks);

    // Save to database
    await this.saveTasks(sessionId, orderedTasks);

    console.log(`[WorkflowBuilder] Created ${orderedTasks.length} tasks`);

    return orderedTasks;
  }

  /**
   * Generate tasks based on project type
   * @private
   */
  generateTasks(task, taskType, consensus, proposals) {
    const tasks = [];

    // Common foundational tasks
    tasks.push({
      title: 'Create project structure',
      description: `Set up directory structure for ${task}`,
      type: 'setup',
      priority: 10,
      estimated_duration: 15
    });

    // Type-specific tasks
    switch (taskType) {
      case 'backend':
        tasks.push(...this.generateBackendTasks(task, consensus));
        break;

      case 'frontend':
        tasks.push(...this.generateFrontendTasks(task, consensus));
        break;

      case 'database':
        tasks.push(...this.generateDatabaseTasks(task, consensus));
        break;

      case 'fullstack':
        tasks.push(...this.generateFullstackTasks(task, consensus));
        break;

      default:
        tasks.push(...this.generateGeneralTasks(task, consensus));
    }

    // Add testing and documentation
    tasks.push({
      title: 'Write unit tests',
      description: 'Create test suite',
      type: 'testing',
      priority: 5,
      estimated_duration: 45
    });

    tasks.push({
      title: 'Generate documentation',
      description: 'Create README and API docs',
      type: 'documentation',
      priority: 3,
      estimated_duration: 30
    });

    return tasks;
  }

  /**
   * Generate backend-specific tasks
   * @private
   */
  generateBackendTasks(task, consensus) {
    return [
      {
        title: 'Design API endpoints',
        description: 'Define REST API structure',
        type: 'backend',
        priority: 9,
        estimated_duration: 30
      },
      {
        title: 'Create database schema',
        description: 'Design tables and relationships',
        type: 'database',
        priority: 9,
        estimated_duration: 45
      },
      {
        title: 'Implement authentication',
        description: 'Set up auth middleware',
        type: 'backend',
        priority: 8,
        estimated_duration: 60
      },
      {
        title: 'Build core business logic',
        description: 'Implement main features',
        type: 'backend',
        priority: 7,
        estimated_duration: 120
      },
      {
        title: 'Add error handling',
        description: 'Implement comprehensive error handling',
        type: 'backend',
        priority: 6,
        estimated_duration: 30
      }
    ];
  }

  /**
   * Generate frontend-specific tasks
   * @private
   */
  generateFrontendTasks(task, consensus) {
    return [
      {
        title: 'Design UI mockups',
        description: 'Create wireframes and mockups',
        type: 'design',
        priority: 9,
        estimated_duration: 60
      },
      {
        title: 'Set up component library',
        description: 'Choose and configure UI framework',
        type: 'frontend',
        priority: 8,
        estimated_duration: 30
      },
      {
        title: 'Build main layout',
        description: 'Create app shell and navigation',
        type: 'frontend',
        priority: 7,
        estimated_duration: 45
      },
      {
        title: 'Implement feature components',
        description: 'Build core UI components',
        type: 'frontend',
        priority: 6,
        estimated_duration: 120
      },
      {
        title: 'Add responsive styling',
        description: 'Ensure mobile compatibility',
        type: 'frontend',
        priority: 5,
        estimated_duration: 60
      }
    ];
  }

  /**
   * Generate database-specific tasks
   * @private
   */
  generateDatabaseTasks(task, consensus) {
    return [
      {
        title: 'Design entity relationships',
        description: 'Create ER diagram',
        type: 'database',
        priority: 9,
        estimated_duration: 45
      },
      {
        title: 'Write migration scripts',
        description: 'Create schema migrations',
        type: 'database',
        priority: 8,
        estimated_duration: 60
      },
      {
        title: 'Create indexes',
        description: 'Optimize query performance',
        type: 'database',
        priority: 7,
        estimated_duration: 30
      },
      {
        title: 'Add seed data',
        description: 'Create sample data for testing',
        type: 'database',
        priority: 6,
        estimated_duration: 20
      }
    ];
  }

  /**
   * Generate fullstack tasks
   * @private
   */
  generateFullstackTasks(task, consensus) {
    return [
      ...this.generateDatabaseTasks(task, consensus),
      ...this.generateBackendTasks(task, consensus),
      ...this.generateFrontendTasks(task, consensus),
      {
        title: 'Connect frontend to backend',
        description: 'Integrate API calls',
        type: 'fullstack',
        priority: 5,
        estimated_duration: 60
      },
      {
        title: 'Deploy to production',
        description: 'Set up hosting and CI/CD',
        type: 'devops',
        priority: 2,
        estimated_duration: 90
      }
    ];
  }

  /**
   * Generate general tasks
   * @private
   */
  generateGeneralTasks(task, consensus) {
    return [
      {
        title: 'Research requirements',
        description: 'Gather and document requirements',
        type: 'planning',
        priority: 9,
        estimated_duration: 45
      },
      {
        title: 'Implement core functionality',
        description: 'Build main features',
        type: 'development',
        priority: 7,
        estimated_duration: 120
      },
      {
        title: 'Refactor and optimize',
        description: 'Clean up code and improve performance',
        type: 'refactoring',
        priority: 4,
        estimated_duration: 60
      }
    ];
  }

  /**
   * Assign models to tasks based on capabilities
   * @private
   */
  assignModels(tasks) {
    // Model specializations
    const specializations = {
      'setup': ['mistral', 'calos-model:latest'],
      'backend': ['codellama', 'qwen2.5-coder', 'mistral'],
      'frontend': ['codellama', 'visual-expert', 'phi'],
      'database': ['codellama', 'calos-expert'],
      'design': ['visual-expert', 'llava'],
      'testing': ['codellama', 'qwen2.5-coder'],
      'documentation': ['calos-model:latest', 'calos-expert', 'mistral'],
      'fullstack': ['mistral', 'codellama'],
      'devops': ['phi', 'mistral']
    };

    return tasks.map(task => {
      const candidates = specializations[task.type] || ['mistral'];
      const assignedModel = candidates[0]; // Pick first available

      return {
        ...task,
        assigned_model: assignedModel,
        assignment_reason: `${assignedModel} specializes in ${task.type} tasks`
      };
    });
  }

  /**
   * Create task dependencies
   * @private
   */
  createDependencies(tasks) {
    // Sort by priority (highest first)
    const sorted = tasks.sort((a, b) => b.priority - a.priority);

    // Create dependency chains
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];

      // Some tasks depend on previous ones
      if (this.shouldDependOn(current.type, previous.type)) {
        current.depends_on_type = previous.type;
      }
    }

    return sorted;
  }

  /**
   * Check if task type should depend on another
   * @private
   */
  shouldDependOn(taskType, previousType) {
    const dependencies = {
      'backend': ['database', 'setup'],
      'frontend': ['backend', 'design', 'setup'],
      'testing': ['backend', 'frontend', 'development'],
      'documentation': ['testing'],
      'devops': ['testing']
    };

    return dependencies[taskType]?.includes(previousType) || false;
  }

  /**
   * Save tasks to database
   * @private
   */
  async saveTasks(sessionId, tasks) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const taskIds = new Map(); // type -> id

      for (const task of tasks) {
        // Resolve depends_on
        let dependsOn = null;
        if (task.depends_on_type) {
          dependsOn = taskIds.get(task.depends_on_type);
        }

        const result = await client.query(`
          INSERT INTO council_workflows (
            session_id,
            task_title,
            task_description,
            task_type,
            assigned_model,
            priority,
            estimated_duration_minutes,
            depends_on,
            task_metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING workflow_id
        `, [
          sessionId,
          task.title,
          task.description,
          task.type,
          task.assigned_model,
          task.priority,
          task.estimated_duration,
          dependsOn,
          JSON.stringify({ assignment_reason: task.assignment_reason || null })
        ]);

        // Store ID for future dependencies
        taskIds.set(task.type, result.rows[0].workflow_id);
      }

      await client.query('COMMIT');

      console.log(`[WorkflowBuilder] Saved ${tasks.length} tasks to database`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[WorkflowBuilder] Failed to save tasks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get workflow for a session
   */
  async getWorkflow(sessionId) {
    const result = await this.db.query(`
      SELECT
        workflow_id,
        task_title,
        task_description,
        task_type,
        assigned_model,
        priority,
        estimated_duration_minutes,
        status,
        depends_on,
        created_at
      FROM council_workflows
      WHERE session_id = $1
      ORDER BY priority DESC
    `, [sessionId]);

    return result.rows;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(workflowId, status) {
    await this.db.query(`
      UPDATE council_workflows
      SET
        status = $1,
        started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
      WHERE workflow_id = $2
    `, [status, workflowId]);

    console.log(`[WorkflowBuilder] Task ${workflowId} → ${status}`);
  }
}

module.exports = WorkflowBuilder;
