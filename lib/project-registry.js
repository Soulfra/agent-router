/**
 * Project Registry
 *
 * Apache-style self-service project management
 * Manages multiple GitHub Pages projects, each with its own database
 *
 * Like Apache's project creation system:
 * - Create new GitHub Pages projects
 * - Auto-setup databases
 * - Track billing per project
 * - Export as packages/containers
 *
 * Usage:
 *   const registry = new ProjectRegistry(db);
 *   await registry.createProject({
 *     projectName: 'soulfra',
 *     repoUrl: 'https://github.com/soulfra/soulfra.github.io',
 *     databaseName: 'soulfra_db',
 *     userId: 'user123'
 *   });
 */

class ProjectRegistry {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new project (like Apache's "Create Project")
   */
  async createProject(options) {
    const {
      projectName,
      repoUrl,
      githubPagesUrl,
      databaseName,
      userId,
      tier = 'trial',
      description = '',
      tags = []
    } = options;

    try {
      // Validate project name (must be unique)
      const existing = await this.db.query(
        `SELECT id FROM github_pages_projects WHERE project_name = $1`,
        [projectName]
      );

      if (existing.rowCount > 0) {
        throw new Error(`Project '${projectName}' already exists`);
      }

      // Create project record
      const result = await this.db.query(
        `INSERT INTO github_pages_projects (
          project_name,
          repo_url,
          github_pages_url,
          database_name,
          owner_user_id,
          tier,
          description,
          tags,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *`,
        [
          projectName,
          repoUrl,
          githubPagesUrl || `https://${projectName}.github.io`,
          databaseName || `${projectName}_db`,
          userId,
          tier,
          description,
          JSON.stringify(tags),
          'active'
        ]
      );

      const project = result.rows[0];

      // Auto-create database if doesn't exist
      if (databaseName) {
        await this.createProjectDatabase(databaseName);
      }

      console.log(`[ProjectRegistry] Created project: ${projectName}`);
      return project;

    } catch (error) {
      console.error('[ProjectRegistry] Create project error:', error);
      throw error;
    }
  }

  /**
   * Create database for project (Apache-style auto-provisioning)
   */
  async createProjectDatabase(databaseName) {
    try {
      // Check if database exists
      const result = await this.db.query(
        `SELECT datname FROM pg_database WHERE datname = $1`,
        [databaseName]
      );

      if (result.rowCount > 0) {
        console.log(`[ProjectRegistry] Database ${databaseName} already exists`);
        return;
      }

      // Create database
      await this.db.query(`CREATE DATABASE ${databaseName}`);

      console.log(`[ProjectRegistry] Created database: ${databaseName}`);

      // TODO: Run migrations on new database (usage_events table, etc.)
      // This would connect to the new database and run schema setup

    } catch (error) {
      console.error('[ProjectRegistry] Create database error:', error);
      // Don't throw - database creation might fail due to permissions
      // Projects can still work with shared database
    }
  }

  /**
   * Get all projects for a user
   */
  async getUserProjects(userId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM github_pages_projects
         WHERE owner_user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;

    } catch (error) {
      console.error('[ProjectRegistry] Get user projects error:', error);
      throw error;
    }
  }

  /**
   * Get project by name
   */
  async getProject(projectName) {
    try {
      const result = await this.db.query(
        `SELECT * FROM github_pages_projects WHERE project_name = $1`,
        [projectName]
      );

      return result.rows[0] || null;

    } catch (error) {
      console.error('[ProjectRegistry] Get project error:', error);
      throw error;
    }
  }

  /**
   * Get all projects (admin view)
   */
  async getAllProjects() {
    try {
      const result = await this.db.query(
        `SELECT * FROM github_pages_projects ORDER BY created_at DESC`
      );

      return result.rows;

    } catch (error) {
      console.error('[ProjectRegistry] Get all projects error:', error);
      throw error;
    }
  }

  /**
   * Update project
   */
  async updateProject(projectName, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
      Object.entries(updates).forEach(([key, value]) => {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      });

      if (fields.length === 0) {
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(projectName);

      const result = await this.db.query(
        `UPDATE github_pages_projects
         SET ${fields.join(', ')}
         WHERE project_name = $${paramIndex}
         RETURNING *`,
        values
      );

      return result.rows[0];

    } catch (error) {
      console.error('[ProjectRegistry] Update project error:', error);
      throw error;
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectName) {
    try {
      await this.db.query(
        `DELETE FROM github_pages_projects WHERE project_name = $1`,
        [projectName]
      );

      console.log(`[ProjectRegistry] Deleted project: ${projectName}`);

    } catch (error) {
      console.error('[ProjectRegistry] Delete project error:', error);
      throw error;
    }
  }

  /**
   * Get project usage stats
   */
  async getProjectUsage(projectName, year, month) {
    try {
      const project = await this.getProject(projectName);
      if (!project) {
        throw new Error('Project not found');
      }

      // Query usage_events for this project's GitHub Pages URL
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      const result = await this.db.query(
        `SELECT
          provider,
          COUNT(*) as calls,
          SUM(total_tokens) as tokens,
          SUM(cost_cents) as cost_cents,
          key_source
        FROM usage_events
        WHERE origin LIKE $1
          AND created_at >= $2
          AND created_at <= $3
          AND status = 'success'
        GROUP BY provider, key_source
        ORDER BY calls DESC`,
        [
          `%${project.github_pages_url}%`,
          periodStart,
          periodEnd
        ]
      );

      return {
        project,
        period: { start: periodStart, end: periodEnd },
        usage: result.rows
      };

    } catch (error) {
      console.error('[ProjectRegistry] Get project usage error:', error);
      throw error;
    }
  }

  /**
   * Get multi-project billing summary (for dashboard)
   */
  async getMultiProjectBilling(userId) {
    try {
      const projects = await this.getUserProjects(userId);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const billingData = await Promise.all(
        projects.map(async (project) => {
          const usage = await this.getProjectUsage(project.project_name, year, month);

          const totalCalls = usage.usage.reduce((sum, row) => sum + parseInt(row.calls), 0);
          const totalTokens = usage.usage.reduce((sum, row) => sum + parseInt(row.tokens || 0), 0);
          const totalCost = usage.usage.reduce((sum, row) => sum + parseInt(row.cost_cents || 0), 0);

          return {
            project: project.project_name,
            database: project.database_name,
            githubPagesUrl: project.github_pages_url,
            tier: project.tier,
            calls: totalCalls,
            tokens: totalTokens,
            costCents: totalCost,
            byokEnabled: usage.usage.some(row => row.key_source === 'byok'),
            providers: usage.usage
          };
        })
      );

      return {
        userId,
        totalProjects: projects.length,
        projects: billingData,
        period: { year, month }
      };

    } catch (error) {
      console.error('[ProjectRegistry] Get multi-project billing error:', error);
      throw error;
    }
  }
}

module.exports = ProjectRegistry;
