/**
 * Deployment Orchestrator
 *
 * One command to deploy to multiple platforms:
 * - GitHub Pages (lessons.calos.com)
 * - GitLab Pages (backup/mirror)
 * - GitHub Gist (shareable snippets)
 * - Apache/Self-hosted (full control)
 * - Docker Registry (GHCR, Docker Hub)
 *
 * Usage:
 *   const orchestrator = new DeploymentOrchestrator({
 *     github: { token: '...', repo: 'Soulfra/agent-router' },
 *     gitlab: { token: '...', project: 'soulfra/agent-router' },
 *     gist: { token: '...', gistId: 'abc123' },
 *     apache: { host: 'lessons.calos.com', path: '/var/www/lessons' },
 *     docker: { registry: 'ghcr.io', image: 'soulfra/lessons' }
 *   });
 *
 *   await orchestrator.deployAll({
 *     source: 'public/lessons',
 *     message: 'Deploy lesson system v2.0'
 *   });
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class DeploymentOrchestrator {
  constructor(options = {}) {
    this.config = {
      github: options.github || null,
      gitlab: options.gitlab || null,
      gist: options.gist || null,
      apache: options.apache || null,
      docker: options.docker || null,
      dryRun: options.dryRun || false,
      taskDelegator: options.taskDelegator || null, // Cal task breakdown integration
      conversationLearner: options.conversationLearner || null // Cal logging integration
    };

    this.results = [];
    console.log('[DeploymentOrchestrator] Initialized with Cal integration:', {
      taskDelegator: !!this.config.taskDelegator,
      conversationLearner: !!this.config.conversationLearner
    });
  }

  /**
   * Deploy to all configured platforms
   * Now integrated with Cal's task breakdown and logging systems
   */
  async deployAll(options = {}) {
    const {
      source = 'public/lessons',
      message = `Deploy ${new Date().toISOString()}`,
      skipTests = false,
      platforms = [] // Allow filtering specific platforms
    } = options;

    console.log(`\n🚀 Starting deployment to all platforms...`);
    console.log(`   Source: ${source}`);
    console.log(`   Message: ${message}\n`);

    this.results = [];

    // Cal integration: Use task delegator to break down deployment
    if (this.config.taskDelegator) {
      console.log('📋 Cal is breaking down the deployment task...\n');

      const plan = await this.config.taskDelegator.breakDown({
        description: `Deploy ${source} to multiple platforms`,
        type: 'deployment',
        constraints: [`Source: ${source}`, `Platforms: ${platforms.join(', ') || 'all'}`],
        features: ['GitHub Pages', 'GitLab Pages', 'Gist', 'Docker', 'Apache']
      });

      console.log(`Cal's plan: ${plan.totalSteps} steps (${plan.estimatedComplexity} complexity)\n`);

      // Log plan to conversation learner
      if (this.config.conversationLearner) {
        await this.config.conversationLearner.logConversation('system',
          `Deployment plan created: ${plan.totalSteps} steps, ${plan.estimatedComplexity} complexity`
        );
      }
    }

    // Run tests first (unless skipped)
    if (!skipTests) {
      console.log('🧪 Running tests...');
      const testsPass = await this.runTests();
      if (!testsPass) {
        throw new Error('Tests failed. Deployment aborted.');
      }
      console.log('✅ Tests passed\n');
    }

    // Deploy to each platform in parallel
    const deployments = [];

    if (this.config.github) {
      deployments.push(this.deployToGitHub(source, message));
    }

    if (this.config.gitlab) {
      deployments.push(this.deployToGitLab(source, message));
    }

    if (this.config.gist) {
      deployments.push(this.deployToGist(source, message));
    }

    if (this.config.apache) {
      deployments.push(this.deployToApache(source, message));
    }

    if (this.config.docker) {
      deployments.push(this.deployToDocker(source, message));
    }

    // Wait for all deployments
    const results = await Promise.allSettled(deployments);

    // Collect results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        this.results.push(result.value);
      } else {
        this.results.push({
          platform: this.getPlatformName(index),
          success: false,
          error: result.reason.message,
          url: null
        });
      }
    });

    // Print summary
    this.printSummary();

    return this.results;
  }

  /**
   * Deploy to GitHub Pages
   */
  async deployToGitHub(source, message) {
    console.log('📦 Deploying to GitHub Pages...');

    const { token, repo, branch = 'main', folder = 'public' } = this.config.github;

    if (this.config.dryRun) {
      console.log('   [DRY RUN] Would deploy to GitHub Pages');
      return {
        platform: 'GitHub Pages',
        success: true,
        url: `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/lessons/`,
        dryRun: true
      };
    }

    try {
      // Check if git is initialized
      await execAsync('git rev-parse --git-dir');

      // Add files
      await execAsync(`git add ${source}`);

      // Commit
      try {
        await execAsync(`git commit -m "${message}"`);
      } catch (err) {
        if (!err.message.includes('nothing to commit')) {
          throw err;
        }
      }

      // Push to GitHub
      const remote = `https://${token}@github.com/${repo}.git`;
      await execAsync(`git push ${remote} ${branch}`);

      const url = `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/lessons/`;

      console.log(`   ✅ Deployed to GitHub Pages: ${url}`);

      return {
        platform: 'GitHub Pages',
        success: true,
        url,
        repo,
        branch
      };
    } catch (error) {
      console.error(`   ❌ GitHub Pages deployment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deploy to GitLab Pages
   */
  async deployToGitLab(source, message) {
    console.log('📦 Deploying to GitLab Pages...');

    const { token, project, branch = 'main' } = this.config.gitlab;

    if (this.config.dryRun) {
      console.log('   [DRY RUN] Would deploy to GitLab Pages');
      return {
        platform: 'GitLab Pages',
        success: true,
        url: `https://${project.split('/')[0]}.gitlab.io/${project.split('/')[1]}/`,
        dryRun: true
      };
    }

    try {
      // Add GitLab remote if it doesn't exist
      try {
        await execAsync(`git remote add gitlab https://oauth2:${token}@gitlab.com/${project}.git`);
      } catch (err) {
        // Remote might already exist
        if (!err.message.includes('already exists')) {
          throw err;
        }
      }

      // Push to GitLab
      await execAsync(`git push gitlab ${branch}`);

      const url = `https://${project.split('/')[0]}.gitlab.io/${project.split('/')[1]}/`;

      console.log(`   ✅ Deployed to GitLab Pages: ${url}`);

      return {
        platform: 'GitLab Pages',
        success: true,
        url,
        project,
        branch
      };
    } catch (error) {
      console.error(`   ❌ GitLab Pages deployment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deploy to GitHub Gist
   */
  async deployToGist(source, message) {
    console.log('📦 Deploying to GitHub Gist...');

    const { token, gistId } = this.config.gist;

    if (this.config.dryRun) {
      console.log('   [DRY RUN] Would deploy to GitHub Gist');
      return {
        platform: 'GitHub Gist',
        success: true,
        url: `https://gist.github.com/${gistId}`,
        dryRun: true
      };
    }

    try {
      // Read all files from source directory
      const files = await this.readDirectoryRecursive(source);

      // Create gist payload
      const gistFiles = {};
      for (const file of files) {
        const content = await fs.readFile(file.path, 'utf8');
        gistFiles[file.relativePath] = { content };
      }

      // Update gist via GitHub API
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description: message,
          files: gistFiles
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      const url = data.html_url;

      console.log(`   ✅ Deployed to GitHub Gist: ${url}`);

      return {
        platform: 'GitHub Gist',
        success: true,
        url,
        gistId,
        filesCount: Object.keys(gistFiles).length
      };
    } catch (error) {
      console.error(`   ❌ Gist deployment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deploy to Apache/Self-hosted server
   */
  async deployToApache(source, message) {
    console.log('📦 Deploying to Apache server...');

    const { host, path: remotePath, user = 'root', sshKey } = this.config.apache;

    if (this.config.dryRun) {
      console.log('   [DRY RUN] Would deploy to Apache server');
      return {
        platform: 'Apache',
        success: true,
        url: `https://${host}`,
        dryRun: true
      };
    }

    try {
      // Use rsync to copy files
      const sshKeyFlag = sshKey ? `-e "ssh -i ${sshKey}"` : '';
      const rsyncCmd = `rsync -avz --delete ${sshKeyFlag} ${source}/ ${user}@${host}:${remotePath}/`;

      await execAsync(rsyncCmd);

      const url = `https://${host}`;

      console.log(`   ✅ Deployed to Apache: ${url}`);

      return {
        platform: 'Apache',
        success: true,
        url,
        host,
        path: remotePath
      };
    } catch (error) {
      console.error(`   ❌ Apache deployment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deploy to Docker Registry (GHCR, Docker Hub)
   */
  async deployToDocker(source, message) {
    console.log('📦 Building and pushing Docker image...');

    const { registry = 'ghcr.io', image, tag = 'latest', token } = this.config.docker;

    if (this.config.dryRun) {
      console.log('   [DRY RUN] Would build and push Docker image');
      return {
        platform: 'Docker',
        success: true,
        url: `${registry}/${image}:${tag}`,
        dryRun: true
      };
    }

    try {
      const fullImage = `${registry}/${image}:${tag}`;

      // Build Docker image
      console.log('   🔨 Building Docker image...');
      await execAsync(`docker build -t ${fullImage} .`);

      // Login to registry if token provided
      if (token) {
        await execAsync(`echo ${token} | docker login ${registry} --username $(whoami) --password-stdin`);
      }

      // Push image
      console.log('   ⬆️  Pushing Docker image...');
      await execAsync(`docker push ${fullImage}`);

      console.log(`   ✅ Pushed to Docker: ${fullImage}`);

      return {
        platform: 'Docker',
        success: true,
        url: fullImage,
        registry,
        image,
        tag
      };
    } catch (error) {
      console.error(`   ❌ Docker deployment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run tests before deployment
   */
  async runTests() {
    try {
      // Run lesson system tests
      await execAsync('npm run test:lessons');
      await execAsync('npm run test:labs');
      return true;
    } catch (error) {
      console.error(`   ❌ Tests failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Read directory recursively
   */
  async readDirectoryRecursive(dir, baseDir = dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.readDirectoryRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        files.push({
          path: fullPath,
          relativePath: path.relative(baseDir, fullPath)
        });
      }
    }

    return files;
  }

  /**
   * Get platform name from index
   */
  getPlatformName(index) {
    const platforms = ['GitHub Pages', 'GitLab Pages', 'GitHub Gist', 'Apache', 'Docker'];
    return platforms[index] || 'Unknown';
  }

  /**
   * Print deployment summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEPLOYMENT SUMMARY');
    console.log('='.repeat(60) + '\n');

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);

    if (successful.length > 0) {
      console.log('✅ Successful Deployments:\n');
      successful.forEach(result => {
        console.log(`   ${result.platform}`);
        console.log(`   └─ ${result.url}\n`);
      });
    }

    if (failed.length > 0) {
      console.log('❌ Failed Deployments:\n');
      failed.forEach(result => {
        console.log(`   ${result.platform}`);
        console.log(`   └─ Error: ${result.error}\n`);
      });
    }

    console.log('='.repeat(60));
    console.log(`Total: ${this.results.length} | Success: ${successful.length} | Failed: ${failed.length}`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Rollback deployment
   */
  async rollback(platform, commitHash) {
    console.log(`\n🔙 Rolling back ${platform} to ${commitHash}...`);

    // Implementation depends on platform
    // For now, just a placeholder
    throw new Error('Rollback not yet implemented');
  }
}

module.exports = DeploymentOrchestrator;
