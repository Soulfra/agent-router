/**
 * Cal System Integrator
 *
 * Integration layer that connects all learning systems.
 * Ensures Cal:
 * - Checks BlueprintRegistry BEFORE building anything new
 * - Records all work in CalLearningSystem
 * - Auto-generates lessons using LearningEngine
 * - Queries PatternLearner for similar past work
 *
 * Purpose: STOP REBUILDING THE SAME SHIT
 *
 * Usage:
 *   const integrator = new CalSystemIntegrator();
 *   await integrator.init();
 *
 *   // Before building ANY feature, check what exists:
 *   const exists = await integrator.checkIfExists('github-integration');
 *   if (exists) {
 *     console.log('Feature already exists! Use it:', exists.blueprint);
 *     return;
 *   }
 *
 *   // Record your work:
 *   await integrator.recordWork({
 *     feature: 'github-integration',
 *     files: ['lib/github-api-client.js'],
 *     description: 'GitHub API wrapper using Octokit'
 *   });
 *
 *   // Auto-generate lesson:
 *   await integrator.createLesson({
 *     title: 'GitHub Integration',
 *     track: 'mcp-development',
 *     content: 'Learn to use GitHub API...'
 *   });
 */

const CalLearningSystem = require('./cal-learning-system');
const BlueprintRegistry = require('./blueprint-registry');
const PatternLearner = require('./pattern-learner');
const fs = require('fs').promises;
const path = require('path');

class CalSystemIntegrator {
  constructor(options = {}) {
    this.db = options.db;
    this.rootPath = options.rootPath || path.join(__dirname, '..');

    // Initialize all learning systems
    this.calLearning = new CalLearningSystem();
    this.blueprintRegistry = new BlueprintRegistry({ db: this.db, rootPath: this.rootPath });
    this.patternLearner = new PatternLearner();

    this.isInitialized = false;
  }

  /**
   * Initialize all systems
   */
  async init() {
    if (this.isInitialized) return;

    console.log('[CalSystemIntegrator] Initializing all learning systems...');

    // Initialize CalLearningSystem
    await this.calLearning.init();

    // Scan blueprints
    try {
      await this.blueprintRegistry.scanAndGenerateBlueprints();
      console.log('[CalSystemIntegrator] Blueprint registry loaded');
    } catch (error) {
      console.warn('[CalSystemIntegrator] Blueprint scan failed, will create minimal registry:', error.message);
    }

    this.isInitialized = true;
    console.log('[CalSystemIntegrator] ✅ All systems initialized');
  }

  /**
   * Check if feature/system already exists
   * Queries BlueprintRegistry and PatternLearner
   *
   * @param {string} featureName - Feature name to search for
   * @returns {Promise<Object|null>} - Existing feature info or null
   */
  async checkIfExists(featureName) {
    console.log(`[CalSystemIntegrator] Checking if "${featureName}" already exists...`);

    // 1. Check BlueprintRegistry
    const blueprintResults = this.blueprintRegistry.search(featureName);
    if (blueprintResults.length > 0) {
      console.log(`[CalSystemIntegrator] ✅ Found ${blueprintResults.length} existing blueprints:`);
      blueprintResults.forEach(bp => {
        console.log(`  - ${bp.name} (${bp.file})`);
      });

      return {
        exists: true,
        source: 'blueprint',
        blueprints: blueprintResults,
        recommendation: `Use existing system: ${blueprintResults[0].file}`
      };
    }

    // 2. Check CalLearningSystem for past work
    const lessons = await this.calLearning.searchLessons(featureName);
    if (lessons.length > 0) {
      console.log(`[CalSystemIntegrator] ✅ Found ${lessons.length} past lessons about "${featureName}"`);

      return {
        exists: true,
        source: 'learning-system',
        lessons: lessons.slice(0, 3),
        recommendation: 'Cal has worked on this before. Review lessons before rebuilding.'
      };
    }

    // 3. Check PatternLearner for similar workflows
    try {
      const prediction = await this.patternLearner.predictNextCommand([featureName]);
      if (prediction.length > 0) {
        console.log(`[CalSystemIntegrator] ✅ Found ${prediction.length} related workflow patterns`);

        return {
          exists: true,
          source: 'pattern-learner',
          patterns: prediction,
          recommendation: 'Similar workflows found. Review patterns before building.'
        };
      }
    } catch (error) {
      console.warn('[CalSystemIntegrator] Pattern lookup failed:', error.message);
    }

    console.log(`[CalSystemIntegrator] ❌ "${featureName}" does not exist yet. Safe to build.`);
    return null;
  }

