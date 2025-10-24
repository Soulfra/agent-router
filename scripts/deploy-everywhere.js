#!/usr/bin/env node

/**
 * Deploy Everywhere - One Command Deploy
 *
 * Usage:
 *   node scripts/deploy-everywhere.js
 *   node scripts/deploy-everywhere.js --github --gitlab --docker
 *   node scripts/deploy-everywhere.js --message "Deploy v2.0"
 *   node scripts/deploy-everywhere.js --dry-run
 *
 * Or use Cal to do it:
 *   node scripts/deploy-everywhere.js --cal "Deploy lessons for Rails"
 */

const CalAutonomousOrchestrator = require('../lib/cal-autonomous-lesson-orchestrator');
const DeploymentOrchestrator = require('../lib/deployment-orchestrator');

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    github: args.includes('--github'),
    gitlab: args.includes('--gitlab'),
    gist: args.includes('--gist'),
    apache: args.includes('--apache'),
    docker: args.includes('--docker'),
    all: args.includes('--all'),
    cal: args.find(a => a.startsWith('--cal'))?.split('=')[1],
    message: args.find(a => a.startsWith('--message'))?.split('=')[1] || 'Automated deployment',
    dryRun: args.includes('--dry-run')
  };

  // If no platforms specified and not using Cal, deploy to all
  if (!options.github && !options.gitlab && !options.gist && !options.apache && !options.docker && !options.cal) {
    options.all = true;
  }

  // If using Cal autonomous mode
  if (options.cal) {
    console.log('\n🤖 Cal is handling this autonomously...\n');

    const cal = new CalAutonomousOrchestrator({
      anthropicKey: process.env.ANTHROPIC_API_KEY
    });

    const repo = args.find(a => a.includes('github.com')) || 'https://github.com/rails/rails';

    const result = await cal.execute({
      command: 'create-lessons',
      repo,
      deploy: getPlatforms(options),
      message: options.message
    });

    console.log('\n✅ Cal completed autonomously!\n');
    console.log(`Generated: ${result.lessonsGenerated} lessons`);
    console.log(`Created: ${result.labsCreated} labs`);

    if (result.deployments) {
      console.log(`\nDeployments:`);
      result.deployments.forEach(d => {
        console.log(`  ${d.success ? '✅' : '❌'} ${d.platform}: ${d.url || d.error}`);
      });
    }

    return;
  }

  // Regular deployment (no Cal)
  console.log('\n🚀 Deploying lesson system...\n');

  const deployer = new DeploymentOrchestrator({
    github: options.github || options.all ? {
      token: process.env.GITHUB_TOKEN,
      repo: process.env.GITHUB_REPO || 'Soulfra/agent-router',
      branch: 'main'
    } : null,

    gitlab: options.gitlab || options.all ? {
      token: process.env.GITLAB_TOKEN,
      project: process.env.GITLAB_PROJECT || 'soulfra/agent-router',
      branch: 'main'
    } : null,

    gist: options.gist || options.all ? {
      token: process.env.GITHUB_TOKEN,
      gistId: process.env.GIST_ID
    } : null,

    apache: options.apache ? {
      host: process.env.APACHE_HOST || 'lessons.calos.com',
      path: process.env.APACHE_PATH || '/var/www/lessons',
      user: process.env.APACHE_USER || 'root',
      sshKey: process.env.SSH_KEY_PATH
    } : null,

    docker: options.docker || options.all ? {
      registry: process.env.DOCKER_REGISTRY || 'ghcr.io',
      image: process.env.DOCKER_IMAGE || 'soulfra/lessons',
      tag: process.env.DOCKER_TAG || 'latest',
      token: process.env.GITHUB_TOKEN || process.env.DOCKER_TOKEN
    } : null,

    dryRun: options.dryRun
  });

  const results = await deployer.deployAll({
    source: 'public/lessons',
    message: options.message,
    skipTests: options.dryRun // Skip tests in dry run
  });

  process.exit(results.every(r => r.success) ? 0 : 1);
}

function getPlatforms(options) {
  const platforms = [];
  if (options.github || options.all) platforms.push('github');
  if (options.gitlab || options.all) platforms.push('gitlab');
  if (options.docker || options.all) platforms.push('docker');
  return platforms;
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Deployment failed:', err.message);
    process.exit(1);
  });
}

module.exports = main;
