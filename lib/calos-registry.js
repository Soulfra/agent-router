/**
 * CALOS Universal Component Registry
 *
 * Like a UPC database for CALOS components.
 * Catalogs ALL code: agents, libs, tools, commands, tests.
 *
 * Use cases:
 * - "What components exist?"
 * - "Which ones are working?"
 * - "Export just the calculator engine"
 * - "Sync with script-toolkit registry"
 *
 * Makes CALOS portable like iPhone app transfers.
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class CalosRegistry {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.join(__dirname, '../..');
    this.registryPath = options.registryPath || path.join(this.rootPath, 'calos-registry.json');
    this.registry = null;
  }

  /**
   * Scan entire CALOS system and generate registry
   * @returns {Promise<object>} Registry data
   */
  async scan() {
    console.log('🔍 Scanning CALOS components...');

    const registry = {
      metadata: {
        version: '1.0.0',
        generated: new Date().toISOString(),
        rootPath: this.rootPath,
        totalComponents: 0
      },
      components: {},
      categories: {
        agents: [],
        libs: [],
        bin: [],
        tests: [],
        config: []
      },
      dependencies: {},
      health: {}
    };

    // Scan directories
    const scanDirs = [
      { dir: 'agent-router/agents', category: 'agents' },
      { dir: 'agent-router/lib', category: 'libs' },
      { dir: 'bin', category: 'bin' },
      { dir: 'agent-router/tests', category: 'tests' }
    ];

    for (const { dir, category } of scanDirs) {
      const fullPath = path.join(this.rootPath, dir);
      try {
        const components = await this.scanDirectory(fullPath, category);
        registry.categories[category].push(...components.map(c => c.id));

        for (const component of components) {
          registry.components[component.id] = component;
          registry.metadata.totalComponents++;
        }
      } catch (error) {
        console.warn(`⚠️  Could not scan ${dir}: ${error.message}`);
      }
    }

    // Extract dependencies
    registry.dependencies = await this.extractDependencies(registry.components);

    // Load health data if available
    try {
      registry.health = await this.loadHealthData();
    } catch (error) {
      console.warn('⚠️  No health data available yet');
    }

    this.registry = registry;
    await this.saveRegistry();

    console.log(`✅ Scanned ${registry.metadata.totalComponents} components`);

    return registry;
  }

  /**
   * Scan directory for components
   */
  async scanDirectory(dirPath, category) {
    const components = [];

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && (file.endsWith('.js') || file.endsWith('.sh') || file.endsWith('.py'))) {
          const component = await this.analyzeComponent(filePath, file, category);
          components.push(component);
        }
      }
    } catch (error) {
      // Directory doesn't exist or not accessible
    }

    return components;
  }

  /**
   * Analyze individual component
   */
  async analyzeComponent(filePath, fileName, category) {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    // Extract metadata from file
    const description = this.extractDescription(content);
    const dependencies = this.extractRequires(content);
    const exports = this.extractExports(content);
    const functions = this.extractFunctions(content);

    const id = this.generateComponentId(fileName, category);

    return {
      id,
      name: fileName,
      path: path.relative(this.rootPath, filePath),
      category,
      description,
      size: stats.size,
      modified: stats.mtime,
      executable: (stats.mode & 0o111) !== 0,
      dependencies,
      exports,
      functions: functions.slice(0, 10), // Limit to 10 functions
      status: 'unknown', // Will be updated by verification
      verified: null
    };
  }

  /**
   * Extract description from file comments
   */
  extractDescription(content) {
    // Look for doc comment at top of file
    const docMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    if (docMatch) {
      return docMatch[1];
    }

    // Look for single-line comment
    const commentMatch = content.match(/^\s*\/\/\s*(.+)/m);
    if (commentMatch) {
      return commentMatch[1];
    }

    return 'No description';
  }

  /**
   * Extract require() statements
   */
  extractRequires(content) {
    const requires = [];
    const regex = /require\(['"]([^'"]+)['"]\)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const dep = match[1];
      // Only include relative requires (./lib/...) or our own modules
      if (dep.startsWith('.') || dep.startsWith('calos')) {
        requires.push(dep);
      }
    }

    return [...new Set(requires)]; // Deduplicate
  }

  /**
   * Extract exports
   */
  extractExports(content) {
    const exports = [];

    // module.exports = ...
    if (content.includes('module.exports')) {
      exports.push('default');
    }

    // exports.foo = ...
    const namedExports = content.match(/exports\.(\w+)/g);
    if (namedExports) {
      exports.push(...namedExports.map(e => e.replace('exports.', '')));
    }

    return [...new Set(exports)];
  }

  /**
   * Extract function names
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
      // Skip keywords
      if (!['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
        functions.push(name);
      }
    }

    return [...new Set(functions)].slice(0, 20);
  }

  /**
   * Generate unique component ID
   */
  generateComponentId(fileName, category) {
    const name = fileName.replace(/\.(js|sh|py)$/, '');
    return `${category}:${name}`;
  }

  /**
   * Extract dependency graph
   */
  async extractDependencies(components) {
    const graph = {};

    for (const [id, component] of Object.entries(components)) {
      graph[id] = {
        requires: component.dependencies,
        requiredBy: []
      };
    }

    // Build reverse dependencies
    for (const [id, component] of Object.entries(components)) {
      for (const dep of component.dependencies) {
        // Find which component this dependency refers to
        for (const [depId, depComponent] of Object.entries(components)) {
          if (depComponent.path === dep || depComponent.name === path.basename(dep)) {
            if (!graph[depId].requiredBy.includes(id)) {
              graph[depId].requiredBy.push(id);
            }
          }
        }
      }
    }

    return graph;
  }

  /**
   * Load health data from verification system
   */
  async loadHealthData() {
    const healthPath = path.join(process.env.HOME, '.calos/command-health.json');
    const knowledgePath = path.join(process.env.HOME, '.calos/command-knowledge.json');

    const health = {};

    try {
      const healthData = JSON.parse(await fs.readFile(healthPath, 'utf-8'));
      health.verification = healthData;
    } catch (error) {
      health.verification = null;
    }

    try {
      const knowledgeData = JSON.parse(await fs.readFile(knowledgePath, 'utf-8'));
      health.learning = knowledgeData;
    } catch (error) {
      health.learning = null;
    }

    return health;
  }

  /**
   * Get component by ID
   */
  async getComponent(id) {
    await this.loadRegistry();
    return this.registry.components[id];
  }

  /**
   * Get components by category
   */
  async getCategory(category) {
    await this.loadRegistry();
    const ids = this.registry.categories[category] || [];
    return ids.map(id => this.registry.components[id]);
  }

  /**
   * Search components
   */
  async search(query) {
    await this.loadRegistry();
    const results = [];
    const queryLower = query.toLowerCase();

    for (const component of Object.values(this.registry.components)) {
      if (
        component.name.toLowerCase().includes(queryLower) ||
        component.description.toLowerCase().includes(queryLower) ||
        component.path.toLowerCase().includes(queryLower)
      ) {
        results.push(component);
      }
    }

    return results;
  }

  /**
   * Get component dependencies (recursive)
   */
  async getDependencies(id, visited = new Set()) {
    await this.loadRegistry();

    if (visited.has(id)) {
      return [];
    }

    visited.add(id);
    const deps = this.registry.dependencies[id];

    if (!deps || !deps.requires) {
      return [];
    }

    const result = [...deps.requires];

    for (const depId of deps.requires) {
      const subDeps = await this.getDependencies(depId, visited);
      result.push(...subDeps);
    }

    return [...new Set(result)];
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    await this.loadRegistry();

    const stats = {
      total: this.registry.metadata.totalComponents,
      byCategory: {},
      byStatus: {},
      totalSize: 0,
      verified: 0,
      working: 0,
      broken: 0
    };

    for (const [category, ids] of Object.entries(this.registry.categories)) {
      stats.byCategory[category] = ids.length;
    }

    for (const component of Object.values(this.registry.components)) {
      stats.totalSize += component.size;

      const status = component.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      if (component.verified) {
        stats.verified++;
        if (status === 'working') stats.working++;
        if (status === 'broken') stats.broken++;
      }
    }

    return stats;
  }

  /**
   * Load registry from disk
   */
  async loadRegistry() {
    if (this.registry) return this.registry;

    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      this.registry = JSON.parse(data);
    } catch (error) {
      // Registry doesn't exist yet - need to scan
      throw new Error('Registry not found. Run scan() first.');
    }

    return this.registry;
  }

  /**
   * Save registry to disk
   */
  async saveRegistry() {
    await fs.writeFile(
      this.registryPath,
      JSON.stringify(this.registry, null, 2),
      'utf-8'
    );
  }

  /**
   * Update component status from verification
   */
  async updateComponentStatus(id, status, verifiedAt) {
    await this.loadRegistry();

    if (this.registry.components[id]) {
      this.registry.components[id].status = status;
      this.registry.components[id].verified = verifiedAt;
      await this.saveRegistry();
    }
  }

  /**
   * Generate report
   */
  async generateReport() {
    await this.loadRegistry();
    const stats = await this.getStatistics();

    let report = '';
    report += '╔════════════════════════════════════════╗\n';
    report += '║   CALOS Component Registry             ║\n';
    report += '╠════════════════════════════════════════╣\n';
    report += `║ Total Components:  ${String(stats.total).padStart(3)}                ║\n`;
    report += `║ Total Size:        ${this.formatSize(stats.totalSize).padEnd(20)} ║\n`;
    report += '╠════════════════════════════════════════╣\n';
    report += '║ By Category:                           ║\n';

    for (const [cat, count] of Object.entries(stats.byCategory)) {
      report += `║   ${cat.padEnd(12)} ${String(count).padStart(3)}                  ║\n`;
    }

    report += '╠════════════════════════════════════════╣\n';
    report += `║ Verified:          ${String(stats.verified).padStart(3)}                ║\n`;
    report += `║ Working:           ${String(stats.working).padStart(3)}                ║\n`;
    report += `║ Broken:            ${String(stats.broken).padStart(3)}                ║\n`;
    report += '╚════════════════════════════════════════╝\n';

    return report;
  }

  /**
   * Format file size
   */
  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

module.exports = CalosRegistry;
