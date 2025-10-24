/**
 * Domain Orchestrator
 *
 * Connects all systems into unified feedback loops:
 * - Loop 1: Content → Learn → Collaborate
 * - Loop 2: Learn → Build → Share
 * - Loop 3: Cross-Domain Activity Feed
 *
 * Integrates:
 * - External Platform Bridge (post to web)
 * - Cross-Domain Session (track across domains)
 * - Collaboration Matcher (auto-pair users)
 * - Multi-Brand Poster (generate content)
 * - Learning Engine (user progress)
 * - Mailbox System (communication)
 * - Domain HTTP Client (inter-domain requests)
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class DomainOrchestrator extends EventEmitter {
  constructor({
    db,
    externalPlatformBridge,
    crossDomainSession,
    collaborationMatcher,
    multiBrandPoster,
    learningEngine,
    mailboxSystem,
    domainHTTPClient
  }) {
    super();

    this.db = db;

    // Core systems
    this.platformBridge = externalPlatformBridge;
    this.sessionManager = crossDomainSession;
    this.matcher = collaborationMatcher;
    this.poster = multiBrandPoster;
    this.learningEngine = learningEngine;
    this.mailbox = mailboxSystem;
    this.httpClient = domainHTTPClient;

    // Loop tracking
    this.activeLoops = new Map();

    // Stats
    this.stats = {
      totalLoopsExecuted: 0,
      byLoopType: {
        contentLearnCollaborate: 0,
        learnBuildShare: 0,
        crossDomainActivity: 0
      },
      successfulLoops: 0,
      failedLoops: 0
    };

    // Setup event listeners
    this.setupEventListeners();

    console.log('[DomainOrchestrator] Initialized');
  }

  /**
   * Setup event listeners to connect systems
   */
  setupEventListeners() {
    // Listen to external platform posts
    if (this.platformBridge) {
      this.platformBridge.on('post_success', (data) => {
        this.handleExternalPost(data);
      });
    }

    // Listen to learning engine events
    if (this.learningEngine) {
      this.learningEngine.on('lesson_completed', (data) => {
        this.handleLessonCompleted(data);
      });

      this.learningEngine.on('achievement_unlocked', (data) => {
        this.handleAchievementUnlocked(data);
      });
    }

    // Listen to collaboration matches
    if (this.matcher) {
      this.matcher.on('match_created', (data) => {
        this.handleMatchCreated(data);
      });
    }

    // Listen to cross-domain activity
    if (this.sessionManager) {
      this.sessionManager.on('activity_tracked', (data) => {
        this.handleCrossDomainActivity(data);
      });
    }
  }

  /**
   * Loop 1: Content → Learn → Collaborate
   *
   * Flow:
   * 1. Cal Riven posts to external platforms (Twitter, LinkedIn)
   * 2. Users discover content → land on your domain
   * 3. Enroll in learning path
   * 4. Leave hints to help others
   * 5. Get matched with collaborators
   */
  async executeContentLearnCollaborateLoop({ brand, topic, platforms = ['twitter'] }) {
    const loopId = crypto.randomUUID();
    console.log(`[DomainOrchestrator] Executing Loop 1 (Content→Learn→Collaborate) - ${loopId}`);

    const loop = {
      loopId,
      type: 'contentLearnCollaborate',
      status: 'running',
      startedAt: new Date(),
      steps: []
    };

    this.activeLoops.set(loopId, loop);

    try {
      // Step 1: Generate content
      console.log(`[DomainOrchestrator] Step 1: Generating content for ${brand} about ${topic}`);
      const contentResult = await this.poster.postToBrand({
        brand,
        topic,
        voiceTranscript: null
      });

      loop.steps.push({
        step: 'generate_content',
        success: contentResult.success,
        data: contentResult
      });

      if (!contentResult.success) {
        throw new Error(`Content generation failed: ${contentResult.error}`);
      }

      // Step 2: Cross-post to external platforms
      console.log(`[DomainOrchestrator] Step 2: Cross-posting to ${platforms.join(', ')}`);
      const externalResult = await this.platformBridge.crossPost({
        content: contentResult.content,
        platforms,
        brand,
        metadata: { topic, loopId }
      });

      loop.steps.push({
        step: 'cross_post',
        success: externalResult.successful > 0,
        data: externalResult
      });

      // Step 3: Track users who land on domain (triggered by clicks)
      // This happens passively via cross-domain session tracking

      // Step 4: Auto-match users based on learning activity
      console.log(`[DomainOrchestrator] Step 4: Running auto-matcher`);
      const matchResult = await this.matcher.runAutoMatchingBatch({ minScore: 0.6 });

      loop.steps.push({
        step: 'auto_match',
        success: matchResult.matchesCreated > 0,
        data: matchResult
      });

      // Loop complete
      loop.status = 'completed';
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.byLoopType.contentLearnCollaborate++;
      this.stats.successfulLoops++;

      console.log(`[DomainOrchestrator] ✓ Loop 1 completed: ${loopId}`);
      this.emit('loop_completed', loop);

      return {
        success: true,
        loopId,
        loop
      };

    } catch (error) {
      loop.status = 'failed';
      loop.error = error.message;
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.failedLoops++;

      console.error(`[DomainOrchestrator] ✗ Loop 1 failed: ${loopId} -`, error);
      this.emit('loop_failed', loop);

      return {
        success: false,
        loopId,
        error: error.message
      };
    }
  }

  /**
   * Loop 2: Learn → Build → Share
   *
   * Flow:
   * 1. User completes lessons
   * 2. Builds project in "finishthisidea" style
   * 3. Multi-brand poster shares project across platforms
   * 4. Attracts new learners (back to Loop 1)
   */
  async executeLearnBuildShareLoop({ userId, projectTitle, projectDescription, platforms = ['twitter', 'linkedin'] }) {
    const loopId = crypto.randomUUID();
    console.log(`[DomainOrchestrator] Executing Loop 2 (Learn→Build→Share) - ${loopId}`);

    const loop = {
      loopId,
      type: 'learnBuildShare',
      status: 'running',
      startedAt: new Date(),
      steps: [],
      userId
    };

    this.activeLoops.set(loopId, loop);

    try {
      // Step 1: Verify user has completed lessons
      console.log(`[DomainOrchestrator] Step 1: Checking user progress`);
      const progressResult = await this.db.query(
        `SELECT COUNT(*) as completed_count
         FROM lesson_completions
         WHERE user_id = $1`,
        [userId]
      );

      const completedCount = parseInt(progressResult.rows[0].completed_count);

      loop.steps.push({
        step: 'check_progress',
        success: completedCount > 0,
        data: { completedCount }
      });

      if (completedCount === 0) {
        throw new Error('User has not completed any lessons yet');
      }

      // Step 2: Generate showcase content
      console.log(`[DomainOrchestrator] Step 2: Generating project showcase`);
      const showcaseContent = this.generateProjectShowcase({
        userId,
        projectTitle,
        projectDescription,
        completedCount
      });

      loop.steps.push({
        step: 'generate_showcase',
        success: true,
        data: { showcaseContent }
      });

      // Step 3: Share across external platforms
      console.log(`[DomainOrchestrator] Step 3: Sharing project on ${platforms.join(', ')}`);
      const shareResult = await this.platformBridge.crossPost({
        content: showcaseContent,
        platforms,
        metadata: { userId, projectTitle, loopId }
      });

      loop.steps.push({
        step: 'share_project',
        success: shareResult.successful > 0,
        data: shareResult
      });

      // Step 4: Send achievement notification
      if (this.mailbox) {
        await this.mailbox.sendMail({
          fromUserId: 'system',
          toUserId: userId,
          subject: '🚀 Your Project is Live!',
          body: `Congratulations! Your project "${projectTitle}" has been shared across ${shareResult.successful} platforms!\n\n` +
                `Check out the links:\n${shareResult.results.filter(r => r.success).map(r => `- ${r.platform}: ${r.url}`).join('\n')}`,
          messageType: 'system'
        });
      }

      // Loop complete
      loop.status = 'completed';
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.byLoopType.learnBuildShare++;
      this.stats.successfulLoops++;

      console.log(`[DomainOrchestrator] ✓ Loop 2 completed: ${loopId}`);
      this.emit('loop_completed', loop);

      return {
        success: true,
        loopId,
        loop,
        shareResults: shareResult
      };

    } catch (error) {
      loop.status = 'failed';
      loop.error = error.message;
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.failedLoops++;

      console.error(`[DomainOrchestrator] ✗ Loop 2 failed: ${loopId} -`, error);
      this.emit('loop_failed', loop);

      return {
        success: false,
        loopId,
        error: error.message
      };
    }
  }

  /**
   * Loop 3: Cross-Domain Activity Feed
   *
   * Flow:
   * 1. Activity on calos.ai triggers notification on soulfra.com
   * 2. Mailbox message sent between domains
   * 3. Voice sync enables cross-device follow-up
   * 4. Public dashboard updates ("billboard")
   */
  async executeCrossDomainActivityLoop({ sourceDomain, targetDomain, activity, userId, metadata = {} }) {
    const loopId = crypto.randomUUID();
    console.log(`[DomainOrchestrator] Executing Loop 3 (Cross-Domain Activity) - ${loopId}`);

    const loop = {
      loopId,
      type: 'crossDomainActivity',
      status: 'running',
      startedAt: new Date(),
      steps: []
    };

    this.activeLoops.set(loopId, loop);

    try {
      // Step 1: Send cross-domain HTTP request
      console.log(`[DomainOrchestrator] Step 1: ${sourceDomain} → ${targetDomain}`);

      // Example: Notify target domain of activity
      const notifyResult = await this.httpClient.callService(
        targetDomain,
        'worker-context',
        'notify',
        {
          sourceDomain,
          activity,
          userId,
          metadata
        }
      );

      loop.steps.push({
        step: 'cross_domain_notify',
        success: notifyResult.success,
        data: notifyResult
      });

      // Step 2: Update activity feed (for billboard)
      if (this.sessionManager) {
        // Activity feed is automatically updated by session manager
        loop.steps.push({
          step: 'update_activity_feed',
          success: true,
          data: { feedSize: this.sessionManager.activityFeed.length }
        });
      }

      // Step 3: Send mailbox notification (optional)
      if (this.mailbox && metadata.notifyUser) {
        await this.mailbox.sendMail({
          fromUserId: 'system',
          toUserId: userId,
          subject: `Activity from ${sourceDomain}`,
          body: `New activity detected:\n${activity}`,
          messageType: 'system'
        });

        loop.steps.push({
          step: 'send_notification',
          success: true
        });
      }

      // Loop complete
      loop.status = 'completed';
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.byLoopType.crossDomainActivity++;
      this.stats.successfulLoops++;

      console.log(`[DomainOrchestrator] ✓ Loop 3 completed: ${loopId}`);
      this.emit('loop_completed', loop);

      return {
        success: true,
        loopId,
        loop
      };

    } catch (error) {
      loop.status = 'failed';
      loop.error = error.message;
      loop.completedAt = new Date();

      this.stats.totalLoopsExecuted++;
      this.stats.failedLoops++;

      console.error(`[DomainOrchestrator] ✗ Loop 3 failed: ${loopId} -`, error);
      this.emit('loop_failed', loop);

      return {
        success: false,
        loopId,
        error: error.message
      };
    }
  }

  /**
   * Generate project showcase content
   */
  generateProjectShowcase({ userId, projectTitle, projectDescription, completedCount }) {
    return `🚀 New Project Alert!\n\n` +
           `"${projectTitle}"\n\n` +
           `${projectDescription}\n\n` +
           `Built after completing ${completedCount} lessons on CALOS.\n\n` +
           `#buildinpublic #learning #projects`;
  }

  /**
   * Event handlers
   */
  async handleExternalPost(data) {
    console.log(`[DomainOrchestrator] External post detected: ${data.platform} - ${data.externalUrl}`);
    // Could trigger tracking or analytics
  }

  async handleLessonCompleted(data) {
    console.log(`[DomainOrchestrator] Lesson completed: user ${data.userId}`);

    // Auto-check if user is ready to share a project
    const completedCount = await this.db.query(
      `SELECT COUNT(*) as count FROM lesson_completions WHERE user_id = $1`,
      [data.userId]
    );

    const count = parseInt(completedCount.rows[0].count);

    // If milestone reached (e.g., 5 lessons), suggest sharing
    if (count === 5 || count === 10 || count === 20) {
      if (this.mailbox) {
        await this.mailbox.sendMail({
          fromUserId: 'system',
          toUserId: data.userId,
          subject: '🎉 Milestone Reached! Share Your Progress?',
          body: `Congrats on completing ${count} lessons!\n\nWant to share your learning journey? We can help you showcase what you've built.`,
          messageType: 'system'
        });
      }
    }
  }

  async handleAchievementUnlocked(data) {
    console.log(`[DomainOrchestrator] Achievement unlocked: ${data.achievementName} by user ${data.userId}`);
    // Could auto-post achievement to social media
  }

  async handleMatchCreated(data) {
    console.log(`[DomainOrchestrator] Collaboration match created: ${data.user1Id} ↔ ${data.user2Id}`);
    // Already handled by collaboration matcher (sends mailbox messages)
  }

  async handleCrossDomainActivity(data) {
    console.log(`[DomainOrchestrator] Cross-domain activity: ${data.activity} on ${data.domain}`);
    // Activity is already added to feed by session manager
  }

  /**
   * Get active loops
   */
  getActiveLoops() {
    return Array.from(this.activeLoops.values());
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalLoopsExecuted > 0
        ? ((this.stats.successfulLoops / this.stats.totalLoopsExecuted) * 100).toFixed(2) + '%'
        : '100%',
      activeLoops: this.activeLoops.size
    };
  }

  /**
   * Get recent loop history
   */
  getLoopHistory({ limit = 50, type = null } = {}) {
    let loops = Array.from(this.activeLoops.values());

    if (type) {
      loops = loops.filter(l => l.type === type);
    }

    loops.sort((a, b) => b.startedAt - a.startedAt);

    return loops.slice(0, limit);
  }
}

module.exports = DomainOrchestrator;