  /**
   * Record work in all learning systems
   *
   * @param {Object} workInfo - Info about the work done
   * @param {string} workInfo.feature - Feature name
   * @param {Array} workInfo.files - Files created/modified
   * @param {string} workInfo.description - Description of work
   * @param {boolean} workInfo.success - Whether it worked (default true)
   * @param {Object} workInfo.context - Additional context
   * @returns {Promise<Object>} - Recording results
   */
  async recordWork(workInfo) {
    const { feature, files, description, success = true, context = {} } = workInfo;

    console.log(`[CalSystemIntegrator] Recording work: ${feature}`);

    const results = {};

    // 1. Record in CalLearningSystem
    try {
      if (success) {
        await this.calLearning.recordSuccess(feature, description, {
          whatWorked: description,
          files: files,
          ...context
        });
        console.log('[CalSystemIntegrator] ✅ Recorded success in CalLearningSystem');
      } else {
        await this.calLearning.recordFailure(feature, description, {
          whatFailed: description,
          files: files,
          ...context
        });
        console.log('[CalSystemIntegrator] ❌ Recorded failure in CalLearningSystem');
      }
      results.calLearning = true;
    } catch (error) {
      console.error('[CalSystemIntegrator] Failed to record in CalLearningSystem:', error);
      results.calLearning = false;
    }

    // 2. Record in PatternLearner
    try {
      await this.patternLearner.logCommand(
        feature,
        'feature-development',
        { files, description },
        { success },
        0,
        success
      );
      console.log('[CalSystemIntegrator] ✅ Recorded in PatternLearner');
      results.patternLearner = true;
    } catch (error) {
      console.error('[CalSystemIntegrator] Failed to record in PatternLearner:', error);
      results.patternLearner = false;
    }

    // 3. Add to BlueprintRegistry
    try {
      // Re-scan to pick up new files
      await this.blueprintRegistry.scanAndGenerateBlueprints();
      console.log('[CalSystemIntegrator] ✅ Updated BlueprintRegistry');
      results.blueprintRegistry = true;
    } catch (error) {
      console.error('[CalSystemIntegrator] Failed to update BlueprintRegistry:', error);
      results.blueprintRegistry = false;
    }

    return results;
  }

