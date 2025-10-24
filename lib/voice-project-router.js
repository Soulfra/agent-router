/**
 * Voice Project Router
 *
 * Routes voice transcriptions to the correct project context.
 * Detects project intent from keywords and tags appropriately.
 *
 * Flow:
 * 1. Receive audio buffer + user context
 * 2. Transcribe with Whisper
 * 3. Detect project from keywords/brand mentions
 * 4. Calculate confidence score
 * 5. Store transcription with project linkage
 * 6. Return structured data for pipeline/export
 */

const VoiceTranscriber = require('../agents/voice-transcriber');
const { v4: uuidv4 } = require('uuid');

class VoiceProjectRouter {
  constructor(db, config = {}) {
    this.db = db;
    this.transcriber = new VoiceTranscriber();

    // Configuration
    this.config = {
      minConfidence: config.minConfidence || 0.6,
      autoDetectProject: config.autoDetectProject !== false,
      defaultLanguage: config.defaultLanguage || 'en',
      storageDir: config.storageDir || '/tmp/voice-uploads'
    };

    // Project cache (loaded from DB)
    this.projectCache = new Map();
    this.keywordIndex = new Map(); // keyword -> [project_ids]

    // Stats
    this.stats = {
      transcriptions: 0,
      detections: 0,
      failures: 0,
      avgConfidence: 0
    };
  }

