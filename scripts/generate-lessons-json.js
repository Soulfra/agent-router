#!/usr/bin/env node

/**
 * CalOS Lesson System - Auto-generate lessons.json
 *
 * This script scans the docs/lessons directory and automatically generates
 * the lessons.json file with metadata extracted from markdown frontmatter.
 *
 * Usage:
 *   node scripts/generate-lessons-json.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LESSONS_DIR = path.join(__dirname, '../docs/lessons');
const OUTPUT_FILE = path.join(__dirname, '../public/lessons/lessons.json');
const LABS_DIR = path.join(__dirname, '../public/labs');

// Track definitions
const TRACKS = [
  {
    id: 'mcp-development',
    name: 'Privacy-First MCP Development',
    emoji: '🔧',
    description: 'Build Model Context Protocol servers with zero telemetry and local-only execution',
    color: '#667eea'
  },
  {
    id: 'rpg-card-game',
    name: 'RPG Card Game Development',
    emoji: '🎴',
    description: 'Build a full-featured card collection game with XP, quests, and leaderboards',
    color: '#764ba2'
  },
  {
    id: 'zero-dependency',
    name: 'Zero-Dependency Architecture',
    emoji: '🚫',
    description: 'Build production systems with zero external dependencies and complete privacy',
    color: '#f093fb'
  },
  {
    id: 'multi-tier',
    name: 'Multi-Tier SaaS Platform',
    emoji: '💳',
    description: 'Build a production-ready SaaS with BYOK, billing, and multi-project support',
    color: '#4facfe'
  }
];

// Achievement definitions
const ACHIEVEMENTS = [
  {
    id: 'first-lesson',
    name: 'First Steps',
    description: 'Complete your first lesson',
    xp: 50,
    icon: '🎯'
  },
  {
    id: 'track-complete',
    name: 'Track Master',
    description: 'Complete an entire track',
    xp: 200,
    icon: '🏆'
  },
  {
    id: 'all-tracks',
    name: 'CalOS Graduate',
    description: 'Complete all 4 tracks',
    xp: 500,
    icon: '🎓'
  },
  {
    id: 'lab-master',
    name: 'Lab Master',
    description: 'Complete 10 labs',
    xp: 100,
    icon: '🔬'
  },
  {
    id: 'speedrun',
    name: 'Speedrunner',
    description: 'Complete 5 lessons in one day',
    xp: 150,
    icon: '⚡'
  },
  {
    id: 'perfect-score',
    name: 'Perfect Score',
    description: 'Get 100% on all quizzes',
    xp: 300,
    icon: '💯'
  }
];

/**
 * Parse markdown frontmatter
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  const metadata = {};

  let inFrontmatter = false;
  let currentKey = null;

  for (const line of lines) {
    // Check for heading-based metadata (# Lesson X: Title)
    if (line.startsWith('# ')) {
      const match = line.match(/# Lesson (\d+): (.+)/);
      if (match) {
        metadata.number = parseInt(match[1]);
        metadata.title = match[2].trim();
      }
    }

    // Check for bold metadata (**Track:** Value)
    const trackMatch = line.match(/\*\*Track:\*\* (.+)/);
    if (trackMatch) {
      metadata.track = trackMatch[1].trim();
    }

    const lessonMatch = line.match(/\*\*Lesson:\*\* (\d+) of (\d+)/);
    if (lessonMatch) {
      metadata.number = parseInt(lessonMatch[1]);
      metadata.totalLessons = parseInt(lessonMatch[2]);
    }

    const xpMatch = line.match(/\*\*XP Reward:\*\* (\d+)/);
    if (xpMatch) {
      metadata.xp = parseInt(xpMatch[1]);
    }

    const timeMatch = line.match(/\*\*Time:\*\* (.+)/);
    if (timeMatch) {
      metadata.time = timeMatch[1].trim();
    }

    const prereqMatch = line.match(/\*\*Prerequisites:\*\* (.+)/);
    if (prereqMatch) {
      const prereqs = prereqMatch[1].trim();
      if (prereqs.toLowerCase() === 'none') {
        metadata.prerequisites = [];
      } else {
        metadata.prerequisites = prereqs.split(',').map(p => p.trim());
      }
    }
  }

  return metadata;
}

/**
 * Find lab file for lesson
 */
