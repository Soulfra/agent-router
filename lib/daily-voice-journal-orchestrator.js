/**
 * Daily Voice Journal Orchestrator
 *
 * Complete autonomous system for daily voice journaling:
 * 1. Detect/transcribe voice recordings (via RecordingMissionOrchestrator)
 * 2. Build narrative from rambling (VoiceNarrativeBuilder)
 * 3. Extract actionable work (VoiceIdeaExtractor)
 * 4. Route to brand domains (BrandVoiceContentRouter)
 * 5. Publish everywhere (CrossPlatformAutoPublisher)
 *
 * Features:
 * - Scheduled daily prompts
 * - On-demand recording triggers
 * - Quest integration (daily streak rewards)
 * - Multi-brand publishing
 * - Session history & analytics
 *
 * Usage:
 *   const orchestrator = new DailyVoiceJournalOrchestrator({
 *     db,
 *     llmRouter,
 *     questEngine,
 *     githubToken,
 *     openaiKey
 *   });
 *
 *   // Start daily autonomous mode
 *   await orchestrator.start('user123', {
 *     schedule: '09:00',
 *     autoPub: ['mastodon', 'blog']
 *   });
 *
 *   // Or on-demand
 *   const session = await orchestrator.processRecording({
 *     userId: 'user123',
 *     audioPath: '/path/to/recording.m4a',
 *     platforms: ['mastodon', 'blog', 'twitter']
 *   });
 */

const EventEmitter = require('events');
const VoiceNarrativeBuilder = require('./voice-narrative-builder');
const VoiceIdeaExtractor = require('./voice-idea-extractor');
const BrandVoiceContentRouter = require('./brand-voice-content-router');
const CrossPlatformAutoPublisher = require('./cross-platform-auto-publisher');

class DailyVoiceJournalOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.llmRouter = options.llmRouter;
    this.questEngine = options.questEngine;
    this.recordingOrchestrator = options.recordingOrchestrator;

    // Initialize sub-components
    this.narrativeBuilder = new VoiceNarrativeBuilder({
      llmRouter: this.llmRouter
    });

    this.ideaExtractor = new VoiceIdeaExtractor({
      llmRouter: this.llmRouter,
      githubToken: options.githubToken,
      db: this.db
    });

    this.brandRouter = new BrandVoiceContentRouter({
      llmRouter: this.llmRouter
    });

    this.autoPublisher = new CrossPlatformAutoPublisher({
      db: this.db,
      activityPubServer: options.activityPubServer,
      contentPublisher: options.contentPublisher,
      twitterClient: options.twitterClient,
      youtubeClient: options.youtubeClient,
      newsletterService: options.newsletterService,
      podcastRSSGenerator: options.podcastRSSGenerator
    });

    // Daily schedule settings
    this.schedules = new Map(); // userId → schedule config

    // Active sessions
    this.activeSessions = new Map(); // sessionId → session data

    console.log('[DailyVoiceJournalOrchestrator] Initialized');
  }

  /**
   * Start daily autonomous mode for user
   */
  async start(userId, config = {}) {
    const {
      schedule = '09:00', // Daily at 9am
      timezone = 'America/New_York',
      autoPub = ['mastodon', 'blog'], // Auto-publish platforms
      autoExtract = true, // Extract ideas/tasks
      autoRoute = true, // Route to brand domains
      promptType = 'daily-reflection' // or 'morning-planning', 'evening-review'
    } = config;

    console.log(`[DailyVoiceJournalOrchestrator] Starting daily mode for ${userId}`);

    // Save schedule to database
    if (this.db) {
      await this.db.query(`
        INSERT INTO voice_journal_schedules (
          user_id,
          schedule_time,
          timezone,
          auto_publish_platforms,
          auto_extract_enabled,
          auto_route_enabled,
          prompt_type,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          schedule_time = $2,
          timezone = $3,
          auto_publish_platforms = $4,
          auto_extract_enabled = $5,
          auto_route_enabled = $6,
          prompt_type = $7,
          status = $8,
          updated_at = NOW()
      `, [
        userId,
        schedule,
        timezone,
        JSON.stringify(autoPub),
        autoExtract,
        autoRoute,
        promptType,
        'active'
      ]);
    }

    // Store in memory
    this.schedules.set(userId, {
      schedule,
      timezone,
      autoPub,
      autoExtract,
      autoRoute,
      promptType,
      status: 'active'
    });

    // Set up daily timer (check every hour if it's time)
    this._setupDailyTimer(userId);

    this.emit('schedule_started', { userId, schedule, config });

    return {
      userId,
      schedule,
      timezone,
      autoPub,
      status: 'active'
    };
  }

  /**
   * Stop daily autonomous mode
   */
  async stop(userId) {
    console.log(`[DailyVoiceJournalOrchestrator] Stopping daily mode for ${userId}`);

    if (this.db) {
      await this.db.query(`
        UPDATE voice_journal_schedules
        SET status = 'inactive', updated_at = NOW()
        WHERE user_id = $1
      `, [userId]);
    }

    if (this.schedules.has(userId)) {
      this.schedules.delete(userId);
    }

    this.emit('schedule_stopped', { userId });

    return { userId, status: 'inactive' };
  }

  /**
   * Process recording (complete pipeline)
   */
  async processRecording(input) {
    const {
      userId,
      audioPath,
      transcript,
      platforms = ['mastodon', 'blog'],
      metadata = {}
    } = input;

    console.log(`[DailyVoiceJournalOrchestrator] Processing recording for ${userId}`);

    // Create session
    const sessionId = await this._createSession(userId, audioPath, metadata);

    const session = {
      sessionId,
      userId,
      audioPath,
      transcript: transcript || null,
      metadata,
      startTime: new Date(),
      status: 'processing'
    };

    this.activeSessions.set(sessionId, session);
    this.emit('session_started', { sessionId, userId });

    try {
      // Step 1: Get transcript (if not provided)
      if (!session.transcript) {
        this.emit('transcription_started', { sessionId });
        session.transcript = await this._transcribe(audioPath);
        await this._updateSession(sessionId, { transcript: session.transcript });
        this.emit('transcription_complete', { sessionId, length: session.transcript.length });
      }

      // Step 2: Build narrative
      this.emit('narrative_building', { sessionId });
      const narrative = await this.narrativeBuilder.build({
        transcript: session.transcript,
        metadata: {
          ...metadata,
          sessionId,
          userId,
          audioPath
        },
        outputFormats: ['story', 'insights', 'actionable', 'blog', 'podcast', 'thread']
      });
      session.narrative = narrative;
      await this._updateSession(sessionId, { narrative_summary: this._summarizeNarrative(narrative) });
      this.emit('narrative_complete', { sessionId, themes: narrative.analysis.themes.length });

      // Step 3: Extract ideas (if enabled)
      const scheduleConfig = this.schedules.get(userId);
      if (scheduleConfig?.autoExtract !== false) {
        this.emit('extraction_started', { sessionId });
        const extracted = await this.ideaExtractor.extract({
          transcript: session.transcript,
          narrative,
          metadata: { sessionId, userId }
        });
        session.extracted = extracted;

        // Create artifacts (GitHub issues, notes, etc.)
        const artifacts = await this.ideaExtractor.createArtifacts(extracted, {
          createGitHubIssues: !!metadata.githubRepo,
          githubRepo: metadata.githubRepo,
          saveMathNotes: true,
          saveProductIdeas: true,
          saveResearch: true
        });
        session.artifacts = artifacts;

        await this._updateSession(sessionId, {
          extracted_summary: {
            devTasks: extracted.devTasks.length,
            mathConcepts: extracted.mathConcepts.length,
            productIdeas: extracted.productIdeas.length,
            researchQuestions: extracted.researchQuestions.length
          }
        });
        this.emit('extraction_complete', { sessionId, extracted });
      }

      // Step 4: Route to brand domains (if enabled)
      if (scheduleConfig?.autoRoute !== false) {
        this.emit('routing_started', { sessionId });
        const routing = await this.brandRouter.route({
          narrative,
          themes: narrative.analysis.themes,
          metadata: { sessionId, userId }
        });
        session.routing = routing;

        await this._updateSession(sessionId, {
          primary_brand: routing.routing.primary.brand,
          primary_domain: routing.routing.primary.domain,
          routing_confidence: routing.routing.primary.confidence
        });
        this.emit('routing_complete', { sessionId, brand: routing.routing.primary.brand });
      }

      // Step 5: Publish to platforms (if enabled)
      if (platforms.length > 0 && session.routing) {
        this.emit('publishing_started', { sessionId, platforms });
        const published = await this.autoPublisher.publish({
          narrative,
          routing: session.routing.routing,
          platforms,
          metadata: { sessionId, userId, audioPath }
        });
        session.published = published;

        await this._updateSession(sessionId, {
          published_platforms: Object.keys(published.published),
          published_urls: published.urls
        });
        this.emit('publishing_complete', { sessionId, urls: published.urls });
      }

      // Step 6: Update quest progress
      if (this.questEngine) {
        await this._updateQuestProgress(userId, sessionId);
      }

      // Mark session complete
      session.status = 'complete';
      session.endTime = new Date();
      await this._updateSession(sessionId, {
        status: 'complete',
        completed_at: session.endTime
      });

      this.activeSessions.delete(sessionId);
      this.emit('session_complete', { sessionId, session });

      return session;

    } catch (error) {
      console.error(`[DailyVoiceJournalOrchestrator] Error processing session ${sessionId}:`, error);

      session.status = 'error';
      session.error = error.message;
      await this._updateSession(sessionId, {
        status: 'error',
        error_message: error.message
      });

      this.activeSessions.delete(sessionId);
      this.emit('session_error', { sessionId, error: error.message });

      throw error;
    }
  }

  /**
   * Create new session in database
   */
  async _createSession(userId, audioPath, metadata) {
    if (!this.db) {
      return `session_${Date.now()}_${userId}`;
    }

    const result = await this.db.query(`
      INSERT INTO voice_journal_sessions (
        user_id,
        audio_path,
        metadata,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING session_id
    `, [userId, audioPath, JSON.stringify(metadata), 'processing']);

    return result.rows[0].session_id;
  }

  /**
   * Update session in database
   */
  async _updateSession(sessionId, updates) {
    if (!this.db) return;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    }

    fields.push(`updated_at = NOW()`);
    values.push(sessionId);

    await this.db.query(`
      UPDATE voice_journal_sessions
      SET ${fields.join(', ')}
      WHERE session_id = $${paramIndex}
    `, values);
  }

  /**
   * Transcribe audio file
   */
  async _transcribe(audioPath) {
    // Delegate to RecordingMissionOrchestrator if available
    if (this.recordingOrchestrator) {
      return await this.recordingOrchestrator._transcribeAudio(audioPath);
    }

    throw new Error('Transcription not configured (missing RecordingMissionOrchestrator or OpenAI key)');
  }

  /**
   * Summarize narrative for database storage
   */
  _summarizeNarrative(narrative) {
    return {
      title: narrative.outputs.story?.title,
      takeaway: narrative.outputs.story?.takeaway,
      themes: narrative.analysis.themes.map(t => t.name),
      insights: narrative.analysis.insights.length,
      tangents: narrative.analysis.tangents.length,
      actionable: narrative.analysis.actionable.length
    };
  }

  /**
   * Update quest progress
   */
  async _updateQuestProgress(userId, sessionId) {
    if (!this.questEngine || !this.db) return;

    // Check if daily journal quest exists
    const questResult = await this.db.query(`
      SELECT quest_id FROM quests
      WHERE quest_key = 'daily-voice-journal'
      LIMIT 1
    `);

    if (questResult.rows.length === 0) {
      console.log('[DailyVoiceJournalOrchestrator] Daily journal quest not found');
      return;
    }

    const questId = questResult.rows[0].quest_id;

    // Increment progress
    await this.questEngine.incrementProgress(userId, questId, 1);

    // Check streak
    const streak = await this._calculateStreak(userId);

    // Bonus rewards for streaks
    if (streak === 7) {
      await this.questEngine.awardBonus(userId, 'weekly_streak', 100);
    } else if (streak === 30) {
      await this.questEngine.awardBonus(userId, 'monthly_streak', 500);
    }

    this.emit('quest_updated', { userId, questId, sessionId, streak });
  }

  /**
   * Calculate daily streak
   */
  async _calculateStreak(userId) {
    if (!this.db) return 0;

    const result = await this.db.query(`
      WITH daily_sessions AS (
        SELECT DATE(created_at) as session_date
        FROM voice_journal_sessions
        WHERE user_id = $1 AND status = 'complete'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) DESC
      ),
      streak_calc AS (
        SELECT
          session_date,
          session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC)::int as streak_group
        FROM daily_sessions
      )
      SELECT COUNT(*) as streak
      FROM streak_calc
      WHERE streak_group = (
        SELECT streak_group
        FROM streak_calc
        LIMIT 1
      )
    `, [userId]);

    return result.rows[0]?.streak || 0;
  }

  /**
   * Set up daily timer for scheduled prompts
   */
  _setupDailyTimer(userId) {
    const config = this.schedules.get(userId);
    if (!config) return;

    // Check every hour if it's time to prompt
    setInterval(() => {
      this._checkDailyPrompt(userId);
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Check if it's time for daily prompt
   */
  async _checkDailyPrompt(userId) {
    const config = this.schedules.get(userId);
    if (!config || config.status !== 'active') return;

    const now = new Date();
    const [hour, minute] = config.schedule.split(':').map(Number);

    if (now.getHours() === hour && now.getMinutes() < 60) {
      // Check if already journaled today
      const journaledToday = await this._hasJournaledToday(userId);
      if (!journaledToday) {
        this.emit('daily_prompt', {
          userId,
          promptType: config.promptType,
          scheduledTime: config.schedule
        });
      }
    }
  }

  /**
   * Check if user has journaled today
   */
  async _hasJournaledToday(userId) {
    if (!this.db) return false;

    const result = await this.db.query(`
      SELECT COUNT(*) as count
      FROM voice_journal_sessions
      WHERE user_id = $1
        AND DATE(created_at) = CURRENT_DATE
        AND status = 'complete'
    `, [userId]);

    return result.rows[0].count > 0;
  }

  /**
   * Get session history
   */
  async getSessionHistory(userId, options = {}) {
    const { limit = 30, offset = 0, status = null } = options;

    if (!this.db) {
      return { sessions: [], total: 0 };
    }

    const whereClause = status
      ? `WHERE user_id = $1 AND status = $2`
      : `WHERE user_id = $1`;
    const params = status ? [userId, status, limit, offset] : [userId, limit, offset];

    const result = await this.db.query(`
      SELECT
        session_id,
        audio_path,
        status,
        narrative_summary,
        extracted_summary,
        primary_brand,
        primary_domain,
        routing_confidence,
        published_platforms,
        published_urls,
        created_at,
        completed_at
      FROM voice_journal_sessions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}
    `, params);

    const countResult = await this.db.query(`
      SELECT COUNT(*) as total
      FROM voice_journal_sessions
      ${whereClause}
    `, status ? [userId, status] : [userId]);

    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }

  /**
   * Get analytics
   */
  async getAnalytics(userId, options = {}) {
    const { period = '30days' } = options;

    if (!this.db) {
      return { analytics: null };
    }

    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'complete' THEN 1 END) as completed_sessions,
        AVG(CASE WHEN status = 'complete' THEN (completed_at - created_at) END) as avg_processing_time,
        COUNT(DISTINCT primary_brand) as brands_used,
        COUNT(DISTINCT DATE(created_at)) as days_active,
        json_agg(DISTINCT primary_brand) FILTER (WHERE primary_brand IS NOT NULL) as brands
      FROM voice_journal_sessions
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
    `, [userId]);

    const streak = await this._calculateStreak(userId);

    return {
      ...result.rows[0],
      streak,
      period
    };
  }

  /**
   * Get status
   */
  getStatus(userId = null) {
    if (userId) {
      const schedule = this.schedules.get(userId);
      const activeSessions = Array.from(this.activeSessions.values())
        .filter(s => s.userId === userId);

      return {
        userId,
        schedule: schedule || null,
        activeSessions: activeSessions.length,
        status: schedule?.status || 'inactive'
      };
    }

    return {
      totalSchedules: this.schedules.size,
      activeSessions: this.activeSessions.size,
      schedules: Array.from(this.schedules.entries()).map(([userId, config]) => ({
        userId,
        schedule: config.schedule,
        status: config.status
      }))
    };
  }
}

module.exports = DailyVoiceJournalOrchestrator;
