/**
 * Meme Milestone Engine
 *
 * Automatically generates viral dev memes when users hit learning milestones:
 * - Level ups
 * - Streaks (7-day, 30-day, etc.)
 * - Achievement unlocks
 * - Path completion
 * - First lesson
 * - Perfect score
 *
 * Integrates with:
 * - DevRagebaitGenerator (lib/dev-ragebait-generator.js) - Creates GIFs/MP4s
 * - LearningEngine (lib/learning-engine.js) - Listens for milestone events
 * - Twitter API - Auto-posts viral content (optional)
 *
 * Usage:
 *   const engine = new MemeMilestoneEngine({ enableTwitter: true });
 *   await engine.init();
 *   engine.watchMilestones(); // Start listening
 */

const DevRagebaitGenerator = require('./dev-ragebait-generator');
const { Pool } = require('pg');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class MemeMilestoneEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableTwitter: options.enableTwitter || false,
      enableStorage: options.enableStorage !== false,
      storageDir: options.storageDir || path.join(__dirname, '../temp/milestone-memes'),
      autoGenerate: options.autoGenerate !== false,
      ...options
    };

    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    this.memeGenerator = new DevRagebaitGenerator();

    // Milestone → Meme template mapping
    this.milestoneTemplates = {
      first_lesson: ['npm-install'],
      level_up: ['works-locally', 'quick-hotfix'],
      streak_7: ['npm-install', 'works-locally'],
      streak_30: ['merge-conflict', 'quick-hotfix'],
      achievement: ['css-center', 'merge-conflict'],
      path_complete: ['works-locally'],
      perfect_score: ['css-center']
    };
  }

  async init() {
    // Ensure storage directory exists
    if (this.options.enableStorage) {
      await fs.mkdir(this.options.storageDir, { recursive: true });
    }

    // Check if meme_analytics table exists
    const tableCheck = await this.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'meme_analytics'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      // Create meme analytics table
      await this.db.query(`
        CREATE TABLE meme_analytics (
          meme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(user_id),
          milestone_type VARCHAR(50) NOT NULL,
          template_id VARCHAR(50) NOT NULL,
          file_path TEXT,
          gif_size_mb FLOAT,
          mp4_size_mb FLOAT,
          caption TEXT,
          hashtags TEXT[],
          shares INT DEFAULT 0,
          views INT DEFAULT 0,
          engagement_rate FLOAT DEFAULT 0,
          posted_to_twitter BOOLEAN DEFAULT FALSE,
          twitter_url TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_meme_analytics_user ON meme_analytics(user_id);
        CREATE INDEX idx_meme_analytics_milestone ON meme_analytics(milestone_type);
        CREATE INDEX idx_meme_analytics_created ON meme_analytics(created_at);
      `);

      console.log('[MemeMilestoneEngine] Created meme_analytics table');
    }
  }

  /**
   * Start watching for milestone events
   * Should be called after LearningEngine is initialized
   */
  watchMilestones() {
    console.log('[MemeMilestoneEngine] Watching for milestones...');
    // Note: In real implementation, this would listen to LearningEngine events
    // For now, this is a placeholder
  }

  /**
   * Handle first lesson completion
   */
  async onFirstLesson(data) {
    const { userId, lessonTitle, pathName } = data;

    console.log(`[MemeMilestoneEngine] First lesson completed: ${userId}`);

    if (this.options.autoGenerate) {
      await this.generateMilestoneMe me({
        userId,
        milestoneType: 'first_lesson',
        context: {
          lessonTitle,
          pathName
        }
      });
    }
  }

  /**
   * Handle level up
   */
  async onLevelUp(data) {
    const { userId, newLevel, oldLevel } = data;

    console.log(`[MemeMilestoneEngine] Level up: ${userId} → Level ${newLevel}`);

    if (this.options.autoGenerate) {
      await this.generateMilestoneMeme({
        userId,
        milestoneType: 'level_up',
        context: {
          newLevel,
          oldLevel
        }
      });
    }
  }

  /**
   * Handle streak milestone
   */
  async onStreakMilestone(data) {
    const { userId, streakDays } = data;

    console.log(`[MemeMilestoneEngine] Streak milestone: ${userId} → ${streakDays} days`);

    const milestoneType = streakDays >= 30 ? 'streak_30' :
                          streakDays >= 7 ? 'streak_7' :
                          null;

    if (milestoneType && this.options.autoGenerate) {
      await this.generateMilestoneMeme({
        userId,
        milestoneType,
        context: { streakDays }
      });
    }
  }

  /**
   * Handle achievement unlock
   */
  async onAchievementUnlock(data) {
    const { userId, achievementName, achievementSlug, badgeIcon } = data;

    console.log(`[MemeMilestoneEngine] Achievement unlocked: ${userId} → ${achievementName}`);

    if (this.options.autoGenerate) {
      await this.generateMilestoneMeme({
        userId,
        milestoneType: 'achievement',
        context: {
          achievementName,
          achievementSlug,
          badgeIcon
        }
      });
    }
  }

  /**
   * Handle path completion
   */
  async onPathComplete(data) {
    const { userId, pathName, lessonsCompleted } = data;

    console.log(`[MemeMilestoneEngine] Path completed: ${userId} → ${pathName}`);

    if (this.options.autoGenerate) {
      await this.generateMilestoneMeme({
        userId,
        milestoneType: 'path_complete',
        context: {
          pathName,
          lessonsCompleted
        }
      });
    }
  }

  /**
   * Generate meme for milestone
   */
  async generateMilestoneMeme(data) {
    const { userId, milestoneType, context } = data;

    try {
      // Select template
      const templateId = this.selectTemplate(milestoneType, context);

      // Generate meme
      const outputDir = path.join(this.options.storageDir, userId);
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = Date.now();
      const result = await this.memeGenerator.generate(templateId, {
        gifPath: path.join(outputDir, `${milestoneType}-${timestamp}.gif`),
        mp4Path: path.join(outputDir, `${milestoneType}-${timestamp}.mp4`)
      });

      // Customize caption based on milestone
      const customCaption = this.generateCaption(milestoneType, context);
      const customHashtags = this.generateHashtags(milestoneType, context);

      // Store in database
      const memeId = await this.storeMeme({
        userId,
        milestoneType,
        templateId,
        filePath: result.gif.path,
        gifSizeMB: result.gif.sizeMB,
        mp4SizeMB: result.mp4.sizeMB,
        caption: customCaption,
        hashtags: customHashtags
      });

      console.log(`[MemeMilestoneEngine] Generated meme: ${memeId}`);
      console.log(`   GIF: ${result.gif.path} (${result.gif.sizeMB} MB)`);
      console.log(`   MP4: ${result.mp4.path} (${result.mp4.sizeMB} MB)`);
      console.log(`   Caption: ${customCaption}`);

      // Post to Twitter if enabled
      if (this.options.enableTwitter) {
        await this.postToTwitter({
          memeId,
          filePath: result.mp4.path, // Use MP4 for better quality
          caption: customCaption,
          hashtags: customHashtags
        });
      }

      // Emit event
      this.emit('memeGenerated', {
        memeId,
        userId,
        milestoneType,
        result
      });

      return { memeId, result };
    } catch (err) {
      console.error(`[MemeMilestoneEngine] Failed to generate meme:`, err);
      throw err;
    }
  }

  /**
   * Select appropriate template for milestone
   */
  selectTemplate(milestoneType, context) {
    const templates = this.milestoneTemplates[milestoneType] || ['npm-install'];

    // Deterministic selection based on context
    // (so same milestone type always gets same meme for a user)
    const index = Math.abs(
      (context.newLevel || context.streakDays || context.achievementName || '').toString().length
    ) % templates.length;

    return templates[index];
  }

  /**
   * Generate custom caption for milestone
   */
  generateCaption(milestoneType, context) {
    const captions = {
      first_lesson: `POV: You just started learning ${context.pathName || 'web development'}`,
      level_up: `Level ${context.newLevel} unlocked: Now I know ${context.newLevel} ways to break production`,
      streak_7: `${context.streakDays} day streak: Still waiting for senior dev status`,
      streak_30: `${context.streakDays} days of coding: My rubber duck quit on day 15`,
      achievement: `Achievement unlocked: ${context.achievementName}`,
      path_complete: `Completed ${context.pathName}: Time to update my LinkedIn "Full Stack Developer"`,
      perfect_score: `100% score: Unlike my test coverage`
    };

    return captions[milestoneType] || `Milestone achieved!`;
  }

  /**
   * Generate hashtags for milestone
   */
  generateHashtags(milestoneType, context) {
    const baseHashtags = ['#DevLife', '#CodingJourney', '#LearnToCode'];

    const specific = {
      first_lesson: ['#100DaysOfCode', '#DevCommunity'],
      level_up: ['#DevHumor', '#ProgrammerLife'],
      streak_7: ['#CodingStreak', '#ConsistencyIsKey'],
      streak_30: ['#30DayChallenge', '#DevGoals'],
      achievement: ['#Achievement', '#Milestone'],
      path_complete: ['#CourseComplete', '#DevWin'],
      perfect_score: ['#PerfectScore', '#DevPride']
    };

    return [...baseHashtags, ...(specific[milestoneType] || [])];
  }

  /**
   * Store meme metadata in database
   */
  async storeMeme(data) {
    const result = await this.db.query(`
      INSERT INTO meme_analytics (
        user_id, milestone_type, template_id, file_path,
        gif_size_mb, mp4_size_mb, caption, hashtags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING meme_id
    `, [
      data.userId,
      data.milestoneType,
      data.templateId,
      data.filePath,
      data.gifSizeMB,
      data.mp4SizeMB,
      data.caption,
      data.hashtags
    ]);

    return result.rows[0].meme_id;
  }

  /**
   * Post meme to Twitter
   */
  async postToTwitter(data) {
    const { memeId, filePath, caption, hashtags } = data;

    console.log(`[MemeMilestoneEngine] Posting to Twitter: ${memeId}`);

    // TODO: Implement Twitter API integration
    // For now, this is a placeholder

    /*
    const tweet = `${caption}\n\n${hashtags.join(' ')}`;
    const media = await this.uploadToTwitter(filePath);
    const result = await this.twitterClient.tweet({
      text: tweet,
      media: { media_ids: [media.media_id_string] }
    });

    // Update database
    await this.db.query(`
      UPDATE meme_analytics
      SET posted_to_twitter = TRUE, twitter_url = $2
      WHERE meme_id = $1
    `, [memeId, result.data.url]);
    */

    console.log(`[MemeMilestoneEngine] ⚠️  Twitter posting not implemented yet`);
    console.log(`   Caption: ${caption}`);
    console.log(`   Hashtags: ${hashtags.join(' ')}`);
    console.log(`   File: ${filePath}`);
  }

  /**
   * Get meme analytics for user
   */
  async getUserMemes(userId) {
    const result = await this.db.query(`
      SELECT
        meme_id,
        milestone_type,
        template_id,
        caption,
        hashtags,
        shares,
        views,
        engagement_rate,
        posted_to_twitter,
        twitter_url,
        created_at
      FROM meme_analytics
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return result.rows;
  }

  /**
   * Get viral memes (> 10K views)
   */
  async getViralMemes(limit = 10) {
    const result = await this.db.query(`
      SELECT
        m.meme_id,
        m.user_id,
        u.username,
        m.milestone_type,
        m.caption,
        m.hashtags,
        m.views,
        m.shares,
        m.engagement_rate,
        m.twitter_url,
        m.created_at
      FROM meme_analytics m
      JOIN users u ON m.user_id = u.user_id
      WHERE m.views > 10000
      ORDER BY m.views DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Update meme engagement metrics
   */
  async updateEngagement(memeId, metrics) {
    const { shares, views, engagementRate } = metrics;

    await this.db.query(`
      UPDATE meme_analytics
      SET shares = $2, views = $3, engagement_rate = $4
      WHERE meme_id = $1
    `, [memeId, shares, views, engagementRate]);
  }

  async close() {
    await this.db.end();
  }
}

module.exports = MemeMilestoneEngine;
