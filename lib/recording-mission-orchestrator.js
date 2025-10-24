/**
 * Recording Mission Orchestrator
 *
 * CalRiven's autonomous mission system for phone recording walkthroughs.
 *
 * Features:
 * - Quest-driven progress tracking
 * - File system monitoring for recordings
 * - Auto-transcription via Whisper API
 * - GitHub repo generation
 * - NPM package creation (optional)
 * - Mission Control dashboard integration
 *
 * Usage:
 *   const orchestrator = new RecordingMissionOrchestrator({ calriven, questEngine, db });
 *   await orchestrator.start();
 *   // CalRiven now autonomously monitors for recordings and processes them
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const OpenAI = require('openai');
const TranscriptBusinessAnalyzer = require('./transcript-business-analyzer');
const GitHubProjectGenerator = require('./github-project-generator');

class RecordingMissionOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      calriven: config.calriven, // CalRivenPersona instance
      questEngine: config.questEngine, // QuestEngine instance
      db: config.db,

      // Recording detection
      scanInterval: config.scanInterval || 30000, // 30 seconds
      recordingPaths: config.recordingPaths || [
        path.join(require('os').homedir(), 'Downloads'),
        path.join(require('os').homedir(), 'Desktop'),
        '/tmp'
      ],

      // Transcription
      enableTranscription: config.enableTranscription !== false,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,

      // Artifacts
      enableGitHubRepo: config.enableGitHubRepo || false,
      enableNpmPackage: config.enableNpmPackage || false,
      githubToken: config.githubToken || process.env.GITHUB_TOKEN,

      // Quest
      questSlug: config.questSlug || 'record-calos-walkthrough',

      // Logging
      logToConsole: config.logToConsole !== false,
      logToVault: config.logToVault !== false
    };

    if (!this.config.db) {
      throw new Error('[RecordingMissionOrchestrator] Database required');
    }

    if (!this.config.questEngine) {
      throw new Error('[RecordingMissionOrchestrator] QuestEngine required');
    }

    // Initialize OpenAI
    if (this.config.enableTranscription) {
      this.openai = new OpenAI({ apiKey: this.config.openaiApiKey });
      this.transcriptAnalyzer = new TranscriptBusinessAnalyzer({
        db: this.config.db
      });
    }

    // Initialize GitHub generator (if enabled)
    if (this.config.enableGitHubRepo && this.config.githubToken) {
      this.githubGenerator = new GitHubProjectGenerator({
        githubToken: this.config.githubToken
      });
    }

    // State
    this.running = false;
    this.interval = null;
    this.detectedRecordings = new Map(); // filename -> metadata
    this.processedRecordings = new Set(); // filenames we've already processed

    this.log('[RecordingMissionOrchestrator] Initialized');
  }

  /**
   * Start autonomous monitoring
   */
  async start(userId) {
    if (this.running) {
      this.log('[RecordingMissionOrchestrator] Already running');
      return;
    }

    this.userId = userId;

    this.log(`[RecordingMissionOrchestrator] 🎬 Starting recording mission for user ${userId}`);

    // Initialize quest
    await this._initializeQuest();

    // Start monitoring loop
    this.running = true;
    this._startMonitoringLoop();

    this.emit('mission:started', { userId });
  }

  /**
   * Stop autonomous monitoring
   */
  async stop() {
    if (!this.running) return;

    this.log('[RecordingMissionOrchestrator] Stopping mission');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.running = false;

    this.emit('mission:stopped');
  }

  /**
   * Initialize recording quest for user
   */
  async _initializeQuest() {
    try {
      // Check if quest exists
      const quest = await this.config.questEngine.getQuestBySlug(this.config.questSlug);

      if (!quest) {
        this.log(`[RecordingMissionOrchestrator] Quest "${this.config.questSlug}" not found. Creating...`);
        await this._createRecordingQuest();
      }

      // Initialize quest for user
      const userQuests = await this.config.questEngine.getUserQuests(this.userId);
      const userQuest = userQuests.find(q => q.quest_slug === this.config.questSlug);

      if (!userQuest || !userQuest.progress_id) {
        const quest = await this.config.questEngine.getQuestBySlug(this.config.questSlug);
        await this.config.questEngine.initializeQuest(this.userId, quest.quest_id);
        this.log(`[RecordingMissionOrchestrator] Quest initialized for user ${this.userId}`);
      }

      this.emit('quest:initialized', { userId: this.userId, questSlug: this.config.questSlug });
    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] Quest initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create recording quest
   */
  async _createRecordingQuest() {
    const questData = {
      quest_slug: 'record-calos-walkthrough',
      quest_name: 'Record the CALOS Walkthrough',
      quest_description: 'Record a complete phone walkthrough of the CALOS system, explaining all features in your own words.',
      quest_type: 'achievement',
      difficulty: 'medium',
      required_count: 1,
      required_value: null,
      required_data: {
        min_duration_minutes: 60
      },
      reward_type: 'feature_unlock',
      reward_data: {
        feature: 'auto_transcription',
        apps: ['walkthrough_publisher']
      },
      reward_description: 'Unlock auto-transcription and walkthrough publishing tools',
      icon_emoji: '🎙️',
      is_hidden: false,
      is_repeatable: false,
      narrative_intro: 'Your system has grown vast and complex. It\'s time to share your journey with the world. Record your story, and I shall transcribe it for eternity.',
      narrative_progress: 'The recording begins... Your voice echoes through the digital realm.',
      narrative_complete: 'Your walkthrough is complete! The knowledge is now immortalized. Future developers shall learn from your journey.',
      sort_order: 100,
      is_active: true
    };

    await this.config.questEngine.createQuest(questData);
    this.log('[RecordingMissionOrchestrator] Recording quest created');
  }

  /**
   * Start monitoring loop
   */
  _startMonitoringLoop() {
    this.log('[RecordingMissionOrchestrator] 🔍 Starting file system monitoring...');

    // Initial scan
    this._scanForRecordings();

    // Recurring scans
    this.interval = setInterval(() => {
      this._scanForRecordings();
    }, this.config.scanInterval);
  }

  /**
   * Scan for new recordings
   */
  async _scanForRecordings() {
    for (const scanPath of this.config.recordingPaths) {
      try {
        const files = await fs.readdir(scanPath);

        for (const file of files) {
          // Look for audio files (voice memos, recordings)
          if (this._isAudioFile(file)) {
            const filePath = path.join(scanPath, file);

            // Skip if already processed
            if (this.processedRecordings.has(filePath)) {
              continue;
            }

            // Check if this is a CALOS walkthrough recording (heuristic)
            if (this._looksLikeWalkthroughRecording(file)) {
              await this._handleNewRecording(filePath);
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist or no permission
        continue;
      }
    }
  }

  /**
   * Check if file is audio
   */
  _isAudioFile(filename) {
    const audioExtensions = ['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac'];
    return audioExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Check if filename looks like a walkthrough recording
   */
  _looksLikeWalkthroughRecording(filename) {
    const keywords = ['calos', 'walkthrough', 'recording', 'demo', 'system'];
    const lowerFilename = filename.toLowerCase();
    return keywords.some(keyword => lowerFilename.includes(keyword));
  }

  /**
   * Handle new recording detected
   */
  async _handleNewRecording(filePath) {
    this.log(`[RecordingMissionOrchestrator] 🎤 New recording detected: ${filePath}`);

    try {
      // Get file stats
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);

      // Check if file is still being written (wait for completion)
      const isStillRecording = await this._checkIfStillRecording(filePath, stats.size);
      if (isStillRecording) {
        this.log(`[RecordingMissionOrchestrator] Recording still in progress, waiting...`);
        return;
      }

      // Mark as detected
      this.detectedRecordings.set(filename, {
        filePath,
        size: stats.size,
        detectedAt: new Date().toISOString(),
        durationMinutes: this._estimateDuration(stats.size)
      });

      this.emit('recording:detected', { filePath, size: stats.size });

      // Update quest progress (recording started/completed)
      await this._updateQuestProgress('recording_detected', { filePath });

      // Process recording
      await this._processRecording(filePath);

      // Mark as processed
      this.processedRecordings.add(filePath);

    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] Error handling recording: ${error.message}`);
      this.emit('recording:error', { filePath, error: error.message });
    }
  }

  /**
   * Check if file is still being written
   */
  async _checkIfStillRecording(filePath, initialSize) {
    // Wait 5 seconds and check if size changed
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const stats = await fs.stat(filePath);
      return stats.size !== initialSize;
    } catch (error) {
      return false; // File might have been moved/deleted
    }
  }

  /**
   * Estimate duration from file size (rough heuristic)
   * Assumes ~1MB per minute for typical voice recordings
   */
  _estimateDuration(sizeBytes) {
    const sizeMB = sizeBytes / 1024 / 1024;
    return Math.round(sizeMB); // Rough estimate
  }

  /**
   * Process recording (transcribe, generate artifacts)
   */
  async _processRecording(filePath) {
    this.log(`[RecordingMissionOrchestrator] 📝 Processing recording: ${filePath}`);

    const results = {
      filePath,
      transcription: null,
      githubRepo: null,
      npmPackage: null,
      error: null
    };

    try {
      // Step 1: Transcribe via Whisper
      if (this.config.enableTranscription) {
        this.log('[RecordingMissionOrchestrator] 🎧 Transcribing via Whisper...');
        results.transcription = await this._transcribeRecording(filePath);
        await this._updateQuestProgress('transcription_complete', { transcription: results.transcription });
        this.emit('transcription:complete', { filePath, transcription: results.transcription });
      }

      // Step 2: Generate GitHub repo (optional)
      if (this.config.enableGitHubRepo && this.githubGenerator) {
        this.log('[RecordingMissionOrchestrator] 📦 Creating GitHub repository...');
        results.githubRepo = await this._generateGitHubRepo(results.transcription);
        await this._updateQuestProgress('github_repo_created', { repo: results.githubRepo });
        this.emit('github:created', { repo: results.githubRepo });
      }

      // Step 3: Generate NPM package (optional)
      if (this.config.enableNpmPackage) {
        this.log('[RecordingMissionOrchestrator] 📦 Creating NPM package...');
        results.npmPackage = await this._generateNpmPackage(results.transcription);
        await this._updateQuestProgress('npm_package_created', { package: results.npmPackage });
        this.emit('npm:created', { package: results.npmPackage });
      }

      // Complete quest
      await this._completeQuest();

      this.emit('recording:processed', results);

    } catch (error) {
      results.error = error.message;
      this.log(`[RecordingMissionOrchestrator] Processing error: ${error.message}`);
      this.emit('recording:error', { filePath, error: error.message });
    }

    return results;
  }

  /**
   * Transcribe recording via Whisper API
   */
  async _transcribeRecording(filePath) {
    try {
      const fileStream = await fs.readFile(filePath);
      const filename = path.basename(filePath);

      this.log(`[RecordingMissionOrchestrator] Sending to Whisper API: ${filename}`);

      const transcription = await this.openai.audio.transcriptions.create({
        file: new File([fileStream], filename),
        model: 'whisper-1',
        language: 'en',
        response_format: 'verbose_json'
      });

      // Save transcription to file
      const transcriptPath = path.join(
        path.dirname(filePath),
        `${path.parse(filename).name}_transcript.md`
      );

      const transcriptContent = `# CALOS Walkthrough Transcription

**Recorded:** ${new Date().toISOString()}
**Duration:** ${transcription.duration} seconds
**File:** ${filename}

---

${transcription.text}

---

*Transcribed by CalRiven AI via OpenAI Whisper*
`;

      await fs.writeFile(transcriptPath, transcriptContent, 'utf8');

      this.log(`[RecordingMissionOrchestrator] ✅ Transcription saved: ${transcriptPath}`);

      return {
        text: transcription.text,
        duration: transcription.duration,
        path: transcriptPath
      };

    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] Transcription error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate GitHub repository with walkthrough docs
   */
  async _generateGitHubRepo(transcription) {
    if (!this.githubGenerator) {
      throw new Error('GitHub generator not initialized');
    }

    const repoName = 'calos-walkthrough-recording';
    const description = 'Complete CALOS system walkthrough - recorded and transcribed';

    try {
      const repo = await this.githubGenerator.createRepository({
        name: repoName,
        description,
        brand: 'calos',
        isPrivate: false,
        autoInit: true
      });

      this.log(`[RecordingMissionOrchestrator] ✅ GitHub repo created: ${repo.html_url}`);

      // TODO: Push walkthrough files to repo
      // - Transcription
      // - WALKTHROUGH_SEQUENCE.md
      // - FEATURE_CARDS/
      // - README

      return {
        url: repo.html_url,
        name: repo.full_name
      };

    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] GitHub repo error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate NPM package
   */
  async _generateNpmPackage(transcription) {
    // TODO: Implement NPM package generation
    // - Create package.json
    // - Bundle walkthrough docs
    // - Generate README for npm
    // - Optionally publish to npm

    this.log('[RecordingMissionOrchestrator] NPM package generation not yet implemented');
    return null;
  }

  /**
   * Update quest progress
   */
  async _updateQuestProgress(milestone, metadata = {}) {
    try {
      const quest = await this.config.questEngine.getQuestBySlug(this.config.questSlug);

      if (!quest) {
        this.log('[RecordingMissionOrchestrator] Quest not found, skipping progress update');
        return;
      }

      await this.config.questEngine.updateProgress(
        this.userId,
        quest.quest_id,
        1, // increment count
        0, // no value
        { milestone, ...metadata, timestamp: new Date().toISOString() }
      );

      this.log(`[RecordingMissionOrchestrator] Quest progress updated: ${milestone}`);

    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] Quest progress error: ${error.message}`);
    }
  }

  /**
   * Complete quest and claim reward
   */
  async _completeQuest() {
    try {
      const quest = await this.config.questEngine.getQuestBySlug(this.config.questSlug);

      if (!quest) {
        this.log('[RecordingMissionOrchestrator] Quest not found');
        return;
      }

      // Mark quest as complete
      await this.config.questEngine.updateProgress(
        this.userId,
        quest.quest_id,
        1,
        0,
        { completed: true, timestamp: new Date().toISOString() }
      );

      // Auto-claim reward
      const reward = await this.config.questEngine.claimReward(this.userId, quest.quest_id);

      this.log(`[RecordingMissionOrchestrator] 🎉 Quest completed! Reward claimed:`, reward);

      this.emit('quest:completed', { userId: this.userId, questSlug: this.config.questSlug, reward });

    } catch (error) {
      this.log(`[RecordingMissionOrchestrator] Quest completion error: ${error.message}`);
    }
  }

  /**
   * Get mission status
   */
  async getStatus() {
    const quest = await this.config.questEngine.getQuestBySlug(this.config.questSlug);
    const userQuests = await this.config.questEngine.getUserQuests(this.userId);
    const userQuest = userQuests.find(q => q.quest_slug === this.config.questSlug);

    return {
      running: this.running,
      userId: this.userId,
      quest: quest ? {
        id: quest.quest_id,
        slug: quest.quest_slug,
        name: quest.quest_name,
        status: userQuest ? userQuest.status : 'not_started'
      } : null,
      detectedRecordings: Array.from(this.detectedRecordings.values()),
      processedCount: this.processedRecordings.size,
      scanPaths: this.config.recordingPaths,
      scanInterval: this.config.scanInterval,
      features: {
        transcription: this.config.enableTranscription,
        github: this.config.enableGitHubRepo,
        npm: this.config.enableNpmPackage
      }
    };
  }

  /**
   * Log message
   */
  log(message, ...args) {
    if (this.config.logToConsole) {
      console.log(message, ...args);
    }

    // TODO: Log to encrypted vault if configured
    if (this.config.logToVault && this.config.calriven) {
      // this.config.calriven.logToVault(message);
    }
  }
}

module.exports = RecordingMissionOrchestrator;
