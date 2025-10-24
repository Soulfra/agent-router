/**
 * Cal Auto-Documenter
 *
 * Autonomous system that makes Cal learn from the codebase, document discoveries,
 * publish blogs, and sign all docs cryptographically.
 *
 * Features:
 * - Scans codebase for new migrations, libs, docs
 * - Updates CAL-LEARNED-KNOWLEDGE.md automatically
 * - Generates blog posts ("What I Learned Today")
 * - Publishes to Mastodon, blog, dpaste
 * - Signs all legal/system docs with SHA-256
 * - Searches Google for external knowledge
 * - Creates feedback loop: learn → document → blog → SEO → repeat
 *
 * Usage:
 *   const autoDoc = new CalAutoDocumenter({ db });
 *   await autoDoc.run(); // Run once
 *
 *   // Or as cron job:
 *   // 0 * * * * node scripts/cal-auto-document.js
 *
 * @requires Cal learning systems (cal-doc-learner, cal-migration-learner, etc.)
 * @requires Publishing system (cross-platform-auto-publisher)
 * @requires Doc signing (doc-signer)
 */

const fs = require('fs').promises;
const path = require('path');
const CalDocLearner = require('./cal-doc-learner');
const CalMigrationLearner = require('./cal-migration-learner');
const CalFailureLearner = require('./cal-failure-learner');
const DocSigner = require('./doc-signer');
const LegalLinker = require('./legal-linker');
const CalSystemIntegrator = require('./cal-system-integrator');
const { EventEmitter } = require('events');

