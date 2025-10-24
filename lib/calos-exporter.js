/**
 * CALOS Exporter
 *
 * Makes CALOS portable - export to ZIP, npm package, Docker, or bare files.
 * Like backing up your iPhone - take everything with you.
 *
 * Export formats:
 * - portable: ZIP with all components + data
 * - npm: Ready-to-publish npm package
 * - docker: Docker image
 * - component: Single component with dependencies
 *
 * Use cases:
 * - "Move CALOS to new machine"
 * - "Share calculator engine with team"
 * - "Deploy to production"
 * - "Backup before changes"
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const CalosRegistry = require('./calos-registry');

class CalosExporter {
  constructor(options = {}) {
    this.registry = new CalosRegistry(options);
    this.rootPath = options.rootPath || path.join(__dirname, '../..');
    this.exportsDir = options.exportsDir || path.join(this.rootPath, 'exports');
  }

  /**
   * Export full CALOS system
   * @param {object} options - Export options
   * @returns {Promise<object>} Export result
   */
  async exportSystem(options = {}) {
    const format = options.format || 'portable';
    const includeData = options.includeData !== false;
    const includeDeps = options.includeDeps !== false;

    console.log(`📦 Exporting CALOS (format: ${format})...`);

    // Load registry
    try {
      await this.registry.loadRegistry();
    } catch (error) {
      console.log('📋 Generating registry first...');
      await this.registry.scan();
    }

    // Create exports directory
    await fs.mkdir(this.exportsDir, { recursive: true });

    let result;

    switch (format) {
      case 'portable':
        result = await this.exportPortable(includeData, includeDeps);
        break;

      case 'npm':
        result = await this.exportNpm();
        break;

      case 'docker':
        result = await this.exportDocker();
        break;

      case 'bare':
        result = await this.exportBare();
        break;

      default:
        throw new Error(`Unknown format: ${format}`);
    }

    console.log(`✅ Export complete: ${result.path}`);
    console.log(`   Size: ${this.formatSize(result.size)}`);

    return result;
  }

  /**
   * Export single component with its dependencies
   * @param {string} componentId - Component ID from registry
   * @param {object} options - Export options
   */
  async exportComponent(componentId, options = {}) {
    console.log(`📦 Exporting component: ${componentId}...`);

    await this.registry.loadRegistry();

    const component = await this.registry.getComponent(componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }

    // Get all dependencies
    const deps = await this.registry.getDependencies(componentId);

    // Create export directory
    const exportName = `${component.name.replace(/\.(js|sh|py)$/, '')}-${Date.now()}`;
    const exportDir = path.join(this.exportsDir, exportName);
    await fs.mkdir(exportDir, { recursive: true });

    // Copy component
    const destPath = path.join(exportDir, component.name);
    await this.copyFile(
      path.join(this.rootPath, component.path),
      destPath
    );

    // Copy dependencies
    if (options.includeDeps !== false) {
      const depsDir = path.join(exportDir, 'dependencies');
      await fs.mkdir(depsDir, { recursive: true });

      for (const depId of deps) {
        const dep = await this.registry.getComponent(depId);
        if (dep) {
          const depDest = path.join(depsDir, dep.name);
          await this.copyFile(
            path.join(this.rootPath, dep.path),
            depDest
          );
        }
      }
    }

    // Create README
    await this.createComponentReadme(exportDir, component, deps);

    // Get size
    const size = await this.getDirectorySize(exportDir);

    console.log(`✅ Component exported: ${exportDir}`);
    console.log(`   Size: ${this.formatSize(size)}`);
    console.log(`   Dependencies: ${deps.length}`);

    return {
      path: exportDir,
      component: component.name,
      dependencies: deps.length,
      size
    };
  }

  /**
   * Export as portable ZIP
   */
  async exportPortable(includeData, includeDeps) {
    const timestamp = Date.now();
    const exportName = `calos-portable-${timestamp}`;
    const exportDir = path.join(this.exportsDir, exportName);

    await fs.mkdir(exportDir, { recursive: true });

    // Copy all core files
    const filesToCopy = [
      'package.json',
      'calos-registry.json',
      'agent-router',
      'bin'
    ];

    for (const file of filesToCopy) {
      const src = path.join(this.rootPath, file);
      const dest = path.join(exportDir, file);

      try {
        await this.copyRecursive(src, dest);
      } catch (error) {
        console.warn(`⚠️  Could not copy ${file}: ${error.message}`);
      }
    }

    // Copy data if requested
    if (includeData) {
      const dataDir = path.join(process.env.HOME, '.calos');
      const destDataDir = path.join(exportDir, 'data');

      try {
        await this.copyRecursive(dataDir, destDataDir);
      } catch (error) {
        console.warn('⚠️  No data directory to copy');
      }
    }

    // Create installation script
    await this.createInstallScript(exportDir);

    // Create README
    await this.createExportReadme(exportDir, 'portable');

    // ZIP it
    const zipPath = `${exportDir}.zip`;
    await this.zip(exportDir, zipPath);

    // Get size
    const stats = await fs.stat(zipPath);

    // Clean up directory (keep ZIP only)
    await fs.rm(exportDir, { recursive: true });

    return {
      path: zipPath,
      size: stats.size,
      format: 'portable'
    };
  }

  /**
   * Export as npm package
   */
  async exportNpm() {
    const exportName = `calos-npm-${Date.now()}`;
    const exportDir = path.join(this.exportsDir, exportName);

    await fs.mkdir(exportDir, { recursive: true });

    // Copy files
    await this.copyRecursive(
      path.join(this.rootPath, 'agent-router'),
      path.join(exportDir, 'agent-router')
    );

    await this.copyRecursive(
      path.join(this.rootPath, 'bin'),
      path.join(exportDir, 'bin')
    );

    // Create package.json for npm
    const packageJson = {
      name: 'calos',
      version: '2.0.0',
      description: 'CALOS - Intelligent AI Agent Orchestration System',
      main: 'agent-router/router.js',
      bin: {
        calos: './bin/calos'
      },
      scripts: {
        start: 'node agent-router/router.js',
        test: 'node bin/calos test'
      },
      keywords: ['ai', 'agent', 'orchestration', 'calos'],
      author: 'Cal',
      license: 'MIT',
      dependencies: await this.extractDependencies()
    };

    await fs.writeFile(
      path.join(exportDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // Create README
    await this.createExportReadme(exportDir, 'npm');

    // Get size
    const size = await this.getDirectorySize(exportDir);

    return {
      path: exportDir,
      size,
      format: 'npm'
    };
  }

  /**
   * Export as Docker image
   */
  async exportDocker() {
    const exportName = `calos-docker-${Date.now()}`;
    const exportDir = path.join(this.exportsDir, exportName);

    await fs.mkdir(exportDir, { recursive: true });

    // Copy files
    await this.copyRecursive(
      path.join(this.rootPath, 'agent-router'),
      path.join(exportDir, 'agent-router')
    );

    await this.copyRecursive(
      path.join(this.rootPath, 'bin'),
      path.join(exportDir, 'bin')
    );

    await this.copyFile(
      path.join(this.rootPath, 'package.json'),
      path.join(exportDir, 'package.json')
    );

    // Create Dockerfile
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE 5001

CMD ["node", "agent-router/router.js"]
`;

    await fs.writeFile(path.join(exportDir, 'Dockerfile'), dockerfile, 'utf-8');

    // Create .dockerignore
    const dockerignore = `node_modules
.git
exports
data
*.log
`;

    await fs.writeFile(path.join(exportDir, '.dockerignore'), dockerignore, 'utf-8');

    // Create docker-compose.yml
    const dockerCompose = `version: '3.8'

services:
  calos:
    build: .
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
    volumes:
      - calos-data:/root/.calos

volumes:
  calos-data:
`;

    await fs.writeFile(path.join(exportDir, 'docker-compose.yml'), dockerCompose, 'utf-8');

    // Create README
    await this.createExportReadme(exportDir, 'docker');

    const size = await this.getDirectorySize(exportDir);

    return {
      path: exportDir,
      size,
      format: 'docker'
    };
  }

  /**
   * Export bare files (no packaging)
   */
  async exportBare() {
    const exportName = `calos-bare-${Date.now()}`;
    const exportDir = path.join(this.exportsDir, exportName);

    await fs.mkdir(exportDir, { recursive: true});

    // Just copy everything
    await this.copyRecursive(this.rootPath, exportDir);

    const size = await this.getDirectorySize(exportDir);

    return {
      path: exportDir,
      size,
      format: 'bare'
    };
  }

  /**
   * Helper: Copy file
   */
  async copyFile(src, dest) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  /**
   * Helper: Copy directory recursively
   */
  async copyRecursive(src, dest) {
    const stats = await fs.stat(src);

    if (stats.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const files = await fs.readdir(src);

      for (const file of files) {
        // Skip node_modules, .git, exports
        if (['node_modules', '.git', 'exports', 'data'].includes(file)) {
          continue;
        }

        await this.copyRecursive(
          path.join(src, file),
          path.join(dest, file)
        );
      }
    } else {
      await this.copyFile(src, dest);
    }
  }

  /**
   * Helper: ZIP directory
   */
  async zip(dir, output) {
    return new Promise((resolve, reject) => {
      const proc = spawn('zip', ['-r', output, path.basename(dir)], {
        cwd: path.dirname(dir)
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`ZIP failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Helper: Get directory size
   */
  async getDirectorySize(dir) {
    let size = 0;

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          size += await this.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      }
    } catch (error) {
      // Directory doesn't exist or not accessible
    }

    return size;
  }

  /**
   * Helper: Extract dependencies from package.json
   */
  async extractDependencies() {
    const packagePath = path.join(this.rootPath, 'package.json');
    const agentPackagePath = path.join(this.rootPath, 'agent-router/package.json');

    const deps = {};

    try {
      const rootPkg = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
      Object.assign(deps, rootPkg.dependencies || {});
    } catch (error) {
      // No root package.json
    }

    try {
      const agentPkg = JSON.parse(await fs.readFile(agentPackagePath, 'utf-8'));
      Object.assign(deps, agentPkg.dependencies || {});
    } catch (error) {
      // No agent-router package.json
    }

    return deps;
  }

  /**
   * Helper: Create installation script
   */
  async createInstallScript(exportDir) {
    const script = `#!/bin/bash
# CALOS Installation Script

echo "🚀 Installing CALOS..."

# Install dependencies
if [ -f "package.json" ]; then
  echo "📦 Installing npm dependencies..."
  npm install
fi

# Create data directory
mkdir -p ~/.calos

# Copy data if exists
if [ -d "data" ]; then
  echo "📂 Copying data..."
  cp -r data/* ~/.calos/
fi

# Make binaries executable
chmod +x bin/*

echo "✅ CALOS installed!"
echo ""
echo "To start: npm start"
echo "Or: ./bin/calos serve"
`;

    await fs.writeFile(path.join(exportDir, 'install.sh'), script, 'utf-8');
    await fs.chmod(path.join(exportDir, 'install.sh'), 0o755);
  }

  /**
   * Helper: Create README for export
   */
  async createExportReadme(exportDir, format) {
    let content = `# CALOS Export\n\n`;
    content += `Format: ${format}\n`;
    content += `Generated: ${new Date().toISOString()}\n\n`;

    if (format === 'portable') {
      content += `## Installation\n\n`;
      content += `\`\`\`bash\n`;
      content += `unzip calos-portable-*.zip\n`;
      content += `cd calos-portable-*\n`;
      content += `./install.sh\n`;
      content += `\`\`\`\n\n`;
    } else if (format === 'npm') {
      content += `## Installation\n\n`;
      content += `\`\`\`bash\n`;
      content += `npm install\n`;
      content += `npm link\n`;
      content += `\`\`\`\n\n`;
    } else if (format === 'docker') {
      content += `## Usage\n\n`;
      content += `\`\`\`bash\n`;
      content += `docker-compose up\n`;
      content += `\`\`\`\n\n`;
    }

    content += `## Components\n\n`;
    content += `See calos-registry.json for full component list.\n`;

    await fs.writeFile(path.join(exportDir, 'README.md'), content, 'utf-8');
  }

  /**
   * Helper: Create README for component export
   */
  async createComponentReadme(exportDir, component, deps) {
    let content = `# ${component.name}\n\n`;
    content += `${component.description}\n\n`;
    content += `## Details\n\n`;
    content += `- Category: ${component.category}\n`;
    content += `- Size: ${this.formatSize(component.size)}\n`;
    content += `- Dependencies: ${deps.length}\n\n`;

    if (deps.length > 0) {
      content += `## Dependencies\n\n`;
      for (const depId of deps) {
        const dep = await this.registry.getComponent(depId);
        if (dep) {
          content += `- ${dep.name}\n`;
        }
      }
      content += `\n`;
    }

    await fs.writeFile(path.join(exportDir, 'README.md'), content, 'utf-8');
  }

  /**
   * Helper: Format file size
   */
  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

module.exports = CalosExporter;
