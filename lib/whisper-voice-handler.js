/**
 * Whisper Voice Handler
 *
 * Handles speech-to-text transcription for voice commands.
 * Supports both OpenAI Whisper API and local Whisper installation.
 *
 * Features:
 * - Telegram voice messages
 * - Discord voice messages
 * - Direct audio file upload
 * - Automatic language detection
 * - Fallback from API to local Whisper
 *
 * Usage:
 *   const whisper = new WhisperVoiceHandler({ apiKey: '...' });
 *   const text = await whisper.transcribe(audioBuffer);
 *   // Returns: "Create a new brand called EcoTrack"
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const FormData = require('form-data');

class WhisperVoiceHandler {
  constructor(options = {}) {
    this.config = {
      openaiKey: options.openaiKey || process.env.OPENAI_API_KEY,
      model: options.model || 'whisper-1',
      language: options.language || 'en',
      useLocal: options.useLocal || false, // Use local Whisper by default if API key missing
      tempDir: options.tempDir || path.join(__dirname, '../temp/audio'),
      maxFileSizeMB: options.maxFileSizeMB || 25 // OpenAI limit
    };

    this.verbose = options.verbose || false;

    // Check if local Whisper is available
    this.localWhisperAvailable = false;
    this._checkLocalWhisper();

    console.log('[WhisperVoiceHandler] Initialized');
    console.log(`[WhisperVoiceHandler] Mode: ${this.config.useLocal || !this.config.openaiKey ? 'Local' : 'API'}`);
  }

  /**
   * Check if local Whisper CLI is installed
   */
  async _checkLocalWhisper() {
    try {
      await execPromise('which whisper');
      this.localWhisperAvailable = true;
      if (this.verbose) console.log('[WhisperVoiceHandler] Local Whisper available');
    } catch {
      this.localWhisperAvailable = false;
      if (this.verbose) console.log('[WhisperVoiceHandler] Local Whisper not found (install with: pip3 install openai-whisper)');
    }
  }

  /**
   * Transcribe audio to text
   *
   * @param {Buffer|string} audio - Audio buffer or file path
   * @param {object} options - Transcription options
   * @returns {Promise<object>} - { text, language, duration, method }
   */
  async transcribe(audio, options = {}) {
    try {
      // Determine if we're using API or local Whisper
      const useLocal = options.useLocal !== undefined ? options.useLocal :
                      (this.config.useLocal || !this.config.openaiKey);

      if (!useLocal && this.config.openaiKey) {
        return await this._transcribeWithAPI(audio, options);
      } else if (this.localWhisperAvailable) {
        return await this._transcribeWithLocal(audio, options);
      } else {
        throw new Error('No transcription method available. Install local Whisper (pip3 install openai-whisper) or set OPENAI_API_KEY');
      }

    } catch (error) {
      console.error('[WhisperVoiceHandler] Transcription error:', error.message);

      // Try fallback
      if (!options.useLocal && this.localWhisperAvailable) {
        console.log('[WhisperVoiceHandler] Falling back to local Whisper...');
        return await this._transcribeWithLocal(audio, { ...options, fallback: true });
      }

      throw error;
    }
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  async _transcribeWithAPI(audio, options) {
    if (!this.config.openaiKey) {
      throw new Error('OpenAI API key required for API transcription');
    }

    const startTime = Date.now();

    // Ensure audio is saved to file
    const audioPath = typeof audio === 'string' ? audio : await this._saveAudioToTemp(audio);

    // Check file size
    const stats = await fs.stat(audioPath);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > this.config.maxFileSizeMB) {
      throw new Error(`Audio file too large: ${sizeMB.toFixed(2)}MB (max ${this.config.maxFileSizeMB}MB)`);
    }

    // Create form data
    const form = new FormData();
    form.append('file', await fs.readFile(audioPath), {
      filename: path.basename(audioPath),
      contentType: 'audio/mpeg'
    });
    form.append('model', this.config.model);
    if (options.language || this.config.language) {
      form.append('language', options.language || this.config.language);
    }

    // Send to OpenAI
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${this.config.openaiKey}`
      }
    });

    const duration = Date.now() - startTime;

    // Clean up temp file if we created it
    if (typeof audio !== 'string') {
      await fs.unlink(audioPath).catch(() => {});
    }

    return {
      text: response.data.text,
      language: response.data.language || this.config.language,
      duration,
      method: 'openai-api'
    };
  }

  /**
   * Transcribe using local Whisper CLI
   */
  async _transcribeWithLocal(audio, options) {
    if (!this.localWhisperAvailable) {
      throw new Error('Local Whisper not installed. Run: pip3 install openai-whisper');
    }

    const startTime = Date.now();

    // Ensure audio is saved to file
    const audioPath = typeof audio === 'string' ? audio : await this._saveAudioToTemp(audio);

    // Run Whisper CLI
    const model = options.model || 'base'; // base, small, medium, large
    const language = options.language || this.config.language;

    const command = `whisper "${audioPath}" --model ${model} --language ${language} --output_format txt --output_dir ${this.config.tempDir}`;

    if (this.verbose) console.log('[WhisperVoiceHandler] Running:', command);

    const { stdout, stderr } = await execPromise(command);

    // Read output text file
    const baseName = path.basename(audioPath, path.extname(audioPath));
    const txtPath = path.join(this.config.tempDir, `${baseName}.txt`);
    const text = await fs.readFile(txtPath, 'utf8');

    const duration = Date.now() - startTime;

    // Clean up temp files
    if (typeof audio !== 'string') {
      await fs.unlink(audioPath).catch(() => {});
    }
    await fs.unlink(txtPath).catch(() => {});

    return {
      text: text.trim(),
      language,
      duration,
      method: 'local-whisper',
      model
    };
  }

  /**
   * Save audio buffer to temporary file
   */
  async _saveAudioToTemp(audioBuffer) {
    // Ensure temp directory exists
    await fs.mkdir(this.config.tempDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `voice_${timestamp}.mp3`;
    const filepath = path.join(this.config.tempDir, filename);

    // Write buffer to file
    await fs.writeFile(filepath, audioBuffer);

    return filepath;
  }

  /**
   * Transcribe Telegram voice message
   */
  async transcribeTelegramVoice(bot, voiceMessage) {
    try {
      // Download voice message
      const file = await bot.getFile(voiceMessage.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);

      // Transcribe
      const result = await this.transcribe(audioBuffer);

      return result;

    } catch (error) {
      console.error('[WhisperVoiceHandler] Telegram transcription error:', error);
      throw error;
    }
  }

  /**
   * Transcribe Discord voice message
   */
  async transcribeDiscordVoice(attachment) {
    try {
      // Download attachment
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);

      // Transcribe
      const result = await this.transcribe(audioBuffer);

      return result;

    } catch (error) {
      console.error('[WhisperVoiceHandler] Discord transcription error:', error);
      throw error;
    }
  }

  /**
   * Convert speech to command
   * Handles voice commands like "Create brand X" or "Deploy Y"
   */
  async voiceToCommand(audio) {
    const result = await this.transcribe(audio);

    // Parse command from text
    const text = result.text.toLowerCase().trim();

    // Detect command type
    const command = this._parseCommand(text);

    return {
      ...result,
      command
    };
  }

  /**
   * Parse voice text into structured command
   */
  _parseCommand(text) {
    // Brand creation: "create a new brand called X"
    const createBrandMatch = text.match(/create (?:a )?(?:new )?brand (?:called |named )?([a-z0-9\s]+?)(?:\s+for\s+(.+))?$/i);
    if (createBrandMatch) {
      return {
        type: 'create_brand',
        name: createBrandMatch[1].trim(),
        description: createBrandMatch[2] ? createBrandMatch[2].trim() : null
      };
    }

    // Deployment: "deploy X"
    const deployMatch = text.match(/deploy\s+([a-z0-9\s]+)/i);
    if (deployMatch) {
      return {
        type: 'deploy',
        target: deployMatch[1].trim()
      };
    }

    // Feature addition: "add X to Y"
    const addFeatureMatch = text.match(/add\s+(.+?)\s+to\s+([a-z0-9\s]+)/i);
    if (addFeatureMatch) {
      return {
        type: 'add_feature',
        feature: addFeatureMatch[1].trim(),
        brand: addFeatureMatch[2].trim()
      };
    }

    // Status check: "status of X"
    const statusMatch = text.match(/(?:status|check)\s+(?:of\s+)?([a-z0-9\s]+)/i);
    if (statusMatch) {
      return {
        type: 'status',
        target: statusMatch[1].trim()
      };
    }

    // Generic command
    return {
      type: 'unknown',
      rawText: text
    };
  }

  /**
   * Get status/diagnostics
   */
  getStatus() {
    return {
      apiAvailable: !!this.config.openaiKey,
      localAvailable: this.localWhisperAvailable,
      mode: this.config.useLocal || !this.config.openaiKey ? 'local' : 'api',
      tempDir: this.config.tempDir
    };
  }
}

module.exports = WhisperVoiceHandler;
