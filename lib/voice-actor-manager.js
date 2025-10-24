/**
 * Voice Actor Manager
 *
 * Manages voice profiles for different personas and languages:
 * - Cal (technical, direct) - English voice
 * - Arty (creative, visual) - Spanish voice
 * - Ralph (analytical, precise) - Japanese voice
 * - Alice (activist, passionate) - German voice
 * - Bob (anti-surveillance, direct) - French voice
 *
 * Supports multiple TTS providers:
 * - ElevenLabs (best quality, voice cloning)
 * - OpenAI TTS (fast, 6 built-in voices)
 * - Playht (alternative voice cloning)
 * - Local (offline fallback)
 *
 * Features:
 * - Voice cloning: Record 5-10 minutes → clone to any language
 * - Voice modulation per language (same voice, different accent)
 * - Emotion control (neutral, excited, serious, playful)
 * - Speed/pitch control
 * - Voice sample storage
 *
 * Usage:
 *   const manager = new VoiceActorManager({ elevenLabsKey, openaiKey, db });
 *
 *   // Generate audio in Cal's voice
 *   const audioPath = await manager.generateAudio({
 *     text: 'Data brokers are destroying privacy...',
 *     persona: 'cal',
 *     language: 'es',
 *     emotion: 'serious'
 *   });
 *
 *   // Clone a voice from sample
 *   await manager.cloneVoice({
 *     persona: 'cal',
 *     samplePath: './cal-sample.mp3',
 *     name: 'Cal Real Voice'
 *   });
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { EventEmitter } = require('events');

class VoiceActorManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.outputDir = options.outputDir || '/tmp/calos-audio';

    // TTS provider keys
    this.elevenLabsKey = options.elevenLabsKey || process.env.ELEVENLABS_API_KEY;
    this.openaiKey = options.openaiKey || process.env.OPENAI_API_KEY;
    this.playhtKey = options.playhtKey || process.env.PLAYHT_API_KEY;
    this.playhtUserId = options.playhtUserId || process.env.PLAYHT_USER_ID;

    // Default provider (elevenlabs > openai > local)
    this.provider = this.elevenLabsKey ? 'elevenlabs' :
                    this.openaiKey ? 'openai' :
                    'local';

    // Voice persona configurations
    this.personas = {
      cal: {
        name: 'Cal',
        description: 'Technical but accessible, direct, no bullshit',
        personality: 'technical',
        defaultEmotion: 'neutral',
        // ElevenLabs voice IDs (set after cloning)
        elevenLabsVoiceId: null,
        // OpenAI voice fallback
        openaiVoice: 'onyx',
        // Playht voice ID
        playhtVoiceId: null
      },
      arty: {
        name: 'Arty',
        description: 'Creative, visual, inspiring designer voice',
        personality: 'creative',
        defaultEmotion: 'playful',
        elevenLabsVoiceId: null,
        openaiVoice: 'nova',
        playhtVoiceId: null
      },
      ralph: {
        name: 'Ralph',
        description: 'Analytical, precise, engineering-focused',
        personality: 'technical',
        defaultEmotion: 'serious',
        elevenLabsVoiceId: null,
        openaiVoice: 'echo',
        playhtVoiceId: null
      },
      alice: {
        name: 'Alice',
        description: 'Privacy activist, passionate, direct',
        personality: 'activist',
        defaultEmotion: 'excited',
        elevenLabsVoiceId: null,
        openaiVoice: 'shimmer',
        playhtVoiceId: null
      },
      bob: {
        name: 'Bob',
        description: 'Anti-surveillance, no-nonsense, intense',
        personality: 'activist',
        defaultEmotion: 'serious',
        elevenLabsVoiceId: null,
        openaiVoice: 'fable',
        playhtVoiceId: null
      }
    };

    // Emotion → voice settings mapping
    this.emotionSettings = {
      neutral: {
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1.0
      },
      excited: {
        stability: 0.3,
        similarityBoost: 0.85,
        speed: 1.1
      },
      serious: {
        stability: 0.7,
        similarityBoost: 0.75,
        speed: 0.95
      },
      playful: {
        stability: 0.4,
        similarityBoost: 0.8,
        speed: 1.05
      },
      calm: {
        stability: 0.8,
        similarityBoost: 0.7,
        speed: 0.9
      }
    };

    // Create output directory
    this._ensureOutputDir();

    console.log(`[VoiceActorManager] Initialized with provider: ${this.provider}`);
    console.log(`[VoiceActorManager] Available personas:`, Object.keys(this.personas));
  }

  /**
   * Generate audio for text
   */
  async generateAudio(input) {
    const {
      text,
      persona = 'cal',
      language = 'en',
      emotion = null,
      speed = null,
      outputFormat = 'mp3'
    } = input;

    if (!text) {
      throw new Error('text is required');
    }

    const personaConfig = this.personas[persona];
    if (!personaConfig) {
      throw new Error(`Unknown persona: ${persona}`);
    }

    const emotionToUse = emotion || personaConfig.defaultEmotion;
    const emotionConfig = this.emotionSettings[emotionToUse] || this.emotionSettings.neutral;

    console.log(`[VoiceActorManager] Generating audio for ${persona} (${language}, ${emotionToUse})`);

    this.emit('audio:generating', { persona, language, emotion: emotionToUse });

    try {
      let audioPath;

      if (this.provider === 'elevenlabs' && this.elevenLabsKey) {
        audioPath = await this._generateElevenLabs({
          text,
          personaConfig,
          language,
          emotionConfig,
          speed,
          outputFormat
        });
      } else if (this.provider === 'openai' && this.openaiKey) {
        audioPath = await this._generateOpenAI({
          text,
          personaConfig,
          emotionConfig,
          speed,
          outputFormat
        });
      } else {
        // Fallback to local TTS
        audioPath = await this._generateLocal({ text, outputFormat });
      }

      this.emit('audio:generated', {
        persona,
        language,
        audioPath,
        size: (await fs.stat(audioPath)).size
      });

      return audioPath;

    } catch (error) {
      console.error(`[VoiceActorManager] Generation error:`, error.message);
      this.emit('audio:error', { persona, language, error: error.message });
      throw error;
    }
  }

  /**
   * Generate using ElevenLabs (best quality)
   */
  async _generateElevenLabs(options) {
    const { text, personaConfig, language, emotionConfig, speed, outputFormat } = options;

    const voiceId = personaConfig.elevenLabsVoiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default: Bella

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const requestBody = {
      text,
      model_id: 'eleven_multilingual_v2', // Supports 29 languages
      voice_settings: {
        stability: emotionConfig.stability,
        similarity_boost: emotionConfig.similarityBoost,
        style: 0.5,
        use_speaker_boost: true
      }
    };

    try {
      const response = await axios.post(url, requestBody, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsKey
        },
        responseType: 'arraybuffer'
      });

      const filename = `${personaConfig.name.toLowerCase()}_${language}_${Date.now()}.${outputFormat}`;
      const outputPath = path.join(this.outputDir, filename);

      await fs.writeFile(outputPath, response.data);

      console.log(`[VoiceActorManager] ElevenLabs audio generated: ${outputPath}`);

      return outputPath;

    } catch (error) {
      throw new Error(`ElevenLabs TTS failed: ${error.message}`);
    }
  }

  /**
   * Generate using OpenAI TTS (fast, 6 voices)
   */
  async _generateOpenAI(options) {
    const { text, personaConfig, emotionConfig, speed, outputFormat } = options;

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: this.openaiKey });

    const speedToUse = speed || emotionConfig.speed;

    try {
      const response = await openai.audio.speech.create({
        model: 'tts-1-hd', // Higher quality
        voice: personaConfig.openaiVoice,
        input: text,
        speed: speedToUse,
        response_format: outputFormat
      });

      const filename = `${personaConfig.name.toLowerCase()}_${Date.now()}.${outputFormat}`;
      const outputPath = path.join(this.outputDir, filename);

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);

      console.log(`[VoiceActorManager] OpenAI audio generated: ${outputPath}`);

      return outputPath;

    } catch (error) {
      throw new Error(`OpenAI TTS failed: ${error.message}`);
    }
  }

  /**
   * Generate using local TTS (offline fallback)
   */
  async _generateLocal(options) {
    const { text, outputFormat } = options;

    // Use macOS `say` command or piper
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const filename = `local_${Date.now()}.${outputFormat}`;
    const outputPath = path.join(this.outputDir, filename);

    try {
      // Try macOS say command
      await execPromise(`say -o ${outputPath.replace('.mp3', '.aiff')} "${text}"`);

      // Convert to mp3 if needed
      if (outputFormat === 'mp3') {
        await execPromise(`ffmpeg -i ${outputPath.replace('.mp3', '.aiff')} ${outputPath}`);
        await fs.unlink(outputPath.replace('.mp3', '.aiff'));
      }

      console.log(`[VoiceActorManager] Local TTS generated: ${outputPath}`);

      return outputPath;

    } catch (error) {
      throw new Error(`Local TTS failed: ${error.message}`);
    }
  }

  /**
   * Clone a voice from sample audio
   */
  async cloneVoice(input) {
    const {
      persona,
      samplePath,
      name,
      description = null
    } = input;

    if (!this.elevenLabsKey) {
      throw new Error('ElevenLabs API key required for voice cloning');
    }

    const personaConfig = this.personas[persona];
    if (!personaConfig) {
      throw new Error(`Unknown persona: ${persona}`);
    }

    console.log(`[VoiceActorManager] Cloning voice for ${persona} from ${samplePath}`);

    try {
      // Read sample file
      const sampleBuffer = await fs.readFile(samplePath);

      // Upload to ElevenLabs
      const FormData = require('form-data');
      const form = new FormData();
      form.append('name', name || `${personaConfig.name} Voice`);
      form.append('files', sampleBuffer, { filename: path.basename(samplePath) });

      if (description) {
        form.append('description', description);
      }

      const response = await axios.post('https://api.elevenlabs.io/v1/voices/add', form, {
        headers: {
          ...form.getHeaders(),
          'xi-api-key': this.elevenLabsKey
        }
      });

      const voiceId = response.data.voice_id;

      // Update persona config
      personaConfig.elevenLabsVoiceId = voiceId;

      // Save to database
      if (this.db) {
        await this._saveVoiceProfile({
          persona,
          voiceId,
          provider: 'elevenlabs',
          name,
          samplePath
        });
      }

      console.log(`[VoiceActorManager] Voice cloned successfully: ${voiceId}`);

      this.emit('voice:cloned', { persona, voiceId, name });

      return { voiceId, persona, name };

    } catch (error) {
      console.error(`[VoiceActorManager] Voice cloning error:`, error.message);
      throw error;
    }
  }

  /**
   * Get voice profile from database
   */
  async getVoiceProfile(persona) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT * FROM voice_profiles
        WHERE persona = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [persona]);

      if (result.rows.length > 0) {
        const profile = result.rows[0];

        // Update persona config with voice ID
        if (this.personas[persona]) {
          if (profile.provider === 'elevenlabs') {
            this.personas[persona].elevenLabsVoiceId = profile.voice_id;
          } else if (profile.provider === 'playht') {
            this.personas[persona].playhtVoiceId = profile.voice_id;
          }
        }

        return profile;
      }
    } catch (error) {
      console.error(`[VoiceActorManager] Profile lookup error:`, error.message);
    }

    return null;
  }

  /**
   * Save voice profile to database
   */
  async _saveVoiceProfile(options) {
    const { persona, voiceId, provider, name, samplePath } = options;

    try {
      await this.db.query(`
        INSERT INTO voice_profiles (
          persona,
          voice_id,
          provider,
          name,
          sample_path,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [persona, voiceId, provider, name, samplePath]);

      console.log(`[VoiceActorManager] Voice profile saved for ${persona}`);
    } catch (error) {
      console.error(`[VoiceActorManager] Profile save error:`, error.message);
    }
  }

  /**
   * List available voices for persona
   */
  async listVoices(persona) {
    if (!this.elevenLabsKey) {
      return { provider: this.provider, voices: [] };
    }

    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.elevenLabsKey }
      });

      const voices = response.data.voices.map(v => ({
        voiceId: v.voice_id,
        name: v.name,
        description: v.description,
        category: v.category,
        labels: v.labels
      }));

      return { provider: 'elevenlabs', voices };

    } catch (error) {
      console.error(`[VoiceActorManager] List voices error:`, error.message);
      return { provider: this.provider, voices: [] };
    }
  }

  /**
   * Get audio file stats
   */
  async getAudioStats(audioPath) {
    try {
      const stats = await fs.stat(audioPath);

      // Get duration using ffprobe (if available)
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);

      try {
        const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        const duration = parseFloat(stdout);

        return {
          size: stats.size,
          duration,
          path: audioPath
        };
      } catch {
        // ffprobe not available
        return {
          size: stats.size,
          duration: null,
          path: audioPath
        };
      }
    } catch (error) {
      console.error(`[VoiceActorManager] Stats error:`, error.message);
      return null;
    }
  }

  /**
   * Ensure output directory exists
   */
  async _ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error(`[VoiceActorManager] Output dir error:`, error.message);
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return {
      elevenlabs: [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar',
        'zh', 'ja', 'hu', 'ko', 'hi', 'fi', 'sv', 'bg', 'hr', 'ro', 'uk', 'el',
        'id', 'ms', 'sk', 'ta', 'vi'
      ],
      openai: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ar', 'zh', 'ja', 'ko', 'hi'],
      local: ['en']
    };
  }

  /**
   * Calculate audio generation cost
   */
  calculateCost(characterCount, provider = null) {
    const providerToUse = provider || this.provider;

    const costs = {
      elevenlabs: 0.00018, // $0.18 per 1000 chars (Starter plan)
      openai: 0.000015,    // $0.015 per 1000 chars
      local: 0              // Free
    };

    const costPer1000 = costs[providerToUse] || 0;
    return (characterCount / 1000) * costPer1000;
  }
}

module.exports = VoiceActorManager;
