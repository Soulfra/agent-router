const fs = require('fs').promises;
const path = require('path');
const ScreenshotOCR = require('./screenshot-ocr');
const AutoAnnotator = require('./auto-annotator');
const ScreenshotAnnotator = require('./screenshot-annotator');
const DocVideoRecorder = require('./doc-video-recorder');
const NarrationGenerator = require('./narration-generator');
const CursorAnimator = require('./cursor-animator');
const Keyring = require('./keyring');

/**
 * Orchestrates the full OAuth documentation pipeline:
 * 1. OCR screenshots to extract credentials
 * 2. Store credentials in keyring
 * 3. Auto-generate annotations
 * 4. Create annotated screenshots
 * 5. Generate GIF/video tutorial
 * 6. Update .env file
 */
class GuidedOAuthBuilder {
  constructor(options = {}) {
    this.ocr = new ScreenshotOCR();
    this.autoAnnotator = new AutoAnnotator();
    this.annotator = new ScreenshotAnnotator();
    this.narrationGenerator = new NarrationGenerator(options);
    this.cursorAnimator = new CursorAnimator(options);
    this.keyring = new Keyring();

    this.baseDir = options.baseDir || path.join(__dirname, '..');
    this.screenshotsDir = options.screenshotsDir || path.join(this.baseDir, 'oauth-screenshots');
    this.outputDir = options.outputDir || path.join(this.baseDir, 'oauth-exports');
    this.exportFormats = options.exportFormats || ['gif']; // gif, mp4, mp4-narrated, pptx
    this.enableCursorAnimation = options.enableCursorAnimation !== false; // Default: enabled
  }

  /**
   * Process uploaded screenshots for OAuth app setup
   * @param {Array} screenshotPaths - Array of screenshot file paths
   * @param {Object} metadata - {provider, appName, stepTitles}
   * @returns {Promise<Object>} {credentials, gifPath, annotatedScreenshots}
   */
  async processUploadedScreenshots(screenshotPaths, metadata = {}) {
    const {
      provider = 'github',
      appName = 'Soulfra Platform',
      stepTitles = []
    } = metadata;

    console.log(`[GuidedOAuthBuilder] Processing ${screenshotPaths.length} screenshots for ${provider}`);

    // Step 1: Extract credentials from all screenshots
    const extractedCredentials = await this.extractCredentialsFromScreenshots(screenshotPaths, provider);

    // Step 2: Store credentials in keyring
    if (extractedCredentials.clientId && extractedCredentials.clientSecret) {
      await this.storeCredentialsInKeyring(provider, extractedCredentials, appName);
    }

    // Step 3: Auto-generate annotations for each screenshot
    const annotatedData = await this.autoAnnotator.generateTutorialAnnotations(
      screenshotPaths,
      stepTitles
    );

    // Step 4: Create annotated screenshots
    let annotatedScreenshots = await this.createAnnotatedScreenshots(annotatedData, provider);

    // Step 4.5: Add cursor animations (if enabled)
    annotatedScreenshots = await this.addCursorAnimations(annotatedScreenshots, annotatedData, provider);

    // Step 5: Generate exports in requested formats
    const exports = await this.generateExports(annotatedScreenshots, annotatedData, provider, metadata.exportFormats);

    // Step 6: Update .env file
    if (extractedCredentials.clientId && extractedCredentials.clientSecret) {
      await this.updateEnvFile(provider, extractedCredentials);
    }

    console.log(`[GuidedOAuthBuilder] ✅ Complete!`);

    return {
      credentials: extractedCredentials,
      exports,
      annotatedScreenshots,
      provider
    };
  }

  /**
   * Extract credentials from multiple screenshots
   * @param {Array} screenshotPaths - Screenshot paths
   * @param {string} provider - OAuth provider
   * @returns {Promise<Object>} Combined credentials
   */
  async extractCredentialsFromScreenshots(screenshotPaths, provider) {
    const allCredentials = {
      clientId: null,
      clientSecret: null,
      provider: provider
    };

    console.log('[GuidedOAuthBuilder] Extracting credentials via OCR...');

    for (const screenshotPath of screenshotPaths) {
      const text = await this.ocr.extractText(screenshotPath);
      const credentials = await this.ocr.findCredentials(text);

      // Merge credentials (first found wins)
      if (credentials.clientId && !allCredentials.clientId) {
        allCredentials.clientId = credentials.clientId;
        console.log(`[GuidedOAuthBuilder] ✓ Found Client ID in ${path.basename(screenshotPath)}`);
      }

      if (credentials.clientSecret && !allCredentials.clientSecret) {
        allCredentials.clientSecret = credentials.clientSecret;
        console.log(`[GuidedOAuthBuilder] ✓ Found Client Secret in ${path.basename(screenshotPath)}`);
      }
    }

    if (!allCredentials.clientId || !allCredentials.clientSecret) {
      console.warn('[GuidedOAuthBuilder] ⚠️  Could not extract all credentials');
      console.warn(`  Client ID: ${allCredentials.clientId ? '✓' : '✗'}`);
      console.warn(`  Client Secret: ${allCredentials.clientSecret ? '✓' : '✗'}`);
    } else {
      console.log('[GuidedOAuthBuilder] ✓ Successfully extracted all credentials');
    }

    return allCredentials;
  }

