/**
 * System Introspector
 *
 * AUTO-DOCUMENTS what we already have by reading existing code
 * Stops us from rebuilding the same shit over and over
 *
 * Reads:
 * - lib/autonomous-mode.js
 * - lib/scheduler.js
 * - routes/webhook-routes.js
 * - lib/actions-engine.js
 * - lib/workflow-executor.js
 * - And generates comprehensive "WHAT WE HAVE" documentation
 */

const fs = require('fs').promises;
const path = require('path');

class SystemIntrospector {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.join(__dirname, '../..');
    this.outputPath = options.outputPath || path.join(this.rootPath, 'SYSTEM-CAPABILITIES.md');

    // Systems to introspect
    this.systems = [
      {
        name: 'Scheduler',
        file: 'lib/scheduler.js',
        type: 'daemon'
      },
      {
        name: 'Webhook System',
        file: 'routes/webhook-routes.js',
        type: 'integration'
      },
      {
        name: 'Actions Engine',
        file: 'lib/actions-engine.js',
        type: 'execution'
      },
      {
        name: 'Autonomous Mode',
        file: 'lib/autonomous-mode.js',
        type: 'orchestration'
      },
      {
        name: 'Workflow Executor',
        file: 'lib/workflow-executor.js',
        type: 'integration'
      },
      {
        name: 'Pattern Learner',
        file: 'lib/pattern-learner.js',
        type: 'learning'
      },
      {
        name: 'Code Indexer',
        file: 'lib/code-indexer.js',
        type: 'indexing'
      },
      {
        name: 'Blueprint Registry',
        file: 'lib/blueprint-registry.js',
        type: 'documentation'
      }
    ];

