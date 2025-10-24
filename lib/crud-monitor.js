/**
 * CRUD Operation Monitor
 *
 * Tracks all file system operations across the platform for:
 * - Security auditing
 * - Executive dashboard visibility
 * - Performance monitoring
 * - Cross-domain activity tracking
 *
 * Integrates with Executive Motherboard dashboard
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class CRUDMonitor extends EventEmitter {
  constructor(db, options = {}) {
    super();
    this.db = db;
    this.enabled = options.enabled !== false;
    this.logToDatabase = options.logToDatabase !== false;
    this.streamToExecutive = options.streamToExecutive !== false;
    this.maxLogSize = options.maxLogSize || 1000000; // 1MB max file size to log content

    // In-memory operation queue for real-time streaming
    this.recentOperations = [];
    this.maxRecentOperations = 100;

    console.log('[CRUDMonitor] Initialized', {
      enabled: this.enabled,
      logToDatabase: this.logToDatabase,
      streamToExecutive: this.streamToExecutive
    });
  }

  /**
   * Track a READ operation
   */
  async trackRead(filePath, user = null, domain = null, metadata = {}) {
    if (!this.enabled) return;

    const operation = {
      operation_type: 'read',
      file_path: filePath,
      file_name: path.basename(filePath),
      file_ext: path.extname(filePath),
      user_id: user?.user_id || null,
      username: user?.username || null,
      domain_id: domain?.domain_id || null,
      domain_name: domain?.domain_name || null,
      file_size: metadata.size || null,
      metadata: metadata,
      timestamp: new Date()
    };

    await this._logOperation(operation);
    return operation;
  }

  /**
   * Track a WRITE operation
   */
  async trackWrite(filePath, content = null, user = null, domain = null, metadata = {}) {
    if (!this.enabled) return;

    const contentPreview = content
      ? content.toString().substring(0, 500) // First 500 chars
      : null;

    const operation = {
      operation_type: 'write',
      file_path: filePath,
      file_name: path.basename(filePath),
      file_ext: path.extname(filePath),
      user_id: user?.user_id || null,
      username: user?.username || null,
      domain_id: domain?.domain_id || null,
      domain_name: domain?.domain_name || null,
      file_size: content ? Buffer.byteLength(content) : null,
      content_preview: contentPreview,
      metadata: { ...metadata, contentLength: content?.length },
      timestamp: new Date()
    };

    await this._logOperation(operation);
    return operation;
  }

  /**
   * Track an EDIT operation
   */
  async trackEdit(filePath, changes = {}, user = null, domain = null, metadata = {}) {
    if (!this.enabled) return;

    const operation = {
      operation_type: 'edit',
      file_path: filePath,
      file_name: path.basename(filePath),
      file_ext: path.extname(filePath),
      user_id: user?.user_id || null,
      username: user?.username || null,
      domain_id: domain?.domain_id || null,
      domain_name: domain?.domain_name || null,
      file_size: changes.newSize || null,
      content_preview: changes.preview || null,
      metadata: { ...metadata, changes },
      timestamp: new Date()
    };

    await this._logOperation(operation);
    return operation;
  }

  /**
   * Track a DELETE operation
   */
  async trackDelete(filePath, user = null, domain = null, metadata = {}) {
    if (!this.enabled) return;

    const operation = {
      operation_type: 'delete',
      file_path: filePath,
      file_name: path.basename(filePath),
      file_ext: path.extname(filePath),
      user_id: user?.user_id || null,
      username: user?.username || null,
      domain_id: domain?.domain_id || null,
      domain_name: domain?.domain_name || null,
      metadata: metadata,
      timestamp: new Date()
    };

    await this._logOperation(operation);
    return operation;
  }

  /**
   * Internal: Log operation to database and emit events
   * @private
   */
  async _logOperation(operation) {
    // Add to recent operations queue (for real-time streaming)
    this.recentOperations.unshift(operation);
    if (this.recentOperations.length > this.maxRecentOperations) {
      this.recentOperations.pop();
    }

    // Emit event for WebSocket streaming to executive dashboard
    if (this.streamToExecutive) {
      this.emit('operation', operation);
    }

    // Log to database
    if (this.logToDatabase && this.db) {
      try {
        await this.db.query(`
          INSERT INTO crud_operations_log (
            operation_type,
            file_path,
            file_name,
            file_ext,
            user_id,
            domain_id,
            file_size,
            content_preview,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          operation.operation_type,
          operation.file_path,
          operation.file_name,
          operation.file_ext,
          operation.user_id,
          operation.domain_id,
          operation.file_size,
          operation.content_preview,
          JSON.stringify(operation.metadata)
        ]);
      } catch (error) {
        console.error('[CRUDMonitor] Database log error:', error.message);
      }
    }

    // Console log for debugging
    console.log(`[CRUD] ${operation.operation_type.toUpperCase()} ${operation.file_path} by ${operation.username || 'system'}`);
  }

  /**
   * Get recent operations (for dashboard)
   */
  getRecentOperations(limit = 50) {
    return this.recentOperations.slice(0, limit);
  }

  /**
   * Get operations from database with filters
   */
  async getOperations(filters = {}) {
    if (!this.db) return [];

    const {
      operationType,
      domainId,
      userId,
      fileExt,
      limit = 100,
      offset = 0,
      startDate,
      endDate
    } = filters;

    let query = 'SELECT * FROM crud_operations_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (operationType) {
      query += ` AND operation_type = $${paramIndex++}`;
      params.push(operationType);
    }

    if (domainId) {
      query += ` AND domain_id = $${paramIndex++}`;
      params.push(domainId);
    }

    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (fileExt) {
      query += ` AND file_ext = $${paramIndex++}`;
      params.push(fileExt);
    }

    if (startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    try {
      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[CRUDMonitor] Query error:', error.message);
      return [];
    }
  }

  /**
   * Get operation statistics
   */
  async getStats(timeRange = '24h') {
    if (!this.db) return null;

    const interval = timeRange === '24h' ? '24 hours' :
                     timeRange === '7d' ? '7 days' :
                     timeRange === '30d' ? '30 days' : '24 hours';

    try {
      const result = await this.db.query(`
        SELECT
          operation_type,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT domain_id) as unique_domains,
          SUM(file_size) as total_bytes
        FROM crud_operations_log
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY operation_type
        ORDER BY count DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('[CRUDMonitor] Stats error:', error.message);
      return null;
    }
  }

  /**
   * Get operation timeline (for charts)
   */
  async getTimeline(timeRange = '24h', granularity = '1h') {
    if (!this.db) return [];

    const interval = timeRange === '24h' ? '24 hours' :
                     timeRange === '7d' ? '7 days' :
                     timeRange === '30d' ? '30 days' : '24 hours';

    const bucket = granularity === '1h' ? '1 hour' :
                   granularity === '1d' ? '1 day' :
                   granularity === '1w' ? '1 week' : '1 hour';

    try {
      const result = await this.db.query(`
        SELECT
          DATE_TRUNC('${bucket}', timestamp) as time_bucket,
          operation_type,
          COUNT(*) as count
        FROM crud_operations_log
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket, operation_type
        ORDER BY time_bucket DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('[CRUDMonitor] Timeline error:', error.message);
      return [];
    }
  }

  /**
   * Wrap fs.promises with monitoring
   */
  wrapFS(user = null, domain = null) {
    const monitor = this;

    return {
      async readFile(filePath, encoding) {
        const content = await fs.readFile(filePath, encoding);
        await monitor.trackRead(filePath, user, domain, {
          encoding,
          size: Buffer.byteLength(content)
        });
        return content;
      },

      async writeFile(filePath, content, encoding) {
        const result = await fs.writeFile(filePath, content, encoding);
        await monitor.trackWrite(filePath, content, user, domain, { encoding });
        return result;
      },

      async unlink(filePath) {
        const stats = await fs.stat(filePath).catch(() => null);
        const result = await fs.unlink(filePath);
        await monitor.trackDelete(filePath, user, domain, {
          size: stats?.size
        });
        return result;
      },

      async appendFile(filePath, content, encoding) {
        const result = await fs.appendFile(filePath, content, encoding);
        await monitor.trackEdit(filePath, { preview: content.toString().substring(0, 500) }, user, domain, { encoding, operation: 'append' });
        return result;
      }
    };
  }
}

module.exports = CRUDMonitor;