  /**
   * Store extracted credentials in keyring
   * @param {string} provider - OAuth provider
   * @param {Object} credentials - Credentials to store
   * @param {string} appName - Application name
   */
  async storeCredentialsInKeyring(provider, credentials, appName) {
    console.log(`[GuidedOAuthBuilder] Storing ${provider} credentials in keyring...`);

    const keyPrefix = `oauth_${provider}_${appName.toLowerCase().replace(/\s+/g, '_')}`;

    try {
      // Store client ID
      await this.keyring.set(
        `${keyPrefix}_client_id`,
        credentials.clientId,
        { service: 'calos-oauth', account: `${provider}-client-id` }
      );

      // Store client secret
      await this.keyring.set(
        `${keyPrefix}_client_secret`,
        credentials.clientSecret,
        { service: 'calos-oauth', account: `${provider}-client-secret` }
      );

      console.log('[GuidedOAuthBuilder] ✓ Credentials stored in keyring');
    } catch (error) {
      console.error('[GuidedOAuthBuilder] Failed to store credentials:', error.message);
      throw error;
    }
  }

  /**
   * Create annotated versions of screenshots
   * @param {Array} annotatedData - Data from auto-annotator
   * @param {string} provider - OAuth provider
   * @returns {Promise<Array>} Paths to annotated screenshots
   */
  async createAnnotatedScreenshots(annotatedData, provider) {
    console.log('[GuidedOAuthBuilder] Creating annotated screenshots...');

    const annotatedPaths = [];
    const providerDir = path.join(this.outputDir, provider);

    // Ensure output directory exists
    await fs.mkdir(providerDir, { recursive: true });

    for (const data of annotatedData) {
      const outputPath = path.join(
        providerDir,
        `annotated-step-${data.stepNumber}.png`
      );

      // Create annotated screenshot
      await this.annotator.annotate(
        data.path,
        data.annotations,
        outputPath
      );

      annotatedPaths.push({
        path: outputPath,
        stepNumber: data.stepNumber,
        title: data.stepTitle
      });

      console.log(`[GuidedOAuthBuilder]   ✓ Step ${data.stepNumber}: ${data.stepTitle}`);
    }

    return annotatedPaths;
  }

  /**
   * Add cursor animations to annotated screenshots
   * @param {Array} annotatedScreenshots - Annotated screenshot data
   * @param {Array} annotatedData - Original annotated data with annotations
   * @param {string} provider - OAuth provider
   * @returns {Promise<Array>} Paths to screenshots with cursor overlays
   */
  async addCursorAnimations(annotatedScreenshots, annotatedData, provider) {
    if (!this.enableCursorAnimation) {
      console.log('[GuidedOAuthBuilder] Cursor animation disabled, skipping...');
      return annotatedScreenshots;
    }

    console.log('[GuidedOAuthBuilder] Adding cursor animations...');

    const cursorDir = path.join(this.outputDir, provider, 'cursor');
    await fs.mkdir(cursorDir, { recursive: true });

    // Generate cursor keyframes from annotations
    const keyframes = this.cursorAnimator.generateKeyframesFromSteps(annotatedData);

    console.log(`[GuidedOAuthBuilder]   Generated ${keyframes.length} cursor keyframes`);

    // Generate cursor frames (one per screenshot)
    const cursorFrames = this.cursorAnimator.generateCursorFrames(
      keyframes,
      annotatedScreenshots.length
    );

    // Add cursor overlay to each screenshot
    const framePaths = annotatedScreenshots.map(s => s.path);
    const cursorOverlayPaths = await this.cursorAnimator.addCursorToFrames(
      framePaths,
      cursorFrames,
      cursorDir
    );

    // Return updated screenshot data with cursor-enhanced paths
    return annotatedScreenshots.map((screenshot, index) => ({
      ...screenshot,
      path: cursorOverlayPaths[index],
      originalPath: screenshot.path // Keep reference to non-cursor version
    }));
  }

