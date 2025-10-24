#!/usr/bin/env node

/**
 * Manage Ollama Service
 *
 * No more running `ollama serve` in a terminal!
 * This script manages Ollama as a background service.
 *
 * Usage:
 *   node manage-ollama.js start       # Start Ollama service
 *   node manage-ollama.js stop        # Stop Ollama service
 *   node manage-ollama.js restart     # Restart Ollama service
 *   node manage-ollama.js status      # Check Ollama status
 *   node manage-ollama.js models      # List models
 *   node manage-ollama.js pull llama2 # Pull a model
 *
 * NPM Scripts:
 *   npm run ollama:start    # Start Ollama
 *   npm run ollama:stop     # Stop Ollama
 *   npm run ollama:status   # Check status
 *   npm run ollama:models   # List models
 */

const OllamaServiceManager = require('./lib/ollama-service-manager');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const params = args.slice(1);

// Create manager
const manager = new OllamaServiceManager({
  port: process.env.OLLAMA_PORT || 11434,
  host: process.env.OLLAMA_HOST || 'localhost',
  verbose: true,
  autoStart: false
});

/**
 * Main entry point
 */
async function main() {
  try {
    printHeader();

    switch (command) {
      case 'start':
        await handleStart();
        break;

      case 'stop':
        await handleStop();
        break;

      case 'restart':
        await handleRestart();
        break;

      case 'status':
        await handleStatus();
        break;

      case 'models':
        await handleModels();
        break;

      case 'pull':
        await handlePull(params[0]);
        break;

      case 'delete':
        await handleDelete(params[0]);
        break;

      case 'health':
        await handleHealth();
        break;

      default:
        printHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error('\x1b[31m❌ Error:', error.message, '\x1b[0m');
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
  console.log('\x1b[36m║              🤖 OLLAMA SERVICE MANAGER 🤖                      ║\x1b[0m');
  console.log('\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('\x1b[90m  No more terminal windows! Ollama runs as a background service.\x1b[0m');
  console.log('');
}

/**
 * Handle start command
 */
async function handleStart() {
  console.log('\x1b[36m🚀 Starting Ollama service...\x1b[0m');
  console.log('');

  const result = await manager.start();

  if (result.alreadyRunning) {
    console.log('\x1b[33m⚠️  Ollama was already running\x1b[0m');
  } else {
    console.log('\x1b[32m✅ Ollama started successfully!\x1b[0m');
  }

  console.log('');
  console.log(`\x1b[90m  URL: ${result.url}\x1b[0m`);
  if (result.pid) {
    console.log(`\x1b[90m  PID: ${result.pid}\x1b[0m`);
  }
  console.log('');
}

/**
 * Handle stop command
 */
async function handleStop() {
  console.log('\x1b[36m⏹️  Stopping Ollama service...\x1b[0m');
  console.log('');

  await manager.stop();

  console.log('');
  console.log('\x1b[32m✅ Ollama stopped\x1b[0m');
  console.log('');
}

/**
 * Handle restart command
 */
async function handleRestart() {
  console.log('\x1b[36m🔄 Restarting Ollama service...\x1b[0m');
  console.log('');

  await manager.restart();

  console.log('');
  console.log('\x1b[32m✅ Ollama restarted successfully!\x1b[0m');
  console.log('');
}

/**
 * Handle status command
 */
async function handleStatus() {
  const status = await manager.getStatus();

  console.log('═'.repeat(68));
  console.log('\x1b[1m  OLLAMA STATUS\x1b[0m');
  console.log('═'.repeat(68));
  console.log('');

  if (status.running) {
    console.log('\x1b[32m  🟢 Status: RUNNING\x1b[0m');
    console.log(`\x1b[90m  URL: ${status.url}\x1b[0m`);
    console.log(`\x1b[90m  Models: ${status.modelCount} installed\x1b[0m`);

    if (status.models && status.models.length > 0) {
      console.log('');
      console.log('  Available models:');
      status.models.forEach(model => {
        console.log(`    • ${model}`);
      });
    }
  } else {
    console.log('\x1b[90m  ⚪️ Status: STOPPED\x1b[0m');
    console.log(`\x1b[90m  URL: ${status.url}\x1b[0m`);
  }

  console.log('');
}

/**
 * Handle models command
 */
async function handleModels() {
  const isRunning = await manager.isRunning();

  if (!isRunning) {
    console.log('\x1b[31m❌ Ollama is not running\x1b[0m');
    console.log('');
    console.log('\x1b[90m  Run: npm run ollama:start\x1b[0m');
    console.log('');
    process.exit(1);
  }

  console.log('📦 Loading models...');
  console.log('');

  const models = await manager.listModels();

  if (models.length === 0) {
    console.log('\x1b[33m⚠️  No models installed\x1b[0m');
    console.log('');
    console.log('\x1b[90m  Pull a model: npm run ollama:pull -- llama2\x1b[0m');
  } else {
    console.log('═'.repeat(68));
    console.log('\x1b[1m  INSTALLED MODELS\x1b[0m');
    console.log('═'.repeat(68));
    console.log('');

    models.forEach(model => {
      const size = model.size ? formatBytes(model.size) : 'unknown';
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : 'unknown';
      console.log(`  \x1b[32m✓\x1b[0m ${model.name}`);
      console.log(`    \x1b[90mSize: ${size} | Modified: ${modified}\x1b[0m`);
      console.log('');
    });
  }

  console.log('');
}

/**
 * Handle pull command
 */
async function handlePull(modelName) {
  if (!modelName) {
    console.log('\x1b[31m❌ Model name required\x1b[0m');
    console.log('');
    console.log('\x1b[90m  Usage: npm run ollama:pull -- llama2\x1b[0m');
    console.log('');
    process.exit(1);
  }

  const isRunning = await manager.isRunning();

  if (!isRunning) {
    console.log('\x1b[33m⚠️  Ollama not running, starting...\x1b[0m');
    await manager.start();
    console.log('');
  }

  await manager.pullModel(modelName);
  console.log('');
}

/**
 * Handle delete command
 */
async function handleDelete(modelName) {
  if (!modelName) {
    console.log('\x1b[31m❌ Model name required\x1b[0m');
    console.log('');
    console.log('\x1b[90m  Usage: npm run ollama:delete -- llama2\x1b[0m');
    console.log('');
    process.exit(1);
  }

  const isRunning = await manager.isRunning();

  if (!isRunning) {
    console.log('\x1b[31m❌ Ollama is not running\x1b[0m');
    console.log('');
    console.log('\x1b[90m  Run: npm run ollama:start\x1b[0m');
    console.log('');
    process.exit(1);
  }

  await manager.deleteModel(modelName);
  console.log('');
}

/**
 * Handle health command
 */
async function handleHealth() {
  console.log('🏥 Checking Ollama health...');
  console.log('');

  const health = await manager.checkHealth();

  if (health.status === 'healthy') {
    console.log('\x1b[32m✅ Ollama is healthy\x1b[0m');
    console.log(`\x1b[90m  URL: ${health.url}\x1b[0m`);
    console.log(`\x1b[90m  Models: ${health.modelCount} available\x1b[0m`);
  } else {
    console.log('\x1b[31m❌ Ollama is unhealthy\x1b[0m');
    console.log(`\x1b[90m  Error: ${health.error}\x1b[0m`);
  }

  console.log('');
}

/**
 * Print help
 */
function printHelp() {
  console.log('Usage: node manage-ollama.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start              Start Ollama service');
  console.log('  stop               Stop Ollama service');
  console.log('  restart            Restart Ollama service');
  console.log('  status             Check Ollama status');
  console.log('  health             Check Ollama health');
  console.log('  models             List installed models');
  console.log('  pull <model>       Pull/download a model');
  console.log('  delete <model>     Delete a model');
  console.log('');
  console.log('Examples:');
  console.log('  node manage-ollama.js start');
  console.log('  node manage-ollama.js status');
  console.log('  node manage-ollama.js pull llama2');
  console.log('');
  console.log('NPM Scripts:');
  console.log('  npm run ollama:start');
  console.log('  npm run ollama:stop');
  console.log('  npm run ollama:status');
  console.log('  npm run ollama:models');
  console.log('');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { manager };
