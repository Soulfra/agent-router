/**
 * Voice Transcriber Agent
 * Uses Whisper.cpp to transcribe audio files
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execPromise = promisify(exec);

// Configuration
const WHISPER_PATH = process.env.WHISPER_PATH || '/Users/matthewmauer/Desktop/whisper.cpp';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base.en';
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/voice-transcripts';

class VoiceTranscriber {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Create temp directory
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      // Check if whisper.cpp exists
      if (!fs.existsSync(WHISPER_PATH)) {
        throw new Error(`Whisper.cpp not found at ${WHISPER_PATH}`);
      }

      // Check if model exists
      const modelPath = path.join(WHISPER_PATH, 'models', `ggml-${WHISPER_MODEL}.bin`);
      if (!fs.existsSync(modelPath)) {
        console.log(`⚠️  Model ${WHISPER_MODEL} not found. Downloading...`);
        await this.downloadModel();
      }

      this.isInitialized = true;
      console.log('✓ Voice transcriber initialized');
      console.log(`   Model: ${WHISPER_MODEL}`);
      console.log(`   Path: ${WHISPER_PATH}`);

    } catch (error) {
      console.error('❌ Failed to initialize voice transcriber:', error.message);
      throw error;
    }
  }

  async downloadModel() {
    try {
      const downloadScript = path.join(WHISPER_PATH, 'models', 'download-ggml-model.sh');
      await execPromise(`bash ${downloadScript} ${WHISPER_MODEL}`);
      console.log(`✓ Model ${WHISPER_MODEL} downloaded`);
    } catch (error) {
      throw new Error(`Failed to download model: ${error.message}`);
    }
  }

  /**
   * Transcribe audio file
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} format - Audio format (webm, mp3, wav, etc.)
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribe(audioBuffer, format = 'webm') {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const transcriptId = `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const inputFile = path.join(TEMP_DIR, `${transcriptId}.${format}`);
    const wavFile = path.join(TEMP_DIR, `${transcriptId}.wav`);
    const outputFile = path.join(TEMP_DIR, `${transcriptId}.txt`);

    try {
      // Save audio buffer to file
      fs.writeFileSync(inputFile, audioBuffer);
      console.log(`📁 Saved audio: ${inputFile}`);

      // Convert to 16kHz mono WAV using ffmpeg
      console.log('🔄 Converting audio to WAV...');
      await execPromise(
        `ffmpeg -i "${inputFile}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavFile}" -y`
      );

      // Transcribe with whisper.cpp
      console.log('🎤 Transcribing with Whisper...');
      const whisperExec = path.join(WHISPER_PATH, 'main');
      const modelPath = path.join(WHISPER_PATH, 'models', `ggml-${WHISPER_MODEL}.bin`);

      const { stdout, stderr } = await execPromise(
        `"${whisperExec}" -m "${modelPath}" -f "${wavFile}" -otxt -of "${TEMP_DIR}/${transcriptId}"`
      );

      // Read transcription
      const transcription = fs.readFileSync(outputFile, 'utf8').trim();

      console.log(`✓ Transcription complete: ${transcription.length} characters`);

      // Cleanup
      this.cleanup(inputFile, wavFile, outputFile);

      return transcription;

    } catch (error) {
      console.error('❌ Transcription error:', error.message);

      // Cleanup on error
      this.cleanup(inputFile, wavFile, outputFile);

      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Transcribe from base64 encoded audio
   * @param {string} base64Audio - Base64 encoded audio
   * @param {string} format - Audio format
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeFromBase64(base64Audio, format = 'webm') {
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    return await this.transcribe(audioBuffer, format);
  }

  /**
   * Cleanup temporary files
   */
  cleanup(...files) {
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.error(`Failed to cleanup ${file}:`, error.message);
      }
    });
  }

  /**
   * Clean all temp files older than 1 hour
   */
  async cleanupOldFiles() {
    try {
      const files = fs.readdirSync(TEMP_DIR);
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > ONE_HOUR) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Cleaned up old file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  }
}

module.exports = VoiceTranscriber;

// Cleanup old files every hour
setInterval(() => {
  const transcriber = new VoiceTranscriber();
  transcriber.cleanupOldFiles();
}, 60 * 60 * 1000);
