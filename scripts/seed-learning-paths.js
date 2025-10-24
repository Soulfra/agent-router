#!/usr/bin/env node
/**
 * Seed Learning Paths - Create 12 Domain-Specific Learning Journeys
 *
 * Creates learning paths, lessons, and achievements for all 12 branded domains.
 * Each domain gets a unique learning path with progressive lessons.
 *
 * Usage:
 *   node scripts/seed-learning-paths.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

/**
 * Learning path configurations for each domain
 */
const learningPathConfigs = {
  'soulfra.com': {
    pathName: 'Soulfra Infrastructure Mastery',
    pathSlug: 'soulfra-mastery',
    description: 'Master infrastructure-as-code and cloud architecture with Soulfra\'s spiritual approach to DevOps.',
    iconEmoji: '🏗️',
    totalLessons: 10,
    xpPerLesson: 120,
    lessons: [
      { title: 'Introduction to Infrastructure as Code', xpReward: 100 },
      { title: 'Cloud Architecture Fundamentals', xpReward: 120 },
      { title: 'Container Orchestration', xpReward: 150 },
      { title: 'CI/CD Pipeline Design', xpReward: 140 },
      { title: 'Monitoring and Observability', xpReward: 130 },
      { title: 'Security Best Practices', xpReward: 160 },
      { title: 'Scaling Strategies', xpReward: 150 },
      { title: 'Disaster Recovery Planning', xpReward: 140 },
      { title: 'Cost Optimization', xpReward: 120 },
      { title: 'Final Project: Build Your Own Infrastructure', xpReward: 200 }
    ]
  },
  'deathtodata.com': {
    pathName: 'Data Liberation Academy',
    pathSlug: 'data-liberation',
    description: 'Break free from data silos and master the art of data engineering with Death to Data.',
    iconEmoji: '💀',
    totalLessons: 15,
    xpPerLesson: 110,
    lessons: [
      { title: 'The Problem with Data Silos', xpReward: 90 },
      { title: 'Database Design Principles', xpReward: 110 },
      { title: 'Data Normalization: ZIP Codes, Phone Numbers, and Names', xpReward: 120 },
      { title: 'Address Standardization and Formatting', xpReward: 110 },
      { title: 'Data Cleansing: Handling Messy Real-World Data', xpReward: 130 },
      { title: 'Privacy Techniques: Email Tagging for Breach Detection', xpReward: 125 },
      { title: 'Fuzzy Matching and Record Deduplication', xpReward: 140 },
      { title: 'Identity Resolution: Linking Data Points', xpReward: 135 },
      { title: 'OSINT Basics: What Can Be Discovered?', xpReward: 130 },
      { title: 'ETL Pipeline Architecture', xpReward: 130 },
      { title: 'Data Warehousing Concepts', xpReward: 120 },
      { title: 'Real-time Streaming', xpReward: 140 },
      { title: 'Data Quality and Validation', xpReward: 110 },
      { title: 'Data Governance and Ethics', xpReward: 115 },
      { title: 'Final Project: Build a Complete Data Pipeline', xpReward: 200 }
    ]
  },
  'finishthisidea.com': {
    pathName: 'Idea Execution Bootcamp',
    pathSlug: 'idea-execution',
    description: 'Transform half-baked ideas into shipped products with Finish This Idea\'s proven framework.',
    iconEmoji: '🚀',
    totalLessons: 8,
    xpPerLesson: 100,
    lessons: [
      { title: 'From Idea to MVP', xpReward: 90 },
      { title: 'Rapid Prototyping', xpReward: 110 },
      { title: 'User Feedback Loops', xpReward: 100 },
      { title: 'Feature Prioritization', xpReward: 90 },
      { title: 'Launch Strategy', xpReward: 120 },
      { title: 'Post-Launch Iteration', xpReward: 100 },
      { title: 'Scaling Your Product', xpReward: 130 },
      { title: 'Final Project: Ship Your Idea', xpReward: 200 }
    ]
  },
  'dealordelete.com': {
    pathName: 'Decision-Making Bootcamp',
    pathSlug: 'decision-mastery',
    description: 'Decide faster, regret never. Master the art of decisive action with Deal or Delete.',
    iconEmoji: '⚡',
    totalLessons: 8,
    xpPerLesson: 110,
    lessons: [
      { title: 'The Cost of Indecision', xpReward: 90 },
      { title: 'Decision-Making Frameworks', xpReward: 100 },
      { title: 'Rapid Evaluation Techniques', xpReward: 110 },
      { title: 'Risk Assessment and Mitigation', xpReward: 120 },
      { title: 'Dealing with Uncertainty', xpReward: 115 },
      { title: 'Learning from Bad Decisions', xpReward: 105 },
      { title: 'Building Decision Confidence', xpReward: 110 },
      { title: 'Final Project: Your Decision System', xpReward: 180 }
    ]
  },
  'saveorsink.com': {
    pathName: 'System Rescue Academy',
    pathSlug: 'system-rescue',
    description: 'Rescue failing systems before they sink. Master the art of technical triage and recovery.',
    iconEmoji: '🛟',
    totalLessons: 10,
    xpPerLesson: 120,
    lessons: [
      { title: 'Diagnosing Failing Systems', xpReward: 110 },
      { title: 'Performance Bottleneck Analysis', xpReward: 120 },
      { title: 'Database Recovery Techniques', xpReward: 130 },
      { title: 'Emergency Debugging', xpReward: 125 },
      { title: 'System Health Monitoring', xpReward: 115 },
      { title: 'Load Testing and Stress Analysis', xpReward: 120 },
      { title: 'Disaster Recovery Planning', xpReward: 130 },
      { title: 'Incident Response Protocols', xpReward: 120 },
      { title: 'Post-Mortem Analysis', xpReward: 110 },
      { title: 'Final Project: Rescue a Failing System', xpReward: 200 }
    ]
  },
  'cringeproof.com': {
    pathName: 'Communication Mastery',
    pathSlug: 'communication-mastery',
    description: 'Communicate without regret. Master confident, authentic communication with CringeProof.',
    iconEmoji: '💬',
    totalLessons: 8,
    xpPerLesson: 105,
    lessons: [
      { title: 'Understanding Communication Anxiety', xpReward: 90 },
      { title: 'Authentic vs. Performative Communication', xpReward: 100 },
      { title: 'Writing Clear Technical Docs', xpReward: 110 },
      { title: 'Effective Async Communication', xpReward: 105 },
      { title: 'Handling Difficult Conversations', xpReward: 120 },
      { title: 'Public Speaking for Developers', xpReward: 115 },
      { title: 'Feedback Without Fear', xpReward: 100 },
      { title: 'Final Project: Your Communication System', xpReward: 170 }
    ]
  },
  'finishthisrepo.com': {
    pathName: 'Code Completion Workshop',
    pathSlug: 'code-completion',
    description: 'Complete your code, ship your project. Master the art of finishing what you start.',
    iconEmoji: '🎯',
    totalLessons: 10,
    xpPerLesson: 115,
    lessons: [
      { title: 'Why Projects Stay Unfinished', xpReward: 90 },
      { title: 'Defining "Done" for Code Projects', xpReward: 100 },
      { title: 'Technical Debt Management', xpReward: 120 },
      { title: 'Refactoring Strategies', xpReward: 115 },
      { title: 'Testing and Quality Assurance', xpReward: 125 },
      { title: 'Documentation That Ships', xpReward: 110 },
      { title: 'Deployment and CI/CD', xpReward: 130 },
      { title: 'Maintenance and Support Planning', xpReward: 115 },
      { title: 'Project Retrospectives', xpReward: 100 },
      { title: 'Final Project: Ship Your Unfinished Repo', xpReward: 190 }
    ]
  },
  'ipomyagent.com': {
    pathName: 'AI Agent Monetization',
    pathSlug: 'agent-monetization',
    description: 'Monetize your AI agents. Build, deploy, and profit from autonomous AI workers.',
    iconEmoji: '💰',
    totalLessons: 10,
    xpPerLesson: 125,
    lessons: [
      { title: 'AI Agent Market Overview', xpReward: 110 },
      { title: 'Building Marketable AI Agents', xpReward: 130 },
      { title: 'Pricing Strategies for AI Services', xpReward: 120 },
      { title: 'API Design and Documentation', xpReward: 125 },
      { title: 'Usage Metering and Billing', xpReward: 135 },
      { title: 'Agent Performance Optimization', xpReward: 130 },
      { title: 'Customer Onboarding and Support', xpReward: 115 },
      { title: 'Scaling Your Agent Infrastructure', xpReward: 140 },
      { title: 'Legal and Compliance Considerations', xpReward: 120 },
      { title: 'Final Project: Launch Your Agent Marketplace', xpReward: 200 }
    ]
  },
  'hollowtown.com': {
    pathName: 'Virtual World Building',
    pathSlug: 'virtual-worlds',
    description: 'Immersive virtual experiences. Build worlds that feel alive with Hollow Town.',
    iconEmoji: '🌐',
    totalLessons: 10,
    xpPerLesson: 125,
    lessons: [
      { title: 'Virtual World Design Principles', xpReward: 110 },
      { title: '3D Space and Navigation', xpReward: 120 },
      { title: 'User Presence and Avatars', xpReward: 125 },
      { title: 'Real-time Multiplayer Systems', xpReward: 140 },
      { title: 'World Physics and Interactions', xpReward: 130 },
      { title: 'Virtual Economy Design', xpReward: 125 },
      { title: 'Social Dynamics in Virtual Spaces', xpReward: 120 },
      { title: 'Performance Optimization for VR', xpReward: 135 },
      { title: 'Cross-Platform Virtual Worlds', xpReward: 130 },
      { title: 'Final Project: Build Your Virtual World', xpReward: 210 }
    ]
  },
  'hookclinic.com': {
    pathName: 'Content Hooks Mastery',
    pathSlug: 'content-hooks',
    description: 'Write hooks that convert. Master the art of attention-grabbing content with Hook Clinic.',
    iconEmoji: '🪝',
    totalLessons: 8,
    xpPerLesson: 110,
    lessons: [
      { title: 'The Psychology of Attention', xpReward: 100 },
      { title: 'Writing Irresistible Headlines', xpReward: 110 },
      { title: 'Opening Hooks for Every Format', xpReward: 115 },
      { title: 'Storytelling That Converts', xpReward: 120 },
      { title: 'Social Media Hook Patterns', xpReward: 110 },
      { title: 'Video and Audio Hooks', xpReward: 105 },
      { title: 'Testing and Optimizing Hooks', xpReward: 115 },
      { title: 'Final Project: Your Hook Library', xpReward: 180 }
    ]
  },
  'businessaiclassroom.com': {
    pathName: 'AI for Business Fundamentals',
    pathSlug: 'ai-business',
    description: 'Learn AI for business. Practical AI implementation for business leaders.',
    iconEmoji: '🎓',
    totalLessons: 10,
    xpPerLesson: 115,
    lessons: [
      { title: 'AI Business Use Cases', xpReward: 100 },
      { title: 'AI ROI and Cost Analysis', xpReward: 110 },
      { title: 'Choosing the Right AI Tools', xpReward: 115 },
      { title: 'AI for Customer Service', xpReward: 120 },
      { title: 'AI for Marketing and Sales', xpReward: 125 },
      { title: 'AI for Operations and Analytics', xpReward: 115 },
      { title: 'Managing AI Projects', xpReward: 110 },
      { title: 'AI Ethics and Governance', xpReward: 105 },
      { title: 'Change Management for AI Adoption', xpReward: 110 },
      { title: 'Final Project: AI Strategy Roadmap', xpReward: 190 }
    ]
  },
  'roughsparks.com': {
    pathName: 'Music Collaboration Platform',
    pathSlug: 'music-collab',
    description: 'Creative collaboration for music. Build and collaborate on music projects with Rough Sparks.',
    iconEmoji: '🎵',
    totalLessons: 10,
    xpPerLesson: 115,
    lessons: [
      { title: 'Digital Audio Workstation Basics', xpReward: 100 },
      { title: 'Audio File Formats and Processing', xpReward: 110 },
      { title: 'Real-time Audio Collaboration', xpReward: 125 },
      { title: 'Version Control for Music Projects', xpReward: 120 },
      { title: 'MIDI and Audio Synchronization', xpReward: 115 },
      { title: 'Cloud-based Music Production', xpReward: 120 },
      { title: 'Collaborative Mixing and Mastering', xpReward: 125 },
      { title: 'Rights Management and Licensing', xpReward: 110 },
      { title: 'Building Music Communities', xpReward: 105 },
      { title: 'Final Project: Collaborative Music Release', xpReward: 190 }
    ]
  },
  'calos.com': {
    pathName: 'CalOS Complete Training',
    pathSlug: 'calos-training',
    description: 'Master all CalOS systems: MCP servers, RPG/card game, zero-dependency architecture, and multi-tier SaaS.',
    iconEmoji: '🎓',
    totalLessons: 31,
    xpPerLesson: 123,
    lessons: [
      // MCP Development (8 lessons, 920 XP)
      { title: 'Introduction to CalOS MCP Servers', xpReward: 100 },
      { title: 'Using MCP Client with Fetch', xpReward: 120 },
      { title: 'Building Your First MCP Tool', xpReward: 130 },
      { title: 'RPG Integration - Award XP', xpReward: 120 },
      { title: 'File System Tools', xpReward: 110 },
      { title: 'Code Analysis Tools', xpReward: 120 },
      { title: 'Privacy & Security', xpReward: 130 },
      { title: 'Deploy Your Own MCP Server', xpReward: 110 },

      // RPG/Card Game (10 lessons, 1,310 XP)
      { title: 'Understanding the Card Game System', xpReward: 100 },
      { title: 'Fetch API Basics', xpReward: 110 },
      { title: 'Opening Card Packs', xpReward: 120 },
      { title: 'Card Collection UI', xpReward: 130 },
      { title: 'Roasting System - Vote on Code', xpReward: 140 },
      { title: 'RPG Player Progression', xpReward: 120 },
      { title: 'Quest System', xpReward: 130 },
      { title: 'Achievements & Badges', xpReward: 120 },
      { title: 'Leaderboards', xpReward: 130 },
      { title: 'Final Project - Full Game Loop', xpReward: 150 },

      // Zero-Dependency (6 lessons, 720 XP)
      { title: 'Understanding CalOS Schema', xpReward: 100 },
      { title: 'Privacy-First Data Handling', xpReward: 130 },
      { title: 'Split Licensing Strategy', xpReward: 110 },
      { title: 'Build Without npm Dependencies', xpReward: 140 },
      { title: 'Database Design', xpReward: 120 },
      { title: 'Deployment Without Vendors', xpReward: 120 },

      // Multi-Tier System (7 lessons, 910 XP)
      { title: 'Understanding the Tier System', xpReward: 100 },
      { title: 'BYOK Implementation', xpReward: 140 },
      { title: 'Usage Tracking', xpReward: 130 },
      { title: 'Billing Dashboard', xpReward: 140 },
      { title: 'Rate Limiting', xpReward: 120 },
      { title: 'Multi-Project Management', xpReward: 140 },
      { title: 'Self-Service Portal', xpReward: 140 }
    ]
  }
};

