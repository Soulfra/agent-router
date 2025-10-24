/**
 * Cal Meta-Orchestrator
 *
 * Multi-dimensional learning coordinator that orchestrates Cal's progression across:
 * - Granular lesson work (CalLearningLoop)
 * - End-to-end system health (Guardian)
 * - Community participation (ForumMonitor)
 * - Milestone journey (CalStudentLauncher)
 * - Multi-skill XP (SkillsEngine)
 * - Agent network (AgentMesh)
 *
 * Implements "halfway to max" branching logic:
 * At tier 3+, Cal splits focus across multiple tracks instead of linear progression.
 */

const EventEmitter = require('events');

class CalMetaOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    // Core systems
    this.db = config.db;
    this.calLoop = config.calLoop;           // Granular lesson completion
    this.guardian = config.guardian;         // System health monitoring
    this.forumMonitor = config.forumMonitor; // Community engagement
    this.studentLauncher = config.studentLauncher; // Milestone journey
    this.agentMesh = config.agentMesh;       // Agent network
    this.skillsEngine = config.skillsEngine; // Multi-skill progression
    this.learningEngine = config.learningEngine; // Core learning platform

    // Orchestration state
    this.userId = config.userId || 'cal';
    this.cycleInterval = config.cycleInterval || 300000; // 5 minutes
    this.isRunning = false;
    this.currentCycle = 0;
    this.currentTier = 1;

    // Log userId for debugging
    console.log(`[CalMetaOrchestrator] Configured with userId: ${this.userId}`);

    // Track allocation (changes based on tier)
    this.trackAllocation = {
      granular: 1.0,    // 100% lesson work at start
      systems: 0.0,     // 0% system building
      community: 0.0,   // 0% forum participation
      journey: 0.0      // 0% explicit milestone work
    };

    // Stats
    this.stats = {
      totalCycles: 0,
      lessonsCompleted: 0,
      systemsFixed: 0,
      questionsAnswered: 0,
      milestonesCompleted: 0,
      skillLevels: {},
      lastCycle: null
    };

    console.log('[CalMetaOrchestrator] Initialized');
  }

  /**
   * Start the meta-orchestration loop
   */
  async start() {
    if (this.isRunning) {
      console.warn('[CalMetaOrchestrator] Already running');
      return { success: false, message: 'Already running' };
    }

    console.log('[CalMetaOrchestrator] Starting multi-track learning...');
    this.isRunning = true;

    // Run first cycle immediately
    await this.runCycle();

    // Schedule subsequent cycles
    this.cycleIntervalId = setInterval(async () => {
      await this.runCycle();
    }, this.cycleInterval);

    return {
      success: true,
      message: 'Meta-orchestrator started',
      cycleInterval: this.cycleInterval
    };
  }

  /**
   * Stop the orchestration loop
   */
  stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Not running' };
    }

    console.log('[CalMetaOrchestrator] Stopping...');
    this.isRunning = false;

    if (this.cycleIntervalId) {
      clearInterval(this.cycleIntervalId);
      this.cycleIntervalId = null;
    }

    return {
      success: true,
      message: 'Meta-orchestrator stopped',
      stats: this.stats
    };
  }

  /**
   * Run one orchestration cycle
   * Coordinates all tracks based on current tier and allocation
   */
  async runCycle() {
    this.currentCycle++;
    const startTime = Date.now();

    console.log(`\n[CalMetaOrchestrator] ═══ Cycle ${this.currentCycle} ═══`);

    try {
      // 1. Update tier and adjust track allocation
      await this.updateTierAndAllocation();

      // 2. Guardian: System health check (always runs)
      const guardianResult = await this.runGuardianCheck();

      // 3. Granular work: Complete lessons (weighted by allocation)
      const lessonResult = await this.runGranularWork();

      // 4. Community work: Check forum questions (weighted by allocation)
      const communityResult = await this.runCommunityWork();

      // 5. Journey work: Update milestone progress
      const journeyResult = await this.runJourneyWork();

      // 6. Award XP across multiple skills
      await this.awardMultiSkillXP({
        lessons: lessonResult,
        guardian: guardianResult,
        community: communityResult,
        journey: journeyResult
      });

      // 7. Broadcast progress to agent mesh
      await this.broadcastProgress();

      // 8. Update stats
      this.stats.totalCycles++;
      this.stats.lastCycle = new Date().toISOString();

      const duration = Date.now() - startTime;

      console.log(`[CalMetaOrchestrator] ✓ Cycle ${this.currentCycle} complete (${duration}ms)`);
      console.log(`   Tier: ${this.currentTier} | Allocation: ${JSON.stringify(this.trackAllocation)}`);

      this.emit('cycle:complete', {
        cycle: this.currentCycle,
        duration,
        tier: this.currentTier,
        allocation: this.trackAllocation,
        results: { guardianResult, lessonResult, communityResult, journeyResult }
      });

    } catch (error) {
      console.error('[CalMetaOrchestrator] Cycle error:', error);
      this.emit('cycle:error', {
        cycle: this.currentCycle,
        error: error.message
      });
    }
  }

  /**
   * Update Cal's current tier and adjust track allocation
   * Implements "halfway to max" branching logic
   */
  async updateTierAndAllocation() {
    try {
      // Validate userId before DB operations
      if (!this.userId || this.userId === 'undefined' || this.userId === 'null') {
        console.log('[CalMetaOrchestrator] Skipping tier update - no valid user');
        return;
      }

      // Get Cal's total XP from learning engine
      const progress = await this.learningEngine.getUserProgress(this.userId);

      if (!progress || progress.length === 0) {
        console.log('[CalMetaOrchestrator] No progress data for user:', this.userId);
        return;
      }

      const totalXP = progress[0].total_xp_earned || 0;
      const tierLevel = Math.floor(Math.sqrt(totalXP)); // sqrt formula

      this.currentTier = tierLevel;

      // Adjust allocation based on tier (branching logic)
      if (tierLevel < 10) {
        // Newcomer: 100% lessons
        this.trackAllocation = { granular: 1.0, systems: 0.0, community: 0.0, journey: 0.0 };
      } else if (tierLevel < 20) {
        // Beginner: 70% lessons, 20% systems, 10% community
        this.trackAllocation = { granular: 0.7, systems: 0.2, community: 0.1, journey: 0.0 };
      } else if (tierLevel < 30) {
        // Intermediate: 40% lessons, 30% systems, 30% community
        // THIS IS THE "HALFWAY TO MAX" SPLIT
        this.trackAllocation = { granular: 0.4, systems: 0.3, community: 0.3, journey: 0.0 };
      } else {
        // Advanced+: 25% lessons, 25% systems, 25% community, 25% journey
        this.trackAllocation = { granular: 0.25, systems: 0.25, community: 0.25, journey: 0.25 };
      }

    } catch (error) {
      console.error('[CalMetaOrchestrator] Tier update error:', error);
    }
  }

  /**
   * Run Guardian system health check
   */
  async runGuardianCheck() {
    try {
      console.log('[CalMetaOrchestrator] Running Guardian health check...');
      const result = await this.guardian.monitor();

      if (result.status === 'healed') {
        this.stats.systemsFixed++;
        console.log(`[CalMetaOrchestrator] 🛠️  Guardian healed system issues`);
      }

      return result;
    } catch (error) {
      console.error('[CalMetaOrchestrator] Guardian check error:', error);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Run granular lesson work (weighted by allocation)
   */
  async runGranularWork() {
    const shouldRun = Math.random() < this.trackAllocation.granular;

    if (!shouldRun) {
      console.log('[CalMetaOrchestrator] Skipping granular work this cycle');
      return { skipped: true };
    }

    try {
      console.log('[CalMetaOrchestrator] Running lesson iteration...');
      await this.calLoop.runIteration();
      this.stats.lessonsCompleted++;

      return { success: true, lessonsCompleted: 1 };
    } catch (error) {
      console.error('[CalMetaOrchestrator] Granular work error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run community forum work (weighted by allocation)
   */
  async runCommunityWork() {
    const shouldRun = Math.random() < this.trackAllocation.community;

    if (!shouldRun) {
      console.log('[CalMetaOrchestrator] Skipping community work this cycle');
      return { skipped: true };
    }

    try {
      console.log('[CalMetaOrchestrator] Checking forum for questions...');
      await this.forumMonitor.checkForumQuestions();

      // Forum monitor tracks its own stats
      this.stats.questionsAnswered = this.forumMonitor.stats.questionsAnswered || 0;

      return { success: true };
    } catch (error) {
      console.error('[CalMetaOrchestrator] Community work error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run milestone journey work
   */
  async runJourneyWork() {
    const shouldRun = Math.random() < this.trackAllocation.journey;

    if (!shouldRun) {
      console.log('[CalMetaOrchestrator] Skipping journey work this cycle');
      return { skipped: true };
    }

    try {
      console.log('[CalMetaOrchestrator] Updating milestone progress...');
      const progress = await this.studentLauncher.getProgress(this.userId);

      this.stats.milestonesCompleted = progress.stats.completedCount || 0;

      return { success: true, progress };
    } catch (error) {
      console.error('[CalMetaOrchestrator] Journey work error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Award XP across multiple skills based on cycle results
   */
  async awardMultiSkillXP(results) {
    if (!this.skillsEngine) {
      console.log('[CalMetaOrchestrator] Skills engine not configured');
      return;
    }

    // Validate userId before DB operations
    if (!this.userId || this.userId === 'undefined' || this.userId === 'null') {
      console.log('[CalMetaOrchestrator] Skipping XP award - no valid user');
      return;
    }

    try {
      // Award XP for different activities
      if (results.lessons && results.lessons.success) {
        await this.skillsEngine.awardXP(this.userId, 'Debugging', 50, 'complete_lesson', 'meta_orchestrator');
      }

      if (results.guardian && results.guardian.status === 'healed') {
        await this.skillsEngine.awardXP(this.userId, 'System Design', 100, 'auto_heal', 'guardian');
      }

      if (results.community && results.community.success) {
        await this.skillsEngine.awardXP(this.userId, 'Teaching', 75, 'answer_question', 'forum');
      }

      if (results.journey && results.journey.progress) {
        await this.skillsEngine.awardXP(this.userId, 'Project Management', 150, 'milestone', 'journey');
      }

      // Update skill levels in stats
      const skills = await this.skillsEngine.getUserSkillProgress(this.userId);
      this.stats.skillLevels = skills.reduce((acc, skill) => {
        acc[skill.skill_name] = skill.current_level;
        return acc;
      }, {});

    } catch (error) {
      console.error('[CalMetaOrchestrator] XP award error:', error);
    }
  }

  /**
   * Broadcast Cal's progress to agent mesh
   */
  async broadcastProgress() {
    try {
      // Check if agentMesh is available and has sendMessage method
      if (!this.agentMesh || typeof this.agentMesh.sendMessage !== 'function') {
        console.log('[CalMetaOrchestrator] Skipping broadcast - agent mesh not available');
        return;
      }

      await this.agentMesh.sendMessage('cal', 'guardian', {
        type: 'progress_update',
        tier: this.currentTier,
        stats: this.stats,
        allocation: this.trackAllocation,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CalMetaOrchestrator] Broadcast error:', error);
    }
  }

  /**
   * Get current status
   */
  async getStatus() {
    return {
      userId: this.userId,
      isRunning: this.isRunning,
      currentCycle: this.currentCycle,
      currentTier: this.currentTier,
      trackAllocation: this.trackAllocation,
      stats: this.stats,
      cycleInterval: this.cycleInterval
    };
  }

  /**
   * Manually adjust track allocation (for testing/debugging)
   */
  setTrackAllocation(allocation) {
    this.trackAllocation = {
      granular: allocation.granular || 0,
      systems: allocation.systems || 0,
      community: allocation.community || 0,
      journey: allocation.journey || 0
    };

    console.log('[CalMetaOrchestrator] Track allocation updated:', this.trackAllocation);
  }
}

module.exports = CalMetaOrchestrator;