  /**
   * Generate GIF from annotated screenshots
   * @param {Array} annotatedScreenshots - Annotated screenshot data
   * @param {string} provider - OAuth provider
   * @returns {Promise<string>} Path to generated GIF
   */
  async generateGIF(annotatedScreenshots, provider) {
    console.log('[GuidedOAuthBuilder] Generating GIF...');

    const recorder = new DocVideoRecorder({
      screenshotsDir: this.outputDir,
      outputDir: this.outputDir
    });

    // Populate screenshots array directly
    recorder.screenshots = annotatedScreenshots.map(screenshot => ({
      path: screenshot.path,
      frameNumber: screenshot.stepNumber,
      timestamp: screenshot.stepNumber * 2000 // 2 seconds per step
    }));

    // Generate GIF
    const gifPath = path.join(this.outputDir, `${provider}-oauth-tutorial.gif`);
    await recorder.convertToGIF(gifPath, { fps: 0.5, maxWidth: 1400 });

    console.log(`[GuidedOAuthBuilder] ✓ GIF saved to: ${gifPath}`);

    return gifPath;
  }

  /**
   * Generate exports in multiple formats
   * @param {Array} annotatedScreenshots - Annotated screenshot data
   * @param {Array} annotatedData - Original annotated data with annotations
   * @param {string} provider - OAuth provider
   * @param {Array} formats - Export formats ['gif', 'mp4', 'mp4-narrated', 'pptx']
   * @returns {Promise<Object>} Paths to generated exports
   */
  async generateExports(annotatedScreenshots, annotatedData, provider, formats = ['gif']) {
    const exports = {};
    const sessionId = `${provider}-${Date.now()}`;

    // Generate narration if needed
    let narrationAudio = null;
    if (formats.includes('mp4-narrated')) {
      console.log('[GuidedOAuthBuilder] Generating narration...');
      const narrationScript = this.narrationGenerator.generateScript(annotatedData, provider);
      const audioFiles = await this.narrationGenerator.generateAllAudio(narrationScript, sessionId);
      const combinedAudioPath = path.join(this.outputDir, `${provider}-narration.mp3`);
      const result = await this.narrationGenerator.combineAudioFiles(audioFiles, combinedAudioPath);
      narrationAudio = result.outputPath;
      console.log('[GuidedOAuthBuilder] ✓ Narration generated');
    }

    // Generate GIF
    if (formats.includes('gif')) {
      const gifPath = await this.generateGIF(annotatedScreenshots, provider);
      exports.gif = gifPath;
    }

    // Generate MP4 (silent)
    if (formats.includes('mp4')) {
      console.log('[GuidedOAuthBuilder] Generating MP4...');
      const recorder = new DocVideoRecorder({
        screenshotsDir: this.outputDir,
        outputDir: this.outputDir
      });

      recorder.screenshots = annotatedScreenshots.map(screenshot => ({
        path: screenshot.path,
        frameNumber: screenshot.stepNumber,
        timestamp: screenshot.stepNumber * 2000
      }));

      const mp4Path = path.join(this.outputDir, `${provider}-oauth-tutorial.mp4`);
      await recorder.convertToVideo(mp4Path, { fps: 0.5, maxWidth: 1400 });
      exports.mp4 = mp4Path;
      console.log('[GuidedOAuthBuilder] ✓ MP4 saved');
    }

    // Generate MP4 with narration
    if (formats.includes('mp4-narrated') && narrationAudio) {
      console.log('[GuidedOAuthBuilder] Generating narrated MP4...');
      const recorder = new DocVideoRecorder({
        screenshotsDir: this.outputDir,
        outputDir: this.outputDir
      });

      recorder.screenshots = annotatedScreenshots.map(screenshot => ({
        path: screenshot.path,
        frameNumber: screenshot.stepNumber,
        timestamp: screenshot.stepNumber * 2000
      }));

      const narratedMp4Path = path.join(this.outputDir, `${provider}-oauth-tutorial-narrated.mp4`);
      await recorder.convertToNarratedVideo(narratedMp4Path, narrationAudio, { fps: 0.5, maxWidth: 1400 });
      exports.mp4Narrated = narratedMp4Path;
      console.log('[GuidedOAuthBuilder] ✓ Narrated MP4 saved');
    }

    // Generate PowerPoint
    if (formats.includes('pptx')) {
      console.log('[GuidedOAuthBuilder] PowerPoint export not yet implemented');
      // TODO: Implement PowerPoint export
    }

    return exports;
  }

