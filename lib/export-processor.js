#!/usr/bin/env node
/**
 * Documentation Export Processor
 *
 * Background worker that processes documentation export jobs:
 * - Watches documentation_exports table for pending jobs
 * - Runs screenshot-annotator.js for annotations
 * - Runs doc-video-recorder.js for video/GIF generation
 * - Runs pptxgenjs for PowerPoint generation
 * - Updates job status and progress
 *
 * Usage:
 *   node lib/export-processor.js
 *   # Or as background worker:
 *   node lib/export-processor.js &
 */

const { Pool } = require('pg');
const ScreenshotAnnotator = require('./screenshot-annotator');
const DocVideoRecorder = require('./doc-video-recorder');
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs').promises;

class ExportProcessor {
  constructor(options = {}) {
    this.pollInterval = options.pollInterval || 5000; // Check every 5 seconds
    this.maxConcurrent = options.maxConcurrent || 3; // Process 3 jobs at once
    this.outputDir = options.outputDir || path.join(__dirname, '..', 'oauth-exports');
    this.screenshotsDir = path.join(__dirname, '..', 'oauth-screenshots');

    this.db = new Pool({
      user: process.env.DB_USER || 'matthewmauer',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'calos',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });

    this.annotator = new ScreenshotAnnotator();
    this.recorder = new DocVideoRecorder({
      outputDir: this.outputDir,
      screenshotsDir: this.screenshotsDir
    });

    this.running = false;
    this.processingJobs = new Set();
  }

  /**
   * Start the export processor
   */
  async start() {
    console.log('[ExportProcessor] Starting...');
    console.log(`[ExportProcessor] Poll interval: ${this.pollInterval}ms`);
    console.log(`[ExportProcessor] Max concurrent: ${this.maxConcurrent}`);
    console.log(`[ExportProcessor] Output dir: ${this.outputDir}`);

    await fs.mkdir(this.outputDir, { recursive: true });

    this.running = true;

    // Start polling loop
    this.poll();
  }

  /**
   * Stop the processor
   */
  async stop() {
    console.log('[ExportProcessor] Stopping...');
    this.running = false;
    await this.db.end();
  }

  /**
   * Poll for pending jobs
   */
  async poll() {
    while (this.running) {
      try {
        // Check if we can take more jobs
        if (this.processingJobs.size < this.maxConcurrent) {
          await this.fetchAndProcessJobs();
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } catch (error) {
        console.error('[ExportProcessor] Poll error:', error);
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }
  }

  /**
   * Fetch pending jobs and process them
   */
  async fetchAndProcessJobs() {
    const availableSlots = this.maxConcurrent - this.processingJobs.size;

    const result = await this.db.query(
      `SELECT * FROM documentation_exports
       WHERE status = 'pending'
       ORDER BY requested_at ASC
       LIMIT $1`,
      [availableSlots]
    );

    for (const job of result.rows) {
      // Mark as processing
      await this.db.query(
        `UPDATE documentation_exports
         SET status = 'processing', started_at = NOW()
         WHERE export_id = $1`,
        [job.export_id]
      );

      // Process async (don't await)
      this.processJob(job).catch(error => {
        console.error(`[ExportProcessor] Job ${job.export_id} failed:`, error);
      });

      this.processingJobs.add(job.export_id);
    }
  }

  /**
   * Process a single export job
   */
  async processJob(job) {
    const startTime = Date.now();

    try {
      console.log(`\n[ExportProcessor] Processing job ${job.export_id}`);
      console.log(`[ExportProcessor]   Format: ${job.export_format}`);
      console.log(`[ExportProcessor]   Snapshot: ${job.snapshot_id}`);

      // Get snapshot data
      const snapshot = await this.db.query(
        `SELECT * FROM documentation_snapshots WHERE snapshot_id = $1`,
        [job.snapshot_id]
      );

      if (snapshot.rows.length === 0) {
        throw new Error('Snapshot not found');
      }

      const snapshotData = snapshot.rows[0];

      // Get annotations
      const annotations = await this.db.query(
        `SELECT * FROM documentation_annotations
         WHERE snapshot_id = $1
         ORDER BY step_number ASC`,
        [job.snapshot_id]
      );

      let outputPath;
      let fileSize;

      switch (job.export_format) {
        case 'gif':
          outputPath = await this.exportAsGIF(snapshotData, annotations.rows);
          break;

        case 'video':
        case 'mp4':
          outputPath = await this.exportAsVideo(snapshotData, annotations.rows);
          break;

        case 'pptx':
        case 'powerpoint':
          outputPath = await this.exportAsPPTX(snapshotData, annotations.rows);
          break;

        default:
          throw new Error(`Unsupported format: ${job.export_format}`);
      }

      // Get file size
      const stats = await fs.stat(outputPath);
      fileSize = stats.size;

      const duration = Date.now() - startTime;

      // Mark as completed
      await this.db.query(
        `UPDATE documentation_exports
         SET status = 'completed',
             output_path = $1,
             file_size_bytes = $2,
             duration_ms = $3,
             progress = 100,
             completed_at = NOW()
         WHERE export_id = $4`,
        [outputPath, fileSize, duration, job.export_id]
      );

      console.log(`[ExportProcessor] ✓ Job ${job.export_id} completed in ${duration}ms`);
      console.log(`[ExportProcessor]   Output: ${outputPath} (${(fileSize / 1024).toFixed(2)} KB)`);

    } catch (error) {
      console.error(`[ExportProcessor] ✗ Job ${job.export_id} failed:`, error.message);

      await this.db.query(
        `UPDATE documentation_exports
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE export_id = $2`,
        [error.message, job.export_id]
      );
    } finally {
      this.processingJobs.delete(job.export_id);
    }
  }

  /**
   * Export as animated GIF
   */
  async exportAsGIF(snapshot, annotations) {
    console.log(`[ExportProcessor]   Creating GIF...`);

    const baseScreenshot = snapshot.base_screenshot_path ||
                          path.join(snapshot.screenshot_dir, 'base-screenshot.png');

    // Create annotated screenshots for each step
    const annotatedPaths = [];

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const outputPath = path.join(
        this.outputDir,
        `${snapshot.provider}-step-${annotation.step_number}.png`
      );

      await this.annotator.annotate(baseScreenshot, [annotation], outputPath);
      annotatedPaths.push({
        path: outputPath,
        frameNumber: i,
        timestamp: i * 2000 // 2 seconds per step
      });

      // Update progress
      const progress = Math.round(((i + 1) / annotations.length) * 50);
      await this.updateProgress(snapshot.snapshot_id, progress);
    }

    // Convert to GIF
    const gifPath = path.join(
      this.outputDir,
      `${snapshot.provider}-tutorial.gif`
    );

    // Load screenshots into recorder
    this.recorder.screenshots = annotatedPaths;

    await this.recorder.convertToGIF(gifPath);

    // Update progress to 100%
    await this.updateProgress(snapshot.snapshot_id, 100);

    return gifPath;
  }

  /**
   * Export as MP4 video
   */
  async exportAsVideo(snapshot, annotations) {
    console.log(`[ExportProcessor]   Creating video...`);

    const baseScreenshot = snapshot.base_screenshot_path ||
                          path.join(snapshot.screenshot_dir, 'base-screenshot.png');

    // Create annotated screenshots
    const annotatedPaths = [];

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const outputPath = path.join(
        this.outputDir,
        `${snapshot.provider}-step-${annotation.step_number}.png`
      );

      await this.annotator.annotate(baseScreenshot, [annotation], outputPath);
      annotatedPaths.push({
        path: outputPath,
        frameNumber: i,
        timestamp: i * 2000 // 2 seconds per step
      });

      const progress = Math.round(((i + 1) / annotations.length) * 50);
      await this.updateProgress(snapshot.snapshot_id, progress);
    }

    // Convert to MP4
    const videoPath = path.join(
      this.outputDir,
      `${snapshot.provider}-tutorial.mp4`
    );

    // Load screenshots into recorder
    this.recorder.screenshots = annotatedPaths;

    await this.recorder.convertToVideo(videoPath);
    await this.updateProgress(snapshot.snapshot_id, 100);

    return videoPath;
  }

