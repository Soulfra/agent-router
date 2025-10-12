/**
 * Text-to-Speech Engine
 * Converts text to speech audio using OpenAI TTS API or local alternatives
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class TTSEngine {
  constructor(options = {}) {
    this.provider = options.provider || 'openai'; // 'openai' or 'local'
    this.outputDir = options.outputDir || '/tmp/calos-tts';

    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Initialize OpenAI if using that provider
    if (this.provider === 'openai' && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Convert text to speech
   * @param {string} text - Text to convert
   * @param {object} options - TTS options
   * @returns {Promise<string>} - Path to generated audio file
   */
  async speak(text, options = {}) {
    const {
      voice = 'alloy',          // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
      model = 'tts-1',          // tts-1 or tts-1-hd
      speed = 1.0,              // 0.25 to 4.0
      format = 'mp3'            // mp3, opus, aac, flac
    } = options;

    if (this.provider === 'openai') {
      return await this.speakOpenAI(text, { voice, model, speed, format });
    } else if (this.provider === 'local') {
      return await this.speakLocal(text, options);
    } else {
      throw new Error(`Unsupported TTS provider: ${this.provider}`);
    }
  }

  /**
   * Generate speech using OpenAI TTS API
   */
  async speakOpenAI(text, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
    }

    const {
      voice = 'alloy',
      model = 'tts-1',
      speed = 1.0,
      format = 'mp3'
    } = options;

    try {
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${format}`;
      const outputPath = path.join(this.outputDir, filename);

      console.log(`🔊 Generating speech with OpenAI TTS (voice: ${voice}, model: ${model})`);

      const response = await this.openai.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
        speed: speed,
        response_format: format
      });

      // Save audio to file
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);

      console.log(`✓ Speech generated: ${outputPath}`);

      return outputPath;

    } catch (error) {
      throw new Error(`OpenAI TTS failed: ${error.message}`);
    }
  }

  /**
   * Generate speech using local TTS (piper or say command)
   */
  async speakLocal(text, options = {}) {
    const { voice = 'default', format = 'wav' } = options;

    const filename = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${format}`;
    const outputPath = path.join(this.outputDir, filename);

    try {
      // Check if piper-tts is available
      const piperAvailable = await this.checkCommand('piper');

      if (piperAvailable) {
        // Use piper-tts (high quality local TTS)
        await this.speakPiper(text, outputPath);
      } else {
        // Fallback to macOS 'say' command (if on macOS)
        await this.speakSay(text, outputPath);
      }

      console.log(`✓ Speech generated (local): ${outputPath}`);
      return outputPath;

    } catch (error) {
      throw new Error(`Local TTS failed: ${error.message}`);
    }
  }

  /**
   * Generate speech using piper-tts
   */
  async speakPiper(text, outputPath) {
    // Save text to temp file
    const textFile = outputPath.replace(/\.[^.]+$/, '.txt');
    fs.writeFileSync(textFile, text);

    try {
      // Run piper
      await execPromise(`piper --model en_US-lessac-medium --output_file "${outputPath}" < "${textFile}"`);

      // Cleanup text file
      fs.unlinkSync(textFile);
    } catch (error) {
      if (fs.existsSync(textFile)) {
        fs.unlinkSync(textFile);
      }
      throw error;
    }
  }

  /**
   * Generate speech using macOS 'say' command
   */
  async speakSay(text, outputPath) {
    // macOS 'say' command only works on macOS
    if (process.platform !== 'darwin') {
      throw new Error('macOS say command not available on this platform');
    }

    // Convert output to WAV or AIFF format
    const format = outputPath.endsWith('.wav') ? 'WAVE' : 'AIFF';

    await execPromise(`say -o "${outputPath}" --data-format=${format} "${text.replace(/"/g, '\\"')}"`);
  }

  /**
   * Convert text to base64 audio (for embedding in responses)
   */
  async speakToBase64(text, options = {}) {
    const audioPath = await this.speak(text, options);

    try {
      const audioBuffer = fs.readFileSync(audioPath);
      const base64 = audioBuffer.toString('base64');

      // Cleanup file
      fs.unlinkSync(audioPath);

      return {
        base64: base64,
        mimeType: this.getMimeType(options.format || 'mp3')
      };
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      throw error;
    }
  }

  /**
   * Stream speech (for real-time playback)
   * Returns a readable stream
   */
  async speakStream(text, options = {}) {
    if (this.provider !== 'openai') {
      throw new Error('Streaming only supported with OpenAI provider');
    }

    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const {
      voice = 'alloy',
      model = 'tts-1',
      speed = 1.0
    } = options;

    const response = await this.openai.audio.speech.create({
      model: model,
      voice: voice,
      input: text,
      speed: speed
    });

    return response.body; // Returns a readable stream
  }

  /**
   * Get MIME type for audio format
   */
  getMimeType(format) {
    const mimeTypes = {
      'mp3': 'audio/mpeg',
      'opus': 'audio/opus',
      'aac': 'audio/aac',
      'flac': 'audio/flac',
      'wav': 'audio/wav',
      'aiff': 'audio/aiff'
    };

    return mimeTypes[format] || 'audio/mpeg';
  }

  /**
   * Check if a command is available
   */
  async checkCommand(command) {
    try {
      await execPromise(`which ${command}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available voices (OpenAI)
   */
  getAvailableVoices() {
    if (this.provider === 'openai') {
      return [
        { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
        { id: 'echo', name: 'Echo', description: 'Male voice' },
        { id: 'fable', name: 'Fable', description: 'British accent' },
        { id: 'onyx', name: 'Onyx', description: 'Deep and resonant' },
        { id: 'nova', name: 'Nova', description: 'Energetic female voice' },
        { id: 'shimmer', name: 'Shimmer', description: 'Soft and warm' }
      ];
    } else {
      return [
        { id: 'default', name: 'Default', description: 'System default voice' }
      ];
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    if (this.provider === 'openai') {
      return ['mp3', 'opus', 'aac', 'flac'];
    } else {
      return ['wav', 'aiff'];
    }
  }

  /**
   * Cleanup old audio files (older than 1 hour)
   */
  async cleanup() {
    try {
      const files = fs.readdirSync(this.outputDir);
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;

      let cleaned = 0;

      files.forEach(file => {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > ONE_HOUR) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      });

      if (cleaned > 0) {
        console.log(`🗑️  Cleaned up ${cleaned} old TTS files`);
      }
    } catch (error) {
      console.error('TTS cleanup error:', error.message);
    }
  }

  /**
   * Get provider info
   */
  getInfo() {
    return {
      provider: this.provider,
      outputDir: this.outputDir,
      voices: this.getAvailableVoices(),
      formats: this.getSupportedFormats(),
      streaming: this.provider === 'openai'
    };
  }
}

module.exports = TTSEngine;

// Cleanup old files every hour
setInterval(() => {
  const tts = new TTSEngine();
  tts.cleanup();
}, 60 * 60 * 1000);