    console.log('[SystemIntrospector] Initialized');
  }

  /**
   * Read and analyze all systems
   */
  async introspect() {
    console.log('[SystemIntrospector] Reading existing systems...');

    const results = [];

    for (const system of this.systems) {
      try {
        const analysis = await this.analyzeSystem(system);
        results.push(analysis);
        console.log(`[SystemIntrospector] ✓ Analyzed ${system.name}`);
      } catch (error) {
        console.warn(`[SystemIntrospector] ✗ Failed to analyze ${system.name}:`, error.message);
        results.push({
          ...system,
          exists: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Analyze a single system file
   */
  async analyzeSystem(system) {
    const filePath = path.join(this.rootPath, 'agent-router', system.file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      return {
        ...system,
        exists: true,
        functions: this.extractFunctions(content),
        classes: this.extractClasses(content),
        requires: this.extractRequires(content),
        description: this.extractDescription(content),
        capabilities: this.extractCapabilities(content),
        lineCount: content.split('\n').length
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          ...system,
          exists: false,
          error: 'File not found'
        };
      }
      throw error;
    }
  }

  /**
   * Extract function names from code
   */
  extractFunctions(content) {
    const functions = [];

    // async function name()
    const asyncMatches = content.matchAll(/async\s+function\s+(\w+)/g);
    for (const match of asyncMatches) {
      functions.push(match[1]);
    }

    // function name()
    const funcMatches = content.matchAll(/function\s+(\w+)/g);
    for (const match of funcMatches) {
      functions.push(match[1]);
    }

    // name() { (method syntax)
    const methodMatches = content.matchAll(/(\w+)\s*\([^)]*\)\s*{/g);
    for (const match of methodMatches) {
      const name = match[1];
      if (!['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
        functions.push(name);
      }
    }

    return [...new Set(functions)].slice(0, 20);
  }

  /**
   * Extract class names
   */
  extractClasses(content) {
    const classes = [];
    const regex = /class\s+(\w+)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      classes.push(match[1]);
    }

    return classes;
  }

  /**
   * Extract require statements
   */
  extractRequires(content) {
    const requires = [];
    const regex = /require\(['"]([^'"]+)['"]\)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const dep = match[1];
      if (dep.startsWith('.') || dep.startsWith('calos')) {
        requires.push(dep);
      }
    }

    return [...new Set(requires)];
  }

  /**
   * Extract description from file header comment
   */
  extractDescription(content) {
    const match = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)(?:\n\s*\*\s*\n|\n\s*\*\/)/);
    return match ? match[1] : 'No description';
  }

  /**
   * Extract capabilities by looking for key patterns
   */
  extractCapabilities(content) {
    const capabilities = [];

    // Look for feature indicators
    const patterns = {
      'Scheduling': /schedule|interval|cron/i,
      'Webhooks': /webhook|github|stripe|firebase/i,
      'Rate Limiting': /rate.?limit|cooldown|throttle/i,
      'Authentication': /auth|login|session|jwt/i,
      'Database': /query|insert|update|delete|sql/i,
      'HTTP Requests': /fetch|axios|request|http/i,
      'File Operations': /readFile|writeFile|fs\./i,
      'Async Processing': /async|await|Promise/i,
      'Error Handling': /try|catch|error/i,
      'Logging': /console\.|logger|log\(/i
    };

    for (const [capability, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        capabilities.push(capability);
      }
    }

    return capabilities;
  }

  /**
   * Generate comprehensive documentation
   */
  async generateDocumentation(analyses) {
    let doc = `# CALOS System Capabilities - What We Already Have

> 🛑 **STOP REBUILDING** - Read this first before creating anything new

Generated: ${new Date().toISOString()}

---

## Executive Summary

CALOS already has **${analyses.filter(a => a.exists).length}** major systems implemented.
Stop circling and use what exists.

`;

    // Group by type
    const byType = analyses.reduce((acc, a) => {
      if (!a.exists) return acc;
      acc[a.type] = acc[a.type] || [];
      acc[a.type].push(a);
      return acc;
    }, {});

    // Document each type
    for (const [type, systems] of Object.entries(byType)) {
      doc += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)} Systems\n\n`;

      for (const system of systems) {
        doc += this.generateSystemDoc(system);
      }
    }

    // Add integration guide
    doc += this.generateIntegrationGuide(analyses);

    // Add "what's missing" section
    doc += this.generateMissingSection(analyses);

    await fs.writeFile(this.outputPath, doc, 'utf-8');

    console.log(`[SystemIntrospector] Documentation written to ${this.outputPath}`);

    return this.outputPath;
  }

  /**
   * Generate documentation for a single system
   */
  generateSystemDoc(system) {
    return `### ${system.name}

**File:** \`${system.file}\`
**Status:** ✅ Exists (${system.lineCount} lines)
**Description:** ${system.description}

**Capabilities:**
${system.capabilities.map(c => `- ✅ ${c}`).join('\n')}

**Key Functions:**
\`\`\`
${system.functions.slice(0, 10).join(', ')}
\`\`\`

**Classes:** ${system.classes.join(', ') || 'None'}

**Dependencies:**
${system.requires.slice(0, 5).map(r => `- ${r}`).join('\n') || '- None'}

**How to Use:**
\`\`\`javascript
const ${system.classes[0] || system.name.replace(/\s+/g, '')} = require('./${system.file}');
// Use it instead of rebuilding!
\`\`\`

---

`;
  }

  /**
   * Generate integration guide
   */
  generateIntegrationGuide(analyses) {
    return `\n## 🔌 Integration Guide

### How Systems Connect

\`\`\`
Workflow Builder (UI)
    ↓ saves to
Database (workflows table)
    ↓ loaded by
Workflow Executor
    ↓ uses
Scheduler (intervals) + Webhooks (triggers) + Actions Engine (execution)
    ↓ learns from
Pattern Learner
    ↓ indexes
Code Indexer → Blueprint Registry
\`\`\`

### Key Integration Points

1. **Workflow Executor** uses:
   - Scheduler for interval-based execution
   - Actions Engine for action execution
   - Webhooks as triggers

2. **Blueprint Registry** uses:
   - Code Indexer for file analysis
   - Pattern Learner for usage patterns
   - Calos Registry for component catalog

3. **Autonomous Mode** uses:
   - Pattern Learner for similar patterns
   - Code Indexer for existing code search
   - Builder Agent for code generation

### Don't Rebuild These

- ❌ Don't create a new scheduler → Use lib/scheduler.js
- ❌ Don't create webhook system → Use routes/webhook-routes.js
- ❌ Don't create actions system → Use lib/actions-engine.js
- ❌ Don't create pattern system → Use lib/pattern-learner.js

### Instead, Create Integration Layers

- ✅ Wire systems together
- ✅ Add new capabilities to existing systems
- ✅ Create facades that delegate to existing systems

---

`;
  }

  /**
   * Generate "what's missing" section
   */
  generateMissingSection(analyses) {
    const missing = analyses.filter(a => !a.exists);

    return `\n## 🚧 What's Actually Missing

${missing.length > 0 ? missing.map(m => `- ${m.name} (${m.file})`).join('\n') : '- Nothing! All systems exist.'}

---

## 📝 Update Process

When adding new capabilities:

1. **Check this file first** - Does it already exist?
2. **Check Blueprint Registry** - Is there a similar pattern?
3. **Check Pattern Learner** - Have we done this before?
4. **Only if new** - Then build it (and update these docs)

---

## 🔄 Regenerate This File

\`\`\`bash
node -e "
const SystemIntrospector = require('./agent-router/lib/system-introspector');
const introspector = new SystemIntrospector();
introspector.introspect()
  .then(results => introspector.generateDocumentation(results))
  .then(path => console.log('✓ Updated:', path));
"
\`\`\`

---

*Generated by SystemIntrospector - Stop rebuilding, start integrating.*
`;
  }

  /**
   * Quick summary of what exists
   */
  async quickSummary() {
    const analyses = await this.introspect();
    const existing = analyses.filter(a => a.exists);

    console.log('\n📊 CALOS System Summary\n');
    console.log(`Total Systems: ${analyses.length}`);
    console.log(`Existing: ${existing.length}`);
    console.log(`Missing: ${analyses.length - existing.length}\n`);

    console.log('✅ What We Have:');
    for (const system of existing) {
      console.log(`   - ${system.name} (${system.capabilities.length} capabilities)`);
    }

    const missing = analyses.filter(a => !a.exists);
    if (missing.length > 0) {
      console.log('\n⚠️  What We Don\'t Have:');
      for (const system of missing) {
        console.log(`   - ${system.name}`);
      }
    }

    return { existing: existing.length, missing: missing.length };
  }
}

module.exports = SystemIntrospector;

// CLI usage
if (require.main === module) {
  const introspector = new SystemIntrospector();

  introspector.introspect()
    .then(results => introspector.generateDocumentation(results))
    .then(path => {
      console.log('\n✅ Documentation generated:', path);
      return introspector.quickSummary();
    })
    .then(summary => {
      console.log(`\n✓ ${summary.existing} systems documented`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}
