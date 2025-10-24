/**
 * Deep Introspector
 *
 * Comprehensive scanner for all 266 JavaScript files
 * Discovers systems by emojis, status, categories, completion tracking
 *
 * Search by:
 * - Emojis: 💰 (payment), 🎯 (workflow), ✅ (completed), 👤 (user), ⭐ (badge)
 * - Status: completed, in_progress, pending, failed
 * - Categories: payment, gamification, webhook, subscription
 * - Progress: percentages, tiers, levels
 *
 * Like DocuSign but for payments and workflows
 */

const fs = require('fs').promises;
const path = require('path');

class DeepIntrospector {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.join(__dirname, '..');
    this.excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];

    // Emoji categories for fast lookup
    this.emojiMap = {
      // Financial
      '💰': 'payment',
      '💳': 'payment',
      '💵': 'payment',
      '💸': 'payment',

      // Status
      '✅': 'completed',
      '✓': 'verified',
      '✗': 'failed',
      '⏰': 'scheduled',
      '🔄': 'in_progress',

      // User & Identity
      '👤': 'user',
      '👥': 'users',
      '👑': 'admin',
      '🏆': 'achievement',

      // Communication
      '✉️': 'email',
      '📧': 'email',
      '🔔': 'notification',
      '📱': 'mobile',

      // Badges & Gamification
      '⭐': 'badge',
      '🌟': 'star',
      '🥇': 'gold',
      '🥈': 'silver',
      '🥉': 'bronze',
      '🌱': 'novice',

      // Workflow
      '🎯': 'goal',
      '🔗': 'webhook',
      '🔀': 'conditional',
      '⚡': 'trigger',

      // System
      '🤖': 'bot',
      '🔧': 'config',
      '📊': 'analytics',
      '🔒': 'security'
    };
  }

  /**
   * Scan all JavaScript files in project
   */
  async scanAllFiles() {
    console.log('[DeepIntrospector] 🔍 Scanning all files...');

    const files = await this.findAllJavaScriptFiles(this.rootPath);
    console.log(`[DeepIntrospector] Found ${files.length} JavaScript files`);

    const analyses = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const analysis = await this.analyzeFile(file, content);

        if (analysis) {
          analyses.push(analysis);
        }
      } catch (error) {
        console.error(`[DeepIntrospector] Error analyzing ${file}:`, error.message);
      }
    }

    console.log(`[DeepIntrospector] ✓ Analyzed ${analyses.length} files`);
    return analyses;
  }

  /**
   * Recursively find all JavaScript files
   */
  async findAllJavaScriptFiles(dir, fileList = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (!this.excludeDirs.includes(entry.name)) {
          await this.findAllJavaScriptFiles(fullPath, fileList);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        fileList.push(fullPath);
      }
    }

    return fileList;
  }

  /**
   * Analyze single file for all discoverable metadata
   */
  async analyzeFile(filePath, content) {
    const relativePath = path.relative(this.rootPath, filePath);
    const stats = await fs.stat(filePath);

    return {
      path: relativePath,
      size: stats.size,
      lines: content.split('\n').length,

      // Emoji discovery
      emojis: this.extractEmojis(content),

      // Status & completion tracking
      statusTracking: this.detectStatusTracking(content),

      // Categories
      categories: this.categorize(content),

      // Database integration
      tables: this.extractTables(content),

      // API endpoints
      endpoints: this.extractEndpoints(content),

      // Progress tracking
      progressTracking: this.detectProgressTracking(content),

      // Flow compatibility (multi-step processes)
      flowCompatible: this.detectFlowSteps(content),

      // Integrations (Stripe, GitHub, etc.)
      integrations: this.detectIntegrations(content),

      // Key functions
      functions: this.extractFunctions(content),

      // Classes
      classes: this.extractClasses(content)
    };
  }

  /**
   * Extract all emojis from content
   */
  extractEmojis(content) {
    // Unicode ranges for emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const matches = [...content.matchAll(emojiRegex)];

    const emojis = matches.map(match => {
      const emoji = match[0];
      return {
        emoji,
        category: this.emojiMap[emoji] || 'other',
        position: match.index
      };
    });

    // Count unique emojis
    const counts = {};
    emojis.forEach(({ emoji }) => {
      counts[emoji] = (counts[emoji] || 0) + 1;
    });

    return {
      found: emojis.length > 0,
      total: emojis.length,
      unique: Object.keys(counts),
      counts,
      categories: [...new Set(emojis.map(e => e.category))],
      emojis
    };
  }

  /**
   * Detect status tracking (completed, pending, failed, etc.)
   */
  detectStatusTracking(content) {
    const statusPatterns = {
      completed: /completed|finished|done|success/gi,
      pending: /pending|waiting|queued/gi,
      in_progress: /in.?progress|running|processing/gi,
      failed: /failed|error|rejected/gi,
      verified: /verified|confirmed|approved/gi
    };

    const statuses = {};
    let totalMatches = 0;

    for (const [status, pattern] of Object.entries(statusPatterns)) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        statuses[status] = matches.length;
        totalMatches += matches.length;
      }
    }

    // Check for status enums or constants
    const hasStatusEnum = /status.*=.*{|STATUS|State/i.test(content);

    return {
      found: totalMatches > 0 || hasStatusEnum,
      statuses,
      hasEnum: hasStatusEnum,
      total: totalMatches
    };
  }

  /**
   * Categorize file by content
   */
  categorize(content) {
    const categories = [];

    const categoryPatterns = {
      payment: /payment|stripe|invoice|charge|subscription|billing|ach|credit.?card/i,
      gamification: /badge|achievement|tier|level|rank|xp|score|leaderboard/i,
      webhook: /webhook|github|firebase|paypal|slack/i,
      authentication: /auth|login|signup|session|jwt|token|password/i,
      notification: /notification|email|sms|push|alert/i,
      workflow: /workflow|automation|schedule|cron|trigger/i,
      analytics: /analytics|metrics|stats|tracking|telemetry/i,
      admin: /admin|permission|role|rbac|access.?control/i,
      user: /user|profile|account|tenant/i,
      api: /router|route|endpoint|api|middleware/i,
      database: /migration|schema|query|transaction|db/i,
      ai: /gpt|openai|claude|anthropic|model|llm|agent/i
    };

    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(content)) {
        categories.push(category);
      }
    }

    return categories;
  }

  /**
   * Extract database tables used
   */
  extractTables(content) {
    // Match SQL queries and table references
    const tablePatterns = [
      /FROM\s+(\w+)/gi,
      /JOIN\s+(\w+)/gi,
      /INTO\s+(\w+)/gi,
      /UPDATE\s+(\w+)/gi,
      /DELETE\s+FROM\s+(\w+)/gi,
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi
    ];

    const tables = new Set();

    for (const pattern of tablePatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        const table = match[1];
        if (table && table.length > 2) { // Filter out short matches
          tables.add(table.toLowerCase());
        }
      });
    }

    return Array.from(tables);
  }

  /**
   * Extract API endpoints
   */
  extractEndpoints(content) {
    const endpointPatterns = [
      /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/gi,
      /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/gi
    ];

    const endpoints = [];

    for (const pattern of endpointPatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2]
        });
      });
    }

    return endpoints;
  }

  /**
   * Detect progress tracking (percentages, tiers, levels)
   */
  detectProgressTracking(content) {
    const progressPatterns = {
      percentage: /percentage|percent|progress.*%|\d+%/i,
      tier: /tier|bronze|silver|gold|platinum|diamond/i,
      level: /level|lvl|rank/i,
      experience: /xp|experience|points/i,
      completion: /completion|complete.*rate/i
    };

    const tracking = {};
    let found = false;

    for (const [type, pattern] of Object.entries(progressPatterns)) {
      if (pattern.test(content)) {
        tracking[type] = true;
        found = true;
      }
    }

    return {
      found,
      types: tracking
    };
  }

  /**
   * Detect multi-step flow compatibility
   */
  detectFlowSteps(content) {
    const flowPatterns = {
      hasSteps: /step|stage|phase/i,
      hasSequence: /sequence|order|next|previous/i,
      hasWorkflow: /workflow|pipeline|process/i,
      hasStateMachine: /state|transition|fsm/i,
      hasChaining: /then|chain|pipe/i
    };

    const flows = {};
    let compatible = false;

    for (const [type, pattern] of Object.entries(flowPatterns)) {
      if (pattern.test(content)) {
        flows[type] = true;
        compatible = true;
      }
    }

    return {
      compatible,
      features: flows
    };
  }

  /**
   * Detect third-party integrations
   */
  detectIntegrations(content) {
    const integrationPatterns = {
      stripe: /stripe|sk_|pk_/i,
      github: /github|octokit/i,
      firebase: /firebase|firestore/i,
      openai: /openai|gpt-/i,
      anthropic: /anthropic|claude/i,
      sendgrid: /sendgrid|@sendgrid/i,
      twilio: /twilio/i,
      aws: /aws-sdk|amazon|s3|lambda/i
    };

    const integrations = [];

    for (const [service, pattern] of Object.entries(integrationPatterns)) {
      if (pattern.test(content)) {
        integrations.push(service);
      }
    }

    return integrations;
  }

  /**
   * Extract function names
   */
  extractFunctions(content) {
    const functionPatterns = [
      /(?:async\s+)?function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
      /(\w+)\s*:\s*(?:async\s+)?function\s*\(/g
    ];

    const functions = new Set();

    for (const pattern of functionPatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        functions.add(match[1]);
      });
    }

    return Array.from(functions).slice(0, 20); // Limit to top 20
  }

  /**
   * Extract class names
   */
  extractClasses(content) {
    const classPattern = /class\s+(\w+)/g;
    const matches = [...content.matchAll(classPattern)];
    return matches.map(m => m[1]);
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(analyses) {
    const report = {
      summary: {
        totalFiles: analyses.length,
        totalLines: analyses.reduce((sum, a) => sum + a.lines, 0),
        totalSize: analyses.reduce((sum, a) => sum + a.size, 0)
      },

      byEmoji: this.groupByEmoji(analyses),
      byStatus: this.groupByStatus(analyses),
      byCategory: this.groupByCategory(analyses),
      byIntegration: this.groupByIntegration(analyses),

      flowCompatible: analyses.filter(a => a.flowCompatible.compatible),
      progressTracking: analyses.filter(a => a.progressTracking.found),

      topTables: this.getTopTables(analyses),
      topEndpoints: this.getTopEndpoints(analyses)
    };

    return report;
  }

  /**
   * Group files by emoji
   */
  groupByEmoji(analyses) {
    const groups = {};

    analyses.forEach(analysis => {
      if (analysis.emojis.found) {
        analysis.emojis.unique.forEach(emoji => {
          if (!groups[emoji]) {
            groups[emoji] = {
              emoji,
              category: this.emojiMap[emoji] || 'other',
              files: []
            };
          }
          groups[emoji].files.push({
            path: analysis.path,
            count: analysis.emojis.counts[emoji]
          });
        });
      }
    });

    return groups;
  }

  /**
   * Group files by status tracking
   */
  groupByStatus(analyses) {
    const groups = {};

    analyses.forEach(analysis => {
      if (analysis.statusTracking.found) {
        Object.keys(analysis.statusTracking.statuses).forEach(status => {
          if (!groups[status]) {
            groups[status] = [];
          }
          groups[status].push(analysis.path);
        });
      }
    });

    return groups;
  }

  /**
   * Group files by category
   */
  groupByCategory(analyses) {
    const groups = {};

    analyses.forEach(analysis => {
      analysis.categories.forEach(category => {
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(analysis.path);
      });
    });

    // Sort by file count
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.length - a.length)
      .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});
  }

  /**
   * Group files by integration
   */
  groupByIntegration(analyses) {
    const groups = {};

    analyses.forEach(analysis => {
      analysis.integrations.forEach(integration => {
        if (!groups[integration]) {
          groups[integration] = [];
        }
        groups[integration].push(analysis.path);
      });
    });

    return groups;
  }

  /**
   * Get most used database tables
   */
  getTopTables(analyses) {
    const tableCounts = {};

    analyses.forEach(analysis => {
      analysis.tables.forEach(table => {
        tableCounts[table] = (tableCounts[table] || 0) + 1;
      });
    });

    return Object.entries(tableCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([table, count]) => ({ table, count }));
  }

  /**
   * Get all endpoints
   */
  getTopEndpoints(analyses) {
    const endpoints = [];

    analyses.forEach(analysis => {
      analysis.endpoints.forEach(endpoint => {
        endpoints.push({
          ...endpoint,
          file: analysis.path
        });
      });
    });

    return endpoints;
  }

  /**
   * Export to markdown
   */
  async exportToMarkdown(report, outputPath = 'DEEP-DISCOVERY.md') {
    const fullPath = path.join(this.rootPath, '..', outputPath);

    let md = `# CALOS Deep Discovery Report\n\n`;
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += `🔍 **Comprehensive scan of all ${report.summary.totalFiles} JavaScript files**\n\n`;
    md += `---\n\n`;

    // Summary
    md += `## Summary\n\n`;
    md += `- **Total Files**: ${report.summary.totalFiles}\n`;
    md += `- **Total Lines**: ${report.summary.totalLines.toLocaleString()}\n`;
    md += `- **Total Size**: ${(report.summary.totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;
    md += `---\n\n`;

    // By Emoji
    md += `## 🎯 Search by Emoji\n\n`;
    const emojiGroups = Object.values(report.byEmoji)
      .sort((a, b) => b.files.length - a.files.length);

    for (const group of emojiGroups.slice(0, 20)) {
      md += `### ${group.emoji} ${group.category} (${group.files.length} files)\n\n`;
      group.files.slice(0, 10).forEach(file => {
        md += `- \`${file.path}\` (${file.count}×)\n`;
      });
      md += `\n`;
    }
    md += `---\n\n`;

    // By Status
    md += `## ✅ Search by Status\n\n`;
    for (const [status, files] of Object.entries(report.byStatus)) {
      md += `### ${status} (${files.length} files)\n\n`;
      files.slice(0, 10).forEach(file => {
        md += `- \`${file}\`\n`;
      });
      md += `\n`;
    }
    md += `---\n\n`;

    // By Category
    md += `## 📂 Search by Category\n\n`;
    for (const [category, files] of Object.entries(report.byCategory)) {
      md += `### ${category} (${files.length} files)\n\n`;
      files.slice(0, 10).forEach(file => {
        md += `- \`${file}\`\n`;
      });
      if (files.length > 10) {
        md += `- ... and ${files.length - 10} more\n`;
      }
      md += `\n`;
    }
    md += `---\n\n`;

    // Flow Compatible
    md += `## 🔄 Flow-Compatible Systems (${report.flowCompatible.length})\n\n`;
    md += `Files that support multi-step workflows (like DocuSign):\n\n`;
    report.flowCompatible.slice(0, 20).forEach(analysis => {
      const features = Object.keys(analysis.flowCompatible.features).join(', ');
      md += `- \`${analysis.path}\` - ${features}\n`;
    });
    md += `\n---\n\n`;

    // Integrations
    md += `## 🔗 Third-Party Integrations\n\n`;
    for (const [integration, files] of Object.entries(report.byIntegration)) {
      md += `### ${integration} (${files.length} files)\n\n`;
      files.forEach(file => {
        md += `- \`${file}\`\n`;
      });
      md += `\n`;
    }
    md += `---\n\n`;

    // Top Tables
    md += `## 🗄️ Most Used Database Tables\n\n`;
    report.topTables.forEach(({ table, count }) => {
      md += `- \`${table}\` - ${count} files\n`;
    });
    md += `\n---\n\n`;

    // Endpoints
    md += `## 🌐 API Endpoints (${report.topEndpoints.length})\n\n`;
    const endpointsByFile = {};
    report.topEndpoints.forEach(ep => {
      if (!endpointsByFile[ep.file]) {
        endpointsByFile[ep.file] = [];
      }
      endpointsByFile[ep.file].push(ep);
    });

    for (const [file, endpoints] of Object.entries(endpointsByFile)) {
      md += `### \`${file}\` (${endpoints.length} endpoints)\n\n`;
      endpoints.forEach(ep => {
        md += `- **${ep.method}** \`${ep.path}\`\n`;
      });
      md += `\n`;
    }

    await fs.writeFile(fullPath, md);
    console.log(`[DeepIntrospector] ✓ Report saved to ${fullPath}`);
    return fullPath;
  }
}

module.exports = DeepIntrospector;