  /**
   * Export as PowerPoint
   */
  async exportAsPPTX(snapshot, annotations) {
    console.log(`[ExportProcessor]   Creating PowerPoint...`);

    const pptx = new PptxGenJS();
    pptx.author = 'CalOS Documentation System';
    pptx.title = `${snapshot.provider} OAuth Setup`;

    const baseScreenshot = snapshot.base_screenshot_path ||
                          path.join(snapshot.screenshot_dir, 'base-screenshot.png');

    // Create slides with annotated screenshots
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];

      // Create annotated screenshot
      const annotatedPath = path.join(
        this.outputDir,
        `${snapshot.provider}-step-${annotation.step_number}.png`
      );

      await this.annotator.annotate(baseScreenshot, [annotation], annotatedPath);

      // Create slide
      const slide = pptx.addSlide();

      // Add title
      slide.addText(annotation.step_title || `Step ${annotation.step_number}`, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.75,
        fontSize: 28,
        bold: true,
        color: '363636'
      });

      // Add screenshot
      slide.addImage({
        path: annotatedPath,
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 5
      });

      // Add description
      if (annotation.step_description) {
        slide.addText(annotation.step_description, {
          x: 0.5,
          y: 6.75,
          w: 9,
          h: 0.75,
          fontSize: 16,
          color: '666666'
        });
      }

      const progress = Math.round(((i + 1) / annotations.length) * 100);
      await this.updateProgress(snapshot.snapshot_id, progress);
    }

    const pptxPath = path.join(
      this.outputDir,
      `${snapshot.provider}-tutorial.pptx`
    );

    await pptx.writeFile({ fileName: pptxPath });

    return pptxPath;
  }

  /**
   * Update job progress
   */
  async updateProgress(exportId, progress) {
    await this.db.query(
      `UPDATE documentation_exports SET progress = $1 WHERE export_id = $2`,
      [progress, exportId]
    );
  }
}

// CLI mode
if (require.main === module) {
  const processor = new ExportProcessor();

  processor.start().catch(error => {
    console.error('[ExportProcessor] Fatal error:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[ExportProcessor] Received SIGINT, shutting down...');
    await processor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[ExportProcessor] Received SIGTERM, shutting down...');
    await processor.stop();
    process.exit(0);
  });
}

module.exports = ExportProcessor;
