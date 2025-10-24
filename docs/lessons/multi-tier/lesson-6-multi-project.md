# Lesson 6: Multi-Project Management

**Track:** Multi-Tier System Architecture
**Lesson:** 6 of 7
**XP Reward:** 140
**Time:** 40 minutes
**Prerequisites:** Lesson 5 (Rate Limiting)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Manage multiple projects per user
- ✅ Isolate project data
- ✅ Handle project switching
- ✅ Share resources across projects
- ✅ Implement project permissions

## Project Structure

```sql
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(user_id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_members (
  project_id TEXT REFERENCES projects(project_id),
  user_id TEXT REFERENCES users(user_id),
  role TEXT, -- 'owner', 'admin', 'member', 'viewer'
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_resources (
  resource_id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id),
  resource_type TEXT,
  data JSONB
);
```

## Project Manager

```javascript
class ProjectManager {
  constructor(db) {
    this.db = db;
  }

  async createProject(userId, name) {
    const projectId = this.generateId();

    await this.db.query(`
      INSERT INTO projects (project_id, owner_id, name)
      VALUES ($1, $2, $3)
    `, [projectId, userId, name]);

    // Add owner as admin
    await this.db.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `, [projectId, userId]);

    return { projectId, name };
  }

  async getUserProjects(userId) {
    const result = await this.db.query(`
      SELECT
        p.project_id,
        p.name,
        p.created_at,
        pm.role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.project_id
      WHERE pm.user_id = $1
      ORDER BY p.created_at DESC
    `, [userId]);

    return result.rows;
  }

  async switchProject(userId, projectId) {
    // Verify access
    const access = await this.checkAccess(userId, projectId);
    if (!access) {
      throw new Error('Access denied');
    }

    // Update user's active project
    await this.db.query(`
      UPDATE users SET active_project_id = $2 WHERE user_id = $1
    `, [userId, projectId]);

    return { success: true, projectId };
  }

  async checkAccess(userId, projectId) {
    const result = await this.db.query(`
      SELECT role FROM project_members
      WHERE user_id = $1 AND project_id = $2
    `, [userId, projectId]);

    return result.rows.length > 0;
  }

  generateId() {
    return 'proj_' + crypto.randomBytes(16).toString('hex');
  }
}

module.exports = ProjectManager;
```

## Summary

You've learned:
- ✅ Multi-project architecture
- ✅ Project isolation
- ✅ Permission management
- ✅ Resource organization

## Next Lesson

**Lesson 7: Self-Service Portal**

Build a complete self-service portal for users to manage their account, subscriptions, and usage.

## Quiz

1. What's project isolation?
   - a) No sharing between projects
   - b) Each project has separate data
   - c) Projects can't interact
   - d) All of the above

2. Who can be project members?
   - a) Only owners
   - b) Owners and admins
   - c) Anyone with permission
   - d) Everyone

3. How many projects can a user have?
   - a) 1
   - b) 3
   - c) 10
   - d) Depends on tier

**Answers:** 1-d, 2-c, 3-d

---

**🎴 Achievement Unlocked:** Multi-Project Pro (+140 XP)