  /**
   * Create lesson from work done
   * Integrates with existing lesson system (docs/LESSON-SYSTEM.md)
   *
   * @param {Object} lessonInfo - Lesson details
   * @param {string} lessonInfo.title - Lesson title
   * @param {string} lessonInfo.track - Track (mcp-development, rpg-card-game, etc.)
   * @param {string} lessonInfo.content - Lesson content (markdown)
   * @param {number} lessonInfo.xpReward - XP reward (default 100)
   * @param {string} lessonInfo.lab - Lab file path (optional)
   * @returns {Promise<string>} - Path to lesson file
   */
  async createLesson(lessonInfo) {
    const { title, track, content, xpReward = 100, lab } = lessonInfo;

    console.log(`[CalSystemIntegrator] Creating lesson: ${title} (track: ${track})`);

    // Find next lesson number in track
    const trackDir = path.join(this.rootPath, 'docs', 'lessons', track);
    await fs.mkdir(trackDir, { recursive: true });

    const existingLessons = await fs.readdir(trackDir);
    const lessonNumbers = existingLessons
      .filter(f => f.startsWith('lesson-') && f.endsWith('.md'))
      .map(f => {
        const match = f.match(/lesson-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });

    const nextNumber = lessonNumbers.length > 0 ? Math.max(...lessonNumbers) + 1 : 1;

    // Generate filename
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `lesson-${nextNumber}-${slug}.md`;
    const filePath = path.join(trackDir, filename);

    // Generate lesson markdown
    const markdown = `# ${title}

**Track:** ${track}
**Lesson:** ${nextNumber}
**XP Reward:** ${xpReward}
**Time:** 20 minutes

## Learning Objectives

- ✅ Understand how ${title} works
- ✅ Build working examples
- ✅ Integrate with existing CalOS systems

## Content

${content}

## Lab

${lab ? `Open: \`${lab}\`` : 'Interactive lab coming soon...'}

## Summary

You learned about ${title}. This feature integrates with:
- CalLearningSystem (records successes/failures)
- BlueprintRegistry (documents what exists)
- PatternLearner (tracks workflows)

## Next Lesson

Continue to next lesson in the ${track} track!

## Quiz

1. What does ${title} do?
2. How does it integrate with other CalOS systems?
3. When should you use this feature?

---

**🎴 Achievement Unlocked:** ${title} Expert (+${xpReward} XP)
`;

    // Write lesson file
    await fs.writeFile(filePath, markdown, 'utf-8');

    console.log(`[CalSystemIntegrator] ✅ Created lesson: ${filePath}`);

    return filePath;
  }

  /**
   * Get existing blueprints
   * @param {string} query - Optional search query
   * @returns {Array} - Matching blueprints
   */
  getBlueprints(query = null) {
    if (query) {
      return this.blueprintRegistry.search(query);
    }
    return Array.from(this.blueprintRegistry.blueprints.values());
  }

  /**
   * Get learning statistics
   * @returns {Promise<Object>} - Combined stats from all systems
   */
  async getStats() {
    const stats = {
      calLearning: await this.calLearning.getStats(),
      blueprintRegistry: this.blueprintRegistry.getStatistics(),
      patternLearner: await this.patternLearner.getStats()
    };

    return stats;
  }

  /**
   * Get recent lessons learned by Cal
   * @param {number} limit - Number of lessons to return
   * @returns {Promise<Array>} - Recent lessons
   */
  async getRecentLessons(limit = 10) {
    return await this.calLearning.getRecentLessons(limit);
  }

  /**
   * Get suggested next action based on patterns
   * @param {Array} recentCommands - Recent commands
   * @returns {Promise<Array>} - Predicted next commands
   */
  async suggestNextAction(recentCommands) {
    try {
      return await this.patternLearner.predictNextCommand(recentCommands);
    } catch (error) {
      console.warn('[CalSystemIntegrator] Could not predict next action:', error);
      return [];
    }
  }

  /**
   * Export complete system documentation
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} - Path to exported file
   */
  async exportDocumentation(outputPath = null) {
    const output = outputPath || path.join(this.rootPath, 'docs', 'CAL-SYSTEM-INTEGRATION.md');

    const stats = await this.getStats();
    const blueprints = this.getBlueprints();
    const recentLessons = await this.getRecentLessons(10);

    const content = `# Cal System Integration

**Generated:** ${new Date().toISOString()}

## Overview

This document shows how all Cal learning systems are integrated:
- **CalLearningSystem** - Records successes/failures
- **BlueprintRegistry** - Documents what exists
- **PatternLearner** - Tracks workflows
- **LearningEngine** - Gamified learning platform

## Statistics

### CalLearningSystem
- Total Lessons: ${stats.calLearning.total_lessons || 0}
- Successes: ${stats.calLearning.successes || 0}
- Failures: ${stats.calLearning.failures || 0}
- Success Rate: ${((stats.calLearning.success_rate || 0) * 100).toFixed(1)}%
- Unique Tasks: ${stats.calLearning.unique_tasks || 0}

### BlueprintRegistry
- Total Blueprints: ${stats.blueprintRegistry.total}
- Systems: ${stats.blueprintRegistry.systems}
- Components: ${stats.blueprintRegistry.components}
- Total Usage: ${stats.blueprintRegistry.totalUsage}

### PatternLearner
- Total Sequences: ${stats.patternLearner.total_sequences || 0}
- Total Commands: ${stats.patternLearner.total_commands || 0}
- Successful Commands: ${stats.patternLearner.successful_commands || 0}
- Failed Commands: ${stats.patternLearner.failed_commands || 0}

## Available Blueprints

${blueprints.slice(0, 10).map(bp => `
### ${bp.name}
- **File:** \`${bp.file}\`
- **Type:** ${bp.type}
- **Status:** ${bp.status}
${bp.capabilities ? `- **Capabilities:** ${bp.capabilities.join(', ')}\n` : ''}
`).join('\n')}

${blueprints.length > 10 ? `... and ${blueprints.length - 10} more\n` : ''}

## Recent Lessons Learned

${recentLessons.map((lesson, i) => `
${i + 1}. **${lesson.task_type}** (${lesson.outcome})
   - ${lesson.lesson}
   - Confidence: ${(lesson.confidence * 100).toFixed(0)}%
`).join('\n')}

## How to Use

### Before Building Anything New

\`\`\`javascript
const CalSystemIntegrator = require('./lib/cal-system-integrator');
const integrator = new CalSystemIntegrator();
await integrator.init();

// Check if feature exists
const exists = await integrator.checkIfExists('github-integration');
if (exists) {
  console.log('Already exists!', exists);
  // Use existing system instead
}
\`\`\`

### Record Your Work

\`\`\`javascript
await integrator.recordWork({
  feature: 'github-integration',
  files: ['lib/github-api-client.js'],
  description: 'GitHub API wrapper',
  success: true
});
\`\`\`

### Auto-Generate Lesson

\`\`\`javascript
await integrator.createLesson({
  title: 'GitHub Integration',
  track: 'mcp-development',
  content: '# How to use GitHub API...',
  xpReward: 120
});
\`\`\`

---

**Built with 🔥 by CALOS**

*Stop rebuilding the same shit. Check what exists first.*
`;

    await fs.writeFile(output, content, 'utf-8');

    console.log(`[CalSystemIntegrator] ✅ Exported documentation: ${output}`);

    return output;
  }

  /**
   * Close all systems
   */
  close() {
    if (this.calLearning) {
      this.calLearning.close();
    }
  }
}

module.exports = CalSystemIntegrator;
