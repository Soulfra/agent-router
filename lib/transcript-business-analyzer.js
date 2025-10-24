/**
 * Transcript Business Analyzer
 *
 * NotebookLM-style document processor that turns transcripts/audio into actionable business projects.
 *
 * Features:
 * - Upload audio files (transcribe via OpenAI Whisper)
 * - Upload text transcripts
 * - AI analysis: Extract business opportunities, revenue models, action items
 * - Generate structured project data
 * - Integration with Stripe (products/prices), QuickBooks (accounts), POS
 *
 * Privacy:
 * - User owns all uploaded content
 * - Can export/delete transcripts anytime
 * - AI analysis happens server-side (encrypted in transit)
 *
 * Revenue Model:
 * - Free tier: 5 transcripts/month
 * - Pro tier: Unlimited transcripts + QuickBooks sync ($29/month)
 * - Enterprise: API access + custom models ($99/month)
 */

const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class TranscriptBusinessAnalyzer {
  constructor(config = {}) {
    this.db = config.db;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // AI model configuration
    this.transcriptionModel = 'whisper-1';
    this.analysisModel = 'gpt-4o'; // Use gpt-4o for business analysis

    // Storage paths
    this.uploadDir = config.uploadDir || '/tmp/transcript-uploads';
    this.maxFileSize = config.maxFileSize || 25 * 1024 * 1024; // 25MB (Whisper limit)

    if (!this.db) {
      throw new Error('Database connection required');
    }
  }

  // ============================================================================
  // TRANSCRIPT UPLOAD & TRANSCRIPTION
  // ============================================================================

  /**
   * Upload and transcribe audio file
   *
   * @param {string} userId - User ID
   * @param {string} filePath - Path to audio file
   * @param {object} metadata - Optional metadata (title, description)
   * @returns {Promise<object>} - Transcript data
   */
  async uploadAudio(userId, filePath, metadata = {}) {
    try {
      // Validate file size
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large. Max size: ${this.maxFileSize / 1024 / 1024}MB`);
      }

      // Check user's transcript quota
      await this.checkQuota(userId);

      console.log('[TranscriptAnalyzer] Transcribing audio via OpenAI Whisper...');

      // Transcribe via Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: await fs.readFile(filePath).then(buffer => new File([buffer], path.basename(filePath))),
        model: this.transcriptionModel,
        language: metadata.language || 'en',
        response_format: 'verbose_json'
      });

      const transcriptId = `transcript_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Save transcript to database
      const result = await this.db.query(`
        INSERT INTO business_transcripts (
          transcript_id,
          user_id,
          title,
          description,
          transcript_text,
          language,
          duration_seconds,
          word_count,
          source_type,
          source_metadata,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        transcriptId,
        userId,
        metadata.title || `Transcript ${new Date().toLocaleDateString()}`,
        metadata.description || null,
        transcription.text,
        transcription.language,
        transcription.duration,
        transcription.text.split(/\s+/).length,
        'audio',
        JSON.stringify({
          filename: path.basename(filePath),
          segments: transcription.segments?.length || 0
        }),
        'pending_analysis'
      ]);

      // Delete uploaded file (privacy - don't store audio)
      await fs.unlink(filePath).catch(() => {});

      console.log(`[TranscriptAnalyzer] Transcript created: ${transcriptId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[TranscriptAnalyzer] Upload audio error:', error.message);
      throw error;
    }
  }

  /**
   * Upload text transcript
   *
   * @param {string} userId - User ID
   * @param {string} text - Transcript text
   * @param {object} metadata - Optional metadata
   * @returns {Promise<object>} - Transcript data
   */
  async uploadText(userId, text, metadata = {}) {
    try {
      // Check quota
      await this.checkQuota(userId);

      const transcriptId = `transcript_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const wordCount = text.split(/\s+/).length;

      // Save transcript
      const result = await this.db.query(`
        INSERT INTO business_transcripts (
          transcript_id,
          user_id,
          title,
          description,
          transcript_text,
          word_count,
          source_type,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        transcriptId,
        userId,
        metadata.title || `Transcript ${new Date().toLocaleDateString()}`,
        metadata.description || null,
        text,
        wordCount,
        'text',
        'pending_analysis'
      ]);

      console.log(`[TranscriptAnalyzer] Text transcript created: ${transcriptId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[TranscriptAnalyzer] Upload text error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // BUSINESS ANALYSIS (AI-Powered)
  // ============================================================================

  /**
   * Analyze transcript for business opportunities
   *
   * @param {string} transcriptId - Transcript ID
   * @returns {Promise<object>} - Analysis results
   */
  async analyzeTranscript(transcriptId) {
    try {
      // Get transcript
      const transcriptResult = await this.db.query(`
        SELECT * FROM business_transcripts
        WHERE transcript_id = $1
      `, [transcriptId]);

      if (transcriptResult.rows.length === 0) {
        throw new Error('Transcript not found');
      }

      const transcript = transcriptResult.rows[0];

      console.log('[TranscriptAnalyzer] Analyzing transcript for business opportunities...');

      // AI prompt for business analysis
      const systemPrompt = `You are a business analyst AI. Analyze the following transcript and extract:

1. **Business Opportunities**: What products/services can be built from this content?
2. **Revenue Models**: How can this be monetized? (subscriptions, one-time, licensing, etc.)
3. **Target Market**: Who would pay for this? (demographics, industries, pain points)
4. **Action Items**: Concrete next steps to turn this into a business
5. **Resource Requirements**: What's needed? (tech stack, team, budget)
6. **Competitive Landscape**: Similar products/services that exist
7. **Unique Value Proposition**: What makes this different?

Return a structured JSON response with these sections.`;

      const userPrompt = `Analyze this transcript for business opportunities:\n\n${transcript.transcript_text}`;

      // Call OpenAI for analysis
      const completion = await this.openai.chat.completions.create({
        model: this.analysisModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(completion.choices[0].message.content);

      // Calculate confidence score based on analysis quality
      const confidenceScore = this.calculateConfidenceScore(analysis);

      // Save analysis
      const analysisId = `analysis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      await this.db.query(`
        INSERT INTO transcript_analyses (
          analysis_id,
          transcript_id,
          opportunities,
          revenue_models,
          target_market,
          action_items,
          resources_required,
          competitive_landscape,
          unique_value_proposition,
          confidence_score,
          analysis_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        analysisId,
        transcriptId,
        JSON.stringify(analysis.business_opportunities || []),
        JSON.stringify(analysis.revenue_models || []),
        JSON.stringify(analysis.target_market || {}),
        JSON.stringify(analysis.action_items || []),
        JSON.stringify(analysis.resource_requirements || {}),
        JSON.stringify(analysis.competitive_landscape || []),
        analysis.unique_value_proposition || '',
        confidenceScore,
        JSON.stringify({
          model: this.analysisModel,
          tokens_used: completion.usage.total_tokens
        })
      ]);

      // Update transcript status
      await this.db.query(`
        UPDATE business_transcripts
        SET status = 'analyzed',
            analyzed_at = NOW()
        WHERE transcript_id = $1
      `, [transcriptId]);

      console.log(`[TranscriptAnalyzer] Analysis complete: ${analysisId}`);

      return {
        analysisId,
        transcriptId,
        ...analysis,
        confidenceScore
      };

    } catch (error) {
      console.error('[TranscriptAnalyzer] Analyze transcript error:', error.message);

      // Update transcript with error status
      await this.db.query(`
        UPDATE business_transcripts
        SET status = 'analysis_failed',
            error_message = $1
        WHERE transcript_id = $2
      `, [error.message, transcriptId]).catch(() => {});

      throw error;
    }
  }

  /**
   * Calculate confidence score for analysis
   *
   * @param {object} analysis - AI analysis
   * @returns {number} - Confidence score (0-100)
   */
  calculateConfidenceScore(analysis) {
    let score = 0;

    // Check completeness of analysis sections
    if (analysis.business_opportunities?.length > 0) score += 20;
    if (analysis.revenue_models?.length > 0) score += 20;
    if (analysis.target_market && Object.keys(analysis.target_market).length > 0) score += 15;
    if (analysis.action_items?.length > 0) score += 15;
    if (analysis.resource_requirements && Object.keys(analysis.resource_requirements).length > 0) score += 10;
    if (analysis.competitive_landscape?.length > 0) score += 10;
    if (analysis.unique_value_proposition?.length > 50) score += 10;

    return Math.min(score, 100);
  }

  // ============================================================================
  // PROJECT GENERATION
  // ============================================================================

  /**
   * Generate business project from analysis
   *
   * @param {string} analysisId - Analysis ID
   * @param {object} options - Project generation options
   * @returns {Promise<object>} - Generated project
   */
  async generateProject(analysisId, options = {}) {
    try {
      // Get analysis
      const analysisResult = await this.db.query(`
        SELECT a.*, t.*
        FROM transcript_analyses a
        JOIN business_transcripts t ON a.transcript_id = t.transcript_id
        WHERE a.analysis_id = $1
      `, [analysisId]);

      if (analysisResult.rows.length === 0) {
        throw new Error('Analysis not found');
      }

      const analysis = analysisResult.rows[0];

      console.log('[TranscriptAnalyzer] Generating business project...');

      const projectId = `project_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Save project
      const result = await this.db.query(`
        INSERT INTO business_projects (
          project_id,
          user_id,
          transcript_id,
          analysis_id,
          project_name,
          project_description,
          revenue_model,
          target_market,
          status,
          opportunities,
          action_items,
          resources_required,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        projectId,
        analysis.user_id,
        analysis.transcript_id,
        analysisId,
        options.projectName || `Business Project ${new Date().toLocaleDateString()}`,
        analysis.unique_value_proposition,
        analysis.revenue_models,
        analysis.target_market,
        'draft',
        analysis.opportunities,
        analysis.action_items,
        analysis.resources_required,
        JSON.stringify({
          generatedAt: new Date(),
          confidenceScore: analysis.confidence_score
        })
      ]);

      console.log(`[TranscriptAnalyzer] Project generated: ${projectId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[TranscriptAnalyzer] Generate project error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // QUOTA & PERMISSIONS
  // ============================================================================

  /**
   * Check user's transcript quota
   *
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async checkQuota(userId) {
    try {
      // Get user's plan
      const userResult = await this.db.query(`
        SELECT subscription_tier
        FROM users
        WHERE user_id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const tier = userResult.rows[0].subscription_tier || 'free';

      // Get transcript count this month
      const countResult = await this.db.query(`
        SELECT COUNT(*) as count
        FROM business_transcripts
        WHERE user_id = $1
          AND created_at >= date_trunc('month', NOW())
      `, [userId]);

      const count = parseInt(countResult.rows[0].count);

      // Check quota
      const quotas = {
        free: 5,
        pro: Infinity,
        enterprise: Infinity
      };

      if (count >= quotas[tier]) {
        throw new Error(`Quota exceeded. Upgrade to Pro for unlimited transcripts.`);
      }

    } catch (error) {
      console.error('[TranscriptAnalyzer] Check quota error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // RETRIEVAL
  // ============================================================================

  /**
   * Get user's transcripts
   *
   * @param {string} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<array>} - Transcripts
   */
  async getUserTranscripts(userId, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const result = await this.db.query(`
        SELECT t.*, a.confidence_score, a.analysis_id
        FROM business_transcripts t
        LEFT JOIN transcript_analyses a ON t.transcript_id = a.transcript_id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return result.rows;

    } catch (error) {
      console.error('[TranscriptAnalyzer] Get transcripts error:', error.message);
      throw error;
    }
  }

  /**
   * Get transcript with analysis and project
   *
   * @param {string} transcriptId - Transcript ID
   * @returns {Promise<object>} - Complete transcript data
   */
  async getTranscriptComplete(transcriptId) {
    try {
      const result = await this.db.query(`
        SELECT
          t.*,
          a.analysis_id, a.opportunities, a.revenue_models,
          a.target_market, a.action_items, a.confidence_score,
          p.project_id, p.project_name, p.status as project_status
        FROM business_transcripts t
        LEFT JOIN transcript_analyses a ON t.transcript_id = a.transcript_id
        LEFT JOIN business_projects p ON a.analysis_id = p.analysis_id
        WHERE t.transcript_id = $1
      `, [transcriptId]);

      if (result.rows.length === 0) {
        throw new Error('Transcript not found');
      }

      return result.rows[0];

    } catch (error) {
      console.error('[TranscriptAnalyzer] Get transcript complete error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // EXPORT & DELETION
  // ============================================================================

  /**
   * Export transcript and analysis
   *
   * @param {string} transcriptId - Transcript ID
   * @returns {Promise<object>} - Export data
   */
  async exportTranscript(transcriptId) {
    try {
      const data = await this.getTranscriptComplete(transcriptId);

      return {
        transcript: {
          id: data.transcript_id,
          title: data.title,
          text: data.transcript_text,
          createdAt: data.created_at
        },
        analysis: data.analysis_id ? {
          opportunities: JSON.parse(data.opportunities || '[]'),
          revenueModels: JSON.parse(data.revenue_models || '[]'),
          targetMarket: JSON.parse(data.target_market || '{}'),
          actionItems: JSON.parse(data.action_items || '[]'),
          confidenceScore: data.confidence_score
        } : null,
        project: data.project_id ? {
          id: data.project_id,
          name: data.project_name,
          status: data.project_status
        } : null,
        exportedAt: new Date()
      };

    } catch (error) {
      console.error('[TranscriptAnalyzer] Export transcript error:', error.message);
      throw error;
    }
  }

  /**
   * Delete transcript (and cascade to analysis/project)
   *
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for verification)
   * @returns {Promise<void>}
   */
  async deleteTranscript(transcriptId, userId) {
    try {
      // Verify ownership
      const result = await this.db.query(`
        DELETE FROM business_transcripts
        WHERE transcript_id = $1 AND user_id = $2
        RETURNING transcript_id
      `, [transcriptId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Transcript not found or unauthorized');
      }

      console.log(`[TranscriptAnalyzer] Deleted transcript: ${transcriptId}`);

    } catch (error) {
      console.error('[TranscriptAnalyzer] Delete transcript error:', error.message);
      throw error;
    }
  }
}

module.exports = TranscriptBusinessAnalyzer;
