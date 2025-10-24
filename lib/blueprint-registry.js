/**
 * Blueprint Registry
 *
 * INTEGRATION LAYER - Doesn't rebuild, USES:
 * - Existing CodeIndexer (lib/code-indexer.js)
 * - Existing PatternLearner (lib/pattern-learner.js)
 * - Existing CalosRegistry (lib/calos-registry.js)
 *
 * Purpose: Auto-generate documentation of what we ALREADY HAVE
 * Stop rebuilding the same shit by documenting existing capabilities
 */

const CodeIndexer = require('./code-indexer');
const PatternLearner = require('./pattern-learner');
const CalosRegistry = require('./calos-registry');
const fs = require('fs').promises;
const path = require('path');

class BlueprintRegistry {
  constructor(options = {}) {
    this.db = options.db;
    this.rootPath = options.rootPath || path.join(__dirname, '../..');

    // Use EXISTING systems
    this.codeIndexer = new CodeIndexer(this.db);
    this.patternLearner = new PatternLearner(this.db);
    this.calosRegistry = new CalosRegistry({ rootPath: this.rootPath });

    // Blueprint cache
    this.blueprints = new Map();
    this.lastScan = null;

    console.log('[BlueprintRegistry] Initialized - using existing Code Indexer + Pattern Learner');
  }

  /**
   * Scan entire codebase and generate blueprints
   * Uses EXISTING CalosRegistry - doesn't rebuild it
   */
  async scanAndGenerateBlueprints() {
    console.log('[BlueprintRegistry] Scanning codebase for blueprints...');

    try {
      // 1. Use EXISTING CalosRegistry to get all components
      await this.calosRegistry.scan();
      const registry = await this.calosRegistry.loadRegistry();

      console.log(`[BlueprintRegistry] Found ${registry.metadata.totalComponents} components`);

      // 2. Use EXISTING Code Indexer to get detailed code info
      // (It already has code indexed - just query it)
      const indexedCode = await this.queryIndexedCode();

      // 3. Use EXISTING Pattern Learner to find patterns
      const patterns = await this.findExistingPatterns();

      // 4. Generate blueprints by combining data
      await this.generateBlueprints(registry, indexedCode, patterns);

      this.lastScan = new Date();

      console.log(`[BlueprintRegistry] Generated ${this.blueprints.size} blueprints`);

      return {
        blueprints: Array.from(this.blueprints.values()),
        totalComponents: registry.metadata.totalComponents,
        patterns: patterns.length,
        scannedAt: this.lastScan
      };

    } catch (error) {
      console.error('[BlueprintRegistry] Error scanning:', error);
      throw error;
    }
  }

  /**
   * Query EXISTING CodeIndexer database
   */
  async queryIndexedCode() {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT
          file_path,
          language,
          functions,
          classes,
          exports,
          imports,
          description
        FROM code_index
        WHERE indexed_at > NOW() - INTERVAL '30 days'
        ORDER BY indexed_at DESC
      `);

      console.log(`[BlueprintRegistry] Found ${result.rows.length} indexed files`);
      return result.rows;

    } catch (error) {
      console.warn('[BlueprintRegistry] No code_index table (run CodeIndexer first)');
      return [];
    }
  }

  /**
   * Use EXISTING Pattern Learner to find patterns
   */
  async findExistingPatterns() {
    try {
      // PatternLearner.findSimilar searches for patterns
      // We'll look for common patterns
      const commonActions = [
        'create-workflow',
        'execute-action',
        'schedule-task',
        'handle-webhook',
        'process-data'
      ];

      const allPatterns = [];

      for (const action of commonActions) {
        const patterns = await this.patternLearner.findSimilar(action, { limit: 10 });
        allPatterns.push(...patterns);
      }

      console.log(`[BlueprintRegistry] Found ${allPatterns.length} existing patterns`);
      return allPatterns;

    } catch (error) {
      console.warn('[BlueprintRegistry] Error finding patterns:', error);
      return [];
    }
  }

  /**
   * Generate blueprints by combining data from existing systems
   */
  async generateBlueprints(registry, indexedCode, patterns) {
    // Create blueprint for each major system
    const systems = {
      scheduler: {
        file: 'lib/scheduler.js',
        capabilities: ['interval', 'cron', 'task-management', 'statistics']
      },
      webhooks: {
        file: 'routes/webhook-routes.js',
        capabilities: ['github', 'stripe', 'firebase', 'paypal', 'signature-verification']
      },
      actions: {
        file: 'lib/actions-engine.js',
        capabilities: ['rate-limiting', 'cooldowns', 'xp-rewards', 'payments']
      },
      workflows: {
        file: 'lib/workflow-executor.js',
        capabilities: ['schedule', 'webhook-trigger', 'http-requests', 'conditionals']
      },
      autonomous: {
        file: 'lib/autonomous-mode.js',
        capabilities: ['builder', 'model-council', 'pattern-learning', 'code-indexing']
      }
    };

    for (const [name, system] of Object.entries(systems)) {
      const blueprint = await this.createBlueprint(name, system, registry, indexedCode, patterns);
      this.blueprints.set(name, blueprint);
    }

    // Create component blueprints
    for (const [id, component] of Object.entries(registry.components)) {
      if (component.category === 'agents') {
        const blueprint = await this.createComponentBlueprint(component, indexedCode, patterns);
        this.blueprints.set(`component:${id}`, blueprint);
      }
    }
  }

  /**
   * Create blueprint for a system
   */
  async createBlueprint(name, system, registry, indexedCode, patterns) {
    // Find indexed code for this file
    const indexed = indexedCode.find(c => c.file_path.includes(system.file));

    // Find related patterns
    const relatedPatterns = patterns.filter(p =>
      p.action?.toLowerCase().includes(name) ||
      p.context?.file?.includes(system.file)
    );

    return {
      id: `blueprint:${name}`,
      name,
      type: 'system',
      file: system.file,
      capabilities: system.capabilities,
      functions: indexed?.functions || [],
      classes: indexed?.classes || [],
      exports: indexed?.exports || [],
      imports: indexed?.imports || [],
      description: indexed?.description || `${name} system`,
      relatedPatterns: relatedPatterns.map(p => p.action),
      usageCount: relatedPatterns.length,
      lastUsed: relatedPatterns[0]?.createdAt,
      status: 'active',
      documentation: this.generateDocumentation(name, system, indexed)
    };
  }

  /**
   * Create blueprint for a component
   */
  async createComponentBlueprint(component, indexedCode, patterns) {
    const indexed = indexedCode.find(c => c.file_path.includes(component.path));

    return {
      id: component.id,
      name: component.name,
      type: 'component',
      category: component.category,
      file: component.path,
      description: component.description,
      functions: component.functions || indexed?.functions || [],
      exports: component.exports || [],
      size: component.size,
      status: component.status,
      usagePatterns: [],
      documentation: component.description
    };
  }

  /**
   * Generate documentation for a system
   */
  generateDocumentation(name, system, indexed) {
    return `# ${name.charAt(0).toUpperCase() + name.slice(1)} System

**File:** \`${system.file}\`

**Capabilities:**
${system.capabilities.map(c => `- ${c}`).join('\n')}

**Functions:**
${indexed?.functions?.slice(0, 10).join(', ') || 'N/A'}

**Status:** ✅ Active

This system already exists. Use it instead of rebuilding.
`;
  }

