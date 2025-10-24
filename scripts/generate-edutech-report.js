#!/usr/bin/env node

/**
 * Edutech Platform Report Generator
 *
 * Generates comprehensive analytics report covering:
 * - Learning metrics (completions, XP, streaks)
 * - Training data collection (quality, diversity)
 * - Model performance (versions, improvements)
 * - RL optimization (Q-values, rewards)
 * - Viral engagement (memes, growth)
 *
 * Usage:
 *   node scripts/generate-edutech-report.js
 *   node scripts/generate-edutech-report.js --format=json > report.json
 *   node scripts/generate-edutech-report.js --domain=soulfra.com
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class EdutechReportGenerator {
  constructor() {
    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });
  }

  async generate(options = {}) {
    console.log('📊 Generating CALOS Edutech Platform Report...\n');

    const report = {
      generated_at: new Date().toISOString(),
      platform: 'CALOS Edutech',
      period: options.period || '30d',
      domain_filter: options.domain || null,
      sections: {}
    };

    // 1. Learning Platform Metrics
    console.log('📚 Analyzing learning platform...');
    report.sections.learning = await this.getLearningMetrics(options.domain);

    // 2. Training Data Collection
    console.log('🎯 Analyzing training data collection...');
    report.sections.training = await this.getTrainingMetrics(options.domain);

    // 3. Model Performance
    console.log('🤖 Analyzing AI model performance...');
    report.sections.models = await this.getModelMetrics();

    // 4. RL Optimization
    console.log('🧠 Analyzing RL optimization...');
    report.sections.rl = await this.getRLMetrics();

    // 5. Viral Engagement
    console.log('🚀 Analyzing viral engagement...');
    report.sections.engagement = await this.getEngagementMetrics(options.domain);

    // 6. Overall Health Score
    report.health_score = this.calculateHealthScore(report);

    // Output
    if (options.format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      this.printReport(report);
    }

    return report;
  }

  async getLearningMetrics(domainFilter = null) {
    const metrics = {};

    // Learning paths overview
    const pathsQuery = domainFilter
      ? `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active = true) as active
         FROM learning_paths lp
         JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
         WHERE dp.domain_name = $1`
      : `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active = true) as active
         FROM learning_paths`;

    const pathsResult = await this.db.query(
      pathsQuery,
      domainFilter ? [domainFilter] : []
    );
    metrics.paths = pathsResult.rows[0];

    // Lessons overview
    const lessonsQuery = `
      SELECT
        COUNT(*) as total_lessons,
        COUNT(DISTINCT l.lesson_id) FILTER (WHERE l.active = true) as active_lessons
      FROM lessons l
      JOIN learning_paths lp ON l.path_id = lp.path_id
      ${domainFilter ? 'JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id WHERE dp.domain_name = $1' : ''}
    `;
    const lessonsResult = await this.db.query(
      lessonsQuery,
      domainFilter ? [domainFilter] : []
    );
    metrics.lessons = lessonsResult.rows[0];

    // User progress (using existing user_progress table)
    try {
      const progressQuery = `
        SELECT
          COUNT(DISTINCT up.user_id) as total_learners,
          AVG(up.total_xp_earned) as avg_xp_per_user,
          AVG(COALESCE(prof.current_level, 1)) as avg_level
        FROM user_progress up
        LEFT JOIN user_profiles prof ON up.user_id = prof.session_id
      `;
      const progressResult = await this.db.query(progressQuery);
      metrics.progress = progressResult.rows[0];

      // Lesson completions for session stats
      const completionsQuery = `
        SELECT
          COUNT(*) as total_sessions,
          AVG(xp_earned) as avg_xp_per_session
        FROM lesson_completions
      `;
      const completionsResult = await this.db.query(completionsQuery);
      metrics.sessions = completionsResult.rows[0];
    } catch (err) {
      console.warn('   ⚠️  Could not fetch progress metrics:', err.message);
      metrics.progress = { total_learners: 0 };
      metrics.sessions = { total_sessions: 0 };
    }

    // Streak retention
    const streakQuery = `
      SELECT
        AVG(current_streak_days) as avg_streak,
        MAX(current_streak_days) as max_streak,
        COUNT(*) FILTER (WHERE current_streak_days >= 7) as seven_day_streaks,
        COUNT(*) FILTER (WHERE current_streak_days >= 30) as thirty_day_streaks
      FROM user_progress
      WHERE last_activity_date >= NOW() - INTERVAL '30 days'
    `;
    const streakResult = await this.db.query(streakQuery);
    metrics.streaks = streakResult.rows[0];

    // Achievements
    const achievementQuery = `
      SELECT
        COUNT(DISTINCT ua.achievement_id) as total_achievements,
        COUNT(*) as total_unlocks,
        SUM(a.xp_reward) as total_xp_awarded
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.achievement_id
      WHERE ua.earned_at >= NOW() - INTERVAL '30 days'
    `;
    const achievementResult = await this.db.query(achievementQuery);
    metrics.achievements = achievementResult.rows[0];

    return metrics;
  }

  async getTrainingMetrics(domainFilter = null) {
    const metrics = {};

    // Check if training_tasks table exists
    const tableCheck = await this.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'training_tasks'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      return {
        status: 'not_initialized',
        message: 'Training tasks system not yet set up'
      };
    }

    // Task completion stats
    const tasksQuery = `
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'verified') as verified,
        AVG(quality_score) as avg_quality,
        COUNT(DISTINCT user_id) as active_contributors
      FROM training_tasks
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;
    const tasksResult = await this.db.query(tasksQuery);
    metrics.tasks = tasksResult.rows[0];

    // Task type distribution
    const typeQuery = `
      SELECT
        task_type,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality
      FROM training_tasks
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY task_type
      ORDER BY count DESC
    `;
    const typeResult = await this.db.query(typeQuery);
    metrics.task_types = typeResult.rows;

    // Data diversity (Shannon entropy)
    const diversityQuery = `
      WITH type_distribution AS (
        SELECT
          task_type,
          COUNT(*)::float / (SELECT COUNT(*) FROM training_tasks WHERE created_at >= NOW() - INTERVAL '30 days') as probability
        FROM training_tasks
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY task_type
      )
      SELECT
        -SUM(probability * LOG(probability)) as entropy,
        CASE
          WHEN -SUM(probability * LOG(probability)) > 1.5 THEN 'high'
          WHEN -SUM(probability * LOG(probability)) > 1.0 THEN 'medium'
          ELSE 'low'
        END as diversity_rating
      FROM type_distribution
    `;
    const diversityResult = await this.db.query(diversityQuery);
    metrics.diversity = diversityResult.rows[0];

    return metrics;
  }

  async getModelMetrics() {
    try {
      const metrics = {};

      // Check if model_versions table exists
      const tableCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'model_versions'
        ) as exists
      `);

      if (!tableCheck.rows[0].exists) {
        return {
          status: 'not_initialized',
          message: 'Model versioning system not yet set up'
        };
      }

      // Model versions
      const versionsQuery = `
        SELECT
          COUNT(*) as total_versions,
          MAX(created_at) as last_fine_tune
        FROM model_versions
      `;
      const versionsResult = await this.db.query(versionsQuery);
      metrics.versions = versionsResult.rows[0];

      return metrics;
    } catch (err) {
      return {
        status: 'not_initialized',
        message: 'Model versioning system not yet set up',
        error: err.message
      };
    }
  }

  async getRLMetrics() {
    try {
      const metrics = {};

      // Check if rl_command_history table exists
      const tableCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'rl_command_history'
        ) as exists
      `);

      if (!tableCheck.rows[0].exists) {
        return {
          status: 'not_initialized',
          message: 'RL command learner not yet tracking data'
        };
      }

    // Command success rates
    const commandQuery = `
      SELECT
        command,
        COUNT(*) as executions,
        AVG(CASE WHEN success THEN 1 ELSE 0 END) as success_rate,
        AVG(execution_time_ms) as avg_time_ms,
        AVG(reward) as avg_reward
      FROM rl_command_history
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY command
      ORDER BY executions DESC
      LIMIT 10
    `;
    const commandResult = await this.db.query(commandQuery);
    metrics.top_commands = commandResult.rows;

    // Q-value convergence
    const qValueQuery = `
      WITH recent_q_values AS (
        SELECT
          command,
          q_value,
          created_at,
          LAG(q_value) OVER (PARTITION BY command ORDER BY created_at) as prev_q_value
        FROM rl_command_history
        WHERE created_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        AVG(ABS(q_value - prev_q_value)) as avg_q_change,
        CASE
          WHEN AVG(ABS(q_value - prev_q_value)) < 0.1 THEN 'converged'
          WHEN AVG(ABS(q_value - prev_q_value)) < 0.5 THEN 'converging'
          ELSE 'exploring'
        END as convergence_status
      FROM recent_q_values
      WHERE prev_q_value IS NOT NULL
    `;
      const qValueResult = await this.db.query(qValueQuery);
      metrics.convergence = qValueResult.rows[0] || { avg_q_change: 0, convergence_status: 'no_data' };

      return metrics;
    } catch (err) {
      return {
        status: 'not_initialized',
        message: 'RL command learner not yet tracking data',
        error: err.message
      };
    }
  }

  async getEngagementMetrics(domainFilter = null) {
    try {
      const metrics = {};

      // Check if meme_analytics table exists
      const tableCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'meme_analytics'
        ) as exists
      `);

      if (!tableCheck.rows[0].exists) {
        return {
          status: 'not_initialized',
          message: 'Meme analytics not yet tracking'
        };
      }

    // Meme generation stats
    const memeQuery = `
      SELECT
        COUNT(*) as total_memes,
        COUNT(*) FILTER (WHERE shares > 0) as shared_memes,
        COUNT(*) FILTER (WHERE views > 10000) as viral_memes,
        SUM(shares) as total_shares,
        SUM(views) as total_views,
        AVG(engagement_rate) as avg_engagement
      FROM meme_analytics
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;
    const memeResult = await this.db.query(memeQuery);
    metrics.memes = memeResult.rows[0];

    // Viral conversion (views → signups)
    const conversionQuery = `
      SELECT
        COUNT(DISTINCT u.user_id) as signups_from_viral,
        COUNT(DISTINCT u.user_id)::float / NULLIF(SUM(m.views), 0) as conversion_rate
      FROM users u
      JOIN meme_analytics m ON u.referral_source = m.meme_id
      WHERE u.created_at >= NOW() - INTERVAL '30 days'
        AND m.views > 10000
    `;
    const conversionResult = await this.db.query(conversionQuery);
      metrics.viral_conversion = conversionResult.rows[0] || { signups_from_viral: 0, conversion_rate: 0 };

      return metrics;
    } catch (err) {
      return {
        status: 'not_initialized',
        message: 'Meme analytics not yet tracking',
        error: err.message
      };
    }
  }

  calculateHealthScore(report) {
    let score = 0;
    let maxScore = 0;

    // Learning platform (30 points)
    if (report.sections.learning.progress) {
      const completionRate = parseFloat(report.sections.learning.progress.completion_rate) || 0;
      score += Math.min(completionRate * 30, 30);
    }
    maxScore += 30;

    // Training data (25 points)
    if (report.sections.training.tasks) {
      const qualityScore = parseFloat(report.sections.training.tasks.avg_quality) || 0;
      score += (qualityScore / 100) * 25;
    }
    maxScore += 25;

    // Model performance (20 points)
    if (report.sections.models.improvements) {
      const improvementRate = report.sections.models.improvements.improved_versions /
                              (report.sections.models.improvements.total_comparisons || 1);
      score += improvementRate * 20;
    }
    maxScore += 20;

    // RL optimization (15 points)
    if (report.sections.rl.convergence) {
      const convergenceScore = report.sections.rl.convergence.convergence_status === 'converged' ? 15 :
                               report.sections.rl.convergence.convergence_status === 'converging' ? 10 : 5;
      score += convergenceScore;
    }
    maxScore += 15;

    // Engagement (10 points)
    if (report.sections.engagement.memes) {
      const viralRate = (report.sections.engagement.memes.viral_memes /
                        (report.sections.engagement.memes.total_memes || 1));
      score += viralRate * 10;
    }
    maxScore += 10;

    return {
      score: Math.round((score / maxScore) * 100),
      rating: this.getHealthRating(score / maxScore),
      breakdown: {
        learning: Math.round((score / maxScore) * 30),
        training: Math.round((score / maxScore) * 25),
        models: Math.round((score / maxScore) * 20),
        rl: Math.round((score / maxScore) * 15),
        engagement: Math.round((score / maxScore) * 10)
      }
    };
  }

  getHealthRating(score) {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'fair';
    if (score >= 0.3) return 'poor';
    return 'critical';
  }

  printReport(report) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 CALOS EDUTECH PLATFORM REPORT');
    console.log('='.repeat(70));
    console.log(`Generated: ${report.generated_at}`);
    console.log(`Period: ${report.period}`);
    if (report.domain_filter) {
      console.log(`Domain: ${report.domain_filter}`);
    }
    console.log('='.repeat(70));

    // Overall Health
    console.log('\n🏥 OVERALL HEALTH SCORE');
    console.log(`Score: ${report.health_score.score}/100 (${report.health_score.rating.toUpperCase()})`);
    console.log('Breakdown:');
    console.log(`  Learning Platform: ${report.health_score.breakdown.learning}/30`);
    console.log(`  Training Data: ${report.health_score.breakdown.training}/25`);
    console.log(`  Model Performance: ${report.health_score.breakdown.models}/20`);
    console.log(`  RL Optimization: ${report.health_score.breakdown.rl}/15`);
    console.log(`  Viral Engagement: ${report.health_score.breakdown.engagement}/10`);

    // Learning Platform
    console.log('\n📚 LEARNING PLATFORM');
    const learning = report.sections.learning;
    console.log(`Paths: ${learning.paths.active}/${learning.paths.total} active`);
    console.log(`Lessons: ${learning.lessons.active_lessons}/${learning.lessons.total_lessons} active`);
    if (learning.progress) {
      console.log(`Total Learners: ${learning.progress.total_learners || 0}`);
      console.log(`Avg Level: ${parseFloat(learning.progress.avg_level || 0).toFixed(1)}`);
      console.log(`Avg XP: ${Math.round(learning.progress.avg_xp_per_user || 0)}`);
    }
    if (learning.sessions) {
      console.log(`Learning Sessions: ${learning.sessions.total_sessions || 0}`);
      console.log(`Avg XP/Session: ${Math.round(learning.sessions.avg_xp_per_session || 0)}`);
    }
    if (learning.streaks) {
      console.log(`Avg Streak: ${Math.round(learning.streaks.avg_streak || 0)} days`);
      console.log(`7-day Streaks: ${learning.streaks.seven_day_streaks || 0}`);
      console.log(`30-day Streaks: ${learning.streaks.thirty_day_streaks || 0}`);
    }

    // Training Data
    console.log('\n🎯 TRAINING DATA COLLECTION');
    const training = report.sections.training;
    if (training.status === 'not_initialized') {
      console.log(`Status: ${training.message}`);
    } else {
      console.log(`Total Tasks: ${training.tasks.total_tasks}`);
      console.log(`Completed: ${training.tasks.completed} (${training.tasks.verified} verified)`);
      console.log(`Avg Quality: ${Math.round(training.tasks.avg_quality || 0)}/100`);
      console.log(`Active Contributors: ${training.tasks.active_contributors}`);
      if (training.diversity) {
        console.log(`Data Diversity: ${training.diversity.diversity_rating} (entropy: ${training.diversity.entropy?.toFixed(2) || 'N/A'})`);
      }
    }

    // Model Performance
    console.log('\n🤖 AI MODEL PERFORMANCE');
    const models = report.sections.models;
    if (models.status === 'not_initialized') {
      console.log(`Status: ${models.message}`);
    } else {
      console.log(`Total Versions: ${models.versions.total_versions}`);
      console.log(`Last Fine-tune: ${models.versions.last_fine_tune || 'Never'}`);
      console.log(`Avg Examples/Version: ${Math.round(models.versions.avg_examples_per_version || 0)}`);
      if (models.improvements) {
        const improvementPct = ((models.improvements.improved_versions / models.improvements.total_comparisons) * 100).toFixed(1);
        console.log(`Improvement Rate: ${improvementPct}% of versions`);
        console.log(`Avg Performance Gain: ${models.improvements.avg_improvement?.toFixed(2) || 'N/A'}`);
      }
    }

    // RL Optimization
    console.log('\n🧠 RL OPTIMIZATION');
    const rl = report.sections.rl;
    if (rl.status === 'not_initialized') {
      console.log(`Status: ${rl.message}`);
    } else {
      console.log(`Top Commands (by executions):`);
      rl.top_commands?.slice(0, 5).forEach((cmd, i) => {
        console.log(`  ${i + 1}. ${cmd.command}: ${cmd.executions} execs, ${(cmd.success_rate * 100).toFixed(1)}% success, ${Math.round(cmd.avg_time_ms)}ms avg`);
      });
      console.log(`Q-Value Convergence: ${rl.convergence.convergence_status} (avg change: ${rl.convergence.avg_q_change?.toFixed(3) || 'N/A'})`);
    }

    // Viral Engagement
    console.log('\n🚀 VIRAL ENGAGEMENT');
    const engagement = report.sections.engagement;
    if (engagement.status === 'not_initialized') {
      console.log(`Status: ${engagement.message}`);
    } else {
      console.log(`Total Memes: ${engagement.memes.total_memes}`);
      console.log(`Viral (>10K views): ${engagement.memes.viral_memes} (${((engagement.memes.viral_memes / engagement.memes.total_memes) * 100).toFixed(1)}%)`);
      console.log(`Total Shares: ${engagement.memes.total_shares?.toLocaleString() || 0}`);
      console.log(`Total Views: ${engagement.memes.total_views?.toLocaleString() || 0}`);
      console.log(`Avg Engagement: ${(engagement.memes.avg_engagement * 100).toFixed(2)}%`);
      console.log(`Viral → Signup Rate: ${(engagement.viral_conversion.conversion_rate * 100).toFixed(2)}%`);
    }

    console.log('\n' + '='.repeat(70));
  }

  async close() {
    await this.db.end();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  args.forEach(arg => {
    if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg.startsWith('--domain=')) {
      options.domain = arg.split('=')[1];
    } else if (arg.startsWith('--period=')) {
      options.period = arg.split('=')[1];
    }
  });

  const generator = new EdutechReportGenerator();

  generator.generate(options)
    .then(() => generator.close())
    .catch(err => {
      console.error('Error generating report:', err);
      process.exit(1);
    });
}

module.exports = EdutechReportGenerator;
