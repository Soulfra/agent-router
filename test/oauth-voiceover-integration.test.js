const { expect } = require('chai');
const path = require('path');
const fs = require('fs').promises;
const GuidedOAuthBuilder = require('../lib/guided-oauth-builder');
const ScreenshotOCR = require('../lib/screenshot-ocr');
const AutoAnnotator = require('../lib/auto-annotator');
const NarrationGenerator = require('../lib/narration-generator');

/**
 * Integration test for OAuth Screenshot Voiceover System
 * Tests the complete pipeline: OCR → Annotations → Narration → Video Export
 */
describe('OAuth Voiceover System - Integration Test', function() {
  this.timeout(120000); // 2 minutes for video generation

  const testOutputDir = path.join(__dirname, '../oauth-exports/test');
  const githubScreenshotsDir = path.join(__dirname, '../oauth-screenshots/github-2025-10-20');

  before(async function() {
    // Ensure test output directory exists
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  after(async function() {
    // Cleanup test outputs (optional - keep for manual inspection)
    // await fs.rm(testOutputDir, { recursive: true, force: true });
  });

  describe('Dependency Checks', function() {
    it('should have ffmpeg installed', async function() {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync('ffmpeg -version');
        expect(stdout).to.include('ffmpeg version');
      } catch (error) {
        throw new Error('ffmpeg not installed - required for video export');
      }
    });

    it('should have tesseract installed', async function() {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync('tesseract --version');
        expect(stdout).to.include('tesseract');
      } catch (error) {
        throw new Error('tesseract not installed - required for OCR');
      }
    });
  });

  describe('OCR Extraction', function() {
    it('should extract text from screenshots using tesseract', async function() {
      const ocr = new ScreenshotOCR();
      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const firstScreenshot = screenshotFiles.filter(f => f.endsWith('.png'))[0];

      if (!firstScreenshot) {
        this.skip('No screenshots found in test directory');
      }

      const screenshotPath = path.join(githubScreenshotsDir, firstScreenshot);
      const text = await ocr.extractText(screenshotPath);

      expect(text).to.be.a('string');
      expect(text.length).to.be.greaterThan(0);
      console.log(`      Extracted ${text.length} characters from screenshot`);
    });

    it('should detect credentials from OCR text', async function() {
      const ocr = new ScreenshotOCR();
      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(githubScreenshotsDir, f));

      let foundClientId = false;
      let foundClientSecret = false;

      for (const screenshot of screenshots) {
        const text = await ocr.extractText(screenshot);
        const credentials = await ocr.findCredentials(text);

        if (credentials.clientId) {
          foundClientId = true;
          console.log(`      Found Client ID: ${credentials.clientId}`);
        }

        if (credentials.clientSecret) {
          foundClientSecret = true;
          console.log(`      Found Client Secret: ${credentials.clientSecret.substring(0, 10)}...`);
        }
      }

      // At least one credential should be found
      expect(foundClientId || foundClientSecret).to.be.true;
    });
  });

  describe('Auto Annotation', function() {
    it('should generate annotations for screenshots', async function() {
      const annotator = new AutoAnnotator();
      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 3) // Test first 3 screenshots
        .map(f => path.join(githubScreenshotsDir, f));

      const annotatedData = await annotator.generateTutorialAnnotations(screenshots);

      expect(annotatedData).to.be.an('array');
      expect(annotatedData.length).to.equal(screenshots.length);

      for (const data of annotatedData) {
        expect(data).to.have.property('stepNumber');
        expect(data).to.have.property('stepTitle');
        expect(data).to.have.property('annotations');
        expect(data.annotations).to.be.an('array');

        console.log(`      Step ${data.stepNumber}: ${data.stepTitle} (${data.annotations.length} annotations)`);
      }
    });
  });

  describe('Narration Generation', function() {
    it('should generate narration script from annotations', async function() {
      const narrationGenerator = new NarrationGenerator();
      const annotator = new AutoAnnotator();

      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 2) // Just test 2 for speed
        .map(f => path.join(githubScreenshotsDir, f));

      const annotatedData = await annotator.generateTutorialAnnotations(screenshots);
      const script = narrationGenerator.generateScript(annotatedData, 'github');

      expect(script).to.be.an('array');
      expect(script.length).to.be.greaterThan(annotatedData.length); // Includes intro/outro

      for (const segment of script) {
        expect(segment).to.have.property('text');
        expect(segment).to.have.property('duration');
        expect(segment.text).to.be.a('string');
        expect(segment.text.length).to.be.greaterThan(0);

        console.log(`      Segment ${segment.stepNumber}: "${segment.text.substring(0, 50)}..."`);
      }
    });

    it('should generate audio file using macOS say command', async function() {
      const narrationGenerator = new NarrationGenerator({
        outputDir: path.join(testOutputDir, 'narration')
      });

      const testText = 'This is a test of the text to speech system.';
      const outputPath = path.join(testOutputDir, 'narration/test-audio.mp3');

      try {
        const result = await narrationGenerator.generateAudioMacOS(testText, outputPath);

        expect(result.success).to.be.true;
        expect(result.outputPath).to.equal(outputPath);

        const stats = await fs.stat(outputPath);
        expect(stats.size).to.be.greaterThan(0);

        console.log(`      Generated audio: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (error) {
        if (error.message.includes('say')) {
          this.skip('macOS say command not available on this system');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Complete Pipeline', function() {
    it('should generate GIF export', async function() {
      const builder = new GuidedOAuthBuilder({
        baseDir: path.join(__dirname, '..'),
        screenshotsDir: githubScreenshotsDir,
        outputDir: testOutputDir
      });

      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 3) // Test with 3 screenshots
        .map(f => path.join(githubScreenshotsDir, f));

      if (screenshots.length === 0) {
        this.skip('No screenshots found for testing');
      }

      const result = await builder.processUploadedScreenshots(screenshots, {
        provider: 'github',
        appName: 'Test App',
        exportFormats: ['gif']
      });

      expect(result).to.have.property('exports');
      expect(result.exports).to.have.property('gif');

      const gifPath = result.exports.gif;
      const stats = await fs.stat(gifPath);

      expect(stats.size).to.be.greaterThan(0);
      console.log(`      Generated GIF: ${(stats.size / 1024).toFixed(2)} KB`);
    });

    it('should generate MP4 export', async function() {
      const builder = new GuidedOAuthBuilder({
        baseDir: path.join(__dirname, '..'),
        screenshotsDir: githubScreenshotsDir,
        outputDir: testOutputDir
      });

      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 3)
        .map(f => path.join(githubScreenshotsDir, f));

      if (screenshots.length === 0) {
        this.skip('No screenshots found for testing');
      }

      const result = await builder.processUploadedScreenshots(screenshots, {
        provider: 'github',
        appName: 'Test App',
        exportFormats: ['mp4']
      });

      expect(result).to.have.property('exports');
      expect(result.exports).to.have.property('mp4');

      const mp4Path = result.exports.mp4;
      const stats = await fs.stat(mp4Path);

      expect(stats.size).to.be.greaterThan(0);
      console.log(`      Generated MP4: ${(stats.size / 1024).toFixed(2)} KB`);
    });

    it('should generate narrated MP4 export', async function() {
      // Skip if macOS say command not available
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        await execAsync('which say');
      } catch (error) {
        this.skip('macOS say command not available - skipping narrated video test');
      }

      const builder = new GuidedOAuthBuilder({
        baseDir: path.join(__dirname, '..'),
        screenshotsDir: githubScreenshotsDir,
        outputDir: testOutputDir
      });

      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 2) // Use fewer screenshots for narrated video (slower)
        .map(f => path.join(githubScreenshotsDir, f));

      if (screenshots.length === 0) {
        this.skip('No screenshots found for testing');
      }

      const result = await builder.processUploadedScreenshots(screenshots, {
        provider: 'github',
        appName: 'Test App',
        exportFormats: ['mp4-narrated']
      });

      expect(result).to.have.property('exports');
      expect(result.exports).to.have.property('mp4Narrated');

      const narratedMp4Path = result.exports.mp4Narrated;
      const stats = await fs.stat(narratedMp4Path);

      expect(stats.size).to.be.greaterThan(0);
      console.log(`      Generated Narrated MP4: ${(stats.size / 1024).toFixed(2)} KB`);
    });

    it('should generate all formats simultaneously', async function() {
      // Skip narration if say not available
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      let formats = ['gif', 'mp4'];
      try {
        await execAsync('which say');
        formats.push('mp4-narrated');
      } catch (error) {
        console.log('      Skipping mp4-narrated (say command not available)');
      }

      const builder = new GuidedOAuthBuilder({
        baseDir: path.join(__dirname, '..'),
        screenshotsDir: githubScreenshotsDir,
        outputDir: testOutputDir
      });

      const screenshotFiles = await fs.readdir(githubScreenshotsDir);
      const screenshots = screenshotFiles
        .filter(f => f.endsWith('.png'))
        .slice(0, 2)
        .map(f => path.join(githubScreenshotsDir, f));

      if (screenshots.length === 0) {
        this.skip('No screenshots found for testing');
      }

      const result = await builder.processUploadedScreenshots(screenshots, {
        provider: 'github',
        appName: 'Test App',
        exportFormats: formats
      });

      expect(result).to.have.property('exports');

      for (const format of formats) {
        const key = format === 'mp4-narrated' ? 'mp4Narrated' : format;
        expect(result.exports).to.have.property(key);

        const exportPath = result.exports[key];
        const stats = await fs.stat(exportPath);

        expect(stats.size).to.be.greaterThan(0);
        console.log(`      ${format}: ${(stats.size / 1024).toFixed(2)} KB`);
      }
    });
  });
});