  /**
   * Initialize: Load project keywords into memory
   */
  async initialize() {
    try {
      console.log('[VoiceProjectRouter] Loading project contexts...');

      const result = await this.db.query(`
        SELECT project_id, project_slug, project_name, brand_name,
               keywords, brand_color, status
        FROM project_contexts
        WHERE status = 'active'
      `);

      for (const row of result.rows) {
        this.projectCache.set(row.project_slug, {
          project_id: row.project_id,
          project_slug: row.project_slug,
          project_name: row.project_name,
          brand_name: row.brand_name,
          keywords: row.keywords || [],
          brand_color: row.brand_color
        });

        // Build keyword index
        for (const keyword of (row.keywords || [])) {
          const lowerKeyword = keyword.toLowerCase();
          if (!this.keywordIndex.has(lowerKeyword)) {
            this.keywordIndex.set(lowerKeyword, []);
          }
          this.keywordIndex.get(lowerKeyword).push(row.project_slug);
        }
      }

      console.log(`[VoiceProjectRouter] Loaded ${this.projectCache.size} projects with ${this.keywordIndex.size} keywords`);

      // Initialize transcriber
      await this.transcriber.initialize();

    } catch (error) {
      console.error('[VoiceProjectRouter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Process voice recording and route to project
   *
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Transcription result with project context
   */
  async processVoice(options) {
    const {
      audioBuffer,
      audioFormat = 'webm',
      userId,
      sessionId,
      tenantId,
      sourceDevice = 'unknown',
      sourceIp = null,
      geolocation = null,
      explicitProjectSlug = null // User can force project
    } = options;

    const startTime = Date.now();

    try {
      // 1. Transcribe audio
      console.log(`[VoiceProjectRouter] Transcribing ${audioFormat} audio (${audioBuffer.length} bytes)...`);

      const transcript = await this.transcriber.transcribe(audioBuffer, audioFormat);

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Transcription returned empty result');
      }

      console.log(`[VoiceProjectRouter] Transcription: "${transcript.substring(0, 100)}..."`);

      // 2. Detect project (unless explicitly provided)
      let detectedProjectSlug = explicitProjectSlug;
      let detectionConfidence = 1.0; // Explicit = 100% confidence
      let detectedIntent = null;
      let extractedEntities = {};

      if (!explicitProjectSlug && this.config.autoDetectProject) {
        const detection = this.detectProject(transcript);
        detectedProjectSlug = detection.projectSlug;
        detectionConfidence = detection.confidence;
        detectedIntent = detection.intent;
        extractedEntities = detection.entities;

        console.log(`[VoiceProjectRouter] Detected project: ${detectedProjectSlug || 'NONE'} (confidence: ${(detectionConfidence * 100).toFixed(1)}%)`);
      }

      // 3. Get project context
      const project = detectedProjectSlug ? this.projectCache.get(detectedProjectSlug) : null;

      // 4. Store transcription in database
      const transcriptionId = uuidv4();
      const transcriptionLatency = Date.now() - startTime;

      const insertResult = await this.db.query(`
        INSERT INTO voice_transcriptions (
          transcription_id, user_id, session_id, tenant_id,
          project_id, detected_project_slug, detection_confidence,
          audio_format, audio_size_bytes, audio_duration_seconds,
          raw_transcript, cleaned_transcript, detected_language,
          detected_intent, intent_confidence, extracted_entities,
          source_device, source_ip, geolocation,
          transcription_model, transcription_latency_ms,
          processing_status, processed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
        RETURNING transcription_id, created_at
      `, [
        transcriptionId,
        userId,
        sessionId,
        tenantId,
        project ? project.project_id : null,
        detectedProjectSlug,
        detectionConfidence,
        audioFormat,
        audioBuffer.length,
        null, // Duration (TODO: extract from audio metadata)
        transcript,
        this.cleanTranscript(transcript),
        this.config.defaultLanguage,
        detectedIntent,
        detectionConfidence, // Use same confidence for intent
        JSON.stringify(extractedEntities),
        sourceDevice,
        sourceIp,
        geolocation ? JSON.stringify(geolocation) : null,
        'whisper-base.en',
        transcriptionLatency,
        'completed'
      ]);

      // 5. Handle billing: Deduct user credits & credit agent wallet
      const VOICE_TRANSCRIPTION_COST_CENTS = 5; // $0.05 per transcription
      const AGENT_REVENUE_SHARE = 0.20; // Agent gets 20%
      const agentTokens = Math.floor(VOICE_TRANSCRIPTION_COST_CENTS * AGENT_REVENUE_SHARE);

      let billingResult = null;
      try {
        // Deduct credits from user
        const deductResult = await this.db.query(
          `SELECT deduct_credits(
            $1::uuid,
            $2::integer,
            'voice_transcription',
            $3,
            NULL,
            $4::jsonb
          ) as transaction_id`,
          [
            userId,
            VOICE_TRANSCRIPTION_COST_CENTS,
            `Voice transcription: "${transcript.substring(0, 50)}..."`,
            JSON.stringify({
              transcription_id: transcriptionId,
              audio_size_bytes: audioBuffer.length,
              project_slug: detectedProjectSlug
            })
          ]
        );

        const userTransactionId = deductResult.rows[0].transaction_id;

        // Credit agent wallet (@voice-transcriber)
        const creditResult = await this.db.query(
          `SELECT credit_agent_wallet(
            '@voice-transcriber',
            $1::integer,
            'earning',
            $2,
            $3::uuid,
            $4::uuid,
            $5::jsonb
          ) as agent_transaction_id`,
          [
            agentTokens,
            `Earned from voice transcription`,
            userId,
            userTransactionId,
            JSON.stringify({
              transcription_id: transcriptionId,
              user_paid_cents: VOICE_TRANSCRIPTION_COST_CENTS,
              agent_share_cents: agentTokens
            })
          ]
        );

        billingResult = {
          user_charged_cents: VOICE_TRANSCRIPTION_COST_CENTS,
          agent_earned_tokens: agentTokens,
          user_transaction_id: userTransactionId,
          agent_transaction_id: creditResult.rows[0].agent_transaction_id
        };

        console.log(`[VoiceProjectRouter] Billing complete: User charged $${(VOICE_TRANSCRIPTION_COST_CENTS / 100).toFixed(2)}, Agent earned ${agentTokens} tokens`);

      } catch (billingError) {
        // Non-fatal: Log but continue (user might have insufficient credits)
        console.error('[VoiceProjectRouter] Billing failed:', billingError.message);
        billingResult = {
          error: billingError.message,
          user_charged_cents: 0,
          agent_earned_tokens: 0
        };
      }

      // 6. Update stats
      this.stats.transcriptions++;
      if (detectedProjectSlug) {
        this.stats.detections++;
        this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.detections - 1) + detectionConfidence) / this.stats.detections;
      }

      // 7. Return result
      return {
        success: true,
        transcription_id: transcriptionId,
        transcript: transcript,
        cleaned_transcript: this.cleanTranscript(transcript),
        project: project ? {
          project_id: project.project_id,
          project_slug: project.project_slug,
          project_name: project.project_name,
          brand_name: project.brand_name,
          brand_color: project.brand_color
        } : null,
        detection: {
          detected_project_slug: detectedProjectSlug,
          confidence: detectionConfidence,
          intent: detectedIntent,
          entities: extractedEntities
        },
        processing: {
          latency_ms: transcriptionLatency,
          audio_size_bytes: audioBuffer.length,
          source_device: sourceDevice
        },
        billing: billingResult,
        created_at: insertResult.rows[0].created_at
      };

    } catch (error) {
      console.error('[VoiceProjectRouter] Processing failed:', error);
      this.stats.failures++;

      // Store failed transcription
      try {
        await this.db.query(`
          INSERT INTO voice_transcriptions (
            user_id, session_id, tenant_id,
            audio_format, audio_size_bytes,
            raw_transcript, processing_status, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7)
        `, [userId, sessionId, tenantId, audioFormat, audioBuffer.length, '', error.message]);
      } catch (dbError) {
        console.error('[VoiceProjectRouter] Failed to log error:', dbError);
      }

      throw error;
    }
  }

  /**
   * Detect project from transcript using keyword matching
   *
   * @param {String} transcript - Raw transcript text
   * @returns {Object} - { projectSlug, confidence, intent, entities }
   */
  detectProject(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    const words = lowerTranscript.split(/\s+/);

    // Score each project
    const projectScores = new Map();

    for (const word of words) {
      const matchingProjects = this.keywordIndex.get(word);
      if (matchingProjects) {
        for (const projectSlug of matchingProjects) {
          projectScores.set(projectSlug, (projectScores.get(projectSlug) || 0) + 1);
        }
      }
    }

    // Find best match
    let bestProject = null;
    let bestScore = 0;

    for (const [projectSlug, score] of projectScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestProject = projectSlug;
      }
    }