function findLabForLesson(trackId, lessonNumber) {
  // Map lesson numbers to lab files
  const labMappings = {
    'mcp-development': {
      1: 'mcp-client.html',
      2: 'mcp-client.html',
      3: 'mcp-custom-tool.html',
      4: 'mcp-rpg-xp.html',
      5: 'mcp-file-manager.html',
      6: 'mcp-code-search.html',
      7: 'mcp-privacy-audit.html',
      8: 'mcp-deployment.html',
      9: 'mcp-test-suite.html'
    },
    'rpg-card-game': {
      1: 'card-opener.html',
      2: 'card-opener.html',
      3: 'card-opener.html',
      4: 'card-collection.html',
      5: 'card-roasting.html',
      6: 'rpg-dashboard.html',
      7: 'rpg-dashboard.html',
      8: 'rpg-dashboard.html',
      9: 'rpg-dashboard.html',
      10: 'rpg-complete.html'
    },
    'zero-dependency': {
      1: 'schema-validator.html',
      2: 'privacy-checker.html',
      3: 'privacy-checker.html',
      4: 'zero-dep-builder.html',
      5: 'zero-dep-builder.html',
      6: 'zero-dep-builder.html',
      7: 'zero-dep-builder.html'
    },
    'multi-tier': {
      1: 'tier-checker.html',
      2: 'byok-manager.html',
      3: 'tier-checker.html',
      4: 'billing-dashboard.html',
      5: 'tier-checker.html',
      6: 'multi-project.html',
      7: 'multi-project.html'
    }
  };

  const labFile = labMappings[trackId]?.[lessonNumber];
  return labFile ? `/labs/${labFile}` : null;
}

/**
 * Scan lesson directory and extract metadata
 */