  /**
   * Export blueprints to README
   */
  async exportToReadme(outputPath) {
    const readmePath = outputPath || path.join(this.rootPath, 'BLUEPRINTS.md');

    let content = `# CALOS Blueprints - What Already Exists

Generated: ${new Date().toISOString()}
Total Blueprints: ${this.blueprints.size}

---

## Systems Available

`;

    // Group by type
    const systems = Array.from(this.blueprints.values())
      .filter(b => b.type === 'system');

    const components = Array.from(this.blueprints.values())
      .filter(b => b.type === 'component');

    // Systems
    for (const blueprint of systems) {
      content += `\n### ${blueprint.name}\n\n`;
      content += `**File:** \`${blueprint.file}\`\n\n`;
      content += `**Capabilities:**\n`;
      for (const cap of blueprint.capabilities) {
        content += `- ✅ ${cap}\n`;
      }
      content += `\n**Functions:** ${blueprint.functions.slice(0, 5).join(', ')}\n\n`;
      content += `**Usage:** ${blueprint.usageCount} patterns found\n\n`;
      content += `---\n`;
    }

    // Components
    content += `\n## Components Available (${components.length})\n\n`;
    const grouped = components.reduce((acc, c) => {
      acc[c.category] = acc[c.category] || [];
      acc[c.category].push(c);
      return acc;
    }, {});

    for (const [category, comps] of Object.entries(grouped)) {
      content += `\n### ${category} (${comps.length})\n\n`;
      for (const comp of comps.slice(0, 10)) {
        content += `- **${comp.name}** - ${comp.description}\n`;
      }
      if (comps.length > 10) {
        content += `- ... and ${comps.length - 10} more\n`;
      }
      content += `\n`;
    }

    content += `\n---\n\n`;
    content += `## How to Use Blueprints\n\n`;
    content += `1. **Check this file FIRST** before building anything new\n`;
    content += `2. **Use existing systems** instead of rebuilding\n`;
    content += `3. **Wire systems together** using integration layers\n`;
    content += `4. **Update this file** when adding new capabilities\n\n`;
    content += `**Integration layers:**\n`;
    content += `- \`workflow-executor.js\` - Connects scheduler + actions + webhooks\n`;
    content += `- \`blueprint-registry.js\` - This system (documents what exists)\n`;
    content += `- \`system-introspector.js\` - Auto-generates capability docs\n\n`;

    await fs.writeFile(readmePath, content, 'utf-8');

    console.log(`[BlueprintRegistry] Exported to ${readmePath}`);

    return readmePath;
  }

  /**
   * Get blueprint by name
   */
  getBlueprint(name) {
    return this.blueprints.get(name) ||
           this.blueprints.get(`blueprint:${name}`) ||
           this.blueprints.get(`component:${name}`);
  }

  /**
   * Search blueprints
   */
  search(query) {
    const queryLower = query.toLowerCase();
    return Array.from(this.blueprints.values()).filter(b =>
      b.name.toLowerCase().includes(queryLower) ||
      b.description?.toLowerCase().includes(queryLower) ||
      b.capabilities?.some(c => c.toLowerCase().includes(queryLower))
    );
  }

  /**
   * Get usage statistics
   */
  getStatistics() {
    const blueprints = Array.from(this.blueprints.values());

    return {
      total: blueprints.length,
      systems: blueprints.filter(b => b.type === 'system').length,
      components: blueprints.filter(b => b.type === 'component').length,
      active: blueprints.filter(b => b.status === 'active').length,
      totalUsage: blueprints.reduce((sum, b) => sum + (b.usageCount || 0), 0),
      lastScan: this.lastScan
    };
  }
}

module.exports = BlueprintRegistry;
