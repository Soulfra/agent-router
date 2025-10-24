#!/usr/bin/env node

/**
 * CALOS AI Edutech Platform Launcher
 *
 * Orchestrates all platform components:
 * 1. Learning Engine - Gamified lessons & XP
 * 2. Training Tasks - Gamified data collection
 * 3. Learning Loop - Continuous fine-tuning
 * 4. RL Optimizer - Command optimization
 * 5. Meme Generator - Viral content on milestones
 *
 * Usage:
 *   node scripts/launch-platform.js
 *   node scripts/launch-platform.js --port=3000
 *   node scripts/launch-platform.js --disable-rl
 *   node scripts/launch-platform.js --dry-run
 */

const { Pool } = require('pg');
const LearningEngine = require('../lib/learning-engine');
const RLCommandLearner = require('../lib/rl-command-learner');
const DevRagebaitGenerator = require('../lib/dev-ragebait-generator');

class PlatformLauncher {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      enableRL: options.enableRL !== false,
      enableMemes: options.enableMemes !== false,
      enableFineTuning: options.enableFineTuning !== false,
      dryRun: options.dryRun || false,
      ...options
    };

    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    this.components = {
      learningEngine: null,
      rlOptimizer: null,
      memeGenerator: null,
      trainingCollector: null,
      learningLoop: null
    };

    this.status = {
      running: false,
      startedAt: null,
      stats: {
        lessonsCompleted: 0,
        trainingExamplesCollected: 0,
        memesGenerated: 0,
        fineTunesTriggered: 0
      }
    };
  }

  async launch() {
    console.log('🚀 Launching CALOS AI Edutech Platform...\n');

    if (this.options.dryRun) {
      console.log('🔍 DRY RUN MODE - No actual changes will be made\n');
    }

    try {
      // 1. Initialize Learning Engine
      console.log('📚 Initializing Learning Engine...');
      await this.initLearningEngine();

      // 2. Initialize Training Task Collector
      console.log('🎯 Initializing Training Task Collector...');
      await this.initTrainingCollector();

      // 3. Initialize RL Optimizer (optional)
      if (this.options.enableRL) {
        console.log('🧠 Initializing RL Command Optimizer...');
        await this.initRLOptimizer();
      } else {
        console.log('⏭️  Skipping RL Optimizer (disabled)');
      }

      // 4. Initialize Meme Generator (optional)
      if (this.options.enableMemes) {
        console.log('🎨 Initializing Meme Generator...');
        await this.initMemeGenerator();
      } else {
        console.log('⏭️  Skipping Meme Generator (disabled)');
      }

      // 5. Initialize Learning Loop / Fine-tuning (optional)
      if (this.options.enableFineTuning) {
        console.log('🤖 Initializing Fine-tuning Loop...');
        await this.initLearningLoop();
      } else {
        console.log('⏭️  Skipping Fine-tuning Loop (disabled)');
      }

      // 6. Start monitoring
      console.log('👀 Starting monitoring & event handlers...');
      await this.startMonitoring();

      this.status.running = true;
      this.status.startedAt = new Date();

      console.log('\n✅ Platform launched successfully!');
      console.log(`   Port: ${this.options.port}`);
      console.log(`   RL Optimizer: ${this.options.enableRL ? 'enabled' : 'disabled'}`);
      console.log(`   Meme Generator: ${this.options.enableMemes ? 'enabled' : 'disabled'}`);
      console.log(`   Fine-tuning: ${this.options.enableFineTuning ? 'enabled' : 'disabled'}`);
      console.log(`\n📊 Run 'node scripts/generate-edutech-report.js' to view platform metrics\n`);

      // Keep running
      if (!this.options.dryRun) {
        this.printStatus();
        setInterval(() => this.printStatus(), 60000); // Every minute
      }

    } catch (err) {
      console.error('❌ Failed to launch platform:', err);
      await this.shutdown();
      process.exit(1);
    }
  }

  async initLearningEngine() {
    try {
      this.components.learningEngine = new LearningEngine(this.db);
      await this.components.learningEngine.init();

      // Get stats
      const stats = await this.db.query(`
        SELECT COUNT(*) as paths FROM learning_paths WHERE active = true
      `);
      const lessonStats = await this.db.query(`
        SELECT COUNT(*) as lessons FROM lessons WHERE active = true
      `);

      console.log(`   ✓ Learning paths: ${stats.rows[0].paths}`);
      console.log(`   ✓ Active lessons: ${lessonStats.rows[0].lessons}`);
    } catch (err) {
      console.error('   ✗ Failed to initialize learning engine:', err.message);
      throw err;
    }
  }

  async initTrainingCollector() {
    try {
      // Check if training_tasks table exists
      const tableCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'training_tasks'
        ) as exists
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('   ⚠️  training_tasks table not found, creating...');

        if (!this.options.dryRun) {
          await this.db.query(`
            CREATE TABLE IF NOT EXISTS training_tasks (
              task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(user_id),
              task_type VARCHAR(50) NOT NULL,
              task_data JSONB NOT NULL,
              response JSONB,
              quality_score INT,
              status VARCHAR(20) DEFAULT 'pending',
              created_at TIMESTAMP DEFAULT NOW(),
              completed_at TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_training_tasks_user ON training_tasks(user_id);
            CREATE INDEX IF NOT EXISTS idx_training_tasks_type ON training_tasks(task_type);
            CREATE INDEX IF NOT EXISTS idx_training_tasks_status ON training_tasks(status);
          `);
          console.log('   ✓ Created training_tasks table');
        }
      }

      // Set up event listener for lesson completion -> prompt training task
      if (this.components.learningEngine) {
        this.components.learningEngine.on('lessonCompleted', async (data) => {
          await this.onLessonCompleted(data);
        });
      }

      console.log('   ✓ Training task collector ready');
    } catch (err) {
      console.error('   ✗ Failed to initialize training collector:', err.message);
      throw err;
    }
  }

  async initRLOptimizer() {
    try {
      this.components.rlOptimizer = new RLCommandLearner({
        learningRate: 0.1,
        discountFactor: 0.9,
        explorationRate: 0.2
      });

      await this.components.rlOptimizer.init();

      // Get stats
      const stats = await this.components.rlOptimizer.getStats();
      console.log(`   ✓ Commands tracked: ${stats.totalCommands || 0}`);
      console.log(`   ✓ Avg success rate: ${((stats.avgSuccessRate || 0) * 100).toFixed(1)}%`);
    } catch (err) {
      console.error('   ✗ Failed to initialize RL optimizer:', err.message);
      throw err;
    }
  }

  async initMemeGenerator() {
    try {
      this.components.memeGenerator = new DevRagebaitGenerator({
        width: 1200,
        height: 676,
        frameDuration: 1.0
      });

      const templates = this.components.memeGenerator.getTemplates();
      console.log(`   ✓ Meme templates loaded: ${templates.length}`);

      // Set up event listeners for milestones
      if (this.components.learningEngine) {
        this.components.learningEngine.on('levelUp', async (data) => {
          await this.onLevelUp(data);
        });

        this.components.learningEngine.on('achievementUnlocked', async (data) => {
          await this.onAchievementUnlocked(data);
        });
      }
    } catch (err) {
      console.error('   ✗ Failed to initialize meme generator:', err.message);
      throw err;
    }
  }

  async initLearningLoop() {
    try {
      // Check if learning loop agent exists
      const agentPath = require.resolve('../agents/learning-loop');
      console.log(`   ✓ Learning loop agent found: ${agentPath}`);

      // Note: The learning loop agent runs as a separate process
      // We don't spawn it here - user runs it separately with:
      // node agents/learning-loop.js

      console.log('   ℹ️  To enable fine-tuning, run: node agents/learning-loop.js');
    } catch (err) {
      console.log('   ⚠️  Learning loop agent not found, skipping fine-tuning');
    }
  }

  async startMonitoring() {
    // Monitor platform health
    this.monitorInterval = setInterval(async () => {
      try {
        // Check component health
        const health = await this.checkHealth();

        if (!health.healthy) {
          console.warn('⚠️  Platform health degraded:', health.issues);
        }
      } catch (err) {
        console.error('Error checking platform health:', err);
      }
    }, 30000); // Every 30 seconds

    console.log('   ✓ Monitoring started');
  }

  async checkHealth() {
    const health = {
      healthy: true,
      issues: []
    };

    try {
      // Check database connection
      await this.db.query('SELECT 1');
    } catch (err) {
      health.healthy = false;
      health.issues.push('Database connection lost');
    }

    return health;
  }

  async onLessonCompleted(data) {
    this.status.stats.lessonsCompleted++;

    console.log(`✓ Lesson completed: "${data.lessonTitle}" by user ${data.userId}`);

    // Create training task for user
    if (!this.options.dryRun) {
      try {
        const taskType = this.selectTaskType(data);

        await this.db.query(`
          INSERT INTO training_tasks (user_id, task_type, task_data, status)
          VALUES ($1, $2, $3, 'pending')
        `, [data.userId, taskType, JSON.stringify({
          lessonId: data.lessonId,
          lessonTitle: data.lessonTitle,
          xpEarned: data.xpEarned
        })]);

        this.status.stats.trainingExamplesCollected++;
        console.log(`   → Created ${taskType} training task`);
      } catch (err) {
        console.error('   ✗ Failed to create training task:', err.message);
      }
    }
  }

  selectTaskType(lessonData) {
    // Rotate task types for diversity
    const types = [
      'vote_model_output',
      'rate_response',
      'chat_conversation',
      'generate_meme',
      'write_prompt'
    ];

    // Use lesson number to deterministically pick task type
    const index = (lessonData.lessonNumber || 0) % types.length;
    return types[index];
  }

  async onLevelUp(data) {
    console.log(`🎉 User ${data.userId} leveled up to ${data.newLevel}!`);

    if (this.options.enableMemes && !this.options.dryRun) {
      try {
        // Generate celebratory meme
        const templateId = this.selectMemeTemplate('level_up', data);

        const result = await this.components.memeGenerator.generate(templateId, {
          gifPath: `/tmp/memes/level-${data.newLevel}-${data.userId}.gif`
        });

        this.status.stats.memesGenerated++;
        console.log(`   → Generated meme: ${result.gif.path} (${result.gif.sizeMB} MB)`);
        console.log(`   → Caption: ${result.caption}`);
        console.log(`   → Hashtags: ${result.hashtags.join(' ')}`);

        // TODO: Auto-post to Twitter
        // await this.postToTwitter(result);
      } catch (err) {
        console.error('   ✗ Failed to generate meme:', err.message);
      }
    }
  }

  async onAchievementUnlocked(data) {
    console.log(`🏆 User ${data.userId} unlocked: "${data.achievementName}"`);

    if (this.options.enableMemes && !this.options.dryRun) {
      try {
        const templateId = this.selectMemeTemplate('achievement', data);

        const result = await this.components.memeGenerator.generate(templateId, {
          gifPath: `/tmp/memes/achievement-${data.achievementSlug}-${data.userId}.gif`
        });

        this.status.stats.memesGenerated++;
        console.log(`   → Generated achievement meme: ${result.gif.path}`);
      } catch (err) {
        console.error('   ✗ Failed to generate meme:', err.message);
      }
    }
  }

  selectMemeTemplate(eventType, data) {
    // Map events to meme templates
    const templates = {
      level_up: ['works-locally', 'quick-hotfix', 'npm-install'],
      achievement: ['works-locally', 'merge-conflict', 'css-center'],
      streak: ['npm-install', 'works-locally']
    };

    const options = templates[eventType] || ['npm-install'];
    const index = Math.floor(Math.random() * options.length);
    return options[index];
  }

  printStatus() {
    const uptime = this.status.startedAt
      ? Math.floor((Date.now() - this.status.startedAt) / 1000)
      : 0;

    console.log('\n' + '─'.repeat(50));
    console.log('📊 PLATFORM STATUS');
    console.log('─'.repeat(50));
    console.log(`Uptime: ${Math.floor(uptime / 60)}m ${uptime % 60}s`);
    console.log(`Lessons Completed: ${this.status.stats.lessonsCompleted}`);
    console.log(`Training Examples: ${this.status.stats.trainingExamplesCollected}`);
    console.log(`Memes Generated: ${this.status.stats.memesGenerated}`);
    console.log(`Fine-tunes Triggered: ${this.status.stats.fineTunesTriggered}`);
    console.log('─'.repeat(50) + '\n');
  }

  async shutdown() {
    console.log('\n🛑 Shutting down platform...');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    await this.db.end();

    console.log('✓ Shutdown complete');
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    enableRL: !args.includes('--disable-rl'),
    enableMemes: !args.includes('--disable-memes'),
    enableFineTuning: !args.includes('--disable-finetuning'),
    dryRun: args.includes('--dry-run')
  };

  args.forEach(arg => {
    if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.split('=')[1]);
    }
  });

  const launcher = new PlatformLauncher(options);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT...');
    await launcher.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM...');
    await launcher.shutdown();
    process.exit(0);
  });

  launcher.launch().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = PlatformLauncher;
