#!/usr/bin/env node
/**
 * Generate CAL-LEARNED-KNOWLEDGE.md
 *
 * Auto-generates markdown documentation from CAL's learned knowledge.
 * Run this after migrations or when knowledge is updated.
 *
 * Usage: node scripts/generate-knowledge-docs.js
 */

const fs = require('fs').promises;
const path = require('path');

const CalMigrationLearner = require('../lib/cal-migration-learner');
const CalSkillTracker = require('../lib/cal-skill-tracker');
const CalFailureLearner = require('../lib/cal-failure-learner');
const CalDocLearner = require('../lib/cal-doc-learner');

async function generateDocs() {
  console.log('[DocsGenerator] Loading CAL knowledge systems...');

  // Initialize learners
  const migrationLearner = new CalMigrationLearner();
  const skillTracker = new CalSkillTracker();
  const failureLearner = new CalFailureLearner();
  const docLearner = new CalDocLearner();

  // Load all systems
  await Promise.all([
    migrationLearner.load(),
    skillTracker.load(),
    failureLearner.load(),
    docLearner.load()
  ]);

  console.log('[DocsGenerator] ✓ All knowledge systems loaded');

  // Get summaries
  const migrationSummary = migrationLearner.getSummary();
  const skillSummary = await skillTracker.getSummary();
  const docSummary = docLearner.getSummary();

  const brokenMigrations = migrationLearner.getBrokenMigrations();
  const masteredSkills = skillTracker.getMasteredSkills();
  const skillsNeedingWork = skillTracker.getSkillsNeedingWork();
  const bestPractices = docLearner.knowledge.bestPractices
    .sort((a, b) => b.confidence - a.confidence);

  // Generate markdown
  const markdown = `# CAL Learned Knowledge

> **Auto-generated documentation** of everything CAL has learned from migrations, failures, skills, and documentation.
>
> **Last Updated:** ${new Date().toISOString()}
>
> **View Interactive Browser:** [http://localhost:5001/cal-knowledge-viewer.html](http://localhost:5001/cal-knowledge-viewer.html)
>
> **API Endpoint:** [http://localhost:5001/api/cal-knowledge/summary](http://localhost:5001/api/cal-knowledge/summary)

---

## 📊 Summary

### Migration Learning
- **Total Tracked:** ${migrationSummary?.total || 0}
- **Working:** ${migrationSummary?.working || 0}
- **Failing:** ${migrationSummary?.failing || 0}
- **Broken:** ${migrationSummary?.broken || 0}
- **Skip List:** ${migrationSummary?.skipList?.length || 0}

### Skill Mastery
- **Total Skills:** ${skillSummary?.totalSkills || 0}
- **Mastered:** ${skillSummary?.masteredSkills || 0}
- **Needs Work:** ${skillSummary?.skillsNeedingWork || 0}
- **Overall Success Rate:** ${skillSummary?.overallSuccessRate || 'N/A'}
- **Total Attempts:** ${skillSummary?.totalAttempts || 0}

### Documentation Knowledge
- **Sources Learned:** ${docSummary?.totalSources || 0}
- **Topics Tracked:** ${docSummary?.totalTopics || 0}
- **Best Practices:** ${docSummary?.totalBestPractices || 0}
- **Error Solutions:** ${docSummary?.totalErrorSolutions || 0}

---

## 🗄️ Migration Knowledge

### Top Error Patterns

${migrationSummary?.topErrors?.length > 0 ? migrationSummary.topErrors.map(err => `
#### ${err.pattern}
- **Occurrences:** ${err.count}
- **Affected Migrations:** ${err.affectedMigrations}
- **Fix:** ${err.fix}
`).join('\n') : '*No error patterns tracked yet*'}

### Broken Migrations (Auto-Skipped)

${brokenMigrations.length > 0 ? brokenMigrations.map(m => `
#### \`${m.file}\`
- **Consecutive Failures:** ${m.consecutiveFailures}
- **Last Error:** ${m.lastError?.error || 'Unknown'}
${m.suggestedFix ? `- **Suggested Fix:** ${m.suggestedFix.description}` : ''}
`).join('\n') : '*No broken migrations! 🎉*'}

### Skip List

${migrationSummary?.skipList?.length > 0 ?
  migrationSummary.skipList.map(file => `- \`${file}\``).join('\n') :
  '*No migrations currently skipped*'
}

---

## 🎯 Skills & Mastery

### Mastered Skills ✅

${masteredSkills.length > 0 ? masteredSkills.map(skill => `
#### ${skill.skillId}
- **Level:** ${skill.levelName}
- **Success Rate:** ${skill.successRate}
- **Total Successes:** ${skill.totalSuccesses}
- **Last Practiced:** ${skill.lastPracticed ? new Date(skill.lastPracticed).toLocaleDateString() : 'Never'}
`).join('\n') : '*No skills mastered yet*'}

### Skills Needing Work ⚠️

${skillsNeedingWork.slice(0, 10).length > 0 ? skillsNeedingWork.slice(0, 10).map(skill => `
#### ${skill.skillId}
- **Level:** ${skill.levelName}
- **Success Rate:** ${skill.successRate}
- **Total Failures:** ${skill.totalFailures}
- **Consecutive Failures:** ${skill.consecutiveFailures}
`).join('\n') : '*No skills needing work*'}

${skillsNeedingWork.length > 10 ? `\n*...and ${skillsNeedingWork.length - 10} more*\n` : ''}

---

## ❌ Failure Patterns