    // Calculate confidence (normalized by transcript length)
    const confidence = bestScore > 0 ? Math.min(1.0, bestScore / Math.sqrt(words.length)) : 0;

    // Detect intent (simple keyword matching)
    const intent = this.detectIntent(lowerTranscript);

    // Extract entities (basic implementation)
    const entities = this.extractEntities(transcript);

    return {
      projectSlug: confidence >= this.config.minConfidence ? bestProject : null,
      confidence,
      intent,
      entities
    };
  }

  /**
   * Detect user intent from transcript
   */
  detectIntent(lowerTranscript) {
    const intentPatterns = {
      'create_feature': /\b(add|create|build|make|implement|new feature)\b/,
      'bug_fix': /\b(fix|bug|error|issue|broken|problem)\b/,
      'brainstorm': /\b(idea|brainstorm|think|consider|what if|maybe)\b/,
      'explain': /\b(explain|what is|how does|tell me about|describe)\b/,
      'update': /\b(update|change|modify|improve|refactor)\b/,
      'plan': /\b(plan|roadmap|strategy|schedule|timeline)\b/,
      'question': /\b(why|how|what|when|where|who)\b/,
      'feedback': /\b(feedback|review|critique|thoughts on)\b/
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(lowerTranscript)) {
        return intent;
      }
    }

    return 'general';
  }

  /**
   * Extract named entities from transcript
   */
  extractEntities(transcript) {
    const entities = {};

    // Tech stack detection
    const techKeywords = ['react', 'vue', 'node', 'python', 'postgres', 'redis', 'aws', 'docker'];
    entities.tech_stack = techKeywords.filter(tech => transcript.toLowerCase().includes(tech));

    // Feature names (capitalized phrases)
    const capitalizedPhrases = transcript.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (capitalizedPhrases && capitalizedPhrases.length > 0) {
      entities.mentioned_features = capitalizedPhrases.slice(0, 5); // Top 5
    }

    // Numbers (for estimates, counts, etc.)
    const numbers = transcript.match(/\b\d+\b/g);
    if (numbers) {
      entities.numbers = numbers.slice(0, 3);
    }

    return entities;
  }

  /**
   * Clean transcript (remove filler words, normalize)
   */
  cleanTranscript(transcript) {
    // Remove common filler words
    const fillerWords = /\b(um|uh|like|you know|basically|actually|literally)\b/gi;
    let cleaned = transcript.replace(fillerWords, '');

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Capitalize first letter of sentences
    cleaned = cleaned.replace(/(^\w|[.!?]\s+\w)/g, match => match.toUpperCase());

    return cleaned;
  }

  /**
   * Get transcription by ID
   */
  async getTranscription(transcriptionId) {
    const result = await this.db.query(`
      SELECT
        vt.*,
        pc.project_name, pc.brand_name, pc.brand_color,
        u.username, u.email
      FROM voice_transcriptions vt
      LEFT JOIN project_contexts pc ON vt.project_id = pc.project_id
      LEFT JOIN users u ON vt.user_id = u.user_id
      WHERE vt.transcription_id = $1
    `, [transcriptionId]);

    return result.rows[0] || null;
  }

  /**
   * Get recent transcriptions for user
   */
  async getUserTranscriptions(userId, limit = 50) {
    const result = await this.db.query(`
      SELECT
        vt.transcription_id,
        vt.raw_transcript,
        vt.detected_project_slug,
        vt.detection_confidence,
        vt.detected_intent,
        vt.created_at,
        pc.project_name,
        pc.brand_name,
        pc.brand_color
      FROM voice_transcriptions vt
      LEFT JOIN project_contexts pc ON vt.project_id = pc.project_id
      WHERE vt.user_id = $1
      ORDER BY vt.created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }

  /**
   * Get transcriptions for project
   */
  async getProjectTranscriptions(projectSlug, limit = 50) {
    const result = await this.db.query(`
      SELECT
        vt.transcription_id,
        vt.user_id,
        vt.raw_transcript,
        vt.detection_confidence,
        vt.detected_intent,
        vt.created_at,
        u.username
      FROM voice_transcriptions vt
      JOIN users u ON vt.user_id = u.user_id
      WHERE vt.detected_project_slug = $1
      ORDER BY vt.created_at DESC
      LIMIT $2
    `, [projectSlug, limit]);

    return result.rows;
  }

  /**
   * Get router stats
   */
  getStats() {
    return {
      ...this.stats,
      projects_loaded: this.projectCache.size,
      keywords_indexed: this.keywordIndex.size,
      success_rate: this.stats.transcriptions > 0
        ? ((this.stats.transcriptions - this.stats.failures) / this.stats.transcriptions * 100).toFixed(1) + '%'
        : 'N/A',
      detection_rate: this.stats.transcriptions > 0
        ? ((this.stats.detections / this.stats.transcriptions) * 100).toFixed(1) + '%'
        : 'N/A',
      avg_confidence: (this.stats.avgConfidence * 100).toFixed(1) + '%'
    };
  }
}

module.exports = VoiceProjectRouter;
