/**
 * Universal Portfolio Manager
 *
 * Maps complete digital infrastructure hierarchy:
 * matthewmauer (system user) → repos → domains → packages → deployments
 *
 * Hierarchy Layers:
 * 1. System Identity - macbook user, .ssh, .docker, .aws credentials
 * 2. Local Repositories - git repos, package manifests
 * 3. Domains & Web - GoDaddy domains, sitemaps, robots.txt
 * 4. Package Registries - npm, crates.io, Docker Hub
 * 5. Deployments - GitHub Pages, iOS apps, forums, chats
 *
 * Architecture:
 * [matthewmauer] (root admin)
 *   ├── System (.ssh, .docker, .config)
 *   ├── Repos (CALOS_ROOT, Soulfra-Documentation, ...)
 *   │   └── Packages (package.json, Cargo.toml, Dockerfile)
 *   ├── Domains (soulfra.com, calriven.com, ...)
 *   │   └── Web (sitemap.xml, robots.txt, GitHub Pages)
 *   └── Services (Gmail, Forums, Chats, iOS Apps)
 *
 * Usage:
 *   const manager = new UniversalPortfolioManager();
 *   await manager.initialize();
 *   const hierarchy = await manager.mapCompleteHierarchy();
 *   await manager.generatePortfolios();
 *   await manager.publishToAllRegistries();
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { Pool } = require('pg');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk');

const execAsync = promisify(exec);

class UniversalPortfolioManager {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
    });

    // System identity
    this.systemUser = os.userInfo().username; // matthewmauer
    this.hostname = os.hostname();
    this.homeDir = os.homedir();

    // Paths
    this.desktopPath = path.join(this.homeDir, 'Desktop');
    this.sshPath = path.join(this.homeDir, '.ssh');
    this.dockerPath = path.join(this.homeDir, '.docker');
    this.configPath = path.join(this.homeDir, '.config');

    // State
    this.hierarchy = {
      systemIdentity: null,
      repositories: [],
      packages: [],
      domains: [],
      deployments: []
    };

    console.log(chalk.cyan.bold('\n🌐 Universal Portfolio Manager\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  System User: ${this.systemUser}`));
    console.log(chalk.white(`  Hostname: ${this.hostname}`));
    console.log(chalk.white(`  Home: ${this.homeDir}`));
    console.log(chalk.gray('─'.repeat(80) + '\n'));
  }

  /**
   * Initialize manager - map complete system
   */
  async initialize() {
    console.log(chalk.yellow('📋 Initializing Universal Portfolio\n'));

    // Layer 1: System Identity
    console.log(chalk.white('Layer 1: System Identity'));
    this.hierarchy.systemIdentity = await this.mapSystemIdentity();
    console.log(chalk.green(`   ✅ Mapped system identity: ${this.systemUser}`));

    // Layer 2: Local Repositories
    console.log(chalk.white('\nLayer 2: Local Repositories'));
    this.hierarchy.repositories = await this.scanRepositories();
    console.log(chalk.green(`   ✅ Found ${this.hierarchy.repositories.length} git repositories`));

    // Layer 3: Packages
    console.log(chalk.white('\nLayer 3: Packages'));
    this.hierarchy.packages = await this.scanPackages();
    console.log(chalk.green(`   ✅ Found ${this.hierarchy.packages.length} packages`));

    // Layer 4: Domains
    console.log(chalk.white('\nLayer 4: Domains'));
    this.hierarchy.domains = await this.scanDomains();
    console.log(chalk.green(`   ✅ Found ${this.hierarchy.domains.length} domains`));

    // Layer 5: Deployments
    console.log(chalk.white('\nLayer 5: Deployments'));
    this.hierarchy.deployments = await this.scanDeployments();
    console.log(chalk.green(`   ✅ Found ${this.hierarchy.deployments.length} deployments`));

    console.log(chalk.gray('\n' + '─'.repeat(80) + '\n'));

    return this.hierarchy;
  }

  /**
   * Layer 1: Map system identity
   */
  async mapSystemIdentity() {
    const identity = {
      username: this.systemUser,
      hostname: this.hostname,
      homeDir: this.homeDir,
      credentials: {
        ssh: await this.checkPath(this.sshPath),
        docker: await this.checkPath(this.dockerPath),
        config: await this.checkPath(this.configPath)
      },
      platform: os.platform(),
      arch: os.arch(),
      release: os.release()
    };

    // Check for SSH keys
    if (identity.credentials.ssh) {
      try {
        const keys = await fs.readdir(this.sshPath);
        identity.credentials.sshKeys = keys.filter(f => f.endsWith('.pub')).map(k => k.replace('.pub', ''));
      } catch (error) {
        identity.credentials.sshKeys = [];
      }
    }

    return identity;
  }

  /**
   * Layer 2: Scan local git repositories
   */
  async scanRepositories() {
    const repos = [];

    try {
      // Find all .git directories on Desktop
      const { stdout } = await execAsync(`find "${this.desktopPath}" -maxdepth 2 -name ".git" -type d`);
      const gitDirs = stdout.trim().split('\n').filter(Boolean);

      for (const gitDir of gitDirs) {
        const repoPath = gitDir.replace('/.git', '');
        const repoName = path.basename(repoPath);

        const repo = {
          name: repoName,
          path: repoPath,
          git: gitDir
        };

        // Get git remote
        try {
          const { stdout: remoteStdout } = await execAsync('git remote get-url origin', { cwd: repoPath });
          repo.remote = remoteStdout.trim();
        } catch (error) {
          repo.remote = null;
        }

        // Get current branch
        try {
          const { stdout: branchStdout } = await execAsync('git branch --show-current', { cwd: repoPath });
          repo.branch = branchStdout.trim();
        } catch (error) {
          repo.branch = null;
        }

        // Get last commit
        try {
          const { stdout: commitStdout } = await execAsync('git log -1 --format="%H %s"', { cwd: repoPath });
          const [hash, ...messageParts] = commitStdout.trim().split(' ');
          repo.lastCommit = {
            hash,
            message: messageParts.join(' ')
          };
        } catch (error) {
          repo.lastCommit = null;
        }

        repos.push(repo);
      }
    } catch (error) {
      console.error(chalk.red(`   ❌ Error scanning repos: ${error.message}`));
    }

    return repos;
  }

  /**
   * Layer 3: Scan packages (npm, cargo, docker)
   */
  async scanPackages() {
    const packages = [];

    for (const repo of this.hierarchy.repositories) {
      // NPM packages
      const packageJsonPath = path.join(repo.path, 'package.json');
      if (await this.checkPath(packageJsonPath)) {
        try {
          const content = await fs.readFile(packageJsonPath, 'utf8');
          const packageJson = JSON.parse(content);
          packages.push({
            type: 'npm',
            name: packageJson.name,
            version: packageJson.version,
            repository: repo.name,
            path: repo.path,
            manifest: 'package.json',
            description: packageJson.description,
            private: packageJson.private || false
          });
        } catch (error) {
          console.warn(chalk.yellow(`   ⚠️  Could not parse ${packageJsonPath}`));
        }
      }

      // Rust crates
      const cargoTomlPath = path.join(repo.path, 'Cargo.toml');
      if (await this.checkPath(cargoTomlPath)) {
        try {
          const content = await fs.readFile(cargoTomlPath, 'utf8');
          const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
          const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
          packages.push({
            type: 'crate',
            name: nameMatch ? nameMatch[1] : 'unknown',
            version: versionMatch ? versionMatch[1] : '0.0.0',
            repository: repo.name,
            path: repo.path,
            manifest: 'Cargo.toml'
          });
        } catch (error) {
          console.warn(chalk.yellow(`   ⚠️  Could not parse ${cargoTomlPath}`));
        }
      }

      // Docker containers
      const dockerfilePath = path.join(repo.path, 'Dockerfile');
      if (await this.checkPath(dockerfilePath)) {
        try {
          const content = await fs.readFile(dockerfilePath, 'utf8');
          const fromMatch = content.match(/FROM\s+([^\s]+)/);
          packages.push({
            type: 'docker',
            name: repo.name,
            repository: repo.name,
            path: repo.path,
            manifest: 'Dockerfile',
            baseImage: fromMatch ? fromMatch[1] : null
          });
        } catch (error) {
          console.warn(chalk.yellow(`   ⚠️  Could not parse ${dockerfilePath}`));
        }
      }
    }

    return packages;
  }

  /**
   * Layer 4: Scan domains from database
   */
  async scanDomains() {
    const domains = [];

    try {
      const result = await this.db.query(`
        SELECT
          dh.domain_name,
          dh.status,
          dh.hosting_provider,
          dh.github_repo,
          bc.brand_name,
          dt.total_score,
          dt.rating_label
        FROM domain_hierarchy dh
        LEFT JOIN brand_config bc ON bc.domain_name = dh.domain_name
        LEFT JOIN domain_temperature dt ON dt.domain_name = dh.domain_name
        WHERE dh.domain_type = 'brand'
        ORDER BY dt.total_score DESC NULLS LAST
      `);

      result.rows.forEach(row => {
        domains.push({
          domain: row.domain_name,
          brand: row.brand_name,
          status: row.status,
          hosting: row.hosting_provider,
          repo: row.github_repo,
          temperature: row.total_score,
          rating: row.rating_label
        });
      });
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  Could not query domains: ${error.message}`));
    }

    return domains;
  }

  /**
   * Layer 5: Scan deployments (sitemaps, GitHub Pages, etc.)
   */
  async scanDeployments() {
    const deployments = [];

    // Scan for sitemaps and robots.txt
    for (const repo of this.hierarchy.repositories) {
      const publicPath = path.join(repo.path, 'public');

      // Sitemap
      const sitemapPath = path.join(publicPath, 'sitemap.xml');
      if (await this.checkPath(sitemapPath)) {
        deployments.push({
          type: 'sitemap',
          repository: repo.name,
          path: sitemapPath,
          domain: null // TODO: extract from sitemap
        });
      }

      // Robots.txt
      const robotsPath = path.join(publicPath, 'robots.txt');
      if (await this.checkPath(robotsPath)) {
        deployments.push({
          type: 'robots',
          repository: repo.name,
          path: robotsPath,
          domain: null // TODO: extract from robots.txt
        });
      }

      // GitHub Pages (check for gh-pages branch)
      try {
        const { stdout } = await execAsync('git branch -r', { cwd: repo.path });
        if (stdout.includes('gh-pages')) {
          deployments.push({
            type: 'github-pages',
            repository: repo.name,
            branch: 'gh-pages',
            url: repo.remote ? `https://${this.systemUser}.github.io/${repo.name}` : null
          });
        }
      } catch (error) {
        // No remote branches
      }
    }

    return deployments;
  }

  /**
   * Generate complete hierarchy map
   */
  async mapCompleteHierarchy() {
    const map = {
      root: {
        identity: this.systemUser,
        type: 'system-user',
        hostname: this.hostname
      },
      layers: {
        systemIdentity: this.hierarchy.systemIdentity,
        repositories: this.hierarchy.repositories.map(r => ({
          name: r.name,
          path: r.path,
          remote: r.remote,
          packages: this.hierarchy.packages.filter(p => p.repository === r.name).length
        })),
        packages: this.hierarchy.packages.map(p => ({
          type: p.type,
          name: p.name,
          version: p.version,
          repository: p.repository
        })),
        domains: this.hierarchy.domains.map(d => ({
          domain: d.domain,
          brand: d.brand,
          temperature: d.temperature,
          status: d.status
        })),
        deployments: this.hierarchy.deployments.map(d => ({
          type: d.type,
          repository: d.repository,
          target: d.url || d.domain
        }))
      },
      stats: {
        repositories: this.hierarchy.repositories.length,
        packages: {
          total: this.hierarchy.packages.length,
          npm: this.hierarchy.packages.filter(p => p.type === 'npm').length,
          crates: this.hierarchy.packages.filter(p => p.type === 'crate').length,
          docker: this.hierarchy.packages.filter(p => p.type === 'docker').length
        },
        domains: this.hierarchy.domains.length,
        deployments: {
          total: this.hierarchy.deployments.length,
          sitemaps: this.hierarchy.deployments.filter(d => d.type === 'sitemap').length,
          robots: this.hierarchy.deployments.filter(d => d.type === 'robots').length,
          githubPages: this.hierarchy.deployments.filter(d => d.type === 'github-pages').length
        }
      }
    };

    return map;
  }

  /**
   * Generate portfolio folders structure
   */
  async generatePortfolios() {
    const portfolios = {
      byRepository: {},
      byDomain: {},
      byPackageType: {
        npm: [],
        crate: [],
        docker: []
      }
    };

    // Group by repository
    this.hierarchy.repositories.forEach(repo => {
      portfolios.byRepository[repo.name] = {
        path: repo.path,
        remote: repo.remote,
        branch: repo.branch,
        packages: this.hierarchy.packages.filter(p => p.repository === repo.name),
        deployments: this.hierarchy.deployments.filter(d => d.repository === repo.name)
      };
    });

    // Group by domain
    this.hierarchy.domains.forEach(domain => {
      portfolios.byDomain[domain.domain] = {
        brand: domain.brand,
        temperature: domain.temperature,
        rating: domain.rating,
        repo: domain.repo,
        deployments: this.hierarchy.deployments.filter(d => d.domain === domain.domain)
      };
    });

    // Group by package type
    this.hierarchy.packages.forEach(pkg => {
      if (portfolios.byPackageType[pkg.type]) {
        portfolios.byPackageType[pkg.type].push(pkg);
      }
    });

    return portfolios;
  }

  /**
   * Check if path exists
   */
  async checkPath(filepath) {
    try {
      await fs.access(filepath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Print hierarchy tree
   */
  printHierarchy() {
    console.log(chalk.cyan.bold('\n🌳 Universal Portfolio Hierarchy\n'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.white.bold(`\n${this.systemUser}@${this.hostname} (root)`));

    // System layer
    console.log(chalk.white('  ├── System Identity'));
    console.log(chalk.gray(`      ├── SSH Keys: ${this.hierarchy.systemIdentity.credentials.sshKeys?.length || 0}`));
    console.log(chalk.gray(`      ├── Docker: ${this.hierarchy.systemIdentity.credentials.docker ? 'yes' : 'no'}`));
    console.log(chalk.gray(`      └── Platform: ${this.hierarchy.systemIdentity.platform}`));

    // Repositories layer
    console.log(chalk.white(`  ├── Repositories (${this.hierarchy.repositories.length})`));
    this.hierarchy.repositories.slice(0, 5).forEach((repo, i) => {
      const isLast = i === Math.min(4, this.hierarchy.repositories.length - 1);
      const prefix = isLast ? '      └──' : '      ├──';
      console.log(chalk.gray(`${prefix} ${repo.name} (${repo.branch || 'no branch'})`));
    });
    if (this.hierarchy.repositories.length > 5) {
      console.log(chalk.gray(`      └── ... and ${this.hierarchy.repositories.length - 5} more`));
    }

    // Packages layer
    console.log(chalk.white(`  ├── Packages (${this.hierarchy.packages.length})`));
    const npmCount = this.hierarchy.packages.filter(p => p.type === 'npm').length;
    const crateCount = this.hierarchy.packages.filter(p => p.type === 'crate').length;
    const dockerCount = this.hierarchy.packages.filter(p => p.type === 'docker').length;
    console.log(chalk.gray(`      ├── NPM: ${npmCount}`));
    console.log(chalk.gray(`      ├── Crates: ${crateCount}`));
    console.log(chalk.gray(`      └── Docker: ${dockerCount}`));

    // Domains layer
    console.log(chalk.white(`  ├── Domains (${this.hierarchy.domains.length})`));
    this.hierarchy.domains.slice(0, 5).forEach((domain, i) => {
      const isLast = i === Math.min(4, this.hierarchy.domains.length - 1);
      const prefix = isLast ? '      └──' : '      ├──';
      const rating = domain.rating || 'not rated';
      console.log(chalk.gray(`${prefix} ${domain.domain} (${rating})`));
    });
    if (this.hierarchy.domains.length > 5) {
      console.log(chalk.gray(`      └── ... and ${this.hierarchy.domains.length - 5} more`));
    }

    // Deployments layer
    console.log(chalk.white(`  └── Deployments (${this.hierarchy.deployments.length})`));
    const sitemapCount = this.hierarchy.deployments.filter(d => d.type === 'sitemap').length;
    const robotsCount = this.hierarchy.deployments.filter(d => d.type === 'robots').length;
    const ghPagesCount = this.hierarchy.deployments.filter(d => d.type === 'github-pages').length;
    console.log(chalk.gray(`      ├── Sitemaps: ${sitemapCount}`));
    console.log(chalk.gray(`      ├── Robots.txt: ${robotsCount}`));
    console.log(chalk.gray(`      └── GitHub Pages: ${ghPagesCount}`));

    console.log(chalk.gray('\n' + '─'.repeat(80) + '\n'));
  }
}

module.exports = UniversalPortfolioManager;
