/**
 * GitHub Project Generator
 *
 * Creates GitHub repositories programmatically via GitHub API for all our brands.
 * Auto-generates README, applies brand theme, sets up CI/CD workflows.
 *
 * Brands supported:
 * - CALOS (calos.ai)
 * - Soulfra (soulfra.com)
 * - DeathToData (deathtodata.com)
 * - Publishing (publishing.bot)
 * - Dr. Seuss (drseuss.consulting)
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');

class GitHubProjectGenerator {
  constructor(config = {}) {
    this.githubToken = config.githubToken || process.env.GITHUB_TOKEN;
    this.defaultOrg = config.defaultOrg || process.env.GITHUB_ORG || null;
    this.verbose = config.verbose || false;

    if (!this.githubToken) {
      throw new Error('GitHub token required. Set GITHUB_TOKEN environment variable.');
    }

    this.octokit = new Octokit({
      auth: this.githubToken
    });

    // Brand configurations
    this.brands = {
      calos: {
        name: 'CALOS',
        domain: 'calos.ai',
        colors: {
          primary: '#667eea',
          secondary: '#764ba2',
          accent: '#61dafb',
          text: '#ffffff',
          background: '#0a0a0a'
        },
        tagline: 'AI-Powered Business Operating System',
        org: 'calos'
      },
      soulfra: {
        name: 'Soulfra',
        domain: 'soulfra.com',
        colors: {
          primary: '#3498db',
          secondary: '#2ecc71',
          accent: '#e74c3c',
          text: '#ffffff',
          background: '#1a1a1a'
        },
        tagline: 'Soul Fragment - Digital Identity & Privacy',
        org: 'soulfra'
      },
      deathtodata: {
        name: 'DeathToData',
        domain: 'deathtodata.com',
        colors: {
          primary: '#e74c3c',
          secondary: '#c0392b',
          accent: '#f39c12',
          text: '#ffffff',
          background: '#000000'
        },
        tagline: 'Data Brokerage Disruption',
        org: 'deathtodata'
      },
      publishing: {
        name: 'Publishing.bot',
        domain: 'publishing.bot',
        colors: {
          primary: '#9b59b6',
          secondary: '#8e44ad',
          accent: '#3498db',
          text: '#ffffff',
          background: '#2c3e50'
        },
        tagline: 'Automated Content Publishing Platform',
        org: 'publishingbot'
      },
      drseuss: {
        name: 'Dr. Seuss Consulting',
        domain: 'drseuss.consulting',
        colors: {
          primary: '#f39c12',
          secondary: '#e67e22',
          accent: '#e74c3c',
          text: '#2c3e50',
          background: '#ecf0f1'
        },
        tagline: 'Whimsical Business Consulting',
        org: 'drseuss-consulting'
      }
    };

    console.log('[GitHubProjectGenerator] Initialized');
  }

  /**
   * Get brand configuration
   */
  getBrand(brandSlug) {
    const brand = this.brands[brandSlug.toLowerCase()];
    if (!brand) {
      throw new Error(`Unknown brand: ${brandSlug}. Available: ${Object.keys(this.brands).join(', ')}`);
    }
    return brand;
  }

  /**
   * Create GitHub repository
   */
  async createRepository(options) {
    const {
      name,
      description,
      brand,
      template = 'basic',
      isPrivate = false,
      autoInit = true,
      org = null
    } = options;

    const brandConfig = this.getBrand(brand);
    const owner = org || brandConfig.org || this.defaultOrg;

    console.log(`[GitHubProjectGenerator] Creating repository: ${owner}/${name}`);

    try {
      // Create repository
      const repoParams = {
        name,
        description: description || `${brandConfig.name} - ${name}`,
        private: isPrivate,
        auto_init: autoInit,
        has_issues: true,
        has_projects: true,
        has_wiki: false
      };

      let repo;

      if (owner && owner !== await this.getAuthenticatedUser()) {
        // Create in organization
        repo = await this.octokit.repos.createInOrg({
          org: owner,
          ...repoParams
        });
      } else {
        // Create in personal account
        repo = await this.octokit.repos.createForAuthenticatedUser(repoParams);
      }

      console.log(`[GitHubProjectGenerator] Repository created: ${repo.data.html_url}`);

      // Add topics (tags)
      await this.octokit.repos.replaceAllTopics({
        owner: repo.data.owner.login,
        repo: name,
        names: [brand, template, 'calos-ecosystem', 'automated']
      });

      return {
        repo: repo.data,
        brand: brandConfig
      };
    } catch (error) {
      if (error.status === 422) {
        console.error(`[GitHubProjectGenerator] Repository ${owner}/${name} already exists`);
        throw new Error(`Repository already exists: ${owner}/${name}`);
      }
      console.error('[GitHubProjectGenerator] Error creating repository:', error.message);
      throw error;
    }
  }

  /**
   * Generate README content
   */
  generateREADME(options) {
    const { name, description, brand, template } = options;
    const brandConfig = this.getBrand(brand);

    return `# ${name}

> ${description || brandConfig.tagline}

![${brandConfig.name}](https://img.shields.io/badge/${brandConfig.name}-${brandConfig.domain}-${brandConfig.colors.primary.replace('#', '')}?style=for-the-badge)
![Template](https://img.shields.io/badge/template-${template}-blue?style=for-the-badge)

## About

This project is part of the **${brandConfig.name}** ecosystem (${brandConfig.domain}).

**${brandConfig.tagline}**

## Quick Start

\`\`\`bash
# Clone repository
git clone https://github.com/${brandConfig.org}/${name}.git
cd ${name}

# Install dependencies
npm install

# Run development server
npm run dev
\`\`\`

## Tech Stack

${this.getTemplateStack(template)}

## Brand Colors

- **Primary:** \`${brandConfig.colors.primary}\`
- **Secondary:** \`${brandConfig.colors.secondary}\`
- **Accent:** \`${brandConfig.colors.accent}\`
- **Text:** \`${brandConfig.colors.text}\`
- **Background:** \`${brandConfig.colors.background}\`

## Documentation

For full documentation, visit [${brandConfig.domain}](https://${brandConfig.domain}).

## License

MIT © ${brandConfig.name}

---

**Built with ❤️ by ${brandConfig.name}**

*Part of the CALOS ecosystem - AI-powered business operating systems*
`;
  }

  /**
   * Get tech stack for template
   */
  getTemplateStack(template) {
    const stacks = {
      saas: '- Node.js + Express\n- PostgreSQL\n- React/Vue frontend\n- Stripe payments\n- Auth (JWT)',
      'cli-tool': '- Node.js\n- Commander.js (CLI framework)\n- Chalk (colored output)\n- Inquirer (prompts)',
      'content-site': '- Next.js\n- Tailwind CSS\n- MDX for content\n- Vercel deployment',
      api: '- Node.js + Express\n- PostgreSQL\n- REST API\n- OpenAPI/Swagger docs',
      basic: '- Node.js\n- JavaScript/TypeScript\n- Custom configuration'
    };

    return stacks[template] || stacks.basic;
  }

  /**
   * Create README.md file in repository
   */
  async createREADME(owner, repo, content) {
    console.log(`[GitHubProjectGenerator] Creating README.md in ${owner}/${repo}`);

    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: '📝 Add branded README',
        content: Buffer.from(content).toString('base64')
      });

      console.log(`[GitHubProjectGenerator] README.md created`);
    } catch (error) {
      console.error('[GitHubProjectGenerator] Error creating README:', error.message);
      throw error;
    }
  }

  /**
   * Create .github/workflows/ci.yml
   */
  async createCIWorkflow(owner, repo, template) {
    const workflow = `name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Run linter
        run: npm run lint

  build:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build
`;

    console.log(`[GitHubProjectGenerator] Creating CI workflow in ${owner}/${repo}`);

    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: '.github/workflows/ci.yml',
        message: '🔧 Add CI/CD workflow',
        content: Buffer.from(workflow).toString('base64')
      });

      console.log(`[GitHubProjectGenerator] CI workflow created`);
    } catch (error) {
      console.error('[GitHubProjectGenerator] Error creating workflow:', error.message);
      // Don't throw - workflow creation is optional
    }
  }

  /**
   * Create package.json
   */
  async createPackageJson(owner, repo, options) {
    const { name, description, brand, template } = options;
    const brandConfig = this.getBrand(brand);

    const packageJson = {
      name: `@${brandConfig.org}/${name}`,
      version: '0.1.0',
      description: description || brandConfig.tagline,
      main: 'index.js',
      scripts: this.getTemplateScripts(template),
      keywords: [brand, template, 'calos', 'automated'],
      author: brandConfig.name,
      license: 'MIT',
      repository: {
        type: 'git',
        url: `https://github.com/${owner}/${repo}.git`
      },
      homepage: `https://${brandConfig.domain}`,
      dependencies: this.getTemplateDependencies(template),
      devDependencies: {
        'eslint': '^8.0.0',
        'jest': '^29.0.0'
      }
    };

    console.log(`[GitHubProjectGenerator] Creating package.json in ${owner}/${repo}`);

    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'package.json',
        message: '📦 Add package.json',
        content: Buffer.from(JSON.stringify(packageJson, null, 2)).toString('base64')
      });

      console.log(`[GitHubProjectGenerator] package.json created`);
    } catch (error) {
      console.error('[GitHubProjectGenerator] Error creating package.json:', error.message);
      throw error;
    }
  }

  /**
   * Get npm scripts for template
   */
  getTemplateScripts(template) {
    const scripts = {
      saas: {
        dev: 'node server.js',
        build: 'npm run build:client && npm run build:server',
        test: 'jest',
        lint: 'eslint .'
      },
      'cli-tool': {
        start: 'node bin/cli.js',
        test: 'jest',
        lint: 'eslint .'
      },
      'content-site': {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        test: 'jest',
        lint: 'eslint .'
      },
      api: {
        dev: 'nodemon server.js',
        start: 'node server.js',
        test: 'jest',
        lint: 'eslint .'
      },
      basic: {
        start: 'node index.js',
        test: 'jest',
        lint: 'eslint .'
      }
    };

    return scripts[template] || scripts.basic;
  }

  /**
   * Get dependencies for template
   */
  getTemplateDependencies(template) {
    const deps = {
      saas: {
        'express': '^4.18.0',
        'pg': '^8.11.0',
        'stripe': '^12.0.0'
      },
      'cli-tool': {
        'commander': '^11.0.0',
        'chalk': '^5.0.0',
        'inquirer': '^9.0.0'
      },
      'content-site': {
        'next': '^13.0.0',
        'react': '^18.0.0',
        'react-dom': '^18.0.0'
      },
      api: {
        'express': '^4.18.0',
        'pg': '^8.11.0',
        'swagger-ui-express': '^4.6.0'
      },
      basic: {}
    };

    return deps[template] || deps.basic;
  }

  /**
   * Get authenticated user
   */
  async getAuthenticatedUser() {
    const { data } = await this.octokit.users.getAuthenticated();
    return data.login;
  }

  /**
   * Full project setup workflow
   */
  async createProject(options) {
    console.log('='.repeat(60));
    console.log('  GitHub Project Generator');
    console.log('='.repeat(60));

    const { name, description, brand, template, isPrivate, org } = options;

    try {
      // Step 1: Create repository
      const { repo, brand: brandConfig } = await this.createRepository(options);
      const owner = repo.owner.login;

      // Step 2: Create README
      const readmeContent = this.generateREADME({ name, description, brand, template });
      await this.createREADME(owner, name, readmeContent);

      // Step 3: Create package.json
      await this.createPackageJson(owner, name, { name, description, brand, template });

      // Step 4: Create CI workflow
      await this.createCIWorkflow(owner, name, template);

      console.log();
      console.log('✅ Project created successfully!');
      console.log();
      console.log(`   Repository: ${repo.html_url}`);
      console.log(`   Brand: ${brandConfig.name} (${brandConfig.domain})`);
      console.log(`   Template: ${template}`);
      console.log();
      console.log('   Next steps:');
      console.log(`   1. git clone ${repo.clone_url}`);
      console.log(`   2. cd ${name}`);
      console.log('   3. npm install');
      console.log('   4. npm run dev');
      console.log();
      console.log('='.repeat(60));

      return {
        success: true,
        repo,
        brand: brandConfig,
        url: repo.html_url
      };
    } catch (error) {
      console.error('❌ Project creation failed:', error.message);
      throw error;
    }
  }
}

module.exports = GitHubProjectGenerator;
