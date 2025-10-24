/**
 * Local Todo Cache
 *
 * "Is it possible to have a todo list locally or app? and that stays accurate with my computer time"
 *
 * Problem:
 * - Database-backed DecisionTodo requires connection
 * - Need offline capability
 * - Local file should sync with database
 * - Time-aware (use computer time, not LLM training cutoff)
 *
 * Solution:
 * - Hybrid local file + database system
 * - Local cache file: ~/.calos/todos.json
 * - Syncs with DecisionTodo database when online
 * - Works offline, syncs when connection restored
 * - Time-aware using system time
 *
 * Examples:
 * - Offline: Read/write to local file
 * - Online: Sync with database
 * - Conflict resolution: Last write wins
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class LocalTodoCache {
  constructor(options = {}) {
    this.decisionTodo = options.decisionTodo; // Database-backed todo system
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.calos');
    this.cacheFile = path.join(this.cacheDir, 'todos.json');
    this.syncInterval = options.syncInterval || 60000; // Sync every 60 seconds
    this.autoSync = options.autoSync !== false;

    // In-memory cache
    this.todos = new Map();
    this.lastSync = null;
    this.syncTimer = null;
    this.pendingWrites = [];

    console.log('[LocalTodoCache] Initialized');
    console.log(`[LocalTodoCache] Cache file: ${this.cacheFile}`);

    // Initialize
    this.initialize();
  }

  /**
   * Initialize cache
   */
  async initialize() {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Load local cache
      await this.loadFromFile();

      // Start auto-sync if enabled
      if (this.autoSync) {
        this.startAutoSync();
      }

      console.log(`[LocalTodoCache] Loaded ${this.todos.size} todos from cache`);

    } catch (error) {
      console.error('[LocalTodoCache] Initialization error:', error.message);
    }
  }

  /**
   * Load todos from local file
   */
  async loadFromFile() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data);

      this.todos.clear();

      for (const todo of parsed.todos || []) {
        this.todos.set(todo.id, todo);
      }

      this.lastSync = parsed.lastSync || null;

      console.log(`[LocalTodoCache] Loaded ${this.todos.size} todos from file`);

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[LocalTodoCache] No cache file found, creating new');
        await this.saveToFile();
      } else {
        console.error('[LocalTodoCache] Error loading from file:', error.message);
      }
    }
  }

  /**
   * Save todos to local file
   */
  async saveToFile() {
    try {
      const data = {
        todos: Array.from(this.todos.values()),
        lastSync: this.lastSync,
        savedAt: new Date().toISOString()
      };

      await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');

      console.log(`[LocalTodoCache] Saved ${this.todos.size} todos to file`);

    } catch (error) {
      console.error('[LocalTodoCache] Error saving to file:', error.message);
    }
  }

  /**
   * Create a new todo
   *
   * @param {object} todoData - Todo data
   * @returns {Promise<object>} Created todo
   */
  async createTodo(todoData) {
    const todo = {
      id: crypto.randomUUID(),
      title: todoData.title,
      description: todoData.description || '',
      status: todoData.status || 'pending',
      priority: todoData.priority || 'medium',
      tags: todoData.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      dueDate: todoData.dueDate || null,
      metadata: todoData.metadata || {},
      syncedToDatabase: false
    };

    // Add to cache
    this.todos.set(todo.id, todo);

    // Save to file
    await this.saveToFile();

    // Queue for database sync
    if (this.decisionTodo) {
      this.pendingWrites.push({
        type: 'create',
        todo
      });
    }

    console.log(`[LocalTodoCache] Created todo: ${todo.title}`);

    return todo;
  }

  /**
   * Get todo by ID
   */
  getTodo(id) {
    return this.todos.get(id) || null;
  }

  /**
   * List todos with filtering
   *
   * @param {object} filters - Filters
   * @returns {Array<object>} Filtered todos
   */
  listTodos(filters = {}) {
    let todos = Array.from(this.todos.values());

    // Filter by status
    if (filters.status) {
      todos = todos.filter(t => t.status === filters.status);
    }

    // Filter by priority
    if (filters.priority) {
      todos = todos.filter(t => t.priority === filters.priority);
    }

    // Filter by tag
    if (filters.tag) {
      todos = todos.filter(t => t.tags.includes(filters.tag));
    }

    // Filter by title search
    if (filters.title) {
      const searchTerm = filters.title.toLowerCase();
      todos = todos.filter(t => t.title.toLowerCase().includes(searchTerm));
    }

    // Sort by created date (newest first)
    todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Limit results
    if (filters.limit) {
      todos = todos.slice(0, filters.limit);
    }

    return todos;
  }

  /**
   * Update todo
   *
   * @param {string} id - Todo ID
   * @param {object} updates - Updates
   * @returns {Promise<object>} Updated todo
   */
  async updateTodo(id, updates) {
    const todo = this.todos.get(id);

    if (!todo) {
      throw new Error(`Todo not found: ${id}`);
    }

    // Apply updates
    const updated = {
      ...todo,
      ...updates,
      id: todo.id, // Don't allow changing ID
      updatedAt: new Date().toISOString(),
      syncedToDatabase: false
    };

    // Update completion timestamp if status changed to completed
    if (updates.status === 'completed' && todo.status !== 'completed') {
      updated.completedAt = new Date().toISOString();
    }

    // Save to cache
    this.todos.set(id, updated);

    // Save to file
    await this.saveToFile();

    // Queue for database sync
    if (this.decisionTodo) {
      this.pendingWrites.push({
        type: 'update',
        todo: updated
      });
    }

    console.log(`[LocalTodoCache] Updated todo: ${updated.title}`);

    return updated;
  }

  /**
   * Delete todo
   *
   * @param {string} id - Todo ID
   * @returns {Promise<boolean>} Success
   */
  async deleteTodo(id) {
    const todo = this.todos.get(id);

    if (!todo) {
      throw new Error(`Todo not found: ${id}`);
    }

    // Remove from cache
    this.todos.delete(id);

    // Save to file
    await this.saveToFile();

    // Queue for database sync
    if (this.decisionTodo) {
      this.pendingWrites.push({
        type: 'delete',
        todo
      });
    }

    console.log(`[LocalTodoCache] Deleted todo: ${todo.title}`);

    return true;
  }

  /**
   * Sync with database (DecisionTodo)
   */
  async syncWithDatabase() {
    if (!this.decisionTodo) {
      console.log('[LocalTodoCache] Database not available, skipping sync');
      return {
        success: false,
        error: 'Database not available'
      };
    }

    console.log('[LocalTodoCache] Syncing with database...');

    const startTime = Date.now();
    let pushed = 0;
    let pulled = 0;
    const errors = [];

    try {
      // Step 1: Push pending writes to database
      for (const write of this.pendingWrites) {
        try {
          if (write.type === 'create') {
            await this.decisionTodo.createTodo({
              title: write.todo.title,
              description: write.todo.description,
              priority: write.todo.priority,
              status: write.todo.status,
              tags: write.todo.tags,
              due_date: write.todo.dueDate
            });

            // Mark as synced
            const todo = this.todos.get(write.todo.id);
            if (todo) {
              todo.syncedToDatabase = true;
              this.todos.set(todo.id, todo);
            }

            pushed++;

          } else if (write.type === 'update') {
            // Find todo in database by title (since local ID != database ID)
            const dbTodos = await this.decisionTodo.searchTodos({
              title: write.todo.title,
              limit: 1
            });

            if (dbTodos.length > 0) {
              await this.decisionTodo.updateTodo(dbTodos[0].todo_id, {
                status: write.todo.status,
                priority: write.todo.priority,
                description: write.todo.description
              });

              pushed++;
            }

          } else if (write.type === 'delete') {
            // Find and delete from database
            const dbTodos = await this.decisionTodo.searchTodos({
              title: write.todo.title,
              limit: 1
            });

            if (dbTodos.length > 0) {
              await this.decisionTodo.updateTodo(dbTodos[0].todo_id, {
                status: 'archived'
              });

              pushed++;
            }
          }

        } catch (error) {
          console.error(`[LocalTodoCache] Error pushing write:`, error.message);
          errors.push(error.message);
        }
      }

      // Clear pending writes
      this.pendingWrites = [];

      // Step 2: Pull recent todos from database
      try {
        const dbTodos = await this.decisionTodo.searchTodos({
          status: 'pending',
          limit: 100
        });

        for (const dbTodo of dbTodos) {
          // Check if we already have this todo (by title)
          const existing = Array.from(this.todos.values()).find(
            t => t.title === dbTodo.title
          );

          if (!existing) {
            // New todo from database
            const localTodo = {
              id: crypto.randomUUID(),
              title: dbTodo.title,
              description: dbTodo.description || '',
              status: dbTodo.status,
              priority: dbTodo.priority || 'medium',
              tags: dbTodo.tags || [],
              createdAt: dbTodo.created_at,
              updatedAt: dbTodo.updated_at || dbTodo.created_at,
              completedAt: dbTodo.completed_at || null,
              dueDate: dbTodo.due_date || null,
              metadata: dbTodo.metadata || {},
              syncedToDatabase: true,
              databaseId: dbTodo.todo_id
            };

            this.todos.set(localTodo.id, localTodo);
            pulled++;
          }
        }

      } catch (error) {
        console.error('[LocalTodoCache] Error pulling from database:', error.message);
        errors.push(error.message);
      }

      // Save to file
      await this.saveToFile();

      this.lastSync = new Date().toISOString();

      const duration = Date.now() - startTime;

      console.log(`[LocalTodoCache] Sync complete: pushed ${pushed}, pulled ${pulled} (${duration}ms)`);

      return {
        success: true,
        pushed,
        pulled,
        errors,
        duration,
        lastSync: this.lastSync
      };

    } catch (error) {
      console.error('[LocalTodoCache] Sync error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start auto-sync timer
   */
  startAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      await this.syncWithDatabase();
    }, this.syncInterval);

    console.log(`[LocalTodoCache] Auto-sync started (every ${this.syncInterval / 1000}s)`);
  }

  /**
   * Stop auto-sync timer
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[LocalTodoCache] Auto-sync stopped');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const byStatus = {};
    const byPriority = {};

    for (const todo of this.todos.values()) {
      byStatus[todo.status] = (byStatus[todo.status] || 0) + 1;
      byPriority[todo.priority] = (byPriority[todo.priority] || 0) + 1;
    }

    return {
      total: this.todos.size,
      byStatus,
      byPriority,
      pendingWrites: this.pendingWrites.length,
      lastSync: this.lastSync,
      cacheFile: this.cacheFile,
      autoSync: this.autoSync,
      syncInterval: this.syncInterval
    };
  }

  /**
   * Clear cache (use with caution)
   */
  async clearCache() {
    this.todos.clear();
    this.pendingWrites = [];
    await this.saveToFile();

    console.log('[LocalTodoCache] Cache cleared');
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    // Stop auto-sync
    this.stopAutoSync();

    // Final sync
    if (this.decisionTodo) {
      console.log('[LocalTodoCache] Final sync before shutdown...');
      await this.syncWithDatabase();
    }

    // Save to file
    await this.saveToFile();

    console.log('[LocalTodoCache] Shutdown complete');
  }
}

module.exports = LocalTodoCache;