  /**
   * Update .env file with extracted credentials
   * @param {string} provider - OAuth provider
   * @param {Object} credentials - Credentials to add
   */
  async updateEnvFile(provider, credentials) {
    console.log('[GuidedOAuthBuilder] Updating .env file...');

    const envPath = path.join(this.baseDir, '.env');

    try {
      // Read existing .env
      let envContent = '';
      try {
        envContent = await fs.readFile(envPath, 'utf-8');
      } catch (error) {
        console.log('[GuidedOAuthBuilder] .env file not found, creating new one');
      }

      // Prepare new env variables
      const providerUpper = provider.toUpperCase();
      const clientIdKey = `${providerUpper}_CLIENT_ID`;
      const clientSecretKey = `${providerUpper}_CLIENT_SECRET`;

      // Check if variables already exist
      const clientIdRegex = new RegExp(`^${clientIdKey}=.*$`, 'm');
      const clientSecretRegex = new RegExp(`^${clientSecretKey}=.*$`, 'm');

      if (clientIdRegex.test(envContent)) {
        // Update existing
        envContent = envContent.replace(clientIdRegex, `${clientIdKey}=${credentials.clientId}`);
      } else {
        // Add new
        envContent += `\n${clientIdKey}=${credentials.clientId}`;
      }

      if (clientSecretRegex.test(envContent)) {
        // Update existing
        envContent = envContent.replace(clientSecretRegex, `${clientSecretKey}=${credentials.clientSecret}`);
      } else {
        // Add new
        envContent += `\n${clientSecretKey}=${credentials.clientSecret}`;
      }

      // Write back to .env
      await fs.writeFile(envPath, envContent.trim() + '\n');

      console.log('[GuidedOAuthBuilder] ✓ .env file updated');
      console.log(`  ${clientIdKey}=${credentials.clientId}`);
      console.log(`  ${clientSecretKey}=${'*'.repeat(20)}`);
    } catch (error) {
      console.error('[GuidedOAuthBuilder] Failed to update .env:', error.message);
      // Don't throw - credentials are already in keyring
    }
  }

  /**
   * Retrieve credentials from keyring for a provider
   * @param {string} provider - OAuth provider
   * @param {string} appName - Application name
   * @returns {Promise<Object>} {clientId, clientSecret}
   */
  async getStoredCredentials(provider, appName = 'Soulfra Platform') {
    const keyPrefix = `oauth_${provider}_${appName.toLowerCase().replace(/\s+/g, '_')}`;

    try {
      const clientId = await this.keyring.get(`${keyPrefix}_client_id`);
      const clientSecret = await this.keyring.get(`${keyPrefix}_client_secret`);

      return {
        clientId: clientId?.value || null,
        clientSecret: clientSecret?.value || null,
        provider
      };
    } catch (error) {
      console.error(`[GuidedOAuthBuilder] Failed to retrieve credentials for ${provider}:`, error.message);
      return { clientId: null, clientSecret: null, provider };
    }
  }

  /**
   * Process a directory of screenshots (auto-detect provider)
   * @param {string} screenshotDir - Directory containing screenshots
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processDirectory(screenshotDir, options = {}) {
    console.log(`[GuidedOAuthBuilder] Processing directory: ${screenshotDir}`);

    // Read all PNG/JPG files from directory
    const files = await fs.readdir(screenshotDir);
    const screenshotFiles = files
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .filter(f => f !== 'palette.png') // Skip palette file
      .sort() // Alphabetical order
      .map(f => path.join(screenshotDir, f));

    if (screenshotFiles.length === 0) {
      throw new Error(`No screenshots found in ${screenshotDir}`);
    }

    console.log(`[GuidedOAuthBuilder] Found ${screenshotFiles.length} screenshots`);

    // Auto-detect provider from first screenshot
    const firstText = await this.ocr.extractText(screenshotFiles[0]);
    let provider = options.provider;

    if (!provider) {
      if (/github/i.test(firstText)) {
        provider = 'github';
      } else if (/google|oauth.*2\.0/i.test(firstText)) {
        provider = 'google';
      } else if (/microsoft|azure/i.test(firstText)) {
        provider = 'microsoft';
      } else {
        provider = 'unknown';
      }

      console.log(`[GuidedOAuthBuilder] Auto-detected provider: ${provider}`);
    }

    return await this.processUploadedScreenshots(screenshotFiles, {
      provider,
      appName: options.appName || 'Soulfra Platform',
      stepTitles: options.stepTitles || []
    });
  }
}

module.exports = GuidedOAuthBuilder;