/**
 * Universal achievements (available across all paths)
 */
const universalAchievements = [
  {
    slug: 'first_lesson',
    name: 'First Step',
    description: 'Complete your first lesson',
    badgeIcon: '🎓',
    rarity: 'common',
    xpReward: 50
  },
  {
    slug: 'ten_lessons',
    name: 'Dedicated Learner',
    description: 'Complete 10 lessons',
    badgeIcon: '📚',
    rarity: 'uncommon',
    xpReward: 100
  },
  {
    slug: 'first_level',
    name: 'Level Up!',
    description: 'Reach level 1',
    badgeIcon: '⬆️',
    rarity: 'common',
    xpReward: 25
  },
  {
    slug: 'level_5',
    name: 'Rising Star',
    description: 'Reach level 5',
    badgeIcon: '⭐',
    rarity: 'uncommon',
    xpReward: 100
  },
  {
    slug: 'level_10',
    name: 'Expert',
    description: 'Reach level 10',
    badgeIcon: '💎',
    rarity: 'rare',
    xpReward: 250
  },
  {
    slug: 'level_25',
    name: 'Master',
    description: 'Reach level 25',
    badgeIcon: '👑',
    rarity: 'epic',
    xpReward: 500
  },
  {
    slug: 'level_50',
    name: 'Legend',
    description: 'Reach level 50',
    badgeIcon: '🏆',
    rarity: 'legendary',
    xpReward: 1000
  },
  {
    slug: 'streak_3',
    name: '3-Day Streak',
    description: 'Complete lessons for 3 days in a row',
    badgeIcon: '🔥',
    rarity: 'common',
    xpReward: 50
  },
  {
    slug: 'streak_7',
    name: 'Week Warrior',
    description: 'Complete lessons for 7 days in a row',
    badgeIcon: '⚡',
    rarity: 'uncommon',
    xpReward: 150
  },
  {
    slug: 'streak_30',
    name: 'Monthly Master',
    description: 'Complete lessons for 30 days in a row',
    badgeIcon: '🌟',
    rarity: 'rare',
    xpReward: 500
  },
  {
    slug: 'streak_100',
    name: 'Century Streak',
    description: 'Complete lessons for 100 days in a row',
    badgeIcon: '💯',
    rarity: 'legendary',
    xpReward: 2000
  },
  {
    slug: 'halfway_there',
    name: 'Halfway There',
    description: 'Complete 50% of a learning path',
    badgeIcon: '🎯',
    rarity: 'uncommon',
    xpReward: 100
  },
  {
    slug: 'path_complete',
    name: 'Path Completed',
    description: 'Complete an entire learning path',
    badgeIcon: '🏁',
    rarity: 'epic',
    xpReward: 500
  },
  {
    slug: 'speed_demon',
    name: 'Speed Demon',
    description: 'Complete a lesson in under 5 minutes',
    badgeIcon: '⚡',
    rarity: 'rare',
    xpReward: 150
  },
  {
    slug: 'mini_game_master',
    name: 'Mini-Game Master',
    description: 'Complete 10 mini-games',
    badgeIcon: '🎮',
    rarity: 'uncommon',
    xpReward: 200
  }
];

