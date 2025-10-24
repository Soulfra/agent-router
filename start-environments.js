#!/usr/bin/env node

/**
 * Start Multiple Environments (Parallel Simulations)
 *
 * "It's all simulations" - run multiple environments in parallel:
 *
 * 🟢 Production  (port 5001) - Active/focused   - Like green macOS button
 * 🟡 Staging     (port 5002) - Warning/staged   - Like yellow macOS button
 * ⚪️ Dev         (port 5003) - Inactive/testing - Like grey macOS button
 *
 * Usage:
 *   node start-environments.js               # Start all environments
 *   node start-environments.js production    # Start production only
 *   node start-environments.js staging dev   # Start staging and dev
 *
 * Commands:
 *   npm run env:all          # Start all environments
 *   npm run env:prod         # Start production only
 *   npm run env:staging      # Start staging only
 *   npm run env:dev          # Start dev only
 *   npm run env:status       # Show status of all environments
 */

const EnvironmentManager = require('./lib/environment-manager');

// Create environment manager
const manager = new EnvironmentManager({
  verbose: true,
  colorEnabled: true
});

// Register environments (simulations)
manager
  .registerEnvironment('production', {
    displayName: 'Production',
    port: 5001,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/calos_production',
    ollamaUrl: 'http://localhost:11434',
    ollamaInstance: 'shared', // Share ollama between environments
    logLevel: 'error',
    autoRestart: true
  })
  .registerEnvironment('staging', {
    displayName: 'Staging',
    port: 5002,
    databaseUrl: process.env.STAGING_DATABASE_URL || 'postgresql://localhost/calos_staging',
    ollamaUrl: 'http://localhost:11434',
    ollamaInstance: 'shared',
    logLevel: 'warn',
    autoRestart: true
  })
  .registerEnvironment('dev', {
    displayName: 'Development',
    port: 5003,
    databaseUrl: process.env.DEV_DATABASE_URL || 'postgresql://localhost/calos_dev',
    ollamaUrl: 'http://localhost:11434',
    ollamaInstance: 'shared',
    logLevel: 'info',
    autoRestart: false // Don't auto-restart dev (you might be debugging)
  });

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const environments = args.slice(1);

/**
 * Main entry point
 */
async function main() {
  try {
    // Print header
    printHeader();

    // Handle commands
    if (command === 'status') {
      await handleStatus();
    } else if (command === 'stop') {
      await handleStop(environments);
    } else if (command === 'restart') {
      await handleRestart(environments);
    } else if (environments.length > 0) {
      await handleStart(environments);
    } else if (command && ['production', 'staging', 'dev'].includes(command)) {
      await handleStart([command]);
    } else {
      await handleStartAll();
    }

    // Keep alive and monitor
    await monitorEnvironments();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Print header
 */
function printHeader() {
  console.log('');
  console.log('\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║             🌍 PARALLEL ENVIRONMENT MANAGER 🌍                 ║\x1b[0m');
  console.log('\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('\x1b[90m  "It\'s all simulations" - run multiple environments in parallel\x1b[0m');
  console.log('');
}

/**
 * Handle start all
 */
async function handleStartAll() {
  console.log('\x1b[36m🚀  Starting ALL environments (production, staging, dev)...\x1b[0m');
  console.log('');

  await manager.startEnvironment('production');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Stagger starts

  await manager.startEnvironment('staging');
  await new Promise(resolve => setTimeout(resolve, 2000));

  await manager.startEnvironment('dev');

  console.log('');
  manager.printStatus();
  console.log('\x1b[32m✅  All environments started!\x1b[0m');
  console.log('');
  console.log('\x1b[90m  🟢 Production:  http://localhost:5001\x1b[0m');
  console.log('\x1b[90m  🟡 Staging:     http://localhost:5002\x1b[0m');
  console.log('\x1b[90m  ⚪️ Development: http://localhost:5003\x1b[0m');
  console.log('');
}

/**
 * Handle start specific environments
 */
async function handleStart(envs) {
  console.log(`\x1b[36m🚀  Starting environments: ${envs.join(', ')}\x1b[0m`);
  console.log('');

  for (const env of envs) {
    await manager.startEnvironment(env);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Stagger starts
  }

  console.log('');
  manager.printStatus();
  console.log('\x1b[32m✅  Environments started!\x1b[0m');
  console.log('');
}

/**
 * Handle status
 */
async function handleStatus() {
  manager.printStatus();
  process.exit(0);
}

/**
 * Handle stop
 */
async function handleStop(envs) {
  if (envs.length === 0) {
    await manager.stopAll();
  } else {
    for (const env of envs) {
      await manager.stopEnvironment(env);
    }
  }

  console.log('');
  manager.printStatus();
  process.exit(0);
}

/**
 * Handle restart
 */
async function handleRestart(envs) {
  if (envs.length === 0) {
    console.log('\x1b[36m🔄  Restarting all environments...\x1b[0m');
    await manager.stopAll();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await manager.startAll();
  } else {
    for (const env of envs) {
      await manager.restartEnvironment(env);
    }
  }

  console.log('');
  manager.printStatus();
}

/**
 * Monitor environments
 */
async function monitorEnvironments() {
  console.log('\x1b[90m  Press Ctrl+C to stop all environments and exit\x1b[0m');
  console.log('');

  // Health check interval
  const healthCheckInterval = setInterval(() => {
    const status = manager.getStatus();

    // Check each environment
    for (const env of status) {
      if (env.state === 'active') {
        // Could add health checks here
      }
    }
  }, 30000); // Every 30 seconds

  // Status update interval
  const statusInterval = setInterval(() => {
    console.clear();
    printHeader();
    manager.printStatus();
    console.log('\x1b[90m  Press Ctrl+C to stop all environments and exit\x1b[0m');
    console.log('');
  }, 10000); // Every 10 seconds

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    clearInterval(healthCheckInterval);
    clearInterval(statusInterval);

    console.log('');
    console.log('\x1b[33m⚠️  Received Ctrl+C - stopping all environments...\x1b[0m');
    console.log('');

    await manager.stopAll();

    console.log('');
    console.log('\x1b[32m✅  All environments stopped. Goodbye!\x1b[0m');
    console.log('');
    process.exit(0);
  });

  // Handle other signals
  process.on('SIGTERM', async () => {
    await manager.stopAll();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {}); // Never resolves - keep alive forever
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { manager };