### What CAL Has Learned NOT To Do

${Object.keys(failureLearner.knowledge.failures).length > 0 ?
  Object.keys(failureLearner.knowledge.failures).slice(0, 15).map(taskId => {
    const summary = failureLearner.getSummary(taskId);
    if (!summary) return '';

    return `
#### ${taskId}
- **Total Failures:** ${summary.totalFailures}
- **Total Successes:** ${summary.totalSuccesses}
${summary.mostFailedApproach ? `- **Most Failed Approach:** ${summary.mostFailedApproach.approach} (${summary.mostFailedApproach.count} times)` : ''}
${summary.mostSuccessfulApproach ? `- **Most Successful Approach:** ${summary.mostSuccessfulApproach.approach}` : ''}
${summary.recommendation ? `- **💡 Recommended:** ${summary.recommendation.approach} (${(summary.recommendation.confidence * 100).toFixed(0)}% confidence)` : ''}
`;
  }).join('\n') :
  '*No failure patterns tracked yet*'
}

---

## 💡 Best Practices

### Learned from Documentation & Experience

${bestPractices.length > 0 ? bestPractices.map((bp, index) => `
${index + 1}. **${bp.practice}**
   - Confidence: ${(bp.confidence * 100).toFixed(0)}%
   - Sources: ${bp.sources?.length || 0}
`).join('\n') : '*No best practices learned yet*'}

---

## 📖 Documentation Sources

### Recently Learned From

${docSummary?.recentSources?.length > 0 ? docSummary.recentSources.map(s => `
- [${s.url}](${s.url})
  - Learned: ${new Date(s.lastFetched).toLocaleDateString()}
`).join('\n') : '*No documentation sources yet*'}

### Top Topics

${docSummary?.topTopics?.length > 0 ? docSummary.topTopics.map(t => `
#### ${t.topic}
- ${t.sources} source${t.sources !== 1 ? 's' : ''}
`).join('\n') : '*No topics tracked yet*'}

---

## 🔗 Resources

- **Interactive Browser:** [http://localhost:5001/cal-knowledge-viewer.html](http://localhost:5001/cal-knowledge-viewer.html)
- **API Documentation:**
  - Summary: \`GET /api/cal-knowledge/summary\`
  - Migrations: \`GET /api/cal-knowledge/migrations\`
  - Skills: \`GET /api/cal-knowledge/skills\`
  - Failures: \`GET /api/cal-knowledge/failures\`
  - Documentation: \`GET /api/cal-knowledge/docs\`
  - Best Practices: \`GET /api/cal-knowledge/best-practices\`
  - Export All: \`GET /api/cal-knowledge/export\`
  - Error Solution: \`GET /api/cal-knowledge/error-solution?error=<error_message>\`
- **Teach CAL:** \`POST /api/cal-knowledge/docs/learn\` with \`{ "url": "https://..." }\`

---

## 🤖 About CAL's Learning

CAL learns from:
1. **Migration Successes & Failures** - Which migrations work, which fail, and why
2. **Skill Practice** - Command execution, debugging, and problem-solving
3. **Error Patterns** - Common errors and their solutions
4. **Documentation** - URLs, docs, and best practices from the web
5. **Community Teaching** - Lessons submitted by the community

CAL uses this knowledge to:
- ✅ **Skip known-broken migrations** automatically
- ✅ **Suggest fixes** for common errors
- ✅ **Try alternative approaches** when stuck
- ✅ **Focus on weak skills** instead of repeating mastered ones
- ✅ **Learn from documentation** to improve solutions

---

*This file is auto-generated by \`scripts/generate-knowledge-docs.js\`. Do not edit manually.*

*To update: \`node scripts/generate-knowledge-docs.js\`*
`;

  // Write to file
  const outputPath = path.join(__dirname, '../docs/CAL-LEARNED-KNOWLEDGE.md');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown);

  console.log(`[DocsGenerator] ✓ Generated: ${outputPath}`);
  console.log(`[DocsGenerator] Total lines: ${markdown.split('\n').length}`);
  console.log(`[DocsGenerator] Total size: ${(markdown.length / 1024).toFixed(2)} KB`);

  // Also generate a JSON export
  const jsonPath = path.join(__dirname, '../docs/cal-knowledge-export.json');
  const jsonExport = {
    migrations: {
      summary: migrationSummary,
      brokenMigrations
    },
    skills: {
      summary: skillSummary,
      mastered: masteredSkills,
      needingWork: skillsNeedingWork.slice(0, 20)
    },
    failures: {
      count: Object.keys(failureLearner.knowledge.failures).length
    },
    docs: {
      summary: docSummary,
      bestPractices: bestPractices.slice(0, 50)
    },
    generatedAt: new Date().toISOString(),
    version: '1.0.0'
  };

  await fs.writeFile(jsonPath, JSON.stringify(jsonExport, null, 2));
  console.log(`[DocsGenerator] ✓ Generated JSON export: ${jsonPath}`);

  return {
    markdownPath: outputPath,
    jsonPath,
    stats: {
      migrations: migrationSummary?.total || 0,
      skills: skillSummary?.totalSkills || 0,
      bestPractices: bestPractices.length
    }
  };
}

// Run if called directly
if (require.main === module) {
  generateDocs()
    .then(result => {
      console.log('\n[DocsGenerator] ✅ Documentation generated successfully!');
      console.log(result);
      process.exit(0);
    })
    .catch(error => {
      console.error('[DocsGenerator] ❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { generateDocs };