async function main() {
  console.log('\n🎓 CALOS Learning Platform - Seed Learning Paths');
  console.log('='.repeat(60) + '\n');

  try {
    await db.query('SELECT 1');
    console.log('✓ Connected to database\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }

  // 1. Get all domains
  console.log('📋 Fetching domain portfolio...');
  const domainsResult = await db.query('SELECT * FROM domain_portfolio ORDER BY domain_name');
  console.log(`✓ Found ${domainsResult.rows.length} domains\n`);

  // 2. Create learning paths
  console.log('🏗️  Creating learning paths...\n');
  const createdPaths = [];

  for (const domain of domainsResult.rows) {
    const config = learningPathConfigs[domain.domain_name];

    if (!config) {
      console.log(`⚠️  No config for ${domain.domain_name}, skipping`);
      continue;
    }

    try {
      // Check if path already exists
      const existingPath = await db.query(
        'SELECT path_id FROM learning_paths WHERE path_slug = $1',
        [config.pathSlug]
      );

      if (existingPath.rows.length > 0) {
        console.log(`⏭  ${config.pathName} already exists`);
        createdPaths.push({ ...existingPath.rows[0], config });
        continue;
      }

      // Create path
      const pathResult = await db.query(
        `INSERT INTO learning_paths (
          domain_id, path_name, path_slug, description, icon_emoji,
          total_lessons, xp_reward_per_lesson, active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
        RETURNING *`,
        [
          domain.domain_id,
          config.pathName,
          config.pathSlug,
          config.description,
          config.iconEmoji,
          config.totalLessons,
          config.xpPerLesson
        ]
      );

      console.log(`✅ Created: ${config.pathName}`);
      createdPaths.push({ ...pathResult.rows[0], config });

      // Create lessons for this path
      for (let i = 0; i < config.lessons.length; i++) {
        const lesson = config.lessons[i];
        const requiresLessonId = i > 0 ? createdPaths[createdPaths.length - 1].lastLessonId : null;

        const lessonResult = await db.query(
          `INSERT INTO lessons (
            path_id, lesson_number, lesson_title, lesson_slug,
            requires_lesson_id, xp_reward, active, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
          RETURNING lesson_id`,
          [
            pathResult.rows[0].path_id,
            i + 1,
            lesson.title,
            lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            requiresLessonId,
            lesson.xpReward
          ]
        );

        createdPaths[createdPaths.length - 1].lastLessonId = lessonResult.rows[0].lesson_id;
      }

      console.log(`   📝 Created ${config.lessons.length} lessons\n`);

    } catch (error) {
      console.error(`❌ Error creating ${config.pathName}:`, error.message);
    }
  }

  // 3. Create universal achievements
  console.log('🏆 Creating achievements...\n');

  for (const achievement of universalAchievements) {
    try {
      // Check if achievement already exists
      const existing = await db.query(
        'SELECT achievement_id FROM achievements WHERE achievement_slug = $1',
        [achievement.slug]
      );

      if (existing.rows.length > 0) {
        console.log(`⏭  ${achievement.name} already exists`);
        continue;
      }

      await db.query(
        `INSERT INTO achievements (
          achievement_slug, achievement_name, achievement_description,
          badge_icon, rarity, xp_reward, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          achievement.slug,
          achievement.name,
          achievement.description,
          achievement.badgeIcon,
          achievement.rarity,
          achievement.xpReward
        ]
      );

      console.log(`✅ Created: ${achievement.name} (${achievement.rarity})`);
    } catch (error) {
      console.error(`❌ Error creating ${achievement.name}:`, error.message);
    }
  }

  // 4. Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Learning Platform Seeded Successfully!');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   - ${createdPaths.length} learning paths created`);
  console.log(`   - ${createdPaths.reduce((sum, p) => sum + (p.config?.lessons?.length || 0), 0)} lessons created`);
  console.log(`   - ${universalAchievements.length} achievements created`);
  console.log('\n💡 Next Steps:');
  console.log('   1. Run migrations/020_learning_platform.sql if not done already');
  console.log('   2. Create drip campaigns: node scripts/seed-drip-campaigns.js');
  console.log('   3. Generate today\'s mini-games: node scripts/generate-daily-games.js');
  console.log('   4. Start the learning API: POST /api/learning/enroll');
  console.log('\n🚀 Ready to teach!\n');

  await db.end();
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
