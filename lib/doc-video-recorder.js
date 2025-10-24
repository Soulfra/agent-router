#!/usr/bin/env node
/**
 * Documentation Video Recorder
 *
 * Records Puppeteer browser sessions and converts to video/GIF:
 * - Records entire browser automation as MP4
 * - Converts screenshot sequences to GIF
 * - Adds text overlays for steps
 * - Syncs with annotation timing
 *
 * Uses ffmpeg (already installed) for video processing
 *
 * Usage:
 *   const recorder = new DocVideoRecorder();
 *   await recorder.startRecording(page);
 *   await recorder.stopRecording();
 *   await recorder.convertToGIF();
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class DocVideoRecorder {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'oauth-videos';
    this.screenshotsDir = options.screenshotsDir || 'oauth-screenshots';
    this.fps = options.fps || 2; // Frames per second for GIF (slower for tutorials)
    this.quality = options.quality || 'high'; // 'low', 'medium', 'high'
    this.maxWidth = options.maxWidth || 1200; // Max width for output

    this.screenshots = [];
    this.isRecording = false;
    this.recordingStartTime = null;
    this.frameNumber = 0;
  }

  /**
   * Ensure output directories exist
   */
  async ensureDirectories() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.screenshotsDir, { recursive: true });
  }

  /**
   * Start recording screenshots from a Puppeteer page
   */
  async startRecording(page, options = {}) {
    await this.ensureDirectories();

    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.frameNumber = 0;
    this.screenshots = [];

    const interval = options.interval || 500; // Capture every 500ms
    const sessionId = options.sessionId || Date.now();

    console.log(`[Recorder] Started recording session ${sessionId}`);
    console.log(`[Recorder] Capturing frames every ${interval}ms`);

    // Capture frames periodically
    this.recordingInterval = setInterval(async () => {
      if (!this.isRecording) return;

      try {
        const framePath = path.join(
          this.screenshotsDir,
          `frame-${sessionId}-${String(this.frameNumber).padStart(4, '0')}.png`
        );

        await page.screenshot({ path: framePath });

        this.screenshots.push({
          path: framePath,
          frameNumber: this.frameNumber,
          timestamp: Date.now() - this.recordingStartTime
        });

        this.frameNumber++;
      } catch (error) {
        console.error(`[Recorder] Frame capture error: ${error.message}`);
      }
    }, interval);

    return {
      sessionId,
      startTime: this.recordingStartTime
    };
  }

  /**
   * Stop recording
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.warn('[Recorder] Not currently recording');
      return null;
    }

    clearInterval(this.recordingInterval);
    this.isRecording = false;

    const duration = Date.now() - this.recordingStartTime;

    console.log(`[Recorder] Stopped recording`);
    console.log(`[Recorder] Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`[Recorder] Frames captured: ${this.screenshots.length}`);

    return {
      duration,
      frameCount: this.screenshots.length,
      screenshots: this.screenshots
    };
  }

  /**
   * Convert screenshots to animated GIF using ffmpeg
   */
  async convertToGIF(outputPath, options = {}) {
    if (this.screenshots.length === 0) {
      throw new Error('No screenshots to convert');
    }

    await this.ensureDirectories();

    const fps = options.fps || this.fps;
    const maxWidth = options.maxWidth || this.maxWidth;
    const quality = options.quality || this.quality;

    // Get first screenshot to determine dimensions
    const firstFrame = this.screenshots[0].path;

    console.log(`[Recorder] Converting ${this.screenshots.length} frames to GIF...`);
    console.log(`[Recorder] FPS: ${fps}, Max width: ${maxWidth}`);

    // Create file list for ffmpeg
    // Use absolute paths and add duration for each frame (needed for PNG sequences)
    const fileListPath = path.join(this.outputDir, 'filelist.txt');
    const frameDuration = 1 / fps; // Duration of each frame in seconds
    const fileListContent = this.screenshots
      .map(s => `file '${path.resolve(s.path)}'\nduration ${frameDuration}`)
      .join('\n') + `\nfile '${path.resolve(this.screenshots[this.screenshots.length - 1].path)}'`; // Repeat last frame for proper timing

    await fs.writeFile(fileListPath, fileListContent);

    // ffmpeg command for high-quality GIF
    // Uses palette generation for better colors
    const paletteFile = path.join(this.outputDir, 'palette.png');

    try {
      // Step 1: Generate palette
      console.log('[Recorder] Generating color palette...');
      const paletteCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" \
        -vf "scale=${maxWidth}:-1:flags=lanczos,palettegen" \
        -y "${paletteFile}"`;

      await execAsync(paletteCmd);

      // Step 2: Create GIF using palette
      console.log('[Recorder] Creating GIF...');
      const gifCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -i "${paletteFile}" \
        -filter_complex "scale=${maxWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse" \
        -y "${outputPath}"`;

      await execAsync(gifCmd);

      // Get file size
      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`[Recorder] ✓ GIF created: ${path.basename(outputPath)}`);
      console.log(`[Recorder] File size: ${fileSizeMB} MB`);

      // Cleanup
      await fs.unlink(fileListPath);
      await fs.unlink(paletteFile);

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        frameCount: this.screenshots.length,
        duration: (this.screenshots.length / fps).toFixed(2)
      };

    } catch (error) {
      console.error(`[Recorder] ✗ GIF conversion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert screenshots to MP4 video
   */
  async convertToVideo(outputPath, options = {}) {
    if (this.screenshots.length === 0) {
      throw new Error('No screenshots to convert');
    }

    await this.ensureDirectories();

    const fps = options.fps || this.fps;
    const maxWidth = options.maxWidth || this.maxWidth;

    console.log(`[Recorder] Converting ${this.screenshots.length} frames to MP4...`);

    // Create file list
    const fileListPath = path.join(this.screenshotsDir, 'filelist.txt');
    const fileListContent = this.screenshots
      .map(s => `file '${path.basename(s.path)}'`)
      .join('\n');

    await fs.writeFile(fileListPath, fileListContent);

    try {
      // Create MP4 with H.264 codec
      const videoCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" \
        -vf "fps=${fps},scale=${maxWidth}:-1:flags=lanczos" \
        -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p \
        -y "${outputPath}"`;

      await execAsync(videoCmd, { cwd: this.screenshotsDir });

      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`[Recorder] ✓ Video created: ${path.basename(outputPath)}`);
      console.log(`[Recorder] File size: ${fileSizeMB} MB`);

      // Cleanup
      await fs.unlink(fileListPath);

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        frameCount: this.screenshots.length,
        duration: (this.screenshots.length / fps).toFixed(2)
      };

    } catch (error) {
      console.error(`[Recorder] ✗ Video conversion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add audio narration to video
   * @param {string} videoPath - Input video path (silent)
   * @param {string} audioPath - Input audio path (narration)
   * @param {string} outputPath - Output video path (with audio)
   * @returns {Promise<Object>} Result metadata
   */
  async addAudioNarration(videoPath, audioPath, outputPath) {
    console.log(`[Recorder] Adding audio narration to video...`);

    try {
      // Combine video and audio, extending video duration to match audio if needed
      const cmd = `ffmpeg -i "${videoPath}" -i "${audioPath}" \
        -c:v copy -c:a aac -b:a 192k -shortest \
        -y "${outputPath}"`;

      await execAsync(cmd);

      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`[Recorder] ✓ Narrated video created: ${path.basename(outputPath)}`);
      console.log(`[Recorder] File size: ${fileSizeMB} MB`);

      return {
        success: true,
        outputPath,
        fileSize: stats.size
      };

    } catch (error) {
      console.error(`[Recorder] ✗ Adding narration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert screenshots to video with narration
   * @param {string} outputPath - Output video path
   * @param {string} audioPath - Path to narration audio file
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result metadata
   */
  async convertToNarratedVideo(outputPath, audioPath, options = {}) {
    // First create silent video
    const silentVideoPath = outputPath.replace(/\.mp4$/, '-silent.mp4');
    await this.convertToVideo(silentVideoPath, options);

    // Add narration
    const result = await this.addAudioNarration(silentVideoPath, audioPath, outputPath);

    // Clean up silent video
    await fs.unlink(silentVideoPath).catch(() => {});

    return result;
  }

  /**
   * Add text overlay to video/GIF
   */
  async addTextOverlay(inputPath, outputPath, text, options = {}) {
    const fontSize = options.fontSize || 24;
    const fontColor = options.fontColor || 'white';
    const boxColor = options.boxColor || 'black@0.5';
    const position = options.position || 'bottom'; // 'top', 'bottom', 'center'

    let yPosition;
    switch (position) {
      case 'top':
        yPosition = 'h*0.1';
        break;
      case 'center':
        yPosition = '(h-text_h)/2';
        break;
      case 'bottom':
      default:
        yPosition = 'h-th-20';
        break;
    }

    console.log(`[Recorder] Adding text overlay: "${text}"`);

    const cmd = `ffmpeg -i "${inputPath}" \
      -vf "drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=${boxColor}:boxborderw=10" \
      -codec:a copy -y "${outputPath}"`;

    try {
      await execAsync(cmd);

      console.log(`[Recorder] ✓ Text overlay added`);

      return {
        success: true,
        outputPath
      };

    } catch (error) {
      console.error(`[Recorder] ✗ Text overlay failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup screenshot frames
   */
  async cleanup() {
    console.log(`[Recorder] Cleaning up ${this.screenshots.length} frames...`);

    for (const screenshot of this.screenshots) {
      try {
        await fs.unlink(screenshot.path);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }

    this.screenshots = [];
    console.log(`[Recorder] ✓ Cleanup complete`);
  }

  /**
   * Record a complete browser automation session
   */
  async recordSession(puppeteerFunction, outputBaseName, options = {}) {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({
      headless: options.headless || false,
      args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const sessionId = Date.now();

    try {
      // Start recording
      await this.startRecording(page, { sessionId, interval: 500 });

      // Run the user's Puppeteer function
      await puppeteerFunction(page);

      // Stop recording
      await this.stopRecording();

      // Convert to GIF
      const gifPath = path.join(this.outputDir, `${outputBaseName}.gif`);
      await this.convertToGIF(gifPath, options);

      // Convert to video if requested
      let videoPath = null;
      if (options.includeVideo) {
        videoPath = path.join(this.outputDir, `${outputBaseName}.mp4`);
        await this.convertToVideo(videoPath, options);
      }

      // Cleanup frames if requested
      if (options.cleanup !== false) {
        await this.cleanup();
      }

      return {
        gifPath,
        videoPath,
        frameCount: this.screenshots.length
      };

    } finally {
      await browser.close();
    }
  }
}

// CLI interface
if (require.main === module) {
  const recorder = new DocVideoRecorder();

  // Example: Record a simple navigation
  async function exampleSession(page) {
    await page.goto('https://github.com/settings/developers', {
      waitUntil: 'networkidle2'
    });

    await page.waitForTimeout(2000);

    // Simulate highlighting (would be done by oauth-browser-setup.js)
    await page.evaluate(() => {
      const button = document.querySelector('a[href="/settings/applications/new"]');
      if (button) {
        button.style.outline = '4px solid #00ff00';
        button.style.outlineOffset = '4px';
      }
    });

    await page.waitForTimeout(2000);
  }

  console.log('Documentation Video Recorder\n');
  console.log('Recording example session...\n');

  recorder.recordSession(exampleSession, 'github-oauth-demo', {
    headless: false,
    includeVideo: true,
    fps: 2,
    cleanup: false
  }).then(result => {
    console.log('\n✅ Recording complete!');
    console.log(`GIF: ${result.gifPath}`);
    if (result.videoPath) {
      console.log(`Video: ${result.videoPath}`);
    }
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ Recording failed:', error.message);
    process.exit(1);
  });
}

module.exports = DocVideoRecorder;