class CalAutoDocumenter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.baseDir = options.baseDir || process.cwd();

    // Initialize learning systems
    this.docLearner = new CalDocLearner({ knowledgeBasePath: path.join(this.baseDir, 'logs/cal-doc-knowledge.json') });
    this.migrationLearner = new CalMigrationLearner();
    this.failureLearner = new CalFailureLearner();
    this.docSigner = new DocSigner({ db: this.db, baseDir: this.baseDir });
    this.legalLinker = new LegalLinker();

    // NEW: System integrator (connects all learning systems)
    this.systemIntegrator = new CalSystemIntegrator({ db: this.db, rootPath: this.baseDir });

    // Paths
    this.knowledgeDocPath = path.join(this.baseDir, 'docs/CAL-LEARNED-KNOWLEDGE.md');
    this.legalDocsDir = path.join(this.baseDir, 'projects/soulfra.github.io');
    this.migrationsDir = path.join(this.baseDir, 'database/migrations');
    this.libDir = path.join(this.baseDir, 'lib');
    this.docsDir = path.join(this.baseDir, 'docs');

    // Configuration
    this.config = {
      autoPublish: options.autoPublish !== false, // Default: true
      autoSign: options.autoSign !== false,       // Default: true
      searchGoogle: options.searchGoogle || false, // Default: false (requires API key)
      platforms: options.platforms || ['mastodon', 'blog', 'dpaste'],
      schedule: options.schedule || 'immediate'
    };

    // Cross-platform publisher (optional, will be injected if available)
    this.publisher = options.publisher || null;

    console.log('[CalAutoDocumenter] Initialized');
  }

  /**
   * Main run loop - scan, learn, document, publish, sign
   */
  async run() {
    console.log('[CalAutoDocumenter] Starting auto-documentation cycle...');

    const startTime = Date.now();
    const discoveries = {
      migrations: [],
      docs: [],
      legal: [],
      failures: [],
      external: [],
      blueprints: []
    };

    try {
      // 0. Initialize system integrator
      console.log('[CalAutoDocumenter] Initializing system integrator...');
      await this.systemIntegrator.init();

      // 0.5. Export blueprints (what already exists)
      console.log('[CalAutoDocumenter] Scanning blueprints...');
      discoveries.blueprints = this.systemIntegrator.getBlueprints();
      await this.systemIntegrator.exportDocumentation();
      console.log(`[CalAutoDocumenter] Found ${discoveries.blueprints.length} existing blueprints`);

      // 1. Scan for new migrations
      console.log('[CalAutoDocumenter] Scanning migrations...');
      discoveries.migrations = await this.scanMigrations();

      // 2. Scan for new docs
      console.log('[CalAutoDocumenter] Scanning documentation...');
      discoveries.docs = await this.scanDocs();

      // 3. Learn from legal docs
      console.log('[CalAutoDocumenter] Learning legal documentation...');
      discoveries.legal = await this.learnLegalDocs();

      // 4. Review failures
      console.log('[CalAutoDocumenter] Reviewing failure patterns...');
      discoveries.failures = await this.reviewFailures();

      // 5. Search Google for external knowledge (if enabled)
      if (this.config.searchGoogle) {
        console.log('[CalAutoDocumenter] Searching external sources...');
        discoveries.external = await this.searchExternal();
      }

      // 6. Update CAL-LEARNED-KNOWLEDGE.md
      console.log('[CalAutoDocumenter] Updating knowledge documentation...');
      await this.updateKnowledgeDoc(discoveries);

      // 7. Generate blog post
      console.log('[CalAutoDocumenter] Generating blog post...');
      const blogPost = await this.generateBlogPost(discoveries);

      // 8. Publish (if enabled)
      if (this.config.autoPublish && this.publisher) {
        console.log('[CalAutoDocumenter] Publishing discoveries...');
        await this.publish(blogPost);
      }

      // 9. Sign all legal docs (if enabled)
      if (this.config.autoSign) {
        console.log('[CalAutoDocumenter] Signing legal documents...');
        await this.signLegalDocs();
      }

      const duration = Date.now() - startTime;

      // Emit completion event
      this.emit('cycle_complete', {
        discoveries,
        blogPost,
        duration,
        timestamp: new Date().toISOString()
      });

      console.log(`[CalAutoDocumenter] ✅ Cycle complete (${duration}ms)`);
      console.log(`  Migrations: ${discoveries.migrations.length}`);
      console.log(`  Docs: ${discoveries.docs.length}`);
      console.log(`  Legal: ${discoveries.legal.length}`);
      console.log(`  Failures: ${discoveries.failures.length}`);

      return {
        success: true,
        discoveries,
        blogPost,
        duration
      };

    } catch (error) {
      console.error('[CalAutoDocumenter] ❌ Cycle failed:', error);
      this.emit('cycle_error', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Scan database migrations for new patterns
   */
  async scanMigrations() {
    try {
      await this.migrationLearner.load();

      // Get list of migration files
      const files = await fs.readdir(this.migrationsDir);
      const newMigrations = [];

      for (const file of files) {
        if (file.endsWith('.sql')) {
          const filePath = path.join(this.migrationsDir, file);
          const content = await fs.readFile(filePath, 'utf8');

          // Extract migration number and name
          const match = file.match(/^(\d+)_(.+)\.sql$/);
          if (match) {
            const [, number, name] = match;

            newMigrations.push({
              number: parseInt(number),
              name: name.replace(/_/g, ' '),
              file: file,
              content: content,
              tables: this.extractTables(content),
              views: this.extractViews(content),
              functions: this.extractFunctions(content)
            });
          }
        }
      }

      return newMigrations.sort((a, b) => b.number - a.number).slice(0, 10); // Latest 10

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to scan migrations:', error);
      return [];
    }
  }

  /**
   * Scan documentation directory for new/updated docs
   */
  async scanDocs() {
    try {
      const files = await fs.readdir(this.docsDir);
      const newDocs = [];

      for (const file of files) {
        if (file.endsWith('.md') && file !== 'CAL-LEARNED-KNOWLEDGE.md') {
          const filePath = path.join(this.docsDir, file);
          const content = await fs.readFile(filePath, 'utf8');

          // Get file stats
          const stats = await fs.stat(filePath);

          newDocs.push({
            name: file.replace('.md', ''),
            file: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            headings: this.extractHeadings(content),
            keywords: this.extractKeywords(content)
          });
        }
      }

      return newDocs.sort((a, b) => b.modified - a.modified).slice(0, 10); // Latest 10

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to scan docs:', error);
      return [];
    }
  }

  /**
   * Learn from legal documentation
   */
  async learnLegalDocs() {
    try {
      const legalDocs = [
        'terms-of-service.html',
        'privacy-policy.html',
        'case-law.html'
      ];

      const insights = [];

      for (const doc of legalDocs) {
        const filePath = path.join(this.legalDocsDir, doc);

        try {
          const content = await fs.readFile(filePath, 'utf8');

          // Extract cited case law
          const citations = this.legalLinker.extractCitedCases(content);

          insights.push({
            doc: doc,
            citations: citations.map(c => ({
              name: c.name,
              industry: c.industry,
              year: c.year
            })),
            citationCount: citations.length
          });

        } catch (err) {
          console.warn(`[CalAutoDocumenter] Could not read ${doc}:`, err.message);
        }
      }

      return insights;

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to learn legal docs:', error);
      return [];
    }
  }

  /**
   * Review failure patterns
   */
  async reviewFailures() {
    try {
      await this.failureLearner.load();

      const failures = [];
      const patterns = this.failureLearner.failures || {};

      for (const [skill, data] of Object.entries(patterns)) {
        failures.push({
          skill,
          totalFailures: data.failures?.length || 0,
          mostFailedApproach: this.getMostFailedApproach(data),
          recommendation: this.failureLearner.getRecommendation(skill)
        });
      }

      return failures;

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to review failures:', error);
      return [];
    }
  }

  /**
   * Search external sources (Google, docs)
   */
  async searchExternal() {
    // TODO: Implement Google Search API integration
    // For now, return empty array
    return [];
  }

  /**
   * Update CAL-LEARNED-KNOWLEDGE.md
   */
  async updateKnowledgeDoc(discoveries) {
    try {
      const doc = this.generateKnowledgeMarkdown(discoveries);

      await fs.writeFile(this.knowledgeDocPath, doc, 'utf8');

      console.log(`[CalAutoDocumenter] Updated ${this.knowledgeDocPath}`);

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to update knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Generate markdown for CAL-LEARNED-KNOWLEDGE.md
   */
  generateKnowledgeMarkdown(discoveries) {
    const timestamp = new Date().toISOString();

    let doc = `# CAL Learned Knowledge

> **Auto-generated documentation** of everything CAL has learned from migrations, failures, skills, and documentation.
>
> **Last Updated:** ${timestamp}
>
> **View Interactive Browser:** [http://localhost:5001/cal-knowledge-viewer.html](http://localhost:5001/cal-knowledge-viewer.html)

---

## 📊 Summary

### Recent Discoveries (${new Date().toLocaleDateString()})
- **New Migrations:** ${discoveries.migrations.length}
- **New Docs:** ${discoveries.docs.length}
- **Legal Citations:** ${discoveries.legal.reduce((sum, l) => sum + l.citationCount, 0)}
- **Failure Patterns:** ${discoveries.failures.length}

---

## 🗄️ Migration Knowledge

### Latest Migrations

${discoveries.migrations.map(m => `
#### ${m.number}. ${m.name}
- **File:** \`${m.file}\`
- **Tables:** ${m.tables.join(', ') || 'None'}
- **Views:** ${m.views.join(', ') || 'None'}
- **Functions:** ${m.functions.length} function(s)
`).join('\n') || '*No new migrations*'}

---

## 📚 Documentation Learned

### Recently Updated Docs

${discoveries.docs.map(d => `
#### ${d.name}
- **File:** \`${d.file}\`
- **Modified:** ${d.modified.toISOString()}
- **Size:** ${d.size} bytes
- **Key Topics:** ${d.headings.slice(0, 5).join(', ')}
`).join('\n') || '*No new docs*'}

---

## ⚖️ Legal Documentation

### Case Law Citations

${discoveries.legal.map(l => `
#### ${l.doc}
- **Citations:** ${l.citationCount}
- **Referenced Cases:** ${l.citations.map(c => c.name).join(', ')}
`).join('\n') || '*No legal docs analyzed*'}

---

## ❌ Failure Patterns

### What CAL Has Learned NOT To Do

${discoveries.failures.map(f => `
#### ${f.skill}
- **Total Failures:** ${f.totalFailures}
- **Most Failed Approach:** ${f.mostFailedApproach}
- **💡 Recommended:** ${f.recommendation?.approach || 'N/A'}
`).join('\n') || '*No failures tracked*'}

---

*Auto-generated by [Cal Auto-Documenter](https://github.com/calos/agent-router/blob/main/lib/cal-auto-documenter.js)*
`;

    return doc;
  }

  /**
   * Generate blog post from discoveries
   */
  async generateBlogPost(discoveries) {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const title = `What I Learned Today - ${date}`;

    const content = `# ${title}

*Published by Cal (CalOS AI Agent) on ${new Date().toISOString()}*

---

## 🧠 New System Knowledge

Today I discovered **${discoveries.migrations.length} new migrations** and **${discoveries.docs.length} documentation updates**.

${discoveries.migrations.slice(0, 3).map(m => `
### Migration ${m.number}: ${m.name}

This migration creates:
${m.tables.length > 0 ? `- **Tables:** ${m.tables.join(', ')}` : ''}
${m.views.length > 0 ? `- **Views:** ${m.views.join(', ')}` : ''}
${m.functions.length > 0 ? `- **Functions:** ${m.functions.length} database function(s)` : ''}

[View migration →](https://github.com/calos/agent-router/blob/main/database/migrations/${m.file})
`).join('\n')}

## ⚖️ Legal Compliance Learned

I analyzed **${discoveries.legal.length} legal documents** and identified **${discoveries.legal.reduce((sum, l) => sum + l.citationCount, 0)} case law citations**.

${discoveries.legal.map(l => `
### ${l.doc}
Referenced legal precedents: ${l.citations.map(c => c.name).join(', ')}
`).join('\n')}

## 🎯 Improved Skills

I learned from **${discoveries.failures.length} failure patterns** to improve future performance.

${discoveries.failures.slice(0, 3).map(f => `
### ${f.skill}
- ❌ Failed ${f.totalFailures} times
- 💡 Now I know to use: ${f.recommendation?.approach || 'alternative approach'}
`).join('\n')}

---

## 🔗 Resources

- [Full Knowledge Base](https://soulfra.github.io/CAL-LEARNED-KNOWLEDGE.md)
- [Case Law Database](https://soulfra.github.io/case-law.html)
- [System Architecture](https://github.com/calos/agent-router/blob/main/docs/)

---

*This post was automatically generated by Cal's learning system. [View source code](https://github.com/calos/agent-router/blob/main/lib/cal-auto-documenter.js)*
`;

    return {
      title,
      content,
      timestamp: new Date().toISOString(),
      tags: ['learning', 'ai', 'documentation', 'migrations', 'legal-compliance'],
      metadata: {
        migrations: discoveries.migrations.length,
        docs: discoveries.docs.length,
        legal: discoveries.legal.length,
        failures: discoveries.failures.length
      }
    };
  }

  /**
   * Publish blog post cross-platform
   */
  async publish(blogPost) {
    if (!this.publisher) {
      console.warn('[CalAutoDocumenter] No publisher configured, skipping publish');
      return null;
    }

    try {
      const result = await this.publisher.publish({
        narrative: {
          title: blogPost.title,
          content: blogPost.content,
          tags: blogPost.tags
        },
        platforms: this.config.platforms,
        schedule: this.config.schedule
      });

      console.log('[CalAutoDocumenter] Published to:', this.config.platforms.join(', '));

      return result;

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to publish:', error);
      return null;
    }
  }

  /**
   * Sign all legal documents
   */
  async signLegalDocs() {
    try {
      const signatures = await this.docSigner.signDirectory(this.legalDocsDir, /\.(html|md)$/);

      console.log(`[CalAutoDocumenter] Signed ${signatures.length} legal documents`);

      return signatures;

    } catch (error) {
      console.error('[CalAutoDocumenter] Failed to sign legal docs:', error);
      return [];
    }
  }

  /**
   * Extract SQL table names from migration
   */
  extractTables(sql) {
    const regex = /CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/gi;
    const matches = [];
    let match;

    while ((match = regex.exec(sql)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }

  /**
   * Extract SQL view names from migration
   */
  extractViews(sql) {
    const regex = /CREATE (?:OR REPLACE )?VIEW ([a-z_]+)/gi;
    const matches = [];
    let match;

    while ((match = regex.exec(sql)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }

  /**
   * Extract SQL function names from migration
   */
  extractFunctions(sql) {
    const regex = /CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+)\(/gi;
    const matches = [];
    let match;

    while ((match = regex.exec(sql)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }

  /**
   * Extract markdown headings from content
   */
  extractHeadings(content) {
    const regex = /^#{1,3}\s+(.+)$/gm;
    const headings = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      headings.push(match[1]);
    }

    return headings;
  }

  /**
   * Extract keywords from content (simple implementation)
   */
  extractKeywords(content) {
    const words = content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const frequency = {};

    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Get most failed approach from failure data
   */
  getMostFailedApproach(data) {
    if (!data.failures || data.failures.length === 0) {
      return 'N/A';
    }

    const approaches = {};
    data.failures.forEach(f => {
      approaches[f.approach] = (approaches[f.approach] || 0) + 1;
    });

    const sorted = Object.entries(approaches).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'N/A';
  }
}

module.exports = CalAutoDocumenter;
