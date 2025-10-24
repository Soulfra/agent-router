const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Logs OAuth screenshot processing events to database
 * Provides audit trail and debugging for upload failures
 */
class OAuthProcessingLogger {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(__dirname, '../data/oauth-processing.db');
    this.wss = options.wss || null; // WebSocket server for real-time updates

    this.ensureDatabase();
    this.db = new Database(this.dbPath);
    this.initSchema();
  }

  /**
   * Ensure database directory exists
   */
  ensureDatabase() {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_processing_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL,
        app_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        formats_requested TEXT, -- JSON array
        screenshot_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS oauth_processing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT, -- JSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (upload_id) REFERENCES oauth_processing_jobs(upload_id)
      );

      CREATE TABLE IF NOT EXISTS oauth_generated_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL,
        format TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        duration_seconds REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (upload_id) REFERENCES oauth_processing_jobs(upload_id)
      );

      CREATE TABLE IF NOT EXISTS oauth_extracted_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        client_id TEXT,
        has_client_secret BOOLEAN DEFAULT 0,
        stored_in_keyring BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (upload_id) REFERENCES oauth_processing_jobs(upload_id)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON oauth_processing_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_provider ON oauth_processing_jobs(provider);
      CREATE INDEX IF NOT EXISTS idx_jobs_created ON oauth_processing_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_upload ON oauth_processing_events(upload_id);
    `);
  }

  /**
   * Create a new processing job
   */
  createJob(uploadId, metadata) {
    const { provider, appName, formatsRequested, screenshotCount } = metadata;

    const stmt = this.db.prepare(`
      INSERT INTO oauth_processing_jobs
        (upload_id, provider, app_name, status, formats_requested, screenshot_count)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      uploadId,
      provider,
      appName,
      JSON.stringify(formatsRequested || []),
      screenshotCount
    );

    this.logEvent(uploadId, 'job_created', { provider, appName, screenshotCount });
    this.broadcast({ type: 'job_created', uploadId, provider });

    return uploadId;
  }

  /**
   * Update job status
   */
  updateJobStatus(uploadId, status, errorMessage = null) {
    const updates = { status };

    if (status === 'processing' && !this.getJob(uploadId).started_at) {
      updates.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const setClauses = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');

    const stmt = this.db.prepare(`
      UPDATE oauth_processing_jobs
      SET ${setClauses}
      WHERE upload_id = ?
    `);

    stmt.run(...Object.values(updates), uploadId);

    this.logEvent(uploadId, 'status_changed', { status, errorMessage });
    this.broadcast({ type: 'job_status', uploadId, status, errorMessage });
  }

  /**
   * Log a processing event
   */
  logEvent(uploadId, eventType, eventData = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO oauth_processing_events (upload_id, event_type, event_data)
      VALUES (?, ?, ?)
    `);

    stmt.run(uploadId, eventType, JSON.stringify(eventData));

    this.broadcast({
      type: 'processing_event',
      uploadId,
      eventType,
      eventData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log generated export
   */
  logExport(uploadId, format, filePath, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO oauth_generated_exports
        (upload_id, format, file_path, file_size, duration_seconds)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      uploadId,
      format,
      filePath,
      metadata.fileSize || null,
      metadata.duration || null
    );

    this.logEvent(uploadId, 'export_generated', { format, filePath });
    this.broadcast({ type: 'export_generated', uploadId, format });
  }

  /**
   * Log extracted credentials
   */
  logCredentials(uploadId, provider, credentials) {
    const stmt = this.db.prepare(`
      INSERT INTO oauth_extracted_credentials
        (upload_id, provider, client_id, has_client_secret, stored_in_keyring)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      uploadId,
      provider,
      credentials.clientId || null,
      credentials.clientSecret ? 1 : 0,
      credentials.storedInKeyring ? 1 : 0
    );

    this.logEvent(uploadId, 'credentials_extracted', {
      provider,
      hasClientId: !!credentials.clientId,
      hasClientSecret: !!credentials.clientSecret
    });
  }

  /**
   * Get job by upload ID
   */
  getJob(uploadId) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_processing_jobs WHERE upload_id = ?
    `);

    return stmt.get(uploadId);
  }

  /**
   * Get job events
   */
  getJobEvents(uploadId) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_processing_events
      WHERE upload_id = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(uploadId).map(event => ({
      ...event,
      event_data: event.event_data ? JSON.parse(event.event_data) : null
    }));
  }

  /**
   * Get job exports
   */
  getJobExports(uploadId) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_generated_exports
      WHERE upload_id = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(uploadId);
  }

  /**
   * Get job credentials
   */
  getJobCredentials(uploadId) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_extracted_credentials
      WHERE upload_id = ?
    `);

    return stmt.get(uploadId);
  }

  /**
   * Get recent jobs
   */
  getRecentJobs(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_processing_jobs
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(job => ({
      ...job,
      formats_requested: job.formats_requested ? JSON.parse(job.formats_requested) : []
    }));
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_processing_jobs
      WHERE status = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(status).map(job => ({
      ...job,
      formats_requested: job.formats_requested ? JSON.parse(job.formats_requested) : []
    }));
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalJobs = this.db.prepare('SELECT COUNT(*) as count FROM oauth_processing_jobs').get().count;
    const completedJobs = this.db.prepare('SELECT COUNT(*) as count FROM oauth_processing_jobs WHERE status = ?').get('completed').count;
    const failedJobs = this.db.prepare('SELECT COUNT(*) as count FROM oauth_processing_jobs WHERE status = ?').get('failed').count;
    const pendingJobs = this.db.prepare('SELECT COUNT(*) as count FROM oauth_processing_jobs WHERE status = ?').get('pending').count;
    const processingJobs = this.db.prepare('SELECT COUNT(*) as count FROM oauth_processing_jobs WHERE status = ?').get('processing').count;

    const byProvider = this.db.prepare(`
      SELECT provider, COUNT(*) as count
      FROM oauth_processing_jobs
      GROUP BY provider
    `).all();

    const totalExports = this.db.prepare('SELECT COUNT(*) as count FROM oauth_generated_exports').get().count;

    const exportsByFormat = this.db.prepare(`
      SELECT format, COUNT(*) as count
      FROM oauth_generated_exports
      GROUP BY format
    `).all();

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      pendingJobs,
      processingJobs,
      byProvider,
      totalExports,
      exportsByFormat
    };
  }

  /**
   * Broadcast real-time update via WebSocket
   */
  broadcast(data) {
    if (!this.wss) return;

    const message = JSON.stringify(data);

    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = OAuthProcessingLogger;