function scanLessons(trackId) {
  const trackDir = path.join(LESSONS_DIR, trackId);

  if (!fs.existsSync(trackDir)) {
    console.warn(`⚠️  Track directory not found: ${trackDir}`);
    return [];
  }

  const files = fs.readdirSync(trackDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  const lessons = [];

  for (const file of files) {
    const filePath = path.join(trackDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = parseFrontmatter(content);

    // Extract lesson number from filename (e.g., lesson-1-intro.md)
    const filenameMatch = file.match(/lesson-(\d+)-/);
    const lessonNumber = filenameMatch ? parseInt(filenameMatch[1]) : metadata.number || lessons.length + 1;

    // Generate lesson ID
    const lessonId = `${trackId.split('-')[0]}-${lessonNumber}`;

    // Find associated lab
    const labFile = findLabForLesson(trackId, lessonNumber);

    // Build prerequisites (previous lesson in sequence)
    const prerequisites = [];
    if (lessonNumber > 1) {
      prerequisites.push(`${trackId.split('-')[0]}-${lessonNumber - 1}`);
    }

    const lesson = {
      id: lessonId,
      number: lessonNumber,
      title: metadata.title || `Lesson ${lessonNumber}`,
      xp: metadata.xp || 100,
      time: metadata.time || '20 min',
      file: `/docs/lessons/${trackId}/${file}`,
      lab: labFile,
      prerequisites: metadata.prerequisites || prerequisites
    };

    lessons.push(lesson);
  }

  // Sort by lesson number
  lessons.sort((a, b) => a.number - b.number);

  return lessons;
}

/**
 * Generate complete lessons.json
 */
function generateLessonsJSON() {
  console.log('🔧 CalOS Lesson System - Auto-generating lessons.json...\n');

  const catalog = {
    version: '1.0.0',
    updated: new Date().toISOString().split('T')[0],
    tracks: []
  };

  let totalLessons = 0;
  let totalXP = 0;

  for (const track of TRACKS) {
    console.log(`📚 Scanning track: ${track.emoji} ${track.name}`);

    const lessons = scanLessons(track.id);
    const trackXP = lessons.reduce((sum, lesson) => sum + lesson.xp, 0);

    console.log(`   Found ${lessons.length} lessons (${trackXP} XP)`);

    catalog.tracks.push({
      ...track,
      lessons: lessons.length,
      xp: trackXP,
      lessons: lessons
    });

    totalLessons += lessons.length;
    totalXP += trackXP;
  }

  // Add totals
  catalog.totalLessons = totalLessons;
  catalog.totalXP = totalXP;
  catalog.achievements = ACHIEVEMENTS;

  // Write to file
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(catalog, null, 2));

  console.log('\n✅ Successfully generated lessons.json!');
  console.log(`   Total lessons: ${totalLessons}`);
  console.log(`   Total XP: ${totalXP}`);
  console.log(`   Output: ${OUTPUT_FILE}`);

  return catalog;
}

/**
 * Validate lessons.json
 */
function validateLessons(catalog) {
  console.log('\n🔍 Validating lessons.json...\n');

  let errors = 0;
  let warnings = 0;

  // Check each track
  for (const track of catalog.tracks) {
    console.log(`Validating track: ${track.name}`);

    // Check lesson files exist
    for (const lesson of track.lessons) {
      const lessonFile = path.join(__dirname, '..', lesson.file);
      if (!fs.existsSync(lessonFile)) {
        console.error(`   ❌ Lesson file not found: ${lesson.file}`);
        errors++;
      }

      // Check lab files exist
      if (lesson.lab) {
        const labFile = path.join(__dirname, '..', 'public', lesson.lab);
        if (!fs.existsSync(labFile)) {
          console.warn(`   ⚠️  Lab file not found: ${lesson.lab}`);
          warnings++;
        }
      }

      // Check prerequisites are valid
      for (const prereq of lesson.prerequisites || []) {
        const prereqExists = track.lessons.some(l => l.id === prereq) ||
          catalog.tracks.some(t => t.lessons.some(l => l.id === prereq));

        if (!prereqExists) {
          console.error(`   ❌ Invalid prerequisite: ${prereq} for lesson ${lesson.id}`);
          errors++;
        }
      }
    }
  }

  console.log('\n📊 Validation Summary:');
  console.log(`   Errors: ${errors}`);
  console.log(`   Warnings: ${warnings}`);

  if (errors === 0) {
    console.log('   ✅ All validations passed!');
  } else {
    console.log('   ❌ Validation failed. Please fix errors above.');
    process.exit(1);
  }
}

/**
 * Print summary
 */
function printSummary(catalog) {
  console.log('\n📈 Lesson System Summary:\n');

  for (const track of catalog.tracks) {
    console.log(`${track.emoji} ${track.name}`);
    console.log(`   Lessons: ${track.lessons.length}`);
    console.log(`   Total XP: ${track.xp}`);
    console.log(`   Avg XP/lesson: ${Math.round(track.xp / track.lessons.length)}`);
    console.log('');
  }

  console.log(`🎯 Total System:`);
  console.log(`   Tracks: ${catalog.tracks.length}`);
  console.log(`   Lessons: ${catalog.totalLessons}`);
  console.log(`   Total XP: ${catalog.totalXP}`);
  console.log(`   Achievements: ${catalog.achievements.length}`);
  console.log('');
}

/**
 * Main execution
 */
function main() {
  try {
    const catalog = generateLessonsJSON();
    validateLessons(catalog);
    printSummary(catalog);

    console.log('🚀 Ready for deployment!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the generated lessons.json');
    console.log('  2. Test the lesson portal locally');
    console.log('  3. Commit and push to deploy via GitHub Pages');
    console.log('');
  } catch (error) {
    console.error('❌ Error generating lessons.json:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateLessonsJSON,
  validateLessons,
  scanLessons
};
