/**
 * Project Export Engine
 *
 * Generates PDF, Markdown, and SharePoint-ready exports from voice sessions.
 * Applies brand-specific formatting (colors, fonts, layouts).
 *
 * Export formats:
 * - PDF (wkhtmltopdf with brand CSS)
 * - Markdown (SharePoint-compatible)
 * - JSON (structured data)
 * - HTML (standalone with embedded CSS)
 *
 * Features:
 * - Brand color theming (soulfra=blue, deathtodata=red, etc.)
 * - Syntax highlighting for code blocks
 * - ANSI color preservation in terminals
 * - SharePoint metadata tags
 * - Auto-cleanup for temporary exports
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const marked = require('marked');

class ProjectExportEngine {
  constructor(db, config = {}) {
    this.db = db;

    // Configuration
    this.config = {
      storageDir: config.storageDir || path.join(__dirname, '../storage/exports'),
      tempDir: config.tempDir || '/tmp/project-exports',
      wkhtmltopdfPath: config.wkhtmltopdfPath || '/usr/local/bin/wkhtmltopdf',
      defaultFormat: config.defaultFormat || 'pdf',
      autoCleanup: config.autoCleanup !== false,
      cleanupAfterDays: config.cleanupAfterDays || 7
    };

    // Brand theme configurations
    this.brandThemes = {
      soulfra: {
        color: '#3b82f6',
        fontFamily: 'Inter, system-ui, sans-serif',
        headerBg: '#1e3a8a',
        accentColor: '#60a5fa',
        mood: 'professional, trustworthy'
      },
      deathtodata: {
        color: '#ef4444',
        fontFamily: 'Space Grotesk, system-ui, sans-serif',
        headerBg: '#7f1d1d',
        accentColor: '#f87171',
        mood: 'rebellious, philosophical'
      },
      dealordelete: {
        color: '#10b981',
        fontFamily: 'Inter, system-ui, sans-serif',
        headerBg: '#064e3b',
        accentColor: '#34d399',
        mood: 'decisive, action-oriented'
      },
      finishthisidea: {
        color: '#f59e0b',
        fontFamily: 'Poppins, system-ui, sans-serif',
        headerBg: '#78350f',
        accentColor: '#fbbf24',
        mood: 'creative, optimistic'
      },
      finishthisrepo: {
        color: '#8b5cf6',
        fontFamily: 'JetBrains Mono, monospace',
        headerBg: '#4c1d95',
        accentColor: '#a78bfa',
        mood: 'technical, focused'
      },
      calos: {
        color: '#06b6d4',
        fontFamily: 'Inter, system-ui, sans-serif',
        headerBg: '#164e63',
        accentColor: '#22d3ee',
        mood: 'innovative, developer-first'
      },
      roughsparks: {
        color: '#ec4899',
        fontFamily: 'Quicksand, system-ui, sans-serif',
        headerBg: '#831843',
        accentColor: '#f472b6',
        mood: 'creative, spontaneous'
      }
    };

    // Stats
    this.stats = {
      exports_generated: 0,
      pdfs_created: 0,
      markdowns_created: 0,
      bytes_exported: 0
    };
  }

  /**
   * Initialize export engine
   */
  async initialize() {
    try {
      // Create storage directories
      await fs.mkdir(this.config.storageDir, { recursive: true });
      await fs.mkdir(this.config.tempDir, { recursive: true });

      console.log('[ProjectExportEngine] Initialized');
      console.log(`  Storage: ${this.config.storageDir}`);
      console.log(`  Temp: ${this.config.tempDir}`);

      // Check wkhtmltopdf availability
      try {
        await fs.access(this.config.wkhtmltopdfPath);
        console.log('  wkhtmltopdf: available');
      } catch {
        console.warn('  wkhtmltopdf: NOT FOUND (PDF exports will fail)');
        console.warn(`    Install: brew install wkhtmltopdf (macOS)`);
      }

    } catch (error) {
      console.error('[ProjectExportEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Export voice session with logs
   *
   * @param {Object} options - Export options
   * @returns {Promise<Object>} - Export result with artifact_id
   */
  async export(options) {
    const {
      transcriptionId,
      projectId,
      userId,
      format = 'pdf',
      destination = 'local',
      includeVoiceTranscript = true,
      includeSessionLogs = true,
      includeCodeDiffs = false,
      includeAIResponses = true,
      title = null,
      sharepointMetadata = {}
    } = options;

    const startTime = Date.now();
    const artifactId = uuidv4();

    console.log(`[ProjectExportEngine] Starting export: ${format} for transcription ${transcriptionId}`);

    try {
      // 1. Fetch data from database
      const data = await this.fetchExportData(transcriptionId, {
        includeVoiceTranscript,
        includeSessionLogs,
        includeCodeDiffs,
        includeAIResponses
      });

      if (!data.transcription) {
        throw new Error(`Transcription not found: ${transcriptionId}`);
      }

      // 2. Get brand theme
      const brandName = data.project?.brand_name || 'calos';
      const theme = this.brandThemes[brandName] || this.brandThemes.calos;

      // 3. Generate export content based on format
      let content, filename, filePath, fileSize;

      switch (format) {
        case 'pdf':
          ({ content, filename, filePath, fileSize } = await this.exportPDF(data, theme, title));
          this.stats.pdfs_created++;
          break;

        case 'markdown':
          ({ content, filename, filePath, fileSize } = await this.exportMarkdown(data, theme, title));
          this.stats.markdowns_created++;
          break;

        case 'json':
          ({ content, filename, filePath, fileSize } = await this.exportJSON(data, title));
          break;

        case 'html':
          ({ content, filename, filePath, fileSize } = await this.exportHTML(data, theme, title));
          break;

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // 4. Store artifact metadata in database
      const expiresAt = this.config.autoCleanup
        ? new Date(Date.now() + this.config.cleanupAfterDays * 24 * 60 * 60 * 1000)
        : null;

      const result = await this.db.query(`
        INSERT INTO export_artifacts (
          artifact_id, transcription_id, project_id, user_id,
          format, destination, filename, file_size_bytes, storage_path,
          title, includes_voice_transcript, includes_session_logs,
          includes_code_diffs, includes_ai_responses,
          brand_color, font_family, color_scheme, syntax_highlighting,
          sharepoint_metadata, export_status, completed_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'completed', NOW(), $20)
        RETURNING artifact_id, requested_at
      `, [
        artifactId,
        transcriptionId,
        projectId,
        userId,
        format,
        destination,
        filename,
        fileSize,
        filePath,
        title || `${data.project?.project_name || 'Project'} - ${format.toUpperCase()} Export`,
        includeVoiceTranscript,
        includeSessionLogs,
        includeCodeDiffs,
        includeAIResponses,
        theme.color,
        theme.fontFamily,
        'github-dark',
        true,
        JSON.stringify(sharepointMetadata),
        expiresAt
      ]);

      // 5. Update stats
      this.stats.exports_generated++;
      this.stats.bytes_exported += fileSize;

      const durationMs = Date.now() - startTime;

      console.log(`[ProjectExportEngine] Export complete: ${filename} (${this.formatBytes(fileSize)}, ${durationMs}ms)`);

      return {
        success: true,
        artifact_id: artifactId,
        format,
        filename,
        file_path: filePath,
        file_size_bytes: fileSize,
        file_size_readable: this.formatBytes(fileSize),
        duration_ms: durationMs,
        expires_at: expiresAt,
        requested_at: result.rows[0].requested_at
      };

    } catch (error) {
      console.error('[ProjectExportEngine] Export failed:', error);

      // Store failed export
      await this.db.query(`
        INSERT INTO export_artifacts (
          artifact_id, transcription_id, project_id, user_id,
          format, destination, export_status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7)
      `, [artifactId, transcriptionId, projectId, userId, format, destination, error.message]);

      throw error;
    }
  }

  /**
   * Fetch all data needed for export
   */
  async fetchExportData(transcriptionId, options) {
    // Fetch transcription
    const transcriptionResult = await this.db.query(`
      SELECT
        vt.*,
        pc.project_id, pc.project_slug, pc.project_name, pc.brand_name, pc.brand_color,
        u.user_id, u.username, u.email
      FROM voice_transcriptions vt
      LEFT JOIN project_contexts pc ON vt.project_id = pc.project_id
      LEFT JOIN users u ON vt.user_id = u.user_id
      WHERE vt.transcription_id = $1
    `, [transcriptionId]);

    const transcription = transcriptionResult.rows[0];

    if (!transcription) {
      return { transcription: null };
    }

    // Fetch session logs if requested
    let logs = [];
    if (options.includeSessionLogs) {
      const logsResult = await this.db.query(`
        SELECT * FROM project_session_logs
        WHERE transcription_id = $1
        ORDER BY created_at ASC
      `, [transcriptionId]);
      logs = logsResult.rows;
    }

    return {
      transcription,
      project: transcription.project_id ? {
        project_id: transcription.project_id,
        project_slug: transcription.project_slug,
        project_name: transcription.project_name,
        brand_name: transcription.brand_name,
        brand_color: transcription.brand_color
      } : null,
      user: {
        user_id: transcription.user_id,
        username: transcription.username,
        email: transcription.email
      },
      logs
    };
  }

  /**
   * Export to PDF (using wkhtmltopdf)
   */
  async exportPDF(data, theme, customTitle) {
    // Generate HTML first
    const { content: htmlContent } = await this.exportHTML(data, theme, customTitle);

    // Save HTML to temp file
    const tempHtmlPath = path.join(this.config.tempDir, `${uuidv4()}.html`);
    await fs.writeFile(tempHtmlPath, htmlContent, 'utf8');

    // Generate PDF filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const projectSlug = data.project?.project_slug || 'unknown';
    const filename = `${projectSlug}-${timestamp}.pdf`;
    const filePath = path.join(this.config.storageDir, filename);

    // Run wkhtmltopdf
    await this.runWkhtmltopdf(tempHtmlPath, filePath);

    // Get file size
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Cleanup temp HTML
    await fs.unlink(tempHtmlPath);

    return {
      content: null, // Binary PDF, not returned
      filename,
      filePath,
      fileSize
    };
  }

  /**
   * Run wkhtmltopdf command
   */
  runWkhtmltopdf(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.wkhtmltopdfPath, [
        '--enable-local-file-access',
        '--encoding', 'utf-8',
        '--margin-top', '15mm',
        '--margin-bottom', '15mm',
        '--margin-left', '10mm',
        '--margin-right', '10mm',
        inputPath,
        outputPath
      ]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`wkhtmltopdf failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Export to HTML (standalone with embedded CSS)
   */
  async exportHTML(data, theme, customTitle) {
    const title = customTitle || `${data.project?.project_name || 'Voice Session'} Export`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHTML(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${theme.fontFamily};
      line-height: 1.6;
      color: #1f2937;
      background: #ffffff;
      padding: 2rem;
    }
    .header {
      background: ${theme.headerBg};
      color: #ffffff;
      padding: 2rem;
      margin: -2rem -2rem 2rem -2rem;
      border-bottom: 4px solid ${theme.color};
    }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header .meta { opacity: 0.9; font-size: 0.9rem; }
    .section { margin: 2rem 0; }
    .section h2 {
      color: ${theme.color};
      font-size: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid ${theme.accentColor};
    }
    .transcript {
      background: #f9fafb;
      padding: 1.5rem;
      border-left: 4px solid ${theme.color};
      border-radius: 4px;
      margin: 1rem 0;
    }
    .log-entry {
      background: #1f2937;
      color: #e5e7eb;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 0.85rem;
      overflow-x: auto;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #374151;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-success { background: #10b981; color: #ffffff; }
    .badge-error { background: #ef4444; color: #ffffff; }
    .badge-warning { background: #f59e0b; color: #ffffff; }
    .badge-info { background: #3b82f6; color: #ffffff; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${this.escapeHTML(title)}</h1>
    <div class="meta">
      Project: <strong>${this.escapeHTML(data.project?.project_name || 'N/A')}</strong> |
      User: <strong>${this.escapeHTML(data.user.username)}</strong> |
      Date: <strong>${new Date(data.transcription.created_at).toLocaleString()}</strong>
    </div>
  </div>

  <div class="section">
    <h2>Voice Transcript</h2>
    <div class="transcript">
      <p><strong>Original:</strong> ${this.escapeHTML(data.transcription.raw_transcript)}</p>
      ${data.transcription.cleaned_transcript ? `<p style="margin-top: 1rem;"><strong>Cleaned:</strong> ${this.escapeHTML(data.transcription.cleaned_transcript)}</p>` : ''}
      ${data.transcription.detected_intent ? `<p style="margin-top: 0.5rem;"><strong>Intent:</strong> <span class="badge badge-info">${this.escapeHTML(data.transcription.detected_intent)}</span></p>` : ''}
    </div>
  </div>

  ${data.logs.length > 0 ? `
  <div class="section">
    <h2>Pipeline Execution Logs</h2>
    ${data.logs.map(log => `
      <div class="log-entry">
        <div class="log-header">
          <div>
            <span class="badge badge-${this.getLogLevelClass(log.log_level)}">${log.log_level.toUpperCase()}</span>
            <strong>${this.escapeHTML(log.pipeline_stage)}</strong>
          </div>
          <div>Exit Code: ${log.exit_code}</div>
        </div>
        <div><strong>Command:</strong> <code>${this.escapeHTML(log.command_executed)}</code></div>
        ${log.stdout_ansi ? `<pre>${this.escapeHTML(log.stdout_ansi)}</pre>` : ''}
        ${log.stderr_ansi ? `<pre style="color: #ef4444;">${this.escapeHTML(log.stderr_ansi)}</pre>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;

    const filename = `${data.project?.project_slug || 'export'}-${Date.now()}.html`;
    const filePath = path.join(this.config.storageDir, filename);
    await fs.writeFile(filePath, html, 'utf8');

    const stats = await fs.stat(filePath);

    return {
      content: html,
      filename,
      filePath,
      fileSize: stats.size
    };
  }

  /**
   * Export to Markdown (SharePoint-compatible)
   */
  async exportMarkdown(data, theme, customTitle) {
    const title = customTitle || `${data.project?.project_name || 'Voice Session'} Export`;

    const markdown = `# ${title}

**Project:** ${data.project?.project_name || 'N/A'}
**Brand:** ${data.project?.brand_name || 'N/A'}
**User:** ${data.user.username}
**Date:** ${new Date(data.transcription.created_at).toLocaleString()}

---

## Voice Transcript

**Original:**
> ${data.transcription.raw_transcript}

${data.transcription.cleaned_transcript ? `**Cleaned:**\n> ${data.transcription.cleaned_transcript}\n` : ''}
${data.transcription.detected_intent ? `**Intent:** \`${data.transcription.detected_intent}\`\n` : ''}

---

${data.logs.length > 0 ? `## Pipeline Execution Logs\n\n${data.logs.map(log => `
### ${log.pipeline_stage} (${log.log_level.toUpperCase()})

**Command:** \`${log.command_executed}\`
**Exit Code:** ${log.exit_code}
**Duration:** ${log.duration_ms}ms

${log.stdout_raw ? `**Output:**\n\`\`\`\n${log.stdout_raw}\n\`\`\`\n` : ''}
${log.stderr_raw ? `**Errors:**\n\`\`\`\n${log.stderr_raw}\n\`\`\`\n` : ''}
`).join('\n---\n\n')}` : ''}

---

*Generated by CalOS Project Export Engine*
`;

    const filename = `${data.project?.project_slug || 'export'}-${Date.now()}.md`;
    const filePath = path.join(this.config.storageDir, filename);
    await fs.writeFile(filePath, markdown, 'utf8');

    const stats = await fs.stat(filePath);

    return {
      content: markdown,
      filename,
      filePath,
      fileSize: stats.size
    };
  }

  /**
   * Export to JSON (structured data)
   */
  async exportJSON(data, customTitle) {
    const json = JSON.stringify(data, null, 2);

    const filename = `${data.project?.project_slug || 'export'}-${Date.now()}.json`;
    const filePath = path.join(this.config.storageDir, filename);
    await fs.writeFile(filePath, json, 'utf8');

    const stats = await fs.stat(filePath);

    return {
      content: json,
      filename,
      filePath,
      fileSize: stats.size
    };
  }

  /**
   * Helper: Escape HTML
   */
  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper: Get log level CSS class
   */
  getLogLevelClass(level) {
    const map = {
      error: 'error',
      warning: 'warning',
      success: 'success',
      info: 'info'
    };
    return map[level] || 'info';
  }

  /**
   * Helper: Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Get export artifact by ID
   */
  async getArtifact(artifactId) {
    const result = await this.db.query(`
      SELECT * FROM export_artifacts
      WHERE artifact_id = $1
    `, [artifactId]);

    return result.rows[0] || null;
  }

  /**
   * Get engine stats
   */
  getStats() {
    return {
      ...this.stats,
      total_bytes_mb: (this.stats.bytes_exported / 1024 / 1024).toFixed(2)
    };
  }
}

module.exports = ProjectExportEngine;
