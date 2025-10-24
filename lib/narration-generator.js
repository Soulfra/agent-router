const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

/**
 * Generates narration scripts and audio for OAuth documentation
 * Supports both macOS `say` command and OpenAI TTS API
 */
class NarrationGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'oauth-exports/narration';
    this.voice = options.voice || 'Samantha'; // macOS voice name
    this.ttsEngine = options.ttsEngine || 'macos'; // 'macos' or 'openai'
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
  }

  /**
   * Generate narration script from annotated data
   * @param {Array} annotatedData - Annotated screenshot data
   * @param {string} provider - OAuth provider
   * @returns {Array} Narration segments with timing
   */
  generateScript(annotatedData, provider) {
    const segments = [];

    // Introduction
    segments.push({
      stepNumber: 0,
      text: `This tutorial will guide you through setting up OAuth authentication for ${this.formatProviderName(provider)}.`,
      duration: 4000, // milliseconds
      isIntro: true
    });

    // Generate narration for each step
    for (const data of annotatedData) {
      const stepText = this.generateStepNarration(data, provider);

      segments.push({
        stepNumber: data.stepNumber,
        title: data.stepTitle,
        text: stepText,
        duration: this.estimateDuration(stepText),
        annotationCount: data.annotations.length
      });
    }

    // Conclusion
    segments.push({
      stepNumber: annotatedData.length + 1,
      text: `You have successfully configured OAuth for ${this.formatProviderName(provider)}. Your credentials are now stored securely and ready to use.`,
      duration: 5000,
      isOutro: true
    });

    return segments;
  }

  /**
   * Generate natural narration for a step
   * @param {Object} data - Step data with annotations
   * @param {string} provider - OAuth provider
   * @returns {string} Narration text
   */
  generateStepNarration(data, provider) {
    const { stepNumber, stepTitle, annotations } = data;

    let narration = `Step ${stepNumber}: ${stepTitle}. `;

    // Analyze annotations to generate context-aware narration
    const buttons = annotations.filter(a => a.type === 'box' && a.text && a.text.includes('Click'));
    const forms = annotations.filter(a => a.type === 'box' && a.text && a.text.includes('Fill'));
    const credentials = annotations.filter(a => a.type === 'box' && a.text && a.text.includes('Copy'));

    if (buttons.length > 0) {
      const buttonText = buttons[0].text.replace(/^Click "/, '').replace(/"$/, '');
      narration += `Click on ${buttonText}. `;
    }

    if (forms.length > 0) {
      narration += `Fill in the required form fields. `;
      if (stepNumber === 1 || stepNumber === 2) {
        narration += `Enter your application name and homepage URL. `;
      }
    }

    if (credentials.length > 0) {
      narration += `Important: Copy your Client ID and Client Secret now. You won't be able to see the secret again. `;
    }

    // Add provider-specific guidance
    if (provider === 'github' && stepNumber === 1) {
      narration += `Navigate to your GitHub account settings and select Developer settings from the left menu. `;
    }

    return narration.trim();
  }

  /**
   * Estimate narration duration based on text length
   * @param {string} text - Narration text
   * @returns {number} Estimated duration in milliseconds
   */
  estimateDuration(text) {
    // Average speaking rate: 150 words per minute = 2.5 words per second
    const words = text.split(/\s+/).length;
    const seconds = words / 2.5;
    return Math.ceil(seconds * 1000) + 500; // Add 500ms pause
  }

  /**
   * Format provider name for narration
   * @param {string} provider - Provider slug
   * @returns {string} Formatted name
   */
  formatProviderName(provider) {
    const names = {
      github: 'GitHub',
      google: 'Google',
      microsoft: 'Microsoft Azure',
      'microsoft-azure': 'Microsoft Azure'
    };
    return names[provider] || provider;
  }

  /**
   * Generate audio file from text using macOS `say` command
   * @param {string} text - Text to speak
   * @param {string} outputPath - Output audio file path
   * @returns {Promise<Object>} {success, outputPath, duration}
   */
  async generateAudioMacOS(text, outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const tempAiffPath = outputPath.replace(/\.mp3$/, '.aiff');

    try {
      // Generate AIFF using `say`
      const sayCmd = `say -v ${this.voice} -o "${tempAiffPath}" "${text.replace(/"/g, '\\"')}"`;
      await execAsync(sayCmd);

      // Convert AIFF to MP3 using ffmpeg
      const convertCmd = `ffmpeg -i "${tempAiffPath}" -codec:a libmp3lame -qscale:a 2 -y "${outputPath}"`;
      await execAsync(convertCmd);

      // Get audio duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout } = await execAsync(durationCmd);
      const duration = parseFloat(stdout.trim()) * 1000; // Convert to milliseconds

      // Clean up temp file
      await fs.unlink(tempAiffPath).catch(() => {});

      return {
        success: true,
        outputPath,
        duration
      };

    } catch (error) {
      console.error(`[Narration] macOS TTS failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate audio using OpenAI TTS API
   * @param {string} text - Text to speak
   * @param {string} outputPath - Output audio file path
   * @returns {Promise<Object>} {success, outputPath, duration}
   */
  async generateAudioOpenAI(text, outputPath) {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
          input: text,
          speed: 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS failed: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.writeFile(outputPath, Buffer.from(buffer));

      // Get audio duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout } = await execAsync(durationCmd);
      const duration = parseFloat(stdout.trim()) * 1000;

      return {
        success: true,
        outputPath,
        duration
      };

    } catch (error) {
      console.error(`[Narration] OpenAI TTS failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate complete narration for all segments
   * @param {Array} segments - Narration segments
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<Array>} Array of audio file paths with metadata
   */
  async generateAllAudio(segments, sessionId) {
    const audioFiles = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const filename = `${sessionId}-step-${segment.stepNumber}.mp3`;
      const outputPath = path.join(this.outputDir, sessionId, filename);

      console.log(`[Narration] Generating audio for step ${segment.stepNumber}...`);

      let result;
      if (this.ttsEngine === 'openai') {
        result = await this.generateAudioOpenAI(segment.text, outputPath);
      } else {
        result = await this.generateAudioMacOS(segment.text, outputPath);
      }

      audioFiles.push({
        stepNumber: segment.stepNumber,
        text: segment.text,
        audioPath: result.outputPath,
        duration: result.duration,
        estimatedDuration: segment.duration
      });

      console.log(`[Narration]   ✓ Generated: ${filename} (${(result.duration / 1000).toFixed(1)}s)`);
    }

    return audioFiles;
  }

  /**
   * Combine all audio segments into single file
   * @param {Array} audioFiles - Audio file metadata
   * @param {string} outputPath - Combined audio output path
   * @returns {Promise<Object>} {success, outputPath, duration}
   */
  async combineAudioFiles(audioFiles, outputPath) {
    console.log('[Narration] Combining audio segments...');

    // Create filelist for ffmpeg concat
    const filelistPath = path.join(this.outputDir, 'filelist.txt');
    const filelistContent = audioFiles
      .map(a => `file '${path.resolve(a.audioPath)}'`)
      .join('\n');

    await fs.writeFile(filelistPath, filelistContent);

    try {
      const combineCmd = `ffmpeg -f concat -safe 0 -i "${filelistPath}" -c copy -y "${outputPath}"`;
      await execAsync(combineCmd);

      // Get total duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout } = await execAsync(durationCmd);
      const duration = parseFloat(stdout.trim()) * 1000;

      // Clean up filelist
      await fs.unlink(filelistPath).catch(() => {});

      console.log(`[Narration] ✓ Combined narration: ${(duration / 1000).toFixed(1)}s`);

      return {
        success: true,
        outputPath,
        duration
      };

    } catch (error) {
      console.error(`[Narration] Audio combination failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = NarrationGenerator;
