/**
 * Cal Learning Loop
 *
 * Continuous loop that runs Cal through debugging lessons
 * with tier tracking and progress monitoring.
 *
 * Features:
 * - Runs debugging lessons automatically
 * - Tracks XP and tier progression
 * - Logs each iteration with time differentials
 * - Can be started/stopped via API
 * - Integrates with CalStudentLauncher for milestone tracking
 */

const EventEmitter = require('events');
const CalStudentLauncher = require('./cal-student-launcher');
const LearningEngine = require('./learning-engine');
const CalFailureLearner = require('./cal-failure-learner');
const CalSkillTracker = require('./cal-skill-tracker');
const CalAPIClient = require('./cal-api-client');

class CalLearningLoop extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.userId = options.userId || 'cal';
    this.interval = options.interval || 60000; // Run every minute
    this.debugLesson = options.debugLesson || true; // Auto-run debug lesson
    this.sandboxMode = options.sandboxMode || false; // Safe execution mode
    this.broadcast = options.broadcast || null; // WebSocket broadcast function

    // Initialize systems (pass pool explicitly to avoid db connection issues)
    this.calLauncher = new CalStudentLauncher({ pool: this.db });
    this.learningEngine = new LearningEngine(this.db);
    this.failureLearner = new CalFailureLearner();
    this.skillTracker = new CalSkillTracker();
    this.calAPIClient = new CalAPIClient({ userId: this.userId, source: 'cal-learning-loop' });

    // Safe commands whitelist (read-only operations)
    this.safeCommands = [
      'grep', 'cat', 'ls', 'head', 'tail', 'wc', 'find',
      'echo', 'pwd', 'which', 'type', 'file', 'stat',
      'jq', 'curl', 'npm run vos', 'lsof', 'ps', 'date'
    ];

    // State
    this.isRunning = false;
    this.currentIteration = 0;
    this.loopInterval = null;
    this.currentLesson = null; // Track what Cal is currently learning
    this.needsHelp = false; // Flag when Cal is stuck
    this.stats = {
      totalIterations: 0,
      totalXpEarned: 0,
      totalLessonsCompleted: 0,
      currentTier: 0,
      errors: 0,
      lastRun: null,
      helpRequests: 0
    };

    console.log(`[CalLearningLoop] Initialized (sandbox: ${this.sandboxMode})`);
  }

  /**
   * Start the learning loop
   */
  async start() {
    if (this.isRunning) {
      console.warn('[CalLearningLoop] Already running');
      return { success: false, message: 'Loop already running' };
    }

    console.log('[CalLearningLoop] Starting learning loop...');
    this.isRunning = true;

    // Load learning systems
    await this.failureLearner.load();
    await this.skillTracker.load();

    // Initialize Triangle API client
    try {
      await this.calAPIClient.init();
      console.log('[CalLearningLoop] Triangle API client ready');
    } catch (error) {
      console.warn('[CalLearningLoop] Triangle API unavailable:', error.message);
    }

    // Run immediately
    await this.runIteration();

    // Then run on interval
    this.loopInterval = setInterval(async () => {
      await this.runIteration();
    }, this.interval);

    this.emit('started', { userId: this.userId, interval: this.interval });

    return {
      success: true,
      message: 'Cal learning loop started',
      interval: this.interval
    };
  }

  /**
   * Stop the learning loop
   */
  stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Loop not running' };
    }

    console.log('[CalLearningLoop] Stopping learning loop...');
    this.isRunning = false;

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    this.emit('stopped', { totalIterations: this.stats.totalIterations });

    return {
      success: true,
      message: 'Cal learning loop stopped',
      stats: this.stats
    };
  }

  /**
   * Run one iteration of the learning loop
   */
  async runIteration() {
    const startTime = Date.now();
    this.currentIteration++;

    console.log(`\n[CalLearningLoop] Running iteration ${this.currentIteration}...`);

    try {
      // Get Cal's current progress
      const progress = await this.calLauncher.getProgress(this.userId);

      console.log(`[CalLearningLoop] Current tier: ${progress.stats.currentMilestone}`);
      console.log(`[CalLearningLoop] Completion: ${(progress.stats.completionRate * 100).toFixed(1)}%`);

      // Run debug lesson if enabled
      if (this.debugLesson) {
        await this.runDebugLesson();
      }

      // Update stats
      const endTime = Date.now();
      const timeDifferential = endTime - startTime;

      this.stats.totalIterations++;
      this.stats.lastRun = new Date().toISOString();

      // Emit iteration complete event
      this.emit('iteration', {
        iteration: this.currentIteration,
        timeDifferential,
        stats: this.stats
      });

      console.log(`[CalLearningLoop] ✓ Iteration ${this.currentIteration} complete (${timeDifferential}ms)`);

    } catch (error) {
      console.error('[CalLearningLoop] Iteration error:', error);
      this.stats.errors++;

      this.emit('error', {
        iteration: this.currentIteration,
        error: error.message
      });
    }
  }

  /**
   * Run the next incomplete lesson (actually executes exercises)
   */
  async runDebugLesson() {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    try {
      // Get or create debugging path
      const pathSlug = 'debugging-mastery';

      // Enroll if not already enrolled
      try {
        await this.learningEngine.enrollUser(this.userId, pathSlug);
      } catch (error) {
        // Already enrolled or enrollment failed - log but continue
        if (!error.message.includes('already enrolled')) {
          console.log(`[CalLearningLoop] Enrollment note: ${error.message}`);
        }
      }

      // Get lessons in path
      const lessons = await this.learningEngine.getLessons(pathSlug);

      if (lessons.length === 0) {
        console.warn('[CalLearningLoop] No lessons found in debugging-mastery path');
        return;
      }

      // Find completed lessons
      const completedResult = await this.db.query(
        `SELECT lesson_id FROM lesson_completions WHERE user_id = $1`,
        [this.userId]
      );
      const completedIds = completedResult.rows.map(r => r.lesson_id);

      // Find next incomplete lesson
      const nextLesson = lessons.find(l => !completedIds.includes(l.lesson_id));

      if (!nextLesson) {
        console.log('[CalLearningLoop] 🎓 All lessons completed!');
        return;
      }

      console.log(`\n[CalLearningLoop] 📖 Starting Lesson ${nextLesson.lesson_number}: ${nextLesson.lesson_title}`);

      // Store current lesson for status queries
      this.currentLesson = {
        lesson_number: nextLesson.lesson_number,
        lesson_title: nextLesson.lesson_title,
        exercises: nextLesson.content_data?.exercises || []
      };

      // Broadcast to WebSocket clients
      if (this.broadcast) {
        this.broadcast({
          type: 'cal:lesson_start',
          userId: this.userId,
          lesson: {
            number: nextLesson.lesson_number,
            title: nextLesson.lesson_title,
            exercises: nextLesson.content_data?.exercises?.length || 0
          }
        });
      }

      // Execute lesson exercises
      const startTime = Date.now();
      const exerciseResults = [];
      const exercises = nextLesson.content_data?.exercises || [];

      if (exercises.length > 0) {
        console.log(`[CalLearningLoop]    Found ${exercises.length} exercises to complete`);

        for (let i = 0; i < exercises.length; i++) {
          const exercise = exercises[i];
          console.log(`\n[CalLearningLoop]    Exercise ${i + 1}/${exercises.length}: ${exercise.task}`);
          console.log(`[CalLearningLoop]    Command: ${exercise.command}`);

          // Broadcast exercise start
          if (this.broadcast) {
            this.broadcast({
              type: 'cal:exercise_start',
              userId: this.userId,
              exercise: {
                number: i + 1,
                total: exercises.length,
                task: exercise.task,
                command: exercise.command
              }
            });
          }

          // Check if command is safe (in sandbox mode)
          const isSafe = this._isCommandSafe(exercise.command);

          if (this.sandboxMode && !isSafe) {
            console.log(`[CalLearningLoop]    🔒 Command blocked (sandbox mode)`);

            exerciseResults.push({
              exercise: i + 1,
              task: exercise.task,
              command: exercise.command,
              success: false,
              blocked: true,
              reason: 'sandbox_mode_unsafe_command'
            });

            // Broadcast blocked command
            if (this.broadcast) {
              this.broadcast({
                type: 'cal:exercise_blocked',
                userId: this.userId,
                exercise: { command: exercise.command, reason: 'unsafe in sandbox mode' }
              });
            }

            continue;
          }

          try {
            // Execute the command
            const output = execSync(exercise.command, {
              cwd: process.cwd(),
              encoding: 'utf8',
              timeout: 10000,
              maxBuffer: 1024 * 1024
            });

            console.log(`[CalLearningLoop]    ✓ Success`);
            if (exercise.explanation) {
              console.log(`[CalLearningLoop]    💡 ${exercise.explanation}`);
            }

            // Record success in learning systems
            const skillId = `lesson-${nextLesson.lesson_number}-ex-${i + 1}`;
            await this.skillTracker.recordAttempt(skillId, true, {
              approach: 'command-execution',
              command: exercise.command
            });
            await this.failureLearner.recordSuccess(skillId, 'command-execution');

            exerciseResults.push({
              exercise: i + 1,
              task: exercise.task,
              command: exercise.command,
              success: true,
              output: output.substring(0, 200), // Limit output size
              attribution: 'skill' // Success = Cal's skill
            });

            // Broadcast success
            if (this.broadcast) {
              this.broadcast({
                type: 'cal:exercise_complete',
                userId: this.userId,
                exercise: { number: i + 1, success: true }
              });
            }

          } catch (error) {
            console.log(`[CalLearningLoop]    ⚠️  Command failed (non-critical)`);

            // Record failure in learning systems
            const skillId = `lesson-${nextLesson.lesson_number}-ex-${i + 1}`;
            const failureResult = await this.failureLearner.recordFailure(
              skillId,
              error.message,
              { approach: 'command-execution', command: exercise.command }
            );
            await this.skillTracker.recordAttempt(skillId, false, {
              approach: 'command-execution',
              command: exercise.command
            });

            // Check if we should try alternative approach
            if (failureResult.shouldStop) {
              console.log(`[CalLearningLoop]    💡 ${failureResult.suggestion}`);
              const alternatives = this.failureLearner.getAlternatives(skillId);
              if (alternatives.length > 0) {
                console.log(`[CalLearningLoop]    📋 Try: ${alternatives[0].approach}`);
              }

              // If stuck (3+ failures), ask Triangle API for help
              const failureCount = await this.failureLearner.getFailureCount(skillId);
              if (failureCount >= 3 && this.calAPIClient) {
                console.log(`[CalLearningLoop]    🤔 Cal is stuck (${failureCount} failures). Requesting AI assistance...`);
                try {
                  const aiHelp = await this.requestAIHelp({
                    task: exercise.task,
                    command: exercise.command,
                    error: error.message,
                    explanation: exercise.explanation,
                    lessonTitle: nextLesson.lesson_title
                  });

                  if (aiHelp.success) {
                    console.log(`[CalLearningLoop]    🧠 AI Consensus:`);
                    console.log(`[CalLearningLoop]       ${aiHelp.consensus.substring(0, 200)}...`);
                    console.log(`[CalLearningLoop]       Confidence: ${(aiHelp.confidence * 100).toFixed(0)}%`);

                    // Store AI suggestion for future attempts
                    await this.failureLearner.recordAISuggestion(skillId, aiHelp.consensus, {
                      confidence: aiHelp.confidence,
                      providers: aiHelp.providers,
                      attribution: 'ai-assisted'
                    });

                    this.stats.helpRequests++;
                  }
                } catch (aiError) {
                  console.warn(`[CalLearningLoop]    ⚠️  AI help failed: ${aiError.message}`);
                }
              }
            }

            exerciseResults.push({
              exercise: i + 1,
              task: exercise.task,
              command: exercise.command,
              success: false,
              error: error.message.substring(0, 200),
              attribution: 'luck', // Failure = needs more practice
              suggestedFix: failureResult.suggestion
            });

            // Broadcast failure
            if (this.broadcast) {
              this.broadcast({
                type: 'cal:exercise_failed',
                userId: this.userId,
                exercise: {
                  number: i + 1,
                  error: error.message.substring(0, 100),
                  suggestion: failureResult.suggestion
                }
              });
            }
          }
        }
      } else {
        console.log(`[CalLearningLoop]    No exercises found - conceptual lesson`);
      }

      const timeDifferential = Date.now() - startTime;

      // Calculate attribution (skill vs luck)
      const attribution = this._calculateAttribution(exerciseResults);

      // Complete the lesson
      const result = await this.learningEngine.completeLesson(this.userId, nextLesson.lesson_id, {
        timeSpentSeconds: Math.floor(timeDifferential / 1000),
        perfect: exerciseResults.every(r => r.success),
        metadata: {
          automated: true,
          loopIteration: this.currentIteration,
          exercisesCompleted: exerciseResults.length,
          exerciseResults: exerciseResults,
          attribution: attribution, // Skill vs luck tracking
          sandboxMode: this.sandboxMode
        }
      });

      // Update stats
      if (result.success) {
        this.stats.totalXpEarned += result.xpEarned || 0;
        this.stats.totalLessonsCompleted++;
        this.stats.currentTier = result.newLevel || 0;

        console.log(`\n[CalLearningLoop] ✅ Lesson ${nextLesson.lesson_number} completed!`);
        console.log(`[CalLearningLoop]    XP Earned: ${result.xpEarned}`);
        console.log(`[CalLearningLoop]    New Tier: ${result.newLevel}`);
        console.log(`[CalLearningLoop]    Time: ${timeDifferential}ms`);
        console.log(`[CalLearningLoop]    Exercises: ${exerciseResults.filter(r => r.success).length}/${exerciseResults.length} succeeded`);
        console.log(`[CalLearningLoop]    Attribution: ${attribution.type} (${(attribution.confidence * 100).toFixed(0)}% - ${attribution.description})\n`);

        // Broadcast lesson complete
        if (this.broadcast) {
          this.broadcast({
            type: 'cal:lesson_complete',
            userId: this.userId,
            lesson: {
              number: nextLesson.lesson_number,
              title: nextLesson.lesson_title,
              xp: result.xpEarned,
              tier: result.newLevel,
              exercises: {
                total: exerciseResults.length,
                succeeded: exerciseResults.filter(r => r.success).length
              },
              attribution: attribution
            }
          });
        }

        // Reset current lesson
        this.currentLesson = null;
      }

    } catch (error) {
      // Lesson might already be completed, that's ok
      if (!error.message.includes('already completed')) {
        console.error('[CalLearningLoop] Lesson error:', error);
      }
    }
  }

  /**
   * Check if a command is safe to execute
   * @private
   */
  _isCommandSafe(command) {
    // Validate command exists and is a string
    if (!command || typeof command !== 'string') {
      console.warn('[CalLearningLoop] Invalid command (null or non-string)');
      return false;
    }

    // Check if command starts with a safe command
    const firstWord = command.trim().split(/\s+/)[0];

    // Allow commands in safe list
    for (const safeCmd of this.safeCommands) {
      if (command.startsWith(safeCmd)) {
        return true;
      }
    }

    // Block commands with dangerous operations
    const dangerousPatterns = [
      'rm ', 'mv ', 'cp ', 'chmod ', 'chown ',
      'sed -i', 'awk -i', '>>', '>',
      'sudo', 'su ', 'kill', 'shutdown',
      'reboot', 'dd ', 'mkfs', 'format'
    ];

    for (const pattern of dangerousPatterns) {
      if (command.includes(pattern)) {
        return false;
      }
    }

    return false; // Default to unsafe
  }

  /**
   * Calculate attribution (skill vs luck) based on success rate
   * @private
   */
  _calculateAttribution(exerciseResults) {
    if (exerciseResults.length === 0) {
      return { type: 'none', confidence: 0 };
    }

    const successCount = exerciseResults.filter(r => r.success).length;
    const totalCount = exerciseResults.length;
    const successRate = successCount / totalCount;

    // Attribution logic (poker-style variance)
    if (successRate >= 0.9) {
      // 90%+ success = Skill
      return {
        type: 'skill',
        confidence: successRate,
        successCount,
        totalCount,
        description: 'Consistent mastery'
      };
    } else if (successRate >= 0.6) {
      // 60-90% = Mix of skill and luck
      return {
        type: 'mixed',
        confidence: successRate,
        successCount,
        totalCount,
        description: 'Learning in progress'
      };
    } else {
      // <60% = Mostly luck / needs more practice
      return {
        type: 'luck',
        confidence: 1 - successRate,
        successCount,
        totalCount,
        description: 'Needs more practice'
      };
    }
  }

  /**
   * Request human help (emits event for WebSocket clients)
   */
  async requestHelp(reason) {
    this.needsHelp = true;
    this.stats.helpRequests++;

    console.log(`[CalLearningLoop] 🆘 Cal needs help: ${reason}`);

    if (this.broadcast) {
      this.broadcast({
        type: 'cal:needs_help',
        userId: this.userId,
        reason,
        currentLesson: this.currentLesson,
        timestamp: new Date().toISOString()
      });
    }

    this.emit('help_needed', {
      userId: this.userId,
      reason,
      currentLesson: this.currentLesson
    });
  }

  /**
   * Request AI help via Triangle Consensus API
   * Asks all 3 providers for help when Cal is stuck
   */
  async requestAIHelp(context) {
    const { task, command, error, explanation, lessonTitle } = context;

    // Build contextual prompt
    const prompt = `I'm learning ${lessonTitle}. I'm stuck on this exercise:

Task: ${task}
Command I tried: ${command}
${explanation ? `Expected behavior: ${explanation}` : ''}

Error I got: ${error}

Can you explain what went wrong and how to fix it? Please be concise and educational.`;

    try {
      // Query Triangle API (all 3 providers)
      const result = await this.calAPIClient.triangle({
        prompt,
        taskType: 'code',
        synthesize: true,
        generateStory: false,
        context: {
          calLearning: true,
          lessonTitle,
          task,
          command,
          error
        }
      });

      if (result.success) {
        return {
          success: true,
          consensus: result.consensus.synthesized,
          confidence: result.consensus.confidence,
          providers: {
            openai: result.responses.openai?.response,
            anthropic: result.responses.anthropic?.response,
            deepseek: result.responses.deepseek?.response
          },
          billing: result.billing
        };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('[CalLearningLoop] AI help request failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current status
   */
  async getStatus() {
    try {
      // Get Cal's progress
      const progress = await this.calLauncher.getProgress(this.userId);

      // Get user progress from learning engine
      const learningProgress = await this.db.query(`
        SELECT
          up.*,
          FLOOR(SQRT(up.total_xp_earned)) as tier_level,
          CASE
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 10 THEN 'Newcomer'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 20 THEN 'Beginner'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 30 THEN 'Intermediate'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 40 THEN 'Advanced'
            ELSE 'Expert'
          END as tier_name,
          lp.path_name
        FROM user_progress up
        JOIN learning_paths lp ON up.path_id = lp.path_id
        WHERE up.user_id = $1
        ORDER BY up.started_at DESC
        LIMIT 1
      `, [this.userId]);

      const userProgress = learningProgress.rows[0] || null;

      return {
        userId: this.userId,
        isRunning: this.isRunning,
        stats: this.stats,
        calProgress: progress,
        learningProgress: userProgress,
        currentIteration: this.currentIteration
      };

    } catch (error) {
      console.error('[CalLearningLoop] Get status error:', error);
      return {
        userId: this.userId,
        isRunning: this.isRunning,
        stats: this.stats,
        error: error.message
      };
    }
  }

  /**
   * Get logs with tier tracking
   */
  async getLogs(limit = 20) {
    try {
      const result = await this.db.query(`
        SELECT
          lc.completed_at,
          l.lesson_number,
          l.lesson_title,
          lc.xp_earned,
          lc.time_spent_seconds,
          lc.perfect_score,
          lc.attempts,
          up.total_xp_earned,
          FLOOR(SQRT(up.total_xp_earned)) as tier_level,
          CASE
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 10 THEN 'Newcomer'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 20 THEN 'Beginner'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 30 THEN 'Intermediate'
            WHEN FLOOR(SQRT(up.total_xp_earned)) < 40 THEN 'Advanced'
            ELSE 'Expert'
          END as tier_name,
          lp.path_name,
          l.content_data
        FROM lesson_completions lc
        JOIN lessons l ON lc.lesson_id = l.lesson_id
        JOIN user_progress up ON lc.progress_id = up.progress_id
        JOIN learning_paths lp ON up.path_id = lp.path_id
        WHERE lc.user_id = $1
        ORDER BY lc.completed_at DESC
        LIMIT $2
      `, [this.userId, limit]);

      return {
        success: true,
        logs: result.rows,
        totalLogs: result.rows.length
      };

    } catch (error) {
      console.error('[CalLearningLoop] Get logs error:', error);
      return {
        success: false,
        error: error.message,
        logs: []
      };
    }
  }
}

module.exports = CalLearningLoop;
