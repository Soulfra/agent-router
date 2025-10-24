/**
 * Repo Builder Agent - Teaches Cal to Auto-Populate Brand Repos
 *
 * What it does:
 * 1. Reads lessons from database
 * 2. Maps lessons to brand content
 * 3. Generates READMEs, docs, tutorials
 * 4. Commits and pushes to GitHub repos
 *
 * Usage:
 *   node agents/repo-builder-agent.js --learn "grep basics"
 *   node agents/repo-builder-agent.js --populate calriven
 *   node agents/repo-builder-agent.js --deploy calriven
 *   node agents/repo-builder-agent.js --status
 *   node agents/repo-builder-agent.js --deploy-all
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RepoBuilderAgent {
  constructor(config = {}) {
    this.db = new Pool({
      connectionString: config.databaseUrl || process.env.DATABASE_URL || 'postgresql://matthewmauer@localhost:5432/calos'
    });

    // Map lessons to brand repos
    this.brandLessonMap = {
      'calriven': {
        name: 'CalRiven',
        description: 'Federated publishing platform',
        repoUrl: 'https://github.com/Soulfra/calriven',
        lessons: ['grep', 'sed'], // Publishing workflow
        focusAreas: ['content editing', 'search', 'publishing'],
        color: '#e74c3c' // Red theme
      },
      'vibecoding': {
        name: 'VibeCoding',
        description: 'Knowledge vault with dragon theme',
        repoUrl: 'https://github.com/Soulfra/vibecoding',
        lessons: ['Tool Combinations', 'jq'], // Knowledge management
        focusAreas: ['knowledge storage', 'semantic search', 'librarian'],
        color: '#9b59b6' // Purple/dragon theme
      },
      'perplexity-vault': {
        name: 'Perplexity Vault',
        description: 'Search & research platform',
        repoUrl: 'https://github.com/Soulfra/perplexity-vault',
        lessons: ['grep regex', 'jq'], // Search/research
        focusAreas: ['web search', 'research', 'vault'],
        color: '#667eea' // Purple/blue/gold
      },
      'calos-platform': {
        name: 'CALOS Platform',
        description: 'Privacy-first automation platform',
        repoUrl: 'https://github.com/Soulfra/calos-platform',
        lessons: ['all'], // Core platform gets all lessons
        focusAreas: ['automation', 'privacy', 'AI routing'],
        color: '#667eea' // CALOS purple
      },
      'soulfra': {
        name: 'Soulfra',
        description: 'Privacy & identity platform',
        repoUrl: 'https://github.com/Soulfra/soulfra',
        lessons: ['all'], // Core infrastructure
        focusAreas: ['privacy', 'identity', 'zero-knowledge'],
        color: '#1a1a1a' // Dark theme
      }
    };

    this.projectsDir = path.join(__dirname, '../projects');
  }

  /**
   * Get all lessons from database
   */
  async getLessons(filter = {}) {
    let query = `
      SELECT
        lesson_id,
        lesson_title,
        lesson_slug,
        description,
        learning_objectives,
        content_data,
        estimated_minutes,
        xp_reward
      FROM lessons
      WHERE status = 'published'
    `;

    if (filter.titleContains) {
      query += ` AND LOWER(lesson_title) LIKE LOWER('%${filter.titleContains}%')`;
    }

    query += ' ORDER BY lesson_number';

    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Get lessons Cal has completed
   */
  async getCalProgress() {
    const result = await this.db.query(`
      SELECT
        l.lesson_title,
        l.lesson_slug,
        lc.completed_at
      FROM lesson_completions lc
      JOIN lessons l ON l.lesson_id = lc.lesson_id
      ORDER BY lc.completed_at DESC
    `);
    return result.rows;
  }

  /**
   * Map lessons to brand content
   */
  async mapLessonsToBrand(brandSlug) {
    const brand = this.brandLessonMap[brandSlug];
    if (!brand) {
      throw new Error(`Brand '${brandSlug}' not found`);
    }

    const allLessons = await this.getLessons();

    // Filter lessons for this brand
    let brandLessons = [];
    if (brand.lessons.includes('all')) {
      brandLessons = allLessons;
    } else {
      brandLessons = allLessons.filter(lesson =>
        brand.lessons.some(filter =>
          lesson.lesson_title.toLowerCase().includes(filter.toLowerCase()) ||
          lesson.lesson_slug.toLowerCase().includes(filter.toLowerCase())
        )
      );
    }

    return {
      brand,
      lessons: brandLessons
    };
  }

  /**
   * Generate README from lessons
   */
  generateREADME(brand, lessons) {
    const { name, description, repoUrl, focusAreas } = brand;

    let readme = `# ${name}

> ${description}

## Overview

${name} is part of the CALOS ecosystem, focusing on ${focusAreas.join(', ')}.

## Features

`;

    // Add features from lessons
    lessons.forEach((lesson, i) => {
      readme += `${i + 1}. **${lesson.lesson_title}** - ${lesson.description}\n`;
    });

    readme += `
## Quick Start

\`\`\`bash
# Clone repo
git clone ${repoUrl}
cd ${brand.name.toLowerCase()}

# Follow tutorials in docs/
\`\`\`

## Documentation

${lessons.map((lesson, i) => `- [${lesson.lesson_title}](./docs/${lesson.lesson_slug}.md)`).join('\n')}

## Learning Path

This repo contains **${lessons.length} lessons** to master ${name}:

${lessons.map((lesson, i) => {
  return `### ${i + 1}. ${lesson.lesson_title}

**Estimated time**: ${lesson.estimated_minutes} minutes
**XP reward**: ${lesson.xp_reward} XP

${lesson.description}

${lesson.learning_objectives ? '**Learning objectives:**\n' + lesson.learning_objectives.map(obj => `- ${obj}`).join('\n') : ''}

[Start lesson →](./docs/${lesson.lesson_slug}.md)
`;
}).join('\n')}

## The CALOS Ecosystem

${name} works alongside other CALOS platforms:

- **[CALOS](https://github.com/Soulfra/calos-platform)** - Business automation core
- **[Soulfra](https://github.com/Soulfra/soulfra)** - Privacy & identity layer
- **[CalRiven](https://github.com/Soulfra/calriven)** - Publishing platform
- **[VibeCoding](https://github.com/Soulfra/vibecoding)** - Knowledge vault
- **[Perplexity Vault](https://github.com/Soulfra/perplexity-vault)** - Research & search

[See full ecosystem map →](https://soulfra.github.io)

## Support

- **GitHub Discussions**: [Ask questions](${repoUrl}/discussions)
- **GitHub Issues**: [Report bugs](${repoUrl}/issues)

## License

MIT © 2025 SoulFra

---

**Built with ❤️ by the CALOS ecosystem**
*Learn. Build. Ship.*
`;

    return readme;
  }

  /**
   * Generate individual lesson docs
   */
  generateLessonDoc(lesson, brand) {
    const { lesson_title, description, learning_objectives, content_data, estimated_minutes, xp_reward } = lesson;

    let doc = `# ${lesson_title}

> ${description}

**Estimated time**: ${estimated_minutes} minutes | **XP reward**: ${xp_reward} XP

## Learning Objectives

${learning_objectives ? learning_objectives.map(obj => `- ${obj}`).join('\n') : 'Objectives not specified'}

## Content

`;

    // Extract content from content_data JSON
    if (content_data) {
      if (content_data.steps) {
        doc += `### Steps\n\n`;
        content_data.steps.forEach((step, i) => {
          doc += `#### ${i + 1}. ${step.title || `Step ${i + 1}`}\n\n`;
          doc += `${step.content || step.description || ''}\n\n`;
          if (step.code) {
            doc += `\`\`\`${step.language || 'bash'}\n${step.code}\n\`\`\`\n\n`;
          }
        });
      }

      if (content_data.examples) {
        doc += `### Examples\n\n`;
        content_data.examples.forEach((example, i) => {
          doc += `#### Example ${i + 1}: ${example.title || 'Untitled'}\n\n`;
          doc += `${example.description || ''}\n\n`;
          if (example.code) {
            doc += `\`\`\`${example.language || 'bash'}\n${example.code}\n\`\`\`\n\n`;
          }
        });
      }

      if (content_data.quiz) {
        doc += `### Knowledge Check\n\n`;
        content_data.quiz.forEach((question, i) => {
          doc += `**Q${i + 1}**: ${question.question}\n\n`;
          if (question.options) {
            question.options.forEach((opt, j) => {
              doc += `${String.fromCharCode(97 + j)}) ${opt}\n`;
            });
            doc += `\n`;
          }
        });
      }
    }

    doc += `
## Apply to ${brand.name}

This lesson helps you:
${brand.focusAreas.map(area => `- Improve ${area} capabilities`).join('\n')}

## Next Steps

- Complete this lesson to earn ${xp_reward} XP
- Share your implementation in [Discussions](${brand.repoUrl}/discussions)
- Explore other lessons in the [README](../README.md)

---

**Part of the ${brand.name} learning path** | [Back to overview](../README.md)
`;

    return doc;
  }

  /**
   * Populate brand repo with content
   */
  async populate(brandSlug, options = {}) {
    console.log(`[RepoBuilder] Populating ${brandSlug}...`);

    const { brand, lessons } = await this.mapLessonsToBrand(brandSlug);
    console.log(`[RepoBuilder] Found ${lessons.length} lessons for ${brand.name}`);

    // Create local project directory
    const brandDir = path.join(this.projectsDir, brandSlug);
    if (!fs.existsSync(brandDir)) {
      fs.mkdirSync(brandDir, { recursive: true });
      console.log(`[RepoBuilder] Created directory: ${brandDir}`);
    }

    // Initialize git if needed
    if (!fs.existsSync(path.join(brandDir, '.git'))) {
      execSync(`git init`, { cwd: brandDir });
      execSync(`git remote add origin ${brand.repoUrl}.git`, { cwd: brandDir });
      console.log(`[RepoBuilder] Initialized git repo`);
    }

    // Generate and write README
    const readme = this.generateREADME(brand, lessons);
    fs.writeFileSync(path.join(brandDir, 'README.md'), readme);
    console.log(`[RepoBuilder] ✓ Generated README.md`);

    // Create docs directory
    const docsDir = path.join(brandDir, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate lesson docs
    for (const lesson of lessons) {
      const lessonDoc = this.generateLessonDoc(lesson, brand);
      const lessonPath = path.join(docsDir, `${lesson.lesson_slug}.md`);
      fs.writeFileSync(lessonPath, lessonDoc);
      console.log(`[RepoBuilder] ✓ Generated docs/${lesson.lesson_slug}.md`);
    }

    return {
      brand,
      lessonsPopulated: lessons.length,
      path: brandDir
    };
  }

  /**
   * Deploy to GitHub
   */
  async deploy(brandSlug, options = {}) {
    console.log(`[RepoBuilder] Deploying ${brandSlug} to GitHub...`);

    const brandDir = path.join(this.projectsDir, brandSlug);
    if (!fs.existsSync(brandDir)) {
      throw new Error(`Brand directory not found: ${brandDir}. Run --populate first.`);
    }

    const brand = this.brandLessonMap[brandSlug];

    // Git add, commit, push
    try {
      execSync(`git add .`, { cwd: brandDir });

      const commitMessage = options.message || `Update ${brand.name} content from lessons

- Auto-generated from Cal's learning database
- ${fs.readdirSync(path.join(brandDir, 'docs')).length} lesson docs
- README with learning path

🤖 Generated by Repo Builder Agent`;

      execSync(`git commit -m "${commitMessage}"`, { cwd: brandDir });
      execSync(`git push -u origin main --force`, { cwd: brandDir });

      console.log(`[RepoBuilder] ✓ Deployed to ${brand.repoUrl}`);
      return { success: true, url: brand.repoUrl };
    } catch (error) {
      console.error(`[RepoBuilder] Deploy failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Show Cal's status
   */
  async status() {
    const progress = await this.getCalProgress();
    const allLessons = await this.getLessons();

    console.log(`\n📚 Cal's Learning Status\n`);
    console.log(`Total lessons available: ${allLessons.length}`);
    console.log(`Lessons completed: ${progress.length}\n`);

    // Show which brands Cal can populate
    for (const [slug, brand] of Object.entries(this.brandLessonMap)) {
      const { lessons } = await this.mapLessonsToBrand(slug);
      console.log(`${brand.name}:`);
      console.log(`  - Lessons available: ${lessons.length}`);
      console.log(`  - Repo: ${brand.repoUrl}\n`);
    }

    return { progress, allLessons };
  }

  /**
   * Deploy all brands
   */
  async deployAll() {
    console.log(`[RepoBuilder] Deploying all brands...\n`);

    const results = {};
    for (const brandSlug of Object.keys(this.brandLessonMap)) {
      try {
        await this.populate(brandSlug);
        const result = await this.deploy(brandSlug);
        results[brandSlug] = result;
      } catch (error) {
        results[brandSlug] = { success: false, error: error.message };
      }
    }

    return results;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const agent = new RepoBuilderAgent();

  (async () => {
    try {
      if (args.includes('--status')) {
        await agent.status();
      } else if (args.includes('--populate')) {
        const brandIndex = args.indexOf('--populate') + 1;
        const brand = args[brandIndex];
        await agent.populate(brand);
      } else if (args.includes('--deploy')) {
        const brandIndex = args.indexOf('--deploy') + 1;
        const brand = args[brandIndex];
        await agent.deploy(brand);
      } else if (args.includes('--deploy-all')) {
        const results = await agent.deployAll();
        console.log('\n✅ Deployment Results:');
        Object.entries(results).forEach(([brand, result]) => {
          console.log(`  ${brand}: ${result.success ? '✓ Success' : '✗ Failed - ' + result.error}`);
        });
      } else {
        console.log(`
Repo Builder Agent - Teaches Cal to Auto-Populate Brand Repos

Usage:
  node agents/repo-builder-agent.js --status
  node agents/repo-builder-agent.js --populate <brand>
  node agents/repo-builder-agent.js --deploy <brand>
  node agents/repo-builder-agent.js --deploy-all

Brands: calriven, vibecoding, perplexity-vault, calos-platform, soulfra
        `);
      }

      await agent.db.end();
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

module.exports = RepoBuilderAgent;
